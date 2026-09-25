// backend/src/modules/report-engine/fn/renderers/stat-33-property-stolen-recovered.js
// Blocked Renderer: STAT_33 | Property stolen & recovered ledger not built (blocker B6)

export function renderStat33PropertyStolenRecovered(workbook, _scope, _calcData) {
  const ws = workbook.getWorksheet('STAT_33_PROPERTY_STOLEN_RECOVERED') || workbook.getWorksheet('STAT 33 PROPERTY STOLEN RECOVERED');
  if (!ws) return;

  console.warn(`[diary] STAT_33_PROPERTY_STOLEN_RECOVERED skipped — STAT_33 | Property stolen & recovered ledger not built (blocker B6)`);

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
