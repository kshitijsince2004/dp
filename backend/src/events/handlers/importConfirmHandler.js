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
