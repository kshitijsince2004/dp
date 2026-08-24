# Kalandra arrest — audit report
**Date:** 2026-08-18

## Executive summary
- **Database Schema**: `arrest_details.is_dd_based` (boolean), `gd_no` (varchar), `gd_date` (date), and `gd_time` (time) exist as first-class database columns in `arrest_details`. However, `reason_for_detention`, `kalandra_section`, `disposal_type`, and `produced_before` do NOT exist as database columns.
- **Existing Records & Leakage**: 6 Kalandra records exist in `arrest_details`. Out of these, 1 Kalandra arrest has an unintended `CASE_ARREST` link because `linkResolver.js`'s reverse lookup `backfillOrphansForCase` queries by `fir_no` without filtering out `is_dd_based = true`.
- **Field Registry Gaps**: While `gd_no` and `gd_date` are registered in `field_registry` for `ARREST`, `is_dd_based` is stored directly on `$detail` without a formal UI field definition, and `reason_for_detention` is completely missing from `field_registry`.
- **Frontend vs Backend Workflow**: `NewRecord.jsx` provides a dedicated 2-card selector (`Against FIR` vs `Kalandra / Preventive`). For Kalandra, Step 0 (`select_fir`) is skipped and `DynamicForm.jsx` automatically stamps `is_dd_based: true` and strips `fir_no`/`fir_date`. Both FIR and Kalandra arrests traverse the standard 4-tier workflow (`DRAFT` -> `PENDING_SHO` -> `DISTRICT_REVIEW` -> `JCP_REVIEW` -> `SCP_REVIEW` -> `HQ_RECEIVED`).
- **Diary & Reporting Gaps**: Neither `report-engine` nor `daily-diary` queries `is_dd_based`. `STAT_21` (Kalandra register) in `report-engine` is currently a blocked stub emitting placeholder dashes.

---

## Layer-by-layer findings

### Database
| Column | Exists? | Has data in Kalandra rows? | Notes |
|---|---|---|---|
| `is_dd_based` | YES (`boolean`) | YES (6/6 rows `true`) | First-class column in `arrest_details` |
| `gd_no` | YES (`varchar`) | YES (6/6 rows have GD numbers like `GD/3000`) | First-class column in `arrest_details` |
| `gd_date` | YES (`date`) | YES (6/6 rows have dates) | First-class column in `arrest_details` |
| `gd_time` | YES (`time without time zone`) | NO (0/6 populated) | Column exists |
| `reason_for_detention` | NO | NO (0/6, not in `extra`) | Column does not exist in schema |
| `kalandra_section` | NO | NO | Column does not exist in schema |
| `disposal_type` | NO | NO | Column does not exist in schema |
| `produced_before` | NO | NO | Column does not exist in schema |

**BNSS preventive sections in ref.sections:**
| Section | Exists in ref.sections? | Act Mapping | Description |
|---|---|---|---|
| 126 | YES | BNSS / CrPC (act_sec_cd: 4377 / 2537) | Security for keeping the peace |
| 127 | YES | BNSS / CrPC (act_sec_cd: 4377 / 2537) | Security for good behaviour from persons disseminating seditious matters |
| 128 | YES | BNSS / CrPC (act_sec_cd: 4377 / 2537) | Security for good behaviour from suspected persons |
| 129 | YES | BNSS / CrPC (act_sec_cd: 4377 / 2537) | Security for good behaviour from habitual offenders |
| 172 | YES | BNSS / CrPC (act_sec_cd: 4377 / 2537) | Persons bound to conform to lawful directions of police |
| 151 | YES | CrPC (act_sec_cd: 2537) | Arrest to prevent the commission of cognizable offences |

**Existing data:**
- FIR arrests: `17,026`
- Kalandra arrests: `6`
- Total arrest records: `17,032`
- Kalandra records with bad `CASE_ARREST` link: `1` (`target_record_id: b21a6b79-a29a-44a7-ba9c-0c78c5693412`)

---

### Field registry
| Field key | Exists? | show_when correct? | Storage correct? | Notes |
|---|---|---|---|---|
| `is_dd_based` | NO | N/A | N/A | Stamped directly in `DynamicForm.jsx` and `import.compose.js` |
| `gd_no` | YES | `null` (Always) | `{"table":"$detail","column":"gd_no"}` | Active, section `arrest_details` |
| `gd_date` | YES | `null` (Always) | `{"table":"$detail","column":"gd_date"}` | Active, section `arrest_details` |
| `reason_for_detention` | NO | N/A | N/A | Not registered in `field_registry` |
| `case_type` | YES | `null` | `{"table":"$detail","column":"case_type"}` | Active |
| `case_status` | YES | `null` | `{"table":"$detail","column":"case_status"}` | Active |
| `scheme_of_arrest` | YES | `null` | `{"table":"$detail","column":"scheme_of_arrest"}` | Active |

**Missing field registry entries:**
- `is_dd_based`: Missing formal registry definition (currently handled ad-hoc in frontend submit handler).
- `reason_for_detention`: Missing from `field_registry` entirely; stripped on form submit if sent.

---

### Backend
**`records.normalize.js`**
- Kalandra validation present: NO
- What it validates: Normalizes `fir_no` format (`normalizeFirNo`), validates Act/Section codes against `ref.acts` and `ref.sections`.
- What it does NOT validate: Does not perform semantic checks on whether `gd_no`/`gd_date` is mandatory when `is_dd_based = true` or whether `fir_no` is forbidden.

**`records.service.js` & `records.controller.js`**
- `is_dd_based` guard on record creation: YES in `records.controller.js` (lines 93–97) and `import.compose.js` (lines 132–137), which strip `fir_no`/`fir_date` if `is_dd_based === true`.
- `is_dd_based` guard on `linkResolver.js`:
  - **Forward link creation** (`resolveAndLink` lines 114–117): YES (`if (detail.is_dd_based === true) return;`).
  - **Backward link creation** (`backfillOrphansForCase` lines 42–45): **NO**. Queries `WHERE fir_no = fir.fir_no` without checking `is_dd_based`, allowing cases to link to legacy Kalandras that had non-null `fir_no`.
- GD fields written to `arrest_details`: YES (`gd_no`, `gd_date` are mapped through `splitPayload` to `arrest_details`).

**Relevant Code Snippet (`records.controller.js` lines 89–97):**
```javascript
  // G2 defence-in-depth (Kalandra safety) — mirrors import.compose.js. If the data block
  // carries is_dd_based=true (stamped by DynamicForm for caseType=kalandra), clear fir_no
  // so linkResolver never auto-links a standalone DD arrest to a CASE. Applied here rather
  // than inside the service so the sanitised value is what the mapper/registry writes.
  if (record_type === 'ARREST' && data.is_dd_based === true) {
    delete data.fir_no;
    delete data.fir_date;
    log.debug('create: G2 Kalandra guard applied — fir_no/fir_date stripped from is_dd_based record', { record_type });
  }
```

**`records.mapper.js`**
- GD fields mapped in API response: YES (`gd_no`, `gd_date` mapped via `$detail` storage configuration).
- Missing from response: `reason_for_detention` (since not in table or registry).

---

### Frontend
**`NewRecord.jsx`**
- Toggle present: YES
- Toggle type: Two interactive Selection Cards (`Against FIR` vs `Kalandra / Preventive`) at the entry screen of Arrest registration.
- Fields shown for Kalandra: Standard arrest registration steps (Arrest Details, Person Details, Property, Action Taken).
- Fields hidden for Kalandra: Step 0 ("Search & Select FIR") is suppressed.
- FIR fields cleared on switch: YES (`DynamicForm.jsx` lines 4023–4028 explicitly deletes `fir_no` and `fir_date` and sets `is_dd_based = true` upon submission when `caseType === 'kalandra'`).
- Kalandra validation on submit: Checks standard required fields in `field_registry`.

**Code snippet of toggle (`NewRecord.jsx` lines 185–232):**
```jsx
{/* Against FIR Card */}
<div
  onClick={() => { log.debug('action:arrest_case_type_select', { caseType: 'against_fir' }); setCaseType('against_fir'); }}
  className="group cursor-pointer bg-white border border-slate-200 hover:border-[var(--accent-color)] rounded-3xl p-8..."
>
  <h3>Against FIR</h3>
</div>

{/* Kalandra Card */}
<div
  onClick={() => { log.debug('action:arrest_case_type_select', { caseType: 'kalandra' }); setCaseType('kalandra'); }}
  className="group cursor-pointer bg-white border border-slate-200 hover:border-[var(--accent-color)] rounded-3xl p-8..."
>
  <h3>Kalandra / Preventive</h3>
</div>
```

**`RecordDetail.jsx`**
- Kalandra fields visible in detail view: YES (General info renders `gd_no` and `gd_date` dynamically).
- Which fields: GD Number, GD Date, Custody Status, Arresting Officer, Person Arrested Details.
- SHO can edit: YES, during `SENT_BACK` or transition review when permitted.

---

### Workflow
- Kalandra uses same transitions as FIR arrests: YES.
- Any Kalandra-specific transitions: NO (both follow standard transitions: `DRAFT` -> `PENDING_SHO` -> `DISTRICT_REVIEW` -> `JCP_REVIEW` -> `SCP_REVIEW` -> `HQ_RECEIVED`).

---

### Diary engine
- `is_dd_based` used in any renderer: NO.
- Files and lines: None.
- M-11 correctly computed: NO (`STAT_21_KALANDRA` is a placeholder stub emitting dashes).

---

### Import
- ARREST template handles `is_dd_based`: YES.
- `import.compose.js` lines 132–137:
```javascript
  } else if (recordType === 'KALANDRA') {
    // Never fir_no — a DD/GD number routed to arrest_details.fir_no would make
    // linkResolver.js try to auto-link it to a CASE as though it were a real FIR (G2).
    delete data.fir_no;
    data.is_dd_based = true;
    log.debug('composeRecordPayload: KALANDRA stamped is_dd_based, fir_no stripped (G2 safety)', { sourceRef });
  }
```

---

### End-to-end API test
- **Kalandra arrest creation**: SUCCESS (`201 Created`, record ID `4175e082-a0e2-411a-abb1-8995d412a95b`).
- **Response**:
```json
{
  "success": true,
  "data": {
    "id": "4175e082-a0e2-411a-abb1-8995d412a95b"
  }
}
```
- **Database row verified**: `arrest_details.is_dd_based = true`, `gd_no = 'GD-TEST-001'`, `gd_date = '2026-08-15'`, `fir_no = null`. `record_links` is empty (0 links).
- **FIR arrest without linked_case_id**: ACCEPTED (`201 Created`, `is_dd_based: false`, unlinked arrest draft created).
- **Verdict**: Backend enforces the distinction and isolates Kalandra arrests from FIR linkage.

---

## What is fully working ✅
1. **Database Schema**: `is_dd_based`, `gd_no`, `gd_date`, `gd_time` columns are present and operational in `arrest_details`.
2. **Frontend Selection**: `NewRecord.jsx` allows operators to cleanly choose `Against FIR` vs `Kalandra / Preventive`.
3. **Link Isolation on Create**: `records.controller.js` and `DynamicForm.jsx` automatically sanitize Kalandra payloads by setting `is_dd_based = true` and deleting `fir_no`/`fir_date`.
4. **Forward Link Resolver**: `linkResolver.js` forward resolution skips records with `is_dd_based === true`.
5. **Bulk Import Support**: `import.compose.js` handles `KALANDRA` record import batches and stamps `is_dd_based = true`.

---

## What exists but is incomplete ⚠️
1. **Reverse Orphan Linker in `linkResolver.js`**: `backfillOrphansForCase` queries matching `fir_no` without checking `is_dd_based`. If legacy data has both `fir_no` and `is_dd_based = true`, a created CASE will link to it.
2. **Filter Strip Differentiation**: `UnifiedFilterStrip.jsx` and `records.service.js` support `arrest_kind: 'KALANDRA'`, but `reason_for_detention` is not stored as a dedicated field.

---

## What is entirely missing ❌
1. **`reason_for_detention` Field**: Not present in `field_registry` or `arrest_details` table.
2. **STAT_21 Kalandra Diary Calculation**: `backend/src/modules/report-engine/fn/renderers/stat-21-kalandra.js` is a blocked stub emitting placeholder dashes.
3. **Explicit Kalandra Validation Rules**: No check ensuring `gd_no` and `gd_date` are mandatory when `is_dd_based = true`.

---

## Recommended changes (in order)
1. **Fix `backfillOrphansForCase` in `linkResolver.js`**: Add `.where(b => b.where('d.is_dd_based', false).orWhereNull('d.is_dd_based'))` to prevent backward case-linking to Kalandra records.
2. **Add `reason_for_detention` to `field_registry`**: Map it to `arrest_details.extra->>'reason_for_detention'` with conditional display for Kalandra arrests.
3. **Implement STAT_21 Kalandra Renderer**: Implement query aggregation for preventive arrests and disposal statuses in `stat-21-kalandra.js`.
