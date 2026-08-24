# PHAROS — Diary Formula Completion Prompt

> Paste everything below this line into Claude Code (or your IDE agent) with the PHAROS repo open AND `Menu_Tables.xlsx` available at the repo root or at the path you specify.

---

## Your job

You are completing the diary report engine for PHAROS (Delhi Police records system). The database schema, migrations, and architecture are already built. Your job is **data mapping and renderer implementation only** — no schema changes, no new tables, no new API routes unless explicitly listed below.

Read every file mentioned before writing a single line. If something contradicts this prompt, the **repo file wins** — report the conflict, don't silently pick one.

---

## Step 0 — Read these files first (mandatory, in order)

```
context-bundle/00-INDEX.md
context-bundle/01-SCHEMA.md          (migrations — the real DDL)
context-bundle/02-CONFIG.md          (env, knexfile, packages)
context-bundle/04-BACKEND.md         (module outlines, workflow engine verbatim)
context-bundle/08-DISCREPANCIES.md   (12 resolved questions — trust these over the handoff doc)
docs/db-audit/DB_REDESIGN_DECISIONS.md
docs/new-db-integration/README.md    (integration roadmap — know what is and isn't done)
PHQ_DIARY_FORMULA_SPEC.md            (existing formula spec — don't contradict it)
```

Then read the three formula spec files produced previously:
```
00-DIARY-FORMULA-CORE.md
01-FN-DIARY-FORMULAE.md
02-DISTRICT-AND-DAILY-DIARY-FORMULAE.md
```

These define every measure (`M-xx`), window (`W-xx`), head (`H-xx`), and blocker (`Bx`). They are the contract for this task.

---

## Step 1 — Read and parse Menu_Tables.xlsx

`Menu_Tables.xlsx` is the reference data source. It will be provided alongside this prompt.

Using `markitdown` or `openpyxl`, extract every sheet. For each sheet, print:
- Sheet name
- Column headers (row 1)
- First 5 data rows

Then identify which sheet contains the **local crime heads** (the one with columns like `local_head_cd`, `local_head`, `crime_category` or similar). This is the authoritative source for what heads exist.

Extract the full list: `local_head_cd`, `local_head` text, `crime_category` (HEINOUS / NON_HEINOUS / OTHER).

---

## Step 2 — Query the live database and compare

Run these queries against the live PostgreSQL DB (credentials from `backend/.env`):

```sql
-- 2a. What heads exist in the DB right now?
SELECT local_head_cd, local_head, crime_category, canonical_code
FROM ref.local_heads
ORDER BY crime_category, local_head_cd;

-- 2b. How many have no canonical_code?
SELECT COUNT(*) FILTER (WHERE canonical_code IS NULL) AS missing,
       COUNT(*) AS total
FROM ref.local_heads;

-- 2c. What case_status values actually exist in the live data?
SELECT DISTINCT case_status, COUNT(*) 
FROM fir_details 
GROUP BY case_status 
ORDER BY count DESC;

-- 2d. What disposal_type values exist?
SELECT DISTINCT disposal_type, COUNT(*) 
FROM fir_details 
WHERE disposal_type IS NOT NULL
GROUP BY disposal_type;

-- 2e. What missing_type values exist?
SELECT DISTINCT missing_type, COUNT(*) 
FROM missing_details 
WHERE missing_type IS NOT NULL
GROUP BY missing_type;

-- 2f. What case_type values exist (manual / e-FIR / zero FIR)?
SELECT DISTINCT case_type, COUNT(*) 
FROM fir_details 
WHERE case_type IS NOT NULL
GROUP BY case_type;

-- 2g. Check if PS metadata has diary_abbr set already
SELECT id, name, code, metadata->>'diary_abbr' AS abbr, 
       metadata->>'diary_order' AS ord
FROM hierarchy_nodes
WHERE node_type = 'PS'
ORDER BY name;

-- 2h. Check ref.beats.ps_id backfill status
SELECT COUNT(*) FILTER (WHERE ps_id IS NULL) AS unlinked,
       COUNT(*) AS total
FROM ref.beats;

-- 2i. Check link_type_registry for CASE_ARREST
SELECT id, code, description FROM link_type_registry;

-- 2j. Check section granularity for key POCSO/BNS sections
SELECT act_cd, section, section_cd FROM ref.sections
WHERE section IN ('64','65','70','74','75','4','6','8','10','12','111','112','113')
   OR section ILIKE '64(%' OR section ILIKE '65(%'
ORDER BY act_cd, section;
```

Write the complete output of every query to `context-bundle/09-DB-LIVE-STATE.md`. This file is the ground truth for all subsequent steps.

---

## Step 3 — Cross-reference Menu_Tables vs DB

Compare the `local_head` text from Menu_Tables.xlsx against `ref.local_heads` in the DB:

1. Heads in Menu_Tables **not** in DB — these need to be loaded via `npm run load-ref`
2. Heads in DB **not** in Menu_Tables — flag these (likely legacy / test data)
3. Heads in both but with `canonical_code IS NULL` — these need the migration below

For category 3, produce a mapping table:

| local_head_cd | local_head (exact DB text) | crime_category | Proposed canonical_code | Confidence |
|---|---|---|---|---|
| ... | ... | ... | ... | HIGH / MEDIUM / LOW |

Use the proposed codes from `01-FN-DIARY-FORMULAE.md` §STAT_1 head bindings as your starting list. Set confidence:
- **HIGH** — exact match to a proforma row label
- **MEDIUM** — close match, needs human confirmation
- **LOW** — ambiguous, could map to multiple proforma rows

Write this table to `context-bundle/10-HEAD-MAPPING-REVIEW.md` for human review before the migration runs.

---

## Step 4 — Write the canonical code migration

After completing Step 3, write a migration file:

**Path:** `backend/migrations/20260816000001_add_missing_canonical_codes.js`

Rules:
- Use `WHERE local_head_cd = <exact integer>` — **never** use `ILIKE` in the migration. You have the exact IDs from the DB query above. Exact ID match is the only safe approach.
- Only update rows where `canonical_code IS NULL` — never overwrite an existing code.
- One UPDATE statement per head. No bulk updates across multiple heads.
- Add a comment on each line with the proforma sheet and row it unlocks.
- `down()` is a no-op (canonical codes are additive; rolling back would break existing data).

Template:
```javascript
export async function up(knex) {
  await knex.raw(`
    -- Unlocks: STAT_1 row 19 (Simple Hurt), STAT_2, STAT_11, STAT_20, STAT_28, STAT_36
    UPDATE ref.local_heads SET canonical_code = 'SIMPLE_HURT'
      WHERE local_head_cd = <exact_id_from_query> AND canonical_code IS NULL;

    -- Unlocks: STAT_1 row 20 (Grievous Hurt), STAT_2, STAT_11, STAT_20, STAT_28, STAT_36
    UPDATE ref.local_heads SET canonical_code = 'GRIEVOUS_HURT'
      WHERE local_head_cd = <exact_id_from_query> AND canonical_code IS NULL;

    -- ... one line per head
  `);
}

export async function down(knex) {
  // no-op — canonical codes are additive; reversing would break diary renderers
}
```

**Only include HIGH-confidence rows from Step 3.** MEDIUM and LOW rows must wait for human confirmation via `10-HEAD-MAPPING-REVIEW.md`. Write a comment in the migration: `-- MEDIUM/LOW confidence rows: see context-bundle/10-HEAD-MAPPING-REVIEW.md`.

---

## Step 5 — Write the section group config

Create `backend/config/sections/section-groups.json`:

Build this from the actual section data returned by query 2j above. Do not invent section codes — only include sections that exist in `ref.sections`.

```json
{
  "_note": "Maps group keys to ref.sections.section values. Used by diary renderers for section-level aggregation.",
  "HURT_SIMPLE":       ["<actual section values from DB>"],
  "HURT_GRIEVOUS":     ["<actual section values from DB>"],
  "RAPE_ALL":          ["<actual>"],
  "RAPE_64_1":         ["<actual>"],
  "GANG_RAPE":         ["<actual>"],
  "POCSO_PENETRATIVE": ["<actual>"],
  "POCSO_ASSAULT":     ["<actual>"],
  "POCSO_HARASSMENT":  ["<actual>"],
  "POCSO_OTHER":       ["<actual>"],
  "ORGANISED_CRIME":   ["<actual>"],
  "TERROR":            ["<actual>"],
  "MO_WOMEN_ALL":      ["<actual>"],
  "ACID_ATTACK":       ["<actual>"],
  "ACID_ATTEMPT":      ["<actual>"],
  "TRAFFICKING":       ["<actual>"]
}
```

If a section code doesn't exist in `ref.sections` for a group, leave the array empty `[]` and add a comment key `"_missing_HURT_SIMPLE": "section 115 not found in ref.sections — seed ref data first"`.

---

## Step 6 — Write the case status config

From the actual query results in Step 2 (queries 2c, 2d, 2e, 2f), write:

`backend/config/diary/case-status-map.json`

```json
{
  "_source": "Derived from SELECT DISTINCT case_status FROM fir_details — see context-bundle/09-DB-LIVE-STATE.md",
  
  "worked_out_boolean": "is_worked_out",
  
  "challan": ["<exact values from DB that mean chargesheeted>"],
  "cancelled": ["<exact values from DB that mean cancelled/closure>"],
  "untraced": ["<exact values from DB>"],
  "pending": ["<exact values from DB>"],
  
  "case_type_efir":    ["<exact values meaning e-FIR>"],
  "case_type_manual":  ["<exact values meaning manual FIR>"],
  "case_type_zero_fir":["<exact values meaning Zero FIR>"],
  
  "missing_type_abandoned": ["<exact values>"],
  "missing_type_runaway":   ["<exact values>"]
}
```

This file is the single source of truth. Every renderer imports it instead of hardcoding strings.

---

## Step 7 — Add PS diary metadata

From query 2g, check which police stations already have `diary_abbr` and `diary_order` in `metadata`.

For those that don't, create a seed script:

`backend/scripts/seed-diary-ps-metadata.mjs`

```javascript
// Seeds diary_abbr and diary_order into hierarchy_nodes.metadata
// for all PS nodes. Run: node scripts/seed-diary-ps-metadata.mjs
//
// Source: Column headers from District_diary.xlsx 'N-1,N-2,N-3' sheet
// Abbreviations and order are fixed by the proforma — do not change them.

import db from '../src/config/db.js';

const PS_METADATA = [
  // Format: { name_fragment, abbr, order }
  // Use name_fragment that matches your actual hierarchy_nodes.name values
  // from query 2g output — DO NOT INVENT NAMES
  { name_fragment: 'Kotwali',      abbr: 'KT',  order: 1  },
  { name_fragment: 'Lahori Gate',  abbr: 'LG',  order: 2  },
  { name_fragment: 'Kashmeri',     abbr: 'KG',  order: 3  },
  { name_fragment: 'Sadar Bazar',  abbr: 'SB',  order: 4  },
  { name_fragment: 'Bara Hindu',   abbr: 'BHR', order: 5  },
  { name_fragment: 'Subzi Mandi',  abbr: 'SM',  order: 6  },
  { name_fragment: 'Civil Lines',  abbr: 'CL',  order: 7  },
  { name_fragment: 'Maurice',      abbr: 'MN',  order: 8  },
  { name_fragment: 'Roop Nagar',   abbr: 'RN',  order: 9  },
  { name_fragment: 'Timarpur',     abbr: 'TP',  order: 10 },
  { name_fragment: 'Wazirabad',    abbr: 'WZ',  order: 11 },
  { name_fragment: 'Burari',       abbr: 'BU',  order: 12 },
  { name_fragment: 'Sarai Rohilla',abbr: 'SR',  order: 13 },
  { name_fragment: 'Gulabi Bagh',  abbr: 'GB',  order: 14 },
  // Add more based on query 2g output — adjust name_fragment to match real names
];

// ADJUST the list above using actual names from query 2g before running.
// The script will log which PS it matched and which it couldn't find.

async function run() {
  for (const ps of PS_METADATA) {
    const rows = await db('hierarchy_nodes')
      .where('node_type', 'PS')
      .whereILike('name', `%${ps.name_fragment}%`);
    
    if (rows.length === 0) {
      console.warn(`NOT FOUND: ${ps.name_fragment}`);
      continue;
    }
    if (rows.length > 1) {
      console.warn(`AMBIGUOUS (${rows.length} matches): ${ps.name_fragment} — skipping`);
      continue;
    }

    await db('hierarchy_nodes')
      .where('id', rows[0].id)
      .update({
        metadata: db.raw(
          `COALESCE(metadata, '{}')::jsonb || ?::jsonb`,
          [JSON.stringify({ diary_abbr: ps.abbr, diary_order: ps.order })]
        )
      });
    console.log(`OK: ${rows[0].name} → ${ps.abbr} (order ${ps.order})`);
  }
  await db.destroy();
}

run().catch(console.error);
```

**Before writing this script**, adjust `PS_METADATA` using the actual PS names from query 2g. Do not hardcode names that don't exist in the DB.

---

## Step 8 — Update the stub renderers

The following renderers are 5-line stubs. Replace each with a real implementation using the formula spec and the new config files.

**Priority order** (most impact, fewest blockers):

### 8.1 `stat-18-vehicles-seized.js` — Zero blockers, fully buildable

```javascript
// backend/src/modules/report-engine/fn/renderers/stat-18-vehicles-seized.js
// STAT_18: Vehicles Seized under Arms, Excise, NDPS Acts
// Measure: M-34 grouped by ref.automobiles.automobile × act × FN/Upto
// Columns: 3 acts × 2 windows = 6 data columns
// Rows: 13 vehicle types from ref.automobiles + TOTAL

import db from '../../../config/db.js';
import { getDateWindow } from '../shared/date-windows.js';
import { getScopeFilter } from '../shared/scope.js';

const ACTS = {
  'Arms Act':    'ARMS_ACT',
  'Excise Act':  'DELHI_EXCISE_ACT',
  'NDPS Act':    'NDPS_ACT',
};

// Map proforma row labels to ref.automobiles.automobile values
// Adjust these to match actual values in your ref.automobiles table
const VEHICLE_ROWS = [
  'Motor Cycle', 'Scooter/Scooty', 'Car', 'Jeep', 'Taxi',
  'Tempo', 'TSRs', 'Bus', 'Truck', 'Cycle Rickshaw',
  'Cycle', 'E-Rickshaw', 'Others',
];

export async function renderStat18(scope, fnEnd) {
  const { fnStart, utoDate } = getDateWindow(fnEnd);

  // Fetch act_cd values from ref.acts for the three acts
  const actRows = await db('ref.acts')
    .whereIn('act_long', Object.values(ACTS).map(code =>
      Object.entries(ACTS).find(([,v]) => v === code)?.[0]
    ));
  // ... implementation using M-34 measure
  // Returns: { rows: [{vehicle, arms_fn, arms_upto, excise_fn, excise_upto, ndps_fn, ndps_upto}] }
}
```

> **Instruction to agent:** Do not write a stub. Write the complete working implementation. Query the DB, verify the vehicle type values exist in `ref.automobiles`, handle missing rows gracefully with 0 (not null), and return the structured data the PHQ diary Excel writer expects.

### 8.2 `stat-24-domestic-violence.js` — Zero blockers

STAT_24 is Missing Persons by age band × gender × missing/traced/untraced.

```
Filter: record_type = 'MISSING', current_status <> 'DRAFT'
Date anchor: missing_person_details.missing_date (fallback: missing_details.gd_date → records.record_date)
Traced: missing_person_details.found_date IS NOT NULL
Age bands: ≤8, 8–12, 12–16, 16–18, >18 (from persons.age)
Gender: persons.gender for the MISSING-role person
Windows: W-FN, W-UPTO
```

### 8.3 `stat-38-bns-no-arrest.js` and `stat-39-lsl-no-arrest.js` — Zero blockers

Cases chargesheeted (disposed as CHALLAN/PIR-JCL) with no linked ARREST record.

```sql
-- Core predicate:
SELECT r.id FROM records r
WHERE r.record_type = 'CASE'
  AND r.current_status <> 'DRAFT'
  AND fd.case_status IN (<challan values from case-status-map.json>)
  AND NOT EXISTS (
    SELECT 1 FROM record_links rl
    JOIN link_type_registry lt ON lt.id = rl.link_type_id
    WHERE lt.code = 'CASE_ARREST'
      AND rl.source_record_id = r.id
  )
  AND :scope AND :window
```
Window for STAT_38/39: `W-UPTO` only (no FN column). Head bindings: same as STAT_1 for BNS, STAT_3 for L&SL.

### 8.4 `stat-12-organised-crime.js` — Low blockers

`fir_details.organised_crime = true` already exists. §A rows 5–26 are buildable. §C rows 37–48 (Mob Lynching, Road Rage sub-rows) — mark as ⛔ in the output with a `—` value, do not emit 0.

### 8.5 `stat-27-children-crime.js` and `stat-28-women-crime.js`

Both use `persons.is_minor` (generated stored column — use it, don't recompute `age < 18`). Head bindings and section groups from the section-groups.json file written in Step 5.

### 8.6 `stat-21-kalandra.js`

STAT_21 is the Kalandra disposal sheet — entirely ⛔ B6 (no court/disposal model). Replace the stub with a proper "not implemented" renderer that:
- Returns an empty data structure
- Logs a warning: `[diary] STAT_21 skipped — Kalandra disposal register not yet implemented (blocker B6)`
- Writes `—` to every data cell (not 0)
- Appends one row to the DQ sheet: `STAT_21 | ALL CELLS | Kalandra disposal register not built`

Do the same for: `stat-14-preventive.js`, `stat-15-proclaimed-offenders.js`, `stat-22-sec223-bns.js`, `stat-29-trafficking.js`, `stat-30-zero-fir.js`, `stat-31-senior-citizens.js`, `stat-33-property-stolen-recovered.js`, `stat-34-dp-act.js`, `stat-35-preventive-detail.js`, `stat-40-court-stub.js`, `stat-41-court-lsl.js` — these are all fully or partially blocked. Each should emit `—` for blocked cells and 0 only for cells that genuinely have a data source.

---

## Step 9 — Write a shared query builder

Create `backend/src/modules/report-engine/shared/diary-query-builder.js`.

This module exports one function that all renderers call instead of writing raw SQL:

```javascript
/**
 * diaryCount(options) → Promise<number>
 *
 * options:
 *   measure     : 'REPORTED' | 'WORKED_OUT' | 'CANCELLED' | 'UNTRACED' |
 *                 'CHARGESHEETED' | 'PERSONS_ARRESTED' | 'KALANDRA_ARRESTS'
 *   recordType  : 'CASE' | 'ARREST' | 'MISSING' | 'UIDB' | 'PCR_CALL'
 *   headType    : 'LOCAL' | 'ACT' | 'SECTION_GROUP' | null
 *   headCodes   : string[]   (canonical_code values, act codes, or section group keys)
 *   window      : 'FN' | 'CORR_FN' | 'UPTO' | 'UPTO_PREV' | 'DAY' | 'PREV_DAY'
 *   fnEnd       : Date
 *   scopeType   : 'PS' | 'DISTRICT' | 'SUBDIV'
 *   scopeId     : uuid
 *   extraFilter : knex query fragment (optional, for victim gender etc.)
 *
 * Returns: count (number). Returns 0 if no rows. Never throws on missing data —
 * returns 0 and logs a warning.
 */
export async function diaryCount(options) { ... }

/**
 * diaryList(options) → Promise<rows[]>
 * For CA-6 listing sheets. Returns full record rows with all diary fields.
 */
export async function diaryList(options) { ... }
```

The builder must:
- Load `case-status-map.json` once at module init (not per call)
- Load `section-groups.json` once at module init
- Apply the correct date anchor per `recordType` (per core §2 table)
- Apply `is_worked_out` boolean for `WORKED_OUT` measure with date from `record_status_events`
- Never emit `#DIV/0!` — all variation % is computed here as `(curr - prev) / NULLIF(prev, 0)`, returned as `null` when denominator is 0
- For `PERSONS_ARRESTED`, always join via `record_links` with `link_type_registry.code = 'CASE_ARREST'`, never via `arrest_details.fir_no`

---

## Step 10 — Verify and produce output report

After all steps, run:

```bash
cd backend
npm run db:migrate                    # applies Step 4 migration
node scripts/seed-diary-ps-metadata.mjs  # applies Step 7
```

Then produce `context-bundle/11-COMPLETION-REPORT.md` containing:

```markdown
# Diary Formula Completion Report

## Head mapping coverage
- Total heads in ref.local_heads: N
- Heads with canonical_code before: N
- Heads with canonical_code after this work: N
- Still unmapped (MEDIUM/LOW confidence, needs human review): N
  - List each with local_head text

## Section group coverage
- Groups defined: N
- Groups with all sections found in DB: N
- Groups with missing sections: [list]

## Case status vocabulary confirmed
- case_status values found: [list]
- disposal_type values found: [list]
- Mapping used: [table]

## Renderer status
| Renderer | Before | After | Blocker |
|---|---|---|---|
| stat-18 | stub | implemented | — |
| stat-24 | stub | implemented | — |
| ... | | | |

## PS metadata
- PS nodes with diary_abbr set: N
- PS nodes still missing: [list]

## Data quality checks
- Run: SELECT COUNT(*) FROM ref.local_heads WHERE canonical_code IS NULL
  - Result: N (target: 0 for known heads)
- Run: SELECT DISTINCT case_status FROM fir_details
  - All values accounted for in case-status-map.json: YES/NO

## What is still blocked (do not implement)
[List each blocker with the sheets it affects]

## Recommended next actions
1. Human review of context-bundle/10-HEAD-MAPPING-REVIEW.md MEDIUM rows
2. [next action]
```

---

## Rules

- **Never invent a value.** If a DB query returns no rows for something, the answer is `—` (not 0, not null, not a made-up value).
- **Never modify an existing migration.** Add a new one.
- **Do not implement blocked sheets.** Mark them as `—` with a logged warning.
- **Exact DB values only** in config files and migrations — no ILIKE, no approximate matching in production code.
- **One source of truth** — all status enums come from `case-status-map.json`, all section groups from `section-groups.json`. No renderer hardcodes a string like `'CANCELLED'`.
- **`persons.is_minor` is a generated stored column** — use it, never recompute.
- **Arrested persons count goes through `record_links`** — never `arrest_details.fir_no`.
- Report every assumption you make. If you're unsure whether a local_head maps to a proforma row, set confidence LOW and flag it in `10-HEAD-MAPPING-REVIEW.md`.
- If Menu_Tables.xlsx contains heads not currently in `ref.local_heads`, note them but do not load them — that is a `load-ref` job, not a migration.
- Follow `docs/ENGINEERING_BASELINE.md` for all code discipline rules (schema-only migrations, single write path, etc.).
