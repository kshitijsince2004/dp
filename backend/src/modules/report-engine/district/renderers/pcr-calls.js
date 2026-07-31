import { PALETTE, FONTS } from '../../shared/canonical-codes.js';

export function renderPcrCalls(workbook, scope, calcData) {
  const sheet = workbook.addWorksheet('Upto PCR calls 25-26');
  const districtName = (scope.self_name || 'DISTRICT').toUpperCase();
  const children = scope.children_ids || [];
  const displayNames = scope.display_names || {};
  const yearNum = calcData.yearNum || 2026;

  sheet.mergeCells('A1:G1');
  const t1 = sheet.getCell('A1');
  t1.value = `COMPARATIVE PCR CALL STATEMENT OF ${districtName} DISTRICT UPTO DATE (${yearNum - 1} & ${yearNum})`;
  t1.font = FONTS.TITLE;

  const r2 = sheet.addRow(['S.No', 'Police Station', `PCR Calls Upto Date ${yearNum - 1}`, `PCR Calls Upto Date ${yearNum}`, 'Increase / Decrease', '% Variation']);
  r2.font = FONTS.HEADER;
  r2.eachCell(c => c.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: PALETTE.LIGHT_ORANGE } });

  let totY1 = 0;
  let totY = 0;

  children.forEach((psId, idx) => {
    const psName = displayNames[psId] || psId;
    const cnt = (calcData.pcrCounts && calcData.pcrCounts[psId]) || 0;
    totY += cnt;

    const dRow = sheet.addRow([
      idx + 1,
      psName,
      '-',
      cnt > 0 ? cnt : '-',
      '-',
      '-'
    ]);

    dRow.height = 20;
    dRow.eachCell((cell, colIdx) => {
      cell.font = FONTS.DATA;
      cell.alignment = colIdx === 2 ? { horizontal: 'left', vertical: 'middle' } : { horizontal: 'center', vertical: 'middle' };
      cell.border = { top: { style: 'thin' }, left: { style: 'thin' }, bottom: { style: 'thin' }, right: { style: 'thin' } };
    });
  });

  const totRow = sheet.addRow(['', 'TOTAL', totY1 > 0 ? totY1 : '-', totY > 0 ? totY : '-', '-', '-']);
  totRow.font = FONTS.HEADER;
  totRow.eachCell(c => {
    c.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: PALETTE.YELLOW } };
    c.border = { top: { style: 'medium' }, left: { style: 'thin' }, bottom: { style: 'medium' }, right: { style: 'thin' } };
  });

  sheet.columns.forEach((col, idx) => {
    col.width = idx === 1 ? 25 : 16;
  });
}
