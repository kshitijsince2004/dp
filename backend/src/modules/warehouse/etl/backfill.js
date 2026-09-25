/**
 * Backfill Engine (ETL Layer)
 * ===========================
 * Handles one-time bulk backfill of historical data from the live operational
 * table to the reporting warehouse.
 */

import { runWarehouseSync } from './sync.js';
import { clearDimensionCaches, syncHierarchyDimensions } from './dimensions.js';
import { invalidateWarehouseCache } from '../warehouse.db.js';
import { logger } from '../../../utils/logger.js';

/**
 * Triggers a complete backfill of all tables.
 * This is idempotent and can be safely re-run.
 */
export async function runFullBackfill() {
  logger.info('[Warehouse Backfill] Starting full backfill...');

  // 1. Reset dimensions cache and sync locations
  clearDimensionCaches();
  logger.info('[Warehouse Backfill] Syncing locations/hierarchy nodes...');
  const hierarchyStats = await syncHierarchyDimensions();
  logger.info(`[Warehouse Backfill] Hierarchy synced: ${hierarchyStats.districtsSynced} districts, ${hierarchyStats.psSynced} stations.`);

  // 2. Perform full sync (forceFullSync = true)
  logger.info('[Warehouse Backfill] Loading all records into fact tables (this may take a few moments)...');
  const syncStats = await runWarehouseSync('ALL', true);

  logger.info('[Warehouse Backfill] Backfill completed successfully!');
  logger.info(`- Scanned: ${syncStats.scanned} | Upserted: ${syncStats.upserted} | Failed: ${syncStats.failed} | Bridges: ${syncStats.bridges}`);

  invalidateWarehouseCache();

  return syncStats;
}
