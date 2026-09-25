export function renderStat19(workbook, scope, calcData) {
  const ws = workbook.getWorksheet('STAT_19') || workbook.getWorksheet('STAT 19') || workbook.getWorksheet('STAT19');
  if (!ws) return;

  // Template STAT_19 = KIDNAPPING ABDUCTION CASES
  // Columns: C=Kidnapping FN curr, D=Abduction FN curr, E=Kidnapping FN last yr,
  //          F=Abduction FN last yr, G=Kidnapping upto curr, H=Abduction upto curr
  // Rows: 6=Cases Reported, 7=Cases Worked Out, 8=Cases Cancelled, 9=Persons Arrested, 10=No. of Victims
  const dbc    = calcData.distByCode    || {};
  const dbcWo  = calcData.distByCodeWo  || {};
  const dbcCan = calcData.distByCodeCan || {};
  const dbcArr = calcData.distByCodeArr || {};

  const g = (map, code, field) => Number(map[code]?.[field] || 0);

  // Combine KIDNAPPING + KID_FOR_RANSOM into the "Kidnapping" column (no separate abduction code)
  const kidFnY  = g(dbc, 'KIDNAPPING', 'fnY')   + g(dbc, 'KID_FOR_RANSOM', 'fnY');
  const kidFnY1 = g(dbc, 'KIDNAPPING', 'fnY1')  + g(dbc, 'KID_FOR_RANSOM', 'fnY1');
  const kidUpY  = g(dbc, 'KIDNAPPING', 'uptoY') + g(dbc, 'KID_FOR_RANSOM', 'uptoY');
  const woFnY   = g(dbcWo,  'KIDNAPPING', 'fnY') + g(dbcWo,  'KID_FOR_RANSOM', 'fnY');
  const canFnY  = g(dbcCan, 'KIDNAPPING', 'fnY') + g(dbcCan, 'KID_FOR_RANSOM', 'fnY');
  const arrFnY  = g(dbcArr, 'KIDNAPPING', 'fnY') + g(dbcArr, 'KID_FOR_RANSOM', 'fnY');

  ws.getCell('C6').value = kidFnY;
  ws.getCell('E6').value = kidFnY1;
  ws.getCell('G6').value = kidUpY;

  ws.getCell('C7').value = woFnY;
  ws.getCell('C8').value = canFnY;
  ws.getCell('C9').value = arrFnY;
}
