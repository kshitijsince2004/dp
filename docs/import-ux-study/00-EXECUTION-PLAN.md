# Import UX Study — Engineering Execution Plan

**Date:** 2026-07-16 | **Owner:** Chief Architect (Fable)
**Goal:** Understand real operator behaviour in the bulk-import templates and make imports
significantly more successful without degrading data quality. This is a *product study →
targeted engineering* project, not a bug-fix sprint.

**Evolution mandate (2026-07-16, user):** everything built here is the seed of a **permanent
Import Reliability Framework** — growable corpus registry, data-driven failure taxonomy,
versioned artifact schemas, library/CLI split so the same code later backs CI regression gates
and in-backend recoverability advice. Generalize where cheap, specialize only where domain
rules require it. Design rules codified in `01-HANDOFF-tooling.md` §"Framework design rules".

**Binding constraints:** `docs/ENGINEERING_BASELINE.md` P1–P6. Especially:
- **P2** — reject only the impossible; normalize aggressively; officers are non-tech-savvy.
- **P3** — the template's visible output is FROZEN; any visible change needs explicit user sign-off.
- **P1** — recovery/normalization lands in the import pipeline or `records.normalize.js`,
  never as a second write path.

---

## 1. What we already know (from one error log + recon — do not re-derive)

Preliminary failure taxonomy from the first analyzed batch (a CASE file, 140 errors / 30 warnings,
~32 data rows → **~0% import success**). Every error belongs to one of six classes:

| # | Class | Example | Preliminary read |
|---|-------|---------|------------------|
| E1 | **Environment/data precondition** | IO PIS "28070556" not registered for this PS (every row) | Operators cannot fix this in the sheet at all. Blocks ~100% of rows. Needs a product answer (pre-registration flow / auto-provision / batch IO-import), not a validation answer. |
| E2 | **Reference matching too strict** | Beat "6" could not be matched (every row) | Operators write the bare beat number; matcher presumably wants a fuller code, and 765 beats in ref data have `ps_id` NULL. Likely recoverable via PS-scoped tolerant matching. |
| E3 | **Child-sheet key not repeated** | Reference '' in sheet 'act'/'victim'/'property'; "FIR Number" required in child sheet | Parent rows HAVE fir_no; operators simply don't re-type it on child sheets. Systematic — nearly every row. Candidates: template formula pre-fill, or backend positional/single-parent inference (needs careful rules). |
| E4 | **Ghost/trailing rows** | Rows 29–36: every parent required field missing at once | Rows with no real data being parsed as records (stray cell or formatting). Parser's empty-row detection is too loose. Pure auto-recovery candidate (skip, don't error). |
| E5 | **Raw SQL errors reaching operators** | `null value in column "record_date"... violates not-null constraint` shown verbatim, alongside the validation errors for the same row | Two defects: (a) insert attempted despite failed row validation, (b) DB error text leaked to a police operator. Real bug — reserved-reasoning triage. |
| E6 | **Submit-requiredness warnings flood** | Same 3–4 fields warned on every row | Expected for legacy data; per-row repetition is noise. Aggregate/summarize in UI; possibly demote per policy. |

These are hypotheses from ONE file. Phase 1 exists to confirm/refute them across all 55 files
and full error logs with data, not vibes.

## 2. Engineering organization

Principle: **scripts discover, I decide, cheap models implement.** No standing org chart —
workers are created per phase and die with it.

| Worker | Type | One responsibility | Why it exists |
|--------|------|--------------------|---------------|
| W1 Tooling Engineer | cheap model (Sonnet) | Build the Python/Node analysis toolkit per `01-HANDOFF-tooling.md` | Mechanical scripting against a precise spec; zero design freedom needed |
| W2 Pipeline Cartographer | cheap model (Sonnet/Haiku) | Produce `VALIDATION_INVENTORY.md`: every validation rule + error string + severity + file:line across the 7 import files | One-time extraction; future workers read the inventory instead of 7,245 lines |
| W3 Data Forensics | **script, not a model** | Run W1's toolkit over all 55 files + error logs → `OPERATOR_BEHAVIOUR.json/.md` | Counting, fill-rates, value-shape histograms — Python territory, near-free, reproducible |
| W4 Backend Import Engineer | cheap model | Implement approved recovery/normalization changes (parse, validate, matching) | Post-decision, spec-driven |
| W5 Template Engineer | cheap model | Implement approved template changes (invisible hardening + any signed-off visible changes) | Must run `import:parity` + `template-regression` after every change (P3) |
| W6 Frontend/UX Engineer | cheap model | Error rendering: grouping, aggregation, message catalog wiring in `LegacyDataPage.jsx` | Independent of backend waves |
| W7 Docs Engineer | cheap model | Operator-facing fill guide + error-message glossary from the final message catalog | Last, once messages stabilize |
| **Me (Fable)** | expensive | Triage matrix (recover/warn/error per rule), architecture of matching & inference rules, P3 sign-off requests to the user, review of every wave | The only genuinely expensive decisions in this project |

## 3. Automation-first: the toolkit (built once, reused forever)

All in `backend/scripts/import-reliability/` (full spec in `01-HANDOFF-tooling.md`):

1. **`extract_samples.py`** (Python/openpyxl) — every xlsx in `sample files/` → one JSON per file
   (sheets, headers, raw cell values as-typed + Excel types, row counts) + `samples_manifest.json`.
   *The single source all later analysis reads — nobody opens xlsx twice.*
2. **`analyze_behaviour.py`** — consumes extraction output → `OPERATOR_BEHAVIOUR.md/json`:
   per-column fill rates, value-shape histograms (date formats actually typed, beat/FIR/PIS
   patterns), dropdown-deviation report, header drift vs `template-baseline.manifest.json`,
   ghost-row census, child-sheet key-omission rates.
3. **`parse_error_log.py`** — error-log text (the UI format) → structured JSON + frequency table
   by error class × record type × PS.
4. **`probe-ref-match.mjs`** (Node, reuses knex config) — replays every distinct operator-typed
   beat / IO PIS / district / PS / local head / crime head / section against `ref.*` +
   `investigating_officers` → per-value verdict: exact / recoverable-with-rule-X / truly unknown.
   *This turns "should we auto-recover beats?" from a debate into a number.*
5. **`replay-corpus.mjs`** (Node) — runs the REAL `import.parse` + `import.validate` code over
   all extracted samples, dumps per-file error/warning counts → `corpus-baseline.json`.
   *This is the permanent regression harness: after every pipeline change, re-run and diff.
   The 55 operator files become a golden corpus.*

## 4. Reusable artifacts produced

- `samples_manifest.json` + per-file extractions (raw truth)
- `OPERATOR_BEHAVIOUR.md` (human) + `.json` (machine)
- `ERROR_STATS.json` (full logs, not the summary)
- `REF_MATCH_REPORT.md` — recoverability numbers per reference type
- `VALIDATION_INVENTORY.md` — every rule/message/severity with file:line
- `corpus-baseline.json` — golden-corpus baseline for before/after measurement
- (Phase 2, by me) `TRIAGE_MATRIX.md` — the decision document: per failure mode →
  auto-recover / warn / hard error / template change / docs change / product change,
  each with evidence citation and P3 flag where sign-off is needed

## 5. Phased roadmap

- **Phase 0 — Recon** ✅ done (this document).
- **Phase 1 — Extraction & measurement** (W1 builds toolkit → W2 inventory → W3 runs).
  Exit: all artifacts in §4 except triage matrix. No pipeline code touched.
  Also in scope: finish/commit the WIP MIME fix in `import.router.js` (remove the TODO debug
  log line) — it's an already-diagnosed upload-UX blocker.
- **Phase 2 — Triage & decisions** (me, using artifacts only). Exit: `TRIAGE_MATRIX.md`
  + explicit user sign-off on (a) any visible template change, (b) any requiredness demotion,
  (c) the IO-registration product answer, (d) child-sheet key inference policy.
- **Phase 3 — Implementation waves** (parallel where independent):
  W4 backend recovery/normalization + E5 bug fix; W5 template hardening; W6 error-UX +
  message catalog; W7 docs. Every wave gated by `replay-corpus` diff + `import:parity` +
  `template-regression`.
- **Phase 4 — Verification**: corpus success-rate report (baseline vs after), golden corpus
  committed as permanent regression fixture, final handoff doc `docs/new-db-integration/04-import-ux.md`.

**Success metric:** rows imported cleanly from the golden corpus (baseline ≈ 0% for the analyzed
file) — target agreed with user after Phase 2, without any silent data corruption (every
auto-recovery leaves a warning trail).

## 6. What is reserved for expensive reasoning (me)

- E5 double-defect confirmation and fix design (validation/insert ordering).
- Matching-rule design (PS-scoped beat matching, IO policy, fuzzy thresholds — false-match
  risk in police records is worse than a rejection).
- Child-sheet key inference policy (silent mis-linking an act/victim to the wrong FIR is the
  worst possible failure — may land as template fix only).
- Requiredness policy changes and anything touching P3.
- Review of every implementation wave against the baseline checklist.

Everything else is scripts or spec-driven cheap-model work.

## 7. Open questions for the user (non-blocking for Phase 1)

1. Full error logs: are they persisted in `import_batches`/`import_batch_errors` (DB) or only
   in the UI? Phase 1 will try DB first; if empty, we need the logs exported.
2. IO registration: is bulk pre-registration of IOs (e.g., an IO import sheet or auto-provision
   on import with SHO confirmation) acceptable product direction?
3. Which of the 55 files were actually run through validate (so error logs can be joined to files)?
