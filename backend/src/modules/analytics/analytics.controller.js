import db from '../../config/db.js';
import ExcelJS from 'exceljs';
import { toDMY } from '../../utils/dateFormat.js';

const parseJsonField = (val) => {
  if (val === null || val === undefined) return null;
  if (typeof val === 'string') {
    try { return JSON.parse(val); } catch (e) { return val; }
  }
  return val;
};

const jsonbPath = (column, path) => `(${column})::jsonb->>'${path}'`;

// 'YYYY-MM' bucket key -> 'MM/YYYY' display label
const formatMonthLabel = (ym) => {
  if (!ym || typeof ym !== 'string') return ym;
  const [y, m] = ym.split('-');
  return y && m ? `${m}/${y}` : ym;
};

export const getSummary = async (req, res) => {
  const jq = req.jurisdictionQuery;

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

    return res.status(200).json({
      success: true,
      data: {
        summary: data
      }
    });
  } catch (error) {
    return res.status(500).json({ success: false, message: error.message });
  }
};

export const getTrends = async (req, res) => {
  const { recordType } = req.query; // cases, arrest, pcr
  const jq = req.jurisdictionQuery;

  if (!recordType) {
    return res.status(400).json({ success: false, message: 'recordType query parameter is required' });
  }

  const typeUpper = recordType.toUpperCase();
  const classificationKey = typeUpper === 'CASE' ? 'case_head' : (typeUpper === 'ARREST' ? 'crime_head' : 'pcr_head');

  try {
    const jsonPath = jsonbPath('data', classificationKey);
    const monthExpr = `to_char(record_date, 'YYYY-MM')`;

    let query = db('records')
      .select(
        db.raw(`${jsonPath} as classification`),
        db.raw(`${monthExpr} as month`),
        db.raw('count(*) as count')
      )
      .where({ record_type: typeUpper })
      .whereIn('current_status', ['submitted', 'PENDING_SHO', 'DISTRICT_REVIEW', 'HQ_RECEIVED', 'CLOSED']);

    if (jq.ps_id) query = query.where('ps_id', jq.ps_id);
    if (jq.district_id) query = query.where('district_id', jq.district_id);
    if (jq.sub_div_id) query = query.where('sub_div_id', jq.sub_div_id);

    const trends = await query
      .groupBy([db.raw(jsonPath), db.raw(monthExpr)])
      .orderBy('month', 'asc');

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
    return res.status(500).json({ success: false, message: error.message });
  }
};

export const getCompare = async (req, res) => {
  const { recordType } = req.query;
  const jq = req.jurisdictionQuery;
  const { role } = req.user;

  if (!recordType) {
    return res.status(400).json({ success: false, message: 'recordType query parameter is required' });
  }

  let typeUpper = recordType.toUpperCase();
  if (typeUpper === 'CASES') typeUpper = 'CASE';
  if (typeUpper === 'PCR') typeUpper = 'PCR_CALL';

  try {
    let selectCol = 'ps.name_en';
    let groupCol = 'records.ps_id';

    if (['HQ_ANALYST', 'HQ_ADMIN', 'SYSTEM_ADMIN'].includes(role)) {
      selectCol = 'dist.name_en';
      groupCol = 'records.district_id';
    } else if (role === 'DISTRICT_OFFICER') {
      selectCol = 'sub.name_en';
      groupCol = 'records.sub_div_id';
    }

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
    return res.status(500).json({ success: false, message: error.message });
  }
};

export const getOverview = async (req, res) => {
  const jq = req.jurisdictionQuery;
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
    return res.status(200).json({ success: true, data });
  } catch (error) {
    return res.status(500).json({ success: false, message: error.message });
  }
};

export const getByPs = async (req, res) => {
  const jq = req.jurisdictionQuery;
  try {
    let query = db('records')
      .select('hn.name_en as station', 'records.record_type')
      .count('* as count')
      .join('hierarchy_nodes as hn', 'records.ps_id', 'hn.id');

    if (jq.ps_id) query = query.where('records.ps_id', jq.ps_id);
    if (jq.district_id) query = query.where('records.district_id', jq.district_id);
    if (jq.sub_div_id) query = query.where('records.sub_div_id', jq.sub_div_id);

    const rows = await query.groupBy('hn.name_en', 'records.record_type').orderBy('hn.name_en');

    const stationMap = {};
    rows.forEach(r => {
      const station = r.station || 'Unknown PS';
      if (!stationMap[station]) stationMap[station] = { station, cases: 0, pcr: 0, arrests: 0 };
      const type = (r.record_type || '').toUpperCase();
      const count = parseInt(r.count, 10) || 0;
      if (type === 'CASE') stationMap[station].cases = count;
      else if (type === 'PCR_CALL') stationMap[station].pcr = count;
      else if (type === 'ARREST') stationMap[station].arrests = count;
    });
    return res.status(200).json({ success: true, data: Object.values(stationMap) });
  } catch (error) {
    return res.status(500).json({ success: false, message: error.message });
  }
};

export const getByCrimeHead = async (req, res) => {
  const jq = req.jurisdictionQuery;
  try {
    const jsonPath = jsonbPath('data', 'crime_head');
    let query = db('records')
      .select(db.raw(`${jsonPath} as crime_head`))
      .count('* as count')
      .where('record_type', 'CASE');

    if (jq.ps_id) query = query.where('ps_id', jq.ps_id);
    if (jq.district_id) query = query.where('district_id', jq.district_id);
    if (jq.sub_div_id) query = query.where('sub_div_id', jq.sub_div_id);

    const rows = await query.groupBy(db.raw(jsonPath)).orderBy('count', 'desc').limit(10);
    const data = rows.map(r => ({
      name: r.crime_head || 'UNCATEGORIZED',
      count: parseInt(r.count, 10) || 0
    }));
    return res.status(200).json({ success: true, data });
  } catch (error) {
    return res.status(500).json({ success: false, message: error.message });
  }
};

export const getCombinedTrends = async (req, res) => {
  const jq = req.jurisdictionQuery;
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
    return res.status(200).json({ success: true, data });
  } catch (error) {
    return res.status(500).json({ success: false, message: error.message });
  }
};

export const exportSpreadsheet = async (req, res) => {
  const { recordType } = req.query;
  const jq = req.jurisdictionQuery;

  if (!recordType) {
    return res.status(400).json({ success: false, message: 'recordType query parameter is required' });
  }

  let typeUpper = recordType.toUpperCase();
  if (typeUpper === 'CASES') typeUpper = 'CASE';
  if (typeUpper === 'PCR') typeUpper = 'PCR_CALL';

  try {
    let query = db('records')
      .select('records.*', 'ps.name_en as ps_name', 'dist.name_en as district_name')
      .join('hierarchy_nodes as ps', 'records.ps_id', 'ps.id')
      .join('hierarchy_nodes as dist', 'records.district_id', 'dist.id')
      .where({ record_type: typeUpper })
      .whereIn('records.current_status', ['submitted', 'PENDING_SHO', 'DISTRICT_REVIEW', 'HQ_RECEIVED', 'CLOSED']);

    if (jq.ps_id) query = query.where('records.ps_id', jq.ps_id);
    if (jq.district_id) query = query.where('records.district_id', jq.district_id);
    if (jq.sub_div_id) query = query.where('records.sub_div_id', jq.sub_div_id);

    const rows = await query.orderBy('records.record_date', 'desc');

    const workbook = new ExcelJS.Workbook();
    const sheet = workbook.addWorksheet(`${typeUpper} Records`);

    sheet.columns = [
      { header: 'UID', key: 'uid', width: 25 },
      { header: 'District', key: 'district_name', width: 20 },
      { header: 'Police Station', key: 'ps_name', width: 20 },
      { header: 'Date', key: 'record_date', width: 15 },
      { header: 'Status', key: 'current_status', width: 15 },
      { header: 'Details (JSON Block)', key: 'data_json', width: 50 }
    ];

    rows.forEach(r => {
      const dataObj = parseJsonField(r.data);
      sheet.addRow({
        uid: dataObj?.uid || r.id,
        district_name: r.district_name,
        ps_name: r.ps_name,
        record_date: toDMY(r.record_date) || '',
        current_status: r.current_status,
        data_json: JSON.stringify(dataObj)
      });
    });

    res.setHeader('Content-Type', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet');
    res.setHeader('Content-Disposition', `attachment; filename=Pharos_${typeUpper}_Export.xlsx`);

    await workbook.xlsx.write(res);
    return res.end();
  } catch (error) {
    return res.status(500).json({ success: false, message: error.message });
  }
};

export const getStatusBreakdown = async (req, res) => {
  const jq = req.jurisdictionQuery;
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
    return res.status(200).json({ success: true, data });
  } catch (error) {
    return res.status(500).json({ success: false, message: error.message });
  }
};

// ── PS Dashboard summary (Cases / Arrest / Left Out Accused) ─────────────────

const applyJurisdictionScope = (query, jq) => {
  if (jq.ps_id) query = query.where('ps_id', jq.ps_id);
  if (jq.district_id) query = query.where('district_id', jq.district_id);
  if (jq.sub_div_id) query = query.where('sub_div_id', jq.sub_div_id);
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
  let query = db('records')
    .whereIn('record_type', recordTypes)
    .whereBetween('record_date', [startDate, endDate]);
  query = applyJurisdictionScope(query, jq);
  const row = await query.count('* as count').first();
  return parseInt(row.count, 10) || 0;
};

// "Kalandra" = an ARREST record with no CASE_ARREST link pointing at it (standalone arrest, no FIR).
const countStandaloneArrests = async (jq, startDate, endDate) => {
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
  return parseInt(row.count, 10) || 0;
};

const normalizeName = (first, last) => `${first || ''} ${last || ''}`.trim().toLowerCase().replace(/\s+/g, ' ');

// For each CASE in range: its ACCUSED persons vs the ARRESTED persons on its linked
// (CASE_ARREST) arrests, matched by normalized name. Unmatched accused = "left out".
const computeLeftOutAccused = async (jq, startDate, endDate) => {
  try {
    let caseQuery = db('records')
      .select('id', db.raw(`${jsonbPath('data', 'fir_no')} as fir_no`))
      .where('record_type', 'CASE')
      .whereBetween('record_date', [startDate, endDate]);
    caseQuery = applyJurisdictionScope(caseQuery, jq);
    const cases = await caseQuery;
    if (cases.length === 0) return { count: 0, list: [] };

    const caseIds = cases.map(c => c.id);
    const caseFirById = new Map(cases.map(c => [c.id, c.fir_no]));

    const accusedRows = await db('record_persons')
      .whereIn('record_id', caseIds)
      .andWhere('person_type', 'ACCUSED')
      .select('record_id', 'first_name', 'last_name');
    if (accusedRows.length === 0) return { count: 0, list: [] };

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
      const arrestedRows = await db('record_persons')
        .whereIn('record_id', allArrestIds)
        .andWhere('person_type', 'ARRESTED')
        .select('record_id', 'first_name', 'last_name');
      arrestedRows.forEach(r => {
        const name = normalizeName(r.first_name, r.last_name);
        if (!arrestedNamesByArrestId.has(r.record_id)) arrestedNamesByArrestId.set(r.record_id, new Set());
        arrestedNamesByArrestId.get(r.record_id).add(name);
      });
    }

    const leftOutList = [];
    accusedRows.forEach(a => {
      const accusedName = normalizeName(a.first_name, a.last_name);
      if (!accusedName) return;
      const arrestIds = arrestIdsByCaseId.get(a.record_id) || [];
      const isArrested = arrestIds.some(aid => arrestedNamesByArrestId.get(aid)?.has(accusedName));
      if (!isArrested) {
        leftOutList.push({
          name: `${a.first_name || ''} ${a.last_name || ''}`.trim(),
          fir_no: caseFirById.get(a.record_id) || null
        });
      }
    });

    return { count: leftOutList.length, list: leftOutList };
  } catch (error) {
    return { count: 0, list: [] };
  }
};

export const getPsDashboardSummary = async (req, res) => {
  const jq = req.jurisdictionQuery;
  const period = ['day', 'week', 'month'].includes(req.query.period) ? req.query.period : 'day';

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
    return res.status(500).json({ success: false, message: error.message });
  }
};

export const getCaseTypeBreakdown = async (req, res) => {
  const jq = req.jurisdictionQuery;
  const period = ['day', 'week', 'month'].includes(req.query.period) ? req.query.period : 'day';

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

    return res.status(200).json({ success: true, data: { period, rows } });
  } catch (error) {
    return res.status(500).json({ success: false, message: error.message });
  }
};

const TREND_MONTH_NAMES = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];

export const getCasesByMonthTrend = async (req, res) => {
  const jq = req.jurisdictionQuery;

  try {
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
      return { month: TREND_MONTH_NAMES[month], value: countByYm.get(ym) || 0 };
    });

    return res.status(200).json({ success: true, data });
  } catch (error) {
    return res.status(500).json({ success: false, message: error.message });
  }
};

