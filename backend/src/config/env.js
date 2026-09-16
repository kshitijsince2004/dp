import dotenv from 'dotenv';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

dotenv.config({ path: path.resolve(__dirname, '../../.env') });
dotenv.config({ path: path.resolve(__dirname, '../../../.env') });
dotenv.config();

const getEnv = (key, fallback = '') => process.env[key] ?? fallback;

const NODE_ENV = getEnv('NODE_ENV', 'development');
const isDev = NODE_ENV === 'development';

const debugLoggingRaw = process.env.DEBUG_LOGGING;
const DEBUG_LOGGING = debugLoggingRaw === undefined ? isDev : debugLoggingRaw === 'true';

const jwtSecret = getEnv('JWT_SECRET', isDev ? 'pharos_jwt_secret_key_extremely_long_and_safe' : '');
const jwtRefreshSecret = getEnv('JWT_REFRESH_SECRET', isDev ? 'pharos_jwt_refresh_secret_key_extremely_long_and_safe' : '');

if (NODE_ENV === 'production' && (!jwtSecret || !jwtRefreshSecret)) {
  throw new Error('FATAL SECURITY ERROR: JWT_SECRET and JWT_REFRESH_SECRET must be explicitly set in production environment variables.');
}

export const env = {
  NODE_ENV,
  isDev,
  DEBUG_LOGGING,
  PORT: parseInt(getEnv('PORT', '5000'), 10),
  DATABASE_URL: getEnv('DATABASE_URL', 'postgresql://pharos:pharos@localhost:5432/pharos_db'),
  DB_CLIENT: getEnv('DB_CLIENT', 'pg'),
  RABBITMQ_URL: getEnv('RABBITMQ_URL', 'amqp://pharos:pharos123@localhost:5672'),
  REDIS_URL: getEnv('REDIS_URL', 'redis://localhost:6379'),
  JWT_SECRET: jwtSecret,
  JWT_REFRESH_SECRET: jwtRefreshSecret,
  JWT_ACCESS_EXPIRES: getEnv('JWT_ACCESS_EXPIRES', '15m'),
  JWT_REFRESH_EXPIRES: getEnv('JWT_REFRESH_EXPIRES', '7d'),
  STARTUP_AUTOLOAD: getEnv('STARTUP_AUTOLOAD', 'true'),
  FRONTEND_URL: getEnv('FRONTEND_URL', 'http://localhost:5173'),
  REPORTS_OUTPUT_DIR: getEnv('REPORTS_OUTPUT_DIR', './reports/output'),
};
