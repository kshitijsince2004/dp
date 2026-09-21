# PHAROS TAXONOMY LOCK FILE
**Status**: LOCKED (Database-enforced constraints + Canonical Normalization Mappings)
**Updated**: 2026-09-21

> [!IMPORTANT]
> No code outside this file may hardcode a taxonomy value list or enum normalization mapping. Any code found doing so must import from here or its generated programmatic modules (`python_worker/formula_library.py` / Node shared constants).

---

## 1. Database-Enforced Enum Taxonomies

### 1.1 Local Heads (`ref.local_heads`)
- **Total Crime Heads**: 158
- **Breakdown**:
  - `HEINOUS`: 7 heads (`Murder`, `Attempt to Murder`, `Dacoity`, `Robbery`, `Extortion`, `Riot`, `Kidnapping for Ransom`)
  - `NON_HEINOUS`: 76 heads
  - `OTHER`: 75 heads (includes `Organized Crime (BNS 111)` - `local_head_cd = 216` / `ORGANIZED_CRIME_BNS_111` and `Terrorist Acts (BNS 113)` - `local_head_cd = 217` / `TERRORIST_ACTS_BNS_113`)
- **Constraint**: Protected by database `chk_local_heads_crime_category`.

### 1.2 Record Types (`records.record_type`)
- **Allowed Values**: `['CASE', 'ARREST', 'MISSING', 'UIDB', 'PCR_CALL']`
- **Constraint**: Protected by database `chk_records_record_type`.

### 1.3 Person Roles (`persons.role`)
- **Allowed Values**: `['COMPLAINANT', 'ACCUSED', 'VICTIM', 'ARRESTEE', 'MISSING', 'DECEASED', 'INFORMANT', 'IO', 'MISSING_CHILD', 'CALLER']`
- **Constraint**: Protected by database `chk_persons_role`.

### 1.4 Workflow Status (`records.current_status`)
- **Allowed Values**: `['SUBMITTED', 'COMPILED', 'DRAFT', 'APPROVED', 'HQ_RECEIVED', 'PENDING_SHO', 'SENT_BACK', 'DISTRICT_REVIEW']`
- **Constraint**: Protected by database `chk_records_current_status`.

### 1.5 Governance Level (`records.current_level`)
- **Allowed Values**: `['PS', 'HQ', 'DISTRICT']`
- **Constraint**: Protected by database `chk_records_current_level`.

### 1.6 Source System (`records.source_system`)
- **Allowed Values**: `NULL`, `'MANUAL'`, `'E_MVT'`, `'E_THEFT'`, `'NCRP'`
- **Constraint**: Protected by database `chk_records_source_system`.

---

## 2. Enum Normalization Mappings (Display & Intake Layer)

### 2.1 Custody Status (`arrest_details.custody_status`)
- **Raw Values Present in DB**: `'J/C'`, `'Notice 35(1) BNSS'`, `'Bail'`, `'P/C'`, `'Notice u/s 35(1) BNSS'`
- **Canonical Display Mapping**:
  - `'J/C'` -> `'J/C'` (Judicial Custody)
  - `'P/C'` -> `'P/C'` (Police Custody)
  - `'Bail'` -> `'Bail'`
  - `'Notice 35(1) BNSS'` -> `'Notice 35(1) BNSS'`
  - `'Notice u/s 35(1) BNSS'` -> `'Notice 35(1) BNSS'` (Normalized: collapses 'u/s' variation to standard BNSS notice phrasing)
- **Data Cleanup Note**: A future DB pass should `UPDATE arrest_details SET custody_status = 'Notice 35(1) BNSS' WHERE custody_status = 'Notice u/s 35(1) BNSS';`.

### 2.2 Missing Status (`missing_details.missing_status`)
- **Raw Values Present in DB**: `'PENDING'`, `'TRACED'`, `'Traced'`
- **Canonical Display Mapping**:
  - `'PENDING'` -> `'PENDING'`
  - `'TRACED'` -> `'TRACED'`
  - `'Traced'` -> `'TRACED'` (Normalized: upper-case fold)
- **Data Cleanup Note**: A future DB pass should `UPDATE missing_details SET missing_status = 'TRACED' WHERE missing_status = 'Traced';`.

### 2.3 UIDB Status (`uidb_details.uidb_status`)
- **Raw Values Present in DB**: `'Unidentified'`, `'PENDING'`, `'IDENTIFIED'`
- **Canonical Display Mapping**:
  - `'Unidentified'` -> `'UNIDENTIFIED'` (Normalized: upper-case fold)
  - `'PENDING'` -> `'PENDING'`
  - `'IDENTIFIED'` -> `'IDENTIFIED'`
- **Data Cleanup Note**: A future DB pass should `UPDATE uidb_details SET uidb_status = 'UNIDENTIFIED' WHERE uidb_status = 'Unidentified';`.

---

## 3. E-FIR Registration Channel Rules
- **E-FIR Combined Channels**: `E_THEFT` + `E_MVT`
- **Manual FIR Channel**: `MANUAL` (or NULL)
- **NCRP Channel**: `NCRP`
