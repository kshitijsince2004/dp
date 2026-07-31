import { PALETTE, FONTS } from '../../shared/canonical-codes.js';

export function renderD9KalArrests(workbook, scope, calcData) {
  const sheet = workbook.addWorksheet('D-9 Kal Arrests');
  const districtName = (scope.self_name || 'DISTRICT').toUpperCase();

  sheet.mergeCells('A1:M1');
  const t1 = sheet.getCell('A1');
  t1.value = `DAILY MORNING DIARY REGARDING PERSONS ARRESTED IN KALANDRAS,  ${districtName} DISTRICT`;
  t1.font = FONTS.TITLE;

  const headers = [
    'S.No', 'Police Station', 'Name', 'Age', 'Parentage', 'Address',
    'FIR/DD No. & Date', 'U/S', 'Name of Arresting Officer',
    'No. of Previous Involvements', 'PO/History Sheeter', 'Place Of Arrest', 'Status'
  ];

  const r2 = sheet.addRow(headers);
  r2.font = FONTS.HEADER;
  r2.eachCell((c, colIdx) => {
    c.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: PALETTE.SAGE_GREEN } };
    if (colIdx === 12) {
      c.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: PALETTE.DUSTY_PINK } };
    }
  });

  const list = calcData.kalArrestsList || [];

  if (list.length === 0) {
    sheet.addRow(['-', 'Nil Kalandar arrests reported today', '-', '-', '-', '-', '-', '-', '-', '-', '-', '-', '-']);
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
      const relPrefix = item.relation_type === 'HUSBAND' ? 'W/O' : 'S/O';
      const parentage = item.relative_name ? `${relPrefix} ${item.relative_name}` : '-';
      const ddRef = item.fir_no
        ? `DD No. ${item.fir_no} dt ${item.registration_date || ''}`
        : '-';
      const dRow = sheet.addRow([
        idx + 1,
        item.ps_name || '-',
        item.person_name || '-',
        item.age || '-',
        parentage,
        item.person_address || '-',
        ddRef,
        item.sections || '-',
        item.io_name || '-',
        item.prev_involvement ?? 0,
        item.is_po || 'No',
        item.arrest_address || '-',
        item.custody_status || 'Notice / Bound down'
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
