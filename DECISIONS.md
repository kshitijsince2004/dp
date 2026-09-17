# Architectural Decisions & Technical Memory (DECISIONS.md)

## Instructions for Future AI Agents
- **Read `DECISIONS.md`** before making meaningful architectural changes.
- **Read relevant `FLOW.md` sections** before modifying important execution paths.
- **Verify documentation against actual source code**: Source code is the primary source of truth. Existing documentation is evidence, not authority.
- **Do not assume documentation is correct**: Always verify against the current implementation.
- **Update `DECISIONS.md`** when a meaningful architectural decision changes.
- **Update `FLOW.md`** when an important execution path changes.
- **Never invent historical reasoning**: If historical intent is unestablished, explicitly state `"Unknown"`. If intent is derived from implementation patterns, explicitly label it `"Inferred"`.
- **Preserve existing architectural constraints** unless explicitly instructed to change them.
- **Do not modify unrelated architecture** merely because a different design seems cleaner.
- **Maintain the developer's mental model as a first-class concern**.

---

## Baseline Note
Established baseline from current codebase state (September 2026). This document records architectural decisions based on empirical inspection of the codebase.

---

## Architectural Decisions

## 1. Full-Stack Node.js/Express Backend & React/Vite Frontend Architecture

### Decision
The system is constructed as a decoupled full-stack JavaScript application with a Node.js/Express backend running in ES Module mode (`"type": "module"`) and a React 19 frontend built with Vite, TailwindCSS v4, Zustand, and TanStack React Query.

### Context
The application serves as the PHAROS Delhi Police reporting and analytics prototype, requiring real-time dashboard analytics, complex dynamic multi-tab forms, multi-level hierarchy access, and automated diary compilation.

### Why
- **Inferred**: Unified JavaScript/ESM ecosystem across frontend and backend simplifies schema sharing, logging structures, and validation contracts.
- **Confirmed**: Vite provides sub-second HMR and fast bundle compilation for a large component tree (over 4,000 modules transformed).

### Alternatives
- Monolithic server-side rendered application (Next.js / EJS).
- Python-only backend framework (FastAPI / Django).

### Tradeoffs
- **Benefits**: High interactivity, decoupled API design, client-side caching via React Query.
- **Limitations**: Requires dual server execution (`concurrently` running backend on port 5000 and frontend on port 5173/3000).

### Relevant Code
- [`package.json`](file:///d:/DPI/FIR/pharos-prototype/package.json)
- [`backend/package.json`](file:///d:/DPI/FIR/pharos-prototype/backend/package.json)
- [`frontend/package.json`](file:///d:/DPI/FIR/pharos-prototype/frontend/package.json)
- [`backend/index.js`](file:///d:/DPI/FIR/pharos-prototype/backend/index.js)
- [`frontend/src/App.jsx`](file:///d:/DPI/FIR/pharos-prototype/frontend/src/App.jsx)

### Confidence
- **Current Implementation**: Confirmed
- **Historical Reasoning**: Inferred

### Constraints
- Do not introduce CommonJS (`require()`) syntax into backend ESM codebase.
- Maintain CORS configuration in [`backend/src/app.js`](file:///d:/DPI/FIR/pharos-prototype/backend/src/app.js) supporting development origin pattern matching.

---

## 2. Relational Database with Knex.js Query Builder & Migrations

### Decision
The primary datastore is PostgreSQL, accessed via Knex.js (`client: 'pg'`). Schema migrations and seed scripts are managed using Knex CLI (`knex migrate:latest`, `knex seed:run`).

### Context
The application handles structured police records across multiple entities: FIR Cases, Arrests, PCR Calls, Missing Persons, Unidentified Dead Bodies (UIDB), Kalandra, and Left Out Accused.

### Why
- **Confirmed**: PostgreSQL provides relational integrity, JSONB document querying capabilities, transactional safety, and date parsing customization (`pg.types.setTypeParser(1082)` to prevent UTC timezone shifts on DATE fields).

### Alternatives
- ORM abstractions (Prisma, Sequelize, TypeORM).
- NoSQL databases (MongoDB).

### Tradeoffs
- **Benefits**: Explicit SQL query control, migration versioning in [`backend/migrations/`](file:///d:/DPI/FIR/pharos-prototype/backend/migrations), high-performance transactions.
- **Limitations**: Manual query building required for complex joins and aggregation logic.

### Relevant Code
- [`backend/knexfile.js`](file:///d:/DPI/FIR/pharos-prototype/backend/knexfile.js)
- [`backend/src/config/db.js`](file:///d:/DPI/FIR/pharos-prototype/backend/src/config/db.js)
- [`backend/migrations/`](file:///d:/DPI/FIR/pharos-prototype/backend/migrations)

### Confidence
- **Current Implementation**: Confirmed
- **Historical Reasoning**: Confirmed

### Constraints
- Database connections must be routed through [`backend/src/config/db.js`](file:///d:/DPI/FIR/pharos-prototype/backend/src/config/db.js) instance (`db`).
- All schema alterations must be accompanied by explicit Knex migration scripts in `backend/migrations/`.

---

## 3. Hybrid Data Architecture: Normalized SQL Columns + JSONB Payload (`data`)

### Decision
The primary `records` table stores core queryable fields (such as `id`, `record_type`, `record_number`, `ps_id`, `district_id`, `current_status`, `created_by`, `created_at`) as top-level indexed SQL columns, while detailed entity attributes are stored in a structured JSONB payload column named `data`.

### Context
Police reporting standards require hundreds of domain-specific fields across different crime heads and record types, with frequent legislative and procedural schema updates.

### Why
- **Inferred**: Avoids excessive database schema migrations for minor form field changes while preserving SQL indexing performance on primary administrative fields (`ps_id`, `district_id`, `record_type`, `current_status`).

### Alternatives
- Entity-Attribute-Value (EAV) table design.
- Wide relational tables with hundreds of nullable columns.

### Tradeoffs
- **Benefits**: Extensible form schema without constant DDL changes; single table stores `CASE`, `ARREST`, `PCR_CALL`, `MISSING`, `UIDB`, `KALANDRA`, and `LEFT_OUT`.
- **Limitations**: Deep JSONB payload filtering requires custom extraction (`records.mapper.js` and JSONB path queries).

### Relevant Code
- [`backend/src/modules/records/records.service.js`](file:///d:/DPI/FIR/pharos-prototype/backend/src/modules/records/records.service.js)
- [`backend/src/modules/records/records.mapper.js`](file:///d:/DPI/FIR/pharos-prototype/backend/src/modules/records/records.mapper.js)
- [`backend/migrations/20260717000001_create_pharos_tables.js`](file:///d:/DPI/FIR/pharos-prototype/backend/migrations/20260717000001_create_pharos_tables.js)

### Confidence
- **Current Implementation**: Confirmed
- **Historical Reasoning**: Inferred

### Constraints
- Field mapping between top-level SQL columns and `data` JSONB payload must be synchronized via [`records.mapper.js`](file:///d:/DPI/FIR/pharos-prototype/backend/src/modules/records/records.mapper.js).

---

## 4. Metadata-Driven Dynamic Form Engine (`field_registry`)

### Decision
Forms are rendered dynamically on the frontend using field definitions and layout metadata fetched from `GET /api/v1/fields/schema/:recordType` and `GET /api/v1/fields`. The backend queries the `field_registry` table, attaches dynamic dropdown options (Acts, Sections, Minor Heads, Statuses), and injects a unified layout configuration (section ordering, labels, repeater metadata) from `backend/src/config/formLayout.js`.

### Context
Different police stations and districts require customized fields, localized Hindi/English labels, conditional visibility (`show_when`, `disabled_when`), and level-based editability controls (`introduced_at_level`, `editable_by_levels`). Section layouts and structures are defined globally but affect both record entry and district-level custom field management.

### Why
- **Confirmed**: Enables dynamic form layout modification from administrative control panels without frontend code redeployments. Centralizing layout metadata in the backend prevents drift between frontend entry forms (`DynamicForm.jsx`) and administrative interfaces (`CustomFieldsPage.jsx`), ensuring a single source of truth.

### Alternatives
- Hardcoded static React form components per record type.
- Duplicating layout configuration constants in both frontend and backend.

### Tradeoffs
- **Benefits**: Single dynamic form component ([`DynamicForm.jsx`](file:///d:/DPI/FIR/pharos-prototype/frontend/src/components/forms/DynamicForm.jsx) and [`FieldRenderer.jsx`](file:///d:/DPI/FIR/pharos-prototype/frontend/src/components/forms/FieldRenderer.jsx)) handles all 7 record types. Administrative screens can dynamically group custom fields.
- **Limitations**: Complex schema resolution logic; requires careful handling of conditional validation rules and dependent selects.

### Relevant Code
- [`backend/src/modules/fields/fields.controller.js`](file:///d:/DPI/FIR/pharos-prototype/backend/src/modules/fields/fields.controller.js)
- [`backend/src/modules/fields/fields.service.js`](file:///d:/DPI/FIR/pharos-prototype/backend/src/modules/fields/fields.service.js)
- [`frontend/src/hooks/useFormSchema.js`](file:///d:/DPI/FIR/pharos-prototype/frontend/src/hooks/useFormSchema.js)
- [`frontend/src/components/forms/DynamicForm.jsx`](file:///d:/DPI/FIR/pharos-prototype/frontend/src/components/forms/DynamicForm.jsx)
- [`frontend/src/components/forms/FieldRenderer.jsx`](file:///d:/DPI/FIR/pharos-prototype/frontend/src/components/forms/FieldRenderer.jsx)

### Confidence
- **Current Implementation**: Confirmed
- **Historical Reasoning**: Confirmed

### Constraints
- New fields should be registered in `field_registry` rather than hardcoded in React components.
- System UID fields (`uid`, `person_uid`, `*_npr`, `*_uid`) must remain marked `readonly: true`.

---

## 5. Event-Driven Messaging Architecture (RabbitMQ + In-Memory Fallback)

### Decision
Cross-module side effects (notifications, link audits, case-arrest link resolution, import confirmations, report job processing) are dispatched asynchronously through an event bus ([`eventBus.js`](file:///d:/DPI/FIR/pharos-prototype/backend/src/events/eventBus.js)). If RabbitMQ is unavailable, the event bus seamlessly falls back to a local `Node.js EventEmitter`.

### Context
Operations like submitting an Arrest record require auto-linking to existing FIR cases, notifying Station House Officers (SHOs), and updating audit trails without blocking the HTTP request-response cycle.

### Why
- **Confirmed**: Prevents HTTP timeouts and decouples core CRUD operations from background processing. The local fallback allows local development without mandatory Docker RabbitMQ infrastructure.

### Alternatives
- Synchronous inline function execution within controller/service methods.
- External worker framework (BullMQ / Redis Streams).

### Tradeoffs
- **Benefits**: Resilience; seamless fallback when RabbitMQ container is offline.
- **Limitations**: In-memory fallback events are lost if the Node.js process crashes before execution.

### Relevant Code
- [`backend/src/events/eventBus.js`](file:///d:/DPI/FIR/pharos-prototype/backend/src/events/eventBus.js)
- [`backend/src/events/handlers/linkResolver.js`](file:///d:/DPI/FIR/pharos-prototype/backend/src/events/handlers/linkResolver.js)
- [`backend/src/events/handlers/notifyHandler.js`](file:///d:/DPI/FIR/pharos-prototype/backend/src/events/handlers/notifyHandler.js)
- [`backend/src/events/handlers/linkAuditHandler.js`](file:///d:/DPI/FIR/pharos-prototype/backend/src/events/handlers/linkAuditHandler.js)

### Confidence
- **Current Implementation**: Confirmed
- **Historical Reasoning**: Confirmed

### Constraints
- All published events must flow through `eventBus.publish(routingKey, payload)`.
- Event handlers must be idempotent and catch execution exceptions internally.

---

## 6. Offloaded Python Worker for Dynamic Excel & PHQ Diary Report Generation

### Decision
Complex, multi-sheet Excel workbooks and mathematical PHQ Daily Diary computations are offloaded to an isolated Python sub-process worker ([`python_worker/generator.py`](file:///d:/DPI/FIR/pharos-prototype/python_worker/generator.py)) utilizing `pandas`, `openpyxl`, `SQLAlchemy`, and custom formatters.

### Context
Generating statutory police reporting sheets (Daily Diary, PHQ Summary, Heinous Crime Matrix) requires complex cell formatting, multi-column group headers, subtotal formula injections, and high-performance tabular computation.

### Why
- **Confirmed**: Python's `pandas` and `openpyxl` ecosystems provide superior performance and formatting capabilities for large multi-sheet Excel generation compared to Node.js spreadsheet libraries.

### Alternatives
- Node.js `exceljs` library exclusively.

### Tradeoffs
- **Benefits**: Precise layout rendering matching statutory Delhi Police proformas (`.xlsx` output).
- **Limitations**: Secondary language runtime dependency (Python 3.x with `pandas`, `openpyxl`, `sqlalchemy`).

### Relevant Code
- [`python_worker/generator.py`](file:///d:/DPI/FIR/pharos-prototype/python_worker/generator.py)
- [`backend/src/modules/report-engine/shared/diary-query-builder.js`](file:///d:/DPI/FIR/pharos-prototype/backend/src/modules/report-engine/shared/diary-query-builder.js)
- [`backend/src/modules/reports/reports.controller.js`](file:///d:/DPI/FIR/pharos-prototype/backend/src/modules/reports/reports.controller.js)

### Confidence
- **Current Implementation**: Confirmed
- **Historical Reasoning**: Confirmed

### Constraints
- Python worker scripts must reside in `python_worker/` and accept standard JSON parameters or DB queries.

---

## 7. Dual-Path API Routing Scheme (`/api/v1/*` and `/api/*`)

### Decision
All Express routers are mounted under both legacy `/api/*` and versioned `/api/v1/*` paths in [`backend/src/app.js`](file:///d:/DPI/FIR/pharos-prototype/backend/src/app.js).

### Context
Maintains backward compatibility with legacy client integrations while providing a clean `/api/v1` API surface.

### Why
- **Confirmed**: Prevents breaking older frontend components, Postman collection workflows, or external tools during active platform iteration.

### Alternatives
- Hard HTTP 301/308 redirects from `/api/*` to `/api/v1/*`.
- Single API prefix.

### Tradeoffs
- **Benefits**: Zero breaking changes for existing API consumers.
- **Limitations**: Express route matching table size is doubled.

### Relevant Code
- [`backend/src/app.js`](file:///d:/DPI/FIR/pharos-prototype/backend/src/app.js)

### Confidence
- **Current Implementation**: Confirmed
- **Historical Reasoning**: Confirmed

### Constraints
- All new routes added to `app.js` must be registered under both `/api/v1/*` and `/api/*`.

---

## 8. Multi-Level Role-Based Access Control & Hierarchical Jurisdiction Scoping

### Decision
Access permissions are governed by role hierarchies (`SYSTEM_ADMIN`, `HQ_ADMIN`, `DISTRICT_OFFICER`, `SHO`, `HC`) and geographic boundaries (`station_id`, `district_id`).

### Context
Police data access must follow command hierarchy: Head Constable (HC) accesses own submissions, Station House Officer (SHO) accesses police station queue, District Officer accesses district-wide data, and HQ Admin accesses state-wide analytics.

### Why
- **Confirmed**: Enforces legal compliance and data confidentiality across police administrative tiers.

### Alternatives
- Attribute-Based Access Control (ABAC) or open access models.

### Tradeoffs
- **Benefits**: Clear security boundaries aligned with physical police hierarchy.
- **Limitations**: Scoping parameters (`ps_id`, `district_id`) must be strictly applied in every query builder method.

### Relevant Code
- [`backend/src/middleware/auth.middleware.js`](file:///d:/DPI/FIR/pharos-prototype/backend/src/middleware/auth.middleware.js)
- [`backend/src/modules/records/records.service.js`](file:///d:/DPI/FIR/pharos-prototype/backend/src/modules/records/records.service.js)
- [`frontend/src/store/authStore.js`](file:///d:/DPI/FIR/pharos-prototype/frontend/src/store/authStore.js)

### Confidence
- **Current Implementation**: Confirmed
- **Historical Reasoning**: Confirmed

### Constraints
- Record queries must enforce role and jurisdiction scoping based on `req.user`.

---

## 9. Tamper-Evident Audit Hash-Chain Verification System

### Decision
Every system mutation writes an audit log entry containing a cryptographic SHA-256 hash chaining back to the previous entry's hash (`previous_hash`). A scheduled background verifier ([`audit.scheduler.js`](file:///d:/DPI/FIR/pharos-prototype/backend/src/modules/audit/audit.scheduler.js)) periodically checks the hash-chain integrity and freezes records if a break is detected.

### Context
Police records require legal evidentiary standards, preventing unauthorized database tampering or retroactive modification.

### Why
- **Confirmed**: Guarantees non-repudiation and detects direct database manipulation outside the application framework.

### Alternatives
- Plain unhashed audit log tables.

### Tradeoffs
- **Benefits**: Verifiable audit trail without blockchain complexity.
- **Limitations**: Requires strict sequential log insertion to maintain hash continuity.

### Relevant Code
- [`backend/src/modules/audit/audit.service.js`](file:///d:/DPI/FIR/pharos-prototype/backend/src/modules/audit/audit.service.js)
- [`backend/src/modules/audit/audit.scheduler.js`](file:///d:/DPI/FIR/pharos-prototype/backend/src/modules/audit/audit.scheduler.js)

### Confidence
- **Current Implementation**: Confirmed
- **Historical Reasoning**: Confirmed

### Constraints
- Audit log writes must preserve hash-chain sequence integrity.

---

## 10. Immutable Auto-Generated Identifiers (`record_uid`, `person_uid`, `_npr`)

### Decision
Unique system UIDs (`record_uid`, `person_uid`, `_npr`) are generated by backend services during record creation and rendered as `readonly: true` across all frontend forms. User input on UID fields is explicitly disabled.

### Context
Prevent duplicate entity entries and ensure clean record linkage across Case, Arrest, Victim, and Complainant records.

### Why
- **Confirmed**: Prevents human data-entry errors, key collisions, and manual identifier fabrication.

### Alternatives
- Manual user-entered registration numbers.

### Tradeoffs
- **Benefits**: Guaranteed uniqueness across the system.
- **Limitations**: Forms must display clear `AUTO_ASSIGNED_BY_SYSTEM` placeholders prior to final record creation.

### Relevant Code
- [`backend/src/modules/fields/fields.controller.js`](file:///d:/DPI/FIR/pharos-prototype/backend/src/modules/fields/fields.controller.js)
- [`frontend/src/hooks/useFormSchema.js`](file:///d:/DPI/FIR/pharos-prototype/frontend/src/hooks/useFormSchema.js)
- [`frontend/src/components/forms/DynamicForm.jsx`](file:///d:/DPI/FIR/pharos-prototype/frontend/src/components/forms/DynamicForm.jsx)

### Confidence
- **Current Implementation**: Confirmed
- **Historical Reasoning**: Confirmed

### Constraints
- Form fields labeled as UID or NPR must remain read-only with auto-generation in backend services.

---

## 11. Accompanying Missing Children (Hybrid Role Pattern)

### Decision
The `MISSING` record type models the primary missing subject as a pure singleton (`role = 'MISSING'`), while accompanying children are modeled as a repeater role (`role = 'MISSING_CHILD'`). 

### Context
When a mother and child go missing together, they share the same case details (FIR, IO, dates), but require distinct physical descriptions and person records.

### Why
- **Confirmed**: Making the primary `MISSING` person a repeater would fundamentally break downstream systems (ETL sync, PHQ dashboard `diaryCount`, and the B1 safety net) which assume a 1:1 relationship between a missing record and its primary missing person.
- **Confirmed**: Introducing `MISSING_CHILD` as a first-class `REPEATER_ROLE` enables multiple accompanying children to have independent rows in `persons`, `missing_person_details`, and `person_descriptions` without disrupting the singleton behavior of the primary missing subject.

### Alternatives
- Converting `MISSING` to a repeater role (rejected due to 1:1 assumption breakage).
- Storing children as a JSONB array under the main `missing_person_details` (rejected because they would not be searchable global person records).

### Tradeoffs
- **Benefits**: Perfect backward compatibility with the data warehouse (`sync.js`) and dashboard counts. Preserves the B1 safety net.
- **Limitations**: A single record requires querying two distinct roles (`MISSING` and `MISSING_CHILD`) to fetch all missing individuals.

### Relevant Code
- `backend/src/modules/records/records.mapper.js` (`PERSON_ROLES`, `REPEATER_ROLES`)
- `backend/src/config/formLayout.js` (`REPEATER_SECTION_META`)

### Confidence
- **Current Implementation**: Confirmed
- **Historical Reasoning**: Confirmed

---

## Known Architectural Risks & Ambiguities

### 1. Schema Duality: Relational Columns vs JSONB Payload
- **Observation**: Key fields exist both as top-level SQL columns (`records.ps_id`, `records.current_status`) and inside the JSONB payload (`records.data`).
- **Relevant Code**: [`backend/src/modules/records/records.mapper.js`](file:///d:/DPI/FIR/pharos-prototype/backend/src/modules/records/records.mapper.js)
- **Why it matters**: Inconsistent updates to `records.data` without syncing top-level columns (or vice-versa) can create reporting drift.
- **Confidence**: Confirmed limitation.

### 2. RabbitMQ Connection Fallback State
- **Observation**: If RabbitMQ goes offline, `eventBus.js` switches to an in-memory `EventEmitter`.
- **Relevant Code**: [`backend/src/events/eventBus.js`](file:///d:/DPI/FIR/pharos-prototype/backend/src/events/eventBus.js)
- **Why it matters**: In multi-instance cluster deployments, Node.js processes using in-memory fallbacks will miss events emitted by other instances.
- **Confidence**: Confirmed architectural tradeoff.

### 3. External Python Sub-Process Execution
- **Observation**: Excel report generation invokes Python via system process execution.
- **Relevant Code**: [`backend/src/modules/reports/reports.controller.js`](file:///d:/DPI/FIR/pharos-prototype/backend/src/modules/reports/reports.controller.js)
- **Why it matters**: Requires Python binaries and virtual environment dependencies (`pandas`, `openpyxl`, `SQLAlchemy`) to be correctly installed on host OS.
- **Confidence**: Confirmed dependency constraint.
