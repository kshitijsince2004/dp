export function renderStat01B(workbook, _scope, calcData) {
  const ws = workbook.getWorksheet('STAT_1B') || workbook.getWorksheet('STAT 1B');
  if (!ws) return;

  const dbc = calcData.distByCode || {};
  const g = (code, field) => Number(dbc[code]?.[field] || 0);

  const rowMap = {
    5: 'DACOITY', 6: 'MURDER', 7: 'ATT_TO_MURDER', 8: 'ROBBERY', 9: 'BURGLARY', 10: 'MV_THEFT'
  };

  for (const [rStr, code] of Object.entries(rowMap)) {
    const r = Number(rStr);
    ws.getCell(`C${r}`).value = g(code, 'fnY');
    ws.getCell(`D${r}`).value = g(code, 'uptoY');
    ws.getCell(`E${r}`).value = 0;
    ws.getCell(`F${r}`).value = 0;
  }
}
