import { env } from './src/config/env.js';
import { connectDB } from './src/config/db.js';
import { connectEventBus } from './src/events/eventBus.js';
import { logger } from './src/utils/logger.js';
import app from './src/app.js';
import { createServer } from 'http';
import { startWarehouseSync } from './src/modules/warehouse/warehouse.scheduler.js';

const httpServer = createServer(app);

const start = async () => {
  try {
    // 1. Connect to PostgreSQL
    await connectDB();

    // 2. Connect to RabbitMQ Event Bus
    await connectEventBus();

    // 2.5 Init notification subscriptions
    const { initSubscriptions } = await import('./src/modules/notifications/notifications.service.js');
    await initSubscriptions();

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
    });
  } catch (error) {
    logger.error(`Startup failed: ${error.message}`);
    process.exit(1);
  }
};

start();

