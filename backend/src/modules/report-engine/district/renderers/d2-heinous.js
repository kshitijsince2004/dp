import { PALETTE, FONTS, safeMerge } from '../../shared/canonical-codes.js';

export function renderD2Heinous(workbook, scope, calcData) {
  let sheet = workbook.getWorksheet('D-2 Heinous Brief Fact') || workbook.addWorksheet('D-2 Heinous Brief Fact');
  const districtName = (scope.self_name || 'DISTRICT').toUpperCase();
  const cutoffDate = calcData.cutoff_date || '';

  safeMerge(sheet, 'A1:N1');
  const t1 = sheet.getCell('A1');
  t1.value = `D-2 HEINOUS BRIEF FACTS STATEMENT — ${districtName} DISTRICT (${cutoffDate})`;
  t1.font = FONTS.TITLE;

  const headers = [
    'S.No', 'Police Station', 'FIR No.', 'U/Section', 'Place of Occurrence',
    'Date/Time of Occurrence', 'Beat No.', 'Name of I.O.',
    'Brief Facts of Case', 'Stolen/Recovery of Property',
    'W/Out or Not', 'Name and Address of Accused',
    'Yet to be arrested', 'Head of Crime'
  ];

  const r2 = sheet.addRow(headers);
  r2.font = FONTS.HEADER;
  r2.eachCell(c => c.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: PALETTE.OLIVE_GREEN } });

  const heinousList = calcData.heinousList || [];

  if (heinousList.length === 0) {
    sheet.addRow(['-', 'Nil heinous cases reported today', '-', '-', '-', '-', '-', '-', '-', '-', '-', '-', '-', '-']);
  } else {
    heinousList.forEach((item, idx) => {
      const isWO = item.is_worked_out === true ? 'W/O' : (item.is_worked_out === false ? 'Pending' : '-');
      const dRow = sheet.addRow([
        idx + 1,
        item.ps_name || '-',
        item.fir_no || '-',
        item.sections || '-',
        item.occurrence_place || '-',
        item.time_of_occurrence || item.registration_date || '-',
        item.beat_no || '-',
        item.io_name || '-',
        item.brief_facts || 'N/A',
        item.stolen_property || '-',
        isWO,
        item.accused_details || 'Not identified / Unknown',
        item.yet_to_be_arrested || 'Nil',
        item.crime_head || 'Heinous'
      ]);

      dRow.height = 24;
      dRow.eachCell((cell, colIdx) => {
        cell.font = FONTS.DATA;
        cell.alignment = colIdx === 9 ? { horizontal: 'left', vertical: 'middle', wrapText: true } : { horizontal: 'center', vertical: 'middle' };
        cell.border = { top: { style: 'thin' }, left: { style: 'thin' }, bottom: { style: 'thin' }, right: { style: 'thin' } };
      });
    });
  }

  sheet.columns.forEach((col, idx) => {
    col.width = idx === 8 ? 45 : (idx === 1 ? 22 : 14);
  });
}
