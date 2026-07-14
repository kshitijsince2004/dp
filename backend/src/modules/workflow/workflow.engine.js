import db from '../../config/db.js';

/**
 * THE workflow engine — the single reader of `workflow_transitions_config`
 * (synced from config/workflow/*.json). There is no in-code fallback: if a
 * transition isn't in config, it does not exist. Adding a state or a whole
 * review step (e.g. ACP) is config rows, never code.
 */

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

  // Safety invariant, not a business rule: transfer_initiate's from_status='*'
  // wildcard would otherwise match a record that's already IN_TRANSFER,
  // letting a second initiate corrupt the @PRIOR restore chain. This can't be
  // expressed as a config row without a real transfers module (record_transfers-
  // backed, tracked separately — see docs/new-db-integration §Deferrals), so
  // it's a code-level guard until that ships.
  if (fromStatus === 'IN_TRANSFER' && normalizedAction === 'transfer_initiate') {
    throw new Error('Record is already IN_TRANSFER — cannot initiate a second transfer');
  }

  const row = await (dbc ?? db)('workflow_transitions_config')
    .where({ is_active: true, action: normalizedAction })
    .whereIn('from_status', [fromStatus, '*'])
    .whereIn('record_type', [recordType, '*'])
    .orderByRaw('(from_status = ?) DESC, (record_type = ?) DESC', [fromStatus, recordType])
    .first();

  if (!row) {
    throw new Error(`Invalid action "${action}" for status "${fromStatus}"`);
  }
  return { ...row, allowed_roles: parseRoles(row.allowed_roles) };
}

export function assertAllowed(rule, user) {
  if (rule.allowed_roles.length && !rule.allowed_roles.includes(user.role)) {
    throw new Error(`Insufficient permissions: role ${user.role} is not allowed to perform action ${rule.action}`);
  }
}

export function assertComment(rule, comment) {
  if (rule.requires_comment && (!comment || comment.trim().length === 0)) {
    throw new Error('Comment is required for this action');
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
  if (rule.to_status === '@PRIOR') {
    const entered = await trx('workflow_transitions')
      .where({ record_id: record.id, to_status: 'IN_TRANSFER' })
      .orderBy('performed_at', 'desc')
      .first();
    if (!entered) {
      throw new Error('Cannot resolve @PRIOR: no IN_TRANSFER transition found for this record');
    }
    return { toStatus: entered.from_status, toLevel: entered.from_level };
  }

  let toStatus = rule.to_status;
  let toLevel = rule.to_level ?? record.current_level;

  if (rule.from_status === 'DISTRICT_REVIEW' && rule.action === 'approve') {
    const contract = await trx('level_data_contracts')
      .where({ from_level: 'DISTRICT', to_level: 'HQ', is_active: true })
      .first();
    if (contract && contract.route === 'DIRECT_HQ') {
      toStatus = 'HQ_RECEIVED';
      toLevel = 'HQ';
    }
  }

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
  const rows = await db('workflow_transitions_config')
    .distinct('from_status')
    .where({ is_active: true })
    .whereNot('from_status', '*')
    .whereNotNull('from_level')
    .whereRaw('allowed_roles @> ?::jsonb', [JSON.stringify([user.role])]);
  return rows.map((r) => r.from_status);
}
