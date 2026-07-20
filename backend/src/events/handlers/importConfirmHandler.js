// Subscription glue for the bulk-import async confirm worker (Integration 3, WP5). Mirrors
// the shape of linkAuditHandler.js/linkResolver.js — this file owns nothing but the RabbitMQ
// wiring; all the actual work is import.service.js's processBatch(), which this handler calls
// on every `import.confirm.requested` message. The confirm HTTP endpoint (import.controller.js)
// publishes that event right after claimBatch() succeeds — this is the only place the message
// is consumed.
import * as eventBus from '../eventBus.js';
import { logger } from '../../utils/logger.js';
import { processBatch, sweepStaleConfirmedBatches } from '../../modules/import/import.service.js';

export async function init() {
  await eventBus.subscribe('import.confirm.requested', 'import-confirm-queue', async (payload) => {
    const batchId = payload?.batch_id;
    if (!batchId) {
      logger.warn('[ImportConfirmHandler] import.confirm.requested with no batch_id — dropping');
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
    } catch (err) {
      logger.error(`[ImportConfirmHandler] Unexpected error processing batch ${batchId}: ${err.message}`);
    }
  });

  // Startup sweep (§4.6/G4) — catches batches left in CONFIRMED with no live message to
  // process them (e.g. a mock-mode process restart between publish and consume). Runs once at
  // boot, not on a timer; processBatch's own leading status guard makes any redelivery safe.
  try {
    const swept = await sweepStaleConfirmedBatches(eventBus.publish);
    if (swept > 0) {
      logger.info(`[ImportConfirmHandler] Startup sweep re-published ${swept} stale CONFIRMED batch(es)`);
    }
  } catch (err) {
    logger.error(`[ImportConfirmHandler] Startup sweep failed: ${err.message}`);
  }
}
