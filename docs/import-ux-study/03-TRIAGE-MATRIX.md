# Import Reliability — Triage Matrix (Phase 2, Architect)

**Date:** 2026-07-16 | **Inputs:** corpus baseline (667 rows, 98.6% fail), `VALIDATION_INVENTORY.md`
(49 rules, F1–F9), `OPERATOR_BEHAVIOUR`/`REF_MATCH` reports, `02-POLICY-DECISIONS.md` (D1–D3).
**This document is the implementation contract for Waves A–D.** Workers implement exactly this;
deviations come back to the architect.

Legend: **RECOVER** = auto-fix + WARNING trail · **WARN** = accept + warning ·
**ERROR** = reject row · **PRODUCT/UX/DOCS** = non-validation change.

---

## T1 — Requiredness unification (fixes 54% of all errors; F1 + D1)

**Decision:** one requiredness source, legacy-aware, keystone-gated.

1. `import.validate.js`'s required-check reads **`field_registry.validation_rules.required`**
   for ALL record types (via the same `normalizeRegistryRow` path PCR_CALL already uses).
   The curated lists in `import-fields.config.js` keep their layout/bridging role but their
   hand-typed `required` booleans **stop being authoritative** — delete or annotate them as
   layout-only so they can't silently drift again.
2. Registry **auto-included** columns join the required-check like every other field (closes
   the F1 gap where they were never checked).
3. Severity rule: non-legacy → registry-required ⇒ **ERROR** (D1, same bar as interactive).
   Legacy → registry-required ⇒ **WARNING**, *except keystone fields* ⇒ **ERROR**.
4. `IMPORT_OPTIONAL_REQUIRED_KEYS` demotions stay, both modes (unchanged behavior).

**Keystone sets (ERROR in BOTH modes) — architect ruling under D1, flagged for owner visibility:**

| Type | Keystones |
|------|-----------|
| ALL | usable record date (existing `RECORD_DATE_MISSING`); resolvable PS + District; child-sheet parent-key integrity |
| CASE | `fir_no`, `fir_date` |
| ARREST | `fir_no` (owner's explicit example), arrest date, ≥1 arrestee with first name |
| MISSING | missing person first name, date missing **or** date reported (either satisfies) |
| UIDB | date found/reported, place/location of recovery |
| PCR_CALL | call date/time |

Everything else registry-required (incl. local/major/minor head, complainant name, victim name)
⇒ WARNING in legacy mode. Classification heads stay ERROR in non-legacy via rule 3.

## T2 — IO handling (267 errors; F4 + D2)

- **Legacy:** if the row carries an IO name + PIS (name being the minimum; PIS strongly
  preferred), **RECOVER**: auto-provision `investigating_officers` for the batch's target PS
  inside the same confirm transaction, link `io_id`, mark provenance
  (`source_system:'BULK_IMPORT'`-style marker or equivalent column/extra flag so these are
  listable for SHO verification). Idempotent per (ps_id, pis_no) — second row reuses the row.
  Emit WARNING "IO auto-registered from sheet, needs verification".
  If neither name nor PIS present → io_id stays NULL, WARNING only (legacy captures the record).
- **Non-legacy:** unchanged — registered-PIS match or **ERROR** (D2).

## T3 — Beat matching (148 errors; F4, ref-probe: 100% recoverable PS-scoped)

**RECOVER:** make `resolveBeat` PS-aware: exact match first (current behavior), then
PS-scoped match on `ref.beats.ps_id = batch target PS` comparing normalized beat number
(digits extracted from label, e.g. operator "6" ↔ "Beat No. 6"). Unique PS-scoped hit ⇒
resolve + WARNING trail in legacy, silent-clean resolve is NOT allowed (always record the
normalization in warnings so data quality remains auditable). Ambiguous/no hit ⇒ existing
ERROR (legacy: WARNING per current `REF_UNRESOLVED_*` behavior). Beats with NULL `ps_id`
(765 ref-gap rows) can never PS-match — keep reporting separately; ref-data reconciliation
remains an open item, not this wave.

## T4 — PS / district / head / section matching (F4; probe: PS 86.5% recoverable)

**RECOVER (conservative tier only):** extend the shared resolvers in `records.normalize.js`
with, in order: trim/collapse (exists) → case-fold (exists) → noise-strip (remove `PS`/`P.S.`/
`Police Station` prefixes/suffixes, punctuation, double spaces) → unique-substring match ONLY
when exactly one candidate matches. **No fuzzy/Levenshtein anywhere** — a false match in police
records is worse than a rejection. Applies to PS, district, local/major/minor head. Sections:
add zero-pad/whitespace normalization for numeric codes; no substring matching (17k rows,
collision risk).

## T5 — Child-sheet parent keys (209 errors; F3)

- **RECOVER (narrow):** if the parent sheet has **exactly one** parent row, blank child keys
  resolve to it + WARNING. This is provably safe and covers the common one-FIR-per-file habit.
- Multi-parent + blank key ⇒ **ERROR**, but split messages (F3): "blank" vs "unmatched" get
  distinct codes (`PARENT_KEY_BLANK` / `PARENT_KEY_UNMATCHED`) and operator-actionable text
  ("Fill the FIR Number column on sheet 'act' — it must repeat the FIR Number of the parent row").
- **No positional inference ever** (row order ≠ linkage; mis-linking a victim to the wrong FIR
  is the worst failure mode).
- Template-side pre-fill of child keys = visible change ⇒ P3-gated, parked as a future owner
  question (not in Wave B).

## T6 — Ghost rows (F2, E4)

**RECOVER (skip):** parse-time skip when a data row has ≤2 non-empty cells AND none of the
non-empty cells is a keystone column for that sheet. Skipped rows are listed in a batch-level
INFO/WARNING ("Rows 29–36 skipped: appear empty/stray") so nothing disappears silently. A row
with ≥3 filled cells is real data and proceeds to validation.

## T7 — DB_LEAK elimination (F6/F7, E5)

1. **Vocabulary reconciliation (the real remaining leak):** add an enum-mapping step in the
   shared normalize path (Title-Case config option → DB CHECK vocabulary) for `persons.gender`,
   `persons.relation_type`, `record_properties.status`. Schema migration (new, schema-only)
   expands CHECKs where config offers values the DB lacks: gender += `TRANSGENDER`,
   property status += `INVOLVED`. (Config options are the product truth; DB catches up.)
   This also fixes the interactive form path — same shared mapper.
2. **Sanitize `WRITE_FAILED`:** never pass `err.message` verbatim (import.service.js:337).
   Operator sees "This row could not be saved due to a system error (ref: <batch>/<row>).
   Report this to your administrator." Raw error goes to logger + `import_batch_errors`
   metadata (a non-operator-facing column/field), preserving debuggability.
3. **Regression test (per F6 caveat):** one live confirm-path test proving a row with an
   ERROR finding never reaches INSERT.

## T8 — Warning flood (272 warnings; E6)

**UX:** frontend groups identical warnings — "N rows are missing: To Date/Time, …" with an
expandable row list, instead of per-row repetition. Backend unchanged (per-row rows in
`import_batch_errors` stay — they're the data; grouping is presentation). Same grouping for
identical errors (the IO/beat walls). Distinct codes from T5 render distinct guidance.

## T9 — Template layout drift (behaviour report #8)

**Wave B (serialized after A):** parse-time **layout version detection**: fingerprint the
uploaded workbook's headers against known layout manifests (current baseline + the observed
older simpler Property layout, reconstructed from the corpus extractions). Known-old layout ⇒
parse with that layout's bridge, batch-level WARNING ("older template version — download the
current one"). Unknown layout ⇒ friendly REJECT with a template-download hint instead of a
cascade of missing-column errors. Accepting old input is not a P3 issue (emitted template
unchanged).

## T10 — Silent column drops (F5)

**WARN (cheap):** when a `{drop:true}` bridged column contains any non-blank value, emit ONE
batch-level warning naming the column ("column X is informational and not imported"). No
per-row noise.

## T11 — Messages & docs (F8)

Wave D: message catalog extracted from the (post-Waves-A/B) inventory → operator fill guide +
error glossary (English now; structure keyed so Hindi is additive later, per bilingual pillar).
i18n of messages themselves = deferred, matches system-wide state.

## Explicitly NOT doing

- Fuzzy/Levenshtein matching anywhere (false-match risk).
- Positional child-row inference (T5).
- ARREST duplicate-in-DB checking (F9 — by design).
- Visible template changes (P3; parked: child-key pre-fill, dropdown additions).
- Beat ref-data reconciliation (765 NULL ps_id rows — separate data task).
- Message i18n implementation.

## Wave plan & gates

| Wave | Scope | Files (primary) | Gate |
|------|-------|-----------------|------|
| **A** (backend core) | T1–T7 | `import.validate.js`, `import-fields.config.js`, `import.parse.js` (T6), `import.service.js` (T2/T7), `records.normalize.js` (T3/T4/T7), one new migration (T7) | `npm run import:corpus -- --diff` (errors must drop, no new classes), `npm run import:parity`, `template-regression`, T7.3 test |
| **B** (layout acceptance) | T9 | `import.parse.js`, new layout manifests | corpus diff + parity |
| **C** (frontend UX) | T8 | `LegacyDataPage.jsx` | manual + corpus error shapes unchanged |
| **D** (docs/catalog) | T11 | docs only | review |

A ∥ C parallel (disjoint files); B after A (shared parse layer); D last.
Success target: corpus valid-rate from 1.3% → the majority of rows importing in legacy mode
with warning trails; exact number re-measured after Wave A via the baseline diff.
