import { v4 as uuidv4 } from 'uuid';
import db from '../../config/db.js';
import * as eventBus from '../../events/eventBus.js';
import { computeRowHash, getPreviousHash } from '../../utils/hash.js';
import { getLinksForRecord } from '../record-links/record-links.service.js';
import { toISO } from '../../utils/dateFormat.js';
import * as workflowEngine from '../workflow/workflow.engine.js';
import * as mapper from './records.mapper.js';
import { resolveMajorHead, resolveLocalHead } from './records.normalize.js';

// ── shared write-path helpers (single write path, ARCHITECTURE.md §4.2) ─────────────────

/** Insert a `locations` row (or return null for an empty block). Used on CREATE, where
 * there is never a prior row to reconcile against. */
async function insertLocation(trx, cols) {
  if (!cols || !Object.keys(cols).length) return null;
  const id = uuidv4();
  await trx('locations').insert({ id, ...cols });
  return id;
}

/** UPDATE in place when the owner already has a location for this slot, INSERT when new,
 * DELETE when the block was cleared — the one function both create (existingId always null)
 * and update paths share (`DB_SCHEMA.md` §3.5 ownership rule: one row per use). */
async function upsertLocation(trx, existingId, cols) {
  const hasCols = cols && Object.keys(cols).length > 0;
  if (!hasCols) {
    if (existingId) await trx('locations').where({ id: existingId }).delete();
    return null;
  }
  if (existingId) {
    await trx('locations').where({ id: existingId }).update({ ...cols, updated_at: trx.fn.now() });
    return existingId;
  }
  const id = uuidv4();
  await trx('locations').insert({ id, ...cols });
  return id;
}

async function insertPersonEntry(trx, recordId, entry) {
  const personId = uuidv4();
  const locationIdBySlot = {};
  for (const [slot, cols] of Object.entries(entry.locations)) {
    locationIdBySlot[slot] = await insertLocation(trx, cols);
  }
  const personCols = { ...entry.columns };
  for (const [slot, locId] of Object.entries(locationIdBySlot)) {
    const target = mapper.PERSON_LOCATION_SLOTS[slot];
    if (target?.table === 'persons') personCols[target.column] = locId;
  }
  await trx('persons').insert({
    id: personId, record_id: recordId, role: entry.role, ...personCols,
    extra: JSON.stringify(entry.extra || {}), sort_order: entry.sourceIndex ?? 0,
  });
  for (const [subtypeTable, cols] of Object.entries(entry.subtypes || {})) {
    const subtypeCols = { ...cols };
    for (const [slot, locId] of Object.entries(locationIdBySlot)) {
      const target = mapper.PERSON_LOCATION_SLOTS[slot];
      if (target?.table === subtypeTable) subtypeCols[target.column] = locId;
    }
    await trx(subtypeTable).insert({ person_id: personId, ...subtypeCols });
  }
  return personId;
}

/**
 * Id-preserving upsert for persons on UPDATE (C4 — never delete-and-reinsert: role subtype
 * rows cascade off `persons.id`, and while nothing references a person row directly today,
 * treating a person's identity as stable across edits is the correct model regardless).
 * Singleton roles (COMPLAINANT/MISSING/DECEASED/INFORMANT/CALLER) match the record's one
 * existing row of that role; repeater roles match by the `persons[].id` the client echoes
 * back (recomposeRecord always includes it). Returns { personIdBySourceIndex } for the
 * property linker.
 */
async function upsertPersons(trx, recordId, personEntries, oldPersonRows) {
  const oldById = new Map(oldPersonRows.map((p) => [p.id, p]));
  const oldByRole = new Map();
  for (const p of oldPersonRows) if (!mapper.REPEATER_ROLES.has(p.role)) oldByRole.set(p.role, p);

  const keptIds = new Set();
  const personIdBySourceIndex = {};

  for (const entry of personEntries) {
    const existing = mapper.REPEATER_ROLES.has(entry.role)
      ? (entry.existingId ? oldById.get(entry.existingId) : null)
      : oldByRole.get(entry.role);
    const personId = existing?.id || uuidv4();
    keptIds.add(personId);

    const locationIdBySlot = {};
    for (const slot of Object.keys(mapper.PERSON_LOCATION_SLOTS)) {
      const target = mapper.PERSON_LOCATION_SLOTS[slot];
      const ownerOld = target.table === 'persons' ? existing : existing?.subtypes?.[target.table];
      const existingLocId = ownerOld?.[target.column] || null;
      const cols = entry.locations[slot];
      if (!cols && !existingLocId) continue;
      locationIdBySlot[slot] = await upsertLocation(trx, existingLocId, cols);
    }

    const personCols = { ...entry.columns };
    for (const [slot, locId] of Object.entries(locationIdBySlot)) {
      const target = mapper.PERSON_LOCATION_SLOTS[slot];
      if (target.table === 'persons') personCols[target.column] = locId;
    }
    const row = {
      role: entry.role, ...personCols, extra: JSON.stringify(entry.extra || {}),
      sort_order: entry.sourceIndex ?? 0, updated_at: trx.fn.now(),
    };
    if (existing) await trx('persons').where({ id: personId }).update(row);
    else await trx('persons').insert({ id: personId, record_id: recordId, ...row });

    const subtypeTables = new Set([...Object.keys(entry.subtypes || {}), ...Object.keys(existing?.subtypes || {})]);
    for (const subtypeTable of subtypeTables) {
      const cols = { ...(entry.subtypes?.[subtypeTable] || {}) };
      for (const [slot, locId] of Object.entries(locationIdBySlot)) {
        const target = mapper.PERSON_LOCATION_SLOTS[slot];
        if (target.table === subtypeTable) cols[target.column] = locId;
      }
      const hadOld = !!existing?.subtypes?.[subtypeTable];
      const hasNew = Object.keys(cols).length > 0;
      if (!hasNew) {
        if (hadOld) await trx(subtypeTable).where({ person_id: personId }).delete();
        continue;
      }
      if (hadOld) await trx(subtypeTable).where({ person_id: personId }).update(cols);
      else await trx(subtypeTable).insert({ person_id: personId, ...cols });
    }

    if (entry.sourceKind === 'repeater') personIdBySourceIndex[entry.sourceIndex] = personId;
  }

  for (const old of oldPersonRows) {
    if (keptIds.has(old.id)) continue;
    const locIds = [old.present_location_id, old.perm_location_id,
      ...Object.values(old.subtypes || {}).flatMap((s) => [s.arrest_location_id, s.missing_location_id, s.found_location_id])]
      .filter(Boolean);
    await trx('persons').where({ id: old.id }).delete(); // cascades subtype rows
    if (locIds.length) await trx('locations').whereIn('id', locIds).delete();
  }

  return personIdBySourceIndex;
}

/** Id-preserving upsert for properties on UPDATE — REQUIRED, not a style choice:
 * `record_status_events.property_id` is `ON DELETE CASCADE`, so delete-and-reinsert would
 * silently destroy a property's status-change history on every unrelated edit. */
async function upsertProperties(trx, recordId, propertyEntries, oldPropertyRows, personIdBySourceIndex) {
  const oldById = new Map(oldPropertyRows.map((p) => [p.id, p]));
  const keptIds = new Set();
  const statusChanges = []; // {propertyId, oldValue, newValue} for record_status_events

  for (const entry of propertyEntries) {
    const existing = entry.existingId ? oldById.get(entry.existingId) : null;
    const propertyId = existing?.id || uuidv4();
    keptIds.add(propertyId);
    const personId = entry.personIndex != null ? (personIdBySourceIndex[entry.personIndex] ?? null) : (existing?.person_id ?? null);
    const row = {
      person_id: personId, ...entry.columns, extra: JSON.stringify(entry.extra || {}),
      updated_at: trx.fn.now(),
    };
    if (existing) {
      if (entry.columns.status && existing.status && entry.columns.status !== existing.status) {
        statusChanges.push({ propertyId, oldValue: existing.status, newValue: entry.columns.status });
      }
      await trx('record_properties').where({ id: propertyId }).update(row);
    } else {
      await trx('record_properties').insert({ id: propertyId, record_id: recordId, sort_order: 0, ...row });
    }
  }

  const toDelete = oldPropertyRows.filter((p) => !keptIds.has(p.id)).map((p) => p.id);
  if (toDelete.length) await trx('record_properties').whereIn('id', toDelete).delete();

  return { personIdBySourceIndex, statusChanges };
}

/** `fir_details.ps_id` is a deliberate denormalized copy of `records.ps_id` (DB_SCHEMA.md
 * §9.3 #3) solely to carry the `UNIQUE(ps_id, fir_year, fir_no)` business key — it isn't a
 * form field, so nothing in the registry maps to it; the write path stamps it directly, same
 * as the spine's own scoping ids (P5.4). No other detail table needs its own copy. */
function detailScopingColumns(recordType, psId) {
  return recordType === 'CASE' ? { ps_id: psId } : {};
}

/** record_offences has nothing referencing it — wholesale delete-and-reinsert is safe and
 * matches the documented pattern (a group can never half-update). */
async function replaceOffenceRows(trx, recordId, offenceRows) {
  await trx('record_offences').where({ record_id: recordId }).delete();
  if (!offenceRows.length) return;
  await trx('record_offences').insert(offenceRows.map((o) => ({ id: uuidv4(), record_id: recordId, ...o })));
}

async function writeRevision(trx, { recordId, changeType, level, changedBy, comment, reason, ipAddress, fieldChanges }) {
  const revCountRow = await trx('record_revisions').where({ record_id: recordId }).count('* as count').first();
  const revisionNumber = (parseInt(revCountRow.count, 10) || 0) + 1;
  const prevHash = await getPreviousHash(recordId, trx);
  const changedAt = new Date().toISOString();
  const fieldChangesJson = JSON.stringify(fieldChanges || []);
  const rowHash = computeRowHash({
    record_id: recordId, revision_number: revisionNumber, changed_by: changedBy,
    changed_at: changedAt, field_changes: fieldChangesJson,
  }, prevHash);
  await trx('record_revisions').insert({
    id: uuidv4(), record_id: recordId, revision_number: revisionNumber, change_type: changeType,
    field_changes: fieldChangesJson, level: level || 'PS', changed_by: changedBy, changed_at: changedAt,
    comment: comment || null, reason: reason || null, ip_address: ipAddress || null,
    prev_hash: prevHash, row_hash: rowHash, hash_version: 1,
  });
}

async function writeAuditLog(trx, { recordId, action, user, fieldName, oldValue, newValue, reason, ipAddress }) {
  await trx('audit_logs').insert({
    id: uuidv4(), table_name: 'records', record_id: recordId, action,
    changed_by_id: user.id, changed_by_role: user.role, changed_at: new Date().toISOString(),
    field_name: fieldName || null,
    old_value: oldValue !== undefined ? JSON.stringify(oldValue) : null,
    new_value: newValue !== undefined ? JSON.stringify(newValue) : null,
    reason: reason || null, ip_address: ipAddress || null,
  });
}

function calculateDiff(oldFlat, newFlat) {
  const diff = [];
  const allKeys = new Set([...Object.keys(oldFlat || {}), ...Object.keys(newFlat || {})]);
  for (const key of allKeys) {
    if (JSON.stringify(oldFlat?.[key]) !== JSON.stringify(newFlat?.[key])) {
      diff.push({ field_key: key, old_value: oldFlat?.[key] ?? '', new_value: newFlat?.[key] ?? '' });
    }
  }
  return diff;
}

// Domain-status columns record_status_events tracks (DB_SCHEMA.md §4.8's CHECK set).
const STATUS_FIELD_BY_DETAIL_COLUMN = {
  fir_details: { case_status: 'case_status', is_worked_out: 'is_worked_out' },
  missing_details: { missing_status: 'missing_status' },
  uidb_details: { uidb_status: 'uidb_status' },
  pcr_call_details: { final_call_status: 'final_call_status' },
};

async function detectDetailStatusChanges(oldDetail, newDetailCols, detailTable) {
  const map = STATUS_FIELD_BY_DETAIL_COLUMN[detailTable];
  if (!map || !oldDetail) return [];
  const changes = [];
  for (const [column, statusField] of Object.entries(map)) {
    if (!(column in newDetailCols)) continue;
    const oldValue = oldDetail[column];
    const newValue = newDetailCols[column];
    const oldStr = oldValue === null || oldValue === undefined ? null : String(oldValue);
    const newStr = newValue === null || newValue === undefined ? null : String(newValue);
    if (oldStr === newStr) continue;
    changes.push({ statusField, oldValue: oldStr, newValue: newStr });
  }
  return changes;
}

async function writeStatusEvents(trx, recordId, user, changes, { effectiveDate, comment, propertyId } = {}) {
  for (const c of changes) {
    if (c.newValue === null) continue; // clearing a status is not itself a dated event
    await trx('record_status_events').insert({
      id: uuidv4(), record_id: recordId, property_id: c.statusField === 'property_status' ? propertyId : null,
      status_field: c.statusField, old_value: c.oldValue, new_value: c.newValue,
      effective_date: effectiveDate || toISO(new Date().toISOString()),
      changed_by: user.id, changed_at: new Date().toISOString(), comment: comment || null,
    });
  }
}

// ── read helpers ──────────────────────────────────────────────────────────────────────

async function enrichOffenceLabels(trx, rows) {
  if (!rows.length) return [];
  const actIds = [...new Set(rows.map((r) => r.act_id).filter((v) => v != null))];
  const sectionIds = [...new Set(rows.map((r) => r.section_id).filter(Boolean))];
  const majorIds = [...new Set(rows.map((r) => r.major_head_id).filter((v) => v != null))];
  const minorIds = [...new Set(rows.map((r) => r.minor_head_id).filter((v) => v != null))];
  const [acts, sections, majors, minors] = await Promise.all([
    actIds.length ? trx('ref.acts').whereIn('act_cd', actIds) : [],
    sectionIds.length ? trx('ref.sections').whereIn('section_code', sectionIds) : [],
    majorIds.length ? trx('ref.major_heads').whereIn('major_head_code', majorIds) : [],
    minorIds.length ? trx('ref.minor_heads').whereIn('minor_head_cd', minorIds) : [],
  ]);
  const actById = new Map(acts.map((a) => [a.act_cd, a.act_long]));
  const sectionById = new Map(sections.map((s) => [s.section_code, s.section]));
  const majorById = new Map(majors.map((m) => [m.major_head_code, m.major_head]));
  const minorById = new Map(minors.map((m) => [m.minor_head_cd, m.minor_head]));
  return rows.map((r) => ({
    ...r,
    act_label: r.other_act_name || actById.get(r.act_id) || null,
    section_label: sectionById.get(r.section_id) || null,
    major_head_label: majorById.get(r.major_head_id) || null,
    minor_head_label: minorById.get(r.minor_head_id) || null,
  }));
}

async function enrichDetailLabels(trx, detail) {
  if (!detail) return detail;
  if (detail.local_head_id != null) {
    const row = await trx('ref.local_heads').where({ local_head_cd: detail.local_head_id }).first();
    detail.local_head_id_label = row?.local_head || null;
  }
  if (detail.beat_id) {
    const row = await trx('ref.beats').where({ beat_cd: detail.beat_id }).first();
    detail.beat_id_label = row?.beat_name || null;
  }
  return detail;
}

/** Fetch a record's full typed state — spine, detail (+labels), persons (+subtypes),
 * properties, offences (+labels), and every referenced `locations` row — the shared read
 * used by both getRecordDetails (display) and updateRecord (diff + upsert baseline). */
async function fetchRecordFull(trx, id) {
  const record = await trx('records').where({ id }).first();
  if (!record) return null;

  const detailTable = mapper.DETAIL_TABLES[record.record_type];
  const detail = await trx(detailTable).where({ record_id: id }).first();
  if (detail) {
    detail.extra = typeof detail.extra === 'string' ? JSON.parse(detail.extra) : (detail.extra || {});
    await enrichDetailLabels(trx, detail);
  }

  const personRows = await trx('persons').where({ record_id: id }).orderBy('sort_order', 'asc');
  for (const p of personRows) {
    p.extra = typeof p.extra === 'string' ? JSON.parse(p.extra) : (p.extra || {});
    p.nick_names = typeof p.nick_names === 'string' ? JSON.parse(p.nick_names) : (p.nick_names || []);
    p.subtypes = {};
    for (const t of mapper.PERSON_SUBTYPE_TABLES) {
      const row = await trx(t).where({ person_id: p.id }).first();
      if (row) p.subtypes[t] = row;
    }
  }

  const propertyRows = await trx('record_properties').where({ record_id: id }).orderBy('sort_order', 'asc');
  for (const p of propertyRows) p.extra = typeof p.extra === 'string' ? JSON.parse(p.extra) : (p.extra || {});

  const offenceRowsRaw = await trx('record_offences').where({ record_id: id }).orderBy('sort_order', 'asc');
  const offenceRows = await enrichOffenceLabels(trx, offenceRowsRaw);

  const locationIds = new Set();
  if (detail) {
    for (const slotMap of Object.values(mapper.DETAIL_LOCATION_SLOTS)) {
      const c = slotMap[record.record_type];
      if (c && detail[c]) locationIds.add(detail[c]);
    }
  }
  for (const p of personRows) {
    if (p.present_location_id) locationIds.add(p.present_location_id);
    if (p.perm_location_id) locationIds.add(p.perm_location_id);
    for (const s of Object.values(p.subtypes)) {
      for (const col of ['arrest_location_id', 'missing_location_id', 'found_location_id']) {
        if (s[col]) locationIds.add(s[col]);
      }
    }
  }
  const locationRows = locationIds.size ? await trx('locations').whereIn('id', [...locationIds]) : [];
  const locationsById = Object.fromEntries(locationRows.map((l) => [l.id, l]));

  return { record, detail, personRows, propertyRows, offenceRows, locationsById };
}

// ── requiredness (P2.4 — full validation at submit, drafts save partial) ────────────────

function isFieldVisible(f, flatData) {
  const sw = f.show_when;
  if (!sw || !sw.field) return true;
  const actual = flatData[sw.field];
  if (sw.operator === 'filled') return actual !== undefined && actual !== null && actual !== '';
  if (Array.isArray(sw.value)) return sw.value.includes(actual);
  return actual === sw.value;
}

export async function validateRequiredFields(trx, recordType, flatData) {
  const registry = await mapper.loadRegistry(trx, recordType);
  const missing = [];
  for (const f of registry) {
    if (f.storage === 'ui_only') continue;
    if (f.validation_rules?.required !== true) continue;
    if (!isFieldVisible(f, flatData)) continue;
    const val = flatData[f.field_key];
    if (val === undefined || val === null || val === '') missing.push(f.labels?.en || f.field_key);
  }
  if (missing.length) {
    const err = new Error(`Missing required fields before submit: ${missing.join(', ')}`);
    err.status = 422;
    throw err;
  }
}

// ── list / detail reads ──────────────────────────────────────────────────────────────

function buildListSummary(r) {
  switch (r.record_type) {
    case 'CASE': return { fir_no: r.fir_no, case_status: r.case_status, local_head: r.case_local_head, is_worked_out: r.is_worked_out, io_name: r.io_name };
    case 'ARREST': return { fir_no: r.arrest_fir_no, case_status: r.arrest_case_status, local_head: r.arrest_local_head, io_name: r.io_name };
    case 'PCR_CALL': return { final_call_status: r.final_call_status, call_head: r.call_head, io_name: r.io_name };
    case 'MISSING': return { missing_status: r.missing_status, fir_no: r.missing_fir_no, io_name: r.io_name };
    case 'UIDB': return { uidb_status: r.uidb_status, uidb_no: r.uidb_no, local_head: r.uidb_local_head, io_name: r.io_name };
    default: return {};
  }
}

function withListJoins(query) {
  return query
    .join('hierarchy_nodes as ps', 'records.ps_id', 'ps.id')
    .join('hierarchy_nodes as dist', 'records.district_id', 'dist.id')
    .join('users as u', 'records.created_by', 'u.id')
    .leftJoin('investigating_officers as io', 'records.io_id', 'io.id')
    .leftJoin('fir_details as fir', 'records.id', 'fir.record_id')
    .leftJoin('ref.local_heads as lh_fir', 'fir.local_head_id', 'lh_fir.local_head_cd')
    .leftJoin('arrest_details as arr', 'records.id', 'arr.record_id')
    .leftJoin('ref.local_heads as lh_arr', 'arr.local_head_id', 'lh_arr.local_head_cd')
    .leftJoin('pcr_call_details as pcr', 'records.id', 'pcr.record_id')
    .leftJoin('missing_details as mis', 'records.id', 'mis.record_id')
    .leftJoin('uidb_details as uidb', 'records.id', 'uidb.record_id')
    .leftJoin('ref.local_heads as lh_uidb', 'uidb.local_head_id', 'lh_uidb.local_head_cd')
    .select(
      'records.*', 'ps.name as ps_name', 'dist.name as district_name', 'u.name as creator_name',
      'io.name as io_name',
      'fir.fir_no as fir_no', 'fir.case_status as case_status', 'fir.is_worked_out as is_worked_out',
      'lh_fir.local_head as case_local_head',
      'arr.case_status as arrest_case_status', 'arr.fir_no as arrest_fir_no', 'lh_arr.local_head as arrest_local_head',
      'pcr.final_call_status as final_call_status', 'pcr.call_head as call_head',
      'mis.missing_status as missing_status', 'mis.fir_no as missing_fir_no',
      'uidb.uidb_status as uidb_status', 'uidb.uidb_no as uidb_no', 'lh_uidb.local_head as uidb_local_head',
    );
}

export const listRecords = async (recordType, filters, jurisdictionQuery) => {
  let query = withListJoins(db('records'));

  if (jurisdictionQuery.ps_id) query = query.where('records.ps_id', jurisdictionQuery.ps_id);
  if (jurisdictionQuery.district_id) query = query.where('records.district_id', jurisdictionQuery.district_id);
  if (jurisdictionQuery.sub_div_id) query = query.where('records.sub_div_id', jurisdictionQuery.sub_div_id);

  if (recordType && recordType !== 'ALL') query = query.where('records.record_type', recordType);

  if (filters.status) {
    if (Array.isArray(filters.status)) query = query.whereIn('records.current_status', filters.status);
    else query = query.where('records.current_status', filters.status);
  }
  if (filters.dateFrom) query = query.where('records.record_date', '>=', filters.dateFrom);
  if (filters.dateTo) query = query.where('records.record_date', '<=', filters.dateTo);

  if (filters.localHead) {
    query = query.where((b) => {
      b.whereRaw('lh_fir.local_head ILIKE ?', [filters.localHead])
        .orWhereRaw('lh_arr.local_head ILIKE ?', [filters.localHead])
        .orWhereRaw('lh_uidb.local_head ILIKE ?', [filters.localHead]);
    });
  }

  if (filters.search) {
    const term = `%${filters.search}%`;
    query = query.where((b) => {
      b.whereRaw('fir.fir_no ILIKE ?', [term])
        .orWhereRaw('arr.fir_no ILIKE ?', [term])
        .orWhereRaw('uidb.uidb_no ILIKE ?', [term])
        .orWhereExists(function () {
          this.select('*').from('persons').whereRaw('persons.record_id = records.id').andWhere('persons.name', 'ILIKE', term);
        });
    });
  }

  if (filters.linked_case_id) {
    query = query.whereExists(function () {
      this.select('*').from('record_links')
        .whereRaw('record_links.target_record_id = records.id')
        .where('record_links.source_record_id', filters.linked_case_id);
    });
  }

  if (filters.linked_fir_no) {
    query = query.whereExists(function () {
      this.select('*').from('record_links')
        .whereRaw('record_links.target_record_id = records.id')
        .join('fir_details as case_fir', 'case_fir.record_id', 'record_links.source_record_id')
        .where('case_fir.fir_no', filters.linked_fir_no);
    });
  }

  const rawRecords = await query.orderBy('records.created_at', 'desc');
  return rawRecords.map((r) => ({ ...r, data: buildListSummary(r) }));
};

export const getRecordDetails = async (id) => {
  return db.transaction(async (trx) => {
    const full = await fetchRecordFull(trx, id);
    if (!full) return null;
    const { record, detail, personRows, propertyRows, offenceRows, locationsById } = full;

    const [ps, dist] = await Promise.all([
      trx('hierarchy_nodes').where({ id: record.ps_id }).first(),
      trx('hierarchy_nodes').where({ id: record.district_id }).first(),
    ]);
    record.ps_name = ps?.name || null;
    record.district_name = dist?.name || null;

    const registry = await mapper.loadRegistry(trx, record.record_type);
    const { data, persons, properties } = await mapper.recomposeRecord(trx, registry, record.record_type, {
      spineRow: record, detailRow: detail, personRows, propertyRows, offenceRows, locationsById,
    });
    record.data = data;

    const revisions = await trx('record_revisions')
      .select('record_revisions.*', 'u.username', 'u.name as user_fullname')
      .join('users as u', 'record_revisions.changed_by', 'u.id')
      .where('record_revisions.record_id', id)
      .orderBy('record_revisions.revision_number', 'asc');
    revisions.forEach((rev) => { rev.field_changes = typeof rev.field_changes === 'string' ? JSON.parse(rev.field_changes) : rev.field_changes; });

    const transitions = await trx('workflow_transitions')
      .select('workflow_transitions.*', 'u.username')
      .join('users as u', 'workflow_transitions.performed_by', 'u.id')
      .where('workflow_transitions.record_id', id)
      .orderBy('workflow_transitions.performed_at', 'asc');
    transitions.forEach((tr) => { tr.target_fields = typeof tr.target_fields === 'string' ? JSON.parse(tr.target_fields) : tr.target_fields; });

    const statusEvents = await trx('record_status_events')
      .select('record_status_events.*', 'u.username')
      .join('users as u', 'record_status_events.changed_by', 'u.id')
      .where('record_status_events.record_id', id)
      .orderBy('record_status_events.effective_date', 'desc');

    let linkedRecords = [];
    try { linkedRecords = await getLinksForRecord(id); } catch { linkedRecords = []; }

    return { record, revisions, transitions, status_events: statusEvents, linkedRecords, persons, properties, offences: offenceRows };
  });
};

// ── write path ────────────────────────────────────────────────────────────────────────

/**
 * Shared transaction body for every fresh-record insert. `createRecord` (interactive HTTP
 * create) and `createImportedRecord` (bulk import, Integration 3) are both thin wrappers
 * around this — P1.2's one write path stays one function, not one endpoint. `opts.scope`
 * defaults to the acting user's own jurisdiction (the interactive-create case); import is the
 * only caller that ever passes a different scope, and only with a batch-derived, pre-validated
 * value — never from request body / sheet content (P5.4).
 */
async function insertRecordCore(trx, user, recordType, recordDate, data, ipAddress, split, opts = {}) {
  const {
    scope = { ps_id: user.ps_id, district_id: user.district_id, sub_div_id: user.sub_div_id || null },
    status = 'DRAFT',
    level = 'PS',
    changeType = 'CREATE',
    importStamps = null, // { isLegacy, sourceSystem, legacyRef, batchId }
  } = opts;

  const id = uuidv4();
  const detailTable = mapper.DETAIL_TABLES[recordType];

  const detailLocationIds = {};
  for (const [slot, cols] of Object.entries(split.detailLocationFields)) {
    detailLocationIds[slot] = await insertLocation(trx, cols);
  }
  for (const [slot, locId] of Object.entries(detailLocationIds)) {
    const col = mapper.DETAIL_LOCATION_SLOTS[slot]?.[recordType];
    if (col) split.detail[col] = locId;
  }

  await trx('records').insert({
    id, record_type: recordType, ps_id: scope.ps_id, district_id: scope.district_id, sub_div_id: scope.sub_div_id || null,
    io_id: split.spine.io_id || null, current_status: status, current_level: level, record_date: recordDate,
    created_by: user.id, updated_by: user.id,
    ...(importStamps ? {
      is_legacy: !!importStamps.isLegacy,
      source_system: importStamps.sourceSystem,
      legacy_ref: importStamps.legacyRef,
      import_batch_id: importStamps.batchId,
      imported_at: trx.fn.now(),
      imported_by: user.id,
    } : {}),
  });

  await trx(detailTable).insert({ record_id: id, ...detailScopingColumns(recordType, scope.ps_id), ...split.detail, extra: JSON.stringify(split.detailExtra) });

  const personIdBySourceIndex = {};
  for (const entry of split.personEntries) {
    const personId = await insertPersonEntry(trx, id, entry);
    if (entry.sourceKind === 'repeater') personIdBySourceIndex[entry.sourceIndex] = personId;
  }

  for (const prop of split.propertyEntries) {
    const personId = prop.personIndex != null ? (personIdBySourceIndex[prop.personIndex] ?? null) : null;
    await trx('record_properties').insert({
      id: uuidv4(), record_id: id, person_id: personId, ...prop.columns,
      extra: JSON.stringify(prop.extra || {}), sort_order: 0,
    });
  }

  await replaceOffenceRows(trx, id, split.offenceRows);

  await writeRevision(trx, {
    recordId: id, changeType, level, changedBy: user.id, ipAddress,
    fieldChanges: calculateDiff({}, data),
  });
  await writeAuditLog(trx, { recordId: id, action: changeType, user, newValue: data, ipAddress });

  return { id, ps_id: scope.ps_id };
}

export const createRecord = async (user, recordType, recordDate, data, ipAddress, { persons = [], properties = [], offences = [] } = {}) => {
  const dbRecord = await db.transaction(async (trx) => {
    const registry = await mapper.loadRegistry(trx, recordType);
    const split = await mapper.splitPayload(trx, registry, recordType, { data, persons, properties, offences }, user.ps_id);
    return insertRecordCore(trx, user, recordType, recordDate, data, ipAddress, split);
  });

  await eventBus.publish('record.created', {
    record_id: dbRecord.id, record_type: recordType, changed_by: user.id, ps_id: dbRecord.ps_id,
    counts: { persons: (persons || []).length, properties: (properties || []).length, offences: (offences || []).length },
  });

  return { id: dbRecord.id };
};

/**
 * Bulk-import create — same transaction core as createRecord, with import-specific scope/
 * status/provenance. Never reachable from the interactive HTTP create path (that foot-gun is
 * the whole reason this is a separate wrapper rather than an options bag on createRecord —
 * see docs/new-db-integration/03-import.md AD1). `scope` must be pre-validated by the caller
 * (the import batch's target PS/district, checked against the uploader's own jurisdiction at
 * batch-creation time — never taken from spreadsheet content, P5.4/P5.6).
 */
export const createImportedRecord = async (
  user, recordType, recordDate, data, ipAddress,
  { persons = [], properties = [], offences = [] } = {},
  { scope, isLegacy = false, status = 'DRAFT', batchId, sourceRef } = {}
) => {
  if (!scope || !scope.ps_id || !scope.district_id) {
    throw new Error('createImportedRecord requires a resolved scope { ps_id, district_id }');
  }

  const dbRecord = await db.transaction(async (trx) => {
    const registry = await mapper.loadRegistry(trx, recordType);
    const split = await mapper.splitPayload(trx, registry, recordType, { data, persons, properties, offences }, scope.ps_id);
    return insertRecordCore(trx, user, recordType, recordDate, data, ipAddress, split, {
      scope, status, level: 'PS', changeType: 'IMPORT',
      importStamps: { isLegacy, sourceSystem: 'BULK_IMPORT', legacyRef: sourceRef, batchId },
    });
  });

  // Same event as the interactive create path (record.created) — this is what makes
  // linkResolver.js resolve CASE_ARREST/CASE_MISSING links for imported records too;
  // notifyHandler.js doesn't subscribe to record.created, so no notification suppression
  // is needed for legacy imports (docs/new-db-integration/03-import.md C7).
  await eventBus.publish('record.created', {
    record_id: dbRecord.id, record_type: recordType, changed_by: user.id, ps_id: dbRecord.ps_id,
    counts: { persons: (persons || []).length, properties: (properties || []).length, offences: (offences || []).length },
  });

  return { id: dbRecord.id };
};

const EDITABLE_STATUSES = ['DRAFT', 'SENT_BACK'];

export const updateRecord = async (id, user, data, ipAddress, { persons, properties, offences } = {}) => {
  const dbRecord = await db.transaction(async (trx) => {
    const full = await fetchRecordFull(trx, id);
    if (!full) throw new Error('Record not found');
    const { record, detail: oldDetail, personRows: oldPersonRows, propertyRows: oldPropertyRows } = full;

    if (!EDITABLE_STATUSES.includes(record.current_status)) {
      throw new Error('This record is locked. Only DRAFT or sent-back records can be edited.');
    }

    const recordType = record.record_type;
    const detailTable = mapper.DETAIL_TABLES[recordType];
    const registry = await mapper.loadRegistry(trx, recordType);

    const { data: oldFlatData } = await mapper.recomposeRecord(trx, registry, recordType, {
      spineRow: record, detailRow: oldDetail, personRows: oldPersonRows, propertyRows: oldPropertyRows,
      offenceRows: full.offenceRows, locationsById: full.locationsById,
    });

    const split = await mapper.splitPayload(trx, registry, recordType, {
      data, persons: persons ?? [], properties: properties ?? [], offences: offences ?? [],
    }, record.ps_id);

    const statusChanges = await detectDetailStatusChanges(oldDetail, split.detail, detailTable);

    const detailLocationIds = {};
    for (const [slot, cols] of Object.entries(split.detailLocationFields)) {
      const col = mapper.DETAIL_LOCATION_SLOTS[slot]?.[recordType];
      const existingLocId = col && oldDetail ? oldDetail[col] : null;
      detailLocationIds[slot] = await upsertLocation(trx, existingLocId, cols);
    }
    for (const [slot, locId] of Object.entries(detailLocationIds)) {
      const col = mapper.DETAIL_LOCATION_SLOTS[slot]?.[recordType];
      if (col) split.detail[col] = locId;
    }

    if (oldDetail) await trx(detailTable).where({ record_id: id }).update({ ...split.detail, extra: JSON.stringify(split.detailExtra), updated_at: trx.fn.now() });
    else await trx(detailTable).insert({ record_id: id, ...detailScopingColumns(recordType, record.ps_id), ...split.detail, extra: JSON.stringify(split.detailExtra) });

    const personIdBySourceIndex = persons !== undefined
      ? await upsertPersons(trx, id, split.personEntries, oldPersonRows)
      : {};

    let propertyStatusChanges = [];
    if (properties !== undefined) {
      const result = await upsertProperties(trx, id, split.propertyEntries, oldPropertyRows, personIdBySourceIndex);
      propertyStatusChanges = result.statusChanges;
    }

    if (offences !== undefined || (data.act_name !== undefined || data.sections !== undefined)) {
      await replaceOffenceRows(trx, id, split.offenceRows);
    }

    await trx('records').where({ id }).update({ updated_by: user.id, updated_at: trx.fn.now() });

    const { data: newFlatData } = await mapper.recomposeRecord(trx, registry, recordType, {
      spineRow: { ...record, io_id: split.spine.io_id ?? record.io_id }, detailRow: { ...oldDetail, ...split.detail },
      personRows: oldPersonRows, propertyRows: oldPropertyRows, offenceRows: full.offenceRows, locationsById: full.locationsById,
    });
    const diff = calculateDiff(oldFlatData, { ...newFlatData, ...data });
    if (diff.length === 0 && statusChanges.length === 0 && propertyStatusChanges.length === 0) return { id, data: oldFlatData };

    await writeRevision(trx, {
      recordId: id, changeType: 'UPDATE', level: record.current_level, changedBy: user.id, ipAddress, fieldChanges: diff,
    });
    for (const change of diff) {
      await writeAuditLog(trx, { recordId: id, action: 'UPDATE', user, fieldName: change.field_key, oldValue: change.old_value, newValue: change.new_value, ipAddress });
    }

    const effectiveDate = split.detail.worked_out_date || toISO(new Date().toISOString());
    await writeStatusEvents(trx, id, user, statusChanges, { effectiveDate });
    for (const c of propertyStatusChanges) {
      await writeStatusEvents(trx, id, user, [{ statusField: 'property_status', oldValue: c.oldValue, newValue: c.newValue }], {
        effectiveDate: toISO(new Date().toISOString()), propertyId: c.propertyId,
      });
    }

    return { id, data: { ...newFlatData, ...data } };
  });

  await eventBus.publish('record.updated', { record_id: id, changed_by: user.id });
  return dbRecord;
};

export const submitRecord = async (id, user, ipAddress) => {
  const record = await db('records').where({ id }).first();
  if (!record) throw new Error('Record not found');

  await db.transaction(async (trx) => {
    const full = await fetchRecordFull(trx, id);
    const registry = await mapper.loadRegistry(trx, record.record_type);
    const { data: flatData } = await mapper.recomposeRecord(trx, registry, record.record_type, {
      spineRow: record, detailRow: full.detail, personRows: full.personRows, propertyRows: full.propertyRows,
      offenceRows: full.offenceRows, locationsById: full.locationsById,
    });
    await validateRequiredFields(trx, record.record_type, flatData);
  });

  await transitionRecord(id, user, 'submit', null, null, ipAddress);
};

export const transitionRecord = async (id, user, action, comment, targetFields, ipAddress) => {
  await db.transaction(async (trx) => {
    // SELECT ... FOR UPDATE serializes revision_number/prev_hash assignment for this record —
    // the single write path (ARCHITECTURE.md §4.2) now owns every change_type's revision write.
    const record = await trx('records').where({ id }).forUpdate().first();
    if (!record) throw new Error('Record not found');
    if (record.is_frozen) throw new Error('Record is frozen pending audit review and cannot be transitioned.');

    const fromStatus = record.current_status;
    const rule = await workflowEngine.getRule(trx, { fromStatus, action, recordType: record.record_type });
    workflowEngine.assertAllowed(rule, user);
    workflowEngine.assertComment(rule, comment);
    const { toStatus: targetStatus, toLevel: targetLevel } = await workflowEngine.resolveTarget(trx, rule, record);

    await trx('records').where({ id }).update({
      current_status: targetStatus, current_level: targetLevel, updated_by: user.id, updated_at: trx.fn.now(),
    });

    await trx('workflow_transitions').insert({
      id: uuidv4(), record_id: id, from_status: fromStatus, to_status: targetStatus,
      from_level: record.current_level, to_level: targetLevel, action: action.toUpperCase(),
      performed_by: user.id, performed_at: new Date().toISOString(), comment,
      target_fields: JSON.stringify(targetFields || []),
    });

    await writeRevision(trx, {
      recordId: id, changeType: 'STATUS_CHANGE', level: targetLevel, changedBy: user.id, ipAddress,
      comment, fieldChanges: [{ field_key: 'current_status', old_value: fromStatus, new_value: targetStatus }],
    });

    await writeAuditLog(trx, { recordId: id, action: action.toUpperCase(), user, reason: comment, ipAddress });
  });

  // Named events for the three notifyHandler.js cares about (CLAUDE.md §8's "Active
  // events" list); everything else (compile, seal, jcp/scp-approve which are still
  // action='approve' and correctly hit the 'approved' branch, transfer_*, amendment_*)
  // falls through to the generic 'record.status_changed', matching the event catalog.
  const EVENT_NAME_BY_ACTION = { submit: 'submitted', approve: 'approved', send_back: 'sent_back' };
  const eventName = `record.${EVENT_NAME_BY_ACTION[action.toLowerCase()] || 'status_changed'}`;
  await eventBus.publish(eventName, { record_id: id, performed_by: user.id, comment });
};

/**
 * District-level head override (item 4) — rewritten against `record_offences` (the old
 * implementation touched the dead `records.data` blob). Updates the record's single-head
 * classification: the `is_primary` `record_offences` row's major/minor head, and/or the
 * detail table's `local_head_id` (the PS-level classification, a separate fact — §2.7/§2.2).
 */
export const overrideCaseHead = async (id, user, newHead, reason, ipAddress) => {
  if (!newHead) throw new Error('New crime head classification is required');
  if (!reason || reason.trim().length < 10) throw new Error('Justification reason must be at least 10 characters long');

  const result = await db.transaction(async (trx) => {
    const record = await trx('records').where({ id }).forUpdate().first();
    if (!record) throw new Error('Record not found');
    const detailTable = mapper.DETAIL_TABLES[record.record_type];

    const { id: newMajorHeadId } = await resolveMajorHead(trx, newHead);
    const { id: newLocalHeadId } = await resolveLocalHead(trx, newHead);

    let oldValue = null;
    if (newMajorHeadId) {
      const primaryRow = await trx('record_offences').where({ record_id: id, is_primary: true }).first();
      if (primaryRow) {
        oldValue = primaryRow.major_head_id;
        await trx('record_offences').where({ id: primaryRow.id }).update({ major_head_id: newMajorHeadId, updated_at: trx.fn.now() });
      } else {
        await trx('record_offences').insert({
          id: uuidv4(), record_id: id, major_head_id: newMajorHeadId, other_act_name: '(head override)', is_primary: true, sort_order: 0,
        });
      }
    } else if (newLocalHeadId) {
      const detailRow = await trx(detailTable).where({ record_id: id }).first();
      oldValue = detailRow?.local_head_id ?? null;
      await trx(detailTable).where({ record_id: id }).update({ local_head_id: newLocalHeadId, updated_at: trx.fn.now() });
    } else {
      throw new Error(`"${newHead}" did not match any known major head or local head classification`);
    }

    await writeRevision(trx, {
      recordId: id, changeType: 'HEAD_OVERRIDE', level: record.current_level, changedBy: user.id, ipAddress, reason,
      fieldChanges: [{ field_key: 'crime_head', old_value: oldValue ?? '', new_value: newHead }],
    });
    await writeAuditLog(trx, { recordId: id, action: 'OVERRIDE', user, fieldName: 'crime_head', oldValue, newValue: newHead, reason, ipAddress });

    return { id, newHead };
  });

  await eventBus.publish('record.overridden', { record_id: id, performed_by: user.id, reason });
  return result;
};

/**
 * Domain status update (item 9) — the officer-facing "update case/missing/uidb/PCR status,
 * or flip worked-out" action, distinct from workflow transitions. Writes the current-value
 * column AND a dated `record_status_events` row in one transaction (ruling 22).
 */
export const updateDomainStatus = async (id, user, { statusField, newValue, effectiveDate, comment, propertyId } = {}, ipAddress) => {
  const VALID_FIELDS = ['case_status', 'missing_status', 'uidb_status', 'final_call_status', 'property_status', 'is_worked_out'];
  if (!VALID_FIELDS.includes(statusField)) throw Object.assign(new Error(`Unknown status_field "${statusField}"`), { status: 422 });
  if (!newValue) throw Object.assign(new Error('new_value is required'), { status: 422 });
  const effDate = toISO(effectiveDate);
  if (!effDate) throw Object.assign(new Error('A valid effective_date is required'), { status: 422 });
  if (effDate > toISO(new Date().toISOString())) throw Object.assign(new Error('effective_date cannot be in the future'), { status: 422 });
  if (statusField === 'property_status' && !propertyId) throw Object.assign(new Error('property_id is required for property_status updates'), { status: 422 });

  const result = await db.transaction(async (trx) => {
    const record = await trx('records').where({ id }).forUpdate().first();
    if (!record) throw new Error('Record not found');
    const detailTable = mapper.DETAIL_TABLES[record.record_type];

    let oldValue = null;
    if (statusField === 'property_status') {
      const prop = await trx('record_properties').where({ id: propertyId, record_id: id }).first();
      if (!prop) throw Object.assign(new Error('Property not found on this record'), { status: 404 });
      oldValue = prop.status;
      await trx('record_properties').where({ id: propertyId }).update({ status: newValue, updated_at: trx.fn.now() });
    } else {
      const column = { case_status: 'case_status', missing_status: 'missing_status', uidb_status: 'uidb_status', final_call_status: 'final_call_status', is_worked_out: 'is_worked_out' }[statusField];
      const detailRow = await trx(detailTable).where({ record_id: id }).first();
      if (!detailRow || !(column in detailRow)) throw Object.assign(new Error(`"${statusField}" does not apply to record type ${record.record_type}`), { status: 422 });
      oldValue = detailRow[column];
      const coerced = statusField === 'is_worked_out' ? (newValue === 'true' || newValue === true) : newValue;
      const updatePayload = { [column]: coerced, updated_at: trx.fn.now() };
      if (statusField === 'is_worked_out' && coerced === true) updatePayload.worked_out_date = effDate;
      await trx(detailTable).where({ record_id: id }).update(updatePayload);
    }

    await trx('record_status_events').insert({
      id: uuidv4(), record_id: id, property_id: statusField === 'property_status' ? propertyId : null,
      status_field: statusField, old_value: oldValue === null ? null : String(oldValue), new_value: String(newValue),
      effective_date: effDate, changed_by: user.id, changed_at: new Date().toISOString(), comment: comment || null,
    });

    await writeRevision(trx, {
      recordId: id, changeType: 'STATUS_CHANGE', level: record.current_level, changedBy: user.id, ipAddress, comment,
      fieldChanges: [{ field_key: statusField, old_value: oldValue ?? '', new_value: newValue }],
    });
    await writeAuditLog(trx, { recordId: id, action: 'STATUS_UPDATE', user, fieldName: statusField, oldValue, newValue, reason: comment, ipAddress });

    return { id, statusField, newValue, effectiveDate: effDate };
  });

  await eventBus.publish('record.updated', { record_id: id, changed_by: user.id });
  return result;
};

export const getRecordRevisions = async (record_id) => {
  return db('record_revisions').where({ record_id }).orderBy('revision_number', 'asc');
};

export const checkDuplicateRecord = async (recordType, firNumber, accusedName, date) => {
  const detailTable = mapper.DETAIL_TABLES[recordType.toUpperCase()];
  if (firNumber && firNumber.trim().length > 0 && detailTable) {
    const existing = await db('records')
      .join(`${detailTable} as d`, 'records.id', 'd.record_id')
      .where('records.record_type', recordType.toUpperCase())
      .andWhere('d.fir_no', firNumber)
      .select('records.id')
      .first();
    if (existing) return { isDuplicate: true, existingId: existing.id };
  }

  if (accusedName && date) {
    const existing = await db('records')
      .join('persons', 'persons.record_id', 'records.id')
      .where('records.record_type', recordType.toUpperCase())
      .andWhere('records.record_date', toISO(date) || date)
      .andWhere('persons.role', 'ACCUSED')
      .andWhere('persons.name', 'ILIKE', accusedName)
      .select('records.id')
      .first();
    if (existing) return { isDuplicate: true, existingId: existing.id };
  }

  return { isDuplicate: false };
};

/** Ad-hoc filter-spec search (used by the /records/search endpoint). Only spine-level
 * (typed, non-repeater) fields are supported today — person/property-scoped filters need
 * the same registry-driven resolution the mapper does and are explicitly out of scope for
 * this integration (see docs/new-db-integration/02-records-write-path.md deferrals). */
export const searchRecordsWithSpec = async (recordType, filterSpec, jurisdictionQuery = {}) => {
  let query = withListJoins(db('records'));
  if (jurisdictionQuery.ps_id) query = query.where('records.ps_id', jurisdictionQuery.ps_id);
  if (jurisdictionQuery.district_id) query = query.where('records.district_id', jurisdictionQuery.district_id);
  if (jurisdictionQuery.sub_div_id) query = query.where('records.sub_div_id', jurisdictionQuery.sub_div_id);
  if (recordType && recordType !== 'ALL') query = query.where('records.record_type', recordType);

  const conditions = filterSpec?.conditions || [];
  for (const cond of conditions) {
    if (cond.field === 'current_status') query = query.where('records.current_status', cond.value);
    else if (cond.field === 'record_date') query = query.where('records.record_date', cond.operator || '=', cond.value);
    else {
      const err = new Error(`Filter field "${cond.field}" is not supported yet — only current_status/record_date filters are typed-schema-ready in this integration.`);
      err.status = 400;
      throw err;
    }
  }

  const rawRecords = await query.orderBy('records.created_at', 'desc');
  return rawRecords.map((r) => ({ ...r, data: buildListSummary(r) }));
};

export const deleteRecord = async (id, user) => {
  await db.transaction(async (trx) => {
    const record = await trx('records').where({ id }).first();
    if (!record) { const err = new Error('Record not found'); err.status = 404; throw err; }
    if (record.current_status !== 'DRAFT') { const err = new Error('Only DRAFT records can be deleted'); err.status = 400; throw err; }
    await trx('records').where({ id }).delete(); // cascades detail/persons/properties/offences
    await writeAuditLog(trx, { recordId: id, action: 'DELETE', user });
  });
  await eventBus.publish('record.deleted', { record_id: id, performed_by: user.id });
};
