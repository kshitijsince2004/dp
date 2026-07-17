#!/usr/bin/env node
// probe-ref-match.mjs — Import Reliability Framework, tool 4/5.
//
// Input: out/OPERATOR_BEHAVIOUR.json's REF_BACKED_KEYS columns (distinct operator-typed
// values, already aggregated by analyze_behaviour.py — this tool does NOT re-read the raw
// xlsx extractions, one source of truth per pipeline stage). For each distinct value of
// beat / IO PIS / district / police station / local head / major head / minor head /
// sections / act, replays the SAME resolver the real write path uses
// (backend/src/modules/records/records.normalize.js's resolveBeat/resolveLocalHead/
// resolveMajorHead/resolveMinorHead/resolveSection/resolveAct) plus a small set of tolerant
// variants (trim/case-fold — already inside every resolver; PS-scoped + unscoped leading-
// number match for beats; substring-after-stripping-noise-words for district/PS, mirroring
// import.validate.js's checkPsMismatch normalization), so "should we auto-recover X?" turns
// into a number instead of a debate (00-EXECUTION-PLAN.md §3, tool 4's stated purpose).
//
// READ-ONLY QUERIES ONLY. Never writes. Library/CLI split (Framework design rule #4): every
// resolver-cascade function is exported; the CLI wrapper is the `import.meta.url` guard at
// the bottom, so a future in-backend "recoverability advisor" endpoint can import
// `probeBeat`/`probeDistrictOrPs`/etc. directly.
//
// Run from backend/ (so .env / knex resolve, same convention as every other script here):
//   node ../scripts/import-reliability/probe-ref-match.mjs
// or via the sibling npm script once added.

import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import db from '../../src/config/db.js';
import {
  resolveAct, resolveSection, resolveMajorHead, resolveMinorHead, resolveLocalHead, resolveBeat,
} from '../../src/modules/records/records.normalize.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const SCHEMA_VERSION = '1.0.0';
const TOOL_NAME = 'probe-ref-match.mjs';
const TOOL_VERSION = '1.0.0';

// Maps every REF_BACKED_KEYS column (analyze_behaviour.py) to the ref-type "kind" it's
// logically the same namespace as — e.g. `district`, `arrested_district`, `victim_district`
// are all just "a district name the operator typed", tested against the same hierarchy_nodes
// DISTRICT rows. Merged here so a beat/district/PS typed once across many columns is only
// queried once.
const KIND_BY_KEY = {
  beat_number: 'beat', beat_no: 'beat',
  local_head: 'local_head',
  crime_head: 'major_head', // the Act & Sections sheet's field_key for the "Major Head" column (verified against a real sample file, 2026-07-16)
  minor_head: 'minor_head',
  sections: 'sections',
  act: 'act',
  io_pis: 'io_pis',
  district: 'district', arrested_district: 'district', arrested_perm_district: 'district',
  accused_district: 'district', accused_perm_district: 'district', victim_district: 'district',
  complainant_district: 'district', complainant_perm_district: 'district', occurrence_district: 'district',
  police_station: 'police_station', arrested_police_station: 'police_station',
  arrested_perm_police_station: 'police_station', accused_police_station: 'police_station',
  accused_perm_police_station: 'police_station', occurrence_police_station: 'police_station',
};

const norm = (s) => String(s ?? '').trim().toLowerCase();

/** Same noise-stripping normalization as import.validate.js's checkPsMismatch — used here for
 * the district/PS tolerant-match rule (substring match after stripping "District"/"PS"/
 * parenthetical codes/punctuation). */
const stripNoise = (s) => norm(s)
  .replace(/\(.*?\)/g, '').replace(/\bdistrict\b/g, '').replace(/\bps\b/g, '')
  .replace(/[^a-z0-9]/g, '');

function collectDistinctValues(behaviour) {
  const byKind = {}; // kind -> Map<value, count>
  for (const rt of Object.values(behaviour.record_types || {})) {
    for (const sheet of Object.values(rt.sheets || {})) {
      for (const [colKey, col] of Object.entries(sheet.columns || {})) {
        const kind = KIND_BY_KEY[colKey];
        if (!kind || !col.distinct_values) continue;
        if (!byKind[kind]) byKind[kind] = new Map();
        for (const { value, count } of col.distinct_values) {
          byKind[kind].set(value, (byKind[kind].get(value) || 0) + count);
        }
      }
    }
  }
  return byKind;
}

// ── per-ref-type probes (exported — library/CLI split) ─────────────────────────────────────

export async function probeBeat(trx, value) {
  const { id: exactId } = await resolveBeat(trx, value);
  if (exactId) return { exact: true, recovered_by: null, unknown: false };

  // Tolerant rule: ref.beats.beat_name is "NN-Description" (e.g. "06-MRS Yamuna Bank");
  // operators frequently type the bare number. Extract the leading numeric token from every
  // beat_name and compare (leading-zero-insensitive) to the operator's value.
  const numMatch = String(value).trim().match(/^0*(\d+)$/);
  if (!numMatch) return { exact: false, recovered_by: null, unknown: true };
  const num = numMatch[1];

  const rows = await trx('ref.beats').select('beat_cd', 'beat_name', 'ps_id');
  const candidates = rows.filter((r) => {
    const m = String(r.beat_name || '').match(/^0*(\d+)\s*-/);
    return m && m[1] === num;
  });
  if (candidates.length === 0) return { exact: false, recovered_by: null, unknown: true };

  const withPs = candidates.filter((c) => c.ps_id);
  if (candidates.length === 1) {
    return {
      exact: false,
      recovered_by: candidates[0].ps_id ? 'leading_number_match_unique' : 'leading_number_match_unique_but_ref_gap',
      unknown: false,
      ref_gap: !candidates[0].ps_id,
    };
  }
  // Multiple beats share this leading number across different PSs — recoverable only with
  // PS-scoping (real batch has a target PS; this aggregate probe does not), so it's a
  // "recoverable-in-principle, needs PS context" finding, not a clean auto-recovery.
  return {
    exact: false,
    recovered_by: 'leading_number_match_ambiguous_needs_ps_scope',
    unknown: false,
    candidate_count: candidates.length,
    ref_gap: withPs.length === 0,
  };
}

export async function probeLocalHead(trx, value) {
  const { id, recovered } = await resolveLocalHead(trx, value);
  if (!id) return { exact: false, recovered_by: null, unknown: true };
  return recovered ? { exact: false, recovered_by: 'noise_strip_substring', unknown: false } : { exact: true, recovered_by: null, unknown: false };
}

export async function probeMajorHead(trx, value) {
  const { id, recovered } = await resolveMajorHead(trx, value);
  if (!id) return { exact: false, recovered_by: null, unknown: true };
  return recovered ? { exact: false, recovered_by: 'noise_strip_substring', unknown: false } : { exact: true, recovered_by: null, unknown: false };
}

export async function probeMinorHead(trx, value) {
  // Unscoped (no paired major_head at this aggregate-distinct-value level — a real limitation,
  // documented in the output's `inputs` block) — same resolver, majorHeadCode omitted.
  const { id, recovered } = await resolveMinorHead(trx, value, null);
  if (!id) return { exact: false, recovered_by: null, unknown: true };
  return recovered ? { exact: false, recovered_by: 'noise_strip_substring', unknown: false } : { exact: true, recovered_by: null, unknown: false };
}

export async function probeSections(trx, value) {
  // Unscoped (no paired act at this aggregate level, same limitation as minor_head).
  const { sectionId, recovered } = await resolveSection(trx, value, []);
  if (!sectionId) return { exact: false, recovered_by: null, unknown: true };
  return recovered ? { exact: false, recovered_by: 'zero_pad_whitespace', unknown: false } : { exact: true, recovered_by: null, unknown: false };
}

export async function probeAct(trx, value) {
  const { actId, actCds, otherActName } = await resolveAct(trx, value);
  if (actId != null || (actCds && actCds.length)) return { exact: true, recovered_by: null, unknown: false };
  // resolveAct never truly fails — free text always falls back to otherActName (P2: reject
  // only the impossible). Report that explicitly rather than calling it "unknown".
  return { exact: false, recovered_by: 'stored_as_free_text_other_act_name', unknown: false, free_text: otherActName };
}

let _hierarchyCache = null;
async function loadHierarchy(trx, nodeType) {
  if (!_hierarchyCache) _hierarchyCache = {};
  if (_hierarchyCache[nodeType]) return _hierarchyCache[nodeType];
  const rows = await trx('hierarchy_nodes').where({ node_type: nodeType, is_active: true }).select('id', 'name');
  _hierarchyCache[nodeType] = rows;
  return rows;
}

export async function probeDistrictOrPs(trx, value, nodeType) {
  const rows = await loadHierarchy(trx, nodeType);
  const exact = rows.find((r) => norm(r.name) === norm(value));
  if (exact) return { exact: true, recovered_by: null, unknown: false };

  const a = stripNoise(value);
  if (!a) return { exact: false, recovered_by: null, unknown: true };
  const candidates = rows.filter((r) => {
    const b = stripNoise(r.name);
    return b && (a.includes(b) || b.includes(a));
  });
  if (candidates.length === 1) return { exact: false, recovered_by: 'substring_after_noise_strip', unknown: false };
  if (candidates.length > 1) return { exact: false, recovered_by: 'substring_after_noise_strip_ambiguous', unknown: false, candidate_count: candidates.length };
  return { exact: false, recovered_by: null, unknown: true };
}

let _ioCache = null;
async function loadIos(trx) {
  if (_ioCache) return _ioCache;
  const rows = await trx('investigating_officers').select('id', 'pis_no', 'ps_id');
  _ioCache = rows;
  return rows;
}

export async function probeIoPis(trx, value) {
  const rows = await loadIos(trx);
  const hit = rows.find((r) => r.pis_no && norm(r.pis_no) === norm(value));
  return hit ? { exact: true, recovered_by: null, unknown: false } : { exact: false, recovered_by: null, unknown: true };
}

const PROBES = {
  beat: (trx, v) => probeBeat(trx, v),
  local_head: (trx, v) => probeLocalHead(trx, v),
  major_head: (trx, v) => probeMajorHead(trx, v),
  minor_head: (trx, v) => probeMinorHead(trx, v),
  sections: (trx, v) => probeSections(trx, v),
  act: (trx, v) => probeAct(trx, v),
  district: (trx, v) => probeDistrictOrPs(trx, v, 'DISTRICT'),
  police_station: (trx, v) => probeDistrictOrPs(trx, v, 'PS'),
  io_pis: (trx, v) => probeIoPis(trx, v),
};

/** Row counts for the reference tables every probe above depends on. Critical for reading
 * the io_pis / beat numbers correctly: a 0% recoverability on io_pis does NOT mean "every
 * operator-typed PIS number is garbage" — as of this run, `investigating_officers` has 0 rows
 * in the dev DB, so NOTHING could possibly match (a reference-AVAILABILITY gap, not an
 * operator-error signal). Same category of caveat the handoff mandated for the 765 beats with
 * `ps_id IS NULL` (report them separately) — this generalizes that to every ref table probed,
 * so "0% recoverable" is never silently misread as "0% of operators typed this correctly". */
async function loadReferenceTableRowCounts(trx) {
  const [beats, beatsNullPs, ios, districts, pss, localHeads, majorHeads, minorHeads, sections, acts] = await Promise.all([
    trx('ref.beats').count('* as c').first(),
    trx('ref.beats').whereNull('ps_id').count('* as c').first(),
    trx('investigating_officers').count('* as c').first(),
    trx('hierarchy_nodes').where({ node_type: 'DISTRICT', is_active: true }).count('* as c').first(),
    trx('hierarchy_nodes').where({ node_type: 'PS', is_active: true }).count('* as c').first(),
    trx('ref.local_heads').count('* as c').first(),
    trx('ref.major_heads').count('* as c').first(),
    trx('ref.minor_heads').count('* as c').first(),
    trx('ref.sections').count('* as c').first(),
    trx('ref.acts').count('* as c').first(),
  ]);
  return {
    'ref.beats': { total: Number(beats.c), ps_id_null: Number(beatsNullPs.c) },
    investigating_officers: { total: Number(ios.c) },
    'hierarchy_nodes(DISTRICT)': { total: Number(districts.c) },
    'hierarchy_nodes(PS)': { total: Number(pss.c) },
    'ref.local_heads': { total: Number(localHeads.c) },
    'ref.major_heads': { total: Number(majorHeads.c) },
    'ref.minor_heads': { total: Number(minorHeads.c) },
    'ref.sections': { total: Number(sections.c) },
    'ref.acts': { total: Number(acts.c) },
  };
}

export async function runProbe(trx, byKind) {
  const refTypes = {};
  for (const [kind, valueMap] of Object.entries(byKind)) {
    const probeFn = PROBES[kind];
    if (!probeFn) continue;
    const values = [];
    let exact = 0, unknown = 0;
    const byRule = {};
    let refGapCount = 0;

    // Deterministic order: sort by value string.
    const sortedEntries = [...valueMap.entries()].sort((a, b) => (a[0] < b[0] ? -1 : a[0] > b[0] ? 1 : 0));
    for (const [value, count] of sortedEntries) {
      const verdict = await probeFn(trx, value);
      if (verdict.exact) exact += count;
      else if (verdict.unknown) unknown += count;
      else {
        byRule[verdict.recovered_by] = (byRule[verdict.recovered_by] || 0) + count;
      }
      if (verdict.ref_gap) refGapCount += count;
      values.push({ value, count, ...verdict });
    }

    const total = exact + unknown + Object.values(byRule).reduce((a, b) => a + b, 0);
    refTypes[kind] = {
      total_distinct_values: valueMap.size,
      total_occurrences: total,
      exact,
      recovered_by_rule: byRule,
      unknown,
      unmatched_because_ref_gap: refGapCount,
      recoverability_pct: total ? Math.round(((exact + Object.values(byRule).reduce((a, b) => a + b, 0)) / total) * 10000) / 100 : 0,
      values,
    };
  }
  return refTypes;
}

function renderMarkdown(report) {
  const lines = ['# Reference Match Report', '', `Generated: ${report.generated_at}`, ''];
  for (const [kind, data] of Object.entries(report.ref_types)) {
    lines.push(`## ${kind}`);
    lines.push('');
    lines.push(`- Distinct values: ${data.total_distinct_values} (${data.total_occurrences} occurrences)`);
    lines.push(`- Exact match: ${data.exact}`);
    for (const [rule, count] of Object.entries(data.recovered_by_rule)) {
      lines.push(`- Recovered by \`${rule}\`: ${count}`);
    }
    lines.push(`- Unknown: ${data.unknown}`);
    if (data.unmatched_because_ref_gap) lines.push(`- Of which, blocked by ref-data gap (ps_id NULL etc): ${data.unmatched_because_ref_gap}`);
    if (data.reference_table) lines.push(`- Backing table \`${data.reference_table}\`: ${data.reference_table_row_count.total} rows`);
    lines.push(`- **Recoverability: ${data.recoverability_pct}%**`);
    if (data.caveat) lines.push(`- ⚠ **${data.caveat}**`);
    lines.push('');
  }
  return lines.join('\n') + '\n';
}

const REF_TABLE_BY_KIND = {
  beat: 'ref.beats', io_pis: 'investigating_officers', district: 'hierarchy_nodes(DISTRICT)',
  police_station: 'hierarchy_nodes(PS)', local_head: 'ref.local_heads', major_head: 'ref.major_heads',
  minor_head: 'ref.minor_heads', sections: 'ref.sections', act: 'ref.acts',
};

export async function run({ behaviourPath, outDir }) {
  const now = new Date().toISOString();
  const behaviour = JSON.parse(fs.readFileSync(behaviourPath, 'utf8'));
  const byKind = collectDistinctValues(behaviour);

  const refTypes = await runProbe(db, byKind);
  const referenceTableRowCounts = await loadReferenceTableRowCounts(db);

  // Attach the backing table's row count directly onto each ref_type entry — a 0%/low
  // recoverability number should never be read without this sitting right next to it.
  for (const [kind, data] of Object.entries(refTypes)) {
    const tableKey = REF_TABLE_BY_KIND[kind];
    if (tableKey && referenceTableRowCounts[tableKey]) {
      data.reference_table = tableKey;
      data.reference_table_row_count = referenceTableRowCounts[tableKey];
      if (referenceTableRowCounts[tableKey].total === 0) {
        data.caveat = `${tableKey} has 0 rows in this DB — recoverability here measures reference-table EMPTINESS, not operator-typed value quality.`;
      }
    }
  }

  const report = {
    schema_version: SCHEMA_VERSION,
    generated_at: now,
    tool: TOOL_NAME,
    tool_version: TOOL_VERSION,
    inputs: {
      behaviour_report: path.resolve(behaviourPath),
      note: 'minor_head/sections probed UNSCOPED (no paired major_head/act at this aggregate-distinct-value level) — a real precision limitation vs. the live per-row validator, documented here rather than silently hidden.',
      reference_table_row_counts: referenceTableRowCounts,
    },
    ref_types: refTypes,
  };

  fs.mkdirSync(outDir, { recursive: true });
  const jsonPath = path.join(outDir, 'REF_MATCH_REPORT.json');
  fs.writeFileSync(jsonPath, JSON.stringify(report, null, 2));
  const mdPath = path.join(outDir, 'REF_MATCH_REPORT.md');
  fs.writeFileSync(mdPath, renderMarkdown(report));

  console.log(`Wrote ${jsonPath}`);
  console.log(`Wrote ${mdPath}`);
  return report;
}

const isMain = import.meta.url === `file://${process.argv[1]}`;
if (isMain) {
  const args = process.argv.slice(2);
  const getArg = (name, def) => {
    const i = args.indexOf(`--${name}`);
    return i >= 0 ? args[i + 1] : def;
  };
  const behaviourPath = getArg('behaviour', path.join(__dirname, 'out', 'OPERATOR_BEHAVIOUR.json'));
  const outDir = getArg('out-dir', path.join(__dirname, 'out'));

  run({ behaviourPath, outDir })
    .then(() => db.destroy())
    .then(() => process.exit(0))
    .catch((err) => {
      console.error('probe-ref-match failed:', err.message);
      db.destroy().finally(() => process.exit(1));
    });
}
