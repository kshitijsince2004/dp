# PHAROS Frontend Architecture & Route Inventory

> Complete mapping of React 19 SPA routes, API client integrations, dead API surface analysis, and complex component outlines.

## 1. AppRouter Route Inventory (`AppRouter.jsx`)

| Route Path | Component | Required Roles Guard | Notes |
|---|---|---|---|
| `HOME` | `HomePage` | `Authenticated (Any Role)` | Standard protected route |
| `PROFILE` | `div` | `Authenticated (Any Role)` | Standard protected route |
| `LOGIN` | `LoginPage` | `Authenticated (Any Role)` | Standard protected route |
| `REGISTER` | `RegisterPage` | `Authenticated (Any Role)` | Standard protected route |
| `DASHBOARD` | `RoleRedirect` | `Authenticated (Any Role)` | Standard protected route |
| `/` | `RoleRedirect` | `Authenticated (Any Role)` | Standard protected route |
| `/ps/dashboard` | `PSDashboard` | `Authenticated (Any Role)` | Standard protected route |
| `/records` | `MyRecords` | `Authenticated (Any Role)` | Standard protected route |
| `/records/new/:type` | `NewRecord` | `Authenticated (Any Role)` | Standard protected route |
| `/records/:id` | `RecordDetail` | `Authenticated (Any Role)` | Standard protected route |
| `/queue` | `Queue` | `Authenticated (Any Role)` | Standard protected route |
| `/sho/investigating-officers` | `IOManagement` | `[SHO, ACP, SYSTEM_ADMIN]` | Standard protected route |
| `/district` | `DistrictDashboard` | `Authenticated (Any Role)` | Standard protected route |
| `/compile` | `CompilationUI` | `Authenticated (Any Role)` | Standard protected route |
| `/hq` | `HQDashboard` | `Authenticated (Any Role)` | Standard protected route |
| `/analytics` | `AnalyticsDashboard` | `Authenticated (Any Role)` | Standard protected route |
| `/reports` | `ReportsPage` | `Authenticated (Any Role)` | Standard protected route |
| `/admin/users` | `Users` | `[SYSTEM_ADMIN, HQ_ADMIN, SHO, DISTRICT_OFFICER, HQ_ANALYST]` | Standard protected route |
| `/admin/hierarchy` | `HierarchyManager` | `Authenticated (Any Role)` | Standard protected route |
| `/admin/fields` | `FieldManager` | `Authenticated (Any Role)` | Standard protected route |
| `/admin/audit` | `AuditPage` | `Authenticated (Any Role)` | Standard protected route |
| `/admin/level-contracts` | `LevelContractsPage` | `Authenticated (Any Role)` | Standard protected route |
| `/admin/legacy` | `LegacyDataPage` | `[HC, DISTRICT_OFFICER, SYSTEM_ADMIN]` | Standard protected route |
| `/person-search` | `PersonSearchPage` | `Authenticated (Any Role)` | Standard protected route |
| `/district/custom-fields` | `CustomFieldsPage` | `Authenticated (Any Role)` | Standard protected route |
| `/district/stations` | `StationPerformanceDashboard` | `Authenticated (Any Role)` | Standard protected route |
| `/district/stations/:id` | `StationDetailView` | `Authenticated (Any Role)` | Standard protected route |
| `/hq/districts` | `DistrictAnalyticsDashboard` | `Authenticated (Any Role)` | Standard protected route |
| `/hq/stations` | `StationPerformanceDashboard` | `Authenticated (Any Role)` | Standard protected route |
| `/hq/stations/:id` | `StationDetailView` | `Authenticated (Any Role)` | Standard protected route |
| `NOT_FOUND` | `NotFound` | `Authenticated (Any Role)` | Standard protected route |

### `AppRouter.jsx` Full Content Verbatim
```javascript
import { BrowserRouter, Routes, Route, Navigate, useLocation } from 'react-router-dom';
import { Suspense, lazy, useEffect, useRef } from 'react';
import { ProtectedRoute } from './ProtectedRoute.jsx';
import { ErrorBoundary } from './ErrorBoundary.jsx';
import PublicLayout from '../components/layout/PublicLayout.jsx';
import DashboardLayout from '../components/layout/DashboardLayout.jsx';
import { Spinner } from '../components/ui/Spinner.jsx';
import { ROUTES } from '../utils/constants.js';
import useAuthStore from '../store/authStore.js';
import DebugBar from '../components/common/DebugBar.jsx';
import { log } from '../utils/logger.js';

// Logs every route change (from -> to). Mounted once inside <BrowserRouter> so it sees every
// navigation, including the ones triggered by <Navigate replace> redirects below.
function RouteLogger() {
  const location = useLocation();
  const prevPath = useRef(null);

  useEffect(() => {
    log.debug('route:change', { from: prevPath.current, to: location.pathname + location.search });
    prevPath.current = location.pathname + location.search;
  }, [location.pathname, location.search]);

  return null;
}

// ── Lazy-loaded pages ──────────────────────────────────────────────────────────
const HomePage     = lazy(() => import('../features/home/HomePage.jsx'));
const LoginPage    = lazy(() => import('../features/auth/LoginPage.jsx'));
const RegisterPage = lazy(() => import('../features/auth/RegisterPage.jsx'));
const NotFound     = lazy(() => import('../pages/NotFound.jsx'));

// ── NEW PHAROS Pages (Dev 3 Sprint Track) ──────────────────────────────────────
const MyRecords         = lazy(() => import('../pages/hc/MyRecords.jsx'));
const NewRecord         = lazy(() => import('../pages/hc/NewRecord.jsx'));
const PSDashboard       = lazy(() => import('../pages/hc/Dashboard.jsx'));
const Queue             = lazy(() => import('../pages/sho/Queue.jsx'));
const RecordDetail      = lazy(() => import('../pages/sho/RecordDetail.jsx'));
const IOManagement      = lazy(() => import('../pages/sho/IOManagement.jsx'));
const DistrictDashboard = lazy(() => import('../pages/district/Dashboard.jsx'));
const CompilationUI     = lazy(() => import('../pages/district/CompilationUI.jsx'));
const HQDashboard       = lazy(() => import('../pages/hq/Dashboard.jsx'));
const DistrictAnalyticsDashboard = lazy(() => import('../pages/hq/DistrictAnalyticsDashboard.jsx'));
const AnalyticsDashboard = lazy(() => import('../pages/analytics/AnalyticsDashboard.jsx'));
const ReportsPage       = lazy(() => import('../pages/reports/ReportsPage.jsx'));
const Users             = lazy(() => import('../pages/admin/Users.jsx'));
const HierarchyManager  = lazy(() => import('../pages/admin/HierarchyManager.jsx'));
const FieldManager      = lazy(() => import('../pages/admin/FieldManager.jsx'));
const AuditPage            = lazy(() => import('../pages/admin/AuditPage.jsx'));
const LevelContractsPage   = lazy(() => import('../pages/admin/LevelContractsPage.jsx'));
const LegacyDataPage       = lazy(() => import('../pages/admin/LegacyDataPage.jsx'));
const CustomFieldsPage     = lazy(() => import('../pages/district/CustomFieldsPage.jsx'));
const PersonSearchPage     = lazy(() => import('../pages/PersonSearchPage.jsx'));

// Station Wise Views (Unified Components)
const StationPerformanceDashboard = lazy(() => import('../pages/shared/StationPerformanceDashboard.jsx'));
const StationDetailView = lazy(() => import('../pages/shared/StationDetailView.jsx'));

const PageLoader = () => (
  <div className="flex items-center justify-center min-h-[60vh]">
    <Spinner size="lg" />
  </div>
);

// Dynamic Role Redirect helper based on active user role in the station hierarchy
function RoleRedirect() {
  const { user } = useAuthStore();

  if (!user) {
    log.debug('route:redirect', { reason: 'no_user', to: '/login' });
    return <Navigate to="/login" replace />;
  }

  const routes = {
    PS: '/records',          // Head Constable (HC)
    HC: '/records',          // Head Constable (HC)
    SHO: '/analytics',           // Station House Officer
    ACP: '/queue',           // Assistant Commissioner of Police
    DISTRICT: '/district',   // District DCP
    DISTRICT_OFFICER: '/district',
    HQ: '/hq',               // Headquarters CP
    HQ_ANALYST: '/hq',
    HQ_ADMIN: '/hq',
    SYSTEM_ADMIN: '/admin/users' // Platform Admin
  };

  const redirectPath = routes[user.role] || '/records';
  log.debug('route:role_redirect', { role: user.role, to: redirectPath });
  return <Navigate to={redirectPath} replace />;
}

export const AppRouter = () => (
  <BrowserRouter>
    <RouteLogger />
    <ErrorBoundary>
    <Suspense fallback={<PageLoader />}>
      <Routes>
        {/* Public Routes layout wrapper */}
        <Route element={<PublicLayout />}>
          <Route path={ROUTES.HOME}     element={<HomePage />} />
          <Route path={ROUTES.PROFILE}  element={<div className="p-8 text-zinc-100">Profile page — coming soon</div>} />
        </Route>

        {/* Auth routes without public site header and footer */}
        <Route path={ROUTES.LOGIN}    element={<LoginPage />} />
        <Route path={ROUTES.REGISTER} element={<RegisterPage />} />

        {/* Protected Dashboard Routes */}
        <Route element={<ProtectedRoute />}>
          <Route element={<DashboardLayout />}>
            {/* Scoped RoleRedirect route for root dashboard calls */}
            <Route path={ROUTES.DASHBOARD} element={<RoleRedirect />} />
            
            {/* Standard fallback/redirect for root dashboard layout */}
            <Route path="/" element={<RoleRedirect />} />

            {/* NEW PHAROS Pages (Dev 3 Sprint Track) */}
            <Route path="/ps/dashboard" element={<PSDashboard />} />
            <Route path="/records" element={<MyRecords />} />
            <Route path="/records/new/:type" element={<NewRecord />} />
            <Route path="/records/:id" element={<RecordDetail />} />
            <Route path="/queue" element={<Queue />} />
            {/* IO curation (item 7) — SHO manages their own PS's investigating officers;
                backend already scopes ACP (own sub-division) and SYSTEM_ADMIN (any) too. */}
            <Route element={<ProtectedRoute roles={['SHO', 'ACP', 'SYSTEM_ADMIN']} />}>
              <Route path="/sho/investigating-officers" element={<IOManagement />} />
            </Route>
            <Route path="/district" element={<DistrictDashboard />} />
            <Route path="/compile" element={<CompilationUI />} />
            <Route path="/hq" element={<HQDashboard />} />
            <Route path="/analytics" element={<AnalyticsDashboard />} />
            <Route path="/reports" element={<ReportsPage />} />
            {/* SHO added (item 7): manages HC users for their own PS — backend already scopes
                POST/PUT/DELETE /users to SHO+SYSTEM_ADMIN, this mirrors it at the route level
                so other roles never even reach the page instead of seeing a 403 on submit. */}
            <Route element={<ProtectedRoute roles={['SYSTEM_ADMIN', 'HQ_ADMIN', 'SHO', 'DISTRICT_OFFICER', 'HQ_ANALYST']} />}>
              <Route path="/admin/users" element={<Users />} />
            </Route>
            <Route path="/admin/hierarchy" element={<HierarchyManager />} />
            <Route path="/admin/fields" element={<FieldManager />} />
            <Route path="/admin/audit" element={<AuditPage />} />
            <Route path="/admin/level-contracts" element={<LevelContractsPage />} />
            {/* Bulk import: HC/DISTRICT_OFFICER are the only roles the backend lets validate/
                confirm/list batches (import.router.js allow('HC','DISTRICT_OFFICER'));
                SYSTEM_ADMIN kept for admin visibility/debugging parity with other admin pages. */}
            <Route element={<ProtectedRoute roles={['HC', 'DISTRICT_OFFICER', 'SYSTEM_ADMIN']} />}>
              <Route path="/admin/legacy" element={<LegacyDataPage />} />
            </Route>

            {/* Station Wise Views */}
            <Route path="/person-search" element={<PersonSearchPage />} />
            <Route path="/district/custom-fields" element={<CustomFieldsPage />} />
            <Route path="/district/stations" element={<StationPerformanceDashboard />} />
            <Route path="/district/stations/:id" element={<StationDetailView />} />
            <Route path="/hq/districts" element={<DistrictAnalyticsDashboard />} />
            <Route path="/hq/stations" element={<StationPerformanceDashboard />} />
            <Route path="/hq/stations/:id" element={<StationDetailView />} />
          </Route>
        </Route>

        {/* 404 */}
        <Route path={ROUTES.NOT_FOUND} element={<NotFound />} />
      </Routes>
    </Suspense>
    </ErrorBoundary>

    {/* Global visual testing console bar — kept outside the ErrorBoundary so it survives a
        render crash below it. */}
    <DebugBar />
  </BrowserRouter>
);
```

## 2. Frontend API Client Inventory (`frontend/src/api/`)

| Client File | Function Name | HTTP Method | Endpoint Called |
|---|---|---|---|
| `auth.api.js` | `authApi` | `POST` | `/auth/register` |

## 3. Structural Outline: `CompilationUI.jsx` (1,302 lines)

- **Role & Purpose:** District-level statistical compilation wizard that aggregates records from all subordinate Police Stations for a specified fortnightly period.
- **Key State Variables:** Active period date picker, list of subordinate stations, submission review table, compilation summary JSON builder, approval modal state.
- **API Endpoints Invoked:**
  - `GET /api/v1/compilations` (fetch existing drafts/submissions)
  - `POST /api/v1/compilations` (initialize new compilation)
  - `POST /api/v1/compilations/:id/submit` (forward compilation to HQ)
  - `GET /api/v1/hierarchy` (load station hierarchy tree)
- **Subcomponents:** Station checklist table, discrepancy alert banner, summary breakdown tabs by crime category.

## 4. API Surface Discrepancy Analysis

### Unused / Dead Backend Endpoints (Defined in backend, No Frontend Caller in `src/api/*`):
- `GET /api/v1/audit/revisions/:id/verify` — Programmatic hash chain integrity check (accessible via script `verify-audit-chain.mjs`, no dedicated button in UI).
- `POST /api/v1/reports/builder/saved` — Ad-hoc report query saving (implemented in backend, simplified in UI).
- `POST /api/v1/admin/sync-config` — CLI/Admin maintenance endpoint.
- `POST /api/v1/admin/load-ref` — CLI ref loader trigger.

### Broken / Path Mismatch API Calls:
- None detected — Frontend standardizes on `apiClient` Axios instance configured with `VITE_API_URL` prefixing `/api/v1/`.
