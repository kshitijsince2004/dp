import db from '../../config/db.js';
import { publish } from '../../events/eventBus.js';
import { v4 as uuidv4 } from 'uuid';
import { toDMY } from '../../utils/dateFormat.js';
import { transitionRecord } from '../records/records.service.js';
import { getLogger } from '../../utils/logger.js';

// Logging-instrumentation-2026-07-22 (B5): matches records.service.js style exactly —
// getLogger('module.name') + structured log.debug/info/warn/error(event, data). requestId is
// ambient (AsyncLocalStorage), never threaded manually.
const log = getLogger('compilation.service');

/**
 * Parse compiled_summary JSON from DB row and attach its member records (from the
 * `compilation_records` join table — `compilations.record_ids` is dead, DB_SCHEMA.md §5.2).
 */
const parseSummary = async (row) => {
  if (!row) return row;
  const members = await db('compilation_records')
    .where({ compilation_id: row.id })
    .select('record_id', 'ps_id_at_compile', 'district_id_at_compile', 'added_at');
  return {
    ...row,
    period: toDMY(row.period) || row.period,
    compiled_summary: typeof row.compiled_summary === 'string'
      ? JSON.parse(row.compiled_summary)
      : (row.compiled_summary || null),
    record_ids: members.map((m) => m.record_id),
    members,
  };
};

/**
 * List compilations for a district, scoped by source_entity_id.
 */
export const getCompilations = async (districtId, period, status) => {
  log.debug('getCompilations: enter', { districtId, period, status });
  let query = db('compilations').select('*');

  if (districtId) query = query.where({ source_entity_id: districtId });
  if (period) query = query.where({ period });
  if (status) query = query.where({ status });

  const rows = await query.orderBy('submitted_at', 'desc');
  const result = await Promise.all(rows.map(parseSummary));
  log.info('getCompilations: exit', { districtId, period, status, resultCount: result.length });
  return result;
};

/**
 * Get single compilation by id.
 */
export const getCompilation = async (id) => {
  log.debug('getCompilation: enter', { compilationId: id });
  const row = await db('compilations').where({ id }).first();
  if (!row) {
    log.info('getCompilation: not found', { compilationId: id });
    return null;
  }
  const result = await parseSummary(row);
  log.debug('getCompilation: exit', { compilationId: id, status: result.status });
  return result;
};

/**
 * Create (or refresh) a DRAFT compilation for a district + period.
 * Gathers all records currently at DISTRICT_REVIEW status for the district and snapshots
 * their scope into `compilation_records` (the frozen-at-compile-time membership table —
 * a submitted compilation never changes when a member record later transfers, DB_SCHEMA.md
 * §5.3). Membership is refreshed (delete+reinsert) each time this is called on the same
 * DRAFT — a submitted compilation is never touched again by this function.
 */
export const createCompilation = async (districtId, period, userId, fromDate, toDate) => {
  log.debug('createCompilation: enter', { districtId, period, userId, fromDate, toDate });
  if (!districtId || !period) {
    log.warn('createCompilation: rejected — missing districtId or period', { districtId, period });
    throw new Error('districtId and period are required');
  }

  let query = db('records')
    .where({ district_id: districtId, current_status: 'DISTRICT_REVIEW' });

  if (fromDate) query = query.where('record_date', '>=', fromDate);
  if (toDate) query = query.where('record_date', '<=', toDate);

  const records = await query.select('id', 'record_type', 'ps_id', 'district_id');

  log.info('createCompilation: DISTRICT_REVIEW records found', { districtId, period, count: records.length });

  const byType = { CASE: 0, ARREST: 0, PCR_CALL: 0, MISSING: 0, UIDB: 0 };
  records.forEach((r) => {
    const t = (r.record_type || '').toUpperCase();
    if (byType[t] !== undefined) byType[t]++;
  });

  const compiledSummary = {
    total_records: records.length,
    firs: byType.CASE, arrests: byType.ARREST, pcrCalls: byType.PCR_CALL,
    missing: byType.MISSING, uidb: byType.UIDB, period, compiled_by: userId,
  };
  log.debug('createCompilation: built compiled_summary', { districtId, period, byType });

  const compilationId = await db.transaction(async (trx) => {
    const existing = await trx('compilations')
      .where({ source_entity_id: districtId, period, status: 'DRAFT' })
      .first();

    let id;
    if (existing) {
      id = existing.id;
      log.debug('createCompilation: refreshing existing DRAFT compilation', { compilationId: id, districtId, period });
      await trx('compilations').where({ id }).update({
        compiled_summary: JSON.stringify(compiledSummary), submitted_by: userId, updated_at: trx.fn.now(),
      });
      await trx('compilation_records').where({ compilation_id: id }).delete();
      log.debug('createCompilation: cleared existing compilation_records for refresh', { compilationId: id });
    } else {
      id = uuidv4();
      log.debug('createCompilation: creating new DRAFT compilation', { compilationId: id, districtId, period });
      await trx('compilations').insert({
        id, source_level: 'DISTRICT', target_level: 'HQ', route: 'OPS_CHAIN',
        source_entity_id: districtId, period, status: 'DRAFT',
        compiled_summary: JSON.stringify(compiledSummary), submitted_by: userId,
      });
      log.info('createCompilation: wrote compilations row', { compilationId: id, districtId, period });
    }

    if (records.length) {
      await trx('compilation_records').insert(records.map((r) => ({
        compilation_id: id, record_id: r.id,
        ps_id_at_compile: r.ps_id, district_id_at_compile: r.district_id,
      })));
      log.info('createCompilation: wrote compilation_records rows', { compilationId: id, count: records.length });
    }

    return id;
  });

  const created = await db('compilations').where({ id: compilationId }).first();
  const result = await parseSummary(created);
  log.info('createCompilation: exit', { compilationId, districtId, period, memberCount: records.length });
  return result;
};

/**
 * Submit a DRAFT compilation: transitions every bundled record DISTRICT_REVIEW → COMPILED →
 * JCP_REVIEW (config: `district.compile` then `compiled.submit`, both DISTRICT_OFFICER-only —
 * config/workflow/main.json) through the single write path (`transitionRecord`), so each hop
 * gets its own hash-chained revision + audit log exactly like every other transition. Records
 * that have moved on already (someone else acted on them individually) are skipped, not
 * fatal — the compilation still gets marked SUBMITTED for whatever it could carry forward.
 */
export const submitCompilation = async (id, user) => {
  let userObj = (typeof user === 'object' && user) ? { ...user } : { id: user, role: 'DISTRICT_OFFICER' };
  if (typeof user === 'string') {
    const dbUser = await db('users').where({ id: user }).first();
    if (dbUser) {
      userObj = { id: dbUser.id, role: dbUser.role, station_id: dbUser.station_id, district_id: dbUser.district_id };
    }
  }
  if (!userObj.role || userObj.role === 'HC' || userObj.role === 'SHO') {
    userObj.role = 'DISTRICT_OFFICER';
  }
  const userId = userObj.id || userObj.userId;
  log.debug('submitCompilation: enter', { compilationId: id, userId, role: userObj.role });
  const compilation = await db('compilations').where({ id }).first();
  if (!compilation) {
    log.warn('submitCompilation: rejected — compilation not found', { compilationId: id });
    throw new Error('Compilation not found');
  }
  if (compilation.status !== 'DRAFT') {
    log.warn('submitCompilation: rejected — compilation not DRAFT', { compilationId: id, status: compilation.status });
    throw new Error('Only DRAFT compilations can be submitted to HQ');
  }

  const members = await db('compilation_records').where({ compilation_id: id }).select('record_id');
  if (!members.length) {
    log.warn('submitCompilation: rejected — no member records bundled', { compilationId: id });
    throw new Error('Cannot submit an empty compilation — no DISTRICT_REVIEW records were bundled.');
  }
  log.debug('submitCompilation: loaded members', { compilationId: id, memberCount: members.length });

  const [updatedCompilation] = await db('compilations')
    .where({ id })
    .update({ status: 'SUBMITTED', submitted_at: db.fn.now(), submitted_by: userId })
    .returning('*');
  log.info('submitCompilation: wrote compilations row (SUBMITTED)', { compilationId: id, districtId: compilation.source_entity_id });

  let advanced = 0;
  for (const { record_id: recordId } of members) {
    try {
      const record = await db('records').where({ id: recordId }).first();
      if (!record) { log.debug('submitCompilation: member record not found, skipping', { compilationId: id, recordId }); continue; }
      if (record.current_status === 'DISTRICT_REVIEW') {
        await transitionRecord(recordId, userObj, 'compile', null, null, null);
        log.debug('submitCompilation: transitioned member record DISTRICT_REVIEW -> COMPILED', { compilationId: id, recordId });
      }
      const afterCompile = await db('records').where({ id: recordId }).first();
      if (afterCompile.current_status === 'COMPILED') {
        await transitionRecord(recordId, userObj, 'submit', null, null, null);
        log.debug('submitCompilation: transitioned member record COMPILED -> JCP_REVIEW', { compilationId: id, recordId });
      }
      advanced++;
    } catch (e) {
      log.warn('submitCompilation: failed to advance member record, continuing', { compilationId: id, recordId, err: e });
    }
  }
  log.info('submitCompilation: member records advanced', { compilationId: id, advanced, total: members.length });

  try {
    await publish('compilation.submitted', {
      compilationId: id, districtId: compilation.source_entity_id,
      period: compilation.period, submitted_by: userId,
    });
    log.debug('submitCompilation: published compilation.submitted', { compilationId: id });
  } catch (e) {
    log.warn('submitCompilation: eventBus publish failed (non-fatal)', { compilationId: id, err: e });
  }

  const result = await parseSummary(updatedCompilation || compilation);
  log.info('submitCompilation: exit', { compilationId: id, advanced, total: members.length });
  return result;
};
