import fs from 'fs';
import path from 'path';
import db from '../../config/db.js';
import { logger } from '../../utils/logger.js';

// Load reportable fields catalogue
const cataloguePath = path.join(process.cwd(), 'config', 'warehouse', 'reportable-fields.json');
const fieldsCatalogue = JSON.parse(fs.readFileSync(cataloguePath, 'utf8'));

const DIM_MAP = Object.fromEntries(fieldsCatalogue.dimensions.map((d) => [d.key, d]));
const MEASURE_MAP = Object.fromEntries(fieldsCatalogue.measures.map((m) => [m.key, m]));

const MAX_ROWS = 5000;

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

  // 5. Dynamic Crime Head Category Filter (HEINOUS, NON_HEINOUS, ALL)
  if (filters.crimeCategory && filters.crimeCategory !== 'ALL') {
    joins.add('fir_details fd ON fd.record_id = r.id');
    joins.add('ref.local_heads lh ON lh.local_head_cd = fd.local_head_id');
    if (filters.crimeCategory === 'HEINOUS') {
      whereClauses.push("(lh.crime_category = 'HEINOUS' OR lh.canonical_code IN ('MURDER', 'DACOITY', 'ROBBERY', 'RAPE', 'ATT_TO_MURDER', 'RIOT', 'KID_FOR_RANSOM'))");
    } else if (filters.crimeCategory === 'NON_HEINOUS') {
      whereClauses.push("(lh.crime_category = 'NON_HEINOUS' OR (lh.crime_category <> 'HEINOUS' AND lh.canonical_code NOT IN ('MURDER', 'DACOITY', 'ROBBERY', 'RAPE', 'ATT_TO_MURDER', 'RIOT', 'KID_FOR_RANSOM')))");
    }
  }

  // 6. Dynamic Act & Section Category Filter (MAJOR, SLL, ALL)
  if (filters.actCategory && filters.actCategory !== 'ALL') {
    joins.add('record_offences ro ON ro.record_id = r.id AND ro.sort_order = 0');
    joins.add('ref.acts a ON a.act_cd = ro.act_id');
    if (filters.actCategory === 'MAJOR') {
      whereClauses.push("(a.is_major = true OR UPPER(a.act_short) IN ('BNS', 'IPC', 'BNSS', 'CRPC'))");
    } else if (filters.actCategory === 'SLL') {
      whereClauses.push("(a.is_major = false OR UPPER(a.act_short) NOT IN ('BNS', 'IPC', 'BNSS', 'CRPC'))");
    }
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
      rowVals.push(String(r[`dim_${i}`] ?? 'N/A'));
    }
    const rowKey = rowVals.join(' | ');

    const colVals = [];
    for (let j = 0; j < numColDims; j++) {
      colVals.push(String(r[`dim_${numRowDims + j}`] ?? 'N/A'));
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
