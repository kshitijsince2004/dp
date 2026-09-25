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
import { ACT_GROUP_CODES } from '../fields/classification-sources.config.js';
import { getLogger } from '../../utils/logger.js';

const log = getLogger('records.normalize');

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

/** Digits-only phone/mobile, +91 and separators stripped. Empty -> null.
 *
 * C4 fix (2026-07-26 bugfix batch): the old unconditional `s.replace(/^\+?91/, '')` stripped a
 * leading "91" from ANY input, including a bare 10-digit Indian mobile number that simply
 * STARTS with 91 (a perfectly ordinary subscriber range, e.g. "9123456780") — corrupting it to
 * 8 digits. Proven live while round-tripping `arresting_officer_mobile`: POST/PUT with
 * `"9123456780"` persisted as `23456780` in `arrest_details.arresting_officer_mobile`. A "91"
 * prefix is now only treated as the country code when it's unambiguous: either an explicit `+`
 * marker, or the digit-only length is 12 (91 + a 10-digit number pasted without `+`) — a bare
 * 10-digit number is left completely untouched regardless of what it starts with. */
export function normalizePhone(val) {
  if (val === null || val === undefined || val === '') return null;
  let s = String(val).trim().replace(/[\s\-().]/g, '');
  const hasPlusPrefix = /^\+91/.test(s);
  const digitsOnly = s.replace(/\D/g, '');
  if (hasPlusPrefix || (digitsOnly.length === 12 && digitsOnly.startsWith('91'))) {
    s = s.replace(/^\+?91/, '');
  }
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
  if (s.split(FIR_LIST_SEPARATORS).filter(Boolean).length > 1) {
    log.debug('normalizeFirNo: multi-FIR list detected — returned unchanged', { raw });
    return raw;
  }
  const nums = s.match(/\d+/g);
  if (!nums || nums.length === 0) {
    log.debug('normalizeFirNo: no digits found — returned unchanged', { raw });
    return raw;
  }
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
  if (seqToken === undefined) {
    log.debug('normalizeFirNo: no sequence token resolved — returned unchanged', { raw });
    return raw;
  }
  const normalized = `${parseInt(seqToken, 10)}/${year}`;
  log.debug('normalizeFirNo: normalized', { raw, normalized, yearInferred: yearIdx < 0 });
  return normalized;
}

/** C8 (2026-07-26 bugfix batch, user ruling: "Populate fir_year on write + warn in the form") —
 * derive `fir_details.fir_year` so the schema's own `UNIQUE(ps_id, fir_year, fir_no)` constraint
 * becomes live. It was verified dead in production: `fir_year` was NULL on all 28 existing rows,
 * and Postgres treats NULL as always-distinct, so two rows with the identical `ps_id`+`fir_no`
 * coexisted with no error — the instant `fir_year` is set on both, the constraint correctly
 * rejects the second insert (verified live against an isolated pair of rows).
 * Preference order, most to least authoritative:
 *   1. The year already embedded in the canonical `fir_no` ("<seq>/<4-digit-year>", produced by
 *      normalizeFirNo above) — this is literally what the constraint keys on, so it is by
 *      definition the most correct source when present.
 *   2. `fir_date`'s year — a real, officer-entered FIR-registration date.
 *   3. `record_date` — LAST resort only. A legacy-imported or backdated FIR's `record_date` (when
 *      the row was entered into PHAROS) can be a different year than the FIR itself belongs to,
 *      and `fir_year` is now load-bearing for both this uniqueness check AND cross-format
 *      auto-linking (linkResolver.js) — a wrong year here is worse than an absent one.
 * Returns null (never guesses / never invents a year) when none of the three yields a parseable
 * 4-digit year — callers must not write null over an already-correct fir_year in that case. */
export function deriveFirYear(firNo, firDate, recordDate) {
  if (firNo) {
    const m = String(firNo).match(/\/(\d{4})$/);
    if (m) return parseInt(m[1], 10);
  }
  if (firDate) {
    const m = String(firDate).match(/^(\d{4})-/);
    if (m) return parseInt(m[1], 10);
  }
  if (recordDate) {
    const m = String(recordDate).match(/^(\d{4})-/);
    if (m) return parseInt(m[1], 10);
  }
  return null;
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
  log.debug('loadActs: loaded and cached ref.acts', { count: rows.length });
  return rows;
}

/** Lowercased set of every act label the UI's Acts & Sections dropdown can emit — the
 * `ACT_GROUP_CODES` alias names (e.g. 'IPC') PLUS every raw `ref.acts.act_long` (some of
 * which, e.g. the Aadhaar Act, contain their own commas). Used by records.mapper.js's
 * comma-fragment re-merge (B5, 2026-07-21) to know which comma-split fragments of `act_name`
 * belong back together — same cache lifetime/process-lifetime rule as loadActs/resolveAct. */
export async function loadKnownActLabels(trx) {
  if (cache.has('actLabelSet')) return cache.get('actLabelSet');
  const acts = await loadActs(trx);
  const set = new Set(Object.keys(ACT_GROUP_CODES).map(norm));
  for (const a of acts) set.add(norm(a.act_long));
  cache.set('actLabelSet', set);
  log.debug('loadKnownActLabels: built and cached known-act-label set', { size: set.size });
  return set;
}

/** C18 (2026-07-26 bugfix batch) — set of every real `ref.acts.act_cd`. `ref.sections` has
 * ~4,625 rows whose `act_sec_cd` points at NO row in `ref.acts` (verified live,
 * `docs/bugfix-batch-2026-07-26/HANDOFF.md`) — a pre-existing ref-data integrity gap, not
 * something this module can repair (CLAUDE.md: never invent `ref.*` rows). An UNSCOPED section
 * lookup (`resolveSection` with no `actCds` to filter by) can land on one of those dangling rows
 * and hand back a garbage `act_cd`; using it as `record_offences.act_id` crashes the whole write
 * with a raw FK-violation 500. This cache lets `buildOffenceRows` verify a resolved act_cd is
 * real before trusting it, same process-lifetime cache rule as `loadActs`/`loadKnownActLabels`. */
export async function loadValidActCds(trx) {
  if (cache.has('actCdSet')) return cache.get('actCdSet');
  const acts = await loadActs(trx);
  const set = new Set(acts.map((a) => a.act_cd));
  cache.set('actCdSet', set);
  log.debug('loadValidActCds: built and cached valid act_cd set', { size: set.size });
  return set;
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
  if (groupKey) {
    log.debug('resolveAct: matched group alias', { label, groupKey, actCds: ACT_GROUP_CODES[groupKey] });
    return { actId: null, actCds: ACT_GROUP_CODES[groupKey], otherActName: null };
  }

  const acts = await loadActs(trx);
  const hit = acts.find((a) => norm(a.act_long) === key);
  if (hit) {
    log.debug('resolveAct: matched ref.acts exact', { label, actId: hit.act_cd });
    return { actId: hit.act_cd, actCds: [hit.act_cd], otherActName: null };
  }

  log.debug('resolveAct: miss — falling back to free-text other_act_name', { label });
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
  if (hit) {
    log.debug('resolveSection: matched exact (scoped)', { label, actCds, sectionId: hit.section_code, recovered: false });
    return { sectionId: hit.section_code, actCd: parseInt(hit.act_sec_cd, 10) || null, recovered: false };
  }

  const keyPad = padNormSection(label);
  const padHit = rows.find((r) => padNormSection(r.section) === keyPad);
  if (padHit) {
    log.debug('resolveSection: matched zero-pad/whitespace tolerant (scoped)', { label, actCds, sectionId: padHit.section_code, recovered: true });
    return { sectionId: padHit.section_code, actCd: parseInt(padHit.act_sec_cd, 10) || null, recovered: true };
  }

  if (actCds.length) {
    // Scoped miss — try unscoped as a last resort (label match alone, then zero-pad match).
    // FIX 6: the exact-match anyRow lookup stays a live indexed query (unchanged); only the
    // unscoped full-table scan feeding the zero-pad fallback match is memoized per trx.
    log.debug('resolveSection: scoped miss — falling back to unscoped lookup', { label, actCds });
    const anyRow = await trx('ref.sections').whereRaw('LOWER(section) = ?', [key]).first();
    if (anyRow) {
      log.debug('resolveSection: matched exact (unscoped fallback)', { label, sectionId: anyRow.section_code, recovered: false });
      return { sectionId: anyRow.section_code, actCd: parseInt(anyRow.act_sec_cd, 10) || null, recovered: false };
    }
    const anyRows = await loadAllSectionsCached(trx);
    const anyPadHit = anyRows.find((r) => padNormSection(r.section) === keyPad);
    if (anyPadHit) {
      log.debug('resolveSection: matched zero-pad (unscoped fallback)', { label, sectionId: anyPadHit.section_code, recovered: true });
      return { sectionId: anyPadHit.section_code, actCd: parseInt(anyPadHit.act_sec_cd, 10) || null, recovered: true };
    }
    log.debug('resolveSection: total miss (scoped + unscoped)', { label, actCds });
    return { sectionId: null, actCd: null, recovered: false };
  }
  log.debug('resolveSection: total miss (unscoped)', { label });
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
  if (row) {
    log.debug('resolveMajorHead: matched exact', { label, id: row.major_head_code, recovered: false });
    return { id: row.major_head_code, recovered: false };
  }
  const rows = await loadAllMajorHeadsCached(trx);
  const id = looseMatchOne(rows, 'major_head', 'major_head_code', label);
  log.debug(id != null ? 'resolveMajorHead: matched loose (recovered)' : 'resolveMajorHead: miss', { label, id, recovered: id != null });
  return { id, recovered: id != null };
}

export async function resolveMinorHead(trx, label, majorHeadCode = null) {
  if (!label) return { id: null, recovered: false };
  const key = norm(label);
  let q = trx('ref.minor_heads').whereRaw('LOWER(minor_head) = ?', [key]);
  if (majorHeadCode) q = q.andWhere('major_head_code', majorHeadCode);
  const row = await q.first();
  if (row) {
    log.debug('resolveMinorHead: matched exact (scoped)', { label, majorHeadCode, id: row.minor_head_cd, recovered: false });
    return { id: row.minor_head_cd, recovered: false };
  }
  // FIX 6: both the unscoped exact-match check and the looseMatch candidate rows are served
  // from ONE cached full-table load, filtered in JS by majorHeadCode where the original
  // queries were scoped — same result set as the two separate live queries this replaces.
  const allRows = await loadAllMinorHeadsCached(trx);
  if (majorHeadCode) {
    const anyRow = allRows.find((r) => norm(r.minor_head) === key);
    if (anyRow) {
      log.debug('resolveMinorHead: matched exact (major-head-unscoped fallback, recovered)', { label, majorHeadCode, id: anyRow.minor_head_cd });
      return { id: anyRow.minor_head_cd, recovered: true };
    }
  }
  const scopedRows = majorHeadCode ? allRows.filter((r) => r.major_head_code === majorHeadCode) : allRows;
  const id = looseMatchOne(scopedRows, 'minor_head', 'minor_head_cd', label);
  log.debug(id != null ? 'resolveMinorHead: matched loose (recovered)' : 'resolveMinorHead: miss', { label, majorHeadCode, id, recovered: id != null });
  return { id, recovered: id != null };
}

export async function resolveLocalHead(trx, label) {
  if (!label) return { id: null, recovered: false };
  const row = await trx('ref.local_heads').whereRaw('LOWER(local_head) = ?', [norm(label)]).first();
  if (row) {
    log.debug('resolveLocalHead: matched exact', { label, id: row.local_head_cd, recovered: false });
    return { id: row.local_head_cd, recovered: false };
  }
  const rows = await loadAllLocalHeadsCached(trx);
  const id = looseMatchOne(rows, 'local_head', 'local_head_cd', label);
  log.debug(id != null ? 'resolveLocalHead: matched loose (recovered)' : 'resolveLocalHead: miss', { label, id, recovered: id != null });
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
  if (row) {
    log.debug('resolveBeat: matched exact', { label, id: row.beat_cd, recovered: false });
    return { id: row.beat_cd, recovered: false };
  }
  if (!psId) {
    log.debug('resolveBeat: miss — no psId to scope the bare-number fallback', { label });
    return { id: null, recovered: false };
  }

  const numMatch = String(label).trim().match(/^0*(\d+)$/);
  if (!numMatch) {
    log.debug('resolveBeat: miss — label is not a bare number, no fallback applies', { label, psId });
    return { id: null, recovered: false };
  }
  const num = numMatch[1];
  const candidates = await loadBeatsForPsCached(trx, psId);
  const hit = candidates.find((r) => {
    const m = String(r.beat_name || '').match(/^0*(\d+)\s*-/);
    return m && m[1] === num;
  });
  log.debug(hit ? 'resolveBeat: matched bare-number, PS-scoped (recovered)' : 'resolveBeat: miss — no PS-scoped bare-number candidate', { label, psId, num, id: hit ? hit.beat_cd : null });
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

/** Does this raw property-category value look like an already-resolved numeric ref code
 * (the interactive form's own option `value`), as opposed to a human label the bulk-import
 * Excel carries? "12" -> yes; "Vehicle" / "12-inch" -> no. Kept strict (whole-string integer)
 * so a label that merely starts with a digit still takes the lookup branch. */
function isNumericCode(val) {
  const s = String(val).trim();
  return s !== '' && /^\d+$/.test(s);
}

/** Resolve a property MAJOR category to `record_properties.major_category_id`
 * (FK -> ref.property_categories.parent_cd). The interactive form already submits the numeric
 * code (returned as-is); bulk import submits the category LABEL ("Vehicle", "Mobile Phone", …
 * the frozen template's dropdown text = ref.property_categories.code_type), which needs a
 * lookup. Before this, the label was integer-coerced to null and the property's category was
 * silently dropped on every import (reported 2026-07-21 "property category/type not parsed"). */
export async function resolvePropertyMajorCategory(trx, val) {
  if (val === null || val === undefined || val === '') return null;
  if (isNumericCode(val)) {
    log.debug('resolvePropertyMajorCategory: already a numeric ref code — passthrough', { val });
    return parseInt(val, 10);
  }
  const row = await trx('ref.property_categories').whereRaw('LOWER(code_type) = ?', [norm(val)]).first();
  log.debug(row ? 'resolvePropertyMajorCategory: resolved label to ref code' : 'resolvePropertyMajorCategory: miss — label unmatched, category dropped', { val, id: row?.parent_cd ?? null });
  return row ? row.parent_cd : null;
}

/** Resolve a property MINOR category ("Type of property") to
 * `record_properties.minor_category_id` (FK -> ref.other_property_items.property_cd). Numeric
 * code passes through (form); a label is looked up against ref.other_property_items.property.
 * Only the DEFAULT other_property_items branch resolves here — arms/drugs/jewelry/currency/
 * document/electric/vehicle subtypes have their OWN dedicated `record_properties` columns
 * (fire_arm_id, arms_subtype_id, drug_type_id, ...) and are resolved by
 * `resolvePropertyTypeColumn` below against their OWN ref tables — never written into
 * `minor_category_id` itself (that FKs only to `ref.other_property_items`; a drug/arms ref code
 * written there would be a dangling FK, the exact class of bug C18 fixed for `record_offences`). */
export async function resolvePropertyMinorCategory(trx, val) {
  if (val === null || val === undefined || val === '') return null;
  if (isNumericCode(val)) {
    log.debug('resolvePropertyMinorCategory: already a numeric ref code — passthrough', { val });
    return parseInt(val, 10);
  }
  const row = await trx('ref.other_property_items').whereRaw('LOWER(property) = ?', [norm(val)]).first();
  log.debug(row ? 'resolvePropertyMinorCategory: resolved label to ref code' : 'resolvePropertyMinorCategory: miss — label unmatched, category dropped', { val, id: row?.property_cd ?? null });
  return row ? row.property_cd : null;
}

/** C9 (2026-07-26 bugfix batch) — the type-specific property columns
 * (`fire_arm_id`/`arms_subtype_id`/`drug_type_id`/`jewelry_type_id`/`currency_type_id`/
 * `document_type_id`/`electric_good_id`/`automobile_id`) each FK to their OWN dedicated ref
 * table, separate from `minor_category_id`/`ref.other_property_items`. The interactive form
 * submits the numeric ref code directly for these (no resolution needed — passthrough); bulk
 * import submits the frozen template's dropdown LABEL text, which had NO resolution path at all
 * before this — `coerceByType`'s integer branch just `parseInt`'d the label to NaN -> null,
 * silently dropping the type on every arms/drugs/jewelry/... import row (most of what the
 * tester's "PROPERTY Category nhi aaya" meant — proven against a real ARREST sample sheet where
 * 11/15 filled property rows were DRUGS/ARMS). Each ref table here is a flat `{code, label}`
 * pair with no cross-table ambiguity (a fire_arms label and a drug_types label don't collide,
 * and each `record_properties` column already implies exactly one ref table via its own
 * field_registry mapping — see config/fields/common.json's prop_fire_arms_type/prop_drug_type/
 * etc), so no major-category scoping is needed to disambiguate which table to search, unlike
 * `resolveSection`'s act-scoping. `explosive_type_id`/`cultural_property_id`/`arms_made_id` are
 * deliberately NOT in this map — no field_registry row maps to them today (verified across every
 * config/fields/*.json), so they are unreachable dead columns; adding untested resolution for
 * columns nothing ever populates would be unjustified scope creep. */
const PROPERTY_TYPE_REF_TABLES = {
  fire_arm_id: { table: 'ref.fire_arms', idCol: 'fire_arms_cd', labelCol: 'fire_arms' },
  arms_subtype_id: { table: 'ref.fire_arms_subtypes', idCol: 'arms_subtype_cd', labelCol: 'arms_subtype' },
  drug_type_id: { table: 'ref.drug_types', idCol: 'drug_type_cd', labelCol: 'drug_type' },
  jewelry_type_id: { table: 'ref.jewelry_types', idCol: 'jewelry_type_cd', labelCol: 'jewelry_type' },
  currency_type_id: { table: 'ref.currency_types', idCol: 'currency_type_cd', labelCol: 'currency_type' },
  document_type_id: { table: 'ref.document_types', idCol: 'document_type_cd', labelCol: 'document_type' },
  electric_good_id: { table: 'ref.electric_goods', idCol: 'electric_goods_cd', labelCol: 'electric_goods' },
  automobile_id: { table: 'ref.automobiles', idCol: 'automobile_cd', labelCol: 'automobile' },
};

export function isDeferredPropertyTypeColumn(column) {
  return Object.prototype.hasOwnProperty.call(PROPERTY_TYPE_REF_TABLES, column);
}

/** Resolve one of the type-specific property columns above (numeric passthrough, or a label
 * lookup against that column's own dedicated ref table). Returns null — never a dangling id —
 * on a miss; the caller drops the column entirely, same "omit rather than write a bogus FK"
 * contract as resolvePropertyMajorCategory/resolvePropertyMinorCategory. */
export async function resolvePropertyTypeColumn(trx, column, val) {
  if (val === null || val === undefined || val === '') return null;
  if (isNumericCode(val)) {
    log.debug('resolvePropertyTypeColumn: already a numeric ref code — passthrough', { column, val });
    return parseInt(val, 10);
  }
  const spec = PROPERTY_TYPE_REF_TABLES[column];
  if (!spec) return null;
  const row = await trx(spec.table).whereRaw(`LOWER(${spec.labelCol}) = ?`, [norm(val)]).first();
  log.debug(row ? 'resolvePropertyTypeColumn: resolved label to ref code' : 'resolvePropertyTypeColumn: miss — label unmatched, dropped', { column, val, id: row?.[spec.idCol] ?? null });
  return row ? row[spec.idCol] : null;
}
