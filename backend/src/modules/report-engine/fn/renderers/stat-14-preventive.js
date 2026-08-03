import { PALETTE, FONTS } from '../../shared/canonical-codes.js';

const PREV_ROWS = [
  { label: 'Bound Over (107/151 CrPC)', field: 'bound_over' },
  { label: 'Attached Under 83/84 CrPC', field: 'attached' },
  { label: 'Warrants Executed',          field: 'warrants' },
  { label: 'Summons Executed',           field: 'summons' },
  { label: 'Process Issued',             field: 'process' },
];

export function renderStat14(workbook, scope, calcData) {
  const sheet = workbook.addWorksheet('STAT 14 Preventive');
  const distName = (scope.self_name || 'DISTRICT').replace(/\s+DISTRICT$/i, '').toUpperCase();
  const { yearNum, fnEnd, fnStart } = calcData;
  const yearPrev = yearNum - 1;

  sheet.mergeCells('A1:C1');
  const t1 = sheet.getCell('A1');
  t1.value = `STAT 14 — PREVENTIVE MEASURES — ${distName} DISTRICT`;
  t1.font = FONTS.TITLE;
  t1.alignment = { horizontal: 'center', vertical: 'middle' };

  sheet.mergeCells('A2:C2');
  sheet.getCell('A2').value = `FN Period: ${fnStart} to ${fnEnd}`;
  sheet.getCell('A2').font = FONTS.DATA;
  sheet.getCell('A2').alignment = { horizontal: 'center', vertical: 'middle' };

  const hdr = sheet.addRow(['Measure', `FN ${yearNum}`, `FN ${yearPrev}`]);
  hdr.height = 26;
  hdr.eachCell(c => {
    c.font = FONTS.HEADER;
    c.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: PALETTE.OLIVE_GREEN } };
    c.alignment = { horizontal: 'center', vertical: 'middle', wrapText: true };
    c.border = { top: { style: 'thin' }, left: { style: 'thin' }, bottom: { style: 'thin' }, right: { style: 'thin' } };
  });

  const note = sheet.addRow(['Note: Preventive measure data not yet tracked in the current system.']);
  note.getCell(1).font = { ...FONTS.DATA, italic: true, color: { argb: 'FF888888' } };

  PREV_ROWS.forEach(r => {
    const row = sheet.addRow([r.label, '-', '-']);
    row.height = 20;
    row.eachCell((cell, col) => {
      cell.font = FONTS.DATA;
      cell.alignment = col === 1 ? { horizontal: 'left', vertical: 'middle' } : { horizontal: 'center', vertical: 'middle' };
      cell.border = { top: { style: 'thin' }, left: { style: 'thin' }, bottom: { style: 'thin' }, right: { style: 'thin' } };
    });
  });

  sheet.columns.forEach((col, idx) => { col.width = idx === 0 ? 36 : 14; });
}
