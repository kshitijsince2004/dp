export function renderStat20(workbook, _scope, calcData) {
  const ws = workbook.getWorksheet('STAT_20') || workbook.getWorksheet('STAT 20');
  if (!ws) return;

  const dbcA = calcData.distByCodeArr || {};
  const g = (code, field) => Number(dbcA[code]?.[field] || 0);

  // STAT_20: Persons arrested by crime head. Rows 5-21, C=total FN, D=BC FN, E=prev involved FN,
  // F=total upto, G=BC upto, H=prev involved upto.
  // We only have total arrest counts (no BC/prev-involved breakdown).
  const rowMap = {
    5:  'DACOITY',         6:  'MURDER',         7:  'ATT_TO_MURDER',
    8:  'ROBBERY',         9:  'RIOT',           10: 'KID_FOR_RANSOM',
    11: 'RAPE',            12: 'EXTORTION',      13: 'SNATCHING',
    14: 'HURT',            15: 'BURGLARY',       16: 'MV_THEFT',
    17: 'HOUSE_THEFT',     18: 'OTHER_THEFT',    19: 'CHEATING',
    20: 'DOWRY_DEATH',     21: 'OTHER_IPC',
  };

  for (const [rStr, code] of Object.entries(rowMap)) {
    const r = Number(rStr);
    ws.getCell(`C${r}`).value = g(code, 'fnY');
    ws.getCell(`F${r}`).value = g(code, 'fnY1');
  }
}
