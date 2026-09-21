import { PALETTE, FONTS, EFIR_SHEET_ROWS, safeMerge } from '../../shared/canonical-codes.js';

export function renderEfirMatrix(workbook, scope, calcData) {
  let jurName = (scope.self_name || 'DISTRICT').toUpperCase().replace(/\s+DISTRICT$/i, '');
  if (scope.level === 'DISTRICT') jurName = `${jurName} DISTRICT`;
  let sheet = workbook.worksheets.find(w => w.name.startsWith('E-FIR')) || workbook.addWorksheet(`E-FIR ${jurName.slice(0, 20)}`);
  const children = scope.children_ids || [];
  const displayNames = scope.display_names || {};
  const psEfirById = calcData.psEfirById || {};

  safeMerge(sheet, 'A1:J1');
  const t1 = sheet.getCell('A1');
  t1.value = `E-FIR OF ${jurName}`;
  t1.font = FONTS.TITLE;

  const psHeaders = [];
  const subHeaders = ['Head'];
  children.forEach(psId => {
    const psName = (displayNames[psId] || psId).slice(0, 10);
    psHeaders.push(psName, '');
    subHeaders.push('REP', 'W/O');
  });

  const r2 = sheet.addRow(['Head', ...psHeaders]);
  r2.font = FONTS.HEADER;
  r2.eachCell(c => c.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: PALETTE.LIGHT_ORANGE } });

  const r3 = sheet.addRow(subHeaders);
  r3.font = FONTS.HEADER;
  r3.eachCell(c => c.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: PALETTE.LIGHT_ORANGE } });

  EFIR_SHEET_ROWS.forEach(h => {
    const rowVals = [h.label];
    children.forEach(psId => {
      const cnt = Number(psEfirById[psId]?.[h.head] || 0);
      rowVals.push(cnt || '-', '-'); // W/O not separately tracked for eFIR; show '-'
    });

    const dRow = sheet.addRow(rowVals);
    dRow.height = 24;
    dRow.eachCell((cell, colIdx) => {
      cell.font = FONTS.EFIR_DATA;
      cell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: PALETTE.PALE_YELLOW } };
      if (colIdx === 1) {
        cell.font = FONTS.HEADER;
        if (h.label.includes('MV Theft') || h.label.includes('Other Theft')) {
          cell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: PALETTE.GREEN } };
        }
      }
      cell.alignment = colIdx === 1 ? { horizontal: 'left', vertical: 'middle' } : { horizontal: 'center', vertical: 'middle' };
      cell.border = { top: { style: 'thin' }, left: { style: 'thin' }, bottom: { style: 'thin' }, right: { style: 'thin' } };
    });
  });

  sheet.columns.forEach((col, idx) => { col.width = idx === 0 ? 25 : 10; });
}
