// Registry-driven normalization + label→code resolution (ENGINEERING_BASELINE.md P2).
//
// The live form (components/forms/DynamicForm.jsx + ActsSectionsTable.jsx) submits
// human-readable LABELS for every classification field — never ref.* codes (confirmed:
// fields.controller.js's `toValueLabel` helper uses the label column as both the option
// value AND the display text for acts/sections/major-heads/minor-heads/local-heads/beats).
// This module is the ONE place that turns those labels into typed FK ids before the
// mapper (records.mapper.js) routes them into typed columns — normalization is driven by
// `field_registry.field_type` + the ref.* lookups, never per-endpoint parsing code.
//
// Deterministic + idempotent (P2.2): normalizing an already-normalized value is a no-op.
import { toISO } from '../../utils/dateFormat.js';
import { ACT_GROUP_CODES } from '../fields/classificationSources.config.js';

const norm = (s) => String(s ?? '').trim().toLowerCase();

/** Yes/No/true/false/1/0 -> boolean. Returns null for empty/unrecognized (unanswered). */
export function toBool(val) {
  if (val === null || val === undefined || val === '') return null;
  if (typeof val === 'boolean') return val;
  const s = norm(val);
  if (['yes', 'true', '1', 'y'].includes(s)) return true;
  if (['no', 'false', '0', 'n'].includes(s)) return false;
  return null;
}

/** Digits-only phone/mobile, +91 and separators stripped. Empty -> null. */
export function normalizePhone(val) {
  if (val === null || val === undefined || val === '') return null;
  let s = String(val).trim().replace(/[\s\-().]/g, '');
  s = s.replace(/^\+?91/, '');
  const digits = s.replace(/\D/g, '');
  return digits || null;
}

/** Trim + collapse internal whitespace. Empty -> null (never an empty-string column value). */
export function normalizeText(val) {
  if (val === null || val === undefined) return null;
  const s = String(val).replace(/\s+/g, ' ').trim();
  return s || null;
}

/** T7.1 (03-TRIAGE-MATRIX.md / F7) — vocabulary reconciliation. `field_registry`'s option
 * lists are Title Case ('Male', 'Transgender', 'Father', 'Involved', ...); the three CHECK
 * constraints this feeds (`persons.gender`, `persons.relation_type`, `record_properties.status`)
 * expect UPPERCASE. Nothing between the form/import and the DB ever did this translation
 * (confirmed: `coerceByType`'s default branch is plain `normalizeText`) — every submission of
 * a valid dropdown value for these three columns was one case-mismatch away from a raw DB_LEAK
 * `WRITE_FAILED`. This is the one shared place both the interactive form and bulk import route
 * through (records.mapper.js), so fixing it here fixes both write paths at once. Deliberately
 * just uppercases rather than looking values up against an explicit map — every current option
 * value already matches its CHECK member once uppercased (verified against
 * migrations/20260711000004_persons_properties.js + the T7.1 CHECK-expansion migration); this
 * stays correct automatically as long as future option additions are chosen to already satisfy
 * that (documented in the migration's own comment), same "reject only the impossible" posture
 * as the rest of P2 — an unrecognized value still reaches the DB CHECK as the last line. */
export function normalizeEnumUpper(val) {
  const s = normalizeText(val);
  return s ? s.toUpperCase() : null;
}

/** dd/mm/yyyy | dd-mm-yyyy | yyyy-mm-dd | Date -> ISO yyyy-mm-dd for native DATE columns. */
export function normalizeDate(val) {
  if (val === null || val === undefined || val === '') return null;
  return toISO(val);
}

// ── FIR reference normalization ──────────────────────────────────────────────────────
// Canonical FIR form is "<seq>/<4-digit-year>" ("123/2026"). Case↔arrest↔missing-person
// auto-linkage (linkResolver.js) and duplicate detection both match fir_no by EXACT string,
// so every write path (interactive form AND bulk import) must store the same canonical form
// — this is the one shared brain for it (applied via records.mapper.js's normalizeDetailValue
// for the fir_no detail columns, and by the import composer for validate-time checks).

/** 2-digit FIR year -> 4-digit. FIRs are registered in the current year (occasionally the
 * recent past; legacy imports reach back decades); future years are impossible beyond a
 * year-boundary margin. Rule: yy <= (current yy + 1) -> 20yy, else 19yy.
 * (In 2026: 26 -> 2026, 27 -> 2027 (margin), 28 -> 1928, 98 -> 1998.) */
export function expandFirYear(y2) {
  const cur2 = new Date().getFullYear() % 100;
  return y2 <= cur2 + 1 ? 2000 + y2 : 1900 + y2;
}

// Same separator convention as import.parse.js's splitFirTokens (reimplemented locally —
// dependency direction is import module -> records module, never the reverse). A cell
// listing several FIRs is left untouched: collapsing it would corrupt data.
const FIR_LIST_SEPARATORS = /\s*(?:[,;&\n]|\band\b)\s*/i;

/** Normalize a single FIR reference to "<seq>/<4-digit-year>" — "0123/26", "FIR-104 / 2026",
 * "123/2026" all become "123/2026". A bare sequence with no year stays a bare sequence (never
 * invent a year). Multi-FIR lists and unparseable text return UNCHANGED (P2: reject only the
 * impossible — validation elsewhere decides whether the value is an error). */
export function normalizeFirNo(raw) {
  if (raw === null || raw === undefined) return raw;
  const s = String(raw).trim();
  if (!s) return raw;
  if (s.split(FIR_LIST_SEPARATORS).filter(Boolean).length > 1) return raw;
  const nums = s.match(/\d+/g);
  if (!nums || nums.length === 0) return raw;
  if (nums.length === 1) return String(parseInt(nums[0], 10));
  // Prefer an explicit 4-digit year token anywhere in the string; else treat the second
  // number as the year (2-digit -> century-expanded). Mirrors import.parse.js parseFirAndYear.
  let yearIdx = -1;
  for (let i = 0; i < nums.length; i++) {
    const n = parseInt(nums[i], 10);
    if (nums[i].length === 4 && n >= 1900 && n <= 2200) { yearIdx = i; break; }
  }
  let year;
  let seqToken;
  if (yearIdx >= 0) {
    year = parseInt(nums[yearIdx], 10);
    seqToken = nums.find((_, i) => i !== yearIdx);
  } else {
    seqToken = nums[0];
    year = parseInt(nums[1], 10);
    if (nums[1].length === 2) year = expandFirYear(year);
  }
  if (seqToken === undefined) return raw;
  return `${parseInt(seqToken, 10)}/${year}`;
}

// ── FK label resolution (ref.* lookups) ──────────────────────────────────────────────
// Every resolver is case-insensitive-exact-match against the label the frontend actually
// renders as the option value (see fields.controller.js's toValueLabel dispatch — the
// canonical list of which ref column is "the label" per field).

const cache = new Map(); // per-process cache of act/section/head reference tables — ref.* only
// changes via `npm run load-ref`, safe to cache for the process lifetime like fields.service.js's
// getActsSectionsRegistry does.

async function loadActs(trx) {
  if (cache.has('acts')) return cache.get('acts');
  const rows = await trx('ref.acts').select('act_cd', 'act_long');
  cache.set('acts', rows);
  return rows;
}

/**
 * Resolve an act label (e.g. 'IPC', 'Delhi Excise Act', 'Arms Act', 'Gambling Act', a raw
 * act_long string, or free text) to { actId, actCds, otherActName }.
 * - Group aliases (IPC/Delhi Excise Act/Arms Act/Gambling Act) resolve via ACT_GROUP_CODES
 *   (same map fields.controller.js uses to build the option list) — actId is null (multiple
 *   act_cds possible under one alias), actCds carries the set for scoping section lookups.
 * - A raw ref.acts.act_long exact match resolves to a single actId/actCds=[cd].
 * - Anything else (BNS/BNSS/CrPC/Other Act/unmatched free text) falls back to
 *   { actId: null, actCds: [], otherActName: <as entered> } — CHECK-satisfying free text.
 */
export async function resolveAct(trx, label) {
  if (!label) return { actId: null, actCds: [], otherActName: null };
  const key = norm(label);

  const groupKey = Object.keys(ACT_GROUP_CODES).find((k) => norm(k) === key);
  if (groupKey) return { actId: null, actCds: ACT_GROUP_CODES[groupKey], otherActName: null };

  const acts = await loadActs(trx);
  const hit = acts.find((a) => norm(a.act_long) === key);
  if (hit) return { actId: hit.act_cd, actCds: [hit.act_cd], otherActName: null };

  return { actId: null, actCds: [], otherActName: normalizeText(label) };
}

/**
 * Resolve a section label against ref.sections.section (the display/value column),
 * scoped to the given act_cd(s) when known (ref.sections.act_sec_cd), falling back to an
 * unscoped match when the act didn't resolve to a specific code (e.g. a raw group alias
 * with several act_cds, or the act itself was free text).
 */
/**
 * Returns `{ sectionId, actCd }` — `actCd` is the SPECIFIC act_cd the matched section row
 * belongs to (`ref.sections.act_sec_cd`), which is how a group alias like 'IPC' (which maps
 * to a set of act_cds, not one) resolves down to the one definitive act for that citation —
 * `record_offences.act_id` needs a single value, not a set.
 */
// T4: numeric section codes tolerate zero-padding/whitespace differences ("07" vs "7", " 379"
// vs "379") — NOT substring matching (17k rows in ref.sections; a false substring match here
// is a real collision risk the matrix explicitly rules out).
const padNormSection = (s) => norm(s).replace(/\s+/g, '').replace(/^0+(?=\d)/, '');

export async function resolveSection(trx, label, actCds = []) {
  if (!label) return { sectionId: null, actCd: null, recovered: false };
  const key = norm(label);
  let q = trx('ref.sections').select('section_code', 'section', 'act_sec_cd');
  if (actCds.length) q = q.whereIn('act_sec_cd', actCds.map(String));
  const rows = await q;
  const hit = rows.find((r) => norm(r.section) === key);
  if (hit) return { sectionId: hit.section_code, actCd: parseInt(hit.act_sec_cd, 10) || null, recovered: false };

  const keyPad = padNormSection(label);
  const padHit = rows.find((r) => padNormSection(r.section) === keyPad);
  if (padHit) return { sectionId: padHit.section_code, actCd: parseInt(padHit.act_sec_cd, 10) || null, recovered: true };

  if (actCds.length) {
    // Scoped miss — try unscoped as a last resort (label match alone, then zero-pad match).
    // FIX 6: the exact-match anyRow lookup stays a live indexed query (unchanged); only the
    // unscoped full-table scan feeding the zero-pad fallback match is memoized per trx.
    const anyRow = await trx('ref.sections').whereRaw('LOWER(section) = ?', [key]).first();
    if (anyRow) return { sectionId: anyRow.section_code, actCd: parseInt(anyRow.act_sec_cd, 10) || null, recovered: false };
    const anyRows = await loadAllSectionsCached(trx);
    const anyPadHit = anyRows.find((r) => padNormSection(r.section) === keyPad);
    if (anyPadHit) return { sectionId: anyPadHit.section_code, actCd: parseInt(anyPadHit.act_sec_cd, 10) || null, recovered: true };
    return { sectionId: null, actCd: null, recovered: false };
  }
  return { sectionId: null, actCd: null, recovered: false };
}

// ── T4 (03-TRIAGE-MATRIX.md) — conservative-tier tolerant matching ──────────────────────
// trim/collapse + case-fold already happen in `norm()` above. This adds ONE more step:
// strip punctuation/whitespace entirely and accept a match ONLY when exactly one reference
// row's stripped label is a substring of (or contains) the stripped input — never a fuzzy/
// Levenshtein distance anywhere (a false match in police records is worse than a rejection).
// Ambiguous (>1 candidate) or no candidate at all -> null, same as an exact-match miss.
const stripPunctWs = (s) => norm(s).replace(/[^a-z0-9]/g, '');

// FIX 6 (2026-07) — per-transaction memoization of the FALLBACK full-table scans only (the
// exact-match `.first()` lookups above stay live DB queries, unchanged — swapping one of those
// for an in-JS `.find()` over a cached table could return a different row when a label isn't
// unique, since Postgres's "first" row for an unordered query and an array's "first" element
// are not guaranteed to agree; that would violate "keep the exact matching TIERS and results
// identical", so only the genuinely expensive unscoped-fallback loads (looseMatchOne's rows,
// resolveSection's unscoped anyRows, resolveBeat's per-PS candidates) are cached). A single
// import batch resolves the same act/section/head/beat labels across potentially hundreds of
// rows — before this, a batch where every row missed the exact-match tier re-scanned the whole
// ref.* table from scratch on every single row. Keyed by the `trx`/`db` object itself via
// WeakMap: no TTL needed (ref.* only changes via `npm run load-ref`, never mid-batch) and the
// entry is naturally freed when the transaction object is garbage-collected — no explicit
// cleanup call needed at commit/rollback.
const fallbackCache = new WeakMap();

function getFallbackBucket(trx) {
  let bucket = fallbackCache.get(trx);
  if (!bucket) {
    bucket = { sections: null, majorHeads: null, minorHeads: null, localHeads: null, beatsByPs: new Map() };
    fallbackCache.set(trx, bucket);
  }
  return bucket;
}

async function loadAllSectionsCached(trx) {
  const bucket = getFallbackBucket(trx);
  if (!bucket.sections) {
    bucket.sections = await trx('ref.sections').select('section_code', 'section', 'act_sec_cd');
  }
  return bucket.sections;
}

async function loadAllMajorHeadsCached(trx) {
  const bucket = getFallbackBucket(trx);
  if (!bucket.majorHeads) {
    bucket.majorHeads = await trx('ref.major_heads').select('major_head_code', 'major_head');
  }
  return bucket.majorHeads;
}

async function loadAllMinorHeadsCached(trx) {
  const bucket = getFallbackBucket(trx);
  if (!bucket.minorHeads) {
    bucket.minorHeads = await trx('ref.minor_heads').select('minor_head_cd', 'minor_head', 'major_head_code');
  }
  return bucket.minorHeads;
}

async function loadAllLocalHeadsCached(trx) {
  const bucket = getFallbackBucket(trx);
  if (!bucket.localHeads) {
    bucket.localHeads = await trx('ref.local_heads').select('local_head_cd', 'local_head');
  }
  return bucket.localHeads;
}

async function loadBeatsForPsCached(trx, psId) {
  const bucket = getFallbackBucket(trx);
  if (!bucket.beatsByPs.has(psId)) {
    bucket.beatsByPs.set(psId, await trx('ref.beats').where({ ps_id: psId }).select('beat_cd', 'beat_name'));
  }
  return bucket.beatsByPs.get(psId);
}

function looseMatchOne(rows, labelCol, valueCol, input) {
  const a = stripPunctWs(input);
  if (!a) return null;
  const candidates = rows.filter((r) => {
    const b = stripPunctWs(r[labelCol]);
    return b && (a.includes(b) || b.includes(a));
  });
  return candidates.length === 1 ? candidates[0][valueCol] : null;
}

/** Returns `{ id, recovered }` — `recovered:true` means the exact-match query missed and the
 * value only resolved via the noise-strip/substring fallback (or, for minor head, the
 * major-head-unscoped fallback) — callers (import.validate.js) use this to leave the
 * mandatory WARNING trail T4 requires (no silent auto-fix). The write path
 * (records.mapper.js) only ever consumes `.id` — a recovered match is strictly better than
 * the previous NULL, no different in kind from an exact one once resolved. */
export async function resolveMajorHead(trx, label) {
  if (!label) return { id: null, recovered: false };
  const row = await trx('ref.major_heads').whereRaw('LOWER(major_head) = ?', [norm(label)]).first();
  if (row) return { id: row.major_head_code, recovered: false };
  const rows = await loadAllMajorHeadsCached(trx);
  const id = looseMatchOne(rows, 'major_head', 'major_head_code', label);
  return { id, recovered: id != null };
}

export async function resolveMinorHead(trx, label, majorHeadCode = null) {
  if (!label) return { id: null, recovered: false };
  const key = norm(label);
  let q = trx('ref.minor_heads').whereRaw('LOWER(minor_head) = ?', [key]);
  if (majorHeadCode) q = q.andWhere('major_head_code', majorHeadCode);
  const row = await q.first();
  if (row) return { id: row.minor_head_cd, recovered: false };
  // FIX 6: both the unscoped exact-match check and the looseMatch candidate rows are served
  // from ONE cached full-table load, filtered in JS by majorHeadCode where the original
  // queries were scoped — same result set as the two separate live queries this replaces.
  const allRows = await loadAllMinorHeadsCached(trx);
  if (majorHeadCode) {
    const anyRow = allRows.find((r) => norm(r.minor_head) === key);
    if (anyRow) return { id: anyRow.minor_head_cd, recovered: true };
  }
  const scopedRows = majorHeadCode ? allRows.filter((r) => r.major_head_code === majorHeadCode) : allRows;
  const id = looseMatchOne(scopedRows, 'minor_head', 'minor_head_cd', label);
  return { id, recovered: id != null };
}

export async function resolveLocalHead(trx, label) {
  if (!label) return { id: null, recovered: false };
  const row = await trx('ref.local_heads').whereRaw('LOWER(local_head) = ?', [norm(label)]).first();
  if (row) return { id: row.local_head_cd, recovered: false };
  const rows = await loadAllLocalHeadsCached(trx);
  const id = looseMatchOne(rows, 'local_head', 'local_head_cd', label);
  return { id, recovered: id != null };
}

/** T3 (03-TRIAGE-MATRIX.md) — PS-aware beat matching. Exact match first (unchanged); then,
 * scoped to the batch's target PS (`psId` — omitted entirely by non-import callers, which
 * simply never get the fallback), extract the leading numeric token from `ref.beats.beat_name`
 * ("06-MRS Yamuna Bank") and compare it (leading-zero-insensitive) to a bare operator-typed
 * number ("6"). Global (unscoped) bare-number matching is deliberately NOT offered — the same
 * number collides across many PSs (confirmed by the ref-probe: 100% of bare-number beats were
 * `leading_number_match_ambiguous_needs_ps_scope` unscoped) — PS-scoping is what turns an
 * ambiguous match into a safe, unique one. */
export async function resolveBeat(trx, label, psId = null) {
  if (!label) return { id: null, recovered: false };
  const row = await trx('ref.beats').whereRaw('LOWER(beat_name) = ?', [norm(label)]).first();
  if (row) return { id: row.beat_cd, recovered: false };
  if (!psId) return { id: null, recovered: false };

  const numMatch = String(label).trim().match(/^0*(\d+)$/);
  if (!numMatch) return { id: null, recovered: false };
  const num = numMatch[1];
  const candidates = await loadBeatsForPsCached(trx, psId);
  const hit = candidates.find((r) => {
    const m = String(r.beat_name || '').match(/^0*(\d+)\s*-/);
    return m && m[1] === num;
  });
  return { id: hit ? hit.beat_cd : null, recovered: !!hit };
}

/** property_major_category / property_minor_category submit the numeric code as a string
 * already (fields.controller.js's option `value` is `String(parent_cd)` / `property_cd`,
 * NOT a label) — just parse, no lookup needed. */
export function resolvePropertyCategoryCode(val) {
  if (val === null || val === undefined || val === '') return null;
  const n = parseInt(val, 10);
  return Number.isNaN(n) ? null : n;
}
