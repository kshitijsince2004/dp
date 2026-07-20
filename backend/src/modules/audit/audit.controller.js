import db from '../../config/db.js';
import { runChainVerification } from './audit.service.js';
import { setRecordFrozen } from '../records/records.service.js';
import { verifyRecordAccess } from '../../middleware/rbac.middleware.js';

const parseJsonField = (val) => {
  if (val === null || val === undefined) return null;
  if (typeof val === 'string') {
    try { return JSON.parse(val); } catch (e) { return val; }
  }
  return val;
};

export const getRecordAudit = async (req, res) => {
  const { recordId } = req.params;

  try {
    // Single-record op: verify geographical scope access before querying (P5.2)
    await verifyRecordAccess(recordId, req.user);

    const revisions = await db('record_revisions')
      .select('record_revisions.*', 'u.username', 'u.badge_no', 'u.name')
      .leftJoin('users as u', 'record_revisions.changed_by', 'u.id')
      .where('record_revisions.record_id', recordId)
      .orderBy('record_revisions.revision_number', 'asc');

    const formatted = revisions.map(r => ({
      ...r,
      field_changes: parseJsonField(r.field_changes)
    }));

    return res.status(200).json({
      status: 'success',
      success: true,
      data: formatted
    });
  } catch (error) {
    // Mirror records.controller.js's access-denial mapping exactly.
    const status = error.message.includes('Access denied') ? 403 : 500;
    return res.status(status).json({
      status: 'error',
      success: false,
      message: error.message
    });
  }
};

export const getUserAudit = async (req, res) => {
  const { userId } = req.params;
  const { from, to } = req.query;
  const page = parseInt(req.query.page || 1, 10);
  const limit = parseInt(req.query.limit || 20, 10);
  const offset = (page - 1) * limit;

  try {
    // DISTRICT_OFFICER may only read the audit trail of users inside their own
    // district — look up the target user first; deny if the districts differ.
    // HQ_ANALYST/HQ_ADMIN/SYSTEM_ADMIN (already the only other roles `allow()`
    // permits on this route) stay global.
    if (req.user.role === 'DISTRICT_OFFICER') {
      const targetUser = await db('users').where({ id: userId }).first();
      if (!targetUser) {
        return res.status(404).json({ status: 'error', success: false, message: 'User not found' });
      }
      if (targetUser.district_id !== req.user.district_id) {
        return res.status(403).json({
          status: 'error',
          success: false,
          message: 'Access denied: user falls outside your district jurisdiction'
        });
      }
    }

    let query = db('record_revisions')
      .select('record_revisions.*', 'r.record_type', 'r.current_status')
      .leftJoin('records as r', 'record_revisions.record_id', 'r.id')
      .where('record_revisions.changed_by', userId);

    let countQuery = db('record_revisions').where('changed_by', userId);

    if (from) {
      query = query.where('record_revisions.changed_at', '>=', from);
      countQuery = countQuery.where('changed_at', '>=', from);
    }
    if (to) {
      query = query.where('record_revisions.changed_at', '<=', to);
      countQuery = countQuery.where('changed_at', '<=', to);
    }

    const totalRes = await countQuery.count('* as count').first();
    const total = parseInt(totalRes.count || 0, 10);

    const list = await query
      .orderBy('record_revisions.changed_at', 'desc')
      .limit(limit)
      .offset(offset);

    const formatted = list.map(r => ({
      ...r,
      field_changes: parseJsonField(r.field_changes)
    }));

    return res.status(200).json({
      status: 'success',
      success: true,
      data: formatted,
      meta: { page, limit, total }
    });
  } catch (error) {
    return res.status(500).json({
      status: 'error',
      success: false,
      message: error.message
    });
  }
};

export const getAuditLogs = async (req, res) => {
  try {
    const list = await db('audit_logs')
      .select('audit_logs.*', 'u.username as operator_name', 'u.badge_no')
      .leftJoin('users as u', 'audit_logs.changed_by_id', 'u.id')
      .orderBy('audit_logs.changed_at', 'desc')
      .limit(200);

    return res.status(200).json({
      status: 'success',
      success: true,
      data: list
    });
  } catch (error) {
    return res.status(500).json({
      status: 'error',
      success: false,
      message: error.message
    });
  }
};

const actorFromReq = (req) => (req.user ? { id: req.user.userId || req.user.id, role: req.user.role } : null);

/**
 * GET  /audit/chain-verify        → read-only verification report (never mutates).
 * POST /audit/chain-verify        → verification + enforcement: broken records are frozen and an
 *                                   alert is published. `?freeze=false` runs the same pass without
 *                                   freezing (a manual dry-run over the mutating verb).
 * Both return the full break list so a monitor can see every affected record, not just the first.
 */
export const verifyAuditChainEndpoint = async (req, res) => {
  try {
    const enforce = req.method === 'POST' && req.query.freeze !== 'false';
    const result = await runChainVerification({ freezeOnBreak: enforce, actor: actorFromReq(req) });

    return res.status(200).json({
      status: 'success',
      success: true,
      data: {
        valid: result.valid,
        checked_records: result.checked_records,
        checked_revisions: result.checked_revisions,
        breaks: result.breaks,
        unverifiable: result.unverifiable ?? [],
        unverifiable_count: (result.unverifiable ?? []).length,
        frozen: result.frozen,
        freezeSkipped: result.freezeSkipped ?? false,
        freezeSkippedReason: result.freezeSkippedReason ?? null,
        enforced: enforce,
      },
    });
  } catch (error) {
    return res.status(500).json({
      status: 'error',
      success: false,
      message: error.message
    });
  }
};

/**
 * POST /audit/records/:recordId/freeze — manually freeze a record pending audit review.
 * POST /audit/records/:recordId/unfreeze — lift a freeze after a privileged review; a reason is
 * mandatory so every unfreeze is accountable in `audit_logs`.
 */
export const freezeRecordEndpoint = async (req, res) => {
  const { recordId } = req.params;
  const { reason } = req.body || {};
  try {
    const result = await setRecordFrozen(recordId, true, { user: actorFromReq(req), reason });
    return res.status(200).json({ status: 'success', success: true, data: result });
  } catch (error) {
    return res.status(error.status || 500).json({ status: 'error', success: false, message: error.message });
  }
};

export const unfreezeRecordEndpoint = async (req, res) => {
  const { recordId } = req.params;
  const { reason } = req.body || {};
  if (!reason || reason.trim().length < 10) {
    return res.status(422).json({ status: 'error', success: false, message: 'An unfreeze reason of at least 10 characters is required.' });
  }
  try {
    const result = await setRecordFrozen(recordId, false, { user: actorFromReq(req), reason });
    return res.status(200).json({ status: 'success', success: true, data: result });
  } catch (error) {
    return res.status(error.status || 500).json({ status: 'error', success: false, message: error.message });
  }
};

export const getAdminAuditLogs = async (req, res) => {
  const { user_id, action, module, from, to } = req.query;
  const page = parseInt(req.query.page || 1, 10);
  const limit = parseInt(req.query.limit || 20, 10);
  const offset = (page - 1) * limit;

  try {
    let query = db('audit_logs')
      .select('audit_logs.*', 'u.username as operator_name', 'u.badge_no')
      .leftJoin('users as u', 'audit_logs.changed_by_id', 'u.id');

    let countQuery = db('audit_logs');

    if (user_id) {
      query = query.where('audit_logs.changed_by_id', user_id);
      countQuery = countQuery.where('changed_by_id', user_id);
    }
    if (action) {
      query = query.where('audit_logs.action', action.toUpperCase());
      countQuery = countQuery.where('action', action.toUpperCase());
    }
    if (module) {
      query = query.where('audit_logs.table_name', module);
      countQuery = countQuery.where('table_name', module);
    }
    if (from) {
      query = query.where('audit_logs.changed_at', '>=', from);
      countQuery = countQuery.where('changed_at', '>=', from);
    }
    if (to) {
      query = query.where('audit_logs.changed_at', '<=', to);
      countQuery = countQuery.where('changed_at', '<=', to);
    }

    const totalRes = await countQuery.count('* as count').first();
    const total = parseInt(totalRes.count || 0, 10);

    const list = await query
      .orderBy('audit_logs.changed_at', 'desc')
      .limit(limit)
      .offset(offset);

    return res.status(200).json({
      status: 'success',
      success: true,
      data: list,
      meta: { page, limit, total }
    });
  } catch (error) {
    return res.status(500).json({
      status: 'error',
      success: false,
      message: error.message
    });
  }
};

