# PHAROS — Dependencies Documentation
**Version:** 1.0 | **Date:** 2026-08-18 | **Audience:** DevOps, security engineers, developers

---

## 1. Runtime Infrastructure

| Service | Image / Version | Port (Host / Container) | Purpose | Config / Credentials |
|---|---|---|---|---|
| **PostgreSQL** | `postgres:16-alpine` | `5435:5432` | Primary relational store (public & ref schemas) | `POSTGRES_USER=postgres`, `POSTGRES_DB=pharos_db`, volume: `pgdata` |
| **RabbitMQ** | `rabbitmq:3-management` | `5672:5672`, `15672:15672` | Topic message broker (`pharos` exchange) | `RABBITMQ_DEFAULT_USER=pharos`, `RABBITMQ_DEFAULT_PASS=pharos123` |
| **Redis** | `redis:7-alpine` | `6379:6379` | Session cache, rate limit store | Default port |

---

## 2. Backend Dependencies (`backend/package.json`)

**Runtime:** Node.js 20+ (ESM modules: `"type": "module"`)

| Package | Version | Purpose | Critical? | Notes |
|---|---|---|---|---|
| `express` | `^4.19.2` | Core web server & HTTP routing | **YES** | Foundation of the REST API |
| `knex` | `^3.1.0` | SQL query builder & migration engine | **YES** | Schema migrations and transactional queries |
| `pg` | `^8.11.5` | PostgreSQL client driver | **YES** | Connection pool for Knex |
| `jsonwebtoken` | `^9.0.3` | JWT sign & verify | **YES** | 15-minute access token generation and auth middleware |
| `bcryptjs` | `^2.4.3` | Password hashing & comparison | **YES** | User password encryption (10 salt rounds) |
| `amqplib` | `^0.10.4` | RabbitMQ AMQP client | **YES** | Publishing async report & notification events |
| `ioredis` | `^5.11.1` | Redis cache client | **YES** | High-performance Redis connection |
| `exceljs` | `^3.4.0` | Excel workbook generation & injection | **YES** | Fortnightly & PHQ Diary cell-by-cell spreadsheet rendering |
| `multer` | `^2.2.0` | Multipart file upload middleware | **YES** | Bulk Excel import file ingestion |
| `helmet` | `^7.2.0` | HTTP security headers | **YES** | CSP, HSTS, X-Frame-Options |
| `cors` | `^2.8.6` | Cross-Origin Resource Sharing | **YES** | Configured with `FRONTEND_URL` allowlist |
| `winston` | `^3.19.0` | Structured JSON logger | **YES** | Application, error, and audit logging |
| `morgan` | `^1.10.0` | HTTP request logging | **YES** | Streamed through Winston |
| `express-validator` | `^7.3.2` | Request validation middleware | **YES** | Input sanity checks |
| `express-rate-limit` | `^7.5.1` | IP-based request rate limiting | **YES** | 100 req/15min general; 50 req/15min auth |
| `cookie-parser` | `^1.4.7` | Cookie parsing middleware | **YES** | HttpOnly refresh token cookie extraction |
| `dotenv` | `^16.4.5` | Environment variable loader | **YES** | Loads `.env` file |
| `node-cron` | `^4.2.1` | In-process scheduled task runner | **YES** | Automated diary generation schedules |
| `uuid` | `^14.0.0` | UUID v4 generation | **YES** | Entity primary keys and trace IDs |
| `slugify` | `^1.6.9` | String slug generation | NO | Utility |
| `i18n-nationality` | `^1.4.0` | Nationality lookup | NO | Country code resolver |
| `keycloak-connect` | `^26.1.1` | Keycloak SSO adapter | NO | Present for enterprise SSO; currently inactive (JWT mode active) |
| `puppeteer` | `^25.1.0` | Headless Chrome PDF generation | NO | Installed for server-side PDF exports (untested) |
| `mongoose` | `^9.7.0` | MongoDB ODM | **NO (UNUSED)** | Legacy dependency — PHAROS runs entirely on PostgreSQL |

**Dev Dependencies:**
- `nodemon`: `^3.1.0` (Development server reloading)
- `supertest`: `^7.2.2` (HTTP integration testing)
- `axios`: `^1.18.0` (Script test execution)

---

## 3. Frontend Dependencies (`frontend/package.json`)

**Runtime:** Modern Browser (ES2022+), Built with Vite 8

| Package | Version | Purpose |
|---|---|---|
| `react` | `^19.2.6` | Core UI library |
| `react-dom` | `^19.2.6` | React DOM renderer |
| `react-router-dom` | `^7.17.0` | Client-side routing and protected route wrappers |
| `antd` | `^5.17.0` | Enterprise UI component system |
| `@ant-design/icons` | `^5.3.7` | Ant Design SVG icon suite |
| `@tanstack/react-query` | `^5.101.0` | Server state management, auto-caching & background refetch |
| `@tanstack/react-query-devtools` | `^5.101.0` | React Query debugging panel |
| `zustand` | `^5.0.14` | Global authentication state store |
| `tailwindcss` | `^4.3.1` | Utility-first CSS styling engine |
| `@tailwindcss/vite` | `^4.3.1` | Vite plugin for Tailwind v4 compilation |
| `axios` | `^1.17.0` | HTTP client with request/response interceptors for JWT |
| `recharts` | `^3.8.1` | Charting library for analytics dashboards |
| `framer-motion` | `^12.40.0` | Smooth UI micro-animations and route transitions |
| `react-hook-form` | `^7.79.0` | Form state management |
| `zod` | `^4.4.3` | Schema validation |
| `@hookform/resolvers` | `^5.4.0` | Zod resolver adapter for React Hook Form |
| `i18next` | `^26.3.1` | Internationalization framework |
| `react-i18next` | `^17.0.8` | React bindings for i18n (English & Hindi support) |
| `i18next-browser-languagedetector` | `^8.2.1` | User locale detector |
| `lucide-react` | `^0.469.0` | Lucide icon suite |
| `react-hot-toast` | `^2.6.0` | Toast notifications |
| `dayjs` | `^1.11.21` | Lightweight date manipulation |
| `date-fns` | `^4.4.0` | Date utility functions |
| `jwt-decode` | `^4.0.0` | Client-side JWT payload decoding |
| `clsx` | `^2.1.1` | Conditional classname utility |

---

## 4. Python Worker Dependencies (`python_worker/requirements.txt`)

**Runtime:** Python 3.10+

| Package | Version | Purpose |
|---|---|---|
| `pika` | `>=1.3.2` | AMQP client for RabbitMQ event consumption |
| `SQLAlchemy` | `>=2.0.36` | Read-only SQL connection and query mapper |
| `psycopg2-binary` | `>=2.9.10` | PostgreSQL binary driver |
| `pandas` | `>=2.2.2` | Tabular data manipulation and aggregation |
| `openpyxl` | `>=3.1.2` | Excel (.xlsx) file generation for Daily Diary |
| `python-dotenv` | `>=1.0.1` | Environment variable loader |
| `weasyprint` | `>=62.3` | HTML/CSS to PDF rendering engine |

---

## 5. Dependency Audit & Upgrade Considerations

1. **`mongoose` in backend**:
   - `mongoose` is listed in `backend/package.json` but never imported or initialized. PHAROS uses Knex and PostgreSQL.
   - *Recommendation:* Remove `mongoose` from `backend/package.json` to reduce install size.
2. **Dual Date Libraries in Frontend**:
   - Both `dayjs` and `date-fns` are present in `frontend/package.json`.
   - *Recommendation:* Standardize on `date-fns` or `dayjs` in future refactorings.
3. **Puppeteer vs WeasyPrint**:
   - Node.js backend includes `puppeteer` (heavyweight Chrome instance), while Python worker uses `weasyprint`.
   - *Recommendation:* Standardize async PDF generation through the Python worker (`weasyprint`) to keep the Node.js API lightweight.
4. **License Summary**:
   - All core runtime packages (Express, Knex, React, Ant Design, Tailwind, Vite, SQLAlchemy, OpenPyXL) use permissive open-source licenses (MIT, Apache 2.0, BSD-3-Clause).
