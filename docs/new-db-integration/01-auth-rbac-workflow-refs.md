# Integration 1 — Auth, RBAC, JWT, Workflow Engine, Ref Lookups, IO Module

**Status:** done, 2026-07-14. **Branch:** `dev2/ashmit`.

Connects the auth/RBAC/JWT/workflow/hierarchy/ref-lookup layers to the
rebuilt DB (`users.ps_id` not `station_id`, single `name` column, `ref.*`
schema, config-as-data). Adds a startup auto-loader and a new
investigating-officers module. Full plan: `~/.claude/plans/lets-go-then-lets-cheeky-hoare.md`
(if still present) — this doc is the durable record.

---

## 1. Schema changes (folded into base migrations, not amendments)

- `backend/migrations/20260711000001_org_identity.js` — **`ACP` re-added** to
  `users.role` CHECK (scope = `sub_div_id`). Workflow intentionally has no ACP
  transitions yet (see §7 deferral) — this is deliberate: the role exists so
  ACP users/logins/IO-management work today, and enabling the ACP review step
  later is purely `config/workflow/*.json` rows, no code or schema change.
- Same migration file — new **`system_meta(key PK, value jsonb, updated_at)`**
  bookkeeping table (§6, ref-checksum tracking).
- `docs/db-audit/DB_SCHEMA.md` / `ER_DIAGRAM.md` / `.drawio` updated in the
  same commit per the standing ER-diagram rule.
- `backend/seeds/01_users.js` — added `acp_parliament_street` (ACP001).
- Full rebuild verified clean: `db:reset → db:migrate → sync-config → load-ref → db:seed`.

## 2. Canonical JWT payload (`backend/src/utils/generateToken.js`)

Single shape, snake_case, **ids only** — no names/codes (those come from
`/api/auth/me`, so a hierarchy rename never leaves a stale name inside a live
token):

```js
{ sub, username, badge_no, role, level, ps_id, district_id, sub_div_id }
```

Refresh payload: `{ sub }`. `ROLE_LEVELS` (same file) is the single role→level
map (`HC/SHO→PS`, `ACP→SUB_DIV`, `DISTRICT_OFFICER→DISTRICT`, `JCP→JCP`,
`SCP→SCP`, `HQ_*→HQ`) — every place that used to compute this locally
(`auth.service.js`, `auth.controller.js`) now imports it.

**Alias shim** — `backend/src/middleware/auth.middleware.js` has
`normalizeAuthUser()`, applied to every decoded token (local JWT, Keycloak,
SSE) before it becomes `req.user`. It adds `id`/`userId`/`psId`/`districtId`/
`subDivId`/`badgeNo` camelCase/legacy aliases on top of the canonical payload.
**This is the only place aliases are produced.** ~15 downstream modules still
read the camelCase forms; drain them to snake_case over time, then delete the
shim.

`env.js` gained `JWT_ACCESS_EXPIRES` (15m), `JWT_REFRESH_EXPIRES` (7d),
`STARTUP_AUTOLOAD` (true).

## 3. Auth module (`modules/auth/`)

- `resolveScope(user)` (was `resolveDistrictId`) climbs the hierarchy to
  backfill missing `sub_div_id`/`district_id` from `ps_id`. **Gotcha fixed
  here:** a PS's parent is its **SUB_DIV**, not its DISTRICT — the district is
  two hops up. The old code assumed one hop and would have written a sub-div
  UUID into `district_id`.
- Dev login backdoors (badge/email aliasing, interchangeable dev passwords)
  are gated behind `NODE_ENV === 'development'`.
- **Bug found and fixed in the same pass:** the badge-alias regex
  `/priya|do001|dcp/` matched *any* username containing `dcp` — logging in as
  the real seeded user `dcp_nwd` silently authenticated as `DO001`
  (`dcp_ndd`) instead. Fixed by trying an **exact** badge/username lookup
  first and only falling back to alias-guessing when that lookup misses. Real
  usernames now always win over alias shortcuts.
- `/api/auth/me` — response `user` object: `{ id, username, badge_no, name,
  role, level, ps_id, district_id, sub_div_id, is_active, last_login, ps_name,
  ps_code, sub_div_name, district_name }`. `jurisdiction: { station,
  sub_division, district }`. Dead `name_en/name_hi/ps_name_en/ps_code(old)`
  fields dropped.
- Orphaned `auth.routes.js` deleted (unimported duplicate of `auth.router.js`).
- `notifyHandler.js` — `record.submitted` SHO lookup fixed (`station_id` →
  `ps_id`); notification payloads switched from the old hardcoded
  `title_en/title_hi/message_en/message_hi` shape to the actual
  `notifications` table contract — `{ type, params }`, i18n-rendered at read
  time (the columns the old code wrote don't exist on the new table).

## 4. RBAC (`middleware/rbac.middleware.js`)

Final scoping table (`GLOBAL_SCOPE_ROLES = [JCP, SCP, HQ_ANALYST, HQ_ADMIN,
SYSTEM_ADMIN]`):

| Role | `jurisdictionQuery` | `verifyRecordAccess` |
|---|---|---|
| HC, SHO | `{ ps_id }` | `record.ps_id` match |
| ACP | `{ sub_div_id }` | `record.sub_div_id` match |
| DISTRICT_OFFICER | `{ district_id }` | `record.district_id` match |
| JCP, SCP, HQ_* | `{}` (global) | allow |
| *anything else* | **403** | **throw** |

Default-deny added — previously an unrecognized role silently fell through to
global scope.

## 5. Workflow engine (new `modules/workflow/workflow.engine.js`)

Single config reader — `workflow_transitions_config` is now the *only*
transition source. No fallback: an unconfigured transition throws
`Invalid action "X" for status "Y"`.

- `getRule(trx, {fromStatus, action, recordType})` — specific-row-beats-wildcard
  ordering on both `from_status` and `record_type` (so `transfer_initiate`'s
  `from_status='*'` row doesn't shadow/get shadowed).
- `resolveTarget(trx, rule, record)` — `to_status='@PRIOR'` (transfer
  accept/reject) restores **both** status and level from the ledger row that
  entered `IN_TRANSFER`; absorbs the `level_data_contracts` `DIRECT_HQ` route
  override that used to live inline in `records.service.js`.
- `getQueueStatuses(user)` — a role's queue = the `from_status` values of its
  active, role-permitted, non-wildcard, leveled transitions. Verified output:
  HC→`{DRAFT,SENT_BACK}`, SHO→`{PENDING_SHO}`, DO→`{DISTRICT_REVIEW,COMPILED}`,
  JCP→`{JCP_REVIEW}`, SCP→`{SCP_REVIEW}`, HQ_ADMIN/SYSTEM_ADMIN→`{HQ_RECEIVED}`,
  **ACP→`{}`** (no config rows yet — the "provision"), **HQ_ANALYST→`{}`**
  (behavior change — previously saw a hardcoded `[PENDING_SHO,
  DISTRICT_REVIEW, HQ_RECEIVED]` grab-bag; now uses `/records` list instead of
  a queue, since it's a read-only role with no transitions of its own).

`records.service.js` `transitionRecord()` now calls the engine instead of
inline rule parsing + the old `FALLBACK_TRANSITIONS` object (deleted, was on
the kill list). Kill-list files `workflow.service.js`, `workflow.controller.js`,
`workflow.routes.js` deleted — dual workflow-engine implementation is gone.
`GET /api/workflow/queue` route unchanged (still `records.controller.getQueue`).

**Bug found and fixed in the same pass:** `workflow_transitions.target_fields`
is `jsonb NOT NULL DEFAULT '[]'`, but the insert always passed an explicit
`targetFields ? JSON.stringify(targetFields) : null` — the literal `null`
overrode the column default and violated the NOT NULL constraint on **every**
transition with no target fields (i.e. almost all of them). Fixed to
`JSON.stringify(targetFields || [])`. This was blocking every transition
end-to-end; found while verifying the engine with fixture records.

End-to-end verified (fixture records, direct `transitionRecord` calls —
`records.service.js`'s HTTP-facing `listRecords`/queue read path is still on
the old-schema `hierarchy_nodes.name_en` join and is **out of scope**, see
§8): approve, `requires_comment` enforcement, invalid-action rejection,
wrong-role rejection, and `@PRIOR` transfer restore (status *and* level) all
confirmed correct.

## 6. Ref lookups + startup auto-load

`fields.service.js` and the direct `excel_*` queries in `fields.controller.js`
moved to `ref.*`. Table renames are 1:1 except:

- `ref.beats` — `source_ps_cd` aliased back to `ps_cd` in the query
  (`.select('beat_cd','beat_name','source_ps_cd as ps_cd')`) so the
  `/fields/lookup/beats` response shape is byte-identical.
- `ref.property_categories` — merges the old `property_types` (top-level) +
  `other_property_categories` (OTHERS sub-categories). Discriminator is
  `major_property` (`1` = top-level, `0` = sub-category) — verified directly
  against loaded data, documented in `classificationSources.config.js`.

`classificationSources.config.js` — table names updated to `ref.*`
throughout; comments too.

**`import/template-builder.service.js` and `import/import-fields.config.js`
still query `excel_*` — untouched, deliberately.** The import module's
endpoints stay broken against the new DB until its own integration (see
roadmap). Don't "fix" them by pointing at `ref.*` piecemeal — that module
needs its own pass (frozen-template parity check per baseline P3).

**Startup auto-load** (`backend/src/bootstrap/autoload.js`, called from
`index.js` between `connectDB()` and `connectEventBus()`):
1. Skip entirely if `STARTUP_AUTOLOAD=false`.
2. Always run `syncConfig()` (per-row checksum — no-op when config unchanged).
3. Run `loadRef()` only if `ref.acts` or `hierarchy_nodes` is empty, or the
   sha256 of `(Menu_Tables.xlsx + org/hierarchy.json + org/ps_codes.json +
   ref-overlays/local_head_categories.json)` differs from
   `system_meta['ref_source_checksum']`; the checksum is stored after a
   successful load.
4. Any failure throws → `index.js`'s existing catch logs and calls
   `process.exit(1)` — startup aborts loudly, server never starts serving
   stale/missing reference data.

Script logic was extracted from the two CLI scripts into
`backend/scripts/lib/{sync-config-core,load-ref-core}.mjs` (throw instead of
`process.exit`, `log` callback instead of hardcoded `console.log`) so both the
CLI (`npm run sync-config` / `npm run load-ref`, now thin wrappers) and the
bootstrap module share one implementation. Verified: first boot on an
already-loaded DB skips `load-ref`; deleting `system_meta`'s row (or wiping
`ref.*`) makes it reload; `STARTUP_AUTOLOAD=false` skips both.

## 7. Investigating-officers module (new, `modules/io/`)

`investigating_officers` (migration `20260711000001`) existed with zero
backend code before this integration. New CRUD at
`/api/(v1/)investigating-officers`, `authMiddleware + enforceScope` + `allow`.

| Endpoint | HC | SHO | ACP | DO | HQ/SYS |
|---|---|---|---|---|---|
| `GET /` | own PS (read) | own PS | every PS in own sub-div | every PS in own district | global, `?ps_id=` |
| `POST /` | — | ✔ `ps_id` **stamped from `req.user.ps_id`**, body ignored | ✔ body `ps_id` **required**, validated `node_type='PS'` and `parent_id === req.user.sub_div_id` (else 403) | — | SYSTEM_ADMIN: any real PS |
| `PATCH /:id`, `DELETE /:id` (soft) | — | own PS only | own sub-div only | — | SYSTEM_ADMIN |

Validation: `name` required; `mobile` digits-normalized; duplicate `pis_no` →
409 (partial unique index). Soft-delete = `is_active=false`; list defaults to
active-only, `?include_inactive=true` to see all.

**Bug found and fixed in the same pass:** the list query didn't filter
`is_active` at all — a soft-deleted officer stayed visible in the default
list. Fixed.

No form/dropdown wiring — that's the records write-path integration's job
once `records.io_id` actually gets written. IO curation only, per the user's
explicit "implement now, dropdown later" instruction.

## 8. Users module (`modules/users/`)

`station_id`→`ps_id`, `name_en/name_hi`→`name` throughout (the old
`createUser` INSERT wrote `station_id`+`name_en`, which hard-fails on the new
schema — this alone would have made user creation impossible). Added:
- **Role whitelist** — the 9-role CHECK set, 400 on anything else.
- **Server-side scope derivation** via the same `resolveScope()` used by
  login: HC/SHO need `ps_id` (climbs to fill sub_div/district), ACP needs
  `sub_div_id` (climbs to fill district), DISTRICT_OFFICER needs
  `district_id`. JCP/SCP/HQ_*/SYSTEM_ADMIN need none.
- `enforceScope` added to `GET /users` — DISTRICT_OFFICER now only sees users
  in their own district (previously unscoped, saw every user regardless of
  district). HQ roles stay global.

Response keeps `psId`/`station_id: ps_id`/`districtId` aliases — a handful of
frontend components still read `station_id` as a fallback — deprecated,
drain on touch.

## 9. Hierarchy module (`modules/hierarchy/`)

`node_type` `'SUB_DIVISION'` → `'SUB_DIV'` (the old value doesn't exist in the
new CHECK set — this silently broke `districtScopeIds()`, meaning
DISTRICT_OFFICER's node-scoping query always matched zero sub-divisions).
`name_en`/`name_hi` columns → single `name`, with a `name_en: n.name` compat
alias kept in every response (`getNodes`, `getTree`, create/update) since
several frontend components still read `name_en`. `createNode`/`updateNode`
now validate `node_type` against the real CHECK set (400 on e.g. the old
`SUB_DIVISION`).

**Other `SUB_DIVISION` occurrences found but left alone (out of scope,
their own modules' future integrations):**
`analytics/analytics.controller.js:195`, `import/template-builder.service.js:411`,
`import/import.controller.js:2640`, plus a stale comment in
`daily-diary/daily-diary.controller.js:30`. All in modules CLAUDE.md already
lists as unadapted.

## 10. Frontend

- Deleted the dead duplicate auth stack (verified zero live importers before
  deleting): `frontend/src/context/AuthContext.jsx` (singular — the live one
  is `contexts/AuthContext.jsx`, plural), `pages/DashboardPage.jsx`,
  `pages/queue/QueuePage.jsx`, `components/layout/Shell.jsx`,
  `pages/LoginPage.jsx` (distinct from the live `features/auth/LoginPage.jsx`).
  None were reachable from `AppRouter.jsx`.
- `store/authStore.js` — added `normalizeUser()`, a single boundary function
  that produces a consistent user object regardless of whether the caller
  passed the raw ids-only JWT payload (`contexts/AuthContext.jsx`'s decode
  path — `sub`, no `id`, no names) or the full `/me` response (`id`, `name`,
  `ps_name`/`sub_div_name`/`district_name`, no `_en` suffix anymore).
  Guarantees `ps_id/psId`, `district_id/districtId`, `sub_div_id`, `rank`,
  `stationName`, `districtKey` are always present.
- No changes needed to record-entry forms or the Excel import template — P3
  frozen-form contract untouched.
- Verified with a production build (`npm run build`) — clean, no broken
  imports from the deletions.
- **Known, expected UI degradation:** hierarchy nodes no longer carry a
  `name_hi` value (the new schema is English-only for `hierarchy_nodes` per
  the bilingual pillar decision — Hindi is additive later). Frontend spots
  that render `node.name_hi` (`HierarchyManager.jsx`,
  `DistrictAnalyticsDashboard.jsx`) will show blank Hindi labels until that
  additive work happens. Not a bug — a documented architecture consequence.

## Explicit deferrals (carried forward, not forgotten)

- **Transfers are not a real module yet — IN_TRANSFER records are invisible in
  every queue, by design, until they get one.** `config/workflow/main.json`'s
  `transfer.initiate`/`transfer.accept`/`transfer.reject` rows (`to_status:
  '@PRIOR'`) are handled generically by `workflow.engine.js`, which restores
  prior status/level from the `workflow_transitions` ledger — this works
  end-to-end (verified with fixture records) but is a stopgap. Per
  `docs/db-audit/ARCHITECTURE.md` §6, the real design is a dedicated
  `backend/src/modules/transfers/` module ("zero existing code" as of that
  doc) with its own `record_transfers`-table-backed accept/reject (prior
  state read from `record_transfers.prior_status`/`prior_level`, not the
  ledger) and PS-scoped visibility (`from_ps_id`/`to_ps_id` matching the
  user's `ps_id`) — not surfaced through the generic
  `workflow_transitions_config` queue at all. `getQueueStatuses()` correctly
  never returns `IN_TRANSFER` (its `from_level IS NULL` filter excludes it,
  matching every other level-less special status). **Decision (user,
  2026-07-15): defer building the real Transfers module; only harden the
  stopgap** — `workflow.engine.js`'s `getRule()` now rejects
  `transfer_initiate` when the record is already `IN_TRANSFER` (prevents a
  double-initiate from corrupting the `@PRIOR` chain), but nothing writes to
  `record_transfers` yet and no dedicated transfer list/accept/reject
  endpoints exist. Building the real module is the next transfers-scoped
  integration, not a patch to the generic workflow engine.
- **Import module** (`import/`) still queries `excel_*` — broken against the
  new DB until its own integration. Don't patch individual queries; it needs
  the frozen-template parity treatment (baseline P3).
- **ACP workflow transitions** — no config rows yet, so ACP's queue is
  permanently empty until someone adds `config/workflow/*.json` rows for an
  ACP review step. When that happens: **`records.current_level` CHECK
  currently only allows `('PS','DISTRICT','JCP','SCP','HQ')`** — it will need
  `'SUB_DIV'` added in the base migration (pre-launch rule: fold + full
  rebuild, no amendment migration) before an ACP transition's `to_level` can
  be written.
- **JCP/SCP** — hierarchy has the ZONE/RANGE nodes and users are seeded, but
  there's no zone/range scope FK on `users` and queues are pure status-gated
  (global read). Real zone/range jurisdiction scoping is future work — flagged
  by the user as deliberately out of scope for now.
- **IO form dropdown** — `records.io_id` isn't written by anything yet
  (records write path is the next integration); the IO module today is
  curation-only.
- **Mock API layer** (`frontend/src/utils/api.js`) — untouched; draining it is
  separate future work, not blocking real-backend operation.
- **`records.service.js` read path** (`listRecords`, `getRecordDetails`, the
  HTTP-facing side of `getQueue`) still joins `hierarchy_nodes.name_en`, which
  doesn't exist — confirmed broken during verification (`/api/workflow/queue`
  500s for any role with a non-empty queue). This is explicitly the **records
  write-path integration's** job (CLAUDE.md's stage-5 pending list), not
  patched here. The workflow *engine* itself (the part this integration
  owns) was verified correct via direct fixture-record calls, bypassing the
  broken read path.

## Verification performed

Full DB rebuild; boot sequence (first-boot loads ref, second-boot skips,
`STARTUP_AUTOLOAD=false` skips both); login for every seeded role including
ACP, with JWT payload decoded and checked against the canonical shape;
`/me` per role; RBAC default-deny for a fabricated unknown role;
refresh-token flow; `workflow.engine` unit-level (`getRule` wildcard
ordering, `getQueueStatuses` per role) and integration-level (fixture
records: approve, send-back with/without comment, invalid action, wrong
role, `@PRIOR` transfer restore) via direct service calls; ref lookups
(`beats`, ARMS property-items) against `ref.*`; IO module full RBAC matrix
(SHO stamp-own-PS, ACP in/out-of-jurisdiction, duplicate `pis_no` 409,
soft-delete list filtering, cross-jurisdiction PATCH/DELETE rejection);
users module (role validation, scope derivation, district-scoped list,
update); hierarchy module (per-role node scoping including the
previously-broken DO district scope, node_type validation); frontend
production build after deleting the dead auth stack. All fixture data
cleaned up after testing.
