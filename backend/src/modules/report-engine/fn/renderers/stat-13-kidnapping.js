export function renderStat13(workbook, scope, calcData) {
  const ws = workbook.getWorksheet('STAT_13') || workbook.getWorksheet('STAT 13') || workbook.getWorksheet('STAT13');
  if (!ws) return;

  const dbc = calcData.distByCode || {};
  const g = (code, field) => Number(dbc[code]?.[field] || 0);

  // Template: Automobiles Thefts and Recoveries
  // Row 4 = Stolen during FN (total in col M), Row 9 = Stolen upto date (total in col M)
  // Vehicle type breakdown (cols C-L) requires data not available in our schema;
  // only aggregate MV_THEFT count is written to the total column.
  ws.getCell('M4').value = g('MV_THEFT', 'fnY');
  ws.getCell('M9').value = g('MV_THEFT', 'uptoY');
}
