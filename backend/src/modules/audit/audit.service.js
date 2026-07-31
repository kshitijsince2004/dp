import db from '../../config/db.js';
import { verifyAuditChain } from '../../utils/hash.js';
import { publish } from '../../events/eventBus.js';
import { getLogger } from '../../utils/logger.js';
import { setRecordFrozen } from '../records/records.service.js';

// Logging-instrumentation-2026-07-22 (B5): matches records.service.js style — this module
// gets the densest logging in B5's scope per HANDOFF §5 ("audit: log hash-chain verify steps
// + any break detected").
const log = getLogger('audit.service');

/**
 * Run a full hash-chain verification pass and (optionally) execute the freeze half of the
 * break procedure (DB_SCHEMA.md §9.4): every record whose chain is broken is frozen so all
 * further mutation is rejected until a privileged reviewer unfreezes it, an `audit.chain_
 * break_detected` alert is published, and each freeze leaves its own `audit_logs` row.
 *
 * Two safety rules govern the freeze half:
 *  - Rows the verifier reports as `unverifiable` (unknown/newer hash_version — e.g. a rolling
 *    deploy or rollback) are NOT tamper evidence and are never frozen; they are only reported.
 *  - A circuit-breaker refuses to auto-freeze ANY record when the break count is implausibly
 *    large — an absolute cap (env `AUDIT_VERIFY_MAX_FREEZE`, default 100) or a majority of all
 *    checked records — because a mass break is a systemic bug, not an attack, and mass-freezing
 *    would be a self-inflicted outage. On trip: nothing is frozen, it is logged loudly, and the
 *    alert is still published with the tripped flag.
 *
 * @param {object}  opts
 * @param {boolean} opts.freezeOnBreak  Freeze broken records + write freeze audit rows (default true).
 * @param {object}  opts.actor          The user/system triggering the scan ({ id, role }) — recorded on freezes and the alert.
 * @returns the verifyAuditChain summary, augmented with `frozen` (record ids actually frozen
 *          this run), `freezeSkipped` (true if the circuit-breaker suppressed freezing), and
 *          `freezeSkippedReason`.
 */
export async function runChainVerification({ freezeOnBreak = true, actor = null } = {}) {
  log.debug('runChainVerification: enter', { freezeOnBreak, actorId: actor?.id ?? null });
  const result = await verifyAuditChain(db);
  const unverifiable = result.unverifiable ?? [];
  const frozen = [];
  let freezeSkipped = false;
  let freezeSkippedReason = null;
  log.debug('runChainVerification: verifyAuditChain returned', {
    valid: result.valid, checkedRecords: result.checked_records, checkedRevisions: result.checked_revisions,
    breakCount: result.breaks.length, unverifiableCount: unverifiable.length,
  });

  if (unverifiable.length) {
    log.warn('runChainVerification: revisions UNVERIFIABLE (unknown/newer hash_version) — not tamper evidence, not frozen; likely a rolling deploy or rollback', {
      unverifiableCount: unverifiable.length,
    });
  }

  if (!result.valid) {
    log.error('runChainVerification: hash-chain verification FAILED', {
      breakCount: result.breaks.length, checkedRecords: result.checked_records,
    });

    // Circuit-breaker: a break count at/above these thresholds signals a systemic fault (bad
    // deploy, schema drift, verifier bug), never a targeted tamper — auto-freezing that many
    // records would take the system down harder than any attack. Refuse and defer to a human.
    const parsedCap = Number.parseInt(process.env.AUDIT_VERIFY_MAX_FREEZE ?? '', 10);
    const absoluteCap = Number.isInteger(parsedCap) && parsedCap > 0 ? parsedCap : 100;
    const majorityLimit = 0.5 * result.checked_records;
    log.debug('runChainVerification: circuit-breaker thresholds computed', { absoluteCap, majorityLimit, breakCount: result.breaks.length });

    if (freezeOnBreak && (result.breaks.length > absoluteCap || result.breaks.length > majorityLimit)) {
      freezeSkipped = true;
      freezeSkippedReason = result.breaks.length > absoluteCap
        ? `break_count ${result.breaks.length} exceeds absolute cap ${absoluteCap} (AUDIT_VERIFY_MAX_FREEZE)`
        : `break_count ${result.breaks.length} exceeds majority-of-records limit ${majorityLimit} of ${result.checked_records} checked`;
      log.error('runChainVerification: CIRCUIT-BREAKER TRIPPED — refusing to auto-freeze any record; a break at this scale is almost certainly a systemic bug, not tampering, manual review required', {
        breakCount: result.breaks.length, absoluteCap, majorityLimit, reason: freezeSkippedReason,
      });
    } else if (freezeOnBreak) {
      log.debug('runChainVerification: freezing broken records', { breakCount: result.breaks.length });
      for (const b of result.breaks) {
        try {
          const res = await setRecordFrozen(b.record_id, true, {
            user: actor,
            reason: `Hash-chain integrity break detected: ${b.reason}`.slice(0, 2000),
          });
          if (res.changed) {
            frozen.push(b.record_id);
            log.info('runChainVerification: froze broken record', { recordId: b.record_id, reason: b.reason });
          } else {
            log.debug('runChainVerification: record already frozen, no change', { recordId: b.record_id });
          }
        } catch (err) {
          // A freeze failure must never abort the rest of the sweep — log and continue.
          log.error('runChainVerification: failed to freeze broken record', { recordId: b.record_id, err });
        }
      }
    }

    // Alert AFTER the freezes so subscribers see a consistent (already-frozen) state. Payload
    // carries the full break list AND the unverifiable set so a future audit subscriber needs no
    // schema change (P6.3). Alerting is best-effort — a broker hiccup must not discard the freeze
    // work already done.
    try {
      await publish('audit.chain_break_detected', {
        break_count: result.breaks.length,
        breaks: result.breaks,
        unverifiable_count: unverifiable.length,
        unverifiable,
        frozen,
        auto_frozen: freezeOnBreak && !freezeSkipped,
        circuit_breaker_tripped: freezeSkipped,
        circuit_breaker_reason: freezeSkippedReason,
        detected_at: new Date().toISOString(),
        scanner_user_id: actor?.id ?? null,
      });
      log.debug('runChainVerification: published audit.chain_break_detected', { breakCount: result.breaks.length, frozenCount: frozen.length });
    } catch (err) {
      log.error('runChainVerification: failed to publish chain-break alert', { err });
    }
  } else if (unverifiable.length) {
    // No KNOWN-version break, but unverifiable rows exist. That is NOT a clean pass: an unknown
    // hash_version is exactly the tamper-laundering signature the version CHECK now blocks at
    // write time, and any that predate/bypass the constraint must still raise an alert rather
    // than read GREEN. Publish the same alert (break_count 0), best-effort like the break path.
    log.warn('runChainVerification: NO known-version breaks but UNVERIFIABLE revisions present — NOT a clean pass, alerting', {
      unverifiableCount: unverifiable.length, checkedRecords: result.checked_records,
    });
    try {
      await publish('audit.chain_break_detected', {
        break_count: result.breaks.length,
        breaks: result.breaks,
        unverifiable_count: unverifiable.length,
        unverifiable,
        frozen,
        auto_frozen: false,
        circuit_breaker_tripped: freezeSkipped,
        circuit_breaker_reason: freezeSkippedReason,
        detected_at: new Date().toISOString(),
        scanner_user_id: actor?.id ?? null,
      });
      log.debug('runChainVerification: published unverifiable-rows alert', { unverifiableCount: unverifiable.length });
    } catch (err) {
      log.error('runChainVerification: failed to publish unverifiable-rows alert', { err });
    }
  } else {
    log.info('runChainVerification: hash-chain intact', { checkedRevisions: result.checked_revisions, checkedRecords: result.checked_records });
  }

  log.info('runChainVerification: exit', {
    valid: result.valid, breakCount: result.breaks.length, frozenCount: frozen.length, freezeSkipped,
  });
  return { ...result, frozen, freezeSkipped, freezeSkippedReason };
}
