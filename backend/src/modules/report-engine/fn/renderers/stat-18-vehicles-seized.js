// backend/src/modules/report-engine/fn/renderers/stat-18-vehicles-seized.js
// STAT_18: Vehicles Seized under Arms, Excise, NDPS Acts
// Measure: M-34 grouped by ref.automobiles.automobile × act × FN/Upto

import db from '../../../../config/db.js';
import { buildFnDateWindows } from '../../shared/date-windows.js';

const VEHICLE_TYPES = [
  'Motor Cycle', 'Scooter/Scooty', 'Car', 'Jeep', 'Taxi',
  'Tempo', 'TSRs', 'Bus', 'Truck', 'Cycle Rickshaw',
  'Cycle', 'E-Rickshaw', 'Others',
];

export async function renderStat18(workbook, scope, calcData = new Date()) {
  const ws = workbook.getWorksheet('STAT_18') || workbook.getWorksheet('STAT 18');
  if (!ws) return;

  const fnStr = typeof calcData === 'string'
    ? calcData
    : (calcData?.fnEnd
        ? (typeof calcData.fnEnd === 'string' ? calcData.fnEnd : calcData.fnEnd.toISOString().slice(0, 10))
        : (calcData instanceof Date ? calcData.toISOString().slice(0, 10) : new Date().toISOString().slice(0, 10)));
  const { fnStart, jan1Curr: utoDate } = buildFnDateWindows(fnStr);
  const cutoffDate = fnStr;

  const vehicleData = {};
  VEHICLE_TYPES.forEach(vt => {
    vehicleData[vt] = {
      arms_fn: 0, arms_upto: 0,
      excise_fn: 0, excise_upto: 0,
      ndps_fn: 0, ndps_upto: 0,
    };
  });

  try {
    const rows = await db('records as r')
      .join('record_properties as rp', 'rp.record_id', 'r.id')
      .leftJoin('ref.automobiles as ra', 'ra.automobile_cd', 'rp.automobile_id')
      .leftJoin('record_offences as ro', 'ro.record_id', 'r.id')
      .leftJoin('ref.acts as act', 'act.act_cd', 'ro.act_id')
      .whereIn('act.act_long', ['ARMS ACT', 'EXCISE ACT', 'NDPS ACT'])
      .where('r.current_status', '<>', 'DRAFT')
      .whereRaw('COALESCE(r.registration_date, r.record_date) BETWEEN ? AND ?', [utoDate, cutoffDate])
      .select(
        'ra.automobile as vehicle_type',
        'act.act_long as act_name',
        'r.registration_date',
        'r.record_date'
      );

    rows.forEach(row => {
      const vType = VEHICLE_TYPES.find(vt => vt.toLowerCase() === (row.vehicle_type || '').toLowerCase()) || 'Others';
      const regDate = new Date(row.registration_date || row.record_date);
      const isFn = regDate >= new Date(fnStart) && regDate <= new Date(cutoffDate);

      if (row.act_name && row.act_name.includes('ARMS')) {
        if (isFn) vehicleData[vType].arms_fn++;
        vehicleData[vType].arms_upto++;
      } else if (row.act_name && row.act_name.includes('EXCISE')) {
        if (isFn) vehicleData[vType].excise_fn++;
        vehicleData[vType].excise_upto++;
      } else if (row.act_name && row.act_name.includes('NDPS')) {
        if (isFn) vehicleData[vType].ndps_fn++;
        vehicleData[vType].ndps_upto++;
      }
    });
  } catch (err) {
    console.warn(`[stat-18] Failed to fetch live seizure data: ${err.message}`);
  }

  // Populate worksheet rows (starting row 6)
  let rowIdx = 6;
  VEHICLE_TYPES.forEach(vt => {
    const row = ws.getRow(rowIdx++);
    const d = vehicleData[vt];
    row.getCell(2).value = d.arms_fn;
    row.getCell(3).value = d.arms_upto;
    row.getCell(4).value = d.excise_fn;
    row.getCell(5).value = d.excise_upto;
    row.getCell(6).value = d.ndps_fn;
    row.getCell(7).value = d.ndps_upto;
    row.commit();
  });
}
