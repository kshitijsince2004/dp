# PHAROS — Local Development Setup Guide
**Version:** 1.0 | **Date:** 2026-08-18 | **Audience:** Any developer onboarding to the PHAROS codebase  
**Verified On:** Windows 11 / WSL2 / Ubuntu 22.04+ / macOS

---

## 1. Prerequisites

| Tool | Minimum Version | Installation Link / Command |
|---|---|---|
| **Node.js** | `20.x` or `22.x` | [https://nodejs.org](https://nodejs.org) |
| **npm** | `10.x` | Bundled with Node.js |
| **Python** | `3.10+` | [https://python.org](https://python.org) |
| **Docker Desktop** | Latest (Compose v2) | [https://docker.com](https://docker.com) |
| **Git** | Any modern version | [https://git-scm.com](https://git-scm.com) |

---

## 2. Step-by-Step Setup

### Step 1: Clone Repository
```bash
git clone <repo-url>
cd pharos-prototype
```

### Step 2: Configure Environment Files

**Backend Configuration:**
Create `backend/.env` (copy from `backend/.env.example` if available, or create with the following):

```env
# CRITICAL: PostgreSQL host port is 5435 (mapped from container 5432)
DATABASE_URL=postgresql://postgres:postgres@localhost:5435/pharos_db

PORT=5000
NODE_ENV=development
FRONTEND_URL=http://localhost:5173

# RabbitMQ
RABBITMQ_URL=amqp://pharos:pharos123@localhost:5672

# Redis
REDIS_URL=redis://localhost:6379

# JWT Secrets (Use strong random strings in production)
JWT_SECRET=pharos_dev_secret_jwt_access_key_min_64_characters_long_random_seed_1234567890
JWT_REFRESH_SECRET=pharos_dev_secret_jwt_refresh_key_min_64_characters_long_random_seed_1234567890
JWT_EXPIRES_IN=15m
JWT_REFRESH_EXPIRES_IN=7d

# Reports output directory
REPORTS_DIR=./reports
```

**Frontend Configuration:**
Create `frontend/.env.local` or `frontend/.env`:
```env
VITE_API_URL=http://localhost:5000
```

**Python Worker Configuration:**
Create `python_worker/.env`:
```env
DATABASE_URL=postgresql://postgres:postgres@localhost:5435/pharos_db
RABBITMQ_URL=amqp://pharos:pharos123@localhost:5672
REPORTS_DIR=../backend/reports
```

---

### Step 3: Start Docker Infrastructure

```bash
# In repo root:
docker compose up -d

# Check status:
docker compose ps
```
*Wait 15–20 seconds until `db`, `rabbitmq`, and `redis` containers show as healthy.*

---

### Step 4: Initialise Backend Database

```bash
cd backend
npm install

# 1. Run all 11 database migrations
npm run db:migrate

# 2. Seed basic reference and workflow configurations
npm run db:seed

# 3. Load full reference lookups from Menu_Tables.xlsx
npm run load-ref

# 4. Sync workflow transitions and dynamic form fields
npm run sync-config

# 5. Populate initial demo records
npm run seed:test-data
```

---

### Step 5: Run Application Services

Open three terminal windows:

**Terminal 1 — Backend API:**
```bash
cd backend
npm run dev
# Starts on http://localhost:5000
```

**Terminal 2 — Frontend SPA:**
```bash
cd frontend
npm install
npm run dev
# Starts on http://localhost:5173
```

**Terminal 3 — Python Worker (Optional in Dev):**
```bash
cd python_worker
pip install -r requirements.txt
python main.py
```
*(Note: If RabbitMQ is not running, the Node.js API automatically falls back to an in-memory event bus. Python worker is only required for async Daily Diary jobs).*

---

## 3. Verify Setup

1. Open **[http://localhost:5173](http://localhost:5173)** in your browser.
2. Log in using one of the pre-seeded accounts:

| Role | Username | Password | Purpose |
|---|---|---|---|
| **System Admin** | `admin` | `admin123` | Full admin, hierarchy, audit, field registry |
| **Head Constable (PS)** | `HC001` | `password123` | Create & submit daily FIR / arrest / PCR records |
| **Station House Officer** | `SHO001` | `password123` | Review station queue, approve/send-back, IO management |
| **District Officer (DCP)** | `DCP001` | `password123` | District review, station comparison, compilation |
| **HQ Analyst** | `HQ001` | `password123` | PHQ diary generation, analytics dashboards |

3. Verify Health Check:
   - Run `curl http://localhost:5000/api/health`
   - Should return `{ "success": true, "message": "PHAROS API is running" }`

---

## 4. Useful Management Commands

```bash
# Verify audit chain integrity across all police stations
cd backend && npm run audit:verify

# Reset and re-migrate the entire database from scratch
cd backend && npm run db:reset

# Backfill beat-to-PS linkage
cd backend && node scripts/backfill-beats-ps-id.mjs

# Replay import corpus parity tests
cd backend && npm run import:corpus

# Clear backend logs
cd backend && npm run logs:clear

# Open RabbitMQ Management Web Console
# http://localhost:15672 (User: guest / Password: guest)
```

---

## 5. Troubleshooting Common Issues

### Issue 1: `ECONNREFUSED 127.0.0.1:5432`
- **Cause:** Using standard port 5432 instead of mapped port 5435.
- **Fix:** Update `DATABASE_URL` in `backend/.env` to use port `5435` (`localhost:5435/pharos_db`).

### Issue 2: `Knex: Timeout acquiring a connection`
- **Cause:** Docker database container is not running or still initializing.
- **Fix:** Run `docker compose ps` to ensure container is healthy. Restart with `docker compose restart db`.

### Issue 3: Frontend Shows Blank Page / Network Error
- **Cause:** `VITE_API_URL` mismatch or CORS issue.
- **Fix:** Verify `VITE_API_URL=http://localhost:5000` in `frontend/.env.local` and check that backend is listening on port 5000.

### Issue 4: Python Worker Fails to Connect to RabbitMQ
- **Cause:** RabbitMQ container not ready.
- **Fix:** The worker retries 10 times with 5s delay. In development, Node.js uses in-memory events if RabbitMQ is stopped, allowing local dev to proceed without the worker.
