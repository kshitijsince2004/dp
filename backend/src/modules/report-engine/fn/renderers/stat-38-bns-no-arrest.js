export function renderStat38(workbook, _scope, _calcData) {
  const ws = workbook.getWorksheet('STAT_38') || workbook.getWorksheet('STAT 38');
  if (!ws) return;
  // BNS cases chargesheeted without arrest (BNSS notice) not tracked — template preserved.
}
