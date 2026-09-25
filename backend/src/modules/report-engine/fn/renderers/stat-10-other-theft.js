export function renderStat10(workbook, _scope, calcData) {
  const ws = workbook.getWorksheet('STAT_10') || workbook.getWorksheet('STAT 10');
  if (!ws) return;

  const dbcW = calcData.distByCodeWo  || {};
  const dbcC = calcData.distByCodeCan || {};
  const dbcA = calcData.distByCodeArr || {};
  const gW = (code, field) => Number(dbcW[code]?.[field] || 0);
  const gC = (code, field) => Number(dbcC[code]?.[field] || 0);
  const gA = (code, field) => Number(dbcA[code]?.[field] || 0);

  const rowMap = {
    5:  'MV_THEFT',
    6:  'HOUSE_THEFT',
    7:  'SERVANT_THEFT',
    8:  'PICKPOCKETING',
    9:  'MOBILE_THEFT',
    10: 'LAPTOP_THEFT',
    11: 'CARD_THEFT',
    12: 'CYCLE_THEFT',
    13: 'TRANSPORT_THEFT',
    14: 'IDOL_THEFT',
    15: 'GOVT_PROPERTY_THEFT',
    16: 'SHOP_THEFT',
    17: 'CATTLE_THEFT',
    18: 'MV_ASSESS_THEFT',
    19: 'OTHER_THEFT',
  };

  for (const [rStr, code] of Object.entries(rowMap)) {
    const r = Number(rStr);
    ws.getCell(`C${r}`).value = gW(code, 'fnY');
    ws.getCell(`D${r}`).value = gW(code, 'uptoY');
    ws.getCell(`E${r}`).value = gC(code, 'fnY');
    ws.getCell(`F${r}`).value = gC(code, 'uptoY');
    ws.getCell(`G${r}`).value = gA(code, 'fnY');
    ws.getCell(`H${r}`).value = gA(code, 'uptoY');
  }
}
