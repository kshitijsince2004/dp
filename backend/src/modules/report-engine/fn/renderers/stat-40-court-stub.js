// backend/src/modules/report-engine/fn/renderers/stat-40-court-stub.js
// STAT_40: Disposal of BNS Cases by Court (Phase 3 Strategic Court Implementation)

import { diaryCourtCount } from '../../shared/diary-query-builder.js';

const STAT40_HEINOUS_HEADS = [
  { rowIdx: 7,  headCode: 'DACOITY', label: 'Dacoity' },
  { rowIdx: 8,  headCode: 'MURDER', label: 'Murder' },
  { rowIdx: 9,  headCode: 'ATT_TO_MURDER', label: 'Att. to Murder' },
  { rowIdx: 10, headCode: 'ROBBERY', label: 'Robbery' },
  { rowIdx: 11, headCode: 'RIOT', label: 'Riot' },
  { rowIdx: 12, headCode: 'KID_FOR_RANSOM', label: 'Kid. for Ransom' },
  { rowIdx: 13, headCode: 'RAPE', label: 'Rape' },
];

export async function renderStat40CourtStub(workbook, scope, calcData = new Date()) {
  const ws = workbook.getWorksheet('STAT_40') || workbook.getWorksheet('STAT 40') || workbook.getWorksheet('STAT_40_COURT_STUB');
  if (!ws) return;

  const fnStr = typeof calcData === 'string'
    ? calcData
    : (calcData?.fnEnd
        ? (typeof calcData.fnEnd === 'string' ? calcData.fnEnd : calcData.fnEnd.toISOString().slice(0, 10))
        : (calcData instanceof Date ? calcData.toISOString().slice(0, 10) : new Date().toISOString().slice(0, 10)));

  const scopeType = scope?.level === 'DISTRICT' ? 'DISTRICT' : (scope?.level === 'PS' ? 'PS' : 'HQ');
  const scopeId = scope?.self_id || null;

  for (const h of STAT40_HEINOUS_HEADS) {
    const row = ws.getRow(h.rowIdx);
    const headCodes = [h.headCode];

    const openingInCourt = await diaryCourtCount({
      metric: 'OPENING_IN_COURT',
      headCodes,
      window: 'FN',
      fnEnd: fnStr,
      scopeType,
      scopeId
    });

    const sentToCourt = await diaryCourtCount({
      metric: 'SENT_TO_COURT',
      headCodes,
      window: 'FN',
      fnEnd: fnStr,
      scopeType,
      scopeId
    });

    const convicted = await diaryCourtCount({
      metric: 'DISPOSED_BY_COURT',
      disposalType: 'CONVICTED',
      headCodes,
      window: 'FN',
      fnEnd: fnStr,
      scopeType,
      scopeId
    });

    const acquitted = await diaryCourtCount({
      metric: 'DISPOSED_BY_COURT',
      disposalType: 'ACQUITTED',
      headCodes,
      window: 'FN',
      fnEnd: fnStr,
      scopeType,
      scopeId
    });

    const others = await diaryCourtCount({
      metric: 'DISPOSED_BY_COURT',
      disposalType: 'DISCHARGED',
      headCodes,
      window: 'FN',
      fnEnd: fnStr,
      scopeType,
      scopeId
    });

    row.getCell(3).value = openingInCourt;
    row.getCell(4).value = sentToCourt;
    row.getCell(5).value = openingInCourt + sentToCourt;
    row.getCell(6).value = convicted;
    row.getCell(7).value = acquitted;
    row.getCell(8).value = others;
    row.getCell(9).value = convicted + acquitted + others;
    row.getCell(10).value = Math.max(0, (openingInCourt + sentToCourt) - (convicted + acquitted + others));
    row.commit();
  }
}

export default renderStat40CourtStub;
