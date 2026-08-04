export function renderStat40(workbook, _scope, _calcData) {
  const ws = workbook.getWorksheet('STAT_40') || workbook.getWorksheet('STAT 40');
  if (!ws) return;
  // Court disposal data not available in system — template preserved as-is.
}
