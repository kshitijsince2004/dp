# PHAROS — Full Project State Snapshot

Date: 2026-09-04
Branch: `testing/vaibhav`
Compiled from `context-bundle/`, `docs/handoff/`, live config, and git history. This is everything needed to restart and continue building.

---

## 1. What PHAROS is

A **Delhi Police crime records + statutory reporting system** (prototype, also referenced as PRISM). It replaces manual police station diaries with a digital records spine and auto-generates the statutory fortnightly/PHQ/district diaries and analytical reports.

- **5 record types:** `CASE` (FIR), `ARREST`, `PCR_CALL`, `MISSING`, `UIDB` (unidentified dead body)
- **Hierarchy:** Police Station → Sub-Division → District → HQ (ZONE/RANGE modeled but not in the active workflow path)
- **9 roles:** HC/PS, SHO, ACP, DISTRICT / DISTRICT_OFFICER, HQ_ANALYST, HQ_ADMIN, SYSTEM_ADMIN (+ JCP/SCP endpoints stubbed)
- **Workflow:** `DRAFT → PENDING_SHO → DISTRICT_REVIEW → HQ_RECEIVED → ARCHIVED`, with `SENT_BACK` paths. Fully data-driven via `workflow_transitions_config` (zero hardcoded states).

---

## 2. How to start the project again

### Prerequisites
- Docker Desktop (PostgreSQL 16, RabbitMQ 3, Redis 7 via `docker-compose.yml`)
- Node.js (backend is `"type": "module"`, ESM)
- Python 3 (optional — only for the background report worker in `python_worker/`)

### Ports (IMPORTANT — mismatch is a known trap, KI-001)
| Service | Port | Notes |
|---|---|---|
| Postgres | **5435** → 5432 in container | `docker-compose.yml` remaps to avoid local PG clash |
| Backend API | **3000** | `backend/.env` `PORT=3000` |
| Frontend (Vite) | **5173** | |
| RabbitMQ | 5672 / 15672 (mgmt) | user `pharos` / `pharos123` |
| Redis | 6379 | |

`backend/.env.example` is **wrong** (says port 5432, PORT 5000). The real working values are in `backend/.env`:
```
DATABASE_URL=postgresql://postgres:postgres@localhost:5435/pharos_db
PORT=3000
RABBITMQ_URL=amqp://pharos:pharos123@localhost:5672
REDIS_URL=redis://localhost:6379
WAREHOUSE_SYNC_ENABLED=false
WAREHOUSE_QUERY_MODE=LIVE_ONLY
STARTUP_AUTOLOAD=true
JWT_SECRET / JWT_ACCESS_SECRET / JWT_REFRESH_SECRET  (dev values present)
REPORTS_DIR=./generated-reports
REPORT_TEMPLATE_PATH=../Master/Daily_Diary_ProperHeaders template.xlsx
```
`knexfile.js` falls back to `postgresql://pharos:pharos@localhost:5432/pharos_db` if `DATABASE_URL` is unset — so the `.env` must be present.

### One-shot launcher
`start.bat` (Windows) does the whole sequence:
1. Frees ports 3000 / 5173
2. Starts Docker Desktop + `docker compose up -d`, waits for port 5435
3. `backend: npm install`
4. `npm run db:migrate` (knex, 19 migration files)
5. `npm run db:seed`
6. `node scripts/seed-test-data.js` (dev records)
7. `node scripts/template-regression.js baseline`
8. Launches frontend (`npm run dev`), Python worker, backend (`npm run dev`)

`start-no-install.bat` skips the npm installs. `start.sh` / `stop.sh` are the POSIX equivalents.

### Manual start
```bash
docker compose up -d
cd backend && npm install && npm run db:migrate && npm run db:seed
node scripts/seed-test-data.js
npm run dev                      # API on :3000
cd ../frontend && npm install && npm run dev   # UI on :5173
cd ../python_worker && pip install -r requirements.txt && python main.py   # optional
```

### Useful backend scripts (`backend/package.json`)
`db:migrate` `db:seed` `db:rollback` `db:reset` (`scripts/dev/db-reset.mjs`) · `sync-config` · `load-ref` · `import:parity` · `import:corpus` · `audit:verify` (`verify-audit-chain.mjs`) · `seed:test-data` · `logs:clear` · `test` (`scripts/verify_.js`)

---

## 3. Tech stack

**Backend:** Node ESM, Express 4, Knex 3 + `pg`, JWT auth (`jsonwebtoken`, `keycloak-connect` present but not wired), `helmet`, `express-rate-limit`, CSRF double-submit, `amqplib` (RabbitMQ), `ioredis`, `exceljs`, `puppeteer`, `winston`, `node-cron`. `mongoose` is a **dead dependency** (KI-010).

**Frontend:** React 19, Vite 8, Tailwind v4, Ant Design 5 + lucide-react, `@tanstack/react-query` 5, `zustand`, `react-router-dom` 7, `react-hook-form` + `zod`, `recharts`, `i18next` (EN/HI), `framer-motion`.

**Worker:** Python, RabbitMQ consumer for async report generation.

---

## 4. Repository layout

```
backend/
  src/
    app.js                 # all route mounts (see section 5)
    config/                # db.js, env.js, email.js
    modules/               # 26 feature modules (below)
    utils/                 # logger, etc.
  migrations/              # 19 knex migrations (2026-07-11 -> 2026-08-24)
  seeds/                   # 01_fields.js etc.
  scripts/                 # ~40 ops/import/audit scripts
  config/                  # warehouse/reportable-fields.json, diary/, sections/, ref-data/
  test/                    # search/, cross-module/ (reconciliation + scope-security)
frontend/
  src/
    routes/AppRouter.jsx   # all routes
    pages/                 # hc/ sho/ district/ hq/ admin/ analytics/ reports/ shared/
    features/ components/ contexts/ store/ utils/
python_worker/             # main.py, requirements.txt
context-bundle/            # technical ground-truth docs (see section 12)
docs/handoff/              # 01-PRD ... 14-GLOSSARY, README
docs/db-audit/             # schema dumps, ER diagrams, redesign decisions
```

Backend modules (`backend/src/modules/`): `admin, analytics, audit, auth, classification, compilation, daily-diary, fields, filters, hierarchy, import, io, level-contracts, logs, notifications, phq-diary, record-links, records, report-builder, report-engine, reports, search, users, warehouse, workflow`.

---

## 5. API surface (`backend/src/app.js`)

Every router is mounted at both `/api/v1/<x>` and `/api/<x>`:

`auth, fields, records, workflow, analytics, compilations, reports, import, users, admin/users, admin/hierarchy, hierarchy, investigating-officers, admin, audit, level-contracts, filters, notifications, daily-diary, phq-diary, warehouse` — plus **report-builder** and **search** (search mounted at `/api/v1/search` and `/api/search`, wired from `modules/search/search.controller.js`), and **record-links**, **io**.

Security middleware chain: `helmet` -> `cors` -> json/urlencoded (10mb) -> cookieParser -> request logger -> logs router (before auth) -> `ipAllowlistMiddleware` -> `csrfDoubleSubmitMiddleware` -> `morgan` -> rate limiters (`apiLimiter` on `/api/`, `authLimiter` on auth).

---

## 6. Database architecture (non-negotiable rules)

From memory `project_db_architecture.md` (verify against live before relying on file:line):

1. **All field config -> `field_registry` table.** Frontend fetches labels/types/options/`show_when` from DB. Never hardcode a label or input type in React.
2. **All domain data -> `records.data` JSONB.** Keys = `field_registry.field_key`. No domain columns on `records`.

**Core tables:** `hierarchy_nodes`, `users`, `field_registry`, `records`, `record_revisions` (SHA-256 tamper chain), `workflow_transitions`, `compilations`, `record_persons`, `record_properties`, `notifications`, `audit_logs`, `report_jobs`. Reference data under `ref.*` schema (`ref.local_heads`, `ref.sections`, `ref.acts`, `ref.beats`, `ref.fire_arms`, `ref.automobiles`, ...).

**`show_when` formats:** simple `{field,value}`, multi-value array, `{operator:"filled"}`, compound `{and:[...]}`.

**Repeater entities:** `PERSON_COMPLAINANT/ACCUSED/VICTIM/ARRESTED/MISSING`, `PROPERTY`.

**Adding fields (project practice):** write a timestamped migration in `backend/migrations/` (not the seed file). Schema-only migrations — see `docs/ENGINEERING_BASELINE.md`.

**Filter engine:** ~41 operators in `records.service.js buildFilterQuery`; virtual fields prefixed `_` (`_status`, `_record_date`, `_is_legacy`, `_sla_breached`).

---

## 7. Feature status

### Done / operational
| Area | Status |
|---|---|
| 5 record types CRUD + lifecycle | done |
| Data-driven workflow engine (submit/review/send-back/seal/`@PRIOR`) | done |
| SHA-256 audit chain (`record_revisions`) + `audit:verify` | done |
| RBAC — 9 roles, server-side `allow()` + `enforceScope` | done |
| Dynamic field registry (`show_when` / `required_when` at runtime) | done |
| Kalandra preventive-arrest tracking (`is_dd_based=true`, separated from FIR arrests) | done |
| Two-phase bulk Excel import (pre-validate + commit) | done |
| Station / District / HQ dashboards + crime-head matrices | done — routed through `diaryCount()`, zero divergence vs diary |
| Hierarchy: 225 PS with diary metadata, 2,855 beats -> PS linked 100% | done |
| Notifications (polling 45s, event triggers, retention prune script) | done |
| i18n EN/HI | done |

### Blocked (product decisions needed)
- **Court proceedings module (B5):** deferred; basic milestones on `fir_details` columns only. Awaits NJDG.
- **Kalandra judicial disposal (B6):** arrests captured, SEM/court disposal register not built -> STAT_14/21 disposal columns stubbed.
- **Proclaimed Offenders register (B6):** STAT_15 is a blocked stub.
- Also stubbed for the same reason: STAT_40, STAT_41 (court sheets).

### In progress (uncommitted — see section 9)
- **Universal / Natural-Language Search** (`modules/search/`) — newest work
- **Report builder field reorganization** (form-matched categorized sections)
- **Pivot engine zero-hardcoding + crime-category / Act-category filters**
- **Dashboard analytics service** (`modules/analytics/dashboard.service.js`, untracked)

---

## 8. Report / diary engine detail

Three layers, unified on **one shared predicate builder** (`buildWindowPredicate`, `buildHeadPredicate`, `buildScopePredicate`, `getDateAnchorExpr`) so all three produce identical counts.

**Part A — Statutory Diary Engine** (`modules/report-engine/`, `daily-diary/`, `phq-diary/`)
- **FN Diary:** 41 STAT sheets — **38 implemented**, 3 correctly stubbed (STAT_15, 40, 41). (Some older docs say 43 sheets / universal zero-fill policy.)
- **PHQ Diary:** 9/9 · **District Diary:** 5/5 · **Comparative Report:** 5 x 3 scopes, single `buildComparativeReport`
- Canonical head coverage: **237 / 237 `ref.local_heads` mapped** (was 58, then 156, now 100%)
- **23 districts** resolved at runtime (15 territorial + 8 specialised) — no hardcoded 18/15
- Reconciliation gate: `RECONCILIATION_FAILED` error blocks report generation on subtotal mismatch
- Record trace: `GET /api/v1/reports/trace/:recordId`
- Config single-source-of-truth files: `backend/config/diary/case-status-map.json`, `backend/config/sections/section-groups.json`

**Part B — OLAP Warehouse / Pivot Engine** (`modules/warehouse/pivot-engine.js`, `report-builder/queryEngine.js`)
- `crime_head` dimension groups strictly by `canonical_code`; date via `getDateAnchorExpr`
- Both raw `case_status` and grouped `case_status_category`
- **450 / 450 dimension x measure combinations tested & passing**
- Running in `LIVE_ONLY` mode (`WAREHOUSE_SYNC_ENABLED=false`) — dropped materialized warehouse schema, queries hit live tables
- `backend/config/warehouse/reportable-fields.json` maps friendly fields -> exact SQL (fixed `act_cd`, `sub_div_id`, `property_value_stolen/recovered`, `person_count`)

**Part C — Excel Export Manager / Dossier Builder** (`frontend/src/pages/reports/CustomExcelBuilder.jsx`, `MultiSheetReportBuilder.jsx`)
- 9 officer presets incl. **360 FIR Dossier**; ExcelJS streaming; `sanitizeExcelCell` neutralizes `= + - @` formula injection; resilient polling (5-error tolerance, 3-min timeout)
- `report_jobs` fixed to insert valid UUID `template_id` / `created_by`

**Frontend reports hub** (`ReportsPage.jsx`): 3 tabs — (1) Numerical Pivot Matrix (`ReportBuilder.jsx`), (2) Descriptive Record Dossier (`CustomExcelBuilder.jsx`), (3) Real-Record Correctness Trace (`RecordTracePanel.jsx`). Plus `NaturalLanguageSearchPanel.jsx` (new).

**Tests (all passing):** `test/cross-module/analytics-diary-reconciliation.test.js`, `report-grain-reconciliation.test.mjs`, `scope-security.test.js`, `test/search/nl-search.test.mjs`.

**Open domain decisions (all resolved 2026-08-27, `22-CORRECTNESS-SYSTEM/NEEDS-DECISION.md`):** D1 zero-denominator -> show `-`/`100%`; D2 cyber fraud -> count only under STAT_32; D3 bound-down -> `PROSECUTED/BOUND_DOWN`; D4 null residence -> `Outside Delhi/Unspecified`.

---

## 9. Uncommitted work (git status on branch `testing/vaibhav`)

**Modified (tracked):**
- `backend/config/warehouse/reportable-fields.json`, `backend/knexfile.js`, `backend/src/config/env.js`
- `backend/src/app.js` (search router mount)
- `backend/src/modules/fields/fields.controller.js`
- `backend/src/modules/report-builder/queryEngine.js`, `reportBuilder.controller.js`, `reportableFields.config.js`
- `backend/src/modules/report-engine/shared/diary-query-builder.js`, `trace-record.js`
- `backend/src/modules/reports/reports.controller.js`
- `backend/src/modules/warehouse/pivot-engine.js`
- `frontend/src/pages/reports/CustomExcelBuilder.jsx`, `MultiSheetReportBuilder.jsx`, `ReportBuilder.jsx`, `ReportsPage.jsx`

**Untracked (new, not committed):**
- `backend/src/modules/search/` — **NL/universal search module** (`nlParser.service.js`, `nlSearch.service.js`, `search.controller.js`, `seizureTaxonomy.js`)
- `backend/src/modules/analytics/dashboard.service.js` — single-measure dashboard engine
- `backend/scripts/cleanup-old-notifications.mjs` — retention prune
- `backend/test/cross-module/`, `backend/test/search/` — new test suites
- `frontend/src/pages/reports/NaturalLanguageSearchPanel.jsx`
- `context-bundle/23...28` docs, `PRISM .pptx`

**Search feature state (context-bundle 27/28):** Phase 0 done (field catalog + gap analysis). Planned Phase 1: seed `ref.seizure_item_taxonomy` with colloquial synonyms (chaku/talwar/katta/lathi...); `pg_trgm`/`tsvector` **not installed** — currently `ILIKE '%term%'` scans. PII fields (complainant/victim/accused names) gated behind `pii_min_role: DISTRICT_OFFICER`. Search executes through scoped Knex builder (`resolveUserScope(req.user)`).

WARNING: None of this has been `git push`ed — reports say "all changes kept strictly local."

---

## 10. Known issues & tech debt (`docs/handoff/12-KNOWN-ISSUES.md`)

| ID | Issue | State |
|---|---|---|
| KI-001 | `.env.example` port mismatch (5432 vs 5435, PORT 5000 vs 3000) | Open — fix example files |
| KI-002 | One legacy Kalandra record had bad `CASE_ARREST` link | Fixed + guarded (`is_dd_based=false`) |
| KI-003 | Head-sliced diary null counts for unmapped heads | Resolved — 237/237 now mapped |
| KI-004 | Table typography/viewport calibration | Fixed (`recordRef.js`, `statusConfig.js`) |
| KI-005 | `record_transfers` table unused (transfers live on `fir_details`) | Mark for deprecation |
| KI-006 | `ref.beats.ps_id` backfill | Done 2,855/2,855 |
| KI-007 | Frontend route guards missing on some admin routes | Fixed (`ProtectedRoute` roles) |
| KI-008 | ZONE/RANGE levels not in workflow path | Deferred |
| KI-009 | JCP/SCP approval endpoints bypassed by `DIRECT_HQ` contracts | By design for now |
| KI-010 | `mongoose` dead dependency (~20MB) | Remove |
| KI-011 | Winston log files unrotated (`backend/logs/*.log` are GB-scale) | Add daily rotation |
| KI-012/13/14 | Court module / Kalandra disposal / PO register | Blocked, product decision |

`arrests_missing_case_link: 17,028` — resolved by querying ARREST records directly instead of requiring `CASE_ARREST` link rows. `offences_with_unresolvable_section: 39`, `cases_missing_primary_offence: 5` — minor data-quality residue.

---

## 11. Roadmap / next steps (`docs/handoff/13-ROADMAP.md`)

**Phase 1 — pre-rollout polish:** Winston log rotation (cap 50MB); purge mongoose; deprecate `record_transfers`; end-to-end pilot at trial stations (PS Parliament Street, Connaught Place); finish client-side role guards.

**Phase 2 — operational completeness (1–3 mo):** Kalandra SEM disposal register (unblocks STAT_14/21); Proclaimed Offenders module (STAT_15); district compilation approval UI; Keycloak/Police SSO (adapter already a dependency); Redis session revocation/blacklist.

**Phase 3 — enterprise scale (3–6 mo):** NJDG integration; CCTNS bi-directional sync; predictive/hotspot analytics; mobile/PWA field companion; multi-state generalization.

**Immediate (current thread):** finish + commit the search module and report-builder/pivot changes now sitting uncommitted; wire `ref.seizure_item_taxonomy` seed; decide on `pg_trgm` for fuzzy search.

---

## 12. Context-bundle document index (`context-bundle/`)

| File | Contents |
|---|---|
| `00-INDEX.md` | Repo file tree + line counts (mostly log listings) |
| `01-SCHEMA.md` | All migrations verbatim (the real DDL) |
| `02-CONFIG.md` | knexfile, `db.js`, `env.js`, workflow/field-registry JSON |
| `03-API.md` | Full Express route table, middleware, roles |
| `04-BACKEND.md` | Module-by-module outline + workflow engine verbatim |
| `05-FRONTEND.md` | React routes, API client map, dead-API analysis |
| `06-WORKER.md` | Python RabbitMQ worker |
| `07-DECISIONS.md` | 1.1MB — all in-repo architectural rulings/specs |
| `08-DISCREPANCIES.md` | 12 reconciliation questions, code-verified answers (trust over handoff docs) |
| `10-HEAD-MAPPING-REVIEW.md`, `11-COMPLETION-REPORT.md` | Diary head-mapping + completion |
| `12-KALANDRA-AUDIT.md`, `16`–`20` | Kalandra audit, blocker resolution, field audit, audit-trail, warehouse builder |
| `22-CORRECTNESS-SYSTEM/` | `STATUS.md`, `NEEDS-DECISION.md` (D1–D4) |
| `23` ... `25` | Notif/dashboard/analytics readiness; report-system-complete; report-engine hardening; formula correction |
| `26-PHAROS-PHASE0-INVENTORY/` | `db-stats.json` |
| `27-NL-SEARCH/` | `00-GAP-ANALYSIS.md`, `phase0-ref-tables.json` |
| `28-UNIVERSAL-SEARCH/` | `00-FIELD-INVENTORY.md`, `field_catalog.json` |

Also read for deep context: `docs/handoff/01-PRD.md ... 14-GLOSSARY.md`, `docs/db-audit/DB_REDESIGN_DECISIONS.md`, `docs/ENGINEERING_BASELINE.md`, `PHQ_DIARY_FORMULA_SPEC.md`, `PHAROS_DIARY_COMPLETION_PROMPT.md`.

---

## 13. Engineering discipline rules (enforced across this codebase)

- Schema-only migrations; never edit an existing migration — add a new one
- Single write path; no domain columns on `records`
- No hardcoded crime-head strings — `canonical_code` only
- Status enums only from `case-status-map.json`; section groups only from `section-groups.json`
- Per-record-type date anchors via `getDateAnchorExpr` everywhere
- `persons.is_minor` is a generated column — use it, never recompute `age < 18`
- Arrested-person counts via `record_links` + `link_type_registry.code='CASE_ARREST'` (plus direct ARREST fallback), never `arrest_details.fir_no`
- Scope always from authenticated `req.user` via `resolveUserScope` — never trust a client-supplied scope id
- Blocked cells emit `—`, never a fabricated `0`
