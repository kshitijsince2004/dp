import { PALETTE, FONTS } from '../../shared/canonical-codes.js';

const HEADS = [
  { label: 'Dacoity',           code: 'DACOITY',       isHeinous: true },
  { label: 'Murder',            code: 'MURDER',        isHeinous: true },
  { label: 'Att. Murder',       code: 'ATT_TO_MURDER',    isHeinous: true },
  { label: 'Robbery',           code: 'ROBBERY',       isHeinous: true },
  { label: 'Riots',             code: 'RIOT',          isHeinous: true },
  { label: 'Kid.For Ransom',    code: 'KID_FOR_RANSOM',isHeinous: true },
  { label: 'Rape',              code: 'RAPE',          isHeinous: true },
  { label: 'TOTAL HEINOUS',     isTotal: true, group: 'heinous' },
  { label: 'Organised Crime',   code: 'ORGANISED' },
  { label: 'Terrorist Crime',   code: 'TERRORIST' },
  { label: 'Snatching',         code: 'SNATCHING' },
  { label: 'Burglary',          code: 'BURGLARY' },
  { label: 'Extortion',         code: 'EXTORTION' },
  { label: 'Hurt',              code: 'HURT' },
  { label: 'M V Theft',         code: 'MV_THEFT' },
  { label: 'House Theft',       code: 'HOUSE_THEFT' },
  { label: 'Other Theft',       code: 'OTHER_THEFT' },
  { label: 'Kidnapping',        code: 'KIDNAPPING' },
  { label: 'Abduction',         code: 'ABDUCTION' },
  { label: 'M O Women',         code: 'MO_WOMEN' },
  { label: 'Eve Teasing',       code: 'EVE_TEASING' },
  { label: 'Fatal Accident',    code: 'FATAL_ACCIDENT' },
  { label: 'Simple Accident',   code: 'SIMPLE_ACCIDENT' },
  { label: 'Other IPC',         code: 'OTHER_IPC' },
  { label: 'TOTAL NON HEINOUS', isTotal: true, group: 'non_heinous' },
  { label: 'TOTAL IPC',         isTotal: true, group: 'ipc' },
  { label: 'Arms Act',          code: 'ARMS_ACT', isAct: true },
  { label: 'Excise Act',        code: 'EXCISE_ACT', isAct: true },
  { label: 'Gambling Act',      code: 'GAMBLING_ACT', isAct: true },
  { label: 'NDPS Act',          code: 'NDPS_ACT', isAct: true },
  { label: 'POCSO Act',         code: 'POCSO', isAct: true },
  { label: 'Other Act',         code: 'OTHER_ACT', isAct: true },
  { label: 'TOTAL ACT',         isTotal: true, group: 'act' },
  { label: 'GRAND TOTAL',       isTotal: true, group: 'grand' },
];

function buildPsSums(psByCode, psByCodeWo, psId) {
  const get  = c => Number(psByCode[psId]?.[c]  || 0);
  const getWo = c => Number(psByCodeWo[psId]?.[c] || 0);
  const sums = { heinous: [0,0], non_heinous: [0,0], ipc: [0,0], act: [0,0], grand: [0,0] };
  HEADS.forEach(h => {
    if (!h.code) return;
    const r = get(h.code), w = getWo(h.code);
    if (h.isHeinous) {
      sums.heinous[0] += r; sums.heinous[1] += w;
      sums.ipc[0]  += r; sums.ipc[1]  += w;
      sums.grand[0] += r; sums.grand[1] += w;
    } else if (h.isAct) {
      sums.act[0]   += r; sums.act[1]   += w;
      sums.grand[0] += r; sums.grand[1] += w;
    } else {
      sums.non_heinous[0] += r; sums.non_heinous[1] += w;
      sums.ipc[0]  += r; sums.ipc[1]  += w;
      sums.grand[0] += r; sums.grand[1] += w;
    }
  });
  return sums;
}

export function renderN123Register(workbook, scope, calcData) {
  const sheet = workbook.addWorksheet('N-1,N-2,N-3 ');
  const districtName = (scope.self_name || 'DISTRICT').toUpperCase();
  const children = scope.children_ids || [];
  const displayNames = scope.display_names || {};
  const psByCode   = calcData.psByCode   || {};
  const psByCodeWo = calcData.psByCodeWo || {};

  sheet.mergeCells('A1:AC1');
  const t1 = sheet.getCell('A1');
  t1.value = `Daily ${districtName} District Crime`;
  t1.font = FONTS.N123_SUBDIV;
  t1.alignment = { horizontal: 'center', vertical: 'middle' };

  const psHeaders = [];
  const subHeaders = ['HEAD'];
  children.forEach(psId => {
    const psName = (displayNames[psId] || psId).slice(0, 10);
    psHeaders.push(psName, '');
    subHeaders.push('REP', 'W-O');
  });

  const r2 = sheet.addRow(['HEAD', ...psHeaders]);
  r2.font = FONTS.N123_PS_ABBREV;
  r2.eachCell(c => c.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: PALETTE.LIGHT_ORANGE } });

  const r3 = sheet.addRow(subHeaders);
  r3.font = FONTS.N123_REP_WO;
  r3.eachCell(c => c.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: PALETTE.LIGHT_ORANGE } });

  // Precompute per-PS totals
  const psSums = {};
  children.forEach(psId => { psSums[psId] = buildPsSums(psByCode, psByCodeWo, psId); });

  HEADS.forEach(h => {
    const rowVals = [h.label];
    children.forEach(psId => {
      if (h.isTotal) {
        const [r, w] = psSums[psId][h.group];
        rowVals.push(r || '-', w || '-');
      } else {
        const r = Number(psByCode[psId]?.[h.code]  || 0);
        const w = Number(psByCodeWo[psId]?.[h.code] || 0);
        rowVals.push(r || '-', w || '-');
      }
    });

    const dRow = sheet.addRow(rowVals);
    dRow.height = 24;
    const isTotal = h.isTotal;
    dRow.eachCell((cell, colIdx) => {
      cell.font = isTotal ? FONTS.HEADER : FONTS.DATA;
      if (isTotal) cell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: PALETTE.LIGHT_GRAY } };
      cell.alignment = colIdx === 1 ? { horizontal: 'left', vertical: 'middle' } : { horizontal: 'center', vertical: 'middle' };
      cell.border = { top: { style: 'thin' }, left: { style: 'thin' }, bottom: { style: 'thin' }, right: { style: 'thin' } };
    });
  });

  sheet.columns.forEach((col, idx) => { col.width = idx === 0 ? 30 : 12; });
}
