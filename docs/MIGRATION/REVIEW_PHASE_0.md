# Phase 0 Review

## 1. Code Fixes (✅ Completed)
- **JWT Secret Fallback**: Removed super-secret-key-energya-2026. ConfigService enforces 32-char length. App fails to start without it (Verified via 
pm run start:dev with empty JWT_SECRET).
- **Access Token Consistency**: Matched legacy (1h), removed conflicting 15m and 1d, matched issuer/udience.
- **Login Rate Limit**: Applied @Throttle strictly to /api/auth/login using legacy LOGIN_RATE_MAX and LOGIN_RATE_WINDOW_MS. Kept global app throttle at standard (100 req / min).
- **Repository Pattern**: .service.ts files needing refactor due to Prisma calls were identified. Oversized files logged in OVERSIZED_FILES.md (dmin-identity.service.ts 13KB, etc.).
- **Vite Proxy**: Routed only migrated routes (/api/auth, /api/admin/identity, /api/admin/customers) to NestJS :3000. Fallback /api routed to Legacy Express :3847.
- **Git cleanup**: Deleted 	sconfig.build.tsbuildinfo from git and added to .gitignore.
- **TypeScript ny removal**: Replaced ny in main.ts with Request, Response, NextFunction. 

## 2. Testing (Pending G2)
- E2E Tests: Currently itest passes (8 tests), but full migration of legacy test suites (identity, bac, customerScope, dmin) to NestJS testing modules requires the next active session.

## 3. Environment & Database
- Awaiting user confirmation for DB startup to run migrate + seed and parity harness.

