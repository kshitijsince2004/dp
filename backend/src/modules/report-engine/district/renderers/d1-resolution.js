import { PALETTE, FONTS } from '../../shared/canonical-codes.js';

export function renderD1Resolution(workbook, scope, calcData) {
  const sheet = workbook.addWorksheet(' D1,N-1,2,3 Res');
  const districtName = (scope.self_name || 'DISTRICT').toUpperCase();
  const yearNum = calcData.yearNum || 2026;

  sheet.mergeCells('A1:AA1');
  const t1 = sheet.getCell('A1');
  t1.value = `DAILY DIARY ${districtName} DISTRICT — RESOLUTION VIEW (Jt CP/CR Office)`;
  t1.font = FONTS.TITLE;

  const r2 = sheet.addRow([
    'HEAD',
    'Today Y Rep', 'Today Y W-O', 'Today Y-1 Rep', 'Today Y-1 W-O',
    'Inc/Dec %',
    'Upto Date Y Rep', 'Upto Date Y W-O', 'Upto Date Y N-W', 'W/out %age Y',
    'Upto Date Y-1 Rep', 'Upto Date Y-1 W-O', 'W/out %age Y-1',
    'Upto Date Y (Jt CP)', 'Upto Date Y W-O', 'Upto Date Y-1 (Jt CP)', 'Upto Date Y-1 W-O'
  ]);
  r2.font = FONTS.HEADER;
  r2.eachCell((c, colIdx) => {
    c.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: PALETTE.OLIVE_GREEN } };
    if (colIdx === 9) { // N-W column
      c.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: PALETTE.SALMON_ORANGE } };
    }
  });

  const heads = [
    'Dacoity', 'Murder', 'Att. Murder', 'Robbery', 'Riots', 'Kid.For Ransom', 'Rape',
    'TOTAL HEINOUS', 'Organised Crime', 'Terrorist Crime', 'Snatching', 'Burglary',
    'Extortion', 'Hurt', 'M V Theft', 'House Theft', 'Misc. Theft', 'Kidnapping', 'Abduction',
    'M O Women', 'Eve Teasing', 'Fatal Accident', 'Simple Accident', 'Total Cheating',
    'Drugging', 'Dowry Death', 'Other IPC/BNS', 'TOTAL NON HEINOUS', 'TOTAL IPC/BNS',
    'Arms Act', 'Excise Act', 'Gambling Act', 'NDPS Act', 'POCSO Act', 'Other Act', 'TOTAL ACT', 'GRAND TOTAL'
  ];

  heads.forEach(h => {
    const isTotal = h.startsWith('TOTAL') || h === 'GRAND TOTAL';
    const dRow = sheet.addRow([
      h, '-', '-', '-', '-', '-', '-', '-', '-', '-', '-', '-', '-', '-', '-', '-', '-'
    ]);

    dRow.height = 20;
    dRow.eachCell((cell, colIdx) => {
      cell.font = isTotal ? FONTS.HEADER : FONTS.DATA;
      if (isTotal) {
        cell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: PALETTE.LIGHT_GRAY } };
      }
      if (colIdx === 10 || colIdx === 13) {
        cell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: PALETTE.MEDIUM_GRAY } };
      }
      cell.alignment = colIdx === 1 ? { horizontal: 'left', vertical: 'middle' } : { horizontal: 'center', vertical: 'middle' };
      cell.border = { top: { style: 'thin' }, left: { style: 'thin' }, bottom: { style: 'thin' }, right: { style: 'thin' } };
    });
  });

  sheet.columns.forEach((col, idx) => {
    col.width = idx === 0 ? 30 : 13;
  });
}
