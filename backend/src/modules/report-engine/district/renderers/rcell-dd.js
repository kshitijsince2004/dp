import { PALETTE, FONTS } from '../../shared/canonical-codes.js';

function formatDistrictTitle(name) {
  let s = (name || 'DISTRICT').trim();
  s = s.replace(/\s+DISTRICT$/i, '');
  return `${s.toUpperCase()} DISTRICT`;
}

export function renderRcellDD(workbook, scope, calcData) {
  const distTitle = formatDistrictTitle(scope.self_name);
  const sheet = workbook.addWorksheet(`Rcell DD ${distTitle.replace(' DISTRICT', '')}`);
  const children = scope.children_ids || [];
  const displayNames = scope.display_names || {};
  const yearNum = calcData.yearNum || 2026;

  // Title Row 1
  sheet.mergeCells('A1:B1');
  const titleCell = sheet.getCell('A1');
  titleCell.value = `Rcell Crime Diary ${yearNum}`;
  titleCell.font = FONTS.TITLE;
  titleCell.alignment = { horizontal: 'left', vertical: 'middle' };

  // Headers Row 2
  const headers = [
    distTitle.replace(' DISTRICT', ''), 'DACOITY', 'MURDER', 'ATT TO MUR.', 'ROBBERY', 'RIOT', 'KID FOR RAN.',
    'RAPE', 'EXTORTION', 'SNATCHING', 'HURT', 'BURGLARY', 'HOUSE THEFT', 'M V THEFT',
    'SERVANT THEFT', 'OTHER THEFT', 'M O WOMEN', 'EVE TEASING', 'KIDNAPPING', 'ABDUCTION',
    'FATAL ACC.', 'SIMPLE ACC.', 'OTHER IPC', 'TOTAL IPC', 'ARMS ACT', 'EXCISE ACT',
    'GAMBLING ACT', 'I.T. ACT', 'I T (P) ACT', 'N D P S ACT', 'POCSO ACT', 'OTHER ACT',
    'TOTAL ACT', 'GRAND TOTAL'
  ];

  const headerRow = sheet.addRow(headers);
  headerRow.height = 28;
  headerRow.eachCell((cell) => {
    cell.font = FONTS.HEADER;
    cell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: PALETTE.YELLOW } };
    cell.alignment = { horizontal: 'center', vertical: 'middle', wrapText: true };
    cell.border = {
      top: { style: 'thin' }, left: { style: 'thin' }, bottom: { style: 'thin' }, right: { style: 'thin' }
    };
  });

  const heads = [
    1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 12, 18, 16, 17, 19, 28, 54, 29, 30, 31, 32, 33, 34, 35, 36, 37, 38, 39, 40, 41, 42
  ];

  let totalRowValues = new Array(headers.length - 2).fill(0);
  let grandTotalSum = 0;

  children.forEach((psId) => {
    const psName = displayNames[psId] || psId;
    const psCounts = calcData.psDayCounts[psId] || {};
    
    let psIpcSum = 0;
    let psActSum = 0;

    const rowVals = heads.map((hCode, hIdx) => {
      const val = Number(psCounts[hCode] || 0);
      totalRowValues[hIdx] += val;
      if (hIdx < 23) psIpcSum += val;
      else psActSum += val;
      return val > 0 ? val : '-';
    });

    const psGrandTotal = psIpcSum + psActSum;
    grandTotalSum += psGrandTotal;

    const dRow = sheet.addRow([psName, ...rowVals, psIpcSum > 0 ? psIpcSum : '-', psGrandTotal > 0 ? psGrandTotal : '-']);
    dRow.height = 22;
    dRow.eachCell((cell, colNum) => {
      cell.font = FONTS.DATA;
      cell.alignment = colNum === 1 ? { horizontal: 'left', vertical: 'middle' } : { horizontal: 'center', vertical: 'middle' };
      cell.border = { top: { style: 'thin' }, left: { style: 'thin' }, bottom: { style: 'thin' }, right: { style: 'thin' } };
    });
  });

  // Total Row
  const totRow = sheet.addRow(['TOTAL', ...totalRowValues.map(v => v > 0 ? v : '-'), grandTotalSum > 0 ? grandTotalSum : '-']);
  totRow.height = 24;
  totRow.eachCell((cell) => {
    cell.font = FONTS.HEADER;
    cell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: PALETTE.YELLOW } };
    cell.alignment = { horizontal: 'center', vertical: 'middle' };
    cell.border = { top: { style: 'medium' }, left: { style: 'thin' }, bottom: { style: 'medium' }, right: { style: 'thin' } };
  });

  sheet.columns.forEach((col, idx) => {
    col.width = idx === 0 ? 32 : 14;
  });
}
