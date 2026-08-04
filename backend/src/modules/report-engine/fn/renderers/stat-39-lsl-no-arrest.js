export function renderStat39(workbook, _scope, _calcData) {
  const ws = workbook.getWorksheet('STAT_39') || workbook.getWorksheet('STAT 39');
  if (!ws) return;
  // L&SL cases chargesheeted without arrest (BNSS notice) not tracked — template preserved.
}
