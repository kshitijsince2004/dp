import { PALETTE, FONTS } from '../../shared/canonical-codes.js';

function formatDistrictTitle(name) {
  let s = (name || 'DISTRICT').trim();
  s = s.replace(/\s+DISTRICT$/i, '');
  return `${s.toUpperCase()} DISTRICT`;
}

export function renderDCsPChart(workbook, scope, calcData) {
  const sheet = workbook.addWorksheet('DCsP- Crime Chart');
  const distTitle = formatDistrictTitle(scope.self_name);
  const yearNum = calcData.yearNum || 2026;
  const yearPrev = yearNum - 1;

  // Title Row 1
  sheet.mergeCells('A1:M1');
  const titleCell = sheet.getCell('A1');
  titleCell.value = `DCsP CRIME CHART — ${distTitle}`;
  titleCell.font = FONTS.TITLE;
  titleCell.alignment = { horizontal: 'center', vertical: 'middle' };

  // Multi-row Header Rows 2 & 3
  const r2 = sheet.addRow([
    'Crime Head / Sub-Category',
    `Today Y (${yearNum}) Rep`, '',
    `Today Y-1 (${yearPrev}) Rep`, '',
    'Inc/Dec %',
    `Upto Date Y (${yearNum})`, '', '', '',
    `Upto Date Y-1 (${yearPrev})`, '', ''
  ]);
  r2.height = 24;

  const r3 = sheet.addRow([
    '',
    'Rep', 'W-O',
    'Rep', 'W-O',
    '',
    'Rep', 'W-O', 'N-W', 'W/out %age Y',
    'Rep', 'W-O', 'W/out %age Y-1'
  ]);
  r3.height = 22;

  // Perform Merges
  sheet.mergeCells('A2:A3'); // Crime Head
  sheet.mergeCells('B2:C2'); // Today Y
  sheet.mergeCells('D2:E2'); // Today Y-1
  sheet.mergeCells('F2:F3'); // Inc/Dec %
  sheet.mergeCells('G2:J2'); // Upto Date Y
  sheet.mergeCells('K2:M2'); // Upto Date Y-1

  [r2, r3].forEach(row => {
    row.eachCell(c => {
      c.font = FONTS.HEADER;
      c.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: PALETTE.OLIVE_GREEN } };
      c.alignment = { horizontal: 'center', vertical: 'middle', wrapText: true };
      c.border = { top: { style: 'thin' }, left: { style: 'thin' }, bottom: { style: 'thin' }, right: { style: 'thin' } };
    });
  });

  const rows = [
    { name: '1. Dacoity', code: 1 },
    { name: '2. Murder', code: 2 },
    { name: '3. Att. Murder', code: 3 },
    { name: '4. Robbery (combined)', code: 4 },
    { name: '   - Police Station (Manual)', code: 'ROBBERY_PS', isSub: true },
    { name: '   - E-FIR App', code: 'ROBBERY_EFIR', isSub: true },
    { name: '5. Riots', code: 5 },
    { name: '6. Kid. Ran', code: 6 },
    { name: '7. Rape', code: 7 },
    { name: 'TOTAL HEINOUS', isTotal: true },
    { name: 'Organised Crime', code: 'ORGANISED' },
    { name: 'Terrorist Crime', code: 'TERRORIST' },
    { name: '8. Snatching (combined)', code: 9 },
    { name: '   - Police Station', code: 'SNATCHING_PS', isSub: true },
    { name: '   - E-FIR App', code: 'SNATCHING_EFIR', isSub: true },
    { name: '9. Burglary (combined)', code: 12 },
    { name: '   - Police Station', code: 'BURGLARY_PS', isSub: true },
    { name: '   - E-FIR App', code: 'BURGLARY_EFIR', isSub: true },
    { name: '10. Extortion', code: 8 },
    { name: '11. Hurt', code: 10 },
    { name: '12. M.V. Theft (combined)', code: 16 },
    { name: '   - Police Station', code: 'MVT_PS', isSub: true },
    { name: '   - E-FIR App', code: 'MVT_EFIR', isSub: true },
    { name: '13. House Theft (combined)', code: 18 },
    { name: '   - Police Station', code: 'HOUSE_THEFT_PS', isSub: true },
    { name: '   - E-FIR App', code: 'HOUSE_THEFT_EFIR', isSub: true },
    { name: '14. Misc. Theft (combined)', code: 19 },
    { name: '   - Police Station', code: 'MISC_THEFT_PS', isSub: true },
    { name: '   - E-FIR App', code: 'MISC_THEFT_EFIR', isSub: true },
    { name: '15. Kidnapping', code: 29 },
    { name: '16. Abduction', code: 30 },
    { name: '17. M.O. Women', code: 28 },
    { name: '18. 498-A/406 IPC (85 BNS)', code: 43 },
    { name: '19. Eve-Teasing', code: 54 },
    { name: '20. Sim Accident', code: 32 },
    { name: '21. Fatal Accident', code: 31 },
    { name: '22. Total Cheating (combined)', code: 38 },
    { name: '   - Forgery Cheating', code: 39, isSub: true },
    { name: '   - Street Cheating', code: 'STREET_CHEATING', isSub: true },
    { name: '   - Cyber Cheating (NCRP)', code: 'CYBER_CHEATING', isSub: true },
    { name: '   - e-Cheating', code: 'E_CHEATING', isSub: true },
    { name: '23. Drugging', code: 59 },
    { name: '24. Dowry Death', code: 44 },
    { name: 'Other BNS / Other IPC', code: 33 },
    { name: 'TOTAL NON HEINOUS', isTotal: true },
    { name: 'TOTAL IPC/BNS', isTotal: true },
    { name: 'Arms Act', code: 34 },
    { name: 'Excise Act', code: 35 },
    { name: 'Gambling Act', code: 36 },
    { name: 'NDPS Act', code: 37 },
    { name: 'Elect. Act', code: 45 },
    { name: 'DPDP Act', code: 46 },
    { name: 'POCSO Act', code: 41 },
    { name: 'IT Act', code: 47 },
    { name: 'Copy Right Act', code: 48 },
    { name: 'Other Act', code: 42 },
    { name: 'TOTAL ACT', isTotal: true },
    { name: 'GRAND TOTAL', isTotal: true }
  ];

  rows.forEach(r => {
    const dRow = sheet.addRow([
      r.name, '-', '-', '-', '-', '-', '-', '-', '-', '-', '-', '-', '-'
    ]);

    dRow.height = 20;
    dRow.eachCell((cell, colIdx) => {
      cell.font = r.isTotal ? FONTS.HEADER : FONTS.DATA;
      if (r.isTotal) {
        cell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: PALETTE.LIGHT_GRAY } };
      }
      cell.alignment = colIdx === 1 ? { horizontal: 'left', vertical: 'middle' } : { horizontal: 'center', vertical: 'middle' };
      cell.border = { top: { style: 'thin' }, left: { style: 'thin' }, bottom: { style: 'thin' }, right: { style: 'thin' } };
    });
  });

  sheet.columns.forEach((col, idx) => {
    col.width = idx === 0 ? 35 : 14;
  });
}
