import db from '../../config/db.js';
import { publish } from '../../events/eventBus.js';
import { v4 as uuidv4 } from 'uuid';
import { logger } from '../../utils/logger.js';
import { toDMY } from '../../utils/dateFormat.js';
import { transitionRecord } from '../records/records.service.js';

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
  let query = db('compilations').select('*');

  if (districtId) query = query.where({ source_entity_id: districtId });
  if (period) query = query.where({ period });
  if (status) query = query.where({ status });

  const rows = await query.orderBy('submitted_at', 'desc');
  return Promise.all(rows.map(parseSummary));
};

/**
 * Get single compilation by id.
 */
export const getCompilation = async (id) => {
  const row = await db('compilations').where({ id }).first();
  return parseSummary(row);
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
  if (!districtId || !period) {
    throw new Error('districtId and period are required');
  }

  let query = db('records')
    .where({ district_id: districtId, current_status: 'DISTRICT_REVIEW' });

  if (fromDate) query = query.where('record_date', '>=', fromDate);
  if (toDate) query = query.where('record_date', '<=', toDate);

  const records = await query.select('id', 'record_type', 'ps_id', 'district_id');

  logger.info(`[Compilation] ${records.length} DISTRICT_REVIEW records found for district ${districtId} on period ${period}.`);

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

  const compilationId = await db.transaction(async (trx) => {
    const existing = await trx('compilations')
      .where({ source_entity_id: districtId, period, status: 'DRAFT' })
      .first();

    let id;
    if (existing) {
      id = existing.id;
      await trx('compilations').where({ id }).update({
        compiled_summary: JSON.stringify(compiledSummary), submitted_by: userId, updated_at: trx.fn.now(),
      });
      await trx('compilation_records').where({ compilation_id: id }).delete();
    } else {
      id = uuidv4();
      await trx('compilations').insert({
        id, source_level: 'DISTRICT', target_level: 'HQ', route: 'OPS_CHAIN',
        source_entity_id: districtId, period, status: 'DRAFT',
        compiled_summary: JSON.stringify(compiledSummary), submitted_by: userId,
      });
    }

    if (records.length) {
      await trx('compilation_records').insert(records.map((r) => ({
        compilation_id: id, record_id: r.id,
        ps_id_at_compile: r.ps_id, district_id_at_compile: r.district_id,
      })));
    }

    return id;
  });

  const created = await db('compilations').where({ id: compilationId }).first();
  return parseSummary(created);
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
  const compilation = await db('compilations').where({ id }).first();
  if (!compilation) throw new Error('Compilation not found');
  if (compilation.status !== 'DRAFT') throw new Error('Only DRAFT compilations can be submitted to HQ');

  const members = await db('compilation_records').where({ compilation_id: id }).select('record_id');
  if (!members.length) {
    throw new Error('Cannot submit an empty compilation — no DISTRICT_REVIEW records were bundled.');
  }

  const [updatedCompilation] = await db('compilations')
    .where({ id })
    .update({ status: 'SUBMITTED', submitted_at: db.fn.now(), submitted_by: user.id })
    .returning('*');

  let advanced = 0;
  for (const { record_id: recordId } of members) {
    try {
      const record = await db('records').where({ id: recordId }).first();
      if (!record) continue;
      if (record.current_status === 'DISTRICT_REVIEW') {
        await transitionRecord(recordId, user, 'compile', null, null, null);
      }
      const afterCompile = await db('records').where({ id: recordId }).first();
      if (afterCompile.current_status === 'COMPILED') {
        await transitionRecord(recordId, user, 'submit', null, null, null);
      }
      advanced++;
    } catch (e) {
      logger.warn(`[Compilation] Failed to advance record ${recordId} during submit: ${e.message}`);
    }
  }
  logger.info(`[Compilation] Submitted ${id}: ${advanced}/${members.length} member records advanced to JCP_REVIEW.`);

  try {
    await publish('compilation.submitted', {
      compilationId: id, districtId: compilation.source_entity_id,
      period: compilation.period, submitted_by: user.id,
    });
  } catch (e) {
    logger.warn('[Compilation] EventBus publish failed (non-fatal):', e.message);
  }

  return parseSummary(updatedCompilation || compilation);
};
