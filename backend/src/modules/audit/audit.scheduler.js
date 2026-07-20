/**
 * Audit Hash-Chain Verification Scheduler
 * =======================================
 * Periodically walks every record's revision chain (utils/hash.js → verifyAuditChain) and,
 * on any tamper-evidence break, freezes the affected records + raises an alert
 * (audit.service.js → runChainVerification). This is the "scheduled verification job" half of
 * the hash-chain break procedure (DB_SCHEMA.md §9.4 / ENGINEERING_BASELINE P1.5 step 8).
 *
 * Config (env):
 *   AUDIT_VERIFY_ENABLED   'false' to disable (default enabled)
 *   AUDIT_VERIFY_CRON      cron expression (default daily at 03:15 — '15 3 * * *')
 *   AUDIT_VERIFY_FREEZE    'false' to report-only without freezing (default freeze on break)
 */

import cron from 'node-cron';
import { runChainVerification } from './audit.service.js';
import { logger } from '../../utils/logger.js';

let cronJob = null;
let isVerifying = false;

/** Run one verification pass, guarded against overlap. */
export async function executeScheduledVerification() {
  if (isVerifying) {
    logger.warn('[AuditScheduler] A verification run is already in progress. Skipping this schedule.');
    return;
  }
  isVerifying = true;
  const freezeOnBreak = process.env.AUDIT_VERIFY_FREEZE !== 'false';
  try {
    // actor:null → the row_hash break freeze is attributed to SYSTEM in audit_logs.
    await runChainVerification({ freezeOnBreak, actor: null });
  } catch (err) {
    logger.error(`[AuditScheduler] Verification run failed: ${err.message}`);
  } finally {
    isVerifying = false;
  }
}

export function startAuditVerification() {
  const isEnabled = process.env.AUDIT_VERIFY_ENABLED !== 'false';
  if (!isEnabled) {
    logger.info('[AuditScheduler] Hash-chain verification is disabled via AUDIT_VERIFY_ENABLED.');
    return;
  }

  const cronExpression = process.env.AUDIT_VERIFY_CRON || '15 3 * * *';
  if (!cron.validate(cronExpression)) {
    logger.error(`[AuditScheduler] Invalid cron expression: "${cronExpression}". Scheduler not started.`);
    return;
  }

  logger.info(`[AuditScheduler] Scheduling hash-chain verification with cron: "${cronExpression}"`);
  cronJob = cron.schedule(cronExpression, async () => {
    await executeScheduledVerification();
  });
}

export function stopAuditVerification() {
  if (cronJob) {
    cronJob.stop();
    cronJob = null;
    logger.info('[AuditScheduler] Hash-chain verification scheduler stopped.');
  }
}
