import db from '../../config/db.js';
import { v4 as uuidv4 } from 'uuid';

const ROLE_TO_LEVEL = {
  HC: 'PS',
  SHO: 'PS',
  DISTRICT_OFFICER: 'DISTRICT',
  JCP: 'JCP',
  SCP: 'SCP',
  HQ_ANALYST: 'HQ',
  HQ_ADMIN: 'HQ',
  SYSTEM_ADMIN: 'HQ'
};

export const parseArray = (val) => {
  if (!val) return [];
  if (Array.isArray(val)) return val;
  try {
    const parsed = JSON.parse(val);
    return Array.isArray(parsed) ? parsed : [];
  } catch (e) {
    if (typeof val === 'string') {
      if (val.startsWith('{') && val.endsWith('}')) {
        return val.slice(1, -1).split(',').map(s => s.trim().replace(/^"|"$/g, ''));
      }
      return val.split(',').map(s => s.trim());
    }
    return [];
  }
};

export const getContracts = async () => {
  const list = await db('level_data_contracts').orderBy('updated_at', 'desc');
  return list.map(item => ({
    ...item,
    visible_field_keys: parseArray(item.visible_field_keys),
    aggregate_definitions: typeof item.aggregate_definitions === 'string'
      ? JSON.parse(item.aggregate_definitions || '[]')
      : item.aggregate_definitions
  }));
};

export const createContract = async (data) => {
  const id = uuidv4();
  const visible_field_keys = Array.isArray(data.visible_field_keys)
    ? JSON.stringify(data.visible_field_keys)
    : data.visible_field_keys || '[]';
  const aggregate_definitions = Array.isArray(data.aggregate_definitions)
    ? JSON.stringify(data.aggregate_definitions)
    : data.aggregate_definitions || '[]';

  const row = {
    id,
    from_level: data.from_level,
    to_level: data.to_level,
    route: data.route || 'OPS_CHAIN',
    record_type: data.record_type || '*',
    visible_field_keys,
    aggregate_definitions,
    is_active: data.is_active !== undefined ? data.is_active : true,
    updated_at: new Date().toISOString()
  };

  await db('level_data_contracts').insert(row);
  return {
    ...row,
    visible_field_keys: parseArray(visible_field_keys),
    aggregate_definitions: JSON.parse(aggregate_definitions)
  };
};

export const updateContract = async (id, data) => {
  const updateData = {};
  if (data.from_level !== undefined) updateData.from_level = data.from_level;
  if (data.to_level !== undefined) updateData.to_level = data.to_level;
  if (data.route !== undefined) updateData.route = data.route;
  if (data.record_type !== undefined) updateData.record_type = data.record_type;
  if (data.is_active !== undefined) updateData.is_active = data.is_active;

  if (data.visible_field_keys !== undefined) {
    updateData.visible_field_keys = Array.isArray(data.visible_field_keys)
      ? JSON.stringify(data.visible_field_keys)
      : data.visible_field_keys;
  }
  if (data.aggregate_definitions !== undefined) {
    updateData.aggregate_definitions = Array.isArray(data.aggregate_definitions)
      ? JSON.stringify(data.aggregate_definitions)
      : data.aggregate_definitions;
  }

  updateData.updated_at = new Date().toISOString();

  await db('level_data_contracts').where({ id }).update(updateData);
  const updated = await db('level_data_contracts').where({ id }).first();
  if (!updated) return null;

  return {
    ...updated,
    visible_field_keys: parseArray(updated.visible_field_keys),
    aggregate_definitions: typeof updated.aggregate_definitions === 'string'
      ? JSON.parse(updated.aggregate_definitions || '[]')
      : updated.aggregate_definitions
  };
};

export const maskRecordData = async (record, user) => {
  if (!record) return record;
  if (!user || user.role === 'SYSTEM_ADMIN') {
    return record;
  }

  const userLevel = ROLE_TO_LEVEL[user.role];
  if (!userLevel || userLevel === 'PS') {
    // Operators/approvers at PS level see full detail
    return record;
  }

  // Find active contract for this record type and target level
  const contract = await db('level_data_contracts')
    .where({ to_level: userLevel, is_active: true })
    .andWhere((builder) => {
      builder.where('record_type', record.record_type).orWhere('record_type', '*');
    })
    .first();

  if (!contract) {
    // Default: no masking if contract is not defined
    return record;
  }

  const visibleKeys = parseArray(contract.visible_field_keys);

  // Mask in record.data
  let dataObj = {};
  if (record.data) {
    try {
      dataObj = typeof record.data === 'string' ? JSON.parse(record.data) : record.data;
    } catch (e) {
      dataObj = {};
    }
  }

  const maskedData = {};
  for (const key of Object.keys(dataObj)) {
    if (visibleKeys.includes(key) || ['uid', 'id', 'created_at', 'updated_at'].includes(key)) {
      maskedData[key] = dataObj[key];
    }
  }
  record.data = maskedData;

  return record;
};

export const maskRecordDetails = async (details, user) => {
  if (!details || !details.record) return details;
  if (!user || user.role === 'SYSTEM_ADMIN') {
    return details;
  }

  const userLevel = ROLE_TO_LEVEL[user.role];
  if (!userLevel || userLevel === 'PS') {
    return details;
  }

  const contract = await db('level_data_contracts')
    .where({ to_level: userLevel, is_active: true })
    .andWhere((builder) => {
      builder.where('record_type', details.record.record_type).orWhere('record_type', '*');
    })
    .first();

  if (!contract) {
    return details;
  }

  const visibleKeys = parseArray(contract.visible_field_keys);

  // Mask details.record.data
  let dataObj = {};
  if (details.record.data) {
    try {
      dataObj = typeof details.record.data === 'string' ? JSON.parse(details.record.data) : details.record.data;
    } catch (e) {
      dataObj = {};
    }
  }

  const maskedData = {};
  for (const key of Object.keys(dataObj)) {
    if (visibleKeys.includes(key) || ['uid', 'id', 'created_at', 'updated_at'].includes(key)) {
      maskedData[key] = dataObj[key];
    }
  }
  details.record.data = maskedData;

  return details;
};
