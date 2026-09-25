# PHAROS: SuperTokens Auth + RBAC Migration — Implementation Guide

This delivers a full backend + frontend replacement of the custom JWT auth with SuperTokens, and moves RBAC onto SuperTokens UserRoles driven by a central permission catalog. It was implemented against the actual codebase; every changed JavaScript file passes `node --check`.

**Decisions this build implements (as agreed):**
- SuperTokens **Session + UserRoles** recipes, self-hosted Core via docker-compose.
- **Badge login kept**: credentials still verified against the existing `users` table with bcrypt; SuperTokens then issues the session. No user-store migration, no email required.
- **RBAC handled by SuperTokens**: roles and permissions are seeded into the Core from a single catalog; the session carries the role and permission claims.
- **Header/bearer transfer** (the closest 1:1 replacement for the old localStorage JWT).
- **Full backend + frontend in one pass**, including the ProtectedRoute enforcement fix.

The guiding tactic: the four authorization primitives keep their exact names and signatures (`authMiddleware`, `enforceScope`, `allow`/`requireRole`, `verifyRecordAccess`), so none of the ~200 call sites or 20 routers changed. Only their internals were swapped to SuperTokens.

---

## 1. What changed (24 files, +645 / -655)

**New**
- `backend/src/config/supertokens.js` — SuperTokens init (Session + UserRoles, header transfer, appInfo, apiBasePath `/api/v1/auth`).
- `backend/src/modules/auth/rbac.catalog.js` — the permission catalog: 9 roles, ~30 permissions, role to permission map, `canonicalRole` (folds `DISTRICT` into `DISTRICT_OFFICER`).
- `backend/src/modules/auth/rbac.seed.js` — seeds roles + permissions into the Core and assigns each user's role at startup (idempotent, best-effort).
- `frontend/src/config/supertokens.js` — SuperTokens web SDK init (header transfer).

**Backend modified**
- `app.js` — mounts SuperTokens `middleware()` (before the app's CSRF, so its own routes bypass it), `errorHandler()` (before the global handler, so refresh works), CORS now exposes/accepts the SuperTokens headers, and `initSuperTokens()` runs at load.
- `index.js` — runs the RBAC seed after the DB connects.
- `config/env.js` — adds `SUPERTOKENS_CONNECTION_URI`, `SUPERTOKENS_API_KEY`, `API_DOMAIN`, `WEBSITE_DOMAIN`; the old production JWT-secret guard is replaced by a Core-connection guard. JWT_* kept as inert to avoid import breaks.
- `middleware/auth.middleware.js` — `authMiddleware` now runs SuperTokens `verifySession` then rebuilds `req.user` from the session payload (same shape + camel aliases as before). `sseAuthMiddleware` verifies the access token from `?token=` via `getSessionWithoutRequestResponse`. Keycloak removed.
- `middleware/rbac.middleware.js` — `allow`/`requireRole`/`enforceScope`/`verifyRecordAccess` unchanged in behavior (now canonicalise `DISTRICT`); new `requirePermission(...perms)` reads the SuperTokens `st-perm` claim (falls back to the catalog).
- `modules/auth/auth.service.js` — reduced to `verifyCredentials` + `resolveScope`. Token issuing, Redis refresh store, and `refreshUserToken`/`logoutUser` removed (SuperTokens owns sessions).
- `modules/auth/auth.controller.js` — `login` verifies then `Session.createNewSession` with role + level + scope in the access-token payload and attaches the role in the Core; `logout` revokes the session; `changePassword` revokes all sessions; custom `refresh` removed.
- `modules/auth/auth.router.js` — custom `/refresh` route removed (SuperTokens serves `/api/v1/auth/session/refresh`).
- `modules/users/users.controller.js` — `resetPassword` now revokes the target user's SuperTokens sessions.
- `utils/generateToken.js` — trimmed to `ROLE_LEVELS` + `getLevelFromRole` + `buildAccessPayload` (JWT sign/verify removed).
- `package.json` — adds `supertokens-node`, removes dead `keycloak-connect`.
- `docker-compose.yml` — adds the self-hosted SuperTokens Core service.
- `.env.example` — SuperTokens variables.

**Frontend modified**
- `main.jsx` — initialises the SuperTokens web SDK before render.
- `utils/api.js` — `Session.addAxiosInterceptors(api)` for auth header + auto-refresh; removed the manual localStorage bearer attach and the manual 401 refresh queue.
- `store/authStore.js` — logout no longer touches localStorage tokens.
- `hooks/useAuth.js` — login relies on the session from response headers (no manual token storage); logout calls `Session.signOut()`.
- `hooks/useNotifications.js` — SSE and REST now use `Session.getAccessToken()` instead of a localStorage token.
- `routes/ProtectedRoute.jsx` — **the commented-out enforcement is fixed**: it now confirms a live SuperTokens session and enforces the role list, with a spinner while identity loads (no flash redirect).
- `package.json` — adds `supertokens-web-js`.

---

## 2. How to apply

Two options. Both assume you branch first.

**Option A, unified patch** (from the repo root `Crime-Diaries-collab-Vaibhav/`):
```
git checkout -b feat/supertokens-rbac
git apply --whitespace=nowarn SUPERTOKENS_RBAC_MIGRATION.patch
```

**Option B, changed-files bundle:** unzip `supertokens-rbac-changed-files.zip` over the repo root; it preserves paths and overwrites exactly the 24 files.

Then install and run (section 3).

---

## 3. Run it

1. **Install dependencies**
   ```
   cd backend  && npm install        # pulls supertokens-node
   cd ../frontend && npm install      # pulls supertokens-web-js
   ```
2. **Start infrastructure incl. the SuperTokens Core**
   ```
   docker compose up -d               # postgres, rabbitmq, redis, supertokens
   ```
   The Core connects to the same PostgreSQL and creates its own tables (`session_info`, `roles`, `user_roles`, `role_permissions`, ...), which do not collide with the app schema. Use a separate database in `POSTGRESQL_CONNECTION_URI` if you prefer isolation.
3. **Environment** (`backend/.env`), matching your ports:
   ```
   SUPERTOKENS_CONNECTION_URI=http://localhost:3567
   SUPERTOKENS_API_KEY=                # set only if the Core has API_KEYS
   API_DOMAIN=http://localhost:5000
   WEBSITE_DOMAIN=http://localhost:5173
   ```
   Frontend (`frontend/.env`): `VITE_API_URL=http://localhost:5000/api` (this also fixes the pre-existing port mismatch noted in the audit; the SuperTokens web SDK derives its domain from it).
4. **Migrate + seed the app DB** (unchanged): `cd backend && npm run db:migrate && npm run db:seed`.
5. **Start** backend and frontend. On boot, `seedRbac()` syncs the role + permission catalog into the Core and attaches each user's role. Existing seed users (HC001, SHO001, DO001, HQ001, HQ002, SA001) log in with their existing passwords, and their bcrypt hashes are untouched.

Ordering note: the RBAC seed is best-effort and idempotent. If the Core is still booting on the very first `npm run dev`, the seed logs a warning and retries next boot; login still works because the role also travels in the session payload, and `login` attaches the role on demand.

---

## 4. How auth works now

- **Login** `POST /api/v1/auth/login` with `{ badgeNo, password }` (email/username also accepted, as before). Verified against `users` + bcrypt, then `Session.createNewSession` issues the session. The access-token payload carries `role, level, ps_id, district_id, sub_div_id, badge_no, username`.
- **Session tokens** travel as bearer/header tokens the SDK manages. The axios interceptors attach and refresh them automatically.
- **Refresh** is automatic at `POST /api/v1/auth/session/refresh` (mounted by SuperTokens). The old `/auth/refresh` is gone.
- **Logout** `POST /api/v1/auth/logout` (or the SDK's `signOut` -> `/api/v1/auth/signout`) revokes the session.
- **Identity** `GET /api/v1/auth/me` is unchanged in shape.
- **SSE** passes the current access token as `?token=`; the backend verifies it without req/res.

---

## 5. How RBAC works now

- Roles and permissions live in SuperTokens UserRoles, seeded from `rbac.catalog.js` (the single source of truth). Changing who can do what is a catalog edit plus a seed re-run, not scattered code edits.
- A session carries the user's role (payload) and the `st-role` / `st-perm` claims.
- `allow(...roles)` / `requireRole(...roles)` still gate by role (now sourced from the verified session), so every existing route works unchanged.
- `requirePermission(...perms)` is the new, preferred gate for new routes: it checks the permission claim, falling back to the catalog.
- **Jurisdiction scope is deliberately still app-managed**: `enforceScope` and `verifyRecordAccess` read ps/sub-div/district off `req.user` exactly as before, because geography is not a role capability. The `DISTRICT` token is now consistently folded into `DISTRICT_OFFICER`.
- Per-transition workflow rights remain in `config/workflow/main.json` `allowed_roles`, unchanged.

To retune permissions: edit `ROLE_PERMISSIONS` in `rbac.catalog.js`, restart (the seed re-syncs), and use `requirePermission` on any route you want permission-gated rather than role-gated.

---

## 6. Verification checklist

- Log in as each seed role; confirm a session is issued and `/me` returns the right role + scope.
- Let an access token expire; confirm the SDK auto-refreshes (no forced logout) and a truly revoked session redirects to login.
- Confirm scope still holds: an HC cannot read another PS's records; a DISTRICT_OFFICER is bounded to their district; JCP/SCP/HQ read globally.
- Confirm the workflow chain still gates by role (submit, approve, jcp-approve, scp-approve, seal, send-back).
- Confirm `changePassword` and admin `resetPassword` force re-login (sessions revoked).
- Confirm SSE notifications connect with the new token.
- Confirm ProtectedRoute now redirects an unauthenticated browser to `/login` and blocks wrong-role pages.
- Backend boots and `seedRbac` logs the role sync; the Core `/hello` healthcheck passes.

---

## 7. Rollback

`git checkout main` (or `git apply -R SUPERTOKENS_RBAC_MIGRATION.patch`), then `docker compose stop supertokens`. The `users` table and password hashes were never modified, so reverting is clean.

---

## 8. Notes and follow-ups (not blockers)

- `jsonwebtoken` is intentionally kept: `logs.controller.js` still best-effort decodes a bearer token to attach a userId, and a SuperTokens access token is a JWT with `sub`, so that keeps working.
- `ioredis` is no longer used by auth (SuperTokens owns sessions). Left installed in case other infra wants Redis; safe to remove if unused elsewhere.
- `frontend/src/api/auth.api.js` still exposes `refresh` and `register` helpers that now have no backend endpoint (refresh is automatic, registration never existed server-side). They are dead and can be deleted; nothing calls `refresh`, and the orphan RegisterPage was already flagged in the audit.
- `contexts/AuthContext.jsx` is a passive, now-inert legacy provider (no mount effect, no consumer on the live path). Safe to remove in a later cleanup.
- The dev login backdoor and dev badge aliases are preserved but still gated to `NODE_ENV=development`; run production mode to disable them.
- Production: set `API_KEYS` on the Core and `SUPERTOKENS_API_KEY` on the backend, and serve over HTTPS with the real `API_DOMAIN`/`WEBSITE_DOMAIN`.

*Deliverables: this guide, `SUPERTOKENS_RBAC_MIGRATION.patch` (unified diff), and `supertokens-rbac-changed-files.zip` (the 24 files with paths).*
