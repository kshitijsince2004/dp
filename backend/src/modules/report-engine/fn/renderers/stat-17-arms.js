export function renderStat17(workbook, _scope, calcData) {
  const ws = workbook.getWorksheet('STAT_17') || workbook.getWorksheet('STAT 17');
  if (!ws) return;

  const dbc = calcData.distByCode || {};
  const g = (code, field) => Number(dbc[code]?.[field] || 0);

  // STAT_17: Arms Act enforcement. Row 4 = cases, Row 5 = persons arrested.
  ws.getCell('C4').value = g('ARMS_ACT', 'fnY');
  ws.getCell('D4').value = g('ARMS_ACT', 'uptoY');

  const dbcA = calcData.distByCodeArr || {};
  ws.getCell('C5').value = Number(dbcA['ARMS_ACT']?.fnY  || 0);
  ws.getCell('D5').value = Number(dbcA['ARMS_ACT']?.fnY1 || 0);
}
