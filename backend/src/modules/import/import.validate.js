// Validation for the bulk-import module (Integration 3, WP4; T1/T2/T3/T4/T5/T6/T7 reliability
// pass, Wave A, docs/import-ux-study/03-TRIAGE-MATRIX.md). Two layers, matching what's
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
// T1 requiredness unification (fixes F1 — two independent, disagreeing requiredness sources):
// the row-level required check now reads `field_registry.validation_rules.required` (via the
// registryMap every caller already threads through, WP0's normalizeRegistryRow) for every
// record type — the curated `import-fields.config.js` lists' hand-typed `required:true/false`
// is now LAYOUT-only (label/hint/ordering) and is consulted ONLY as a fallback for the handful
// of synthetic import-only keys (district/police_station/crime_head/minor_head) that have no
// field_registry row of their own to defer to.
//
// D1 severity policy: non-legacy -> registry-required is ERROR (same bar as interactive, no
// relaxation). Legacy -> registry-required demotes to WARNING EXCEPT the architect-ruled
// keystone sets below (03-TRIAGE-MATRIX.md), which are ERROR in BOTH modes regardless of what
// field_registry currently says (an explicit override, not a modifier of an already-required
// field — several keystones, e.g. UIDB's found_date/found_place, are registry-required:false
// today; the keystone ruling promotes them independent of that).
//
// Everything else (parent-key [except T5's narrow single-parent recovery], dup-in-sheet,
// dup-in-DB, PS-mismatch, record-date) stays ERROR in both modes unchanged — those aren't
// data-quality judgment calls, they're structural. Ref-label unresolved (T4-tightened
// matching, still ERROR/legacy=WARNING) and IO handling (T2, its own legacy/non-legacy split)
// keep their existing per-rule leniency, documented at each site below.
import {
  resolveAct, resolveSection, resolveMajorHead, resolveMinorHead, resolveLocalHead, resolveBeat,
} from '../records/records.normalize.js';
import { validateRequiredFields } from '../records/records.service.js';
import { canonKey, effectiveRecordType } from './import.parse.js';
import { composeRecordPayload, sourceRefFor } from './import.compose.js';
import { getDropOnlyKeys } from './import-key-bridge.config.js';
import { KEYSTONE_FIELDS, OR_GROUP_KEYSTONES } from './import-fields.config.js';

// T1 keystone sets (03-TRIAGE-MATRIX.md, architect ruling under D1) — KEYSTONE_FIELDS /
// OR_GROUP_KEYSTONES now live in import-fields.config.js (FIX 2a, 2026-07): a pure config
// module both this file and import.parse.js import from, so the two never drift again (they
// had — MISSING's parse-time ghost-row set previously also listed missing_date/gd_date, which
// belong to the OR-group here, not the flat keystone set; see keystoneColumnsFor there for how
// parse.js derives its ghost-row signal from the same two maps).

// ── row-level (moved from import.controller.js; T1-rewired to be registry-driven) ──────────

/** T1 fallback path only — used when a curated field_key has NO field_registry counterpart
 * (the synthetic import-only keys: district/police_station/crime_head/minor_head/act/sections
 * on the Act & Sections sheet's own synthetic entries). Reads the curated list's hand-typed
 * `required` boolean, now purely a layout artifact for every OTHER field. */
export const isRequired = (field) => !!field.required;

/** Registry-driven requiredness (T1) + keystone override. `registryMap` is field_key ->
 * normalizeRegistryRow'd row (already has `.required` with IMPORT_OPTIONAL_REQUIRED_KEYS
 * demotion applied, per registry-sync.util.js) — the SAME map readWorkbook/validateBatch pass
 * around everywhere else, never a second copy. Returns `{ required, isKeystone }`. */
function fieldRequirement(field, registryMap, keystoneKeys) {
  const key = field.field_key;
  const regRow = registryMap ? registryMap[key] : null;
  const isKeystone = keystoneKeys.has(key);
  const registryRequired = regRow ? regRow.required === true : isRequired(field);
  return { required: registryRequired || isKeystone, isKeystone };
}

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
 * `parentKeyField` are omitted for the parent sheet itself (nothing to check against).
 *
 * `opts`:
 *   - `registryMap`, `isLegacy`, `keystoneKeys` (T1) — drive required-field severity.
 *   - `soleParentRawKey` (T5) — non-null only when the parent sheet has EXACTLY one row;
 *     a blank child key then auto-links to it (mutates `rowData` in place so the existing
 *     canonical-key grouping picks it up unchanged) + a WARNING trail, never silent. Multi-
 *     parent files get no such inference (never positional — row order is never used to
 *     guess linkage).
 *   - `orGroups` (T1, MISSING's date-OR keystone) — `[{fields:[k1,k2], message}]`; satisfied
 *     when ANY field in the group is filled, ERROR in both modes when ALL are blank. Fields
 *     listed in an OR-group are excluded from the normal per-field required loop (the group
 *     check replaces their individual requiredness entirely). */
export function validateRowFields(rows, fieldsList, sheetName, parentIndex = null, parentKeyField = null, opts = {}) {
  const { registryMap = null, isLegacy = false, keystoneKeys = new Set(), soleParentRawKey = null, orGroups = [] } = opts;
  const orGroupFieldKeys = new Set(orGroups.flatMap((g) => g.fields));
  const errors = [];
  for (const { rowData, rowIdx } of rows) {
    if (parentIndex && parentKeyField) {
      const parentVal = rowData[parentKeyField];
      if (!parentVal) {
        // T5 fix (2026-07): a sole-parent key that is present but blank ('') must NOT be
        // treated as a usable recovery target — `!= null` alone accepts '', silently
        // "recovering" a child onto a parent whose own key is itself blank (that parent
        // will already be failing its own keystone/required check separately). Only a
        // genuinely non-blank sole-parent key is eligible for the T5 auto-link.
        const soleParentKeyUsable = soleParentRawKey != null && String(soleParentRawKey).trim() !== '';
        if (soleParentKeyUsable) {
          // T5 narrow recovery — provably safe (only one possible parent exists at all,
          // regardless of row order), never extended to the ambiguous multi-parent case.
          rowData[parentKeyField] = soleParentRawKey;
          errors.push({
            row: rowIdx, field_key: parentKeyField, code: 'PARENT_KEY_RECOVERED', severity: 'WARNING',
            message: `Blank "${parentKeyField}" in sheet '${sheetName}' was auto-linked to this file's only parent row — verify this is correct.`,
          });
        } else {
          errors.push({
            row: rowIdx, field_key: parentKeyField, code: 'PARENT_KEY_BLANK', severity: 'ERROR',
            message: `Fill the "${parentKeyField}" column on sheet '${sheetName}' — it must repeat the parent row's ${parentKeyField} so this row can be linked.`,
          });
        }
      } else if (parentIndex.resolve(parentVal) === null) {
        errors.push({
          row: rowIdx, field_key: parentKeyField, code: 'PARENT_KEY_UNMATCHED', severity: 'ERROR',
          message: `Reference '${parentVal}' in sheet '${sheetName}' does not match any row in the parent sheet — check for a typo, or a missing parent row.`,
        });
      }
    }
    for (const field of fieldsList) {
      const key = field.field_key;
      if (orGroupFieldKeys.has(key)) continue; // covered by the OR-group check below instead
      const val = rowData[key];
      if (field.show_when && !evaluateShowWhen(field.show_when, rowData)) continue;
      const { required, isKeystone } = fieldRequirement(field, registryMap, keystoneKeys);
      if (required && (val === null || val === undefined || val === '')) {
        const severity = (!isLegacy || isKeystone) ? 'ERROR' : 'WARNING';
        errors.push({
          row: rowIdx, field_key: key, code: 'REQUIRED_MISSING', severity,
          message: `"${field.label_en}" is required in sheet "${sheetName}".`,
        });
      }
    }
    for (const group of orGroups) {
      const anyFilled = group.fields.some((k) => rowData[k] !== null && rowData[k] !== undefined && rowData[k] !== '');
      if (!anyFilled) {
        errors.push({
          row: rowIdx, field_key: group.fields[0], code: 'REQUIRED_MISSING', severity: 'ERROR',
          message: group.message,
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
 *
 * T3/T4 (03-TRIAGE-MATRIX.md): local/major/minor head and beat resolution now also try a
 * noise-strip/PS-scoped fallback (records.normalize.js) before giving up. A resolver that only
 * succeeded via that fallback sets `recovered:true` — a mandatory WARNING trail is emitted for
 * it in BOTH modes (no silent auto-fix, per the matrix's "always record the normalization"
 * rule), separate from and in addition to the existing legacy-only unresolved-ref leniency.
 * `batchScope` (added this pass) threads the target PS into resolveBeat's bare-number match.
 */
async function validateRefLabels(trx, recordType, payload, isLegacy, batchScope) {
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
      } else {
        if (actId == null && resolved.actCd != null) actId = resolved.actCd; // group alias resolved down to a specific act via its section
        if (resolved.recovered) {
          errors.push({ row, field_key: 'sections', code: 'SECTION_RECOVERED', severity: 'WARNING', message: `Section "${o.section}" matched after normalizing zero-padding/spacing — verify this is correct.` });
        }
      }
    }
    if (actId == null && !otherActName) {
      // Neither resolved — record_offences' CHECK (act_id NOT NULL OR other_act_name NOT
      // NULL) would fail at write time with nothing to fall back on. Only reachable when a
      // row has a section but no act text at all.
      errors.push({ row, field_key: 'act', code: 'REF_UNRESOLVED_SECTION', severity, message: `Section "${o.section}" has no associated act to resolve against.` });
    }
    const { id: majorHeadId, recovered: majorRecovered } = o.major_head ? await resolveMajorHead(trx, o.major_head) : { id: null, recovered: false };
    if (o.major_head && !majorHeadId) {
      errors.push({ row, field_key: 'major_head', code: 'REF_UNRESOLVED_MAJOR_HEAD', severity, message: `Major head "${o.major_head}" could not be matched.` });
    } else if (majorRecovered) {
      errors.push({ row, field_key: 'major_head', code: 'MAJOR_HEAD_RECOVERED', severity: 'WARNING', message: `Major head "${o.major_head}" matched after normalizing punctuation/spacing — verify this is correct.` });
    }
    if (o.minor_head) {
      const { id: minorHeadId, recovered: minorRecovered } = await resolveMinorHead(trx, o.minor_head, majorHeadId);
      if (!minorHeadId) {
        errors.push({ row, field_key: 'minor_head', code: 'REF_UNRESOLVED_MINOR_HEAD', severity, message: `Minor head "${o.minor_head}" could not be matched.` });
      } else if (minorRecovered) {
        errors.push({ row, field_key: 'minor_head', code: 'MINOR_HEAD_RECOVERED', severity: 'WARNING', message: `Minor head "${o.minor_head}" matched after normalizing punctuation/spacing — verify this is correct.` });
      }
    }
  }

  if (payload.data.local_head) {
    const { id, recovered } = await resolveLocalHead(trx, payload.data.local_head);
    if (!id) {
      errors.push({ row, field_key: 'local_head', code: 'REF_UNRESOLVED_LOCAL_HEAD', severity, message: `Local head "${payload.data.local_head}" could not be matched.` });
      // Legacy only: local_head_id will land NULL (no free-text fallback column exists on
      // fir_details/arrest_details/uidb_details for it) — preserve what the historical file
      // actually said via the sibling local_head_raw field (config/fields/common.json,
      // storage:"extra", added Integration 3 WP4), so the raw text survives on the record
      // itself, not just in this batch's error log.
      if (isLegacy) payload.data.local_head_raw = payload.data.local_head;
    } else if (recovered) {
      errors.push({ row, field_key: 'local_head', code: 'LOCAL_HEAD_RECOVERED', severity: 'WARNING', message: `Local head "${payload.data.local_head}" matched after normalizing punctuation/spacing — verify this is correct.` });
    }
  }
  if (payload.data.beat_no) {
    const { id, recovered } = await resolveBeat(trx, payload.data.beat_no, batchScope?.psId);
    if (!id) {
      errors.push({ row, field_key: 'beat_no', code: 'REF_UNRESOLVED_BEAT', severity, message: `Beat "${payload.data.beat_no}" could not be matched.` });
      if (isLegacy) payload.data.beat_raw = payload.data.beat_no;
    } else if (recovered) {
      errors.push({ row, field_key: 'beat_no', code: 'BEAT_RECOVERED', severity: 'WARNING', message: `Beat "${payload.data.beat_no}" matched to a beat number in this station after normalizing — verify this is correct.` });
    }
  }

  return errors;
}

/** Sanity cross-check only (P5.6) — scope is never taken from the sheet for writing, this
 * just catches an obviously-wrong file before it's confirmed. Deliberately forgiving
 * (substring match after stripping "District"/"PS"/"Police Station"/parenthetical codes/
 * punctuation) since the sheet's free-text district/police_station cells will never exactly
 * match hierarchy_nodes.name's formatting — the goal is to catch a genuinely different
 * PS/district, not to police formatting.
 *
 * T4 (03-TRIAGE-MATRIX.md): extends the existing noise-strip with the "Police Station"/"P.S."
 * phrase (previously only the single-word "ps"/"district" tokens were stripped, so e.g.
 * "Parliament Street Police Station" never noise-matched "Parliament Street") — same
 * compare-to-the-batch's-one-authorized-target semantics as before, just a stronger strip.
 * This is a keystone check (T1: "resolvable PS + District" is ERROR in BOTH modes) —
 * unchanged severity, only the matching got more tolerant. */
function checkPsMismatch(rawParentRow, batchScope) {
  const errors = [];
  const norm = (s) => String(s || '').toLowerCase()
    .replace(/\(.*?\)/g, '')
    .replace(/\bp\.?\s*s\.?\b/g, '') // "PS" / "P.S." as a standalone token
    .replace(/\bpolice\s+station\b/g, '')
    .replace(/\bdistrict\b/g, '')
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
    // FIX 4 (2026-07): validateRequiredFields is a loadRegistry-based check keyed by
    // field_registry.applicable_record_types — 'KALANDRA' itself matches ZERO rows there
    // (KALANDRA is stored/registry-classified as ARREST; effectiveRecordType() is the one
    // place that translation happens). Passing the raw import recordType silently made this
    // advisory check a no-op for every KALANDRA row. Apply the same translation the write
    // path (createImportedRecord) and buildRegistryMap already apply.
    // persons[] passed along so repeater-role required fields (victim_first_name,
    // arrested_perm_same) are checked per entry — omitting it made this advisory warn
    // "missing" on every non-legacy CASE/ARREST row regardless of the actual data.
    await validateRequiredFields(trx, effectiveRecordType(recordType), payload.data, { persons: payload.persons || [] });
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

  // T1 ARREST/KALANDRA keystone: "≥1 arrestee with first name" (03-TRIAGE-MATRIX.md) — the
  // row-level required check (KEYSTONE_FIELDS' arrested_first_name) only catches a BLANK name
  // on a row that exists; it can't catch the person sheet having ZERO rows for this parent at
  // all. ERROR in both modes, same as every other keystone.
  if (recordType === 'ARREST' || recordType === 'KALANDRA') {
    const hasArresteeWithFirstName = (payload.persons || []).some(
      (p) => p.person_type === 'ARRESTED' && p.data && String(p.data.arrested_first_name || '').trim() !== ''
    );
    if (!hasArresteeWithFirstName) {
      errors.push({
        row: payload.rowIdx, field_key: 'arrested_first_name', code: 'REQUIRED_MISSING', severity: 'ERROR',
        message: 'At least one Arrested Person (with First Name filled in) is required on the Person Arrested sheet.',
      });
    }
  }

  // D1 requiredness ruling (2026-07-17, owner): crime classification is mandatory for new data.
  // ARREST/KALANDRA's crime_head is a real field_registry row (required=true) and is caught by
  // the sheet-level required check; CASE/UIDB's act-sheet head column is a SYNTHETIC composer
  // key (ACT_SHEET_KEYS in import.compose.js) with no registry row, so it can only be enforced
  // here, on the composed offences[]. Not a keystone: legacy demotes to WARNING like every other
  // registry-required field.
  if (recordType === 'CASE' || recordType === 'UIDB') {
    const headField = recordType === 'UIDB' ? 'major_head' : 'crime_head';
    const hasClassifiedOffence = (payload.offences || []).some(
      (o) => String(o.major_head || '').trim() !== ''
    );
    if (!hasClassifiedOffence) {
      errors.push({
        row: payload.rowIdx, field_key: headField, code: 'REQUIRED_MISSING',
        severity: isLegacy ? 'WARNING' : 'ERROR',
        message: 'No Crime Head found on the "Act and Sections" sheet — at least one offence row with a Crime Head is required.',
      });
    }
  }

  if (recordType === 'CASE' && payload.data.fir_no && dbDuplicateFirs.has(canonKey(payload.data.fir_no))) {
    errors.push({
      row: payload.rowIdx, field_key: 'fir_no', code: 'DUPLICATE_IN_DB', severity: 'ERROR',
      message: `FIR number "${payload.data.fir_no}" already exists in the database for this Police Station.`,
    });
  }

  // IO resolution (WP10 2026-07-16 + T2 03-TRIAGE-MATRIX.md/D2 2026-07-16). The template's
  // single "IO ID (PIS No.)" column resolves against investigating_officers scoped to the
  // batch's target PS. Found -> the resolved uuid is stamped onto the payload (registry routes
  // io_id -> records.io_id); like validateRefLabels' raw-preservation, this MUTATION is what
  // carries the value to the write — confirm re-runs this whole validation on its own
  // recomposed payload (AD7), so no extra wiring is needed there.
  //
  // Non-legacy: unmatched PIS stays a hard ERROR (D2 unchanged) — the operator either registers
  // the IO and re-validates, or imports anyway and this row is skipped.
  //
  // Legacy (T2 RECOVER): an unmatched PIS no longer blocks the row. `payload.needsIoAutoProvision`
  // is set here as the signal to import.service.js's processBatch — the actual
  // `investigating_officers` INSERT happens there, inside that row's own write attempt (never
  // here; this function runs at validate time too, which must never write). WARNING trail is
  // mandatory (no silent auto-fix). The template no longer carries a separate IO-name column
  // (WP10 removed it the same day this policy was written) — io_pis is the only IO-identifying
  // cell left, so "name being the minimum, PIS strongly preferred" in the matrix reduces here to
  // "PIS present or not"; a placeholder name is synthesized at provision time (flagged in the
  // report as a faithful-reading adaptation, not a silent deviation).
  const pisRaw = payload.data.io_pis !== undefined && payload.data.io_pis !== null ? String(payload.data.io_pis).trim() : '';
  if (ioByPis && pisRaw !== '') {
    const hit = ioByPis.get(pisRaw.toLowerCase());
    if (hit) {
      payload.data.io_id = hit.id;
    } else if (isLegacy) {
      payload.needsIoAutoProvision = true;
      errors.push({
        row: payload.rowIdx, field_key: 'io_pis', code: 'IO_AUTO_PROVISIONED', severity: 'WARNING',
        message: `IO with PIS number "${pisRaw}" is not yet registered for this police station — it will be auto-registered from the sheet and needs SHO verification.`,
      });
    } else {
      errors.push({
        row: payload.rowIdx, field_key: 'io_pis', code: 'IO_NOT_REGISTERED', severity: 'ERROR',
        message: `IO with PIS number "${pisRaw}" is not registered for this police station. Register the IO first, then re-validate — or import now and this row will be skipped.`,
      });
    }
  } else if (isLegacy) {
    // T2: "neither name nor PIS present -> io_id stays NULL, WARNING only (legacy captures the
    // record)." Informational, both this and the auto-provision case never invalidate the parent.
    errors.push({
      row: payload.rowIdx, field_key: 'io_pis', code: 'IO_MISSING', severity: 'WARNING',
      message: 'No Investigating Officer information provided — the record will be saved without a linked IO; add one later via the interactive form.',
    });
  }

  errors.push(...await validateRefLabels(trx, recordType, payload, isLegacy, batchScope));
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
  const { parentRows, childSheets, parentIndex, parentKeyField, sheetFieldLists, ghostRowsSkipped } = parsed;
  const errorRows = [];
  const invalidParentKeys = new Set();

  // T6 (03-TRIAGE-MATRIX.md/F2/E4) — batch-level notice for parse-time ghost-row skips (never
  // silent; row 0 = batch-level, not any specific data row).
  if (ghostRowsSkipped && ghostRowsSkipped.length) {
    for (const { sheet, rows } of ghostRowsSkipped) {
      errorRows.push({
        row: 0, field_key: null, code: 'GHOST_ROWS_SKIPPED', severity: 'WARNING',
        message: `Sheet "${sheet}": row(s) ${rows.join(', ')} appear empty/stray (1-2 filled cells, no key data) and were skipped.`,
      });
    }
  }

  // T9 (03-TRIAGE-MATRIX.md) — parse-time layout version detection. readWorkbook already fully
  // rejects a file matching no known layout at all (a thrown ApiError, never reaches here); a
  // KNOWN-but-not-current layout still parses normally (bridging only the columns it actually
  // has), plus this ONE batch-level notice so the operator knows to download the current
  // template for next time.
  if (parsed.layoutVersion && parsed.layoutVersion !== 'current') {
    errorRows.push({
      row: 0, field_key: null, code: 'LEGACY_TEMPLATE_LAYOUT', severity: 'WARNING',
      message: 'This file uses an older template version — please download the current template for future imports.',
    });
  }

  // T10 (03-TRIAGE-MATRIX.md/F5) — silent-drop warning: a {drop:true}-bridged template column
  // (import-key-bridge.config.js) that isn't consumed by any `compose` entry is genuinely
  // discarded — if the operator filled it in ANYWHERE in the file, warn ONCE per column
  // (never per row; F5's "no per-row noise" rule).
  const dropOnlyKeys = getDropOnlyKeys(recordType);
  if (dropOnlyKeys.length) {
    const allRawRows = [...parentRows, ...Object.values(childSheets).flat()];
    const hasNonBlank = (key) => allRawRows.some(({ rowData }) => {
      const v = rowData[key];
      return v !== null && v !== undefined && String(v).trim() !== '';
    });
    const labelForDroppedKey = (key) => {
      for (const list of Object.values(sheetFieldLists)) {
        const f = (list || []).find((x) => x.field_key === key);
        if (f && f.label_en) return f.label_en;
      }
      return key;
    };
    for (const key of dropOnlyKeys) {
      if (hasNonBlank(key)) {
        errorRows.push({
          row: 0, field_key: key, code: 'COLUMN_DROPPED_INFORMATIONAL', severity: 'WARNING',
          message: `Column "${labelForDroppedKey(key)}" is informational and is not imported.`,
        });
      }
    }
  }

  const parentCanonOf = (row) => {
    if (!parentKeyField) return `row:${row.rowIdx}`;
    const val = row.rowData[parentKeyField];
    return (parentIndex && parentIndex.resolve(val)) || canonKey(val);
  };

  const invalidate = (canon) => { if (canon) invalidParentKeys.add(canon); };

  // T1: registry-driven requiredness + keystone overrides (03-TRIAGE-MATRIX.md).
  const keystoneKeys = KEYSTONE_FIELDS[recordType] || new Set();
  const orGroups = OR_GROUP_KEYSTONES[recordType] || [];
  const rowOpts = { registryMap, isLegacy, keystoneKeys, orGroups };

  // T5: narrow single-parent auto-link — only when the file has EXACTLY one parent row (never
  // extended to the ambiguous multi-parent case; never positional).
  const soleParentRawKey = (parentKeyField && parentRows.length === 1)
    ? parentRows[0].rowData[parentKeyField] : null;

  // 1. Parent sheet: required fields (no parent-key check for the parent sheet itself).
  for (const e of validateRowFields(parentRows, sheetFieldLists.parent, 'parent', null, null, rowOpts)) {
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
    for (const e of validateRowFields(rows, fieldsList, role, parentIndex, parentKeyField, { ...rowOpts, soleParentRawKey })) {
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
