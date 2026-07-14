# PHAROS Application Architecture — HANDOFF

**Purpose:** single resume-point for the app-layer restructure that sits on top of the (separately finalized) DB restructure. Read this first; it tells you what is decided, what exists, and what's next. Keep it updated at every milestone. This is a **separate** handoff from `docs/db-audit/HANDOFF.md` (the DB-layer one) — that one still governs the schema; this one governs everything built on it (modules, event bus, workflow engine, transfers, config-as-data, report engine, frontend).
**Last updated:** 2026-07-11 (session 2 — DB rulings 15–17 ripple: write path now inserts a flat `record_offences` (one row per section citation; ruling 17 dropped the `offence_sections` junction) instead of `record_sections`, plus `locations` rows; storage mapping has a 4th shape `{entity:'location', slot, column}`; `pharos_report_ro` grant list extended. See `DB_SCHEMA.md` §10 rulings 15–17.)

## Phase map

| Phase | Status | Artifact |
|---|---|---|
| 0. DB restructure (prerequisite, separate track) | ✅ FINAL design; ✅ **DB stages 1–4 SHIPPED 2026-07-11** (fresh schema live, config-as-data + sync-config, ref loader + data, users seed; stage 5 write-path rewrite pending) | `DB_SCHEMA.md`, `DB_REDESIGN_DECISIONS.md`, `REF_KEY_VERIFICATION.md`, `ER_DIAGRAM.md`/`.drawio`, `HANDOFF.md` (implementation log) |
| 1. App-layer research (this session) | ✅ done (2026-07-09) | Two Explore passes (backend modules/event bus/RBAC/scripts; frontend forms/pages/i18n/API) + direct reads of `python_worker/*`, `record-links`/`level-contracts`/`legacy`/`import`/`filters`/`warehouse` modules, root `HANDOFF.md`, `docs/RECORD-LINKAGE.md`, `docs/PROJECT_AUDIT.md`, `docs/LIVE_SYSTEM_BLOCKERS.md` |
| 2. App-layer architecture decisions | ✅ FINAL (2026-07-09) | 3 decisions below, made with the user before writing the design doc |
| 3. App-layer design docs | ✅ done (2026-07-09) | **`ARCHITECTURE.md`** (complete spec, 13 sections) + **`ARCHITECTURE_DIAGRAMS.md`** (Mermaid source, 8 diagrams) + **`ARCHITECTURE.drawio`** (generated, 8 pages, editable native shapes; regenerate via `node docs/db-audit/generate-architecture-drawio.mjs` after MD edits) |
| 4. Implementation | ⬜ next | Backend module changes, frontend form changes, `python_worker` rewrite, new `config/` + `sync-config` — see "Next phase" below |

## Decisions — do NOT re-litigate
- **Report engine unifies into ONE pipeline. Rendering is Python-only** (openpyxl for Excel, WeasyPrint for PDF, Python `csv` for CSV) — no ExcelJS, no ad-hoc Puppeteer, except as a documented per-proforma escape hatch if WeasyPrint genuinely can't achieve a specific layout. Node keeps HTTP/RBAC/job-orchestration; Python queries typed columns directly via SQLAlchemy (`pharos_report_ro` role) instead of receiving pre-flattened JSON. Kills: the in-memory template array + 17 hardcoded `DAILY_DIARY_PARALLEL` entries in `reports.controller.js`, the Node Puppeteer/ExcelJS/CSV-string paths, the `execSync`-to-python CLI-arg-password hack, the 24 sheets' jsonb-key-guessing (`formatters.py` prefix-sniffing) — replaced by direct typed-key access.
- **Frontend standardizes on `frontend/src/components/forms/DynamicForm.jsx`** (the multi-step one, 4231 lines) as the one form engine. The Ant Design `DynamicForm` (dead, unrouted) and the 5 legacy flat-blob pages (`CaseManagement.jsx`, `ArrestManagement.jsx`, `PCRCallEntry.jsx`, `MissingPersonEntry.jsx`, `UIDBManagement.jsx`) are retirement/migration targets, not maintained in parallel.
- **Diagrams are new, separate files, draw.io-importable.** Nothing under `docs/db-audit/` that predates this session (`DB_SCHEMA.md`, `ER_DIAGRAM.*`, `DB_REDESIGN_DECISIONS.md`, `DB_GROUND_TRUTH.md`, `HANDOFF.md`, `generate-drawio.mjs`, `schema.sql`, `schema-browser.html`, `PRISM-Server-Final.xlsx`) was modified — verified via `git status`/mtime check at the end of the design session (all predate 2026-07-09; only `ARCHITECTURE.md`, `ARCHITECTURE_DIAGRAMS.md`, `ARCHITECTURE.drawio`, `generate-architecture-drawio.mjs` are new).
- **Scope of this pass: design docs only.** No backend/frontend code was changed to produce `ARCHITECTURE.md`/the diagrams, mirroring exactly how the DB restructure's design phase (its own Phase 2–3) preceded its own separate implementation phase.
- `CLAUDE.md` is confirmed stale in multiple places (module list, upload storage mechanism, workflow module status, missing scripts) — `ARCHITECTURE.md` §1.3 has the correction table; refresh `CLAUDE.md` from it once implementation lands, not before (so `CLAUDE.md` doesn't drift further out of sync with a design that hasn't shipped yet).

## Key discoveries this session (context for anyone resuming)
- [x] The live system is considerably more advanced than `CLAUDE.md`'s Phase 2 roadmap suggests — `import`, `legacy`, `level-contracts`, `filters`, `daily-diary`, `warehouse`, `record-links`, `report-builder` modules all already exist and are non-trivial.
- [x] `record_persons`/`record_properties` tables **already exist** (migration `20260627000000`) as a hybrid (few extracted search columns + one big jsonb blob) — a real stepping stone toward the new fully-typed `persons`/`record_properties`, not a green field.
- [x] The live frontend form (`components/forms/DynamicForm.jsx`) **already** has a split `onSubmit(values, persons, properties)` contract and a genuinely metadata-driven property/vehicle repeater pattern — but victim/accused person-repeaters are a confirmed bug/gap: entries typed into those modals never reach the `persons[]` array sent to the backend.
- [x] `workflow_transitions_config` table exists but is **unseeded** — `FALLBACK_TRANSITIONS` (hardcoded in `records.service.js`) is load-bearing in every real deployment today.
- [x] Two live `record_revisions` write paths exist (inline in `records.service.js` for CREATE/UPDATE/HEAD_OVERRIDE; async via `auditHandler.js` for SUBMIT/APPROVE/SEND_BACK/SEAL) — a real race-condition risk for the hash chain, not just a style inconsistency.
- [x] Three independent report-rendering engines exist today (Node Puppeteer/ExcelJS/CSV in `reports.controller.js`; RabbitMQ-driven `python_worker` with 24 hand-coded jsonb-key-guessing sheet files; `report-builder`'s ad-hoc jsonb-key-matching `queryEngine.js`) — all read `records.data::jsonb` directly.
- [x] Confirmed dead/orphaned code (do not build around it, delete it): `workflow.service.js`/`workflow.controller.js`, `notifications.service.js`'s `initSubscriptions()`, the Ant Design `DynamicForm` + its 2 dead pages, `context/AuthContext.jsx` (singular), `api/records.api.js`, `backend/scripts/menu_table().js`.
- [x] `ARCHITECTURE.md` written — 13 sections (system overview, event bus, RBAC, records write path, workflow engine, transfers, config-as-data, ref loader, unified report engine, frontend, hash chain, kill list, migration posture).
- [x] `ARCHITECTURE_DIAGRAMS.md` written — 8 diagrams (1 component/container overview, 5 low-level sequences, 1 config-sync flowchart, 1 workflow state diagram).
- [x] `generate-architecture-drawio.mjs` written (new, separate from `generate-drawio.mjs`) — parses `flowchart`/`graph` (layered box+arrow autolayout), `sequenceDiagram` (lifelines + ordered messages + alt/note rendering), and `stateDiagram-v2` (state nodes + transitions + notes) Mermaid blocks into native draw.io shapes.
- [x] `ARCHITECTURE.drawio` generated (2026-07-09) — 8 pages, verified well-formed via `xmllint --noout` and every page confirmed to have ≥1 shape (91 vertices + 192 edges total across all pages).

## Next phase (implementation) — suggested order, sequenced by risk (per `ARCHITECTURE.md` §13)

> **2026-07-13 — SUPERSEDED by `docs/ENGINEERING_BASELINE.md` P1.5.** The baseline re-ranks
> this list: write path → validation/normalization layer → fields+frontend → import (template
> output FROZEN) → remaining modules → report engine → transfers → hash-chain enforcement
> LAST (item 6 below deferred; its hooks — append-only, in-transaction revisions, one write
> path — stay mandatory per baseline P6). Items 1–4 remain first in both orderings.

**Lower-risk, already half-built — do these first:**
1. `record_persons`/`record_properties` → typed `persons`/`record_properties` migration (schema change + value-copy from existing jsonb blobs).
2. Seed `workflow_transitions_config` from `config/workflow/*.json`; delete `FALLBACK_TRANSITIONS` and `workflow.service.js`/`workflow.controller.js`.
3. Generalize `01_fields.js`/`03_config.js`'s upsert pattern into one `npm run sync-config` command covering all four config tables.
4. Frontend: close the victim/accused persons-array gap; generalize the property-repeater pattern to every person role (`ARCHITECTURE.md` §10.3); delete the dead-code retirement list (§10.4).

**Higher-risk, genuinely new — no existing code to build on:**
5. `ref` schema + its loader (rename `excel_*`→`ref.*`, real FK discipline, fail-loud loader).
6. Hash-chain single-write-path consolidation (delete `auditHandler.js`'s revision-write branch, add row-locking to `records.service.js`'s SUBMIT/APPROVE/SEND_BACK/SEAL paths) + scheduled verification job + break/freeze runbook (new `audit.chain_break_detected` subscriber).
7. `transfers` module end-to-end (two-step handshake, `fir_number_counters` allocator, RBAC).
8. Unified report engine — the largest single piece: retire the 3 existing pipelines, rewrite `generator.py`'s `query_records()` for typed columns, migrate all `report_templates`/proforma definitions into `config/proformas/*.json`, set up the `pharos_report_ro` role.
9. Refresh `CLAUDE.md` from `ARCHITECTURE.md` once the above has actually shipped (not before — don't let docs describe an unshipped design as current reality).

## Resume here if context lost
Read `ARCHITECTURE.md` (app-layer design truth) → `ARCHITECTURE_DIAGRAMS.md`/`.drawio` (visuals) for this layer. For the DB layer underneath: `DB_SCHEMA.md` → `DB_REDESIGN_DECISIONS.md` (the why); old-schema questions: `DB_GROUND_TRUTH.md`. DB-layer resume-point: `docs/db-audit/HANDOFF.md`. Memory: `~/.claude/projects/-home-ashmit-Projects-Crime-Diaries/memory/db_restructure_2026_07.md` (may need a sibling entry for this app-layer track — check before assuming it covers both).
