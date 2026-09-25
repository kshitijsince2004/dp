// backend/src/modules/report-engine/fn/renderers/stat-30-zero-fir.js
// STAT_30: Registration of Zero FIRs and Transfers (Blocker B1 Resolution)

import { diaryCount, diaryTransferCount } from '../../shared/diary-query-builder.js';

const STAT30_HEADS = [
  { rowIdx: 6,  headCode: 'DACOITY', label: 'Dacoity' },
  { rowIdx: 7,  headCode: 'MURDER', label: 'Murder' },
  { rowIdx: 8,  headCode: 'ATT_TO_MURDER', label: 'Att. to Murder' },
  { rowIdx: 9,  headCode: 'ROBBERY', label: 'Robbery' },
  { rowIdx: 10, headCode: 'KID_FOR_RANSOM', label: 'Kid. for Ransom' },
  { rowIdx: 11, headCode: 'RAPE', label: 'Rape' },
  { rowIdx: 12, headCode: 'EXTORTION', label: 'Extortion' },
  { rowIdx: 13, headCode: 'SNATCHING', label: 'Snatching' },
  { rowIdx: 14, headCode: 'HURT', label: 'Hurt' },
  { rowIdx: 15, headCode: 'KIDNAPPING', label: 'Kidnapping/ Abduction' },
  { rowIdx: 16, headCode: 'MO_WOMEN', label: 'Assault on women with intent to outrage modesty' },
  { rowIdx: 17, headCode: 'EVE_TEASING', label: 'Insult to the modesty of women' },
  { rowIdx: 18, headCode: 'OTHER_THEFT', label: 'Thefts' },
  { rowIdx: 19, headCode: 'CHEATING', label: 'Cheating/ Forgery' },
  { rowIdx: 20, headCode: 'SIMPLE_ACCIDENT', label: 'Road Accident' },
  { rowIdx: 21, headCode: 'OTHER_IPC', label: 'Other BNS' },
];

export async function renderStat30ZeroFir(workbook, scope, calcData = new Date()) {
  const ws = workbook.getWorksheet('STAT_30') || workbook.getWorksheet('STAT 30') || workbook.getWorksheet('STAT_30_ZERO_FIR');
  if (!ws) return;

  const fnStr = typeof calcData === 'string'
    ? calcData
    : (calcData?.fnEnd
        ? (typeof calcData.fnEnd === 'string' ? calcData.fnEnd : calcData.fnEnd.toISOString().slice(0, 10))
        : (calcData instanceof Date ? calcData.toISOString().slice(0, 10) : new Date().toISOString().slice(0, 10)));

  const scopeType = scope?.level === 'DISTRICT' ? 'DISTRICT' : (scope?.level === 'PS' ? 'PS' : 'HQ');
  const scopeId = scope?.self_id || null;

  const zeroFirWhere = "fd.case_type ILIKE '%zero%' OR fd.transfer_to_type IS NOT NULL";

  for (const h of STAT30_HEADS) {
    const row = ws.getRow(h.rowIdx);
    const headCodes = [h.headCode];

    // Col 3: Zero FIR registered FN
    const regFn = await diaryCount({
      measure: 'REPORTED',
      headType: 'LOCAL',
      headCodes,
      window: 'FN',
      fnEnd: fnStr,
      scopeType,
      scopeId,
      extraFilter: q => q.whereRaw(zeroFirWhere)
    });

    // Col 4: Zero FIR registered UPTO
    const regUpto = await diaryCount({
      measure: 'REPORTED',
      headType: 'LOCAL',
      headCodes,
      window: 'UPTO',
      fnEnd: fnStr,
      scopeType,
      scopeId,
      extraFilter: q => q.whereRaw(zeroFirWhere)
    });

    // Col 5: Forwarded to Delhi PS FN
    const fwdDelFn = await diaryTransferCount({
      direction: 'OUT_PS',
      headCodes,
      headType: 'LOCAL',
      window: 'FN',
      fnEnd: fnStr,
      scopeType,
      scopeId
    });

    // Col 6: Forwarded to Delhi PS UPTO
    const fwdDelUpto = await diaryTransferCount({
      direction: 'OUT_PS',
      headCodes,
      headType: 'LOCAL',
      window: 'UPTO',
      fnEnd: fnStr,
      scopeType,
      scopeId
    });

    // Col 7: Forwarded to Other State/Agency FN
    const fwdAgFn = await diaryTransferCount({
      direction: 'OUT_AGENCY',
      headCodes,
      headType: 'LOCAL',
      window: 'FN',
      fnEnd: fnStr,
      scopeType,
      scopeId
    });

    // Col 8: Forwarded to Other State/Agency UPTO
    const fwdAgUpto = await diaryTransferCount({
      direction: 'OUT_AGENCY',
      headCodes,
      headType: 'LOCAL',
      window: 'UPTO',
      fnEnd: fnStr,
      scopeType,
      scopeId
    });

    row.getCell(3).value = regFn;
    row.getCell(4).value = regUpto;
    row.getCell(5).value = fwdDelFn;
    row.getCell(6).value = fwdDelUpto;
    row.getCell(7).value = fwdAgFn;
    row.getCell(8).value = fwdAgUpto;
    row.getCell(9).value = '--';  // ⛔ Needs original_ps_id tracking
    row.getCell(10).value = '--'; // ⛔ Needs original_ps_id tracking
    row.commit();
  }
}

export default renderStat30ZeroFir;
