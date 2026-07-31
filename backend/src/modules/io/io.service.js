import db from '../../config/db.js';
import { getLogger } from '../../utils/logger.js';

// Matches modules/records/records.service.js style (logging-instrumentation-2026-07-22
// HANDOFF.md §7).
const log = getLogger('io.service');

// investigating_officers is its own entity, generalized across all 5 record
// types (DB_SCHEMA.md §1.3). Today this module curates the roster; a form
// dropdown that scopes to the officer's PS is a later phase (records write
// path). SHO curates their own PS; ACP curates every PS under their
// sub-division and must name the target PS explicitly.
//
// Scoping is derived ONLY from req.jurisdictionQuery (the single source
// rbac.middleware's enforceScope already computed — baseline P5) — this
// module never branches on user.role itself, so it can never drift from the
// scoping rules every other endpoint in the app already obeys.

const SELECT_COLUMNS = ['io.id', 'io.user_id', 'io.name', 'io.rank', 'io.pis_no', 'io.mobile', 'io.ps_id', 'io.is_active', 'io.created_at', 'io.updated_at'];

const baseQuery = () => db('investigating_officers as io')
  .leftJoin('hierarchy_nodes as ps', 'io.ps_id', 'ps.id')
  .select(...SELECT_COLUMNS, 'ps.name as ps_name', 'ps.code as ps_code');

/**
 * Expand req.jurisdictionQuery into the PS ids it covers.
 * Returns null for global scope (empty jurisdictionQuery — HQ roles).
 */
async function psIdsInScope(jurisdictionQuery) {
  if (jurisdictionQuery.ps_id) {
    log.debug('psIdsInScope: scoped by ps_id', { psId: jurisdictionQuery.ps_id });
    return [jurisdictionQuery.ps_id];
  }
  if (jurisdictionQuery.sub_div_id) {
    const rows = await db('hierarchy_nodes')
      .where({ parent_id: jurisdictionQuery.sub_div_id, node_type: 'PS' })
      .select('id');
    log.debug('psIdsInScope: scoped by sub_div_id', { subDivId: jurisdictionQuery.sub_div_id, psCount: rows.length });
    return rows.map((r) => r.id);
  }
  if (jurisdictionQuery.district_id) {
    const subDivs = await db('hierarchy_nodes')
      .where({ parent_id: jurisdictionQuery.district_id, node_type: 'SUB_DIV' })
      .select('id');
    if (!subDivs.length) {
      log.debug('psIdsInScope: scoped by district_id, no sub-divisions found', { districtId: jurisdictionQuery.district_id });
      return [];
    }
    const rows = await db('hierarchy_nodes')
      .whereIn('parent_id', subDivs.map((s) => s.id))
      .where({ node_type: 'PS' })
      .select('id');
    log.debug('psIdsInScope: scoped by district_id', { districtId: jurisdictionQuery.district_id, subDivCount: subDivs.length, psCount: rows.length });
    return rows.map((r) => r.id);
  }
  log.debug('psIdsInScope: global scope (no jurisdiction filter)');
  return null; // {} — global (HQ_ANALYST / HQ_ADMIN / SYSTEM_ADMIN)
}

async function assertPsInScope(jurisdictionQuery, psId) {
  const scope = await psIdsInScope(jurisdictionQuery);
  if (scope !== null && !scope.includes(psId)) {
    log.warn('assertPsInScope: rejected — ps_id outside jurisdiction', { psId, jurisdictionQuery });
    throw new Error('Access denied: that Police Station is outside your jurisdiction');
  }
  log.debug('assertPsInScope: allowed', { psId });
}

export async function listIOs(jurisdictionQuery, { ps_id: filterPsId, include_inactive: includeInactive } = {}) {
  log.debug('listIOs: enter', { jurisdictionQuery, filterPsId: filterPsId || null, includeInactive: !!includeInactive });
  let query = baseQuery().orderBy('io.name', 'asc');
  if (!includeInactive) query = query.where('io.is_active', true);

  const scope = await psIdsInScope(jurisdictionQuery);
  if (scope !== null) {
    // Intersect the requested ps_id (if any) with what's actually in scope,
    // rather than letting a scoped role's own PS list silently shadow the filter.
    const ids = filterPsId ? scope.filter((id) => id === filterPsId) : scope;
    log.debug('listIOs: intersected filter with scope', { scopeCount: scope.length, filterPsId: filterPsId || null, resultingIdCount: ids.length });
    query = query.whereIn('io.ps_id', ids);
  } else if (filterPsId) {
    log.debug('listIOs: global scope, filtered by requested ps_id', { filterPsId });
    query = query.where('io.ps_id', filterPsId);
  }
  const rows = await query;
  log.info('listIOs: exit', { resultCount: rows.length });
  return rows;
}

/**
 * Resolve the PS id a new IO should be filed under for this creator, per the
 * RBAC matrix: a role scoped to exactly one PS (SHO) gets it stamped
 * server-side — body.ps_id is ignored (baseline P5, never trust jurisdiction
 * from the request body); a role scoped to a wider area (ACP) must name the
 * target PS and it's validated as belonging to their own scope; a globally
 * scoped role (SYSTEM_ADMIN) must name any real PS. The io.router.js RBAC
 * matrix (`allow('SHO','ACP','SYSTEM_ADMIN')`) is what guarantees only these
 * three jurisdictionQuery shapes ({ps_id}/{sub_div_id}/{}) ever reach here.
 */
async function resolveCreatePsId(jurisdictionQuery, bodyPsId) {
  log.debug('resolveCreatePsId: enter', { jurisdictionQuery, bodyPsId: bodyPsId || null });
  if (jurisdictionQuery.ps_id) {
    log.debug('resolveCreatePsId: stamped server-side from caller scope', { psId: jurisdictionQuery.ps_id });
    return jurisdictionQuery.ps_id;
  }

  if (!bodyPsId) {
    log.warn('resolveCreatePsId: rejected — ps_id required but not supplied');
    throw new Error('ps_id is required');
  }
  const ps = await db('hierarchy_nodes').where({ id: bodyPsId }).first();
  if (!ps || ps.node_type !== 'PS') {
    log.warn('resolveCreatePsId: rejected — ps_id does not reference a PS node', { bodyPsId, found: !!ps, nodeType: ps?.node_type || null });
    throw new Error('ps_id does not reference a Police Station');
  }
  await assertPsInScope(jurisdictionQuery, bodyPsId);
  log.debug('resolveCreatePsId: resolved from request body, validated in scope', { psId: bodyPsId });
  return bodyPsId;
}

// Reject-not-truncate (#10, 2026-07-20): mobile is optional, but when provided it must be
// exactly 10 digits. The old body `mobile ? …replace(/\D/g,'') : null` silently turned "abcd"
// into '' (an empty string stored as if it were a real number) and accepted any length. Now a
// blank stays null; anything else must reduce to exactly 10 digits or the whole create/update
// is rejected (controller → 400). Frontend already constrains the input to ≤10 digits; this is
// the API-layer last line of defense for direct callers.
const normalizeMobile = (mobile) => {
  if (mobile === undefined || mobile === null || String(mobile).trim() === '') return null;
  const digits = String(mobile).replace(/\D/g, '');
  if (digits.length !== 10) {
    log.warn('normalizeMobile: rejected — mobile does not reduce to 10 digits', { digitLength: digits.length });
    throw new Error('Mobile number must be exactly 10 digits');
  }
  return digits;
};

export async function createIO(jurisdictionQuery, body) {
  const name = (body.name || '').trim();
  log.debug('createIO: enter', { name, rank: body.rank || null, hasPisNo: !!body.pis_no, hasMobile: !!body.mobile, bodyPsId: body.ps_id || null, jurisdictionQuery });
  if (!name) {
    log.warn('createIO: rejected — name is required');
    throw new Error('name is required');
  }

  const psId = await resolveCreatePsId(jurisdictionQuery, body.ps_id);

  const row = {
    user_id: body.user_id || null,
    name,
    rank: body.rank || null,
    pis_no: body.pis_no || null,
    mobile: normalizeMobile(body.mobile),
    ps_id: psId,
    is_active: true,
  };

  try {
    const [inserted] = await db('investigating_officers').insert(row).returning('id');
    const id = inserted.id ?? inserted;
    log.info('createIO: wrote investigating_officers row', { ioId: id, name, psId });
    const result = await baseQuery().where('io.id', id).first();
    log.info('createIO: exit', { ioId: id });
    return result;
  } catch (err) {
    if (err.code === '23505') {
      log.warn('createIO: rejected — duplicate pis_no', { pisNo: body.pis_no });
      throw new Error('An investigating officer with this PIS number already exists');
    }
    log.error('createIO: failed', { name, psId, err });
    throw err;
  }
}

export async function updateIO(jurisdictionQuery, id, body) {
  log.debug('updateIO: enter', { ioId: id, jurisdictionQuery, providedKeys: Object.keys(body || {}) });
  const io = await db('investigating_officers').where({ id }).first();
  if (!io) {
    log.warn('updateIO: rejected — investigating officer not found', { ioId: id });
    throw new Error('Investigating officer not found');
  }
  await assertPsInScope(jurisdictionQuery, io.ps_id);

  const update = {};
  if (body.name !== undefined) update.name = String(body.name).trim();
  if (body.rank !== undefined) update.rank = body.rank || null;
  if (body.pis_no !== undefined) update.pis_no = body.pis_no || null;
  if (body.mobile !== undefined) update.mobile = normalizeMobile(body.mobile);
  if (body.is_active !== undefined) update.is_active = !!body.is_active;
  update.updated_at = db.fn.now();

  try {
    await db('investigating_officers').where({ id }).update(update);
    log.info('updateIO: wrote investigating_officers row', { ioId: id, changedKeys: Object.keys(update) });
  } catch (err) {
    if (err.code === '23505') {
      log.warn('updateIO: rejected — duplicate pis_no', { ioId: id, pisNo: body.pis_no });
      throw new Error('An investigating officer with this PIS number already exists');
    }
    log.error('updateIO: failed', { ioId: id, err });
    throw err;
  }
  const result = await baseQuery().where('io.id', id).first();
  log.info('updateIO: exit', { ioId: id });
  return result;
}

export async function deleteIO(jurisdictionQuery, id) {
  log.debug('deleteIO: enter', { ioId: id, jurisdictionQuery });
  const io = await db('investigating_officers').where({ id }).first();
  if (!io) {
    log.warn('deleteIO: rejected — investigating officer not found', { ioId: id });
    throw new Error('Investigating officer not found');
  }
  await assertPsInScope(jurisdictionQuery, io.ps_id);
  await db('investigating_officers').where({ id }).update({ is_active: false, updated_at: db.fn.now() });
  log.info('deleteIO: wrote investigating_officers row (deactivated)', { ioId: id });
}
