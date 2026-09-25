// backend/src/modules/report-engine/fn/renderers/stat-29-trafficking.js
// Blocked Renderer: STAT_29 | Anti-human trafficking unit register not built (blocker B6)

export function renderStat29Trafficking(workbook, _scope, _calcData) {
  const ws = workbook.getWorksheet('STAT_29_TRAFFICKING') || workbook.getWorksheet('STAT 29 TRAFFICKING');
  if (!ws) return;

  console.warn(`[diary] STAT_29_TRAFFICKING skipped — STAT_29 | Anti-human trafficking unit register not built (blocker B6)`);

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
