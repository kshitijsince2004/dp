import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import db from '../../config/db.js';
import { logger } from '../../utils/logger.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));

// Load reportable fields catalogue — resolved relative to this file, with cwd fallbacks
const cataloguePath = [
  path.resolve(__dirname, '../../../config/warehouse/reportable-fields.json'),
  path.resolve(process.cwd(), 'backend/config/warehouse/reportable-fields.json'),
  path.resolve(process.cwd(), 'config/warehouse/reportable-fields.json'),
].find((p) => fs.existsSync(p));

if (!cataloguePath) {
  throw new Error('Could not locate config/warehouse/reportable-fields.json');
}

const fieldsCatalogue = JSON.parse(fs.readFileSync(cataloguePath, 'utf8'));

/**
 * Humanise a raw dimension value for display headers:
 * ATT_TO_MURDER -> "Attempt to Murder", HEINOUS -> "Heinous Offences", etc.
 */
function formatLabel(val) {
  if (!val || val === 'N/A' || val === 'UNCLASSIFIED') return 'General / Unclassified';
  if (val === 'ATT_TO_MURDER') return 'Attempt to Murder';
  if (val === 'KID_FOR_RANSOM') return 'Kidnapping for Ransom';
  if (val === 'HEINOUS') return 'Heinous Offences';
  if (val === 'NON_HEINOUS') return 'Non-Heinous Offences';
  if (val === 'OTHER') return 'Other Offences';
  if (val === 'MAJOR') return 'Major Act (IPC / BNS / CrPC / BNSS)';
  if (val === 'SLL') return 'Special & Local Law';
  if (val === 'PCR_CALL') return 'PCR Call';
  if (val === 'UIDB') return 'UIDB';
  if (val === 'CASE') return 'FIR';
  if (val.includes('_')) {
    return val.split('_').map((w) => w.charAt(0).toUpperCase() + w.slice(1).toLowerCase()).join(' ');
  }
  return val;
}

const DIM_MAP = Object.fromEntries(fieldsCatalogue.dimensions.map((d) => [d.key, d]));
const MEASURE_MAP = Object.fromEntries(fieldsCatalogue.measures.map((m) => [m.key, m]));

const MAX_ROWS = 5000;

// Dimensions that introduce a 1-to-many join off `records`. Combining any of
// these with an additive (SUM / COUNT(*)) measure multiplies the measure by the
// fan-out. COUNT(DISTINCT r.id)-style measures are unaffected, so only the
// property measures (flagged is_property_measure) are guarded.
const FANOUT_DIMENSIONS = new Set([
  'gender', 'social_category', 'education', 'financial_status', // -> persons p
  'act_name', 'act_class', // -> record_offences ro (up to 4 per record)
]);

/**
 * runPivotReport({ rows, columns, measure, filters, scopeType, scopeId })
 * Dynamic SQL query execution pulling 100% live database records without hardcoding.
 */
export async function runPivotReport({
  rows = [],
  columns = [],
  measure = 'case_count',
  filters = {},
  scopeType = 'HQ',
  scopeId = null,
}) {
  // 1. Security check: validate every dimension and measure against allowlist
  const allDims = [...rows, ...columns];
  for (const key of allDims) {
    if (!DIM_MAP[key]) {
      throw new Error(`Invalid or unapproved dimension key: ${key}`);
    }
  }

  const measureDef = MEASURE_MAP[measure];
  if (!measureDef) {
    throw new Error(`Invalid or unapproved measure key: ${measure}`);
  }

  // Fan-out guard: an additive property measure must not be combined with a
  // dimension that fans records out, or its SUM/COUNT is multiplied.
  if (measureDef.is_property_measure) {
    const bad = allDims.filter((k) => FANOUT_DIMENSIONS.has(k));
    if (bad.length > 0) {
      throw new Error(
        `Measure "${measure}" cannot be combined with dimension(s) [${bad.join(', ')}] — ` +
        `it would multiply property totals by the number of persons/offences per record.`
      );
    }
  }

  // Handle zero-dimension pivot (e.g. single aggregate summary)
  if (allDims.length === 0) {
    return runSingleSummary({ measureDef, filters, scopeType, scopeId });
  }

  // 2. Build deduplicated JOIN list
  const joins = new Set();
  for (const key of allDims) {
    (DIM_MAP[key].requires_join ?? []).forEach((j) => joins.add(j));
  }
  (measureDef.requires_join ?? []).forEach((j) => joins.add(j));

  // 3. Build SELECT expressions
  const selectDims = allDims.map((key, i) => `${DIM_MAP[key].sql_expr} AS dim_${i}`);
  const selectMeasure = `${measureDef.sql_expr} AS measure_val`;

  // 4. Scope & filter predicates (parameterized)
  const whereClauses = ["r.current_status <> 'DRAFT'"];
  const params = {};

  if (scopeType === 'PS' && scopeId) {
    whereClauses.push('r.ps_id = :scopeId');
    params.scopeId = scopeId;
  } else if (scopeType === 'SUB_DIV' && scopeId) {
    whereClauses.push('r.sub_div_id = :scopeId');
    params.scopeId = scopeId;
  } else if (scopeType === 'DISTRICT' && scopeId) {
    whereClauses.push('r.district_id = :scopeId');
    params.scopeId = scopeId;
  }

  if (filters.psId) {
    whereClauses.push('r.ps_id = :filterPsId');
    params.filterPsId = filters.psId;
  }
  if (filters.districtId) {
    whereClauses.push('r.district_id = :filterDistrictId');
    params.filterDistrictId = filters.districtId;
  }

  if (filters.recordType) {
    whereClauses.push('r.record_type = :recordType');
    params.recordType = filters.recordType;
  }
  if (filters.caseStatus) {
    whereClauses.push('fd.case_status = :caseStatus');
    params.caseStatus = filters.caseStatus;
    if (!allDims.some((k) => DIM_MAP[k].requires_join?.some((j) => j.includes('fir_details')))) {
      joins.add('fir_details fd ON fd.record_id = r.id');
    }
  }

  if (filters.fromDate) {
    whereClauses.push('COALESCE(fd.fir_date, r.record_date) >= :fromDate');
    params.fromDate = filters.fromDate;
    if (!allDims.some((k) => DIM_MAP[k].requires_join?.some((j) => j.includes('fir_details')))) {
      joins.add('fir_details fd ON fd.record_id = r.id');
    }
  }
  if (filters.toDate) {
    whereClauses.push('COALESCE(fd.fir_date, r.record_date) <= :toDate');
    params.toDate = filters.toDate;
    if (!allDims.some((k) => DIM_MAP[k].requires_join?.some((j) => j.includes('fir_details')))) {
      joins.add('fir_details fd ON fd.record_id = r.id');
    }
  }

  // 5. Crime category filter — authoritative source is ref.local_heads.crime_category
  //    only (HEINOUS / NON_HEINOUS / OTHER). No second hardcoded canonical_code list.
  //    Dual join so ARREST records resolve their own head.
  if (filters.crimeCategory && filters.crimeCategory !== 'ALL') {
    joins.add('fir_details fd ON fd.record_id = r.id');
    joins.add('arrest_details ad ON ad.record_id = r.id');
    joins.add('ref.local_heads lh ON lh.local_head_cd = COALESCE(fd.local_head_id, ad.local_head_id)');
    whereClauses.push('lh.crime_category = :crimeCategory');
    params.crimeCategory = filters.crimeCategory;
  }

  // 6. Act classification filter — MAJOR vs SLL from the seeded ref.act_classification
  //    map (see migration 20260904000001). No runtime ILIKE, no missing columns.
  if (filters.actCategory && filters.actCategory !== 'ALL') {
    joins.add('record_offences ro ON ro.record_id = r.id AND ro.is_primary = true');
    joins.add('ref.act_classification acl ON acl.act_cd = ro.act_id');
    whereClauses.push('COALESCE(acl.class, :sllDefault) = :actCategory');
    params.sllDefault = 'SLL';
    params.actCategory = filters.actCategory;
  }

  const joinClause = [...joins]
    .map((j) => (j.startsWith('LEFT') ? j : `LEFT JOIN ${j}`))
    .join('\n    ');

  const sql = `
    SELECT ${[...selectDims, selectMeasure].join(', ')}
    FROM records r
    ${joinClause}
    WHERE ${whereClauses.join(' AND ')}
    GROUP BY ${allDims.map((_, i) => `dim_${i}`).join(', ')}
    LIMIT ${MAX_ROWS + 1}
  `;

  let flatRows;
  try {
    const res = await db.raw(sql, params);
    flatRows = res.rows || res;
  } catch (err) {
    logger.error('[pivot-engine] Query execution failed', { sql, err: err.message });
    throw new Error(`Report generation failed: ${err.message}`);
  }

  const warnings = [];
  if (flatRows.length > MAX_ROWS) {
    warnings.push(`Result truncated at ${MAX_ROWS} rows. Please narrow your date range or scope filters.`);
    flatRows = flatRows.slice(0, MAX_ROWS);
  }

  // 7. Pivot flat rows into 2D grid matrix
  return pivotFlatRows(flatRows, rows.length, columns.length, warnings);
}

function runSingleSummary({ measureDef, filters, scopeType, scopeId }) {
  const joins = new Set();
  (measureDef.requires_join ?? []).forEach((j) => joins.add(j));

  const whereClauses = ["r.current_status <> 'DRAFT'"];
  const params = {};

  if (scopeType === 'PS' && scopeId) {
    whereClauses.push('r.ps_id = :scopeId');
    params.scopeId = scopeId;
  } else if (scopeType === 'SUB_DIV' && scopeId) {
    whereClauses.push('r.sub_div_id = :scopeId');
    params.scopeId = scopeId;
  } else if (scopeType === 'DISTRICT' && scopeId) {
    whereClauses.push('r.district_id = :scopeId');
    params.scopeId = scopeId;
  }

  const sql = `
    SELECT ${measureDef.sql_expr} AS measure_val
    FROM records r
    ${[...joins].map((j) => (j.startsWith('LEFT') ? j : `LEFT JOIN ${j}`)).join('\n    ')}
    WHERE ${whereClauses.join(' AND ')}
  `;

  return db.raw(sql, params).then((res) => {
    const val = Number((res.rows || res)[0]?.measure_val ?? 0);
    return {
      rowHeaders: [{ key: 'Total', values: ['Total'] }],
      columnHeaders: [{ key: 'Summary', values: ['Summary'] }],
      cells: [[val]],
      rowTotals: [val],
      columnTotals: [val],
      grandTotals: [val],
      warnings: [],
    };
  });
}

function pivotFlatRows(flatRows, numRowDims, numColDims, warnings) {
  const rowMap = new Map();
  const colMap = new Map();
  const cellMatrix = new Map();

  for (const r of flatRows) {
    const rowVals = [];
    for (let i = 0; i < numRowDims; i++) {
      rowVals.push(formatLabel(String(r[`dim_${i}`] ?? 'N/A')));
    }
    const rowKey = rowVals.join(' | ');

    const colVals = [];
    for (let j = 0; j < numColDims; j++) {
      colVals.push(formatLabel(String(r[`dim_${numRowDims + j}`] ?? 'N/A')));
    }
    const colKey = colVals.join(' | ');

    const val = Number(r.measure_val ?? 0);

    if (!rowMap.has(rowKey)) rowMap.set(rowKey, rowVals);
    if (!colMap.has(colKey)) colMap.set(colKey, colVals);

    const matrixKey = `${rowKey}:::${colKey}`;
    cellMatrix.set(matrixKey, (cellMatrix.get(matrixKey) ?? 0) + val);
  }

  const rowHeaders = Array.from(rowMap.entries()).map(([k, v]) => ({ key: k, values: v }));
  const columnHeaders = Array.from(colMap.entries()).map(([k, v]) => ({ key: k, values: v }));

  const cells = rowHeaders.map((rh) => {
    return columnHeaders.map((ch) => {
      const mk = `${rh.key}:::${ch.key}`;
      return cellMatrix.get(mk) ?? 0;
    });
  });

  const rowTotals = cells.map((row) => row.reduce((a, b) => a + b, 0));
  const grandTotals = columnHeaders.map((_, ci) => cells.reduce((sum, r) => sum + r[ci], 0));

  return {
    rowHeaders,
    columnHeaders,
    cells,
    rowTotals,
    grandTotals,
    warnings,
  };
}

export function getCatalogue() {
  return fieldsCatalogue;
}
