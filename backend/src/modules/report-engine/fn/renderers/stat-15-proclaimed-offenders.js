export function renderStat15(workbook, _scope, _calcData) {
  const ws = workbook.getWorksheet('STAT_15') || workbook.getWorksheet('STAT 15');
  if (!ws) return;
  // Proclaimed Offender tracking not available — template preserved.
}
