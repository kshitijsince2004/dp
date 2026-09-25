# PHAROS Project Audit Report
**Date:** 2026-06-17  
**Auditor:** Claude Code (Sonnet 4.6)  
**Scope:** Full repository — backend + frontend

---

## 1. Repository Structure

```
Crime-Diaries/
├── backend/               Express.js + Knex + PostgreSQL
│   └── src/
│       ├── config/        env.js, db.js
│       ├── events/        eventBus.js (RabbitMQ), auditHandler, notifyHandler
│       ├── middleware/    auth.middleware.js, rbac.middleware.js
│       └── modules/
│           ├── auth/      ✅ Complete — login, refresh, logout, me, changePassword
│           ├── users/     ✅ Complete — CRUD, resetPassword
│           ├── records/   ✅ Complete — CRUD, submit, approve, sendBack, override
│           ├── workflow/  ✅ Complete — queue, transitions
│           ├── fields/    ✅ Partial — getFieldsForForm only (no general list endpoint)
│           ├── analytics/ ✅ Complete — overview, byPS, byCrimeHead, trends
│           ├── reports/   ✅ Complete — generate (Excel via exceljs), PDF via puppeteer
│           ├── hierarchy/ ✅ Complete — tree read + update
│           ├── audit/     ✅ Complete — getAuditLogs, getRecordAudit, getUserAudit
│           ├── admin/     ✅ Complete — customFields CRUD, adminStats
│           └── compilations/ ✅ Complete — compile, submit to HQ
└── frontend/              React 18 + Vite + Tailwind CSS v4
    └── src/
        ├── features/auth/ ✅ LoginPage — professional 5-tier hierarchy selector
        ├── pages/
        │   ├── hc/        ✅ MyRecords, NewRecord
        │   ├── sho/       ✅ Queue, RecordDetail
        │   ├── district/  ✅ Dashboard, CompilationUI
        │   ├── hq/        ✅ Dashboard
        │   ├── analytics/ ✅ AnalyticsDashboard
        │   ├── reports/   ✅ ReportBuilder
        │   └── admin/     ✅ Users, HierarchyManager, FieldManager, AuditPage
        ├── components/
        │   ├── layout/    ✅ DashboardLayout, PoliceSidebar, PoliceNavbar
        │   └── common/    ✅ DebugBar (dev tool)
        ├── store/         ✅ authStore (Zustand + persist)
        ├── hooks/         ✅ useAuth
        └── utils/         ✅ api.js (axios + mock interceptor)
```

---

## 2. Completed Features

### Backend (as-found, confirmed complete)
- **JWT Auth:** POST /auth/login, POST /auth/refresh, POST /auth/logout, GET /auth/me, POST /auth/change-password — bcrypt hashing, access token (1h), refresh token (7d), stored in `refresh_tokens` table
- **RBAC Middleware:** `allow(...roles)` on all protected routes; roles: HC, SHO, DISTRICT_OFFICER, HQ_ANALYST, HQ_ADMIN, SYSTEM_ADMIN
- **Records CRUD:** Full lifecycle — DRAFT → PENDING_SHO → DISTRICT_REVIEW → COMPILED → HQ_RECEIVED; approve, sendBack, DCP override
- **Workflow Queue:** Filtered by role and jurisdiction (PS-scoped for SHO, district-scoped for DCP)
- **Field Registry:** Dynamic form schema served from `field_registry` DB table (`GET /fields/form/:type`)
- **Analytics:** Overview, by-crime-head, by-PS, trends — all pulling from PostgreSQL
- **Report Export:** Excel generation via exceljs (`POST /reports/generate`), PDF via puppeteer
- **Compilations:** Create daily compilation, submit to HQ
- **Audit Ledger:** Event-driven via RabbitMQ; `audit_logs` table with action, table_name, changed_by_role, ip_address, field_name, reason
- **Custom Fields:** POST /admin/custom-fields — scoped to district or HQ; auto-merged into dynamic forms
- **Hierarchy:** Full Delhi Police tree (HQ → Zone → Range → District → PS) in `hierarchy_nodes` table
- **Users Admin:** Full CRUD — create (with bcrypt password), update role/jurisdiction, deactivate, resetPassword
- **RabbitMQ Events:** RecordCreated, RecordUpdated, RecordSubmitted, CaseHeadOverridden, NotificationCreated, AuditCreated — all in `eventBus.js`

### Frontend (as-found + post-fix)
- **Login Page:** Professional 5-tier selector (HQ/Zone/Range/District/PS), officer profile preview, quick-access demo profiles, zod validation
- **My Records (HC):** List with tabs per record type, status filter, submit/edit/delete actions
- **New Record (HC):** Dynamic form engine driven by `/fields/form/:type`, create + edit mode, send-back feedback banner
- **Approval Queue (SHO):** Tabbed by record type, review detail navigation
- **Record Detail (SHO):** DynamicForm read-only, revision history, approve / send-back / DCP override modals
- **District Dashboard:** Stats cards + Recharts BarChart comparing PS performance
- **Compilation UI:** Date picker, compile trigger, compilation list with submit-to-HQ action
- **HQ Dashboard:** Global stats, activity feed with district/type filters
- **Analytics Dashboard:** PieChart (crime head), LineChart (weekly trends), period toggle
- **Report Builder:** Template selector, date range, format (xlsx/csv), generate→poll→download
- **Users Admin:** Full CRUD — create with badge/name/role/password/jurisdiction, toggle active, delete, reset password
- **Field Manager:** Aggregates built-in fields from all 5 record types (no backend change needed), custom fields tab with create via POST /admin/custom-fields
- **Hierarchy Manager:** Interactive collapsible tree viewer of Delhi Police hierarchy
- **Audit Ledger:** Action-filtered log table with pagination, dark theme, IST timestamps

---

## 3. Bugs Found and Fixed (This Session)

| # | File | Bug | Fix Applied |
|---|------|-----|-------------|
| 1 | `utils/api.js` | Default mode was `'mock'` — ALL API calls intercepted; real backend never reached | Changed both interceptor defaults to `'production'` |
| 2 | `utils/api.js` | Mock user GET handler only matched `/admin/users`, not `/users` | Updated regex to match both paths |
| 3 | `utils/api.js` | No mock for POST /users, PUT /users/:id, DELETE /users/:id | Added complete mock handlers with localStorage persistence |
| 4 | `utils/api.js` | No mock for GET /audit | Added mock with 5 sample log entries |
| 5 | `utils/api.js` | No mock for GET/POST /admin/custom-fields | Added mock handlers |
| 6 | `pages/admin/Users.jsx` | `createUserMutation.mutationFn` returned payload directly without calling API | Rewrote to call `api.post('/users', payload)` |
| 7 | `pages/admin/Users.jsx` | Toggle status button called `toast.success` without API call | Added `toggleStatusMutation` calling `api.put('/users/:id', { is_active })` |
| 8 | `pages/admin/Users.jsx` | Missing email and password fields in create form | Added full form: badgeNo, name_en, role, password, psId, districtId |
| 9 | `pages/admin/Users.jsx` | Used `GET /admin/users` — no matching backend route | Fixed to `GET /users` (matches `app.use('/api/users', usersRouter)`) |
| 10 | `pages/admin/FieldManager.jsx` | Toggle button called `toast.success` without API | Replaced with aggregation approach across all 5 form types |
| 11 | `pages/admin/FieldManager.jsx` | Used `GET /fields` — no matching backend route (only `/fields/form/:type` exists) | Now queries all 5 types in parallel and deduplicates |
| 12 | `pages/admin/HierarchyManager.jsx` | Used `GET /admin/hierarchy` — no backend route at that path | Fixed to `GET /hierarchy` (matches `app.use('/api/hierarchy', ...)`) |
| 13 | `pages/admin/AuditPage.jsx` | Used raw `axios.get('/api/v1/audit')` — no auth header, wrong import | Rewrote to use `api.get('/audit')` with full dark-theme UI |
| 14 | `routes/AppRouter.jsx` | `AuditPage` existed but was not in the router | Added `<Route path="/admin/audit" element={<AuditPage />} />` |
| 15 | `components/layout/PoliceSidebar.jsx` | No "Audit Ledger" nav item for SYSTEM_ADMIN | Added nav item linking to `/admin/audit` |
| 16 | `hooks/useAuth.js` | Default mode `'mock'` — prevented token refresh in production | Changed to `'production'` |
| 17 | `features/auth/LoginPage.jsx` | Default mode `'mock'` — auto-filled hierarchy emails always | Changed to `'production'` |
| 18 | `components/common/DebugBar.jsx` | Default mode `'mock'` — showed Mock Mode as active | Changed to `'production'` |

---

## 4. Missing Backend APIs

| Endpoint | Status | Notes |
|----------|--------|-------|
| `GET /fields` (all fields) | ❌ Missing | Only `/fields/form/:type` exists. Workaround: frontend queries all 5 types. |
| `PATCH /fields/:id` (toggle field) | ❌ Missing | No field toggle endpoint. Built-in fields are managed via DB migrations. |
| `GET /audit/user/:userId` | ✅ Present | `/audit/user/:userId` |
| `GET /audit/record/:recordId` | ✅ Present | `/audit/record/:recordId` |
| `POST /users/:id/reset-password` | ✅ Present | Confirmed in users.router.js |

---

## 5. Missing Frontend Screens

| Screen | Status | Notes |
|--------|--------|-------|
| Notifications page `/notifications` | ❌ Not built | Notifications shown in navbar dropdown only |
| Profile settings page | ❌ Stub only | `/profile` renders "coming soon" text |
| UIDB search/list | ⚠️ Partial | UIDB is a record type in MyRecords/NewRecord but no dedicated list |
| District drill-down per PS | ⚠️ Partial | DistrictDashboard shows aggregate stats but no per-PS drill-down page |

---

## 6. Database Schema (Required vs Confirmed)

| Table | Status |
|-------|--------|
| `users` | ✅ Referenced in users.controller.js |
| `hierarchy_nodes` | ✅ Referenced in multiple controllers |
| `records` | ✅ Referenced in records.controller.js |
| `field_registry` | ✅ Referenced in fields.controller.js |
| `compilations` | ✅ Referenced in compilations controller |
| `audit_logs` | ✅ Referenced in audit.controller.js |
| `custom_field_definitions` | ✅ Referenced in customFields.controller.js |
| `refresh_tokens` | ✅ Referenced in auth.service.js |
| `workflow_transitions` | ✅ Referenced in workflow controller |
| `daily_records_meta` | ⚠️ Not confirmed in any controller |
| `pcr_kalandras` | ⚠️ Not confirmed — likely stored in records.data JSONB |
| `missing_persons` | ⚠️ Not confirmed — likely stored in records.data JSONB |
| `arrests` | ⚠️ Not confirmed — likely stored in records.data JSONB |

---

## 7. Authentication Issues

| Issue | Status |
|-------|--------|
| Access token expired handling | ✅ Handled — response interceptor retries with refresh token |
| Refresh token rotation | ✅ Handled in auth.service.js |
| Role claims in JWT | ✅ Present — decoded by auth.middleware.js |
| Mock JWT tokens accepted by backend | ❌ N/A — now in production mode |
| localStorage `access_token` + `refresh_token` | ✅ Set on login, cleared on logout |

---

## 8. RBAC Issues

| Issue | Status |
|-------|--------|
| PS/HC can only access `/records` | ✅ Sidebar filters by role |
| SHO can only see their station's queue | ✅ `workflow.controller.js` filters by `ps_id` |
| DISTRICT sees only their district | ✅ Filter by `district_id` in records + workflow |
| HQ sees all data | ✅ No ps/district filter applied for HQ roles |
| SYSTEM_ADMIN has full platform access | ✅ `allow('SYSTEM_ADMIN')` on users/fields endpoints |
| Frontend route guards | ✅ `ProtectedRoute` checks `isAuthenticated`; sidebar shows only role-appropriate items |

---

## 9. Build & Runtime Issues

| Issue | Status |
|-------|--------|
| Duplicate `AuthContext` files | ⚠️ `src/context/AuthContext.jsx` and `src/contexts/AuthContext.jsx` both exist; app uses `contexts/` only |
| DebugBar occupies screen real estate | ⚠️ Always visible at bottom; now defaults to production mode |
| antd `Table` in old AuditPage | ✅ Fixed — removed antd dependency, now uses custom table |

---

## 10. Integration Issues

| Area | Status |
|------|--------|
| Frontend → Backend API path mismatch | ✅ Fixed — `/admin/users` → `/users`, `/admin/hierarchy` → `/hierarchy` |
| Field registry form schema | ✅ Connected to real `/fields/form/:type` endpoint |
| JWT token in all API requests | ✅ Request interceptor adds `Authorization: Bearer <token>` |
| Custom fields appear in forms | ✅ fields.controller.js merges custom fields from `custom_field_definitions` table |

---

## 11. RabbitMQ Events

| Event | Publisher | Subscriber | Status |
|-------|-----------|------------|--------|
| `record.created` | records.controller | auditHandler, notifyHandler | ✅ |
| `record.updated` | records.controller | auditHandler | ✅ |
| `record.status_changed` | workflow.controller | auditHandler, notifyHandler | ✅ |
| `compilation.submitted` | compilations.controller | notifyHandler | ✅ |
| `user.login` | auth.controller | auditHandler | ✅ |

Note: `eventBus.js` gracefully handles RabbitMQ unavailability — events are lost but app continues running.

---

## 12. What Still Needs Work

### High Priority
1. **Notifications page** (`/notifications`) — currently only a navbar dropdown with hardcoded items
2. **Profile settings page** — currently a stub

### Medium Priority
3. **`src/context/AuthContext.jsx`** — duplicate file, should be deleted
4. **DebugBar UI** — still visually prominent; could be made collapsible or keyboard-triggered
5. **Reports download** — ReportBuilder polls `/reports/status/:id` but needs real file download via `window.open(downloadUrl)`

### Low Priority
6. **Hindi i18n strings** — many translation keys fall back to English defaults; `src/i18n/` needs review
7. **Offline PWA** — `pharos-architecture.html` specified offline-first; `vite-plugin-pwa` not configured
8. **`daily_records_meta` table** — referenced in architecture docs but no controller uses it
