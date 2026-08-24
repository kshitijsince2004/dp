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
    const fnY = g(code, 'fnY');
    const uptoY = g(code, 'uptoY');
    if (fnY > 0 || uptoY > 0) {
      ws.getCell(`C${r}`).value = fnY;
      ws.getCell(`D${r}`).value = uptoY;
      ws.getCell(`E${r}`).value = 0;
      ws.getCell(`F${r}`).value = 0;
    } else {
      ws.getCell(`C${r}`).value = null;
      ws.getCell(`D${r}`).value = null;
      ws.getCell(`E${r}`).value = null;
      ws.getCell(`F${r}`).value = null;
    }
  }
}
