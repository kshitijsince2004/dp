import ExcelJS from 'exceljs';
import { resolveScope } from '../shared/scope.js';
import { buildDateWindows } from '../shared/date-windows.js';
import { fetchDistrictCaseCounts, fetchDistrictArrestCounts, fetchDistrictPcrCallCounts } from '../shared/count-fetcher.js';
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

export async function generateDistrictDiary(districtNodeId, cutoffDate, selectedSheets = []) {
  const scope = await resolveScope(districtNodeId || 'DIST_NDD');
  const dates = buildDateWindows(cutoffDate);
  const psIds = scope.children_ids || [];

  // Fetch counts & detail records
  const dayCaseCounts = await fetchDistrictCaseCounts({ psIds, fromDate: dates.cutoff, toDate: dates.cutoff });
  const efirCounts = await fetchDistrictCaseCounts({ psIds, fromDate: dates.cutoff, toDate: dates.cutoff, sourceSystems: ['E_THEFT', 'E_MVT', 'NCRP'] });
  const pcrCounts = await fetchDistrictPcrCallCounts({ psIds, fromDate: dates.jan1Curr, toDate: dates.cutoff });
  const subDivMap = await fetchPsSubDivisionMap(psIds);

  const accidentList = await fetchAccidentCases({ psIds, cutoffDate: dates.cutoff });
  const heinousList = await fetchHeinousBriefFacts({ psIds, cutoffDate: dates.cutoff });
  const fullFirList = await fetchFullFirListing({ psIds, cutoffDate: dates.cutoff });
  const firArrestsList = await fetchArrestsByCaseType({ psIds, cutoffDate: dates.cutoff, caseType: 'FIR' });
  const kalArrestsList = await fetchArrestsByCaseType({ psIds, cutoffDate: dates.cutoff, caseType: 'KALANDAR' });

  const morningData = await fetchMorningData(psIds, dates);

  const psDayCounts = {};
  dayCaseCounts.forEach(r => {
    if (!psDayCounts[r.ps_id]) psDayCounts[r.ps_id] = {};
    psDayCounts[r.ps_id][r.local_head_id] = Number(r.cnt || 0);
  });

  const calcData = {
    cutoff_date: dates.cutoff,
    yearNum: dates.yearNum,
    psDayCounts,
    pcrCounts,
    subDivMap,
    accidentList,
    heinousList,
    fullFirList,
    firArrestsList,
    kalArrestsList,
    morningData
  };

  const workbook = new ExcelJS.Workbook();
  workbook.creator = 'PHAROS Intelligence System';
  workbook.created = new Date();

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

  const buffer = await workbook.xlsx.writeBuffer();
  return buffer;
}

async function fetchMorningData(psIds, dates) {
  const headMap = {
    MV_THEFT: 16,
    SNATCHING: 9,
    BURGLARY: 12,
    HOUSE_THEFT: 18,
    OTHER_THEFT: 19
  };

  const morningData = {};
  for (const [secCode, headId] of Object.entries(headMap)) {
    morningData[secCode] = {};

    const [dayY1, dayY1Wo, dayY, dayYWo, uptoY1, uptoY1Wo, uptoY, uptoYWo, uptoLastDayY1] = await Promise.all([
      fetchDistrictCaseCounts({ psIds, fromDate: dates.yesterdayLY || dates.cutoffLY, toDate: dates.yesterdayLY || dates.cutoffLY }),
      fetchDistrictCaseCounts({ psIds, fromDate: dates.yesterdayLY || dates.cutoffLY, toDate: dates.yesterdayLY || dates.cutoffLY, isWorkedOut: true }),
      fetchDistrictCaseCounts({ psIds, fromDate: dates.cutoff, toDate: dates.cutoff }),
      fetchDistrictCaseCounts({ psIds, fromDate: dates.cutoff, toDate: dates.cutoff, isWorkedOut: true }),
      fetchDistrictCaseCounts({ psIds, fromDate: dates.jan1LY, toDate: dates.cutoffLY }),
      fetchDistrictCaseCounts({ psIds, fromDate: dates.jan1LY, toDate: dates.cutoffLY, isWorkedOut: true }),
      fetchDistrictCaseCounts({ psIds, fromDate: dates.jan1Curr, toDate: dates.cutoff }),
      fetchDistrictCaseCounts({ psIds, fromDate: dates.jan1Curr, toDate: dates.cutoff, isWorkedOut: true }),
      fetchDistrictCaseCounts({ psIds, fromDate: dates.jan1LY, toDate: dates.yesterdayLY || dates.cutoffLY })
    ]);

    psIds.forEach(psId => {
      morningData[secCode][psId] = {
        dayY1: Number(dayY1.find(r => r.ps_id === psId && Number(r.local_head_id) === headId)?.cnt || 0),
        dayY1Wo: Number(dayY1Wo.find(r => r.ps_id === psId && Number(r.local_head_id) === headId)?.cnt || 0),
        dayY: Number(dayY.find(r => r.ps_id === psId && Number(r.local_head_id) === headId)?.cnt || 0),
        dayYWo: Number(dayYWo.find(r => r.ps_id === psId && Number(r.local_head_id) === headId)?.cnt || 0),
        uptoY1: Number(uptoY1.find(r => r.ps_id === psId && Number(r.local_head_id) === headId)?.cnt || 0),
        uptoY1Wo: Number(uptoY1Wo.find(r => r.ps_id === psId && Number(r.local_head_id) === headId)?.cnt || 0),
        uptoY: Number(uptoY.find(r => r.ps_id === psId && Number(r.local_head_id) === headId)?.cnt || 0),
        uptoYWo: Number(uptoYWo.find(r => r.ps_id === psId && Number(r.local_head_id) === headId)?.cnt || 0),
        uptoLastDayY1: Number(uptoLastDayY1.find(r => r.ps_id === psId && Number(r.local_head_id) === headId)?.cnt || 0)
      };
    });
  }

  return morningData;
}
