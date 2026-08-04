export function renderStat05(workbook, _scope, _calcData) {
  const ws = workbook.getWorksheet('STAT_5') || workbook.getWorksheet('STAT 5');
  if (!ws) return;
  // Burglary MO breakdown not tracked in system — template preserved as-is.
}
