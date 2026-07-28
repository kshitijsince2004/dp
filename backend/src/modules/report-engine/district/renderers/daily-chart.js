import { PALETTE, FONTS } from '../../shared/canonical-codes.js';

function formatDistrictTitle(name) {
  let s = (name || 'DISTRICT').trim();
  s = s.replace(/\s+DISTRICT$/i, '');
  return `${s.toUpperCase()} DISTRICT`;
}

export function renderDailyChart(workbook, scope, calcData) {
  const sheet = workbook.addWorksheet('Daily Chart, Heinous, IPC');
  const distTitle = formatDistrictTitle(scope.self_name);
  const children = scope.children_ids || [];
  const displayNames = scope.display_names || {};
  const yearNum = calcData.yearNum || 2026;
  const yearPrev = yearNum - 1;

  // Title Row 1
  sheet.mergeCells('A1:AC1');
  const t1 = sheet.getCell('A1');
  t1.value = `CRIME CHART (HEINOUS, OTHER BNS & TOTAL BNS) — ${distTitle}`;
  t1.font = FONTS.TITLE;
  t1.alignment = { horizontal: 'center', vertical: 'middle' };

  // Row 2: Major Group Banners
  const r2 = sheet.addRow(['Police Station', 'TOTAL HEINOUS', '', '', '', '', '', '', 'OTHER BNS / OTHER IPC', '', '', '', '', '', '', 'TOTAL BNS / TOTAL IPC', '', '', '', '', '', '', 'TOTAL ACT']);
  r2.height = 24;

  // Row 3: UP to Date Grouping
  const r3 = sheet.addRow(['', 'UP to Date', '', '', '', '', '', '', 'UP to Date', '', '', '', '', '', '', 'UP to Date', '', '', '', '', '', '', 'UP to Date']);
  r3.height = 22;

  // Row 4: Sub-headers
  const r4 = sheet.addRow([
    '',
    `${yearPrev}`, `${yearNum}`, `W/O ${yearPrev}`, `W/O ${yearNum}`, `N/W ${yearNum}`, 'Solved%', 'Var%',
    `${yearPrev}`, `${yearNum}`, `W/O ${yearPrev}`, `W/O ${yearNum}`, `N/W ${yearNum}`, 'Solved%', 'Var%',
    `${yearPrev}`, `${yearNum}`, `W/O ${yearPrev}`, `W/O ${yearNum}`, `N/W ${yearNum}`, 'Solved%', 'Var%',
    `${yearPrev}`, `${yearNum}`, `W/O ${yearPrev}`, `W/O ${yearNum}`, `N/W ${yearNum}`, 'Solved%', 'Var%'
  ]);
  r4.height = 22;

  // Perform Merges
  sheet.mergeCells('A2:A4'); // Police Station
  sheet.mergeCells('B2:H2'); // TOTAL HEINOUS
  sheet.mergeCells('I2:O2'); // OTHER BNS
  sheet.mergeCells('P2:V2'); // TOTAL BNS
  sheet.mergeCells('W2:AC2'); // TOTAL ACT

  sheet.mergeCells('B3:H3');
  sheet.mergeCells('I3:O3');
  sheet.mergeCells('P3:V3');
  sheet.mergeCells('W3:AC3');

  [r2, r3, r4].forEach(row => {
    row.eachCell(c => {
      c.font = FONTS.HEADER;
      c.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: PALETTE.LIGHT_ORANGE } };
      c.alignment = { horizontal: 'center', vertical: 'middle', wrapText: true };
      c.border = { top: { style: 'thin' }, left: { style: 'thin' }, bottom: { style: 'thin' }, right: { style: 'thin' } };
    });
  });

  children.forEach(psId => {
    const psName = displayNames[psId] || psId;
    const dRow = sheet.addRow([psName, '-', '-', '-', '-', '-', '-', '-', '-', '-', '-', '-', '-', '-', '-', '-', '-', '-', '-', '-', '-', '-', '-', '-', '-', '-', '-', '-', '-']);
    dRow.height = 20;
    dRow.eachCell((cell, colIdx) => {
      cell.font = FONTS.DATA;
      cell.alignment = colIdx === 1 ? { horizontal: 'left', vertical: 'middle' } : { horizontal: 'center', vertical: 'middle' };
      cell.border = { top: { style: 'thin' }, left: { style: 'thin' }, bottom: { style: 'thin' }, right: { style: 'thin' } };
    });
  });

  const totRow = sheet.addRow(['TOTAL', '-', '-', '-', '-', '-', '-', '-', '-', '-', '-', '-', '-', '-', '-', '-', '-', '-', '-', '-', '-', '-', '-', '-', '-', '-', '-', '-', '-']);
  totRow.font = FONTS.HEADER;
  totRow.eachCell(c => {
    c.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: PALETTE.YELLOW } };
    c.border = { top: { style: 'medium' }, left: { style: 'thin' }, bottom: { style: 'medium' }, right: { style: 'thin' } };
  });

  sheet.columns.forEach((col, idx) => {
    col.width = idx === 0 ? 32 : 12;
  });
}
