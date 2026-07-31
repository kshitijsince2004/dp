import { PALETTE, FONTS } from '../../shared/canonical-codes.js';

export function renderD8FirListing(workbook, scope, calcData) {
  const sheet = workbook.addWorksheet('D-8 Brief Facts');
  const districtName = (scope.self_name || 'DISTRICT').toUpperCase();
  const cutoffDate = calcData.cutoff_date || '';

  sheet.mergeCells('A1:M1');
  const t1 = sheet.getCell('A1');
  t1.value = `DAILY CRIME (PS FIR ) WITH BRIEF FACTS OF ${districtName} DISTRICT  : ${cutoffDate}`;
  t1.font = FONTS.D8_TITLE;
  t1.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: PALETTE.BRIGHT_BLUE } };
  t1.alignment = { horizontal: 'center', vertical: 'middle' };

  const headers = [
    'S.No', 'Police Station', 'FIR No.', 'U/Section', 'Name of Complainant',
    'Time of Occurrence', 'Place of Occurrence', 'Brief Facts Of Case',
    'Accused Arrested', 'Stolen/Recovery Of Property', 'Left over criminal',
    'Head Of Crime', 'Beat No'
  ];

  const r2 = sheet.addRow(headers);
  r2.font = FONTS.HEADER;
  r2.eachCell(c => c.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: PALETTE.OLIVE_GREEN } });

  const list = calcData.fullFirList || [];

  if (list.length === 0) {
    sheet.addRow(['-', 'Nil FIRs registered today', '-', '-', '-', '-', '-', '-', '-', '-', '-', '-', '-']);
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
    // Sub-division separator header row
    const sdRow = sheet.addRow([`SUB DIVISION - ${sdName}`]);
    sheet.mergeCells(`A${sdRow.number}:M${sdRow.number}`);
    const sdCell = sheet.getCell(`A${sdRow.number}`);
    sdCell.font = FONTS.HEADER;
    sdCell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: PALETTE.OLIVE_GREEN } };
    sdCell.alignment = { horizontal: 'left', vertical: 'middle' };

    groups[sdName].forEach((item, idx) => {
      const firRef = item.fir_no
        ? `${item.fir_no} dt ${item.registration_date || item.fir_date || ''}`
        : '-';
      const dRow = sheet.addRow([
        idx + 1,
        item.ps_name || '-',
        firRef,
        item.sections || '-',
        item.complainant_name || '-',
        item.time_of_occurrence || '-',
        item.occurrence_place || '-',
        item.brief_facts || 'N/A',
        item.arrested_person || 'None',
        '-',
        '-',
        item.crime_head || '-',
        '-'
      ]);

      dRow.height = 24;
      dRow.eachCell((cell, colIdx) => {
        cell.font = FONTS.DATA;
        cell.alignment = colIdx === 8 ? { horizontal: 'left', vertical: 'middle', wrapText: true } : { horizontal: 'center', vertical: 'middle' };
        cell.border = { top: { style: 'thin' }, left: { style: 'thin' }, bottom: { style: 'thin' }, right: { style: 'thin' } };
      });
    });
  });

  sheet.columns.forEach((col, idx) => {
    col.width = idx === 7 ? 45 : (idx === 1 ? 22 : 14);
  });
}
