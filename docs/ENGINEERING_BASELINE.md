# PHAROS — Engineering Baseline (Stage 5+)

**Status: BINDING.** These are the permanent rules of conduct for all work on this repo —
human or AI — from 2026-07-13 onward. Design truth stays in `docs/db-audit/DB_SCHEMA.md`
(schema) and `docs/db-audit/ARCHITECTURE.md` (app layer); this document governs **how**
that design gets implemented and how every future change must behave. When a change
conflicts with a rule here, the change is wrong until the user explicitly amends this file.

---

## P1 — Module integration (typed schema, one write path, event bus)

1. **No module reads or writes `records.data` jsonb or `excel_*` tables — they no longer
   exist.** Every module adapts to the typed schema (spine + detail + persons/properties/
   locations/offences) per `ARCHITECTURE.md` §4. The `extra` jsonb column on each detail/
   person/property/location row is the ONLY escape hatch, reached exclusively via a
   `field_registry.storage` mapping with `"extra"` — never ad-hoc keys.
2. **One write path.** All record mutations (create/update/transition/override) go through
   `records.service.js`. Controllers, import, legacy, amendments — everything funnels into
   the same service functions. No module opens its own transaction against record tables.
3. **The registry drives the split.** The write path is a generic, registry-driven splitter:
   it reads `field_registry.storage` for each incoming key and routes the value to its
   table/column (the storage-shape contract in `config/README.md`). Never hardcode
   "field X goes to column Y" in module code — if a field moves, only config changes.
4. **Cross-module communication = RabbitMQ only** (`publish`/`subscribe` on exchange
   `pharos`). Never import another module's service for a cross-domain effect.
5. **Adaptation order for the pending stage-5 work** (re-ranked 2026-07-13, supersedes the
   sequencing in `ARCHITECTURE_HANDOFF.md` — audit enforcement moved last by decision):
   1. Records write path (registry-driven splitter) + read path (`getRecordDetails` recompose)
   2. Validation/normalization layer (P2)
   3. Fields module + frontend form pipeline (P3, P4)
   4. Import module rewire (template stays frozen — P3)
   5. daily-diary, analytics, compilation, record-links, filters, level-contracts
   6. Unified report engine
   7. Transfers module
   8. ✅ **DONE** (2026-07-18, Integration 4) Hash-chain enforcement + verification job +
      freeze runbook — see `docs/new-db-integration/04-audit-hash-chain.md`
6. Kill-list code (`DB_SCHEMA.md` §11, `ARCHITECTURE.md` §12) is deleted as each module is
   adapted — never "fixed" to work against the new DB, never left half-dead.
7. **Linking is asynchronous — one action at a time (ruling 23c).** A record write never
   resolves cross-record links inside its own transaction: it stores the as-entered
   reference (e.g. FIR no) and commits; the post-commit `record.created`/`record.updated`
   event triggers a link-resolver subscriber that performs the resolution and inserts the
   `record_links` row as its own single, idempotent action (UNIQUE triple absorbs retries).
   Unresolved references stay as provenance/fallback and are retried on the next update.

## P2 — Validation: constrain → normalize → enforce (three layers)

Data is entered by non-tech-savvy officers on rotating shifts; the next shift WILL type the
same fact differently. The posture is **constrain at the UI, normalize at the API, enforce
at the DB** — decided 2026-07-13.

1. **Layer 1 — UI constrains.** Wherever a closed set of values exists, the input is a
   dropdown/picker fed from the backend (ref.* lookups, field_registry options) — never
   free text. Dates come from date pickers, phones from masked inputs. Typing freedom is
   minimized by design, not by scolding the officer afterwards.
2. **Layer 2 — API normalizes (single, registry-driven).** One normalization pass runs at
   the API boundary for every record write (interactive form AND bulk import — same code):
   - trim + collapse internal whitespace; canonical casing for names
   - dates → ISO `YYYY-MM-DD` regardless of entry format (`dd-mm-yyyy`, `dd/mm/yy`, …)
   - phone numbers → digits-only canonical form (strip `+91`, spaces, dashes)
   - FIR references → parsed into `(ps, fir_no, fir_year)` components
   - enum-ish free text → matched case-insensitively against the field's option list
   The normalizer is **driven by `field_registry` field type + rules, not per-endpoint
   code**. A new field gets normalization by having a type, never by editing a validator file.
   Normalization is deterministic and idempotent (normalizing twice = normalizing once).
3. **Layer 3 — DB enforces.** FKs, CHECKs, UNIQUEs (already in the schema) are the last
   line of defense, never the UX. A DB constraint error reaching an officer is a bug in
   layers 1–2.
4. **Drafts vs submit (ruling 18 pattern, generalized):** drafts save partial data with
   only type-level validation. Full requiredness (`required` + `show_when` from config) is
   re-checked at **submit**, in the service, never as a DB CHECK.
5. **Rejection is the last resort.** Hard-reject only impossible values (a date that isn't
   a date, an FK that doesn't exist). Everything recoverable gets normalized, not bounced.
6. `validate.middleware.js` (currently unwired) either becomes the mount point for the
   registry-driven validator or is deleted — no third parallel validation mechanism.
7. **Two-dates discipline (ruling 22).** A real-world date (when something actually
   happened — officer-entered, backdating expected) and a system timestamp (when it was
   entered — audit's fact) are DIFFERENT facts and are never conflated. Any feature that
   reports "what happened on date D" pivots on the officer-entered effective date, never
   on `created_at`/`changed_at`. Concretely: domain-status changes write a
   `record_status_events` row (`DB_SCHEMA.md` §4.8) with `effective_date` in the same
   transaction, via the one write path; the UI asks "when did this change happen?"
   (default today, not-future) whenever a domain status is edited.

## P3 — Field catalog & the frozen import template

1. **The bulk-import Excel template's OUTPUT is a frozen contract.** The template officers
   download today (generated by `import/template-builder.service.js` from
   `import-fields.config.js`) is the finalized, furnished statement of every field we
   collect. **No change to the downloaded template — not columns, not order, not labels,
   not dropdown wiring — without explicit user sign-off.** Keep `import-fields.config.js`
   in the repo even after any successor exists.
2. **Two catalogs, two jobs, one bridge.** The template defines *what we collect*;
   `config/fields/*.json` → `field_registry` defines *where it's stored*. The bridge is a
   checked-in mapping (template column key → `field_registry.field_key`) plus a **parity
   check script** that fails loudly when either side drifts (field present in one catalog
   and unmapped in the other). Run it in `sync-config` or CI — drift must be impossible to
   miss, not discovered in production.
3. **Goal state (aspiration, not a blocker):** the template becomes *generated from
   `field_registry`* — but only once the generator can reproduce the current template
   byte-for-byte in effect (same columns/order/labels/named-range dropdowns/cascades).
   Parity check is the gate. This also unlocks the custom-field module: a promoted field
   could then appear in the template automatically. Until the generator passes parity,
   the existing hand-maintained generator stays untouched.
4. Duplicate/alias keys noted in `docs/db-audit/HANDOFF.md` open item (e): `status`/
   `case_status`, `nick_name`/`arrested_nickname`, `name_part` splits — dedupe/compose in
   the write-path mapping, never by renaming template columns.

## P4 — Dumb frontend

1. **The frontend renders; the backend decides.** Forms render from
   `GET /api/fields/form/:record_type`. Option lists, hierarchy trees, beat lists, ref
   lookups — all fetched from backend endpoints. The frontend NEVER connects to the DB and
   NEVER hardcodes domain data.
2. **Hardcoded domain arrays in the frontend are debt to be drained:** `utils/policeData.js`,
   `utils/hierarchyData.js`, any inline option list in a page component. As each page is
   touched during stage 5, its hardcoded data moves behind an API. New code never adds any.
3. **Derived values are computed server-side** (age from dob, is_minor, single-head
   classification, occurrence-time-unknown). The frontend may mirror them for instant UX,
   but the server's computation is the one that's stored.
4. **One form engine:** `components/forms/DynamicForm.jsx` (multi-step). The five legacy
   flat-blob pages and the dead Ant Design form are retirement targets
   (`ARCHITECTURE.md` §10.4) — never updated to the new schema in place.
5. The frontend submits the **split payload** (`data` + `persons[]` + `properties[]`, per
   the storage contract) and treats the response as truth. No client-side re-derivation of
   what the backend already returned.

## P5 — Jurisdiction isolation (non-negotiable, applies to every endpoint)

1. **Every router mounts `authMiddleware, enforceScope`.** No exceptions for "internal" or
   "read-only" endpoints. `req.jurisdictionQuery` (ps_id / district_id / sub_div_id / global)
   is applied in **every** list/aggregate service query — records, analytics, reports,
   daily-diary, import history, notifications, compilations, exports.
2. **Single-record operations call `verifyRecordAccess(recordId, user)`** before acting —
   reads included, not just writes.
3. **Detail tables inherit scope through the spine.** persons/properties/locations/offences/
   detail rows are never queried standalone across jurisdictions — always joined through
   `records` so `records.ps_id`/`district_id` scoping applies. Same for report SQL
   (`pharos_report_ro` queries include the scope predicate passed from Node).
4. **Write isolation too:** a user creates/mutates records only inside their own scope
   (HC/SHO → own `ps_id` stamped server-side from `req.user`, never trusted from the body).
5. **Scope is enforced in the service layer, proven at the query** — a missing
   `jurisdictionQuery` application is a security bug, not a style issue. Any new endpoint's
   review checklist starts with "where is the scope predicate?".
6. Users can never influence data outside their jurisdiction — including indirectly
   (bulk import rows for another PS are rejected per-row; record links may only be created
   by someone with access to at least the owning side, per `docs/RECORD-LINKAGE.md`).

## P6 — Audit-readiness (✅ ENFORCEMENT LANDED 2026-07-18, Integration 4)

> **Update (2026-07-18):** hash-chain enforcement is now DONE — versioned tamper-evident
> chain, `assertNotFrozen` on every write path, freeze-on-break, single-ordered-pass verifier,
> cron job + CLI + endpoints (`docs/new-db-integration/04-audit-hash-chain.md`). The original
> deferral text below is kept for historical context; the disciplines it lists all still hold.

Audit/hash-chain is **not** a current core deliverable (decided 2026-07-13), but nothing we
build may make its later implementation a refactor. The cheap disciplines stay ON:

1. **Append-only, always.** Records are never deleted — status-changed only. Revisions and
   audit_logs rows are never updated or removed.
2. **Every mutation still writes `record_revisions` + `audit_logs`** inside the same
   transaction, through the one write path (P1.2). Populating `prev_hash`/`row_hash` stays
   (it's cheap); what's DEFERRED is: single-writer consolidation of the auditHandler branch,
   row-locking, the verification job, and the freeze/unfreeze runbook.
3. **Events publish AFTER commit**, with payloads carrying enough context
   (recordId, action, from/to status, performed_by) that a future audit subscriber needs
   no schema change.
4. When the hash-chain work does land (P1.5 step 8), it must slot in by changing ONLY
   `records.service.js` internals + deleting the auditHandler revision branch — if any
   other module would need changes, we've violated P1.2 somewhere and that's the bug to fix.

---

## Review checklist (every change, every PR, every AI session)

- [ ] Schema change? Then in the SAME change: `DB_SCHEMA.md` updated + `ER_DIAGRAM.md` updated + `ER_DIAGRAM.drawio` regenerated (`node docs/db-audit/generate-drawio.mjs`) — the drawio is the user's primary view of the DB; a table missing there is a table that doesn't exist to them
- [ ] Reads/writes typed columns via storage mappings — no `records.data`, no `excel_*`, no ad-hoc `extra` keys
- [ ] Record mutations go through `records.service.js` — no parallel write path
- [ ] New/changed fields: config row in `config/fields/` with a `storage` mapping + `npm run sync-config` — no code, no migration (unless promoting to a real column)
- [ ] Import template output untouched (P3.1) — parity check passes
- [ ] Normalization comes from the registry-driven layer — no one-off format parsing in controllers
- [ ] Every query carries the jurisdiction predicate; single-record ops call `verifyRecordAccess`
- [ ] No hardcoded domain data in the frontend; forms render from the registry
- [ ] Append-only preserved: revision + audit_log in-transaction, event after commit
- [ ] Cross-module effects via RabbitMQ, not direct imports
- [ ] Kill-list code deleted, not resurrected
