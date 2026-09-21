# Architectural Decisions & Technical Memory (DECISIONS.md)

## Instructions for Future AI Agents & Developers (MANDATORY STANDING DISCIPLINE)
- **STANDING REQUIREMENT**: Any future change to report classification logic, sheet inventory, formula behavior, or report architecture in this module MUST add a corresponding entry to `DECISIONS.md`, and MUST update `FLOW.md` if the data flow or sheet structure changes — **before the change is considered complete, as part of the same commit/PR**. This is a strict requirement for every change.
- **Read `DECISIONS.md`** before making meaningful architectural changes.
- **Read relevant `FLOW.md` sections** before modifying important execution paths.
- **Verify documentation against actual source code**: Source code is the primary source of truth. Existing documentation is evidence, not authority.
- **Do not assume documentation is correct**: Always verify against the current implementation.
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

---

## 7. Report Module: Out-of-Scope Guardrail for Fortnightly Diary (FN Diary)

### Decision
The Fortnightly Diary (`backend/src/modules/report-engine/fn/`, `stat-01` through `stat-41`, and cron schedulers) is strictly **OUT OF SCOPE** for Station Daily Diary, District Diary, and PHQ Diary refactor passes. No files under `backend/src/modules/report-engine/fn/` are to be modified or audited during Daily/District/PHQ passes.

### Rationale & Context
The Fortnightly Diary operates on distinct fortnight window boundaries (1st-15th, 16th-end-of-month) and has its own statutory reporting cycle. Bundling changes across both modules risks introducing regressions into statutory fortnightly submissions.

### Relevant Code
- `backend/src/modules/report-engine/fn/` (Untouched)

### Confidence
High. Confirmed boundary constraint.

---

## 8. Report Module: Variation % Mathematical Handling & Detection Formula Standardization

### Decision
All variation % and detection % calculations across Station Daily Diary, District Diary, and PHQ Diary are standardized to the following rules:
- **Variation % Formula**: `((curr - prev) / prev) * 100`
  - When `prev == 0 && curr > 0`: Returns `Infinity` (formatted as `"+∞"`).
  - When `prev == 0 && curr == 0`: Returns `null` (formatted as `"-"`).
  - When `prev > 0 && curr == 0`: Returns `-100.0` (formatted as `"-100.0%"`).
  - Normal case: Formatted as signed float e.g. `"+12.5%"` or `"-5.2%"`.
- **Detection % Formula**: `(solved / reported) * 100`
  - When `reported == 0`: Formatted as `"-"` (not `0.0%` or `NaN%`).

### Grounding & Evidence
- [`backend/src/modules/report-engine/shared/calc.js:L1-30`](file:///d:/DPI/FIR/pharos-prototype/backend/src/modules/report-engine/shared/calc.js#L1-L30)
- [`backend/src/modules/phq-diary/phq-diary.calc.js:L24-45`](file:///d:/DPI/FIR/pharos-prototype/backend/src/modules/phq-diary/phq-diary.calc.js#L24-L45)
- [`backend/tests/verify_formulas.mjs:L10-45`](file:///d:/DPI/FIR/pharos-prototype/backend/tests/verify_formulas.mjs#L10-L45)

### Files Touched
- `backend/src/modules/report-engine/shared/calc.js`
- `backend/src/modules/phq-diary/phq-diary.calc.js`
- `backend/tests/verify_formulas.mjs`
- `backend/tests/test_phq_comprehensive.mjs`

### Confidence
High. Verified with unit test suite passing.

---

## 9. Report Module: Single Relational Authority (`fir_details.local_head_id`) & Classification Filters

### Decision
- **Single Source of Truth for Case Statistics**: The primary classification key for statistical counting is strictly `fir_details.local_head_id` (joined 1:1 with `ref.local_heads.local_head_cd`).
- **Role of `record_offences`**: The repeater table `record_offences` is used solely for section string aggregation (`STRING_AGG(section_name, ', ')`) in detail listings and MUST NEVER be joined for headcount aggregation to prevent Cartesian explosion and duplicate case counts.
- **Crime Head Filter Corrections**:
  - `HOUSE_THEFT`: Filtered strictly by code `18` (`ref.local_heads.local_head_cd = 18`). Code `15` is `Abduction`.
  - `MISC_THEFT` / `OTHER_THEFT`: Filtered by the full MISC_THEFT code set `[17, 19, 20, 21, 22, 23, 24, 25, 26, 27, 28, 208]`.
  - `FINANCIAL_FRAUD`: Filtered by codes `38` (Cheating), `39` (Forgery), and `127` (IT Act). POCSO (`205`) is strictly excluded.

### Grounding & Evidence
- `ref.local_heads` live query confirmed `local_head_cd = 18` is 'House Theft', `15` is 'Abduction', `205` is 'POCSO Act 2012'.
- [`backend/src/modules/report-engine/shared/canonical-codes.js:L26-35`](file:///d:/DPI/FIR/pharos-prototype/backend/src/modules/report-engine/shared/canonical-codes.js#L26-L35)
- [`python_worker/classifiers.py:L17-38`](file:///d:/DPI/FIR/pharos-prototype/python_worker/classifiers.py#L17-L38)

### Files Touched
- `backend/src/modules/report-engine/shared/canonical-codes.js`
- `python_worker/classifiers.py`

### Confidence
High.

---

## 10. Report Module: E-FIR Bare-vs-Qualified Naming Rule

### Decision
- **Bare "E-FIR"**: Represents all electronic FIRs, combining both `E_THEFT` and `E_MVT` source systems (`source_system IN ('E_THEFT', 'E_MVT')`).
- **Qualified Titles** (e.g. "E-FIR Theft", "E-FIR MV Theft", "E-Burglary"): Strictly filtered to their specific subtype only (`source_system = 'E_MVT'` or `local_head_cd IN (12, 13, 209, 210)`).

### Grounding & Evidence
- [`backend/src/modules/report-engine/district/renderers/efir-matrix.js:L1-50`](file:///d:/DPI/FIR/pharos-prototype/backend/src/modules/report-engine/district/renderers/efir-matrix.js#L1-L50)
- [`python_worker/classifiers.py:L20-46`](file:///d:/DPI/FIR/pharos-prototype/python_worker/classifiers.py#L20-L46)

### Files Touched
- `backend/src/modules/report-engine/district/renderers/efir-matrix.js`
- `python_worker/classifiers.py`

### Confidence
High.

---

## 11. Report Module: Complete Removal of "For esakshya" Legacy Block

### Decision
The legacy "For esakshya" label and separate tracking block have been completely removed from `n123-register.js` and all other diary templates.

### Rationale
e-Sakshya mobile forensic evidence collection is an independent application workflow; retaining an unpopulated legacy block in the statutory daily diary caused visual clutter and audit confusion.

### Files Touched
- `backend/src/modules/report-engine/district/renderers/n123-register.js`

### Confidence
High. Re-verified absence across all renderers.

---

## 12. Report Module: Daily Diary 24-Sheet Inventory & Permanent Removal of Sheet 06

### Decision
- **Permanent Removal of Sheet 06 (`sheet_06_arrested_all_heads.py`)**: Reverses prior temporary re-enablement. Sheet 06 (arrest breakdown by IPC section numbers) is permanently removed from the active Daily Diary pipeline and unregistered from `python_worker/generator.py` and `backend/src/modules/reports/reports.controller.js`. The deprecated file is moved to `python_worker/deprecated/sheet_06_arrested_all_heads.py` for reference.
- **Active Daily Diary Inventory**: Exactly **24 active sheets** are registered and generated (Sheets 01, 02, 03, 04, 05, 07, 08, 09, 10, 11, 13, 14, 15, 16, 18, 19, 20, 21, 22, 23, 25, 26, 28, 29).
- **Sheet 29 (`excel_29arrest_count_summary` / `sheet_29_arrest_count_summary.py`)**: Remains fully active as the official Police Station vs Crime Category Arrest Matrix.
- **Dormant Sheets Re-enabled**: Sheet 11 (Proclaimed Offenders), Sheet 22 (Women Missing), Sheet 23 (Children Missing), and Sheet 29 (Arrest Count Summary) are live and active.

### Grounding & Evidence
- `python_worker/registry.py` loads exactly 24 active sheets.
- `python_worker/generator.py` `TEMPLATE_TO_TABLE_NAMES['daily-diary']` maps 24 tables without `excel_6arrested_all_heads`.
- `backend/src/modules/reports/reports.controller.js` maps `dd-arrest-count-summary` (Sheet 29).

### Files Touched
- `python_worker/sheets/sheet_06_arrested_all_heads.py` (Moved to `python_worker/deprecated/`)
- `python_worker/generator.py`
- `backend/src/modules/reports/reports.controller.js`

### Confidence
High. Verified via Python registry execution.

---

## 13. Report Module: Reclassification of BNS 111 (Organized Crime) & BNS 113 (Terrorist Acts) to TOTAL ACT

### Decision
BNS 111 (`ORGANISED_CRIME`, `local_head_cd = 57`) and BNS 113 (`TERRORIST_ACT`, `local_head_cd = 58`) are statutory penal offenses under the Bharatiya Nyaya Sanhita, but under police reporting taxonomy they are classified under **`TOTAL ACT`** (`crime_category = 'OTHER'`), each as its own distinct line item, rather than under Heinous (closed 7 heads) or Non-Heinous.
- **G-22 Daily Crime**: Moved from Quadrant 1 (Heinous) to Quadrant 4 (Acts & Special Laws).
- **N-1/2/3 Register & D1 Resolution**: Assigned `isAct: true`, rolling into `sums.act` and `sums.grand`, preserving the invariant `TOTAL IPC (Heinous + Non-Heinous) + TOTAL ACT = GRAND TOTAL`.
- **PHQ Diary**: Added to `LSL_ROWS` in `phq-diary.config.js`.

### Grounding & Evidence
- `ref.local_heads` migration `20260816000001` assigns `local_head_cd = 57` -> `ORGANISED_CRIME` and `58` -> `TERRORIST_ACT`.
- [`backend/src/modules/report-engine/district/renderers/n123-register.js:L33-58`](file:///d:/DPI/FIR/pharos-prototype/backend/src/modules/report-engine/district/renderers/n123-register.js#L33-L58)
- [`backend/src/modules/report-engine/district/renderers/g22-daily.js:L85-102`](file:///d:/DPI/FIR/pharos-prototype/backend/src/modules/report-engine/district/renderers/g22-daily.js#L85-L102)
- [`backend/src/modules/report-engine/district/renderers/d1-resolution.js:L38-58`](file:///d:/DPI/FIR/pharos-prototype/backend/src/modules/report-engine/district/renderers/d1-resolution.js#L38-L58)

### Files Touched
- `backend/src/modules/report-engine/district/renderers/n123-register.js`
- `backend/src/modules/report-engine/district/renderers/d1-resolution.js`
- `backend/src/modules/report-engine/district/renderers/g22-daily.js`
- `backend/src/modules/report-engine/district/renderers/daily-chart.js`
- `backend/src/modules/phq-diary/phq-diary.config.js`

### Confidence
High.

---

## 14. Report Module: D-2 Heinous Brief Facts Scope (Exact 7 Statutory Heinous Heads)

### Decision
The filter array for D-2 Heinous Brief Facts (`D2_BRIEF_FACTS_CODES` in `detail-fetcher.js`) is consolidated to use the shared `HEINOUS_CANONICAL_CODES` constant from `canonical-codes.js`, strictly containing the 7 statutory Heinous canonical codes:
`['DACOITY', 'MURDER', 'ATT_TO_MURDER', 'ROBBERY', 'RIOT', 'KID_FOR_RANSOM', 'RAPE']`.
- POCSO (`POCSO`) and ordinary Kidnapping (`KIDNAPPING`) are strictly excluded.
- Riot (`RIOT`) and Attempt to Murder (`ATT_TO_MURDER`) are included.

### Grounding & Evidence
- [`backend/src/modules/report-engine/shared/canonical-codes.js:L1-10`](file:///d:/DPI/FIR/pharos-prototype/backend/src/modules/report-engine/shared/canonical-codes.js#L1-L10)
- [`backend/src/modules/report-engine/district/detail-fetcher.js:L1-15`](file:///d:/DPI/FIR/pharos-prototype/backend/src/modules/report-engine/district/detail-fetcher.js#L1-L15)

### Files Touched
- `backend/src/modules/report-engine/shared/canonical-codes.js`
- `backend/src/modules/report-engine/district/detail-fetcher.js`
- `backend/src/modules/report-engine/district/renderers/daily-chart.js`
- `backend/src/modules/report-engine/district/renderers/d1-resolution.js`

### Confidence
High.

---

## 15. Report Module: Unified HTML/PDF Rendering Architecture for District Diary & PHQ Diary

### Decision
District Diary and PHQ Diary export pipelines now provide full HTML/PDF generation using a shared data-fetching model and unified HTML renderer (`report-html-renderer.js`):
- **Shared Data Layer**: Data fetching and precomputed aggregations are executed once by `district-diary.service.js` or `phq-diary.service.js`. The resulting calculation payload is passed identically to either ExcelJS (for `.xlsx`) or `report-html-renderer.js` (for `.pdf` and `.html`), preventing calculation drift.
- **Styling & Layout**: Implements unified A4 landscape `@page` layout, official police header hierarchy, and print-color preservation.
- **Rendering Engine**: Uses Puppeteer headless rendering with robust execution fallbacks.

### Grounding & Evidence
- [`backend/src/modules/report-engine/shared/report-html-renderer.js`](file:///d:/DPI/FIR/pharos-prototype/backend/src/modules/report-engine/shared/report-html-renderer.js)
- [`backend/src/modules/report-engine/district/district-diary.service.js:L205-210`](file:///d:/DPI/FIR/pharos-prototype/backend/src/modules/report-engine/district/district-diary.service.js#L205-L210)
- [`backend/src/modules/phq-diary/phq-diary.service.js:L61-65`](file:///d:/DPI/FIR/pharos-prototype/backend/src/modules/phq-diary/phq-diary.service.js#L61-L65)

### Files Touched
- `backend/src/modules/report-engine/shared/report-html-renderer.js` (Created)
- `backend/src/modules/report-engine/district/district-diary.service.js`
- `backend/src/modules/phq-diary/phq-diary.service.js`
- `backend/src/modules/report-engine/report-engine.service.js`
- `backend/src/modules/reports/reports.controller.js`

### Confidence
High.

---

## 16. Analytics Suite: Specialized Operational Command Architecture & Entity Logic

### Decision
The PHAROS analytics and dashboard engines are redesigned to enforce rigorous police operational and legal entity boundaries across all hierarchy levels (PS, Sub-Division, District, HQ):
1. **Arrest Scope Isolation**:
   - Criminal Arrests occur strictly in **FIRs (Criminal Cases)**.
   - Preventive Custody occurs strictly in **Kalandras (107/151 CrPC / BNSS, 110 CrPC, DP Act)**.
   - Non-criminal records (**PCR Emergency Calls**, **Missing Persons Inquiries**, and **UIDB Inquests**) are strictly classified as **Citizen Services & Inquests**, eliminating conflation with arrest figures.
2. **Interactive Left-Out Accused Navigation**:
   - `computeLeftOutAccused` in `analytics.controller.js` now delivers `record_id` and `case_id`.
   - The frontend Left Out Accused component renders each suspect as an actionable item that navigates directly to `/records/:record_id` (the Case Detail view).
3. **Specialized Command Domains Added**:
   - **Property & Economic Recovery** (`GET /api/v1/analytics/property-recovery`): Stolen vs Recovered valuation (₹ INR), Recovery %, and category tracking (MVT, Jewelry, Cash, Electronics, Arms).
   - **Investigation Pipeline & IO Workload** (`GET /api/v1/analytics/investigation-disposal`): Case status funnel (Pending, Charge Sheet, Untraced, Cancelled), Charge-Sheet Rate %, and IO workload breakdown.
   - **Citizen Safety & Tracing** (`GET /api/v1/analytics/community-safety`): PCR call disposition, Missing Children & Adult tracing (*Operation Muskaan*), and UIDB identification rate.
   - **Beat & Preventive Intelligence** (`GET /api/v1/analytics/beat-preventive`): Beat-level crime density and preventive enforcement distribution.

### Grounding & Evidence
- [`backend/src/modules/analytics/analytics.controller.js`](file:///d:/DPI/FIR/pharos-prototype/backend/src/modules/analytics/analytics.controller.js)
- [`backend/src/modules/analytics/analytics.router.js`](file:///d:/DPI/FIR/pharos-prototype/backend/src/modules/analytics/analytics.router.js)
- [`frontend/src/pages/hc/Dashboard.jsx`](file:///d:/DPI/FIR/pharos-prototype/frontend/src/pages/hc/Dashboard.jsx)
- [`frontend/src/pages/analytics/AnalyticsDashboard.jsx`](file:///d:/DPI/FIR/pharos-prototype/frontend/src/pages/analytics/AnalyticsDashboard.jsx)
- [`frontend/src/components/common/CrimeHeadMatrixTable.jsx`](file:///d:/DPI/FIR/pharos-prototype/frontend/src/components/common/CrimeHeadMatrixTable.jsx)
- [`frontend/src/components/analytics/PropertyRecoveryCard.jsx`](file:///d:/DPI/FIR/pharos-prototype/frontend/src/components/analytics/PropertyRecoveryCard.jsx)
- [`frontend/src/components/analytics/InvestigationDisposalCard.jsx`](file:///d:/DPI/FIR/pharos-prototype/frontend/src/components/analytics/InvestigationDisposalCard.jsx)
- [`frontend/src/components/analytics/CommunitySafetyCard.jsx`](file:///d:/DPI/FIR/pharos-prototype/frontend/src/components/analytics/CommunitySafetyCard.jsx)
- [`frontend/src/components/analytics/BeatPreventiveCard.jsx`](file:///d:/DPI/FIR/pharos-prototype/frontend/src/components/analytics/BeatPreventiveCard.jsx)

### Files Touched
- `backend/src/modules/analytics/analytics.controller.js`
- `backend/src/modules/analytics/analytics.router.js`
- `frontend/src/pages/hc/Dashboard.jsx`
- `frontend/src/pages/analytics/AnalyticsDashboard.jsx`
- `frontend/src/components/common/CrimeHeadMatrixTable.jsx`
- `frontend/src/components/analytics/PropertyRecoveryCard.jsx` (Created)
- `frontend/src/components/analytics/InvestigationDisposalCard.jsx` (Created)
- `frontend/src/components/analytics/CommunitySafetyCard.jsx` (Created)
- `frontend/src/components/analytics/BeatPreventiveCard.jsx` (Created)

### Confidence
High.

---


## Decision: Audit Trail / Field Revision Log � Root-Cause Fix (2026-09-20)

### Problem
The "Audit Trail & Field Revision Log" panel in RecordDetail.jsx displayed incorrect content:
1. **Unchanged-field noise**: Revision entries contained many Before/After rows where both values were identical (e.g. date_of_arrest: "" ? ""), making the log unreadable.
2. **CREATE entry shown as revision**: The initial record-creation entry (change_type=CREATE, evision_number=1) was visible in the "edit revisions" list, showing hundreds of intake fields as "changed from nothing".
3. **Phantom null?"" diffs**: Fields stored as 
ull in the old snapshot but recomposed as '' in the new snapshot appeared as changes.

### Root Cause
The diff in updateRecord (records.service.js line ~1779) was:
`calculateDiff(oldFlatData, { ...newFlatData, ...data })`
Spreading raw client `data` over `newFlatData` injected frontend-sync alias keys (e.g. `date_of_arrest`, `time_of_arrest`, `place_of_arrest`, `uid` as raw UUID) that do NOT exist in the field_registry for that record type. The old snapshot (recomposed) lacked these keys, so they always diffed as undefined?'', creating phantom change rows. Additionally, the frontend rendered from the unfiltered `revisions` array despite the count badge using `editRevisions`.

### Fix
1. **backend/src/modules/records/records.service.js** � `calculateDiff` now receives `newFlatData` directly (the post-save recomposed state) instead of `{ ...newFlatData, ...data }`. Only registry-authoritative keys participate in the diff.
2. **backend/src/modules/records/records.service.js** � `calculateDiff` internal normaliser treats `null`, `undefined`, and `''` as equivalent empty values, preventing null?"" phantom diffs.
3. **frontend/src/pages/sho/RecordDetail.jsx** � Revision list now renders from `editRevisions` (filtered, no CREATE entries) matching the count badge. Per-revision field_changes are also filtered client-side for old?old value rows, providing a safety net for historical revisions already in the DB.

### Impact Scope
Affects all record types that use `updateRecord` (CASE, ARREST, PROPERTY, MISSING, PCR). The fix is additive; the hash chain in `record_revisions` is preserved � existing revisions are not modified; only new writes and the UI rendering are corrected.

### Grounding & Evidence
- `backend/src/modules/records/records.service.js` (calculateDiff, updateRecord)
- `frontend/src/pages/sho/RecordDetail.jsx` (revision log render block)
- `backend/scratch/test_calculate_diff.mjs` (7 unit tests, all PASS)
- `backend/scratch/check_duplicate_fields.mjs` (confirmed arrest_date/time/place only in ARREST registry, not CASE)

### Confidence
High.

---

---

## 2026-09-20 — Refinement of Station Daily Diary Cell Content & Formatting Specification (Row 5 Hand-Annotations)

### Context & Goal
The user provided `Daily_Diary.xlsx` containing hand-annotated cell specifications in row 5 across all sheets. This pass replaces earlier less-precise column descriptions in `REPORT_COLUMN_SPECIFICATION.md` and `DECISIONS.md` with these verbatim row-5 annotations as the single authoritative specification for the Station Daily Diary report engine.

### Decisions & Conventions Adopted
1. **Template Safety Discipline (Part 0 Rule)**:
   - Hand-annotated reference workbooks containing instruction rows (row 5) must never be exported to end users.
   - The generation engine (`python_worker/builder.py`) executes `ws.delete_rows(5, ws.max_row - 4)` upon opening any template file. In addition, `python_worker/templates/Daily_Diary_16Jul2026_AllStations.xlsx` has been permanently stripped of row-5 sample data to guarantee zero leak of spec text.

2. **Refined Shared Conventions (Part 2)**:
   - **2a Person Detail Template**: `{Name} "@" {Alias}, S/O {Parent} R/O {Address}`. If no alias, the `@ alias` segment is omitted. For Arrestee specifically, inline age is inserted: `{Name} "@" {Alias}, {Age}, S/O {Parent} R/O {Address}`.
   - **2b Date & Time of Occurrence**: `DD/MM/YYYY; HH:MM` (semicolon before time).
   - **2c Place of Occurrence / Address**: Full compiled address joining all structured fields (House No., Street, Colony, Village/City, Tehsil, Landmark, District, State, Pincode).
   - **2d Missing Person Address Override**: Narrower present-address-only field set (`Present House No., Present Street, Present Colony, Present Village/City/Town, Present State, Present District, Present Pin Code`), explicitly excluding Landmark, Tehsil, Country, and not falling back to permanent address.
   - **2e Custody Status**: 8 distinct normalized values: `judicial custody / police custody / bail / bound down / release / lockup / 35(3) / apprehension`.
   - **2f Accused History**: Combined `PI/PO/BC` joined by `/` in exact fixed order (PI = previous involvement, PO = proclaimed offender, BC = bad character).
   - **2g Recovery**: `Property category, property type, property description, property value` comma-joined per item.
   - **2h Body Description**: Joins all non-empty physical description fields with commas.
   - **2i Vehicle Details**: `Type of property/Vehicle, Vehicle registration No.`.
   - **2j U/S (Act + Section)**: All Acts and Sections cited, concatenated.
   - **2k IO Detail**: `Rank, Name, PIS No.` comma-joined.
   - **2l Arrest Scheme**: Single-select dropdown value.

3. **Multi-Value Cell Strategy (Part 3)**:
   - For cells holding multiple distinct people or property items, entries render on separate lines within the cell: `1) ... \n 2) ...`.
   - Applied to Sheet 1 Arrested Person column, multi-item recovery, and vehicle details, keeping parallel columns aligned. One-row-per-person sheets (Sheets 6-8, 11, Arrested-District) maintain single-person rows.

4. **Ambiguity Resolutions (Part 5)**:
   - **5a (Inquest Deceased Relation)**: Replaced hardcoded "W/O" with dynamic relation prefix (`S/O`, `D/O`, `W/O`, `H/O`, `C/O`) derived from `relation_type` and gender.
   - **5b (Inquest Disposal Date)**: Standardized to `Date Filed by ACP/SDM` formatted as `DD/MM/YYYY`.
   - **5c (Goswara Summary Header)**: Preserved reference header spelling `TAOTAL ARREST IN Burglary E-FIR` for exact template compatibility.
   - **5d (Abandoned & Traced Address)**: Abandoned uses full compiled address (2c); Traced uses `"Name, Present Address"` format.

### Grounding & Code References
- `python_worker/formatters.py` (refined formatting utilities)
- `python_worker/builder.py` (row 5 template stripping logic)
- `python_worker/sheets/sheet_01_manual_fir.py` to `sheet_28_fir_goswara_summary.py`
- `PHAROS Report Column Specification — Daily Diary, District Diary, PHQ Diary.md`

### Confidence
High. Verification confirmed 100% clean report output across all 24 sheets with zero annotation leak.

---

## 2026-09-20: Schema Fixes Migration Audit & Verification

### Context
Independently verified every finding, foreign key, uniqueness constraint, check constraint, and structural observation in schema_fixes_migration.sql against the live PostgreSQL database and application codebase before executing any DDL.

### Verification Results & Actions Taken

#### 1. Foreign Keys Added (A1–A28) — 100% Verified
All 28 proposed foreign keys passed live pre-flight orphan checks with **0 orphans** and were successfully applied to the database:
- k_beats_ps: 
ef.beats(ps_id) -> hierarchy_nodes(id)
- k_ps_manual_fir_codes_node: 
ef.ps_manual_fir_codes(hierarchy_node_id) -> hierarchy_nodes(id)
- k_ps_unified_codes_node: 
ef.ps_unified_codes(hierarchy_node_id) -> hierarchy_nodes(id)
- k_fir_details_local_head: ir_details(local_head_id) -> ref.local_heads(local_head_cd)
- k_arrest_details_local_head: rrest_details(local_head_id) -> ref.local_heads(local_head_cd)
- k_uidb_details_local_head: uidb_details(local_head_id) -> ref.local_heads(local_head_cd)
- k_fir_details_beat: ir_details(beat_id) -> ref.beats(beat_cd)
- k_arrest_details_beat: rrest_details(beat_id) -> ref.beats(beat_cd)
- k_fir_details_transfer_agency: ir_details(transferred_to_agency_id) -> ref.agencies(id)
- k_fir_details_burglary_mo: ir_details(burglary_mo_cd) -> ref.burglary_mo(mo_cd)
- k_record_offences_act: 
ecord_offences(act_id) -> ref.acts(act_cd)
- k_record_offences_section: 
ecord_offences(section_id) -> ref.sections(section_code)
- k_record_offences_major_head: 
ecord_offences(major_head_id) -> ref.major_heads(major_head_code)
- k_record_offences_minor_head: 
ecord_offences(minor_head_id) -> ref.minor_heads(minor_head_cd)
- 13 
ecord_properties Category FKs (k_record_properties_major_cat, k_record_properties_minor_cat, k_record_properties_automobile, k_record_properties_fire_arm, k_record_properties_arms_subtype, k_record_properties_arms_made, k_record_properties_jewelry, k_record_properties_currency, k_record_properties_document, k_record_properties_drug, k_record_properties_electric, k_record_properties_explosive, k_record_properties_cultural, k_record_properties_unit).

#### 2. Uniqueness Constraints Added (B1, B2, B4a, B4b, B5) & Blocked Item (B3)
- **Added**:
  - uq_ps_manual_fir_codes: 
ef.ps_manual_fir_codes(district_code, ps_code) (0 duplicates)
  - uq_ps_unified_codes: 
ef.ps_unified_codes(ps_code) (0 duplicates)
  - uq_users_username: users(username) (0 duplicates)
  - uq_users_badge_no: users(badge_no) (0 duplicates)
  - uq_hierarchy_nodes_type_code: hierarchy_nodes(node_type, code) (0 duplicates)
- **Blocked**:
  - uq_fir_details_fir_no: ir_details(fir_no) global UNIQUE constraint **BLOCKED**. Live query found 190 distinct duplicate ir_no values (e.g. 449 occurrences of FIR '008' across synthetic test cases in Parliament Street PS). Scoping by (district_code, ps_code, year, fir_no) or data deduplication is required as a separate follow-up.

#### 3. CHECK Constraints Added (C1–C3, 3b-1–3b-3) & Blocked Items
- **Added**:
  - chk_records_record_type: 
ecords(record_type IN ('CASE','ARREST','MISSING','UIDB','PCR_CALL'))
  - chk_persons_role: persons(role IN ('COMPLAINANT','ACCUSED','VICTIM','ARRESTEE','MISSING','DECEASED','INFORMANT','IO','MISSING_CHILD','CALLER'))
  - chk_local_heads_crime_category: 
ef.local_heads(crime_category IN ('HEINOUS','NON_HEINOUS','OTHER'))
  - chk_records_current_status: 
ecords(current_status IN ('SUBMITTED','COMPILED','DRAFT','APPROVED','HQ_RECEIVED','PENDING_SHO','SENT_BACK','DISTRICT_REVIEW'))
  - chk_records_current_level: 
ecords(current_level IN ('PS','HQ','DISTRICT'))
  - chk_records_source_system: 
ecords(source_system IS NULL OR source_system IN ('MANUAL','E_MVT','E_THEFT','NCRP'))
- **Blocked**:
  - rrest_details.custody_status: BLOCKED (contains formatting variations 'Notice 35(1) BNSS' vs 'Notice u/s 35(1) BNSS').
  - missing_details.missing_status: BLOCKED (contains mixed casing 'TRACED' vs 'Traced').
  - uidb_details.uidb_status: BLOCKED (contains mixed casing 'Unidentified' vs 'PENDING'/'IDENTIFIED').

#### 4. Structural Investigation Findings
- **
ef.sections Code Columns**:
  - section_code (text, PK): Primary canonical section key used across application UI and joins.
  - section_cd (varchar): Legacy numeric section code (populated in 11,685 rows).
  - ct_sec_cd (varchar): Legacy composite Act+Section code from source export (populated in all 17,207 rows).
- **ir_details.fir_ps_code**: Codebase search confirmed this is an intentional, immutable historical snapshot captured at FIR-number creation time by statutoryFir.service.js. It intentionally does not carry a live FK.
- **udit_logs.record_id**: Codebase search confirmed polymorphic design (paired with 	able_name) used to track audit events across 
ecords, persons, 
ecord_properties, etc. Intentionally does not carry a single-table FK.
- **ictim_injury_details**: Created in migration 20260818000010_missing_diary_fields.js to track casualty/injury severity fields (injury_severity, hospital_name, injury_type). Currently has 0 live rows.
- **stat_baselines & system_meta**: stat_baselines stores historical year baseline counts for PHQ Diary fallback logic. system_meta stores system configuration and reference data checksums.
- **Diagram Reconciliation**:
  - 
ecord_sections in ER_DIAGRAM.drawio was a stale draft name; 
ecord_offences is the live table.
  - 
ef_other_property_categories and 
ef_property_types do not exist live; 
ef.property_categories is the single live reference table.

---

## 2026-09-21: Phase 0 & Phase 1 — Ground Truth Finalization, Shared Formula Library (Layer 2) & Aggregation Service (Layer 1)

### 1. Part 0: FIR Number Duplication Resolution
- **Investigation**: Analyzed 190 duplicate bare `fir_no` values (e.g. `'008'`, `'001'`). Found that FIR numbers in Indian police station administration are per-Police-Station per-year sequential numbers (001, 002, 003...), not globally unique across distinct police stations.
- **Database Confirmation**: Live PostgreSQL database **already enforces** `CREATE UNIQUE INDEX fir_details_ps_id_fir_year_fir_no_key ON public.fir_details USING btree (ps_id, fir_year, fir_no)`.
- **Empirical Check**: Direct query on `fir_details(ps_id, fir_year, fir_no)` returned **0 duplicate collisions** across all 36,222 records.
- **Resolution**: The document-only static review proposal for a blanket `UNIQUE (fir_no)` was retired as invalid. The active composite constraint `fir_details_ps_id_fir_year_fir_no_key` is confirmed fully enforcing data integrity.

### 2. Part 1: Taxonomy Lock File & Enum Normalization
- Created `TAXONOMY_LOCK.md` locking all DB-enforced value sets (`records.record_type`, `records.current_status`, `records.current_level`, `records.source_system`, `persons.role`, `ref.local_heads.crime_category`).
- **Canonical Normalization Rules**:
  - `custody_status`: Collapses `'Notice u/s 35(1) BNSS'` -> `'Notice 35(1) BNSS'`. Both represent statutory notice in lieu of physical arrest.
  - `missing_status`: Case-folds `'Traced'` -> `'TRACED'`.
  - `uidb_status`: Case-folds `'Unidentified'` -> `'UNIDENTIFIED'`.

### 3. Layer 2: Formula Library (`python_worker/formula_library.py`)
- Standardized pure functions created and unit-tested:
  - `compute_variation(current, previous)`: Returns `"+∞"` for 0->positive, `"-"` for 0->0, else `((curr - prev)/prev)*100`.
  - `compute_detection(solved, reported)`: Returns `"-"` if reported=0, else `(solved/reported)*100`.
  - `person_display(person, options)`: Formats name, alias (`@ alias`), age, relation (`S/O`, `W/O`, `D/O`, `C/O`), and compiled address.
  - `address_compile(location, mode)`: Standardized address compiler (`full` vs `present_only`).
  - `io_display(officer)`: Formats `'Rank, Name, PIS No.'`.
  - `custody_status_display(val)`: Applies custody status normalization.
  - `missing_status_display(val)` & `uidb_status_display(val)`: Case-folds status values.
  - `accused_history(arrestee)`: Generates fixed order `"PI/PO/BC"` from involvement flags and counts.
  - `recovery_display(props)`: Formats property items ("Category, Type, Description, Value").
  - `scheme_of_arrest_display(arrest)`: Formats arrest scheme.
  - `body_description(person_desc)`: Comma-joins physical description fields.
  - `multi_value_cell(items, render_fn)`: Formats multi-item lists as numbered lines (`1) ... \n 2) ...`).

### 4. Layer 1: Classification & Aggregation Service (`python_worker/aggregation_service.py`)
- Single entry point `fetch_classified_counts(jurisdiction_level, jurisdiction_id, from_date, to_date, crime_head_selector, channel_filter)`.
- Classifies reported and worked-out counts across Heinous, Non-Heinous, and Act categories per `ref.local_heads`.
- **Case-Count Invariant**: Verified live — Category sum (`11,290 Heinous + 21,681 Non-Heinous + 3,251 Act = 36,222`) equals total DB CASE records (`36,222`) with **0 invariant gap**.

### 5. Unit Test Suite
- `tests/test_formula_library.py`: 9 unit tests passed cleanly.
- `tests/test_aggregation_service.py`: 5 unit tests passed cleanly.

### 6. BNS 111 & BNS 113 Taxonomy Gap Closed & Layer 2 Trace Fixes (2026-09-21)
- **BNS 111 / BNS 113 Taxonomy Rows**: Inserted local_head_cd `216` (`Organized Crime (BNS 111)`, canonical_code `ORGANIZED_CRIME_BNS_111`) and local_head_cd `217` (`Terrorist Acts (BNS 113)`, canonical_code `TERRORIST_ACTS_BNS_113`) into `ref.local_heads` with `crime_category = 'OTHER'` (Total Act). Satisfied database constraint `chk_local_heads_crime_category`.
- **BNS 111 / 113 Unit Test**: `test_bns_111_113_act_classification` updated to test live DB IDs `216` and `217` specifically, asserting both count strictly under Act subtotal and 0 under Heinous/Non-Heinous.
- **Layer 2 Code Fixes**:
  - `nick_names` type safety: Added JSON string deserialization for `'["Mannu"]'` in `person_display`, with comma-split fallback for plain strings.
  - Multi-alias separator: Standardized on `" / "` join separator across multiple aliases.
  - `address_compile` full mode preference: Prefers `present_*` over plain location fields when both exist, preventing duplicate house/street strings.

### 7. Layer 1 Classification Service API Contract & Default Parameters Documentation (2026-09-21)
- **`fetch_classified_counts` Parameter Defaults**:
  - `jurisdiction_level`: Default `'HQ'`. When `'HQ'`, `jurisdiction_id` is ignored/optional (`None`), aggregating across all police stations and districts in the database. When `'PS'` or `'DISTRICT'`, `jurisdiction_id` filters by specific node UUID; if `jurisdiction_id` is omitted (`None`), it falls back to unrestricted jurisdiction aggregation.
  - `jurisdiction_id`: Default `None`. Omitting means "all jurisdictions / entire hierarchy".
  - `from_date` / `to_date`: Defaults `None`. Omitting leaves the date range unrestricted, aggregating across all historical FIR dates (`f.fir_date`).
  - `crime_head_selector`: Default `'ALL'`. Omitting (or `'ALL'`) returns all crime heads (Heinous, Non-Heinous, and Act/OTHER). Passing a specific canonical code (e.g. `'ORGANIZED_CRIME_BNS_111'`) filters strictly by `lh.canonical_code`.
  - `channel_filter`: Default `None`. Omitting includes all channels (`MANUAL`, `E_THEFT`, `E_MVT`, `NCRP`).

### 8. Definitive Report-Period Date Authority & Test Count Reconciliation (2026-09-21)
- **Governing Date Authority**: `fetch_classified_counts` filters report periods using `COALESCE(r.registration_date, f.fir_date, r.record_date)`. This prioritizes `records.registration_date` as the authoritative date authority per original design spec, falls back to `fir_details.fir_date` for legacy records where `registration_date` is NULL, and uses `records.record_date` as the ultimate safety net.
- **Record Type Scope Limit**: `fetch_classified_counts` is strictly scoped to `r.record_type = 'CASE'` records. Non-CASE record types (`ARREST`, `MISSING`, `UIDB`, `PCR_CALL`) do not use `fetch_classified_counts` and are handled by separate specialized report routines.
- **Unit Test Count Reconciliation**: The total test suite contains exactly **28 tests** across two files:
  - `tests/test_aggregation_service.py`: 11 tests (including positive classification test with divergent dates & dynamic DB UUID lookup).
  - `tests/test_formula_library.py`: 17 tests (including 3 tests added in round 7 for nick_names type safety, multi-alias separator, and full mode address preference).

### 9. Phase 1 Sign-Off Follow-Ups & Phase 2 Golden Dataset / Harness (2026-09-21)

#### Part A Follow-Up Closures:
- **A1 COALESCE Fallback Chain Tested**: Added `test_coalesce_fallback_chain` to `tests/test_aggregation_service.py`. Proves Tier 2 (`fir_details.fir_date`) fires when `registration_date` is `NULL`, and Tier 3 (`records.record_date`) fires when both `registration_date` and `fir_date` are `NULL`. Both pass cleanly (`OK`).
- **A2 Non-CASE Specialized Routines Audit & Backlog**:
  - **Location**: `backend/src/modules/report-engine/shared/diary-query-builder.js:L138` (and `backend/src/modules/reports/reports.controller.js`).
  - **Findings**: Non-CASE record types (`ARREST`, `MISSING`, `UIDB`, `PCR_CALL`) are queried via `diary-query-builder.js` by joining `records as r` with specialized tables (`arrest_details`, `missing_details`, `uidb_details`, `pcr_call_details`), using `COALESCE(r.registration_date, r.record_date) BETWEEN ? AND ?`.
  - **Consistency**: Consistent with `registration_date`-first authority.
  - **Layer 2 Formula Backlog**: Formatting in Node backend controllers (`reports.controller.js`) currently performs ad-hoc string manipulation rather than calling shared normalization utilities. Scoped as a dedicated backlog item for future backend refactoring rounds.

#### Part B Phase 2 Golden Dataset & Harness Artifacts:
- **Coverage List (B1)**:
  1. 7 Heinous heads individually (Murder, Att to Murder, Dacoity, Robbery, Extortion, Riot, Kid for Ransom).
  2. BNS 111 (Organized Crime - 216) & BNS 113 (Terrorist Acts - 217).
  3. Non-Heinous (Burglary - 8) & Act/Special Law (NDPS / Other Act - 73).
  4. Date fallback tiers (Tier 2 fir_date, Tier 3 record_date).
  5. Channels & Source Systems (`MANUAL`, `E_THEFT`, `E_MVT`, `NCRP`, `ZERO_FIR`).
  6. Multi-accused persons & criminal history (`PI/PO/BC` vs none).
  7. Custody status raw normalization (`"Notice u/s 35(1) BNSS"` -> `"Notice 35(1) BNSS"`).
  8. Missing/UIDB case-fold normalization (`"Traced"` -> `"TRACED"`, `"Unidentified"` -> `"UNIDENTIFIED"`).
  9. Multi-jurisdiction nodes (2 PS in District 1, District 2).
  10. Year boundary date range & `+∞` variation calculation.
- **Seeding Script (B2)**: `scripts/seed_golden_dataset.py` (Seeded 19 PostgreSQL records with `source_reference = 'GOLDEN_DATASET_PHAROS_V1'`; direct SQL seeding used due to offline HTTP dev server, explicitly logged).
- **Teardown Insurance**: `scripts/cleanup_golden_dataset.py`.
- **Expected Values Artifact (B3)**: `golden_dataset/expected_values.json`.
- **Automated Correctness Harness (B4)**: `tests/test_golden_correctness_harness.py`.
- **Harness Execution (B5)**: 37 total unit tests passed cleanly (`OK`) in 0.315s.


### [RISK CARRIED FORWARD] Item 3b -- Direct SQL Seeding Form-Mapping Assumptions
- **Context**: The golden dataset was seeded via direct SQL insertion because the HTTP dev server was offline during Phase 2 verification.
- **Unverified Fields List**:
  1. 
egistration_type: Mapping of ZERO_FIR, E_FIR channel types vs base 
ecord_type ('CASE').
  2. source_system: Ingest tagging for E_THEFT, E_MVT, NCRP, MANUAL form inputs.
  3. custody_status: String values such as 'Notice u/s 35(1) BNSS' populated directly without frontend submission verification.
  4. missing_status: Normalization strings such as 'Traced' vs 'Untraced' populated directly.
  5. uidb_status: Status values such as 'Unidentified' vs 'PENDING' populated directly.
- **Action Required**: Future frontend validation round must submit each of the 5 form types (CASE, ARREST, MISSING, UIDB, PCR_CALL) through the HTTP API to verify these 5 field mappings.


### [DECISION] Item 3 — Date Range Shift to 2029 for Golden Dataset Isolation
- **Context**: B1's original prompt specified sample dates in 2025/2026. However, querying 2026 date windows against the shared PostgreSQL database returned 674 pre-existing legacy demo records (e.g. 675 Murder cases instead of 1), causing database contamination in test assertions.
- **Decision**: All 19 Phase 2 golden records are deliberately seeded in year 2029 (2029-09-10 to 2029-09-26, with year-boundary test records at 2028-12-15 and 2029-01-15).
- **Rationale**: Isolating the golden dataset to year 2029 guarantees 100% deterministic assertion results independent of ambient development DB data, preventing false-positive test failures while preserving the year-boundary COALESCE fallback logic.


### [PROCESS LESSON] Item 1f -- Heinous Heads Composition Audit
- **Context**: Across multiple prior verification rounds, Extortion (Non-Heinous, local_head_cd = 8) was standing in for Rape (Heinous, local_head_cd = 7) in the 7 Heinous heads test set without being detected.
- **Process Lesson**: The golden dataset's 7 Heinous heads set was found to contain Extortion (Non-Heinous) in place of Rape (the real 7th Heinous head) for multiple prior verification rounds. Always cross-check the SET of heads under test against the confirmed canonical list, not just the arithmetic of whatever set is currently present.
- **Resolution**: Extortion was moved to the Non-Heinous coverage set, and Rape (local_head_cd = 7) was added to complete the true 7 Heinous heads test set (Dacoity=1, Murder=2, Att Murder=3, Robbery=4, Riot=5, Kid Ransom=6, Rape=7).


### [DECISION] Item 1b -- Zero-FIR Worked-Out Status Seeding Logic
- **Context**: The Zero-FIR test record (case-ch-zero_fir, local_head_cd = 2, Murder) has is_worked_out = False despite having an even head code (2 % 2 == 0).
- **Decision**: Zero-FIR test records are seeded as not-yet-worked-out by design (is_worked_out = False in line 215 of scripts/seed_golden_dataset.py), regardless of local_head_cd parity.
- **Rationale**: Freshly-registered Zero-FIR channel records represent incoming transfer filings that cannot yet be worked out at initial registration. This deliberate modeling choice explains why total worked-out Heinous cases in Sept 2029 equals 3 (Murder #1, Robbery, Kid Ransom) rather than 4.


---

## Phase 3 Kickoff — Backlog Closure, Layer 3 Declarative Report Spec, Generic Renderer, and Sheet 21 Pilot Migration

### Decision
1. **Phase 2 Status Re-confirmed**: Re-ran full Python test suite (`python -m unittest discover -s tests -p "test_*.py"`). All tests pass cleanly (`42/42` passing, `OK`).
2. **Backlog Item 1 (Non-CASE JS Formatters Ported to Layer 2)**: Ported Python Layer 2 formula routines to JavaScript ([`backend/src/utils/formulaLibrary.js`](file:///d:/DPI/FIR/pharos-prototype/backend/src/utils/formulaLibrary.js)) to provide Node backend controllers with identical formatting logic without process boundary overhead. Verified 100% output parity between Python `formula_library.py` and JS `formulaLibrary.js` via automated cross-language harness ([`tests/test_js_formula_library.py`](file:///d:/DPI/FIR/pharos-prototype/tests/test_js_formula_library.py), `3/3` passing).
3. **Backlog Item 2 (5 Form-Mapping Fields Verified)**: Verified all 5 direct-SQL unverified form-mapping fields (`registration_type`, `source_system`, `custody_status`, `missing_status`, `uidb_status`) by submitting real record payloads through backend service mapping logic and inspecting direct PostgreSQL table writes (`fir_details`, `records`, `arrest_details`, `missing_details`, `uidb_details`). All 5 fields match direct-SQL expectations 100%.
4. **Layer 3 Declarative Spec Schema Designed**: Designed and documented the pure JSON Layer 3 Report Specification schema ([`REPORT_SPEC_FORMAT.md`](file:///d:/DPI/FIR/pharos-prototype/REPORT_SPEC_FORMAT.md)). Report sheets contain zero code, zero inline classification logic, zero formulas, and zero SQL queries. Expresses subtotal rows, Variation%/Detection% formulas, person templates, numbered lines, and date conventions purely via data declarations.
5. **Generic Report Renderer Implemented**: Implemented [`python_worker/report_renderer.py`](file:///d:/DPI/FIR/pharos-prototype/python_worker/report_renderer.py), which consumes spec files and dispatches column metric queries to Layer 1 (`aggregation_service.py`) and Layer 2 (`formula_library.py`). Generically enforces Row 5 annotation removal (`strip_row_5_annotation`) and A4 print setup metadata (`print_setup`).
6. **Sheet 21 Pilot Migration End-to-End**: Migrated Daily Diary Sheet 21 (FIR Goswara Summary) to Layer 3 spec ([`golden_dataset/report_specs/sheet_21_goswara_summary.json`](file:///d:/DPI/FIR/pharos-prototype/golden_dataset/report_specs/sheet_21_goswara_summary.json)). Executed renderer against Phase 2 Golden Dataset for September 2029 and verified 100% cell equality against independently hand-derived ground truth expected values ([`tests/test_part5_sheet21_pilot.py`](file:///d:/DPI/FIR/pharos-prototype/tests/test_part5_sheet21_pilot.py), `0` mismatches across 27 cell comparisons).

### Evidence
- Full test suite output (`42/42` passing).
- Cross-language JS vs Python formula parity pass (`3/3` passing).
- Backend service form-mapping database row inspection (5/5 matching).
- Literal cell output table for Sheet 21 pilot vs hand-derived expected values (27/27 matching).
