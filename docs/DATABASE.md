# PHAROS Database Reference

**Police Hierarchical Automated Reporting & Operations System**
Stack: PostgreSQL + Knex.js (Node.js)

---

## Contents

1. [Architecture Overview](#1-architecture-overview)
2. [Core Tables](#2-core-tables)
3. [field_registry Deep Dive](#3-field_registry-deep-dive)
4. [records.data JSONB — How Data Is Stored](#4-recordsdata-jsonb--how-data-is-stored)
5. [Conditional Fields (show_when)](#5-conditional-fields-show_when)
6. [Repeater Entities — Persons & Properties](#6-repeater-entities--persons--properties)
7. [Workflow & Audit Trail](#7-workflow--audit-trail)
8. [Data Fetching & Searching](#8-data-fetching--searching)
9. [Analytics & Reporting Layer](#9-analytics--reporting-layer)
10. [Migration Timeline](#10-migration-timeline)

---

## 1. Architecture Overview

### The Three Layers

```
┌─────────────────────────────────────────────────────────────────┐
│  OPERATIONAL LAYER                                              │
│  records (data JSONB)                                          │
│  record_persons | record_properties                            │
│  → Where all crime data lives. One row per FIR / arrest / PCR │
└────────────────────────┬────────────────────────────────────────┘
                         │ every change logged
┌────────────────────────▼────────────────────────────────────────┐
│  AUDIT LAYER                                                    │
│  record_revisions | workflow_transitions | audit_logs           │
│  → Append-only. Nothing is ever deleted or overwritten here.   │
└────────────────────────┬────────────────────────────────────────┘
                         │ aggregated for reports
┌────────────────────────▼────────────────────────────────────────┐
│  ANALYTICS LAYER                                                │
│  mv_record_stats (materialized view)                           │
│  rpt.fact_fir | rpt.fact_arrest | rpt.dim_* (warehouse)        │
│  → Pre-computed summaries for dashboards and report exports.   │
└─────────────────────────────────────────────────────────────────┘
```

### Two Rules That Everything Else Follows

1. **All field config lives in `field_registry`.** The frontend never has a hardcoded label, input type, or validation rule. It fetches them from the database. Adding a new field = inserting a row.

2. **All domain data lives in `records.data` JSONB.** There is no `fir_date` column, no `accused_name` column. Every value the officer types goes into a single JSON blob. The key names match `field_registry.field_key`.

---

## 2. Core Tables

### hierarchy_nodes

Stores the entire police hierarchy as a self-referencing tree. One row per PS, district, sub-division, JCP zone, SCP range, or HQ.

| Column | Type | Purpose | Example |
|---|---|---|---|
| id | varchar(36) | UUID primary key | `"a1b2-c3d4..."` |
| node_type | varchar(30) | Level in the hierarchy | `"PS"` / `"DISTRICT"` / `"JCP"` / `"HQ"` |
| name_en | varchar(100) | English name | `"Parliament Street PS"` |
| name_hi | varchar(100) | Hindi name | `"संसद मार्ग थाना"` |
| code | varchar(30) | Short unique code | `"PS001"` |
| parent_id | varchar(36) | FK → self (parent node) | district's UUID |
| metadata | TEXT (JSON) | Extra info (lat/lon, zone) | `{"lat":28.6,"lon":77.2}` |
| is_active | boolean | Soft-delete flag | `true` |

**Tree example:**

```
HQ (Delhi Police HQ)
 └─ SCP (SCP North Range)
     └─ JCP (JCP North West)
         └─ DISTRICT (North West District)
             └─ SUB_DIVISION (Outer Sub-Division)
                 └─ PS (Saraswati Vihar PS)
```

---

### users

| Column | Type | Purpose | Example |
|---|---|---|---|
| id | varchar(36) | UUID | `"u-uuid..."` |
| username | varchar(50) | Login name | `"insp.sharma"` |
| badge_no | varchar(50) | Police ID (unique) | `"DL-10023"` |
| name_en | varchar(100) | Full name | `"Insp. Ravi Sharma"` |
| name_hi | varchar(100) | Hindi name | `"इंस्पेक्टर रवि शर्मा"` |
| password_hash | varchar(255) | bcrypt hash | `"$2b$10$..."` |
| role | varchar(20) | RBAC role | `"SHO"` / `"HC"` / `"DISTRICT_OFFICER"` |
| station_id | varchar(36) | FK → hierarchy_nodes (their PS) | PS UUID |
| district_id | varchar(36) | FK → hierarchy_nodes (their district) | District UUID |
| sub_div_id | varchar(36) | FK → hierarchy_nodes (sub-division) | nullable |
| is_active | boolean | Account enabled | `true` |
| last_login | timestamp | Last successful login | `"2026-06-27T10:30:00Z"` |

**Roles and their scope:**

| Role | Can see records from |
|---|---|
| HC | Their own PS only |
| SHO | Their own PS only |
| DISTRICT_OFFICER | Their district (all PSs) |
| JCP | Their sub-division |
| SCP | Their range |
| HQ_ANALYST | All districts (read-only) |
| HQ_ADMIN | All districts + config |
| SYSTEM_ADMIN | Everything |

---

### field_registry

The central configuration table. See [Section 3](#3-field_registry-deep-dive) for the full breakdown.

---

### records

One row per crime event (FIR, arrest, PCR call, missing person, or unidentified body).

| Column | Type | Purpose | Example |
|---|---|---|---|
| id | varchar(36) | UUID | `"r-uuid..."` |
| record_type | varchar(20) | What kind of record | `"CASE"` / `"ARREST"` / `"PCR_CALL"` / `"MISSING"` / `"UIDB"` |
| ps_id | varchar(36) | FK → hierarchy_nodes (originating PS) | PS UUID |
| district_id | varchar(36) | FK → hierarchy_nodes (district) | District UUID |
| sub_div_id | varchar(36) | FK → hierarchy_nodes (sub-division, nullable) | nullable |
| data | TEXT (JSON) | **All field values as a flat JSON object** | `{"fir_no":"FIR/2026/1001","act_name":"IPC",...}` |
| current_status | varchar(30) | Workflow state | `"PENDING_SHO"` / `"DISTRICT_REVIEW"` / `"HQ_RECEIVED"` |
| current_level | varchar(20) | Who currently holds the record | `"PS"` / `"DISTRICT"` / `"HQ"` |
| record_date | DATE | Date of the crime / event | `"2026-06-15"` |
| created_by | varchar(36) | FK → users (the HC who created it) | HC UUID |
| updated_by | varchar(36) | FK → users (last person to edit) | SHO UUID |
| is_legacy | boolean | Was this imported from an old system? | `false` |
| source_system | varchar(30) | Import source (if legacy) | `"EXCEL_IMPORT"` |
| created_at | timestamp | Creation time | `"2026-06-15T09:00:00Z"` |

**Workflow states (in order):**

```
DRAFT → PENDING_SHO → DISTRICT_REVIEW → HQ_RECEIVED → ARCHIVED
             ↓ send_back                ↓ send_back
        SENT_BACK (back to HC)    SENT_BACK (back to SHO)
```

---

### record_revisions

Every single change to a record creates a new row here. Nothing is updated or deleted.

| Column | Type | Purpose | Example |
|---|---|---|---|
| id | varchar(36) | UUID | |
| record_id | varchar(36) | FK → records | |
| revision_number | integer | 1, 2, 3... increments each save | `3` |
| changed_by | varchar(36) | FK → users | SHO UUID |
| changed_at | timestamp | When it happened | `"2026-06-16T14:20:00Z"` |
| level | varchar(20) | Which level made this change | `"PS"` / `"DISTRICT"` |
| change_type | varchar(30) | What kind of change | `"CREATE"` / `"UPDATE"` / `"STATUS_CHANGE"` / `"HEAD_OVERRIDE"` |
| field_changes | TEXT (JSON) | Array of fields that changed | see below |
| comment | TEXT | Optional note (required for send-back) | `"FIR date is wrong"` |
| reason | TEXT | Mandatory for override actions | `"Reclassified per DCP order"` |
| ip_address | varchar(45) | Client IP for forensics | `"192.168.1.10"` |
| prev_hash | varchar(64) | Hash of the previous revision | SHA-256 |
| row_hash | varchar(64) | Hash of this revision | SHA-256 |

**field_changes JSON structure:**

```json
[
  { "field_key": "fir_date",    "old_value": "2026-06-14", "new_value": "2026-06-15" },
  { "field_key": "act_name",    "old_value": "IPC",        "new_value": "Arms Act"   },
  { "field_key": "local_head",  "old_value": "Theft",      "new_value": "Robbery"    }
]
```

The `prev_hash` / `row_hash` chain makes it tamper-evident — any change to a past revision breaks all subsequent hashes.

---

### workflow_transitions

One row each time a record moves through the workflow (submit, approve, send-back).

| Column | Type | Purpose | Example |
|---|---|---|---|
| id | varchar(36) | UUID | |
| record_id | varchar(36) | FK → records | |
| from_status | varchar(30) | Status before the action | `"PENDING_SHO"` |
| to_status | varchar(30) | Status after the action | `"DISTRICT_REVIEW"` |
| from_level | varchar(20) | Who held it before | `"PS"` |
| to_level | varchar(20) | Who holds it now | `"DISTRICT"` |
| action | varchar(30) | What was done | `"APPROVE"` / `"SEND_BACK"` / `"SUBMIT"` |
| performed_by | varchar(36) | FK → users | SHO UUID |
| performed_at | timestamp | When | |
| comment | TEXT | Reason (required for SEND_BACK) | `"Missing IO details"` |
| target_fields | TEXT (JSON) | Fields highlighted for correction | `["io_name","io_mobile"]` |

---

### compilations

When a District Officer bundles all DISTRICT_REVIEW records and sends them to HQ as a batch.

| Column | Type | Purpose | Example |
|---|---|---|---|
| id | varchar(36) | UUID | |
| source_level | varchar(20) | Always `"DISTRICT"` for now | `"DISTRICT"` |
| target_level | varchar(20) | Always `"HQ"` for now | `"HQ"` |
| route | varchar(30) | How it travels | `"OPS_CHAIN"` |
| period | DATE | The reporting date for this batch | `"2026-06-15"` |
| source_entity_id | varchar(36) | FK → hierarchy_nodes (the district) | District UUID |
| status | varchar(20) | `"DRAFT"` or `"SUBMITTED"` | `"SUBMITTED"` |
| record_ids | TEXT (JSON) | Array of record UUIDs in this batch | `["r1-uuid","r2-uuid",...]` |
| compiled_summary | TEXT (JSON) | Counts by type | `{"total":47,"cases":15,"arrests":18,"pcrCalls":8,"missing":3,"uidb":3}` |
| submitted_by | varchar(36) | FK → users | District Officer UUID |
| submitted_at | timestamp | When submitted | |

---

### record_persons

Stores multiple persons per record (accused, victims, complainants, etc.). One row per person.

| Column | Type | Purpose | Example |
|---|---|---|---|
| id | varchar(36) | UUID | |
| record_id | varchar(36) | FK → records | |
| person_type | varchar(30) | Role in the case | `"ACCUSED"` / `"VICTIM"` / `"COMPLAINANT"` / `"ARRESTED"` / `"MISSING"` / `"BODY"` |
| first_name | varchar(100) | Fast-search column | `"Rajesh"` |
| last_name | varchar(100) | Fast-search column | `"Singh"` |
| mobile | varchar(20) | Fast-search column | `"9876543210"` |
| city | varchar(100) | Fast-search column | `"New Delhi"` |
| district | varchar(100) | Fast-search column | `"South Delhi"` |
| data | JSONB | Full person object (all field values) | `{"first_name":"Rajesh","dob":"1990-03-15",...}` |
| sort_order | integer | Display order on form | `0`, `1`, `2`... |

The `first_name`, `last_name`, `mobile` columns are duplicated from `data` purely for fast SQL indexing. `data` is the authoritative store. A GIN index on `data` enables full-text search inside person details.

---

### record_properties

Stores multiple property items per record. One row per item.

| Column | Type | Purpose | Example |
|---|---|---|---|
| id | varchar(36) | UUID | |
| record_id | varchar(36) | FK → records | |
| uid | TEXT | Case UID from `records.data.uid` — direct link to the unique case ID | `"CSE/2026/PS001/000042"` |
| fir_no | TEXT | FIR number from `records.data.fir_no` — for quick querying | `"FIR/2026/1042"` |
| major_category | varchar(50) | Category of the property | `"Vehicle"` / `"Mobile Phone"` / `"Jewellery"` |
| minor_category | varchar(100) | Sub-type / brand | `"Honda Activa"` / `"Samsung Galaxy"` |
| status | varchar(20) | Current state | `"Stolen"` / `"Recovered"` / `"Seized"` / `"Involved"` |
| details | TEXT | Free text description | `"Red Honda Activa 6G, 2023 model"` |
| extra_data | JSONB | All category-specific detail fields (vehicle reg, phone IMEI, drug type, weapon serial, etc.) | `{"prop_vehicle_no":"DL3CAB1234","prop_vehicle_type":"Car"}` |
| sort_order | integer | Display order | `0`, `1`... |
| created_at | timestamp | Row creation time | |
| updated_at | TEXT | Last update time | |

---

### notifications

| Column | Type | Purpose | Example |
|---|---|---|---|
| id | varchar(36) | UUID | |
| user_id | varchar(36) | FK → users (recipient) | |
| record_id | varchar(36) | FK → records (related record, nullable) | |
| title_en | varchar(255) | English notification title | `"Record Approved"` |
| title_hi | varchar(255) | Hindi title | `"रिकॉर्ड स्वीकृत"` |
| message_en | TEXT | English body | `"FIR/2026/1001 has been approved by SHO."` |
| message_hi | TEXT | Hindi body | |
| is_read | boolean | Has the user seen it | `false` |
| created_at | timestamp | When it was created | |

---

### audit_logs

Security-level event log separate from field-level revisions. Tracks logins, overrides, admin actions.

| Column | Type | Purpose | Example |
|---|---|---|---|
| id | varchar(36) | UUID | |
| table_name | varchar(40) | Which table was affected | `"records"` / `"users"` |
| record_id | varchar(36) | Which row | |
| action | varchar(20) | What happened | `"CREATE"` / `"UPDATE"` / `"LOGIN"` / `"OVERRIDE"` |
| changed_by_id | varchar(36) | FK → users | |
| changed_by_role | varchar(20) | Role at time of action | `"DISTRICT_OFFICER"` |
| changed_at | timestamp | When | |
| field_name | varchar(60) | Which field (for OVERRIDE) | `"local_head"` |
| old_value | TEXT | Value before | `"Theft"` |
| new_value | TEXT | Value after | `"Robbery"` |
| reason | TEXT | Required for overrides | `"Reclassified per ACP instruction"` |
| ip_address | varchar(45) | Client IP | |

---

### report_jobs

Async report generation. A job is created, picked up by a worker, and the output file path is written back when done.

| Column | Type | Purpose | Example |
|---|---|---|---|
| id | varchar(36) | UUID | |
| template_id | varchar(36) | FK → report_templates (nullable) | |
| filters | TEXT (JSON) | Query filters applied to the report | `{"date":"2026-06-15","ps_id":"..."}` |
| format | varchar(10) | Output format | `"PDF"` / `"EXCEL"` |
| status | varchar(20) | Job state | `"PENDING"` / `"READY"` / `"FAILED"` |
| file_path | TEXT | Where the generated file is saved | `"./generated-reports/job-uuid.xlsx"` |
| created_by | varchar(36) | FK → users | |
| created_at | timestamp | Queued at | |

---

### custom_field_definitions / custom_field_values

Extension point for PS- or District-specific fields that don't need to be in the global `field_registry`. Rarely used.

| Table | Key Columns | Purpose |
|---|---|---|
| custom_field_definitions | module, field_key, field_type, scope_level, scope_id | Defines an extra field scoped to a specific PS or district |
| custom_field_values | record_id, field_definition_id, value_text | Stores the value for that field on a specific record |

---

## 3. field_registry Deep Dive

This is the table that drives the entire form system. Every input the officer sees on screen exists because of a row in this table.

### All Columns

| Column | Type | Purpose | Example |
|---|---|---|---|
| id | varchar(36) | UUID primary key | `"f-uuid..."` |
| field_key | varchar(60) | Unique identifier used as the key in `records.data` | `"fir_no"` |
| field_type | varchar(20) | How the field renders | `"TEXT"` / `"SELECT"` / `"DATE"` / `"BOOLEAN"` / `"TEXTAREA"` / `"NUMBER"` / `"TIME"` / `"RADIO"` |
| applicable_record_types | TEXT (JSON) | Which record types this field appears in | `["CASE","ARREST"]` |
| label_en | varchar(120) | English label shown on the form | `"FIR Number"` |
| label_hi | varchar(120) | Hindi label | `"एफआईआर संख्या"` |
| options | TEXT (JSON) | For SELECT / RADIO fields — the dropdown choices | `[{"value":"IPC","label_en":"IPC","label_hi":"भादवि"}]` |
| validation_rules | TEXT (JSON) | Client-side validation | `{"required":true}` |
| visible_to_levels | TEXT (JSON) | Which hierarchy levels can see this field | `["PS","DISTRICT","HQ"]` |
| editable_by_levels | TEXT (JSON) | Which levels can edit this field | `["PS"]` |
| introduced_at_level | varchar(30) | Which level first fills this in | `"PS"` |
| section | varchar(60) | UI grouping / step on the multi-step form | `"general_info"` / `"vehicle_details"` |
| section_label_en | varchar(120) | Display title for the section (English) | `"General Information"` |
| section_label_hi | varchar(120) | Display title for the section (Hindi) | `"सामान्य जानकारी"` |
| sort_order | float | Order within the section | `1`, `1.5`, `2`... |
| full_width | boolean | Whether the field spans the full row (used for TEXTAREA) | `true` |
| readonly | boolean | Field is display-only, cannot be edited | `false` |
| **show_when** | TEXT (JSON) | **Conditional visibility rule** | `{"field":"case_type","value":["eMVT","eTheft"]}` |
| **repeater_entity** | varchar(50) | **Links field to a repeater sub-form** | `"PROPERTY"` / `"PERSON_ACCUSED"` / `null` |
| is_active | boolean | Soft-delete / deactivate without removing | `true` |
| scope_level | varchar(50) | `"global"` or a specific level like `"UIDB"` | `"global"` |
| scope_id | TEXT (JSON) | For district-scoped fields — the district UUID | `null` |
| created_by | TEXT | UUID of the user who created this field | |

### Complete Example Row

This is what a single row looks like for the `act_name` field:

| Column | Value |
|---|---|
| id | `"abc-123..."` |
| field_key | `"act_name"` |
| field_type | `"SELECT"` |
| applicable_record_types | `["CASE","ARREST"]` |
| label_en | `"Act Name"` |
| label_hi | `"अधिनियम का नाम"` |
| options | `[{"value":"IPC","label_en":"IPC","label_hi":"भादवि"},{"value":"Arms Act","label_en":"Arms Act","label_hi":"शस्त्र अधिनियम"},...]` |
| validation_rules | `{"required":false}` |
| visible_to_levels | `["PS","DISTRICT","HQ"]` |
| editable_by_levels | `["PS"]` |
| section | `"incident_details"` |
| sort_order | `5` |
| show_when | `null` (always visible) |
| repeater_entity | `null` (flat form field) |
| is_active | `true` |
| scope_level | `"global"` |

### Supported Field Types

| field_type | Renders As | Notes |
|---|---|---|
| TEXT | `<input type="text">` | Default for most text fields |
| NUMBER | `<input type="number">` | Enforces numeric input |
| DATE | `<input type="date">` | Stores as `YYYY-MM-DD` |
| TIME | `<input type="time">` | Stores as `HH:MM` |
| DATETIME | `<input type="datetime-local">` | Stores as ISO string |
| TEXTAREA | `<textarea>` | Multi-line, spans full width when `full_width = true` |
| SELECT | Native `<select>` or searchable dropdown | `options` column required |
| RADIO | Radio button group | `options` column required |
| BOOLEAN | Checkbox | Stores `true` / `false` |

### Sections by Record Type

| Record Type | Sections (in order) |
|---|---|
| CASE | general_info → incident_details → occurrence_info → investigation_officer → complainant_accused_info → property_details → vehicle_details → investigation_details |
| ARREST | general_info → offence_info → arrestee_info → arrest_details → custody_status → procedure_slips → special_scheme |
| PCR_CALL | general_info → informant_contact → complaint_details → arrival_geo |
| MISSING | general_info → person_details → physical_description → location_particulars → contacts_assigned |
| UIDB | general_info → discovery_details → corpse_desc → inquest_details → uidb_details |

---

## 4. records.data JSONB — How Data Is Stored

All the values an officer types into any form section end up as key-value pairs in the `records.data` column. The keys match `field_registry.field_key`.

### How It Works

1. Officer fills in the form in the browser.
2. Every 2 seconds the frontend auto-saves by sending `PUT /api/records/{id}` with `{ data: { fir_no: "...", act_name: "...", ... } }`.
3. The backend merges the new values with the old ones and writes the whole JSON blob back to `records.data`.
4. When the record is loaded, the same blob is sent back. The frontend uses `field_registry` to know how to render each key.

### Example: CASE Record

```json
{
  "uid": "CSE/2026/PS001/000042",
  "case_type": "cctns(manual FIR)",
  "fir_no": "FIR/2026/1042",
  "fir_date": "2026-06-15",
  "gd_no": "GD/2026/2100",
  "gd_date": "2026-06-15",
  "gd_time": "09:30",
  "beat_no": "B-3",
  "occurrence_date": "2026-06-15",
  "time_of_occurrence": "08:45",
  "occurrence_place": "Near Metro Gate 4, Rajiv Chowk",
  "local_head": "M.V. Theft",
  "act_name": "IPC",
  "sections": "379",
  "brief_facts": "Complainant reports his motorcycle stolen from outside metro gate...",
  "complainant_name": "Suresh Gupta",
  "io_name": "Insp. Ravi Sharma",
  "io_pis": "PIS10042",
  "io_mobile": "9876543210",
  "status": "Open"
}
```

### Example: CASE Record with eMVT (motor vehicle theft fields populated)

When `case_type` is `eMVT`, the vehicle_details section becomes visible and the officer fills in vehicle-specific fields:

```json
{
  "uid": "CSE/2026/PS001/000043",
  "case_type": "eMVT",
  "fir_no": "FIR/2026/1043",
  "fir_date": "2026-06-16",
  "gd_no": "GD/2026/2101",
  "gd_date": "2026-06-16",
  "local_head": "M.V. Theft",
  "act_name": "IPC",
  "sections": "379",
  "occurrence_place": "Sector 15, Rohini",
  "vehicle_no": "DL 3C AB 1234",
  "vehicle_type": "Car",
  "vehicle_make": "Maruti Suzuki",
  "vehicle_model": "Swift Dzire",
  "vehicle_color": "White",
  "vehicle_chassis_no": "MA3FJEB1S00123456",
  "vehicle_engine_no": "G12B1234567",
  "cd_uploaded_24h": "Yes",
  "footage_collected": "Yes",
  "io_name": "SI Pradeep Kumar",
  "status": "Open"
}
```

### Example: ARREST Record

```json
{
  "uid": "ARR/2026/PS001/000018",
  "linked_fir_dd_no": "FIR/2026/1043",
  "act_name": "IPC",
  "sections": "379",
  "crime_head": "M.V. Theft",
  "arrest_date": "2026-06-17",
  "arrest_place": "Bus stand, Rohini Sector 14",
  "prev_involvement": "Yes",
  "nafis_prepared": true,
  "dossier_prepared": false,
  "status": "judicial_custody",
  "io_name": "SI Pradeep Kumar",
  "io_mobile": "9876500001"
}
```

### Example: PCR_CALL Record

```json
{
  "uid": "PCR/2026/PS001/000091",
  "gd_no": "GD/2026/PCR/0091",
  "gd_date": "2026-06-15",
  "pcr_call_head": "CHAIN SNATCHING",
  "complaint_gist": "Lady complained about chain snatching near park",
  "informant_name": "Meera Devi",
  "informant_mobile": "9812345678",
  "arrival_time": "10:15",
  "beat_no": "B-2",
  "status": "Closed"
}
```

### Example: MISSING Record

```json
{
  "uid": "MIS/2026/PS001/000007",
  "dd_no": "DD/2026/0150",
  "dd_date": "2026-06-10",
  "missing_person_name": "Anita Kumari",
  "age": "14",
  "gender": "Female",
  "height": "5'2\"",
  "complexion": "Fair",
  "last_seen_place": "Near St. Mary School, Pitampura",
  "missing_date": "2026-06-09",
  "io_name": "HC Sunita Devi",
  "status": "Missing"
}
```

### Example: UIDB Record

```json
{
  "uid": "UIDB/2026/PS001/000003",
  "dd_no": "DD/2026/UIDB/003",
  "dd_date": "2026-06-12",
  "found_date": "2026-06-12",
  "found_place": "Under Flyover, NH-8",
  "age_est": "35-40",
  "gender": "Male",
  "height": "5'8\"",
  "built": "Medium",
  "complexion": "Wheatish",
  "cause_of_death": "Unknown",
  "zipnet_status": "Uploaded",
  "status": "Unidentified"
}
```

---

## 5. Conditional Fields (show_when)

Some fields only make sense in certain situations. Rather than having the frontend hardcode this logic, every conditional field has a `show_when` value in `field_registry`. The frontend reads it and decides whether to render the field.

### How It Works

**Step 1 — DB config:**
A field row in `field_registry` has a `show_when` value. Three formats are supported:

**Format 1 — Single value match:**
```json
{ "field": "act_name", "value": "IPC" }
```

**Format 2 — Multiple trigger values (OR):**
```json
{ "field": "case_type", "value": ["eMVT", "eTheft"] }
```

**Format 3 — "Filled" check (any non-empty value):**
```json
{ "field": "some_field", "operator": "filled" }
```

**Format 4 — Compound AND (all conditions must match):**
```json
{
  "and": [
    { "field": "property_major_category", "value": ["Vehicle"] },
    { "field": "property_stolen_recovered", "value": ["Stolen"] }
  ]
}
```
This is used when a field should only appear when two conditions are both true simultaneously — e.g., showing CD upload and CCTV fields only when the property is a Vehicle AND its status is Stolen.

**Step 2 — API returns it:**
`GET /api/v1/fields/form/CASE` returns the full field list including each field's `show_when` object.

**Step 3 — Frontend evaluates:**
`FormSection.jsx → evaluateShowWhen(condition, values)` checks before rendering each field:
```
if field.show_when:
    if show_when.and → ALL sub-conditions must match (AND logic)
    if show_when.operator === "filled" → field must be non-empty
    otherwise → current_value must match show_when.value (case-insensitive)
```
The check is case-insensitive. For repeater fields, `values` is the current repeater row, not the top-level form.

### Existing Conditional Fields

| Field Key | Section | Shown When | Trigger Field | Trigger Value(s) |
|---|---|---|---|---|
| `ipc_sections` | incident_details | Act is IPC | `act_name` | `"IPC"` |
| `excise_sections` | incident_details | Act is Excise Act | `act_name` | `"Delhi Excise Act"` |
| `arms_sections` | incident_details | Act is Arms Act | `act_name` | `"Arms Act"` |
| `gambling_sections` | incident_details | Act is Gambling Act | `act_name` | `"Gambling Act"` |
| `other_sections` | incident_details | Act is Other | `act_name` | `"Other Act"` |
| `theft_minor_head` | incident_details | Major head is Theft | `ipc_major_head` | `"Theft"` |
| `murder_minor_head` | incident_details | Major head is Murder | `ipc_major_head` | `"Murder"` |
| `property_description` | property_details | Crime involves property | `local_head` | `["Theft","Robbery","Burglary","M.V. Theft","Snatching"]` |
| `other_status_reason` | custody_status | Arrest status is "others" | `status` | `"others"` |

---

### Case 1 — E-MVT: Vehicle Detail Fields

**When does this trigger?** Officer selects `eMVT` or `eTheft` in the **Case Registration Type** (`case_type`) field.

**What appears?** The entire `vehicle_details` section becomes visible with 9 fields:

| Field Key | Label | Type | What to fill |
|---|---|---|---|
| `vehicle_no` | Vehicle Registration No. | TEXT | `DL 3C AB 1234` |
| `vehicle_type` | Vehicle Type | SELECT | Car / Motorcycle / Scooter / E-Rickshaw / Auto / Tempo / Bicycle / Other |
| `vehicle_make` | Vehicle Make / Manufacturer | TEXT | `Maruti Suzuki` |
| `vehicle_model` | Vehicle Model | TEXT | `Swift Dzire` |
| `vehicle_color` | Vehicle Color | TEXT | `White` |
| `vehicle_chassis_no` | Chassis Number | TEXT | `MA3FJEB1S00123456` |
| `vehicle_engine_no` | Engine Number | TEXT | `G12B1234567` |
| `cd_uploaded_24h` | 1st CD Uploaded Within 24 Hours | SELECT | Yes / No |
| `footage_collected` | CCTV Footage Collected | SELECT | Yes / No |

**show_when config for all these fields:**
```json
{ "field": "case_type", "value": ["eMVT", "eTheft"] }
```

**What this looks like in the database:**

| field_key | section | show_when (stored in DB) |
|---|---|---|
| `vehicle_no` | vehicle_details | `{"field":"case_type","value":["eMVT","eTheft"]}` |
| `vehicle_type` | vehicle_details | `{"field":"case_type","value":["eMVT","eTheft"]}` |
| `vehicle_make` | vehicle_details | `{"field":"case_type","value":["eMVT","eTheft"]}` |
| `vehicle_model` | vehicle_details | `{"field":"case_type","value":["eMVT","eTheft"]}` |
| `vehicle_color` | vehicle_details | `{"field":"case_type","value":["eMVT","eTheft"]}` |
| `vehicle_chassis_no` | vehicle_details | `{"field":"case_type","value":["eMVT","eTheft"]}` |
| `vehicle_engine_no` | vehicle_details | `{"field":"case_type","value":["eMVT","eTheft"]}` |
| `cd_uploaded_24h` | vehicle_details | `{"field":"case_type","value":["eMVT","eTheft"]}` |
| `footage_collected` | vehicle_details | `{"field":"case_type","value":["eMVT","eTheft"]}` |

**Before / after illustration:**

```
case_type = "cctns(manual FIR)"        case_type = "eMVT"
──────────────────────────────          ──────────────────────────────
[general_info]                          [general_info]
[incident_details]                      [incident_details]
[property_details]                      [property_details]
                                        [vehicle_details]  ← appears
                                          Vehicle Reg No.: ___
                                          Vehicle Type:    [Car ▼]
                                          Make:            ___
                                          Model:           ___
                                          Color:           ___
                                          Chassis No:      ___
                                          Engine No:       ___
                                          CD within 24h:  [Yes ▼]
                                          CCTV Collected: [Yes ▼]
[investigation_details]                 [investigation_details]
```

---

### Case 2 — Phone Property: Phone Detail Fields

**Where does this trigger?** Inside the **Properties** repeater on a CASE or ARREST form. Each property row has a `property_major_category` dropdown. When the officer picks `Mobile Phone`, six additional fields appear within that specific row.

**What appears?**

| Field Key | Label | Type | What to fill |
|---|---|---|---|
| `property_phone_number` | Phone Number | TEXT | `9876543210` |
| `phone_make` | Phone Make / Brand | TEXT | `Samsung` |
| `phone_model` | Phone Model | TEXT | `Galaxy S23` |
| `phone_imei` | IMEI Number | TEXT | `356789012345678` |
| `phone_color` | Phone Color | TEXT | `Black` |
| `phone_status` | Recovery Status | SELECT | Not Recovered / Recovered / Partially Recovered |

**show_when config for all these fields:**
```json
{ "field": "property_major_category", "value": ["Mobile Phone"] }
```

**What this looks like in the database:**

| field_key | section | repeater_entity | applicable_record_types | show_when |
|---|---|---|---|---|
| `property_phone_number` | property_details | PROPERTY | `["CASE","ARREST"]` | `{"field":"property_major_category","value":["Mobile Phone"]}` |
| `phone_make` | property_details | PROPERTY | `["CASE","ARREST"]` | `{"field":"property_major_category","value":["Mobile Phone"]}` |
| `phone_model` | property_details | PROPERTY | `["CASE","ARREST"]` | `{"field":"property_major_category","value":["Mobile Phone"]}` |
| `phone_imei` | property_details | PROPERTY | `["CASE","ARREST"]` | `{"field":"property_major_category","value":["Mobile Phone"]}` |
| `phone_color` | property_details | PROPERTY | `["CASE","ARREST"]` | `{"field":"property_major_category","value":["Mobile Phone"]}` |
| `phone_status` | property_details | PROPERTY | `["CASE","ARREST"]` | `{"field":"property_major_category","value":["Mobile Phone"]}` |

**Before / after illustration (inside one repeater row):**

```
property_major_category = "Jewellery"   property_major_category = "Mobile Phone"
──────────────────────────────────────  ──────────────────────────────────────────
Category:  [Jewellery ▼]                Category:  [Mobile Phone ▼]
Sub-type:  ___                          Sub-type:  ___
Status:    [Stolen ▼]                   Phone No.: ___          ← appears
Details:   ___                          Make:      ___          ← appears
                                        Model:     ___          ← appears
                                        IMEI:      ___          ← appears
                                        Color:     ___          ← appears
                                        Recovery:  [Not Recovered ▼] ← appears
                                        Status:    [Stolen ▼]
                                        Details:   ___
```

**Important note on repeater-level evaluation:** The `show_when` check for fields inside a repeater uses the values of that specific row, not the top-level form. So if a record has two property rows — one "Vehicle" and one "Mobile Phone" — the phone fields appear only in the second row.

---

## 6. Repeater Entities — Persons & Properties

Some parts of a form can have multiple entries (e.g., multiple accused, multiple stolen items). These are called **repeater entities**.

### How Repeater Fields Are Defined

A field belongs to a repeater when its `field_registry.repeater_entity` is not null:

| repeater_entity value | Used in | What it groups |
|---|---|---|
| `PERSON_COMPLAINANT` | CASE | Complainant details |
| `PERSON_ACCUSED` | CASE | Accused person details |
| `PERSON_VICTIM` | CASE | Victim details |
| `PERSON_ARRESTED` | ARREST | Arrested person details |
| `PERSON_MISSING` | MISSING | Missing person details |
| `PROPERTY` | CASE, ARREST | Property / stolen items |

### Data Flow: Form → Database

**What the frontend sends (POST /api/records body):**
```json
{
  "record_type": "CASE",
  "record_date": "2026-06-15",
  "data": { "fir_no": "...", "act_name": "IPC", ... },
  "persons": [
    {
      "person_type": "ACCUSED",
      "data": {
        "first_name": "Rajesh",
        "last_name": "Singh",
        "dob": "1990-03-15",
        "mobile": "9876543210",
        "city_town_village": "Rohini"
      }
    }
  ],
  "properties": [
    {
      "property_major_category": "Mobile Phone",
      "property_minor_category": "Samsung",
      "property_stolen_recovered": "Stolen",
      "property_details": "Black Samsung Galaxy S23",
      "property_phone_number": "9876543210",
      "phone_make": "Samsung",
      "phone_model": "Galaxy S23",
      "phone_imei": "356789012345678",
      "phone_color": "Black",
      "phone_status": "NOT_RECOVERED"
    }
  ]
}
```

**What gets written to the database:**

`records.data` receives everything from `data`:
```json
{ "fir_no": "...", "act_name": "IPC", ... }
```

`record_persons` gets one row per person entry:
```
id          | record_id | person_type | first_name | last_name | mobile      | data (JSONB)
------------+-----------+-------------+------------+-----------+-------------+-------------------
"p-uuid..." | "r-uuid"  | ACCUSED     | Rajesh     | Singh     | 9876543210  | { "first_name":"Rajesh",...}
```

`record_properties` gets one row per property entry:
```
id          | record_id | uid                      | fir_no          | major_category | minor_category | status | details                   | extra_data
------------+-----------+--------------------------+-----------------+----------------+----------------+--------+---------------------------+----------------------------
"pr-uuid.." | "r-uuid"  | CSE/2026/PS001/000042    | FIR/2026/1042   | Mobile Phone   | Samsung        | Stolen | Black Samsung Galaxy S23  | {"phone_make":"Samsung","phone_model":"Galaxy S23","phone_imei":"356789...","phone_color":"Black"}
```

All category-specific detail fields (phone make/model/IMEI, vehicle registration, drug type/quantity, weapon serial, etc.) are stored in the `extra_data JSONB` column. The `uid` and `fir_no` columns allow querying properties directly by case reference without joining to `records`.

---

## 7. Workflow & Audit Trail

### State Machine

The state machine logic lives in `records.service.js → transitionRecord()`. The valid transitions are:

```
DRAFT
  └─ [HC submits] → PENDING_SHO
        └─ [SHO approves] → DISTRICT_REVIEW
        └─ [SHO sends back] → SENT_BACK (back to HC)
              └─ [HC re-submits] → PENDING_SHO
              └─ [DISTRICT_OFFICER approves] → HQ_RECEIVED
              └─ [DISTRICT_OFFICER sends back] → SENT_BACK (back to PS)
                    └─ [HQ receives] → ARCHIVED
```

### What Gets Written on Each Action

| Action | record_revisions row | workflow_transitions row |
|---|---|---|
| HC creates record | change_type = `CREATE`, field_changes = all fields | — |
| HC edits draft | change_type = `UPDATE`, field_changes = only changed fields | — |
| HC submits | change_type = `STATUS_CHANGE` | from=DRAFT, to=PENDING_SHO, action=SUBMIT |
| SHO approves | change_type = `STATUS_CHANGE` | from=PENDING_SHO, to=DISTRICT_REVIEW, action=APPROVE |
| SHO sends back | change_type = `STATUS_CHANGE` | from=PENDING_SHO, to=SENT_BACK, action=SEND_BACK, comment=reason, target_fields=["io_name",...] |
| DCP overrides crime head | change_type = `HEAD_OVERRIDE`, reason = mandatory | separate audit_logs entry too |

### Tamper-Chain Hashing

Every `record_revisions` row has:
- `row_hash`: SHA-256 of this revision's content
- `prev_hash`: SHA-256 of the previous revision

If anyone modifies a past revision row, all subsequent `prev_hash` values become invalid. This gives a forensic chain of custody without a blockchain.

---

## 8. Data Fetching & Searching

### How a Form Is Loaded

```
Browser requests:  GET /api/v1/fields/form/CASE
Backend does:
  1. Query field_registry WHERE 'CASE' IN applicable_record_types AND is_active = true
  2. Filter by scope (global fields + district-scoped fields for this user's district)
  3. Group by section (or repeater_entity)
  4. Return array of sections, each with its list of fields
Browser renders:
  Each section becomes one step in the multi-step form.
  For each field, FieldRenderer.jsx picks the right input type.
  FormSection.jsx hides fields where show_when condition is not met.
```

### How Records Are Queried

Because all values live in `records.data` (a JSON text column), querying specific fields uses JSON path operators:

| Database | Syntax to read a field | Example |
|---|---|---|
| PostgreSQL | `records.data::jsonb->>'field_key'` | `records.data::jsonb->>'fir_no'` |
| SQLite | `json_extract(records.data, '$.field_key')` | `json_extract(records.data, '$.fir_no')` |

The codebase abstracts this with a helper:
```js
const getJsonFieldExpression = (field) =>
  isPg ? `CAST(records.data AS jsonb)->>'${field}'`
       : `json_extract(records.data, '$.${field}')`;
```

### GIN Index for Full-Text Search

```sql
CREATE INDEX idx_records_data_gin ON records USING GIN ((data::jsonb));
```

This allows fast substring searches across all field values without scanning every row.

**Text search query:**
```sql
-- Find any record containing "Rajesh" anywhere in its data
WHERE records.data::text ILIKE '%Rajesh%'
```

### Advanced Filter Engine

`records.service.js → buildFilterQuery()` supports 41 operators:

| Category | Operators |
|---|---|
| Equality | `EQ`, `NOT_EQ`, `IN`, `NOT_IN` |
| Comparison | `GT`, `GTE`, `LT`, `LTE` |
| Text | `CONTAINS`, `STARTS_WITH`, `ENDS_WITH`, `IS_EMPTY`, `IS_NOT_EMPTY` |
| Date ranges | `BEFORE`, `AFTER`, `BETWEEN`, `LAST_N_DAYS`, `THIS_WEEK`, `THIS_MONTH`, `THIS_YEAR` |
| Boolean | `IS_TRUE`, `IS_FALSE` |
| Attachment | `HAS_ATTACHMENT`, `NO_ATTACHMENT` |

Filters use AND/OR logic and can be nested:
```json
{
  "logic": "AND",
  "conditions": [
    { "field": "local_head", "operator": "EQ", "value": "M.V. Theft" },
    {
      "logic": "OR",
      "conditions": [
        { "field": "_status", "operator": "EQ", "value": "PENDING_SHO" },
        { "field": "_status", "operator": "EQ", "value": "DISTRICT_REVIEW" }
      ]
    }
  ]
}
```

**Virtual fields** (prefixed with `_`) map to actual record columns rather than JSONB:

| Virtual Field | Maps To |
|---|---|
| `_status` | `records.current_status` |
| `_record_date` | `records.record_date` |
| `_is_legacy` | `records.is_legacy` |
| `_sla_breached` | calculated from `workflow_transitions_config.sla_hours` |

---

## 9. Analytics & Reporting Layer

### Materialized View: mv_record_stats

Refreshed on a cron schedule (every few hours). Aggregates record counts by PS, district, type, status, and date.

```sql
SELECT
  r.ps_id, ps.name_en AS ps_name,
  r.district_id, dist.name_en AS district_name,
  r.record_type, r.current_status, r.record_date,
  COUNT(*) AS record_count
FROM records r
JOIN hierarchy_nodes ps ON ps.id = r.ps_id
JOIN hierarchy_nodes dist ON dist.id = r.district_id
GROUP BY ...
```

Dashboards query this view instead of the live `records` table for speed.

### Warehouse Schema (rpt)

A separate `rpt` schema (PostgreSQL) or `rpt_*` tables (SQLite) provides a star schema for report exports:

**Dimension tables (lookup/reference):**

| Table | Purpose |
|---|---|
| `rpt.dim_district` | District names with surrogate keys |
| `rpt.dim_police_station` | PS names, linked to dim_district |
| `rpt.dim_officer` | Normalized IO names (deduped) |
| `rpt.dim_crime_head` | Normalized crime head values |
| `rpt.dim_case_status` | Status labels per record type |
| `rpt.dim_act_law` | Normalized Act/law names |

**Fact tables (the actual records, pre-extracted from JSONB):**

| Table | Source | Key columns extracted |
|---|---|---|
| `rpt.fact_fir` | CASE records | fir_no, fir_date, occurrence_place, local_head, complainant_name |
| `rpt.fact_arrest` | ARREST records | arrest_date, arrested_name, custody_status |
| `rpt.fact_pcr` | PCR_CALL records | pcr_no, call_head, call_status |
| `rpt.fact_missing` | MISSING records | missing_name, age, missing_date, missing_status |
| `rpt.fact_uidb` | UIDB records | found_date, found_place, cause_of_death |

**Bridge tables (cross-links):**

| Table | Links |
|---|---|
| `rpt.bridge_fir_arrest` | fact_fir ↔ fact_arrest (matched on fir_no) |
| `rpt.bridge_fir_missing` | fact_fir ↔ fact_missing (matched on gd_no) |

### Query Mode Selection

```
WAREHOUSE_QUERY_MODE = AUTO (default)
  → If warehouse is populated:  query rpt.fact_* tables (fast)
  → If warehouse is empty:      query records.data JSONB directly (slower but always works)
```

---

## 10. Migration Timeline

Migrations live in `backend/migrations/`. Run with `node scripts/migrations.js` (idempotent).

| Migration File | Date | What Changed |
|---|---|---|
| `20260615000000_init_pharos.js` | 2026-06-15 | Initial schema: hierarchy_nodes, users, field_registry, records, record_revisions, workflow_transitions, compilations, notifications, report_templates, report_jobs, filter_presets, custom_field_definitions, audit_logs |
| `20260617000000_phase2_additions.js` | 2026-06-17 | Phase 2 tables: legacy_import_batches, legacy_amendments, workflow_transitions_config, scheduled_reports, level_data_contracts. Added is_legacy, source_system, imported_at, imported_by, legacy_ref columns to records |
| `20260618000000_analytics_view.js` | 2026-06-18 | Created mv_record_stats materialized view. Added GIN index on records.data |
| `20260619000000_report_jobs_nullable.js` | 2026-06-19 | Made template_id nullable in report_jobs (supports ad-hoc jobs with no template) |
| `20260620000000_full_hierarchy.js` | 2026-06-20 | Seeded complete Delhi Police hierarchy (15 districts, all police stations) |
| `20260620100000_report_builder.js` | 2026-06-20 | Additional reporting infrastructure tables |
| `20260620200000_warehouse_schema.js` | 2026-06-20 | Created rpt schema with dim_* and fact_* tables for analytics warehouse |
| `20260620300000_phase3_reports.js` | 2026-06-20 | Import/legacy report support tables |
| `20260620400000_add_fields_metadata.js` | 2026-06-20 | Added scope_level, scope_id, created_by, section_label_en, section_label_hi columns to field_registry |
| `20260620500000_conditional_fields.js` | 2026-06-20 | Added show_when column to field_registry. Populated initial conditional logic for property description and act-based sections |
| `20260620600000_daily_diary_views.js` | 2026-06-20 | 27 reporting views + aggregate functions for Daily Diary Excel export |
| `20260621000000_record_linkage.js` | 2026-06-21 | FIR ↔ Arrest ↔ Missing cross-linking support |
| `20260622000000_fk_cleanup.js` | 2026-06-22 | Dropped FK constraint from report_jobs → report_templates (allows templateless jobs) |
| `20260623000000_phone_detail_fields.js` | 2026-06-23 | Added phone theft fields: phone_make, phone_model, phone_imei, phone_color, phone_status |
| `20260623120000_readonly_sort_float.js` | 2026-06-23 | Added readonly BOOLEAN to field_registry. Changed sort_order from integer to float (allows inserting fields between existing ones) |
| `20260624000000_daily_diary_fields.js` | 2026-06-24 | 13 additional fields for Daily Diary report columns |
| `20260625000000_unique_field_key.js` | 2026-06-25 | Added UNIQUE index on field_registry.field_key |
| `20260625100000_uuid_cleanup.js` | 2026-06-25 | Removed UUID generation from hierarchy_nodes.id (uses plain strings now) |
| `20260627000000_record_persons_properties.js` | 2026-06-27 | Added record_persons and record_properties tables. Added repeater_entity column to field_registry |
| `20260628000000_conditional_fields_emvt_phone.js` | 2026-06-28 | Added show_when to vehicle fields (only show for eMVT/eTheft). Added vehicle_make, vehicle_model, vehicle_color, vehicle_chassis_no, vehicle_engine_no. Moved phone fields into PROPERTY repeater with show_when on property_major_category. Added property_phone_number field |
| `20260629000000_case_status_conditional_fields.js` | 2026-06-29 | Case status conditional fields: rc_no and disposal_type show only when status = "Charge Sheet"; new transfer_to SELECT field shows only when status = "Transfer" (courts + investigative agencies) |
| `20260629100000_case_conditional_fields_move_section.js` | 2026-06-29 | Moved transfer_to, rc_no, disposal_type from investigation_details into general_info section (sort 334–336) so they appear immediately below the status field |
| `20260629200000_prop_vehicle_repeater_fields.js` | 2026-06-29 | Added vehicle fields inside PROPERTY repeater: prop_vehicle_no + prop_vehicle_type (show when Vehicle), prop_cd_24h + prop_cctv (compound AND: Vehicle + Stolen). Extended show_when to support `{"and":[...]}` compound format in FormSection.jsx |
| `20260629300000_reorder_property_detail_fields.js` | 2026-06-29 | Moved phone detail fields (sort 309–314) to sort 338–343 so they render below the main property fields (major/minor category, status, description) |
| `20260629400000_record_properties_extra_data.js` | 2026-06-29 | Added uid, fir_no, extra_data JSONB, updated_at columns to record_properties. records.service.js now stamps uid + fir_no and stores all category-specific detail fields in extra_data on every save |
| `20260629500000_property_category_fields.js` | 2026-06-29 | Added category-specific repeater fields for all 9 property major categories: Cash (3 fields), Jewellery (4), Electronics (5), Documents (4), Drugs (4), Arms (5), Others (2). All with show_when referencing property_major_category |
| `20260629600000_fix_property_show_when_values.js` | 2026-06-29 | Fixed show_when values to match actual property_major_category option values: "Gold/Jewellery"→"Jewellery", "Electronics/Gadgets"→"Electronics", "Official/Personal Documents"→"Documents", "Drugs/Narcotics"→"Drugs", "Arms/Ammunition"→"Arms" |

---

## Adding a New Field — Quick Reference

Fields are added via **timestamped migration files** in `backend/migrations/`. Do not use a seed file — seeds re-run on every `npm run db:seed` and will conflict with migration-applied changes.

1. Create `backend/migrations/YYYYMMDDHHMMSS_describe_change.js`
2. Copy the `COMMON` defaults from an existing property migration for required NOT-NULL columns (`visible_to_levels`, `editable_by_levels`, `introduced_at_level`, `scope_level`, etc.)
3. Always provide a UUID `id: uuidv4()` — the column has no default
4. Set at minimum: `field_key` (globally unique), `field_type`, `label_en`, `label_hi`, `applicable_record_types`, `section`, `sort_order`
5. For conditional display add `show_when`:
   - Single value: `JSON.stringify({ field: 'trigger_key', value: 'X' })`
   - Multi-value OR: `JSON.stringify({ field: 'trigger_key', value: ['X', 'Y'] })`
   - Compound AND: `JSON.stringify({ and: [{ field: 'a', value: ['X'] }, { field: 'b', value: ['Y'] }] })`
6. For a repeater field add `repeater_entity: 'PROPERTY'` (or `PERSON_ACCUSED`, etc.)
7. Run `npm run db:migrate` — the field appears in the frontend automatically with no code change

## Adding a New Record Type — Quick Reference

1. Create a migration adding fields with `applicable_record_types: ['YOUR_TYPE']`
2. Add the new type to the `record_type` check in `records.controller.js`
3. The rest (form rendering, JSONB storage, workflow, audit) works automatically
