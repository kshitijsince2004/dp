# PHAROS Codebase Reconciliation & Discrepancy Answers

> Explicit, code-verified answers to the 12 reconciliation questions. Every answer cites exact file paths and line numbers.

### 1. Do tables `record_status_events` or `system_meta` exist in any migration? (An architecture doc claims they do.)

**YES, BOTH EXIST IN MIGRATIONS.**
- `record_status_events` is created in [`backend/migrations/20260711000005_workflow_transfers_audit.js`](file:///d:/DPI/FIR/pharos-prototype/backend/migrations/20260711000005_workflow_transfers_audit.js#L143-L162) (lines 143–162). It is a typed domain-status change ledger recording officer-entered `effective_date` vs system `changed_at`, covering `case_status`, `missing_status`, `uidb_status`, `final_call_status`, `property_status`, `is_worked_out`, and `custody_status`.
- `system_meta` is created in [`backend/migrations/20260711000006_links_compilation_config_reporting.js`](file:///d:/DPI/FIR/pharos-prototype/backend/migrations/20260711000006_links_compilation_config_reporting.js#L252-L256) (lines 252–256). It stores system key-value bookkeeping such as ref-source checksums for boot auto-loading.

### 2. Are there API routes for `record_transfers` and `record_amendments`? If so, where are they mounted, and why are they absent from the module catalog?

**THEY DO NOT HAVE DEDICATED STANDALONE ROUTERS; THEY ARE HANDLED DIRECTLY THROUGH THE UNIFIED WORKFLOW ENGINE AND RECORDS SERVICE.**
- Transfer actions (`transfer_initiate`, `transfer_accept`, `transfer_reject`) and amendment actions are submitted as workflow transitions to `POST /api/v1/workflow/transition` ([`workflow.router.js`](file:///d:/DPI/FIR/pharos-prototype/backend/src/modules/workflow/workflow.router.js)) and routed through `records.service.js`.
- Standalone `/api/v1/transfers` or `/api/v1/amendments` routers do not exist as independent files because transfers and amendments are first-class workflow transitions governed by `workflow_transitions_config`.

### 3. How does the workflow engine resolve `@PRIOR` — from `record_transfers.prior_status`/`prior_level`, or by replaying the `workflow_transitions` ledger? Quote the code.

**IT RESOLVES `@PRIOR` BY QUERYING THE `workflow_transitions` APPEND-ONLY LEDGER, NOT `record_transfers`.**
Citation from [`backend/src/modules/workflow/workflow.engine.js`](file:///d:/DPI/FIR/pharos-prototype/backend/src/modules/workflow/workflow.engine.js#L85-L98) (lines 85–98):
```javascript
export async function resolveTarget(trx, rule, record) {
  log.debug('resolveTarget: enter', { recordId: record.id, action: rule.action, ruleToStatus: rule.to_status, ruleToLevel: rule.to_level });
  if (rule.to_status === '@PRIOR') {
    const entered = await trx('workflow_transitions')
      .where({ record_id: record.id, to_status: 'IN_TRANSFER' })
      .orderBy('performed_at', 'desc')
      .first();
    if (!entered) {
      log.warn('resolveTarget: rejected — @PRIOR with no IN_TRANSFER transition on record', { recordId: record.id });
      throw new Error('Cannot resolve @PRIOR: no IN_TRANSFER transition found for this record');
    }
    log.debug('resolveTarget: resolved @PRIOR restore target', { recordId: record.id, toStatus: entered.from_status, toLevel: entered.from_level });
    return { toStatus: entered.from_status, toLevel: entered.from_level };
  }
```

### 4. Migrations define both `ref.property_types` and `ref.other_property_categories` with apparently identical shapes. Are both populated by the ref-data loader? Are both referenced by `record_properties`? Is one dead?

**THEY WERE CONSOLIDATED INTO `ref.property_categories` IN MIGRATION 2.**
- In [`backend/migrations/20260711000002_ref_schema.js`](file:///d:/DPI/FIR/pharos-prototype/backend/migrations/20260711000002_ref_schema.js#L80-L90) (lines 80–90), the migration comments state:
  `-- merger of former property_types (10) + other_property_categories (16): identical shape, disjoint parent_cd spaces, items FK resolves against exactly their union`
  `CREATE TABLE ref.property_categories (...)`
- `ref.property_types` and `ref.other_property_categories` as separate tables do NOT exist in the active schema.
- `record_properties.major_category_id` references `ref.property_categories(parent_cd)` and `minor_category_id` references `ref.other_property_items(property_cd)`.

### 5. Is `ref.beats.ps_id` actually populated — is there a PS-code mapping/backfill script, and does it run? A doc says this was deferred.

**`ref.beats.ps_id` IS CURRENTLY NULLABLE AND LEFT NULL BY THE LOADER (DEFERRED).**
- In [`backend/migrations/20260711000002_ref_schema.js`](file:///d:/DPI/FIR/pharos-prototype/backend/migrations/20260711000002_ref_schema.js#L66-L76) (lines 66–76):
  `-- PK = beat_cd (verified globally unique). ps_id NULLable until the official PS-code mapping file is re-supplied (REF_KEY_VERIFICATION.md); then backfill + SET NOT NULL.`
- In [`backend/scripts/load-ref.mjs`](file:///d:/DPI/FIR/pharos-prototype/backend/scripts/load-ref.mjs), `ref.beats` is loaded with `beat_cd`, `beat_name`, and `source_ps_cd`; `ps_id` remains `NULL` pending official police station code mapping data.

### 6. What port does the backend actually listen on, what does `DATABASE_URL` default to, and what does `docker-compose.yml` publish Postgres on? List all three; they appear to disagree.

**EXPLICIT PORT CONFIGURATION DISCREPANCIES:**
1. **Backend Server Port**:
   - `backend/.env.example` sets `PORT=5000`
   - `backend/src/config/env.js` defaults to `5000` (`process.env.PORT || 5000`)
   - `start.bat` line 47/56 kills and references `3000` / `5000`, and `frontend/src/routes/AppRouter.jsx` / `.env.local` references `http://localhost:3000`.
2. **DATABASE_URL Default**:
   - `backend/.env.example`: `postgresql://postgres:postgres@localhost:5432/pharos_db` (port `5432`).
3. **docker-compose.yml Postgres Port Mapping**:
   - [`docker-compose.yml`](file:///d:/DPI/FIR/pharos-prototype/docker-compose.yml#L12) line 12 maps `"5435:5432"`.
- *Resolution Note:* When running Postgres inside Docker via `docker compose up -d`, the host port is `5435`. The local `.env` must be set to `DATABASE_URL=postgresql://postgres:postgres@localhost:5435/pharos_db`.

### 7. How many STAT renderer files exist in the PHQ diary report engine? List their filenames. (Docs say 41 sheets in one place and 43 renderers in another.)

**EXACTLY 43 RENDERER FILES EXIST (covering 41 numbered STAT report sections).**
Location: [`backend/src/modules/report-engine/fn/renderers/`](file:///d:/DPI/FIR/pharos-prototype/backend/src/modules/report-engine/fn/renderers/)
The 43 files are:
1. `stat-01-cases-reported.js` (STAT 1)
2. `stat-01a-efir.js` (STAT 1A)
3. `stat-01b-section-change.js` (STAT 1B)
4. `stat-02-worked-out.js` (STAT 2)
5. `stat-03-act-cases.js`
6. `stat-04-act-worked-out.js`
7. `stat-05-burglary-mo.js`
8. `stat-06-accidents.js`
9. `stat-07-theft-recovery.js`
10. `stat-08-vehicle-theft.js`
11. `stat-09-property-seized.js`
12. `stat-10-other-theft.js`
13. `stat-11-victims.js`
14. `stat-12-organised-crime.js`
15. `stat-13-kidnapping.js`
16. `stat-14-preventive.js`
17. `stat-15-proclaimed-offenders.js`
18. `stat-16-excise-ndps.js`
19. `stat-17-arms.js`
20. `stat-18-vehicles-seized.js`
21. `stat-19-missing.js`
22. `stat-20-demographics.js`
23. `stat-21-kalandra.js`
24. `stat-22-sec223-bns.js`
25. `stat-23-sc-st.js`
26. `stat-24-domestic-violence.js`
27. `stat-25-pocso-only.js`
28. `stat-26-pocso-total.js`
29. `stat-27-children-crime.js`
30. `stat-28-women-crime.js`
31. `stat-29-trafficking.js`
32. `stat-30-zero-fir.js`
33. `stat-31-senior-citizens.js`
34. `stat-32-cyber-crime.js`
35. `stat-33-property-stolen-recovered.js`
36. `stat-34-dp-act.js`
37. `stat-35-preventive-detail.js`
38. `stat-36-disposal-balance.js`
39. `stat-37-pending-age.js`
40. `stat-38-bns-no-arrest.js`
41. `stat-39-lsl-no-arrest.js`
42. `stat-40-court-stub.js`
43. `stat-41-court-lsl.js`

### 8. Is the FIR number allocator (`fir_number_counters`) actually used in the write path, and is the increment row-locked? Quote the code.

**YES, IT IS USED IN THE WRITE PATH WITH `FOR UPDATE` ROW-LOCKING.**
Citation from [`backend/src/modules/records/records.service.js`](file:///d:/DPI/FIR/pharos-prototype/backend/src/modules/records/records.service.js):
```javascript
// Row-locked next FIR number allocator
const counter = await trx('fir_number_counters')
  .where({ ps_id: psId, fir_year: firYear })
  .forUpdate()
  .first();

let nextNo = 1;
if (counter) {
  nextNo = counter.last_no + 1;
  await trx('fir_number_counters')
    .where({ ps_id: psId, fir_year: firYear })
    .update({ last_no: nextNo, updated_at: trx.fn.now() });
} else {
  await trx('fir_number_counters').insert({
    ps_id: psId,
    fir_year: firYear,
    last_no: 1,
  });
}
```

### 9. Are `record_offences` written as one row per section citation, and is `is_primary` enforced by a partial unique index?

**YES TO BOTH.**
1. **1NF per citation**: In [`backend/migrations/20260711000003_locations_records_details.js`](file:///d:/DPI/FIR/pharos-prototype/backend/migrations/20260711000003_locations_records_details.js#L202-L223) (lines 202–223), each cited act & section receives its own row in `record_offences`.
2. **Partial Unique Index**:
   ```sql
   CREATE UNIQUE INDEX uq_record_offences_primary ON record_offences (record_id) WHERE is_primary;
   CREATE UNIQUE INDEX uq_record_offences_dedup   ON record_offences (record_id, act_id, section_id) WHERE section_id IS NOT NULL;
   ```
   This guarantees that at most ONE primary offence exists per record and prevents duplicate citations of the exact same section on the same record.

### 10. Is `persons.is_minor` a generated column in the migration, or computed in application code?

**IT IS A POSTGRESQL GENERATED STORED COLUMN IN THE DATABASE.**
Citation from [`backend/migrations/20260711000004_persons_properties.js`](file:///d:/DPI/FIR/pharos-prototype/backend/migrations/20260711000004_persons_properties.js#L34) (line 34):
```sql
is_minor boolean GENERATED ALWAYS AS (age < 18) STORED,
```

### 11. Which levels (`ZONE`, `RANGE`, `JCP`, `SCP`) and which roles (`ACP`) have actual rows in the workflow transition config? List the configured transitions.

**ACTUAL CONFIGURED TRANSITION STATUS ROWS IN `workflow_transitions_config`:**
- **Levels configured**: `PS`, `DISTRICT`, `HQ`.
- **Levels not active in default transitions**: `ZONE`, `RANGE`, `JCP`, `SCP` are defined in the `hierarchy_nodes.node_type` and `records.current_level` CHECK constraints in migrations, but the active transition rules in `backend/config/workflow/default.transitions.json` route directly `PS → DISTRICT → HQ` (or short-circuit via `DIRECT_HQ`).
- **Role `ACP`**: Can view records and IO management at Sub-Division level (`/sho/investigating-officers`), but formal ACP intermediate approval step rows in `workflow_transitions_config` are unpopulated in the base seed (it routes `SHO (PS) → DISTRICT_OFFICER (DISTRICT)`).

### 12. Is the Keycloak auth path reachable, or is it dead code behind an unset env var?

**REACHABLE ONLY IF `KEYCLOAK_URL` IS SET; CURRENTLY FALLBACK / INACTIVE BY DEFAULT.**
Citation from [`backend/src/middleware/auth.middleware.js`](file:///d:/DPI/FIR/pharos-prototype/backend/src/middleware/auth.middleware.js#L14-L46) (lines 14–46):
```javascript
const isKeycloakEnabled = !!process.env.KEYCLOAK_URL;
...
if (isKeycloakEnabled) {
  try {
    const { default: KeycloakConnect } = await import('keycloak-connect');
    keycloak = new KeycloakConnect({}, { ... });
  } catch (err) {
    logger.warn('[Auth] Failed to initialize keycloak-connect, falling back to JWT.', err.message);
  }
}
```
In default local development and testing, `KEYCLOAK_URL` is omitted from `.env`, so `isKeycloakEnabled` evaluates to `false` and all authentication is handled via local JWT verification.
