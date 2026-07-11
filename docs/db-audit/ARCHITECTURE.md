# PHAROS Application Architecture — Post-DB-Restructure

**Status:** DESIGN FINAL — 2026-07-09. This is the AI/dev context file for everything *above* the database: modules, event bus, workflow engine, transfers, config-as-data, report engine, and frontend. It assumes the new schema in `DB_SCHEMA.md` is already implemented.
**Companion docs (DB layer, unchanged by this document):** `DB_REDESIGN_DECISIONS.md`, `DB_SCHEMA.md`, `ER_DIAGRAM.md`/`.drawio`, `DB_GROUND_TRUTH.md`, `HANDOFF.md`. This document and its diagrams (`ARCHITECTURE_DIAGRAMS.md`, `ARCHITECTURE.drawio`) are new and separate — none of the DB-layer files were modified to produce this one.
**Diagrams:** `ARCHITECTURE_DIAGRAMS.md` (Mermaid source) → `ARCHITECTURE.drawio` (generated, open directly in draw.io — see that file's header for regeneration instructions).
**Scope:** design only. No backend/frontend code was changed to produce this document. Implementation is a separate next phase — see `ARCHITECTURE_HANDOFF.md`.
**Research basis:** two Explore passes over the live codebase (backend modules/event bus/RBAC/scripts, frontend forms/pages/i18n/API layer) plus direct reads of `python_worker/*`, `record-links`/`level-contracts`/`legacy`/`import`/`filters`/`warehouse` modules, and historical docs (`HANDOFF.md` at repo root, `docs/RECORD-LINKAGE.md`, `docs/PROJECT_AUDIT.md`, `docs/LIVE_SYSTEM_BLOCKERS.md`). Where this document corrects a stale claim in `CLAUDE.md`, it says so explicitly — `CLAUDE.md` should be refreshed from this document once implementation lands.

---

## 0. How to read this document

Each section states **today** (what the live code actually does — not what `CLAUDE.md` says) and **target** (what it becomes once built on the new typed schema). Where today's code is already partway to target, that's called out — this is not a green-field design, and treating it as one would mean re-doing work that already exists (e.g. `record_persons`/`record_properties` tables, the frontend's split-submit contract, the `field_registry`/`report_templates` upsert-seed pattern).

Three decisions were fixed before this document was written and are treated as given throughout:
1. **Report engine unifies into one pipeline, rendering is Python-only** (openpyxl/WeasyPrint/csv) — no ExcelJS, no ad-hoc Puppeteer except as a documented per-proforma escape hatch if WeasyPrint genuinely can't achieve a layout.
2. **`frontend/src/components/forms/DynamicForm.jsx`** (multi-step) is the one form engine going forward. The Ant Design `DynamicForm` and the 5 legacy flat-blob pages are retirement targets, not maintained in parallel.
3. **Diagrams are new, separate files** — nothing under `docs/db-audit/` that predates this document (`DB_SCHEMA.md`, `ER_DIAGRAM.*`, `DB_REDESIGN_DECISIONS.md`, `DB_GROUND_TRUTH.md`, `HANDOFF.md`, `generate-drawio.mjs`, `schema.sql`, `schema-browser.html`) was touched.

---

## 1. System overview

### 1.1 Stack (confirmed against code, not assumed from CLAUDE.md)
- **Backend:** Node.js/Express (ESM), Knex→PostgreSQL, RabbitMQ (topic exchange `pharos`), Winston.
- **Frontend:** React 18/Vite, Zustand (`store/authStore.js`) + a thin Context wrapper, react-i18next for **app-chrome strings only** (field labels bypass i18next entirely — see §10.5).
- **Report worker:** separate Python process (`python_worker/`), SQLAlchemy engine, own RabbitMQ connection on the same `pharos` exchange, `pika`. Runs independently of the Node backend; started separately (`python python_worker/main.py`).
- **Infra:** Docker Compose (Postgres + RabbitMQ), env-validated-ish config (`backend/src/config/env.js` — no schema validation library, just `getEnv(key, fallback)`, and both JWT secrets have **hardcoded fallback values** if the env var is missing — flag for hardening, out of scope here).

### 1.2 Actual module map (corrects `CLAUDE.md` §4)
`backend/src/modules/` today contains 21 modules — several exist that `CLAUDE.md`'s Phase 2 roadmap lists as *not yet built*:

```
admin/            analytics/        audit/            auth/
compilation/      daily-diary/      fields/           filters/
hierarchy/        import/           legacy/           level-contracts/
notifications/    record-links/     records/          report-builder/
reports/          upload/           users/            warehouse/
workflow/
```

`import`, `legacy`, `level-contracts`, `filters`, `daily-diary`, `warehouse`, `record-links`, `report-builder` are all live, non-trivial (`import.controller.js` alone is 2300+ lines) — `CLAUDE.md`'s Phase 2 roadmap should be updated to reflect this once this document lands.

Every module's router is **dual-mounted** at both `/api/v1/<x>` and `/api/<x>` in `app.js` — this dual-mount convention is preserved unchanged by the restructure.

### 1.3 Corrections to specific `CLAUDE.md` claims
| CLAUDE.md claim | Reality (confirmed in code) |
|---|---|
| Upload via "Multer/Cloudinary" | `upload.controller.js` is Multer-disk-only, no Cloudinary. Record attachments (`records.service.js` `addAttachment`/`removeAttachment`) go through a **separate S3 path** (`utils/s3.js`). Two independent file-storage mechanisms exist; target: pick one (S3, since it's already the record-attachment path) and retire the standalone Multer-disk `/upload` endpoint, or make it write to S3 too. |
| `workflow` module "delegates to records.service" | Only `/workflow/queue` genuinely delegates (to `records.controller.getQueue`). `workflow.service.js`/`workflow.controller.js` are a **separate, unrouted, stale reimplementation** of the state machine (different status names, no hash-chained revision writes, no `audit_logs`) — dead code, not wired into `workflow.router.js`. **Target: delete `workflow.service.js`/`workflow.controller.js` entirely.** |
| `backend/scripts/{migrations,seed-fields,seed-mock-data}.js` | Don't exist. Actual equivalents: `knex migrate:latest` (`db:migrate`), `knex seed:run` (`db:seed`) running `backend/seeds/01_fields.js` (field_registry, 1500+ lines, already an upsert-by-`field_key` pattern), `02_menu_tables.js` (ref-data loader ancestor), `03_config.js` (report_templates + link_type_registry seeds), `04_users.js`. `backend/scripts/menu_table().js` is an older, non-idempotent, Windows-path-hardcoded predecessor of `02_menu_tables.js` — dead, superseded. |
| Bilingual "every label has label_en + label_hi" | True only for `field_registry` (and it's the one field_registry-owned system-wide bilingual case, matching `DB_SCHEMA.md`'s decision that `ref.*`/config tables are English-only). App-chrome strings use react-i18next; the two systems never overlap (§10.5). |

---

## 2. Event bus topology

### 2.1 Transport (today = target, unchanged)
Single topic exchange `'pharos'`, durable. `eventBus.js`'s `subscribe(pattern, queueNameOrHandler, handler?)` supports both a 3-arg (explicit queue name) and 2-arg (auto-derived queue name) call form — keep both, this is a working convenience, not tech debt.

**RabbitMQ-down fallback:** if the broker connection fails, `eventBus.js` falls back to an in-process `EventEmitter` (`isMock = true`) with wildcard emission. This means **the whole event bus silently degrades to local pub-sub with no cross-process delivery** when RabbitMQ is unavailable — acceptable for dev, but this document flags it explicitly so nobody mistakes "app didn't crash" for "events were delivered" in an incident. No change proposed; just documented.

### 2.2 Handlers that actually run at boot (corrects the notifications gap)
`app.js`'s `startServer()` calls exactly three handler `.init()`s: `auditHandler`, `notifyHandler`, `linkAuditHandler`. **`notifications/notifications.service.js`'s `initSubscriptions()` is dead code** — never called from anywhere, uses a 2-arg `subscribe` targeting `record.status_changed` (an event only the dead `workflow.service.js` ever published) and writes to a hardcoded mock user UUID. **Target: delete `notifications.service.js`'s `initSubscriptions()`/`handleRecordStatusChanged` — `notifyHandler.js` is the one real notification handler and stays.**

### 2.3 Event catalog — today vs. target

| Event | Publisher (today) | Subscriber(s) | Change for new schema |
|---|---|---|---|
| `record.created` / `record.updated` | `records.service.js` (inline, after commit) | `auditHandler` (dedupe-skips — see §4.2) | Unchanged shape; payload now references typed detail/persons/properties row counts, not a jsonb diff |
| `record.overridden` | `records.service.js` `overrideCaseHead` | `auditHandler` (dedupe-skips) | Unchanged |
| `record.submitted` / `record.approved` / `record.sent_back` | `records.service.js` `submitRecord`/`transitionRecord` | `notifyHandler` (real), `auditHandler` (writes the hash-chained revision **today** — this responsibility moves per §4.2) | Same events, revision-write responsibility consolidates into `records.service.js` |
| `record.status_changed` | dead `workflow.service.js` only | dead `notifications.service.js` only | **Deleted** — both ends are dead code |
| `link.*` | `record-links.service.js` | `linkAuditHandler` (writes `audit_logs`, one row per side) | Unchanged |
| `compilation.submitted` | `compilation.service.js` | `notifyHandler` | Unchanged; compilation membership now via `compilation_records` (frozen snapshot), not `compilations.record_ids` |
| `report.requested` | `reports.controller.js` | `python_worker` (`report-generation-queue`) | Unchanged transport; payload references `report_templates.id` only — the in-memory template array and `custom_definition` jsonb-key lists go away (§9) |
| `report.generated` | `python_worker/events.py` | (available for future consumers; currently nothing subscribes) | Unchanged |
| `legacy.batch_imported` | `legacy.controller.js` | (currently nothing subscribes) | Merges conceptually into `import_batches`-based import (§ import module notes below); event name may become `import.batch_completed` with an `is_legacy` flag in the payload, matching the DB's `legacy_import_batches`→`import_batches` merge |
| **`transfer.initiated`** | *(new)* `transfers.service.js` | `notifyHandler` (new subscription: notify receiving PS's SHO), `auditHandler` | New — see §6 |
| **`transfer.accepted`** / **`transfer.rejected`** | *(new)* `transfers.service.js` | `notifyHandler` (notify initiating PS), `auditHandler` | New — see §6 |
| **`audit.chain_break_detected`** | *(new, already named in `utils/hash.js`'s `verifyAuditChain` per the backend research — currently published but nothing subscribes)* | *(new)* an ops-alert handler (email/Slack webhook, or at minimum a loud `logger.error` + a `notifications` row to `SYSTEM_ADMIN` users) | New consumer — see §11 |

---

## 3. RBAC & scoping

### 3.1 Today (confirmed in `rbac.middleware.js`)
```js
allow(...roles)              // 401 if no user, 403 if role not in list
enforceScope(req,res,next)   // sets req.jurisdictionQuery:
//   HC/SHO             → { ps_id }
//   DISTRICT_OFFICER   → { district_id }
//   ACP                → { sub_div_id }
//   (no branch for JCP/SCP/HQ_ANALYST/HQ_ADMIN/SYSTEM_ADMIN → falls through to {} = GLOBAL scope)
verifyRecordAccess(recordId, user)   // per-record ownership check, same role logic, one un-indexed SELECT * per call
```

**Confirmed gap:** `JCP`/`SCP` have no `enforceScope` branch, so despite `records.router.js` granting them `jcp-approve`/`scp-approve` transition permissions, they currently get **unscoped global read/queue visibility** rather than sub-division/range scoping. **Target: add explicit branches** — `JCP → { sub_div_id }`, `SCP → { range_id }` once `records`/`hierarchy_nodes` carry the appropriate ids (per `DB_SCHEMA.md` §3.1, zone/range stamping is backfilled only if a real proforma needs it; if JCP/SCP scoping is needed before that, `sub_div_id`/traversal-up-the-tree from `district_id` covers it without new columns).

### 3.2 Scoping extends to new tables
- `record_transfers`: visibility scoped by `from_ps_id`/`to_ps_id` matching the user's `ps_id` (HC/SHO), or by `district_id` reachable from either PS (DISTRICT_OFFICER+). No new RBAC primitive — reuses `enforceScope`'s existing `jurisdictionQuery` shape, ANDed against `from_ps_id OR to_ps_id`.
- `ref.*`: read-only for every authenticated role (lookups, not scoped data) — no RBAC change.
- `persons`/`record_properties`/`record_offences`/`locations`: inherit their parent `records` row's scope — `verifyRecordAccess(record_id, user)` already covers them since they're always reached via `record_id` (locations via their owning person/detail row).

---

## 4. Records write path (rewritten for the typed schema)

### 4.1 Today
`createRecord`/`updateRecord` in `records.service.js` **already** do the right shape of thing structurally: one `db.transaction`, insert into `records` + (today's hybrid) `record_persons` + `record_properties`, insert a `record_revisions` row with a computed hash chain (`computeRowHash`/`getPreviousHash`), insert `audit_logs`, and publish the event **after** commit. `overrideCaseHead` follows the same three-way-write shape for `HEAD_OVERRIDE`.

`submitRecord`/`transitionRecord`, however, only write `workflow_transitions` + `audit_logs` inline — **no `record_revisions` row**. That gets written **later, asynchronously**, by `auditHandler.js` reacting to the published `record.submitted`/`.approved`/`.sent_back` event. `auditHandler.js` dedupes CREATE/UPDATE/HEAD_OVERRIDE (since those are already written inline) but is the **sole** writer for SUBMIT/APPROVE/SEND_BACK/SEAL.

**This is the "two write paths" problem `DB_REDESIGN_DECISIONS.md` §L6.5 requires solved before the hash chain means anything**: `auditHandler.js` computes `prev_hash` by reading fresh from `db` (not the original transaction), with no row lock — two rapid transitions on the same record have a real race window to compute the same `revision_number`/`prev_hash`, corrupting the chain silently.

### 4.2 Target: single write path
`records.service.js` becomes the **only** writer of `record_revisions`, for every `change_type` (`CREATE`, `UPDATE`, `STATUS_CHANGE`, `LEVEL_TRANSITION`, `HEAD_OVERRIDE`, `TRANSFER`, `AMENDMENT`, `IMPORT`). `submitRecord`/`transitionRecord` gain the same inline hash-chained revision insert that `createRecord`/`updateRecord`/`overrideCaseHead` already have — inside the same transaction, using `SELECT ... FOR UPDATE` on the record row (or on a per-record advisory lock) to serialize `revision_number`/`prev_hash` assignment. **`auditHandler.js`'s revision-writing branch is deleted** — it becomes purely a read-side consumer of `record.*` events for anything that isn't append-to-ledger (there may be nothing left for it to do; if so, retire it and let `notifyHandler`/`linkAuditHandler` be the only two subscribers left on `record.*`-shaped events, or repurpose it to walk `audit_logs` fan-out if a use for that remains).

### 4.3 The typed spine+detail+persons+properties write, end to end
See `ARCHITECTURE_DIAGRAMS.md` → "Low-level sequence: typed record write path" for the full sequence. Summary:
1. Controller validates `record_type`, resolves `jurisdictionQuery`.
2. Service opens one transaction.
3. Insert `records` (spine: scoping ids, `record_date`, `current_status='DRAFT'`, `io_id`, etc.).
4. Insert the one matching detail row (`fir_details`/`arrest_details`/`pcr_call_details`/`missing_details`/`uidb_details`) — typed columns per `field_registry.storage: {table, column}` mappings; anything with `storage: 'extra'` lands in that table's `extra jsonb`.
5. Insert `record_offences` rows — one per section citation, each carrying act + section + major/minor head inline, `is_primary` on exactly one (CASE/ARREST/UIDB; ruling 17's flat 1NF shape).
6. Insert `persons` rows (one per repeater entry, `role` CHECK-constrained) + role subtype rows (`arrestee_details`/`missing_person_details`/`person_descriptions`) where `field_registry.storage: {entity:'person', role, column}` dictates.
7. Insert `record_properties` rows (+ category FK resolution against `ref.*`) for property/vehicle/phone repeater entries (`storage: {entity:'property', column}`).
7a. Insert `locations` rows for each structured address/place block (`storage: {entity:'location', slot, column}`) and stamp the owning row's FK (occurrence on fir_details, present/perm on persons, etc.) — same transaction.
8. Insert the ONE `record_revisions` row (hash-chained, `change_type='CREATE'`).
9. Insert `audit_logs`.
10. Commit.
11. Publish `record.created` (payload: `record_id`, `record_type`, counts of persons/properties inserted — not the data itself).

**Naming reconciliation (a real migration, not a rename):** today's `record_persons` table has `person_type` + 5 extracted search columns (`first_name`,`last_name`,`mobile`,`city`,`district`) + one `data jsonb` blob holding everything else with a GIN index. Today's `record_properties` has `major_category`/`minor_category`/`status`/`details`/`extra_data jsonb`. The new `persons`/`record_properties` (per `DB_SCHEMA.md` §3) have ~25-30 real typed columns each plus category FK columns and role subtype tables. The migration path: for each `field_registry` row whose `storage.entity` is `person`/`property`, its value currently lives inside the old `data`/`extra_data` jsonb blob — the promotion tooling described in `DB_SCHEMA.md` §9.2 (seed-file change + generated `ADD COLUMN` + value-copy) applies here too, just at table-creation time instead of after-the-fact.

---

## 5. Workflow engine

### 5.1 Today
`transitionRecord()` in `records.service.js` is **already DB-driven with a hardcoded fallback**, not a pure static object as `CLAUDE.md` describes:
```js
let dbRule = await trx('workflow_transitions_config')
  .where({ from_status, action: action.toLowerCase(), is_active: true })
  .andWhere(b => b.where('record_type', record.record_type).orWhere('record_type','*'))
  .first();
// falls back to FALLBACK_TRANSITIONS if no dbRule found
```
`workflow_transitions_config` the table exists (migration `20260617000000`) but **is never seeded** — `FALLBACK_TRANSITIONS` (a hardcoded 5-status object: `PENDING_SHO`, `DISTRICT_REVIEW`, `JCP_REVIEW`, `SCP_REVIEW`, `HQ_RECEIVED`) is load-bearing in every real deployment today. There's also a `level_data_contracts`-based override: for `DISTRICT_REVIEW`→`approve`, if a `route='DIRECT_HQ'` contract row exists, the transition skips straight to `HQ_RECEIVED`.

### 5.2 Target
`workflow_transitions_config` gets seeded via `config/workflow/*.json` → `sync-config` (§7) with rows covering every transition `FALLBACK_TRANSITIONS` covers today, **plus** the new `IN_TRANSFER` transitions (`initiate`→`IN_TRANSFER`, `accept`→(destination status/level), `reject`→(restore `prior_status`/`prior_level` from `record_transfers`, not from config — see §6)) and the `LEGACY_IMPORTED`/`AMENDMENT_PENDING` specials. Once seeded, `FALLBACK_TRANSITIONS` is deleted from `records.service.js` — `workflow_transitions_config` becomes the single source of truth per `DB_SCHEMA.md` §4.5. The `level_data_contracts` route-override mechanism is kept and generalized (not just `DISTRICT_REVIEW`→`DIRECT_HQ`; any `(from_level,to_level,record_type)` with a matching active contract can express a route skip).

`workflow.service.js`/`workflow.controller.js` (dead parallel reimplementation, §1.3) are deleted outright.

---

## 6. Case transfer module (new)

There is **zero existing code** for this — confirmed via repo-wide grep (`transfer` matches only two cosmetic status-string options in a dropdown, no workflow). This is genuinely new: a `backend/src/modules/transfers/` module (`transfers.router.js`/`.controller.js`/`.service.js`), dual-mounted like every other module.

### 6.1 Two-step handshake (per `DB_SCHEMA.md` §4.1, `DB_REDESIGN_DECISIONS.md` §3.3/T1-b)
- **Initiate** (`POST /transfers`, SHO/DISTRICT_OFFICER of the *from* PS/district): validates the record isn't already `IN_TRANSFER`, snapshots `prior_status`/`prior_level` onto the new `record_transfers` row, flips `records.current_status → IN_TRANSFER` via the normal `transitionRecord()` path (so this reuses §5's single revision-write path, `change_type='TRANSFER'`), publishes `transfer.initiated`.
- **Accept** (`POST /transfers/:id/accept`, SHO/DISTRICT_OFFICER of the *to* PS/district) — one transaction:
  1. Flip `records.ps_id/district_id/sub_div_id` to the destination.
  2. If `records.original_ps_id IS NULL`, set it to the *pre-transfer* `ps_id` (write-once, immutable after — this is why it must be read before step 1 overwrites `ps_id`).
  3. **CASE only:** flip `fir_details.ps_id` to match; row-lock-increment `fir_number_counters(ps_id=destination, fir_year)` to allocate the new `fir_no`; if `fir_details.original_fir_no IS NULL`, set `original_fir_no/original_fir_year` from the pre-transfer values (write-once). Record the newly assigned number onto `record_transfers.assigned_fir_no/_year` too (the full trail = `original_*` + each transfer row's `assigned_*` + current `fir_details.fir_no`).
  4. Set `record_transfers.status='ACCEPTED'`, `decided_by`/`decided_at`.
  5. Transition `records.current_status` out of `IN_TRANSFER` to whatever `workflow_transitions_config` says for `accept` from the *snapshotted* `prior_status` (not always back to the exact same state — e.g. a DISTRICT-level record transferred mid-review might resume at `PENDING_SHO` at the new PS, per config, not resume mid-review).
  6. Single hash-chained revision (`change_type='TRANSFER'`), `audit_logs`, commit, publish `transfer.accepted`.
- **Reject** (`POST /transfers/:id/reject`, same role as accept) — restores `records.current_status`/`current_level` from **`record_transfers.prior_status`/`prior_level`** (not from `workflow_transitions_config` — this is a documented `DB_SCHEMA.md` §9.4 special case, since the record's actual prior state may not be derivable from config alone), `status='REJECTED'`, single revision, publish `transfer.rejected`.

### 6.2 `fir_number_counters` allocator
Shared by **both** fresh FIR registration (in `records.service.js`'s CASE-type `createRecord`, once fields move off the current ad-hoc "typed by hand" `fir_no`) and transfer-accept (§6.1 step 3) — same `SELECT ... FOR UPDATE` row-lock-increment on `(ps_id, fir_year)`, same backstop `UNIQUE(ps_id, fir_year, fir_no)` on `fir_details` catching any allocator bug rather than relying on it.

### 6.3 RBAC
`allow('SHO','DISTRICT_OFFICER')` on initiate/accept/reject (matching existing approve/send-back permission sets); `verifyRecordAccess` extended to also permit access when the acting user's `ps_id` matches `record_transfers.to_ps_id` for a `PENDING` transfer targeting them (so a receiving SHO can see/act on a transfer for a record they don't yet own).

---

## 7. Config-as-data pipeline

### 7.1 Today — partially real, not invented from scratch
`backend/seeds/01_fields.js` (1500+ lines) is **already** exactly the target pattern for `field_registry`: hand-authored, checked into git, `ON CONFLICT (field_key) DO UPDATE`, with its own header comment declaring itself "the canonical source for ALL field_registry definitions." `backend/seeds/03_config.js` does the same `ON CONFLICT (id)`/`ON CONFLICT (code) DO NOTHING` upsert shape for `report_templates` (5 rows) and `link_type_registry` (4 rows) — but **not** for `workflow_transitions_config` (table exists, unseeded — §5.1) or `level_data_contracts`.

### 7.2 Target
Generalize the existing upsert-seed pattern into one `npm run sync-config` command (new script, `backend/scripts/sync-config.js` or similar) that reads:
```
config/workflow/*.json      → workflow_transitions_config   (upsert by `code`)
config/fields/<type>.json   → field_registry                 (upsert by `field_key`)
config/proformas/<name>.json → report_templates               (upsert by `code`, ONE FILE PER PROFORMA)
config/contracts/*.json     → level_data_contracts            (upsert by `code`)
```
Each row carries a `checksum` column (already present in `DB_SCHEMA.md`'s design for all four tables) computed over its own JSON so `sync-config` is a true no-op when nothing changed — same idempotence guarantee `01_fields.js`/`03_config.js` already give, just unified into one command instead of four separate Knex seed files, and now covering all four config surfaces instead of two. Migrations remain schema-only forever (per `DB_SCHEMA.md` §0); `01_fields.js`-style Knex seeds are retired in favor of `sync-config` reading from `config/` directly (the existing seed files become the **source data** migrated into the new `config/*.json` layout, not deleted-and-forgotten).

`report-builder`'s `reportableFields.config.js` (hand-maintained today, `ALLOWED_TABLES`/`ALLOWED_JOINS`/per-field operator config) is **regenerated from `field_registry.storage` mappings** rather than hand-maintained — a build step (or a runtime query, cached) rather than a checked-in file, per `DB_SCHEMA.md` §6.1's "report-engine catalog regenerates from these storage mappings — never hand-maintained."

---

## 8. `ref` schema loader

### 8.1 Today
Two generations of the same loader exist: `backend/scripts/menu_table().js` (older, non-idempotent, hardcoded absolute Windows path, truncate-and-reload via positional `row.values[n]` cell indices, manual state-machine for multi-block sheets like ARMS AND AMMUNITION) and its Knex-seed successor `backend/seeds/02_menu_tables.js` (same cell-parsing logic, checked-in relative-path `Menu_Tables.xlsx`, runs via `npm run db:seed`). Both target the 20 legacy `excel_*` tables.

### 8.2 Target
A `ref.*` loader generalizing `02_menu_tables.js`'s shape: same XLSX source, same truncate-and-reload semantics, but targeting `ref.*` (renamed tables, real FK discipline per `DB_SCHEMA.md` §8) with an explicit **FK load order** (acts/major_heads/arms_categories/property-category-parents first, then their dependents) and **fail-loud on duplicate natural keys** (never silently skip/overwrite — a hard requirement since `⚠ verify` natural keys in `DB_SCHEMA.md` §8 haven't been confirmed against real sheet data yet). `menu_table().js` is deleted outright (dead, superseded even today).

---

## 9. Unified report engine

This is the most structurally-changed part of the system, and the most complex — see `ARCHITECTURE_DIAGRAMS.md` for the full sequence diagram.

### 9.1 Today — three independent engines, all reading `records.data::jsonb`
1. **`reports.controller.js`** — 9 "classic" templates + 2 `LINKED` templates + **17 hardcoded `DAILY_DIARY_PARALLEL` templates**, all in an in-memory array merged with any `report_templates` DB rows (DB wins on id collision). `generateReport` publishes `report.requested` for the Python path, but there's **also** a separate Node-side `generateReportInternal`/Puppeteer-PDF/ExcelJS-Excel/string-concat-CSV path used only by the scheduler for the 9 classic templates — genuinely duplicated rendering logic. The `daily-status` Excel branch additionally shells out to *yet another* Python invocation via `execSync` with the **DB password passed as a CLI arg** (visible in `ps`) — the exact anti-pattern `DB_REDESIGN_DECISIONS.md` §L7.1 calls out.
2. **`python_worker`** — RabbitMQ-driven (`report-generation-queue`), `generator.py`'s `query_records()` builds raw SQL selecting `(records.data::jsonb)->>'key' as key` per template field, `registry.py` globs 24 `sheets/sheet_*.py` files each hand-mapping specific jsonb keys (`formatters.py`'s `format_person()` does prefix-sniffing across ~15 possible key-name variants to find a field), `builder.py` renders via openpyxl.
3. **`report-builder`** — `queryEngine.js` (873 lines) + `reportableFields.config.js` (`ALLOWED_JOINS` doing jsonb-key string matching, e.g. `CASE.data->>'fir_no' = ARREST.data->>'linked_fir_dd_no'`) — an independent ad-hoc filter/query engine for ops-facing custom reports, never touches Python.

### 9.2 Target — one engine, Python-only rendering
**`report_templates`** (config-synced, §7) is the single template source. Kill: the in-memory array in `reports.controller.js`, the 17 hardcoded `DAILY_DIARY_PARALLEL` entries (each daily-diary sheet becomes its own `report_templates` row, `template_type='PROFORMA'`, tagged into a `config/diaries/daily_diary.json` list of proforma codes per `DB_SCHEMA.md` §6), `python_worker/templates/*.json`'s local-file fallback.

**Node's role** (unchanged in kind, narrower in scope): HTTP API, RBAC/scope validation (HC can't request other-PS data, etc. — logic already exists in `reports.controller.js`, kept), `report_jobs` row lifecycle (`PENDING`→`RUNNING`→`READY`/`FAILED`, one consistent casing — today's status casing is inconsistent, `'PENDING'` vs `'pending'`; target: fix to one consistent enum), publishing `report.requested`. Any genuinely Node-side pre-classification logic that's cheap and already correct (e.g. `daily-diary.service.js`'s `mapRecordsToSheets` — 34-sheet classification, per the existing "Node classifies, Python formats" precedent already established in the repo's own root `HANDOFF.md`) can be kept **if** it's rewritten to read typed columns instead of `records.data` jsonb; otherwise the equivalent classification logic moves into Python where it can run directly against the query result.

**Python's role**: `generator.py`'s `query_records()` is rewritten to build typed-column SQL (real joins through `records`+detail tables+`persons`+`record_properties`+`ref.*`, driven by `report_templates.template_definition`'s field list resolved against `field_registry.storage`) instead of `data::jsonb->>'key'`. The 24 `sheets/sheet_*.py` files **keep their per-sheet-file shape** (one file per proforma sheet is a reasonable unit of ownership) but `map_row()` functions read typed dict keys from the query result directly — `formatters.py`'s prefix-sniffing (`format_person()` scanning ~15 possible key names) is deleted, replaced by direct access since the typed-column query result has exactly one, unambiguous key per fact. Rendering: **openpyxl for Excel** (already used, kept), **WeasyPrint for PDF** (already listed as a dependency per root `HANDOFF.md`'s stack description — becomes the actual PDF path, replacing Puppeteer), Python `csv` module for CSV (replacing Node's string-concatenation CSV builder). Puppeteer is **not deleted from the dependency tree** but is documented as a case-by-case escape hatch only, invoked (if ever) from a clearly-marked Node code path for a specific proforma that WeasyPrint can't render acceptably — not a default.

`pharos_report_ro` (per `DB_SCHEMA.md` §9.5): dedicated Postgres role, SELECT-only on `records`+5 detail tables+`record_offences`+`locations`+`persons`(+3 subtypes)+`record_properties`+`record_links`+`link_type_registry`+`hierarchy_nodes`+`investigating_officers`+`field_registry`+`report_templates`+all of `ref.*`. `python_worker/db.py`'s engine connects with this role's credentials (env var, never argv — closing the `execSync --password` hole in the same motion as deleting that code path). Job-status writes (`report_jobs.status`) stay Node-owned (worker communicates success/failure via its existing stdout/exit + `mark_job_failed` DB write pattern — if that write needs a grant, it's the **only** write grant the role gets, per `DB_SCHEMA.md` §9.5's either/or).

**`report-builder`'s `ALLOWED_JOINS`** becomes real FK joins: `CASE+ARREST` via `record_links` (already the correct mechanism per `docs/RECORD-LINKAGE.md` — the jsonb-key-matching join in today's config is redundant with a table that already exists and is more correct), `CASE+MISSING`/others similarly via `record_links` or a real FK where one exists (e.g. `fir_details.fir_no` unique key) instead of string-matching two different jsonb keys that happen to often contain the same value.

---

## 10. Frontend architecture

### 10.1 Reality check: two generations of frontend code coexist
Confirmed via `AppRouter.jsx` + full-repo grep: there's a **dead prototype generation** (`components/DynamicForm/DynamicForm.jsx` — Ant Design, 237 lines, no persons/properties split at all; `pages/records/RegistrationPage.jsx`, `pages/queue/QueuePage.jsx`; `context/AuthContext.jsx` singular; `api/records.api.js`) that is simply **not imported by `AppRouter.jsx`** — not a "which one is canonical" ambiguity, one generation is live and routed, the other is orphaned. The **live, routed app** uses `components/forms/DynamicForm.jsx` (4231 lines), `pages/hc/NewRecord.jsx`, `pages/sho/{Queue,RecordDetail}.jsx`, `utils/api.js`, `store/authStore.js` + `contexts/AuthContext.jsx` (plural).

**Target: delete the dead generation outright** — `components/DynamicForm/DynamicForm.jsx`, `pages/records/RegistrationPage.jsx`, `pages/queue/QueuePage.jsx`, `context/AuthContext.jsx` (singular), `api/records.api.js`. This isn't a migration, it's deleting code with zero importers.

### 10.2 `components/forms/DynamicForm.jsx` — today's contract
- Schema: `hooks/useFormSchema.js` → `GET /fields/form/:recordType`, returns `sections[]` (not a flat field list) — each section `{section, title_en/hi, is_repeater, entity_type?, person_type?, fields[], sub_tabs?[]}`.
- **Property/vehicle repeater is genuinely metadata-driven** — this is the pattern to generalize (§10.3): major-category options from the schema field itself, minor-category options via a small hardcoded major→field-key lookup (`vehicle→prop_vehicle_type`, etc.) resolving to schema-driven option lists, extra fields via `f.repeater_entity.toUpperCase()==='PROPERTY'` + `show_when` evaluation — **no hardcoded per-category JSX**.
- **Person repeaters are inconsistent** — `arrested_info`/`intimation_details` go through a small hardcoded `REPEATER_SECTION_META` map (`{is_repeater, entity_type:'person', person_type}`) merged onto the schema and DO reach the final `persons[]` array on submit. **`victim_info`/`accused_info` are bespoke modal UIs storing entries under ad-hoc `repeaterState.PERSON_VICTIM`/`PERSON_ACCUSED` keys that the submit builder (`for (const section of finalSchema) { if (!section.is_repeater) continue; ... }`) never walks — victim/accused entries are silently dropped from the `persons[]` array sent to the backend.** This is a real, confirmed gap (not a design choice) that must close before the new `persons` table can be considered fully wired from the frontend.
- Submit signature is **already split**: `onSubmit(finalValues, persons, properties, activeRecordId)` — this is the contract the new backend's split-write (§4.3) consumes directly; no submit-shape redesign needed, only closing the victim/accused gap and (§10.4) generalizing every person role onto one consistent pattern.
- Two **independent, near-duplicate** nickname/alias chip-input implementations exist: a generic suffix-matched one in `FieldRenderer.jsx` (`key.endsWith('_nickname'|'_nick_name'|'_alias')` → `NicknameChipsField`) and a locally-defined duplicate added inline in `DynamicForm.jsx` for two specific hardcoded modal render paths that bypass `FieldRenderer`. **Target: delete the DynamicForm-local duplicate, route those two render paths through `FieldRenderer`'s existing generic one** — this maps cleanly onto `persons.nick_names jsonb` (§ DB_SCHEMA.md §3.1) either way, it's a pure de-duplication.

### 10.3 Target: generalize the property-repeater pattern to every person role
Every person role (`COMPLAINANT`, `ACCUSED`, `VICTIM`, `WITNESS`, `ARRESTEE`, `MISSING`, `DECEASED`, `INFORMANT`, `CALLER`) gets the same treatment `arrested_info`/`intimation_details` already have: `field_registry.repeater_entity`/`storage:{entity:'person', role, column}` drives a **single generic** add/edit/delete repeater component (the property-repeater's pattern, since it's the one with zero hardcoding), storing entries uniformly (not split between `REPEATER_SECTION_META`-driven sections and ad-hoc `repeaterState.PERSON_X` modal state), and the submit builder walks **all** person-role sections uniformly rather than only ones flagged `is_repeater` in the hardcoded map. Role subtype fields (`arrestee_details`, `missing_person_details`, `person_descriptions`) render as additional fields within the same generic repeater row, gated by the entry's `role` — same `show_when`-style conditional mechanism already used for property extra-fields.

### 10.4 Retirement list (frontend)
| File | Why |
|---|---|
| `components/DynamicForm/DynamicForm.jsx` | Dead, unrouted, no persons/properties support |
| `pages/records/RegistrationPage.jsx`, `pages/queue/QueuePage.jsx` | Dead, only importers of the above |
| `context/AuthContext.jsx` (singular) | Dead duplicate of `contexts/AuthContext.jsx` |
| `api/records.api.js` | Zero importers |
| `pages/CaseManagement.jsx`, `ArrestManagement.jsx`, `PCRCallEntry.jsx`, `MissingPersonEntry.jsx`, `UIDBManagement.jsx` | Hand-built, not DynamicForm, submit a flat object into a `data:` field with ad-hoc nested arrays (e.g. `accusedList` inside the jsonb blob) — structurally incompatible with the typed spine+detail+persons+properties write path. Routed today as a "legacy console" alongside the real `/records/new/:type` flow. **Migrate their functionality onto `NewRecord.jsx`+`DynamicForm.jsx` and delete these five, or explicitly retire the legacy console routes** — do not update these five files to the new schema in place, since that would mean maintaining the split-payload logic twice. |
| DynamicForm-local duplicate `NicknameChipsField` | Superseded by `FieldRenderer.jsx`'s generic suffix-matched one (§10.2) |

### 10.5 i18n boundary (documented, unchanged)
Two parallel bilingual systems coexist by design, not by accident: react-i18next (`en.json`/`hi.json`) for static app-chrome strings only; `field_registry.labels.{en,hi}` consumed directly (no i18n-key indirection) for all dynamic field/section text. This means schema changes to `field_registry` are visible in the UI with no frontend redeploy — worth preserving exactly as-is; do not attempt to route field labels through i18next keys.

### 10.6 `field_registry.storage` as the frontend/backend contract
The four storage shapes from `DB_SCHEMA.md` §6.1 (ruling 15 added the fourth) are the explicit contract `DynamicForm`'s submit builder must honor when assembling the split payload:
- `{table, column}` → scalar field on the record's detail table → lands in `data` (the flat non-repeater part of the payload, as today).
- `{entity:'person'|'property', role?, column}` → repeater entry → lands in `persons[]`/`properties[]` (as today, once §10.3 generalizes every role onto this path).
- `{entity:'location', slot, column}` → address-block component → grouped by slot into a location object on the owning entry (occurrence block on the record, present/permanent on a person entry, …); the backend writes each slot's object as one `locations` row and stamps the owner's FK.
- `'extra'` → same routing as above (detail table's `data`, or a person/property entry), just destined for that table's `extra jsonb` column instead of a named column — **no frontend difference**, this shape only matters to the backend's write path (§4.3) and the report engine (§9.2, which must know to exclude `extra`-mapped fields from the reportable-fields catalog per `DB_SCHEMA.md`'s "second-class by design" rule).

---

## 11. Hash chain & verification

- **Single write path**: §4.2 — `records.service.js` is the only writer, using `SELECT ... FOR UPDATE` (or equivalent locking) to serialize `revision_number`/`prev_hash` assignment per record.
- **Canonicalization**: a stable, versioned serialization of the revision payload (field order fixed, no floating timestamp drift) computed in one shared utility (`utils/hash.js`, already exists) — `hash_version` bumps only via a documented, versioned scheme change, never silently.
- **Verification job**: scheduled (reuse the existing `node-cron` dependency already in `package.json`, same pattern as `warehouse.scheduler.js`'s ETL cadence, just walking `record_revisions` chains instead) — calls the existing `verifyAuditChain(db)` utility (already implemented, confirmed in `audit.controller.js`'s `verifyAuditChainEndpoint`), which already publishes `audit.chain_break_detected` on a break.
- **Break/freeze runbook**: on `audit.chain_break_detected` (§2.3, new consumer needed — today nothing subscribes to this event despite it already being published): (1) set `records.is_frozen = true` for the affected record — write path must check this flag and reject further mutations with a clear error; (2) loud alert (`logger.error` at minimum; a `notifications` row to all `SYSTEM_ADMIN` users at minimum, a real ops channel/email integration if one exists); (3) `audit_logs` entry recording the break detection itself; (4) manual review process to determine root cause before a privileged `SYSTEM_ADMIN`-only unfreeze endpoint clears `is_frozen`. This runbook has no existing analog to build on — it's new, but small (one new subscriber + one new guarded endpoint + the flag check already specified in `DB_SCHEMA.md`).

---

## 12. Explicit kill list (cross-referenced, both research passes)

**Backend:**
- `workflow.service.js`, `workflow.controller.js` — dead parallel state-machine reimplementation (§5.2, §1.3).
- `notifications/notifications.service.js`'s `initSubscriptions()`/`handleRecordStatusChanged` — dead handler, wrong event, mock user id (§2.2).
- `custom_field_definitions`/`custom_field_values` (EAV pair) — superseded by `field_registry` scoping (already in `DB_REDESIGN_DECISIONS.md`'s kill list; confirmed still live in `admin/customFields.controller.js` today as a second, parallel extensibility mechanism to `field_registry` — both exist today, only one should going forward).
- `warehouse` module (`rpt` schema, ETL, `warehouse.scheduler.js`) — entire warehouse killed per `DB_REDESIGN_DECISIONS.md` Level 2; `analytics.controller.js`'s dead SQLite-detection code (`getJsonPathSql()`) goes with it.
- `legacy_import_batches` + `legacy_amendments` → merge into `import_batches`(`is_legacy` flag)/`record_amendments` per `DB_SCHEMA.md` §7.6/§4.6. `legacy.controller.js`'s amendment endpoints get rewired onto the merged tables, not deleted (amendments are a kept feature).
- In-memory report-template array (`reports.controller.js`), the 17 hardcoded `DAILY_DIARY_PARALLEL` entries, `python_worker/templates/*.json` local fallback, Node's Puppeteer/ExcelJS/CSV-string rendering paths, the `execSync`-to-python CLI-arg-password hack (§9.2).
- The async `record_revisions`-writing branch inside `auditHandler.js` (§4.2) — the dedupe-check logic it uses today becomes unnecessary once there's only one writer.
- `backend/scripts/menu_table().js` (§8.2) — dead, superseded by `02_menu_tables.js` even today, and both are superseded by the new `ref.*` loader.
- `python_worker/formatters.py`'s prefix-sniffing helpers (`format_person`'s ~15-key-name scan) — replaced by direct typed-key access (§9.2); `formatters.py`'s pure date/formatting helpers (`fmt_date`, `parse_date`, `format_occurrence`, `format_io`) are kept, they're generically useful regardless of key source.

**Frontend:** the full retirement list in §10.4.

---

## 13. Migration/cutover posture

Sequencing implementation work by what's already half-built vs. genuinely new (see `ARCHITECTURE_HANDOFF.md` for the actual suggested order):

**Already halfway there (lower risk, mostly "finish the typing"):**
- `record_persons`/`record_properties` hybrid tables → typed `persons`/`record_properties` (schema migration + value-copy from the existing `data`/`extra_data` jsonb blobs, same promotion-tooling shape `DB_SCHEMA.md` §9.2 already describes for a different purpose).
- `field_registry`/`report_templates` config-as-data → generalize the existing upsert pattern to `sync-config` covering all four tables (§7).
- `workflow_transitions_config` → seed it; the DB-driven lookup code already exists, only the fallback deletion + seeding is new (§5.2).
- Frontend split-submit contract → already exists; close the victim/accused gap and generalize (§10.3).

**Genuinely new (higher design risk, no existing code to build on):**
- `record_transfers`/`fir_number_counters`/the whole `transfers` module (§6).
- `ref` schema + its loader (renamed tables, real FK discipline — §8).
- Hash-chain single-write-path consolidation + verification job + freeze runbook (§4.2, §11) — the trickiest correctness-sensitive piece, since it touches concurrency (row locking) that today's code doesn't have at all.
- Unified report engine (§9) — the largest single piece of work, touching three currently-independent codebases (Node reports.controller, python_worker, report-builder).
