# Statutory FIR Generation and Form Synchronization Rules

## 1. Statutory 8-Digit Prefix Resolution Rules
Each registration type uses a dedicated 8-digit prefix calculated from jurisdiction registries:
- **`MANUAL_CCTNS`**: `08` + `3-digit District Code` + `3-digit PS Code` (e.g., `08165015` for District 165, PS 015)
- **`E_THEFT`**: `08158` + `3-digit PS Code` (e.g., `08158046` for PS 046)
- **`E_MVT`**: `08159` + `3-digit PS Code` (e.g., `08159046` for PS 046)
- **`NCRP`**: `01816` + `3-digit PS Code` (e.g., `01816046` for PS 046)
- **`ZERO_FIR`**: `08156` + `3-digit PS Code` (e.g., `08156046` for PS 046)

## 2. State & Payload Synchronization Rules
- `case_type` selection on frontend (`eTheft`, `eMVT`, `NCRP`, `zero FIR`, `cctns(manual FIR)`) MUST map to its corresponding `registration_type` constant (`E_THEFT`, `E_MVT`, `NCRP`, `ZERO_FIR`, `MANUAL_CCTNS`).
- In `records.service.js` (`insertRecordCore` / `updateRecordCore`), `determineRegistrationType` checks `case_type` normalization FIRST before falling back to `MANUAL_CCTNS`.
- `case_type` and `registration_type` MUST remain in sync across creation, draft saving, form edits, and final submission.

## 3. Leading Zero Preservation Rules
- 8-digit prefixes (`08...`, `01816...`) and 14-digit statutory FIR numbers MUST be preserved as string primitives (`String(fir_no).trim()`).
- NEVER parse or convert 14-digit statutory FIR numbers to numbers/integers, which would strip leading zeros (`0`).

## 4. Flexible FIR Search Rules
- Search step in Arrest registration accepts FIR Date, FIR Number, or Complainant Name (individually or combined).
- FIR Date is optional; searching by date matches both `fir_date` and `record_date`.
