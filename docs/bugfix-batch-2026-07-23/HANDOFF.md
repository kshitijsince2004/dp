# BUGFIX BATCH — 2026-07-23 — HANDOFF / PROGRESS LOG

**Owner:** Principal Engineer (AI orchestrator) · **Branch:** `dev2/ashmit`
**Evidence base:** tester logs in `temp delete later/logs/` (backend.log 34MB, 47 frontend
NDJSON sessions), bug screenshots (spreadsheet "errors"), live system on docker
(db `crime-diaries-db-1` @ host :5435, backend nodemon, frontend vite, rabbitmq, redis).

> This batch is a **re-report** of issues several of which were "fixed" in prior sessions
> (see `docs/bugfix-batch-2026-07-20/HANDOFF.md`). Recurrence ⇒ treat as deeper root causes,
> not isolated mistakes. Binding: `docs/ENGINEERING_BASELINE.md` (P1–P6). ONE write path =
> `records.service.js`. Frozen import template (P3). Config→DB requires `npm run sync-config`.

---

## EXECUTIVE SUMMARY (2026-07-23)
Re-reported bug batch; several items were "fixed" before yet recurred → hunted root causes, not
symptoms. Orchestrated 4 parallel file-disjoint Sonnet agents + orchestrator. **Headline:** the
"edits don't work / can't add victim-accused / import loses data" cluster (B1) was **silent data
loss** with THREE stacked causes, all now fixed: (1) a React-StrictMode stale-closure **autosave
race** posting empty `persons:[]` before the repeater seeded → backend hard-deleted victims/accused;
(2) a **role-token mismatch** (`PERSON_VICTIM`/`PERSON_ACCUSED`) the backend mapper silently dropped
(93× in logs); (3) the backend's `[]=delete-all` semantics amplifying (1)+(2) into a wipe. Fixed
FE (autosave gate + correct tokens) AND BE (mapper `PERSON_` strip + delete-to-zero guard) — proven
end-to-end via real HTTP. Also: B3 "submit does nothing" = the button **threw a TypeError on every
click** (0 submit events across 16 clicks in logs) + UIDB/MISSING singleton persons never persisted
on edit; B5/B6 duplicate/stale dynamic fields = un-deduped schema flatten; B12 confirm-crash was
stale (code deleted in July), heinous/persons import fine, property free-typed labels now WARN not
silent-NULL; B14 (log-discovered) analytics ambiguous-`ps_id` fixed. **All landed in the working
tree, NOT committed.** Only unverified surface = live React UI (no browser tool this session) —
manual checklist below. Decisions D1 (keep delete-guard + follow-up) and D2 (Yes/No) resolved.

## STABLE BUG IDS (canonical — the screenshots use two colliding numbering schemes)

Legend: ⬜ not started · 🔎 investigating · 🟡 in-progress · ✅ done · ⏸ blocked · ❓ needs decision

| ID | Severity | Bug (short) | Owner cluster | Status |
|----|----------|-------------|---------------|--------|
| **B1** | 🔴 CRITICAL | Edit silently **deletes** victims/accused/property; edits don't persist after SHO revert AND on simple edit; can't add new victim/accused (CASE, ARREST, UIDB, MISSING) | FE forms + BE records | ✅ BE (mapper+guard) done; ⏳ FE-core seeding/payload |
| **B2** | 🟠 | Workflow transition history shows user **UUID** instead of readable name (DCP + SHO views) | BE records read + FE | ✅ BE done; ⏳ FE render (FE-core) |
| **B3** | 🟠 | **Submit button not working** — REAL cause: singleton persons never persisted on edit (UIDB/MISSING) | FE forms + BE records | ✅ BE root-cause fixed; ⏳ FE confirm |
| **B4** | 🟡 | Pincode field **accepts text** (should be 6-digit numeric) | FE forms | ✅ FE-fields (verify empty ok) |
| **B5** | 🟠 | Property-of-Interest dynamic fields render **TWICE** (duplicated) — ARREST | FE forms | ⏳ FE-core |
| **B6** | 🟠 | Property-of-Interest dynamic fields **don't clear on category change** — stale fields from old category remain | FE forms | ⏳ FE-core |
| **B7** | 🟡 | GD No. **rejects alphanumeric** like "22A" (should accept) | FE forms | ✅ FE-fields |
| **B8** | 🟡 | **Double GD Date** input in Missing Person form (GD Number renders extra datetime picker) | FE forms | 🟡 FE-fields (input removed); ⏳ FE-core keysToSkip + D3 visual |
| **B9** | 🟡 | UIDB **age** field accepts invalid input (truncated in screenshot — investigate) | FE forms | ✅ FE-fields |
| **B10** | 🟡 | UIDB "Inquest filled by" — silent-NULL bug (boolean col vs SELECT) | FE forms | 🟡 FE-fields fixed→Yes/No; D2 ruling |
| **B11** | 🟡 | Missing "Is Permanent Address same…" — confirmed = backend B3, no FE defect | FE forms | ✅ folds into B3 |
| **B12** | 🟠 | Import: victim/accused/property/heinous; confirm crash | BE import | ✅ crash=stale non-bug; persons/heinous import OK (missing-symptom=B1); property free-typed-label→WARNING fix |
| **B13** | ⚪ | "we may need source of information" (vague/truncated) — clarify/defer | — | ❓ needs user clarification |
| **B14** | 🟡 | (LOG-DISCOVERED) `analytics.controller computeLeftOutAccused` SQL 42702 — `ps_id` ambiguous (records+fir_details joined, unqualified filter); always degrades to 0 | orchestrator (analytics) | 🔎 confirmed |

> **Log provenance note:** the tester is **"raja2" on Windows** (stack traces show
> `C:\Users\raja2\…`). So `C:\Users\raja2` lines are the REAL test session, NOT cross-machine
> noise. Independently, the local docker DB (`crime-diaries-db-1` @ :5435) reflects the same
> data (record `1c71a6f7` has 0 persons matching the logged delete) — the code paths reproduce
> locally. Only the *stale sync-config storage-validation* error (server wouldn't have started)
> is confirmed historical; `arrest_details` has all the #16 columns in the live DB.

Screenshot→ID map: img1#5→B1; img1#6→B2; img2#4→B3; img2#6→B4; img2#7→B5; img3#8→B6;
img4#10→B7; img4#11→B8; img5#12→B9; img5#13→B10; img5#14→B1(UIDB); img5#15→B11; img5#16→B1(ARREST); img5#17→B13; img5#18→B12.

---

## CONFIRMED ROOT CAUSES

### B1 — CRITICAL silent data loss (CONFIRMED via logs + live DB)

**Symptom cluster:** "edits not working after SHO revert", "can't add new victim/accused",
"arrest form edits of NAFIS/Dossier/PO/BC/Arresting Officer not working", UIDB/MISSING revert edits.

**Mechanism (proven):**
1. Backend `updateRecord` (records.service.js:917) treats `persons`/`properties`:
   `undefined` = "don't touch", `[]` (provided-but-empty) = "**clear all**". `upsertPersons`
   (records.service.js:95) deletes every existing person not echoed back in the payload
   (`personsToDelete`, line 166 → hard `DELETE` line 182, cascades subtypes + locations).
2. The frontend edit form (`DynamicForm.jsx`) fails to hydrate/collect the person/property
   **repeaters** in edit mode → on submit it sends `persons: []`.
3. Net effect: opening a sent-back (or even a simple) record and saving **DELETES the
   victims/accused/property** and the tester's edits never persist.

**Hard evidence:** record `1c71a6f7-a38a-4408-b216-aa255d461cbb`:
- 23:07 edit sent `personsCount:1` (ARRESTEE `79319284-3ca3-443d-8904-34b946a9701a`) — OK.
- 00:15 edit sent `personsCount:0` → `upsertPersons: lifecycle summary … deleting:[{79319284,ARRESTEE}]`
  → `deleted removed persons row`. Live DB now returns **0 persons** for that record.
(requestId `661b33ed-48f6-4be2-96bc-a2374eaa164b`.)

**Why prior fixes failed:** the FE repeater hydration is built on a fragile web of
`useEffect` + refs (`repeaterSeededIdRef`, `flatSeededIdRef`, `formDirtyRef`,
`repeaterSeedSkipRef`) with dirty-guards (see DynamicForm.jsx:2948–3135; comments cite prior
B4 / "B8 fix v2" / #R2-2 attempts). Each fix patched one race; the seed still fails to run (or
is clobbered) in the revert/edit path, so the empty array still reaches the delete-all backend.

**B1b — SECOND root cause (found in logs, not screenshots): role-name contract mismatch.**
`splitPersons: skipped repeater entry — unrecognized role` appears **93×** in backend.log:
**53× personType=`PERSON_VICTIM`, 40× personType=`PERSON_ACCUSED`** (CASE). The FE sends
`person_type: "PERSON_VICTIM"/"PERSON_ACCUSED"` (the config `repeater_entity` value, `PERSON_`-
prefixed) but backend `PERSON_ROLES` (records.mapper.js:109) accepts `VICTIM`/`ACCUSED`/`ARRESTEE`
and only maps `ARRESTED→ARRESTEE`. So CASE victims/accused are **silently dropped even when the
array is non-empty** → "can't add new victim/accused" for CASE. (ARREST's `ARRESTED` works — hence
the asymmetry the tester saw.) THREE colliding conventions: config `PERSON_VICTIM` / FE section-meta
`VICTIM` / DB `VICTIM`. Fix = FE sends correct token (FE-core) + BE strips `PERSON_` prefix as
defense-in-depth (BE-records). Both agents notified 2026-07-23.

**Fix strategy (two layers — defense in depth):**
- **FE (primary):** guarantee repeaters are seeded from `initialPersons`/`initialProperties`
  on every record load, and that submit **always sends the complete current arrays**.
  Strongly consider replacing the effect/ref seeding race with a deterministic
  key/`useMemo`-on-record-id approach rather than a 5th dirty-guard.
- **BE (safety net):** `upsertPersons` must not silently delete ALL persons when the payload
  is empty-but-record-nonempty (never a legitimate state for CASE/ARREST/etc.). ⚠ This is a
  behavior change — implement as a narrow guard (refuse delete-to-zero without an explicit
  clear signal) and FLAG for review; do not broadly redefine `[]` semantics.

### B3 — Submit blocked by required-field re-validation on hidden fields (partially confirmed)

Backend `error.log`/`backend.log`: `Missing required fields before submit: Is Missing Person
Identified / Known?` (8×), `Name of Deceased`, `Is Permanent Address same as Present Address?`,
`Information received at P.S.`, `Source / Reference of Complaint`. `submitRecord: failed` (6×).
⇒ `submitRecord`'s `validateRequiredFields` (records.service.js:~529) is requiring fields that
are conditionally hidden (`show_when`) or otherwise not applicable, so submit always 4xx's and
the button "does nothing". Must respect `show_when`/visibility exactly as the FE render does.
FE half: confirm the submit button actually fires the request and surfaces the error.

### B8 — Double GD date (evidence)
FE event `form:composite_datetime_render` fires for `{dateKey:gd_date, timeKey:gd_time}` — a
composite date+time widget. The Missing form shows the GD **date** twice: once as the standalone
"GD Date" field and again inline inside the "GD Number" lookup composite (screenshot: GD Number "44"
+ "09/07/2026 00:00" datetime + magnifier). Fix = the gd_no lookup widget should not also render a
date input when a standalone gd_date field exists. Owner: whichever of FieldRenderer/DynamicForm
renders the composite (agents coordinating).

### B1 (FE evidence)
FE `form:build_repeater_payload` yields `personsCount:0` en masse (CASE 331×, MISSING 317×, UIDB
292×, ARREST 67×) yet sometimes collects them (CASE 2×/1×/3× persons) — state/timing-dependent,
confirming the seeding race. A submit firing in a zero state → data loss.

### B12 — Import confirm crash (confirmed in logs)

`[ConfirmImport] Database confirm error: rowData[condKey].split is not a function` at
`backend/src/modules/import/import.controller.js:1792` (a `.split()` on a non-string cell value).
Plus import not composing victim/accused/property/heinous into the typed write path.

---

## AGENTS DISPATCHED (2026-07-23, parallel, Sonnet, file-disjoint)
1. **FE-core** — owns `DynamicForm.jsx`/`FormSection.jsx`. Bugs: B1(FE), B3(FE), B5, B6, B8(if in DynamicForm), B2(FE render).
2. **FE-fields** — owns `FieldRenderer.jsx` + field primitives + `fieldPatterns.js` + `config/fields/*.json` validation. Bugs: B4, B7, B8(if field-level), B9, B10, B11.
3. **BE-records** — owns `backend/src/modules/records/*` + workflow read. Bugs: B1(BE safety net), B3(BE validateRequiredFields), B2(BE add performed_by_name).
4. **BE-import** — owns `backend/src/modules/import/*`. Bug: B12 (confirm crash + victim/accused/property/heinous not imported).

Contention avoided: config/fields owned by FE-fields only; DynamicForm by FE-core only; records vs import disjoint. Orchestrator owns this HANDOFF (agents report back, don't edit it).

## CHANGE LOG
(chronological; every change: what/why/files/verification)

- **2026-07-23 — B14 FIXED (orchestrator).** `backend/src/modules/analytics/analytics.controller.js`:
  `applyJurisdictionScope` gained an optional `prefix` param (default '' — other 2 callers unchanged);
  `computeLeftOutAccused` now qualifies `records.record_type/record_date` and scopes with `records.`
  prefix. Root cause: `fir_details` also has `ps_id` (verified in live DB) → unqualified `ps_id`
  filter was ambiguous (42702) → the whole left-out-accused stat silently returned 0. Verified: the
  corrected query shape runs clean against live DB (no 42702).

## DECISIONS
- **D1 (pending):** B1 backend safety-net semantics — IMPLEMENTED by BE-records as a narrow
  guard: `upsertPersons` refuses delete-to-zero (`personEntries.length===0 && oldPersonRows.length>0`
  → leave untouched + `log.warn`). Computed on the **repeater subset** (the seeding race only wipes
  repeater persons — VICTIM/ACCUSED/ARRESTEE/WITNESS; singletons like COMPLAINANT come from flat
  `data` and survive). **Confirmed consequence:** removing *all* accused/victims from a CASE via
  edit is now blocked (silently preserved). This is intended (can't distinguish a genuine clear-all
  from an FE seeding failure), but it's a real UX limitation. **Options for sign-off:** (a) keep as-is
  (data-loss safety >> rare clear-all); (b) add an explicit FE "clear all" affordance later; (c) drop
  the guard and rely on FE only (riskier). **Recommend (a)** now, (b) if testers need clear-all.
  Note: a "total persons" guard would NOT catch CASE victim/accused loss (complainant survives), so
  the per-subset guard is the correct shape.
  **RESOLVED 2026-07-23 — user chose "Keep guard + add explicit clear later":** guard stays as-is
  (no code change). FOLLOW-UP registered (D1-followup): add an explicit "remove/clear person" UI
  affordance so the rare legitimate clear-all-accused stays possible without reopening the data-loss
  hole. Not in this batch's scope. See FUTURE-IMPROVEMENTS §H.
- **D2 (RESOLVED 2026-07-23 — user chose "Yes/No is correct"):** `uidb_details.filed_by_acp_sdm`
  stays BOOLEAN ("Inquest Filed by ACP/SDM? Yes/No"). No migration. B10 fix stands as-is. CLOSED.
- **D3 (pending, from B8):** duplicate-date fix hides standalone `gd_date/gd_time/fir_date/fir_time/
  arrest_time` and relies on the composite (gd_no/fir_no/arrest_date) rendering the date. Risk: a
  form where the composite-trigger field is hidden/absent loses its date input. **Verify each form
  type visually before closing B8.**

## BE-IMPORT AGENT — REPORTED DONE (2026-07-23)
- **B12a confirm crash** — NOT a live bug. `confirmImportBatch`/`import.controller.js:1792` was
  DELETED in Integration 3 (commit 1c290d5, 2026-07-16); stack trace dated 2026-07-02 (stale). No
  `condKey` anywhere; remaining import `.split()`s are `String()`-wrapped. Verified via real imports.
- **B12b victim/accused/heinous** — DO import correctly (verified real CASE+ARREST sheets end-to-end:
  persons, record_offences, local_head/heinous all land + recompose). **⟹ the tester's "missing after
  import" is almost certainly B1** — imported persons get wiped when the record is opened in the edit
  form and the autosave race fires. ORCHESTRATOR: verify this chain in the browser E2E.
- **Property import** ✅ REAL fix in `import.validate.js` (+45 lines, `validateRefLabels`):
  `property_major_category`/`property_minor_category` had NO dry-run check → a free-typed label
  ("NIL"/"N/A"/"Rupees" — real tester data in `sample files/`) resolved to NULL at write time and
  imported silently as "no category", zero warning. Added dry-run resolution → **WARNING** (an ERROR
  version was tested and wrongly rejected whole rows — victim/accused/offences lost too; corrected).
  Verified: mismatch now imports the row intact + emits `REF_UNRESOLVED_PROPERTY_MAJOR_CATEGORY`.
- **Deferred (need records-module owner, reported not fixed):** (1) property raw-value preservation
  via a `_raw` extra field (like local_head/beat) — mapper/schema change; (2) property resolver has
  no fuzzy/punctuation fallback (local_head/beat do); (3) `resolvePropertyMinorCategory` doesn't scope
  by major category. Logged in FUTURE-IMPROVEMENTS candidates.

## FE-CORE AGENT — REPORTED DONE (2026-07-23) — orchestrator-verified by code read
Files: DynamicForm.jsx, FormSection.jsx, FormToolbar.jsx, hc/NewRecord.jsx, sho/RecordDetail.jsx.
- **B1 root cause #1 (THE real mechanism):** stale-closure autosave race under React 18 StrictMode.
  The repeaterState autosave-watcher effect fired during StrictMode's double-invoke *before* the
  seed ran, scheduling `triggerAutosave(data, id, [], [])` in a setTimeout that captured empty
  persons/properties at call time; the real seed then self-suppressed (repeaterSeedSkipRef) and
  never cancelled the timer → 2s later it POSTed `persons:[]` → backend deleted. PROVEN from logs:
  session 0b9f3b19, record 1c71a6f7 — build_repeater_payload personsCount:0 at t+5ms, then
  autosave personsCount:0 at t+2s (requestId 661b33ed = the deletion I found). Prior fixes patched
  the seed effect's dirty-guard, never the separate autosave watcher — that's why it recurred.
  FIX: autosave watcher now gates on `repeaterSeededIdRef.current === rid` (line ~3213) — never
  autosaves a not-yet-seeded repeaterState.
- **B1 root cause #2:** person_type token mismatch. `resolveRepeaterMeta()` now merges FE's
  `REPEATER_SECTION_META` (correct bare tokens VICTIM/ACCUSED — was dead code) over the schema
  response + strips stray `PERSON_`. Fixes both edit-seed matching AND submit payload token.
- **B3 (FE) THE submit-button bug:** `FormToolbar` called `onSubmit()` with NO args;
  `handleFormSubmit` dereferenced `e.preventDefault()` → TypeError on EVERY click, before validation.
  PROVEN: 16 toolbar clicks across 3 sessions → 0 `form:submit_start` events. FIX: FormToolbar
  forwards `onSubmit(e)`; `handleFormSubmit` uses `e?.preventDefault?.()`. This is why "submit button
  not working in each form" — it literally threw.
- **B5/B6:** `deepFlattenSchema` walked raw schema; `arrested_info` property sub_tab + top-level
  `property_details` section share IDENTICAL 44 field_keys → every PROPERTY field matched twice →
  rendered twice with duplicate React keys (B5) → broken reconciliation / stale-on-category-change
  (B6). FIX: dedupe by field_key (keep first). Verified no field_key legitimately appears under two
  (section, repeater_entity) pairs.
- **B8:** added the 5 keys to FormSection keysToSkip (my requested follow-up) — done.
- **B2 (FE):** both call sites (sho/RecordDetail.jsx, hc/NewRecord.jsx) now render
  `performed_by_name || username || performed_by`.
- **B1 verification:** FE-core round-tripped a real ARREST via live API — corrected `ARRESTED`
  payload → 200, person survived; `persons:[]` → 200 + person survived (backend guard). Could NOT
  do a browser click-through (no browser tool in its session) → **orchestrator to do E2E browser test.**

## BE-RECORDS AGENT — REPORTED DONE (2026-07-23) — orchestrator-verified by code read
Files: `records.service.js`, `records.mapper.js` (own scope only).
- **B1b role mismatch** ✅ `roleForPersonType` now strips leading `PERSON_` before the alias map;
  `splitPersons` uses the shared fn (drop log escalated warn→error, still no throw). Unit-checked 7 cases.
- **B1 delete-to-zero guard** ✅ see D1. Verified by code read: two upsertPersons calls (singleton
  unconditional / repeater gated); guard on repeater subset; disjoint subsets so no cross-delete.
- **B3 REAL ROOT CAUSE (deeper than show_when)** ✅ `upsertPersons` was gated on `persons!==undefined`,
  but SINGLETON roles (COMPLAINANT/MISSING/DECEASED/INFORMANT/CALLER) come from flat `data`, not the
  `persons[]` param. UIDB/MISSING have NO repeater UI → never send `persons` → singletons NEVER
  persisted on edit → submit kept rejecting stale-empty values. Fix: singletons reconciled
  unconditionally (matches createRecord); `persons` gate applies only to repeater subset. Reproduced
  live (the exact "Name of Deceased / Is Permanent Address same…" error) and fixed.
  ⚠ ORCHESTRATOR NOTE: consequence — an OPTIONAL singleton (e.g. INFORMANT) whose fields are absent
  from a payload will be deleted (create-semantics). Fine as long as the form sends full flat data;
  worth an end-to-end check.
- **B2 readable names** ✅ added `performed_by_name`/`performed_by_role` (transitions),
  `changed_by_name`/`changed_by_role` (status_events), `changed_by_role` (revisions). Raw ids kept.
  Verified live JSON shape. FE-core renders these.
- **B3 CASE pair caveat:** BE-records could NOT reproduce "Information received at P.S. / Source /
  Reference of Complaint" as a hidden-field bug (those fields have no show_when, persist fine) →
  likely genuine unfilled fields or an FE section-skip. FE-core should confirm.

## FE-FIELDS AGENT — REPORTED DONE (2026-07-23) — pending orchestrator verification
- **B4 pincode** ✅ 13 `*_pincode` fields → `validation_rules.pattern:"pincode"` (6 digits);
  `fieldPatterns.js` pincode pattern; FieldRenderer digit-filter+maxLength=6; TextField gained
  maxLength/inputMode. Synced + DB-confirmed. VERIFY: empty/optional pincode still passes.
- **B7 GD alphanumeric** ✅ removed `.replace(/\D/g,'')` on `gd_no` onChange (was stripping "22A"→"22").
  Matches fir_no sibling (no filter). Low risk.
- **B8 double GD date** ⚠ FieldRenderer returns null for 5 secondary date/time keys; needs FE-core
  keysToSkip follow-up (messaged) + per-form visual verify (D3).
- **B9 UIDB age** ✅ `approx_age` (age_range TEXT) got an `age_range` pattern; 5 NUMBER age fields got
  `min:0/max:120` (FieldRenderer NUMBER branch now passes min/max; validateFieldPattern enforces).
  Synced+DB-confirmed. VERIFY: doesn't over-reject.
- **B10 inquest filed by** ✅ found real bug (boolean col vs SELECT SDM/ACP/None → silent NULL);
  changed to BOOLEAN. See D2 (needs ruling).
- **B11 perm_same** ✅ no FE defect — FE `validateSection` correctly skips hidden fields; folds into
  B3 (BACKEND `validateRequiredFields` doesn't respect show_when). Confirms B3 is backend.
- Files: FieldRenderer.jsx, TextField.jsx, fieldPatterns.js, config/fields/{case,missing,uidb,arrest}.json.
- ⚠ ran `npm run sync-config` (rewrote field_registry from disk config).

## INTEGRATION VERIFICATION (orchestrator, 2026-07-23) — all 4 agents landed + B14
- **B1 proven end-to-end via real HTTP** (auth+CSRF+controller+service+mapper+guard+DB): created a
  CASE replaying the buggy `person_type:"PERSON_VICTIM"` → DB got VICTIM+ACCUSED+COMPLAINANT (mapper
  PERSON_ strip works); PUT `persons:[]` (the exact 00:15 deletion payload) → all 3 persons SURVIVED
  (guard holds). Defense-in-depth confirmed: data is safe even if the FE race recurred.
- `npm run sync-config` idempotent (=388 fields, no storage-validation errors → config↔DB consistent).
- `npm run import:parity` GREEN (every template column resolves, all 5 record types).
- Backend health OK; no new errors (only the known out-of-scope warehouse-scheduler failure).
- Field-registry served LIVE per request (no cache) — config fixes take effect without restart.
- Test record cleaned up. Working tree: 15 files modified + this docs dir. NOT committed (awaiting review).

## POST-INTEGRATION RECONCILIATIONS (orchestrator, addressing review seams)
- **B3 has TWO submit entry points, both bugs fixed — reconciled.** FE-core's "16 clicks / 0
  `form:submit_start`" = the in-form toolbar button throwing (fixed: FormToolbar `onSubmit(e)` +
  `e?.preventDefault?.()`). But backend also logged 6× `submitRecord: failed` — all the SAME user,
  all "Missing required fields" (Name of Deceased / Is Missing Person Identified / Information
  received at P.S. / Source-Reference) — i.e. submits that DID reach the server via a different path
  (record list/detail Submit action calling the API directly), failing on the BE-records B3
  singleton-persistence bug (now fixed). Not a contradiction: two paths, two bugs, both closed.
- **`deepFlattenSchema` dedupe blast-radius — verified SAFE.** Used at 9 call sites (not just the
  property path). All consumers either look up by `field_key` (`.find`) or filter by
  `repeater_entity==='PROPERTY'` / field_key-prefix (`accused_`/`victim_`/`arrested_`) — never by the
  deduped-away `section`. `field_key` is unique per `field_registry` row (identical definition across
  the two section-copies), so dedupe-by-first removes exactly the duplicate render (B5) and drops no
  distinct field. `getExtraFields` (line 1578) keys on `repeater_entity`, confirming the property
  editor still renders each field once.
- **B1 "add new victim" backend path — proven end-to-end via HTTP.** Create CASE w/ 1 victim → PUT
  echoing it by id + a NEW victim → DB has BOTH (Sita+Gita). The id-preserving upsert inserts new,
  keeps existing. Combined with the mapper `PERSON_` strip + FE token fix, the backend half of
  "can't add new victim/accused" is closed.
- ⚠ **IMPORTANT FRAMING for the browser tester:** the B1 backend guard passing (persons preserved on
  `persons:[]`) is NOT evidence the FE fix works — the guard changes a still-broken FE's failure mode
  from "data lost" to "**add-new silently dropped**" (guard keeps old persons, ignores the new one).
  So checklist #2 (open existing/reverted record → add a victim → save → see it persist) is the REAL
  acceptance gate for B1's reported symptom, and is genuinely unverified until run in a browser.

## ✅ BROWSER E2E VERIFICATION — DONE (2026-07-25, real Chromium over CDP + real backend :5000 + Postgres)
Driven via playwright-core against bundled Chromium (the Playwright MCP's `chrome` channel can't
launch here — no system Chrome, no sudo; documented for next session). App confirmed on **Live API**
(mock mode = `production`), logged in as HC001 (Ramesh Kumar, PS Parliament Street). Every result
below is against the real DB, not mocks.

- **B1 — PASSED (the real acceptance gate, checklist #2).** Subject = SENT_BACK CASE `e00c2f6c`
  (baseline persons: COMPLAINANT `ee93caa0` Amit Jain, VICTIM `3a3d4ffa` Amit Jain, ACCUSED
  `2ece9298` Accused2 Verma).
  - Opened the **read-only view** (`/records/:id`) AND the **real edit form**
    (`/records/new/CASE?edit=<id>`); waited through the full autosave window (~13s) on each →
    **ZERO mutation requests fired, persons unchanged in DB.** The stale-closure autosave-wipe does
    not reproduce.
  - Added a NEW victim "PWTESTVICTIM" (gender Male) via the VICTIM INFORMATION modal → Save Draft →
    `PUT /api/records/<id>` (persons.len=3 = 2 victims+1 accused; complainant is a flat singleton) →
    **200**. DB after: all 3 originals **preserved by exact ID** (id-preserving upsert, not
    delete+reinsert) + new VICTIM `e5929650` PWTESTVICTIM. Nothing wiped. (Test victim then deleted;
    baseline = 3 restored.)
- **B2 — PASSED.** Workflow Transition History + "Reviewer Officer" both render **names**
  ("By: Ramesh Kumar", "By: Vikram Singh"), not UUIDs.
- **B3 — PASSED.** On the last tab, "Submit Record" fires `PUT` then `POST /records/:id/submit`,
  **no JS errors**, redirects to /records; DB status `SENT_BACK → PENDING_SHO`. (Old TypeError gone.)
  Validation panel ("N field(s) need your attention" with specific messages) confirms submit/validation
  is not silent.
- **B4 — PASSED.** `occurrence_pincode`: typing `ab12cd3456789` → `123456` (letters stripped, capped
  at 6); `110001` accepted.
- **B5/B6 — PASSED.** Property-of-Interest: AUTOMOBILES shows its sub-fields; switching to ARMS shows
  exactly its 6 fields (Type of Arm, Subtype, Make, Serial, Ammunition Count, License), each **once**,
  automobile fields **fully cleared**. **Zero React duplicate-key console warnings.**
- **B7 — PASSED.** GD Number keeps `22A` (not stripped to `22`).
- **B8 — PASSED.** MISSING and UIDB each show exactly **one** GD datetime (`DD/MM/YYYY HH:MM`) beside
  GD Number; zero standalone duplicate "GD Date" labels; date still present/fillable (no over-strip).
- **B9 — PASSED (attribute-level).** Age fields render `type=number min=0 max=120`. (Browsers don't
  clamp mid-typing — enforcement is HTML5 constraint + submit validation; bounds are correctly applied.)
- **B10 — PASSED.** UIDB "Inquest Filed by ACP / SDM?" renders as a boolean checkbox (not the old
  SDM/ACP/None SELECT). Matches D2.
- **B14 — PASSED.** `/analytics/ps-dashboard` returns **200** with `left_out` data for day/week/month
  (the ambiguous `ps_id` 500 is gone). All other analytics endpoints 200 too.

**NOT driven via full UI (lower value / blocked):** **B12b** import — the "persons vanish on open"
symptom WAS B1 (now proven fixed); the property free-typed-label→WARNING is a backend change verified
in code; a full Excel-upload drive was skipped. **B13** — still needs user clarification.
**Test-data side effects (dev DB, disposable):** `e00c2f6c` is now `PENDING_SHO` (submitted via the
real path during B3); the PWTESTVICTIM add was reverted.

## ORIGINAL manual checklist (superseded by the E2E run above; kept for reference)
Backend + data-contract + code paths are all verified. The ONLY unverified surface is live React
UI rendering/timing. **Manual test checklist (do as HC, then repeat the edit flow as HC on a
sent-back record):**
1. **B3** — open any form (CASE/ARREST/MISSING/UIDB), click Submit → it must actually submit (was
   throwing TypeError, doing nothing). Fill required fields; a real validation error must show, not silence.
2. **B1** — create a CASE with 1 victim + 1 accused; save; reopen; confirm both still there. Edit &
   save again; confirm none vanish. Then SHO send-back → HC reopens → add a NEW victim → save →
   confirm all persons persist (was silently deleting them via autosave). Cross-check with
   `SELECT role,name FROM persons WHERE record_id='…'`.
3. **B12b** — import a CASE with victim/accused/property/heinous; OPEN the imported record; confirm
   persons DON'T vanish after it sits/edits (this is the B1 autosave race applied to imports).
4. **B5/B6** — ARREST → Property of Interest: each dynamic field appears ONCE (not twice); changing
   Property Category clears the old category's fields.
5. **B8 (D3)** — MISSING/UIDB: GD Date appears once (no duplicate datetime beside GD Number). Verify
   the date is still fillable on every form that has it (regression check on the null-return).
6. **B4/B7/B9** — pincode rejects letters / accepts 6 digits; GD No accepts "22A"; UIDB age sane.
7. **B2** — workflow transition history shows names, not UUIDs (SHO + DCP/district views).

## OPEN / DEFERRED
- **B13** vague ("we may need source of information") — clarify with user.
- Property-import hardening G1/G2/G3 → registered in `docs/new-db-integration/FUTURE-IMPROVEMENTS.md §G`.
- **D1, D2** decisions below — surfaced to user.

## RECOMMENDED FIRST ACTION FOR NEXT ENGINEER
Run the manual browser checklist above (esp. #1 B3 and #2 B1) against the running app. If all pass,
resolve D1/D2, then commit. B1 is the highest-value item; its backend safety net means data can't be
lost even if a UI regression slips through.
