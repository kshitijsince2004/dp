// backend/src/modules/classification/crimeClassification.service.js
// Centralized backend classification for Heinous vs Non-Heinous crime heads.
// Exactly the 7 authoritative Heinous Crime Heads: Dacoity, Murder, Attempt to Murder,
// Robbery, Riot, Kidnapping for Ransom, Rape.

import db from '../../config/db.js';
import { getLogger } from '../../utils/logger.js';

const log = getLogger('crimeClassification');

/**
 * Exactly the 7 authoritative Heinous crime head codes / names
 */
export const HEINOUS_CRIME_HEADS = new Set([
  'DACOITY',
  'MURDER',
  'ATT_TO_MURDER',
  'ATTEMPT TO MURDER',
  'ROBBERY',
  'RIOT',
  'KID_FOR_RANSOM',
  'KIDNAPPING FOR RANSOM',
  'RAPE',
]);

/**
 * Helper to check if a crime head code or name is one of the 7 Heinous crime heads
 */
export function isHeinousCrimeHead(headNameOrCode = '') {
  if (!headNameOrCode || typeof headNameOrCode !== 'string') return false;
  const norm = headNameOrCode
    .toUpperCase()
    .replace(/[.&/]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();

  if (HEINOUS_CRIME_HEADS.has(norm)) return true;

  // Pattern matching for standard 7 heads
  if (/^DACOITY\b/i.test(norm)) return true;
  if (/^MURDER\b/i.test(norm)) return true;
  if (/(ATT.*TO.*MURDER|ATTEMPT.*TO.*MURDER)/i.test(norm)) return true;
  if (/^ROBBERY\b/i.test(norm)) return true;
  if (/^RIOT\b|^RIOTS\b/i.test(norm)) return true;
  if (/(KID.*FOR.*RANSOM|KIDNAPPING.*FOR.*RANSOM)/i.test(norm)) return true;
  if (/^RAPE\b/i.test(norm)) return true;

  return false;
}

/**
 * Main classifier for record crime category based strictly on Crime Head
 * @param {Object} params
 * @param {string} [params.localHeadCategory]
 * @param {string} [params.localHeadName]
 * @param {string} [params.majorHeadName]
 * @returns {{ category: 'HEINOUS'|'NON_HEINOUS'|'OTHER', isHeinous: boolean, reason: string }}
 */
export function classifyRecordOffences({ localHeadCategory, localHeadName, majorHeadName } = {}) {
  // 1. Direct local head crime_category check
  if (localHeadCategory === 'HEINOUS') {
    return { category: 'HEINOUS', isHeinous: true, reason: 'Local head is categorized as HEINOUS' };
  }

  // 2. Crime head name check against the 7 Heinous heads
  if (localHeadName && isHeinousCrimeHead(localHeadName)) {
    return { category: 'HEINOUS', isHeinous: true, reason: `Local head '${localHeadName}' is one of the 7 Heinous crime heads` };
  }

  if (majorHeadName && isHeinousCrimeHead(majorHeadName)) {
    return { category: 'HEINOUS', isHeinous: true, reason: `Major head '${majorHeadName}' is one of the 7 Heinous crime heads` };
  }

  // 3. Non-Heinous check
  if (localHeadCategory === 'NON_HEINOUS') {
    return { category: 'NON_HEINOUS', isHeinous: false, reason: 'Local head is categorized as NON_HEINOUS' };
  }

  return { category: 'OTHER', isHeinous: false, reason: 'Non-heinous / other crime head' };
}

/**
 * Async lookup and classification for a record ID
 */
export async function getRecordClassification(trx, recordId) {
  const [firDetail, arrestDetail] = await Promise.all([
    trx('fir_details as fd')
      .leftJoin('ref.local_heads as lh', 'fd.local_head_id', 'lh.local_head_cd')
      .where('fd.record_id', recordId)
      .select('fd.*', 'lh.local_head', 'lh.crime_category')
      .first(),
    trx('arrest_details as ad')
      .leftJoin('ref.local_heads as lh', 'ad.local_head_id', 'lh.local_head_cd')
      .where('ad.record_id', recordId)
      .select('ad.*', 'lh.local_head', 'lh.crime_category')
      .first(),
  ]);

  const detail = firDetail || arrestDetail;
  return classifyRecordOffences({
    localHeadCategory: detail?.crime_category,
    localHeadName: detail?.local_head,
  });
}
