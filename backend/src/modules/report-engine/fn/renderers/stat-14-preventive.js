// backend/src/modules/report-engine/fn/renderers/stat-14-preventive.js
// STAT_14: Preventive Action Summary (Blocker B6 Resolution)

import { diaryKalandraCount } from '../../shared/diary-query-builder.js';

const BNSS_PREVENTIVE = [
  { rowIdx: 5, label: 'U/s 126 BNSS', sections: ['126', '107'] },
  { rowIdx: 6, label: 'U/s 127 BNSS', sections: ['127', '108'] },
  { rowIdx: 7, label: 'U/s 128 BNSS', sections: ['128', '109'] },
  { rowIdx: 8, label: 'U/s 129 BNSS', sections: ['129', '110'] },
  { rowIdx: 9, label: 'U/s 172 BNSS', sections: ['172', '151'] },
];

export async function renderStat14Preventive(workbook, scope, calcData = new Date()) {
  const ws = workbook.getWorksheet('STAT_14') || workbook.getWorksheet('STAT 14') || workbook.getWorksheet('STAT_14_PREVENTIVE');
  if (!ws) return;

  const fnStr = typeof calcData === 'string'
    ? calcData
    : (calcData?.fnEnd
        ? (typeof calcData.fnEnd === 'string' ? calcData.fnEnd : calcData.fnEnd.toISOString().slice(0, 10))
        : (calcData instanceof Date ? calcData.toISOString().slice(0, 10) : new Date().toISOString().slice(0, 10)));

  const scopeType = scope?.level === 'DISTRICT' ? 'DISTRICT' : (scope?.level === 'PS' ? 'PS' : 'HQ');
  const scopeId = scope?.self_id || null;

  // Section A: Preventive Action (Rows 5 to 9)
  for (const item of BNSS_PREVENTIVE) {
    const row = ws.getRow(item.rowIdx);

    const fnK = await diaryKalandraCount({
      sectionCodes: item.sections,
      window: 'FN',
      fnEnd: fnStr,
      scopeType,
      scopeId
    });

    const uptoK = await diaryKalandraCount({
      sectionCodes: item.sections,
      window: 'UPTO',
      fnEnd: fnStr,
      scopeType,
      scopeId
    });

    row.getCell(3).value = fnK;
    row.getCell(4).value = fnK;
    row.getCell(5).value = uptoK;
    row.getCell(6).value = uptoK;
    row.commit();
  }

  // Row 10: Under D.P. Act
  const dpFn = await diaryKalandraCount({
    actNameContains: 'Delhi Police',
    window: 'FN',
    fnEnd: fnStr,
    scopeType,
    scopeId
  });
  const dpUpto = await diaryKalandraCount({
    actNameContains: 'Delhi Police',
    window: 'UPTO',
    fnEnd: fnStr,
    scopeType,
    scopeId
  });

  const row10 = ws.getRow(10);
  row10.getCell(3).value = dpFn;
  row10.getCell(4).value = dpFn;
  row10.getCell(5).value = dpUpto;
  row10.getCell(6).value = dpUpto;
  row10.commit();

  // Section B: History Sheeters (Rows 14 and 15)
  // Row 14: 126/169 BNSS BCs
  const bc169Fn = await diaryKalandraCount({
    sectionCodes: ['126', '169', '107'],
    isBc: true,
    window: 'FN',
    fnEnd: fnStr,
    scopeType,
    scopeId
  });
  const bc169Upto = await diaryKalandraCount({
    sectionCodes: ['126', '169', '107'],
    isBc: true,
    window: 'UPTO',
    fnEnd: fnStr,
    scopeType,
    scopeId
  });
  const row14 = ws.getRow(14);
  row14.getCell(3).value = bc169Fn;
  row14.getCell(4).value = bc169Fn;
  row14.getCell(5).value = bc169Upto;
  row14.getCell(6).value = bc169Upto;
  row14.commit();

  // Row 15: 126/170 BNSS BCs
  const bc170Fn = await diaryKalandraCount({
    sectionCodes: ['170', '151'],
    isBc: true,
    window: 'FN',
    fnEnd: fnStr,
    scopeType,
    scopeId
  });
  const bc170Upto = await diaryKalandraCount({
    sectionCodes: ['170', '151'],
    isBc: true,
    window: 'UPTO',
    fnEnd: fnStr,
    scopeType,
    scopeId
  });
  const row15 = ws.getRow(15);
  row15.getCell(3).value = bc170Fn;
  row15.getCell(4).value = bc170Fn;
  row15.getCell(5).value = bc170Upto;
  row15.getCell(6).value = bc170Upto;
  row15.commit();
}

export default renderStat14Preventive;
