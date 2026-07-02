import { v4 as uuidv4 } from 'uuid';
import db from '../../config/db.js';
import * as eventBus from '../../events/eventBus.js';
import { logger } from '../../utils/logger.js';

const isPostgres = () => {
  const c = db.client.config.client;
  return c === 'postgresql' || c === 'pg';
};

export const getLinkTypes = async () => {
  return db('link_type_registry').where({ is_active: true }).orderBy('code');
};

export const getLinksForRecord = async (recordId) => {
  if (!isPostgres()) return [];
  try {
    const result = await db.raw(`
      SELECT
        rl.id,
        rl.metadata,
        rl.created_at AS linked_at,
        ltr.code            AS link_type_code,
        ltr.label_en        AS link_type_label_en,
        ltr.label_hi        AS link_type_label_hi,
        ltr.cardinality,
        CASE WHEN rl.source_record_id = :recordId THEN 'source' ELSE 'target' END AS my_role,
        CASE WHEN rl.source_record_id = :recordId
             THEN rl.target_record_id
             ELSE rl.source_record_id
        END AS linked_record_id,
        r.record_type       AS linked_record_type,
        r.data              AS linked_record_data,
        r.current_status    AS linked_record_status,
        r.record_date       AS linked_record_date,
        ps.name_en          AS linked_ps_name,
        u.name_en           AS linked_by_name
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

    return (result.rows || []).map(row => ({
      ...row,
      linked_record_data: typeof row.linked_record_data === 'string'
        ? JSON.parse(row.linked_record_data)
        : row.linked_record_data
    }));
  } catch (err) {
    logger.warn('[RecordLinks] getLinksForRecord failed (table may not exist yet):', err.message);
    return [];
  }
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
  const link = await db('record_links as rl')
    .select('rl.*', 'ltr.code as link_type_code')
    .join('link_type_registry as ltr', 'rl.link_type_id', 'ltr.id')
    .where('rl.id', linkId)
    .first();

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

export const searchPersonAcrossArrests = async ({ searchTerm, fatherName, psId, districtId, limit = 50 }) => {
  const pg = isPostgres();
  const jsonExtract = (field) => {
    return pg
      ? `CAST(records.data AS jsonb)->>'${field}'`
      : `json_extract(records.data, '$.${field}')`;
  };

  let query = db('records')
    .select(
      'records.id',
      'records.current_status',
      'records.record_date',
      'records.ps_id',
      db.raw(`${jsonExtract('arrested_name')} AS arrested_name`),
      db.raw(`${jsonExtract('fullName')} AS full_name`),
      db.raw(`${jsonExtract('father_name')} AS father_name`),
      db.raw(`${jsonExtract('fatherName')} AS father_name_alt`),
      db.raw(`${jsonExtract('parents_name')} AS parents_name`),
      db.raw(`${jsonExtract('arrested_address')} AS address`),
      db.raw(`${jsonExtract('address')} AS address_alt`),
      db.raw(`${jsonExtract('arrest_date')} AS arrest_date`),
      db.raw(`${jsonExtract('dateOfArrest')} AS arrest_date_alt`),
      db.raw(`${jsonExtract('crime_head')} AS crime_head`),
      db.raw(`${jsonExtract('crimeHead')} AS crime_head_alt`),
      db.raw(`${jsonExtract('uid')} AS uid`),
      'ps.name_en AS ps_name'
    )
    .join('hierarchy_nodes as ps', 'records.ps_id', 'ps.id')
    .where('records.record_type', 'ARREST');

  if (psId) query = query.where('records.ps_id', psId);
  if (districtId) query = query.where('records.district_id', districtId);

  if (searchTerm) {
    if (pg) {
      query = query.whereRaw('records.data::text ILIKE ?', [`%${searchTerm}%`]);
    } else {
      query = query.where('records.data', 'LIKE', `%${searchTerm}%`);
    }
  }
  if (fatherName) {
    if (pg) {
      query = query.whereRaw(`(${jsonExtract('father_name')} ILIKE ? OR ${jsonExtract('fatherName')} ILIKE ? OR ${jsonExtract('parents_name')} ILIKE ?)`, [`%${fatherName}%`, `%${fatherName}%`, `%${fatherName}%`]);
    } else {
      query = query.where('records.data', 'LIKE', `%${fatherName}%`);
    }
  }

  return query.limit(limit).orderBy('records.record_date', 'desc');
};
