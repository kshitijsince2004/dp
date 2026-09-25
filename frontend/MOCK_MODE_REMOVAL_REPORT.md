# Mock Mode Removal Report

**Date:** 2026-09-26  
**Scope:** Complete removal of frontend Mock Mode. Application runtime is Live API only.

## Removed

- Mock API interceptor / request short-circuit engine in `frontend/src/utils/api.js`
- Mock response engine (`createMockResponse`, `createMockError`, Mock Fallthrough)
- Mock authentication (synthetic `mock-jwt-access-token` / `mock-jwt-refresh-token` issuance)
- localStorage mock database (`prism_mock_records` seed + CRUD)
- Mock notifications REST handlers
- API error simulation (`error_400` / `error_401` / `error_403` / `error_500`, `VITE_ENABLE_API_ERROR_SIMULATION`)
- `DebugBar.jsx` (Mock Mode / Live API / Err buttons + “PRISM Visual Testing Console”)
- Mode persistence keys (`prism_debug_api_mode`, `prism_debug_api_mode_prev`)
- Mock branches in `ProtectedRoute`, `useAuth`, `authStore`, `useNotifications`, `authTokens`
- `MOCK_FIR_LIST` offline FIR search fallback in `DynamicForm.jsx`
- Mock Mode env docs in `frontend/.env.example`

## Preserved

- **Backend RabbitMQ → in-memory `EventEmitter` fallback** in `backend/src/events/eventBus.js`  
  - Infrastructure resilience when AMQP is offline (single-process pub/sub).  
  - **Not** frontend Mock Mode.  
  - Caveat: no cross-process delivery while in fallback.  
  - Log/comment wording renamed from “mock-mode” / “mock in-memory” to “in-memory event bus”.
- Live-API response normalizers in `frontend/src/utils/dataShape.js` (`asRecordsList`, `asArray`, `asCrimeHeadMatrix`, etc.)
- Static `formSchemas` registry (extracted to `frontend/src/utils/formSchemas.js` for RecordDetail send-back field lists)
- `hierarchyData.js` live hierarchy tree (`findNodeById` / `getNodePath`) for DynamicForm
- SuperTokens session flow and real axios → backend → PostgreSQL path

## One-time localStorage cleanup

`purgeObsoleteMockModeStorage()` in `authTokens.js` (called from `main.jsx` and auth store rehydrate) removes only:

- `prism_debug_api_mode`
- `prism_debug_api_mode_prev`
- `prism_mock_records`
- `prism_mock_users`
- `access_token` / `refresh_token` when values are obsolete `mock-jwt-*` tokens

If synthetic JWTs are cleared while Zustand still has `isAuthenticated`, the store logs out so the user re-auths via SuperTokens.

## Files changed

### Deleted

- `frontend/src/components/common/DebugBar.jsx`

### Added

- `frontend/src/utils/formSchemas.js`
- `frontend/MOCK_MODE_REMOVAL_REPORT.md` (this file)

### Modified (frontend)

- `frontend/src/utils/api.js` — live-only axios client
- `frontend/src/utils/authTokens.js` — purge helper only
- `frontend/src/utils/dataShape.js` — comment cleanup
- `frontend/src/utils/logger.js` — comment cleanup
- `frontend/src/main.jsx`
- `frontend/src/App.jsx`
- `frontend/src/routes/AppRouter.jsx`
- `frontend/src/routes/ProtectedRoute.jsx`
- `frontend/src/routes/ErrorBoundary.jsx`
- `frontend/src/hooks/useAuth.js`
- `frontend/src/hooks/useNotifications.js`
- `frontend/src/hooks/useFormSchema.js`
- `frontend/src/store/authStore.js`
- `frontend/src/components/forms/DynamicForm.jsx`
- `frontend/src/pages/sho/RecordDetail.jsx`
- `frontend/src/pages/hc/NewRecord.jsx`
- `frontend/src/pages/district/CompilationUI.jsx`
- `frontend/src/contexts/AuthContext.jsx`
- `frontend/src/utils/hierarchyData.js` (removed unused mock metrics/logs helpers)
- `frontend/.env.example`

### Modified (backend — wording only)

- `backend/src/events/eventBus.js`
- `backend/src/events/handlers/importConfirmHandler.js`
- `backend/src/modules/import/import.service.js`

### Modified (docs)

- `docs/logging-instrumentation-2026-07-22/HANDOFF.md`
- `docs/new-db-integration/03-import.md`
- `docs/PHASE2_DEVELOPMENT_LOG.md`

## Architecture after removal

```text
React component
      ↓
Hook / API service
      ↓
Axios (SuperTokens interceptors)
      ↓
Real backend
      ↓
PostgreSQL / RabbitMQ (or in-memory event bus fallback)
```

## Validation

| Check | Result |
|-------|--------|
| Frontend lint (`npm run lint`) | Pre-existing repo-wide ESLint debt (~224 issues); Mock Mode changes do not introduce new functional failures. Targeted lint on changed auth/api files: pre-existing hooks warnings in `useNotifications`/`useAuth`; one new `preserve-caught-error` fixed with `{ cause }`. |
| Frontend typecheck | N/A — no typecheck script in frontend `package.json` |
| Frontend build (`npm run build`) | Pass (exit 0) |
| Backend tests (`npm test`) | Pass (10/10 formula + PHQ audit tests) |
| Login / SuperTokens / protected routes / SSE | Manual smoke required against running backend |

## Remaining `mock` references (legitimate)

| Location | Why it remains |
|----------|----------------|
| `frontend/src/utils/authTokens.js` | Purge of obsolete Mock Mode keys/tokens only — does not implement Mock Mode |
| `frontend/src/main.jsx`, `authStore.js` comments | Document the one-time purge |
| `frontend/src/utils/hierarchyData.js` | Live hierarchy tree + `findNodeById` / `getNodePath` for DynamicForm — demo metrics/logs helpers removed |
| Date-stamped docs / `context-bundle/` / bugfix HANDOFFs | Historical narrative; not active setup instructions |
| `dev sec/supertokens-rbac-changed-files/` | Archive snapshot — not live source |
| Backend test doubles (`mockUser`, etc.) | Ordinary unit-test fakes, unrelated to frontend Mock Mode |

## Not changed (by design)

- Business logic, DB schema, RBAC, routes, page layouts, login redesign
- RabbitMQ EventEmitter fallback behavior (preserved)
