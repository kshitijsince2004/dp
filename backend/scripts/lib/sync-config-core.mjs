// sync-config core — the ONE config-as-data sync (ARCHITECTURE.md §7, DB_SCHEMA.md §6).
// Importable: used by the scripts/sync-config.mjs CLI wrapper AND the startup
// auto-loader (src/bootstrap/autoload.js). Takes a knex instance; throws on any
// failure (callers decide whether that means process.exit or aborted boot).
//
//   config/fields/*.json     → field_registry              (upsert by field_key)
//   config/workflow/*.json   → workflow_transitions_config (upsert by code)
//   config/proformas/*.json  → report_templates            (upsert by code)
//   config/contracts/*.json  → level_data_contracts        (upsert by code)
//
// Idempotent: every row carries a sha256 checksum of its config JSON — unchanged rows are
// no-ops. Rows present in DB but absent from config are deactivated (is_active=false),
// never deleted. Validates every field's storage mapping against the live schema
// (information_schema) and FAILS LOUDLY on unknown tables/columns, bad shapes, or
// duplicate keys.
import fs from 'fs';
import path from 'path';
import crypto from 'crypto';
import { fileURLToPath } from 'url';
import { NATIONALITY_OPTS, INDIA_STATES, ALL_INDIA_DISTRICTS } from '../../src/config/geoData.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const CONFIG_DIR = path.resolve(__dirname, '../../../config');

// Geo/nationality option placeholders (WP11) — config/fields/*.json carries a one-line
// placeholder string instead of ~40 duplicated literal lists; expanded here at sync time so
// the registry stays the single truth every consumer already reads. label_hi = label_en for
// these (English-only lookups; Hindi additive later per the bilingual pillar).
const OPTION_PLACEHOLDERS = {
  $NATIONALITY: NATIONALITY_OPTS,
  $INDIA_STATES: INDIA_STATES,
  $INDIA_DISTRICTS: ALL_INDIA_DISTRICTS,
};
const expandOptions = (options) => {
  if (typeof options !== 'string') return options;
  const list = OPTION_PLACEHOLDERS[options];
  if (!list) fail(`unknown options placeholder "${options}"`);
  return list.map((v) => ({ value: v, label_en: v, label_hi: v }));
};

const sha = (obj) => crypto.createHash('sha256').update(JSON.stringify(obj)).digest('hex');
const readDir = (dir) => {
  const full = path.join(CONFIG_DIR, dir);
  if (!fs.existsSync(full)) return [];
  return fs.readdirSync(full).filter(f => f.endsWith('.json')).sort()
    .map(f => ({ file: `${dir}/${f}`, data: JSON.parse(fs.readFileSync(path.join(full, f), 'utf8')) }));
};
const fail = (msg) => { throw new Error(`sync-config FAILED: ${msg}`); };

// ── storage-shape validation ─────────────────────────────────────────────────
const DETAIL_TABLES = {
  CASE: 'fir_details', ARREST: 'arrest_details', PCR_CALL: 'pcr_call_details',
  MISSING: 'missing_details', UIDB: 'uidb_details',
};
const PERSON_TABLES = ['persons', 'arrestee_details', 'missing_person_details', 'person_descriptions'];
const ROLES = ['COMPLAINANT', 'ACCUSED', 'VICTIM', 'WITNESS', 'ARRESTEE', 'MISSING', 'DECEASED', 'INFORMANT', 'CALLER', 'IO'];
const SLOTS = ['occurrence', 'present', 'permanent', 'incident', 'found', 'missing', 'arrest'];

async function loadColumns(db) {
  const rows = await db.raw(`
    SELECT table_name, column_name FROM information_schema.columns
    WHERE table_schema = 'public'`);
  const cols = {};
  for (const r of rows.rows) (cols[r.table_name] ??= new Set()).add(r.column_name);
  return cols;
}

function validateStorage(key, storage, recordTypes, cols, errors) {
  const err = (m) => errors.push(`${key}: ${m}`);
  if (storage === 'extra' || storage === 'ui_only') return;
  if (typeof storage !== 'object' || storage === null) return err(`bad storage shape: ${JSON.stringify(storage)}`);
  if (storage.per_type) {
    for (const [rt, sub] of Object.entries(storage.per_type)) {
      if (!DETAIL_TABLES[rt]) err(`per_type has unknown record type ${rt}`);
      validateStorage(`${key}[${rt}]`, sub, [rt], cols, errors);
    }
    return;
  }
  if (storage.table) {
    const tables = storage.table === '$detail'
      ? recordTypes.map(rt => DETAIL_TABLES[rt]).filter(Boolean)
      : [storage.table];
    if (storage.table === '$detail' && tables.length !== recordTypes.length) err(`$detail with unknown record type in ${recordTypes}`);
    for (const t of tables) {
      if (!cols[t]) err(`unknown table ${t}`);
      else if (!cols[t].has(storage.column)) err(`${t}.${storage.column} does not exist`);
    }
    return;
  }
  if (storage.entity === 'person') {
    if (!ROLES.includes(storage.role)) err(`unknown person role ${storage.role}`);
    if (storage.extra) return;
    if (!PERSON_TABLES.some(t => cols[t]?.has(storage.column))) err(`persons(+subtypes).${storage.column} does not exist`);
    return;
  }
  if (storage.entity === 'property') {
    if (storage.extra) return;
    if (!cols.record_properties?.has(storage.column)) err(`record_properties.${storage.column} does not exist`);
    return;
  }
  if (storage.entity === 'offence') {
    if (!cols.record_offences?.has(storage.column)) err(`record_offences.${storage.column} does not exist`);
    return;
  }
  if (storage.entity === 'location') {
    if (!SLOTS.includes(storage.slot)) err(`unknown location slot ${storage.slot}`);
    if (storage.role && !ROLES.includes(storage.role)) err(`unknown location role ${storage.role}`);
    if (!cols.locations?.has(storage.column)) err(`locations.${storage.column} does not exist`);
    return;
  }
  err(`unrecognized storage shape: ${JSON.stringify(storage)}`);
}

// ── generic upsert-by-key with checksum + deactivation ───────────────────────
async function syncTable(db, log, label, table, keyCol, items, toRow) {
  const existing = await db(table).select('*');
  const byKey = new Map(existing.map(r => [r[keyCol], r]));
  let inserted = 0, updated = 0, unchanged = 0, reactivated = 0, deactivated = 0;
  const seen = new Set();

  for (const item of items) {
    const key = item[keyCol];
    if (seen.has(key)) fail(`${label}: duplicate key "${key}" across config files`);
    seen.add(key);
    const checksum = sha(item);
    const row = { ...toRow(item), checksum, updated_at: db.fn.now() };
    const prev = byKey.get(key);
    if (!prev) {
      await db(table).insert({ ...row, [keyCol]: key });
      inserted++;
    } else if (prev.checksum === checksum && prev.is_active !== false) {
      unchanged++;
    } else if (prev.checksum === checksum) {
      // Checksum matches but the row is deactivated (e.g. was removed from
      // config, then restored unchanged) — reactivate it. A checksum match
      // alone must never leave a row silently dead.
      await db(table).where(keyCol, key).update({ is_active: true, updated_at: db.fn.now() });
      reactivated++;
    } else {
      await db(table).where(keyCol, key).update(row);
      updated++;
    }
  }
  for (const r of existing) {
    if (!seen.has(r[keyCol]) && r.is_active !== false) {
      await db(table).where(keyCol, r[keyCol]).update({ is_active: false, updated_at: db.fn.now() });
      deactivated++;
    }
  }
  log(`${label.padEnd(28)} +${inserted} inserted, ~${updated} updated, =${unchanged} unchanged, ^${reactivated} reactivated, -${deactivated} deactivated`);
}

/**
 * Run the full config sync against the given knex instance.
 * Throws on validation/sync failure. `log` defaults to console.log.
 */
export async function syncConfig(db, log = console.log) {
  // fields
  const fieldFiles = readDir('fields');
  const fields = fieldFiles.flatMap(f => f.data);
  // Expand geo/nationality placeholders BEFORE the checksum is taken (syncTable's sha(item))
  // — the checksum then covers the EXPANDED list, so rows resync automatically when the
  // underlying dataset (LGD snapshot / i18n-nationality) changes, not just when the config
  // file text does.
  for (const f of fields) f.options = expandOptions(f.options);
  const cols = await loadColumns(db);
  if (!cols.field_registry) {
    fail('field_registry table not found — run `npm run db:migrate` first');
  }
  const errors = [];
  for (const f of fields) {
    if (!f.field_key) errors.push(`field without field_key in config`);
    if (!f.storage) errors.push(`${f.field_key}: missing storage mapping`);
    else validateStorage(f.field_key, f.storage, f.record_types || [], cols, errors);
  }
  if (errors.length) fail(`storage validation:\n  ${errors.join('\n  ')}`);

  await syncTable(db, log, 'fields → field_registry', 'field_registry', 'field_key', fields, (f) => ({
    record_types: JSON.stringify(f.record_types || []),
    field_type: f.field_type,
    labels: JSON.stringify(f.labels || {}),
    section: f.section ?? null,
    section_labels: f.section_labels ? JSON.stringify(f.section_labels) : null,
    storage: JSON.stringify(f.storage),
    options: f.options ? JSON.stringify(f.options) : null,
    options_source: f.options_source ?? null,
    depends_on: f.depends_on ?? null,
    show_when: f.show_when ? JSON.stringify(f.show_when) : null,
    validation_rules: f.validation_rules ? JSON.stringify(f.validation_rules) : null,
    visible_to_levels: JSON.stringify(f.visible_to_levels || []),
    editable_by_levels: JSON.stringify(f.editable_by_levels || []),
    introduced_at_level: f.introduced_at_level || 'PS',
    repeater_entity: f.repeater_entity ?? null,
    sort_order: f.sort_order ?? null,
    full_width: !!f.full_width,
    readonly: !!f.readonly,
    is_active: f.is_active !== false,
    scope_level: f.scope_level || 'global',
  }));

  // workflow
  const workflow = readDir('workflow').flatMap(f => f.data);
  await syncTable(db, log, 'workflow → transitions_config', 'workflow_transitions_config', 'code', workflow, (w) => ({
    record_type: w.record_type || '*',
    from_status: w.from_status,
    action: w.action,
    to_status: w.to_status,
    from_level: w.from_level ?? null,
    to_level: w.to_level ?? null,
    allowed_roles: JSON.stringify(w.allowed_roles || []),
    requires_comment: !!w.requires_comment,
    sla_hours: w.sla_hours ?? null,
    is_active: w.is_active !== false,
  }));

  // proformas
  const proformas = readDir('proformas').map(f => f.data);
  await syncTable(db, log, 'proformas → report_templates', 'report_templates', 'code', proformas, (p) => ({
    name: p.name,
    record_types: p.record_types ? JSON.stringify(p.record_types) : null,
    levels: p.levels ? JSON.stringify(p.levels) : null,
    template_definition: JSON.stringify(p.template_definition),
    output_formats: JSON.stringify(p.output_formats || ['PDF']),
    template_type: p.template_type || 'PROFORMA',
    is_active: p.is_active !== false,
  }));

  // contracts
  const contracts = readDir('contracts').flatMap(f => f.data);
  await syncTable(db, log, 'contracts → level_data_contracts', 'level_data_contracts', 'code', contracts, (c) => ({
    from_level: c.from_level,
    to_level: c.to_level,
    route: c.route || 'OPS_CHAIN',
    record_type: c.record_type || '*',
    visible_field_keys: JSON.stringify(c.visible_field_keys || []),
    aggregate_definitions: JSON.stringify(c.aggregate_definitions || []),
    is_active: c.is_active !== false,
  }));
}
