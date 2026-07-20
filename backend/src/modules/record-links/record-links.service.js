import { v4 as uuidv4 } from 'uuid';
import db from '../../config/db.js';
import * as eventBus from '../../events/eventBus.js';

export const getLinkTypes = async () => {
  return db('link_type_registry').where({ is_active: true }).orderBy('code');
};

export const getLinksForRecord = async (recordId) => {
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

  return result.rows || [];
};

// Fetch a single link row (with its link-type code) — used by the controller to resolve
// the owning/source record before an access check on delete (P5.6 / RECORD-LINKAGE.md).
export const getLinkById = async (linkId) => {
  return db('record_links as rl')
    .select('rl.*', 'ltr.code as link_type_code')
    .join('link_type_registry as ltr', 'rl.link_type_id', 'ltr.id')
    .where('rl.id', linkId)
    .first();
};

export const createLink = async ({ sourceRecordId, targetRecordId, linkTypeCode, userId, metadata = {} }) => {
  const linkType = await db('link_type_registry')
    .where({ code: linkTypeCode, is_active: true })
    .first();
  if (!linkType) {
    const err = new Error(`Unknown or inactive link type: ${linkTypeCode}`);
    err.status = 404;
    throw err;
  }

  const sourceRecord = await db('records').where({ id: sourceRecordId }).first();
  if (!sourceRecord) {
    const err = new Error('Source record not found');
    err.status = 404;
    throw err;
  }

  const targetRecord = await db('records').where({ id: targetRecordId }).first();
  if (!targetRecord) {
    const err = new Error('Target record not found');
    err.status = 404;
    throw err;
  }

  if (sourceRecord.record_type !== linkType.source_record_type) {
    const err = new Error(`Source record type mismatch: expected ${linkType.source_record_type}, got ${sourceRecord.record_type}`);
    err.status = 422;
    throw err;
  }

  if (targetRecord.record_type !== linkType.target_record_type) {
    const err = new Error(`Target record type mismatch: expected ${linkType.target_record_type}, got ${targetRecord.record_type}`);
    err.status = 422;
    throw err;
  }

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
  } catch (err) {
    if (err.code === '23505' || (err.message && err.message.includes('unique'))) {
      const conflict = new Error('Link already exists between these two records');
      conflict.status = 409;
      throw conflict;
    }
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

  return link;
};

export const deleteLink = async (linkId, userId) => {
  const link = await getLinkById(linkId);

  if (!link) {
    const err = new Error('Link not found');
    err.status = 404;
    throw err;
  }

  await db('record_links').where({ id: linkId }).delete();

  await eventBus.publish('link.deleted', {
    link_id: linkId,
    link_type_code: link.link_type_code,
    source_record_id: link.source_record_id,
    target_record_id: link.target_record_id,
    deleted_by: userId,
    action: 'LINK_DELETED'
  });
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
  if (jurisdictionQuery.ps_id) query = query.where('records.ps_id', jurisdictionQuery.ps_id);
  if (jurisdictionQuery.sub_div_id) query = query.where('records.sub_div_id', jurisdictionQuery.sub_div_id);
  if (jurisdictionQuery.district_id) query = query.where('records.district_id', jurisdictionQuery.district_id);

  // Optional narrowing within the enforced scope (meaningful for globally-scoped roles only —
  // ANDed with the predicates above, so a scoped user's psId/districtId param can never widen).
  if (psId) query = query.where('records.ps_id', psId);
  if (districtId) query = query.where('records.district_id', districtId);

  if (searchTerm) {
    query = query.where((b) => {
      b.where('p.name', 'ILIKE', `%${searchTerm}%`)
        .orWhereRaw('p.nick_names::text ILIKE ?', [`%${searchTerm}%`]);
    });
  }
  if (fatherName) {
    query = query.where('p.relative_name', 'ILIKE', `%${fatherName}%`);
  }

  return query.limit(limit).orderBy('records.record_date', 'desc');
};
