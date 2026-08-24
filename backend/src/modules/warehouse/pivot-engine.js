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

  // 5. Pivot flat rows into 2D grid matrix
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
      columnHeaders: [{ key: 'Total', values: ['Total'] }],
      cells: [[val]],
      rowTotals: [val],
      grandTotals: [val],
      warnings: [],
    };
  });
}

function pivotFlatRows(flatRows, rowDimCount, colDimCount, warnings) {
  const rowKeyOf = (r) =>
    rowDimCount > 0
      ? Array.from({ length: rowDimCount }, (_, i) => r[`dim_${i}`] ?? 'N/A').join(' | ')
      : 'Total';

  const colKeyOf = (r) =>
    colDimCount > 0
      ? Array.from({ length: colDimCount }, (_, i) => r[`dim_${rowDimCount + i}`] ?? 'N/A').join(' | ')
      : 'Total';

  const rowHeaderMap = new Map();
  const colHeaderMap = new Map();
  const cellMap = new Map();

  for (const r of flatRows) {
    const rk = rowKeyOf(r);
    const ck = colKeyOf(r);

    if (!rowHeaderMap.has(rk)) {
      rowHeaderMap.set(
        rk,
        rowDimCount > 0 ? Array.from({ length: rowDimCount }, (_, i) => r[`dim_${i}`] ?? 'N/A') : ['Total']
      );
    }

    if (!colHeaderMap.has(ck)) {
      colHeaderMap.set(
        ck,
        colDimCount > 0 ? Array.from({ length: colDimCount }, (_, i) => r[`dim_${rowDimCount + i}`] ?? 'N/A') : ['Total']
      );
    }

    cellMap.set(`${rk}::${ck}`, Number(r.measure_val ?? 0));
  }

  // Handle empty result set
  if (rowHeaderMap.size === 0) {
    rowHeaderMap.set('No Data', ['No Data']);
  }
  if (colHeaderMap.size === 0) {
    colHeaderMap.set('Total', ['Total']);
  }

  const rowHeaders = [...rowHeaderMap.entries()].map(([k, v]) => ({ key: k, values: v }));
  const columnHeaders = [...colHeaderMap.entries()].map(([k, v]) => ({ key: k, values: v }));

  const cells = rowHeaders.map((rh) =>
    columnHeaders.map((ch) => cellMap.get(`${rh.key}::${ch.key}`) ?? 0)
  );

  const rowTotals = cells.map((row) => row.reduce((a, b) => a + b, 0));
  const grandTotals = columnHeaders.map((_, ci) => cells.reduce((sum, row) => sum + row[ci], 0));

  return { rowHeaders, columnHeaders, cells, rowTotals, grandTotals, warnings };
}

export function getCatalogue() {
  return fieldsCatalogue;
}
