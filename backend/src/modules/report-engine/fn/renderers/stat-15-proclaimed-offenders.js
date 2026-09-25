// backend/src/modules/report-engine/fn/renderers/stat-15-proclaimed-offenders.js
// Blocked Renderer: STAT_15 | Proclaimed offenders register not built (blocker B6)

export function renderStat15ProclaimedOffenders(workbook, _scope, _calcData) {
  const ws = workbook.getWorksheet('STAT_15_PROCLAIMED_OFFENDERS') || workbook.getWorksheet('STAT 15 PROCLAIMED OFFENDERS');
  if (!ws) return;

  console.warn(`[diary] STAT_15_PROCLAIMED_OFFENDERS skipped — STAT_15 | Proclaimed offenders register not built (blocker B6)`);

  // Emit '—' for blocked cells across default data range
  for (let rIdx = 6; rIdx <= 30; rIdx++) {
    const row = ws.getRow(rIdx);
    for (let cIdx = 2; cIdx <= 8; cIdx++) {
      const cell = row.getCell(cIdx);
      if (cell && (cell.value === null || cell.value === undefined || cell.value === '')) {
        cell.value = '—';
      }
    }
    row.commit();
  }
}
