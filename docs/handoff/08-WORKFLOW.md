# PHAROS — Workflow & State Machine
**Version:** 1.0 | **Date:** 2026-08-18 | **Audience:** Backend engineers, QA, product managers

---

## 1. Design Principle

The PHAROS workflow is **entirely data-driven**. All states and transitions are stored in `workflow_transitions_config`. The engine (`workflow.engine.js`) has zero hardcoded states, statuses, or role checks.

**Adding a new workflow step = inserting a row in `workflow_transitions_config`. No code change required.**

This means:
- A new approval level (e.g. ACP review) requires only new config rows
- Removing a step (e.g. bypassing JCP review) requires only disabling rows (`is_active = false`)
- The entire workflow behaviour can be reconfigured per record type

---

## 2. Status Vocabulary

| Status | Meaning | Who Is Responsible |
|---|---|---|
| `DRAFT` | Created by HC; not yet submitted | HC (can edit) |
| `PS_SUBMITTED` | Submitted to SHO for review | SHO (must review) |
| `SHO_REVIEWED` | Approved by SHO; forwarded to District | DISTRICT_OFFICER |
| `DISTRICT_REVIEW` | Under District review | DISTRICT_OFFICER |
| `JCP_REVIEW` | Under JCP review (not yet configured) | JCP |
| `SCP_REVIEW` | Under SCP review (not yet configured) | SCP |
| `HQ_RECEIVED` | Forwarded to HQ | HQ_ADMIN |
| `ACCEPTED` | Accepted by HQ; record frozen | — (immutable) |
| `SENT_BACK` | Returned to previous level for correction | Originating role |
| `REJECTED` | Returned to HC | HC (can re-edit and resubmit) |
| `IN_TRANSFER` | Transfer in progress (initiated, awaiting acceptance) | Receiving PS |
| `AMENDED` | Being amended after acceptance | HC / SYSTEM_ADMIN |

---

## 3. Configured Transitions

The following transitions are active in `workflow_transitions_config`. These are the ONLY valid transitions — if a transition is not in this table, the engine rejects it with "Invalid action".

### CASE / ARREST / MISSING / UIDB / PCR_CALL (All Types)

| Action Code | Record Type | From Status | Action | To Status | Allowed Roles | Comment Required |
|---|---|---|---|---|---|---|
| `HC_SUBMIT` | `*` | `DRAFT` | `submit` | `PS_SUBMITTED` | `HC` | No |
| `HC_RESUBMIT` | `*` | `SENT_BACK` | `submit` | `PS_SUBMITTED` | `HC` | No |
| `SHO_APPROVE` | `*` | `PS_SUBMITTED` | `approve` | `SHO_REVIEWED` | `SHO` | No |
| `SHO_SENDBACK` | `*` | `PS_SUBMITTED` | `send_back` | `SENT_BACK` | `SHO` | **Yes** |
| `DISTRICT_APPROVE` | `*` | `SHO_REVIEWED` | `approve` | `DISTRICT_REVIEW` | `DISTRICT_OFFICER` | No |
| `DISTRICT_FORWARD` | `*` | `DISTRICT_REVIEW` | `approve` | `HQ_RECEIVED` | `DISTRICT_OFFICER` | No |
| `DISTRICT_SENDBACK` | `*` | `DISTRICT_REVIEW` | `send_back` | `SENT_BACK` | `DISTRICT_OFFICER` | **Yes** |
| `HQ_ACCEPT` | `*` | `HQ_RECEIVED` | `seal` | `ACCEPTED` | `HQ_ADMIN` | No |
| `TRANSFER_INITIATE` | `*` | `*` | `transfer_initiate` | `IN_TRANSFER` | `HC`, `SHO` | No |
| `TRANSFER_ACCEPT` | `*` | `IN_TRANSFER` | `transfer_accept` | `@PRIOR` | `HC`, `SHO` | No |
| `TRANSFER_REJECT` | `*` | `IN_TRANSFER` | `transfer_reject` | `@PRIOR` | `HC`, `SHO` | No |

> **Note**: `from_status = '*'` means the action matches any current status (used for `transfer_initiate`). `record_type = '*'` means the transition applies to all record types.

---

## 4. Lifecycle Diagrams

### Standard Record Lifecycle

```
[HC creates record]
      │
      ▼
   DRAFT ─────────────────────── [HC can edit / delete here]
      │
  [HC submit]
      │
      ▼
PS_SUBMITTED ─── [SHO reviews]
      │                │
   [approve]       [send_back]
      │                │
      ▼                ▼
SHO_REVIEWED        SENT_BACK ─── [HC notified; can re-edit + resubmit]
      │
  [DISTRICT_OFFICER picks up]
      │
      ▼
DISTRICT_REVIEW
      │           │
   [approve]  [send_back]
      │           │
      ▼           ▼
HQ_RECEIVED     SENT_BACK
      │
  [HQ_ADMIN seals]
      │
      ▼
  ACCEPTED ──── [is_frozen = true; no further edits]
```

### Transfer Flow

```
[Any status] ─── [SHO/HC initiates transfer] ──► IN_TRANSFER
                                                      │
                                            ┌─────────┴──────────┐
                                     [Receiving PS accepts]  [Receiving PS rejects]
                                            │                     │
                                            ▼                     ▼
                                         @PRIOR               @PRIOR
                                     (status + level       (status + level
                                      restored from         restored from
                                    workflow_transitions     workflow_transitions
                                         ledger)                ledger)
```

### @PRIOR Resolution

When `to_status = '@PRIOR'`, the workflow engine executes:
```sql
SELECT from_status, from_level
FROM workflow_transitions
WHERE record_id = :record_id
  AND to_status = 'IN_TRANSFER'
ORDER BY performed_at DESC
LIMIT 1;
```
It restores **both** the status and level captured at the moment of `IN_TRANSFER` entry.

---

## 5. DIRECT_HQ Routing

If `level_data_contracts` has an active contract with `from_level = 'DISTRICT'`, `to_level = 'HQ'`, `route = 'DIRECT_HQ'`, then when a record at `DISTRICT_REVIEW` is approved, it goes **directly** to `HQ_RECEIVED` — skipping any intermediate JCP/SCP review levels.

This is a configuration-driven routing decision, not hardcoded logic.

```sql
-- Check current DIRECT_HQ status:
SELECT * FROM level_data_contracts
WHERE from_level = 'DISTRICT' AND to_level = 'HQ';
```

---

## 6. Not-Yet-Configured Levels

These workflow levels exist in schema (`hierarchy_nodes.node_type`) but have no active `workflow_transitions_config` rows:

| Level | Role | Status | What's Missing |
|---|---|---|---|
| ACP | `ACP` | Config pending | No transition rows for ACP review step |
| JCP | `JCP` | Config pending | No transition rows; jcp-approve endpoint exists |
| SCP | `SCP` | Config pending | No transition rows; scp-approve endpoint exists |
| ZONE | ZONE | Config pending | Not included in approval chain |
| RANGE | RANGE | Config pending | Not included in approval chain |

---

## 7. How to Add a New Transition

```sql
INSERT INTO workflow_transitions_config (
  code, record_type, from_status, action,
  to_status, from_level, to_level,
  allowed_roles, requires_comment, is_active
) VALUES (
  'ACP_REVIEW_APPROVE',   -- unique code
  '*',                     -- all record types (or specific: 'CASE')
  'SHO_REVIEWED',          -- from this status
  'approve',               -- action name
  'ACP_REVIEW',            -- to this status
  'PS',                    -- from this level
  'SUB_DIV',               -- to this level
  '["ACP"]',               -- allowed roles (JSON array)
  false,                   -- comment required?
  true                     -- active?
);
```

---

## 8. How to Add a New Workflow Level (e.g. ACP intermediate)

1. Ensure the role exists in `users.role` CHECK constraint (or add migration)
2. Ensure `hierarchy_nodes.node_type` supports the level (add migration if needed)
3. Add `workflow_transitions_config` rows for all needed actions at the new level
4. Create `hierarchy_nodes` rows of the new type in the hierarchy tree
5. Add `RoleRedirect` entry in `frontend/src/routes/AppRouter.jsx` for the new role's home page
6. Add nav items for the new role in the sidebar config

---

## 9. Audit

Every transition appends to the **`workflow_transitions` ledger** (append-only) with:
- `record_id` — which record
- `from_status` / `to_status` — the state change
- `from_level` / `to_level` — the organisational level change
- `action` — what action was performed
- `performed_by` — which user
- `performed_at` — when
- `comment` — any reviewer comment

The ledger serves two purposes:
1. **History**: Who did what to a record and when
2. **@PRIOR resolution**: The source of truth for restoring pre-transfer state

**The `workflow_transitions` table must never have rows deleted or updated.** It is append-only by design.

Additionally, every transition writes a row to `record_revisions` with a hash-chained SHA-256 audit entry.

---

## 10. Queue Derivation

The workflow queue for each role is derived dynamically:

```sql
-- What statuses does SHO act on?
SELECT DISTINCT from_status
FROM workflow_transitions_config
WHERE is_active = true
  AND from_status <> '*'
  AND from_level IS NOT NULL
  AND allowed_roles @> '["SHO"]'::jsonb;
```

A role with no configured transitions (e.g. ACP currently) gets an empty queue — not an error. This is by design.
