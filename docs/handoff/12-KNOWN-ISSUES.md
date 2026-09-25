# PHAROS — Known Issues, Technical Debt & Blockers
**Version:** 1.0 | **Date:** 2026-08-18 | **Audience:** All engineers, QA, product leadership  
**Integrity Note:** This is an honest technical audit of the current prototype state.

---

## 1. Critical Issues & Technical Debt

### KI-001: Port Configuration Mismatch
- **Description:** `.env.example` lists `DATABASE_URL` with default port `5432`, whereas `docker-compose.yml` maps host `5435:5432` to avoid local PostgreSQL conflicts. New developers copying `.env.example` frequently encounter connection refused errors.
- **Impact:** Developer friction during initial setup.
- **Resolution:** Standardize documentation and update all example `.env` files to explicitly reference port `5435`.

### KI-002: Bad Link on One Historical Kalandra Record
- **Description:** Record `b21a6b79-a29a-44a7-ba9c-0c78c5693412` had a legacy `CASE_ARREST` link despite having `is_dd_based = true` due to an unconstrained `backfillOrphansForCase` routine.
- **Impact:** Kalandra was linked as an FIR arrest.
- **Resolution:** Guard `.where('d.is_dd_based', false)` applied to `linkResolver.js`. Legacy orphaned link row quarantined.

### KI-003: Head-Sliced Diary Null Counts for Unmapped Heads
- **Description:** 58 local crime heads have `canonical_code` mapped (unlocking core PHQ & STAT sheets). The remaining 98 heads without a canonical code return `0` for head-sliced diary queries.
- **Impact:** Sub-offences not covered by the 58 canonical heads do not increment specialized diary columns.
- **Resolution:** 58 high-confidence heads seeded via migration `20260818000011_canonical_codes.js`. Remaining heads are specialized local municipal infractions.

### KI-004: Frontend Table Typography & Viewport Calibration
- **Description:** Standard DPI desktop displays required explicit type scaling and helper formatting to ensure reference numbers, gists, and status badges aligned seamlessly.
- **Resolution:** Implemented `recordRef.js` (`formatRecordRef`, `formatGist`) and `statusConfig.js` (`getStatusConfig`) across `MyRecords.jsx`.

---

## 2. High Priority Operational Considerations

### KI-005: `record_transfers` Table Redundancy
- **Description:** Real transfer metadata (`transfer_to_type`, `transferred_to_ps_id`, `transferred_to_agency_id`, `date_of_transfer`) is stored directly on `fir_details`. The `record_transfers` table exists in the schema but is empty.
- **Impact:** Zero operational loss because `fir_details` and `workflow_transitions` manage transfers, but schema contains an unused table.
- **Resolution:** Mark `record_transfers` for deprecation.

### KI-006: Ref Schema Beat-to-PS Linkage Backfill
- **Description:** `ref.beats` table contains 2,855 beats. The initial seed did not populate foreign key `ps_id`.
- **Resolution:** Migration and backfill script `backfill-beats-ps-id.mjs` ran successfully, achieving 100% (2,855 / 2,855) beat-to-PS linkage.

### KI-007: Frontend Route Guards
- **Description:** While backend endpoints strictly enforce role authorization (`allow()`) and data boundaries (`enforceScope`), several frontend routes previously lacked client-side role guards.
- **Resolution:** Added `ProtectedRoute` role wrappers for `/compile`, `/admin/hierarchy`, `/admin/fields`, `/admin/audit`, and `/admin/level-contracts` in `AppRouter.jsx`.

---

## 3. Medium Priority Items

### KI-008: ZONE and RANGE Level Workflow Activation
- **Description:** The `hierarchy_nodes` schema fully supports `ZONE` and `RANGE` nodes, but `workflow_transitions_config` currently models the direct `PS -> DISTRICT -> HQ` path.
- **Impact:** Intermediate senior supervisory ranks currently use District or HQ analyst views.

### KI-009: JCP / SCP Dedicated Approval Actions
- **Description:** `/records/:id/jcp-approve` and `/records/:id/scp-approve` endpoints exist in the API router, but default workflow transitions route `DISTRICT_REVIEW -> HQ_RECEIVED` via `DIRECT_HQ` level contracts.
- **Impact:** JCP/SCP specific approval transitions are bypassed by design in the current operational prototype.

### KI-010: Unused Dependencies in Backend
- **Description:** `mongoose` is listed in `backend/package.json` from early prototyping. PHAROS uses Knex.js and PostgreSQL exclusively.
- **Impact:** Harmless but adds ~20MB to `node_modules`.

### KI-011: Unrotated Large Log Files
- **Description:** `backend/logs/backend.log` and `combined.log` can grow large without Winston log rotation configured in long-running test environments.
- **Impact:** Disk space usage in development.

---

## 4. Blocked Features Pending Product Decisions

### KI-012: Court Proceedings Module (Blocker B5)
- **Status:** Strategic Compromise Implemented.
- **Details:** Dedicated `court_cases`, `court_hearings`, and `court_disposals` tables were deferred. Basic court milestones (`sent_to_court_date`, `court_case_no`, `court_disposal_type`, `court_disposal_date`) are captured in `fir_details` columns. Full judicial trial lifecycle awaits NJDG integration.

### KI-013: Kalandra Judicial Disposal Outcomes (Blocker B6)
- **Status:** Arrest Tracking Complete; Disposal Blocked.
- **Details:** Preventive Kalandra arrests under 126/169 and 126/170 BNSS are captured via `is_dd_based = true`. However, post-arrest SEM/Court disposal registers (bound down / fined) require future schema extension if detailed judicial outcomes are needed.

### KI-014: Proclaimed Offenders Register (Blocker B6)
- **Status:** STAT_15 Rendered as Blocked Stub.
- **Details:** Tracking of POs requires a dedicated register linking active court warrants to accused profiles.

### KI-015: Daily Manpower & Deployment (Blocker B7)
- **Status:** STAT_34 Rendered as Blocked Stub.
- **Details:** STAT_34 requires daily station staff duty roll returns, which is outside the core crime records scope.
