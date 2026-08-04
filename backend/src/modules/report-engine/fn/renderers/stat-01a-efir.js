export function renderStat01A(workbook, _scope, _calcData) {
  const ws = workbook.getWorksheet('STAT_1A') || workbook.getWorksheet('STAT 1A');
  if (!ws) return;
  // e-FIR registration data not separately tracked — template preserved as-is.
}
