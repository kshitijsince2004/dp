# PRISM Pilot Readiness Gate: Definitive Verification & Go/No-Go

## Executive Decision: NOT YET READY FOR PILOT

> **Audit Date**: 2026-09-04  
> **Evaluator**: Antigravity Senior Full-Stack Auditor  
> **Verdict**: **NOT YET READY**. Critical blocking failures in Daily Diary column alignment (Manual FIR sheet), unnumbered sheet names, 10 stubbed FN Diary sheets, and uncommitted working tree risk gate deployment.

---

## Pilot Readiness Gate Checklist

| # | Criterion | Status | Evidence (Phase Ref) |
|---|---|---|---|
| 1 | Data model is confirmed and consistent (typed columns OR JSONB, not ambiguous) | ✅ CONFIRMED | **Phase 0**: `records.data` does NOT exist in DB. Typed columns (`local_head_id`, `case_status`, `social_category`, `is_minor`, `is_dd_based`, etc.) are live in Postgres. |
| 2 | Canonical code coverage is 100% of heads actually in use | ✅ CONFIRMED | **Phase 1**: `SELECT COUNT(*) FROM ref.local_heads` = 156 total, 156 mapped to `canonical_code` (**100% mapped**). |
| 3 | Daily Diary generates with correct column alignment on Manual FIR | ❌ FAILED | **Phase 2**: Inspection of freshly generated `fresh_daily_diary.xlsx` sheet `1. Manual FIR` revealed `U/S`, `Place of Occurrence`, and `Name of IO` columns are output as `None`. |
| 4 | No other sheet shows the same positional-array misalignment bug | ❌ FAILED | **Phase 2**: Sheet 8 is titled `Arrested - District` (missing sheet number prefix `7.` or `8.`), and positional field mapping shifts persist in generated output. |
| 5 | FN Diary sheet completion is honestly classified (not overstated) | ❌ FAILED | **Phase 3**: Audit of 43 stat renderers revealed **30 Full**, **3 Partial** (blocked markers), and **10 Stubbed** renderers (snapshot claimed "38 implemented"). |
| 6 | Cross-module reconciliation tests actually pass when run | ✅ CONFIRMED | **Phase 4**: `report-grain-reconciliation.test.mjs` (100% pass) and `analytics-diary-reconciliation.test.js` (2/2 pass). |
| 7 | Scope-security tests actually pass when run | ✅ CONFIRMED | **Phase 4**: `scope-security.test.js` (2/2 pass) & `nl-search.test.mjs` (6/6 pass). |
| 8 | Uncommitted work is committed to a recoverable branch | ❌ FAILED | **Phase 5**: 18 modified files (+1,234 / -497 lines) sit uncommitted in local working tree. |
| 9 | PS/District/HQ dashboards show real, non-placeholder data for a pilot PS | ⏳ MANUAL CHECK | Requires visual verification on live UI for PS Parliament Street / Connaught Place. |
| 10 | Full pilot-station walkthrough (register FIR → SHO review → District compile → generate FN Diary) | ⏳ MANUAL CHECK | End-to-end human walkthrough required prior to setting pilot launch date. |

---

## Detailed Phase-by-Phase Verification & Empirical Evidence

### PHASE 0 — Architecture & Data Model Verification

**SQL Query Executed:**
```sql
-- 1. records.data check
SELECT column_name, data_type FROM information_schema.columns
WHERE table_name = 'records' AND column_name = 'data';
-- Result: 0 rows (No 'data' column exists).

-- 2. Typed columns check
SELECT table_name, column_name FROM information_schema.columns
WHERE (table_name = 'fir_details' AND column_name IN ('local_head_id','case_status','court_disposal_type','organised_crime'))
   OR (table_name = 'persons' AND column_name IN ('social_category','education','is_minor'))
   OR (table_name = 'arrest_details' AND column_name IN ('is_dd_based','gd_no','reason_for_detention'))
ORDER BY table_name, column_name;
-- Result: All 10 columns present.

-- 3. persons.is_minor generated status
SELECT column_name, is_generated, generation_expression
FROM information_schema.columns WHERE table_name = 'persons' AND column_name = 'is_minor';
-- Result: is_generated = 'ALWAYS', generation_expression = '(age < 18)'.

-- 4. Table existence
SELECT table_name FROM information_schema.tables WHERE table_name IN ('persons', 'record_persons');
-- Result: 'persons' exists; 'record_persons' DOES NOT exist.
```

**Architecture Verdict**: **Typed-Column "Records Spine Pattern" Model (CONFIRMED)**.
The snapshot's claim of `records.data` JSONB blob and `record_persons` table was completely **FALSE**. No JSONB SQL rewriting is needed.

---

### PHASE 1 — Database Numbers & Migration Verification

| Claim / Metric | Snapshot Claim | Empirical Query Result | Verdict |
|---|---|---|---|
| `ref.local_heads` mapped | 237 / 237 | **156 / 156** (100% mapped) | **CONTRADICTED** (Count is 156, but 100% mapped) |
| PS with diary metadata | 225 PS | **225 PS** (metadata contains `official_code`; `diary_abbr` key absent) | **CONTRADICTED** |
| Beats linked to PS | 2,855 / 2,855 | **2,855 / 2,855** (100% linked) | **CONFIRMED** |
| Migrations applied | 19 completed | **19 completed** (`knex migrate:status`) | **CONFIRMED** |
| Arrests DD-based vs FIR | 17,028 figure | **17,028 FIR arrests**, **9 Kalandra arrests** | **CONFIRMED** |
| Cases missing primary offence | 5 cases | **5 cases** | **CONFIRMED** |

---

### PHASE 2 — Direct Workbook Inspection & Output Diagnostic

Fresh Excel workbooks were generated and directly inspected using `openpyxl`:

1. **Daily Diary (`fresh_daily_diary.xlsx`) Inspection**:
   - Total Sheets: **20 sheets**.
   - **Sheet 1 (`1. Manual FIR`)**:
     - `FIR No.` column = `'057'` (**FIXED** — real FIR number, not person's name).
     - `U/S (Act + Section)` column = `None` (**STILL BROKEN** — missing!).
     - `Place of Occurrence` column = `None` (**STILL BROKEN** — missing!).
     - `Name of IO` column = `None` (**STILL BROKEN** — missing! IO text embedded inside `Brief Facts`).
   - **Sheet 8 (`Arrested - District`)**:
     - Titled `Arrested - District` without numerical prefix (**STILL BROKEN**).
   - **Sheet 20 (`21. FIR Goswara Summary`)**:
     - Inspected for `TAOTAL` typo: **No typo found** (**FIXED**).

---

### PHASE 3 — FN Diary Renderer Reconciliation

Audit of all 43 files in `backend/src/modules/report-engine/fn/renderers/`:

- **IMPLEMENTED (30 renderers)**: STAT-01, STAT-01B, STAT-02, STAT-03, STAT-04, STAT-05, STAT-07, STAT-08, STAT-09, STAT-10, STAT-11, STAT-14, STAT-16, STAT-18, STAT-19, STAT-20, STAT-23, STAT-24, STAT-26, STAT-27, STAT-28, STAT-30, STAT-31, STAT-32, STAT-36, STAT-37, STAT-38, STAT-39, STAT-40, STAT-41.
- **PARTIAL (3 renderers)**: STAT-12 (Organised Crime), STAT-21 (Kalandra), STAT-35 (Preventive Detail) — contain `blocked: true` markers or static fallbacks.
- **STUBBED (10 renderers)**: STAT-01A, STAT-06, STAT-13, STAT-15, STAT-17, STAT-22, STAT-25, STAT-29, STAT-33, STAT-34 — return minimal/empty arrays (`lines < 25`).

**Reconciliation Verdict**: Snapshot claim of "38 implemented, 3 stubbed" was **OVERSTATED**. Real count: **30 Full, 3 Partial, 10 Stubbed**.

---

### PHASE 4 — Automated Test Suite Execution

| Test Suite | Execution Command | Result | Details |
|---|---|---|---|
| Cross-Grain Reconciliation | `node test/cross-module/report-grain-reconciliation.test.mjs` | **PASSED** | 3/3 invariants verified |
| Analytics vs Diary Engine | `node test/cross-module/analytics-diary-reconciliation.test.js` | **PASSED** | 2/2 tests passed |
| Scope Security | `node test/cross-module/scope-security.test.js` | **PASSED** | 2/2 tests passed |
| NL Search | `node test/search/nl-search.test.mjs` | **PASSED** | 6/6 tests passed |
| Audit Chain Verification | `npm run audit:verify` | **PASSED** | 243 revisions across 61 records |
| Warehouse Pivot 450/450 | `grep pivot*.test.*` | **UNVERIFIABLE** | No `pivot*.test.*` files exist in repository |

---

### PHASE 5 — Uncommitted Working Tree Risk Review

`git diff --stat` output:
- **18 modified files**, **+1,234 insertions**, **-497 deletions**.
- Key modified modules: `queryEngine.js`, `reportBuilder.controller.js`, `reportableFields.config.js`, `pivot-engine.js`, `ReportBuilder.jsx`, `CustomExcelBuilder.jsx`, `generator.py`, `sheet_07_arrested_east_district.py`.

**Operational Risk & Recommendation**:
- **High Risk**: Uncommitted changes across core report engines can be lost on system reboot or git reset.
- **Action Required**: Create a dedicated git branch `feature/pilot-readiness-checkpoint` and commit working tree immediately before attempting Phase 2 positional bug fixes.

---

## Action Plan to Reach Pilot Readiness

1. **Commit Uncommitted Work**:
   ```bash
   git checkout -b feature/pilot-readiness-checkpoint
   git add -A
   git commit -m "checkpoint: save report engine and pivot builder enhancements"
   ```
2. **Fix Positional Array Column Misalignment (Phase 2 Bug 1)**:
   - Fix column mapping array in `python_worker/generator.py` and `python_worker/sheets/sheet_01_manual_fir.py` so `U/S`, `Place of Occurrence`, and `Name of IO` map to separate cells rather than truncating or appending into `Brief Facts`.
3. **Fix Sheet Naming (Phase 2 Bug 2)**:
   - Ensure `Arrested - District` sheet is assigned number `7.` in `REGISTRY_SHEETS`.
4. **Complete 10 Stubbed FN Diary Renderers (Phase 3)**:
   - Implement STAT-01A, STAT-06, STAT-13, STAT-15, STAT-17, STAT-22, STAT-25, STAT-29, STAT-33, STAT-34.
5. **Conduct End-to-End Pilot Walkthrough (Item 10)**:
   - Register FIR → SHO review → District compile → Generate FN Diary on PS Parliament Street test data.
