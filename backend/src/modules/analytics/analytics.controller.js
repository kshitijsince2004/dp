import db from '../../config/db.js';
import ExcelJS from 'exceljs';
import { toDMY } from '../../utils/dateFormat.js';
import { getLogger } from '../../utils/logger.js';

// Logging-instrumentation-2026-07-22 (B5): matches records.service.js style. Standard
// granularity (not a hot path) — each handler logs entry (jurisdictionQuery + query params),
// one debug when the query executes, exit with result shape/count, catch with err. The
// near-identical `if (jq.ps_id)/if (jq.district_id)/if (jq.sub_div_id)` scoping block repeats
// across ~15 handlers here; per-branch logging (as records.service.js listRecords does for
// its ONE hot-path query) would be pure boilerplate at this multiplier, so it is logged once
// as the whole `jq` object at entry instead.
const log = getLogger('analytics.controller');

// 'YYYY-MM' bucket key -> 'MM/YYYY' display label
const formatMonthLabel = (ym) => {
  if (!ym || typeof ym !== 'string') return ym;
  const [y, m] = ym.split('-');
  return y && m ? `${m}/${y}` : ym;
};

export const getSummary = async (req, res) => {
  const jq = req.jurisdictionQuery;
  log.debug('getSummary: enter', { jq });

  try {
    let query = db('records')
      .select('record_type')
      .count('* as count')
      .whereIn('current_status', ['submitted', 'PENDING_SHO', 'DISTRICT_REVIEW', 'HQ_RECEIVED', 'CLOSED']);

    if (jq.ps_id) query = query.where('ps_id', jq.ps_id);
    if (jq.district_id) query = query.where('district_id', jq.district_id);
    if (jq.sub_div_id) query = query.where('sub_div_id', jq.sub_div_id);

    const counts = await query.groupBy('record_type');

    const data = { CASE: 0, ARREST: 0, PCR_CALL: 0, MISSING: 0, UIDB: 0 };
    counts.forEach(c => {
      const key = (c.record_type || '').toUpperCase();
      if (key in data) data[key] = parseInt(c.count, 10) || 0;
    });

    log.info('getSummary: exit', { jq, summary: data });
    return res.status(200).json({
      success: true,
      data: {
        summary: data
      }
    });
  } catch (error) {
    log.error('getSummary: failed', { jq, err: error });
    return res.status(500).json({ success: false, message: error.message });
  }
};

export const getTrends = async (req, res) => {
  const { recordType } = req.query; // cases, arrest, pcr
  const jq = req.jurisdictionQuery;
  log.debug('getTrends: enter', { recordType, jq });

  if (!recordType) {
    log.warn('getTrends: rejected — recordType query param missing', { jq });
    return res.status(400).json({ success: false, message: 'recordType query parameter is required' });
  }

  const typeUpper = recordType.toUpperCase();

  try {
    const monthExpr = `to_char(records.record_date, 'YYYY-MM')`;
    // Single-head classification (DB_SCHEMA.md §9.4): the record_offences row flagged
    // is_primary is the one daily-diary/crime-head consumers read — for CASE/ARREST. PCR_CALL
    // has no record_offences (§2.7 scope); its classification is the plain call_head column.
    let query;
    if (typeUpper === 'PCR_CALL') {
      query = db('records')
        .select(
          db.raw('pcr.call_head as classification'),
          db.raw(`${monthExpr} as month`),
          db.raw('count(*) as count'),
        )
        .join('pcr_call_details as pcr', 'records.id', 'pcr.record_id')
        .where({ record_type: typeUpper })
        .whereIn('current_status', ['submitted', 'PENDING_SHO', 'DISTRICT_REVIEW', 'HQ_RECEIVED', 'CLOSED']);
    } else {
      query = db('records')
        .select(
          db.raw('mh.major_head as classification'),
          db.raw(`${monthExpr} as month`),
          db.raw('count(*) as count'),
        )
        .leftJoin('record_offences as ro', (j) => j.on('records.id', 'ro.record_id').andOn('ro.is_primary', db.raw('true')))
        .leftJoin('ref.major_heads as mh', 'ro.major_head_id', 'mh.major_head_code')
        .where({ record_type: typeUpper })
        .whereIn('current_status', ['submitted', 'PENDING_SHO', 'DISTRICT_REVIEW', 'HQ_RECEIVED', 'CLOSED']);
    }

    if (jq.ps_id) query = query.where('records.ps_id', jq.ps_id);
    if (jq.district_id) query = query.where('records.district_id', jq.district_id);
    if (jq.sub_div_id) query = query.where('records.sub_div_id', jq.sub_div_id);

    const trends = await query
      .groupBy(['classification', db.raw(monthExpr)])
      .orderBy('month', 'asc');

    log.info('getTrends: exit', { recordType: typeUpper, jq, rowCount: trends.length });
    return res.status(200).json({
      success: true,
      data: {
        trends: trends.map(t => ({
          classification: t.classification || 'UNKNOWN',
          period: formatMonthLabel(t.month),
          count: parseInt(t.count, 10) || 0
        }))
      }
    });
  } catch (error) {
    log.error('getTrends: failed', { recordType: typeUpper, jq, err: error });
    return res.status(500).json({ success: false, message: error.message });
  }
};

export const getCompare = async (req, res) => {
  const { recordType } = req.query;
  const jq = req.jurisdictionQuery;
  const { role } = req.user;
  log.debug('getCompare: enter', { recordType, jq, role });

  if (!recordType) {
    log.warn('getCompare: rejected — recordType query param missing', { jq, role });
    return res.status(400).json({ success: false, message: 'recordType query parameter is required' });
  }

  let typeUpper = recordType.toUpperCase();
  if (typeUpper === 'CASES') typeUpper = 'CASE';
  if (typeUpper === 'PCR') typeUpper = 'PCR_CALL';

  try {
    let selectCol = 'ps.name';
    let groupCol = 'records.ps_id';

    if (['HQ_ANALYST', 'HQ_ADMIN', 'SYSTEM_ADMIN'].includes(role)) {
      selectCol = 'dist.name';
      groupCol = 'records.district_id';
    } else if (role === 'DISTRICT_OFFICER') {
      selectCol = 'sub.name';
      groupCol = 'records.sub_div_id';
    }
    log.debug('getCompare: resolved grouping column for role', { role, groupCol });

    let query = db('records')
      .select(`${selectCol} as label`)
      .count('* as count')
      .join('hierarchy_nodes as ps', 'records.ps_id', 'ps.id')
      .join('hierarchy_nodes as dist', 'records.district_id', 'dist.id')
      .leftJoin('hierarchy_nodes as sub', 'records.sub_div_id', 'sub.id')
      .where({ record_type: typeUpper })
      .whereIn('records.current_status', ['submitted', 'PENDING_SHO', 'DISTRICT_REVIEW', 'HQ_RECEIVED', 'CLOSED']);

    if (jq.ps_id) query = query.where('records.ps_id', jq.ps_id);
    if (jq.district_id) query = query.where('records.district_id', jq.district_id);
    if (jq.sub_div_id) query = query.where('records.sub_div_id', jq.sub_div_id);

    const compareList = await query
      .groupBy(groupCol, selectCol)
      .orderBy('count', 'desc');

    log.info('getCompare: exit', { recordType: typeUpper, jq, role, rowCount: compareList.length });
    return res.status(200).json({
      success: true,
      data: {
        compare: compareList.map(c => ({
          label: c.label || 'Other',
          count: parseInt(c.count, 10) || 0
        }))
      }
    });
  } catch (error) {
    log.error('getCompare: failed', { recordType: typeUpper, jq, role, err: error });
    return res.status(500).json({ success: false, message: error.message });
  }
};

export const getOverview = async (req, res) => {
  const jq = req.jurisdictionQuery;
  log.debug('getOverview: enter', { jq });
  try {
    let query = db('records').select('record_type').count('* as count');
    if (jq.ps_id) query = query.where('ps_id', jq.ps_id);
    if (jq.district_id) query = query.where('district_id', jq.district_id);
    if (jq.sub_div_id) query = query.where('sub_div_id', jq.sub_div_id);
    const counts = await query.groupBy('record_type');

    const data = { cases_today: 0, pcr_today: 0, arrests_today: 0, missing_today: 0, uidb_today: 0 };
    counts.forEach(c => {
      const type = (c.record_type || '').toUpperCase();
      const count = parseInt(c.count, 10) || 0;
      if (type === 'CASE') data.cases_today = count;
      else if (type === 'PCR_CALL') data.pcr_today = count;
      else if (type === 'ARREST') data.arrests_today = count;
      else if (type === 'MISSING') data.missing_today = count;
      else if (type === 'UIDB') data.uidb_today = count;
    });
    log.info('getOverview: exit', { jq, data });
    return res.status(200).json({ success: true, data });
  } catch (error) {
    log.error('getOverview: failed', { jq, err: error });
    return res.status(500).json({ success: false, message: error.message });
  }
};

export const getByPs = async (req, res) => {
  const jq = req.jurisdictionQuery;
  log.debug('getByPs: enter', { jq });
  try {
    // 1. Fetch active PS nodes for the current scope
    let stationsQuery = db('hierarchy_nodes').where({ node_type: 'PS', is_active: true });

    if (jq.ps_id) {
      stationsQuery = stationsQuery.where('id', jq.ps_id);
    } else if (jq.sub_div_id) {
      stationsQuery = stationsQuery.where('parent_id', jq.sub_div_id);
    } else if (jq.district_id) {
      // Find sub-divisions under this district
      const subDivs = await db('hierarchy_nodes')
        .where({ node_type: 'SUB_DIV', parent_id: jq.district_id, is_active: true })
        .select('id');
      const subDivIds = subDivs.map(s => s.id);
      stationsQuery = stationsQuery.whereIn('parent_id', subDivIds);
    }

    const stations = await stationsQuery.select('id', 'name');
    log.debug('getByPs: resolved station scope', { jq, stationCount: stations.length });

    // 2. Fetch record counts grouped by ps_id and record_type
    let recordsQuery = db('records')
      .select('ps_id', 'record_type')
      .count('* as count')
      .whereIn('current_status', ['submitted', 'PENDING_SHO', 'DISTRICT_REVIEW', 'HQ_RECEIVED', 'CLOSED', 'COMPILED']);

    if (jq.ps_id) recordsQuery = recordsQuery.where('ps_id', jq.ps_id);
    if (jq.district_id) recordsQuery = recordsQuery.where('district_id', jq.district_id);
    if (jq.sub_div_id) recordsQuery = recordsQuery.where('sub_div_id', jq.sub_div_id);

    const rows = await recordsQuery.groupBy('ps_id', 'record_type');

    // 3. Map aggregate counts by ps_id
    const countsMap = {};
    rows.forEach(r => {
      const psId = r.ps_id;
      if (!countsMap[psId]) {
        countsMap[psId] = { cases: 0, pcr: 0, arrests: 0 };
      }
      const type = (r.record_type || '').toUpperCase();
      const count = parseInt(r.count, 10) || 0;
      if (type === 'CASE' || type === 'CASES') countsMap[psId].cases = count;
      else if (type === 'PCR_CALL') countsMap[psId].pcr = count;
      else if (type === 'ARREST') countsMap[psId].arrests = count;
    });

    // 4. Merge stations and counts
    const data = stations.map(s => {
      const stats = countsMap[s.id] || { cases: 0, pcr: 0, arrests: 0 };
      return {
        id: s.id,
        station: s.name,
        station_hi: s.name,
        cases: stats.cases,
        pcr: stats.pcr,
        arrests: stats.arrests
      };
    });

    // Sort alphabetically by station name
    data.sort((a, b) => a.station.localeCompare(b.station));

    log.info('getByPs: exit', { jq, stationCount: data.length });
    return res.status(200).json({ success: true, data });
  } catch (error) {
    log.error('getByPs: failed', { jq, err: error });
    return res.status(500).json({ success: false, message: error.message });
  }
};

export const getByCrimeHead = async (req, res) => {
  const jq = req.jurisdictionQuery;
  log.debug('getByCrimeHead: enter', { jq });
  try {
    // Single-head classification (§9.4): the is_primary record_offences row's major_head.
    let query = db('records')
      .select('mh.major_head as crime_head')
      .count('* as count')
      .leftJoin('record_offences as ro', (j) => j.on('records.id', 'ro.record_id').andOn('ro.is_primary', db.raw('true')))
      .leftJoin('ref.major_heads as mh', 'ro.major_head_id', 'mh.major_head_code')
      .where('record_type', 'CASE');

    if (jq.ps_id) query = query.where('records.ps_id', jq.ps_id);
    if (jq.district_id) query = query.where('records.district_id', jq.district_id);
    if (jq.sub_div_id) query = query.where('records.sub_div_id', jq.sub_div_id);

    const rows = await query.groupBy('mh.major_head').orderBy('count', 'desc').limit(10);
    const data = rows.map(r => ({
      name: r.crime_head || 'UNCATEGORIZED',
      count: parseInt(r.count, 10) || 0
    }));
    log.info('getByCrimeHead: exit', { jq, rowCount: data.length });
    return res.status(200).json({ success: true, data });
  } catch (error) {
    log.error('getByCrimeHead: failed', { jq, err: error });
    return res.status(500).json({ success: false, message: error.message });
  }
};

export const getCombinedTrends = async (req, res) => {
  const jq = req.jurisdictionQuery;
  log.debug('getCombinedTrends: enter', { jq });
  try {
    const dateExpr = `to_char(record_date, 'YYYY-MM-DD')`;

    let query = db('records')
      .select(db.raw(`${dateExpr} as day`), 'record_type')
      .count('* as count');

    if (jq.ps_id) query = query.where('ps_id', jq.ps_id);
    if (jq.district_id) query = query.where('district_id', jq.district_id);
    if (jq.sub_div_id) query = query.where('sub_div_id', jq.sub_div_id);

    const rows = await query
      .groupBy([db.raw(dateExpr), 'record_type'])
      .orderBy('day', 'desc')
      .limit(42);

    const dayMap = {};
    rows.forEach(r => {
      const name = r.day || 'Unknown';
      if (!dayMap[name]) dayMap[name] = { name, cases: 0, pcr: 0, arrests: 0 };
      const type = (r.record_type || '').toUpperCase();
      const count = parseInt(r.count, 10) || 0;
      if (type === 'CASE') dayMap[name].cases = count;
      else if (type === 'PCR_CALL') dayMap[name].pcr = count;
      else if (type === 'ARREST') dayMap[name].arrests = count;
    });

    const data = Object.values(dayMap)
      .sort((a, b) => a.name.localeCompare(b.name))
      .map(d => ({ ...d, name: d.name === 'Unknown' ? d.name : (toDMY(d.name) || d.name) }));
    log.info('getCombinedTrends: exit', { jq, dayCount: data.length });
    return res.status(200).json({ success: true, data });
  } catch (error) {
    log.error('getCombinedTrends: failed', { jq, err: error });
    return res.status(500).json({ success: false, message: error.message });
  }
};

export const exportSpreadsheet = async (req, res) => {
  const { recordType } = req.query;
  const jq = req.jurisdictionQuery;
  log.debug('exportSpreadsheet: enter', { recordType, jq });

  if (!recordType) {
    log.warn('exportSpreadsheet: rejected — recordType query param missing', { jq });
    return res.status(400).json({ success: false, message: 'recordType query parameter is required' });
  }

  let typeUpper = recordType.toUpperCase();
  if (typeUpper === 'CASES') typeUpper = 'CASE';
  if (typeUpper === 'PCR') typeUpper = 'PCR_CALL';

  const DETAIL_TABLES = { CASE: 'fir_details', ARREST: 'arrest_details', PCR_CALL: 'pcr_call_details', MISSING: 'missing_details', UIDB: 'uidb_details' };
  const detailTable = DETAIL_TABLES[typeUpper];
  if (!detailTable) {
    log.warn('exportSpreadsheet: rejected — unknown recordType', { recordType, typeUpper, jq });
    return res.status(400).json({ success: false, message: `Unknown recordType "${recordType}"` });
  }
  // The old jsonb "Details (JSON Block)" dump has no equivalent under the typed schema —
  // export the detail table's own reference/status column instead, per type.
  const DETAIL_REF_COLUMN = { CASE: 'fir_no', ARREST: 'fir_no', PCR_CALL: 'pcr_no', MISSING: 'gd_no', UIDB: 'uidb_no' };
  const DETAIL_STATUS_COLUMN = { CASE: 'case_status', ARREST: 'case_status', PCR_CALL: 'final_call_status', MISSING: 'missing_status', UIDB: 'uidb_status' };
  const refCol = DETAIL_REF_COLUMN[typeUpper];
  const statusCol = DETAIL_STATUS_COLUMN[typeUpper];

  try {
    let query = db('records')
      .select('records.id', 'ps.name as ps_name', 'dist.name as district_name', 'records.record_date', 'records.current_status',
        `d.${refCol} as reference_no`, `d.${statusCol} as domain_status`)
      .join('hierarchy_nodes as ps', 'records.ps_id', 'ps.id')
      .join('hierarchy_nodes as dist', 'records.district_id', 'dist.id')
      .leftJoin(`${detailTable} as d`, 'records.id', 'd.record_id')
      .where({ record_type: typeUpper })
      .whereIn('records.current_status', ['submitted', 'PENDING_SHO', 'DISTRICT_REVIEW', 'HQ_RECEIVED', 'CLOSED']);

    if (jq.ps_id) query = query.where('records.ps_id', jq.ps_id);
    if (jq.district_id) query = query.where('records.district_id', jq.district_id);
    if (jq.sub_div_id) query = query.where('records.sub_div_id', jq.sub_div_id);

    const rows = await query.orderBy('records.record_date', 'desc');
    log.debug('exportSpreadsheet: fetched rows for export', { typeUpper, jq, rowCount: rows.length });

    const workbook = new ExcelJS.Workbook();
    const sheet = workbook.addWorksheet(`${typeUpper} Records`);

    sheet.columns = [
      { header: 'ID', key: 'id', width: 38 },
      { header: 'Reference No.', key: 'reference_no', width: 20 },
      { header: 'District', key: 'district_name', width: 20 },
      { header: 'Police Station', key: 'ps_name', width: 20 },
      { header: 'Date', key: 'record_date', width: 15 },
      { header: 'Workflow Status', key: 'current_status', width: 18 },
      { header: 'Domain Status', key: 'domain_status', width: 20 },
    ];

    rows.forEach(r => {
      sheet.addRow({
        id: r.id,
        reference_no: r.reference_no || '',
        district_name: r.district_name,
        ps_name: r.ps_name,
        record_date: toDMY(r.record_date) || '',
        current_status: r.current_status,
        domain_status: r.domain_status || '',
      });
    });

    res.setHeader('Content-Type', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet');
    res.setHeader('Content-Disposition', `attachment; filename=Pharos_${typeUpper}_Export.xlsx`);

    await workbook.xlsx.write(res);
    log.info('exportSpreadsheet: exit — workbook streamed', { typeUpper, jq, rowCount: rows.length });
    return res.end();
  } catch (error) {
    log.error('exportSpreadsheet: failed', { recordType, jq, err: error });
    return res.status(500).json({ success: false, message: error.message });
  }
};

export const getStatusBreakdown = async (req, res) => {
  const jq = req.jurisdictionQuery;
  log.debug('getStatusBreakdown: enter', { jq });
  try {
    let query = db('records')
      .select('current_status')
      .count('* as count');

    if (jq.ps_id) query = query.where('ps_id', jq.ps_id);
    if (jq.district_id) query = query.where('district_id', jq.district_id);
    if (jq.sub_div_id) query = query.where('sub_div_id', jq.sub_div_id);

    const rows = await query.groupBy('current_status');
    const data = rows.map(r => ({
      status: r.current_status,
      count: parseInt(r.count, 10) || 0
    }));
    log.info('getStatusBreakdown: exit', { jq, rowCount: data.length });
    return res.status(200).json({ success: true, data });
  } catch (error) {
    log.error('getStatusBreakdown: failed', { jq, err: error });
    return res.status(500).json({ success: false, message: error.message });
  }
};

// ── PS Dashboard summary (Cases / Arrest / Left Out Accused) ─────────────────

// `prefix` qualifies the scope columns (e.g. 'records.') for queries that JOIN another table
// which also carries ps_id/district_id/sub_div_id (e.g. detail tables) — an unqualified column
// there is ambiguous (Postgres 42702). Defaults to '' to preserve single-table callers.
const applyJurisdictionScope = (query, jq, prefix = '') => {
  if (jq.ps_id) query = query.where(`${prefix}ps_id`, jq.ps_id);
  if (jq.district_id) query = query.where(`${prefix}district_id`, jq.district_id);
  if (jq.sub_div_id) query = query.where(`${prefix}sub_div_id`, jq.sub_div_id);
  return query;
};

const toISODate = (d) => {
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  return `${y}-${m}-${day}`;
};

const getDateRangeForPeriod = (period) => {
  const today = new Date();
  today.setHours(0, 0, 0, 0);

  if (period === 'week') {
    const currentStart = new Date(today);
    currentStart.setDate(today.getDate() - 6);
    const previousEnd = new Date(currentStart);
    previousEnd.setDate(currentStart.getDate() - 1);
    const previousStart = new Date(previousEnd);
    previousStart.setDate(previousEnd.getDate() - 6);
    return {
      currentStart: toISODate(currentStart), currentEnd: toISODate(today),
      previousStart: toISODate(previousStart), previousEnd: toISODate(previousEnd)
    };
  }

  if (period === 'month') {
    const currentStart = new Date(today.getFullYear(), today.getMonth(), 1);
    const previousMonthEnd = new Date(currentStart);
    previousMonthEnd.setDate(previousMonthEnd.getDate() - 1);
    const previousStart = new Date(previousMonthEnd.getFullYear(), previousMonthEnd.getMonth(), 1);
    return {
      currentStart: toISODate(currentStart), currentEnd: toISODate(today),
      previousStart: toISODate(previousStart), previousEnd: toISODate(previousMonthEnd)
    };
  }

  // day (default)
  const previousDay = new Date(today);
  previousDay.setDate(today.getDate() - 1);
  return {
    currentStart: toISODate(today), currentEnd: toISODate(today),
    previousStart: toISODate(previousDay), previousEnd: toISODate(previousDay)
  };
};

const pctChange = (current, previous) => {
  if (previous === 0) return current === 0 ? 0 : 100;
  return Math.round(((current - previous) / previous) * 100);
};

const CASE_LIKE_TYPES = ['CASE', 'UIDB', 'MISSING'];

const countRecordsByTypes = async (jq, recordTypes, startDate, endDate) => {
  log.debug('countRecordsByTypes: enter', { jq, recordTypes, startDate, endDate });
  let query = db('records')
    .whereIn('record_type', recordTypes)
    .whereBetween('record_date', [startDate, endDate]);
  query = applyJurisdictionScope(query, jq);
  const row = await query.count('* as count').first();
  const count = parseInt(row.count, 10) || 0;
  log.debug('countRecordsByTypes: exit', { recordTypes, startDate, endDate, count });
  return count;
};

// "Kalandra" = an ARREST record with no CASE_ARREST link pointing at it (standalone arrest, no FIR).
const countStandaloneArrests = async (jq, startDate, endDate) => {
  log.debug('countStandaloneArrests: enter', { jq, startDate, endDate });
  let query = db('records')
    .where('record_type', 'ARREST')
    .whereBetween('record_date', [startDate, endDate])
    .whereNotExists(function () {
      this.select('*')
        .from('record_links as rl')
        .join('link_type_registry as ltr', 'rl.link_type_id', 'ltr.id')
        .where('ltr.code', 'CASE_ARREST')
        .whereRaw('rl.target_record_id = records.id');
    });
  query = applyJurisdictionScope(query, jq);
  const row = await query.count('* as count').first();
  const count = parseInt(row.count, 10) || 0;
  log.debug('countStandaloneArrests: exit', { startDate, endDate, count });
  return count;
};

const normalizeName = (name) => (name || '').trim().toLowerCase().replace(/\s+/g, ' ');

// For each CASE in range: its ACCUSED persons vs the ARRESTEE persons on its linked
// (CASE_ARREST) arrests, matched by normalized name. Unmatched accused = "left out".
const computeLeftOutAccused = async (jq, startDate, endDate) => {
  log.debug('computeLeftOutAccused: enter', { jq, startDate, endDate });
  try {
    let caseQuery = db('records')
      .select('records.id', 'fir.fir_no as fir_no')
      .leftJoin('fir_details as fir', 'records.id', 'fir.record_id')
      .where('records.record_type', 'CASE')
      .whereBetween('records.record_date', [startDate, endDate]);
    // qualify scope columns — fir_details also has ps_id/district_id, so unqualified is ambiguous (42702)
    caseQuery = applyJurisdictionScope(caseQuery, jq, 'records.');
    const cases = await caseQuery;
    if (cases.length === 0) {
      log.debug('computeLeftOutAccused: no CASE records in range, exit early', { startDate, endDate });
      return { count: 0, list: [] };
    }

    const caseIds = cases.map(c => c.id);
    const caseFirById = new Map(cases.map(c => [c.id, c.fir_no]));

    const accusedRows = await db('persons')
      .whereIn('record_id', caseIds)
      .andWhere('role', 'ACCUSED')
      .select('record_id', 'name');
    if (accusedRows.length === 0) {
      log.debug('computeLeftOutAccused: no ACCUSED persons on in-range cases, exit early', { caseCount: cases.length });
      return { count: 0, list: [] };
    }

    const links = await db('record_links as rl')
      .join('link_type_registry as ltr', 'rl.link_type_id', 'ltr.id')
      .where('ltr.code', 'CASE_ARREST')
      .whereIn('rl.source_record_id', caseIds)
      .select('rl.source_record_id as case_id', 'rl.target_record_id as arrest_id');

    const arrestIdsByCaseId = new Map();
    links.forEach(l => {
      if (!arrestIdsByCaseId.has(l.case_id)) arrestIdsByCaseId.set(l.case_id, []);
      arrestIdsByCaseId.get(l.case_id).push(l.arrest_id);
    });

    const allArrestIds = [...new Set(links.map(l => l.arrest_id))];
    const arrestedNamesByArrestId = new Map();
    if (allArrestIds.length > 0) {
      const arrestedRows = await db('persons')
        .whereIn('record_id', allArrestIds)
        .andWhere('role', 'ARRESTEE')
        .select('record_id', 'name');
      arrestedRows.forEach(r => {
        const name = normalizeName(r.name);
        if (!arrestedNamesByArrestId.has(r.record_id)) arrestedNamesByArrestId.set(r.record_id, new Set());
        arrestedNamesByArrestId.get(r.record_id).add(name);
      });
    }

    const leftOutList = [];
    accusedRows.forEach(a => {
      const accusedName = normalizeName(a.name);
      if (!accusedName) return;
      const arrestIds = arrestIdsByCaseId.get(a.record_id) || [];
      const isArrested = arrestIds.some(aid => arrestedNamesByArrestId.get(aid)?.has(accusedName));
      if (!isArrested) {
        leftOutList.push({
          name: a.name || '',
          fir_no: caseFirById.get(a.record_id) || null
        });
      }
    });

    log.debug('computeLeftOutAccused: exit', { startDate, endDate, caseCount: cases.length, accusedCount: accusedRows.length, leftOutCount: leftOutList.length });
    return { count: leftOutList.length, list: leftOutList };
  } catch (error) {
    // Swallowed intentionally (pre-existing behavior, not changed here) — a left-out-accused
    // computation failure degrades the PS dashboard to "0 left out", it must never break the
    // whole ps-dashboard-summary response.
    log.error('computeLeftOutAccused: failed, degrading to zero result', { jq, startDate, endDate, err: error });
    return { count: 0, list: [] };
  }
};

export const getPsDashboardSummary = async (req, res) => {
  const jq = req.jurisdictionQuery;
  const period = ['day', 'week', 'month'].includes(req.query.period) ? req.query.period : 'day';
  log.debug('getPsDashboardSummary: enter', { jq, period });

  try {
    const { currentStart, currentEnd, previousStart, previousEnd } = getDateRangeForPeriod(period);

    const [
      casesCurrent, casesPrevious,
      arrestsCurrent, arrestsPrevious,
      leftOutCurrent, leftOutPrevious
    ] = await Promise.all([
      countRecordsByTypes(jq, CASE_LIKE_TYPES, currentStart, currentEnd),
      countRecordsByTypes(jq, CASE_LIKE_TYPES, previousStart, previousEnd),
      countRecordsByTypes(jq, ['ARREST'], currentStart, currentEnd),
      countRecordsByTypes(jq, ['ARREST'], previousStart, previousEnd),
      computeLeftOutAccused(jq, currentStart, currentEnd),
      computeLeftOutAccused(jq, previousStart, previousEnd)
    ]);

    log.info('getPsDashboardSummary: exit', {
      jq, period, cases: casesCurrent, arrests: arrestsCurrent, leftOut: leftOutCurrent.count,
    });
    return res.status(200).json({
      success: true,
      data: {
        period,
        cases: { count: casesCurrent, change_pct: pctChange(casesCurrent, casesPrevious) },
        arrests: { count: arrestsCurrent, change_pct: pctChange(arrestsCurrent, arrestsPrevious) },
        left_out: { count: leftOutCurrent.count, change_pct: pctChange(leftOutCurrent.count, leftOutPrevious.count) },
        left_out_list: leftOutCurrent.list
      }
    });
  } catch (error) {
    log.error('getPsDashboardSummary: failed', { jq, period, err: error });
    return res.status(500).json({ success: false, message: error.message });
  }
};

export const getCaseTypeBreakdown = async (req, res) => {
  const jq = req.jurisdictionQuery;
  const period = ['day', 'week', 'month'].includes(req.query.period) ? req.query.period : 'day';
  log.debug('getCaseTypeBreakdown: enter', { jq, period });

  try {
    const { currentStart, currentEnd, previousStart, previousEnd } = getDateRangeForPeriod(period);

    const categories = [
      { name: 'FIR', types: ['CASE'] },
      { name: 'PCR', types: ['PCR_CALL'] },
      { name: 'Missing', types: ['MISSING'] },
      { name: 'UIDB', types: ['UIDB'] }
    ];

    const rows = await Promise.all(categories.map(async (c) => {
      const [current, previous] = await Promise.all([
        countRecordsByTypes(jq, c.types, currentStart, currentEnd),
        countRecordsByTypes(jq, c.types, previousStart, previousEnd)
      ]);
      return { name: c.name, count: current, change_pct: pctChange(current, previous) };
    }));

    const [kalandraCurrent, kalandraPrevious] = await Promise.all([
      countStandaloneArrests(jq, currentStart, currentEnd),
      countStandaloneArrests(jq, previousStart, previousEnd)
    ]);
    rows.splice(1, 0, { name: 'Kalandra', count: kalandraCurrent, change_pct: pctChange(kalandraCurrent, kalandraPrevious) });

    log.info('getCaseTypeBreakdown: exit', { jq, period, rowCount: rows.length });
    return res.status(200).json({ success: true, data: { period, rows } });
  } catch (error) {
    log.error('getCaseTypeBreakdown: failed', { jq, period, err: error });
    return res.status(500).json({ success: false, message: error.message });
  }
};

const TREND_MONTH_NAMES = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];

export const getTrendForRecordType = async (jq, recordTypes, period) => {
  log.debug('getTrendForRecordType: enter', { jq, recordTypes, period });
  const today = new Date();

  if (period === 'day') {
    const bins = [
      { startHour: 0, endHour: 4, label: '04:00' },
      { startHour: 4, endHour: 8, label: '08:00' },
      { startHour: 8, endHour: 12, label: '12:00' },
      { startHour: 12, endHour: 16, label: '16:00' },
      { startHour: 16, endHour: 20, label: '20:00' },
      { startHour: 20, endHour: 24, label: '24:00' }
    ];

    const startOfDay = toISODate(today) + ' 00:00:00';
    const endOfDay = toISODate(today) + ' 23:59:59';

    let query = db('records')
      .select('record_date')
      .whereIn('record_type', recordTypes)
      .whereBetween('record_date', [startOfDay, endOfDay]);

    query = applyJurisdictionScope(query, jq);
    const rows = await query;

    const counts = Array(6).fill(0);
    rows.forEach(r => {
      if (!r.record_date) return;
      const h = new Date(r.record_date).getHours();
      for (let i = 0; i < bins.length; i++) {
        if (h >= bins[i].startHour && h < bins[i].endHour) {
          counts[i]++;
          break;
        }
      }
    });

    log.debug('getTrendForRecordType: exit (day bins)', { recordTypes, rowCount: rows.length, binCount: bins.length });
    return bins.map((bin, index) => ({
      label: bin.label,
      value: counts[index]
    }));
  }

  if (period === 'week') {
    const dates = [];
    const monthNames = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
    for (let i = 6; i >= 0; i--) {
      const d = new Date(today);
      d.setDate(today.getDate() - i);
      const dayStr = String(d.getDate());
      const label = i === 6 ? `${dayStr} ${monthNames[d.getMonth()]}` : dayStr;
      dates.push({ dateStr: toISODate(d), label });
    }

    const startOfRange = dates[0].dateStr + ' 00:00:00';
    const endOfRange = dates[6].dateStr + ' 23:59:59';

    let query = db('records')
      .select('record_date')
      .whereIn('record_type', recordTypes)
      .whereBetween('record_date', [startOfRange, endOfRange]);

    query = applyJurisdictionScope(query, jq);
    const rows = await query;

    const countsMap = {};
    dates.forEach(d => { countsMap[d.dateStr] = 0; });

    rows.forEach(r => {
      if (!r.record_date) return;
      const d = new Date(r.record_date);
      const y = d.getFullYear();
      const m = String(d.getMonth() + 1).padStart(2, '0');
      const day = String(d.getDate()).padStart(2, '0');
      const dateStr = `${y}-${m}-${day}`;
      if (dateStr in countsMap) {
        countsMap[dateStr]++;
      }
    });

    log.debug('getTrendForRecordType: exit (week bins)', { recordTypes, rowCount: rows.length, dayCount: dates.length });
    return dates.map(d => ({
      label: d.label,
      value: countsMap[d.dateStr]
    }));
  }

  // period === 'month'
  const dates = [];
  const monthNames = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
  for (let i = 29; i >= 0; i--) {
    const d = new Date(today);
    d.setDate(today.getDate() - i);
    const dayStr = String(d.getDate());
    const label = (i === 29 || d.getDate() === 1) ? `${dayStr} ${monthNames[d.getMonth()]}` : dayStr;
    dates.push({ dateStr: toISODate(d), label });
  }

  const startOfRange = dates[0].dateStr + ' 00:00:00';
  const endOfRange = dates[29].dateStr + ' 23:59:59';

  let query = db('records')
    .select('record_date')
    .whereIn('record_type', recordTypes)
    .whereBetween('record_date', [startOfRange, endOfRange]);

  query = applyJurisdictionScope(query, jq);
  const rows = await query;

  const countsMap = {};
  dates.forEach(d => { countsMap[d.dateStr] = 0; });

  rows.forEach(r => {
    if (!r.record_date) return;
    const d = new Date(r.record_date);
    const y = d.getFullYear();
    const m = String(d.getMonth() + 1).padStart(2, '0');
    const day = String(d.getDate()).padStart(2, '0');
    const dateStr = `${y}-${m}-${day}`;
    if (dateStr in countsMap) {
      countsMap[dateStr]++;
    }
  });

  log.debug('getTrendForRecordType: exit (month bins)', { recordTypes, rowCount: rows.length, dayCount: dates.length });
  return dates.map(d => ({
    label: d.label,
    value: countsMap[d.dateStr]
  }));
};

export const getCasesByMonthTrend = async (req, res) => {
  const jq = req.jurisdictionQuery;
  const period = req.query.period;
  log.debug('getCasesByMonthTrend: enter', { jq, period });

  try {
    if (period && ['day', 'week', 'month'].includes(period)) {
      log.debug('getCasesByMonthTrend: delegating to getTrendForRecordType (fine-grained period)', { jq, period });
      const trendData = await getTrendForRecordType(jq, CASE_LIKE_TYPES, period);
      log.info('getCasesByMonthTrend: exit (fine-grained)', { jq, period, rowCount: trendData.length });
      return res.status(200).json({ success: true, data: trendData });
    }

    const today = new Date();
    const months = [];
    for (let i = 11; i >= 0; i--) {
      const d = new Date(today.getFullYear(), today.getMonth() - i, 1);
      months.push({ year: d.getFullYear(), month: d.getMonth() });
    }

    const rangeStart = toISODate(new Date(months[0].year, months[0].month, 1));
    const rangeEnd = toISODate(new Date(months[months.length - 1].year, months[months.length - 1].month + 1, 0));

    let query = db('records')
      .select(db.raw(`to_char(record_date, 'YYYY-MM') as ym`))
      .count('* as count')
      .whereIn('record_type', CASE_LIKE_TYPES)
      .whereBetween('record_date', [rangeStart, rangeEnd]);
    query = applyJurisdictionScope(query, jq);
    const rows = await query.groupBy(db.raw(`to_char(record_date, 'YYYY-MM')`));

    const countByYm = new Map(rows.map(r => [r.ym, parseInt(r.count, 10) || 0]));
    const data = months.map(({ year, month }) => {
      const ym = `${year}-${String(month + 1).padStart(2, '0')}`;
      return {
        month: TREND_MONTH_NAMES[month],
        label: TREND_MONTH_NAMES[month],
        value: countByYm.get(ym) || 0
      };
    });

    log.info('getCasesByMonthTrend: exit (12-month)', { jq, monthCount: data.length });
    return res.status(200).json({ success: true, data });
  } catch (error) {
    log.error('getCasesByMonthTrend: failed', { jq, period, err: error });
    return res.status(500).json({ success: false, message: error.message });
  }
};

export const getByDistrict = async (req, res) => {
  log.debug('getByDistrict: enter');
  try {
    const districts = await db('hierarchy_nodes')
      .where({ node_type: 'DISTRICT', is_active: true })
      .select('id', 'name');

    const rows = await db('records')
      .select('district_id', 'record_type')
      .count('* as count')
      .whereIn('current_status', ['submitted', 'PENDING_SHO', 'DISTRICT_REVIEW', 'HQ_RECEIVED', 'CLOSED'])
      .groupBy('district_id', 'record_type');

    const countsMap = {};
    rows.forEach(r => {
      const distId = r.district_id;
      if (!countsMap[distId]) {
        countsMap[distId] = { cases: 0, arrests: 0, pcr: 0, missing: 0, total: 0 };
      }
      const type = (r.record_type || '').toUpperCase();
      const count = parseInt(r.count, 10) || 0;
      if (type === 'CASE' || type === 'CASES') countsMap[distId].cases = count;
      else if (type === 'ARREST') countsMap[distId].arrests = count;
      else if (type === 'PCR_CALL') countsMap[distId].pcr = count;
      else if (type === 'MISSING') countsMap[distId].missing = count;
      countsMap[distId].total += count;
    });

    const data = districts.map(d => {
      const stats = countsMap[d.id] || { cases: 0, arrests: 0, pcr: 0, missing: 0, total: 0 };
      return {
        id: d.id,
        name: d.name,
        name_hi: d.name,
        cases: stats.cases,
        arrests: stats.arrests,
        pcr: stats.pcr,
        missing: stats.missing,
        total: stats.total
      };
    });

    log.info('getByDistrict: exit', { districtCount: data.length });
    return res.status(200).json({ success: true, data });
  } catch (error) {
    log.error('getByDistrict: failed', { err: error });
    return res.status(500).json({ success: false, message: error.message });
  }
};

export const getArrestsTrend = async (req, res) => {
  const jq = req.jurisdictionQuery;
  const period = ['day', 'week', 'month'].includes(req.query.period) ? req.query.period : 'week';
  log.debug('getArrestsTrend: enter', { jq, period });
  try {
    const trendData = await getTrendForRecordType(jq, ['ARREST'], period);
    const data = trendData.map(item => ({ day: item.label, value: item.value }));
    log.info('getArrestsTrend: exit', { jq, period, rowCount: data.length });
    return res.status(200).json({ success: true, data });
  } catch (error) {
    log.error('getArrestsTrend: failed', { jq, period, err: error });
    return res.status(500).json({ success: false, message: error.message });
  }
};


