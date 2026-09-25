/**
 * Warehouse Sync Scheduler
 * =========================
 * Sets up a background cron job using `node-cron` to execute periodic
 * incremental synchronization from operational tables to the warehouse.
 */

import cron from 'node-cron';
import { runWarehouseSync } from './etl/sync.js';
import { logger } from '../../utils/logger.js';

let cronJob = null;
let isSyncing = false;

/**
 * Executes a sync run with locking to prevent overlapping executions.
 */
export async function executeScheduledSync() {
  if (isSyncing) {
    logger.warn('[Warehouse Scheduler] A sync run is already in progress. Skipping this schedule.');
    return;
  }

  isSyncing = true;
  logger.info('[Warehouse Scheduler] Starting scheduled warehouse sync...');
  try {
    const stats = await runWarehouseSync('ALL', false);
    logger.info(`[Warehouse Scheduler] Sync complete: Scanned=${stats.scanned}, Upserted=${stats.upserted}, Failed=${stats.failed}, Bridges=${stats.bridges}`);
  } catch (err) {
    logger.error(`[Warehouse Scheduler] Sync failed with error: ${err.message}`);
  } finally {
    isSyncing = false;
  }
}

/**
 * Initializes and starts the warehouse cron job.
 * Reads WAREHOUSE_SYNC_CRON (defaults to every 5 minutes: 'custom cron expression')
 * and WAREHOUSE_SYNC_ENABLED (defaults to true).
 */
export function startWarehouseSync() {
  const isEnabled = process.env.WAREHOUSE_SYNC_ENABLED === 'true';
  if (!isEnabled) {
    logger.info('[Warehouse Scheduler] Background sync is disabled via WAREHOUSE_SYNC_ENABLED.');
    return;
  }

  const cronExpression = process.env.WAREHOUSE_SYNC_CRON || '*/5 * * * *';
  if (!cron.validate(cronExpression)) {
    logger.error(`[Warehouse Scheduler] Invalid cron expression: "${cronExpression}". Scheduler not started.`);
    return;
  }

  logger.info(`[Warehouse Scheduler] Scheduling incremental sync with cron: "${cronExpression}"`);
  cronJob = cron.schedule(cronExpression, async () => {
    await executeScheduledSync();
  });

  // Run once asynchronously on server startup after a brief delay
  setTimeout(() => {
    executeScheduledSync().catch(err => {
      logger.error(`[Warehouse Scheduler] Initial startup sync failed: ${err.message}`);
    });
  }, 5000);
}

/**
 * Stops the running cron job (useful for tests and clean shutdown).
 */
export function stopWarehouseSync() {
  if (cronJob) {
    cronJob.stop();
    cronJob = null;
    logger.info('[Warehouse Scheduler] Background sync scheduler stopped.');
  }
}
