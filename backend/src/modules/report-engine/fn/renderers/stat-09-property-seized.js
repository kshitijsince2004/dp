import { PALETTE, FONTS } from '../../shared/canonical-codes.js';

const PROP_CATS = [
  'Arms & Ammunition', 'Narcotic Drugs', 'Liquor', 'Stolen Vehicles',
  'Stolen Cattle', 'Cash', 'Ornaments / Jewellery', 'Other Property',
];

export function renderStat09(workbook, scope, calcData) {
  const sheet = workbook.addWorksheet('STAT 9 Property Seized');
  const distName = (scope.self_name || 'DISTRICT').replace(/\s+DISTRICT$/i, '').toUpperCase();
  const { yearNum, fnEnd, fnStart } = calcData;

  sheet.mergeCells('A1:E1');
  const t1 = sheet.getCell('A1');
  t1.value = `STAT 9 — PROPERTY SEIZED — ${distName} DISTRICT`;
  t1.font = FONTS.TITLE;
  t1.alignment = { horizontal: 'center', vertical: 'middle' };

  sheet.mergeCells('A2:E2');
  sheet.getCell('A2').value = `FN Period: ${fnStart} to ${fnEnd}`;
  sheet.getCell('A2').font = FONTS.DATA;
  sheet.getCell('A2').alignment = { horizontal: 'center', vertical: 'middle' };

  const hdr = sheet.addRow(['Category', 'Qty FN', 'Value ₹ FN', 'Qty Upto', 'Value ₹ Upto']);
  hdr.height = 26;
  hdr.eachCell(c => {
    c.font = FONTS.HEADER;
    c.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: PALETTE.OLIVE_GREEN } };
    c.alignment = { horizontal: 'center', vertical: 'middle', wrapText: true };
    c.border = { top: { style: 'thin' }, left: { style: 'thin' }, bottom: { style: 'thin' }, right: { style: 'thin' } };
  });

  const note = sheet.addRow(['Note: Property seizure detail not yet linked to crime categories in the system.']);
  note.getCell(1).font = { ...FONTS.DATA, italic: true, color: { argb: 'FF888888' } };

  PROP_CATS.forEach(label => {
    const row = sheet.addRow([label, '-', '-', '-', '-']);
    row.height = 20;
    row.eachCell((cell, col) => {
      cell.font = FONTS.DATA;
      cell.alignment = col === 1 ? { horizontal: 'left', vertical: 'middle' } : { horizontal: 'center', vertical: 'middle' };
      cell.border = { top: { style: 'thin' }, left: { style: 'thin' }, bottom: { style: 'thin' }, right: { style: 'thin' } };
    });
  });

  sheet.columns.forEach((col, idx) => { col.width = idx === 0 ? 34 : 16; });
}
