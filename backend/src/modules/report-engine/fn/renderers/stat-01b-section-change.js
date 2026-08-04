export function renderStat01B(workbook, _scope, _calcData) {
  const ws = workbook.getWorksheet('STAT_1B') || workbook.getWorksheet('STAT 1B');
  if (!ws) return;
  // Section-change audit (FIR-level detail) not available in aggregated form — template preserved.
}
