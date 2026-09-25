# PHAROS Phase 2 — Complete Build Brief for Coding Agent

Paste this entire document as the task prompt. It is self-contained: every
schema, endpoint, event, and screen referenced below is specified in full so
you do not need to consult any other source document. Read it completely
before writing any code, then execute the full scope autonomously — do not
pause for confirmation between sections; only stop for a genuine blocker
(e.g. a missing credential or an unresolvable ambiguity).

---

## 0. Who you are building this for

I am a solo developer using you to build out **PHAROS Phase 2** end to end.
There is no team — every task below, regardless of which "Dev" originally
owned it in the planning docs, is mine to complete with your help in one
continuous engagement.

## 1. Project context

PHAROS (Police Hierarchical Automated Reporting & Operations System) is a
bilingual (Hindi/English) reporting platform for a police department,
organized around a hierarchy: **PS → District → JCP → SCP → HQ**. Three
master record types — **ARREST**, **PCR_CALL**, **CASE** — flow through a
submit → approve/send-back → compile → archive lifecycle as they move up
that hierarchy.

Phase 1 was a 4-day prototype sprint split across three developers: Dev 1
(Auth & Security), Dev 2 (Backend Lead — records, fields, workflow, event
bus), Dev 3 (Frontend — all screens). Phase 2 is an 8–10 week "full-feature
build" that turns the prototype into a production-ready system for one full
district (15–20 PS), adding everything Phase 1 deliberately deferred:
Keycloak/MFA, the JCP/SCP review chain, legacy data import, a full filter
engine, 10+ report proformas, advanced analytics, offline/PWA support, and a
browser-based admin console.

## 2. The foundation gap — read this before writing any code

**I only have my own Phase 1 Dev 1 output**: JWT auth, RBAC middleware, the
user model, hierarchy CRUD APIs, the audit ledger module, and the Puppeteer
report engine. **The Phase 1 Dev 2 backend (RabbitMQ event bus, Field
Registry, Records CRUD, Workflow Engine, Compilation Engine, basic Analytics,
Notifications) and the entire Phase 1 Dev 3 frontend (React app shell,
DynamicForm, every screen) were built by other people and are not in this
codebase.**

Before doing anything else:

1. **Inspect the actual repository** to confirm exactly what exists. Don't
   assume — verify against the foundation spec in §5–§7 below.
2. **Treat anything missing from that foundation spec as reconstruction
   work**, done first, because nearly everything in Phase 2 depends on it
   (filters need a Records API; legacy import needs `records` +
   `field_registry`; new screens need DynamicForm; API tests need endpoints
   to test against). Rebuild it to match the contracts specified below
   exactly (response envelope, JWT payload shape, table names, event names)
   so that if the original Dev 2/Dev 3 codebase ever resurfaces, this rebuild
   is a drop-in-compatible substitute, not a divergent fork.
3. **Keep "rebuilt foundation" and "net-new Phase 2 work" distinguishable**
   in commits and in the documentation required by §16 — label each item so
   a future integrator can tell which parts are a stand-in for someone
   else's lost work versus genuinely new capability that should be kept
   regardless of what happens to the original codebase.

## 3. Non-negotiable architecture principles

Apply these to every line of code, whether reconstructed foundation or new
Phase 2 feature:

- **Dynamic Field Registry** — every form field is a row in `field_registry`,
  never a hardcoded form field. Adding a field is an INSERT, never a
  migration or deployment.
- **Event bus isolation** — modules never call each other directly. All
  inter-module communication goes through the RabbitMQ `pharos` topic
  exchange. A new feature subscribes to existing events; it never reaches
  into another module's code.
- **Server-side RBAC** — enforced in middleware on every route. Frontend
  role checks are UX-only, never the actual security boundary.
- **Append-only audit ledger** — every record change emits an event; the
  Audit Ledger writes a revision row. Nothing in `record_revisions` is ever
  updated or deleted. Phase 2 adds SHA-256 hash-chaining on top — the chain
  must never be retrofittable, so build it as part of every revision insert
  from day one of this phase.
- **Bilingual everywhere** — every label, status, and hierarchy node carries
  both `label_en`/`name_en` and `label_hi`/`name_hi`. No UI string ships in
  English only.
- **Hierarchy and config as data** — `hierarchy_nodes`,
  `level_data_contracts`, `report_templates`, and
  `workflow_transitions_config` all live as DB rows editable from an admin
  screen, never as code.
- **JSONB record storage** — all three record types share one `records`
  table with a JSONB `data` column. New fields are Field Registry inserts,
  not ALTER TABLEs.
- **Legacy-compatible data model** — anything imported via the legacy
  importer carries `is_legacy`, `source_system`, `imported_at`, and
  `legacy_ref`, and must participate in every workflow, filter, report, and
  analytics path exactly like a native record.

The test of having done this right: a non-developer admin can add a new PS,
define 5 new fields for it, create a custom report template, and set
deadlines — entirely from the browser, with zero backend changes.

## 4. Tech stack

**Carried forward from Phase 1 (rebuild to this spec where missing):**
Express.js (JS, no TypeScript) · React + Vite + Ant Design (light theme) ·
React Query v5 · React Router v6 · PostgreSQL (Cloud) with `pg` + Knex.js ·
RabbitMQ via `amqplib` · Redis (notification counts, refresh tokens) · JWT
(`jsonwebtoken`, access 1h / refresh 7d) · Puppeteer (server-side PDF) ·
react-i18next (EN+HI) · Recharts.

**Phase 2 additions:**

| Area | Tool | Notes |
|---|---|---|
| Auth | Keycloak | OIDC + MFA via Docker. Replaces custom JWT issuance but keeps the same Bearer-token interface to every existing route — `kc.middleware()` swaps in for the old auth middleware with the same `req.user` shape, so no route changes. |
| Object storage | MinIO | S3-compatible; FIR scans, photos, generated report files. |
| Search (optional path) | Elasticsearch | Complex/full-text filter queries and analytics aggregations; PostgreSQL JSONB continues to handle simple filters. |
| Excel rendering | ExcelJS | `.xlsx` reports alongside the existing Puppeteer PDF path. |
| Offline | Workbox | Service Worker generation; cache-first for static assets, network-first for API, wraps the IndexedDB sync queue. |
| Scheduler | node-cron | Scheduled report generation, SLA/deadline alert scans. |

## 5. Data model — foundation tables to reconstruct if absent

```sql
CREATE TABLE hierarchy_nodes (id UUID PRIMARY KEY, node_type VARCHAR, name_en VARCHAR, name_hi VARCHAR, code VARCHAR UNIQUE, parent_id UUID REFERENCES hierarchy_nodes(id), is_active BOOLEAN DEFAULT true, created_at TIMESTAMPTZ DEFAULT NOW());
CREATE TABLE users (id UUID PRIMARY KEY, badge_no VARCHAR UNIQUE, name_en VARCHAR, name_hi VARCHAR, role VARCHAR, ps_id UUID REFERENCES hierarchy_nodes(id), district_id UUID REFERENCES hierarchy_nodes(id), password_hash VARCHAR, is_active BOOLEAN DEFAULT true, created_at TIMESTAMPTZ DEFAULT NOW());
CREATE TABLE field_registry (id UUID PRIMARY KEY, field_key VARCHAR UNIQUE, field_type VARCHAR, applicable_record_types VARCHAR[], label_en VARCHAR, label_hi VARCHAR, options JSONB, validation_rules JSONB, visible_to_levels VARCHAR[] DEFAULT ARRAY['PS','DISTRICT','HQ'], editable_by_levels VARCHAR[] DEFAULT ARRAY['PS'], section VARCHAR, sort_order INT DEFAULT 0, is_active BOOLEAN DEFAULT true);
CREATE TABLE records (id UUID PRIMARY KEY DEFAULT gen_random_uuid(), record_type VARCHAR, ps_id UUID REFERENCES hierarchy_nodes(id), district_id UUID REFERENCES hierarchy_nodes(id), data JSONB DEFAULT '{}', current_status VARCHAR DEFAULT 'DRAFT', current_level VARCHAR DEFAULT 'PS', version INT DEFAULT 1, created_by UUID REFERENCES users(id), created_at TIMESTAMPTZ DEFAULT NOW(), updated_at TIMESTAMPTZ DEFAULT NOW());
CREATE TABLE record_revisions (id UUID PRIMARY KEY DEFAULT gen_random_uuid(), record_id UUID REFERENCES records(id), revision_number INT, changed_by UUID REFERENCES users(id), changed_at TIMESTAMPTZ DEFAULT NOW(), level VARCHAR, change_type VARCHAR, field_changes JSONB DEFAULT '[]', comment TEXT, ip_address INET);
CREATE TABLE workflow_transitions (id UUID PRIMARY KEY DEFAULT gen_random_uuid(), record_id UUID REFERENCES records(id), from_status VARCHAR, to_status VARCHAR, action VARCHAR, performed_by UUID REFERENCES users(id), performed_at TIMESTAMPTZ DEFAULT NOW(), comment TEXT, target_fields VARCHAR[]);
CREATE TABLE compilations (id UUID PRIMARY KEY DEFAULT gen_random_uuid(), district_id UUID REFERENCES hierarchy_nodes(id), period DATE, status VARCHAR DEFAULT 'DRAFT', record_ids UUID[], compiled_summary JSONB, submitted_by UUID REFERENCES users(id), submitted_at TIMESTAMPTZ, created_at TIMESTAMPTZ DEFAULT NOW());
CREATE TABLE report_jobs (id UUID PRIMARY KEY DEFAULT gen_random_uuid(), requested_by UUID REFERENCES users(id), template_id VARCHAR, filters JSONB, format VARCHAR, status VARCHAR DEFAULT 'pending', file_path VARCHAR, created_at TIMESTAMPTZ DEFAULT NOW(), completed_at TIMESTAMPTZ);
CREATE TABLE notifications (id UUID PRIMARY KEY DEFAULT gen_random_uuid(), user_id UUID REFERENCES users(id), type VARCHAR, title VARCHAR, body TEXT, record_id UUID, is_read BOOLEAN DEFAULT false, created_at TIMESTAMPTZ DEFAULT NOW());
```

JWT/Keycloak token payload shape to preserve:
```json
{ "userId": "uuid", "badgeNo": "HC1234", "name": "Ramesh Kumar",
  "role": "HC", // HC | SHO | JCP | SCP | DISTRICT_OFFICER | HQ_ANALYST | HQ_ADMIN | SYSTEM_ADMIN
  "level": "PS", "psId": "uuid|null", "districtId": "uuid|null" }
```

Standard response envelope (every endpoint, old and new, must follow this):
```json
// Success (single):  { "status": "success", "data": {...} }
// Success (list):     { "status": "success", "data": [...], "meta": {"page":1,"limit":20,"total":100} }
// Error:              { "status": "error", "code": "UNAUTHORIZED", "message": "Invalid token" }
```

## 6. Data model — new Phase 2 tables and alterations

Run as separate, non-destructive migration files; never modify existing
tables destructively.

```sql
-- 001_p2_legacy.sql
ALTER TABLE records ADD COLUMN IF NOT EXISTS is_legacy     BOOLEAN DEFAULT false;
ALTER TABLE records ADD COLUMN IF NOT EXISTS source_system VARCHAR; -- 'EXCEL_IMPORT' | 'PAPER_SCAN' | 'LEGACY_DB'
ALTER TABLE records ADD COLUMN IF NOT EXISTS imported_at   TIMESTAMPTZ;
ALTER TABLE records ADD COLUMN IF NOT EXISTS imported_by   UUID REFERENCES users(id);
ALTER TABLE records ADD COLUMN IF NOT EXISTS legacy_ref    VARCHAR;

CREATE TABLE IF NOT EXISTS legacy_import_batches (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(), ps_id UUID NOT NULL REFERENCES hierarchy_nodes(id),
  record_type VARCHAR NOT NULL, source_file VARCHAR NOT NULL, imported_by UUID REFERENCES users(id),
  imported_at TIMESTAMPTZ DEFAULT NOW(), total_rows INT NOT NULL DEFAULT 0, imported_count INT NOT NULL DEFAULT 0,
  skipped_count INT NOT NULL DEFAULT 0, error_count INT NOT NULL DEFAULT 0, status VARCHAR NOT NULL DEFAULT 'PENDING',
  error_log JSONB NOT NULL DEFAULT '[]'
);
CREATE TABLE IF NOT EXISTS legacy_amendments (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(), record_id UUID NOT NULL REFERENCES records(id),
  requested_by UUID NOT NULL REFERENCES users(id), approved_by UUID REFERENCES users(id),
  requested_at TIMESTAMPTZ DEFAULT NOW(), approved_at TIMESTAMPTZ, status VARCHAR NOT NULL DEFAULT 'PENDING',
  field_changes JSONB NOT NULL, reason TEXT NOT NULL
);

-- 002_p2_workflow.sql
CREATE TABLE IF NOT EXISTS workflow_transitions_config (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(), record_type VARCHAR NOT NULL DEFAULT '*',
  from_status VARCHAR NOT NULL, to_status VARCHAR NOT NULL, action VARCHAR NOT NULL, -- SUBMIT|APPROVE|SEND_BACK|SEAL
  allowed_roles VARCHAR[] NOT NULL, requires_comment BOOLEAN NOT NULL DEFAULT false,
  sla_hours INT, is_active BOOLEAN NOT NULL DEFAULT true
);

-- 003_p2_filters.sql
CREATE TABLE IF NOT EXISTS filter_presets (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(), name_en VARCHAR NOT NULL, name_hi VARCHAR NOT NULL,
  scope VARCHAR NOT NULL, -- SYSTEM | ROLE | USER
  scope_id UUID, filter_spec JSONB NOT NULL,
  applicable_record_types VARCHAR[] NOT NULL DEFAULT ARRAY['ARREST','PCR_CALL','CASE'],
  created_by UUID REFERENCES users(id), is_active BOOLEAN NOT NULL DEFAULT true, created_at TIMESTAMPTZ DEFAULT NOW()
);

-- 004_p2_reports.sql
CREATE TABLE IF NOT EXISTS report_templates (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(), name_en VARCHAR NOT NULL, name_hi VARCHAR NOT NULL,
  applicable_record_types VARCHAR[] NOT NULL, applicable_levels VARCHAR[] NOT NULL DEFAULT ARRAY['PS','DISTRICT','HQ'],
  template_definition JSONB NOT NULL, output_formats VARCHAR[] NOT NULL DEFAULT ARRAY['PDF','XLSX'],
  is_active BOOLEAN NOT NULL DEFAULT true, created_by UUID REFERENCES users(id), created_at TIMESTAMPTZ DEFAULT NOW()
);
CREATE TABLE IF NOT EXISTS scheduled_reports (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(), template_id UUID NOT NULL REFERENCES report_templates(id),
  cron_expr VARCHAR NOT NULL, -- e.g. '0 6 * * *'
  filter_spec JSONB NOT NULL DEFAULT '{}', format VARCHAR NOT NULL DEFAULT 'PDF',
  scope_ps_id UUID REFERENCES hierarchy_nodes(id), scope_district_id UUID REFERENCES hierarchy_nodes(id),
  recipients UUID[] NOT NULL DEFAULT '{}', created_by UUID REFERENCES users(id), is_active BOOLEAN NOT NULL DEFAULT true,
  last_run_at TIMESTAMPTZ, last_run_status VARCHAR, created_at TIMESTAMPTZ DEFAULT NOW()
);

-- 005_p2_level_contracts.sql
CREATE TABLE IF NOT EXISTS level_data_contracts (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(), from_level VARCHAR NOT NULL, to_level VARCHAR NOT NULL,
  route VARCHAR NOT NULL DEFAULT 'OPS_CHAIN', record_type VARCHAR NOT NULL DEFAULT '*',
  visible_field_keys VARCHAR[] NOT NULL, aggregate_definitions JSONB NOT NULL DEFAULT '[]',
  is_active BOOLEAN NOT NULL DEFAULT true, updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- 006_p2_audit_hash.sql
ALTER TABLE record_revisions ADD COLUMN IF NOT EXISTS prev_hash VARCHAR(64);
ALTER TABLE record_revisions ADD COLUMN IF NOT EXISTS row_hash  VARCHAR(64);

-- 007_p2_indexes.sql
CREATE INDEX IF NOT EXISTS idx_records_is_legacy      ON records(is_legacy) WHERE is_legacy = true;
CREATE INDEX IF NOT EXISTS idx_records_current_status  ON records(current_status);
CREATE INDEX IF NOT EXISTS idx_records_ps_district     ON records(ps_id, district_id);
CREATE INDEX IF NOT EXISTS idx_records_created_at      ON records(created_at DESC);
CREATE INDEX IF NOT EXISTS idx_records_data_gin        ON records USING gin(data);
CREATE INDEX IF NOT EXISTS idx_revisions_record_id     ON record_revisions(record_id);
CREATE INDEX IF NOT EXISTS idx_notifications_user_unread ON notifications(user_id, is_read) WHERE is_read = false;
```

SHA-256 hash chain — compute on every `record_revisions` insert:
```js
const crypto = require('crypto');
function computeRowHash(revision, prevHash) {
  const content = JSON.stringify({
    record_id: revision.record_id, revision_number: revision.revision_number,
    changed_by: revision.changed_by, changed_at: revision.changed_at.toISOString(),
    field_changes: revision.field_changes, prev_hash: prevHash,
  });
  return crypto.createHash('sha256').update(content).digest('hex');
}
// Store both prev_hash and row_hash on the row.
// POST /admin/audit-verify scans the full chain and returns the first broken row, if any.
```

## 7. RBAC — 7 roles in Phase 2

Phase 1 had 5 roles; Phase 2 adds JCP and SCP as intermediate review levels
and splits HQ into ANALYST and ADMIN.

| Role | Hierarchy level | Creates records | Approves | Compiles | Admin |
|---|---|---|---|---|---|
| HC | PS level | ✓ | ✗ | ✗ | ✗ |
| SHO | PS head | ✗ | PS → District | ✗ | ✗ |
| DISTRICT_OFFICER | District | ✗ | District → next | ✓ | ✗ |
| JCP | Joint Commissioner | ✗ | JCP → SCP | ✗ | ✗ |
| SCP | Special Commissioner | ✗ | SCP → HQ | ✗ | ✗ |
| HQ_ANALYST | HQ | ✗ | View only | ✗ | ✗ |
| HQ_ADMIN | HQ | ✗ | Seal → ARCHIVED | ✗ | Partial |
| SYSTEM_ADMIN | System-wide | ✗ | ✗ | ✗ | Full |

Adding a future role (e.g. DCP) should require only: (1) Keycloak — add the
role; (2) DB — add it to `allowed_roles` on relevant
`workflow_transitions_config` rows; (3) Frontend — add nav items. No other
code changes.

## 8. Workflow — full Phase 2 state machine

```
DRAFT ──[HC submits]──────────────────────────────→ PENDING_SHO
   ↑                                                      │
   │  [HC resubmits]                          ┌──[SHO sends back]──┐
   │                                           ↓                    │
SENT_BACK_HC ←─────────────────────────────────┘          [SHO approves]
                                                                     ↓
                                                            DISTRICT_REVIEW
                                                       ┌────────────┤
                                          [District sends back]  [District approves]
                                                       ↓                ↓
                                              SENT_BACK_PS          COMPILED
                                              → PENDING_SHO             │
                                                       ┌─────────────────┤
                                          [route=OPS_CHAIN]      [route=DIRECT_HQ]
                                                       ↓                 │
                                                  JCP_REVIEW             │
                                          [JCP approves] ↓               │
                                                  SCP_REVIEW             │
                                          [SCP/HQ seals] ↓               ↓
                                                  ARCHIVED ■  ←── HQ_RECEIVED
                                            (hash-sealed, immutable)

-- New terminal/parallel states --
LEGACY_IMPORTED      (imported records — bypasses all states above)
AMENDMENT_PENDING     (legacy record with an open correction request)
```

On `SEND_BACK`, `target_fields` in `workflow_transitions` specifies exactly
which fields need correction; the frontend highlights only those fields
rather than rejecting the whole record. All transitions must be validated
by the workflow module against role permissions before being applied;
illegal transitions return 403 and are logged in the audit ledger.

Valid transitions live entirely in `workflow_transitions_config` (§6) — to
add the JCP/SCP levels, **seed rows into that table**, don't hardcode
if/else branches.

SLA/deadline cron (every 30 minutes):
```sql
SELECT r.id, r.current_status, r.ps_id, wt.sla_hours,
       r.updated_at + (wt.sla_hours || ' hours')::INTERVAL AS deadline
FROM records r
JOIN workflow_transitions_config wt ON wt.from_status = r.current_status
WHERE wt.sla_hours IS NOT NULL
  AND r.current_status NOT IN ('ARCHIVED','LEGACY_IMPORTED')
  AND r.updated_at + (wt.sla_hours || ' hours')::INTERVAL < NOW() + INTERVAL '2 hours';
-- Publishes: deadline.approaching event → Notifications module
```

## 9. Event bus — complete reference

**Exchange:** `pharos` (topic). All inter-module communication goes through
this exchange — no direct calls between modules, ever.

Foundation events (Phase 1, reconstruct if absent):

| Routing key | Publisher | Subscribers | Payload |
|---|---|---|---|
| `record.created` | Records module | Audit Ledger | `{recordId, record_type, psId, created_by, data}` |
| `record.updated` | Records module | Audit Ledger | `{recordId, changed_by, field_changes:[{key,old,new}], level}` |
| `record.status_changed` | Workflow Engine | Audit Ledger, Notifications | `{recordId, action, from_status, to_status, performed_by, target_psId, comment}` |
| `compilation.submitted` | Compilation module | Notifications | `{compilationId, districtId, period, submitted_by}` |

New Phase 2 events:

| Routing key | Publisher | Subscribers | Payload |
|---|---|---|---|
| `record.jcp_approved` | Workflow Engine | Audit Ledger, Notifications | `{recordId, jcp_user_id, to_status:'SCP_REVIEW', timestamp}` |
| `record.sealed` | Workflow Engine | Audit Ledger, Reports (auto PDF) | `{recordId, sealed_by, final_hash, archive_date}` |
| `deadline.approaching` | SLA cron job | Notifications, Admin alert | `{recordId, current_status, deadline_at, assigned_user_id, ps_id}` |
| `deadline.breached` | SLA cron job | Notifications, Analytics, Supervisor alert | `{recordId, current_status, sla_hours_exceeded, ps_id, district_id}` |
| `legacy.batch_imported` | Legacy Import service | Audit Ledger, Analytics (reindex) | `{batch_id, ps_id, record_type, imported_count, imported_by}` |
| `report.generated` | Report Engine | Notifications (download ready) | `{job_id, template_id, requested_by, file_path, format, file_size_bytes}` |
| `audit.chain_break_detected` | Audit verify job | CRITICAL alert to SYSTEM_ADMIN | `{broken_revision_id, record_id, detected_at, scanner_user_id}` |
| `admin.config_changed` | Admin Config module | Audit Ledger, Cache invalidation | `{entity_type, entity_id, action, changed_by, changes}` |
| `sync.conflict_detected` | Sync service | Notifications (user alert), Audit Ledger | `{record_id, local_version, server_version, conflict_rule, user_id}` |
| `compilation.deadline_warning` | Compilation cron | Notifications (DISTRICT_OFFICER) | `{district_id, period, due_date, pending_ps_count, total_ps_count}` |

## 10. API reference — foundation to reconstruct (Phase 1 contract)

Every endpoint below must follow the response envelope in §5. RBAC notation:
"Any" = any authenticated user; "Scoped" = filtered by the caller's
PS/district.

**Auth & users**

| Method | Endpoint | Description | RBAC |
|---|---|---|---|
| POST | /auth/login | badgeNo+password → access_token, refresh_token, user | Public |
| POST | /auth/refresh | refresh_token → new access_token | Public |
| POST | /auth/logout | Invalidate refresh token in Redis | Any |
| GET | /auth/me | Current user + role + hierarchy info | Any |
| PUT | /auth/change-password | oldPassword, newPassword | Any |
| GET | /users | List. Query: role, psId, districtId, page, limit | DISTRICT+ |
| POST | /users | Create: badgeNo, name_en, name_hi, role, psId, password | SYSTEM_ADMIN |
| GET | /users/:id | Single user | DISTRICT+ |
| PUT | /users/:id | Update name/role/psId | SYSTEM_ADMIN |
| DELETE | /users/:id | Soft delete | SYSTEM_ADMIN |
| POST | /users/:id/reset-password | Admin resets user password | SYSTEM_ADMIN |

**Hierarchy & audit**

| Method | Endpoint | Description | RBAC |
|---|---|---|---|
| GET | /hierarchy/tree | Full HQ→District→PS tree | Any |
| GET | /hierarchy/nodes | Query: type=PS\|DISTRICT\|HQ | Any |
| POST | /hierarchy/nodes | Create node | SYSTEM_ADMIN |
| PUT | /hierarchy/nodes/:id | Update node | SYSTEM_ADMIN |
| DELETE | /hierarchy/nodes/:id | Soft delete | SYSTEM_ADMIN |
| GET | /audit/record/:id | All revisions for a record | Any |
| GET | /audit/user/:id | All actions by a user. Query: from, to, page | DISTRICT+ |

**Field registry, records, workflow, compilation**

| Method | Endpoint | Description | RBAC |
|---|---|---|---|
| GET | /fields | Query: record_type, is_active | Any |
| GET | /fields/form/:record_type | Fields grouped by section for form render | Any |
| POST | /fields | Create field definition | SYSTEM_ADMIN |
| PUT | /fields/:id | Update field definition | SYSTEM_ADMIN |
| PATCH | /fields/:id/status | Toggle is_active | SYSTEM_ADMIN |
| GET | /records | List. Query: type, status, psId, districtId, from, to, page, limit | Scoped |
| POST | /records | Create: {record_type, data:{...}} | HC |
| GET | /records/:id | Single record with full data | Scoped |
| PUT | /records/:id | Update data (DRAFT only) | HC (own) |
| DELETE | /records/:id | Delete (DRAFT only) | HC (own) |
| GET | /records/:id/revisions | Field-level audit trail | Any |
| GET | /records/:id/history | Workflow transition history | Any |
| POST | /records/:id/submit | HC → SHO | HC (own) |
| POST | /records/:id/approve | SHO or District approves | SHO, DISTRICT |
| POST | /records/:id/send-back | Body: {comment, target_fields:[]} | SHO, DISTRICT |
| GET | /workflow/queue | Pending items for caller's level. Query: type, page | SHO+ |
| GET | /workflow/queue/count | Pending count (badge) | SHO+ |
| GET | /compilations | Query: districtId, period, status | DISTRICT+ |
| POST | /compilations | Create: {period, district_id} | DISTRICT_OFFICER |
| GET | /compilations/:id | Single compilation + records | DISTRICT+ |
| POST | /compilations/:id/submit | Submit to HQ | DISTRICT_OFFICER |

**Analytics, reports, notifications**

| Method | Endpoint | Description | RBAC |
|---|---|---|---|
| GET | /analytics/overview | Count cards. Query: from, to, psId?, districtId? | Any |
| GET | /analytics/by-crime-head | Crime head breakdown | Any |
| GET | /analytics/by-ps | Per-PS breakdown. Query: districtId, from, to | DISTRICT+ |
| GET | /analytics/trends | Time series. Query: metric, period, from, to | Any |
| GET | /analytics/status-breakdown | Records by status | Any |
| GET | /reports/templates | List report types | Any |
| POST | /reports/generate | {template_id, filters, format, from, to} → job_id | Any |
| GET | /reports/status/:jobId | pending\|ready\|failed | Any |
| GET | /reports/download/:jobId | Stream PDF/CSV | Any |
| GET | /reports/history | Past reports for current user | Any |
| GET | /notifications | Query: read?, page, limit | Any |
| GET | /notifications/count | Unread count | Any |
| PATCH | /notifications/:id/read | Mark one read | Any |
| PATCH | /notifications/read-all | Mark all read | Any |
| GET | /admin/stats | Total users, PS count, records today, system status | HQ_ADMIN+ |

## 11. API reference — new Phase 2 endpoints

**Auth & security**

| Method | Endpoint | Description | RBAC |
|---|---|---|---|
| POST | /auth/mfa/enroll | Generate TOTP QR code for user | SHO+ |
| POST | /auth/mfa/verify | Verify TOTP code during login | Any |
| POST | /auth/mfa/disable | Admin disables MFA for a user (lost device) | SYSTEM_ADMIN |
| GET | /audit/chain-verify | Verify hash chain integrity → {valid, broken_at?} | SYSTEM_ADMIN |
| GET | /audit/system | System-level audit log (admin actions, config changes) | SYSTEM_ADMIN |
| GET | /admin/system-health | Queue depths, Redis stats, DB pool, cron status | HQ_ADMIN+ |
| GET | /admin/audit-log | Full audit log. Query: user_id, action, module, from, to, page | SYSTEM_ADMIN |
| POST | /admin/audit-verify | Run hash chain verification → {valid, first_broken_at?} | SYSTEM_ADMIN |

**Records, workflow, attachments**

| Method | Endpoint | Description | RBAC |
|---|---|---|---|
| GET | /records/check-duplicate | Query: record_type, fir_number?, accused_name?, date? → {isDuplicate, existingId?} | HC+ |
| POST | /records/:id/attachments | Upload file to MinIO → {attachment_id, url, size} | HC (own) |
| GET | /records/:id/attachments | List attachments | Scoped |
| DELETE | /records/:id/attachments/:aid | Delete attachment (DRAFT only) | HC (own) |
| POST | /records/:id/jcp-approve | JCP approves → SCP_REVIEW | JCP |
| POST | /records/:id/scp-approve | SCP approves → HQ_RECEIVED | SCP |
| POST | /records/:id/seal | HQ seals → ARCHIVED. Body: {seal_note} | HQ_ADMIN |
| GET | /workflow/sla-breaches | Records past SLA. Query: ps_id, district_id, from, to | SHO+ |
| GET | /workflow/sla-approaching | Records within 2h of deadline | Any |
| GET | /workflow/transitions-config | List configured transitions | SYSTEM_ADMIN |
| POST | /workflow/transitions-config | Add transition: {record_type, from_status, to_status, action, allowed_roles[], requires_comment, sla_hours} | SYSTEM_ADMIN |
| PATCH | /workflow/transitions-config/:id/status | Enable/disable a transition | SYSTEM_ADMIN |

**Legacy import**

| Method | Endpoint | Description | RBAC |
|---|---|---|---|
| POST | /legacy/import | Multipart: file, record_type, ps_id, dry_run | DISTRICT_OFFICER+ |
| GET | /legacy/batches | List batches. Query: ps_id, status, from, to, page | DISTRICT_OFFICER+ |
| GET | /legacy/batches/:id | Single batch with error log | DISTRICT_OFFICER+ |
| GET | /legacy/batches/:id/errors | Error log as CSV for re-upload | DISTRICT_OFFICER+ |
| GET | /legacy/column-map/:record_type | Default column→field mapping template | DISTRICT_OFFICER+ |
| POST | /legacy/amendments | Request a correction to an imported record | SHO+ |
| POST | /legacy/amendments/:id/approve | Approve amendment (applies field_changes) | DISTRICT_OFFICER+ |
| POST | /legacy/amendments/:id/reject | Reject with reason | DISTRICT_OFFICER+ |
| GET | /legacy/amendments | List. Query: status, ps_id, record_id, page | SHO+ |

**Filters & presets**

| Method | Endpoint | Description | RBAC |
|---|---|---|---|
| POST | /filters/apply | {record_type, filter_spec, page, limit} → filtered records | Scoped |
| POST | /filters/count | Same as /apply, count only (results preview) | Scoped |
| GET | /filters/presets | Query: scope, record_type | Any |
| POST | /filters/presets | Save preset: {name_en, name_hi, filter_spec, scope, record_types[]} | Any |
| PUT | /filters/presets/:id | Update preset | Owner / SYSTEM_ADMIN |
| DELETE | /filters/presets/:id | Delete preset | Owner / SYSTEM_ADMIN |
| GET | /filters/field-options/:field_key | Distinct values for a field (dropdown). Query: record_type, ps_id? | Scoped |

**Reports**

| Method | Endpoint | Description | RBAC |
|---|---|---|---|
| GET | /reports/templates | List active templates with applicable levels + formats | Any |
| POST | /reports/generate | {template_id, filter_spec, format(pdf\|xlsx\|csv), from, to, ps_id?} | Any |
| GET | /reports/status/:jobId | pending\|rendering\|ready\|failed | Owner |
| GET | /reports/download/:jobId | Signed MinIO URL stream | Owner |
| GET | /reports/history | Query: page, limit | Any |
| GET | /reports/scheduled | List schedules | DISTRICT_OFFICER+ |
| POST | /reports/scheduled | {template_id, cron, filter_spec, recipients[], format} | DISTRICT_OFFICER+ |
| DELETE | /reports/scheduled/:id | Cancel schedule | Owner / SYSTEM_ADMIN |
| POST | /reports/templates | Create new proforma (no deployment needed) | SYSTEM_ADMIN |
| PUT | /reports/templates/:id | Update template definition | SYSTEM_ADMIN |

**Advanced analytics**

| Method | Endpoint | Description | RBAC |
|---|---|---|---|
| GET | /analytics/beat-wise | Crime counts by beat. Query: ps_id, from, to, record_type | SHO+ |
| GET | /analytics/io-performance | IO stats: avg close time, pending count, conviction rate | SHO+ |
| GET | /analytics/district-comparison | Side-by-side district metrics. Query: from, to, metric[] | HQ_ADMIN+ |
| GET | /analytics/heatmap | Beat × hour-of-day frequency grid | SHO+ |
| GET | /analytics/submission-health | On-time %, avg approve time, SLA breach rate per PS | DISTRICT+ |
| GET | /analytics/legacy-coverage | Legacy vs native counts, import quality score | DISTRICT+ |

**Sync & admin config**

| Method | Endpoint | Description | RBAC |
|---|---|---|---|
| POST | /sync/replay | Replay queued ops in order → per-op status | Any |
| GET | /sync/pull | Pull records updated after ?since= for caller's PS | Any |
| GET | /level-contracts | List level data contracts | SYSTEM_ADMIN |
| POST | /level-contracts | {from_level, to_level, record_type, visible_field_keys[], aggregate_definitions[]} | SYSTEM_ADMIN |
| PUT | /level-contracts/:id | Update visible fields | SYSTEM_ADMIN |

## 12. Filter engine

Filter specs are an AND/OR condition tree, parsed into PostgreSQL JSONB
queries (simple) or Elasticsearch DSL (complex/full-text):

```json
{ "logic": "AND", "conditions": [
    { "field": "crime_head", "operator": "IN", "value": ["Robbery","Theft"] },
    { "field": "beat_no", "operator": "EQ", "value": "14" },
    { "logic": "OR", "conditions": [
        { "field": "date_of_arrest", "operator": "BETWEEN", "value": ["2024-01-01","2024-01-31"] },
        { "field": "status", "operator": "EQ", "value": "UNDER_INVESTIGATION" }
    ]}
]}
```

| Field type | Operators |
|---|---|
| TEXT | eq, not_eq, contains, starts_with, ends_with, is_empty, is_not_empty |
| NUMBER | eq, not_eq, gt, gte, lt, lte, between |
| DATE/DATETIME | eq, before, after, between, last_n_days, this_week, this_month, this_year |
| SELECT | in, not_in, is_empty |
| MULTISELECT | contains_any, contains_all, is_empty |
| BOOLEAN | is_true, is_false |
| FILE | has_attachment, no_attachment |

Fields prefixed with `_` (e.g. `_status`, `_sla_breached`, `_is_legacy`) are
virtual fields resolved at query time, not registry fields — the parser
must distinguish them automatically; adding a new virtual field is one
resolver function, no schema change.

Ship these system presets on first boot:

```js
const SYSTEM_PRESETS = [
  { name_en: "Today's FIRs", filter_spec: { logic:'AND', conditions:[{field:'created_at',operator:'last_n_days',value:1}] } },
  { name_en: "Pending SHO approval", filter_spec: { logic:'AND', conditions:[{field:'_status',operator:'eq',value:'PENDING_SHO'}] } },
  { name_en: "Cases under S.302", filter_spec: { logic:'AND', conditions:[{field:'ipc_section',operator:'contains',value:'302'}] } },
  { name_en: "PCR no action taken", filter_spec: { logic:'AND', conditions:[{field:'action_taken',operator:'eq',value:'NONE'}] } },
  { name_en: "Arrests this month", filter_spec: { logic:'AND', conditions:[{field:'date_of_arrest',operator:'this_month'}] } },
  { name_en: "SLA breached", filter_spec: { logic:'AND', conditions:[{field:'_sla_breached',operator:'is_true'}] } },
  { name_en: "Sent back to me", filter_spec: { logic:'AND', conditions:[{field:'_status',operator:'eq',value:'SENT_BACK_HC'}] } },
  { name_en: "Legacy imports", filter_spec: { logic:'AND', conditions:[{field:'_is_legacy',operator:'is_true'}] } },
];
```

## 13. Report engine — 10 proformas + scheduling

| # | Template | Record type | Output | Schedule |
|---|---|---|---|---|
| 1 | Arrest Register (daily) | ARREST | PDF + XLSX | Daily 06:00 |
| 2 | PCR Call Log | PCR_CALL | PDF + XLSX | Daily 06:00 |
| 3 | Cases Register | CASE | PDF + XLSX | Weekly Mon |
| 4 | PS Daily Status Report | ALL | PDF | Daily 07:00 |
| 5 | District Compilation Summary | ALL | PDF + XLSX | Monthly 1st |
| 6 | Crime Head Analysis | ARREST + CASE | PDF + XLSX | Monthly 1st |
| 7 | IO Performance Report | ALL | PDF | Monthly 1st |
| 8 | Beat-wise Crime Summary | ARREST | PDF + XLSX | Weekly Mon |
| 9 | Pending Approvals Report | ALL | PDF | Daily 06:00 |
| 10 | HQ District Digest | ALL | PDF | Weekly Mon |

Each `report_templates.template_definition` JSONB governs layout, header,
footer, sections (field selections per section with `column_span`), and
`computed_fields` (e.g. `COUNT(record_type='ARREST')`,
`GROUP_COUNT(crime_head)`). Creating a new proforma is `POST
/reports/templates` from the admin UI — zero deployment.

## 14. Legacy data import — the most complex new feature

Legacy paper registers, digitized into Excel/CSV, must be imported as
first-class records with full audit provenance, without ever being
re-typed by field officers.

**Critical constraint:** legacy records are immutable once imported. They
get status `LEGACY_IMPORTED` (not DRAFT), are visible in every analytics,
filter, and report path, and cannot enter the normal workflow — corrections
go through the `legacy_amendments` sub-workflow instead.

Pipeline (`POST /legacy/import`, multipart: file, record_type, ps_id,
dry_run):

1. **Parse** — ExcelJS reads the file into a raw row array.
2. **Map columns** — apply a column→field_key mapping (UI-defined or the
   default from `/legacy/column-map/:record_type`).
3. **Validate** — required fields, date formats, enum values, phone formats.
4. **Dedup** — check `fir_number` OR (`accused_name` + `date_of_arrest`)
   against existing records.
5. **Dry run** — if `dry_run=true`, return `{valid, errors, duplicates}` with
   no write.
6. **Insert** — bulk insert into `records` with `is_legacy=true`,
   `status='LEGACY_IMPORTED'`.
7. **Audit** — publish `legacy.batch_imported` → Audit Ledger writes a
   provenance row.
8. **Response** — `{imported: N, skipped: N, errors: [{row, reason}]}`.

Use the new tables and ALTERs from §6 for batch tracking and amendments.

## 15. Offline sync (PWA)

PS connectivity is unreliable; core data entry must work offline.

| Works offline | Requires connectivity |
|---|---|
| Create/edit DRAFT records | Submit (state machine transition) |
| View locally cached PS records | Receive send-backs from SHO |
| View cached filter presets | Cross-PS/district queries |
| Search cached records locally | Analytics dashboards |
| View cached field registry | Report generation |
| View cached user/PS profile | Admin config changes |
| Draft auto-save (IndexedDB only) | Legacy import |
| | Notifications from other users |

IndexedDB `sync_ops` store schema:
```js
{ id: "uuid-local", created_at: 1718000000000, // UNIX ms, strict ordering on replay
  method: "POST", endpoint: "/records", body: { record_type:"ARREST", data:{...} },
  status: "QUEUED", // QUEUED | REPLAYING | DONE | CONFLICT
  retry_count: 0, last_error: null }
```

Conflict rules: DRAFT records use last-write-wins (local beats server only
if server version hasn't advanced); records at PENDING_SHO or above are
server-authoritative — local edits are silently discarded and the user is
notified ("Record has advanced — your local changes were not applied"). On
reconnect, replay `sync_ops` in `created_at` ascending order via `POST
/sync/replay`; stop on first CONFLICT and surface it to the user.

## 16. Admin config UI — browser-based management

Every config that currently needs a DB script must become a browser screen:

- **Hierarchy manager** — tree view, add/rename/reparent (drag-and-drop),
  active/inactive toggle, effective immediately for new records.
- **User management** — full CRUD, role assignment, PS assignment, bulk CSV
  import, password reset.
- **Field registry editor** — add/edit/disable fields per record type,
  section reordering, EN/HI label editing, validation rules UI, toggle
  `visible_to_levels`.
- **Level data contracts** — per-level field visibility matrix, effective on
  next compilation.
- **Report template editor** — JSON editor + preview, assign applicable
  levels/record types/output formats.
- **Workflow config** — view/edit valid transitions, add new levels,
  configure SLA hours per step, enable/disable transitions.
- **System health** — total users, PS count, records today, RabbitMQ queue
  depth, Redis memory, pending report jobs, last cron run timestamps.
- **Audit log viewer** — filter by user/action/date/module, hash chain
  verification tool (highlights broken links), export as PDF.

## 17. MFA + Keycloak migration

```yaml
# docker-compose.yml addition
keycloak:
  image: quay.io/keycloak/keycloak:24.0
  command: start-dev
  environment:
    KC_DB: postgres
    KC_DB_URL: jdbc:postgresql://postgres:5432/keycloak
    KC_DB_USERNAME: ${PG_USER}
    KC_DB_PASSWORD: ${PG_PASSWORD}
    KEYCLOAK_ADMIN: admin
    KEYCLOAK_ADMIN_PASSWORD: ${KC_ADMIN_PASSWORD}
  ports: ["8080:8080"]
  depends_on: [postgres]
# Realm: pharos | client: pharos-api | flows: browser + OTP (TOTP, mandatory for SHO+)
# Roles: HC, SHO, JCP, SCP, DISTRICT_OFFICER, HQ_ADMIN, HQ_ANALYST, SYSTEM_ADMIN
```

```js
// src/middleware/auth.js — BEFORE: custom JWT verify. AFTER: Keycloak verify, same interface.
const { Keycloak } = require('keycloak-connect');
const kc = new Keycloak({}, { realm:'pharos', 'auth-server-url': process.env.KEYCLOAK_URL,
  resource:'pharos-api', 'bearer-only': true });
// kc.middleware() replaces the existing auth middleware with the same req.user shape —
// every existing RBAC guard continues to work unmodified.
```

Additional security features to implement: TOTP MFA enforced for SHO and
above via the Keycloak OTP flow; IP allowlist middleware rejecting any
request outside the intranet CIDR (Nginx first, Express fallback); session
fixation protection (Keycloak default — rotate token on privilege
escalation); CSRF double-submit cookie pattern on state-changing requests;
per-role rate limits (HC 200/min, SHO 150/min, HQ 300/min, ADMIN 50/min);
failed-login lockout (5 attempts → 30 min, via Keycloak brute-force
protection); every admin write publishes `admin.config_changed`.

## 18. Frontend foundation to reconstruct if absent

If the React app doesn't exist yet, scaffold it with Vite + Ant Design +
React Query + react-i18next + Recharts, following this structure:

```
src/
  api/            one file per domain — auth.js, fields.js, records.js, workflow.js,
                  analytics.js, reports.js, hierarchy.js, admin.js, notifications.js
  components/
    common/       Layout.jsx, Sidebar.jsx (role-aware nav), Header.jsx,
                  ProtectedRoute.jsx, NotificationBell.jsx, LanguageToggle.jsx
    forms/        DynamicForm.jsx  ← the core component
    charts/       CountCard.jsx, TrendsChart.jsx, BreakdownChart.jsx
  contexts/       AuthContext.jsx
  hooks/          useAuth.js
  i18n/           index.js, en.json, hi.json
  pages/
    Login.jsx
    hc/   NewRecord.jsx  MyRecords.jsx
    sho/  Queue.jsx      RecordDetail.jsx
    district/  Dashboard.jsx  CompilationUI.jsx
    hq/   Dashboard.jsx
    analytics/  AnalyticsDashboard.jsx
    reports/    ReportBuilder.jsx  ReportHistory.jsx
    admin/  Users.jsx  HierarchyManager.jsx  FieldManager.jsx
  utils/  api.js (axios + JWT interceptor with auto-refresh), constants.js
```

`DynamicForm` reads `GET /fields/form/:record_type`, maps each field's
`field_type` (TEXT, NUMBER, DATE, DATETIME, BOOLEAN, PHONE, TEXTAREA, FILE,
SELECT, MULTISELECT) to the matching Ant Design input, renders bilingual
section headers and field labels based on the active `i18n.language`, and
exposes `onSaveDraft`/`onSubmit` callbacks. This is the single most
important component — every master form and the read-only audit view all
render through it.

**Phase 2 frontend enhancements to DynamicForm:**

- Send-back highlighting — accept `highlightedFields: string[]`; amber
  border + comment banner on those fields.
- FILE field type — call `/records/:id/attachments`; upload progress, image
  preview, delete.
- Auto-save debounce — 800ms on `onValuesChange` before calling
  `onSaveDraft`.
- Read-only diff mode — prop `showDiff: {old, new}` renders color-coded
  old/new values per field for the audit viewer.
- Level-filtered fields — accept `visibleFields: string[]` from the Level
  Data Contract; hide non-visible fields for that role's level.
- Legacy badge — if `record.is_legacy`, show an "Imported record" banner;
  lock relevant fields.
- Duplicate warning — on `accused_name`/`fir_number` change, call `GET
  /records/check-duplicate`; show an inline warning.
- Deadline countdown — urgency badge when a record is approaching its SLA
  deadline.

**New screens/components for Phase 2:**

MFA screen (TOTP entry, auto-advance, resend) · Legacy import UI
(drag-and-drop upload, mapping wizard, preview table, error report) ·
File upload component (MinIO, progress bar, thumbnail, delete) · Advanced
filter bar (chip UI, preset picker, save-as-preset) · Report template
picker (card grid of 10+ proformas, configure + generate, progress tracker)
· Scheduled reports screen (list, create schedule, last-run status) ·
Analytics dashboard v2 (crime-head stacked bar, PS-vs-PS grouped bar,
beat-wise heat table, IO performance scatter, date range picker) · PWA shell
(Service Worker registration, offline banner, sync queue status, install
prompt) · Notification center (grouped by type, mark-all-read, deadline
countdown, deep-link to record) · Admin config screens (per §16) · Audit
trail viewer (timeline of field-level diffs, color-coded old/new, badge of
who/what/level/when).

## 19. Required deliverable: a living parallel development log

Maintain `/docs/PHASE2_DEVELOPMENT_LOG.md`, committed to the repo and
updated after every meaningful work session — not written once at the end.
This is a required deliverable, not optional context, and exists to make
future integration (with the original Dev 2/Dev 3 codebase, or with another
developer joining later) possible without re-deriving what happened. It
must contain:

- **What's being built and why** — a running narrative per feature/module,
  the approach taken, and any assumptions made, especially anywhere a
  missing Phase 1 module had to be reconstructed rather than extended. Note
  any deviation from the specs in this document and why.
- **Integration notes** — anything a future integrator would need to
  reconcile: table/column names actually used if they diverged, event
  payload shapes if changed, which endpoints are stubs versus fully
  implemented, and anywhere this rebuild's behavior might differ from what
  the original Dev 2/Dev 3 implementation would have produced.
- **API and event bus reference** — kept current as the living source of
  truth for what actually exists in the repo (§9–§11 above are the target
  spec; this section of the log tracks the real, current state against it).
- **A feature checklist** with status tags — ✅ Implemented, 🔄 In progress,
  ⬜ Not started — covering every item in §20 below. Update it every
  session; it must always reflect true current state, not a plan.

This document should be readable on its own as a handoff: someone with zero
prior context should understand what exists, what's half-built, what's
missing, and what to watch for when merging this work with anyone else's.

## 20. Checklist seed — populate and maintain this in the log

**Foundation to reconstruct (Phase 1 Dev 2/Dev 3 scope):** RabbitMQ event
bus singleton · Field Registry API + seed data (3 record types) · Records
CRUD with JSONB storage · Workflow state machine (submit/approve/send-back)
· Compilation engine · Basic Analytics endpoints (5) · Notifications API ·
base React app shell (layout, AuthContext, routing, i18n) · DynamicForm
component · core role screens (HC entry, SHO queue, District dashboard, HQ
dashboard).

**Net-new Phase 2 — Security & hierarchy:** Keycloak/OIDC migration · MFA
enrollment/verify/disable · IP allowlist middleware · session fixation
protection · CSRF protection · per-role rate limiting · SHA-256 audit hash
chain + verify endpoint · JCP/SCP roles and workflow states · 7-role RBAC
matrix.

**Net-new Phase 2 — Data depth:** legacy import pipeline (parse, map,
validate, dedup, dry-run, insert, audit) · legacy amendment sub-workflow ·
MinIO file attachments · duplicate FIR/accused detection · deadline/SLA cron
+ alerts · `workflow_transitions_config` + JCP/SCP transitions · Level Data
Contracts.

**Net-new Phase 2 — Discovery & reporting:** filter engine (AND/OR parser,
all operator sets) · 8 system filter presets · saved preset CRUD (SYSTEM/
ROLE/USER scope) · 10 proforma report templates (PDF + XLSX) · scheduled
report jobs (node-cron) · advanced analytics (beat-wise, IO performance,
district comparison, heatmap, submission health, legacy coverage).

**Net-new Phase 2 — Resilience & UI:** offline sync (IndexedDB `sync_ops` +
replay + conflict resolution) · PWA shell (Workbox, manifest, install
prompt) · admin config UI (hierarchy, users, fields, level contracts,
templates, workflow config, system health, audit log viewer) · notification
center · audit trail viewer · all DynamicForm Phase 2 enhancements (§18).

**Testing (continuous, not a final pass):** RBAC/auth guard matrix across
all 7 roles × every sensitive endpoint · full workflow lifecycle test
(HC→SHO→District→JCP→SCP→HQ, including send-back and resubmit) · scope
isolation tests (PS-vs-PS, district-vs-district) · filter engine operator
coverage · report generation (PDF + XLSX) end to end · analytics aggregation
correctness · legacy import dry-run/insert/dedup edge cases · offline sync
replay ordering and conflict resolution.

## 21. Testing approach

Every endpoint, old and new, needs: happy path (valid input/role → correct
2xx shape) · auth guard (no/expired token → 401) · RBAC guard (wrong role →
403) · scope guard (right role, wrong PS/district → 403 or empty set) ·
validation errors (missing required field → 400) · not found (bad ID → 404)
· state violation (e.g. approving a DRAFT → 422) · pagination correctness.
Write the RBAC matrix as one parametrized test per `[endpoint, method,
role, expectedStatus]` row — this single test catches the majority of
security bugs. Write the workflow lifecycle as a sequential test suite
where each step depends on the previous record state, including negative
cases (wrong PS submitting, wrong-PS SHO viewing).

## 22. Definition of done

A feature is only checked ✅ in the log when: its endpoint(s) follow the
standard response envelope and are RBAC-guarded server-side; relevant events
are published to the bus where the architecture calls for it; bilingual
labels are present where applicable; at least a happy-path test and one
guard/edge-case test exist; and the development log has been updated with
what was built, any deviations from this brief, and any integration
caveats.

## 23. How to proceed

Work through §5–§18 in the dependency order implied by their numbering
(foundation before features that depend on it: event bus and Records API
before filters; Field Registry before legacy import; DynamicForm before new
screens that extend it). Do not stop between sections to ask for permission
— proceed continuously, updating the development log and checklist as you
go, and only surface a question if you hit a genuine blocker (missing
credential, contradictory requirement, or a decision with real architectural
consequences that this brief doesn't resolve).
