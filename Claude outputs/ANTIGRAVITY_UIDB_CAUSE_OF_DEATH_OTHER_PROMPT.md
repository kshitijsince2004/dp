# Prompt for Antigravity — UIDB "Cause of Death: Other" (re-implementation on current HEAD)

Scope is exactly the 7 files listed below. Do not touch any other file. Do not run any line-ending/formatting/"fix CRLF" tool on the repo — that caused real corruption last time and is why this had to be redone from a rollback. Only hand-edit the exact lines named.

## 1. `config/fields/uidb.json`

This file uses 1-space JSON indentation (not 2-space, not minified). Do this as a targeted text insertion — find the exact string, insert next to it. Do NOT `JSON.parse` + `JSON.stringify` the whole file; that reformats every line and produces a multi-thousand-line diff (this happened before on `missing.json`).

a) In the `cause_of_death` field's `options` array, after the `"Unknown"` option object, add:
```
   {
    "value": "Other",
    "label_en": "Other",
    "label_hi": "अन्य"
   }
```
(remember the trailing comma on the previous option).

b) Immediately after the `cause_of_death` field object's closing `},` (right before the `deceased_relative_name` field object starts), insert this new field object, matching the file's 1-space indent style exactly:
```
 {
  "field_key": "cause_of_death_other",
  "record_types": [
   "UIDB"
  ],
  "field_type": "TEXT",
  "labels": {
   "en": "Cause of Death (Specify)",
   "hi": "मृत्यु का कारण (विवरण)"
  },
  "section": "inquest_details",
  "storage": {
   "table": "uidb_details",
   "column": "cause_of_death_other"
  },
  "show_when": {
   "field": "cause_of_death",
   "value": "Other"
  },
  "visible_to_levels": [
   "PS",
   "DISTRICT",
   "HQ"
  ],
  "editable_by_levels": [
   "PS"
  ],
  "introduced_at_level": "PS",
  "sort_order": 70.5,
  "full_width": false,
  "readonly": false,
  "is_active": true,
  "scope_level": "global"
 },
```

After editing, run and paste the raw output of:
```
node -e "JSON.parse(require('fs').readFileSync('config/fields/uidb.json','utf8')); console.log('valid JSON')"
git diff -b --stat config/fields/uidb.json
```
The stat should show roughly +20 lines, nothing else in the file touched.

## 2. New migration — `backend/migrations/<new_timestamp>_add_cause_of_death_other.js`

Timestamp must sort after `20260916215057_add_missing_child_role.js`. Additive only:
```js
exports.up = async function (knex) {
  const hasCol = await knex.schema.hasColumn('uidb_details', 'cause_of_death_other');
  if (!hasCol) {
    await knex.schema.alterTable('uidb_details', (t) => {
      t.string('cause_of_death_other', 500).nullable();
    });
  }
};

exports.down = async function (knex) {
  const hasCol = await knex.schema.hasColumn('uidb_details', 'cause_of_death_other');
  if (hasCol) {
    await knex.schema.alterTable('uidb_details', (t) => {
      t.dropColumn('cause_of_death_other');
    });
  }
};
```
Run the migration and paste the raw terminal output.

## 3. Sync the field registry

Run `npm run sync-config` and paste the raw output. Confirm it reports the `cause_of_death_other` row inserted/updated for UIDB.

## 4. Human-readable label — `backend/src/modules/audit/audit.controller.js`

Find the line `cause_of_death: 'Cause of Death',` (~line 52) and add directly after it:
```js
cause_of_death_other: 'Cause of Death (Other)',
```

## 5. Import template — `backend/src/modules/import/import-fields.config.js`

Find the line for `field_key: 'cause_of_death'` (~line 395) and add directly after it:
```js
{ field_key: 'cause_of_death_other', label_en: 'Cause of Death (Specify)', label_hi: 'मृत्यु का कारण (विवरण)', required: false, section: 'inquest_details' },
```

## 6. Import layout manifest — `backend/src/modules/import/layout-manifests.js`

In the `UIDB.parent` array (~line 115), inside the array find `'cause_of_death'` and insert `'cause_of_death_other'` immediately after it (still inside the same array).

## 7. Report builder — `backend/src/modules/report-builder/reportableFields.config.js`

Find the row with `key: 'cause_of_death'` (~line 606) and add a new row directly after it:
```js
{ key: 'cause_of_death_other', label_en: 'Cause of Death (Other)', label_hi: 'Cause of Death (Other)', data_type: 'text', operators: TEXT_OPS, is_pii: false, is_db_col: false, group: 'inquest_details' },
```

## 8. Mock-mode fallback schema — `frontend/src/utils/api.js`

This file has its own hardcoded copy of the UIDB `inquest_details` field list (~line 1796), used by the "Mock Mode" toggle in the testing console. If this isn't updated, testing in Mock Mode will still show the old dropdown with no "Other" option even though the real backend is fixed.

a) In the `cause_of_death` field's `options` array (~line 1805), after the `Unknown` option, add:
```js
{ value: 'Other', label_en: 'Other', label_hi: 'अन्य' }
```

b) Immediately after that field object, add:
```js
{
  field_key: 'cause_of_death_other',
  field_type: 'TEXT',
  label_en: 'Cause of Death (Specify)',
  label_hi: 'मृत्यु का कारण (विवरण)',
  validation_rules: { required: false },
  show_when: { field: 'cause_of_death', value: 'Other' }
},
```

## 9. Optional — display ordering only (not required for the field to appear)

`backend/src/modules/fields/fields.controller.js` (~line 420) has a hardcoded array that only controls sort order for `inquest_details` fields on UIDB: `['cause_of_death', 'deceased_relative_name', ...]`. The section filter itself (~line 815) is generic by `section: 'inquest_details'`, so the new field will appear without touching this file. If you want it positioned directly under Cause of Death rather than at the end of the section, add `'cause_of_death_other'` to that array and add a branch `else if (f.field_key === 'cause_of_death_other') sort_order = 40.15;`. Skip this if it's not a one-line change — it's cosmetic only.

## 10. Documentation — required every time (standing rule)

Append a new section to `DECISIONS.md` following that file's existing template (Decision / Context / Why / Alternatives / Tradeoffs / Relevant Code / Confidence / Constraints — same structure as the existing sections), documenting this change: UIDB Cause of Death "Other" option using the same config-driven `show_when` pattern already used elsewhere (e.g. `case.json`'s `other_sections` field), not a one-off special case.

Append to `FLOW.md` describing where this field fits in the existing UIDB registration flow.

## Verification — paste raw output for every step, do not summarize

1. `git status --short` — confirm only the intended files show as modified/new, nothing else (no stray scratch files, no binary files, no line-ending noise).
2. `git diff -b --stat` — confirm the diff is limited to the 7 code files + the 2 doc files + 1 new migration file.
3. Migration up output (step 2).
4. `npm run sync-config` output (step 3).
5. Restart the backend and confirm it starts with no errors (there was a backend crash from a corrupted file once before on this project — explicitly confirm no crash).
6. Screenshot of the live UIDB → Inquest Details tab: dropdown showing "Other" as an option, and selecting it reveals the new text box below Cause of Death.
