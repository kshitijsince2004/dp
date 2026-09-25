# PHAROS System — Dev1 Module Integration & Architecture Guide

Welcome to the PHAROS (Police Hierarchical Automated Reporting & Operations System) Dev1 package documentation. This guide details the backend architecture, data schemas, API routes, event-driven ledger, and integration guidelines to enable seamless co-development.

---

## 1. System Architecture Overview

The backend uses a modular monolithic architecture built on **Express.js**, **Knex (SQLite3 / PostgreSQL)**, **Redis**, and **RabbitMQ**.

```mermaid
graph TD
    Client[Client App / Postman] -->|HTTP / HTTPS| Express[Express.js App]
    
    subgraph Express Backend
        Express --> AuthMW[Auth & RBAC Middleware]
        AuthMW --> Modules[Core Modules: Auth, Users, Hierarchy, Reports]
        Modules --> DB[(Database: SQLite/PG)]
        Modules --> Redis[(Redis Token Store)]
        Modules -->|Event Publisher| EB[EventBus: RabbitMQ / In-Memory fallback]
    end

    subgraph Event Consumers
        EB -->|record.*| Audit[Audit Handler / Revisions Ledger]
        EB -->|record.submitted/approved| Notify[Notifications Handler]
    end

    subgraph Reports Generation
        Modules -->|Queue Job| Worker[Async Puppeteer / CSV Generator]
        Worker -->|PDF/CSV| ReportsDir[Generated Reports Storage]
    end
```

---

## 2. Authentication & Role-Based Access Control (RBAC)

### 2.1 Token-Based Session Lifecycle
- **Access Tokens:** Signed using `JWT_SECRET` (Expires in `1h`).
- **Refresh Tokens:** Signed using `JWT_REFRESH_SECRET` (Expires in `7d`). Stored in Redis under the key `refresh:{userId}`.
- **Deactivation/Logouts:** Logging out or changing a password invalidates the refresh token in Redis immediately.

### 2.2 Dual Format Properties
To maintain full compatibility between modules using snake_case and camelCase parameters, **all authentication responses and JWT payloads return attributes in both formats**:
```json
{
  "userId": "U_HC001",
  "id": "U_HC001",
  "badgeNo": "HC001",
  "badge_no": "HC001",
  "role": "HC",
  "psId": "PS_ANOK_VIHAR",
  "ps_id": "PS_ANOK_VIHAR",
  "districtId": "DIST_NORTH_WEST",
  "district_id": "DIST_NORTH_WEST",
  "level": "PS"
}
```

### 2.3 Role Hierarchy and Scoping
The system defines 6 functional roles with specific geographic hierarchies:

| Role | Weight | Geographic Level | Description |
| :--- | :--- | :--- | :--- |
| `HC` (Head Constable) | 10 | Police Station (`PS`) | Data Entry, Draft Creation |
| `SHO` (Station House Officer) | 20 | Police Station (`PS`) | Review & Finalize PS Submissions |
| `DISTRICT_OFFICER` (DCP/HQ) | 30 | District (`DISTRICT`) | District Review, Stats & Reclassifications |
| `HQ_ANALYST` (HQ Analyst) | 40 | Headquarter (`HQ`) | System-Wide Read-Only Reports & Analytics |
| `HQ_ADMIN` (HQ Administrator) | 50 | Headquarter (`HQ`) | System-Wide Configuration & Operations |
| `SYSTEM_ADMIN` (System Admin) | 60 | Global | Users CRUD, Node CRUD, Full Override Access |

---

## 3. Database Schema Overview

We operate on a predefined schema. Key relationships include:
- `users`: Contains columns `id`, `badge_no`, `role`, `station_id` (foreign key to `hierarchy_nodes`), `district_id` (foreign key to `hierarchy_nodes`), `password_hash`, `is_active`, `last_login`, `created_at`, `updated_at`.
- `hierarchy_nodes`: Represents the organizational hierarchy. Columns: `id`, `parent_id` (recursive key), `name_en`, `name_hi`, `type` (`DISTRICT`, `SUB_DIVISION`, `POLICE_STATION`), `is_active`.
- `record_revisions`: Append-only ledger recording every change. Columns: `id`, `record_id`, `changed_by` (operator user id), `revision_number`, `revision_type` (`CREATE`, `UPDATE`, `SUBMIT`, `APPROVE`, `HEAD_OVERRIDE`), `data_snapshot` (entire JSON payload), `created_at`.
- `report_jobs`: Manages PDF/CSV report generation queues. Columns: `id`, `template_id`, `format`, `status` (`PENDING`, `READY`, `FAILED`), `filepath`, `error_message`, `created_at`, `updated_at` (used as `completed_at`).

---

## 4. API Endpoint Registry

All endpoints are prefixed with `/api/v1`.

### 4.1 Auth Modules
- `POST /auth/login`
  - Body: `{"badge_no": "HC001", "password": "..."}` or `{"badgeNo": "HC001", "password": "..."}`
  - Returns access & refresh tokens along with user info.
- `POST /auth/refresh`
  - Body: `{"refresh_token": "..."}` or `{"refreshToken": "..."}`
- `GET /auth/me` [Requires Auth]
  - Returns profile information, joining with `hierarchy_nodes` to include station and district English/Hindi names.
- `POST /auth/change-password` [Requires Auth]
  - Body: `{"oldPassword": "...", "newPassword": "..."}` or `{"old_password": "...", "new_password": "..."}`

### 4.2 Users Module
- `GET /users` [Requires `DISTRICT+` roles]
  - Query Params: `page`, `limit`, `role`, `ps_id`/`psId`, `district_id`/`districtId`.
- `POST /users` [Requires `SYSTEM_ADMIN`]
  - Creates a new user (bcrypt 12-round password hashing).
- `PUT /users/:id` [Requires `SYSTEM_ADMIN`]
- `DELETE /users/:id` [Requires `SYSTEM_ADMIN`]
  - Soft-deletes user by setting `is_active = false`.
- `POST /users/:id/reset-password` [Requires `SYSTEM_ADMIN`]

### 4.3 Hierarchy Nodes
- `GET /hierarchy/tree` [Requires Auth]
  - Returns the recursive organizational chart of nodes.
- `GET /hierarchy/nodes` [Requires Auth]
- `POST /hierarchy/nodes` [Requires `SYSTEM_ADMIN`]
- `PUT /hierarchy/nodes/:id` [Requires `SYSTEM_ADMIN`]
- `DELETE /hierarchy/nodes/:id` [Requires `SYSTEM_ADMIN`]

### 4.4 Audit Revision Ledger
- `GET /audit/record/:recordId` [Requires Auth]
  - Returns chronological history of revisions for a record, including operator badge number and English name.
- `GET /audit/user/:userId` [Requires `DISTRICT+`]
  - Returns chronological revisions performed by a specific user (paginated).

### 4.5 Reports Engine
- `GET /reports/templates` [Requires Auth]
  - Lists the 5 standard report layouts (`arrest-summary`, `pcr-call-log`, `cases-register`, `daily-status`, `district-compilation`).
- `POST /reports/generate` [Requires Auth]
  - Queues an asynchronous report generation job.
  - Body: `{"template_id": "arrest-summary", "format": "pdf", "filters": { "psId": "...", "from": "...", "to": "..." }}`
  - Returns: `{"status": "success", "data": { "job_id": "..." }}`
- `GET /reports/status/:jobId` [Requires Auth]
  - Poll status of reports (`PENDING`, `READY`, or `FAILED`).
- `GET /reports/download/:jobId` [Requires Auth]
  - Streams the generated report binary to client.
- `GET /admin/stats` [Requires `HQ_ANALYST+` or `SYSTEM_ADMIN`]
  - Returns database stats summaries (total users, total stations, active records, system load).

---

## 5. How to Integrate Your Code (For Team Members)

### 5.1 Protecting Your Routes with Auth & RBAC
You can import the authentication and role middleware from the shared files in `src/middleware/`.

```javascript
import { requireAuth } from '../../middleware/auth.middleware.js';
import { requireRole } from '../../middleware/rbac.middleware.js';
import express from 'express';

const router = express.Router();

// 1. All routes inside this router require a valid Bearer JWT
router.use(requireAuth());

// 2. Protect a specific route so only SYSTEM_ADMIN or HQ_ADMIN can access it
router.post('/settings', requireRole('SYSTEM_ADMIN', 'HQ_ADMIN'), (req, res) => {
  res.status(200).json({ success: true, message: 'Settings updated' });
});

// 3. User information is available under req.user
router.get('/my-location', (req, res) => {
  const { ps_id, role } = req.user;
  res.status(200).json({ ps_id, role });
});

export default router;
```

### 5.2 Triggering Automatic Audit Logs on Record Modifications
The ledger relies on RabbitMQ events. When you modify records, do **not** write to `record_revisions` manually. Instead, publish an event to the `EventBus`!

```javascript
import { publish } from '../../events/eventBus.js';

async function updateRecordDetails(recordId, updateData, userId) {
  // 1. Update the database details
  await db('records').where({ id: recordId }).update(updateData);
  
  // 2. Fetch updated record snapshot
  const updatedRecord = await db('records').where({ id: recordId }).first();

  // 3. Publish to the event bus
  // The Audit Ledger subscribes to "record.*" and will automatically write the version snapshot.
  await publish('record.updated', {
    record_id: recordId,
    changed_by: userId,
    data: updatedRecord.data // JSON payload data containing the record details
  });
}
```

Supported routing keys for the ledger consumer:
- `record.created`: Triggered when a new record draft is created.
- `record.updated`: Triggered when a record details snapshot is modified.
- `record.submitted`: Triggered when a record is submitted for SHO approval.
- `record.approved`: Triggered when a record is finalized by the SHO.
- `record.overridden`: Triggered when a District Officer overrides a classification.

---

## 6. How to Run & Verify

### 6.1 Docker Stack Initialization
Ensure your Docker Desktop is running, and spin up RabbitMQ and Redis:
```bash
docker compose up -d
```
This starts:
- **Redis:** `redis://localhost:6379` (Session store / token blacklist)
- **RabbitMQ:** `amqp://pharos:pharos123@localhost:5672` (Routing and messaging queues, admin console on port `15672`)

### 6.2 Setup and Launch Server
1. Navigate to the backend directory:
   ```bash
   cd backend
   ```
2. Install dependencies:
   ```bash
   npm install
   ```
3. Run the development server:
   ```bash
   npm run dev
   ```

### 6.3 Run Verification Checks
We provide automated test suites to ensure everything functions as specified in the PRD. Run them in another terminal context:
```bash
# Verify auth, validation structures, locking and overrides
npm test

# Verify Puppeteer report generation, downloads, and stats
node scripts/verify_reports.js
```
All outputs should show clean execution reports with 0 failing assertions.
