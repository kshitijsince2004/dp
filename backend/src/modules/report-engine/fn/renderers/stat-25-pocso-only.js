export function renderStat25(workbook, _scope, calcData) {
  const ws = workbook.getWorksheet('STAT_25') || workbook.getWorksheet('STAT 25');
  if (!ws) return;

  const dbc  = calcData.distByCode    || {};
  const dbcW = calcData.distByCodeWo  || {};
  const dbcC = calcData.distByCodeCan || {};
  const dbcA = calcData.distByCodeArr || {};
  const g = (map, code, field) => Number(map[code]?.[field] || 0);

  // STAT_25: POCSO-only cases. Row 18 = total (formula expected at top).
  // We write to the total row directly; sub-section breakdown not available.
  // From session summary: Row 18, C=FN, D=upto, G=wo FN, H=wo upto, I=can FN, J=can upto, K=arr FN
  ws.getCell('C18').value = g(dbc,  'POCSO', 'fnY');
  ws.getCell('D18').value = g(dbc,  'POCSO', 'uptoY');
  ws.getCell('G18').value = g(dbcW, 'POCSO', 'fnY');
  ws.getCell('H18').value = g(dbcW, 'POCSO', 'uptoY');
  ws.getCell('I18').value = g(dbcC, 'POCSO', 'fnY');
  ws.getCell('J18').value = g(dbcC, 'POCSO', 'uptoY');
  ws.getCell('K18').value = g(dbcA, 'POCSO', 'fnY');
  ws.getCell('L18').value = g(dbcA, 'POCSO', 'uptoY');
}
