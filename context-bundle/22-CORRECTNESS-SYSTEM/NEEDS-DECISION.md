# Report Engine — Decisions Requiring Domain Expert Input (SO Branch / Crime Branch)

> **Instructions:** These items represent true domain ambiguities that cannot be resolved by code or math alone.
> An authorized officer must select a Decision option for each item below.
> Once filled out, run `node backend/scripts/apply-decisions.mjs` to automatically update system configuration and contract registers.

---

## D1 — Zero-Denominator Display Convention
**Sheets affected:** Every sheet with a Variation % or Detection % column (STAT 1-41, PHQ Matrix, District Compilations).

**Context:** When previous year baseline is 0 and current year count is >0:
- **Option A (Legacy Paper Format):** Display literal `+∞` or `Infinity`.
- **Option B (Standard Analytics Format - Recommended):** Display `-` or `100.0%` (prevents downstream aggregation & Excel parsing errors).

**Decision:** Option B  
**Decided by:** SO Branch / Crime Branch  
**Date:** 2026-08-27  

---

## D2 — Cyber Fraud Categorization (IPC/BNS vs IT Act)
**Sheets affected:** STAT_1 (BNS Cases Reported), STAT_32 (Cyber Crime).

**Context:** Should financial cyber fraud registered under both BNS (Cheating) and IT Act 66D be counted under:
- **Option A:** Both STAT_1 (Cheating) AND STAT_32 (Cyber Crime).
- **Option B (Exclusive Primary Head):** Count exclusively under STAT_32 (Cyber Crime) to avoid double-counting in Grand Total.

**Decision:** Option B  
**Decided by:** SO Branch / Crime Branch  
**Date:** 2026-08-27  

---

## D3 — Kalandra Preventive Action Disposal Status
**Sheets affected:** STAT_21 (Kalandra), STAT_35 (Preventive Detail).

**Context:** How should bound-down preventive cases under 107/151 CrPC / BNSS be mapped in disposal columns:
- **Option A:** Map bound-down as `PROSECUTED / BOUND_DOWN`.
- **Option B:** Map bound-down as `DISCHARGED / CLOSED`.

**Decision:** Option A  
**Decided by:** Crime Branch  
**Date:** 2026-08-27  

---

## D4 — Demographic Residence Null Handling (Delhi vs Outside Delhi)
**Sheets affected:** STAT_20 (Arrestee Demographics).

**Context:** When `persons.perm_location_id` or `locations.state` is null / unspecified:
- **Option A:** Default null residence to `Delhi` (local jurisdiction assumption).
- **Option B (Unspecified Category):** Group null state under `Outside Delhi / Unspecified`.

**Decision:** Option B  
**Decided by:** Crime Branch  
**Date:** 2026-08-27  

---

## D5 — Supplementary Chargesheet History Storage
**Sheets affected:** Record Details, Audit Trail, STAT_40/41 (Court & Judicial Status).

**Context:** `fir_details.supplementary_chargesheet_details` is a single TEXT column. A second supplementary chargesheet overwrites the first's text on the live record (recoverable via `record_revisions`, not visible on the main case view or in any report).

Options:
- **Option A:** Accept as a documented first-version limitation (matches how original court fields were added directly to `fir_details` as a stated compromise).
- **Option B:** Build a proper dated `supplementary_chargesheets` table (`record_id`, `filed_date`, `details`, `filed_by`) supporting multiple entries.

**Decision:** Option A  
**Decided by:** Crime Branch / System Architect  
**Date:** 2026-09-06  

