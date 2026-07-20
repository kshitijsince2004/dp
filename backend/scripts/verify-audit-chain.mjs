#!/usr/bin/env node
/**
 * On-demand hash-chain verification (ops / CI / incident response).
 *
 *   node scripts/verify-audit-chain.mjs            # report-only, exit 1 if any chain is broken
 *   node scripts/verify-audit-chain.mjs --freeze   # also freeze broken records + raise the alert
 *   node scripts/verify-audit-chain.mjs --json      # machine-readable output
 *
 * Exit codes (so it doubles as a CI gate):
 *   0  every chain verifies clean (no breaks, no unverifiable rows)
 *   1  one or more KNOWN-version breaks found (takes precedence if both present)
 *   2  verification failed to run (e.g. DB down)
 *   3  no breaks, but unverifiable row(s) present — NOT a clean pass (unknown hash_version:
 *      the tamper-laundering signature the version CHECK blocks at write time)
 */

import db from '../src/config/db.js';
import { runChainVerification } from '../src/modules/audit/audit.service.js';

const args = new Set(process.argv.slice(2));
const freeze = args.has('--freeze');
const asJson = args.has('--json');

// The alert publish inside runChainVerification is best-effort; if RabbitMQ isn't up in a CLI
// context it will throw. Verification itself is DB-only, so fall back to a freeze-less path is
// not needed — instead we let publish failures surface but still print the DB result we have.
const run = async () => {
  const result = await runChainVerification({ freezeOnBreak: freeze, actor: null });
  const unverifiable = result.unverifiable ?? [];

  if (asJson) {
    console.log(JSON.stringify(result, null, 2));
  } else if (result.valid && unverifiable.length === 0) {
    console.log(`✅ Hash-chain intact — ${result.checked_revisions} revisions across ${result.checked_records} records verified.`);
  } else {
    // Breaks take precedence in messaging/exit, but the unverifiable section is always printed
    // when present so an unknown-hash_version row (the tamper-laundering signature) is never silent.
    if (!result.valid) {
      console.error(`❌ Hash-chain BROKEN — ${result.breaks.length} broken chain(s):`);
      for (const b of result.breaks) {
        console.error(`   • record ${b.record_id} @ rev ${b.revision_number}: ${b.reason}`);
      }
      if (freeze) console.error(`   → froze ${result.frozen.length} record(s): ${result.frozen.join(', ') || '(none newly frozen)'}`);
      else console.error('   → run with --freeze to freeze these records, or use POST /audit/chain-verify.');
    }
    if (unverifiable.length) {
      console.error(`⚠️  UNVERIFIABLE — ${unverifiable.length} revision(s) with unknown/unhashable hash_version (NOT a clean pass):`);
      for (const u of unverifiable) {
        console.error(`   • record ${u.record_id} @ rev ${u.revision_number} (hash_version ${u.hash_version}): ${u.reason}`);
      }
      console.error('   → an unknown hash_version is the tamper-laundering signature blocked at write time by the record_revisions_hash_version_known CHECK; investigate any row that predates/bypasses it.');
    }
  }

  // 1 = known-version breaks (precedence), 3 = unverifiable-only, 0 = clean.
  if (!result.valid) return 1;
  if (unverifiable.length) return 3;
  return 0;
};

run()
  .then(async (code) => { await db.destroy(); process.exit(code); })
  .catch(async (err) => {
    console.error(`Verification failed to run: ${err.message}`);
    try { await db.destroy(); } catch { /* ignore */ }
    process.exit(2);
  });
