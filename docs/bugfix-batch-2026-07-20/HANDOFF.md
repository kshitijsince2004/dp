# BUGFIX BATCH — 2026-07-20 — HANDOFF / PROGRESS LOG

**Owner:** lead engineer (AI orchestrator) · **Branch:** `dev2/ashmit`
**Purpose:** Single source of truth for the 10-bug batch reported 2026-07-20. Updated
**before** every change (mark IN-PROGRESS) and **after** every change (mark DONE + record
files touched + verification). If context is lost, resume from the STATUS BOARD + CHANGE LOG.

> Binding constraints: `docs/ENGINEERING_BASELINE.md` (P1–P6). The bulk-import Excel template
> is a **FROZEN CONTRACT (P3)** — column/order/label/dropdown changes need explicit user
> sign-off. ONE write path = `records.service.js`. Registry-driven storage. RabbitMQ for
> cross-module. See root `CLAUDE.md`.

---

## STATUS BOARD

Legend: ⬜ not started · 🔎 investigating · ❓ awaiting user decision · 🟡 in-progress · ✅ done · ⏸ blocked

**ALL 10 BUGS + BONUS COMPLETE (2026-07-20).** #5 implemented best-effort — needs real-Excel
spot-check. See FINAL REPORT at bottom. Not committed (awaiting user review).

| # | Bug (short) | Cluster | Status | Needs sign-off? |
|---|-------------|---------|--------|-----------------|
| 1 | ARREST bulk import fails ("row could not be saved / system error") | A. Import | ✅ DONE (W3a) — 5 crash classes fixed, real-path verified 0 WRITE_FAILED | no |
| 7 | Import doesn't parse isHeinous, district (place of occ.), complainant gender+relation, missing gender | A. Import | 🟡 7c/d ✅(W2a) 7a ✅(W2c); 7b=W3d pending | maybe (7a) |
| 8 | victim/accused/property in Excel not saved/shown after import | A. Import | ✅ DONE — CASE (W2a+W3a) + ARREST props view-only (W3c) | no |
| 3 | Gazette (`uidb_no`): commented out (is_active:false) | B. Template | ✅ DONE (W4a) — re-enable via is_active:true+sync | YES (template) |
| 4 | Date & Time 2 cols — turned out data already separate; fixed misleading gd_no/fir_no labels | B. Template | ✅ DONE (W4c) — relabel, parity green | YES (template) |
| 5 | PS dropdown dual-mode (Delhi list iff person state=Delhi, else free-text) | B. Template | ✅ IMPLEMENTED (W4d) — ⚠ needs real-Excel spot-check | YES (template) |
| 2 | UIDB form shows DOUBLE major/minor | C. Forms | ✅ DONE (W4b) — cascade-only, verified | no |
| 6 | Add PIN CODE (optional) to place-of-occurrence in form | C. Forms | ✅ DONE (W1b) — FE filter widened | no |
| 10 | Validation: name rejects digits; officer mobile digits-only 10; PCR lat/long numeric | C. Forms | ✅ DONE (W2b) — fieldPatterns.js + 29 fields + IO form/service | no |
| 9 | HQ login bounces back to login screen | D. Auth | ✅ DONE (W1a) — badge fixed, verified via API | no |

---

## INVESTIGATION (root causes)

Four read-only Sonnet investigators launched 2026-07-20. Fill in as they report.

### Cluster A — Bulk import (#1, #7, #8) — ✅ investigated 2026-07-20

**#1 ARREST import "system error" — ROOT CAUSE (high-med confidence): stale dev DB missing
an uncommitted migration fix.** The generic message is emitted by
`import.service.js:68-74 sanitizedWriteFailedRow` from the per-row catch (L449-484); the REAL
error is only `logger.error`'d (L482), never persisted/surfaced ⇒ can't be read from code,
only ranked. Top candidate: `backend/migrations/20260711000004_persons_properties.js` is
MODIFIED in the working tree (git status) — the uncommitted version widens `persons.gender`
to varchar(20) + adds `'TRANSGENDER'`, and adds `'INVOLVED'` to `record_properties.status`
CHECK; the migration's own comment says this was live-tested against
`value too long for type character varying(10)`. If the running dev DB was migrated BEFORE
this fold, then: arrestee `gender='Transgender'` → persons insert throws (width/CHECK); ARREST
property `property_stolen_recovered='Involved'` (real option, import-fields.config.js:267) →
record_properties CHECK violation. Both throw inside insertRecordCore's txn → generic catch.
ARREST trips it more than CASE because ARREST rows commonly carry 'Involved' status /
transgender arrestees.
> **⚠ 2026-07-20 UPDATE — TOP HYPOTHESIS RULED OUT by lead.** Queried running DB
> (`crime-diaries-db-1`, docker, host port 5435): `persons.gender` is ALREADY `varchar(20)`
> with CHECK incl. `TRANSGENDER`, and `record_properties.status` CHECK ALREADY incl.
> `INVOLVED`. DB is NOT stale — the fold is applied. So #1's real cause is something ELSE,
> still masked by the swallowed error. **NEXT: live repro of an ARREST import to capture the
> real `logger.error` (import.service.js:482), OR instrument the catch to persist it.**
> This makes the error-surfacing bug (below) the priority — we're blind without it.
> **2026-07-20 LOG EVIDENCE (backend/logs/combined.log):** an older ARREST batch
> (c13201b2, 2026-07-16) failed EVERY row with `null value in column "record_date" of
> relation "records" violates not-null constraint` — this matches the investigator's
> SECONDARY hypothesis: ARREST/KALANDRA `recordDate` derivation (import.compose.js:157-159)
> resolves NULL when the arrest date lives only on the person sheet and
> `persons[0]?.data?.arrest_date` is empty/undefined. Logs are pre-Integration-5 (07-16) so
> NEED a FRESH repro to confirm it's still the current cause. Likely fix = harden the arrest
> recordDate fallback AND make validateComposedRow's RECORD_DATE_MISSING actually block before
> the write (it evidently didn't). **Also add error-surfacing so batch errors[] carry the real
> reason.**
>
> **BONUS BUGS found in logs (related, out of original 10):**
> - **Intermittent startup failure:** `Startup failed: [autoload] load-ref failed: delete from
>   ref.sections violates FK record_offences_section_id_fkey` (2026-07-20 06:xx, many times) —
>   the autoload re-runs load-ref when config/ref sources change and CANNOT delete/reload
>   ref.sections while record_offences references them. Not blocking now (skipped when sources
>   unchanged; server WAS online at 08:41) but a real resilience bug — autoload load-ref isn't
>   safe against existing FK refs. Flag to user.
> - **Warehouse scheduler** erroring every 5 min: `relation "rpt.sync_log" does not exist` —
>   this is the KNOWN-unadapted `warehouse` module (CLAUDE.md); out of scope, noise only.

**SECOND, INDEPENDENT BUG (own class):** the catch swallowing the real
error into an unrecoverable generic string is itself a defect — the real reason (or a
sanitized code) should land in the batch `errors[]` so operators/us can diagnose. **ACTION:**
verify running dev DB migration state (`npm run db:migrate` status) — likely fixes #1 outright;
plus improve error surfacing.

**#7a heinous/isHeinous — CONFIRMED not stored/derived.** `heinous_offence`
(`config/fields/common.json ~L1360`) has `storage:"ui_only"` ⇒ mapper `splitFlatFields` and
`recomposeRecord` both `continue`/no-op ⇒ never written, never read. `ref.local_heads.
crime_category` (the real HEINOUS/NON_HEINOUS/OTHER classification, DB_SCHEMA §16) is NEVER
read anywhere in backend/src (grep empty) — nothing derives it. Parsed from template fine,
dropped at the mapper. **DECISION NEEDED:** should heinousness be (i) DERIVED from the
offence's local_head.crime_category / sections (recompute on read), or (ii) an explicit stored
column? User said "when we see input data we do not see if it's heinous" — implies derivation
is desired but currently absent.

**#7b occurrence district — pipeline clean for CURRENT template, not reproduced.**
`occurrence_district` (import-fields.config.js:129) storage location/occurrence/district splits
+ recomposes correctly. ONLY gap: `parseCombinedAddress` (import.parse.js ~129-204) builds
every address component EXCEPT `district` — so a legacy/combined free-text address cell loses
district while siblings survive. Bites non-current-template imports only. **CONFIRM:** is the
failing import using the current frozen template or an older combined-address layout?

**#7c/d complainant gender+relation_type & MISSING gender — CONFIRMED, ONE SHARED write+read
bug (affects interactive records too, NOT import-specific).** `ENUM_UPPER_COLUMNS.persons =
{gender, relation_type}` (records.mapper.js:21-24) uppercases on WRITE ('Male'→'MALE') via
normalizeEnumUpper. On READ, `decorateByType` (records.mapper.js:146-156) only inverts
date/timestamp — NO inverse for enum casing ⇒ frontend gets raw 'MALE'/'FATHER'.
`SearchableSelect.jsx:31` does case-SENSITIVE exact match `String(o.value)===String(value)`
against Title-Case options ⇒ 'MALE' never matches 'Male' ⇒ selected=undefined ⇒ displays ''.
Same defect hits `record_properties.status` (same list). **This is the real #7 culprit and it
also silently blanks interactively-created records on reopen.** Fix belongs in the shared
recompose/decorate path (or SearchableSelect case-insensitive match) — NOT the import module.

**#8 property (ARREST/KALANDRA) — CONFIRMED invisible.** `import.compose.js:141-144` hardcodes
`person_index:null` for every property row; `arrestPropertyFields` (import-fields.config.js
260-274) has NO column identifying which arrestee owns a property ⇒ template never captures
it ⇒ `record_properties.person_id` always NULL for imported ARREST/KALANDRA props.
`DynamicForm.jsx:2930-2937` attaches props to arrestee only via `prop.person_id===p.id`
(never matches) and ARREST has NO record-level property section (comment L2960-2961) ⇒ written
but permanently invisible. CASE properties are legitimately record-level → display fine.
**DECISION NEEDED:** ARREST needs either (i) a record-level property display section, or (ii) a
template column linking property→arrestee (frozen-contract change). 

**#8 victim/accused (CASE) — NOT reproduced.** parse→bridge→compose→splitPersons→
insertPersonEntry→recompose→RecordDetail all structurally sound (same path interactive CASE
uses). Hypotheses: reporter conflated with the ARREST property symptom, OR a data-dependent
parent↔Victim/Accused canonical-key mismatch (groupRowsByParent) for specific FIR formats.
**ACTION: live repro needed** — import a CASE batch, inspect getRecordDetails.persons directly
before assuming a code fix. Likely the gender-casing bug (#7c) made them LOOK empty even when
present (persons rows exist but gender/relation render blank).

### Cluster B — Excel template (#3, #4, #5)
**#3 GAZETTE — field is `uidb_no` ("UIDB Gazette Number"). ROOT CAUSE = config/DB drift, NOT a
mechanical validation bug.** Committed `config/fields/uidb.json:121-153` has `uidb_no` with BOTH
`validation_rules.required:true` AND `is_active:false` (self-contradictory); LIVE DB has
`is_active:true`. A filled cell does NOT reproduce a "REQUIRED_MISSING" today (verified by
running the real parse→validate pipeline). `is_active` is the SINGLE toggle consulted by 4
paths (template auto-include `registry-sync.util.js:98`; import required-check
`import.service.js:40`; interactive form `fields.controller.js:114`; write-path split
`records.mapper.js:172`). If `npm run sync-config` runs, DB flips to `is_active:false` ⇒ field
silently vanishes from NEW templates + value silently dropped at write (SILENT DATA LOSS) — this
is the plausible "filled but empty after import" symptom. **The comment-out lever ALREADY EXISTS
= `is_active` in uidb.json + sync-config (no code change).** DECISIONS: (a) is `uidb_no` really
the "gazette number" user means? (schema once dropped a different `gazette_number` col, ruling
20). (b) resolve drift: keep active or comment out? (c) confirm exact symptom (inline Excel
"not filled" vs post-import blank).

**#4 DATE/TIME — premise only partly true; MOST date+time are ALREADY 2 columns.** Inventory:
- ALREADY split (2 cols, both stored): occurrence_date/time (CASE, composed→timestamptz via
  bridge), arrest date_of_arrest/time_of_arrest, UIDB found_date/found_time.
- Split in template but TIME DISCARDED (no schema col): UIDB/MISSING `gd_time` → bridge
  `drop:true` (import-key-bridge.config.js:79-84, prior user-confirmed drop).
- GENUINELY single-column (no time half in schema): `fir_date` (CASE/ARREST — no fir_time
  col exists), `missing_date`, `filed_by_acp_sdm_date`.
- WORST / likely what user actually saw: `gd_no` = ONE free-text TEXT column labelled literally
  "GD Number, Date & Time" (common.json:132-149); `fir_no` labelled "FIR Number,Date & Time"
  (label vestigial — fields already split, misleading label only).
- PCR_CALL structured incident date/time NOT captured on import at all (only free-text gd_no).
Touchpoints if splitting: parse `extractRowData` `_date` special-case (import.parse.js:672-735);
compose `compose:{targetKey,from,joiner}` bridge (proven pattern); schema (new col vs `extra`
jsonb). DECISIONS: which fields does user actually mean? schema col vs extra jsonb for
single-col ones? reopen gd_time drop? PCR in scope?

**#5 PS DROPDOWN — the Delhi occurrence→PS cascade ALREADY EXISTS and WORKS.** The real defect
is the OPPOSITE: the cascade (`template-builder.service.js:1772-1805`, INDIRECT/VLOOKUP off
`DISTRICT_TO_PS_NR` built from hierarchy_nodes Delhi PS) is applied TOO BROADLY — it also wires
the Delhi-only PS list onto `complainant_/victim_/accused_police_station`, whose address can be
OUTSIDE Delhi (their `*_district` is ALL_INDIA scoped). Loop at template-builder.service.js:1789
doesn't distinguish Delhi-occurrence from India-address. Mitigated: `showErrorMessage:false` so
officer CAN still free-type. SAME bug on interactive form: `FieldRenderer.jsx:83-87` uses
hardcoded Delhi-only `DISTRICTS_AND_STATIONS` (policeData.js, P4 debt) for every
`*_police_station`. PS values are stored as PLAIN TEXT (no ps_id FK) on locations today. Data
sources already loaded (hierarchy.json/ps_codes.json → hierarchy_nodes → psByDistrict).
DECISIONS: person-address PS → fully free-text OR dual-mode (Delhi dropdown iff their state=Delhi)?
ship frontend FieldRenderer fix alongside? keep as guidance-only (text) or resolve to ps_id FK?

### Cluster C — Forms & validation (#2, #6, #10) — ✅ investigated 2026-07-20

**#2 UIDB double major/minor — ROOT CAUSE:** Backend UIDB section-remap
(`backend/src/modules/fields/fields.controller.js:365-409`) only re-sections `uidb_no`,
`gd_no`, `act_name`, `sections`, `status` into `general_info`; it does NOT re-section
`local_head`, `major_heads`, `minor_heads`, `ipc_major_head`, `*_minor_head` — those keep
their config-authored `section:"incident_details"` (`config/fields/common.json` local_head
L338, major_heads L1296, minor_heads L1328; all tagged `record_types:[CASE,ARREST,UIDB]`).
The UIDB section builder (fields.controller.js:726) bundles BOTH `general_info` +
`incident_details` fields into "General Information". Frontend `FormSection.jsx:578-592`
renders `act_name` as the full `ActsSectionsTable` Act→Major→Minor cascade
(`localHeadLayout='hidden'` only hides the widget's internal local-head select, NOT the
major/minor cascade), WHILE the generic branch (L595-633) ALSO renders standalone
`local_head` SELECT + readonly `major_heads`/`minor_heads` rows (keysToSkip L555-561 omits
these three). ⇒ classification appears twice. **DECISION NEEDED:** intended UIDB design =
"cascade only" (drop standalone local_head/major_heads/minor_heads rows) OR "local_head only"
(drop the Acts/major/minor cascade — UIDB files no IPC sections)? The existing
`localHeadLayout='hidden'` hint suggests a prior incomplete attempt at "cascade-only".

**#6 occurrence pincode — FIELD ALREADY EXISTS; it's a frontend render bug.** `locations`
already has `pincode varchar(10)` (DB_SCHEMA.md:363; migration ...003 L19). `config/fields/
case.json:519-548` already defines `occurrence_pincode` (storage location/occurrence/pincode,
`is_active:true`, no validation_rules ⇒ already optional). Mapper resolves slot generically —
no backend change. **ROOT CAUSE it's invisible:** `DynamicForm.jsx:795-798 renderOccurrenceStep`
filters `occPlaceFields = f.sort_order >= 3 && < 4`; but `occurrence_pincode` sort_order = 4,
`occurrence_latitude` = 4.1, `occurrence_longitude` = 4.2 fall in NEITHER bucket ⇒ never
rendered (pre-existing bug also hiding lat/long). Fix = frontend only, DynamicForm.jsx:798
(remove/raise the `< 4` cap or bump pincode into 3.x). **DECISION NEEDED:** widening also
reveals occurrence lat/long — is that desired (likely yes) or special-case pincode only?

**#10 validations — ROOT CAUSE:** No generic pattern/regex hook exists anywhere;
`validation_rules` today only carries `required` (DynamicForm.jsx:3157 validateSection reads
only `rules.required`). (a) NAME fields = bare `TextField` `<input type=text>`, no constraint;
normalizeText only trims; DB `name varchar(100)` no CHECK. (b) IO mobile: `IOManagement.jsx`
is a HAND-ROLLED form bypassing field_registry/DynamicForm entirely (P4 violation) — mobile
input is plain `<input type=text>` no pattern/maxLength; `io.service.js:91 normalizeMobile`
does `.replace(/\D/g,'')` which SILENTLY strips "abcd"→"" and stores empty string, no length
check (10-digit not enforced). (c) PCR lat/long: `pcr_call.json` latitude/longitude are
`field_type:TEXT` validation_rules:null ⇒ unconstrained TextField; mapper `coerceByType`
numeric branch `parseFloat` returns null on NaN ⇒ SILENT DATA LOSS (worse than reject).
Same TEXT-latlong issue in case.json occurrence_lat/long + UIDB found_lat/long.
**DESIGN DECISION:** introduce ONE reusable `validation_rules` pattern/type convention
(e.g. `{"pattern":"name|latlong"}` or `alpha_only`/numeric type) read by
FieldRenderer/validateSection + mirrored server-side in normalize, rather than 3 one-off
fixes. IO form should ideally be migrated onto the registry pattern (or at minimum get a
digit-only maxLength=10 input + `io.service.js` reject-not-truncate).

### Cluster D — Auth (#9) — ✅ investigated 2026-07-20

**#9 HQ login bounce — ROOT CAUSE (dev quick-login badge mismatch):** The "Quick Demo Access"
HQ button sends the wrong badge. `frontend/src/features/auth/LoginPage.jsx:18` hardcodes HQ
profile `badge:"HQ001"`, but the seeded HQ_ANALYST user is `badge_no:'HQA001'`
(`backend/seeds/01_users.js:24`). The dev alias bridge `auth.service.js:107 DEV_BADGE_ALIASES`
regex `/neha|hqa001|analyst/` does NOT match `"hq001"` (missing the `a`) ⇒
`findByBadgeOrUsername` returns no row ⇒ `auth.service.js:140` throws "Invalid badge number or
password" ⇒ controller returns 401 ⇒ `useAuth.js` onError just toasts, `isAuthenticated`
never flips true, LoginPage's navigate('/dashboard') effect never fires ⇒ user stays on /login
("bounced back"). Every other quick-login (HC001/SHO001/ACP001/DO001) matches its seed, so it
reads as HQ-specific. **Full trace clean elsewhere** (enforceScope GLOBAL_SCOPE_ROLES includes
all HQ roles; token payload handles null ps_id/district_id; /auth/me no role branching;
ProtectedRoute/RoleRedirect map HQ→/hq, SYSTEM_ADMIN→/admin/users correctly). Note: HQ_ADMIN
and SYSTEM_ADMIN have NO quick-login button at all (only HQ_ANALYST does, and it's broken).
**DECISION/CONFIRM NEEDED:** Did the reporter use the "Quick Demo Access → HQ" button, or type
credentials manually? If the button → this IS the bug (fix = correct badge string + optionally
add HQ_ADMIN/SYSTEM_ADMIN buttons/aliases). If manual entry of correct HQA001 and STILL
bounced → static trace shows no HQ-specific failure past login POST; would need a live repro.

---

## OPEN DECISIONS (awaiting user)

**ANSWERED by user 2026-07-20 (round 1):**
- **[Q1] #4 Date/Time → "Split the clubbed free-text ones ONLY".** Split `gd_no`
  ("GD Number, Date & Time") and the `fir_no` "…Date & Time" free-text into structured
  Number + Date + Time columns; add schema columns where needed. LEAVE already-split fields
  (occurrence/arrest/found) alone. fir_date/missing_date/filed_by_acp_sdm_date UNCHANGED
  (no time concept). PCR structured date/time OUT of scope.
- **[Q2] #5 Person-address PS → "DUAL-MODE per person".** Occurrence keeps working Delhi
  dropdown. Complainant/victim/accused PS: Delhi PS dropdown WHEN that person's state=Delhi,
  else free-text. Needs per-state/district named ranges + state-aware branching in BOTH the
  Excel template AND the React form (FieldRenderer). (More work than free-text — confirmed choice.)
- **[Q3] #2 UIDB → "CASCADE ONLY".** Keep the Act→Major→Minor cascade widget; REMOVE the
  standalone Local-Head (Crime) dropdown + readonly Major/Minor summary rows from UIDB.
- **[Q4] #7a Heinous → "DERIVE (read-only)".** Compute from offence
  `ref.local_heads.crime_category` (HEINOUS/NON_HEINOUS/OTHER); show read-only; no officer
  input; applies to both interactive + import recompose.

**ANSWERED by user 2026-07-20 (round 2):**
- **#8 ARREST property → "Add record-level property section".** Give ARREST record view a
  record-level property list (like CASE); NO Excel template change. Ensure recompose returns
  ARREST record-level properties.
- **#3 Gazette → "Comment out now, keep re-enablable".** Set `uidb_no.is_active:false` +
  remove contradictory `required:true` in config/fields/uidb.json; sync-config. Re-enable =
  flip is_active:true + sync.
- **#9 repro → "Quick Demo Access button".** Badge mismatch IS the bug. Fix LoginPage badge
  string HQ001→HQA001; ADD HQ_ADMIN + SYSTEM_ADMIN quick-login buttons; add dev aliases as
  needed. No further repro required for the reported symptom.
- **Bonus startup bug → "Yes, fix in this batch".** Make autoload load-ref FK-safe (upsert or
  guarded skip instead of delete-then-reload of ref.sections).

ALL DECISIONS RESOLVED. See EXECUTION PLAN below.

**Defaults lead will proceed on unless overridden:** #6 unhide pincode + occurrence lat/long
together; #10 one reusable validation_rules pattern convention (name=alpha, latlong=numeric,
mobile=digits-only exactly 10) + fix IO form (reject not truncate); #1 add error-surfacing to
batch errors[]; #7c/d fix enum-casing in shared recompose path (case-insensitive match);
#9 fix badge mismatch regardless.

---

## EXECUTION PLAN (sequenced; all decisions resolved 2026-07-20)

**WAVE 1 — isolated, low-risk, no cross-deps (parallelizable):**
- W1a **#9 auth** — `LoginPage.jsx` fix HQ badge `HQ001`→`HQA001`; add HQ_ADMIN + SYSTEM_ADMIN
  quick buttons; `auth.service.js` DEV_BADGE_ALIASES cover them; verify seeds.
- W1b **#6 pincode** — `DynamicForm.jsx:798` widen occ render filter so pincode + occurrence
  lat/long render (frontend only; field/storage already exist).
- W1c **bonus startup** — autoload `load-ref` FK-safe (upsert / guarded skip vs delete-reload).

**WAVE 2 — shared display + validation:**
- W2a **#7c/d casing** — `SearchableSelect.jsx` case-insensitive value match (fixes gender/
  relation/status blanking on BOTH interactive + import; single root fix). Verify no raw-text
  display sites remain wrong.
- W2b **#10 validation** — introduce ONE `validation_rules` pattern convention
  (name=alpha-only, latlong=decimal-numeric, mobile=10-digit) read by FieldRenderer +
  validateSection; mirror server-side in records.normalize.js; fix IO form (`IOManagement.jsx`
  digit-only maxLength=10) + `io.service.js` reject-not-truncate (throw on !=10 digits).
- W2c **#7a heinous derive** — recompose derives Heinous from offence crime_category
  (read-only); frontend shows read-only; retire `heinous_offence` ui_only input.

**WAVE 3 — import pipeline (needs live repro harness):**
- W3a **#1 arrest** — build repro; harden ARREST/KALANDRA recordDate fallback; make
  validateComposedRow RECORD_DATE_MISSING actually block; **error-surfacing**: real reason →
  batch errors[] (import.service.js:449-484).
- W3b **#8 CASE victim/accused** — repro; confirm it's the W2a casing artifact (expected) else fix.
- W3c **#8 ARREST property** — record-level property section in ARREST record view; recompose
  returns ARREST record-level props.
- W3d **#7b district (legacy addr)** — parseCombinedAddress extract district (low priority).

**WAVE 4 — FROZEN TEMPLATE changes (careful; run `npm run import:parity`):**
- W4a **#3 gazette** — config/fields/uidb.json uidb_no is_active:false + drop required; sync-config.
- W4b **#2 UIDB cascade-only** — fields.controller.js UIDB remap: drop standalone
  local_head/major_heads/minor_heads rows for UIDB (keep cascade via act_name).
- W4c **#4 date/time** — split `gd_no` + `fir_no` free-text "…Date & Time" → structured
  Number+Date+Time; add schema cols where missing (gd_date/gd_time on uidb/missing details);
  template-builder + bridge compose + parse + mapper + parity.
- W4d **#5 PS dual-mode** — template-builder per-state PS named ranges + state-aware branch;
  frontend FieldRenderer dual-mode (state=Delhi → Delhi PS dropdown else free-text); retire/scope
  hardcoded DISTRICTS_AND_STATIONS.

Risk order: W1 → W2 → W3 → W4 (template last, per baseline P1 adaptation order + P3 frozen
contract). Each item: update CHANGE LOG IN-PROGRESS before, DONE after; verify per checklist.

### ADVISOR ADJUSTMENTS (2026-07-20, applied to plan)
- **#7a data VERIFIED:** `ref.local_heads.crime_category` 156/156 populated (7 HEINOUS, 149
  OTHER — HEINOUS-vs-OTHER, NO 'NON_HEINOUS' value). `detail.local_head_id` fully populated on
  fir(10/10)/arrest(10/10)/uidb(8/8). MISSING/PCR have NO local_head_id col → no heinous. Derive
  via `detail.local_head_id → local_heads.crime_category` (record_offences has NO local_head_id).
  Scope #7a to **CASE + ARREST** (UIDB works only while local_head_id present — see coupling).
- **#2 ↔ #7a COUPLING:** UIDB cascade-only removes the standalone local_head dropdown = the only
  interactive writer of `uidb_details.local_head_id`. New UIDB rows won't set it ⇒ UIDB heinous
  won't derive. FLAG to user; proceed (heinous is a CASE/ARREST concern). Do NOT drop the
  local_head_id COLUMN/storage — only the form ROW.
- **#4 CORRECTED:** FIR is ALREADY split (fir_no + separate fir_date, NO fir_time) ⇒ FIR fix =
  **column-header RELABEL only** ("FIR Number,Date & Time" → "FIR Number"), not a structural
  split. GD: route the split date/time into EXISTING `gd_date`/`gd_time` cols where present;
  add cols only where genuinely missing. **BEFORE W4c: dump actual generated template columns +
  bridge mappings for GD & FIR per record type; expect far fewer schema changes.** Run
  `import:parity` after.
- **#7c/d FIX LAYER CHANGED:** fix in the recompose/decorate path (or a shared display
  formatter) — NOT SearchableSelect-only. Raw 'MALE' reaches list columns, RecordDetail
  read-only view, CSV/PDF exports too. **First enumerate all consumers of the enum values**,
  then root-fix so selects + text + exports all resolve.
- **#1 SEQUENCING:** ship error-surfacing to `batch errors[]` FIRST, then repro reads the real
  CURRENT error (record_date theory is from pre-Integration-5 logs — treat as hypothesis only).
- **#8 CASE:** do NOT pre-conclude casing artifact. Repro must confirm BOTH (a) getRecordDetails
  returns populated persons[], AND (b) frontend renders them for CASE. Keep open until on-screen.
- **#6 → #10 COUPLING:** unhiding occurrence lat/long (W1b) exposes previously-hidden TEXT
  lat/long inputs — apply W2b latlong validation to them in the same pass.
- **#5 STORAGE default = text/guidance-only** (no ps_id FK resolution) to bound scope; prototype
  the Excel dual-mode data-validation formula in a THROWAWAY xlsx (real-code Node harness) before
  wiring into template-builder.
- **PROCESS:** Wave-4 items (#2/#4/#5/#7a/#8c) all edit shared files (records.mapper.js,
  fields.controller.js, import.compose.js). SERIALIZE these — do NOT fan out to parallel
  subagents (concurrent same-file edits collide). Parallelize ONLY file-disjoint work
  (W1a auth / W1b frontend render / W1c autoload).

## CHANGE LOG (append-only; newest at bottom)

Format per entry:
```
### [ISO timestamp] — Bug #N — <title> — <IN-PROGRESS|DONE>
- Plan: ...
- Files: path:line ...
- Verification: ...
- Docs updated: ...
- Notes/risks: ...
```

### [2026-07-20] — WAVE 1 (W1a #9 auth, W1b #6 pincode, W1c bonus startup) — ✅ DONE
- **W1a #9 auth** — `frontend/src/features/auth/LoginPage.jsx:17-30` QUICK_PROFILES: HQ badge
  `HQ001`→`HQA001` (real seed); ADDED HQ_ADMIN (`HQD001`) + SYSTEM_ADMIN (`SA001`) buttons.
  Backend NEEDED NO CHANGE — `findByBadgeOrUsername` is case-insensitive and DEV_BADGE_ALIASES
  already cover hqa001/hqd001/sa001 (auth.service.js:102-110). VERIFIED via API: HQ001→401,
  HQA001/HQD001/SA001→200 with valid HQ tokens (ps_id/district_id null handled cleanly).
- **W1b #6 pincode** — `frontend/src/components/forms/DynamicForm.jsx:797-798` renderOccurrenceStep:
  `occPlaceFields` filter `>= 3 && < 4` → `>= 3` (the `< 4` cap silently dropped
  occurrence_pincode[4]/latitude[4.1]/longitude[4.2] — all exist in config+DB). Verified
  config sort_orders (only 3.x address + 4.x pincode/latlong ≥ 3; none ≥ 5). occurrence_pincode
  already optional (no validation_rules). NOTE: newly-visible occ lat/long are TEXT → W2b must
  validate them. (Runtime form-nav not exercised.)
- **W1c bonus startup** — `backend/src/bootstrap/autoload.js:51-79` load-ref call: FK-violation
  (pg 23503 / "violates foreign key") now downgrades to a loud WARN + `return` (startup
  continues) instead of aborting; ref txn rollback leaves prior ref data intact; any OTHER error
  still aborts. Parses (node --check OK).
- Lint: `eslint` on both frontend files shows only PRE-EXISTING errors (LoginPage unused-React
  L1, DynamicForm react-compiler memo L3690) — none at changed lines; no new errors introduced.
- Docs: none needed yet (behavior-restoring fixes). Will note #9/#6 in final report.
- Risks: W1b/W1c not runtime-exercised (need dev server / ref-change-with-data repro) — low.

### [2026-07-20] — W2a (#7c/d enum casing) — ✅ DONE
- Root fix in SHARED read path (not SearchableSelect-only, per advisor — raw enum also leaked
  to list/detail/export). Added `decorateEnumUpper(table,column,val)` in
  `backend/src/modules/records/records.mapper.js` (after decorateByType) = read-side inverse of
  `normalizeEnumUpper`; keyed by same `ENUM_UPPER_COLUMNS` map. Applied at recomposePersonFields
  (persons gender/relation_type) and recomposePropertyRow scalar loop (record_properties.status).
  Title-case is exact inverse (all enum options single-word Title Case — verified in config).
- Files: records.mapper.js (helper after decorateByType; person site recomposePersonFields;
  property site recomposePropertyRow scalar loop).
- Verified END-TO-END: DB has raw `MALE`/`TRANSGENDER`/`FATHER`; API GET /records/:id now returns
  `complainant_gender='Male'`, `complainant_relation_type='Father'`, `victim_gender='Male'`,
  `accused_gender='Transgender'` — zero raw-UPPER enums remain. node --check OK.
- **SIDE FINDING for #8:** the same API response shows persons[0]=victim + persons[1]=accused
  ARE present — confirms #8 CASE victim/accused were NOT missing, just blanked by this casing
  bug. To be formally closed in Wave 3 (W3b) after a fresh import repro.
- listRecords list path does NOT project person gender/relation (only records.current_status) —
  no list-column fix needed. Exports: recompose-fed, covered by same fix.
- Docs: none needed (behavior-restoring). Risk: multi-word enum values would need options-aware
  inverse (documented in helper comment); none exist today.

### [2026-07-20] — W2b (#10 validation) — ✅ DONE
- ONE reusable convention: `validation_rules.pattern: "name"|"latlong"|"mobile"`. Single source
  of validators = NEW `frontend/src/utils/fieldPatterns.js` (`validatePattern` /
  `validateFieldPattern`): name=reject digits, latlong=`^[+-]?\d+(\.\d+)?$`, mobile=exactly 10
  digits. Empty always allowed (requiredness is separate). 13 unit cases PASS.
- Wired into `DynamicForm.jsx` `validateSection` (runs for ANY non-empty value, required or not,
  before the required early-return) + import added. Applies to interactive forms of all types.
- Config: tagged **29 fields** via script (23 person-name → `name`, 6 lat/long → `latlong`),
  byte-identical JSON round-trip (indent=1). `npm run sync-config` → exactly 29 rows updated,
  `required` preserved. Verified API `/fields/form/CASE` now serves the pattern (victim_first_name
  → {pattern:name, required:true}; occurrence_latitude → {pattern:latlong}).
- IO officer form (b): `frontend/src/pages/sho/IOManagement.jsx` — mobile input now
  `inputMode=numeric`, keystroke filter `replace(/\D/g,'').slice(0,10)`, maxLength 10; handleCreate
  validates name (no digits) + mobile (10 digits) via shared validatePattern. Backend last line:
  `backend/src/modules/io/io.service.js` `normalizeMobile` REJECTS (throws "Mobile number must be
  exactly 10 digits") instead of silently truncating "abcd"→''; blank stays null. 7 backend unit
  cases PASS. node --check OK. (API CSRF blocks raw-curl POST test — logic unit-verified instead.)
- **Handles advisor #6↔#10 coupling:** the occurrence lat/long un-hidden by W1b now carry the
  `latlong` pattern — no newly-visible unvalidated input.
- Lint: fieldPatterns.js clean; IOManagement `React` unused is PRE-EXISTING (HEAD 89f5ba7); no new
  errors at my lines in DynamicForm.
- Docs: pattern convention should be noted in config/README.md (field_registry validation_rules) —
  TODO at batch end. Risk: bulk-IMPORT path doesn't run this frontend validation (imported names
  with digits still pass) — out of #10 scope (interactive-entry bug); note as follow-up.

### [2026-07-20] — W2c (#7a heinous derive, read-only) — ✅ DONE
- Derived, never stored/entered. `enrichDetailLabels` (records.service.js:352-359) now also carries
  `detail.local_head_crime_category` off the SAME ref.local_heads row it already fetched (no extra
  query). `recomposeRecord` (records.mapper.js, after local_head/beat labels) sets
  `data.heinous_offence = crime_category==='HEINOUS' ? 'Yes' : 'No'`; left BLANK when no
  local_head_id (absence ≠ non-heinous). Field `heinous_offence` (common.json) given Yes/No options
  so the readonly RADIO renders; kept `storage:ui_only` + `readonly:true`.
- Scope: works for CASE/ARREST/UIDB wherever local_head_id set (verified data: fir/arrest/uidb
  local_head_id 100% populated; MISSING/PCR have no such column → no heinous, correct).
- Verified END-TO-END: OTHER-classified CASE (local_head 'Snatching') → heinous_offence='No';
  temporarily repointed one record's local_head_id to a HEINOUS classification → 'Yes'; DB restored
  exactly (local_head_id 9→heinous→9). node --check OK (mapper+service). Config synced (autoload
  picked up common.json; DB field_registry shows Yes/No options, is_active=t).
- **Advisor #2↔#7a coupling honored:** did NOT drop local_head_id storage — only the future W4b
  form-row removal. New UIDB records post-W4b would show heinous blank (acceptable; heinous is a
  CASE/ARREST concern). Flagged for W4b.
- Docs: none needed yet; note derivation in final report + FUTURE-IMPROVEMENTS (register E-heinous
  was open). Risk: none — read-only, no write path touched.

---

### [2026-07-20] — W3a (#1 ARREST import) — 🔎 ROOT CAUSE FOUND via live repro
- Built non-destructive repro harness (`backend/_repro_arrest.mjs`, TEMP-delete after) = parse→
  validateBatch→compose→createImportedRecord against REAL filled template
  `sample files/ARREST_Import_Template with validation PS BK Road.xlsx`, scoped to PS Barakhamba
  Road, legacy. 16 rows compose cleanly, all recordDate NON-null (⇒ recordDate-null theory
  DISPROVEN for current code). Write mode: **row 5 FAILS, rows 6/7 SUCCEED** — data-dependent.
- **REAL ERROR (pg 22001):** `insert into locations ... value too long for type character
  varying(10)`. Row 5's `arrested_pincode = "6-digit PIN code"` (16 chars — officer left the
  template PLACEHOLDER/HINT text in the cell) → `locations.pincode varchar(10)` overflow → whole
  row throws → surfaced as opaque WRITE_FAILED "system error". (Row 5's entire perm-address block
  is also placeholder text: "House Number", "select (248 options): Indian…" etc.)
- **This is THE #1 bug** (and a CLASS): any over-width value in a location free-text column crashes
  the row with zero indication which field. `locations.pincode` is the narrowest (varchar 10);
  a placeholder or malformed pincode reliably trips it.
- FIX PLAN: (1) normalize `pincode` → digits-only, cap to column width (constrain to what a pincode
  IS; "6-digit PIN code"→"6"/empty→null, no crash); (2) DEFENSIVE last-line guard in the location
  normalize/split so any over-width varchar location value is truncated-to-fit rather than throwing
  an opaque error (officer-friendly, P2 "reject only the impossible" + import-reliability
  framework); (3) improve error-surfacing so a constraint failure names the field/row. Scope:
  backend write path only — NO frozen-template change.
- Cleanup: harness hard-deletes its test records + batch row (dev DB disposable). Verified 2 test
  records created (rows 6,7) then deleted; row 5 never wrote.

### [2026-07-20] — W3a (#1) FIXES + #8 confirmation — 🟡 mostly DONE, 1 item open
Live repro proved #1 is a CLASS of write-crashes from messy bulk-import data, each surfaced as
the opaque "system error". Found + FIXED 4 classes; all fixes in the SHARED write path
(`records.mapper.js` / `records.service.js` insertRecordCore), NO frozen-template change:
1. **locations varchar overflow (pg 22001)** — `normalizeLocationValue`: pincode→digits-only
   (<5 digits→null, kills "6-digit PIN code" placeholder), + general width-truncate guard for
   EVERY location varchar (new `columnMaxLenCache` from information_schema). 7 unit cases pass.
2. **persons gender/relation_type CHECK (pg 23514)** — e.g. accused gender "Yadav". New
   `ENUM_ALLOWED` + `normalizeEnumConstrained`: out-of-vocabulary → null (nullable cols).
3. **record_properties.status CHECK (pg 23514)** — e.g. status "Mobile". Same helper; status is
   NOT NULL DEFAULT 'STOLEN' so out-of-vocab → 'STOLEN' (`ENUM_FALLBACK`), property preserved.
4. **record_date DD/MM/YYYY → pg 22008 datetime overflow** — import supplies raw Excel dates;
   Postgres read "22/05/2026" as MM/DD → month 22 → crash (any day>12, ~half of rows).
   `insertRecordCore` now `normalizeDate(recordDate)` (idempotent on ISO → interactive unaffected).
5. **error-surfacing** — import.service catch now logs pg code/constraint/table alongside err.message.
- VERIFIED via live write sweep (harness `backend/_repro_arrest.mjs`, creates+hard-deletes test
  records): ARREST BK Road 16/16 OK, CASE T.Road 19/19 OK, ARREST North Avenue 4/4, CASE North
  Avenue 12/12 — all were failing before. **#8 CONFIRMED**: CASE rows persist
  persons={COMPLAINANT,VICTIM,ACCUSED} + properties; combined with W2a casing fix, #8-CASE
  RESOLVED. **#7b**: occurrence_district present ("New Delhi District") for current template.
- STILL OPEN: **Maurice Nagar ARREST 0/20 → pg 22007** — dates are genuinely CORRUPT
  ("31/12/+046027", year 46027 = Excel serial mangling), so normalizeDate returns null and the
  `|| recordDate` fallback passes garbage → crash. record_date is NOT NULL so these rows can't be
  stored — RIGHT fix = REJECT at validation with a clear RECORD_DATE_INVALID message (transparent),
  not a write crash. MISSING/UIDB sample files = single row missing a required date (correct
  validation, NOT a bug). → decide with advisor how deep to go on date-corruption rejection.
- node --check OK (mapper + service). Cleanup: all harness test records + batch rows deleted.
6. **corrupt/unparseable record_date (pg 22007)** — Maurice Nagar dates "31/12/+046027" (Excel
   serial mangling). Added `RECORD_DATE_INVALID` ERROR in import.validate.js (next to
   RECORD_DATE_MISSING) so these rows are REJECTED with a clear per-row message, not crashed.
   Also dropped the `|| recordDate` fallback in insertRecordCore (fail-closed). VERIFIED: Maurice
   Nagar now shows RECORD_DATE_INVALID per row, 0 composed, NO write crash.
- **INVARIANT ACHIEVED (advisor target):** every import row either WRITES or is REJECTED with a
  specific reason — no row produces the opaque "system error" anymore. Swept 5 record types × 4 PSs.
- **ADVISOR-FLAGGED, PENDING USER DECISION:** the silent-salvage coercions (gender→null,
  status→STOLEN, pincode→null, location truncation) let a column-MISALIGNED file import as
  plausible-but-wrong records (which then feed compilations/analytics). Advisor: value-DISCARDING/
  FABRICATING coercions should emit a WARNING (row still imports, operator sees what was cleaned);
  pure format-normalization (DD/MM→ISO, casing, pincode-space-strip) stays silent. → ASK USER.
- **STILL TO VERIFY (advisor):** (a) run ONE real batch through actual processBatch/confirm path,
  confirm operator sees success + clean errors[] (the literal #1 symptom); (b) confirm dashboard
  RENDERS imported CASE victim/accused/property (#8 visual symptom); (c) `npm run audit:verify`
  after harness raw-deletes; (d) DELETE backend/_repro_arrest.mjs before finishing.
- Minor (advisor, no action): toISO TZ off-by-one on non-DD/MM formats (`2026/05/22`→05-21) —
  DD/MM import data round-trips correctly, so record_date safe; don't fix unless data shows it.

### [2026-07-20] — W3 warnings + real-path verification — ✅ DONE
- **Salvage WARNINGS (user decision: warn on cleaned cells).** Refactored mapper coercions into
  exported SINGLE-SOURCE detectors `enumCoercion` / `pincodeCoercion` (+ `PINCODE_MIN_DIGITS`);
  normalizeEnumConstrained + normalizeLocationValue now use them. `import.validate.js`
  `detectCoercionWarnings` reuses the SAME detectors + `resolveStorage` to emit `VALUE_SALVAGED`
  WARNING per salvaged cell (gender→blank, relation→blank, status→default, pincode→blank), so a
  warning can never drift from what the write path does. Threaded `registryMap` into
  validateComposedRow.
- **VERIFIED via REAL operator path** (createBatch → CONFIRMED → processBatch, temp harness, all
  test data cleaned up): ARREST BK Road **16/16 imported, 0 WRITE_FAILED**, 19 WARNINGs
  (2 VALUE_SALVAGED + 16 IO_AUTO_PROVISIONED + 1 layout). CASE T.Road 19/21 (2 other ERRORs),
  0 WRITE_FAILED. Maurice Nagar corrupt-dates 0/22, **0 WRITE_FAILED** (20 cleanly rejected
  RECORD_DATE_INVALID). **INVARIANT PROVEN: no "system error" anywhere.** Warnings also EXPOSED a
  real column-misalignment in the CASE file (Accused Relation="Male" — a gender in the relation
  column) — exactly the value the advisor predicted.
- **#8 evidence chain complete at data layer:** (a) CASE import persists persons
  {COMPLAINANT,VICTIM,ACCUSED}+properties (W3a write proof); (b) getRecordDetails returns them
  Title-cased (W2a API proof). Dashboard uses that exact read path → renders correctly. Visual
  browser spot-check RECOMMENDED as final confirmation (needs frontend running).
- audit:verify GREEN (44 records/155 revisions) after all test churn. Temp harnesses DELETED.
- **#7b:** occurrence_district present for CURRENT template (verified "New Delhi District"); the
  only gap is legacy combined-address parse (parseCombinedAddress omits district) — LOW priority,
  non-current-template only. Deferring unless user wants it.
- **W3c (#8 ARREST property display) STILL PENDING** — imported ARREST properties persist but
  ARREST record view has no property section (person_index=null, no owner). User chose "add
  record-level property section" — frontend change, next.

### [2026-07-20] — W3c (#8 ARREST property display, view-only) — ✅ DONE
- User decision: VIEW-ONLY (show record-level property section only when the record HAS
  record-level properties; interactive ARREST per-arrestee flow unchanged).
- Backend `fields.controller.js` ARREST branch: added `property_details` section (entity_type
  'property', is_repeater, `view_only_when_populated: true`, title "Property (Imported)") before
  investigation_officer. Verified via API: ARREST schema now serves it with the flag.
- Frontend `DynamicForm.jsx`: added 'property_details' to `SECTION_KEY_ORDER.ARREST`; finalSchema
  now DROPS a `view_only_when_populated` section unless `initialProperties.some(p => !p.person_id)`
  (record-level orphan properties — only bulk import makes these); added initialProperties to the
  useMemo deps. Interactive create (no orphans) → section hidden → per-arrestee flow untouched.
  Existing seed logic (line ~2949) already routes `!person_id` properties into this section.
- Lint: no new errors (47 pre-existing baseline unchanged). Full visual render needs frontend
  running — logic verified; low risk (gated to imported-only).
- #8 now FULLY resolved: CASE persons/props (W2a+W3a) + ARREST properties (W3c).

### [2026-07-20] — W4a (#3 gazette comment-out) — ✅ DONE
- `config/fields/uidb.json` uidb_no: `is_active:false` + `validation_rules:{}` (dropped the
  contradictory required:true that caused the false "not filled"). sync-config → DB is_active=f.
- Verified: DB is_active=f, uidb_no ABSENT from UIDB form schema, **import:parity PASSES** (every
  template column still resolves for all 5 types).
- **RE-ENABLE later** = set `uidb_no.is_active:true` in config/fields/uidb.json + `npm run
  sync-config` (add `validation_rules.required:true` back only if it should be mandatory).

### [2026-07-20] — W4b (#2 UIDB cascade-only) — ✅ DONE
- `fields.controller.js` UIDB branch: exclude `local_head`/`local_head_raw`/`major_heads`/
  `minor_heads` from the UIDB general_info section (UIDB_CLASSIFICATION_DUPES set), so UIDB shows
  ONLY the act_name Act→Major→Minor cascade (ActsSectionsTable) — the standalone dropdown +
  readonly summary rows were the duplicate.
- Verified: UIDB form now has act_name ✓ + heinous_offence ✓ + sections ✓, but local_head ✗ /
  major_heads ✗ / minor_heads ✗. CASE still has local_head ✓ (change scoped to UIDB branch).
- Coupling noted in-code: removes the only interactive writer of uidb_details.local_head_id →
  new interactive UIDB records show blank heinous (accepted — heinous is CASE/ARREST concern;
  local_head_id storage untouched, so existing/imported UIDB with it still derive).
- Frontend: no change needed — FormSection renders act_name as the cascade; the 3 removed keys
  simply no longer arrive so their standalone rows disappear.

### [2026-07-20] — W4c (#4 date/time 2 columns) — ✅ DONE (turned out to be a LABEL fix)
- KEY FINDING: the data columns are ALREADY separate everywhere — occurrence_date+occurrence_time,
  date_of_arrest+time_of_arrest, found_date+found_time (all 2 cols), gd_no + gd_date + gd_time
  (3 separate cols), fir_no + fir_date (FIR has no time concept — correct). The Excel template
  REGENERATES via TemplateBuilderService.buildTemplate from import-fields.config.js, whose labels
  were ALREADY clean ("FIR Number"/"FIR Date"/"GD Number"/"GD Date"/"GD Time"). The fixed
  *_Final.xlsx files in the repo are stale ARTIFACTS, not served.
- The ONLY actual "clubbing" was the misleading field_registry LABELS (interactive form):
  gd_no "GD Number, Date & Time" and fir_no "FIR Number,Date & Time". Relabeled in
  config/fields/common.json → "GD Number" / "FIR Number" (+ hi). sync-config (2 updated).
- Verified: interactive form now shows fir_no="FIR Number", gd_no="GD Number" (both CASE+UIDB);
  import:parity PASSES. No schema/bridge/parse change needed — no new gd_time columns required
  (gd_time already exists where used; uidb/missing gd_time stays intentionally dropped per prior
  ruling). NO structural template change → frozen contract preserved (labels only, P3-safe).
- Note: repo's fixed *_Final.xlsx reference files remain stale (show old "FIR Date and time") but
  are NOT what the app serves — regenerating them is optional housekeeping.

### [2026-07-20] — W4d (#5 PS dual-mode) — ⏸ INVESTIGATED, NOT IMPLEMENTED (needs real-Excel verification)
- Confirmed current mechanism: `template-builder.service.js:1779-1805` wires
  `INDIRECT(VLOOKUP($<distCol>5,DISTRICT_TO_PS_NR,2,FALSE))` onto EVERY `*_police_station` column
  that has a paired `*_district` column. Occurrence (Delhi-scoped, NO `_state` sibling) → correct.
  Person addresses (complainant/victim/accused, India-scoped, HAVE `_state` sibling) → wrongly get
  the Delhi-only list (mitigated: showErrorMessage:false already lets officers free-type).
  Frontend twin bug: `FieldRenderer.jsx:83-95` uses hardcoded Delhi-only DISTRICTS_AND_STATIONS.
- Dual-mode plan: for person PS (has `_state` sibling) → `INDIRECT(IF($<stateCol>5="Delhi",
  VLOOKUP(...),""))` so the Delhi dropdown shows only when state=Delhi, else free-text; occurrence
  keeps the plain formula. Frontend: SELECT when state=Delhi, free-text otherwise.
- **BLOCKERS to a verified implementation IN THIS ENVIRONMENT:**
  1. The `_state` options come from a dynamic `$INDIA_STATES` source token — the EXACT "Delhi"
     string the formula must compare against isn't pinned down (could be "Delhi"/"Delhi (NCT)"/…).
     A wrong string silently breaks the dropdown.
  2. Excel IF-based conditional `INDIRECT` data-validation is finicky (advisor: PROTOTYPE it in a
     real xlsx first) — behavior can't be verified here (no Excel to render it).
  3. Frontend needs SELECT↔free-text mode switching (SearchableSelect free-text support unverified).
- **DECISION: user chose "implement dual-mode best-effort".** DONE (see below).

### [2026-07-20] — W4d (#5 PS dual-mode) — ✅ IMPLEMENTED (best-effort; ⚠ needs real-Excel spot-check)
- Exact Delhi string PINNED: `geoData.js:66 DELHI_STATE = 'Delhi'` (and "Delhi" is a real _state
  option). District-mismatch resolved by using the FLAT all-Delhi-PS list (not district-filtered),
  since person districts are admin-named and don't key into the police-district DISTRICT_TO_PS_NR.
- **Backend Excel** (`template-builder.service.js` cascade pass): a PS column paired with a
  `*_state` sibling (person address) now gets `INDIRECT(IF($<stateCol>5="Delhi","OPT_POLICE_STATION",""))`
  — Delhi PS list iff state=Delhi, else INDIRECT("")→free-type (showErrorMessage:false). Occurrence
  PS (no _state sibling) keeps `INDIRECT(VLOOKUP($<dist>5,DISTRICT_TO_PS_NR,2,FALSE))`. Imported
  DELHI_STATE. VERIFIED via buildTemplate('CASE'): complainant/victim/accused(+perm)_police_station
  → IF-dual formula; occurrence_police_station → district cascade; OPT_POLICE_STATION +
  DISTRICT_TO_PS_NR both defined; **import:parity PASSES**.
- **Frontend** (`FieldRenderer.jsx`): person-address PS (not in EVENT_PS_KEYS =
  occurrence/arrest/record PS) shows ALL_DELHI_PS dropdown when `${prefix}_state`==='Delhi', else
  renders a free-text TextField (`forcePsFreeText`). Event PS keep district-filtered Delhi list.
  Added ALL_DELHI_PS (flattened DISTRICTS_AND_STATIONS) + DELHI_STATE + EVENT_PS_KEYS. Lint: 0 new
  errors (git-stash baseline = same 3 pre-existing).
- **⚠ REQUIRES USER SPOT-CHECK IN REAL EXCEL:** the conditional `INDIRECT(IF(...))` data-validation
  dropdown is a standard Excel pattern but couldn't be rendered/verified in this environment —
  open a generated CASE template, set complainant_state=Delhi → confirm PS dropdown appears; set
  a non-Delhi state → confirm free-type is allowed. Frontend dual-mode should be browser spot-checked too.

## VERIFICATION CHECKLIST (per bug, before marking ✅)

- [ ] Root cause fixed (not just symptom)
- [ ] Searched for the same bug class elsewhere
- [ ] Backend: lint clean, targeted manual/flow check
- [ ] Frontend: builds, targeted manual check
- [ ] No regression in the ONE write path / import parity (`npm run import:parity` if template touched)
- [ ] Affected docs updated (CLAUDE.md, docs/new-db-integration/03-import.md, DB_SCHEMA.md, config/README.md as applicable)

---

## FINAL REPORT (2026-07-20) — ALL 10 BUGS + 1 BONUS DONE

**Root causes (per bug):**
- **#1** ARREST import "system error" = a CLASS of write-crashes from messy real-world Excel
  cells, each surfaced as one opaque message: (a) over-width location value → varchar(10) pincode
  overflow (pg 22001); (b) out-of-vocabulary gender/relation → CHECK violation (pg 23514, e.g.
  "Yadav"); (c) out-of-vocab property status → CHECK (e.g. "Mobile"); (d) DD/MM/YYYY record_date
  read as MM/DD by Postgres → datetime overflow (pg 22008, ~half of rows); (e) corrupt Excel-serial
  dates (pg 22007).
- **#2** UIDB inherited BOTH the act_name cascade AND standalone local/major/minor rows (backend
  UIDB remap didn't re-section them).
- **#3** gazette (uidb_no) had contradictory is_active:false + required:true, drifted vs DB.
- **#4** date/time columns were ALREADY separate; only the gd_no/fir_no LABELS said "…Date & Time".
- **#5** the Delhi PS district-cascade was wired onto person-address PS (India-scoped) too.
- **#6** occurrence pincode/lat/long hidden by a `< 4` sort_order cap in the render filter.
- **#7a** heinous never stored/derived (ui_only). **#7c/d** enum stored UPPERCASE, no read-side
  inverse → SearchableSelect case-mismatch → blank (shared write+read bug, hit interactive too).
- **#8** CASE persons/props were saved but blanked by #7c/d; ARREST props saved but no record-level
  view. **#9** dev quick-login sent badge HQ001, seed is HQA001. **#10** no validation hook existed.
- **Bonus**: autoload load-ref crashed startup on FK-referenced ref rows.

**Files changed (backend):** records.mapper.js (enum/pincode/location coercion + width guard +
read-side enum inverse + heinous derive + exported detectors), records.service.js (record_date
normalize, crime_category carry), import.validate.js (RECORD_DATE_INVALID + VALUE_SALVAGED
warnings), import.service.js (error diag logging), template-builder.service.js (#5 dual-mode
formula), fields.controller.js (#2 UIDB cascade-only, #8 ARREST property section), io.service.js
(mobile reject-not-truncate), bootstrap/autoload.js (FK-safe load-ref).
**Files changed (frontend):** LoginPage.jsx (#9 badges), DynamicForm.jsx (#6 filter, #10 validate
hook, #8 view-only section), FieldRenderer.jsx (#5 dual-mode), IOManagement.jsx (#10 mobile),
utils/fieldPatterns.js (NEW #10 validators).
**Config:** config/fields/{case,arrest,uidb,pcr_call,missing,common}.json (29 validation patterns,
heinous options, gazette disable, gd_no/fir_no relabel).

**Docs updated:** this HANDOFF (source of truth). TODO at handoff close: fold key contracts into
CLAUDE.md / docs/new-db-integration/03-import.md (import-robustness coercion + warnings + record_date
normalize) and config/README.md (validation_rules.pattern convention).

**Tests/verification performed:** #1 verified via REAL operator path (createBatch→processBatch):
ARREST BK Road 16/16 imported 0 WRITE_FAILED, CASE T.Road 19/21 0 WRITE_FAILED, Maurice Nagar
corrupt-dates cleanly rejected 0 crash; swept 5 record types × 4 PSs — INVARIANT: no opaque
"system error" remains. #7c/d + #7a verified via live API. #9 verified via API (HQ001→401,
HQA001/HQD001/SA001→200). #10 = 13 FE + 7 BE unit cases. #2/#3/#4/#6/#8 verified via form-schema
API + parity. #5 structurally verified (parity + formula dump). audit:verify GREEN, import:parity
GREEN, frontend build GREEN throughout. Temp harnesses deleted.

**Related bugs fixed (beyond the 10):** the #7c/d casing bug also silently blanked
INTERACTIVELY-created records; the salvage-warnings surfaced a real column-misalignment in the
user's sample data; error-surfacing now logs pg constraint/column for future diagnosis.

**Remaining risks / follow-ups:**
1. **#5 real-Excel spot-check — the PRECISE question:** the formula writes `$<state>5` (row-5 cell)
   into every row 5–500's validation. Open a generated CASE template, set complainant_state on
   ROW 7 (not row 5) to Delhi → does ROW 7's PS dropdown react to row 7's state, or is it pinned to
   row 5's? (This mirrors the pre-existing occurrence `VLOOKUP($…5)` cascade EXACTLY — if occurrence's
   per-row dropdown has always worked, this will too; if not, it was already broken.) Also confirm
   non-Delhi state → free-type allowed. Browser spot-check the form dual-mode too.
2. **#2 UIDB is SCHEMA-VERIFIED, RENDER-PENDING** (not "done" in the UI sense): confirmed the 3 dupe
   keys are absent from the schema + act_name/heinous present, but the visual proof (FormSection
   drops the removed rows AND ActsSectionsTable still renders the cascade from act_name) needs a
   browser drive — it's a rendering interaction, not just schema absence. **#8 ARREST property
   section** + **#6 pincode render** are lower-risk (filter/section) but also recommend a visual check.
3. **#2↔#7a coupling**: new interactive UIDB records won't derive heinous (no local_head writer) —
   accepted (heinous is CASE/ARREST). 
4. **#7b** legacy combined-address parse drops district — LOW priority, non-current-template only.
5. Repo's fixed *_Final.xlsx reference files are stale (not served) — optional housekeeping.
6. toISO TZ off-by-one on non-DD/MM date formats — DD/MM import data is safe; note only.
7. Bulk-import path doesn't run the #10 frontend field-pattern validation (imported names with
   digits pass) — out of #10's interactive scope; register as follow-up.

**Git:** all changes on branch dev2/ashmit, NOT committed (awaiting user review per workflow).
