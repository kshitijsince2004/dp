import { PALETTE, FONTS } from '../../shared/canonical-codes.js';
import { computeVariation, computeDetection } from '../../shared/calc.js';

function formatDistrictTitle(name) {
  let s = (name || 'DISTRICT').trim();
  s = s.replace(/\s+DISTRICT$/i, '');
  return `${s.toUpperCase()} DISTRICT`;
}

export function renderRcellComp(workbook, scope, calcData) {
  const sheet = workbook.addWorksheet('R Cell- Distt Crime');
  const distTitle = formatDistrictTitle(scope.self_name);
  const yearNum = calcData.yearNum || 2026;
  const yearPrev = yearNum - 1;

  // Title Row 1
  sheet.mergeCells('A1:D1');
  const t1 = sheet.getCell('A1');
  t1.value = `R Cell Daily Diary- ${distTitle}`;
  t1.font = FONTS.TITLE;

  sheet.mergeCells('H1:I1');
  const tVar = sheet.getCell('H1');
  tVar.value = '% Variation of Cases reported';
  tVar.font = FONTS.HEADER;

  // Subtitle Row 2
  sheet.mergeCells('A2:I2');
  const t2 = sheet.getCell('A2');
  t2.value = 'COMPARATIVE CRIME STATEMENT';
  t2.font = FONTS.SUBTITLE;

  // Multi-row Header Rows 3 & 4
  // Row 3
  const r3 = sheet.addRow(['HEAD', `Upto Date ${yearPrev}`, '', `W/out % age of ${yearPrev}`, `Upto Date ${yearNum}`, '', `W/out %age of ${yearNum}`, '% Variation of Cases reported']);
  r3.height = 24;
  
  // Row 4
  const r4 = sheet.addRow(['', 'Rep.', 'W/O', '', 'Rep.', 'W/O', '']);
  r4.height = 24;

  // Cell Merges
  sheet.mergeCells('A3:A4'); // HEAD
  sheet.mergeCells('B3:C3'); // Upto Date 2025
  sheet.mergeCells('D3:D4'); // W/out % age of 2025
  sheet.mergeCells('E3:F3'); // Upto Date 2026
  sheet.mergeCells('G3:G4'); // W/out %age of 2026
  sheet.mergeCells('H3:H4'); // % Variation

  [r3, r4].forEach(row => {
    row.eachCell(c => {
      c.font = FONTS.HEADER;
      c.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: PALETTE.LIGHT_ORANGE } };
      c.alignment = { horizontal: 'center', vertical: 'middle', wrapText: true };
      c.border = { top: { style: 'thin' }, left: { style: 'thin' }, bottom: { style: 'thin' }, right: { style: 'thin' } };
    });
  });

  const crimeRows = [
    { label: 'Dacoity', code: 1 },
    { label: 'Murder', code: 2 },
    { label: 'Att. Murder', code: 3 },
    { label: 'Robbery', code: 4 },
    { label: 'Riots', code: 5 },
    { label: 'Kid.For Ransom', code: 6 },
    { label: 'Rape', code: 7 },
    { label: 'TOTAL HEINOUS', isTotal: true },
    { label: 'Extortion', code: 8 },
    { label: 'Snatching', code: 9 },
    { label: 'Hurt', code: 10 },
    { label: 'Burglary', code: 12 },
    { label: 'House Theft', code: 18 },
    { label: 'M V Theft', code: 16 },
    { label: 'Servant Theft', code: 17 },
    { label: 'Other Theft', code: 19 },
    { label: 'M O Women', code: 28 },
    { label: 'Eve Teasing', code: 54 },
    { label: 'Kidnapping', code: 29 },
    { label: 'Abduction', code: 30 },
    { label: 'Fatal Accident', code: 31 },
    { label: 'Simple Accident', code: 32 },
    { label: 'Other IPC', code: 33 },
    { label: 'TOTAL NON HEINOUS', isTotal: true },
    { label: 'TOTAL IPC', isTotal: true },
    { label: 'Misc. Theft', code: 20 },
    { label: 'Cyber Crime', code: 38 },
    { label: 'Cheating', code: 39 },
    { label: 'TOTAL CRIME', isTotal: true },
    { label: 'Arms Act', code: 34 },
    { label: 'Excise Act', code: 35 },
    { label: 'Gambling Act', code: 36 },
    { label: 'NDPS Act', code: 37 },
    { label: 'POCSO Act', code: 41 },
    { label: 'Other Act', code: 42 },
    { label: 'TOTAL ACT', isTotal: true },
    { label: 'GRAND TOTAL', isTotal: true }
  ];

  crimeRows.forEach(head => {
    const data = { repY1: 0, woY1: 0, repY: 0, woY: 0 };
    const solPctY1 = computeDetection(data.woY1, data.repY1);
    const solPctY  = computeDetection(data.woY, data.repY);
    const varPct   = computeVariation(data.repY, data.repY1);

    const dRow = sheet.addRow([
      head.label,
      data.repY1 > 0 ? data.repY1 : '-',
      data.woY1 > 0 ? data.woY1 : '-',
      solPctY1 !== null ? `${(solPctY1 * 100).toFixed(1)}%` : '-',
      data.repY > 0 ? data.repY : '-',
      data.woY > 0 ? data.woY : '-',
      solPctY !== null ? `${(solPctY * 100).toFixed(1)}%` : '-',
      varPct !== null ? `${(varPct * 100).toFixed(1)}%` : '-'
    ]);

    dRow.height = 20;
    dRow.eachCell((cell, colIdx) => {
      cell.font = head.isTotal ? FONTS.HEADER : FONTS.DATA;
      if (head.isTotal) {
        cell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: PALETTE.LIGHT_GRAY } };
      }
      cell.alignment = colIdx === 1 ? { horizontal: 'left', vertical: 'middle' } : { horizontal: 'center', vertical: 'middle' };
      cell.border = { top: { style: 'thin' }, left: { style: 'thin' }, bottom: { style: 'thin' }, right: { style: 'thin' } };
    });
  });

  sheet.columns.forEach((col, idx) => {
    col.width = idx === 0 ? 32 : 18;
  });
}
