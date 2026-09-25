# Confirmed Bug Fixes — Report

Date: 2026-09-04
Scope: `DAILY_DIARY_PARALLEL` engine only (the Python worker — `python_worker/`).
Verification method: generated a real Daily Diary
(`custom_definition={"type":"DAILY_DIARY"}`, date `2026-07-29`, PS `093015b3-…`)
against the live PostgreSQL DB, opened the `.xlsx`, inspected cells before and
after each fix. Test job rows and scratch files were deleted afterward.

---

## Architecture note (read before the findings)

The "Daily Diary Export (All Sheets)" report and its `dd-*` siblings are **not**
rendered by any Node module. `reports.controller.js` shells out to
`python_worker/generator.py` for every `DAILY_DIARY_PARALLEL` template. The
20-sheet workbook is produced by:

- `python_worker/registry.py` — auto-loads `sheets/sheet_*.py`, each exposing
  `NUM`, `TABLE_NAME`, `LABEL`, `COLUMNS` (list of **column keys**) and a
  `map_row(record, idx)` that returns a **dict keyed by those column keys**.
- `python_worker/builder.py` — opens the reference template
  `python_worker/templates/Daily_Diary_16Jul2026_AllStations.xlsx`, finds each
  sheet by `TABLE_NAME_TO_TEMPLATE_TITLE`, clears rows 5+, and appends data as
  `[row_dict.get(k, '') for k in col_keys]`.
- `python_worker/generator.py` — `TEMPLATE_TO_TABLE_NAMES['daily-diary']` is a
  hardcoded list of the 20 `table_name`s that make up the aggregate export.

Because `builder.py` writes rows **by key lookup in `COLUMNS` order** (not from a
hand-typed positional array), a missing field yields an empty cell *in the right
position* — it never left-shifts later columns. The real positional dependency
is: **the template sheet's physical column order must match the sheet module's
`COLUMNS` order and length.** That is where the actual defects are.

---

## BUG 1 — Manual FIR column misalignment → **NOT REPRODUCIBLE (misdiagnosis)**

- **Investigated:** `python_worker/sheets/sheet_01_manual_fir.py` +
  template sheet `1. Manual FIR`.
- Template `1. Manual FIR` row 4 has 9 headers:
  `Police Station | FIR No. | U/S | Complainant | Date & Time of Occurrence |
  Place of Occurrence | Brief Facts | Arrested Person | Name of IO`.
- `sheet_01` `COLUMNS` = `['ps','fir_no','us','complainant_details',
  'time_of_occurrence','place_of_occurrence','gist','arrested_details','io_details']`
  — **same 9 keys, same order**. `map_row` returns exactly those keys.
  `COLUMNS` length (9) == template header count (9): **match**.
- **Real generated row (2026-07-29):**
  `['PS Delhi Cantt.', '0098', None, 'Naresh Tiwari S/O Sh. Narayan Singh',
  '29/07/2026', None, 'Cyber fraud …', 'Suresh @ Lambu Age- 30 yrs', None]`
  Every value is in its correct semantic column. The `None`s are columns
  **3 (U/S), 6 (Place), 9 (IO)** — genuinely empty *source data* for that record,
  not a shift.
- The evidence row in the task prompt
  (`['PS Parliament Street', 'Ramesh Kumar', '22/08/2026', 'None']`) is a
  **sparse row read with blank cells collapsed**: PS(1), blank U/S(2)? no —
  Complainant(4)='Ramesh Kumar', Date(5)='22/08/2026', Arrested(8)='None', with
  FIR No. + U/S + Place + Facts + IO all blank. Drop the blanks and you get the
  4-value list. It is not misaligned.
- **Root cause found:** none in code. The empty U/S / Place / IO cells are a
  data-completeness issue:
  - `us`: `map_row` reads `d.get('sections') or d.get('under_section')`.
    `d['sections']` is only populated from `record_offences` (generator.py
    `_enrich_records` step 5). Records with no `record_offences` row → blank U/S.
  - `place_of_occurrence`: `d['occurrence_place']` is set from
    `locations.full_address` via `fir_details.occurrence_location_id`. Blank when
    the FIR has no linked location or the location has no address.
  - `io_details`: CASE IO name comes only from a `persons` row with
    `role = 'IO'` (`fir_details` has **no** IO-name column). Blank when no such
    person row exists.
- **Fix applied:** NO — nothing to fix in the renderer. Left as-is.
- **Other sheets checked for the same class (positional array):** **none exist.**
  `builder.py` is key-mapped on both the template path and the scratch-fallback
  path; every `sheet_*.py` `map_row` returns a dict. The systemic "positional
  array drift" risk the prompt describes is **not present** in this codebase.
- **BUT — a related systemic defect was found:** see
  **"Systemic: COLUMNS wider than template header"** below.
- Re-generated and verified correct: YES (columns aligned).

---

## BUG 2 — "Arrested - District" sheet: unnumbered + leaked field descriptions → **FIXED**

- **Location:** template sheet titled `Arrested - District` +
  `python_worker/sheets/sheet_07_arrested_east_district.py`
  (`TABLE_NAME = excel_7arrested_east_district`, exposed individually as the
  `dd-arrested-east-district` report).
- **Intentional sheet or leftover:** **Intentional but incompletely wired.** It
  has a dedicated sheet module, a `report_templates` entry
  (`dd-arrested-east-district`), and a `TEMPLATE_TO_TABLE_NAMES` mapping. It was
  left **unnumbered** and its header row was pasted from raw field-registry
  descriptions. Its data semantics currently duplicate
  `sheet_06_arrested_all_heads` (`filter_records` returns `classified['arrests']`
  with no district split).
- **Confirmed defects in the live output:**
  1. Sheet has no sequence number (`Arrested - District`, while every sibling is
     `N. Title`).
  2. Header col 6 = `status of arrested person (unique for every person arrested
     in a case/record)` — a field description, not a column label.
  3. Header col 8 = `Details of the propert Recovered from arrested person`
     — typo ("propert") + verbose.
  4. Header col 3 = `U/S(Act+section)`, col 4 = `Accused (Name / Age / S/O /
     Address)`, col 5 = `Name of IO`, col 10 = a parenthetical scheme list —
     all inconsistent with the labels used on every other sheet.
  5. `sheet_07` `COLUMNS` had **15 keys** vs the template's **10-column** header,
     so five columns (`group_patrolling`, `cycle_patrolling`,
     `by_antisnatching_team`, `by_prahari`, `by_eyes_ears_scheme_members`) were
     written past the header with no labels.
  6. `Name of IO` was always blank — see BUG 2b.
  7. `Recovery` cells showed `undefined: recovery of incriminating material …`
     — see BUG 2c.
- **Fixes applied:**
  - **Header cleaned** in `python_worker/templates/Daily_Diary_16Jul2026_AllStations.xlsx`,
    sheet `Arrested - District`, row 4:
    `S.N. | FIR No. | U/S (Act + Section) | Accused (Name / Age / S/O / R/O
    Address) | Name of IO (Rank / Name / PIS No.) | Status of Arrested Person |
    Prev. Involvement (Y/N) | Recovery (Property Recovered from Accused) |
    Accused BC (Y/N) | Arrest Scheme`.
  - **`sheet_07` rewritten** to a 10-column layout matching the template. The
    five scheme booleans are collapsed into one `arrest_scheme` summary string
    (comma-joined list of the schemes that are "Yes", or `—`). Added a
    `d.get('io_name') or d.get('arresting_officer_name')` fallback for the IO
    column and real per-column `COLUMN_LABELS` for the scratch-build path.
  - **Sheet number: NOT assigned — flagged for a decision.** The reference
    template numbers 1–8 then jumps to 11 (9 and 10 are unused). This sheet also
    currently produces the same data as `Arrested - All Heads`. Whether it should
    become `9. Arrested - District`, be given a real district-wise breakdown, or
    be removed as a duplicate is a **product/scoping decision**, not a bug fix.
    Renumbering also requires touching `sheet_07.NUM`,
    `builder.TABLE_NAME_TO_TEMPLATE_TITLE`, the template sheet title, and the
    `builder.py` fallback branch in lockstep.
- **Re-generated and verified:** YES. Header now 10 clean labels; data rows now
  10 values; `Name of IO` populated (`ASI Yogesh Pal`, …); `Arrest Scheme`
  shows a readable summary.

### BUG 2b — arrested sheets: "Name of IO" always blank → **FIXED**

`generator.py` `_enrich_records` step 2 (ARREST) **selects**
`ad.arresting_officer_name, ad.arresting_officer_rank` but never assigns them to
the record dict, so `d['io_name']` was only ever set from a `persons` row with
`role = 'IO'` (rare for arrest records). Added:

```python
d['io_name'] = row['arresting_officer_name'] or d.get('io_name') or ''
d['io_rank'] = row['arresting_officer_rank'] or d.get('io_rank') or ''
```

The later persons loop still overrides via its `'io_name' not in d` guard.
This fixes the IO column on **every** arrested sheet, not just Arrested-District.

### BUG 2c — "undefined:" prefix in Recovery cells → **FIXED (defensive)**

`arrest_details.recovery` contains rows literally starting with
`undefined: recovery of incriminating material during search of accused.`
(a leaked JS `undefined` string-concat from the import side — confirmed by
`SELECT DISTINCT recovery FROM arrest_details WHERE recovery ILIKE 'undefined%'`).
`generator.py` now strips a leading `undefined:` in the ARREST enrichment so no
sheet surfaces it. **The underlying bad data should still be cleaned at source /
on import** — this is a display guard only.

---

## BUG 3 — FIR Goswara Summary: typo + formula-in-label headers → **FIXED**

- **Location:** template sheet `21. FIR Goswara Summary`, row 4. (The
  `sheet_28_fir_goswara_summary.py` module already carries clean
  `COLUMN_LABELS`; the printed headers come from the template file, which had
  the bad text.)
- **Typo fixed:** `TAOTAL ARREST IN Burglary E-FIR…` → clean label.
- **Verbose / calculation-in-label headers replaced:**
  | col | before | after |
  |---|---|---|
  | 2 | `Total arrest in Manual FIR` | `Total Arrest — Manual FIR` |
  | 3 | `total arrest in Theft E-FIR (ALL e-theft cases - house theft(e-theft) - burglary(e-theft))` | `Total Arrest — Theft (e-FIR)` |
  | 4 | `TOTAL ARREST IN House Theft E-FIR (house theft registered as e-theft)` | `Total Arrest — House Theft (e-FIR)` |
  | 5 | `TAOTAL ARREST IN Burglary E-FIR(burglary registered as e-theft)` | `Total Arrest — Burglary (e-FIR)` |
  | 6 | `TOTAL ARREST IN M.V. Theft (Motor Vehicle Theft)` | `Total Arrest — M.V. Theft` |
- **Arithmetic:** untouched and still reconciles — live row
  `Railways: 14 + 0 + 2 + 2 + 2 = 20 = Total` ✓.
- **Re-generated and verified:** YES.

---

## BUG 4 — Inconsistent capitalization in hierarchy node names → **FIXED**

Data fix in `hierarchy_nodes` (the renderer prints `name` verbatim). Applied
against the live DB:

| old | new | rows |
|---|---|---|
| `Eow` | `EOW` | 1 |
| `Eow Sub-Division` | `EOW Sub-Division` | 1 |
| `Igi Airport` | `IGI Airport` | 1 |
| `Igi Airport Sub-Division` | `IGI Airport Sub-Division` | 1 |
| `PS Igi Airport Metro` | `PS IGI Airport Metro` | 1 |

Verified with a follow-up `SELECT`. Other odd names spotted, **left alone**
(minor / out of scope): `Special Police Unit For Women & Children` (title-case
`For`), `PS Vigilance Ps` (redundant trailing `Ps`).

> These edits were made directly to the running dev database. If the DB is ever
> re-seeded from scratch, the seed source needs the same correction or the bug
> returns.

---

## BUG 5 — Sheets missing from the Daily Diary output → **CONFIRMED, classified**

Live output = **20 sheets**. `registry.py` loads **25** sheet modules. The
aggregate export is gated by the hardcoded list
`generator.py :: TEMPLATE_TO_TABLE_NAMES['daily-diary']` (20 entries). There is
**no swallowed exception** — `registry.map_all_sheets` logs per-sheet errors and
`builder.build_workbook` deterministically drops any sheet not in the active set.
The omissions are simply table names absent from that list *and* from
`builder.TABLE_NAME_TO_TEMPLATE_TITLE`.

| Sheet | Sheet module in code? | In default 20-set? | Classification |
|---|---|---|---|
| Proclaimed Offenders | `sheet_11_proclaimed_offenders.py` | No | **WIRED_BUT_SKIPPED** — fully built, exposed individually as `dd-proclaimed-offenders`, just not in the aggregate |
| Women Missing | `sheet_22_women_missing.py` | No | **WIRED_BUT_SKIPPED** — exposed as `dd-women-children-missing` |
| Children Missing | `sheet_23_children_missing.py` | No | **WIRED_BUT_SKIPPED** — exposed as `dd-women-children-missing` |
| Arrested - All Heads | `sheet_06_arrested_all_heads.py` | No | **WIRED_BUT_SKIPPED** — exposed as `dd-arrested-all-heads` |
| Arrest Count Summary | `sheet_29_arrest_count_summary.py` | No | **WIRED_BUT_SKIPPED** — no individual template either |
| Juveniles in Conflict with Law | — | — | **NOT_YET_BUILT** |
| Preventive Action | — | `dd-preventive-action` maps to `[]` | **NOT_YET_BUILT** (template id exists, table list empty) |
| Financial Fraud Arrest | — | `dd-financial-fraud-arrest` maps to `[]` | **NOT_YET_BUILT** |
| NDPS Action | — | `dd-ndps-action` maps to `[]` | **NOT_YET_BUILT** |
| Mobile Recovered | — | — | **NOT_YET_BUILT** |
| Important Cases | — | `dd-important-cases` maps to `[]` | **NOT_YET_BUILT** |

- **NOT_YET_BUILT sheets:** not implemented in this pass (new scope, per the
  rules). They belong in the Sheet Contract Register as `NOT_YET_BUILT`
  (distinct from `BLOCKED` — they have data sources, they just weren't built).
- **WIRED_BUT_SKIPPED sheets:** the fix is a one-line change — add the five
  `table_name`s to `TEMPLATE_TO_TABLE_NAMES['daily-diary']`. Those sheets have no
  entry in the reference template, so `builder.py` would create them fresh from
  `SHARED_COLUMN_LABELS` (a tested path). **Not applied here** because the
  reference template deliberately defines a 20-sheet workbook and expanding the
  statutory aggregate is a scoping decision, not a bug fix. Flagged for
  confirmation.
- No silent exception-swallow found; no change needed there.

---

## Systemic: `COLUMNS` wider than the template header (the real "BUG 1 class")

`build_workbook` appends `len(COLUMNS)` cells per row regardless of how many
header columns the template sheet has. **10 of the 20 aggregate sheets** declare
more `COLUMNS` keys than their template header row, so every data row spills
unlabeled cells past the header. Confirmed in live output, e.g.
`6. Arrested - Kalandara` (header 10, data rows 16) and
`15. Missing Persons` (header 10, data rows 18).

| table_name | template sheet | COLUMNS | template header cols |
|---|---|---:|---:|
| excel_3ehouse_theft_cases | 3. E-House Theft Cases | 12 | 11 |
| excel_5mvt_cases | 5. MVT Cases | 15 | 13 |
| excel_8arrested_kalandara | 6. Arrested - Kalandara  Preven | 16 | 10 |
| excel_9arrested_efir_theft | 7. Arrested - E-FIR Theft | 14 | 9 |
| excel_10arrested_efir_mv_theft | 8. Arrested - E-FIR MV Theft | 14 | 8 |
| excel_13arrested_24_hrs_list | 11. Arrested - Last 24 Hrs | 9 | 8 |
| excel_18missing_persons | 15. Missing Persons | 18 | 10 |
| excel_19uidb | 16. UIDB (Unidentified Bodies) | 17 | 9 |
| excel_20abandoned_persons | 17. Abandoned Persons | 16 | 8 |
| ~~excel_7arrested_east_district~~ | Arrested - District | ~~15 → 10~~ | 10 (**fixed in BUG 2**) |

Sheets built fresh (no template sheet — `excel_6…`, `excel_11…`, `excel_22…`,
`excel_23…`, `excel_29…`) are not affected because `builder.py` emits a header
label for every key.

**Not fixed in this pass** (beyond the Arrested-District one that was already in
scope for BUG 2). Each needs its template sheet's header row extended to match
its `COLUMNS`, or its `COLUMNS` trimmed to the intended layout — one sheet at a
time, with the proforma in hand. Recommend a dedicated follow-up.

---

## Files changed

| File | Change |
|---|---|
| `python_worker/generator.py` | ARREST enrichment: map `arresting_officer_name/rank` → `io_name/io_rank`; strip leading `undefined:` from `recovery`. |
| `python_worker/sheets/sheet_07_arrested_east_district.py` | 15-col → 10-col layout matching the template; `arrest_scheme` summary column; IO fallback; real `COLUMN_LABELS`. |
| `python_worker/templates/Daily_Diary_16Jul2026_AllStations.xlsx` | Row-4 headers cleaned on `Arrested - District` and `21. FIR Goswara Summary`. Styling / sheet set unchanged (verified: 20 sheets, header fill `FF1F3864` + bold preserved; file re-compressed by openpyxl, 28.8 KB → 23.5 KB). |
| live DB `hierarchy_nodes` | 5 name rows re-cased (BUG 4). |

## Verification summary

| Bug | Fixed? | Re-generated & inspected? |
|---|---|---|
| 1 — Manual FIR misalignment | N/A — misdiagnosis, columns are aligned | YES |
| 2 — Arrested-District headers / 15-vs-10 cols | YES | YES |
| 2b — arrested "Name of IO" blank | YES | YES (`ASI Yogesh Pal` now shown) |
| 2c — `undefined:` in Recovery | YES (display guard) | YES |
| 3 — Goswara `TAOTAL` + verbose headers | YES | YES (totals still reconcile) |
| 4 — `Eow` / `Igi Airport` casing | YES | YES (`SELECT` re-check) |
| 5 — missing sheets | Classified, not implemented (per rules) | YES (20 sheets confirmed) |
| Systemic — COLUMNS > header on 9 more sheets | Documented, not fixed | YES (spill confirmed on 2 samples) |

## Sheet Contract Register — status changes from this pass

- `excel_7arrested_east_district` (Arrested - District): headers → CLEAN;
  layout → 10 cols; **sequence number: UNRESOLVED (needs decision)**;
  duplicate-of-`Arrested - All Heads` semantics: **UNRESOLVED**.
- `excel_28fir_goswara_summary`: headers → CLEAN.
- Proclaimed Offenders, Women Missing, Children Missing, Arrested - All Heads,
  Arrest Count Summary: `WIRED_BUT_SKIPPED` — pending decision to add to the
  aggregate `daily-diary` export.
- Juveniles in Conflict with Law, Preventive Action, Financial Fraud Arrest,
  NDPS Action, Mobile Recovered, Important Cases: `NOT_YET_BUILT`.
- 9 sheets (see systemic table): `HEADER_WIDTH_MISMATCH` — data rows wider than
  template header; follow-up pass required.

## Recommended next actions

1. **Decide the Arrested-District sheet's fate** (number it 9, give it a real
   district-wise grain, or delete it as a duplicate of Arrested - All Heads).
2. **Follow-up pass** on the 9 `HEADER_WIDTH_MISMATCH` sheets — align each
   template header row to its module `COLUMNS`.
3. **Decide** whether Proclaimed Offenders / Women & Children Missing / Arrested
   - All Heads join the aggregate 20→ export.
4. **Clean the source data**: `arrest_details.recovery` rows prefixed
   `undefined:`; seed source for the `hierarchy_nodes` casing fix so a re-seed
   doesn't regress it.
5. Populate `record_offences` / occurrence locations / IO person rows for seeded
   manual-FIR test records so U/S, Place and IO columns aren't blank.
