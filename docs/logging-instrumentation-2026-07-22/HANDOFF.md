# PHAROS — Full-Stack Debug Logging Instrumentation — HANDOFF

**Started:** 2026-07-22
**Orchestrator:** Opus (architect/PM — writes NO code; commands Sonnet subagents)
**Goal:** Blanket the ENTIRE project (backend + frontend) with dense, structured,
step-by-step debug logging so a non-dev tester can reproduce bugs, and the resulting
**log files** (a single folder) can be sent back for offline analysis. Bugs cluster in
**workflow, forms, and Excel import** — those paths get the densest instrumentation.

> This file is the single source of truth. It is updated **before and after every agent
> dispatch**. If you are a subagent: read this file completely, then read the reference
> module (§7) before writing a single line. Match its style **exactly**.

---

## 1. What "done" looks like

- Every backend module logs at **every meaningful step** (entry, each branch, each DB
  write, each validation decision, each event publish/consume, each catch) with a bound
  module logger and a **correlation id** that ties one user action across frontend →
  backend → DB → event.
- Frontend logs **every meaningful UI step** (route change, form field change, validation
  fail, submit start/success/fail, API request/response, thrown error, React error
  boundary) and **ships them to the backend via an API**, which stores them as files.
- A tester runs the app, reproduces a bug, and sends **one folder** (`backend/logs/`)
  containing correlated backend + frontend logs. A manual "Download logs" button is the
  fallback when the backend ingest itself is broken.
- The pipe is **verified end-to-end** (§8) before any of this is called complete.

---

## 2. Architecture

### Backend correlation + logging
- `getLogger(moduleName)` → returns a Winston child logger bound with `{ module }`.
  Import in every file: `const log = getLogger('records.service');`
- **Request correlation via `AsyncLocalStorage`** (`utils/requestContext.js`). A
  request-context middleware (registered early in `app.js`) reads the `x-request-id`
  header (or generates a UUID), stores `{ requestId, userId, role }` in ALS, and the
  logger format auto-injects `requestId` into every line. **Module code never threads a
  requestId parameter** — it is ambient. This is the single most important design point;
  do not invent per-module correlation schemes.
- Same request id is echoed back in a response header so the frontend can correlate.

### Frontend logging + pipe
- `frontend/src/utils/logger.js` — a singleton logger: `log.info/debug/warn/error(event, data)`.
  - Generates one **session id** (per tab load) and one **requestId per API call**
    (sent as `x-request-id`, so the backend logs line up).
  - Mirrors to `console` (dev) AND appends to a **persisted ring buffer**
    (IndexedDB, fallback localStorage) so logs survive reload/crash.
  - **Batches** buffered logs to `POST /api/logs/client` (see traps §6).
  - Flushes on: interval, `beforeunload`, `visibilitychange→hidden`, and on any error.
  - Exposes a **"Download logs"** action (button mounted in the app shell) that exports
    the buffer as a `.log`/`.json` file — the fallback path.
- Backend ingest `POST /api/logs/client` → validates shape lightly, stamps server time +
  ip + (user if token present), writes newline-delimited JSON to
  `backend/logs/frontend/<sessionId>.log`. **Unauthenticated-tolerant, rate-limit-exempt,
  mock-bypassed** (§6).

### Log storage layout (all under `backend/logs/`, git-ignored already)
```
backend/logs/
  combined.log            # existing winston (all backend)
  error.log               # existing winston (errors)
  backend/                # (optional) per-day rotated backend logs
  frontend/<sessionId>.log  # NEW — client logs, NDJSON, one file per browser session
```
Tester zips/sends the whole `backend/logs/` folder.

---

## 3. Logging convention (ALL agents follow verbatim)

**Levels**
- `debug` — fine-grained step trace (each field mapped, each branch taken, loop iterations,
  intermediate values). This is where "the more the better" lives. Backend runs at `debug`
  in dev.
- `info` — a meaningful lifecycle event completed (record created, transition applied,
  batch confirmed, login success, API 2xx).
- `warn` — recovered/degraded path (validation salvage, retry, fallback, missing-but-optional).
- `error` — a caught failure, with `err.stack`.

**Every function that does real work logs:**
1. **Entry** at `debug`: `log.debug('createRecord: enter', { type, userId, keys: Object.keys(data) })`
2. **Each branch / decision** at `debug`: which path and why.
3. **Each external effect** at `debug`→`info`: DB write (table + id), event publish, HTTP call.
4. **Exit** at `info` (or `debug` for read paths): outcome + primary id(s).
5. **Catch** at `error`: `log.error('createRecord: failed', { err })` (logger prints stack).

**Structured, not string-concat.** Second arg is an object. Keys are stable & snake/camel
consistent with the surrounding module. Include the primary entity id on every line where
one exists (`recordId`, `batchId`, `userId`, `firNo`).

**REDACTION (mandatory, no exceptions):** never log `password`, `password_hash`,
`access_token`, `refresh_token`, `Authorization` header value, JWT contents, CSRF token,
cookies. Log presence/length only (`{ hasToken: true }`). A `redact()` helper is provided
by foundation — use it on any object that may carry these.

**Do not** change behavior. Logging is additive only. No refactors, no signature changes
(ALS removes the need). Do not swallow errors you newly catch — log and rethrow.

**Granularity target for the hot paths (workflow / forms / import):** log *every* step —
each field normalize, each ref-lookup resolution, each persons/properties/offences row,
each workflow rule resolved, each Excel row parsed/validated/composed. Verbose is the goal.

---

## 3b. Dev-vs-Prod gating (MANDATORY — user requirement)

The dense/debug logging and the client-log pipe are **development-mode only**. Production
stays quiet (errors + essential `info` only), and the client-log ingest is disabled.

- **Backend:** verbose `debug` is already dev-gated (`logger` level = `env.isDev ? 'debug'
  : 'info'`). Keep it. Gate the client-log ingest route + any expensive per-step logging
  behind a single flag `env.DEBUG_LOGGING` (default = `env.isDev`; overridable by env var
  so a prod-like build can be turned on deliberately for a tester). When off:
  `/api/logs/client` returns `204` and writes nothing; module `debug` lines are dropped by
  the level anyway.
- **Frontend:** the logger checks one flag `LOG_ENABLED = import.meta.env.DEV ||
  import.meta.env.VITE_DEBUG_LOGGING === 'true'`. When off: `console` mirroring, buffering,
  batching, and the Download-logs button are all **no-ops** (logger methods return
  immediately) — zero overhead in production. `error`-level may still be captured if cheap,
  but nothing ships unless enabled.
- Module/component agents just call the logger normally — the gating lives entirely in the
  foundation's logger + ingest route, so agents never write `if (dev)` themselves.

---

## 4. Ownership map (prevents merge conflicts + dialect drift)

**Foundation agent OWNS (no other agent touches these):**
- `backend/src/utils/logger.js` (enhance)
- `backend/src/utils/requestContext.js` (NEW — ALS)
- `backend/src/utils/redact.js` (NEW)
- `backend/src/middleware/requestLogger.middleware.js` (NEW — ALS + req/res logging)
- `backend/src/modules/logs/` (NEW — client-log ingest module: router + controller)
- `backend/src/app.js` (register middleware + `/api/logs` route ONLY)
- `frontend/src/utils/logger.js` (NEW — the client logger)
- `frontend/src/utils/api.js` **interceptors + transport** (lines ~24–100) — the pipe lives
  here; only foundation instruments transport. Component/hook agents must NOT touch api.js
  interceptors.
- The reference module `backend/src/modules/records/records.service.js` (fully instrument
  as the STYLE ANCHOR — §7).
- A "Download logs" button mounted in the app shell (foundation picks the least-invasive
  mount point, e.g. a small floating button in the layout).

**Phase-1 module agents own their module files ONLY** (see §5). They import the shared
utilities; they never edit foundation-owned files.

---

## 5. Work breakdown (Phase 1 — parallel, AFTER foundation verified)

Each group = one Sonnet agent. Every agent: read this HANDOFF + §7 reference module first.

| Group | Scope (files) | Notes |
|-------|---------------|-------|
| **B1 — Records/Workflow core** | `modules/records/*` (controller, service — beyond the ref anchor already done, mapper, normalize), `modules/workflow/*`, `modules/fields/*` | HOT PATH. Densest logging. Records.service.js already instrumented by foundation — this agent instruments the *rest* of records/ + all of workflow + fields. |
| **B2 — Import pipeline** | `modules/import/*` (parse, key-bridge, compose, validate, service, router, template), `events/handlers/importConfirmHandler.js` | HOT PATH. Log every row parse/validate/compose/salvage/reject + batch lifecycle. |
| **B3 — Events + cross-cutting** | `events/eventBus.js`, `events/handlers/{notifyHandler,linkAuditHandler,linkResolver}.js`, `middleware/{auth,rbac,rateLimiter,security}.middleware.js`, `middleware/error.middleware.js` | Log every publish/consume/ack/nack, every scope decision, every auth verify. (requestLogger.middleware is foundation's — don't touch.) |
| **B4 — Auth/Users/Hierarchy/IO** | `modules/auth/*`, `modules/users/*`, `modules/hierarchy/*`, `modules/io/*` | Auth is a bug hotspot — log login/refresh/logout steps (REDACT secrets). |
| **B5 — Reporting/analytics/rest** | `modules/{compilation,analytics,audit,notifications,record-links,filters,level-contracts,admin,reports}/*` | Standard granularity. Skip `daily-diary/warehouse/report-builder` unless trivial (they're pre-restructure, still on old schema — instrument entry/catch only, note in progress). |
| **F1 — Forms + hooks + API-facing** | `components/forms/*` (DynamicForm, FieldRenderer, all field components, ActsSectionsTable, autosave), `hooks/*` (useCreateRecord, useUpdateRecord, useFormSchema, useAutosave, useNotifications, useFilterPresets) | HOT PATH (forms). Log field changes, validation fails, show_when toggles, submit lifecycle, autosave. Uses foundation's `logger.js`. Do NOT touch api.js interceptors. |
| **F2 — Pages + routing + context** | `pages/{hc,sho,district,hq,admin,analytics,reports,shared}/*`, `PersonSearchPage.jsx`, `routes/*`, `contexts/AuthContext.jsx`, `store/authStore.js`, `features/auth/*` | Log route/page mount, user actions (button clicks that trigger mutations), auth state transitions, React error boundaries (add one if absent). |

Agents can run in parallel within Phase 1 — ownership is disjoint by file.

---

## 6. Pipe traps the FOUNDATION agent MUST handle (blocking)

1. **Client-log bypass** — the client-log POST must go direct (raw `fetch`), never through
   the intercepted axios client, or log shipping can feedback-loop / fail on auth.
   *(Historical note: a frontend Mock Mode engine previously keyed on `prism_debug_api_mode`
   also swallowed logs; that Mock Mode architecture was removed — see
   `frontend/MOCK_MODE_REMOVAL_REPORT.md`.)*
2. **No feedback loop** — the request/response interceptor logs API calls; sending logs is
   an API call. Exclude `/api/logs/client` from interceptor logging (and from the buffer)
   to avoid infinite recursion.
3. **Auth leniency** — `/api/logs/client` accepts logs **without** a JWT (attach user if a
   token is present, never 401 on absence). Auth/login failures are prime targets; we must
   capture logs when the user is logged out or auth is broken.
4. **Rate-limit exempt** — `/api/` has `apiLimiter` (100/15min in prod). Register the log
   route so it bypasses the limiter, or a batched stream trips it.
5. **Flush-on-crash** — persist to IndexedDB/localStorage ring; flush on `beforeunload` +
   `visibilitychange` + on error, not only on interval. Cap buffer size (ring). Keep the
   manual **Download logs** button as the fallback when ingest is down.
6. **CSRF** — the app uses double-submit CSRF (`csrfDoubleSubmitMiddleware`). Ensure the
   log route is reachable (exempt or send the token) so logs aren't 403'd.

---

## 7. Reference module (STYLE ANCHOR)

Foundation fully instruments **`backend/src/modules/records/records.service.js`** to the
convention in §3. This becomes the canonical example. **Every Phase-1 agent is told:
"match the logging style in `records.service.js` exactly."** When in doubt about level,
key names, phrasing, or density — copy what that file does. Do not deviate.

---

## 8. Verification gate (BLOCKS fan-out and BLOCKS "done")

Before Phase 1 is dispatched, foundation must prove the pipe works end-to-end:
1. Start backend + frontend (or a minimal harness).
2. Perform one action (e.g. login or open a form).
3. Confirm a **frontend event actually lands in `backend/logs/frontend/<session>.log`**.
4. Confirm the **same requestId appears on both** the frontend log line and the backend
   log line for one API call.
5. Confirm none of the traps in §6 silently drop logs (mock mode on, logged-out state).

If the pipe fails silently, a tester burns a whole session and returns with nothing — so
this gate is mandatory, not optional.

---

## 9. Other docs to update (on completion)

- `CLAUDE.md` — add a short "Debugging / Logging" section: how correlation works, where
  logs land, how a tester exports them, the redaction rule.
- `docs/ENGINEERING_BASELINE.md` — note the logging convention as standing practice.
- Memory: add a `project` memory pointing at this handoff.

---

## 10. Progress tracker  (orchestrator updates every dispatch)

| Phase | Agent | Status | Notes |
|-------|-------|--------|-------|
| 0 | Foundation (utils + ingest + ref module + pipe verify) | ✅ DONE | Pipe VERIFIED live (matching requestId both ends). Fixed real bugs: ANSI leak into JSON, unredacted SSE JWT, undefined `env.isDev`, gitignore hiding logs module. `req.user` NOT in ALS at middleware time — routers can `setContext({userId,role})` post-auth (optional follow-up for B3/B4). |
| 1 | B1 Records/Workflow/Fields | ✅ DONE | Finished records.mapper (42 total — splitProperty*, buildOffenceRows, splitPayload, recomposeRecord), fields.service (28), fields.controller (49, preserved user edits, converted 13 `logger.error`→`log.error`), statusOptions.config (1). Skipped declarative routers + classificationSources.config (static). ⚠⚠ **Found TWO `git reset --hard HEAD` in reflog @17:44 — see §12** (worse than the stash). | Died on session limit mid-`records.mapper.js`. DONE: records.{controller,mapper(partial),normalize,service}, workflow.engine. TODO: finish records.mapper (splitPersonEntry/splitPersons), records.router, workflow.router, ALL fields/ (controller,service,router,2 configs). |
| 1 | B2 Import pipeline | ✅ DONE | 9 files, ~249 log calls, **`npm run import:parity` passes live** with logs firing. Finished validate.validateBatch, import.service (batch lifecycle + per-row write loop), controller, template-builder, importConfirmHandler, layout-manifests, registry-sync. Skipped import-fields.config (static) + declarative router parts. Recovered template-builder after 1 external revert. Minor: `const written = await createImportedRecord()` to log recordId (log-only, mirrors records.service). | Died mid-`import.validate.js` (validateComposedRow). DONE: import.{compose,parse,validate(partial)}, import-key-bridge.config. TODO: finish import.validate, import.controller, import.service (BIG), import.router, import-fields.config, layout-manifests, registry-sync.util, template-builder.service, importConfirmHandler. |
| 1 | B3 Events + middleware | ✅ DONE | 110 log calls, 9 files. Fixed real JWT leak (error.middleware logged `req.originalUrl` w/ SSE `?token=`→ `req.path`). setContext wired at 3 auth branches (`req.user.id`/`.role`). Nit: widened private `makeHandler(message,limiterName)` — safe, unexported. |
| 1 | B4 Auth/Users/Hierarchy/IO | ✅ DONE | 185 log calls, 6 files. Redaction verified (only booleans/lengths in auth). ⚠ REVIEW: `io.service.js listIOs` now `await`s the Knex builder to log count (thenable→array; callers all await, safe but verify). Routers left uninstrumented (declarative, no logic) — OK. |
| 1 | B5 Reporting/analytics/rest | ✅ DONE | Finished levelContracts.service (masking-decision logging in resolveMasking), levelContracts.controller, analytics.controller (~64), reports.controller (~103), reports/scheduler (~31). Converted pre-existing unbound `logger` calls → bound `getLogger`. **Fixed live secret leak**: reports.controller `console.log` embedded `--password "${dbPass}"` plaintext → structured `hasDbPass`. Skipped declarative routers. Recovered `reports.controller.js` after stash-incident reversion (redid + re-verified). Noted 2 stale bugs (§11). | Died mid-`levelContracts.service.js`. DONE: compilation.{controller,service}, audit.{controller,scheduler,service}, notifications ALL(4), record-links.{controller,service}, filters.controller, levelContracts.service(partial). TODO: finish levelContracts.service, analytics.{controller,router}, reports.{controller,scheduler}, level-contracts.controller, admin (real logic only; skip pure declarative routers per B4 precedent). |
| 1 | F1 Forms + hooks | ✅ DONE | 11/12 files, ~85 log calls. DynamicForm dense (42 calls). Skipped useDebounce (noise). ⚠⚠ **CAUSED GIT-STASH INCIDENT (see §12)** — ran `git stash`/`pop` mid-flight, briefly reverted whole tree to HEAD while B1/B2/B5 writing; restored 105 files, left `stash@{0}`; `reports.controller.js` may have lost seconds of B5 work. Found pre-existing bug: FormSection.jsx L533 renders `<FormAutosave>` never imported + undefined `saveStatus` (latent ReferenceError, currently dead branch). | Died mid-`useFilterPresets.js` (actually completed it). DONE: forms{ActsSectionsTable,DateTimePickerPopup,FieldRenderer,FormSection,FormToolbar,SearchableSelect}, hooks{useAutosave,useCreateRecord,useFilterPresets,useFormSchema,useNotifications,useUpdateRecord}. TODO: **DynamicForm.jsx (CRITICAL hot path — git-M is user's pre-edit, NOT logged)**, CheckboxField/DateField/NumberField/RadioField/SelectField/TextAreaField/TextField/TimeField, FormAutosave, useAuth, useDebounce. |
| 1 | F2 Pages + routing + context | ✅ DONE | 24/24 pages + routes/context/auth, ~270 log calls, `vite build` clean. HIGH pages (LegacyDataPage/CompilationUI/all reports) at anchor density. ErrorBoundary NEW. AuditPage aliases logger as `clientLog` (local `log` var shadow). Found 2 pre-existing bugs (see §11). |
| 1.5 | Post-fan-out integrity verification | ✅ DONE | All 43 backend + all sampled frontend claimed files retain log calls (NONE reverted to HEAD despite the incident). `node --check` clean backend-wide. `vite build` exit 0. `npm run import:parity` passes. Only esbuild "failure" = pre-existing `<Option>` tag-case bug (confirmed at HEAD, vite tolerates). Confirmed `index.js` imports the instrumented `app` from `src/app.js` → pipe is LIVE under real `npm run dev`. Dangling `stash@{0}` left in place (redundant, harmless). |
| 2 | Docs + memory update | ✅ DONE | `CLAUDE.md` §13b (Debugging/Logging), `ENGINEERING_BASELINE.md` (checklist item + standing-practice + multi-agent git lesson), project memory `logging-instrumentation-2026-07-22`. |

**Legend:** ⏳ not started · 🔧 in progress · ✅ done · ⛔ blocked · ⚠ done-with-caveats

---

## 13. FINAL STATE (2026-07-22) — COMPLETE

~2,000 log calls (1,485 backend / 511 frontend). All 7 Phase-1 groups + foundation done and
verified. Pipe proven end-to-end (matching requestId both ends). Build green. 3 live secret
leaks fixed as a bonus; several pre-existing bugs registered in §11 for a separate fix pass.
**Nothing is committed** (per Git Safety — no explicit ask). Suggested next step for the user:
commit this instrumentation on `dev2/ashmit`, then hand the tester the workflow in `CLAUDE.md`
§13b (reproduce → send `backend/logs/` folder + written issue list).

---

## 11. Bugs found during instrumentation (register — fix separately, NOT part of logging)

These are pre-existing bugs surfaced while reading code to instrument it. Logged here for
the user's debugging effort; none were fixed by the logging agents (out of scope) except
the security leaks, which foundation/B3 fixed inline because they were introduced-or-
worsened by logging itself.

**Fixed inline (security — could not ship logging without these):**
- Foundation: ANSI color codes bleeding into JSON log files (winston format layering);
  unredacted raw JWT in the SSE `?token=` query string being logged; `env.isDev` referenced
  but never defined; anchored `.gitignore` `logs/` pattern that was silently hiding the new
  `modules/logs/` source dir.
- B3: `error.middleware.js` logged `req.originalUrl` (carries SSE `?token=<JWT>`) → switched
  to `req.path`.

**Registered, NOT fixed (pre-existing, unrelated to logging):**
- `frontend/src/pages/reports/MultiSheetReportBuilder.jsx` (~L283/298): JSX tag-case
  mismatch `<Option value="CASE">…</option>` (opens `Option`, closes `option`), twice.
  esbuild/Vite tolerate it; ESLint's parser calls it a syntax error. Fragile — fix later.
- `frontend/src/pages/analytics/AnalyticsDashboard.jsx`: `EmptyState` component defined
  inside the parent render body (re-created every render) — `react-hooks/static-components`.
- `backend/src/modules/io/io.service.js` `listIOs`: originally returned the raw Knex query
  builder (thenable) instead of an awaited array; B4 changed it to `await query` to log the
  row count. Behavior-preserving (all callers await), but verify in review.

**More live secret leaks fixed (B5):**
- `reports.controller.js` `generateReportInternal`: `console.log` embedded the DB password
  in a full shell command string (`--password "${dbPass}"`) → replaced with structured log
  (`hasDbPass` boolean, never the value).

**More registered, NOT fixed (pre-existing, stale post-restructure code):**
- `reports.controller.js` `getRecordsForReport`: queries `records.data @> ?::jsonb` and reads
  `r.data` — `records.data` jsonb no longer exists (restructure). Will throw if a dynamic
  filter reaches that branch. B5 logged it at `warn` so failures trace here.
- `reports.controller.js` `generateReportInternal` daily-status Excel branch: uses
  `path.resolve(__dirname, …)` inside an ES module — `__dirname` is undefined → `ReferenceError`
  if that branch runs.
- `frontend/src/components/forms/FormSection.jsx` L533: renders `<FormAutosave …/>` that is
  never imported, with undefined `saveStatus` — latent `ReferenceError` (branch currently
  dead: all callers pass `hideHeader={true}`).

_(B1/B2 still running may append more here on completion.)_

---

## 12. ⚠ INCIDENT — concurrent git-stash tree reversion (2026-07-22)

**What happened:** agent **F1**, while trying to run a clean lint check, ran `git stash` +
`git stash pop`. Because all Phase-1 agents share ONE working tree, `git stash` reverted the
entire tree to HEAD for the window it was applied — clobbering in-flight edits from B1/B2/B5/F2
that were mid-write. F1's `git stash pop` then hit conflicts on files other agents had rewritten
in that window. F1 restored ~105 files via `git checkout stash@{0} -- <path>`, left a dangling
**`stash@{0}`** as a safety net, and flagged `reports.controller.js` as possibly having lost a
few seconds of B5's work.

**Blast radius (assessed):** self-healing worked. F2 (AnalyticsDashboard) and B5
(reports.controller.js) both independently DETECTED their reverted files via re-read/grep/
`node --check` and REDID the lost sections, re-verifying clean. The Edit tool errors on external
file changes and forces a re-read, which is what saved this. Final agent reports for F2 and B5
both confirm clean end states.

**Orchestrator follow-up (do when B1 + B2 finish — NOT before, no git tree ops while agents run):**
1. Re-run parse checks on ALL changed files (backend `node --check`, frontend esbuild/vite).
2. Grep every agent's file list for `getLogger`/`log.` to confirm NONE reverted to HEAD
   (a reverted file = 0 log calls where the report claims coverage).
3. Drop the dangling stash: `git stash list` → if only the F1 safety-net remains and step 2 is
   clean, `git stash drop stash@{0}`.

**LESSON (bake into all future multi-agent dispatches):** subagents sharing one working tree
must NEVER run `git stash`, `git reset`, `git checkout -- .`, or any tree-wide git op. Lint via
direct file paths only (`eslint <file>`), never via stash. Future agent prompts must forbid this
explicitly. (Isolation via per-agent worktrees would prevent it structurally — consider for next
large fan-out.)
