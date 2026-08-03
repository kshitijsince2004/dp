import { PALETTE, FONTS } from '../../shared/canonical-codes.js';

const VEH_TYPES = [
  'Car', 'Jeep/Van/SUV', 'Motorcycle', 'Scooter', 'Truck/Bus', 'Tractor', 'Other Vehicle',
];

export function renderStat08(workbook, scope, calcData) {
  const sheet = workbook.addWorksheet('STAT 8 Vehicle Theft');
  const distName = (scope.self_name || 'DISTRICT').replace(/\s+DISTRICT$/i, '').toUpperCase();
  const { yearNum, fnEnd, fnStart } = calcData;

  sheet.mergeCells('A1:E1');
  const t1 = sheet.getCell('A1');
  t1.value = `STAT 8 — VEHICLE THEFT — ${distName} DISTRICT`;
  t1.font = FONTS.TITLE;
  t1.alignment = { horizontal: 'center', vertical: 'middle' };

  sheet.mergeCells('A2:E2');
  sheet.getCell('A2').value = `FN Period: ${fnStart} to ${fnEnd}`;
  sheet.getCell('A2').font = FONTS.DATA;
  sheet.getCell('A2').alignment = { horizontal: 'center', vertical: 'middle' };

  const hdr = sheet.addRow(['Vehicle Type', 'Stolen FN', 'Recovered FN', 'Stolen Upto', 'Recovered Upto']);
  hdr.height = 26;
  hdr.eachCell(c => {
    c.font = FONTS.HEADER;
    c.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: PALETTE.OLIVE_GREEN } };
    c.alignment = { horizontal: 'center', vertical: 'middle', wrapText: true };
    c.border = { top: { style: 'thin' }, left: { style: 'thin' }, bottom: { style: 'thin' }, right: { style: 'thin' } };
  });

  const note = sheet.addRow(['Note: Vehicle type breakdown not yet tracked in the system.']);
  note.getCell(1).font = { ...FONTS.DATA, italic: true, color: { argb: 'FF888888' } };

  VEH_TYPES.forEach(label => {
    const row = sheet.addRow([label, '-', '-', '-', '-']);
    row.height = 20;
    row.eachCell((cell, col) => {
      cell.font = FONTS.DATA;
      cell.alignment = col === 1 ? { horizontal: 'left', vertical: 'middle' } : { horizontal: 'center', vertical: 'middle' };
      cell.border = { top: { style: 'thin' }, left: { style: 'thin' }, bottom: { style: 'thin' }, right: { style: 'thin' } };
    });
  });

  sheet.columns.forEach((col, idx) => { col.width = idx === 0 ? 28 : 16; });
}
