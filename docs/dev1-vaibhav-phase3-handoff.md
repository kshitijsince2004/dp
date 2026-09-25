# Phase 3 Backend Deliverables Handoff Document (Dev1 — Vaibhav)

This document provides a comprehensive technical overview of the backend components implemented for Phase 3: the **Asynchronous Report Engine**, the **Bulk Import Module**, and the **Python Worker** integration.

---

## 1. Architectural Reconciliation

During the exploratory phase of the project, a "data warehouse" model was proposed featuring separate `dim_*` and `fact_*` tables. In Phase 3, this has been replaced with the official **polymorphic records database model** as specified in `phase3.html`:

- **Kept & Adapted**:
  - **RBAC Geographical Scoping**: Head Constables (HC) are locked to their own Police Station (`ps_id`), and District Officers are restricted to their `district_id`.
  - **Bilingual Support**: Column headers, templates, and hints support both English and Hindi.
  - **SELECT Vocabulary Validation**: Pre-insert normalisation checks are now enforced against the `field_registry` options.
  - **Record Type Normalisation**: Standardized and resolved conflicts between the reports controller and the database schema. Legacy reports used `'PCR'` and `'CASES'` as record types, whereas the database seeds, import parser, and Python worker standardise on `'PCR_CALL'` and `'CASE'`. All in-memory templates, fallback generators, and daily status record-counters have been updated in `reports.controller.js` to match the DB schema.
- **Replaced**:
  - Separate star-schema dimensions have been retired. All records are stored polymorphically in `records` (`record_type` + `data` JSONB).
  - Synchronous report generation in the HTTP cycle has been replaced with an asynchronous publish-subscribe model via RabbitMQ and a Python worker.
- **Deferred (Out of Scope)**:
  - Materialized analytics dashboards are deferred.

---

## 2. Field Coverage Gap List

Based on the audit comparing `Master/` spreadsheets with `seeds/seed.js`:

### 2.1 CASE (FIR) Module
- **Missing Columns in DB Seed**:
  - `Case Reg. Type` (Dropdown: CCTNS(Manual FIR), e-Theft, e-MVT, NCRP(e-FIR), zero FIR)
  - `DETAILS OF COMPLAINANT (Parents NAME)`
  - `TIME OF OCCURRENCE` (Seed only has `GD Time`)
  - `ARRESTED PERSON (PARENTS NAME)`
  - `ARRESTED PERSON (AGE)`
  - `CONTACT OF IO`
- **Mismatched Labels**:
  - DB Seed field `local_head` is labeled "Local Head (Crime)" but Excel column is "Crime Head".
  - DB Seed field `status` is labeled "Case Status" but Excel column is "Case status".

### 2.2 ARREST Module
- **Missing Columns in DB Seed**:
  - `ARRESTED PERSON (PARENTS NAME)`
  - `ARRESTED PERSON (AGE)`
  - `Time of Arrest`
  - `Contact of IO`
  - `PREV. INVOLVEMENT (NO. OF CASES)`
  - `Is the person PO`
  - `SEIZURE`
  - `WHETHER ACCUSED IS BC OR NOT`
  - `Contact of AO`
  - Patrol columns: `ARRESTED IN (INTEGRATED PI)`, `(GROUP PATROLLING)`, `(CYCLE PATROLLING)`, `(BY ANTI-SNATCHING TEAM)`, `(BY PRAHARI)`, `(BY EYES & EARS SCHEME MEMBERS)`.

---

## 3. Scope Gap: Missing Person & UIDB
- In the `phase3.html` specification, the `record_type` parameters and `ImportPanel` components are only defined for `CASE`, `ARREST`, and `PCR_CALL`.
- **Backend Action**: We have restricted the bulk import templates and generator engine strictly to these 3 types to prevent API contract mismatch with other developers. `MISSING` and `UIDB` options are deferred to future milestones.

---
## 4. API Endpoint Reference

### 4.1 Reports API
All endpoints are prefix-mounted at `/api/reports/` and `/api/v1/reports/`.

#### 1. `GET /templates`
- **Access**: All authenticated roles.
- **Description**: Returns all predefined, custom-saved, and daily status templates.
- **Query Params**: `?record_type=CASE` (optional), `?template_type=COMPOSITE` (optional)
- **Response**:
  ```json
  {
    "status": "success",
    "success": true,
    "data": {
      "templates": [
        {
          "id": "arrest-summary",
          "name_en": "Arrest Summary Report",
          "name_hi": "गिरफ्तारी सारांश रिपोर्ट",
          "template_type": "PROFORMA",
          "applicable_record_types": ["ARREST"],
          "output_formats": ["PDF", "CSV", "EXCEL"],
          "template_definition": {}
        }
      ]
    }
  }
  ```

#### 2. `POST /generate`
- **Access**: All authenticated roles. Enforces geographic restrictions:
  - `HC` role can only generate for their own `ps_id`.
  - `DISTRICT_OFFICER` can only generate for their own `district_id`.
- **Request Body (Predefined/Composite)**:
  ```json
  {
    "template_id": "daily-status",
    "filters": {
      "date_from": "2026-06-01",
      "date_to": "2026-06-19",
      "ps_id": "PS_NDD_PARLIAMENTSTREET"
    },
    "format": "EXCEL",
    "selected_sub_templates": ["arrest-summary", "pcr-call-log"]
  }
  ```
- **Request Body (Custom)**:
  ```json
  {
    "custom_definition": {
      "title_en": "Custom Case Report",
      "sheets": [
        {
          "record_type": "CASE",
          "field_keys": ["fir_no", "fir_date", "complainant_name", "local_head"]
        }
      ]
    },
    "filters": {
      "date_from": "2026-06-01",
      "date_to": "2026-06-19",
      "ps_id": "PS_NDD_PARLIAMENTSTREET"
    },
    "format": "EXCEL"
  }
  ```
- **Response**:
  ```json
  {
    "status": "success",
    "success": true,
    "data": {
      "job_id": "31b14a29-0ec6-4bfb-bd5e-4bb587b1c4e9",
      "status": "PENDING"
    }
  }
  ```

#### 3. `GET /status/:id`
- **Description**: Check status/progress of report generation.
- **Response**:
  ```json
  {
    "status": "success",
    "success": true,
    "data": {
      "job": {
        "id": "31b14a29-0ec6-4bfb-bd5e-4bb587b1c4e9",
        "status": "PENDING",
        "template_id": "daily-status",
        "format": "EXCEL",
        "created_at": "2026-06-20T08:00:00.000Z"
      },
      "job_id": "31b14a29-0ec6-4bfb-bd5e-4bb587b1c4e9",
      "status": "PENDING",
      "template_id": "daily-status",
      "format": "EXCEL",
      "created_at": "2026-06-20T08:00:00.000Z"
    }
  }
  ```
  *(Note: Status can be `PENDING`, `READY`, or `FAILED`)*

#### 4. `GET /download/:id`
- **Description**: Download compiled file (Excel, PDF, or CSV). Sets attachments `Content-Disposition` and headers based on output format.

#### 5. `GET /history`
- **Description**: Paginated listing of reports generated by the authenticated user.
- **Query Params**: `?page=1` (default), `?limit=20` (default)
- **Response**:
  ```json
  {
    "status": "success",
    "success": true,
    "data": [
      {
        "id": "31b14a29-0ec6-4bfb-bd5e-4bb587b1c4e9",
        "job_id": "31b14a29-0ec6-4bfb-bd5e-4bb587b1c4e9",
        "template_id": "daily-status",
        "format": "EXCEL",
        "status": "READY",
        "created_at": "2026-06-20T08:00:00.000Z",
        "completed_at": "2026-06-20T08:00:05.000Z",
        "filters": { "ps_id": "PS_NDD_PARLIAMENTSTREET" }
      }
    ],
    "meta": {
      "page": 1,
      "limit": 20,
      "total": 1
    }
  }
  ```

#### 6. `GET /schedules` (HQ_ADMIN / SYSTEM_ADMIN only)
- **Response**: List of configured cron-scheduled automatic reports.

---

### 4.2 Bulk Import API
All endpoints are mounted at `/api/import/` and `/api/v1/import/`.

#### 1. `GET /template/:record_type`
- **Description**: Streams a blank Excel template dynamically built from `field_registry` active fields (required first).
- **Query Params**: `?lang=en` (default) or `hi`

#### 2. `POST /validate`
- **Access**: Operators (HC), District Officers, Admins. (HC cannot import with `is_legacy = true`).
- **Payload**: `multipart/form-data` containing `file` (Excel spreadsheet), `record_type` (`CASE`|`ARREST`|`PCR_CALL`), and optional `is_legacy` (`true`|`false`) and optional `ps_id` (enforced if HC).
- **Response**:
  ```json
  {
    "success": true,
    "data": {
      "batch_id": "cfa5e128-444a-4648-93c6-fbf333e2a0b3",
      "total_rows": 2,
      "valid_rows": 1,
      "invalid_rows": 1,
      "expires_at": "2026-06-21T08:05:00.000Z",
      "errors": [
        {
          "row": 5,
          "field_key": "arrested_name",
          "code": "REQUIRED_MISSING",
          "message": "Name of Arrested Person is required"
        },
        {
          "row": 5,
          "field_key": "arrest_date",
          "code": "INVALID_TYPE",
          "message": "Must be a valid date (YYYY-MM-DD)"
        }
      ]
    }
  }
  ```

#### 3. `POST /confirm/:batchId`
- **Access**: Same user who uploaded the batch.
- **Description**: Commit valid rows inside database transactions in chunks of 100. Write revisions, audit logs, and trigger RabbitMQ notifications.
- **Response**:
  ```json
  {
    "success": true,
    "data": {
      "batch_id": "cfa5e128-444a-4648-93c6-fbf333e2a0b3",
      "imported_rows": 1,
      "skipped_rows": 1,
      "status": "COMPLETED"
    }
  }
  ```

#### 4. `GET /batches`
- **Description**: List of imports uploaded by the authenticated user.
- **Query Params**: `?page=1` (default), `?limit=20` (default)
- **Response**:
  ```json
  {
    "success": true,
    "data": [
      {
        "id": "cfa5e128-444a-4648-93c6-fbf333e2a0b3",
        "record_type": "ARREST",
        "is_legacy": false,
        "total_rows": 2,
        "valid_rows": 1,
        "invalid_rows": 1,
        "status": "COMPLETED",
        "created_at": "2026-06-20T08:05:00.000Z"
      }
    ],
    "meta": { "page": 1, "limit": 20, "total": 1 }
  }
  ```

#### 5. `GET /batches/:batchId`
- **Description**: Full batch statistics and error details.
- **Response**:
  ```json
  {
    "success": true,
    "data": {
      "id": "cfa5e128-444a-4648-93c6-fbf333e2a0b3",
      "record_type": "ARREST",
      "is_legacy": false,
      "total_rows": 2,
      "valid_rows": 1,
      "invalid_rows": 1,
      "status": "COMPLETED",
      "created_at": "2026-06-20T08:05:00.000Z",
      "errors": [
        {
          "row": 5,
          "field_key": "arrested_name",
          "code": "REQUIRED_MISSING",
          "message": "Name of Arrested Person is required"
        }
      ]
    }
  }
  ```

---

## 5. Event Broker Contracts (RabbitMQ)

- **Exchange**: `pharos` (Topic)
- **Routing Key `report.requested`**:
  - Payload: `{ "job_id": "uuid", "template_id": "...", "custom_definition": null, "filters": {...}, "format": "EXCEL", "selected_sub_templates": null, "user_id": "..." }`
- **Routing Key `report.generated`**:
  - Payload: `{ "job_id": "uuid", "template_id": "...", "requested_by": "...", "file_path": "...", "format": "EXCEL", "file_size_bytes": 1024 }`
- **Routing Key `record.batch_imported`**:
  - Payload: `{ "batch_id": "uuid", "count": 247, "is_legacy": false, "record_type": "ARREST" }`

---

## 6. How to Run Python Worker Locally

1. Ensure the Python environment has the packages listed in `requirements.txt` installed:
   ```bash
   pip install -r python_worker/requirements.txt
   ```
2. Make sure backend `.env` has appropriate values (e.g. `RABBITMQ_URL` and `DB_CLIENT`). The worker automatically links to the backend database path.
3. Start the worker consumer:
   ```bash
   python python_worker/main.py
   ```

---

## 7. Development Hand-Off Guidelines

- **Shahista (Frontend Lead)**:
  - The expected report polling interval is 2 seconds (see `useReportJob.js` hook).
  - The Daily-Diary proforma UUID placeholder configuration can query `GET /templates?template_type=COMPOSITE` to dynamically locate the composite daily diary ID.
  - Review the response structures in Section 4.1/4.2 above. All endpoints return standard `{ success: true, data: ... }` wrappers. For validations, errors are mapped directly to cell coordinates (`row`, `field_key`).
- **Akshat (Testing Lead)**:
  - To test select validation, send a `POST` request to `/api/records` with an out-of-vocabulary option for `local_head` (e.g. `"INVALID_CRIME_HEAD"`). It will fail with HTTP 422.
  - To test dry-run error listing, generate a batch sheet with a blank `arrested_name` cell (generates `REQUIRED_MISSING`) or a cell with text instead of a valid date.
  - Temp files land on disk inside `backend/temp-imports/` and expire in 24 hours.
- **Cleanup Cron**:
  - Scheduled hourly to delete temporary upload sheets older than 24 hours and mark the batch status as `EXPIRED`.

---

## 8. Recent Development & Conflict Resolutions (June 20)

### 8.1 Merge Conflict Resolutions
- Resolved branch conflicts in `backend/scripts/seed-dummy-data.js`, `backend/scripts/seed-fields.js`, `backend/seeds/seed.js`, and `backend/src/modules/fields/fields.controller.js` after pulling updates from `main`. The `feature/daily-diary-compilation` branch is now up to date with `main`.

### 8.2 Python Worker Stability (Winsock Sandbox Fix)
- **Issue**: The Python worker was hanging indefinitely on Windows due to a networking sandbox issue when trying to establish a connection using SQLAlchemy and Pika over localhost (Winsock anomaly).
- **Resolution**: Refactored `generator.py` to bypass SQLAlchemy and Pika completely when the `DB_CLIENT` is set to `sqlite3`. The worker now uses Python's built-in `sqlite3` module to directly query the local database, resulting in flawless performance without network-layer hangs.

### 8.3 Custom Multi-Sheet Reports Engine
- **Cross-Table Filtering**: Implemented the `generate_custom_workbook` function in the Python worker. The frontend can now send custom definitions that dictate specific filters per table (e.g., specific columns for the CASE table vs the ARREST table).
- **Dynamic Workbooks**: The engine constructs a multi-sheet Excel workbook based on the `sheets` payload. Each sheet runs its own dynamically built query against its designated record type, applying its specific filters (like Date and PS ID) independently.

### 8.4 File Path Anomalies
- The Python worker now accurately resolves relative file paths to absolute file paths, ensuring the generated Excel, PDF, or CSV files are correctly stored in the `backend/reports` output directory, regardless of the Current Working Directory (CWD) where the worker was invoked from.
