// backend/src/modules/report-engine/fn/renderers/stat-22-sec223-bns.js
// Blocked Renderer: STAT_22 | Sec 223 BNS court proceedings register not built (blocker B6)

export function renderStat22Sec223Bns(workbook, _scope, _calcData) {
  const ws = workbook.getWorksheet('STAT_22_SEC223_BNS') || workbook.getWorksheet('STAT 22 SEC223 BNS');
  if (!ws) return;

  console.warn(`[diary] STAT_22_SEC223_BNS skipped — STAT_22 | Sec 223 BNS court proceedings register not built (blocker B6)`);

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
