export function renderStat30(workbook, _scope, _calcData) {
  const ws = workbook.getWorksheet('STAT_30') || workbook.getWorksheet('STAT 30');
  if (!ws) return;
  // Zero FIR flag not captured in current records — template preserved.
}
