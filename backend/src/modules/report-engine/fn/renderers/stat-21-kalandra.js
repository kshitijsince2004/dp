// backend/src/modules/report-engine/fn/renderers/stat-21-kalandra.js
// STAT_21: Disposal of Kalandra and Preventive Action (Blocker B6 Resolution)

import { diaryKalandraCount } from '../../shared/diary-query-builder.js';

export async function renderStat21Kalandra(workbook, scope, calcData = new Date()) {
  const ws = workbook.getWorksheet('STAT_21') || workbook.getWorksheet('STAT 21') || workbook.getWorksheet('STAT_21_KALANDRA');
  if (!ws) return;

  const fnStr = typeof calcData === 'string'
    ? calcData
    : (calcData?.fnEnd
        ? (typeof calcData.fnEnd === 'string' ? calcData.fnEnd : calcData.fnEnd.toISOString().slice(0, 10))
        : (calcData instanceof Date ? calcData.toISOString().slice(0, 10) : new Date().toISOString().slice(0, 10)));

  const scopeType = scope?.level === 'DISTRICT' ? 'DISTRICT' : (scope?.level === 'PS' ? 'PS' : 'HQ');
  const scopeId = scope?.self_id || null;

  // Counts for 126/169 BNSS (or legacy 107/150 CrPC)
  const fn169_k = await diaryKalandraCount({ sectionCodes: ['126', '169', '107', '150'], window: 'FN', fnEnd: fnStr, scopeType, scopeId });
  const upto169_k = await diaryKalandraCount({ sectionCodes: ['126', '169', '107', '150'], window: 'UPTO', fnEnd: fnStr, scopeType, scopeId });

  // Counts for 126/170 BNSS (or legacy 107/151 CrPC)
  const fn170_k = await diaryKalandraCount({ sectionCodes: ['170', '151'], window: 'FN', fnEnd: fnStr, scopeType, scopeId });
  const upto170_k = await diaryKalandraCount({ sectionCodes: ['170', '151'], window: 'UPTO', fnEnd: fnStr, scopeType, scopeId });

  // Row 6: NO. OF CASES
  const row6 = ws.getRow(6);
  row6.getCell(3).value = fn169_k;
  row6.getCell(4).value = fn169_k; // 1 person per Kalandra arrest record
  row6.getCell(5).value = upto169_k;
  row6.getCell(6).value = upto169_k;
  row6.getCell(7).value = fn170_k;
  row6.getCell(8).value = fn170_k;
  row6.getCell(9).value = upto170_k;
  row6.getCell(10).value = upto170_k;
  row6.commit();

  // Rows 7 to 13: Disposal outcomes (bound down, discharged, interim bond, sent to JC)
  // These are blocked because arrest_details currently tracks detention without disposal ledger
  for (let rIdx = 7; rIdx <= 13; rIdx++) {
    const row = ws.getRow(rIdx);
    for (let cIdx = 3; cIdx <= 10; cIdx++) {
      const cell = row.getCell(cIdx);
      if (cell && (cell.value === null || cell.value === undefined || cell.value === '')) {
        cell.value = '--';
      }
    }
    row.commit();
  }
}

export default renderStat21Kalandra;
