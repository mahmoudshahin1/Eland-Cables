# Increment 12 B1 — Implementation Log

**Date:** 2026-08-20  
**Stage:** B1 — Platform Identity, Users, Roles & Permissions  
**Status:** Findings recorded before code changes; implementation follows this log.

---

## 1. Pre-change inspection (confirmed)

### Identity
- **No Prisma `User` / `Role` / `Permission` models.** `prisma/schema.prisma` ends at commercial pricing (`CommercialPricingSnapshot`).
- Login lives in `server.ts` against **`mockDbUsers` in-memory array**.
- `passwordHash` fields hold **plaintext** (`Admin@2026!`, `Sales@2026!`, `Customer@2026!`).
- Comparison: `user.passwordHash !== password` (plaintext).
- `GET /api/auth/me` returns the **full mock user object**, including `passwordHash`.
- `POST /api/auth/register` stores plaintext passwords in memory.
- Refresh tokens: in-memory `Map`.
- Demo `loginAsUser()` in `AuthContext.tsx` **bypasses JWT**.

### RequestActor
- `src/server/auth.ts`: JWT decode → `{ id, name, email, userType, role, permissions }`.
- Permissions are the **module-boolean blob from the token**, not live DB state.
- Routes use **sync** `actorFromAuthorizationHeader` in: `costingRoutes`, `commercialRoutes`, `commercialPricingRoutes`, `masterDataRoutes`, `cableAuthorityRoutes`.

### RBAC
- `src/server/rbac.ts`: capability asserts (`assertCanCalculateCosting`, BOM, price, inquiry ownership, etc.).
- Frontend: `ModulePermissions` (10 booleans) + `Sidebar` hiding.
- `UserManagement.tsx`: mutates React `usersList` only — **not persisted**.
- `RoleManagementView.tsx`: prototype against in-memory `/api/auth/roles`.

### Audit
- Prisma `AuditEvent`: `id, at, actorId, actorName, entity, entityId, action, oldValue, newValue, message`.
- Parallel `appendAudit()` localStorage store.
- No LOGIN_FAILURE / ACCOUNT_LOCKED events today.

### Tests
- `signTestToken` injects JWT with `permissions` object — must keep working **without** requiring a DB user.
- Increment 4–12 tests assume existing `rbac.ts` semantics (customer denied; missing permissions object often allowed for internal).
- `package.json` test script lists increment files explicitly — **must add** new B1 test file to the script.

### Dependencies
- `jsonwebtoken` present. **No bcrypt/argon2.**
- Prisma 6.16.2, PostgreSQL via `DATABASE_URL`.

### Decision: hashing
Argon2id would add native bindings. **bcryptjs** (pure JS, cost factor 10) is used so Cloud Agent / Node environments stay portable.

---

## 2. Compatibility adapter (planned)

Legacy JWT/module flags remain on login DTO for the existing Sidebar.

| Legacy flag | Granular permissions (any one grants the flag) |
|---|---|
| `userManagement` | `ADMIN:USER:*`, `ADMIN:ROLE:*`, `ADMIN:PERMISSION:VIEW` |
| `masterData` | `CABLE:CABLE_MASTER:*`, `RAW_MATERIAL:RAW_MATERIAL:*` |
| `technicalOffice` | `BOM:BOM_CONFLICT:*`, `ENGINEERING:MAPPING:*` |
| `costingPricing` | `COSTING:COSTING_RUN:*`, `PRICE:RAW_MATERIAL_PRICE:*` |
| `salesQuotations` | `COMMERCIAL:INQUIRY:*`, `COMMERCIAL:QUOTATION:*` |
| `ordersProduction` | `PRODUCTION:ORDER:VIEW` |
| `financeCollections` | `FINANCE:COLLECTION:VIEW` |
| `reportsAnalytics` | `REPORT:REPORT:VIEW` |
| `overview` | `REPORT:DASHBOARD:VIEW` |
| `customerPortalAccess` | `COMMERCIAL:INQUIRY:VIEW` |

Existing `assert*` functions: **allow if granular permission matches OR legacy flag is not false** (preserves Increment tests that pass `{ costingPricing: true }` or omit permissions).

Hydration: when PostgreSQL is available and JWT `sub` matches a `UserAccount`, **live RolePermission rows override** token-embedded flags so role changes apply without waiting for expiry.

When PostgreSQL is unavailable, JWT claims remain the source (test tokens).

---

## 3. Seed / demo users

Development seed (hashed) mirrors current demo emails so the UI login still works:

- `admin@energya.com` → SYSTEM_ADMINISTRATOR  
- `ehab.maher@energya.com` → SYSTEM_ADMINISTRATOR  
- `sales@energya.com` / `m.ahmed@energya.com` → SALES_MANAGER  
- `technical@energya.com` → TECHNICAL_OFFICE_ENGINEER  
- `k.salem@energya.com` → COSTING_MANAGER  
- `n.nabil@energya.com` → PROCUREMENT_MANAGER  
- `david.smith@elandcables.com` → CUSTOMER_USER (`customerId` string `c-eland`)

Seed user ids use a `dev-` prefix so they do not collide with Increment 10–12 test actor ids (`u-admin-1`, `u-cost-1`, …).

Bootstrap admin is created **only** when `ADMIN_SEED_PASSWORD` is set. Existing rows are never updated (idempotent; production admin hashes are not overwritten). Production never seeds users unless `ALLOW_DEV_IDENTITY_SEED=true` **and** `ADMIN_SEED_PASSWORD` is set. Seed logs do not print passwords.

---

## 4. Implementation (completed)

- Prisma models: `UserAccount`, `Role`, `Permission`, `RolePermission`, `UserRole`, `UserSession`, `PasswordResetTicket`.
- Migration: `20260820120000_increment12_b1_identity`.
- Login + admin APIs mounted ahead of legacy mock routes.
- Administration UI: Overview, Users, Roles & Permissions, Security summary.
- Compatibility adapter documented in `docs/RBAC_PERMISSION_MODEL.md`.
- Tests: `src/server/increment12b1.identity.test.ts`.

---

## 6. Hardening gate (post-B1)

### Issues found
- `loginAsUser()` could establish a UI session with no JWT in any environment.
- Development seed used a hardcoded fallback (`Admin@2026!`) for the bootstrap admin, which could be applied whenever `ADMIN_SEED_PASSWORD` was unset (including a mis-set production with `ALLOW_DEV_IDENTITY_SEED`).
- First login auto-seeded demo users even in production catalog path (users skipped, but the call mixed concerns).
- Refresh succeeded for locked/inactive accounts if the session row was still valid.
- Logout only cleared browser storage; refresh tokens remained usable.
- Lock/deactivate did not revoke `UserSession` rows.
- Admin reset returned the plaintext ticket whenever `NODE_ENV !== 'production'` without an explicit flag.
- Reset consume did not invalidate sibling unused tickets.
- Customers could set `customerId` on create-inquiry bodies.
- A user with `ROLE MANAGE` could change permissions on a role assigned to themselves.
- Default `JWT_SECRET` was accepted in production.

### Fixes made
- Demo authentication gated by `isDemoAuthenticationAllowed()` / `applyDemoUserLogin()`; production UI hides demo accounts and `loginAsUser` is a no-op.
- Bootstrap admin requires `ADMIN_SEED_PASSWORD`; existing passwords never overwritten; production user seed off by default.
- `POST /api/auth/logout` revokes the hashed refresh session. Lock/deactivate/password-reset revoke all sessions for the user.
- Refresh rejects revoked, expired, locked, and inactive accounts (rotation remains one-time).
- Reset tickets stay hashed, expire in 60 minutes, are single-use, and sibling tickets are invalidated. Token returned only when `ADMIN_RESET_TOKEN_IN_RESPONSE=true` **and** not production.
- Customer create-inquiry ignores body `customerId`. Line/submit/quote paths enforce `assertCanAccessInquiryOwnership`.
- Self role assign/remove blocked; cannot edit permissions of a role you hold; only `SYSTEM_ADMINISTRATOR` can grant that role or edit its permission set.
- Production refuses the compiled default `JWT_SECRET`.

### Tests added
- `src/domain/demoAuth.test.ts` — demo login unavailable in production (2 tests).
- `src/server/increment12b1.hardening.test.ts` — refresh revocation/rotation, lock vs session, reset hash/reuse, email enumeration, self-escalation, admin 401/403 matrix, customer A/B isolation via URL/query/body, audit redaction, AuditEvent immutability (11 tests).

Final count: **217 pass / 0 fail** (was 204; +13 hardening tests).  
TypeScript: `npx tsc --noEmit` **pass**.

### Remaining limitations
- Access JWTs remain valid until expiry after lock; hydrate returns an empty actor so APIs are 401, but the compact JWT is not denylisted.
- Email delivery of reset tickets is not implemented (B1).
- `SYSTEM_ADMINISTRATOR` is still seeded with the full permission catalog.
- Customer master (Stage B2) is still a string `customerId`.

