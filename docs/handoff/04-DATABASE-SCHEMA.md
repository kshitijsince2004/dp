# PHAROS — Database Schema Reference
**Version:** 1.0 | **Date:** 2026-08-18 | **Audience:** Backend engineers, DBAs

> **Source of truth**: `backend/migrations/` — this document is a synthesised reference, not the definition. Always verify against the actual migration files before writing schema-dependent code.

---

## 1. Schema Overview

- **`public` schema**: 28 transactional tables
- **`ref` schema**: 21 lookup tables (loaded from `Menu_Tables.xlsx` via `npm run load-ref`)
- **Migration tool**: Knex.js — 11 migrations applied in sequence
- **Migration convention**: Schema-only — no data rows in migration files

---

## 2. Migration History

| # | Migration File | What It Added |
|---|---|---|
| 1 | `20260711000001_org_identity.js` | `hierarchy_nodes`, `users`, `investigating_officers` |
| 2 | `20260711000002_ref_schema.js` | `ref.*` schema — all 21 lookup tables |
| 3 | `20260711000003_records_core.js` | `records` (spine), all 5 detail tables, `record_offences`, `record_properties`, `persons`, `locations`, `record_links`, `record_amendments`, `record_revisions` |
| 4 | `20260711000004_operational.js` | `workflow_transitions_config`, `workflow_transitions`, `field_registry`, `fir_number_counters`, `audit_logs`, `notifications`, `import_batches`, `record_status_events`, `record_transfers`, `filter_presets` |
| 5 | `20260711000005_reporting.js` | `report_templates`, `report_jobs`, `stat_baselines`, `level_data_contracts`, `compilations` |
| 6 | `20260722000001_add_canonical_code_to_local_heads.js` | `ref.local_heads.canonical_code` column |
| 7 | `20260722000002_add_diary_fields_to_hierarchy.js` | `hierarchy_nodes.diary_abbr`, `diary_order`; `ref.beats.ps_id` backfill support |
| 8 | `20260811000001_add_missing_fields.js` | Additional FIR detail fields (various) |
| 9 | `20260818000001_add_ps_diary_metadata.js` | PS diary metadata population (diary_abbr, diary_order for 225 PS nodes) |
| 10 | `20260818000010_missing_diary_fields.js` | 16 missing diary columns, `victim_injury_details`, `ref.burglary_mo` |
| 11 | `20260818000011_canonical_codes.js` | 58 canonical code updates on `ref.local_heads` |

---

## 3. Core Tables (public schema)

### `hierarchy_nodes` — Organisation Tree
**Purpose**: Stores the entire Delhi Police command hierarchy — HQ, zones, ranges, districts, sub-divisions, and police stations.

| Column | Type | Nullable | Notes |
|---|---|---|---|
| `id` | uuid | NO | PK, `gen_random_uuid()` |
| `node_type` | varchar(30) | NO | CHECK: `HQ`, `ZONE`, `RANGE`, `DISTRICT`, `SUB_DIV`, `PS` |
| `name` | varchar(150) | NO | Display name |
| `code` | varchar(30) | NO | UNIQUE — used as canonical reference |
| `parent_id` | uuid | YES | FK → `hierarchy_nodes(id)` |
| `metadata` | jsonb | NO | Default `{}` — flexible PS metadata |
| `diary_abbr` | varchar | YES | Short abbreviation for diary sheets |
| `diary_order` | int | YES | Sort order within district for diary |
| `is_active` | boolean | NO | Default `true` |
| `created_at` | timestamptz | NO | Auto |
| `updated_at` | timestamptz | NO | Auto |

**Indexes**: `idx_hierarchy_nodes_parent` (parent_id), `idx_hierarchy_nodes_type` (node_type)

**Business rules**:
- 225 PS nodes with `diary_abbr` and `diary_order` populated (100%)
- 23 DISTRICT nodes (15 territorial + 8 specialised units)
- Root HQ node has `parent_id = NULL`

---

### `users` — User Accounts
**Purpose**: All PHAROS user accounts with role and hierarchy assignment.

| Column | Type | Nullable | Notes |
|---|---|---|---|
| `id` | uuid | NO | PK |
| `username` | varchar(50) | NO | UNIQUE |
| `badge_no` | varchar(50) | NO | UNIQUE — police badge/PIS number |
| `name` | varchar(100) | NO | Display name |
| `password_hash` | varchar(255) | NO | bcrypt hash |
| `role` | varchar(20) | NO | CHECK: `HC`, `SHO`, `ACP`, `DISTRICT_OFFICER`, `JCP`, `SCP`, `HQ_ANALYST`, `HQ_ADMIN`, `SYSTEM_ADMIN` |
| `ps_id` | uuid | YES | FK → `hierarchy_nodes(id)` — for PS-level roles |
| `district_id` | uuid | YES | FK → `hierarchy_nodes(id)` — for district-level roles |
| `sub_div_id` | uuid | YES | FK → `hierarchy_nodes(id)` — for sub-division roles |
| `is_active` | boolean | NO | Default `true` |
| `last_login` | timestamptz | YES | Updated on each login |
| `created_at` | timestamptz | NO | Auto |
| `updated_at` | timestamptz | NO | Auto |

**Indexes**: `idx_users_ps` (ps_id), `idx_users_district` (district_id), `idx_users_role` (role)

---

### `records` — Record Spine
**Purpose**: The single master row for every police record regardless of type. All other record data hangs off this table.

| Column | Type | Nullable | Notes |
|---|---|---|---|
| `id` | uuid | NO | PK |
| `record_type` | varchar(20) | NO | CHECK: `CASE`, `ARREST`, `PCR_CALL`, `MISSING`, `UIDB` |
| `ps_id` | uuid | NO | FK → `hierarchy_nodes(id)` — current owning PS |
| `district_id` | uuid | YES | FK → `hierarchy_nodes(id)` |
| `created_by` | uuid | YES | FK → `users(id)` |
| `current_status` | varchar(50) | NO | Workflow status (see §workflow) |
| `current_level` | varchar(30) | YES | `PS`, `DISTRICT`, `HQ`, etc. |
| `is_frozen` | boolean | NO | Default `false` — `true` after HQ acceptance |
| `record_date` | date | YES | Date the event occurred |
| `registration_date` | date | YES | Date the record was registered — **authoritative date for diary** |
| `created_at` | timestamptz | NO | Auto |
| `updated_at` | timestamptz | NO | Auto |

**Business rules**:
- `is_frozen = true` prevents all edits (set on HQ acceptance)
- `ps_id` reflects **current** owning PS — changes on transfer acceptance
- `current_status` must match a value in `workflow_transitions_config`

---

### `fir_details` — CASE Record Detail
**Purpose**: All CASE (FIR) specific fields beyond the spine record.

Key columns (not exhaustive):

| Column | Type | Notes |
|---|---|---|
| `record_id` | uuid | FK → `records(id)`, PK |
| `fir_no` | varchar | FIR number — immutable once assigned |
| `fir_year` | int | Year of FIR registration |
| `local_head_id` | int | FK → `ref.local_heads(local_head_cd)` — crime head |
| `is_worked_out` | boolean | Whether case is solved |
| `case_status` | varchar | Domain case status (chargesheeted, cancelled, etc.) |
| `brief_facts` | text | Gist / summary of the case |
| `transfer_to_type` | varchar | `PS` or `Agency` — set on transfer initiation |
| `transferred_to_ps_id` | uuid | FK → `hierarchy_nodes(id)` for PS transfers |
| `transferred_to_agency_id` | varchar | Agency code for agency transfers |
| `date_of_transfer` | date | When transfer was initiated |
| `registered_on_direction` | boolean | `true` if registered on court direction u/s 175(3) BNSS |
| `sent_to_court_date` | date | Auto-set when `case_status` → chargesheet variant |
| `court_case_no` | varchar | Court case number (if known) |
| `court_name` | varchar | Court name |
| `court_disposal_type` | varchar | `CONVICTED`, `ACQUITTED`, `COMPOUNDED`, etc. |
| `court_disposal_date` | date | Date of court disposal |

---

### `arrest_details` — ARREST Record Detail
**Purpose**: All arrest-specific fields.

Key columns:

| Column | Type | Notes |
|---|---|---|
| `record_id` | uuid | FK → `records(id)`, PK |
| `is_dd_based` | boolean | `true` = Kalandra/preventive; `false` = FIR-based |
| `arrest_date` | date | Date of arrest |
| `local_head_id` | int | FK → `ref.local_heads(local_head_cd)` |
| `gd_no` | varchar | General Diary number (Kalandra only) |
| `gd_date` | date | General Diary date (Kalandra only) |
| `case_status` | varchar | Custody status |

---

### `persons` — Person Records
**Purpose**: All persons associated with a record (complainant, accused, victim, witness, etc.).

| Column | Type | Notes |
|---|---|---|
| `id` | uuid | PK |
| `record_id` | uuid | FK → `records(id)` |
| `person_type` | varchar | `COMPLAINANT`, `ACCUSED`, `VICTIM`, `WITNESS` |
| `name` | varchar | Person's name |
| `age` | int | Age |
| `gender` | varchar | `MALE`, `FEMALE`, `TRANSGENDER` |
| `is_minor` | boolean | Generated stored column: `age < 18` — never recompute in app code |
| `perm_location_id` | uuid | FK → `locations(id)` — permanent address |
| `social_category` | varchar | SC/ST/OBC/General |

---

### `record_offences` — Sections Charged
**Purpose**: Individual BNS/IPC/Act sections charged in a CASE or against an ARREST.

| Column | Type | Notes |
|---|---|---|
| `id` | uuid | PK |
| `record_id` | uuid | FK → `records(id)` |
| `section_code` | text | FK → `ref.sections(section_code)` |
| `act_cd` | int | FK → `ref.acts(act_cd)` |
| `is_primary` | boolean | Only one `true` per record (partial unique index) |

---

### `record_revisions` — Audit Hash Chain
**Purpose**: Tamper-evident audit trail for every record mutation.

| Column | Type | Notes |
|---|---|---|
| `id` | uuid | PK |
| `record_id` | uuid | FK → `records(id)` |
| `revision_number` | int | Sequential per record |
| `change_summary` | jsonb | JSON diff of what changed |
| `changed_by` | uuid | FK → `users(id)` |
| `changed_at` | timestamptz | When the change occurred |
| `hash` | varchar(64) | SHA-256(`previousHash` + JSON.stringify(`change_summary`)) |

---

### `workflow_transitions_config` — State Machine Definition
**Purpose**: Every valid state transition across all record types and roles. This IS the workflow engine config.

| Column | Type | Notes |
|---|---|---|
| `id` | uuid | PK |
| `code` | varchar | Unique transition code (e.g. `CASE_PS_SUBMIT`) |
| `record_type` | varchar | Record type or `*` (wildcard) |
| `from_status` | varchar | Source status or `*` (wildcard) |
| `action` | varchar | Action name (e.g. `submit`, `approve`, `transfer_initiate`) |
| `to_status` | varchar | Target status or `@PRIOR` |
| `from_level` | varchar | Level that performs this action |
| `to_level` | varchar | Level that receives the record |
| `allowed_roles` | jsonb | Array of role codes (e.g. `["SHO", "DISTRICT_OFFICER"]`) |
| `requires_comment` | boolean | Whether a comment is mandatory |
| `is_active` | boolean | Whether this transition is currently enabled |

---

### `workflow_transitions` — Append-Only Transition Ledger
**Purpose**: Historical record of every state transition. Append-only — never update or delete.

| Column | Type | Notes |
|---|---|---|
| `id` | uuid | PK |
| `record_id` | uuid | FK → `records(id)` |
| `from_status` | varchar | Status before transition |
| `to_status` | varchar | Status after transition |
| `from_level` | varchar | Level before transition |
| `to_level` | varchar | Level after transition |
| `action` | varchar | Action performed |
| `performed_by` | uuid | FK → `users(id)` |
| `performed_at` | timestamptz | When it occurred |
| `comment` | text | Optional reviewer comment |

**Critical**: This table is queried by `@PRIOR` resolution logic. Deleting rows will break transfer restores.

---

### `field_registry` — Dynamic Form Fields
**Purpose**: Drives all form fields in the frontend. Adding a row here adds a field to the form.

| Column | Type | Notes |
|---|---|---|
| `id` | uuid | PK |
| `record_type` | varchar | Which record type this field applies to |
| `field_key` | varchar | Unique field identifier (maps to DB column) |
| `label_en` | varchar | English label |
| `label_hi` | varchar | Hindi label |
| `field_type` | varchar | `text`, `select`, `date`, `boolean`, `textarea`, etc. |
| `is_required` | boolean | Always required |
| `show_when` | jsonb | Conditional display rule |
| `required_when` | jsonb | Conditional required rule |
| `is_active` | boolean | Whether field appears in form |
| `display_order` | int | Sort order within form section |

---

### `fir_number_counters` — Sequential FIR Number Generator
**Purpose**: Ensures no two FIRs at the same PS in the same year get the same number.

| Column | Type | Notes |
|---|---|---|
| `ps_id` | uuid | FK → `hierarchy_nodes(id)` |
| `year` | int | Calendar year |
| `last_sequence` | int | Last assigned sequence number |

**Business rule**: Increment is done with `SELECT ... FOR UPDATE` row lock inside a transaction. Never update this table outside `records.service.js`.

---

### `import_batches` — Bulk Import State
**Purpose**: Tracks the state of each two-phase bulk import operation.

| Column | Type | Notes |
|---|---|---|
| `id` | uuid | PK |
| `ps_id` | uuid | FK → `hierarchy_nodes(id)` |
| `created_by` | uuid | FK → `users(id)` |
| `record_type` | varchar | Type of records in this batch |
| `status` | varchar | `PENDING_CONFIRM`, `PROCESSING`, `COMPLETE`, `CANCELLED`, `FAILED` |
| `total_rows` | int | Total rows in the uploaded file |
| `valid_count` | int | Rows that passed validation |
| `error_count` | int | Rows that failed validation |
| `validation_report` | jsonb | Per-row error details |
| `imported_count` | int | Rows successfully inserted |

---

## 4. Reference Schema (`ref.*`)

| Table | Purpose | Key Column |
|---|---|---|
| `ref.acts` | Legislation (Arms Act, NDPS, BNS, etc.) | `act_cd` (int PK) |
| `ref.sections` | Individual BNS/IPC/Act sections | `section_code` (text PK) |
| `ref.major_heads` | Major crime category heads | `major_head_code` (int PK) |
| `ref.minor_heads` | Sub-categories under major heads | `minor_head_cd` (int PK) |
| `ref.major_minor_mapping` | Section → major head mapping | `sec_mjrhd_cd` (int PK) |
| `ref.local_heads` | Police station local crime heads (156 rows) | `local_head_cd` (int PK) |
| `ref.local_heads.canonical_code` | Standardised diary aggregation key | Added in migration 6 |
| `ref.beats` | Police beat boundaries (2,855 rows) | `beat_cd` (varchar PK) |
| `ref.beats.ps_id` | Backfill — links each beat to its PS | FK → `hierarchy_nodes` |
| `ref.property_categories` | Stolen/recovered property categories | `parent_cd` (int PK) |
| `ref.other_property_items` | Individual property items | `property_cd` (int PK) |
| `ref.arms_categories` | Arms category classification | `arms_category_cd` (int PK) |
| `ref.arms_made` | Arms manufacturer origin | `arms_made_cd` (int PK) |
| `ref.fire_arms` | Specific firearm types | `fire_arms_cd` (int PK) |
| `ref.fire_arms_subtypes` | Firearm sub-classifications | — |
| `ref.nationality` | Country of nationality | — |
| `ref.drug_types` | Narcotic drug types | `drug_type_cd` (int PK) |
| `ref.burglary_mo` | Burglary modus operandi | Added in migration 10 |
| `ref.state_districts` | Indian states and districts (for address) | — |

---

## 5. Key Relationships

```
hierarchy_nodes ──< users
hierarchy_nodes ──< records (ps_id, district_id)
hierarchy_nodes ──< ref.beats (ps_id)

records ──── fir_details       (1:1, by record_id)
records ──── arrest_details    (1:1, by record_id)
records ──── pcr_call_details  (1:1, by record_id)
records ──── missing_details   (1:1, by record_id)
records ──── uidb_details      (1:1, by record_id)

records ──< persons            (1:many — complainant, accused, victim)
records ──< record_offences    (1:many — sections charged)
records ──< record_properties  (1:many — property items)
records ──< record_revisions   (1:many — audit chain)
records ──< workflow_transitions (1:many — transition ledger)
records ──< record_links       (many:many — case-arrest links)

fir_details.local_head_id → ref.local_heads.local_head_cd
record_offences.section_code → ref.sections.section_code
record_offences.act_cd → ref.acts.act_cd
persons.perm_location_id → locations.id
```

---

## 6. Critical Data Rules

1. **Never write directly to the DB outside `records.service.js`** — breaks the hash chain silently
2. **`record_offences.is_primary`** — enforced as a partial unique index: at most one `is_primary = true` per record
3. **`fir_number_counters`** — row-locked during FIR creation (`FOR UPDATE`); never increment manually
4. **`persons.is_minor`** — generated stored column (`age < 18`); never recompute in application code
5. **`workflow_transitions`** — append-only; deleting rows breaks `@PRIOR` resolution
6. **`ref.*` tables** — loaded from `Menu_Tables.xlsx` via `npm run load-ref`; never manually inserted in migrations
7. **`canonical_code` on `ref.local_heads`** — if NULL, head-sliced diary counts return 0 silently (no error)
8. **`registration_date` on `records`** — the sole authoritative date field for all diary window calculations
