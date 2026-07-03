# dd/mm/yyyy Date Standardization — Handoff

**Status as of last edit: ALL TASKS COMPLETE (16/16). Refactor fully done.**

Full plan: `/home/ashmit/.claude/plans/scalable-spinning-flame.md` (context, rationale, file list — read this first).

## Decisions locked in (do not re-litigate)
- Separator is **slash**: `dd/mm/yyyy`, not `dd-mm-yyyy`.
- Native Postgres `DATE` columns (`records.record_date`, `compilations.period`, warehouse `fact_*` date columns) **stay `DATE`-typed internally** — no schema migration. They're formatted to dd/mm/yyyy only at API/UI/file boundaries via `toDMY()`/`toISO()`.
- The ~15 free-text date fields inside `records.data` JSONB (`fir_date`, `occurrence_date`, `date_of_arrest`, `*_dob`, `gd_date`, `dd_date`, `missing_date`, `found_date`, `arrest_date`) are stored as **literal dd/mm/yyyy strings** — this is the actual fix for the original bug.
- DATETIME fields (`occurrence_from_date_time`, `occurrence_to_date_time`, `info_received_at_ps_date_time`, `gd_date_time`) use `'DD/MM/YYYY HH:mm'`.

## Shared utilities (built, done)
- `backend/src/utils/dateFormat.js` — `parseFlexibleDate`, `toISO`, `toDMY`. Import this everywhere instead of hand-rolling date parsing.
- `frontend/src/utils/dateFormat.js` — `parseDMY`, `formatDMY`, `formatDMYTime`, `parseAnyDate`.
- `frontend/src/components/ui/DateInput.jsx` — replacement for native `<input type="date">`. Displays/commits dd/mm/yyyy text, has a hidden native date input behind a calendar icon for picking. Props: `value` (dd/mm/yyyy string), `onChange(dmyString)`, `disabled`, `placeholder`, `status` ('error' or undefined), `className` (wrapper), `inputClassName` (override the visible text input's classes — pass this to match each page's existing `form-control` styling).

## Task list (source of truth: TaskList tool — check it for current status)
1. ✅ backend/src/utils/dateFormat.js
2. ✅ frontend/src/utils/dateFormat.js
3. ✅ DateInput component
4. ✅ import module (import.controller.js, template-builder.service.js, import-fields.config.js hints, legacy.controller.js)
5. ✅ records module (records.controller.js, records.service.js incl. applyBasicCondition to_date() SQL fix, checkDuplicateRecord)
6. ✅ report-builder queryEngine.js (jsonDateFieldExpr + value ISO conversion for date fields)
7. ✅ warehouse ETL normalize.js safeParseDate
8. ✅ reports.controller.js + analytics.controller.js output formatting (toDMY on record_date/period passthrough, CSV/HTML/Excel cells, filename stripSep, month/day chart bucket labels)
9. ✅ API boundary query param parsing (records.controller.js dateFrom/dateTo, compilation.controller.js period/fromDate/toDate, daily-diary.controller.js getValidatedDate + dateTo)
10. ✅ frontend/src/utils/formatters.js formatDate
11. ✅ components/DynamicForm/DynamicForm.jsx (AntD/dayjs) — needs `dayjs.extend(customParseFormat)`, done
12. ✅ components/forms/DynamicForm.jsx DOB/age handlers (parseDMY), dead gd_date reconciliation block simplified, handleFirSearch simplified, MOCK_FIR_LIST updated
13. ✅ DONE — all native `<input type="date">`/`datetime-local` in live code replaced with DateInput (verified via grep, zero remaining outside index.css and DateInput.jsx's own hidden picker). Files touched: DateField.jsx, FieldRenderer.jsx, forms/DynamicForm.jsx, StationFilters.jsx, CaseManagement.jsx, ArrestManagement.jsx, MissingPersonEntry.jsx, UIDBManagement.jsx, PCRCallEntry.jsx, records/RegistrationPage.jsx, reports/ReportBuilder.jsx, reports/CustomExcelBuilder.jsx, district/CompilationUI.jsx. Also fixed ISO default-initializers in useAutosave.js, useCreateRecord.js, FilterPresetsPanel.jsx, and one `period` default in utils/api.js's debug-mock layer (rest of that file's `new Date(` calls are timestamp generators, confirmed out of scope, not touched).
14. ✅ DONE — QueuePage.jsx record_date columns now display the dd/mm/yyyy string directly (no more `new Date().toLocaleDateString()`). UnifiedFilterStrip.jsx and MultiSheetReportBuilder.jsx now send/parse `DD/MM/YYYY` (added `dayjs.extend(customParseFormat)` to UnifiedFilterStrip.jsx). StationDetailView.jsx's trend-chart grouping/sorting fixed (was sorting dd/mm/yyyy lexicographically — now parses to a real Date for sort, formats for display only after sorting). Confirmed out-of-scope and left alone: RecordDetail.jsx (performed_at/changed_at), LevelContractsPage/LegacyDataPage/AuditPage (created_at/changed_at), StationPerformanceTable.jsx (last_activity = updated_at), CompilationUI.jsx period display (already using parseDMY from task 13). Final sweep confirmed zero remaining bare `toLocaleDateString()`/`toLocaleString()` and zero remaining `new Date(businessDateField)` patterns in frontend/src (excluding vaibhav_reference, confirmed dead code).
15. ✅ DONE — python_worker hardened:
    - `fmt_date` already had `_DMY_RE = re.compile(r'^\d{2}/\d{2}/\d{4}$')` passthrough validation and `_ISO_RE` numeric validation before reassembly — no changes needed.
    - `query_records()` already used `parse_date()` for date_from/date_to (lines 124-125) and `fmt_date()` for record_date output (lines 164-165) — no changes needed.
    - `query_linked_records()` had a bug: lines 376-377 passed raw filter strings directly into `BETWEEN :date_from AND :date_to` against a native DATE column. Fixed to use `parse_date()` with ISO fallbacks, matching query_records() pattern.
    - `_fetch_records()` already used `parse_date()` for date/date_to — no changes needed.
    - `export_daily_report.py` does not exist in this repo — nothing to verify.
16. ✅ DONE — Final grep: `grep -rn "YYYY-MM-DD|yyyy-mm-dd" backend/src frontend/src python_worker` returns zero user-facing format strings. All remaining hits are: internal SQL `to_char()` bucket-key expressions, server logger timestamp (not a business date), code comments/docstrings, and third-party library internals (venv). Confirmed clean.

## Task 15 — python_worker — what to do
1. `python_worker/formatters.py` `fmt_date` — add validation: only treat a 3-part hyphen-split string as `yyyy-mm-dd` if each part is actually numeric and looks like a real date; otherwise passthrough unchanged (don't reassemble garbage positionally). Also add an explicit branch recognizing an already-valid `dd/mm/yyyy` string (regex `^\d{2}/\d{2}/\d{4}$`) and returning it as-is without going through the hyphen-split logic at all (cleaner than relying on the fallthrough).
2. `python_worker/generator.py` — `query_records()` (~line 100) builds a SQL query selecting `records.data::jsonb->>'{k}'` fields as raw text plus `records.record_date`. The JSONB fields will already be dd/mm/yyyy at rest (no code change needed for those). But `records.record_date` itself is a native Postgres DATE column — when read via psycopg2/SQLAlchemy it comes back as a Python `date` object or ISO string, NOT dd/mm/yyyy. Find where `record_date` is written into the output DataFrame/dict (in `query_records()`, `render_pdf()` ~549-596, and the CSV branch ~822-826 of `generate_report()`) and apply `fmt_date()` (or `.strftime('%d/%m/%Y')` if it's a Python `date` object) to it there.
3. Filter parsing — `query_records()` likely does something like `WHERE record_date >= %s AND record_date <= %s` using `from`/`to` (or `dateFrom`/`dateTo`) values pulled out of the `report_jobs.filters` JSON column. Those filter values now arrive as dd/mm/yyyy (set by the Node frontend/backend, which no longer converts them before storing in `report_jobs.filters`, see reports.controller.js `generateReport` — it stores `filters` verbatim). Find that WHERE-clause construction and parse the incoming dd/mm/yyyy filter value into a real date (e.g. `datetime.strptime(val, '%d/%m/%Y').date()`) before binding it into the SQL query, mirroring what `toISO()` does on the Node side. Grep `python_worker/generator.py` for `from`/`to`/`dateFrom`/`dateTo`/`date_from`/`date_to` to find all such spots — there may be more than one query-building function.
4. Also check `python_worker/generator.py`'s `_fetch_records()` (~line 632, used by the Daily Diary `sheet_*.py` engine) — this one already routes fields through `fmt_date()` inside each `sheet_*.py` module (confirmed safe), but verify the `date`/`from`/`to` filter param used to select which records to fetch (daily-diary date param, set by `daily-diary.controller.js` which now sends ISO after `getValidatedDate()` converts it — so this path is actually already ISO by the time it reaches Python, cross-check this is really true by tracing `queueDailyDiaryExport`'s `filters: JSON.stringify({ date, date_to: dateTo, ... })` — both `date` and `dateTo` are ISO-converted Node-side already, so `_fetch_records()` should need NO changes. Only `query_records()` (used by the generic non-daily-diary report pipeline, fed by `generateReport`'s pass-through filters) needs the dd/mm/yyyy parsing fix.
5. Check `Master/files/export_daily_report.py` (the standalone script invoked via `execSync` from `reports.controller.js` for `daily-status` Excel format) — it receives `--date` as a CLI arg, which `reports.controller.js` now converts to ISO via `toISO()` before building the command (already fixed in task 8). Verify this script itself doesn't also need internal date-format changes for OTHER date fields it reads/writes (it's a separate codebase from `python_worker/`, may have its own `fmt_date`-equivalent or lack thereof — investigate before assuming it's fine).

## Important gotcha to remember for task 15/16
Any place doing `new Date(someRecordDateOrJsonDateField)` (JS) or naive string parsing (Python) on a business date field will BREAK because that field is dd/mm/yyyy text now, not ISO. This is the most common bug pattern to hunt for. Timestamp fields (created_at/updated_at/changed_at/performed_at) are still ISO — leave those alone.

## Known out-of-scope (do not touch)
- `created_at`, `updated_at`, `changed_at`, `performed_at`, `submitted_at`, etc. — real `TIMESTAMP` columns, stay ISO. Bare `toLocaleDateString()`/`toLocaleString()` calls on these are a *display consistency* nit (task 14) not a wrong-format bug.
- `frontend/src/vaibhav_reference/*` — confirmed dead/unreferenced code, do not edit.
- `analytics.service.js` (backend) — confirmed orphaned/unused (nothing imports it), left untouched.

## How to verify when done
See "Verification" section of the plan file. Key ones: download+reimport an Excel template, create a record through both DynamicForm entry points, exercise a date-range filter/report-builder query, run warehouse backfill, generate a report (PDF/CSV/Excel) and daily diary, then grep for leftover `YYYY-MM-DD` strings.
