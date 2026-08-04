export function renderStat04(workbook, _scope, calcData) {
  const ws = workbook.getWorksheet('STAT_4') || workbook.getWorksheet('STAT 4');
  if (!ws) return;

  const dbcW = calcData.distByCodeWo  || {};
  const dbcC = calcData.distByCodeCan || {};
  const dbcA = calcData.distByCodeArr || {};
  const gW = (code, field) => Number(dbcW[code]?.[field] || 0);
  const gC = (code, field) => Number(dbcC[code]?.[field] || 0);
  const gA = (code, field) => Number(dbcA[code]?.[field] || 0);

  // Same row map as STAT_3: act canonical codes to template rows
  // C=solved FN, D=solved Upto, E=cancelled FN, F=cancelled Upto, G=arrested FN, H=arrested Upto
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
    ws.getCell(`C${r}`).value = gW(code, 'fnY');
    ws.getCell(`D${r}`).value = gW(code, 'uptoY');
    ws.getCell(`E${r}`).value = gC(code, 'fnY');
    ws.getCell(`F${r}`).value = gC(code, 'uptoY');
    ws.getCell(`G${r}`).value = gA(code, 'fnY');
    ws.getCell(`H${r}`).value = gA(code, 'fnY1');
  }
}
