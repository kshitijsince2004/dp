import { PALETTE, FONTS } from '../../shared/canonical-codes.js';

const MO_ROWS = [
  { label: 'Cutting / Breaking Lock', field: 'lock_break' },
  { label: 'Breaking Wall / Roof', field: 'wall_break' },
  { label: 'Removing Door / Window', field: 'door_window' },
  { label: 'Through Drain / Gutter', field: 'drain' },
  { label: 'Impersonation', field: 'impersonation' },
  { label: 'Other Mode', field: 'other' },
  { label: 'TOTAL', field: '__total__' },
];

export function renderStat05(workbook, scope, calcData) {
  const sheet = workbook.addWorksheet('STAT 5 Burglary MO');
  const distName = (scope.self_name || 'DISTRICT').replace(/\s+DISTRICT$/i, '').toUpperCase();
  const { yearNum, fnEnd, fnStart } = calcData;
  const yearPrev = yearNum - 1;

  sheet.mergeCells('A1:E1');
  const t1 = sheet.getCell('A1');
  t1.value = `STAT 5 — BURGLARY MODE OF OPERATION — ${distName} DISTRICT`;
  t1.font = FONTS.TITLE;
  t1.alignment = { horizontal: 'center', vertical: 'middle' };

  sheet.mergeCells('A2:E2');
  sheet.getCell('A2').value = `FN Period: ${fnStart} to ${fnEnd}`;
  sheet.getCell('A2').font = FONTS.DATA;
  sheet.getCell('A2').alignment = { horizontal: 'center', vertical: 'middle' };

  const hdr = sheet.addRow([
    'Mode of Operation',
    `FN ${yearNum}`, `FN ${yearPrev}`,
    `Upto ${yearNum}`, `Upto ${yearPrev}`,
  ]);
  hdr.height = 26;
  hdr.eachCell(c => {
    c.font = FONTS.HEADER;
    c.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: PALETTE.OLIVE_GREEN } };
    c.alignment = { horizontal: 'center', vertical: 'middle', wrapText: true };
    c.border = { top: { style: 'thin' }, left: { style: 'thin' }, bottom: { style: 'thin' }, right: { style: 'thin' } };
  });

  const f = v => v > 0 ? v : '-';
  const note = sheet.addRow(['Note: Burglary MO breakdown not yet tracked in the system.']);
  note.getCell(1).font = { ...FONTS.DATA, italic: true, color: { argb: 'FF888888' } };

  MO_ROWS.forEach(r => {
    const row = sheet.addRow([r.label, '-', '-', '-', '-']);
    row.height = 20;
    row.eachCell((cell, col) => {
      cell.font = r.field === '__total__' ? FONTS.HEADER : FONTS.DATA;
      if (r.field === '__total__') cell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: PALETTE.LIGHT_GRAY } };
      cell.alignment = col === 1 ? { horizontal: 'left', vertical: 'middle' } : { horizontal: 'center', vertical: 'middle' };
      cell.border = { top: { style: 'thin' }, left: { style: 'thin' }, bottom: { style: 'thin' }, right: { style: 'thin' } };
    });
  });

  sheet.columns.forEach((col, idx) => { col.width = idx === 0 ? 36 : 14; });
}
