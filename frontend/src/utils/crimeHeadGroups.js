// Frontend-only crime-head category grouping for the DCP/HQ "Crime Head Category
// Performance" chart. `ref.local_heads.crime_category` in the DB only curates HEINOUS
// (see config/ref-overlays/local_head_categories.json) — NON_HEINOUS is an empty overlay
// bucket today, so the Non-Heinous / Other IPC / Act-type sub-groupings below have no DB
// equivalent and live here instead, per DB_SCHEMA.md ruling 16's own note that "reports
// roll OTHER up with NON_HEINOUS; only HEINOUS is broken out".
//
// This grouping is applied to the REAL local-head registry fetched from
// GET /fields/lookup/local-heads (backed by ref.local_heads — the same endpoint the CASE/
// UIDB form's local_head dropdown uses), not to a hardcoded guess of what names exist.
// `crime_category` from that response is authoritative for Heinous; only the
// Non-Heinous/Act bucket assignment below is a best-effort label match (transcribed from
// the reference crime-head register) and should be corrected here if a real label doesn't
// match once seen in the fetched list.

const normalize = (name) =>
  (name || '')
    .toUpperCase()
    .replace(/[.&/]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();

export const NON_HEINOUS_HEADS = [
  'Extortion',
  'Snatching',
  'Hurt',
  'Burglary',
  'House Theft',
  'MV Theft',
  'Other Theft',
  'Molestation of Women',
  'M.O. Women',
  'Kidnapping',
  'Abduction',
  'Fatal Accident',
  'Simple Accident',
];

// Bucket -> candidate local_head label(s). Anything recognized as an Act-style head but
// not listed under a specific bucket falls into OTHER_ACT.
export const ACT_HEAD_GROUPS = {
  ARMS_ACT: ['Arms Act'],
  EXCISE_ACT: ['Excise Act', 'Delhi Excise Act'],
  NDPS_ACT: ['NDPS Act'],
  GAMBLING: ['Gambling', 'Gambling Act'],
  POCSO_ACT: ['POCSO Act'],
};

const NORMALIZED_NON_HEINOUS = new Set(NON_HEINOUS_HEADS.map(normalize));
const NORMALIZED_ACT_GROUPS = Object.entries(ACT_HEAD_GROUPS).map(([bucket, labels]) => ({
  bucket,
  names: new Set(labels.map(normalize)),
}));

// Classifies one local-head registry row ({ value, label, crime_category }) into one of:
// HEINOUS, NON_HEINOUS, ARMS_ACT, EXCISE_ACT, NDPS_ACT, GAMBLING, POCSO_ACT, OTHER_ACT, or
// OTHER_IPC (fallback — also where anything unrecognized lands so nothing silently drops
// off the chart). HEINOUS always comes from the DB's own crime_category, never name-matched.
export function getCrimeHeadGroup(localHeadRow) {
  if (localHeadRow?.crime_category === 'HEINOUS') return 'HEINOUS';

  const normalized = normalize(localHeadRow?.label);
  if (!normalized) return 'OTHER_IPC';

  if (NORMALIZED_NON_HEINOUS.has(normalized)) return 'NON_HEINOUS';

  for (const { bucket, names } of NORMALIZED_ACT_GROUPS) {
    if (names.has(normalized)) return bucket;
  }

  if (normalized.includes('ACT')) return 'OTHER_ACT';

  return 'OTHER_IPC';
}

const ACT_BUCKETS = ['ARMS_ACT', 'EXCISE_ACT', 'NDPS_ACT', 'GAMBLING', 'POCSO_ACT', 'OTHER_ACT'];

// Takes the full local-head registry (GET /fields/lookup/local-heads — every known crime
// head, not just ones with activity this period) plus the crime-head-matrix rows
// ({ crime_head, FIR, Workout, ... }, keyed by name) and rolls them up into the 5 chart
// categories: Heinous, Non Heinous, Other IPC, Total IPC (sum of the first 3), Total Act
// (sum of all Act buckets). Each category carries { reported, workout } — FIR = "Rep",
// Workout = "W/O" in the reference sketch. Heads with no records this period still count
// (as 0) since the rollup is driven by the full registry, not just active matrix rows.
export function aggregateCrimeHeadCategories(localHeads = [], matrixRows = []) {
  const countsByName = new Map(matrixRows.map((row) => [normalize(row.crime_head), row]));

  const totals = { HEINOUS: { reported: 0, workout: 0 }, NON_HEINOUS: { reported: 0, workout: 0 }, OTHER_IPC: { reported: 0, workout: 0 } };
  ACT_BUCKETS.forEach((b) => { totals[b] = { reported: 0, workout: 0 }; });

  localHeads.forEach((headRow) => {
    const group = getCrimeHeadGroup(headRow);
    const bucket = totals[group] ? group : 'OTHER_IPC';
    const matrixRow = countsByName.get(normalize(headRow.label));
    totals[bucket].reported += matrixRow?.FIR || 0;
    totals[bucket].workout += matrixRow?.Workout || 0;
  });

  const totalIpc = {
    reported: totals.HEINOUS.reported + totals.NON_HEINOUS.reported + totals.OTHER_IPC.reported,
    workout: totals.HEINOUS.workout + totals.NON_HEINOUS.workout + totals.OTHER_IPC.workout,
  };
  const totalAct = ACT_BUCKETS.reduce(
    (acc, b) => ({ reported: acc.reported + totals[b].reported, workout: acc.workout + totals[b].workout }),
    { reported: 0, workout: 0 }
  );

  return [
    { category: 'Heinous', ...totals.HEINOUS },
    { category: 'Non Heinous', ...totals.NON_HEINOUS },
    { category: 'Other IPC', ...totals.OTHER_IPC },
    { category: 'Total IPC', ...totalIpc },
    { category: 'Total Act', ...totalAct },
  ];
}
