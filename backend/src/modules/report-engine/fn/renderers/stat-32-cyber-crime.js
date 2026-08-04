export function renderStat32(workbook, _scope, _calcData) {
  const ws = workbook.getWorksheet('STAT_32') || workbook.getWorksheet('STAT 32');
  if (!ws) return;
  // Court-directed case registration flag not available — template preserved.
}
