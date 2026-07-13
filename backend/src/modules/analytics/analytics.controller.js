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
    // 1. Fetch active PS nodes for the current scope
    let stationsQuery = db('hierarchy_nodes').where({ node_type: 'PS', is_active: true });

    if (jq.ps_id) {
      stationsQuery = stationsQuery.where('id', jq.ps_id);
    } else if (jq.sub_div_id) {
      stationsQuery = stationsQuery.where('parent_id', jq.sub_div_id);
    } else if (jq.district_id) {
      // Find sub-divisions under this district
      const subDivs = await db('hierarchy_nodes')
        .where({ node_type: 'SUB_DIVISION', parent_id: jq.district_id, is_active: true })
        .select('id');
      const subDivIds = subDivs.map(s => s.id);
      stationsQuery = stationsQuery.whereIn('parent_id', subDivIds);
    }

    const stations = await stationsQuery.select('id', 'name_en', 'name_hi');

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
        station: s.name_en || s.name,
        station_hi: s.name_hi || s.name,
        cases: stats.cases,
        pcr: stats.pcr,
        arrests: stats.arrests
      };
    });

    // Sort alphabetically by station name
    data.sort((a, b) => a.station.localeCompare(b.station));

    return res.status(200).json({ success: true, data });
  } catch (error) {
    return res.status(500).json({ success: false, message: error.message });
  }
};

export const getByCrimeHead = async (req, res) => {
  const jq = req.jurisdictionQuery;
  try {
    let query = db('records')
      .join('excel_heinous_offences', db.raw("(records.data)::jsonb->>'local_head'"), 'excel_heinous_offences.heinous_offence')
      .select('excel_heinous_offences.heinous_offence as heinous_offence')
      .count('* as count')
      .where('records.record_type', 'CASE');

    if (jq.ps_id) query = query.where('records.ps_id', jq.ps_id);
    if (jq.district_id) query = query.where('records.district_id', jq.district_id);
    if (jq.sub_div_id) query = query.where('records.sub_div_id', jq.sub_div_id);

    const rows = await query.groupBy('excel_heinous_offences.heinous_offence').orderBy('count', 'desc').limit(10);
    const data = rows.map(r => ({
      name: r.heinous_offence,
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

// Shared subquery: "this ARREST record has a CASE_ARREST link pointing at it" (i.e. linked to a FIR/CASE).
const caseArrestLinkSubquery = function () {
  this.select('*')
    .from('record_links as rl')
    .join('link_type_registry as ltr', 'rl.link_type_id', 'ltr.id')
    .where('ltr.code', 'CASE_ARREST')
    .whereRaw('rl.target_record_id = records.id');
};

// "Kalandra" = an ARREST record with no CASE_ARREST link pointing at it (standalone arrest, no FIR).
const countStandaloneArrests = async (jq, startDate, endDate) => {
  let query = db('records')
    .where('record_type', 'ARREST')
    .whereBetween('record_date', [startDate, endDate])
    .whereNotExists(caseArrestLinkSubquery);
  query = applyJurisdictionScope(query, jq);
  const row = await query.count('* as count').first();
  return parseInt(row.count, 10) || 0;
};

// Same "Kalandra" filter as countStandaloneArrests, but returns the record ids — lets callers
// reuse one query for the count, gender breakdowns, and crime-head matrix instead of re-deriving it.
const getStandaloneArrestIds = async (jq, startDate, endDate) => {
  let query = db('records')
    .select('id')
    .where('record_type', 'ARREST')
    .whereBetween('record_date', [startDate, endDate])
    .whereNotExists(caseArrestLinkSubquery);
  query = applyJurisdictionScope(query, jq);
  const rows = await query;
  return rows.map((r) => r.id);
};

// "Arrest in FIR" = the complement of Kalandra: an ARREST record that IS linked to a CASE.
const countLinkedArrests = async (jq, startDate, endDate) => {
  let query = db('records')
    .where('record_type', 'ARREST')
    .whereBetween('record_date', [startDate, endDate])
    .whereExists(caseArrestLinkSubquery);
  query = applyJurisdictionScope(query, jq);
  const row = await query.count('* as count').first();
  return parseInt(row.count, 10) || 0;
};

const normalizeName = (first, last) => `${first || ''} ${last || ''}`.trim().toLowerCase().replace(/\s+/g, ' ');

// CASE records in range+scope where the heinous_offence flag is set.
const countHeinousCases = async (jq, startDate, endDate) => {
  let query = db('records')
    .where('record_type', 'CASE')
    .whereBetween('record_date', [startDate, endDate])
    .whereRaw(`${jsonbPath('data', 'heinous_offence')} = 'true'`);
  query = applyJurisdictionScope(query, jq);
  const row = await query.count('* as count').first();
  return parseInt(row.count, 10) || 0;
};

// Counts record_persons rows (ARRESTED) with a given gender, restricted to a specific set of
// record ids (e.g. the Kalandra/standalone-arrest id list) — avoids re-deriving that set.
const countGenderInPersonIds = async (recordIds, gender) => {
  if (!recordIds || recordIds.length === 0) return 0;
  const row = await db('record_persons')
    .whereIn('record_id', recordIds)
    .andWhere('person_type', 'ARRESTED')
    .andWhereRaw(`data->>'arrested_gender' = ?`, [gender])
    .count('* as count')
    .first();
  return parseInt(row.count, 10) || 0;
};

// For each CASE in range: its ACCUSED persons vs the ARRESTED persons on its linked
// (CASE_ARREST) arrests, matched by normalized name. Unmatched accused = "left out".
// heinousOnly restricts the CASE set to those with heinous_offence = true.
const computeLeftOutAccused = async (jq, startDate, endDate, { heinousOnly = false } = {}) => {
  try {
    let caseQuery = db('records')
      .select('id', db.raw(`${jsonbPath('data', 'fir_no')} as fir_no`))
      .where('record_type', 'CASE')
      .whereBetween('record_date', [startDate, endDate]);
    if (heinousOnly) {
      caseQuery = caseQuery.whereRaw(`${jsonbPath('data', 'heinous_offence')} = 'true'`);
    }
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

// ── HC Dashboard v2: FIR / Arrest-in-FIR / Heinous / Kalandra + gender split ──────────

export const getPsDashboardStatsV2 = async (req, res) => {
  const jq = req.jurisdictionQuery;
  const period = ['day', 'week', 'month'].includes(req.query.period) ? req.query.period : 'day';

  try {
    const { currentStart, currentEnd, previousStart, previousEnd } = getDateRangeForPeriod(period);

    const [
      firCurrent, firPrevious,
      arrestInFirCurrent, arrestInFirPrevious,
      heinousCurrent, heinousPrevious,
      standaloneIdsCurrent, standaloneIdsPrevious,
      leftOutCurrent, leftOutPrevious
    ] = await Promise.all([
      countRecordsByTypes(jq, ['CASE'], currentStart, currentEnd),
      countRecordsByTypes(jq, ['CASE'], previousStart, previousEnd),
      countLinkedArrests(jq, currentStart, currentEnd),
      countLinkedArrests(jq, previousStart, previousEnd),
      countHeinousCases(jq, currentStart, currentEnd),
      countHeinousCases(jq, previousStart, previousEnd),
      getStandaloneArrestIds(jq, currentStart, currentEnd),
      getStandaloneArrestIds(jq, previousStart, previousEnd),
      computeLeftOutAccused(jq, currentStart, currentEnd, { heinousOnly: true }),
      computeLeftOutAccused(jq, previousStart, previousEnd, { heinousOnly: true })
    ]);

    const [maleCurrent, malePrevious, femaleCurrent, femalePrevious] = await Promise.all([
      countGenderInPersonIds(standaloneIdsCurrent, 'Male'),
      countGenderInPersonIds(standaloneIdsPrevious, 'Male'),
      countGenderInPersonIds(standaloneIdsCurrent, 'Female'),
      countGenderInPersonIds(standaloneIdsPrevious, 'Female')
    ]);

    const box = (cur, prev) => ({ count: cur, change_pct: pctChange(cur, prev) });

    return res.status(200).json({
      success: true,
      data: {
        period,
        fir: box(firCurrent, firPrevious),
        arrest_in_fir: box(arrestInFirCurrent, arrestInFirPrevious),
        heinous_case: box(heinousCurrent, heinousPrevious),
        leftout_heinous: box(leftOutCurrent.count, leftOutPrevious.count),
        kalandra: box(standaloneIdsCurrent.length, standaloneIdsPrevious.length),
        kalandra_male: box(maleCurrent, malePrevious),
        kalandra_female: box(femaleCurrent, femalePrevious),
        leftout_heinous_list: leftOutCurrent.list
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

// Shared time-bucketing definition for day/week/month trend views — used by getTrendForRecordType
// and getTrendBreakdownByCategory so bucket boundaries/labels never drift apart between the two.
const getBucketDefsForPeriod = (period) => {
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
    return {
      rangeStart: toISODate(today) + ' 00:00:00',
      rangeEnd: toISODate(today) + ' 23:59:59',
      labels: bins.map(b => b.label),
      bucketIndex: (recordDateVal) => {
        if (!recordDateVal) return -1;
        const h = new Date(recordDateVal).getHours();
        for (let i = 0; i < bins.length; i++) {
          if (h >= bins[i].startHour && h < bins[i].endHour) return i;
        }
        return -1;
      }
    };
  }

  const spanDays = period === 'week' ? 7 : 30;
  const dates = [];
  for (let i = spanDays - 1; i >= 0; i--) {
    const d = new Date(today);
    d.setDate(today.getDate() - i);
    const dayStr = String(d.getDate());
    const label = (i === spanDays - 1 || (period === 'month' && d.getDate() === 1))
      ? `${dayStr} ${TREND_MONTH_NAMES[d.getMonth()]}`
      : dayStr;
    dates.push({ dateStr: toISODate(d), label });
  }
  const indexByDateStr = new Map(dates.map((d, i) => [d.dateStr, i]));
  return {
    rangeStart: dates[0].dateStr + ' 00:00:00',
    rangeEnd: dates[dates.length - 1].dateStr + ' 23:59:59',
    labels: dates.map(d => d.label),
    bucketIndex: (recordDateVal) => {
      if (!recordDateVal) return -1;
      const idx = indexByDateStr.get(toISODate(new Date(recordDateVal)));
      return idx === undefined ? -1 : idx;
    }
  };
};

export const getTrendForRecordType = async (jq, recordTypes, period) => {
  const { rangeStart, rangeEnd, labels, bucketIndex } = getBucketDefsForPeriod(period);

  let query = db('records')
    .select('record_date')
    .whereIn('record_type', recordTypes)
    .whereBetween('record_date', [rangeStart, rangeEnd]);
  query = applyJurisdictionScope(query, jq);
  const rows = await query;

  const counts = Array(labels.length).fill(0);
  rows.forEach(r => {
    const idx = bucketIndex(r.record_date);
    if (idx !== -1) counts[idx]++;
  });

  return labels.map((label, index) => ({ label, value: counts[index] }));
};

export const getCasesByMonthTrend = async (req, res) => {
  const jq = req.jurisdictionQuery;
  const period = req.query.period;

  try {
    if (period && ['day', 'week', 'month'].includes(period)) {
      const trendData = await getTrendForRecordType(jq, CASE_LIKE_TYPES, period);
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

    return res.status(200).json({ success: true, data });
  } catch (error) {
    return res.status(500).json({ success: false, message: error.message });
  }
};

export const getByDistrict = async (req, res) => {
  try {
    const districts = await db('hierarchy_nodes')
      .where({ node_type: 'DISTRICT', is_active: true })
      .select('id', 'name_en', 'name_hi');

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
        name: d.name_en || d.name,
        name_hi: d.name_hi || d.name,
        cases: stats.cases,
        arrests: stats.arrests,
        pcr: stats.pcr,
        missing: stats.missing,
        total: stats.total
      };
    });

    return res.status(200).json({ success: true, data });
  } catch (error) {
    return res.status(500).json({ success: false, message: error.message });
  }
};

export const getArrestsTrend = async (req, res) => {
  const jq = req.jurisdictionQuery;
  const period = ['day', 'week', 'month'].includes(req.query.period) ? req.query.period : 'week';
  try {
    const trendData = await getTrendForRecordType(jq, ['ARREST'], period);
    const data = trendData.map(item => ({ day: item.label, value: item.value }));
    return res.status(200).json({ success: true, data });
  } catch (error) {
    return res.status(500).json({ success: false, message: error.message });
  }
};

// ── HC Dashboard v2: arrest trend + "total across all case types" line, with per-category
// hover breakdown (FIR/Kalandra/PCR/Missing/UIDB). Two queries total, not one per bucket. ──

const getTrendBreakdownByCategory = async (jq, period) => {
  const { rangeStart, rangeEnd, labels, bucketIndex } = getBucketDefsForPeriod(period);

  let rowsQuery = db('records')
    .select('id', 'record_type', 'record_date')
    .whereIn('record_type', ['CASE', 'PCR_CALL', 'MISSING', 'UIDB', 'ARREST'])
    .whereBetween('record_date', [rangeStart, rangeEnd]);
  rowsQuery = applyJurisdictionScope(rowsQuery, jq);
  const rows = await rowsQuery;

  const arrestIds = rows.filter(r => r.record_type === 'ARREST').map(r => r.id);
  const linkedArrestIdSet = new Set();
  if (arrestIds.length > 0) {
    const linkedRows = await db('record_links as rl')
      .join('link_type_registry as ltr', 'rl.link_type_id', 'ltr.id')
      .where('ltr.code', 'CASE_ARREST')
      .whereIn('rl.target_record_id', arrestIds)
      .select('rl.target_record_id');
    linkedRows.forEach(r => linkedArrestIdSet.add(r.target_record_id));
  }

  const buckets = labels.map(() => ({ FIR: 0, Kalandra: 0, PCR: 0, Missing: 0, UIDB: 0, arrest_value: 0 }));
  rows.forEach(r => {
    const idx = bucketIndex(r.record_date);
    if (idx === -1) return;
    const b = buckets[idx];
    if (r.record_type === 'ARREST') {
      b.arrest_value++;
      if (!linkedArrestIdSet.has(r.id)) b.Kalandra++;
    } else if (r.record_type === 'CASE') b.FIR++;
    else if (r.record_type === 'PCR_CALL') b.PCR++;
    else if (r.record_type === 'MISSING') b.Missing++;
    else if (r.record_type === 'UIDB') b.UIDB++;
  });

  return labels.map((label, i) => {
    const b = buckets[i];
    const total_value = b.FIR + b.Kalandra + b.PCR + b.Missing + b.UIDB;
    return {
      label,
      arrest_value: b.arrest_value,
      total_value,
      breakdown: { FIR: b.FIR, Kalandra: b.Kalandra, PCR: b.PCR, Missing: b.Missing, UIDB: b.UIDB }
    };
  });
};

export const getArrestsTrendBreakdown = async (req, res) => {
  const jq = req.jurisdictionQuery;
  const period = ['day', 'week', 'month'].includes(req.query.period) ? req.query.period : 'week';
  try {
    const points = await getTrendBreakdownByCategory(jq, period);
    return res.status(200).json({ success: true, data: { period, points } });
  } catch (error) {
    return res.status(500).json({ success: false, message: error.message });
  }
};

// ── HC Dashboard v2: crime-head (local_head) × case-type matrix ──────────────────────────

export const getCrimeHeadMatrix = async (req, res) => {
  const jq = req.jurisdictionQuery;
  const period = ['day', 'week', 'month'].includes(req.query.period) ? req.query.period : 'day';
  try {
    const { currentStart, currentEnd } = getDateRangeForPeriod(period);
    const localHeadExpr = jsonbPath('data', 'local_head');

    const groupByCrimeHead = async (recordType) => {
      let query = db('records')
        .select(db.raw(`${localHeadExpr} as crime_head`))
        .count('* as count')
        .where('record_type', recordType)
        .whereRaw(`${localHeadExpr} IS NOT NULL`)
        .whereBetween('record_date', [currentStart, currentEnd]);
      query = applyJurisdictionScope(query, jq);
      const rows = await query.groupBy(db.raw(localHeadExpr));
      return new Map(rows.map(r => [r.crime_head, parseInt(r.count, 10) || 0]));
    };

    // Arrests linked to a CASE (CASE_ARREST), classified by the linked CASE's own crime head —
    // an ARREST record's own local_head is usually unset, the CASE it's linked to carries it.
    const groupLinkedArrestsByCaseCrimeHead = async () => {
      let query = db('record_links as rl')
        .join('link_type_registry as ltr', 'rl.link_type_id', 'ltr.id')
        .join('records as arrest_rec', 'arrest_rec.id', 'rl.target_record_id')
        .join('records as case_rec', 'case_rec.id', 'rl.source_record_id')
        .where('ltr.code', 'CASE_ARREST')
        .whereBetween('arrest_rec.record_date', [currentStart, currentEnd])
        .whereRaw(`${jsonbPath('case_rec.data', 'local_head')} IS NOT NULL`)
        .select(db.raw(`${jsonbPath('case_rec.data', 'local_head')} as crime_head`))
        .count('* as count');
      if (jq.ps_id) query = query.where('arrest_rec.ps_id', jq.ps_id);
      if (jq.district_id) query = query.where('arrest_rec.district_id', jq.district_id);
      if (jq.sub_div_id) query = query.where('arrest_rec.sub_div_id', jq.sub_div_id);
      const rows = await query.groupBy(db.raw(jsonbPath('case_rec.data', 'local_head')));
      return new Map(rows.map(r => [r.crime_head, parseInt(r.count, 10) || 0]));
    };

    const [firMap, uidbMap, standaloneArrestIds, linkedArrestByCaseHeadMap] = await Promise.all([
      groupByCrimeHead('CASE'),
      groupByCrimeHead('UIDB'),
      getStandaloneArrestIds(jq, currentStart, currentEnd),
      groupLinkedArrestsByCaseCrimeHead()
    ]);

    let kalandraMap = new Map();
    if (standaloneArrestIds.length > 0) {
      const rows = await db('records')
        .select(db.raw(`${localHeadExpr} as crime_head`))
        .count('* as count')
        .whereIn('id', standaloneArrestIds)
        .whereRaw(`${localHeadExpr} IS NOT NULL`)
        .groupBy(db.raw(localHeadExpr));
      kalandraMap = new Map(rows.map(r => [r.crime_head, parseInt(r.count, 10) || 0]));
    }

    const crimeHeads = [...new Set([
      ...firMap.keys(), ...uidbMap.keys(), ...kalandraMap.keys(), ...linkedArrestByCaseHeadMap.keys()
    ])].sort();

    // PCR_CALL and MISSING record types have no local_head field at all, so they're excluded
    // entirely rather than shown as an always-blank column.
    const rows = crimeHeads.map(head => {
      const linkedArrests = linkedArrestByCaseHeadMap.get(head) || 0;
      const kalandraArrests = kalandraMap.get(head) || 0;
      return {
        crime_head: head,
        FIR: firMap.get(head) || 0,
        Arrest: linkedArrests + kalandraArrests, // total arrests: against-FIR + Kalandra combined
        Kalandra: kalandraArrests,
        UIDB: uidbMap.get(head) || 0,
        Workout: null
      };
    });

    return res.status(200).json({
      success: true,
      data: { period, columns: ['FIR', 'Arrest', 'Kalandra', 'UIDB', 'Workout'], rows }
    });
  } catch (error) {
    return res.status(500).json({ success: false, message: error.message });
  }
};

// ── HC Dashboard v2: case_status breakdown, driven live by field_registry options ────────

export const getCaseStatusBreakdown = async (req, res) => {
  const jq = req.jurisdictionQuery;
  const period = ['day', 'week', 'month'].includes(req.query.period) ? req.query.period : 'day';
  try {
    const { currentStart, currentEnd } = getDateRangeForPeriod(period);

    const fieldRow = await db('field_registry')
      .where({ field_key: 'case_status', is_active: true })
      .whereRaw(`applicable_record_types::text LIKE '%CASE%'`)
      .first();
    const options = parseJsonField(fieldRow?.options) || [];

    let query = db('records')
      .select(db.raw(`${jsonbPath('data', 'case_status')} as case_status`))
      .count('* as count')
      .where('record_type', 'CASE')
      .whereBetween('record_date', [currentStart, currentEnd]);
    query = applyJurisdictionScope(query, jq);
    const rows = await query.groupBy(db.raw(jsonbPath('data', 'case_status')));
    const countByStatus = new Map(rows.map(r => [r.case_status, parseInt(r.count, 10) || 0]));

    const data = options.map(opt => ({
      status: opt.value,
      label: opt.label_en,
      count: countByStatus.get(String(opt.value)) || 0
    }));

    return res.status(200).json({ success: true, data: { period, rows: data } });
  } catch (error) {
    return res.status(500).json({ success: false, message: error.message });
  }
};

// ── HQ Dashboard: crime-head year-over-year trend chart, combined across all districts ───
// Duration options (how many prior years to plot) come from filter_presets rows with
// scope='HQ_DURATION' (seeded in backend/seeds/05_duration_presets.js) — never hardcoded here.

const shiftDateByYears = (dateStr, delta) => {
  const [y, m, d] = dateStr.split('-').map(Number);
  return toISODate(new Date(y + delta, m - 1, d));
};

// Normalizes a crime-head string for matching against excel_heinous_offences: expands the
// "Att."/"Kid." abbreviations already used consistently throughout the local_head/crime_head
// option list (e.g. "Att. to Murder" -> "attempt to murder"), so it lines up with the
// unabbreviated wording used in the heinous-offences reference table.
const normalizeForHeinousMatch = (s) => (s || '')
  .replace(/\bAtt\.\s*/gi, 'Attempt ')
  .replace(/\bKid\.\s*/gi, 'Kidnapping ')
  .replace(/\s+/g, ' ')
  .trim()
  .toLowerCase();

export const getCrimeHeadYearTrend = async (req, res) => {
  const jq = req.jurisdictionQuery;
  const { durationPresetId, dateFrom, dateTo } = req.query;

  try {
    const presetId = durationPresetId || 'hq_dur_1_current_year';
    const presetRow = await db('filter_presets')
      .where({ scope: 'HQ_DURATION', is_active: true, id: presetId })
      .first();

    let yearsBack = 0;
    if (presetRow) {
      const spec = parseJsonField(presetRow.filter_spec);
      yearsBack = parseInt(spec?.conditions?.[0]?.value, 10) || 0;
    }

    const today = new Date();
    const currentStart = dateFrom || `${today.getFullYear()}-01-01`;
    const currentEnd = dateTo || toISODate(today);

    // One line per year: current year + yearsBack previous years, each covering the same
    // month/day span so year-over-year comparisons stay apples-to-apples.
    const yearWindows = [];
    for (let offset = 0; offset <= yearsBack; offset++) {
      yearWindows.push({
        year: today.getFullYear() - offset,
        start: shiftDateByYears(currentStart, -offset),
        end: shiftDateByYears(currentEnd, -offset)
      });
    }
    const overallStart = yearWindows.reduce((min, w) => (w.start < min ? w.start : min), yearWindows[0].start);
    const overallEnd = yearWindows.reduce((max, w) => (w.end > max ? w.end : max), yearWindows[0].end);

    // Crime-head categories are DB-driven (field_registry), same zero-fill pattern as getCaseStatusBreakdown,
    // so crime heads with no records in range still appear as X-axis ticks.
    const fieldRow = await db('field_registry').where({ field_key: 'local_head', is_active: true }).first();
    const crimeHeadOptions = parseJsonField(fieldRow?.options) || [];

    // Heinous classification is DB-driven from excel_heinous_offences, not a hardcoded list —
    // updating that table changes which crime heads land in the Heinous chart, no code change needed.
    const heinousOffenceRows = await db('excel_heinous_offences').select('heinous_offence');
    const heinousNormalizedSet = new Set(heinousOffenceRows.map(r => normalizeForHeinousMatch(r.heinous_offence)));

    let pivotQuery = db('records')
      .select('record_date', db.raw(`COALESCE(${jsonbPath('data', 'local_head')}, ${jsonbPath('data', 'crime_head')}) as crime_head`))
      .whereIn('record_type', ['CASE', 'ARREST', 'UIDB'])
      .whereBetween('record_date', [overallStart, overallEnd]);
    pivotQuery = applyJurisdictionScope(pivotQuery, jq);
    const pivotRows = await pivotQuery;

    const countMap = new Map(yearWindows.map(w => [w.year, new Map()]));
    pivotRows.forEach(r => {
      if (!r.crime_head) return;
      const dateStr = toISODate(new Date(r.record_date));
      const window = yearWindows.find(w => dateStr >= w.start && dateStr <= w.end);
      if (!window) return;
      const m = countMap.get(window.year);
      m.set(r.crime_head, (m.get(r.crime_head) || 0) + 1);
    });

    const years = yearWindows.map(w => w.year);
    const rows = crimeHeadOptions.map(opt => {
      const row = {
        crime_head: opt.value,
        is_heinous: heinousNormalizedSet.has(normalizeForHeinousMatch(opt.value))
      };
      years.forEach(y => { row[y] = countMap.get(y).get(opt.value) || 0; });
      return row;
    });

    // Change-rate is always current-period vs the immediately preceding equal-length period,
    // regardless of how many yearWindows are actually plotted (even for a single-line "Current Year" view).
    const previousStart = shiftDateByYears(currentStart, -1);
    const previousEnd = shiftDateByYears(currentEnd, -1);
    const [currentTotal, previousTotal] = await Promise.all([
      countRecordsByTypes(jq, ['CASE', 'ARREST', 'UIDB'], currentStart, currentEnd),
      countRecordsByTypes(jq, ['CASE', 'ARREST', 'UIDB'], previousStart, previousEnd)
    ]);

    return res.status(200).json({
      success: true,
      data: {
        duration_preset_id: presetRow?.id || null,
        years,
        rows,
        change_rate: {
          current_range: { from: currentStart, to: currentEnd },
          previous_range: { from: previousStart, to: previousEnd },
          current_total: currentTotal,
          previous_total: previousTotal,
          pct_change: pctChange(currentTotal, previousTotal)
        }
      }
    });
  } catch (error) {
    return res.status(500).json({ success: false, message: error.message });
  }
};


