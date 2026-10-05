# User & Security Model (Increment 12 B1)

## Authentication flow

1. Client `POST /api/auth/login` with email/username and password.
2. Server loads `UserAccount` from PostgreSQL (case-insensitive email or username).
3. Inactive accounts are rejected (`401`). Failed-attempt counter is **not** increased for inactive.
4. Locked accounts are rejected (`401`).
5. Password is verified with **bcryptjs** (`$2a$` / `$2b$` hashes, cost factor 10). Plaintext is never stored or compared after B1.
6. On failure: `failedLoginAttempts` increments. At `LOGIN_LOCK_THRESHOLD` (default **5**) the account is locked and `ACCOUNT_LOCKED` is audited.
7. On success: `failedLoginAttempts` resets, `lastLoginAt` updates, `LOGIN_SUCCESS` is audited.
8. Access JWT (1 hour) is issued. Refresh token is a random opaque value stored **only as SHA-256** in `UserSession`.
9. Response DTO is `toSafeUser` — **never** includes `passwordHash`.

Self-registration (`POST /api/auth/register`) returns **403**. Accounts are created by administrators.

Password reset is an **admin ticket** (`POST /api/admin/users/:id/reset-password`) plus `POST /api/auth/reset-password` with the one-time token. The token is stored hashed. It is returned in the admin API only when `ADMIN_RESET_TOKEN_IN_RESPONSE=true` or `NODE_ENV !== 'production'`. Audit events never contain the token or password.

## Password hashing

Argon2id was not used because this Node/Cloud Agent environment should stay free of native bindings. **bcryptjs** cost 10 is the project hasher.

## JWT / RequestActor

Access tokens contain identity (`sub`, **`sid`** = `UserSession.id`, email, name, `userType`, `roles`, `department`) and **legacy module booleans** for the existing Sidebar.

They do **not** carry refresh tokens, password hashes, reset tokens, or the full granular permission matrix as the source of truth.

`resolveRequestActor(authorization)`:

1. Verifies JWT (`actorFromAuthorizationHeader`).
2. If a `UserAccount` exists for `sub`, requires a live **`sid`** session: present, not revoked, not expired, matching user.
3. Hydrates live roles and `RolePermission` rows.
4. Locked, inactive, or session-invalid accounts hydrate to an empty actor (APIs → **401**).

`signTestToken` remains for Increment 1–11 tests: if no `UserAccount` row exists for `sub`, JWT claims are used unchanged (no session required).

Logout (`POST /api/auth/logout`) revokes the session identified by `sid` and/or the refresh-token hash. That access JWT cannot be replayed.

Lock, deactivate, and successful password reset revoke all `UserSession` rows for the user.

## RequestActor fields

`id`, `username`, `email`, `name`, `userType`, `role` / `roles`, `permissions` (legacy booleans), `permissionCodes` (live), `customerId`, `department`, `accountStatus`.

## Compatibility with in-memory demo users

The old `mockDbUsers` handlers in `server.ts` are still in the file but **do not win** for `/api/auth/*` because `identityAuthRouter` is mounted first. Login is database-backed only. PostgreSQL is required for sign-in.

Development seed (non-production, or `ALLOW_DEV_IDENTITY_SEED=true`) hashes the previous demo passwords so the login screen still works. This is **not** a silent production conversion. See `docs/INCREMENT_12_B1_IMPLEMENTATION_LOG.md`.

## Known limitations (B1 / B2.1)

- Demo `loginAsUser()` in `AuthContext` still switches the React session without a JWT. Do not use it in production.
- Access tokens that predate `sid` (issued before B2.1) cannot authorize database users; users must sign in again.
- Self-service email reset is not implemented (forgot-password returns a generic message).
