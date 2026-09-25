/**
 * Warehouse DB Helper
 * ====================
 * Provides a thin abstraction over the `rpt` schema (PostgreSQL) vs
 * `rpt_` table-name prefix (SQLite for local dev).
 *
 * Usage:
 *   import { wh, whTable, isWarehouseReady, getWarehouseMode } from './warehouse.db.js';
 *
 *   // Query a warehouse table
 *   const rows = await wh('fact_fir').where({ ps_id: '...' }).select('*');
 *
 *   // Get the fully-qualified table name (for raw knex.raw() calls)
 *   const tbl = whTable('fact_fir'); // → "rpt.fact_fir" (PG) or "rpt_fact_fir" (SQLite)
 *
 * COMPATIBILITY:
 * - PostgreSQL: uses schema.table notation ("rpt.fact_fir")
 * - SQLite: uses prefixed table name ("rpt_fact_fir")
 * - Both paths go through the same app code — only the string differs
 */

import db from '../../config/db.js';
import { logger } from '../../utils/logger.js';

const _isSqlite = () => {
  const c = db.client.config.client;
  return c === 'sqlite3' || c === 'better-sqlite3';
};

/**
 * Returns the fully-qualified warehouse table name string.
 * PG:     "rpt.fact_fir"
 * SQLite: "rpt_fact_fir"
 */
export const whTable = (logicalName) => {
  return _isSqlite() ? `rpt_${logicalName}` : `rpt.${logicalName}`;
};

/**
 * Returns a Knex QueryBuilder for a warehouse table.
 * Equivalent to db('rpt.fact_fir') on PG or db('rpt_fact_fir') on SQLite.
 */
export const wh = (logicalName) => db(whTable(logicalName));

/**
 * The 11 logical warehouse tables (used for health checks, schema tests).
 */
export const WAREHOUSE_TABLES = [
  'dim_district',
  'dim_police_station',
  'dim_officer',
  'dim_crime_head',
  'dim_case_status',
  'dim_act_law',
  'fact_fir',
  'fact_arrest',
  'fact_pcr',
  'fact_missing',
  'fact_uidb',
  'bridge_fir_arrest',
  'bridge_fir_missing',
  'sync_log',
];

/**
 * Checks whether the warehouse schema has been populated.
 * Returns true if all fact tables exist AND at least one has been loaded.
 * Uses a lightweight COUNT query — not a full table scan.
 *
 * Result is cached for 60 seconds to avoid hammering the DB on every request.
 */
let _whReadyCache = null;
let _whReadyCacheAt = 0;
const CACHE_TTL_MS = 60_000;

export async function isWarehouseReady() {
  const now = Date.now();
  if (_whReadyCache !== null && now - _whReadyCacheAt < CACHE_TTL_MS) {
    return _whReadyCache;
  }

  try {
    // Check the three primary fact tables exist and have data
    const factTables = ['fact_fir', 'fact_arrest', 'fact_missing'];
    for (const t of factTables) {
      const exists = _isSqlite()
        ? await db.schema.hasTable(`rpt_${t}`)
        : await db.schema.withSchema('rpt').hasTable(t);
      if (!exists) {
        _whReadyCache = false;
        _whReadyCacheAt = now;
        return false;
      }
    }

    // At least one fact table must have rows (backfill run)
    const row = await wh('fact_fir').count('sk as c').first();
    const count = parseInt(row?.c || 0, 10);
    _whReadyCache = count > 0 || (await wh('fact_arrest').count('sk as c').first().then(r => parseInt(r?.c || 0, 10))) > 0;
    _whReadyCacheAt = now;
    return _whReadyCache;
  } catch (err) {
    logger.error('[Warehouse] Error checking warehouse status:', err.message);
    _whReadyCache = false;
    _whReadyCacheAt = now;
    return false;
  }
}

/** Force-clear the readiness cache (call after backfill completes). */
export function invalidateWarehouseCache() {
  _whReadyCache = null;
  _whReadyCacheAt = 0;
}

/**
 * Resolve which query mode to use for a request.
 *
 * Env var WAREHOUSE_QUERY_MODE controls:
 *   AUTO           (default) — warehouse if ready, else live JSONB fallback
 *   WAREHOUSE_ONLY — always warehouse; returns error if not ready
 *   LIVE_ONLY      — always live records table (disables warehouse entirely)
 *
 * @returns {'WAREHOUSE'|'LIVE'}
 */
export async function resolveQueryMode() {
  const mode = (process.env.WAREHOUSE_QUERY_MODE || 'AUTO').toUpperCase();
  if (mode === 'LIVE_ONLY') return 'LIVE';
  if (mode === 'WAREHOUSE_ONLY') {
    if (await isWarehouseReady()) return 'WAREHOUSE';
    throw new Error(
      'Warehouse is not ready (WAREHOUSE_QUERY_MODE=WAREHOUSE_ONLY). ' +
      'Run the backfill script first: node scripts/warehouse_backfill.js'
    );
  }
  // AUTO
  return (await isWarehouseReady()) ? 'WAREHOUSE' : 'LIVE';
}

/**
 * Get row counts for all warehouse fact tables (for /warehouse/status endpoint).
 */
export async function getWarehouseStats() {
  const facts = ['fact_fir', 'fact_arrest', 'fact_pcr', 'fact_missing', 'fact_uidb'];
  const dims  = ['dim_district', 'dim_police_station', 'dim_officer', 'dim_crime_head', 'dim_case_status', 'dim_act_law'];

  const counts = {};
  for (const t of [...facts, ...dims]) {
    try {
      const row = await wh(t).count('* as c').first();
      counts[t] = parseInt(row?.c || 0, 10);
    } catch {
      counts[t] = null; // table doesn't exist yet
    }
  }

  // Last sync run
  let lastSync = null;
  try {
    lastSync = await wh('sync_log')
      .where('status', '!=', 'RUNNING')
      .orderBy('run_started_at', 'desc')
      .first();
  } catch { /* sync_log may not exist */ }

  return { counts, lastSync };
}
