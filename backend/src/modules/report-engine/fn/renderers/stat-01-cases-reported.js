export function renderStat01(workbook, scope, calcData) {
  const ws = workbook.getWorksheet('STAT_1') || workbook.getWorksheet('STAT 1');
  if (!ws) return;

  const dbc = calcData.distByCode || {};
  const g = (code, field) => Number(dbc[code]?.[field] || 0);

  // Row → canonical_code (data rows only; formula/total rows are skipped)
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
    39: 'FATAL_ACCIDENT',  40: 'SIMPLE_ACCIDENT',
    41: 'KIDNAPPING',      42: 'ABDUCTION',      43: 'MO_WOMEN',
    44: 'EVE_TEASING',     45: 'DOWRY_DEATH',
    46: 'ELECTION_OFFENCES', 47: 'PREP_DACOITY',
    49: 'ACID_ATTACK_124_1', 50: 'ACID_ATTACK_ATTEMPT',
  };

  for (const [rStr, code] of Object.entries(rowMap)) {
    const r = Number(rStr);
    ws.getCell(`C${r}`).value = g(code, 'fnY');
    ws.getCell(`D${r}`).value = g(code, 'fnY1');
    ws.getCell(`E${r}`).value = g(code, 'uptoY');
    ws.getCell(`F${r}`).value = g(code, 'uptoY1');
  }
}
