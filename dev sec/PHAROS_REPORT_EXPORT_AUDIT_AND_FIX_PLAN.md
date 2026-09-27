# PHAROS Reports and Exports: Audit and Fix Implementation Plan

**Scope requested:** the report export functions, with focus on the custom report builders and the export/download paths, plus related features (saved reports, cross match, audit log).
**Basis:** static audit of the updated `dp-dev` codebase delivered on 27 Sep 2026. Every finding below cites the exact file and line and was confirmed against the current migrations and schema dump (`schema_for_drawio.sql`), not against older specification documents.
**Verdict in one line:** the statutory diary engine (PHQ, District, FN) is healthy, but the two custom report builders and the download layer have several defects that range from silent data loss to a broken feature and one serious access control gap. All are fixable without schema changes except one optional index.

---

## 1. How the report and export subsystem is wired

There are four distinct export producers behind the Reports page (`frontend/src/pages/reports/ReportsPage.jsx`, tabs `builder`, `excel`, `multisheet`, `trace`):

| UI tab | Frontend file | Endpoint hit | Backend engine | Output |
| :--- | :--- | :--- | :--- | :--- |
| Report Builder (pivot) | `ReportBuilder.jsx` | `POST /warehouse/export`, `POST /reports/builder/saved`, `POST /reports/builder/saved/:id/run` | warehouse pivot engine | pivot xlsx + saved presets |
| Custom Excel Builder | `CustomExcelBuilder.jsx` | `POST /reports/builder/export` then `GET /reports/status/:id` then `GET /reports/download/:id` | `report-builder/queryEngine.js` | csv / xlsx / pdf register report |
| Multi Sheet Builder | `MultiSheetReportBuilder.jsx` | `POST /reports/generate` (with `custom_definition`) then status then download | `reports.controller.js` -> `generateCustomExcelReport` -> `getRecordsForReport` | multi sheet xlsx |
| Statutory diaries | (other pages) | `POST /reports/generate` (template code) | `report-engine.service.js` (Node, ExcelJS) | PHQ / District / FN xlsx |

Two facts drive most of the findings:

1. **`records.data` no longer exists.** Migration `20260711000003_locations_records_details.js` line 2 states "records.data jsonb is DEAD, every field has a typed home", and the schema dump confirms the `records` spine has `record_type, ps_id, district_id, sub_div_id, io_id, original_ps_id, current_status, current_level, record_date, is_frozen, is_legacy, ..., registration_date, uid` and no `data` column. Any query that selects or reads `records.data` (or an aliased `L.data`, `M.data`, `U.data`) hard errors in PostgreSQL.

2. **The report builder query engine caps every query at 500 rows** (`queryEngine.js:354` and `:684`, `Math.min(pageSize, 500)`), while the export path asks for 50000 (`reportBuilder.controller.js:429`). The cap wins.

---

## 2. Findings, ordered by severity

Severity key: **P0** breaks a feature or leaks data, fix immediately. **P1** silent wrong output or data loss. **P2** correctness or security hardening. **P3** cleanup.

### P0-1 Unauthenticated report download (PII exposure)

**Where:** `backend/src/modules/reports/reports.router.js:18`
```js
router.get('/download/:id/:filename?', reportsController.downloadReport);
```
Every other route on this router passes `authMiddleware`; this one does not, and there is no global auth at the mount (`app.js:148-149` mounts the router with no wrapper; the global chain is CSRF plus rate limit only, and CSRF double submit does not gate GET). `downloadReport` (`reports.controller.js:1164`) looks the job up by id and streams `job.file_path` with no auth, no ownership check, and no jurisdiction check.

**Impact:** anyone who obtains a report job UUID (from logs, browser history, a shared link, a referrer header, or the history API) can download the file over the open internet, including all Delhi PHQ diaries and register reports containing arrestee names, addresses, and victim details. This is a broken access control defect on a police PII system.

**Related:** the builder's own status/download endpoint `GET /reports/builder/export/:jobId` (`reportBuilder.controller.js:599`) is authenticated (the builder router applies `authMiddleware, enforceScope` at `reportBuilder.router.js:20`) but performs no per job ownership or scope check, so any authenticated user can pull any other user's export by job id (IDOR). The frontend even bypasses this authenticated endpoint and downloads through the insecure generic one (`CustomExcelBuilder.jsx:488`, `MultiSheetReportBuilder.jsx:149`).

**Fix:** add auth to the route, and add an ownership plus jurisdiction check inside both download handlers. See 3.1.

---

### P0-2 Multi Sheet Builder and legacy templates fail every time (dead column select)

**Where:** `backend/src/modules/reports/reports.controller.js:177`
```js
'r.id', 'r.uid', ... , 'r.data as raw_data',
```
`getRecordsForReport` explicitly selects `r.data as raw_data`. Because `records.data` does not exist, PostgreSQL rejects the query with `column r.data does not exist`, the function throws, and the job is marked `FAILED`.

**Callers that break:**
- `generateCustomExcelReport` (`:373`), which is the Multi Sheet Builder path (`MultiSheetReportBuilder.jsx` -> `POST /reports/generate` with `custom_definition` -> `generateReportInternal:708` -> `generateCustomExcelReport`). Every multi sheet export fails with "Report generation failed on server".
- Legacy single record templates `arrest-summary`, `pcr-call-log`, `cases-register` (`generateReportInternal:881`), for PDF, Excel, and CSV.

Note the detail data itself is already available: `getRecordsForReport` also left joins `fir_details, arrest_details, missing_details, uidb_details, pcr_call_details` and the `persons` table and composes a `data` object from those (`:268-288`). The `r.data as raw_data` select is the only dead reference; removing it restores the whole function.

**Fix:** drop the dead select and the `raw_data` parse. See 3.2.

---

### P1-1 Custom report exports silently truncated to 500 rows

**Where:** `backend/src/modules/report-builder/reportBuilder.controller.js:429`
```js
const exportSpec = { ...spec, page: 1, pageSize: 50000 };
```
against `queryEngine.js:354` and `:684`
```js
const limit = Math.min(parseInt(pageSize, 10) || 500, 500);
```
The engine hard caps `limit` at 500, so the export ignores the 50000 request and writes at most 500 rows. In the LIVE path the candidate fetch is also bounded (`queryEngine.js:476`, `limit * 5`) and the loop breaks at `offset + limit` (`:669`), so the ceiling holds.

**Impact:** the Custom Excel Builder (`CustomExcelBuilder.jsx`, the tab most likely meant by "custom reports") produces a file that looks complete but stops at 500 records with no warning. For any station or district with more than 500 records in the selected window, or for per accused / per victim / per property grains where one FIR yields several rows, the register is quietly incomplete. This is the highest impact correctness defect for exports.

**Fix:** give the export path a real, higher cap (streamed or paginated), separate from the 500 preview cap. See 3.3.

---

### P1-2 Saving or updating a custom (pivot) report preset always fails

**Where:** `backend/src/modules/report-builder/reportBuilder.controller.js:694` (`createSavedReport`) and `:741` (`updateSavedReport`)
```js
const { ok, errors } = validateQuerySpec(query_spec, role);
if (!ok) return res.status(400)...
```
`validateQuerySpec` (`queryEngine.js:252`) requires `spec.table` in `ALLOWED_TABLES` and a non empty `spec.fields`. But `ReportBuilder.jsx:119` saves a pivot spec:
```js
query_spec: { rows, columns, measure, filters }
```
which has no `table` and no `fields`, so validation returns `Invalid or missing table` and the endpoint answers 400. The whole subsystem around it is pivot shaped and consistent (the run endpoint `runSavedReport:794` reads `spec.rows/columns/measure` and calls `runPivotReport`; `getQuickAccessReports:889` returns pivot specs), so only the create and update validators are on the wrong schema.

**Impact:** the "Save preset" and edit actions in the main Report Builder are broken; users cannot persist a custom pivot report.

**Fix:** detect spec shape and validate accordingly (pivot vs table/field). See 3.4.

---

### P1-3 Joined custom reports: left JSON filters crash, right filters silently ignored

**Where:** `backend/src/modules/report-builder/queryEngine.js:832-836` (LIVE joined path)
```js
if (leftFilters.conditions.length > 0) {
  leftQ = leftQ.where(function () {
    applyFilterSpec(this, leftFilters, leftTable, validatedFieldMap, 'L');
  });
}
```
`leftFilters` includes every left table condition, including non column (JSONB) fields. For those, `resolveFieldExpr` returns `CAST(L.data AS jsonb)->>'key'` (`queryEngine.js:50-55`, `:76-84`), and `L.data` does not exist, so a joined export that filters on any left side content field throws. The default Custom Excel Builder filters use only system columns (`_record_date`, `_ps_id`, all `is_db_col`), so the default join does not crash, but any user added content filter on the left table does.

Separately, `rightFilters` is built (`:822-830`) but never applied in the LIVE branch; the right side is joined unfiltered (`:843-859`). So filtering a CASE plus ARREST report by an arrest field returns arrest rows that ignore the filter. The WAREHOUSE branch does apply right filters (`:770-774`), so behaviour differs by mode, which hides the bug in testing.

**Fix:** in LIVE joins, push only `is_db_col` left filters to SQL and apply the rest (and all right filters) in memory after recompose, mirroring the single table path. See 3.5.

---

### P1-4 Missing to UIDB cross match crashes when the warehouse is not ready

**Where:** `backend/src/modules/report-builder/queryEngine.js:1159-1208` (LIVE fallback of `executeMissingUidbCrossMatch`)
```js
.select('M.id', 'M.record_date', 'M.ps_id', 'M.district_id', 'M.data', ...)
...
const genderExprM = pg ? `M.data->>'gender'` : ...
```
This path selects and reads `M.data` and `U.data`. `executeMissingUidbCrossMatch` chooses mode with `resolveQueryMode()` (`:1068`), whose default is AUTO and resolves to LIVE whenever the warehouse is not ready (`warehouse.db.js:126-133`). On any deployment without a populated warehouse (a fresh install, or ETL not yet run), the cross match report throws `column M.data does not exist`.

**Fix:** rebuild the LIVE fallback on the normalized detail tables (`missing_details`, `uidb_details`) or via `recomposeRecord`, the same pattern the single table LIVE path already uses. See 3.6.

---

### P2-1 Custom report PDF export produces blank data cells

**Where:** `backend/src/modules/report-builder/reportBuilder.controller.js:556-561`
```js
const tbody = tableRows.map(row =>
  `<tr>${headers.map(h => `<td>${row[h.key] ?? ''}</td>`).join('')}</tr>`
).join('');
```
`headers` here is the output of `buildSectionConsolidatedHeaders`, whose objects are `{ groupKey, label, isGroup, memberFields }` with no `key` property. So `row[h.key]` is `row[undefined]` for every cell and the whole table body renders empty; only the header row shows. The CSV and XLSX writers correctly use `formatSectionCell(row, groupDef, rowGrain)` (`:471`, `:514`), but the PDF writer does not, and it also ignores `rowGrain`, so accused / victim / property compiled columns never appear.

Secondary issue in the same function: cell values and `spec.filters` are interpolated into HTML without escaping, so once real data renders, a field containing `<`, `>`, or `</td>` breaks the layout or injects markup into the Puppeteer render.

**Fix:** render PDF cells through `formatSectionCell` and HTML escape. See 3.7.

---

### P2-2 CSV export is open to formula (CSV) injection

**Where:** `backend/src/modules/report-builder/reportBuilder.controller.js:466-477` (`generateCsv`)
The writer quotes values and doubles inner quotes, but does not neutralize a leading `=`, `+`, `-`, `@`, tab, or carriage return. Exports contain user entered text (names, addresses, brief facts), so a value like `=HYPERLINK("http://evil","click")` or `=cmd|...` is treated as a live formula when the CSV is opened in Excel or LibreOffice. This is the standard CSV injection risk and matters more here because the audience opens these files in Excel by default.

**Fix:** prefix a leading formula trigger with an apostrophe before quoting. See 3.8.

---

### P2-3 Export and audit attribution can be silently misassigned

**Where:** `reportBuilder.controller.js:59-62` and `:260-263`, and `reports.controller.js:643`
```js
// audit + job creator fallback
const fallback = await db('users').select('id').first();
userIdVal = fallback ? fallback.id : null;
...
const effectiveUserId = userId || req.user?.id || 'bf5af8de-2e04-40ed-928e-6a0b02916fc2';
```
When the caller id is missing or not a UUID, the export job and the `report_builder_audit` row are attributed to the first user in the table (often the seeded admin), and the statutory path falls back to a hardcoded UUID. The point of `report_builder_audit` is to record who ran and exported what; a silent substitution corrupts that record and, for a police system, undermines the accountability trail on PII exports.

**Fix:** treat a missing or invalid user id as an auth failure (401), do not substitute. See 3.9.

---

### P2-4 Output directory env var drift and no retention

**Where:** `backend/src/config/env.js:56` defines `REPORTS_OUTPUT_DIR` (default `./reports/output`), but every writer and reader uses `process.env.REPORTS_DIR || './generated-reports'` (`reports.controller.js:631`, `:1453`, `reportBuilder.controller.js:229`, `daily-diary.service.js:919`, `scheduler.js:97`). The declared config knob does nothing; an operator who sets `REPORTS_OUTPUT_DIR` sees no effect and reports land in an unexpected directory. There is also no cleanup, so `generated-reports/` grows without bound and old PII files linger on disk.

**Fix:** standardize on one variable and add a retention sweep. See 3.10.

---

### P3 Cleanups (low risk, do in the same pass)

- **`run_count` is not a column.** `getQuickAccessReports` reads `r.run_count` and sorts by it (`reportBuilder.controller.js:890-891`), but `report_builder_saved` has no such column (confirmed in schema dump and migration `20260824000001`). The value is always 0, so the "most used" ordering is dead. Either add the column and increment it in `runSavedReport`, or drop the sort.
- **Custom definition record types are limited to ARREST, PCR_CALL, CASE** (`validateCustomDefinition:487`). MISSING and UIDB custom sheets are rejected. Confirm this is intended; if not, extend the allow list.
- **Builder download double sets headers** (`reportBuilder.controller.js:626-628` sets Content-Type and Content-Disposition, then `res.download` sets them again). Harmless but redundant; drop the manual headers.
- **Filename metadata for builder jobs is empty** because `startExport` stores `filters: JSON.stringify({ spec })` (`:269`), so `downloadReport`'s date based filename logic (`:1213-1223`) never matches. Cosmetic.

---

## 3. Fix implementation plan (drop in patches)

Each patch is self contained and ordered by severity. Apply P0 and P1 first; they restore broken features and stop the data leak. No schema migration is required for any P0 or P1 fix.

### 3.1 Secure the download endpoints (P0-1)

**a. Add auth to the route.** `reports.router.js`
```js
// before
router.get('/download/:id/:filename?', reportsController.downloadReport);
// after
router.get('/download/:id/:filename?', authMiddleware, reportsController.downloadReport);
```

**b. Enforce ownership plus jurisdiction inside `downloadReport`** (`reports.controller.js`, after the job is loaded at `:1169`):
```js
const job = await db('report_jobs').where({ id }).first();
if (!job) { /* existing 404 */ }

// Access control: creator, or same jurisdiction, or global reader.
const role = req.user?.role;
const GLOBAL = ['JCP','SCP','HQ_ANALYST','HQ_ADMIN','SYSTEM_ADMIN'];
const isOwner = job.created_by && job.created_by === (req.user?.userId || req.user?.id);
if (!isOwner && !GLOBAL.includes(role)) {
  // Scope the file to the caller's PS / district via the stored filters.
  const f = (() => { try { return JSON.parse(job.filters || '{}'); } catch { return {}; } })();
  const spec = f.spec || f;
  const scopePs = spec.ps_id || spec.psId || spec.station_id;
  const scopeDist = spec.district_id || spec.districtId;
  const okPs = req.user?.ps_id && scopePs && req.user.ps_id === scopePs;
  const okDist = req.user?.district_id && scopeDist && req.user.district_id === scopeDist;
  if (!okPs && !okDist) {
    return res.status(403).json({ status: 'error', success: false, code: 'FORBIDDEN', message: 'Not authorized to download this report' });
  }
}
```

**c. Same ownership check in the builder handler** `getExportStatus` (`reportBuilder.controller.js:599`), before streaming the file at `:617`:
```js
const uid = userId(req);
const role = userRole(req);
const GLOBAL = ['JCP','SCP','HQ_ANALYST','HQ_ADMIN','SYSTEM_ADMIN'];
if (job.created_by !== uid && !GLOBAL.includes(role)) {
  return res.status(403).json({ success: false, message: 'Not authorized to download this export' });
}
```

**d. Point the frontend at the authenticated builder endpoint.** In `CustomExcelBuilder.jsx:488` and the multi sheet download, keep using the axios instance (it already attaches the bearer token) and, for builder jobs, prefer `GET /reports/builder/export/:jobId`. With patch (a) in place the generic path is also safe, so this is defense in depth.

### 3.2 Restore `getRecordsForReport` (P0-2)

`reports.controller.js:177`, remove the dead column from the select:
```js
// before
'r.id', 'r.uid', 'r.record_type', 'r.record_date', 'r.registration_date', 'r.current_status', 'r.current_level', 'r.ps_id', 'r.district_id', 'r.data as raw_data',
// after
'r.id', 'r.uid', 'r.record_type', 'r.record_date', 'r.registration_date', 'r.current_status', 'r.current_level', 'r.ps_id', 'r.district_id',
```
Then at `:269` stop parsing the removed alias:
```js
// before
const parsedData = parseJsonField(r.raw_data) || {};
// after
const parsedData = {}; // detail comes from the joined detail tables + persons below
```
The remainder of the function already builds the returned `data` object from `fd_*, ad_*, md_*, ud_*, pd_*` and `personMap`, so multi sheet and legacy templates work again. Verify with a multi sheet export of a CASE sheet after the change.

### 3.3 Raise the export row cap (P1-1)

Give `executeSingleTableQuery` and `executeJoinedQuery` an explicit export ceiling that is separate from the 500 preview cap. Two step change:

In `queryEngine.js:354` and `:684`:
```js
// before
const limit = Math.min(parseInt(pageSize, 10) || 50, 500);
// after
const MAX_EXPORT_ROWS = parseInt(process.env.REPORT_EXPORT_MAX_ROWS || '100000', 10);
const requested = parseInt(pageSize, 10) || 50;
const limit = spec.export ? Math.min(requested, MAX_EXPORT_ROWS) : Math.min(requested, 500);
```
In `reportBuilder.controller.js:429` mark the export spec:
```js
const exportSpec = { ...spec, page: 1, pageSize: 100000, export: true };
```
Also lift the LIVE candidate fetch (`queryEngine.js:476`) so it does not starve the export:
```js
// before
const rows = await query.limit(Math.max(limit * 5, 100));
// after
const rows = await query.limit(spec.export ? Math.max(limit, 100) : Math.max(limit * 5, 100));
```
For very large exports the LIVE per record recompose loop is the real cost; if exports routinely exceed a few thousand rows, prefer the WAREHOUSE path (ensure ETL is current) or stream rows to the file in batches rather than buffering. Add a visible note in the UI when `total` exceeds the cap so users know the file is bounded.

### 3.4 Accept pivot specs when saving presets (P1-2)

`reportBuilder.controller.js`, add a shape aware validator and use it in `createSavedReport:694` and `updateSavedReport:741`:
```js
function validateSavedSpec(spec, role) {
  if (spec && (Array.isArray(spec.rows) || Array.isArray(spec.columns) || spec.measure)) {
    // pivot spec: minimal validation
    if (!spec.measure) return { ok: false, errors: ['pivot spec requires a measure'] };
    return { ok: true, errors: [] };
  }
  return validateQuerySpec(spec, role); // table/field spec
}
```
```js
// createSavedReport / updateSavedReport
const { ok, errors } = validateSavedSpec(query_spec, role);
```
Leave `runSavedReport` as is (it already reads the pivot shape). Verify: save a preset from the Report Builder, reload Quick Access, run it.

### 3.5 Fix LIVE joined filters (P1-3)

`queryEngine.js`, in the LIVE branch of `executeJoinedQuery` (around `:822-859`):

1. Push only `is_db_col` left conditions to SQL:
```js
const leftDbFilters = { logic: leftFilters.logic, conditions: leftFilters.conditions.filter(c => {
  const def = validatedFieldMap.get(`${(c.table||leftTable)}.${c.field}`);
  return def && def.is_db_col;
})};
if (leftDbFilters.conditions.length > 0) {
  leftQ = leftQ.where(function () { applyFilterSpec(this, leftDbFilters, leftTable, validatedFieldMap, 'L'); });
}
```
2. After recompose, apply the remaining left content filters and the right filters in memory (same comparator style as the single table LIVE path at `:512-521`), before pushing to `joinedRows`. Filter each right match against `rightFilters` and drop non matches; skip a left row whose content filters fail.

This makes LIVE join behaviour match the WAREHOUSE branch, and removes the `L.data` reference entirely.

### 3.6 Rebuild the cross match LIVE fallback on normalized tables (P1-4)

`queryEngine.js:1156-1254`, replace the `M.data` / `U.data` reads. Join the detail tables directly:
```js
let missingQ = db('records as M')
  .select('M.id','M.record_date','M.ps_id','M.district_id',
          'ps.name as ps_name','dist.name as district_name',
          'md.person_name as missing_name','md.age as age','md.gender as gender',
          'md.missing_date','md.physical_description')
  .leftJoin('missing_details as md','M.id','md.record_id')
  .leftJoin('hierarchy_nodes as ps','M.ps_id','ps.id')
  .leftJoin('hierarchy_nodes as dist','M.district_id','dist.id')
  .where('M.record_type','MISSING');
// uidbQ analogous against uidb_details (approx_age, gender, found_date, found_place, description, identified)
```
Confirm the exact `missing_details` and `uidb_details` column names against migration `20260711000003` and adjust. Then apply the same gender, age window, and keyword scoring already present, reading from the joined columns instead of `data`. This mirrors the pattern the single table LIVE path already uses successfully.

### 3.7 Fix PDF cell rendering and escaping (P2-1)

`reportBuilder.controller.js`, change the `generatePdf` signature to receive `rowGrain` and render through the shared formatter:
```js
// call site :448
await generatePdf(rows, sectionHeaders, spec, filePath, rowGrain);

// function
const esc = (s) => String(s).replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/"/g,'&quot;');
async function generatePdf(rows, sectionHeaders, spec, filePath, rowGrain = 'per_fir') {
  const tableRows = rows.slice(0, 5000);
  const thead = sectionHeaders.map(h => `<th>${esc(h.label)}</th>`).join('');
  const tbody = tableRows.map(row =>
    `<tr>${sectionHeaders.map(h => `<td>${esc(formatSectionCell(row, h, rowGrain)).replace(/\n/g,'<br>')}</td>`).join('')}</tr>`
  ).join('');
  // ... unchanged html shell, but escape spec.filters too:
  // <p>Filters: ${esc(spec.filters ? JSON.stringify(spec.filters) : 'None')}</p>
}
```

### 3.8 Neutralize CSV formula injection (P2-2)

`reportBuilder.controller.js:466`, guard each cell before quoting:
```js
const csvSafe = (v) => {
  let s = v == null ? '' : String(v);
  if (/^[=+\-@\t\r]/.test(s)) s = `'${s}`; // break formula execution in spreadsheet apps
  return `"${s.replace(/"/g, '""')}"`;
};
// header
const lines = [colLabels.map(csvSafe).join(',')];
// data
const cells = sectionHeaders.map(g => csvSafe(formatSectionCell(row, g, rowGrain)));
```

### 3.9 Stop silent attribution substitution (P2-3)

`reportBuilder.controller.js` (`writeAuditLog` and `startExport`) and `reports.controller.js:643`: when the resolved user id is missing or not a UUID, do not substitute the first user or a hardcoded UUID. In the request handlers (`startExport`, `generateReport`) return 401:
```js
const uid = userId(req);
if (!uid || !UUID_RE.test(uid)) {
  return res.status(401).json({ success: false, message: 'Authenticated user id required' });
}
```
Keep `writeAuditLog` non blocking, but write `user_id: null` rather than a wrong user when the id is invalid, so the audit never names the wrong person. Remove the `bf5af8de-...` literal.

### 3.10 Standardize the output directory and add retention (P2-4)

Pick one variable. Recommended: keep `REPORTS_DIR` (all code already uses it) and make `env.js` authoritative:
```js
// env.js
REPORTS_DIR: getEnv('REPORTS_DIR', './generated-reports'),
```
Remove `REPORTS_OUTPUT_DIR`, or alias it: `REPORTS_DIR: getEnv('REPORTS_DIR', getEnv('REPORTS_OUTPUT_DIR', './generated-reports'))`. Then have each writer read `env.REPORTS_DIR` rather than `process.env.REPORTS_DIR` directly, so the default is single sourced. Add a small scheduled sweep (reuse `reports/scheduler.js`) that deletes files in `REPORTS_DIR` older than N days and, ideally, marks the corresponding `report_jobs` row as expired.

---

## 4. Suggested sequencing and verification

**Batch 1, immediate (P0):** 3.1 download auth and scope, 3.2 dead column. These stop the PII leak and restore the multi sheet builder. Verify: (a) `curl` the download URL without a token returns 401; (b) a multi sheet CASE export completes and opens.

**Batch 2, this sprint (P1):** 3.3 row cap, 3.4 save preset, 3.5 joined filters, 3.6 cross match. Verify each against a dataset with more than 500 records in scope, a saved pivot preset round trip, a CASE plus ARREST export with a left content filter and a right filter, and a cross match run with the warehouse turned off (`WAREHOUSE_QUERY_MODE=LIVE_ONLY`).

**Batch 3, hardening (P2, P3):** 3.7 PDF, 3.8 CSV injection, 3.9 attribution, 3.10 output dir and retention, plus the P3 cleanups.

**Regression guard:** add tests under `backend/tests` for (1) download returns 401 without auth and 403 across jurisdiction, (2) `getRecordsForReport` returns rows with no reference to `records.data`, (3) an export of more than 500 rows writes more than 500 rows, (4) `createSavedReport` accepts a pivot spec, (5) a joined LIVE export honours a right side filter. The repo already has a working `verify_final_export.mjs` pattern for the daily diary that can be adapted for the builder exports.

---

## 5. What is healthy (no action needed)

- The statutory diary engine (PHQ, District, FN) runs in Node via `report-engine.service.js` and does not touch `records.data`; the dispatch in `generateReportInternal:734` routes correctly by template code.
- The warehouse pivot export (`POST /warehouse/export`, used by the Report Builder tab) is behind `authMiddleware` (`warehouse.router.js:14`).
- The report builder query engine correctly whitelists tables, joins, fields, and operators, and applies PII gating by role (`validateQuerySpec`, `filterFieldsForRole`); there is no raw SQL injection surface in the builder.
- The single table LIVE path already reads from the normalized detail tables via `recomposeRecord` rather than the dead `data` column, and pre aggregates persons and properties to avoid fan out duplication.

*Prepared from static analysis of dp-dev as delivered 27 Sep 2026. Line numbers refer to that snapshot.*
