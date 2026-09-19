import db from '../../../config/db.js';

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

function filterValidUuids(arr) {
  return (arr || []).filter(id => typeof id === 'string' && UUID_RE.test(id));
}

const ACCIDENT_CODES       = ['FATAL_ACCIDENT', 'SIMPLE_ACCIDENT', 'ACCIDENT'];
const D2_BRIEF_FACTS_CODES = ['MURDER', 'ROBBERY', 'DACOITY', 'RAPE', 'POCSO', 'KIDNAPPING', 'KID_FOR_RANSOM'];

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
    .whereRaw('COALESCE(r.registration_date, r.record_date) = ?', [cutoffDate])
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

  return await db('records as r')
    .join('fir_details as fd', 'fd.record_id', 'r.id')
    .join('hierarchy_nodes as hn', 'hn.id', 'r.ps_id')
    .leftJoin('ref.local_heads as lh', 'lh.local_head_cd', 'fd.local_head_id')
    .where('r.record_type', 'CASE')
    .whereIn('r.ps_id', validPsIds)
    .whereRaw('COALESCE(r.registration_date, r.record_date) = ?', [cutoffDate])
    .whereIn('lh.canonical_code', D2_BRIEF_FACTS_CODES)
    .select(
      'r.ps_id',
      'hn.name as ps_name',
      db.raw("COALESCE(fd.fir_no, r.legacy_ref, 'N/A') as fir_no"),
      db.raw('COALESCE(r.registration_date, r.record_date) as registration_date'),
      'fd.brief_facts',
      'lh.canonical_code'
    )
    .orderBy('hn.name');
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
    .where('r.record_type', 'CASE')
    .whereIn('r.ps_id', validPsIds)
    .whereRaw('COALESCE(r.registration_date, r.record_date) = ?', [cutoffDate])
    .select(
      'r.id as record_id',
      'r.ps_id',
      'hn.name as ps_name',
      'sd.name as sub_div_name',
      db.raw("COALESCE(fd.fir_no, r.legacy_ref, 'N/A') as fir_no"),
      db.raw('COALESCE(r.registration_date, r.record_date) as registration_date'),
      'fd.brief_facts',
      'fd.fir_date',
      'lh.local_head as crime_head',
      'lh.canonical_code',
      db.raw(`COALESCE(NULLIF(TRIM(loc.full_address),''),
              NULLIF(TRIM(CONCAT_WS(', ', NULLIF(loc.house_no,''), NULLIF(loc.street,''),
                          NULLIF(loc.colony,''), NULLIF(loc.city_town_village,''))), '')) as occurrence_place`),
    db.raw(`TO_CHAR(fd.occurrence_from_datetime AT TIME ZONE 'Asia/Kolkata', 'DD/MM/YYYY HH24:MI') as time_of_occurrence`)
    )
    .orderBy(['sd.name', 'hn.name', 'fd.fir_date']);

  if (rows.length === 0) return rows;

  // Attach complainant, IO, arrestees, and offence sections
  const recordIds = rows.map(r => r.record_id);

  const [persons, offences] = await Promise.all([
    db('persons as p')
      .whereIn('p.record_id', recordIds)
      .whereIn('p.role', ['COMPLAINANT', 'IO', 'ARRESTEE'])
      .select('p.record_id', 'p.role', 'p.name'),
    db('record_offences as ro')
      .whereIn('ro.record_id', recordIds)
      .select(db.raw("ro.record_id, STRING_AGG(DISTINCT ro.section_id, ', ') as sections"))
      .groupBy('ro.record_id'),
  ]);

  const personMap = {};
  const arresteeMap = {};
  persons.forEach(p => {
    if (!personMap[p.record_id]) personMap[p.record_id] = {};
    if (p.role === 'COMPLAINANT' && !personMap[p.record_id].complainant_name) {
      personMap[p.record_id].complainant_name = p.name;
    } else if (p.role === 'IO' && !personMap[p.record_id].io_name) {
      personMap[p.record_id].io_name = p.name;
    } else if (p.role === 'ARRESTEE' && p.name) {
      if (!arresteeMap[p.record_id]) arresteeMap[p.record_id] = [];
      arresteeMap[p.record_id].push(p.name);
    }
  });

  const offenceMap = {};
  offences.forEach(o => { offenceMap[o.record_id] = o.sections; });

  return rows.map(r => ({
    ...r,
    complainant_name:  personMap[r.record_id]?.complainant_name || '',
    io_name:           personMap[r.record_id]?.io_name || '',
    arrested_person:   (arresteeMap[r.record_id] || []).join(', ') || '',
    sections:          offenceMap[r.record_id] || '',
  }));
}

export async function fetchArrestsByCaseType({ psIds, cutoffDate, caseType = 'FIR' }) {
  const validPsIds = filterValidUuids(psIds);
  if (validPsIds.length === 0) return [];

  const rows = await db('records as r')
    .join('arrest_details as ad', 'ad.record_id', 'r.id')
    .join('hierarchy_nodes as hn', 'hn.id', 'r.ps_id')
    .leftJoin('hierarchy_nodes as sd', 'sd.id', 'hn.parent_id')
    .where('r.record_type', 'ARREST')
    .where('ad.case_type', caseType)
    .whereIn('r.ps_id', validPsIds)
    .whereRaw('COALESCE(r.registration_date, r.record_date) = ?', [cutoffDate])
    .select(
      'r.id as record_id',
      'r.ps_id',
      'hn.name as ps_name',
      'sd.name as sub_div_name',
      db.raw("COALESCE(ad.fir_no, r.legacy_ref, 'N/A') as fir_no"),
      db.raw('COALESCE(r.registration_date, r.record_date) as registration_date'),
      'ad.custody_status'
    )
    .orderBy(['sd.name', 'hn.name']);

  if (rows.length === 0) return rows;

  const recordIds = rows.map(r => r.record_id);

  const [persons, offences] = await Promise.all([
    db('persons as p')
      .leftJoin('arrestee_details as ard', 'ard.person_id', 'p.id')
      .leftJoin('locations as aloc', 'aloc.id', 'ard.arrest_location_id')
      .leftJoin('locations as ploc', 'ploc.id', 'p.present_location_id')
      .whereIn('p.record_id', recordIds)
      .whereIn('p.role', ['ARRESTEE', 'IO'])
      .select(
        'p.record_id', 'p.role', 'p.name', 'p.age', 'p.mobile',
        'p.relative_name', 'p.relation_type',
        'ard.prev_involvement_count', 'ard.is_po', 'ard.is_bc',
        db.raw(`COALESCE(NULLIF(TRIM(ploc.full_address),''),
                NULLIF(TRIM(CONCAT_WS(', ', NULLIF(ploc.house_no,''), NULLIF(ploc.street,''),
                            NULLIF(ploc.colony,''), NULLIF(ploc.city_town_village,''))), '')) as person_address`),
        db.raw(`COALESCE(NULLIF(TRIM(aloc.full_address),''),
                NULLIF(TRIM(CONCAT_WS(', ', NULLIF(aloc.house_no,''), NULLIF(aloc.street,''),
                            NULLIF(aloc.colony,''), NULLIF(aloc.city_town_village,''))), '')) as arrest_address`)
      ),
    db('record_offences as ro')
      .whereIn('ro.record_id', recordIds)
      .select(db.raw("ro.record_id, STRING_AGG(DISTINCT ro.section_id, ', ') as sections"))
      .groupBy('ro.record_id'),
  ]);

  const personMap = {};
  persons.forEach(p => {
    if (!personMap[p.record_id]) personMap[p.record_id] = {};
    if (p.role === 'ARRESTEE' && !personMap[p.record_id].person_name) {
      personMap[p.record_id].person_name      = p.name;
      personMap[p.record_id].age              = p.age;
      personMap[p.record_id].mobile           = p.mobile;
      personMap[p.record_id].relative_name    = p.relative_name;
      personMap[p.record_id].relation_type    = p.relation_type;
      personMap[p.record_id].prev_involvement = p.prev_involvement_count ?? 0;
      personMap[p.record_id].is_po            = p.is_po ? 'Yes' : 'No';
      personMap[p.record_id].is_bc            = p.is_bc ? 'Yes' : 'No';
      personMap[p.record_id].person_address   = p.person_address;
      personMap[p.record_id].arrest_address   = p.arrest_address;
    }
    if (p.role === 'IO' && !personMap[p.record_id].io_name) {
      personMap[p.record_id].io_name = p.name;
    }
  });

  const offenceMap = {};
  offences.forEach(o => { offenceMap[o.record_id] = o.sections; });

  return rows.map(r => ({
    ...r,
    ...personMap[r.record_id],
    sections: offenceMap[r.record_id] || '',
  }));
}
