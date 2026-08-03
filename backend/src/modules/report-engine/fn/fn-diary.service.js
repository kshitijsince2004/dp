import ExcelJS from 'exceljs';
import { resolveScope } from '../shared/scope.js';
import { buildFnDateWindows } from '../shared/date-windows.js';
import {
  fetchFnCaseCounts,
  fetchFnArrestCounts,
  fetchFnDisposedCounts,
  fetchPendingCasesByAge,
  fetchFnCasesByAct,
  fetchFnMissingCounts,
} from './fn-count-fetcher.js';

import { renderStat01 } from './renderers/stat-01-cases-reported.js';
import { renderStat02 } from './renderers/stat-02-worked-out.js';
import { renderStat03 } from './renderers/stat-03-act-cases.js';
import { renderStat05 } from './renderers/stat-05-burglary-mo.js';
import { renderStat07 } from './renderers/stat-07-theft-recovery.js';
import { renderStat08 } from './renderers/stat-08-vehicle-theft.js';
import { renderStat09 } from './renderers/stat-09-property-seized.js';
import { renderStat11 } from './renderers/stat-11-victims.js';
import { renderStat13 } from './renderers/stat-13-kidnapping.js';
import { renderStat14 } from './renderers/stat-14-preventive.js';
import { renderStat19 } from './renderers/stat-19-missing.js';
import { renderStat24 } from './renderers/stat-24-domestic-violence.js';
import { renderStat36 } from './renderers/stat-36-disposal-balance.js';
import { renderStat37 } from './renderers/stat-37-pending-age.js';
import { renderStat40 } from './renderers/stat-40-court-stub.js';

/**
 * Aggregate count rows into a { canonical_code → { fnY, fnY1, uptoY, uptoY1 } } map.
 * @param {Array} rows - DB result rows with { canonical_code, cnt }
 * @param {Object} target - the distByCode map to populate
 * @param {string} field - which field to accumulate into ('fnY' | 'fnY1' | 'uptoY' | 'uptoY1')
 */
function accumulate(rows, target, field) {
  for (const row of rows) {
    const code = row.canonical_code || '__UNKNOWN__';
    if (!target[code]) target[code] = { fnY: 0, fnY1: 0, uptoY: 0, uptoY1: 0 };
    target[code][field] += Number(row.cnt || 0);
  }
}

/**
 * Build a distByCode map from a single set of rows (for disposal sub-maps).
 */
function buildByCode(rows, field) {
  const map = {};
  accumulate(rows, map, field);
  return map;
}

export async function generateFnDiary(districtNodeId, fnEndDate, selectedSheets = []) {
  const scope = await resolveScope(districtNodeId || 'DIST_NDD');
  const psIds = scope.children_ids || [];
  const w = buildFnDateWindows(fnEndDate);
  const { fnEnd, fnStart, fnEndLY, fnStartLY, jan1Curr, jan1LY, yearNum } = w;

  // ─── Parallel fetches for the 4 counting windows ───────────────────────────
  const [
    fnYCases,  fnY1Cases,  uptoYCases,  uptoY1Cases,
    fnYWo,     fnY1Wo,     uptoYWo,     uptoY1Wo,
    fnYCan,    fnY1Can,    uptoYCan,    uptoY1Can,
    fnYUntr,   fnY1Untr,
    fnYArr,    fnY1Arr,
    pendingRows,
    actRowsY,  actRowsY1,
    missingRowsY, missingRowsY1,
  ] = await Promise.all([
    // Case registrations (4 windows)
    fetchFnCaseCounts({ psIds, fromDate: fnStart,   toDate: fnEnd }),
    fetchFnCaseCounts({ psIds, fromDate: fnStartLY, toDate: fnEndLY }),
    fetchFnCaseCounts({ psIds, fromDate: jan1Curr,  toDate: fnEnd }),
    fetchFnCaseCounts({ psIds, fromDate: jan1LY,    toDate: fnEndLY }),
    // Worked-out (disposed as solved) — by worked_out_date in FN window
    fetchFnDisposedCounts({ psIds, fromDate: fnStart,   toDate: fnEnd,   disposalType: 'Challan' }),
    fetchFnDisposedCounts({ psIds, fromDate: fnStartLY, toDate: fnEndLY, disposalType: 'Challan' }),
    fetchFnDisposedCounts({ psIds, fromDate: jan1Curr,  toDate: fnEnd,   disposalType: 'Challan' }),
    fetchFnDisposedCounts({ psIds, fromDate: jan1LY,    toDate: fnEndLY, disposalType: 'Challan' }),
    // Cancelled
    fetchFnDisposedCounts({ psIds, fromDate: fnStart,   toDate: fnEnd,   disposalType: 'Cancel' }),
    fetchFnDisposedCounts({ psIds, fromDate: fnStartLY, toDate: fnEndLY, disposalType: 'Cancel' }),
    fetchFnDisposedCounts({ psIds, fromDate: jan1Curr,  toDate: fnEnd,   disposalType: 'Cancel' }),
    fetchFnDisposedCounts({ psIds, fromDate: jan1LY,    toDate: fnEndLY, disposalType: 'Cancel' }),
    // Untraced
    fetchFnDisposedCounts({ psIds, fromDate: fnStart,   toDate: fnEnd,   disposalType: 'Untrace' }),
    fetchFnDisposedCounts({ psIds, fromDate: fnStartLY, toDate: fnEndLY, disposalType: 'Untrace' }),
    // Arrests (FN only — upto date arrests tracked separately by STAT)
    fetchFnArrestCounts({ psIds, fromDate: fnStart,   toDate: fnEnd }),
    fetchFnArrestCounts({ psIds, fromDate: fnStartLY, toDate: fnEndLY }),
    // Pending cases for age-bucket analysis
    fetchPendingCasesByAge({ psIds, fnEnd }),
    // Cases by primary act for STAT 3/4
    fetchFnCasesByAct({ psIds, fromDate: fnStart,   toDate: fnEnd }),
    fetchFnCasesByAct({ psIds, fromDate: fnStartLY, toDate: fnEndLY }),
    // Missing persons
    fetchFnMissingCounts({ psIds, fromDate: fnStart,   toDate: fnEnd }),
    fetchFnMissingCounts({ psIds, fromDate: fnStartLY, toDate: fnEndLY }),
  ]);

  // ─── Build primary distByCode (case registrations) ─────────────────────────
  const distByCode = {};
  accumulate(fnYCases,   distByCode, 'fnY');
  accumulate(fnY1Cases,  distByCode, 'fnY1');
  accumulate(uptoYCases, distByCode, 'uptoY');
  accumulate(uptoY1Cases,distByCode, 'uptoY1');

  // ─── Disposal sub-maps ────────────────────────────────────────────────────
  const distByCodeWo   = buildByCode(fnYWo,   'fnY');
  accumulate(fnY1Wo,   distByCodeWo,   'fnY1');
  accumulate(uptoYWo,  distByCodeWo,   'uptoY');
  accumulate(uptoY1Wo, distByCodeWo,   'uptoY1');

  const distByCodeCan  = buildByCode(fnYCan,  'fnY');
  accumulate(fnY1Can,  distByCodeCan,  'fnY1');
  accumulate(uptoYCan, distByCodeCan,  'uptoY');
  accumulate(uptoY1Can,distByCodeCan,  'uptoY1');

  const distByCodeUntr = buildByCode(fnYUntr, 'fnY');
  accumulate(fnY1Untr, distByCodeUntr, 'fnY1');

  const distByCodeArr  = buildByCode(fnYArr,  'fnY');
  accumulate(fnY1Arr,  distByCodeArr,  'fnY1');

  const calcData = {
    distByCode, distByCodeWo, distByCodeCan, distByCodeUntr, distByCodeArr,
    pendingRows,
    actRowsY, actRowsY1,
    missingRowsY, missingRowsY1,
    fnEnd, fnStart, fnEndLY, fnStartLY, jan1Curr, jan1LY, yearNum,
  };

  // ─── Build workbook ────────────────────────────────────────────────────────
  const workbook = new ExcelJS.Workbook();
  workbook.creator = 'PHAROS';
  workbook.created = new Date();

  const want = new Set(selectedSheets.map(s => s.toUpperCase()));
  const all  = !selectedSheets.length;

  const sheets = [
    { key: 'STAT01', fn: renderStat01 },
    { key: 'STAT02', fn: renderStat02 },
    { key: 'STAT03', fn: renderStat03 },
    { key: 'STAT05', fn: renderStat05 },
    { key: 'STAT07', fn: renderStat07 },
    { key: 'STAT08', fn: renderStat08 },
    { key: 'STAT09', fn: renderStat09 },
    { key: 'STAT11', fn: renderStat11 },
    { key: 'STAT13', fn: renderStat13 },
    { key: 'STAT14', fn: renderStat14 },
    { key: 'STAT19', fn: renderStat19 },
    { key: 'STAT24', fn: renderStat24 },
    { key: 'STAT36', fn: renderStat36 },
    { key: 'STAT37', fn: renderStat37 },
    { key: 'STAT40', fn: renderStat40 },
  ];

  for (const { key, fn } of sheets) {
    if (all || want.has(key)) fn(workbook, scope, calcData);
  }

  return await workbook.xlsx.writeBuffer();
}
