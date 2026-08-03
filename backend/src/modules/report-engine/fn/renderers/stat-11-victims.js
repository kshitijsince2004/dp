import { PALETTE, FONTS } from '../../shared/canonical-codes.js';

const VICTIM_CATS = [
  { label: 'Children (< 18 yrs)', field: 'child' },
  { label: 'Women',                field: 'women' },
  { label: 'Senior Citizens',      field: 'senior' },
  { label: 'SC/ST',                field: 'scst' },
  { label: 'Total Victims',        field: '__total__' },
];

export function renderStat11(workbook, scope, calcData) {
  const sheet = workbook.addWorksheet('STAT 11 Victims');
  const distName = (scope.self_name || 'DISTRICT').replace(/\s+DISTRICT$/i, '').toUpperCase();
  const { yearNum, fnEnd, fnStart } = calcData;
  const yearPrev = yearNum - 1;

  sheet.mergeCells('A1:C1');
  const t1 = sheet.getCell('A1');
  t1.value = `STAT 11 — VICTIMS BY CATEGORY — ${distName} DISTRICT`;
  t1.font = FONTS.TITLE;
  t1.alignment = { horizontal: 'center', vertical: 'middle' };

  sheet.mergeCells('A2:C2');
  sheet.getCell('A2').value = `FN Period: ${fnStart} to ${fnEnd}`;
  sheet.getCell('A2').font = FONTS.DATA;
  sheet.getCell('A2').alignment = { horizontal: 'center', vertical: 'middle' };

  const hdr = sheet.addRow(['Victim Category', `FN ${yearNum}`, `FN ${yearPrev}`]);
  hdr.height = 26;
  hdr.getCell(1).value = 'Victim Category';
  hdr.getCell(2).value = `FN ${yearNum}`;
  hdr.getCell(3).value = `FN ${yearPrev}`;
  hdr.eachCell(c => {
    c.font = FONTS.HEADER;
    c.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: PALETTE.OLIVE_GREEN } };
    c.alignment = { horizontal: 'center', vertical: 'middle', wrapText: true };
    c.border = { top: { style: 'thin' }, left: { style: 'thin' }, bottom: { style: 'thin' }, right: { style: 'thin' } };
  });

  const note = sheet.addRow(['Note: Victim demographic breakdown not yet available; data from victim module pending.']);
  note.getCell(1).font = { ...FONTS.DATA, italic: true, color: { argb: 'FF888888' } };

  VICTIM_CATS.forEach(cat => {
    const row = sheet.addRow([cat.label, '-', '-']);
    row.height = 20;
    row.eachCell((cell, col) => {
      cell.font = cat.field === '__total__' ? FONTS.HEADER : FONTS.DATA;
      if (cat.field === '__total__') cell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: PALETTE.LIGHT_GRAY } };
      cell.alignment = col === 1 ? { horizontal: 'left', vertical: 'middle' } : { horizontal: 'center', vertical: 'middle' };
      cell.border = { top: { style: 'thin' }, left: { style: 'thin' }, bottom: { style: 'thin' }, right: { style: 'thin' } };
    });
  });

  sheet.columns.forEach((col, idx) => { col.width = idx === 0 ? 36 : 14; });
}
