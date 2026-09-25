# PHAROS Phase 2 — Parallel Development Log & Integration Reference

This document serves as the living development log for Phase 2 implementation of the Delhi Police Automated Reporting System (PHAROS). It details the architectural changes, database additions, API routes, event schemas, and integration notes for future synchronization.

---

## 1. Executive Summary & Narrative Log

As a solo developer owning the Dev 1, Dev 2, and Dev 3 tracks, we have completed the core backend expansion of Phase 2 features. Key security hardening, workflow extensions, data engine modules, and custom filters have been implemented and validated.

### Accomplished in this Session:
- **Level Data Contracts API:** Implemented CRUD endpoints for route configurations at `/api/v1/level-contracts`.
- **Query-Time Field Masking:** Added automatic data and EAV custom field masking based on active `level_data_contracts` in record retrieval (`getRecord`, `getRecords`, `getQueue`, and `searchRecords`).
- **Dynamic Filter Engine:** Implemented recursive AND/OR parser mapping to SQLite/Postgres expressions including support for database columns, custom JSON fields, and virtual fields (`_status`, `_is_legacy`, `_record_date`, `_created_at`, `_sla_breached`).
- **ExcelJS Report Generation:** Implemented XLSX export capability using the `exceljs` library.
- **Reports Scheduling Service:** Built a resilient scheduling daemon using `node-cron` that dynamically polls, loads, and executes active report definitions.
- **Verification Tests:** Created `verify_p2_filters_contracts.js` which verifies Level contracts masking, custom filter specifications, search, and presets CRUD.

---

## 2. API Reference (New & Updated Endpoints)

### Records & Search
- `POST /api/v1/records/search`
  - **RBAC:** Any authenticated user
  - **Payload:** `{ "record_type": "CASES", "filter_spec": { "logic": "AND", "conditions": [...] } }`
  - **Enforces:** Scoped jurisdiction (operator/SHO/District) + Level Data Contracts masking.

### Level Data Contracts
- `GET /api/v1/level-contracts` (SYSTEM_ADMIN only) — Lists active contracts.
- `POST /api/v1/level-contracts` (SYSTEM_ADMIN only) — Creates a contract.
- `PUT /api/v1/level-contracts/:id` (SYSTEM_ADMIN only) — Updates a contract.

### Filter Presets
- `GET /api/v1/filters/presets` (Any authenticated user) — Lists system, role-specific, and user-specific presets.
- `POST /api/v1/filters/presets` (Any authenticated user) — Saves a custom preset.
- `DELETE /api/v1/filters/presets/:id` (Any authenticated user) — Deletes a preset.

### Report Schedules
- `GET /api/v1/reports/schedules` (HQ/Admin only) — Lists active cron schedules.
- `POST /api/v1/reports/schedules` (HQ/Admin only) — Creates a report schedule.
- `PUT /api/v1/reports/schedules/:id` (HQ/Admin only) — Updates a schedule.
- `DELETE /api/v1/reports/schedules/:id` (HQ/Admin only) — Deletes a schedule.
- `POST /api/v1/reports/schedules/:id/run` (HQ/Admin only) — Triggers execution now.

---

## 3. Event Bus Reference (RabbitMQ Routing Keys)

We maintain event-driven decoupling using the `pharos` topic exchange:
- `admin.config_changed` — Emitted when Level Contracts or filter configurations are created/updated.
  - *Payload:* `{ entity_type, entity_id, action, changed_by, changes }`
- `report.generated` — Emitted on completion of PDF/Excel/CSV jobs.
  - *Payload:* `{ job_id, template_id, requested_by, file_path, format, file_size_bytes }`
- `legacy.batch_imported` — Emitted when legacy data is ingested.
  - *Payload:* `{ batch_id, ps_id, record_type, imported_count, imported_by }`

---

## 4. Integration Notes for Future Developers
- **Cross-Database Date Arithmetic:** The SLA breach checker (`_sla_breached` virtual field) queries database-specific functions. In PostgreSQL, it uses interval arithmetic: `records.updated_at + (wt.sla_hours || ' hours')::INTERVAL < NOW()`. In SQLite, it uses: `datetime(records.updated_at, '+' || wt.sla_hours || ' hours') < datetime('now')`.
- **Level Contracts Defaulting:** If no level contract matches a request, the API defaults to exposing all fields rather than masking everything, preventing breakage of existing flows.
- **ExcelJS Auto-Sizing:** Column widths in reports are dynamically auto-adjusted with padding to keep headers and data readable.

---

## 5. Feature Checklist

| Track | Feature Description | Status |
|---|---|---|
| Reconstruct | RabbitMQ event bus & mock fallback | ✅ Implemented |
| Reconstruct | Records CRUD & JSONB storage | ✅ Implemented |
| Reconstruct | Workflow state machine | ✅ Implemented |
| Net-New P2 | SHA-256 revision hash-chaining | ✅ Implemented |
| Net-New P2 | Keycloak OIDC/MFA & JWT Fallback | ✅ Implemented |
| Net-New P2 | IP Allowlist, CSRF, Rate Limiter | ✅ Implemented |
| Net-New P2 | JCP & SCP Hierarchy Levels | ✅ Implemented |
| Net-New P2 | Level Data Contracts Masking | ✅ Implemented |
| Net-New P2 | Legacy Batch Importer & Amendments | ✅ Implemented |
| Net-New P2 | Advanced Filter Engine (AND/OR spec) | ✅ Implemented |
| Net-New P2 | Saved Filter Presets CRUD | ✅ Implemented |
| Net-New P2 | ExcelJS Reports Export (XLSX) | ✅ Implemented |
| Net-New P2 | Cron Scheduler for Reports | ✅ Implemented |
| Net-New P2 | Integration Verification Test Suite | ✅ Implemented |
