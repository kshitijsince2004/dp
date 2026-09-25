# Record Linkage System — Developer Reference

**Last updated:** June 2026  
**Status:** Active (Phase 2)

---

## Table of Contents

1. [Why this exists](#1-why-this-exists)
2. [The two tables](#2-the-two-tables)
3. [How a link is created](#3-how-a-link-is-created)
4. [How to query links](#4-how-to-query-links)
5. [Adding a new relationship type](#5-adding-a-new-relationship-type)
6. [API Reference](#6-api-reference)
7. [Frontend integration](#7-frontend-integration)
8. [Person search across arrests](#8-person-search-across-arrests)
9. [Report generation — how to use linkage](#9-report-generation--how-to-use-linkage)
10. [Architecture decisions](#10-architecture-decisions)

---

## 1. Why this exists

Before this system, an arrest record stored the linked case only as a plain text field:

```jsonc
// records.data JSONB (old way)
{
  "linked_fir_dd_no": "FIR-104/2026",  // just a string, no FK, not joinable
  ...
}
```

This meant:
- No way to JOIN cases and arrests in a real SQL query
- No enforcement that the FIR number actually points to an existing case
- No way to see all arrests from a case detail page
- Adding future relationships (Case → Missing Person, etc.) would require new code every time

The linkage system replaces this with two proper tables and a pattern any team member can extend.

---

## 2. The two tables

### `link_type_registry` — the config table

Defines **what kinds of relationships are valid**. Think of this as the "schema" for relationships.

```
id            UUID  PK
code          VARCHAR  UNIQUE         -- e.g. 'CASE_ARREST'
source_record_type  VARCHAR           -- e.g. 'CASE'
target_record_type  VARCHAR           -- e.g. 'ARREST'
label_en      VARCHAR                 -- 'Case → Arrest'
label_hi      VARCHAR                 -- 'मामला → गिरफ्तारी'
cardinality   VARCHAR  DEFAULT 'ONE_TO_MANY'
is_active     BOOLEAN  DEFAULT true
```

Current rows (seeded at migration time):

| code | source → target | is_active |
|---|---|---|
| `CASE_ARREST` | CASE → ARREST | **true** (live) |
| `CASE_MISSING` | CASE → MISSING | false (future) |
| `CASE_PCR` | CASE → PCR_CALL | false (future) |
| `CASE_UIDB` | CASE → UIDB | false (future) |

**To enable a future relationship type: just flip `is_active = true`. No code changes.**

---

### `record_links` — the junction table

Stores **actual links between individual records**.

```
id               UUID  PK
link_type_id     UUID  FK → link_type_registry(id)
source_record_id VARCHAR(36)  FK → records(id) ON DELETE CASCADE
target_record_id VARCHAR(36)  FK → records(id) ON DELETE CASCADE
metadata         TEXT  DEFAULT '{}'   -- JSON blob for context notes
created_by       VARCHAR(36)  FK → users(id)
created_at       TIMESTAMPTZ
UNIQUE (source_record_id, target_record_id, link_type_id)
CHECK  (source_record_id != target_record_id)
```

Example rows:

| source (CASE) | target (ARREST) | link_type_id |
|---|---|---|
| `CSE/2026/PS001/000042` | `ARR/2026/PS001/000011` | CASE_ARREST |
| `CSE/2026/PS001/000042` | `ARR/2026/PS001/000015` | CASE_ARREST |

Reading this: Case 42 has two arrests linked to it. Arrest 11 appears only once — but it *could* appear in multiple cases if someone was arrested in separate FIRs.

---

### How records stay independent

Records exist in the `records` table first. `record_links` is optional — a CASE with no arrests has no rows in `record_links`. A standalone Kalandra arrest also has no rows. The relationship is additive, never required.

```
records table           record_links table
──────────────          ──────────────────
CSE/000042   ──────────►  source=CSE/000042, target=ARR/000011
ARR/000011   ◄──────────  (same row, reversed direction at query time)
ARR/000015   ◄──────────  source=CSE/000042, target=ARR/000015
ARR/000099                (no row — standalone Kalandra, not linked)
```

---

## 3. How a link is created

### Via the API (programmatic)

```http
POST /api/v1/record-links
Authorization: Bearer <token>
Content-Type: application/json

{
  "sourceRecordId": "<UUID of the CASE record>",
  "targetRecordId": "<UUID of the ARREST record>",
  "linkTypeCode": "CASE_ARREST",
  "metadata": { "notes": "Main accused in this case" }
}
```

The service (`backend/src/modules/record-links/record-links.service.js → createLink`) will:
1. Validate `CASE_ARREST` exists in `link_type_registry` and is active
2. Confirm the source record is type `CASE` and target is type `ARREST`
3. Insert into `record_links`
4. Publish a `link.created` event to RabbitMQ → `linkAuditHandler` writes to `audit_logs`

### Via the UI (ArrestManagement form)

When an HC creates a new arrest:
1. Step 1 shows a **"Case Linkage"** card at the top
2. HC selects either **"Linked to FIR / Case"** or **"Standalone Kalandra"**
3. If linked: a search box appears → searches `GET /api/v1/records?type=CASE&search=<query>`
4. HC picks the case → on submit, the form does a **two-phase POST**:
   - Phase 1: `POST /api/v1/records` → creates the ARREST record, gets back `arrestRecordId`
   - Phase 2: `POST /api/v1/record-links` → creates the link between CASE and ARREST
5. If Phase 2 fails (network error etc.), a toast warns the user but the arrest is still saved — they can re-link from the case detail page

Code: `frontend/src/pages/ArrestManagement.jsx → handleSubmit()`

---

## 4. How to query links

### From the API

```http
GET /api/v1/record-links/record/<recordId>
Authorization: Bearer <token>
```

Returns all records linked to `recordId` in **either direction** (whether this record is the source or target). Each result includes the full `linked_record_data` JSONB so you don't need a second round-trip.

Example response:
```json
{
  "success": true,
  "data": [
    {
      "id": "rl-uuid...",
      "link_type_code": "CASE_ARREST",
      "link_type_label_en": "Case → Arrest",
      "my_role": "source",
      "linked_record_id": "arr-uuid...",
      "linked_record_type": "ARREST",
      "linked_record_data": { "fullName": "Ramesh Kumar", "crime_head": "Burglary", "uid": "ARR/2026/PS001/000011" },
      "linked_record_status": "PENDING_SHO",
      "linked_ps_name": "Parliament Street",
      "linked_at": "2026-06-21T11:30:00Z"
    }
  ]
}
```

### From `getRecordDetails` (service layer)

`backend/src/modules/records/records.service.js → getRecordDetails(id)` automatically includes linked records in its return value. So any place in the codebase that calls `GET /api/v1/records/:id` already gets links for free:

```javascript
const { record, revisions, transitions, customFields, linkedRecords } = recordPayload;
// linkedRecords is already there — no extra API call needed
```

### Direct SQL (for scripts, reports, analytics)

```sql
-- All arrests linked to a specific case
SELECT
  r.id                     AS arrest_id,
  r.data->>'fullName'      AS name,
  r.data->>'crime_head'    AS crime_head,
  r.data->>'dateOfArrest'  AS arrest_date,
  r.current_status
FROM record_links rl
JOIN records r ON r.id = rl.target_record_id
JOIN link_type_registry ltr ON ltr.id = rl.link_type_id
WHERE rl.source_record_id = '<case-uuid>'
  AND ltr.code = 'CASE_ARREST';

-- Find the parent case for an arrest
SELECT
  r.id                  AS case_id,
  r.data->>'fir_no'     AS fir_no,
  r.data->>'local_head' AS crime_head,
  r.current_status
FROM record_links rl
JOIN records r ON r.id = rl.source_record_id
JOIN link_type_registry ltr ON ltr.id = rl.link_type_id
WHERE rl.target_record_id = '<arrest-uuid>'
  AND ltr.code = 'CASE_ARREST';
```

### Filter arrests by linked case (via the existing records API)

The `GET /api/v1/records` endpoint now supports two extra query params when `type=ARREST`:

```
GET /api/v1/records?type=ARREST&linked_case_id=<case-uuid>
GET /api/v1/records?type=ARREST&linked_fir_no=FIR-104/2026
```

Code: `backend/src/modules/records/records.service.js → listRecords()` — look for the `filters.linked_case_id` and `filters.linked_fir_no` blocks.

---

## 5. Adding a new relationship type

Example: you now need to link a **Case to a Missing Person report**.

**Step 1: Flip the DB flag** (no migration needed — the row already exists):
```sql
UPDATE link_type_registry SET is_active = true WHERE code = 'CASE_MISSING';
```

**Step 2: Add UI** — wherever you want to create this link, POST to `/api/v1/record-links` with `linkTypeCode: 'CASE_MISSING'`. The backend validates the record types automatically.

**Step 3: Nothing else.** `getRecordDetails` already returns all links regardless of type. `LinkedRecordsPanel` on the frontend already handles any `linked_record_type`.

For a completely new relationship that doesn't exist yet (e.g. Arrest → UIDB):
```sql
INSERT INTO link_type_registry (code, source_record_type, target_record_type, label_en, label_hi, is_active)
VALUES ('ARREST_UIDB', 'ARREST', 'UIDB', 'Arrest → UIDB', 'गिरफ्तारी → यूआईडीबी', true);
```
Then use `linkTypeCode: 'ARREST_UIDB'` in the API call. The system handles the rest.

---

## 6. API Reference

All endpoints require `Authorization: Bearer <token>`.

| Method | Endpoint | Auth Required | Description |
|---|---|---|---|
| `GET` | `/api/v1/record-links/link-types` | Any role | List all active link types |
| `GET` | `/api/v1/record-links/record/:recordId` | Any role (scoped) | Get all links for a record (both directions) |
| `GET` | `/api/v1/record-links/person-search` | Any role (scoped) | Search ARREST records by person name/father name |
| `POST` | `/api/v1/record-links` | HC, SHO, HQ_ADMIN | Create a link between two records |
| `DELETE` | `/api/v1/record-links/:id` | HC, SHO, HQ_ADMIN | Remove a link |

**POST body:**
```json
{
  "sourceRecordId": "string (UUID of source record)",
  "targetRecordId": "string (UUID of target record)",
  "linkTypeCode": "CASE_ARREST",
  "metadata": { "notes": "optional context string" }
}
```

**Error responses:**
- `404` — link type code not found or not active
- `404` — source or target record not found  
- `409` — link already exists between these two records
- `422` — record type mismatch (e.g. you passed an ARREST as the source for a CASE_ARREST link)

**Person search params:**
```
?searchTerm=Ramesh         -- partial match on name, address, any text field
?fatherName=Sohan          -- partial match on father/parent name fields
?limit=50                  -- max results (default 50)
```
Search is scoped: HC/SHO only see results from their PS, District Officers from their district.

---

## 7. Frontend integration

### LinkedRecordsPanel component

`frontend/src/components/common/LinkedRecordsPanel.jsx`

Drop this into any record detail page to show linked records and optionally allow unlinking:

```jsx
import LinkedRecordsPanel from '../../components/common/LinkedRecordsPanel.jsx';

// linkedRecords comes from GET /records/:id → recordPayload.linkedRecords
<LinkedRecordsPanel
  linkedRecords={linkedRecords}          // array from getRecordDetails
  userRole={user?.role}                  // shows unlink button for HC/SHO/HQ_ADMIN
  onUnlink={(linkId) => deleteLinkMutation.mutate(linkId)}
  onNavigate={(recordId) => navigate(`/records/${recordId}`)}
/>
```

The component automatically groups by link type, shows a type badge per record, and displays key summary fields (name for arrests, FIR no. for cases, etc.).

### Reading links after a record fetch

Since `getRecordDetails` now includes `linkedRecords`, any page that fetches a record using `GET /api/v1/records/:id` gets links without a second API call:

```javascript
const { data: recordPayload } = useQuery({
  queryKey: ['records', id],
  queryFn: async () => (await api.get(`/records/${id}`)).data.data
});

const linkedRecords = recordPayload?.linkedRecords || [];
```

---

## 8. Person search across arrests

**Why not a `persons` table?**  
Every arrest record already stores person details (name, father name, age, address) in `records.data JSONB`. Creating a separate `persons` table would require dual-writing every time an arrest is updated. The GIN index on `records.data` (created in migration `20260618`) makes JSONB text search fast enough for PS-scale volumes.

**How it works:**  
`GET /api/v1/record-links/person-search?searchTerm=Ramesh&fatherName=Sohan`

Internally runs:
```sql
SELECT
  records.id,
  records.data->>'arrested_name' AS arrested_name,
  records.data->>'fullName'      AS full_name,
  records.data->>'father_name'   AS father_name,
  records.data->>'crime_head'    AS crime_head,
  records.data->>'uid'           AS uid,
  ps.name_en                     AS ps_name,
  records.current_status,
  records.record_date
FROM records
JOIN hierarchy_nodes ps ON ps.id = records.ps_id
WHERE records.record_type = 'ARREST'
  AND records.data::text ILIKE '%Ramesh%'      -- searchTerm
  AND records.data->>'father_name' ILIKE '%Sohan%'  -- fatherName
ORDER BY records.record_date DESC
LIMIT 50;
```

**When to upgrade:** If ARREST records exceed ~50,000 rows and searches become slow, add a `pg_trgm` trigram index:
```sql
CREATE INDEX idx_arrest_name_trgm ON records USING GIN (
  (data::text) gin_trgm_ops
) WHERE record_type = 'ARREST';
```
This is a future ops task — the query stays the same, just gets faster.

---

## 9. Report generation — how to use linkage

> **Important:** Report generation using linkage is not yet built. This section documents the **intended approach** based on the current architecture, so the team building it has a clear starting point.

### The concept: "master record"

A report typically starts from one record type (usually CASE) and fans out to pull in all linked records. The result is a flat "master row" per case containing fields from the case itself plus arrays from its linked arrests, missing persons, etc.

```
CASE/000042
  ├── case.fir_no        = "FIR-104/2026"
  ├── case.local_head    = "Burglary"
  ├── arrests[0].name    = "Ramesh Kumar"
  ├── arrests[0].age     = 28
  └── arrests[1].name    = "Suresh Singh"
```

### The building block: `getLinksForRecord`

`backend/src/modules/record-links/record-links.service.js → getLinksForRecord(recordId)`

This function returns everything you need in one SQL JOIN — the linked record's full JSONB data is included in `linked_record_data`. No second DB call.

**For report generation, the flow would be:**

```javascript
// Pseudocode for a report builder (not yet implemented)

// Step 1: get the base records (e.g. all CASEs in a district this month)
const cases = await listRecords('CASE', { dateFrom, dateTo }, jurisdictionQuery);

// Step 2: for each case, pull its links
const masterRecords = await Promise.all(
  cases.map(async (c) => {
    const links = await getLinksForRecord(c.id);

    const arrests  = links.filter(l => l.linked_record_type === 'ARREST')
                          .map(l => l.linked_record_data);
    const missing  = links.filter(l => l.linked_record_type === 'MISSING')
                          .map(l => l.linked_record_data);

    return {
      // Case-level fields
      uid:        c.data.uid,
      fir_no:     c.data.fir_no,
      crime_head: c.data.local_head,
      status:     c.current_status,
      ps_name:    c.ps_name,

      // Flattened arrest sub-rows
      arrests: arrests.map(a => ({
        name:       a.fullName || a.arrested_name,
        age:        a.age,
        arrest_date: a.dateOfArrest || a.arrest_date,
        crime_head: a.crime_head || a.crimeHead
      })),

      missing_persons: missing.map(m => ({
        name:    m.missing_name || m.name,
        dd_no:   m.dd_no,
        status:  m.status
      }))
    };
  })
);

// Step 3: pass masterRecords to the PDF/CSV formatter
// For CSV: flatten arrests into repeated rows per case
// For PDF: render each case as a section with nested arrest table
```

### Direct SQL approach (for complex reports)

For performance-sensitive reports with many cases, do the join in a single query instead of N+1 calls:

```sql
SELECT
  c.id                         AS case_id,
  c.data->>'uid'               AS case_uid,
  c.data->>'fir_no'            AS fir_no,
  c.data->>'local_head'        AS crime_head,
  c.current_status             AS case_status,
  ps_c.name_en                 AS case_ps,

  a.id                         AS arrest_id,
  a.data->>'fullName'          AS arrested_name,
  a.data->>'age'               AS age,
  a.data->>'dateOfArrest'      AS arrest_date,
  a.data->>'crime_head'        AS arrest_crime_head,
  a.current_status             AS arrest_status

FROM records c
JOIN hierarchy_nodes ps_c ON ps_c.id = c.ps_id
LEFT JOIN record_links rl
  ON rl.source_record_id = c.id
LEFT JOIN link_type_registry ltr
  ON ltr.id = rl.link_type_id AND ltr.code = 'CASE_ARREST'
LEFT JOIN records a
  ON a.id = rl.target_record_id

WHERE c.record_type = 'CASE'
  AND c.district_id = '<district-uuid>'
  AND c.record_date BETWEEN '2026-06-01' AND '2026-06-30'
ORDER BY c.record_date DESC, a.data->>'dateOfArrest' ASC;
```

Note: `LEFT JOIN` means cases with zero arrests still appear in results (with NULL arrest columns). Use `INNER JOIN` if you only want cases that have at least one arrest.

### Applying filters on linked data

```sql
-- Cases where at least one arrest is still in DRAFT status
SELECT DISTINCT c.*
FROM records c
JOIN record_links rl ON rl.source_record_id = c.id
JOIN records a ON a.id = rl.target_record_id AND a.record_type = 'ARREST'
WHERE c.record_type = 'CASE'
  AND a.current_status = 'DRAFT';

-- Cases with more than 2 arrested persons
SELECT c.id, c.data->>'fir_no', COUNT(a.id) AS arrest_count
FROM records c
JOIN record_links rl ON rl.source_record_id = c.id
JOIN records a ON a.id = rl.target_record_id AND a.record_type = 'ARREST'
WHERE c.record_type = 'CASE'
GROUP BY c.id, c.data->>'fir_no'
HAVING COUNT(a.id) > 2;
```

### Template definition format (future)

When report templates are moved to the DB (currently they're hardcoded in `reports.controller.js`), linked-record sections can be expressed like this:

```json
{
  "template_id": "case_arrest_report",
  "sections": [
    {
      "title_en": "Case Details",
      "record_type": "CASE",
      "fields": ["uid", "fir_no", "local_head", "record_date", "current_status"]
    },
    {
      "title_en": "Arrests in this Case",
      "source": "linked_records",
      "link_type": "CASE_ARREST",
      "fields": ["fullName", "age", "dateOfArrest", "crime_head", "nafisPrepared"]
    }
  ]
}
```

The report engine reads the `source: "linked_records"` key and calls `getLinksForRecord` automatically. Old templates without this key are unaffected.

---

## 10. Architecture decisions

### Why a junction table instead of a column on `records`?

Adding `case_id` directly to the `records` table would mean:
- An `ALTER TABLE records ADD COLUMN case_id` for every new relationship type
- Only one relationship per record (can't link one arrest to two cases)
- Hard to query in reverse (given a case, find all arrests) without an index trick

The junction table costs one JOIN but scales to any number of relationship types and directions.

### Why `link_type_registry` instead of hardcoding in code?

Following the existing "Config over Code" pillar of the project. Adding `CASE_MISSING` support requires only a DB row and flipping `is_active`, not a code deploy. The backend validates link types at runtime against this table, so invalid or not-yet-enabled link types are rejected automatically.

### Why not a `persons` table?

Explored during design. Rejected because:
1. Person data already lives in `records.data` JSONB — a separate `persons` table creates a sync surface with no clear owner
2. The GIN index on `records.data` handles text search at PS scale
3. Dual-writing (update arrest → also update persons row) adds failure modes

Revisit this decision if deduplication across PS boundaries becomes a requirement (e.g. "is this person in the NAFIS system across all Delhi PS?"). At that point a `persons` table with NAFIS ID as the canonical key makes sense.

### Why `ON DELETE CASCADE` on record_links?

If a record is deleted (which PHAROS doesn't normally do — records are status-changed to ARCHIVED, not deleted), any links pointing to it are automatically removed. Without CASCADE, deleting a record would fail with a FK violation. CASCADE is the safe default.

### Backward compatibility

The old `linked_fir_dd_no` field in `records.data` JSONB is **not removed**. Existing records retain their text reference. New arrests created via the UI no longer populate it (they use the proper link table instead), but it's kept in `field_registry` so legacy records still display correctly in forms and reports.

---

## File map

| Purpose | File |
|---|---|
| DB tables + seed | `backend/scripts/migrations.js` (lines near the bottom, search for `link_type_registry`) |
| Service functions | `backend/src/modules/record-links/record-links.service.js` |
| API controller | `backend/src/modules/record-links/record-links.controller.js` |
| API routes | `backend/src/modules/record-links/record-links.router.js` |
| Event handler (audit) | `backend/src/events/handlers/linkAuditHandler.js` |
| Auto-include in record detail | `backend/src/modules/records/records.service.js → getRecordDetails()` |
| Linked-case filter | `backend/src/modules/records/records.service.js → listRecords()` |
| Arrest form (UI, two-phase submit) | `frontend/src/pages/ArrestManagement.jsx` |
| Reusable panel component | `frontend/src/components/common/LinkedRecordsPanel.jsx` |
| Record detail (shows linked records) | `frontend/src/pages/sho/RecordDetail.jsx` |
| Person search page | `frontend/src/pages/PersonSearchPage.jsx` |
