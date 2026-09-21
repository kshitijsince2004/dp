import { PALETTE, FONTS, safeMerge } from '../../shared/canonical-codes.js';

export function renderD13_66dp(workbook, scope, calcData) {
  let sheet = workbook.getWorksheet('D13 66DP') || workbook.addWorksheet('D13 66DP');
  const districtName = (scope.self_name || 'DISTRICT').toUpperCase();
  const subDivMap = calcData.subDivMap || {};
  const yearNum = calcData.yearNum || 2026;

  safeMerge(sheet, 'A1:F1');
  const t1 = sheet.getCell('A1');
  t1.value = `SUMMARY OF ACTION U/S 66 DP ACT (D-13) — ${districtName} DISTRICT (${yearNum})`;
  t1.font = FONTS.TITLE;
  t1.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: PALETTE.LIGHT_PINK } };

  const r2 = sheet.addRow([
    'S.No', 'Sub Division',
    'Vehicles Seized Today', 'Persons Arrested Today',
    `Upto Date ${yearNum} Vehicles`, `Upto Date ${yearNum} Persons`
  ]);
  r2.font = FONTS.HEADER;
  r2.eachCell(c => c.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: PALETTE.LIGHT_ORANGE } });

  const subDivNames = Array.from(new Set(Object.values(subDivMap)));
  const list = subDivNames.length > 0 ? subDivNames : ['KOTWALI', 'SADAR BAZAR', 'CIVIL LINES'];

  list.forEach((sdName, idx) => {
    const dRow = sheet.addRow([
      idx + 1,
      sdName,
      '-', '-', '-', '-'
    ]);

    dRow.height = 22;
    dRow.eachCell((cell, colIdx) => {
      cell.font = FONTS.DATA;
      cell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: PALETTE.LIGHT_CREAM } };
      cell.alignment = colIdx === 2 ? { horizontal: 'left', vertical: 'middle' } : { horizontal: 'center', vertical: 'middle' };
      cell.border = { top: { style: 'thin' }, left: { style: 'thin' }, bottom: { style: 'thin' }, right: { style: 'thin' } };
    });
  });

  const totRow = sheet.addRow(['', 'TOTAL', '-', '-', '-', '-']);
  totRow.font = FONTS.HEADER;
  totRow.eachCell(c => {
    c.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: PALETTE.VERY_PALE_YELLOW } };
    c.border = { top: { style: 'medium' }, left: { style: 'thin' }, bottom: { style: 'medium' }, right: { style: 'thin' } };
  });

  sheet.columns.forEach((col, idx) => {
    col.width = idx === 1 ? 25 : 20;
  });
}
