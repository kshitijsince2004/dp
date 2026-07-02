# HANDOFF — Backend Cascade Dropdown Wiring (Act/Section/MajorHead/MinorHead + Property Category)

**Status as of last update: IN PROGRESS.** Update this file immediately after every file change —
before moving to the next step. If picking this up cold: read this file first, then the plan at
`/home/ashmit/.claude/plans/wire-that-up-properly-cozy-twilight.md` for full reasoning/decisions.

Note: there is ALSO an unrelated, older `HANDOFF.md` in the repo root — that belongs to a
different, still-active task (daily-diary/report-generation, branch `report-generation-ashmit`,
matches other unrelated uncommitted changes already in the working tree). Do not confuse the two
or edit that file for this task.

## Task
Wire up two backend dropdown cascades correctly, with zero hardcoding, per the approved plan:
1. Act → Section → Major Head → Minor Head
2. Property Major Category → Property Minor Category
Backend-only. Frontend is intentionally untouched (hardcoded today, will be reworked later).

## Progress checklist
- [x] `backend/src/modules/fields/classificationSources.config.js` — created. Exports
      `ACT_GROUP_CODES`, `MINOR_HEAD_MAJOR_CODES`, `PROPERTY_CATEGORY_SOURCES`. Done.
- [x] `backend/migrations/20260702100000_add_cascade_metadata_to_field_registry.js` — created.
      Adds nullable `depends_on`/`options_source` to `field_registry`, backfills
      `property_minor_category` row only. **NOT YET RUN** — still need `npx knex migrate:latest`.
- [x] `backend/src/modules/fields/fields.service.js` — fully rewritten as the real lookup service
      layer. Exports: `getActs`, `getSectionsForActs(actCds)`, `getMajorHeadsForActs(actCds)`,
      `getMajorHeadsForSection(sectionCode)`, `getMinorHeadsForMajorHeads(codes)`,
      `getPropertyCategories()`, `getPropertyItemsForCategory(parentCd)`, `getBeats(psCd)`,
      `getLocalHeads()`. Dead CRUD-duplicate exports removed. Uses default `db` import now
      (matches controller's convention — previously used named `{ db }` import).
- [x] `backend/src/modules/fields/fields.controller.js` — `getFieldsForForm` DONE (steps 1-7
      below all complete and verified by re-reading the diff). Still remaining: step 8 (rewrite
      the 8 lookup controllers to delegate to fieldsService) and step 9 (new
      `listMajorHeadsForSection` controller) — see below, both NOT YET DONE.
      1. [x] Imports added at top: `logger`, `fieldsService`, `ACT_GROUP_CODES`/`MINOR_HEAD_MAJOR_CODES`.
      2. [x] Option-precompute block rewritten to call `fieldsService.*` via the config. `act_name`
         override deleted — seed's static 8-option list now flows through via existing default.
      3. [x] 12 hardcoded minor-head branches collapsed into one generic
         `minorHeadOptionsByFieldKey` lookup loop over `MINOR_HEAD_MAJOR_CODES`.
      4. [x] `propertyItemOptions` unfiltered query deleted; `property_minor_category` now
         `options = []`; `property_major_category` now uses numeric `parent_cd` as value.
      5. [x] `depends_on`/`options_source` additive keys added to the returned field object.
      6. [x] `logger.error` added to `getFieldsForForm`'s catch block.
      7. [x] Status-options block and per-record-type section/sort_order overrides — untouched,
         confirmed unrelated, verified while editing (only the option-precompute block and the
         if/else dispatch chain above them were touched).
      8. [x] Excel lookup controllers all rewritten to delegate to `fieldsService`. Note:
         `listPropertyItems` needed extra care — `fieldsService.getPropertyItemsForCategory`
         returns raw (unaliased) column names for the ARMS and default branches (only the GENERIC
         branch pre-aliases to `{value,label}`), so the controller explicitly reshapes all three
         cases by checking `raw?.type === 'ARMS'` first, then sniffing `'property_cd' in raw[0]`
         for the default branch. `listMajorHeads` intentionally still queries `db` directly
         (unfiltered global list, not part of either cascade, per plan §5b "keep as-is if
         time-constrained" — kept as direct query, low priority).
      9. [x] New `listMajorHeadsForSection` controller added (after `listMajorHeads`, before
         `listMinorHeadsForMajorHead`), delegates to `fieldsService.getMajorHeadsForSection`.
      Verified: `node --check` passes clean on `fields.controller.js`, `fields.service.js`,
      `classificationSources.config.js`.
- [x] `backend/src/modules/fields/fields.router.js` — added
      `router.get('/lookup/sections/:section_code/major-heads', authMiddleware, fieldsController.listMajorHeadsForSection);`
      right after the `major-heads/:major_head_code/minor-heads` route. Same auth pattern as the
      other 8 lookup routes.
- [x] Deleted `backend/src/modules/fields/fields.routes.js` — confirmed zero importers via grep
      across `backend/` before deleting.
- [x] Ran `npx knex migrate:latest` — applied cleanly (`Batch 4 run: 1 migrations`). Backfill
      verified via direct psql query: `property_minor_category` row has
      `depends_on='property_major_category'`, `options_source='/api/fields/lookup/property-items/{value}'`.
- [x] Ran `npx knex migrate:rollback` then `migrate:latest` again (note: this knex CLI version
      doesn't support `--step`, plain `migrate:rollback` rolls back the last batch, which was
      exactly our 1 migration) — columns dropped cleanly on rollback, backfill re-applied
      correctly on reapply. Migration up/down confirmed clean.
- [x] Ran full curl verification suite against a fresh dev server instance (logged in as
      `HQ002`/`Test@1234`, HQ_ADMIN role). ALL PASSED:
      - `/lookup/acts` → act_cd=43 is "IPC 1860" ✓
      - `/lookup/acts/43/sections` → section_code "43-107" = "107" ✓
      - `/lookup/sections/43-107/major-heads` (NEW endpoint) → `[{"value":104,"label":"ABETMENT"}]` ✓
      - `/lookup/major-heads/54/minor-heads` → 6 rows ✓
      - `/lookup/sections/3032-33/major-heads` (documented Excise gap) → `{"success":true,"data":[]}`,
        HTTP 200, not a 500 ✓
      - `/lookup/property-categories` → parent_cd=4 "ARMS AND AMMUNITION" ✓
      - `/lookup/property-items/4` → correct `{type:"ARMS",made,categories,fireArms}` shape,
        all sub-lists populated with `{value,label}` ✓
      - `/lookup/property-items/1` (OTHERS/Agriculture) → 27 items, e.g. CARDAMOM ✓
      - `/lookup/property-items/9` (Automobiles) → 48 items ✓
      - `/lookup/property-items/14` (Explosives — was one of the 6 broken branches) → 69 correct
        explosive-type items ✓ **bug fix confirmed**
      - `/lookup/property-items/6` (Building Materials — was returning WRONG Cultural Property
        data before this fix) → 62 correct items (ANGLE IRON, ASBESTOS SHEETS, ...) ✓
        **bug fix confirmed, this was the clearest reproduction of the original bug**
      - `GET /form/CASE` top-level shape unchanged: `['fields','is_repeater','section','title_en','title_hi']` ✓
      - `act_name` options: exactly the 8 curated seed values (IPC/Delhi Excise Act/Arms
        Act/Gambling Act/Other Act/CrPC/BNSS/BNS), NOT the old 462-row dump ✓ **root-cause bug fix confirmed**
      - `property_minor_category`: `options:[]`, `depends_on:'property_major_category'`,
        `options_source:'/api/fields/lookup/property-items/{value}'` ✓
      - `property_major_category` options now use numeric `parent_cd` values (1,2,3,...) ✓
      - `theft_minor_head` options: 6 real values (was previously working-by-luck via string
        match on 'THEFT'/'Theft', now correct-by-construction via major_head_code=54) ✓
      - No errors in server log across all requests ✓

## STATUS: COMPLETE. All code changes made, migration applied and verified clean (up/down/up),
## full curl verification suite passed against a live server, confirming both cascades work and
## all documented bugs (act_name 462-row override, listPropertyItems 6-of-9 wrong branches) are
## fixed. Dev server left running in background (PID via `npm run dev`, logs at
## `/tmp/claude-1000/-home-ashmit-Projects-Crime-Diaries/ea890c5a-1c09-466f-8e86-ac1059b93b63/scratchpad/backend-dev.log`
## — that scratchpad path is session-specific and will not persist; a future session should just
## restart `npm run dev` from `backend/` if the server isn't already running).

## Important context / gotchas for whoever continues
- Repo already has substantial UNRELATED uncommitted changes (date-formatting work across
  frontend + several backend controllers — analytics, compilation, daily-diary, import, legacy,
  records, report-builder, reports, warehouse) — confirmed via `git status` at task start, and
  this matches the OTHER `HANDOFF.md` in the repo root (different task/branch). Do NOT touch
  those files, do NOT run any `git checkout`/`restore`/`reset`/`clean` without first stashing.
  Only files listed in this handoff's checklist should be touched for this task.
- `backend/seeds/01_fields.js` also has local uncommitted changes — do NOT edit it, it's out of
  scope for this task (verified its `.onConflict('field_key').merge([...])` column list at
  lines 1486-1491 does not include the new `depends_on`/`options_source` columns, so it's safe
  to leave untouched — reseeding will never clobber them).
- Full architectural reasoning, the exact bug findings (verified live against the DB), and the
  full verification curl script live in the plan file:
  `/home/ashmit/.claude/plans/wire-that-up-properly-cozy-twilight.md` — read it before making any
  design deviation.
- `logger` is a **named** export from `backend/src/utils/logger.js` (`export const logger = ...`),
  not default — confirmed by reading the file directly.
- `db` in `fields.controller.js` is imported as the **default** export from
  `../../config/db.js`; `fields.service.js` was just changed to match this (previously used named
  `{ db }` import — now fixed to default, confirmed working).
- This module's `/lookup/*` and `/form/:record_type` routes intentionally use `authMiddleware`
  only (no `enforceScope`/role restriction) — this is correct/intentional (global reference data,
  not jurisdiction-scoped), do not "fix" this.
- Latest migration timestamp before this task was `20260702000000_menu_tables.js`; the new
  migration is `20260702100000_...` — if adding further migrations, keep timestamps increasing.
