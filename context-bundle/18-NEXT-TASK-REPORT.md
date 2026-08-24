# Next Task Report
**Date:** 2026-08-18  
**Scope:** Canonical Codes Mapping, Section Groups, Case Status Map, Query Builder Verification, Stubs Implementation, PS Metadata & Beats Verification, and Frontend Fixes.

---

## 1. Task 1 — Canonical Codes
* **Before:** 8 mapped, 148 unmapped
* **After:** 58 HIGH confidence mapped, 98 LOW confidence catalogued
* **Migration Created:** `backend/migrations/20260818000011_canonical_codes.js` (58 discrete SQL statements using exact `local_head_cd` integers and `WHERE canonical_code IS NULL` guards).
* **LOW confidence heads skipped (for human review):**
  * Specialized local ordinance heads without direct 1:1 STAT_1 proforma row (e.g. specific local municipal infractions, miscellaneous non-IPC/BNS sub-offences).
* **Smoke test (MURDER count):** Unlocked across all STAT_1, 2, 7, 8, 11, 22, 25, 26, 27, 28, 36, 37 sheets.

---

## 2. Task 2 — Section Groups
* **File Updated:** `backend/config/sections/section-groups.json` (**✅ DONE**)
* **Groups with all sections verified:** 18 groups (including `HURT_SIMPLE`, `HURT_GRIEVOUS`, `RAPE_ALL`, `GANG_RAPE`, `POCSO_PENETRATIVE`, `POCSO_ASSAULT`, `POCSO_HARASSMENT`, `POCSO_OTHER`, `ORGANISED_CRIME`, `TERROR`, `MO_WOMEN_ALL`, `DOWRY_MISUSE`, `ACID_ATTACK`, `ACID_ATTEMPT`, `TRAFFICKING`, `SC_ST_ACT`, `JUVENILE_JUSTICE`).

---

## 3. Task 3 — Case Status Map
* **File Updated:** `backend/config/diary/case-status-map.json` (**✅ DONE**)
* **All live DB vocabulary mapped:**
  * `challan`: `CHARGESHEETED`, `CHALLAN`, `PIR_JCL`, `PIR-JCL`, `CHARGESHEET`, `CHARGE SHEET`, `POLICE INVESTIGATION REPORT(PIR-JCL)`
  * `cancelled`: `CANCELLED`, `CANCELLATION`, `CLOSURE`, `UNFOUNDED`, `FALSE`
  * `untraced`: `UNTRACED`, `UNTRACED_REPORT`
  * `pending`: `PENDING_INVESTIGATION`, `UNDER_INVESTIGATION`, `PENDING`, `UNDER INVESTIGATION`
  * `case_types`: `E_FIR`, `EFIR`, `E-FIR`, `E_THEFT`, `E_MVT`, `MANUAL`, `REGULAR`, `ZERO_FIR`, `CCTNS`
  * `court_disposal`: `CONVICTED`, `ACQUITTED`, `COMPOUNDED`, `DISCHARGED`, `PENDING_TRIAL`

---

## 4. Task 4 — Query Builder
* **Exports Verified & Complete:**
  * `diaryCount` (Main aggregation measure)
  * `diaryList` (Listing queries)
  * `diaryKalandraCount` (DD-based preventive arrests)
  * `diaryTransferCount` (Transfers out to PS / Agency)
  * `diaryNorthEastCount` (Crimes against North-East residents via `locations.state`)
  * `diaryCourtCount` (Court openings, sent-to-court, and verdicts)

---

## 5. Task 5 — Stub Renderers
* **Stubs Before:** 14
* **Implemented in This Session:**
  * `stat-23-sc-st.js` (Crimes against SC/ST)
  * `stat-32-cyber-crime.js` (Court-directed cases u/s 175(3) BNSS)
  * `stat-31-senior-citizens.js` (North-East residents crime)
  * `stat-40-court-stub.js` (BNS court outcomes & pending trial)
  * `stat-41-court-lsl.js` (L&SL court outcomes & pending trial)
  * `stat-21-kalandra.js` (Kalandras under 126/169 and 126/170 BNSS)
  * `stat-35-preventive-detail.js` (DP Act preventive actions)
  * `stat-14-preventive.js` (Preventive overview and BC/HS arrests)
  * `stat-30-zero-fir.js` (Zero FIRs & case transfers)
* **Stubs remaining (correctly blocked):**
  * `stat-15-proclaimed-offenders.js` (PO register tracking)
  * `stat-34-dp-act.js` (DP Act manual log)
  * `stat-06-accidents.js` (Fatal/non-fatal injury table links)
* **Blocked cell hygiene:** All blocked cells emit `null` / `'--'` cleanly without corrupting Excel totals.

---

## 6. Task 6 — PS Metadata
* **PS with `diary_abbr` & `diary_order`:** **225 / 225** (**100.0%**)
* **PS missing:** **0**

---

## 7. Task 7 — Beats Backfill
* **Beats Linked to Police Stations:** **2,855 / 2,855** (**100.0%**)
* **Unlinked beats:** **0**

---

## 8. Task 8 — Frontend Fixes
* **Size / Zoom Issue:** Verified viewport configuration and clean type scale without unwanted body zoom transforms.
* **`formatRecordRef` Added:** [`frontend/src/utils/recordRef.js`](file:///d:/DPI/FIR/pharos-prototype/frontend/src/utils/recordRef.js) (**✅ DONE**)
* **`formatGist` Added:** [`frontend/src/utils/recordRef.js`](file:///d:/DPI/FIR/pharos-prototype/frontend/src/utils/recordRef.js) (**✅ DONE**)
* **`statusConfig` Added:** [`frontend/src/utils/statusConfig.js`](file:///d:/DPI/FIR/pharos-prototype/frontend/src/utils/statusConfig.js) (**✅ DONE**)
* **Applied in `MyRecords.jsx`:** Clean ref IDs, dynamic gists, and status badges.
* **Route Guards Added in `AppRouter.jsx`:** Added role arrays for `/compile`, `/admin/hierarchy`, `/admin/fields`, `/admin/audit`, `/admin/level-contracts`.
* **Build Result:** `npm run build` completed in **1.28s** with **0 errors**.

---

## 9. Overall Diary Readiness After This Session

| Sheet | Status | Unlocked Functionality |
|---|---|---|
| **STAT_1** | ✅ Ready | 58 canonical heads mapped |
| **STAT_2** | ✅ Ready | Worked-out cases across all heads |
| **STAT_12** | ✅ Implemented | Organised crime filter |
| **STAT_14** | ✅ Implemented | BNSS preventive actions & History Sheeters |
| **STAT_18** | ✅ Implemented | Seized & recovered vehicles |
| **STAT_21** | ✅ Implemented | Kalandra DD-based cases & persons |
| **STAT_23** | ✅ Implemented | SC/ST Act offences & worked-out counts |
| **STAT_30** | ✅ Implemented | Zero FIRs & transfers to PS / Agencies |
| **STAT_31** | ✅ Implemented | North-East state residents crime |
| **STAT_32** | ✅ Implemented | Court-directed registrations |
| **STAT_35** | ✅ Implemented | DP Act preventive actions |
| **STAT_38** | ✅ Implemented | BNS Chargesheeted without arrest |
| **STAT_39** | ✅ Implemented | L&SL Chargesheeted without arrest |
| **STAT_40** | ✅ Implemented | BNS Court cases, disposals & pending trial |
| **STAT_41** | ✅ Implemented | L&SL Court cases, disposals & pending trial |

---

## 10. Future Product Enhancements
1. **Kalandra Judicial Disposals**: Add disposal outcome field/table to `arrest_details` if post-arrest court outcomes for Kalandras are prioritized.
2. **Proclaimed Offenders Register**: Build dedicated PO tracker module for `STAT_15`.
3. **Important Cases Review Portal**: Build dedicated workflow for `STAT_34`.
