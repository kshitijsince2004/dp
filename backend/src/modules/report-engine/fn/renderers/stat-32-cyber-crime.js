export function renderStat32(workbook, _scope, calcData) {
  const ws = workbook.getWorksheet('STAT_32') || workbook.getWorksheet('STAT 32');
  if (!ws) return;

  const dbc = calcData.distByCode || {};
  const g = (code, field) => Number(dbc[code]?.[field] || 0);

  ws.getCell('C5').value = g('CYBER_CRIME', 'fnY');
  ws.getCell('D5').value = g('CYBER_CRIME', 'fnY1');
  ws.getCell('E5').value = g('CYBER_CRIME', 'uptoY');
  ws.getCell('F5').value = g('CYBER_CRIME', 'uptoY1');
}
