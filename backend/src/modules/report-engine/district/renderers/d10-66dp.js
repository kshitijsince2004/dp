import { PALETTE, FONTS, safeMerge } from '../../shared/canonical-codes.js';

export function renderD10_66dp(workbook, scope, calcData) {
  let sheet = workbook.getWorksheet('D10 Action of 66 DP Act') || workbook.getWorksheet('D10 Action of 66 DP Act ') || workbook.addWorksheet('D10 Action of 66 DP Act');
  const districtName = (scope.self_name || 'DISTRICT').toUpperCase();
  const children = scope.children_ids || [];
  const displayNames = scope.display_names || {};
  const yearNum = calcData.yearNum || 2026;

  safeMerge(sheet, 'A1:K1');
  const t1 = sheet.getCell('A1');
  t1.value = `STATEMENT REGARDING ACTION U/S 66 DP ACT IN ${districtName} DISTRICT (${yearNum})`;
  t1.font = FONTS.TITLE;

  const r2 = sheet.addRow([
    'S.No', 'Police Station',
    'Today 2-Wheeler', 'Today 4-Wheeler', 'Today Total Veh.', 'Today Persons Arrested',
    `Upto Date ${yearNum} 2-Wheeler`, `Upto Date ${yearNum} 4-Wheeler`, `Upto Date ${yearNum} Total Veh.`, `Upto Date ${yearNum} Persons Arrested`
  ]);
  r2.font = FONTS.HEADER;
  r2.eachCell(c => c.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: PALETTE.LIGHT_ORANGE } });

  children.forEach((psId, idx) => {
    const psName = displayNames[psId] || psId;
    const dRow = sheet.addRow([
      idx + 1,
      psName,
      '-', '-', '-', '-', '-', '-', '-', '-'
    ]);

    dRow.height = 20;
    dRow.eachCell((cell, colIdx) => {
      cell.font = FONTS.DATA;
      cell.alignment = colIdx === 2 ? { horizontal: 'left', vertical: 'middle' } : { horizontal: 'center', vertical: 'middle' };
      cell.border = { top: { style: 'thin' }, left: { style: 'thin' }, bottom: { style: 'thin' }, right: { style: 'thin' } };
    });
  });

  const totRow = sheet.addRow(['', 'TOTAL', '-', '-', '-', '-', '-', '-', '-', '-']);
  totRow.font = FONTS.HEADER;
  totRow.eachCell(c => {
    c.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: PALETTE.YELLOW } };
    c.border = { top: { style: 'medium' }, left: { style: 'thin' }, bottom: { style: 'medium' }, right: { style: 'thin' } };
  });

  sheet.columns.forEach((col, idx) => {
    col.width = idx === 1 ? 25 : 15;
  });
}
