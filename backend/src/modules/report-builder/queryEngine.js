/**
 * PHAROS Report Builder — Query Engine
 * =====================================
 * Translates a validated, whitelisted filter spec into Knex queries.
 *
 * Support for Phase 1.5 Reporting Data Warehouse:
 * - Automatically checks process.env.WAREHOUSE_QUERY_MODE / resolves query mode.
 * - If WAREHOUSE: queries the relationally normalized rpt.* tables (high performance).
 * - Fallback to LIVE: queries JSONB records table (original logic).
 */

import db from '../../config/db.js';
import {
  ALLOWED_TABLES,
  ALLOWED_JOINS,
  REPORTABLE_FIELDS,
  getFieldDef,
  filterFieldsForRole,
} from './reportableFields.config.js';
import { resolveQueryMode, wh, whTable } from '../warehouse/warehouse.db.js';
import { toISO } from '../../utils/dateFormat.js';

// Map logical table names to warehouse fact tables
const FACT_TABLE_MAP = {
  CASE: 'fact_fir',
  ARREST: 'fact_arrest',
  PCR_CALL: 'fact_pcr',
  MISSING: 'fact_missing',
  UIDB: 'fact_uidb'
};

// ─────────────────────────────────────────────────────────────────────────────
// Helpers
// ─────────────────────────────────────────────────────────────────────────────

const isPostgres = () => {
  const client = db.client.config.client;
  return client === 'postgresql' || client === 'pg';
};

/**
 * Build the SQL expression to read a field from records.data JSONB.
 */
function jsonFieldExpr(fieldKey) {
  if (isPostgres()) {
    return `CAST(records.data AS jsonb)->>'${fieldKey}'`;
  }
  return `json_extract(records.data, '$.${fieldKey}')`;
}

/**
 * records.data stores date fields as literal dd/mm/yyyy text. Range/relative
 * -date operators need a real comparable date, not a lexicographic string
 * compare, so parse the extracted text before comparing.
 */
function jsonDateFieldExpr(fieldKey) {
  if (isPostgres()) {
    return `to_date(NULLIF(CAST(records.data AS jsonb)->>'${fieldKey}', ''), 'DD/MM/YYYY')`;
  }
  const extract = `json_extract(records.data, '$.${fieldKey}')`;
  return `(substr(${extract}, 7, 4) || '-' || substr(${extract}, 4, 2) || '-' || substr(${extract}, 1, 2))`;
}

/**
 * Resolve a field to its SQL expression or column reference (for LIVE queries).
 */
function resolveFieldExpr(fieldDef) {
  if (fieldDef.is_db_col) {
    return fieldDef.db_col; // e.g. 'records.record_date'
  }
  if (fieldDef.data_type === 'date') {
    return jsonDateFieldExpr(fieldDef.key);
  }
  return jsonFieldExpr(fieldDef.key);
}

// Operators whose value is compared against a date field and needs
// converting from dd/mm/yyyy (frontend) to ISO before hitting the DB.
const DATE_VALUE_OPS = new Set(['BETWEEN', 'BEFORE', 'AFTER']);
const toISOMaybe = (val) => (Array.isArray(val) ? val.map((v) => toISO(v) || v) : (toISO(val) || val));

// ─────────────────────────────────────────────────────────────────────────────
// Condition applicator
// ─────────────────────────────────────────────────────────────────────────────

function applyCondition(builder, expr, op, value, raw = false) {
  const colRef = raw ? db.raw(expr) : expr;
  switch (op.toUpperCase()) {
    case 'EQ':          builder.where(colRef, '=', value); break;
    case 'NOT_EQ':      builder.where(colRef, '!=', value); break;
    case 'GT':          builder.where(colRef, '>', value); break;
    case 'GTE':         builder.where(colRef, '>=', value); break;
    case 'LT':          builder.where(colRef, '<', value); break;
    case 'LTE':         builder.where(colRef, '<=', value); break;
    case 'CONTAINS':    builder.where(colRef, 'LIKE', `%${value}%`); break;
    case 'STARTS_WITH': builder.where(colRef, 'LIKE', `${value}%`); break;
    case 'ENDS_WITH':   builder.where(colRef, 'LIKE', `%${value}`); break;
    case 'IS_EMPTY':    builder.where(function() { this.whereNull(colRef).orWhere(colRef, '=', ''); }); break;
    case 'IS_NOT_EMPTY':builder.where(colRef, '!=', '').whereNotNull(colRef); break;
    case 'IN':          builder.whereIn(colRef, Array.isArray(value) ? value : [value]); break;
    case 'NOT_IN':      builder.whereNotIn(colRef, Array.isArray(value) ? value : [value]); break;
    case 'BETWEEN':
      if (Array.isArray(value) && value.length === 2) { builder.whereBetween(colRef, value); }
      break;
    case 'BEFORE':      builder.where(colRef, '<', value); break;
    case 'AFTER':       builder.where(colRef, '>', value); break;
    case 'IS_TRUE':     builder.where(function() { this.where(colRef, '=', true).orWhere(colRef, '=', 1).orWhere(colRef, '=', 'true').orWhere(colRef, '=', '1'); }); break;
    case 'IS_FALSE':    builder.where(function() { this.where(colRef, '=', false).orWhere(colRef, '=', 0).orWhere(colRef, '=', 'false').orWhere(colRef, '=', '0'); }); break;
    case 'LAST_N_DAYS': {
      const days = parseInt(value, 10) || 0;
      const cutoff = new Date();
      cutoff.setDate(cutoff.getDate() - days);
      builder.where(colRef, '>=', cutoff.toISOString().split('T')[0]);
      break;
    }
    case 'THIS_WEEK': {
      const now = new Date();
      const first = new Date(now.setDate(now.getDate() - now.getDay())).toISOString().split('T')[0];
      const last  = new Date(new Date().setDate(new Date().getDate() - new Date().getDay() + 6)).toISOString().split('T')[0];
      builder.whereBetween(colRef, [first, last]);
      break;
    }
    case 'THIS_MONTH': {
      const now = new Date();
      const first = new Date(now.getFullYear(), now.getMonth(), 1).toISOString().split('T')[0];
      const last  = new Date(now.getFullYear(), now.getMonth() + 1, 0).toISOString().split('T')[0];
      builder.whereBetween(colRef, [first, last]);
      break;
    }
    case 'THIS_YEAR': {
      const now = new Date();
      builder.whereBetween(colRef, [
        new Date(now.getFullYear(), 0, 1).toISOString().split('T')[0],
        new Date(now.getFullYear(), 11, 31).toISOString().split('T')[0]
      ]);
      break;
    }
    default:
      builder.where(colRef, '=', value);
  }
}

/**
 * Recursively apply a filter spec tree (AND/OR groups) to a Knex builder (LIVE path).
 */
function applyFilterSpec(builder, spec, primaryTable, validatedFieldMap) {
  if (!spec || !Array.isArray(spec.conditions) || spec.conditions.length === 0) return;
  const isOr = (spec.logic || 'AND').toUpperCase() === 'OR';

  builder.where(function () {
    const inner = this;
    spec.conditions.forEach((cond, idx) => {
      const applyFn = isOr && idx > 0 ? 'orWhere' : 'where';
      if (cond.logic && Array.isArray(cond.conditions)) {
        inner[applyFn](function () {
          applyFilterSpec(this, cond, primaryTable, validatedFieldMap);
        });
      } else {
        const { field, table: condTable, operator, value } = cond;
        const tableKey = condTable || primaryTable;
        const mapKey = `${tableKey}.${field}`;
        const fieldDef = validatedFieldMap.get(mapKey);
        if (!fieldDef) return;

        const expr = resolveFieldExpr(fieldDef);
        const isRaw = !fieldDef.is_db_col;
        const v = fieldDef.data_type === 'date' && DATE_VALUE_OPS.has(String(operator).toUpperCase())
          ? toISOMaybe(value)
          : value;

        inner[applyFn](function () {
          applyCondition(this, expr, operator, v, isRaw);
        });
      }
    });
  });
}

/**
 * Recursively apply a filter spec tree (AND/OR groups) to a Knex builder (WAREHOUSE path).
 */
function applyFilterSpecWarehouse(builder, spec, primaryTable, validatedFieldMap, factTableAlias) {
  if (!spec || !Array.isArray(spec.conditions) || spec.conditions.length === 0) return;
  const isOr = (spec.logic || 'AND').toUpperCase() === 'OR';

  builder.where(function () {
    const inner = this;
    spec.conditions.forEach((cond, idx) => {
      const applyFn = isOr && idx > 0 ? 'orWhere' : 'where';
      if (cond.logic && Array.isArray(cond.conditions)) {
        inner[applyFn](function () {
          applyFilterSpecWarehouse(this, cond, primaryTable, validatedFieldMap, factTableAlias);
        });
      } else {
        const { field, table: condTable, operator, value } = cond;
        const tableKey = condTable || primaryTable;
        const mapKey = `${tableKey}.${field}`;
        const fieldDef = validatedFieldMap.get(mapKey);
        if (!fieldDef || !fieldDef.wh_col) return;

        // In warehouse, all query columns are real columns (no JSON extracts needed)
        const expr = `${factTableAlias}.${fieldDef.wh_col}`;
        const v = fieldDef.data_type === 'date' && DATE_VALUE_OPS.has(String(operator).toUpperCase())
          ? toISOMaybe(value)
          : value;
        inner[applyFn](function () {
          applyCondition(this, expr, operator, v, false);
        });
      }
    });
  });
}

/**
 * The warehouse fact tables only have typed columns for fields that existed
 * when they were built (every entry with a `wh_col`). Newly added granular
 * group fields (address sub-fields, physical description, etc.) intentionally
 * have no `wh_col` yet — selecting them in WAREHOUSE mode would silently
 * drop them from the result. So: if ANY requested/filtered field lacks a
 * `wh_col`, force this request onto the LIVE (JSONB) path instead, where
 * every field resolves correctly regardless of warehouse schema coverage.
 */
async function resolveEffectiveQueryMode(validatedFieldMap) {
  const hasJsonbOnlyField = Array.from(validatedFieldMap.values())
    .some(def => !def.is_db_col && !def.wh_col);
  if (hasJsonbOnlyField) return 'LIVE';
  return resolveQueryMode();
}

// ─────────────────────────────────────────────────────────────────────────────
// Validation
// ─────────────────────────────────────────────────────────────────────────────

export function validateQuerySpec(spec, userRole) {
  const errors = [];
  const validatedFieldMap = new Map();
  const { table, join, fields, filters } = spec;

  // 1. Validate primary table
  if (!table || !ALLOWED_TABLES.includes(table)) {
    errors.push(`Invalid or missing table: "${table}". Allowed: ${ALLOWED_TABLES.join(', ')}`);
    return { ok: false, errors, validatedFieldMap };
  }

  // 2. Validate join (if any)
  let joinDef = null;
  if (join) {
    const joinKey = [table, join].sort().join('+') in ALLOWED_JOINS
      ? [table, join].sort().join('+')
      : `${table}+${join}`;
    joinDef = ALLOWED_JOINS[joinKey] || null;
    if (!joinDef) {
      errors.push(`Join "${table}+${join}" is not allowed. Allowed joins: ${Object.keys(ALLOWED_JOINS).join(', ')}`);
    }
  }

  // 3. Validate selected fields
  const tables = join && joinDef ? joinDef.tables : [table];
  const allTableFields = tables.flatMap(t => {
    const roleFiltered = filterFieldsForRole(REPORTABLE_FIELDS[t] || [], userRole);
    return roleFiltered.map(f => ({ ...f, table: t }));
  });
  const systemFields = filterFieldsForRole(REPORTABLE_FIELDS._SYSTEM, userRole);

  const allAccessibleFields = new Map();
  for (const f of systemFields) {
    for (const t of tables) {
      allAccessibleFields.set(`${t}.${f.key}`, { ...f, table: t });
    }
  }
  for (const f of allTableFields) {
    allAccessibleFields.set(`${f.table}.${f.key}`, f);
  }

  if (!Array.isArray(fields) || fields.length === 0) {
    errors.push('At least one field must be selected');
  } else {
    for (const fieldRef of fields) {
      const { field, table: fieldTable } = typeof fieldRef === 'string'
        ? { field: fieldRef, table }
        : fieldRef;
      const mapKey = `${fieldTable || table}.${field}`;
      const def = allAccessibleFields.get(mapKey);
      if (!def) {
        errors.push(`Field "${mapKey}" is not reportable or not accessible for your role`);
      } else {
        validatedFieldMap.set(mapKey, def);
      }
    }
  }

  // 4. Validate filter conditions
  if (filters && filters.conditions) {
    validateFilterNode(filters, allAccessibleFields, errors, validatedFieldMap, table);
  }

  return { ok: errors.length === 0, errors, validatedFieldMap, joinDef };
}

function validateFilterNode(node, allAccessibleFields, errors, validatedFieldMap, defaultTable) {
  if (!node || !Array.isArray(node.conditions)) return;
  for (const cond of node.conditions) {
    if (cond.logic && Array.isArray(cond.conditions)) {
      validateFilterNode(cond, allAccessibleFields, errors, validatedFieldMap, defaultTable);
    } else {
      const { field, table: condTable, operator, value } = cond;
      if (!field) { errors.push('Filter condition missing "field"'); continue; }
      if (!operator) { errors.push(`Filter for field "${field}" missing "operator"`); continue; }

      const mapKey = `${condTable || defaultTable}.${field}`;
      const def = allAccessibleFields.get(mapKey);
      if (!def) {
        errors.push(`Filter field "${mapKey}" is not allowed`);
        continue;
      }

      if (!def.operators.includes(operator.toUpperCase())) {
        errors.push(`Operator "${operator}" is not valid for field "${mapKey}". Allowed: ${def.operators.join(', ')}`);
        continue;
      }

      validatedFieldMap.set(mapKey, def);
    }
  }
}

// ─────────────────────────────────────────────────────────────────────────────
// Query builders
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Build and execute a single-table paginated query.
 */
export async function executeSingleTableQuery(spec, jurisdictionQuery, userRole) {
  const { table, fields, filters, sort, page = 1, pageSize = 50 } = spec;
  const limit = Math.min(parseInt(pageSize, 10) || 50, 500);
  const offset = (Math.max(parseInt(page, 10) || 1, 1) - 1) * limit;

  const { ok, errors, validatedFieldMap } = validateQuerySpec(spec, userRole);
  if (!ok) throw new Error(`Query validation failed: ${errors.join('; ')}`);

  const queryMode = await resolveEffectiveQueryMode(validatedFieldMap);

  if (queryMode === 'WAREHOUSE') {
    const factTable = FACT_TABLE_MAP[table];
    if (!factTable) throw new Error(`Warehouse table mapping not found for record type: ${table}`);

    // Build base warehouse query
    const selectCols = [
      `${factTable}.source_record_id as _id`,
      `${factTable}.record_date as _record_date`,
      `${factTable}.workflow_status as _status`,
      `${factTable}.source_updated_at as _created_at`,
      'ps.name_en as _ps_name',
      'dist.name_en as _district_name'
    ];

    // Select only requested fact columns
    for (const fieldRef of fields) {
      const { field, table: fieldTable } = typeof fieldRef === 'string'
        ? { field: fieldRef, table }
        : fieldRef;
      const mapKey = `${fieldTable || table}.${field}`;
      const def = validatedFieldMap.get(mapKey);
      if (def && def.wh_col && !field.startsWith('_')) {
        selectCols.push(`${factTable}.${def.wh_col} as ${field}`);
      }
    }

    let query = db(`${whTable(factTable)} as ${factTable}`)
      .select(selectCols)
      .leftJoin('hierarchy_nodes as ps', `${factTable}.ps_id`, 'ps.id')
      .leftJoin('hierarchy_nodes as dist', `${factTable}.district_id`, 'dist.id');

    // Scope jurisdiction
    if (jurisdictionQuery.ps_id) query = query.where(`${factTable}.ps_id`, jurisdictionQuery.ps_id);
    if (jurisdictionQuery.district_id) query = query.where(`${factTable}.district_id`, jurisdictionQuery.district_id);
    if (jurisdictionQuery.sub_div_id) query = query.where(`${factTable}.sub_div_id`, jurisdictionQuery.sub_div_id);

    // Apply warehouse filters
    if (filters && filters.conditions && filters.conditions.length > 0) {
      query = query.where(function () {
        applyFilterSpecWarehouse(this, filters, table, validatedFieldMap, factTable);
      });
    }

    // Apply sort
    if (sort && sort.field) {
      const sortDef = validatedFieldMap.get(`${table}.${sort.field}`) ||
                      validatedFieldMap.get(`_SYSTEM.${sort.field}`);
      if (sortDef && sortDef.wh_col) {
        const dir = (sort.dir || 'asc').toLowerCase() === 'desc' ? 'desc' : 'asc';
        query = query.orderBy(`${factTable}.${sortDef.wh_col}`, dir);
      }
    } else {
      query = query.orderBy(`${factTable}.source_updated_at`, 'desc');
    }

    const countQuery = query.clone().clearSelect().clearOrder().count(`${factTable}.sk as count`).first();
    const [countRow, rows] = await Promise.all([
      countQuery,
      query.limit(limit).offset(offset)
    ]);

    const total = parseInt(countRow?.count || 0, 10);
    return { rows, total, page: parseInt(page, 10) || 1, pageSize: limit };

  } else {
    // FALLBACK: Query live operational JSONB records table
    let query = db('records')
      .select('records.id', 'records.record_type', 'records.record_date',
              'records.current_status', 'records.created_at',
              'ps.name_en as ps_name', 'dist.name_en as district_name')
      .leftJoin('hierarchy_nodes as ps', 'records.ps_id', 'ps.id')
      .leftJoin('hierarchy_nodes as dist', 'records.district_id', 'dist.id')
      .where('records.record_type', table);

    if (jurisdictionQuery.ps_id) query = query.where('records.ps_id', jurisdictionQuery.ps_id);
    if (jurisdictionQuery.district_id) query = query.where('records.district_id', jurisdictionQuery.district_id);
    if (jurisdictionQuery.sub_div_id) query = query.where('records.sub_div_id', jurisdictionQuery.sub_div_id);

    query = query.select('records.data');

    if (filters && filters.conditions && filters.conditions.length > 0) {
      query = query.where(function () {
        applyFilterSpec(this, filters, table, validatedFieldMap);
      });
    }

    if (sort && sort.field) {
      const sortDef = validatedFieldMap.get(`${table}.${sort.field}`) ||
                      validatedFieldMap.get(`_SYSTEM.${sort.field}`);
      if (sortDef) {
        const sortExpr = resolveFieldExpr(sortDef);
        const dir = (sort.dir || 'asc').toLowerCase() === 'desc' ? 'desc' : 'asc';
        if (sortDef.is_db_col) {
          query = query.orderBy(sortDef.db_col, dir);
        } else {
          query = query.orderByRaw(`${sortExpr} ${dir}`);
        }
      }
    } else {
      query = query.orderBy('records.created_at', 'desc');
    }

    const countQuery = query.clone().clearSelect().clearOrder().count('records.id as count').first();
    const [countRow, rows] = await Promise.all([
      countQuery,
      query.limit(limit).offset(offset)
    ]);

    const total = parseInt(countRow?.count || 0, 10);

    const selectedDataFields = fields
      .filter(f => {
        const ref = typeof f === 'string' ? { field: f, table } : f;
        return (ref.table || table) === table;
      })
      .map(f => typeof f === 'string' ? f : f.field);

    const projected = rows.map(row => {
      const rawData = typeof row.data === 'string' ? JSON.parse(row.data || '{}') : (row.data || {});
      const projected = {
        _id: row.id,
        _record_type: row.record_type,
        _record_date: row.record_date,
        _status: row.current_status,
        _created_at: row.created_at,
        _ps_name: row.ps_name,
        _district_name: row.district_name,
      };
      for (const fKey of selectedDataFields) {
        if (!fKey.startsWith('_')) {
          projected[fKey] = rawData[fKey] ?? null;
        }
      }
      return projected;
    });

    return { rows: projected, total, page: parseInt(page, 10) || 1, pageSize: limit };
  }
}

/**
 * Build and execute a joined query (CASE+ARREST or CASE+MISSING).
 */
export async function executeJoinedQuery(spec, jurisdictionQuery, userRole) {
  const { table, join, fields, filters, sort, page = 1, pageSize = 50 } = spec;
  const limit = Math.min(parseInt(pageSize, 10) || 50, 500);
  const offset = (Math.max(parseInt(page, 10) || 1, 1) - 1) * limit;

  const { ok, errors, validatedFieldMap, joinDef } = validateQuerySpec(spec, userRole);
  if (!ok) throw new Error(`Query validation failed: ${errors.join('; ')}`);
  if (!joinDef) throw new Error(`Join ${table}+${join} is not configured`);

  const { join_on } = joinDef;
  const leftTable  = join_on.left.table;
  const rightTable = join_on.right.table;

  const queryMode = await resolveEffectiveQueryMode(validatedFieldMap);

  if (queryMode === 'WAREHOUSE') {
    // Relational schema query: LEFT Fact JOIN Bridge JOIN RIGHT Fact
    const leftFact = FACT_TABLE_MAP[leftTable];
    const rightFact = FACT_TABLE_MAP[rightTable];
    const bridgeTable = leftTable === 'CASE' && rightTable === 'ARREST'
      ? 'bridge_fir_arrest'
      : 'bridge_fir_missing';

    const rightFkField = rightTable === 'ARREST' ? 'arrest_sk' : 'missing_sk';

    const selectCols = [
      `L.source_record_id as _left_id`,
      `L.record_date as _left_record_date`,
      `L.workflow_status as _left_status`,
      `ps.name_en as _ps_name`,
      `dist.name_en as _district_name`,
      `R.source_record_id as _right_id`,
      `R.record_date as _right_record_date`,
      `R.workflow_status as _right_status`
    ];

    const leftFields  = fields.filter(f => (typeof f === 'string' ? { field: f, table: leftTable } : f).table === leftTable).map(f => typeof f === 'string' ? f : f.field);
    const rightFields = fields.filter(f => (typeof f === 'string' ? { field: f, table: rightTable } : f).table === rightTable).map(f => typeof f === 'string' ? f : f.field);

    for (const fKey of leftFields) {
      const def = validatedFieldMap.get(`${leftTable}.${fKey}`);
      if (def && def.wh_col && !fKey.startsWith('_')) {
        selectCols.push(`L.${def.wh_col} as ${leftTable}__${fKey}`);
      }
    }
    for (const fKey of rightFields) {
      const def = validatedFieldMap.get(`${rightTable}.${fKey}`);
      if (def && def.wh_col && !fKey.startsWith('_')) {
        selectCols.push(`R.${def.wh_col} as ${rightTable}__${fKey}`);
      }
    }

    let query = db(whTable(leftFact) + ' as L')
      .select(selectCols)
      .leftJoin(whTable(bridgeTable) + ' as B', 'L.sk', 'B.fir_sk')
      .leftJoin(whTable(rightFact) + ' as R', `B.${rightFkField}`, 'R.sk')
      .leftJoin('hierarchy_nodes as ps', 'L.ps_id', 'ps.id')
      .leftJoin('hierarchy_nodes as dist', 'L.district_id', 'dist.id');

    // Scope jurisdiction (always on left table)
    if (jurisdictionQuery.ps_id) query = query.where('L.ps_id', jurisdictionQuery.ps_id);
    if (jurisdictionQuery.district_id) query = query.where('L.district_id', jurisdictionQuery.district_id);
    if (jurisdictionQuery.sub_div_id) query = query.where('L.sub_div_id', jurisdictionQuery.sub_div_id);

    // Apply conditions
    const leftFilters = { logic: 'AND', conditions: [] };
    const rightFilters = { logic: 'AND', conditions: [] };
    if (filters && filters.conditions) {
      for (const cond of (filters.conditions || [])) {
        const condTable = cond.table || leftTable;
        if (condTable === leftTable) leftFilters.conditions.push(cond);
        else if (condTable === rightTable) rightFilters.conditions.push(cond);
      }
    }

    if (leftFilters.conditions.length > 0) {
      query = query.where(function () {
        applyFilterSpecWarehouse(this, leftFilters, leftTable, validatedFieldMap, 'L');
      });
    }
    if (rightFilters.conditions.length > 0) {
      query = query.where(function () {
        applyFilterSpecWarehouse(this, rightFilters, rightTable, validatedFieldMap, 'R');
      });
    }

    // Apply sort
    if (sort && sort.field) {
      const sortTable = sort.table || leftTable;
      const sortDef = validatedFieldMap.get(`${sortTable}.${sort.field}`);
      if (sortDef && sortDef.wh_col) {
        const dir = (sort.dir || 'asc').toLowerCase() === 'desc' ? 'desc' : 'asc';
        const alias = sortTable === leftTable ? 'L' : 'R';
        query = query.orderBy(`${alias}.${sortDef.wh_col}`, dir);
      }
    } else {
      query = query.orderBy('L.source_updated_at', 'desc');
    }

    const countQuery = query.clone().clearSelect().clearOrder().count('L.sk as count').first();
    const [countRow, rows] = await Promise.all([
      countQuery,
      query.limit(limit).offset(offset)
    ]);

    const total = parseInt(countRow?.count || 0, 10);
    return { rows, total, page: parseInt(page, 10) || 1, pageSize: limit };

  } else {
    // FALLBACK: Query live operational JSONB records in-memory join
    const leftField  = join_on.left.field;
    const rightField = join_on.right.field;

    let leftQ = db('records as L')
      .select(
        'L.id as L_id', 'L.record_date as L_record_date',
        'L.current_status as L_status', 'L.ps_id as L_ps_id',
        'L.district_id as L_district_id',
        'L.data as L_data',
        'ps.name_en as ps_name', 'dist.name_en as district_name'
      )
      .leftJoin('hierarchy_nodes as ps', 'L.ps_id', 'ps.id')
      .leftJoin('hierarchy_nodes as dist', 'L.district_id', 'dist.id')
      .where('L.record_type', leftTable);

    let rightQ = db('records as R')
      .select('R.id as R_id', 'R.record_date as R_record_date', 'R.current_status as R_status', 'R.data as R_data')
      .where('R.record_type', rightTable);

    if (jurisdictionQuery.ps_id) leftQ = leftQ.where('L.ps_id', jurisdictionQuery.ps_id);
    if (jurisdictionQuery.district_id) leftQ = leftQ.where('L.district_id', jurisdictionQuery.district_id);
    if (jurisdictionQuery.sub_div_id) leftQ = leftQ.where('L.sub_div_id', jurisdictionQuery.sub_div_id);

    const leftFilters = { logic: 'AND', conditions: [] };
    const rightFilters = { logic: 'AND', conditions: [] };
    if (filters && filters.conditions) {
      for (const cond of (filters.conditions || [])) {
        const condTable = cond.table || leftTable;
        if (condTable === leftTable) leftFilters.conditions.push(cond);
        else if (condTable === rightTable) rightFilters.conditions.push(cond);
      }
    }

    if (leftFilters.conditions.length > 0) {
      leftQ = leftQ.where(function () {
        applyFilterSpec(this, leftFilters, leftTable, validatedFieldMap);
      });
    }

    const [leftRows, rightRows] = await Promise.all([leftQ, rightQ]);

    const rightMap = new Map();
    for (const rRow of rightRows) {
      const rData = typeof rRow.R_data === 'string' ? JSON.parse(rRow.R_data || '{}') : (rRow.R_data || {});
      const keyVal = rData[rightField];
      if (keyVal) {
        if (!rightMap.has(keyVal)) rightMap.set(keyVal, []);
        rightMap.get(keyVal).push({ ...rRow, R_data: rData });
      }
    }

    const joinedRows = [];
    for (const lRow of leftRows) {
      const lData = typeof lRow.L_data === 'string' ? JSON.parse(lRow.L_data || '{}') : (lRow.L_data || {});
      const keyVal = lData[leftField];
      const matching = keyVal ? (rightMap.get(keyVal) || []) : [];

      if (matching.length === 0) {
        joinedRows.push({ left: { ...lRow, L_data: lData }, right: null });
      } else {
        for (const rRow of matching) {
          joinedRows.push({ left: { ...lRow, L_data: lData }, right: rRow });
        }
      }
    }

    const total = joinedRows.length;
    const paged = joinedRows.slice(offset, offset + limit);

    const leftFields  = fields.filter(f => (typeof f === 'string' ? { field: f, table: leftTable } : f).table === leftTable).map(f => typeof f === 'string' ? f : f.field);
    const rightFields = fields.filter(f => (typeof f === 'string' ? { field: f, table: rightTable } : f).table === rightTable).map(f => typeof f === 'string' ? f : f.field);

    const projected = paged.map(({ left, right }) => {
      const row = {
        _left_id: left.L_id,
        _left_record_date: left.L_record_date,
        _left_status: left.L_status,
        _ps_name: left.ps_name,
        _district_name: left.district_name,
      };
      for (const fKey of leftFields) {
        row[`${leftTable}__${fKey}`] = left.L_data[fKey] ?? null;
      }
      if (right) {
        row._right_id = right.R_id;
        row._right_record_date = right.R_record_date;
        row._right_status = right.R_status;
        for (const fKey of rightFields) {
          row[`${rightTable}__${fKey}`] = right.R_data[fKey] ?? null;
        }
      }
      return row;
    });

    return { rows: projected, total, page: parseInt(page, 10) || 1, pageSize: limit };
  }
}

/**
 * Missing Person ↔ UIDB Cross-Match Report (§4.5)
 */
export async function executeMissingUidbCrossMatch(params, jurisdictionQuery) {
  const { gender, age_min, age_max, description_keywords, max_results = 100 } = params;
  const limit = Math.min(parseInt(max_results, 10) || 100, 500);

  const queryMode = await resolveQueryMode();

  if (queryMode === 'WAREHOUSE') {
    // Warehouse implementation: directly use typed columns
    let missingQ = db(`${whTable('fact_missing')} as fact_missing`)
      .select('fact_missing.source_record_id as id', 'fact_missing.record_date', 'fact_missing.ps_id', 'fact_missing.district_id',
              'ps.name_en as ps_name', 'dist.name_en as district_name',
              'fact_missing.missing_name', 'fact_missing.age', 'fact_missing.gender', 'fact_missing.missing_date',
              'fact_missing.physical_description')
      .leftJoin('hierarchy_nodes as ps', 'fact_missing.ps_id', 'ps.id')
      .leftJoin('hierarchy_nodes as dist', 'fact_missing.district_id', 'dist.id');

    let uidbQ = db(`${whTable('fact_uidb')} as fact_uidb`)
      .select('fact_uidb.source_record_id as id', 'fact_uidb.record_date', 'fact_uidb.ps_id', 'fact_uidb.district_id',
              'ps.name_en as ps_name', 'dist.name_en as district_name',
              'fact_uidb.approx_age', 'fact_uidb.approx_age_num', 'fact_uidb.gender', 'fact_uidb.found_date',
              'fact_uidb.found_place', 'fact_uidb.description', 'fact_uidb.identified')
      .leftJoin('hierarchy_nodes as ps', 'fact_uidb.ps_id', 'ps.id')
      .leftJoin('hierarchy_nodes as dist', 'fact_uidb.district_id', 'dist.id');

    if (jurisdictionQuery.ps_id) {
      missingQ = missingQ.where('fact_missing.ps_id', jurisdictionQuery.ps_id);
      uidbQ    = uidbQ.where('fact_uidb.ps_id', jurisdictionQuery.ps_id);
    }
    if (jurisdictionQuery.district_id) {
      missingQ = missingQ.where('fact_missing.district_id', jurisdictionQuery.district_id);
      uidbQ    = uidbQ.where('fact_uidb.district_id', jurisdictionQuery.district_id);
    }

    if (gender) {
      missingQ = missingQ.where('fact_missing.gender', gender);
      uidbQ    = uidbQ.where('fact_uidb.gender', gender);
    }

    if (description_keywords && description_keywords.length > 0) {
      const keywords = Array.isArray(description_keywords) ? description_keywords : [description_keywords];
      for (const kw of keywords.slice(0, 5)) {
        missingQ = missingQ.where('fact_missing.physical_description', 'LIKE', `%${kw}%`);
        uidbQ    = uidbQ.where('fact_uidb.description', 'LIKE', `%${kw}%`);
      }
    }

    const [missingRows, uidbRows] = await Promise.all([missingQ, uidbQ]);

    const matches = [];
    for (const mp of missingRows) {
      const mpAge = mp.age;
      const minAge = age_min !== undefined ? parseInt(age_min, 10) : (isNaN(mpAge) ? 0 : mpAge - 5);
      const maxAge = age_max !== undefined ? parseInt(age_max, 10) : (isNaN(mpAge) ? 999 : mpAge + 5);

      for (const ub of uidbRows) {
        const uidbAge = ub.approx_age_num;
        if (uidbAge !== null && !isNaN(minAge) && !isNaN(maxAge)) {
          if (uidbAge < minAge || uidbAge > maxAge) continue;
        }

        let score = 0;
        if (mp.gender && ub.gender && mp.gender.toLowerCase() === ub.gender.toLowerCase()) score += 3;
        if (mpAge && uidbAge && Math.abs(mpAge - uidbAge) <= 3) score += 2;

        matches.push({
          missing_id: mp.id,
          missing_record_date: mp.record_date,
          missing_ps_name: mp.ps_name,
          missing_district_name: mp.district_name,
          missing_name: mp.missing_name || '',
          missing_age: mp.age,
          missing_gender: mp.gender,
          missing_date: mp.missing_date,
          missing_description: mp.physical_description,
          uidb_id: ub.id,
          uidb_record_date: ub.record_date,
          uidb_ps_name: ub.ps_name,
          uidb_district_name: ub.district_name,
          uidb_approx_age: ub.approx_age,
          uidb_gender: ub.gender,
          uidb_found_date: ub.found_date,
          uidb_found_place: ub.found_place,
          uidb_description: ub.description,
          uidb_identified: ub.identified,
          match_score: score
        });
      }
    }

    matches.sort((a, b) => b.match_score - a.match_score);
    return { rows: matches.slice(0, limit), total: matches.length };

  } else {
    // FALLBACK: Query live operational JSONB records fuzzy search
    let missingQ = db('records as M')
      .select('M.id', 'M.record_date', 'M.ps_id', 'M.district_id', 'M.data',
              'ps.name_en as ps_name', 'dist.name_en as district_name')
      .leftJoin('hierarchy_nodes as ps', 'M.ps_id', 'ps.id')
      .leftJoin('hierarchy_nodes as dist', 'M.district_id', 'dist.id')
      .where('M.record_type', 'MISSING');

    let uidbQ = db('records as U')
      .select('U.id', 'U.record_date', 'U.ps_id', 'U.district_id', 'U.data',
              'ps.name_en as ps_name', 'dist.name_en as district_name')
      .leftJoin('hierarchy_nodes as ps', 'U.ps_id', 'ps.id')
      .leftJoin('hierarchy_nodes as dist', 'U.district_id', 'dist.id')
      .where('U.record_type', 'UIDB');

    if (jurisdictionQuery.ps_id) {
      missingQ = missingQ.where('M.ps_id', jurisdictionQuery.ps_id);
      uidbQ    = uidbQ.where('U.ps_id', jurisdictionQuery.ps_id);
    }
    if (jurisdictionQuery.district_id) {
      missingQ = missingQ.where('M.district_id', jurisdictionQuery.district_id);
      uidbQ    = uidbQ.where('U.district_id', jurisdictionQuery.district_id);
    }

    if (gender) {
      const pg = isPostgres();
      const genderExprM = pg ? `M.data->>'gender'` : `json_extract(M.data, '$.gender')`;
      const genderExprU = pg ? `U.data->>'gender'` : `json_extract(U.data, '$.gender')`;
      missingQ = missingQ.whereRaw(`${genderExprM} = ?`, [gender]);
      uidbQ    = uidbQ.whereRaw(`${genderExprU} = ?`, [gender]);
    }

    if (description_keywords && description_keywords.length > 0) {
      const keywords = Array.isArray(description_keywords) ? description_keywords : [description_keywords];
      const pg = isPostgres();
      for (const kw of keywords.slice(0, 5)) {
        const missingDescExpr = pg ? `M.data->>'physical_description'` : `json_extract(M.data, '$.physical_description')`;
        const uidbDescExpr    = pg ? `U.data->>'description'` : `json_extract(U.data, '$.description')`;
        missingQ = missingQ.whereRaw(`${missingDescExpr} LIKE ?`, [`%${kw}%`]);
        uidbQ    = uidbQ.whereRaw(`${uidbDescExpr} LIKE ?`, [`%${kw}%`]);
      }
    }

    const [missingRows, uidbRows] = await Promise.all([missingQ, uidbQ]);

    const missingParsed = missingRows.map(r => ({
      ...r,
      data: typeof r.data === 'string' ? JSON.parse(r.data || '{}') : (r.data || {})
    }));
    const uidbParsed = uidbRows.map(r => ({
      ...r,
      data: typeof r.data === 'string' ? JSON.parse(r.data || '{}') : (r.data || {})
    }));

    const matches = [];
    for (const mp of missingParsed) {
      const mpAge = parseInt(mp.data.age, 10);
      const minAge = age_min !== undefined ? parseInt(age_min, 10) : (isNaN(mpAge) ? 0 : mpAge - 5);
      const maxAge = age_max !== undefined ? parseInt(age_max, 10) : (isNaN(mpAge) ? 999 : mpAge + 5);

      for (const ub of uidbParsed) {
        const uidbAge = parseInt(ub.data.approx_age, 10);
        if (!isNaN(uidbAge) && !isNaN(minAge) && !isNaN(maxAge)) {
          if (uidbAge < minAge || uidbAge > maxAge) continue;
        }

        let score = 0;
        if (mp.data.gender && ub.data.gender && mp.data.gender.toLowerCase() === ub.data.gender.toLowerCase()) score += 3;
        if (!isNaN(mpAge) && !isNaN(uidbAge) && Math.abs(mpAge - uidbAge) <= 3) score += 2;

        matches.push({
          missing_id: mp.id,
          missing_record_date: mp.record_date,
          missing_ps_name: mp.ps_name,
          missing_district_name: mp.district_name,
          missing_name: mp.data.missing_name || '',
          missing_age: mp.data.age,
          missing_gender: mp.data.gender,
          missing_date: mp.data.missing_date,
          missing_description: mp.data.physical_description,
          uidb_id: ub.id,
          uidb_record_date: ub.record_date,
          uidb_ps_name: ub.ps_name,
          uidb_district_name: ub.district_name,
          uidb_approx_age: ub.data.approx_age,
          uidb_gender: ub.data.gender,
          uidb_found_date: ub.data.found_date,
          uidb_found_place: ub.data.found_place,
          uidb_description: ub.data.description,
          uidb_identified: ub.data.identified,
          match_score: score
        });
      }
    }

    matches.sort((a, b) => b.match_score - a.match_score);
    return { rows: matches.slice(0, limit), total: matches.length };
  }
}
