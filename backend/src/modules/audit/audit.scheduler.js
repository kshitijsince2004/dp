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
import { getLogger } from '../../utils/logger.js';

const log = getLogger('audit.scheduler');

let cronJob = null;
let isVerifying = false;

/** Run one verification pass, guarded against overlap. */
export async function executeScheduledVerification() {
  log.debug('executeScheduledVerification: enter', { isVerifying });
  if (isVerifying) {
    log.warn('executeScheduledVerification: skipped — a verification run is already in progress');
    return;
  }
  isVerifying = true;
  const freezeOnBreak = process.env.AUDIT_VERIFY_FREEZE !== 'false';
  try {
    // actor:null → the row_hash break freeze is attributed to SYSTEM in audit_logs.
    const result = await runChainVerification({ freezeOnBreak, actor: null });
    log.info('executeScheduledVerification: exit', { valid: result.valid, breakCount: result.breaks.length, frozenCount: result.frozen.length });
  } catch (err) {
    log.error('executeScheduledVerification: verification run failed', { err });
  } finally {
    isVerifying = false;
  }
}

export function startAuditVerification() {
  const isEnabled = process.env.AUDIT_VERIFY_ENABLED !== 'false';
  if (!isEnabled) {
    log.info('startAuditVerification: disabled via AUDIT_VERIFY_ENABLED');
    return;
  }

  const cronExpression = process.env.AUDIT_VERIFY_CRON || '15 3 * * *';
  if (!cron.validate(cronExpression)) {
    log.error('startAuditVerification: invalid cron expression, scheduler not started', { cronExpression });
    return;
  }

  log.info('startAuditVerification: scheduling hash-chain verification', { cronExpression });
  cronJob = cron.schedule(cronExpression, async () => {
    log.debug('startAuditVerification: cron fired');
    await executeScheduledVerification();
  });
}

export function stopAuditVerification() {
  if (cronJob) {
    cronJob.stop();
    cronJob = null;
    log.info('stopAuditVerification: hash-chain verification scheduler stopped');
  }
}
