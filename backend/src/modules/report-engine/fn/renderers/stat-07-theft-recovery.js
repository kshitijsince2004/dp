import { PALETTE, FONTS } from '../../shared/canonical-codes.js';

const THEFT_HEADS = [
  { label: 'House Theft',   code: 'HOUSE_THEFT' },
  { label: 'MV Theft',      code: 'MV_THEFT' },
  { label: 'Other Theft',   code: 'OTHER_THEFT' },
  { label: 'TOTAL THEFT',   code: '__total__' },
];

export function renderStat07(workbook, scope, calcData) {
  const sheet = workbook.addWorksheet('STAT 7 Theft Recovery');
  const distName = (scope.self_name || 'DISTRICT').replace(/\s+DISTRICT$/i, '').toUpperCase();
  const { yearNum, fnEnd, fnStart } = calcData;
  const yearPrev = yearNum - 1;

  sheet.mergeCells('A1:G1');
  const t1 = sheet.getCell('A1');
  t1.value = `STAT 7 — THEFT & RECOVERY OF PROPERTY — ${distName} DISTRICT`;
  t1.font = FONTS.TITLE;
  t1.alignment = { horizontal: 'center', vertical: 'middle' };

  sheet.mergeCells('A2:G2');
  sheet.getCell('A2').value = `FN Period: ${fnStart} to ${fnEnd}`;
  sheet.getCell('A2').font = FONTS.DATA;
  sheet.getCell('A2').alignment = { horizontal: 'center', vertical: 'middle' };

  const hdr = sheet.addRow([
    'Crime Head',
    `Cases FN ${yearNum}`, `Cases FN ${yearPrev}`,
    `Stolen ₹ FN ${yearNum}`, `Stolen ₹ FN ${yearPrev}`,
    `Recovered ₹ FN ${yearNum}`, `Recovered ₹ FN ${yearPrev}`,
  ]);
  hdr.height = 30;
  hdr.eachCell(c => {
    c.font = FONTS.HEADER;
    c.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: PALETTE.OLIVE_GREEN } };
    c.alignment = { horizontal: 'center', vertical: 'middle', wrapText: true };
    c.border = { top: { style: 'thin' }, left: { style: 'thin' }, bottom: { style: 'thin' }, right: { style: 'thin' } };
  });

  const dbc  = calcData.distByCode || {};
  const g = (code, field) => Number(dbc[code]?.[field] || 0);
  const f = v => v > 0 ? v : '-';

  let totY = 0, totY1 = 0;

  THEFT_HEADS.forEach(h => {
    let fnY, fnY1;
    if (h.code === '__total__') {
      fnY = totY; fnY1 = totY1;
    } else {
      fnY  = g(h.code, 'fnY');
      fnY1 = g(h.code, 'fnY1');
      totY  += fnY;
      totY1 += fnY1;
    }
    const row = sheet.addRow([h.label, f(fnY), f(fnY1), '-', '-', '-', '-']);
    row.height = 20;
    row.eachCell((cell, col) => {
      cell.font = h.code === '__total__' ? FONTS.HEADER : FONTS.DATA;
      if (h.code === '__total__') cell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: PALETTE.LIGHT_GRAY } };
      cell.alignment = col === 1 ? { horizontal: 'left', vertical: 'middle' } : { horizontal: 'center', vertical: 'middle' };
      cell.border = { top: { style: 'thin' }, left: { style: 'thin' }, bottom: { style: 'thin' }, right: { style: 'thin' } };
    });
  });

  const note = sheet.addRow(['Note: Property value (stolen/recovered) fields not yet available in current data model.']);
  note.getCell(1).font = { ...FONTS.DATA, italic: true, color: { argb: 'FF888888' } };

  sheet.columns.forEach((col, idx) => { col.width = idx === 0 ? 24 : 18; });
}
