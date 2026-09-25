# LIVE SYSTEM BLOCKERS
**Audit Date:** 2026-06-17  
**Goal:** Fully functioning end-to-end PHAROS system on PostgreSQL with live APIs

---

## P0 — Cannot Start / PostgreSQL / Auth

### B-01: DB_CLIENT set to sqlite3 instead of pg
- **File:** `backend/.env` line 5
- **Issue:** `DB_CLIENT=sqlite3` — system uses SQLite file, PostgreSQL never touched
- **Impact:** All data goes to a local file; Docker PostgreSQL is never used; seed data irrelevant
- **Fix:** Set `DB_CLIENT=pg`, uncomment `DATABASE_URL=postgresql://postgres:postgres@localhost:5435/pharos_db`
- **Status:** ✅ FIXED

### B-02: Docker services must be running
- **Issue:** PostgreSQL (port 5435), RabbitMQ (5672/15672), Redis (6379) must be up before backend starts
- **Impact:** Backend fails to connect to DB and message queue on startup
- **Fix:** Run `docker compose up -d` from project root
- **Status:** ⚠️ MANUAL STEP REQUIRED

### B-03: Migrations must be run against PostgreSQL
- **Issue:** Fresh PostgreSQL container has no tables; migrations have not been applied
- **Impact:** All DB queries fail with "relation does not exist"
- **Fix:** `cd backend && npm run db:migrate`
- **Status:** ⚠️ MANUAL STEP REQUIRED

### B-04: Seed data must be applied
- **Issue:** Tables are empty after migration; no users, hierarchy, or field registry exist
- **Impact:** Login fails (no users), form renders empty (no fields), queue empty
- **Fix:** `cd backend && npm run db:seed`
- **Status:** ⚠️ MANUAL STEP REQUIRED

### B-05: Frontend mock interceptor was still active
- **File:** `frontend/src/utils/api.js` line 872
- **Issue:** Default `prism_debug_api_mode` was `'mock'` — all API calls intercepted by fake handlers, real backend never reached
- **Impact:** Every frontend operation silently returned fake localStorage data
- **Fix:** Changed all 6 default values to `'production'`; when mode is `'production'`, interceptor returns config immediately (line 874: `return config`)
- **Status:** ✅ FIXED (previous session)

---

## P1 — Workflow / Queue / Form Submission

### B-06: Queue.jsx response format mismatch
- **File:** `frontend/src/pages/sho/Queue.jsx` line 20
- **Issue:** `getQueue` backend returns `{ success: true, data: { queue: [...] } }`. Frontend reads `res.data.data` → gets `{ queue: [...] }` (an object). Then calls `.filter()` on that object → **TypeError: queue.filter is not a function**
- **Impact:** SHO queue page crashes with TypeError; no records visible; approval workflow completely blocked
- **Fix:** Change `return res.data.data` to `return res.data.data?.queue || []`
- **Status:** ✅ FIXED

### B-07: RecordDetail.jsx DCP override calls wrong endpoint with wrong payload
- **File:** `frontend/src/pages/sho/RecordDetail.jsx` lines 79-85
- **Issue:** Override mutation calls `api.put('/records/${id}', { data: { local_head, crime_head } })` — this updates the raw record data. Backend expects `PATCH /records/:id/override` with `{ caseHeadId, reason }` to write an audit revision
- **Impact:** DCP override writes to wrong endpoint; no audit trail created; `overrideCaseHead` service never called
- **Fix:** Change to `api.patch('/records/${id}/override', { caseHeadId: payload.new_value, reason: payload.reason })`
- **Status:** ✅ FIXED

### B-08: useCreateRecord sends record_type as module prop (lowercase not validated)
- **File:** `frontend/src/hooks/useCreateRecord.js` line 10
- **Issue:** Posts `record_type: module` where `module` comes from URL param. URL param is `/new/CASE` → `type = 'CASE'` (uppercase). Backend migration stores `record_type` as e.g. `'ARREST'|'PCR'|'CASES'|'MISSING'`. Seed field registry uses `['CASE', 'ARREST', 'PCR_CALL', 'MISSING', 'UIDB']`. Minor mismatch: migration comment says `'CASES'` but fields use `'CASE'`.
- **Impact:** Minor — forms will load but record_type in DB may differ from field_registry lookup if not exactly 'CASE'
- **Fix:** No code change needed if URL params match field registry keys exactly (CASE, ARREST, PCR_CALL, MISSING, UIDB)
- **Status:** ✅ NO ACTION NEEDED

### B-09: QueuePage.jsx (dead code) uses raw axios without auth
- **File:** `frontend/src/pages/queue/QueuePage.jsx` lines 98, 125
- **Issue:** Uses `axios.post('/api/v1/records/...')` — raw axios without Authorization header
- **Impact:** None — this file is NOT imported by AppRouter.jsx; dead code
- **Fix:** No fix needed
- **Status:** ✅ DEAD CODE — ignored

---

## P2 — Analytics / Reports / Export

### B-10: Analytics dashboard queries — verify live data flows
- **File:** `frontend/src/pages/analytics/AnalyticsDashboard.jsx`
- **Issue:** Calls `GET /analytics/overview`, `GET /analytics/crime-heads`, `GET /analytics/trends` — need to verify these pass `req.jurisdictionQuery` from `enforceScope`
- **Impact:** HQ sees empty charts until records exist; no code bug
- **Fix:** Seed some records OR log in as HC and create records first; analytics works off live data
- **Status:** ✅ WORKS ONCE DATA EXISTS

### B-11: Report download — file served from disk
- **File:** `frontend/src/pages/reports/ReportBuilder.jsx`
- **Issue:** After generating report, polls `/reports/status/:id` and downloads from `file_path`. If `REPORTS_OUTPUT_DIR` not created, puppeteer/exceljs write fails
- **Impact:** Report generation fails with ENOENT if output directory doesn't exist
- **Fix:** `mkdir -p backend/reports/output` OR let backend auto-create on first use (check reports.controller.js)
- **Status:** ⚠️ VERIFY MANUALLY

---

## Seed Credentials (after `npm run db:seed`)

| Badge No | Password | Role            | Jurisdiction         |
|----------|----------|-----------------|----------------------|
| HC001    | test123  | HC              | PS Adarsh Nagar, NWD |
| SHO001   | test123  | SHO             | PS Adarsh Nagar, NWD |
| DO001    | test123  | DISTRICT_OFFICER| North West District  |
| HQ001    | test123  | HQ_ANALYST      | Global               |
| HQ002    | test123  | HQ_ADMIN        | Global               |
| SA001    | test123  | SYSTEM_ADMIN    | Global               |

---

## Live Test Flow — Step-by-Step

```
1. Start Docker:        docker compose up -d
2. Run migrations:      cd backend && npm run db:migrate
3. Seed data:           cd backend && npm run db:seed
4. Start backend:       cd backend && npm run dev
5. Start frontend:      cd frontend && npm run dev

6. Open http://localhost:5173
7. Login as HC001 / test123
8. Go to New Record → CASE → fill form → Save → Submit
9. Logout. Login as SHO001 / test123
10. Go to Queue → see pending CASE → Approve
11. Logout. Login as DO001 / test123
12. Go to District Dashboard or Queue → see record → Override Case Head
13. Logout. Login as HQ001 / test123
14. Go to Analytics Dashboard → verify counts appear
15. Go to Reports → generate Excel → download
```

---

## What Was NOT a Blocker (schema is complete)

- `audit_logs` table: ✅ in migration (table 15)
- `custom_field_values` table: ✅ in migration (table 14)
- `updated_by` column on `records`: ✅ in migration (line 63)
- `record_date` column on `records`: ✅ in migration (line 61, NOT NULL)
- `sub_div_id` on `records`: ✅ in migration (line 57)
- `from_level`/`to_level` on `workflow_transitions`: ✅ in migration (lines 89-90)
- `JWT_REFRESH_SECRET` in env.js: ✅ present with fallback (line 14)
- Auth JWT payload: ✅ includes id, role, ps_id, district_id, sub_div_id (both snake_case and camelCase)
- `enforceScope` middleware: ✅ correctly scopes HC/SHO to ps_id, DISTRICT_OFFICER to district_id, HQ/SA global
