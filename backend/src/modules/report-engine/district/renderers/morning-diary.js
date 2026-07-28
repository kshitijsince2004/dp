import { PALETTE, FONTS } from '../../shared/canonical-codes.js';

export function renderMorningDiary(workbook, scope, calcData) {
  const sheet = workbook.addWorksheet('Morning-Daily Diary');
  const children = scope.children_ids || [];
  const displayNames = scope.display_names || {};
  const yearNum = calcData.yearNum || 2026;
  const yearPrev = yearNum - 1;

  const sections = [
    { name: 'MV THEFT', code: 'MV_THEFT' },
    { name: 'SNATCHING', code: 'SNATCHING' },
    { name: 'BURGLARY', code: 'BURGLARY' },
    { name: 'HOUSE THEFT', code: 'HOUSE_THEFT' },
    { name: 'OTHER THEFT', code: 'OTHER_THEFT' }
  ];

  sections.forEach((sec) => {
    const startRow = sheet.rowCount + 1;

    // Row 1: Section Banner
    const r1 = sheet.addRow([sec.name]);
    r1.height = 26;
    sheet.mergeCells(`A${startRow}:N${startRow}`);
    const secCell = sheet.getCell(`A${startRow}`);
    secCell.font = FONTS.HEADER;
    secCell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: PALETTE.LIGHT_ORANGE } };
    secCell.alignment = { horizontal: 'center', vertical: 'middle' };

    // Row 2: Sub-headers Grouping
    const r2RowIdx = startRow + 1;
    const r2 = sheet.addRow(['Police Station', 'During Day', '', '', '', 'UP to Date', '', '', '', 'Not Work Out-24', 'Solved %', '', 'Upto Last Day']);
    r2.height = 22;

    // Row 3: Year Headers
    const r3RowIdx = startRow + 2;
    const r3 = sheet.addRow(['', `${yearPrev}`, '', `${yearNum}`, '', `${yearPrev}`, '', `${yearNum}`, '', '', `${yearPrev}`, `${yearNum}`, '', `${yearPrev}`]);
    r3.height = 22;

    // Row 4: Sub-headers (Rep / W Out)
    const r4RowIdx = startRow + 3;
    const r4 = sheet.addRow(['', 'Rep', 'W Out', 'Rep', 'W Out', 'Rep', 'W/O', 'Rep', 'W/O', '', '', '', '', 'Rep']);
    r4.height = 22;

    // Perform Merges
    sheet.mergeCells(`A${r2RowIdx}:A${r4RowIdx}`); // Police Station
    sheet.mergeCells(`B${r2RowIdx}:E${r2RowIdx}`); // During Day
    sheet.mergeCells(`F${r2RowIdx}:I${r2RowIdx}`); // UP to Date
    sheet.mergeCells(`J${r2RowIdx}:J${r4RowIdx}`); // Not Work Out-24
    sheet.mergeCells(`K${r2RowIdx}:L${r2RowIdx}`); // Solved %
    sheet.mergeCells(`M${r2RowIdx}:N${r2RowIdx}`); // Upto Last Day

    sheet.mergeCells(`B${r3RowIdx}:C${r3RowIdx}`); // 2025 During Day
    sheet.mergeCells(`D${r3RowIdx}:E${r3RowIdx}`); // 2026 During Day
    sheet.mergeCells(`F${r3RowIdx}:G${r3RowIdx}`); // 2025 UP to Date
    sheet.mergeCells(`H${r3RowIdx}:I${r3RowIdx}`); // 2026 UP to Date
    sheet.mergeCells(`K${r3RowIdx}:K${r4RowIdx}`); // 2025 Solved %
    sheet.mergeCells(`L${r3RowIdx}:L${r4RowIdx}`); // 2026 Solved %
    sheet.mergeCells(`N${r3RowIdx}:N${r4RowIdx}`); // 2025 Upto Last Day Rep

    [r2, r3, r4].forEach(row => {
      row.eachCell(c => {
        c.font = FONTS.HEADER;
        c.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: PALETTE.LIGHT_ORANGE } };
        c.alignment = { horizontal: 'center', vertical: 'middle' };
        c.border = { top: { style: 'thin' }, left: { style: 'thin' }, bottom: { style: 'thin' }, right: { style: 'thin' } };
      });
    });

    const firstPsRow = startRow + 4;
    let lastPsRow = firstPsRow;

    children.forEach((psId) => {
      const psName = displayNames[psId] || psId;
      const headData = (calcData.morningData && calcData.morningData[sec.code] && calcData.morningData[sec.code][psId]) || {
        dayY1: 0, dayY1Wo: 0, dayY: 0, dayYWo: 0, uptoY1: 0, uptoY1Wo: 0, uptoY: 0, uptoYWo: 0, uptoLastDayY1: 0
      };

      const currRow = sheet.rowCount + 1;
      lastPsRow = currRow;

      const dRow = sheet.addRow([
        psName,
        headData.dayY1 || 0,
        headData.dayY1Wo || 0,
        headData.dayY || 0,
        headData.dayYWo || 0,
        headData.uptoY1 || 0,
        headData.uptoY1Wo || 0,
        headData.uptoY || 0,
        headData.uptoYWo || 0,
        { formula: `H${currRow}-I${currRow}`, result: Math.max(0, (headData.uptoY || 0) - (headData.uptoYWo || 0)) },
        { formula: `IF(F${currRow}=0," - ",G${currRow}/F${currRow})`, result: headData.uptoY1 > 0 ? (headData.uptoY1Wo / headData.uptoY1) : 0 },
        { formula: `IF(H${currRow}=0," - ",I${currRow}/H${currRow})`, result: headData.uptoY > 0 ? (headData.uptoYWo / headData.uptoY) : 0 },
        '',
        headData.uptoLastDayY1 || 0
      ]);

      dRow.height = 20;
      dRow.eachCell((cell, colIdx) => {
        cell.font = FONTS.DATA;
        cell.alignment = colIdx === 1 ? { horizontal: 'left', vertical: 'middle' } : { horizontal: 'center', vertical: 'middle' };
        if (colIdx === 11 || colIdx === 12) {
          cell.numFmt = '0.0%';
        }
        cell.border = { top: { style: 'thin' }, left: { style: 'thin' }, bottom: { style: 'thin' }, right: { style: 'thin' } };
      });
    });

    // Add Section Total Row
    let sumB = 0, sumC = 0, sumD = 0, sumE = 0, sumF = 0, sumG = 0, sumH = 0, sumI = 0, sumN = 0;
    children.forEach((psId) => {
      const headData = (calcData.morningData && calcData.morningData[sec.code] && calcData.morningData[sec.code][psId]) || {};
      sumB += Number(headData.dayY1 || 0);
      sumC += Number(headData.dayY1Wo || 0);
      sumD += Number(headData.dayY || 0);
      sumE += Number(headData.dayYWo || 0);
      sumF += Number(headData.uptoY1 || 0);
      sumG += Number(headData.uptoY1Wo || 0);
      sumH += Number(headData.uptoY || 0);
      sumI += Number(headData.uptoYWo || 0);
      sumN += Number(headData.uptoLastDayY1 || 0);
    });

    const sumJ = Math.max(0, sumH - sumI);
    const solK = sumF > 0 ? (sumG / sumF) : 0;
    const solL = sumH > 0 ? (sumI / sumH) : 0;

    const totRowIdx = sheet.rowCount + 1;
    const totRow = sheet.addRow([
      'Total',
      { formula: `SUM(B${firstPsRow}:B${lastPsRow})`, result: sumB },
      { formula: `SUM(C${firstPsRow}:C${lastPsRow})`, result: sumC },
      { formula: `SUM(D${firstPsRow}:D${lastPsRow})`, result: sumD },
      { formula: `SUM(E${firstPsRow}:E${lastPsRow})`, result: sumE },
      { formula: `SUM(F${firstPsRow}:F${lastPsRow})`, result: sumF },
      { formula: `SUM(G${firstPsRow}:G${lastPsRow})`, result: sumG },
      { formula: `SUM(H${firstPsRow}:H${lastPsRow})`, result: sumH },
      { formula: `SUM(I${firstPsRow}:I${lastPsRow})`, result: sumI },
      { formula: `H${totRowIdx}-I${totRowIdx}`, result: sumJ },
      { formula: `IF(F${totRowIdx}=0," - ",G${totRowIdx}/F${totRowIdx})`, result: solK },
      { formula: `IF(H${totRowIdx}=0," - ",I${totRowIdx}/H${totRowIdx})`, result: solL },
      '',
      { formula: `SUM(N${firstPsRow}:N${lastPsRow})`, result: sumN }
    ]);

    totRow.height = 22;
    totRow.eachCell((cell, colIdx) => {
      cell.font = FONTS.HEADER;
      cell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: PALETTE.LIGHT_GRAY } };
      cell.alignment = colIdx === 1 ? { horizontal: 'left', vertical: 'middle' } : { horizontal: 'center', vertical: 'middle' };
      if (colIdx === 11 || colIdx === 12) {
        cell.numFmt = '0.0%';
      }
      cell.border = { top: { style: 'medium' }, left: { style: 'thin' }, bottom: { style: 'medium' }, right: { style: 'thin' } };
    });

    sheet.addRow([]); // Blank spacer row between sections
  });

  sheet.columns.forEach((col, idx) => {
    col.width = idx === 0 ? 32 : (idx === 9 ? 18 : (idx === 10 || idx === 11 ? 14 : 12));
  });
}
