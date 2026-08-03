import { PALETTE, FONTS } from '../../shared/canonical-codes.js';

export function renderStat40(workbook, scope, calcData) {
  const sheet = workbook.addWorksheet('STAT 40 Court Disposal');
  const distName = (scope.self_name || 'DISTRICT').replace(/\s+DISTRICT$/i, '').toUpperCase();
  const { yearNum, fnEnd, fnStart } = calcData;

  sheet.mergeCells('A1:E1');
  const t1 = sheet.getCell('A1');
  t1.value = `STAT 40 — COURT DISPOSAL — ${distName} DISTRICT`;
  t1.font = FONTS.TITLE;
  t1.alignment = { horizontal: 'center', vertical: 'middle' };

  sheet.mergeCells('A2:E2');
  sheet.getCell('A2').value = `FN Period: ${fnStart} to ${fnEnd}`;
  sheet.getCell('A2').font = FONTS.DATA;
  sheet.getCell('A2').alignment = { horizontal: 'center', vertical: 'middle' };

  const msgRow = sheet.addRow([
    'This sheet requires court disposal data (convictions, acquittals, compoundings) ' +
    'which is not tracked in the current system. This sheet will be populated once ' +
    'the court integration module is implemented.'
  ]);
  msgRow.getCell(1).font = { ...FONTS.DATA, italic: true, color: { argb: 'FFAA0000' } };
  msgRow.getCell(1).alignment = { wrapText: true, vertical: 'top' };
  sheet.getRow(3).height = 60;

  sheet.columns.forEach((col, idx) => { col.width = idx === 0 ? 80 : 16; });
}
