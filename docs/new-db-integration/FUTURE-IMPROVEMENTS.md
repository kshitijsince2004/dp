# Future Improvements — Post-DB-Integration Register

**Status: register only — NOTHING here is authorized for implementation without an explicit
user decision.** This file collects improvements identified during the Stage-5 integrations
(esp. Integration 5's architecture review, 2026-07-20). When an item is picked up, move it
into a numbered integration doc; when superseded, strike it through with a note.
Baseline discipline (`docs/ENGINEERING_BASELINE.md`) applies to any future implementation.

Format per item: **Problem → Why it matters → Suggested implementation → Complexity → Dependencies.**

---

## A. Editable operational statuses (user-mandated items)

> **STATUS UPDATE (2026-07-20, user-authorized follow-up to Integration 5):** A1–A3 are
> **DELIVERED** — `custody_status` is a first-class dated status (ruling 26: CHECK widened,
> `updateDomainStatus` support, the `case_status`-on-ARREST leak closed), a registry/
> dispatch-driven `GET /records/:id/status-options` endpoint feeds ONE reusable
> `StatusUpdateModal` (HC row action on MyRecords + record detail; SHO page refactored onto
> it, its hardcoded vocabulary maps deleted), with the effective-date/workout-date UX.
> See `05-residual-modules.md` §"Follow-up". **A4 (sweep of remaining fixed facts, e.g. IO
> reassignment, per-property status in the modal) remains open.**

### A1. Record state should support status changes over time
- **Problem:** A record's operational/domain state is captured at entry and (for most types)
  can only change through `PATCH /records/:id/status`. The model is right (ruling 22:
  `record_status_events` with officer-entered `effective_date`), but coverage is partial and
  the UI barely surfaces it — officers effectively treat state as fixed-at-creation.
- **Why it matters:** Real investigations change state constantly (untraced→traced,
  pending→worked-out, FIR registered later on a missing case). If the system can't record a
  dated change, officers re-enter records or leave stale data — both poison reporting.
- **Suggested implementation:** Audit every "status-like" field across the five detail
  tables against the `record_status_events.status_field` CHECK
  (currently: `case_status`, `missing_status`, `uidb_status`, `final_call_status`,
  `property_status`, `is_worked_out`). Add the missing ones to the CHECK (fold into base
  migration pre-launch) + the `updateDomainStatus` whitelist + `STATUS_FIELD_BY_DETAIL_COLUMN`
  (so plain edits also emit dated events). Add a generic "Update status" UI (date-of-change
  input, default today, not-future) on every record detail page.
- **Complexity:** Medium (server small; UI is the bulk).
- **Dependencies:** none — the event table, single write path, and endpoint already exist.

### A2. Custody status (ARREST) should be editable
- **Problem:** ARREST records have NO entry in the `updateDomainStatus` whitelist or the
  `record_status_events` CHECK. The "Custody status" form field maps to
  `arrest_details.case_status` (the literal `arrest_details.custody_status` column is
  confirmed dead — see `03-import.md` Deferrals); once created, custody state (in custody /
  bailed / remanded / released…) cannot be changed as a dated event at all.
- **Why it matters:** Custody status is the single most time-sensitive fact on an arrest;
  bail hearings and remand extensions change it within days. An uneditable custody status
  makes the ARREST module a snapshot, not a register.
- **Suggested implementation:** Add `'custody_status'` (or reuse the `case_status` field key
  routed per-type) to the `record_status_events` CHECK + `updateDomainStatus` map targeting
  `arrest_details.case_status`; decide whether to resurrect the dead `custody_status` column
  (cleaner semantics) or keep the `case_status` overload (no schema change beyond the CHECK).
  UI: status control on the arrest detail page with effective date.
- **Complexity:** Low–Medium.
- **Dependencies:** A1's UI pattern; decision on the dead column (pre-launch fold window).

### A3. Worked-out status: close the UI gap
- **Problem:** `is_worked_out` IS editable server-side (`updateDomainStatus`, dated event,
  `worked_out_date` stamped in the same transaction — ruling 23a), but no frontend surface
  exposes the flip outside full record edit.
- **Why it matters:** Work-out is the core progress metric in district reporting; if flipping
  it requires editing the whole record, officers batch it or skip the date, corrupting the
  diary pivot.
- **Suggested implementation:** One-click "Mark worked out" affordance (with date + optional
  comment) on CASE list/detail rows, calling the existing endpoint.
- **Complexity:** Low (frontend only).
- **Dependencies:** none.

### A4. Sweep for other fixed-but-should-be-editable operational facts
- **Problem:** Same pattern likely elsewhere: property recovery state beyond
  `property_status`, missing-person "found" details, UIDB identification state, IO
  reassignment (records carry `io_id` with no dated change trail).
- **Why it matters:** Every such fact edited without a dated event erodes the two-dates
  discipline (P2.7) and the eventual daily-diary accuracy.
- **Suggested implementation:** Field-by-field review with the user against real station
  workflows; wire chosen fields through the A1 mechanism. IO reassignment may deserve its own
  event type (`io_changed`) or a `record_status_events` entry.
- **Complexity:** Medium (mostly product decisions, then per-field wiring).
- **Dependencies:** A1.

---

## B. Deferred modules (already user-acknowledged, restated for completeness)

### B1. Transfers module + FIR-number allocator
- **Problem:** `record_transfers` + `fir_number_counters` have zero writers; `@PRIOR`
  workflow stopgap only; `fir_details.fir_year` is NULL everywhere, so FIR linkage matches on
  `(ps_id, fir_no)` without year and IN_TRANSFER records are invisible in every queue.
- **Why:** Transfers are first-class in the schema design (ruling 14); the allocator closes
  the fir_year gap that weakens linkage.
- **Suggested implementation:** Dedicated `modules/transfers/` per `ARCHITECTURE.md` §6:
  ledger-backed accept/reject reading `record_transfers.prior_status/prior_level`, PS-scoped
  visibility, allocator issuing `(ps_id, fir_year, seq)`.
- **Complexity:** High. **Dependencies:** none technical; user decision (deferred 2026-07-15).

### B2. Amendments rework
- **Problem:** `record_amendments` table + `legacy.amendment_*` workflow config rows exist;
  no endpoints or UI (old `/legacy/amendments` code deleted with the legacy module).
- **Why:** Post-approval corrections currently have no lawful path other than privileged edit;
  amendments are the append-only-compatible answer (and the unfreeze runbook points to them).
- **Suggested implementation:** request/approve/reject endpoints writing `record_amendments`,
  transitions via the workflow engine, applied changes through `updateRecord` on approval.
- **Complexity:** Medium–High. **Dependencies:** none.

### B3. Filter engine (`POST /filters/apply`)
- **Problem:** `filter_presets` stores AND/OR `filter_spec`s but no engine executes them —
  presets are decorative beyond what `listRecords`' fixed filters honor.
- **Why:** Saved cross-field filtering is a Phase-2 commitment and the presets UI implies it.
- **Suggested implementation:** registry-driven spec→Knex compiler (whitelisted operators,
  field keys resolved through `field_registry.storage` to typed columns), applied inside
  `listRecords` so jurisdiction scoping stays in one place.
- **Complexity:** Medium–High. **Dependencies:** none.

### B4. Generalize person search beyond ARREST/ARRESTEE
- **Problem:** `record-links` person-search (rebuilt on the typed schema, Integration 5)
  covers only ARRESTEE persons on ARREST records; complainants, victims, witnesses, missing
  and deceased persons are not searchable, and only the present address is matched/returned.
- **Why it matters:** Cross-record person identity is the seed of dedup/NAFIS-style work
  (`RECORD-LINKAGE.md` §10 flags this as the natural next step).
- **Suggested implementation:** parameterize the persons `role` filter and drop the
  record-type restriction; include permanent/arrest-location addresses; consider a trigram
  index on `persons.name` when volumes grow.
- **Complexity:** Low–Medium. **Dependencies:** none.

### B5. ACP review step
- **Problem:** ACP role exists with empty queue; no workflow rows; `records.current_level`
  CHECK lacks `'SUB_DIV'`.
- **Suggested implementation:** config rows + CHECK widen (base-migration fold) when the user
  wants the step. **Complexity:** Low. **Dependencies:** user decision.

### B6. Real JCP/SCP zone/range scoping
- **Problem:** JCP/SCP are status-gated globals; no zone/range FK on `users`.
- **Suggested implementation:** `zone_id`/`range_id` on users + `enforceScope` branches +
  (only if reports need it) spine denormalization — revisit §9.3's verdict first.
- **Complexity:** Medium. **Dependencies:** user decision; hierarchy already has the nodes.

---

## C. Audit / integrity

### C1. Keyed hash chain (HMAC v3) + external anchoring
- **Problem:** The in-DB unkeyed chain (Integration 4) cannot detect full re-chaining by a
  DB-write attacker, nor tail truncation (documented cryptographic boundary in
  `04-audit-hash-chain.md`).
- **Why:** This is the gap between "tamper-evident" and the Phase-2 "hash-sealed audit"
  commitment.
- **Suggested implementation:** `computeRowHashV3` with HMAC (key outside the DB), widen the
  `hash_version` CHECK in the same migration (C7 invariant); periodic export of per-record
  head-hash + revision count to an append-only external store.
- **Complexity:** Medium code, High operationally (key management/rotation).
- **Dependencies:** infrastructure decision on key custody.

### C2. DRAFT hard-delete retention
- **Problem:** `deleteRecord` hard-deletes DRAFTs, cascading their revisions (only the
  `audit_logs` row survives).
- **Suggested implementation:** product call: soft-delete status for DRAFTs, or accept as-is.
- **Complexity:** Low. **Dependencies:** product decision.

---

## D. Code-health drains (do on touch, not as a big-bang)

### D1. Auth alias shim + response compat aliases
`normalizeAuthUser()` camelCase aliases (~15 consumer modules), `name_en`/`station_id`/
`applicable_record_types` response aliases in hierarchy/users/filters — drain consumers to
canonical snake_case, then delete the shims. **Complexity:** Low each, wide surface.

### D2. Frontend hardcoded-domain-data drain (P4.2)
`utils/policeData.js`, `utils/hierarchyData.js`, the mock `utils/api.js` layer, inline option
arrays in legacy pages — replace with backend endpoints as each page is touched.
**Complexity:** Low each.

### D3. Legacy flat-blob pages retirement (P4.4)
The five legacy record pages + dead Ant Design form are retirement targets; route everything
through `DynamicForm`. **Complexity:** Medium (UX parity checks).

### D4. Dead column drops at next pre-launch rebuild
`arrest_details.custody_status` (unless A2 resurrects it) and any other confirmed-dead
columns — fold removals into base migrations while data is still disposable.
**Complexity:** Trivial pre-launch; painful after. **Dependencies:** A2 decision first.

### D5. Router file-naming consistency
`compilation.routes.js` / `notifications.routes.js` are live but violate the `*.router.js`
convention that "old `*.routes.js` are orphaned" — rename on next touch to keep the
convention honest. **Complexity:** Trivial.

### D6. Shared `verifyUserAccess()` helper + 404-vs-500 mapping on access checks
`getUserAudit` (Integration 5) inline-checks "target user inside my district"; if more
endpoints need user-jurisdiction checks, add `verifyUserAccess(userId, actor)` beside
`verifyRecordAccess` in `rbac.middleware.js`. Related repo-wide inconsistency: a
`verifyRecordAccess` "not found" throw surfaces as 500 at most call sites — a sweep should
map not-found → 404 consistently. Also reconcile: `GET /admin/audit-log` allows only
SYSTEM_ADMIN while module docs say HQ_ADMIN+SYSTEM_ADMIN (code is stricter — pick one).
**Complexity:** Low.

### D7. `record-links` linked-record preview
`getLinksForRecord` lost `linked_record_data` (dead `r.data`) in Integration 2 — restore a
small typed preview (fir_no, primary person name, head label) via the mapper if the UI needs
it. **Complexity:** Low.

---

### D8. Level-contract masking: per-request contract resolution + real JCP/SCP contracts
`maskRecordData` resolves the active contract once per LIST ROW (an N+1, up to 2 lookups for
JCP/SCP via the `LEVEL_FALLBACK = {JCP:'HQ', SCP:'HQ'}` bridge added in Integration 5) —
resolve once per request instead. When JCP/SCP visibility should diverge from HQ's, author
real `to_level: JCP/SCP` rows in `config/contracts/` and delete the code fallback.
**Complexity:** Low.

### D9. Status field-key naming reconciliation (`status` vs `case_status` vs list-summary keys)
Three namings coexist: registry `status` (ARREST/PCR_CALL/MISSING/UIDB, `per_type` storage),
registry `case_status` (CASE), and `buildListSummary()`'s hardcoded per-type summary keys
(`arrest_case_status` etc). Integration 5 papered over it in the contracts config; the real
fix is deduping the registry keys (HANDOFF open item (e)) and making list summaries
registry-driven. **Complexity:** Medium (touches contracts, registry, list read path).

### D10. FilterPresetsPanel: hide delete on non-deletable presets
The panel renders a delete control on the in-memory SYSTEM default presets; the backend now
returns a clean 404 (UUID guard, Integration 5) but the button is still dead UX — hide it for
SYSTEM presets / non-uuid ids. Also seed the SYSTEM defaults into `filter_presets` properly
(config-as-data style) so the in-memory merge can retire. **Complexity:** Low.

---

## E. Data / reference quality

### E1. 71 unreconciled beat `ps_cd`s (765 beats, `ps_id` NULL) — needs Delhi Police input;
then extend `ps_codes.json`, rerun `load-ref`, consider `SET NOT NULL`.
### E2. Heinous overlay terror-candidates (codes 148/157/164/166/167/212) pending user review
in `config/ref-overlays/local_head_categories.json`.
### E3. Hindi additive labels — `ref.*`/`hierarchy_nodes` are English-only by decision;
frontend spots rendering `name_hi` show blanks until the additive column lands.
### E4. Registry option vocab vs DB CHECKs — gender fixed in Integration 5; sweep every other
enum-backed field (`field_registry` options vs column CHECKs) with a parity script run in CI.
**Complexity:** Low (script) — high value.
### E5. **UIDB `deceased_relation_type` is hard-broken and NEEDS A USER RULING** (found by the
Integration-5 enum audit): its options (`Brother/Sister/Son/Daughter/Friend`) have no legal
counterpart in the `persons.relation_type` CHECK (`FATHER/MOTHER/HUSBAND/WIFE/GUARDIAN/OTHER`,
set by **ruling 21** for S/O–D/O–W/O prefix derivation) — every UIDB submission carrying one
of those values violates the CHECK. Options: (a) widen the CHECK with the sibling/child/friend
values (amends ruling 21 — prefix derivation must then handle them), (b) map them to `OTHER`
at normalization (loses fidelity), or (c) retarget the field to its own column. Not fixed
unilaterally because it amends a recorded architect ruling. **Complexity:** Low once ruled.

---

### E6. Upsert-based ref loader (ref reload on a DB with live records)
- **Problem:** `load-ref` is delete-and-reinsert inside one transaction; any record now
  FK-references `ref.sections` (etc.), so a genuine ref-source change (new Menu_Tables.xlsx,
  Hindi additive columns, new PS codes) on a DB that has records will crash the reload —
  found 2026-07-20 when the missing-checksum bug (fixed: `loadRef` now persists
  `ref_source_checksum` for BOTH the CLI and the boot autoload) exposed it at boot.
- **Why it matters:** post-launch, ref data WILL change while records exist; today the only
  path would be a full DB wipe.
- **Suggested implementation:** convert the loader to key-preserving upserts
  (insert … on conflict merge per natural key) + explicit handling for rows removed from
  the source (deactivate, never delete, once anything references them).
- **Complexity:** Medium. **Dependencies:** none; do before any real deployment.

## F. Explicitly out of scope here (tracked elsewhere)

Reporting stack — unified report engine on `report_templates`, `report-builder`,
`daily-diary`, `warehouse`/`rpt`, `python_worker` RO role — is the remaining Stage-5
integration (excluded from Integration 5 by user instruction, 2026-07-20) and is tracked in
`README.md`'s roadmap, not in this register.
