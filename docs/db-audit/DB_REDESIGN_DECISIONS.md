# PHAROS DB Redesign — Architecture Decisions (Contract for Implementation)

**Status:** FINAL — all levels decided by the architect, 2026-07-07.
**Companion:** `DB_GROUND_TRUTH.md` (pre-restructure audit of the old schema — mine it, then let it die).
**Data migration:** NONE required. Dev/seed data is disposable. Fresh migrations + reseed.
**Scale target:** ≥800k records average (design indexes/constraints for this, not for 51 dev rows).

This document defines WHAT the schema must be and WHY. Claude Code decides implementation details (exact column lists, index tuning, migration ordering) within these constraints. Where the doc says "mine the `*_master` views / `rpt.fact_*` columns," those dead objects in the old schema are the most complete typed catalog of what lives inside `records.data` per record type — extract their column lists as design input, then drop them.

---

## Level 1 — Core record model: supertype/subtype (Option C)

### 1.1 Structure
- **`records`** = the shared spine. Holds only what workflow, scoping, and list screens need:
  `id, record_type, ps_id, district_id, sub_div_id, current_status, current_level, record_date, created_by/at, updated_by/at, is_legacy, source_system, legacy_ref, imported_at/by`.
- **One typed detail table per record type**, 1:1 FK → `records.id`:
  `fir_details, arrest_details, pcr_call_details, missing_details, uidb_details`.
  All domain fields become **real typed columns** (fir_no, gd_no, occurrence_date/time, crime_head, local_head, sections/acts, brief_facts, io fields, …). Column lists: derive from the dead `*_master` views + `rpt.fact_*` + current form specs.
- Rule of thumb for placement: workflow/scoping/list needs it → `records`; only that type's form or reports need it → detail table.
- **Adding a new record type = new detail table.** Acceptable and expected.

### 1.2 Dynamic-field escape hatch (C2-b)
- Each detail table carries exactly **one `extra jsonb` column** (default `'{}'`).
- `field_registry` records each field's **storage mapping**: `{table, column}` or `storage = 'extra'`.
- New field without deploy → registry row with `storage='extra'`, form renders it, value lands in `extra`.
- **Promotion discipline:** any `extra` field that becomes reporting-relevant gets promoted to a real column via tooling (seed-file change + generated `ADD COLUMN` migration). `extra` fields are second-class: invisible to the report engine by design.
- Everything else JSON in the system becomes **native `jsonb`** (no JSON-in-text anywhere).

### 1.3 Persons — supertype/subtype, per-record
- **`persons`**: `id, record_id FK, role (COMPLAINANT/ACCUSED/VICTIM/WITNESS/ARRESTEE/MISSING/IO/...), name, father_name, gender, age/dob, address, mobile, district, ... , sort_order`.
- Role-specific subtype tables only where a role has real extra facts (e.g. `arrestee_details`, `missing_person_details`), 1:1 FK → `persons.id`.
- **Person rows are per-record — FINAL.** No cross-record identity now. Future path (documented, not built): add `identities` table + nullable `persons.identity_id` FK + matching process. Add-on, not redesign.
- Persons/properties are the ONLY place person/property facts live. The form wizard writes here — never into any jsonb.

### 1.4 Properties — same pattern
- Base `record_properties` (typed: record_id FK, category fields as **FKs into `ref.*` lookups**, status, details, uid, sort_order, timestamps) + category-specific FK columns (vehicle → automobiles, firearm → arms) rather than subtables unless a category genuinely needs many extra fields.
- Fix old bug class: all timestamps `timestamptz` (old `updated_at text` bug must not recur).

---

## Level 2 — Reporting layer: warehouse DELETED (Option 2-A)

- **Drop the entire `rpt` schema** (6 dims, 5 facts, 2 bridges, sync_log), the ETL code, scheduler, and backfill scripts — after mining fact-table column lists for Level 1.
- **Drop all 32 views + `mv_record_stats`** — after mining `*_master` for column lists. `ref_district`/`ref_police_station` consumers (import module) switch to direct hierarchy queries.
- The **report engine queries live tables directly** (records + details + persons + properties + ref lookups). At 800k rows with typed, indexed columns this is comfortably fast.
- **Targeted materialized views/summary tables may be added later** only when a specific proforma is proven slow — inside the main schema, not a parallel warehouse. Open to re-adding heavier infrastructure at real scale; nothing in this design blocks it.
- Non-negotiable principle: **the typed detail tables are the ONE typed schema.** Never again three hand-maintained copies (views / facts / python sheets).

---

## Level 3 — Hierarchy, scoping, naming, transfers

### 3.1 Scoping strategy: denormalized ids (3.1-A)
- `hierarchy_nodes` stays an adjacency-list tree (HQ→ZONE→RANGE→DISTRICT→SUB_DIV→PS); `metadata` becomes `jsonb`.
- `records` carries `ps_id, district_id, sub_div_id` directly; scope checks are plain indexed WHEREs. If zone/range-level proformas exist, also stamp `zone_id/range_id` (Claude Code: verify against proforma specs).
- Rare hierarchy reorgs = scripted backfill. Accepted trade.

### 3.2 Naming: `ps_id` everywhere — FINAL
- The `users.station_id` column renames to `ps_id`. There is no such thing as `station_id` anywhere: DB, JWT, code, docs. (JWT already says ps_id — DB conforms to it.)
- `users` keeps denormalized `ps_id/district_id/sub_div_id` (same deliberate denormalization as 3.1).
- `users.role` gets a CHECK constraint (see Level 6).

### 3.3 Case transfer — first-class feature (T1-b)
- **`record_transfers`**: `id, record_id FK, from_ps_id FK, to_ps_id FK, initiated_by FK, initiated_at, reason, order_ref, status (PENDING/ACCEPTED/REJECTED), decided_by FK, decided_at, decision_comment`.
- **Two-step handshake:** initiate → record enters `IN_TRANSFER` status (workflow config gains these transitions) → receiving side accepts or rejects.
  - ACCEPT (one transaction): flip record's `ps_id/district_id/sub_div_id`; receiving PS assigns the **new FIR number** (accept and renumber are one action).
  - REJECT: record snaps back to prior status.
- **FIR renumbering on transfer — confirmed requirement.** `fir_details` gets: `fir_no + fir_year` (current, at current PS) and `original_fir_no / original_ps_id / original_fir_year` (set on first transfer, immutable).
- Uniqueness survives: `UNIQUE(ps_id, fir_no, fir_year)` on fir_details (via the record's ps — Claude Code chooses whether to denormalize ps onto fir_details or enforce via trigger/generated join; constraint semantics are the requirement).
- **Multiple transfers supported** (multiple rows, ordered by initiated_at).
- **Old-PS read-back visibility: undecided, deliberately.** The transfers table itself is the future grant mechanism (join through transfers). Pure scope-logic toggle in code; zero schema cost. Do not block on it.

---

## Level 4 — Reference data: `ref` schema, full FK discipline (Option 4-A)

- All 21 `excel_*` tables move to a **`ref` schema**, renamed (`ref.acts, ref.sections, ref.major_heads, ref.minor_heads, ref.major_minor_mapping, ref.local_heads, ref.beats, ref.fire_arms, ref.arms_categories, ...`).
- **Complete and individually sufficient:** every table keeps ALL its real typed columns (sections keeps its 6; nothing smashed into jsonb). No generic lookup table.
- **Every implicit relationship becomes an enforced FK:** minor_heads→major_heads, fire_arms→arms_categories, major_minor_mapping→acts/sections/major_heads, property items→categories→types, **beats.ps_id → hierarchy_nodes.id** (beats are org data; enforce it).
- **UNIQUE constraints on every code column.**
- **Upward FK discipline:** classification columns in detail/property tables are real FKs into `ref.*`. Garbage codes can never enter a record.
- **English-only — FINAL for now.** No `label_hi` columns. Hindi later = additive columns or a translations table; no redesign.
- Loader script (`menu_table().js`) updates to target `ref.*` and must satisfy FK load order.

---

## Level 5 — Config-as-data: one unified pattern

**Pattern for all three:** authored in git (versioned seed files) → synced into DB (idempotent upsert keyed on stable code/key, checksum so unchanged = no-op; single `npm run sync-config`) → runtime reads DB only. Every dev's Docker DB and prod get identical rows from the same files. Admin-UI editing can be layered on later — it edits the same tables.

| # | Config | Git source | DB table (runtime truth) | Deleted duplicate |
|---|---|---|---|---|
| 5.1 | Workflow rules (DB-driven) | `config/workflow/*.json` | `workflow_transitions_config` | in-code TRANSITIONS object — DELETE; `transitionRecord()` reads DB only |
| 5.2 | Field definitions | `config/fields/<record_type>.json` | `field_registry` | 18 row-mutating migrations — never again; migrations are schema-only forever |
| 5.3 | Proforma specs | `config/proformas/<name>.json` — ONE FILE PER PROFORMA | `report_templates` | in-memory template array + orphan HTML files |

- `field_registry` is reduced to **UI metadata + storage mapping** (labels, type, section, ordering, visibility, show_when, validation rules, `storage: {table,column} | 'extra'`). It has NO storage role of its own. All its 6 JSON-in-text columns → `jsonb`.
- Field tooling: adding a typed field is one command → updates seed file + generates the `ADD COLUMN` migration together (this is what makes C2-a-style discipline "easy" while keeping the C2-b pocket).
- Diaries = simple lists of proforma references (`config/diaries/daily_diary.json` → ["proforma_01", …]).
- `scheduled_reports.template_id` FK → `report_templates` becomes valid and enforced (templates now actually exist as rows).
- Report engine catalog (`reportableFields.config.js` or successor) **regenerates from `field_registry` storage mappings** — never hand-maintained.

---

## Level 6 — Conventions & integrity

1. **IDs:** native `uuid` PK, `DEFAULT gen_random_uuid()`, on all transactional tables. `ref.*` uses natural integer codes as PKs. `varchar(36)` and stray serials are dead.
2. **Enum strategy: CHECK constraints + config-driven validation, NOT Postgres native ENUMs** (too rigid during active development).
   - `record_type`, levels: CHECK constraints.
   - Statuses: the set of legal statuses is defined by `workflow_transitions_config` (single truth).
   - `users.role`, person `role`, transfer `status`: CHECK constraints synced with seed config.
3. **Timestamps:** `timestamptz` everywhere; `created_at timestamptz NOT NULL DEFAULT now()` + `updated_at` on every table.
4. **Integrity additions:**
   - `record_revisions`: `UNIQUE(record_id, revision_number)`; `field_changes` → `jsonb`.
   - `fir_details`: `UNIQUE(ps_id, fir_no, fir_year)` semantics (business-key dedup at DB level, no longer app-endpoint-only).
   - `record_links`: keep existing UNIQUE(source,target,type); `link_type_registry` stays; `metadata` → `jsonb`.
5. **Hash chain — IMPLEMENT (decision b).** Tamper-evident audit for legal/court scrutiny:
   - `record_revisions.prev_hash / row_hash` become real: every revision write computes `row_hash = H(canonical revision payload ‖ prev_hash)`; `prev_hash` = previous revision's `row_hash` for that record (genesis = defined constant).
   - Hashing must happen inside the single revision-write path (one choke point — no dual write paths; the old audit found two, consolidate them).
   - **Verification job** (scheduled): walks chains, reports breaks.
   - **Break procedure** (documented runbook): alert, freeze the affected record's writes pending review, log to audit_logs. Claude Code drafts the runbook; the requirement is that verification failure is loud, never silent.
   - Canonicalization (stable field ordering/serialization) must be specified in code and never change without a versioned scheme (`hash_version` column recommended).
6. **Kill list — confirmed dead, do not recreate:**
   - `custom_field_definitions` + `custom_field_values` (EAV pair — superseded by field_registry scoping).
   - `compilations.record_ids` JSON array — the **`compilation_records` join table wins**; compilations' other JSON columns → `jsonb`.
   - `legacy_import_batches` + `legacy_amendments` → merged into `import_batches` (`is_legacy` flag) + a single amendments design if the feature is still wanted.
   - All 32 views, `mv_record_stats`, entire `rpt` schema (post-mining).
7. **Notifications (bilingual redesign per audit req 14d):** store `type + params jsonb`, render text via i18n at read time — English-only i18n for now, consistent with Level 4.

---

## Level 7 — Access model

1. **python_worker:** dedicated Postgres role `pharos_report_ro` — SELECT-only on exactly the tables it needs. Credentials via **environment, never argv** (current subprocess passes `--password` visible in `ps` — must die). Job-status writes: either Node owns them (worker communicates via stdout/exit protocol) or the role gets UPDATE on `report_jobs` only — Claude Code's call.
2. **Worker sheet files:** the 24 hardcoded JSONB-key mappings dissolve — sheets read real columns; preferred end-state: worker consumes proforma specs from `report_templates` instead of per-sheet hardcoding. (Whether the report engine eventually absorbs the worker entirely is an app-architecture decision, out of schema scope.)
3. **Raw SQL:** legitimate against typed columns. One rule: nothing hand-maintains a parallel field catalog — everything derives from `field_registry` storage mappings.

---

## Deferred features (explicitly parked, all additive later — none require redesign)

| Feature | Future path |
|---|---|
| Cross-record person identity | `identities` table + nullable `persons.identity_id` + matching process |
| Hindi labels | additive `label_hi` columns or translations table; i18n params already in place for notifications |
| Old-PS read-back after transfer | scope-logic toggle joining through `record_transfers` |
| Warehouse / heavy analytics | targeted matviews first; full warehouse only at proven scale pain |
| Admin UI for workflow/fields/proformas | edits the same config tables the seeds populate |

---

## Success criteria (how we know control is regained)

1. `\dt` output is self-explanatory: every domain fact has a named, typed home.
2. Exactly **one** typed schema of record data exists (the detail tables). Zero parallel re-typings.
3. Migrations contain schema only; all config diffs are readable in git under `config/`.
4. Every dropdown value in a record is an enforced FK. Every business key has a UNIQUE constraint.
5. `grep -r "data->>"` across the codebase returns ~nothing.
6. Revision hash-chain verification passes continuously.
