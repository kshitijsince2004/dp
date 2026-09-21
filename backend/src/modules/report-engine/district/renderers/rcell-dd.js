import { PALETTE, FONTS, safeMerge } from '../../shared/canonical-codes.js';

function formatJurisdictionTitle(scope) {
  const name = (scope.self_name || 'JURISDICTION').trim();
  if (scope.level === 'PS') return name.toUpperCase();
  return name.replace(/\s+DISTRICT$/i, '').toUpperCase() + ' DISTRICT';
}

// IPC / BNS crime heads (in column order)
const IPC_HEADS = [
  { label: 'DACOITY',       code: 'DACOITY' },
  { label: 'MURDER',        code: 'MURDER' },
  { label: 'ATT TO MUR.',   code: 'ATT_TO_MURDER' },
  { label: 'ROBBERY',       code: 'ROBBERY' },
  { label: 'RIOT',          code: 'RIOT' },
  { label: 'KID FOR RAN.',  code: 'KID_FOR_RANSOM' },
  { label: 'RAPE',          code: 'RAPE' },
  { label: 'EXTORTION',     code: 'EXTORTION' },
  { label: 'SNATCHING',     code: 'SNATCHING' },
  { label: 'HURT',          code: 'HURT' },
  { label: 'BURGLARY',      code: 'BURGLARY' },
  { label: 'HOUSE THEFT',   code: 'HOUSE_THEFT' },
  { label: 'M V THEFT',     code: 'MV_THEFT' },
  { label: 'SERVANT THEFT', code: 'SERVANT_THEFT' },
  { label: 'OTHER THEFT',   code: 'OTHER_THEFT' },
  { label: 'M O WOMEN',     code: 'MO_WOMEN' },
  { label: 'EVE TEASING',   code: 'EVE_TEASING' },
  { label: 'KIDNAPPING',    code: 'KIDNAPPING' },
  { label: 'ABDUCTION',     code: 'ABDUCTION' },
  { label: 'FATAL ACC.',    code: 'FATAL_ACCIDENT' },
  { label: 'SIMPLE ACC.',   code: 'SIMPLE_ACCIDENT' },
  { label: 'OTHER IPC',     code: 'OTHER_IPC' },
];

const ACT_HEADS = [
  { label: 'ARMS ACT',    code: 'ARMS_ACT' },
  { label: 'EXCISE ACT',  code: 'EXCISE_ACT' },
  { label: 'GAMBLING ACT',code: 'GAMBLING_ACT' },
  { label: 'I.T. ACT',    code: 'IT_ACT' },
  { label: 'I T (P) ACT', code: 'ITPA_ACT' },
  { label: 'N D P S ACT', code: 'NDPS_ACT' },
  { label: 'POCSO ACT',   code: 'POCSO' },
  { label: 'OTHER ACT',   code: 'OTHER_ACT' },
];

const ALL_HEADS = [...IPC_HEADS, ...ACT_HEADS];

export function renderRcellDD(workbook, scope, calcData) {
  const jurTitle = formatJurisdictionTitle(scope);
  let sheet = workbook.worksheets.find(w => w.name.startsWith('Rcell DD')) || workbook.addWorksheet(`Rcell DD ${jurTitle.replace(' DISTRICT', '')}`);
  const children = scope.children_ids || [];
  const displayNames = scope.display_names || {};
  const yearNum = calcData.yearNum || 2026;
  const psDayByCode = calcData.psDayByCode || {};

  // Title
  safeMerge(sheet, 'A1:B1');
  const titleCell = sheet.getCell('A1');
  titleCell.value = `Rcell Crime Diary ${yearNum}`;
  titleCell.font = FONTS.TITLE;
  titleCell.alignment = { horizontal: 'left', vertical: 'middle' };

  // Header row
  const headers = [
    scope.level === 'PS' ? 'Police Station' : jurTitle.replace(' DISTRICT', ''),
    ...ALL_HEADS.map(h => h.label),
    'TOTAL IPC', 'TOTAL ACT', 'GRAND TOTAL',
  ];
  const headerRow = sheet.addRow(headers);
  headerRow.height = 28;
  headerRow.eachCell(cell => {
    cell.font = FONTS.HEADER;
    cell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: PALETTE.YELLOW } };
    cell.alignment = { horizontal: 'center', vertical: 'middle', wrapText: true };
    cell.border = { top: { style: 'thin' }, left: { style: 'thin' }, bottom: { style: 'thin' }, right: { style: 'thin' } };
  });

  const distTotals = new Array(ALL_HEADS.length).fill(0);
  let distIpcTotal = 0, distActTotal = 0;

  children.forEach(psId => {
    const psName = displayNames[psId] || psId;
    const codes = psDayByCode[psId] || {};
    const get = code => Number(codes[code] || 0);

    const vals = ALL_HEADS.map(h => get(h.code));
    const ipcSum = vals.slice(0, IPC_HEADS.length).reduce((a, b) => a + b, 0);
    const actSum = vals.slice(IPC_HEADS.length).reduce((a, b) => a + b, 0);
    const grandTotal = ipcSum + actSum;

    vals.forEach((v, i) => { distTotals[i] += v; });
    distIpcTotal += ipcSum;
    distActTotal += actSum;

    const fmt = v => v > 0 ? v : '-';
    const dRow = sheet.addRow([psName, ...vals.map(fmt), fmt(ipcSum), fmt(actSum), fmt(grandTotal)]);
    dRow.height = 22;
    dRow.eachCell((cell, colNum) => {
      cell.font = FONTS.DATA;
      cell.alignment = colNum === 1 ? { horizontal: 'left', vertical: 'middle' } : { horizontal: 'center', vertical: 'middle' };
      cell.border = { top: { style: 'thin' }, left: { style: 'thin' }, bottom: { style: 'thin' }, right: { style: 'thin' } };
    });
  });

  const fmt = v => v > 0 ? v : '-';
  const totRow = sheet.addRow([
    'TOTAL',
    ...distTotals.map(fmt),
    fmt(distIpcTotal), fmt(distActTotal), fmt(distIpcTotal + distActTotal),
  ]);
  totRow.height = 24;
  totRow.eachCell(cell => {
    cell.font = FONTS.HEADER;
    cell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: PALETTE.YELLOW } };
    cell.alignment = { horizontal: 'center', vertical: 'middle' };
    cell.border = { top: { style: 'medium' }, left: { style: 'thin' }, bottom: { style: 'medium' }, right: { style: 'thin' } };
  });

  sheet.columns.forEach((col, idx) => { col.width = idx === 0 ? 32 : 14; });
}
