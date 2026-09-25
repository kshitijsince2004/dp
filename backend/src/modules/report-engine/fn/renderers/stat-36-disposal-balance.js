export function renderStat36(workbook, _scope, calcData) {
  const ws = workbook.getWorksheet('STAT_36') || workbook.getWorksheet('STAT 36');
  if (!ws) return;

  const dbc  = calcData.distByCode        || {};
  const dbcW = calcData.distByCodeWo      || {};
  const dbcC = calcData.distByCodeCan     || {};
  const dbcU = calcData.distByCodeUntr    || {};
  const dbcO = calcData.distByCodeOpening || {};
  const g = (map, code, field) => Number(map[code]?.[field] || 0);

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
    39: 'KIDNAPPING',      40: 'ABDUCTION',
    41: 'MO_WOMEN',        42: 'EVE_TEASING',    43: 'DOWRY_DEATH',
    45: 'PREP_DACOITY',    46: 'ACID_ATTACK_124_1',
  };

  for (const [rStr, code] of Object.entries(rowMap)) {
    const r     = Number(rStr);
    const reg   = g(dbc,  code, 'fnY');
    const wo    = g(dbcW, code, 'fnY');
    const can   = g(dbcC, code, 'fnY');
    const untr  = g(dbcU, code, 'fnY');
    const pendStart = g(dbcO, code, 'fnY');

    ws.getCell(`C${r}`).value = pendStart;
    ws.getCell(`D${r}`).value = reg;
    ws.getCell(`F${r}`).value = wo;
    ws.getCell(`G${r}`).value = can;
    ws.getCell(`H${r}`).value = untr;
  }

  // Total Accident row (R38): sum Fatal + Simple
  const accReg  = g(dbc,  'FATAL_ACCIDENT', 'fnY')  + g(dbc,  'SIMPLE_ACCIDENT', 'fnY');
  const accWo   = g(dbcW, 'FATAL_ACCIDENT', 'fnY')   + g(dbcW, 'SIMPLE_ACCIDENT', 'fnY');
  const accCan  = g(dbcC, 'FATAL_ACCIDENT', 'fnY')   + g(dbcC, 'SIMPLE_ACCIDENT', 'fnY');
  const accPend = g(dbcO, 'FATAL_ACCIDENT', 'fnY')   + g(dbcO, 'SIMPLE_ACCIDENT', 'fnY');
  ws.getCell('C38').value = accPend;
  ws.getCell('D38').value = accReg;
  ws.getCell('F38').value = accWo;
  ws.getCell('G38').value = accCan;
}
