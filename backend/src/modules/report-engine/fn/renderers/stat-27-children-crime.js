// backend/src/modules/report-engine/fn/renderers/stat-27-children-crime.js
// STAT_27: Crimes Against Children using persons.is_minor = true

import db from '../../../../config/db.js';
import { buildFnDateWindows } from '../../shared/date-windows.js';

export async function renderStat27(workbook, scope, calcData = new Date()) {
  const ws = workbook.getWorksheet('STAT_27') || workbook.getWorksheet('STAT 27');
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
      .join('persons as p', function() {
        this.on('p.record_id', '=', 'r.id').andOn('p.role', '=', db.raw("'VICTIM'"));
      })
      .where('r.record_type', 'CASE')
      .where('r.current_status', '<>', 'DRAFT')
      .where('p.is_minor', true)
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

    const row = ws.getRow(6);
    row.getCell(2).value = reportedFn;
    row.getCell(3).value = reportedUpto;
    row.getCell(4).value = workedOutFn;
    row.getCell(5).value = workedOutUpto;
    row.commit();
  } catch (err) {
    console.warn(`[stat-27] Error rendering crimes against children: ${err.message}`);
  }
}
