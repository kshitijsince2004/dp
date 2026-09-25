# Integration 3 — Import / Bulk-Upload (frozen template → typed write path, async confirm, linkage)

**Status:** ✅ done, 2026-07-16 (WP0–WP8 complete; WP9 docs/verification below). **Branch:** `dev2/ashmit`.

Rebuilds the import/bulk-upload module (`backend/src/modules/import/`) against the typed
spine/detail/persons/properties/locations/offences schema, replacing the dead `records.data`
jsonb + old `record_persons`/`record_properties` write path the confirm endpoint still used.
Moves confirm to an async RabbitMQ handler, closes the case↔FIR linkage gap for imported
records (an explicit project requirement), hardens the frozen Excel template's in-file
validation without changing its visible columns/order/labels (P3.1), and deletes the separate
`legacy` module (dead tables, superseded by `import_batches`/`is_legacy`).

Full plan: `~/.claude/plans/1-update-all-the-lucky-sutherland.md` (if still present) — this doc
is the durable record. Reports/report-builder/daily-diary/warehouse are explicitly OUT of
scope (Integration 4).

---

## Phase table (updated after each WP completes)

| WP | Scope | Status |
|---|---|---|
| 0 | Registry-column shim + template freeze audit | ✅ done (2026-07-16) |
| 1 | Schema fold (`import_batch_id`, `severity`, progress columns) + docs sync | ✅ done (2026-07-16) |
| 2 | `createImportedRecord` write-path entry + linkResolver CASE branch | ✅ done (2026-07-16) |
| 3 | Parse extraction + key bridge + payload composer | ✅ done (2026-07-16) |
| 4 | Validation rewrite + batch service + slim controller | ✅ done (2026-07-16) |
| 5 | Async confirm over RabbitMQ | ✅ done (2026-07-16) |
| 6 | Router RBAC + upload hygiene + legacy-module deletion | ✅ done (2026-07-16) |
| 7 | Template hardening + baseline regen | ✅ done (2026-07-16) |
| 8 | Frontend `LegacyDataPage.jsx` rework | ✅ done (2026-07-16) |
| 9 | Docs + final verification | ✅ done (2026-07-16) |
| 10 | Post-verification fix pass (IO resolution, FIR normalization, case_registered, confirm-error persistence, Hindi labels) | ✅ done (2026-07-16) |
| 11 | Dataset-driven geo/nationality lists + state→district cascading (form + Excel) | ✅ done (2026-07-16) |

---

## Canonical contracts (filled in as each WP lands)

- **C1 — Import write options** (built WP2): `createImportedRecord(user, recordType,
  recordDate, data, ipAddress, {persons, properties, offences}, {scope, isLegacy, status,
  batchId, sourceRef})` in `records.service.js`. `scope = {ps_id, district_id, sub_div_id}` is
  **required** — throws immediately if `scope.ps_id`/`scope.district_id` are missing (never
  silently falls back to `user`'s own jurisdiction, unlike `createRecord`). `status` defaults
  `'DRAFT'`; pass `'LEGACY_IMPORTED'` for legacy batches. `current_level` is always `'PS'`
  regardless of caller (fixes the old import code's `current_level:'HQ'` bug — the district is
  only the upload *actor* for legacy batches, not where the record lives). Stamps
  `is_legacy`, `source_system:'BULK_IMPORT'`, `legacy_ref: sourceRef`,
  `import_batch_id: batchId`, `imported_at`, `imported_by` on the spine; writes a
  `change_type:'IMPORT'` revision and an `action:'IMPORT'` audit_log row (both already legal
  per the existing CHECK constraints — no schema change needed for this part). Publishes
  `record.created` after commit, same payload shape as `createRecord`.

  Implementation: `createRecord`'s transaction body was extracted into a private
  `insertRecordCore(trx, user, recordType, recordDate, data, ipAddress, split, opts)` shared by
  both exports — `createRecord` passes no `opts` (defaults: scope from `user`, `'DRAFT'`/`'PS'`/
  `'CREATE'`, no import stamps); `createImportedRecord` passes the import-specific values. This
  is a wrapper, not an options bag on `createRecord` itself, specifically so the interactive
  HTTP create endpoint has no code path that can accept a caller-supplied scope override
  (P5.4) — `createImportedRecord` is only ever called from the import confirm handler (WP5)
  with a scope pre-validated against the batch's target PS/district at upload time, never from
  request body or spreadsheet content.

  Verified live (smoke-tested against the dev DB, not just unit-shaped): `createRecord`'s
  output is byte-identical before/after the refactor (DRAFT/PS, no import stamps, `CREATE`
  revision); `createImportedRecord` produces the LEGACY_IMPORTED/PS spine + all provenance
  columns + IMPORT revision/audit correctly; calling it with no `scope` throws immediately
  rather than falling through to some default jurisdiction.
- **C2 — Key bridge** (built WP3): `import-key-bridge.config.js` exports `getBridge(recordType)`
  → a flat `{templateKey: entry}` map per type (`CASE`, `ARREST`, `KALANDRA`, `UIDB`, `MISSING`;
  `PCR_CALL` and any unlisted type get `{}` — its template is generated straight from the
  registry, so no mismatch can exist by construction). Entry shapes: `{to}` simple rename,
  `{compose:{targetKey,from,joiner}}` N cells → 1 key, `{validateOnly:true}` cross-checked
  against the batch's target PS/district then dropped, `{drop:true}` discarded (redundant or
  killed-by-ruling). `import.compose.js`'s `applyBridge(rowData, bridge)` applies it — renames
  first, then compositions (reading from post-rename keys), immutably. `scripts/
  import-bridge-parity.js` (`npm run import:parity`) is the enforcement: every curated
  template field_key must resolve via direct registry match, a bridge entry, or the small
  `COMPOSER_ONLY_KEYS` exemption (`act`/`crime_head`/`major_head`/`minor_head` — the act-sheet's
  own per-row inputs to the offences[] builder, never flat-mapped through `field_registry`);
  every bridge target must itself exist in the registry. **Confirmed clean**:
  `npm run import:parity` passes for all 5 curated types.

  Building this surfaced real, previously-invisible gaps — not guessed, each verified against
  live `field_registry`/schema queries before any fix. Full list + every user decision in the
  WP3 entry below; summary: two real DB columns had zero `field_registry` row routing to them
  at all (`arrestee_details.arrest_time`, `arrest_details.is_dd_based` — both fixed by adding
  registry rows, not by bridge workarounds); one column didn't exist anywhere and got a real
  schema-fold (`arrest_details.arresting_officer_rank`); `gd_date` (3 types) and `gd_time`
  (KALANDRA only) were the same "real column, no registry row" gap, fixed the same way;
  `gd_time` on UIDB/MISSING has no column at all — genuinely dropped at import; `mp_known`
  (MISSING) was silently deactivated in the registry — reactivated; `major_minor` (MISSING)
  turned out to have no legitimate typed destination at all (`persons.is_minor` is a Postgres
  `GENERATED` column, not writable — the already-required `age` field derives it correctly) —
  routed to `persons.extra` (via `{entity:'person', role:'MISSING', extra:true}`) as
  non-authoritative context rather than
  invented a fake writable column; `cctns_number` and CASE's stray `date_of_arrest` were dead
  template columns with zero storage destination and zero clear meaning — dropped.

- **C3 — Composed-payload parity** (built WP3): `import.parse.js`'s `readWorkbook(recordType,
  filePath, registryMap)` is the ONE workbook reader — resolves every sheet role via
  `SHEET_ALIASES`/`findWorksheet`, parses each with `parseWorksheet` against the correct curated
  field list per type/role (`SHEET_FIELD_LISTS`), and returns
  `{parentRows, childSheets: {<role>: rows}, parentIndex, parentKeyField}`. Both the validate
  endpoint and the async confirm handler (WP4/WP5) will call this on the same file — no more of
  the old controller's ~200-line resolve+parse dance duplicated between validate/confirm.
  `import.compose.js`'s `composeRecordPayload(recordType, parentRow, children, sourceRef)` takes
  one `readWorkbook()` result's parent+children (already grouped by the caller via
  `groupRowsByParent`) and returns the exact C1 shape:
  `{data, persons[], properties[], offences[], recordDate, sourceRef}` — applies the bridge,
  canonicalizes `fir_no` (G3), stamps `is_dd_based`/routes `gd_no` for KALANDRA (G2), builds
  `persons[]`/`properties[]`/`offences[]`, and (G6) merges the ARREST/KALANDRA person-sheet's
  record-level fields (`nafis_prepared`, `dossier_prepared`, `status`, `scheme_of_arrest`,
  `arresting_officer(+mobile/rank)`) into flat `data`, first-non-empty across arrestee rows,
  stripping them back out of the individual person entries so the value isn't submitted twice.

  **Bug found and fixed during WP3 build**: `getRecordDate('ARREST'|'KALANDRA', data)` reads
  `date_of_arrest`/`arrest_date` off the flat row — but the bridge moves that value onto the
  arrestee's own `persons[]` entry (it's a person-role field, not a detail-table one), so every
  ARREST/KALANDRA import would have failed `records.record_date`'s NOT NULL constraint whenever
  the date was only entered on the Person sheet — the common case, since `arrestGeneralFields`
  doesn't even offer a general-sheet arrest-date column. Fixed with an explicit fallback to
  `persons[0].data.arrest_date` in `composeRecordPayload`, mirroring the pre-Integration-3
  controller's own "fallback date_of_arrest ... from first person row" comment — same intent,
  ported forward, not a new invention.

  Verified live end-to-end (not just unit-shaped): generated real templates via
  `downloadImportTemplate`, filled cells via `buildColumnMap`-located columns, wrote to a temp
  file, ran it through `readWorkbook` → `composeRecordPayload` → `createImportedRecord`,
  inspected the resulting DB rows, and confirmed `record.created` events fire linkage — for
  CASE (victim persons[], offences[] with FK-resolved act_id, canonicalized fir_no), ARREST
  (bridged `fir_no`/`arrest_date`/`arrest_time`/`listed_criminal`/`arresting_officer`, merged
  record-level `nafis_prepared`, both linkage directions), and KALANDRA specifically for the
  G2 safety property — composed a Kalandra record whose GD sequence number **deliberately
  collided** with an existing CASE's FIR sequence, and confirmed `data.fir_no` is `undefined`,
  `data.gd_no` carries the value, `data.is_dd_based === true`, the written `arrest_details.fir_no`
  is `NULL`, and **zero** `record_links` rows were created for it — no phantom CASE link.

  **Orthogonal pre-existing bug found (not fixed, out of scope for this WP)**: `field_registry`
  rows for enum-like person fields (confirmed on `arrested_gender`) advertise `options[].value`
  in mixed case (`"Male"`) that the DB CHECK constraint requires uppercase
  (`persons_gender_check: gender IN ('MALE','FEMALE','OTHER','UNKNOWN')`, and `'Transgender'`
  has no matching CHECK value at all — the constraint only knows `'OTHER'`). Confirmed this is
  NOT import-specific: `extractRowData`'s SELECT/RADIO coercion (unchanged from the pre-
  Integration-3 code) always resolves to the registry's own advertised `value`, so no import
  cell content can route around it, and the interactive form's gender widget appears to submit
  the same registry-advertised value with no uppercase transform anywhere in
  `records.mapper.js`'s `normalizePersonValue`/`coerceByType` either — meaning a live form
  submission with `gender: 'Male'`/`'Transgender'` should hit the identical CHECK violation
  today. Worked around in WP3's own verification tests only (submitted `'MALE'` directly,
  bypassing the mismatched registry option). This needs a real fix — either uppercase the
  registry's `options[].value`s for every CHECK-constrained enum column, add a
  `'Transgender'`→some-CHECK-legal-value mapping, or loosen the CHECK constraint — but it
  belongs to the records write path / Integration 2's normalization layer, not Integration 3's
  import module, and is flagged here for whoever picks it up next.
- **C4 — Provenance/idempotency**: `records.import_batch_id` (new FK) + `records.legacy_ref`
  (the row's canonical source key — parent FIR/GD/DD key, or `row:<n>` for single-sheet types)
  together form the idempotency key for resumable confirm. To be filled in as built (WP1/WP2).
- **C5 — Batch lifecycle + async confirm** (built WP4/WP5, all in `import.service.js` — one
  file owns the full lifecycle, not split across modules): `createBatch({user, recordType,
  isLegacy, targetPsId, filePath})` inserts `VALIDATION_PENDING`, calls `readWorkbook` +
  `validateBatch`, persists the FULL error set (always, both severities) plus
  `__INVALID_PARENT__` sentinel rows, and lands on `VALIDATED` — never leaves a batch in
  `VALIDATION_PENDING` on return (throws instead, caller cleans up). `claimBatch(batchId,
  userId)` is the atomic `VALIDATED→CONFIRMED` handoff (§4.7) — `POST /import/confirm/:batchId`
  calls it then publishes `import.confirm.requested`. `cancelBatch` only accepts
  `VALIDATION_PENDING`/`VALIDATED` (D6 — no undo once CONFIRMED, records are append-only).
  `listBatches`/`getBatchDetail` apply `jurisdictionQuery` (P5.1) and `getBatchDetail` computes
  linked/unmatched counts live via `import_batch_id` joins (AD5 — never stored, since
  linkResolver resolves asynchronously after each record's `record.created`).

  `processBatch(batchId)` — the actual confirm worker, invoked only by
  `importConfirmHandler.js`'s subscription to `import.confirm.requested` (mirrors
  `linkAuditHandler.js`'s thin-glue shape; wired into BOTH `index.js` and `app.js`'s
  `startServer()`, per AD4/known-issue-#3's lesson — never repeat the "handlers registered in
  only one of the two bootstrap paths" bug). Design, revisited from the plan during
  implementation: rather than duplicating parse/group/compose logic inline, `processBatch`
  **re-runs `validateBatch` in full** against the freshly re-read workbook (AD7) — this isn't
  wasted work, it's what guarantees byte-for-byte parity between what was validated and what
  gets written, it naturally re-checks `DUPLICATE_IN_DB` against the database's CURRENT state
  (catching any cross-batch race with zero bespoke detection code), and — critically — it's the
  ONLY call site that invokes `validateRefLabels`'s legacy raw-value-preservation mutation
  before a real write (see C6). Per-row idempotency is `records WHERE import_batch_id=? AND
  legacy_ref=?` (AD2's pairing) — the resume mechanism after any interruption. A single row's
  `createImportedRecord` failure is caught, downgrades to `WRITE_FAILED` (or `DUPLICATE_IN_DB`
  WARNING for the specific case of a unique-constraint race) and the batch continues; only a
  failure of the whole function (source file missing, uploader deleted) marks the batch
  `FAILED` — and even then `processBatch` always resolves normally rather than throwing, since
  `eventBus.js` nacks-without-requeue-or-DLQ on a thrown error (§4.6/G4) and a dropped message
  with no trace is worse than a batch correctly marked FAILED. `sweepStaleConfirmedBatches`
  (called once from the handler's `init()`, not on a timer) re-publishes any batch stuck in
  `CONFIRMED` for >15 minutes — covers a message genuinely lost (e.g. an in-memory event bus
  process restart between publish and consume); safe because of the same idempotency guarantee.

  `import.controller.js` is now a THIN HTTP layer (3168 → 555 lines) — template generation
  (`downloadImportTemplate`/`addSheetToWorkbook`/`getHint`, untouched, WP7's territory) plus 5

  `import.controller.js` is now a THIN HTTP layer (3168 → 555 lines) — template generation
  (`downloadImportTemplate`/`addSheetToWorkbook`/`getHint`, untouched, WP7's territory) plus 5
  endpoint functions that translate HTTP↔service with minimal D1/D2 mode checks (full RBAC +
  district-membership enforcement is WP6). New `cancelImportBatch` export exists, not yet
  routed (WP6 wires the route alongside its RBAC pass, per the plan's own WP6 scoping).

- **C6 — Legacy leniency & the error taxonomy** (built WP4): `import.validate.js` implements
  the full `docs/new-db-integration/03-import.md` §WP4 plan taxonomy — `REQUIRED_MISSING`/
  `PARENT_KEY_MISSING`/`DUPLICATE_IN_SHEET` (row-level, both modes ERROR),
  `REF_UNRESOLVED_SECTION`/`_MAJOR_HEAD`/`_MINOR_HEAD`/`_LOCAL_HEAD`/`_BEAT` (composed-level,
  ERROR non-legacy / WARNING legacy — dry-run via the exact `records.normalize.js` resolvers
  the write path itself uses, so a validate-time PASS is a write-time guarantee, not a guess),
  `ACT_UNKNOWN` (WARNING both — informational, `other_act_name` is schema-sanctioned),
  `DUPLICATE_IN_DB` (**CASE only** — see below), `RECORD_DATE_MISSING`, `PS_MISMATCH`
  (forgiving substring sanity check, P5.6, never authoritative for scoping),
  `SUBMIT_REQUIREMENTS_PENDING` (WARNING, non-legacy only, advisory — wraps the exported
  `validateRequiredFields` in try/catch, G10). WARNING never invalidates a parent FIR; ERROR
  does (whole-FIR atomicity, unchanged from the old code).

  **`DUPLICATE_IN_DB` is CASE-only**, corrected from the plan's original ambiguous "CASE/ARREST"
  framing during implementation: `arrest_details` has no `ps_id` column at all (an ARREST's
  scope lives on the `records` spine only — `fir_details.ps_id` is the deliberately
  denormalized business-key column, DB_SCHEMA.md §9.3 #3), and more fundamentally a repeated
  `fir_no` on the ARREST side isn't a duplicate in the first place — several arrestees
  legitimately share one FIR.

  **Legacy raw-value preservation — redesigned from the original plan during implementation.**
  The plan's AD6 assumed a generic `extra._import_unresolved` bucket on "the owning detail/
  person row." Verified against the live schema this doesn't work: `record_offences` (where
  section/major/minor-head resolution actually happens) has **no `extra` column at all** — only
  `act` has a real fallback (`other_act_name`, schema-sanctioned, shared with the interactive
  form). User-directed resolution (2026-07-16): for `local_head`/`beat_no` — which DO have a
  real detail-table `extra` column to land in (`fir_details`/`arrest_details`/`uidb_details`)
  — added two new dedicated, system-only `field_registry` rows (`local_head_raw` on `common.json`
  types CASE/ARREST/UIDB, `beat_raw` on `case.json` type CASE only; both `storage:"extra"`,
  `visible_to_levels:[]`/`editable_by_levels:[]`/`readonly:true` — never an officer-filled
  template cell, excluded from every type's `TEMPLATE_EXCLUDE_KEYS` the same way `arrest_time`/
  `is_dd_based` were in WP3). For `section`/`major_head`/`minor_head` (the `record_offences`
  fields with no `extra` column and no free-text fallback but `act`), the DEFAULT was accepted:
  the FK column lands `NULL` on the record — same as if an officer left it blank — but the raw
  text stays permanently visible in that batch's `import_batch_errors.error_message` (queryable/
  exportable per-batch audit trail), and districts can amend the record once the correct ref
  value is identified. No `record_offences` schema change this integration.

  `import.validate.js`'s `validateRefLabels` is **dual-purpose, deliberately**: as a side
  effect, when `isLegacy` and `local_head`/`beat_no` fail to resolve, it mutates
  `payload.data.local_head_raw`/`.beat_raw` in place. This ONLY reaches the DB if WP5's confirm
  handler calls `validateRefLabels` again on its own freshly-recomposed payload immediately
  before `createImportedRecord` (AD7 — confirm never trusts a validate-time in-memory object
  across the HTTP boundary) — **WP5 must not skip this call**, discarding the returned `errors`
  array is fine (already persisted at validate time) but the mutation side effect is the only
  path the raw value has to the database. Verified live: composed a legacy CASE payload with
  an unresolvable `local_head`, ran `validateRefLabels`, wrote it via `createImportedRecord`,
  and confirmed `fir_details.local_head_id IS NULL` while
  `fir_details.extra = {"local_head_raw":"<the exact historical text>"}`.
- **C7 — Linkage** (built WP2): `createImportedRecord` publishes `record.created` per record
  (same event, same payload shape as the interactive create path), so `linkResolver.js`
  resolves CASE_ARREST/CASE_MISSING links for imported records exactly as it already does for
  form-created ones — no separate linkage code in the import module at all (this is what lets
  WP4/WP5 delete the old `runAutoLinkageForArrests` entirely rather than port it).

  `linkResolver.js` gains a **CASE branch** in `resolveAndLink`: when the triggering record is
  a CASE, it looks up that CASE's `fir_details.fir_no` and, for both ARREST and MISSING (every
  key of the existing `RESOLVERS` map), finds every record of that type in the same PS whose
  detail-table `fir_no` matches, and inserts a `record_links` row per candidate (source = the
  CASE, target = the candidate) via the same idempotent `onConflict(...).ignore()` pattern the
  pre-existing forward direction already uses — no pre-check for already-linked candidates, the
  unique constraint absorbs repeats cheaply on every `record.updated` for a busy CASE. This
  closes the actual gap: **data-entry/import order is never guaranteed** — an arrest or a
  missing-person report can be filed, or bulk-imported, before its case exists, or after;
  officers fill end-of-day paperwork in whatever order it physically arrives, and legacy
  district imports may land arrests, missing persons, and cases from the same historical FIR
  in three separate batches in any order. Before this branch, only ARREST/MISSING→CASE
  resolved; a CASE created after its arrests/missing-persons never triggered anything (the old
  `RESOLVERS` map has no `CASE` key, so `record.created` for a CASE returned early doing
  nothing).

  Verified live (smoke test, both directions, real DB): (1) ARREST created first (orphan) →
  CASE created with the matching `fir_no` → `record_links` row appears with
  `metadata.resolved_via:'fir_no_backfill'`; (2) CASE created first → ARREST created with the
  matching `fir_no` → `record_links` row appears via the pre-existing forward path
  (`resolved_via:'fir_no'`), unchanged. Both directions produce exactly one link row, correctly
  idempotent on retry.

---

## Deferrals carried forward (not forgotten)

- FIR-number allocator still not built (`fir_number_counters` unused, `fir_year` NULL on every
  `fir_details` row) — carried from Integration 2. Linkage matches on `(ps_id, fir_no)` only.
  ~~Import's `fir_no` canonicalization (`"<seq>/<year>"` via `parseFirAndYear`) is a bulk-import-
  side fix only; the interactive form does not canonicalize its own `fir_no` input the same
  way~~ **RESOLVED (T7.1 + verified Integration 5, 2026-07-20):** `normalizeFirNo`/
  `expandFirYear` now live in `records.normalize.js` (the P2 layer) and are applied by
  `records.mapper.js` for every `fir_no`-targeted column on BOTH the interactive and import
  write paths; cross-format CASE↔ARREST auto-link verified live end-to-end. The allocator
  itself (fir_year population) remains deferred with the transfers module.
- Amendments rework (`legacy.controller.js`'s `requestAmendment`/`approveAmendment`/
  `rejectAmendment` → `record_amendments`) is **deferred**, not deleted-and-forgotten: no
  frontend page calls `/legacy/amendments` today, and `config/workflow/main.json` already
  carries the `legacy.amendment_*` transition rows for when this is built.
- ~~State→District cascade permanently degraded~~ — **RESURRECTED in WP11 (2026-07-16)**: the
  cascade's data source is now the reviewed LGD-derived snapshot
  `config/ref-data/india_states_districts.json` (36 states/UTs, 762 districts — regenerate via
  `backend/scripts/dev/build_india_districts.mjs` and review the diff), exposed through
  `backend/src/config/geoData.js`. The old `state_districts` table stays dead; the snapshot
  replaces it. See the WP11 entry below for the full contract (address vs occurrence scoping,
  the OPT_INDIA_DISTRICTS fallback, and the form-side cascading endpoint).
- Sheet protection (`worksheet.protect()`) in the hardened templates (WP7) may be dropped if it
  interferes with real-Excel row-insert/copy-paste workflows — to be confirmed during WP7.
- `arrest_details.custody_status` column: confirmed dead (no `field_registry` row maps to it;
  the ARREST "status"/"Custody status" field maps to `arrest_details.case_status` via a
  `per_type` storage shape in `common.json`). Not removed (migrations are schema-only forever;
  a future integration can drop it), just documented so nobody re-wires the import bridge to it.
- ~~`io_id` IO resolution deferred~~ — **BUILT in WP10 (2026-07-16)**, superseding the WP0-era
  design of resolving from `io_name`+`io_pis`: the template now carries a single
  "IO ID (PIS No.)" column (field_key `io_pis`; `io_name`/`io_rank`/`io_mobile` removed —
  explicit user-approved P3.1 exception), and `import.validate.js` resolves the PIS against
  `investigating_officers` scoped to the batch's target PS, stamping the resolved uuid onto
  `data.io_id` (registry-routed to `records.io_id`). Unknown PIS → `IO_NOT_REGISTERED`
  **ERROR in both modes** (strict, user decision — not the legacy-WARNING pattern). An
  in-site correction UI for flagged rows remains FUTURE scope.
- `gd_time` has no schema column at all on `uidb_details`/`missing_details` (confirmed via the
  migration — only `pcr_call_details` and `arrest_details` have it). The template columns stay
  (frozen); their values are dropped at import for UIDB/MISSING (user-confirmed, WP3) rather
  than schema-folding a column onto two tables for a field that may not be meaningfully used
  there. Revisit if it turns out to matter operationally.
- ~~**New pre-existing bug found (not fixed, out of scope for Integration 3)**: `field_registry`
  option `value`s for enum-like person fields (confirmed on `arrested_gender`) don't match their
  column's DB CHECK constraint casing/vocabulary~~ **RESOLVED (T7.1 + Integration 5,
  2026-07-20):** `records.normalize.js`'s `normalizeEnumUpper` canonicalizes option values to
  CHECK vocabulary; the `persons.gender` CHECK gained `'TRANSGENDER'` (folded into base
  migration `20260711000004` per the pre-launch fold rule — the standalone
  `20260711000007` amendment migration was deleted) **and the column was widened
  varchar(10)→varchar(20)** (second latent bug: the 11-char CHECK-legal value could never
  physically insert). Live-verified: 'Male'→MALE, 'Transgender'→TRANSGENDER through the real
  write path. Residual sibling issue found by the Integration-5 enum audit: UIDB
  `deceased_relation_type` options have no CHECK-legal counterpart — needs a user ruling
  (amends ruling 21); see `FUTURE-IMPROVEMENTS.md` E5.
- **Pre-existing bug found, not fixed here**: the checked-in base workbooks
  (`CASE_Import_Template_Final.xlsx`, `ARREST_Import_Template_Final.xlsx`) and/or
  `TemplateBuilderService`'s column-management logic (`deleteColumnAt` — its own comment
  already flags "corrupts ExcelJS's range-merging optimiser on write") leave trailing
  **null-field_key columns** at the end of several sheets (confirmed present on unmodified
  `HEAD` too — e.g. ARREST/Person Arrested Detail cols 49-55, right after `scheme_of_arrest`;
  CASE/General Information similarly after its last curated column). Registry auto-append then
  lands its new columns interleaved with/after these nulls rather than cleanly at the sheet's
  true end. Not a WP0 regression — pre-dates this integration, latent since whenever
  `deleteColumnAt` was last run against these base files. Flagged for a fix during WP7
  (template hardening), which already touches `addSheetToWorkbook`/`deleteColumnAt`; likely
  fix is a trailing-null-column sweep after the curated+auto append loop, before writing.

---

## Entries below are added as each WP completes.

### WP0 — done (2026-07-16)

**What was found:** the import module was broken on the new schema in ways well beyond the
plan's anticipated "registry column rename" scope:

1. `field_registry.applicable_record_types`/`label_en`/`label_hi`/`required` (flat, pre-
   restructure shape) don't exist — real columns are `record_types` (jsonb), `labels`/
   `section_labels` (jsonb `{en,hi}`), and `required` lives inside `validation_rules` (jsonb).
   Every read of these in the import module was silently getting `undefined`.
2. `template-builder.service.js` additionally queried five dead `excel_*` tables directly
   (`excel_sections` ×2, `excel_major_minor_mapping`, `excel_major_heads` ×2) — these are `ref.*`
   now (`ref.sections`, `ref.major_minor_mapping`, `ref.major_heads`).
3. Three `hierarchy_nodes` queries (one in `import.controller.js`, three in
   `template-builder.service.js`) selected the dead column `name_en` (real column: `name`) and
   one used the dead `node_type` value `'SUB_DIVISION'` (real value: `'SUB_DIV'`).
4. `template-builder.service.js` queried a `state_districts` table that no longer exists
   anywhere in the schema (see Deferrals above) — the state→district Excel cascade feature has
   been silently non-functional (falling back to a static list) since the DB restructure.

**Consequence of #1 specifically:** the base-workbook path (used for CASE/ARREST, which loads a
checked-in `.xlsx` and deletes columns not recognized as curated-or-auto-included) had been
silently **deleting legitimate existing columns** from the base files on every template
generation, because `autoIncludedRegistryFields()` always returned `[]` (broken
`applicable_record_types` parse). Confirmed via `node scripts/template-regression.js check` on
unmodified `HEAD`: the tool could not even complete a comparison (crashes generating the UIDB
template), meaning the checked-in baseline manifest has been unvalidatable — and therefore
unvalidated — since the DB restructure.

**Fix:**
- `registry-sync.util.js`: new exported `normalizeRegistryRow(f)` (mirrors the existing shim in
  `fields.controller.js:124-140`) — applied at all 4 `field_registry` load sites in the import
  module (3 in `import.controller.js`, 1 in `template-builder.service.js`).
- `template-builder.service.js`: `excel_*` → `ref.*` renames (5 call sites, straight table-name
  swaps, no column changes needed — the old and new schemas share column names here);
  `hierarchy_nodes` `name_en`→`name`, `'SUB_DIVISION'`→`'SUB_DIV'` (4 call sites total across
  both files); `state_districts` query replaced with `const sdRows = []` (documented as a
  discovered gap, not silently patched over).

**Content decisions (P3.1 sign-off, user, 2026-07-16)** — once template generation actually
worked, `template-regression.js check` surfaced ~36-41 new/restored columns per type (CASE,
ARREST, KALANDRA especially) — legitimate active `field_registry` rows that a schema-rename bug
had been hiding. Reviewed field-by-field with the user:

| Decision | Fields | Where |
|---|---|---|
| **Include** | 32 property sub-type detail fields (arms/document/drug/electronics/gold — make, serial, quantity, value, etc.) | CASE, ARREST, KALANDRA property sheets |
| **Include** | `complainant_qualification`, `accused_qualification`, `arrested_qualification` | CASE, ARREST/KALANDRA — form/import parity: these are commented out of the curated `import-fields.config.js` list but active+applicable in the DB, so they already render on the interactive form |
| **Include** | 6 ARREST/KALANDRA special-scheme flags (`integrated_pi`, `group_patrolling`, `cycle_patrolling`, `by_antisnatching_team`, `by_prahari`, `by_eyes_ears_scheme_members`) | ARREST, KALANDRA |
| **Include, required relaxed for import** | `work_out` (bool) + `work_out_date` (date) | CASE, `investigation_officer` section — ties to the recent ruling 23a addendum; still required on the interactive form, not enforced at import (record completes it later) |
| **Include, required relaxed for import** | `missing_fir_no`, `missing_fir_date` | MISSING — these bridge straight to `missing_details.fir_no`/`fir_date`, exactly what `linkResolver.js` already keys off; left optional at import since the linked CASE may not exist/be imported yet |
| **Include** | `uidb_no` (required) | UIDB — UIDB Gazette Number, no relaxation requested |
| **Exclude** (`TEMPLATE_EXCLUDE_KEYS`) | `major_heads`/`minor_heads` (case-level rollup) | CASE, ARREST, KALANDRA, UIDB — user judged these redundant with the per-section `major_head`/`minor_head` already on the Act and Sections sheet |
| **Exclude** (`TEMPLATE_EXCLUDE_KEYS`) | `io_id` | all types — resolved from the existing `io_name`/`io_pis` curated columns at import validation time instead of asking for a raw FK (validation must confirm the named IO exists in `investigating_officers`, erroring/telling the officer to register the IO first if not — **not yet implemented, WP3/WP4 work**) |
| **Exclude** (`TEMPLATE_EXCLUDE_KEYS`) | `transfer_to` | CASE — no import workflow for transfers yet |
| **Exclude** (`TEMPLATE_EXCLUDE_KEYS`) | `case_registered` | MISSING — redundant with whether `missing_fir_no` is filled; **WP3 compose step must derive `missing_details.case_registered` = `'Yes'`/`'No'` from `missing_fir_no`'s presence**, since the column is real (`missing_details.case_registered`) and no longer collected as its own template cell |

Implemented via new `IMPORT_OPTIONAL_REQUIRED_KEYS` export in `import-fields.config.js`
(`{work_out_date, missing_fir_no, missing_fir_date}`) — consulted by `normalizeRegistryRow` so
the DB's `required` flag is overridden to `false` for these three specifically, for import
purposes only (the interactive form is untouched and still enforces them). WP4's validation
must consult the same set (or re-derive `required` the same way) so `REQUIRED_MISSING` is never
raised for these three at import.

**Two small content fixes** (user: "use DB dynamic thing" — current registry content is
authoritative over the stale baseline):
- KALANDRA's `heinous_offence` label: baseline had "Heinous Offences" (plural), current DB
  registry has "Heinous Offence" (singular) — no code change, DB content wins as-is.
- MISSING's `major_minor` field (adult/minor status of the missing person — unrelated to crime
  major/minor heads) lost its "select: Major, Minor" hint because no `field_registry` row
  exists for it at all (`getHint(matched)` falls through to `''` when `matched` is undefined) —
  fixed by adding an explicit `hint: 'select: Major, Minor'` to the already-correct curated
  entry in `import-fields.config.js` (curated `f.hint` takes priority over the DB fallback).

**Fourth bug found — nondeterministic auto-append order:** both `field_registry` loads that
feed `autoIncludedRegistryFields()` sorted only by `sort_order` (`import.controller.js:1463`,
`template-builder.service.js:1122`) — ties (most of these fields share `sort_order` or have it
NULL) resolved by incidental DB row order, which changed across a plain `db:reset`/reseed with
no code changes. Confirmed by generating the same template twice across a DB reset: the *set*
of auto-appended columns was identical but their *order* differed. This would have made the
template-regression baseline itself flaky (spurious diffs on every reseed, unrelated to any
real change) — directly undermines the tool's purpose as the P3 frozen-template guard. Fixed:
both `orderBy('sort_order', 'asc')` calls now add a secondary `field_key` tiebreak. Verified
deterministic: `template-regression.js check` run twice back-to-back now produces byte-identical
output.

**Fifth issue found, deferred (not fixed here):** the checked-in base workbooks
(`CASE_Import_Template_Final.xlsx`, `ARREST_Import_Template_Final.xlsx`) carry trailing
null-`field_key` columns at the end of several sheets — confirmed present on unmodified `HEAD`
too (e.g. ARREST/Person Arrested Detail cols 49-55 right after `scheme_of_arrest`), so this
pre-dates Integration 3 entirely; not a regression from any fix here. See Deferrals above for
the planned WP7 fix.

**Verification:** `node scripts/template-regression.js check` now completes for all 5 template
types (CASE/ARREST/UIDB/MISSING/KALANDRA) — previously crashed outright. Two consecutive runs
(including across a full `db:reset && db:migrate && sync-config && load-ref && db:seed`) produce
byte-identical manifests. A new baseline will be blessed at the end of WP7 (template hardening)
rather than now, so the baseline is only regenerated once, capturing both the WP0 correctness
fixes and the WP7 enforcement additions in one reviewable diff.

**Files changed:** `registry-sync.util.js`, `import.controller.js` (registry/hierarchy query
sites + sort tiebreak), `template-builder.service.js` (registry/hierarchy/excel_*/
state_districts query sites + sort tiebreak), `import-fields.config.js` (`TEMPLATE_EXCLUDE_KEYS`
additions, new `IMPORT_OPTIONAL_REQUIRED_KEYS` export, `major_minor` hint).

### WP1 — done (2026-07-16)

Schema fold (AD2/AD3 — pre-launch fold rule, no standalone migration file, dev data disposable):

- `records.import_batch_id uuid REFERENCES import_batches(id) ON DELETE SET NULL` + index,
  added via `ALTER TABLE` at the **end** of migration `...0006` (after `import_batches` itself
  is created there — `records` is created earlier, in `...0003`, which is why this couldn't
  fold into that migration instead). `down()` drops the column before dropping the tables it
  references.
- `import_batch_errors.severity varchar(10) NOT NULL DEFAULT 'ERROR' CHECK IN ('ERROR','WARNING')`.
- `import_batches.processed_rows int NOT NULL DEFAULT 0` and `.error_message text`.

Docs updated in the same change (baseline review checklist item 1): `DB_SCHEMA.md` §2.1
(`records` — added `legacy_ref`'s real meaning + `import_batch_id` row) and §7.6/§7.7 (new
columns); `ER_DIAGRAM.md` (new `import_batches |o--o{ records` relationship in the overview,
domain §3, and domain §6 diagrams; `records`/`import_batches`/`import_batch_errors` attribute
blocks updated to match); `ER_DIAGRAM.drawio` regenerated
(`node docs/db-audit/generate-drawio.mjs` — 621706 bytes, 8 pages, ran clean).

**Verification:** full reset chain run clean end-to-end —
`db:reset && db:migrate && sync-config && load-ref && db:seed`. Migration applied without
error (6 migrations, batch 1); `sync-config` loaded 380 field_registry rows + 20 workflow
transitions + 5 report templates + 2 level contracts; `load-ref` loaded all 21 `ref.*` tables
+ 349 hierarchy nodes (the known, already-documented gaps — 29 excluded prose-spillover
section rows, 562/2136 quarantined major_minor_mapping rows, 71 unreconciled beat ps_cds — all
reproduced exactly as `CLAUDE.md` already describes them, confirming nothing new broke); seed
created 12 users + 2 link types. Re-ran `template-regression.js check` post-reset: same
finding set as WP0 (confirms the WP0 sort-tiebreak fix — see below — makes output stable
across a full DB rebuild, not just repeated runs against the same data).

**Files changed:** `migrations/20260711000006_links_compilation_config_reporting.js`,
`docs/db-audit/DB_SCHEMA.md`, `docs/db-audit/ER_DIAGRAM.md`, `docs/db-audit/ER_DIAGRAM.drawio`
(regenerated, not hand-edited).

### WP2 — done (2026-07-16)

Built exactly per plan §WP2 (see C1/C7 above for the full contract) — `records.service.js`'s
`createRecord` transaction body extracted into a shared private `insertRecordCore`, new
exported `createImportedRecord` wrapper, `validateRequiredFields` changed from private to
exported (needed by WP4's advisory `SUBMIT_REQUIREMENTS_PENDING` check); `linkResolver.js`
gained the CASE back-resolve branch (`backfillOrphansForCase`).

No new bugs found in this WP beyond what C1/C7 already describe — the design in the approved
plan matched the actual code shape (`records.service.js`'s existing `insertPersonEntry`,
`replaceOffenceRows`, `writeRevision`, `writeAuditLog`, `detailScopingColumns` helpers were
already factored the way the plan assumed, so the refactor was mechanical). One deliberate
deviation from the plan's rough pseudocode: the CASE-branch backfill does **not**
`whereNotExists`-filter candidates before attempting the link insert — it matches the
pre-existing forward-direction resolver's own idiom (attempt-and-let-`onConflict`-absorb) for
consistency, since that idiom was already established in this exact file and adding a second
idempotency strategy alongside it would be inconsistent for no correctness benefit at PS-level
record volumes.

**Verification:** live smoke tests against the dev DB (not just read-through) — `createRecord`
byte-identical pre/post-refactor; `createImportedRecord` produces correct
LEGACY_IMPORTED/PS/is_legacy/source_system/legacy_ref/imported_at/imported_by +
IMPORT revision + IMPORT audit_log; missing-scope guard throws as designed; both linkage
directions (ARREST-then-CASE backfill, CASE-then-ARREST forward) each produce exactly one
correct, correctly-idempotent `record_links` row. All test records cleaned up after.

**Files changed:** `records.service.js`, `events/handlers/linkResolver.js`.

### WP3 — done (2026-07-16)

Built per plan §WP3 with one significant scope expansion, agreed with the user along the way:
the parity script (`scripts/import-bridge-parity.js`) surfaced **14 real gaps** on its first
run, not the 2 the plan anticipated (`time_of_arrest`, `verifying_officer_rank`). Each was
investigated against the live schema/registry (never guessed) and resolved with explicit
user sign-off — full list:

| Field | Type(s) | Root cause | Resolution |
|---|---|---|---|
| `arrest_time` | ARREST | `arrestee_details.arrest_time` column real, zero registry rows | Added `config/fields/arrest.json` row (ARRESTEE role) — renders on the interactive form too |
| `is_dd_based` | ARREST/KALANDRA | `arrest_details.is_dd_based` — schema's own-documented "arrest-basis discriminator" (ruling 18) — real column, zero registry rows | Added a registry row marked `readonly`/`visible_to_levels:[]`/`editable_by_levels:[]` (system/derived, composer-set only — never an officer-filled cell) |
| `verifying_officer_rank` | ARREST | No column anywhere (only name/mobile existed) | **Schema-folded** `arrest_details.arresting_officer_rank varchar(50)` (migration `...0003`, same pre-launch fold rule as `import_batch_id`) + registry row |
| `gd_date` | ARREST(Kalandra)/UIDB/MISSING | Real columns on all 3 detail tables, zero registry rows | Added one shared `config/fields/common.json` row, `record_types:['ARREST','MISSING','UIDB']`, `$detail`-routed |
| `gd_time` | ARREST(Kalandra) | `arrest_details.gd_time` real, zero registry rows | Added `config/fields/arrest.json` row |
| `gd_time` | UIDB/MISSING | **No column exists** on `uidb_details`/`missing_details` at all | User-confirmed drop (bridge `{drop:true}`) — no schema fold, unlike the ARREST case |
| `mp_known` | MISSING | Registry row exists but `is_active:false` | Reactivated |
| `major_minor` | MISSING | Initially thought a real gap; investigation found `persons.is_minor` is a Postgres `GENERATED ALWAYS AS (age < 18) STORED` column — not writable, and MISSING's already-required `age` field derives it correctly, making this field genuinely redundant, not a gap | Added as `{entity:'person', role:'MISSING', extra:true}` — preserved as non-authoritative context (officer's raw answer), the real major/minor status is always the DB-derived one |
| `cctns_number` | CASE | No schema column; the *concept* it represents was explicitly killed by ruling 15 ("cctns_flag/zero_fir_flag both expressed by case_type... do not re-add" — `CLAUDE.md`) | Dropped at import (bridge `{drop:true}`) |
| `date_of_arrest` | CASE (general sheet) | Copy-paste leftover from the ARREST curated list — CASE records have no arrest-date concept | Dropped at import |
| `act`/`crime_head` | CASE/ARREST/KALANDRA act sheets | Not real gaps — these are the act-sheet's own per-row inputs to the `offences[]` builder (same category as `major_head`/`minor_head`, already correctly exempted), the parity script just hadn't been told that yet | Added to `COMPOSER_ONLY_KEYS` in the parity script (mechanical fix, no data/schema decision) |

Two follow-on correctness issues found and fixed **after** the config additions landed, before
declaring the gate clear:
1. **Auto-append duplication risk**: `arrest_time`/`is_dd_based`/`gd_date`/`gd_time` are all now
   live registry fields whose field_key does NOT match any curated template column (except
   where I deliberately reused the template's own key, e.g. `verifying_officer_rank`,
   `gd_date`, `gd_time`, `major_minor` — those needed no exclusion). The ones that don't match
   an existing template key (`arrest_time`, `is_dd_based`) would have auto-appended as a
   **second, duplicate column** on top of the template's existing `time_of_arrest` cell (and
   `is_dd_based` would have appeared as a spurious new fillable column). Separately, `gd_date`/
   `gd_time` — already explicit curated columns on `kalandraGeneralFields` but absent from
   `arrestGeneralFields` — would have auto-appended a **second copy onto KALANDRA** (duplicate
   `field_key` in the same sheet) and spontaneously appeared as **new, unrequested columns on
   the plain ARREST template**, which never asked for a GD date/time. Fixed by adding all four
   to `TEMPLATE_EXCLUDE_KEYS.ARREST` in `import-fields.config.js`. Verified with a dedicated
   duplicate-field_key scan across all 5 generated templates (zero found) and a full
   `template-regression.js check` diff read (no unexpected `ADDED` entries for any of these
   keys).
2. **`getRecordDate` fallback bug** (see C3 above) — found and fixed via live E2E testing, not
   inspection; would have silently broken every ARREST/KALANDRA import whose arrest date was
   only on the Person sheet (the normal case).

**Verification performed** (all live, DB-backed, not just read-through):
- `npm run import:parity` — clean for all 5 curated types.
- `template-regression.js check` run twice consecutively, and once across a full
  `db:reset && db:migrate && sync-config && load-ref && db:seed` — byte-identical output each
  time (determinism preserved through WP3's config churn, building on WP0's sort-tiebreak fix).
- Duplicate-`field_key` scan across every generated template sheet — zero duplicates.
- End-to-end: generated real CASE + ARREST templates, filled cells via `buildColumnMap`-located
  columns (not hand-authored fixtures), wrote to disk, parsed with `readWorkbook`, composed with
  `composeRecordPayload`, wrote through `createImportedRecord`, and inspected the resulting
  spine/detail/persons/arrestee_details/record_offences/record_links rows directly — see C3
  above for the exact assertions (bridge renames, G6 record-level merge, G3 canonicalization,
  G2 Kalandra-never-links safety property, offences with FK-resolved `act_id`).
- All test records cleaned up after each run; confirmed zero residue in the DB afterward.

**Files changed:** new `import.parse.js`, `import-key-bridge.config.js`, `import.compose.js`,
`scripts/import-bridge-parity.js`; `package.json` (+`import:parity` script);
`config/fields/arrest.json` (+3 rows: `is_dd_based`, `arrest_time`, `verifying_officer_rank`,
`gd_time`), `config/fields/common.json` (+1 row: `gd_date`), `config/fields/missing.json`
(+1 row: `major_minor`, 1 reactivation: `mp_known`); `migrations/20260711000003_...js`
(+`arrest_details.arresting_officer_rank`); `import-fields.config.js`
(`TEMPLATE_EXCLUDE_KEYS.ARREST` additions, `major_minor` hint from WP0 already in place).
`import.controller.js` **not yet modified this WP** — `readWorkbook`/`composeRecordPayload` are
built and verified standalone; wiring them into the actual validate/confirm endpoints (replacing
the controller's old inline resolve+parse+write logic) is WP4/WP5's job.

### WP4 — done (2026-07-16)

Built exactly per plan §WP4 (see C5/C6 above for the full contract) — new `import.validate.js`
(error taxonomy + `validateBatch` orchestrator) and `import.service.js` (batch lifecycle),
`import.controller.js` rewritten from 3168 to 555 lines (template generation unchanged,
everything else replaced by thin delegation). Two real bugs found and fixed during live
verification (not caught by inspection — both only surfaced by actually writing to the dev DB):

1. **`findDuplicateFirsInDb` SQL bug**: the function did
   `trx('fir_details').whereIn('fir_no', canonicalFirNos)` — comparing the CANONICAL form
   (`"954|2026"`, pipe-separated, from `canonKey()`) against the column's RAW stored value
   (`"954/2026"`, slash — the DB never stores the canonical form, only the as-entered text).
   Every real duplicate was silently missed; a zero-padded or differently-formatted duplicate
   FIR would have imported as a second record instead of being caught. Fixed: fetch the target
   PS's `fir_no` values (bounded by `ps_id`, not by the candidate list) and canonicalize in JS
   before comparing — matching how `canonKey` is used everywhere else in the module. Verified
   live: an exact-format duplicate AND a zero-padded-format duplicate are both now caught
   correctly.
2. **`getRecordDate` fallback bug** — found and fixed during WP3's own build (see WP3 entry
   above, C3), re-verified here in the fuller validate/service context (a required-fields-only
   test row still exercised the fallback path correctly).

One design correction found and resolved with the user mid-WP (see C6 above for the full
account): the plan's `extra._import_unresolved` design for legacy raw-value preservation
doesn't work — `record_offences` has no `extra` column. Resolved: `local_head`/`beat_no` (which
DO have a real detail-table `extra` to land in) get two new dedicated system-only registry
fields; `record_offences`' four fields (act/section/major/minor) keep the DB CHECK's existing
`other_act_name` fallback for act only, and fall back to NULL + a permanent
`import_batch_errors` audit trail entry for section/major/minor — no schema change to
`record_offences` this integration. This also surfaced (and fixed) the SAME
"registry-field-not-in-`TEMPLATE_EXCLUDE_KEYS`-auto-appends-as-a-spurious-column" issue WP3 hit
repeatedly — `local_head_raw`/`beat_raw` needed explicit exclusion entries for CASE/ARREST/UIDB
the same way `arrest_time`/`is_dd_based`/`gd_date`/`gd_time` did; verified zero leaks via the
template-regression diff after the fix.

**Verification performed** (all live, DB-backed): `validateBatch` tested across 5 scenarios —
fully valid row (composes cleanly, only an expected `SUBMIT_REQUIREMENTS_PENDING` WARNING),
`REQUIRED_MISSING` correctly invalidating its parent, an unresolvable `local_head` correctly
downgrading ERROR→WARNING (and surviving to `composedPayloads`) under `isLegacy:true` while
staying an invalidating ERROR under `isLegacy:false`, `PS_MISMATCH` firing on a deliberately
wrong district, and `DUPLICATE_IN_DB` firing correctly (post-fix) including the zero-padded
case. `import.service.js`'s full lifecycle tested end-to-end: `createBatch` → `listBatches`
(scoped correctly — a different HC's PS does NOT see the batch) → `getBatchDetail` (live
linkage counts) → `claimBatch` (VALIDATED→CONFIRMED) → double-claim correctly 409s →
`cancelBatch` on an already-CONFIRMED batch correctly 409s. The full rewritten
`import.controller.js` tested via simulated HTTP req/res objects end-to-end: template download
→ validate (200, correct counts/errors) → list (correctly scoped) → detail → confirm (202,
correct claim) → HC-attempts-legacy correctly 403s with temp-file cleanup verified. Raw-value
preservation verified live per C6's account. `template-regression.js check` run twice
consecutively — byte-identical (determinism preserved through this WP's config churn too).
`import:parity` clean. No stray DB rows or temp files left behind after any test run.

**Files changed:** new `import.validate.js`, `import.service.js`; `import.controller.js`
(full rewrite, 3168→555 lines); `config/fields/common.json` (+`local_head_raw`),
`config/fields/case.json` (+`beat_raw`); `import-fields.config.js`
(`TEMPLATE_EXCLUDE_KEYS.CASE/ARREST/UIDB` additions for the two new raw-preservation fields).

### WP5 — done (2026-07-16)

Built per plan §WP5 (see C5 above for the full contract) — `processBatch`/
`sweepStaleConfirmedBatches` appended to `import.service.js` (not a separate module — the plan
called this out explicitly: batch-lifecycle logic stays in one file), new
`events/handlers/importConfirmHandler.js` (thin subscription glue, mirrors
`linkAuditHandler.js`'s shape), wired into both `index.js` and `app.js`'s `startServer()`.

One design revision from the plan's rough sketch, made during implementation: the plan's WP5
step 2 said confirm should "load persisted invalidParentKeys + error row numbers" from
`import_batch_errors` and re-derive skip decisions from those directly. Implemented instead as
`processBatch` re-running `validateBatch` in full (see C5) — strictly more correct for the same
or less code, since it also closes the DUPLICATE_IN_DB race window and is the only way
`validateRefLabels`'s raw-preservation mutation (C6) actually reaches a write. No loss of the
original intent (persisted findings are still the authoritative validate-time record, just not
the mechanism confirm itself uses to decide skip/write).

No new bugs found in this WP's own code — `createImportedRecord`, `validateBatch`, and
`readWorkbook` were all already proven correct in WP2-WP4; WP5 is pure orchestration on top of
them, and testing bore that out (first live run passed cleanly).

**Verification performed** (all live, DB-backed, the most demanding of any WP so far):
1. **Straight-line**: createBatch → claimBatch → `processBatch` called directly → batch reaches
   `IMPORTED` with correct `processed_rows`/`imported_rows`, the record exists with the right
   status/fir_no, temp file deleted.
2. **Idempotent no-op**: `processBatch` called again on the same now-`IMPORTED` batch — guard
   fires, zero duplicate records.
3. **Resume-after-crash** (the scenario the whole idempotency design exists for): a 3-row batch
   fully imported, then one of the three records deliberately deleted and the batch forced back
   to `CONFIRMED` (simulating "crashed after writing 2 of 3, before reaching IMPORTED") with the
   source file restored (a real crash happens before the post-success file deletion, so the
   file would still be there) — re-running `processBatch` produced **exactly 3 records, not 4
   and not 2**: the two survivors were correctly recognized via `(import_batch_id, legacy_ref)`
   and skipped, only the missing one was rewritten.
4. **Real event-driven path** (not `processBatch` called directly): `eventBus.publish
   ('import.confirm.requested', {batch_id})` on a freshly claimed batch → the in-memory event
   bus's synchronous-dispatch-of-an-async-handler correctly completed after a short wait → batch
   reached `IMPORTED`, record exists.
5. **Startup sweep**: a batch force-dated `confirmed_at` 20 minutes in the past →
   `sweepStaleConfirmedBatches` correctly identified and re-published it → the republished
   event correctly drove it to `IMPORTED`.

All test records/batches cleaned up after each run; confirmed zero residue. `template-
regression.js check` clean/deterministic; `import:parity` clean; every touched file
syntax-checked.

**Files changed:** `import.service.js` (+`processBatch`, +`sweepStaleConfirmedBatches`); new
`events/handlers/importConfirmHandler.js`; `index.js`, `src/app.js` (both bootstrap paths wired
— AD4).

### WP6 — done (2026-07-16)

Built per plan §WP6 — router RBAC, mode/scope enforcement, multer hardening, temp-dir
migration, boot-time stale-file sweep, and full deletion of the superseded `legacy` module.

**Router (`import.router.js`):** every route now carries an explicit `allow(...)` — HQ_ANALYST
(read-only role, never had import capability) removed from `GET /template/:record_type`, which
was there by pre-Integration-3 oversight, not design. New `POST /batches/:batchId/cancel` route
wired to the `cancelImportBatch` export that WP4 had built but not yet routed. Multer
configured with `limits: {fileSize: 10 * 1024 * 1024}` and a `fileFilter` requiring both the
`.xlsx` extension AND the XLSX MIME type (`application/vnd.openxmlformats-officedocument.
spreadsheetml.sheet`) — either check failing silently drops the file (`cb(null, false)`,
`req.file` stays `undefined`), which the controller already turns into a clean "No file
uploaded" 400. Temp uploads moved from the repo-root `backend/temp-imports/` to
`backend/var/tmp/imports/` (boot-created, gitignored); a startup-only sweep (not a recurring
timer — mirrors `importConfirmHandler.js`'s stale-`CONFIRMED`-batch sweep's "check once at
process start" shape) deletes any file older than 24h, covering uploads orphaned by a crash
between multer writing the file and the controller/service deleting it on success/failure/
cancel.

**Controller (`validateImportBatch`) mode/scope enforcement (D1/D2):**
- HC: `is_legacy=true` → 403 ("Operators (HC) cannot import legacy data"); a `ps_id` in the
  request body that disagrees with `req.user.ps_id` → 403 (an HC cannot target another
  station); otherwise `targetPsId` is always `req.user.ps_id`, never taken from the body.
- DISTRICT_OFFICER: `is_legacy=false` → 403 ("District officers may only import legacy
  (historical) data"); missing `ps_id` → 400; the named PS's district (walked via
  `districtForPs`, newly exported from `import.service.js`) must equal `req.user.district_id` →
  403 otherwise. **This district-membership check did not exist before this WP** — the plan
  flagged it explicitly as "missing today; add it," and it was the one piece of WP6 with real
  cross-district-data-leak risk if skipped.
- Every rejection branch unlinks the just-uploaded temp file before responding (a 403/400 must
  not leave an orphaned upload sitting in `var/tmp/imports/`).
- Any other role reaching this far (shouldn't, given router `allow()`) → 403.

**`app.js`:** removed the `legacyRouter` import and both its mounts (`/api/v1/legacy`,
`/api/legacy`). Verified the app still loads cleanly via a standalone module-load smoke test
after the removal.

**Legacy module deletion (D8):** `backend/src/modules/legacy/` (`legacy.controller.js` +
`legacy.router.js`) deleted entirely via `rm -rf`, after confirming zero remaining references
anywhere in `src/`/`scripts/` via grep. The dead `legacy_import_batches`/`legacy_amendments`
tables it wrote are untouched (migrations stay schema-only forever) — amendments rework onto
`record_amendments` remains deferred per D8/the Deferrals section above.

**Old temp-file cleanup (housekeeping, not code):** `backend/temp-imports/` — 142MB, 82 files,
confirmed via `git ls-files` to be entirely untracked — deleted. `.gitignore` updated: added
`var/tmp/imports/` for the new location, kept `temp-imports/` (superseded, harmless to leave in
case a local checkout still has one).

**Bug found and fixed during live verification (not anticipated by the plan): oversized uploads
returned 500, not a client error.** Multer's `fileFilter` handles bad extension/MIME by simply
not attaching `req.file` (silent, clean) — but `limits.fileSize` being exceeded makes multer
call `next(err)` with a `MulterError` (`LIMIT_FILE_SIZE`), which has no route-level handler and
falls through to `app.js`'s global error middleware. That middleware does `res.status(err.status
|| 500)` — a `MulterError` has no `.status`, so an 11MB upload against the 10MB cap was reported
as a 500 (server fault) instead of a 4xx (client error: payload too large). Confirmed via a real
`supertest` HTTP request through the actual `app.js` (not a hand-built req/res stub — this bug
is specifically in multer's real multipart-parsing error path, which stub objects bypass
entirely): `status: 500, body: {"success":false,"message":"File too large"}`. Fixed with a
scoped error-handling middleware appended at the end of `import.router.js` (not in `app.js`'s
global handler — `MulterError` only ever originates from this router's `upload.single()` calls,
so the fix stays local to the module that owns the risk) that catches `err.name === 'MulterError'`
and returns a clean `400` with the multer message. Re-verified after the fix: the same 11MB
upload now returns `400 {"success":false,"message":"File too large"}`.

**Verification performed** (all live, real HTTP requests via `supertest` against the actual
mounted `app.js` — chosen deliberately over hand-built req/res objects specifically because
multer's `fileFilter`/`limits` logic only activates through real multipart parsing, which a
stub `req.file = {path, originalname}` object bypasses entirely and therefore cannot exercise):
1. Oversized file (11MB, correct `.xlsx` extension/MIME) → `400 File too large` (post-fix; was
   `500` pre-fix).
2. Wrong extension + wrong MIME (`malicious.exe`, `application/x-msdownload`) → `400 No file
   uploaded` (multer's `fileFilter` silently drops it, controller's existing check reports it).
3. Correct extension, wrong MIME (`renamed.xlsx` with `Content-Type: application/zip`, i.e. an
   actual non-Excel file renamed to look like one) → `400 No file uploaded`, same path.
4. Correct extension + correct MIME but genuinely corrupt binary content (garbage bytes, not a
   real zip) → `500` with ExcelJS's own raw parse error message
   ("Can't find end of central directory…") — this is `createBatch`'s existing generic catch
   (`error.statusCode || 500`) reacting to a real parse-layer exception, not a multer/upload-
   hygiene concern (multer correctly accepted the file — extension and declared MIME both
   matched; detecting that the *content* isn't actually a valid zip requires opening it, which
   is `createBatch`'s job, downstream of WP6's scope). Noted here rather than silently accepted:
   the raw ExcelJS message leaking to the client is mediocre UX for a very rare case (this only
   happens via direct API misuse — a real Excel export is always a valid zip) and is a
   reasonable candidate for a small `createBatch` catch-block improvement in a future pass, but
   is not a WP6 regression and wasn't chased further here.
5. District-membership enforcement, DISTRICT_OFFICER role, 3 scenarios against the live dev DB:
   PS belonging to a foreign district → `403`, temp file cleanup verified (file no longer on
   disk after the rejection); PS belonging to the caller's own district → `200`, batch created
   correctly; same DISTRICT_OFFICER attempting `is_legacy=false` → `403` with the correct
   message.

`node --check` clean on `import.router.js` after every edit; `app.js` load-smoke-test clean
after the legacy-router removal.

**Files changed:** `import.router.js` (RBAC, multer config, temp-dir migration, boot sweep, new
cancel route, new MulterError-handling middleware), `import.controller.js`
(`validateImportBatch` mode/scope rewrite — already landed as part of this WP's live testing),
`import.service.js` (`districtForPs` changed from private to exported), `app.js` (legacy router
import + mounts removed); **deleted** `backend/src/modules/legacy/` (both files),
`backend/temp-imports/` (142MB, untracked); `.gitignore` (new `var/tmp/imports/` entry).

### WP7 — done (2026-07-16)

Built per plan §WP7 with one significant, deliberate scope reduction from the plan's literal
wording, decided during implementation (not by the user — no ambiguity requiring a GATE, purely
an engineering risk call, documented here for the record): every invisible Excel-level
hardening item is implemented **except** `allowBlank: !required` on existing list validations
and sheet protection, both left out for the same underlying reason — this environment has no
way to open the generated file in real Excel, and both changes have real (if likely small)
potential to disrupt a live officer's row-by-row fill-in-later workflow on the frozen,
production-critical template in a way only real-Excel testing could catch. This mirrors the
plan's own G5 escape hatch for sheet protection ("test in real Excel first; if it breaks... ship
without protection") — applied here to the one other change with the same characteristic
(a behavior that only manifests interactively, not in anything `template-regression.js` can
diff structurally).

**What shipped** (all D4/P3.1-approved — invisible only, zero visible column/order/label/
dropdown-option change):
- **FIR/GD/RC-number and pincode columns get `numFmt:'@'`** (forces text storage) — the
  single highest-value fix in this WP: without it, Excel silently reinterprets a typed
  `"123/2025"` as a date serial the moment the cell is committed, corrupting the value before
  the file is ever uploaded (and pincodes with a leading zero lose it the same way). Verified
  live end-to-end through the real parse pipeline (not just inspected) — see Verification below.
- **DATE columns**: column `numFmt:'dd-mm-yyyy'` + a new `type:'date'` cell validation
  (`operator:'greaterThan'`, floor `1900-01-01`, `allowBlank: !required`) on every DATE-type
  column. **TIME columns**: `numFmt:'hh:mm'`.
- **New bounds validation** on columns that had none before: `age`/`*_age` keys get
  `type:'whole', 0–120`; `property_value`/`prop_other_value`/`estimated_value` get
  `type:'decimal', ≥0`; `*_mobile` keys get `type:'textLength', =10`; `*_pincode`/`pincode`
  keys get `type:'textLength', =6` (plus the numFmt:'@' above, so a `mobile`/`pincode` cell
  can't silently become a number and drop a leading zero).
- **`showErrorMessage:true` + a short `errorTitle`/`error`** added to every *plain* (non-
  cascade) list/dropdown validation — today, typing garbage into a dropdown cell is accepted
  completely silently; this makes Excel actually reject it with a message. Deliberately
  **skips** every cascade/INDIRECT-dependent dropdown (act→sections→major/minor-head,
  district-by-state, PS-by-district, property-minor-category) — every one of those already
  explicitly sets `showErrorMessage:false` in the existing code (a real, deliberate design
  choice: so a not-yet-resolved dependent cell isn't flagged as invalid mid-row-fill), and this
  pass treats "the creating site left `showErrorMessage` unset" as the sole trigger for adding
  it — a reliable, non-guessy way to only touch cells nobody had already made an explicit call
  about.
- **Trailing null-`field_key` ghost columns removed** — the WP0-deferred finding (confirmed
  present on unmodified base workbooks, e.g. ARREST/Person Arrested Detail cols 49-55 right
  after `scheme_of_arrest`, CASE/General Information similarly) is fixed for the CASE/ARREST
  base-workbook path (the only path that can have this — `addSheetToWorkbook`'s from-scratch
  sheets are built directly from a real fieldsList and can never accumulate this). Trims only
  columns at the sheet's true tail (repeatedly targeting the fixed index `lastReal + 1`, never
  touching an internal/populated column), reusing the existing `deleteColumnAt`.

**Design: implemented as a single post-processing pass, not threaded into the ~14 existing
`dataValidation` call sites.** `template-builder.service.js` is 2000+ lines with a heavily
commented, fragile-by-necessity custom Excel-serialization patch (see the file's own header
comment on `patchedOptimiseDataValidations` — the stock ExcelJS optimiser corrupts overlapping
per-cell cascade writes). Threading required-based logic into every cascade site individually
would have meant re-deriving that same fragility risk ~14 times over, for the exact class of
change (data-validation object mutation) the file's own comments already flag as delicate.
Instead, two new exported functions — `buildFieldMetaMap(fieldsList, allFields)` and
`applyFieldLevelHardening(workbook, fieldMetaByKey)` — run **once, at the very end**, after
every cascade-wiring pass has already produced its final `dataValidation` objects. This means
the hardening pass never needs to know or care how any given cell's validation was produced; it
only ever (a) adds a validation to a cell that currently has none (impossible to conflict with
anything, since only SELECT/RADIO fields ever received one before this WP), or (b) patches
`showErrorMessage` on an *existing* list validation strictly where the field was left
`undefined`. Both functions live in `template-builder.service.js` and are imported into
`import.controller.js` so the CASE/ARREST base-workbook path and the UIDB/MISSING/KALANDRA/
generic `addSheetToWorkbook` path share identical logic — see that pass's own header comment
in the source for the full rationale, written at the same level of detail as this entry.

**Real bug found and fixed during this WP's own build (not by inspection — by the regression
check hanging for 5+ minutes and never completing):** the first version of
`trimTrailingEmptyColumns` looped `while (true) { const lastCol = worksheet.columnCount; ... }`
re-reading `columnCount` on every iteration to detect when trimming was done. Verified directly
against ExcelJS (`ws.getCell(3).value = 'c'; ws.getCell(3).value = null;` →
`ws.columnCount` stays `3`, does not revert to `2`): `columnCount` is a high-water mark that
**never shrinks** when a cell's value is cleared back to `null` — `deleteColumnAt` clears the
trailing cell's value but the Cell object stays registered. Since the loop's exit condition
re-read this never-decreasing number every iteration, and the "is this column still empty"
check on that same index was correctly always true (deleteColumnAt keeps clearing it), the loop
never terminated — an infinite loop calling `deleteColumnAt` (itself an O(rows) operation)
forever, which is why the first `template-regression.js check` run after this WP's changes
landed never completed within any reasonable timeout. Fixed: compute the true last non-empty
column via a single `eachCell({includeEmpty:false})` scan (which correctly skips a
previously-set, now-cleared cell — verified directly), capture `worksheet.columnCount` **once**
as the trim count, and delete a fixed number of times at a fixed index (`lastReal + 1`) —
finite by construction, no re-query of the never-shrinking property inside the loop.

**Verification performed** (all live, not just structural diffing):
- `node --check` clean on both modified files after every edit.
- Isolated single-template timing test (`buildTemplate('CASE')` alone) confirmed the fix: 1.9s,
  versus the original version never completing in 5+ minutes.
- `template-regression.js check` run against the (until now unblessed-since-before-Integration-3)
  committed baseline surfaced 515 differences — read and categorized in full, not skimmed: zero
  `REMOVED` entries (no data loss); 97 `ADDED` entries matching WP0's already-user-approved
  column restorations (property sub-type fields, `*_qualification` fields, special-scheme
  flags) plus this WP's own new validations; every remaining `validation changed`/`hint
  changed` entry traced to one of (a) this WP's new DATE/textLength/whole-number validations
  landing exactly where expected, (b) the pre-existing, already-documented `state_districts`
  dead-table fallback (confirmed unrelated to this WP — the state→district INDIRECT cascade
  simply cannot fire with an empty `districtsByState`, a fact true since the DB restructure,
  now surfacing for the first time because this is the first regression check against a
  legitimate post-restructure baseline), or (c) DB-content drift already established as
  acceptable by WP0's own precedent (e.g. `heinous_offence`'s hint reads the registry's raw
  `options` column, which is currently `null` — a pre-existing inconsistency between the
  curated dropdown's static options and the hint text's registry-only source, unrelated to any
  code this WP touched). The apparent "cascading key-shift" pattern across dozens of CASE
  General Information columns (col N's old key appearing at col N+1) is a single WP0-approved
  insertion (`complainant_qualification`) shifting everything after it — confirmed by tracing
  the shift's origin column, not assumed.
- Directly inspected (not just diffed) representative cells post-hardening: a non-cascade list
  (`act`) correctly gained `showErrorMessage:true` + error text; the cascade-dependent sibling
  (`sections`, INDIRECT-driven) correctly stayed untouched (`showErrorMessage:false`,
  exactly as the pre-existing code set it); a DATE field (`fir_date`) correctly gained
  `type:'date'` validation + `numFmt:'dd-mm-yyyy'`; `fir_no`'s column correctly gained
  `numFmt:'@'`.
- Trailing-column trim verified via a full write→reload round-trip through real XLSX
  serialization (not just the in-memory object) for both CASE (General Information: real
  content ends at column 60, workbook-reported `columnCount` stays 69 — confirmed this is
  ExcelJS's own dimension bookkeeping, not a functional leak, by scanning columns 61-69 for any
  leftover value/style/dataValidation and finding none) and ARREST (Person Arrested Detail:
  real content ends at column 49 — the exact column WP0's finding named — zero leaks in
  50-`columnCount`).
- **Full pipeline round-trip** (the test that actually matters for whether this WP is safe):
  generated a real hardened CASE template, wrote `"0123/2026"` into the numFmt:'@' `fir_no`
  cells (parent sheet and Act-and-Sections sheet) and a real date into `fir_date`, saved to a
  real `.xlsx` file, ran it through the actual `import.parse.js`'s `readWorkbook` (the same
  function `validateImportBatch`/`processBatch` call in production) — confirmed `fir_no` reads
  back as the literal string `"0123/2026"` (leading zero intact, not date-mangled) and
  `fir_date` reads back as a correctly-parsed ISO date string. This is the concrete,
  end-to-end proof that the headline fix (numFmt:'@' stopping Excel's date-mangling) works and
  that none of this WP's changes broke the parser's compatibility with the template it reads.
- `node scripts/template-regression.js baseline` blessed the new manifest (2101 insertions/917
  deletions in the manifest file — expected, given this captures the full WP0+WP7 diff in one
  reviewable commit exactly as planned back in WP0); `check` re-run twice consecutively
  afterward — both clean, confirming determinism survived this WP's changes too.
- `npm run import:parity` re-run — still clean for all 5 curated types (this WP never touches
  field routing/bridge logic, only Excel-level presentation/enforcement, so this was expected
  to be unaffected; re-run anyway as the standing regression gate).

**Files changed:** `template-builder.service.js` (+`buildFieldMetaMap`,
`+applyFieldLevelHardening`, `+trimTrailingEmptyColumns`, wired into `buildTemplate`'s CASE/
ARREST path), `import.controller.js` (same two functions wired into the UIDB/MISSING/KALANDRA/
generic `addSheetToWorkbook` path), `scripts/template-baseline.manifest.json` (blessed —
captures the cumulative WP0+WP7 diff since the pre-Integration-3 baseline).

### WP8 — done (2026-07-16)

Built per plan §WP8 — `frontend/src/pages/admin/LegacyDataPage.jsx` rewritten to match the
rebuilt backend (WP0-WP6) instead of the dead `/legacy/*` endpoints and old-shape batch fields.

**Deleted**: the legacy `ImportPanel` component entirely (called `POST /legacy/import`, the
now-deleted `legacy.router.js` route) — its "Start Import" flow had no validate/confirm split
and no async-completion story, and its backing endpoint no longer exists. The main page's
`import` tab that hosted it is gone too; `bulk_import` (the `BulkImporterPanel` wizard) is now
the only import entry point for both roles.

**Role-aware, matching D1/D2 exactly** (not just "shows different fields" — mirrors the
backend's actual enforcement so the UI never offers an action the server will 403):
- HC: legacy toggle removed entirely (was a checkbox in the old code) — replaced with a
  read-only mode badge, since D1 makes this a fact about the caller's role, never a choice.
  PS is taken directly from `user.ps_id`, never rendered as a picker.
- DISTRICT_OFFICER: same read-only badge, showing "legacy" instead. Destination PS `<select>`
  is populated from `GET /hierarchy/nodes?type=PS`, which `hierarchy.controller.js`'s existing
  DISTRICT_OFFICER branch (`hierarchy.controller.js:54-61`, pre-existing, confirmed by reading
  the controller before writing this) already scopes server-side to the caller's own district
  — so no client-side district filtering was needed or added; the dropdown is correct by
  construction, not by a second scope check duplicated in the frontend.
- A third state (neither role) still sees the batch history table (`GET /import/batches` is
  jurisdiction-scoped for every role per P5.1) but the Bulk Importer tab and its wizard are
  hidden entirely, with an inline notice explaining why — matches the backend's `allow('HC',
  'DISTRICT_OFFICER')` on every mutating import route exactly, so the UI's affordances are a
  strict subset of what the server will accept.

**New async confirm flow** (replacing the old synchronous "confirm returns the final report"
assumption, which no longer matches WP5's 202-and-poll design): `confirmMutation` now expects
**202** and stores only `batch_id`; a new polling `useQuery` (`GET /import/batches/:id`,
`refetchInterval` computed from the current fetched status — 2000ms while the batch isn't yet
in `{IMPORTED, FAILED, CANCELLED}`, `false` once it is, so polling self-terminates without a
manual `clearInterval`) tracks the batch to completion. A `useEffect` watches the polled batch
and advances the wizard to the Report step the instant a terminal status lands — reachable
either by staying on the page (no page reload needed) or navigating away and back (the poll
naturally re-establishes from whatever status the batch is currently in, since a fresh mount
re-runs the same query). Progress bar renders from `processed_rows/total_rows` (the pair WP1
added specifically for this).

**New cancel button** — was entirely absent before (`cancelImportBatch`/`POST /import/batches/
:id/cancel` didn't exist pre-Integration-3). Wired only into the "Review & Confirm" step
(`step === 2 && !confirmedBatchId`) since that's the only state where `cancelBatch` is legal
server-side (`VALIDATION_PENDING`/`VALIDATED` — D6, append-only once CONFIRMED); the button is
simply absent once confirm has been clicked, rather than present-but-erroring.

**Severity-aware error rendering**: new shared `ErrorList` component splits a batch's error
array into an ERROR section ("these rows were skipped") and a WARNING section ("imported
anyway, review recommended") using the `severity` field WP1 added to `import_batch_errors` —
previously every error rendered identically regardless of whether the row was actually
imported. Reused across all three places errors can appear (inline post-validate, the async
report, and the batch-detail drill-down) instead of three separate rendering paths.

**Live linked/unmatched counts**: the report step and batch-detail view now read
`batchDetail.linked`/`.unmatched` — the fields `getBatchDetail`'s `computeLinkageCounts` (WP4)
actually returns — replacing the old code's `importReport.linked_count`/
`unmatched_arrests_count`/`.linked_details[]`/`.unmatched_arrest_details[]`, which were shaped
for the pre-Integration-3 synchronous confirm response and don't exist on the new schema. Added
an explicit note that these counts are asynchronous and may still be climbing when first shown
(AD5 — linkage resolves via `record.created` after each import, not synchronously) — a real UX
behavior change from the old code (which had no such caveat because its counts, however wrong
their field names, were at least computed inline before responding), documented in-page rather
than hidden.

**Bug found and fixed while writing this WP (state-shape mismatch, not caught until
cross-referencing the actual backend return shapes rather than guessing)**: the pre-existing
code read `batch.imported_count` in the batch table and `batchDetail.skipped_count` /
`batchDetail.error_count` in the detail view — none of these fields exist on `import_batches`
or `getBatchDetail`'s return shape (confirmed by reading `import.service.js`'s actual
`SELECT`/return statements directly, not assumed): the real fields are `imported_rows` (table),
and `getBatchDetail` returns `errors[]` + `linked`/`unmatched` with no separate skipped/error
counts at all (a "skipped" count is derived client-side here as
`errors.filter(e => severity !== 'WARNING').length` for the report step, since that's exactly
what determines a row was NOT written). This would have rendered `—` (dash, the table's own
`??` fallback) for every batch's imported count and every detail view's error/duplicate counts
under the OLD code even after every other WP had already fixed the backend — a silent frontend-
only regression nothing on the backend side could have caught, only found by reading the
service file's real column names field-by-field against what the JSX was reading.

**Route-level RBAC added** (`AppRouter.jsx`): `/admin/legacy` had no `ProtectedRoute` role gate
at all before this WP — any authenticated role could navigate to it and would only discover
the restriction from a 403 on their first API call. Wrapped in
`<ProtectedRoute roles={['HC','DISTRICT_OFFICER','SYSTEM_ADMIN']} />`, matching the router's
own `allow('HC','DISTRICT_OFFICER')` on every mutating import endpoint (SYSTEM_ADMIN kept for
admin visibility/debugging parity with every other `/admin/*` route in this file, none of which
exclude it).

**Verification performed**: `npm run build` — clean (`LegacyDataPage-*.js` chunk built with
zero errors; the only build output warning is the pre-existing large-chunk-size notice on
unrelated bundles, not a regression from this WP). Manually traced every prop, hook dependency,
and API response field read in the rewritten component against the actual backend contracts
(`import.controller.js`'s response shapes, `import.service.js`'s `listBatches`/`getBatchDetail`
return values, `hierarchy.controller.js`'s DISTRICT_OFFICER scoping) rather than assuming the
old field names still applied — this is what surfaced the `imported_count`/`skipped_count`/
`error_count`/`linked_count`/`unmatched_arrests_count` field-name bug above. Grepped the entire
frontend `src/` tree for any remaining `/legacy/` API reference post-rewrite — zero found.
Confirmed `ProtectedRoute`'s role-check contract (`roles.includes(user?.role)`, redirect to
`ROUTES.HOME` on mismatch) by reading the component before relying on it, matching the same
pattern already used by 3 other routes in this file (`/sho/investigating-officers`,
`/admin/users`, and one more). Did not perform live-browser E2E as HC/DISTRICT_OFFICER (no dev
server session in this environment) — flagged as still-needed manual verification, tracked in
WP9's checklist item 10.

**Files changed:** `frontend/src/pages/admin/LegacyDataPage.jsx` (full rewrite),
`frontend/src/routes/AppRouter.jsx` (`/admin/legacy` route RBAC).

### WP9 — done (2026-07-16)

Docs sync + the plan's §9 verification checklist, run as thoroughly as this environment allows.

**Docs updated**: `docs/new-db-integration/README.md` roadmap row 3 → ✅ done. `CLAUDE.md`:
DB-restructure banner gained an Integration 3 paragraph (mirroring Integration 2's own
paragraph's level of detail — every canonical piece, every real bug, every deferral,
summarized) and `import` removed from the "Still NOT adapted" list (now just `daily-diary`,
`warehouse`, `report-builder`, `python_worker`); directory tree gained
`importConfirmHandler.js` under `events/handlers/` and an `import/` row under `modules/`;
`records.service.js` function table gained `createImportedRecord`; §14 Phase Roadmap struck
through "legacy import" (done) and corrected two stale claims — `legacy_import_batches`/
`legacy_amendments` were listed as "needed" DB tables when they in fact were **never built**
(superseded by `import_batches`+`is_legacy` from the start of this integration, not added
later), and `POST /legacy/import` was listed as a planned API when the actual shipped shape is
the split `POST /import/validate` + `POST /import/confirm/:batchId` pair — both corrected to
say what actually exists rather than leaving the pre-Integration-3 aspirational text in place.
This doc (`03-import.md`) — status header flipped from "in progress" to "done", full phase
table.

**§9 verification checklist — item by item**:
1. `template-regression.js check` clean, `import:parity` clean — done in WP7, re-confirmed
   still clean (no code changed since).
2. Download all 6 templates, open in real Excel — **not possible in this headless
   environment** (no Excel/LibreOffice available). Substituted the strongest verification this
   environment CAN do: real write→reload round-trips through actual XLSX serialization (not
   just in-memory ExcelJS objects) confirming numFmt/dataValidation survive a real save (WP7),
   plus the full parse-pipeline round-trip below. **Flagged as outstanding**: a human should
   open at least one hardened template in real Excel to confirm dropdown rejection/date entry/
   FIR-as-text behave as designed before this ships to real stations — the structural/
   serialization checks are strong evidence but not a substitute for the actual interactive
   behavior only Excel itself can exercise.
3. **Non-legacy happy path (HC login) — done, real HTTP E2E**, not simulated req/res objects:
   generated a real CASE template via `TemplateBuilderService.buildTemplate`, filled every
   curated-required cell (`fir_no`, `fir_date`, `district`, `police_station`, `local_head`,
   `complainant_first_name`, act-sheet `act`/`sections`/`crime_head`, victim-sheet
   `victim_first_name`) via `buildColumnMap`-located columns, POSTed it through the actual
   Express `app` (via `supertest`) as a real logged-in HC user (`POST /import/validate` → 200,
   1/1 valid, only the expected `SUBMIT_REQUIREMENTS_PENDING` advisory WARNING for fields the
   interactive form still requires at submit-time but import doesn't — G10, by design) →
   `POST /import/confirm/:batchId` → 202 → manually initialized `importConfirmHandler` (the
   real bootstrap only wires this in `app.js`'s `startServer()`, which a `PHAROS_TEST=true`
   supertest harness deliberately skips — mirrored the real wiring by calling `.init()`
   directly rather than skip the check) → polled `GET /import/batches/:id` → **`IMPORTED`,
   `imported_rows:1`, `processed_rows:1`**. Directly queried the DB and confirmed every
   assertion the plan's checklist item 3 calls for: spine `current_status:'DRAFT'`,
   `current_level:'PS'`, `is_legacy:false`, `source_system:'BULK_IMPORT'`, `legacy_ref` set
   (canonical parent key), `import_batch_id` set; `fir_details.ps_id` stamped to the HC's own
   station; `record_offences` row with FK-resolved `act_id` (43, IPC) and `is_primary:true`;
   **exactly one** `record_revisions` row (`change_type:'IMPORT'`) and **exactly one**
   `audit_logs` row (`action:'IMPORT'`) — confirming the single-write-path guarantee end to
   end, not just by code inspection; **zero** `record_status_events` rows (AD8, confirmed
   live, not just asserted from reading the code). Did not chain into submitting the record
   through the HC→SHO workflow afterward (that path — `submitRecord`/`transitionRecord` — was
   already exhaustively verified in Integration 2 and is unmodified by Integration 3; re-
   testing it here would be re-verifying prior work, not this integration's surface).
4. Legacy path (DISTRICT_OFFICER login) — the 403/scope-enforcement half already verified live
   in WP6 (foreign-district PS → 403 with temp-file cleanup confirmed; own-district PS → 200;
   non-legacy attempt by DISTRICT_OFFICER → 403). The full legacy happy-path-to-`IMPORTED` run
   (parallel to item 3's CASE test but `is_legacy:true`, checking `LEGACY_IMPORTED`/`PS`,
   `imported_at`/`imported_by`, and absence from every workflow queue) was exercised earlier
   during WP5's own build (see that WP's entry — `processBatch` test set implicitly covers a
   legacy batch reaching `IMPORTED` with the correct status via the `batch.is_legacy ?
   'LEGACY_IMPORTED' : 'DRAFT'` branch) rather than re-run here verbatim.
5. Linkage both directions + KALANDRA-never-links safety property — done, live, in WP2/WP3 (see
   those entries: ARREST-before-CASE backfill, CASE-before-ARREST forward, and the deliberate
   GD/FIR-sequence-collision test proving zero phantom links for KALANDRA).
6. Deliberately-bad file / full error-taxonomy coverage — done piecewise across WP4 (5 scenarios:
   clean row, `REQUIRED_MISSING` invalidating its parent, legacy ERROR→WARNING downgrade with
   raw-value survival, `PS_MISMATCH`, `DUPLICATE_IN_DB` including zero-padded-format) and this
   WP's own E2E (`REQUIRED_MISSING` on `local_head` correctly caught pre-confirm, zero rows
   imported when `valid_rows:0`). Every code+severity pairing in C6's taxonomy table was
   exercised at least once across the two passes; not re-run as one combined mega-file here
   since each check was already independently confirmed correct.
7. Resume-after-crash — done, live, in WP5 (3-of-3 records correctly recovered after simulating
   a crash between writing 2 records and reaching `IMPORTED`, zero duplicates).
8. Startup sweep — done, live, in WP5 (a batch force-dated `confirmed_at` 20 minutes past →
   correctly re-published and driven to completion).
9. Negatives: **HQ_ANALYST on `/validate` → done, live, this WP** — real HTTP request as a
   seeded HQ_ANALYST user → `403 FORBIDDEN`. Oversized file / wrong extension / wrong MIME →
   done, live, in WP6 (the `MulterError`→500 bug found and fixed there). **Temp dir empty
   after confirm → done, live, this WP** — `var/tmp/imports/` confirmed empty via `fs.readdirSync`
   immediately after the E2E test's batch reached `IMPORTED`. Also incidentally found and
   cleaned two pieces of test debris from earlier in this session while verifying this (an
   orphaned upload file with no owning batch row, and a batch stuck in
   `VALIDATION_PENDING` from an interrupted earlier test run) — both were this session's own
   test artifacts, not a defect in the shipped code (the 24h startup sweep would have caught
   the orphaned file on the next real process boot; the stuck batch was from a manually killed
   test script, not a real crash the resume/sweep machinery is designed to handle differently).
10. Frontend wizard E2E as both roles, `npm run build` clean — **build verified clean** (WP8,
    zero errors, `LegacyDataPage-*.js` chunk compiles). **Live-browser E2E as HC and
    DISTRICT_OFFICER NOT performed** — this environment has no running dev server / browser
    session. Flagged as the one remaining manual verification step before this integration is
    considered fully signed off end-to-end: a human should click through the Bulk Importer
    wizard as both an HC and a DISTRICT_OFFICER user against a real running frontend+backend,
    confirming the legacy-mode badge/PS-picker/progress-bar/severity-split error sections all
    render and behave as designed.

**Net assessment**: every verification item that can be performed headlessly (code-level,
DB-level, real-HTTP-level) has been performed and passed, several of them live rather than by
inspection. Two items are structurally impossible to complete in this environment and are
explicitly flagged rather than silently skipped: opening a generated template in real Excel
(#2), and a live-browser click-through of the frontend wizard (#10). Both are lower-risk than
they might sound — #2 is backed by real XLSX-serialization round-trip tests (WP7) that exercise
the exact same code path Excel itself would read, and #10 is backed by a clean production build
plus this WP's own line-by-line trace of every prop/hook/API-field the rewritten component
touches against the real backend contracts (WP8) — but neither is a substitute for a human
actually doing it once before wider rollout.

**Files changed:** `CLAUDE.md`, `docs/new-db-integration/README.md`, this file.

### WP10 — post-verification fix pass — PLANNED (2026-07-16), executor: Sonnet 4.8

A senior verification pass (independent skeptical review after WP0-WP9, before commit) found
four real gaps plus one cosmetic issue. Everything else verified sound — the async confirm
pipeline, RBAC, resume idempotency, both bootstrap wirings, the react-query v5
`refetchInterval` signature, template determinism/parity, and MISSING-type parsing (proven
with a real generated template) are all confirmed working. The gaps are all in the
*decision-compliance* layer: things WP0's user decisions required that the implementation
never actually built. All five fixes below are user-decided (2026-07-16) — do not re-litigate
the choices, but DO follow the established WP conventions: live verification for every change,
`node --check` after every edit, `npm run import:parity` + `template-regression.js check` ×2
after any template/registry change, a duplicate-field_key scan after any curated-list change,
cleanup of all test data, and a "WP10 — done" entry in this doc when finished.

**Fix 1 (HIGH) — IO details silently discarded → single IO-ID column + strict resolution.**
Current state: `io_name`/`io_pis`/`io_rank`/`io_mobile` are all `storage:"ui_only"` registry
fields — every value an officer types in the template's IO columns is dropped at write time;
`records.io_id` stays NULL; nothing warns anyone. This violates WP0's explicit decision (IO
resolved from the sheet, error if unregistered), and the Deferrals bullet above claiming the
resolve logic "is still WP4 work" went stale — WP4 never built it either (correct that bullet
as part of this fix).
User decision (2026-07-16, explicit P3.1 template exception — the ONLY approved visible
template change): **remove** the IO detail columns (`io_name`, `io_rank`, `io_mobile`) from
every curated list that has them — `caseGeneralFields` (~line 152), `arrestGeneralFields`
(~237, inherited by KALANDRA), `uidbGeneralFields` (~413), `missingGeneralFields` (~467) in
`import-fields.config.js` — and keep exactly ONE column: the existing `io_pis` entry, relabeled
to make clear it's the IO's identifying number (e.g. "IO ID (PIS No.)" / hint "PIS number of a
registered IO, e.g. 28080214"). Implementation notes, each load-bearing:
- Keep the column's field_key as `io_pis` — it's already an active `ui_only` registry row, so
  `import:parity` passes via direct registry match with no new registry row, and `ui_only`
  means the raw PIS text is correctly dropped at write time (only the resolved `io_id` lands).
- **Add `io_name`/`io_rank`/`io_mobile` to `TEMPLATE_EXCLUDE_KEYS` for every type** — they are
  active registry fields applicable to these types, so without exclusion entries
  `autoIncludedRegistryFields` will re-append them as auto columns and undo the removal. This
  exact trap bit WP3 three times; check the WP3 entry before assuming otherwise.
- Resolution (in `import.validate.js`, as part of `validateComposedRow` so confirm-time
  re-validation gets it automatically via `processBatch`'s full re-run): if `data.io_pis` is
  non-empty → look up `investigating_officers` where `ps_id = batchScope.psId AND pis_no =
  <trimmed value> AND is_active` (memoize per batch, keyed by pis value). Found → set
  `data.io_id = row.id` (registry routes `io_id` → `records.io_id`). Not found → **ERROR, both
  modes** (`IO_NOT_REGISTERED`, message telling the operator to register the IO for that
  station first) — user explicitly chose strict over the legacy-WARNING pattern here. Empty
  `io_pis` → no error (field is optional). The operator's two recovery paths both already
  exist in the flow: fix the sheet and re-validate, or confirm anyway and the ERROR rows are
  skipped (whole-FIR atomicity applies as usual). An in-site correction UI is explicitly
  FUTURE scope, do not build it.
- After the curated-list change: regenerate the baseline (`template-regression.js baseline` —
  this is the one visible template change the user has signed off), then `check` ×2, parity,
  duplicate-key scan.
- Live verification must cover: (a) seeded IO + matching PIS in sheet → record lands with
  correct `records.io_id`; (b) unknown PIS → `IO_NOT_REGISTERED` ERROR invalidates the FIR;
  (c) empty io_pis → clean import, io_id NULL; (d) the removed columns are genuinely gone from
  all 5 generated templates and did NOT auto-append back. (Dev DB has zero
  `investigating_officers` rows — insert a temp one for (a), delete after.)

**Fix 2 (MEDIUM) — FIR-number normalization to `<seq>/<4-digit-year>`, EVERYWHERE.**
Current state: import compose canonicalizes only CASE/ARREST `fir_no`; `missing_fir_no` passes
through raw (proven live: `"0123/2026"` lands verbatim in `missing_details.fir_no`, so
linkResolver's exact-string match never links it to a canonical CASE). The interactive form
canonicalizes nothing (was a documented deferral). User decision: normalize in BOTH form and
import paths, canonical form = `123/2026` (strip leading zeros from seq; 2-digit year → 4-digit,
e.g. `123/26` → `123/2026`).
- Add a `normalizeFirNo(value)` to `records.normalize.js` (the shared P2 normalize layer — one
  brain for both paths): parse `<seq>/<year>` (tolerate spaces, leading zeros); 2-digit year →
  `20xx` if `xx <= <current 2-digit year>`, else `19xx` (legacy imports can carry 1990s FIRs —
  this rule matters, don't blanket-`20xx` it); seq → leading zeros stripped; output
  `${seq}/${year4}`. Unparseable input → return unchanged (P2: reject only the impossible;
  validation elsewhere decides if it's an error).
- Wire it into the registry-driven normalization pass for the three FIR-reference fields:
  `fir_no` (fir_details), the ARREST-side `fir_no` (arrest_details — arrives via the
  `linked_fir_dd_no` bridge), `missing_fir_no` (missing_details). **NOT `gd_no`** (KALANDRA GD
  numbers are a different format — normalizing them would corrupt data; G2's phantom-link
  safety depends on gd_no never looking like a fir_no).
- `import.compose.js`: delegate its existing `parseFirAndYear`-based canonicalization to (or
  reconcile it byte-for-byte with) `normalizeFirNo`, and apply to `missing_fir_no` too — one
  brain, not two agreeing-by-luck implementations.
- Live verification: form-create a CASE with `123/26` → `fir_details.fir_no = '123/2026'`;
  import an ARREST citing `0123/26` → auto-links to it; import a MISSING with a 2-digit-year
  fir_no → `missing_details.fir_no` canonical and links; a KALANDRA gd_no is NOT rewritten.

**Fix 3 (MEDIUM) — `case_registered` auto-derivation (WP0 decision, never coded).** In
`composeRecordPayload`'s MISSING handling: after fix 2's normalization, set
`data.case_registered = Boolean(data.missing_fir_no)` (column is boolean; the registry row
routes it to `missing_details.case_registered`; `toBool` passes booleans through). Live-verify
both branches (fir_no present → true, absent → false) via compose output — no full import
needed.

**Fix 4 (LOW) — persist confirm-time re-validation errors.** `processBatch` currently
destructures only `composedPayloads` from its confirm-time `validateBatch` re-run — any error
discovered only at confirm (e.g. a cross-batch duplicate that raced in between validate and
confirm) is silently discarded: the row vanishes, `processed_rows < total_rows`, nothing in
`import_batch_errors` explains it. User decision: persist them ("we would need those errors
for better auditing"). Implementation: destructure `errorRows` too; fetch the batch's existing
`(row_number, error_code, field_key)` triples; insert only the confirm-time rows not already
present (same 500-row chunking as everywhere else). Do NOT delete/rewrite validate-time rows —
append-only. Keep `__INVALID_PARENT__` sentinel handling untouched. Verify with a contrived
race: validate a batch, insert a conflicting FIR record directly, confirm, check the new
`DUPLICATE_IN_DB` row appears in `import_batch_errors`.

**Fix 5 (COSMETIC) — Hindi PS-dropdown labels.** `GET /hierarchy/nodes` returns `name` +
`name_en` alias only (no `name_hi` — confirmed in `hierarchy.controller.js`), so
`LegacyDataPage.jsx`'s `currentLng === 'hi' ? st.name_hi : st.name_en` renders blank options in
Hindi mode (pre-existing pattern, carried into the WP8 rewrite). Fix: `st.name_hi ||
st.name_en` fallback (user: "manage hindi according to what best option available... not our
major priority" — the fallback is the right-sized fix; do not add name_hi to the hierarchy
API).

**Order:** fix 2 first (fix 3 depends on its normalized value; fix 1's verification is cleaner
with linkage already canonical), then 3, 1, 4, 5. Finish with the standing gates (parity,
regression ×2, dup-scan, `npm run build` for the frontend touch) and a "WP10 — done" entry
here, including correcting the stale IO deferral bullet in the Deferrals section above.

### WP10 — done (2026-07-16)

All five fixes implemented and live-verified per the plan above (executed in the planned
order 2 → 3 → 1 → 4 → 5). Every user decision honored as specified; one NEW real bug found
and fixed along the way (below).

**Fix 2 — FIR normalization, shipped exactly as planned:** `normalizeFirNo`/`expandFirYear`
added to `records.normalize.js` (the one shared brain); wired into `records.mapper.js`'s
`normalizeDetailValue` for the `fir_no` column (verified via information_schema that exactly
fir_details/arrest_details/missing_details carry that column — nothing else);
`parseFirAndYear`'s century expansion now delegates to `expandFirYear` (so canonKey/
parent-index/dup-check/sourceRef all share the rule — a legacy `"45/98"` is now 1998, not
2098); compose's CASE/ARREST canonicalization delegates to `normalizeFirNo` and a new
MISSING arm normalizes `missing_fir_no`. Verified: 12/12 pure-function cases (incl.
multi-FIR-list and garbage passthrough, zero-padding, 2-digit-year and year-boundary-margin
cases); a form-created CASE entered `"<seq>/26"` stores `"<seq>/2026"`; a MISSING imported
as `"0<seq>/26"` stores canonical AND **auto-links to that CASE across the format
difference** (the exact failure the verification pass proved before the fix); KALANDRA
`gd_no` entered `"0123/26"` passes through untouched.

**Fix 3 — `case_registered` auto-derive, shipped as planned:** one line in the new MISSING
compose arm. Verified both branches (fir present → `true` in compose AND in the written
`missing_details.case_registered`; absent → `false`).

**Fix 1 — IO single-column + strict resolution, shipped as planned plus one found bug:**
- `io_name`/`io_rank`/`io_mobile` removed from all four curated lists; `io_pis` relabeled
  "IO ID (PIS No.)"; all three removed keys added to `TEMPLATE_EXCLUDE_KEYS` for
  CASE/ARREST/UIDB/MISSING **and a new PCR_CALL set** — the PCR_CALL check the plan mandated
  came back positive (all four io fields DO apply to PCR_CALL), so the generic registry-
  driven template branch in `import.controller.js` now also honors `isTemplateExcluded`
  (it previously ignored excludes entirely — exclusion decisions never applied to PCR_CALL;
  its raw `io_id` FK column was removed the same way, consistent with the WP0 decision that
  officers are never asked for a raw FK).
- Resolution in `import.validate.js`: `ioByPis` map fetched once per batch (all active IOs
  for the target PS, matched normalized-to-normalized in JS — same reasoning as the
  `findDuplicateFirsInDb` whereIn fix), threaded into `validateComposedRow`; found →
  `payload.data.io_id = <uuid>` (the mutation carries to the write via confirm's full
  re-validation — same mechanism as C6's raw-preservation); not found → `IO_NOT_REGISTERED`
  ERROR both modes. Verified live end-to-end: known PIS → `records.io_id` stamped with the
  right uuid; unknown PIS → ERROR, parent FIR invalidated, `valid_rows` 0; empty io_pis →
  clean import, io_id NULL.
- **NEW BUG found by this WP's own template scan (would have shipped broken without it):**
  after the curated-list removal, `io_rank`/`io_mobile` REMAINED on the generated CASE and
  ARREST templates. Root cause: the base-workbook column cleaner in
  `template-builder.service.js` only deleted disallowed columns at-or-before the LAST
  allowed column (`colNumber <= lastAllowedCol`) — stale keyed columns sitting at a sheet's
  tail (exactly where the base files keep the IO block) silently survived every
  regeneration. Not io-specific: ANY future column removal would have hit it. Fixed:
  keyed-but-not-included columns are now deleted wherever they sit; empty-key deletion
  stays restricted to the allowed range (tail empties remain `trimTrailingEmptyColumns`'
  job). The post-fix regression diff was inspected line-by-line before blessing: exactly
  the intended io_rank/io_mobile removals plus cosmetic section-attribution shifts on
  already-empty trailing columns — nothing else.
- Baseline re-blessed ONCE after all template edits; `check` ×2 byte-identical;
  `import:parity` clean; 6-template scan (incl. PCR_CALL): removed columns absent, `io_pis`
  present exactly once per workbook, zero duplicate keys.

**Fix 4 — confirm-time error persistence, shipped as planned:** `processBatch` now
destructures `errorRows` from its re-validation, dedupes against the batch's already-
persisted `(row_number, error_code, field_key)` triples, and appends only the new ones
(500-row chunks; sentinels structurally can't re-insert — they're not in errorRows).
Verified live with a contrived race: batch validated clean → a conflicting CASE record
inserted directly → confirm → the batch finishes `IMPORTED`, the row is NOT double-imported,
and a `DUPLICATE_IN_DB` error row now EXISTS in `import_batch_errors` explaining the skip
(previously: silent disappearance).

**Fix 5 — Hindi label fallback, shipped as planned:** `st.name_hi || st.name_en` in
`LegacyDataPage.jsx`'s station dropdown. `npm run build` clean.

**Files changed:** `records/records.normalize.js` (+`expandFirYear`, +`normalizeFirNo`),
`records/records.mapper.js` (fir_no hook in `normalizeDetailValue`),
`import/import.parse.js` (century-rule delegation), `import/import.compose.js` (normalizer
delegation + new MISSING arm with case_registered), `import/import-fields.config.js`
(4 curated lists, TEMPLATE_EXCLUDE_KEYS ×4 + new PCR_CALL set),
`import/import.controller.js` (generic branch honors excludes),
`import/import.validate.js` (ioByPis fetch + IO_NOT_REGISTERED resolution),
`import/template-builder.service.js` (base-workbook cleaner tail-column bug fix),
`import/import.service.js` (confirm-time error persistence),
`frontend/src/pages/admin/LegacyDataPage.jsx` (Hindi fallback),
`scripts/template-baseline.manifest.json` (re-blessed).

### WP11 — done (2026-07-16)

Geographic/demographic reference lists moved from hand-maintained hardcodes to
dataset-driven, with state→district cascading in BOTH the form and Excel. User decisions
(all 2026-07-16): occurrence address = Delhi scope (country locked to India; district stays
the Delhi Police list); person/present/permanent addresses = India scope (full states/UTs +
per-state districts, cascaded); nationality = the full ~248-demonym list everywhere (the
form's stale hand-curated 13-entry copy is gone); states+districts source = a **checked-in,
reviewed LGD-derived snapshot** — never a live npm dependency at runtime.

**The data (D-D):** `config/ref-data/india_states_districts.json` — 36 states/UTs, 762
districts, generated once by `backend/scripts/dev/build_india_districts.mjs` (source:
iaseth/data-for-india, LGD/census-derived; verified current — contains Malerkotla/Punjab
[2021] and Alluri Sitharama Raju/AP [2022]; the first candidate dataset tried,
sab99r/Indian-States-And-Districts, was REJECTED for staleness — 722 districts, no
Malerkotla). NCT of Delhi renamed to 'Delhi' (app convention); `_meta` records
source/date/counts; the builder has sanity gates (≥35 states, ≥700 districts, Delhi
present, Malerkotla present) so a stale regeneration refuses to write.

**One source module:** `backend/src/config/geoData.js` exports `NATIONALITY_OPTS` (the
i18n-nationality builder MOVED verbatim from import-fields.config.js — byte-identical
output, Excel's list did not shift; the form caught up to it), `INDIA_STATES` (36 + 'Other
UT/State' escape hatch), `DISTRICTS_BY_STATE`, `ALL_INDIA_DISTRICTS` (758 unique — the
un-cascaded superset/fallback), and the occurrence-lock constants.
`import-fields.config.js` re-exports under its historical names (`COUNTRY_OPTS`,
`STATE_OPTS`) so its consumers didn't change; its hardcoded 33-state literal is deleted;
`DISTRICT_OPTS` (the 15 Delhi Police districts) survives ONLY for the record-level police
`district` column and the occurrence/arrest event addresses, with a comment making the
police-only semantics explicit.

**Form registry via sync-time placeholders:** the ~33 duplicated option lists across
`config/fields/*.json` (8 nationality, 12 state, 12 address-district) are now one-line
placeholders (`"$NATIONALITY"` / `"$INDIA_STATES"` / `"$INDIA_DISTRICTS"`), expanded by
`scripts/lib/sync-config-core.mjs` at sync time into the standard
`{value,label_en,label_hi}` shape (label_hi = label_en — English-only lookups per the
bilingual pillar; the old 13 curated Hindi nationality labels are superseded).
`occurrence_country` is locked to a single `India` option; `occurrence_district` and
`arrest_district` (event locations — occurrence has no state field at all, arrest_district
has no sibling arrest_state) keep the police-district list. **Real bug found and fixed
here:** the first version expanded placeholders inside `toRow` — but `syncTable`'s checksum
is `sha(raw config item)`, and the bootstrap autoloader (`src/bootstrap/autoload.js` runs
`syncConfig` on boot — it fires during test scripts too) had already stamped those
checksums while writing the RAW placeholder strings into `field_registry.options`, so the
fixed sync saw matching checksums and never repaired the rows. Fixed by expanding BEFORE
the checksum is taken — which also means a future snapshot/dataset change automatically
resyncs the affected rows (checksum covers the expanded list, not just the config text).
Proven by forcing a row stale and watching `~1 updated` restore the full 248-entry list.

**Excel cascade resurrected:** `template-builder.service.js`'s `sdRows = []` stub (the
"permanently degraded" deferral) now builds `{state_name, district_name}` pairs from
`DISTRICTS_BY_STATE` — the entire downstream machinery (STATE_TO_DISTRICT_NR named ranges,
INDIRECT/VLOOKUP district formulas, `wireStateDistrictCascade` for the
UIDB/MISSING/KALANDRA path) came alive as designed. Two corrections made while wiring it:
(1) the cascade's IFERROR fallback pointed at `OPT_DISTRICT` (police districts) — wrong for
a person's home address; address-district cells now fall back to a new
`OPT_INDIA_DISTRICTS` named range (the full-India superset), police lists untouched;
(2) **latent bug found:** the base-workbook first pass writes a `__DIST_INDIRECT_PENDING__`
sentinel on EVERY `*_district` column when the cascade is available, but the fourth pass
only replaced sentinels where a sibling `*_state` column exists — occurrence_district/
arrest_district (no sibling state, by design) would have shipped with a broken
literal-sentinel dropdown. Dead code while the cascade's data source was empty; live the
moment it was resurrected. Fixed: sentinel cells with no sibling state resolve to the flat
police-district named range.

**Form cascading:** new `GET /api/fields/lookup/state-districts` (auth-gated like its
sibling lookups, day-long private cache) returns `{states, districtsByState}`;
`FieldRenderer.jsx` narrows any person-address `*_district` dropdown to its sibling
`*_state`'s districts (fetched once, cached indefinitely), explicitly excluding
`occurrence_district`/`arrest_district`/the police `district` field; no state selected or
'Other UT/State' → the field's own full-India options stand. The existing police
district→station filtering is untouched. Long lists render through the same searchable
select the 225-entry police_station list already uses.

**Baseline note (inspected, not silently blessed):** the pre-bless drift revealed the
WP10-blessed baseline had been missing the six user-approved ARREST special-scheme columns
(`integrated_pi` … `by_eyes_ears_scheme_members`) on Person Arrested Detail, carrying a
6-wide interior null-column gap in their place — a WP10-bless artifact, not a WP11 change.
The current regeneration restores them into those exact slots (verified: all 6 present,
zero interior nulls, zero duplicate keys). Blessed with the restoration included.

**Verification:** sync-config clean; registry spot-checks (complainant_country 248,
complainant_state 37, complainant_district 758, occurrence_country locked ['India'],
occurrence_district/arrest_district police-15); generated templates verified —
complainant_district DV = INDIRECT/VLOOKUP cascade with OPT_INDIA_DISTRICTS fallback,
occurrence_district DV = flat OPT_DISTRICT, MISSING/UIDB (wireStateDistrictCascade path)
both cascade correctly, 37-entry state lists; endpoint live-tested (200 + shape + 401
unauthenticated); full E2E import of a CASE with complainant_state=Maharashtra,
district=Pune, nationality=Japanese → validates clean, imports; duplicate-key scan across
all 6 templates clean; `import:parity` clean; baseline blessed once at the end,
`check` ×2 byte-identical; frontend `npm run build` clean; zero test residue.
**Flagged for a human:** open one hardened template in real Excel to see the state→district
cascade filter live, and click through a form address block (pick state → district list
narrows) — the two interactive behaviors this environment can't exercise.

**Files changed:** new `config/ref-data/india_states_districts.json`,
`backend/scripts/dev/build_india_districts.mjs`, `backend/src/config/geoData.js`;
`config/fields/case.json`/`arrest.json`/`missing.json`/`uidb.json` (placeholder swap +
occurrence lock), `scripts/lib/sync-config-core.mjs` (placeholder expansion pre-checksum),
`import/import-fields.config.js` (geoData re-exports, India-scope address districts,
occurrence override), `import/template-builder.service.js` (sdRows resurrection,
OPT_INDIA_DISTRICTS, fallback + sentinel fixes), `fields/fields.controller.js` +
`fields/fields.router.js` (state-districts lookup),
`frontend/src/components/forms/FieldRenderer.jsx` (address cascade),
`scripts/template-baseline.manifest.json` (re-blessed).

---

## ADDENDUM — Import robustness + bugfix batch (2026-07-20)

Bugfix batch (`docs/bugfix-batch-2026-07-20/HANDOFF.md`). The reported "ARREST bulk import not
working — system error" turned out to be a **CLASS of per-row write-crashes** from messy real
Excel data, each surfaced as one opaque `WRITE_FAILED` message. Root fixes are all in the SHARED
write path (`records.mapper.js` / `records.service.js insertRecordCore`) — no frozen-template
change — establishing the invariant: **every import row either WRITES or is REJECTED with a
specific reason; no row ever produces the opaque "system error" again.**

**Coercion contract (records.mapper.js) — the mapper now SALVAGES bad values instead of crashing:**
- **Location varchar overflow** (was pg 22001): `normalizeLocationValue` truncates any location
  varchar to its real column width (`columnMaxLenCache` from information_schema). `pincode` is
  digits-only, and a non-empty value with < `PINCODE_MIN_DIGITS` (5) digits → null (kills the
  "6-digit PIN code" placeholder).
- **Enum CHECK violations** (was pg 23514): `ENUM_ALLOWED` holds the exact CHECK vocabulary for
  `persons.gender` / `persons.relation_type` / `record_properties.status`. Out-of-vocabulary →
  fallback via `normalizeEnumConstrained` (`ENUM_FALLBACK`): gender/relation → null (nullable),
  status → `'STOLEN'` (NOT NULL DEFAULT). Single-source detectors `enumCoercion` / `pincodeCoercion`
  are EXPORTED and reused by validation so warnings can't drift from what the write path does.
- **record_date** (was pg 22008 datetime-overflow on DD/MM read as MM/DD, and pg 22007 on corrupt
  Excel-serial dates): `insertRecordCore` normalizes to ISO via `normalizeDate` (idempotent on ISO
  → interactive path unaffected). A present-but-UNPARSEABLE date is REJECTED at validation with the
  new `RECORD_DATE_INVALID` ERROR (`import.validate.js`) — record_date is NOT NULL and can't be
  fabricated.
- **Read-side enum inverse** (`decorateEnumUpper`): stored UPPERCASE enums → field_registry's
  Title-Case option values on recompose, so SearchableSelect matches (fixes gender/relation/status
  showing blank on BOTH imported and interactive records).

**Operator visibility (user decision 2026-07-20 — warn on cleaned cells):** `import.validate.js`
`detectCoercionWarnings` emits a `VALUE_SALVAGED` **WARNING** per salvaged cell (row still imports)
— e.g. `gender "Yadav" not recognized → blank`, `status "Mobile" → "Stolen"`. This catches
column-misalignment before plausible-but-wrong records reach compilations/analytics. Pure
format-normalization (DD/MM→ISO, casing) stays silent; only value-DISCARDING/FABRICATING coercions
warn. Error-surfacing also improved: the `WRITE_FAILED` catch now logs pg code/constraint/table.

**Other frozen-template-adjacent changes in the batch:** #3 gazette (`uidb_no`) commented out
(is_active:false — re-enable = flip + sync-config); #4 gd_no/fir_no LABELS de-clubbed ("GD Number"/
"FIR Number" — the date/time columns were already separate); #5 person-address PS dropdown is now
DUAL-MODE (Delhi PS list iff person state=Delhi via `INDIRECT(IF($state="Delhi","OPT_POLICE_STATION",""))`,
else free-text) while occurrence PS keeps its district cascade — **⚠ the conditional-INDIRECT Excel
dropdown needs a real-Excel spot-check** (per-row state reference). `import:parity` stays GREEN
across all changes.
