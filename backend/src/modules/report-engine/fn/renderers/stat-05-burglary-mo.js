export function renderStat05(workbook, _scope, calcData) {
  const ws = workbook.getWorksheet('STAT_5') || workbook.getWorksheet('STAT 5');
  if (!ws) return;

  const dbc  = calcData.distByCode    || {};
  const dbcW = calcData.distByCodeWo  || {};
  const dbcA = calcData.distByCodeArr || {};
  const g = (map, code, field) => Number(map[code]?.[field] || 0);

  // Section A: Clear leftover template sample values across C4:H12
  for (let r = 4; r <= 12; r++) {
    ws.getCell(`C${r}`).value = 0;
    ws.getCell(`D${r}`).value = 0;
    ws.getCell(`E${r}`).value = null;
    ws.getCell(`F${r}`).value = null;
    ws.getCell(`G${r}`).value = null;
    ws.getCell(`H${r}`).value = null;
  }

  // Section B: Day-Night Burglary (rows 17-19)
  // Day Burglary = local head 209, Night Burglary = local head 210
  const dayFN   = g(dbc, 'BURGLARY', 'fnY');
  const dayUpto = g(dbc, 'BURGLARY', 'uptoY');
  ws.getCell('C17').value = dayFN;
  ws.getCell('D17').value = dayUpto;
  ws.getCell('E17').value = 0;
  ws.getCell('F17').value = 0;

  ws.getCell('C18').value = 0;
  ws.getCell('D18').value = 0;
  ws.getCell('E18').value = 0;
  ws.getCell('F18').value = 0;

  ws.getCell('C19').value = 0;
  ws.getCell('D19').value = 0;
  ws.getCell('E19').value = 0;
  ws.getCell('F19').value = 0;

  // Section C: Violent Burglary (rows 24-26)
  ws.getCell('C24').value = g(dbc,  'VIOLENT_BURGLARY', 'fnY');
  ws.getCell('D24').value = g(dbc,  'VIOLENT_BURGLARY', 'fnY1');
  ws.getCell('E24').value = g(dbc,  'VIOLENT_BURGLARY', 'uptoY');
  ws.getCell('F24').value = g(dbc,  'VIOLENT_BURGLARY', 'uptoY1');

  ws.getCell('C25').value = g(dbcW, 'VIOLENT_BURGLARY', 'fnY');
  ws.getCell('D25').value = g(dbcW, 'VIOLENT_BURGLARY', 'fnY1');
  ws.getCell('E25').value = g(dbcW, 'VIOLENT_BURGLARY', 'uptoY');
  ws.getCell('F25').value = g(dbcW, 'VIOLENT_BURGLARY', 'uptoY1');

  ws.getCell('C26').value = g(dbcA, 'VIOLENT_BURGLARY', 'fnY');
  ws.getCell('D26').value = g(dbcA, 'VIOLENT_BURGLARY', 'fnY1');
  ws.getCell('E26').value = g(dbcA, 'VIOLENT_BURGLARY', 'uptoY');
  ws.getCell('F26').value = g(dbcA, 'VIOLENT_BURGLARY', 'uptoY1');
}
