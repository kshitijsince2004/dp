// backend/src/modules/report-engine/fn/renderers/stat-38-bns-no-arrest.js
// STAT_38: BNS/IPC Cases Chargesheeted without Arrest

import db from '../../../../config/db.js';
import { buildFnDateWindows } from '../../shared/date-windows.js';
import { IPC_BNS_HEADS } from '../fn-heads.js';

export async function renderStat38(workbook, scope, calcData = new Date()) {
  const ws = workbook.getWorksheet('STAT_38') || workbook.getWorksheet('STAT 38');
  if (!ws) return;

  const fnStr = typeof calcData === 'string'
    ? calcData
    : (calcData?.fnEnd
        ? (typeof calcData.fnEnd === 'string' ? calcData.fnEnd : calcData.fnEnd.toISOString().slice(0, 10))
        : (calcData instanceof Date ? calcData.toISOString().slice(0, 10) : new Date().toISOString().slice(0, 10)));
  const { jan1Curr: utoDate } = buildFnDateWindows(fnStr);
  const cutoffDate = fnStr;

  try {
    const rows = await db('records as r')
      .join('fir_details as fd', 'fd.record_id', 'r.id')
      .join('ref.local_heads as lh', 'lh.local_head_cd', 'fd.local_head_id')
      .where('r.record_type', 'CASE')
      .where('r.current_status', '<>', 'DRAFT')
      .whereIn('fd.case_status', ['CHARGESHEETED', 'CHALLAN', 'PIR_JCL', 'PIR-JCL'])
      .whereNotExists(function() {
        this.select(1)
            .from('record_links as rl')
            .join('link_type_registry as lt', 'lt.id', 'rl.link_type_id')
            .where('lt.code', 'CASE_ARREST')
            .whereRaw('rl.source_record_id = r.id');
      })
      .whereRaw('COALESCE(r.registration_date, r.record_date) BETWEEN ? AND ?', [utoDate, cutoffDate])
      .select('lh.canonical_code', db.raw('COUNT(*)::int as cnt'))
      .groupBy('lh.canonical_code');

    const countMap = {};
    rows.forEach(r => { countMap[r.canonical_code] = r.cnt; });

    let rowIdx = 6;
    IPC_BNS_HEADS.forEach(head => {
      if (!head.isTotal && head.code) {
        const row = ws.getRow(rowIdx);
        row.getCell(2).value = countMap[head.code] || 0;
        row.commit();
      }
      rowIdx++;
    });
  } catch (err) {
    console.warn(`[stat-38] Error rendering BNS cases without arrest: ${err.message}`);
  }
}
