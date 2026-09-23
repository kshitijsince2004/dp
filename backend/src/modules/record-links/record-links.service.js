import { v4 as uuidv4 } from 'uuid';
import db from '../../config/db.js';
import * as eventBus from '../../events/eventBus.js';
import { getLogger } from '../../utils/logger.js';

// Logging-instrumentation-2026-07-22 (B5): matches records.service.js style. HANDOFF §5 calls
// out record-links specifically: "log person-search + link op access checks."
const log = getLogger('record-links.service');

export const getLinkTypes = async () => {
  log.debug('getLinkTypes: enter');
  const rows = await db('link_type_registry').where({ is_active: true }).orderBy('code');
  log.debug('getLinkTypes: exit', { count: rows.length });
  return rows;
};

export const getLinksForRecord = async (recordId) => {
  log.debug('getLinksForRecord: enter', { recordId });
  const result = await db.raw(`
    SELECT
      rl.id,
      rl.metadata,
      rl.created_at AS linked_at,
      ltr.code            AS link_type_code,
      ltr.label           AS link_type_label,
      ltr.cardinality,
      CASE WHEN rl.source_record_id = :recordId THEN 'source' ELSE 'target' END AS my_role,
      CASE WHEN rl.source_record_id = :recordId
           THEN rl.target_record_id
           ELSE rl.source_record_id
      END AS linked_record_id,
      r.record_type       AS linked_record_type,
      r.current_status    AS linked_record_status,
      r.record_date       AS linked_record_date,
      ps.name             AS linked_ps_name,
      u.name              AS linked_by_name
    FROM record_links rl
    JOIN link_type_registry ltr ON rl.link_type_id = ltr.id
    JOIN records r ON r.id = CASE
        WHEN rl.source_record_id = :recordId THEN rl.target_record_id
        ELSE rl.source_record_id
      END
    JOIN hierarchy_nodes ps ON ps.id = r.ps_id
    JOIN users u ON rl.created_by = u.id
    WHERE rl.source_record_id = :recordId OR rl.target_record_id = :recordId
    ORDER BY rl.created_at DESC
  `, { recordId });

  const explicitLinks = result.rows || [];
  const linkedIds = new Set(explicitLinks.map(l => l.linked_record_id));

  // Dynamic FIR <-> Arrest linkage lookup based on fir_no
  try {
    const currentRecord = await db('records').where({ id: recordId }).first();
    if (currentRecord) {
      if (currentRecord.record_type === 'CASE') {
        const firRow = await db('fir_details').where({ record_id: recordId }).first();
        if (firRow?.fir_no) {
          const firNoStr = String(firRow.fir_no).trim();
          const matchSnippet = firNoStr.length >= 6 ? firNoStr.slice(-6) : firNoStr;
          const arrestMatches = await db('arrest_details as arr')
            .join('records as r', 'arr.record_id', 'r.id')
            .join('hierarchy_nodes as ps', 'r.ps_id', 'ps.id')
            .leftJoin('users as u', 'r.created_by', 'u.id')
            .leftJoin('persons as p', function () {
              this.on('p.record_id', '=', 'r.id').andOnVal('p.role', '=', 'ARRESTEE');
            })
            .whereNot('r.id', recordId)
            .where((b) => {
              b.where('arr.fir_no', firNoStr)
                .orWhere('arr.fir_no', 'ILIKE', `%${matchSnippet}%`);
            })
            .select(
              'r.id', 'r.record_type', 'r.current_status', 'r.record_date', 'r.created_at',
              'ps.name as ps_name', 'u.name as creator_name', 'arr.fir_no', 'arr.case_status',
              'p.name as person_name'
            );

          for (const match of arrestMatches) {
            if (!linkedIds.has(match.id)) {
              linkedIds.add(match.id);
              explicitLinks.push({
                id: `auto-link-${recordId}-${match.id}`,
                metadata: {},
                linked_at: match.created_at || match.record_date,
                link_type_code: 'FIR_ARREST',
                link_type_label: 'Arrest Linked to FIR',
                link_type_label_en: 'Arrest Linked to FIR',
                cardinality: '1:N',
                my_role: 'source',
                linked_record_id: match.id,
                linked_record_type: 'ARREST',
                linked_record_status: match.current_status,
                linked_record_date: match.record_date,
                linked_ps_name: match.ps_name,
                linked_by_name: match.creator_name || 'System',
                linked_record_data: {
                  arrested_name: match.person_name || 'Arrested Person',
                  crime_head: match.case_status || 'Arrest Record',
                  fir_no: match.fir_no
                }
              });
            }
          }
        }
      } else if (currentRecord.record_type === 'ARREST') {
        const arrRow = await db('arrest_details').where({ record_id: recordId }).first();
        if (arrRow?.fir_no) {
          const firNoStr = String(arrRow.fir_no).trim();
          const matchSnippet = firNoStr.length >= 6 ? firNoStr.slice(-6) : firNoStr;
          const caseMatches = await db('fir_details as fir')
            .join('records as r', 'fir.record_id', 'r.id')
            .join('hierarchy_nodes as ps', 'r.ps_id', 'ps.id')
            .leftJoin('users as u', 'r.created_by', 'u.id')
            .leftJoin('ref.local_heads as lh', 'fir.local_head_id', 'lh.local_head_cd')
            .whereNot('r.id', recordId)
            .where((b) => {
              b.where('fir.fir_no', firNoStr)
                .orWhere('fir.fir_no', 'ILIKE', `%${matchSnippet}%`);
            })
            .select(
              'r.id', 'r.record_type', 'r.current_status', 'r.record_date', 'r.created_at',
              'ps.name as ps_name', 'u.name as creator_name', 'fir.fir_no', 'lh.local_head'
            );

          for (const match of caseMatches) {
            if (!linkedIds.has(match.id)) {
              linkedIds.add(match.id);
              explicitLinks.push({
                id: `auto-link-${recordId}-${match.id}`,
                metadata: {},
                linked_at: match.created_at || match.record_date,
                link_type_code: 'FIR_ARREST',
                link_type_label: 'FIR / Case Record',
                link_type_label_en: 'FIR / Case Record',
                cardinality: '1:N',
                my_role: 'target',
                linked_record_id: match.id,
                linked_record_type: 'CASE',
                linked_record_status: match.current_status,
                linked_record_date: match.record_date,
                linked_ps_name: match.ps_name,
                linked_by_name: match.creator_name || 'System',
                linked_record_data: {
                  fir_no: match.fir_no,
                  local_head: match.local_head || 'Case Record'
                }
              });
            }
          }
        }
      }
    }
  } catch (err) {
    log.warn('getLinksForRecord: dynamic link resolution warning', { recordId, err: err.message });
  }

  log.debug('getLinksForRecord: exit', { recordId, count: explicitLinks.length });
  return explicitLinks;
};

// Fetch a single link row (with its link-type code) — used by the controller to resolve
// the owning/source record before an access check on delete (P5.6 / RECORD-LINKAGE.md).
export const getLinkById = async (linkId) => {
  log.debug('getLinkById: enter', { linkId });
  const row = await db('record_links as rl')
    .select('rl.*', 'ltr.code as link_type_code')
    .join('link_type_registry as ltr', 'rl.link_type_id', 'ltr.id')
    .where('rl.id', linkId)
    .first();
  log.debug('getLinkById: exit', { linkId, found: !!row });
  return row;
};

export const createLink = async ({ sourceRecordId, targetRecordId, linkTypeCode, userId, metadata = {} }) => {
  log.debug('createLink: enter', { sourceRecordId, targetRecordId, linkTypeCode, userId });
  const linkType = await db('link_type_registry')
    .where({ code: linkTypeCode, is_active: true })
    .first();
  if (!linkType) {
    log.warn('createLink: rejected — unknown or inactive link type', { linkTypeCode });
    const err = new Error(`Unknown or inactive link type: ${linkTypeCode}`);
    err.status = 404;
    throw err;
  }

  const sourceRecord = await db('records').where({ id: sourceRecordId }).first();
  if (!sourceRecord) {
    log.warn('createLink: rejected — source record not found', { sourceRecordId });
    const err = new Error('Source record not found');
    err.status = 404;
    throw err;
  }

  const targetRecord = await db('records').where({ id: targetRecordId }).first();
  if (!targetRecord) {
    log.warn('createLink: rejected — target record not found', { targetRecordId });
    const err = new Error('Target record not found');
    err.status = 404;
    throw err;
  }

  if (sourceRecord.record_type !== linkType.source_record_type) {
    log.warn('createLink: rejected — source record type mismatch', {
      sourceRecordId, expected: linkType.source_record_type, actual: sourceRecord.record_type,
    });
    const err = new Error(`Source record type mismatch: expected ${linkType.source_record_type}, got ${sourceRecord.record_type}`);
    err.status = 422;
    throw err;
  }

  if (targetRecord.record_type !== linkType.target_record_type) {
    log.warn('createLink: rejected — target record type mismatch', {
      targetRecordId, expected: linkType.target_record_type, actual: targetRecord.record_type,
    });
    const err = new Error(`Target record type mismatch: expected ${linkType.target_record_type}, got ${targetRecord.record_type}`);
    err.status = 422;
    throw err;
  }
  log.debug('createLink: type checks passed', { sourceRecordId, targetRecordId, linkTypeCode });

  const id = uuidv4();
  try {
    await db('record_links').insert({
      id,
      link_type_id: linkType.id,
      source_record_id: sourceRecordId,
      target_record_id: targetRecordId,
      metadata: JSON.stringify(metadata),
      created_by: userId,
      created_at: new Date().toISOString()
    });
    log.info('createLink: wrote record_links row', { linkId: id, linkTypeCode, sourceRecordId, targetRecordId });
  } catch (err) {
    if (err.code === '23505' || (err.message && err.message.includes('unique'))) {
      log.warn('createLink: rejected — duplicate link (unique constraint)', { sourceRecordId, targetRecordId, linkTypeCode });
      const conflict = new Error('Link already exists between these two records');
      conflict.status = 409;
      throw conflict;
    }
    log.error('createLink: insert failed', { sourceRecordId, targetRecordId, linkTypeCode, err });
    throw err;
  }

  const link = await db('record_links').where({ id }).first();

  await eventBus.publish('link.created', {
    link_id: id,
    link_type_code: linkType.code,
    source_record_id: sourceRecordId,
    target_record_id: targetRecordId,
    created_by: userId,
    action: 'LINK_CREATED'
  });
  log.debug('createLink: published link.created', { linkId: id });

  log.info('createLink: exit', { linkId: id, linkTypeCode, sourceRecordId, targetRecordId });
  return link;
};

export const deleteLink = async (linkId, userId) => {
  log.debug('deleteLink: enter', { linkId, userId });
  const link = await getLinkById(linkId);

  if (!link) {
    log.warn('deleteLink: rejected — link not found', { linkId });
    const err = new Error('Link not found');
    err.status = 404;
    throw err;
  }

  await db('record_links').where({ id: linkId }).delete();
  log.info('deleteLink: deleted record_links row', { linkId, linkTypeCode: link.link_type_code });

  await eventBus.publish('link.deleted', {
    link_id: linkId,
    link_type_code: link.link_type_code,
    source_record_id: link.source_record_id,
    target_record_id: link.target_record_id,
    deleted_by: userId,
    action: 'LINK_DELETED'
  });
  log.debug('deleteLink: published link.deleted', { linkId });
  log.info('deleteLink: exit', { linkId, userId });
};

// Person search across ARREST records (RECORD-LINKAGE.md §8, rebuilt for the typed schema —
// the old jsonb blob column on the spine is gone). Arrestee facts live in `persons`
// (role=ARRESTEE), joined THROUGH the `records` spine (baseline P5.3: detail/person rows are
// never queried standalone). jurisdictionQuery is the enforced scope (P5) and is applied unconditionally;
// psId/districtId are optional narrowing params for globally-scoped roles and are ANDed in,
// so they can never widen beyond what enforceScope already granted.
export const searchPersonAcrossArrests = async ({
  searchTerm,
  fatherName,
  jurisdictionQuery = {},
  psId,
  districtId,
  limit = 50
}) => {
  log.debug('searchPersonAcrossArrests: enter', { searchTerm, fatherName, jurisdictionQuery, psId, districtId, limit });
  let query = db('persons as p')
    .join('records', 'p.record_id', 'records.id')
    .join('hierarchy_nodes as ps', 'records.ps_id', 'ps.id')
    .leftJoin('arrestee_details as ad', 'p.id', 'ad.person_id')
    .leftJoin('arrest_details as arr', 'records.id', 'arr.record_id')
    .leftJoin('locations as loc', 'p.present_location_id', 'loc.id')
    .where('records.record_type', 'ARREST')
    .where('p.role', 'ARRESTEE')
    .select(
      'p.id as person_id',
      'p.name as name',
      'p.relative_name as relative_name',
      'p.relation_type as relation_type',
      'p.gender as gender',
      'p.age as age',
      'p.mobile as mobile',
      db.raw(`NULLIF(CONCAT_WS(', ', loc.house_no, loc.street, loc.colony, loc.city_town_village, loc.district, loc.state), '') AS address`),
      'records.id as record_id',
      'records.record_type as record_type',
      'records.record_date as record_date',
      'records.current_status as current_status',
      'ad.arrest_date as arrest_date',
      'arr.fir_no as fir_no',
      'ps.name as ps_name'
    );

  // Enforced jurisdiction scope (P5) — from enforceScope, never optional.
  if (jurisdictionQuery.ps_id) { query = query.where('records.ps_id', jurisdictionQuery.ps_id); log.debug('searchPersonAcrossArrests: scoped by ps_id', { psId: jurisdictionQuery.ps_id }); }
  if (jurisdictionQuery.sub_div_id) { query = query.where('records.sub_div_id', jurisdictionQuery.sub_div_id); log.debug('searchPersonAcrossArrests: scoped by sub_div_id', { subDivId: jurisdictionQuery.sub_div_id }); }
  if (jurisdictionQuery.district_id) { query = query.where('records.district_id', jurisdictionQuery.district_id); log.debug('searchPersonAcrossArrests: scoped by district_id', { districtId: jurisdictionQuery.district_id }); }

  // Optional narrowing within the enforced scope (meaningful for globally-scoped roles only —
  // ANDed with the predicates above, so a scoped user's psId/districtId param can never widen).
  if (psId) { query = query.where('records.ps_id', psId); log.debug('searchPersonAcrossArrests: narrowed by psId param', { psId }); }
  if (districtId) { query = query.where('records.district_id', districtId); log.debug('searchPersonAcrossArrests: narrowed by districtId param', { districtId }); }

  if (searchTerm) {
    query = query.where((b) => {
      b.where('p.name', 'ILIKE', `%${searchTerm}%`)
        .orWhereRaw('p.nick_names::text ILIKE ?', [`%${searchTerm}%`]);
    });
    log.debug('searchPersonAcrossArrests: filtered by searchTerm (name/nick_names)', { searchTerm });
  }
  if (fatherName) {
    query = query.where('p.relative_name', 'ILIKE', `%${fatherName}%`);
    log.debug('searchPersonAcrossArrests: filtered by fatherName', { fatherName });
  }

  const results = await query.limit(limit).orderBy('records.record_date', 'desc');
  log.info('searchPersonAcrossArrests: exit', { resultCount: results.length, searchTerm, fatherName });
  return results;
};
