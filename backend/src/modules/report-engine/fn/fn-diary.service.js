import ExcelJS from 'exceljs';
import path from 'path';
import fs from 'fs';
import { fileURLToPath } from 'url';
import db from '../../../config/db.js';
import { resolveScope } from '../shared/scope.js';
import { buildFnDateWindows } from '../shared/date-windows.js';
import {
  fetchFnCaseCounts,
  fetchFnArrestCounts,
  fetchFnDisposedCounts,
  fetchPendingCasesByAge,
  fetchFnCasesByAct,
  fetchFnMissingCounts,
  fetchFnOpeningPending,
} from './fn-count-fetcher.js';

import { renderStat01 } from './renderers/stat-01-cases-reported.js';
import { renderStat01A } from './renderers/stat-01a-efir.js';
import { renderStat01B } from './renderers/stat-01b-section-change.js';
import { renderStat02 } from './renderers/stat-02-worked-out.js';
import { renderStat03 } from './renderers/stat-03-act-cases.js';
import { renderStat04 } from './renderers/stat-04-act-worked-out.js';
import { renderStat05 } from './renderers/stat-05-burglary-mo.js';
import { renderStat06 } from './renderers/stat-06-accidents.js';
import { renderStat07 } from './renderers/stat-07-theft-recovery.js';
import { renderStat08 } from './renderers/stat-08-vehicle-theft.js';
import { renderStat09 } from './renderers/stat-09-property-seized.js';
import { renderStat10 } from './renderers/stat-10-other-theft.js';
import { renderStat11 } from './renderers/stat-11-victims.js';
import { renderStat12 } from './renderers/stat-12-organised-crime.js';
import { renderStat13 } from './renderers/stat-13-kidnapping.js';
import { renderStat14Preventive as renderStat14 } from './renderers/stat-14-preventive.js';
import { renderStat15ProclaimedOffenders as renderStat15 } from './renderers/stat-15-proclaimed-offenders.js';
import { renderStat16 } from './renderers/stat-16-excise-ndps.js';
import { renderStat17 } from './renderers/stat-17-arms.js';
import { renderStat18 } from './renderers/stat-18-vehicles-seized.js';
import { renderStat19 } from './renderers/stat-19-missing.js';
import { renderStat20 } from './renderers/stat-20-demographics.js';
import { renderStat21Kalandra as renderStat21 } from './renderers/stat-21-kalandra.js';
import { renderStat22Sec223Bns as renderStat22 } from './renderers/stat-22-sec223-bns.js';
import { renderStat23ScSt as renderStat23 } from './renderers/stat-23-sc-st.js';
import { renderStat24 } from './renderers/stat-24-domestic-violence.js';
import { renderStat25 } from './renderers/stat-25-pocso-only.js';
import { renderStat26 } from './renderers/stat-26-pocso-total.js';
import { renderStat27 } from './renderers/stat-27-children-crime.js';
import { renderStat28 } from './renderers/stat-28-women-crime.js';
import { renderStat29Trafficking as renderStat29 } from './renderers/stat-29-trafficking.js';
import { renderStat30ZeroFir as renderStat30 } from './renderers/stat-30-zero-fir.js';
import { renderStat31SeniorCitizens as renderStat31 } from './renderers/stat-31-senior-citizens.js';
import { renderStat32CyberCrime as renderStat32 } from './renderers/stat-32-cyber-crime.js';
import { renderStat33PropertyStolenRecovered as renderStat33 } from './renderers/stat-33-property-stolen-recovered.js';
import { renderStat34DpAct as renderStat34 } from './renderers/stat-34-dp-act.js';
import { renderStat35PreventiveDetail as renderStat35 } from './renderers/stat-35-preventive-detail.js';
import { renderStat36 } from './renderers/stat-36-disposal-balance.js';
import { renderStat37 } from './renderers/stat-37-pending-age.js';
import { renderStat38 } from './renderers/stat-38-bns-no-arrest.js';
import { renderStat39 } from './renderers/stat-39-lsl-no-arrest.js';
import { renderStat40CourtStub as renderStat40 } from './renderers/stat-40-court-stub.js';
import { renderStat41CourtLsl as renderStat41 } from './renderers/stat-41-court-lsl.js';

const CANONICAL_ALIASES = {
  'ATT_TO_CULPABLE_HOMICIDE_NOT_AMOUNTING_TO_MURDER': 'ATT_TO_CULPABLE_HOMICIDE',
  'CULPABLE_HOMICIDE_NOT_AMOUNTING_TO_MURDER': 'CULPABLE_HOMICIDE',
  'PREPARATION_TO_COMMIT_DACOITY': 'PREP_DACOITY',
  'TRESSPASS': 'HOUSE_TRESPASS',
  'SIMPLE_HURT': 'HURT',
  'GRIEVOUS_HURT': 'HURT',
  'OTHER_BNS': 'OTHER_IPC',
  'MVT': 'MV_THEFT',
  'THEFT': 'OTHER_THEFT',
  'ACID_ATTACK_124_1': 'ACID_ATTACK',
  'ACID_ATTACK_ATTEMPT': 'ACID_ATTACK'
};

function accumulate(rows, target, field) {
  for (const row of rows) {
    const rawCode = row.canonical_code || '__UNKNOWN__';
    const code = CANONICAL_ALIASES[rawCode] || rawCode;

    if (!target[code]) target[code] = { fnY: 0, fnY1: 0, uptoY: 0, uptoY1: 0 };
    target[code][field] += Number(row.cnt || 0);

    if (code !== rawCode) {
      if (!target[rawCode]) target[rawCode] = { fnY: 0, fnY1: 0, uptoY: 0, uptoY1: 0 };
      target[rawCode][field] += Number(row.cnt || 0);
    }
  }
}

function buildByCode(rows, field) {
  const map = {};
  accumulate(rows, map, field);
  return map;
}

export const SHEET_DESCRIPTIONS = {
  STAT_1:  'Fortnightly summary of Bhartiya Nyaya Sanhita (BNS) cases reported by Heinous and Non-Heinous crime heads across current and previous year periods.',
  STAT_1A: 'Statistical record of Online FIRs (e-FIRs) registered for motor vehicle thefts and cyber complaints during the fortnight and year-to-date.',
  STAT_1B: 'Audit of cases where sections of law were added or amended during investigation, tracking section addition and deletion activity.',
  STAT_2:  'Worked-out (solved) BNS cases summary by heinous and non-heinous crime heads during the fortnight and year-to-date.',
  STAT_3:  'Cases registered under Local and Special Laws (L&SL) categorized by specific statutory acts.',
  STAT_4:  'Worked-out (solved) cases under Local and Special Laws (L&SL) categorized by specific statutory acts.',
  STAT_5:  'Modus Operandi analysis of burglary offenses detailing entry method, target property type, and day vs night time occurrence.',
  STAT_6:  'Road accident statistics categorizing fatal, simple injury, and non-injury accidents along with casualty counts.',
  STAT_7:  'Detailed break-up of other BNS cases including extortion, snatching, hurt, and theft sub-categories.',
  STAT_8:  'Worked-out status for other BNS cases detailing solved cases and arrests made.',
  STAT_9:  'Property theft and recovery breakdown categorized by vehicle theft, house theft, servant theft, and pickpocketing.',
  STAT_10: 'Worked-out other theft cases detailing recovery rates and arrests for non-automobile theft offenses.',
  STAT_11: 'Crime Against Women summary covering rape, dowry death, cruelty, molestation, and harassment offenses.',
  STAT_12: 'Organised crime statement tracking gang activity, extortion rackets, syndicate arrests, and asset seizures.',
  STAT_13: 'Automobile theft and recovery breakdown by vehicle type (motor cycle, scooter, car, taxi, TSR) during FN and upto date.',
  STAT_14: 'Preventive action summary detailing action under preventive BNSS sections, history-sheeters, and surveillance list.',
  STAT_15: 'Arrest and tracking status of Proclaimed Offenders (POs) and absconders arrested during the fortnight.',
  STAT_16: 'Excise Act and NDPS Act enforcement statistics detailing cases detected, contraband quantity, and market value seized.',
  STAT_17: 'Enforcement action under the Arms Act detailing illegal firearms, ammunition, and sharp weapons seized.',
  STAT_18: 'Vehicles seized in connection with illegal firearms, Excise Act, and NDPS Act offenses.',
  STAT_19: 'Kidnapping and abduction cases — reported, worked out, cancelled, persons arrested, and victims by gender.',
  STAT_20: 'Persons arrested by crime head during FN and upto date with BC and previously-involved sub-counts.',
  STAT_21: 'Disposal of Kalandras under BNSS preventive provisions — number of Kalandras and persons discharged/bound down.',
  STAT_22: 'Break-up of action taken under Section 223 BNS (disobedience to order duly promulgated by public servant).',
  STAT_23: 'Crime Against Scheduled Castes (SC) and Scheduled Tribes (ST) detailing offenses and police action.',
  STAT_24: 'Missing persons and missing children by age group and gender — reported, traced, and pending for FN and upto date.',
  STAT_25: 'Exclusive POCSO Act cases breakdown detailing child sexual abuse offenses and victim age brackets.',
  STAT_26: 'Total POCSO Act cases registered with or without combined BNS/IPC sections.',
  STAT_27: 'Cases under Juvenile Justice Act — crimes against children under JJ Act sections reported and solved.',
  STAT_28: 'Crime Against Children under BNS — victims below 18 years by offense category reported and solved.',
  STAT_29: 'Human trafficking cases — reported, worked out, and victim counts by trafficking category.',
  STAT_30: 'Zero FIR registrations by crime head — registered during FN and forwarded to Delhi PS or other jurisdictions.',
  STAT_31: 'Crime against residents of North-East states (Assam, Arunachal Pradesh, Manipur, etc.) by offense category.',
  STAT_32: 'Cases registered on directions of Hon\'ble Courts — by crime head during FN and upto date.',
  STAT_33: 'Monetary value of property stolen vs property recovered across all theft and robbery categories.',
  STAT_34: 'Enforcement action under Delhi Police Act provisions and local municipal regulations.',
  STAT_35: 'Detailed summary of preventive action, externment proceedings, and security bond enforcement.',
  STAT_36: 'Disposal of BNS cases by police — opening balance, registered FN, challaned, cancelled, untraced, and closing balance.',
  STAT_37: 'Disposal of Local & Special Laws cases by police — opening balance, registered, disposed, and closing balance per act.',
  STAT_38: 'BNS cases chargesheeted without arrest where accused were released on notice under BNSS.',
  STAT_39: 'Local & Special Laws (L&SL) cases chargesheeted without arrest under BNSS notice provisions.',
  STAT_40: 'Court disposal of BNS cases detailing convictions, acquittals, discharges, and pendency in court.',
  STAT_41: 'Court disposal of Local & Special Laws (L&SL) cases detailing judicial outcomes and trial status.'
};

export async function generateFnDiary(districtNodeId, fnEndDate, selectedSheets = []) {
  const scope = await resolveScope(districtNodeId || 'ALL_DELHI_TOTAL');

  let psIds = [];
  if (scope.level === 'HQ' || scope.level === 'PHQ' || districtNodeId === 'ALL_DELHI_TOTAL') {
    const allPs = await db('hierarchy_nodes').where({ node_type: 'PS', is_active: true }).select('id');
    psIds = allPs.map(p => p.id);
  } else {
    psIds = (scope.ps_ids && scope.ps_ids.length > 0) ? scope.ps_ids : (scope.children_ids || []);
    if (!psIds.length && scope.self_id) {
      psIds = [scope.self_id];
    }
  }

  // Effective cutoff date fallback: if requested date has no records, fallback to latest record date in DB
  let effectiveFnEnd = fnEndDate;
  const latestRec = await db('records')
    .where('record_type', 'CASE')
    .whereNotNull('record_date')
    .orderBy('record_date', 'desc')
    .first('record_date');

  if (latestRec && latestRec.record_date) {
    const latestStr = typeof latestRec.record_date === 'string'
      ? latestRec.record_date.slice(0, 10)
      : latestRec.record_date.toISOString().slice(0, 10);

    if (!effectiveFnEnd || effectiveFnEnd < '2026-06-01' || effectiveFnEnd > latestStr) {
      effectiveFnEnd = latestStr;
    }
  }

  const w = buildFnDateWindows(effectiveFnEnd || '2026-08-04');
  const { fnEnd, fnStart, fnEndLY, fnStartLY, jan1Curr, jan1LY, yearNum } = w;

  const [
    fnYCases,  fnY1Cases,  uptoYCases,  uptoY1Cases,
    fnYWo,     fnY1Wo,     uptoYWo,     uptoY1Wo,
    fnYCan,    fnY1Can,    uptoYCan,    uptoY1Can,
    fnYUntr,   fnY1Untr,   uptoYUntr,   uptoY1Untr,
    fnYArr,    fnY1Arr,    uptoYArr,    uptoY1Arr,
    pendingRows,
    actRowsY,  actRowsY1,
    missingRowsY, missingRowsY1,
    openingPendingRows,
  ] = await Promise.all([
    fetchFnCaseCounts({ psIds, fromDate: fnStart,   toDate: fnEnd }),
    fetchFnCaseCounts({ psIds, fromDate: fnStartLY, toDate: fnEndLY }),
    fetchFnCaseCounts({ psIds, fromDate: jan1Curr,  toDate: fnEnd }),
    fetchFnCaseCounts({ psIds, fromDate: jan1LY,    toDate: fnEndLY }),
    fetchFnDisposedCounts({ psIds, fromDate: fnStart,   toDate: fnEnd,   disposalType: 'CHARGE_SHEET' }),
    fetchFnDisposedCounts({ psIds, fromDate: fnStartLY, toDate: fnEndLY, disposalType: 'CHARGE_SHEET' }),
    fetchFnDisposedCounts({ psIds, fromDate: jan1Curr,  toDate: fnEnd,   disposalType: 'CHARGE_SHEET' }),
    fetchFnDisposedCounts({ psIds, fromDate: jan1LY,    toDate: fnEndLY, disposalType: 'CHARGE_SHEET' }),
    fetchFnDisposedCounts({ psIds, fromDate: fnStart,   toDate: fnEnd,   disposalType: 'FINAL_REPORT' }),
    fetchFnDisposedCounts({ psIds, fromDate: fnStartLY, toDate: fnEndLY, disposalType: 'FINAL_REPORT' }),
    fetchFnDisposedCounts({ psIds, fromDate: jan1Curr,  toDate: fnEnd,   disposalType: 'FINAL_REPORT' }),
    fetchFnDisposedCounts({ psIds, fromDate: jan1LY,    toDate: fnEndLY, disposalType: 'FINAL_REPORT' }),
    fetchFnDisposedCounts({ psIds, fromDate: fnStart,   toDate: fnEnd,   disposalType: 'UNTRACED' }),
    fetchFnDisposedCounts({ psIds, fromDate: fnStartLY, toDate: fnEndLY, disposalType: 'UNTRACED' }),
    fetchFnDisposedCounts({ psIds, fromDate: jan1Curr,  toDate: fnEnd,   disposalType: 'UNTRACED' }),
    fetchFnDisposedCounts({ psIds, fromDate: jan1LY,    toDate: fnEndLY, disposalType: 'UNTRACED' }),
    fetchFnArrestCounts({ psIds, fromDate: fnStart,   toDate: fnEnd }),
    fetchFnArrestCounts({ psIds, fromDate: fnStartLY, toDate: fnEndLY }),
    fetchFnArrestCounts({ psIds, fromDate: jan1Curr,  toDate: fnEnd }),
    fetchFnArrestCounts({ psIds, fromDate: jan1LY,    toDate: fnEndLY }),
    fetchPendingCasesByAge({ psIds, fnEnd }),
    fetchFnCasesByAct({ psIds, fromDate: fnStart,   toDate: fnEnd }),
    fetchFnCasesByAct({ psIds, fromDate: fnStartLY, toDate: fnEndLY }),
    fetchFnMissingCounts({ psIds, fromDate: fnStart,   toDate: fnEnd }),
    fetchFnMissingCounts({ psIds, fromDate: fnStartLY, toDate: fnEndLY }),
    fetchFnOpeningPending({ psIds, fnStart }),
  ]);

  const distByCode = {};
  accumulate(fnYCases,   distByCode, 'fnY');
  accumulate(fnY1Cases,  distByCode, 'fnY1');
  accumulate(uptoYCases, distByCode, 'uptoY');
  accumulate(uptoY1Cases,distByCode, 'uptoY1');

  const distByCodeWo   = buildByCode(fnYWo,   'fnY');
  accumulate(fnY1Wo,   distByCodeWo,   'fnY1');
  accumulate(uptoYWo,  distByCodeWo,   'uptoY');
  accumulate(uptoY1Wo, distByCodeWo,   'uptoY1');

  const distByCodeCan  = buildByCode(fnYCan,  'fnY');
  accumulate(fnY1Can,  distByCodeCan,  'fnY1');
  accumulate(uptoYCan, distByCodeCan,  'uptoY');
  accumulate(uptoY1Can,distByCodeCan,  'uptoY1');

  const distByCodeUntr = buildByCode(fnYUntr, 'fnY');
  accumulate(fnY1Untr,  distByCodeUntr, 'fnY1');
  accumulate(uptoYUntr, distByCodeUntr, 'uptoY');
  accumulate(uptoY1Untr,distByCodeUntr, 'uptoY1');

  const distByCodeArr  = buildByCode(fnYArr,  'fnY');
  accumulate(fnY1Arr,  distByCodeArr,  'fnY1');
  accumulate(uptoYArr, distByCodeArr,  'uptoY');
  accumulate(uptoY1Arr,distByCodeArr,  'uptoY1');

  const distByCodeOpening = buildByCode(openingPendingRows, 'fnY');

  const calcData = {
    distByCode, distByCodeWo, distByCodeCan, distByCodeUntr, distByCodeArr, distByCodeOpening,
    pendingRows,
    actRowsY, actRowsY1,
    missingRowsY, missingRowsY1,
    fnEnd, fnStart, fnEndLY, fnStartLY, jan1Curr, jan1LY, yearNum,
  };

  const workbook = new ExcelJS.Workbook();
  const templatePath = path.join(path.dirname(fileURLToPath(import.meta.url)), 'FN DIARY.xlsx');
  if (fs.existsSync(templatePath)) {
    await workbook.xlsx.readFile(templatePath);
  } else {
    workbook.creator = 'PHAROS Intelligence System';
    workbook.created = new Date();
  }

  const want = new Set(selectedSheets.map(s => s.toUpperCase().replace(/[^A-Z0-9]/g, '')));
  const all  = !selectedSheets.length;

  const sheets = [
    { key: 'STAT01', fn: renderStat01 },
    { key: 'STAT01A', fn: renderStat01A },
    { key: 'STAT01B', fn: renderStat01B },
    { key: 'STAT02', fn: renderStat02 },
    { key: 'STAT03', fn: renderStat03 },
    { key: 'STAT04', fn: renderStat04 },
    { key: 'STAT05', fn: renderStat05 },
    { key: 'STAT06', fn: renderStat06 },
    { key: 'STAT07', fn: renderStat07 },
    { key: 'STAT08', fn: renderStat08 },
    { key: 'STAT09', fn: renderStat09 },
    { key: 'STAT10', fn: renderStat10 },
    { key: 'STAT11', fn: renderStat11 },
    { key: 'STAT12', fn: renderStat12 },
    { key: 'STAT13', fn: renderStat13 },
    { key: 'STAT14', fn: renderStat14 },
    { key: 'STAT15', fn: renderStat15 },
    { key: 'STAT16', fn: renderStat16 },
    { key: 'STAT17', fn: renderStat17 },
    { key: 'STAT18', fn: renderStat18 },
    { key: 'STAT19', fn: renderStat19 },
    { key: 'STAT20', fn: renderStat20 },
    { key: 'STAT21', fn: renderStat21 },
    { key: 'STAT22', fn: renderStat22 },
    { key: 'STAT23', fn: renderStat23 },
    { key: 'STAT24', fn: renderStat24 },
    { key: 'STAT25', fn: renderStat25 },
    { key: 'STAT26', fn: renderStat26 },
    { key: 'STAT27', fn: renderStat27 },
    { key: 'STAT28', fn: renderStat28 },
    { key: 'STAT29', fn: renderStat29 },
    { key: 'STAT30', fn: renderStat30 },
    { key: 'STAT31', fn: renderStat31 },
    { key: 'STAT32', fn: renderStat32 },
    { key: 'STAT33', fn: renderStat33 },
    { key: 'STAT34', fn: renderStat34 },
    { key: 'STAT35', fn: renderStat35 },
    { key: 'STAT36', fn: renderStat36 },
    { key: 'STAT37', fn: renderStat37 },
    { key: 'STAT38', fn: renderStat38 },
    { key: 'STAT39', fn: renderStat39 },
    { key: 'STAT40', fn: renderStat40 },
    { key: 'STAT41', fn: renderStat41 },
  ];

  for (const { key, fn } of sheets) {
    try {
      await fn(workbook, scope, calcData);
    } catch (err) {
      console.error(`Error rendering sheet ${key}:`, err);
    }
  }

  const templateNames = new Set([
    'STAT_1', 'STAT_1A', 'STAT_1B', 'STAT_2', 'STAT_3', 'STAT_4', 'STAT_5', 'STAT_6',
    'STAT_7', 'STAT_8', 'STAT_9', 'STAT_10', 'STAT_11', 'STAT_12', 'STAT_13', 'STAT_14',
    'STAT_15', 'STAT_16', 'STAT_17', 'STAT_18', 'STAT_19', 'STAT_20', 'STAT_21', 'STAT_22',
    'STAT_23', 'STAT_24', 'STAT_25', 'STAT_26', 'STAT_27', 'STAT_28', 'STAT_29', 'STAT_30',
    'STAT_31', 'STAT_32', 'STAT_33', 'STAT_34', 'STAT_35', 'STAT_36', 'STAT_37', 'STAT_38',
    'STAT_39', 'STAT_40', 'STAT_41'
  ]);

  // Keep ALL 43 template worksheets in the output workbook unconditionally
  for (let i = workbook.worksheets.length - 1; i >= 0; i--) {
    const ws = workbook.worksheets[i];
    if (!templateNames.has(ws.name)) {
      workbook.removeWorksheet(ws.id);
    }
  }

  // ── Subtitle Hierarchy Adaptation Helper ─────────────────────────────
  function buildSubtitleText(scopeObj) {
    const level = (scopeObj?.level || '').toUpperCase();
    const name  = (scopeObj?.self_name || '').toUpperCase().trim();

    if (level === 'HQ' || level === 'PHQ' || name.includes('DELHI') || name === 'STATE') {
      return 'FORTNIGHTLY CRIME DIARY OF UNION TERRITORY OF DELHI';
    }
    if (level === 'RANGE') {
      return `FORTNIGHTLY CRIME DIARY OF ${name} RANGE`;
    }
    if (level === 'DISTRICT') {
      const cleanDist = name.replace(/\s+DISTRICT$/i, '').trim();
      return `FORTNIGHTLY CRIME DIARY OF ${cleanDist} DISTRICT`;
    }
    if (level === 'PS') {
      const cleanPs = name.replace(/^PS\s+/i, '').trim();
      return `FORTNIGHTLY CRIME DIARY OF PS ${cleanPs}`;
    }
    return `FORTNIGHTLY CRIME DIARY OF ${name}`;
  }

  const subtitleText = buildSubtitleText(scope);

  // ── Sheet Column Boundaries ──────────────────────────────────────────
  const SHEET_MAX_COLS = {
    STAT_1: 6,   STAT_1A: 10, STAT_1B: 6,  STAT_2: 8,   STAT_3: 6,   STAT_4: 8,   STAT_5: 6,
    STAT_6: 14,  STAT_7: 6,   STAT_8: 8,   STAT_9: 6,   STAT_10: 8,  STAT_11: 11, STAT_12: 10,
    STAT_13: 13, STAT_14: 13, STAT_15: 6,  STAT_16: 6,  STAT_17: 13, STAT_18: 8,  STAT_19: 10,
    STAT_20: 21, STAT_21: 26, STAT_22: 10, STAT_23: 12, STAT_24: 13, STAT_25: 12, STAT_26: 12,
    STAT_27: 10, STAT_28: 10, STAT_29: 15, STAT_30: 10, STAT_31: 10, STAT_32: 6,  STAT_33: 6,
    STAT_34: 4,  STAT_35: 8,  STAT_36: 14, STAT_37: 14, STAT_38: 6,  STAT_39: 6,  STAT_40: 14,
    STAT_41: 14
  };

  for (const ws of workbook.worksheets) {
    const rawKey = ws.name.replace(/\s+/g, '').toUpperCase();
    const num = parseInt(ws.name.replace(/[^0-9]/g, '')) || 1;

    // Tab colours grouped by reporting section
    if (num <= 10) ws.properties.tabColor = { argb: 'FF1E3A8A' };      // Deep Navy
    else if (num <= 20) ws.properties.tabColor = { argb: 'FF2563EB' }; // Slate Blue
    else if (num <= 30) ws.properties.tabColor = { argb: 'FF0D9488' }; // Teal
    else ws.properties.tabColor = { argb: 'FF4F46E5' };                // Indigo

    // Dynamic Subtitle Adaptation on Row 2
    if (ws.getCell('A2').value && String(ws.getCell('A2').value).includes('FORTNIGHTLY CRIME DIARY')) {
      ws.getCell('A2').value = subtitleText;
    }

    // Dynamic Date & Year Headers on Row 3 and Row 5
    const fnDateFormatted = fnEnd ? (() => {
      const parts = String(fnEnd).split(/[-/]/);
      if (parts.length === 3 && parts[0].length === 4) {
        return `${parts[2].padStart(2, '0')}.${parts[1].padStart(2, '0')}.${parts[0].slice(-2)}`;
      }
      return String(fnEnd);
    })() : '31.05.26';

    const yearPrev = yearNum - 1;

    // Row 3 date update
    const row3 = ws.getRow(3);
    row3.eachCell({ includeEmpty: true }, (cell) => {
      const v = String(cell.value || '');
      if (/^\d{2}\.\d{2}\.\d{2}$/.test(v.trim())) {
        cell.value = fnDateFormatted;
      }
    });

    // Row 5 year update
    const row5 = ws.getRow(5);
    row5.eachCell({ includeEmpty: true }, (cell) => {
      if (cell.value === 2026 || cell.value === '2026') cell.value = yearNum;
      else if (cell.value === 2025 || cell.value === '2025') cell.value = yearPrev;
    });

    // Formula sanitation across all cells in the worksheet to prevent ExcelJS shared formula clone errors
    ws.eachRow({ includeEmpty: true }, (row) => {
      row.eachCell({ includeEmpty: true }, (cell) => {
        if (cell._value?.model) {
          delete cell._value.model.sharedFormula;
        }
      });
    });

    const maxR = Math.min(ws.rowCount, 65);
    const startDataCol = (ws.name === 'STAT_11' || ws.name === 'STAT_21') ? 4 : 3;
    const endDataCol   = SHEET_MAX_COLS[rawKey] || SHEET_MAX_COLS[`STAT_${num}`] || 6;

    for (let r = 4; r <= maxR; r++) {
      const row   = ws.getRow(r);
      const textA = String(row.getCell(1).value ?? '').trim().toUpperCase();
      const textB = String(row.getCell(2).value ?? '').trim().toUpperCase();
      const label = textB || textA;

      // Clear stray zeroes and skip empty rows outside/below tables
      if (!textA && !textB) {
        for (let c = startDataCol; c <= endDataCol; c++) {
          const cell = row.getCell(c);
          if (cell.value === 0 || cell.value === '0') {
            cell.value = null;
          }
        }
        continue;
      }

      // Skip section header rows (e.g. "A. HEINOUS CRIME", "B. NON-HEINOUS CRIME")
      const isSection = /^[AB]\.\s|HEINOUS CRIME|NON.?HEINOUS/i.test(label) || /^[AB]\.\s/.test(textA);
      if (isSection) continue;

      for (let c = startDataCol; c <= endDataCol; c++) {
        const cell = row.getCell(c);

        // Skip slave cells of merged regions
        if (cell.master && cell.master.address !== cell.address) continue;

        const v = cell.value;

        // Skip formula cells so ExcelJS formulas remain intact
        if (v && typeof v === 'object' && ('formula' in v || 'sharedFormula' in v)) {
          continue;
        }

        // Fill empty/null data cells in data rows with 0 as per Global Rule 1
        if (v === null || v === undefined || v === '') {
          cell.value = 0;
        }

        if (typeof cell.value === 'number') {
          cell.numFmt    = '#,##0';
          cell.alignment = { horizontal: 'right', vertical: 'middle' };
        }
      }
    }
  }

  return await workbook.xlsx.writeBuffer();
}
