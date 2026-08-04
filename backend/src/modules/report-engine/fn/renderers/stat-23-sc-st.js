export function renderStat23(workbook, _scope, calcData) {
  const ws = workbook.getWorksheet('STAT_23') || workbook.getWorksheet('STAT 23');
  if (!ws) return;

  const dbc = calcData.distByCode || {};
  const g = (code, field) => Number(dbc[code]?.[field] || 0);

  ws.getCell('C5').value = g('CIVIL_RIGHTS_ACT', 'fnY');
  ws.getCell('D5').value = g('CIVIL_RIGHTS_ACT', 'fnY1');
  ws.getCell('E5').value = g('CIVIL_RIGHTS_ACT', 'uptoY');
  ws.getCell('F5').value = g('CIVIL_RIGHTS_ACT', 'uptoY1');
}
