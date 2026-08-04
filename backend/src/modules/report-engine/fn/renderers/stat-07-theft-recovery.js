export function renderStat07(workbook, _scope, calcData) {
  const ws = workbook.getWorksheet('STAT_7') || workbook.getWorksheet('STAT 7');
  if (!ws) return;

  const dbc = calcData.distByCode || {};
  const g = (code, field) => Number(dbc[code]?.[field] || 0);

  const rowMap = {
    5:  'DRUGGING_POISONING',
    6:  'ABETMENT_OF_SUICIDE',
    7:  'WRONGFUL_RESTRAINT',
    8:  'WRONGFUL_CONFINEMENT',
    9:  'AFFRAY',
    10: 'DISOBEYING_PUBLIC_SERVANT',
    11: 'PERSONATING_PUBLIC_SERVANT',
    12: 'DISOBEDIENCE_SECTION_223',
    13: 'RESISTANCE_OBSTRUCTION',
    14: 'OBSTRUCTING_PUBLIC_SERVANT',
    15: 'RASH_DRIVING',
    16: 'PORNOGRAPHY',
    17: 'OBSCENE_BOOKS',
    18: 'OBSCENE_OBJECTS_CHILD',
    19: 'OBSCENE_ACTS',
    20: 'VICTIM_IDENTITY_DISCLOSURE',
    21: 'COURT_PROCEEDINGS_PUBLICATION',
    22: 'CHILD_ENGAGEMENT_CRIME',
    23: 'NON_APPEARANCE_PROCLAMATION',
    24: 'TRAFFICKED_PERSON_EXPLOITATION',
    25: 'RECEIVING_STOLEN_PROPERTY',
    26: 'MISCARRIAGE_EXPOSURE',
    27: 'NEGLIGENT_CONDUCT',
    28: 'HARBOURING_OFFENDER',
    29: 'RELIGIOUS_DISTURBANCE',
    30: 'ADULTERATION',
    31: 'SOVEREIGNTY_ENDANGERING',
    32: 'OTHER_BNS',
  };

  for (const [rStr, code] of Object.entries(rowMap)) {
    const r = Number(rStr);
    ws.getCell(`C${r}`).value = g(code, 'fnY');
    ws.getCell(`D${r}`).value = g(code, 'fnY1');
    ws.getCell(`E${r}`).value = g(code, 'uptoY');
    ws.getCell(`F${r}`).value = g(code, 'uptoY1');
  }
}
