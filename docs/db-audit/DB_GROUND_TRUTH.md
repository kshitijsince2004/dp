# PHAROS DB — Ground Truth (pre-restructure audit)

**Generated:** 2026-07-06 from the live dev DB (`crime-diaries-db-1`, `pharos_db`, host port 5435).
**Regenerate:** `docker exec crime-diaries-db-1 pg_dump -U postgres -d pharos_db --schema-only > docs/db-audit/schema.sql` (raw dump committed alongside this file).
**Companion files:** `schema.sql` (raw ground truth), `schema-browser.html` (readable version), `HANDOFF.md` (progress/decisions).

This documents the CURRENT schema, warts included, so schema design can proceed without re-deriving anything. Data is disposable (dev/seed only) — no old→new migration needed.

---

## 1. Inventory summary

| Kind | Count | Notes |
|---|---|---|
| Base tables (`public`) | 51 | incl. `knex_migrations` + lock |
| Base tables (`rpt` schema) | 14 | star-schema warehouse (dims/facts/bridges/sync_log) |
| Views | 32 | **~30 are DEAD** (see §6) |
| Materialized views | 1 | `mv_record_stats` (0 rows, referenced by 1 src file) |
| Migrations | 32 files, all applied | `knex_migrations` batch history intact |

**Three ID conventions coexist:** app-generated UUID strings in `varchar(36)` (most tables) · native `uuid` + `gen_random_uuid()` (`record_links`, `link_type_registry`) · `serial` int (`excel_*`, all `rpt.*`).
**Timestamps:** consistently `timestamptz` ✅.
**JSON storage:** mostly JSON-in-`text` columns (see smells, §8); only `record_persons.data`, `record_properties.extra_data` are native `jsonb`.

### Domain grouping (skeleton for the new design)

| Domain | Tables |
|---|---|
| Identity & hierarchy | `users`, `hierarchy_nodes` |
| Records & workflow | `records`, `record_persons`, `record_properties`, `record_revisions`, `workflow_transitions`, `workflow_transitions_config`, `record_links`, `link_type_registry` |
| Form/field config | `field_registry`, `custom_field_definitions`, `custom_field_values`, `level_data_contracts`, `filter_presets` |
| Reference/lookup (dropdowns) | 21 `excel_*` tables |
| Compilation | `compilations`, `compilation_records` (dead) |
| Import & legacy | `import_batches`, `import_batch_errors`, `legacy_import_batches`, `legacy_amendments` |
| Reporting (jobs/templates) | `report_jobs`, `report_templates`, `scheduled_reports`, `report_builder_saved`, `report_builder_audit` |
| Warehouse (`rpt` schema) | 6 dims, 5 facts, 2 bridges, `sync_log` |
| Audit & notifications | `audit_logs`, `notifications` |
| Infra | `knex_migrations`, `knex_migrations_lock` |

### Dead / unused verdicts (grep across backend/src, backend/scripts, python_worker, frontend/src)

| Object | Verdict |
|---|---|
| ~30 of 33 views (`rpt_01..rpt_26`, `*_master`, most `ref_*`) | **DEAD** — zero references anywhere; both report consumers bypass them (§6) |
| `compilation_records` | **DEAD in src** — only seed script + migration; `compilations.record_ids` (JSON-in-text) is what the code actually uses. Two competing designs shipped |
| `custom_field_definitions` / `custom_field_values` | Code paths exist (admin + records modules) but **0 rows** — EAV feature unused in practice; `field_registry.scope_level/scope_id` now covers scoped custom fields |
| `record_revisions.prev_hash/row_hash` | **Dead columns** — NULL on all 154 rows; hash-chain audit never implemented |
| `mv_record_stats` | Built + referenced by 1 src file, 0 rows (never refreshed?) |
| `daily_records_meta`, `pcr_kalandras`, `missing_persons`, `arrests` (June-audit suspects) | **Never existed as tables** (`pcr_kalandra_master` is a dead view) |

### Row counts (live dev data, 2026-07-06)

Operational: records=51, record_revisions=154, workflow_transitions=103, users=16, hierarchy_nodes=262, field_registry=391, notifications=11, record_links=5, compilations=3, audit_logs=18, workflow_transitions_config=8, level_data_contracts=2, filter_presets=3.
Reference: excel_sections=17,236 · excel_beats=2,855 · excel_major_minor_mapping=2,136 · excel_other_property_items=935 · excel_minor_heads=916 · excel_acts=462 · excel_fire_arms=237 · others ≤167.
Warehouse: dim_police_station=192, dim_district=15, fact_fir=19, fact_arrest=12, fact_pcr=10, fact_missing=6, fact_uidb=4, sync_log=358 (ETL runs frequently). Empty: dim_officer/crime_head/case_status/act_law, both bridges.
Empty tables: users' EAV pair, import*, legacy*, report_jobs, report_templates, report_builder_*, scheduled_reports, link_type_registry, record_persons, record_properties.

---

## 2. Identity & hierarchy

### users (16 rows)
| Column | Type | Constraints |
|---|---|---|
| id | varchar(36) | PK |
| username | varchar(50) | NOT NULL, UNIQUE |
| badge_no | varchar(50) | NOT NULL, UNIQUE |
| name_en / name_hi | varchar(100) | NOT NULL |
| password_hash | varchar(255) | NOT NULL |
| role | varchar(20) | NOT NULL — free text: HC\|SHO\|DISTRICT_OFFICER\|HQ_ANALYST\|HQ_ADMIN\|SYSTEM_ADMIN (no CHECK/enum) |
| **station_id** | varchar(36) | FK → hierarchy_nodes.id |
| district_id | varchar(36) | FK → hierarchy_nodes.id |
| sub_div_id | varchar(36) | FK → hierarchy_nodes.id |
| is_active | boolean | NOT NULL default true |
| last_login, created_at | timestamptz | |

- **Used by:** auth module (login/JWT), users module (CRUD), reports (recipients), rbac.middleware (`enforceScope`), audit/notifications FKs.
- ⚠️ **Naming trap:** the column is `station_id`, but `auth.service.js` maps it into the JWT as BOTH `ps_id` and `psId` (lines 154–229). Every downstream scope check speaks "ps_id"; the DB speaks "station_id". CLAUDE.md wrongly claims both columns exist. Pick ONE name in the new design.
- ⚠️ `role` is unconstrained text. No `refresh_tokens` table exists (June docs mention one — tokens are stateless/JWT-only now).

### hierarchy_nodes (262 rows)
| Column | Type | Constraints |
|---|---|---|
| id | varchar(36) | PK |
| node_type | varchar(30) | NOT NULL (HQ/ZONE/RANGE/DISTRICT/SUB_DIV/PS — free text) |
| name_en / name_hi | varchar(100) | NOT NULL |
| code | varchar(30) | UNIQUE |
| parent_id | varchar(36) | FK → self |
| metadata | text | JSON-in-text |
| is_active | boolean | NOT NULL default true |

- **Used by:** hierarchy, auth, records, reports, daily-diary, import, legacy, report-builder, warehouse ETL, python_worker (`generator.py` joins for ps_name); FK target for 12+ tables.
- Adjacency list; every scope/report join walks it. `ref_district`/`ref_police_station` views were built to flatten it (import module uses them). Warehouse solves it again via `dim_district`/`dim_police_station`. **Three parallel flattening strategies** — new design must pick one.

---

## 3. Records & workflow (the core)

### records (51 rows)
| Column | Type | Constraints |
|---|---|---|
| id | varchar(36) | PK |
| record_type | varchar(20) | NOT NULL — CASE\|ARREST\|PCR_CALL\|MISSING\|UIDB (free text; old comment says 'CASES' — drift) |
| ps_id | varchar(36) | NOT NULL, FK → hierarchy_nodes |
| district_id | varchar(36) | NOT NULL, FK → hierarchy_nodes |
| sub_div_id | varchar(36) | FK → hierarchy_nodes |
| **data** | **text** | NOT NULL default '{}' — **JSON-in-text, cast `data::jsonb` at every query**; GIN index on the cast expression |
| current_status | varchar(30) | NOT NULL default 'DRAFT' |
| current_level | varchar(20) | NOT NULL default 'PS' |
| record_date | date | NOT NULL |
| created_by / updated_by | varchar(36) | FK → users |
| created_at / updated_at | timestamptz | |
| is_legacy | boolean | default false |
| source_system, legacy_ref | varchar(255) | |
| imported_at | timestamptz | ; imported_by FK → users |

Indexes: GIN `((data)::jsonb)`, btree on ps_id, district_id, record_type, current_status, record_date DESC.

- **Used by:** practically everything — records/workflow/compilation/analytics/daily-diary/report-builder/reports/import/legacy/record-links/warehouse modules, python_worker (raw SQL in `generator.py`), 36 frontend files (JSONB key contract).
- ⚠️ **No business-key uniqueness** (e.g. fir_no+ps+year) — dedup is an app-level endpoint only.
- ⚠️ All domain data lives in `data`; the reporting-critical keys are hardcoded in 4+ places (§7).

### record_persons (0 rows) / record_properties (0 rows)
Newer normalized side-tables (migration 20260627), the template for how JSONB should have been done:
- `record_persons`: id PK, record_id FK→records, person_type varchar(30) NOT NULL, first_name, last_name, mobile, city, district, **data jsonb** default '{}', sort_order, created_at. Indexes: GIN(data), btree first_name/mobile/record_id/(record_id,person_type).
- `record_properties`: id PK, record_id FK→records, major_category, minor_category, status default 'Stolen', details text, sort_order, created_at, uid text, fir_no text, **extra_data jsonb**, ⚠️ **updated_at is `text`** (bug — should be timestamptz).
- **Used by:** records + import modules. 0 rows — the wizard still writes persons/properties into `records.data`; these tables are populated only via import paths. Undecided duplication: same facts can live in both places.

### record_revisions (154 rows)
id PK, record_id FK→records CASCADE, revision_number int NOT NULL, changed_by FK→users, changed_at, level default 'PS', change_type varchar(30) NOT NULL (CREATE|UPDATE|STATUS_CHANGE|LEVEL_TRANSITION|HEAD_OVERRIDE), field_changes **text** ('[]'), comment, reason, ip_address, **prev_hash/row_hash varchar(64) — NULL on all rows (dead hash chain)**.
- **Used by:** records, audit, import, legacy modules; auditHandler (event bus) writes here.
- ⚠️ No unique(record_id, revision_number).

### workflow_transitions (103 rows)
id PK, record_id FK→records CASCADE, from_level/to_level, from_status, to_status NOT NULL, action NOT NULL, performed_by FK→users, performed_at, comment, target_fields text.
- Append-only transition ledger. **Used by:** records (transitionRecord writes), workflow, compilation.

### workflow_transitions_config (8 rows)
id PK, record_type default '*', from_status/to_status/action NOT NULL, allowed_roles **text** (JSON array, parsed with fallback `.split(',')` in records.service.js:680), requires_comment bool, sla_hours int, is_active.
- The DB-driven state machine (Phase 2 goal) — table exists and is seeded, but `transitionRecord()` still has the in-code TRANSITIONS object. **Both sources of truth live simultaneously** — verify which wins before redesign.

### record_links (5 rows) / link_type_registry (0 rows)
- `record_links`: **uuid PK** gen_random_uuid(), link_type_id uuid NOT NULL FK→link_type_registry, source_record_id/target_record_id FK→records, metadata text ('{}'), created_by FK→users, created_at. UNIQUE(source,target,link_type); btree source, target, (type,source).
- `link_type_registry`: uuid PK, code UNIQUE, source_record_type/target_record_type, label_en/hi, cardinality default 'ONE_TO_MANY', is_active, created_at. 4 rows (pg_stat reported 0 — stale); FK integrity verified: 0 orphan links.
- **Used by:** record-links module (13 raw-SQL statements — heaviest raw-SQL file), records.service (linked_fir_no filter), python_worker (`generator.py` reads record_links).

---

## 4. Form/field configuration

### field_registry (391 rows) — the heart of the dynamic-form system
| Column | Type | Notes |
|---|---|---|
| id | varchar(36) PK | |
| field_key | varchar(60) | NOT NULL, UNIQUE (since 20260625) |
| field_type | varchar(20) | NOT NULL |
| applicable_record_types | **text** | JSON array string |
| label_en / label_hi | varchar(120) | NOT NULL |
| options | **text** | JSON array [{value,label_en,label_hi}] |
| validation_rules | **text** | JSON |
| visible_to_levels / editable_by_levels | **text** | JSON arrays, NOT NULL |
| introduced_at_level | varchar(30) | default 'PS' |
| section | varchar(60) | ; section_label_en/hi varchar(120) |
| sort_order | **real** | float — allows insert-between ordering |
| full_width | boolean | |
| show_when | **text** | JSON {field,value} conditional visibility |
| is_active | boolean | NOT NULL |
| scope_level | varchar(50) | NOT NULL default 'global'; scope_id text |
| created_by | text | |
| readonly | boolean | |
| repeater_entity | varchar(50) | repeater groups (persons/properties) |
| depends_on | varchar(60) | cascade parent field |
| options_source | varchar(255) | points at an `excel_*` classification source |

- **Used by:** fields module (form API), records (validation/diff), import (template builder), reports, python_worker (labels), 18 migrations mutate its ROWS (field definitions shipped as migrations — this is why there are 32 migrations).
- ⚠️ 6 JSON-in-text columns parsed by bare `try{JSON.parse}catch{}` in 3 different files. `options_source` + `depends_on` + `show_when` form an implicit dependency graph with zero DB-level integrity.
- 📌 **Insight for redesign:** field *definitions* are effectively code (shipped via migrations), not user data. Consider seeding them from versioned config instead of 18 migration files.

### custom_field_definitions / custom_field_values (0 rows each)
- EAV pair: definitions (module, field_key, field_label, field_type, options_json text, is_required, scope_level, scope_id FK→hierarchy_nodes, is_active, created_by FK→users) + values (record_id FK→records, record_type, field_definition_id FK→defs, value_text).
- **Used by:** admin module CRUD + records module merge — but empty; `field_registry.scope_level/scope_id` superseded the concept. **Redesign candidate for deletion.**

### level_data_contracts (2 rows)
id PK, from_level/to_level NOT NULL, route default 'OPS_CHAIN', record_type default '*', visible_field_keys **text** NOT NULL (JSON), aggregate_definitions **text** ('[]'), is_active, updated_at. Used by level-contracts + records modules.

### filter_presets (3 rows)
id PK, name_en/hi NOT NULL, scope + scope_id, filter_spec **text** NOT NULL (JSON AND/OR tree), applicable_record_types text, created_by FK→users, is_active, created_at. Used by filters module.

---

## 5. Reference/lookup — the 21 `excel_*` tables

All follow the same shape: `serial` PK + `*_cd` integer/varchar code + label column(s). **No unique constraints on code columns, no FKs between related tables** (e.g. `excel_fire_arms.arms_category_cd` → `excel_arms_categories` unenforced; `excel_major_minor_mapping.act_cd/major_head_code` unenforced). Loaded by `backend/scripts/menu_table().js` from master Excel sheets; the "menu_tables" migration (20260702) creates them.

| Table | Rows | Extra columns beyond (id, code, label) |
|---|---|---|
| excel_acts | 462 | act_cd, act_long |
| excel_sections | 17,236 | section_code, section_cd, act_sec_cd, section, section_desc, pnsh_gt_7yrs |
| excel_major_heads | 167 | major_head_code, major_head |
| excel_minor_heads | 916 | minor_head_cd, **major_head_code** (implicit FK) |
| excel_major_minor_mapping | 2,136 | sec_mjrhd_cd, act_cd, section_code, major_head_code (join table, unenforced) |
| excel_local_heads | 156 | local_head_cd, local_head |
| excel_beats | 2,855 | beat_cd, beat_name, **ps_cd** (implicit FK → hierarchy code) |
| excel_property_types / excel_other_property_categories | 10 / 16 | parent_srno, parent_cd, code_type, parent_type, major_property |
| excel_other_property_items | 935 | property_cd, parent_cd, property_type_srno |
| excel_fire_arms | 237 | fire_arms_cd, **arms_category_cd** (implicit FK) |
| excel_arms_categories / excel_arms_made | 5 / 2 | simple code+label |
| excel_automobiles | 48 | simple |
| excel_jewelry_types 45 · excel_currency_types 34 · excel_document_types 71 · excel_drug_types 36 · excel_electric_goods 115 · excel_explosive_types 69 · excel_cultural_properties 18 | | simple code+label |

- **Used by:** all flow through `fields/classificationSources.config.js` (module `fields` serves them as dropdown/cascade sources via `field_registry.options_source`); import module reads some for validation; python_worker classifiers reference head codes.
- 📌 **Redesign question:** these are static reference data (~25k rows). Options: dedicated `ref` schema; a single generic `lookup(source, code, label, parent_code)` table; or keep per-table but add the missing unique/FK constraints. They should not mix with transactional tables in `public`.

---

## 6. Views — mostly a dead parallel implementation

Migration `20260620600000_daily_diary_views.js` (~1,000 lines) created 32 views in three layers:
1. **`ref_*` flattening/enum views** (ref_district, ref_police_station, ref_crime_head, ref_case_status, ref_act_law, ref_arrest_status, ref_arrest_section_category, ref_case_reg_type, ref_missing_category, ref_special_scheme)
2. **`*_master` typed-extraction views** (fir_master, arrest_master, missing_master, uidb_master, pcr_kalandra_master) — dozens of `(r.data::jsonb->>'key')::type` casts, i.e. hardcoded typed schemas over the JSONB
3. **`rpt_NN_*` per-report views** (21 of them, mirroring Daily Diary sheets 01–26)

**Grep verdict: only `ref_district` + `ref_police_station` are referenced (import module), plus `mv_record_stats` (1 src ref). Everything else: zero references in backend, scripts, python_worker, frontend.**

Why dead: the Node `daily-diary` module aggregates `records` in memory (per its own doc), and python_worker's `generator.py` queries `records` directly, mapping JSONB keys in Python sheet files. The SQL-view implementation of the same 34 reports was built and then bypassed. **The `*_master` views are still valuable as documentation** — they are the most complete typed schema of what's inside `records.data` per record type. Mine them for the new design's typed columns, then drop them.

---

## 7. Warehouse (`rpt` schema) — the second parallel reporting implementation

Proper star schema, ETL'd from `records` by `warehouse/etl` + `warehouse.scheduler.js` (sync_log=358 runs). All serial/bigint SKs, `warehouse_loaded_at` audit columns, unique constraints on natural keys.

- **Dims:** dim_district (15, mirrors hierarchy districts), dim_police_station (192, FK→dim_district), dim_officer / dim_crime_head / dim_case_status / dim_act_law (all 0 rows — normalization dims never populated; facts carry raw text instead).
- **Facts:** fact_fir (19; ~40 typed columns: fir_no, fir_date, gd_no/date/time, beat_no, occurrence_*, local_head, act_name, sections, brief_facts, complainant_*, accused_*, officer_*, property_*, case_status, cctns_flag, zero_fir_flag…), fact_arrest (12), fact_missing (6), fact_pcr (10), fact_uidb (4). Each has `source_record_id` UNIQUE → upsert-by-record. Both `ps_id` (source FK-ish) and `ps_sk` (dim key) — dual identity.
- **Bridges:** bridge_fir_arrest, bridge_fir_missing (0 rows; link by FIR_NO_MATCH/GD_NO_MATCH).
- **sync_log:** watermark-based incremental ETL bookkeeping (rows_scanned/upserted/failed, status).
- **Used by:** warehouse module only (`warehouse.db.js`, controller, scheduler, `scripts/dev/warehouse_backfill.js`).
- 📌 The fact tables are the **third** independent hand-typed schema of `records.data` (after the `*_master` views and python_worker sheets). Three teams solved "JSONB is unreportable" three ways. The new design should solve it ONCE, at the source.

---

## 8. Remaining tables (compilation, import/legacy, reporting, audit, notifications)

### compilations (3) + compilation_records (15, DEAD in src)
- `compilations`: id PK, source_level/target_level/route NOT NULL, period date, source_entity_id FK→hierarchy_nodes, status default 'DRAFT', **record_ids text ('[]')** ← what code actually uses, compiled_summary text, submitted_by FK→users, submitted_at.
- `compilation_records`: proper join table (compilation_id FK, record_id FK, UNIQUE pair) — **zero src references**. The correct design lost to the JSON-array column. Redesign: keep the join table, drop the array.

### import_batches (0) / import_batch_errors (0)
- batches: record_type, is_legacy bool, uploaded_by FK, ps_id/district_id FKs, file_path, total/valid/invalid/imported_rows ints, status default 'VALIDATION_PENDING', created/confirmed_at. errors: batch_id FK, row_number, field_key, error_code, error_message. Clean design; used by import module + reports.

### legacy_import_batches (0) / legacy_amendments (0)
- Older sibling of import_batches (ps_id FK, record_type, source_file, imported_by, counts, status, error_log text '[]'); amendments: record_id FK, requested_by/approved_by FKs, status default 'PENDING', field_changes text NOT NULL, reason. Used by legacy module. ⚠️ **Two parallel import-batch systems** (`import_batches.is_legacy` flag vs separate `legacy_import_batches`) — consolidate.

### report_jobs (0)
id PK, template_id (FK **dropped** by 20260622 migration — intentionally nullable/loose to allow in-memory template ids), filters text, format, status default 'PENDING', file_path, created_by FK, custom_definition text, error_message. Used by reports, report-builder, daily-diary, python_worker (writes job status).

### report_templates (0)
id PK, name_en/hi, applicable_record_types/applicable_levels/template_definition text (JSON), output_formats, is_active, created_by FK, template_type default 'PROFORMA'. ⚠️ 0 rows — actual templates are an in-memory array in `reports.controller.js` + HTML files on disk; python_worker also reads this table (finds nothing). Redesign: make DB the single source or drop the table.

### scheduled_reports (0)
template_id FK→report_templates NOT NULL, cron_expr, filter_spec text, format default 'PDF', scope_ps_id/scope_district_id FKs, recipients text '[]', is_active, last_run_at/status. Used by reports/scheduler.js. ⚠️ NOT NULL FK to an empty table = scheduled reports can't reference in-memory templates.

### report_builder_saved (0) / report_builder_audit (0)
saved: name, description, query_spec text NOT NULL, is_shared, created_by FK. audit: user_id FK, user_role, run_type, table_spec/fields_spec/filter_spec text, format, row_count, job_id, ip_address. Used by report-builder module.

### audit_logs (18)
id PK, table_name, record_id (⚠️ **no FK** — generic by design), action, changed_by_id FK→users, changed_by_role, changed_at, field_name, old_value/new_value text, reason, ip_address. Written by auditHandler (RabbitMQ) + records module directly (dual write paths).

### notifications (11)
id PK, title_en/hi NOT NULL, message_en/hi, user_id FK→users NOT NULL, record_id FK→records, is_read default false, created_at. Used by notifications module + notifyHandler + auth (unread count) + 5 frontend files.

---

## 9. Raw-SQL registry (breaks silently on rename)

| File | Count | Assumes |
|---|---|---|
| `records/records.service.js` | 2 | `data->>'fir_no'`, `data->>'accused_name'`, `data->'attachments'` + jsonb_array_length |
| `analytics/analytics.controller.js` + `analytics.service.js` | 15 | records columns + `data::jsonb` crime-head/local-head keys |
| `record-links/record-links.service.js` | 13 | record_links, link_type_registry, records joins |
| `report-builder/queryEngine.js` | dyn | builds SQL from `reportableFields.config.js`; `M.data->>'gender'`, cross-type joins |
| `warehouse/warehouse.db.js` | 1+ | entire `rpt` schema |
| `reports/scheduler.js` | 1 | scheduled_reports |
| `import/import.controller.js` | 1 | ref_district/ref_police_station views |
| `config/db.js` | 1 | health check |
| python_worker `generator.py` | many | records, hierarchy_nodes, record_links, report_templates, field_registry, report_jobs |

Plus: `daily_diary_views` migration (all 32 views), `mv_record_stats` matview, warehouse ETL SQL.

**JSONB keys hardcoded in ≥4 independent places** (records.service, analytics, queryEngine+config, dead views, python_worker sheets, 36 frontend files): treat `fir_no, gd_no, occurrence_date/time, sections, local_head, crime_head, complainant_*, accused_*, arrested_*, io_name/rank, gender, dd_no, vehicle_no…` as a de-facto frozen contract. The dead `*_master` views + `rpt.fact_*` columns are the best existing catalog of this contract.

---

## 10. python_worker access — pros/cons and recommendation

Current: own SQLAlchemy engine (`db.py`), DSN from `backend/.env`/`DATABASE_URL`; ALSO receives creds as CLI args from `reports.controller.js:709` subprocess call (`--host --port --dbname --user --password` — visible in `ps` output; minor but real security smell). Reads records/hierarchy_nodes/record_links/report_templates/field_registry, writes report_jobs status. 24 sheet files each hold their own JSONB-key mapping in Python.

| Option | Speed | Security | Maintenance |
|---|---|---|---|
| A. Keep direct table access | ✅ fastest (bulk pandas read_sql) | ⚠️ full-privilege creds in CLI args + second stack to audit | ❌ 24 files break silently on schema change |
| B. Read-only DB role + stable reporting views | ✅ same performance | ✅ read-only grant, no table DDL exposure; creds via env not argv | ✅ views form the contract; schema can change beneath |
| C. Route through backend HTTP API | ❌ slowest (serialize 17k+ rows over HTTP) | ✅ best | ✅ but big rewrite of worker |

**Recommendation: B.** Dedicated Postgres role (`pharos_report_ro`) with SELECT-only grants on a small set of purpose-built reporting views + INSERT/UPDATE grant on report_jobs (or have Node own job-status writes). Pass creds via environment, not argv. This is the "faster + secure" middle: zero throughput loss, real privilege reduction, and the 24-sheet contract collapses into view definitions the DB owns. Decision stays open until design phase, but A should be rejected (fails both criteria vs B) and C only reconsidered if the worker's scope shrinks.

---

## 11. Consolidated requirements for the new schema

1. **Native `jsonb` everywhere JSON lives** — records.data, field_registry×6, compilations.record_ids, level_data_contracts, filter_presets.filter_spec, workflow_transitions_config.allowed_roles, hierarchy_nodes.metadata, record_links.metadata, report_* JSON columns. One parse point in code.
2. **Solve "JSONB is unreportable" once, at the source** — three independent typed re-schemas exist (dead `*_master` views, `rpt.fact_*`, python_worker sheets). Promote the frozen-contract keys (§9) to real/generated columns or normalized side tables; keep JSONB only for the genuinely dynamic tail.
3. **One hierarchy-flattening strategy** — adjacency tree + (ref views | denormalized ids | warehouse dims): pick one, delete the other two.
4. **Finish or fold the warehouse** — `rpt` schema is well-built but its normalization dims are empty and it duplicates requirement 2's answer. Decide: it's THE reporting layer (populate dims, all report consumers move to it) or it's redundant after typed columns land.
5. **Kill confirmed dead weight** — ~30 views, `compilation_records` vs `record_ids` (keep join table, not the array), `custom_field_*` EAV pair, `prev_hash/row_hash` (or actually implement the chain), `legacy_import_batches` (merge into `import_batches.is_legacy`).
6. **One ID convention** (native uuid or app varchar(36) — not three), one `record_type` enum/lookup, role/status/level as enums or lookup tables instead of free text.
7. **Reference data out of `public`** — 21 `excel_*` tables (~25k rows) into a `ref` schema (or generic lookup table) WITH the missing unique/FK constraints.
8. **Missing integrity** — unique(record_id, revision_number); business-key dedup constraint on records (fir_no+ps+year where applicable); FK enforcement inside excel_* family.
9. **One state machine source of truth** — `workflow_transitions_config` (DB) vs in-code TRANSITIONS object: both exist today.
10. **users.station_id vs JWT ps_id** — one name end to end.
11. **Field definitions as versioned seed config, not 18 migrations** — field_registry rows are code, not data.
12. **python_worker: read-only role + reporting views** (§10 option B); creds via env, never argv.
13. **Report templates: DB or code, not both** — report_templates empty while templates live in-memory; scheduled_reports FK points at the empty table.
14. **Bilingual by data category, not blanket `_en/_hi` columns.** Audit of live data: field_registry labels are genuinely bilingual (391/391 real Devanagari, consumed by forms) — the only working case. hierarchy_nodes name_hi is 261/262 duplicated English (NOT NULL forced junk); notifications bake both languages into every row at write time; excel_* lookups have no Hindi at all (dropdown values can't be translated even though their labels are). New design: (a) static UI strings stay in frontend i18n files; (b) admin-authored config labels → one `labels jsonb {"en","hi"}` column (new language = data change, not ALTER TABLE); (c) entity/user data (names, records.data) → single column stored as entered, Hindi display name nullable-with-fallback if wanted, never NOT NULL; (d) notifications → store `type` + `params jsonb`, render via i18n at read time (retroactive re-wording, smaller rows); (e) excel_* lookups → carry labels in the lookup redesign (req 7) or accept English-only dropdowns explicitly.

---
*Cross-check: 65 tables documented (51 public incl. 2 knex + 14 rpt) — §2: 2, §3: 8, §4: 5, §5: 21, §7: 14, §8: 13, infra: 2.*
