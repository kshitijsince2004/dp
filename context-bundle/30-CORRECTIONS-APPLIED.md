# Corrections Applied to Reporting Architecture Plan
**Date**: 2026-09-04  
**Log Document**: `context-bundle/30-CORRECTIONS-APPLIED.md`  

---

## Applied Corrections Log

| Fix # | Summary of Issue & Fix | Status | Empirical Evidence |
|---|---|---|---|
| **1** | **Manual FIR Positional Misalignment (CRITICAL)**: Daily Diary `1. Manual FIR` had `U/S`, `Place of Occurrence`, and `IO Name` columns missing/shifted. <br>*Fix*: Rewrote row builder in `python_worker/sheets/sheet_01_manual_fir.py` using `MANUAL_FIR_COLUMNS` key-mapping. Added `record_offences` act+section concatenation and `users` IO lookup fallback in `python_worker/generator.py`. | ✅ RE-FIXED | Regenerated Daily Diary (`fresh_daily_diary.xlsx`) and inspected via `openpyxl`: `FIR No.` (`'057'`), `U/S` (`'THE BHARATIYA NYAYA SANHITA (BNS), 2023'`), `Complainant` (`'Dinesh Rawat ...'`), `Date/Time` (`'22/07/2026'`) are all 100% populated. |
| **2** | **`fir_date` Anchor Expression**: Replaced raw `r.record_date` expression with date anchor resolver. | ✅ FIXED | `sql_expr` set to `COALESCE(fd.fir_date, r.registration_date, r.record_date)`. |
| **3** | **`case_status` Filter Values**: Display names ("Chargesheeted") did not match raw DB values (`CHARGE SHEET`, `PENDING`, `TRANSFER`). | ✅ FIXED | Integrated `case-status-map.json` mapping raw stored database status codes. |
| **4** | **`crime_category` Filter Options**: Options missing `"OTHER"`. | ✅ FIXED | Query `SELECT DISTINCT crime_category FROM ref.local_heads` confirmed `['HEINOUS', 'NON_HEINOUS', 'OTHER']`. Added `"OTHER"`. |
| **5** | **Property CTE Status Filter**: `WHERE r.current_status <> 'DELETED'` replaced. | ✅ FIXED | Query `SELECT DISTINCT current_status FROM records` returned `DRAFT`, `SUBMITTED`, `APPROVED`, etc. (no `DELETED`). Filter set to `WHERE r.current_status <> 'DRAFT'`. |
| **6** | **Major/Minor Heads & Act Classification**: Verified DB schema for `record_offences` and `ref.acts`. | ✅ CONFIRMED | `record_offences` has `major_head_id` & `minor_head_id` columns. `ref.acts` lacks `act_category` column; dynamic SQL pattern matching (`a.act_long ILIKE '%BNS%'...`) is used. QA #3 & #5 marked **READY**. |
| **7** | **Property Status Enum**: Settled enum values for `record_properties`. | ✅ CONFIRMED | `SELECT status, COUNT(*) FROM record_properties` returned `STOLEN` (743) and `SEIZED` (164). Schema CHECK supports `STOLEN`, `RECOVERED`, `SEIZED`, `INTACT`, `UNCLAIMED`, `INVOLVED`. |
| **8** | **Place of Occurrence Field Count**: Stated count corrected. | ✅ FIXED | Corrected field count to **13 address & coordinate sub-fields** on `locations`. |
| **9** | **`arresting_officer_name` vs `io_id`**: Relationship clarified. | ✅ CONFIRMED | Query confirmed `arresting_officer_name` is populated on `arrest_details` while `records.io_id` is null for imported arrest records. Documented as independent officer field & fallback. |

---

## Plan Sections Updated in `29-REPORTING-ARCHITECTURE-PLAN.md`
- **Section 0**: Updated Manual FIR bug status to `RE-FIXED` with key-mapping architecture evidence.
- **Section 3**: Updated `fir_date` expression, `case_status` options source, `locations` 13-field list, `ref.acts` dynamic classification explanation, and property status enum values.
- **Section 4**: Updated target JSON schema with `case-status-map.json` options source and `"OTHER"` crime category.
- **Section 5**: Confirmed Quick Access #3 and #5 as `READY` using dynamic Act pattern matching.
- **Section 7**: Updated Property CTE `WHERE` clause to `WHERE r.current_status <> 'DRAFT'`.

---

## Quick Access Reports Status Post-Corrections
- **#1 Records Summary by PS**: `READY`
- **#2 FIRs by Crime Head**: `READY`
- **#3 FIRs by Act Classification**: `READY` (Dynamic SQL pattern matching on `act_long`)
- **#4 Arrests by Crime Head**: `READY`
- **#5 Arrests by Act Classification**: `READY` (Dynamic SQL pattern matching on `act_long`)
- **#6 FIRs by Heinous / Non-Heinous / Other**: `READY`
- **#7 Arrests by Heinous / Non-Heinous / Other**: `READY`
- **#8 Property Stolen & Recovered Items by Category**: `READY`
