/**
 * PHQ Diary DataCollector
 *
 * All aggregation is done in SQL (GROUP BY local_head_id / district_id).
 * Returns raw per-head per-district counts for every time window.
 * The calc layer does the diary-row mapping and totalling.
 */

import db from '../../config/db.js';
import { ALL_CRIME_ROWS, HEINOUS_ROWS, LSL_ROWS } from './phq-diary.config.js';

// ── Date helpers ─────────────────────────────────────────────────────────────

export function parseToISO(dateStr) {
  if (!dateStr) return new Date().toISOString().slice(0, 10);
  let str = String(dateStr).trim();
  if (/^\d{1,2}[\/-]\d{1,2}[\/-]\d{4}$/.test(str)) {
    const parts = str.split(/[\/-]/);
    const day = parts[0].padStart(2, '0');
    const month = parts[1].padStart(2, '0');
    const year = parts[2];
    str = `${year}-${month}-${day}`;
  }
  if (str.length >= 10 && /^\d{4}-\d{2}-\d{2}/.test(str)) {
    str = str.slice(0, 10);
  }
  if (!/^\d{4}-\d{2}-\d{2}$/.test(str)) {
    throw new Error(`Invalid date format '${dateStr}'. Expected YYYY-MM-DD.`);
  }
  return str;
}

function toDateObj(dateStr) {
  const iso = parseToISO(dateStr);
  const d = new Date(iso + 'T00:00:00Z');
  if (isNaN(d.getTime())) {
    return new Date();
  }
  return d;
}

function addDays(dateStr, n) {
  const d = toDateObj(dateStr);
  d.setUTCDate(d.getUTCDate() + n);
  return d.toISOString().slice(0, 10);
}

function addYears(dateStr, n) {
  const d = toDateObj(dateStr);
  const y = d.getUTCFullYear() + n;
  const m = d.getUTCMonth();
  const day = d.getUTCDate();
  // Snap Feb 29 in non-leap years to Feb 28
  const isLeap = y => (y % 4 === 0 && y % 100 !== 0) || y % 400 === 0;
  if (m === 1 && day === 29 && !isLeap(y)) {
    return `${y}-02-28`;
  }
  return `${y}-${String(m + 1).padStart(2, '0')}-${String(day).padStart(2, '0')}`;
}

function yearStart(dateStr) {
  const iso = parseToISO(dateStr);
  return iso.slice(0, 4) + '-01-01';
}

/**
 * Build all date ranges needed for every column in every PHQ sheet.
 *
 *   d          = the diary date (YYYY-MM-DD)
 *   MANUALY:     day_curr, day_prev, fn_curr (15d), fn_prev (15d), fn_corr (15d last year),
 *                upto_curr, upto_prev, upto_prev2
 *   WEEKLY:      week_curr (7d), week_prev (7d last year)
 *   COMPARATIVE: upto_curr, upto_prev, upto_prev2 (reused from MANUALY)
 *   DETECTION:   upto_curr/prev (reused)
 */
export function buildDateWindows(inputDate) {
  const d        = parseToISO(inputDate);
  const dPrev    = addDays(d, -1);
  const dLY      = addYears(d, -1);
  const dLY2     = addYears(d, -2);

  return {
    d,
    // Single-day windows
    day_curr:  { from: d,    to: d    },
    day_prev:  { from: dPrev, to: dPrev },

    // 15-day fortnight windows
    fn_curr:   { from: addDays(d, -14), to: d },
    fn_prev:   { from: addDays(d, -29), to: addDays(d, -15) },
    fn_corr:   { from: addDays(dLY, -14), to: dLY },

    // Up-to-date windows (Jan 1 → date, for 3 years)
    upto_curr:  { from: yearStart(d),    to: d    },
    upto_prev:  { from: yearStart(dLY),  to: dLY  },
    upto_prev2: { from: yearStart(dLY2), to: dLY2 },

    // Week windows (7 days)
    week_curr:  { from: addDays(d, -6),   to: d   },
    week_prev:  { from: addDays(dLY, -6), to: dLY },

    // Year labels
    year_curr:  parseInt(d.slice(0, 4)),
    year_prev:  parseInt(d.slice(0, 4)) - 1,
    year_prev2: parseInt(d.slice(0, 4)) - 2,
  };
}

/**
 * Fetch all FIR case counts grouped by district + local_head across all time windows.
 * One single conditional-aggregation query covering the broadest possible date range.
 *
 * Returns: Array<{ district_id, local_head_id, head_name, crime_category, [window]: count }>
 */
export async function fetchCaseCounts(entityIds, entityField, windows, trx = db) {
  if (!entityIds || entityIds.length === 0) return [];
  const field = entityField === 'ps_id' ? 'ps_id' : 'district_id';

  const { d, day_curr, day_prev, fn_curr, fn_prev, fn_corr,
          upto_curr, upto_prev, upto_prev2, week_curr, week_prev } = windows;

  const minDate = [
    fn_corr.from, upto_prev2.from, week_prev.from
  ].sort()[0];

  const rows = await trx.raw(`
    SELECT
      r.${field} AS entity_id,
      fd.local_head_id,
      lh.local_head  AS head_name,
      lh.crime_category,
      lh.canonical_code,

      COUNT(*) FILTER (WHERE COALESCE(r.registration_date, r.record_date) = :day_curr_f)                                          AS day_curr,
      COUNT(*) FILTER (WHERE COALESCE(r.registration_date, r.record_date) = :day_prev_f)                                          AS day_prev,
      COUNT(*) FILTER (WHERE COALESCE(r.registration_date, r.record_date) BETWEEN :fn_curr_f  AND :fn_curr_t)                     AS fn_curr,
      COUNT(*) FILTER (WHERE COALESCE(r.registration_date, r.record_date) BETWEEN :fn_prev_f  AND :fn_prev_t)                     AS fn_prev,
      COUNT(*) FILTER (WHERE COALESCE(r.registration_date, r.record_date) BETWEEN :fn_corr_f  AND :fn_corr_t)                     AS fn_corr,
      COUNT(*) FILTER (WHERE COALESCE(r.registration_date, r.record_date) BETWEEN :upto_curr_f  AND :upto_curr_t)                 AS upto_curr,
      COUNT(*) FILTER (WHERE COALESCE(r.registration_date, r.record_date) BETWEEN :upto_prev_f  AND :upto_prev_t)                 AS upto_prev,
      COUNT(*) FILTER (WHERE COALESCE(r.registration_date, r.record_date) BETWEEN :upto_prev2_f AND :upto_prev2_t)                AS upto_prev2,
      COUNT(*) FILTER (WHERE COALESCE(r.registration_date, r.record_date) BETWEEN :week_curr_f  AND :week_curr_t)                 AS week_curr,
      COUNT(*) FILTER (WHERE COALESCE(r.registration_date, r.record_date) BETWEEN :week_prev_f  AND :week_prev_t)                 AS week_prev,
      COUNT(*) FILTER (
        WHERE COALESCE(r.registration_date, r.record_date) BETWEEN :upto_curr_f AND :upto_curr_t AND fd.is_worked_out = true
      ) AS det_curr,
      COUNT(*) FILTER (
        WHERE COALESCE(r.registration_date, r.record_date) BETWEEN :upto_prev_f AND :upto_prev_t AND fd.is_worked_out = true
      ) AS det_prev,
      COUNT(*) FILTER (
        WHERE COALESCE(r.registration_date, r.record_date) BETWEEN :upto_prev2_f AND :upto_prev2_t AND fd.is_worked_out = true
      ) AS det_prev2

    FROM records r
    JOIN fir_details fd ON fd.record_id = r.id
    JOIN ref.local_heads lh ON lh.local_head_cd = fd.local_head_id
    WHERE r.record_type = 'CASE'
      AND r.current_status <> 'DELETED'
      AND r.${field} = ANY(:entity_ids)
      AND COALESCE(r.registration_date, r.record_date) BETWEEN :min_date AND :max_date
    GROUP BY r.${field}, fd.local_head_id, lh.local_head, lh.crime_category, lh.canonical_code
  `, {
    entity_ids: entityIds,
    min_date:     minDate,
    max_date:     d,
    day_curr_f:   day_curr.from,
    day_prev_f:   day_prev.from,
    fn_curr_f:    fn_curr.from,  fn_curr_t:    fn_curr.to,
    fn_prev_f:    fn_prev.from,  fn_prev_t:    fn_prev.to,
    fn_corr_f:    fn_corr.from,  fn_corr_t:    fn_corr.to,
    upto_curr_f:  upto_curr.from,  upto_curr_t:  upto_curr.to,
    upto_prev_f:  upto_prev.from,  upto_prev_t:  upto_prev.to,
    upto_prev2_f: upto_prev2.from, upto_prev2_t: upto_prev2.to,
    week_curr_f:  week_curr.from,  week_curr_t:  week_curr.to,
    week_prev_f:  week_prev.from,  week_prev_t:  week_prev.to,
  });

  return rows.rows.map(r => ({
    ...r,
    day_curr:  parseInt(r.day_curr)  || 0,
    day_prev:  parseInt(r.day_prev)  || 0,
    fn_curr:   parseInt(r.fn_curr)   || 0,
    fn_prev:   parseInt(r.fn_prev)   || 0,
    fn_corr:   parseInt(r.fn_corr)   || 0,
    upto_curr:  parseInt(r.upto_curr)  || 0,
    upto_prev:  parseInt(r.upto_prev)  || 0,
    upto_prev2: parseInt(r.upto_prev2) || 0,
    week_curr:  parseInt(r.week_curr)  || 0,
    week_prev:  parseInt(r.week_prev)  || 0,
    det_curr:  parseInt(r.det_curr)  || 0,
    det_prev:  parseInt(r.det_prev)  || 0,
    det_prev2: parseInt(r.det_prev2) || 0,
  }));
}

/**
 * Fetch arrest counts grouped by district + local_head across all time windows.
 */
export async function fetchArrestCounts(entityIds, entityField, windows, trx = db) {
  if (!entityIds || entityIds.length === 0) return [];
  const field = entityField === 'ps_id' ? 'ps_id' : 'district_id';

  const { d, day_curr, day_prev, fn_curr, fn_prev, fn_corr,
          upto_curr, upto_prev, upto_prev2, week_curr, week_prev } = windows;

  const minDate = [
    fn_corr.from, upto_prev2.from, week_prev.from
  ].sort()[0];

  const rows = await trx.raw(`
    SELECT
      r.${field} AS entity_id,
      ad.local_head_id,
      lh.local_head  AS head_name,
      lh.crime_category,

      COUNT(*) FILTER (WHERE COALESCE(r.registration_date, r.record_date) = :day_curr_f)                           AS day_curr,
      COUNT(*) FILTER (WHERE COALESCE(r.registration_date, r.record_date) = :day_prev_f)                           AS day_prev,
      COUNT(*) FILTER (WHERE COALESCE(r.registration_date, r.record_date) BETWEEN :fn_curr_f  AND :fn_curr_t)      AS fn_curr,
      COUNT(*) FILTER (WHERE COALESCE(r.registration_date, r.record_date) BETWEEN :fn_prev_f  AND :fn_prev_t)      AS fn_prev,
      COUNT(*) FILTER (WHERE COALESCE(r.registration_date, r.record_date) BETWEEN :fn_corr_f  AND :fn_corr_t)      AS fn_corr,
      COUNT(*) FILTER (WHERE COALESCE(r.registration_date, r.record_date) BETWEEN :upto_curr_f  AND :upto_curr_t)  AS upto_curr,
      COUNT(*) FILTER (WHERE COALESCE(r.registration_date, r.record_date) BETWEEN :upto_prev_f  AND :upto_prev_t)  AS upto_prev,
      COUNT(*) FILTER (WHERE COALESCE(r.registration_date, r.record_date) BETWEEN :upto_prev2_f AND :upto_prev2_t) AS upto_prev2,
      COUNT(*) FILTER (WHERE COALESCE(r.registration_date, r.record_date) BETWEEN :week_curr_f  AND :week_curr_t)  AS week_curr,
      COUNT(*) FILTER (WHERE COALESCE(r.registration_date, r.record_date) BETWEEN :week_prev_f  AND :week_prev_t)  AS week_prev

    FROM records r
    JOIN arrest_details ad ON ad.record_id = r.id
    JOIN ref.local_heads lh ON lh.local_head_cd = ad.local_head_id
    WHERE r.record_type = 'ARREST'
      AND r.current_status <> 'DELETED'
      AND r.${field} = ANY(:entity_ids)
      AND COALESCE(r.registration_date, r.record_date) BETWEEN :min_date AND :max_date
    GROUP BY r.${field}, ad.local_head_id, lh.local_head, lh.crime_category
  `, {
    entity_ids: entityIds,
    min_date:     minDate,
    max_date:     d,
    day_curr_f:   day_curr.from,
    day_prev_f:   day_prev.from,
    fn_curr_f:    fn_curr.from,  fn_curr_t:    fn_curr.to,
    fn_prev_f:    fn_prev.from,  fn_prev_t:    fn_prev.to,
    fn_corr_f:    fn_corr.from,  fn_corr_t:    fn_corr.to,
    upto_curr_f:  upto_curr.from,  upto_curr_t:  upto_curr.to,
    upto_prev_f:  upto_prev.from,  upto_prev_t:  upto_prev.to,
    upto_prev2_f: upto_prev2.from, upto_prev2_t: upto_prev2.to,
    week_curr_f:  week_curr.from,  week_curr_t:  week_curr.to,
    week_prev_f:  week_prev.from,  week_prev_t:  week_prev.to,
  });

  return rows.rows.map(r => ({
    ...r,
    day_curr:   parseInt(r.day_curr)  || 0,
    day_prev:   parseInt(r.day_prev)  || 0,
    fn_curr:    parseInt(r.fn_curr)   || 0,
    fn_prev:    parseInt(r.fn_prev)   || 0,
    fn_corr:    parseInt(r.fn_corr)   || 0,
    upto_curr:  parseInt(r.upto_curr)  || 0,
    upto_prev:  parseInt(r.upto_prev)  || 0,
    upto_prev2: parseInt(r.upto_prev2) || 0,
    week_curr:  parseInt(r.week_curr)  || 0,
    week_prev:  parseInt(r.week_prev)  || 0,
  }));
}

/**
 * Fetch NDPS drug recovery quantities, converting to kg via ref.units.to_kg_factor.
 * Falls back to extra->>'quantity' / extra->>'unit_cd' for legacy records.
 *
 * Returns: Array<{ district_id, drug_type_id, drug_type, total_kg_<window> }>
 */
export async function fetchDrugRecovery(entityIds, entityField, windows, trx = db) {
  if (!entityIds || entityIds.length === 0) return [];
  const field = entityField === 'ps_id' ? 'ps_id' : 'district_id';

  const { d, day_curr, day_prev, fn_curr, fn_prev, fn_corr,
          upto_curr, upto_prev, upto_prev2, week_curr, week_prev } = windows;

  const minDate = [
    fn_corr.from, upto_prev2.from, week_prev.from
  ].sort()[0];

  const rows = await trx.raw(`
    SELECT
      r.${field} AS entity_id,
      rp.drug_type_id,
      dt.drug_type,

      COALESCE(SUM(CASE WHEN r.record_date = :day_curr_f
        THEN COALESCE(rp.quantity, (rp.extra->>'quantity')::numeric, 0)
             * COALESCE(u.to_kg_factor, 1.0) END), 0)                               AS kg_day_curr,
      COALESCE(SUM(CASE WHEN r.record_date = :day_prev_f
        THEN COALESCE(rp.quantity, (rp.extra->>'quantity')::numeric, 0)
             * COALESCE(u.to_kg_factor, 1.0) END), 0)                               AS kg_day_prev,
      COALESCE(SUM(CASE WHEN r.record_date BETWEEN :fn_curr_f AND :fn_curr_t
        THEN COALESCE(rp.quantity, (rp.extra->>'quantity')::numeric, 0)
             * COALESCE(u.to_kg_factor, 1.0) END), 0)                               AS kg_fn_curr,
      COALESCE(SUM(CASE WHEN r.record_date BETWEEN :fn_prev_f AND :fn_prev_t
        THEN COALESCE(rp.quantity, (rp.extra->>'quantity')::numeric, 0)
             * COALESCE(u.to_kg_factor, 1.0) END), 0)                               AS kg_fn_prev,
      COALESCE(SUM(CASE WHEN r.record_date BETWEEN :fn_corr_f AND :fn_corr_t
        THEN COALESCE(rp.quantity, (rp.extra->>'quantity')::numeric, 0)
             * COALESCE(u.to_kg_factor, 1.0) END), 0)                               AS kg_fn_corr,
      COALESCE(SUM(CASE WHEN r.record_date BETWEEN :upto_curr_f AND :upto_curr_t
        THEN COALESCE(rp.quantity, (rp.extra->>'quantity')::numeric, 0)
             * COALESCE(u.to_kg_factor, 1.0) END), 0)                               AS kg_upto_curr,
      COALESCE(SUM(CASE WHEN r.record_date BETWEEN :upto_prev_f AND :upto_prev_t
        THEN COALESCE(rp.quantity, (rp.extra->>'quantity')::numeric, 0)
             * COALESCE(u.to_kg_factor, 1.0) END), 0)                               AS kg_upto_prev,
      COALESCE(SUM(CASE WHEN r.record_date BETWEEN :upto_prev2_f AND :upto_prev2_t
        THEN COALESCE(rp.quantity, (rp.extra->>'quantity')::numeric, 0)
             * COALESCE(u.to_kg_factor, 1.0) END), 0)                               AS kg_upto_prev2,
      COALESCE(SUM(CASE WHEN r.record_date BETWEEN :week_curr_f AND :week_curr_t
        THEN COALESCE(rp.quantity, (rp.extra->>'quantity')::numeric, 0)
             * COALESCE(u.to_kg_factor, 1.0) END), 0)                               AS kg_week_curr,
      COALESCE(SUM(CASE WHEN r.record_date BETWEEN :week_prev_f AND :week_prev_t
        THEN COALESCE(rp.quantity, (rp.extra->>'quantity')::numeric, 0)
             * COALESCE(u.to_kg_factor, 1.0) END), 0)                               AS kg_week_prev

    FROM record_properties rp
    JOIN records r ON r.id = rp.record_id
    JOIN ref.drug_types dt ON dt.drug_type_cd = rp.drug_type_id
    LEFT JOIN ref.units u ON u.unit_cd = COALESCE(
      rp.unit_cd,
      NULLIF((rp.extra->>'unit_cd'), '')::int
    )
    WHERE rp.drug_type_id IS NOT NULL
      AND rp.status IN ('SEIZED', 'RECOVERED', 'INVOLVED')
      AND r.record_type = 'CASE'
      AND r.current_status <> 'DELETED'
      AND r.${field} = ANY(:entity_ids)
      AND r.record_date BETWEEN :min_date AND :max_date
    GROUP BY r.${field}, rp.drug_type_id, dt.drug_type
  `, {
    entity_ids: entityIds,
    min_date:     minDate,
    max_date:     d,
    day_curr_f:   day_curr.from,
    day_prev_f:   day_prev.from,
    fn_curr_f:    fn_curr.from,  fn_curr_t:    fn_curr.to,
    fn_prev_f:    fn_prev.from,  fn_prev_t:    fn_prev.to,
    fn_corr_f:    fn_corr.from,  fn_corr_t:    fn_corr.to,
    upto_curr_f:  upto_curr.from,  upto_curr_t:  upto_curr.to,
    upto_prev_f:  upto_prev.from,  upto_prev_t:  upto_prev.to,
    upto_prev2_f: upto_prev2.from, upto_prev2_t: upto_prev2.to,
    week_curr_f:  week_curr.from,  week_curr_t:  week_curr.to,
    week_prev_f:  week_prev.from,  week_prev_t:  week_prev.to,
  });

  return rows.rows.map(r => ({
    ...r,
    kg_day_curr:   parseFloat(r.kg_day_curr)   || 0,
    kg_day_prev:   parseFloat(r.kg_day_prev)   || 0,
    kg_fn_curr:    parseFloat(r.kg_fn_curr)    || 0,
    kg_fn_prev:    parseFloat(r.kg_fn_prev)    || 0,
    kg_fn_corr:    parseFloat(r.kg_fn_corr)    || 0,
    kg_upto_curr:  parseFloat(r.kg_upto_curr)  || 0,
    kg_upto_prev:  parseFloat(r.kg_upto_prev)  || 0,
    kg_upto_prev2: parseFloat(r.kg_upto_prev2) || 0,

    kg_week_curr:  parseFloat(r.kg_week_curr)  || 0,
    kg_week_prev:  parseFloat(r.kg_week_prev)  || 0,
  }));
}

/**
 * Resolve district node IDs from district codes using hierarchy_nodes.
 * Returns: { codeToId: Map, idToCode: Map, idToName: Map }
 */
export async function resolveDistrictNodes(districtCodes, trx = db) {
  const nodes = await trx('hierarchy_nodes')
    .whereIn('code', districtCodes)
    .where({ node_type: 'DISTRICT' })
    .select('id', 'code', 'name');

  const codeToId = new Map();
  const idToCode = new Map();
  const idToName = new Map();
  for (const n of nodes) {
    codeToId.set(n.code, n.id);
    idToCode.set(n.id, n.code);
    idToName.set(n.id, n.name);
  }
  return { codeToId, idToCode, idToName };
}

export async function resolveChildrenNodes(childIds, trx = db) {
  const nodes = await trx('hierarchy_nodes')
    .whereIn('id', childIds)
    .select('id', 'code', 'name');

  const codeToId = new Map();
  const idToCode = new Map();
  const idToName = new Map();
  for (const n of nodes) {
    const uniqueCode = n.code || n.id;
    codeToId.set(uniqueCode, n.id);
    idToCode.set(n.id, uniqueCode);
    idToName.set(n.id, n.name);
  }
  return { codeToId, idToCode, idToName };
}

/**
 * Correction 2: RAPE & POCSO merged query for Monday_Morning sheet.
 * Counts cases where local_head_id = 7 (RAPE) AND POCSO act (3039, 9993) is present in record_offences.
 */
export async function fetchRapePocsoCounts(entityIds, entityField, windows, trx = db) {
  if (!entityIds || entityIds.length === 0) return [];
  const field = entityField === 'ps_id' ? 'ps_id' : 'district_id';
  const { d, week_curr, week_prev } = windows;

  const rows = await trx.raw(`
    SELECT
      r.${field} AS entity_id,
      COUNT(*) FILTER (WHERE COALESCE(r.registration_date, r.record_date) BETWEEN :week_curr_f AND :week_curr_t) AS week_curr,
      COUNT(*) FILTER (WHERE COALESCE(r.registration_date, r.record_date) BETWEEN :week_prev_f AND :week_prev_t) AS week_prev,
      COUNT(*) FILTER (
        WHERE COALESCE(r.registration_date, r.record_date) BETWEEN :week_curr_f AND :week_curr_t AND fd.is_worked_out = true
      ) AS det_curr,
      COUNT(*) FILTER (
        WHERE COALESCE(r.registration_date, r.record_date) BETWEEN :week_prev_f AND :week_prev_t AND fd.is_worked_out = true
      ) AS det_prev
    FROM records r
    JOIN fir_details fd ON fd.record_id = r.id
    WHERE r.record_type = 'CASE'
      AND r.current_status <> 'DELETED'
      AND fd.local_head_id = 7
      AND EXISTS (
        SELECT 1 FROM record_offences ro
        WHERE ro.record_id = r.id
          AND ro.act_id IN (3039, 9993)
      )
      AND r.${field} = ANY(:entity_ids)
      AND COALESCE(r.registration_date, r.record_date) BETWEEN :min_date AND :max_date
    GROUP BY r.${field}
  `, {
    entity_ids: entityIds,
    min_date: week_prev.from,
    max_date: d,
    week_curr_f: week_curr.from, week_curr_t: week_curr.to,
    week_prev_f: week_prev.from, week_prev_t: week_prev.to,
  });

  return rows.rows.map(r => ({
    entity_id: r.entity_id,
    week_curr: parseInt(r.week_curr) || 0,
    week_prev: parseInt(r.week_prev) || 0,
    det_curr: parseInt(r.det_curr) || 0,
    det_prev: parseInt(r.det_prev) || 0,
  }));
}
