export function renderStat01A(workbook, _scope, calcData) {
  const ws = workbook.getWorksheet('STAT_1A') || workbook.getWorksheet('STAT 1A');
  if (!ws) return;

  const dbc = calcData.distByCode || {};
  const g = (code, field) => Number(dbc[code]?.[field] || 0);

  ws.getCell('C5').value = g('MV_THEFT', 'fnY');
  ws.getCell('D5').value = g('MV_THEFT', 'fnY1');
  ws.getCell('E5').value = g('MV_THEFT', 'uptoY');
  ws.getCell('F5').value = g('MV_THEFT', 'uptoY1');

  ws.getCell('C6').value = g('HOUSE_THEFT', 'fnY');
  ws.getCell('D6').value = g('HOUSE_THEFT', 'fnY1');
  ws.getCell('E6').value = g('HOUSE_THEFT', 'uptoY');
  ws.getCell('F6').value = g('HOUSE_THEFT', 'uptoY1');

  ws.getCell('C7').value = g('CYBER_CRIME', 'fnY');
  ws.getCell('D7').value = g('CYBER_CRIME', 'fnY1');
  ws.getCell('E7').value = g('CYBER_CRIME', 'uptoY');
  ws.getCell('F7').value = g('CYBER_CRIME', 'uptoY1');
}
