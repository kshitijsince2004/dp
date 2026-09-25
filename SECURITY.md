# Security Architecture & Hardening Guide (SECURITY.md)

## Security Architecture Overview

The **PHAROS Delhi Police Platform** implements a multi-layered security model protecting criminal diary records, intelligence analytics, and administrative operations:

- **Authentication Layer**: JWT (JSON Web Token) bearer tokens verified via local cryptographic signatures or optional Keycloak OAuth2 / OpenID Connect integration.
- **Authorization & Access Control**: Multi-tier Role-Based Access Control (`SYSTEM_ADMIN`, `HQ_ADMIN`, `DISTRICT_OFFICER`, `SHO`, `HC`) combined with dynamic geographic jurisdiction scoping (`station_id`, `district_id`).
- **Transport Security**: CORS origin allowlisting, Express rate limiters, Helmet HTTP security headers, and CSRF double-submit token protection.
- **Audit & Cryptographic Non-Repudiation**: SHA-256 hash-chained audit log with automated periodic verification and anomaly-based record freezing.
- **Process Isolation**: DB connection parameters passed strictly via process environment variables (`env`) rather than process command-line arguments.

---

## Authentication Model

1. **Access Tokens**: Short-lived JWTs (default `15m`) signed with `JWT_SECRET`. Tokens carry user identification (`sub`), role (`role`), and jurisdiction parameters (`ps_id`, `district_id`).
2. **Refresh Tokens**: Longer-lived tokens (default `7d`) stored in database table `refresh_tokens` or Redis cache. Revoked immediately on logout or password change.
3. **Password Security**: Passwords hashed using `bcryptjs` with salt rounds (10+). Direct plaintext or weak hashes are strictly prohibited.
4. **Keycloak Integration**: Optional Keycloak OAuth2 integration enabled when `KEYCLOAK_URL` is set in environment.

---

## Authorization & Jurisdiction Rules

- **Head Constable (HC)**: Can create/edit assigned drafts and view police station records. Cannot approve workflow transitions or perform system admin operations.
- **Station House Officer (SHO)**: Approves or sends back station records; manages station-level IO assignments and user password resets within station scope.
- **District Officer / ACP / DCP**: Accesses district-wide analytics and compiled daily diaries across station jurisdictions.
- **HQ Admin / System Admin**: Manages global field registries, system-wide hierarchy nodes, audit chain verification, and system user provisioning.

---

## Environment Variables & Secret Management

### Required Production Environment Variables
| Variable | Description | Security Requirement |
| :--- | :--- | :--- |
| `JWT_SECRET` | Secret key for access token signing | Mandatory in production (server throws fatal error if unconfigured) |
| `JWT_REFRESH_SECRET` | Secret key for refresh token signing | Mandatory in production |
| `DATABASE_URL` | PostgreSQL connection string | Must use SSL in production (`sslmode=require`) |
| `FRONTEND_URL` | Approved frontend origin for CORS | Strict single origin domain |
| `ENFORCE_INTRANET` | Restricts access to internal IP subnets | Set `true` for police intranet deployments |

### Credential Rotation Guidance
If a secret or DB credential is compromised:
1. Immediately rotate the credential in environment variable stores (Vault / Kubernetes Secrets / `.env`).
2. Revoke all active user refresh tokens in the database/Redis cache.
3. Restart backend service instances to apply new secrets.

---

## CORS & Security Headers Policy

- **CORS**: Enforces origin verification in [`app.js`](file:///d:/DPI/FIR/pharos-prototype/backend/src/app.js). Allows localhost/127.0.0.1 origins in `development` mode only. Production rejects all origins not matching `FRONTEND_URL`.
- **Security Headers**: Managed by `helmet()` middleware:
  - `X-Content-Type-Options: nosniff`
  - `X-Frame-Options: SAMEORIGIN` / `DENY`
  - `Strict-Transport-Security: max-age=31536000` (production)
  - `Referrer-Policy: no-referrer-when-downgrade`

---

## Rate Limiting & Abuse Prevention

- **API Rate Limiter**: `100` requests per 15-minute window for standard IP addresses.
- **Auth Endpoint Limiter**: `50` requests per 15-minute window on `/api/v1/auth/*` endpoints to prevent brute-force attacks.
- **Role-Based Limiter**: [`roleRateLimitMiddleware`](file:///d:/DPI/FIR/pharos-prototype/backend/src/middleware/security.middleware.js) applies per-user sliding window limits based on role permissions (`SYSTEM_ADMIN: 50/min`, `HC: 200/min`, `HQ_ADMIN: 300/min`).

---

## Known Risks & Future Hardening Recommendations

1. **Intranet IP Spoofing Risk**: When running behind a reverse proxy (Nginx/HAProxy), ensure `X-Forwarded-For` header overwrite rules are configured on the proxy so clients cannot spoof internal IP subnets.
2. **Session Revocation Sync**: Redis instance recommended for multi-node deployments to synchronize real-time token invalidation across process clusters.
3. **Database Role Privileges**: Recommend configuring PostgreSQL role `pharos_report_ro` with strict read-only permissions (`SELECT`) for reporting workers.
