# PHAROS — Role-Based Access Control
**Version:** 1.0 | **Date:** 2026-08-18 | **Audience:** Security engineers, feature developers, QA

---

## 1. Roles

| Role Code | Display Name | Level | Description | Default Landing Page |
|---|---|---|---|---|
| `HC` | Head Constable | PS | Creates and submits all record types | `/records` |
| `SHO` | Station House Officer | PS | Reviews HC submissions; manages IOs | `/analytics` |
| `ACP` | Asst. Commissioner of Police | SUB_DIV | Sub-division oversight (workflow not yet configured) | `/queue` |
| `DISTRICT_OFFICER` | District Officer (DCP) | DISTRICT | District review; compilation | `/district` |
| `JCP` | Joint Commissioner of Police | JCP | Senior intermediate (not yet configured) | — |
| `SCP` | Special Commissioner of Police | SCP | Senior level (not yet configured) | — |
| `HQ_ANALYST` | HQ Crime Analyst | HQ | Read-only HQ access; diary generation | `/hq` |
| `HQ_ADMIN` | HQ Administrator | HQ | Platform management; sealing records | `/hq` |
| `SYSTEM_ADMIN` | System Administrator | GLOBAL | Full access | `/admin/users` |

---

## 2. Permission Matrix

### Records

| Action | HC | SHO | DISTRICT_OFFICER | HQ_ANALYST | HQ_ADMIN | SYSTEM_ADMIN |
|---|---|---|---|---|---|---|
| Create record | ✅ | ❌ | ❌ | ❌ | ❌ | ✅ |
| View own PS records | ✅ | ✅ | ✅ | ✅ | ✅ | ✅ |
| View own district records | ❌ | ❌ | ✅ | ✅ | ✅ | ✅ |
| View all records (HQ) | ❌ | ❌ | ❌ | ✅ | ✅ | ✅ |
| Edit DRAFT record | ✅ (own) | ❌ | ❌ | ❌ | ❌ | ✅ |
| Edit SENT_BACK record | ✅ (own) | ❌ | ❌ | ❌ | ❌ | ✅ |
| Delete DRAFT record | ✅ (own) | ❌ | ❌ | ❌ | ❌ | ✅ |
| Submit record | ✅ | ❌ | ❌ | ❌ | ❌ | ❌ |
| Approve / Forward | ❌ | ✅ | ✅ | ❌ | ❌ | ❌ |
| Send Back (reject) | ❌ | ✅ | ✅ | ❌ | ❌ | ❌ |
| Update domain status | ✅ | ✅ | ✅ | ❌ | ❌ | ❌ |
| Override crime head | ❌ | ❌ | ✅ | ❌ | ❌ | ❌ |
| Seal record (HQ) | ❌ | ❌ | ❌ | ❌ | ✅ | ❌ |
| Freeze / Unfreeze | ❌ | ❌ | ❌ | ❌ | ❌ | ✅ |

### Users

| Action | HC | SHO | DISTRICT_OFFICER | HQ_ANALYST | HQ_ADMIN | SYSTEM_ADMIN |
|---|---|---|---|---|---|---|
| List users | ❌ | ✅ (own PS) | ✅ (own district) | ✅ | ✅ | ✅ |
| Create HC user | ❌ | ✅ (own PS) | ❌ | ❌ | ❌ | ✅ |
| Create any user | ❌ | ❌ | ❌ | ❌ | ❌ | ✅ |
| Update user | ❌ | ✅ (own PS HC) | ❌ | ❌ | ❌ | ✅ |
| Delete user | ❌ | ✅ (own PS HC) | ❌ | ❌ | ❌ | ✅ |
| Reset password | ❌ | ✅ (own PS HC) | ❌ | ❌ | ❌ | ✅ |

### Admin

| Action | HC | SHO | DISTRICT_OFFICER | HQ_ANALYST | HQ_ADMIN | SYSTEM_ADMIN |
|---|---|---|---|---|---|---|
| Hierarchy management | ❌ | ❌ | ❌ | ❌ | ❌ | ✅ |
| Field registry management | ❌ | ❌ | ✅ | ❌ | ✅ | ✅ |
| Audit log browser | ❌ | ❌ | ✅ | ✅ | ✅ | ✅ |
| Audit chain verify | ❌ | ❌ | ❌ | ❌ | ❌ | ✅ |
| Level contracts | ❌ | ❌ | ❌ | ❌ | ❌ | ✅ |
| Admin stats | ❌ | ❌ | ❌ | ❌ | ✅ | ✅ |
| Report schedules | ❌ | ❌ | ❌ | ❌ | ✅ | ✅ |

### Import

| Action | HC | SHO | DISTRICT_OFFICER | HQ_ANALYST | HQ_ADMIN | SYSTEM_ADMIN |
|---|---|---|---|---|---|---|
| Download template | ✅ | ✅ | ✅ | ❌ | ❌ | ✅ |
| Validate batch | ✅ | ❌ | ✅ | ❌ | ❌ | ❌ |
| Confirm batch | ✅ | ❌ | ✅ | ❌ | ❌ | ❌ |
| Cancel batch | ✅ | ❌ | ✅ | ❌ | ❌ | ❌ |

### Diary & Analytics

| Action | HC | SHO | DISTRICT_OFFICER | HQ_ANALYST | HQ_ADMIN | SYSTEM_ADMIN |
|---|---|---|---|---|---|---|
| View PS analytics | ✅ | ✅ | ✅ | ✅ | ✅ | ✅ |
| View district analytics | ❌ | ❌ | ✅ | ✅ | ✅ | ✅ |
| View all analytics | ❌ | ❌ | ❌ | ✅ | ✅ | ✅ |
| Generate FN Diary | ✅ | ✅ | ✅ | ✅ | ✅ | ✅ |
| Generate PHQ Diary | ❌ | ❌ | ✅ | ✅ | ✅ | ✅ |
| Create compilation | ❌ | ❌ | ✅ | ❌ | ❌ | ❌ |
| Export analytics | ✅ | ✅ | ✅ | ✅ | ✅ | ✅ |

---

## 3. Data Scoping

Data scoping is enforced server-side by `enforceScope` middleware on every scoped endpoint. The frontend cannot bypass it.

| Role | Data Visible |
|---|---|
| `HC`, `SHO` | Records where `records.ps_id = user.ps_id` |
| `ACP` | Records where `records.district_id = user.district_id` (sub_div scope — partially implemented) |
| `DISTRICT_OFFICER` | Records where `records.district_id = user.district_id` |
| `JCP`, `SCP` | Same as DISTRICT for current implementation |
| `HQ_ANALYST`, `HQ_ADMIN`, `SYSTEM_ADMIN` | All records across all districts |

**Enforcement mechanism**: `enforceScope` reads `user.ps_id` and `user.district_id` from the JWT token (set at login) and injects a WHERE clause into every query. Cross-scope requests receive a `403 Forbidden`.

---

## 4. Implementation

### Backend: `allow()` Middleware

```javascript
// Example from records router:
router.post('/',
  authMiddleware,
  enforceScope,
  allow('HC'),          // Only HC can create records
  recordsController.create
);

router.post('/:id/approve',
  authMiddleware,
  enforceScope,
  allow('SHO', 'DISTRICT_OFFICER'),
  recordsController.approve
);
```

The `allow(...roles)` middleware factory:
1. Checks that `req.user` exists (authMiddleware has run)
2. Checks that `req.user.role` is in the allowed roles list
3. Returns `403` if not matched

### Backend: `enforceScope` Middleware

Appended to `req` as `req.scopeFilter` — a Knex WHERE clause snippet applied by service functions:
```javascript
// For HC/SHO: { ps_id: user.ps_id }
// For DISTRICT: { district_id: user.district_id }
// For HQ: {} (no filter — all records)
```

### Frontend: Route Guards

`ProtectedRoute` component wraps route groups. Unauthenticated users are redirected to `/login`. Roles not in the `roles` array are redirected to their role-appropriate home page.

```jsx
// Restrict admin routes:
<Route element={<ProtectedRoute roles={['SYSTEM_ADMIN', 'HQ_ADMIN']} />}>
  <Route path="/admin/hierarchy" element={<HierarchyManager />} />
</Route>
```

### Frontend: Navigation Visibility

Sidebar nav items filter by role from a static config array. Items not applicable to the logged-in user's role are hidden. This is UX-only — the backend is the real guard.

---

## 5. Known Gaps in Route Guards (as of August 2026)

The following gaps have been identified and partially addressed. Backend scoping prevents data leakage — these are UX issues only.

| Route | Required Roles | Status |
|---|---|---|
| `/admin/hierarchy` | `SYSTEM_ADMIN`, `HQ_ADMIN` | ✅ Fixed (Aug 2026) |
| `/admin/fields` | `SYSTEM_ADMIN`, `HQ_ADMIN`, `DISTRICT_OFFICER` | ✅ Fixed (Aug 2026) |
| `/admin/audit` | `SYSTEM_ADMIN`, `HQ_ADMIN`, `DISTRICT_OFFICER`, `HQ_ANALYST` | ✅ Fixed (Aug 2026) |
| `/admin/level-contracts` | `SYSTEM_ADMIN`, `HQ_ADMIN` | ✅ Fixed (Aug 2026) |
| `/compile` | `DISTRICT`, `DISTRICT_OFFICER`, `HQ_ANALYST`, `HQ_ADMIN`, `SYSTEM_ADMIN` | ✅ Fixed (Aug 2026) |
| `/district` | `DISTRICT_OFFICER`, `HQ_ANALYST`, `HQ_ADMIN`, `SYSTEM_ADMIN` | ⚠️ TBC — no guard yet |
| `/hq` | `HQ_ANALYST`, `HQ_ADMIN`, `SYSTEM_ADMIN` | ⚠️ TBC — no guard yet |
| `/analytics` | `SHO`, `DISTRICT_OFFICER`, `HQ_ANALYST`, `HQ_ADMIN`, `SYSTEM_ADMIN` | ⚠️ TBC — no guard yet |

> Note: Backend scoping already prevents HC from seeing district data. The missing guards are a UX improvement, not a security hole.
