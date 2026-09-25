/**
 * Warehouse Backfill CLI Runner
 * =============================
 * Run this script to execute a full, idempotent replication of all operational
 * records into the reporting data warehouse.
 *
 * Usage:
 *   node scripts/warehouse_backfill.js
 */

import dotenv from 'dotenv';
dotenv.config();

import { connectDB } from '../src/config/db.js';
import { runFullBackfill } from '../src/modules/warehouse/etl/backfill.js';

async function main() {
  try {
    console.log('[Warehouse Backfill CLI] Connecting to database...');
    await connectDB();

    console.log('[Warehouse Backfill CLI] Running full database backfill...');
    await runFullBackfill();

    console.log('[Warehouse Backfill CLI] Done.');
    process.exit(0);
  } catch (err) {
    console.error('[Warehouse Backfill CLI] FATAL ERROR during backfill:', err);
    process.exit(1);
  }
}

main();
