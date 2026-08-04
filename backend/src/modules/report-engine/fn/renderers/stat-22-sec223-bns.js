export function renderStat22(workbook, _scope, _calcData) {
  const ws = workbook.getWorksheet('STAT_22') || workbook.getWorksheet('STAT 22');
  if (!ws) return;
  // Section 223 BNS case detail not tracked separately — template preserved.
}
