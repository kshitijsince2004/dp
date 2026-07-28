// E-FIR Split — used by A5, A6, B1, B3
export const EFIR_SPLIT = {
  BURGLARY:    { ps_source: 'MANUAL', efir_source: ['E_THEFT'],        heads: [12,13,209,210] },
  MV_THEFT:    { ps_source: 'MANUAL', efir_source: ['E_MVT','E_THEFT'], heads: [16] },
  HOUSE_THEFT: { ps_source: 'MANUAL', efir_source: ['E_THEFT'],        heads: [18] },
  SNATCHING:   { ps_source: 'MANUAL', efir_source: ['E_THEFT'],        heads: [9] },
  ROBBERY:     { ps_source: 'MANUAL', efir_source: ['E_THEFT'],        heads: [4] },
  MISC_THEFT:  { ps_source: 'MANUAL', efir_source: ['E_THEFT'],        heads: [17,19,20,21,22,23,24,25,26,27,28,208] },
};

// Cheating breakdown — used by A5 only
export const CHEATING = {
  TOTAL:   { heads: [38,39],   source: null },
  FORGERY: { heads: [39],      source: null },
  STREET:  { heads: [38],      source: ['MANUAL'] },
  CYBER:   { heads: null,      source: ['NCRP'] },
  E_CHEAT: { heads: [38],      source: ['E_THEFT'] },
};

// B1 E-FIR sheet rows
export const EFIR_SHEET_ROWS = [
  { label: 'D Burglary',     head: 209 },
  { label: 'N Burglary',     head: 210 },
  { label: 'MV Theft',       head: 16 },
  { label: 'House Theft',    head: 18 },
  { label: 'Pick Pocketing', head: 21 },
  { label: 'Other Theft',    head: 19 },
];

// Vehicle classification for 66 DP Act
export const VEHICLE_CLASS = {
  TWO_WHEELER:  [1,2,3,4,5,33,46],
  FOUR_WHEELER: [10,11,12,13,14,15,31,35,40],
  // Everything else = OTHER
};

// District-specific heads NOT in PHQ report
export const DISTRICT_ONLY_HEADS = {
  SERVANT_THEFT: 17,
  EVE_TEASING: 54,
  CRUELTY_BY_HUSBAND: 43,  // 498-A/406 IPC or 85 BNS
  DOWRY_DEATH: 44,
  DRUGGING: 59,
  CHEATING: 38,
  FORGERY: 39,
  COUNTERFEITING: 40,
  CYBER_CRIME: null,
  ORGANISED_CRIME: null,
};

// Official Palette extracted from District_diary.xlsx
export const PALETTE = {
  YELLOW:           'FFFFFF00', // Rcell DD headers, Total row A1
  LIGHT_ORANGE:     'FFFCD5B5', // E-FIR headers, Morning Diary headers, N-1/2/3 sub-headers
  PALE_YELLOW:      'FFFFFF99', // E-FIR data cells
  GREEN:            'FF92D050', // E-FIR "MV Theft"/"Other Theft" row labels, N-1/2/3 Organised/Terrorist
  LIGHT_BLUE:       'FFBDD8EE', // N-1/2/3 sub-division header Group 1 (KOTWALI)
  LIGHT_GREEN:      'FFECF1DF', // N-1/2/3 sub-division header Group 2 (SADAR BAZAR), D-9 arrest headers
  LIGHT_PURPLE:     'FFDBEEF4', // N-1/2/3 sub-division header Group 3 (CIVIL LINES)
  OLIVE_GREEN:      'FF9BBB59', // D1 Res date, DCsP date, D-9 title/sub-division headers
  LIGHT_GRAY:       'FFDADCD8', // D1 Res total rows
  MEDIUM_GRAY:      'FFBFBFBF', // D1 Res percentage cells
  SALMON_ORANGE:    'FFFAC08F', // D1 Res "N/W Out" column
  BRIGHT_BLUE:      'FF00B0F0', // D-8 Brief Facts title
  LIGHT_PINK:       'FFF2DCDB', // D-9 FIR/Kal Arrests date ref, D13 ref
  SAGE_GREEN:       'FFC3D69B', // D-9 column headers
  DUSTY_PINK:       'FFE5B5B9', // D-9 "Place of Arrest" column
  PEACH:            'FFFCD5B4', // Morning Diary "Upto Last Day" section
  LIGHT_CREAM:      'FFFDEADA', // D13 66DP data rows
  VERY_PALE_YELLOW: 'FFFFFFCC', // D13 66DP Total row
  RED:              'FFFF0000', // Sheet Title Red
};

// Official Font Specifications
export const FONTS = {
  TITLE:           { name: 'Calibri', size: 22, bold: true, color: { argb: PALETTE.RED } },
  SUBTITLE:        { name: 'Calibri', size: 16, bold: true },
  HEADER:          { name: 'Calibri', size: 16, bold: true },
  DATA:            { name: 'Calibri', size: 16 },
  N123_SUBDIV:     { name: 'Calibri', size: 36, bold: true },
  N123_PS_ABBREV:  { name: 'Calibri', size: 28, bold: true },
  N123_REP_WO:     { name: 'Calibri', size: 36 },
  EFIR_DATA:       { name: 'Calibri', size: 20, bold: true },
  D8_TITLE:        { name: 'Calibri', size: 26, bold: true },
};
