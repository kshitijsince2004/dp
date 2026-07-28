import db from '../../../config/db.js';

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

function filterValidUuids(arr) {
  return (arr || []).filter(id => typeof id === 'string' && UUID_RE.test(id));
}

export async function fetchPsSubDivisionMap(psIds) {
  const validPsIds = filterValidUuids(psIds);
  if (validPsIds.length === 0) return {};

  const rows = await db('hierarchy_nodes as ps')
    .leftJoin('hierarchy_nodes as sd', 'sd.id', 'ps.parent_id')
    .whereIn('ps.id', validPsIds)
    .select('ps.id as ps_id', 'ps.name as ps_name', 'sd.name as sub_div_name');

  const map = {};
  rows.forEach(r => {
    map[r.ps_id] = r.sub_div_name || 'SUB DIVISION';
  });
  return map;
}

export async function fetchAccidentCases({ psIds, cutoffDate }) {
  const validPsIds = filterValidUuids(psIds);
  if (validPsIds.length === 0) return [];

  return await db('records as r')
    .join('fir_details as fd', 'fd.record_id', 'r.id')
    .join('hierarchy_nodes as hn', 'hn.id', 'r.ps_id')
    .where('r.record_type', 'CASE')
    .whereIn('r.ps_id', validPsIds)
    .where('r.registration_date', cutoffDate)
    .select(
      'r.ps_id',
      'hn.name as ps_name',
      'r.legacy_ref as fir_no',
      'r.registration_date',
      'fd.brief_facts',
      'fd.local_head_id'
    )
    .orderBy('hn.name');
}

export async function fetchHeinousBriefFacts({ psIds, cutoffDate }) {
  const validPsIds = filterValidUuids(psIds);
  if (validPsIds.length === 0) return [];

  return await db('records as r')
    .join('fir_details as fd', 'fd.record_id', 'r.id')
    .join('hierarchy_nodes as hn', 'hn.id', 'r.ps_id')
    .where('r.record_type', 'CASE')
    .whereIn('r.ps_id', validPsIds)
    .where('r.registration_date', cutoffDate)
    .select(
      'r.ps_id',
      'hn.name as ps_name',
      'r.legacy_ref as fir_no',
      'r.registration_date',
      'fd.brief_facts'
    )
    .orderBy('hn.name');
}

export async function fetchFullFirListing({ psIds, cutoffDate }) {
  const validPsIds = filterValidUuids(psIds);
  if (validPsIds.length === 0) return [];

  return await db('records as r')
    .join('fir_details as fd', 'fd.record_id', 'r.id')
    .join('hierarchy_nodes as hn', 'hn.id', 'r.ps_id')
    .leftJoin('hierarchy_nodes as sd', 'sd.id', 'hn.parent_id')
    .where('r.record_type', 'CASE')
    .whereIn('r.ps_id', validPsIds)
    .where('r.registration_date', cutoffDate)
    .select(
      'r.ps_id',
      'hn.name as ps_name',
      'sd.name as sub_div_name',
      'r.legacy_ref as fir_no',
      'r.registration_date',
      'fd.brief_facts',
      'fd.fir_date'
    )
    .orderBy(['sd.name', 'hn.name', 'fd.fir_date']);
}

export async function fetchArrestsByCaseType({ psIds, cutoffDate, caseType = 'FIR' }) {
  const validPsIds = filterValidUuids(psIds);
  if (validPsIds.length === 0) return [];

  return await db('records as r')
    .join('arrest_details as ad', 'ad.record_id', 'r.id')
    .leftJoin('arrestee_details as ard', 'ard.person_id', 'r.created_by')
    .leftJoin('persons as p', 'p.id', 'ard.person_id')
    .join('hierarchy_nodes as hn', 'hn.id', 'r.ps_id')
    .leftJoin('hierarchy_nodes as sd', 'sd.id', 'hn.parent_id')
    .where('r.record_type', 'ARREST')
    .where('ad.case_type', caseType)
    .whereIn('r.ps_id', validPsIds)
    .where('r.registration_date', cutoffDate)
    .select(
      'r.ps_id',
      'hn.name as ps_name',
      'sd.name as sub_div_name',
      'p.name as person_name',
      'p.age',
      'p.mobile',
      'r.legacy_ref as fir_no',
      'r.registration_date',
      'ad.custody_status'
    )
    .orderBy(['sd.name', 'hn.name']);
}
