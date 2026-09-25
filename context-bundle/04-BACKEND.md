# PHAROS Backend Structural Outline & Engine Specifications

> Structural breakdown of all 23 backend modules, large file outlines, event flows, and the complete workflow state machine.

## 1. Workflow Engine (`workflow.engine.js` — Verbatim)
```javascript
import db from '../../config/db.js';
import { getLogger } from '../../utils/logger.js';

/**
 * THE workflow engine — the single reader of `workflow_transitions_config`
 * (synced from config/workflow/*.json). There is no in-code fallback: if a
 * transition isn't in config, it does not exist. Adding a state or a whole
 * review step (e.g. ACP) is config rows, never code.
 */
const log = getLogger('workflow.engine');

const parseRoles = (value) => {
  if (Array.isArray(value)) return value;
  if (typeof value === 'string') {
    try { return JSON.parse(value); } catch { return value.split(','); }
  }
  return [];
};

/**
 * Look up the transition rule for (fromStatus, action, recordType).
 * Wildcards: from_status='*' (e.g. transfer.initiate) and record_type='*'
 * both match, but a specific row always beats a wildcard row.
 * Throws when no active rule exists.
 */
export async function getRule(dbc, { fromStatus, action, recordType }) {
  const normalizedAction = String(action).toLowerCase();
  log.debug('getRule: enter', { fromStatus, action: normalizedAction, recordType });

  // Safety invariant, not a business rule: transfer_initiate's from_status='*'
  // wildcard would otherwise match a record that's already IN_TRANSFER,
  // letting a second initiate corrupt the @PRIOR restore chain. This can't be
  // expressed as a config row without a real transfers module (record_transfers-
  // backed, tracked separately — see docs/new-db-integration §Deferrals), so
  // it's a code-level guard until that ships.
  if (fromStatus === 'IN_TRANSFER' && normalizedAction === 'transfer_initiate') {
    log.warn('getRule: rejected — record already IN_TRANSFER, second initiate blocked', { fromStatus, recordType });
    throw new Error('Record is already IN_TRANSFER — cannot initiate a second transfer');
  }

  const row = await (dbc ?? db)('workflow_transitions_config')
    .where({ is_active: true, action: normalizedAction })
    .whereIn('from_status', [fromStatus, '*'])
    .whereIn('record_type', [recordType, '*'])
    .orderByRaw('(from_status = ?) DESC, (record_type = ?) DESC', [fromStatus, recordType])
    .first();

  if (!row) {
    log.warn('getRule: rejected — no active transition config row', { fromStatus, action: normalizedAction, recordType });
    throw new Error(`Invalid action "${action}" for status "${fromStatus}"`);
  }
  const rule = { ...row, allowed_roles: parseRoles(row.allowed_roles) };
  log.debug('getRule: resolved rule', {
    fromStatus, action: normalizedAction, recordType,
    toStatus: rule.to_status, toLevel: rule.to_level, allowedRoles: rule.allowed_roles,
    requiresComment: !!rule.requires_comment, wasWildcardStatus: row.from_status === '*', wasWildcardType: row.record_type === '*',
  });
  return rule;
}

export function assertAllowed(rule, user) {
  if (rule.allowed_roles.length && !rule.allowed_roles.includes(user.role)) {
    log.warn('assertAllowed: rejected — role not permitted', { action: rule.action, userRole: user.role, allowedRoles: rule.allowed_roles, userId: user.id });
    throw new Error(`Insufficient permissions: role ${user.role} is not allowed to perform action ${rule.action}`);
  }
  log.debug('assertAllowed: permitted', { action: rule.action, userRole: user.role, userId: user.id });
}

export function assertComment(rule, comment) {
  if (rule.requires_comment && (!comment || comment.trim().length === 0)) {
    log.warn('assertComment: rejected — comment required but missing/blank', { action: rule.action });
    throw new Error('Comment is required for this action');
  }
  log.debug('assertComment: passed', { action: rule.action, requiresComment: !!rule.requires_comment, hasComment: !!comment });
}

/**
 * Resolve the concrete target (status, level) for a rule against a record.
 * - to_status '@PRIOR' (transfer accept/reject) restores BOTH the status and
 *   the level captured by the ledger row that entered IN_TRANSFER.
 * - A NULL to_level means "stay at the record's current level".
 * - The level_data_contracts DIRECT_HQ route can short-circuit
 *   DISTRICT_REVIEW→approve straight to HQ (routing config, not code).
 */
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

  let toStatus = rule.to_status;
  let toLevel = rule.to_level ?? record.current_level;

  if (rule.from_status === 'DISTRICT_REVIEW' && rule.action === 'approve') {
    const contract = await trx('level_data_contracts')
      .where({ from_level: 'DISTRICT', to_level: 'HQ', is_active: true })
      .first();
    if (contract && contract.route === 'DIRECT_HQ') {
      log.debug('resolveTarget: DIRECT_HQ level_data_contracts route matched — short-circuiting to HQ_RECEIVED', { recordId: record.id });
      toStatus = 'HQ_RECEIVED';
      toLevel = 'HQ';
    } else {
      log.debug('resolveTarget: no DIRECT_HQ route active — normal DISTRICT_REVIEW approve target stands', { recordId: record.id, toStatus, toLevel });
    }
  }

  log.debug('resolveTarget: exit', { recordId: record.id, action: rule.action, toStatus, toLevel });
  return { toStatus, toLevel };
}

/**
 * Queue derivation: the statuses a role acts on = the from_status values of
 * its active transitions. `from_status <> '*'` keeps always-available actions
 * (transfer.initiate) out of queues; `from_level IS NOT NULL` keeps the
 * LEGACY/AMENDMENT family out of daily queues. A role with no transitions
 * (ACP until its config rows land, HQ_ANALYST by design) gets an empty queue.
 */
export async function getQueueStatuses(user) {
  log.debug('getQueueStatuses: enter', { userId: user.id, role: user.role });
  const rows = await db('workflow_transitions_config')
    .distinct('from_status')
    .where({ is_active: true })
    .whereNot('from_status', '*')
    .whereNotNull('from_level')
    .whereRaw('allowed_roles @> ?::jsonb', [JSON.stringify([user.role])]);
  const statuses = rows.map((r) => r.from_status);
  log.debug('getQueueStatuses: exit', { userId: user.id, role: user.role, statuses });
  return statuses;
}
```

### Detailed Explanation of Resolution Invariants:
1. **`@PRIOR` Resolution**:
   - Resolved by `resolveTarget(trx, rule, record)` (lines 87–98).
   - When `rule.to_status === '@PRIOR'`, it queries the `workflow_transitions` append-only ledger for the most recent row where `to_status = 'IN_TRANSFER'`.
   - It restores BOTH `entered.from_status` and `entered.from_level` to exactly what they were prior to the transfer.
   - It does NOT rely on `record_transfers` table for state transitions.

2. **`DIRECT_HQ` Routing**:
   - Resolved in `resolveTarget(trx, rule, record)` (lines 103–114).
   - When a record is at `DISTRICT_REVIEW` and the action is `approve`, it checks `level_data_contracts` for an active contract between `DISTRICT` and `HQ`.
   - If `contract.route === 'DIRECT_HQ'`, the target status is short-circuited directly to `HQ_RECEIVED` at `HQ` level, skipping intermediate review levels.

## 2. Structural Outlines of High-Complexity Backend Files

### File: `backend/src/modules/records/records.service.js` (1,659 lines) — Core Record CRUD & Single-Transaction Sub-table Persistence

**Exported Symbols (16):** validateRequiredFields, listRecords, getRecordDetails, createRecord, createImportedRecord, updateRecord, submitRecord, transitionRecord, overrideCaseHead, updateDomainStatus, getStatusOptions, getRecordRevisions, setRecordFrozen, checkDuplicateRecord, searchRecordsWithSpec, deleteRecord

**Database Tables Touched:** audit_logs, hierarchy_nodes, locations, persons, record_amendments, record_links, record_offences, record_properties, record_revisions, record_status_events, record_transfers, records, ref.acts, ref.beats, ref.local_heads, ref.major_heads, ref.minor_heads, ref.sections, workflow_transitions

**Transaction Boundary (`knex.transaction` / `trx`):** YES (Atomic single-transaction writes)

**Constants & Lookup Dictionaries Defined:**
```javascript
const STATUS_FIELD_DEFS = [
  { statusField: 'case_status', recordType: 'CASE', column: 'case_status' },
  { statusField: 'custody_status', recordType: 'ARREST', column: 'case_status' },
  { statusField: 'missing_status', recordType: 'MISSING', column: 'missing_status' },
  { statusField: 'uidb_status', recordType: 'UIDB', column: 'uidb_status' },
  { statusField: 'final_call_status', recordType: 'PCR_CALL', column: 'final_call_status' },
  { statusField: 'is_worked_out', recordType: 'CASE', column: 'is_worked_out', valueType: 'boolean' },
];
const EDITABLE_STATUSES = ['DRAFT', 'SENT_BACK'];
const EVENT_NAME_BY_ACTION = { submit: 'submitted', approve: 'approved', send_back: 'sent_back' };
const VALID_FIELDS = [...STATUS_FIELD_DEFS.map((d) => d.statusField), 'property_status'];
```

### File: `backend/src/modules/records/records.mapper.js` (1,186 lines) — Bidirectional Database-to-API and API-to-Database Mapping

**Exported Symbols (14):** PINCODE_MIN_DIGITS, enumCoercion, pincodeCoercion, DETAIL_TABLES, PERSON_SUBTYPE_TABLES, REPEATER_ROLES, roleForPersonType, DETAIL_LOCATION_SLOTS, PERSON_LOCATION_SLOTS, loadRegistry, resolveStorage, buildOffenceRows, splitPayload, recomposeRecord

**Database Tables Touched:** field_registry

**Transaction Boundary (`knex.transaction` / `trx`):** YES (Atomic single-transaction writes)

**Constants & Lookup Dictionaries Defined:**
```javascript
const ENUM_UPPER_COLUMNS = {
  persons: new Set(['gender', 'relation_type']),
  record_properties: new Set(['status']),
};
const DETAIL_TABLES = {
  CASE: 'fir_details', ARREST: 'arrest_details', PCR_CALL: 'pcr_call_details',
  MISSING: 'missing_details', UIDB: 'uidb_details',
};
const PERSON_SUBTYPE_TABLES = ['arrestee_details', 'missing_person_details', 'person_descriptions'];
const PERSON_ROLES = ['COMPLAINANT', 'ACCUSED', 'VICTIM', 'WITNESS', 'ARRESTEE', 'MISSING', 'DECEASED', 'INFORMANT', 'CALLER', 'IO'];
const PERSON_TYPE_TO_ROLE = { ARRESTED: 'ARRESTEE' };
const ROLE_TO_PERSON_TYPE = { ARRESTEE: 'ARRESTED' };
```

### File: `backend/src/modules/records/records.normalize.js` (601 lines) — Data Normalization, Enums Coercion & Type Sanitation

**Exported Symbols (21):** toBool, normalizePhone, normalizeText, normalizeEnumUpper, normalizeDate, expandFirYear, normalizeFirNo, deriveFirYear, loadKnownActLabels, loadValidActCds, resolveAct, resolveSection, resolveMajorHead, resolveMinorHead, resolveLocalHead, resolveBeat, resolvePropertyCategoryCode, resolvePropertyMajorCategory, resolvePropertyMinorCategory, isDeferredPropertyTypeColumn, resolvePropertyTypeColumn

**Database Tables Touched:** ref.acts, ref.beats, ref.local_heads, ref.major_heads, ref.minor_heads, ref.other_property_items, ref.property_categories, ref.sections

**Transaction Boundary (`knex.transaction` / `trx`):** YES (Atomic single-transaction writes)

### File: `backend/src/modules/fields/fields.controller.js` (1,570 lines) — Field Registry CRUD, Custom Fields & Schema Generation

**Exported Symbols (17):** getFieldsForForm, listAllFields, createRegistryField, updateRegistryField, toggleRegistryField, listActs, listSectionsForAct, listMajorHeads, listMajorHeadsForSection, listMinorHeadsForMajorHead, listPropertyCategories, listPropertyItems, listBeats, listLocalHeads, listStateDistricts, listInvestigatingOfficersLookup, listRecordTypes

**Database Tables Touched:** field_registry, ref.acts, ref.major_heads, ref.major_minor_mapping

**Transaction Boundary (`knex.transaction` / `trx`):** No (Single query reads)

**Constants & Lookup Dictionaries Defined:**
```javascript
const VALID_FIELD_TYPES = ['TEXT', 'TEXTAREA', 'NUMBER', 'DATE', 'DATETIME', 'SELECT', 'BOOLEAN', 'TIME', 'RADIO'];
const VALID_RECORD_TYPES = ['CASE', 'ARREST', 'PCR_CALL', 'MISSING', 'UIDB'];
```

### File: `backend/src/modules/analytics/analytics.controller.js` (1,444 lines) — Parametric KPI Aggregations & Crime Analytics Queries

**Exported Symbols (20):** getSummary, getTrends, getCompare, getOverview, getByPs, getByCrimeHead, getCombinedTrends, exportSpreadsheet, getStatusBreakdown, getPsDashboardSummary, getPsDashboardStatsV2, getCaseTypeBreakdown, getTrendForRecordType, getCasesByMonthTrend, getByDistrict, getArrestsTrend, getArrestsTrendBreakdown, getCrimeHeadMatrix, getCaseStatusBreakdown, getCrimeHeadYearTrend

**Database Tables Touched:** field_registry, filter_presets, hierarchy_nodes, persons, records, ref.local_heads

**Transaction Boundary (`knex.transaction` / `trx`):** No (Single query reads)

**Constants & Lookup Dictionaries Defined:**
```javascript
const DETAIL_TABLES = { CASE: 'fir_details', ARREST: 'arrest_details', PCR_CALL: 'pcr_call_details', MISSING: 'missing_details', UIDB: 'uidb_details' };
const DETAIL_REF_COLUMN = { CASE: 'fir_no', ARREST: 'fir_no', PCR_CALL: 'pcr_no', MISSING: 'gd_no', UIDB: 'uidb_no' };
const DETAIL_STATUS_COLUMN = { CASE: 'case_status', ARREST: 'case_status', PCR_CALL: 'final_call_status', MISSING: 'missing_status', UIDB: 'uidb_status' };
const CASE_LIKE_TYPES = ['CASE', 'UIDB', 'MISSING'];
const TREND_MONTH_NAMES = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
```

### File: `backend/src/modules/phq-diary/phq-diary.excel.js` (869 lines) — PHQ Diary 41-Sheet Excel Generator & Precise Cell Mapping

**Exported Symbols (8):** writeManualySheet, writeDailyDiarySheet, writeMondayMorningSheet, writeDistrictSheet, writeLOSheet, writeWeekSheet, writeVariationSheet, buildWorkbook

**Database Tables Touched:** None/Dynamic

**Transaction Boundary (`knex.transaction` / `trx`):** No (Single query reads)

**Constants & Lookup Dictionaries Defined:**
```javascript
const FONT_BOLD  = { bold: true, size: 9, name: 'Arial Narrow' };
const FONT_NORM  = { bold: false, size: 9, name: 'Arial Narrow' };
const FONT_TITLE = { bold: true, size: 11, name: 'Arial Narrow' };
const ALIGN_CENTER = { horizontal: 'center', vertical: 'middle', wrapText: true };
const ALIGN_LEFT   = { horizontal: 'left',   vertical: 'middle' };
const ALIGN_RIGHT  = { horizontal: 'right',  vertical: 'middle' };
```

## 3. Complete Module Catalog (`backend/src/modules/`)

### Module: `admin`
| File | Lines | Size |
|---|---|---|
| `admin.router.js` | 17 | 848 bytes |

### Module: `analytics`
| File | Lines | Size |
|---|---|---|
| `analytics.controller.js` | 1,443 | 62,650 bytes |
| `analytics.router.js` | 36 | 2,333 bytes |

### Module: `audit`
| File | Lines | Size |
|---|---|---|
| `audit.controller.js` | 299 | 11,943 bytes |
| `audit.router.js` | 29 | 1,662 bytes |
| `audit.scheduler.js` | 70 | 2,799 bytes |
| `audit.service.js` | 148 | 8,395 bytes |

### Module: `auth`
| File | Lines | Size |
|---|---|---|
| `auth.controller.js` | 307 | 10,773 bytes |
| `auth.router.js` | 27 | 1,285 bytes |
| `auth.service.js` | 280 | 11,917 bytes |

### Module: `compilation`
| File | Lines | Size |
|---|---|---|
| `compilation.controller.js` | 98 | 4,552 bytes |
| `compilation.routes.js` | 151 | 5,099 bytes |
| `compilation.service.js` | 223 | 10,617 bytes |

### Module: `daily-diary`
| File | Lines | Size |
|---|---|---|
| `daily-diary.controller.js` | 209 | 5,984 bytes |
| `daily-diary.router.js` | 20 | 849 bytes |
| `daily-diary.service.js` | 71 | 3,757 bytes |
| `templates/Daily dairy all tables NO MULTIVALUED (1).xlsx` | 319 | 43,996 bytes |

### Module: `fields`
| File | Lines | Size |
|---|---|---|
| `classificationSources.config.js` | 64 | 5,073 bytes |
| `fields.controller.js` | 1,569 | 77,436 bytes |
| `fields.router.js` | 38 | 2,374 bytes |
| `fields.service.js` | 243 | 10,767 bytes |
| `statusOptions.config.js` | 85 | 5,467 bytes |

### Module: `filters`
| File | Lines | Size |
|---|---|---|
| `filters.controller.js` | 258 | 11,232 bytes |
| `filters.router.js` | 15 | 555 bytes |

### Module: `hierarchy`
| File | Lines | Size |
|---|---|---|
| `hierarchy.controller.js` | 356 | 13,033 bytes |
| `hierarchy.router.js` | 24 | 1,183 bytes |

### Module: `import`
| File | Lines | Size |
|---|---|---|
| `import-fields.config.js` | 706 | 71,551 bytes |
| `import-key-bridge.config.js` | 126 | 8,877 bytes |
| `import.compose.js` | 219 | 13,154 bytes |
| `import.controller.js` | 652 | 36,411 bytes |
| `import.parse.js` | 1,257 | 59,320 bytes |
| `import.router.js` | 123 | 5,875 bytes |
| `import.service.js` | 640 | 42,469 bytes |
| `import.validate.js` | 898 | 58,074 bytes |
| `layout-manifests.js` | 138 | 13,693 bytes |
| `registry-sync.util.js` | 122 | 6,371 bytes |
| `template-builder.service.js` | 2,343 | 119,391 bytes |

### Module: `io`
| File | Lines | Size |
|---|---|---|
| `io.controller.js` | 62 | 3,088 bytes |
| `io.router.js` | 18 | 911 bytes |
| `io.service.js` | 217 | 10,501 bytes |

### Module: `level-contracts`
| File | Lines | Size |
|---|---|---|
| `levelContracts.controller.js` | 32 | 1,851 bytes |
| `levelContracts.router.js` | 17 | 807 bytes |
| `levelContracts.service.js` | 308 | 18,287 bytes |

### Module: `logs`
| File | Lines | Size |
|---|---|---|
| `logs.controller.js` | 84 | 3,596 bytes |
| `logs.router.js` | 14 | 716 bytes |

### Module: `notifications`
| File | Lines | Size |
|---|---|---|
| `notifications.controller.js` | 75 | 2,953 bytes |
| `notifications.routes.js` | 59 | 2,495 bytes |
| `notifications.service.js` | 55 | 2,013 bytes |
| `sse.js` | 95 | 3,121 bytes |

### Module: `phq-diary`
| File | Lines | Size |
|---|---|---|
| `phq-diary.calc.js` | 536 | 19,235 bytes |
| `phq-diary.config.js` | 219 | 12,862 bytes |
| `phq-diary.controller.js` | 99 | 3,878 bytes |
| `phq-diary.data.js` | 453 | 20,237 bytes |
| `phq-diary.excel.js` | 868 | 37,050 bytes |
| `phq-diary.router.js` | 18 | 773 bytes |
| `phq-diary.service.js` | 84 | 3,128 bytes |

### Module: `record-links`
| File | Lines | Size |
|---|---|---|
| `record-links.controller.js` | 116 | 5,502 bytes |
| `record-links.router.js` | 14 | 871 bytes |
| `record-links.service.js` | 244 | 10,885 bytes |

### Module: `records`
| File | Lines | Size |
|---|---|---|
| `records.controller.js` | 403 | 19,178 bytes |
| `records.mapper.js` | 1,185 | 67,862 bytes |
| `records.normalize.js` | 600 | 34,799 bytes |
| `records.router.js` | 38 | 2,504 bytes |
| `records.service.js` | 1,658 | 98,123 bytes |

### Module: `report-builder`
| File | Lines | Size |
|---|---|---|
| `queryEngine.js` | 1,043 | 46,925 bytes |
| `reportBuilder.controller.js` | 736 | 34,290 bytes |
| `reportBuilder.router.js` | 70 | 4,110 bytes |
| `reportableFields.config.js` | 637 | 69,687 bytes |

### Module: `report-engine`
| File | Lines | Size |
|---|---|---|
| `district/District diary.xlsx` | 3,886 | 509,017 bytes |
| `district/detail-fetcher.js` | 225 | 9,454 bytes |
| `district/district-diary.service.js` | 245 | 11,106 bytes |
| `district/generate_district_diary.ps1` | 279 | 9,629 bytes |
| `district/generate_district_diary.py` | 179 | 7,280 bytes |
| `district/renderers/accident.js` | 90 | 3,464 bytes |
| `district/renderers/d1-resolution.js` | 136 | 6,538 bytes |
| `district/renderers/d10-66dp.js` | 49 | 2,080 bytes |
| `district/renderers/d13-66dp.js` | 52 | 2,179 bytes |
| `district/renderers/d2-heinous.js` | 60 | 2,196 bytes |
| `district/renderers/d8-fir-listing.js` | 82 | 3,144 bytes |
| `district/renderers/d9-fir-arrests.js` | 86 | 3,198 bytes |
| `district/renderers/d9-kal-arrests.js` | 86 | 3,214 bytes |
| `district/renderers/daily-chart.js` | 136 | 6,281 bytes |
| `district/renderers/dcsp-chart.js` | 177 | 8,686 bytes |
| `district/renderers/efir-matrix.js` | 56 | 2,366 bytes |
| `district/renderers/g22-daily.js` | 103 | 4,186 bytes |
| `district/renderers/morning-diary.js` | 164 | 7,527 bytes |
| `district/renderers/n123-register.js` | 122 | 5,493 bytes |
| `district/renderers/pcr-calls.js` | 54 | 2,120 bytes |
| `district/renderers/rcell-comp.js` | 154 | 6,397 bytes |
| `district/renderers/rcell-dd.js` | 120 | 5,039 bytes |
| `fn/FN DIARY.xlsx` | 2,267 | 323,239 bytes |
| `fn/fn-count-fetcher.js` | 200 | 7,455 bytes |
| `fn/fn-diary.service.js` | 463 | 24,016 bytes |
| `fn/fn-heads.js` | 76 | 3,633 bytes |
| `fn/renderers/stat-01-cases-reported.js` | 37 | 1,779 bytes |
| `fn/renderers/stat-01a-efir.js` | 22 | 923 bytes |
| `fn/renderers/stat-01b-section-change.js` | 19 | 663 bytes |
| `fn/renderers/stat-02-worked-out.js` | 43 | 2,112 bytes |
| `fn/renderers/stat-03-act-cases.js` | 64 | 1,826 bytes |
| `fn/renderers/stat-04-act-worked-out.js` | 70 | 2,159 bytes |
| `fn/renderers/stat-05-burglary-mo.js` | 54 | 2,175 bytes |
| `fn/renderers/stat-06-accidents.js` | 13 | 621 bytes |
| `fn/renderers/stat-07-theft-recovery.js` | 46 | 1,511 bytes |
| `fn/renderers/stat-08-vehicle-theft.js` | 52 | 1,843 bytes |
| `fn/renderers/stat-09-property-seized.js` | 33 | 971 bytes |
| `fn/renderers/stat-10-other-theft.js` | 39 | 1,305 bytes |
| `fn/renderers/stat-11-victims.js` | 73 | 2,201 bytes |
| `fn/renderers/stat-12-organised-crime.js` | 5 | 256 bytes |
| `fn/renderers/stat-13-kidnapping.js` | 14 | 704 bytes |
| `fn/renderers/stat-14-preventive.js` | 5 | 252 bytes |
| `fn/renderers/stat-15-proclaimed-offenders.js` | 5 | 241 bytes |
| `fn/renderers/stat-16-excise-ndps.js` | 27 | 1,259 bytes |
| `fn/renderers/stat-17-arms.js` | 15 | 636 bytes |
| `fn/renderers/stat-18-vehicles-seized.js` | 5 | 257 bytes |
| `fn/renderers/stat-19-missing.js` | 31 | 1,633 bytes |
| `fn/renderers/stat-20-demographics.js` | 25 | 1,110 bytes |
| `fn/renderers/stat-21-kalandra.js` | 5 | 233 bytes |
| `fn/renderers/stat-22-sec223-bns.js` | 5 | 249 bytes |
| `fn/renderers/stat-23-sc-st.js` | 12 | 514 bytes |
| `fn/renderers/stat-24-domestic-violence.js` | 37 | 1,640 bytes |
| `fn/renderers/stat-25-pocso-only.js` | 22 | 1,118 bytes |
| `fn/renderers/stat-26-pocso-total.js` | 20 | 848 bytes |
| `fn/renderers/stat-27-children-crime.js` | 5 | 265 bytes |
| `fn/renderers/stat-28-women-crime.js` | 5 | 266 bytes |
| `fn/renderers/stat-29-trafficking.js` | 5 | 249 bytes |
| `fn/renderers/stat-30-zero-fir.js` | 5 | 244 bytes |
| `fn/renderers/stat-31-senior-citizens.js` | 5 | 262 bytes |
| `fn/renderers/stat-32-cyber-crime.js` | 12 | 494 bytes |
| `fn/renderers/stat-33-property-stolen-recovered.js` | 5 | 268 bytes |
| `fn/renderers/stat-34-dp-act.js` | 5 | 274 bytes |
| `fn/renderers/stat-35-preventive-detail.js` | 5 | 248 bytes |
| `fn/renderers/stat-36-disposal-balance.js` | 54 | 2,405 bytes |
| `fn/renderers/stat-37-pending-age.js` | 51 | 1,932 bytes |
| `fn/renderers/stat-38-bns-no-arrest.js` | 5 | 263 bytes |
| `fn/renderers/stat-39-lsl-no-arrest.js` | 5 | 264 bytes |
| `fn/renderers/stat-40-court-stub.js` | 5 | 248 bytes |
| `fn/renderers/stat-41-court-lsl.js` | 5 | 251 bytes |
| `report-engine.service.js` | 25 | 1,063 bytes |
| `shared/calc.js` | 18 | 504 bytes |
| `shared/canonical-codes.js` | 85 | 3,885 bytes |
| `shared/count-fetcher.js` | 67 | 2,367 bytes |
| `shared/date-windows.js` | 89 | 2,497 bytes |
| `shared/print-setup.js` | 23 | 662 bytes |
| `shared/scope.js` | 3 | 128 bytes |

### Module: `reports`
| File | Lines | Size |
|---|---|---|
| `engine/baselineService.js` | 96 | 3,275 bytes |
| `engine/channelResolver.js` | 42 | 1,112 bytes |
| `engine/headResolver.js` | 66 | 2,343 bytes |
| `engine/measureEngine.js` | 75 | 2,901 bytes |
| `engine/periodResolver.js` | 106 | 3,839 bytes |
| `engine/scopeResolver.js` | 222 | 6,902 bytes |
| `engine/templateRuntime.js` | 437 | 18,581 bytes |
| `engine/validator.js` | 35 | 1,376 bytes |
| `reports.controller.js` | 1,400 | 67,675 bytes |
| `reports.router.js` | 31 | 1,906 bytes |
| `scheduler.js` | 175 | 7,559 bytes |
| `templates/arrest-summary.html` | 122 | 2,943 bytes |
| `templates/cases-register.html` | 122 | 2,946 bytes |
| `templates/daily-status.html` | 164 | 4,096 bytes |
| `templates/district-compilation.html` | 122 | 2,958 bytes |
| `templates/pcr-call-log.html` | 122 | 2,938 bytes |

### Module: `users`
| File | Lines | Size |
|---|---|---|
| `users.controller.js` | 335 | 16,143 bytes |
| `users.router.js` | 23 | 1,450 bytes |

### Module: `warehouse`
| File | Lines | Size |
|---|---|---|
| `etl/backfill.js` | 36 | 1,514 bytes |
| `etl/bridges.js` | 87 | 3,284 bytes |
| `etl/dimensions.js` | 303 | 9,317 bytes |
| `etl/normalize.js` | 48 | 1,814 bytes |
| `etl/sync.js` | 371 | 13,079 bytes |
| `warehouse.controller.js` | 29 | 775 bytes |
| `warehouse.db.js` | 167 | 5,326 bytes |
| `warehouse.router.js` | 17 | 478 bytes |
| `warehouse.scheduler.js` | 76 | 2,559 bytes |

### Module: `workflow`
| File | Lines | Size |
|---|---|---|
| `workflow.engine.js` | 138 | 6,981 bytes |
| `workflow.router.js` | 10 | 346 bytes |

## 4. Core Server Infrastructure Files Verbatim

### `backend/src/app.js`
```javascript
import express from 'express';
import cors from 'cors';
import helmet from 'helmet';
import morgan from 'morgan';
import cookieParser from 'cookie-parser';
import rateLimit from 'express-rate-limit';

import { env } from './config/env.js';
import { logger } from './utils/logger.js';
import * as eventBus from './events/eventBus.js';
import * as notifyHandler from './events/handlers/notifyHandler.js';
import * as linkAuditHandler from './events/handlers/linkAuditHandler.js';
import * as linkResolver from './events/handlers/linkResolver.js';
import * as importConfirmHandler from './events/handlers/importConfirmHandler.js';
import { initScheduler } from './modules/reports/scheduler.js';
import { ipAllowlistMiddleware, csrfDoubleSubmitMiddleware } from './middleware/security.middleware.js';
import { authMiddleware } from './middleware/auth.middleware.js';
import { getActsSectionsRegistry } from './modules/fields/fields.service.js';
import { requestLoggerMiddleware } from './middleware/requestLogger.middleware.js';
import logsRouter from './modules/logs/logs.router.js';

// Import routers
import authRouter from './modules/auth/auth.router.js';
import fieldsRouter from './modules/fields/fields.router.js';
import recordsRouter from './modules/records/records.router.js';
import workflowRouter from './modules/workflow/workflow.router.js';
import analyticsRouter from './modules/analytics/analytics.router.js';
import reportsRouter from './modules/reports/reports.router.js';
import importRouter from './modules/import/import.router.js';
import usersRouter from './modules/users/users.router.js';
import hierarchyRouter from './modules/hierarchy/hierarchy.router.js';
import adminRouter from './modules/admin/admin.router.js';
import auditRouter from './modules/audit/audit.router.js';
import compilationRouter from './modules/compilation/compilation.routes.js';
import levelContractsRouter from './modules/level-contracts/levelContracts.router.js';
import filtersRouter from './modules/filters/filters.router.js';
import notificationsRouter from './modules/notifications/notifications.routes.js';
import dailyDiaryRouter from './modules/daily-diary/daily-diary.router.js';
import phqDiaryRouter from './modules/phq-diary/phq-diary.router.js';
import warehouseRouter from './modules/warehouse/warehouse.router.js';
import recordLinksRouter from './modules/record-links/record-links.router.js';
import ioRouter from './modules/io/io.router.js';



const app = express();

// Base middleware
app.use(helmet());
const isDevMode = env.NODE_ENV === 'development';
app.use(cors({
  origin: (origin, callback) => {
    // In development allow any localhost/127.0.0.1 port; in prod use explicit allowlist
    if (!origin || isDevMode && /^https?:\/\/(localhost|127\.0\.0\.1)(:\d+)?$/.test(origin)) {
      return callback(null, true);
    }
    if (origin === env.FRONTEND_URL) return callback(null, true);
    callback(new Error(`CORS: origin ${origin} not allowed`));
  },
  credentials: true,
  exposedHeaders: ['Content-Disposition'],
}));
app.use(express.json({ limit: '10mb' }));
app.use(express.urlencoded({ extended: true, limit: '10mb' }));
app.use(cookieParser());

// Request correlation + req/res logging (foundation, logging-instrumentation-2026-07-22).
// Registered right after cookieParser, before everything else below, so every request from this
// point on — including the client-log ingest route mounted next — runs inside an
// AsyncLocalStorage context carrying a requestId (utils/requestContext.js), and the id is
// already echoed on the response before any downstream middleware/handler runs.
app.use(requestLoggerMiddleware);

// Client-log ingest (`POST /api/logs/client` / `/api/v1/logs/client`) is mounted HERE —
// deliberately BEFORE ipAllowlistMiddleware / csrfDoubleSubmitMiddleware / the apiLimiter
// registration below — so it is exempt from all three without touching
// middleware/security.middleware.js at all: Express never reaches a later app.use() for a
// request this router has already fully handled (res.status(...).json(...) / .end()). It is
// also never wrapped in authMiddleware (that's applied per-router elsewhere, not globally here),
// so it accepts logs from a logged-out/broken-auth browser by design — see
// docs/logging-instrumentation-2026-07-22/HANDOFF.md §6, traps #3 (auth leniency), #4
// (rate-limit exempt) and #6 (CSRF exempt). logs.controller.js does its own best-effort JWT
// decode to attach a userId when a token IS present, but never 401s on its absence.
app.use('/api/v1/logs', logsRouter);
app.use('/api/logs', logsRouter);

app.use(ipAllowlistMiddleware);
app.use(csrfDoubleSubmitMiddleware);
app.use(morgan('dev'));

// Rate limiting
const isDevOrTest = env.NODE_ENV === 'development' || env.NODE_ENV === 'test' || process.env.PHAROS_TEST === 'true';
const apiLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: isDevOrTest ? 99999 : 100,
  message: { status: 'error', code: 'RATE_LIMITED', message: 'Too many requests' }
});
const authLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: isDevOrTest ? 99999 : 50,
  message: { status: 'error', code: 'RATE_LIMITED', message: 'Too many requests' }
});
app.use('/api/', apiLimiter);
app.use('/api/v1/auth', authLimiter);

// Bind API Routes (Dual Registration for compatibility)
app.use('/api/v1/auth', authRouter);
app.use('/api/auth', authRouter);

app.get('/api/acts-sections', authMiddleware, async (req, res) => {
  try {
    const data = await getActsSectionsRegistry();
    return res.status(200).json({ success: true, data });
  } catch (error) {
    logger.error('Failed to fetch acts-sections registry', { error: error.message });
    return res.status(500).json({ success: false, message: error.message });
  }
});

app.use('/api/v1/fields', fieldsRouter);
app.use('/api/fields', fieldsRouter);

app.use('/api/v1/records', recordsRouter);
app.use('/api/records', recordsRouter);

app.use('/api/v1/workflow', workflowRouter);
app.use('/api/workflow', workflowRouter);

app.use('/api/v1/analytics', analyticsRouter);
app.use('/api/analytics', analyticsRouter);

app.use('/api/v1/compilations', compilationRouter);
app.use('/api/compilations', compilationRouter);

app.use('/api/v1/reports', reportsRouter);
app.use('/api/reports', reportsRouter);

app.use('/api/v1/import', importRouter);
app.use('/api/import', importRouter);

app.use('/api/v1/admin/users', usersRouter);
app.use('/api/v1/users', usersRouter);
app.use('/api/users', usersRouter);

app.use('/api/v1/admin/hierarchy', hierarchyRouter);
app.use('/api/v1/hierarchy', hierarchyRouter);
app.use('/api/hierarchy', hierarchyRouter);

app.use('/api/v1/investigating-officers', ioRouter);
app.use('/api/investigating-officers', ioRouter);

app.use('/api/v1/admin', adminRouter);
app.use('/api/admin', adminRouter);

app.use('/api/v1/audit', auditRouter);
app.use('/api/audit', auditRouter);

app.use('/api/v1/level-contracts', levelContractsRouter);
app.use('/api/level-contracts', levelContractsRouter);

app.use('/api/v1/filters', filtersRouter);
app.use('/api/filters', filtersRouter);

app.use('/api/v1/notifications', notificationsRouter);
app.use('/api/notifications', notificationsRouter);

app.use('/api/v1/daily-diary', dailyDiaryRouter);
app.use('/api/daily-diary', dailyDiaryRouter);
app.use('/api/v1/phq-diary', phqDiaryRouter);
app.use('/api/phq-diary', phqDiaryRouter);

app.use('/api/v1/warehouse', warehouseRouter);
app.use('/api/warehouse', warehouseRouter);

app.use('/api/v1/record-links', recordLinksRouter);
app.use('/api/record-links',    recordLinksRouter);



// Health check
app.get('/api/v1/health', (req, res) => {
  return res.status(200).json({ success: true, message: 'PHAROS Backend Operational API online' });
});
app.get('/api/health', (req, res) => {
  return res.status(200).json({ success: true, message: 'PHAROS Backend Operational API online' });
});

// 404 Route Not Found handler
app.use((req, res, next) => {
  return res.status(404).json({ success: false, message: `Route not found: ${req.originalUrl}` });
});

// Global Error Handler
app.use((err, req, res, next) => {
  logger.error('[AppError] Caught global error:', err.stack || err.message);
  return res.status(err.status || 500).json({
    success: false,
    message: err.message || 'Internal Server Error'
  });
});

const startServer = async () => {
  // Connect Event Broker
  await eventBus.connect();

  // Start background handlers
  await notifyHandler.init();
  await linkAuditHandler.init();
  await linkResolver.init();
  await importConfirmHandler.init();
  await initScheduler();

  app.listen(env.PORT, () => {
    logger.info('===================================================');
    logger.info(`  PHAROS API Server listening on port ${env.PORT}`);
    logger.info(`  Mode: ${env.NODE_ENV}`);
    logger.info('===================================================');
  });
};

if (process.env.PHAROS_TEST !== 'true' && process.argv[1] && (process.argv[1].endsWith('app.js') || process.argv[1].endsWith('app'))) {
  startServer().catch(err => {
    logger.error('[App] Failed to start server:', err.message);
    process.exit(1);
  });
}
export default app;
```

### `backend/src/middleware/auth.middleware.js`
```javascript
import jwt from 'jsonwebtoken';
import { env } from '../config/env.js';
import { getLogger, logger } from '../utils/logger.js';
import { setContext } from '../utils/requestContext.js';
import { roleRateLimitMiddleware } from './security.middleware.js';

// B3 scope (logging-instrumentation-2026-07-22, HANDOFF.md §3): auth is a bug hotspot —
// token-present/verify-outcome is logged below, the token itself NEVER (only `{ hasToken }`
// and, once decoded, `{ userId, role }`). Also wires the EXTRA TASK from the HANDOFF: once
// `req.user` is set, `setContext({ userId, role })` enriches every downstream log line on this
// request with who made it, not just the ambient requestId.
const log = getLogger('auth.middleware');

const isKeycloakEnabled = !!process.env.KEYCLOAK_URL;

/**
 * The access token carries the canonical snake_case payload only
 * ({ sub, username, badge_no, role, level, ps_id, district_id, sub_div_id } —
 * see utils/generateToken.js). This shim adds the aliases legacy module code
 * still reads (id/userId/psId/districtId/subDivId/badgeNo). It is the ONLY
 * place aliases are produced; drain callers to snake_case, then delete it.
 */
const normalizeAuthUser = (decoded) => ({
  ...decoded,
  id: decoded.sub ?? decoded.id,
  userId: decoded.sub ?? decoded.id,
  badgeNo: decoded.badge_no,
  psId: decoded.ps_id ?? null,
  districtId: decoded.district_id ?? null,
  subDivId: decoded.sub_div_id ?? null,
});

let keycloak = null;
if (isKeycloakEnabled) {
  try {
    const { default: KeycloakConnect } = await import('keycloak-connect');
    keycloak = new KeycloakConnect({}, {
      realm: 'pharos',
      'auth-server-url': process.env.KEYCLOAK_URL,
      resource: 'pharos-api',
      'bearer-only': true
    });
  } catch (err) {
    logger.warn('[Auth] Failed to initialize keycloak-connect, falling back to JWT.', err.message);
  }
}

export const authMiddleware = (req, res, next) => {
  const authHeader = req.headers.authorization;
  log.debug('authMiddleware: enter', { hasToken: !!(authHeader && authHeader.startsWith('Bearer ')), method: req.method, path: req.path });
  if (!authHeader || !authHeader.startsWith('Bearer ')) {
    log.warn('authMiddleware: rejected — Bearer token missing', { method: req.method, path: req.path });
    return res.status(401).json({
      status: 'error',
      success: false,
      code: 'UNAUTHORIZED',
      message: 'Authentication required: Bearer token is missing'
    });
  }

  const token = authHeader.split(' ')[1];

  const proceed = () => {
    log.debug('authMiddleware: proceeding to role rate limiter', { userId: req.user?.id, role: req.user?.role });
    roleRateLimitMiddleware(req, res, next);
  };

  // 1. Try local custom JWT verification first (fallback/test suite compatibility)
  try {
    const decoded = jwt.verify(token, env.JWT_SECRET);
    req.user = normalizeAuthUser(decoded);
    // EXTRA TASK (HANDOFF.md, B3): req.user.id / req.user.role are the canonical fields
    // normalizeAuthUser guarantees (id aliases decoded.sub, role passes through from the
    // token payload verbatim) — enrich the ambient request context so every log line
    // downstream of this point carries who made the request, not just the requestId.
    setContext({ userId: req.user.id, role: req.user.role });
    log.info('authMiddleware: local JWT verified', { userId: req.user.id, role: req.user.role, path: req.path });
    return proceed();
  } catch (error) {
    log.debug('authMiddleware: local JWT verification failed, trying Keycloak fallback', { path: req.path, keycloakEnabled: isKeycloakEnabled, err: error.message });
    // 2. Custom JWT failed, try Keycloak if enabled
    if (isKeycloakEnabled && keycloak) {
      keycloak.grantManager.validateAccessToken(token)
        .then(userToken => {
          if (userToken) {
            const content = userToken.content;
            req.user = normalizeAuthUser({
              sub: content.sub,
              username: content.preferred_username || content.username || '',
              badge_no: content.preferred_username || content.badgeNo || content.badge_no || '',
              role: content.role || (content.realm_access?.roles?.find(r => ['HC','SHO','ACP','DISTRICT_OFFICER','JCP','SCP','HQ_ANALYST','HQ_ADMIN','SYSTEM_ADMIN'].includes(r))) || 'HC',
              level: content.level || 'PS',
              ps_id: content.psId || content.ps_id || null,
              district_id: content.districtId || content.district_id || null,
              sub_div_id: content.subDivId || content.sub_div_id || null,
            });
            setContext({ userId: req.user.id, role: req.user.role });
            log.info('authMiddleware: Keycloak token verified', { userId: req.user.id, role: req.user.role, path: req.path });
            return proceed();
          } else {
            log.warn('authMiddleware: rejected — Keycloak token invalid/expired', { path: req.path });
            return res.status(401).json({
              status: 'error',
              success: false,
              code: 'UNAUTHORIZED',
              message: 'Invalid or expired Keycloak token'
            });
          }
        })
        .catch(err => {
          log.error('authMiddleware: Keycloak verification failed', { path: req.path, err });
          return res.status(401).json({
            status: 'error',
            success: false,
            code: 'UNAUTHORIZED',
            message: 'Authentication token verification failed: ' + err.message
          });
        });
    } else {
      log.warn('authMiddleware: rejected — invalid/expired token, Keycloak not enabled', { path: req.path });
      return res.status(401).json({
        status: 'error',
        success: false,
        code: 'UNAUTHORIZED',
        message: 'Invalid or expired authentication token'
      });
    }
  }
};

export const requireAuth = () => authMiddleware;

/**
 * Lightweight JWT verifier for SSE connections.
 * EventSource cannot set custom headers, so the client passes
 * the access token as ?token= in the query string.
 */
export const sseAuthMiddleware = (req, res, next) => {
  const token = req.query.token;
  log.debug('sseAuthMiddleware: enter', { hasToken: !!token, path: req.path });
  if (!token) {
    log.warn('sseAuthMiddleware: rejected — token query param missing', { path: req.path });
    return res.status(401).json({
      status: 'error',
      success: false,
      code: 'UNAUTHORIZED',
      message: 'Authentication required: token query param is missing'
    });
  }

  try {
    const decoded = jwt.verify(token, env.JWT_SECRET);
    req.user = normalizeAuthUser(decoded);
    setContext({ userId: req.user.id, role: req.user.role });
    log.info('sseAuthMiddleware: SSE token verified', { userId: req.user.id, role: req.user.role, path: req.path });
    return next();
  } catch (error) {
    log.warn('sseAuthMiddleware: rejected — invalid/expired SSE token', { path: req.path, err: error.message });
    return res.status(401).json({
      status: 'error',
      success: false,
      code: 'UNAUTHORIZED',
      message: 'Invalid or expired SSE token'
    });
  }
};
```

### `backend/src/middleware/error.middleware.js`
```javascript
import { ApiError } from '../utils/ApiError.js';
import { getLogger } from '../utils/logger.js';
import { redact } from '../utils/redact.js';

const log = getLogger('error.middleware');

/**
 * Global Express error handler.
 * Must be the LAST middleware registered in app.js.
 */
// eslint-disable-next-line no-unused-vars
export const errorHandler = (err, req, res, next) => {
  // Enriched, structured (HANDOFF.md §3): `err` as the meta key lets the logger's
  // `expandErrorMeta` format expand name/message/stack/code automatically (same convention as
  // records.service.js) — no need to hand-pluck `err.stack` separately. Body/query redacted
  // since a request that errored may carry the exact secret-bearing payload the redaction rule
  // exists for (e.g. a login failure). This does not duplicate requestLogger.middleware.js's
  // request:start/finish lines — those log the request lifecycle; this logs the failure detail.
  log.error('errorHandler: unhandled error reached global handler', {
    statusCode: err.statusCode || 500,
    method: req.method,
    // `req.path` only, NEVER req.originalUrl — the SSE auth route carries the raw JWT as
    // `?token=...` (EventSource can't set headers), and req.originalUrl includes the query
    // string verbatim. requestLogger.middleware.js's safeUrlParts() exists for this exact leak;
    // this handler isn't allowed to touch that foundation-owned file, so it just avoids the
    // query string entirely rather than reimplementing redaction on the URL.
    path: req.path,
    userId: req.user?.id || null,
    role: req.user?.role || null,
    body: req.body && Object.keys(req.body).length ? redact(req.body) : undefined,
    query: req.query && Object.keys(req.query).length ? redact(req.query) : undefined,
    err,
  });

  // Known operational error
  if (err instanceof ApiError) {
    return res.status(err.statusCode).json({
      success: false,
      statusCode: err.statusCode,
      message: err.message,
      errors: err.errors,
      timestamp: err.timestamp,
    });
  }

  // Mongoose validation error
  if (err.name === 'ValidationError') {
    const errors = Object.values(err.errors).map((e) => e.message);
    return res.status(422).json({
      success: false,
      statusCode: 422,
      message: 'Validation failed',
      errors,
    });
  }

  // Mongoose duplicate key error
  if (err.code === 11000) {
    const field = Object.keys(err.keyValue)[0];
    return res.status(409).json({
      success: false,
      statusCode: 409,
      message: `${field} already exists`,
      errors: [],
    });
  }

  // Mongoose cast error (invalid ObjectId)
  if (err.name === 'CastError') {
    return res.status(400).json({
      success: false,
      statusCode: 400,
      message: `Invalid ${err.path}: ${err.value}`,
      errors: [],
    });
  }

  // JWT errors
  if (err.name === 'JsonWebTokenError' || err.name === 'TokenExpiredError') {
    return res.status(401).json({
      success: false,
      statusCode: 401,
      message: 'Invalid or expired token',
      errors: [],
    });
  }

  // Fallback — 500 Internal Server Error
  return res.status(500).json({
    success: false,
    statusCode: 500,
    message: 'Internal server error',
    errors: [],
  });
};

/**
 * 404 Not Found handler — register AFTER all routes.
 */
export const notFound = (req, res) => {
  // path only, not originalUrl — same query-string/JWT-leak reasoning as errorHandler above.
  log.warn('notFound: route not found', { method: req.method, path: req.path });
  res.status(404).json({
    success: false,
    statusCode: 404,
    message: `Route not found: ${req.method} ${req.originalUrl}`,
    errors: [],
  });
};
```

### `backend/src/middleware/rateLimiter.middleware.js`
```javascript
import rateLimit from 'express-rate-limit';
import { ApiError } from '../utils/ApiError.js';
import { getLogger } from '../utils/logger.js';

const log = getLogger('rateLimiter.middleware');

const makeHandler = (message, limiterName) => (req, res, next) => {
  log.warn('rateLimiter: limit hit', { limiter: limiterName, method: req.method, path: req.path, ip: req.ip, userId: req.user?.id || null });
  next(new ApiError(429, message));
};

/**
 * General API rate limiter — 100 requests per 15 minutes.
 */
export const globalLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 100,
  standardHeaders: true,
  legacyHeaders: false,
  handler: makeHandler('Too many requests, please try again later.', 'global'),
});

/**
 * Strict limiter for auth routes — 10 attempts per 15 minutes.
 */
export const authLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 10,
  standardHeaders: true,
  legacyHeaders: false,
  handler: makeHandler('Too many login attempts, please try again after 15 minutes.', 'auth'),
});
```

### `backend/src/middleware/rbac.middleware.js`
```javascript
import db from '../config/db.js';
import { getLogger } from '../utils/logger.js';

const log = getLogger('rbac.middleware');

export const allow = (...roles) => {
  return (req, res, next) => {
    if (!req.user) {
      log.warn('allow: rejected — no req.user (authMiddleware did not run first?)', { requiredRoles: roles, path: req.path });
      return res.status(401).json({
        status: 'error',
        success: false,
        code: 'UNAUTHORIZED',
        message: 'Authentication required'
      });
    }
    if (!roles.includes(req.user.role)) {
      log.warn('allow: denied — role not in allow-list', { userId: req.user.id, role: req.user.role, requiredRoles: roles, path: req.path });
      return res.status(403).json({
        status: 'error',
        success: false,
        code: 'FORBIDDEN',
        message: 'Insufficient permissions'
      });
    }
    log.debug('allow: permitted', { userId: req.user.id, role: req.user.role, requiredRoles: roles, path: req.path });
    next();
  };
};

export const requireRole = (...roles) => allow(...roles);


// Roles with global (unscoped) read: JCP/SCP review queues are gated by record
// status (workflow config), not geography — no zone/range FK exists on users by
// design. HQ roles are global by definition.
const GLOBAL_SCOPE_ROLES = ['JCP', 'SCP', 'HQ_ANALYST', 'HQ_ADMIN', 'SYSTEM_ADMIN'];

export const enforceScope = (req, res, next) => {
  if (!req.user) {
    log.warn('enforceScope: rejected — no req.user', { path: req.path });
    return res.status(401).json({ success: false, message: 'Authentication required' });
  }

  const { role, ps_id, district_id, sub_div_id } = req.user;
  req.jurisdictionQuery = {};
  log.debug('enforceScope: enter', { userId: req.user.id, role, psId: ps_id, districtId: district_id, subDivId: sub_div_id, path: req.path });

  if (role === 'HC' || role === 'SHO') {
    if (!ps_id) {
      log.warn('enforceScope: rejected — user not bound to a Police Station', { userId: req.user.id, role });
      return res.status(403).json({ success: false, message: 'User is not bound to a Police Station' });
    }
    req.jurisdictionQuery.ps_id = ps_id;
  } else if (role === 'ACP') {
    if (!sub_div_id) {
      log.warn('enforceScope: rejected — user not bound to a Sub-Division', { userId: req.user.id, role });
      return res.status(403).json({ success: false, message: 'User is not bound to a Sub-Division' });
    }
    req.jurisdictionQuery.sub_div_id = sub_div_id;
  } else if (role === 'DISTRICT_OFFICER') {
    if (!district_id) {
      log.warn('enforceScope: rejected — user not bound to a District', { userId: req.user.id, role });
      return res.status(403).json({ success: false, message: 'User is not bound to a District' });
    }
    req.jurisdictionQuery.district_id = district_id;
  } else if (!GLOBAL_SCOPE_ROLES.includes(role)) {
    // Default-deny: an unrecognized role must never fall through to global scope
    log.warn('enforceScope: rejected — unknown role, default-deny (never falls through to global)', { userId: req.user.id, role });
    return res.status(403).json({ success: false, message: `Unknown role: ${role}` });
  }

  log.debug('enforceScope: scope decision', { userId: req.user.id, role, jurisdictionQuery: req.jurisdictionQuery });
  next();
};

export const verifyRecordAccess = async (recordId, user) => {
  const { role, ps_id, district_id, sub_div_id } = user;
  log.debug('verifyRecordAccess: enter', { recordId, userId: user.id, role });
  if (GLOBAL_SCOPE_ROLES.includes(role)) {
    log.debug('verifyRecordAccess: allowed — global scope role', { recordId, userId: user.id, role });
    return true;
  }

  const record = await db('records').where({ id: recordId }).first();
  if (!record) {
    log.warn('verifyRecordAccess: denied — record not found', { recordId, userId: user.id });
    throw new Error('Record not found');
  }

  if (role === 'HC' || role === 'SHO') {
    if (record.ps_id !== ps_id) {
      log.warn('verifyRecordAccess: denied — record outside PS jurisdiction', { recordId, userId: user.id, role, userPsId: ps_id, recordPsId: record.ps_id });
      throw new Error('Access denied: Record falls outside your police station jurisdiction');
    }
  } else if (role === 'ACP') {
    if (record.sub_div_id !== sub_div_id) {
      log.warn('verifyRecordAccess: denied — record outside sub-division jurisdiction', { recordId, userId: user.id, role, userSubDivId: sub_div_id, recordSubDivId: record.sub_div_id });
      throw new Error('Access denied: Record falls outside your sub-division jurisdiction');
    }
  } else if (role === 'DISTRICT_OFFICER') {
    if (record.district_id !== district_id) {
      log.warn('verifyRecordAccess: denied — record outside district jurisdiction', { recordId, userId: user.id, role, userDistrictId: district_id, recordDistrictId: record.district_id });
      throw new Error('Access denied: Record falls outside your district jurisdiction');
    }
  } else {
    // Default-deny for unrecognized roles
    log.warn('verifyRecordAccess: denied — unknown role, default-deny', { recordId, userId: user.id, role });
    throw new Error(`Access denied: unknown role ${role}`);
  }

  log.debug('verifyRecordAccess: allowed', { recordId, userId: user.id, role });
  return true;
};
```

### `backend/src/middleware/requestLogger.middleware.js`
```javascript
import crypto from 'crypto';
import { runWithContext } from '../utils/requestContext.js';
import { getLogger } from '../utils/logger.js';
import { redact } from '../utils/redact.js';

const log = getLogger('http');

/** Splits `req.originalUrl` into a bare path + a redacted query object. Load-bearing: the SSE
 * auth path (`sseAuthMiddleware`, notifications stream) carries the raw access token as
 * `?token=...` because EventSource cannot set custom headers — logging `originalUrl` verbatim
 * would print a full JWT into every backend log file. `redact()` masks any sensitive-named query
 * param (token/access_token/jwt/etc, case-insensitive) while still recording which params were
 * present, which is what caught this exact leak during foundation verification. */
function safeUrlParts(req) {
  const raw = req.originalUrl || '';
  const qIndex = raw.indexOf('?');
  if (qIndex === -1) return { url: raw };
  const urlPath = raw.slice(0, qIndex);
  const query = Object.fromEntries(new URLSearchParams(raw.slice(qIndex + 1)));
  return { url: urlPath, query: redact(query) };
}

/**
 * Foundation's request-correlation + request/response logging middleware
 * (logging-instrumentation-2026-07-22, HANDOFF.md §2/§4). Registered EARLY in app.js — right
 * after cookieParser, before everything else (including the client-log ingest router) — so:
 *
 *   1. Every request gets an `x-request-id` (read from the incoming header if the caller
 *      already has one — e.g. the frontend's api.js interceptor — otherwise generated here).
 *   2. The rest of the request's handling runs inside `runWithContext(...)` (AsyncLocalStorage,
 *      utils/requestContext.js), so every `getLogger(...)` call anywhere on this request's stack
 *      — controller, service, mapper, event publish — picks up the SAME requestId automatically,
 *      with zero parameters threaded through any function signature.
 *   3. The id is echoed back via the `x-request-id` response header so the frontend can log the
 *      same id it sent and the two logs correlate 1:1 for one API call.
 *
 * userId/role: `req.user` is not populated yet at this point for the normal flow (authMiddleware
 * runs later, per-router) — that's fine, the context is intentionally mutable via
 * `setContext({ userId, role })`, which any router's own auth step can call once it resolves
 * `req.user`, to enrich every subsequent log line on this request with who made it. Not wiring
 * that up anywhere is not a bug — the requestId alone is the load-bearing correlation key this
 * middleware exists to provide; userId enrichment is a bonus a later agent can add cheaply.
 */
export function requestLoggerMiddleware(req, res, next) {
  const incomingId = req.headers['x-request-id'];
  const requestId = typeof incomingId === 'string' && incomingId.trim()
    ? incomingId.trim()
    : crypto.randomUUID();

  res.setHeader('x-request-id', requestId);

  const ctx = {
    requestId,
    userId: req.user?.id || req.user?.userId || req.user?.sub || null,
    role: req.user?.role || null,
  };

  runWithContext(ctx, () => {
    const startedAt = process.hrtime.bigint();
    const urlParts = safeUrlParts(req);

    log.info('request:start', { method: req.method, ...urlParts });
    // Body logged separately at debug (dropped entirely outside dev) and always redacted —
    // request:start above intentionally carries only method/url per the convention.
    if (req.body && Object.keys(req.body).length) {
      log.debug('request:body', { method: req.method, ...urlParts, body: redact(req.body) });
    }

    res.on('finish', () => {
      const durationMs = Number(process.hrtime.bigint() - startedAt) / 1e6;
      log.info('request:finish', {
        method: req.method,
        ...urlParts,
        status: res.statusCode,
        durationMs: Math.round(durationMs * 100) / 100,
      });
    });

    next();
  });
}
```

### `backend/src/middleware/security.middleware.js`
```javascript
import { getLogger } from '../utils/logger.js';

const log = getLogger('security.middleware');

function isIntranetIp(ip) {
  if (!ip) return false;
  let cleanIp = ip;
  if (ip.startsWith('::ffff:')) {
    cleanIp = ip.substring(7);
  }
  if (cleanIp === '127.0.0.1' || cleanIp === '::1' || cleanIp === 'localhost') return true;

  if (cleanIp.startsWith('10.')) return true;
  if (cleanIp.startsWith('192.168.')) return true;
  if (cleanIp.startsWith('172.')) {
    const parts = cleanIp.split('.');
    if (parts.length >= 2) {
      const secondPart = parseInt(parts[1], 10);
      if (secondPart >= 16 && secondPart <= 31) return true;
    }
  }
  return false;
}

export const ipAllowlistMiddleware = (req, res, next) => {
  const clientIp = req.ip || req.headers['x-forwarded-for'] || req.socket.remoteAddress;
  if (process.env.NODE_ENV === 'test' || process.env.PHAROS_TEST === 'true') {
    return next();
  }

  const enforceIntranet = process.env.ENFORCE_INTRANET === 'true';
  if (enforceIntranet && !isIntranetIp(clientIp)) {
    log.warn('ipAllowlistMiddleware: rejected — IP outside allowed intranet range', { clientIp, path: req.path });
    return res.status(403).json({
      status: 'error',
      success: false,
      code: 'FORBIDDEN',
      message: `Access denied: IP address ${clientIp} is outside the allowed intranet range.`
    });
  }
  log.debug('ipAllowlistMiddleware: allowed', { clientIp, enforceIntranet, path: req.path });
  next();
};

import crypto from 'crypto';

export const csrfDoubleSubmitMiddleware = (req, res, next) => {
  const safeMethods = ['GET', 'HEAD', 'OPTIONS'];

  let csrfTokenCookie = req.cookies ? req.cookies['csrfToken'] : null;

  // 1. Always provision a CSRF token if the user doesn't have one
  if (!csrfTokenCookie) {
    csrfTokenCookie = crypto.randomUUID();
    res.cookie('csrfToken', csrfTokenCookie, {
      httpOnly: false, // Frontend needs to read this for double-submit
      secure: process.env.NODE_ENV === 'production',
      sameSite: 'lax',
      path: '/'
    });
    log.debug('csrfDoubleSubmitMiddleware: provisioned new csrfToken cookie', { path: req.path });
  }

  // 2. Safe methods are always allowed
  if (safeMethods.includes(req.method)) {
    return next();
  }

  // 3. Exempt initial Authentication endpoints because the browser won't
  // have the token to send in the header yet (it gets provisioned on this response)
  const exemptPaths = ['/api/v1/auth/login', '/api/v1/auth/refresh', '/api/auth/login', '/api/auth/refresh'];
  if (exemptPaths.includes(req.path)) {
    log.debug('csrfDoubleSubmitMiddleware: exempt path, skipping check', { path: req.path });
    return next();
  }

  if (process.env.NODE_ENV === 'test' || process.env.PHAROS_TEST === 'true') {
    return next();
  }

  const csrfTokenHeader = req.headers['x-csrf-token'];

  // 4. Validate Double-Submit matching
  if (!csrfTokenCookie || !csrfTokenHeader || csrfTokenCookie !== csrfTokenHeader) {
    log.warn('csrfDoubleSubmitMiddleware: rejected — CSRF token mismatch or missing', {
      path: req.path, method: req.method, hasCookie: !!csrfTokenCookie, hasHeader: !!csrfTokenHeader,
    });
    return res.status(403).json({
      status: 'error',
      success: false,
      code: 'FORBIDDEN',
      message: 'CSRF token mismatch or missing. Double-submit token validation failed.'
    });
  }
  log.debug('csrfDoubleSubmitMiddleware: token matched, allowed', { path: req.path, method: req.method });
  next();
};

const rateLimitStores = {};

export const roleRateLimitMiddleware = (req, res, next) => {
  if (!req.user) {
    return next();
  }

  if (process.env.NODE_ENV === 'test' || process.env.PHAROS_TEST === 'true') {
    return next();
  }

  const userId = req.user.userId || req.user.id;
  const role = req.user.role;

  let limit = 100;
  if (role === 'HC') limit = 200;
  else if (role === 'SHO') limit = 150;
  else if (role === 'HQ_ANALYST' || role === 'HQ_ADMIN') limit = 300;
  else if (role === 'SYSTEM_ADMIN') limit = 50;

  const now = Date.now();
  if (!rateLimitStores[userId]) {
    rateLimitStores[userId] = [];
  }

  rateLimitStores[userId] = rateLimitStores[userId].filter(timestamp => now - timestamp < 60000);

  if (rateLimitStores[userId].length >= limit) {
    log.warn('roleRateLimitMiddleware: limit hit', { userId, role, limit, path: req.path });
    return res.status(429).json({
      status: 'error',
      success: false,
      code: 'RATE_LIMITED',
      message: 'Too many requests for your role. Please try again later.'
    });
  }

  rateLimitStores[userId].push(now);
  log.debug('roleRateLimitMiddleware: allowed', { userId, role, limit, currentCount: rateLimitStores[userId].length, path: req.path });
  next();
};
```

### `backend/src/events/eventBus.js`
```javascript
import amqp from 'amqplib';
import EventEmitter from 'events';
import { env } from '../config/env.js';
import { getLogger } from '../utils/logger.js';

// STYLE ANCHOR follow-up (logging-instrumentation-2026-07-22, HANDOFF.md §3/§7, B3 scope): this
// is the ONE place every cross-module event flows through (P1's RabbitMQ-only rule), so every
// publish/subscribe/consume/ack/nack is logged here — a silent drop anywhere in the pharos
// exchange surfaces as a missing log line in this module's output.
const log = getLogger('eventBus');

let channel = null;
let connection = null;
const localEmitter = new EventEmitter();
let isMock = false;

export async function connect() {
  log.debug('connect: enter', { rabbitmqUrl: env.RABBITMQ_URL ? '[configured]' : '[missing]' });
  try {
    connection = await amqp.connect(env.RABBITMQ_URL);
    channel = await connection.createChannel();
    await channel.assertExchange('pharos', 'topic', { durable: true });
    isMock = false;
    log.info('connect: RabbitMQ EventBus connected', { exchange: 'pharos', type: 'topic' });
  } catch (error) {
    isMock = true;
    log.warn('connect: RabbitMQ offline, falling back to local in-memory events', { err: error });
  }
}

export async function publish(routingKey, payload) {
  const messagePayload = {
    ...payload,
    ts: new Date().toISOString()
  };

  // Key ids likely to identify "which entity this event is about" across the codebase's payload
  // shapes — logged whenever present so a tester can grep one id across publish/consume lines.
  const keyIds = {
    recordId: payload?.record_id ?? null,
    batchId: payload?.batch_id ?? payload?.batchId ?? null,
    compilationId: payload?.compilation_id ?? null,
    linkId: payload?.link_id ?? null,
  };

  log.debug('publish: enter', { routingKey, keyIds, keys: Object.keys(payload || {}) });

  if (isMock || !channel) {
    // Dispatch via in-memory emitter
    localEmitter.emit(routingKey, messagePayload);
    // Also emit wildcard events
    const parts = routingKey.split('.');
    if (parts.length > 0) {
      localEmitter.emit(`${parts[0]}.*`, messagePayload);
    }
    log.info('publish: dispatched via mock in-memory emitter', { routingKey, keyIds });
    return;
  }

  try {
    channel.publish(
      'pharos',
      routingKey,
      Buffer.from(JSON.stringify(messagePayload)),
      { persistent: true }
    );
    log.info('publish: published to RabbitMQ exchange', { routingKey, exchange: 'pharos', keyIds });
  } catch (err) {
    log.error('publish: publish error, falling back to local emitter', { routingKey, keyIds, err });
    // Fallback to local
    localEmitter.emit(routingKey, messagePayload);
  }
}

export async function subscribe(pattern, queueName, handler) {
  if (typeof queueName === 'function') {
    handler = queueName;
    queueName = `${pattern.replace(/[^a-zA-Z0-9.-]/g, '_')}-queue`;
  }
  log.debug('subscribe: enter', { pattern, queueName, isMock: isMock || !channel });

  if (isMock || !channel) {
    localEmitter.on(pattern, async (payload) => {
      log.debug('subscribe: mock message consumed', { pattern, queueName, routingKey: pattern, keys: Object.keys(payload || {}) });
      try {
        await handler(payload);
        log.debug('subscribe: mock handler completed', { pattern, queueName });
      } catch (err) {
        log.error('subscribe: mock handler error', { pattern, queueName, err });
      }
    });
    log.info('subscribe: bound mock in-memory listener', { pattern, queueName });
    return;
  }

  try {
    const q = await channel.assertQueue(queueName, { durable: true });
    await channel.bindQueue(q.queue, 'pharos', pattern);

    await channel.consume(q.queue, async (msg) => {
      if (msg) {
        const deliveryTag = msg.fields?.deliveryTag;
        const routingKey = msg.fields?.routingKey;
        log.debug('subscribe: message consumed', { pattern, queueName, routingKey, deliveryTag });
        try {
          const payload = JSON.parse(msg.content.toString());
          await handler(payload);
          channel.ack(msg);
          log.debug('subscribe: handler completed, message acked', { pattern, queueName, routingKey, deliveryTag });
        } catch (err) {
          log.error('subscribe: handler error, message nacked (no requeue)', { pattern, queueName, routingKey, deliveryTag, err });
          channel.nack(msg, false, false);
        }
      }
    });
    log.info('subscribe: subscribed queue to pattern', { queueName, pattern, exchange: 'pharos' });
  } catch (error) {
    log.error('subscribe: real subscription error, binding locally as secondary fallback', { pattern, queueName, err: error });
    // Bind locally as secondary fallback
    localEmitter.on(pattern, handler);
  }
}

export { connect as connectEventBus };
```

### `backend/src/events/handlers/importConfirmHandler.js`
```javascript
// Subscription glue for the bulk-import async confirm worker (Integration 3, WP5). Mirrors
// the shape of linkAuditHandler.js/linkResolver.js — this file owns nothing but the RabbitMQ
// wiring; all the actual work is import.service.js's processBatch(), which this handler calls
// on every `import.confirm.requested` message. The confirm HTTP endpoint (import.controller.js)
// publishes that event right after claimBatch() succeeds — this is the only place the message
// is consumed.
import * as eventBus from '../eventBus.js';
import { getLogger } from '../../utils/logger.js';
import { processBatch, sweepStaleConfirmedBatches } from '../../modules/import/import.service.js';

// STYLE ANCHOR match (logging-instrumentation-2026-07-22, HANDOFF.md §7) — mirrors
// linkAuditHandler.js/linkResolver.js exactly: getLogger('importConfirmHandler') bound once,
// log.info on subscription registration, log.debug on every message received, log.error/warn
// on every ack/nack-relevant decision.
const log = getLogger('importConfirmHandler');

export async function init() {
  log.info('init: registering event subscription', { pattern: 'import.confirm.requested' });

  await eventBus.subscribe('import.confirm.requested', 'import-confirm-queue', async (payload) => {
    const batchId = payload?.batch_id;
    log.debug('import.confirm.requested: received', { batchId });
    if (!batchId) {
      log.warn('import.confirm.requested: no batch_id on payload — dropping', { payload });
      return;
    }
    // processBatch owns its own top-level try/catch and always resolves normally (marking the
    // batch FAILED internally rather than throwing) — see import.service.js's own comment on
    // why: a thrown error here would nack-without-requeue (eventBus.js has no DLQ/retry) and
    // drop the message with no trace of what happened. This handler-level try/catch is a last-
    // resort backstop only, in case something outside processBatch's own try/catch throws
    // (e.g. a malformed payload) — not the expected path.
    try {
      await processBatch(batchId);
      log.debug('import.confirm.requested: processBatch returned (ack)', { batchId });
    } catch (err) {
      log.error('import.confirm.requested: unexpected error processing batch (backstop catch — processBatch should never throw)', { batchId, err });
    }
  });

  // Startup sweep (§4.6/G4) — catches batches left in CONFIRMED with no live message to
  // process them (e.g. a mock-mode process restart between publish and consume). Runs once at
  // boot, not on a timer; processBatch's own leading status guard makes any redelivery safe.
  log.debug('init: running startup sweep for stale CONFIRMED batches');
  try {
    const swept = await sweepStaleConfirmedBatches(eventBus.publish);
    if (swept > 0) {
      log.info('init: startup sweep re-published stale CONFIRMED batch(es)', { swept });
    } else {
      log.debug('init: startup sweep found nothing stale', { swept });
    }
  } catch (err) {
    log.error('init: startup sweep failed', { err });
  }
}
```

### `backend/src/events/handlers/linkAuditHandler.js`
```javascript
import * as eventBus from '../eventBus.js';
import db from '../../config/db.js';
import { v4 as uuidv4 } from 'uuid';
import { getLogger } from '../../utils/logger.js';

const log = getLogger('linkAuditHandler');

export async function init() {
  log.info('init: registering event subscription', { pattern: 'link.*' });

  await eventBus.subscribe('link.*', 'link-audit-queue', async (payload) => {
    const {
      link_id, link_type_code,
      source_record_id, target_record_id,
      created_by, deleted_by, action
    } = payload;
    log.debug('link.*: received', { linkId: link_id, linkTypeCode: link_type_code, sourceRecordId: source_record_id, targetRecordId: target_record_id, action });

    try {
      const actorId = created_by || deleted_by;
      if (!actorId) {
        log.warn('link.*: no actor id (created_by/deleted_by) on payload, skipping audit write', { linkId: link_id });
        return;
      }

      const actor = await db('users').where({ id: actorId }).first();
      const actionLabel = action || (deleted_by ? 'LINK_DELETED' : 'LINK_CREATED');
      const changedAt = new Date().toISOString();
      const linkMeta = JSON.stringify({ link_id, link_type_code });
      log.debug('link.*: resolved actor + action label', { linkId: link_id, actorId, actorRole: actor?.role || null, actionLabel });

      const entries = [];
      if (source_record_id) {
        entries.push({
          id: uuidv4(),
          table_name: 'record_links',
          record_id: source_record_id,
          action: actionLabel,
          changed_by_id: actorId,
          changed_by_role: actor?.role || 'UNKNOWN',
          changed_at: changedAt,
          new_value: JSON.stringify({ ...JSON.parse(linkMeta), other_record_id: target_record_id })
        });
      }
      if (target_record_id) {
        entries.push({
          id: uuidv4(),
          table_name: 'record_links',
          record_id: target_record_id,
          action: actionLabel,
          changed_by_id: actorId,
          changed_by_role: actor?.role || 'UNKNOWN',
          changed_at: changedAt,
          new_value: JSON.stringify({ ...JSON.parse(linkMeta), other_record_id: source_record_id })
        });
      }
      log.debug('link.*: built audit_logs entries', { linkId: link_id, entryCount: entries.length });

      if (entries.length > 0) {
        await db('audit_logs').insert(entries);
        log.info('link.*: wrote audit_logs rows', { linkId: link_id, actionLabel, entryCount: entries.length, sourceRecordId: source_record_id, targetRecordId: target_record_id });
      } else {
        log.debug('link.*: no source/target record id on payload, nothing written', { linkId: link_id });
      }
    } catch (err) {
      log.error('link.*: handling failed', { linkId: link_id, err });
    }
  });
}
```

### `backend/src/events/handlers/linkResolver.js`
```javascript
import * as eventBus from '../eventBus.js';
import db from '../../config/db.js';
import { v4 as uuidv4 } from 'uuid';
import { getLogger } from '../../utils/logger.js';

const log = getLogger('linkResolver');

// Async link resolution (ruling 23c, ENGINEERING_BASELINE.md P1.7): a record write never
// resolves cross-record links inside its own transaction. It stores the as-entered FIR
// reference (arrest_details.fir_no/fir_date, missing_details.fir_no/fir_date) and commits;
// this post-commit subscriber does exactly one thing — resolve (ps_id, fir_year, fir_no)
// against the fir_details business key and insert the resulting record_links row, once,
// idempotently (the UNIQUE (source, target, link_type) triple absorbs retries). Unresolved
// references stay provenance-only and are retried on the next record.updated event.

const RESOLVERS = {
  ARREST: { detailTable: 'arrest_details', linkTypeCode: 'CASE_ARREST' },
  MISSING: { detailTable: 'missing_details', linkTypeCode: 'CASE_MISSING' },
};

/**
 * CASE is the "one" side of CASE_ARREST/CASE_MISSING — it never has its own RESOLVERS entry
 * (that map is keyed by the "many" side's record_type). When a CASE is created or updated,
 * back-resolve any ARREST/MISSING records already sitting in the same PS with a matching
 * fir_no that aren't linked yet. This direction is necessary (not just symmetric tidiness)
 * because data-entry/import order is never guaranteed — an arrest or missing-person report
 * can be filed or bulk-imported before its case, or after; operators fill end-of-day
 * paperwork in whatever order it physically arrives (Integration 3, docs/new-db-integration/
 * 03-import.md C7). Same idempotent onConflict pattern as the forward direction below — no
 * pre-check for existing links, the unique constraint absorbs repeat attempts on every
 * record.updated for a busy CASE.
 */
async function backfillOrphansForCase(caseRecord, fir) {
  log.debug('backfillOrphansForCase: enter', { recordId: caseRecord.id, psId: caseRecord.ps_id, firNo: fir.fir_no, firYear: fir.fir_year ?? null });
  for (const [type, cfg] of Object.entries(RESOLVERS)) {
    const linkType = await db('link_type_registry').where({ code: cfg.linkTypeCode, is_active: true }).first();
    if (!linkType) {
      log.warn('backfillOrphansForCase: link_type_registry code not found — run npm run db:seed', { recordId: caseRecord.id, linkTypeCode: cfg.linkTypeCode });
      continue;
    }

    const candidates = await db(`${cfg.detailTable} as d`)
      .join('records as r', 'r.id', 'd.record_id')
      .where({ 'd.fir_no': fir.fir_no, 'r.ps_id': caseRecord.ps_id, 'r.record_type': type })
      .select('d.record_id', 'd.fir_date', 'r.created_by');
    log.debug('backfillOrphansForCase: found candidates', { recordId: caseRecord.id, targetType: type, firNo: fir.fir_no, candidateCount: candidates.length });

    for (const cand of candidates) {
      // Same fir_year-disjunct leniency as the forward direction (mirrored): only require
      // equality when BOTH sides carry a year. fir_details.fir_year is allocator-assigned
      // and NULL on every row today (allocator not built — see Deferrals), so this is a
      // no-op in practice until then, not dead code.
      if (fir.fir_year != null && cand.fir_date) {
        const candYear = new Date(cand.fir_date).getFullYear();
        if (candYear !== fir.fir_year) {
          log.debug('backfillOrphansForCase: skipped candidate — fir_year mismatch', { recordId: caseRecord.id, candidateRecordId: cand.record_id, firYear: fir.fir_year, candYear });
          continue;
        }
      }

      await db('record_links')
        .insert({
          id: uuidv4(), link_type_id: linkType.id,
          source_record_id: caseRecord.id, target_record_id: cand.record_id,
          metadata: JSON.stringify({ resolved_via: 'fir_no_backfill', fir_no: fir.fir_no }),
          created_by: cand.created_by,
        })
        .onConflict(['source_record_id', 'target_record_id', 'link_type_id'])
        .ignore();
      log.info('backfillOrphansForCase: attempted CASE-to-orphan link (onConflict ignore, may be pre-existing)', {
        sourceRecordId: caseRecord.id, targetRecordId: cand.record_id, linkTypeCode: cfg.linkTypeCode,
      });
    }
  }
  log.debug('backfillOrphansForCase: exit', { recordId: caseRecord.id, firNo: fir.fir_no });
}

async function resolveAndLink(recordId) {
  log.debug('resolveAndLink: enter', { recordId });
  const record = await db('records').where({ id: recordId }).first();
  if (!record) {
    log.warn('resolveAndLink: record not found, skipping', { recordId });
    return;
  }

  if (record.record_type === 'CASE') {
    log.debug('resolveAndLink: record is CASE, taking back-resolve branch', { recordId });
    const fir = await db('fir_details').where({ record_id: recordId }).first();
    if (!fir || !fir.fir_no) {
      log.debug('resolveAndLink: CASE has no fir_no yet, nothing to backfill', { recordId });
      return;
    }
    await backfillOrphansForCase(record, fir);
    return;
  }

  const cfg = RESOLVERS[record.record_type];
  if (!cfg) {
    log.debug('resolveAndLink: record_type has no resolver, skipping', { recordId, recordType: record.record_type });
    return;
  }

  const detail = await db(cfg.detailTable).where({ record_id: recordId }).first();
  if (!detail || !detail.fir_no) {
    log.debug('resolveAndLink: detail row missing fir_no, nothing to resolve', { recordId, recordType: record.record_type });
    return;
  }

  // `fir_details.fir_year` is allocator-assigned (ARCHITECTURE.md §6.2 FIR number
  // counter) — that allocator isn't built yet (deferred with the transfers module, per
  // this integration's handoff), so fir_year is NULL on every CASE record right now.
  // Resolving strictly on the full (ps_id, fir_year, fir_no) business key would never
  // match anything until the allocator lands. Scope by (ps_id, fir_no) — the only two
  // components actually populated today — and additionally require fir_year equality
  // ONLY when the CASE side has one set (a future-proofing no-op today, real disambiguation
  // once the allocator starts populating it).
  let caseFir = db('fir_details').where({ ps_id: record.ps_id, fir_no: detail.fir_no });
  const firYear = detail.fir_date ? new Date(detail.fir_date).getFullYear() : null;
  if (firYear) caseFir = caseFir.andWhere((b) => b.whereNull('fir_year').orWhere('fir_year', firYear));
  const match = await caseFir.first();
  if (!match) {
    log.debug('resolveAndLink: no CASE match yet', { recordId, recordType: record.record_type, firNo: detail.fir_no, psId: record.ps_id });
    return;
  }
  log.debug('resolveAndLink: matched CASE', { recordId, recordType: record.record_type, matchedRecordId: match.record_id, firNo: detail.fir_no });

  const linkType = await db('link_type_registry').where({ code: cfg.linkTypeCode, is_active: true }).first();
  if (!linkType) {
    log.warn('resolveAndLink: link_type_registry code not found — run npm run db:seed', { recordId, linkTypeCode: cfg.linkTypeCode });
    return;
  }

  await db('record_links')
    .insert({
      id: uuidv4(), link_type_id: linkType.id,
      source_record_id: match.record_id, target_record_id: recordId,
      metadata: JSON.stringify({ resolved_via: 'fir_no', fir_no: detail.fir_no }),
      created_by: record.created_by,
    })
    .onConflict(['source_record_id', 'target_record_id', 'link_type_id'])
    .ignore();
  log.info('resolveAndLink: attempted record-to-CASE link (onConflict ignore, may be pre-existing)', {
    sourceRecordId: match.record_id, targetRecordId: recordId, linkTypeCode: cfg.linkTypeCode,
  });
}

export async function init() {
  log.info('init: registering event subscriptions', { events: ['record.created', 'record.updated'] });

  await eventBus.subscribe('record.created', 'link-resolver-queue', async (payload) => {
    const recordId = payload.record_id;
    log.debug('record.created: received', { recordId });
    try {
      if (recordId) await resolveAndLink(recordId);
      else log.warn('record.created: payload missing record_id, skipping', {});
    } catch (err) {
      log.error('record.created: handling failed', { recordId, err });
    }
  });
  await eventBus.subscribe('record.updated', 'link-resolver-queue-updated', async (payload) => {
    const recordId = payload.record_id;
    log.debug('record.updated: received', { recordId });
    try {
      if (recordId) await resolveAndLink(recordId);
      else log.warn('record.updated: payload missing record_id, skipping', {});
    } catch (err) {
      log.error('record.updated: handling failed', { recordId, err });
    }
  });
}
```

### `backend/src/events/handlers/notifyHandler.js`
```javascript
import * as eventBus from '../eventBus.js';
import db from '../../config/db.js';
import { v4 as uuidv4 } from 'uuid';
import { pushToUser } from '../../modules/notifications/sse.js';
import { getLogger } from '../../utils/logger.js';

const log = getLogger('notifyHandler');

/**
 * Helper: insert a notification row and push it instantly via SSE.
 * New-schema shape (2026-07): { user_id, type, params, record_id } — `type` is
 * an i18n key rendered at read time, `params` carries the interpolation values.
 */
async function createNotification(notif) {
  const row = {
    id: uuidv4(),
    ...notif,
    is_read: false,
    created_at: new Date().toISOString(),
  };
  await db('notifications').insert(row);
  log.debug('createNotification: wrote notifications row', { notificationId: row.id, userId: row.user_id, type: row.type, recordId: row.record_id });
  // Push live to any open browser tabs for this user
  pushToUser(row.user_id, 'notification', row);
  log.debug('createNotification: pushed via SSE', { notificationId: row.id, userId: row.user_id });
  return row;
}

export async function init() {
  log.info('init: registering event subscriptions', { events: ['record.submitted', 'record.approved', 'record.sent_back', 'compilation.submitted'] });

  // ── 1. HC submits a record → notify SHOs at that station ──────────────
  await eventBus.subscribe('record.submitted', 'notifications-submit-queue', async (payload) => {
    const { record_id, performed_by } = payload;
    log.debug('record.submitted: received', { recordId: record_id, performedBy: performed_by });
    try {
      const record = await db('records').where({ id: record_id }).first();
      if (!record) {
        log.warn('record.submitted: record not found, skipping notification', { recordId: record_id });
        return;
      }

      const shos = await db('users').where({ role: 'SHO', ps_id: record.ps_id, is_active: true });
      log.debug('record.submitted: resolved SHOs to notify', { recordId: record_id, psId: record.ps_id, shoCount: shos.length });
      for (const sho of shos) {
        await createNotification({
          type: 'RECORD_SUBMITTED',
          params: { record_type: record.record_type },
          user_id: sho.id,
          record_id,
        });
      }
      log.info('record.submitted: notified SHOs', { recordId: record_id, notifiedCount: shos.length });
    } catch (err) {
      log.error('record.submitted: notification handling failed', { recordId: record_id, err });
    }
  });

  // ── 2. SHO / ACP approves a record → notify the HC who created it ─────
  await eventBus.subscribe('record.approved', 'notifications-approve-queue', async (payload) => {
    const { record_id, performed_by, comment } = payload;
    log.debug('record.approved: received', { recordId: record_id, performedBy: performed_by });
    try {
      const record = await db('records').where({ id: record_id }).first();
      if (!record) {
        log.warn('record.approved: record not found, skipping notification', { recordId: record_id });
        return;
      }

      await createNotification({
        type: 'RECORD_APPROVED',
        params: { record_type: record.record_type },
        user_id: record.created_by,
        record_id,
      });
      log.info('record.approved: notified creator', { recordId: record_id, userId: record.created_by });
    } catch (err) {
      log.error('record.approved: notification handling failed', { recordId: record_id, err });
    }
  });

  // ── 3. SHO sends a record back → notify the HC who created it ─────────
  await eventBus.subscribe('record.sent_back', 'notifications-sendback-queue', async (payload) => {
    const { record_id, performed_by, comment } = payload;
    log.debug('record.sent_back: received', { recordId: record_id, performedBy: performed_by, hasComment: !!comment });
    try {
      const record = await db('records').where({ id: record_id }).first();
      if (!record) {
        log.warn('record.sent_back: record not found, skipping notification', { recordId: record_id });
        return;
      }

      await createNotification({
        type: 'RECORD_SENT_BACK',
        params: { record_type: record.record_type, comment: comment || null },
        user_id: record.created_by,
        record_id,
      });
      log.info('record.sent_back: notified creator', { recordId: record_id, userId: record.created_by });
    } catch (err) {
      log.error('record.sent_back: notification handling failed', { recordId: record_id, err });
    }
  });

  // ── 4. District submits compilation → notify HQ officers ──────────────
  await eventBus.subscribe('compilation.submitted', 'notifications-compilation-queue', async (payload) => {
    const { compilation_id, district_id, period, submitted_by } = payload;
    log.debug('compilation.submitted: received', { compilationId: compilation_id, districtId: district_id, period, submittedBy: submitted_by });
    try {
      const hqUsers = await db('users')
        .whereIn('role', ['HQ_ANALYST', 'HQ_ADMIN'])
        .where({ is_active: true });
      log.debug('compilation.submitted: resolved HQ users to notify', { compilationId: compilation_id, hqUserCount: hqUsers.length });

      for (const hqUser of hqUsers) {
        await createNotification({
          type: 'COMPILATION_SUBMITTED',
          // record_id FKs to records — a compilation id does NOT belong there
          params: { period, compilation_id: compilation_id || null },
          user_id: hqUser.id,
          record_id: null,
        });
      }
      log.info('compilation.submitted: notified HQ users', { compilationId: compilation_id, notifiedCount: hqUsers.length });
    } catch (err) {
      log.error('compilation.submitted: notification handling failed', { compilationId: compilation_id, err });
    }
  });
}
```

### `backend/src/events/handlers/reportJobHandler.js`
```javascript
import * as eventBus from '../eventBus.js';
import { logger } from '../../utils/logger.js';
import { generateReportInternal } from '../../modules/reports/reports.controller.js';
import db from '../../config/db.js';
import path from 'path';

export async function init() {
  await eventBus.subscribe('report.generate.requested', 'report-generation-queue', async (payload) => {
    const jobId = payload?.job_id;
    if (!jobId) {
      logger.warn('[ReportJobHandler] report.generate.requested with no job_id — dropping');
      return;
    }

    try {
      const job = await db('report_jobs').where({ id: jobId }).first();
      if (!job) {
        logger.warn(`[ReportJobHandler] Job ${jobId} not found in database`);
        return;
      }

      await db('report_jobs').where({ id: jobId }).update({ status: 'PROCESSING', updated_at: db.fn.now() });

      const filters = typeof job.filters === 'string' ? JSON.parse(job.filters) : (job.filters || {});
      const fileName = `report_${job.template_id || 'phq'}_${Date.now()}.${(job.format || 'excel').toLowerCase() === 'pdf' ? 'pdf' : 'xlsx'}`;
      const filePath = path.resolve('uploads/reports', fileName);

      await generateReportInternal(jobId, job.template_id, filters, job.format || 'EXCEL', filePath, job.user_id);

      await db('report_jobs').where({ id: jobId }).update({
        status: 'READY',
        file_path: filePath,
        file_name: fileName,
        updated_at: db.fn.now()
      });
      logger.info(`[ReportJobHandler] Report job ${jobId} completed: ${fileName}`);
    } catch (err) {
      logger.error(`[ReportJobHandler] Error processing report job ${jobId}: ${err.message}`);
      await db('report_jobs').where({ id: jobId }).update({ status: 'FAILED', updated_at: db.fn.now() });
    }
  });
}
```
