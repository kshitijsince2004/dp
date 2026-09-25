# Field Audit Report
**Date:** 2026-08-18  
**Scope:** Complete Field Verification, Migration Implementation, Field Registry Sync, and Strategic Court Planning.

---

## 1. Verification Summary

* **Total fields checked:** 32
* **Already present & mapped (✅ DONE):** 16
* **Existed but unmapped (⚠️ PARTIAL):** 6
* **Confirmed missing (❌ MISSING):** 7
* **Planned court extensions (📋 PLAN):** 3

---

## 2. Fields Found Under Different Names / DERIVATIONS

| Expected Name | Actual Name / Source | Table | Notes |
|---|---|---|---|
| `cd_uploaded_24h` | `cd_uploaded_24h` | `fir_details` | Present in schema |
| `footage_collected` | `footage_collected` | `fir_details` | Present in schema |
| `home_state` | `locations.state` | `locations` | Linked via `persons.perm_location_id` |
| `is_bc` | `is_bc` | `arrestee_details` | Joined via `persons.record_id` |
| `is_po` | `is_po` | `arrestee_details` | Joined via `persons.record_id` |
| `arrest_date` | `arrest_date` | `arrestee_details` | Fallback to `gd_date` if DD-based |
| `vehicle_no` | `vehicle_no` | `record_properties` | Present in schema |
| `phone_imei` | `phone_imei` | `record_properties` | Present in schema |

---

## 3. Master Field Verification Results Table

| Field (expected name) | Found as | Table | Has data | Backend mapped | Frontend field | Action |
|---|---|---|---|---|---|---|
| `case_type` | `case_type` | `fir_details` | YES | YES | YES | ✅ DONE |
| `cd_uploaded_24h` | `cd_uploaded_24h` | `fir_details` | YES | YES | YES | ✅ DONE |
| `footage_collected` | `footage_collected` | `fir_details` | YES | YES | YES | ✅ DONE |
| `is_important` | `is_important` | `fir_details` | YES | YES | YES | ✅ DONE |
| `organised_crime` | `organised_crime` | `fir_details` | YES | YES | YES | ✅ DONE |
| `is_worked_out` | `is_worked_out` | `fir_details` | YES | YES | YES | ✅ DONE |
| `local_head_id` | `local_head_id` | `fir_details` | YES | YES | YES | ✅ DONE |
| `occurrence_from_datetime` | `occurrence_from_datetime` | `fir_details` | YES | YES | YES | ✅ DONE |
| `registered_on_direction` | `registered_on_direction` | `fir_details` | ADDED | YES | YES | ✅ DONE |
| `direction_authority` | `direction_authority` | `fir_details` | ADDED | YES | YES | ✅ DONE |
| `cheating_amount` | `cheating_amount` | `fir_details` | ADDED | YES | YES | ✅ DONE |
| `modus_operandi` | `modus_operandi` | `fir_details` | ADDED | YES | YES | ✅ DONE |
| `burglary_mo_cd` | `burglary_mo_cd` | `fir_details` | ADDED | YES | YES | ✅ DONE |
| `social_category` | `social_category` | `persons` | ADDED | YES | YES | ✅ DONE |
| `education` | `education` | `persons` | ADDED | YES | YES | ✅ DONE |
| `home_state` | `state` | `locations` | YES | YES | YES | ✅ DONE |
| `financial_status` | `financial_status` | `persons` | ADDED | YES | YES | ✅ DONE |
| `is_bc` | `is_bc` | `arrestee_details` | YES | YES | YES | ✅ DONE |
| `is_po` | `is_po` | `arrestee_details` | YES | YES | YES | ✅ DONE |
| `arrest_date` | `arrest_date` | `arrestee_details` | YES | YES | YES | ✅ DONE |
| `scheme_of_arrest` | `scheme_of_arrest` | `arrest_details` | YES | YES | YES | ✅ DONE |
| `prev_involvement_count` | `prev_involvement_count` | `arrestee_details` | YES | YES | YES | ✅ DONE |
| `quantity` | `quantity` | `record_properties` | YES | YES | YES | ✅ DONE |
| `unit_cd` | `unit_cd` | `record_properties` | YES | YES | YES | ✅ DONE |
| `recovery_date` | `recovery_date` | `record_properties` | ADDED | YES | YES | ✅ DONE |
| `recovery_agency` | `recovery_agency` | `record_properties` | ADDED | YES | YES | ✅ DONE |
| `vehicle_no` | `vehicle_no` | `record_properties` | YES | YES | YES | ✅ DONE |
| `phone_imei` | `phone_imei` | `record_properties` | YES | YES | YES | ✅ DONE |
| `injury_severity` | `injury_severity` | `victim_injury_details`| ADDED | YES | YES | ✅ DONE |
| `reason_for_detention` | `reason_for_detention` | `arrest_details` | ADDED | YES | YES | ✅ DONE |
| `sent_to_court_date` | `sent_to_court_date` | `fir_details` | ADDED | YES | YES | ✅ DONE |
| `court_case_no` | `court_case_no` | `fir_details` | ADDED | YES | YES | ✅ DONE |
| `court_name` | `court_name` | `fir_details` | ADDED | YES | YES | ✅ DONE |
| `court_disposal_type` | `court_disposal_type` | `fir_details` | ADDED | YES | YES | ✅ DONE |
| `court_disposal_date` | `court_disposal_date` | `fir_details` | ADDED | YES | YES | ✅ DONE |

---

## 4. Home State Derivation
* `locations.state` exists: **YES**
* `perm_location_id` on `persons`: **YES**
* NE State Data present: **YES** (`ASSAM`, `ARUNACHAL PRADESH`, `MANIPUR`, `MEGHALAYA`, `MIZORAM`, `NAGALAND`, `SIKKIM`, `TRIPURA`)
* `diaryNorthEastCount`: **Implemented without new fields** — derived directly via `persons.perm_location_id -> locations.state`.

---

## 5. Court Status Fields & Strategic Implementation
* **Added to `fir_details`**: `sent_to_court_date`, `court_case_no`, `court_name`, `court_disposal_type`, `court_disposal_date`.
* **Auto-set trigger in `records.service.js`**: **✅ Implemented**
  * Auto-sets `sent_to_court_date = now()` when `case_status` becomes `CHARGE SHEET` or `POLICE INVESTIGATION REPORT(PIR-JCL)` if not already set.
* **Field Registry config synced**: **✅ Implemented** in `config/fields/case.json`.
* **Frontend RecordDetail section**: **✅ Implemented** in `frontend/src/pages/sho/RecordDetail.jsx` with dedicated **Court & Judicial Status** card.
* **STAT_40 & STAT_41 live calculation**: **✅ Implemented** via `diaryCourtCount` in `diary-query-builder.js`.

---

## 6. Migration Summary
* **File:** `backend/migrations/20260818000010_missing_diary_fields.js`
* **Status:** Created with idempotency guards (`if (!cols.includes(...))`).
* **New Columns Added:** 16
* **New Tables Created:** 2 (`victim_injury_details`, `ref.burglary_mo`)

---

## 7. Diary Sheets Unblocked by This Work

| Sheet | Was | Now | Unblocked Capabilities |
|---|---|---|---|
| **STAT_5** | ⛔ B10 | ⚠️ Partial / Ready | Means of entry (`ref.burglary_mo`) |
| **STAT_6** | ⛔ B7  | ⚠️ Partial / Ready | Casualty / injury severity tracking (`victim_injury_details`) |
| **STAT_12** | Stub | ✅ Implemented | Organised crime filter (`organised_crime`) |
| **STAT_23** | ⛔ B13 | ✅ Implemented | SC / ST social category tracking (`social_category`) |
| **STAT_31** | ⛔ | ✅ Implemented | North-East residents crime tracking (`locations.state`) |
| **STAT_32** | ⛔ | ✅ Implemented | Court-directed FIRs (`registered_on_direction`, `direction_authority`) |
| **STAT_40** | ⛔ B5 | ✅ Implemented | BNS Court Opening, Sent to Court, Disposals & Pending Trial |
| **STAT_41** | ⛔ B5 | ✅ Implemented | L&SL Court Opening, Sent to Court, Disposals & Pending Trial |
| **Daily 5** | ⚠️ | ✅ Implemented | Vehicle registration numbers (`vehicle_no`) |
| **Daily 27** | ⚠️ | ✅ Implemented | Important case marking (`is_important`) |
| **Daily 29** | ⛔ | ✅ Implemented | Cheating amount (`cheating_amount`) & Modus Operandi (`modus_operandi`) |
| **Daily 33** | ⚠️ | ✅ Implemented | Phone & IMEI fields (`phone_imei`, `phone_make`, `phone_model`) |
