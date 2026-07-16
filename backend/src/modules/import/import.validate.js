// Validation for the bulk-import module (Integration 3, WP4). Two layers, matching what's
// actually knowable at each stage:
//   1. Row-level (per sheet, before composing): required fields, show_when visibility,
//      parent-key existence, duplicate-in-sheet — the KEEP-list logic from the old controller
//      (isRequired/evaluateShowWhen/validateSheetRows), unchanged in substance, now emitting
//      the new {code, severity} taxonomy instead of a flat error list.
//   2. Composed-level (per parent, after import.compose.js has built the C1 payload):
//      ref-label dry-runs (act/section/major/minor/local head/beat — using the SAME
//      records.normalize.js resolvers the write path uses, so a validate-time PASS means a
//      confirm-time PASS), record-date presence, PS/district sanity cross-check, duplicate-in-
//      DB, and an advisory submit-requirements check.
//
// Legacy leniency (D3, docs/new-db-integration/03-import.md C6): unresolved ref labels are
// ERROR for non-legacy imports, WARNING (+ raw value preserved) for legacy ones. Everything
// else (required, parent-key, dup-in-sheet, dup-in-DB, PS-mismatch, record-date) is ERROR in
// both modes — those aren't data-quality judgment calls, they're structural.
import {
  resolveAct, resolveSection, resolveMajorHead, resolveMinorHead, resolveLocalHead, resolveBeat,
} from '../records/records.normalize.js';
import { validateRequiredFields } from '../records/records.service.js';
import { canonKey } from './import.parse.js';
import { composeRecordPayload, sourceRefFor } from './import.compose.js';

// ── row-level (moved from import.controller.js, unchanged logic) ───────────────────────────

export const isRequired = (field) => {
  if (!field.validation_rules) return false;
  try {
    const rules = typeof field.validation_rules === 'string'
      ? JSON.parse(field.validation_rules)
      : field.validation_rules;
    return !!rules.required;
  } catch (e) {
    return false;
  }
};

export const evaluateShowWhen = (showWhen, rowData) => {
  if (!showWhen) return true;
  let parsed = showWhen;
  if (typeof showWhen === 'string') {
    try {
      parsed = JSON.parse(showWhen);
    } catch (e) {
      return true;
    }
  }
  if (!parsed || !parsed.field) return true;

  const triggerField = parsed.field;
  const triggerVal = rowData[triggerField];
  if (triggerVal === undefined || triggerVal === null || triggerVal === '') {
    return false;
  }

  const expectedVal = parsed.value;
  if (Array.isArray(expectedVal)) {
    return expectedVal.includes(triggerVal);
  }
  return expectedVal === triggerVal;
};

/** Required + parent-key-existence check for one sheet's parsed rows. `parentIndex`/
 * `parentKeyField` are omitted for the parent sheet itself (nothing to check against). */
export function validateRowFields(rows, fieldsList, sheetName, parentIndex = null, parentKeyField = null) {
  const errors = [];
  for (const { rowData, rowIdx } of rows) {
    if (parentIndex && parentKeyField) {
      const parentVal = rowData[parentKeyField];
      if (!parentVal || parentIndex.resolve(parentVal) === null) {
        errors.push({
          row: rowIdx, field_key: parentKeyField, code: 'PARENT_KEY_MISSING', severity: 'ERROR',
          message: `Reference '${parentVal || ''}' in sheet '${sheetName}' does not exist in the parent sheet.`,
        });
      }
    }
    for (const field of fieldsList) {
      const key = field.field_key;
      const val = rowData[key];
      if (field.show_when && !evaluateShowWhen(field.show_when, rowData)) continue;
      const required = field.required === true || isRequired(field);
      if (required && (val === null || val === undefined || val === '')) {
        errors.push({
          row: rowIdx, field_key: key, code: 'REQUIRED_MISSING', severity: 'ERROR',
          message: `"${field.label_en}" is required in sheet "${sheetName}".`,
        });
      }
    }
  }
  return errors;
}

/** Duplicate-in-sheet check by a row's own natural key (not the parent key — used for the
 * parent sheet itself, e.g. two rows both claiming FIR "104/2026"). `keyOf` extracts the
 * dedup key from a row's rowData; rows with no key are skipped (already flagged elsewhere). */
export function checkDuplicatesInSheet(rows, keyOf, sheetName, codeLabel) {
  const errors = [];
  const seen = new Set();
  for (const { rowData, rowIdx } of rows) {
    const key = keyOf(rowData);
    if (!key) continue;
    const canon = canonKey(key);
    if (seen.has(canon)) {
      errors.push({
        row: rowIdx, field_key: null, code: 'DUPLICATE_IN_SHEET', severity: 'ERROR',
        message: `Duplicate ${codeLabel} "${key}" found in sheet "${sheetName}".`,
      });
    } else {
      seen.add(canon);
    }
  }
  return errors;
}

// ── composed-level ──────────────────────────────────────────────────────────────────────

/**
 * Dry-run every ref.* label in a composed payload's offences[] + flat local_head/beat_no,
 * using the exact same resolvers records.mapper.js's buildOffenceRows/resolveDetailFkLabels
 * will call at write time — a PASS here is a guarantee, not a guess. Resolvers are cheap and
 * memoized inside records.normalize.js itself (per-process act/section cache), so no extra
 * memoization needed here.
 *
 * DUAL-PURPOSE, deliberately: as a side effect, when `isLegacy` and local_head/beat_no fail to
 * resolve, this MUTATES `payload.data` to also set `local_head_raw`/`beat_raw` (the sibling
 * `storage:"extra"` fields added Integration 3 WP4) so the historical file's raw text survives
 * on the record itself — those two ref types have no schema fallback column of their own
 * (unlike act's `other_act_name`), so this is the only place the raw value can be captured.
 * WP5's confirm handler MUST call this function again (not just validate) immediately before
 * calling createImportedRecord, on its OWN freshly-recomposed payload (AD7 — confirm never
 * trusts a validate-time in-memory object across the HTTP boundary) — otherwise the mutation
 * never reaches the write path and local_head_raw/beat_raw stay empty even though validate
 * correctly detected and reported the WARNING. Confirm can discard the returned `errors` array
 * (already persisted at validate time); it only needs the mutation side effect.
 */
async function validateRefLabels(trx, recordType, payload, isLegacy) {
  const errors = [];
  const severity = isLegacy ? 'WARNING' : 'ERROR';
  const row = payload.rowIdx;

  // Mirrors records.mapper.js's buildOffenceRows exactly (actCds scoping, actId inferred from
  // a matched section when the act itself was a group alias, minor head scoped by major) — a
  // dry-run using different resolution logic than the write path would be worse than useless.
  for (const o of payload.offences) {
    if (!o.act && !o.section) continue;
    let { actId, actCds, otherActName } = await resolveAct(trx, o.act);
    if (actId == null && otherActName) {
      // Not an error — the schema explicitly sanctions free-text acts via other_act_name
      // (same as the interactive form). Informational only, both modes.
      errors.push({ row, field_key: 'act', code: 'ACT_UNKNOWN', severity: 'WARNING', message: `Act "${o.act}" is not in the acts list — will be stored as free text.` });
    }
    if (o.section) {
      const resolved = await resolveSection(trx, o.section, actCds);
      if (!resolved.sectionId) {
        errors.push({ row, field_key: 'sections', code: 'REF_UNRESOLVED_SECTION', severity, message: `Section "${o.section}" (act "${o.act || ''}") could not be matched to a known section.` });
      } else if (actId == null && resolved.actCd != null) {
        actId = resolved.actCd; // group alias resolved down to a specific act via its section
      }
    }
    if (actId == null && !otherActName) {
      // Neither resolved — record_offences' CHECK (act_id NOT NULL OR other_act_name NOT
      // NULL) would fail at write time with nothing to fall back on. Only reachable when a
      // row has a section but no act text at all.
      errors.push({ row, field_key: 'act', code: 'REF_UNRESOLVED_SECTION', severity, message: `Section "${o.section}" has no associated act to resolve against.` });
    }
    const majorHeadId = o.major_head ? await resolveMajorHead(trx, o.major_head) : null;
    if (o.major_head && !majorHeadId) {
      errors.push({ row, field_key: 'major_head', code: 'REF_UNRESOLVED_MAJOR_HEAD', severity, message: `Major head "${o.major_head}" could not be matched.` });
    }
    if (o.minor_head) {
      const minorHeadId = await resolveMinorHead(trx, o.minor_head, majorHeadId);
      if (!minorHeadId) errors.push({ row, field_key: 'minor_head', code: 'REF_UNRESOLVED_MINOR_HEAD', severity, message: `Minor head "${o.minor_head}" could not be matched.` });
    }
  }

  if (payload.data.local_head) {
    const id = await resolveLocalHead(trx, payload.data.local_head);
    if (!id) {
      errors.push({ row, field_key: 'local_head', code: 'REF_UNRESOLVED_LOCAL_HEAD', severity, message: `Local head "${payload.data.local_head}" could not be matched.` });
      // Legacy only: local_head_id will land NULL (no free-text fallback column exists on
      // fir_details/arrest_details/uidb_details for it) — preserve what the historical file
      // actually said via the sibling local_head_raw field (config/fields/common.json,
      // storage:"extra", added Integration 3 WP4), so the raw text survives on the record
      // itself, not just in this batch's error log.
      if (isLegacy) payload.data.local_head_raw = payload.data.local_head;
    }
  }
  if (payload.data.beat_no) {
    const id = await resolveBeat(trx, payload.data.beat_no);
    if (!id) {
      errors.push({ row, field_key: 'beat_no', code: 'REF_UNRESOLVED_BEAT', severity, message: `Beat "${payload.data.beat_no}" could not be matched.` });
      if (isLegacy) payload.data.beat_raw = payload.data.beat_no;
    }
  }

  return errors;
}

/** Sanity cross-check only (P5.6) — scope is never taken from the sheet for writing, this
 * just catches an obviously-wrong file before it's confirmed. Deliberately forgiving
 * (substring match after stripping "District"/"PS"/parenthetical codes/punctuation) since the
 * sheet's free-text district/police_station cells will never exactly match
 * hierarchy_nodes.name's formatting — the goal is to catch a genuinely different PS/district,
 * not to police formatting. */
function checkPsMismatch(rawParentRow, batchScope) {
  const errors = [];
  const norm = (s) => String(s || '').toLowerCase()
    .replace(/\(.*?\)/g, '').replace(/\bdistrict\b/g, '').replace(/\bps\b/g, '')
    .replace(/[^a-z0-9]/g, '');

  const districtCell = rawParentRow.rowData.district;
  if (districtCell && batchScope.districtName) {
    const a = norm(districtCell), b = norm(batchScope.districtName);
    if (a && b && !a.includes(b) && !b.includes(a)) {
      errors.push({
        row: rawParentRow.rowIdx, field_key: 'district', code: 'PS_MISMATCH', severity: 'ERROR',
        message: `District "${districtCell}" does not match this batch's target district ("${batchScope.districtName}").`,
      });
    }
  }
  const psCell = rawParentRow.rowData.police_station;
  if (psCell && batchScope.psName) {
    const a = norm(psCell), b = norm(batchScope.psName);
    if (a && b && !a.includes(b) && !b.includes(a)) {
      errors.push({
        row: rawParentRow.rowIdx, field_key: 'police_station', code: 'PS_MISMATCH', severity: 'ERROR',
        message: `Police Station "${psCell}" does not match this batch's target station ("${batchScope.psName}").`,
      });
    }
  }
  return errors;
}

/** Advisory only, non-legacy imports only — DRAFT records are allowed to be incomplete (P2.4,
 * same as the interactive form's own save-as-draft), this just tells the officer up front what
 * `submit` will eventually demand. validateRequiredFields THROWS a 422-shaped Error (it's built
 * for the submit endpoint, which wants a hard failure) — caught here and downgraded to a
 * WARNING row instead of letting it abort the whole batch validation (G10). */
async function checkSubmitRequirements(trx, recordType, payload, isLegacy) {
  if (isLegacy) return [];
  try {
    await validateRequiredFields(trx, recordType, payload.data);
    return [];
  } catch (err) {
    return [{
      row: payload.rowIdx, field_key: null, code: 'SUBMIT_REQUIREMENTS_PENDING', severity: 'WARNING',
      message: err.message,
    }];
  }
}

/** Batched duplicate-in-DB check — CASE ONLY. `fir_details.ps_id` is the deliberately
 * denormalized business-key column (DB_SCHEMA.md §9.3 #3) that carries
 * UNIQUE(ps_id, fir_year, fir_no); `arrest_details` has no `ps_id` column at all (an ARREST's
 * scope lives on the `records` spine only) and, more fundamentally, a repeated fir_no on the
 * ARREST side isn't a duplicate in the first place — several arrestees legitimately share one
 * FIR. One query for the whole PS's FIRs, not one per row.
 *
 * Deliberately does NOT `whereIn('fir_no', canonicalFirNos)` — the DB column stores the RAW
 * textual fir_no (e.g. "954/2026", or a differently-formatted "0954/2026" from a pre-
 * Integration-3 row), never the canonical "seq|year" form, so a SQL-level equality/whereIn
 * against canonical keys would silently match nothing (found live during WP4 verification —
 * every real duplicate was missed). Fetch the PS's fir_nos and canonicalize in JS instead,
 * matching how canonKey() is used everywhere else in this module. */
async function findDuplicateFirsInDb(trx, psId, canonicalFirNos) {
  if (!canonicalFirNos.length) return new Set();
  const rows = await trx('fir_details').where({ ps_id: psId }).whereNotNull('fir_no').select('fir_no');
  const dbCanon = new Set(rows.map((r) => canonKey(r.fir_no)));
  return new Set(canonicalFirNos.filter((k) => dbCanon.has(k)));
}

/**
 * Full validation for one composed parent row. `payload` is import.compose.js's
 * composeRecordPayload() output, with `rowIdx` attached by the caller for error reporting.
 * `dbDuplicateFirs` is the pre-computed Set from findDuplicateFirsInDb (batch-level, computed
 * once by the caller — see validateBatch) — only meaningful (and only ever populated) for CASE.
 */
async function validateComposedRow(trx, recordType, isLegacy, batchScope, payload, rawParentRow, dbDuplicateFirs, ioByPis) {
  const errors = [];

  if (!payload.recordDate) {
    errors.push({ row: payload.rowIdx, field_key: null, code: 'RECORD_DATE_MISSING', severity: 'ERROR', message: 'No usable date found for this record (checked FIR/arrest/occurrence date fields).' });
  }

  if (recordType === 'CASE' && payload.data.fir_no && dbDuplicateFirs.has(canonKey(payload.data.fir_no))) {
    errors.push({
      row: payload.rowIdx, field_key: 'fir_no', code: 'DUPLICATE_IN_DB', severity: 'ERROR',
      message: `FIR number "${payload.data.fir_no}" already exists in the database for this Police Station.`,
    });
  }

  // IO resolution (WP10, user decision 2026-07-16): the template's single "IO ID (PIS No.)"
  // column resolves against investigating_officers scoped to the batch's target PS. Found →
  // the resolved uuid is stamped onto the payload (registry routes io_id → records.io_id);
  // like validateRefLabels' raw-preservation, this MUTATION is what carries the value to the
  // write — confirm re-runs this whole validation on its own recomposed payload (AD7), so no
  // extra wiring is needed there. Unknown PIS → ERROR in BOTH modes (deliberately stricter
  // than the legacy-WARNING leniency pattern): the operator either registers the IO and
  // re-validates, or imports anyway and this row is skipped. The raw io_pis text stays in
  // flat data harmlessly — its registry storage is "ui_only", dropped at write time.
  if (ioByPis && payload.data.io_pis !== undefined && payload.data.io_pis !== null && String(payload.data.io_pis).trim() !== '') {
    const pisKey = String(payload.data.io_pis).trim().toLowerCase();
    const hit = ioByPis.get(pisKey);
    if (hit) {
      payload.data.io_id = hit.id;
    } else {
      errors.push({
        row: payload.rowIdx, field_key: 'io_pis', code: 'IO_NOT_REGISTERED', severity: 'ERROR',
        message: `IO with PIS number "${String(payload.data.io_pis).trim()}" is not registered for this police station. Register the IO first, then re-validate — or import now and this row will be skipped.`,
      });
    }
  }

  errors.push(...await validateRefLabels(trx, recordType, payload, isLegacy));
  errors.push(...checkPsMismatch(rawParentRow, batchScope));
  errors.push(...await checkSubmitRequirements(trx, recordType, payload, isLegacy));

  return errors;
}

export {
  validateRefLabels, checkPsMismatch, checkSubmitRequirements,
  findDuplicateFirsInDb, validateComposedRow,
};

// ── batch orchestrator ──────────────────────────────────────────────────────────────────

/** Groups already-row-validated child rows under their parent's canonical key, staying in the
 * `{rowData, rowIdx}` shape import.compose.js's composeRecordPayload expects (import.parse.js's
 * own exported groupRowsByParent works on flat rowData objects — the old code always unwrapped
 * to `.rowData` before calling it; this is the same operation done in place, on wrapped rows,
 * so the composer's `c.rowData` accesses keep working without a second unwrap/rewrap pass). */
function groupWrappedRowsByParent(rows, keyField, parentIndex) {
  const map = new Map();
  for (const r of rows) {
    const canon = parentIndex.resolve(r.rowData[keyField]);
    if (!canon) continue;
    if (!map.has(canon)) map.set(canon, []);
    map.get(canon).push(r);
  }
  return map;
}

/**
 * Full batch validation — the single entry point import.service.js's createBatch calls.
 * `parsed` is a readWorkbook() result. `batchScope` = `{psId, districtId, districtName, psName}`
 * (districtName/psName are for the PS_MISMATCH sanity check only, resolved once by the caller
 * from hierarchy_nodes — never used for actual write-time scoping).
 *
 * Returns `{ errorRows, invalidParentKeys, composedPayloads, counts }`:
 *   - errorRows: every {row, field_key, code, severity, message} found, across every sheet.
 *   - invalidParentKeys: Set of canonical parent keys with at least one ERROR-severity finding
 *     — the whole-FIR-atomicity boundary; every row/child under an invalidated parent is
 *     skipped at confirm time (WARNING-only parents are NOT invalidated — they still import).
 *   - composedPayloads: [{ payload, rawParentRow }] for every parent NOT invalidated — ready
 *     for import.service.js to persist error rows from and, later, for the confirm handler to
 *     write (WP5 re-composes independently from the same file rather than trusting this array
 *     to survive across the validate/confirm HTTP boundary — see C3/AD7).
 *   - counts: { total, valid, invalid }.
 */
export async function validateBatch(trx, { recordType, isLegacy, batchScope, parsed, registryMap }) {
  const { parentRows, childSheets, parentIndex, parentKeyField, sheetFieldLists } = parsed;
  const errorRows = [];
  const invalidParentKeys = new Set();

  const parentCanonOf = (row) => {
    if (!parentKeyField) return `row:${row.rowIdx}`;
    const val = row.rowData[parentKeyField];
    return (parentIndex && parentIndex.resolve(val)) || canonKey(val);
  };

  const invalidate = (canon) => { if (canon) invalidParentKeys.add(canon); };

  // 1. Parent sheet: required fields.
  for (const e of validateRowFields(parentRows, sheetFieldLists.parent, 'parent')) {
    errorRows.push(e);
    if (e.severity === 'ERROR') {
      const r = parentRows.find((pr) => pr.rowIdx === e.row);
      if (r) invalidate(parentCanonOf(r));
    }
  }

  // 2. Parent sheet: duplicate-in-sheet by its own key (skip single-sheet types with no key).
  if (parentKeyField) {
    for (const e of checkDuplicatesInSheet(parentRows, (rd) => rd[parentKeyField], 'parent', parentKeyField)) {
      errorRows.push(e);
      const r = parentRows.find((pr) => pr.rowIdx === e.row);
      if (r) invalidate(parentCanonOf(r));
    }
  }

  // 3. Child sheets: required fields + parent-key existence, each error's parent invalidated.
  for (const [role, rows] of Object.entries(childSheets)) {
    const fieldsList = sheetFieldLists[role];
    if (!fieldsList) continue;
    for (const e of validateRowFields(rows, fieldsList, role, parentIndex, parentKeyField)) {
      errorRows.push(e);
      if (e.severity === 'ERROR') {
        const r = rows.find((cr) => cr.rowIdx === e.row);
        if (r && parentKeyField) invalidate(parentIndex.resolve(r.rowData[parentKeyField]) || canonKey(r.rowData[parentKeyField]));
      }
    }
  }

  // 4. Compose every parent NOT already invalidated, grouping its children.
  const groupedByRole = {};
  for (const [role, rows] of Object.entries(childSheets)) {
    groupedByRole[role] = parentIndex ? groupWrappedRowsByParent(rows, parentKeyField, parentIndex) : new Map();
  }

  const composedPayloads = [];
  for (const parentRow of parentRows) {
    const canon = parentCanonOf(parentRow);
    if (invalidParentKeys.has(canon)) continue;

    const children = {};
    for (const role of Object.keys(childSheets)) {
      children[role] = groupedByRole[role].get(canon) || [];
    }

    const sourceRef = sourceRefFor(parentKeyField, parentRow.rowData, parentRow.rowIdx);
    const payload = composeRecordPayload(recordType, parentRow, children, sourceRef);
    payload.rowIdx = parentRow.rowIdx; // for composed-level error attribution
    composedPayloads.push({ payload, rawParentRow: parentRow });
  }

  // 5. Batched duplicate-in-DB (CASE only — see findDuplicateFirsInDb).
  let dbDuplicateFirs = new Set();
  if (recordType === 'CASE') {
    const candidateFirs = composedPayloads.map((c) => c.payload.data.fir_no).filter(Boolean).map(canonKey);
    dbDuplicateFirs = await findDuplicateFirsInDb(trx, batchScope.psId, candidateFirs);
  }

  // 5b. Registered IOs for the batch's target PS, fetched once and matched normalized-to-
  // normalized in JS (WP10 — same fetch-all-then-compare reasoning as findDuplicateFirsInDb:
  // never whereIn raw sheet values against stored ones). Consumed by validateComposedRow's
  // io_pis resolution.
  const ioRows = await trx('investigating_officers')
    .where({ ps_id: batchScope.psId, is_active: true })
    .select('id', 'pis_no');
  const ioByPis = new Map(
    ioRows.filter((r) => r.pis_no).map((r) => [String(r.pis_no).trim().toLowerCase(), r])
  );

  // 6. Composed-level checks per surviving parent; a DUPLICATE_IN_DB/RECORD_DATE_MISSING/
  // PS_MISMATCH/IO_NOT_REGISTERED/non-legacy-ref-miss finding invalidates its parent too
  // (whole-FIR atomicity applies here exactly as it does to row-level findings).
  for (const { payload, rawParentRow } of composedPayloads) {
    const errs = await validateComposedRow(trx, recordType, isLegacy, batchScope, payload, rawParentRow, dbDuplicateFirs, ioByPis);
    for (const e of errs) {
      errorRows.push(e);
      if (e.severity === 'ERROR') invalidate(parentCanonOf(rawParentRow));
    }
  }

  const finalPayloads = composedPayloads.filter((c) => !invalidParentKeys.has(parentCanonOf(c.rawParentRow)));
  const counts = { total: parentRows.length, valid: finalPayloads.length, invalid: parentRows.length - finalPayloads.length };

  return { errorRows, invalidParentKeys, composedPayloads: finalPayloads, counts };
}
