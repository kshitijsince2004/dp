# PHAROS System Configuration — JSON & Reference Data

> Contains all workflow JSON, field registry JSON, and level contract JSON verbatim, plus summaries of ref-data XLSX files.

## 1. Verbatim Configuration Files (JSON)

## 2. Reference Data Excel Files (`backend/config/ref-data/`)

## 3. Knexfile & Database Config Verbatim

### `backend/knexfile.js`
```javascript
import path from 'path';
import { fileURLToPath } from 'url';
import dotenv from 'dotenv';

dotenv.config();

const __dirname = path.dirname(fileURLToPath(import.meta.url));

const databaseUrl = process.env.DATABASE_URL || 'postgresql://pharos:pharos@localhost:5432/pharos_db';

const config = {
  client: 'pg',
  connection: databaseUrl,
  pool: {
    min: 2,
    max: 10
  },
  migrations: {
    directory: path.resolve(__dirname, 'migrations'),
    tableName: 'knex_migrations'
  },
  seeds: {
    directory: path.resolve(__dirname, 'seeds')
  }
};

export default {
  development: config,
  test: config,
  production: config
};
```

### `backend/src/config/db.js`
```javascript
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
```

### `backend/src/config/email.js`
```javascript
import nodemailer from 'nodemailer';
import { env } from './env.js';

export const transporter = nodemailer.createTransport({
  host: env.SMTP_HOST,
  port: env.SMTP_PORT,
  secure: env.SMTP_PORT === 465,
  auth: {
    user: env.SMTP_USER,
    pass: env.SMTP_PASS,
  },
});

export const verifyMailer = async () => {
  if (!env.SMTP_HOST) return;
  await transporter.verify();
};
```

### `backend/src/config/env.js`
```javascript
import dotenv from 'dotenv';
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
```

### `backend/src/config/geoData.js`
```javascript
// The ONE source module for geographic/demographic reference lists (WP11, 2026-07-16).
// Everything here is built synchronously at module load from checked-in data only:
//   - nationality demonyms: the already-installed i18n-nationality package (~248 entries —
//     this builder MOVED here verbatim from import-fields.config.js; its output is the exact
//     list the Excel templates have always shipped, the form now shares it)
//   - India states/UTs + districts: config/ref-data/india_states_districts.json (a reviewed
//     LGD-derived snapshot — regenerate via backend/scripts/dev/build_india_districts.mjs and
//     review the diff; NEVER a live npm dependency or network call at runtime)
// Consumed by: import-fields.config.js (re-exports for the Excel template pipeline),
// scripts/sync-config.mjs ($NATIONALITY/$INDIA_STATES/$INDIA_DISTRICTS placeholder expansion
// into field_registry options), template-builder.service.js (state→district cascade), and
// the /api/fields geo endpoint the form's cascading reads.
//
// Address semantics (user decisions, 2026-07-16): person/present/permanent addresses are
// INDIA-scoped (full states + per-state districts); the OCCURRENCE address is DELHI-scoped
// (country locked India, state locked Delhi, district = Delhi Police districts from the
// hierarchy — untouched by anything in this module).
import nationality from 'i18n-nationality';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));

// ── Nationality (~248 demonyms) ─────────────────────────────────────────────────────────
const natJsonPath = path.resolve(__dirname, '../../node_modules/i18n-nationality/langs/en.json');
let enNationality = {};
try {
  enNationality = JSON.parse(fs.readFileSync(natJsonPath, 'utf8'));
} catch (e) {
  // Minimal fallback so the module never throws at load — the full list needs the package's
  // data file, this keeps the app bootable if it's ever missing.
  enNationality = {
    IN: 'Indian', NP: 'Nepalese', BT: 'Bhutanese', BD: 'Bangladeshi', PK: 'Pakistani',
    LK: 'Sri Lankan', AF: 'Afghanistan', MM: 'Myanmar', US: 'American', GB: 'British', CA: 'Canadian',
  };
}
nationality.registerLocale(enNationality);
const demonymList = Object.values(nationality.getNames('en')).filter(Boolean);
const natExclude = new Set(['Indian', 'Tibetan', 'Other']);
const cleanNat = demonymList.filter((d) => !natExclude.has(d)).sort((a, b) => a.localeCompare(b));

/** Full demonym list, Indian/Tibetan pinned first, 'Other' escape hatch last. */
export const NATIONALITY_OPTS = ['Indian', 'Tibetan', ...cleanNat, 'Other'];

// ── India states/UTs + districts (LGD snapshot) ─────────────────────────────────────────
const snapshotPath = path.resolve(__dirname, '../../../config/ref-data/india_states_districts.json');
const snapshot = JSON.parse(fs.readFileSync(snapshotPath, 'utf8'));

/** All states/UTs alphabetical + the 'Other UT/State' escape hatch (kept from the old list —
 * foreign/unknown addresses need somewhere to go; the district cascade falls back to the
 * full-India superset for it). */
export const INDIA_STATES = [...snapshot.states.map((s) => s.state), 'Other UT/State'];

/** stateName -> sorted district names. No entry for 'Other UT/State' (deliberate). */
export const DISTRICTS_BY_STATE = Object.fromEntries(
  snapshot.states.map((s) => [s.state, s.districts])
);

/** Flattened unique sorted superset — the un-cascaded fallback list for address districts. */
export const ALL_INDIA_DISTRICTS = [...new Set(snapshot.states.flatMap((s) => s.districts))]
  .sort((a, b) => a.localeCompare(b));

// Occurrence-lock constants (D-A): the occurrence address is always Delhi.
export const INDIA_COUNTRY = 'India';
export const DELHI_STATE = 'Delhi';
```

### `backend/src/config/swagger.js`
```javascript
import swaggerJsdoc from 'swagger-jsdoc';

const options = {
  definition: {
    openapi: '3.0.0',
    info: {
      title: 'Crime Diaries API',
      version: '1.0.0',
      description: 'Police Hierarchical Automated Reporting & Operations System API Documentation',
    },
    servers: [
      {
        url: 'http://localhost:5000',
        description: 'Local Development Server',
      },
    ],
    components: {
      securitySchemes: {
        bearerAuth: {
          type: 'http',
          scheme: 'bearer',
          bearerFormat: 'JWT',
        },
      },
    },
    security: [
      {
        bearerAuth: [],
      },
    ],
  },
  apis: ['./src/modules/**/*.routes.js', './src/modules/**/*.controller.js'],
};

export const swaggerSpec = swaggerJsdoc(options);
```

## 4. Environment Template Configuration (`.env.example`)

### `backend/.env.example`
```env
NODE_ENV=development
PORT=5000

# PostgreSQL database (Cloud/Local)
DATABASE_URL=postgresql://postgres:postgres@localhost:5432/pharos_db

# RabbitMQ
RABBITMQ_URL=amqp://pharos:pharos123@localhost:5672

# Redis
REDIS_URL=redis://localhost:6379

# JWT
JWT_SECRET=change_this_to_strong_random_string_access
JWT_REFRESH_SECRET=change_this_to_strong_random_string_refresh
JWT_ACCESS_EXPIRES=15m
JWT_REFRESH_EXPIRES=7d

# Startup auto-load (sync-config every boot; load-ref when sources change). Set false to disable.
STARTUP_AUTOLOAD=true

# File Storage
REPORTS_DIR=./generated-reports

# CORS Frontend
FRONTEND_URL=http://localhost:5173
```

### `frontend/.env.local`
```env
VITE_API_URL=http://localhost:3000/api
```

## 5. Package Dependencies & Scripts

### `backend/package.json` (Scripts & Dependencies)
```json
{
  "scripts": {
    "dev": "nodemon index.js",
    "start": "node --max-old-space-size=2048 index.js",
    "db:migrate": "knex migrate:latest",
    "db:seed": "knex seed:run",
    "db:rollback": "knex migrate:rollback",
    "db:reset": "node scripts/dev/db-reset.mjs",
    "sync-config": "node scripts/sync-config.mjs",
    "load-ref": "node scripts/load-ref.mjs",
    "import:parity": "node scripts/import-bridge-parity.js",
    "import:corpus": "node scripts/import-reliability/replay-corpus.mjs",
    "audit:verify": "node scripts/verify-audit-chain.mjs",
    "seed:test-data": "node scripts/seed-test-data.js",
    "logs:clear": "node scripts/dev/clear-logs.mjs",
    "test": "node scripts/verify_.js"
  },
  "dependencies": {
    "amqplib": "^0.10.4",
    "bcryptjs": "^2.4.3",
    "cookie-parser": "^1.4.7",
    "cors": "^2.8.6",
    "CrimeDiaries": "file:..",
    "dotenv": "^16.4.5",
    "exceljs": "^3.4.0",
    "express": "^4.19.2",
    "express-rate-limit": "^7.5.1",
    "express-validator": "^7.3.2",
    "helmet": "^7.2.0",
    "i18n-nationality": "^1.4.0",
    "ioredis": "^5.11.1",
    "jsonwebtoken": "^9.0.3",
    "keycloak-connect": "^26.1.1",
    "knex": "^3.1.0",
    "mongoose": "^9.7.0",
    "morgan": "^1.10.0",
    "multer": "^2.2.0",
    "node-cron": "^4.2.1",
    "pg": "^8.11.5",
    "puppeteer": "^25.1.0",
    "slugify": "^1.6.9",
    "uuid": "^14.0.0",
    "winston": "^3.19.0"
  },
  "devDependencies": {
    "axios": "^1.18.0",
    "nodemon": "^3.1.0",
    "supertest": "^7.2.2"
  }
}
```

### `frontend/package.json` (Scripts & Dependencies)
```json
{
  "scripts": {
    "dev": "vite",
    "build": "vite build",
    "lint": "eslint .",
    "preview": "vite preview"
  },
  "dependencies": {
    "@ant-design/icons": "^5.3.7",
    "@hookform/resolvers": "^5.4.0",
    "@tailwindcss/vite": "^4.3.1",
    "@tanstack/react-query": "^5.101.0",
    "@tanstack/react-query-devtools": "^5.101.0",
    "antd": "^5.17.0",
    "axios": "^1.17.0",
    "clsx": "^2.1.1",
    "CrimeDiaries": "file:..",
    "date-fns": "^4.4.0",
    "dayjs": "^1.11.21",
    "framer-motion": "^12.40.0",
    "i18next": "^26.3.1",
    "i18next-browser-languagedetector": "^8.2.1",
    "jwt-decode": "^4.0.0",
    "lucide-react": "^0.469.0",
    "react": "^19.2.6",
    "react-dom": "^19.2.6",
    "react-hook-form": "^7.79.0",
    "react-hot-toast": "^2.6.0",
    "react-i18next": "^17.0.8",
    "react-router-dom": "^7.17.0",
    "recharts": "^3.8.1",
    "tailwindcss": "^4.3.1",
    "zod": "^4.4.3",
    "zustand": "^5.0.14"
  },
  "devDependencies": {
    "@eslint/js": "^10.0.1",
    "@types/react": "^19.2.14",
    "@types/react-dom": "^19.2.3",
    "@vitejs/plugin-react": "^6.0.1",
    "eslint": "^10.3.0",
    "eslint-plugin-react-hooks": "^7.1.1",
    "eslint-plugin-react-refresh": "^0.5.2",
    "globals": "^17.6.0",
    "vite": "^8.0.12"
  }
}
```

## 6. Infrastructure & Startup Scripts

### `docker-compose.yml`
```yaml
version: '3.9'

services:
  db:
    image: postgres:16-alpine
    restart: unless-stopped
    environment:
      POSTGRES_USER: postgres
      POSTGRES_PASSWORD: postgres
      POSTGRES_DB: pharos_db
    ports:
      - "5435:5432"
    volumes:
      - pgdata:/var/lib/postgresql/data
    healthcheck:
      test: [ "CMD-SHELL", "pg_isready -U postgres" ]
      interval: 10s
      timeout: 5s
      retries: 5

  rabbitmq:
    image: rabbitmq:3-management
    restart: unless-stopped
    ports:
      - "5672:5672"
      - "15672:15672"
    environment:
      RABBITMQ_DEFAULT_USER: pharos
      RABBITMQ_DEFAULT_PASS: pharos123
    healthcheck:
      test: [ "CMD", "rabbitmq-diagnostics", "ping" ]
      interval: 10s
      timeout: 5s
      retries: 5

  redis:
    image: redis:7-alpine
    restart: unless-stopped
    ports:
      - "6379:6379"
    healthcheck:
      test: [ "CMD", "redis-cli", "ping" ]
      interval: 10s
      timeout: 5s
      retries: 5

volumes:
  pgdata:
```

### `start.bat`
```bat
@echo off
echo ===================================================
echo     PHAROS Application Startup Script
echo ===================================================
echo.

echo [1/6] Starting Docker services (PostgreSQL, RabbitMQ, Redis)...
docker compose up -d
if %ERRORLEVEL% neq 0 (
    echo [Warning] Failed to start Docker services. Make sure Docker Desktop is running!
)
echo.

echo [2/6] Installing backend dependencies...
cd backend
call npm install
echo.

echo [3/6] Running database migrations...
call npm run db:migrate
echo.

echo [4/6] Seeding essential data (fields, users, config)...
call npm run db:seed
echo.

echo [4.5/6] Seeding dev test data (fresh dummy records)...
node scripts/seed-test-data.js
echo.

echo [4.6/6] Auto-updating import template baseline...
node scripts/template-regression.js baseline
echo.

echo [5/6] Starting frontend in a new terminal...
start "PHAROS Frontend" cmd /k "cd /d %~dp0frontend && npm run dev"
echo.

echo [5.5/6] Installing Python dependencies and starting report worker...
cd /d %~dp0python_worker
pip install -r requirements.txt
start "PHAROS Python Worker" cmd /k "cd /d %~dp0python_worker && python main.py"
cd /d %~dp0
echo.

echo [5.8/6] Freeing port 3000 if occupied...
for /f "tokens=5" %%a in ('netstat -aon 2^>nul ^| findstr :3000 ^| findstr LISTENING 2^>nul') do taskkill /f /pid %%a >nul 2>&1
echo.

echo [6/6] Starting backend server in a new terminal...
start "PHAROS Backend" cmd /k "cd /d %~dp0backend && npm run dev"
echo.

echo ===================================================
echo  PHAROS is starting up!
echo  Backend:  http://localhost:3000
echo  Frontend: http://localhost:5173
echo ===================================================
```

### `start.sh`
```bash
#!/usr/bin/env bash
# Disable set -e so npm audit warnings don't abort the script
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"

echo "==================================================="
echo "    PHAROS Application Startup Script"
echo "==================================================="
echo

# ── [0/6] Clean up any stale processes from a previous run ───────────────────
echo "[0/6] Cleaning up stale processes and ports..."
bash "$SCRIPT_DIR/stop.sh"
sleep 1  # give OS time to release ports
echo

echo "[1/6] Starting Docker services (PostgreSQL, RabbitMQ, Redis)..."
docker compose up -d || echo "[Warning] Failed to start Docker services. Make sure Docker is running!"
echo

echo "[2/6] Installing backend dependencies..."
cd "$SCRIPT_DIR/backend"
npm install --prefer-offline 2>&1 | grep -v "^npm warn" | grep -v "^$" || true
echo

echo "[3/6] Running database migrations..."
npm run db:migrate
echo

echo "[4/6] Seeding essential data (fields, users, config)..."
npm run db:seed
echo

echo "[4.5/6] Seeding dev test data (fresh dummy records)..."
node scripts/seed-test-data.js
echo

echo "[5/6] Installing frontend dependencies and starting frontend in a new terminal..."
cd "$SCRIPT_DIR/frontend"
npm install --prefer-offline 2>&1 | grep -v "^npm warn" | grep -v "^$" || true

if command -v gnome-terminal &>/dev/null; then
    gnome-terminal --title="PHAROS Frontend" -- bash -c "cd '$SCRIPT_DIR/frontend' && npm run dev; exec bash"
elif command -v xterm &>/dev/null; then
    xterm -title "PHAROS Frontend" -e "cd '$SCRIPT_DIR/frontend' && npm run dev; bash" &
else
    bash -c "cd '$SCRIPT_DIR/frontend' && npm run dev" &
fi
echo

echo "[5.5/6] Installing Python dependencies and starting report worker..."
cd "$SCRIPT_DIR/python_worker"
if [ ! -d "venv" ]; then
    python3 -m venv venv
fi
venv/bin/pip install -r requirements.txt -q

if command -v gnome-terminal &>/dev/null; then
    gnome-terminal --title="PHAROS Python Worker" -- bash -c "cd '$SCRIPT_DIR/python_worker' && venv/bin/python main.py; exec bash"
elif command -v xterm &>/dev/null; then
    xterm -title "PHAROS Python Worker" -e "cd '$SCRIPT_DIR/python_worker' && venv/bin/python main.py; bash" &
else
    bash -c "cd '$SCRIPT_DIR/python_worker' && venv/bin/python main.py" &
fi
echo

echo "[6/6] Starting backend server in a new terminal..."
if command -v gnome-terminal &>/dev/null; then
    gnome-terminal --title="PHAROS Backend" -- bash -c "cd '$SCRIPT_DIR/backend' && npm run dev; exec bash"
elif command -v xterm &>/dev/null; then
    xterm -title "PHAROS Backend" -e "cd '$SCRIPT_DIR/backend' && npm run dev; bash" &
else
    bash -c "cd '$SCRIPT_DIR/backend' && npm run dev" &
fi
echo

echo "==================================================="
echo " PHAROS is starting up!"
echo " Backend:  http://localhost:5000"
echo " Frontend: http://localhost:5173"
echo "==================================================="
```
