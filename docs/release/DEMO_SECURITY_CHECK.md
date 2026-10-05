# Energya Connect — Security Release Check

## 1. Security Architecture & Guardrail Audit

This audit validates that all authentication gates, authorization enforcement layers, tenant isolation mechanisms, and production environment guards are strictly enforced for the Energya Connect demo and production deployment.

---

## 2. Authentication & Credential Security

### 2.1 JWT Production Guard (`src/server/auth.ts`)
```typescript
export function validateProductionJwtSecret(configured: string | undefined): string {
  if (!configured || !configured.trim()) {
    throw new Error('JWT_SECRET must be configured to a non-default value in production.');
  }
  const trimmed = configured.trim();
  if (trimmed === DEV_JWT_SECRET_FALLBACK) {
    throw new Error('JWT_SECRET must be configured to a non-default value in production.');
  }
  if (trimmed.length < MIN_PRODUCTION_JWT_SECRET_LENGTH) {
    throw new Error(`JWT_SECRET must be at least ${MIN_PRODUCTION_JWT_SECRET_LENGTH} characters in production.`);
  }
  return trimmed;
}
```
- **Audit Finding:** PASS (code). The server refuses to start in production if `JWT_SECRET` is missing, equals the hardcoded development key, or is shorter than 32 characters.

### 2.1b Production Admin Seed Password Guard (`prisma/seed.ts` + `src/server/identityService.ts`)
```typescript
export function validateProductionAdminSeedPassword(password: string | undefined): string {
  if (!password || !password.trim()) {
    throw new Error('ADMIN_SEED_PASSWORD must be explicitly configured in production.');
  }
  if (INSECURE_DEFAULT_SEED_PASSWORDS.includes(password.trim())) {
    throw new Error('ADMIN_SEED_PASSWORD cannot be set to a default development fallback in production.');
  }
  return password.trim();
}
```
- When `NODE_ENV=production`, seed calls `validateProductionAdminSeedPassword` then `seedProductionAdministrator`.
- Known insecure defaults (`Admin@2026!`, `Sales@2026!`, `Tech@2026!`, `Customer@2026!`, `password`, etc.) are rejected.
- Password value is never written to logs and is never returned by API responses.
- **Audit Finding:** PASS (code). Production/demo public environments must supply a unique `ADMIN_SEED_PASSWORD`.

### 2.2 Password Hashing & Brute-Force Protection (`src/server/identityService.ts`)
- **Hashing Algorithm:** `bcryptjs` with 12 salt rounds on all user passwords.
- **Account Lockout:** Failed login attempts increment `failedLoginAttempts`. When reaching `LOGIN_LOCK_THRESHOLD` (default 5), the account is locked (`isLocked: true`), revoking active sessions.
- **Audit Finding:** PASS. Complies with industry security standards.

### 2.3 Session Lifecycle & Revocation (`src/server/auth.ts` & `src/server/identityService.ts`)
- **Access Token Lifetime:** 15 minutes.
- **Refresh Token Lifetime:** 7 days.
- **Stateful Revocation Checks:** Every incoming request with a valid JWT verifies that the referenced `UserSession` (tracked in PostgreSQL) has not been revoked or expired, and that the user account is active and unlocked.
- **Revocation Triggers:** Logging out, resetting password, admin locking, or user deactivation immediately revokes all active session records in the database.
- **Audit Finding:** PASS. Verified by 18 security regression tests in `src/server/increment12b2_1.securityHardening.test.ts`.

---

## 3. Development Bypass Production Guards

### 3.1 Demo Quick-Switch Login Guard (`src/domain/demoAuth.ts`)
```typescript
export function isDemoAuthenticationAllowed(nodeEnv: string | undefined = process.env.NODE_ENV): boolean {
  return nodeEnv !== 'production';
}

export function applyDemoUserLogin<T>(user: T, nodeEnv: string | undefined = process.env.NODE_ENV): T | null {
  if (!isDemoAuthenticationAllowed(nodeEnv)) return null;
  return user;
}
```
- **Audit Finding:** PASS. In `NODE_ENV === 'production'`, demo user quick-switching is completely disabled. Users must authenticate with valid credentials via `/api/auth/login`.

### 3.2 Development Identity Seeding Guard (`src/server/identityService.ts`)
```typescript
export function isDevelopmentIdentitySeedAllowed(
  nodeEnv: string | undefined = process.env.NODE_ENV,
  allowFlag: string | undefined = process.env.ALLOW_DEV_IDENTITY_SEED
): boolean {
  if (nodeEnv === 'production') {
    if (allowFlag === 'true') {
      console.warn('ALLOW_DEV_IDENTITY_SEED is ignored in production; development identity seed will not run.');
    }
    return false;
  }
  return true;
}
```
- **Audit Finding:** PASS. Development user accounts with known mock passwords will never be injected into a production environment.

### 3.3 Admin Reset Token In Response Guard (`src/server/identityAdminRepository.ts`)
```typescript
export function shouldIncludeResetTokenInAdminResponse(
  nodeEnv: string | undefined = process.env.NODE_ENV,
  flag: string | undefined = process.env.ADMIN_RESET_TOKEN_IN_RESPONSE
): boolean {
  if (nodeEnv === 'production') return false;
  return flag === 'true';
}
```
- **Audit Finding:** PASS. Administrative password reset responses do not expose cleartext reset tokens in production. Tokens are dispatched strictly via email or secure administrative channel.

---

## 4. Multi-Tenant Customer Data Isolation

### 4.1 Commercial Scope Enforcement (`src/server/customerScope.ts`)
- All commercial endpoints (`/api/inquiries`, `/api/quotations`, `/api/commercial-pricing`) pass through `customerScope` and `assertCustomerMatches()`.
- Customer users (`CUSTOMER_USER` role) can only access inquiries, quotations, and documents matching their assigned `customerId`.
- Any attempt by Customer A to query, modify, or submit data referencing Customer B returns `403 Forbidden` and logs an `AuditEvent` with `SECURITY_VIOLATION` severity.
- **Audit Finding:** PASS. Verified in `src/server/increment12b2.customerMaster.test.ts`.

---

## 5. Attachment & Binary Upload Security

### 5.1 Size Ceilings and Storage Hygiene (`src/server/attachmentRepository.ts`)
- Maximum file size: `8 MB` (`MAX_ATTACHMENT_BYTES = 8 * 1024 * 1024`).
- Base64 payload validation prevents oversized buffer allocation.
- REST responses return lightweight metadata summary DTOs; raw `bytea` binary streams are only transmitted on explicit download endpoints.
- Role-based authorization: Technical attachments require `assertCanProcessTechnicalOffice(actor)`.
- **Audit Finding:** PASS.

---

## 6. Formula Engine Code Execution Security

### 6.1 AST Parser & Evaluator Sandbox (`src/domain/costingFormulaEngine.ts`)
- The dynamic formula engine operates on a secure abstract syntax tree (AST) tokenizer and recursive descent parser.
- **Restricted Syntax:** Strictly rejects JavaScript `eval()`, `Function()`, `setTimeout()`, semicolons (`;`), brackets (`[` / `]`), and module imports (`require`, `import`).
- **Input Validation:** Only registered numeric variables, binary operators (`+`, `-`, `*`, `/`), and parentheses are allowed.
- **Audit Finding:** PASS. Verified by security test suite in `src/domain/costingFormulaEngine.test.ts`.

---

## 7. Network & CORS Posture

### 7.1 Single-Origin Deployment
- In standard deployment, the Node.js Express server serves both the REST API (`/api/*`) and the compiled Vite SPA (`dist/`) on the same origin (same hostname and port).
- Same-origin policy prevents cross-site request forgery without requiring permissive CORS headers.
- If deployed behind a reverse proxy (e.g. NGINX, Cloudflare, AWS ALB), standard TLS termination and HSTS should be enabled.

---

## 8. Security Summary Matrix

| Security Area | Implementation Status | Risk Level | Validation Check |
| :--- | :---: | :---: | :--- |
| **JWT Secret Enforcement** | Fully Enforced | LOW | Throws if missing/default/weak (<32 chars) in production |
| **Admin Seed Password** | Fully Enforced | LOW | Production seed requires explicit non-default `ADMIN_SEED_PASSWORD` |
| **Password Storage** | Bcrypt (12 rounds) | LOW | Industry standard |
| **Session Revocation** | PostgreSQL state tracking | LOW | Instant invalidation on logout/reset/lock |
| **Demo Login Guard** | Disabled in production | LOW | Code verification + unit tests |
| **Seed Data Guard** | Disabled in production | LOW | Production guard prevents dev account seeding |
| **Customer Data Isolation** | Strict RBAC + Customer Scope | LOW | Cross-tenant queries return 403 Forbidden |
| **Attachment Limits** | 8 MB max + Base64 validation | LOW | Memory allocation limits respected |
| **Formula Engine Sandbox**| Custom AST parser (no eval) | LOW | Code injection attempts blocked & tested |
| **Hardcoded Secrets** | None found in codebase | LOW | Grep audit confirmed zero committed secrets |
