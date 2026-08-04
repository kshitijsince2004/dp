export function renderStat23(workbook, _scope, _calcData) {
  const ws = workbook.getWorksheet('STAT_23') || workbook.getWorksheet('STAT 23');
  if (!ws) return;
  // SC/ST victim flag not captured in current records — template preserved.
}
