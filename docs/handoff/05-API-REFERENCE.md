# PHAROS — API Reference
**Version:** 1.0 | **Date:** 2026-08-18 | **Audience:** Frontend developers, integration engineers, QA

---

## Base URLs

| Environment | Base URL |
|---|---|
| Development | `http://localhost:5000/api/v1` |
| Legacy alias (also works) | `http://localhost:5000/api` |

Both paths are mounted simultaneously and return identical responses. Use `/api/v1` for all new frontend code.

---

## Authentication

### Login
```
POST /api/v1/auth/login
```
**Body:** `{ username: string, password: string }`
**Response:** `{ success: true, data: { token: string, user: { id, username, name, role, ps_id, district_id } } }`
**Notes:** Access token is in response body; refresh token is set as httpOnly cookie (`refresh_token`).

### Refresh Token
```
POST /api/v1/auth/refresh
```
**Body:** (none) — reads httpOnly cookie
**Response:** `{ success: true, data: { token: string } }`

### Logout
```
POST /api/v1/auth/logout
```
**Response:** `{ success: true }` — clears refresh cookie

### Current User
```
GET /api/v1/auth/me
```
**Headers:** `Authorization: Bearer <token>`
**Response:** `{ success: true, data: { id, username, name, role, ps_id, district_id, ... } }`

### Change Password
```
PUT /api/v1/auth/change-password
```
**Body:** `{ current_password: string, new_password: string }`

---

## Conventions

### Response Envelope
All responses use:
```json
{ "success": true, "data": <payload> }
{ "success": false, "error": "Error message", "field_errors": { "field": "message" } }
```

### Pagination
List endpoints use query params:
- `page` (int, default 1)
- `limit` (int, default 20, max 100)

Response includes: `{ data: [], total: N, page: N, limit: N }`

### Dates
All dates are ISO 8601 strings (`YYYY-MM-DD` for dates, `YYYY-MM-DDTHH:mm:ssZ` for timestamps).

### IDs
All entity IDs are UUIDs.

### Errors
- `400` — Validation error (includes `field_errors` object)
- `401` — Unauthenticated
- `403` — Insufficient role / scope violation
- `404` — Record not found
- `409` — Conflict (duplicate FIR number, etc.)
- `500` — Internal server error

---

## Records API

### List Records
```
GET /api/v1/records
```
**Auth:** All authenticated | **Scope:** Enforced (PS/district/HQ)

**Query params:**
| Param | Type | Description |
|---|---|---|
| `record_type` | string | Filter: `CASE`, `ARREST`, `PCR_CALL`, `MISSING`, `UIDB` |
| `current_status` | string | Filter by workflow status |
| `ps_id` | uuid | Filter by PS (scope-checked) |
| `from_date` | date | Record date from (YYYY-MM-DD) |
| `to_date` | date | Record date to (YYYY-MM-DD) |
| `search` | string | Free-text search (FIR number, gist, person name) |
| `local_head_id` | int | Filter by crime head |
| `page` | int | Page number (default 1) |
| `limit` | int | Page size (default 20) |

**Response:** `{ data: [RecordSummary], total, page, limit }`

### Create Record
```
POST /api/v1/records
```
**Auth:** HC only

**Body (CASE):**
```json
{
  "record_type": "CASE",
  "ps_id": "<uuid>",
  "record_date": "2026-08-18",
  "registration_date": "2026-08-18",
  "local_head_id": 1,
  "brief_facts": "...",
  "offences": [{ "section_code": "103", "act_cd": 9999, "is_primary": true }],
  "persons": [{ "person_type": "COMPLAINANT", "name": "...", "age": 35, "gender": "MALE" }]
}
```

**Body (ARREST — FIR-based):**
```json
{
  "record_type": "ARREST",
  "ps_id": "<uuid>",
  "record_date": "2026-08-18",
  "is_dd_based": false,
  "linked_fir_id": "<record_uuid>",
  "persons": [{ "person_type": "ACCUSED", "name": "...", "age": 28, "gender": "MALE" }]
}
```

**Body (ARREST — Kalandra):**
```json
{
  "record_type": "ARREST",
  "ps_id": "<uuid>",
  "record_date": "2026-08-18",
  "is_dd_based": true,
  "gd_no": "142",
  "gd_date": "2026-08-18",
  "preventive_sections": ["126/169 BNSS"]
}
```

**Response:** `{ success: true, data: { record: RecordDetail } }`

### Get Record
```
GET /api/v1/records/:id
```
**Auth:** All authenticated | **Scope:** Enforced

**Response:** `{ success: true, data: { record: RecordDetail } }` — includes all sub-tables (persons, offences, properties, revisions)

### Update Record
```
PUT /api/v1/records/:id
```
**Auth:** HC only | **Condition:** `current_status IN ('DRAFT', 'SENT_BACK')`

**Body:** Same shape as Create (partial updates supported)

### Delete Record (Soft)
```
DELETE /api/v1/records/:id
```
**Auth:** HC only | **Condition:** `current_status = 'DRAFT'`

### Submit Record (HC → SHO)
```
POST /api/v1/records/:id/submit
```
**Auth:** HC only

**Response:** Updated record with new `current_status`

### Approve Record
```
POST /api/v1/records/:id/approve
```
**Auth:** SHO, DISTRICT_OFFICER

**Body:** `{ comment?: string }`

### Send Back (Reject)
```
POST /api/v1/records/:id/send-back
```
**Auth:** SHO, DISTRICT_OFFICER, JCP, SCP

**Body:** `{ comment: string }` — comment is mandatory

### Update Domain Status
```
PATCH /api/v1/records/:id/status
```
**Auth:** HC, SHO, DISTRICT_OFFICER

**Body:** `{ case_status?: string, is_worked_out?: boolean, custody_status?: string, missing_status?: string }`

### Get Status Options
```
GET /api/v1/records/:id/status-options
```
**Auth:** HC, SHO, DISTRICT_OFFICER

**Response:** Available status values for this record type + current values

### Override Crime Head (District)
```
PATCH /api/v1/records/:id/case-head
```
**Auth:** DISTRICT_OFFICER only

**Body:** `{ local_head_id: int, comment: string }`

### Check Duplicate
```
GET /api/v1/records/check-duplicate?fir_no=...&ps_id=...&year=...
```
**Auth:** All authenticated

**Response:** `{ duplicates: [] }` — array of potential matches

### Search Records
```
POST /api/v1/records/search
```
**Auth:** All authenticated | **Scope:** Enforced

**Body:** `{ query: string, record_type?: string, ps_id?: uuid, date_from?: date, date_to?: date }`

---

## Workflow API

### Get Queue
```
GET /api/v1/workflow/queue
```
**Auth:** All authenticated | **Scope:** Enforced

Returns records currently awaiting action by the logged-in user's role.

**Query params:** `record_type`, `page`, `limit`

---

## Analytics API

All analytics endpoints: **Auth:** All authenticated | **Scope:** Enforced

### PS Dashboard Summary
```
GET /api/v1/analytics/ps-dashboard
GET /api/v1/analytics/ps-dashboard-v2
```
**Query:** `ps_id`, `from_date`, `to_date`

### Crime Head Matrix
```
GET /api/v1/analytics/crime-head-matrix
```
**Query:** `ps_id`, `district_id`, `from_date`, `to_date`

### Cases by Month Trend
```
GET /api/v1/analytics/cases-by-month
```
**Query:** `ps_id`, `district_id`, `year`

### Arrests Trend
```
GET /api/v1/analytics/arrests-trend
```
**Query:** `ps_id`, `district_id`, `from_date`, `to_date`

### Case Status Breakdown
```
GET /api/v1/analytics/case-status-breakdown
GET /api/v1/analytics/status-breakdown
```

### Year-over-Year Crime Head Trend
```
GET /api/v1/analytics/crime-head-year-trend
```

### Analytics Export
```
GET /api/v1/analytics/export
```
Returns Excel file download.

---

## Diary API

### FN Diary / PHQ Diary — Preview
```
GET /api/v1/phq-diary/preview?ps_id=<uuid>&from_date=YYYY-MM-DD&to_date=YYYY-MM-DD
```
Returns preview data (JSON) without generating the XLSX.

### FN Diary — Generate (Download)
```
GET /api/v1/phq-diary/generate?ps_id=<uuid>&from_date=YYYY-MM-DD&to_date=YYYY-MM-DD
POST /api/v1/phq-diary/generate
```
Returns XLSX file as binary stream (`Content-Disposition: attachment`).

### Daily Diary — Preview
```
GET /api/v1/daily-diary/records-preview?ps_id=<uuid>&date=YYYY-MM-DD
```

### Daily Diary — Export
```
GET /api/v1/daily-diary/export?ps_id=<uuid>&date=YYYY-MM-DD
```
Returns XLSX file.

### Daily Diary — All Data
```
GET /api/v1/daily-diary/data?ps_id=<uuid>&date=YYYY-MM-DD
GET /api/v1/daily-diary/data/:tableName?ps_id=<uuid>&date=YYYY-MM-DD
```

---

## Fields API

### Get Form Fields for Record Type
```
GET /api/v1/fields/form/:record_type
```
**Response:** Array of field definitions from `field_registry`, ordered by `display_order`.

### Lookup Endpoints
```
GET /api/v1/fields/lookup/acts                          — All acts
GET /api/v1/fields/lookup/acts/:act_cd/sections         — Sections for an act
GET /api/v1/fields/lookup/major-heads                   — Major crime heads
GET /api/v1/fields/lookup/major-heads/:code/minor-heads — Minor heads for a major head
GET /api/v1/fields/lookup/local-heads                   — All local crime heads (156)
GET /api/v1/fields/lookup/beats                         — Beats for the user's PS
GET /api/v1/fields/lookup/property-categories           — Property categories
GET /api/v1/fields/lookup/property-items/:parent_cd     — Property items for a category
GET /api/v1/fields/lookup/state-districts               — Indian states and districts
GET /api/v1/fields/lookup/investigating-officers        — IOs for the user's PS
GET /api/v1/fields/lookup/record-types                  — Valid record types
GET /api/acts-sections                                  — Combined acts + sections registry
```

### Field Registry Management (Admin)
```
GET  /api/v1/fields              — List all fields
POST /api/v1/fields              — Create a new field
PATCH /api/v1/fields/:id         — Update a field
PATCH /api/v1/fields/:id/toggle  — Enable/disable a field
```
**Auth:** All authenticated (admin actions checked inside)

---

## Users API

```
GET  /api/v1/users              — List users (SHO, DISTRICT_OFFICER and above)
GET  /api/v1/users/:id          — Get user (SHO, DISTRICT_OFFICER and above)
POST /api/v1/users              — Create user (SYSTEM_ADMIN, SHO)
PUT  /api/v1/users/:id          — Update user (SYSTEM_ADMIN, SHO)
DELETE /api/v1/users/:id        — Soft-delete user (SYSTEM_ADMIN, SHO)
POST /api/v1/users/:id/reset-password — Reset password (SYSTEM_ADMIN, SHO)
```

---

## Hierarchy API

```
GET /api/v1/hierarchy/tree       — Full org tree
GET /api/v1/hierarchy/scope      — User's visible scope
GET /api/v1/hierarchy/nodes      — All nodes (filterable by node_type)
POST /api/v1/hierarchy/nodes     — Create node (SYSTEM_ADMIN)
PUT  /api/v1/hierarchy/nodes/:id — Update node (SYSTEM_ADMIN)
DELETE /api/v1/hierarchy/nodes/:id — Delete node (SYSTEM_ADMIN)
```

---

## Import API

```
GET  /api/v1/import/template/:record_type  — Download Excel template
POST /api/v1/import/validate               — Phase 1: Upload and validate (multipart)
POST /api/v1/import/confirm/:batchId       — Phase 2: Commit validated batch
POST /api/v1/import/batches/:batchId/cancel — Cancel a pending batch
GET  /api/v1/import/batches                — List import batches
GET  /api/v1/import/batches/:batchId       — Get batch detail + validation report
```
**Auth:** HC, DISTRICT_OFFICER

---

## Record Links API

```
GET  /api/v1/record-links/link-types           — Available link types
GET  /api/v1/record-links/record/:recordId     — Links for a record
POST /api/v1/record-links                      — Create a link (HC, SHO, HQ_ADMIN, SYSTEM_ADMIN)
DELETE /api/v1/record-links/:id                — Delete a link
GET  /api/v1/record-links/person-search        — Search persons across records
```

---

## Notifications API

```
GET  /api/v1/notifications          — List notifications (unread first)
GET  /api/v1/notifications/count    — Unread count
PATCH /api/v1/notifications/:id/read  — Mark one as read
PATCH /api/v1/notifications/read-all  — Mark all as read
GET  /api/v1/notifications/stream   — SSE stream for real-time push
```

---

## Audit API

```
GET  /api/v1/audit                        — Audit log browser (HQ_ADMIN, SYSTEM_ADMIN)
GET  /api/v1/audit/chain-verify           — Verify hash chain (SYSTEM_ADMIN)
POST /api/v1/audit/chain-verify           — Verify hash chain (SYSTEM_ADMIN)
GET  /api/v1/audit/record/:recordId       — Audit trail for one record
GET  /api/v1/audit/user/:userId           — Audit trail for one user (DISTRICT_ROLES+)
POST /api/v1/audit/records/:recordId/freeze   — Freeze record (SYSTEM_ADMIN)
POST /api/v1/audit/records/:recordId/unfreeze — Unfreeze record (SYSTEM_ADMIN)
```

---

## Report Builder API

```
GET  /api/v1/report-builder/metadata      — Available dimensions and measures
POST /api/v1/report-builder/query         — Run a custom report query
POST /api/v1/report-builder/export        — Queue an export job
GET  /api/v1/report-builder/export/:jobId — Check export job status + download link
GET  /api/v1/report-builder/saved         — List saved reports
POST /api/v1/report-builder/saved         — Save a report config
PUT  /api/v1/report-builder/saved/:id     — Update saved report
DELETE /api/v1/report-builder/saved/:id   — Delete saved report
GET  /api/v1/report-builder/lookups/:type — Lookup values for a dimension
POST /api/v1/report-builder/cross-match/missing-uidb — Cross-match missing vs UIDB
GET  /api/v1/report-builder/audit         — Builder audit log (HQ_ADMIN, SYSTEM_ADMIN)
```

---

## Investigating Officers API

```
GET  /api/v1/investigating-officers        — List IOs for scope
POST /api/v1/investigating-officers        — Create IO (SHO, ACP, SYSTEM_ADMIN)
PATCH /api/v1/investigating-officers/:id  — Update IO (SHO, ACP, SYSTEM_ADMIN)
DELETE /api/v1/investigating-officers/:id — Delete IO (SHO, ACP, SYSTEM_ADMIN)
```

---

## Level Contracts API

```
GET  /api/v1/level-contracts  — List routing contracts (SYSTEM_ADMIN)
```
Mutation is not allowed — contracts are seeded from config.

---

## Filters (Saved Presets) API

```
GET  /api/v1/filters/presets           — List saved filter presets
GET  /api/v1/filters/duration-presets  — List duration presets
POST /api/v1/filters/presets           — Save a preset
DELETE /api/v1/filters/presets/:id     — Delete a preset
```

---

## Compilation API

```
GET  /api/v1/compilations        — List compilations
GET  /api/v1/compilations/:id    — Get compilation
POST /api/v1/compilations        — Create compilation (DISTRICT_OFFICER)
POST /api/v1/compilations/:id/submit — Submit compilation (DISTRICT_OFFICER)
```

---

## Health Check

```
GET /api/health
```
**Auth:** None (public)
**Response:** `{ success: true, message: "PHAROS API is running", timestamp: "..." }`

---

## Client Logging

```
POST /api/logs/client
```
**Auth:** Best-effort JWT (exempt from CSRF / rate limit)
**Body:** `{ logs: [{ level, message, context, timestamp }] }`
**Response:** `{ success: true, count: N }`
