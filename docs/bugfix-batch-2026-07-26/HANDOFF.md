# BUGFIX BATCH — 2026-07-26 — HANDOFF / PROGRESS LOG

**Owner:** Engineering Director (Opus orchestrator) · **Branch:** `dev2/ashmit`
**Evidence base:** tester bug spreadsheet screenshots + fresh tester logs in
`temp delete later/logs(1)/logs/` (backend.log 20MB, error.log, 7 frontend NDJSON sessions,
session window **2026-07-25 20:40 → 23:11**).
**Binding:** `docs/ENGINEERING_BASELINE.md` (P1–P6). ONE write path = `records.service.js`.
Frozen import template (P3). Config→DB requires `npm run sync-config`.

> ⚠ **Log provenance is decisive this round.** The previous batch's fixes were committed at
> **2026-07-25 18:34** (`58cb09d`), and this tester session ran **20:40–23:11** — i.e. the tester
> WAS running the fixed code. Everything reported here is a **live** bug, not a stale trace.
> This is the opposite of the 2026-07-23 batch, where one reported "crash" turned out to be a
> log entry from deleted code.

---

## STABLE BUG IDS (C-series — the screenshots use several colliding numbering schemes)

Legend: ⬜ not started · 🔎 investigating · 🟡 in-progress · ✅ done · ⏸ blocked · ❓ needs user input

| ID | Severity | Bug (short) | Owner | Status |
|----|----------|-------------|-------|--------|
| **C1** | 🔴 CRITICAL | DCP sees near-EMPTY records after SHO approval (act/section, major/minor head, occurrence, complainant/victim/accused/property all blank; ARREST shows only arrestee name; UIDB only body place+date; MISSING only missing date+status) | Director | ✅ **FIXED + VERIFIED** |
| **C17** | 🟠 | Tester DB schema drift — `persons.gender varchar(10)` crashes every save of a TRANSGENDER person | Director | ✅ **FIXED + VERIFIED** |
| **C15** | 🟠 | Submit still rejected: "Information received at P.S., Source / Reference of Complaint, Sections" (×32, `submitRecord: failed` ×30) | BE-records | ⬜ NOT STARTED (agent killed) |
| **C16** | 🟠 | `upsertProperties: FULL WIPE` ×32 — properties silently wiped on update (persons got a guard, properties never did) | BE-records | ✅ **FIXED + VERIFIED** (guard holds on `properties:[]`) |
| **C4** | 🟡 | ARREST edits/imports don't persist: NAFIS Prepared, Dossier Prepared, Proclaimed Offender, Arresting Officer (+Rank, +Contact), Custody status | BE-records | ⬜ NOT STARTED (agent killed) |
| **C18** | ⚪ | `record_offences_act_id_fkey` violation → raw 500 instead of a clean validation error | BE-records | ⬜ NOT STARTED (agent killed) |
| **C2** | 🟡 | ARREST form renders TWO arrest-time inputs ("Date & Time of Arrest" composite + standalone "Time Of Arrest") | FE-forms | ✅ **FIXED + A/B VERIFIED** |
| **C3** | ⚪ | "Contact of Arresting Officer" accepts free text (should be phone) | FE-forms | ✅ **FIXED + VERIFIED** |
| **C5** | 🟡 | UIDB age accepts text (re-report — B9's attribute-only fix was insufficient) | FE-forms | ✅ **FIXED + A/B VERIFIED** |
| **C6** | 🟡 | MISSING "Is Permanent Address same as Current Address?" (complaint TRUNCATED in screenshot) | FE-forms | 🟡 dispatched · ❓ needs verbatim text |
| **C7** | 🟠 | Import: property of interest missing after CASE import | BE-import | ✅ **NOT AN IMPORT BUG** — properties land correctly; loss was C16 |
| **C9** | 🟠 | ARREST import: property category "nhi aaya" (doesn't appear) | BE-records | 🟡 arms/drugs ref-table resolution landed, UNVERIFIED |
| **C8** | 🟡 | Duplicate FIR: `UNIQUE(ps_id,fir_year,fir_no)` inert because fir_year was NULL | BE-records | 🟡 `fir_year` now derived on write; ⬜ backfill + form warning NOT done |
| **C11** | 🟡 | "Inquest filled by ACP/SDM" not importing (UIDB, not MISSING) | BE-import/records | 🟡 WARNING added; ⬜ value coercion (ruling R5) NOT done |
| **C10** | ⚪ | "Import batches button is not showing history" | BE-import | ✅ fix verified correct (endpoint, RBAC, response shape all checked) |
| **C13** | 🔵 FEATURE | Add 3 columns to import template: GD Number (CASE), Information received at P.S. (date+time), Source of Information (General Info) | BE-import | 🔴 REVERTED — unsafe, see below |
| **C12** | 🔵 FEATURE | "No Kalandra in filter" — add derived Kalandra / Arrest-against-FIR filter entries | FE-filters + BE-records | 🟡 FE done, backend NOT STARTED |
| **C14** | ⚪ | "need scheme of arrest in form" | — | ❓ needs user clarification (term undefined) |
| **C19** | 🔵 | (E2E-DISCOVERED) Workflow could never reach HQ without JCP+SCP approvals — DCP approve parked records at `JCP_REVIEW`; 13 already stranded | Director | ✅ **FIXED + E2E VERIFIED** (DIRECT_HQ route) |

Screenshot→ID map: img2 (#6 DCP login) → **C1**; img3 (arrest/UIDB/missing at DCP) → **C1**;
img4 (#2 Arrest form) → C2, C3, C4; img5 (#4/#5) → C5, C6; img5 (#18 Import errors) → C7, C8, C9, C10;
img6 (Missing import / filter / #17 other errors) → C11, C12, C13, C14.

---

## USER RULINGS OBTAINED (2026-07-26, before any code was written)

- **R1 — Masking policy:** *"Full record for DISTRICT/ACP/JCP/SCP, summary only at HQ."*
  DISTRICT/JCP/SCP are approval steps and must read the whole record to approve it; HQ_RECEIVED is
  terminal receipt where a summary contract is defensible.
- **R2 — P3 template sign-off:** *"Approve — add all three columns now."* This bug list is accepted
  as the explicit P3 sign-off for the three new import-template columns (C13). Director's added
  constraint: **append-only, far right**, so already-distributed/filled sheets keep parsing.
- **R3 — Kalandra definition (verbatim):** *"add kalandra and arrest (against fir) as derived filter
  entries based on multiple factors like is dd based or like there is no fir linked then its
  kalandra. (these are OR conditions not and coz there are many dumb users)"*
  ⇒ **Kalandra = `is_dd_based IS TRUE` OR no CASE_ARREST link OR no FIR number.** Deliberately OR'd
  because operators fill the discriminator inconsistently. `AGAINST_FIR` = the complement.

- **R4 — Duplicate FIR (2026-07-26):** *"Populate fir_year on write + warn in the form."* Reactivate
  the `UNIQUE(ps_id, fir_year, fir_no)` constraint by deriving `fir_year` on every write; the
  interactive form **warns** (does not hard-reject); import keeps its row-level rejection.
- **R5 — Inquest boolean (2026-07-26):** *"SDM or ACP = Yes; None/Nil/blank = No."* Applies to both
  import and interactive paths. User explicitly accepted that WHICH authority filed it is not
  preserved (the column is boolean per D2).

---

## 🔴 C8 — DUPLICATE-FIR PROTECTION IS INERT (Director-verified at DB level)

`fir_details` carries `UNIQUE(ps_id, fir_year, fir_no)` — the right constraint. But **`fir_year` is
NULL in all 28 rows**, and Postgres treats NULL as always-distinct, so **the constraint can never
fire**. Proven in a rolled-back transaction: two rows at the SAME `ps_id` with the SAME `fir_no`
coexist freely; the instant `fir_year` is set on both, Postgres rejects with
`duplicate key value violates unique constraint "fir_details_ps_id_fir_year_fir_no_key"`.

Compounding it: `records.controller.js`'s `create` never calls the existing `/records/check-duplicate`,
so `POST /records` accepts a duplicate FIR **silently**, while bulk import correctly rejects it —
the two write entry points disagree.

⚠ **Partial correction to the BE-import agent's report:** it flagged existing duplicate FIR numbers
in the DB as evidence of the bug. Director check: those duplicates are all **cross-PS**, which is
**legitimate** (FIR numbers are per-station — that's exactly why the constraint is composite). There
are currently **zero same-PS duplicates**, so the ruling-R4 backfill is safe. The structural hole is
real; the "duplicates already exist" framing was not.

---

## 🔵 C19 — WORKFLOW COULD NEVER REACH HQ WITHOUT JCP+SCP (found by E2E, FIXED + VERIFIED)

**Found by driving the full chain, not by reading code.** The user's stated operating model is
**HC → SHO → DCP → HQ** ("JCP & SCP are for future side branches and not currently relevant").
The workflow config implemented no such path — the ONLY route to `HQ_RECEIVED` was:

```
DISTRICT_REVIEW --approve--> JCP_REVIEW --approve--> SCP_REVIEW --approve--> HQ_RECEIVED
                              (role JCP)              (role SCP)
```

So a DCP approval parked the record at `JCP_REVIEW` awaiting a role nobody is staffing.
**13 records were already stranded** (7 at `JCP_REVIEW`, 6 at `SCP_REVIEW`) — silent backlog, no
error anywhere. Neither the tester nor the bug list caught this because it isn't a visible failure;
the record simply stops moving.

**Fix — config only, zero code.** `workflow.engine.js` (`resolveTarget`, ~line 103) already
implements exactly this: if an active `level_data_contracts` row with `from_level='DISTRICT'`,
`to_level='HQ'` has `route='DIRECT_HQ'`, a DISTRICT_REVIEW approve short-circuits to `HQ_RECEIVED`.
The mechanism was built and then never switched on. Set `LDC_DIST_HQ_ALL.route` `OPS_CHAIN` →
`DIRECT_HQ` in `config/contracts/ops_chain.json` + `npm run sync-config`. JCP/SCP transitions stay
in config, dormant, ready for when those roles go live — nothing was deleted.

**Verified end-to-end (real API, real Postgres):**
```
1. HC create            -> 201  DRAFT
2. HC submit            -> 200  PENDING_SHO
3. SHO approve          -> 200  DISTRICT_REVIEW
4. DCP approve          -> 200  HQ_RECEIVED     ← was JCP_REVIEW before the change
```
- `workflow_transitions` ledger: `DRAFT→PENDING_SHO(SUBMIT)`, `PENDING_SHO→DISTRICT_REVIEW(APPROVE)`,
  `DISTRICT_REVIEW→HQ_RECEIVED(APPROVE)` — clean, no skipped/forged rows.
- **`npm run audit:verify` → hash-chain intact**, 0 breaks, before and after.
- Record confirmed present in HQ_ANALYST's `?status=HQ_RECEIVED` list.
- Masking held correctly throughout: DCP 35 data keys + full VICTIM/ACCUSED; HQ 7 keys + contentless
  persons (intended per R1).
- **User ruling: the 13 already-stranded records are left as-is** (dev data, disposable).
- All E2E test records deleted afterwards; hash chain re-verified clean (232 revisions / 66 records).

⚠ Note for whoever deploys this: `notifications.record_id` has a FK with no cascade, so deleting a
record requires deleting its notifications first. Irrelevant in production (records are never
deleted — append-only) but it bites when cleaning up test data.

---

## CONFIRMED ROOT CAUSES

### C1 — DCP sees empty records = **level-contract masking with stub whitelists** ✅ FIXED

Not a rendering bug, not a data-loss bug: the backend was **deliberately deleting the fields on the
way out**, exactly as configured.

`config/contracts/ops_chain.json` authored `LDC_PS_DIST_ALL` with **23** `visible_field_keys` and
`LDC_DIST_HQ_ALL` with **15**. `levelContracts.service.js` drops every domain key not on that list
(§MASKING RULE), including each `persons[i].data` and `properties[i]`. The contracts were written
back when masking was a **silent no-op**; Integration 5 (2026-07-20) turned masking ON without
revisiting them.

**The whitelist predicts all four reported symptoms exactly** — this is what makes the diagnosis
airtight rather than plausible:

| Tester's words | Contract explanation |
|---|---|
| "act and section become empty" | `act_name`/`sections` absent from both contracts |
| "major head, minor head become empty" | `major_heads`/`minor_heads` absent |
| "entire occurrence section becomes empty" | only `occurrence_place` listed; every other occurrence key dropped |
| "complainant, victim, accused, property become empty" | no victim/accused/property keys at all → each array item degrades to `{id, person_type, data:{}}` |
| ARREST: "arrested person becomes empty (**only name is visible**)" | `arrested_first_name`/`middle`/`last` are the **only** person keys in the contract |
| UIDB: "everything empty, only **place of body found, date of body found**" | `found_place` + `found_date` are present, nothing else |
| MISSING: "everything empty except (**date of missing and status**)" | `missing_date` + `missing_status` are present, nothing else |

**Hard confirmation from the tester's own logs:** `maskRecordDetails: exit — masking applied …
"visibleKeyCount":23, "personCount":0, "propertyCount":0` — 3,662 masking events in the session.

The "3 field(s) need your attention" panel in the DCP screenshot is a **downstream effect**, not a
separate bug: the read-only form validates the masked payload and reports the masked-away required
fields as missing.

**Fix (Director, per ruling R1):**
1. `levelContracts.service.js` — `resolveMasking()` treats a `["*"]` contract as "full record"
   (returns `null`, the same fail-open path already used for PS roles). Chosen over deleting rows so
   each row's `aggregate_definitions` survives and the workflow engine's `DIRECT_HQ` route lookup
   (`workflow.engine.js:104`, which reads these same rows) is untouched.
2. `config/contracts/ops_chain.json` — `LDC_PS_DIST_ALL` → `["*"]`; **new** `LDC_DIST_JCP_ALL` and
   `LDC_JCP_SCP_ALL`, both `["*"]`. `LDC_DIST_HQ_ALL` deliberately **unchanged** (HQ stays a summary
   per R1). Authoring explicit JCP/SCP rows also retires the `LEVEL_FALLBACK` hack that was routing
   JCP/SCP onto HQ's *even smaller* 15-key list.
3. `npm run sync-config` → `contracts → level_data_contracts +2 inserted, ~1 updated`.

**Verification — real HTTP against the running backend + live Postgres, not a code read.**
Record `09439a1e-89a0-4395-b2ee-3b5b19deb7f8` (CASE with VICTIM + ACCUSED):

| Role | `record.data` keys | persons |
|------|-----|---------|
| DO001 (DISTRICT_OFFICER) | **43** | VICTIM(6 fields), ACCUSED(6) |
| JCP001 | **43** | VICTIM(6), ACCUSED(6) |
| SCP001 | **43** | VICTIM(6), ACCUSED(6) |
| HC001 / SHO001 (regression) | 43 | VICTIM(6), ACCUSED(6) — unchanged |
| HQA001 / HQD001 (intended) | 7 | VICTIM(0), ACCUSED(0) — summary per R1 |

Offence rows now carry real `act_label`/`section_label` for DCP. **No RBAC regression:** DO002
(a different district) still gets *"Access denied: Record falls outside your district
jurisdiction"* — P5 jurisdiction scoping is intact and independent of masking.

### C17 — tester DB schema drift (NOT a code bug on our side) ✅ FIXED

`error.log`: `insert into "persons" (…) - value too long for type character varying(10)`.
Current `20260711000004_persons_properties.js` declares `gender varchar(20)` — so this cannot
happen on a fresh DB, and the local docker DB is indeed at 20.

**Root cause: an earlier session EDITED AN ALREADY-APPLIED MIGRATION IN PLACE.** Git confirms the
original (`77bd38d`) declared `gender varchar(10) CHECK (… no TRANSGENDER)`; the widening lived in a
standalone `…000007` migration that was later folded into `…000004` and **deleted**. Knex records
`…000004` as run, so **any database provisioned from the original file keeps the narrow column
forever and can never receive the fix** — `npm run db:migrate` is a no-op for it. Same drift affects
`record_properties.status` (missing `'INVOLVED'`).

Fix: new **forward** migration `backend/migrations/20260726000001_repair_legacy_column_drift.js` —
idempotent, schema-only, no-op on healthy DBs, `down()` intentionally a no-op.

**Verification:** ran clean on the local DB (Batch 2, resulting constraints byte-identical to what
`…000004` declares). Repair proven on an isolated replica of the drifted schema inside a rolled-back
transaction: `INSERT … 'TRANSGENDER'` → *"value too long for type character varying(10)"* before,
`INSERT 0 1` after. Scratch table rolled back; DB left untouched.

---

## AGENTS DISPATCHED (2026-07-26, parallel, Sonnet, file-disjoint)

| Agent | Owns | Bugs |
|---|---|---|
| **BE-records** | `backend/src/modules/records/**` | C15, C16, C4, C18, C12-backend |
| **FE-forms** | `frontend/src/components/forms/**`, `frontend/src/utils/fieldPatterns.js`, `config/fields/{arrest,uidb,missing}.json` | C2, C3, C5, C6 |
| **BE-import** | `backend/src/modules/import/**`, `backend/scripts/import-*`/`template-*`, `config/fields/{case,common}.json`, `frontend/src/pages/admin/LegacyDataPage.jsx` | C7, C9, C8, C11, C10, C13 |
| **FE-filters** | `frontend/src/components/common/**`, `frontend/src/i18n/{en,hi}.json` | C12-frontend |

**Contention control.** `config/fields/*.json` is split by file (arrest/uidb/missing → FE-forms;
case/common → BE-import) — the 2026-07-23 batch showed a single-owner rule per file is what keeps
parallel agents from clobbering each other. `records.service.js` is BE-records' alone; BE-import
must route through `createImportedRecord` and report rather than edit. The Director owns this
HANDOFF; agents report back and do not edit it.

**Cross-agent contract (C12), fixed in advance so the two halves can't diverge:**
`GET /api/records?record_type=ARREST&arrest_kind=KALANDRA|AGAINST_FIR`; omitting the param behaves
exactly as today. Backend decides Kalandra-ness (P4 — the frontend must not classify locally).

---

## CHANGE LOG

- **2026-07-26 — C1 FIXED (Director).** `backend/src/modules/level-contracts/levelContracts.service.js`
  (wildcard support in `resolveMasking` + a scope-update comment block), `config/contracts/ops_chain.json`
  (DISTRICT → `["*"]`; new JCP/SCP wildcard rows; HQ unchanged), `npm run sync-config`. Verified by
  real API responses for 7 roles (table above).
- **2026-07-26 — C17 FIXED (Director).** New `backend/migrations/20260726000001_repair_legacy_column_drift.js`.
  Verified by running it, and by reproducing + repairing the drift on an isolated replica.
- **2026-07-26 — C12 frontend landed (FE-filters agent), reviewed by Director.**
  `UnifiedFilterStrip.jsx` (two derived entries resolving to `{type:'ARREST', arrestKind:…}`;
  no client-side classification, per P4), `FilterPresetsPanel.jsx` (saved presets round-trip the
  new key — it was silently reverting to "all arrests" on load), `i18n/{en,hi}.json`.
  **Director verified the agent targeted the correct component**: `en.json`'s `recordTypes.*`
  values match the tester's screenshot labels ("Cases (FIR) Master" / "Arrest Person Master" /
  "PCR" / "UIDB Unidentified Bodies"), whereas `StationFilters.jsx`'s backend-supplied labels
  (`fields.controller.js listRecordTypes`: "Cases Master (FIR)" / "Arrests") match none of them.
  **Director closed the agent's flagged gap:** `frontend/src/pages/hc/MyRecords.jsx` (owned by no
  agent) never forwarded the key, so the filter was inert — added `params.arrest_kind`.
  ⏳ Still blocked on BE-records' `arrest_kind` half; **not signed off**.
  ⚠ Seed-data caveat found by the agent: all 10 ARREST records currently satisfy the Kalandra
  OR-definition and 0 satisfy against-FIR, so a passing test could be a false positive —
  an against-FIR arrest must be constructed before this is accepted.
  ⚠ Deliberately NOT extended to `StationPerformanceDashboard.jsx` (via `StationFilters.jsx`):
  it filters a pre-fetched list client-side by strict `record_type` equality, so adding Kalandra
  there would force the frontend to evaluate `is_dd_based`/link-existence itself — a P4 violation.
  Correctly flagged rather than worked around; registered as future work.
  ⚠ Hindi string `कलंदरा (गैर-एफआईआर गिरफ्तारी)` was coined by the agent (no prior rendering
  existed) — wants a native-speaker check before ship.

---

## ⚠ SESSION-LIMIT INTERRUPTION (2026-07-26) — STATE OF THE TREE

Three of the four agents (**BE-records, FE-forms, BE-import**) were **killed mid-task by an API
session limit** and produced **no handoffs**. The Director triaged the partial edits they left.

**`backend/src/modules/records/**` is UNTOUCHED** — BE-records died before writing anything, so
**C15 / C16 / C4 / C18 / C12-backend have zero partial changes** and are simply not started.

### 🔴 C13 REVERTED — the template edit was NOT append-only (P3 violation caught)
BE-import removed `gd_no` / `info_received_at_ps_date_time` / `source_reference` from
`TEMPLATE_EXCLUDE_KEYS.CASE` so the registry auto-include would emit them, commenting that this
yields "APPENDED columns … never inserted mid-sheet". **That assumption was wrong**, and the agent
died at the exact moment it was about to check ("now let's regenerate the CASE template and inspect
the new columns"). `node scripts/template-regression.js check` proves the real effect:

```
CASE/General Information col 57 ('work_out'):      key changed "work_out" -> "info_received_at_ps_date_time"
CASE/General Information col 58 ('work_out_date'): key changed "work_out_date" -> "gd_no"
CASE/General Information col 59 (new):             -> "source_reference"
CASE/General Information col 60 (new):             -> "work_out"        ← shifted from 57
CASE/General Information col 61 (new):             -> "work_out_date"   ← shifted from 58
```

The auto-include mechanism inserts in **registry order**, not at the end. Every already-distributed
and already-filled CASE sheet would misparse — data typed under "WorkOut" read as "Information
received at P.S.", "WorkOut Date" read as "GD Number". Exactly the failure P3 exists to prevent.
**Reverted** (`git checkout -- backend/src/modules/import/import-fields.config.js`).
C13 remains APPROVED by the user but needs a **genuine append mechanism** — the columns must be
forced to the far right of the sheet, not handed to registry-order auto-include. Re-scope before
retrying. Verified after revert: `import:parity` ✅ green, `sync-config` ✅ clean, backend ✅ healthy.

### 🔴 PRE-EXISTING, INDEPENDENT OF THIS BATCH — the frozen-template baseline is already stale
Running the same check with **the agent's edit fully reverted** still reports
**173 template differences** against `backend/scripts/template-baseline.manifest.json`
(the edit accounted for only 23 of the 196). Sample of what has already drifted:
```
KALANDRA/General Info col 32 ('prop_other_value'): key changed "prop_other_value" -> "prop_elec_model"
KALANDRA/General Info: column 42 REMOVED ('prop_elec_serial')   … 5 columns REMOVED in total
KALANDRA/Arrested Person col 4 ('arrest_place'): label "House No. of Arrest" -> "Place of Arrest"
```
**⇒ P3's frozen-template guarantee is currently NOT being enforced.** The baseline was never
re-blessed after earlier changes, so the guard that should have caught the C13 insertion has been
failing-by-default for some time. This is arguably more serious than any single bug in this batch
and is **not** something to "fix" by running `template-regression.js baseline` blindly — that would
rubber-stamp 173 unreviewed changes, including 5 removed columns. Each drift needs to be classified
as intended-or-not first. **Needs a decision before the next import-template change.**

### KEPT but UNVERIFIED (coherent, self-consistent, no handoff — treat as untested)
| Bug | File(s) | Director's assessment |
|---|---|---|
| **C2** arrest-time duplicate | `DynamicForm.jsx` | Adds the `keysToSkip` guard to the arrest sub-tab's generic field loop, mirroring `FormSection.jsx`. Diagnosis (label row rendered above a FieldRenderer-suppressed input) is plausible and matches B8's known shape. **Needs visual confirmation.** |
| **C3** officer contact | `config/fields/arrest.json` + `FieldRenderer.jsx` | Consistent: `mobile` pattern already existed in `fieldPatterns.js`; DB confirmed `{"pattern":"mobile","required":false}` on `arresting_officer_mobile`. Stays optional. Low risk. |
| **C5** UIDB age | `FieldRenderer.jsx` | Adds a keystroke filter for the existing `age_range` pattern. Deliberately does NOT reduce to digits-only, preserving legitimate `"25-30"` / `"60+"` / `"unknown"` values — correct reasoning. **Needs visual confirmation.** |
| **C10** batch history | `LegacyDataPage.jsx` | Removes an `&& !isHC` gate so an HC's batch list refetches after their own import. Plausible, low risk, **unproven as the actual cause.** |
| **C6** MISSING perm-address | — | Not reached; agent died while starting it. |

No partial edit was left in a syntactically broken or half-applied state; the revert above was the
only unsafe one.

## ✅ BROWSER E2E VERIFICATION (Director, 2026-07-26) — real Chromium, real backend :5000, real Postgres

**Harness note:** the Playwright **MCP** cannot launch here — it is pinned to the system-Chrome
channel (`/opt/google/chrome/chrome`), which is not installed and needs root. Same blocker the
2026-07-23 session hit. Worked around by driving Playwright's **bundled** Chromium
(`~/.cache/ms-playwright/chromium-1234/chrome-linux64/chrome`) via `playwright-core` from Node.
**Permanent fix for future sessions:** add `"--browser","chromium"` to the playwright MCP `args`
in `~/.claude.json`. App confirmed on **Live API** (real JWTs, real district ids), not mock mode.

**Method note — every claimed fix was A/B tested** (run with the patch, then with the file reverted
to HEAD, then restored and re-verified). This caught two *invalid* test runs where `git stash`/
`git checkout` silently failed due to a wrong working directory and both runs unknowingly had the
patch applied. **A/B with explicit before/after assertion of the file state is the only trustworthy
method here** — a single-sided observation would have produced a wrong verdict twice.

| Bug | Verdict | Evidence |
|---|---|---|
| **C1** | ✅ **VERIFIED FIXED** | As DO001 on CASE `09439a1e`: form fields populate (`GD/2004`, FIR `105/2026`, `cctns(manual FIR)`, `Written Complaint`, Local Head `Simple Hurt` — all previously masked away). **VICTIM LIST renders `Suresh Verma`, ACCUSED LIST renders `Accused4 Kumar`** — the tester's screenshot showed these as `—`. Acts & Sections shows `IPC 1860 / 356`. Workflow history shows names not UUIDs (B2 holding). The residual `—` under Address is **genuine absent data**, confirmed in DB (`present_location_id IS NULL` for both) — not masking. |
| **C2** | ✅ **VERIFIED FIXED — real bug, load-bearing fix** | Arrested-person modal → **"Arrest Details"** sub-tab. WITHOUT patch: `["Date & Time of Arrest","Time Of Arrest"]` (duplicate reproduces exactly as reported). WITH patch: `["Date & Time of Arrest"]`. Other 3 sub-tabs unaffected. ⚠ The duplicate is ONLY on that sub-tab — earlier probes of the form's top level and of the detail/edit views found nothing, which is why sub-tab-level testing was required. |
| **C3** | ✅ **VERIFIED FIXED** | `field-arresting_officer_mobile` (modal → "Particular Details"): `"abcd"`→`""`; `"98100abc00148"`→`"9810000148"`; `"9810012345678"`→`"9810012345"` (capped at 10). Remains optional. |
| **C5** | ✅ **VERIFIED FIXED — load-bearing** | `field-approx_age` (UIDB DETAILS tab). WITHOUT patch: `"abcdef"`→`"abcdef"`, `"ag25e"`→`"ag25e"` (the reported bug). WITH patch: `"abcdef"`→`""`, `"ag25e"`→`"25"`, while **`"25-30"`, `"60+"`, `"unknown"`, `"30"` all preserved** — the range/unknown use case is intact. |
| **C10** | ⬜ not tested | Requires a full import run; deferred to the BE-import agent. |
| **C12** | ⏸ blocked | Backend `arrest_kind` not landed at time of testing. |

**Incidental findings (new, not in the tester's list):**
- The **DCP queue list** shows `RECORD DATE = N/A` and `GIST = "No description logged"` for every
  row. Worth triaging separately — cosmetic but it makes the approval desk hard to use.
- The ARREST intake has an explicit **"Against FIR" vs "Kalandra / Preventive"** first step, i.e.
  the `is_dd_based` discriminator IS captured at entry. Relevant to C12: the OR-based definition is
  a safety net for bad data, not the only signal.
- ⚠ **A stale `git stash` exists** (`stash@{0}`, based on `7fdc01c`, 108 files / +4,724 lines).
  Its contents are **already committed in HEAD** (verified). It is a leftover snapshot from the
  previous session and a landmine — anyone running `git stash pop` would clobber current work.
  Recommend dropping it deliberately once confirmed with the user.
- ⚠ The BE-import agent left ~14 `backend/*_tmp.mjs` scratch files; they need cleanup before commit.

## BE-IMPORT AGENT — REPORTED DONE (2026-07-26, round 2) — Director-reviewed

Only ONE code change (`import.validate.js`, +12 lines). The rest of its value was **diagnosis**,
including correctly declining to "fix" a non-bug. `import:parity` green; test batches/records and
its temp scripts cleaned up.

- **C7 — NOT AN IMPORT BUG (established, not assumed).** Ran a real CASE import end-to-end
  (validate → confirm → async RabbitMQ confirm → `psql`) with 2 properties from a real tester sheet:
  **both property rows landed correctly**, with `major_category_id`/`minor_category_id` resolving to
  the right `ref.*` labels. ⇒ The tester's "property doesn't come after import" is **downstream
  loss** — i.e. C16 (`upsertProperties: FULL WIPE`) when the imported record is later opened/edited.
  Correctly changed nothing. **This is exactly the outcome the assignment asked it to establish.**
- **C9 — mechanism works; a bigger real gap found.** ARREST *is* covered by the `validateRefLabels`
  WARNING path and clean categories resolve fine. But `resolvePropertyMinorCategory`
  (`records.normalize.js`) only consults `ref.other_property_items` and never the arms/drugs-specific
  ref tables — so against the real ARREST sample, **11 of 15 filled property rows** (DRUGS/ARMS,
  labels like "LIQUOR BOTTLE"/"ARMS") can never resolve: major lands, minor silently NULLs.
  Out of its ownership → handed to BE-records (Task A).
- **C11 — root cause proven live.** `import.parse.js` has no BOOLEAN cell coercion, so raw "ACP"
  reaches `coerceByType` → `toBool` (recognises only yes/true/1/y, no/false/0/n) → **NULL, zero
  signal**. Reproduced with a live import landing `filed_by_acp_sdm = NULL`. Also confirmed the
  field is on **UIDB**, not MISSING (tester mis-filed it), and that checked-in sample templates still
  carry the pre-D2 `"select: SDM, ACP, None"` text. Added a `VALUE_SALVAGED` **warning** (fires for
  "ACP", silent for "Yes" — no false positives; row still imports). Real coercion → BE-records
  (Task C) under ruling R5.
- **C8 — current behaviour established precisely.** Import does **row-level** rejection (not
  whole-batch) with a clear `DUPLICATE_IN_DB` error naming FIR + station; the valid row still
  imports; errors persist post-confirm for audit. **Nothing defective on the import side.** Its
  cross-check of the interactive path is what surfaced the inert-constraint hole (see §C8 above).
- **C10 — kept fix verified correct.** `GET /import/batches` is routed and RBAC-reachable for
  HC + DISTRICT_OFFICER, the response shape matches what `BatchTable` renders (no stale-field-name
  regression like the 2026-07-23 one), and the removed `&& !isHC` gate was the only thing suppressing
  an HC's post-import refresh. Diagnosis and fix confirmed sufficient.
- **Agent's own stated limitation (kept honest):** it tested with freshly-generated current templates
  filled with real messy values, **not** by uploading the old sample files directly — so
  **older template layouts were not re-verified this round**. Legacy-layout parsing remains untested.

## OPEN / NEEDS USER INPUT

- **C6 / C8** — the tester's lines are cut off at the right edge of the screenshots. Verbatim text
  needed:
  1. `IN MISSING " IS PERMANENT ADDRESS SAME AS CURRENT ADDR…`
  2. `WHEN I IMPORT AN CASE WITH SAME FIR NUMBER WHICH HAS …`
  3. `ARREST IMPORT — PROPERTY Category NHI AAYA WHEN I GO TO …`
  Agents were told to report the current behaviour rather than guess a fix.
- **C14 "need scheme of arrest in form"** — "scheme of arrest" is not a term used anywhere in this
  codebase. Needs a definition (a field? a document? the arrest plan?) before it can be scoped.
- **HQ visibility (accepted risk, from ruling R1).** HQ_ANALYST/HQ_ADMIN still get **7** data keys
  and contentless persons/properties. That is what was chosen, but it is the *same shape* of
  complaint the DCP filed, so expect it to be re-reported from HQ. One-line change if so:
  set `LDC_DIST_HQ_ALL.visible_field_keys` to `["*"]` and re-run `sync-config`.

## DEPLOYMENT NOTE (must reach the tester)

Any environment whose DB predates the widen-fold needs `npm run db:migrate` to pick up
`20260726000001`. That is now sufficient — a **full `db:reset` is no longer required** for this
class of drift, so the tester keeps their data.
