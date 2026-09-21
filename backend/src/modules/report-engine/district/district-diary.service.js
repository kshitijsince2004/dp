import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import ExcelJS from 'exceljs';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

import db from '../../../config/db.js';
import { resolveScope } from '../shared/scope.js';
import { buildDateWindows } from '../shared/date-windows.js';
import { fetchDistrictCaseCounts, fetchDistrictPcrCallCounts } from '../shared/count-fetcher.js';
import {
  fetchAccidentCases,
  fetchHeinousBriefFacts,
  fetchFullFirListing,
  fetchArrestsByCaseType,
  fetchPsSubDivisionMap
} from './detail-fetcher.js';

import { renderRcellDD } from './renderers/rcell-dd.js';
import { renderRcellComp } from './renderers/rcell-comp.js';
import { renderMorningDiary } from './renderers/morning-diary.js';
import { renderDailyChart } from './renderers/daily-chart.js';
import { renderDCsPChart } from './renderers/dcsp-chart.js';
import { renderG22Daily } from './renderers/g22-daily.js';
import { renderAccident } from './renderers/accident.js';
import { renderEfirMatrix } from './renderers/efir-matrix.js';
import { renderN123Register } from './renderers/n123-register.js';
import { renderD1Resolution } from './renderers/d1-resolution.js';
import { renderD2Heinous } from './renderers/d2-heinous.js';
import { renderD8FirListing } from './renderers/d8-fir-listing.js';
import { renderD9FirArrests } from './renderers/d9-fir-arrests.js';
import { renderD9KalArrests } from './renderers/d9-kal-arrests.js';
import { renderPcrCalls } from './renderers/pcr-calls.js';
import { renderD10_66dp } from './renderers/d10-66dp.js';
import { renderD13_66dp } from './renderers/d13-66dp.js';
import { renderDistrictDiaryHtml, convertHtmlToPdf } from '../shared/report-html-renderer.js';

export async function generateDistrictDiary(districtNodeId, cutoffDate, selectedSheets = [], format = 'EXCEL') {
  const scope = await resolveScope(districtNodeId || 'DIST_NDD');
  const dates = buildDateWindows(cutoffDate);
  const psIds = scope.children_ids || [];

  // Find the most recent date ≤ cutoff that has records for this district's PS.
  // This ensures day-level sheets (Rcell-DD, G22, D8, D9…) always show real data
  // even when the selected date has no records for this specific district.
  const effectiveCutoffRow = psIds.length > 0
    ? await db('records')
        .whereIn('ps_id', psIds)
        .where('record_type', 'CASE')
        .where('record_date', '<=', dates.cutoff)
        .max('record_date as max_d')
        .first()
    : null;
  const effectiveCutoff = effectiveCutoffRow?.max_d
    ? String(effectiveCutoffRow.max_d).slice(0, 10)
    : dates.cutoff;

  const [
    dayCaseCounts,
    dayY1Counts,
    dayYWoCounts,
    dayY1WoCounts,
    uptoYCounts,
    uptoY1Counts,
    uptoYWoCounts,
    uptoY1WoCounts,
    efirCounts,
    pcrCounts,
    subDivMap,
    uptoLastDayY1Counts,
  ] = await Promise.all([
    fetchDistrictCaseCounts({ psIds, fromDate: effectiveCutoff, toDate: effectiveCutoff }),
    fetchDistrictCaseCounts({ psIds, fromDate: dates.cutoffLY,  toDate: dates.cutoffLY }),
    fetchDistrictCaseCounts({ psIds, fromDate: effectiveCutoff, toDate: effectiveCutoff, isWorkedOut: true }),
    fetchDistrictCaseCounts({ psIds, fromDate: dates.cutoffLY,  toDate: dates.cutoffLY, isWorkedOut: true }),
    fetchDistrictCaseCounts({ psIds, fromDate: dates.jan1Curr,  toDate: effectiveCutoff }),
    fetchDistrictCaseCounts({ psIds, fromDate: dates.jan1LY,    toDate: dates.cutoffLY }),
    fetchDistrictCaseCounts({ psIds, fromDate: dates.jan1Curr,  toDate: effectiveCutoff, isWorkedOut: true }),
    fetchDistrictCaseCounts({ psIds, fromDate: dates.jan1LY,    toDate: dates.cutoffLY, isWorkedOut: true }),
    fetchDistrictCaseCounts({ psIds, fromDate: effectiveCutoff, toDate: effectiveCutoff, sourceSystems: ['E_THEFT', 'E_MVT', 'NCRP'] }),
    fetchDistrictPcrCallCounts({ psIds, fromDate: dates.jan1Curr, toDate: dates.cutoff }),
    fetchPsSubDivisionMap(psIds),
    fetchDistrictCaseCounts({ psIds, fromDate: dates.jan1LY, toDate: dates.yesterdayLY || dates.cutoffLY }),
  ]);

  const [accidentList, heinousList, fullFirList, firArrestsList, kalArrestsList] = await Promise.all([
    fetchAccidentCases({ psIds, cutoffDate: effectiveCutoff }),
    fetchHeinousBriefFacts({ psIds, cutoffDate: effectiveCutoff }),
    fetchFullFirListing({ psIds, cutoffDate: effectiveCutoff }),
    fetchArrestsByCaseType({ psIds, cutoffDate: effectiveCutoff, caseType: 'FIR' }),
    fetchArrestsByCaseType({ psIds, cutoffDate: effectiveCutoff, caseType: 'KALANDAR' }),
  ]);

  const morningData = buildMorningData(psIds, {
    dayY1: dayY1Counts,
    dayY1Wo: dayY1WoCounts,
    dayY: dayCaseCounts,
    dayYWo: dayYWoCounts,
    uptoY1: uptoY1Counts,
    uptoY1Wo: uptoY1WoCounts,
    uptoY: uptoYCounts,
    uptoYWo: uptoYWoCounts,
    uptoLastDayY1: uptoLastDayY1Counts,
  });

  // Aggregate rows into a map keyed by canonical_code (district totals)
  function distSumByCode(rows) {
    const m = {};
    rows.forEach(r => {
      const c = r.canonical_code || 'OTHER';
      m[c] = (m[c] || 0) + Number(r.cnt || 0);
    });
    return m;
  }
  // Aggregate rows into a map keyed by ps_id → canonical_code (per-PS)
  function psSumByCode(rows) {
    const m = {};
    rows.forEach(r => {
      if (!m[r.ps_id]) m[r.ps_id] = {};
      const c = r.canonical_code || 'OTHER';
      m[r.ps_id][c] = (m[r.ps_id][c] || 0) + Number(r.cnt || 0);
    });
    return m;
  }

  const _dDayY    = distSumByCode(dayCaseCounts);
  const _dDayY1   = distSumByCode(dayY1Counts);
  const _dDayYWo  = distSumByCode(dayYWoCounts);
  const _dDayY1Wo = distSumByCode(dayY1WoCounts);
  const _dUptoY   = distSumByCode(uptoYCounts);
  const _dUptoY1  = distSumByCode(uptoY1Counts);
  const _dUptoYWo = distSumByCode(uptoYWoCounts);
  const _dUptoY1Wo= distSumByCode(uptoY1WoCounts);

  // distByCode[canonical_code] = { dayY, dayY1, dayYWo, dayY1Wo, repY, repY1, woY, woY1 }
  const allDistCodes = new Set([
    ...Object.keys(_dUptoY), ...Object.keys(_dUptoY1),
    ...Object.keys(_dDayY), ...Object.keys(_dDayY1),
  ]);
  const distByCode = {};
  allDistCodes.forEach(c => {
    distByCode[c] = {
      dayY:   _dDayY[c]    || 0, dayY1:   _dDayY1[c]   || 0,
      dayYWo: _dDayYWo[c]  || 0, dayY1Wo: _dDayY1Wo[c] || 0,
      repY:   _dUptoY[c]   || 0, repY1:   _dUptoY1[c]  || 0,
      woY:    _dUptoYWo[c] || 0, woY1:    _dUptoY1Wo[c]|| 0,
    };
  });

  const psByCode    = psSumByCode(uptoYCounts);
  const psByCodeY1  = psSumByCode(uptoY1Counts);
  const psByCodeWo  = psSumByCode(uptoYWoCounts);
  const psByCodeY1Wo= psSumByCode(uptoY1WoCounts);
  const psEfirByCode = psSumByCode(efirCounts);
  // Per-PS canonical_code counts for TODAY only (used by rcell-dd)
  const psDayByCode = psSumByCode(dayCaseCounts);
  // Also index eFIR by local_head_id for sub-head matrices (efir-matrix sheet)
  const psEfirById = {};
  efirCounts.forEach(r => {
    if (!psEfirById[r.ps_id]) psEfirById[r.ps_id] = {};
    const hid = r.local_head_id;
    psEfirById[r.ps_id][hid] = (psEfirById[r.ps_id][hid] || 0) + Number(r.cnt || 0);
  });

  const calcData = {
    cutoff_date: effectiveCutoff,
    yearNum: dates.yearNum,
    pcrCounts: Object.fromEntries(pcrCounts.map(r => [r.ps_id, Number(r.cnt || 0)])),
    subDivMap,
    accidentList,
    heinousList,
    fullFirList,
    firArrestsList,
    kalArrestsList,
    morningData,
    distByCode,
    psByCode,
    psByCodeY1,
    psByCodeWo,
    psByCodeY1Wo,
    psEfirByCode,
    psEfirById,
    psDayByCode,
  };

  const templatePath = path.resolve(__dirname, 'District diary.xlsx');
  const workbook = new ExcelJS.Workbook();
  if (fs.existsSync(templatePath)) {
    await workbook.xlsx.readFile(templatePath);
  } else {
    workbook.creator = 'PHAROS Intelligence System';
    workbook.created = new Date();
  }

  const sheetRenderers = [
    { key: 'A1', name: 'Rcell DD', fn: renderRcellDD },
    { key: 'A2', name: 'R Cell- Distt Crime', fn: renderRcellComp },
    { key: 'A3', name: 'Morning-Daily Diary', fn: renderMorningDiary },
    { key: 'A4', name: 'Daily Chart, Heinous, IPC', fn: renderDailyChart },
    { key: 'A5', name: 'DCsP- Crime Chart', fn: renderDCsPChart },
    { key: 'A6', name: 'G-22 Daily Crime', fn: renderG22Daily },
    { key: 'A7', name: 'Accident Cases', fn: renderAccident },
    { key: 'B1', name: 'E-FIR', fn: renderEfirMatrix },
    { key: 'B2', name: 'N-1,N-2,N-3', fn: renderN123Register },
    { key: 'B3', name: 'D1,N-1,2,3 Res', fn: renderD1Resolution },
    { key: 'B4', name: 'D-2 Heinous Brief Fact', fn: renderD2Heinous },
    { key: 'B5', name: 'D-8 Brief Facts', fn: renderD8FirListing },
    { key: 'B6', name: 'D-9 FIR Arrests', fn: renderD9FirArrests },
    { key: 'B7', name: 'D-9 Kal Arrests', fn: renderD9KalArrests },
    { key: 'C1', name: 'Upto PCR calls 25-26', fn: renderPcrCalls },
    { key: 'C2', name: 'D10 Action of 66 DP Act', fn: renderD10_66dp },
    { key: 'C3', name: 'D13 66DP', fn: renderD13_66dp },
  ];

  const keepKeys = new Set(selectedSheets && selectedSheets.length > 0 ? selectedSheets : sheetRenderers.map(s => s.key));

  sheetRenderers.forEach(sr => {
    if (keepKeys.has(sr.key) || keepKeys.has(sr.name)) {
      try {
        sr.fn(workbook, scope, calcData);
      } catch (err) {
        console.error(`[district-diary.service] Error rendering sheet ${sr.name}:`, err);
      }
    }
  });

  if (String(format).toUpperCase() === 'PDF') {
    const html = renderDistrictDiaryHtml(scope, calcData, selectedSheets);
    return await convertHtmlToPdf(html);
  }

  const buffer = await workbook.xlsx.writeBuffer();
  return buffer;
}

function buildMorningData(psIds, counts) {
  const MORNING_CODES = ['MV_THEFT', 'SNATCHING', 'BURGLARY', 'HOUSE_THEFT', 'OTHER_THEFT'];

  const find = (rows, psId, code) =>
    Number((rows || []).find(r => r.ps_id === psId && r.canonical_code === code)?.cnt || 0);

  const morningData = {};
  MORNING_CODES.forEach(code => {
    morningData[code] = {};
    psIds.forEach(psId => {
      morningData[code][psId] = {
        dayY1:        find(counts.dayY1,        psId, code),
        dayY1Wo:      find(counts.dayY1Wo,      psId, code),
        dayY:         find(counts.dayY,         psId, code),
        dayYWo:       find(counts.dayYWo,       psId, code),
        uptoY1:       find(counts.uptoY1,       psId, code),
        uptoY1Wo:     find(counts.uptoY1Wo,     psId, code),
        uptoY:        find(counts.uptoY,        psId, code),
        uptoYWo:      find(counts.uptoYWo,      psId, code),
        uptoLastDayY1:find(counts.uptoLastDayY1,psId, code),
      };
    });
  });

  return morningData;
}
