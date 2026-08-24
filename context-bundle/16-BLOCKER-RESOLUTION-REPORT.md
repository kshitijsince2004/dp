# Blocker Resolution Report (B1, B5, B6)
**Date:** 2026-08-18  
**Scope:** Investigation, resolution, and renderer implementation for Blockers B1, B5, and B6.

---

## B1 — Transfers resolved via fir_details

### Transfer columns confirmed:
| Column | Exists | Has data | Data Type |
|---|---|---|---|
| `transfer_to_type` | ✅ YES | ✅ YES (1 row) | `character varying` |
| `transferred_to_ps_id` | ✅ YES | ⚠️ Empty in test set | `uuid` |
| `transferred_to_agency_id` | ✅ YES | ⚠️ Empty in test set | `uuid` |
| `date_of_transfer` | ✅ YES | ⚠️ Empty in test set | `date` |
| `case_type` | ✅ YES | ✅ YES (29,730 rows) | `character varying` |

### Distinct `transfer_to_type` values found:
* `PS` (1 row in seed sample)

### Distinct `case_type` values found in `fir_details`:
* `FIR` (22,325 rows)
* `DD_CASE` (7,387 rows)
* `cctns(manual FIR)` (12 rows)
* `zero FIR` (2 rows)
* `eMVT` (2 rows)
* `eTheft` (2 rows)

### STAT_30 cells now computable:
| Cell | Status | Source |
|---|---|---|
| Zero FIRs registered (FN / UPTO) | ✅ Computable | `case_type ILIKE '%zero%' OR transfer_to_type IS NOT NULL` |
| Forwarded to Delhi PS (FN / UPTO) | ✅ Computable | `transferred_to_ps_id IS NOT NULL OR transfer_to_type = 'PS'` |
| Forwarded to Agency / Other State (FN / UPTO) | ✅ Computable | `transferred_to_agency_id IS NOT NULL OR transfer_to_type = 'AGENCY'` |
| Received from other states / PS | ⛔ BLOCKED | Needs `original_ps_id` column on `fir_details` (emits `--`) |

### Still blocked in B1:
* Columns for "Received from other states / PS" remain blocked as `fir_details` currently tracks `original_fir_no` and `original_fir_year`, but not `original_ps_id`. Marked as `--`.

---

## B5 — Court stubs confirmed correct

* `stat-40-court-stub.js`: Updated to log warning and cleanly emit `'--'` across all judicial disposal data cells (Col 3 to 10) ✅.
* `stat-41-court-lsl.js`: Updated to log warning and cleanly emit `'--'` across all judicial disposal data cells (Col 3 to 10) ✅.
* Excel writer / template handling: Zero-fill corruption prevented; sheets preserve formulas and mark unavailable judicial data with `--` ✅.
* **Conclusion**: No further action needed on B5 until court disposal module is added to product roadmap.

---

## B6 — Kalandra implemented from arrest_details

### Data confirmed:
* **Total arrests**: 17,037
* **FIR-based arrests**: 17,028
* **Kalandra arrests (`is_dd_based = true`)**: 9 total (6 non-draft active)
* **GD fields**: `gd_no` populated on 9/9 (100.0%), `gd_date` populated on 9/9 (100.0%)
* **Sections cited**: Section 323, Section 379, Section 392 IPC

### Query Builder extension:
* Added `diaryKalandraCount` to `backend/src/modules/report-engine/shared/diary-query-builder.js` supporting:
  * Section filters (`sectionCodes`)
  * Act filters (`actCodes`, `actNameContains`)
  * Bad Character / History Sheeter filtering (`isBc` joined via `persons` and `arrestee_details`)
  * Anchor date fallback (`COALESCE(ad.gd_date, r.registration_date, r.record_date)`)

### Renderers updated:
| Renderer | Before | After | Cells still blocked |
|---|---|---|---|
| [`stat-21-kalandra.js`](file:///d:/DPI/FIR/pharos-prototype/backend/src/modules/report-engine/fn/renderers/stat-21-kalandra.js) | Full stub | Partial implementation (Row 6 cases & persons computed from `is_dd_based`) | Rows 7–13 disposal outcomes (`--`) |
| [`stat-35-preventive-detail.js`](file:///d:/DPI/FIR/pharos-prototype/backend/src/modules/report-engine/fn/renderers/stat-35-preventive-detail.js) | Full stub | Partial implementation (Rows 5–13 DP Act Kalandras & persons computed) | Fine realised columns (`--`) |
| [`stat-14-preventive.js`](file:///d:/DPI/FIR/pharos-prototype/backend/src/modules/report-engine/fn/renderers/stat-14-preventive.js) | Full stub | §A (BNSS + DP Act) and §B (History Sheeters / BCs) implemented | §C disposal & §D fines (`--`) |
| [`stat-30-zero-fir.js`](file:///d:/DPI/FIR/pharos-prototype/backend/src/modules/report-engine/fn/renderers/stat-30-zero-fir.js) | Full stub | Live calculation of Zero FIRs and transfers to PS/Agency | Received columns (`--`) |

### Remaining B6 gap:
* Kalandra disposal outcomes (bound down, put in court, fined, released on bond, filed, pending) emit `'--'`.
* **Unblocked by**: Adding a disposal outcome tracking field / sub-table to `arrest_details` for Kalandra records.

---

## Summary of cells changed from blocked to computable

1. **STAT_30 (Zero FIR & Transfers)**:
   * Rows 6 to 21 (16 crime heads) × Columns 3, 4, 5, 6, 7, 8 now query real data (`registered_fn`, `registered_upto`, `fwd_delhi_fn`, `fwd_delhi_upto`, `fwd_agency_fn`, `fwd_agency_upto`).
2. **STAT_21 (Kalandra Disposal Summary)**:
   * Row 6 (No. of Cases) × Columns 3 to 10 now query real counts for 126/169 and 126/170 BNSS Kalandras and persons detained.
3. **STAT_35 (DP Act Action Detail)**:
   * Rows 5 to 13 × Columns 3 to 6 now compute real Kalandras and persons under DP Act provisions.
4. **STAT_14 (Preventive Action Overview)**:
   * §A Rows 5 to 10 (U/s 126, 127, 128, 129, 172 BNSS and DP Act) now compute live FN & UPTO Kalandras and persons.
   * §B Rows 14 and 15 (History Sheeter / Bad Character arrests under 126/169 & 126/170 BNSS) now compute live counts from `arrestee_details.is_bc = true`.

---

## Summary of cells remaining as '--'

1. **STAT_30**: Columns 9 and 10 (Zero FIRs received from other states/PS) — requires `original_ps_id` schema addition.
2. **STAT_40 & STAT_41**: All judicial data cells — court disposal registry out of scope.
3. **STAT_21**: Rows 7 to 13 (Discharge, bound down, stay, sent to JC) — requires Kalandra disposal outcome tracking.
4. **STAT_35**: Columns 7 and 8 (Fine realised in Rs.) — fine collection register not tracked.
5. **STAT_14**: §C (Disposal) and §D (Fines realised).
