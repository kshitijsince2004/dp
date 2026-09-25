# Integration 5 — Residual module adaptation (record-links, filters, level-contracts, audit reads, normalization fixes, mock seeds)

**Status:** ✅ done, 2026-07-20. **Branch:** `dev2/ashmit`.

The remaining **non-report** stage-5 work (reports/report-builder/daily-diary/warehouse/
python_worker were explicitly excluded by user instruction, 2026-07-20 — they are the last
pending integration). Scope: the P1.5-step-5 residual modules that still read the dead
schema, plus cross-integration bugs flagged in earlier handoffs, plus the mock-data seeder.
Work was executed by parallel implementation subagents under architect review; every change
was live-verified against the dev DB (not just typecheck/lint).

Companion file: **`FUTURE-IMPROVEMENTS.md`** (same folder) — the post-DB-integration
improvement register created during this integration's architecture review. Register only;
nothing there is authorized without a user decision.

---

## What was broken (all live defects, confirmed before fixing)

1. **record-links**: `searchPersonAcrossArrests` queried the deleted `records.data` blob —
   PersonSearchPage dead; `createLink`/`deleteLink`/`getLinksForRecord` had no
   `verifyRecordAccess`/`enforceScope` (P5 violations); sqlite dual-dialect dead code.
2. **filters**: controller wrote `name_en`/`name_hi`/`applicable_record_types` (columns that
   don't exist on `filter_presets`) and stored role-strings/user-uuids in `scope_id` (a uuid
   FK → hierarchy_nodes) — creation 500'd, ROLE rows would have FK-violated.
3. **level-contracts**: `maskRecordData`/`maskRecordDetails` masked `record.data` — a silent
   no-op since the restructure, i.e. **JCP/SCP/DO/HQ saw every field their level-contract
   should hide**; `createContract` omitted the NOT NULL `code` sync key and fought
   config-as-data.
4. **audit reads**: `getRecordAudit` selected dead `u.name_en/name_hi` (500) and skipped
   `verifyRecordAccess`; `getUserAudit` let any DISTRICT_OFFICER read any user's trail.
5. **notifications**: mock-user-id fallback (`'00000000-…'`) instead of failing closed;
   `read_at` never stamped.
6. **write-path enum bug** (from 03-import.md): registry gender options vs
   `persons_gender_check` mismatch broke every interactive person submission; plus a second
   latent bug found during this integration — `gender varchar(10)` couldn't physically hold
   the 11-char `'TRANSGENDER'` the widened CHECK legalized.
7. **fir_no asymmetry**: interactive form didn't canonicalize FIR references the way import
   does → cross-format auto-link misses.
8. **`validate.middleware.js`**: unwired third validation mechanism (P2.6 said wire-or-delete).
9. **`scripts/seed-test-data.js`**: entirely pre-restructure (dead columns, deleted hierarchy
   node ids, flat-blob record shapes).

---

## Canonical contracts / rulings established

- **R5-1 — filter_presets scope model.** Scope values are `'SYSTEM'` (visible to all;
  creation restricted to SYSTEM_ADMIN — privilege-escalation guard added) and `'USER'`
  (owned via `created_by`). `scope_id` is ALWAYS NULL today — reserved for future
  hierarchy-node-scoped presets. ROLE presets dropped (verified: no frontend consumer).
  Responses carry `name_en`/`applicable_record_types` compat aliases (drain-on-touch
  pattern); requests accept old + new keys. The in-memory `DEFAULT_SYSTEM_PRESETS` merge
  stays, reshaped to real columns with canonical record types (`CASES`→`CASE`,
  `PCR`→`PCR_CALL`). Non-uuid preset ids 404 cleanly (the defaults are never DB rows).

- **R5-2 — level_data_contracts are config-as-data, read-only over the API.** Mutation
  routes stay registered but return **405** pointing at `config/contracts/*.json` +
  `npm run sync-config`. Masking rewritten for the real read-path shapes (flat
  `recomposeRecord` data keyed by `field_registry.field_key`; list summaries; persons[i].data;
  properties; offences): structural keys (ids, record_type, workflow status/level, scoping
  ids, dates, provenance, ps/district/creator names) always visible; every other key needs
  membership in `visible_field_keys`; offence columns are gated by the `data.*` key they feed
  (closed a parallel-array leak); `revisions`/`transitions`/`status_events` are audit trail,
  never masked. `ROLE_LEVELS` (utils/generateToken.js) is the single role→level map.
  **JCP/SCP bridge:** only DISTRICT- and HQ-targeted contracts exist, so
  `LEVEL_FALLBACK = { JCP:'HQ', SCP:'HQ' }` maps them onto the HQ contract (deliberately not
  a general round-up rule — ACP/SUB_DIV stays unmasked-by-absence as before). PS-level roles
  and SYSTEM_ADMIN see full detail; no contract → no masking (unchanged default).

- **R5-3 — contracts config adapted to current field keys** (architect ruling: preserving
  the ORIGINAL visibility intent across the restructure's key renames is adaptation, not
  widening). `config/contracts/ops_chain.json`: added `case_status`/`final_call_status`/
  `missing_status`/`uidb_status` beside the kept `"status"` (covers both the detail path —
  CASE's own `case_status` key — and `buildListSummary()`'s emitted keys); replaced the
  never-existed `"arrested_name"` with the real split keys
  `arrested_first_name/middle/last`. Nothing added beyond original intent (no
  `is_worked_out`). **Consequence to be aware of: masking is now ACTIVE for
  DO/JCP/SCP/HQ_* — those roles now see only contract-listed fields**, verified field-by-field
  live (before/after tables in the WS3 agent report).

- **R5-4 — audit read scoping.** `getRecordAudit`: `verifyRecordAccess` + `u.name`;
  `getUserAudit`: DISTRICT_OFFICER limited to target users in own district (404 unknown user,
  403 cross-district), HQ_ANALYST/HQ_ADMIN/SYSTEM_ADMIN global; `enforceScope` mounted on both
  read routes. Integration-4 surfaces (chain-verify/freeze/unfreeze, audit.service/scheduler,
  hash.js) untouched — re-verified `npm run audit:verify` exit 0 after the change.

- **R5-5 — record-links access rule.** Link create/delete/read require `verifyRecordAccess`
  on the owning/source record (RECORD-LINKAGE.md / P5.6); person search queries `persons`
  (role=ARRESTEE) joined THROUGH the records spine with `req.jurisdictionQuery` applied
  unconditionally — `psId`/`districtId` query params AND-narrow only, never widen. Response is
  snake_case person-centric rows (person_id, name, relative_name, relation_type, gender, age,
  mobile, address, record_id/type/date/status, arrest_date, fir_no, ps_name).
  `linked_record_data` preview stays out (Integration-2 regression, register D7).

- **R5-6 — gender + enum canonicalization.** `persons.gender` CHECK = 
  `('MALE','FEMALE','TRANSGENDER','OTHER','UNKNOWN')`, column `varchar(20)` — **folded into
  base migration `20260711000004`** (the standalone `20260711000007` amendment migration a
  prior session had left violated the pre-launch fold rule and was deleted);
  `record_properties.status` CHECK gained `'INVOLVED'` (same fold). `normalizeEnumUpper` in
  `records.normalize.js` canonicalizes option values to CHECK vocabulary on the one write
  path. DB_SCHEMA.md / ER_DIAGRAM.md / .drawio updated+regenerated per the standing rule
  (they had gone stale against the prior session's un-folded migration).

- **R5-7 — fir_no canonicalization is shared.** `normalizeFirNo`/`expandFirYear` in
  `records.normalize.js`, applied via `records.mapper.js` for every `fir_no`-targeted column
  on BOTH interactive and import paths (import.compose.js imports the same function).
  A deliberate deviation from the original WS brief: no `utils/fir.js` was created — the P2
  registry-driven layer IS the shared home (P1.3), moving it out would have been worse.
  Cross-format CASE↔ARREST auto-link verified live ("123 / 2026" vs "0123/26" → one
  `record_links` row, `resolved_via:'fir_no'`).

- **R5-8 — `validate.middleware.js` deleted** (P2.6 resolved: zero importers; the
  registry-driven normalizer is the single validation layer).

- **R5-9 — notifications fail closed.** 401 when `req.user` missing (no mock-user id);
  `read_at` stamped on both mark-read paths.

- **R5-10 — mock seeder goes through the one write path.** `backend/scripts/seed-test-data.js`
  rewritten (`npm run seed:test-data`): 44 records (10 CASE / 10 ARREST / 8 PCR_CALL /
  8 MISSING / 8 UIDB) across two NDD PS, created via the real `createRecord`/`submitRecord`/
  `transitionRecord`/`updateDomainStatus` as the correct seeded role each hop — zero direct
  inserts into record tables. Workflow spread covers all 7 statuses so every role's queue has
  content; 2 cross-format FIR-linked CASE↔ARREST pairs (real linkResolver over RabbitMQ);
  3 dated `record_status_events`; live notifications. **Tagging:** each seeded record's
  `io_id` points at a per-PS `DEV SEED MARKER` `investigating_officers` row
  (`pis_no = DEVSEED-<PS>`); re-runs delete previously tagged records first (spine delete
  cascades; the referencing `notifications`/`record_links`/`audit_logs` rows are removed
  first — acceptable ONLY because this is a NODE_ENV-guarded dev tool cleaning its own
  disposable fixtures; the append-only discipline governs the runtime write paths, and this
  script must never grow a production mode). `source_system` was rejected as the tag because
  `createRecord` deliberately never stamps it (that's import provenance). Known gap: no
  HC/SHO users are seeded in NWD, so all 44 records are DIST_NDD — district-level
  cross-jurisdiction scoping isn't exercised by seed data until user seeding adds NWD
  operators. Proof of write-path fidelity: `npm run audit:verify` → exit 0 over all 155
  seeded revisions, twice (idempotency run included).

---

## Verification performed (all live against the dev DB)

- Per-module HTTP round-trips with real JWTs + CSRF for every seeded role in/out of
  jurisdiction (403 matrices for record-links, audit reads, filters RBAC, masking per role).
- Level-contract masking verified field-by-field on a real CASE record for
  SA/SHO/ACP/DO/JCP/SCP, list AND detail, before/after the contracts-config fix; offences
  array leak re-checked closed.
- `npm run audit:verify` exit 0 after every phase (incl. post-rebuild).
- `npm run import:parity` clean for all 5 types after the normalization work (frozen template
  untouched, P3.1).
- Full rebuild chain `db:reset → db:migrate → sync-config → load-ref → db:seed` clean with
  the folded migration (7 files, one batch; known ref-load gaps reproduced exactly).
- Write-path e2e: createRecord with 'Male'/'Transgender' arrestees → `MALE`/`TRANSGENDER`
  rows; fir_no entered as "123 / 2026" → stored "123/2026"; cross-format auto-link row
  created by the real linkResolver over RabbitMQ.
- `frontend npm run build` green after each frontend touch (PersonSearchPage,
  FilterPresetsPanel/StationFilters/hq Dashboard, LevelContractsPage read-only rewrite).
- Every workstream's fixtures cleaned up (verified zero residue).

## Bugs found & fixed beyond the plan (during implementation)

- `gender varchar(10)` width bug (above) — caught live, not by review.
- Offences-array masking bypass — caught by adversarial review before shipping.
- JCP/SCP masking no-op (no exact-level contract) — caught by adversarial review.
- SYSTEM-preset creation was open to any authenticated user — privilege gate added.
- Non-uuid preset delete 500 → clean 404 guard.

## Known consequences / operational notes

- **Masking is now real.** DO/JCP/SCP/HQ roles see only contract-listed fields. If a field
  goes missing from a review screen, the fix is `config/contracts/*.json` + sync — not code.
- The unadapted **warehouse** module's cron logs `relation "rpt.sync_log" does not exist`
  every 5 minutes in dev — expected until the (excluded) reporting integration; noted here so
  nobody chases it as a new bug.
- UIDB `deceased_relation_type` remains hard-broken pending a user ruling (amends ruling 21)
  — `FUTURE-IMPROVEMENTS.md` E5.

## Follow-up (same day, user-authorized): editable domain statuses + popup UX (register A1–A3)

- **Ruling 26 — `custody_status`** (`record_status_events` CHECK widened, folded into
  `20260711000005`; DB_SCHEMA §4.8/§10 + ER diagrams updated): targets
  `arrest_details.case_status` (the literal `custody_status` column stays dead).
  `updateDomainStatus` now gates status fields by record type from a single
  `STATUS_FIELD_DEFS` source — closing a real pre-existing leak where `case_status` was
  silently accepted on ARREST records (the old SHO UI depended on it; now 422). Plain
  `updateRecord` edits of the ARREST status field also emit dated `custody_status` events.
- **`GET /records/:id/status-options`** (HC/SHO/DO + `verifyRecordAccess`): per-type editable
  status fields with current values and option lists. Options come from
  `fields/statusOptions.config.js` — the per-type vocabulary EXTRACTED from
  `getFieldsForForm`'s former ~50-line inline block; both the intake form and this endpoint
  now consume the one source (ARREST branches on the record's own `is_dd_based`, ruling 18:
  against-FIR vs Kalandra custody lists). CASE's `case_status`/`is_worked_out` options are
  registry-sourced. `property_status` is per-property and deliberately excluded from v1.
- **`StatusUpdateModal.jsx`** — one reusable popup, zero hardcoded vocabularies (P4):
  field chooser for multi-field types, option select (label_hi honored), "When did this
  change happen?" date (default today, max today, P2.7), workout-date labeling when
  `is_worked_out`=Yes, optional comment, frozen-record notice (423-aware). Wired: HC
  `MyRecords` row action + record detail (shared page already role-gates HC); SHO
  `RecordDetail` refactored onto it — its hardcoded `STATUS_FIELD_BY_TYPE`/
  `STATUS_OPTIONS_BY_TYPE` maps (whose `ARREST:'case_status'` was the leak) are deleted.
  i18n `statusUpdate` namespace added (en+hi).
- **Boot bug found & fixed while verifying:** the CLI `npm run load-ref` never stored
  `ref_source_checksum` (only the boot autoload did) → the first `npm run dev` after any
  manual rebuild re-ran a full ref load, which now dies on `DELETE FROM ref.sections`
  against FK-referencing seeded records. Fixed: `loadRef` (load-ref-core.mjs) persists the
  checksum itself for both entry points; boot verified clean ("load-ref skipped"). The
  deeper fragility (ref reload on a DB with live records) is register **E6** — do before
  any real deployment.
- Verified live end-to-end as HC001: ARREST custody JC→"Bound Down" backdated;
  CASE worked-out with backdated workout date; `custody_status` on CASE → 422;
  `audit:verify` green (158 revisions/44 records); `import:parity` clean; frontend build
  clean; seeder now emits real custody vocabulary codes.

## Deferrals carried forward

- Transfers module + FIR allocator; amendments rework; filter engine (`POST /filters/apply`);
  ACP workflow rows; JCP/SCP real scoping — all unchanged, now itemized with
  problem/why/implementation/complexity in `FUTURE-IMPROVEMENTS.md`.
- Reporting stack (report engine, report-builder, daily-diary, warehouse, python_worker) —
  the remaining stage-5 integration, excluded from this one by user instruction.
