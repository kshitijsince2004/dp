import { PALETTE, FONTS } from '../../shared/canonical-codes.js';

export function renderD9FirArrests(workbook, scope, calcData) {
  const sheet = workbook.addWorksheet('D-9 FIR Arrests ');
  const districtName = (scope.self_name || 'DISTRICT').toUpperCase();

  sheet.mergeCells('A1:M1');
  const t1 = sheet.getCell('A1');
  t1.value = `DAILY MORNING DIARY REGARDING PERSONS ARRESTED IN FIR, ${districtName} DISTRICT`;
  t1.font = FONTS.TITLE;

  const headers = [
    'S.No', 'Police Station', 'Name', 'Age', 'Parentage', 'Address',
    'FIR No. & Date', 'U/S', 'Name of Arresting Officer',
    'No. of Previous Involvements', 'PO/History Sheeter', 'Place Of Arrest', 'Status'
  ];

  const r2 = sheet.addRow(headers);
  r2.font = FONTS.HEADER;
  r2.eachCell((c, colIdx) => {
    c.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: PALETTE.SAGE_GREEN } };
    if (colIdx === 12) { // Place of arrest
      c.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: PALETTE.DUSTY_PINK } };
    }
  });

  const list = calcData.firArrestsList || [];

  if (list.length === 0) {
    sheet.addRow(['-', 'Nil FIR arrests reported today', '-', '-', '-', '-', '-', '-', '-', '-', '-', '-', '-']);
    return;
  }

  // Group by Sub-Division
  const groups = {};
  list.forEach(item => {
    const sdName = (item.sub_div_name || 'SUB DIVISION').toUpperCase();
    if (!groups[sdName]) groups[sdName] = [];
    groups[sdName].push(item);
  });

  Object.keys(groups).forEach(sdName => {
    const sdRow = sheet.addRow([`SUB DIVISION - ${sdName}`]);
    sheet.mergeCells(`A${sdRow.number}:M${sdRow.number}`);
    const sdCell = sheet.getCell(`A${sdRow.number}`);
    sdCell.font = FONTS.HEADER;
    sdCell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: PALETTE.LIGHT_GREEN } };

    groups[sdName].forEach((item, idx) => {
      const dRow = sheet.addRow([
        idx + 1,
        item.ps_name || '-',
        item.person_name || 'Arrested Person',
        item.age || '-',
        'S/o Parentage',
        'Delhi Address',
        item.fir_no ? `${item.fir_no} dt ${item.registration_date}` : '-',
        'IPC / BNS',
        'Arresting Officer',
        '0',
        'No',
        'Place of Arrest',
        item.custody_status || 'J/C'
      ]);

      dRow.height = 22;
      dRow.eachCell((cell, colIdx) => {
        cell.font = FONTS.DATA;
        cell.alignment = { horizontal: 'center', vertical: 'middle' };
        if (colIdx === 12) {
          cell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: PALETTE.DUSTY_PINK } };
        }
        cell.border = { top: { style: 'thin' }, left: { style: 'thin' }, bottom: { style: 'thin' }, right: { style: 'thin' } };
      });
    });
  });

  sheet.columns.forEach((col, idx) => {
    col.width = idx === 1 ? 22 : (idx === 2 || idx === 5 ? 20 : 14);
  });
}
