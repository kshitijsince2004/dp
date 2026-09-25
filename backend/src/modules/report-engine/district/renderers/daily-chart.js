import { PALETTE, FONTS } from '../../shared/canonical-codes.js';
import { computeVariation, computeDetection, computeNotWorkedOut } from '../../shared/calc.js';

function formatDistrictTitle(name) {
  let s = (name || 'DISTRICT').trim();
  s = s.replace(/\s+DISTRICT$/i, '');
  return `${s.toUpperCase()} DISTRICT`;
}

const HEINOUS_CODES    = ['DACOITY','MURDER','ATT_TO_MURDER','ROBBERY','RIOT','KID_FOR_RANSOM','RAPE'];
const ACT_CODES        = ['ARMS_ACT','EXCISE_ACT','GAMBLING_ACT','NDPS_ACT','POCSO','OTHER_ACT'];
const NON_HEINOUS_CODES = [
  'EXTORTION','SNATCHING','HURT','BURGLARY','HOUSE_THEFT','MV_THEFT',
  'SERVANT_THEFT','OTHER_THEFT','MO_WOMEN','EVE_TEASING','KIDNAPPING',
  'ABDUCTION','FATAL_ACCIDENT','SIMPLE_ACCIDENT','OTHER_IPC',
];

function psAgg(psByCode, psByCodeY1, psByCodeWo, psByCodeY1Wo, psId, codes) {
  const g = c => Number(psByCode[psId]?.[c]    || 0);
  const g1= c => Number(psByCodeY1[psId]?.[c]  || 0);
  const w = c => Number(psByCodeWo[psId]?.[c]  || 0);
  const w1= c => Number(psByCodeY1Wo[psId]?.[c]|| 0);
  return codes.reduce((acc, c) => {
    acc.repY  += g(c); acc.repY1 += g1(c);
    acc.woY   += w(c); acc.woY1  += w1(c);
    return acc;
  }, { repY: 0, repY1: 0, woY: 0, woY1: 0 });
}

function fmt7(repY1, repY, woY1, woY) {
  const nwY  = computeNotWorkedOut(repY, woY);
  const solY = computeDetection(woY, repY);
  const varPct = computeVariation(repY, repY1);
  const f = v => v > 0 ? v : '-';
  const fp= v => v !== null ? `${(v * 100).toFixed(1)}%` : '-';
  return [f(repY1), f(repY), f(woY1), f(woY), f(nwY), fp(solY), fp(varPct)];
}

export function renderDailyChart(workbook, scope, calcData) {
  const sheet = workbook.addWorksheet('Daily Chart, Heinous, IPC');
  const distTitle = formatDistrictTitle(scope.self_name);
  const children = scope.children_ids || [];
  const displayNames = scope.display_names || {};
  const yearNum = calcData.yearNum || 2026;
  const yearPrev = yearNum - 1;
  const { psByCode = {}, psByCodeY1 = {}, psByCodeWo = {}, psByCodeY1Wo = {} } = calcData;

  // Title Row 1
  sheet.mergeCells('A1:AC1');
  const t1 = sheet.getCell('A1');
  t1.value = `CRIME CHART (HEINOUS, OTHER BNS & TOTAL BNS) — ${distTitle}`;
  t1.font = FONTS.TITLE;
  t1.alignment = { horizontal: 'center', vertical: 'middle' };

  // Row 2: Major Group Banners
  const r2 = sheet.addRow(['Police Station', 'TOTAL HEINOUS', '', '', '', '', '', '', 'OTHER BNS / OTHER IPC', '', '', '', '', '', '', 'TOTAL BNS / TOTAL IPC', '', '', '', '', '', '', 'TOTAL ACT']);
  r2.height = 24;

  const r3 = sheet.addRow(['', 'UP to Date', '', '', '', '', '', '', 'UP to Date', '', '', '', '', '', '', 'UP to Date', '', '', '', '', '', '', 'UP to Date']);
  r3.height = 22;

  const r4 = sheet.addRow([
    '',
    `${yearPrev}`, `${yearNum}`, `W/O ${yearPrev}`, `W/O ${yearNum}`, `N/W ${yearNum}`, 'Solved%', 'Var%',
    `${yearPrev}`, `${yearNum}`, `W/O ${yearPrev}`, `W/O ${yearNum}`, `N/W ${yearNum}`, 'Solved%', 'Var%',
    `${yearPrev}`, `${yearNum}`, `W/O ${yearPrev}`, `W/O ${yearNum}`, `N/W ${yearNum}`, 'Solved%', 'Var%',
    `${yearPrev}`, `${yearNum}`, `W/O ${yearPrev}`, `W/O ${yearNum}`, `N/W ${yearNum}`, 'Solved%', 'Var%',
  ]);
  r4.height = 22;

  sheet.mergeCells('A2:A4');
  sheet.mergeCells('B2:H2');
  sheet.mergeCells('I2:O2');
  sheet.mergeCells('P2:V2');
  sheet.mergeCells('W2:AC2');
  sheet.mergeCells('B3:H3');
  sheet.mergeCells('I3:O3');
  sheet.mergeCells('P3:V3');
  sheet.mergeCells('W3:AC3');

  [r2, r3, r4].forEach(row => {
    row.eachCell(c => {
      c.font = FONTS.HEADER;
      c.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: PALETTE.LIGHT_ORANGE } };
      c.alignment = { horizontal: 'center', vertical: 'middle', wrapText: true };
      c.border = { top: { style: 'thin' }, left: { style: 'thin' }, bottom: { style: 'thin' }, right: { style: 'thin' } };
    });
  });

  // District totals accumulators
  const distH  = { repY: 0, repY1: 0, woY: 0, woY1: 0 };
  const distNH = { repY: 0, repY1: 0, woY: 0, woY1: 0 };
  const distAct = { repY: 0, repY1: 0, woY: 0, woY1: 0 };

  children.forEach(psId => {
    const psName = displayNames[psId] || psId;
    const h  = psAgg(psByCode, psByCodeY1, psByCodeWo, psByCodeY1Wo, psId, HEINOUS_CODES);
    const nh = psAgg(psByCode, psByCodeY1, psByCodeWo, psByCodeY1Wo, psId, NON_HEINOUS_CODES);
    const act= psAgg(psByCode, psByCodeY1, psByCodeWo, psByCodeY1Wo, psId, ACT_CODES);
    const bns = { repY: h.repY + nh.repY, repY1: h.repY1 + nh.repY1, woY: h.woY + nh.woY, woY1: h.woY1 + nh.woY1 };

    ['repY','repY1','woY','woY1'].forEach(f => {
      distH[f]  += h[f]; distNH[f] += nh[f]; distAct[f] += act[f];
    });

    const dRow = sheet.addRow([
      psName,
      ...fmt7(h.repY1,   h.repY,   h.woY1,   h.woY),
      ...fmt7(nh.repY1,  nh.repY,  nh.woY1,  nh.woY),
      ...fmt7(bns.repY1, bns.repY, bns.woY1, bns.woY),
      ...fmt7(act.repY1, act.repY, act.woY1, act.woY),
    ]);
    dRow.height = 20;
    dRow.eachCell((cell, colIdx) => {
      cell.font = FONTS.DATA;
      cell.alignment = colIdx === 1 ? { horizontal: 'left', vertical: 'middle' } : { horizontal: 'center', vertical: 'middle' };
      cell.border = { top: { style: 'thin' }, left: { style: 'thin' }, bottom: { style: 'thin' }, right: { style: 'thin' } };
    });
  });

  const distBns = { repY: distH.repY + distNH.repY, repY1: distH.repY1 + distNH.repY1, woY: distH.woY + distNH.woY, woY1: distH.woY1 + distNH.woY1 };
  const totRow = sheet.addRow([
    'TOTAL',
    ...fmt7(distH.repY1,    distH.repY,    distH.woY1,    distH.woY),
    ...fmt7(distNH.repY1,   distNH.repY,   distNH.woY1,   distNH.woY),
    ...fmt7(distBns.repY1,  distBns.repY,  distBns.woY1,  distBns.woY),
    ...fmt7(distAct.repY1,  distAct.repY,  distAct.woY1,  distAct.woY),
  ]);
  totRow.font = FONTS.HEADER;
  totRow.eachCell(c => {
    c.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: PALETTE.YELLOW } };
    c.border = { top: { style: 'medium' }, left: { style: 'thin' }, bottom: { style: 'medium' }, right: { style: 'thin' } };
  });

  sheet.columns.forEach((col, idx) => { col.width = idx === 0 ? 32 : 12; });
}
