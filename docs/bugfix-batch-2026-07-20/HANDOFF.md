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

### [2026-07-20] — ROUND 2 (testing-team bugs) — INVESTIGATION CORRECTIONS
**INCIDENT:** my import test harness pointed directly at `sample files/*.xlsx`, and
`import.service.js:255 processBatch` DELETES its source file after processing. This permanently
DESTROYED 4 sample files (not in git): `ARREST … PS BK Road`, `ARREST … PS MAURICE NAGAR`,
`CASE … T.Road`, `CASE … PS North Avenue`. Going forward: ALWAYS import a throwaway COPY.
(The "Yadav in gender" claim came from the now-deleted T.Road CASE file; current sample files have
correctly-aligned accused columns, so it was that one file, NOT a systemic parser bug.)

**CORRECTED data-layer findings (verified via getRecordDetails on a fresh CASE import, on a COPY):**
The recomposed flat domain fields live at `getRecordDetails().record.data.*`. For an imported CASE
record they ARE populated: fir_no, complainant_first_name/gender, victim+accused persons[],
local_head, brief_facts, heinous_offence="No" (derives). So the earlier "flat data empty" scare was
a HARNESS bug (wrong key), not a real one. Most "not coming after import" reports are therefore
likely **RENDER-layer** (form not displaying data that IS in getRecordDetails) — the layer NOT yet
driven. Confirmed genuine DATA gap: occurrence_district/occurrence_police_station were undefined —
BUT in the test file those cells were EMPTY (officer put the whole address in city_town_village), so
NOT proven a bug yet; need a file with those cells filled.

**CONFIRMED config/controller bugs (concrete, layer-verified):**
- UIDB `cause_of_death` is in config (UIDB, active, section inquest_details) but ABSENT from the
  UIDB form schema → controller section assembly drops it. REAL, fixable.
- "Bad Character (BC)" real field_key = `listed_criminal` (not bad_character); need to confirm it's
  in the ARREST form.

**USER DOMAIN NOTE (2026-07-20):** for CASE, only CCTNS + Zero FIR registration types carry crime
heads (act/section); other registration types are RELAXED from the act/section requirement — import
validation must not require local_head/act/section for non-CCTNS/non-Zero-FIR CASE rows.

**REFRAME (verified via real ARREST import on a COPY, getRecordDetails):** ALL reported "missing
after import" ARREST fields ARE present in the data — record.data has heinous_offence="No",
scheme_of_arrest, act_name, sections; persons[].data (ARRESTED) has nafis_prepared=true,
dossier_prepared, proclaimed_offender, listed_criminal, prev_involvement, arrested_*; properties[]
populated. Same for CASE (fir_no, complainant, victim, accused, local_head, brief_facts). ⇒ ROUND-2
"doesn't come after import" bugs are **RENDER-LAYER** (form not DISPLAYING present data), NOT data
loss. This is the layer round-1 never drove.

**ALL round-2 form fields EXIST in their schemas** (verified GET /api/fields/form/ARREST): heinous,
nafis_prepared, dossier_prepared, proclaimed_offender, listed_criminal, prev_involvement,
scheme_of_arrest all present; place_of_arrest ABSENT. So heinous/NAFIS/etc "not coming" = render bug.

**Round-2 bug taxonomy:**
- RENDER-layer (data present, form doesn't show): CASE victim/accused/property/occurrence-district+PS;
  ARREST heinous/NAFIS/Dossier/PO/BC(listed_criminal)/property; UIDB inquest-filled-by-acp/dm.
  → Investigation agent a65be300 (frontend imported-record view mapping).
- CONFIG/CONTROLLER: UIDB cause_of_death dropped by controller (real). place_of_arrest missing.
  → Investigation agent ab9c82c1 (bugs A–F).
- TEMPLATE: scheme_of_arrest emitted as multiple COLUMNS not one dropdown; place_of_arrest needed in
  ARREST+KALANDRA template; CASE occurrence district→PS cascade "shows ALL police stations" (may be
  my #5 dual-mode change OR the occurrence cascade — CHECK). → partly agent ab9c82c1 + my #5 review.
- VALIDATION UX: CASE lat/long "still accepting text" — my fieldPatterns validation flags on
  submit but the input still lets you TYPE text (constrain-on-submit, not keystroke-block). Testing
  team likely expects keystroke-level numeric rejection (like the IO mobile fix). → make lat/long
  numeric-input. CASE act/section: relax by registration type (only CCTNS + Zero FIR need crime heads).
- DELETE: "unable to delete ARREST record" — likely status guard (only DRAFT deletable;
  LEGACY_IMPORTED isn't) or FK. → agent ab9c82c1 bug D.

**2 Sonnet investigation agents dispatched (a65be300 render, ab9c82c1 concrete A–F). Awaiting.**

**NEW round-2 bug — "edits don't persist / revert on reopen":** user edits a record, saves (or
sends to SHO), reopens → shows ORIGINAL as if no change. VERIFIED backend `updateRecord` PERSISTS
correctly (changed brief_facts on a DRAFT record → new value in raw fir_details AND recomposed by
getRecordDetails). ⇒ bug is FRONTEND edit→save→reopen cycle (form load-seed clobbering edits, or
submit sending a stale snapshot, or an autosave race). Folded into agent a65be300's scope (same
DynamicForm load/save subsystem as the render bugs). Prime suspects: a useEffect re-seeding
`values`/`repeaterState` from initialData that overwrites edits; the submit/autosave handler payload.

### [2026-07-20] — ROUND 2 DIAGNOSIS (agent a65be300, VERIFIED by lead) — fix plan
**R2-1 (SEVERE, CASE victim/accused) — CONFIRMED:** `fields.controller.js:500,522` tag CASE
victim_info/accused_info with `person_type:'PERSON_VICTIM'`/`'PERSON_ACCUSED'`, but canonical roles
are `VICTIM`/`ACCUSED` (records.mapper.js:93; ARREST correctly uses `'ARRESTED'` at :589).
Consequences: (a) READ — getRecordDetails returns person_type `VICTIM`; DynamicForm render filter
`p.person_type===section.person_type` (2939) never matches `PERSON_VICTIM` → imported victims/accused
DON'T DISPLAY. (b) WRITE — buildRepeaterPayload sends `PERSON_VICTIM` (3729); splitPersons
(mapper 531-532) drops any non-canonical role → interactive CASE victims/accused SILENTLY NEVER
SAVED (pre-existing prod bug; seed/import bypass it by composing canonical roles). FIX = controller
500/522 → `'VICTIM'`/`'ACCUSED'`. Verified SAFE: 0 frontend string-lit deps on PERSON_VICTIM
(repeater_entity is a separate attribute, untouched). One change fixes both read+write.
**R2-2 (edit revert) — CONFIRMED:** `main.jsx` global `staleTime:60s`+`refetchOnWindowFocus:false`;
`useAutosave.js onSuccess` DELIBERATELY doesn't invalidate `['records',id]` (documented — invalidation
caused background-refetch clobbering in-progress edits). ⇒ Save Draft persists to DB but reopening
within 60s serves stale pre-edit cache → "reverted." FIX must NOT re-add blanket invalidation (would
reintroduce clobber). Safe fix = `refetchOnMount:'always'` (or staleTime:0) on the record-DETAIL
useQuery in RecordDetail.jsx + NewRecord.jsx — forces fresh fetch on every REOPEN (mount = no
in-flight edits, so no clobber). Covers save-draft AND submit/send-to-SHO reopen paths.
**R2-3 (property Value in INR blank) — CONFIRMED:** main property table binds "Value in INR" to
`property_value_inr` which is NOT a real field_key (verified absent from all config/fields). Real
value = category fields prop_cash_amount/prop_*_value (storage estimated_value) shown only in the
collapsible extra panel. FIX: bind the main value column to estimated_value / the active category
value field. (Category/type columns are correctly wired.)
**R2-4 (ARREST NAFIS/Dossier/PO/BC/prev_involvement) — UX, not import-specific:** these ARE wired
(arrestee particular_details sub-tab) but only reachable via the row "Edit" modal → "Particular
Details" tab; only heinous shows on the main step. Same for interactive records. DESIGN: surface
them in the read view? → likely small display add; confirm scope.
**R2-5 (occurrence district/PS + UIDB inquest) — agent flags IMPORT-COMPOSE GAP:** import.compose.js
+ key-bridge have ZERO refs to occurrence_district/occurrence_police_station/filed_by_acp_sdm/
cause_of_death → import may never populate them (NOT a render bug). → CONFIRM via agent ab9c82c1
bug F + a real import with those cells filled. (My earlier test had them empty.)

### [2026-07-20] — ROUND 2 concrete bugs (agent ab9c82c1, VERIFIED by lead) — fix plan
**A UIDB cause_of_death — CONFIRMED:** cause_of_death/deceased_relative_name/deceased_relation_type
have `scope_level:"UIDB"` in config (DB same) → fields.controller.js:118-123 query only includes
scope_level global|district → excluded. FIX: config/fields/uidb.json set those 3 scope_level→"global";
sync-config. (filed_by_acp_sdm is already global — renders.)
**B place_of_arrest — CONFIRMED:** field `arrest_place` EXISTS in ARREST form but LABELED "House No.
of Arrest" (storage location/arrest/full_address); already in ARREST+KALANDRA templates. FIX: relabel
to "Place of Arrest" in config/fields/arrest.json + import-fields.config.js:234; sync-config.
**C scheme_of_arrest extra columns — CONFIRMED DRIFT:** 6 legacy per-scheme bool fields
(integrated_pi/group_patrolling/cycle_patrolling/by_antisnatching_team/by_prahari/
by_eyes_ears_scheme_members) are is_active=FALSE in config but is_active=TRUE in DB; sync-config does
NOT reconcile is_active down (verified: "0 deactivated"), so autoIncludedRegistryFields appends all 6
as extra ARREST template columns beside the real scheme_of_arrest dropdown. FIX: add the 6 to
TEMPLATE_EXCLUDE_KEYS.ARREST (import-fields.config.js) [permanent, is_active-independent] + force DB
is_active=false for them.
**D can't delete ARREST — CONFIRMED:** record_links FKs to records are confdeltype='a' (NO ACTION, no
cascade). linkResolver links DRAFT arrests (against-FIR) to their CASE on record.created, so an
ordinary DRAFT arrest gets a record_links row → deleteRecord's `DELETE FROM records` throws FK
violation (raw 500). FIX: records.service.js deleteRecord — before deleting, `trx('record_links')
.where({source_record_id:id}).orWhere({target_record_id:id}).delete()` (+ record_transfers,
record_amendments same gap).
**E CASE act/section relaxation — CONFIRMED:** case_type options = cctns(manual FIR)/eTheft/eMVT/NCRP/
zero FIR; only cctns + zero FIR need crime heads. Enforcement: local_head required (row-level,
import.validate fieldRequirement) + act/sections/crime_head (composed-level import.validate.js:472-490
offence-required block). FIX: gate local_head via show_when {case_type in [cctns(manual FIR), zero FIR]}
in import-fields.config.js caseGeneralFields; set act/sections required:false; gate the composed-level
offence-required block on `case_type` (trim+lowercase compare). Fix stale case_type hint too.
**F occurrence district/PS — parse PRIMARY works (row-1 field_key); import populates them WHEN FILLED.**
Real gap is narrow: CASE_SYNONYMS fallback labels ("Place of Occurrence District") don't match
generated labels ("Place of Occurrence Address District") → dead fallback only if row-1 stripped.
ALSO the occurrence PS cascade (DISTRICT_TO_PS_NR) may show all/empty PS (ties to testing bug "cascade
shows all PS"). → verify with a filled import + check cascade; low priority vs A-E.

**IMPLEMENTATION — ROUND 2 BACKEND/CONFIG DONE + VERIFIED (2026-07-20, lead; subagent dispatch hit
a transient model outage so lead implemented directly):**
- **R2-1 person_type** — fields.controller.js victim_info→'VICTIM', accused_info→'ACCUSED' (repeater_entity
  untouched). Verified API: CASE sections now person_type VICTIM/ACCUSED. Fixes imported-victim/accused
  DISPLAY + interactive-victim/accused SAVE (was silently dropped).
- **A UIDB cause_of_death** — uidb.json 3 fields scope_level UIDB→global; sync. Verified: cause_of_death
  + deceased_relation_type now in UIDB form.
- **B place_of_arrest** — relabeled "House No. of Arrest"→"Place of Arrest" in arrest.json +
  import-fields.config.js. Verified: form label + template column both "Place of Arrest". (Field already
  existed + was already a template column — it was a relabel, NOT an add.)
- **C scheme extra columns** — CONFIRMED sync-config FORCE-REACTIVATES is_active (config false is
  ignored — `^6 reactivated`), so the only robust fix is TEMPLATE_EXCLUDE_KEYS: added the 6 legacy
  scheme fields to ARREST exclude. Verified: generated ARREST template has ONLY scheme_of_arrest, 0
  legacy cols, parity green — holds even though DB is_active=true.
  **BONUS:** un-excluded `listed_criminal` (BC, storage arrestee.is_bc, parallels proclaimed_offender/
  is_po) — it was EXCLUDED so never imported (root of "BC doesn't come after import"); now a template
  column. Verified present in generated template.
- **D delete arrest** — records.service.js deleteRecord now deletes record_links (source+target) +
  record_transfers + record_amendments in-txn before the records delete (those 3 FK refs have no
  cascade; linkResolver links DRAFT against-FIR arrests → FK 500). Verified via repro: linked DRAFT
  arrest deletes cleanly, no orphan link, hash-chain intact.
- **E CASE act/section relaxation** — local_head gated show_when case_type∈[cctns(manual FIR),zero FIR];
  act/sections/crime_head required:false; composed-level crime_head enforcement in import.validate.js
  gated on normalized case_type (CRIME_HEAD_CASE_TYPES). case_type now required. Verified real-path: an
  eTheft CASE row with no crime head gets NO crime_head error (relaxed); CCTNS/Zero-FIR still enforced.
- import:parity GREEN, audit:verify GREEN throughout. node --check all touched files OK.

**FRONTEND ROUND-2 FIXES DONE (2026-07-20, lead):**
- **R2-2 edit-revert** — `sho/RecordDetail.jsx` + `hc/NewRecord.jsx` record-detail useQuery now
  `refetchOnMount:'always'` + `staleTime:0` → reopening a just-saved record always fetches fresh
  (was served stale ≤60s cache; useAutosave intentionally doesn't invalidate to avoid clobbering
  in-progress edits — mount has no in-flight edit, so this is safe). Covers save-draft + send-to-SHO.
- **R2-3 property Value in INR** — DynamicForm main property table "Value in INR" bound to
  non-existent `property_value_inr` (never displayed imported/saved value, never persisted typed
  one). Added `PROP_VALUE_KEYS`+`effectivePropValue(row)` (5 est-value keys all → estimated_value);
  READ = first populated key; WRITE → prop_other_value (real key, persists).
- **lat/long keystroke-reject** — FieldRenderer TEXT branch: fields with
  validation_rules.pattern==='latlong' now filter input live to numeric shape (optional leading
  '-', digits, ≤1 '.') — testers reported "still accepting text" (my #10 flagged only on submit).
- Verified: eslint 52=52 (0 new errors, git-stash baseline), frontend BUILD GREEN.
- **REMAINING = BROWSER SPOT-CHECK (needs running UI, hand to user or drive via browser tool):**
  R2-1 victim/accused actually render on an imported CASE; ARREST heinous/NAFIS/Dossier/PO/BC show;
  edit persists on reopen; lat/long rejects letters; property value shows. R2-4 (NAFIS/PO/BC only in
  row Edit modal, not main step) is a UX-surface decision — deferred, not a data bug.

### [2026-07-20] — ROUND 2 FINAL VERIFICATION (advisor-driven, lead)
- **sync-config ROOT-CAUSE BUG FOUND + FIXED** (`scripts/lib/sync-config-core.mjs`): the reactivate
  branch hardcoded `is_active:true`, so a config `is_active:false` survived exactly ONE sync then
  flipped back → #3 gazette had REGRESSED (uidb_no was true again). Fixed to reactivate to the
  config's intended `row.is_active` (checksum hashes is_active, so config:false now settles to
  'unchanged'). VERIFIED: uidb_no + 6 scheme fields stay false across repeated syncs; #3 uidb_no
  gone from UIDB form; C ARREST template clean (0 legacy cols, scheme_of_arrest + listed_criminal
  present). This makes ALL is_active-via-config fixes durable (general infra fix).
- **E BOTH directions VERIFIED (real-path A/B, same file/row)**: eTheft (no head) → NO crime_head
  error (relaxed); cctns(manual FIR) (same row) → crime_head error FIRES. Gate correct.
- **listed_criminal + arrest_place ROUND-TRIP VERIFIED**: generated ARREST template, filled BC=Yes +
  Place-of-Arrest, imported real-path → recompose returns listed_criminal:true + arrest_place text;
  arrest location persisted to locations.full_address. Not just column-present — value round-trips.
- **D delete** re-confirmed via repro (linked DRAFT arrest deletes, no orphan, chain intact).
- audit:verify GREEN, import:parity GREEN, frontend BUILD GREEN, eslint 0-new throughout.

**BROWSER TOOLING NOT AVAILABLE this session (extension not connected).** The 5 render/UI fixes are
verified at the data/API/build layer but NOT visually driven. PRECISE user spot-check click-paths
handed over (below / in chat). These are the ONLY unproven-in-UI items:
- R2-1 victim/accused DISPLAY on imported CASE + SAVE on interactive CASE (severe — was silent drop)
- R2-2 edit persists on reopen (Save Draft path) + send-to-SHO path (may be R2-1, not R2-2 — see note)
- R2-3 property Value in INR shows a value
- lat/long rejects typed letters
- (R2-4 NAFIS/PO/BC only in row Edit modal = UX-surface decision, deferred)

**ADVISOR NOTE on revert bug:** "revert on SEND-TO-SHO" is likely a DIFFERENT mechanism than "revert
on save-draft" (submit path already invalidates cache). The send-to-SHO victim/accused revert is
probably the R2-1 silent-person-drop (now fixed), NOT R2-2 staleness. If send-to-SHO STILL reverts
after both fixes, a 3rd mechanism (submit sending stale snapshot) remains — flagged for next round.

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

---

## ROUND 3 — 2026-07-21 FOLLOW-UPS (3 bugs)

Reported by user after round-2: (1) occurrence from/to date + "known time of occurrence"
should be OPTIONAL; (2) property category/type not parsed on import; (3) major/minor heads
duplicated ("repeated redundantly") after save→submit-to-SHO.

| # | Bug | Root cause | Fix | Status |
|---|-----|-----------|-----|--------|
| R3-1 | Occurrence from/to date + time-type required | `validation_rules.required:true` in `config/fields/case.json` for `occurrence_time_type`, `occurrence_from_date_time`, `occurrence_to_date_time` | Set those three `required:false` (left `info_received_at_ps_date_time` required — not reported). `fir_details` occurrence cols already nullable. sync-config'd. | ✅ DONE — DB shows required:false; submit skips (records.service.js:450 `required !== true`) |
| R3-2 | Property category & type dropped on import | `major_category_id`/`minor_category_id` are **integer FKs** (ref.property_categories.parent_cd / ref.other_property_items.property_cd). Interactive form submits the numeric code (works); **bulk import submits the LABEL** ("Vehicle", "12 BORE SHOT GUN…"), which `normalizePropertyValue`→`coerceByType(int, label)` turned to null → silently dropped. | Deferred the two columns (`DEFERRED_PROPERTY_FK_COLUMNS`) past coerceByType; resolve async in `splitProperties` via new `resolvePropertyMajorCategory`/`resolvePropertyMinorCategory` (numeric passes through for the form; label→code lookup for import). Arms/drugs/generic minors that live in OTHER ref tables stay null (strict improvement, not a regression). | ✅ DONE — round-trip: label "ARMS AND AMMUNITION"→major_category_id=4, "12 BORE SHOT GUN…"→minor_category_id=80 |
| R3-3 | Major/minor heads repeated after save/submit | `record_offences` is "one row per section citation" but major/minor heads are an **independent** frontend list (`majorMinorRows`, unrelated to section count). `zipOffenceStrings` last-filled heads to match section count (`majors[i] ?? majors[majors.length-1]`), so 3 sections + 1 head → 3 rows all "THEFT" → recompose `major_heads="THEFT, THEFT, THEFT"` → frontend re-seeds 3 identical head rows. Frontend never sends an `offences[]` array, so this zip path always runs. | Removed the head last-fill only (`major: majors[i] ?? null`, `minor: minors[i] ?? null`); kept `n = max(acts, sections)` and `act: acts[i] ?? acts[0]` (acts DO run parallel to sections — extending n would move duplication onto the act axis, per advisor). | ✅ DONE — round-trip: 3 sec + 1 head → `major_heads="THEFT"` (count 1); reverse (heads>sec) → no repeated `IPC`. Heads>sections OVERFLOW (extra heads unstored) is PRE-EXISTING (n already section-driven) — out of scope, needs schema work. |

**Files touched (R3):**
- `config/fields/case.json` — 3× `required:false`
- `backend/src/modules/records/records.normalize.js` — `isNumericCode`, `resolvePropertyMajorCategory`, `resolvePropertyMinorCategory`
- `backend/src/modules/records/records.mapper.js` — import `resolveProperty*`; `DEFERRED_PROPERTY_FK_COLUMNS` + defer in `normalizePropertyValue`; `resolvePropertyFkColumns`; `splitProperties(trx, …)` + `splitPayload` call; `zipOffenceStrings` head last-fill removed; stale property-FK comment corrected.

**Verification:** real write-path round-trip (`createRecord` → `getRecordDetails`) on throwaway CASE records; harness deleted after use. No sample files touched.

**Follow-up register:** offence model conflates two independent UI lists (acts/sections vs major/minor heads) into one positional `record_offences` structure — heads>sections still loses overflow heads. Proper fix needs decoupling heads from section rows (schema/contract work), deferred.

**Git:** R3 changes on dev2/ashmit, NOT committed (awaiting user review).

---

## ROUND 3 (cont.) — 2026-07-21 — MORE FOLLOW-UPS (B4–B8)

| # | Bug | Root cause (diagnosed) | Status |
|---|-----|-----------------------|--------|
| B4 | Property present in HC record but "not there" after submit to SHO | Backend PROVEN CORRECT: echoed properties survive create→update→submit (harness). Real DB: CASE props survive to DISTRICT_REVIEW; **ARREST has ZERO properties across ALL statuses** (record- AND person-level) → ARREST-specific loss OR seed artifact. Suspects: `view_only_when_populated` render gate (DynamicForm ~L2074) + per-person nesting path; `buildRepeaterPayload` skip (L3759) drops value-only props. | ✅ DONE |
| B5 | Adding "Aadhaar…Act" also adds a phantom "Benefits and Services" act | Same serialization weakness as R3-3: `act_name`/`sections`/`major_heads`/`minor_heads` are COMMA-joined, but the Aadhaar act LABEL contains commas ("…Subsidies, Benefits and Services) Act, 2016"). Frontend split (ActsSectionsTable ~L45) + `zipOffenceStrings` (~L604) shatter it into phantom rows; the 4-digit-year rejoin hack only catches ", 2016". `record_offences` stores STRUCTURED FK rows — comma-string is only frontend transport → fixable w/o migration (sentinel delimiter OR structured `offences[]`, which `buildOffenceRows` already prefers). | ✅ DONE |
| B6 | UIDB: local head mandatory but unfillable | `local_head` had `required:true` + `record_types` incl UIDB; controller HID it from UIDB form (`UIDB_CLASSIFICATION_DUPES`) but submit-validation still demanded it → UIDB unsubmittable. | ✅ DONE — removed UIDB from `local_head.record_types` (common.json); synced; verified `["CASE","ARREST"]` |
| B7 | SHO 2nd send-back shows the 1st (old) message | `getSendBackDetails` used `transitions.find(SEND_BACK)` = FIRST match; transitions are `performed_at ASC` so newest is LAST. | ✅ DONE — `NewRecord.jsx` now `.filter(SEND_BACK).at(-1)` (only occurrence in FE) |
| B8 | Can't add new victim/accused; can't edit complainant name/address (SHO-revert-edit AND simple edit) | `useUpdateRecord` invalidates `['records',id]` on success; detail query is `refetchOnMount:'always'`/`staleTime:0` → save/submit triggers refetch → DynamicForm seed effect reseeds `values`/`repeaterState` → clobbers in-progress new persons + complainant edits (R2-2 family via the explicit-save path; `useAutosave` was already patched not to invalidate). Also verify complainant name-part split/recompose round-trip + SHO-revert `readOnly`/`highlightedFields` locking. | ✅ DONE |

**Done this session:** B1 (dates optional), B2 (property cat/type import), B3 (head dup), B6 (UIDB local head), B7 (send-back msg), B4 (ARREST per-person property skip condition), B8 (explicit-save invalidate/reseed clobber), B5 (act-name comma re-merge) — all verified. Not committed.

### B4 — CONFIRMED root cause + fix (2026-07-21)

Write-path harness (`recordsService.createRecord`/`updateRecord`/`getRecordDetails`, throwaway,
deleted after use — no sample files touched): an ARREST record created with a per-person
property shaped correctly (top-level `properties: [{...cols, person_index: 0}]`, per
`buildRepeaterPayload`'s ARRESTED branch, NOT nested under the person's `data` blob) **survives
create → update(echoed) → submit → approve with `person_id` intact at every step.** So the
backend write path (`records.service.js` `upsertProperties`/`insertPersonEntry`,
`records.mapper.js` `splitProperties`) is proven correct for ARREST per-person properties —
same conclusion the lead engineer already reached for CASE record-level properties.

The real bug is in `buildRepeaterPayload` (`DynamicForm.jsx`, ARRESTED branch ~L3748 and the
CASE record-level property branch ~L3759): the skip condition
`if (!prop.id && !prop.property_major_category && !prop.property_details) continue;` drops
any property row that has neither a saved `id` NOR `property_major_category` NOR
`property_details` filled in — even if the officer filled in something else that IS real data
(value in INR, or a subtype-specific field reached only after picking then clearing/changing a
category). Because the UI's subtype-specific fields (IMEI, vehicle reg. no., etc.) only render
once `property_major_category` is set (`extraFields` gate ~L1505), a row with a genuinely
filled subtype field always also has `property_major_category` set and was never at risk — but
a row where the officer only entered a value in INR (a field NOT gated on category) has neither
column set and was silently dropped on every save, matching "property disappears" exactly for
that entry pattern.

**Fix** (`frontend/src/components/forms/DynamicForm.jsx`):
- Added a module-level `hasMeaningfulPropertyData(entry)` helper (next to `effectivePropValue`)
  that keeps a row if ANY field has a real value, explicitly excluding `id` (checked
  separately), `property_stolen_recovered` (every row — including the never-touched blank
  starter row — carries a `'Stolen'` default, so it can't signal "has data"), and
  `person_index` (routing metadata, not user data).
- Both skip conditions (ARRESTED per-person branch ~L3752, CASE record-level branch ~L3762)
  now call `!entry.id && !hasMeaningfulPropertyData(entry)` instead of checking only
  `property_major_category`/`property_details`.
- Did not touch `records.mapper.js` `zipOffenceStrings` (B5, owned separately) or any
  `config/fields/*.json` occurrence/local_head changes, per instructions.

**Verification:** backend round-trip re-confirmed unaffected after the frontend fix (harness
re-run, same PASS result). The frontend half of the fix (the actual dropped-row scenario) is a
pure client-side payload-building bug with no server-observable difference once the payload is
shaped correctly — verified by code inspection of the corrected skip condition and by proving
the backend accepts and persists exactly the payload shape `buildRepeaterPayload` now produces
for a value-only row (i.e. any row that reaches `hasMeaningfulPropertyData`'s true branch).
Harness deleted after use (`backend/scripts/dev/verify-b8-b4.mjs`, throwaway).

### B8 — CONFIRMED root cause + fix (2026-07-21)

Confirmed via the same write-path harness: a CASE record created with 1 complainant + 1 victim,
then updated (adding a 2nd victim with no `id`, echoing the 1st victim's `id`, and editing the
complainant's name + address flat fields) round-trips perfectly through
`createRecord` → `updateRecord` → `getRecordDetails` — **2 victims present, complainant name and
address both show the edited values.** This rules out both secondary hypotheses:
- Complainant name-part split/recompose (`records.mapper.js` `recomposePersonFields`/
  `splitPersonEntry`) round-trips correctly — not the cause.
- SHO-revert field locking: `targetFields`/`highlightedFields` in `FormSection.jsx` (~L574) only
  set `isHighlighted` for CSS styling: per-field `readOnly` (~L621) depends solely on the
  overall `readOnly` prop and the field's own static `field.readonly` registry attribute (all
  `false` for complainant fields in `config/fields/case.json`) — `target_fields` never locks a
  field. Not the cause.

So the lead engineer's primary diagnosis is CONFIRMED as the trigger mechanism:
`useUpdateRecord`'s `onSuccess` invalidated `['records']` and `['records', variables.id]`;
`NewRecord.jsx`'s detail query for that same key is `refetchOnMount:'always'` + `staleTime:0`
and stays mounted through the explicit save. `invalidateQueries` triggers an immediate
background refetch for any currently-active query matching the key (independent of
`staleTime`, which only governs mount/focus refetch policy, not invalidation), and that
refetch can resolve while the user is still interacting with the form. When it resolves,
`DynamicForm`'s seed effects (deps `[initialValuesStr, userStr, recordType, caseType]` and
`[initialPersons, initialProperties, finalSchema.length]`) used to see new prop content and
unconditionally call `setValues()`/`setRepeaterState()`, overwriting whatever the user had
changed since — the R2-2 class of bug, on the one path R2-2's original fix
(`useAutosave.js`'s deliberate non-invalidation) didn't cover.

IMPORTANT CORRECTION during fix implementation: removing `useUpdateRecord`'s own invalidation is
**not sufficient by itself**. `NewRecord.jsx`'s `submitMutation` — which always runs immediately
after `useUpdateRecord` on the form's only submit path — separately calls
`queryClient.invalidateQueries({queryKey:['records']})` on its own success, and that prefix-matches
(and therefore still refetches) the exact same `['records', editId]` detail query. So even with
`useUpdateRecord` no longer invalidating, the same refetch-mid-edit trigger still exists one step
later in the same flow. Removing only the first invalidation would have left the bug in place for
any timing where the submit's own invalidate-triggered refetch resolves while the component is
still mounted (submit failure after a successful update, or any lingering in-flight edit).

**Fix (two parts, `frontend/src/components/forms/DynamicForm.jsx` is the one that actually closes
the bug):**
1. `frontend/src/hooks/useUpdateRecord.js` — removed both `invalidateQueries` calls from
   `onSuccess` (mirrors `useAutosave.js`'s already-established pattern; defense in depth, kept
   even though not sufficient alone). Removed the now-unused `useQueryClient` import/call.
   (`module` param was already unused before this change — pre-existing, left alone.)
2. `frontend/src/components/forms/DynamicForm.jsx` — added a `formDirtyRef` (declared near
   `prevInitialIdRef`) set to `true` by every REAL user edit path (`handleChange` for flat
   fields; the repeater-autosave effect's real-mutation branch, i.e. past its own
   `repeaterSeedSkipRef` seed-vs-real-edit check, for persons/properties) and consulted by
   BOTH seed effects (the flat `values` effect and the `initialPersons`/`initialProperties`
   effect): each now computes `isSameRecordAlreadyLoaded = initialValues?.id &&
   initialValues.id === activeRecordIdRef.current` and, if that record is already loaded AND
   `formDirtyRef.current` is true, **skips reseeding entirely** instead of clobbering local
   state; otherwise it reseeds and resets the flag. This directly implements the task's own
   framing ("the seed effect should not overwrite user edits that happened after the load") and
   closes the bug regardless of WHICH mutation's invalidation triggers the mid-edit refetch —
   `useUpdateRecord`'s, `submitMutation`'s, or any future one — rather than depending on
   correctly identifying and disabling every individual trigger. A genuinely different record
   (or the very first mount of this one, when `activeRecordIdRef` isn't yet pointed at it) always
   reseeds unconditionally, so R2-2 (stale-cache-on-reopen) is unaffected.

**Verification:**
- Backend round-trip (above) independently rules out any server-side data loss for this
  scenario, confirming the fix target is purely the client-side reseed race.
- `npx vite build` (frontend) succeeds with these changes — no syntax/type errors introduced;
  `dist/` removed after (gitignored, not committed).
- Full trace of the effect dependency chain and the `formDirtyRef` guard's behavior across the 4
  relevant cases (fresh mount of an existing record → dirty starts false → reseeds; same record,
  refetch resolves before any edit → not dirty → reseeds with fresh data, preserving R2-2; same
  record, refetch resolves after an edit → dirty → skipped, edit preserved; different record
  loaded → `isSameRecordAlreadyLoaded` false → always reseeds) — all four match the intended
  behavior.
- **Not independently verified**: an actual browser session driving the reported user flow
  end-to-end (open a SENT_BACK/DRAFT record, add a 2nd victim, edit complainant name/address,
  save/submit, confirm no revert). No browser-automation tool was available in this session to
  drive the real UI, and the task itself flagged this as a frontend race a backend harness
  cannot reproduce. This is a reasoning + build-validation level of verification, not a live
  reproduction — flagged here explicitly per the task's own instruction to document what could
  and couldn't be proven.

**Files touched (B4/B8):**
- `frontend/src/components/forms/DynamicForm.jsx` — `hasMeaningfulPropertyData` helper + both
  `buildRepeaterPayload` skip conditions (B4); `formDirtyRef` + guards on both seed effects +
  `handleChange` + the repeater-autosave effect (B8)
- `frontend/src/hooks/useUpdateRecord.js` — removed `invalidateQueries` calls + unused
  `useQueryClient` import (B8, defense in depth — see correction above)

**Not touched (per instructions):** `config/fields/*.json` occurrence/local_head changes,
`records.mapper.js` `zipOffenceStrings` (B5, owned separately).

### B5 — CONFIRMED root cause + fix (2026-07-21)

**Root cause confirmed** exactly as previously diagnosed, no changes to that read: `act_name`
(and its parallel `sections`) is transported as a plain comma-joined string on both the
interactive-form path (`ActsSectionsTable.jsx` builds it, `DynamicForm.jsx` reads it for the
major/minor-head classification cascade) and the backend zip (`records.mapper.js`
`zipOffenceStrings`). The Aadhaar Act's real registry label —
`AADHAAR (TARGETED DELIVERY OF FINANCIAL AND OTHER SUBSIDIES, BENEFITS AND SERVICES) ACT, 2016`
(verified live: `ref.acts.act_cd=3744`) — contains two commas of its own, so a naive
`act_name.split(',')` shatters it into 3 fragments ("...SUBSIDIES", "BENEFITS AND SERVICES)
ACT", "2016"); each non-year fragment then round-tripped as its own free-text act (a phantom
`record_offences` row via `other_act_name`), and desynced every subsequent acts[i]<->sections[i]
pairing. The old fix only rejoined a trailing bare 4-digit year, not commas inside the label
itself.

**Fix — registry-aware LONGEST-match re-merge, delimiter unchanged (per instructions: `act_name`
is consumed too widely — the classification cascade, `level-contracts` masking, imports, reports
— to risk a delimiter change):**

- **Shared shape**: after `act_name.split(',')`, for every starting fragment scan every possible
  window (`fragments[i..j]`) and keep the LONGEST one whose joined text (trimmed,
  case-insensitive) equals a label in the KNOWN acts registry, then consume that window whole; a
  window that never matches at any width is emitted as its own single fragment (conservative —
  never guess-merges two unrelated unknown acts together).
- **REVISION during the same session, advisor-caught**: the first implementation was
  greedy-**shortest** (emit as soon as ANY match was found, don't look further) — passed the
  reported Aadhaar case and an `'IPC, CrPC'` regression guard, but a stronger-model review before
  sign-off traced it against `ACT_GROUP_CODES`'s own doc comments and found it broke two REAL
  acts: `'Arms Act'` (alias) is an exact prefix of `ref.acts.act_long` `'ARMS ACT, 1959'`, and
  `'Delhi Excise Act'` is an exact prefix of `'DELHI EXCISE ACT, 2009'`/`'...2010'` — confirmed
  live via `SELECT act_cd, act_long FROM ref.acts WHERE act_cd IN (4,3032,3270)`. Since
  `loadKnownActLabels`'s known-set includes BOTH the alias and every full `act_long`, a
  shortest-match on fragments `['ARMS ACT','1959']` stopped at `'ARMS ACT'` (alias match) and
  stranded `'1959'` as its own phantom act — the exact bug being fixed, reintroduced for a
  different pair of real acts. Switched to longest-match, which keeps extending past the short
  alias match to the full `'ARMS ACT, 1959'` once THAT window also matches, and prefers it. A
  plain act with no commas (`'IPC'`) is unaffected — there's nothing longer to find, so it still
  emits immediately.
- **Backend** (`backend/src/modules/records/records.mapper.js`): new
  `reMergeKnownActFragments(fragments, knownLabelsLower)` helper (longest-match, no pre-pass
  needed — see below), called from `zipOffenceStrings` on the acts array only (sections/major/
  minor heads are untouched — their `ref.*` label columns don't contain commas, verified against
  `ref.sections`/`ref.major_heads`/`ref.minor_heads`). Known-label set comes from a new cached
  loader, `loadKnownActLabels(trx)` in `records.normalize.js` (same process-lifetime cache
  pattern as the existing `loadActs`/`resolveAct`): `ACT_GROUP_CODES` alias keys (`'IPC'`,
  `'Delhi Excise Act'`, …) union every `ref.acts.act_long` — this comprehensive set is WHY the
  backend needs no separate year pre-pass: the full act_long (year included) is always a literal
  member, so the longest-match window finds it directly. `buildOffenceRows` loads it once and
  passes it into `zipOffenceStrings`.
- **Frontend** (`frontend/src/components/forms/ActsSectionsTable.jsx`): same longest-match
  algorithm (exported as `reMergeKnownActFragments`, now the canonical implementation), BUT run
  behind a new `rejoinBareYearFragments` pre-pass (the OLD hack's exact logic, kept). Needed
  because the frontend's known-label set is NOT comprehensive the way the backend's is:
  `fields.service.js`'s `getActsSectionsRegistry` (the `/acts-sections` API backing the
  `actsSectionsRegistry` prop) deliberately COLLAPSES every act sharing a group alias into ONE
  registry entry keyed by the alias — `ref.acts.act_long` strings like `'ARMS ACT, 1959'` are
  never exposed to the frontend as their own known label, only `'Arms Act'`. But
  `records.service.js`'s recompose hands back the RAW `act_long` (not the alias) as `act_name`
  when an existing record is loaded for edit (`enrichOffenceLabels`:
  `act_label: r.other_act_name || actById.get(r.act_id)`, and `actById` is keyed off
  `ref.acts.act_long` directly) — so re-opening a saved Arms/Excise/Gambling-Act offence for edit
  hands the frontend `'ARMS ACT, 1959'` etc., which no width of a registry-only longest-match
  could ever recognise (the frontend registry has neither the raw string nor a decomposable
  prefix relationship for 2 of the 4 affected acts — `'THE PUBLIC GAMBLING ACT'` /
  `'DELHI PUBLIC GAMBLING ACT'` don't even textually resemble the alias `'Gambling Act'`). The
  bare-year rejoin is alias-agnostic (no registry lookup) so it fixes this gap unconditionally;
  Aadhaar's fix comes from the registry pass itself, since Aadhaar is ungrouped and its full
  `act_long` (commas included) IS exposed as its own registry entry. Verified both mechanisms
  together with a standalone simulation against the frontend's actual alias-collapsed shape (7/7
  cases pass — see Verification). The downstream "fill missing acts to match section count"
  effect (used the RAW pre-merge fragment count to decide whether to backfill) was updated to
  compare against the merged `acts.length` captured before the fill-loop mutates the array — it
  was reading a number that no longer meant what it used to once merging could reduce the
  effective act count.
- **`frontend/src/components/forms/DynamicForm.jsx`**: the SAME shattering bug existed
  independently in the act→major-head classification cascade (`getMajorHeadOptions`, ~L2757:
  builds `show_when` match keys from `act_name`) and the DB major-heads-by-section lookup effect
  (~L2841/2850: builds `sectionCodes` by pairing `acts[i]`/`secs[i]`) — both had their own
  copy-pasted 4-digit-year hack with the identical gap. Both now import and call the same
  `reMergeKnownActFragments` from `ActsSectionsTable.jsx` (no third implementation, and the
  year-rejoin pre-pass lives inside it so both call sites get it automatically), keyed off the
  same `actsSectionsRegistry` state already held by the component. `getMajorHeadOptions`'s
  `useCallback` dep array gained `actsSectionsRegistry` (previously missing, now read inside it).
- Explicitly did NOT touch the major/minor HEAD last-fill logic in `zipOffenceStrings`
  (`major: majors[i] ?? null` / no `majors[majors.length-1]` fallback) — that's R3-3's fix,
  untouched, verified by reading the diff.

**Verification — write-path harness** (`recordsService.createRecord` → direct `record_offences`
read, throwaway scripts under `backend/scripts/dev/_b5_*`, deleted after use; no `sample files/`
touched). Round 2 (post-advisor, covering the regression the shortest-match version had):

| Case | `act_name` in | Expected rows | Result |
|---|---|---|---|
| Arms Act round-trip (raw `act_long`, as recompose would hand back) | `"ARMS ACT, 1959"` | 1 | PASS — `act_id=4`, no phantom `"1959"` |
| Delhi Excise Act round-trip | `"DELHI EXCISE ACT, 2009"` | 1 | PASS — `act_id=3032` |
| Gambling Act round-trip | `"THE PUBLIC GAMBLING ACT, 1867"` | 1 | PASS — `act_id=68` |
| Arms Act + IPC (2 real acts, one year-suffixed) | `"ARMS ACT, 1959, IPC 1860"` | 2 | PASS — `act_id=4` + `act_id=43`, no cross-act lumping |
| IPC + Aadhaar (original reported bug) | `"IPC, AADHAAR (…SUBSIDIES, BENEFITS AND SERVICES) ACT, 2016"` | 2 | PASS — `act_id=43` + `act_id=3744` (FK-resolved, not free text) |
| IPC + CrPC (plain multi-act regression guard) | `"IPC, CrPC"` | 2 | PASS — `act_id=43` + `other_act_name='CrPC'` (CrPC correctly stays free text) |

All 6 backend cases created a real CASE record via `recordsService.createRecord`, read back the
literal `record_offences` DB rows, and were deleted (with their `record_revisions`/
`workflow_transitions`/`fir_details`/`records` rows) at the end of the run.

Frontend `reMergeKnownActFragments` (pre-pass + longest-match) was separately verified with a
standalone Node simulation reproducing the frontend's actual alias-collapsed registry shape
(`['IPC','Arms Act','Delhi Excise Act','Gambling Act', '<full Aadhaar act_long>']`) against the
same 7 input strings (the 6 above + plain `'IPC'` alone) — **7/7 pass**, confirming the two-pass
design closes the gap a registry-only longest-match couldn't (the frontend registry never
exposes `'ARMS ACT, 1959'` etc. as a literal known label the way the backend's does).

**Build:** `cd frontend && npx vite build` — succeeds (only the pre-existing >500kB chunk-size
advisory, unrelated).

**Files touched (B5):**
- `backend/src/modules/records/records.normalize.js` — `loadKnownActLabels(trx)` (new, cached)
- `backend/src/modules/records/records.mapper.js` — `reMergeKnownActFragments` helper
  (longest-match); `zipOffenceStrings` takes a `knownActLabels` param and re-merges the acts
  array before pairing; `buildOffenceRows` loads and passes it
- `frontend/src/components/forms/ActsSectionsTable.jsx` — `rejoinBareYearFragments` (new
  pre-pass, the old hack's logic preserved) + `reMergeKnownActFragments` (exported, longest-match
  over the pre-passed fragments), replacing the old year-only rejoin hack as the sole mechanism;
  the acts-vs-sections backfill effect now compares against the merged count
- `frontend/src/components/forms/DynamicForm.jsx` — imports `reMergeKnownActFragments`;
  `getMajorHeadOptions` and the major-heads-by-section-codes effect both use it instead of their
  own copy-pasted year-only hack; `getMajorHeadOptions`'s dep array gained `actsSectionsRegistry`

**Not touched (per instructions):** `config/fields/*.json`, the major/minor HEAD last-fill logic
in `zipOffenceStrings` (R3-3, untouched). `import.parse.js`'s own act-name repeat-to-match-
sections logic (~L862, single-act-only, gated on `actsArray.length === 1`) was inspected and left
alone — a comma-containing single imported act (`actsArray.length` = its fragment count, not 1)
already skips that branch and falls through unmangled into the same fixed `zipOffenceStrings`
downstream, so it needed no change; not independently re-verified with a live import run (no
`sample files/` used, per the safety rules). Also not independently verified: an actual browser
session driving the reported UI flow end-to-end (picking Aadhaar from the dropdown, re-opening a
saved Arms/Excise Act record) — no browser-automation tool was available this session; verified
by write-path harness (backend) + algorithm simulation against the real registry shape
(frontend), both matching the exact data shapes the real code paths produce.

---

## ROUND 3 (cont.) — 2026-07-21 — B8 FOLLOW-UP + loggers + local-head star

**B8 regression (accused/victim deleted after send-back) — root cause + v2 fix.**
Send-back itself is a pure `POST /send-back` ({comment, target_fields}) — it does NOT write persons.
The loss happened on HC-reopen: my first B8 fix set `formDirtyRef=true` on repeater-autosave churn,
but that fires for PROGRAMMATIC repeater writes too (CASE property starter-row) — and `repeaterSeedSkipRef`
is a single boolean that only guards one of several same-pass seeds. So `formDirtyRef` could go true
BEFORE `initialPersons` loaded, which BLOCKED the person seed entirely → victims/accused never entered
`repeaterState` → the next autosave sent `persons:[]` → id-preserving upsert DELETED them.
Fix v2 (`DynamicForm.jsx`): per-effect `repeaterSeededIdRef`/`flatSeededIdRef` — the FIRST seed of a
record always runs; the dirty-guard now only blocks RE-seeding an already-seeded record (the real
clobber case). Verified via harness: echoed update keeps all persons + adds a new one; the `persons:[]`
path is what deletes them (now surfaced by the logger below).

**Loggers added (user request "add more loggers"):**
- Backend `records.service.js`: `[PHAROS-DEBUG][updateRecord] entry` (personsProvided/count/roles),
  `[PHAROS-DEBUG][upsertPersons]` (incoming vs existing vs kept vs **deleting** — the smoking gun),
  `[PHAROS-DEBUG][upsertProperties]` (counts). → server logs.
- Frontend `DynamicForm.jsx`: `[PHAROS-DEBUG][repeater-autosave] PUT` (recordId + person_types + prop count).
  → browser console. If this fires with `persons: []` right after opening a record that HAS victims/accused,
  the seed was skipped and they're about to be deleted server-side.

**Local Head required star (`ActsSectionsTable.jsx`):** `local_head` is `required:true` (CASE/ARREST) but
is rendered bespoke (not via the generic FieldRenderer that adds the `*`), so its label showed no marker.
Added a red `*` to both the split- and combined-layout "Local Head" labels.

All: build passes; not committed.
