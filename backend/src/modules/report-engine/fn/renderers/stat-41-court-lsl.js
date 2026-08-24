// backend/src/modules/report-engine/fn/renderers/stat-41-court-lsl.js
// STAT_41: Disposal of Local & Special Laws Cases by Court (Phase 3 Strategic Court Implementation)

import { diaryCourtCount } from '../../shared/diary-query-builder.js';

const STAT41_ACTS = [
  { rowIdx: 6,  actName: 'ARMS', label: 'Arms Act - 1959' },
  { rowIdx: 7,  actName: 'EXCISE', label: 'Delhi Excise Act - 2009' },
  { rowIdx: 8,  actName: 'NDPS', label: 'NDPS Act - 1985' },
  { rowIdx: 9,  actName: 'I.T. (P)', label: 'I.T. (P) Act - 1956' },
  { rowIdx: 10, actName: 'POCSO', label: 'POCSO Act - 2012' },
  { rowIdx: 11, actName: 'Information Technology', label: 'Information Technology Act' },
  { rowIdx: 12, actName: 'Gambling', label: 'Gambling Act - 1955' },
  { rowIdx: 13, actName: 'Civil Rights', label: 'Protection of Civil Rights' },
  { rowIdx: 14, actName: 'Explosive', label: 'Explosive Act - 1884' },
];

export async function renderStat41CourtLsl(workbook, scope, calcData = new Date()) {
  const ws = workbook.getWorksheet('STAT_41') || workbook.getWorksheet('STAT 41') || workbook.getWorksheet('STAT_41_COURT_LSL');
  if (!ws) return;

  const fnStr = typeof calcData === 'string'
    ? calcData
    : (calcData?.fnEnd
        ? (typeof calcData.fnEnd === 'string' ? calcData.fnEnd : calcData.fnEnd.toISOString().slice(0, 10))
        : (calcData instanceof Date ? calcData.toISOString().slice(0, 10) : new Date().toISOString().slice(0, 10)));

  const scopeType = scope?.level === 'DISTRICT' ? 'DISTRICT' : (scope?.level === 'PS' ? 'PS' : 'HQ');
  const scopeId = scope?.self_id || null;

  for (const a of STAT41_ACTS) {
    const row = ws.getRow(a.rowIdx);

    const openingInCourt = await diaryCourtCount({
      metric: 'OPENING_IN_COURT',
      actName: a.actName,
      window: 'FN',
      fnEnd: fnStr,
      scopeType,
      scopeId
    });

    const sentToCourt = await diaryCourtCount({
      metric: 'SENT_TO_COURT',
      actName: a.actName,
      window: 'FN',
      fnEnd: fnStr,
      scopeType,
      scopeId
    });

    const convicted = await diaryCourtCount({
      metric: 'DISPOSED_BY_COURT',
      disposalType: 'CONVICTED',
      actName: a.actName,
      window: 'FN',
      fnEnd: fnStr,
      scopeType,
      scopeId
    });

    const acquitted = await diaryCourtCount({
      metric: 'DISPOSED_BY_COURT',
      disposalType: 'ACQUITTED',
      actName: a.actName,
      window: 'FN',
      fnEnd: fnStr,
      scopeType,
      scopeId
    });

    const others = await diaryCourtCount({
      metric: 'DISPOSED_BY_COURT',
      disposalType: 'DISCHARGED',
      actName: a.actName,
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

export default renderStat41CourtLsl;
