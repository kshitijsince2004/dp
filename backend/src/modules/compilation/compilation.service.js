import db from '../../config/db.js';
import { publish } from '../../events/eventBus.js';
import { v4 as uuidv4 } from 'uuid';
import { logger } from '../../utils/logger.js';
import { toDMY } from '../../utils/dateFormat.js';

/**
 * Parse compiled_summary JSON from DB row.
 */
const parseSummary = (row) => {
  if (!row) return row;
  return {
    ...row,
    period: toDMY(row.period) || row.period,
    compiled_summary: typeof row.compiled_summary === 'string'
      ? JSON.parse(row.compiled_summary)
      : (row.compiled_summary || null),
    record_ids: typeof row.record_ids === 'string'
      ? JSON.parse(row.record_ids)
      : (row.record_ids || []),
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
  return rows.map(parseSummary);
};

/**
 * Get single compilation by id.
 */
export const getCompilation = async (id) => {
  const row = await db('compilations').where({ id }).first();
  return parseSummary(row);
};

/**
 * Create a new DRAFT compilation for a district + period.
 * Gathers all records in DISTRICT_REVIEW status for the district.
 */
export const createCompilation = async (districtId, period, userId, fromDate, toDate) => {
  if (!districtId || !period) {
    throw new Error('districtId and period are required');
  }

  // Find all records at DISTRICT_REVIEW level for this district, optionally scoped by date range
  let query = db('records')
    .where({ district_id: districtId, current_status: 'DISTRICT_REVIEW' });

  if (fromDate) {
    query = query.where('record_date', '>=', fromDate);
  }
  if (toDate) {
    query = query.where('record_date', '<=', toDate);
  }

  const records = await query.select('id', 'record_type');

  const recordIds = records.map(r => r.id);

  // Allow empty compilations — non-zero records are enforced only at submit time
  if (recordIds.length === 0) {
    logger.info(`[Compilation] No DISTRICT_REVIEW records found for district ${districtId} on period ${period}. Creating empty compilation.`);
  }

  // Build summary breakdown by record type
  const byType = { CASE: 0, ARREST: 0, PCR_CALL: 0, MISSING: 0, UIDB: 0 };
  records.forEach(r => {
    const t = (r.record_type || '').toUpperCase();
    if (byType[t] !== undefined) byType[t]++;
  });

  const compiledSummary = {
    total_records: recordIds.length,
    firs: byType.CASE,
    arrests: byType.ARREST,
    pcrCalls: byType.PCR_CALL,
    missing: byType.MISSING,
    uidb: byType.UIDB,
    period,
    compiled_by: userId,
  };

  // Upsert: refresh an existing DRAFT rather than accumulating duplicate rows.
  const existing = await db('compilations')
    .where({ source_entity_id: districtId, period, status: 'DRAFT' })
    .first();

  let compilationId;
  if (existing) {
    compilationId = existing.id;
    await db('compilations').where({ id: compilationId }).update({
      record_ids: JSON.stringify(recordIds),
      compiled_summary: JSON.stringify(compiledSummary),
      submitted_by: userId,
    });
  } else {
    compilationId = uuidv4();
    await db('compilations').insert({
      id: compilationId,
      source_level: 'DISTRICT',
      target_level: 'HQ',
      route: 'OPS_CHAIN',
      source_entity_id: districtId,
      period,
      status: 'DRAFT',
      record_ids: JSON.stringify(recordIds),
      compiled_summary: JSON.stringify(compiledSummary),
      submitted_by: userId,
    });
  }

  const created = await db('compilations').where({ id: compilationId }).first();
  return parseSummary(created);
};

/**
 * Submit a DRAFT compilation to HQ.
 * Updates the compilation to SUBMITTED and marks all bundled records as COMPILED.
 */
export const submitCompilation = async (id, userId) => {
  const compilation = await db('compilations').where({ id }).first();
  if (!compilation) throw new Error('Compilation not found');
  if (compilation.status !== 'DRAFT') throw new Error('Only DRAFT compilations can be submitted to HQ');

  const precheck = typeof compilation.record_ids === 'string'
    ? JSON.parse(compilation.record_ids)
    : (compilation.record_ids || []);
  if (!precheck || precheck.length === 0) {
    throw new Error('Cannot submit an empty compilation — no DISTRICT_REVIEW records were bundled.');
  }

  const [updatedCompilation] = await db('compilations')
    .where({ id })
    .update({
      status: 'SUBMITTED',
      submitted_at: db.fn.now(),
      submitted_by: userId,
    })
    .returning('*');

  // Mark all bundled records as COMPILED
  const recordIds = typeof compilation.record_ids === 'string'
    ? JSON.parse(compilation.record_ids)
    : (compilation.record_ids || []);

  if (recordIds && recordIds.length > 0) {
    await db('records').whereIn('id', recordIds).update({
      current_status: 'HQ_RECEIVED',
      current_level: 'HQ',
      updated_at: db.fn.now(),
    });

    // Log workflow transitions for each record
    for (const recordId of recordIds) {
      try {
        await db('workflow_transitions').insert({
          id: uuidv4(),
          record_id: recordId,
          from_level: 'DISTRICT',
          to_level: 'HQ',
          from_status: 'DISTRICT_REVIEW',
          to_status: 'HQ_RECEIVED',
          action: 'COMPILED_SUBMITTED',
          performed_by: userId,
          performed_at: new Date().toISOString(),
        });
      } catch (e) {
        // Non-fatal: don't block submission if transition log fails
        logger.warn(`[Compilation] Failed to log transition for record: ${recordId} — ${e.message}`);
      }
    }
  }

  try {
    await publish('compilation.submitted', {
      compilationId: id,
      districtId: compilation.source_entity_id,
      period: compilation.period,
      submitted_by: userId,
    });
  } catch (e) {
    logger.warn('[Compilation] EventBus publish failed (non-fatal):', e.message);
  }

  return parseSummary(updatedCompilation || compilation);
};
