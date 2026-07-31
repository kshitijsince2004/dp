import db from '../../../config/db.js';

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

function filterValidUuids(arr) {
  return (arr || []).filter(id => typeof id === 'string' && UUID_RE.test(id));
}

export async function fetchDistrictCaseCounts({ psIds, fromDate, toDate, sourceSystems = null, isWorkedOut = null }) {
  const validPsIds = filterValidUuids(psIds);
  if (validPsIds.length === 0) return [];

  let query = db('records as r')
    .join('fir_details as fd', 'fd.record_id', 'r.id')
    .leftJoin('ref.local_heads as lh', 'lh.local_head_cd', 'fd.local_head_id')
    .where('r.record_type', 'CASE')
    .whereIn('r.ps_id', validPsIds)
    .whereRaw('COALESCE(r.registration_date, r.record_date) BETWEEN ? AND ?', [fromDate, toDate]);

  if (sourceSystems && sourceSystems.length > 0) {
    query = query.whereIn('r.source_system', sourceSystems);
  }

  if (isWorkedOut !== null) {
    query = query.where('fd.is_worked_out', isWorkedOut);
  }

  return await query
    .select(
      'r.ps_id',
      'fd.local_head_id',
      'lh.canonical_code',
      db.raw('COUNT(*)::int as cnt')
    )
    .groupBy('r.ps_id', 'fd.local_head_id', 'lh.canonical_code');
}

export async function fetchDistrictArrestCounts({ psIds, fromDate, toDate, caseType = null }) {
  const validPsIds = filterValidUuids(psIds);
  if (validPsIds.length === 0) return [];

  let query = db('records as r')
    .join('arrest_details as ad', 'ad.record_id', 'r.id')
    .where('r.record_type', 'ARREST')
    .whereIn('r.ps_id', validPsIds)
    .whereRaw('COALESCE(r.registration_date, r.record_date) BETWEEN ? AND ?', [fromDate, toDate]);

  if (caseType) {
    query = query.where('ad.case_type', caseType);
  }

  return await query
    .select('r.ps_id', db.raw('COUNT(*)::int as cnt'))
    .groupBy('r.ps_id');
}

export async function fetchDistrictPcrCallCounts({ psIds, fromDate, toDate }) {
  const validPsIds = filterValidUuids(psIds);
  if (validPsIds.length === 0) return [];

  return await db('records as r')
    .where('r.record_type', 'PCR_CALL')
    .whereIn('r.ps_id', validPsIds)
    .whereRaw('COALESCE(r.registration_date, r.record_date) BETWEEN ? AND ?', [fromDate, toDate])
    .select('r.ps_id', db.raw('COUNT(*)::int as cnt'))
    .groupBy('r.ps_id');
}
