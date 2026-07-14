# PHAROS — Project Context for AI Assistants

**Police Hierarchical Automated Reporting & Operations System**
Repo: `Crime-Diaries` | Stack: Node.js/Express + PostgreSQL + RabbitMQ + React/Vite

---

# ⚠ DB RESTRUCTURE STATUS (2026-07-11) — READ FIRST

The database was **fully rebuilt** (stages 1–4 of the restructure; design truth =
`docs/db-audit/DB_SCHEMA.md`, resume-point = `docs/db-audit/HANDOFF.md`):

- **Schema is NEW**: `records` spine + 5 typed detail tables (`fir_details`, `arrest_details`,
  `pcr_call_details`, `missing_details`, `uidb_details`) + `persons`/`record_properties`/
  `locations`/`record_offences`. **`records.data` jsonb no longer exists.** `excel_*` tables
  are now `ref.*` (21 lookup tables, real FKs). `users.station_id` is now `users.ps_id`.
- **Config-as-data**: form fields / workflow / proformas / level contracts are authored in
  repo-root `config/` and synced by `npm run sync-config` (see `config/README.md` — includes
  the full `storage` mapping contract). Migrations are schema-only forever.
- **First-time DB setup (new)**: from `backend/`:
  `npm run db:reset && npm run db:migrate && npm run sync-config && npm run load-ref && npm run db:seed`
- **STAGE 5 IS PENDING — the backend/frontend code is NOT yet adapted.** The `records`,
  `fields`, `import`, `daily-diary`, `warehouse`, `report-builder` modules and `python_worker`
  still read `records.data` jsonb and `excel_*` — they are BROKEN against the new DB until the
  write-path rewrite (registry-driven split into spine/detail/persons/properties/locations/
  offences per `field_registry.storage`). Mock record seeding (`scripts/seed-test-data.js`)
  is also old-schema. Do not "fix" the modules by recreating old tables — adapt them per
  `docs/db-audit/ARCHITECTURE.md`; kill list in `DB_SCHEMA.md` §11 (FALLBACK_TRANSITIONS,
  workflow.service.js, EAV pair, `compilations.record_ids`, in-memory report templates).
- **Hierarchy is official now**: `config/org/hierarchy.json` = 349 nodes rebuilt from the
  official Delhi Police code list (`config/ref-data/PS_Codes.xlsx` → `config/org/ps_codes.json`
  via `backend/scripts/dev/build_ps_codes.py`): 23 districts (incl. Crime Branch/EOW/IGI/
  Metro/Railways/Special Cell/SPUWAC/Vigilance), 92 real SDPO sub-divisions (the old generic
  sub-division layer is gone), 225 PS each with `metadata.official_code`. Beats: 2,090/2,855
  linked; 765 beats reference 71 codes absent from the official list itself → `ps_id` NULL,
  raw code in `source_ps_cd` (loader prints them).
- **Open items**: 71 unreconciled beat ps_cds (above); heinous overlay terror-candidates
  pending review (`config/ref-overlays/local_head_categories.json`).

Sections below describe the app layer as it still is; DB-related parts of them are stale
where they conflict with the above.

# ⚠ ENGINEERING BASELINE (2026-07-13) — BINDING FOR ALL STAGE-5+ WORK

**`docs/ENGINEERING_BASELINE.md` is the permanent rules-of-conduct contract.** Read it
before implementing anything. The six principles, in one line each:

- **P1** Typed schema only, ONE write path (`records.service.js`), registry-driven
  storage split, RabbitMQ for cross-module — adaptation order re-ranked there
  (audit enforcement moved LAST).
- **P2** Validation = constrain (UI dropdowns/pickers) → normalize (single registry-driven
  API layer: dates→ISO, phones→digits, casing, FIR refs) → enforce (DB constraints as last
  line). Officers are non-tech-savvy and shifts rotate — reject only the impossible.
- **P3** The bulk-import Excel template's OUTPUT is a **frozen contract** — never change
  its columns/order/labels/dropdowns without explicit user sign-off. Template = what we
  collect; `field_registry` = where it's stored; a checked mapping + parity check bridges
  them. Registry-generated template is the goal only once it passes byte-parity.
- **P4** Frontend is dumb: renders from `/fields/form/:type`, fetches ALL domain data from
  backend APIs, computes nothing authoritative. Hardcoded arrays are debt — drain on touch.
- **P5** Every endpoint scoped: `enforceScope` + `jurisdictionQuery` in every query,
  `verifyRecordAccess` on every single-record op, detail tables scoped through the spine,
  `ps_id` stamped from `req.user` never the body.
- **P6** Audit enforcement is deferred but hooks stay warm: append-only, revision +
  audit_log in-transaction via the one write path, events after commit.

The review checklist at the bottom of that doc applies to every change.

# AI Agent Rules

Before modifying code:

1. Read affected module completely.
2. Prefer existing patterns over introducing new ones.
3. Do not add new dependencies without justification.
4. Do not bypass RabbitMQ for cross-module communication.
5. Show implementation plan before large refactors.
6. Preserve backward compatibility for API routes.
7. Comply with `docs/ENGINEERING_BASELINE.md` (P1–P6 + checklist).

---

## 1. Architecture Pillars (NON-NEGOTIABLE)

| Pillar | Rule |
|--------|------|
| Dynamic Field Registry | Forms render from `field_registry` DB rows. Zero hardcoded form fields ever. |
| ~~JSONB Records~~ Typed records (2026-07) | Domain data lives in typed columns (spine + detail + persons/properties/locations/offences per `DB_SCHEMA.md`). New field without deploy = `field_registry` row with `storage: "extra"`; reporting-grade fields get real columns via promotion (`config/README.md`). |
| Event Bus Isolation | Modules never call each other directly. All cross-module comms via RabbitMQ `publish/subscribe`. |
| Append-only Audit | Every mutation writes to `record_revisions` + `audit_logs`. Records are never deleted — only status-changed. |
| Hierarchy as Config | `hierarchy_nodes` is a self-referencing tree. New PS/District/level = new row, zero code change. |
| Bilingual | `field_registry.labels` stays `{"en","hi"}` (the one live bilingual case). `ref.*` and config tables are English-only single columns — Hindi there is additive later, never a redesign (2026-07 decision). |
| Config over Code | Workflow transitions, report templates, role permissions — all DB rows, not hardcoded logic. |

---

## 2. Hierarchy & Roles

```
HC (Head Constable) → SHO → DISTRICT_OFFICER → JCP → SCP → HQ_ANALYST / HQ_ADMIN / SYSTEM_ADMIN
```

| Role | Level | Scope |
|------|-------|-------|
| HC | PS | Own PS only (`ps_id`) |
| SHO | PS | Own PS only (`ps_id`) |
| DISTRICT_OFFICER | DISTRICT | Own district (`district_id`) |
| JCP | JCP | Sub-division (`sub_div_id`) |
| SCP | SCP | Range |
| HQ_ANALYST | HQ | All districts (read-only) |
| HQ_ADMIN | HQ | All districts + config |
| SYSTEM_ADMIN | SYSTEM | Everything |

---

## 3. Workflow States

```
DRAFT → PENDING_SHO → DISTRICT_REVIEW → COMPILED → JCP_REVIEW → SCP_REVIEW → HQ_RECEIVED → ARCHIVED
              ↓ send-back           ↓ send-back
         SENT_BACK (→ HC)      SENT_BACK_PS (→ SHO)

Special: LEGACY_IMPORTED (bypasses all workflow), AMENDMENT_PENDING
```

**State machine lives in** `records.service.js` → `transitionRecord()` TRANSITIONS config object.  
Adding new state = add entry to TRANSITIONS. Do NOT add if/else chains.

---

## 4. Backend — Directory Structure

```
backend/
├── src/
│   ├── app.js                    # Express setup, route registration, event handler init
│   ├── config/
│   │   ├── db.js                 # Knex PostgreSQL pool
│   │   ├── env.js                # All env vars (validated)
│   │   └── swagger.js            # Swagger spec
│   ├── events/
│   │   ├── eventBus.js           # RabbitMQ publish/subscribe (topic exchange: 'pharos')
│   │   └── handlers/
│   │       ├── auditHandler.js   # Subscribes 'record.*' → writes record_revisions
│   │       └── notifyHandler.js  # Subscribes 'record.status_changed', 'compilation.submitted'
│   ├── middleware/
│   │   ├── auth.middleware.js    # authMiddleware — JWT Bearer verify → req.user
│   │   ├── rbac.middleware.js    # allow(...roles), enforceScope, verifyRecordAccess
│   │   ├── validate.middleware.js # express-validator error collector → 422
│   │   ├── rateLimiter.middleware.js
│   │   ├── upload.middleware.js  # Multer config
│   │   └── error.middleware.js
│   ├── modules/
│   │   ├── auth/                 # login, refresh, logout, /me, change-password [Dev 1]
│   │   ├── users/                # CRUD for user management [Dev 1]
│   │   ├── hierarchy/            # hierarchy_nodes CRUD + tree API [Dev 1]
│   │   ├── audit/                # getRecordAudit, getUserAudit, getAuditLogs [Dev 1]
│   │   ├── reports/              # Puppeteer PDF + CSV, 5 templates, async jobs [Dev 1]
│   │   ├── records/              # CRUD + submit/approve/send-back/override [Dev 2]
│   │   ├── fields/               # field_registry CRUD + /form/:record_type [Dev 2]
│   │   ├── workflow/             # Queue endpoint (delegates to records.service) [Dev 2]
│   │   ├── compilation/          # District roll-up → HQ submission [Dev 2]
│   │   ├── analytics/            # overview, trends, by-ps, by-crime-head, status-breakdown [Dev 2]
│   │   ├── notifications/        # list, unread count, mark-read, event handlers [Dev 2]
│   │   ├── upload/               # File upload (Multer/Cloudinary) [Dev 2]
│   │   └── admin/                # customFields, admin stats [Dev 1]
│   └── utils/
│       ├── ApiError.js           # throw new ApiError(statusCode, message)
│       ├── ApiResponse.js
│       ├── generateToken.js      # JWT sign/verify
│       ├── logger.js             # Winston
│       └── helpers.js
├── scripts/
│   ├── migrations.js             # Run once: node scripts/migrations.js
│   ├── seed-fields.js            # Seeds field_registry from master sheet
│   └── seed-mock-data.js         # Seeds 9 PS, 3 districts, 50+ records
└── index.js                      # Entry point (delegates to app.js startServer)
```

**File naming:** Each module has `*.router.js` (active, imported by app.js). Old `*.routes.js` files are orphaned — do NOT import them.

---

## 5. Database Tables (NEW schema, 2026-07 restructure)

**Complete spec: `docs/db-audit/DB_SCHEMA.md`** (every column/constraint/index — the single
DB context file; no re-analysis needed). Summary: 38 `public` tables + 21 `ref.*` lookups.

| Group | Tables |
|-------|--------|
| Org/identity | `hierarchy_nodes` (HQ→ZONE→RANGE→DISTRICT→SUB_DIV→PS, upserted from `config/org/hierarchy.json`), `users` (ps_id — station_id is dead), `investigating_officers` (records carries `io_id` only) |
| Record data | `records` spine + 1:1 detail tables `fir_details` / `arrest_details` / `pcr_call_details` / `missing_details` / `uidb_details`; `record_offences` (one row per section citation, `is_primary` = single-head classification); `persons` (+`arrestee_details`, `missing_person_details`, `person_descriptions`), `record_properties`, `locations` (all address blocks). Each detail/person/property/location row has ONE `extra` jsonb escape hatch. **No `records.data` blob. No EAV tables.** |
| Workflow/audit | `workflow_transitions_config` (THE state machine, synced from `config/workflow/`), `workflow_transitions` (ledger), `record_revisions` (hash-chain columns prev_hash/row_hash — single-write-path enforcement lands in stage 6), `record_transfers` + `fir_number_counters` (FIR allocator), `record_amendments`, `audit_logs` |
| Links/compilation | `record_links` + `link_type_registry`, `compilations` + `compilation_records` (frozen scope snapshots; `record_ids` array is dead) |
| Config/reporting | `field_registry` (UI metadata + **storage mapping** — see `config/README.md`), `level_data_contracts`, `report_templates`, `report_jobs`, `scheduled_reports`, `report_builder_*`, `filter_presets`, `import_batches`(+errors), `notifications` (type+params i18n) |
| `ref.*` | acts, sections, major/minor_heads, major_minor_mapping, local_heads (+crime_category overlay), beats, property_categories, other_property_items, arms (4 tables), automobiles, jewelry/currency/document/drug/electric/explosive/cultural types — loaded by `npm run load-ref`, natural-key verdicts in `docs/db-audit/REF_KEY_VERIFICATION.md` |

**Migrations:** `npm run db:migrate` (knex, `backend/migrations/2026071100000*` — 6 files, schema-only forever; config changes go in `config/`, never in migrations)

---

## 6. API Conventions

- Base URL: `/api/v1/` and `/api/` (both registered — dual compatibility)
- All responses: `{ success: true/false, data: {}, message?: "" }`  
- Errors: `{ success: false, message: "..." }` with appropriate HTTP status
- Auth: `Authorization: Bearer <token>` header
- Pagination: `?page=1&limit=20` → response includes `meta: { page, limit, total }`

**Key endpoints:**

| Module | Endpoint | Auth |
|--------|----------|------|
| Auth | `POST /api/auth/login` | Public |
| Auth | `GET /api/auth/me` | Bearer |
| Records | `POST /api/records` | HC only |
| Records | `POST /api/records/:id/submit` | HC only |
| Records | `POST /api/records/:id/approve` | SHO, DISTRICT_OFFICER |
| Records | `POST /api/records/:id/send-back` | SHO, DISTRICT_OFFICER |
| Records | `PATCH /api/records/:id/override` | DISTRICT_OFFICER, HQ_ADMIN |
| Records | `GET /api/records/queue` | All roles (scoped) |
| Fields | `GET /api/fields/form/:record_type` | Authenticated |
| Workflow | `GET /api/workflow/queue` | SHO, DISTRICT_OFFICER |
| Compilations | `POST /api/compilations` | DISTRICT_OFFICER |
| Reports | `POST /api/reports/generate` | Authenticated |
| Reports | `GET /api/reports/status/:id` | Authenticated |
| Analytics | `GET /api/analytics/overview` | Authenticated |
| Audit | `GET /api/audit/record/:recordId` | Authenticated |

---

## 7. RBAC Implementation

```js
// In router:
router.use(authMiddleware, enforceScope);        // sets req.user + req.jurisdictionQuery
router.post('/', allow('HC'), controller.create); // role check

// enforceScope sets req.jurisdictionQuery:
// HC/SHO → { ps_id }
// DISTRICT_OFFICER → { district_id }
// HQ_ANALYST/HQ_ADMIN/SYSTEM_ADMIN → {} (global)

// In service — always pass jurisdictionQuery to filter queries:
if (jurisdictionQuery.ps_id) query = query.where('records.ps_id', jurisdictionQuery.ps_id);
```

**verifyRecordAccess(recordId, user)** — called on every single-record operation to check geographical ownership.

---

## 8. Event Bus

```js
// Publish
await publish('record.status_changed', { recordId, action, from_status, to_status, performed_by });

// Subscribe (in handler files initialized in app.js startServer())
await subscribe('record.*', 'audit-queue', async (payload) => { /* write to record_revisions */ });

// Active events:
// record.created, record.updated, record.submitted, record.approved, record.sent_back
// record.status_changed, record.overridden
// compilation.submitted
// legacy.batch_imported (Phase 2)
```

---

## 9. Frontend — Directory Structure

```
frontend/src/
├── api/
│   ├── axios.js          # Axios instance with Bearer token interceptor
│   └── auth.api.js       # Auth API calls
├── components/
│   ├── DynamicForm/
│   │   └── DynamicForm.jsx   # Renders fields from GET /fields/form/:record_type
│   ├── layout/           # Shell, PoliceSidebar, PoliceNavbar, DashboardLayout
│   └── ui/               # Button, Card, Input, Modal, Spinner, ReportModal
├── context/
│   └── AuthContext.jsx   # React Context — user state, login/logout
├── features/
│   └── auth/             # LoginPage, RegisterPage
├── hooks/
│   ├── useAuth.js        # Reads AuthContext
│   └── useDebounce.js
├── i18n/
│   ├── config.js         # react-i18next setup
│   ├── en.json           # English strings
│   └── hi.json           # Hindi strings
├── pages/
│   ├── Dashboard.jsx / DashboardPage.jsx
│   ├── ArrestManagement.jsx
│   ├── CaseManagement.jsx
│   ├── PCRCallEntry.jsx
│   ├── MissingPersonEntry.jsx
│   ├── UIDBManagement.jsx
│   ├── queue/QueuePage.jsx       # SHO approval queue
│   ├── records/RegistrationPage.jsx
│   ├── analytics/AnalyticsPage.jsx
│   ├── reports/ReportsPage.jsx
│   ├── admin/
│   │   ├── UsersPage.jsx
│   │   ├── HierarchyPage.jsx
│   │   └── AuditPage.jsx
│   └── sho/              # SHO-specific pages (from recent pull)
├── routes/
│   ├── AppRouter.jsx     # All routes + lazy loading
│   └── ProtectedRoute.jsx # Redirects to login if no token
├── store/
│   └── authStore.js      # Zustand store for auth state
└── utils/
    ├── api.js            # Shared API helpers (from recent pull)
    ├── constants.js
    ├── formatters.js
    ├── hierarchyData.js
    ├── policeData.js
    └── validators.js
```

**DynamicForm contract:**
```jsx
<DynamicForm
  recordType="ARREST"           // fetches fields from /api/fields/form/ARREST
  initialData={record.data}     // pre-fill on edit
  onSubmit={handleSubmit}
  readOnly={false}
  highlightedFields={[]}        // Phase 2: amber highlight on send-back fields
  visibleFields={[]}            // Phase 2: Level Data Contract filtering
  showDiff={{ old, new }}       // Phase 2: audit diff view
/>
```

---

## 10. records.service.js — Key Functions

| Function | Description |
|----------|-------------|
| `listRecords(type, filters, jurisdictionQuery)` | Joins ps/district/user, applies scope + filters |
| `getRecordDetails(id)` | Record + revisions + transitions + customFields |
| `createRecord(user, type, date, data, ip)` | DB transaction: insert record + revision + audit_log, publish event |
| `updateRecord(id, user, data, ip)` | DB transaction: diff, update, revision, audit_log |
| `submitRecord(id, user)` | DRAFT/SENT_BACK → PENDING_SHO, writes transition + audit |
| `transitionRecord(id, user, action, comment, targetFields, ip)` | State machine — TRANSITIONS config object |
| `overrideCaseHead(id, user, newHead, reason, ip)` | HEAD_OVERRIDE revision, requires reason ≥ 10 chars |

**TRANSITIONS config (in transitionRecord):**
```js
PENDING_SHO: {
  approve:    { to: 'DISTRICT_REVIEW', toLevel: 'DISTRICT' },
  send_back:  { to: 'SENT_BACK', toLevel: 'PS', requiresComment: true }
},
DISTRICT_REVIEW: {
  approve:    { to: 'HQ_RECEIVED', toLevel: 'HQ' },
  send_back:  { to: 'SENT_BACK', toLevel: 'PS', requiresComment: true }
}
```

---

## 11. Environment Variables

```env
# backend/.env
PORT=3000
NODE_ENV=development
DB_HOST=localhost
DB_PORT=5432
DB_NAME=pharos_db
DB_USER=postgres
DB_PASSWORD=...
RABBITMQ_URL=amqp://localhost:5672
JWT_SECRET=...
JWT_ACCESS_EXPIRES=15m
JWT_REFRESH_EXPIRES=7d
FRONTEND_URL=http://localhost:5173
REPORTS_DIR=./generated-reports
```

---

## 12. Running the Project

```bash
# Start all services (from repo root)
npm run dev                    # runs backend + frontend via concurrently

# Backend only
cd backend && npm run dev      # nodemon on index.js

# Frontend only
cd frontend && npm run dev     # Vite dev server on :5173

# First time DB setup (NEW — post restructure)
cd backend
npm run db:reset      # drops public/ref/rpt schemas (dev only — data is disposable)
npm run db:migrate    # 6 schema-only migrations
npm run sync-config   # config/{fields,workflow,proformas,contracts}/*.json → DB
npm run load-ref      # config/org/hierarchy.json + config/ref-data/Menu_Tables.xlsx → hierarchy + ref.*
npm run db:seed       # dev users (one per role, password Test@1234)
# Mock RECORD data: none yet — old seed-mock scripts are pre-restructure (stage 5)

# Docker (PostgreSQL + RabbitMQ)
docker-compose up -d
```

---

## 13. Known Issues & Important Notes

1. **`records.router.js` has local changes** — stash before `git pull` or it aborts merge.
2. **Old `*.routes.js` files** in modules — orphaned, not imported, ignore them.
3. **Dual router files** — `analytics.routes.js` + `analytics.router.js` both exist. Only `*.router.js` is imported by `app.js`.
4. **`validate.middleware.js` exists** but is **NOT wired to any route** — no `express-validator` chains anywhere. API bodies are largely unvalidated at the controller layer (only basic existence checks).
5. **notifications.service.js** — `initSubscriptions()` uses a different `subscribe` signature than `auditHandler.js`. The notification subscriptions may not be initialized on startup (check `notifyHandler.js` `init()` instead).
6. **Report templates** are in-memory arrays in `reports.controller.js` — not in a DB `report_templates` table. Adding new templates requires a code deploy.

---

## 14. Phase Roadmap

| Phase | Status | Scope |
|-------|--------|-------|
| Phase 1 | ✅ Done | JWT auth, RBAC, 3 record types, HC→SHO→District workflow, compilation, audit, basic analytics, PDF/CSV reports, RabbitMQ, i18n, mock data |
| Phase 2 | 🔵 Active (8–10 weeks) | Keycloak/MFA, legacy import, JCP/SCP chain, Level Data Contracts, filter engine, 10+ report templates, advanced analytics, MinIO, offline PWA, admin UI, scheduled reports, hash-sealed audit |
| Phase 3 | Planned | Infrastructure hardening, Elasticsearch, performance testing (250 PS load) |
| Phase 4 | Planned | Full district rollout (15–20 PS) |

### Phase 2 New DB Tables Needed
- `workflow_transitions_config` — DB-driven state machine config
- `legacy_import_batches` — tracks import jobs
- `legacy_amendments` — correction requests for imported records
- `level_data_contracts` — which fields each level sees
- `filter_presets` — saved AND/OR filter specs
- Columns on `records`: `is_legacy`, `source_system`, `imported_at`, `imported_by`, `legacy_ref`

### Phase 2 New API Modules
- `POST /legacy/import` — CSV/XLSX bulk import with dry-run mode
- `GET /filters/presets`, `POST /filters/apply` — filter engine
- `GET /records/check-duplicate` — dedup check
- `GET /analytics/ps-comparison`, `GET /analytics/beat-wise` — advanced analytics
- `POST /reports/schedule` — cron-based scheduled reports

---

## 15. Code Conventions

- **ES Modules** throughout (`import/export`, `"type": "module"` in package.json)
- **Async/await** everywhere — no callbacks
- **DB transactions** for all multi-table writes: `db.transaction(async trx => { ... })`
- **Error pattern**: throw `new Error('message')` in services; controllers catch and return appropriate HTTP status
- **Always publish event AFTER transaction commits** (outside the `db.transaction` block)
- **Router pattern**: `router.use(authMiddleware, enforceScope)` at top, then `router.get('/', handler)` without repeating middleware
- **Knex** for all DB queries — no raw SQL except for complex JSONB operations
- **Logger**: use `logger.info/error/warn` from `utils/logger.js` — never `console.log` in production paths
