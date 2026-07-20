import { env } from './src/config/env.js';
import { connectDB } from './src/config/db.js';
import { connectEventBus } from './src/events/eventBus.js';
import { logger } from './src/utils/logger.js';
import app from './src/app.js';
import { createServer } from 'http';
import { startWarehouseSync } from './src/modules/warehouse/warehouse.scheduler.js';
import { startAuditVerification } from './src/modules/audit/audit.scheduler.js';
import { runStartupAutoload } from './src/bootstrap/autoload.js';
import * as notifyHandler from './src/events/handlers/notifyHandler.js';
import * as linkAuditHandler from './src/events/handlers/linkAuditHandler.js';
import * as linkResolver from './src/events/handlers/linkResolver.js';
import * as importConfirmHandler from './src/events/handlers/importConfirmHandler.js';

const httpServer = createServer(app);

const start = async () => {
  try {
    // 1. Connect to PostgreSQL
    await connectDB();

    // 1.5 Smart config/ref auto-load (sync-config always, load-ref when sources changed)
    await runStartupAutoload();

    // 2. Connect to RabbitMQ Event Bus
    await connectEventBus();

    // 2.5 Start background event handlers. This is the ACTUAL entry point
    // (`npm run dev`/`start` → nodemon/node index.js, per package.json) — a
    // pre-existing bug (found during Integration 2's link-resolver testing, not
    // introduced by it) had this file bootstrapping its own parallel handler set
    // that never matched app.js's `startServer()` (which only runs when app.js
    // is executed directly, e.g. tests — never via the real npm scripts). The old
    // call here was to notifications.service.js's initSubscriptions(), the
    // confirmed-dead handler CLAUDE.md §13 already documents (wrong event
    // `record.status_changed`, hardcoded mock user UUID, writes to a `message`
    // column that doesn't exist on the new `notifications` table — every one of
    // its inserts has been silently failing). notifyHandler.js/linkAuditHandler.js
    // (the correct, schema-matching handlers) were consequently NEVER running in
    // any real deployment — no SHO/HC notifications, no link audit trail, and (as
    // of this integration) no async CASE_ARREST/CASE_MISSING link resolution
    // either. Fixed: wire the real handlers here, matching app.js's startServer()
    // exactly, and delete the dead notifications.service.js subscription path.
    await notifyHandler.init();
    await linkAuditHandler.init();
    await linkResolver.init();
    await importConfirmHandler.init();

    // 3. Start Express server
    httpServer.on('error', (e) => { logger.error(`[Server] HTTP server error: ${e.message}`); process.exit(1); });
    httpServer.listen(env.PORT, () => {
      logger.info('===================================================');
      logger.info(`  🚀 PRISM API Server is ONLINE`);
      logger.info(`  🌐 URL:  http://localhost:${env.PORT}`);
      logger.info(`  🔧 Mode: ${env.NODE_ENV}`);
      logger.info('===================================================');

      // Start warehouse sync scheduler
      startWarehouseSync();

      // Start audit hash-chain verification scheduler (freezes records on a detected break)
      startAuditVerification();
    });
  } catch (error) {
    logger.error(`Startup failed: ${error.message}`);
    process.exit(1);
  }
};

start();

