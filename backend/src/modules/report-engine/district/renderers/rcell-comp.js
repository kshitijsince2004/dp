import { PALETTE, FONTS, safeMerge } from '../../shared/canonical-codes.js';
import { varPct, detPct } from '../../shared/calc.js';

function formatDistrictTitle(name) {
  let s = (name || 'DISTRICT').trim();
  s = s.replace(/\s+DISTRICT$/i, '');
  return `${s.toUpperCase()} DISTRICT`;
}

const CRIME_ROWS = [
  { label: 'Dacoity',         code: 'DACOITY' },
  { label: 'Murder',          code: 'MURDER' },
  { label: 'Att. Murder',     code: 'ATT_TO_MURDER' },
  { label: 'Robbery',         code: 'ROBBERY' },
  { label: 'Riots',           code: 'RIOT' },
  { label: 'Kid.For Ransom',  code: 'KID_FOR_RANSOM' },
  { label: 'Rape',            code: 'RAPE' },
  { label: 'TOTAL HEINOUS',   isTotal: true, group: 'heinous' },
  { label: 'Extortion',       code: 'EXTORTION' },
  { label: 'Snatching',       code: 'SNATCHING' },
  { label: 'Hurt',            code: 'HURT' },
  { label: 'Burglary',        code: 'BURGLARY' },
  { label: 'House Theft',     code: 'HOUSE_THEFT' },
  { label: 'M V Theft',       code: 'MV_THEFT' },
  { label: 'Servant Theft',   code: 'SERVANT_THEFT' },
  { label: 'Other Theft',     code: 'OTHER_THEFT' },
  { label: 'M O Women',       code: 'MO_WOMEN' },
  { label: 'Eve Teasing',     code: 'EVE_TEASING' },
  { label: 'Kidnapping',      code: 'KIDNAPPING' },
  { label: 'Abduction',       code: 'ABDUCTION' },
  { label: 'Fatal Accident',  code: 'FATAL_ACCIDENT' },
  { label: 'Simple Accident', code: 'SIMPLE_ACCIDENT' },
  { label: 'Other IPC',       code: 'OTHER_IPC' },
  { label: 'Cheating',        code: 'CHEATING' },
  { label: 'TOTAL NON HEINOUS', isTotal: true, group: 'non_heinous' },
  { label: 'TOTAL IPC',       isTotal: true, group: 'ipc' },
  { label: 'TOTAL CRIME',     isTotal: true, group: 'crime' },
  { label: 'Arms Act',        code: 'ARMS_ACT' },
  { label: 'Excise Act',      code: 'EXCISE_ACT' },
  { label: 'Gambling Act',    code: 'GAMBLING_ACT' },
  { label: 'NDPS Act',        code: 'NDPS_ACT' },
  { label: 'POCSO Act',       code: 'POCSO' },
  { label: 'Other Act',       code: 'OTHER_ACT' },
  { label: 'TOTAL ACT',       isTotal: true, group: 'act' },
  { label: 'GRAND TOTAL',     isTotal: true, group: 'grand' },
];

const HEINOUS_CODES  = new Set(['DACOITY','MURDER','ATT_TO_MURDER','ROBBERY','RIOT','KID_FOR_RANSOM','RAPE']);
const ACT_CODES      = new Set(['ARMS_ACT','EXCISE_ACT','GAMBLING_ACT','NDPS_ACT','POCSO','OTHER_ACT']);

export function renderRcellComp(workbook, scope, calcData) {
  let sheet = workbook.getWorksheet('R Cell- Distt Crime') || workbook.addWorksheet('R Cell- Distt Crime');
  const distTitle = formatDistrictTitle(scope.self_name);
  const yearNum = calcData.yearNum || 2026;
  const yearPrev = yearNum - 1;
  const dbc = calcData.distByCode || {};
  const get = (code, field) => Number(dbc[code]?.[field] || 0);

  // Precompute group totals
  const sums = { heinous: {}, non_heinous: {}, ipc: {}, crime: {}, act: {}, grand: {} };
  const fields = ['repY', 'woY', 'repY1', 'woY1'];
  Object.values(sums).forEach(g => fields.forEach(f => (g[f] = 0)));

  CRIME_ROWS.forEach(r => {
    if (!r.code) return;
    const isHeinous = HEINOUS_CODES.has(r.code);
    const isAct     = ACT_CODES.has(r.code);
    fields.forEach(f => {
      const v = get(r.code, f);
      if (isHeinous) { sums.heinous[f]     += v; sums.ipc[f]   += v; sums.crime[f] += v; sums.grand[f] += v; }
      else if (isAct){ sums.act[f]         += v; sums.grand[f] += v; }
      else           { sums.non_heinous[f] += v; sums.ipc[f]   += v; sums.crime[f] += v; sums.grand[f] += v; }
    });
  });

  // Title Row 1
  safeMerge(sheet, 'A1:D1');
  const t1 = sheet.getCell('A1');
  t1.value = `R Cell Daily Diary- ${distTitle}`;
  t1.font = FONTS.TITLE;

  safeMerge(sheet, 'H1:I1');
  const tVar = sheet.getCell('H1');
  tVar.value = '% Variation of Cases reported';
  tVar.font = FONTS.HEADER;

  // Subtitle Row 2
  safeMerge(sheet, 'A2:I2');
  const t2 = sheet.getCell('A2');
  t2.value = 'COMPARATIVE CRIME STATEMENT';
  t2.font = FONTS.SUBTITLE;

  // Header Rows 3 & 4
  const r3 = sheet.addRow(['HEAD', `Upto Date ${yearPrev}`, '', `W/out % age of ${yearPrev}`, `Upto Date ${yearNum}`, '', `W/out %age of ${yearNum}`, '% Variation of Cases reported']);
  r3.height = 24;
  const r4 = sheet.addRow(['', 'Rep.', 'W/O', '', 'Rep.', 'W/O', '']);
  r4.height = 24;

  safeMerge(sheet, 'A3:A4');
  safeMerge(sheet, 'B3:C3');
  safeMerge(sheet, 'D3:D4');
  safeMerge(sheet, 'E3:F3');
  safeMerge(sheet, 'G3:G4');
  safeMerge(sheet, 'H3:H4');

  [r3, r4].forEach(row => {
    row.eachCell(c => {
      c.font = FONTS.HEADER;
      c.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: PALETTE.LIGHT_ORANGE } };
      c.alignment = { horizontal: 'center', vertical: 'middle', wrapText: true };
      c.border = { top: { style: 'thin' }, left: { style: 'thin' }, bottom: { style: 'thin' }, right: { style: 'thin' } };
    });
  });

  function fmt(v) { return v > 0 ? v : '-'; }
  function fmtPct(v) { return v !== null ? `${(v * 100).toFixed(1)}%` : '-'; }

  CRIME_ROWS.forEach(head => {
    let repY1, woY1, repY, woY;
    if (head.isTotal) {
      ({ repY1, woY1, repY, woY } = sums[head.group]);
    } else {
      repY1 = get(head.code, 'repY1');
      woY1  = get(head.code, 'woY1');
      repY  = get(head.code, 'repY');
      woY   = get(head.code, 'woY');
    }

    const solPctY1 = detPct(woY1, repY1);
    const solPctY  = detPct(woY, repY);
    const varPctVal = varPct(repY, repY1);

    const dRow = sheet.addRow([
      head.label,
      fmt(repY1), fmt(woY1),
      solPctY1,
      fmt(repY),  fmt(woY),
      solPctY,
      varPctVal,
    ]);

    dRow.height = 20;
    dRow.eachCell((cell, colIdx) => {
      cell.font = head.isTotal ? FONTS.HEADER : FONTS.DATA;
      if (head.isTotal) {
        cell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: PALETTE.LIGHT_GRAY } };
      }
      cell.alignment = colIdx === 1 ? { horizontal: 'left', vertical: 'middle' } : { horizontal: 'center', vertical: 'middle' };
      cell.border = { top: { style: 'thin' }, left: { style: 'thin' }, bottom: { style: 'thin' }, right: { style: 'thin' } };
    });
  });

  sheet.columns.forEach((col, idx) => { col.width = idx === 0 ? 32 : 18; });
}
