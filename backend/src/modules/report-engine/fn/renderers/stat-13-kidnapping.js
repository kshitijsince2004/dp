import { PALETTE, FONTS } from '../../shared/canonical-codes.js';

const KID_ROWS = [
  { label: 'Kidnapping for Ransom',  subcode: 'KID_FOR_RANSOM' },
  { label: 'Kidnapping (Other)',     subcode: 'KIDNAPPING' },
  { label: 'Abduction',             subcode: 'ABDUCTION' },
  { label: 'TOTAL',                 subcode: '__total__' },
];

export function renderStat13(workbook, scope, calcData) {
  const sheet = workbook.addWorksheet('STAT 13 Kidnapping');
  const distName = (scope.self_name || 'DISTRICT').replace(/\s+DISTRICT$/i, '').toUpperCase();
  const { yearNum, fnEnd, fnStart } = calcData;
  const yearPrev = yearNum - 1;

  sheet.mergeCells('A1:G1');
  const t1 = sheet.getCell('A1');
  t1.value = `STAT 13 — KIDNAPPING & ABDUCTION — ${distName} DISTRICT`;
  t1.font = FONTS.TITLE;
  t1.alignment = { horizontal: 'center', vertical: 'middle' };

  sheet.mergeCells('A2:G2');
  sheet.getCell('A2').value = `FN Period: ${fnStart} to ${fnEnd}`;
  sheet.getCell('A2').font = FONTS.DATA;
  sheet.getCell('A2').alignment = { horizontal: 'center', vertical: 'middle' };

  const hdr = sheet.addRow([
    'Category',
    `Cases FN ${yearNum}`, `Cases FN ${yearPrev}`,
    `Traced FN ${yearNum}`, `Traced FN ${yearPrev}`,
    `Pending FN ${yearNum}`, `Pending FN ${yearPrev}`,
  ]);
  hdr.height = 26;
  hdr.eachCell(c => {
    c.font = FONTS.HEADER;
    c.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: PALETTE.OLIVE_GREEN } };
    c.alignment = { horizontal: 'center', vertical: 'middle', wrapText: true };
    c.border = { top: { style: 'thin' }, left: { style: 'thin' }, bottom: { style: 'thin' }, right: { style: 'thin' } };
  });

  const dbc = calcData.distByCode || {};
  const g = (code, field) => Number(dbc[code]?.[field] || 0);
  const f = v => v > 0 ? v : '-';
  let totY = 0, totY1 = 0;

  KID_ROWS.forEach(h => {
    let fnY, fnY1;
    if (h.subcode === '__total__') { fnY = totY; fnY1 = totY1; }
    else { fnY = g(h.subcode, 'fnY'); fnY1 = g(h.subcode, 'fnY1'); totY += fnY; totY1 += fnY1; }
    const row = sheet.addRow([h.label, f(fnY), f(fnY1), '-', '-', '-', '-']);
    row.height = 20;
    row.eachCell((cell, col) => {
      cell.font = h.subcode === '__total__' ? FONTS.HEADER : FONTS.DATA;
      if (h.subcode === '__total__') cell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: PALETTE.LIGHT_GRAY } };
      cell.alignment = col === 1 ? { horizontal: 'left', vertical: 'middle' } : { horizontal: 'center', vertical: 'middle' };
      cell.border = { top: { style: 'thin' }, left: { style: 'thin' }, bottom: { style: 'thin' }, right: { style: 'thin' } };
    });
  });

  sheet.columns.forEach((col, idx) => { col.width = idx === 0 ? 30 : 14; });
}
