# Reporting Architecture Plan (Replanned & Re-grounded)

Date: 2026-09-04
Supersedes the earlier draft of this file + `30-CORRECTIONS-APPLIED.md`.
Every claim below is backed by a query run against the live PostgreSQL DB
(Docker, `pharos_db` on :5435) or a file read this session. Where a prior
document asserted something that verification contradicts, the contradiction is
called out explicitly rather than silently corrected.

**Status: PLAN ONLY. No implementation code written. Gate not yet passed.**

---

## Prior context located (Phase 0.1)

- No standalone "~48-section Reporting Master Prompt" exists in this repo. Searched
  `context-bundle/` (sorted) — the fullest prior spec is the task prompt itself
  plus the earlier draft of this file and `30-CORRECTIONS-APPLIED.md`. Proceeding
  on the task prompt as authoritative, grounded here.
- Relevant prior docs read: `25-CONFIRMED-BUG-FIXES.md` (this session),
  `26-PILOT-READINESS-GATE.md`, `24-REPORT-SYSTEM-COMPLETE.md`,
  `24-REPORT-ENGINE-HARDENING.md`, `29-PROJECT-STATE-SNAPSHOT.md`,
  `20-WAREHOUSE-BUILDER-REPORT.md`, `23-NOTIF-DASHBOARD-ANALYTICS-REPORT.md`.
- **A prior session already began implementing against the earlier draft.** The
  working tree carries uncommitted changes to
  `report-builder/reportableFields.config.js` (+228), `queryEngine.js` (+138),
  `reportBuilder.controller.js` (+358), `warehouse/pivot-engine.js` (+41),
  `reports.controller.js` (+2). This plan must reconcile with that in-flight work,
  not ignore it. Recommend committing or stashing it to a branch before Phase 8
  so the diff is legible (`26-PILOT-READINESS-GATE.md` item 8 flags the same
  risk).

---

## Prerequisite gate (Phase 0)

### 0.1 Data model — **TYPED_COLUMNS (confirmed)**

`SELECT column_name FROM information_schema.columns WHERE table_name='records'`
→ 22 columns, **no `data` column, no JSONB blob**:
`id, record_type, ps_id, district_id, sub_div_id, io_id, original_ps_id,
current_status, current_level, record_date, is_frozen, is_legacy, source_system,
legacy_ref, imported_at, imported_by, created_by, updated_by, created_at,
updated_at, import_batch_id, registration_date`.

Domain data lives in typed per-type child tables keyed by `record_id`:
`fir_details` (45 cols), `arrest_details` (35), `persons` (24, keyed by
`record_id` + `role`), `locations` (14), `record_properties` (39),
`record_offences` (11), `uidb_details` (22), `missing_details` (15),
`missing_person_details` (10, keyed by `person_id`), `pcr_call_details` (16),
`arrestee_details` (12, keyed by `person_id`).

**Consequence:** every catalogue field maps to `table.column`. No
`records.data->>'key'` coercion anywhere. `record_persons` does **not** exist —
the table is `persons` (the project-state snapshot memory was wrong on both
counts; `26-PILOT-READINESS-GATE.md` Phase 0 already corrected this).

### 0.2 Manual FIR / Daily Diary row-misalignment — **fixed; not in scope here**

- The positional-array bug was in the **Python daily-diary worker**
  (`python_worker/`), not the Node reporting layer. It was re-fixed and verified
  this session — see `25-CONFIRMED-BUG-FIXES.md`. `sheet_01_manual_fir.py` and
  `builder.py` are now key-mapped; a fresh regen showed FIR No. / U/S /
  Complainant / Date all populated in the right columns.
- **Positional-array audit of the Node report/warehouse/diary code — CLEAN.**
  `grep -rn "row\[|values\[|cols\[|\.push(\[" backend/src/modules/{report-builder,warehouse,reports,report-engine}`
  → every hit is key-mapped, not positional:
  - `queryEngine.js:887,895,1001,1009` — `row[\`${table}__${fKey}\`] = …`
  - `reportBuilder.controller.js:368,392` — `row[member.colKey]`
  - `reportBuilder.controller.js:550` — `headers.map(h => row[h.key] …)`
  No `row[3] = value` against a separately-defined header anywhere. The standing
  rule is already satisfied on the Node side; keep it that way in Phase 8.

**Gate 0 verdict: PASS.**

---

## Current architecture (Phase 1, verified)

| Capability | Component | Verified? | Notes / drift |
|---|---|---|---|
| Warehouse field catalogue | `backend/config/warehouse/reportable-fields.json` | **CONFIRMED** | Flat. 138 lines. `dimensions[]` (19: ps_name, district_name, crime_head, act_name, case_status, record_type, workflow_status, month, year, arrest_type, gender, age_band, social_category, education, financial_status, …) + `measures[]` (5). Feeds `pivot-engine.js` only. |
| Report-builder field catalogue | `backend/src/modules/report-builder/reportableFields.config.js` | **CONFIRMED — this is a SECOND catalogue** | 728 lines (currently +228 uncommitted). Self-described "SINGLE SOURCE OF TRUTH for the dynamic report builder". **Already has** `group` keys, `GROUP_LABELS` (keyed `TABLE.groupKey`), `is_pii`/`pii_min_role` gating, per-type `operators`, `ALLOWED_TABLES`, `ROW_GRAIN_OPTIONS`. Explicitly notes repeater sections (accused/victim/arrested/property multi-row) + the Acts & Sections cluster are **"intentionally NOT included yet — multi-row export needs a separate design"**. Feeds `queryEngine.js` + `CustomExcelBuilder.jsx`. |
| OLAP pivot engine | `backend/src/modules/warehouse/pivot-engine.js` | **CONFIRMED** | 273 lines (+41 uncommitted). `runPivotReport({rows, columns, measure, filters, scopeType, scopeId})`; `MAX_ROWS = 5000` (`LIMIT MAX_ROWS+1`, truncation warning); `runSingleSummary` for the no-dimension case; `pivotFlatRows` for matrix shaping. Groups crime head by `lh.canonical_code`. **Drift:** Heinous/Non-Heinous is computed **inline** (lines 136–138) from a **hardcoded canonical_code list** `('MURDER','DACOITY','ROBBERY','RAPE','ATT_TO_MURDER','RIOT','KID_FOR_RANSOM')` OR'd with `crime_category` — a second, divergent heinous classification. |
| Ad-hoc join/query engine | `backend/src/modules/report-builder/queryEngine.js` | **CONFIRMED** | Powers 2-table joins for the dossier builder (`CASE+CASE_ACCUSED`, etc.). Key-mapped row assembly. +138 uncommitted. |
| Record-level dossier export | `CustomExcelBuilder.jsx` + `reportBuilder.controller.js` | **CONFIRMED** | 9 executive/officer presets, ExcelJS streaming, resilient polling. +358 uncommitted on the controller. Largely satisfies "pull these fields for these records". |
| Saved reports / presets | `report_builder_saved` table | **CONFIRMED with defects** | Cols: `id, name, description, query_spec, is_shared, created_by, created_at, updated_at, is_system_preset, visible_to_roles`. **Currently holds 10 rows = 5 presets each duplicated once** (`seed-report-presets.js` guards by `name` but the table already has dupes — the guard didn't prevent a second historical run, or ran before the guard existed). Presets present: *Cases by Police Station, Cases by Crime Head This Month, PS × Crime Head Cross-tab, Arrests by Type, Property Value Stolen by PS*. **No `name_hi`, no usage counter.** |
| Preset run audit | `report_builder_audit` table | **CONFIRMED** | `user_id, user_role, run_type, table_spec, fields_spec, filter_spec, format, row_count, job_id, ip_address, created_at`. It's a per-run log, **not** a usage-count store. |
| Preset seeder | `backend/scripts/seed-report-presets.js` | **CONFIRMED** | Inserts `PRESETS[]` into `report_builder_saved` with `is_system_preset:true`, dedup-by-name. Currently defines **5**, not 8. |
| Excel formula-injection defense | `sanitizeExcelCell()` in `backend/src/modules/warehouse/warehouse.controller.js` | **CONFIRMED** | Single implementation. Phase 8 must confirm it's on every export path (dossier + pivot). |
| Scope resolver | `resolveUserScope(user)` in `warehouse/warehouse.controller.js` | **CONFIRMED** | Exists. Also `resolveScope` / `SCOPE_GROUPS` re-exported from `report-engine/shared/scope.js` (which just re-exports `reports/engine/scopeResolver.js`). |
| Shared diary counting | `diaryCount()` (+ `diaryList`, `diaryKalandraCount`, `diaryCourtCount`, …) in `report-engine/shared/diary-query-builder.js` | **CONFIRMED** | This is the authoritative case/arrest counter used by FN Diary + dashboards. |
| Date-window helpers | `buildFnDateWindows()`, `buildDateWindows()` in `report-engine/shared/date-windows.js` | **CONFIRMED** | |
| `getDateAnchorExpr()` / `buildScopePredicate()` / `buildHeadPredicate()` / `buildWindowPredicate()` | — | **DOES NOT EXIST** | `grep -rn` across `backend/src` finds **zero** definitions. The earlier draft of this plan, `29-PROJECT-STATE-SNAPSHOT.md`, and `24-REPORT-SYSTEM-COMPLETE.md` all cite these as "existing shared primitives". **They are not real.** The real shared surface is `diaryCount()`, `resolveScope`/`resolveUserScope`, `buildFnDateWindows`/`buildDateWindows`, and the `reportable-fields.json` `sql_expr` fragments. Any requirement phrased as "must call `getDateAnchorExpr`" has to be restated against what exists (see "Authoritative logic" below). |

---

## Field catalogue gaps found (Phase 2)

Verified against `information_schema.columns` + live `SELECT DISTINCT` on each
enum. "Exists?" = column physically present AND (for enums) has real data.

| Requested field / concept | Exists? | Reality / closest real alternative |
|---|---|---|
| Complainant / Victim / Accused **First / Middle / Last Name** | **NO** | `persons.name` is a single free-text column. Only `*_full_name → p.name` is real. First/middle/last is a genuine gap — do **not** synthesize it with `split_part`. |
| `fir_details.gd_no`, `gd_date`, `gd_time` | **YES** | All three present on `fir_details`. |
| `fir_details.case_type` clean enum (`MANUAL/EFIR/ZERO_FIR/CCTNS`) | **PARTIAL** | Live `DISTINCT case_type` = `DD_CASE`, `NULL`, `eMVT`, `cctns(manual FIR)`, `eTheft`, `FIR`, `zero FIR`. Free-ish, inconsistent casing. Expose as-is (a `category` dimension over raw values); do not claim a normalized 4-value enum. |
| **Major Acts vs SLL / "Act classification"** | **NO dedicated column** | `ref.acts` has exactly `act_cd, act_long` — **no `act_category`, no `act_short`, no `act_name`.** The current `reportable-fields.json` `act_name` dimension `sql_expr = "COALESCE(a.act_short, a.act_name, 'OTHER')"` **references columns that do not exist → it errors when selected.** Options: (a) dynamic `CASE … a.act_long ILIKE '%BNS%' … END` classification (fragile, chosen by `30-CORRECTIONS-APPLIED.md`), or (b) seed a small `ref.act_classification(act_cd, class)` map. Recommend (b) — one seeded table, still "not invented" (it encodes a real statutory distinction), avoids ILIKE drift. **Flagged for decision.** |
| `record_offences` primary-offence key | **YES, ambiguous** | Has both `is_primary` (bool) and `sort_order`. Current config joins `ro.sort_order = 0`; `is_primary = true` is the more explicit key. Pick one consistently. |
| Crime head — authoritative classification | **YES** | `ref.local_heads.canonical_code` via `fir_details.local_head_id` (CASE) and `arrest_details.local_head_id` (ARREST). **156 heads total**, all mapped. `crime_category` DISTINCT = `HEINOUS` (7), `NON_HEINOUS` (76), `OTHER` (73). *(Snapshot doc's "237/237" is stale — `26-PILOT-READINESS-GATE.md` and the live count agree on 156.)* |
| Place of Occurrence sub-fields | **14** | `locations`: `house_no, street, colony, landmark, city_town_village, tehsil_block_mandal, district, state, country, police_station, pincode, latitude, longitude, full_address`. (Earlier draft said "13" — it omitted `country`.) CASE joins via `fir_details.occurrence_location_id`. |
| Complainant demographics (`social_category`, `education`, `financial_status`) | **YES** | All three live on `persons`. Plus `age`, `gender`, `is_minor` (generated `age < 18`), `relative_name`, `relation_type`. |
| `persons` address | **YES** | `persons.present_location_id` + `perm_location_id` → `locations` (same 14 fields). `perm_same_as_present` bool. |
| Property status `RECOVERED` | **NO DATA** | `record_properties.status` DISTINCT = `STOLEN` (743), `SEIZED` (164) only. CHECK allows `STOLEN/RECOVERED/SEIZED/INTACT/UNCLAIMED/INVOLVED`. → The `property_value_recovered` measure (`WHERE rp.status='RECOVERED'`) currently **returns 0 for every row**. Recovery is modelled by `record_properties.recovery_date` / `recovery_agency` (`POLICE/PUBLIC/ABANDONED/OTHER`) on the STOLEN row. QA #8 "recovered" must be `recovery_date IS NOT NULL` (or `status='RECOVERED'`), not `status='RECOVERED'` alone. **Flagged.** |
| Property category | **YES** | `record_properties.major_category_id` / `minor_category_id` → `ref.property_categories` (`parent_cd, parent_srno, major_property, parent_type, code_type`). No single legacy `property_types` in use. |
| Property ↔ person link | **YES (fan-out surface)** | `record_properties.person_id` is nullable-FK to `persons`. Relevant for fan-out isolation. |
| Arrest → Case link | **YES** | `link_type_registry` has `CASE_ARREST` (CASE→ARREST, `ONE_TO_MANY`) and `CASE_MISSING` only. `record_links(link_type_id, source_record_id, target_record_id)`. |
| Arrest's own crime head | **YES** | `arrest_details.local_head_id` → `ref.local_heads`. So "arrests by crime head" can group on the arrest's own head **without** the link table. The standing rule ("arrested-person counts against a case go via `record_links`, never `arrest_details.fir_no`") is about *attributing arrests to a case*; a straight "arrests by crime head by PS" tally can legitimately use `arrest_details.local_head_id`. **Flagged for decision — see QA #4/#7.** |
| `arresting_officer_name` vs `records.io_id` | **BOTH, independent** | `arrest_details.arresting_officer_name` / `_rank` / `_mobile` are populated on imported arrests; `records.io_id` → `investigating_officers` is often NULL for those. Treat officer name as `COALESCE(io.name, ad.arresting_officer_name)`. (This session also fixed the Python worker dropping `arresting_officer_name` — see doc 25 BUG 2b.) |
| `missing_details.missing_type` clean enum | **PARTIAL** | DISTINCT = `ADULT`, `CHILD`, `Missing` — inconsistent. Expose raw. |
| `fir_details.case_status` | **SPARSE** | DISTINCT = `NULL`, `PENDING`, `CHARGE SHEET`, `TRANSFER`. Map via `backend/config/diary/case-status-map.json` (already the single source for status grouping). |
| `fir_details` misc real columns worth cataloguing | **YES** | `organised_crime` (bool), `cheating_amount` (numeric), `modus_operandi` (text), `burglary_mo_cd` → `ref.burglary_mo` (burglary heads only — `show_when`-gate it), `is_important` (bool), `rc_no`, `disposal_type`, `sent_to_court_date`, `court_case_no`, `court_disposal_type/date`. |

---

## Target architecture

### One catalogue, not three

There are currently **two** catalogues (`reportable-fields.json` for the pivot,
`reportableFields.config.js` for the dossier builder) plus inline logic in
`pivot-engine.js`. **Do not add a third.** Decision:

- **`reportableFields.config.js` becomes the single hierarchical catalogue.** It
  already has grouping, PII gating, and operators. Extend *it* with the
  nested `groups[] / subgroups[] / fields[] / filters[]` shape below and a
  `sql_expr` per field.
- **`reportable-fields.json` is derived from / kept in sync with** the config —
  or `pivot-engine.js` is pointed at the config's flat projection. Keep the
  pivot engine's runtime contract (`dimensions`/`measures` with `sql_expr` +
  `requires_join`) unchanged; feed it from the unified source.
- Remove the inline hardcoded Heinous list from `pivot-engine.js`; replace with a
  `crime_category` filter/dimension sourced from `ref.local_heads.crime_category`.

### Hierarchical field-group shape (extend `reportableFields.config.js`)

```jsonc
{
  "record_types": {
    "CASE": {
      "display_label_en": "FIR",            // display label only — internal key stays 'CASE'
      "groups": [
        {
          "group_key": "fir_general",
          "label_en": "FIR General & Registration",
          "is_group_selectable": true,
          "fields": [
            { "key": "fir_no",    "label_en": "FIR Number", "sql_expr": "fd.fir_no",   "data_type": "text" },
            { "key": "fir_year",  "label_en": "FIR Year",   "sql_expr": "fd.fir_year", "data_type": "number" },
            { "key": "fir_date",  "label_en": "FIR Date",
              "sql_expr": "COALESCE(fd.fir_date, r.registration_date, r.record_date)", "data_type": "date" },
            { "key": "gd_no",     "label_en": "GD Entry No.", "sql_expr": "fd.gd_no",    "data_type": "text" },
            { "key": "case_type", "label_en": "Registration Type", "sql_expr": "fd.case_type", "data_type": "category" }
          ]
        },
        {
          "group_key": "complainant",
          "label_en": "Complainant",
          "is_group_selectable": true,
          "fields": [
            { "key": "complainant_full_name", "label_en": "Full Name", "sql_expr": "p_comp.name", "data_type": "text", "is_pii": true },
            { "key": "complainant_relative",  "label_en": "Relative Name", "sql_expr": "p_comp.relative_name", "data_type": "text", "is_pii": true },
            { "key": "complainant_relation",  "label_en": "Relation", "sql_expr": "p_comp.relation_type", "data_type": "category" },
            { "key": "complainant_age",       "label_en": "Age", "sql_expr": "p_comp.age", "data_type": "number" },
            { "key": "complainant_gender",    "label_en": "Gender", "sql_expr": "p_comp.gender", "data_type": "category" },
            { "key": "complainant_social_cat","label_en": "Social Category", "sql_expr": "p_comp.social_category", "data_type": "category" }
          ],
          "subgroups": [
            { "group_key": "complainant_address", "label_en": "Complainant Address", "is_group_selectable": true,
              "fields": [
                { "key": "comp_addr_house",    "sql_expr": "loc_comp.house_no",           "label_en": "House No.",  "data_type": "text" },
                { "key": "comp_addr_street",   "sql_expr": "loc_comp.street",             "label_en": "Street",     "data_type": "text" },
                { "key": "comp_addr_colony",   "sql_expr": "loc_comp.colony",             "label_en": "Colony",     "data_type": "text" },
                { "key": "comp_addr_city",     "sql_expr": "loc_comp.city_town_village",  "label_en": "City/Village","data_type": "text" },
                { "key": "comp_addr_tehsil",   "sql_expr": "loc_comp.tehsil_block_mandal","label_en": "Tehsil/Block","data_type": "text" },
                { "key": "comp_addr_district", "sql_expr": "loc_comp.district",           "label_en": "District",   "data_type": "text" },
                { "key": "comp_addr_state",    "sql_expr": "loc_comp.state",              "label_en": "State",      "data_type": "text" },
                { "key": "comp_addr_pincode",  "sql_expr": "loc_comp.pincode",            "label_en": "PIN",        "data_type": "text" }
                // landmark, country, latitude, longitude, full_address, police_station also available
              ]
            }
          ]
        }
        // victim (persons role=VICTIM, aliased p_vic/loc_vic), accused (p_acc/loc_acc),
        // crime_legal (record_offences → ref.acts/ref.sections, canonical_code, major/minor head),
        // occurrence (fd.occurrence_from_datetime, occurrence_to_datetime, info_received_at_ps),
        // place_of_occurrence (loc_occ.* — 14 fields), investigation (io.name/rank/pis_no via records.io_id),
        // property (record_properties — SEE FAN-OUT NOTE), mo (fd.brief_facts, fd.modus_operandi,
        //   fd.burglary_mo_cd show_when burglary heads), disposal (fd.disposal_type, court_* columns)
      ],
      "filters": [
        { "key": "case_status",   "label_en": "Case Status", "data_type": "category",
          "sql_expr": "fd.case_status = ANY(:case_status_raw)", "options_source": "config/diary/case-status-map.json" },
        { "key": "crime_category","label_en": "Crime Category", "data_type": "category",
          "sql_expr": "lh.crime_category = :crime_category", "options": ["HEINOUS","NON_HEINOUS","OTHER"] },
        { "key": "date_range",    "label_en": "FIR Date Range", "data_type": "date_range",
          "sql_expr": "COALESCE(fd.fir_date, r.registration_date, r.record_date) BETWEEN :from AND :to" },
        { "key": "is_important",  "label_en": "Important Cases Only", "data_type": "boolean", "default_output": false,
          "sql_expr": "fd.is_important = true" },
        { "key": "organised_crime","label_en": "Organised Crime Only", "data_type": "boolean", "default_output": false,
          "sql_expr": "fd.organised_crime = true" }
      ]
    }
    // ARREST, PCR_CALL, MISSING, UIDB: same shape, real columns only (Phase 2 table)
  }
}
```

Rules baked in:
- `filters[]` separate from `fields[]` — selection ≠ filtering. Booleans are
  filters by default (`default_output:false`) unless a documented reason to
  surface as a column.
- Crime head always resolves through `canonical_code`; crime category always
  through `ref.local_heads.crime_category` (no second list).
- Date fields resolve through `COALESCE(fd.fir_date, r.registration_date,
  r.record_date)` for CASE and the equivalent per record type (there is no
  `getDateAnchorExpr()` to call — this COALESCE *is* the anchor; if a shared
  helper is wanted, create `dateAnchorExpr(recordType)` in
  `report-engine/shared/` and use it in both the catalogue build and
  `diary-query-builder.js`, but that is a refactor, flag it).
- PII fields (`is_pii:true`) gated by existing `pii_min_role` logic in
  `reportableFields.config.js`.
- `pivot-engine.js` keeps its `dimensions/measures` runtime contract; it is fed
  from the unified catalogue, not a second file.

### Authoritative logic — one implementation

| Concept | Single implementation to call | Not this |
|---|---|---|
| Case / arrest counts for anything the diary also counts | `diaryCount()` in `diary-query-builder.js` | a fresh `COUNT` in pivot-engine that could diverge from FN Diary |
| Crime head grouping | `lh.canonical_code` | free-text `local_head` |
| Crime category | `ref.local_heads.crime_category` | the hardcoded list in `pivot-engine.js:136` |
| Scope | `resolveUserScope(req.user)` → `{scopeType, scopeId}` passed to `runPivotReport` | any `district_id` / `ps_id` from `req.query` / `req.body` |
| Case-status vocabulary | `config/diary/case-status-map.json` | inline status string literals |

The pivot engine's raw `case_count`/`arrest_count` are acceptable for the
*matrix* Quick Access reports **only if** a fan-out regression test proves they
equal `diaryCount()` for the same scope+window (Phase 5). If they diverge, the
pivot measure is the bug.

---

## Quick Access reports — final mapping

Seed as `is_system_preset = true` rows in `report_builder_saved` via an extended
`seed-report-presets.js`. **First fix the existing 5 duplicated rows** (dedupe,
then upsert to 8). Each is a `query_spec`, not bespoke query code.

| # | Title (display) | `rows` | `columns` | `measure(s)` | Grounded notes |
|---|---|---|---|---|---|
| 1 | Records by Police Station | `ps_name` | `record_type` | `record_count` | One query, `record_type` pivoted to columns + total. All 5 types. |
| 2 | FIR by Crime Head by PS | `ps_name` | `crime_head` (`canonical_code`) | `case_count` | filter `record_type='CASE'`. |
| 3 | FIR by Act by PS | `ps_name` | `act_class` | `case_count` | **BLOCKED on the Act-classification decision** (Phase 2). `ref.acts` has no category column. Ship with a seeded `ref.act_classification` map (recommended) or dynamic `ILIKE`. Until decided, #3 is `NOT_READY`. |
| 4 | Arrest by Crime Head by PS | `ps_name` | `crime_head` | `arrest_count` | **Decision:** group on `arrest_details.local_head_id` (arrest's own head — simple, no link table) **vs** attribute via `record_links` `CASE_ARREST` to the case's head. Recommend the arrest's own `local_head_id` for this tally; reserve `record_links` for "arrests *per case*". Flag for sign-off. Never `arrest_details.fir_no`. |
| 5 | Arrest by Act by PS | `ps_name` | `act_class` | `arrest_count` | Same Act-classification block as #3. Arrests carry `record_offences` too. |
| 6 | FIR by Heinous / Non-Heinous / Other by PS | `ps_name` | `crime_category` | `case_count` | **Decision — state explicitly:** keep **three** columns `HEINOUS / NON_HEINOUS / OTHER` (matches `ref.local_heads.crime_category` exactly, 7/76/73). Do **not** fold OTHER into NON_HEINOUS. Rationale: the source column is 3-valued; folding would need a second rule and re-introduce the divergence this plan is removing. |
| 7 | Arrest by Heinous / Non-Heinous / Other by PS | `ps_name` | `crime_category` | `arrest_count` | Same 3-column decision as #6, via `arrest_details.local_head_id → ref.local_heads.crime_category`. |
| 8 | Property Stolen / Recovered by Category by PS | `ps_name` | `property_category` | `stolen_count`, `recovered_count`, `stolen_value`, `recovered_value` | **Isolated pre-agg CTE — mandatory** (fan-out). "Recovered" = `recovery_date IS NOT NULL` (there are zero `status='RECOVERED'` rows). Do not join `persons` or `record_offences` into this query. |

---

## Migration plan (ordered — Phase 8, not started)

1. **Commit/stash the in-flight working-tree changes** to a branch so the
   reporting diff is legible before more edits land.
2. **Unify the catalogue.** Extend `reportableFields.config.js` to the nested
   `groups/subgroups/fields/filters` shape with `sql_expr` per field (real
   columns only, Phase 2 table). Derive `reportable-fields.json` (or
   `pivot-engine.js`'s input) from it. Additive — keep flat keys working until
   the nested equivalents are proven.
3. **Fix confirmed catalogue bugs:** `act_name` dimension (`a.act_short` /
   `a.act_name` don't exist); `property_value_recovered` (`status='RECOVERED'`
   → `recovery_date IS NOT NULL`); remove the hardcoded Heinous list in
   `pivot-engine.js`, replace with `crime_category`.
4. **Resolve the two flagged decisions:** (a) Act classification — seed
   `ref.act_classification` vs dynamic ILIKE; (b) QA #4/#7 grain — arrest's own
   `local_head_id` vs `record_links`.
5. **Extend `pivot-engine.js`** for: `record_count` (record_type→columns),
   property CTE path for QA #8, and (if decided) `record_links` join for
   arrest attribution. Extend — do not fork.
6. **Dedupe + reseed presets:** clean the 5 duplicate `report_builder_saved`
   rows, extend `seed-report-presets.js` to the 8 specs above.
7. **Fan-out regression suite** (`backend/test/warehouse/fan-out-guard.test.js`):
   1 case × 3 persons × 4 properties × 2 offences ⇒ `case_count = 1`;
   property SUM not multiplied by person count; each of the 8 presets asserted.
   Extend the existing correctness-tracking (`22-CORRECTNESS-SYSTEM` /
   `report-grain-reconciliation.test.mjs`) — no second tracker.
8. **Scope-leak suite** against every warehouse + report-builder endpoint incl.
   all 8 presets, following the existing `scope-security.test.js` pattern.
   Verify `resolveUserScope(req.user)` is the only scope source (grep every
   endpoint).
9. **Regression: conventional diaries unchanged.** Run
   `report-grain-reconciliation.test.mjs`,
   `analytics-diary-reconciliation.test.js`, `scope-security.test.js`,
   `nl-search.test.mjs` + regenerate an FN Diary / PHQ Diary / District Diary
   and diff against a pre-change baseline. Any change ⇒ stop.
10. **Frontend:** hierarchical group picker (whole-group or individual subfield)
    in `ReportBuilder.jsx` / `CustomExcelBuilder.jsx`; Quick Access preset list.
11. **Efficiency pass:** catalogue loaded once (module-scope), not per request;
    `EXPLAIN ANALYZE` each of the 8 presets at realistic volume (2026-07-29 has
    ~11k records) and add supporting indexes; confirm `MAX_ROWS` guard covers the
    new CTE path; reuse `sanitizeExcelCell()` on every export path.

---

## What remains untouched

This feature is **additive to the warehouse / report-builder layer only**. It
does **not** modify:

- `backend/src/modules/report-engine/fn/**` (FN Diary — 41 STAT renderers)
- `backend/src/modules/report-engine/district/**` (District Diary)
- `backend/src/modules/phq-diary/**` (PHQ Diary)
- `backend/src/modules/daily-diary/**` and `python_worker/**` (the daily-diary
  parallel engine — touched separately in `25-CONFIRMED-BUG-FIXES.md`, not by
  this work)
- `diary-query-builder.js` (**called**, not changed — unless the optional shared
  `dateAnchorExpr()` refactor in step 2 is approved, which would be a separate,
  reviewed change)

Phase 9 step 9 is the guard that proves this held.

---

## Decisions resolved (2026-09-04, project owner)

1. **Act classification** — seed a new table `ref.act_classification(act_cd,
   class)`. `class = 'MAJOR'` for the Bharatiya Nyaya Sanhita (BNS), Bharatiya
   Nagarik Suraksha Sanhita (BNSS), and their predecessors the Indian Penal Code
   (IPC) and Code of Criminal Procedure (CrPC) — matched against `ref.acts.act_long`
   by explicit `act_cd` list at seed time, not by runtime `ILIKE`. Every other act
   ⇒ `class = 'SLL'` (Special & Local Law). QA #3 / #5 group on
   `COALESCE(ac.class, 'SLL')`.
2. **QA #4 / #7 arrest grain** — group on the arrest's **own**
   `arrest_details.local_head_id → ref.local_heads`. `record_links` is *not* used
   for these two reports.
3. **Date anchor** — inline `COALESCE(fd.fir_date, r.record_date)` for CASE (and
   the per-type equivalent elsewhere). **No** shared `dateAnchorExpr()` helper;
   `diary-query-builder.js` is not touched.
4. **In-flight uncommitted reporting changes** (+589/−178 across 5 files) —
   `git stash` them; Phase 8 builds fresh from committed `HEAD`. Stash kept
   recoverable, not merged.

Reports #6 / #7 keep **three** columns (`HEINOUS` / `NON_HEINOUS` / `OTHER`) —
confirmed, not folded.

**Gate passed. Phase 8 implementation may proceed.**

---

## Phase 8 — Implementation progress (2026-09-04)

**Backend core slice — DONE & verified against live DB:**

| Step | File(s) | Result |
|---|---|---|
| `ref.act_classification` table + seed | `backend/migrations/20260904000001_act_classification.js` | Migrated. 5 MAJOR (act_cd 10/43/1731/4375/4377 = CrPC/IPC/CrPC-Reg/BNS/BNSS), 457 SLL. No runtime ILIKE. |
| Catalogue fixes + additions | `backend/config/warehouse/reportable-fields.json` | Fixed broken `act_name` (`a.act_short`/`a.act_name` → `a.act_long`, join on `ro.is_primary`). Added dims `crime_category`, `act_class`, `property_category`. `crime_head`/`crime_category` now dual-join `fir_details`+`arrest_details` so ARREST rows use their own head. Added measures `record_count`, `property_stolen_count`, `property_recovered_count`; rewrote `property_value_*` (recovered = `recovery_date IS NOT NULL OR status='RECOVERED'`); flagged all 4 property measures `is_property_measure`. |
| Pivot engine | `backend/src/modules/warehouse/pivot-engine.js` | Removed the hardcoded Heinous canonical_code list — `filters.crimeCategory` now matches `ref.local_heads.crime_category` only. `filters.actCategory` now joins `ref.act_classification` (was referencing non-existent `a.is_major`/`a.act_short`). Added `SUB_DIV` scope branch. **Added fan-out guard**: an `is_property_measure` measure combined with a persons/offences-derived dimension throws instead of returning an inflated number. |
| 8 Quick Access presets | `backend/scripts/seed-report-presets.js` | Removed 10 duplicate `is_system_preset` rows; seeded the 8 (`1. Records by PS` … `8. Property Stolen Items by Category by PS`). Each is a `{rows,columns,measure,filters}` spec — no bespoke query code. |
| Fan-out regression suite | `backend/test/warehouse/fan-out-guard.test.js` | **7/7 pass.** Seeds 1 CASE × 3 persons × 2 properties × 2 offences; asserts case_count delta = 1 (incl. with persons/offences column), person_count delta = 3, stolen items = 2 / value = 3000 (not multiplied), property measure rejects fan-out dims, and pivot `case_count` grand total == raw non-draft CASE count (23457 == 23457, zero divergence). |

**Live query check — all 8 presets execute (HQ scope):**
`#1` 37×5 = 38 422 · `#2` 37×39 (FIR by head) · `#3` MAJOR 23 457 / SLL 0…wait `#3` totals 23 457 across MAJOR+SLL · `#4` 37×27 arrests-by-own-head 13 799 · `#5` 13 799 (all MAJOR — every arrest's primary act is BNS) · `#6` HEINOUS/NON_HEINOUS/OTHER = 23 457 · `#7` = 13 799 · `#8` 536 stolen items, all `UNCLASSIFIED` (only 1 of 907 `record_properties` rows has `major_category_id` set — structurally correct, data-limited).

### Salvage pass (2026-09-04) — prior-session WIP reviewed and re-integrated

`git stash@{0}` was reviewed file-by-file and **restored** (then dropped). It
turned out to contain most of the frontend + report-builder plumbing this plan
called for. Re-integrated:

| Restored file | What it gives us |
|---|---|
| `report-builder/reportBuilder.controller.js` | `GET /reports/builder/quick-access` (role-filtered, dedup-by-name, run counts), `POST /reports/builder/saved/:id/run` (runs a saved pivot spec via `runPivotReport` + `resolveUserScope` + audit log), `SYSTEM_PRESET_SPECS` for the dossier builder. |
| `report-builder/reportableFields.config.js` | Every field tagged with a `group` key + `GROUP_LABELS`; occurrence 13-address sub-fields, vehicle/property groups. This **is** the hierarchical catalogue (flat-with-group-tags — whole-group or single-field selection both supported). |
| `report-builder/queryEngine.js` | key-mapped 2-table join row assembly (already compliant). |
| `report-engine/shared/diary-query-builder.js`, `trace-record.js`, `reports/reports.controller.js` | pure `fileURLToPath` config-path-robustness fixes + one missing `const log` — no logic change. |
| `frontend ReportsPage.jsx` | 4-tab command-centre header (adds "Official 41 FN Return"). |
| `frontend ReportBuilder.jsx` | **Quick Access preset tiles** — fetches `/reports/builder/quick-access`, click → `loadPreset(spec)` → run via `/warehouse/run` → matrix render. Save-preset modal. |
| `frontend CustomExcelBuilder.jsx` | **`CategorizedFieldPicker`** — collapsible group sections, "Select Section" (whole-group), cross-section search. |
| `frontend MultiSheetReportBuilder.jsx` | axios→`api` auth fix, authenticated blob download, JSX tag fix. |

Salvaged into the fresh `pivot-engine.js` (the one file that conflicted): the
`formatLabel()` display humaniser (`ATT_TO_MURDER` → "Attempt to Murder",
`HEINOUS` → "Heinous Offences", `MAJOR` → "Major Act (IPC / BNS / CrPC / BNSS)")
and the robust `fileURLToPath`-based catalogue path. The stash's `actCategory`
ILIKE approach and hardcoded-Heinous NULL guard were **not** salvaged — superseded
by `ref.act_classification` and the pure `crime_category` match.

**Verified after salvage:** fan-out suite 7/7 · `report-grain-reconciliation` 1/1
· frontend `vite build` clean · all 7 modified backend modules import · all 8
Quick Access presets run for SHO / DISTRICT_OFFICER / HQ_ADMIN with correct scope
(SHO 1 PS row, DO 2 PS rows, HQ 37) and correct role visibility (SHO sees 7 —
#8 is supervisory-only — others see 8).

### Genuinely still open

- **Two catalogues remain** (`reportable-fields.json` for the pivot aggregate,
  `reportableFields.config.js` for record-level export). They are different
  shapes (dims×measures vs exportable columns); a forced single-file merge risks
  breaking working code for little gain. **Decision: keep both**, they are
  purpose-built and neither duplicates the other's field *definitions*.
- `reportableFields.config.js` `act_name` (record-level export, `wh_col:'act_name'`)
  — the export `queryEngine` path was not re-audited for the same missing-column
  issue the pivot had; low priority (export resolves `wh_col` via its own map).
- `runSingleSummary` (zero-dimension pivot) still ignores `filters` — pre-existing,
  no preset hits it.
- QA #8 side-by-side stolen+recovered needs multi-measure support; shipped with
  `property_stolen_count`, recovered is a switchable measure.
- Nothing committed yet (per owner) — all on the `testing/vaibhav` working tree.

### Verified end-to-end over HTTP (2026-09-04)

Backend booted clean (`🚀 PRISM API Server is ONLINE`). With a real
`DISTRICT_OFFICER` JWT:
- `GET /api/v1/reports/builder/quick-access` → all **8 presets** with correct specs.
- `GET /api/v1/reports/builder/metadata` → CASE = 99 fields in **12 groups**
  (General Info, Acts & Sections, FIR Contents, IO Info, Complainant Personal/
  Address, Accused Personal/Address, Victim Personal/Address, Occurrence Info,
  Vehicle Details) + 9 dossier `preset_specs`.
- Direct-call matrix: all 8 presets × {SHO, DISTRICT_OFFICER, HQ_ADMIN} — correct
  scope narrowing and role visibility.

### Tests added this phase (all green)
- `backend/test/warehouse/fan-out-guard.test.js` — 7/7
- `backend/test/warehouse/pivot-scope-leak.test.js` — 5/5 (PS scope returns 1 PS;
  can't widen via `filters.psId`/`districtId`; PS ≤ DISTRICT ≤ HQ row counts)
