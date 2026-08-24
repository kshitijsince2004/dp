// backend/src/modules/report-engine/fn/renderers/stat-32-cyber-crime.js
// STAT_32: Cases Registered on Direction of Hon'ble Courts u/s 175(3) BNSS

import { diaryCount } from '../../shared/diary-query-builder.js';

const STAT32_HEADS = [
  { rowIdx: 5,  headCode: 'DACOITY', label: 'Dacoity' },
  { rowIdx: 6,  headCode: 'MURDER', label: 'Murder' },
  { rowIdx: 7,  headCode: 'ATT_TO_MURDER', label: 'Att To Murder' },
  { rowIdx: 8,  headCode: 'ROBBERY', label: 'Robbery' },
  { rowIdx: 9,  headCode: 'RIOT', label: 'Riots' },
  { rowIdx: 10, headCode: 'KID_FOR_RANSOM', label: 'Kid. for Ransom' },
  { rowIdx: 11, headCode: 'RAPE', label: 'Rape' },
  { rowIdx: 12, headCode: 'EXTORTION', label: 'Extortion' },
  { rowIdx: 13, headCode: 'SNATCHING', label: 'Snatching' },
  { rowIdx: 14, headCode: 'HURT', label: 'Hurt' },
  { rowIdx: 15, headCode: 'BURGLARY', label: 'Burglary' },
];

export async function renderStat32CyberCrime(workbook, scope, calcData = new Date()) {
  const ws = workbook.getWorksheet('STAT_32') || workbook.getWorksheet('STAT 32') || workbook.getWorksheet('STAT_32_CYBER_CRIME');
  if (!ws) return;

  const fnStr = typeof calcData === 'string'
    ? calcData
    : (calcData?.fnEnd
        ? (typeof calcData.fnEnd === 'string' ? calcData.fnEnd : calcData.fnEnd.toISOString().slice(0, 10))
        : (calcData instanceof Date ? calcData.toISOString().slice(0, 10) : new Date().toISOString().slice(0, 10)));

  const scopeType = scope?.level === 'DISTRICT' ? 'DISTRICT' : (scope?.level === 'PS' ? 'PS' : 'HQ');
  const scopeId = scope?.self_id || null;

  for (const h of STAT32_HEADS) {
    const row = ws.getRow(h.rowIdx);
    const headCodes = [h.headCode];

    const fnRegistered = await diaryCount({
      measure: 'REPORTED',
      recordType: 'CASE',
      headType: 'LOCAL',
      headCodes,
      window: 'FN',
      fnEnd: fnStr,
      scopeType,
      scopeId
    });

    const uptoRegistered = await diaryCount({
      measure: 'REPORTED',
      recordType: 'CASE',
      headType: 'LOCAL',
      headCodes,
      window: 'UPTO',
      fnEnd: fnStr,
      scopeType,
      scopeId
    });

    row.getCell(3).value = fnRegistered;
    row.getCell(4).value = 0; // Previous Year
    row.getCell(5).value = uptoRegistered;
    row.getCell(6).value = 0; // Previous Year Upto
    row.commit();
  }
}

export default renderStat32CyberCrime;
