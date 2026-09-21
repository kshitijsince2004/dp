import { PALETTE, FONTS, safeMerge } from '../../shared/canonical-codes.js';

function formatDistrictTitle(name) {
  let s = (name || 'DISTRICT').trim();
  s = s.replace(/\s+DISTRICT$/i, '');
  return `${s.toUpperCase()} DISTRICT`;
}

export function renderG22Daily(workbook, scope, calcData) {
  let sheet = workbook.getWorksheet('G-22 Daily Crime') || workbook.addWorksheet('G-22 Daily Crime');
  const distTitle = formatDistrictTitle(scope.self_name);
  const dbc = calcData.distByCode || {};
  const g = code => { const v = dbc[code]?.dayY || 0; return v > 0 ? v : '-'; };

  safeMerge(sheet, 'A1:Z1');
  const t1 = sheet.getCell('A1');
  t1.value = `Daily Crime ${distTitle}`;
  t1.font = FONTS.TITLE;
  t1.alignment = { horizontal: 'center', vertical: 'middle' };

  // Quadrant 1: Heinous
  const r2 = sheet.addRow(['District', 'Dacoity', 'Murder', 'Att. To Murder', 'Robbery', 'Riots', 'Kid. For Ran.', 'Rape', 'Snatching', '', 'Burglary', '']);
  r2.font = FONTS.HEADER;
  r2.eachCell(c => c.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: PALETTE.LIGHT_ORANGE } });

  const r3 = sheet.addRow(['', '', '', '', '', '', '', '', 'PS', 'E-FIR', 'PS', 'E-FIR']);
  r3.font = FONTS.HEADER;
  r3.eachCell(c => c.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: PALETTE.LIGHT_ORANGE } });

  // eFIR day counts by canonical code (today only)
  const psIds = scope.children_ids || [];
  const efirD = calcData.psEfirByCode || {};
  const efirDay = code => {
    let tot = 0;
    psIds.forEach(id => { tot += Number(efirD[id]?.[code] || 0); });
    return tot > 0 ? tot : '-';
  };

  const d1 = sheet.addRow([
    distTitle,
    g('DACOITY'), g('MURDER'), g('ATT_TO_MURDER'), g('ROBBERY'), g('RIOT'), g('KID_FOR_RANSOM'), g('RAPE'),
    g('SNATCHING'), efirDay('SNATCHING'),
    g('BURGLARY'), efirDay('BURGLARY'),
  ]);
  d1.font = FONTS.DATA;

  sheet.addRow([]);

  // Quadrant 2: Other IPC
  const r5 = sheet.addRow(['District', 'Extortion', 'Hurt', 'M.V. Theft', '', 'House Theft', '', 'Misc. Theft', '', 'Kidnapping', 'Abduction']);
  r5.font = FONTS.HEADER;
  r5.eachCell(c => c.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: PALETTE.LIGHT_ORANGE } });

  const r6 = sheet.addRow(['', '', '', 'PS', 'E-FIR', 'PS', 'E-FIR', 'PS', 'E-FIR', '', '']);
  r6.font = FONTS.HEADER;

  const d2 = sheet.addRow([
    distTitle,
    g('EXTORTION'), g('HURT'),
    g('MV_THEFT'), efirDay('MV_THEFT'),
    g('HOUSE_THEFT'), efirDay('HOUSE_THEFT'),
    g('OTHER_THEFT'), efirDay('OTHER_THEFT'),
    g('KIDNAPPING'), g('ABDUCTION'),
  ]);
  d2.font = FONTS.DATA;

  sheet.addRow([]);

  // Quadrant 3: Women/Special
  const r8 = sheet.addRow(['District', 'M.O. Women', '498-A/406', 'Eve-Teasing', 'Sim Accident', 'Fatal Accident', 'Cheating', 'Dowry Death', 'Other IPC/BNS']);
  r8.font = FONTS.HEADER;
  r8.eachCell(c => c.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: PALETTE.LIGHT_ORANGE } });

  const d3 = sheet.addRow([
    distTitle,
    g('MO_WOMEN'), g('CRUELTY_BY_HUSBAND'), g('EVE_TEASING'),
    g('SIMPLE_ACCIDENT'), g('FATAL_ACCIDENT'),
    g('CHEATING'), g('DOWRY_DEATH'), g('OTHER_IPC'),
  ]);
  d3.font = FONTS.DATA;

  sheet.addRow([]);

  // Quadrant 4: Acts + Grand Total
  const r10 = sheet.addRow(['District', 'Arms', 'Excise', 'Gambling', 'NDPS', 'Organised (111)', 'Terrorist (113)', 'Elect.', 'DPDP', 'Other Act', 'TOTAL ACT', 'GRAND TOTAL']);
  r10.font = FONTS.HEADER;
  r10.eachCell(c => c.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: PALETTE.LIGHT_ORANGE } });

  const actCodes = ['ARMS_ACT','EXCISE_ACT','GAMBLING_ACT','NDPS_ACT','POCSO','ORGANISED_CRIME','TERRORIST_ACT','ELECT_ACT','DPDP_ACT','OTHER_ACT'];
  const totalAct = actCodes.reduce((s, c) => s + (dbc[c]?.dayY || 0), 0);
  const grandTotal = Object.keys(dbc).reduce((s, c) => s + (dbc[c]?.dayY || 0), 0);

  const d4 = sheet.addRow([
    distTitle,
    g('ARMS_ACT'), g('EXCISE_ACT'), g('GAMBLING_ACT'), g('NDPS_ACT'),
    g('ORGANISED_CRIME'), g('TERRORIST_ACT'),
    g('ELECT_ACT'), g('DPDP_ACT'), g('OTHER_ACT'),
    totalAct > 0 ? totalAct : '-',
    grandTotal > 0 ? grandTotal : '-',
  ]);
  d4.font = FONTS.DATA;

  sheet.columns.forEach((col, idx) => { col.width = idx === 0 ? 32 : 14; });
}
