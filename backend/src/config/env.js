import dotenv from 'dotenv';
dotenv.config();

const getEnv = (key, fallback = '') => process.env[key] ?? fallback;

export const env = {
  NODE_ENV: getEnv('NODE_ENV', 'development'),
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
