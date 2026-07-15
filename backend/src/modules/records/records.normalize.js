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

/** dd/mm/yyyy | dd-mm-yyyy | yyyy-mm-dd | Date -> ISO yyyy-mm-dd for native DATE columns. */
export function normalizeDate(val) {
  if (val === null || val === undefined || val === '') return null;
  return toISO(val);
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
export async function resolveSection(trx, label, actCds = []) {
  if (!label) return { sectionId: null, actCd: null };
  const key = norm(label);
  let q = trx('ref.sections').select('section_code', 'section', 'act_sec_cd');
  if (actCds.length) q = q.whereIn('act_sec_cd', actCds.map(String));
  const rows = await q;
  const hit = rows.find((r) => norm(r.section) === key);
  if (hit) return { sectionId: hit.section_code, actCd: parseInt(hit.act_sec_cd, 10) || null };
  if (actCds.length) {
    // Scoped miss — try unscoped as a last resort (label match alone).
    const anyRow = await trx('ref.sections').whereRaw('LOWER(section) = ?', [key]).first();
    return anyRow ? { sectionId: anyRow.section_code, actCd: parseInt(anyRow.act_sec_cd, 10) || null } : { sectionId: null, actCd: null };
  }
  return { sectionId: null, actCd: null };
}

export async function resolveMajorHead(trx, label) {
  if (!label) return null;
  const row = await trx('ref.major_heads').whereRaw('LOWER(major_head) = ?', [norm(label)]).first();
  return row?.major_head_code ?? null;
}

export async function resolveMinorHead(trx, label, majorHeadCode = null) {
  if (!label) return null;
  let q = trx('ref.minor_heads').whereRaw('LOWER(minor_head) = ?', [norm(label)]);
  if (majorHeadCode) q = q.andWhere('major_head_code', majorHeadCode);
  const row = await q.first();
  if (row) return row.minor_head_cd;
  if (majorHeadCode) {
    const anyRow = await trx('ref.minor_heads').whereRaw('LOWER(minor_head) = ?', [norm(label)]).first();
    return anyRow?.minor_head_cd ?? null;
  }
  return null;
}

export async function resolveLocalHead(trx, label) {
  if (!label) return null;
  const row = await trx('ref.local_heads').whereRaw('LOWER(local_head) = ?', [norm(label)]).first();
  return row?.local_head_cd ?? null;
}

export async function resolveBeat(trx, label) {
  if (!label) return null;
  // beat_no's option value is beat_name (fields.controller.js toValueLabel('beat_name')).
  const row = await trx('ref.beats').whereRaw('LOWER(beat_name) = ?', [norm(label)]).first();
  return row?.beat_cd ?? null;
}

/** property_major_category / property_minor_category submit the numeric code as a string
 * already (fields.controller.js's option `value` is `String(parent_cd)` / `property_cd`,
 * NOT a label) — just parse, no lookup needed. */
export function resolvePropertyCategoryCode(val) {
  if (val === null || val === undefined || val === '') return null;
  const n = parseInt(val, 10);
  return Number.isNaN(n) ? null : n;
}
