// backend/src/modules/report-engine/fn/renderers/stat-12-organised-crime.js
// STAT_12: Organised Crime & Gang Syndicate Breakdown

import db from '../../../../config/db.js';
import { buildFnDateWindows } from '../../shared/date-windows.js';

export async function renderStat12(workbook, scope, calcData = new Date()) {
  const ws = workbook.getWorksheet('STAT_12') || workbook.getWorksheet('STAT 12');
  if (!ws) return;

  const fnStr = typeof calcData === 'string'
    ? calcData
    : (calcData?.fnEnd
        ? (typeof calcData.fnEnd === 'string' ? calcData.fnEnd : calcData.fnEnd.toISOString().slice(0, 10))
        : (calcData instanceof Date ? calcData.toISOString().slice(0, 10) : new Date().toISOString().slice(0, 10)));
  const { fnStart, jan1Curr: utoDate } = buildFnDateWindows(fnStr);
  const cutoffDate = fnStr;

  try {
    const rows = await db('records as r')
      .join('fir_details as fd', 'fd.record_id', 'r.id')
      .where('r.record_type', 'CASE')
      .where('r.current_status', '<>', 'DRAFT')
      .where('fd.organised_crime', true)
      .whereRaw('COALESCE(r.registration_date, r.record_date) BETWEEN ? AND ?', [utoDate, cutoffDate])
      .select('fd.is_worked_out', 'r.registration_date', 'r.record_date');

    let reportedFn = 0, reportedUpto = 0;
    let workedOutFn = 0, workedOutUpto = 0;

    rows.forEach(r => {
      const regDate = new Date(r.registration_date || r.record_date);
      const isFn = regDate >= new Date(fnStart) && regDate <= new Date(cutoffDate);

      reportedUpto++;
      if (isFn) reportedFn++;

      if (r.is_worked_out) {
        workedOutUpto++;
        if (isFn) workedOutFn++;
      }
    });

    // Write Organised Crime Totals to Section A (row 5)
    const row5 = ws.getRow(5);
    row5.getCell(2).value = reportedFn;
    row5.getCell(3).value = reportedUpto;
    row5.getCell(4).value = workedOutFn;
    row5.getCell(5).value = workedOutUpto;
    row5.commit();

    // Section C (Mob lynching, road rage sub-rows 37-48) are blocked (B5) — emit '—'
    for (let rIdx = 37; rIdx <= 48; rIdx++) {
      const r = ws.getRow(rIdx);
      r.getCell(2).value = '—';
      r.getCell(3).value = '—';
      r.getCell(4).value = '—';
      r.getCell(5).value = '—';
      r.commit();
    }
  } catch (err) {
    console.warn(`[stat-12] Error rendering organised crime: ${err.message}`);
  }
}
