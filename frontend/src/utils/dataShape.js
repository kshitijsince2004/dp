/**
 * Shared API / state data-shape normalizers.
 * Prefer these at queryFn / setState boundaries so render code can assume stable shapes.
 */

/** @returns {any[]} */
export function asArray(value) {
  return Array.isArray(value) ? value : [];
}

/**
 * Records list polymorphism: live `{ cases }`, SHO `{ queue }`, mock bare array.
 * @returns {any[]}
 */
export function asRecordsList(payload) {
  if (Array.isArray(payload)) return payload;
  if (!payload || typeof payload !== 'object') return [];
  if (Array.isArray(payload.cases)) return payload.cases;
  if (Array.isArray(payload.queue)) return payload.queue;
  if (Array.isArray(payload.records)) return payload.records;
  return [];
}

/**
 * Hierarchy nodes: `{ nodes }` or bare array.
 * @returns {any[]}
 */
export function asNodesList(payload) {
  if (Array.isArray(payload)) return payload;
  if (!payload || typeof payload !== 'object') return [];
  if (Array.isArray(payload.nodes)) return payload.nodes;
  return [];
}

/**
 * Audit logs: `{ logs }` or bare array.
 * @returns {any[]}
 */
export function asLogsList(payload) {
  if (Array.isArray(payload)) return payload;
  if (!payload || typeof payload !== 'object') return [];
  if (Array.isArray(payload.logs)) return payload.logs;
  return [];
}

const EMPTY_MATRIX = Object.freeze({ columns: [], rows: [] });

/**
 * Crime-head matrix: `{ period?, columns, rows }`.
 * Truthy incomplete objects (e.g. mock fallthrough) are coerced to empty arrays.
 */
export function asCrimeHeadMatrix(value) {
  if (!value || typeof value !== 'object' || Array.isArray(value)) {
    return { columns: [], rows: [] };
  }
  return {
    period: value.period,
    columns: asArray(value.columns),
    rows: asArray(value.rows),
  };
}

export function emptyCrimeHeadMatrix() {
  return { columns: [], rows: [] };
}

/** Natural-language search result graph */
export function asSearchResults(value) {
  const empty = {
    totals: { total: 0, structured: 0, free_text: 0, low_confidence: 0 },
    results: { structured_matches: [], free_text_matches: [] },
  };
  if (!value || typeof value !== 'object') return empty;
  const totals = value.totals && typeof value.totals === 'object' ? value.totals : {};
  const results = value.results && typeof value.results === 'object' ? value.results : {};
  return {
    ...value,
    totals: {
      total: Number(totals.total) || 0,
      structured: Number(totals.structured) || 0,
      free_text: Number(totals.free_text) || 0,
      low_confidence: Number(totals.low_confidence) || 0,
    },
    results: {
      ...results,
      structured_matches: asArray(results.structured_matches),
      free_text_matches: asArray(results.free_text_matches),
    },
  };
}

/** Record trace panel graph */
export function asTraceData(value) {
  if (!value || typeof value !== 'object') {
    return { record: {}, contributions: [] };
  }
  return {
    ...value,
    record: value.record && typeof value.record === 'object' ? value.record : {},
    contributions: asArray(value.contributions),
  };
}

/** Pivot report payload */
export function asPivotData(value) {
  if (!value || typeof value !== 'object') {
    return {
      cells: [],
      rowTotals: [],
      colTotals: [],
      grandTotals: [],
      rowHeaders: [],
      columnHeaders: [],
      colHeaders: [],
      grandTotal: 0,
      warnings: [],
    };
  }
  const normalizeHeader = (h) => {
    if (!h || typeof h !== 'object') return h;
    return { ...h, values: asArray(h.values) };
  };
  return {
    ...value,
    cells: asArray(value.cells).map((row) => asArray(row)),
    rowTotals: asArray(value.rowTotals),
    colTotals: asArray(value.colTotals),
    grandTotals: asArray(value.grandTotals ?? value.colTotals),
    rowHeaders: asArray(value.rowHeaders).map(normalizeHeader),
    columnHeaders: asArray(value.columnHeaders ?? value.colHeaders).map(normalizeHeader),
    colHeaders: asArray(value.colHeaders ?? value.columnHeaders).map(normalizeHeader),
    grandTotal: value.grandTotal ?? 0,
    warnings: asArray(value.warnings),
  };
}

export { EMPTY_MATRIX };
