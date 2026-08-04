export function renderStat03(workbook, scope, calcData) {
  const ws = workbook.getWorksheet('STAT_3') || workbook.getWorksheet('STAT 3');
  if (!ws) return;

  const dbc = calcData.distByCode || {};
  const g = (code, field) => Number(dbc[code]?.[field] || 0);

  // Template rows for known act canonical codes (STAT_3 template row → canonical_code)
  const rowMap = {
    5:  'ARMS_ACT',
    6:  'EXCISE_ACT',
    7:  'NDPS_ACT',
    8:  'ITP_ACT',
    9:  'POCSO',
    10: 'IT_ACT',
    11: 'GAMBLING_ACT',
    12: 'PCR_ACT',
    50: 'OTHER_ACT',
  };

  for (const [rStr, code] of Object.entries(rowMap)) {
    const r = Number(rStr);
    ws.getCell(`C${r}`).value = g(code, 'fnY');
    ws.getCell(`D${r}`).value = g(code, 'fnY1');
    ws.getCell(`E${r}`).value = g(code, 'uptoY');
    ws.getCell(`F${r}`).value = g(code, 'uptoY1');
  }
}
