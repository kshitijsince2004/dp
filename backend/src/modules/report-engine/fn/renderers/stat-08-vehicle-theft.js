export function renderStat08(workbook, _scope, calcData) {
  const ws = workbook.getWorksheet('STAT_8') || workbook.getWorksheet('STAT 8');
  if (!ws) return;

  const dbcW = calcData.distByCodeWo  || {};
  const dbcC = calcData.distByCodeCan || {};
  const dbcA = calcData.distByCodeArr || {};
  const gW = (code, field) => Number(dbcW[code]?.[field] || 0);
  const gC = (code, field) => Number(dbcC[code]?.[field] || 0);
  const gA = (code, field) => Number(dbcA[code]?.[field] || 0);

  const rowMap = {
    6:  'DRUGGING_POISONING',
    7:  'ABETMENT_OF_SUICIDE',
    8:  'WRONGFUL_RESTRAINT',
    9:  'WRONGFUL_CONFINEMENT',
    10: 'AFFRAY',
    11: 'DISOBEYING_PUBLIC_SERVANT',
    12: 'PERSONATING_PUBLIC_SERVANT',
    13: 'DISOBEDIENCE_SECTION_223',
    14: 'RESISTANCE_OBSTRUCTION',
    15: 'OBSTRUCTING_PUBLIC_SERVANT',
    16: 'RASH_DRIVING',
    17: 'PORNOGRAPHY',
    18: 'OBSCENE_BOOKS',
    19: 'OBSCENE_OBJECTS_CHILD',
    20: 'OBSCENE_ACTS',
    21: 'VICTIM_IDENTITY_DISCLOSURE',
    22: 'COURT_PROCEEDINGS_PUBLICATION',
    23: 'CHILD_ENGAGEMENT_CRIME',
    24: 'NON_APPEARANCE_PROCLAMATION',
    25: 'TRAFFICKED_PERSON_EXPLOITATION',
    26: 'RECEIVING_STOLEN_PROPERTY',
    27: 'MISCARRIAGE_EXPOSURE',
    28: 'NEGLIGENT_CONDUCT',
    29: 'HARBOURING_OFFENDER',
    30: 'RELIGIOUS_DISTURBANCE',
    31: 'ADULTERATION',
    32: 'SOVEREIGNTY_ENDANGERING',
    33: 'OTHER_BNS',
  };

  for (const [rStr, code] of Object.entries(rowMap)) {
    const r = Number(rStr);
    ws.getCell(`C${r}`).value = gW(code, 'fnY');
    ws.getCell(`D${r}`).value = gW(code, 'uptoY');
    ws.getCell(`E${r}`).value = gC(code, 'fnY');
    ws.getCell(`F${r}`).value = gC(code, 'uptoY');
    ws.getCell(`G${r}`).value = gA(code, 'fnY');
    ws.getCell(`H${r}`).value = gA(code, 'uptoY');
  }
}
