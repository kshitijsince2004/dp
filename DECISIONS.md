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
