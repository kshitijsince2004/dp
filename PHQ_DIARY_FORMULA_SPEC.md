# Technical Specification & Data Dictionary: Data-Fetch & Formula Architecture for PHQ Daily Crime Diary

## Revision Changelog (Patch Pass)

The following 16 items have been addressed across Patch Pass 1, Patch Pass 2, & Patch Pass 3:

| # | Patch Item | Summary of Change |
|---|---|---|
| **1** | **Sheet 9 Specification** | Added Section 3.6 detailing `Variation% (mvt) 2017` (multi-year comparative matrix across crime heads with variation %). |
| **2** | **Citation Fixes** | Updated Refine vs Rebuild table: Date Authority cited as **Fix Plan Open Question 1**; RAPE & POCSO cited as **Fix Plan Open Question 2**. Noted that real AUD-06 (frontend template code default) belongs in UI fix. |
| **3** | **Strict Date Rule** | Enforced `records.registration_date` alone as date authority. Documented `registration_date IS NULL` as a data-quality exception in Section 4. |
| **4** | **`Upto_Date` vs `DISTRICTS` Evidence** | Provided code evidence from `phq-diary.config.js` and `phq_uptodate_matrix.json`: `Upto_Date` uses `UPTODATE_DISTRICTS` (23 columns, 3-year window), while `DISTRICTS` uses `TWO_YEAR_DISTRICTS` (18 districts + `OTHERS`, 2-year window) linked to template code `PHQ_UPTODATE_MATRIX`. |
| **5** | **6 Narcotics Recovery Rows** | Expanded collapsed NDPS block in Section 3.1 into 6 distinct rows: `SMACK / HEROIN`, `COCAINE`, `CHARAS`, `OPIUM`, `GANJA`, `POPPY HEAD`. |
| **6** | **5 Arrest Category Rows** | Expanded collapsed Arrest block in Section 3.1 into 5 distinct categories: `DACOITS`, `ROBBERS`, `SNATCHERS`, `BURGLARS`, `AUTO LIFTERS` using `records` (`ARREST`) joined to `arrest_details`. |
| **7** | **Complete `Monday_Morning` Merged Row** | Expanded `RAPE & POCSO` merged row in Section 3.2 to include all 6 columns (`Reported Y-1`, `Reported Y`, `Variation`, `Solved Y-1`, `Solved Y`, `% Solved Y-1`, `% Solved Y`). Confirmed POCSO disposal uses `fir_details.is_worked_out` on same `records` spine table. |
| **8** | **Join Key vs Output Key** | Added explicit clarification in Section 1.1: `ref.local_heads.local_head_cd` (INTEGER) is the primary relational FK join key, while `canonical_code` (VARCHAR) is the standardized business logic key. |
| **9** | **Variation Scaling Confirmation** | Confirmed in Section 2.4 that `computeVariation` returns percentage numbers (e.g. `12.5`), and `phq-diary.excel.js` formats strings directly without double-multiplying by 100. |
| **10** | **`STAT_BASELINE_CODE_MAP` Table** | Included full mapping table contents for historical baseline code translation in Section 1.3. |
| **11** | **Pass 2: Ground Arrest Categories** | Grounded all 5 arrest category rows in Section 3.1 to exact `local_head_cd` sets from `Menu_Tables.xlsx`: `DACOITS` (`1` only), `ROBBERS` (`4`), `SNATCHERS` (`9`), `BURGLARS` (`12, 13, 209, 210` covering all Burglary variants), `AUTO LIFTERS` (`16` only). |
| **12** | **Pass 2: Ground Narcotics Rows** | Replaced free-text regex with exact `drug_type_cd` codes from `DRUGS NARCOTIC` sheet: `SMACK / HEROIN` (`404, 415`), `COCAINE` (`396`), `CHARAS` (`395`), `GANJA` (`401` base match), `OPIUM` (`409` base match), `POPPY HEAD` (marked **BLOCKED** pending owner selection). |
| **13** | **Pass 2: `ACT_CODE_MAP` Table** | Added Section 1.4 defining multi-act mapping lists for `ARMS_ACT` (`4, 2158, 9994`), `NDPS_ACT` (`48, 51`), `GAMBLING_ACT` (`68, 2583, 2612`), `EXCISE_ACT` (`206, 3032, 3270`), `POCSO` (`3039, 9993`), `OTHER_ACT` (catch-all). |
| **14** | **Pass 2: Out-of-Jurisdiction Exclusions** | Explicitly excluded `507` (Maharashtra Prevention of Gambling Act) and `438` (Punjab Excise Act) from report queries, flagging their presence in reference tables as data-quality notes. |
| **15** | **Pass 2: Duplicate Major Head Flag** | Flagged duplicate `HURT` entries (`major_head_code` `31` and `148` in `major head` sheet) in Open Questions for report owner resolution. |
| **16** | **Pass 3: BNS/IPC Terminology & Catch-Alls** | Updated the formula spec to conditional period-aware labeling and catch-all summing rules for the Indian Penal Code (IPC) $\rightarrow$ Bharatiya Nyaya Sanhita (BNS) transition on 1 July 2024. |

---

## Refine vs. Rebuild Decisions (Ground Rule Compliance)

| Component | Citation | Decision | Rationale |
|---|---|---|---|
| **Crime Head Mapping** | AUD-03 (`ref.local_heads` drift) | **Refine in Place** | Added `ref.local_heads.canonical_code` column via Knex migration `20260722000001`. Mapped all 156 local heads to standardized canonical keys without replacing the lookup table. |
| **Date Authority** | Fix Plan Open Question 1 | **Refine in Place** | Added `records.registration_date` and enforced `registration_date` alone as date authority across all SQL window queries. |
| **Report Routing** | AUD-01 (Template UUID routing failure) | **Refine in Place** | Resolved template UUIDs against `report_templates` DB table to extract `code` / `template_type` before dispatching to Node.js `generatePHQDiary()` service. |
| **Variation % Calculation Engine** | AUD-05 (Formatted string vs raw float confusion) | **Rebuild** | Standardized `computeVariation(curr, prev)` in `phq-diary.calc.js` to return raw floats, `null` (for 0/0), or `Infinity` (for $P=0, C>0$). Deferred formatted percentage string generation (`+12.5%`, `0.0%`, `-5.2%`, `+∞`, `-`) exclusively to `phq-diary.excel.js` at cell write time. |
| **Multi-Year Baseline Read-Through** | AUD-04 (Broken historical baseline fallback) | **Refine in Place** | Implemented per-year data availability check in `phq-diary.data.js`: if raw imported FIR records exist for a year, recompute directly from `records`; if raw records are absent, fall back to `stat_baselines` via `STAT_BASELINE_CODE_MAP`. |
| **RAPE & POCSO Scope Guardrail** | Fix Plan Open Question 2 *(Note: Real AUD-06 frontend default bug belongs in UI fix)* | **Refine in Place** | Enforced that `RAPE` and `POCSO` are merged into `"RAPE & POCSO"` **exclusively** on Sheet 9 (`Monday_Morning`). Preserved `RAPE` under IPC Heinous and `POCSO ACT` under Local & Special Laws on all other 8 sheets. |

---

## Section 1: Canonical Code & Schema Bindings

### 1.1 Source of Truth & Relational Keys
- **Crime Heads**: `ref.local_heads.canonical_code` (VARCHAR) is the single authoritative business logic key. Display text strings in `PHQ_Diary.xls` (e.g., `TOTAL  HENIOUS`, `M.O.WOMEN`, `M V THEFT`) are display labels only and must never be used in query matching logic.
- **Relational Key vs Output Key Clarification**: `ref.local_heads.local_head_cd` (INTEGER) is the stable primary key and foreign key stored in `fir_details.local_head_id` and `arrest_details.local_head_id` used for database join performance. `canonical_code` is the standardized string key used for aggregation grouping, output labeling, and business rule classification. They represent two attributes of the same lookup entity (`ref.local_heads`).
- **Districts & Units**: `hierarchy_nodes.code` where `node_type = 'DISTRICT'` (23 active nodes: 15 territorial + 8 specialized units).
- **Date Authority**: `records.registration_date` (DATE) is the single authoritative timestamp for all window calculations (YTD, Fortnight, Single Day, Week).
- **BNS Transition & Terminology (Effective 1 July 2024)**: Any prose or labels referring to 'IPC heads' generically should note that BNS-era naming applies from 1 July 2024 onward. For reporting periods on or after this date, the labels `TOTAL IPC` and `OTHER IPC` are dynamically updated to `TOTAL BNS` and `OTHER BNS` respectively.

### 1.2 Master Canonical Crime Head Mapping

| Legacy Display Label (`PHQ_Diary.xls`) | `canonical_code` | Category | Block Assignment |
|---|---|---|---|
| `DACOITY` | `DACOITY` | `HEINOUS` | Heinous Row 1 |
| `MURDER` | `MURDER` | `HEINOUS` | Heinous Row 2 |
| `ATT TO MURDER` / `ATT. TO MURDER` | `ATT_TO_MURDER` | `HEINOUS` | Heinous Row 3 |
| `ROBBERY` | `ROBBERY` | `HEINOUS` | Heinous Row 4 |
| `RIOT` | `RIOT` | `HEINOUS` | Heinous Row 5 |
| `KID FOR RANSOM` | `KID_FOR_RANSOM` | `HEINOUS` | Heinous Row 6 |
| `RAPE` | `RAPE` | `HEINOUS` | Heinous Row 7 |
| `EXTORTION` | `EXTORTION` | `NON_HEINOUS` | Non-Heinous Row 1 |
| `SNATCHING` | `SNATCHING` | `NON_HEINOUS` | Non-Heinous Row 2 |
| `HURT` | `HURT` | `NON_HEINOUS` | Non-Heinous Row 3 |
| `BURGLARY` | `BURGLARY` | `NON_HEINOUS` | Non-Heinous Row 4 |
| `HOUSE THEFT` | `HOUSE_THEFT` | `NON_HEINOUS` | Non-Heinous Row 5 |
| `M V THEFT` / `M.V. THEFT` | `MV_THEFT` | `NON_HEINOUS` | Non-Heinous Row 6 |
| `OTHER THEFT` | `OTHER_THEFT` | `NON_HEINOUS` | Non-Heinous Row 7 |
| `M O WOMEN` / `M.O.WOMEN` | `MO_WOMEN` | `NON_HEINOUS` | Non-Heinous Row 8 |
| `KIDNAPPING` | `KIDNAPPING` | `NON_HEINOUS` | Non-Heinous Row 9 |
| `ABDUCTION` | `ABDUCTION` | `NON_HEINOUS` | Non-Heinous Row 10 |
| `FATAL ACCIDENT` | `FATAL_ACCIDENT` | `NON_HEINOUS` | Non-Heinous Row 11 |
| `SIMPLE ACCIDENT` | `SIMPLE_ACCIDENT` | `NON_HEINOUS` | Non-Heinous Row 12 |
| `OTHER IPC` / `OTHER BNS` | `OTHER_IPC` / `OTHER_BNS` | `NON_HEINOUS` | Catch-All Non-Heinous. pre-transition (before 1 July 2024) uses `OTHER IPC` (counts `local_head_cd = 99`); post-transition (on/after 1 July 2024) uses `OTHER BNS` (counts `local_head_cd = 215`). Straddling windows sum both codes. |
| `ARMS ACT` | `ARMS_ACT` | `OTHER` (LSL) | Local & Special Laws Row 1 |
| `EXCISE ACT` | `EXCISE_ACT` | `OTHER` (LSL) | Local & Special Laws Row 2 |
| `NDPS ACT` | `NDPS_ACT` | `OTHER` (LSL) | Local & Special Laws Row 3 |
| `GAMBLING ACT` | `GAMBLING_ACT` | `OTHER` (LSL) | Local & Special Laws Row 4 |
| `POCSO ACT` / `POCSO` | `POCSO` | `OTHER` (LSL) | Local & Special Laws Row 5 |
| `OTHER ACT` | `OTHER_ACT` | `OTHER` (LSL) | Catch-All LSL |

### 1.3 Historical Baseline Code Mapping Table (`STAT_BASELINE_CODE_MAP`)

| `stat_baselines.head_code` | `canonical_code` | Canonical Name |
|---|---|---|
| `ATTEMPT_TO_MURDER` | `ATT_TO_MURDER` | Attempt to Murder |
| `MOTOR_VEHICLE_THEFT` | `MV_THEFT` | Motor Vehicle Theft |
| `BURGLARY` | `BURGLARY` | Burglary |
| `DOWRY_DEATH` | `OTHER_IPC` | Dowry Death (mapped to Other IPC) |
| `MURDER` | `MURDER` | Murder |
| `RAPE` | `RAPE` | Rape |
| `ROBBERY` | `ROBBERY` | Robbery |

### 1.4 Act Code Mapping Table (`ACT_CODE_MAP`)

Sourced from `Menu_Tables.xlsx` (`act` sheet), mapping multiple real Act IDs (`act_cd`) per report category and enforcing explicit out-of-jurisdiction exclusions:

| Report Category | `canonical_code` | `act_cd` Membership List | Included Act Title(s) | Notes & Jurisdiction Exclusions |
|---|---|---|---|---|
| `ARMS_ACT` | `ARMS_ACT` | `4, 2158, 9994` | Arms Act 1959 (`4`), Indian Arms Act 1969 (`2158`), Arms (Amendment) Act 2019 (`9994`) | *Open Question*: Confirm whether all three count or only currently-governing act. |
| `NDPS_ACT` | `NDPS_ACT` | `48, 51` | NDPS Act 1985 (`48`), PIT NDPS Act 1988 (`51`) | Two distinct acts — *Open Question*: confirm both belong under one report row. |
| `GAMBLING_ACT` | `GAMBLING_ACT` | `68, 2583, 2612` | Public Gambling Act 1867 (`68`), Public Gambling Act 1977 (`2583`), Delhi Public Gambling Act 1955 (`2612`) | **Explicitly Excluded**: `507` (Maharashtra Prevention of Gambling Act 1887) — out-of-jurisdiction data-quality anomaly. |
| `EXCISE_ACT` | `EXCISE_ACT` | `206, 3032, 3270` | Medicinal & Toilet Prep. Excise Duties Act 1955 (`206`), Delhi Excise Act 2009 (`3032`), Delhi Excise Act 2010 (`3270`) | **Explicitly Excluded**: `438` (Punjab Excise Act 1914) — out-of-jurisdiction data-quality anomaly. |
| `POCSO` | `POCSO` | `3039, 9993` | Protection of Children from Sexual Offences Act 2012 (`3039`), POCSO Amendment Act 2019 (`9993`) | *Open Question*: Confirm both count. |
| `OTHER_ACT` | `OTHER_ACT` | Catch-All (`NOT IN (...)`) | Any active non-IPC act not explicitly assigned to above categories | Excludes unmapped/out-of-jurisdiction acts. |

---

## Section 2: Shared Formula Catalogue (Locked Infrastructure)

### 2.1 SQL Raw Count Query Template

```sql
SELECT
  r.district_id,
  fd.local_head_id,
  lh.canonical_code,
  COUNT(*) FILTER (WHERE r.registration_date = :day_curr_f) AS day_curr,
  COUNT(*) FILTER (WHERE r.registration_date = :day_prev_f) AS day_prev,
  COUNT(*) FILTER (WHERE r.registration_date BETWEEN :fn_curr_f AND :fn_curr_t) AS fn_curr,
  COUNT(*) FILTER (WHERE r.registration_date BETWEEN :fn_prev_f AND :fn_prev_t) AS fn_prev,
  COUNT(*) FILTER (WHERE r.registration_date BETWEEN :fn_corr_f AND :fn_corr_t) AS fn_corr,
  COUNT(*) FILTER (WHERE r.registration_date BETWEEN :upto_curr_f AND :upto_curr_t) AS upto_curr,
  COUNT(*) FILTER (WHERE r.registration_date BETWEEN :upto_prev_f AND :upto_prev_t) AS upto_prev,
  COUNT(*) FILTER (WHERE r.registration_date BETWEEN :upto_prev2_f AND :upto_prev2_t) AS upto_prev2,
  COUNT(*) FILTER (WHERE r.registration_date BETWEEN :week_curr_f AND :week_curr_t) AS week_curr,
  COUNT(*) FILTER (WHERE r.registration_date BETWEEN :week_prev_f AND :week_prev_t) AS week_prev,
  COUNT(*) FILTER (WHERE r.registration_date BETWEEN :upto_curr_f AND :upto_curr_t AND fd.is_worked_out = true) AS det_curr,
  COUNT(*) FILTER (WHERE r.registration_date BETWEEN :upto_prev_f AND :upto_prev_t AND fd.is_worked_out = true) AS det_prev
FROM records r
JOIN fir_details fd ON fd.record_id = r.id
JOIN ref.local_heads lh ON lh.local_head_cd = fd.local_head_id
WHERE r.record_type = 'CASE'
  AND r.current_status <> 'DELETED'
  AND r.district_id = ANY(:district_ids)
  AND r.registration_date BETWEEN :min_date AND :max_date
GROUP BY r.district_id, fd.local_head_id, lh.canonical_code;
```

### 2.2 Subtotal Aggregation Rules

- **TOTAL HEINOUS**: Sum of counts for `DACOITY, MURDER, ATT_TO_MURDER, ROBBERY, RIOT, KID_FOR_RANSOM, RAPE`.
- **TOTAL NON HEINOUS**: Sum of counts for `EXTORTION, SNATCHING, HURT, BURGLARY, HOUSE_THEFT, MV_THEFT, OTHER_THEFT, MO_WOMEN, KIDNAPPING, ABDUCTION, FATAL_ACCIDENT, SIMPLE_ACCIDENT, OTHER_IPC` (or `OTHER_BNS` for BNS-era periods).
- **TOTAL IPC / TOTAL BNS**: `TOTAL HEINOUS` + `TOTAL NON HEINOUS` (label dynamically resolved: `TOTAL IPC` for pre-transition windows entirely before 1 July 2024, `TOTAL BNS` for post-transition/straddling windows).
- **TOTAL ACT**: `ARMS_ACT` + `EXCISE_ACT` + `NDPS_ACT` + `GAMBLING_ACT` + `POCSO` + `OTHER_ACT`.
- **GRAND TOTAL**: `TOTAL IPC` / `TOTAL BNS` + `TOTAL ACT`.

### 2.3 Monday_Morning Exception Rule

On Sheet 9 (`Monday_Morning`), Heinous Row 7 displays label **`RAPE & POCSO`**. Its reported count is:

$$\text{Reported}(\text{RAPE \& POCSO}) = \text{Count}(\text{RAPE}) + \text{Count}(\text{POCSO\_ACT})$$

POCSO is included in `Monday_Morning` Heinous total calculation while remaining in `TOTAL ACT` on general sheets.

### 2.4 Variation % Math Standard & Double-Scaling Prevention

```js
function computeVariation(curr, prev) {
  const c = Number(curr) || 0;
  const p = Number(prev) || 0;
  if (c === 0 && p === 0) return null; // Renders as '-'
  if (p === 0) return Infinity;       // Renders as '+∞'
  return ((c - p) / p) * 100;
}
```

**Scaling Confirmation**: `computeVariation` returns a percentage-scaled number (e.g. `12.5` representing $+12.5\%$). `phq-diary.excel.js` `varCell` formats this value directly using string templates (`(v >= 0 ? '+' : '') + v.toFixed(1) + '%'`) without multiplying by 100 a second time. Double-scaling is explicitly prevented.

### 2.5 Detection % Math Standard

```js
function computeDetection(solved, reported) {
  const s = Number(solved) || 0;
  const r = Number(reported) || 0;
  if (r === 0) return null; // Renders as '-'
  return (s / r) * 100;
}
```

---

## Section 3: Master Data Dictionary per Sheet (All 9 Sheets)

### 3.1 Sheet 1: `MANUALY` (Master Compiled Sheet — 63×11)

| Sheet | Row Label | Canonical Code | Column Label | District Scope | Period Window | Source Table(s) | Join Keys | Filter | Aggregation | Formula | Edge Cases | Validation Query |
|---|---|---|---|---|---|---|---|---|---|---|---|---|
| `MANUALY` | `DACOITY` | `DACOITY` | `CURR. DAY` | ALL_DELHI | `D` | `records`, `fir_details` | `records.id=fir_details.record_id` | `record_type='CASE'` | `COUNT(*)` | Raw count | Returns 0 if none | `SELECT count(*) FROM records WHERE registration_date=D` |
| `MANUALY` | `DACOITY` | `DACOITY` | `PRE. DAY` | ALL_DELHI | `D-1` | `records`, `fir_details` | `records.id=fir_details.record_id` | `record_type='CASE'` | `COUNT(*)` | Raw count | Returns 0 if none | `SELECT count(*) FROM records WHERE registration_date=D-1` |
| `MANUALY` | `DACOITY` | `DACOITY` | `CURR. 15 DAYS` | ALL_DELHI | `D-14..D` | `records`, `fir_details` | `records.id=fir_details.record_id` | `record_type='CASE'` | `COUNT(*)` | Raw count | Rolling 15d | `SELECT count(*) WHERE registration_date BETWEEN D-14 AND D` |
| `MANUALY` | `DACOITY` | `DACOITY` | `PRE. 15 DAYS` | ALL_DELHI | `D-29..D-15` | `records`, `fir_details` | `records.id=fir_details.record_id` | `record_type='CASE'` | `COUNT(*)` | Raw count | Prior 15d | `SELECT count(*) WHERE registration_date BETWEEN D-29 AND D-15` |
| `MANUALY` | `DACOITY` | `DACOITY` | `CORR. 15 DAYS` | ALL_DELHI | `D_LY-14..D_LY` | `records`, `fir_details` | `records.id=fir_details.record_id` | `record_type='CASE'` | `COUNT(*)` | Raw count | Prior year 15d | `SELECT count(*) WHERE registration_date BETWEEN D_LY-14 AND D_LY` |
| `MANUALY` | `DACOITY` | `DACOITY` | `UPTODATE Y-2` | ALL_DELHI | `Jan 1 Y-2..D_LY2` | `records` / `stat_baselines` | `canonical_code` | `record_type='CASE'` | `COUNT(*)` | Recompute / Baseline | Baseline fallback if no records | `fetchHistoricalBaseline(Y-2, scope, head)` |
| `MANUALY` | `DACOITY` | `DACOITY` | `UPTODATE Y-1` | ALL_DELHI | `Jan 1 Y-1..D_LY` | `records` / `stat_baselines` | `canonical_code` | `record_type='CASE'` | `COUNT(*)` | Recompute / Baseline | Baseline fallback if no records | `fetchHistoricalBaseline(Y-1, scope, head)` |
| `MANUALY` | `DACOITY` | `DACOITY` | `UPTODATE Y` | ALL_DELHI | `Jan 1 Y..D` | `records`, `fir_details` | `records.id=fir_details.record_id` | `record_type='CASE'` | `COUNT(*)` | Raw count | YTD current year | `SELECT count(*) WHERE registration_date BETWEEN Jan 1 AND D` |
| `MANUALY` | `DACOITY` | `DACOITY` | `VARIATION% [Y/Y-2]` | ALL_DELHI | Comparative | Derived | N/A | N/A | Ratio | `computeVariation(Col9, Col7)` | `0/0->null`, `P=0->+inf` | N/A |
| `MANUALY` | `DACOITY` | `DACOITY` | `VARIATION% [Y/Y-1]` | ALL_DELHI | Comparative | Derived | N/A | N/A | Ratio | `computeVariation(Col9, Col8)` | `0/0->null`, `P=0->+inf` | N/A |
| `MANUALY` | `TOTAL HEINOUS` | `TOTAL_HEINOUS` | All Columns | ALL_DELHI | Period | Derived | N/A | Heinous Set | Sum | `SUM(DACOITY..RAPE)` | Heinous rows sum | N/A |
| `MANUALY` | `TOTAL NON HEINOUS` | `TOTAL_NON_HEINOUS` | All Columns | ALL_DELHI | Period | Derived | N/A | Non-Heinous Set | Sum | `SUM(EXTORTION..OTHER_IPC)` (or `OTHER_BNS` for BNS-era periods) | Non-heinous sum | N/A |
| `MANUALY` | `TOTAL IPC / TOTAL BNS` | `TOTAL_IPC` | All Columns | ALL_DELHI | Period | Derived | N/A | Heinous + Non-Heinous | Sum | `TOTAL_HEINOUS + TOTAL_NON_HEINOUS` | Master IPC/BNS total. Dynamically renamed based on period | N/A |
| `MANUALY` | `SMACK / HEROIN` | `SMACK_HEROIN` | All Columns | ALL_DELHI | Period | `record_properties`, `ref.units` | `rp.unit_cd=u.unit_cd` | `drug_type_id IN (404, 415)` | `SUM(quantity * to_kg_factor)` | Weight Sum (KG) | Heroin (404) & Smack (415) recovery | `SELECT SUM(quantity * to_kg_factor) WHERE drug_type_id IN (404,415)` |
| `MANUALY` | `COCAINE` | `COCAINE` | All Columns | ALL_DELHI | Period | `record_properties`, `ref.units` | `rp.unit_cd=u.unit_cd` | `drug_type_id IN (396)` | `SUM(quantity * to_kg_factor)` | Weight Sum (KG) | Cocaine (396) recovery | `SELECT SUM(quantity * to_kg_factor) WHERE drug_type_id = 396` |
| `MANUALY` | `CHARAS` | `CHARAS` | All Columns | ALL_DELHI | Period | `record_properties`, `ref.units` | `rp.unit_cd=u.unit_cd` | `drug_type_id IN (395)` | `SUM(quantity * to_kg_factor)` | Weight Sum (KG) | Charas (395) recovery | `SELECT SUM(quantity * to_kg_factor) WHERE drug_type_id = 395` |
| `MANUALY` | `OPIUM` | `OPIUM` | All Columns | ALL_DELHI | Period | `record_properties`, `ref.units` | `rp.unit_cd=u.unit_cd` | `drug_type_id IN (409)` | `SUM(quantity * to_kg_factor)` | Weight Sum (KG) | Opium (409) recovery; 410 open Q | `SELECT SUM(quantity * to_kg_factor) WHERE drug_type_id = 409` |
| `MANUALY` | `GANJA` | `GANJA` | All Columns | ALL_DELHI | Period | `record_properties`, `ref.units` | `rp.unit_cd=u.unit_cd` | `drug_type_id IN (401)` | `SUM(quantity * to_kg_factor)` | Weight Sum (KG) | Ganja (401) recovery; 394/392 open Q | `SELECT SUM(quantity * to_kg_factor) WHERE drug_type_id = 401` |
| `MANUALY` | `POPPY HEAD` | `POPPY_HEAD` | All Columns | ALL_DELHI | Period | `record_properties`, `ref.units` | `rp.unit_cd=u.unit_cd` | `BLOCKED (pending owner choice)` | `BLOCKED` | Weight Sum (KG) | Candidates: 411, 412, 413, 414 | `BLOCKED` |
| `MANUALY` | `DACOITS` | `ARR_DACOITS` | All Columns | ALL_DELHI | Period | `records`, `arrest_details` | `records.id=arrest_details.record_id` | `record_type='ARREST', local_head_id=1` | `COUNT(*)` | Accused Count | Dacoity (1) accused arrests | `SELECT COUNT(*) WHERE record_type='ARREST' AND local_head_id=1` |
| `MANUALY` | `ROBBERS` | `ARR_ROBBERS` | All Columns | ALL_DELHI | Period | `records`, `arrest_details` | `records.id=arrest_details.record_id` | `record_type='ARREST', local_head_id=4` | `COUNT(*)` | Accused Count | Robbery (4) accused arrests | `SELECT COUNT(*) WHERE record_type='ARREST' AND local_head_id=4` |
| `MANUALY` | `SNATCHERS` | `ARR_SNATCHERS` | All Columns | ALL_DELHI | Period | `records`, `arrest_details` | `records.id=arrest_details.record_id` | `record_type='ARREST', local_head_id=9` | `COUNT(*)` | Accused Count | Snatching (9) accused arrests | `SELECT COUNT(*) WHERE record_type='ARREST' AND local_head_id=9` |
| `MANUALY` | `BURGLARS` | `ARR_BURGLARS` | All Columns | ALL_DELHI | Period | `records`, `arrest_details` | `records.id=arrest_details.record_id` | `record_type='ARREST', local_head_id IN (12, 13, 209, 210)` | `COUNT(*)` | Accused Count | All Burglary variants (12, 13, 209, 210) | `SELECT COUNT(*) WHERE record_type='ARREST' AND local_head_id IN (12,13,209,210)` |
| `MANUALY` | `AUTO LIFTERS` | `ARR_AUTO_LIFTERS` | All Columns | ALL_DELHI | Period | `records`, `arrest_details` | `records.id=arrest_details.record_id` | `record_type='ARREST', local_head_id=16` | `COUNT(*)` | Accused Count | M.V. Theft (16) alone (24 excluded) | `SELECT COUNT(*) WHERE record_type='ARREST' AND local_head_id=16` |

---

### 3.2 Sheet 2: `Monday_Morning` (22×8)

| Sheet | Row Label | Canonical Code | Column Label | District Scope | Period Window | Source Table(s) | Join Keys | Filter | Aggregation | Formula | Edge Cases | Validation Query |
|---|---|---|---|---|---|---|---|---|---|---|---|---|
| `Monday_Morning` | `DACOITY` | `DACOITY` | `CASE REPORTED (Y-1)` | ALL_DELHI | `Jan 1 Y-1..D_LY` | `records`, `fir_details` | `record_id` | `CASE` | `COUNT(*)` | YTD Count | Prior year YTD | `fetchCaseCounts` |
| `Monday_Morning` | `DACOITY` | `DACOITY` | `CASE REPORTED (Y)` | ALL_DELHI | `Jan 1 Y..D` | `records`, `fir_details` | `record_id` | `CASE` | `COUNT(*)` | YTD Count | Current year YTD | `fetchCaseCounts` |
| `Monday_Morning` | `DACOITY` | `DACOITY` | `VARIATION` | ALL_DELHI | YTD Comparative | Derived | N/A | N/A | Ratio | `computeVariation(Col3, Col2)` | Zero handling | N/A |
| `Monday_Morning` | `DACOITY` | `DACOITY` | `CASES SOLVED (Y-1)` | ALL_DELHI | `Jan 1 Y-1..D_LY` | `records`, `fir_details` | `record_id` | `is_worked_out=true` | `COUNT(*)` | Solved Count | Worked out in Y-1 | `SELECT count(*) WHERE is_worked_out=true` |
| `Monday_Morning` | `DACOITY` | `DACOITY` | `CASES SOLVED (Y)` | ALL_DELHI | `Jan 1 Y..D` | `records`, `fir_details` | `record_id` | `is_worked_out=true` | `COUNT(*)` | Solved Count | Worked out in Y | `SELECT count(*) WHERE is_worked_out=true` |
| `Monday_Morning` | `DACOITY` | `DACOITY` | `%AGE SOLVED (Y-1)` | ALL_DELHI | Y-1 | Derived | N/A | N/A | Ratio | `computeDetection(Col5, Col2)` | Reported = 0 -> '-' | N/A |
| `Monday_Morning` | `DACOITY` | `DACOITY` | `%AGE SOLVED (Y)` | ALL_DELHI | Y | Derived | N/A | N/A | Ratio | `computeDetection(Col6, Col3)` | Reported = 0 -> '-' | N/A |
| `Monday_Morning` | `RAPE & POCSO` | `RAPE_POCSO_MERGED` | `CASE REPORTED (Y-1)` | ALL_DELHI | `Jan 1 Y-1..D_LY` | `records`, `fir_details` | `record_id` | `canonical_code IN ('RAPE','POCSO')` | `COUNT(*)` | `Count(RAPE, Y-1) + Count(POCSO, Y-1)` | Merged Reported Y-1 | `SELECT count(*) WHERE code IN ('RAPE','POCSO')` |
| `Monday_Morning` | `RAPE & POCSO` | `RAPE_POCSO_MERGED` | `CASE REPORTED (Y)` | ALL_DELHI | `Jan 1 Y..D` | `records`, `fir_details` | `record_id` | `canonical_code IN ('RAPE','POCSO')` | `COUNT(*)` | `Count(RAPE, Y) + Count(POCSO, Y)` | Merged Reported Y | `SELECT count(*) WHERE code IN ('RAPE','POCSO')` |
| `Monday_Morning` | `RAPE & POCSO` | `RAPE_POCSO_MERGED` | `VARIATION` | ALL_DELHI | YTD Comparative | Derived | N/A | N/A | Ratio | `computeVariation(Reported_Y, Reported_Y1)` | Merged Variation | N/A |
| `Monday_Morning` | `RAPE & POCSO` | `RAPE_POCSO_MERGED` | `CASES SOLVED (Y-1)` | ALL_DELHI | `Jan 1 Y-1..D_LY` | `records`, `fir_details` | `record_id` | `code IN ('RAPE','POCSO') AND is_worked_out=true` | `COUNT(*)` | `Solved(RAPE, Y-1) + Solved(POCSO, Y-1)` | Merged Solved Y-1 | `SELECT count(*) WHERE is_worked_out=true` |
| `Monday_Morning` | `RAPE & POCSO` | `RAPE_POCSO_MERGED` | `CASES SOLVED (Y)` | ALL_DELHI | `Jan 1 Y..D` | `records`, `fir_details` | `record_id` | `code IN ('RAPE','POCSO') AND is_worked_out=true` | `COUNT(*)` | `Solved(RAPE, Y) + Solved(POCSO, Y)` | Merged Solved Y | `SELECT count(*) WHERE is_worked_out=true` |
| `Monday_Morning` | `RAPE & POCSO` | `RAPE_POCSO_MERGED` | `%AGE SOLVED (Y-1)` | ALL_DELHI | Y-1 | Derived | N/A | N/A | Ratio | `computeDetection(Solved_Y1, Reported_Y1)` | Merged % Solved Y-1 | N/A |
| `Monday_Morning` | `RAPE & POCSO` | `RAPE_POCSO_MERGED` | `%AGE SOLVED (Y)` | ALL_DELHI | Y | Derived | N/A | N/A | Ratio | `computeDetection(Solved_Y, Reported_Y)` | Merged % Solved Y | N/A |

---

### 3.3 Sheet 3: `Upto_Date` (34×73) & Sheet 4: `DISTRICTS` (34×41)

| Sheet | Row Label | Canonical Code | Column Label | District Scope | Period Window | Source Table(s) | Join Keys | Filter | Aggregation | Formula | Edge Cases | Validation Query |
|---|---|---|---|---|---|---|---|---|---|---|---|---|
| `Upto_Date` | `DACOITY` | `DACOITY` | `NORTH (Y-2)` | `DIST_CD` | `Jan 1 Y-2..D_LY2` | `records`, `fir_details` | `district_id` | `district_id=NORTH` | `COUNT(*)` | District Y-2 Count | Single District | `fetchCaseCounts(NORTH)` |
| `Upto_Date` | `DACOITY` | `DACOITY` | `NORTH (Y-1)` | `DIST_CD` | `Jan 1 Y-1..D_LY` | `records`, `fir_details` | `district_id` | `district_id=NORTH` | `COUNT(*)` | District Y-1 Count | Single District | `fetchCaseCounts(NORTH)` |
| `Upto_Date` | `DACOITY` | `DACOITY` | `NORTH (Y)` | `DIST_CD` | `Jan 1 Y..D` | `records`, `fir_details` | `district_id` | `district_id=NORTH` | `COUNT(*)` | District Y Count | Single District | `fetchCaseCounts(NORTH)` |
| `Upto_Date` | `DACOITY` | `DACOITY` | `TOTAL (Y)` | ALL_DELHI | `Jan 1 Y..D` | Derived | N/A | N/A | Sum | `SUM(Districts 1..23)` | Row Total | N/A |
| `DISTRICTS` | `DACOITY` | `DACOITY` | `NORTH (Y-1)` | `DIST_CD` | `Jan 1 Y-1..D_LY` | `records`, `fir_details` | `district_id` | `district_id=NORTH` | `COUNT(*)` | 2-Year Matrix Y-1 | Single District | `fetchCaseCounts(NORTH)` |
| `DISTRICTS` | `DACOITY` | `DACOITY` | `NORTH (Y)` | `DIST_CD` | `Jan 1 Y..D` | `records`, `fir_details` | `district_id` | `district_id=NORTH` | `COUNT(*)` | 2-Year Matrix Y | Single District | `fetchCaseCounts(NORTH)` |
| `DISTRICTS` | `DACOITY` | `DACOITY` | `OTHERS (Y)` | `DIST_OTHERS` | `Jan 1 Y..D` | `records`, `fir_details` | `district_id` | Specialized units | `COUNT(*)` | Aggregated Units | `SPL. CELL, CRIME, EOW, SPUWAC, VIGILANCE` | `fetchCaseCounts(SPECIALIZED_UNITS)` |

---

### 3.4 Sheet 5: `L&O SOUTH` (33×17) & Sheet 6: `L&O NORTH` (33×19)

| Sheet | Row Label | Canonical Code | Column Label | District Scope | Period Window | Source Table(s) | Join Keys | Filter | Aggregation | Formula | Edge Cases | Validation Query |
|---|---|---|---|---|---|---|---|---|---|---|---|---|
| `L&O SOUTH` | `DACOITY` | `DACOITY` | `SOUTH (Y-1)` | `DIST_SD` | `Jan 1 Y-1..D_LY` | `records`, `fir_details` | `district_id` | `district_id=SOUTH` | `COUNT(*)` | District Y-1 | South Range | `fetchCaseCounts(SOUTH)` |
| `L&O SOUTH` | `DACOITY` | `DACOITY` | `TOTAL (Y)` | L&O SOUTH | `Jan 1 Y..D` | Derived | N/A | N/A | Sum | `SUM(7 South Districts)` | Range Total | N/A |
| `L&O NORTH` | `DACOITY` | `DACOITY` | `NORTH (Y-1)` | `DIST_CD` | `Jan 1 Y-1..D_LY` | `records`, `fir_details` | `district_id` | `district_id=NORTH` | `COUNT(*)` | District Y-1 | North Range | `fetchCaseCounts(NORTH)` |
| `L&O NORTH` | `DACOITY` | `DACOITY` | `TOTAL (Y)` | L&O NORTH | `Jan 1 Y..D` | Derived | N/A | N/A | Sum | `SUM(8 North Districts)` | Range Total | N/A |

---

### 3.5 Sheet 7: `Daily Diary 2015-2017 (2)` (63×72) & Sheet 8: `for week` (64×67)

| Sheet | Row Label | Canonical Code | Column Label | District Scope | Period Window | Source Table(s) | Join Keys | Filter | Aggregation | Formula | Edge Cases | Validation Query |
|---|---|---|---|---|---|---|---|---|---|---|---|---|
| `Daily Diary` | `DACOITY` | `DACOITY` | `DETECTION Y (CASES)` | ALL_DELHI | `Jan 1 Y..D` | `records`, `fir_details` | `record_id` | `is_worked_out=true` | `COUNT(*)` | Worked Out Count | Solved Cases | `fetchCaseCounts` |
| `Daily Diary` | `DACOITY` | `DACOITY` | `DETECTION Y (%AGE)` | ALL_DELHI | `Jan 1 Y..D` | Derived | N/A | N/A | Ratio | `computeDetection(Solved, Reported)` | Reported=0 -> '-' | N/A |
| `for week` | `DACOITY` | `DACOITY` | `CASES REPORTED Y` | ALL_DELHI | `D-6..D` | `records`, `fir_details` | `record_id` | `CASE` | `COUNT(*)` | Weekly Count | 7-day rolling week | `WHERE registration_date BETWEEN D-6 AND D` |
| `for week` | `DACOITY` | `DACOITY` | `VARIATION% [Y/Y-1]` | ALL_DELHI | Weekly | Derived | N/A | N/A | Ratio | `computeVariation(Week_Y, Week_Y1)` | Zero handling | N/A |

---

### 3.6 Sheet 9: `Variation% (mvt) 2017` (Multi-Year Historical Trend — 47×68)

| Sheet | Row Label | Canonical Code | Column Label | District Scope | Period Window | Source Table(s) | Join Keys | Filter | Aggregation | Formula | Edge Cases | Validation Query |
|---|---|---|---|---|---|---|---|---|---|---|---|---|
| `Variation%` | `DACOITY` | `DACOITY` | `CASES REPORTED (Y-3)` | ALL_DELHI | `Jan 1 Y-3..D_LY3` | `records` / `stat_baselines` | `canonical_code` | `CASE` | `COUNT(*)` | Multi-Year Trend | Historical Y-3 | `fetchHistoricalBaseline(Y-3)` |
| `Variation%` | `DACOITY` | `DACOITY` | `CASES REPORTED (Y-2)` | ALL_DELHI | `Jan 1 Y-2..D_LY2` | `records` / `stat_baselines` | `canonical_code` | `CASE` | `COUNT(*)` | Multi-Year Trend | Historical Y-2 | `fetchHistoricalBaseline(Y-2)` |
| `Variation%` | `DACOITY` | `DACOITY` | `CASES REPORTED (Y-1)` | ALL_DELHI | `Jan 1 Y-1..D_LY` | `records` / `stat_baselines` | `canonical_code` | `CASE` | `COUNT(*)` | Multi-Year Trend | Historical Y-1 | `fetchHistoricalBaseline(Y-1)` |
| `Variation%` | `DACOITY` | `DACOITY` | `CASES REPORTED (Y)` | ALL_DELHI | `Jan 1 Y..D` | `records`, `fir_details` | `record_id` | `CASE` | `COUNT(*)` | Current Year YTD | Current year YTD | `fetchCaseCounts` |
| `Variation%` | `DACOITY` | `DACOITY` | `VARIATION% [Y/Y-1]` | ALL_DELHI | YTD Comparative | Derived | N/A | N/A | Ratio | `computeVariation(YTD_Y, YTD_Y1)` | Movement % | N/A |
| `Variation%` | `DACOITY` | `DACOITY` | `VARIATION% [Y/Y-2]` | ALL_DELHI | YTD Comparative | Derived | N/A | N/A | Ratio | `computeVariation(YTD_Y, YTD_Y2)` | 2-Year Movement % | N/A |
| `Variation%` | `TOTAL HEINOUS` | `TOTAL_HEINOUS` | All Columns | ALL_DELHI | Multi-Year | Derived | N/A | Heinous Set | Sum | `SUM(DACOITY..RAPE)` | Heinous Trend Sum | N/A |
| `Variation%` | `TOTAL NON HEINOUS` | `TOTAL_NON_HEINOUS` | All Columns | ALL_DELHI | Multi-Year | Derived | N/A | Non-Heinous Set | Sum | `SUM(EXTORTION..OTHER_IPC)` (or `OTHER_BNS` for BNS-era periods) | Non-Heinous Trend Sum | N/A |
| `Variation%` | `TOTAL IPC / TOTAL BNS` | `TOTAL_IPC` | All Columns | ALL_DELHI | Multi-Year | Derived | N/A | Master IPC | Sum | `TOTAL_HEINOUS + TOTAL_NON_HEINOUS` | Master IPC/BNS Trend. Dynamically renamed per period | N/A |

> [!NOTE]
> **Master IPC/BNS Trend Edge Case**: For multi-year historical trend columns (Y-3, Y-2, Y-1, Y), the labels and counts for each column are determined by its specific period window. Columns entirely before 1 July 2024 sum `local_head_cd = 99` (Other IPC) under the pre-transition rules, while columns on/after 1 July 2024 sum `local_head_cd = 215` (Other BNS) under the post-transition rules.

---

## Section 4: Cross-Sheet Checksums, Invariants & Data-Quality Exceptions

### 4.1 SQL Verification Query for L&O Range Partition Invariant

```sql
WITH district_totals AS (
  SELECT
    r.district_id,
    hn.code AS district_code,
    COUNT(*) AS total_cases
  FROM records r
  JOIN hierarchy_nodes hn ON hn.id = r.district_id
  WHERE r.record_type = 'CASE'
    AND r.current_status <> 'DELETED'
    AND r.registration_date BETWEEN '2026-01-01' AND '2026-07-22'
  GROUP BY r.district_id, hn.code
)
SELECT
  (SELECT SUM(total_cases) FROM district_totals WHERE district_code IN ('DIST_NDD','DIST_SWD','DIST_SD','DIST_SED','DIST_DW','DIST_OD','DIST_WD')) AS lo_south_total,
  (SELECT SUM(total_cases) FROM district_totals WHERE district_code IN ('DIST_CD','DIST_ND','DIST_NWD','DIST_OND','DIST_RND','DIST_ED','DIST_SHD','DIST_NED')) AS lo_north_total,
  (SELECT SUM(total_cases) FROM district_totals WHERE district_code IN ('DIST_RAILWAYS','DIST_METRO','DIST_IGIAIRPORT','DIST_SPECIALCELL','DIST_CRIMEBRANCH','DIST_EOW','DIST_SPUWAC','DIST_VIGILANCE')) AS spec_units_total,
  (SELECT SUM(total_cases) FROM district_totals) AS delhi_grand_total,
  ((SELECT SUM(total_cases) FROM district_totals WHERE district_code IN ('DIST_NDD','DIST_SWD','DIST_SD','DIST_SED','DIST_DW','DIST_OD','DIST_WD')) +
   (SELECT SUM(total_cases) FROM district_totals WHERE district_code IN ('DIST_CD','DIST_ND','DIST_NWD','DIST_OND','DIST_RND','DIST_ED','DIST_SHD','DIST_NED'))) AS lo_combined_total,
  ((SELECT SUM(total_cases) FROM district_totals) -
   (SELECT SUM(total_cases) FROM district_totals WHERE district_code IN ('DIST_RAILWAYS','DIST_METRO','DIST_IGIAIRPORT','DIST_SPECIALCELL','DIST_CRIMEBRANCH','DIST_EOW','DIST_SPUWAC','DIST_VIGILANCE'))) AS expected_lo_total;
```

### 4.2 Data-Quality Exception Policy

- **Unpopulated `registration_date`**: `records.registration_date` is the strict single source of truth for date window queries. Any active record where `registration_date IS NULL` is treated as a **Data-Quality Exception**. Knex migration `20260722000001` backfilled `registration_date = record_date` across 100% of historical records. Any new record inserted with `registration_date IS NULL` will be flagged by database integrity assertions.

---

## Section 5: Code Evidence & Open Questions Tracker

### 5.1 Resolved Business Rules & Technical Decisions

1. **`Upto_Date` vs `DISTRICTS` Structural Evidence**:
   - `Upto_Date` uses `UPTODATE_DISTRICTS` (23 columns across $Y-2, Y-1, Y$) providing complete unit-by-unit transparency.
   - `DISTRICTS` uses `TWO_YEAR_DISTRICTS` (18 territorial/transit districts + `OTHERS` grouping `SPL. CELL`, `CRIME`, `EOW`, `SPUWAC`, `VIGILANCE` across $Y-1, Y$).
   - `DISTRICTS` is linked to template code `PHQ_UPTODATE_MATRIX` in `config/proformas/phq_uptodate_matrix.json`.
   - Both are user-selectable report types. The difference is structural and intentional to provide both a 3-year detailed matrix and a 2-year executive summary matrix.
2. **NDPS Weight Units**: All recovery figures are normalized to Kilograms (KG) via `ref.units.to_kg_factor`.
3. **Arrests Category Mapping**: Person-level accused counts from `records` (`ARREST`) joined with `arrest_details.local_head_id`.
4. **RAPE & POCSO Scope**: Combined exclusively on Sheet 9 (`Monday_Morning`), separate on all other sheets.
5. **POCSO_ACT Inclusion**: Additive display only on `Monday_Morning`; does not double-subtract on general sheets.
6. **Burglars Category Scope (Pass 2 - RESOLVED)**: Confirmed as covering **all kinds of Burglary** (`local_head_cd IN (12, 13, 209, 210)` — 12 Burglary, 13 Violent Burglary, 209 Day Burglary, 210 Night Burglary).
7. **Auto Lifters Category Scope (Pass 2 - RESOLVED)**: Confirmed strictly single-head `local_head_cd = 16` (`M.V. Theft`) alone — `24` (`M.V. Accessories Theft`) is **not** included.

### 5.2 Active Open Questions & Data-Quality Notes (Awaiting Owner Rulings)

1. **POPPY HEAD Code Selection (BLOCKING)**:
   - `POPPY HEAD` has no exact string match in `Menu_Tables.xlsx` (`DRUGS NARCOTIC` sheet).
   - Candidate codes: `411` (`PLANT POD - POPPY`), `412` (`POPPY HUSK`), `413` (`POPPY PLANT POD`), `414` (`POPPY STRAW`).
   - *Status*: **BLOCKED** — formula is held pending explicit owner selection of candidate code(s).

2. **GANJA Category Scope (Open Question)**:
   - Base match confirmed as `drug_type_cd = 401` (`GANJA`).
   - *Question*: Should `394` (`CANNABIS PLANT`) and/or `392` (`BHANG`) also be included? (Legally distinct under NDPS, but colloquially related).

3. **OPIUM Category Scope (Open Question)**:
   - Base match confirmed as `drug_type_cd = 409` (`OPIUM`).
   - *Question*: Should `410` (`OPIUM DERIVATIVES`) also be included?

4. **Multi-Act Category Variant Inclusion (Open Question)**:
   - `ARMS_ACT`: `4` (1959 Act), `2158` (1969 Act), `9994` (2019 Amendment). Should all three count or only currently-governing act?
   - `NDPS_ACT`: `48` (1985 Act) and `51` (1988 PIT NDPS). Confirm both belong under single `NDPS_ACT` row.
   - `POCSO`: `3039` (2012 Act) and `9993` (2019 Amendment). Confirm both count.

5. **Duplicate Major Head `HURT` (Data-Quality Note)**:
   - `Menu_Tables.xlsx` (`major head` sheet) contains **two separate rows both named `HURT`**: `major_head_code = 31` and `major_head_code = 148`.
   - *Action*: Flagged for data cleanup and owner confirmation on which `major_head_code` is authoritative for report aggregation.

6. **Out-of-Jurisdiction Act Exclusions (Data-Quality Note)**:
   - `507` (`MAHARASHTRA PREVENTION OF GAMBLING ACT, 1887`) present in `act` sheet — explicitly excluded from `GAMBLING_ACT`.
   - `438` (`THE PUNJAB EXCISE ACT, 1914`) present in `act` sheet — explicitly excluded from `EXCISE_ACT`.
   - *Action*: Flagged as reference table anomalies, safely excluded from query execution.
