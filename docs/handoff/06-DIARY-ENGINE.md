# PHAROS — Diary & Report Engine Documentation
**Version:** 1.0 | **Date:** 2026-08-18 | **Audience:** Engineers building or maintaining diary reports

---

## 1. Overview

PHAROS generates four types of statistical reports:

| Diary Type | Level | Format | Sheets | Frequency | Primary Generator |
|---|---|---|---|---|---|
| FN Diary (Fortnightly) | Per PS | XLSX | 41 STAT sheets | Every fortnight | Node.js `phq-diary` module + ExcelJS |
| PHQ Diary | Per district (compiled) | XLSX | 9 sheets | On demand | Node.js `phq-diary` module + ExcelJS |
| District Diary | Per PS / district | XLSX | Multiple listing sheets | On demand | Node.js `daily-diary` module |
| Daily Diary | Per PS | XLSX | 29 listing sheets | Daily | Python worker (openpyxl) |

---

## 2. Architecture

### 2.1 FN Diary (Fortnightly Diary)

```
GET /api/phq-diary/generate?ps_id=...&from_date=...&to_date=...
  │
  ├── phq-diary.controller.js
  │     └── generateDiary(ps_id, from_date, to_date)
  │           │
  │           ├── Load pre-formatted XLSX template (ExcelJS)
  │           │   Location: backend/src/modules/report-engine/fn/templates/FN_Diary_Template.xlsx
  │           │
  │           ├── For each of 41 STAT renderers:
  │           │   Location: backend/src/modules/report-engine/fn/renderers/stat-NN-*.js
  │           │   renderer(db, { ps_id, from_date, to_date }) → { cells: { 'B5': 12 } }
  │           │
  │           ├── ExcelJS: inject computed values into template cells
  │           │
  │           └── Stream XLSX buffer as HTTP response
```

**Template**: Pre-formatted with merged cells, borders, headers, and formula groups. The renderer only writes values into specific named cells — it never modifies the template structure.

**Cell injection**: Each renderer returns a `cells` object mapping cell addresses (e.g. `'C12'`) to computed values. ExcelJS then writes these values without touching surrounding cells.

### 2.2 PHQ Diary

Same Node.js architecture as FN Diary but:
- Aggregates across multiple PS nodes within a district
- 9 sheets covering: Manual FIR summary, Monday Morning (crime overview), arrest categories, narcotics, women/children, missing persons, court data
- Date windows: Daily, Fortnight, Year-to-date, Comparative (Y-1, Y-2)

### 2.3 Daily Diary (Python Worker)

```
POST /reports/generate (with type=daily_diary)
  │
  ├── reportsController → publishEvent('report.requested', { type, params })
  │     │
  │     └── RabbitMQ → python_worker/main.py
  │           └── generator.py → for each of 29 sheets:
  │                 └── sheets/sheet_NN_*.py → SQLAlchemy query → DataFrame
  │                 └── openpyxl: write to template XLSX
  │           └── Output: REPORTS_DIR/<job_id>.xlsx
  │
  └── GET /reports/status/:id → { status: 'READY', download_url: '...' }
```

---

## 3. Formula Core

The diary formula specification defines the vocabulary used across all sheets.

### 3.1 Canonical Codes (H-type: Head Slicing)

Every crime head in the diary is identified by a `canonical_code` — a stable business logic key on `ref.local_heads.canonical_code`. This is distinct from the DB primary key (`local_head_cd`).

| Canonical Code | Crime Head | Category |
|---|---|---|
| `DACOITY` | Dacoity | HEINOUS |
| `MURDER` | Murder | HEINOUS |
| `ATT_TO_MURDER` | Attempt to Murder | HEINOUS |
| `ROBBERY` | Robbery | HEINOUS |
| `RIOT` | Riot | HEINOUS |
| `KID_FOR_RANSOM` | Kidnapping for Ransom | HEINOUS |
| `RAPE` | Rape | HEINOUS |
| `EXTORTION` | Extortion | NON_HEINOUS |
| `SNATCHING` | Snatching | NON_HEINOUS |
| `HURT` | Hurt (Simple + Grievous) | NON_HEINOUS |
| `BURGLARY` | Burglary | NON_HEINOUS |
| `HOUSE_THEFT` | House Theft | NON_HEINOUS |
| `MV_THEFT` | Motor Vehicle Theft | NON_HEINOUS |
| `OTHER_THEFT` | Other Theft | NON_HEINOUS |
| `MO_WOMEN` | Modesty of Women | NON_HEINOUS |
| `KIDNAPPING` | Kidnapping | NON_HEINOUS |
| `ABDUCTION` | Abduction | NON_HEINOUS |
| `FATAL_ACCIDENT` | Fatal Accident | NON_HEINOUS |
| `SIMPLE_ACCIDENT` | Simple Accident | NON_HEINOUS |
| `OTHER_IPC` / `OTHER_BNS` | Other IPC / Other BNS | NON_HEINOUS |
| `ARMS_ACT` | Arms Act offences | OTHER (LSL) |
| `EXCISE_ACT` | Excise Act offences | OTHER (LSL) |
| `NDPS_ACT` | NDPS Act offences | OTHER (LSL) |
| `GAMBLING_ACT` | Gambling Act offences | OTHER (LSL) |
| `POCSO` | POCSO offences | OTHER (LSL) |
| `OTHER_ACT` | Other Local & Special Laws | OTHER (LSL) |

**Coverage (as of August 2026)**: 58 of 156 local heads have `canonical_code` mapped (37%). The 58 mapped heads cover all major PHQ diary categories. Remaining unmapped heads are station-specific sub-categories that do not appear in standard PHQ reporting.

### 3.2 Date Windows

The diary uses standardised date windows:

| Window | Identifier | Definition | Used For |
|---|---|---|---|
| Current Day | `D` | `registration_date = :day` | PHQ daily column |
| Previous Day | `D-1` | `registration_date = :day - 1` | PHQ comparison column |
| Current Fortnight | `W-FN` | `registration_date BETWEEN fn_from AND fn_to` | FN Diary primary |
| Previous Fortnight | `W-FN-PREV` | `registration_date BETWEEN fn_prev_from AND fn_prev_to` | FN comparison |
| Corresponding Fortnight (last year) | `W-FN-CORR` | Same fortnight dates, prior year | FN year-on-year |
| Year to Date (current) | `W-UPTO` | `registration_date BETWEEN Jan 1 AND fn_to` | Cumulative |
| Year to Date (Y-1) | `W-UPTO-1` | Same range, prior year | Cumulative comparison |
| Year to Date (Y-2) | `W-UPTO-2` | Same range, 2 years ago | Baseline fallback |
| Current Week | `W-WEEK` | Last 7 days | PHQ weekly column |

**Date authority**: `records.registration_date` is the SOLE authoritative date field for all diary window calculations. `record_date` (the date of the event) is not used for diary aggregation.

### 3.3 Measures

Core measures used across all sheets:

| Measure | Code | SQL |
|---|---|---|
| Case count (registered) | M-REG | `COUNT(*) WHERE record_type='CASE'` |
| Cases worked out (solved) | M-WO | `COUNT(*) WHERE is_worked_out = true` |
| Detection % | M-DET% | `(M-WO / M-REG) * 100` |
| Variation % | M-VAR% | `((curr - prev) / prev) * 100` |
| Arrest count | M-ARR | `COUNT(*) WHERE record_type='ARREST'` |
| FIR arrest count | M-ARR-FIR | `COUNT(*) WHERE is_dd_based = false` |
| Kalandra arrest count | M-ARR-KAL | `COUNT(*) WHERE is_dd_based = true` |
| Person arrested count | M-ARR-PERS | Distinct persons in arrest records |
| Chargesheeted count | M-CS | Cases with `case_status` in chargesheet vocabulary |
| Transfer count (PS) | M-TR-PS | Cases with `transfer_to_type = 'PS'` |
| Transfer count (Agency) | M-TR-AGY | Cases with `transfer_to_type = 'Agency'` |
| SC/ST victim count | M-SCST | Cases with victims of SC/ST `social_category` |
| North-East resident count | M-NE | Cases where victim `perm_location_id` state is NE state |
| Court-directed count | M-COURT-DIR | Cases with `registered_on_direction = true` |

### 3.4 Aggregation Rules

- **TOTAL HEINOUS**: Sum of `DACOITY + MURDER + ATT_TO_MURDER + ROBBERY + RIOT + KID_FOR_RANSOM + RAPE`
- **TOTAL NON HEINOUS**: Sum of all NON_HEINOUS canonical codes
- **TOTAL BNS / TOTAL IPC**: `TOTAL HEINOUS + TOTAL NON HEINOUS` (label depends on period: IPC for pre-July 2024, BNS for post)
- **TOTAL ACT**: Sum of all LSL canonical codes
- **GRAND TOTAL**: `TOTAL BNS + TOTAL ACT`

### 3.5 Variation Calculation

```javascript
function computeVariation(curr, prev) {
  const c = Number(curr) || 0;
  const p = Number(prev) || 0;
  if (c === 0 && p === 0) return null;   // Renders as '–'
  if (p === 0) return Infinity;           // Renders as '+∞'
  return ((c - p) / p) * 100;            // Returns 12.5 for +12.5%
}
```

Cell write format: `(v >= 0 ? '+' : '') + v.toFixed(1) + '%'` — do NOT multiply by 100 again.

---

## 4. STAT Sheet Status (All 41 Sheets)

| Sheet | Title | Status | Notes |
|---|---|---|---|
| STAT_01 | Crime Overview by Head | ✅ Live | Uses canonical codes; requires 58 mapped heads |
| STAT_02 | Worked-Out Cases | ✅ Live | `is_worked_out = true` filter |
| STAT_03 | E-FIR Cases | ✅ Live | `case_type = 'E_FIR'` filter |
| STAT_04 | E-Burglary | ✅ Live | Burglary via electronic complaint |
| STAT_05 | MVT Cases | ✅ Live | Motor Vehicle Theft |
| STAT_06 | Accidents | ⚠️ Partial | Fatal/non-fatal counts; injury detail blocked (B4) |
| STAT_07 | Heinous Overview | ✅ Live | Subset of STAT_01 |
| STAT_08 | Case Status Summary | ✅ Live | Case status vocabulary |
| STAT_09 | Missing Persons | ✅ Live | From `missing_details` |
| STAT_10 | UIDB | ✅ Live | From `uidb_details` |
| STAT_11 | PCR Calls | ✅ Live | From `pcr_call_details` |
| STAT_12 | Organised Crime | ✅ Live | Uses `ORGANISED_CRIME` section group |
| STAT_13 | Women Crimes (Section-wise) | ✅ Live | Section group filter |
| STAT_14 | Preventive Actions | ✅ Live | Kalandra + BC/HS arrests |
| STAT_15 | Proclaimed Offenders | ❌ Blocked (B6) | PO register not built |
| STAT_16 | Property Recovered | ✅ Live | From `record_properties` |
| STAT_17 | Arms Seized | ✅ Live | Arms type filter |
| STAT_18 | Vehicles Seized | ✅ Live | `MV_THEFT` canonical code + seized flag |
| STAT_19 | Narcotics Seized | ✅ Live | Drug type breakdown |
| STAT_20 | PCR Response Time | ✅ Live | PCR time-to-arrive |
| STAT_21 | Kalandras | ✅ Live | `is_dd_based = true` count |
| STAT_22 | Senior Citizens Crime | ✅ Live | `age >= 60` filter on victims |
| STAT_23 | SC/ST Act | ✅ Live | Section group + social category |
| STAT_24 | Domestic Violence | ✅ Live | Section group filter |
| STAT_25 | Inquest (UIDB) | ✅ Live | From `uidb_details` |
| STAT_26 | Child Crime | ✅ Live | `age < 18` on victims |
| STAT_27 | Women Missing | ✅ Live | `gender = 'FEMALE'` + `MISSING` type |
| STAT_28 | Children Missing | ✅ Live | `is_minor = true` + `MISSING` type |
| STAT_29 | Women Crimes Overview | ✅ Live | Combined women-related heads |
| STAT_30 | Zero FIR & Transfers | ✅ Live | `case_type = 'ZERO_FIR'` + transfer columns |
| STAT_31 | North-East Residents Crime | ✅ Live | Location state filter (NE states) |
| STAT_32 | Court-Directed Registration | ✅ Live | `registered_on_direction = true` |
| STAT_33 | Investigation Report | ✅ Live | Chargesheet types breakdown |
| STAT_34 | Daily Manpower / DP Act | ❌ Blocked (B7) | Daily manpower returns not built |
| STAT_35 | DP Act Preventive | ✅ Live | Delhi Police Act preventive sections |
| STAT_36 | Burglary Detail | ✅ Live | MO breakdown for burglary |
| STAT_37 | Juvenile Offenders | ✅ Live | `is_minor = true` on accused |
| STAT_38 | BNS Cases Without Arrest | ✅ Live | Chargesheeted with no arrest record |
| STAT_39 | L&SL Cases Without Arrest | ✅ Live | L&SL chargesheeted without arrest |
| STAT_40 | BNS Court Disposals | ⚠️ Partial | Court fields in `fir_details`; full court module blocked (B5) |
| STAT_41 | L&SL Court Disposals | ⚠️ Partial | Same as STAT_40 |

---

## 5. Canonical Code System

### Purpose
`canonical_code` is the stable business identifier used by diary renderers to aggregate counts. The DB primary key (`local_head_cd`) is the relational join key used in SQL; `canonical_code` is the aggregation grouping key used in renderer logic.

### How to Add a Canonical Code Mapping
1. Find the `local_head_cd` integer for the head in `ref.local_heads` (or query: `SELECT local_head_cd, local_head FROM ref.local_heads WHERE canonical_code IS NULL`)
2. Create a migration: `backend/migrations/YYYYMMDD_canonical_codes.js`
3. Add: `UPDATE ref.local_heads SET canonical_code = 'YOUR_CODE' WHERE local_head_cd = NNN AND canonical_code IS NULL`
4. Verify: `SELECT local_head_cd, local_head, canonical_code FROM ref.local_heads ORDER BY local_head_cd`

---

## 6. Section Groups

Named groupings of BNS/IPC sections used to filter records for specific sheet rows. Defined in:

**File**: `backend/config/sections/section-groups.json`

| Group Name | Usage |
|---|---|
| `HURT_SIMPLE` | Simple hurt offences |
| `HURT_GRIEVOUS` | Grievous hurt offences |
| `RAPE_ALL` | All rape-related sections |
| `GANG_RAPE` | Gang rape sections |
| `POCSO_PENETRATIVE` | POCSO penetrative assault |
| `POCSO_ASSAULT` | POCSO sexual assault |
| `POCSO_HARASSMENT` | POCSO sexual harassment |
| `POCSO_OTHER` | Other POCSO offences |
| `ORGANISED_CRIME` | MCOCA / UAPA organised crime |
| `TERROR` | Terror-related sections |
| `MO_WOMEN_ALL` | All modesty of women sections |
| `DOWRY_MISUSE` | Dowry harassment / 498A |
| `ACID_ATTACK` | Acid attack sections |
| `ACID_ATTEMPT` | Acid attack attempt sections |
| `TRAFFICKING` | Trafficking offences |
| `SC_ST_ACT` | SC/ST Prevention of Atrocities Act sections |
| `JUVENILE_JUSTICE` | JJ Act sections |

To add a new group: add a JSON object to `section-groups.json` with `{ "name": "GROUP_NAME", "sections": ["section_code_1", ...] }`, then run `npm run sync-config`.

---

## 7. Case Status Map

Maps raw database `case_status` values to diary categories. Defined in:

**File**: `backend/config/diary/case-status-map.json`

| Diary Category | DB Values Matched |
|---|---|
| `challan` | `CHALLAN`, `CHARGESHEETED`, `CHARGE SHEET`, `POLICE INVESTIGATION REPORT(PIR-JCL)`, `PIR-JCL` |
| `cancelled` | `CANCELLED`, `CANCELLATION`, `CLOSURE`, `UNFOUNDED`, `FALSE` |
| `untraced` | `UNTRACED`, `UNTRACED_REPORT` |
| `pending` | `PENDING_INVESTIGATION`, `UNDER_INVESTIGATION`, `PENDING`, `UNDER INVESTIGATION` |

---

## 8. Blocked Sheets

| Blocker | Sheets Affected | What Would Unblock |
|---|---|---|
| **B4** — Missing injury detail | STAT_06 | Add `injury_type` tracking in inquest form |
| **B5** — Court module | STAT_40, STAT_41 (partial) | Build `court_cases` table; NJDG integration |
| **B6** — PO register | STAT_15 | Build `proclaimed_offenders_register` table |
| **B7** — Manpower returns | STAT_34 | Build `daily_returns` table and daily form |

---

## 9. How to Add a New Diary Sheet

1. **Create renderer**: `backend/src/modules/report-engine/fn/renderers/stat-NN-your-sheet.js`
   - Export `async function render(db, params)` returning `{ cells: { 'A1': value, ... } }`
   - Use `diaryCount(db, params)` or `diaryList(db, params)` from `diary-query-builder.js`

2. **Register renderer**: Add entry to `backend/src/modules/report-engine/fn/fn-diary.config.js`

3. **Verify output**: Call `GET /api/phq-diary/generate?...` and inspect the sheet in Excel

4. **Write a smoke test**: Verify a known value with a direct SQL query against the same period

---

## 10. Query Builder Reference

**File**: `backend/src/modules/report-engine/shared/diary-query-builder.js`

| Export | Purpose |
|---|---|
| `diaryCount(db, params)` | Main aggregation: count cases by canonical head across date windows |
| `diaryList(db, params)` | Listing: returns individual record rows (for listing sheets) |
| `diaryKalandraCount(db, params)` | Kalandra-specific: counts DD-based arrests |
| `diaryTransferCount(db, params)` | Transfer counts: PS transfers + agency transfers |
| `diaryNorthEastCount(db, params)` | NE-resident crime: location state filter |
| `diaryCourtCount(db, params)` | Court-related: opening, sent-to-court, disposals |

**Standard params object:**
```javascript
{
  ps_id: uuid,
  from_date: 'YYYY-MM-DD',  // Start of fortnight
  to_date: 'YYYY-MM-DD',    // End of fortnight
  district_id: uuid,        // Optional; for district-level aggregation
}
```
