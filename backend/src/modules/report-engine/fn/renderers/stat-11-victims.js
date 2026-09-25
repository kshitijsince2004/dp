export function renderStat11(workbook, _scope, calcData) {
  const ws = workbook.getWorksheet('STAT_11') || workbook.getWorksheet('STAT 11');
  if (!ws) return;

  const dbc  = calcData.distByCode    || {};
  const dbcW = calcData.distByCodeWo  || {};
  const dbcC = calcData.distByCodeCan || {};
  const dbcA = calcData.distByCodeArr || {};

  const g  = (map, code, field) => Number(map[code]?.[field] || 0);

  // Data rows to code mapping for STAT_11 (Formula rows: 5, 15, 26, 30, 33, 39, 44 are skipped)
  const rowCodeMap = {
    6:  'RAPE',
    7:  null,
    8:  null,
    9:  null,
    10: null,
    11: null,
    12: null,
    13: null,
    14: null,
    16: 'MO_WOMEN',
    17: null,
    18: null,
    19: null,
    20: null,
    21: 'EVE_TEASING',
    22: 'SNATCHING',
    23: 'KIDNAPPING',
    24: null,
    25: 'ABETMENT_OF_SUICIDE',
    27: 'ACID_ATTACK_124_1',
    28: 'ACID_ATTACK_ATTEMPT',
    29: null,
    31: null,
    32: 'CRIMINAL_BREACH_OF_TRUST', // or CRUELTY_BY_HUSBAND
    34: 'DOWRY_DEATH',
    35: null,
    36: 'DOWRY_PROHIBITION_ACT',
    37: 'DOMESTIC_VIOLENCE_ACT',
    38: 'SEXUAL_HARASSMENT_ACT',
    40: 'POCSO',
    41: null,
    42: null,
    43: null,
  };

  const formulaRows = new Set([5, 15, 26, 30, 33, 39, 44]);

  for (let r = 6; r <= 43; r++) {
    if (formulaRows.has(r)) continue;

    const code = rowCodeMap[r];
    const repFn   = code ? g(dbc,  code, 'fnY')   : 0;
    const repUpto = code ? g(dbc,  code, 'uptoY') : 0;
    const woFn    = code ? g(dbcW, code, 'fnY')   : 0;
    const woUpto  = code ? g(dbcW, code, 'uptoY') : 0;
    const canFn   = code ? g(dbcC, code, 'fnY')   : 0;
    const canUpto = code ? g(dbcC, code, 'uptoY') : 0;
    const arrFn   = code ? g(dbcA, code, 'fnY')   : 0;
    const arrUpto = code ? g(dbcA, code, 'uptoY') : 0;

    ws.getCell(`D${r}`).value = repFn;
    ws.getCell(`E${r}`).value = repUpto;
    ws.getCell(`F${r}`).value = woFn;
    ws.getCell(`G${r}`).value = woUpto;
    ws.getCell(`H${r}`).value = canFn;
    ws.getCell(`I${r}`).value = canUpto;
    ws.getCell(`J${r}`).value = arrFn;
    ws.getCell(`K${r}`).value = arrUpto;
  }
}
