export function renderStat06(workbook, scope, calcData) {
  const ws = workbook.getWorksheet('STAT_6') || workbook.getWorksheet('STAT 6') || workbook.getWorksheet('STAT06');
  if (!ws) return;

  const dbc = calcData.distByCode || {};
  const g = (code, field) => Number(dbc[code]?.[field] || 0);

  // Template STAT_6 rows: 4-6 are headers, data starts at row 7 (FATAL ACCIDENT)
  ws.getCell('C7').value = g('FATAL_ACCIDENT', 'fnY');
  ws.getCell('D7').value = g('FATAL_ACCIDENT', 'fnY1');
  ws.getCell('E7').value = g('FATAL_ACCIDENT', 'uptoY');
  ws.getCell('F7').value = g('FATAL_ACCIDENT', 'uptoY1');
}
