export function renderStat26(workbook, _scope, calcData) {
  const ws = workbook.getWorksheet('STAT_26') || workbook.getWorksheet('STAT 26');
  if (!ws) return;

  const dbc  = calcData.distByCode    || {};
  const dbcW = calcData.distByCodeWo  || {};
  const dbcA = calcData.distByCodeArr || {};
  const g = (map, code, field) => Number(map[code]?.[field] || 0);

  // STAT_26: Total POCSO (with and without BNS sections combined).
  // Row 17 = total row.
  const pFN   = g(dbc,  'POCSO', 'fnY');
  const pUpto = g(dbc,  'POCSO', 'uptoY');
  ws.getCell('C17').value = pFN;
  ws.getCell('D17').value = pUpto;
  ws.getCell('G17').value = g(dbcW, 'POCSO', 'fnY');
  ws.getCell('K17').value = g(dbcA, 'POCSO', 'fnY');
}
