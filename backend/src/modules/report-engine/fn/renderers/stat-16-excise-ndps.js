export function renderStat16(workbook, _scope, calcData) {
  const ws = workbook.getWorksheet('STAT_16') || workbook.getWorksheet('STAT 16');
  if (!ws) return;

  const dbc = calcData.distByCode || {};
  const g = (code, field) => Number(dbc[code]?.[field] || 0);

  // STAT_16 covers Excise Act (rows 6-13), NDPS (rows 14-22), Gambling (rows 23-26).
  // We only have total case counts, not quantity/value breakdown.
  // Row 6 = Liquor total (C=cases FN, D=persons arr FN)
  // Row 14 = NDPS total (same structure)
  // Row 26 = Gambling (C=cases FN, D=upto)
  ws.getCell('C6').value  = g('EXCISE_ACT',   'fnY');
  ws.getCell('D6').value  = g('EXCISE_ACT',   'fnY1');
  ws.getCell('E6').value  = g('EXCISE_ACT',   'uptoY');
  ws.getCell('F6').value  = g('EXCISE_ACT',   'uptoY1');

  ws.getCell('C14').value = g('NDPS_ACT',     'fnY');
  ws.getCell('D14').value = g('NDPS_ACT',     'fnY1');
  ws.getCell('E14').value = g('NDPS_ACT',     'uptoY');
  ws.getCell('F14').value = g('NDPS_ACT',     'uptoY1');

  ws.getCell('C26').value = g('GAMBLING_ACT', 'fnY');
  ws.getCell('D26').value = g('GAMBLING_ACT', 'fnY1');
  ws.getCell('E26').value = g('GAMBLING_ACT', 'uptoY');
  ws.getCell('F26').value = g('GAMBLING_ACT', 'uptoY1');
}
