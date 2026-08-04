export function renderStat18(workbook, _scope, _calcData) {
  const ws = workbook.getWorksheet('STAT_18') || workbook.getWorksheet('STAT 18');
  if (!ws) return;
  // Vehicles seized breakdown not tracked per offense category — template preserved.
}
