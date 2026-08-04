export function renderStat09(workbook, _scope, calcData) {
  const ws = workbook.getWorksheet('STAT_9') || workbook.getWorksheet('STAT 9');
  if (!ws) return;

  const dbc = calcData.distByCode || {};
  const g = (code, field) => Number(dbc[code]?.[field] || 0);

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
    ws.getCell(`C${r}`).value = g(code, 'fnY');
    ws.getCell(`D${r}`).value = g(code, 'fnY1');
    ws.getCell(`E${r}`).value = g(code, 'uptoY');
    ws.getCell(`F${r}`).value = g(code, 'uptoY1');
  }
}
