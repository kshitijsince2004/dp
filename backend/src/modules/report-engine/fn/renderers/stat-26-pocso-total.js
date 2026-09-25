export function renderStat26(workbook, _scope, calcData) {
  const ws = workbook.getWorksheet('STAT_26') || workbook.getWorksheet('STAT 26');
  if (!ws) return;

  const dbc  = calcData.distByCode    || {};
  const dbcW = calcData.distByCodeWo  || {};
  const dbcA = calcData.distByCodeArr || {};
  const g = (map, code, field) => Number(map[code]?.[field] || 0);

  // STAT_26: Sub-categories on rows 6, 7, 8. Formulas on row 9 & 17 calculate automatically.
  // Row 6: Penetrative Sexual Assault (Sec 4 & 6)
  // Row 7: Sexual Assault (Sec 8 & 10)
  // Row 8: Sexual Harassment (Sec 12)
  const penFN = g(dbc, 'POCSO_PENETRATIVE', 'fnY') || g(dbc, 'POCSO', 'fnY');
  const penUpto = g(dbc, 'POCSO_PENETRATIVE', 'uptoY') || g(dbc, 'POCSO', 'uptoY');

  ws.getCell('C6').value = penFN;
  ws.getCell('D6').value = penUpto;
  ws.getCell('G6').value = g(dbcW, 'POCSO_PENETRATIVE', 'fnY') || g(dbcW, 'POCSO', 'fnY');
  ws.getCell('H6').value = g(dbcW, 'POCSO_PENETRATIVE', 'uptoY') || g(dbcW, 'POCSO', 'uptoY');
  ws.getCell('K6').value = g(dbcA, 'POCSO_PENETRATIVE', 'fnY') || g(dbcA, 'POCSO', 'fnY');
  ws.getCell('L6').value = g(dbcA, 'POCSO_PENETRATIVE', 'uptoY') || g(dbcA, 'POCSO', 'uptoY');

  ws.getCell('C7').value = g(dbc, 'POCSO_ASSAULT', 'fnY');
  ws.getCell('D7').value = g(dbc, 'POCSO_ASSAULT', 'uptoY');
  ws.getCell('G7').value = g(dbcW, 'POCSO_ASSAULT', 'fnY');
  ws.getCell('H7').value = g(dbcW, 'POCSO_ASSAULT', 'uptoY');
  ws.getCell('K7').value = g(dbcA, 'POCSO_ASSAULT', 'fnY');
  ws.getCell('L7').value = g(dbcA, 'POCSO_ASSAULT', 'uptoY');

  ws.getCell('C8').value = g(dbc, 'POCSO_HARASSMENT', 'fnY');
  ws.getCell('D8').value = g(dbc, 'POCSO_HARASSMENT', 'uptoY');
  ws.getCell('G8').value = g(dbcW, 'POCSO_HARASSMENT', 'fnY');
  ws.getCell('H8').value = g(dbcW, 'POCSO_HARASSMENT', 'uptoY');
  ws.getCell('K8').value = g(dbcA, 'POCSO_HARASSMENT', 'fnY');
  ws.getCell('L8').value = g(dbcA, 'POCSO_HARASSMENT', 'uptoY');
}
