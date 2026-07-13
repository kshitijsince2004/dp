import db from '../../config/db.js';
import { v4 as uuidv4 } from 'uuid';

const DEFAULT_SYSTEM_PRESETS = [
  {
    id: 'sys_preset_today',
    name_en: "Today's FIRs",
    name_hi: "आज की एफआईआर",
    scope: 'SYSTEM',
    filter_spec: JSON.stringify({ logic: 'AND', conditions: [{ field: '_record_date', operator: 'last_n_days', value: 1 }] }),
    applicable_record_types: JSON.stringify(['CASES']),
    is_active: true
  },
  {
    id: 'sys_preset_pending_sho',
    name_en: "Pending SHO approval",
    name_hi: "एसएचओ अनुमोदन के लिए लंबित",
    scope: 'SYSTEM',
    filter_spec: JSON.stringify({ logic: 'AND', conditions: [{ field: '_status', operator: 'eq', value: 'PENDING_SHO' }] }),
    applicable_record_types: JSON.stringify(['CASES', 'ARREST', 'PCR']),
    is_active: true
  },
  {
    id: 'sys_preset_district_review',
    name_en: "District review queue",
    name_hi: "जिला समीक्षा कतार",
    scope: 'SYSTEM',
    filter_spec: JSON.stringify({ logic: 'AND', conditions: [{ field: '_status', operator: 'eq', value: 'DISTRICT_REVIEW' }] }),
    applicable_record_types: JSON.stringify(['CASES', 'ARREST', 'PCR']),
    is_active: true
  },
  {
    id: 'sys_preset_sla_breach',
    name_en: "SLA approaching breach",
    name_hi: "समय सीमा उल्लंघन के करीब",
    scope: 'SYSTEM',
    filter_spec: JSON.stringify({ logic: 'AND', conditions: [{ field: '_sla_breached', operator: 'is_true' }] }),
    applicable_record_types: JSON.stringify(['CASES', 'ARREST', 'PCR']),
    is_active: true
  },
  {
    id: 'sys_preset_last_30_days',
    name_en: "Less than 30 days",
    name_hi: "30 दिनों से कम",
    scope: 'SYSTEM',
    filter_spec: JSON.stringify({ logic: 'AND', conditions: [{ field: '_record_date', operator: 'last_n_days', value: 30 }] }),
    applicable_record_types: JSON.stringify(['CASE', 'ARREST', 'PCR_CALL', 'MISSING', 'UIDB']),
    is_active: true
  },
  {
    id: 'sys_preset_last_60_days',
    name_en: "Less than 60 days",
    name_hi: "60 दिनों से कम",
    scope: 'SYSTEM',
    filter_spec: JSON.stringify({ logic: 'AND', conditions: [{ field: '_record_date', operator: 'last_n_days', value: 60 }] }),
    applicable_record_types: JSON.stringify(['CASE', 'ARREST', 'PCR_CALL', 'MISSING', 'UIDB']),
    is_active: true
  },
  {
    id: 'sys_preset_last_90_days',
    name_en: "Less than 90 days",
    name_hi: "90 दिनों से कम",
    scope: 'SYSTEM',
    filter_spec: JSON.stringify({ logic: 'AND', conditions: [{ field: '_record_date', operator: 'last_n_days', value: 90 }] }),
    applicable_record_types: JSON.stringify(['CASE', 'ARREST', 'PCR_CALL', 'MISSING', 'UIDB']),
    is_active: true
  },
  {
    id: 'sys_preset_older_than_90_days',
    name_en: "More than 90 days",
    name_hi: "90 दिनों से अधिक",
    scope: 'SYSTEM',
    filter_spec: JSON.stringify({ logic: 'AND', conditions: [{ field: '_record_date', operator: 'older_than_n_days', value: 90 }] }),
    applicable_record_types: JSON.stringify(['CASE', 'ARREST', 'PCR_CALL', 'MISSING', 'UIDB']),
    is_active: true
  }
];

export const listPresets = async (req, res) => {
  try {
    const list = await db('filter_presets')
      .where({ is_active: true })
      .andWhere(builder => {
        builder.where({ scope: 'SYSTEM' })
          .orWhere({ scope: 'ROLE', scope_id: req.user.role })
          .orWhere({ scope: 'USER', scope_id: req.user.id || req.user.userId });
      });

    const parsedList = list.map(item => ({
      ...item,
      filter_spec: typeof item.filter_spec === 'string' ? JSON.parse(item.filter_spec) : item.filter_spec,
      applicable_record_types: typeof item.applicable_record_types === 'string'
        ? JSON.parse(item.applicable_record_types || '[]')
        : item.applicable_record_types
    }));

    // If SYSTEM presets are not loaded in the DB, merge the default ones
    const systemDbIds = new Set(parsedList.filter(p => p.scope === 'SYSTEM').map(p => p.id));
    const mergedList = [...parsedList];
    DEFAULT_SYSTEM_PRESETS.forEach(def => {
      if (!systemDbIds.has(def.id)) {
        mergedList.push({
          ...def,
          filter_spec: JSON.parse(def.filter_spec),
          applicable_record_types: JSON.parse(def.applicable_record_types)
        });
      }
    });

    return res.status(200).json({ status: 'success', data: mergedList });
  } catch (error) {
    return res.status(500).json({ status: 'error', message: error.message });
  }
};

export const listDurationPresets = async (req, res) => {
  try {
    const rows = await db('filter_presets')
      .where({ scope: 'HQ_DURATION', is_active: true })
      .orderBy('id', 'asc');

    const parsed = rows.map(r => ({
      ...r,
      filter_spec: typeof r.filter_spec === 'string' ? JSON.parse(r.filter_spec) : r.filter_spec,
      applicable_record_types: typeof r.applicable_record_types === 'string'
        ? JSON.parse(r.applicable_record_types || '[]')
        : r.applicable_record_types
    }));

    return res.status(200).json({ status: 'success', data: parsed });
  } catch (error) {
    return res.status(500).json({ status: 'error', message: error.message });
  }
};

export const createPreset = async (req, res) => {
  const { name_en, name_hi, scope, scope_id, filter_spec, applicable_record_types } = req.body;

  if (!name_en || !name_hi || !filter_spec) {
    return res.status(400).json({ status: 'error', message: 'name_en, name_hi, and filter_spec are required' });
  }

  try {
    const id = uuidv4();
    const finalScope = scope || 'USER';
    const finalScopeId = scope_id || (finalScope === 'ROLE' ? req.user.role : (req.user.id || req.user.userId));

    const row = {
      id,
      name_en,
      name_hi,
      scope: finalScope,
      scope_id: finalScopeId,
      filter_spec: typeof filter_spec === 'string' ? filter_spec : JSON.stringify(filter_spec),
      applicable_record_types: Array.isArray(applicable_record_types)
        ? JSON.stringify(applicable_record_types)
        : (applicable_record_types || '[]'),
      created_by: req.user ? (req.user.id || req.user.userId) : null,
      is_active: true,
      created_at: new Date().toISOString()
    };

    await db('filter_presets').insert(row);

    return res.status(201).json({
      status: 'success',
      data: {
        ...row,
        filter_spec: typeof row.filter_spec === 'string' ? JSON.parse(row.filter_spec) : row.filter_spec,
        applicable_record_types: typeof row.applicable_record_types === 'string'
          ? JSON.parse(row.applicable_record_types)
          : row.applicable_record_types
      }
    });
  } catch (error) {
    return res.status(500).json({ status: 'error', message: error.message });
  }
};

export const deletePreset = async (req, res) => {
  const { id } = req.params;

  try {
    const preset = await db('filter_presets').where({ id }).first();
    if (!preset) {
      return res.status(404).json({ status: 'error', message: 'Preset not found' });
    }

    // RBAC: users can only delete their own USER presets or ROLE presets if they are admin
    if (preset.scope === 'SYSTEM' && req.user.role !== 'SYSTEM_ADMIN') {
      return res.status(403).json({ status: 'error', message: 'Only SYSTEM_ADMIN can delete system presets' });
    }
    if (preset.scope === 'USER' && preset.created_by !== (req.user.id || req.user.userId) && req.user.role !== 'SYSTEM_ADMIN') {
      return res.status(403).json({ status: 'error', message: 'Access denied: You can only delete your own presets' });
    }

    await db('filter_presets').where({ id }).update({ is_active: false });
    return res.status(200).json({ status: 'success', message: 'Preset deleted successfully' });
  } catch (error) {
    return res.status(500).json({ status: 'error', message: error.message });
  }
};
