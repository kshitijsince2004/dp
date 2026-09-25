import pg from 'pg';
import knex from 'knex';
import knexConfig from '../../knexfile.js';
import { env } from './env.js';
import { logger } from '../utils/logger.js';

// Return DATE columns as ISO strings instead of JS Date objects (avoids timezone shift)
pg.types.setTypeParser(1082, v => v);

const environment = env.NODE_ENV || 'development';
const config = knexConfig[environment];

export const db = knex(config);

export const connectDB = async ({ retries = 8, delayMs = 3000 } = {}) => {
  for (let attempt = 1; attempt <= retries; attempt++) {
    try {
      await db.raw('SELECT 1');
      logger.info('✅ PostgreSQL connected');
      return;
    } catch (err) {
      logger.warn(`PostgreSQL not ready (attempt ${attempt}/${retries}): ${err.message}`);
      if (attempt === retries) {
        logger.error('❌ Could not connect to PostgreSQL after all retries. Is Docker running?');
        process.exit(1);
      }
      await new Promise(r => setTimeout(r, delayMs));
    }
  }
};

const shutdownDB = async (signal) => {
  logger.info(`${signal} received. Closing PostgreSQL connection...`);
  await db.destroy();
  logger.info('PostgreSQL connection closed.');
  process.exit(0);
};

process.on('SIGINT', () => shutdownDB('SIGINT'));
process.on('SIGTERM', () => shutdownDB('SIGTERM'));

export default db;
