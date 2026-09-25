# PHAROS Application Architecture — Diagrams

**Source of truth:** `ARCHITECTURE.md` (this file is its visual rendering — keep in parity). This file and its generated `.drawio` are **new and separate** from the DB-layer `ER_DIAGRAM.md`/`.drawio` — neither of those files, nor any other existing `docs/db-audit/` artifact, was modified to produce this one.
**Open in draw.io:** open **`ARCHITECTURE.drawio`** (same folder) — File → Open in draw.io/diagrams.net. Each diagram below is its own page with native, editable shapes (boxes/arrows for component + flow diagrams, lifelines + ordered messages for sequence diagrams, state nodes + labeled transitions for the state diagram). The file is **generated from this MD** by `generate-architecture-drawio.mjs` — if you edit the Mermaid blocks here, regenerate rather than hand-editing both: `node docs/db-audit/generate-architecture-drawio.mjs`.
**Fallback (Mermaid paste):** draw.io → **Extras → Edit Diagram… → Mermaid** (or **+ / Insert → Advanced → Mermaid**), paste one block, Insert — renders as a static image, same documented fallback already used by `ER_DIAGRAM.md`.
**Notation:** `graph TD`/`flowchart TD` = top-down component/flow diagrams; `sequenceDiagram` = temporal message-passing diagrams (`->>` solid call, `-->>` dashed return, `Note over` for annotations); `stateDiagram-v2` = the workflow status lifecycle.

---

## 1. Overview — component/container diagram

```mermaid
flowchart TD
    FE["Frontend<br/>React/Vite<br/>DynamicForm (multi-step)"]
    API["Express API<br/>(dual-mounted /api/v1 + /api)"]
    RBAC["auth + rbac middleware<br/>(allow / enforceScope / verifyRecordAccess)"]
    RECORDS["records module<br/>(spine+detail+persons+properties<br/>single hash-chained write path)"]
    WORKFLOW["workflow engine<br/>(workflow_transitions_config)"]
    TRANSFERS["transfers module (NEW)<br/>(record_transfers + fir_number_counters)"]
    FIELDS["fields module<br/>(field_registry storage mappings)"]
    COMPILATION["compilation module"]
    REPORTS["reports module<br/>(report_templates, report_jobs)"]
    REPORTBUILDER["report-builder module<br/>(typed FK joins)"]
    IMPORT["import / legacy module"]
    AUDIT["audit module"]
    CONFIGSYNC["sync-config command (NEW)"]
    BUS(["RabbitMQ topic exchange 'pharos'"])
    AUDITHANDLER["auditHandler"]
    NOTIFYHANDLER["notifyHandler"]
    LINKHANDLER["linkAuditHandler"]
    BREAKHANDLER["chain-break alert handler (NEW)"]
    PG[("PostgreSQL<br/>schemas: public + ref")]
    PYWORKER["python_worker<br/>(pharos_report_ro role)"]
    REPORTSTORE[("generated-reports storage")]
    CONFIGFILES[["config/*.json<br/>(git-versioned)"]]

    FE -->|HTTPS + JWT| API
    API --> RBAC
    RBAC --> RECORDS
    RBAC --> WORKFLOW
    RBAC --> TRANSFERS
    RBAC --> FIELDS
    RBAC --> COMPILATION
    RBAC --> REPORTS
    RBAC --> REPORTBUILDER
    RBAC --> IMPORT
    RBAC --> AUDIT

    RECORDS --> PG
    WORKFLOW --> PG
    TRANSFERS --> PG
    FIELDS --> PG
    COMPILATION --> PG
    REPORTBUILDER --> PG
    IMPORT --> PG
    AUDIT --> PG

    RECORDS -->|publish record.*| BUS
    WORKFLOW -->|publish record.submitted/approved/sent_back| BUS
    TRANSFERS -->|publish transfer.*| BUS
    COMPILATION -->|publish compilation.submitted| BUS
    REPORTS -->|publish report.requested| BUS

    BUS --> AUDITHANDLER --> PG
    BUS --> NOTIFYHANDLER --> PG
    BUS --> LINKHANDLER --> PG
    BUS --> BREAKHANDLER --> PG

    BUS -->|report.requested| PYWORKER
    PYWORKER -->|typed SQL, SELECT-only| PG
    PYWORKER -->|openpyxl / WeasyPrint / csv| REPORTSTORE
    PYWORKER -->|publish report.generated| BUS

    CONFIGFILES -->|npm run sync-config| CONFIGSYNC --> PG

    REPORTS -.->|job status poll| FE
    REPORTSTORE -.->|download| FE
```

---

## 2. Low-level sequence: typed record write path (create/update)

```mermaid
sequenceDiagram
    participant UI as DynamicForm (frontend)
    participant API as records.controller
    participant SVC as records.service
    participant DB as Postgres (records+detail+persons+properties+revisions)
    participant BUS as RabbitMQ 'pharos'
    participant NOTIFY as notifyHandler

    UI->>API: POST /records {record_type, data, persons[], properties[]}
    API->>SVC: createRecord(user, type, date, data, persons, properties)
    SVC->>DB: BEGIN
    SVC->>DB: INSERT records (spine)
    SVC->>DB: INSERT <type>_details (typed columns + extra jsonb)
    SVC->>DB: INSERT record_offences (one row per section citation, is_primary on one)
    SVC->>DB: INSERT persons[] (+ role subtype rows)
    SVC->>DB: INSERT record_properties[] (+ ref.* category FKs)
    SVC->>DB: INSERT locations[] (address blocks) + stamp owner FKs
    SVC->>DB: SELECT prev_hash FOR UPDATE (single writer, locked)
    SVC->>DB: INSERT record_revisions (change_type=CREATE, row_hash=H(payload, prev_hash))
    SVC->>DB: INSERT audit_logs
    SVC->>DB: COMMIT
    SVC-->>API: dbRecord
    API-->>UI: 201 {record}
    SVC->>BUS: publish record.created {record_id, record_type}
    BUS->>NOTIFY: record.created (if subscribed)
```

---

## 3. Low-level sequence: case transfer two-step handshake

```mermaid
sequenceDiagram
    participant SHO_A as SHO (from PS)
    participant API as transfers.controller (NEW)
    participant SVC as transfers.service (NEW)
    participant DB as Postgres
    participant BUS as RabbitMQ 'pharos'
    participant SHO_B as SHO (to PS)

    SHO_A->>API: POST /transfers {record_id, to_ps_id, reason}
    API->>SVC: initiateTransfer(...)
    SVC->>DB: BEGIN
    SVC->>DB: INSERT record_transfers (status=PENDING, prior_status/prior_level snapshot)
    SVC->>DB: transitionRecord(action=initiate) -> current_status=IN_TRANSFER
    SVC->>DB: single hash-chained revision (change_type=TRANSFER)
    SVC->>DB: COMMIT
    SVC->>BUS: publish transfer.initiated
    BUS-->>SHO_B: notifyHandler -> notification row

    SHO_B->>API: POST /transfers/:id/accept
    API->>SVC: acceptTransfer(...)
    SVC->>DB: BEGIN
    SVC->>DB: UPDATE records SET ps_id/district_id/sub_div_id = destination
    SVC->>DB: IF original_ps_id IS NULL THEN SET original_ps_id = pre-transfer ps_id
    SVC->>DB: alt CASE record
        SVC->>DB: UPDATE fir_details.ps_id = destination
        SVC->>DB: SELECT ... FOR UPDATE fir_number_counters(ps_id, fir_year)
        SVC->>DB: allocate next fir_no, UPDATE fir_details.fir_no/fir_year
        SVC->>DB: IF original_fir_no IS NULL THEN SET original_fir_no/_year
        SVC->>DB: UPDATE record_transfers.assigned_fir_no/_year
    end
    SVC->>DB: UPDATE record_transfers SET status=ACCEPTED, decided_by, decided_at
    SVC->>DB: transitionRecord(action=accept) per workflow_transitions_config
    SVC->>DB: single hash-chained revision (change_type=TRANSFER)
    SVC->>DB: COMMIT
    SVC->>BUS: publish transfer.accepted
    BUS-->>SHO_A: notifyHandler -> notification row

    Note over SHO_B,DB: Reject path (alternative): restore current_status/current_level<br/>FROM record_transfers.prior_status/prior_level (not from config)
```

---

## 4. Low-level sequence: workflow transition (config-driven)

```mermaid
sequenceDiagram
    participant UI as SHO Queue/RecordDetail
    participant API as records.controller
    participant SVC as records.service (transitionRecord)
    participant CFG as workflow_transitions_config
    participant DB as Postgres
    participant BUS as RabbitMQ 'pharos'

    UI->>API: POST /records/:id/approve {comment}
    API->>SVC: transitionRecord(id, user, 'approve', comment)
    SVC->>DB: BEGIN
    SVC->>CFG: SELECT WHERE from_status, action, record_type IN (type,'*'), is_active
    CFG-->>SVC: rule {to_status, to_level, requires_comment, allowed_roles}
    alt level_data_contracts route override exists
        SVC->>DB: SELECT level_data_contracts WHERE route='DIRECT_HQ' ...
        DB-->>SVC: override to_status/to_level
    end
    SVC->>DB: INSERT workflow_transitions (ledger row)
    SVC->>DB: single hash-chained record_revisions (change_type=STATUS_CHANGE)
    SVC->>DB: UPDATE records SET current_status, current_level
    SVC->>DB: INSERT audit_logs
    SVC->>DB: COMMIT
    SVC-->>API: updated record
    SVC->>BUS: publish record.approved
    BUS-->>UI: notifyHandler -> notification (async)
```

---

## 5. Low-level sequence: hash-chain verification + break/freeze

```mermaid
sequenceDiagram
    participant CRON as node-cron scheduled job (NEW)
    participant UTIL as utils/hash.js verifyAuditChain
    participant DB as Postgres (record_revisions)
    participant BUS as RabbitMQ 'pharos'
    participant HANDLER as chain-break alert handler (NEW)
    participant ADMIN as SYSTEM_ADMIN users

    CRON->>UTIL: verifyAuditChain(db)
    UTIL->>DB: walk record_revisions ORDER BY record_id, revision_number
    UTIL->>UTIL: recompute row_hash, compare to stored prev_hash chain
    alt chain intact
        UTIL-->>CRON: OK
    else break detected
        UTIL->>BUS: publish audit.chain_break_detected {record_id, revision_number}
        BUS->>HANDLER: audit.chain_break_detected
        HANDLER->>DB: UPDATE records SET is_frozen = true WHERE id = record_id
        HANDLER->>DB: INSERT audit_logs (action=CHAIN_BREAK_DETECTED)
        HANDLER->>DB: INSERT notifications (all SYSTEM_ADMIN users)
        HANDLER->>ADMIN: (via notifications) loud alert
        Note over ADMIN,DB: Manual review -> privileged unfreeze endpoint clears is_frozen
    end
```

---

## 6. Low-level sequence: unified report generation pipeline

```mermaid
sequenceDiagram
    participant UI as ReportBuilder (frontend)
    participant API as reports.controller
    participant DB as Postgres (report_jobs, report_templates)
    participant BUS as RabbitMQ 'pharos'
    participant PY as python_worker (generator.py)
    participant STORE as generated-reports storage

    UI->>API: POST /reports/generate {template_id, filters, format}
    API->>DB: SELECT report_templates WHERE id/code (RBAC scope check)
    API->>DB: INSERT report_jobs (status=PENDING)
    API->>BUS: publish report.requested {job_id, template_id, filters, format}
    API-->>UI: 202 {job_id}

    BUS->>PY: report.requested
    PY->>DB: UPDATE report_jobs SET status=RUNNING
    PY->>DB: SELECT report_templates.template_definition
    PY->>DB: typed SQL join (records+detail+persons+properties+ref.*) via pharos_report_ro
    alt daily-diary style multi-sheet proforma
        PY->>PY: registry.map_all_sheets() over typed rows
        PY->>PY: builder.build_workbook() (openpyxl)
    else single-sheet proforma
        PY->>PY: render via openpyxl / WeasyPrint / csv per format
    end
    PY->>STORE: write output file
    PY->>DB: UPDATE report_jobs SET status=READY, file_path
    PY->>BUS: publish report.generated {job_id}

    UI->>API: GET /reports/status/:job_id (poll)
    API->>DB: SELECT report_jobs WHERE id=job_id
    API-->>UI: {status, file_path}
    UI->>STORE: GET download (via API-proxied route)
```

---

## 7. Flowchart: config-as-data sync pipeline

```mermaid
flowchart TD
    WF[["config/workflow/*.json"]]
    FLD[["config/fields/&lt;type&gt;.json"]]
    PRF[["config/proformas/&lt;name&gt;.json<br/>(one file per proforma)"]]
    CTR[["config/contracts/*.json"]]
    SYNC["npm run sync-config"]
    CHK{"checksum changed?"}
    NOOP["no-op (row untouched)"]
    UPSERT["UPSERT by stable key<br/>(code / field_key)"]
    T1[("workflow_transitions_config")]
    T2[("field_registry")]
    T3[("report_templates")]
    T4[("level_data_contracts")]
    RUNTIME["Runtime (Node + Python)<br/>reads DB only, never git files"]

    WF --> SYNC
    FLD --> SYNC
    PRF --> SYNC
    CTR --> SYNC
    SYNC --> CHK
    CHK -->|no| NOOP
    CHK -->|yes| UPSERT
    UPSERT --> T1
    UPSERT --> T2
    UPSERT --> T3
    UPSERT --> T4
    T1 --> RUNTIME
    T2 --> RUNTIME
    T3 --> RUNTIME
    T4 --> RUNTIME
```

---

## 8. State diagram: workflow status lifecycle

```mermaid
stateDiagram-v2
    [*] --> DRAFT
    DRAFT --> PENDING_SHO: submit
    PENDING_SHO --> DISTRICT_REVIEW: approve
    PENDING_SHO --> SENT_BACK: send_back
    SENT_BACK --> PENDING_SHO: submit (resubmit)
    DISTRICT_REVIEW --> JCP_REVIEW: approve
    DISTRICT_REVIEW --> SENT_BACK_PS: send_back
    SENT_BACK_PS --> PENDING_SHO: submit (resubmit)
    JCP_REVIEW --> SCP_REVIEW: approve
    JCP_REVIEW --> DISTRICT_REVIEW: send_back
    SCP_REVIEW --> HQ_RECEIVED: approve
    SCP_REVIEW --> JCP_REVIEW: send_back
    HQ_RECEIVED --> ARCHIVED: seal

    DRAFT --> IN_TRANSFER: initiate transfer
    PENDING_SHO --> IN_TRANSFER: initiate transfer
    DISTRICT_REVIEW --> IN_TRANSFER: initiate transfer
    IN_TRANSFER --> PRIOR_STATUS_RESUMED: accept (resume at destination PS, per config)
    IN_TRANSFER --> PRIOR_STATUS_RESUMED: reject (restore prior_status/prior_level, not via config)

    [*] --> LEGACY_IMPORTED: import (is_legacy)
    LEGACY_IMPORTED --> AMENDMENT_PENDING: request amendment
    AMENDMENT_PENDING --> LEGACY_IMPORTED: amendment approved/rejected

    note right of IN_TRANSFER
        Special state, type-generic
        (CASE/ARREST/PCR_CALL/MISSING/UIDB)
    end note
```
