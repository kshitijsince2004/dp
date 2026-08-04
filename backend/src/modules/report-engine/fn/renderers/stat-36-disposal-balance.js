export function renderStat36(workbook, _scope, calcData) {
  const ws = workbook.getWorksheet('STAT_36') || workbook.getWorksheet('STAT 36');
  if (!ws) return;

  const dbc  = calcData.distByCode     || {};
  const dbcW = calcData.distByCodeWo   || {};
  const dbcC = calcData.distByCodeCan  || {};
  const dbcU = calcData.distByCodeUntr || {};
  const g = (map, code, field) => Number(map[code]?.[field] || 0);

  // STAT_36 columns:
  //   C = Pending at beginning of FN (we compute uptoY - fnY)
  //   D = Registered during FN (formula in template referencing STAT_1; we overwrite)
  //   F = Challaned (worked out) during FN
  //   G = Cancelled during FN
  //   H = Untraced during FN
  //   E, I, N = formulas (total, disposed, balance) — left as template formulas

  // Row map mirrors STAT_1 but STAT_36 row 38 = Total Accident (formula, no sub-rows),
  // and rows 39-47 shift by 2 vs STAT_1 (no Fatal/Simple sub-rows).
  const rowMap = {
    7:  'DACOITY',         8:  'MURDER',         9:  'ATT_TO_MURDER',
    10: 'ROBBERY',         11: 'RIOT',           12: 'KID_FOR_RANSOM',
    13: 'RAPE',
    16: 'EXTORTION',       17: 'SNATCHING',
    19: 'SIMPLE_HURT',     20: 'GRIEVOUS_HURT',
    21: 'BURGLARY',
    23: 'MV_THEFT',        24: 'HOUSE_THEFT',    25: 'SERVANT_THEFT',
    26: 'PICKPOCKETING',   27: 'OTHER_THEFT',
    28: 'CULPABLE_HOMICIDE', 29: 'ATT_TO_CULPABLE_HOMICIDE',
    30: 'HOUSE_TRESPASS',  31: 'CRIMINAL_BREACH_OF_TRUST',
    32: 'CHEATING',        33: 'FORGERY',        34: 'COUNTERFEITING',
    35: 'MISCHIEF',        36: 'ARSON',          37: 'THREATENING',
    // R38 = Total Accident formula row (no sub-rows in STAT_36)
    39: 'KIDNAPPING',      40: 'ABDUCTION',
    41: 'MO_WOMEN',        42: 'EVE_TEASING',    43: 'DOWRY_DEATH',
    // R44 = Misappropriation (C44 hardcoded 0 in template)
    45: 'PREP_DACOITY',    46: 'ACID_ATTACK_124_1',
  };

  for (const [rStr, code] of Object.entries(rowMap)) {
    const r   = Number(rStr);
    const reg   = g(dbc,  code, 'fnY');
    const upto  = g(dbc,  code, 'uptoY');
    const wo    = g(dbcW, code, 'fnY');
    const can   = g(dbcC, code, 'fnY');
    const untr  = g(dbcU, code, 'fnY');
    const pendStart = Math.max(0, upto - reg);

    ws.getCell(`C${r}`).value = pendStart;
    ws.getCell(`D${r}`).value = reg;
    ws.getCell(`F${r}`).value = wo;
    ws.getCell(`G${r}`).value = can;
    ws.getCell(`H${r}`).value = untr;
  }

  // Total Accident row (R38): sum Fatal + Simple
  const accReg  = g(dbc,  'FATAL_ACCIDENT', 'fnY')  + g(dbc,  'SIMPLE_ACCIDENT', 'fnY');
  const accUpto = g(dbc,  'FATAL_ACCIDENT', 'uptoY') + g(dbc,  'SIMPLE_ACCIDENT', 'uptoY');
  const accWo   = g(dbcW, 'FATAL_ACCIDENT', 'fnY')   + g(dbcW, 'SIMPLE_ACCIDENT', 'fnY');
  const accCan  = g(dbcC, 'FATAL_ACCIDENT', 'fnY')   + g(dbcC, 'SIMPLE_ACCIDENT', 'fnY');
  ws.getCell('C38').value = Math.max(0, accUpto - accReg);
  ws.getCell('D38').value = accReg;
  ws.getCell('F38').value = accWo;
  ws.getCell('G38').value = accCan;
}
