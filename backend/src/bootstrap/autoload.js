import db from '../config/db.js';
import { env } from '../config/env.js';
import { logger } from '../utils/logger.js';
import { syncConfig } from '../../scripts/lib/sync-config-core.mjs';
import { loadRef, computeRefSourceChecksum, REF_CHECKSUM_KEY } from '../../scripts/lib/load-ref-core.mjs';

/**
 * Smart startup auto-load, run once at boot between connectDB() and
 * connectEventBus() (index.js):
 *   1. sync-config always (checksum-idempotent per row — cheap no-op when
 *      config/{fields,workflow,proformas,contracts}/*.json are unchanged).
 *   2. load-ref only when ref.* / hierarchy_nodes is empty, or the source
 *      files (Menu_Tables.xlsx, org/hierarchy.json, ps_codes.json, the
 *      heinous overlay) changed since the last successful load — tracked via
 *      system_meta.ref_source_checksum.
 * Disable with STARTUP_AUTOLOAD=false. Any failure aborts startup loudly —
 * this runs before the HTTP server starts accepting traffic.
 */
export async function runStartupAutoload() {
  if (env.STARTUP_AUTOLOAD === 'false') {
    logger.info('[autoload] STARTUP_AUTOLOAD=false — skipped');
    return;
  }

  try {
    await syncConfig(db, (line) => logger.info(`[autoload:sync-config] ${line}`));
  } catch (err) {
    throw new Error(`[autoload] sync-config failed (is the DB migrated? run \`npm run db:migrate\`): ${err.message}`);
  }

  let needsRefLoad = false;
  try {
    const [{ count: refCount }] = await db('ref.acts').count('* as count');
    const [{ count: hierCount }] = await db('hierarchy_nodes').count('* as count');
    needsRefLoad = Number(refCount) === 0 || Number(hierCount) === 0;
  } catch (err) {
    throw new Error(`[autoload] could not inspect ref/hierarchy tables (is the DB migrated? run \`npm run db:migrate\`): ${err.message}`);
  }

  const currentChecksum = computeRefSourceChecksum();
  if (!needsRefLoad) {
    const stored = await db('system_meta').where({ key: REF_CHECKSUM_KEY }).first();
    needsRefLoad = !stored || stored.value?.checksum !== currentChecksum;
  }

  if (!needsRefLoad) {
    logger.info('[autoload] ref/hierarchy sources unchanged — load-ref skipped');
    return;
  }

  try {
    // loadRef itself persists ref_source_checksum on success (shared with the CLI —
    // see load-ref-core.mjs), so nothing extra to store here.
    await loadRef(db, (line) => logger.info(`[autoload:load-ref] ${line}`));
    logger.info('[autoload] load-ref complete');
  } catch (err) {
    // FK-safe guard: loadRef's ref.* reload is a destructive DELETE-all + re-insert inside a
    // single transaction. Once records exist, record_offences/records FK-reference ref rows
    // (ref.sections, ref.acts, ref.local_heads, …), so the delete pass raises a foreign-key
    // violation (Postgres 23503) and the whole ref transaction ROLLS BACK — the previously
    // loaded ref data is left fully intact. That must NOT abort startup: before this guard, a
    // ref/overlay source edit on a DB that already had records made the server fail to boot
    // (observed 2026-07-20). Downgrade that specific case to a loud warning and continue; any
    // other failure (missing/corrupt source file, etc.) still aborts loudly as before.
    // To actually APPLY ref/overlay changes once data exists, rebuild the disposable dev DB:
    //   npm run db:reset && npm run db:migrate && npm run sync-config && npm run load-ref && npm run db:seed
    const isFkViolation = err.code === '23503' || /violates foreign key/i.test(err.message || '');
    if (isFkViolation) {
      logger.warn(
        '[autoload] load-ref SKIPPED — ref/overlay sources changed, but existing records ' +
        'FK-reference ref.* rows, so a destructive reload is unsafe. Prior ref data left ' +
        'intact; startup continues. To apply ref changes, rebuild the dev DB (db:reset → ' +
        `db:migrate → sync-config → load-ref → db:seed). Underlying error: ${err.message}`
      );
      // Persist checksum so future boots don't repeat the aborted reload attempt
      try {
        await db('system_meta')
          .insert({ key: REF_CHECKSUM_KEY, value: JSON.stringify({ checksum: currentChecksum }), updated_at: db.fn.now() })
          .onConflict('key')
          .merge({ value: JSON.stringify({ checksum: currentChecksum }), updated_at: db.fn.now() });
      } catch (metaErr) {
        logger.debug('[autoload] failed to update ref checksum on skipped reload', { error: metaErr.message });
      }
      return;
    }
    throw new Error(`[autoload] load-ref failed: ${err.message}`);
  }
}
