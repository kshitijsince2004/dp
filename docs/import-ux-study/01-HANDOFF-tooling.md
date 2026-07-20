# Handoff 01 — Import Reliability Toolkit (Phase 1, Worker W1)

> **Amendment (2026-07-16, binding):** this toolkit is the seed of a **permanent Import
> Reliability Framework**, not a one-time study. Follow §"Framework design rules" below.
> Where it conflicts with older wording in this doc (paths, names), the amendment wins.

**Audience:** implementation model with NO prior context. Everything you need is here + the
files referenced. Do NOT redesign anything; build exactly this. Do NOT modify any file under
`backend/src/` — this handoff is analysis tooling only.

## Context in three sentences

PHAROS is a police records system (Node/Express + PostgreSQL + Knex, ES modules, repo root
`/home/ashmit/Projects/Crime-Diaries`). Operators bulk-import records via frozen Excel
templates; 55 real operator-filled files sit in `sample files/` (repo root, note the space)
and most rows currently fail validation. You are building the measurement toolkit that a later
analysis phase consumes — you are NOT fixing the import pipeline.

## Where things are

| Thing | Path |
|-------|------|
| Operator files (input, READ-ONLY) | `sample files/*.xlsx` — 4 record types by filename prefix: `ARREST_`, `CASE_`, `MISSING_`, `UIDB_` |
| Import pipeline (read to understand, do not edit) | `backend/src/modules/import/` — `import.parse.js` (xlsx→rows), `import-key-bridge.config.js` (column-label→field-key bridge), `import.compose.js`, `import.validate.js` (all rules), `import-fields.config.js`, `template-builder.service.js` (sheet/column layout) |
| Frozen template layout baseline | `backend/scripts/template-baseline.manifest.json` |
| Import contract doc | `docs/new-db-integration/03-import.md` |
| DB config to reuse in Node scripts | `backend/src/config/db.js` (knex; env from `backend/.env`) |
| Error-log sample (UI text format) | see "Error log format" below |
| Output directory (create) | `backend/scripts/import-reliability/` for code, `backend/scripts/import-reliability/out/` for artifacts (add `out/` to `.gitignore`) |

## Framework design rules (permanent-framework amendment)

Generalize where it costs little; specialize only where domain rules require it. Concretely:

1. **Taxonomy as data, not code.** Create `backend/scripts/import-reliability/taxonomy.json`:
   the E1–E6 failure classes, each with `id`, `name`, `description`, and `match` rules
   (keyword/regex lists). BOTH `parse_error_log.py` and `replay-corpus.mjs` classify through
   this one file. New failure classes = new JSON entry, zero code change. Include an
   `UNCLASSIFIED` catch-all and a `taxonomy_version` field.
2. **Versioned, machine-first artifacts.** Every JSON artifact carries
   `{schema_version, generated_at, tool, tool_version, inputs}` at top level. `.md` reports are
   RENDERED FROM the JSON (small render step), never hand-assembled — so future consumers
   (CI, dashboards) read JSON and humans read MD from the same truth.
3. **Growable corpus registry.** The 55 files are corpus v1, not "the corpus". Create
   `backend/scripts/import-reliability/corpus.manifest.json`: one entry per source file —
   `{id, path, sha256, record_type, ps_hint, added_at, source: "operator-pilot-2026-07"}`.
   `extract_samples.py` APPENDS new files idempotently (sha256 dedupe); every downstream tool
   takes the manifest as its input list, so future operator batches just get dropped in a
   directory and registered.
4. **Library/CLI split.** Each Node tool exports its core functions (`export function ...`)
   with a thin CLI wrapper (`if (import.meta.url === ...)`); each Python tool keeps logic in
   functions with a `main()` + `argparse`. Rationale: the ref-match prober is a future
   pre-validation "recoverability advisor" inside the backend, and the corpus replay is a
   future CI gate — same code, different entry point.
5. **No hardcoded paths.** Input dir, out dir, DB usage — all CLI args with sane defaults.
   Deterministic output (stable key ordering / sorted rows) so diffs are meaningful.
6. **Baseline diffing built in.** `replay-corpus.mjs` supports `--diff <baseline.json>`:
   prints per-file and per-class deltas and exits non-zero on regression (error count up for
   any class). This is the future CI contract; `npm run import:corpus` runs plain,
   `npm run import:corpus -- --diff out/corpus-baseline.json` diffs.
7. **Don't over-build.** No dashboards, no DB persistence of results, no config beyond the
   above. Framework-ready means clean seams, not extra features.

Python 3 is available; use `openpyxl` (used elsewhere: `backend/scripts/dev/build_ps_codes.py`).
Node scripts: ES modules, run from `backend/` so `.env`/knex resolve.

## Deliverables (5 scripts + artifacts)

### 1. `extract_samples.py`
For every `.xlsx` in a directory (arg, default `../../sample files` relative to script):
emit `out/extracted/<slug>.json` with, per sheet: sheet name, header row(s) (the template has
label rows — inspect one file first and mirror how `import.parse.js` finds headers), and every
data row as `{row_number, cells: {header_label: {value, excel_type, number_format}}}` capturing
values AS TYPED (strings unstripped, dates as both raw serial and ISO if date-typed).
Also emit `out/samples_manifest.json`: one entry per file — filename, record type, inferred PS
(from filename where present), sheets, data-row counts, sha256.
Skip unreadable files with a logged warning, never crash the batch.

### 2. `analyze_behaviour.py`
Consumes `out/extracted/` + `template-baseline.manifest.json`. Emits `out/OPERATOR_BEHAVIOUR.json`
and a human `out/OPERATOR_BEHAVIOUR.md` with, per record type × sheet × column:
- fill rate (non-blank / total rows)
- value-shape histogram: classify each value (date-like patterns actually typed e.g. `12/03/2025`
  vs `12.3.25` vs Excel-date; integer; text; FIR-no patterns like `123/2025` vs `0123` vs bare `123`;
  phone-like; enum-membership if the column has a template dropdown — list top offending values)
- header drift: columns present vs baseline manifest (missing/extra/renamed)
- ghost-row census: rows where ≤2 cells are non-blank — count and which cells (this measures
  failure class E4)
- child-sheet key omission: for child sheets (`act`, `victim`, `property`, etc. — take the
  parent/child structure from `import-key-bridge.config.js`), rate of blank parent-key column
  when the row has other data (measures E3)

### 3. `parse_error_log.py`
Parses the UI error-log text format into `out/ERROR_STATS.json` + `out/ERROR_STATS.md`
(frequency by error class × field × sheet). Format, one logical entry as:
```
Row 5:Beat "6" could not be matched.
beat_no
```
i.e. `Row N:<message>` line followed optionally by a field-key line. Two sections headed
`Errors (N) — ...` and `Warnings (N) — ...`. Classify messages into classes E1–E6 per the
table in `00-EXECUTION-PLAN.md` §1 (keyword rules are fine; keep an `UNCLASSIFIED` bucket).
Accept multiple input files (one per batch). ALSO: first check whether errors are persisted in
DB (`import_batches` and any `import_batch_errors`-like table — check the migrations under
`backend/migrations/`); if yes, add `--from-db` mode reading them via a small Node helper or
document in the MD output that DB holds them and how many.

### 4. `probe-ref-match.mjs` (Node, from `backend/`)
Input: `out/OPERATOR_BEHAVIOUR.json` (distinct values per reference-backed column).
For each distinct operator value of: beat, IO PIS, district, police station, local head,
crime/major head, sections — query the real tables (`ref.beats`, `investigating_officers`,
`hierarchy_nodes`, `ref.local_heads`, `ref.major_heads`, `ref.sections`; read
`import.validate.js` to use the SAME lookup the pipeline uses, then also try tolerant variants:
trim/case-fold; PS-scoped beat-number match; zero-padding; `NN/YYYY` normalization).
Output `out/REF_MATCH_REPORT.json/.md`: per value → `{exact, recovered_by: <rule>, unknown}`
plus per-column totals. **Read-only queries only.**

### 5. `replay-corpus.mjs` (Node, from `backend/`)
Import the real `parse`/`validate` functions from `backend/src/modules/import/` and run them
over every original xlsx (not the JSON) exactly as the upload path does (mirror the
controller's calls in `import.controller.js` — but stop before anything writes: no batch rows,
no confirm, no service calls; if validate requires a batch row, stub/dry-run it in-memory).
Output `out/corpus-baseline.json`: per file → rows, error count, warning count, errors grouped
by message-class. This is the permanent regression baseline; make it deterministic and add
`npm run import:corpus` to `backend/package.json` (only package.json change allowed).

## Acceptance checklist

- [ ] All 55 files extracted (or logged-and-skipped with reason); manifest complete
- [ ] Behaviour report covers all 4 record types; numbers, not prose
- [ ] Error-log parser handles the sample format end-to-end; classes E1–E6 counted
- [ ] Ref probe runs read-only against a live dev DB and reports recoverability %
- [ ] `npm run import:corpus` produces a stable baseline twice in a row (byte-identical modulo timestamps)
- [ ] Nothing under `backend/src/` modified; `sample files/` untouched
- [ ] Final report back: artifact paths + the 10 most surprising numbers you saw

## Known truths (don't rediscover)

- Template output is a frozen contract (baseline P3) — your tools OBSERVE it, never regenerate it.
- `records.data` jsonb does not exist; typed schema per `docs/db-audit/DB_SCHEMA.md`.
- 765 beats in ref data have `ps_id` NULL (unreconciled codes) — expect beat-match gaps beyond
  operator error; report them separately (`unmatched_because_ref_gap`).
- One analyzed CASE batch: 140 errors/30 warnings over ~32 rows; dominant failures: IO PIS
  unregistered (all rows), beat unmatched (all rows), child sheets missing fir_no key, 8 ghost
  rows, raw SQL error text surfacing. Your job is to measure whether the other 54 files agree.
