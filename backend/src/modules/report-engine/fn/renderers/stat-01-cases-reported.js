import { PALETTE, FONTS } from '../../shared/canonical-codes.js';
import { ALL_HEADS, buildGroupSums } from '../fn-heads.js';

export function renderStat01(workbook, scope, calcData) {
  const sheet = workbook.addWorksheet('STAT 1 Cases Reported');
  const distName = (scope.self_name || 'DISTRICT').replace(/\s+DISTRICT$/i, '').toUpperCase();
  const { yearNum, fnEnd, fnStart } = calcData;
  const yearPrev = yearNum - 1;

  // Title
  sheet.mergeCells('A1:F1');
  const t1 = sheet.getCell('A1');
  t1.value = `STAT 1 — CASES REPORTED — ${distName} DISTRICT`;
  t1.font = FONTS.TITLE;
  t1.alignment = { horizontal: 'center', vertical: 'middle' };

  sheet.mergeCells('A2:F2');
  const t2 = sheet.getCell('A2');
  t2.value = `FN Ending: ${fnEnd}  |  FN Period: ${fnStart} to ${fnEnd}`;
  t2.font = FONTS.DATA;
  t2.alignment = { horizontal: 'center', vertical: 'middle' };

  const hdr = sheet.addRow([
    'Head of Crime',
    `During FN ${yearNum}`,
    `During FN ${yearPrev} (Corr.)`,
    `Upto Date ${yearNum}`,
    `Upto Date ${yearPrev} (Corr.)`,
    'Variation FN %',
  ]);
  hdr.height = 26;
  hdr.eachCell(c => {
    c.font = FONTS.HEADER;
    c.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: PALETTE.OLIVE_GREEN } };
    c.alignment = { horizontal: 'center', vertical: 'middle', wrapText: true };
    c.border = { top: { style: 'thin' }, left: { style: 'thin' }, bottom: { style: 'thin' }, right: { style: 'thin' } };
  });

  const dbc = calcData.distByCode || {};
  const gd = (code, field) => Number(dbc[code]?.[field] || 0);
  const sums = buildGroupSums(dbc);

  const f = v => v > 0 ? v : '-';
  const fp = (y, y1) => {
    if (!y1) return y > 0 ? '+100%' : '-';
    const pct = ((y - y1) / y1) * 100;
    return `${pct >= 0 ? '+' : ''}${pct.toFixed(1)}%`;
  };

  ALL_HEADS.forEach(h => {
    let fnY, fnY1, uptoY, uptoY1;
    if (h.isTotal) {
      ({ fnY, fnY1, uptoY, uptoY1 } = sums[h.group]);
    } else {
      fnY    = gd(h.code, 'fnY');
      fnY1   = gd(h.code, 'fnY1');
      uptoY  = gd(h.code, 'uptoY');
      uptoY1 = gd(h.code, 'uptoY1');
    }

    const row = sheet.addRow([h.label, f(fnY), f(fnY1), f(uptoY), f(uptoY1), fp(fnY, fnY1)]);
    row.height = 20;
    row.eachCell((cell, col) => {
      cell.font = h.isTotal ? FONTS.HEADER : FONTS.DATA;
      if (h.isTotal) cell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: PALETTE.LIGHT_GRAY } };
      cell.alignment = col === 1 ? { horizontal: 'left', vertical: 'middle' } : { horizontal: 'center', vertical: 'middle' };
      cell.border = { top: { style: 'thin' }, left: { style: 'thin' }, bottom: { style: 'thin' }, right: { style: 'thin' } };
    });
  });

  sheet.columns.forEach((col, idx) => { col.width = idx === 0 ? 34 : 16; });
}
