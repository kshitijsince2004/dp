import db from '../../config/db.js';
import { getLogger } from '../../utils/logger.js';

// Logging-instrumentation-2026-07-22 (B5): matches records.service.js style. HANDOFF §5:
// "filters: log preset resolution + masking decisions applied" (masking decisions live in
// level-contracts.service.js; this file covers preset resolution — SYSTEM/USER scope + the
// in-memory DEFAULT_SYSTEM_PRESETS merge).
const log = getLogger('filters.controller');

// Canonical record types (matches records.spine / DB_SCHEMA.md) — the previous
// constants used 'CASES'/'PCR' in a couple of entries, which don't exist as a
// record_type anywhere else in the codebase. Fixed here (Integration 5, WS2).
const CANONICAL_RECORD_TYPES = ['CASE', 'ARREST', 'PCR_CALL', 'MISSING', 'UIDB'];

// In-memory SYSTEM defaults merged into every listPresets response when the DB
// doesn't already have a row with the same `id` (SYSTEM presets get seeded
// into the DB over time — these are the fallback set until then). Shaped to
// match filter_presets columns directly: single `name`, `record_types`.
const DEFAULT_SYSTEM_PRESETS = [
  {
    id: 'sys_preset_today',
    name: "Today's FIRs",
    scope: 'SYSTEM',
    scope_id: null,
    filter_spec: { logic: 'AND', conditions: [{ field: '_record_date', operator: 'last_n_days', value: 1 }] },
    record_types: ['CASE'],
    is_active: true
  },
  {
    id: 'sys_preset_pending_sho',
    name: 'Pending SHO approval',
    scope: 'SYSTEM',
    scope_id: null,
    filter_spec: { logic: 'AND', conditions: [{ field: '_status', operator: 'eq', value: 'PENDING_SHO' }] },
    record_types: ['CASE', 'ARREST', 'PCR_CALL'],
    is_active: true
  },
  {
    id: 'sys_preset_district_review',
    name: 'District review queue',
    scope: 'SYSTEM',
    scope_id: null,
    filter_spec: { logic: 'AND', conditions: [{ field: '_status', operator: 'eq', value: 'DISTRICT_REVIEW' }] },
    record_types: ['CASE', 'ARREST', 'PCR_CALL'],
    is_active: true
  },
  {
    id: 'sys_preset_sla_breach',
    name: 'SLA approaching breach',
    scope: 'SYSTEM',
    scope_id: null,
    filter_spec: { logic: 'AND', conditions: [{ field: '_sla_breached', operator: 'is_true' }] },
    record_types: ['CASE', 'ARREST', 'PCR_CALL'],
    is_active: true
  },
  {
    id: 'sys_preset_last_30_days',
    name: 'Less than 30 days',
    scope: 'SYSTEM',
    scope_id: null,
    filter_spec: { logic: 'AND', conditions: [{ field: '_record_date', operator: 'last_n_days', value: 30 }] },
    record_types: CANONICAL_RECORD_TYPES,
    is_active: true
  },
  {
    id: 'sys_preset_last_60_days',
    name: 'Less than 60 days',
    scope: 'SYSTEM',
    scope_id: null,
    filter_spec: { logic: 'AND', conditions: [{ field: '_record_date', operator: 'last_n_days', value: 60 }] },
    record_types: CANONICAL_RECORD_TYPES,
    is_active: true
  },
  {
    id: 'sys_preset_last_90_days',
    name: 'Less than 90 days',
    scope: 'SYSTEM',
    scope_id: null,
    filter_spec: { logic: 'AND', conditions: [{ field: '_record_date', operator: 'last_n_days', value: 90 }] },
    record_types: CANONICAL_RECORD_TYPES,
    is_active: true
  },
  {
    id: 'sys_preset_older_than_90_days',
    name: 'More than 90 days',
    scope: 'SYSTEM',
    scope_id: null,
    filter_spec: { logic: 'AND', conditions: [{ field: '_record_date', operator: 'older_than_n_days', value: 90 }] },
    record_types: CANONICAL_RECORD_TYPES,
    is_active: true
  }
];

// Compat alias: name_en/applicable_record_types mirror the real `name`/
// `record_types` columns for frontend consumers that still read the old keys
// — deprecated, drain on touch (same pattern as hierarchy.controller.js
// withNameAlias). node-pg already parses jsonb columns into JS values, so no
// JSON.parse gymnastics are needed here on read.
const withAliases = (row) => ({
  ...row,
  name_en: row.name,
  record_types: row.record_types || [],
  applicable_record_types: row.record_types || []
});

export const listPresets = async (req, res) => {
  try {
    const userId = req.user.id || req.user.userId;
    log.debug('listPresets: enter', { userId });

    const list = await db('filter_presets')
      .where({ is_active: true })
      .andWhere(builder => {
        builder.where({ scope: 'SYSTEM' })
          .orWhere({ scope: 'USER', created_by: userId });
      });
    log.debug('listPresets: loaded filter_presets rows', { userId, dbCount: list.length });

    const parsedList = list.map(withAliases);

    // Merge in-memory SYSTEM defaults for any not already present in the DB.
    const systemDbIds = new Set(parsedList.filter(p => p.scope === 'SYSTEM').map(p => p.id));
    const mergedList = [...parsedList];
    let mergedDefaults = 0;
    DEFAULT_SYSTEM_PRESETS.forEach(def => {
      if (!systemDbIds.has(def.id)) {
        mergedList.push(withAliases({ ...def }));
        mergedDefaults++;
      }
    });
    log.debug('listPresets: merged in-memory SYSTEM defaults', { userId, mergedDefaults, dbSystemCount: systemDbIds.size });

    log.info('listPresets: exit', { userId, resultCount: mergedList.length });
    return res.status(200).json({ status: 'success', data: mergedList });
  } catch (error) {
    log.error('listPresets: failed', { err: error });
    return res.status(500).json({ status: 'error', message: error.message });
  }
};

export const createPreset = async (req, res) => {
  const body = req.body || {};
  const name = body.name || body.name_en;
  const filter_spec = body.filter_spec;
  const record_types = body.record_types || body.applicable_record_types || [];
  const requestedScope = body.scope;
  log.debug('createPreset: enter', { userId: req.user?.id, name, requestedScope, recordTypes: record_types });

  if (!name || !filter_spec) {
    log.warn('createPreset: rejected — name or filter_spec missing', { userId: req.user?.id });
    return res.status(400).json({ status: 'error', message: 'name and filter_spec are required' });
  }

  // Only SYSTEM_ADMIN may create a SYSTEM-scoped preset (SYSTEM presets are
  // visible to every user — anything else would be a privilege-escalation
  // hole). Everyone else always gets a USER preset owned by themselves.
  let scope = 'USER';
  if (requestedScope === 'SYSTEM') {
    if (req.user.role !== 'SYSTEM_ADMIN') {
      log.warn('createPreset: rejected — non-SYSTEM_ADMIN attempted SYSTEM scope', { userId: req.user?.id, role: req.user?.role });
      return res.status(403).json({ status: 'error', message: 'Only SYSTEM_ADMIN can create SYSTEM presets' });
    }
    scope = 'SYSTEM';
    log.debug('createPreset: granted SYSTEM scope', { userId: req.user?.id });
  }

  // scope_id is reserved for future geographic (hierarchy-node-scoped)
  // presets — never populated by USER/SYSTEM presets today.
  const row = {
    name,
    scope,
    scope_id: null,
    filter_spec: JSON.stringify(filter_spec),
    record_types: JSON.stringify(Array.isArray(record_types) ? record_types : []),
    created_by: req.user.id || req.user.userId || null,
    is_active: true,
    updated_at: new Date().toISOString()
  };

  try {
    const [inserted] = await db('filter_presets').insert(row).returning('*');
    log.info('createPreset: wrote filter_presets row', { presetId: inserted.id, scope, userId: req.user?.id });
    return res.status(201).json({ status: 'success', data: withAliases(inserted) });
  } catch (error) {
    log.error('createPreset: failed', { userId: req.user?.id, err: error });
    return res.status(500).json({ status: 'error', message: error.message });
  }
};

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export const deletePreset = async (req, res) => {
  const { id } = req.params;
  log.debug('deletePreset: enter', { presetId: id, userId: req.user?.id });

  // The in-memory DEFAULT_SYSTEM_PRESETS carry non-uuid ids (e.g.
  // 'sys_preset_today') since they never get inserted into the (uuid PK)
  // table. Without this guard, a delete attempt against one of them (the
  // panel renders a delete control on every preset it lists) would hit the
  // DB with an invalid uuid literal and 500 instead of 404.
  if (!UUID_RE.test(id)) {
    log.debug('deletePreset: non-uuid id (in-memory default preset), reporting 404', { presetId: id });
    return res.status(404).json({ status: 'error', message: 'Preset not found' });
  }

  try {
    const preset = await db('filter_presets').where({ id }).first();
    if (!preset) {
      log.warn('deletePreset: rejected — preset not found', { presetId: id });
      return res.status(404).json({ status: 'error', message: 'Preset not found' });
    }

    const userId = req.user.id || req.user.userId;

    // RBAC: SYSTEM presets only deletable by SYSTEM_ADMIN; USER presets by
    // their owner or SYSTEM_ADMIN.
    if (preset.scope === 'SYSTEM' && req.user.role !== 'SYSTEM_ADMIN') {
      log.warn('deletePreset: rejected — non-SYSTEM_ADMIN attempted to delete SYSTEM preset', { presetId: id, userId, role: req.user.role });
      return res.status(403).json({ status: 'error', message: 'Only SYSTEM_ADMIN can delete system presets' });
    }
    if (preset.scope === 'USER' && preset.created_by !== userId && req.user.role !== 'SYSTEM_ADMIN') {
      log.warn('deletePreset: rejected — not the owner of USER preset', { presetId: id, userId, ownerId: preset.created_by });
      return res.status(403).json({ status: 'error', message: 'Access denied: You can only delete your own presets' });
    }

    await db('filter_presets').where({ id }).update({ is_active: false, updated_at: new Date().toISOString() });
    log.info('deletePreset: soft-deleted filter_presets row', { presetId: id, scope: preset.scope, userId });
    return res.status(200).json({ status: 'success', message: 'Preset deleted successfully' });
  } catch (error) {
    log.error('deletePreset: failed', { presetId: id, err: error });
    return res.status(500).json({ status: 'error', message: error.message });
  }
};
