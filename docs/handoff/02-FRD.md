# PHAROS — Functional Requirements Document
**Version:** 1.0 | **Date:** 2026-08-18 | **Audience:** Business analysts, QA engineers, feature developers

> Every requirement below is testable. Each FR can be verified with a specific database query, API call, or UI interaction.

---

## 1. Record Management

### FR-REC-01: Record Creation
- HC can create records of type `CASE`, `ARREST`, `PCR_CALL`, `MISSING`, `UIDB`
- Each record creation requires: `record_type`, `ps_id`, `record_date`
- `CASE` records require: `local_head_id` (crime head selection)
- `ARREST` records require: `arrest_type` (either `FIR` or `Kalandra`)
- FIR-based arrests must link to an existing `CASE` record via `record_links`
- Kalandra/DD-based arrests require `gd_no` + `gd_date`; `is_dd_based = true`
- System assigns a unique FIR number (format: `ps_id + year + sequence`) for CASE records
- FIR number is allocated using a row-locked counter (`fir_number_counters` table with `FOR UPDATE`)
- FIR number is immutable once assigned — never changes on transfer or amendment
- `SYSTEM_ADMIN` can also create records (for seeding / admin purposes)

### FR-REC-02: Record Editing
- Only HC who created the record can edit it
- Editing is only permitted when `current_status IN ('DRAFT', 'SENT_BACK')`
- `SYSTEM_ADMIN` can edit any record regardless of status
- Editing a submitted record that was returned (`SENT_BACK`) resets it to `DRAFT`
- Records with `is_frozen = true` (HQ-ACCEPTED) cannot be edited by any user
- Every edit appends a new row to `record_revisions` with a SHA-256 hash chain

### FR-REC-03: Case Status (Domain Status)
- Case status (`case_status`) is separate from workflow status (`current_status`)
- Valid case status values (from live DB): `PENDING_INVESTIGATION`, `UNDER_INVESTIGATION`, `CHALLAN`, `CHARGE SHEET`, `POLICE INVESTIGATION REPORT(PIR-JCL)`, `CANCELLED`, `UNTRACED`
- HC and SHO can update domain status via `PATCH /records/:id/status`
- Setting case status to any chargesheet variant automatically sets `sent_to_court_date` to today if not already set

### FR-REC-04: Arrest Types
- FIR-based arrests: must have `is_dd_based = false`; `record_links` row with `link_type = 'CASE_ARREST'` required
- Kalandra/DD-based arrests: must have `is_dd_based = true`; cannot link to a CASE record
- System prevents linking Kalandra arrests to CASE records (enforced in `linkResolver.js`)

### FR-REC-05: Transfer
- Any CASE record in an editable state can be transferred to another PS or to a specialised agency
- Transfer initiation: `POST /records/:id/workflow` with `action: transfer_initiate`
- Transfer sets `current_status = 'IN_TRANSFER'` and populates `fir_details.transfer_to_type`, `transferred_to_ps_id` / `transferred_to_agency_id`, `date_of_transfer`
- Receiving PS accepts or rejects via `transfer_accept` / `transfer_reject` actions
- On acceptance: record `ps_id` changes to receiving PS; status restores to pre-transfer value (`@PRIOR`)
- On rejection: record returns to originating PS with pre-transfer status restored (`@PRIOR`)

### FR-REC-06: Record Amendments
- After HQ acceptance (`is_frozen = true`), a record can be amended via formal amendment flow
- Amendment creates a `record_amendments` row; frozen status is temporarily lifted for the edit
- Amendments are tracked separately from normal revisions

### FR-REC-07: Duplicate Detection
- `GET /records/check-duplicate` checks for existing records with matching FIR number / GD number / complainant name before creation
- Returns potential duplicates for operator review — does not block creation

---

## 2. Workflow

### FR-WF-01: Submission
- HC submits a DRAFT record → status becomes `PS_SUBMITTED`
- SHO reviews at `PS_SUBMITTED` level
- System sends in-app notification to SHO on HC submission

### FR-WF-02: Approval Chain
- SHO approves → `SHO_REVIEWED` → forwarded to District review
- DISTRICT_OFFICER approves → `DISTRICT_REVIEW` → forwarded to HQ
- If `level_data_contracts` has `DIRECT_HQ` route active, District approval goes directly to `HQ_RECEIVED`
- HQ_ADMIN accepts → `ACCEPTED` (record frozen, `is_frozen = true`)

### FR-WF-03: Rejection (Send-Back)
- SHO, DISTRICT_OFFICER, JCP, SCP can send a record back to the previous level
- `send_back` action with a mandatory comment sets `current_status = 'SENT_BACK'`
- The originating HC is notified via in-app notification
- HC can then re-edit and resubmit

### FR-WF-04: Workflow Configuration
- All states and transitions are stored in `workflow_transitions_config` — zero hardcoded states in engine code
- Adding a new workflow step = inserting a row in `workflow_transitions_config`; no code change required
- The engine reads rules via `getRule(dbc, { fromStatus, action, recordType })`
- Wildcards supported: `from_status = '*'` and `record_type = '*'`

---

## 3. Diary Generation

### FR-DIARY-01: FN Diary (Fortnightly Diary)
- Generated per PS for any chosen fortnightly period (date range: `from_date` to `to_date`)
- Produced as XLSX download via `GET /api/phq-diary/generate?ps_id=...&from_date=...&to_date=...`
- Structure: 41 STAT sheets in a pre-formatted template with ExcelJS cell injection
- Date anchor: `records.registration_date` is the authoritative date field for all window calculations
- 25+ sheets produce live data; ~12 sheets are blocked or stubbed (see Known Issues 12-KNOWN-ISSUES.md §KI-003)

**Operational STAT sheets (returning live data):**
STAT_01 (Crime Overview), STAT_02 (Worked-Out Cases), STAT_07, STAT_08, STAT_11, STAT_12 (Organised Crime), STAT_13, STAT_14 (Preventive Actions), STAT_18 (Seized Vehicles), STAT_19, STAT_20, STAT_21 (Kalandra), STAT_22, STAT_23 (SC/ST), STAT_24, STAT_27, STAT_28, STAT_30 (Zero FIR), STAT_31 (North-East Residents), STAT_32 (Court-Directed), STAT_35 (DP Act), STAT_36, STAT_37, STAT_38, STAT_39, STAT_40 (BNS Court), STAT_41 (L&SL Court)

### FR-DIARY-02: PHQ Diary
- Generated for one or more districts by HQ analysts
- Nine sheets covering crime, arrests, manpower, and narcotics
- Produced via `POST /api/phq-diary/generate`
- Requires `canonical_code` mappings on `ref.local_heads` for head-sliced counts

### FR-DIARY-03: District Diary
- Generated per district for a date range
- All listing sheets structurally defined
- Produced via `GET /api/daily-diary/export`

### FR-DIARY-04: Daily Diary
- Generated per PS for a single day
- Shows all entries (cases, arrests, PCR, missing, UIDB) registered that day
- Produced via the Python report worker consuming `report.requested` events

---

## 4. Analytics

### FR-AN-01: PS Dashboard
- Shows total cases, arrest rates, case status distribution, and monthly trends for the logged-in PS
- Endpoints: `GET /api/analytics/ps-dashboard`, `GET /api/analytics/ps-dashboard-v2`
- Time period: configurable (current month, last fortnight, custom range)

### FR-AN-02: District Dashboard
- Shows cross-station comparison within the district
- Crime head matrix, station performance ranking
- Endpoint: `GET /api/analytics/by-district`

### FR-AN-03: HQ Dashboard
- All-Delhi crime trends, district breakdown, year-on-year comparison
- Crime head year trend: `GET /api/analytics/crime-head-year-trend`
- Report builder: `POST /api/v1/report-builder/query` for custom analysis

### FR-AN-04: Analytics Export
- Any authenticated user can export analytics data to Excel
- Endpoint: `GET /api/analytics/export`

---

## 5. Import

### FR-IMP-01: Bulk Import (Two-Phase)
- **Phase 1 (Validate)**: `POST /api/import/validate` — upload Excel file; system validates all rows and returns a batch ID + validation report
- **Phase 2 (Confirm)**: `POST /api/import/confirm/:batchId` — commits validated rows as records
- Supported record types: CASE, ARREST, PCR_CALL, MISSING, UIDB
- Template download: `GET /api/import/template/:record_type`
- Roles: HC, DISTRICT_OFFICER

### FR-IMP-02: Import Batch Management
- Batches can be cancelled before confirmation: `POST /api/import/batches/:batchId/cancel`
- Batch history visible to HC and DISTRICT_OFFICER: `GET /api/import/batches`

---

## 6. User Management

### FR-USR-01: User Creation
- SYSTEM_ADMIN can create users of any role
- SHO can create HC users scoped to their own PS
- User requires: `username`, `badge_no`, `name`, `password`, `role`, `ps_id` (for PS-level roles)

### FR-USR-02: Role Assignment
- SYSTEM_ADMIN can assign any role
- SHO can only create/manage HC users in their own PS
- Role determines: what records user sees, what actions they can take, what analytics they access

### FR-USR-03: Password Management
- `POST /api/users/:id/reset-password` — SYSTEM_ADMIN and SHO can reset passwords
- `PUT /api/auth/change-password` — any user can change their own password

---

## 7. Notifications

### FR-NOT-01: In-App Notifications
Events that trigger notifications:
- HC submits a record → SHO is notified
- SHO approves → record mover is notified
- SHO/DISTRICT_OFFICER sends back → HC is notified
- Transfer accepted at receiving PS → originating PS HC notified

Endpoints:
- `GET /api/notifications` — list unread notifications
- `GET /api/notifications/count` — unread count badge
- `PATCH /api/notifications/:id/read` — mark as read
- `GET /api/notifications/stream` — SSE stream for real-time push

---

## 8. Audit

### FR-AUD-01: Audit Trail
- Every write to a record creates a row in `record_revisions` with:
  - `change_summary` (JSON diff)
  - `hash` (SHA-256 of previous hash + payload — hash chain)
  - `changed_by` (user ID)
  - `changed_at` (timestamp)
- The hash chain provides tamper evidence: if any revision is altered, all subsequent hashes become invalid

### FR-AUD-02: Hash Chain Verification
- `GET /api/audit/chain-verify?ps_id=...` — SYSTEM_ADMIN can verify the integrity of the full audit chain for a PS
- Also available as a script: `npm run audit:verify`

### FR-AUD-03: Record Freeze
- `POST /api/audit/records/:recordId/freeze` — SYSTEM_ADMIN can manually freeze a record (sets `is_frozen = true`)
- `POST /api/audit/records/:recordId/unfreeze` — SYSTEM_ADMIN can unfreeze a record for amendment

---

## 9. Field Registry

### FR-FLD-01: Dynamic Form Fields
- All form fields in PHAROS are driven by `field_registry` table — no hardcoded form schemas in frontend components
- Field registry loaded via `GET /api/fields/form/:record_type`
- Each field has: `field_key`, `label`, `field_type`, `required`, `show_when` (conditional display rule), `required_when`
- `show_when` is evaluated client-side against the current form values (e.g. `show_when: { "arrest_type": "FIR" }`)

### FR-FLD-02: Field Registry Management
- SYSTEM_ADMIN can add, edit, enable/disable fields via the Field Manager UI
- Changes take effect immediately on next form load
- Fields can be toggled without deletion: `PATCH /api/fields/:id/toggle`

---

## 10. Non-Functional Requirements

### NFR-01: Performance
- Record list page must load in < 2 seconds for up to 1,000 records
- Diary generation must complete in < 3 minutes for a PS with 500 records
- Analytics summary endpoint must respond in < 1 second

### NFR-02: Security
- JWT access tokens expire in 15 minutes; refresh tokens in 7 days (httpOnly cookie)
- All endpoints require authentication except `/api/health` and `/api/logs/client`
- Default-deny RBAC: every endpoint has an explicit `allow()` rule or is open by design
- Data scoping: `enforceScope` middleware rejects cross-PS/district requests at API level
- CSRF protection: double-submit cookie pattern
- HTTP security headers: `helmet` middleware applied

### NFR-03: Audit Completeness
- Every write to a record must produce a `record_revisions` row with hash chain
- Hash chain integrity must be verifiable via the audit endpoint
- `workflow_transitions` ledger is append-only (no updates or deletes)

### NFR-04: Availability
- System must handle RabbitMQ unavailability gracefully (in-memory EventEmitter fallback)
- Diary generation failures must log errors and return a 500 with details — must not crash the API process

### NFR-05: Internationalisation
- All form labels must be available in English and Hindi (via `i18next`)
- Status labels must be translated in the UI
- Hindi translations must be maintained in `frontend/src/i18n/hi.json`
