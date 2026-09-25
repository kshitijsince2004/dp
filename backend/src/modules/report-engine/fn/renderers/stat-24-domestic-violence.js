// backend/src/modules/report-engine/fn/renderers/stat-24-domestic-violence.js
// STAT_24: Missing Persons breakdown by age band × gender × status

import db from '../../../../config/db.js';
import { buildFnDateWindows } from '../../shared/date-windows.js';

export async function renderStat24(workbook, scope, calcData = new Date()) {
  const ws = workbook.getWorksheet('STAT_24') || workbook.getWorksheet('STAT 24') || workbook.getWorksheet('STAT24');
  if (!ws) return;

  const fnStr = typeof calcData === 'string'
    ? calcData
    : (calcData?.fnEnd
        ? (typeof calcData.fnEnd === 'string' ? calcData.fnEnd : calcData.fnEnd.toISOString().slice(0, 10))
        : (calcData instanceof Date ? calcData.toISOString().slice(0, 10) : new Date().toISOString().slice(0, 10)));
  const { fnStart, jan1Curr: utoDate } = buildFnDateWindows(fnStr);
  const cutoffDate = fnStr;

  // Age Bands: 0=<=8, 1=8-12, 2=12-16, 3=16-18, 4=>18
  const bands = [
    { label: 'Upto 8 yrs', min: 0, max: 8 },
    { label: '8-12 yrs',   min: 8, max: 12 },
    { label: '12-16 yrs',  min: 12, max: 16 },
    { label: '16-18 yrs',  min: 16, max: 18 },
    { label: 'Above 18 yrs', min: 18, max: 150 },
  ];

  try {
    const records = await db('records as r')
      .join('missing_details as md', 'md.record_id', 'r.id')
      .leftJoin('persons as p', function() {
        this.on('p.record_id', '=', 'r.id').andOn('p.role', '=', db.raw("'MISSING'"));
      })
      .where('r.record_type', 'MISSING')
      .where('r.current_status', '<>', 'DRAFT')
      .whereRaw('COALESCE(r.registration_date, r.record_date) BETWEEN ? AND ?', [utoDate, cutoffDate])
      .select(
        'p.age',
        'p.gender',
        'md.missing_status',
        'r.registration_date',
        'r.record_date'
      );

    const counts = bands.map(() => ({
      missing_fn_m: 0, missing_fn_f: 0, missing_upto_m: 0, missing_upto_f: 0,
      traced_fn_m: 0, traced_fn_f: 0, traced_upto_m: 0, traced_upto_f: 0
    }));

    records.forEach(r => {
      const age = r.age || 20; // default to adult if unspecified
      const gender = (r.gender || 'M').toUpperCase().startsWith('F') ? 'F' : 'M';
      const isTraced = (r.missing_status || '').toUpperCase() === 'TRACED' || (r.missing_status || '').toUpperCase() === 'FOUND';
      const regDate = new Date(r.registration_date || r.record_date);
      const isFn = regDate >= new Date(fnStart) && regDate <= new Date(cutoffDate);

      let bIdx = bands.findIndex(b => age >= b.min && age < b.max);
      if (bIdx === -1) bIdx = 4;

      if (gender === 'M') {
        counts[bIdx].missing_upto_m++;
        if (isFn) counts[bIdx].missing_fn_m++;
        if (isTraced) {
          counts[bIdx].traced_upto_m++;
          if (isFn) counts[bIdx].traced_fn_m++;
        }
      } else {
        counts[bIdx].missing_upto_f++;
        if (isFn) counts[bIdx].missing_fn_f++;
        if (isTraced) {
          counts[bIdx].traced_upto_f++;
          if (isFn) counts[bIdx].traced_fn_f++;
        }
      }
    });

    // Write to Excel rows 6-10
    bands.forEach((b, idx) => {
      const row = ws.getRow(6 + idx);
      const c = counts[idx];
      row.getCell(2).value = c.missing_fn_m;
      row.getCell(3).value = c.missing_fn_f;
      row.getCell(4).value = c.missing_upto_m;
      row.getCell(5).value = c.missing_upto_f;
      row.getCell(6).value = c.traced_fn_m;
      row.getCell(7).value = c.traced_fn_f;
      row.getCell(8).value = c.traced_upto_m;
      row.getCell(9).value = c.traced_upto_f;
      row.commit();
    });

  } catch (err) {
    console.warn(`[stat-24] Error fetching missing persons data: ${err.message}`);
  }
}
