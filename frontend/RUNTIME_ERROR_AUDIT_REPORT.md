# Frontend Runtime Error Audit Report

**Date:** 2026-09-25  
**Scope:** React frontend (`frontend/src`) — data-safety / runtime TypeErrors  
**Constraint:** No design, typography, layout, auth, route, or business-logic changes

---

## Summary

| Metric | Count |
|--------|------:|
| Suspicious locations inventoried (audit) | ~40 high-risk + systemic patterns |
| Locations fixed in this pass | ~35 call sites across 25+ files |
| New shared helpers | 1 module (`dataShape.js`) |
| Lint | 273 problems (pre-existing baseline; no new issues in touched files) |
| Typecheck | N/A (no script) |
| Tests | N/A (no frontend test script) |
| Build | Succeeded (`vite build`, ~6.7s) |

**Primary crash fixed:** `AnalyticsDashboard.jsx:436` — `crimeHeadMatrix.rows.length` when `data` was a truthy incomplete object (mock fallthrough `{ message: 'Success (Mock Fallthrough)' }` or partial API payload). React Query default and `?? { columns: [], rows: [] }` only cover `undefined`/`null`, not incomplete objects.

---

## Root-cause categories

1. **Incomplete nested objects** — Truthy payload missing nested arrays (`rows`, `contributions`, `results.*`).
2. **Records-list polymorphism** — Live `{ cases }`, SHO `{ queue }`, mock bare array; `cases || data || []` keeps non-array objects.
3. **`|| []` / RQ `= []` without `Array.isArray`** — Defaults apply only for `undefined`; non-array truthy values pass through.
4. **Raw `setState(res.data.data)` on graphs** — Nested property access assumes full schema.
5. **Schema fields assumed arrays** — `section.fields`, `condition.and`, `not_in`, `act_name.split`.

**API convention:** Live `{ success, data }` → axios `res.data.data`. Mock `{ status: 'success', data }` (no `success` boolean). Normalization is done at queryFn/setState boundaries, not by rewriting the mock envelope globally.

---

## Convention established

| Shape | Fallback |
|-------|----------|
| Lists / arrays | `[]` via `asArray` / `asRecordsList` / `asNodesList` / `asLogsList` |
| Crime-head matrix | `{ columns: [], rows: [], period? }` via `asCrimeHeadMatrix` |
| NL search graph | Stable `totals` + empty match arrays via `asSearchResults` |
| Trace graph | `{ record: {}, contributions: [] }` via `asTraceData` |
| Pivot | Arrays for `cells` / headers / totals via `asPivotData` |
| Loading vs empty | Loading remains separate; empty is valid empty shape, not `undefined` |

Shared module: [`frontend/src/utils/dataShape.js`](src/utils/dataShape.js)

---

## Important fixes (File → root cause → fix)

| File | Root cause | Fix |
|------|------------|-----|
| `pages/analytics/AnalyticsDashboard.jsx` | Incomplete matrix object → `rows.length` crash | `asCrimeHeadMatrix` / `asArray` in queryFns |
| `pages/hc/Dashboard.jsx` | Same shallow `\|\| { columns, rows }` | `asCrimeHeadMatrix` + `asArray` for points/rows/lists |
| `components/common/CrimeHeadMatrixTable.jsx` | Explicit `undefined` props override defaults | Coerce with `asArray`; default columns when empty |
| `utils/api.js` | No mock for crime-head-matrix → fallthrough message object | Empty valid mocks for matrix, case-status, arrest-trend, summary, status-breakdown |
| `pages/sho/Queue.jsx` | `queue \|\| data \|\| []` non-array | `asRecordsList` |
| `pages/hc/MyRecords.jsx` | Multi-shape cascade | `asRecordsList` throughout |
| `pages/hq/Dashboard.jsx` | `cases \|\| data \|\| []` | `asRecordsList` / `asArray` |
| `pages/hq/DistrictAnalyticsDashboard.jsx` | Nodes/records unwrap | `asNodesList` / `asRecordsList` |
| `pages/district/Dashboard.jsx` | Raw chart `data` | `asArray` |
| `pages/shared/StationPerformanceDashboard.jsx` | Loose unwraps; `parent_id.includes` | `asNodesList`/`asRecordsList`/`asArray`; optional chaining |
| `pages/shared/StationDetailView.jsx` | Same | `asNodesList` / `asRecordsList` |
| `pages/district/CompilationUI.jsx` | Nodes / sheets / compilations | `asNodesList` / `asArray` |
| `pages/sho/IOManagement.jsx` | `data \|\| []` | `asArray` |
| `pages/PersonSearchPage.jsx` | `data \|\| []` | `asArray` |
| `components/common/UnifiedFilterStrip.jsx` | Local heads | `asArray` |
| `components/layout/PoliceNavbar.jsx` | Raw unread list | `asArray` |
| `pages/admin/AuditPage.jsx` | `logs \|\| data` | `asLogsList` / `asArray` |
| `components/records/StatusUpdateModal.jsx` | PS nodes / options | `asNodesList` / `asArray` |
| `components/forms/DynamicForm.jsx` | Linked cases cascade; `act_name.split`; `section.fields` validate/submit | `asRecordsList`; `String(...).split`; `flattenSectionFields` / `asArray` |
| `pages/reports/NaturalLanguageSearchPanel.jsx` | Nested totals/results/bindings | `asSearchResults` / `asArray` |
| `pages/reports/RecordTracePanel.jsx` | `record` / `contributions` | `asTraceData` |
| `pages/reports/ReportBuilder.jsx` | Pivot `rowTotals` / `values` / `cells`; quick-access list | `asPivotData` / `asArray` |
| `pages/reports/MultiSheetReportBuilder.jsx` | Stations / metadata fields | `asArray` + default `[]` |
| `components/forms/FormSection.jsx` | `fields` / `and` / `not_in` | `asArray` |
| `components/forms/ActsSectionsTable.jsx` | Missing registry prop | Default `actsSectionsRegistry = []` |
| `pages/admin/LevelContractsPage.jsx` | Inconsistent map guard | `(aggregate_definitions \|\| []).map` |

---

## Intentionally guarded / remaining risks

- **Mock `success` gate:** Some fetches require `res.data.success` (live) while mock returns `status: 'success'`. Not rewritten globally this pass; sites already using `Array.isArray` after success gates (e.g. major/minor heads) left as-is. Residual: those lookups may no-op in mock until envelope aligned.
- **Auth / schema loading gates:** `useAuth`, `recordPayload` without array defaults remain intentional (gated by loading UI).
- **ErrorBoundary:** Unchanged — still for genuine unexpected failures only.
- **Deep DynamicForm paths:** Only highest-risk validate/submit/`act_name` paths hardened; the form file is large and may have additional edge cases under rare schemas.
- **ReportBuilder dimensions:** `fieldsData?.dimensions \|\| []` retained; full fields catalogue object not fully normalized.

---

## Validation performed

1. `npm run lint` — 273 problems (pre-existing; no new findings attributed to `dataShape` or primary fix files).
2. `npm run build` — success.
3. Browser smoke (SHO login, Live API):
   - `/analytics` — renders; empty matrix message; **no** ErrorBoundary / “Cannot read properties”.
   - `/queue` — empty queue message; no crash.
   - `/ps/dashboard` — matrix empty state; no crash.

---

## Files changed

- `frontend/src/utils/dataShape.js` **(new)**
- `frontend/src/utils/api.js`
- `frontend/src/pages/analytics/AnalyticsDashboard.jsx`
- `frontend/src/pages/hc/Dashboard.jsx`
- `frontend/src/pages/hc/MyRecords.jsx`
- `frontend/src/pages/sho/Queue.jsx`
- `frontend/src/pages/sho/IOManagement.jsx`
- `frontend/src/pages/hq/Dashboard.jsx`
- `frontend/src/pages/hq/DistrictAnalyticsDashboard.jsx`
- `frontend/src/pages/district/Dashboard.jsx`
- `frontend/src/pages/district/CompilationUI.jsx`
- `frontend/src/pages/shared/StationPerformanceDashboard.jsx`
- `frontend/src/pages/shared/StationDetailView.jsx`
- `frontend/src/pages/PersonSearchPage.jsx`
- `frontend/src/pages/admin/AuditPage.jsx`
- `frontend/src/pages/admin/LevelContractsPage.jsx`
- `frontend/src/pages/reports/NaturalLanguageSearchPanel.jsx`
- `frontend/src/pages/reports/RecordTracePanel.jsx`
- `frontend/src/pages/reports/ReportBuilder.jsx`
- `frontend/src/pages/reports/MultiSheetReportBuilder.jsx`
- `frontend/src/components/common/CrimeHeadMatrixTable.jsx`
- `frontend/src/components/common/UnifiedFilterStrip.jsx`
- `frontend/src/components/layout/PoliceNavbar.jsx`
- `frontend/src/components/records/StatusUpdateModal.jsx`
- `frontend/src/components/forms/FormSection.jsx`
- `frontend/src/components/forms/DynamicForm.jsx`
- `frontend/src/components/forms/ActsSectionsTable.jsx`
- `frontend/RUNTIME_ERROR_AUDIT_REPORT.md` **(this file)**

---

## Unresolved risks

1. Align mock envelope with `{ success: true, data }` for `success`-gated fetches (follow-up).
2. Broader DynamicForm / CustomExcelBuilder edge cases if incomplete schema reaches rare branches.
3. No automated regression tests for data-shape helpers — consider unit tests for `asCrimeHeadMatrix` / `asRecordsList` next.
