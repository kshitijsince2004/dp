import { PALETTE, FONTS } from '../../shared/canonical-codes.js';
import { ALL_HEADS, buildGroupSums } from '../fn-heads.js';

export function renderStat02(workbook, scope, calcData) {
  const sheet = workbook.addWorksheet('STAT 2 Worked Out');
  const distName = (scope.self_name || 'DISTRICT').replace(/\s+DISTRICT$/i, '').toUpperCase();
  const { yearNum, fnEnd, fnStart } = calcData;
  const yearPrev = yearNum - 1;

  sheet.mergeCells('A1:I1');
  const t1 = sheet.getCell('A1');
  t1.value = `STAT 2 — DISPOSAL DURING FORTNIGHT — ${distName} DISTRICT`;
  t1.font = FONTS.TITLE;
  t1.alignment = { horizontal: 'center', vertical: 'middle' };

  sheet.mergeCells('A2:I2');
  sheet.getCell('A2').value = `FN Period: ${fnStart} to ${fnEnd}`;
  sheet.getCell('A2').font = FONTS.DATA;
  sheet.getCell('A2').alignment = { horizontal: 'center', vertical: 'middle' };

  const r3 = sheet.addRow([
    'Head of Crime',
    `Cases Solved FN ${yearNum}`, `Cases Solved FN ${yearPrev}`,
    `Cases Cancelled FN ${yearNum}`, `Cases Cancelled FN ${yearPrev}`,
    `Untraced FN ${yearNum}`, `Untraced FN ${yearPrev}`,
    `Persons Arrested FN ${yearNum}`, `Persons Arrested FN ${yearPrev}`,
  ]);
  r3.height = 30;
  r3.eachCell(c => {
    c.font = FONTS.HEADER;
    c.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: PALETTE.OLIVE_GREEN } };
    c.alignment = { horizontal: 'center', vertical: 'middle', wrapText: true };
    c.border = { top: { style: 'thin' }, left: { style: 'thin' }, bottom: { style: 'thin' }, right: { style: 'thin' } };
  });

  const dbc      = calcData.distByCode || {};
  const dbcWo    = calcData.distByCodeWo || {};
  const dbcCan   = calcData.distByCodeCan || {};
  const dbcUntr  = calcData.distByCodeUntr || {};
  const dbcArr   = calcData.distByCodeArr || {};
  const sumsWo   = buildGroupSums(dbcWo);
  const sumsCan  = buildGroupSums(dbcCan);
  const sumsUntr = buildGroupSums(dbcUntr);
  const sumsArr  = buildGroupSums(dbcArr);

  const g = (map, code, field) => Number(map[code]?.[field] || 0);
  const f = v => v > 0 ? v : '-';

  ALL_HEADS.forEach(h => {
    let woY, woY1, canY, canY1, untrY, untrY1, arrY, arrY1;
    if (h.isTotal) {
      woY   = sumsWo[h.group].fnY;   woY1   = sumsWo[h.group].fnY1;
      canY  = sumsCan[h.group].fnY;  canY1  = sumsCan[h.group].fnY1;
      untrY = sumsUntr[h.group].fnY; untrY1 = sumsUntr[h.group].fnY1;
      arrY  = sumsArr[h.group].fnY;  arrY1  = sumsArr[h.group].fnY1;
    } else {
      woY   = g(dbcWo,   h.code, 'fnY'); woY1   = g(dbcWo,   h.code, 'fnY1');
      canY  = g(dbcCan,  h.code, 'fnY'); canY1  = g(dbcCan,  h.code, 'fnY1');
      untrY = g(dbcUntr, h.code, 'fnY'); untrY1 = g(dbcUntr, h.code, 'fnY1');
      arrY  = g(dbcArr,  h.code, 'fnY'); arrY1  = g(dbcArr,  h.code, 'fnY1');
    }

    const row = sheet.addRow([
      h.label,
      f(woY), f(woY1),
      f(canY), f(canY1),
      f(untrY), f(untrY1),
      f(arrY), f(arrY1),
    ]);
    row.height = 20;
    row.eachCell((cell, col) => {
      cell.font = h.isTotal ? FONTS.HEADER : FONTS.DATA;
      if (h.isTotal) cell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: PALETTE.LIGHT_GRAY } };
      cell.alignment = col === 1 ? { horizontal: 'left', vertical: 'middle' } : { horizontal: 'center', vertical: 'middle' };
      cell.border = { top: { style: 'thin' }, left: { style: 'thin' }, bottom: { style: 'thin' }, right: { style: 'thin' } };
    });
  });

  sheet.columns.forEach((col, idx) => { col.width = idx === 0 ? 34 : 14; });
}
