# Diary Formula Completion Report

## Head Mapping Coverage
- Total heads in `Menu_Tables.xlsx` (`local head` sheet): **156**
- Heads mapped with `canonical_code` before: **18**
- Heads mapped with `canonical_code` after this work: **156** (100% coverage across HIGH and MEDIUM confidence sets)
- Still unmapped / blocked: **0**
- See detailed mappings in [`10-HEAD-MAPPING-REVIEW.md`](file:///d:/DPI/FIR/pharos-prototype/context-bundle/10-HEAD-MAPPING-REVIEW.md).

---

## Section Group Coverage
- Section Groups defined in `backend/config/sections/section-groups.json`: **15 groups**
- Groups defined:
  - `HURT_SIMPLE`
  - `HURT_GRIEVOUS`
  - `RAPE_ALL`
  - `RAPE_64_1`
  - `GANG_RAPE`
  - `POCSO_PENETRATIVE`
  - `POCSO_ASSAULT`
  - `POCSO_HARASSMENT`
  - `POCSO_OTHER`
  - `ORGANISED_CRIME`
  - `TERROR`
  - `MO_WOMEN_ALL`
  - `ACID_ATTACK`
  - `ACID_ATTEMPT`
  - `TRAFFICKING`

---

## Case Status Vocabulary Confirmed
- Primary case status mapping file: `backend/config/diary/case-status-map.json`
- Mapped statuses:
  - `challan`: `["CHARGESHEETED", "CHALLAN", "PIR_JCL", "PIR-JCL", "CHARGESHEET"]`
  - `cancelled`: `["CANCELLED", "CANCELLATION", "CLOSURE", "UNFOUNDED", "FALSE"]`
  - `untraced`: `["UNTRACED", "UNTRACED_REPORT"]`
  - `pending`: `["PENDING_INVESTIGATION", "UNDER_INVESTIGATION", "PENDING"]`
  - `case_type_efir`: `["E_FIR", "EFIR", "E-FIR", "E_THEFT", "E_MVT"]`
  - `case_type_manual`: `["MANUAL", "REGULAR"]`
  - `case_type_zero_fir`: `["ZERO_FIR", "ZERO FIR"]`
  - `missing_type_abandoned`: `["ABANDONED", "DESERTED"]`
  - `missing_type_runaway`: `["RUNAWAY", "ELOPED"]`

---

## Renderer Status Summary

| Renderer | Before | After | Status / Blocker |
|---|---|---|---|
| `stat-18-vehicles-seized.js` | 5-line stub | Implemented | Seizure & Automobile join active |
| `stat-24-domestic-violence.js` | Partial stub | Implemented | Age-band × Gender missing persons active |
| `stat-38-bns-no-arrest.js` | 5-line stub | Implemented | Chargesheeted without arrest predicate |
| `stat-39-lsl-no-arrest.js` | 5-line stub | Implemented | L&SL chargesheeted without arrest predicate |
| `stat-12-organised-crime.js` | 5-line stub | Implemented | `fir_details.organised_crime` active |
| `stat-27-children-crime.js` | 5-line stub | Implemented | `persons.is_minor` victim predicate active |
| `stat-28-women-crime.js` | 5-line stub | Implemented | Female victim predicate active |
| `stat-14-preventive.js` | Stub | Clean Fallback | Blocked B6 (`—` rendered) |
| `stat-15-proclaimed-offenders.js` | Stub | Clean Fallback | Blocked B6 (`—` rendered) |
| `stat-21-kalandra.js` | Stub | Clean Fallback | Blocked B6 (`—` rendered) |
| `stat-22-sec223-bns.js` | Stub | Clean Fallback | Blocked B6 (`—` rendered) |
| `stat-29-trafficking.js` | Stub | Clean Fallback | Blocked B6 (`—` rendered) |
| `stat-30-zero-fir.js` | Stub | Clean Fallback | Blocked B6 (`—` rendered) |
| `stat-31-senior-citizens.js` | Stub | Clean Fallback | Blocked B6 (`—` rendered) |
| `stat-33-property-stolen-recovered.js` | Stub | Clean Fallback | Blocked B6 (`—` rendered) |
| `stat-34-dp-act.js` | Stub | Clean Fallback | Blocked B6 (`—` rendered) |
| `stat-35-preventive-detail.js` | Stub | Clean Fallback | Blocked B6 (`—` rendered) |
| `stat-40-court-stub.js` | Stub | Clean Fallback | Blocked B6 (`—` rendered) |
| `stat-41-court-lsl.js` | Stub | Clean Fallback | Blocked B6 (`—` rendered) |

---

## Police Station (PS) Metadata Status
- Seed script created: `backend/scripts/seed-diary-ps-metadata.mjs`
- Maps all 14 standard Central District PS nodes to `diary_abbr` and `diary_order`.

---

## What Remains Blocked (Intentionally Preserved)
- **Blocker B6 (Court / Disposal Registers)**: Kalandra disposals, preventive action court orders, proclaimed offender warrants, 66 DP Act court disposals, and court disposal registers. Renderers for these sheets cleanly output `—` with warnings logged.

---

## Recommended Next Actions
1. Launch Docker Desktop and start PostgreSQL (`docker compose up -d`).
2. Run `npm run db:migrate` inside `backend/` to apply `20260816000001_add_missing_canonical_codes.js`.
3. Run `node scripts/seed-diary-ps-metadata.mjs` inside `backend/` to populate PS metadata.
