/**
 * PHQ Diary ExcelGenerator
 *
 * Produces a 9-sheet workbook matching PHQ_Diary.xls layout using ExcelJS.
 * Sheet order mirrors the reference file:
 *   1. MANUALY       — day/fortnight/upto-date for all Delhi
 *   2. Daily Diary   — multi-year comparative with detection (all Delhi)
 *   3. Monday_Morning — cases + solved + % solved
 *   4. Upto_Date     — all districts × 3 years
 *   5. DISTRICTS     — all districts × 2 years
 *   6. L&O SOUTH     — south districts × 2 years
 *   7. L&O NORTH     — north districts × 2 years
 *   8. for week      — weekly comparative
 *   9. Variation%    — 3-year variation matrix
 */

import ExcelJS from 'exceljs';
import {
  HEINOUS_ROWS, NON_HEINOUS_ROWS, LSL_ROWS, DRUG_ROWS, ARREST_ROWS,
  UPTODATE_DISTRICTS, TWO_YEAR_DISTRICTS, LO_NORTH_DISTRICTS, LO_SOUTH_DISTRICTS, DISTRICT_IPC_ROWS, DISTRICT_LSL_ROWS,
} from './phq-diary.config.js';
import { varPct, detPct } from './phq-diary.calc.js';

// ── Style constants ──────────────────────────────────────────────────────────

const FONT_BOLD  = { bold: true, size: 9, name: 'Arial Narrow' };
const FONT_NORM  = { bold: false, size: 9, name: 'Arial Narrow' };
const FONT_TITLE = { bold: true, size: 11, name: 'Arial Narrow' };

const FILL_HEADER  = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FF4472C4' } };
const FILL_HEINOUS = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FFFFC000' } };
const FILL_TOTAL   = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FFD6E4BC' } };
const FILL_LSL     = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FFE2EFDA' } };
const FILL_DRUG    = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FFFCE4D6' } };
const FILL_ARREST  = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FFDAE3F3' } };

const BORDER_THIN = {
  top:    { style: 'thin' },
  left:   { style: 'thin' },
  bottom: { style: 'thin' },
  right:  { style: 'thin' },
};

const ALIGN_CENTER = { horizontal: 'center', vertical: 'middle', wrapText: true };
const ALIGN_LEFT   = { horizontal: 'left',   vertical: 'middle' };
const ALIGN_RIGHT  = { horizontal: 'right',  vertical: 'middle' };

// ── Helpers ──────────────────────────────────────────────────────────────────

function applyBorder(cell) {
  cell.border = BORDER_THIN;
}

function hCell(ws, row, col, value, opts = {}) {
  const cell = ws.getCell(row, col);
  cell.value = value;
  cell.font  = opts.bold !== false ? { ...FONT_BOLD, color: { argb: 'FFFFFFFF' } } : FONT_BOLD;
  cell.fill  = opts.fill || FILL_HEADER;
  cell.alignment = ALIGN_CENTER;
  cell.border    = BORDER_THIN;
  return cell;
}

function dCell(ws, row, col, value, opts = {}) {
  const cell = ws.getCell(row, col);
  cell.value = value;
  cell.font  = opts.bold ? FONT_BOLD : FONT_NORM;
  cell.alignment = opts.right ? ALIGN_RIGHT : (opts.center ? ALIGN_CENTER : ALIGN_LEFT);
  cell.border = BORDER_THIN;
  if (opts.fill) cell.fill = opts.fill;
  return cell;
}

function numCell(ws, row, col, value, opts = {}) {
  const cell = ws.getCell(row, col);
  const n = Number(value);
  cell.value = isNaN(n) ? (value || 0) : n;
  cell.font  = opts.bold ? FONT_BOLD : FONT_NORM;
  cell.alignment = ALIGN_RIGHT;
  cell.border = BORDER_THIN;
  if (opts.fill) cell.fill = opts.fill;
  return cell;
}

function varCell(ws, row, col, value, opts = {}) {
  const cell = ws.getCell(row, col);
  let strVal = '-';
  if (value === null || value === undefined || value === '-' || value === Infinity || value === '+∞' || (typeof value === 'number' && !isFinite(value))) {
    strVal = '-';
  } else if (typeof value === 'number') {
    strVal = (value >= 0 ? '+' : '') + value.toFixed(1) + '%';
  } else {
    strVal = String(value);
  }
  cell.value = strVal;
  cell.font  = opts.bold ? FONT_BOLD : FONT_NORM;
  cell.alignment = ALIGN_CENTER;
  cell.border = BORDER_THIN;
  if (opts.fill) cell.fill = opts.fill;
  return cell;
}

function merge(ws, r1, c1, r2, c2) {
  ws.mergeCells(r1, c1, r2, c2);
}

function setColWidths(ws, widths) {
  widths.forEach((w, i) => {
    ws.getColumn(i + 1).width = w;
  });
}

function rowFill(ws, rowNum, fromCol, toCol, fill) {
  for (let c = fromCol; c <= toCol; c++) {
    ws.getCell(rowNum, c).fill = fill;
  }
}

function formatUptoDateTitle(dateStr) {
  if (!dateStr) return '';
  const parts = dateStr.split('-');
  if (parts.length < 3) return dateStr.toUpperCase();
  const [y, m, d] = parts;
  const dateObj = new Date(parseInt(y), parseInt(m) - 1, parseInt(d));
  const dayNum = parseInt(d);
  let suffix = 'TH';
  if (dayNum % 10 === 1 && dayNum !== 11) suffix = 'ST';
  else if (dayNum % 10 === 2 && dayNum !== 12) suffix = 'ND';
  else if (dayNum % 10 === 3 && dayNum !== 13) suffix = 'RD';
  const months = ['JANUARY','FEBRUARY','MARCH','APRIL','MAY','JUNE','JULY','AUGUST','SEPTEMBER','OCTOBER','NOVEMBER','DECEMBER'];
  return `${dayNum}${suffix} ${months[dateObj.getMonth()]}`;
}

// ── Sheet 1: MANUALY ─────────────────────────────────────────────────────────

export function writeManualySheet(wb, data, windows) {
  const ws = wb.addWorksheet('MANUALY');
  ws.views = [{ showGridLines: true }];
  const Y  = windows.year_curr;
  const YP = windows.year_prev;
  const YP2= windows.year_prev2;
  const dateLabel = windows.d;

  setColWidths(ws, [22, 7, 7, 7, 7, 7, 8, 8, 8, 8, 8]);

  // Row 1: Title
  merge(ws, 1, 1, 1, 11);
  const titleCell = ws.getCell(1, 1);
  titleCell.value = `DAILY CRIME DIARY OF DATED : ${formatDate(dateLabel)}`;
  titleCell.font  = FONT_TITLE;
  titleCell.alignment = ALIGN_CENTER;
  titleCell.fill = FILL_HEADER;
  for (let c = 1; c <= 11; c++) ws.getCell(1, c).fill = FILL_HEADER;

  // Row 2: Group headers
  merge(ws, 2, 2, 2, 3);  hCell(ws, 2, 2,  'DAY');
  merge(ws, 2, 4, 2, 6);  hCell(ws, 2, 4,  'FORTNIGHT');
  merge(ws, 2, 7, 2, 9);  hCell(ws, 2, 7,  'UPTODATE');
  merge(ws, 2, 10, 2, 11); hCell(ws, 2, 10, 'VARIATION %');
  hCell(ws, 2, 1, 'CRIME HEAD');
  for (let c = 4; c <= 11; c++) ws.getCell(2, c).fill = FILL_HEADER;
  ws.getCell(2, 4).fill = FILL_HEADER;

  // Row 3: Sub-headers
  const subHdrs = ['CRIME HEAD','CURR.\nDAY','PRE.\nDAY',
    'CURR.\n15 DAYS','PRE.\n15 DAYS','CORR.\n15 DAYS',
    YP2, YP, Y,
    `[${Y}]/[${YP2}]`, `[${Y}]/[${YP}]`];
  subHdrs.forEach((h, i) => {
    hCell(ws, 3, i + 1, h);
  });
  ws.getRow(3).height = 30;

  let r = 4;

  function writeSection(label, rows, totalRow, fill) {
    // Section separator
    const sepCell = ws.getCell(r, 1);
    sepCell.value = label;
    sepCell.font  = { ...FONT_BOLD, color: { argb: 'FF000000' } };
    sepCell.fill  = fill;
    merge(ws, r, 1, r, 11);
    for (let c = 1; c <= 11; c++) ws.getCell(r, c).fill = fill;
    r++;

    for (const row of rows) {
      writeManualyRow(ws, r++, row, null);
    }
    if (totalRow) {
      writeManualyRow(ws, r++, totalRow, FILL_TOTAL);
    }
  }

  writeSection('IPC HEINOUS CRIMES',     data.heinousRows,    data.totalHeinous,    FILL_HEINOUS);
  writeSection('IPC NON-HEINOUS CRIMES', data.nonHeinousRows, data.totalNonHeinous, FILL_LSL);
  // TOTAL IPC row
  writeManualyRow(ws, r++, data.totalIPC, FILL_TOTAL);
  writeSection('LOCAL & SPECIAL LAWS',   data.lslRows,        data.totalAct,        FILL_LSL);

  // NDPS Recovery section
  const drugSep = ws.getCell(r, 1);
  drugSep.value = 'NDPS RECOVERY (KG)';
  drugSep.font  = { ...FONT_BOLD, color: { argb: 'FF000000' } };
  merge(ws, r, 1, r, 11);
  for (let c = 1; c <= 11; c++) ws.getCell(r, c).fill = FILL_DRUG;
  r++;

  for (const drug of data.drugData) {
    dCell(ws, r, 1,  drug.label);
    numCell(ws, r, 2,  drug.kg_day_curr);
    numCell(ws, r, 3,  drug.kg_day_prev);
    numCell(ws, r, 4,  drug.kg_fn_curr);
    numCell(ws, r, 5,  drug.kg_fn_prev);
    numCell(ws, r, 6,  drug.kg_fn_corr);
    numCell(ws, r, 7,  drug.kg_upto_prev2);
    numCell(ws, r, 8,  drug.kg_upto_prev);
    numCell(ws, r, 9,  drug.kg_upto_curr);
    varCell(ws, r, 10, drug.var_upto_vs_prev2);
    varCell(ws, r, 11, drug.var_upto_vs_prev);
    r++;
  }

  // Arrests section
  const arrSep = ws.getCell(r, 1);
  arrSep.value = 'ARRESTS OF CRIMINALS';
  arrSep.font  = { ...FONT_BOLD, color: { argb: 'FF000000' } };
  merge(ws, r, 1, r, 11);
  for (let c = 1; c <= 11; c++) ws.getCell(r, c).fill = FILL_ARREST;
  r++;

  for (const arr of data.arrestData.named) {
    writeArrestRow(ws, r++, arr, null);
  }
  writeArrestRow(ws, r++, data.arrestData.totalIPC, FILL_TOTAL);
  for (const arr of data.arrestData.lslRows) {
    writeArrestRow(ws, r++, arr, null);
  }
  writeArrestRow(ws, r++, data.arrestData.totalAct, FILL_TOTAL);

  ws.getRow(1).height = 20;
  ws.getRow(2).height = 20;
  ws.getRow(3).height = 35;
}

function writeManualyRow(ws, r, row, fill) {
  const f = fill || null;
  dCell(ws, r, 1,  row.label, { bold: row.isTotal, fill: f });
  numCell(ws, r, 2, row.day_curr,   { bold: row.isTotal, fill: f });
  numCell(ws, r, 3, row.day_prev,   { bold: row.isTotal, fill: f });
  numCell(ws, r, 4, row.fn_curr,    { bold: row.isTotal, fill: f });
  numCell(ws, r, 5, row.fn_prev,    { bold: row.isTotal, fill: f });
  numCell(ws, r, 6, row.fn_corr,    { bold: row.isTotal, fill: f });
  numCell(ws, r, 7, row.upto_prev2, { bold: row.isTotal, fill: f });
  numCell(ws, r, 8, row.upto_prev,  { bold: row.isTotal, fill: f });
  numCell(ws, r, 9, row.upto_curr,  { bold: row.isTotal, fill: f });
  varCell(ws, r, 10, row.var_vs_prev2, { bold: row.isTotal, fill: f });
  varCell(ws, r, 11, row.var_vs_prev,  { bold: row.isTotal, fill: f });
}

function writeArrestRow(ws, r, row, fill) {
  dCell(ws, r, 1, row.label, { bold: row.isTotal, fill });
  numCell(ws, r, 2, row.day_curr,   { fill });
  numCell(ws, r, 3, row.day_prev,   { fill });
  numCell(ws, r, 4, row.fn_curr,    { fill });
  numCell(ws, r, 5, row.fn_prev,    { fill });
  numCell(ws, r, 6, row.fn_corr,    { fill });
  numCell(ws, r, 7, row.upto_prev2, { fill });
  numCell(ws, r, 8, row.upto_prev,  { fill });
  numCell(ws, r, 9, row.upto_curr,  { fill });
  varCell(ws, r, 10, row.var_vs_prev, { fill });
  varCell(ws, r, 11, '-', { fill });
}

// ── Sheet 2: Daily Diary (comparative + detection) ────────────────────────────

export function writeDailyDiarySheet(wb, data, windows) {
  const ws = wb.addWorksheet('Daily Diary');
  ws.views = [{ showGridLines: true }];
  const Y  = windows.year_curr;
  const YP = windows.year_prev;
  const YP2= windows.year_prev2;

  // Columns: HEAD | Y-2 | Y-1 | Y | VAR%[Y/Y-2] | VAR%[Y/Y-1] | DET_CASES_CURR | DET_PCT_CURR | DET_CASES_PREV | DET_PCT_PREV
  const cols = 10;
  setColWidths(ws, [22, 8, 8, 8, 10, 10, 10, 10, 10, 10]);

  merge(ws, 1, 1, 1, cols);
  const t = ws.getCell(1, 1);
  t.value = `DELHI POLICE — DAILY CRIME DIARY (UPTO DATE COMPARATIVE) : ${formatDate(windows.d)}`;
  t.font  = FONT_TITLE;
  t.fill  = FILL_HEADER;
  t.alignment = ALIGN_CENTER;

  merge(ws, 2, 1, 3, 1);  hCell(ws, 2, 1, 'CRIME HEAD');
  merge(ws, 2, 2, 2, 4);  hCell(ws, 2, 2, 'CASES REPORTED (UPTO DATE)');
  merge(ws, 2, 5, 2, 6);  hCell(ws, 2, 5, 'VARIATION %');
  merge(ws, 2, 7, 2, 8);  hCell(ws, 2, 7, `DETECTION ${Y} (UPTO DATE)`);
  merge(ws, 2, 9, 2, 10); hCell(ws, 2, 9, `DETECTION ${YP} (UPTO DATE)`);

  [YP2, YP, Y, `[${Y}]/[${YP2}]`, `[${Y}]/[${YP}]`,
   'CASES', '%AGE', 'CASES', '%AGE'
  ].forEach((h, i) => hCell(ws, 3, i + 2, h));
  ws.getRow(3).height = 25;

  let r = 4;

  function writeCompRow(ws, r, row, fill) {
    dCell(ws, r, 1, row.label, { bold: row.isTotal, fill });
    numCell(ws, r, 2, row.upto_prev2, { bold: row.isTotal, fill });
    numCell(ws, r, 3, row.upto_prev,  { bold: row.isTotal, fill });
    numCell(ws, r, 4, row.upto_curr,  { bold: row.isTotal, fill });
    varCell(ws, r, 5, row.var_vs_prev2, { bold: row.isTotal, fill });
    varCell(ws, r, 6, row.var_vs_prev,  { bold: row.isTotal, fill });
    numCell(ws, r, 7, row.det_curr,   { bold: row.isTotal, fill });
    varCell(ws, r, 8, row.det_pct_curr, { bold: row.isTotal, fill });
    numCell(ws, r, 9, row.det_prev,   { bold: row.isTotal, fill });
    varCell(ws, r, 10, row.det_pct_prev, { bold: row.isTotal, fill });
  }

  function section(label, fill, rows, totalRow) {
    for (let c = 1; c <= cols; c++) ws.getCell(r, c).fill = fill;
    merge(ws, r, 1, r, cols);
    const sep = ws.getCell(r, 1);
    sep.value = label;
    sep.font  = FONT_BOLD;
    r++;
    for (const row of rows) writeCompRow(ws, r++, row, null);
    if (totalRow) writeCompRow(ws, r++, totalRow, FILL_TOTAL);
  }

  section('IPC HEINOUS',     FILL_HEINOUS, data.heinousRows, data.totalHeinous);
  section('IPC NON-HEINOUS', FILL_LSL,     data.nonHeinousRows, data.totalNonHeinous);
  writeCompRow(ws, r++, data.totalIPC, FILL_TOTAL);
  section('LOCAL & SPECIAL LAWS', FILL_LSL, data.lslRows, data.totalAct);

  // Drug section (no detection)
  for (let c = 1; c <= cols; c++) ws.getCell(r, c).fill = FILL_DRUG;
  merge(ws, r, 1, r, cols);
  ws.getCell(r, 1).value = 'NDPS RECOVERY (KG)';
  ws.getCell(r, 1).font  = FONT_BOLD;
  r++;
  for (const drug of data.drugData) {
    dCell(ws, r, 1, drug.label);
    numCell(ws, r, 2, drug.kg_upto_prev2);
    numCell(ws, r, 3, drug.kg_upto_prev);
    numCell(ws, r, 4, drug.kg_upto_curr);
    varCell(ws, r, 5, drug.var_upto_vs_prev2);
    varCell(ws, r, 6, drug.var_upto_vs_prev);
    for (let c = 7; c <= cols; c++) { const ce = ws.getCell(r, c); ce.value = '-'; ce.border = BORDER_THIN; ce.font = FONT_NORM; }
    r++;
  }

  // Arrest section (no detection)
  for (let c = 1; c <= cols; c++) ws.getCell(r, c).fill = FILL_ARREST;
  merge(ws, r, 1, r, cols);
  ws.getCell(r, 1).value = 'ARRESTS';
  ws.getCell(r, 1).font  = FONT_BOLD;
  r++;

  function writeArrComp(r, row, fill) {
    dCell(ws, r, 1, row.label, { fill });
    numCell(ws, r, 2, row.upto_prev2, { fill });
    numCell(ws, r, 3, row.upto_prev,  { fill });
    numCell(ws, r, 4, row.upto_curr,  { fill });
    varCell(ws, r, 5, row.var_vs_prev, { fill });
    varCell(ws, r, 6, '-', { fill });
    for (let c = 7; c <= cols; c++) { const ce = ws.getCell(r, c); ce.value = '-'; ce.border = BORDER_THIN; ce.font = FONT_NORM; if (fill) ce.fill = fill; }
  }

  for (const arr of data.arrestData.named) writeArrComp(r++, arr, null);
  writeArrComp(r++, data.arrestData.totalIPC, FILL_TOTAL);
  for (const arr of data.arrestData.lslRows) writeArrComp(r++, arr, null);
  writeArrComp(r++, data.arrestData.totalAct, FILL_TOTAL);
}

// ── Sheet 9: Monday Morning ───────────────────────────────────────────────────

export function writeMondayMorningSheet(wb, mmData, windows) {
  const ws = wb.addWorksheet('Monday_Morning');
  ws.views = [{ showGridLines: true }];
  const Y  = windows.year_curr;
  const YP = windows.year_prev;

  setColWidths(ws, [22, 10, 10, 12, 10, 10, 12, 12]);

  merge(ws, 1, 1, 1, 8);
  const t = ws.getCell(1, 1);
  t.value = `CRIME IN DELHI- ${Y} (UPTO ${formatUptoDateTitle(windows.d)})`;
  t.font  = FONT_TITLE;
  t.fill  = FILL_HEADER;
  t.alignment = ALIGN_CENTER;

  merge(ws, 2, 1, 3, 1);  hCell(ws, 2, 1, 'CRIME HEAD');
  merge(ws, 2, 2, 2, 3);  hCell(ws, 2, 2, 'CASE REPORTED');
  merge(ws, 2, 4, 3, 4);  hCell(ws, 2, 4, 'VARIATION');
  merge(ws, 2, 5, 2, 6);  hCell(ws, 2, 5, 'CASES SOLVED');
  merge(ws, 2, 7, 2, 8);  hCell(ws, 2, 7, '%AGE SOLVED');

  [YP, Y, YP, Y, YP, Y].forEach((h, i) => {
    const colIdx = i >= 2 ? i + 3 : i + 2;
    hCell(ws, 3, colIdx, h);
  });
  ws.getRow(2).height = 20;
  ws.getRow(3).height = 20;

  let r = 4;
  for (const row of mmData) {
    const isTotal = row.isTotal;
    const isHeinous = HEINOUS_ROWS.some(h => h.code === row.code) || row.code === 'TOTAL_HEINOUS';
    const fill = isTotal ? FILL_TOTAL : (isHeinous ? FILL_HEINOUS : null);
    dCell(ws, r, 1, row.label, { bold: isTotal, fill });
    numCell(ws, r, 2, row.reported_prev, { bold: isTotal, fill });
    numCell(ws, r, 3, row.reported_curr, { bold: isTotal, fill });
    varCell(ws, r, 4, row.variation,     { bold: isTotal, fill, center: true });
    numCell(ws, r, 5, row.solved_prev,   { bold: isTotal, fill });
    numCell(ws, r, 6, row.solved_curr,   { bold: isTotal, fill });
    varCell(ws, r, 7, row.pct_solved_prev, { bold: isTotal, fill, center: true });
    varCell(ws, r, 8, row.pct_solved_curr, { bold: isTotal, fill, center: true });
    r++;
  }
}

// ── Sheet 1, 2, 3, 4: Upto_Date / DISTRICTS / L&O SOUTH / L&O NORTH ──────────

export function writeDistrictSheet(wb, sheetName, districtList, districtMatrix, windows, numYears = 3, level = 'HQ', scopeName = 'DELHI') {
  const ws = wb.addWorksheet(sheetName);
  ws.views = [{ showGridLines: true }];
  const Y  = windows.year_curr;
  const YP = windows.year_prev;
  const YP2= windows.year_prev2;

  const yearsPerDist = numYears;
  const distCols = districtList.length * yearsPerDist;
  const totalCols = 1 + distCols + yearsPerDist; // HEAD + districts + TOTAL

  setColWidths(ws, [22, ...Array(distCols + yearsPerDist).fill(6)]);

  // Title Row 1
  if (sheetName === 'DISTRICTS') {
    merge(ws, 1, 1, 1, 29);
    const t1 = ws.getCell(1, 1);
    t1.value = `COMPARATIVE HEAD-WISE AND DISTRICT-WISE CRIME REPORTED IN DELHI FOR THE YEARS- ${YP} & ${Y}`;
    t1.font  = FONT_TITLE; t1.fill  = FILL_HEADER; t1.alignment = ALIGN_CENTER;
    
    merge(ws, 1, 30, 1, totalCols);
    const t2 = ws.getCell(1, 30);
    t2.value = `(UPTO ${formatUptoDateTitle(windows.d)})`;
    t2.font  = FONT_TITLE; t2.fill  = FILL_HEADER; t2.alignment = ALIGN_CENTER;
  } else {
    merge(ws, 1, 1, 1, totalCols);
    const t = ws.getCell(1, 1);
    const titleScope = scopeName ? scopeName.toUpperCase() : 'DELHI';
    const unitLabel = level === 'DISTRICT' ? 'PS-WISE' : 'DISTRICT-WISE';
    if (sheetName === 'L&O SOUTH' || sheetName === 'L&O NORTH') {
      t.value = `COMPARATIVE HEAD-WISE AND DISTRICT-WISE CRIME REPORTED IN DELHI FOR THE YEARS-  ${YP} & ${Y}    ( UPTO ${formatUptoDateTitle(windows.d)} )`;
    } else {
      t.value = `COMPARATIVE HEAD-WISE AND ${unitLabel} CRIME REPORTED IN ${titleScope} FOR THE YEARS- ${YP2}, ${YP} & ${Y}  ( UPTO ${formatUptoDateTitle(windows.d)} )`;
    }
    t.font  = FONT_TITLE;
    t.fill  = FILL_HEADER;
    t.alignment = ALIGN_CENTER;
  }

  // Row 2: district group headers
  merge(ws, 2, 1, 3, 1);
  hCell(ws, 2, 1, 'CRIME HEAD');
  let col = 2;
  for (const dist of districtList) {
    merge(ws, 2, col, 2, col + yearsPerDist - 1);
    hCell(ws, 2, col, dist.label);
    col += yearsPerDist;
  }
  // TOTAL group
  merge(ws, 2, col, 2, col + yearsPerDist - 1);
  hCell(ws, 2, col, 'TOTAL');

  // Row 3: year sub-headers
  col = 2;
  const yearLabels = numYears === 3 ? [YP2, YP, Y] : [YP, Y];
  for (let d = 0; d < districtList.length + 1; d++) {
    for (const yl of yearLabels) {
      hCell(ws, 3, col++, yl);
    }
  }
  ws.getRow(2).height = 20;
  ws.getRow(3).height = 20;

  // Calculate Crime Rows + LSL Rows + Grand Total
  let r = 4;
  const allRows = [...DISTRICT_IPC_ROWS, ...DISTRICT_LSL_ROWS];
  for (const rowDef of allRows) {
    const isTotal = rowDef.isTotal;
    const isHeinous = rowDef.isHeinous;
    const isTotalAct = rowDef.code === 'TOTAL_ACT';
    const isGrandTotal = rowDef.code === 'GRAND_TOTAL';

    const fill = isGrandTotal ? FILL_TOTAL : (isTotalAct ? FILL_LSL : (isTotal ? FILL_TOTAL : (isHeinous ? FILL_HEINOUS : null)));

    dCell(ws, r, 1, rowDef.label, { bold: isTotal, fill });
    col = 2;

    for (const dist of districtList) {
      const distRows = districtMatrix[dist.code] || [];

      let vals = [0, 0, 0];
      if (rowDef.code === 'TOTAL_HEINOUS') {
        const heinousCodes = DISTRICT_IPC_ROWS.filter(x => x.isHeinous).map(x => x.code);
        const hRows = distRows.filter(x => heinousCodes.includes(x.code));
        vals = numYears === 3
          ? [hRows.reduce((s, x) => s + (x.upto_prev2 || 0), 0), hRows.reduce((s, x) => s + (x.upto_prev || 0), 0), hRows.reduce((s, x) => s + (x.upto_curr || 0), 0)]
          : [hRows.reduce((s, x) => s + (x.upto_prev || 0), 0), hRows.reduce((s, x) => s + (x.upto_curr || 0), 0)];
      } else if (rowDef.code === 'TOTAL_NON_HEINOUS') {
        const heinousCodes = DISTRICT_IPC_ROWS.filter(x => x.isHeinous || x.isTotal).map(x => x.code);
        const nhRows = distRows.filter(x => !heinousCodes.includes(x.code));
        vals = numYears === 3
          ? [nhRows.reduce((s, x) => s + (x.upto_prev2 || 0), 0), nhRows.reduce((s, x) => s + (x.upto_prev || 0), 0), nhRows.reduce((s, x) => s + (x.upto_curr || 0), 0)]
          : [nhRows.reduce((s, x) => s + (x.upto_prev || 0), 0), nhRows.reduce((s, x) => s + (x.upto_curr || 0), 0)];
      } else if (rowDef.code === 'TOTAL_IPC') {
        const totalRow = distRows.find(x => x.code === 'TOTAL_IPC');
        vals = numYears === 3
          ? [totalRow?.upto_prev2 || 0, totalRow?.upto_prev || 0, totalRow?.upto_curr || 0]
          : [totalRow?.upto_prev  || 0, totalRow?.upto_curr || 0];
      } else if (rowDef.code === 'TOTAL_ACT') {
        const lslCodes = ['ARMS_ACT','EXCISE_ACT','NDPS_ACT','GAMBLING_ACT','OTHER_ACT'];
        const lslR = distRows.filter(x => lslCodes.includes(x.code));
        vals = numYears === 3
          ? [lslR.reduce((s, x) => s + (x.upto_prev2 || 0), 0), lslR.reduce((s, x) => s + (x.upto_prev || 0), 0), lslR.reduce((s, x) => s + (x.upto_curr || 0), 0)]
          : [lslR.reduce((s, x) => s + (x.upto_prev || 0), 0), lslR.reduce((s, x) => s + (x.upto_curr || 0), 0)];
      } else if (rowDef.code === 'GRAND_TOTAL') {
        const ipcRow = distRows.find(x => x.code === 'TOTAL_IPC');
        const lslCodes = ['ARMS_ACT','EXCISE_ACT','NDPS_ACT','GAMBLING_ACT','OTHER_ACT'];
        const lslR = distRows.filter(x => lslCodes.includes(x.code));
        const actPrev2 = lslR.reduce((s, x) => s + (x.upto_prev2 || 0), 0);
        const actPrev  = lslR.reduce((s, x) => s + (x.upto_prev  || 0), 0);
        const actCurr  = lslR.reduce((s, x) => s + (x.upto_curr  || 0), 0);
        vals = numYears === 3
          ? [(ipcRow?.upto_prev2 || 0) + actPrev2, (ipcRow?.upto_prev || 0) + actPrev, (ipcRow?.upto_curr || 0) + actCurr]
          : [(ipcRow?.upto_prev || 0) + actPrev, (ipcRow?.upto_curr || 0) + actCurr];
      } else {
        const rowData = distRows.find(x => x.code === rowDef.code);
        vals = numYears === 3
          ? [rowData?.upto_prev2 || 0, rowData?.upto_prev || 0, rowData?.upto_curr || 0]
          : [rowData?.upto_prev  || 0, rowData?.upto_curr || 0];
      }

      for (const v of vals) {
        numCell(ws, r, col++, v, { bold: isTotal, fill: fill || (isTotal ? FILL_TOTAL : null) });
      }
    }

    // Total column for all districts combined
    let totVals = [0, 0, 0];
    const allDistRows = Object.values(districtMatrix).flat();
    if (rowDef.code === 'TOTAL_HEINOUS') {
      const heinousCodes = DISTRICT_IPC_ROWS.filter(x => x.isHeinous).map(x => x.code);
      const hRows = allDistRows.filter(x => heinousCodes.includes(x.code));
      totVals = numYears === 3
        ? [hRows.reduce((s, x) => s + (x.upto_prev2 || 0), 0), hRows.reduce((s, x) => s + (x.upto_prev || 0), 0), hRows.reduce((s, x) => s + (x.upto_curr || 0), 0)]
        : [hRows.reduce((s, x) => s + (x.upto_prev || 0), 0), hRows.reduce((s, x) => s + (x.upto_curr || 0), 0)];
    } else if (rowDef.code === 'TOTAL_NON_HEINOUS') {
      const heinousCodes = DISTRICT_IPC_ROWS.filter(x => x.isHeinous || x.isTotal).map(x => x.code);
      const nhRows = allDistRows.filter(x => !heinousCodes.includes(x.code));
      totVals = numYears === 3
        ? [nhRows.reduce((s, x) => s + (x.upto_prev2 || 0), 0), nhRows.reduce((s, x) => s + (x.upto_prev || 0), 0), nhRows.reduce((s, x) => s + (x.upto_curr || 0), 0)]
        : [nhRows.reduce((s, x) => s + (x.upto_prev || 0), 0), nhRows.reduce((s, x) => s + (x.upto_curr || 0), 0)];
    } else if (rowDef.code === 'TOTAL_IPC') {
      const totalRows = allDistRows.filter(x => x.code === 'TOTAL_IPC');
      totVals = numYears === 3
        ? [totalRows.reduce((s, x) => s + (x.upto_prev2 || 0), 0), totalRows.reduce((s, x) => s + (x.upto_prev || 0), 0), totalRows.reduce((s, x) => s + (x.upto_curr || 0), 0)]
        : [totalRows.reduce((s, x) => s + (x.upto_prev || 0), 0), totalRows.reduce((s, x) => s + (x.upto_curr || 0), 0)];
    } else if (rowDef.code === 'TOTAL_ACT') {
      const lslCodes = ['ARMS_ACT','EXCISE_ACT','NDPS_ACT','GAMBLING_ACT','OTHER_ACT'];
      const lslRows = allDistRows.filter(x => lslCodes.includes(x.code));
      totVals = numYears === 3
        ? [lslRows.reduce((s, x) => s + (x.upto_prev2 || 0), 0), lslRows.reduce((s, x) => s + (x.upto_prev || 0), 0), lslRows.reduce((s, x) => s + (x.upto_curr || 0), 0)]
        : [lslRows.reduce((s, x) => s + (x.upto_prev || 0), 0), lslRows.reduce((s, x) => s + (x.upto_curr || 0), 0)];
    } else if (rowDef.code === 'GRAND_TOTAL') {
      const totalIPCRows = allDistRows.filter(x => x.code === 'TOTAL_IPC');
      const lslCodes = ['ARMS_ACT','EXCISE_ACT','NDPS_ACT','GAMBLING_ACT','OTHER_ACT'];
      const lslRows = allDistRows.filter(x => lslCodes.includes(x.code));
      const ipcPrev2 = totalIPCRows.reduce((s, x) => s + (x.upto_prev2 || 0), 0);
      const ipcPrev  = totalIPCRows.reduce((s, x) => s + (x.upto_prev  || 0), 0);
      const ipcCurr  = totalIPCRows.reduce((s, x) => s + (x.upto_curr  || 0), 0);
      const actPrev2 = lslRows.reduce((s, x) => s + (x.upto_prev2 || 0), 0);
      const actPrev  = lslRows.reduce((s, x) => s + (x.upto_prev  || 0), 0);
      const actCurr  = lslRows.reduce((s, x) => s + (x.upto_curr  || 0), 0);
      totVals = numYears === 3
        ? [ipcPrev2 + actPrev2, ipcPrev + actPrev, ipcCurr + actCurr]
        : [ipcPrev + actPrev, ipcCurr + actCurr];
    } else {
      const matchingRows = allDistRows.filter(x => x.code === rowDef.code);
      totVals = numYears === 3
        ? [matchingRows.reduce((s, x) => s + (x.upto_prev2 || 0), 0), matchingRows.reduce((s, x) => s + (x.upto_prev || 0), 0), matchingRows.reduce((s, x) => s + (x.upto_curr || 0), 0)]
        : [matchingRows.reduce((s, x) => s + (x.upto_prev || 0), 0), matchingRows.reduce((s, x) => s + (x.upto_curr || 0), 0)];
    }

    for (const v of totVals) {
      numCell(ws, r, col++, v, { bold: true, fill: fill || FILL_TOTAL });
    }
    r++;
  }
}

// ── Sheet 3 & 4: L&O SOUTH / L&O NORTH ──────────────────────────────────────

export function writeLOSheet(wb, sheetName, districtList, districtMatrix, windows) {
  writeDistrictSheet(wb, sheetName, districtList, districtMatrix, windows, 2);
}

// ── Sheet 6: for week ─────────────────────────────────────────────────────────

export function writeWeekSheet(wb, data, windows) {
  const ws = wb.addWorksheet('for week');
  ws.views = [{ showGridLines: true }];
  const Y  = windows.year_curr;
  const YP = windows.year_prev;

  setColWidths(ws, [22, 8, 8, 10, 10, 10]);

  merge(ws, 1, 1, 1, 6);
  const t = ws.getCell(1, 1);
  t.value = `WEEKLY CRIME DIARY : ${windows.week_curr?.from || ''} TO ${windows.week_curr?.to || windows.d}`;
  t.font  = FONT_TITLE;
  t.fill  = FILL_HEADER;
  t.alignment = ALIGN_CENTER;

  merge(ws, 2, 1, 3, 1);
  hCell(ws, 2, 1, 'CRIME HEAD');
  merge(ws, 2, 2, 2, 3);  hCell(ws, 2, 2, 'CASES REPORTED (WEEK)');
  hCell(ws, 2, 4, 'VARIATION %');
  merge(ws, 2, 5, 2, 6);  hCell(ws, 2, 5, 'DETECTION (UPTO DATE)');
  [YP, Y, '', 'CASES', '%'].forEach((h, i) => hCell(ws, 3, i + 2, h));
  ws.getRow(3).height = 20;

  let r = 4;

  function writeWeekRow(row, fill) {
    dCell(ws, r, 1, row.label, { fill });
    numCell(ws, r, 2, row.week_prev, { fill });
    numCell(ws, r, 3, row.week_curr, { fill });
    varCell(ws, r, 4, row.var_week,  { fill });
    numCell(ws, r, 5, row.det_curr,  { fill });
    varCell(ws, r, 6, row.det_pct_curr, { fill });
    r++;
  }

  for (let c = 1; c <= 6; c++) ws.getCell(r, c).fill = FILL_HEINOUS;
  merge(ws, r, 1, r, 6);
  ws.getCell(r, 1).value = 'IPC HEINOUS'; ws.getCell(r, 1).font = FONT_BOLD;
  r++;
  for (const row of data.heinousRows) writeWeekRow(row, null);
  writeWeekRow(data.totalHeinous, FILL_TOTAL);

  for (let c = 1; c <= 6; c++) ws.getCell(r, c).fill = FILL_LSL;
  merge(ws, r, 1, r, 6);
  ws.getCell(r, 1).value = 'IPC NON-HEINOUS'; ws.getCell(r, 1).font = FONT_BOLD;
  r++;
  for (const row of data.nonHeinousRows) writeWeekRow(row, null);
  writeWeekRow(data.totalNonHeinous, FILL_TOTAL);
  writeWeekRow(data.totalIPC, FILL_TOTAL);

  for (let c = 1; c <= 6; c++) ws.getCell(r, c).fill = FILL_LSL;
  merge(ws, r, 1, r, 6);
  ws.getCell(r, 1).value = 'LOCAL & SPECIAL LAWS'; ws.getCell(r, 1).font = FONT_BOLD;
  r++;
  for (const row of data.lslRows) writeWeekRow(row, null);
  writeWeekRow(data.totalAct, FILL_TOTAL);

  // Drug (week)
  for (let c = 1; c <= 6; c++) ws.getCell(r, c).fill = FILL_DRUG;
  merge(ws, r, 1, r, 6);
  ws.getCell(r, 1).value = 'NDPS RECOVERY (KG)'; ws.getCell(r, 1).font = FONT_BOLD;
  r++;
  for (const drug of data.drugData) {
    dCell(ws, r, 1, drug.label);
    numCell(ws, r, 2, drug.kg_week_prev);
    numCell(ws, r, 3, drug.kg_week_curr);
    varCell(ws, r, 4, drug.var_week);
    for (let c = 5; c <= 6; c++) { const ce = ws.getCell(r, c); ce.value = '-'; ce.border = BORDER_THIN; ce.font = FONT_NORM; }
    r++;
  }
}

// ── Sheet 7: Variation% (movement) ───────────────────────────────────────────

export function writeVariationSheet(wb, data, windows) {
  const ws = wb.addWorksheet('Variation% (mvt)');
  ws.views = [{ showGridLines: true }];
  const Y  = windows.year_curr;
  const YP = windows.year_prev;
  const YP2= windows.year_prev2;

  setColWidths(ws, [22, 8, 8, 8, 10, 10]);

  merge(ws, 1, 1, 1, 6);
  const t = ws.getCell(1, 1);
  t.value = `VARIATION % MOVEMENT — UPTO DATE : ${formatDate(windows.d)}`;
  t.font  = FONT_TITLE;
  t.fill  = FILL_HEADER;
  t.alignment = ALIGN_CENTER;

  merge(ws, 2, 1, 3, 1); hCell(ws, 2, 1, 'CRIME HEAD');
  merge(ws, 2, 2, 2, 4); hCell(ws, 2, 2, 'CASES REPORTED (UPTO DATE)');
  merge(ws, 2, 5, 2, 6); hCell(ws, 2, 5, 'VARIATION %');
  [YP2, YP, Y, `[${Y}]/[${YP2}]`, `[${Y}]/[${YP}]`].forEach((h, i) => hCell(ws, 3, i + 2, h));
  ws.getRow(3).height = 20;

  let r = 4;

  function writeVarRow(row, fill) {
    dCell(ws, r, 1, row.label, { fill, bold: row.isTotal });
    numCell(ws, r, 2, row.upto_prev2, { fill });
    numCell(ws, r, 3, row.upto_prev,  { fill });
    numCell(ws, r, 4, row.upto_curr,  { fill });
    varCell(ws, r, 5, row.var_vs_prev2, { fill });
    varCell(ws, r, 6, row.var_vs_prev,  { fill });
    r++;
  }

  for (let c = 1; c <= 6; c++) ws.getCell(r, c).fill = FILL_HEINOUS;
  merge(ws, r, 1, r, 6);
  ws.getCell(r, 1).value = 'IPC HEINOUS'; ws.getCell(r, 1).font = FONT_BOLD;
  r++;
  for (const row of data.heinousRows) writeVarRow(row);
  writeVarRow(data.totalHeinous, FILL_TOTAL);

  for (let c = 1; c <= 6; c++) ws.getCell(r, c).fill = FILL_LSL;
  merge(ws, r, 1, r, 6);
  ws.getCell(r, 1).value = 'IPC NON-HEINOUS'; ws.getCell(r, 1).font = FONT_BOLD;
  r++;
  for (const row of data.nonHeinousRows) writeVarRow(row);
  writeVarRow(data.totalNonHeinous, FILL_TOTAL);
  writeVarRow(data.totalIPC, FILL_TOTAL);

  for (let c = 1; c <= 6; c++) ws.getCell(r, c).fill = FILL_LSL;
  merge(ws, r, 1, r, 6);
  ws.getCell(r, 1).value = 'LOCAL & SPECIAL LAWS'; ws.getCell(r, 1).font = FONT_BOLD;
  r++;
  for (const row of data.lslRows) writeVarRow(row);
  writeVarRow(data.totalAct, FILL_TOTAL);

  for (let c = 1; c <= 6; c++) ws.getCell(r, c).fill = FILL_DRUG;
  merge(ws, r, 1, r, 6);
  ws.getCell(r, 1).value = 'NDPS RECOVERY (KG)'; ws.getCell(r, 1).font = FONT_BOLD;
  r++;
  for (const drug of data.drugData) {
    dCell(ws, r, 1, drug.label);
    numCell(ws, r, 2, drug.kg_upto_prev2);
    numCell(ws, r, 3, drug.kg_upto_prev);
    numCell(ws, r, 4, drug.kg_upto_curr);
    varCell(ws, r, 5, drug.var_upto_vs_prev2);
    varCell(ws, r, 6, drug.var_upto_vs_prev);
    r++;
  }
}

// ── Main workbook builder ─────────────────────────────────────────────────────

export async function buildWorkbook(allDelhi, subUnitMatrix, subUnitColumns, windows, level = 'HQ', selectedSheets = [], scopeName = 'DELHI') {
  const wb = new ExcelJS.Workbook();
  wb.creator  = 'PHAROS — Delhi Police';
  wb.created  = new Date();
  wb.modified = new Date();

  // Available sheets list based on level
  let availableSheets = [];
  if (level === 'HQ') {
    availableSheets = [
      'Upto_Date',
      'DISTRICTS',
      'L&O_SOUTH',
      'L&O_NORTH',
      'Daily_Diary',
      'for_week',
      'Variation_Pct',
      'MANUALY',
      'Monday_Morning'
    ];
  } else if (level === 'RANGE' || level === 'ZONE') {
    availableSheets = [
      'Upto_Date',
      'Daily_Diary',
      'for_week',
      'Variation_Pct',
      'MANUALY',
      'Monday_Morning'
    ];
  } else if (level === 'DISTRICT' || level === 'SUB_DIV') {
    availableSheets = [
      'Upto_Date',
      'Daily_Diary',
      'for_week',
      'Variation_Pct',
      'MANUALY',
      'Monday_Morning'
    ];
  } else if (level === 'PS') {
    availableSheets = [
      'Daily_Diary',
      'for_week',
      'Variation_Pct',
      'MANUALY',
      'Monday_Morning'
    ];
  }

  const sheetsToRender = selectedSheets && selectedSheets.length > 0
    ? availableSheets.filter(s => selectedSheets.includes(s))
    : availableSheets;

  // Sheet 1: Upto_Date (sub-unit matrix × 3 years)
  if (sheetsToRender.includes('Upto_Date') && subUnitColumns && subUnitColumns.length > 0) {
    writeDistrictSheet(wb, 'Upto_Date', subUnitColumns, subUnitMatrix, windows, 3, level, scopeName);
  }

  // Sheet 2: DISTRICTS (all districts × 2 years) - ONLY for HQ level
  if (sheetsToRender.includes('DISTRICTS') && level === 'HQ') {
    writeDistrictSheet(wb, 'DISTRICTS', TWO_YEAR_DISTRICTS, subUnitMatrix, windows, 2, level, scopeName);
  }

  // Sheet 3: L&O SOUTH (south districts × 2 years) - ONLY for HQ level
  if (sheetsToRender.includes('L&O_SOUTH') && level === 'HQ') {
    writeLOSheet(wb, 'L&O SOUTH', LO_SOUTH_DISTRICTS, subUnitMatrix, windows);
  }

  // Sheet 4: L&O NORTH (north districts × 2 years) - ONLY for HQ level
  if (sheetsToRender.includes('L&O_NORTH') && level === 'HQ') {
    writeLOSheet(wb, 'L&O NORTH', LO_NORTH_DISTRICTS, subUnitMatrix, windows);
  }

  // Sheet 5: Daily Diary comparative
  if (sheetsToRender.includes('Daily_Diary')) {
    writeDailyDiarySheet(wb, allDelhi, windows);
  }

  // Sheet 6: for week
  if (sheetsToRender.includes('for_week')) {
    writeWeekSheet(wb, allDelhi, windows);
  }

  // Sheet 7: Variation% (mvt)
  if (sheetsToRender.includes('Variation_Pct')) {
    writeVariationSheet(wb, allDelhi, windows);
  }

  // Sheet 8: MANUALY
  if (sheetsToRender.includes('MANUALY')) {
    writeManualySheet(wb, allDelhi, windows);
  }

  // Sheet 9: Monday Morning
  if (sheetsToRender.includes('Monday_Morning')) {
    writeMondayMorningSheet(wb, allDelhi._mmData, windows);
  }

  return wb;
}

// ── Date formatter ────────────────────────────────────────────────────────────

function formatDate(dateStr) {
  if (!dateStr) return '';
  const [y, m, d] = dateStr.split('-');
  const months = ['Jan','Feb','Mar','Apr','May','Jun','Jul','Aug','Sep','Oct','Nov','Dec'];
  return `${parseInt(d)}-${months[parseInt(m) - 1]}-${y}`;
}
