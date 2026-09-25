# PHAROS — Technical Architecture Document
**Version:** 1.0 | **Date:** 2026-08-18 | **Audience:** Architects, senior engineers, DevOps

---

## 1. System Overview

```
┌─────────────────────────────────────────────────────────────────────┐
│                          Browser (React SPA)                        │
│  Vite 8 / React 19 / React Router 7 / Zustand / TanStack Query      │
│  Port 5173 (dev)                                                     │
└───────────────────────────────────┬─────────────────────────────────┘
                                    │ HTTP (axios)
                                    ▼
┌─────────────────────────────────────────────────────────────────────┐
│                     Node.js Express API                             │
│  Express 4 / Knex 3 / ESM / JWT / 23 modules                        │
│  Port 5000                                                           │
└──────────┬─────────────────────────┬──────────────────┬─────────────┘
           │ pg (Knex)               │ amqplib          │ ioredis
           ▼                         ▼                  ▼
┌────────────────┐    ┌─────────────────────────┐  ┌──────────┐
│  PostgreSQL 16 │    │     RabbitMQ 3           │  │ Redis 7  │
│  Port 5435     │    │  pharos topic exchange   │  │ Port 6379│
│  Schemas:      │    │  Port 5672 / 15672       │  └──────────┘
│  public + ref  │    └────────────┬────────────┘
└────────────────┘                 │ AMQP consume
                                   ▼
                    ┌─────────────────────────────┐
                    │     Python Report Worker     │
                    │  pika / SQLAlchemy / openpyxl│
                    │  WeasyPrint / pandas         │
                    │  Direct DB read (SQLAlchemy) │
                    └─────────────────────────────┘
```

**Component summary:**
- **React SPA**: All user interaction — forms, dashboards, diary downloads. Zero server-side rendering.
- **Node.js API**: Single authoritative write path for all record mutations. Hosts the FN Diary and PHQ Diary generation engines.
- **PostgreSQL**: Primary persistent store — two schemas (`public` for transactional data, `ref` for 21 lookup tables).
- **RabbitMQ**: Message broker for async jobs (report generation, import confirmation, notifications). Falls back to in-memory EventEmitter when unavailable.
- **Redis**: Session data store (lightly used — JWT is the primary auth mechanism).
- **Python Worker**: Async consumer for report.requested events. Generates Daily Diary XLSX and PDF reports via openpyxl / WeasyPrint.

---

## 2. Technology Stack

| Layer | Technology | Version | Why Chosen |
|---|---|---|---|
| Frontend Framework | React | 19.2.6 | Modern concurrency features, ecosystem maturity |
| Build Tool | Vite | 8.0.12 | Fast HMR, ESM-native, simple config |
| Client Routing | React Router DOM | 7.17.0 | Nested routes, lazy loading support |
| UI Components | Ant Design | 5.17.0 | Rich enterprise component set (tables, forms, modals) |
| CSS Utility | Tailwind CSS | 4.3.1 | Utility-first rapid styling |
| Server State | TanStack Query | 5.101.0 | Automatic cache, refetch, stale-while-revalidate |
| Global State | Zustand | 5.0.14 | Minimal auth state (no Redux overhead) |
| HTTP Client | Axios | 1.17.0 | Interceptors for JWT refresh |
| Animation | Framer Motion | 12.40.0 | Micro-animations, page transitions |
| Charts | Recharts | 3.8.1 | Composable chart library on top of D3 |
| Forms | React Hook Form | 7.79.0 | Uncontrolled forms, low re-render overhead |
| Validation | Zod | 4.4.3 | Schema validation with TypeScript inference |
| i18n | i18next | 26.3.1 | Hindi / English runtime switching |
| Backend Runtime | Node.js | 20+ | ESM modules, async/await, V8 performance |
| Backend Framework | Express | 4.19.2 | Mature, minimal, well-understood |
| Query Builder / ORM | Knex | 3.1.0 | Schema migrations + query building; no raw SQL in business logic |
| DB Driver | pg | 8.11.5 | Native PostgreSQL driver |
| Authentication | jsonwebtoken | 9.0.3 | JWT HS256 access tokens (15 min) + refresh (7 days) |
| Password Hashing | bcryptjs | 2.4.3 | Bcrypt with salt rounds |
| Message Broker Client | amqplib | 0.10.4 | AMQP 0-9-1 client for RabbitMQ |
| Cache Client | ioredis | 5.11.1 | Redis client with connection pooling |
| Excel Generation | ExcelJS | 3.4.0 | Cell-by-cell XLSX injection into pre-formatted diary templates |
| File Upload | Multer | 2.2.0 | Multipart form handling for Excel imports |
| Logging | Winston | 3.19.0 | Structured JSON logging with rotation |
| Validation (backend) | express-validator | 7.3.2 | Route-level input validation |
| Rate Limiting | express-rate-limit | 7.5.1 | Per-IP limits (100 req/15 min general, 50 req/15 min auth) |
| Security Headers | Helmet | 7.2.0 | CSP, HSTS, X-Frame-Options, etc. |
| Job Scheduling | node-cron | 4.2.1 | Scheduled diary report jobs |
| PDF (backend) | Puppeteer | 25.1.0 | HTML-to-PDF (present but untested) |
| Database | PostgreSQL | 16-Alpine | Proven RDBMS; JSONB, window functions, row locking |
| Message Broker | RabbitMQ | 3-management | Topic exchange; management UI on port 15672 |
| Cache | Redis | 7-Alpine | Session data, future rate-limit state |
| Python Framework | — | — | No web framework; pure consumer loop |
| Python DB | SQLAlchemy | ≥2.0.36 | Read-only ORM for report data queries |
| Python MQ | pika | ≥1.3.2 | AMQP client for RabbitMQ consumption |
| Python Excel | openpyxl | ≥3.1.2 | XLSX generation for Daily Diary |
| Python PDF | WeasyPrint | ≥62.3 | HTML-to-PDF for report output |
| Python Data | pandas | ≥2.2.2 | Data manipulation and aggregation |

---

## 3. Component Architecture

### 3.1 Node.js API

**Module style**: ESM (`"type": "module"`) throughout — all files use `import`/`export`. No CommonJS `require()`.

**Express middleware stack (in order, applied globally):**
1. `morgan` — HTTP request logging
2. `helmet` — Security headers
3. `cors` — CORS with `FRONTEND_URL` allowlist
4. `express.json()` — JSON body parsing
5. `cookie-parser` — Cookie parsing for refresh token
6. `ipAllowlistMiddleware` — IP allowlist (unconfigured; all IPs pass in dev)
7. `rateLimiter` — 100 req/15 min per IP

**23 Backend modules** (each has controller + service + router):

| Module | Purpose |
|---|---|
| `admin` | System stats, admin audit log |
| `analytics` | Crime statistics queries for dashboards |
| `audit` | Hash chain verification, record freeze/unfreeze, audit log browser |
| `auth` | Login, logout, refresh, notifications |
| `compilation` | District-level record compilation workflow |
| `daily-diary` | Daily Diary generation and preview |
| `fields` | Field registry CRUD + all lookup endpoints (acts, sections, local heads, beats, etc.) |
| `filters` | Saved filter presets |
| `hierarchy` | Organisation tree CRUD |
| `import` | Two-phase bulk Excel import |
| `io` (investigating-officers) | IO roster management |
| `level-contracts` | DIRECT_HQ routing config |
| `logs` | Client-side log ingestion |
| `notifications` | In-app notification delivery and SSE stream |
| `person-search` | Cross-record person search |
| `phq-diary` | PHQ / FN Diary generation engine |
| `record-links` | Record-to-record and record-to-person linking |
| `records` | Core CRUD for all 5 record types (largest module) |
| `report-builder` | Custom query/report builder |
| `report-engine` | FN diary renderers (41 STAT sheets) |
| `reports` | Async report jobs (status, download) |
| `warehouse` | Data warehouse status |
| `workflow` | Queue view based on workflow_transitions_config |

**Single write path invariant**: All record mutations (create, update, submit, transition, import) go through `records.service.js`. Nothing else writes directly to the records/fir_details/persons family of tables.

**Audit chain**: every write in `records.service.js` calls `appendRevision(trx, recordId, payload, userId)` which computes `SHA-256(previousHash + JSON.stringify(changeSummary))` and inserts into `record_revisions`.

### 3.2 Database

- **Engine**: PostgreSQL 16 (Docker: `postgres:16-alpine`)
- **Schemas**: `public` (transactional) + `ref` (21 lookup tables)
- **Migration tool**: Knex.js — 11 migrations applied in sequence
- **Authoritative schema source**: `backend/migrations/` (not the ERD, not this document)
- **Connection**: Knex connection pool (default size 10), port 5435 on host (5432 inside container)
- **Row locking**: `SELECT ... FOR UPDATE` on `fir_number_counters` during FIR creation prevents duplicate numbering

### 3.3 React SPA

- **Routing**: Lazy-loaded pages with `React.lazy` + `Suspense` — each page bundle is code-split
- **Auth flow**: Zustand `authStore` holds user object + JWT; Axios interceptor auto-refreshes via httpOnly cookie
- **Server state**: TanStack Query for all API data — stale-while-revalidate, automatic background refetch
- **Forms**: All record forms are dynamically rendered from field registry (`GET /api/fields/form/:record_type`). No hardcoded form fields in JSX.
- **Role routing**: `ProtectedRoute` component checks `useAuthStore().user.role` against `roles` prop; unauthenticated → `/login`
- **Nav visibility**: Sidebar items are filtered by role from a static config

### 3.4 Python Report Worker

- **Entry**: `python_worker/main.py` — connects to RabbitMQ, declares `pharos.reports` queue on `pharos` topic exchange
- **Retry logic**: Retries RabbitMQ connection 10 times (5-second interval) before exiting
- **Consumption**: `basic_consume` on queue → `generator.py` handles message → writes XLSX to `REPORTS_DIR`
- **DB access**: Read-only via SQLAlchemy (`python_worker/db.py`) — never writes to DB
- **Sheets**: 29 sheet generators in `python_worker/sheets/` covering Daily Diary format
- **Output**: XLSX (openpyxl) and PDF (WeasyPrint) written to `REPORTS_DIR` (default: `backend/reports/`)

### 3.5 Event Bus

- **Production**: RabbitMQ topic exchange named `pharos`
- **Development fallback**: Node.js `EventEmitter` (in-memory) — activated automatically when RabbitMQ is unreachable
- **Events published by Node.js API**:
  - `report.requested` — triggers Python worker diary generation
  - `notification.create` — triggers notification delivery
  - `record.linked` — triggers link audit
  - `import.confirm` — triggers batch import processing
  - `link.audit` — triggers link integrity check
- **Fallback behaviour**: All Node.js diary generation (FN Diary, PHQ Diary) runs synchronously in-process when RabbitMQ is down. Python-based Daily Diary generation requires RabbitMQ.

### 3.6 Cache (Redis)

- Redis 7 is available but lightly used in the current prototype
- JWT authentication is stateless (no server-side session storage)
- Redis is pre-provisioned for: refresh token revocation (logout), rate-limit state storage (future), and session caching

---

## 4. Data Flow

### 4.1 Record Creation
```
HC (browser) → POST /records
  → authMiddleware (verify JWT)
  → enforceScope (ps_id must match user.ps_id)
  → allow('HC') (role check)
  → recordsController.create()
    → validateRequiredFields()
    → knex.transaction(trx)
      → INSERT INTO records (spine row)
      → INSERT INTO fir_details / arrest_details / ... (detail table)
      → INSERT INTO persons[] (complainant, accused, victim)
      → INSERT INTO record_offences[] (sections)
      → INSERT INTO record_properties[] (property items)
      → INSERT INTO record_revisions (hash chain row #1)
      → publishEvent('record.created', { recordId })
    → trx.commit()
  → 201 { success: true, data: { record } }
```

### 4.2 Workflow Transition
```
SHO (browser) → POST /records/:id/approve
  → authMiddleware → allow('SHO', 'DISTRICT_OFFICER')
  → recordsController.approve()
    → transitionRecord(trx, record, user, action='approve', comment)
      → workflow.engine.getRule(trx, { fromStatus, action, recordType })
      → workflow.engine.assertAllowed(rule, user)
      → workflow.engine.assertComment(rule, comment)
      → workflow.engine.resolveTarget(trx, rule, record)
        → [checks level_data_contracts for DIRECT_HQ]
      → UPDATE records SET current_status = toStatus, current_level = toLevel
      → INSERT INTO workflow_transitions (ledger append)
      → INSERT INTO record_revisions (hash chain)
      → publishEvent('notification.create', { ... })
    → trx.commit()
  → 200 { success: true, data: { record } }
```

### 4.3 FN Diary Generation
```
User → GET /api/phq-diary/generate?ps_id=...&from_date=...&to_date=...
  → phq-diary controller
    → Loads pre-formatted XLSX template (ExcelJS workbook)
    → For each of 41 STAT sheet renderers:
      → renderer(db, params) → returns { cells: { 'B5': 12, 'C5': 8, ... } }
        → renderer queries PostgreSQL directly via Knex
    → ExcelJS writes computed values into template cells
    → Stream XLSX buffer as response (Content-Disposition: attachment)
→ Browser downloads XLSX file
```

### 4.4 Bulk Import
```
HC → POST /api/import/validate (multipart Excel file)
  → multer parses file buffer
  → importController.validateImportBatch()
    → Read Excel rows via ExcelJS
    → Validate each row against field registry rules
    → INSERT INTO import_batches (status: PENDING_CONFIRM, validation_report: JSON)
  → 200 { batchId, valid_count, error_count, errors: [...] }

HC → POST /api/import/confirm/:batchId
  → importController.confirmImportBatch()
    → publishEvent('import.confirm', { batchId })
      → importConfirmHandler processes each validated row
        → createImportedRecord() in records.service.js
        → (same single write path as normal creation)
    → UPDATE import_batches SET status = 'COMPLETE'
  → 200 { success: true, imported_count: N }
```

---

## 5. Security Architecture

| Layer | Mechanism | Notes |
|---|---|---|
| Transport | HTTPS (nginx in production) | HTTP in development |
| Authentication | JWT (HS256) — 15 min access + 7 day refresh | Refresh token in httpOnly cookie |
| Authorization | Default-deny `allow()` middleware | Every endpoint has explicit role list or is open |
| Data Scoping | `enforceScope` middleware | Rejects cross-PS/district access at API level |
| CSRF | Double-submit cookie | `csrfToken` cookie + `X-CSRF-Token` header |
| HTTP Headers | `helmet` | CSP, HSTS, X-Frame-Options, X-Content-Type |
| Rate Limiting | `express-rate-limit` | 100 req/15 min general, 50 req/15 min auth |
| IP Allowlist | `ipAllowlistMiddleware` | Present but unconfigured (all IPs pass) |
| Audit | Hash-chained `record_revisions` | SHA-256 chain — tamper-evident |
| Password | bcryptjs (bcrypt) | Salt rounds: 10 |
| SSO | Keycloak (code path exists) | Never tested; JWT-only mode is active |

---

## 6. Key Design Decisions

### Decision 1: Records Spine Pattern
**Decision**: All five record types share a single `records` table (spine) with type-specific detail tables (`fir_details`, `arrest_details`, `pcr_call_details`, `missing_details`, `uidb_details`).
**Reason**: Uniform workflow engine, audit chain, and linking work across all types without type-conditional logic.
**Consequence**: Queries joining spine to detail table require a join; the `record_type` column must always be included in WHERE clauses.

### Decision 2: Config-Driven State Machine
**Decision**: All workflow states and transitions are stored in `workflow_transitions_config`. The engine code has zero hardcoded states.
**Reason**: Adding a new workflow step (e.g. ACP approval) is an operational config change, not a code deployment.
**Consequence**: New roles/levels require only new rows in `workflow_transitions_config`. No code change needed.

### Decision 3: Config-Driven Form Fields
**Decision**: All form fields (labels, types, validations, conditional display) are stored in `field_registry` table and fetched at runtime.
**Reason**: Field requirements vary by PS and evolve — hardcoded forms would require deployments for every change.
**Consequence**: Frontend form renderer must evaluate `show_when` and `required_when` rules dynamically.

### Decision 4: Single Write Path for Audit
**Decision**: All record mutations go through `records.service.js`. Nothing else writes to the records family of tables.
**Reason**: The audit hash chain must be appended on every mutation. Bypassing the service breaks the chain silently.
**Consequence**: Never write to `records`, `fir_details`, `persons`, etc. directly from controllers, scripts, or migrations.

### Decision 5: Dual API Registration (/api/v1 and /api)
**Decision**: Every router is mounted at both `/api/v1/<module>` and `/api/<module>`.
**Reason**: Frontend was initially written to `/api` and migration to versioned paths is ongoing. Both work simultaneously.
**Consequence**: All new endpoints should use `/api/v1` in frontend calls. The `/api` aliases exist for backward compatibility only.

### Decision 6: Transfers via `fir_details` Not `record_transfers`
**Decision**: Transfer metadata (`transfer_to_type`, `transferred_to_ps_id`, `transferred_to_agency_id`, `date_of_transfer`) is stored in `fir_details` columns. The `record_transfers` table exists but is empty and unused.
**Reason**: Verified from the live schema — transfer data was consolidated into `fir_details` to avoid a second table lookup on every record read.
**Consequence**: `record_transfers` can be removed. Transfer history is in `workflow_transitions` ledger.

### Decision 7: Kalandra via `is_dd_based` Flag
**Decision**: Kalandra (DD-based preventive) arrests are differentiated from FIR arrests by `arrest_details.is_dd_based = true`. No separate table.
**Reason**: Same arrest workflow applies; the distinction is a classification, not a structural difference.
**Consequence**: All Kalandra queries must filter `is_dd_based = true`. FIR arrest queries must filter `is_dd_based = false`.

### Decision 8: Court Status on `fir_details` (Strategic Compromise)
**Decision**: Court-related fields (`sent_to_court_date`, `court_case_no`, `court_name`, `court_disposal_date`, `court_disposal_type`, `next_date_of_hearing`) are columns on `fir_details`. No separate `court_cases` table.
**Reason**: Full court proceedings tracking (NJDG integration) is out of scope. The columns allow basic court status to be captured without a court module.
**Consequence**: STAT_40/41 can produce partial court statistics. Full court tracking requires a future `court_cases` table and NJDG integration.

### Decision 9: @PRIOR Resolves from `workflow_transitions` Ledger
**Decision**: When `to_status = '@PRIOR'` (transfer accept/reject), the engine queries the `workflow_transitions` append-only ledger for the last `IN_TRANSFER` entry and restores both `from_status` and `from_level`.
**Reason**: The ledger is the authoritative record of every state transition. Using it for `@PRIOR` means no additional `previous_status` column needed on `records`.
**Consequence**: The `workflow_transitions` table must never be deleted or modified — it is required for `@PRIOR` resolution.

### Decision 10: Event Bus with In-Memory Fallback
**Decision**: The API publishes events via RabbitMQ topic exchange. If RabbitMQ is unreachable, it falls back to Node.js `EventEmitter` (in-memory).
**Reason**: Development environments often don't have RabbitMQ running. The fallback keeps the API functional.
**Consequence**: In fallback mode, async events (report.requested, import.confirm) are processed synchronously in-process. The Python worker cannot receive events in fallback mode.

---

## 7. Infrastructure

### Docker Services (`docker-compose.yml`)

| Service | Image | External Port | Internal Port | Purpose |
|---|---|---|---|---|
| `db` | postgres:16-alpine | **5435** | 5432 | Primary database |
| `rabbitmq` | rabbitmq:3-management | 5672, 15672 | 5672, 15672 | Message broker |
| `redis` | redis:7-alpine | 6379 | 6379 | Session cache |

> ⚠️ **Critical**: The database maps host port **5435** to container port **5432**. All `DATABASE_URL` values must use port **5435**. The most common setup error is using port 5432.

**RabbitMQ credentials** (from `docker-compose.yml`): `pharos` / `pharos123`

**Persistent volumes**: `pgdata` — PostgreSQL data. All other services are stateless.

### Start Sequence
1. `docker compose up -d` — starts db, rabbitmq, redis
2. Wait for health checks (15-20 seconds)
3. `cd backend && npm run db:migrate` — applies all migrations
4. `cd backend && npm run db:seed` — seeds ref data + workflow config + field registry
5. `cd backend && npm run dev` — starts API on port 5000
6. `cd frontend && npm run dev` — starts SPA on port 5173
7. `cd python_worker && python main.py` — starts async report worker

---

## 8. Port Map

| Service | Internal Port | External Port (dev) | Notes |
|---|---|---|---|
| PostgreSQL | 5432 | **5435** | Use 5435 in DATABASE_URL |
| RabbitMQ | 5672 | 5672 | AMQP |
| RabbitMQ Management | 15672 | 15672 | Web UI: guest/guest |
| Redis | 6379 | 6379 | — |
| Backend API | 5000 | 5000 | `PORT=5000` in .env |
| Frontend (Vite dev) | 5173 | 5173 | `VITE_API_URL=http://localhost:5000` |

---

## 9. Known Technical Debt

| Item | Description | Priority |
|---|---|---|
| Port mismatch in .env.example | DATABASE_URL uses 5432, should be 5435 | Critical |
| mongoose in package.json | MongoDB ORM unused; PHAROS uses PostgreSQL | Medium |
| Large log files (~1.3 GB each) | No log rotation configured | High |
| Puppeteer PDF untested | PDF generation code present but never end-to-end tested | Medium |
| ZONE/RANGE workflow unconfigured | Hierarchy levels exist; transitions not set up | Low |
| JCP/SCP endpoints return 404 | Endpoints defined; no config rows in `workflow_transitions_config` | Low |
| Frontend route guards incomplete | Most admin routes lacked role guards (partially fixed in Aug 2026) | High |
| Keycloak SSO code untested | Code path exists (`isKeycloakEnabled`); JWT-only is active | Low |
| `record_transfers` table is empty | Transfer data is in `fir_details`; table can be removed | Low |
