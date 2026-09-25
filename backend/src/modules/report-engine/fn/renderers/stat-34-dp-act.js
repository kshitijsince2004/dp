// backend/src/modules/report-engine/fn/renderers/stat-34-dp-act.js
// Blocked Renderer: STAT_34 | 66 DP Act court disposal register not built (blocker B6)

export function renderStat34DpAct(workbook, _scope, _calcData) {
  const ws = workbook.getWorksheet('STAT_34_DP_ACT') || workbook.getWorksheet('STAT 34 DP ACT');
  if (!ws) return;

  console.warn(`[diary] STAT_34_DP_ACT skipped — STAT_34 | 66 DP Act court disposal register not built (blocker B6)`);

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
