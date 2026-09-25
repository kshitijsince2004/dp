import { v4 as uuidv4 } from 'uuid';
import fs from 'fs';
import path from 'path';
import { execFile } from 'child_process';
import util from 'util';
import ExcelJS from 'exceljs';
import db from '../../config/db.js';
import { publish } from '../../events/eventBus.js';
import { logger } from '../../utils/logger.js';
import { toDMY } from '../../utils/dateFormat.js';

const execFileAsync = util.promisify(execFile);

const isUUID = s => typeof s === 'string' && /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(s);

// ─── Preview ─────────────────────────────────────────────────────────────────
export const getDailyDiaryPreview = async (userOrOptions, dateArg, psIdArg, districtIdArg, subDivIdArg, dateToArg) => {
  let user, date, dateTo, psId, districtId, subDivId;
  if (typeof userOrOptions === 'object' && userOrOptions !== null && (userOrOptions.date || userOrOptions.policeStationId || userOrOptions.psId || userOrOptions.districtId)) {
    ({ user, date, dateTo, psId, policeStationId: psId, districtId, subDivId } = userOrOptions);
  } else {
    user = userOrOptions;
    date = dateArg;
    psId = psIdArg;
    districtId = districtIdArg;
    subDivId = subDivIdArg;
    dateTo = dateToArg;
  }

  let q = db('records as r')
    .leftJoin('fir_details as fd', 'r.id', 'fd.record_id')
    .leftJoin('hierarchy_nodes as ps', 'r.ps_id', 'ps.id')
    .leftJoin('hierarchy_nodes as dist', 'r.district_id', 'dist.id')
    .whereNot('r.current_status', 'DELETED');

  if (date && dateTo && date !== dateTo) {
    q = q.whereRaw("COALESCE(r.registration_date, fd.fir_date, r.record_date)::date BETWEEN ?::date AND ?::date", [date, dateTo]);
  } else if (date) {
    q = q.whereRaw("COALESCE(r.registration_date, fd.fir_date, r.record_date)::date = ?::date", [date]);
  }

  if (psId && psId !== 'ALL' && psId !== 'ALL_STATIONS') {
    if (isUUID(psId)) q = q.where('r.ps_id', psId);
    else q = q.where(b => b.where('ps.code', psId).orWhere('ps.name', psId).orWhereRaw('LOWER(ps.name)=LOWER(?)',[psId]).orWhereRaw('LOWER(ps.name) LIKE LOWER(?)',[`%${psId}%`]));
  }
  if (districtId && districtId !== 'ALL' && districtId !== 'ALL_DISTRICTS') {
    if (isUUID(districtId)) q = q.where('r.district_id', districtId);
    else q = q.where(b => b.where('dist.code', districtId).orWhere('dist.name', districtId).orWhereRaw('LOWER(dist.name)=LOWER(?)',[districtId]).orWhereRaw('LOWER(dist.name) LIKE LOWER(?)',[`%${districtId}%`]));
  }
  if (subDivId) q = q.where('r.sub_div_id', subDivId);
  const rows = await q.select('r.record_type').count('* as count').groupBy('r.record_type');
  const counts = Object.fromEntries(rows.map(r => [r.record_type, Number(r.count)]));
  return { date, dateTo, counts };
};

// ─── Raw data for frontend preview ───────────────────────────────────────────
export const getDailyDiaryData = async (userOrOptions, dateArg, psIdArg, districtIdArg, subDivIdArg, tableNameArg, dateToArg) => {
  let user, date, dateTo, psId, districtId, subDivId, tableName;
  if (typeof userOrOptions === 'object' && userOrOptions !== null && (userOrOptions.date || userOrOptions.policeStationId || userOrOptions.psId || userOrOptions.districtId)) {
    ({ user, date, dateTo, psId, policeStationId: psId, districtId, subDivId, tableName } = userOrOptions);
  } else {
    user = userOrOptions;
    date = dateArg;
    psId = psIdArg;
    districtId = districtIdArg;
    subDivId = subDivIdArg;
    tableName = tableNameArg;
    dateTo = dateToArg;
  }

  return await fetchAllDiaryData(date, dateTo, psId, districtId, subDivId, tableName ? [tableName] : null);
};

// ─── Arrest scheme resolver ───────────────────────────────────────────────────
export const resolveArrestScheme = (d) => {
  if (!d) return '-';
  let s = d.scheme_of_arrest || d.arrest_scheme || d.scheme || '';
  if (s === 'Other' && d.scheme_of_arrest_other) s = d.scheme_of_arrest_other;
  if (!s) {
    const fl = [];
    if (d.integrated_pi) fl.push('Integrated Pride');
    if (d.group_patrolling) fl.push('Group Patrolling');
    if (d.cycle_patrolling) fl.push('Cycle Patrolling');
    if (d.by_antisnatching_team) fl.push('Anti-Snatching');
    if (d.by_prahari) fl.push('By Prahari');
    if (d.by_eyes_ears_scheme_members) fl.push('Eyes & Ears');
    s = fl.join(', ');
  }
  return s || '-';
};

// ─── Fetch All Diary Data Definition & Pipeline ─────────────────────────────
export const fetchAllDiaryData = async (date, dateTo, psId, districtId, subDivId, tableNamesFilter = null) => {
  const fmtD = (d) => d ? toDMY(String(d).substring(0, 10)) : '';
  const fmtDT = (dt) => {
    if (!dt) return '';
    const d = new Date(dt);
    if (isNaN(d.getTime())) return String(dt);
    const day = String(d.getUTCDate()).padStart(2, '0');
    const mo = String(d.getUTCMonth() + 1).padStart(2, '0');
    const yr = d.getUTCFullYear();
    const hh = String(d.getUTCHours()).padStart(2, '0');
    const mm = String(d.getUTCMinutes()).padStart(2, '0');
    return `${day}/${mo}/${yr}; ${hh}:${mm}`;
  };
  const fmtIO = (r) => {
    const parts = [r.io_rank, r.io_name, r.io_pis_no].map(s => (s || '').trim()).filter(Boolean);
    return parts.join(', ') || '-';
  };
  const fmtLoc = (r, px) => {
    const f = k => (r[px + '_' + k] || '').trim();
    const parts = [f('house_no'), f('street'), f('colony'), f('city'), f('tehsil'), f('district')].filter(Boolean);
    return parts.join(', ') || '-';
  };

  const fmtP = (p, includeAge = false) => {
    if (!p) return '-';
    let name = (p.name || '').trim();
    if (!name) return '-';

    let nickNames = p.nick_names || [];
    if (typeof nickNames === 'string') {
      try { nickNames = JSON.parse(nickNames); } catch (e) { nickNames = nickNames ? [nickNames] : []; }
    }
    if (Array.isArray(nickNames) && nickNames.length > 0) {
      const aliasStr = nickNames.map(s => String(s).trim()).filter(Boolean).join(' / ');
      if (aliasStr && !name.toLowerCase().includes(aliasStr.toLowerCase())) {
        name = `${name} @${aliasStr}`;
      }
    }

    const headParts = [name];
    if (includeAge && p.age !== undefined && p.age !== null) {
      headParts.push(String(p.age).trim());
    }
    const headStr = headParts.join(', ');

    let relLabel = 'S/O';
    const relType = (p.relation_type || '').toLowerCase();
    const gender = (p.gender || '').toLowerCase();
    if (relType === 'husband' || relType === 'w/o' || relType === 'wife') relLabel = 'W/O';
    else if (relType === 'father' || relType === 'd/o' || relType === 'daughter') relLabel = (gender === 'female' ? 'D/O' : 'S/O');
    else if (relType === 'mother') relLabel = 'S/O';
    else if (relType === 'guardian' || relType === 'c/o') relLabel = 'C/O';
    else if (gender === 'female') relLabel = 'D/O';

    const relStr = p.relative_name ? `${relLabel} ${p.relative_name.trim()}` : '';
    const roStr = p.address ? `R/O ${p.address.trim()}` : '';
    const bodyStr = [relStr, roStr].filter(Boolean).join(' ');

    if (headStr && bodyStr) return `${headStr}, ${bodyStr}`;
    return headStr || bodyStr || '-';
  };

  const fmtBody = (p) => {
    if (!p) return '';
    const ex = (typeof p.extra === 'object' && p.extra) ? p.extra : {};
    return [
      ex.height ? 'Ht: ' + ex.height : '',
      ex.built  ? 'Built: ' + ex.built : '',
      ex.complexion ? 'Comp: ' + ex.complexion : '',
      ex.hair ? 'Hair: ' + ex.hair : '',
      ex.dress ? 'Dress: ' + ex.dress : '',
      ex.identification_marks ? 'ID: ' + ex.identification_marks : '',
    ].filter(Boolean).join(', ') || '-';
  };

  const fmtCust = (s) => {
    if (!s) return '-';
    const str = String(s).trim().toLowerCase();
    const map = {
      'jc': 'Judicial Custody',
      'j/c': 'Judicial Custody',
      'judicial custody': 'Judicial Custody',
      'pc': 'Police Custody',
      'p/c': 'Police Custody',
      'police custody': 'Police Custody',
      'bail': 'Bail',
      'bound down': 'Bound Down',
      'release': 'Released',
      'released': 'Released',
      'lockup': 'Lockup',
      '35(1)': 'Notice 35(1) BNSS',
      '35(3)': 'Notice 35(1) BNSS',
      'apprehension': 'Apprehended',
      'apprehended': 'Apprehended'
    };
    if (str.includes('35')) return 'Notice 35(1) BNSS';
    return map[str] || s;
  };

  const isTruthyVal = (val) => {
    if (val === true) return true;
    if (val === false || val === null || val === undefined || val === '') return false;
    if (typeof val === 'number') return val > 0;
    const s = String(val).trim().toLowerCase();
    return ['yes', 'true', '1', 'y', 't'].includes(s);
  };

  const formatAccusedHistory = (p, r = {}) => {
    const pObj = p || {};
    const pEx = (typeof pObj.extra === 'object' && pObj.extra) ? pObj.extra : {};
    const ardEx = (typeof pObj.ard_extra === 'object' && pObj.ard_extra) ? pObj.ard_extra : {};
    const rEx = (typeof r.ad_extra === 'object' && r.ad_extra) ? r.ad_extra : ((typeof r.extra === 'object' && r.extra) ? r.extra : {});

    const piCount = pObj.prev_involvement_count ?? pEx.prev_involvement_count ?? pEx.prev_involvement_no_of_cases ?? ardEx.prev_involvement_count ?? rEx.prev_involvement_count ?? rEx.prev_involvement_no_of_cases ?? 0;
    const piFlag = isTruthyVal(pObj.prev_involvement) ||
      isTruthyVal(pObj.previous_involvement) ||
      isTruthyVal(pObj.pi_flag) ||
      isTruthyVal(pEx.prev_involvement) ||
      isTruthyVal(pEx.previous_involvement) ||
      isTruthyVal(pEx.pi_flag) ||
      isTruthyVal(ardEx.prev_involvement) ||
      isTruthyVal(rEx.prev_involvement) ||
      isTruthyVal(rEx.previous_involvement) ||
      isTruthyVal(rEx.pi_flag) ||
      isTruthyVal(r.integrated_pi) ||
      (Number(piCount) > 0);
    const poFlag = isTruthyVal(pObj.is_po) ||
      isTruthyVal(pObj.proclaimed_offender) ||
      isTruthyVal(pObj.po_flag) ||
      isTruthyVal(pEx.is_po) ||
      isTruthyVal(pEx.proclaimed_offender) ||
      isTruthyVal(pEx.po_flag) ||
      isTruthyVal(ardEx.is_po) ||
      isTruthyVal(rEx.is_po) ||
      isTruthyVal(rEx.proclaimed_offender) ||
      isTruthyVal(rEx.po_flag) ||
      isTruthyVal(r.is_po) ||
      isTruthyVal(r.proclaimed_offender);
    const bcFlag = isTruthyVal(pObj.is_bc) ||
      isTruthyVal(pObj.bad_character) ||
      isTruthyVal(pObj.bc_flag) ||
      isTruthyVal(pObj.listed_criminal) ||
      isTruthyVal(pObj.whether_accused_is_bc_or_not) ||
      isTruthyVal(pEx.is_bc) ||
      isTruthyVal(pEx.bad_character) ||
      isTruthyVal(pEx.bc_flag) ||
      isTruthyVal(pEx.listed_criminal) ||
      isTruthyVal(pEx.whether_accused_is_bc_or_not) ||
      isTruthyVal(ardEx.is_bc) ||
      isTruthyVal(rEx.is_bc) ||
      isTruthyVal(rEx.bad_character) ||
      isTruthyVal(rEx.bc_flag) ||
      isTruthyVal(rEx.listed_criminal) ||
      isTruthyVal(rEx.whether_accused_is_bc_or_not) ||
      isTruthyVal(r.is_bc) ||
      isTruthyVal(r.bad_character) ||
      isTruthyVal(r.listed_criminal);

    const parts = [];
    if (piFlag) parts.push('PI');
    if (poFlag) parts.push('PO');
    if (bcFlag) parts.push('BC');

    return parts.join('/') || '-';
  };

  const applyScope = (qb) => {
    if (psId && psId !== 'ALL' && psId !== 'ALL_STATIONS') {
      if (isUUID(psId)) qb.where('r.ps_id', psId);
      else qb.where(b => b.where('ps.code', psId).orWhere('ps.name', psId).orWhereRaw('LOWER(ps.name)=LOWER(?)',[psId]).orWhereRaw('LOWER(ps.name) LIKE LOWER(?)',[`%${psId}%`]));
    }
    if (districtId && districtId !== 'ALL' && districtId !== 'ALL_DISTRICTS') {
      if (isUUID(districtId)) qb.where('r.district_id', districtId);
      else qb.where(b => b.where('dist.code', districtId).orWhere('dist.name', districtId).orWhereRaw('LOWER(dist.name)=LOWER(?)',[districtId]).orWhereRaw('LOWER(dist.name) LIKE LOWER(?)',[`%${districtId}%`]));
    }
    if (subDivId) qb.where('r.sub_div_id', subDivId);
  };
  const applyDate = (qb, col) => {
    if (date && dateTo && date !== dateTo) {
      qb.whereRaw(`(${col})::date BETWEEN ?::date AND ?::date`, [date, dateTo]);
    } else if (date) {
      qb.whereRaw(`(${col})::date = ?::date`, [date]);
    }
  };

  const caseRows = await db('records as r')
    .join('fir_details as fd', 'r.id', 'fd.record_id')
    .leftJoin('hierarchy_nodes as ps',   'r.ps_id',       'ps.id')
    .leftJoin('hierarchy_nodes as dist', 'r.district_id', 'dist.id')
    .leftJoin('investigating_officers as io', 'r.io_id',  'io.id')
    .leftJoin('ref.local_heads as lh',   'fd.local_head_id', 'lh.local_head_cd')
    .leftJoin('locations as occ',        'fd.occurrence_location_id', 'occ.id')
    .leftJoin('ref.beats as bt',         'fd.beat_id',    'bt.beat_cd')
    .whereNot('r.current_status', 'DELETED')
    .where('r.record_type', 'CASE')
    .modify(qb => { applyDate(qb, "COALESCE(r.registration_date, fd.fir_date, r.record_date)"); applyScope(qb); })
    .select(
      'r.id', 'r.record_date', 'r.registration_date', 'r.current_status',
      'ps.name as ps_name', 'dist.name as dist_name',
      'io.name as io_name', 'io.rank as io_rank', 'io.pis_no as io_pis_no', 'io.mobile as io_mobile',
      'fd.fir_no', 'fd.fir_date', 'fd.gd_no', 'fd.gd_date',
      'fd.case_type', 'fd.registration_type', 'fd.brief_facts', 'fd.disposal_type', 'fd.rc_no',
      'fd.occurrence_from_datetime', 'fd.cd_uploaded_24h', 'fd.footage_collected', 'fd.extra as fd_extra',
      'lh.local_head as crime_head',
      'occ.house_no as occ_house_no', 'occ.street as occ_street', 'occ.colony as occ_colony',
      'occ.city_town_village as occ_city', 'occ.tehsil_block_mandal as occ_tehsil', 'occ.district as occ_district',
      db.raw("COALESCE(bt.beat_name, bt.beat_cd, '') as beat_no")
    ).orderBy('r.record_date', 'desc').limit(5000);

  const arrRows = await db('records as r')
    .join('arrest_details as ad', 'r.id', 'ad.record_id')
    .leftJoin('hierarchy_nodes as ps',   'r.ps_id',       'ps.id')
    .leftJoin('hierarchy_nodes as dist', 'r.district_id', 'dist.id')
    .leftJoin('investigating_officers as io', 'r.io_id',  'io.id')
    .leftJoin('ref.local_heads as lh',   'ad.local_head_id', 'lh.local_head_cd')
    .whereNot('r.current_status', 'DELETED')
    .where('r.record_type', 'ARREST')
    .modify(qb => { applyDate(qb, "COALESCE(ad.gd_date, r.registration_date, ad.fir_date, r.record_date)"); applyScope(qb); })
    .select(
      'r.id', 'r.record_date', 'r.current_status',
      'ps.name as ps_name', 'dist.name as dist_name',
      'io.name as io_name', 'io.rank as io_rank', 'io.pis_no as io_pis_no', 'io.mobile as io_mobile',
      'ad.gd_no', 'ad.fir_no', 'ad.fir_date', 'ad.gd_date', 'ad.case_type', 'ad.is_dd_based', 'ad.custody_status',
      'ad.recovery', 'ad.scheme_of_arrest', 'ad.scheme_of_arrest_other',
      'ad.integrated_pi', 'ad.group_patrolling', 'ad.cycle_patrolling',
      'ad.by_antisnatching_team', 'ad.by_prahari', 'ad.by_eyes_ears_scheme_members',
      'ad.nafis_prepared', 'ad.dossier_prepared', 'ad.extra as ad_extra', 'lh.local_head as crime_head'
    ).orderBy('r.record_date', 'desc').limit(5000);

  const missRows = await db('records as r')
    .join('missing_details as md', 'r.id', 'md.record_id')
    .leftJoin('hierarchy_nodes as ps', 'r.ps_id', 'ps.id')
    .leftJoin('investigating_officers as io', 'r.io_id', 'io.id')
    .whereNot('r.current_status', 'DELETED')
    .where('r.record_type', 'MISSING')
    .modify(qb => { applyDate(qb, "COALESCE(md.gd_date, r.registration_date, r.record_date)"); applyScope(qb); })
    .select(
      'r.id', 'r.record_date', 'r.current_status', 'ps.name as ps_name',
      'io.name as io_name', 'io.rank as io_rank', 'io.pis_no as io_pis_no',
      'md.gd_no', 'md.gd_date', 'md.missing_type', 'md.missing_status', 'md.operator_name', 'md.remarks'
    ).orderBy('r.record_date', 'desc').limit(5000);

  const uiRows = await db('records as r')
    .join('uidb_details as ud', 'r.id', 'ud.record_id')
    .leftJoin('hierarchy_nodes as ps', 'r.ps_id', 'ps.id')
    .leftJoin('investigating_officers as io', 'r.io_id', 'io.id')
    .leftJoin('locations as floc', 'ud.found_location_id', 'floc.id')
    .whereNot('r.current_status', 'DELETED')
    .where('r.record_type', 'UIDB')
    .modify(qb => { applyDate(qb, "COALESCE(ud.gd_date, ud.found_date, r.registration_date, r.record_date)"); applyScope(qb); })
    .select(
      'r.id', 'r.record_date', 'r.current_status', 'ps.name as ps_name',
      'io.name as io_name', 'io.rank as io_rank', 'io.pis_no as io_pis_no',
      'ud.uidb_no', 'ud.gd_no', 'ud.gd_date', 'ud.found_date',
      'ud.inquest_sections', 'ud.cause_of_death', 'ud.cause_of_death_other',
      'ud.inquest_status', 'ud.filed_by_acp_sdm', 'ud.filed_by_acp_sdm_date',
      'ud.mortuary_remarks',
      'floc.house_no as floc_house_no', 'floc.street as floc_street', 'floc.colony as floc_colony',
      'floc.city_town_village as floc_city', 'floc.tehsil_block_mandal as floc_tehsil', 'floc.district as floc_district'
    ).orderBy('r.record_date', 'desc').limit(5000);

  const allIds = [...caseRows, ...arrRows, ...missRows, ...uiRows].map(r => r.id);
  const PR = {};
  if (allIds.length > 0) {
    const pRows = await db('persons as p')
      .leftJoin('locations as pl', 'p.present_location_id', 'pl.id')
      .leftJoin('locations as pml', 'p.perm_location_id', 'pml.id')
      .leftJoin('arrestee_details as ard', 'ard.person_id', 'p.id')
      .leftJoin('locations as al', 'ard.arrest_location_id', 'al.id')
      .whereIn('p.record_id', allIds)
      .select(
        'p.id', 'p.record_id', 'p.role', 'p.name', 'p.relative_name', 'p.relation_type', 'p.gender', 'p.age', 'p.nick_names', 'p.mobile', 'p.extra',
        'ard.is_bc', 'ard.is_po', 'ard.prev_involvement', 'ard.prev_involvement_count',
        db.raw(`COALESCE(
          NULLIF(TRIM(pl.full_address), ''),
          NULLIF(TRIM(CONCAT_WS(', ', NULLIF(pl.house_no, ''), NULLIF(pl.street, ''), NULLIF(pl.colony, ''), NULLIF(pl.city_town_village, ''), NULLIF(pl.district, ''))), ''),
          NULLIF(TRIM(pml.full_address), ''),
          NULLIF(TRIM(CONCAT_WS(', ', NULLIF(pml.house_no, ''), NULLIF(pml.street, ''), NULLIF(pml.colony, ''), NULLIF(pml.city_town_village, ''), NULLIF(pml.district, ''))), '')
        ) as address`),
        db.raw(`COALESCE(
          NULLIF(TRIM(al.full_address), ''),
          NULLIF(TRIM(CONCAT_WS(', ', NULLIF(al.house_no, ''), NULLIF(al.street, ''), NULLIF(al.colony, ''), NULLIF(al.city_town_village, ''), NULLIF(al.district, ''))), '')
        ) as arrest_address`)
      );
    for (const p of pRows) {
      if (!PR[p.record_id]) PR[p.record_id] = {};
      if (!PR[p.record_id][p.role]) PR[p.record_id][p.role] = p;
    }
  }

  const getP = (recId, role) => {
    const rec = PR[recId];
    if (!rec) return null;
    if (role === 'ARRESTEE') return rec['ARRESTEE'] || rec['ACCUSED'] || null;
    if (role === 'ACCUSED') return rec['ACCUSED'] || rec['ARRESTEE'] || null;
    if (role === 'MISSING') return rec['MISSING'] || rec['FOUND'] || null;
    return rec[role] || null;
  };

  const formatActSections = (offences) => {
    if (!Array.isArray(offences) || offences.length === 0) return '-';
    const actMap = new Map();
    for (const o of offences) {
      let rawAct = (o.act_long || o.act_name || o.act || o.other_act_name || '').trim();
      let rawSec = (o.section || o.act_sec_cd || o.section_label || '').trim();
      if (!rawAct && !rawSec) continue;

      let act = rawAct;
      if (/penal code|ipc/i.test(act)) act = 'IPC';
      else if (/nyaya sanhita|\bbns\b/i.test(act)) act = 'BNS';
      else if (/nagarik suraksha|\bbnss\b/i.test(act)) act = 'BNSS';
      else if (/arms/i.test(act)) act = 'Arms Act';
      else if (/excise/i.test(act)) act = 'Delhi Excise Act';
      else if (/delhi police|\bdp act\b/i.test(act)) act = 'DP Act';
      else if (/narcotic|ndps/i.test(act)) act = 'NDPS Act';
      else if (/information technology|\bit act\b/i.test(act)) act = 'IT Act';
      else if (/gambling/i.test(act)) act = 'Gambling Act';
      else if (/motor vehicle|\bmv act\b/i.test(act)) act = 'MV Act';
      else if (/pocso/i.test(act)) act = 'POCSO Act';
      else if (act) act = act.replace(/^THE\s+/i, '').replace(/,\s*\d{4}$/, '').trim();

      if (!act) act = 'U/S';

      let sec = rawSec.replace(/^u\/s\s+/i, '').replace(/^sec(tion)?\.?\s*/i, '').trim();
      if (act && act !== 'U/S') {
        const re = new RegExp(`\\b${act.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}\\b`, 'gi');
        sec = sec.replace(re, '').trim();
      }
      sec = sec.replace(/^u\/s\s+/i, '').trim();

      if (!actMap.has(act)) actMap.set(act, new Set());
      if (sec) actMap.get(act).add(sec);
    }

    if (actMap.size === 0) return '-';
    const actStrings = [];
    for (const [actName, secSet] of actMap.entries()) {
      const secArray = Array.from(secSet).filter(Boolean);
      if (secArray.length > 0) {
        actStrings.push(`${actName} ${secArray.join('/')}`);
      } else {
        actStrings.push(actName);
      }
    }
    return actStrings.join(', ');
  };

  const OR = {};
  if (allIds.length > 0) {
    try {
      const oRows = await db('record_offences as ro')
        .leftJoin('ref.sections as s', 'ro.section_id', 's.act_sec_cd')
        .leftJoin('ref.acts as a', db.raw('ro.act_id::text'), db.raw('a.act_cd::text'))
        .whereIn('ro.record_id', allIds)
        .select('ro.record_id', 'ro.other_act_name', 's.section', 's.act_sec_cd', 'a.act_long')
        .orderBy('ro.is_primary', 'desc');
      for (const o of oRows) {
        if (!OR[o.record_id]) OR[o.record_id] = [];
        OR[o.record_id].push(o);
      }
    } catch (e) { logger.warn('[DailyDiary] Offences join failed:', e.message); }
  }
  const getUS = id => formatActSections(OR[id]);

  const PROP = {};
  if (allIds.length > 0) {
    try {
      const propRows = await db('record_properties')
        .whereIn('record_id', allIds)
        .orderBy('sort_order', 'asc');
      for (const p of propRows) {
        if (!PROP[p.record_id]) PROP[p.record_id] = [];
        PROP[p.record_id].push(p);
      }
    } catch (e) { logger.warn('[DailyDiary] Properties join failed:', e.message); }
  }

  const getVehicleDetails = (r) => {
    const props = PROP[r.id] || [];
    const vehProp = props.find(p => p.vehicle_no || p.vehicle_make || p.vehicle_model || (p.extra && (p.extra.vehicle_no || p.extra.vehicle_type)));
    const ex = (typeof r.fd_extra === 'object' && r.fd_extra) ? r.fd_extra : {};
    
    const vNo = vehProp?.vehicle_no || vehProp?.extra?.vehicle_no || ex.vehicle_no || '';
    const vType = vehProp?.extra?.vehicle_type || vehProp?.vehicle_make || ex.vehicle_type || ex.vehicle_make || '';
    const vModel = vehProp?.vehicle_model || ex.vehicle_model || '';
    
    const parts = [];
    if (vType) parts.push(vType);
    if (vModel && vModel !== vType) parts.push(vModel);
    if (vNo) parts.push(vNo);
    
    if (parts.length > 0) return parts.join(' / ');
    if (ex.vehicle_details) return ex.vehicle_details;
    if (ex.stolen_property) return ex.stolen_property;
    return '-';
  };

  const getStolenPropertyDetails = (r) => {
    const props = PROP[r.id] || [];
    const propParts = [];
    
    for (const p of props) {
      const itemParts = [];
      if (p.vehicle_no || p.vehicle_make) {
        itemParts.push([p.vehicle_type || p.vehicle_make, p.vehicle_model, p.vehicle_no].filter(Boolean).join(' '));
      }
      if (p.phone_imei || p.phone_make) {
        itemParts.push([p.phone_make, p.phone_model, p.phone_imei ? `IMEI: ${p.phone_imei}` : ''].filter(Boolean).join(' '));
      }
      if (p.estimated_value) {
        itemParts.push(`Val: Rs. ${p.estimated_value}`);
      }
      const ex = (typeof p.extra === 'object' && p.extra) ? p.extra : {};
      for (const [k, v] of Object.entries(ex)) {
        if (v && typeof v !== 'object' && !['vehicle_no', 'vehicle_make', 'vehicle_type', 'phone_imei'].includes(k)) {
          itemParts.push(`${k}: ${v}`);
        }
      }
      if (itemParts.length > 0) propParts.push(itemParts.join(', '));
    }
    
    const exFd = (typeof r.fd_extra === 'object' && r.fd_extra) ? r.fd_extra : {};
    if (exFd.stolen_property) propParts.push(exFd.stolen_property);
    if (r.brief_facts && propParts.length === 0) return r.brief_facts;
    return propParts.join('; ') || '-';
  };

  const MANUAL_REG = new Set(['MANUAL_CCTNS', 'ZERO_FIR', 'NCRP']);
  const isManual = r => MANUAL_REG.has(r.registration_type) || ['cctns(manual fir)','zero fir','ncrp'].includes((r.case_type||'').toLowerCase());
  const isETheft = r => r.registration_type === 'E_THEFT' || ['etheft', 'e_theft', 'e-theft'].some(k => (r.case_type||'').toLowerCase().includes(k));
  const isEMVT   = r => r.registration_type === 'E_MVT'   || ['emvt', 'e_mvt', 'e-mvt'].some(k => (r.case_type||'').toLowerCase().includes(k));
  const isLast24HoursArrest = (r, targetDate) => {
    if (!targetDate) return true;
    const targetStr = String(targetDate).substring(0, 10);
    const recDate = r.gd_date || r.fir_date || r.record_date;
    if (!recDate) return true;
    const rStr = typeof recDate === 'string' ? recDate.substring(0, 10) : recDate.toISOString().substring(0, 10);
    return rStr === targetStr;
  };
  const hasHead  = (r, kw) => (r.crime_head||'').toLowerCase().includes(kw.toLowerCase());

  const DEFS = [
    { key:'manual_fir', excelKey:'excel_1manual_fir', label:'1. Manual FIR',
      hdrs:['Police Station','FIR No.','U/S (Act + Section)','Complainant (Name / S/O / R/O Address)','Date & Time of Occurrence','Place of Occurrence','Brief Facts / Gist of Case','Arrested Person (Name / Age / S/O / R/O Address)','Name of IO (Rank / Name / PIS No.)'],
      wds:[22,18,25,32,22,38,42,30,26],
      rawRows: () => caseRows.filter(r => isManual(r)||(!r.registration_type&&!isETheft(r)&&!isEMVT(r))),
      rows:() => caseRows.filter(r => isManual(r)||(!r.registration_type&&!isETheft(r)&&!isEMVT(r))).map(r =>
        [r.ps_name||'-', r.fir_no||r.gd_no||'-', getUS(r.id), fmtP(getP(r.id, 'COMPLAINANT'), false), fmtDT(r.occurrence_from_datetime), fmtLoc(r,'occ'), r.brief_facts||'-', fmtP(getP(r.id, 'ARRESTEE'), true), fmtIO(r)])
    },
    { key:'eburglary_cases', excelKey:'excel_2eburglary_cases', label:'2. E-Burglary Cases',
      hdrs:['Sr.','Police Station','E-FIR No.','U/S','Complainant','Date & Time of Occurrence','Stolen Property','Place of Occurrence','Name of IO','IO Mobile','Beat No.'],
      wds:[6,22,18,25,32,22,32,38,26,15,13],
      rawRows: () => caseRows.filter(r => hasHead(r,'burglary')),
      rows:() => caseRows.filter(r => hasHead(r,'burglary')).map((r,i) => {
        return [i+1,r.ps_name||'-',r.fir_no||r.gd_no||'-',getUS(r.id),fmtP(getP(r.id, 'COMPLAINANT'), false),fmtDT(r.occurrence_from_datetime),getStolenPropertyDetails(r),fmtLoc(r,'occ'),fmtIO(r),r.io_mobile||'-',r.beat_no||'-'];
      })
    },
    { key:'ehouse_theft_cases', excelKey:'excel_3ehouse_theft_cases', label:'3. E-House Theft Cases',
      hdrs:['Sr.','Police Station','E-FIR No.','U/S','Complainant','Place of Occurrence','Date & Time of Occurrence','Stolen Property','Name of IO','IO Mobile','Beat No.'],
      wds:[6,22,18,25,32,38,22,32,26,15,13],
      rawRows: () => caseRows.filter(r => hasHead(r,'house theft')||hasHead(r,'house-theft')),
      rows:() => caseRows.filter(r => hasHead(r,'house theft')||hasHead(r,'house-theft')).map((r,i) => {
        return [i+1,r.ps_name||'-',r.fir_no||r.gd_no||'-',getUS(r.id),fmtP(getP(r.id, 'COMPLAINANT'), false),fmtLoc(r,'occ'),fmtDT(r.occurrence_from_datetime),getStolenPropertyDetails(r),fmtIO(r),r.io_mobile||'-',r.beat_no||'-'];
      })
    },
    { key:'etheft_cases', excelKey:'excel_3a_etheft_cases', label:'3A. E-Theft Cases',
      hdrs:['Sr.','Police Station','E-FIR No.','U/S','Complainant','Place of Occurrence','Date & Time of Occurrence','Stolen Property','Name of IO','IO Mobile','Beat No.'],
      wds:[6,22,18,25,32,38,22,32,26,15,13],
      rawRows: () => caseRows.filter(r => isETheft(r)),
      rows:() => caseRows.filter(r => isETheft(r)).map((r,i) => {
        return [i+1,r.ps_name||'-',r.fir_no||r.gd_no||'-',getUS(r.id),fmtP(getP(r.id, 'COMPLAINANT'), false),fmtLoc(r,'occ'),fmtDT(r.occurrence_from_datetime),getStolenPropertyDetails(r),fmtIO(r),r.io_mobile||'-',r.beat_no||'-'];
      })
    },
    { key:'eother_theft_cases', excelKey:'excel_4eother_theft_cases', label:'4. E-Other Theft Cases',
      hdrs:['Sr.','Police Station','E-FIR No.','U/S','Complainant','Date & Time of Occurrence','Stolen Property','Place of Occurrence','Name of IO','IO Mobile','Beat No.'],
      wds:[6,22,18,25,32,22,32,38,26,15,13],
      rawRows: () => caseRows.filter(r => isETheft(r)&&!hasHead(r,'burglary')&&!hasHead(r,'house theft')&&!hasHead(r,'m.v.')&&!hasHead(r,'motor vehicle')),
      rows:() => caseRows.filter(r => isETheft(r)&&!hasHead(r,'burglary')&&!hasHead(r,'house theft')&&!hasHead(r,'m.v.')&&!hasHead(r,'motor vehicle')).map((r,i) => {
        return [i+1,r.ps_name||'-',r.fir_no||r.gd_no||'-',getUS(r.id),fmtP(getP(r.id, 'COMPLAINANT'), false),fmtDT(r.occurrence_from_datetime),getStolenPropertyDetails(r),fmtLoc(r,'occ'),fmtIO(r),r.io_mobile||'-',r.beat_no||'-'];
      })
    },
    { key:'mvt_cases', excelKey:'excel_5mvt_cases', label:'5. MVT Cases',
      hdrs:['Sr.','Police Station','FIR No.','U/S','Date & Time of Occurrence','Place of Occurrence','Complainant','Vehicle Details','Name of IO','IO Mobile','Beat No.'],
      wds:[6,22,18,25,22,38,32,22,26,15,13],
      rawRows: () => caseRows.filter(r => isManual(r) ? (hasHead(r,'m.v.')||hasHead(r,'motor vehicle')||hasHead(r,'mvt')) : (isEMVT(r)||hasHead(r,'m.v.')||hasHead(r,'motor vehicle')||hasHead(r,'mvt'))),
      rows:() => caseRows.filter(r => isManual(r) ? (hasHead(r,'m.v.')||hasHead(r,'motor vehicle')||hasHead(r,'mvt')) : (isEMVT(r)||hasHead(r,'m.v.')||hasHead(r,'motor vehicle')||hasHead(r,'mvt'))).map((r,i) => {
        return [i+1,r.ps_name||'-',r.fir_no||r.gd_no||'-',getUS(r.id),fmtDT(r.occurrence_from_datetime),fmtLoc(r,'occ'),fmtP(getP(r.id, 'COMPLAINANT'), false),getVehicleDetails(r),fmtIO(r),r.io_mobile||'-',r.beat_no||'-'];
      })
    },
    { key:'emvt_cases', excelKey:'excel_5a_emvt_cases', label:'5A. E-MVT Cases',
      hdrs:['Sr.','Police Station','FIR No.','U/S','Date & Time of Occurrence','Place of Occurrence','Complainant','Vehicle Details','Name of IO','IO Mobile','Beat No.'],
      wds:[6,22,18,25,22,38,32,22,26,15,13],
      rawRows: () => caseRows.filter(r => isEMVT(r)),
      rows:() => caseRows.filter(r => isEMVT(r)).map((r,i) => {
        return [i+1,r.ps_name||'-',r.fir_no||r.gd_no||'-',getUS(r.id),fmtDT(r.occurrence_from_datetime),fmtLoc(r,'occ'),fmtP(getP(r.id, 'COMPLAINANT'), false),getVehicleDetails(r),fmtIO(r),r.io_mobile||'-',r.beat_no||'-'];
      })
    },
    { key:'arrested_kalandara', excelKey:'excel_8arrested_kalandara', label:'6. Arrested-Kalandara Preven',
      hdrs:['S.N.','FIR No.','U/S','Accused (Name/Age/S-O/R-O Address)','Place of Occurrence','Name of IO','Custody Status','Accused History','Recovery','Arrest Scheme'],
      wds:[7,18,25,32,38,26,18,22,30,30],
      rawRows: () => arrRows.filter(r => (r.is_dd_based || ['kalandra','kalandara','preventive','107/151','110g','109'].some(k => (r.case_type||'').toLowerCase().includes(k))) && (!r.fir_no || r.fir_no === 'N/A' || r.fir_no.trim() === '')),
      rows:() => arrRows.filter(r => (r.is_dd_based || ['kalandra','kalandara','preventive','107/151','110g','109'].some(k => (r.case_type||'').toLowerCase().includes(k))) && (!r.fir_no || r.fir_no === 'N/A' || r.fir_no.trim() === '')).map((r,i) => {
        const arr = getP(r.id, 'ARRESTEE');
        const occPlace = arr?.arrest_address || arr?.address || fmtLoc(r,'occ') || '-';
        return [i+1,r.gd_no||r.fir_no||'-',getUS(r.id),fmtP(arr, true),occPlace,fmtIO(r),fmtCust(r.custody_status),formatAccusedHistory(arr, r),r.recovery||'-',resolveArrestScheme(r)];
      })
    },
    { key:'arrested_efir_theft', excelKey:'excel_9arrested_efir_theft', label:'7. Arrested-E-FIR Theft',
      hdrs:['S.N.','FIR No.','U/S','Accused (Name/Age/S-O/R-O Address)','Name of IO','Custody Status','Accused History','Recovery','Arrest Scheme'],
      wds:[7,18,25,32,26,18,22,30,30],
      rawRows: () => arrRows.filter(r => isETheft(r)),
      rows:() => arrRows.filter(r => isETheft(r)).map((r,i) => {
        const arr = getP(r.id, 'ARRESTEE');
        return [i+1,r.fir_no||r.gd_no||'-',getUS(r.id),fmtP(arr, true),fmtIO(r),fmtCust(r.custody_status),formatAccusedHistory(arr, r),r.recovery||'-',resolveArrestScheme(r)];
      })
    },
    { key:'arrested_district', excelKey:'excel_7arrested_east_district', label:'Arrested-District',
      hdrs:['S.N.','FIR No.','U/S','Accused (Name/Age/S-O/R-O Address)','Name of IO','Status','Accused History','Recovery','BC','Arrest Scheme'],
      wds:[7,18,25,32,26,18,18,32,10,26],
      rawRows: () => arrRows,
      rows:() => arrRows.map((r,i) => {
        const arr = getP(r.id, 'ARRESTEE');
        const bcVal = (isTruthyVal(arr?.is_bc) || isTruthyVal(arr?.bad_character) || isTruthyVal(r.is_bc) || isTruthyVal(r.bad_character) || isTruthyVal(r.bc_flag) || isTruthyVal(arr?.extra?.is_bc) || isTruthyVal(arr?.extra?.bad_character) || isTruthyVal(arr?.extra?.whether_accused_is_bc_or_not)) ? 'Yes' : 'No';
        return [i+1,r.fir_no||r.gd_no||'-',getUS(r.id),fmtP(arr, true),fmtIO(r),fmtCust(r.custody_status),formatAccusedHistory(arr, r),r.recovery||'-',bcVal,resolveArrestScheme(r)];
      })
    },
    { key:'arrested_efir_mv_theft', excelKey:'excel_10arrested_efir_mv_theft', label:'8. Arrested-E-FIR MV Theft',
      hdrs:['FIR No.','U/S','Accused (Name/Age/S-O/R-O Address)','Name of IO','Custody Status','Accused History','Recovery','Arrest Scheme'],
      wds:[18,25,32,26,18,22,30,30],
      rawRows: () => arrRows.filter(r => isEMVT(r)),
      rows:() => arrRows.filter(r => isEMVT(r)).map(r => {
        const arr = getP(r.id, 'ARRESTEE');
        return [r.fir_no||r.gd_no||'-',getUS(r.id),fmtP(arr, true),fmtIO(r),fmtCust(r.custody_status),formatAccusedHistory(arr, r),r.recovery||'-',resolveArrestScheme(r)];
      })
    },
    { key:'proclaimed_offenders', excelKey:'excel_11proclaimed_offenders', label:'9. Proclaimed Offenders',
      hdrs:['S. No.','Accused (Name/Age/S-O/R-O Address)','FIR No.','U/S','Police Station','Name of IO','IO Mobile','PO Declaration Date'],
      wds:[7,32,18,25,22,26,15,18],
      rawRows: () => arrRows.filter(r => {
        const arr = getP(r.id, 'ARRESTEE');
        const ex = arr?.extra || {};
        return Boolean(arr?.is_po || arr?.proclaimed_offender || ex.is_po || ex.proclaimed_offender || r.is_po || r.proclaimed_offender);
      }),
      rows:() => arrRows.filter(r => {
        const arr = getP(r.id, 'ARRESTEE');
        const ex = arr?.extra || {};
        return Boolean(arr?.is_po || arr?.proclaimed_offender || ex.is_po || ex.proclaimed_offender || r.is_po || r.proclaimed_offender);
      }).map((r,i) => {
        const arr = getP(r.id, 'ARRESTEE');
        return [i+1,fmtP(arr, true),r.fir_no||r.gd_no||'-',getUS(r.id),r.ps_name||'-',fmtIO(r),r.io_mobile||'-',fmtD(r.fir_date||r.record_date)];
      })
    },
    { key:'preventive_action', excelKey:'excel_12preventive_action', label:'10. Preventive Action',
      hdrs:['S. No.','Police Station','DD No. & Date','U/S','Accused (Name/Age/S-O/R-O Address)','Name of IO','Custody Status','Accused History'],
      wds:[7,22,20,25,32,26,18,22],
      rawRows: () => arrRows.filter(r => r.is_dd_based || ['kalandra','kalandara','preventive','107/151','110g','109'].some(k => (r.case_type||'').toLowerCase().includes(k)) || (!r.case_type && !r.fir_no)),
      rows:() => arrRows.filter(r => r.is_dd_based || ['kalandra','kalandara','preventive','107/151','110g','109'].some(k => (r.case_type||'').toLowerCase().includes(k)) || (!r.case_type && !r.fir_no)).map((r,i) => {
        const arr = getP(r.id, 'ARRESTEE');
        return [i+1,r.ps_name||'-',`${r.gd_no||r.fir_no||'-'} dt ${fmtD(r.gd_date||r.record_date)}`,getUS(r.id),fmtP(arr, true),fmtIO(r),fmtCust(r.custody_status),formatAccusedHistory(arr, r)];
      })
    },
    { key:'arrested_last_24hrs', excelKey:'excel_13arrested_24_hrs_list', label:'11. Arrested-Last 24 Hrs',
      hdrs:['S. No.','Accused (Name/Age/S-O/R-O Address)','FIR / DD No.','U/S','Police Station','Name of IO','IO Mobile','Status of arrest'],
      wds:[7,32,18,25,22,26,15,18],
      rawRows: () => arrRows.filter(r => isLast24HoursArrest(r, dateTo || date)),
      rows:() => arrRows.filter(r => isLast24HoursArrest(r, dateTo || date)).map((r,i) =>
        [i+1,fmtP(getP(r.id, 'ARRESTEE'), true),r.fir_no||r.gd_no||'-',getUS(r.id),r.ps_name||'-',fmtIO(r),r.io_mobile||'-',fmtCust(r.custody_status)])
    },
    { key:'pi_disposal_manual', excelKey:'excel_14pi_disposal_manual', label:'12. PI Disposal-Manual',
      hdrs:['S. No.','FIR No.','FIR Date','U/S','RC No.','Disposal'],
      wds:[7,18,16,25,15,30],
      rawRows: () => caseRows.filter(r => r.disposal_type&&(isManual(r)||(!r.registration_type&&!isETheft(r)&&!isEMVT(r)))),
      rows:() => caseRows.filter(r => r.disposal_type&&(isManual(r)||(!r.registration_type&&!isETheft(r)&&!isEMVT(r)))).map((r,i) =>
        [i+1,r.fir_no||r.gd_no||'-',fmtD(r.fir_date||r.record_date),getUS(r.id),r.rc_no||'-',r.disposal_type||'-'])
    },
    { key:'pi_disposal_etheft', excelKey:'excel_15pi_disposal_eproperty', label:'13. PI Disposal-E-Theft',
      hdrs:['S. No.','FIR No.','FIR Date','U/S','RC No.','Disposal'],
      wds:[7,18,16,25,15,30],
      rawRows: () => caseRows.filter(r => r.disposal_type&&isETheft(r)),
      rows:() => caseRows.filter(r => r.disposal_type&&isETheft(r)).map((r,i) =>
        [i+1,r.fir_no||r.gd_no||'-',fmtD(r.fir_date||r.record_date),getUS(r.id),r.rc_no||'-',r.disposal_type||'-'])
    },
    { key:'pi_disposal_emvt', excelKey:'excel_16pi_disposal_emvt', label:'14. PI Disposal-E-MVT',
      hdrs:['S. No.','FIR No.','FIR Date','U/S','RC No.','Disposal'],
      wds:[7,18,16,25,15,30],
      rawRows: () => caseRows.filter(r => r.disposal_type&&isEMVT(r)),
      rows:() => caseRows.filter(r => r.disposal_type&&isEMVT(r)).map((r,i) =>
        [i+1,r.fir_no||r.gd_no||'-',fmtD(r.fir_date||r.record_date),getUS(r.id),r.rc_no||'-',r.disposal_type||'-'])
    },
    { key:'missing_persons', excelKey:'excel_18missing_persons', label:'15. Missing Persons',
      hdrs:['S.No.','DD No.','DD Date','Operator (MPS)','Name of Missing Person','Address','Missing Date','Age','Body Description','Name of IO'],
      wds:[7,15,14,22,26,32,14,10,36,26],
      rawRows: () => missRows.filter(r => { const mt=(r.missing_type||'').toLowerCase(),ms=(r.missing_status||'').toLowerCase(); return mt==='missing'||ms==='missing'||(!mt&&ms!=='traced'); }),
      rows:() => missRows.filter(r => { const mt=(r.missing_type||'').toLowerCase(),ms=(r.missing_status||'').toLowerCase(); return mt==='missing'||ms==='missing'||(!mt&&ms!=='traced'); }).map((r,i) => {
        const mp=getP(r.id, 'MISSING');
        return [i+1,r.gd_no||'-',fmtD(r.gd_date||r.record_date),r.operator_name||'-',mp?.name||'-',mp?.address||'-',fmtD(r.gd_date||r.record_date),mp?.age||'-',fmtBody(mp),fmtIO(r)];
      })
    },
    { key:'uidb', excelKey:'excel_19uidb', label:'16. UIDB (Unidentified Bodies)',
      hdrs:['S.No.','DD No.','DD Date','Found Place','Found Date','Sex','Age','Body Description','Name of IO'],
      wds:[7,15,14,38,14,10,10,36,26],
      rawRows: () => uiRows,
      rows:() => uiRows.map((r,i) => { const dec=getP(r.id, 'DECEASED'); return [i+1,r.uidb_no||r.gd_no||'-',fmtD(r.gd_date||r.record_date),fmtLoc(r,'floc'),fmtD(r.found_date),dec?.gender||'-',dec?.age||'-',fmtBody(dec),fmtIO(r)]; })
    },
    { key:'abandoned_persons', excelKey:'excel_20abandoned_persons', label:'17. Abandoned Persons',
      hdrs:['S.No.','DD No.','Found Place','Found Date','Sex','Age','Body Description','Name of IO'],
      wds:[7,15,38,14,10,10,36,26],
      rawRows: () => missRows.filter(r => { const mt=(r.missing_type||'').toLowerCase(); return mt.includes('abandon')||mt.includes('found')||mt==='abandoned'; }),
      rows:() => missRows.filter(r => { const mt=(r.missing_type||'').toLowerCase(); return mt.includes('abandon')||mt.includes('found')||mt==='abandoned'; }).map((r,i) => {
        const mp=getP(r.id, 'MISSING')||getP(r.id, 'FOUND');
        return [i+1,r.gd_no||'-',mp?.address||'-',fmtD(r.gd_date||r.record_date),mp?.gender||'-',mp?.age||'-',fmtBody(mp),fmtIO(r)];
      })
    },
    { key:'traced_persons', excelKey:'excel_21traced_persons', label:'18. Traced Persons',
      hdrs:['S.No.','DD No.','DD Date','Operator (MPS)','Traced Person (Name/S-O/R-O Address)','Name of IO'],
      wds:[7,15,14,22,36,26],
      rawRows: () => missRows.filter(r => (r.missing_status||'').toLowerCase()==='traced'),
      rows:() => missRows.filter(r => (r.missing_status||'').toLowerCase()==='traced').map((r,i) => { const mp=getP(r.id, 'MISSING'); return [i+1,r.gd_no||'-',fmtD(r.gd_date||r.record_date),r.operator_name||'-',fmtP(mp, false),fmtIO(r)]; })
    },
    { key:'inquest_registered', excelKey:'excel_25inquest_registered', label:'19. Inquest Registered',
      hdrs:['S.N.','DD No.','DD Date','U/S','Deceased (Name/Age/S-O/R-O Address)','Sex','Cause of Death','Place of Occurrence','Name of IO'],
      wds:[7,15,14,25,32,10,22,38,26],
      rawRows: () => uiRows.filter(r => r.inquest_status||r.inquest_sections),
      rows:() => uiRows.filter(r => r.inquest_status||r.inquest_sections).map((r,i) => { const dec=getP(r.id, 'DECEASED'); return [i+1,r.uidb_no||r.gd_no||'-',fmtD(r.gd_date||r.record_date),r.inquest_sections||getUS(r.id),fmtP(dec, false),dec?.gender||'-',r.cause_of_death==='other'?(r.cause_of_death_other||'-'):(r.cause_of_death||'-'),fmtLoc(r,'floc'),fmtIO(r)]; })
    },
    { key:'inquest_acpsdm_disposal', excelKey:'excel_26inquest_acpsdm_disposal', label:'20. Inquest ACPSDM Disposal',
      hdrs:['S.No.','DD No.','DD Date','U/S','Deceased (Name/Age/S-O/R-O Address)','Sex','Cause of Death','Date Filed by ACP/SDM'],
      wds:[7,15,14,25,32,10,22,18],
      rawRows: () => uiRows.filter(r => r.filed_by_acp_sdm),
      rows:() => uiRows.filter(r => r.filed_by_acp_sdm).map((r,i) => { const dec=getP(r.id, 'DECEASED'); return [i+1,r.uidb_no||r.gd_no||'-',fmtD(r.gd_date||r.record_date),r.inquest_sections||getUS(r.id),fmtP(dec, false),dec?.gender||'-',r.cause_of_death==='other'?(r.cause_of_death_other||'-'):(r.cause_of_death||'-'),fmtD(r.filed_by_acp_sdm_date)]; })
    },
    { key:'fir_goswara_summary', excelKey:'excel_28fir_goswara_summary', label:'21. FIR Goswara Summary',
      hdrs:['District','Manual FIR Arrests','Theft (e-FIR) Arrests','House Theft (e-FIR) Arrests','Burglary (e-FIR) Arrests','M.V. Theft Arrests','Total'],
      wds:[26,22,22,24,22,22,12],
      rawRows: () => arrRows,
      rows:() => {
        const dm={};
        for (const r of arrRows) {
          const d=r.dist_name||'Unknown';
          if (!dm[d]) dm[d]={manual:0,theft:0,houseTheft:0,burglary:0,mvt:0};
          const ct=(r.case_type||'').toLowerCase(),ch=(r.crime_head||'').toLowerCase();
          if (ct==='emvt'||ch.includes('m.v.')||ch.includes('motor vehicle')) dm[d].mvt++;
          else if (ch.includes('burglary')) dm[d].burglary++;
          else if (ch.includes('house theft')) dm[d].houseTheft++;
          else if (ct==='etheft'||ch.includes('theft')) dm[d].theft++;
          else dm[d].manual++;
        }
        return Object.entries(dm).map(([d,c])=>[d,c.manual,c.theft,c.houseTheft,c.burglary,c.mvt,c.manual+c.theft+c.houseTheft+c.burglary+c.mvt]);
      }
    },
    { key:'women_missing_summary', excelKey:'excel_22women_missing_summary', label:'22. Women Missing Summary',
      hdrs:['Police Station','Reported Today','Traced Today','Total Pending'],
      wds:[26,18,18,18],
      rawRows: () => missRows.filter(r => (getP(r.id, 'MISSING')?.gender||'').toUpperCase() === 'FEMALE'),
      rows:() => {
        const pm={};
        for (const r of missRows) {
          const ps=r.ps_name||'Unknown';
          const gen=(getP(r.id, 'MISSING')?.gender||'').toUpperCase();
          if (gen!=='FEMALE') continue;
          if (!pm[ps]) pm[ps]={rep:0,tra:0,pend:0};
          pm[ps].rep++;
          if ((r.missing_status||'').toLowerCase()==='traced') pm[ps].tra++;
          else pm[ps].pend++;
        }
        return Object.entries(pm).map(([ps,c])=>[ps,c.rep,c.tra,c.pend]);
      }
    },
    { key:'children_missing_summary', excelKey:'excel_23children_missing_summary', label:'23. Children Missing Summary',
      hdrs:['Police Station','Reported Today','Traced Today','Total Pending'],
      wds:[26,18,18,18],
      rawRows: () => missRows.filter(r => {
        const age = Number(getP(r.id, 'MISSING')?.age);
        return !isNaN(age) && age > 0 && age < 18;
      }),
      rows:() => {
        const pm={};
        for (const r of missRows) {
          const ps=r.ps_name||'Unknown';
          const age=Number(getP(r.id, 'MISSING')?.age);
          if (isNaN(age) || age <= 0 || age >= 18) continue;
          if (!pm[ps]) pm[ps]={rep:0,tra:0,pend:0};
          pm[ps].rep++;
          if ((r.missing_status||'').toLowerCase()==='traced') pm[ps].tra++;
          else pm[ps].pend++;
        }
        return Object.entries(pm).map(([ps,c])=>[ps,c.rep,c.tra,c.pend]);
      }
    },
    { key:'arrest_count_summary', excelKey:'excel_24arrest_count_summary', label:'24. Arrest Count Summary',
      hdrs:['Police Station','Total Arrests Today','FIR Arrests','Kalandara Arrests','Total Active Arrestees'],
      wds:[26,20,18,20,22],
      rawRows: () => arrRows,
      rows:() => {
        const pm={};
        for (const r of arrRows) {
          const ps=r.ps_name||'Unknown';
          if (!pm[ps]) pm[ps]={total:0,fir:0,kal:0};
          pm[ps].total++;
          const ct=(r.case_type||'').toLowerCase();
          if (ct.includes('kal') || ct.includes('prev')) pm[ps].kal++;
          else pm[ps].fir++;
        }
        return Object.entries(pm).map(([ps,c])=>[ps,c.total,c.fir,c.kal,c.total]);
      }
    },
  ];

  const activeDefs = Array.isArray(tableNamesFilter) && tableNamesFilter.length > 0
    ? DEFS.filter(d => tableNamesFilter.includes(d.key) || tableNamesFilter.includes(d.excelKey))
    : DEFS;

  const result = { defs: activeDefs };
  for (const def of activeDefs) {
    result[def.key] = def.rawRows ? def.rawRows() : [];
    result[def.excelKey] = def.rows ? def.rows() : [];
  }
  return result;
};

// ─── Generate Daily Diary Excel (Native JS Engine) ───────────────────────────
export const generateDailyDiaryExcelNative = async (
  jobIdOrOptions, dateFromArg, dateToArg, psIdArg, districtIdArg, subDivIdArg, tableNamesFilterArg, filePathArg
) => {
  let jobId = jobIdOrOptions;
  let date = dateFromArg;
  let dateTo = dateToArg;
  let psId = psIdArg;
  let districtId = districtIdArg;
  let subDivId = subDivIdArg;
  let tableNamesFilter = tableNamesFilterArg;
  let filePath = filePathArg;

  if (typeof jobIdOrOptions === 'object' && jobIdOrOptions !== null) {
    const opts = jobIdOrOptions;
    jobId = opts.jobId;
    date = opts.date;
    dateTo = opts.dateTo;
    psId = opts.psId || opts.policeStationId;
    districtId = opts.districtId;
    subDivId = opts.subDivId;
    tableNamesFilter = opts.tableNamesFilter;
    filePath = opts.filePath || opts.outputPath;
  }

  const data = await fetchAllDiaryData(date, dateTo, psId, districtId, subDivId, tableNamesFilter);

  const dateLabel = date
    ? 'Date: ' + toDMY(String(date).substring(0, 10)) + (dateTo && dateTo !== date ? ' to ' + toDMY(String(dateTo).substring(0, 10)) : '')
    : 'All Dates';

  const wb = new ExcelJS.Workbook();
  wb.creator = 'PHAROS Intelligence System';
  wb.created = new Date();

  for (const def of data.defs) {
    const sheetName = def.label.replace(/[*?:/\[\]]/g, '').substring(0, 31);
    const ws = wb.addWorksheet(sheetName);

    const tr = ws.addRow(['PHAROS Daily Diary - ' + def.label]);
    ws.mergeCells(tr.number, 1, tr.number, def.hdrs.length);
    tr.font = {name:'Arial',bold:true,size:12,color:{argb:'FFFFFFFF'}};
    tr.fill = {type:'pattern',pattern:'solid',fgColor:{argb:'FF1F3864'}};
    tr.alignment = {horizontal:'center',vertical:'middle'};
    tr.height = 22;

    let sheetDateLabel = dateLabel;
    if (def.key === 'arrested_last_24hrs') {
      const targetDateStr = dateTo || date || new Date().toISOString().slice(0, 10);
      const formattedDate = toDMY(String(targetDateStr).substring(0, 10));
      sheetDateLabel = `Last 24 Hours Period: ${formattedDate} 00:00 to ${formattedDate} 23:59`;
    }

    const dlr = ws.addRow([sheetDateLabel]);
    ws.mergeCells(dlr.number, 1, dlr.number, def.hdrs.length);
    dlr.font = {name:'Arial',italic:true,size:10};
    dlr.fill = {type:'pattern',pattern:'solid',fgColor:{argb:'FFD6E4F0'}};
    dlr.alignment = {horizontal:'center'};

    ws.addRow([]);
    def.wds.forEach((w,i) => { ws.getColumn(i+1).width = w; });

    const hdr = ws.addRow(def.hdrs);
    hdr.font = {name:'Arial',bold:true,size:10,color:{argb:'FFFFFFFF'}};
    hdr.fill = {type:'pattern',pattern:'solid',fgColor:{argb:'FF2E5E8E'}};
    hdr.height = 28;
    hdr.alignment = {horizontal:'center',vertical:'middle',wrapText:true};
    hdr.eachCell(c => { c.border={top:{style:'thin'},left:{style:'thin'},bottom:{style:'thin'},right:{style:'thin'}}; });

    const dataRows = def.rows();
    if (dataRows.length === 0) {
      const er = ws.addRow(['No records found for the selected date / scope.']);
      ws.mergeCells(er.number, 1, er.number, def.hdrs.length);
      er.font = {name:'Arial',italic:true,color:{argb:'FF888888'}};
      er.alignment = {horizontal:'center'};
    } else {
      dataRows.forEach((row, idx) => {
        const dr = ws.addRow(row);
        dr.font = {name:'Arial',size:10};
        dr.alignment = {vertical:'top',wrapText:true};
        dr.height = 18;
        if (idx % 2 === 1) dr.fill = {type:'pattern',pattern:'solid',fgColor:{argb:'FFF0F4F8'}};
        dr.eachCell(c => { c.border={top:{style:'thin',color:{argb:'FFCCCCCC'}},left:{style:'thin',color:{argb:'FFCCCCCC'}},bottom:{style:'thin',color:{argb:'FFCCCCCC'}},right:{style:'thin',color:{argb:'FFCCCCCC'}}}; });
      });
    }
  }

  await wb.xlsx.writeFile(filePath);

  const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
  if (jobId && typeof jobId === 'string' && UUID_RE.test(jobId)) {
    await db('report_jobs').where({ id: jobId }).update({
      status: 'READY', file_path: filePath, updated_at: new Date().toISOString()
    });
  }
};

// ─── Process Export Job ────────────────────────────────────────────────────────
export const processExportJobAsync = async (jobId, date, dateTo, psId, districtId, subDivId, tableNamesFilter, filePath) => {
  logger.info('[DailyDiaryExport] Generating report with Native ExcelJS engine for job ' + jobId);
  await generateDailyDiaryExcelNative(jobId, date, dateTo, psId, districtId, subDivId, tableNamesFilter, filePath);
};

// ─── Queue Export Job ──────────────────────────────────────────────────────────
export const queueDailyDiaryExport = async (user, date, psId, districtId, subDivId, tableNamesFilter = null, dateTo = null) => {
  const jobId = uuidv4();
  const reportsDir = path.resolve(process.env.REPORTS_DIR || './generated-reports');
  if (!fs.existsSync(reportsDir)) fs.mkdirSync(reportsDir, { recursive: true });
  const filePath = path.join(reportsDir, jobId + '.xlsx');
  const rawUserId = user?.userId || user?.id || null;

  const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
  let creatorId = rawUserId;
  let validCreator = false;
  if (creatorId && typeof creatorId === 'string' && UUID_RE.test(creatorId)) {
    const u = await db('users').where({ id: creatorId }).first();
    if (u) validCreator = true;
  }
  if (!validCreator) {
    const fu = await db('users').select('id').first();
    creatorId = fu ? fu.id : null;
  }

  await db('report_jobs').insert({
    id: jobId, template_id: null,
    custom_definition: JSON.stringify({ type: 'DAILY_DIARY', date }),
    filters: JSON.stringify({ date, date_to: dateTo, ps_id: psId, district_id: districtId, sub_div_id: subDivId, table_names: tableNamesFilter }),
    format: 'EXCEL', status: 'PENDING', file_path: filePath,
    created_by: creatorId, created_at: new Date().toISOString(), updated_at: new Date().toISOString(),
  });

  await publish('report.requested', { job_id: jobId, format: 'EXCEL', user_id: creatorId }).catch(() => {});

  setImmediate(async () => {
    try {
      await processExportJobAsync(jobId, date, dateTo, psId, districtId, subDivId, tableNamesFilter, filePath);
    } catch (err) {
      logger.error('[DailyDiaryExport] Fatal error generating job ' + jobId + ':', err);
      await db('report_jobs').where({ id: jobId }).update({
        status: 'FAILED',
        error_message: String(err.message || 'Report generation failed').slice(0, 500),
        updated_at: new Date().toISOString()
      });
    }
  });

  return { jobId };
};
