import { PALETTE, FONTS } from '../../shared/canonical-codes.js';

export function renderN123Register(workbook, scope, calcData) {
  const sheet = workbook.addWorksheet('N-1,N-2,N-3 ');
  const districtName = (scope.self_name || 'DISTRICT').toUpperCase();
  const children = scope.children_ids || [];
  const displayNames = scope.display_names || {};

  sheet.mergeCells('A1:AC1');
  const t1 = sheet.getCell('A1');
  t1.value = `Daily ${districtName} District Crime`;
  t1.font = FONTS.N123_SUBDIV;
  t1.alignment = { horizontal: 'center', vertical: 'middle' };

  const psHeaders = [];
  const subHeaders = ['HEAD'];
  children.forEach(psId => {
    const psName = (displayNames[psId] || psId).slice(0, 10);
    psHeaders.push(psName, '');
    subHeaders.push('REP', 'W-O');
  });

  const r2 = sheet.addRow(['HEAD', ...psHeaders]);
  r2.font = FONTS.N123_PS_ABBREV;
  r2.eachCell(c => c.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: PALETTE.LIGHT_ORANGE } });

  const r3 = sheet.addRow(subHeaders);
  r3.font = FONTS.N123_REP_WO;
  r3.eachCell(c => c.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: PALETTE.LIGHT_ORANGE } });

  const heads = [
    'Dacoity', 'Murder', 'Att. Murder', 'Robbery', 'Riots', 'Kid.For Ransom', 'Rape',
    'TOTAL HEINOUS', 'Organised Crime', 'Terrorist Crime', 'Snatching', 'Burglary',
    'Extortion', 'Hurt', 'M V Theft', 'House Theft', 'Other Theft', 'Misc. Theft',
    'Kidnapping', 'Abduction', 'M O Women', 'Eve Teasing', 'Fatal Accident', 'Simple Accident',
    'Other IPC', 'TOTAL NON HEINOUS', 'TOTAL IPC', 'Arms Act', 'Excise Act', 'Gambling Act',
    'NDPS Act', 'POCSO Act', 'Other Act', 'TOTAL ACT', 'GRAND TOTAL'
  ];

  heads.forEach(h => {
    const rowVals = [h];
    children.forEach(() => rowVals.push('-', '-'));

    const dRow = sheet.addRow(rowVals);
    dRow.height = 24;
    dRow.eachCell((cell, colIdx) => {
      cell.font = FONTS.DATA;
      if (h.startsWith('TOTAL') || h === 'GRAND TOTAL') {
        cell.font = FONTS.HEADER;
        cell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: PALETTE.LIGHT_GRAY } };
      }
      cell.alignment = colIdx === 1 ? { horizontal: 'left', vertical: 'middle' } : { horizontal: 'center', vertical: 'middle' };
      cell.border = { top: { style: 'thin' }, left: { style: 'thin' }, bottom: { style: 'thin' }, right: { style: 'thin' } };
    });
  });

  sheet.columns.forEach((col, idx) => {
    col.width = idx === 0 ? 30 : 12;
  });
}
