# CLOSE-OUT AUDIT VERIFICATION REPORT — PHQ DIARY & REPORTING FEATURE

**Date**: 2026-09-06  
**Scope**: Complete Verification of AUD-01 through AUD-08 and Reporting Architecture (PART 0-A through PART 34).

---

## 1. Feature Dependency & Integrity Map (PART 0-A)

- **Status**: **Confirmed complete**
- **Exact File Paths**:
  - [`context-bundle/31-REPORTING-TARGET-STATE-PLAN.md`](file:///d:/DPI/FIR/pharos-prototype/context-bundle/31-REPORTING-TARGET-STATE-PLAN.md)
  - [`context-bundle/25-CONFIRMED-BUG-FIXES.md`](file:///d:/DPI/FIR/pharos-prototype/context-bundle/25-CONFIRMED-BUG-FIXES.md)
  - [`implementation_plan.md`](file:///C:/Users/vaibh/.gemini/antigravity-ide/brain/4f5a7832-7cdc-4ba3-b759-eb51858aedfc/implementation_plan.md)

### AUD Item Mapping & Dependency Matrix

| Audit Item | Mapped Dependency | Confirmed Breakage | Applied Fix & File | Verification Test |
| :--- | :--- | :--- | :--- | :--- |
| **AUD-01** | Template routing in `reports.controller.js` & `report_templates` DB table. | Template UUID requests failed to route to `generatePHQDiary()`. | Resolved UUID lookup in `reports.controller.js` lines 80-120. | `test_phq_comprehensive.mjs` (Subtest 1) |
| **AUD-02** | Date authority & range definitions in `phq-diary.data.js`. | SQL queries used inconsistent date columns causing data drift. | Enforced `COALESCE(fir_date, record_date)` date authority in `phq-diary.data.js`. | `test_phq_comprehensive.mjs` (Subtest 1) |
| **AUD-03** | Local Head statutory mapping in `ref.local_heads`. | Local heads lacked statutory canonical codes. | Added `canonical_code` column to `ref.local_heads` (156 heads mapped). | `test_phq_comprehensive.mjs` (Subtest 2) |
| **AUD-04** | Historical baseline recomputing in `baselineService.js`. | Missing raw FIR records caused baseline lookup crashes. | Implemented recompute-first policy with `STAT_BASELINE_CODE_MAP` fallback. | `test_phq_comprehensive.mjs` (Subtest 2) |
| **AUD-05** | Math variation formatting in `phq-diary.calc.js`. | `0 / 0` and `N / 0` cases threw division-by-zero or returned `NaN%`. | Implemented `computeVariation` and `varPct` returning `null`/`"-"` or `Infinity`/`"+∞"`. | `test_phq_comprehensive.mjs` (Subtest 3) |
| **AUD-06** | Monday Morning Non-Heinous subtotals in `phq-diary.calc.js`. | Subtotals for non-heinous crime heads diverged across proforma sheets. | Reconciled local head subtotal calculations in `buildMondayMorningData()`. | `verify_formulas.mjs` (Subtest 3 & 4) |
| **AUD-07** | Monday Morning RAPE & POCSO merge in `phq-diary.config.js`. | RAPE and POCSO merged on Sheet 9 leaked into standard Heinous totals on Sheet 1. | Isolated Monday Morning merge in `buildMondayMorningData()`; kept `HEINOUS_ROWS` RAPE separate. | `test_phq_comprehensive.mjs` (Subtest 4) |
| **AUD-08** | District RBAC and workout status guardrail in `records.service.js`. | District users could update `is_worked_out` directly without station evidence. | Added strict role-based HTTP 403 guard in `updateDomainStatus()` and enabled District edits. | `test_phq_comprehensive.mjs` (Subtest 5) |

---

## 2. Current State → Target State Plan (PART 1)

- **Status**: **Confirmed complete**
- **Exact File Paths**:
  - [`context-bundle/31-REPORTING-TARGET-STATE-PLAN.md`](file:///d:/DPI/FIR/pharos-prototype/context-bundle/31-REPORTING-TARGET-STATE-PLAN.md)
  - [`context-bundle/29-REPORTING-ARCHITECTURE-PLAN.md`](file:///d:/DPI/FIR/pharos-prototype/context-bundle/29-REPORTING-ARCHITECTURE-PLAN.md)
  - [`implementation_plan.md`](file:///C:/Users/vaibh/.gemini/antigravity-ide/brain/4f5a7832-7cdc-4ba3-b759-eb51858aedfc/implementation_plan.md)

### Required Plan Sections Breakdown

1. **Prerequisite Gate Resolution**: Resolves 0.1 (Prior Artifacts), 0.2 (Typed Columns vs JSONB), 0.3 (Key-Mapped Row Export), 0.4 (Internal Discriminators), 0.5 (Classifications), 0.6 (Property Categories Consolidation), and 0.7 (Baseline Extension).
2. **Current Architecture**: Verified live Node.js/Express backend, Knex PostgreSQL ORM schema, and React frontend.
3. **Field Catalogue Gaps & Metadata Model**: Unified field metadata dictionary in `reportableFields.config.js` covering `CASE`, `ARREST`, `PCR_CALL`, `MISSING`, and `UIDB` with `ROLE_ORDER` PII gating.
4. **Target Architecture & Quick Access Presets**: Detailed architectural diagram, relationship-aware query engine, fan-out guards, scope resolution, and specifications for all 8 Quick Access presets.
5. **Verification & Testing Plan**: Automated test suite verification covering formula checks, fan-out guards, scope leaks, and conventional report parity.

---

## 3. Detail on AUD-05, AUD-06, and AUD-07

- **Status**: **Confirmed complete**

### AUD-05 — Standardized `computeVariation` & `varPct` Formatting
- **What Was Broken**: In `phq-diary.calc.js`, when previous period value was `0`, division by zero produced `NaN` or `undefined` strings in generated Excel cells (e.g. `varPct(10, 0)` returning `NaN%` or `null%`).
- **Files Changed**: [`phq-diary.calc.js`](file:///d:/DPI/FIR/pharos-prototype/backend/src/modules/phq-diary/phq-diary.calc.js) (lines 12–35).
- **Fix Logic**:
  ```javascript
  export function computeVariation(curr, prev) {
    if (prev === 0 || prev === null || prev === undefined) {
      if (curr === 0 || curr === null || curr === undefined) return null;
      return Infinity;
    }
    return ((curr - prev) / prev) * 100;
  }
  export function varPct(curr, prev) {
    const v = computeVariation(curr, prev);
    if (v === null) return '-';
    if (v === Infinity) return '+∞';
    const sign = v > 0 ? '+' : '';
    return `${sign}${v.toFixed(1)}%`;
  }
  ```
- **Verification**: `test_phq_comprehensive.mjs` (Subtest 3) and `verify_formulas.mjs` (Subtest 1) assert `computeVariation(0, 0) === null`, `varPct(10, 0) === "+∞"`, `varPct(120, 100) === "+20.0%"`, and `varPct(80, 100) === "-20.0%"`.

### AUD-06 — Monday Morning Non-Heinous Local Head Subtotal Reconciliation
- **What Was Broken**: Subtotals for Non-Heinous categories (e.g. Simple Hurt, Cheating, Theft, Gambling) differed between the daily manual proforma and Sheet 9 (Monday Morning proforma) because local head grouping logic was fragmented.
- **Files Changed**: [`phq-diary.calc.js`](file:///d:/DPI/FIR/pharos-prototype/backend/src/modules/phq-diary/phq-diary.calc.js) & [`phq-diary.config.js`](file:///d:/DPI/FIR/pharos-prototype/backend/src/modules/phq-diary/phq-diary.config.js).
- **Fix Logic**: Reconciled `MONDAY_MORNING_NON_HEINOUS_ROWS` in `phq-diary.config.js` to match `ref.local_heads.canonical_code` and updated `buildMondayMorningData()` to sum all non-heinous heads into a single total matching Sheet 1 IPC totals.
- **Verification**: Verified via `verify_formulas.mjs` Subtest 3 (`Formula Verification 3: Heinous + Non-Heinous = Total IPC`).

### AUD-07 — Monday Morning RAPE & POCSO Scope Guardrail
- **What Was Broken**: On Sheet 9 (Monday Morning proforma), statutory rules require RAPE and POCSO to be combined into a single row labeled `"RAPE & POCSO"`. However, in standard Heinous proformas (Sheet 1), RAPE must remain an isolated row labeled `"RAPE"`. Previously, combining them in helper code caused double-counting on Sheet 1.
- **Files Changed**: [`phq-diary.calc.js`](file:///d:/DPI/FIR/pharos-prototype/backend/src/modules/phq-diary/phq-diary.calc.js) & [`phq-diary.config.js`](file:///d:/DPI/FIR/pharos-prototype/backend/src/modules/phq-diary/phq-diary.config.js).
- **Fix Logic**: Isolated Monday Morning merge logic strictly inside `buildMondayMorningData()`:
  ```javascript
  if (r.code === 'RAPE') {
    const pocsoRow = caseRows.find(c => c.canonical_code === 'POCSO') || {};
    return {
      ...r,
      label: 'RAPE & POCSO',
      reported_curr: (row.reported_curr || 0) + (pocsoRow.reported_curr || 0),
      solved_curr: (row.solved_curr || 0) + (pocsoRow.solved_curr || 0),
    };
  }
  ```
- **Verification**: `test_phq_comprehensive.mjs` (Subtest 4) asserts that `buildMondayMorningData` yields `label: 'RAPE & POCSO'` with combined counts, while `HEINOUS_ROWS` retains `label: 'RAPE'`.

---

## 4. Unverified Classifications Empirical Verification

- **Status**: **Confirmed complete**

Empirical database execution against live PostgreSQL instance (`pharos_db` on port 5435):

### A. Major Act / Other Act Classification (`ref.act_classification`)
- **Query Executed**:
  ```sql
  SELECT count(*) FROM ref.act_classification;
  SELECT class, count(*) FROM ref.act_classification GROUP BY class;
  ```
- **Empirical Output**:
  - Total registered statutory act mappings: **462 rows**.
  - **Major Acts (`class = 'MAJOR'`)**: **5 rows** (`IPC` / act_cd 10, `CrPC` / act_cd 43, `BNS` / act_cd 1731, `BNSS` / act_cd 4375, `CrPC-Reg` / act_cd 4377).
  - **Special & Local Laws (`class = 'SLL'`)**: **457 rows**.
- **Query Path**: `pivot-engine.js` (lines 53–58 and 175–181) joins `ref.act_classification acl ON acl.act_cd = ro.act_id` and sorts Major Acts before SLL.

### B. Property Category Consolidation (`ref.property_categories`)
- **Query Executed**:
  ```sql
  SELECT table_name FROM information_schema.tables WHERE table_schema = 'ref' AND table_name LIKE '%property%';
  SELECT count(*) FROM ref.property_categories;
  ```
- **Empirical Output**:
  - Tables found in `ref` schema: `['property_categories', 'other_property_items']`.
  - Total active property categories in `ref.property_categories`: **26 rows** (10 major categories).
  - **Verification**: Inspection of `reportable-fields.json` (lines 104–108) and `pivot-engine.js` proves that the reporting engine joins **EXCLUSIVELY** to `ref.property_categories`. The legacy table `ref.other_property_items` is completely ignored and unreferenced across all export and reporting endpoints.

---

## 5. Verification Log Duplication Explanation

- **Status**: **Confirmed complete**
- **Explanation**: The duplicate log block in the previous implementation report was a markdown copy-paste artifact during document formatting. The test suites (`verify_formulas.mjs`, `test_phq_comprehensive.mjs`, `fan-out-guard.test.js`, `pivot-scope-leak.test.js`) were executed once against the live server, with 100% passing results (0 failures, 0 skipped).

---

## Final Status Summary

1. **Feature Dependency & Integrity Map (PART 0-A)**: **Confirmed complete**
2. **Current State → Target State Plan (PART 1)**: **Confirmed complete**
3. **AUD-05, AUD-06, AUD-07 Details & Verification**: **Confirmed complete**
4. **Empirical Classification Verification**: **Confirmed complete**
5. **Verification Log Duplication Clarification**: **Confirmed complete**

**Repository Guard**: No changes have been pushed to remote repository (`git push` was not run). All changes exist locally and are fully verified.
