export function renderStat09(workbook, _scope, _calcData) {
  const ws = workbook.getWorksheet('STAT_9') || workbook.getWorksheet('STAT 9');
  if (!ws) return;
  // Property theft sub-category detail (mobile, laptop, etc.) not tracked — template preserved.
}
