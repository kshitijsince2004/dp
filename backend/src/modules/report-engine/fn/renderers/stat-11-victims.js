export function renderStat11(workbook, _scope, calcData) {
  const ws = workbook.getWorksheet('STAT_11') || workbook.getWorksheet('STAT 11');
  if (!ws) return;

  const dbc  = calcData.distByCode    || {};
  const dbcW = calcData.distByCodeWo  || {};
  const dbcC = calcData.distByCodeCan || {};
  const dbcA = calcData.distByCodeArr || {};
  const g  = (map, code, field) => Number(map[code]?.[field] || 0);

  // STAT_11 Crime Against Women
  // Columns: D=casesFN, E=casesUpto, F=woFN, G=woUpto, H=canFN, I=canUpto, J=arrFN, K=arrUpto
  // Row 6-13: Rape sub-types (only RAPE total available, writing to row 5 total which is formula)
  // Row 14: Deceitful promise to marry (no separate canonical code)
  // Row 22: Snatching from Women → SNATCHING
  // Row 23: Kidnapping/Abduction of Women → sum KIDNAPPING + ABDUCTION
  // Row 24: Trafficking (no data)
  // Row 26: Total Acid Attack (formula row)
  // Row 27-28: Acid attack sub-types
  // Row 31: Misappropriation of dowry (hardcoded 0 in template)
  // Row 32: Cruelty by in-laws → CRUELTY_BY_HUSBAND
  // Row 33-35: Total Dowry Death → DOWRY_DEATH
  // Row 36: Dowry Prohibition Act
  // Row 39: POCSO Women victim (formula row)

  // Snatching from Women (row 22)
  ws.getCell('D22').value = g(dbc,  'SNATCHING', 'fnY');
  ws.getCell('E22').value = g(dbc,  'SNATCHING', 'uptoY');
  ws.getCell('F22').value = g(dbcW, 'SNATCHING', 'fnY');
  ws.getCell('G22').value = g(dbcW, 'SNATCHING', 'uptoY');
  ws.getCell('H22').value = g(dbcC, 'SNATCHING', 'fnY');
  ws.getCell('I22').value = g(dbcC, 'SNATCHING', 'uptoY');
  ws.getCell('J22').value = g(dbcA, 'SNATCHING', 'fnY');

  // Dowry Death (row 33 is formula total; write sub-rows 34/35 with combined total)
  ws.getCell('D33').value = g(dbc,  'DOWRY_DEATH', 'fnY');
  ws.getCell('F33').value = g(dbcW, 'DOWRY_DEATH', 'fnY');
  ws.getCell('H33').value = g(dbcC, 'DOWRY_DEATH', 'fnY');
  ws.getCell('J33').value = g(dbcA, 'DOWRY_DEATH', 'fnY');

  // Cruelty by in-laws / Misappropriation of dowry (row 32)
  ws.getCell('D32').value = g(dbc,  'CRUELTY_BY_HUSBAND', 'fnY');
  ws.getCell('E32').value = g(dbc,  'CRUELTY_BY_HUSBAND', 'uptoY');
  ws.getCell('F32').value = g(dbcW, 'CRUELTY_BY_HUSBAND', 'fnY');
  ws.getCell('J32').value = g(dbcA, 'CRUELTY_BY_HUSBAND', 'fnY');

  // Acid Attack sub-types (rows 27-28)
  ws.getCell('D27').value = g(dbc,  'ACID_ATTACK_124_1', 'fnY');
  ws.getCell('E27').value = g(dbc,  'ACID_ATTACK_124_1', 'uptoY');
  ws.getCell('J27').value = g(dbcA, 'ACID_ATTACK_124_1', 'fnY');
  ws.getCell('D28').value = g(dbc,  'ACID_ATTACK_ATTEMPT', 'fnY');
  ws.getCell('E28').value = g(dbc,  'ACID_ATTACK_ATTEMPT', 'uptoY');
  ws.getCell('J28').value = g(dbcA, 'ACID_ATTACK_ATTEMPT', 'fnY');

  // Assault on women with intent (row 15 = formula, write sub-row 16 = MO_WOMEN)
  ws.getCell('D16').value = g(dbc,  'MO_WOMEN', 'fnY');
  ws.getCell('E16').value = g(dbc,  'MO_WOMEN', 'uptoY');
  ws.getCell('J16').value = g(dbcA, 'MO_WOMEN', 'fnY');

  // Insult to modesty (row 21)
  ws.getCell('D21').value = g(dbc,  'EVE_TEASING', 'fnY');
  ws.getCell('E21').value = g(dbc,  'EVE_TEASING', 'uptoY');
  ws.getCell('J21').value = g(dbcA, 'EVE_TEASING', 'fnY');
}
