import db from '../../../config/db.js';

/**
 * Count CASE records grouped by (ps_id, local_head_id, canonical_code).
 * Mirrors the district-diary count-fetcher but queries a date RANGE (fortnight or YTD).
 */
async function fetchFnCaseCounts({ psIds, fromDate, toDate, isWorkedOut = false, disposalType = null }) {
  if (!psIds.length) return [];
  let q = db('records as r')
    .join('fir_details as fd', 'fd.record_id', 'r.id')
    .leftJoin('ref.local_heads as lh', 'lh.local_head_cd', 'fd.local_head_id')
    .whereIn('r.ps_id', psIds)
    .where('r.record_type', 'CASE')
    .whereRaw("COALESCE(r.registration_date, r.record_date) BETWEEN ? AND ?", [fromDate, toDate])
    .select(
      'r.ps_id',
      'fd.local_head_id',
      'lh.canonical_code',
      db.raw('COUNT(*) AS cnt')
    )
    .groupBy('r.ps_id', 'fd.local_head_id', 'lh.canonical_code');

  if (isWorkedOut) q = q.where('fd.is_worked_out', true);
  if (disposalType) q = q.where('fd.disposal_type', disposalType);

  return q;
}

/**
 * Count ARREST records grouped by (ps_id, local_head_id, canonical_code, case_type).
 */
async function fetchFnArrestCounts({ psIds, fromDate, toDate, caseType = null }) {
  if (!psIds.length) return [];
  let q = db('records as r')
    .join('arrest_details as ad', 'ad.record_id', 'r.id')
    .leftJoin('ref.local_heads as lh', 'lh.local_head_cd', 'ad.local_head_id')
    .whereIn('r.ps_id', psIds)
    .where('r.record_type', 'ARREST')
    .whereRaw("COALESCE(r.registration_date, r.record_date) BETWEEN ? AND ?", [fromDate, toDate])
    .select(
      'r.ps_id',
      'ad.local_head_id',
      'lh.canonical_code',
      'ad.case_type',
      db.raw('COUNT(*) AS cnt')
    )
    .groupBy('r.ps_id', 'ad.local_head_id', 'lh.canonical_code', 'ad.case_type');

  if (caseType) q = q.where('ad.case_type', caseType);
  return q;
}

/**
 * Count cases disposed (worked out or cancelled) in the given period,
 * with worked_out_date in the range (not registration_date).
 */
async function fetchFnDisposedCounts({ psIds, fromDate, toDate, disposalType = null }) {
  if (!psIds.length) return [];
  let q = db('records as r')
    .join('fir_details as fd', 'fd.record_id', 'r.id')
    .leftJoin('ref.local_heads as lh', 'lh.local_head_cd', 'fd.local_head_id')
    .whereIn('r.ps_id', psIds)
    .where('r.record_type', 'CASE')
    .whereNotNull('fd.worked_out_date')
    .whereRaw("fd.worked_out_date BETWEEN ? AND ?", [fromDate, toDate])
    .select(
      'r.ps_id',
      'fd.local_head_id',
      'lh.canonical_code',
      db.raw('COUNT(*) AS cnt')
    )
    .groupBy('r.ps_id', 'fd.local_head_id', 'lh.canonical_code');

  if (disposalType) q = q.where('fd.disposal_type', disposalType);
  return q;
}

/**
 * Pending cases as of fnEnd (registered before or on fnEnd, still not worked out or cancelled).
 * Returns rows with age buckets.
 */
async function fetchPendingCasesByAge({ psIds, fnEnd }) {
  if (!psIds.length) return [];
  return db('records as r')
    .join('fir_details as fd', 'fd.record_id', 'r.id')
    .leftJoin('ref.local_heads as lh', 'lh.local_head_cd', 'fd.local_head_id')
    .whereIn('r.ps_id', psIds)
    .where('r.record_type', 'CASE')
    .whereRaw("COALESCE(r.registration_date, r.record_date) <= ?", [fnEnd])
    .where(function () {
      this.where('fd.is_worked_out', false).orWhereNull('fd.is_worked_out');
    })
    .whereNull('fd.disposal_type')
    .select(
      'r.ps_id',
      'fd.local_head_id',
      'lh.canonical_code',
      db.raw("COALESCE(r.registration_date, r.record_date) AS reg_date"),
      db.raw(`
        CASE
          WHEN (DATE '${fnEnd}' - COALESCE(r.registration_date, r.record_date)) < 180 THEN 'lt6m'
          WHEN (DATE '${fnEnd}' - COALESCE(r.registration_date, r.record_date)) < 365 THEN '6to12m'
          WHEN (DATE '${fnEnd}' - COALESCE(r.registration_date, r.record_date)) < 730 THEN '1to2yr'
          ELSE 'gt2yr'
        END AS age_bucket
      `),
      db.raw('COUNT(*) AS cnt')
    )
    .groupBy('r.ps_id', 'fd.local_head_id', 'lh.canonical_code', 'age_bucket');
}

/**
 * Count cases by their PRIMARY act's act_id, for per-act statistical sheets (STAT 3/4).
 * Uses is_primary=true from record_offences, falls back to sort_order=0.
 */
async function fetchFnCasesByAct({ psIds, fromDate, toDate }) {
  if (!psIds.length) return [];
  return db('records as r')
    .join('fir_details as fd', 'fd.record_id', 'r.id')
    .join(
      db('record_offences')
        .where('is_primary', true)
        .select('record_id', 'act_id')
        .union(function () {
          this.select('record_id', 'act_id')
            .from(
              db('record_offences')
                .select('record_id', 'act_id', db.raw('ROW_NUMBER() OVER (PARTITION BY record_id ORDER BY sort_order) AS rn'))
                .as('ro_ranked')
            )
            .where('rn', 1)
            .whereNotIn('record_id', db('record_offences').where('is_primary', true).select('record_id'));
        })
        .as('primary_offence'),
      'primary_offence.record_id', 'r.id'
    )
    .leftJoin('ref.acts as a', 'a.act_cd', 'primary_offence.act_id')
    .whereIn('r.ps_id', psIds)
    .where('r.record_type', 'CASE')
    .whereRaw("COALESCE(r.registration_date, r.record_date) BETWEEN ? AND ?", [fromDate, toDate])
    .select(
      'r.ps_id',
      'primary_offence.act_id',
      'a.act_long',
      db.raw('COUNT(*) AS cnt')
    )
    .groupBy('r.ps_id', 'primary_offence.act_id', 'a.act_long');
}

/**
 * Count MISSING records by type and status.
 */
async function fetchFnMissingCounts({ psIds, fromDate, toDate }) {
  if (!psIds.length) return [];
  return db('records as r')
    .join('missing_details as md', 'md.record_id', 'r.id')
    .whereIn('r.ps_id', psIds)
    .where('r.record_type', 'MISSING')
    .whereRaw("COALESCE(r.registration_date, r.record_date) BETWEEN ? AND ?", [fromDate, toDate])
    .select(
      'r.ps_id',
      'md.missing_type',
      'md.missing_status',
      db.raw('COUNT(*) AS cnt')
    )
    .groupBy('r.ps_id', 'md.missing_type', 'md.missing_status');
}

export {
  fetchFnCaseCounts,
  fetchFnArrestCounts,
  fetchFnDisposedCounts,
  fetchPendingCasesByAge,
  fetchFnCasesByAct,
  fetchFnMissingCounts,
};
