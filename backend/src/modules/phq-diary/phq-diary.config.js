/**
 * PHQ Diary Configuration
 *
 * Maps diary sheet rows to local_head_cd values and name-match patterns.
 * local_head_cd 1-7 are fixed by the ref-overlay file (HEINOUS block).
 * All other heads are matched by regex against ref.local_heads.local_head text.
 *
 * An empty localHeadCds array with a matchPattern means: apply text match.
 * A non-empty localHeadCds array is the authoritative match (no regex needed).
 *
 * Rows that "catch remaining" (OTHER_THEFT, OTHER_IPC, OTHER_ACT) set
 * isCatchAll: true and accumulate every local_head not claimed by an earlier row.
 */

export const OTHER_IPC_CODE = 'OTHER_IPC';
export const OTHER_BNS_CODE = 'OTHER_BNS';

// ─── Stat Baseline Code Mapping ───────────────────────────────────────────────
export const STAT_BASELINE_CODE_MAP = {
  'ATTEMPT_TO_MURDER': 'ATT_TO_MURDER',
  'MOTOR_VEHICLE_THEFT': 'MV_THEFT',
  'BURGLARY': 'BURGLARY',
  'DOWRY_DEATH': 'OTHER_IPC',
  'MURDER': 'MURDER',
  'RAPE': 'RAPE',
  'ROBBERY': 'ROBBERY',
};

// ─── IPC HEINOUS rows (local_head_cds / canonical_code) ─────────────────────────
export const HEINOUS_ROWS = [
  { code: 'DACOITY',        label: 'DACOITY',          localHeadCds: [1], canonicalCode: 'DACOITY' },
  { code: 'MURDER',         label: 'MURDER',            localHeadCds: [2], canonicalCode: 'MURDER' },
  { code: 'ATT_TO_MURDER',  label: 'ATT TO MURDER',     localHeadCds: [3], canonicalCode: 'ATT_TO_MURDER' },
  { code: 'ROBBERY',        label: 'ROBBERY',           localHeadCds: [4], canonicalCode: 'ROBBERY' },
  { code: 'RIOT',           label: 'RIOT',              localHeadCds: [5], canonicalCode: 'RIOT' },
  { code: 'KID_FOR_RANSOM', label: 'KID FOR RANSOM',    localHeadCds: [6], canonicalCode: 'KID_FOR_RANSOM' },
  { code: 'RAPE',           label: 'RAPE',              localHeadCds: [7], canonicalCode: 'RAPE' },
];

// ─── IPC NON-HEINOUS rows (canonical_code / matchPattern) ─────────────────────
export const NON_HEINOUS_ROWS = [
  { code: 'EXTORTION',      label: 'EXTORTION',         canonicalCode: 'EXTORTION', matchPattern: /extortion/i },
  { code: 'SNATCHING',      label: 'SNATCHING',         canonicalCode: 'SNATCHING', matchPattern: /snatching/i },
  { code: 'HURT',           label: 'HURT',              canonicalCode: 'HURT', matchPattern: /\bhurt\b/i },
  { code: 'BURGLARY',       label: 'BURGLARY',          canonicalCode: 'BURGLARY', matchPattern: /burglary/i },
  { code: 'HOUSE_THEFT',    label: 'HOUSE THEFT',       canonicalCode: 'HOUSE_THEFT', matchPattern: /house\s*theft/i },
  { code: 'MV_THEFT',       label: 'M V THEFT',         canonicalCode: 'MV_THEFT', matchPattern: /motor\s*vehicle\s*theft|m\.?\s*v\.?\s*theft|vehicle theft/i },
  { code: 'OTHER_THEFT',    label: 'OTHER THEFT',       canonicalCode: 'OTHER_THEFT', matchPattern: /theft/i, isCatchAll: false },
  { code: 'MO_WOMEN',       label: 'M O WOMEN',         canonicalCode: 'MO_WOMEN', matchPattern: /molestation|outraging|m\.?\s*o\.?\s*women|eve\s*teas|women/i },
  { code: 'KIDNAPPING',     label: 'KIDNAPPING',        canonicalCode: 'KIDNAPPING', matchPattern: /kidnapping/i },
  { code: 'ABDUCTION',      label: 'ABDUCTION',         canonicalCode: 'ABDUCTION', matchPattern: /abduction/i },
  { code: 'FATAL_ACCIDENT', label: 'FATAL ACCIDENT',    canonicalCode: 'FATAL_ACCIDENT', matchPattern: /fatal\s*accident/i },
  { code: 'SIMPLE_ACCIDENT',label: 'SIMPLE ACCIDENT',   canonicalCode: 'SIMPLE_ACCIDENT', matchPattern: /simple\s*accident|non.?fatal/i },
  { code: 'OTHER_IPC',      label: 'OTHER IPC',         canonicalCode: 'OTHER_IPC', isCatchAll: true },
];

// ─── LSL (Local & Special Laws) rows ────────────────────────────────────────
export const LSL_ROWS = [
  { code: 'ARMS_ACT',     label: 'ARMS ACT',     canonicalCode: 'ARMS_ACT', matchPattern: /arms\s*act/i },
  { code: 'EXCISE_ACT',   label: 'EXCISE ACT',   canonicalCode: 'EXCISE_ACT', matchPattern: /excise/i },
  { code: 'NDPS_ACT',     label: 'NDPS ACT',     canonicalCode: 'NDPS_ACT', matchPattern: /ndps|narcotic\s*drugs/i },
  { code: 'GAMBLING_ACT', label: 'GAMBLING ACT', canonicalCode: 'GAMBLING_ACT', matchPattern: /gambling/i },
  { code: 'POCSO_ACT',    label: 'POCSO ACT',    canonicalCode: 'POCSO', matchPattern: /pocso|protection\s*of\s*children/i },
  { code: 'OTHER_ACT',    label: 'OTHER ACT',    canonicalCode: 'OTHER_ACT', isCatchAll: true },
];

// All IPC + LSL rows in order (used for catch-all computation)
export const ALL_CRIME_ROWS = [...HEINOUS_ROWS, ...NON_HEINOUS_ROWS, ...LSL_ROWS];

// ─── NDPS recovery rows ──────────────────────────────────────────────────────
// Matched against ref.drug_types.drug_type text
export const DRUG_ROWS = [
  { code: 'SMACK_HEROIN', label: 'SMACK / HEROIN', matchPattern: /smack|heroin/i },
  { code: 'COCAINE',      label: 'COCAINE',         matchPattern: /cocaine/i },
  { code: 'CHARAS',       label: 'CHARAS',          matchPattern: /charas|hashish/i },
  { code: 'OPIUM',        label: 'OPIUM',           matchPattern: /opium/i },
  { code: 'GANJA',        label: 'GANJA',           matchPattern: /ganja|cannabis|marijuana/i },
  { code: 'POPPY_HEAD',   label: 'POPPY HEAD',      matchPattern: /poppy/i },
];

// ─── Arrest type rows ─────────────────────────────────────────────────────────
// Use same local_head_cds where known, otherwise text match
export const ARREST_ROWS = [
  { code: 'ARR_DACOITS',     label: 'DACOITS',     localHeadCds: [1] },
  { code: 'ARR_ROBBERS',     label: 'ROBBERS',     localHeadCds: [4] },
  { code: 'ARR_SNATCHERS',   label: 'SNATCHERS',   matchPattern: /snatching/i },
  { code: 'ARR_BURGLARS',    label: 'BURGLARS',    matchPattern: /burglary/i },
  { code: 'ARR_AUTO_LIFTERS',label: 'AUTO LIFTERS', matchPattern: /motor\s*vehicle\s*theft|m\.?\s*v\.?\s*theft|vehicle theft|auto\s*lift/i },
  // IPC total & LSL rows are computed, not mapped directly
];

// ─── District scope groups (matches scopeResolver.SCOPE_GROUPS keys) ─────────
export const SCOPE_GROUPS = {
  LO_NORTH: 'LO_NORTH',
  LO_SOUTH: 'LO_SOUTH',
  ALL_DELHI: 'ALL_DELHI_TOTAL',
};

// Display order and label for the Upto_Date / DISTRICTS sheet district columns.
// code must match hierarchy_nodes.code. The order matches PHQ_Diary.xls Sheet 4.
export const UPTODATE_DISTRICTS = [
  { code: 'DIST_CD',          label: 'NORTH' },
  { code: 'DIST_ND',          label: 'CENTRAL' },
  { code: 'DIST_NWD',         label: 'NORTH-WEST' },
  { code: 'DIST_OND',         label: 'OUTER-NORTH' },
  { code: 'DIST_RND',         label: 'ROHINI' },
  { code: 'DIST_NDD',         label: 'NEW DELHI' },
  { code: 'DIST_SWD',         label: 'SOUTH-WEST' },
  { code: 'DIST_ED',          label: 'EAST' },
  { code: 'DIST_SHD',         label: 'SHAHDARA' },
  { code: 'DIST_NED',         label: 'NORTH-EAST' },
  { code: 'DIST_SD',          label: 'SOUTH' },
  { code: 'DIST_SED',         label: 'SOUTH-EAST' },
  { code: 'DIST_DW',          label: 'DWARKA' },
  { code: 'DIST_OD',          label: 'OUTER' },
  { code: 'DIST_WD',          label: 'WEST' },
  { code: 'DIST_RAILWAYS',    label: 'RAILWAYS' },
  { code: 'DIST_METRO',       label: 'METRO' },
  { code: 'DIST_IGIAIRPORT',  label: 'IGI' },
  { code: 'DIST_SPECIALCELL', label: 'SPL. CELL' },
  { code: 'DIST_CRIMEBRANCH', label: 'CRIME' },
  { code: 'DIST_EOW',         label: 'EOW' },
  { code: 'DIST_SPUWAC',      label: 'SPUWAC' },
  { code: 'DIST_VIGILANCE',   label: 'VIGILANCE' },
];

// 19 district columns for Sheet 2: DISTRICTS (2-year comparative)
export const TWO_YEAR_DISTRICTS = [
  { code: 'DIST_CD',          label: 'NORTH' },
  { code: 'DIST_ND',          label: 'CENTRAL' },
  { code: 'DIST_NWD',         label: 'NORTH-WEST' },
  { code: 'DIST_OND',         label: 'OUTER-NORTH' },
  { code: 'DIST_RND',         label: 'ROHINI' },
  { code: 'DIST_NDD',         label: 'NEW DELHI' },
  { code: 'DIST_SWD',         label: 'SOUTH-WEST' },
  { code: 'DIST_ED',          label: 'EAST' },
  { code: 'DIST_SHD',         label: 'SHAHDARA' },
  { code: 'DIST_NED',         label: 'NORTH-EAST' },
  { code: 'DIST_SD',          label: 'SOUTH' },
  { code: 'DIST_SED',         label: 'SOUTH-EAST' },
  { code: 'DIST_DW',          label: 'DWARKA' },
  { code: 'DIST_OD',          label: 'OUTER' },
  { code: 'DIST_WD',          label: 'WEST' },
  { code: 'DIST_RAILWAYS',    label: 'RAILWAYS' },
  { code: 'DIST_METRO',       label: 'METRO' },
  { code: 'DIST_IGIAIRPORT',  label: 'IGI' },
  { code: 'DIST_OTHERS',      label: 'OTHERS' },
];

export const LO_NORTH_DISTRICTS = [
  { code: 'DIST_CD',  label: 'NORTH' },
  { code: 'DIST_ND',  label: 'CENTRAL' },
  { code: 'DIST_NWD', label: 'NORTH-WEST' },
  { code: 'DIST_OND', label: 'OUTER-NORTH' },
  { code: 'DIST_RND', label: 'ROHINI' },
  { code: 'DIST_ED',  label: 'EAST' },
  { code: 'DIST_SHD', label: 'SHAHDARA' },
  { code: 'DIST_NED', label: 'NORTH-EAST' },
];

export const LO_SOUTH_DISTRICTS = [
  { code: 'DIST_NDD', label: 'NEW DELHI' },
  { code: 'DIST_SWD', label: 'SOUTH-WEST' },
  { code: 'DIST_SD',  label: 'SOUTH' },
  { code: 'DIST_SED', label: 'SOUTH-EAST' },
  { code: 'DIST_DW',  label: 'DWARKA' },
  { code: 'DIST_OD',  label: 'OUTER' },
  { code: 'DIST_WD',  label: 'WEST' },
];

// ─── Monday Morning Non-Heinous Rows (Exact 19-row reference matching) ─────────
export const MONDAY_MORNING_NON_HEINOUS_ROWS = [
  { code: 'SNATCHING',      label: 'SNATCHING',         matchPattern: /snatching/i },
  { code: 'EXTORTION',      label: 'EXTORTION',         matchPattern: /extortion/i },
  { code: 'HURT',           label: 'HURT',              matchPattern: /\bhurt\b/i },
  { code: 'BURGLARY',       label: 'BURGLARY',          matchPattern: /burglary/i },
  { code: 'MV_THEFT',       label: 'M V THEFT',         matchPattern: /motor\s*vehicle\s*theft|m\.?\s*v\.?\s*theft|vehicle theft/i },
  { code: 'MO_WOMEN',       label: 'M.O.WOMEN',         matchPattern: /molestation|outraging|m\.?\s*o\.?\s*women|eve\s*teas|women/i },
  { code: 'KIDNAPPING',     label: 'KIDNAPPING',        matchPattern: /kidnapping/i },
  { code: 'ABDUCTION',      label: 'ABDUCTION',         matchPattern: /abduction/i },
  { code: 'OTHER_IPC',      label: 'OTHER IPC',         isCatchAll: true },
];

// IPC rows displayed in the district breakdown sheets
export const DISTRICT_IPC_ROWS = [
  { code: 'DACOITY',        label: 'DACOITY', isHeinous: true },
  { code: 'MURDER',         label: 'MURDER', isHeinous: true },
  { code: 'ATT_TO_MURDER',  label: 'ATT TO MURDER', isHeinous: true },
  { code: 'ROBBERY',        label: 'ROBBERY', isHeinous: true },
  { code: 'RIOT',           label: 'RIOT', isHeinous: true },
  { code: 'KID_FOR_RANSOM', label: 'KID FOR RANSOM', isHeinous: true },
  { code: 'RAPE',           label: 'RAPE', isHeinous: true },
  { code: 'TOTAL_HEINOUS',  label: 'TOTAL  HENIOUS', isTotal: true, isHeinousBlock: true },
  { code: 'EXTORTION',      label: 'EXTORTION' },
  { code: 'SNATCHING',      label: 'SNATCHING' },
  { code: 'HURT',           label: 'HURT' },
  { code: 'BURGLARY',       label: 'BURGLARY' },
  { code: 'HOUSE_THEFT',    label: 'HOUSE THEFT' },
  { code: 'MV_THEFT',       label: 'M V THEFT' },
  { code: 'OTHER_THEFT',    label: 'OTHER THEFT' },
  { code: 'MO_WOMEN',       label: 'M O WOMEN' },
  { code: 'KID_ABDUCTION',  label: 'KID & ABDUCTION', codes: ['KIDNAPPING', 'ABDUCTION'] },
  { code: 'FATAL_ACCIDENT', label: 'FATAL ACCIDENT' },
  { code: 'SIMPLE_ACCIDENT',label: 'SIMPLE ACCIDENT' },
  { code: 'OTHER_IPC',      label: 'OTHER IPC' },
  { code: 'TOTAL_NON_HEINOUS', label: 'TOTAL NON HENIOUS', isTotal: true },
  { code: 'TOTAL_IPC',      label: 'TOTAL IPC', isTotal: true },
];

// LSL rows displayed in district breakdown sheets below TOTAL IPC
export const DISTRICT_LSL_ROWS = [
  { code: 'ARMS_ACT',     label: 'ARMS ACT' },
  { code: 'EXCISE_ACT',   label: 'EXCISE ACT' },
  { code: 'NDPS_ACT',     label: 'NDPS ACT' },
  { code: 'GAMBLING_ACT', label: 'GAMBLING ACT' },
  { code: 'OTHER_ACT',    label: 'OTHER ACT' },
  { code: 'TOTAL_ACT',    label: 'TOTAL ACT', isTotal: true },
  { code: 'GRAND_TOTAL',  label: 'GRAND TOTAL', isTotal: true },
];
