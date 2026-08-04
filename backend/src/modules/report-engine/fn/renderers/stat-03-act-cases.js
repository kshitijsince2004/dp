export function renderStat03(workbook, scope, calcData) {
  const ws = workbook.getWorksheet('STAT_3') || workbook.getWorksheet('STAT 3');
  if (!ws) return;

  const dbc = calcData.distByCode || {};
  const g = (code, field) => Number(dbc[code]?.[field] || 0);

  const rowMap = {
    5:  'ARMS_ACT',
    6:  'EXCISE_ACT',
    7:  'NDPS_ACT',
    8:  'ITP_ACT',
    9:  'POCSO',
    10: 'IT_ACT',
    11: 'GAMBLING_ACT',
    12: 'PCR_ACT',
    13: 'EXPLOSIVE_ACT',
    14: 'EXPLOSIVE_SUBSTANCES_ACT',
    15: 'COPYRIGHT_ACT',
    16: 'TRADEMARK_ACT',
    17: 'CHILD_LABOUR_ACT',
    18: 'BONDED_LABOUR_ACT',
    19: 'JUVENILE_JUSTICE_ACT',
    20: 'CHILD_MARRIAGE_ACT',
    21: 'WILDLIFE_ACT',
    22: 'ANTIQUITY_ACT',
    23: 'DISABILITIES_ACT',
    24: 'DEFACEMENT_ACT',
    25: 'PUBLIC_PROPERTY_DAMAGE_ACT',
    26: 'INDECENT_REPRESENTATION_ACT',
    27: 'SC_ST_ACT',
    28: 'ESSENTIAL_COMMODITIES_ACT',
    29: 'FOREIGNERS_ACT',
    30: 'PASSPORT_ACT',
    31: 'RAILWAY_ACT',
    32: 'ORGAN_TRANSPLANT_ACT',
    33: 'MONEY_LAUNDERING_ACT',
    34: 'PNDT_ACT',
    35: 'DOMESTIC_VIOLENCE_ACT',
    36: 'SEXUAL_HARASSMENT_ACT',
    37: 'DOWRY_PROHIBITION_ACT',
    38: 'CORRUPTION_ACT',
    39: 'UAPA',
    40: 'MCOCA',
    41: 'OFFICIAL_SECRETS_ACT',
    42: 'COTPA',
    43: 'TOUTING_ACT',
    44: 'ELECTRICITY_ACT',
    45: 'FOREST_ACT',
    46: 'MEDICARE_ACT',
    47: 'MENTAL_HEALTH_ACT',
    48: 'ENVIRONMENT_ACT',
    49: 'BEGGING_ACT',
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
