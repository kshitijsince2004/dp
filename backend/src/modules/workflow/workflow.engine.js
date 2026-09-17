import db from '../../config/db.js';
import { getLogger } from '../../utils/logger.js';

/**
 * THE workflow engine — the single reader of `workflow_transitions_config`
 * (synced from config/workflow/*.json). There is no in-code fallback: if a
 * transition isn't in config, it does not exist. Adding a state or a whole
 * review step (e.g. ACP) is config rows, never code.
 */
const log = getLogger('workflow.engine');

const parseRoles = (value) => {
  if (Array.isArray(value)) return value;
  if (typeof value === 'string') {
    try { return JSON.parse(value); } catch { return value.split(','); }
  }
  return [];
};

/**
 * Look up the transition rule for (fromStatus, action, recordType).
 * Wildcards: from_status='*' (e.g. transfer.initiate) and record_type='*'
 * both match, but a specific row always beats a wildcard row.
 * Throws when no active rule exists.
 */
export async function getRule(dbc, { fromStatus, action, recordType }) {
  const normalizedAction = String(action).toLowerCase();
  log.debug('getRule: enter', { fromStatus, action: normalizedAction, recordType });

  // Safety invariant, not a business rule: transfer_initiate's from_status='*'
  // wildcard would otherwise match a record that's already IN_TRANSFER,
  // letting a second initiate corrupt the @PRIOR restore chain. This can't be
  // expressed as a config row without a real transfers module (record_transfers-
  // backed, tracked separately — see docs/new-db-integration §Deferrals), so
  // it's a code-level guard until that ships.
  if (fromStatus === 'IN_TRANSFER' && normalizedAction === 'transfer_initiate') {
    log.warn('getRule: rejected — record already IN_TRANSFER, second initiate blocked', { fromStatus, recordType });
    throw new Error('Record is already IN_TRANSFER — cannot initiate a second transfer');
  }

  const row = await (dbc ?? db)('workflow_transitions_config')
    .where({ is_active: true, action: normalizedAction })
    .whereIn('from_status', [fromStatus, '*'])
    .whereIn('record_type', [recordType, '*'])
    .orderByRaw('(from_status = ?) DESC, (record_type = ?) DESC', [fromStatus, recordType])
    .first();

  if (!row) {
    log.warn('getRule: rejected — no active transition config row', { fromStatus, action: normalizedAction, recordType });
    throw new Error(`Invalid action "${action}" for status "${fromStatus}"`);
  }
  const rule = { ...row, allowed_roles: parseRoles(row.allowed_roles) };
  log.debug('getRule: resolved rule', {
    fromStatus, action: normalizedAction, recordType,
    toStatus: rule.to_status, toLevel: rule.to_level, allowedRoles: rule.allowed_roles,
    requiresComment: !!rule.requires_comment, wasWildcardStatus: row.from_status === '*', wasWildcardType: row.record_type === '*',
  });
  return rule;
}

export function assertAllowed(rule, user) {
  if (rule.allowed_roles.length && !rule.allowed_roles.includes(user.role)) {
    log.warn('assertAllowed: rejected — role not permitted', { action: rule.action, userRole: user.role, allowedRoles: rule.allowed_roles, userId: user.id });
    throw new Error(`Insufficient permissions: role ${user.role} is not allowed to perform action ${rule.action}`);
  }
  log.debug('assertAllowed: permitted', { action: rule.action, userRole: user.role, userId: user.id });
}

export function assertComment(rule, comment) {
  if (rule.requires_comment && (!comment || comment.trim().length === 0)) {
    log.warn('assertComment: rejected — comment required but missing/blank', { action: rule.action });
    throw new Error('Comment is required for this action');
  }
  log.debug('assertComment: passed', { action: rule.action, requiresComment: !!rule.requires_comment, hasComment: !!comment });
}

/**
 * When a transition's config row has requires_field_correction = true, block it unless
 * every field_key the last SEND_BACK flagged (workflow_transitions.target_fields) shows
 * up in at least one record_revisions.field_changes entry written since that send-back.
 * No target_fields on the last send-back (reviewer gave only a comment, no specific
 * fields) => nothing to enforce, allow it through.
 */
export async function assertFieldsCorrected(trx, rule, record) {
  if (!rule.requires_field_correction) return;

  const lastSendBack = await trx('workflow_transitions')
    .where({ record_id: record.id, action: 'SEND_BACK' })
    .orderBy('performed_at', 'desc')
    .first();
  if (!lastSendBack) return;

  const targetFields = typeof lastSendBack.target_fields === 'string'
    ? JSON.parse(lastSendBack.target_fields) : (lastSendBack.target_fields || []);
  if (!targetFields.length) return;

  const revisions = await trx('record_revisions')
    .where({ record_id: record.id })
    .andWhere('changed_at', '>', lastSendBack.performed_at)
    .select('field_changes');

  const changedKeys = new Set();
  for (const rev of revisions) {
    const changes = typeof rev.field_changes === 'string' ? JSON.parse(rev.field_changes) : (rev.field_changes || []);
    for (const c of changes) changedKeys.add(c.field_key);
  }

  const missing = targetFields.filter((f) => !changedKeys.has(f));
  if (missing.length > 0) {
    log.warn('assertFieldsCorrected: rejected — flagged fields not corrected', { recordId: record.id, missing });
    throw new Error(`Cannot resend to SHO — please correct the following field(s) flagged for correction: ${missing.join(', ')}`);
  }
}

/**
 * Resolve the concrete target (status, level) for a rule against a record.
 * - to_status '@PRIOR' (transfer accept/reject) restores BOTH the status and
 *   the level captured by the ledger row that entered IN_TRANSFER.
 * - A NULL to_level means "stay at the record's current level".
 * - The level_data_contracts DIRECT_HQ route can short-circuit
 *   DISTRICT_REVIEW→approve straight to HQ (routing config, not code).
 */
export async function resolveTarget(trx, rule, record) {
  log.debug('resolveTarget: enter', { recordId: record.id, action: rule.action, ruleToStatus: rule.to_status, ruleToLevel: rule.to_level });
  if (rule.to_status === '@PRIOR') {
    const entered = await trx('workflow_transitions')
      .where({ record_id: record.id, to_status: 'IN_TRANSFER' })
      .orderBy('performed_at', 'desc')
      .first();
    if (!entered) {
      log.warn('resolveTarget: rejected — @PRIOR with no IN_TRANSFER transition on record', { recordId: record.id });
      throw new Error('Cannot resolve @PRIOR: no IN_TRANSFER transition found for this record');
    }
    log.debug('resolveTarget: resolved @PRIOR restore target', { recordId: record.id, toStatus: entered.from_status, toLevel: entered.from_level });
    return { toStatus: entered.from_status, toLevel: entered.from_level };
  }

  let toStatus = rule.to_status;
  let toLevel = rule.to_level ?? record.current_level;

  if (rule.from_status === 'DISTRICT_REVIEW' && rule.action === 'approve') {
    const contract = await trx('level_data_contracts')
      .where({ from_level: 'DISTRICT', to_level: 'HQ', is_active: true })
      .first();
    if (contract && contract.route === 'DIRECT_HQ') {
      log.debug('resolveTarget: DIRECT_HQ level_data_contracts route matched — short-circuiting to HQ_RECEIVED', { recordId: record.id });
      toStatus = 'HQ_RECEIVED';
      toLevel = 'HQ';
    } else {
      log.debug('resolveTarget: no DIRECT_HQ route active — normal DISTRICT_REVIEW approve target stands', { recordId: record.id, toStatus, toLevel });
    }
  }

  log.debug('resolveTarget: exit', { recordId: record.id, action: rule.action, toStatus, toLevel });
  return { toStatus, toLevel };
}

/**
 * Queue derivation: the statuses a role acts on = the from_status values of
 * its active transitions. `from_status <> '*'` keeps always-available actions
 * (transfer.initiate) out of queues; `from_level IS NOT NULL` keeps the
 * LEGACY/AMENDMENT family out of daily queues. A role with no transitions
 * (ACP until its config rows land, HQ_ANALYST by design) gets an empty queue.
 */
export async function getQueueStatuses(user) {
  log.debug('getQueueStatuses: enter', { userId: user.id, role: user.role });
  const rows = await db('workflow_transitions_config')
    .distinct('from_status')
    .where({ is_active: true })
    .whereNot('from_status', '*')
    .whereNotNull('from_level')
    .whereRaw('allowed_roles @> ?::jsonb', [JSON.stringify([user.role])]);
  const statuses = rows.map((r) => r.from_status);
  log.debug('getQueueStatuses: exit', { userId: user.id, role: user.role, statuses });
  return statuses;
}
