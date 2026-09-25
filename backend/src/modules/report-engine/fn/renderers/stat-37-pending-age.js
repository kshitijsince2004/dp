export function renderStat37(workbook, scope, calcData) {
  const ws = workbook.getWorksheet('STAT_37') || workbook.getWorksheet('STAT 37') || workbook.getWorksheet('STAT37');
  if (!ws) return;

  // Template STAT_37 = DISPOSAL OF L&SL CASES BY POLICE (mirrors STAT_36 but for acts)
  // Column layout (same as STAT_36):
  //   C = Opening pending (at beginning of FN)
  //   D = Registered during FN
  //   E = Total of C & D
  //   F = Challaned (Worked Out)
  //   G = Cancelled
  //   H = Untraced
  // Template formula cells at I (total disposed) and N (closing balance) auto-compute from these.
  const dbc     = calcData.distByCode     || {};
  const dbcWo   = calcData.distByCodeWo   || {};
  const dbcCan  = calcData.distByCodeCan  || {};
  const dbcUntr = calcData.distByCodeUntr || {};

  const g = (map, code, field) => Number(map[code]?.[field] || 0);

  // Row → canonical_code mapping matches STAT_3 (L&SL) template row order
  const rowMap = {
    6:  'ARMS_ACT',
    7:  'EXCISE_ACT',
    8:  'NDPS_ACT',
    9:  'ITP_ACT',
    10: 'POCSO',
    11: 'IT_ACT',
    12: 'GAMBLING_ACT',
  };

  for (const [rIdxStr, code] of Object.entries(rowMap)) {
    const rIdx = Number(rIdxStr);
    const reg      = g(dbc,     code, 'fnY');
    const uptoY    = g(dbc,     code, 'uptoY');
    const wo       = g(dbcWo,   code, 'fnY');
    const can      = g(dbcCan,  code, 'fnY');
    const untr     = g(dbcUntr, code, 'fnY');
    const pendStart = Math.max(0, uptoY - reg);
    const total     = pendStart + reg;
    const balance   = Math.max(0, total - (wo + can + untr));

    ws.getCell(`C${rIdx}`).value = pendStart;
    ws.getCell(`D${rIdx}`).value = reg;
    ws.getCell(`E${rIdx}`).value = total;
    ws.getCell(`F${rIdx}`).value = wo;
    ws.getCell(`G${rIdx}`).value = can;
    ws.getCell(`H${rIdx}`).value = untr;
    ws.getCell(`N${rIdx}`).value = balance;
  }
}
