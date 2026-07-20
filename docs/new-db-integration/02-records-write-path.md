# Integration 2 — Records Write Path, Forms, IO/HC Provisioning, Status Updates, Analytics

**Status:** done, 2026-07-15. **Branch:** `dev2/ashmit`.

Rebuilds the ONE write path for records (`records.service.js`) against the typed spine/detail/
persons/properties/locations/offences schema, replacing the dead `records.data` jsonb +
`record_persons` shape. Also adapts the modules that depend on records (`fields` HTTP layer,
`compilation`, `analytics`), adds the deferred IO-dropdown + SHO-creates-HC provisioning from
Integration 1, adds domain status-update + head-override endpoints, and eliminates file
attachments/MinIO/S3/Cloudinary outright (user decision — not deferred, permanently dropped).
Full plan: `~/.claude/plans/now-lets-start-with-sharded-pumpkin.md` (if still present) — this doc
is the durable record.

Excel import, transfers, hash-chain verification/freeze runbook, daily-diary, report-builder,
warehouse, python_worker are explicitly OUT of scope — untouched, still on old assumptions where
applicable, own future integrations.

---

## Phase table (updated after each phase completes)

| Phase | Status | Summary |
|---|---|---|
| 0. Handoff scaffold + migration fold | ✅ done | This doc created; `record_properties.person_id` FK folded into base migration 4 |
| 1. Backend write path core | ✅ done | `records.mapper.js`/`records.normalize.js`, `records.service.js` rewrite, link resolver — verified live against Postgres, 6 real bugs found+fixed (3 more found in Phase 7, see below — 9 total) |
| 2. Config/field-registry refresh | ✅ done | `io_id` field, ui_only rows for offence-table state, status/case_status dedupe |
| 3. Adjacent backend modules | ✅ done | `fields.controller.js`, `compilation.service.js`, `analytics.controller.js`, `users` SHO→HC — all verified live |
| 4. Domain status updates + head override | ✅ done (built+tested in Phase 1) | `PATCH /records/:id/status`, `overrideCaseHead` rewrite |
| 5. Backend kill-list cleanup | ✅ done | Delete upload/S3/Cloudinary/customFields/orphaned routers |
| 6. Frontend | ✅ done | Victim/accused fix, offences submit, IO dropdown, SHO-HC UI, status UI, dead-file cleanup |
| 7. Docs finalize + verification | ✅ done | Finished this doc, updated CLAUDE.md, full clean rebuild + end-to-end verify, **2 more real bugs found live** |

---

## Canonical contracts (reference — full detail in the plan file, summarized here as they land)

- **C1 — Write payload**: `{record_type, record_date, data, persons[], properties[], offences[]}`.
  `persons[]` entries `{person_type, data}`; `person_type: 'ARRESTED'` maps to DB role `ARRESTEE`
  at the mapper boundary. `offences[]` is new this integration.
- **C2 — `records.mapper.js`**: registry-driven `splitPayload`/`recomposeRecord`, the only place
  that knows how `field_registry.storage` shapes route to typed tables. To be filled in as built.
- **C3 — `records.normalize.js`**: registry-driven normalization (dates→ISO, phones→digits,
  label→code resolution for FK-backed columns). To be filled in as built.
- **C4 — Write-path transaction shape**: single write path in `records.service.js`; persons/
  properties are **id-preserving upserts** on update (never delete-and-reinsert — property rows
  are referenced by `record_status_events.property_id` ON DELETE CASCADE); offences are
  delete-and-reinsert (nothing references them). To be filled in as built.
- **C5 — Link resolver**: post-commit subscriber resolving CASE_ARREST/CASE_MISSING via the
  `fir_details` business key. To be filled in as built.

---

## Deferrals carried forward (not forgotten)

- Transfers module + FIR number allocator — still not built (Integration 1's deferral stands;
  `fir_no` stays typed-by-hand this integration too).
- Import module — still reads `excel_*`/old assumptions, own future integration.
- Hash-chain verification job + freeze runbook — still deferred per `ENGINEERING_BASELINE.md` P6;
  this integration DOES consolidate revision-writing into the single write path (P1.5 step per
  `ARCHITECTURE.md` §4.2) but does not add the scheduled verification job or break/freeze runbook.
- ACP workflow transitions — still no config rows (Integration 1's deferral stands).
- **Attachments/file upload/MinIO/S3/Cloudinary — PERMANENTLY ELIMINATED, not deferred** (user
  decision 2026-07-15). No `record_attachments` table exists or is planned.

---

## Entries below are added as each phase completes.

### Phase 1 — done (2026-07-15)

New files: `backend/src/modules/records/records.mapper.js` (registry-driven `splitPayload`/
`recomposeRecord` — the C2 contract), `records.normalize.js` (P2 normalization + label→ref.*
FK resolution — C3), `backend/src/events/handlers/linkResolver.js` (C5, subscribes
`record.created`/`record.updated`, resolves CASE_ARREST/CASE_MISSING via the fir_details
business key, idempotent insert), `backend/seeds/02_link_types.js` (upserts those two
`link_type_registry` codes — nothing seeded them before). `records.service.js` fully
rewritten (C4): `createRecord`/`updateRecord` now use the mapper end-to-end; `updateRecord`
does **id-preserving upsert** for persons/properties (never delete-and-reinsert — protects
`record_status_events.property_id` history) and delete-and-reinsert for `record_offences`;
`transitionRecord`/`submitRecord` gained the same inline hash-chained revision write
`createRecord` already had, making `records.service.js` the single writer of
`record_revisions` for every `change_type` (ARCHITECTURE.md §4.2) — **`auditHandler.js` is
now fully dead and deleted**, its `.init()` removed from `app.js`. `overrideCaseHead`
rewritten against `record_offences`/detail `local_head_id` (item 4, ties into Phase 4).
`getRecordDetails`/`listRecords`/`checkDuplicateRecord` rewritten on typed joins (no more
`records.data`/`hierarchy_nodes.name_en`). Attachment code (service+controller+router)
deleted per the attachments-eliminated decision. New `PATCH /records/:id/status` +
`updateDomainStatus()` added early (belongs to Phase 4 conceptually, built alongside since
it shares every helper in this file — item 9's first half). Fixed `record-links.service.js`'s
`getLinksForRecord` (stale `label_en`/`name_en` → `label`/`name`; dropped the dead `r.data`
column reference — `linked_record_data` preview is gone from the response, a minor known
regression, not restored this pass). `import/import.controller.js` kept a tiny local
`TYPE_CODES` constant (its own import of the deleted `records.service.js` export would have
crashed app boot entirely — the import module itself is still untouched/broken by design).

**Six real bugs found and fixed via live end-to-end testing (not just typecheck/lint) against
a running Postgres instance — create/update/submit/approve exercised for both CASE and
ARREST record types with persons/properties/offences/locations:**
1. `fir_details.ps_id` (a required denormalized business-key column, DB_SCHEMA.md §9.3 #3)
   was never stamped by the write path — nothing in the registry maps to it since it isn't a
   form field. Fixed: `detailScopingColumns()` stamps it directly for CASE, same as the
   spine's own scoping ids.
2. Act-group aliases (`act_name` value `'IPC'` etc. — one label mapping to a *set* of
   `ref.acts.act_cd`s via `ACT_GROUP_CODES`) had no single `act_id` to write, violating
   `record_offences`'s `act_id NOT NULL OR other_act_name NOT NULL` CHECK. Fixed:
   `resolveSection` now also returns the matched section row's own `act_sec_cd` — the
   definitive single act for that specific citation — which `buildOffenceRows` uses to
   resolve the alias down to one code; falls back to storing the raw label as
   `other_act_name` when no section match exists.
3. `record_revisions.prev_hash` is `NOT NULL` and the spec calls for "genesis = defined
   constant" (DB_SCHEMA.md §4.3) — no such constant existed anywhere in the codebase, so
   revision 1 of every chain always violated the constraint (a latent bug predating this
   integration, only ever masked because record creation was already broken for the
   jsonb-removal reason). Fixed: `utils/hash.js` now exports `GENESIS_HASH` (sha256 of a
   fixed label), used consistently by `computeRowHash`/`getPreviousHash`/`verifyAuditChain`.
4. Hash-chain verification failed on re-check even for a correctly-written chain: Postgres
   `jsonb` does not preserve the original key order/whitespace of inserted JSON — a value
   hashed fresh (`JSON.stringify`) and the same value re-read from the `field_changes` jsonb
   column and stringified again could differ byte-for-byte. Fixed: `utils/hash.js` gained
   `canonicalStringify()` (recursively sorted object keys), used for the whole hash payload —
   this is hash_version 1's actual definition now; changing it is a version bump, never a
   silent edit (ARCHITECTURE.md §11).
5. Person name-splitting (`name_part` 1/2/3 → single `persons.name`, and the inverse on
   recompose) mis-assigned a 2-token name ("Rakesh Sharma") as first+middle instead of
   first+last, leaving `last_name` blank. Fixed: recompose now always reserves the *last*
   token for the *last* name field regardless of token count, with any middle tokens filling
   the fields in between.
6. `field_registry.storage`'s bare-string values (`"ui_only"` — the only one in live use) were
   silently turned into `null` by `loadRegistry`'s JSON-parsing: pg already auto-deserializes
   `jsonb` columns, so `"ui_only"` arrives as the already-unwrapped JS string `'ui_only'`, and
   re-running `JSON.parse` on it throws (not valid JSON on its own) — the fallback path
   returned `null` instead of the real string. This accidentally still worked for the
   mapper's split/recompose (both already treat `null` as "skip"), but broke
   `validateRequiredFields`'s explicit `storage === 'ui_only'` check, permanently blocking
   submit on any `ui_only` field marked `required` in its `validation_rules` (e.g.
   `occurrence_time_type`). Fixed: `parseJson` now returns the original string on a parse
   failure instead of the fallback — a failure to parse a string means it already **is** the
   real value, not garbage.

**Verified live** (HTTP round-trips against a running dev server + direct DB inspection, not
mocked): CASE create → update (id-preserving persons/properties upsert confirmed by
inspecting DB rows before/after — kept ids stayed, new entries got new ids, removed entries
were deleted along with their locations) → submit (requiredness validation correctly blocked
on genuinely-missing required fields, then passed once satisfied) → SHO approve; `record_
status_events` row correctly written on a `case_status` change during update; hash chain
verified valid end-to-end via `verifyAuditChain()` for a fresh record (3 revisions:
CREATE/UPDATE/STATUS_CHANGE) after the canonicalization fix; ARREST create with an ARRESTEE
person + `arrestee_details` subtype row (`is_po`/`is_bc`) + a property linked via the new
`record_properties.person_id` FK + offence resolution (`crime_head` correctly matched to an
existing offence row rather than creating a duplicate); `PATCH /records/:id/status` (is_worked_
out flip, future-date rejection); DISTRICT_OFFICER head override correctly resolving a local-
head label to `fir_details.local_head_id` (not a bogus offence row) with a HEAD_OVERRIDE
revision. One test record's hash chain is intentionally left "broken" in the dev DB (created
before bug #3/#4 were fixed) — expected, disposable dev data, not a regression; cleared by
the next `db:reset`.

**Known gap carried forward, not fixed this phase:** `record-links.service.js`'s
`searchPersonAcrossArrests` still reads dead `data->>'key'` jsonb — routed but not on this
integration's critical path (no form/write-path consumer), left broken same as import/
daily-diary/etc. `listRecords`'s `search`/`localHead` filters are typed-column replacements,
not byte-identical to the old jsonb behavior (reasonable parity, not exhaustive).

### Phase 6 — in progress (2026-07-15)

- **Victim/accused bug fixed**: renamed all 18 occurrences of `repeaterState.PERSON_VICTIM`/
  `PERSON_ACCUSED` → `victim_info`/`accused_info` in `DynamicForm.jsx` (mechanical, self-
  contained, verified zero remaining references) — entries now reach the submit builder's
  `repeaterState[section.section]` lookup, which was always keyed by the real section name.
- **Offences**: confirmed no frontend change needed — `ActsSectionsTable.jsx` already writes
  `act_name`/`sections`/`major_heads`/`minor_heads` as comma-joined strings into `values`,
  and Phase 1's `buildOffenceRows` fallback (built deliberately for this) already consumes
  exactly that shape — proven working end-to-end in Phase 1's live CASE test.
- **Person `id` propagation fixed** (a real gap found while wiring this): the submit builder
  span personEntry into `{person_type, data}` but silently dropped `entry.id` into the nested
  `data` blob instead of the top-level `persons[].id` the backend's id-preserving upsert
  matches on — every edit-mode save of a repeater person would have looked like a brand-new
  entry to the backend. Fixed: `id` is now destructured out and placed at the top level.
- **Severe pre-existing bug fixed**: `NewRecord.jsx` checked `record.current_status !==
  'SENT_BACK_HC'` (exclusion logic) to decide both whether to show the correction banner and
  whether the form is `readOnly` — but the real workflow status is `'SENT_BACK'`
  (`config/workflow/main.json`; `'SENT_BACK_HC'` was never a real status anywhere in the
  rebuilt schema). Net effect: a record legitimately sent back to HC for correction rendered
  **read-only**, completely blocking the correction workflow, and the "why was this sent
  back" banner never appeared. Fixed both checks to include `'SENT_BACK'` (kept
  `'SENT_BACK_HC'` alongside it, matching the defensive OR-pattern already used in
  `Queue.jsx`/`MyRecords.jsx` for the same reason).
- **Generic `options_source` fetch** added to `FieldRenderer.jsx` (P4/item 5): any field with
  `options_source` and no inline options now fetches `/fields/lookup/:options_source` via
  `useQuery` (hook placed before the early `!field` return per Rules of Hooks, guarded by
  `enabled`) — generalizes the ad hoc pattern already used elsewhere in `DynamicForm.jsx` to
  every field, starting with `io_id`. Verified the lookup response shape (`{value, label}`)
  matches what `SearchableSelect.jsx`'s `getLabel()` already reads first.
- **New IO management page** (`pages/sho/IOManagement.jsx`) — SHO/ACP curation UI against the
  existing `/investigating-officers` CRUD (Integration 1), matching `Users.jsx`'s table+modal
  pattern. Routed at `/sho/investigating-officers`, role-gated (`SHO`, `ACP`, `SYSTEM_ADMIN`),
  linked from the sidebar for both SHO and ACP.
- **SHO-scoped `Users.jsx`**: reads `useAuthStore()`; when the caller is SHO, the role
  `<select>` is replaced with a fixed "Head Constable (HC)" label, the PS/District scope
  inputs are hidden entirely (server stamps them — nothing to show), the page title/copy
  changes to "My Police Station — Officers", and action buttons (deactivate/reset/delete) are
  hidden for roles the backend doesn't grant mutation rights to (`HQ_ANALYST`,
  `DISTRICT_OFFICER` — list-only). Route `/admin/users` gained a `roles=` restriction via a
  nested `ProtectedRoute` (previously reachable by any authenticated role).
- **Status-update UI** added to `RecordDetail.jsx`: a "Case Progress" card (status dropdown
  sourced from the same per-type option lists `fields.controller.js` uses at creation time,
  an effective-date picker capped at today, optional comment) calling `PATCH /records/:id/
  status`; a CASE-only "Worked Out" flip control; a status-history list rendering
  `status_events` (now present in `getRecordDetails`'s response since Phase 1/4). Available to
  HC/SHO/DISTRICT_OFFICER — domain progress tracking, not a workflow-review action, so not
  gated to the same roles as approve/send-back.
- **Legacy route retirement**: removed the 5 legacy flat-blob page routes
  (`/dashboard/{old-console,case-management,arrest-management,pcr-calls,uidb-management,
  missing-persons}`) and their lazy imports from `AppRouter.jsx` — these pages submit into the
  dead `data:` jsonb shape and would 500 against the rewritten backend if reached; the real
  flow is `NewRecord.jsx` + `DynamicForm.jsx` under `/records/new/:type`. Cleaned up
  `PoliceNavbar.jsx`'s now-dead breadcrumb branches for those same 5 paths (confirmed zero
  remaining references anywhere in `frontend/src` before removing).
- **Frontend build verified clean** after every change above (`npm run build`, zero errors).

**Dead-file deletion completed**: verified zero importers (grep, one file at a time) then
deleted `pages/Dashboard.jsx`, `pages/CaseManagement.jsx`, `pages/ArrestManagement.jsx`,
`pages/PCRCallEntry.jsx`, `pages/UIDBManagement.jsx`, `pages/MissingPersonEntry.jsx`,
`components/DynamicForm/` (whole dir), `pages/records/` (whole dir —
`RegistrationPage.jsx` was its only file), `pages/queue/` (whole dir — `QueuePage.jsx` was
its only file), `api/records.api.js`, `pages/admin/UsersPage.jsx`,
`pages/analytics/AnalyticsPage.jsx`. `context/AuthContext.jsx` (singular) was already deleted
in Integration 1 per its handoff — confirmed absent, no action needed. **`npm run build`
verified clean after every deletion** — output bundle now includes `IOManagement-*.js` and
larger `Queue-*.js`/`RecordDetail-*.js`/`Users-*.js` chunks (the new status-update UI, IO
page, and SHO-scoped Users page), zero references to any deleted file.

### Phase 5 — done (2026-07-15)

Deleted, all confirmed zero-importer beforehand: `backend/src/modules/upload/` (whole
directory — never mounted in `app.js` to begin with), `backend/src/utils/s3.js`,
`backend/src/middleware/upload.middleware.js`, `backend/src/config/cloudinary.js`
(attachments/MinIO/S3/Cloudinary eliminated per the user's decision — permanent, not
deferred), `backend/src/modules/admin/customFields.controller.js` (orphan — `admin.router.js`
already didn't import it). Also removed a 4-line dead branch in
`level-contracts/levelContracts.service.js`'s `maskRecordDetails` that referenced
`details.customFields` — a no-op ever since Phase 1's `getRecordDetails` rewrite stopped
returning that key (the EAV query it came from is gone). `records/records.routes.js`,
`analytics/analytics.routes.js`, and `analytics/analytics.service.js` were already deleted in
Phases 1 and 3 (touched in the same pass as the modules they duplicated/served — noted here
for completeness, not re-done). Checked `package.json` for now-orphaned dependencies:
`multer` stays (still legitimately used by `import`/`legacy` routers for bulk-upload, unrelated
to record attachments); `cloudinary`/`aws-sdk` were never actual npm dependencies to begin
with (grep confirms zero references in `package.json`) — nothing to remove there. **Verified:
server boots clean after every deletion (nodemon auto-restart, no import errors), `/api/health`
and an authenticated endpoint both respond correctly.**

### Phase 4 — done (built and verified during Phase 1, confirmed here)

Both pieces of this phase were built alongside Phase 1's `records.service.js` rewrite
(they share every write-path helper — `writeRevision`/`writeAuditLog`/the transaction
shape — so building them in the same pass avoided reopening the file twice): `PATCH
/records/:id/status` + `updateDomainStatus()` (status_field validation against the
`record_status_events` CHECK set, not-future `effective_date` enforcement, `is_worked_out`
also stamps `fir_details.worked_out_date`), and `overrideCaseHead` rewritten against
`record_offences`'s `is_primary` row / the detail table's `local_head_id` instead of the dead
`records.data` blob. `getRecordDetails`'s response already carries `status_events` (ordered
by `effective_date` desc, joined to the changing user's `username`) — reconfirmed via a live
`GET /records/:id` call showing both a `case_status` change and an `is_worked_out` flip (with
its distinct backdated `effective_date`) from Phase 1's testing. No further work needed here.

### Phase 3 — done (2026-07-15)

`fields.controller.js`: `getFieldsForForm`/`listAllFields`/`createRegistryField`/
`updateRegistryField` all fixed against the real `field_registry` columns (`record_types` not
`applicable_record_types`, `labels`/`section_labels` jsonb not flat `label_en`/`label_hi`/
`section_label_en`/`section_label_hi` columns) via a normalization shim right after each
query — the HTTP response shape stays byte-compatible (still emits `label_en`/`label_hi`/
`applicable_record_types`) so nothing downstream needed to change. `createRegistryField` also
had two of its own latent bugs (predating this integration): inserted into a nonexistent
`created_by` column, and never set the now-required `storage` column at all — both fixed
(defaults new admin-created fields to `storage:"extra"`, matching config/README.md's
no-deploy path). Added `GET /fields/lookup/investigating-officers` (`io_id`'s
`options_source` target — delegates to `io.service.listIOs`, scoped via `enforceScope`
added to this one route only, unlike the global `ref.*` lookups beside it). **Verified live:
`getFieldsForForm('CASE')` now returns all 8 sections including the new `io_id` field with
its `options_source`; the lookup endpoint returns a correctly-scoped (empty, no IOs curated
yet) list.**

`compilation.service.js` fully rewritten off the dead `compilations.record_ids` column onto
`compilation_records` (delete+reinsert membership while DRAFT, frozen `ps_id_at_compile`/
`district_id_at_compile` snapshots). `submitCompilation` now takes the full `user` object
(not just an id) and drives each member record through the single write path —
`transitionRecord(id, user, 'compile', ...)` then `'submit'` — instead of the old code's
direct `DISTRICT_REVIEW → HQ_RECEIVED` UPDATE that bypassed the workflow engine, revisions,
and audit entirely. Router gained `allow('DISTRICT_OFFICER')` on both POST routes (previously
unrestricted). **Verified live: created a compilation bundling the Phase-1 test CASE, then
submitted it — `workflow_transitions` shows the full `COMPILE` (DISTRICT_REVIEW→COMPILED)
then `SUBMIT` (COMPILED→JCP_REVIEW) chain, each with its own revision.**

`analytics.controller.js` — of its 15 exported functions, 7 were actually broken (8 were
already fine and untouched): `getTrends`/`getByCrimeHead` (classification pivoted on dead
`data->>'crime_head'`/`case_head`/`pcr_head` — rewritten onto the `record_offences.is_primary`
row's `major_head` for CASE/ARREST, `pcr_call_details.call_head` directly for PCR_CALL, per
DB_SCHEMA.md §9.4's single-head-classification rule), `getCompare`/`getByPs`/`getByDistrict`
(`hierarchy_nodes.name_en`/`name_hi` → `.name`; `getByPs` also had the same dead
`node_type='SUB_DIVISION'` bug Integration 1 fixed elsewhere in the codebase — corrected to
`'SUB_DIV'`), `computeLeftOutAccused` (queried the dead `record_persons` table with
`person_type`/`first_name`/`last_name` — rewritten onto `persons` with `role`/`name`, plus its
own `fir_no` jsonb lookup fixed to a `fir_details` join), `exportSpreadsheet` (the old
"Details (JSON Block)" column had no jsonb to dump anymore — replaced with a small
per-record-type reference/status column pair instead of trying to reconstruct a full flat
export). Deleted `analytics.service.js` (confirmed zero importers — its own doc comment
already called it dead) and the orphaned `analytics.routes.js` duplicate; also deleted
`records/records.routes.js` (same orphan pattern, confirmed unimported) — all three were
Phase 5 kill-list items, done here since they were touched in the same pass. **Verified live:
all 12 routed analytics endpoints return `success:true`; `by-crime-head` shows real
classification counts ("THEFT": 2) from the Phase-1 test data; `status-breakdown` reflects
the actual workflow states across every test record created so far.**

`users` module — the carried-over half of item 7 (Integration 1 built IO curation; this
integration wires SHO-creates-HC). Router: `POST/PUT/DELETE /users` and
`/users/:id/reset-password` gained `allow('SHO', ...)` alongside `SYSTEM_ADMIN`; `GET /users`
gained `'SHO'` too (so the eventual frontend page can list a SHO's own PS roster). Controller:
new `assertUserInScope(target, caller)` helper (SYSTEM_ADMIN unrestricted; SHO only touches
`role='HC'` users whose `ps_id` matches their own) gates update/delete/reset-password;
`createUser` forces `role='HC'` and `psId=req.user.ps_id` server-side whenever the caller is
SHO — any other role in the body is rejected (403), any body-supplied scope fields are
discarded entirely (P5.4: jurisdiction is never trusted from the request body). **Verified
live, three cases: SHO creates an HC in their own PS (succeeds, correct ps_id/district_id/
sub_div_id backfilled via `resolveScope`); SHO attempts to create a SHO (403, blocked before
any DB write); SHO submits a forged foreign `ps_id` in the body (silently ignored, user still
lands in the SHO's own PS).**

### Phase 2 — done (2026-07-15)

`config/fields/common.json`: added `io_id` (SELECT, `{table:'records',column:'io_id'}`,
`options_source:'investigating-officers'`, co-located in the `investigation_officer` section
right before `io_name`); flipped `io_name`/`io_rank`/`io_pis`/`io_mobile` to
`storage:'ui_only', readonly:true` (auto-filled display once an IO is picked from the
dropdown — Phase 3 adds the lookup endpoint, Phase 6 wires the frontend fetch); removed
`CASE` from the shared `status` field's `record_types` + its `per_type` map (HANDOFF open
item (e) — `case_status` is CASE's own dedicated field, `status` now only serves
ARREST/PCR_CALL/MISSING/UIDB); added `major_heads`/`minor_heads`/`heinous_offence` as new
`ui_only` rows (documents the `ActsSectionsTable.jsx` state keys in the registry for
completeness — `record_offences` is the real store, per Phase 1's `offences[]` contract).
Confirmed by direct query beforehand that `missing_status`/`uidb_status`/`final_call_status`
do NOT need new individual field rows — the existing shared `status` field's `per_type`
dispatch already covers all three (a correction to the original plan's config survey, which
had mis-read this). `npm run sync-config`: `+4 inserted, ~5 updated, =371 unchanged` — clean,
validated against the live schema (`io_id` → `records.io_id` confirmed to exist, folded in
Integration 1).

### Phase 0 — done (2026-07-15)

- `record_properties.person_id uuid REFERENCES persons(id) ON DELETE SET NULL` added (nullable,
  indexed `idx_record_properties_person`), folded into `backend/migrations/20260711000004_persons_properties.js`
  per the pre-launch fold rule (no amendment migration — DB is disposable). Captures which
  participant (typically an ARRESTEE) a recovered property is associated with — the ARREST form
  already lets each arrestee carry their own property list; without this FK that per-person
  attribution had no home once multiple arrestees exist on one record. Deliberately `SET NULL`
  not `CASCADE`: deleting/replacing a person on an edit must not destroy the property row, since
  property rows are id-preserving-upserted specifically to protect
  `record_status_events.property_id` (`ON DELETE CASCADE`) history — see C4 in the plan.
- `docs/db-audit/DB_SCHEMA.md` §3.4 (column + index line) and §10 (new ruling 24) updated;
  `docs/db-audit/ER_DIAGRAM.md` §1 (overview) and §4 (persons/properties/locations domain sheet)
  updated with the new edge + column; `.drawio` regenerated
  (`node docs/db-audit/generate-drawio.mjs` — domain-4 relationship count went 10→11, confirmed).
- Full rebuild verified clean: `db:reset → db:migrate (6 migrations, batch 1) → sync-config
  (376 fields, 20 workflow rows, 5 proformas, 2 contracts, all clean inserts on a fresh DB) →
  load-ref (same known-good counts/quarantines as Integration 1: 29 excluded section rows, 562
  quarantined major_minor_mapping rows, 2090/2855 beats linked, 71 unmapped ps_cd — all expected,
  documented in `docs/db-audit/REF_KEY_VERIFICATION.md`) → db:seed (12 users)`.
  `person_id` FK confirmed via `pg_get_constraintdef`: `FOREIGN KEY (person_id) REFERENCES
  persons(id) ON DELETE SET NULL`.
- No other schema changes in this phase — everything else this integration touches (io_id,
  status columns, record_status_events) already existed before this integration started.

---

## Phase 7 — done (2026-07-15) — final verification, two more real bugs found

Broader live testing beyond Phase 1's CASE/ARREST pair, run against the running dev server:

- **MISSING, UIDB, PCR_CALL** record creation exercised (the two record types Phase 1's live
  testing hadn't yet touched) — all three succeeded first try against the already-verified
  mapper, confirming the registry-driven split generalizes correctly across all 5 record types.
- **Full workflow chain to HQ**: a CASE record driven through
  DRAFT→PENDING_SHO→DISTRICT_REVIEW→JCP_REVIEW→SCP_REVIEW→HQ_RECEIVED (submit, SHO approve, DO
  approve, JCP approve, SCP approve) — every hop correctly recorded in `workflow_transitions`
  and its own hash-chained revision.
- **Async link resolver (C5) end-to-end, positive match**: created a CASE with `fir_no=999` and
  a MISSING record referencing the same `fir_no` — found **bug #7**: `fir_details.fir_year` is
  allocator-assigned (the FIR-number-counter allocator is explicitly deferred with the transfers
  module, per this doc's "Deferrals" section) and is therefore NULL on every CASE record created
  this integration; the resolver's match query required an *exact* `fir_year` equality, which can
  never succeed against NULL, silently disabling positive link resolution entirely. Fixed:
  `linkResolver.js` now scopes by `(ps_id, fir_no)` — the two components actually populated
  today — and only additionally requires `fir_year` equality when the CASE side has one set
  (a no-op today, real disambiguation once the allocator lands). Re-verified: the CASE_MISSING
  link now inserts correctly on the next `record.updated` event.
- **Bug #8, the most significant one found in this entire integration — a pre-existing,
  severe production bug, not introduced by this integration but only surfaced by testing the
  new link resolver**: while diagnosing why the resolver "wasn't firing" even after the fir_year
  fix, traced it to `backend/index.js` — the file `npm run dev`/`npm start` actually execute per
  `package.json`'s `main`/`scripts` — running its **own independent bootstrap** (`connectDB` →
  `runStartupAutoload` → `connectEventBus` → historically `notifications.service.js`'s
  `initSubscriptions()` → `httpServer.listen()`) that **never calls `app.js`'s exported
  `startServer()`** at all. `startServer()` (which registers `notifyHandler.init()`,
  `linkAuditHandler.init()`, and this integration's new `linkResolver.init()`) only runs when
  `app.js` itself is the process entry point — true for nothing in the real npm scripts, only
  a test-harness guard (`process.argv[1].endsWith('app.js')`). The practical effect, confirmed
  by grepping for and finding zero `[LinkResolver]`/handler logs across multiple real requests:
  **in every real deployment to date, `notifyHandler.js` and `linkAuditHandler.js` — both
  already schema-correct and confirmed "fine, no changes needed" during Integration 1 and this
  integration's Phase 1 code read — have never actually executed.** SHO/HC never received
  workflow notifications; `link.*` events never got audited; and this integration's new async
  link resolver would have shipped silently non-functional. What *was* running instead:
  `notifications.service.js`'s `initSubscriptions()`, the handler CLAUDE.md §13 already
  flagged as suspect (wrong event `record.status_changed`, hardcoded mock user UUID) — and
  which, additionally confirmed here, has been failing on every single invocation anyway
  (`insert into notifications ... column "message" does not exist` — the old handler's insert
  shape predates the new `notifications` table's `type`+`params` jsonb schema).
  **Fixed**: `index.js` now imports and calls `notifyHandler.init()`, `linkAuditHandler.init()`,
  `linkResolver.init()` directly (matching `app.js`'s `startServer()` exactly); the dead
  `notifications.service.js` functions (`initSubscriptions`, `handleRecordStatusChanged`,
  `handleCompilationSubmitted`) are deleted per the kill list (ARCHITECTURE.md §2.2/§12) — the
  four still-live functions (`getNotifications`/`getUnreadCount`/`markAsRead`/`markAllAsRead`,
  used by `notifications.controller.js`) are untouched. **Verified live after the fix**: a
  fresh submit → SHO notification (`RECORD_SUBMITTED`) appeared; SHO approve → HC notification
  (`RECORD_APPROVED`) appeared; the CASE_MISSING link resolved correctly on the next update.
- **Bug #9, found while fixing #8's regression test**: `transitionRecord`'s event-name mapping
  (`records.service.js`) only special-cased `action==='approve'`/`'send_back'`, defaulting
  everything else — including `'submit'`, which `submitRecord` now routes through since Phase 1's
  consolidation — to the generic `record.status_changed`. `notifyHandler.js` subscribes to the
  **named** event `record.submitted`, not the generic one, so submissions never produced a
  notification even once the handler wiring bug (#8) was fixed. This is a genuine regression
  from this integration's own Phase 1 rewrite (the old, pre-integration `submitRecord`
  published `record.submitted` directly, as its own dedicated function). Fixed: added `submit`
  to the action→event-name map alongside `approve`/`send_back`. Verified live (see above).
- **Hash-chain verification** run across every record created this session (`verifyAuditChain`
  logic replicated per-record via `computeRowHash`/`GENESIS_HASH`): all 8 fresh records (1–6
  revisions each, spanning CREATE/UPDATE/STATUS_CHANGE/HEAD_OVERRIDE change types) verified
  cryptographically valid end-to-end. The two records created before bug #3/#4 (Phase 1) were
  fixed remain intentionally "broken" in this disposable dev DB — not a regression, cleared by
  the final full rebuild below.
- **Full clean rebuild from scratch** (`db:reset → db:migrate → sync-config → load-ref →
  db:seed`) run one final time end-to-end — 6 migrations (including the Phase 0 `person_id`
  fold), 380 fields synced clean (376 baseline + the 4 new rows this integration added:
  `io_id`, `major_heads`, `minor_heads`, `heinous_offence`), same known-good `ref.*` load counts
  as every prior rebuild, both seed files (`01_users.js` + `02_link_types.js`) clean. Backend
  reconnected against the fresh DB and served `/fields/form/CASE` correctly (8 sections). This
  is the DB state the next integration inherits.
- **Frontend**: `npm run build` reconfirmed clean after all Phase 6 changes and file deletions
  (see Phase 6's entry for the full list) — zero broken imports, output bundle includes the new
  `IOManagement`/`RecordDetail` (status UI)/`Users` (SHO scoping) chunks.
- **`CLAUDE.md` updated**: top-of-file DB status section now reflects Integration 2 as done
  (with a summary of bugs #8/#9 since they affect anyone debugging "why aren't notifications
  firing" in the future), §4's directory tree corrected (upload/Cloudinary rows removed, `io/`
  module and the three real event handlers listed), §10's `records.service.js` function table
  fully rewritten to the new signatures, §13's stale notification-handler warning replaced with
  the resolution (and a pointer to check `index.js`'s handler wiring first if this class of bug
  ever recurs), the old `records.router.js`/dual-router entries removed (no longer true).
- **`docs/new-db-integration/README.md`** roadmap flipped to done for Integration 2; noted that
  analytics is now covered here (Integration 4's remaining scope narrows to report-builder/
  daily-diary/warehouse/the unified report engine).

## Summary: 9 real, verified bugs found and fixed in this integration (none were "nice to have" —
every one was actively breaking a real code path, several of them (#3, #4, #8, #9) were
pre-existing and would have silently corrupted the hash chain or dropped every workflow
notification in production regardless of this integration's other changes):
1. `fir_details.ps_id` never stamped on create.
2. Act-group aliases had no resolvable `act_id` for `record_offences`'s CHECK constraint.
3. `record_revisions.prev_hash` genesis constant was undefined anywhere in the codebase (latent,
   pre-existing — masked only because record creation was already broken for unrelated reasons).
4. Hash computation wasn't canonicalized against jsonb's non-deterministic key ordering (latent,
   pre-existing — same masking as #3).
5. Person name-splitting mis-assigned 2-token names (first+middle instead of first+last).
6. `field_registry.storage`'s bare-string values (`"ui_only"`) were silently nulled by a
   double-JSON-parse bug, permanently blocking submit on any required `ui_only` field.
7. Link resolver's `fir_year` exact-match requirement could never succeed against the
   allocator-deferred NULL `fir_year` column, silently disabling link resolution entirely.
8. **`backend/index.js` (the real entry point) never called `app.js`'s `startServer()`** — no
   event-driven side effect (notifications, link audit, link resolution) has ever run in any
   real deployment of this application, pre-existing and undiscovered until this integration's
   live testing surfaced it.
9. `transitionRecord`'s event-name mapping didn't special-case `'submit'`, breaking submit
   notifications even after #8 was fixed (a regression from this integration's own Phase 1
   consolidation of `submitRecord` into the generic `transitionRecord`).
