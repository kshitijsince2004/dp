/**
 * Standard crime head list used across multiple FN Diary sheets.
 * code: canonical_code in ref.local_heads.
 */
export const IPC_BNS_HEADS = [
  { label: 'Dacoity',            code: 'DACOITY',        isHeinous: true },
  { label: 'Murder',             code: 'MURDER',         isHeinous: true },
  { label: 'Att. Murder',        code: 'ATT_TO_MURDER',  isHeinous: true },
  { label: 'Robbery',            code: 'ROBBERY',        isHeinous: true },
  { label: 'Riots',              code: 'RIOT',           isHeinous: true },
  { label: 'Kid. For Ransom',    code: 'KID_FOR_RANSOM', isHeinous: true },
  { label: 'Rape',               code: 'RAPE',           isHeinous: true },
  { label: 'TOTAL HEINOUS',      isTotal: true, group: 'heinous' },
  { label: 'Snatching',          code: 'SNATCHING' },
  { label: 'Extortion',          code: 'EXTORTION' },
  { label: 'Hurt',               code: 'HURT' },
  { label: 'Burglary',           code: 'BURGLARY' },
  { label: 'House Theft',        code: 'HOUSE_THEFT' },
  { label: 'M.V. Theft',         code: 'MV_THEFT' },
  { label: 'Other Theft',        code: 'OTHER_THEFT' },
  { label: 'M.O. Women',         code: 'MO_WOMEN' },
  { label: 'Kidnapping',         code: 'KIDNAPPING' },
  { label: 'Abduction',          code: 'ABDUCTION' },
  { label: 'Eve Teasing',        code: 'EVE_TEASING' },
  { label: 'Fatal Accident',     code: 'FATAL_ACCIDENT' },
  { label: 'Simple Accident',    code: 'SIMPLE_ACCIDENT' },
  { label: 'Cheating',           code: 'CHEATING' },
  { label: 'Dowry Death',        code: 'DOWRY_DEATH' },
  { label: 'Cruelty (498A/85BNS)', code: 'CRUELTY_BY_HUSBAND' },
  { label: 'Drugging/Poisoning', code: 'DRUGGING_POISONING' },
  { label: 'Other BNS/IPC',      code: 'OTHER_IPC' },
  { label: 'TOTAL NON-HEINOUS',  isTotal: true, group: 'non_heinous' },
  { label: 'TOTAL IPC/BNS',      isTotal: true, group: 'ipc' },
];

export const ACT_HEADS = [
  { label: 'Arms Act',           code: 'ARMS_ACT',     isAct: true },
  { label: 'Excise Act',         code: 'EXCISE_ACT',   isAct: true },
  { label: 'Gambling Act',       code: 'GAMBLING_ACT', isAct: true },
  { label: 'NDPS Act',           code: 'NDPS_ACT',     isAct: true },
  { label: 'POCSO Act',          code: 'POCSO',        isAct: true },
  { label: 'Other Act',          code: 'OTHER_ACT',    isAct: true },
  { label: 'TOTAL ACT',          isTotal: true, group: 'act' },
  { label: 'GRAND TOTAL',        isTotal: true, group: 'grand' },
];

export const ALL_HEADS = [...IPC_BNS_HEADS, ...ACT_HEADS];

export const HEINOUS_CODES = new Set([
  'DACOITY','MURDER','ATT_TO_MURDER','ROBBERY','RIOT','KID_FOR_RANSOM','RAPE'
]);
export const ACT_CODES = new Set([
  'ARMS_ACT','EXCISE_ACT','GAMBLING_ACT','NDPS_ACT','POCSO','OTHER_ACT'
]);

/** Build group sums over {fnY, fnY1, uptoY, uptoY1} from a distByCode map. */
export function buildGroupSums(distByCode) {
  const fields = ['fnY', 'fnY1', 'uptoY', 'uptoY1'];
  const sums = { heinous: {}, non_heinous: {}, ipc: {}, act: {}, grand: {} };
  Object.values(sums).forEach(g => fields.forEach(f => (g[f] = 0)));

  ALL_HEADS.forEach(h => {
    if (!h.code || h.isTotal) return;
    fields.forEach(f => {
      const v = Number(distByCode[h.code]?.[f] || 0);
      if (HEINOUS_CODES.has(h.code)) {
        sums.heinous[f] += v; sums.ipc[f] += v; sums.grand[f] += v;
      } else if (ACT_CODES.has(h.code)) {
        sums.act[f] += v; sums.grand[f] += v;
      } else {
        sums.non_heinous[f] += v; sums.ipc[f] += v; sums.grand[f] += v;
      }
    });
  });
  return sums;
}
