import { PALETTE, FONTS } from '../../shared/canonical-codes.js';

function formatDistrictTitle(name) {
  let s = (name || 'DISTRICT').trim();
  s = s.replace(/\s+DISTRICT$/i, '');
  return `${s.toUpperCase()} DISTRICT`;
}

export function renderG22Daily(workbook, scope, calcData) {
  const sheet = workbook.addWorksheet('G-22 Daily Crime');
  const distTitle = formatDistrictTitle(scope.self_name);

  sheet.mergeCells('A1:Z1');
  const t1 = sheet.getCell('A1');
  t1.value = `Daily Crime ${distTitle}`;
  t1.font = FONTS.TITLE;
  t1.alignment = { horizontal: 'center', vertical: 'middle' };

  // Quadrant 1
  const r2 = sheet.addRow(['District', 'Dacoity', 'Murder', 'Att. To Murder', 'Robbery', 'Riots', 'Kid. For Ran.', 'Rape', 'Snatching', '', 'Burglary', '']);
  r2.font = FONTS.HEADER;
  r2.eachCell(c => c.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: PALETTE.LIGHT_ORANGE } });

  const r3 = sheet.addRow(['', '', '', '', '', '', '', '', 'PS', 'E-FIR', 'PS', 'E-FIR']);
  r3.font = FONTS.HEADER;
  r3.eachCell(c => c.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: PALETTE.LIGHT_ORANGE } });

  const d1 = sheet.addRow([distTitle, '-', '-', '-', '-', '-', '-', '-', '-', '-', '-', '-']);
  d1.font = FONTS.DATA;

  sheet.addRow([]);

  // Quadrant 2
  const r5 = sheet.addRow(['District', 'Extortion', 'Hurt', 'M.V. Theft', '', 'House Theft', '', 'Misc. Theft', '', 'Kidnapping', 'Abduction']);
  r5.font = FONTS.HEADER;
  r5.eachCell(c => c.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: PALETTE.LIGHT_ORANGE } });

  const r6 = sheet.addRow(['', '', '', 'PS', 'E-FIR', 'PS', 'E-FIR', 'PS', 'E-FIR', '', '']);
  r6.font = FONTS.HEADER;

  const d2 = sheet.addRow([distTitle, '-', '-', '-', '-', '-', '-', '-', '-', '-', '-']);
  d2.font = FONTS.DATA;

  sheet.addRow([]);

  // Quadrant 3
  const r8 = sheet.addRow(['District', 'M.O. Women', '498-A/406', 'Eve-Teasing', 'Sim Accident', 'Fatal Accident', 'Cheating', 'Dowry Death', 'Other IPC/BNS']);
  r8.font = FONTS.HEADER;
  r8.eachCell(c => c.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: PALETTE.LIGHT_ORANGE } });

  const d3 = sheet.addRow([distTitle, '-', '-', '-', '-', '-', '-', '-', '-']);
  d3.font = FONTS.DATA;

  sheet.addRow([]);

  // Quadrant 4
  const r10 = sheet.addRow(['District', 'Arms', 'Excise', 'Gambling', 'NDPS', 'Elect.', 'DPDP', 'Other Act', 'TOTAL ACT', 'GRAND TOTAL']);
  r10.font = FONTS.HEADER;
  r10.eachCell(c => c.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: PALETTE.LIGHT_ORANGE } });

  const d4 = sheet.addRow([distTitle, '-', '-', '-', '-', '-', '-', '-', '-', '-']);
  d4.font = FONTS.DATA;

  sheet.columns.forEach((col, idx) => {
    col.width = idx === 0 ? 32 : 14;
  });
}
