import db from '../../../config/db.js';
import { HEINOUS_CANONICAL_CODES } from '../shared/canonical-codes.js';

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

function filterValidUuids(arr) {
  return (arr || []).filter(id => typeof id === 'string' && UUID_RE.test(id));
}

const ACCIDENT_CODES       = ['FATAL_ACCIDENT', 'SIMPLE_ACCIDENT', 'ACCIDENT'];
const D2_BRIEF_FACTS_CODES = HEINOUS_CANONICAL_CODES;

export async function fetchPsSubDivisionMap(psIds) {
  const validPsIds = filterValidUuids(psIds);
  if (validPsIds.length === 0) return {};

  const rows = await db('hierarchy_nodes as ps')
    .leftJoin('hierarchy_nodes as sd', 'sd.id', 'ps.parent_id')
    .whereIn('ps.id', validPsIds)
    .select('ps.id as ps_id', 'ps.name as ps_name', 'sd.name as sub_div_name');

  const map = {};
  rows.forEach(r => { map[r.ps_id] = r.sub_div_name || 'SUB DIVISION'; });
  return map;
}

export async function fetchAccidentCases({ psIds, cutoffDate }) {
  const validPsIds = filterValidUuids(psIds);
  if (validPsIds.length === 0) return [];

  return await db('records as r')
    .join('fir_details as fd', 'fd.record_id', 'r.id')
    .join('hierarchy_nodes as hn', 'hn.id', 'r.ps_id')
    .leftJoin('ref.local_heads as lh', 'lh.local_head_cd', 'fd.local_head_id')
    .where('r.record_type', 'CASE')
    .whereIn('r.ps_id', validPsIds)
    .where('r.record_date', cutoffDate)
    .whereIn('lh.canonical_code', ACCIDENT_CODES)
    .select(
      'r.ps_id',
      'hn.name as ps_name',
      db.raw("COALESCE(fd.fir_no, r.legacy_ref, 'N/A') as fir_no"),
      db.raw('COALESCE(r.registration_date, r.record_date) as registration_date'),
      'fd.brief_facts',
      'fd.local_head_id',
      'lh.canonical_code'
    )
    .orderBy('hn.name');
}

export async function fetchHeinousBriefFacts({ psIds, cutoffDate }) {
  const validPsIds = filterValidUuids(psIds);
  if (validPsIds.length === 0) return [];

  const rows = await db('records as r')
    .join('fir_details as fd', 'fd.record_id', 'r.id')
    .join('hierarchy_nodes as hn', 'hn.id', 'r.ps_id')
    .leftJoin('ref.local_heads as lh', 'lh.local_head_cd', 'fd.local_head_id')
    .leftJoin('locations as loc', 'loc.id', 'fd.occurrence_location_id')
    .leftJoin('ref.beats as bt', 'bt.beat_cd', 'fd.beat_id')
    .leftJoin('investigating_officers as io', 'r.io_id', 'io.id')
    .where('r.record_type', 'CASE')
    .whereIn('r.ps_id', validPsIds)
    .where('r.record_date', cutoffDate)
    .whereIn('lh.canonical_code', D2_BRIEF_FACTS_CODES)
    .select(
      'r.id as record_id',
      'r.ps_id',
      'hn.name as ps_name',
      db.raw("COALESCE(fd.fir_no, r.legacy_ref, 'N/A') as fir_no"),
      db.raw('COALESCE(r.registration_date, r.record_date) as registration_date'),
      'fd.brief_facts',
      'fd.is_worked_out',
      'fd.extra as fd_extra',
      'lh.local_head as crime_head',
      'lh.canonical_code',
      db.raw("COALESCE(io.name, '') as io_name"),
      db.raw("COALESCE(bt.beat_name, bt.beat_cd, '') as beat_no"),
      db.raw(`COALESCE(NULLIF(TRIM(loc.full_address),''),
              NULLIF(TRIM(CONCAT_WS(', ', NULLIF(loc.house_no,''), NULLIF(loc.street,''),
                          NULLIF(loc.colony,''), NULLIF(loc.city_town_village,''))), '')) as occurrence_place`),
      db.raw(`CASE 
        WHEN fd.occurrence_from_datetime IS NOT NULL AND fd.occurrence_to_datetime IS NOT NULL 
          THEN TO_CHAR(fd.occurrence_from_datetime, 'DD/MM/YYYY HH24:MI') || ' to ' || TO_CHAR(fd.occurrence_to_datetime, 'DD/MM/YYYY HH24:MI')
        WHEN fd.occurrence_from_datetime IS NOT NULL 
          THEN TO_CHAR(fd.occurrence_from_datetime, 'DD/MM/YYYY HH24:MI')
        WHEN fd.occurrence_to_datetime IS NOT NULL 
          THEN TO_CHAR(fd.occurrence_to_datetime, 'DD/MM/YYYY HH24:MI')
        ELSE COALESCE(NULLIF(TRIM(fd.extra->>'occurrence_time'), ''), NULLIF(TRIM(fd.extra->>'time_of_occurrence'), ''), 'N/A')
      END as time_of_occurrence`)
    )
    .orderBy('hn.name');

  if (rows.length === 0) return rows;

  const recordIds = rows.map(r => r.record_id);
  const [persons, offenceRows] = await Promise.all([
    db('persons as p')
      .leftJoin('locations as ploc', 'ploc.id', 'p.present_location_id')
      .whereIn('p.record_id', recordIds)
      .select(
        'p.record_id', 'p.role', 'p.name', 'p.age', 'p.relative_name', 'p.relation_type',
        db.raw(`COALESCE(NULLIF(TRIM(ploc.full_address),''),
                NULLIF(TRIM(CONCAT_WS(', ', NULLIF(ploc.house_no,''), NULLIF(ploc.street,''),
                            NULLIF(ploc.colony,''), NULLIF(ploc.city_town_village,''))), '')) as person_address`)
      ),
    db('record_offences as ro')
      .leftJoin('ref.acts as a', 'a.act_cd', 'ro.act_id')
      .leftJoin('ref.sections as s', function() {
        this.on('s.section_code', '=', 'ro.section_id')
            .orOn(db.raw("s.section_cd::text"), '=', db.raw("ro.section_id::text"));
      })
      .whereIn('ro.record_id', recordIds)
      .select(
        'ro.record_id',
        db.raw("COALESCE(NULLIF(a.act_long, ''), NULLIF(ro.other_act_name, '')) as act_name"),
        db.raw("COALESCE(NULLIF(s.section, ''), REGEXP_REPLACE(ro.section_id, '^[0-9]+-', ''), ro.section_id) as sec_clean")
      ),
  ]);

  const personMap = {};
  persons.forEach(p => {
    if (!personMap[p.record_id]) personMap[p.record_id] = { accused: [], io_name: '', complainant: '' };
    if (p.role === 'ARRESTEE' || p.role === 'ACCUSED') {
      const addr = p.person_address ? ` R/o ${p.person_address}` : '';
      const rel = p.relative_name ? ` ${p.relation_type || 'S/O'} ${p.relative_name}` : '';
      personMap[p.record_id].accused.push(`${p.name}${rel}${addr}`);
    } else if (p.role === 'IO' && !personMap[p.record_id].io_name) {
      personMap[p.record_id].io_name = p.name;
    } else if (p.role === 'COMPLAINANT' && !personMap[p.record_id].complainant) {
      personMap[p.record_id].complainant = p.name;
    }
  });

  const offenceMap = {};
  offenceRows.forEach(r => {
    if (!offenceMap[r.record_id]) offenceMap[r.record_id] = [];
    const sec = (r.sec_clean || '').trim();
    const act = (r.act_name || '').trim();
    const lbl = sec && act ? `${sec} ${act}` : (sec || act);
    if (lbl && !offenceMap[r.record_id].includes(lbl)) offenceMap[r.record_id].push(lbl);
  });

  return rows.map(r => {
    const ex = (typeof r.fd_extra === 'object' && r.fd_extra) ? r.fd_extra : {};
    return {
      ...r,
      io_name: r.io_name || personMap[r.record_id]?.io_name || '-',
      sections: offenceMap[r.record_id]?.join(', ') || '-',
      accused_details: personMap[r.record_id]?.accused.join('; ') || 'Not identified / Unknown',
      stolen_property: ex.stolen_property || ex.recovery || '-',
      yet_to_be_arrested: ex.yet_to_be_arrested || 'Nil',
    };
  });
}

export async function fetchFullFirListing({ psIds, cutoffDate }) {
  const validPsIds = filterValidUuids(psIds);
  if (validPsIds.length === 0) return [];

  const rows = await db('records as r')
    .join('fir_details as fd', 'fd.record_id', 'r.id')
    .join('hierarchy_nodes as hn', 'hn.id', 'r.ps_id')
    .leftJoin('hierarchy_nodes as sd', 'sd.id', 'hn.parent_id')
    .leftJoin('ref.local_heads as lh', 'lh.local_head_cd', 'fd.local_head_id')
    .leftJoin('locations as loc', 'loc.id', 'fd.occurrence_location_id')
    .leftJoin('ref.beats as bt', 'bt.beat_cd', 'fd.beat_id')
    .leftJoin('investigating_officers as io', 'r.io_id', 'io.id')
    .where('r.record_type', 'CASE')
    .whereIn('r.ps_id', validPsIds)
    .where('r.record_date', cutoffDate)
    .select(
      'r.id as record_id',
      'r.ps_id',
      'hn.name as ps_name',
      'sd.name as sub_div_name',
      db.raw("COALESCE(fd.fir_no, r.legacy_ref, 'N/A') as fir_no"),
      db.raw('COALESCE(r.registration_date, r.record_date) as registration_date'),
      'fd.brief_facts',
      'fd.fir_date',
      'fd.extra as fd_extra',
      'lh.local_head as crime_head',
      'lh.canonical_code',
      db.raw("COALESCE(io.name, '') as io_name"),
      db.raw("COALESCE(bt.beat_name, bt.beat_cd, '') as beat_no"),
      db.raw(`COALESCE(NULLIF(TRIM(loc.full_address),''),
              NULLIF(TRIM(CONCAT_WS(', ', NULLIF(loc.house_no,''), NULLIF(loc.street,''),
                          NULLIF(loc.colony,''), NULLIF(loc.city_town_village,''))), '')) as occurrence_place`),
    db.raw(`CASE 
      WHEN fd.occurrence_from_datetime IS NOT NULL AND fd.occurrence_to_datetime IS NOT NULL 
        THEN TO_CHAR(fd.occurrence_from_datetime, 'DD/MM/YYYY HH24:MI') || ' to ' || TO_CHAR(fd.occurrence_to_datetime, 'DD/MM/YYYY HH24:MI')
      WHEN fd.occurrence_from_datetime IS NOT NULL 
        THEN TO_CHAR(fd.occurrence_from_datetime, 'DD/MM/YYYY HH24:MI')
      WHEN fd.occurrence_to_datetime IS NOT NULL 
        THEN TO_CHAR(fd.occurrence_to_datetime, 'DD/MM/YYYY HH24:MI')
      ELSE COALESCE(NULLIF(TRIM(fd.extra->>'occurrence_time'), ''), NULLIF(TRIM(fd.extra->>'time_of_occurrence'), ''), 'N/A')
    END as time_of_occurrence`)
    )
    .orderBy(['sd.name', 'hn.name', 'fd.fir_date']);

  if (rows.length === 0) return rows;

  const recordIds = rows.map(r => r.record_id);

  const [persons, offenceRows] = await Promise.all([
    db('persons as p')
      .whereIn('p.record_id', recordIds)
      .whereIn('p.role', ['COMPLAINANT', 'IO', 'ARRESTEE', 'ACCUSED'])
      .select('p.record_id', 'p.role', 'p.name'),
    db('record_offences as ro')
      .leftJoin('ref.acts as a', 'a.act_cd', 'ro.act_id')
      .leftJoin('ref.sections as s', function() {
        this.on('s.section_code', '=', 'ro.section_id')
            .orOn(db.raw("s.section_cd::text"), '=', db.raw("ro.section_id::text"));
      })
      .whereIn('ro.record_id', recordIds)
      .select(
        'ro.record_id',
        db.raw("COALESCE(NULLIF(a.act_long, ''), NULLIF(ro.other_act_name, '')) as act_name"),
        db.raw("COALESCE(NULLIF(s.section, ''), REGEXP_REPLACE(ro.section_id, '^[0-9]+-', ''), ro.section_id) as sec_clean")
      ),
  ]);

  const personMap = {};
  const arresteeMap = {};
  persons.forEach(p => {
    if (!personMap[p.record_id]) personMap[p.record_id] = {};
    if (p.role === 'COMPLAINANT' && !personMap[p.record_id].complainant_name) {
      personMap[p.record_id].complainant_name = p.name;
    } else if (p.role === 'IO' && !personMap[p.record_id].io_name) {
      personMap[p.record_id].io_name = p.name;
    } else if ((p.role === 'ARRESTEE' || p.role === 'ACCUSED') && p.name) {
      if (!arresteeMap[p.record_id]) arresteeMap[p.record_id] = [];
      arresteeMap[p.record_id].push(p.name);
    }
  });

  const offencesByRec = {};
  offenceRows.forEach(r => {
    if (!offencesByRec[r.record_id]) offencesByRec[r.record_id] = { actSections: {}, acts: new Set(), secs: new Set() };
    const act = (r.act_name || '').trim();
    const sec = (r.sec_clean || '').trim();
    if (act) offencesByRec[r.record_id].acts.add(act);
    if (sec) offencesByRec[r.record_id].secs.add(sec);
    if (act && sec) {
      if (!offencesByRec[r.record_id].actSections[act]) offencesByRec[r.record_id].actSections[act] = new Set();
      offencesByRec[r.record_id].actSections[act].add(sec);
    }
  });

  const cleanOffenceLabel = (actRaw, secRaw) => {
    let act = (actRaw || '').trim();
    let sec = (secRaw || '').trim();
    if (!act && !sec) return '';
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

    sec = sec.replace(/^u\/s\s+/i, '').trim();
    if (act && new RegExp(`\\b${act}\\b`, 'i').test(sec)) return sec;
    if (sec && act) return `${sec} ${act}`;
    return sec || act || '';
  };

  const offenceMap = {};
  Object.keys(offencesByRec).forEach(rid => {
    const item = offencesByRec[rid];
    const parts = [];
    const actKeys = Object.keys(item.actSections);
    if (actKeys.length > 0) {
      actKeys.forEach(act => {
        const secList = Array.from(item.actSections[act]).sort().join('/');
        parts.push(cleanOffenceLabel(act, secList));
      });
    } else if (item.acts.size > 0 && item.secs.size > 0) {
      parts.push(cleanOffenceLabel(Array.from(item.acts).join(', '), Array.from(item.secs).join('/')));
    } else if (item.secs.size > 0) {
      parts.push(cleanOffenceLabel('', Array.from(item.secs).join('/')));
    } else if (item.acts.size > 0) {
      parts.push(cleanOffenceLabel(Array.from(item.acts).join(', '), ''));
    }
    offenceMap[rid] = parts.filter(Boolean).join(', ');
  });

  return rows.map(r => {
    const ex = (typeof r.fd_extra === 'object' && r.fd_extra) ? r.fd_extra : {};
    return {
      ...r,
      complainant_name:  personMap[r.record_id]?.complainant_name || '',
      io_name:           r.io_name || personMap[r.record_id]?.io_name || '',
      arrested_person:   (arresteeMap[r.record_id] || []).join(', ') || '',
      sections:          offenceMap[r.record_id] || '',
      stolen_property:   ex.stolen_property || ex.recovery || '',
      left_over_criminals: ex.yet_to_be_arrested || ex.left_over_criminals || '',
    };
  });
}

export async function fetchArrestsByCaseType({ psIds, cutoffDate, caseType = 'FIR' }) {
  const validPsIds = filterValidUuids(psIds);
  if (validPsIds.length === 0) return [];

  let qb = db('records as r')
    .join('arrest_details as ad', 'ad.record_id', 'r.id')
    .join('hierarchy_nodes as hn', 'hn.id', 'r.ps_id')
    .leftJoin('hierarchy_nodes as sd', 'sd.id', 'hn.parent_id')
    .where('r.record_type', 'ARREST')
    .whereIn('r.ps_id', validPsIds)
    .where('r.record_date', cutoffDate);

  const ctUpper = String(caseType).toUpperCase();
  if (ctUpper.includes('KAL') || ctUpper.includes('PREV')) {
    qb = qb.where(function() {
      this.where(function() {
        this.whereILike('ad.case_type', '%kal%')
          .orWhereILike('ad.case_type', '%prev%')
          .orWhere('ad.is_dd_based', true);
      })
      .andWhere(function() {
        this.whereNull('ad.fir_no')
          .orWhere('ad.fir_no', '')
          .orWhere('ad.fir_no', 'N/A');
      })
      .andWhere(function() {
        this.whereNull('ad.case_type')
          .orWhereRaw("(ad.case_type NOT ILIKE '%fir%' AND ad.case_type NOT ILIKE '%theft%' AND ad.case_type NOT ILIKE '%mvt%')");
      });
    });
  } else {
    qb = qb.where(function() {
      this.whereILike('ad.case_type', '%fir%')
        .orWhereILike('ad.case_type', '%theft%')
        .orWhereILike('ad.case_type', '%mvt%')
        .orWhereNotNull('ad.fir_no')
        .orWhere(function() {
          this.whereNull('ad.case_type')
            .orWhereRaw("(ad.case_type NOT ILIKE '%kal%' AND ad.case_type NOT ILIKE '%prev%')");
        });
    });
  }

  const rows = await qb.select(
    'r.id as record_id',
    'r.ps_id',
    'hn.name as ps_name',
    'sd.name as sub_div_name',
    db.raw("COALESCE(ad.gd_no, ad.fir_no, r.legacy_ref, 'N/A') as fir_no"),
    'ad.gd_no',
    db.raw('COALESCE(r.registration_date, r.record_date) as registration_date'),
    'ad.custody_status',
    'ad.extra as ad_extra',
    'ad.nafis_prepared',
    'ad.dossier_prepared'
  ).orderBy(['sd.name', 'hn.name']);

  if (rows.length === 0) return rows;

  const recordIds = rows.map(r => r.record_id);

  const [persons, offences] = await Promise.all([
    db('persons as p')
      .leftJoin('locations as ploc', 'ploc.id', 'p.present_location_id')
      .leftJoin('locations as permloc', 'permloc.id', 'p.perm_location_id')
      .leftJoin('arrestee_details as ard', 'ard.person_id', 'p.id')
      .leftJoin('locations as arloc', 'arloc.id', 'ard.arrest_location_id')
      .whereIn('p.record_id', recordIds)
      .whereIn('p.role', ['ARRESTEE', 'ACCUSED', 'IO'])
      .select(
        'p.record_id', 'p.role', 'p.name', 'p.age', 'p.mobile',
        'p.relative_name', 'p.relation_type', 'p.extra as p_extra',
        db.raw(`COALESCE(
          NULLIF(TRIM(ploc.full_address),''),
          NULLIF(TRIM(CONCAT_WS(', ', NULLIF(ploc.house_no,''), NULLIF(ploc.street,''), NULLIF(ploc.colony,''), NULLIF(ploc.city_town_village,''), NULLIF(ploc.district,''))), ''),
          NULLIF(TRIM(permloc.full_address),''),
          NULLIF(TRIM(CONCAT_WS(', ', NULLIF(permloc.house_no,''), NULLIF(permloc.street,''), NULLIF(permloc.colony,''), NULLIF(permloc.city_town_village,''), NULLIF(permloc.district,''))), '')
        ) as person_address`),
        db.raw(`COALESCE(
          NULLIF(TRIM(arloc.full_address),''),
          NULLIF(TRIM(CONCAT_WS(', ', NULLIF(arloc.house_no,''), NULLIF(arloc.street,''), NULLIF(arloc.colony,''), NULLIF(arloc.city_town_village,''), NULLIF(arloc.district,''))), ''),
          NULLIF(TRIM(ploc.full_address),''),
          NULLIF(TRIM(CONCAT_WS(', ', NULLIF(ploc.house_no,''), NULLIF(ploc.street,''), NULLIF(ploc.colony,''), NULLIF(ploc.city_town_village,''), NULLIF(ploc.district,''))), ''),
          NULLIF(TRIM(permloc.full_address),''),
          NULLIF(TRIM(CONCAT_WS(', ', NULLIF(permloc.house_no,''), NULLIF(permloc.street,''), NULLIF(permloc.colony,''), NULLIF(permloc.city_town_village,''), NULLIF(permloc.district,''))), '')
        ) as arrest_address`)
      ),
    db('record_offences as ro')
      .whereIn('ro.record_id', recordIds)
      .select(db.raw("ro.record_id, STRING_AGG(DISTINCT ro.section_id, ', ') as sections"))
      .groupBy('ro.record_id'),
  ]);

  const personMap = {};
  persons.forEach(p => {
    if (!personMap[p.record_id]) personMap[p.record_id] = {};
    if ((p.role === 'ARRESTEE' || p.role === 'ACCUSED') && !personMap[p.record_id].person_name) {
      const pEx = (typeof p.p_extra === 'object' && p.p_extra) ? p.p_extra : {};
      const prevCount = pEx.prev_involvement_count ?? pEx.prev_involvement_no_of_cases ?? (pEx.prev_involvement ? 1 : 0);
      const isPo = Boolean(pEx.is_po || pEx.proclaimed_offender || pEx.po_flag);
      const isBc = Boolean(pEx.is_bc || pEx.bad_character || pEx.bc_flag || pEx.listed_criminal || pEx.whether_accused_is_bc_or_not);

      personMap[p.record_id].person_name      = p.name;
      personMap[p.record_id].age              = p.age;
      personMap[p.record_id].mobile           = p.mobile;
      personMap[p.record_id].relative_name    = p.relative_name;
      personMap[p.record_id].relation_type    = p.relation_type;
      personMap[p.record_id].prev_involvement = prevCount;
      personMap[p.record_id].is_po            = isPo ? 'Yes' : 'No';
      personMap[p.record_id].is_bc            = isBc ? 'Yes' : 'No';
      personMap[p.record_id].person_address   = p.person_address;
      personMap[p.record_id].arrest_address   = p.arrest_address;
    }
    if (p.role === 'IO' && !personMap[p.record_id].io_name) {
      personMap[p.record_id].io_name = p.name;
    }
  });

  const offenceMap = {};
  offences.forEach(o => { offenceMap[o.record_id] = o.sections; });

  return rows.map(r => {
    const pData = personMap[r.record_id] || {};
    const adEx = (typeof r.ad_extra === 'object' && r.ad_extra) ? r.ad_extra : {};
    const isPo = (pData.is_po === 'Yes') || Boolean(adEx.is_po || adEx.proclaimed_offender || adEx.po_flag);
    const isBc = (pData.is_bc === 'Yes') || Boolean(adEx.is_bc || adEx.bad_character || adEx.bc_flag || adEx.listed_criminal || adEx.whether_accused_is_bc_or_not);
    const prevCount = pData.prev_involvement ?? adEx.prev_involvement_count ?? adEx.prev_involvement_no_of_cases ?? (adEx.prev_involvement ? 1 : 0);

    return {
      ...r,
      ...pData,
      prev_involvement: prevCount,
      is_po: isPo ? 'Yes' : 'No',
      is_bc: isBc ? 'Yes' : 'No',
      sections: offenceMap[r.record_id] || '',
    };
  });
}
