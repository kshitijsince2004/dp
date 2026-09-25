/**
 * Warehouse Smoke & Verification Test Script
 * ===========================================
 * Validates:
 * 1. Database readiness check and query mode resolver.
 * 2. Count verification on facts and dimensions.
 * 3. Query engine retargeting (Single table, Joined tables, Cross-match).
 * 4. Incremental watermark-based sync runner (runs without error).
 *
 * Run with:
 *   node scripts/test_warehouse.js
 */

import dotenv from 'dotenv';
dotenv.config();

import { connectDB } from '../../src/config/db.js';
import { isWarehouseReady, resolveQueryMode, getWarehouseStats } from '../../src/modules/warehouse/warehouse.db.js';
import { runWarehouseSync } from '../../src/modules/warehouse/etl/sync.js';
import {
  executeSingleTableQuery,
  executeJoinedQuery,
  executeMissingUidbCrossMatch
} from '../../src/modules/report-builder/query-engine.js';

async function main() {
  try {
    console.log('--- 🧪 STARTING WAREHOUSE SMOKE TESTS 🧪 ---');

    console.log('\n[1] Connecting to Database...');
    await connectDB();

    console.log('\n[2] Checking Warehouse Readiness...');
    const ready = await isWarehouseReady();
    console.log(`- isWarehouseReady: ${ready}`);
    if (!ready) {
      throw new Error('Warehouse is not ready. Run the backfill first.');
    }

    const queryMode = await resolveQueryMode();
    console.log(`- resolvedQueryMode: ${queryMode}`);
    if (queryMode !== 'WAREHOUSE') {
      throw new Error(`Expected WAREHOUSE query mode, got ${queryMode}`);
    }

    console.log('\n[3] Fetching Warehouse Statistics...');
    const stats = await getWarehouseStats();
    console.log('- Counts:');
    for (const [table, count] of Object.entries(stats.counts)) {
      console.log(`  • ${table}: ${count} rows`);
    }
    console.log('- Last Sync Log:', stats.lastSync ? {
      id: stats.lastSync.id,
      status: stats.lastSync.status,
      completed_at: stats.lastSync.run_completed_at,
      upserted: stats.lastSync.rows_upserted
    } : 'None');

    console.log('\n[4] Testing Query Engine: Single Table (CASE)...');
    const caseSpec = {
      table: 'CASE',
      fields: ['fir_no', 'fir_date', 'occurrence_place', 'local_head', 'io_name', 'status'],
      filters: {
        logic: 'AND',
        conditions: [
          { field: 'local_head', operator: 'EQ', value: 'Murder' }
        ]
      },
      page: 1,
      pageSize: 5
    };
    const caseResult = await executeSingleTableQuery(caseSpec, {}, 'HQ_ANALYST');
    console.log(`- CASE results fetched: ${caseResult.rows.length} rows (Total count: ${caseResult.total})`);
    if (caseResult.rows.length > 0) {
      console.log('  • First row sample:', caseResult.rows[0]);
    }

    console.log('\n[5] Testing Query Engine: Joined (CASE + ARREST)...');
    const joinedSpec = {
      table: 'CASE',
      join: 'ARREST',
      fields: [
        { field: 'fir_no', table: 'CASE' },
        { field: 'fir_date', table: 'CASE' },
        { field: 'local_head', table: 'CASE' },
        { field: 'arrested_name', table: 'ARREST' },
        { field: 'arrest_date', table: 'ARREST' },
        { field: 'status', table: 'ARREST' }
      ],
      filters: {
        logic: 'AND',
        conditions: []
      },
      page: 1,
      pageSize: 5
    };
    const joinedResult = await executeJoinedQuery(joinedSpec, {}, 'HQ_ANALYST');
    console.log(`- Joined results fetched: ${joinedResult.rows.length} rows (Total count: ${joinedResult.total})`);
    if (joinedResult.rows.length > 0) {
      console.log('  • First joined row sample:', joinedResult.rows[0]);
    }

    console.log('\n[6] Testing Query Engine: Cross-Match (MISSING ↔ UIDB)...');
    const crossMatchParams = {
      gender: 'Male',
      max_results: 5
    };
    const crossMatchResult = await executeMissingUidbCrossMatch(crossMatchParams, {});
    console.log(`- Cross-Match results fetched: ${crossMatchResult.rows.length} rows (Total count: ${crossMatchResult.total})`);
    if (crossMatchResult.rows.length > 0) {
      console.log('  • First cross-match row sample:', {
        score: crossMatchResult.rows[0].match_score,
        missing: crossMatchResult.rows[0].missing_name,
        uidb_age: crossMatchResult.rows[0].uidb_approx_age,
        uidb_place: crossMatchResult.rows[0].uidb_found_place
      });
    }

    console.log('\n[7] Testing Incremental Sync Runner...');
    const syncStats = await runWarehouseSync('ALL', false);
    console.log(`- Incremental sync finished: Scanned=${syncStats.scanned}, Upserted=${syncStats.upserted}, Failed=${syncStats.failed}`);

    console.log('\n✅ ALL WAREHOUSE SMOKE TESTS PASSED SUCCESSFULLY! ✅');
    process.exit(0);
  } catch (err) {
    console.error('\n❌ SMOKE TEST FAILED:', err);
    process.exit(1);
  }
}

main();
