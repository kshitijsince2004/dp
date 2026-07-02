import { v4 as uuidv4 } from 'uuid';
import db from '../../config/db.js';
import * as eventBus from '../../events/eventBus.js';
import { computeRowHash, getPreviousHash } from '../../utils/hash.js';
import { getLinksForRecord } from '../record-links/record-links.service.js';

// Helpers
const calculateDiff = (oldData, newData) => {
  const diff = [];
  const allKeys = new Set([...Object.keys(oldData), ...Object.keys(newData)]);
  for (const key of allKeys) {
    if (JSON.stringify(oldData[key]) !== JSON.stringify(newData[key])) {
      diff.push({
        field_key: key,
        old_value: oldData[key] ?? '',
        new_value: newData[key] ?? ''
      });
    }
  }
  return diff;
};

const parseJsonField = (val) => {
  if (val === null || val === undefined) return null;
  if (typeof val === 'string') {
    try { return JSON.parse(val); } catch (e) { return val; }
  }
  return val;
};

export const TYPE_CODES = {
  CASE: 'CSE', ARREST: 'ARR', PCR_CALL: 'PCR', MISSING: 'MSP', UIDB: 'UDB'
};

export const generateUID = async (recordType, psId, dateStr, trx = db) => {
  const ps = await trx('hierarchy_nodes').where({ id: psId }).first();
  const psCode = ps?.code || 'PS000';
  const year = String(new Date(dateStr).getFullYear());
  const typeCode = TYPE_CODES[recordType] || recordType.substring(0, 3).toUpperCase();
  const countRow = await trx('records')
    .where({ ps_id: psId, record_type: recordType })
    .whereRaw('EXTRACT(YEAR FROM record_date::date) = ?', [parseInt(year)])
    .count('* as count')
    .first();
  const seq = String((parseInt(countRow.count, 10) || 0) + 1).padStart(6, '0');
  return `${typeCode}/${year}/${psCode}/${seq}`;
};

const validateSelectFields = async (trx, recordType, data) => {
  const allFields = await trx('field_registry').where('is_active', true);
  const selectFields = allFields.filter(f => {
    if (f.field_type !== 'SELECT') return false;
    try {
      const types = typeof f.applicable_record_types === 'string'
        ? JSON.parse(f.applicable_record_types)
        : f.applicable_record_types;
      return Array.isArray(types) && types.map(t => t.toUpperCase()).includes(recordType.toUpperCase());
    } catch (e) {
      return false;
    }
  });

  for (const f of selectFields) {
    const val = data[f.field_key];
    if (val !== undefined && val !== null && val !== '') {
      let options = [];
      try {
        options = typeof f.options === 'string' ? JSON.parse(f.options) : f.options;
      } catch (e) {
        options = [];
      }
      if (Array.isArray(options) && options.length > 0) {
        const allowedValues = options.map(o => (o && typeof o === 'object') ? o.value : o);
        if (Array.isArray(val)) {
          for (const item of val) {
            if (!allowedValues.includes(item)) {
              const err = new Error(`Invalid value '${item}' for field '${f.field_key}'. Allowed values: ${allowedValues.join(', ')}`);
              err.status = 422;
              throw err;
            }
          }
        } else {
          if (!allowedValues.includes(val)) {
            const err = new Error(`Invalid value '${val}' for field '${f.field_key}'. Allowed values: ${allowedValues.join(', ')}`);
            err.status = 422;
            throw err;
          }
        }
      }
    }
  }
};

const mergeConditionalFields = (data) => {
  if (!data) return data;

  // Merge sections
  const conditionalSectionKeys = ['ipc_sections', 'excise_sections', 'arms_sections', 'gambling_sections', 'other_sections'];
  for (const key of conditionalSectionKeys) {
    if (data[key] !== undefined && data[key] !== null && data[key] !== '') {
      data.sections = data[key];
      break;
    }
  }

  // Merge major_head
  const conditionalMajorHeadKeys = ['ipc_major_head', 'excise_major_head', 'arms_major_head', 'gambling_major_head', 'other_major_head'];
  for (const key of conditionalMajorHeadKeys) {
    if (data[key] !== undefined && data[key] !== null && data[key] !== '') {
      data.major_head = data[key];
      break;
    }
  }

  // Merge minor_head
  const conditionalMinorHeadKeys = [
    'theft_minor_head', 'murder_minor_head', 'hurt_minor_head', 'cheating_minor_head', 'robbery_minor_head',
    'excise_minor_head', 'arms_minor_head', 'gambling_minor_head', 'other_minor_head'
  ];
  for (const key of conditionalMinorHeadKeys) {
    if (data[key] !== undefined && data[key] !== null && data[key] !== '') {
      data.minor_head = data[key];
      break;
    }
  }

  // Handle occurrence_from_date_time extraction for database/report compatibility
  if (data.occurrence_from_date_time) {
    const parts = data.occurrence_from_date_time.split('T');
    if (parts[0]) data.occurrence_date = parts[0];
    if (parts[1]) data.occurrence_time = parts[1];
  }

  // Construct complainant_name and complainant_address from granular fields for backward compatibility
  if (data.complainant_first_name) {
    data.complainant_name = [
      data.complainant_first_name,
      data.complainant_middle_name,
      data.complainant_last_name
    ].filter(Boolean).join(' ');
  }
  if (data.complainant_relation_type && data.complainant_relative_name) {
    if (['Father', 'Husband'].includes(data.complainant_relation_type)) {
      data.complainant_father_husband_name = data.complainant_relative_name;
    }
  }
  if (data.complainant_house_no || data.complainant_street || data.complainant_colony || data.complainant_city_town_village) {
    data.complainant_address = [
      data.complainant_house_no ? `House No. ${data.complainant_house_no}` : '',
      data.complainant_street,
      data.complainant_colony,
      data.complainant_city_town_village,
      data.complainant_tehsil_block_mandal,
      data.complainant_district,
      data.complainant_state,
      data.complainant_pincode
    ].filter(Boolean).join(', ');
  }

  // Handle auto-sync for permanent address if same toggled
  if (data.complainant_perm_same === 'Yes' || data.complainant_perm_same === true) {
    data.complainant_perm_house_no = data.complainant_house_no;
    data.complainant_perm_street = data.complainant_street;
    data.complainant_perm_colony = data.complainant_colony;
    data.complainant_perm_city_town_village = data.complainant_city_town_village;
    data.complainant_perm_tehsil_block_mandal = data.complainant_tehsil_block_mandal;
    data.complainant_perm_country = data.complainant_country;
    data.complainant_perm_state = data.complainant_state;
    data.complainant_perm_district = data.complainant_district;
    data.complainant_perm_police_station = data.complainant_police_station;
    data.complainant_perm_pincode = data.complainant_pincode;
  }

  return data;
};

// Services
export const listRecords = async (recordType, filters, jurisdictionQuery) => {
  let query = db('records').select(
    'records.*',
    'ps.name_en as ps_name',
    'dist.name_en as district_name',
    'u.username as creator_name'
  )
    .join('hierarchy_nodes as ps', 'records.ps_id', 'ps.id')
    .join('hierarchy_nodes as dist', 'records.district_id', 'dist.id')
    .join('users as u', 'records.created_by', 'u.id');

  // Apply RBAC geographical boundary filters
  if (jurisdictionQuery.ps_id) {
    query = query.where('records.ps_id', jurisdictionQuery.ps_id);
  }
  if (jurisdictionQuery.district_id) {
    query = query.where('records.district_id', jurisdictionQuery.district_id);
  }
  if (jurisdictionQuery.sub_div_id) {
    query = query.where('records.sub_div_id', jurisdictionQuery.sub_div_id);
  }

  // Scoped filters
  if (recordType && recordType !== 'ALL') {
    query = query.where('records.record_type', recordType);
  }

  if (filters.status) {
    if (Array.isArray(filters.status)) {
      query = query.whereIn('records.current_status', filters.status);
    } else {
      query = query.where('records.current_status', filters.status);
    }
  }

  if (filters.dateFrom) {
    query = query.where('records.record_date', '>=', filters.dateFrom);
  }

  if (filters.dateTo) {
    query = query.where('records.record_date', '<=', filters.dateTo);
  }

  if (filters.search) {
    const isPostgres = db.client.config.client === 'postgresql' || db.client.config.client === 'pg';
    if (isPostgres) {
      query = query.whereRaw("records.data::text ILIKE ?", [`%${filters.search}%`]);
    } else {
      query = query.where('records.data', 'LIKE', `%${filters.search}%`);
    }
  }

  // Filter by linked case UUID (e.g. show only arrests linked to a specific case)
  if (filters.linked_case_id) {
    query = query.whereExists(function () {
      this.select('*').from('record_links')
        .whereRaw('record_links.target_record_id = records.id')
        .where('record_links.source_record_id', filters.linked_case_id);
    });
  }

  // Filter by FIR number of the linked case
  if (filters.linked_fir_no) {
    const isPostgres = db.client.config.client === 'postgresql' || db.client.config.client === 'pg';
    query = query.whereExists(function () {
      const sub = this.select('*').from('record_links')
        .whereRaw('record_links.target_record_id = records.id')
        .join('records as case_rec', 'case_rec.id', 'record_links.source_record_id');
      if (isPostgres) {
        sub.whereRaw("case_rec.data->>'fir_no' = ?", [filters.linked_fir_no]);
      } else {
        sub.whereRaw("json_extract(case_rec.data, '$.fir_no') = ?", [filters.linked_fir_no]);
      }
    });
  }

  const rawRecords = await query.orderBy('records.created_at', 'desc');

  return rawRecords.map(r => ({
    ...r,
    data: parseJsonField(r.data)
  }));
};

export const getRecordDetails = async (id) => {
  const record = await db('records')
    .select('records.*', 'ps.name_en as ps_name', 'dist.name_en as district_name')
    .join('hierarchy_nodes as ps', 'records.ps_id', 'ps.id')
    .join('hierarchy_nodes as dist', 'records.district_id', 'dist.id')
    .where('records.id', id)
    .first();

  if (!record) return null;

  record.data = parseJsonField(record.data);

  // Fetch revisions
  const revisions = await db('record_revisions')
    .select('record_revisions.*', 'u.username', 'u.name_en as user_fullname')
    .join('users as u', 'record_revisions.changed_by', 'u.id')
    .where('record_revisions.record_id', id)
    .orderBy('record_revisions.revision_number', 'asc');

  revisions.forEach(rev => {
    rev.field_changes = parseJsonField(rev.field_changes);
  });

  // Fetch workflow transitions
  const transitions = await db('workflow_transitions')
    .select('workflow_transitions.*', 'u.username')
    .join('users as u', 'workflow_transitions.performed_by', 'u.id')
    .where('workflow_transitions.record_id', id)
    .orderBy('workflow_transitions.performed_at', 'asc');

  transitions.forEach(tr => {
    tr.target_fields = parseJsonField(tr.target_fields);
  });

  // Fetch Custom Field Values (EAV)
  const customValues = await db('custom_field_values')
    .select('custom_field_values.*', 'd.field_label', 'd.field_key', 'd.field_type')
    .join('custom_field_definitions as d', 'custom_field_values.field_definition_id', 'd.id')
    .where('custom_field_values.record_id', id);

  let linkedRecords = [];
  try {
    linkedRecords = await getLinksForRecord(id);
  } catch (_e) {
    linkedRecords = [];
  }

  // Fetch persons and properties (graceful — tables may not exist in older deploys)
  let persons = [];
  let properties = [];
  try {
    persons = await db('record_persons')
      .where({ record_id: id })
      .orderBy('sort_order', 'asc');
    persons.forEach(p => { p.data = parseJsonField(p.data) || {}; });

    properties = await db('record_properties')
      .where({ record_id: id })
      .orderBy('sort_order', 'asc');
  } catch (_e) {
    // Tables not yet migrated — degrade gracefully
  }

  return {
    record,
    revisions,
    transitions,
    customFields: customValues,
    linkedRecords,
    persons,
    properties,
  };
};

const extractPersonSearchCols = (personType, data) => {
  const prefix = personType.toLowerCase();
  return {
    first_name: data[`${prefix}_first_name`] || null,
    last_name: data[`${prefix}_last_name`] || null,
    mobile: data[`${prefix}_mobile`] || null,
    city: data[`${prefix}_city_town_village`] || null,
    district: data[`${prefix}_district`] || null,
  };
};

const MAPPED_PROP_KEYS = new Set([
  'property_major_category', 'property_minor_category',
  'property_details', 'property_stolen_recovered',
]);

const buildPropertyRow = (prop, i, recordId, hydratedData) => {
  const extraData = Object.fromEntries(
    Object.entries(prop).filter(([k, v]) =>
      !MAPPED_PROP_KEYS.has(k) && v !== undefined && v !== null && v !== ''
    )
  );
  return {
    id: uuidv4(),
    record_id: recordId,
    uid: hydratedData.uid || null,
    fir_no: hydratedData.fir_no || null,
    major_category: prop.property_major_category || null,
    minor_category: prop.property_minor_category || null,
    status: prop.property_stolen_recovered || null,
    details: prop.property_details || null,
    extra_data: Object.keys(extraData).length > 0 ? JSON.stringify(extraData) : null,
    sort_order: i,
    created_at: new Date().toISOString(),
    updated_at: new Date().toISOString(),
  };
};

export const createRecord = async (user, recordType, recordDate, data, ipAddress, { persons = [], properties = [] } = {}) => {
  const mergedData = mergeConditionalFields({ ...data });
  if (recordType === 'ARREST' && Array.isArray(persons)) {
    const arrestedPerson = persons.find(p => p.person_type === 'ARRESTED');
    if (arrestedPerson && arrestedPerson.data) {
      if (arrestedPerson.data.status) mergedData.status = arrestedPerson.data.status;
      if (arrestedPerson.data.other_status_reason) mergedData.other_status_reason = arrestedPerson.data.other_status_reason;
      if (arrestedPerson.data.recovery) mergedData.recovery = arrestedPerson.data.recovery;
    }
  }
  const dbRecord = await db.transaction(async (trx) => {
    await validateSelectFields(trx, recordType, mergedData);
    const id = uuidv4();
    const uid = await generateUID(recordType, user.ps_id, recordDate, trx);

    // Save records row
    const recordPayload = {
      id,
      record_type: recordType,
      ps_id: user.ps_id,
      district_id: user.district_id,
      sub_div_id: user.sub_div_id,
      data: JSON.stringify(mergedData),
      current_status: 'DRAFT',
      current_level: 'PS',
      record_date: recordDate,
      created_by: user.id,
      updated_by: user.id,
      created_at: new Date().toISOString(),
      updated_at: new Date().toISOString()
    };

    // Inject generated UID into records data JSON block for search consistency
    const hydratedData = { ...mergedData, uid };
    recordPayload.data = JSON.stringify(hydratedData);

    await trx('records').insert(recordPayload);

    // Write initial revision (Pillar 2)
    const revisionPayload = {
      id: uuidv4(),
      record_id: id,
      revision_number: 1,
      changed_by: user.id,
      changed_at: new Date().toISOString(),
      level: 'PS',
      change_type: 'CREATE',
      field_changes: JSON.stringify(calculateDiff({}, hydratedData)),
      ip_address: ipAddress
    };

    const prev_hash = null;
    const row_hash = computeRowHash({
      record_id: id,
      revision_number: 1,
      changed_by: user.id,
      changed_at: revisionPayload.changed_at,
      field_changes: revisionPayload.field_changes
    }, prev_hash);

    revisionPayload.prev_hash = prev_hash;
    revisionPayload.row_hash = row_hash;

    await trx('record_revisions').insert(revisionPayload);

    // Write audit log entry
    await trx('audit_logs').insert({
      id: uuidv4(),
      table_name: 'records',
      record_id: id,
      action: 'CREATE',
      changed_by_id: user.id,
      changed_by_role: user.role,
      changed_at: new Date().toISOString(),
      new_value: JSON.stringify(hydratedData),
      ip_address: ipAddress
    });

    // Persist persons
    if (persons.length > 0) {
      const personRows = persons.map((p, i) => ({
        id: uuidv4(),
        record_id: id,
        person_type: p.person_type,
        ...extractPersonSearchCols(p.person_type, p.data || {}),
        data: JSON.stringify(p.data || {}),
        sort_order: i,
        created_at: new Date().toISOString(),
      }));
      await trx('record_persons').insert(personRows);
    }

    // Persist properties
    if (properties.length > 0) {
      const propertyRows = properties.map((prop, i) => buildPropertyRow(prop, i, id, hydratedData));
      await trx('record_properties').insert(propertyRows);
    }

    return { id, uid, data: hydratedData };
  });

  // Publish created event
  await eventBus.publish('record.created', {
    record_id: dbRecord.id,
    record_type: recordType,
    changed_by: user.id,
    data: dbRecord.data
  });

  return dbRecord;
};

export const updateRecord = async (id, user, data, ipAddress, { persons, properties } = {}) => {
  const dbRecord = await db.transaction(async (trx) => {
    const record = await trx('records').where({ id }).first();
    if (!record) throw new Error('Record not found');

    const editableStatuses = ['DRAFT', 'SENT_BACK', 'SENT_BACK_HC'];
    if (!editableStatuses.includes(record.current_status)) {
      throw new Error('This record is locked. Only DRAFT or sent-back records can be edited.');
    }

    const oldData = parseJsonField(record.data);
    const hydratedData = mergeConditionalFields({ ...oldData, ...data });
    if (record.record_type === 'ARREST' && Array.isArray(persons)) {
      const arrestedPerson = persons.find(p => p.person_type === 'ARRESTED');
      if (arrestedPerson && arrestedPerson.data) {
        if (arrestedPerson.data.status) hydratedData.status = arrestedPerson.data.status;
        if (arrestedPerson.data.other_status_reason) hydratedData.other_status_reason = arrestedPerson.data.other_status_reason;
        if (arrestedPerson.data.recovery) hydratedData.recovery = arrestedPerson.data.recovery;
      }
    }

    await validateSelectFields(trx, record.record_type, hydratedData);

    const diff = calculateDiff(oldData, hydratedData);
    if (diff.length === 0) return record; // No modifications made

    // Update record
    await trx('records').where({ id }).update({
      data: JSON.stringify(hydratedData),
      updated_by: user.id,
      updated_at: new Date().toISOString()
    });

    // Fetch revision counter
    const revCountRow = await trx('record_revisions')
      .where({ record_id: id })
      .count('* as count')
      .first();
    const nextRevNo = (parseInt(revCountRow.count, 10) || 0) + 1;

    const prev_hash = await getPreviousHash(id, trx);
    const changed_at = new Date().toISOString();
    const field_changes = JSON.stringify(diff);

    const row_hash = computeRowHash({
      record_id: id,
      revision_number: nextRevNo,
      changed_by: user.id,
      changed_at,
      field_changes
    }, prev_hash);

    // Write revision
    await trx('record_revisions').insert({
      id: uuidv4(),
      record_id: id,
      revision_number: nextRevNo,
      changed_by: user.id,
      changed_at,
      level: record.current_level,
      change_type: 'UPDATE',
      field_changes,
      ip_address: ipAddress,
      prev_hash,
      row_hash
    });

    // Write standard audit log
    for (const change of diff) {
      await trx('audit_logs').insert({
        id: uuidv4(),
        table_name: 'records',
        record_id: id,
        action: 'UPDATE',
        changed_by_id: user.id,
        changed_by_role: user.role,
        changed_at: new Date().toISOString(),
        field_name: change.field_key,
        old_value: String(change.old_value),
        new_value: String(change.new_value),
        ip_address: ipAddress
      });
    }

    // Replace persons if provided
    if (Array.isArray(persons)) {
      await trx('record_persons').where({ record_id: id }).delete();
      if (persons.length > 0) {
        const personRows = persons.map((p, i) => ({
          id: uuidv4(),
          record_id: id,
          person_type: p.person_type,
          ...extractPersonSearchCols(p.person_type, p.data || {}),
          data: JSON.stringify(p.data || {}),
          sort_order: i,
          created_at: new Date().toISOString(),
        }));
        await trx('record_persons').insert(personRows);
      }
    }

    // Replace properties if provided
    if (Array.isArray(properties)) {
      await trx('record_properties').where({ record_id: id }).delete();
      if (properties.length > 0) {
        const propertyRows = properties.map((prop, i) => buildPropertyRow(prop, i, id, hydratedData));
        await trx('record_properties').insert(propertyRows);
      }
    }

    return { id, data: hydratedData };
  });

  // Publish updated event
  await eventBus.publish('record.updated', {
    record_id: id,
    changed_by: user.id,
    data: dbRecord.data
  });

  return dbRecord;
};

export const submitRecord = async (id, user) => {
  await db.transaction(async (trx) => {
    const record = await trx('records').where({ id }).first();
    if (!record) throw new Error('Record not found');

    const submittableStatuses = ['DRAFT', 'SENT_BACK', 'SENT_BACK_HC'];
    if (!submittableStatuses.includes(record.current_status)) {
      throw new Error('Record is already submitted');
    }

    // Advance status to PENDING_SHO
    await trx('records').where({ id }).update({
      current_status: 'PENDING_SHO',
      updated_by: user.id,
      updated_at: new Date().toISOString()
    });

    // Write workflow transition log
    await trx('workflow_transitions').insert({
      id: uuidv4(),
      record_id: id,
      from_status: record.current_status,
      to_status: 'PENDING_SHO',
      from_level: record.current_level,
      to_level: record.current_level,
      action: 'SUBMIT',
      performed_by: user.id,
      performed_at: new Date().toISOString()
    });

    // Write audit log
    await trx('audit_logs').insert({
      id: uuidv4(),
      table_name: 'records',
      record_id: id,
      action: 'SUBMIT',
      changed_by_id: user.id,
      changed_by_role: user.role,
      changed_at: new Date().toISOString()
    });
  });

  // Publish submit event
  await eventBus.publish('record.submitted', {
    record_id: id,
    performed_by: user.id
  });
};

export const transitionRecord = async (id, user, action, comment, targetFields, ipAddress) => {
  await db.transaction(async (trx) => {
    const record = await trx('records').where({ id }).first();
    if (!record) throw new Error('Record not found');

    const fromStatus = record.current_status;

    // Evaluate rule
    // 1. Try querying DB config (action stored lowercase in seed)
    let dbRule = await trx('workflow_transitions_config')
      .where({ from_status: fromStatus, action: action.toLowerCase(), is_active: true })
      .andWhere(function () {
        this.where('record_type', record.record_type).orWhere('record_type', '*');
      })
      .first();

    let rule = null;
    if (dbRule) {
      let allowedRoles = dbRule.allowed_roles;
      if (typeof allowedRoles === 'string') {
        try { allowedRoles = JSON.parse(allowedRoles); } catch (e) { allowedRoles = allowedRoles.split(','); }
      }
      rule = {
        to: dbRule.to_status,
        toLevel: dbRule.to_status === 'DISTRICT_REVIEW' ? 'DISTRICT' :
          dbRule.to_status === 'ACP_REVIEW' ? 'ACP' :
            dbRule.to_status === 'JCP_REVIEW' ? 'JCP' :
              dbRule.to_status === 'SCP_REVIEW' ? 'SCP' :
                dbRule.to_status === 'HQ_RECEIVED' ? 'HQ' :
                  dbRule.to_status === 'ARCHIVED' ? 'HQ' :
                    dbRule.to_status === 'SENT_BACK' ? 'PS' : 'PS',
        requiresComment: !!dbRule.requires_comment,
        allowedRoles
      };
    } else {
      // 2. Fallback transitions including JCP / SCP review flows
      const FALLBACK_TRANSITIONS = {
        PENDING_SHO: {
          approve: { to: 'DISTRICT_REVIEW', toLevel: 'DISTRICT', allowedRoles: ['SHO'] },
          send_back: { to: 'SENT_BACK', toLevel: 'PS', requiresComment: true, allowedRoles: ['SHO'] }
        },
        DISTRICT_REVIEW: {
          approve: { to: 'JCP_REVIEW', toLevel: 'JCP', allowedRoles: ['DISTRICT_OFFICER'] },
          send_back: { to: 'SENT_BACK', toLevel: 'PS', requiresComment: true, allowedRoles: ['DISTRICT_OFFICER'] }
        },
        JCP_REVIEW: {
          approve: { to: 'SCP_REVIEW', toLevel: 'SCP', allowedRoles: ['JCP'] },
          send_back: { to: 'DISTRICT_REVIEW', toLevel: 'DISTRICT', requiresComment: true, allowedRoles: ['JCP'] }
        },
        SCP_REVIEW: {
          approve: { to: 'HQ_RECEIVED', toLevel: 'HQ', allowedRoles: ['SCP'] },
          send_back: { to: 'JCP_REVIEW', toLevel: 'JCP', requiresComment: true, allowedRoles: ['SCP'] }
        },
        HQ_RECEIVED: {
          seal: { to: 'ARCHIVED', toLevel: 'HQ', allowedRoles: ['HQ_ADMIN'] }
        }
      };

      const statusRules = FALLBACK_TRANSITIONS[fromStatus];
      rule = statusRules ? statusRules[action.toLowerCase()] : null;
    }

    if (!rule) {
      throw new Error(`Invalid action "${action}" for status "${fromStatus}"`);
    }

    // Server-side RBAC verification for transitions
    if (rule.allowedRoles && !rule.allowedRoles.includes(user.role)) {
      throw new Error(`Insufficient permissions: role ${user.role} is not allowed to perform action ${action}`);
    }

    if (rule.requiresComment && (!comment || comment.trim().length === 0)) {
      throw new Error('Comment is required for this action');
    }

    let targetStatus = rule.to;
    let targetLevel = rule.toLevel;

    // Check level data contract route override for DISTRICT_REVIEW -> approve
    if (fromStatus === 'DISTRICT_REVIEW' && action.toLowerCase() === 'approve') {
      const contract = await trx('level_data_contracts')
        .where({ from_level: 'DISTRICT', to_level: 'HQ', is_active: true })
        .first();
      if (contract && contract.route === 'DIRECT_HQ') {
        targetStatus = 'HQ_RECEIVED';
        targetLevel = 'HQ';
      }
    }

    // Update status
    await trx('records').where({ id }).update({
      current_status: targetStatus,
      current_level: targetLevel,
      updated_by: user.id,
      updated_at: new Date().toISOString()
    });

    // Write workflow transition log
    await trx('workflow_transitions').insert({
      id: uuidv4(),
      record_id: id,
      from_status: fromStatus,
      to_status: targetStatus,
      from_level: record.current_level,
      to_level: targetLevel,
      action: action.toUpperCase(),
      performed_by: user.id,
      performed_at: new Date().toISOString(),
      comment,
      target_fields: targetFields ? JSON.stringify(targetFields) : null
    });

    // Write standard audit log
    await trx('audit_logs').insert({
      id: uuidv4(),
      table_name: 'records',
      record_id: id,
      action: action.toUpperCase(),
      changed_by_id: user.id,
      changed_by_role: user.role,
      changed_at: new Date().toISOString(),
      reason: comment,
      ip_address: ipAddress
    });
  });

  // Publish event
  const eventName = `record.${action.toLowerCase() === 'approve' ? 'approved' : action.toLowerCase() === 'send_back' ? 'sent_back' : 'status_changed'}`;
  await eventBus.publish(eventName, {
    record_id: id,
    performed_by: user.id,
    comment
  });
};

export const overrideCaseHead = async (id, user, newHead, reason, ipAddress) => {
  if (!newHead) throw new Error('New crime head classification is required');
  if (!reason || reason.trim().length < 10) {
    throw new Error('Justification reason must be at least 10 characters long');
  }

  const result = await db.transaction(async (trx) => {
    const record = await trx('records').where({ id }).first();
    if (!record) throw new Error('Record not found');

    const oldData = parseJsonField(record.data);
    let key = 'crime_head';
    if ('case_head' in oldData) {
      key = 'case_head';
    } else if ('local_head' in oldData) {
      key = 'local_head';
    } else if (record.record_type === 'CASE' || record.record_type === 'CASES') {
      key = 'local_head';
    }
    const oldHead = oldData[key];

    const hydratedData = { ...oldData, [key]: newHead };

    // Update data block
    await trx('records').where({ id }).update({
      data: JSON.stringify(hydratedData),
      updated_by: user.id,
      updated_at: new Date().toISOString()
    });

    // Fetch revision count
    const revCountRow = await trx('record_revisions')
      .where({ record_id: id })
      .count('* as count')
      .first();
    const nextRevNo = (parseInt(revCountRow.count, 10) || 0) + 1;

    const prev_hash = await getPreviousHash(id, trx);
    const changed_at = new Date().toISOString();
    const field_changes = JSON.stringify([{ field_key: key, old_value: oldHead || '', new_value: newHead }]);

    const row_hash = computeRowHash({
      record_id: id,
      revision_number: nextRevNo,
      changed_by: user.id,
      changed_at,
      field_changes
    }, prev_hash);

    // Write revision (tamper-chained event)
    await trx('record_revisions').insert({
      id: uuidv4(),
      record_id: id,
      revision_number: nextRevNo,
      changed_by: user.id,
      changed_at,
      level: record.current_level,
      change_type: 'HEAD_OVERRIDE',
      field_changes,
      reason,
      ip_address: ipAddress,
      prev_hash,
      row_hash
    });

    // Write audit logs
    await trx('audit_logs').insert({
      id: uuidv4(),
      table_name: 'records',
      record_id: id,
      action: 'OVERRIDE',
      changed_by_id: user.id,
      changed_by_role: user.role,
      changed_at: new Date().toISOString(),
      field_name: key,
      old_value: oldHead || '',
      new_value: newHead,
      reason,
      ip_address: ipAddress
    });

    return { id, data: hydratedData };
  });

  // Publish override event
  await eventBus.publish('record.overridden', {
    record_id: id,
    performed_by: user.id,
    reason,
    data: result.data
  });

  return result;
};

export const getRecordRevisions = async (record_id) => {
  return await db('record_revisions')
    .where({ record_id })
    .orderBy('revision_number', 'asc');
};

export const checkDuplicateRecord = async (recordType, firNumber, accusedName, date) => {
  if (firNumber && firNumber.trim().length > 0) {
    const client = db.client.config.client;
    let query = db('records').where('record_type', recordType.toUpperCase());

    if (client === 'sqlite3') {
      query = query.andWhere('data', 'like', `%fir_no%${firNumber}%`);
    } else {
      query = query.whereRaw("data->>'fir_no' = ?", [firNumber]);
    }

    const existing = await query.first();
    if (existing) {
      return { isDuplicate: true, existingId: existing.id };
    }
  }

  if (accusedName && date) {
    const client = db.client.config.client;
    let query = db('records')
      .where('record_type', recordType.toUpperCase())
      .andWhere('record_date', date);

    if (client === 'sqlite3') {
      query = query.andWhere('data', 'like', `%accused_name%${accusedName}%`);
    } else {
      query = query.whereRaw("data->>'accused_name' = ?", [accusedName]);
    }

    const existing = await query.first();
    if (existing) {
      return { isDuplicate: true, existingId: existing.id };
    }
  }

  return { isDuplicate: false };
};

export const addAttachment = async (recordId, file, user) => {
  const result = await db.transaction(async (trx) => {
    const record = await trx('records').where({ id: recordId }).first();
    if (!record) throw new Error('Record not found');

    if (record.current_status !== 'DRAFT') {
      throw new Error('Attachments can only be added to DRAFT records');
    }

    const oldData = parseJsonField(record.data);
    const attachments = oldData.attachments || [];

    const { uploadToS3 } = await import('../../utils/s3.js');
    const attachmentInfo = await uploadToS3(file);
    attachments.push(attachmentInfo);

    const hydratedData = { ...oldData, attachments };

    await trx('records').where({ id: recordId }).update({
      data: JSON.stringify(hydratedData),
      updated_by: user.id,
      updated_at: new Date().toISOString()
    });

    return attachmentInfo;
  });

  return result;
};

export const listAttachments = async (recordId) => {
  const record = await db('records').where({ id: recordId }).first();
  if (!record) throw new Error('Record not found');

  const oldData = parseJsonField(record.data);
  return oldData.attachments || [];
};

export const removeAttachment = async (recordId, attachmentId, user) => {
  await db.transaction(async (trx) => {
    const record = await trx('records').where({ id: recordId }).first();
    if (!record) throw new Error('Record not found');

    if (record.current_status !== 'DRAFT') {
      throw new Error('Attachments can only be deleted from DRAFT records');
    }

    const oldData = parseJsonField(record.data);
    const attachments = oldData.attachments || [];

    const index = attachments.findIndex(a => a.id === attachmentId);
    if (index === -1) throw new Error('Attachment not found');

    const attachment = attachments[index];
    attachments.splice(index, 1);

    const hydratedData = { ...oldData, attachments };

    await trx('records').where({ id: recordId }).update({
      data: JSON.stringify(hydratedData),
      updated_by: user.id,
      updated_at: new Date().toISOString()
    });

    const { deleteFromS3 } = await import('../../utils/s3.js');
    await deleteFromS3(attachment.url);
  });
};

const DB_COLUMNS = ['record_type', 'ps_id', 'district_id', 'sub_div_id', 'current_status', 'current_level', 'record_date', 'created_by', 'is_legacy', 'source_system', 'imported_at', 'imported_by', 'legacy_ref', 'created_at', 'updated_at'];

const getJsonFieldExpression = (field) => {
  const isPostgres = db.client.config.client === 'postgresql' || db.client.config.client === 'pg';
  if (isPostgres) {
    return `CAST(records.data AS jsonb)->>'${field}'`;
  } else {
    return `json_extract(records.data, '$.${field}')`;
  }
};

const applyBasicCondition = (builder, columnExpr, op, value) => {
  switch (op) {
    case 'EQ':
      builder.where(columnExpr, '=', value);
      break;
    case 'NOT_EQ':
      builder.where(columnExpr, '!=', value);
      break;
    case 'GT':
      builder.where(columnExpr, '>', value);
      break;
    case 'GTE':
      builder.where(columnExpr, '>=', value);
      break;
    case 'LT':
      builder.where(columnExpr, '<', value);
      break;
    case 'LTE':
      builder.where(columnExpr, '<=', value);
      break;
    case 'CONTAINS':
      builder.where(columnExpr, 'LIKE', `%${value}%`);
      break;
    case 'STARTS_WITH':
      builder.where(columnExpr, 'LIKE', `${value}%`);
      break;
    case 'ENDS_WITH':
      builder.where(columnExpr, 'LIKE', `%${value}`);
      break;
    case 'IS_EMPTY':
      builder.whereNull(columnExpr).orWhere(columnExpr, '=', '');
      break;
    case 'IS_NOT_EMPTY':
      builder.whereNotNull(columnExpr).andWhere(columnExpr, '!=', '');
      break;
    case 'IN':
      builder.whereIn(columnExpr, Array.isArray(value) ? value : [value]);
      break;
    case 'NOT_IN':
      builder.whereNotIn(columnExpr, Array.isArray(value) ? value : [value]);
      break;
    case 'BETWEEN':
      if (Array.isArray(value) && value.length === 2) {
        builder.whereBetween(columnExpr, value);
      }
      break;
    case 'BEFORE':
      builder.where(columnExpr, '<', value);
      break;
    case 'AFTER':
      builder.where(columnExpr, '>', value);
      break;
    case 'LAST_N_DAYS': {
      const days = parseInt(value, 10) || 0;
      const dateLimit = new Date();
      dateLimit.setDate(dateLimit.getDate() - days);
      builder.where(columnExpr, '>=', dateLimit.toISOString().split('T')[0]);
      break;
    }
    case 'THIS_WEEK': {
      const now = new Date();
      const first = now.getDate() - now.getDay();
      const last = first + 6;
      const firstday = new Date(new Date().setDate(first)).toISOString().split('T')[0];
      const lastday = new Date(new Date().setDate(last)).toISOString().split('T')[0];
      builder.whereBetween(columnExpr, [firstday, lastday]);
      break;
    }
    case 'THIS_MONTH': {
      const now = new Date();
      const firstday = new Date(now.getFullYear(), now.getMonth(), 1).toISOString().split('T')[0];
      const lastday = new Date(now.getFullYear(), now.getMonth() + 1, 0).toISOString().split('T')[0];
      builder.whereBetween(columnExpr, [firstday, lastday]);
      break;
    }
    case 'THIS_YEAR': {
      const now = new Date();
      const firstday = new Date(now.getFullYear(), 0, 1).toISOString().split('T')[0];
      const lastday = new Date(now.getFullYear(), 11, 31).toISOString().split('T')[0];
      builder.whereBetween(columnExpr, [firstday, lastday]);
      break;
    }
    case 'IS_TRUE':
      builder.where(columnExpr, '=', true).orWhere(columnExpr, '=', 1).orWhere(columnExpr, '=', 'true');
      break;
    case 'IS_FALSE':
      builder.where(columnExpr, '=', false).orWhere(columnExpr, '=', 0).orWhere(columnExpr, '=', 'false');
      break;
    case 'HAS_ATTACHMENT': {
      // attachments are in record's data JSON array
      const isPostgres = db.client.config.client === 'postgresql' || db.client.config.client === 'pg';
      if (isPostgres) {
        builder.whereRaw("records.data->'attachments' IS NOT NULL AND jsonb_array_length(records.data->'attachments') > 0");
      } else {
        builder.whereRaw("json_extract(records.data, '$.attachments') IS NOT NULL AND json_extract(records.data, '$.attachments') != '[]' AND json_extract(records.data, '$.attachments') != ''");
      }
      break;
    }
    case 'NO_ATTACHMENT': {
      const isPostgres = db.client.config.client === 'postgresql' || db.client.config.client === 'pg';
      if (isPostgres) {
        builder.whereRaw("records.data->'attachments' IS NULL OR jsonb_array_length(records.data->'attachments') = 0");
      } else {
        builder.whereRaw("json_extract(records.data, '$.attachments') IS NULL OR json_extract(records.data, '$.attachments') = '[]' OR json_extract(records.data, '$.attachments') = ''");
      }
      break;
    }
    default:
      builder.where(columnExpr, '=', value);
  }
};

const VIRTUAL_FIELD_RESOLVERS = {
  _status: (builder, operator, value) => {
    applyBasicCondition(builder, 'records.current_status', operator, value);
  },
  _is_legacy: (builder, operator, value) => {
    const boolVal = value === 'true' || value === true || value === 1 || value === '1';
    builder.where('records.is_legacy', boolVal ? 1 : 0);
  },
  _record_date: (builder, operator, value) => {
    applyBasicCondition(builder, 'records.record_date', operator, value);
  },
  _created_at: (builder, operator, value) => {
    applyBasicCondition(builder, 'records.created_at', operator, value);
  },
  _ps_id: (builder, operator, value) => {
    applyBasicCondition(builder, 'records.ps_id', operator, value);
  },
  _district_id: (builder, operator, value) => {
    applyBasicCondition(builder, 'records.district_id', operator, value);
  },
  _sla_breached: (builder, operator, value) => {
    const subquery = db('records')
      .select('records.id')
      .join('workflow_transitions_config as wt', 'wt.from_status', 'records.current_status')
      .whereNotNull('wt.sla_hours');

    const isPostgres = db.client.config.client === 'postgresql' || db.client.config.client === 'pg';
    if (isPostgres) {
      subquery.whereRaw("records.updated_at + (wt.sla_hours || ' hours')::INTERVAL < NOW()");
    } else {
      subquery.whereRaw("datetime(records.updated_at, '+' || wt.sla_hours || ' hours') < datetime('now')");
    }

    const isTrue = value === 'true' || value === true || operator === 'IS_TRUE';
    if (isTrue) {
      builder.whereIn('records.id', subquery);
    } else {
      builder.whereNotIn('records.id', subquery);
    }
  }
};

const applyCondition = (builder, field, operator, value) => {
  const op = operator.toUpperCase();

  if (field.startsWith('_')) {
    const resolver = VIRTUAL_FIELD_RESOLVERS[field];
    if (resolver) {
      resolver(builder, op, value);
    } else {
      const realField = field.substring(1);
      if (DB_COLUMNS.includes(realField)) {
        applyBasicCondition(builder, `records.${realField}`, op, value);
      } else {
        const expr = getJsonFieldExpression(realField);
        applyBasicCondition(builder, db.raw(expr), op, value);
      }
    }
  } else if (DB_COLUMNS.includes(field)) {
    applyBasicCondition(builder, `records.${field}`, op, value);
  } else {
    const expr = getJsonFieldExpression(field);
    applyBasicCondition(builder, db.raw(expr), op, value);
  }
};

export const buildFilterQuery = (builder, spec) => {
  if (!spec) return;
  const { logic, conditions } = spec;

  if (!logic || !Array.isArray(conditions)) {
    return;
  }

  const isOr = logic.toUpperCase() === 'OR';

  builder.where(function () {
    const innerBuilder = this;
    conditions.forEach((cond, index) => {
      const applyFunc = (isOr && index > 0) ? 'orWhere' : 'where';

      if (cond.logic && cond.conditions) {
        innerBuilder[applyFunc](function () {
          buildFilterQuery(this, cond);
        });
      } else {
        const { field, operator, value } = cond;
        innerBuilder[applyFunc](function () {
          applyCondition(this, field, operator, value);
        });
      }
    });
  });
};

export const searchRecordsWithSpec = async (recordType, filterSpec, jurisdictionQuery = {}) => {
  let query = db('records')
    .select('records.*', 'ps.name_en as ps_name', 'dist.name_en as district_name')
    .join('hierarchy_nodes as ps', 'records.ps_id', 'ps.id')
    .join('hierarchy_nodes as dist', 'records.district_id', 'dist.id');

  if (jurisdictionQuery.ps_id) {
    query = query.where('records.ps_id', jurisdictionQuery.ps_id);
  }
  if (jurisdictionQuery.district_id) {
    query = query.where('records.district_id', jurisdictionQuery.district_id);
  }
  if (jurisdictionQuery.sub_div_id) {
    query = query.where('records.sub_div_id', jurisdictionQuery.sub_div_id);
  }

  if (recordType) {
    query = query.where('records.record_type', recordType);
  }

  if (filterSpec && filterSpec.conditions && filterSpec.conditions.length > 0) {
    query = query.where(function () {
      buildFilterQuery(this, filterSpec);
    });
  }

  const rawRecords = await query.orderBy('records.created_at', 'desc');

  return rawRecords.map(r => ({
    ...r,
    data: parseJsonField(r.data)
  }));
};

export const deleteRecord = async (id, user) => {
  await db.transaction(async (trx) => {
    const record = await trx('records').where({ id }).first();
    if (!record) {
      const err = new Error('Record not found');
      err.status = 404;
      throw err;
    }

    if (record.current_status !== 'DRAFT') {
      const err = new Error('Only DRAFT records can be deleted');
      err.status = 400;
      throw err;
    }

    // Delete records row (cascade deletes associated tables automatically via foreign keys)
    await trx('records').where({ id }).delete();

    // Write audit log entry
    await trx('audit_logs').insert({
      id: uuidv4(),
      table_name: 'records',
      record_id: id,
      action: 'DELETE',
      changed_by_id: user.id,
      changed_by_role: user.role,
      changed_at: new Date().toISOString()
    });
  });

  // Publish deleted event
  await eventBus.publish('record.deleted', {
    record_id: id,
    performed_by: user.id
  });
};
