import { PALETTE, FONTS } from '../../shared/canonical-codes.js';
import { computeVariation, computeDetection, computeNotWorkedOut } from '../../shared/calc.js';

// Canonical-code mapped heads for D1/N-1,2,3 Resolution view
const HEADS = [
  { name: 'Dacoity',          code: 'DACOITY',       isHeinous: true },
  { name: 'Murder',           code: 'MURDER',        isHeinous: true },
  { name: 'Att. Murder',      code: 'ATT_TO_MURDER',    isHeinous: true },
  { name: 'Robbery',          code: 'ROBBERY',       isHeinous: true },
  { name: 'Riots',            code: 'RIOT',          isHeinous: true },
  { name: 'Kid.For Ransom',   code: 'KID_FOR_RANSOM',isHeinous: true },
  { name: 'Rape',             code: 'RAPE',          isHeinous: true },
  { name: 'TOTAL HEINOUS',    isTotal: true, group: 'heinous' },
  { name: 'Organised Crime',  code: 'ORGANISED' },
  { name: 'Terrorist Crime',  code: 'TERRORIST' },
  { name: 'Snatching',        code: 'SNATCHING' },
  { name: 'Burglary',         code: 'BURGLARY' },
  { name: 'Extortion',        code: 'EXTORTION' },
  { name: 'Hurt',             code: 'HURT' },
  { name: 'M V Theft',        code: 'MV_THEFT' },
  { name: 'House Theft',      code: 'HOUSE_THEFT' },
  { name: 'Misc. Theft',      code: 'OTHER_THEFT' },
  { name: 'Kidnapping',       code: 'KIDNAPPING' },
  { name: 'Abduction',        code: 'ABDUCTION' },
  { name: 'M O Women',        code: 'MO_WOMEN' },
  { name: 'Eve Teasing',      code: 'EVE_TEASING' },
  { name: 'Fatal Accident',   code: 'FATAL_ACCIDENT' },
  { name: 'Simple Accident',  code: 'SIMPLE_ACCIDENT' },
  { name: 'Total Cheating',   code: 'CHEATING' },
  { name: 'Drugging',         code: 'DRUGGING' },
  { name: 'Dowry Death',      code: 'DOWRY_DEATH' },
  { name: 'Other IPC/BNS',    code: 'OTHER_IPC' },
  { name: 'TOTAL NON HEINOUS',isTotal: true, group: 'non_heinous' },
  { name: 'TOTAL IPC/BNS',    isTotal: true, group: 'ipc' },
  { name: 'Arms Act',         code: 'ARMS_ACT', isAct: true },
  { name: 'Excise Act',       code: 'EXCISE_ACT', isAct: true },
  { name: 'Gambling Act',     code: 'GAMBLING_ACT', isAct: true },
  { name: 'NDPS Act',         code: 'NDPS_ACT', isAct: true },
  { name: 'POCSO Act',        code: 'POCSO', isAct: true },
  { name: 'Other Act',        code: 'OTHER_ACT', isAct: true },
  { name: 'TOTAL ACT',        isTotal: true, group: 'act' },
  { name: 'GRAND TOTAL',      isTotal: true, group: 'grand' },
];

const HEINOUS = new Set(['DACOITY','MURDER','ATT_TO_MURDER','ROBBERY','RIOT','KID_FOR_RANSOM','RAPE']);
const ACT     = new Set(['ARMS_ACT','EXCISE_ACT','GAMBLING_ACT','NDPS_ACT','POCSO','OTHER_ACT']);

export function renderD1Resolution(workbook, scope, calcData) {
  const sheet = workbook.addWorksheet(' D1,N-1,2,3 Res');
  const districtName = (scope.self_name || 'DISTRICT').toUpperCase();
  const yearNum = calcData.yearNum || 2026;
  const yearPrev = yearNum - 1;
  const dbc = calcData.distByCode || {};
  const gd = (code, field) => Number(dbc[code]?.[field] || 0);

  // Precompute group sums
  const sums = { heinous: {}, non_heinous: {}, ipc: {}, act: {}, grand: {} };
  const tf = ['dayY','dayY1','dayYWo','dayY1Wo','repY','repY1','woY','woY1'];
  Object.values(sums).forEach(g => tf.forEach(f => (g[f] = 0)));
  HEADS.forEach(h => {
    if (!h.code || h.isTotal) return;
    tf.forEach(f => {
      const v = gd(h.code, f);
      if (HEINOUS.has(h.code))     { sums.heinous[f]     += v; sums.ipc[f]  += v; sums.grand[f] += v; }
      else if (ACT.has(h.code))    { sums.act[f]         += v; sums.grand[f] += v; }
      else                         { sums.non_heinous[f] += v; sums.ipc[f]  += v; sums.grand[f] += v; }
    });
  });

  sheet.mergeCells('A1:AA1');
  const t1 = sheet.getCell('A1');
  t1.value = `DAILY DIARY ${districtName} DISTRICT — RESOLUTION VIEW (Jt CP/CR Office)`;
  t1.font = FONTS.TITLE;

  const r2 = sheet.addRow([
    'HEAD',
    `Today Y Rep`, `Today Y W-O`, `Today Y-1 Rep`, `Today Y-1 W-O`,
    'Inc/Dec %',
    `Upto Date Y Rep`, `Upto Date Y W-O`, `Upto Date Y N-W`, `W/out %age Y`,
    `Upto Date Y-1 Rep`, `Upto Date Y-1 W-O`, `W/out %age Y-1`,
    `Upto Date Y (Jt CP)`, `Upto Date Y W-O`, `Upto Date Y-1 (Jt CP)`, `Upto Date Y-1 W-O`
  ]);
  r2.font = FONTS.HEADER;
  r2.eachCell((c, colIdx) => {
    c.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: PALETTE.OLIVE_GREEN } };
    if (colIdx === 9) {
      c.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: PALETTE.SALMON_ORANGE } };
    }
  });

  function fmtRow(h, dayY, dayYWo, dayY1, dayY1Wo, repY, woY, repY1, woY1) {
    const incDec = computeVariation(dayY, dayY1);
    const nwY  = computeNotWorkedOut(repY, woY);
    const solY = computeDetection(woY, repY);
    const solY1= computeDetection(woY1, repY1);
    const f  = v => v > 0 ? v : '-';
    const fp = v => v !== null ? `${(v * 100).toFixed(1)}%` : '-';
    // Jt CP columns (subdivisions) — not tracked separately, use same upto-date values
    return [
      h,
      f(dayY), f(dayYWo), f(dayY1), f(dayY1Wo),
      fp(incDec),
      f(repY), f(woY), f(nwY), fp(solY),
      f(repY1), f(woY1), fp(solY1),
      f(repY), f(woY), f(repY1), f(woY1),
    ];
  }

  HEADS.forEach(h => {
    let row;
    if (h.isTotal) {
      const s = sums[h.group];
      row = fmtRow(h.name, s.dayY, s.dayYWo, s.dayY1, s.dayY1Wo, s.repY, s.woY, s.repY1, s.woY1);
    } else {
      row = fmtRow(
        h.name,
        gd(h.code,'dayY'), gd(h.code,'dayYWo'), gd(h.code,'dayY1'), gd(h.code,'dayY1Wo'),
        gd(h.code,'repY'), gd(h.code,'woY'), gd(h.code,'repY1'), gd(h.code,'woY1'),
      );
    }
    const isTotal = h.isTotal;
    const dRow = sheet.addRow(row);
    dRow.height = 20;
    dRow.eachCell((cell, colIdx) => {
      cell.font = isTotal ? FONTS.HEADER : FONTS.DATA;
      if (isTotal) cell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: PALETTE.LIGHT_GRAY } };
      if (colIdx === 10 || colIdx === 13) {
        cell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: PALETTE.MEDIUM_GRAY } };
      }
      cell.alignment = colIdx === 1 ? { horizontal: 'left', vertical: 'middle' } : { horizontal: 'center', vertical: 'middle' };
      cell.border = { top: { style: 'thin' }, left: { style: 'thin' }, bottom: { style: 'thin' }, right: { style: 'thin' } };
    });
  });

  sheet.columns.forEach((col, idx) => { col.width = idx === 0 ? 30 : 13; });
}
