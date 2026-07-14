import db from '../config/db.js';
import { env } from '../config/env.js';
import { logger } from '../utils/logger.js';
import { syncConfig } from '../../scripts/lib/sync-config-core.mjs';
import { loadRef, computeRefSourceChecksum } from '../../scripts/lib/load-ref-core.mjs';

const REF_CHECKSUM_KEY = 'ref_source_checksum';

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
    await loadRef(db, (line) => logger.info(`[autoload:load-ref] ${line}`));
    await db('system_meta')
      .insert({ key: REF_CHECKSUM_KEY, value: JSON.stringify({ checksum: currentChecksum }), updated_at: db.fn.now() })
      .onConflict('key')
      .merge();
    logger.info('[autoload] load-ref complete, checksum stored');
  } catch (err) {
    throw new Error(`[autoload] load-ref failed: ${err.message}`);
  }
}
