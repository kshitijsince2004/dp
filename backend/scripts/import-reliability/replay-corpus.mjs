#!/usr/bin/env node
// replay-corpus.mjs — Import Reliability Framework, tool 5/5.
//
// Runs the REAL backend/src/modules/import/import.parse.js's readWorkbook() +
// import.validate.js's validateBatch() over every file in corpus.manifest.json (the growable
// registry — NOT a hardcoded directory glob), exactly as import.service.js's createBatch()
// does at validate time, EXCEPT it stops before any write: no `import_batches` row, no
// `import_batch_errors` insert, no confirm, no createImportedRecord call. Every DB touch inside
// readWorkbook/validateBatch is a read (field_registry, hierarchy_nodes, ref.*,
// investigating_officers, fir_details duplicate-check) — this script adds no writes of its own
// either. This is the permanent regression baseline (00-EXECUTION-PLAN.md §3/§5): after every
// pipeline change, re-run and `--diff` against the last committed out/corpus-baseline.json.
//
// Library/CLI split (Framework design rule #4): replayOneFile()/replayCorpus()/diffBaselines()
// are exported for a future CI step to import directly; the CLI wrapper is the
// `import.meta.url` guard at the bottom.
//
// Run from backend/ (env/knex resolution, same convention as every other script here):
//   node scripts/import-reliability/replay-corpus.mjs
//   node scripts/import-reliability/replay-corpus.mjs --diff scripts/import-reliability/out/corpus-baseline.json
//   node scripts/import-reliability/replay-corpus.mjs --out /tmp/run.json --diff scripts/import-reliability/out/corpus-baseline.json
// or via `npm run import:corpus` / `npm run import:corpus -- --diff out/corpus-baseline.json`.
//
// --out <path>  (added Wave B, Task 0): write this run's fresh JSON (+ sibling .md) somewhere
//   other than the default out/corpus-baseline.json — lets an exploratory run diff against the
//   committed baseline WITHOUT overwriting it. Default unchanged when omitted.
// --diff [path] : compares this run against a prior report. Reads `path` fully into memory
//   BEFORE this run writes anything (fixed Wave B, Task 0 — the old code wrote its own output
//   first, so pointing --diff at the same path this run writes to always diffed the fresh
//   report against itself). Given with no path, defaults to out/corpus-baseline.json — the
//   committed baseline, which is a DIFFERENT file than whatever --out redirected this run's own
//   output to (when --out was used).

import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import db from '../../src/config/db.js';
import { readWorkbook, effectiveRecordType } from '../../src/modules/import/import.parse.js';
import { validateBatch } from '../../src/modules/import/import.validate.js';
import { normalizeRegistryRow, parseApplicableTypes } from '../../src/modules/import/registry-sync.util.js';
import { districtForPs } from '../../src/modules/import/import.service.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const SCHEMA_VERSION = '1.0.0';
const TOOL_NAME = 'replay-corpus.mjs';
const TOOL_VERSION = '1.0.0';

const norm = (s) => String(s ?? '').trim().toLowerCase();
const stripNoise = (s) => norm(s)
  .replace(/\(.*?\)/g, '').replace(/\bdistrict\b/g, '').replace(/\bps\b/g, '')
  .replace(/[^a-z0-9]/g, '');

// ── taxonomy classification (mirrors parse_error_log.py's classify() exactly — both tools
// read the SAME taxonomy.json, Framework design rule #1) ──────────────────────────────────
function loadTaxonomy(taxonomyPath) {
  const taxonomy = JSON.parse(fs.readFileSync(taxonomyPath, 'utf8'));
  return taxonomy.classes.map((cls) => ({
    id: cls.id,
    codes: new Set((cls.match && cls.match.error_codes) || []),
    patterns: ((cls.match && cls.match.message_patterns) || []).map((p) => new RegExp(p)),
  }));
}

function classify(compiledTaxonomy, message, errorCode) {
  if (errorCode) {
    for (const cls of compiledTaxonomy) {
      if (cls.codes.has(errorCode)) return cls.id;
    }
  }
  for (const cls of compiledTaxonomy) {
    for (const pat of cls.patterns) {
      if (pat.test(message || '')) return cls.id;
    }
  }
  return 'UNCLASSIFIED';
}

// ── registry map (mirrors import.service.js's private buildRegistryMap — read-only, same
// query) ─────────────────────────────────────────────────────────────────────────────────
async function buildRegistryMap(trx, recordType) {
  const rows = (await trx('field_registry').where('is_active', true)).map(normalizeRegistryRow);
  const map = {};
  for (const f of rows) {
    if (parseApplicableTypes(f.applicable_record_types).includes(recordType)) map[f.field_key] = f;
  }
  return map;
}

let _psCache = null;
async function loadPsNodes(trx) {
  if (_psCache) return _psCache;
  _psCache = await trx('hierarchy_nodes').where({ node_type: 'PS', is_active: true }).select('id', 'name');
  return _psCache;
}

/** Resolves a best-effort batchScope for a corpus file that never went through a real upload
 * (no authenticated user picked a target PS). Tries, in order: the corpus manifest's ps_hint
 * (parsed from the filename), then the file's own parent-sheet police_station cell. Falls back
 * to a null-scoped batchScope (psId: null) when nothing resolves — validateBatch/readWorkbook
 * both tolerate that (PS-scoped queries just return empty sets; the caller doesn't need a
 * throwing resolveBatchScope for this analysis-only use, unlike the real controller path which
 * always has an authorized ps_id already). This is a real precision limitation vs. a live
 * batch's actual, authoritative target PS — documented in the output's `inputs` block. */
async function resolveBestEffortScope(trx, psHint, firstParentRow) {
  const psNodes = await loadPsNodes(trx);
  const tryMatch = (candidate) => {
    if (!candidate) return null;
    const exact = psNodes.find((n) => norm(n.name) === norm(candidate));
    if (exact) return exact;
    const a = stripNoise(candidate);
    if (!a) return null;
    const matches = psNodes.filter((n) => {
      const b = stripNoise(n.name);
      return b && (a.includes(b) || b.includes(a));
    });
    return matches.length === 1 ? matches[0] : null;
  };

  const psNode = tryMatch(psHint) || tryMatch(firstParentRow && firstParentRow.police_station);
  if (!psNode) {
    return { psId: null, districtId: null, districtName: null, psName: null, resolved_via: 'unresolved' };
  }
  const districtNode = await districtForPs(psNode.id);
  return {
    psId: psNode.id,
    districtId: districtNode ? districtNode.id : null,
    districtName: districtNode ? districtNode.name : null,
    psName: psNode.name,
    resolved_via: psHint && tryMatch(psHint) ? 'ps_hint' : 'parent_sheet_police_station',
  };
}

export async function replayOneFile(trx, entry, compiledTaxonomy, { isLegacy = false } = {}) {
  const recordType = entry.record_type;
  if (!recordType) {
    return { id: entry.id, path: entry.path, record_type: null, skipped: true, reason: 'record_type not inferred from filename' };
  }

  const registryMap = await buildRegistryMap(trx, recordType);
  let parsed;
  try {
    parsed = await readWorkbook(recordType, entry.path, registryMap);
  } catch (err) {
    return { id: entry.id, path: entry.path, record_type: recordType, skipped: true, reason: `readWorkbook threw: ${err.message}` };
  }
  if (!parsed) {
    return { id: entry.id, path: entry.path, record_type: recordType, skipped: true, reason: 'no usable parent worksheet found' };
  }
  // T9 (03-TRIAGE-MATRIX.md) — readWorkbook returns a distinct truthy sentinel (never throws)
  // when the file's headers don't fingerprint-match any known layout at all; the real endpoint
  // turns this into a friendly rejection (import.service.js), this replay just records it as
  // skipped rather than crashing on the missing parentRows/childSheets fields below.
  if (parsed.unknownLayout) {
    return { id: entry.id, path: entry.path, record_type: recordType, skipped: true, reason: 'file does not match any known template layout (T9)' };
  }

  const firstParentRow = parsed.parentRows[0] ? parsed.parentRows[0].rowData : null;
  const batchScope = await resolveBestEffortScope(trx, entry.ps_hint, firstParentRow);

  const { errorRows, counts } = await validateBatch(trx, {
    recordType, isLegacy, batchScope, parsed, registryMap,
  });

  const byClassSeverity = {};
  // error_code breakdown too (not just taxonomy class) — E7 in particular is a grab-bag
  // (REQUIRED_MISSING/DUPLICATE_IN_DB/DUPLICATE_IN_SHEET/PS_MISMATCH all land there per
  // taxonomy.json), and DUPLICATE_IN_DB specifically is DB-state-dependent (this replay runs
  // against whatever's already in `fir_details` right now, including rows from real prior
  // import batches — a clean/reset DB would not fire it for the same file). Surfacing the
  // real error_code lets a reader tell "operator left a field blank" apart from "this FIR
  // happens to already exist in today's dev DB" instead of both hiding inside one class total.
  const byErrorCodeSeverity = {};
  for (const e of errorRows) {
    if (e.code === '__INVALID_PARENT__') continue; // internal sentinel, never shown to operators
    const cls = classify(compiledTaxonomy, e.message, e.code);
    const key = `${cls}:${e.severity}`;
    byClassSeverity[key] = (byClassSeverity[key] || 0) + 1;
    const codeKey = `${e.code}:${e.severity}`;
    byErrorCodeSeverity[codeKey] = (byErrorCodeSeverity[codeKey] || 0) + 1;
  }
  const visibleErrors = errorRows.filter((e) => e.code !== '__INVALID_PARENT__');

  return {
    id: entry.id,
    filename: path.basename(entry.path),
    record_type: recordType,
    ps_hint: entry.ps_hint || null,
    resolved_scope: { ps_name: batchScope.psName, district_name: batchScope.districtName, resolved_via: batchScope.resolved_via },
    rows: { total: counts.total, valid: counts.valid, invalid: counts.invalid },
    error_count: visibleErrors.filter((e) => e.severity === 'ERROR').length,
    warning_count: visibleErrors.filter((e) => e.severity === 'WARNING').length,
    by_class_severity: byClassSeverity,
    by_error_code_severity: byErrorCodeSeverity,
  };
}

export async function replayCorpus(trx, corpusManifest, taxonomyPath, opts = {}) {
  const compiledTaxonomy = loadTaxonomy(taxonomyPath);
  const entries = [...corpusManifest.entries].sort((a, b) => (a.path < b.path ? -1 : a.path > b.path ? 1 : 0));

  const files = [];
  for (const entry of entries) {
    const result = await replayOneFile(trx, entry, compiledTaxonomy, opts);
    files.push(result);
  }

  const totals = { total_rows: 0, valid_rows: 0, invalid_rows: 0, errors: 0, warnings: 0 };
  const classTotals = {};
  const codeTotals = {};
  const byRecordType = {}; // record_type -> {file_count, total_rows, valid_rows, invalid_rows, errors, warnings}
  for (const f of files) {
    if (f.skipped) continue;
    totals.total_rows += f.rows.total;
    totals.valid_rows += f.rows.valid;
    totals.invalid_rows += f.rows.invalid;
    totals.errors += f.error_count;
    totals.warnings += f.warning_count;
    for (const [key, count] of Object.entries(f.by_class_severity)) {
      classTotals[key] = (classTotals[key] || 0) + count;
    }
    for (const [key, count] of Object.entries(f.by_error_code_severity || {})) {
      codeTotals[key] = (codeTotals[key] || 0) + count;
    }

    const rt = f.record_type || 'UNKNOWN';
    if (!byRecordType[rt]) {
      byRecordType[rt] = { file_count: 0, total_rows: 0, valid_rows: 0, invalid_rows: 0, errors: 0, warnings: 0 };
    }
    byRecordType[rt].file_count += 1;
    byRecordType[rt].total_rows += f.rows.total;
    byRecordType[rt].valid_rows += f.rows.valid;
    byRecordType[rt].invalid_rows += f.rows.invalid;
    byRecordType[rt].errors += f.error_count;
    byRecordType[rt].warnings += f.warning_count;
  }

  return {
    files,
    totals,
    class_totals: classTotals,
    code_totals: codeTotals,
    by_record_type: Object.fromEntries(Object.entries(byRecordType).sort()),
  };
}

// ── --diff mode: regression gate ────────────────────────────────────────────────────────────
export function diffBaselines(current, baseline) {
  const regressions = [];
  const deltas = { by_class: {}, by_file: {} };

  const allClasses = new Set([...Object.keys(current.class_totals), ...Object.keys(baseline.class_totals)]);
  for (const cls of [...allClasses].sort()) {
    const curVal = current.class_totals[cls] || 0;
    const baseVal = baseline.class_totals[cls] || 0;
    const delta = curVal - baseVal;
    deltas.by_class[cls] = { current: curVal, baseline: baseVal, delta };
    if (cls.endsWith(':ERROR') && delta > 0) {
      regressions.push({ class: cls, baseline: baseVal, current: curVal, delta });
    }
  }

  const baselineFilesById = new Map(baseline.files.map((f) => [f.id, f]));
  for (const f of current.files) {
    const prior = baselineFilesById.get(f.id);
    if (!prior || f.skipped || prior.skipped) continue;
    const delta = f.error_count - prior.error_count;
    deltas.by_file[f.filename] = { current_errors: f.error_count, baseline_errors: prior.error_count, delta };
    if (delta > 0) {
      regressions.push({ file: f.filename, baseline_errors: prior.error_count, current_errors: f.error_count, delta });
    }
  }

  return { regressions, deltas, is_regression: regressions.length > 0 };
}

function renderMarkdown(report) {
  const lines = ['# Corpus Baseline', '', `Generated: ${report.generated_at}`, ''];
  lines.push(`Total rows: ${report.totals.total_rows} | valid: ${report.totals.valid_rows} | invalid: ${report.totals.invalid_rows}`);
  lines.push(`Total errors: ${report.totals.errors} | warnings: ${report.totals.warnings}`);
  lines.push('');
  lines.push('## By record type');
  lines.push('');
  lines.push('| Type | Files | Rows | Valid | Invalid | Errors | Warnings |');
  lines.push('|---|---|---|---|---|---|---|');
  for (const [rt, v] of Object.entries(report.by_record_type || {})) {
    lines.push(`| ${rt} | ${v.file_count} | ${v.total_rows} | ${v.valid_rows} | ${v.invalid_rows} | ${v.errors} | ${v.warnings} |`);
  }
  lines.push('');
  lines.push('## By class x severity (taxonomy.json)');
  lines.push('');
  lines.push('| Class:Severity | Count |');
  lines.push('|---|---|');
  for (const [key, count] of Object.entries(report.class_totals).sort()) {
    lines.push(`| ${key} | ${count} |`);
  }
  lines.push('');
  lines.push('## By error_code x severity (un-conflates grab-bag classes like E7)');
  lines.push('');
  lines.push('| error_code:Severity | Count |');
  lines.push('|---|---|');
  for (const [key, count] of Object.entries(report.code_totals || {}).sort()) {
    lines.push(`| ${key} | ${count} |`);
  }
  lines.push('');
  lines.push('**Note**: this replay is validate-only (no writes), against the current dev DB snapshot — '
    + '`DUPLICATE_IN_DB` findings reflect FIRs already present from prior real import batches, not a clean DB. '
    + 'E5 (raw SQL/DB errors) never appears here by construction: it only occurs at actual write/confirm time.');
  lines.push('');
  lines.push('## Per file');
  lines.push('');
  lines.push('| File | Type | Rows | Valid | Invalid | Errors | Warnings |');
  lines.push('|---|---|---|---|---|---|---|');
  for (const f of report.files) {
    if (f.skipped) {
      lines.push(`| ${path.basename(f.path || '')} | ${f.record_type || '?'} | SKIPPED: ${f.reason} | | | | |`);
      continue;
    }
    lines.push(`| ${f.filename} | ${f.record_type} | ${f.rows.total} | ${f.rows.valid} | ${f.rows.invalid} | ${f.error_count} | ${f.warning_count} |`);
  }
  lines.push('');
  return lines.join('\n') + '\n';
}

export async function run({ corpusManifestPath, taxonomyPath, outDir, outPath, outIsDefault, diffPath, isLegacy }) {
  const now = new Date().toISOString();
  const corpusManifest = JSON.parse(fs.readFileSync(corpusManifestPath, 'utf8'));

  const { files, totals, class_totals, code_totals, by_record_type } = await replayCorpus(db, corpusManifest, taxonomyPath, { isLegacy });

  const report = {
    schema_version: SCHEMA_VERSION,
    generated_at: now,
    tool: TOOL_NAME,
    tool_version: TOOL_VERSION,
    inputs: {
      corpus_manifest: path.resolve(corpusManifestPath),
      taxonomy: path.resolve(taxonomyPath),
      file_count: corpusManifest.entries.length,
      is_legacy: !!isLegacy,
      note: 'batchScope (target PS) is best-effort (filename ps_hint or the file\'s own parent-sheet police_station cell), never a real authenticated upload\'s authorized ps_id — a real precision limitation vs. the live validate endpoint, see resolveBestEffortScope() doc comment. This replay is validate-only against the CURRENT dev DB snapshot (no writes) — DUPLICATE_IN_DB findings depend on what prior real batches already wrote to fir_details, and E5 (raw SQL/DB errors) can never appear here since it only occurs at actual write/confirm time.',
    },
    files,
    totals,
    by_record_type,
    class_totals,
    code_totals,
  };

  // Bug fix (Wave B, Task 0): --diff MUST read the baseline it's comparing against BEFORE this
  // run writes anything — the old code wrote its fresh output first and read diffPath second,
  // so the common/documented invocation (`--diff` pointed at the SAME path this run writes to,
  // e.g. the committed out/corpus-baseline.json) always diffed the fresh report against
  // itself: a trivial, silently-passing "no regression" every time, regardless of what actually
  // changed. Reading fully into memory here, before any fs.mkdirSync/writeFileSync below, fixes
  // that regardless of whether outPath and diffPath happen to coincide.
  let baseline = null;
  if (diffPath) {
    baseline = JSON.parse(fs.readFileSync(diffPath, 'utf8'));
  }

  fs.mkdirSync(path.dirname(outPath), { recursive: true });
  fs.writeFileSync(outPath, JSON.stringify(report, null, 2));
  // Default md filename matches the pre-existing 'CORPUS_BASELINE.md' exactly when --out was
  // not given (outIsDefault) — a custom --out path derives its sibling .md by extension swap.
  const mdPath = outIsDefault
    ? path.join(outDir, 'CORPUS_BASELINE.md')
    : (path.extname(outPath) === '.json' ? outPath.slice(0, -'.json'.length) + '.md' : `${outPath}.md`);
  fs.writeFileSync(mdPath, renderMarkdown(report));
  console.log(`Wrote ${outPath}`);
  console.log(`Wrote ${mdPath}`);

  if (diffPath) {
    const diff = diffBaselines({ files, totals, class_totals }, baseline);
    console.log('\n--- DIFF vs', diffPath, '---');
    for (const [cls, d] of Object.entries(diff.deltas.by_class)) {
      if (d.delta !== 0) console.log(`  ${cls}: ${d.baseline} -> ${d.current} (${d.delta > 0 ? '+' : ''}${d.delta})`);
    }
    if (diff.is_regression) {
      console.log(`\nREGRESSION: ${diff.regressions.length} class/file(s) got worse.`);
      for (const r of diff.regressions) console.log(' ', JSON.stringify(r));
      return { report, diff, exitCode: 1 };
    }
    console.log('\nNo regression.');
    return { report, diff, exitCode: 0 };
  }

  return { report, diff: null, exitCode: 0 };
}

const isMain = import.meta.url === `file://${process.argv[1]}`;
if (isMain) {
  const args = process.argv.slice(2);
  // getArg tolerates a flag given with no following value (end of argv, or immediately
  // followed by another --flag) by falling back to `def` instead of returning `undefined` —
  // needed below so `--diff` (given bare, no path) gets a real default rather than `undefined`.
  const getArg = (name, def) => {
    const i = args.indexOf(`--${name}`);
    if (i < 0) return def;
    const val = args[i + 1];
    if (val === undefined || val.startsWith('--')) return def;
    return val;
  };
  const corpusManifestPath = getArg('corpus-manifest', path.join(__dirname, 'corpus.manifest.json'));
  const taxonomyPath = getArg('taxonomy', path.join(__dirname, 'taxonomy.json'));
  const outDir = getArg('out-dir', path.join(__dirname, 'out'));
  const defaultOutPath = path.join(outDir, 'corpus-baseline.json');
  // Task 0 fix: --out <path> lets this run's fresh JSON/MD write somewhere OTHER than the
  // committed baseline — default unchanged (out-dir/corpus-baseline.json, same as before this
  // flag existed). When --out is used, --diff's own default (the committed baseline path)
  // is then naturally a DIFFERENT file than what this run writes, instead of the two
  // silently coinciding.
  const outPath = getArg('out', defaultOutPath);
  const outIsDefault = outPath === defaultOutPath;
  const diffRequested = args.includes('--diff');
  const diffPath = diffRequested ? getArg('diff', defaultOutPath) : null;
  const isLegacy = args.includes('--legacy');

  run({ corpusManifestPath, taxonomyPath, outDir, outPath, outIsDefault, diffPath, isLegacy })
    .then(async ({ exitCode }) => {
      await db.destroy();
      process.exit(exitCode);
    })
    .catch(async (err) => {
      console.error('replay-corpus failed:', err.stack || err.message);
      await db.destroy();
      process.exit(1);
    });
}
