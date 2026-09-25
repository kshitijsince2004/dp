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

## UIDB Cause of Death "Other" Pattern

### Decision
Added an "Other" option to the UIDB `cause_of_death` field which reveals a conditional text input (`cause_of_death_other`) via the standard `show_when` config-driven pattern.

### Context
When registering an unidentified dead body (UIDB), users occasionally encounter a cause of death not covered by standard options.

### Why
Using the established `show_when: { field: "cause_of_death", value: "Other" }` pattern ensures the UI automatically toggles the field without custom frontend logic, matching existing patterns like `other_status_reason` in arrest.json.

### Alternatives
- Hardcoding a React state toggle in `DynamicForm.jsx` (rejected: breaks metadata-driven schema design).
- Creating a separate text area for all registrations (rejected: clutters UI).

### Tradeoffs
Requires coordinating updates across JSON config, DB migrations, import templates, layout manifests, and report builder to ensure the new field is fully integrated across all system modules.

### Relevant Code
- `config/fields/uidb.json`
- `backend/migrations/20260917000001_add_cause_of_death_other.cjs`
- `backend/src/modules/import/layout-manifests.js`

### Confidence
High. Follows exact precedents.

## Workflow Resubmission Field Validation

### Decision
Added `requires_field_correction` to workflow configuration (specifically the `sent_back.submit` transition). When true, the transition is blocked unless every field flagged for correction in the last `SEND_BACK` action has a corresponding entry in `record_revisions.field_changes` recorded since that send-back.

### Context
When a reviewer (e.g., SHO or District Officer) sends a record back for correction, they specify target fields that need fixing. The system needs to ensure the user actually modifies those fields before resubmitting.

### Why
Using a data-driven config flag on the `sent_back.submit` row avoids hardcoding validation logic for specific statuses. By comparing the `workflow_transitions.target_fields` array of the last send-back against the `record_revisions.field_changes` array of subsequent edits, we leverage the existing audit trail instead of capturing new state.

### Alternatives
- Hardcoding the rule in `records.service.js` specifically for the `PENDING_SHO` resubmission (rejected: not extensible to other roles/transitions).
- Storing a "corrected" status per field in a new database table (rejected: redundant, the `record_revisions` table already acts as a comprehensive edit ledger).

### Tradeoffs
Requires parsing stringified JSON arrays from historical audit records during the transition attempt. This is slightly slower but perfectly acceptable since resubmission events are low-frequency actions for any single record.

### Relevant Code
- `config/workflow/main.json`
- `backend/src/modules/workflow/workflow.engine.js` (`assertFieldsCorrected`)
- `backend/src/modules/records/records.service.js`

### Confidence
High. Config-driven and fully reuses the existing `record_revisions` audit mechanism.

## Scheme of Arrest "Other" Pattern

### Decision
Added 4 new explicit options ("Special Drive", "Cyber Hawk", "Kawach", "General") and an "Other" option to the ARREST `scheme_of_arrest` field, which conditionally reveals a `scheme_of_arrest_other` text field via the `show_when` pattern. Additionally, updated `DynamicForm.jsx` to respect `show_when` visibility rules when rendering unlisted extra fields in the `arrested_personal_info` block.

### Context
When recording arrest particulars, the scheme under which the arrest was made needs to capture new specific initiatives or provide a fallback for unlisted schemes.

### Why
Using the config-driven `show_when: { field: "scheme_of_arrest", value: "Other" }` ensures consistency with the UIDB `cause_of_death_other` pattern. Validation was handled for free by existing logic in `records.service.js` and `saveArrestedEntry`, requiring only a `validation_rules: { required: true }` block in the config.

### Alternatives
- Custom validation logic in `records.service.js` (rejected: the generic `validateRequiredFields` handles `show_when` automatically).
- Hardcoding the new field in the UI (rejected: `DynamicForm.jsx`'s `extraFields` map can support conditional rendering generically).

### Tradeoffs
Required a one-line structural change to `DynamicForm.jsx`'s `renderPersonPersonalInfoSubTab` to correctly filter `extraFields` against their `show_when` conditions, as this specific sub-tab was previously unconditionally rendering all unlisted fields in the section.

### Relevant Code
- `config/fields/arrest.json`
- `backend/migrations/20260918000003_add_scheme_of_arrest_other.cjs`
- `frontend/src/components/forms/DynamicForm.jsx`
- `frontend/src/utils/api.js`

### Confidence
High. Mirrored the exact UIDB pattern and generalized the UI's conditional rendering capability.

## ARREST UX and Vocabulary Fixes

### Decision
1. Removed the duplicate top-level "Custody Status" tab from the ARREST form structure.
2. Added "Apprehension" as a standard custody status option across the registry, excel imports, and mock APIs.
3. Removed a duplicate `nick_name` field definition from the ARREST field config.

### Context
Users reported a redundant top-level "CUSTODY STATUS" tab showing up alongside the existing modal-based "Custody Status" sub-tab, missing vocabulary for generic apprehensions, and two separate "Nickname" inputs on the Arrested Person modal.

### Why
1. The top-level Custody Status tab was an unintended artifact in `fields.controller.js` `sections.push` array. The correct location is the per-arrestee modal (since a single FIR can have multiple arrestees, each with their own custody status).
2. "Apprehension" is a generic outcome needed for both against-FIR and kalandra arrests. We updated `statusOptions.config.js` and all dependent import configurations (`import-fields.config.js`, `template-builder.service.js`) to accept it.
3. The duplicate nickname input was caused by a redundant `nick_name` config block in `arrest.json`, distinct from the correct `arrested_nickname`. Because it was not mapped in `DynamicForm.jsx`'s `KNOWN_KEYS`, the dynamic renderer mistakenly captured it as an "extra field" and rendered a second, out-of-place input. Removing the duplicate config block and syncing the registry permanently resolves the issue without hardcoded React hacks.

### Alternatives
- Hardcoding `nick_name` into `KNOWN_KEYS` (rejected: masks the underlying schema pollution instead of fixing it).

### Relevant Code
- `backend/src/modules/fields/fields.controller.js`
- `backend/src/modules/fields/statusOptions.config.js`
- `backend/src/modules/import/import-fields.config.js`
- `backend/src/modules/import/template-builder.service.js`
- `frontend/src/utils/api.js`
- `config/fields/arrest.json`

### Confidence
High. The changes strictly target the reported issues with clean configuration drops and single-line array additions.

## District-Level Review Write Permissions

### Decision
District review edits are now restricted specifically to **Acts & Sections, Major/Minor Head, and Local Head**. Any other field modifications made by District during a review will be rejected by the backend and visually locked in the frontend.

### Context
Previously, any district reviewer could technically edit any field using the generic `updateRecord` endpoint since the frontend just unlocked the entire form indiscriminately, and the backend didn't enforce specific role limitations beyond `is_worked_out`.

### Why
We finally wired up the pre-existing (and previously decorative) `editable_by_levels` array column in `field_registry`. 
Instead of hardcoding field lists in the backend, we now loop over the registry definition on submit. If a field value changed but the user's role isn't explicitly in that field's `editable_by_levels` array, the save is rejected.
For persons and properties (which use repeater UI grids), the frontend completely disables their 'Add' and 'Edit' triggers during District review so the arrays are never maliciously or accidentally manipulated, and the backend blocks the entire array if it changes.

### Alternatives
- Hardcoded lists in `records.service.js` (rejected: difficult to maintain, breaks data-driven schema paradigm).
- New specific API for District (rejected: duplicates validation logic; `updateRecord` is designed to be the unified save handler).

### Relevant Code
- `backend/src/modules/records/records.mapper.js`
- `backend/src/modules/records/records.service.js`
- `config/fields/common.json`, `config/fields/case.json`
- `frontend/src/components/forms/DynamicForm.jsx`

### Confidence
High. The solution relies exclusively on the existing field configuration schema.

### Send-Back Field Picker Live Schema Integration
* **Decision**: Source the "Return for correction" field picker from the live form schema (`useFormSchema`) instead of the hardcoded Mock Mode copy (`formSchemas`), group checkboxes by section/sub-tab, and exclude read-only fields.
* **Context**: The previous implementation used a flat list derived from a stale mock file (`utils/api.js`), which led to an unusable undifferentiated list of checkboxes that missed newly added fields and all repeater sub-tabs.
* **Why**: To ensure the reviewer sees the exact same fields and labels that are rendered on the live form, with clear grouping. Read-only fields are explicitly excluded because the HC cannot edit them, making them misleading options for correction.
* **Alternatives**: Manually updating the mock schema and writing a custom grouper.
* **Tradeoffs**: Requires fetching the schema dynamically for the modal, but the hook is already used by the underlying form so the data is usually cached or readily available.
* **Relevant Code**: `frontend/src/pages/sho/RecordDetail.jsx` (getSendBackFieldGroups) and `frontend/src/pages/hc/NewRecord.jsx` (getFieldLabel).
* **Confidence**: High. The underlying storage (`target_fields`) remains strictly field keys, preserving compatibility with backend rules and HC-side highlights.

### Duplicate Fields in Person Sub-Tabs
* **Decision**: Separate `scheme_of_arrest` and `complainant_same_as_victim` from the generic suffix array in `renderPersonPersonalInfoSubTab`'s KNOWN_KEYS exclusion list, checking them unprefixed.
* **Context**: These fields are already fully-qualified in the registry (`config/fields/case.json`, `config/fields/arrest.json`). Prefixing them dynamically generated non-existent keys (e.g., `complainant_complainant_same_as_victim`), causing them to bypass the exclusion check and incorrectly render a second time in the "Additional Information" fallback block.
* **Why**: To prevent duplicate renders of "Is Complainant same as Victim?" in COMPLAINANT and "Scheme of Arrest" in ARRESTED.
* **Alternatives**: Removing them from the catch-all, but this properly addresses the root cause of the prefixing mismatch.
* **Tradeoffs**: None.
* **Relevant Code**: `frontend/src/components/forms/DynamicForm.jsx` (`renderPersonPersonalInfoSubTab`).
* **Confidence**: High. Exact root cause identified.

### Complainant Step Navigation
* **Decision**: Intercept "Next Step" in `handleNext` when on the Complainant step (which uses two inline sub-tabs) to switch from "Personal" to "Address" sub-tabs before actually advancing the global wizard step.
* **Context**: Complainant is unique because its sub-tabs are inline rather than in a modal. Clicking "Next Step" while on Personal Info skipped the Address tab entirely and jumped straight to the next section (FIR Contents).
* **Why**: To ensure users naturally flow through both sub-tabs of the Complainant section without being prematurely kicked to the next wizard step.
* **Alternatives**: Adding a separate "Next" button inside the Complainant component.
* **Tradeoffs**: Requires a specific conditional branch in the global `handleNext` function.
* **Relevant Code**: `frontend/src/components/forms/DynamicForm.jsx` (`handleNext`).
* **Confidence**: High. Leverages existing state (`complainantTab`) and maintains the existing `validateSection` behavior exactly.

### Custom Fields in CASE Tabs
* **Decision**: Update backend filters for `acts_and_sections` and `fir_contents` to explicitly accept fields whose `section` matches the tab key, and add an "Additional Information" block to the hand-written `renderActsAndSectionsStep`.
* **Context**: District admin custom fields assigned to "Acts & Sections" or "FIR Contents" were not appearing. The backend filters for these two specific CASE tabs were closed (allowlist only or excluding their own section key). Additionally, the frontend renderer for `acts_and_sections` lacked a loop to display unexpected fields.
* **Why**: To ensure district custom fields mapped to these tabs render correctly, aligning their behavior with all other tabs in the application (which are self-inclusive).
* **Alternatives**: Changing the admin UI to map custom fields to sub-sections, but that breaks the abstraction.
* **Tradeoffs**: Requires a specific catch-all block in `DynamicForm.jsx` for `renderActsAndSectionsStep`.
* **Relevant Code**: `backend/src/modules/fields/fields.controller.js` (`getFieldsForForm`), `frontend/src/components/forms/DynamicForm.jsx` (`renderActsAndSectionsStep`).
* **Confidence**: High.
* **Note/Follow-up**: The `unassignedFields` safety net logic checks `f.created_by !== null`, but `created_by` doesn't exist on `field_registry`. This causes a silent fallback collision where custom fields can overwrite official tabs in the frontend map. This requires a DB migration to add `created_by` and is deferred to a separate fix pass.

### Custom Fields in ARREST General Info
* **Decision**: Added an "Additional Information" fallback block to the hand-written `renderArrestGeneralInfoStep` in `DynamicForm.jsx`.
* **Context**: Similar to the CASE `acts_and_sections` issue, the ARREST `general_info` tab's custom rendering logic did not include a loop to render generic custom fields, even though they were correctly included in the API response under `general_info`.
* **Why**: To ensure district custom fields mapped to this tab render correctly while maintaining the custom layout for standard fields.
* **Alternatives**: None.
* **Tradeoffs**: Hand-written components require explicit fallback loops.
* **Relevant Code**: `frontend/src/components/forms/DynamicForm.jsx` (`renderArrestGeneralInfoStep`).
* **Confidence**: High.

#### Follow-up: MISSING Custom Fields
* **Investigation Note**: When investigating why the `test_missing` custom field does not render on the MISSING record type under the `general_info` section, step 0 verification confirmed:
  1. The field IS saved with `section: 'general_info'` in the database.
  2. The field IS returned inside the official `general_info` fields array in the API response (verified via script against `GET /fields/form/MISSING`).
  3. MISSING uses the default `FormSection.jsx` component which loops over all fields, and `test_missing` is NOT in the `KEYS_TO_SKIP` exclusion list, nor does it fail `evaluateShowWhen`.
  *Conclusion*: The assumption that it was saved under a non-official custom section and failing `SECTION_KEY_ORDER` validation was incorrect. It is properly part of the real `general_info` section payload. (I am awaiting further instructions on this since the root cause diverges from the initial hypothesis).

### Add "Formal Arrest" to ARREST Custody Status
* **Decision**: Added "Formal Arrest" as an available option for ARREST's custody status, matching the pattern used for "Apprehension".
* **Context**: The status column in `arrest_details` is an unrestricted text column, so no database migration is required. However, the vocabulary is defined in three separate places to keep the UI form, the edit dropdown, and the bulk-import validation in sync.
* **Why**: To expose "Formal Arrest" as a valid status selection during arrest record creation, modification, and bulk Excel import.
* **Alternatives**: None.
* **Tradeoffs**: The vocabulary must be manually added to three separate arrays.
* **Relevant Code**:
  - `backend/src/modules/fields/statusOptions.config.js`
  - `backend/src/modules/import/import-fields.config.js`
  - `backend/src/modules/import/template-builder.service.js`
* **Confidence**: High.

### District Review Field Locks
* **Decision**: Enforced the "nothing else" edit restriction strictly across all record types and tabs during District Review. Fixes included allowing derived Major/Minor Head fields through the backend gate, applying `isFieldEditableForReview` to Property Repeater inline fields, adding the check to the generic `FormSection` component, and adding a `disabled` prop to Occurrence Radio fields.
* **Context**: District Review limits edits to Acts & Sections and Crime Heads. However, this rule was only checked in hand-written render functions. Gaps allowed district reviewers to edit properties (in ARREST/CASE), Occurrence radios, and completely bypassed locks in MISSING, UIDB, and PCR_CALL which use the fallback generic FormSection.
* **Why**: To adhere exactly to the review protocol where any non-Act/Section modification requires a "Send Back".
* **Alternatives**: None.
* **Tradeoffs**: Missing and PCR Call forms are now ~100% locked during review (as intended). 
* **Relevant Code**: `DynamicForm.jsx`, `FormSection.jsx`, `config/fields/common.json`, `config/fields/arrest.json`.
* **Known follow-up**: `ActsSectionsTable` and `ActsAndSectionsManager` rely on a plain `readOnly` rather than a per-field `isFieldEditableForReview`. While harmless currently, this relies on their `editable_by_levels` never drifting.
* **Confidence**: High.

### Fix: Custom Fields in ARREST General Info
* **Correction**: The initial `KNOWN_KEYS` list for the `renderArrestGeneralInfoStep` catch-all block was incomplete. Real fields like `fir_no`, `fir_date`, `gd_date`, `gd_time`, and `is_dd_based` were missing from the exclusion list, which caused them to leak into the "Additional Information" box alongside actual custom fields. The list has been corrected. Additionally, a `show_when` check was added to both the ARREST and CASE general_info/acts_and_sections catch-all blocks to properly respect conditional visibility rules for custom fields.

### Remove ARREST General Info Custom Field Block
* **Decision**: Removed the "Additional Information" catch-all block from `renderArrestGeneralInfoStep` entirely, overriding the previous attempt to fix its field exclusion list.
* **Context**: This block was originally added to surface district-custom fields assigned to ARREST's `general_info` section. However, it was found to leak real fields (FIR Number, FIR Date, GD Date, GD Time, is-DD-based checkbox) alongside the intended custom fields.
* **Why**: Explicit user decision to remove the block rather than maintain an increasingly complex and brittle `KNOWN_KEYS` exclusion list.
* **Tradeoffs**: **Known limitation**: Any district-custom field created with record type `ARREST` and section "General Information" will no longer render anywhere on the ARREST form. This is an intended consequence and not a bug, unless a future request asks to reintroduce it correctly.
* **Relevant Code**: `DynamicForm.jsx`
* **Confidence**: High.

### CASE Occurrence Information Validation and UI
* **Decision**: Added cross-field validation to ensure `occurrence_to_date_time` cannot be before `occurrence_from_date_time`. The check was added to both `validateSection` (to block step progression/saving) and `handleChange` (for reactive real-time feedback).
* **Decision**: Deactivated the `occurrence_time_type` field (`is_active: false` in `case.json`) since it is redundant when both From/To date-time fields are populated.
* **Context**: `occurrence_time_type` was a `ui_only` field and was never persisted or included in bulk imports. Deactivating it slims down the UI without any data loss.
* **Tradeoffs**: A picker-level restriction (`minDateTime`) was not implemented in `DateTimePickerPopup.jsx` because it would require invasive changes to the calendar-day and time-slider rendering logic. The robust reactive validation block is used instead.
* **Relevant Code**: `config/fields/case.json`, `DynamicForm.jsx`

### Fix Delhi Police Districts in Person Addresses
* **Decision**: Switched person address District and Police Station dropdowns to use the real Delhi Police District → PS map (`DISTRICTS_AND_STATIONS`) when the selected state is Delhi.
* **Context**: Previously, person addresses used a generic all-India civil district list for Delhi, and a single unfiltered alphabetical list of all ~190 Delhi police stations. This mismatched the event location UX and allowed invalid district-PS combinations.
* **Backward Compatibility**: A database check was run to see how many existing records had `state = 'Delhi'` in any person address. Exactly 1 record was found. Because the impact was near-zero, no data normalization script was required for the legacy string values. The old `ALL_DELHI_PS` constant was removed as dead code.
* **Relevant Code**: `FieldRenderer.jsx`

### Modal Footer Next/Save Pattern
* **Decision**: Updated Victim, Accused, and Arrested modal footers to show a "Next" button that advances to the next sub-tab, and only show "Save" when the user reaches the final sub-tab.
* **Context**: The Complainant modal already used this pattern. The other three person modals had hardcoded "Save" buttons that persisted across all sub-tabs, which was inconsistent and confusing. The new logic is fully dynamic based on the backend-driven `getSectionSubTabs()` list.
* **Relevant Code**: `DynamicForm.jsx`

### Normalize DOB to Age Calculation Across All Person Types
* **Decision**: Standardized the DOB to Age (Years, Months) and Year of Birth calculation so that Complainant, Victim, Accused, and Arrested all use the exact same `diffMs` formula.
* **Context**: Previously, only Victim and Accused calculated `age_month`. Arrested used a calendar-exact year check and left month blank. Complainant used a crude subtraction (current year - birth year) and also left month blank. I elected to fully normalize Arrested to use the `diffMs` approximation for year as well, ensuring 100% uniformity across all four person models.
* **Relevant Code**: `DynamicForm.jsx` (`handleArrestedDobChange` and the generic `_dob` handler in `handleChange`).

### Add "Post Graduate" to Education Options
* **Decision**: Added "POST_GRADUATE" ("Post Graduate" / "स्नातकोत्तर") to the education dropdown options across all seven person-role configurations in `common.json` (generic `education`, Complainant, Victim, Accused, Arrested, and Missing Person), positioned logically between Graduate and Professional.
* **Decision**: Mirrored the addition in `backend/src/modules/import/import-fields.config.js` to keep the bulk-import Excel template's dropdown perfectly synchronized with the UI form's dropdown options.
* **Context**: This is purely a dictionary/vocabulary change. Since education fields use unrestricted text storage across all tables, no database migration was needed. The change was applied using `npm run sync-config` to update the `field_registry`.

### Add Missing Age Month Fields to Config
* **Decision**: Added four new fields to the field registry config (`complainant_age_month`, `victim_age_month`, `accused_age_month`, and `arrested_age_month`) stored via `{ entity: "person", role: "...", extra: true }`. They are set to `min: 0, max: 11` and positioned immediately after their respective `_age_year` field.
* **Context**: While the UI (`DynamicForm.jsx`) was coded to render the second "Age (Months)" input in the Age Panel for all persons, it failed to render because the fields never actually existed in the database registry (`field_registry`). Without a row in the registry, `rawField` aborted rendering entirely. Adding them via config automatically lights up the existing UI code. Because they are mapped to the `extra` JSONB column, no database schema migration was necessary.
* **Relevant Code**: `config/fields/case.json`, `config/fields/arrest.json`

### Command Center Breadcrumb Routing
* **Decision**: Made the 'Command Center' breadcrumb in PoliceNavbar.jsx role-aware, directing PS and HC roles straight to /ps/dashboard instead of the generic /dashboard.
* **Context**: The /dashboard route redirects PS/HC to /records (via RoleRedirect in AppRouter.jsx), skipping their dedicated dashboard page. The sidebar link correctly routes to /ps/dashboard, but the hardcoded top breadcrumb did not.
* **Why**: To align the breadcrumb's behavior with the sidebar's existing correct link for PS/HC, while preserving the generic /dashboard redirect logic for all other roles (who do not have a dedicated ps/dashboard equivalent).
* **Relevant Code**: rontend/src/components/layout/PoliceNavbar.jsx

### SearchableSelect Cross-Device Click Reliability
* **Decision**: SearchableSelect option selection logic was moved from onMouseDown to onClick.
* **Context**: A trackpad tap-to-click gesture was not reliably registering as a selection due to how OS/browser combinations synthesize mousedown vs click events when preventDefault() is involved. 
* **Why**: The click event is guaranteed to fire consistently across physical mouse clicks, trackpad taps, and touchscreen taps. The onMouseDown handler was retained solely to call e.preventDefault(), which prevents the search input field from losing focus and prematurely closing the dropdown mid-interaction.
* **Note**: This is a shared component, so this fix automatically applies to every searchable dropdown in the application (including Acts & Sections, Major/Minor Heads, and standard Select fields).
* **Relevant Code**: frontend/src/components/forms/SearchableSelect.jsx

### Acts & Sections Search Input Fix
* **Decision**: Stopped clearing the selected Act (and its dependent Sections dropdown) on every unmatching keystroke in the ActsSectionsTable.jsx 'Add Acts & Section' modal.
* **Context**: The onChange handler was aggressively resetting the selected newAct the instant the user typed something that didn't exactly match the current selection, which prematurely disabled and emptied the Sections dropdown even if the user was just typing a valid search string to find a new Act.
* **Why**: The field should only change its actual selection when the user clicks a suggestion, or deliberately clears the field entirely. The user's keystrokes should only filter the dropdown list. To avoid stranding unselected text if the user clicks away, the actSearchInput is cleanly reset to the current newAct when the dropdown closes (!actDropdownOpen), sidestepping any stale closure issues with the onBlur timeout.
* **Relevant Code**: frontend/src/components/forms/ActsSectionsTable.jsx

### Act Suggestion Click Race Condition Fix
* **Decision**: Added `onMouseDown={(e) => e.preventDefault()}` to the Act suggestion dropdown options in `ActsSectionsTable.jsx`.
* **Context**: Clicking or tapping an Act suggestion could fail to select it and blank the search field instead. This was a focus/blur race condition where a trackpad tap's click event could arrive after the input's 200ms blur-close timer had already unmounted the dropdown list, causing the selection to be lost. The recently added `useEffect` would then correctly (but unexpectedly) re-sync the input to the empty `newAct`, blanking the field.
* **Why**: Preventing the option's mousedown from blurring the input entirely removes the race condition. The blur timer never starts, so the dropdown stays open until the click event successfully fires and closes it explicitly. This matches the cross-device input reliability pattern already used in `SearchableSelect.jsx`.
* **Relevant Code**: frontend/src/components/forms/ActsSectionsTable.jsx

### Age Panel Synchronization
* **Decision**: Standardized Age (Year) and Year of Birth linking across all four person types (Complainant, Victim, Accused, Arrested) so they sync in both directions.
* **Context**: Previously, only Complainant fully synchronized edits between Year of Birth and Age (Year). Victim and Accused correctly derived Birth Year from Age, but failed to derive Age from Birth Year. Arrested had a bug where editing Age actively cleared out the Date of Birth field.
* **Why**: Age (Year) and Year of Birth carry identical information, so they must stay perfectly in sync regardless of which one the user edits. Date of Birth is intentionally never auto-filled or auto-cleared by these fields because the exact day cannot be recovered from just an age. Age (Month) remains a one-way display value with no reverse effect.
* **Relevant Code**: `frontend/src/components/forms/DynamicForm.jsx` (handlers for Victim, Accused, Arrested).

### Age Panel Synchronization Update
* **Decision**: Age (Year), Age (Month), and Year of Birth in the Age Panel are now read-only, computed fields for every person type (Complainant, Victim, Accused, Arrested). Date of Birth is the single source of truth.
* **Context**: Previously, the other three fields were independently editable, which allowed them to become out of sync with the actual Date of Birth on file if edited directly.
* **Why**: By making Date of Birth the sole editable field, editing it recalculates all three fields automatically. This removes the disconnected way of changing a person's age/birth year that bypassed the Date of Birth. If only an approximate age is known for a case (without an exact Date of Birth), it cannot be recorded via these fields anymore; this is a known and accepted trade-off to enforce data consistency.
* **Relevant Code**: `frontend/src/components/forms/DynamicForm.jsx` (Age Panel JSX and `rawField` definition).

### RC No. Input Filtering
* **Decision**: The RC No. field (`rc_no`, under CASE → Action Taken) now strictly accepts digits only during input.
* **Context**: The field was previously unfiltered because it lacked a rule in the frontend's keystroke-filtering layer. Letters or symbols could be typed into the field and were not rejected.
* **Why**: RC numbers are purely numeric in practice. Rather than relying on backend validation (which doesn't exist for these ID fields because they are used in ILIKE queries), we strip non-digit characters as they are typed, following the exact same pattern already established for GD No. (`gd_no`).
* **Relevant Code**: `frontend/src/utils/fieldValidation.js`

### SHO Approval Desk: Sortable & Filterable Record Date
* **Decision**: The Record Date column in the SHO Approval queue is now filterable (via a date picker icon) and sortable (by clicking the label). Both actions operate purely client-side on the already-loaded queue.
* **Context**: The queue relies on a full-fetch without pagination. Sorting and filtering logic (e.g. by record type or 'SENT_BACK' priority) already lived in the frontend.
* **Why**: The user recommended a dedicated Filter icon for date selection instead of a double-click on the header, to avoid hidden features, click-timing latency, and clear-state ambiguity. When date sorting is active, it overrides the default 'SENT_BACK' priority ordering, allowing all records to flow into chronological order (though sent-back records retain their rose highlight).
* **Relevant Code**: `frontend/src/pages/sho/Queue.jsx`

### UIDB & MISSING: General Information Panel Adjustments
* **Decision**: 
  1. The "Acts & Sections" panel (left side) is now hidden on UIDB records, while keeping the "Major / Minor Head" panel (right side) fully visible.
  2. The synthetic 'district' and 'police_station' fields in the MISSING and UIDB General Information tabs have been converted from read-only text fields to fully cascading, editable dropdowns.
* **Context**: 
  1. For UIDB, the `act_name` field triggered the joint `ActsSectionsTable` component. Removing `act_name` entirely from UIDB would have accidentally hidden the Major/Minor head panel because those fields are skipped in the main loop and only render through that combined component.
  2. District and Police Station were injected at runtime via `SYSTEM_FIELDS` in `useFormSchema.js` as read-only TEXT fields, which is why they didn't exist in the JSON configs.
* **Why**: 
  1. Unidentified Body records don't need Acts & Sections, but still require Major/Minor Head classification. Hiding just the left panel preserves the data model and avoids side effects.
  2. Bringing MISSING and UIDB forms in line with the established Delhi district→station cascading logic (like Occurrence PS on CASE) makes them properly interactive. The existing `EVENT_PS_KEYS` check was updated to also match the bare `police_station` key.
* **Relevant Code**: `frontend/src/components/forms/ActsSectionsTable.jsx`, `frontend/src/components/forms/FormSection.jsx`, `frontend/src/hooks/useFormSchema.js`, `frontend/src/components/forms/FieldRenderer.jsx`

### SHO Queue: Date Filter Picker
* **Decision**: Swapped the `DateField` component in the Queue filter popover for a plain, native `<input type="date">`.
* **Context**: The filter popover lives inside a table header, within an `overflow-x-auto` container. `DateField` leverages a zero-size, absolute-positioned hidden `input` to anchor the native OS calendar, which works fine in normal forms but breaks (calendar closes on month navigation, lost anchor) when deeply nested in this scrolled table header context.
* **Why**: Switching to a visible `<input type="date">` removes the hidden-anchor hack and allows the browser to properly anchor the calendar dropdown natively without losing its positioning context.
* **Relevant Code**: `frontend/src/pages/sho/Queue.jsx`

### UIDB: Full Removal of Major/Minor Head Panel
* **Decision**: Skipped rendering the `act_name` slot entirely for UIDB records, which in turn removes both the Acts & Sections panel and the Major/Minor Head panel from the General Information tab.
* **Context**: The Major/Minor Head panel shared the `ActsSectionsTable` component with Acts & Sections, which was previously only partially hidden for UIDB. Since both `major_heads` and `minor_heads` are configured as not-required (`validation_rules: { required: false }`), dropping their UI inputs does not break validation or block record submission.
* **Why**: Unidentified body records do not require crime categorization via Major/Minor Heads. While the backend configuration remains unchanged (the fields technically still belong to the record type), hiding the entire combined component provides a cleaner, more accurate UI.
* **Relevant Code**: `frontend/src/components/forms/FormSection.jsx`

### SHO Queue: Portaled React Date Picker
* **Decision**: Replaced the native `<input type="date">` in the SHO Queue filter with a custom, React-driven Date Picker (Month/Year dropdowns + Day grid) portaled directly to `document.body`.
* **Context**: The native OS date picker widget proved unreliable and couldn't complete the month-to-day selection flow inside the cramped, horizontally-scrolling table header popover. The new picker reuses the exact position-fixed, portal-to-body strategy already proven successful in `DateTimePickerPopup.jsx` for breaking out of `overflow: hidden` / scrolled containers.
* **Why**: By rendering completely outside the table's DOM hierarchy (`createPortal`) and positioning itself via `getBoundingClientRect()`, the picker becomes completely immune to the table's scrolling and clipping rules. Clicking a day immediately applies the filter and closes the picker without a separate "Done" step. Future dates are disabled.
* **Relevant Code**: `frontend/src/pages/sho/Queue.jsx`

### UIDB: Investigating Officer Tab Sort Order
* **Decision**: Added `io_id` to the custom in-memory sort remapping for UIDB's Investigating Officer tab, giving it `sort_order = 50.0`.
* **Context**: The backend dynamically clusters four IO fields (`io_name`, `io_rank`, `io_pis`, `io_mobile`) into the 50.1–50.4 range specifically for UIDB records to override their default registry orders and keep them grouped logically. The dropdown field (`io_id`) was omitted from this explicit list, leaving it to inherit its default `499` sort order from the registry, which erroneously pushed it to the bottom of the tab.
* **Why**: By injecting `io_id` into the explicit remap block at `50.0`, it correctly sorts to the very top of the IO tab, directly above the IO Name field. This is purely an in-memory runtime correction that doesn't affect the raw database configurations or other record types.
* **Relevant Code**: `backend/src/modules/fields/fields.controller.js`

### Investigating Officer: Auto-Fill and Read-Only Lock
* **Decision**: Selecting an IO in the `io_id` dropdown now automatically populates the four related fields (`io_name`, `io_rank`, `io_pis`, `io_mobile`) from the officer's master record. Concurrently, a bug in the generic form renderer that ignored `readonly: true` configs was fixed.
* **Context**: The IO section was designed to pull data from a curated roster (Investigating Officers page) rather than accepting free-text entry. However, the `io_id` dropdown's `onChange` handler didn't cascade the selected officer's details into the form state. Additionally, `FormSection.jsx` failed to evaluate the `readonly` flag in the field registry, leaving the explicitly read-only fields open to manual typing.
* **Why**: (a) In `fields.controller.js`, `name` was added to the lookup payload. (b) In `FieldRenderer.jsx`, an `isIoId` check intercepts the selection and pushes the officer's details to the form's `values` state. (c) In `FormSection.jsx`, `field.readonly === true || field.readonly === 'true'` is now respected, properly locking the auto-filled fields and preventing manual overrides.
* **Relevant Code**: `backend/src/modules/fields/fields.controller.js`, `frontend/src/components/forms/FieldRenderer.jsx`, `frontend/src/components/forms/FormSection.jsx`

### Unified Startup Scripts Synchronization
* **Decision**: Synchronized `start.bat`, `start-no-install.bat`, and `start.sh` so all environments execute the complete startup lifecycle: thorough port clearing (3000, 5000, 5173–5180), Docker container health verification, database migrations (`npm run db:migrate`), database seed (`npm run db:seed`), test dataset generation (`seed-test-data.js`), report presets seeding (`seed-report-presets.js`), template baseline synchronization (`template-regression.js baseline`), Python worker with `py` launcher fallback, and correct backend URL references (`http://localhost:3000`).
* **Context**: Discrepancies between Windows and bash startup scripts resulted in missed preset seeds or port collisions during repeated development restarts.
* **Why**: Ensures uniform execution, reproducible test states, and seamless service orchestration across Windows and Linux environments.
* **Relevant Code**: `start.bat`, `start-no-install.bat`, `start.sh`

### Configuration Reference Data Git Tracking
* **Decision**: Whitelisted `!config/ref-data/*` and `!golden_dataset/*` in `.gitignore` to ensure statutory CSV datasets (`ps_manual_fir_codes.csv`, `ps_unified_codes.csv`, `district_codes.csv`) are tracked in source control.
* **Context**: A blanket `*.csv` rule in `.gitignore` prevented mandatory reference datasets from being committed. Pulling the repository on fresh systems triggered startup crashes in `seed-statutory-fir-codes.mjs` during the boot autoload sequence.
* **Why**: Mandatory reference datasets required by `runStartupAutoload()` must be bundled with the codebase to prevent fresh clones and other developer environments from crashing on backend boot.
* **Relevant Code**: `.gitignore`, `backend/scripts/seed-statutory-fir-codes.mjs`, `backend/src/bootstrap/autoload.js`

### Merged origin/testing/vaibhav (7 remote commits) — reconciled a UIDB/MISSING routing regression
* **Decision**: Pulled 7 commits pushed to `origin/testing/vaibhav` by collaborator Vaibhav (Associated FIR Number display, location-FK unlinking before delete, MISSING/UIDB social_category/education/financial_status removal, SHO allowed in `sent_back.submit`, Linked Records panel auto-navigation, and a `general_info` rendering change for UIDB). One of those 7 commits (`fix(uidb): render full general_info section...`) was reverted in part immediately after merging, because it collided with same-day local work: it made `general_info` route through `renderArrestGeneralInfoStep` (the CASE/ARREST-specific hardcoded renderer) for every record type, and hardcoded `ActsSectionsTable`'s `localHeadLayout` to `'split'` unconditionally.
* **Context**: `renderArrestGeneralInfoStep` only renders a fixed handful of fields (Record UID, District, Police Station as plain read-only text, Case Type, GD Number). Routing UIDB/MISSING/PCR_CALL through it — instead of their existing generic `FormSection` fallback — would have silently dropped every other `general_info`-section field those types actually have (`uidb_no` for UIDB; `source`, `missing_type`, `operator_name`, `case_registered`, `missing_fir_no`, `missing_fir_date` for MISSING), reverted District/Police Station back to non-functional read-only text (undoing the same-day cascading-dropdown fix), and reintroduced the Acts & Sections and Major/Minor Head panels on UIDB that were explicitly removed earlier the same day.
* **Why**: Kept the `general_info: renderArrestGeneralInfoStep` mapping conditional on `recordType === 'CASE' || recordType === 'ARREST'` (restored to its pre-merge form) and restored `localHeadLayout={recordType === 'UIDB' ? 'hidden' : 'split'}` in that same function. Every other change from the 7 merged commits was kept as-is — this was the only hunk that needed correcting. A safety branch of the pre-merge state was created first: `backup/pre-vaibhav-pull-20260924`.
* **Relevant Code**: `frontend/src/components/forms/DynamicForm.jsx` (SECTION_RENDERERS map and `renderArrestGeneralInfoStep`)

### Backend Startup Crash — Missing Migration for Two Field Registry Columns
* **Decision**: Added migration `20260924120000_add_supplementary_chargesheet_and_inquest_status.js`, creating `fir_details.supplementary_chargesheet_details` (text) and `uidb_details.inquest_status` (varchar(50)).
* **Context**: The backend's startup autoload (`runStartupAutoload()` in `backend/src/bootstrap/autoload.js`) runs `sync-config`, which validates every `field_registry` entry's `storage.table`/`storage.column` against the live database schema (`backend/scripts/lib/sync-config-core.mjs`, `validateStorage()`) and fails loudly if any are missing. `config/fields/case.json`'s `supplementary_chargesheet_details` (shown only when `case_status = SUPPLEMENTARY CHARGESHEET`) and `config/fields/uidb.json`'s `inquest_status` (Inquest Status dropdown) both declared storage columns that no migration had ever created — confirmed by grepping every file under `backend/migrations/` for both column names with zero matches. This crashed the backend at boot with `sync-config FAILED: storage validation: ... does not exist` and prevented `start.bat`'s backend window from starting at all.
* **Why**: This was a genuine config/schema drift (someone added the field_registry entries without a matching migration), not a `start.bat` sequencing problem — `start.bat` already runs `npm run db:migrate` before launching the backend. The new migration is idempotent (`hasColumn` guard, matching the style of `20260917000001_add_cause_of_death_other.js`) and additive only; running `npm run db:migrate` (or just re-running `start.bat`) picks it up automatically.
* **Relevant Code**: `backend/migrations/20260924120000_add_supplementary_chargesheet_and_inquest_status.js`, `config/fields/case.json`, `config/fields/uidb.json`, `backend/scripts/lib/sync-config-core.mjs`

### start.bat — Surface Python Worker pip Install Failures
* **Decision**: Removed the `--quiet >nul 2>&1` suppression around `pip install -r requirements.txt` in `start.bat`'s Python worker step, and added an explicit warning block when the install's exit code is non-zero.
* **Context**: The user reported the Python report worker crashing with `ModuleNotFoundError: No module named 'pika'`, even though `pika` is correctly listed in `python_worker/requirements.txt` and `start.bat` already attempts to install it before launching `main.py`. Because the install command's output and exit code were both discarded (`--quiet` plus redirecting stdout/stderr to `nul`), a failed `pip install` (for example `weasyprint`, which needs the GTK3 runtime libraries on Windows and is a known source of native-build failures) would silently leave the whole requirements file uninstalled, and the worker window would then fail with a confusing `ModuleNotFoundError` instead of a clear install error.
* **Why**: Now `pip install` output prints to the console as it runs, and a failed install prints a clear `[WARNING]` explaining that the worker will likely fail to start and pointing at the GTK3/weasyprint dependency as the most likely cause, so the actual failure is visible instead of hidden. The rest of startup (frontend/backend) is unaffected either way, since the report worker is a secondary process.
* **Relevant Code**: `start.bat`

