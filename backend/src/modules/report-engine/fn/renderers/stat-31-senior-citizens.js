// backend/src/modules/report-engine/fn/renderers/stat-31-senior-citizens.js
// STAT_31: Crime Against North-East States Residents (Fully implemented via locations.state)

import { diaryNorthEastCount } from '../../shared/diary-query-builder.js';

const STAT31_HEADS = [
  { rowIdx: 6,  headCode: 'DACOITY', label: 'Dacoity' },
  { rowIdx: 7,  headCode: 'MURDER', label: 'Murder' },
  { rowIdx: 8,  headCode: 'ATT_TO_MURDER', label: 'Att. to Murder' },
  { rowIdx: 9,  headCode: 'ROBBERY', label: 'Robbery' },
  { rowIdx: 10, headCode: 'RIOT', label: 'Riot' },
  { rowIdx: 11, headCode: 'KID_FOR_RANSOM', label: 'Kid. for Ransom' },
  { rowIdx: 12, headCode: 'RAPE', label: 'Rape' },
  { rowIdx: 13, headCode: 'EXTORTION', label: 'Extortion' },
  { rowIdx: 14, headCode: 'ASSAULT_ON_WOMEN_MODESTY', label: 'Assault on women' },
  { rowIdx: 15, headCode: 'INSULT_MODESTY_WOMEN', label: 'Insult to modesty of women' },
  { rowIdx: 16, headCode: 'OTHER_KIDNAPPING', label: 'Other Kidnapping' },
  { rowIdx: 17, headCode: 'SNATCHING', label: 'Snatching' },
  { rowIdx: 18, headCode: 'HURT', label: 'Hurts' },
  { rowIdx: 19, headCode: 'BURGLARY', label: 'Burglary' },
  { rowIdx: 21, headCode: 'MVT', label: 'Motor Vehicle Theft' },
  { rowIdx: 22, headCode: 'OTHER_THEFT', label: 'Other Theft' },
  { rowIdx: 23, headCode: 'SNATCHING_THEFT', label: 'Snatching' },
  { rowIdx: 24, headCode: 'HOUSE_THEFT', label: 'House Theft' },
  { rowIdx: 25, headCode: 'ACCIDENTS', label: 'Accidents' },
  { rowIdx: 26, headCode: 'CHEATING', label: 'Cheating' },
  { rowIdx: 27, headCode: 'OTHER_IPC', label: 'Other IPC/BNS' },
];

export async function renderStat31SeniorCitizens(workbook, scope, calcData = new Date()) {
  const ws = workbook.getWorksheet('STAT_31') || workbook.getWorksheet('STAT 31') || workbook.getWorksheet('STAT_31_SENIOR_CITIZENS');
  if (!ws) return;

  const fnStr = typeof calcData === 'string'
    ? calcData
    : (calcData?.fnEnd
        ? (typeof calcData.fnEnd === 'string' ? calcData.fnEnd : calcData.fnEnd.toISOString().slice(0, 10))
        : (calcData instanceof Date ? calcData.toISOString().slice(0, 10) : new Date().toISOString().slice(0, 10)));

  const scopeType = scope?.level === 'DISTRICT' ? 'DISTRICT' : (scope?.level === 'PS' ? 'PS' : 'HQ');
  const scopeId = scope?.self_id || null;

  for (const h of STAT31_HEADS) {
    const row = ws.getRow(h.rowIdx);
    const headCodes = [h.headCode];

    const fnRegistered = await diaryNorthEastCount({
      headCodes,
      window: 'FN',
      fnEnd: fnStr,
      scopeType,
      scopeId
    });

    const uptoRegistered = await diaryNorthEastCount({
      headCodes,
      window: 'UPTO',
      fnEnd: fnStr,
      scopeType,
      scopeId
    });

    row.getCell(3).value = fnRegistered;
    row.getCell(4).value = 0;
    row.getCell(5).value = 0;
    row.getCell(6).value = 0;
    row.getCell(7).value = uptoRegistered;
    row.getCell(8).value = 0;
    row.commit();
  }
}

export default renderStat31SeniorCitizens;
