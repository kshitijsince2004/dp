# PHAROS / Crime Diaries (PRISM): Code Audit and Restructuring Plan

**Companion to:** `PHAROS_REVERSE_ENGINEERING_BLUEPRINT.md` (read that first for the high-level architecture; this document goes function by function and gives the concrete restructuring, naming, and mapping work).

**Basis:** Full static reverse engineering of the delivered source (`Crime-Diaries-collab-Vaibhav`), confirmed by reading controllers, services, the mapper engine, config, migrations, and the schema dump.

**Confidence legend:** **[Code]** confirmed in source; **[Inferred]** reasonable conclusion from patterns; **[Unclear]** needs validation.

**Scope decision (stated up front):** This is an audit plus an exact, reviewable plan. Restructuring and renaming are destructive operations, and this system does not run yet (see the blueprint's deployment blockers), so the correct order is: apply the deployment fixes and stand the system up, adopt this plan, then execute the moves and renames on a branch with the import-rewrite and verification steps in Part 6. Nothing in the codebase has been moved or renamed by producing this document. On your go-ahead, the moves in Parts 4 and 5 can be executed mechanically.

**How this document is organised**

- Part 1: Exhaustive functional audit, module by module and function by function.
- Part 2: Every end-to-end flow, traced through the layers.
- Part 3: The complete data and mapping model (the "mapping proper").
- Part 4: File and folder restructuring plan, with an exact move/delete map.
- Part 5: Naming correction plan, with exact rename tables.
- Part 6: Context-and-memory-preserving execution plan (how to apply without breaking anything).
- Part 7: Prioritised backlog.

---

# PART 1. Exhaustive Functional Audit (backend)

Layering convention across every module: `X.router.js` binds middleware and paths, `X.controller.js` handles HTTP shape, `X.service.js` holds business logic and Knex. Side effects publish events; handlers react. Functions below are the actual exports found in source.

## 1.1 auth

**Files:** `auth.router.js`, `auth.controller.js`, `auth.service.js`.
**Controller:** `login`, `refresh`, `logout`, `me`, `changePassword`, `getNotifications`, `markNotificationRead`.
**Service:** `resolveScope`, `loginUser`, `refreshUserToken`, `logoutUser`.

**What it does.** Badge/username + password login (bcrypt), issues a 15m access JWT (snake_case claims) and a 7d refresh token stored in Redis or an in-memory Map fallback. `resolveScope` backfills missing `sub_div_id`/`district_id` by climbing `hierarchy_nodes` before signing. `refresh` re-queries the user so role/scope/active changes take effect. Optional Keycloak path activates only if `KEYCLOAK_URL` is set. **[Code]**

**Issues / notes.** (a) Dev-only login backdoor (`Password123`, `test123`, `Test@1234`) and dev badge aliases, gated to `NODE_ENV=development`; must run production mode to disable. (b) `getNotifications`/`markNotificationRead` live in the auth controller but duplicate the `notifications` module's job (route `/auth/notifications` overlaps `/notifications`); consolidate into `notifications`. (c) `SECURITY.md` claims a `refresh_tokens` table; none exists (Redis/memory only). **[Code]**

## 1.2 records (the core)

**Files:** `records.router.js`, `records.controller.js`, `records.service.js` (~2,200 lines), `records.mapper.js` (~1,200 lines), `records.normalize.js`.
**Controller:** `getRecords`, `getRecord`, `create`, `update`, `submit`, `updateStatus`, `getStatusOptions`, `approve`, `sendBack`, `overrideHead`, `getQueue`, `jcpApprove`, `scpApprove`, `seal`, `checkDuplicate`, `deleteRecord`, `searchRecords`.
**Service:** `comparePersons`, `syncArrestedToCaseAccused`, `autoLinkArrestToCase`, `fetchRecordFull`, `validateRequiredFields`, `listRecords`, `getRecordDetails`, `createRecord`, `createImportedRecord`, `updateRecord`, `submitRecord`, `transitionRecord`, `overrideCaseHead`, `updateDomainStatus`, `getStatusOptions`, `getRecordRevisions`, `setRecordFrozen`, `checkDuplicateRecord`, `searchRecordsWithSpec`, `deleteRecord`.

**What it does.** The full record lifecycle for the 5 types (CASE, ARREST, PCR_CALL, MISSING, UIDB). Writes run in a Knex transaction: normalize labels to codes, `splitPayload` into spine + detail + persons + properties + offences + locations, write a hash-chained `record_revisions` row under a `SELECT ... FOR UPDATE` lock, write `audit_logs`, and publish `record.created`/`record.updated`. Reads recompose the flat shape. `transitionRecord` is the single workflow write path (used by the controller and by `compilation.service`). Domain status changes (`updateDomainStatus`) are dated into `record_status_events` and are distinct from workflow transitions. **[Code]**

**Business rules embedded** (all **[Code]**): editability gated by status and role; district cannot flip `is_worked_out` directly; a case cannot be worked-out while pending; `fir_year` recomputed on every case edit; chargesheet-family statuses auto-set `sent_to_court_date`; singleton-role person fields always reconciled even without a `persons[]` array; ARREST edits auto-link to CASE.

**Issues / notes.** `records.mapper.js` and `records.normalize.js` are two transform files with adjacent responsibilities (routing vs label-resolution); keep both but document the boundary (Part 3). `searchRecords`/`searchRecordsWithSpec` overlap the `search` module conceptually. **[Code]**

## 1.3 workflow

**Files:** `workflow.router.js` (10 lines), `workflow.engine.js`.
**Engine:** `getRule`, `assertAllowed`, `assertComment`, `assertFieldsCorrected`, `resolveTarget`, `getQueueStatuses`.

**What it does.** The only reader of `workflow_transitions_config` (synced from `config/workflow/main.json`). Resolves `(from_status, action, record_type)` with wildcard precedence, enforces role/comment/field-correction, resolves target status/level including `@PRIOR` transfer restore and the `DIRECT_HQ` `level_data_contracts` short-circuit, and derives per-role queues from config. No hardcoded transitions. **[Code]**

**Issues / notes.** `workflow.router.js` is a near-empty stub; the actual transition endpoints live on `records.router.js` (`/approve`, `/send-back`, `jcp-approve`, `scp-approve`, `seal`) and `compilation`. The module boundary is blurred; see Part 5. ACP has no transitions in config, so its queue is empty by design. **[Code]**

## 1.4 record-links

**Files:** `record-links.router.js`, `record-links.controller.js`, `record-links.service.js`.
**Controller:** `getLinkTypes`, `getLinksForRecord`, `createLink`, `deleteLink`, `personSearch`.
**Service:** `getLinkTypes`, `getLinksForRecord`, `getLinkById`, `createLink`, `deleteLink`, `searchPersonAcrossArrests`.

**What it does.** Manual link CRUD over `record_links` typed by `link_type_registry`, plus person search across arrests. Automatic linking is done separately by the event handler `linkResolver.js` (ARREST/MISSING to CASE by ps_id + fir_no + year). **[Code]**

**Issues / notes.** `personSearch` here overlaps `report-builder.crossMatchMissingUidb` and `search` person search; three person-search entry points exist. **[Code]**

## 1.5 fields

**Files:** `fields.router.js`, `fields.controller.js`, `fields.service.js`, `classificationSources.config.js`, `statusOptions.config.js`.
**Controller:** `getFieldsForForm`, `listAllFields`, `createRegistryField`, `updateRegistryField`, `toggleRegistryField`, `listActs`, `listSectionsForAct`, `listMajorHeads`, `listMajorHeadsForSection`, `listMinorHeadsForMajorHead`, `listPropertyCategories`, `listPropertyItems`, `listBeats`, `listLocalHeads`, `listStateDistricts`, `listInvestigatingOfficersLookup`, `listRecordTypes`, `listPoliceStationsLookup`, `listAgenciesLookup`.
**Service:** the `ref.*` lookups (`getActs`, `getSectionsForActs`, `getMajorHeadsForActs`, `getMajorHeadsForSection`, `getMinorHeadsForMajorHeads`, `getAllMinorHeadsByMajorHead`, `getPropertyCategories`, `getPropertyItemsForCategory`, `getBeats`, `getLocalHeads`, `getActsSectionsRegistry`).

**What it does.** Serves the dynamic form schema (`getFieldsForForm` reads `field_registry`, attaches options and the `formLayout.js` section layout, marks UIDs readonly) and the cascading reference dropdowns (acts to sections to major to minor heads; property categories; beats; local heads). Admin CRUD on the registry (`createRegistryField` etc.). **[Code]**

**Issues / notes.** `fields.controller.js` is large (~1,600 lines) because it holds both form-schema assembly and every lookup endpoint; consider splitting lookups into a `reference` submodule (Part 4). The `service` here is only the `ref.*` lookups; the form-schema assembly lives in the controller, which inverts the usual layering. **[Code]**

## 1.6 compilation

**Files:** `compilation.routes.js`, `compilation.controller.js`, `compilation.service.js`.
**Controller/Service:** `getCompilations`, `getCompilation`, `createCompilation`, `submitCompilation`.

**What it does.** District bundles all `DISTRICT_REVIEW` records for a district+period into a DRAFT compilation (membership snapshotted into `compilation_records`), then submit advances each member `DISTRICT_REVIEW to COMPILED to JCP_REVIEW` through `transitionRecord`. **[Code]**

**Issues / notes.** File uses `.routes.js` (minority spelling); no period-lock endpoint despite the specs. **[Code]**

## 1.7 reports (dispatcher + legacy + schedules)

**Files:** `reports.router.js`, `reports.controller.js` (~1,460 lines), `scheduler.js`, `engine/` (metadata template runtime), `templates/*.html`.
**Controller:** `getTemplates`, `generateReport`, `generateReportInternal`, `getJobStatus`, `downloadReport`, `getReportsHistory`, `listSchedules`, `createSchedule`, `updateSchedule`, `deleteSchedule`, `runScheduleNow`, `getAdminStats`, `getFields`, `traceRecord`.
**Engine dir:** `templateRuntime.js`, `measureEngine.js`, `channelResolver.js`, `headResolver.js`, `periodResolver.js`, `scopeResolver.js`, `baselineService.js`, `validator.js`.

**What it does.** The report gateway. `generateReportInternal` dispatches by template code/type: statutory diaries (PHQ/DISTRICT/FN) to the Node.js `report-engine`; daily-diary (`dd-*`) and single-sheet to the Python worker (`execFileSync` + AMQP + `runPythonFallback`); metadata templates to `engine/templateRuntime.js`; and legacy single-record templates (arrest-summary, cases-register, pcr-call-log, daily-status) to inline ExcelJS/Puppeteer/CSV. Jobs tracked in `report_jobs` (PENDING to READY/FAILED); `downloadReport` streams the file. Scheduling via `scheduled_reports` + node-cron. `traceRecord` powers cell drill-down. **[Code]**

**Issues / notes (high priority).** (a) The legacy inline path reads `records.data`, a column that no longer exists, so those outputs are blank/wrong. (b) Three engines with string-match dispatch is the biggest structural risk. (c) References an absent `Master/` directory for daily-status. (d) Hardcoded fallback user UUID in `generateReport`. (e) `engine/scopeResolver.js` here duplicates `report-engine/shared/scope.js` in name and intent. **[Code]**

## 1.8 report-engine (Node.js statutory diaries)

**Files:** `report-engine.service.js` (dispatcher), `fn/` (43-sheet fortnightly: `fn-diary.service.js`, `fn-count-fetcher.js`, `fn-heads.js`, `renderers/stat-01..stat-41.js`), `district/` (18-sheet: `district-diary.service.js`, `detail-fetcher.js`, `renderers/*.js`, plus `generate_district_diary.py`/`.ps1`), `shared/` (`diary-query-builder.js`, `count-fetcher.js`, `detail-fetcher.js`, `calc.js`, `canonical-codes.js`, `date-windows.js`, `scope.js`, `reconciliation.js`, `print-setup.js`, `trace-record.js`).
**Service:** `generateReport` (family dispatch), `generateFnDiary` + `SHEET_DESCRIPTIONS`, `generateDistrictDiary`.

**What it does.** Builds the statutory Excel workbooks in Node.js with ExcelJS: a shared `diary-query-builder` produces the datasets, per-sheet renderers format them, `canonical-codes` maps crime heads, `count-fetcher`/`detail-fetcher` power counts and drill-down, `reconciliation` cross-checks totals. **[Code]**

**Issues / notes.** `phq-diary` (PHQ daily) is a separate top-level module although it is part of the same report family; `report-engine` and `phq-diary` should sit under one report tree (Part 4). A stray `generate_district_diary.py`/`.ps1` inside a Node module directory is a scope leak. **[Code]**

## 1.9 phq-diary (PHQ daily diary)

**Files:** `phq-diary.router.js`, `phq-diary.controller.js`, `phq-diary.service.js`, `phq-diary.calc.js`, `phq-diary.config.js`, `phq-diary.data.js`, `phq-diary.excel.js`.
**Controller:** `generateDiary`, `previewDiary`. **Service:** `generate`, `generateToFile`.

**What it does.** Generates the PHQ daily crime diary (data fetch, formula calc, ExcelJS output). Invoked both directly (its own routes) and via `report-engine.service.js` for the `PHQ_DIARY` family. **[Code]**

**Issues / notes.** Belongs under the unified report tree with `report-engine` (Part 4). **[Code]**

## 1.10 daily-diary (Python-backed daily diary)

**Files:** `daily-diary.router.js`, `daily-diary.controller.js`, `daily-diary.service.js`, `templates/`.
**Controller:** `getPreview`, `exportExcel`, `getDataAll`, `getDataByTable`. **Service:** `getDailyDiaryPreview`, `getDailyDiaryData`, `queueDailyDiaryExport`.

**What it does.** Preview and export of the daily diary; export path funnels to the Python worker. **[Code]**

**Issues / notes.** Overlaps the `reports` `dd-*` templates and `report-engine`; three modules touch "daily diary" (this, `reports`, and `python_worker`). **[Code]**

## 1.11 report-builder (ad-hoc)

**Files:** `reportBuilder.router.js`, `reportBuilder.controller.js`, `queryEngine.js`, `reportableFields.config.js`.
**Controller:** `getMetadata`, `runQuery`, `startExport`, `getExportStatus`, `listSavedReports`, `createSavedReport`, `updateSavedReport`, `deleteSavedReport`, `runSavedReport`, `getQuickAccessReports`, `getLookupValues`, `crossMatchMissingUidb`, `getBuilderAuditLog`.

**What it does.** User-defined cross-tab/report builder validated against `field_registry`, saved to `report_builder_saved`, audited to `report_builder_audit`. `queryEngine.js` builds safe parameterised SQL. **[Code]**

**Issues / notes.** camelCase file names (`reportBuilder.*`) break the dominant kebab convention. `crossMatchMissingUidb` overlaps `search` and `record-links`. **[Code]**

## 1.12 audit

**Files:** `audit.router.js`, `audit.controller.js`, `audit.service.js`, `audit.scheduler.js`.
**Controller:** `getRecordAudit`, `getUserAudit`, `getAuditLogs`, `verifyAuditChainEndpoint`, `freezeRecordEndpoint`, `unfreezeRecordEndpoint`, `getAdminAuditLogs`.
**Service:** `runChainVerification`.

**What it does.** Reads `audit_logs`; runs the `record_revisions` hash-chain verification (`utils/hash.js`), freezes broken records with a mass-freeze circuit breaker, publishes `audit.chain_break_detected`. `audit.scheduler.js` runs it on a cron. Manual freeze/unfreeze endpoints. **[Code]**

## 1.13 warehouse

**Files:** `warehouse.router.js`, `warehouse.controller.js`, `warehouse.db.js`, `warehouse.scheduler.js`, `pivot-engine.js`, `etl/` (`sync.js`, `dimensions.js`, `bridges.js`, `normalize.js`, `backfill.js`).
**Controller:** `resolveUserScope`, `getStatus`, `getReportableFields`, `runReport`, `exportReport`.

**What it does.** Scheduled ETL from operational tables into pre-aggregated warehouse tables, a pivot engine for multi-dimensional queries, and warehouse-backed reporting/export. `warehouse.db.js` is a separate DB access layer. **[Code]**

## 1.14 analytics

**Files:** `analytics.router.js`, `analytics.controller.js` (~1,400 lines), `dashboard.service.js`.
**Controller (21 endpoints):** `getSummary`, `getTrends`, `getCompare`, `getOverview`, `getByPs`, `getByCrimeHead`, `getCombinedTrends`, `exportSpreadsheet`, `getStatusBreakdown`, `getPsDashboardSummary`, `getPsDashboardStatsV2`, `getCaseTypeBreakdown`, `getTrendForRecordType`, `getCasesByMonthTrend`, `getByDistrict`, `getArrestsTrend`, `getArrestsTrendBreakdown`, `getCrimeHeadMatrix`, `getCaseStatusBreakdown`, `getCrimeHeadYearTrend`.
**Service:** `getPsDashboardSummary`, `getDistrictDashboardSummary`, `getHqDashboardSummary`.

**What it does.** Dashboard aggregates at PS/district/HQ level: overviews, crime-head matrix, trends, station and district comparisons, case-status breakdowns, arrest trends, spreadsheet export. **[Code]**

**Issues / notes.** The controller is very large and has near-duplicate endpoints (`getSummary` vs `getOverview` vs `getPsDashboardSummary` vs `getPsDashboardStatsV2`; `getTrends` vs `getCombinedTrends` vs `getCasesByMonthTrend`). The `V2` suffix and the duplicate trend endpoints suggest superseded versions still mounted. Candidate for consolidation. **[Code]**

## 1.15 import

**Files:** `import.router.js`, `import.controller.js`, `import.service.js`, `import.parse.js`, `import.validate.js`, `import.compose.js`, `import-fields.config.js`, `import-key-bridge.config.js`, `layout-manifests.js`, `registry-sync.util.js`, `template-builder.service.js`.
**Controller:** `downloadImportTemplate`, `validateImportBatch`, `confirmImportBatch`, `cancelImportBatch`, `listBatches`, `getBatchDetail`.
**Service:** `sanitizedWriteFailedRow`, `ensureAutoProvisionedIo`, `districtForPs`, `createBatch`, `claimBatch`, `cancelBatch`, `listBatches`, `getBatchDetail`, `processBatch`, `sweepStaleConfirmedBatches`.

**What it does.** Bulk legacy import pipeline: template build/download, parse (xlsx), validate against registry, compose into records via `createImportedRecord` (scope pre-validated, never taken from spreadsheet), batch tracking (`import_batches`, `import_batch_errors`), stale-batch sweep. Confirmation triggers `importConfirmHandler.js`. **[Code]**

**Issues / notes.** Well factored (parse/validate/compose split). Largest single module by file count. **[Code]**

## 1.16 hierarchy / users / io / level-contracts / filters / notifications / logs / admin / classification / search

- **hierarchy:** `getNodes`, `getTree`, `createNode`, `updateNode`, `deleteNode`, `getScope` over `hierarchy_nodes` (6-level tree). **[Code]**
- **users:** `getUsers`, `getUser`, `createUser`, `updateUser`, `deleteUser`, `resetPassword` (bcrypt, scope-checked). **[Code]**
- **io:** `listIOs`, `createIO`, `updateIO`, `deleteIO` over `investigating_officers`, scoped by PS/sub-division. **[Code]**
- **level-contracts:** `listContracts`, `mutationNotAllowed` (controller); service adds `maskRecordData`/`maskRecordDataBatch`/`maskRecordDetails` (DPDP masking) and contract caching. Mutations are intentionally blocked at the API (config-managed). **[Code]**
- **filters:** `listPresets`, `listDurationPresets`, `createPreset`, `deletePreset` over `filter_presets`. **[Code]**
- **notifications:** `getNotifications`, `getNotificationCount`, `markAsRead`, `markAllAsRead` + `sse.js` (Server-Sent Events stream); populated by `notifyHandler.js`. **[Code]**
- **logs:** `ingestClientLogs` (the auth-exempt client log sink mounted first in `app.js`). **[Code]**
- **admin:** router only (`admin.router.js`); an aggregator/namespace with no controller or service. **[Code]**
- **classification:** `crimeClassification.service.js` (`HEINOUS_CRIME_HEADS`, `isHeinousCrimeHead`, `classifyRecordOffences`, `getRecordClassification`); pure logic, no router (used by other modules). **[Code]**
- **search:** `search.controller.js` (exports the router, not named handlers), `nlParser.service.js` (`parseNaturalLanguageQuery`), `nlSearch.service.js` (`executeNaturalLanguageSearch`), `seizureTaxonomy.js`. Natural-language and universal search. **[Code]**

**Issues / notes.** `search.controller.js` is actually a router (naming lie). `admin` and `classification` break the router/controller/service triad (one has only a router, the other only a service); acceptable but document them as intentional exceptions. **[Code]**

## 1.17 Cross-cutting: middleware, events, utils, config, schedulers

- **middleware/**: `auth.middleware.js` (JWT verify + Keycloak fallback + `roleRateLimitMiddleware` chaining), `rbac.middleware.js` (`allow`, `requireRole`, `enforceScope`, `verifyRecordAccess`), `security.middleware.js` (`ipAllowlistMiddleware`, `csrfDoubleSubmitMiddleware`, `roleRateLimitMiddleware`), `error.middleware.js`, `rateLimiter.middleware.js`, `requestLogger.middleware.js`. **[Code]**
- **events/**: `eventBus.js` (RabbitMQ topic `pharos` + in-memory fallback), handlers `linkResolver.js`, `notifyHandler.js` (record.submitted/approved/sent_back, compilation.submitted), `linkAuditHandler.js`, `importConfirmHandler.js`, `reportJobHandler.js`. **[Code]**
- **utils/**: `generateToken.js` (`ROLE_LEVELS`, token build/sign/verify), `hash.js` (genesis constant, v1/v2 hashers, `verifyAuditChain`), `logger.js` (winston), `dateFormat.js`, `ApiError.js`, `ApiResponse.js`, `asyncHandler.js`, `requestContext.js` (AsyncLocalStorage), `redact.js`, `helpers.js`. **[Code]**
- **config/**: `env.js`, `db.js` (Knex + retry + DATE type parser), `email.js` (stub), `formLayout.js` (section layout metadata), `geoData.js`, `swagger.js`. **[Code]**
- **schedulers:** `warehouse.scheduler.js`, `audit.scheduler.js`, `reports/scheduler.js` (node-cron). **[Code]**
- **bootstrap/**: `autoload.js` (`runStartupAutoload`: sync-config always, load-ref when sources changed). **[Code]**

## 1.18 Dead / legacy backend code (confirmed)

- `backend/src/controllers/record.controller.js`, `backend/src/routes/record.routes.js`, `backend/src/models/Record.model.js`: an older MVC layout. `Record.model.js` is a **Mongoose** schema (`recordType` enum uses the legacy token `PCR`, a `data: Mixed` blob, `policeStation` string). These three reference only each other and are imported nowhere in the live app. This is the origin of the unused `mongoose` dependency and the dead JSONB `data` model the specs describe. **[Code]**
- `backend/` root scratch scripts: `scratch_*.js` (8), `update_complainant.js`, `update_victim.js`, `create-heinous-table.js`, `query_fields.js`, `read-xlsx.js`, `run_demo_migration.js`, `generate-postman.js`, and dumps `arrest_dump.md`, `case_dump.md`, `comparison_report.md`, `alignment_results_utf8.txt`. One-off tooling polluting the backend root. **[Code]**

# PART 1B. Frontend Functional Audit

**Entry:** `main.jsx` to `App.jsx` to `routes/AppRouter.jsx` (lazy routes, `ProtectedRoute`, `RoleRedirect`, `DashboardLayout`/`PublicLayout`, `ErrorBoundary`). **[Code]**

**State & data:** `store/authStore.js` (Zustand auth), `contexts/AuthContext.jsx`, TanStack React Query via hooks: `useAuth`, `useCreateRecord`, `useUpdateRecord`, `useFormSchema`, `useNotifications`, `useFilterPresets`, `useAutosave`, `useDebounce`. **[Code]**

**API layer:** `utils/api.js` (the axios instance with JWT/CSRF/correlation interceptors and auto-refresh; ~2,700 lines and historically the home of the mock interceptor), re-exported by `api/axios.js`; `api/auth.api.js`. **[Code]**

**Forms (schema-driven):** `components/forms/DynamicForm.jsx`, `FieldRenderer.jsx`, `FormSection.jsx`, `FormToolbar.jsx`, `FormAutosave.jsx`, and typed field components (`TextField`, `NumberField`, `DateField`, `TimeField`, `DateTimePickerPopup`, `SelectField`, `SearchableSelect`, `RadioField`, `CheckboxField`, `TextAreaField`, `ActsSectionsTable`). Driven by `useFormSchema(recordType)`. **[Code]**

**Pages by role:**

| Area | Pages | Purpose |
| :--- | :--- | :--- |
| hc | `Dashboard`, `MyRecords`, `NewRecord` | PS data entry, drafts/returned queue, create form |
| sho | `Queue`, `RecordDetail`, `IOManagement` | approval queue, record scrutiny, IO curation |
| district | `Dashboard`, `CompilationUI`, `CustomFieldsPage` | district scrutiny, compilation, district custom fields |
| hq | `Dashboard`, `DistrictAnalyticsDashboard` | HQ overview and district analytics |
| analytics | `AnalyticsDashboard` | cross-cut dashboards |
| reports | `ReportsPage`, `ReportBuilder`, `MultiSheetReportBuilder`, `CustomExcelBuilder`, `RecordTracePanel`, `NaturalLanguageSearchPanel` | report generation, ad-hoc builder, cell drill-down, NL search |
| admin | `Users`, `HierarchyManager`, `HierarchyPage`, `FieldManager`, `AuditPage`, `LevelContractsPage`, `LegacyDataPage` | admin surfaces |
| shared | `StationPerformanceDashboard`, `StationDetailView`, `PersonSearchPage`, `NotFound` | reusable station views, person search |

**Shared components:** `common/` (charts and tables: `CaseStatusBarChart`, `CrimeHeadCategoryBarChart`, `CrimeHeadMatrixTable`, `StationPerformanceTable`, `StationSummaryCards`, `UnifiedFilterStrip`, `StationFilters`, `FilterPresetsPanel`, `LinkedRecordsPanel`, `RecordTypeBadge`, `DebugBar`), `layout/` (`DashboardLayout`, `PublicLayout`, `Navbar`, `PoliceNavbar`, `PoliceSidebar`, `Footer`), `ui/` (`Button`, `Card`, `Input`, `Modal`, `ReportModal`, `Spinner`, `StatCard`, `LanguageToggle`, `DateInput`), `records/StatusUpdateModal`. **[Code]**

**Utils:** `constants.js` (routes), `crimeHeadGroups.js`, `hierarchyData.js`, `hierarchyTheme.js`, `policeData.js`, `statusConfig.js`, `fieldPatterns.js`, `fieldValidation.js`, `validators.js`, `formatters.js`, `dateFormat.js`, `recordRef.js`, `notificationText.js`, `logger.js`. **[Code]**

**Dead / at-risk frontend:** `vaibhav_reference/{ArrestsPage,CasesPage,MissingPage,PCRPage}.jsx` (not routed), `features/auth/RegisterPage.jsx` (no backend endpoint), `HierarchyManager.jsx` vs `HierarchyPage.jsx` (two hierarchy admin pages; confirm which is live). The 2,700-line `utils/api.js` is a refactor target. **[Code]**

# PART 1C. Python worker

**Files:** `main.py` (RabbitMQ consumer for `report.requested`), `generator.py` (job loader + dispatch), `db.py` (SQLAlchemy engine), `builder.py`, `classifiers.py`, `formatters.py`, `registry.py`, `events.py`, `requirements.txt`, `templates/*.json`, and `sheets/sheet_01..sheet_29_*.py` (27 sheet generators: manual FIR, e-burglary, e-house/other theft, MVT, arrested rosters, kalandara, proclaimed offenders, 24-hr list, PI disposals, missing/UIDB/abandoned/traced, women/children missing, inquest, FIR goswara, arrest counts).

**What it does.** Consumes report jobs and builds daily-diary and single-sheet Excel workbooks with pandas/openpyxl against the same PostgreSQL database. Invoked from `reports.controller.js` via `execFileSync`, AMQP publish, or `runPythonFallback`. **[Code]**

**Issue.** Scope overlaps the Node.js `report-engine` and the `daily-diary` module; the sheet numbering (up to 29, with gaps) matches the specs' Python narrative but is only one of the report families in practice. **[Code]**

---

# PART 2. End-to-End Flow Catalog

Each flow is traced UI to DB. Confidence is **[Code]** unless noted.

### F1. Authentication
UI login form to `POST /auth/login` to `auth.controller.login` to `loginUser` (bcrypt verify, `resolveScope`, sign access+refresh, store refresh in Redis/memory, update `last_login`) to tokens returned. Axios stores access token in `localStorage`, CSRF from cookie; `authMiddleware` verifies on every protected call; 401 triggers `POST /auth/refresh`.

### F2. Dynamic form load
`NewRecord.jsx` to `useFormSchema(type)` to `GET /fields/form/:record_type` to `fields.controller.getFieldsForForm` to `field_registry` + `formLayout.js` + option sources to schema JSON to `DynamicForm`/`FieldRenderer` render (conditional `show_when`, readonly UIDs, repeaters).

### F3. Record create
`DynamicForm` submit to `useCreateRecord` to `POST /records` (HC only) to `records.controller.create` to `createRecord` transaction: `records.normalize` (labels to codes) to `mapper.splitPayload` (route to spine/detail/persons/properties/offences/locations) to `insertRecordCore` to `writeRevision` (hash chain) + `audit_logs` to publish `record.created` to `linkResolver` resolves ARREST/MISSING links.

### F4. Submit
`POST /records/:id/submit` (HC) to `submitRecord` to `validateRequiredFields` (full recompose + requiredness) to `transitionRecord('submit')` to FSM `DRAFT to PENDING_SHO` to publish `record.submitted` to `notifyHandler` notifies station SHOs.

### F5. Station review, send-back, resubmit
SHO `Queue.jsx` (`GET /records/queue`, statuses from `getQueueStatuses`). Approve: `POST /records/:id/approve` to `PENDING_SHO to DISTRICT_REVIEW`, publish `record.approved` (notify creator). Send-back: `POST /records/:id/send-back` with `target_fields` to `PENDING_SHO to SENT_BACK` (comment required). Resubmit: `sent_back.submit` runs `assertFieldsCorrected` against `record_revisions` since the send-back; blocks until every flagged field changed.

### F6. District review, override, compile
District edits in `DISTRICT_REVIEW` (restricted; `is_worked_out` flip blocked). Override crime head: `PATCH /records/:id/override` to `overrideCaseHead` (updates the `is_primary` `record_offences` row and/or `local_head_id`, writes a revision with justification). Compile: `POST /compilations` gathers `DISTRICT_REVIEW` records; `POST /compilations/:id/submit` advances members `DISTRICT_REVIEW to COMPILED to JCP_REVIEW`.

### F7. JCP / SCP / HQ chain
`POST /records/:id/jcp-approve` (`JCP_REVIEW to SCP_REVIEW`), `scp-approve` (`SCP_REVIEW to HQ_RECEIVED`), `seal` (`HQ_RECEIVED to ARCHIVED`, HQ_ADMIN). Send-backs step one level down. All through `transitionRecord` (hash-chained).

### F8. Transfer sub-flow
`transfer_initiate` (SHO/District, any status to `IN_TRANSFER`, comment required, `record_transfers` ledger) to `transfer_accept`/`transfer_reject` (`@PRIOR` restores the pre-transfer status+level).

### F9. Legacy amendment sub-flow
`amendment_request` (`LEGACY_IMPORTED to AMENDMENT_PENDING`) to `amendment_approve`/`amendment_reject` (back to `LEGACY_IMPORTED`), recorded in `record_amendments`.

### F10. Freeze / audit integrity
Any mutation writes `record_revisions` (prev_hash to row_hash, versioned). `audit.scheduler` runs `runChainVerification` to `verifyAuditChain` over `record_revisions`; on a break, freeze affected records (`is_frozen=true`) unless the circuit breaker trips, publish `audit.chain_break_detected`. Manual freeze/unfreeze via audit endpoints. Frozen records reject mutation (`assertNotFrozen`).

### F11. Bulk import
`LegacyDataPage` to download template (`downloadImportTemplate`) to upload to `validateImportBatch` (parse + validate, `import_batches`/`import_batch_errors`) to `confirmImportBatch` to `processBatch` to `createImportedRecord` per row (scope pre-validated) to publish `record.created` to links resolve; `importConfirmHandler` finalises; `sweepStaleConfirmedBatches` cleans up.

### F12. Report generation (three engines)
`POST /reports/generate` to `report_jobs` PENDING to dispatch:
- Statutory (PHQ/DISTRICT/FN): `report-engine.service.generateReport` to family service to `diary-query-builder` + renderers to ExcelJS buffer to file to READY.
- Daily-diary / single-sheet: Python worker via `execFileSync` + AMQP `report.requested` (consumed by `python_worker/main.py`) to file to READY.
- Metadata templates: `engine/templateRuntime.generateMetadataReport`.
- Legacy single-record: inline ExcelJS/Puppeteer/CSV (reads dead `records.data`; broken).
Poll `GET /reports/status/:id`; download `GET /reports/download/:id`.

### F13. Cell drill-down
`RecordTracePanel.jsx` to `GET /reports/trace/:recordId` (or report-engine `trace-record.js`) to underlying line-item records behind a statistic cell.

### F14. Warehouse ETL + warehouse reporting
`warehouse.scheduler` to `etl/sync.js` (dimensions, bridges, normalize, backfill) to warehouse tables; `warehouse.controller.runReport`/`exportReport` to `pivot-engine.js` for multi-dimensional output.

### F15. Analytics dashboards
Role dashboards to `GET /analytics/*` to `analytics.controller` + `dashboard.service` (scoped by `req.jurisdictionQuery`) to aggregates and charts.

### F16. Search
`NaturalLanguageSearchPanel`/`PersonSearchPage` to `POST /search` or `/search/interpret` to `nlParser` + `nlSearch`; person search and missing/UIDB cross-match.

### F17. Notifications
Events to `notifyHandler` to `notifications` rows; UI subscribes to `GET /notifications/stream` (SSE) and `GET /notifications`; mark read endpoints.

### F18. Hierarchy / users / IO / field admin
Admin pages to `hierarchy`/`users`/`io`/`fields` CRUD endpoints; district custom fields via `field_registry` scope_level/scope_id.

---

# PART 3. Data and Mapping Model ("mapping proper")

This part documents every mapping in the system so nothing is orphaned during restructuring.

### 3.1 The write mapping chain (flat form to normalised rows)

```
flat form payload (labels, UI values)
  -> records.normalize.js        (label -> ref.* FK code, booleans, dates, phones; idempotent)
  -> records.mapper.splitPayload (routes each field via field_registry.storage)
       -> records                (spine: type, scope, status, level, dates, provenance)
       -> <detail table>         (typed columns per record_type; overflow -> extra jsonb)
       -> persons (+ subtype tables) (per role; repeater vs singleton)
       -> record_properties       (repeater)
       -> record_offences         (acts/sections/heads; is_primary)
       -> locations               (present/perm/occurrence/found slots)
```
Read is the exact inverse: `mapper.recomposeRecord` rebuilds `{data, persons, properties, offences}` from the typed rows. The routing key is `field_registry.storage`: either `"ui_only"` (not persisted) or `{table, column}`. **[Code]**

### 3.2 Record type to detail table (`mapper.DETAIL_TABLES`) **[Code]**

| record_type | detail table | person subtype table(s) |
| :--- | :--- | :--- |
| CASE | `fir_details` | persons only |
| ARREST | `arrest_details` | `arrestee_details` |
| MISSING | `missing_details` | `missing_person_details`, `person_descriptions` |
| UIDB | `uidb_details` | `person_descriptions` |
| PCR_CALL | `pcr_call_details` | persons only |

Kalandra is an ARREST with `is_dd_based=true` (no separate type/table). "LEFT_OUT" has no table. **[Code]**

### 3.3 Person roles (`mapper.PERSON_ROLES` / `REPEATER_ROLES`) **[Code]**

All roles: COMPLAINANT, ACCUSED, VICTIM, WITNESS, ARRESTEE, MISSING, DECEASED, INFORMANT, CALLER, IO, MISSING_CHILD. Repeater roles (from `persons[]`): ARRESTEE, VICTIM, ACCUSED, WITNESS, MISSING_CHILD. Singleton roles (from flat `data`): COMPLAINANT, MISSING, DECEASED, INFORMANT, CALLER. Legacy token map: `ARRESTED` (person_type) to `ARRESTEE` (role).

### 3.4 Location slots **[Code]**

`DETAIL_LOCATION_SLOTS` (occurrence/found/incident, per record_type detail column) and `PERSON_LOCATION_SLOTS` (present/permanent, with `perm_same_as_present` collapsing the permanent block) both resolve to rows in `locations`.

### 3.5 Config to runtime mapping **[Code]**

| Config file | Loaded by | Runtime target | Consumed by |
| :--- | :--- | :--- | :--- |
| `config/fields/{case,arrest,common,missing,uidb,pcr_call}.json` | `npm run sync-config` (startup autoload) | `field_registry` table | `fields.controller.getFieldsForForm`, `mapper` |
| `config/workflow/main.json` | sync-config | `workflow_transitions_config` | `workflow.engine` |
| `config/org/{hierarchy,ps_codes}.json`, `config/ref-data/*` | `npm run load-ref` | `hierarchy_nodes`, `ref.*` | everything |
| `config/proformas/*.json` | report engines | report layout | report-engine, python_worker |
| `config/contracts/ops_chain.json`, `config/ref-overlays/*` | level-contracts / heads | `level_data_contracts`, head overlays | workflow routing, classification |

### 3.6 API to service to table map (representative) **[Code]**

| Endpoint | Controller.fn | Service.fn | Primary tables |
| :--- | :--- | :--- | :--- |
| POST `/records` | records.create | createRecord | records, *_details, persons, record_offences, record_revisions, audit_logs |
| POST `/records/:id/submit` | records.submit | submitRecord to transitionRecord | records, workflow_transitions, record_revisions |
| POST `/records/:id/approve` | records.approve | transitionRecord | records, workflow_transitions |
| POST `/compilations` | compilation.createCompilation | createCompilation | compilations, compilation_records |
| POST `/reports/generate` | reports.generateReport | generateReportInternal | report_jobs (+ engine reads) |
| GET `/fields/form/:t` | fields.getFieldsForForm | (registry read) | field_registry |
| POST `/auth/login` | auth.login | loginUser | users, hierarchy_nodes |
| GET `/analytics/overview` | analytics.getOverview | dashboard.service | records, record_offences (scoped) |
| POST `/import/validate` | import.validateImportBatch | createBatch/processBatch | import_batches, import_batch_errors |
| GET `/audit/chain-verify` | audit.verifyAuditChainEndpoint | runChainVerification | record_revisions, records |

### 3.7 Event map (publishers to events to handlers) **[Code]**

| Event | Published by | Handled by | Effect |
| :--- | :--- | :--- | :--- |
| `record.created` | createRecord, createImportedRecord | linkResolver | resolve ARREST/MISSING to CASE links |
| `record.updated` | updateRecord | linkResolver | re-resolve links |
| `record.submitted` | transitionRecord (submit) | notifyHandler | notify station SHOs |
| `record.approved` | transitionRecord (approve) | notifyHandler | notify creator |
| `record.sent_back` | transitionRecord (send_back) | notifyHandler | notify creator |
| `record.status_changed` | transitionRecord (other) | (catalog) | generic status event |
| `compilation.submitted` | submitCompilation | notifyHandler | notify |
| `report.requested` | reports.generateReport | python_worker/main.py | generate Excel |
| `report.generated` | generateReportInternal | reportJobHandler | finalise job |
| `audit.chain_break_detected` | audit.service | (subscribers) | alert on tamper |
| import events | import flow | importConfirmHandler, linkAuditHandler | finalise batch, link audit |

### 3.8 Report family to engine to output map **[Code]**

| Family / template | Engine | Library | Output |
| :--- | :--- | :--- | :--- |
| FN_DIARY (43 sheets) | Node report-engine `fn/` | ExcelJS | .xlsx |
| DISTRICT_DIARY (18 sheets) | Node report-engine `district/` | ExcelJS | .xlsx |
| PHQ_DIARY (daily) | `phq-diary` (via report-engine dispatch) | ExcelJS | .xlsx |
| daily-diary, `dd-*` | python_worker `generator.py` + `sheet_*.py` | pandas/openpyxl | .xlsx |
| metadata templates | reports `engine/templateRuntime` | ExcelJS | .xlsx |
| arrest-summary, cases-register, pcr-call-log | reports inline | ExcelJS/CSV | .xlsx/.csv (BROKEN: reads dead `records.data`) |
| any (PDF) | reports inline | Puppeteer | .pdf |

# PART 4. File and Folder Restructuring Plan

## 4.1 Structural problems found

1. **A dead legacy MVC layout coexists with the module layout.** `backend/src/controllers/`, `backend/src/routes/`, `backend/src/models/` (one file each, Mongoose-based) are imported nowhere. They mislead every new reader into thinking there is a second architecture. **[Code]**
2. **Backend root is polluted with one-off scripts and dumps** (`scratch_*.js`, `update_*.js`, `read-xlsx.js`, `query_fields.js`, `*_dump.md`, `alignment_results_utf8.txt`, `comparison_report.md`). These sit beside `index.js` and `knexfile.js`. **[Code]**
3. **Five overlapping report modules** (`reports`, `report-engine`, `report-builder`, `phq-diary`, `daily-diary`) with no umbrella. The relationships are real but the layout hides them. **[Code]**
4. **A Python file lives inside a Node module** (`report-engine/district/generate_district_diary.py`/`.ps1`). Language boundary leak. **[Code]**
5. **`fields` mixes two concerns** (form-schema assembly + all reference lookups) in a 1,600-line controller. **[Code]**
6. **Monolithic frontend `utils/api.js` (~2,700 lines)** holds the axios client plus historically a mock layer plus many call wrappers. **[Code]**
7. **Repo-root clutter:** `backups_archive/`, `exv3/`, `temp template/`, `scratch/`, `context-bundle/`, `Claude outputs/`, `temp-future-plan`, plus generator scripts (`generate_*.cjs`) and multiple `.drawio` duplicates at root. **[Code]**
8. **Two hierarchy admin pages** (`HierarchyManager.jsx`, `HierarchyPage.jsx`) and dead `vaibhav_reference/` pages on the frontend. **[Code]**

## 4.2 Target backend structure (proposed)

```
backend/
  src/
    modules/
      auth/            (unchanged triad)
      records/         records.{router,controller,service,mapper,normalize}.js
      workflow/        workflow.{router,controller,service}.js   # see 5.3
      record-links/    (unchanged)
      fields/          fields.{router,controller,service}.js      # form-schema only
      reference/       reference.{router,controller,service}.js    # NEW: all ref.* lookups moved out of fields
      compilation/     compilation.{router,controller,service}.js
      reporting/                                    # NEW umbrella for all report code
        gateway/       reports.{router,controller}.js, job.service.js, scheduler.js, templates/
        statutory/     report-engine (fn/, district/, phq/, shared/)   # phq-diary folded in as phq/
        builder/       report-builder (renamed files, see 5.2)
        daily-diary/   daily-diary triad
      audit/           (unchanged)
      warehouse/       (unchanged)
      analytics/       analytics.{router,controller,service}.js   # dedupe endpoints (see 7)
      import/          (unchanged)
      hierarchy/ users/ io/ level-contracts/ filters/ notifications/ logs/ search/ classification/  (unchanged)
    middleware/ events/ utils/ config/ bootstrap/   (unchanged)
  migrations/ seeds/
  scripts/
    dev/            one-off + maintenance scripts moved here (scratch_*, update_*, read-xlsx, query_fields, run_demo_migration, create-heinous-table, generate-postman)
    reports/        generate_district_diary.py + .ps1 moved out of src/modules
  docs-artifacts/   *_dump.md, comparison_report.md, alignment_results_utf8.txt (or delete)
  test/ tests/      consolidate into one (see 5.4)
python_worker/      (unchanged; it is the daily-diary Excel engine)
```

## 4.3 Exact move / delete map

Legend: **DELETE** (dead, remove after grep confirms no refs), **MOVE** (relocate + update imports), **KEEP** (no change), **MERGE** (fold into another).

| Current path | Action | Destination / note |
| :--- | :--- | :--- |
| `backend/src/controllers/record.controller.js` | DELETE | dead legacy MVC (Mongoose) |
| `backend/src/routes/record.routes.js` | DELETE | dead legacy MVC |
| `backend/src/models/Record.model.js` | DELETE | dead Mongoose model; then remove `mongoose` dep |
| `backend/src/controllers/`, `src/routes/`, `src/models/` (dirs) | DELETE | empty after the above |
| `backend/scratch_*.js` (8) | MOVE | `backend/scripts/dev/` |
| `backend/update_complainant.js`, `update_victim.js` | MOVE | `backend/scripts/dev/` |
| `backend/read-xlsx.js`, `query_fields.js`, `run_demo_migration.js`, `create-heinous-table.js`, `generate-postman.js` | MOVE | `backend/scripts/dev/` |
| `backend/arrest_dump.md`, `case_dump.md`, `comparison_report.md`, `alignment_results_utf8.txt` | MOVE or DELETE | `backend/docs-artifacts/` or remove |
| `backend/src/modules/report-engine/district/generate_district_diary.py` / `.ps1` | MOVE | `backend/scripts/reports/` |
| `backend/src/modules/phq-diary/*` | MOVE/MERGE | `modules/reporting/statutory/phq/` |
| `backend/src/modules/report-engine/*` | MOVE | `modules/reporting/statutory/` |
| `backend/src/modules/report-builder/*` | MOVE | `modules/reporting/builder/` |
| `backend/src/modules/daily-diary/*` | MOVE | `modules/reporting/daily-diary/` |
| `backend/src/modules/reports/*` | MOVE | `modules/reporting/gateway/` |
| `fields` reference lookups (getActs..listAgenciesLookup) | MOVE | new `modules/reference/` |
| `frontend/src/vaibhav_reference/*` | DELETE | not routed |
| `frontend/src/features/auth/RegisterPage.jsx` | DELETE or gate | no backend endpoint |
| `frontend/src/pages/admin/HierarchyManager.jsx` OR `HierarchyPage.jsx` | MERGE | keep one, confirm live one first |
| repo `backups_archive/`, `exv3/`, `temp template/`, `scratch/`, `Claude outputs/`, `temp-future-plan`, `context-bundle/` | DELETE/ARCHIVE | move to git history, not the working tree |
| repo root `generate_architecture_drawio.cjs`, `generate_drawio.cjs`, duplicate `*.drawio` | MOVE | `docs/diagrams/` |
| `eng.traineddata` (root, 5 MB) | MOVE or DELETE | `python_worker/ocr/` if OCR is used, else remove with `tesseract.js` |

> The umbrella `reporting/` move (rows 9 to 14) is the largest single change. It is optional for deployability and should be done only after the two-engine ownership decision (Part 7, item R2). If you defer it, keep the five modules where they are; the naming and dead-code fixes below stand alone.

---

# PART 5. Naming Correction Plan

## 5.1 Conventions to adopt (write them into a CONTRIBUTING note)

- **Folders:** kebab-case (`record-links`, `level-contracts`). Already dominant.
- **Module files:** `<kebab-module>.<role>.js` where role is `router | controller | service` plus module-specific roles (`mapper`, `engine`, `scheduler`, `config`, `calc`, `data`, `excel`). Already dominant.
- **Router files:** always `.router.js` (not `.routes.js`).
- **Utility files:** camelCase (`generateToken.js`, `eventBus.js`). Rename the PascalCase exceptions or accept them as class-file convention, but be consistent.
- **Record-type token:** always `PCR_CALL` (never `PCR`), `CASE` (never `CASES`). Matches the `records.record_type` CHECK and `field_registry`.

## 5.2 Exact renames

| Current | Rename to | Reason |
| :--- | :--- | :--- |
| `compilation/compilation.routes.js` | `compilation/compilation.router.js` | router-file convention |
| `notifications/notifications.routes.js` | `notifications/notifications.router.js` | router-file convention |
| `report-builder/reportBuilder.router.js` | `reporting/builder/report-builder.router.js` | kebab file convention |
| `report-builder/reportBuilder.controller.js` | `.../report-builder.controller.js` | kebab file convention |
| `report-builder/reportableFields.config.js` | `.../reportable-fields.config.js` | kebab file convention |
| `report-builder/queryEngine.js` | `.../query-engine.js` | kebab file convention |
| `level-contracts/levelContracts.router.js` | `level-contracts/level-contracts.router.js` | kebab file convention |
| `level-contracts/levelContracts.controller.js` | `.../level-contracts.controller.js` | kebab file convention |
| `level-contracts/levelContracts.service.js` | `.../level-contracts.service.js` | kebab file convention |
| `search/search.controller.js` (actually a router) | `search/search.router.js` + real `search.controller.js` | file name lies about contents |
| `fields/classificationSources.config.js` | `fields/classification-sources.config.js` | kebab file convention |
| `fields/statusOptions.config.js` | `fields/status-options.config.js` | kebab file convention |
| `analytics` `getPsDashboardStatsV2` and duplicate trend endpoints | drop `V2`, pick one canonical name | version suffix indicates leftover duplicate |
| `Record.model.js` (`enum: ['CASE','ARREST','PCR',...]`) | delete (dead); if any live code uses `PCR`, standardise to `PCR_CALL` | legacy token mismatch |

## 5.3 Workflow module boundary (naming + placement)

Today `workflow.router.js` is a stub and the transition endpoints live on `records.router.js`. Two clean options: (a) accept that workflow is an internal engine (rename to `workflow/workflow.engine.js` only, remove the stub router, and document that transitions are exposed via `records`); or (b) add a real `workflow.controller.js` + `workflow.router.js` and move `/approve`, `/send-back`, `/jcp-approve`, `/scp-approve`, `/seal` there. Prefer (a): it matches how the code actually works and avoids a churn of the records routes.

## 5.4 Test directory duplication

`backend/test/` and `backend/tests/` both exist. Consolidate into one (`backend/test/`), update `package.json` test script paths, and keep the existing suites (health, 404, phq-reporting, court-status-gating, arrest-case-linkage, crime-head-mapping, plus cross-module/report-engine/search/warehouse).

## 5.5 Config value naming (fix the drift)

- `REPORTS_DIR` vs `REPORTS_OUTPUT_DIR`: pick one (`REPORTS_DIR`, since the controller uses it) and update `env.js`, `.env.example`, and any reader.
- Frontend API base: `VITE_API_URL` must be set, and the Vite proxy target + axios default must point at the backend port (5000), not 3000. This is the deployment blocker D1 from the blueprint and is also a naming/config-consistency fix.
- Docker maps host `5435` to container `5432`, but `env.js` defaults `DATABASE_URL` to `5432`. Align the default or document the 5435 mapping.

---

# PART 6. Context and Memory Preserving Execution Plan

The instruction "keep all the context and memory in place" is honoured by these rules. The goal is zero behaviour change from restructuring: only locations and names move, never logic.

## 6.1 Preserve institutional knowledge

- **Do not delete `DECISIONS.md`, `docs/DB_SCHEMA.md`, `docs/ENGINEERING_BASELINE.md`, `docs/LIVE_SYSTEM_BLOCKERS.md`, `docs/PROJECT_AUDIT.md`, or `config/workflow/main.json`.** These are the project's memory. Instead, correct the stale sections (DECISIONS.md #3 JSONB model, #6 Python-as-primary-engine, the non-existent `.cjs` migration reference) with a dated "superseded" note that points to the normalised reality. Never silently rewrite history.
- Keep the two reverse-engineering documents (`PHAROS_REVERSE_ENGINEERING_BLUEPRINT.md`, this file) in the repo `docs/` as the current canon.
- Archive `context-bundle/` and `backups_archive/` into git history (a tag or an `archive/` branch), do not just delete, so the agent context is recoverable.

## 6.2 Safe execution order (per change, on a branch)

1. **Branch + baseline.** New git branch. Confirm the app boots and the seed demo flow passes (login HC001, create, submit, approve, compile, report) before touching anything. If it does not boot, fix the blueprint's deployment blockers first (this is why restructuring comes after stand-up).
2. **Dead code first (lowest risk).** Grep-confirm zero references, then delete the legacy MVC trio, `vaibhav_reference`, and unused deps. Run the test suite.
3. **Moves that do not rename symbols.** Relocate backend-root scripts to `scripts/`, the Python file out of the Node module, and repo-root clutter to `docs/`/history. These change no import paths inside `src`.
4. **File renames (update imports atomically).** For each rename in 5.2, rename the file and update every importer in the same commit. Use a global search for the old basename to find importers; ES module paths are explicit, so the compiler/linter surfaces misses immediately.
5. **The `reporting/` umbrella move (largest).** Do this only after the engine-ownership decision. Move one report module at a time, update `app.js` router imports, run the report tests after each.
6. **Verify after every step:** `npm run lint`, the backend test suites, and a manual smoke of the affected flow. Never batch multiple structural changes into one unverified commit.

## 6.3 What NOT to touch (protect these invariants)

- The single write path in `records.service` and the `record_revisions` hash chain (any refactor must keep every mutation flowing through `transitionRecord`/`writeRevision`).
- `config/workflow/main.json` transition semantics and `field_registry.storage` mappings (these are data contracts; renaming code must not change them).
- The event names in Part 3.7 (renaming handlers is fine; renaming events breaks the bus contract).
- `records.record_type` tokens and the detail-table map in Part 3.2.

## 6.4 Import-rewrite helper

Because the codebase is pure ES modules with explicit relative imports, every move is mechanically safe: rename, then update importers found by searching the old path/basename. There is no dynamic `require` magic to hide references (the one `import()` dynamic calls are in `reports.controller` and are explicit string paths that must be updated by hand during the `reporting/` move). Add these to a checklist per move.

---

# PART 7. Prioritised Backlog

Ordered by value and risk. Ties back to the blueprint's blockers (Dn) and this audit's findings (Rn).

**P0 (make it run) - do before any restructuring**
- D1: fix the frontend/backend port mismatch (VITE_API_URL + Vite proxy + axios default to backend port).
- D2/D9/D10: set production env (`JWT_SECRET`, `JWT_REFRESH_SECRET`, `FRONTEND_URL`, `NODE_ENV=production`), which also disables the dev login backdoor.
- D3/D4: provision PostgreSQL, run migrations + seeds, confirm startup autoload populates `field_registry` and `ref.*`.

**P1 (correctness)**
- R1: repair or remove the legacy report path that reads the dead `records.data` (H1 in the blueprint). Either recompose from normalised tables or delete arrest-summary/cases-register/pcr-call-log.
- R2: decide report-engine ownership (Node statutory vs Python daily-diary) and retire the overlap; only then do the `reporting/` umbrella move.
- R3: fix `REPORTS_DIR` naming drift and the hardcoded fallback user UUID.

**P2 (structure and naming, behaviour-neutral)**
- R4: delete the dead legacy MVC trio and `mongoose` dep; delete `vaibhav_reference`.
- R5: apply the router-file and kebab-case renames (5.2), consolidate `test/`+`tests/` (5.4).
- R6: move backend-root scripts to `scripts/`, Python out of the Node module, repo clutter to history (4.3).
- R7: correct the stale `DECISIONS.md`/spec sections (6.1).

**P3 (debt and hardening)**
- R8: split `fields` lookups into `reference/`; split the monolithic frontend `utils/api.js`.
- R9: dedupe the `analytics` near-duplicate endpoints (drop `V2`/superseded trends).
- R10: consolidate the three person-search entry points and the `auth` vs `notifications` notification endpoints.
- R11: replace the 65 raw `console.*` calls with the structured logger.
- R12: production packaging (Dockerfile, CI, migrate-on-deploy), DB SSL, `ENFORCE_INTRANET` behind a sanitising proxy, and a decision on RabbitMQ/Redis for multi-instance.
- R13: resolve OCR (`tesseract.js` + `eng.traineddata`): wire it or remove it.

---

## Appendix: quick-reference counts (from this audit)

- Backend modules: 24 (plus middleware, events, utils, config, bootstrap). **[Code]**
- Backend controllers: about 20 module controllers; services: 20; routers: about 22 (3 named `.routes.js`). **[Code]**
- Frontend: about 40 pages, 50+ components, 8 hooks. **[Code]**
- Report code: 5 modules + 1 Python worker (27 sheet generators) + 43 FN renderers + 18 district renderers. **[Code]**
- Confirmed-dead files: 3 legacy MVC + 4 `vaibhav_reference` + backend-root scratch scripts. **[Code]**
- Raw `console.*` calls: 65; migrations: 28 (all `.js`). **[Code]**

*End of audit and restructuring plan.*
