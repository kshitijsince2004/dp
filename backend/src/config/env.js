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

// Dev/prod gate for the debug-logging pipe (logging-instrumentation-2026-07-22, foundation,
// HANDOFF.md §3b). Defaults to `isDev` (on in development, off in prod) but is explicitly
// overridable either way via process.env.DEBUG_LOGGING — e.g. set DEBUG_LOGGING=true against a
// prod-like build to hand a tester a working client-log pipe deliberately, or DEBUG_LOGGING=false
// in dev to quiet it. When off: `POST /api/logs/client` responds 204 and writes nothing; verbose
// `debug`-level module logging is separately gated by the logger's own level (env.isDev), so it
// is dropped regardless of this flag.
const debugLoggingRaw = process.env.DEBUG_LOGGING;
const DEBUG_LOGGING = debugLoggingRaw === undefined ? isDev : debugLoggingRaw === 'true';

export const env = {
  NODE_ENV,
  isDev,
  DEBUG_LOGGING,
  PORT: parseInt(getEnv('PORT', '5000'), 10),
  DATABASE_URL: getEnv('DATABASE_URL', 'postgresql://pharos:pharos@localhost:5432/pharos_db'),
  DB_CLIENT: getEnv('DB_CLIENT', 'pg'),
  RABBITMQ_URL: getEnv('RABBITMQ_URL', 'amqp://pharos:pharos123@localhost:5672'),
  REDIS_URL: getEnv('REDIS_URL', 'redis://localhost:6379'),
  JWT_SECRET: getEnv('JWT_SECRET', 'pharos_jwt_secret_key_extremely_long_and_safe'),
  JWT_REFRESH_SECRET: getEnv('JWT_REFRESH_SECRET', 'pharos_jwt_refresh_secret_key_extremely_long_and_safe'),
  JWT_ACCESS_EXPIRES: getEnv('JWT_ACCESS_EXPIRES', '15m'),
  JWT_REFRESH_EXPIRES: getEnv('JWT_REFRESH_EXPIRES', '7d'),
  STARTUP_AUTOLOAD: getEnv('STARTUP_AUTOLOAD', 'true'),
  FRONTEND_URL: getEnv('FRONTEND_URL', 'http://localhost:5173'),
  REPORTS_OUTPUT_DIR: getEnv('REPORTS_OUTPUT_DIR', './reports/output'),
};
