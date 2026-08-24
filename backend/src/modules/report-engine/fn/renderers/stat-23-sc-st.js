// backend/src/modules/report-engine/fn/renderers/stat-23-sc-st.js
// STAT_23: Crimes against SC/ST

import { diaryCount } from '../../shared/diary-query-builder.js';

const STAT23_HEADS = [
  { rowIdx: 6,  headCode: 'MURDER', label: 'Murder' },
  { rowIdx: 7,  headCode: 'ATT_TO_MURDER', label: 'Att. to Murder' },
  { rowIdx: 8,  headCode: 'RAPE', label: 'Rape' },
  { rowIdx: 9,  headCode: 'ASSAULT_ON_WOMEN_MODESTY', label: 'Assault on women' },
  { rowIdx: 10, headCode: 'OTHER_KIDNAPPING', label: 'Kidnapping' },
  { rowIdx: 11, headCode: 'HURT', label: 'Hurts' },
  { rowIdx: 12, headCode: 'ARSON', label: 'Arson' },
  { rowIdx: 13, headCode: 'SC_ST_ACT', label: 'SC/ST (POA) Act' },
];

export async function renderStat23ScSt(workbook, scope, calcData = new Date()) {
  const ws = workbook.getWorksheet('STAT_23') || workbook.getWorksheet('STAT 23') || workbook.getWorksheet('STAT_23_SC_ST');
  if (!ws) return;

  const fnStr = typeof calcData === 'string'
    ? calcData
    : (calcData?.fnEnd
        ? (typeof calcData.fnEnd === 'string' ? calcData.fnEnd : calcData.fnEnd.toISOString().slice(0, 10))
        : (calcData instanceof Date ? calcData.toISOString().slice(0, 10) : new Date().toISOString().slice(0, 10)));

  const scopeType = scope?.level === 'DISTRICT' ? 'DISTRICT' : (scope?.level === 'PS' ? 'PS' : 'HQ');
  const scopeId = scope?.self_id || null;

  for (const h of STAT23_HEADS) {
    const row = ws.getRow(h.rowIdx);
    const headCodes = [h.headCode];

    const fnRep = await diaryCount({
      measure: 'REPORTED',
      recordType: 'CASE',
      headType: 'LOCAL',
      headCodes,
      window: 'FN',
      fnEnd: fnStr,
      scopeType,
      scopeId
    });

    const fnWo = await diaryCount({
      measure: 'WORKED_OUT',
      recordType: 'CASE',
      headType: 'LOCAL',
      headCodes,
      window: 'FN',
      fnEnd: fnStr,
      scopeType,
      scopeId
    });

    const fnCancelled = await diaryCount({
      measure: 'CANCELLED',
      recordType: 'CASE',
      headType: 'LOCAL',
      headCodes,
      window: 'FN',
      fnEnd: fnStr,
      scopeType,
      scopeId
    });

    const uptoRep = await diaryCount({
      measure: 'REPORTED',
      recordType: 'CASE',
      headType: 'LOCAL',
      headCodes,
      window: 'UPTO',
      fnEnd: fnStr,
      scopeType,
      scopeId
    });

    const uptoWo = await diaryCount({
      measure: 'WORKED_OUT',
      recordType: 'CASE',
      headType: 'LOCAL',
      headCodes,
      window: 'UPTO',
      fnEnd: fnStr,
      scopeType,
      scopeId
    });

    const uptoArrested = await diaryCount({
      measure: 'PERSONS_ARRESTED',
      recordType: 'CASE',
      headType: 'LOCAL',
      headCodes,
      window: 'UPTO',
      fnEnd: fnStr,
      scopeType,
      scopeId
    });

    row.getCell(3).value = fnRep;
    row.getCell(4).value = fnWo;
    row.getCell(5).value = fnCancelled;
    row.getCell(6).value = uptoRep;
    row.getCell(7).value = uptoWo;
    row.getCell(8).value = uptoArrested;
    row.commit();
  }
}

export default renderStat23ScSt;
