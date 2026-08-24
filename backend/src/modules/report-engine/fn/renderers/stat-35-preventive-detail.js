// backend/src/modules/report-engine/fn/renderers/stat-35-preventive-detail.js
// STAT_35: Detailed Action under Delhi Police Act Provisions (Blocker B6 Resolution)

import { diaryKalandraCount } from '../../shared/diary-query-builder.js';

const DP_ACT_ROWS = [
  { rowIdx: 5,  label: '91/93/97 D.P. ACT', sections: ['91', '93', '97'] },
  { rowIdx: 6,  label: '92/93/97 D.P. ACT', sections: ['92', '93', '97'] },
  { rowIdx: 7,  label: '53/116 D.P. ACT',   sections: ['53', '116'] },
  { rowIdx: 8,  label: '28/112 D.P. ACT',   sections: ['28', '112'] },
  { rowIdx: 9,  label: '103 D.P. ACT',      sections: ['103'] },
  { rowIdx: 10, label: '100 D.P. ACT',      sections: ['100'] },
  { rowIdx: 11, label: '83/97 D.P. ACT',    sections: ['83', '97'] },
  { rowIdx: 12, label: '32/113 D.P. ACT',   sections: ['32', '113'] },
  { rowIdx: 13, label: 'Other D.P. Act',    sections: [] },
];

export async function renderStat35PreventiveDetail(workbook, scope, calcData = new Date()) {
  const ws = workbook.getWorksheet('STAT_35') || workbook.getWorksheet('STAT 35') || workbook.getWorksheet('STAT_35_PREVENTIVE_DETAIL');
  if (!ws) return;

  const fnStr = typeof calcData === 'string'
    ? calcData
    : (calcData?.fnEnd
        ? (typeof calcData.fnEnd === 'string' ? calcData.fnEnd : calcData.fnEnd.toISOString().slice(0, 10))
        : (calcData instanceof Date ? calcData.toISOString().slice(0, 10) : new Date().toISOString().slice(0, 10)));

  const scopeType = scope?.level === 'DISTRICT' ? 'DISTRICT' : (scope?.level === 'PS' ? 'PS' : 'HQ');
  const scopeId = scope?.self_id || null;

  for (const item of DP_ACT_ROWS) {
    const row = ws.getRow(item.rowIdx);

    const fnK = await diaryKalandraCount({
      sectionCodes: item.sections.length > 0 ? item.sections : null,
      actNameContains: 'Delhi Police',
      window: 'FN',
      fnEnd: fnStr,
      scopeType,
      scopeId
    });

    const uptoK = await diaryKalandraCount({
      sectionCodes: item.sections.length > 0 ? item.sections : null,
      actNameContains: 'Delhi Police',
      window: 'UPTO',
      fnEnd: fnStr,
      scopeType,
      scopeId
    });

    row.getCell(3).value = fnK;
    row.getCell(4).value = fnK; // Persons
    row.getCell(5).value = uptoK;
    row.getCell(6).value = uptoK; // Persons
    row.getCell(7).value = '--'; // Fine realised FN (blocked)
    row.getCell(8).value = '--'; // Fine realised UPTO (blocked)
    row.commit();
  }
}

export default renderStat35PreventiveDetail;
