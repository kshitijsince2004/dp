// The registry-driven splitter/recomposer (ENGINEERING_BASELINE.md P1.3): the ONE place
// that knows how a `field_registry.storage` mapping routes a submitted value to its typed
// table/column. records.service.js calls `splitPayload` to turn a flat write payload into
// per-table row data (still no DB writes here — the service owns the transaction and the
// actual INSERT/UPDATE order) and `recomposeRecord` to turn typed rows back into the flat
// shape the frontend already speaks (DynamicForm's `initialData`, RecordDetail's display).
//
// Never hardcode "field X goes to column Y" outside this file — if a field moves, only
// `config/fields/*.json` changes.
import {
  normalizeText, normalizeDate, normalizePhone, normalizeFirNo, toBool, normalizeEnumUpper,
  resolveAct, resolveSection, resolveMajorHead, resolveMinorHead,
  resolveLocalHead, resolveBeat,
  resolvePropertyMajorCategory, resolvePropertyMinorCategory,
  loadKnownActLabels,
} from './records.normalize.js';
import { getLogger } from '../../utils/logger.js';

// STYLE ANCHOR followed (see records.service.js / HANDOFF.md §7). Per-field-in-a-loop lines are
// deliberately NOT logged (would be pure noise across a 50+ field registry) — logging here targets
// genuine decisions/effects: a value salvaged/coerced, a deferred FK label resolved, an offence row
// built, a split/recompose's overall shape. Mirrors records.service.js's upsertPersons/upsertProperties
// pattern (summary-with-counts + per-item lines only where something real happened).
const log = getLogger('records.mapper');

// T7.1 — columns whose CHECK constraint vocabulary is UPPERCASE while field_registry's option
// values are Title Case (see records.normalize.js's normalizeEnumUpper doc comment). Keyed by
// table so the same column name on an unrelated table (there isn't one today, but the map is
// explicit rather than a bare column-name Set for exactly that reason) is never accidentally
// swept in.
const ENUM_UPPER_COLUMNS = {
  persons: new Set(['gender', 'relation_type']),
  record_properties: new Set(['status']),
};

// The exact CHECK-constraint vocabulary for each enum-upper column (must mirror the migration
// CHECKs — 20260711000004_persons_properties.js). A value OUTSIDE its set crashes the whole
// import row with pg 23514 + an opaque "system error": real 2026-07-20 examples were an accused
// gender of "Yadav" (a surname mis-entered into the gender column) and a property status of
// "Mobile" (the item name mis-entered into the status column). The frontend constrains
// interactive entry to these via dropdowns, so out-of-vocabulary values only arrive through
// messy bulk import — we coerce them (see normalizeEnumConstrained) instead of crashing.
const ENUM_ALLOWED = {
  persons: {
    gender: new Set(['MALE', 'FEMALE', 'TRANSGENDER', 'OTHER', 'UNKNOWN']),
    relation_type: new Set(['FATHER', 'MOTHER', 'HUSBAND', 'WIFE', 'GUARDIAN', 'OTHER']),
  },
  record_properties: {
    status: new Set(['STOLEN', 'RECOVERED', 'SEIZED', 'INTACT', 'UNCLAIMED', 'INVOLVED']),
  },
};
// Fallback for an out-of-vocabulary / empty value. gender & relation_type are nullable → null
// (drop the bad value, keep the rest of the person). record_properties.status is
// NOT NULL DEFAULT 'STOLEN' → coerce to 'STOLEN' (an explicit null would just trade a 23514 for
// a 23502 not-null crash); this matches the column's own default, so a property with a
// mis-entered/blank status still imports as a STOLEN property rather than sinking the record.
const ENUM_FALLBACK = {
  record_properties: { status: 'STOLEN' },
};

export const PINCODE_MIN_DIGITS = 5; // shortest plausible pincode; below this = not a pincode

/** The SINGLE source of truth for "would this enum value be salvaged?". Returns null when `raw`
 * is a valid in-vocabulary value OR is empty (empty isn't a "cleaned bad value" — it's just
 * absent). Otherwise returns { to } = the coerced value the write path will store instead. Used
 * by normalizeEnumConstrained (to actually coerce) AND by import.validate.js (to WARN the
 * operator that a cell was salvaged — user decision 2026-07-20), so the two can never drift. */
export function enumCoercion(table, column, raw) {
  const up = normalizeEnumUpper(raw);
  if (up === null) return null; // empty → absent, not salvaged
  const allowed = ENUM_ALLOWED[table]?.[column];
  if (!allowed || allowed.has(up)) return null; // valid in-vocabulary value
  const fallback = ENUM_FALLBACK[table]?.[column];
  const to = fallback !== undefined ? fallback : null;
  log.warn('enumCoercion: out-of-vocabulary value salvaged', { table, column, raw, salvagedTo: to });
  return { to };
}

/** SINGLE source of truth for "would this pincode be salvaged to null?" — non-empty but fewer
 * than PINCODE_MIN_DIGITS digits (e.g. the "6-digit PIN code" placeholder). null = kept as-is
 * (after digit-strip). Mirrors normalizeLocationValue's pincode branch; shared with validate. */
export function pincodeCoercion(raw) {
  if (raw === null || raw === undefined) return null;
  const s = String(raw).trim();
  if (s === '') return null;
  const digits = s.replace(/\D/g, '');
  if (digits.length < PINCODE_MIN_DIGITS) {
    log.warn('pincodeCoercion: implausibly short pincode salvaged to null', { raw, digitCount: digits.length });
    return { to: null };
  }
  return null;
}

/** Uppercase-normalize an enum value AND constrain it to its column's CHECK vocabulary. In-set
 * values pass through; out-of-set/empty values become the column's fallback (null unless
 * ENUM_FALLBACK says otherwise). Prevents pg 23514/23502 from crashing an import row. */
function normalizeEnumConstrained(table, column, raw) {
  const coercion = enumCoercion(table, column, raw);
  if (coercion) return coercion.to;
  return normalizeEnumUpper(raw); // in-vocabulary (or empty → null)
}

export const DETAIL_TABLES = {
  CASE: 'fir_details', ARREST: 'arrest_details', PCR_CALL: 'pcr_call_details',
  MISSING: 'missing_details', UIDB: 'uidb_details',
};

export const PERSON_SUBTYPE_TABLES = ['arrestee_details', 'missing_person_details', 'person_descriptions'];
const PERSON_ROLES = ['COMPLAINANT', 'ACCUSED', 'VICTIM', 'WITNESS', 'ARRESTEE', 'MISSING', 'DECEASED', 'INFORMANT', 'CALLER', 'IO'];
// Roles that arrive as a repeater array (`persons[]`, one entry per participant) rather than
// flat `data` keys — matches DynamicForm.jsx's REPEATER_SECTION_META (ARRESTED/VICTIM/ACCUSED
// today; WITNESS has no UI yet but is schema-legal and routed the same way when it arrives).
export const REPEATER_ROLES = new Set(['ARRESTEE', 'VICTIM', 'ACCUSED', 'WITNESS']);
// Frontend person_type -> DB persons.role. Every other person_type value passes through
// unchanged (already matches a role name, e.g. 'VICTIM', 'ACCUSED').
const PERSON_TYPE_TO_ROLE = { ARRESTED: 'ARRESTEE' };
const ROLE_TO_PERSON_TYPE = { ARRESTEE: 'ARRESTED' };
export function roleForPersonType(personType) {
  return PERSON_TYPE_TO_ROLE[personType] || personType;
}

// slot -> {table: detailTableName, column} for record/detail-level (no person role) locations.
export const DETAIL_LOCATION_SLOTS = {
  occurrence: { CASE: 'occurrence_location_id', PCR_CALL: 'occurrence_location_id' },
  incident: { PCR_CALL: 'incident_location_id' },
  found: { UIDB: 'found_location_id' },
};
// slot -> {table, column} for person-owned locations (role is always present on these fields).
export const PERSON_LOCATION_SLOTS = {
  present: { table: 'persons', column: 'present_location_id' },
  permanent: { table: 'persons', column: 'perm_location_id' },
  arrest: { table: 'arrestee_details', column: 'arrest_location_id' },
  missing: { table: 'missing_person_details', column: 'missing_location_id' },
  found: { table: 'missing_person_details', column: 'found_location_id' },
};

// Most property FK columns (automobile_id, drug_type_id, ...) submit the numeric ref.* code
// directly from the interactive form (fields.service.js's GENERIC property-item dispatch,
// `value: <code>`), so coerceByType's integer branch parses them with no special-casing. The
// TWO category columns (major_category_id / minor_category_id) are the exception: the form still
// submits their numeric code, but BULK IMPORT submits the human LABEL from the frozen template's
// dropdown (like acts/sections/heads). Those two are deferred (DEFERRED_PROPERTY_FK_COLUMNS) and
// resolved async in splitProperties — numeric passes through, a label is looked up against ref.*.

let columnCache = null;
// Parallel cache of character_maximum_length for varchar/char columns (null for unbounded
// types). Loaded from the SAME information_schema query as columnCache so there's no extra
// round-trip; kept separate so columnCache stays a plain column→data_type string map (what
// coerceByType/decorateByType consume) rather than changing its shape everywhere.
let columnMaxLenCache = null;
/** information_schema introspection, cached for the process lifetime (mirrors
 * scripts/lib/sync-config-core.mjs's loadColumns — schema only changes via a migration +
 * restart, so a request-scoped or one-shot query would be wasted work). */
async function loadColumns(trx) {
  if (columnCache) return columnCache;
  const rows = await trx.raw(
    `SELECT table_name, column_name, data_type, character_maximum_length
       FROM information_schema.columns WHERE table_schema = 'public'`
  );
  const cols = {};
  const lens = {};
  for (const r of rows.rows) {
    (cols[r.table_name] ??= {})[r.column_name] = r.data_type;
    (lens[r.table_name] ??= {})[r.column_name] = r.character_maximum_length ?? null;
  }
  columnCache = cols;
  columnMaxLenCache = lens;
  log.debug('loadColumns: loaded and cached information_schema column types', { tableCount: Object.keys(cols).length });
  return cols;
}

/** Coerce a raw submitted value per the DESTINATION COLUMN'S ACTUAL pg type (read from
 * information_schema, never guessed from the field/column name) — the one place value-type
 * coercion happens, so a column's type is the single source of truth for how it's parsed. */
function coerceByType(dataType, raw) {
  if (raw === '' || raw === null || raw === undefined) return null;
  switch (dataType) {
    case 'date': return normalizeDate(raw);
    case 'timestamp with time zone':
    case 'timestamp without time zone': return normalizeDateTime(raw);
    case 'boolean': return toBool(raw);
    case 'integer':
    case 'smallint':
    case 'bigint': { const n = parseInt(raw, 10); return Number.isNaN(n) ? null : n; }
    case 'numeric':
    case 'double precision':
    case 'real': { const n = parseFloat(raw); return Number.isNaN(n) ? null : n; }
    case 'time without time zone':
    case 'time with time zone': return normalizeText(raw);
    default: return typeof raw === 'string' ? normalizeText(raw) : raw;
  }
}

/** 'DD/MM/YYYY HH:mm' | 'DD/MM/YYYY' | ISO -> ISO timestamp for a timestamptz column. */
function normalizeDateTime(raw) {
  const s = String(raw ?? '').trim();
  if (!s) return null;
  const [datePart, timePart] = s.split(/\s+/);
  const iso = normalizeDate(datePart);
  if (!iso) return null;
  if (timePart && /^\d{1,2}:\d{2}(:\d{2})?$/.test(timePart)) return `${iso}T${timePart.length === 5 ? timePart + ':00' : timePart}`;
  return `${iso}T00:00:00`;
}

// ── reverse direction: typed DB value -> the DD/MM/YYYY [HH:mm] string every frontend date
// component (DateInput, DateField, DateTimePickerPopup, utils/dateFormat.js's parseDMY) reads
// and writes exclusively. Without this, recomposeRecord was handing back raw ISO strings
// ('2026-07-15', '2026-10-15T00:00:00.000Z') — the frontend's `datePart.split('/')` parse
// silently failed on those (no '/' characters), so an edited record's date pickers looked
// empty/reset on load even though the value round-tripped correctly in the database itself.

/** pg returns `date`/`timestamptz` columns as JS Date objects (Knex/pg default) — UTC getters
 * are used deliberately, matching normalizeDateTime's insert side, which stores the DD/MM/YYYY
 * digits as entered with NO offset (Postgres then treats them as the session/DB timezone,
 * which is UTC in this stack) — reading back with UTC getters reproduces the exact digits the
 * officer typed, not a timezone-shifted date. */
function formatDateForFrontend(val) {
  if (val === null || val === undefined || val === '') return null;
  const d = val instanceof Date ? val : new Date(val);
  if (Number.isNaN(d.getTime())) return typeof val === 'string' ? val : null;
  const dd = String(d.getUTCDate()).padStart(2, '0');
  const mm = String(d.getUTCMonth() + 1).padStart(2, '0');
  return `${dd}/${mm}/${d.getUTCFullYear()}`;
}

function formatDateTimeForFrontend(val) {
  if (val === null || val === undefined || val === '') return null;
  const d = val instanceof Date ? val : new Date(val);
  if (Number.isNaN(d.getTime())) return typeof val === 'string' ? val : null;
  const dd = String(d.getUTCDate()).padStart(2, '0');
  const mm = String(d.getUTCMonth() + 1).padStart(2, '0');
  const hh = String(d.getUTCHours()).padStart(2, '0');
  const mi = String(d.getUTCMinutes()).padStart(2, '0');
  return `${dd}/${mm}/${d.getUTCFullYear()} ${hh}:${mi}`;
}

/** Format a raw DB value for the frontend per the DESTINATION COLUMN'S real pg type — the
 * read-side mirror of coerceByType. Non-date types pass through unchanged. */
function decorateByType(dataType, val) {
  if (val === null || val === undefined) return val;
  switch (dataType) {
    case 'date': return formatDateForFrontend(val);
    case 'timestamp with time zone':
    case 'timestamp without time zone': return formatDateTimeForFrontend(val);
    default: return val;
  }
}

/** Read-side inverse of records.normalize.js's `normalizeEnumUpper` (the write side), keyed by
 * table+column exactly like ENUM_UPPER_COLUMNS. The write path stores these enums in their
 * CHECK-constraint vocabulary — UPPERCASE ('MALE','FATHER','STOLEN') — but field_registry's
 * option `value`s (what the frontend's SearchableSelect matches, case-SENSITIVELY, and what
 * list/detail/export views render) are Title Case ('Male','Father','Stolen'). Without this
 * inverse, recomposeRecord handed back raw 'MALE'; SearchableSelect found no matching option and
 * displayed blank — the reported symptom for complainant/victim gender + relation_type + missing
 * gender + property status, on BOTH interactive and imported records. Every enum-upper option in
 * the vocabulary today is a single word, so Title Case is an exact inverse (the same single-word
 * assumption the write-side uppercasing already relies on). If a multi-word enum value is ever
 * added, promote this to an options-aware lookup rather than extending the string transform. */
function decorateEnumUpper(table, column, val) {
  if (typeof val !== 'string' || !val) return val;
  if (!ENUM_UPPER_COLUMNS[table]?.has(column)) return val;
  return val.charAt(0).toUpperCase() + val.slice(1).toLowerCase();
}

/** pg already auto-deserializes jsonb columns (arrays/objects arrive as real JS values, not
 * JSON-encoded strings) — this only needs to handle the one column that legitimately stores
 * a bare JSON string scalar (`field_registry.storage`, e.g. `"ui_only"`/`"extra"`), where
 * pg hands back the already-unwrapped JS string `'ui_only'`. Re-JSON.parse-ing that throws
 * (it's not valid JSON on its own) — on failure, the value IS the real string, not garbage,
 * so return it as-is; only return `fallback` when there was truly nothing to parse. */
function parseJson(val, fallback) {
  if (val === null || val === undefined) return fallback;
  if (typeof val !== 'string') return val;
  try { return JSON.parse(val); } catch { return val; }
}

/** Load every active field_registry row applicable to recordType, with storage/labels parsed. */
export async function loadRegistry(trx, recordType) {
  const rows = await trx('field_registry').where({ is_active: true });
  const filtered = rows
    .map((r) => ({
      ...r,
      record_types: parseJson(r.record_types, []),
      storage: parseJson(r.storage, null),
      labels: parseJson(r.labels, {}),
      options: parseJson(r.options, null),
      validation_rules: parseJson(r.validation_rules, null),
      show_when: parseJson(r.show_when, null),
    }))
    .filter((r) => r.record_types.includes(recordType));
  log.debug('loadRegistry: loaded active field_registry rows', { recordType, totalActive: rows.length, applicable: filtered.length });
  return filtered;
}

/** Resolve a `{per_type:{...}}` wrapper down to the shape for this record type (or null). */
export function resolveStorage(storage, recordType) {
  if (storage && storage.per_type) return storage.per_type[recordType] ?? null;
  return storage;
}

// ── flat (non-repeater, non-person, non-property, non-offence, non-location) fields ──────

/**
 * Split the flat `data` object into spine columns, detail-table columns/extra, and the
 * initial values of any tracked domain-status columns (for the CREATE path only — status
 * changes on UPDATE are diffed by the caller, which decides whether to write a
 * record_status_events row; a brand-new record's initial status is not itself an event,
 * per ruling 22).
 */
function splitFlatFields(registry, recordType, data) {
  log.debug('splitFlatFields: enter', { recordType, dataKeys: Object.keys(data).length });
  const spine = {};
  const detail = {};
  const detailExtra = {};
  const detailLocationFields = {}; // slot -> {column: value}
  const warnings = [];
  const detailTable = DETAIL_TABLES[recordType];

  // HANDOFF open item (e): both `status` and `case_status` map to fir_details.case_status
  // for CASE — case_status wins when both arrive (its config row is the more specific one).
  const caseStatusWinsOver = new Set(['status']);
  const seenDetailCols = new Set();

  for (const f of registry) {
    if (f.storage == null) continue;
    const shape = resolveStorage(f.storage, recordType);
    if (shape == null) continue; // per_type had no entry for this record type
    if (!(f.field_key in data)) continue;
    const raw = data[f.field_key];

    if (shape === 'ui_only') continue;
    if (shape === 'extra') {
      if (raw !== '' && raw !== null && raw !== undefined) detailExtra[f.field_key] = raw;
      continue;
    }
    if (typeof shape !== 'object') continue;

    if (shape.entity === 'location') {
      const slot = shape.slot;
      if (shape.role) continue; // person-owned location — handled in splitPersonEntry
      if (raw === '' || raw === null || raw === undefined) continue;
      (detailLocationFields[slot] ??= {})[shape.column] = normalizeLocationValue(shape.column, raw);
      continue;
    }
    if (shape.entity === 'offence' || shape.entity === 'person' || shape.entity === 'property') {
      continue; // handled by their own splitters
    }
    if (!shape.table) continue;

    const targetTable = shape.table === '$detail' ? detailTable : shape.table;
    if (targetTable === 'investigating_officers') continue; // free-text io_* display fields, retired in favor of io_id (Phase 2)
    if (targetTable === 'records') {
      spine[shape.column] = raw === '' ? null : raw;
      continue;
    }
    if (targetTable !== detailTable) continue; // field not applicable to this record's detail table

    if (seenDetailCols.has(shape.column) && caseStatusWinsOver.has(f.field_key)) {
      log.debug('splitFlatFields: skipped — a more specific field already won this detail column', { recordType, fieldKey: f.field_key, column: shape.column });
      continue;
    }
    detail[shape.column] = normalizeDetailValue(detailTable, shape.column, raw);
    seenDetailCols.add(shape.column);
  }

  log.debug('splitFlatFields: exit', {
    recordType, spineKeys: Object.keys(spine).length, detailKeys: Object.keys(detail).length,
    detailExtraKeys: Object.keys(detailExtra).length, detailLocationSlots: Object.keys(detailLocationFields).length,
  });
  return { spine, detail, detailExtra, detailLocationFields, warnings };
}

// Columns whose submitted value is a LABEL needing async ref.* resolution (resolveDetailFkLabels)
// rather than the column's own pg type (both are non-text-looking types — local_head_id is
// `int` — that would otherwise get destroyed by naive integer coercion before resolution runs).
const DEFERRED_FK_LABEL_COLUMNS = new Set(['beat_id', 'local_head_id']);

function normalizeDetailValue(table, column, raw) {
  if (DEFERRED_FK_LABEL_COLUMNS.has(column)) return raw;
  // fir_no exists on exactly fir_details/arrest_details/missing_details (verified against
  // information_schema) — canonicalize to "<seq>/<4-digit-year>" so linkResolver's and the
  // dup-check's exact-string matching works across entry formats, for BOTH the interactive
  // form and bulk import (both funnel through splitPayload). gd_no is a different column
  // and format — never normalized (G2: a GD ref must never look like a FIR).
  if (column === 'fir_no') return normalizeFirNo(raw);
  if (/mobile|phone/.test(column)) return normalizePhone(raw);
  return coerceByType(columnCache?.[table]?.[column], raw);
}

// Longest varchar location column is 500 (full_address); pincode is the narrowest at 10. Free
// text entered by officers (or a template placeholder/hint left un-replaced, e.g. the literal
// string "6-digit PIN code") routinely overshoots the narrow columns. Before the guard below, an
// over-length value threw `value too long for type character varying(N)` (pg 22001) mid-insert,
// failing the ENTIRE row with an opaque "system error" and no indication which field — the actual
// root cause of the reported "ARREST bulk import not working" (#1, 2026-07-20). P2 "reject only
// the impossible" + the import-reliability framework favour salvaging the row over crashing it.
function normalizeLocationValue(column, raw) {
  let val = coerceByType(columnCache?.locations?.[column], raw);
  if (val === null || val === undefined) return val;

  // pincode is digits-only by definition. Strip non-digits, then drop implausibly short results
  // (< PINCODE_MIN_DIGITS — no real pincode is that short; a stray digit from placeholder prose
  // like "6-digit PIN code" is not a pincode) to null rather than storing garbage. Genuine
  // pincodes (6-digit IN, longer foreign) are preserved. The salvage-to-null decision is shared
  // with import.validate.js via pincodeCoercion so the operator WARNING can't drift from this.
  if (column === 'pincode' && typeof val === 'string') {
    if (pincodeCoercion(val)) return null;
    val = val.replace(/\D/g, '');
  }

  // Last-line width guard: never let a location varchar overflow its column and take down the
  // whole row. Truncate to the column's real width (from information_schema) instead. Applies to
  // EVERY location varchar (pincode included, after the digit-normalize above), so no location
  // value can ever raise pg 22001 again.
  if (typeof val === 'string') {
    const maxLen = columnMaxLenCache?.locations?.[column];
    if (maxLen && val.length > maxLen) {
      log.warn('normalizeLocationValue: value truncated to column width', { column, maxLen, originalLength: val.length });
      val = val.slice(0, maxLen);
    }
  }
  return val;
}

/** Detail-table columns that hold a LABEL needing async ref.* resolution before insert.
 * `psId` (T3) scopes resolveBeat's bare-number fallback — only the write-path callers that
 * already know the record's target PS pass it; the resolver itself tolerates its absence. */
async function resolveDetailFkLabels(trx, recordType, detail, psId = null) {
  if ('beat_id' in detail) {
    const rawLabel = detail.beat_id;
    detail.beat_id = (await resolveBeat(trx, rawLabel, psId)).id;
    log.debug('resolveDetailFkLabels: resolved beat_id label', { recordType, rawLabel, resolvedId: detail.beat_id });
  }
  if ('local_head_id' in detail) {
    const rawLabel = detail.local_head_id;
    detail.local_head_id = (await resolveLocalHead(trx, rawLabel)).id;
    log.debug('resolveDetailFkLabels: resolved local_head_id label', { recordType, rawLabel, resolvedId: detail.local_head_id });
  }
  return detail;
}

// ── persons ────────────────────────────────────────────────────────────────────────────

function fieldsForRole(registry, recordType, role) {
  const person = [];
  const location = [];
  for (const f of registry) {
    if (f.storage == null) continue;
    const shape = resolveStorage(f.storage, recordType);
    if (shape == null || typeof shape !== 'object') continue;
    if (shape.entity === 'person' && shape.role === role) person.push({ field: f, shape });
    if (shape.entity === 'location' && shape.role === role) location.push({ field: f, shape });
  }
  return { person, location };
}

const NICK_NAME_COLUMN = 'nick_names';
const PERSONS_TABLE_COLUMNS = new Set([
  'name', 'relative_name', 'relation_type', 'gender', 'age', 'dob', 'mobile', 'qualification',
  'perm_same_as_present', 'relation_to_subject', 'sort_order',
]);

/** Build one person's {columns, extra, subtypes, locations} from a flat key/value source
 * (either the record's top-level `data`, for singleton roles, or one `persons[]` entry's own
 * `data`, for repeater roles). `subtypes` is a map of subtypeTable -> columns, NOT a single
 * table — a MISSING person writes both `missing_person_details` AND `person_descriptions`
 * (the shared physical-description subtype) at once, same for DECEASED + person_descriptions. */
async function splitPersonEntry(trx, personFields, locationFields, source) {
  log.debug('splitPersonEntry: enter', { personFieldCount: personFields.length, locationFieldCount: locationFields.length, sourceKeys: Object.keys(source).length });
  const columns = {};
  const extra = {};
  const subtypes = {}; // table -> {columns}
  const nameParts = {};
  const nickNames = new Set();

  for (const { field: f, shape } of personFields) {
    if (!(f.field_key in source)) continue;
    const raw = source[f.field_key];
    if (shape.extra) {
      if (raw !== '' && raw !== null && raw !== undefined) extra[f.field_key] = raw;
      continue;
    }
    if (shape.name_part) {
      if (raw !== '' && raw !== null && raw !== undefined) nameParts[shape.name_part] = normalizeText(raw);
      continue;
    }
    if (shape.column === NICK_NAME_COLUMN) {
      const entries = Array.isArray(raw) ? raw : String(raw ?? '').split(',');
      for (const n of entries) { const t = normalizeText(n); if (t) nickNames.add(t); }
      continue;
    }
    if (raw === '' || raw === null || raw === undefined) continue;

    if (PERSONS_TABLE_COLUMNS.has(shape.column)) {
      columns[shape.column] = normalizePersonValue('persons', shape.column, raw);
    } else {
      const subtypeTable = subtypeTableForColumn(shape.column);
      if (subtypeTable) (subtypes[subtypeTable] ??= {})[shape.column] = normalizePersonValue(subtypeTable, shape.column, raw);
    }
  }

  if (Object.keys(nameParts).length) {
    columns.name = [nameParts[1], nameParts[2], nameParts[3]].filter(Boolean).join(' ').trim() || null;
  }
  if (nickNames.size) columns.nick_names = JSON.stringify([...nickNames]);
  if (columns.dob && (columns.age === undefined || columns.age === null)) {
    columns.age = ageFromDob(columns.dob);
  }

  const locationsBySlot = {};
  for (const { field: f, shape } of locationFields) {
    if (!(f.field_key in source)) continue;
    const raw = source[f.field_key];
    if (raw === '' || raw === null || raw === undefined) continue;
    (locationsBySlot[shape.slot] ??= {})[shape.column] = normalizeLocationValue(shape.column, raw);
  }
  // "same as present" toggle wins — never create a permanent location row when set.
  if (columns.perm_same_as_present === true) {
    log.debug('splitPersonEntry: perm_same_as_present set — dropping permanent location block', {});
    delete locationsBySlot.permanent;
  }

  log.debug('splitPersonEntry: built entry', {
    columnCount: Object.keys(columns).length, extraCount: Object.keys(extra).length,
    subtypeTables: Object.keys(subtypes), locationSlots: Object.keys(locationsBySlot),
  });
  return { columns, extra, subtypes, locations: locationsBySlot };
}

function subtypeTableForColumn(column) {
  const ARRESTEE_COLS = new Set(['arrest_date', 'arrest_time', 'prev_involvement_count', 'prev_involvement', 'is_po', 'po_declared_court', 'po_case_reference', 'is_bc']);
  const MISSING_COLS = new Set(['missing_date', 'last_seen_place', 'found_date', 'mp_known', 'mental_state']);
  const DESC_COLS = new Set(['height', 'built', 'complexion', 'face', 'hair', 'beard', 'moustache', 'upper_dress_color', 'lower_dress_color', 'identification_marks', 'physical_description', 'age_range']);
  if (ARRESTEE_COLS.has(column)) return 'arrestee_details';
  if (MISSING_COLS.has(column)) return 'missing_person_details';
  if (DESC_COLS.has(column)) return 'person_descriptions';
  return null;
}

function normalizePersonValue(table, column, raw) {
  if (column === 'mobile') return normalizePhone(raw);
  if (ENUM_UPPER_COLUMNS.persons?.has(column)) return normalizeEnumConstrained('persons', column, raw);
  return coerceByType(columnCache?.[table]?.[column], raw);
}

function ageFromDob(dobIso) {
  const dob = new Date(dobIso);
  if (Number.isNaN(dob.getTime())) return null;
  const now = new Date();
  let age = now.getFullYear() - dob.getFullYear();
  const m = now.getMonth() - dob.getMonth();
  if (m < 0 || (m === 0 && now.getDate() < dob.getDate())) age--;
  return age;
}

/** Build all person entries for the record: singleton roles from flat `data`, repeater
 * roles from the `persons[]` array (person_type normalized to its DB role). */
async function splitPersons(trx, registry, recordType, data, personsInput) {
  log.debug('splitPersons: enter', { recordType, repeaterInputCount: (personsInput || []).length });
  const entries = [];
  const rolesPresent = new Set();
  for (const f of registry) {
    const shape = resolveStorage(f.storage, recordType);
    if (shape && typeof shape === 'object' && shape.entity === 'person' && shape.role) rolesPresent.add(shape.role);
    if (shape && typeof shape === 'object' && shape.entity === 'location' && shape.role) rolesPresent.add(shape.role);
  }

  for (const role of rolesPresent) {
    if (REPEATER_ROLES.has(role)) continue; // built from persons[] below
    const { person, location } = fieldsForRole(registry, recordType, role);
    if (!person.length && !location.length) continue;
    const hasAnyValue = [...person, ...location].some(({ field }) => data[field.field_key] !== undefined && data[field.field_key] !== '' && data[field.field_key] !== null);
    if (!hasAnyValue) {
      log.debug('splitPersons: skipped singleton role — no value present', { recordType, role });
      continue;
    }
    const built = await splitPersonEntry(trx, person, location, data);
    entries.push({ role, ...built, sourceKind: 'flat' });
    log.debug('splitPersons: built singleton entry', { recordType, role });
  }

  for (const [i, p] of (personsInput || []).entries()) {
    const role = PERSON_TYPE_TO_ROLE[p.person_type] || p.person_type;
    if (!PERSON_ROLES.includes(role)) {
      log.warn('splitPersons: skipped repeater entry — unrecognized role', { recordType, sourceIndex: i, personType: p.person_type });
      continue;
    }
    const { person, location } = fieldsForRole(registry, recordType, role);
    const built = await splitPersonEntry(trx, person, location, p.data || {});
    entries.push({ role, ...built, sourceKind: 'repeater', sourceIndex: i, existingId: p.id || null });
    log.debug('splitPersons: built repeater entry', { recordType, role, sourceIndex: i, existingId: p.id || null });
  }

  log.debug('splitPersons: exit', { recordType, entryCount: entries.length });
  return entries;
}

// ── properties ─────────────────────────────────────────────────────────────────────────

// record_properties FK columns that may arrive as a LABEL (bulk import) rather than the numeric
// ref code the interactive form submits — deferred past coerceByType (which would int-coerce a
// label to null and drop it) and resolved async against ref.* in splitProperties. Mirrors the
// detail-table DEFERRED_FK_LABEL_COLUMNS pattern.
const DEFERRED_PROPERTY_FK_COLUMNS = new Set(['major_category_id', 'minor_category_id']);

function normalizePropertyValue(column, raw) {
  if (DEFERRED_PROPERTY_FK_COLUMNS.has(column)) return raw;
  if (ENUM_UPPER_COLUMNS.record_properties?.has(column)) return normalizeEnumConstrained('record_properties', column, raw);
  return coerceByType(columnCache?.record_properties?.[column], raw);
}

/** Resolve the deferred property FK label columns on a built entry's `columns` to their numeric
 * ref codes (async — needs trx). Numeric codes (form) pass through; labels (import) are looked
 * up. A value that resolves to null is deleted so the row omits the column entirely rather than
 * writing a bogus 0/null over the FK. */
async function resolvePropertyFkColumns(trx, columns) {
  if ('major_category_id' in columns) {
    const rawLabel = columns.major_category_id;
    const id = await resolvePropertyMajorCategory(trx, rawLabel);
    if (id == null) { delete columns.major_category_id; log.debug('resolvePropertyFkColumns: major_category_id unresolved, column dropped', { rawLabel }); }
    else { columns.major_category_id = id; log.debug('resolvePropertyFkColumns: resolved major_category_id', { rawLabel, resolvedId: id }); }
  }
  if ('minor_category_id' in columns) {
    const rawLabel = columns.minor_category_id;
    const id = await resolvePropertyMinorCategory(trx, rawLabel);
    if (id == null) { delete columns.minor_category_id; log.debug('resolvePropertyFkColumns: minor_category_id unresolved, column dropped', { rawLabel }); }
    else { columns.minor_category_id = id; log.debug('resolvePropertyFkColumns: resolved minor_category_id', { rawLabel, resolvedId: id }); }
  }
}

function splitPropertyEntry(propertyFields, source) {
  const columns = {};
  const extra = {};
  for (const { field: f, shape } of propertyFields) {
    if (!(f.field_key in source)) continue;
    const raw = source[f.field_key];
    if (shape.extra) {
      if (raw !== '' && raw !== null && raw !== undefined) extra[f.field_key] = raw;
      continue;
    }
    const val = normalizePropertyValue(shape.column, raw);
    if (val === null) continue;
    // property_stolen_recovered / phone_status both target `status` — first non-empty wins,
    // don't let a later empty overwrite an already-set value (handled by the null-skip above).
    if (columns[shape.column] === undefined) columns[shape.column] = val;
  }
  log.debug('splitPropertyEntry: built entry', { columnCount: Object.keys(columns).length, extraCount: Object.keys(extra).length });
  return { columns, extra };
}

function propertyFieldsList(registry, recordType) {
  const scalar = [];
  const grouped = {};
  for (const f of registry) {
    const shape = resolveStorage(f.storage, recordType);
    if (!shape || typeof shape !== 'object' || shape.entity !== 'property') continue;
    if (shape.group) (grouped[shape.group] ??= []).push({ field: f, shape });
    else scalar.push({ field: f, shape });
  }
  return { scalar, grouped };
}

async function splitProperties(trx, registry, recordType, data, propertiesInput) {
  log.debug('splitProperties: enter', { recordType, propertiesInputCount: (propertiesInput || []).length });
  const { scalar, grouped } = propertyFieldsList(registry, recordType);
  const entries = [];

  for (const [i, p] of (propertiesInput || []).entries()) {
    const built = splitPropertyEntry(scalar, p);
    await resolvePropertyFkColumns(trx, built.columns);
    if (!Object.keys(built.columns).length && !Object.keys(built.extra).length) {
      log.debug('splitProperties: skipped repeater entry — no columns/extra built', { recordType, sourceIndex: i });
      continue;
    }
    entries.push({ ...built, personIndex: Number.isInteger(p.person_index) ? p.person_index : null, existingId: p.id || null });
  }

  // Grouped flat blocks (e.g. CASE's vehicle_* fields) collapse into ONE synthetic property
  // entry each, sourced from the record's top-level `data`.
  for (const [group, fields] of Object.entries(grouped)) {
    const built = splitPropertyEntry(fields, data);
    await resolvePropertyFkColumns(trx, built.columns);
    if (!Object.keys(built.columns).length) {
      log.debug('splitProperties: skipped grouped block — blank starter block', { recordType, group });
      continue; // skip blank starter blocks
    }
    entries.push({ ...built, personIndex: null, existingId: null, group });
    log.debug('splitProperties: built grouped entry', { recordType, group });
  }

  log.debug('splitProperties: exit', { recordType, entryCount: entries.length });
  return entries;
}

// ── offences (record_offences: one row per section citation) ─────────────────────────────

/** Zip parallel comma-joined act/section strings, pairing each with the i-th major/minor
 * head pair — mirrors ActsSectionsTable.jsx's own row model. Acts DO run parallel to sections
 * (the frontend fills acts 1:1 with sections, each citation has an act), so acts fall back to
 * acts[0]. Major/minor heads are an INDEPENDENT list in the UI (their own majorMinorRows table,
 * unrelated to the section count) — they must NOT be last-filled to match the section count, or
 * a record with 3 sections + 1 head round-trips as `major_heads="X, X, X"`, and the frontend
 * re-seeds three identical head rows (reported 2026-07-21 as heads "repeated redundantly on
 * submit"). Rows past the head count get null heads; recompose's joinNonEmpty drops them, so the
 * head list round-trips at exactly its entered length. Row count stays section-driven (n) — the
 * heads>sections overflow (majors[i>=n] unstored) is pre-existing and needs schema work, not a
 * zip tweak. */
/** Re-merge comma-split act-name fragments back into whole registry labels (B5, 2026-07-21 —
 * "when i add aadhaar act, benefits and services also gets added"). `act_name` is stored/
 * transported comma-joined (see zipOffenceStrings above) — an act label that itself CONTAINS a
 * comma (e.g. 'Aadhaar (Targeted Delivery of Financial and Other Subsidies, Benefits and
 * Services) Act, 2016') gets shattered into extra fragments by the naive split, each of which
 * then resolves as its own free-text "act" (a phantom record_offences row) and desyncs the
 * acts[i]<->sections[i] pairing for every citation after it.
 *
 * LONGEST match, not first/shortest match: for every starting fragment, scan every possible
 * window (fragment[i..j]) and keep the LONGEST one that equals a known act label, then consume
 * it whole. Shortest-match was tried first and rejected — `ACT_GROUP_CODES`'s alias names
 * ('Arms Act', 'Delhi Excise Act') are THEMSELVES also in the known-label set (so `resolveAct`
 * can match a plain alias with no comma), but they also happen to be an exact PREFIX of their
 * own act_long ('ARMS ACT, 1959', 'DELHI EXCISE ACT, 2009'/'...2010' — verified live against
 * ref.acts) — a shortest-match would stop at the alias and strand the trailing year as its own
 * phantom act, the very bug this is fixing, for two real acts. Longest-match keeps extending
 * past 'Arms Act' to the full 'Arms Act, 1959' once that longer window also matches, so a plain
 * act with no commas ('IPC') still emits immediately (nothing longer to find) while an
 * alias-prefixed one is preserved whole. A window that never matches at any width is emitted as
 * its own single fragment (conservative — doesn't guess-merge two unrelated unknown acts).
 * Sections/major/minor heads are NOT re-merged — their ref.* label columns are short codes/
 * names that don't contain commas (verified against ref.sections/ref.major_heads/ref.minor_heads
 * seed data), so this only ever needs to run on the act axis. Mirrors ActsSectionsTable.jsx's
 * own re-merge (frontend fix, same bug — frontend additionally needs a year-rejoin pre-pass,
 * see its own doc comment, because its acts registry collapses grouped acts to the alias only
 * and never exposes the year-suffixed act_long the way this module's `loadKnownActLabels` does). */
function reMergeKnownActFragments(fragments, knownLabelsLower) {
  if (!knownLabelsLower || !knownLabelsLower.size) return fragments;
  const merged = [];
  let i = 0;
  const n = fragments.length;
  while (i < n) {
    let bestEnd = -1;
    let buffer = '';
    for (let j = i; j < n; j++) {
      buffer = buffer ? `${buffer}, ${fragments[j]}` : fragments[j];
      if (knownLabelsLower.has(buffer.trim().toLowerCase())) bestEnd = j + 1;
    }
    if (bestEnd === -1) {
      merged.push(fragments[i]);
      i += 1;
    } else {
      merged.push(fragments.slice(i, bestEnd).join(', '));
      i = bestEnd;
    }
  }
  return merged;
}

function zipOffenceStrings(actNameStr, sectionsStr, majorHeadsStr, minorHeadsStr, knownActLabels) {
  const rawActs = String(actNameStr || '').split(',').map((s) => s.trim()).filter(Boolean);
  const acts = reMergeKnownActFragments(rawActs, knownActLabels);
  const sections = String(sectionsStr || '').split(',').map((s) => s.trim()).filter(Boolean);
  const majors = String(majorHeadsStr || '').split(',').map((s) => s.trim()).filter(Boolean);
  const minors = String(minorHeadsStr || '').split(',').map((s) => s.trim()).filter(Boolean);
  const n = Math.max(acts.length, sections.length);
  const rows = [];
  for (let i = 0; i < n; i++) {
    rows.push({
      act: acts[i] ?? acts[0] ?? null,
      section: sections[i] ?? null,
      major: majors[i] ?? null,
      minor: minors[i] ?? null,
    });
  }
  return rows;
}

/**
 * Build `record_offences` rows. Prefers the explicit `offences[]` array (new contract); when
 * absent, falls back to parsing the comma-joined `act_name`/`sections`/`major_heads`/
 * `minor_heads` strings from `data` (old client / ActsSectionsTable's own state shape) with
 * the same zip rule — one code path builds rows either way.
 *
 * ARREST's `crime_head` field (storage {entity:'offence', column:'major_head_id', primary:
 * true}) is the record's single-head classification picker, separate from the multi-act
 * section pickers. When present, it selects (or overrides) which built row is `is_primary`
 * — matched by major_head_id when one of the built rows already carries it, otherwise it
 * overrides the first row's major_head_id (a row with no act/section is otherwise
 * CHECK-illegal: `act_id NOT NULL OR other_act_name NOT NULL`). Documented judgment call —
 * the schema doesn't prescribe how crime_head relates to the multi-act rows.
 */
export async function buildOffenceRows(trx, recordType, data, offencesInput) {
  log.debug('buildOffenceRows: enter', { recordType, offencesInputCount: Array.isArray(offencesInput) ? offencesInput.length : 0 });
  let rows;
  if (Array.isArray(offencesInput) && offencesInput.length) {
    rows = offencesInput.map((o) => ({ act: o.act, section: o.section, major: o.major_head, minor: o.minor_head }));
    log.debug('buildOffenceRows: sourced rows from explicit offences[] array', { recordType, rowCount: rows.length });
  } else {
    const knownActLabels = await loadKnownActLabels(trx);
    rows = zipOffenceStrings(data.act_name, data.sections, data.major_heads, data.minor_heads, knownActLabels);
    log.debug('buildOffenceRows: sourced rows from zipped act/section/head strings', { recordType, rowCount: rows.length });
  }

  const built = [];
  for (const r of rows) {
    if (!r.act && !r.section) continue;
    let { actId, actCds, otherActName } = await resolveAct(trx, r.act);
    let sectionId = null;
    if (r.section) {
      const resolved = await resolveSection(trx, r.section, actCds);
      sectionId = resolved.sectionId;
      // A group alias (e.g. 'IPC' -> several act_cds) has no single actId of its own —
      // the matched section's own act_sec_cd is the definitive act for THIS citation.
      if (actId == null && resolved.actCd != null) actId = resolved.actCd;
    }
    // record_offences CHECK: act_id NOT NULL OR other_act_name NOT NULL. A group alias with
    // no section match (or no section at all) still has neither — fall back to storing the
    // as-entered act label itself so the row is legal (honest, not a real ref.acts row).
    if (actId == null && !otherActName) otherActName = r.act || null;
    if (actId == null && !otherActName) {
      log.debug('buildOffenceRows: skipped row — no act/section could be resolved', { recordType, act: r.act, section: r.section });
      continue; // truly nothing to build a row from
    }
    const majorHeadId = r.major ? (await resolveMajorHead(trx, r.major)).id : null;
    const minorHeadId = r.minor ? (await resolveMinorHead(trx, r.minor, majorHeadId)).id : null;
    built.push({
      act_id: actId, other_act_name: otherActName, section_id: sectionId,
      major_head_id: majorHeadId, minor_head_id: minorHeadId,
      is_primary: false, sort_order: built.length,
    });
    log.debug('buildOffenceRows: built offence row', { recordType, act: r.act, section: r.section, actId, otherActName, sectionId, majorHeadId, minorHeadId });
  }
  if (built.length) built[0].is_primary = true;

  const crimeHeadLabel = recordType === 'ARREST' ? data.crime_head : null;
  if (crimeHeadLabel) {
    const { id: crimeHeadMajorId } = await resolveMajorHead(trx, crimeHeadLabel);
    if (crimeHeadMajorId) {
      const match = built.find((row) => row.major_head_id === crimeHeadMajorId);
      if (match) {
        built.forEach((row) => { row.is_primary = false; });
        match.is_primary = true;
        log.debug('buildOffenceRows: crime_head selected an existing row as primary', { recordType, crimeHeadLabel, majorHeadId: crimeHeadMajorId });
      } else if (built.length) {
        built[0].major_head_id = crimeHeadMajorId;
        log.debug('buildOffenceRows: crime_head overrode first row major_head_id', { recordType, crimeHeadLabel, majorHeadId: crimeHeadMajorId });
      }
    } else {
      log.debug('buildOffenceRows: crime_head label did not resolve to a major head', { recordType, crimeHeadLabel });
    }
  }

  log.debug('buildOffenceRows: exit', { recordType, builtCount: built.length });
  return built;
}

// ── top-level split/recompose ─────────────────────────────────────────────────────────

/**
 * Split a create/update payload into the per-table row data records.service.js needs to
 * write, in this shape:
 *   { spine, detail, detailExtra, detailLocationFields, personEntries, propertyEntries,
 *     offenceRows }
 * No DB writes happen here — records.service.js owns the transaction and insert order.
 * `psId` (T3, optional) scopes resolveBeat's bare-number fallback to the record's actual PS —
 * callers pass the scope they already know (`user.ps_id` / `scope.ps_id` / `record.ps_id`).
 */
export async function splitPayload(trx, registry, recordType, { data = {}, persons = [], properties = [], offences = [] }, psId = null) {
  log.debug('splitPayload: enter', {
    recordType, psId, dataKeys: Object.keys(data).length,
    personsInputCount: persons.length, propertiesInputCount: properties.length, offencesInputCount: offences.length,
  });
  await loadColumns(trx); // warms the cache; not otherwise consumed here today
  const { spine, detail, detailExtra, detailLocationFields } = splitFlatFields(registry, recordType, data);
  await resolveDetailFkLabels(trx, recordType, detail, psId);

  const personEntries = await splitPersons(trx, registry, recordType, data, persons);
  const propertyEntries = await splitProperties(trx, registry, recordType, data, properties);
  const offenceRows = await buildOffenceRows(trx, recordType, data, offences);

  log.debug('splitPayload: exit', {
    recordType, personEntries: personEntries.length, propertyEntries: propertyEntries.length, offenceRows: offenceRows.length,
  });
  return { spine, detail, detailExtra, detailLocationFields, personEntries, propertyEntries, offenceRows };
}

// ── recompose (typed rows -> flat data/persons/properties/offences, the inverse) ─────────

function joinNonEmpty(list, sep = ', ') {
  return list.filter((v) => v !== null && v !== undefined && v !== '').join(sep);
}

/** Rebuild the flat `data` object's location-block keys for a given field list + one
 * locations row, honoring each field's slot/role/prefix via its field_key convention
 * (the field_key itself IS the prefixed key, e.g. `occurrence_house_no`). */
function recomposeLocationFields(locationFields, slot, role, locationRow, into) {
  if (!locationRow) return;
  for (const { field: f, shape } of locationFields) {
    if (shape.slot !== slot || (shape.role || null) !== (role || null)) continue;
    const val = locationRow[shape.column];
    if (val !== null && val !== undefined) into[f.field_key] = val;
  }
}

/**
 * Inverse of splitPayload — rebuilds `{data, persons, properties, offences}` from the typed
 * rows `getRecordDetails` fetches, so DynamicForm's `initialData` prefill and RecordDetail's
 * display keep working unchanged. `trx` is used once, up front, to (idempotently) load the
 * same information_schema column-type cache splitPayload uses — needed so date/timestamptz
 * columns can be formatted back to DD/MM/YYYY[ HH:mm] before reaching the frontend.
 */
export async function recomposeRecord(trx, registry, recordType, {
  spineRow, detailRow, personRows = [], propertyRows = [], offenceRows = [], locationsById = {},
}) {
  log.debug('recomposeRecord: enter', {
    recordType, recordId: spineRow?.id, personRowCount: personRows.length,
    propertyRowCount: propertyRows.length, offenceRowCount: offenceRows.length,
  });
  const cols = await loadColumns(trx);
  const data = {};
  const detailTable = DETAIL_TABLES[recordType];

  // flat scalar / per_type / extra / location(no-role) fields
  const allLocationFields = [];
  for (const f of registry) {
    const shape = resolveStorage(f.storage, recordType);
    if (shape == null) continue;
    if (shape === 'ui_only') continue;
    if (shape === 'extra') {
      const bag = detailRow?.extra || {};
      if (f.field_key in bag) data[f.field_key] = bag[f.field_key];
      continue;
    }
    if (typeof shape !== 'object') continue;
    if (shape.entity === 'location') { allLocationFields.push({ field: f, shape }); continue; }
    if (shape.entity === 'person' || shape.entity === 'property' || shape.entity === 'offence') continue;
    if (!shape.table) continue;
    const targetTable = shape.table === '$detail' ? detailTable : shape.table;
    if (targetTable === 'investigating_officers') continue;
    const source = targetTable === 'records' ? spineRow : (targetTable === detailTable ? detailRow : null);
    if (!source) continue;
    if (shape.column in source && source[shape.column] !== undefined) {
      data[f.field_key] = decorateByType(cols[targetTable]?.[shape.column], source[shape.column]);
    }
  }

  // detail-level (no-role) locations
  const detailLocFields = allLocationFields.filter(({ shape }) => !shape.role);
  const detailSlots = DETAIL_LOCATION_SLOTS;
  for (const slot of Object.keys(DETAIL_LOCATION_SLOTS)) {
    const col = detailSlots[slot][recordType];
    if (!col || !detailRow) continue;
    const locId = detailRow[col];
    if (!locId) continue;
    recomposeLocationFields(detailLocFields, slot, null, locationsById[locId], data);
  }

  // offence display strings — comma-joined labels, rebuilt from record_offences via ref joins
  // (ref labels are attached onto each offenceRow by the caller — see getRecordDetails).
  if (offenceRows.length) {
    data.act_name = joinNonEmpty(offenceRows.map((o) => o.act_label));
    data.sections = joinNonEmpty(offenceRows.map((o) => o.section_label));
    data.major_heads = joinNonEmpty(offenceRows.map((o) => o.major_head_label));
    data.minor_heads = joinNonEmpty(offenceRows.map((o) => o.minor_head_label));
    const primary = offenceRows.find((o) => o.is_primary);
    if (primary?.major_head_label && recordType === 'ARREST') data.crime_head = primary.major_head_label;
  }
  if (detailRow?.local_head_id_label) data.local_head = detailRow.local_head_id_label;
  if (detailRow?.beat_id_label) data.beat_no = detailRow.beat_id_label;

  // #7a (2026-07-20): Heinous Offence is DERIVED read-only from the record's local-head
  // classification (ref.local_heads.crime_category = 'HEINOUS' | 'OTHER'), attached onto
  // detailRow by the caller (enrichDetailLabels). The `heinous_offence` field is storage:ui_only
  // (never written), so this recompose is its only source. Left BLANK when no classification is
  // set (local_head_id null) rather than asserting 'No' — absence ≠ non-heinous. Applies wherever
  // a local_head exists (CASE/ARREST today; UIDB while its local_head_id is populated).
  if (detailRow?.local_head_crime_category) {
    data.heinous_offence = detailRow.local_head_crime_category === 'HEINOUS' ? 'Yes' : 'No';
  }

  // persons: singleton roles flatten into `data`; repeater roles build the `persons[]` array
  const persons = [];
  for (const p of personRows) {
    const { person: personFields, location: locationFields } = fieldsForRole(registry, recordType, p.role);
    const target = REPEATER_ROLES.has(p.role) ? {} : data;
    recomposePersonFields(personFields, p, target, cols);
    for (const slotKey of Object.keys(PERSON_LOCATION_SLOTS)) {
      const { table, column } = PERSON_LOCATION_SLOTS[slotKey];
      const ownerRow = table === 'persons' ? p : p.subtypes?.[table];
      const locId = ownerRow?.[column];
      if (!locId) continue;
      recomposeLocationFields(locationFields, slotKey, p.role, locationsById[locId], target);
    }
    if (REPEATER_ROLES.has(p.role)) {
      persons.push({ id: p.id, person_type: ROLE_TO_PERSON_TYPE[p.role] || p.role, data: target });
    }
  }

  const properties = propertyRows.map((pr) => recomposePropertyRow(registry, recordType, pr));

  log.debug('recomposeRecord: exit', {
    recordType, recordId: spineRow?.id, dataKeys: Object.keys(data).length,
    personCount: persons.length, propertyCount: properties.length,
  });
  return { data, persons, properties };
}

function recomposePersonFields(personFields, personRow, into, cols) {
  if (personRow.name) {
    const parts = personRow.name.split(' ').filter(Boolean);
    const nameFieldsSorted = personFields.filter(({ shape }) => shape.name_part).sort((a, b) => a.shape.name_part - b.shape.name_part);
    const n = nameFieldsSorted.length;
    if (n === 1) {
      into[nameFieldsSorted[0].field.field_key] = parts.join(' ');
    } else if (n > 1) {
      // First token -> first field, last token -> last field (never blank just because there
      // are only 2 tokens — "Rakesh Sharma" must land in first+last, not first+middle), any
      // remaining middle tokens fill the fields in between.
      const first = parts[0] || '';
      const last = parts.length > 1 ? parts[parts.length - 1] : '';
      const middleTokens = parts.length > 2 ? parts.slice(1, -1) : [];
      nameFieldsSorted.forEach(({ field }, i) => {
        if (i === 0) into[field.field_key] = first;
        else if (i === n - 1) into[field.field_key] = last;
        else into[field.field_key] = middleTokens[i - 1] || '';
      });
    }
  }
  for (const { field: f, shape } of personFields) {
    if (shape.name_part) continue;
    if (shape.extra) {
      const bag = personRow.extra || {};
      if (f.field_key in bag) into[f.field_key] = bag[f.field_key];
      continue;
    }
    if (shape.column === NICK_NAME_COLUMN) {
      into[f.field_key] = Array.isArray(personRow.nick_names) ? personRow.nick_names : [];
      continue;
    }
    const subtypeTable = subtypeTableForColumn(shape.column);
    const source = subtypeTable && personRow.subtypes?.[subtypeTable] ? personRow.subtypes[subtypeTable] : personRow;
    const sourceTableName = subtypeTable && personRow.subtypes?.[subtypeTable] ? subtypeTable : 'persons';
    if (source && shape.column in source && source[shape.column] !== undefined && source[shape.column] !== null) {
      const typed = decorateByType(cols?.[sourceTableName]?.[shape.column], source[shape.column]);
      into[f.field_key] = decorateEnumUpper(sourceTableName, shape.column, typed);
    }
  }
}

function recomposePropertyRow(registry, recordType, propertyRow) {
  const { scalar, grouped } = propertyFieldsList(registry, recordType);
  // `person_id` is how the frontend re-links an arrested person's per-person property list
  // when a draft is reopened (persons[] entries carry their `id`); without it every reopened
  // ARREST draft showed the arrestee's properties as record-level orphans and re-saving
  // delete-and-reinserted them, destroying `record_status_events.property_id` history.
  const flat = { id: propertyRow.id, person_id: propertyRow.person_id ?? null, person_index: propertyRow.person_index ?? null };
  for (const { field: f, shape } of scalar) {
    if (shape.extra) {
      const bag = propertyRow.extra || {};
      if (f.field_key in bag) flat[f.field_key] = bag[f.field_key];
      continue;
    }
    if (shape.column in propertyRow && propertyRow[shape.column] !== null && propertyRow[shape.column] !== undefined) {
      flat[f.field_key] = decorateEnumUpper('record_properties', shape.column, propertyRow[shape.column]);
    }
  }
  for (const fields of Object.values(grouped)) {
    for (const { field: f, shape } of fields) {
      if (propertyRow[shape.column] !== null && propertyRow[shape.column] !== undefined) flat[f.field_key] = propertyRow[shape.column];
    }
  }
  return flat;
}
