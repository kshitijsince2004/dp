import db from '../../config/db.js';
import { runChainVerification } from './audit.service.js';
import { setRecordFrozen } from '../records/records.service.js';
import { verifyRecordAccess } from '../../middleware/rbac.middleware.js';
import { getLogger } from '../../utils/logger.js';

const log = getLogger('audit.controller');

const FIELD_LABELS = {
  fir_no: 'FIR Number',
  fir_date: 'FIR Date',
  case_status: 'Case Status',
  current_status: 'Workflow Status',
  current_level: 'Workflow Level',
  brief_facts: 'Brief Facts / Gist',
  local_head_id: 'Crime Head',
  local_head: 'Crime Head',
  is_worked_out: 'Worked Out Status',
  worked_out_date: 'Worked Out Date',
  io_id: 'Investigating Officer ID',
  io_name: 'Investigating Officer Name',
  complainant_first_name: 'Complainant First Name',
  complainant_last_name: 'Complainant Last Name',
  complainant_mobile: 'Complainant Mobile',
  complainant_gender: 'Complainant Gender',
  complainant_age: 'Complainant Age',
  complainant_birth_year: 'Complainant Birth Year',
  complainant_education: 'Complainant Education',
  complainant_social_category: 'Complainant Social Category',
  complainant_financial_status: 'Complainant Financial Status',
  victim_first_name: 'Victim First Name',
  victim_last_name: 'Victim Last Name',
  victim_gender: 'Victim Gender',
  victim_age: 'Victim Age',
  victim_social_category: 'Victim Social Category',
  accused_first_name: 'Accused First Name',
  accused_last_name: 'Accused Last Name',
  accused_age: 'Accused Age',
  arrested_first_name: 'Arrested Person First Name',
  arrested_last_name: 'Arrested Person Last Name',
  arrest_date: 'Arrest Date',
  date_of_arrest: 'Arrest Date',
  arrest_place: 'Arrest Place',
  place_of_arrest: 'Arrest Place',
  custody_status: 'Custody Status',
  missing_name: 'Missing Person Name',
  missing_status: 'Missing Status',
  missing_date: 'Missing Date',
  uidb_no: 'UIDB Number',
  uidb_status: 'UIDB Status',
  deceased_name: 'Deceased Name',
  cause_of_death: 'Cause of Death',
  act_name: 'Act Name',
  sections: 'IPC/BNS Sections',
  call_gist: 'PCR Call Gist',
  call_head: 'PCR Call Head',
  caller_name: 'Caller Name',
  caller_mobile: 'Caller Mobile',
  transferred_to_ps_id: 'Transferred to PS',
  transferred_to_agency_id: 'Transferred to Agency',
  sent_to_court_date: 'Sent to Court Date',
  court_case_no: 'Court Case Number',
  court_name: 'Court Name',
  court_disposal_type: 'Court Disposal Status',
  court_disposal_date: 'Court Disposal Date',
};

const formatChanges = (rawChanges) => {
  const parsed = parseJsonField(rawChanges);
  if (!Array.isArray(parsed)) return [];
  return parsed.map((item) => {
    const key = item.field_key || item.field || item.field_name;
    const label = FIELD_LABELS[key] || item.label || key;
    return {
      field_key: key,
      field: key,
      label,
      old_value: item.old_value !== undefined ? item.old_value : item.old,
      new_value: item.new_value !== undefined ? item.new_value : item.new,
      entity_label: item.entity_label || null,
    };
  });
};

export const getRecordAudit = async (req, res) => {
  const { recordId } = req.params;
  log.debug('getRecordAudit: enter', { recordId, userId: req.user?.id });

  try {
    // Single-record op: verify geographical scope access before querying (P5.2)
    await verifyRecordAccess(recordId, req.user);
    log.debug('getRecordAudit: verifyRecordAccess passed', { recordId, userId: req.user?.id });

    const revisions = await db('record_revisions')
      .select(
        'record_revisions.*',
        'u.username',
        'u.badge_no',
        'u.name as user_name',
        'u.role as user_role'
      )
      .leftJoin('users as u', 'record_revisions.changed_by', 'u.id')
      .where('record_revisions.record_id', recordId)
      .orderBy('record_revisions.revision_number', 'asc');

    const formatted = revisions.map((r) => ({
      ...r,
      user_fullname: r.user_name || r.username,
      changed_by_name: r.user_name || r.username,
      changed_by_badge: r.badge_no || null,
      changed_by_role: r.user_role || r.level,
      field_changes: formatChanges(r.field_changes),
    }));

    log.info('getRecordAudit: 200', { recordId, revisionCount: formatted.length });
    return res.status(200).json({
      status: 'success',
      success: true,
      data: formatted,
    });
  } catch (error) {
    const status = error.message.includes('Access denied') ? 403 : 500;
    log.error('getRecordAudit: failed', { recordId, status, err: error });
    return res.status(status).json({
      status: 'error',
      success: false,
      message: error.message,
    });
  }
};

export const getUserAudit = async (req, res) => {
  const { userId } = req.params;
  const { from, to } = req.query;
  const page = parseInt(req.query.page || 1, 10);
  const limit = parseInt(req.query.limit || 20, 10);
  const offset = (page - 1) * limit;
  log.debug('getUserAudit: enter', { targetUserId: userId, callerRole: req.user?.role, from, to, page, limit });

  try {
    if (req.user.role === 'DISTRICT_OFFICER') {
      const targetUser = await db('users').where({ id: userId }).first();
      if (!targetUser) {
        log.warn('getUserAudit: rejected — target user not found', { targetUserId: userId });
        return res.status(404).json({ status: 'error', success: false, message: 'User not found' });
      }
      if (targetUser.district_id !== req.user.district_id) {
        log.warn('getUserAudit: rejected — target user outside caller district', {
          targetUserId: userId, targetDistrictId: targetUser.district_id, callerDistrictId: req.user.district_id,
        });
        return res.status(403).json({
          status: 'error',
          success: false,
          message: 'Access denied: user falls outside your district jurisdiction',
        });
      }
      log.debug('getUserAudit: district scope check passed', { targetUserId: userId });
    }

    let query = db('record_revisions')
      .select('record_revisions.*', 'r.record_type', 'r.current_status', 'u.name as user_name', 'u.badge_no', 'u.role as user_role')
      .leftJoin('records as r', 'record_revisions.record_id', 'r.id')
      .leftJoin('users as u', 'record_revisions.changed_by', 'u.id')
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

    const formatted = list.map((r) => ({
      ...r,
      user_fullname: r.user_name || r.changed_by,
      changed_by_name: r.user_name || r.changed_by,
      changed_by_badge: r.badge_no || null,
      changed_by_role: r.user_role || r.level,
      field_changes: formatChanges(r.field_changes),
    }));

    log.info('getUserAudit: 200', { targetUserId: userId, resultCount: formatted.length, total });
    return res.status(200).json({
      status: 'success',
      success: true,
      data: formatted,
      meta: { page, limit, total },
    });
  } catch (error) {
    log.error('getUserAudit: failed', { targetUserId: userId, err: error });
    return res.status(500).json({
      status: 'error',
      success: false,
      message: error.message,
    });
  }
};

export const getAuditLogs = async (req, res) => {
  log.debug('getAuditLogs: enter', { userId: req.user?.id });
  try {
    const page = parseInt(req.query.page || 1, 10);
    const limit = parseInt(req.query.limit || 50, 10);
    const offset = (page - 1) * limit;
    const { action, search, from, to } = req.query;

    let query = db('record_revisions as rr')
      .select(
        'rr.id',
        'rr.record_id',
        'rr.revision_number',
        'rr.change_type as action',
        'rr.field_changes',
        'rr.changed_at',
        'rr.comment',
        'rr.reason',
        'rr.ip_address',
        'r.record_type',
        'r.current_status',
        'u.name as operator_name',
        'u.badge_no',
        'u.role as operator_role',
        'u.username'
      )
      .join('records as r', 'rr.record_id', 'r.id')
      .join('users as u', 'rr.changed_by', 'u.id');

    let countQuery = db('record_revisions as rr')
      .join('records as r', 'rr.record_id', 'r.id')
      .join('users as u', 'rr.changed_by', 'u.id');

    if (action && action !== 'ALL') {
      query = query.where('rr.change_type', action);
      countQuery = countQuery.where('rr.change_type', action);
    }

    if (search) {
      const term = `%${search}%`;
      query = query.where((b) => {
        b.where('u.name', 'ILIKE', term)
          .orWhere('u.badge_no', 'ILIKE', term)
          .orWhere('u.username', 'ILIKE', term)
          .orWhere('r.record_type', 'ILIKE', term);
      });
      countQuery = countQuery.where((b) => {
        b.where('u.name', 'ILIKE', term)
          .orWhere('u.badge_no', 'ILIKE', term)
          .orWhere('u.username', 'ILIKE', term)
          .orWhere('r.record_type', 'ILIKE', term);
      });
    }

    if (from) {
      query = query.where('rr.changed_at', '>=', from);
      countQuery = countQuery.where('rr.changed_at', '>=', from);
    }
    if (to) {
      query = query.where('rr.changed_at', '<=', to);
      countQuery = countQuery.where('rr.changed_at', '<=', to);
    }

    const totalRes = await countQuery.count('* as count').first();
    const total = parseInt(totalRes.count || 0, 10);

    const list = await query.orderBy('rr.changed_at', 'desc').limit(limit).offset(offset);

    const formatted = list.map((r) => ({
      id: r.id,
      record_id: r.record_id,
      revision_number: r.revision_number,
      action: r.action,
      table_name: r.record_type,
      changed_by_name: r.operator_name || r.username,
      operator_name: r.operator_name || r.username,
      badge_no: r.badge_no || '—',
      changed_by_role: r.operator_role,
      role: r.operator_role,
      changed_at: r.changed_at,
      ip_address: r.ip_address || '::1',
      comment: r.comment || r.reason || null,
      field_changes: formatChanges(r.field_changes),
    }));

    log.info('getAuditLogs: 200', { resultCount: formatted.length, total });
    return res.status(200).json({
      status: 'success',
      success: true,
      data: formatted,
      meta: { page, limit, total },
    });
  } catch (error) {
    log.error('getAuditLogs: failed', { err: error });
    return res.status(500).json({
      status: 'error',
      success: false,
      message: error.message,
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
    log.debug('verifyAuditChainEndpoint: enter', { method: req.method, enforce, actor: actorFromReq(req) });
    const result = await runChainVerification({ freezeOnBreak: enforce, actor: actorFromReq(req) });

    log.info('verifyAuditChainEndpoint: 200', {
      valid: result.valid, breakCount: result.breaks.length, frozenCount: result.frozen.length,
      freezeSkipped: result.freezeSkipped ?? false, enforced: enforce,
    });
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
    log.error('verifyAuditChainEndpoint: failed', { err: error });
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
  log.debug('freezeRecordEndpoint: enter', { recordId, actor: actorFromReq(req), reasonLen: (reason || '').length });
  try {
    const result = await setRecordFrozen(recordId, true, { user: actorFromReq(req), reason });
    log.info('freezeRecordEndpoint: 200', { recordId, changed: result.changed });
    return res.status(200).json({ status: 'success', success: true, data: result });
  } catch (error) {
    log.error('freezeRecordEndpoint: failed', { recordId, err: error });
    return res.status(error.status || 500).json({ status: 'error', success: false, message: error.message });
  }
};

export const unfreezeRecordEndpoint = async (req, res) => {
  const { recordId } = req.params;
  const { reason } = req.body || {};
  log.debug('unfreezeRecordEndpoint: enter', { recordId, actor: actorFromReq(req), reasonLen: (reason || '').length });
  if (!reason || reason.trim().length < 10) {
    log.warn('unfreezeRecordEndpoint: rejected — reason too short', { recordId, reasonLen: (reason || '').length });
    return res.status(422).json({ status: 'error', success: false, message: 'An unfreeze reason of at least 10 characters is required.' });
  }
  try {
    const result = await setRecordFrozen(recordId, false, { user: actorFromReq(req), reason });
    log.info('unfreezeRecordEndpoint: 200', { recordId, changed: result.changed });
    return res.status(200).json({ status: 'success', success: true, data: result });
  } catch (error) {
    log.error('unfreezeRecordEndpoint: failed', { recordId, err: error });
    return res.status(error.status || 500).json({ status: 'error', success: false, message: error.message });
  }
};

export const getAdminAuditLogs = async (req, res) => {
  const { user_id, action, module, from, to } = req.query;
  const page = parseInt(req.query.page || 1, 10);
  const limit = parseInt(req.query.limit || 20, 10);
  const offset = (page - 1) * limit;
  log.debug('getAdminAuditLogs: enter', { user_id, action, module, from, to, page, limit });

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

    log.info('getAdminAuditLogs: 200', { resultCount: list.length, total });
    return res.status(200).json({
      status: 'success',
      success: true,
      data: list,
      meta: { page, limit, total }
    });
  } catch (error) {
    log.error('getAdminAuditLogs: failed', { err: error });
    return res.status(500).json({
      status: 'error',
      success: false,
      message: error.message
    });
  }
};

