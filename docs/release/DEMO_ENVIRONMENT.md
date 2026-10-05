# Energya Connect — Demo Environment Configuration

This document specifies all environment variables, configuration parameters, and safe placeholders required to run Energya Connect in a staging or demonstration environment.

---

## 1. Environment Variable Specification

| Variable Name | Required | Default / Dev Fallback | Description | Production / Demo Recommendation |
| :--- | :---: | :--- | :--- | :--- |
| `DATABASE_URL` | **YES** | None | PostgreSQL connection URI for Prisma ORM | `postgresql://<user>:<password>@<host>:<port>/<dbname>?schema=public&sslmode=prefer` |
| `PORT` | NO | `3847` | Port on which the Express server listens | `3847` or container port assigned by PaaS (e.g. `8080` / `3000`) |
| `NODE_ENV` | **YES** | `development` | Runtime environment toggle (`production` / `development`) | Set to `production` for all demo/staging releases. |
| `JWT_SECRET` | **YES** | Hardcoded Dev Key (dev only) | Cryptographic key used to sign & verify JWT access/refresh tokens | **Required in production.** Must be non-default and ≥32 characters. Server refuses to start if missing, default, or weak. |
| `ADMIN_SEED_PASSWORD` | **YES in production seed** | `Admin@2026!` (development seed only) | Password for initializing `admin@energya.com` during `prisma/seed.ts` | **Required when `NODE_ENV=production`.** Explicit value required; default demo passwords (`Admin@2026!`, `Sales@2026!`, etc.) are rejected. Never logged. |
| `ALLOW_DEMO_USERS` / `DEMO_SEED` | NO | unset / `false` | Opt-in to seed documented demo personas (sales/tech/costing/customer) via `scripts/seedDemoUsers.ts` or production `prisma/seed.ts` | Set `true` only on intentional public demos. Prefer `DEMO_*_PASSWORD`; documented fallbacks apply only when flagged. |
| `DEMO_CUSTOMER_PASSWORD` / `DEMO_SALES_PASSWORD` / `DEMO_TECH_PASSWORD` / `DEMO_COSTING_PASSWORD` / `DEMO_PROCUREMENT_PASSWORD` | NO | Documented demo passwords when opt-in | Passwords for demo personas | Override documented defaults on shared demos if desired. |
| `DEMO_RESET_PASSWORDS` | NO | `false` | Re-hash passwords for existing demo personas during demo seed | Use when rotating demo passwords on an already-seeded DB. |
| `ALLOW_DEV_IDENTITY_SEED`| NO | `false` | Allows development identity seeding | Always `false` or unset in production. Code explicitly ignores this when `NODE_ENV=production`. |
| `ADMIN_RESET_TOKEN_IN_RESPONSE` | NO | `false` | Exposes password reset token in API response | Must be `false` or unset in production. Reset tokens must only be transmitted via email. |
| `LOGIN_LOCK_THRESHOLD` | NO | `5` | Maximum failed password attempts before account lock | `5` consecutive attempts. |
| `CORS_ALLOWED_ORIGINS` | NO | Same-origin | Comma-separated list of allowed origins | `https://demo.energyaconnect.com,https://energya-demo.internal` |
| `GEMINI_API_KEY` | NO | Empty string | Google Gemini API key for AI assistant features | Optional. If omitted, AI assistant endpoint gracefully returns an unconfigured notice. |
| `SMTP_HOST` | NO | Unset | Hostname of outbound SMTP server | e.g. `smtp.sendgrid.net` or `smtp.office365.com` |
| `SMTP_PORT` | NO | `587` | Port for SMTP server | `587` (STARTTLS) or `465` (SSL) |
| `SMTP_SECURE` | NO | `false` | Whether to use SSL/TLS directly | `false` for port 587, `true` for port 465 |
| `SMTP_USER` | NO | Unset | SMTP username / API key | Optional credential for authenticated SMTP |
| `SMTP_PASS` | NO | Unset | SMTP password / API secret | Optional credential for authenticated SMTP |
| `SMTP_FROM` | NO | Unset | Sender email address for automated notifications | e.g. `notifications@energyaconnect.com` |
| `NOTIFY_SALES_EMAIL` | NO | `SMTP_FROM` | Commercial team recipient for inquiry notifications | e.g. `commercial-team@energyaconnect.com` |
| `DISABLE_HMR` | NO | `false` | Disables Vite HMR in development | Leave unset in production. |

---

## 2. Safe Configuration Template (`.env.example`)

Copy the template below to `.env` or configure within your hosting provider's secrets manager. **Never commit actual credential values to source control.**

```env
# ==============================================================================
# ENERGYA CONNECT PLATFORM — DEMO ENVIRONMENT CONFIGURATION TEMPLATE
# ==============================================================================

# Node Runtime Mode (must be 'production' for live demo / staging)
NODE_ENV=production

# Server Port
PORT=3847

# PostgreSQL Connection String
# Format: postgresql://[user]:[password]@[host]:[port]/[database]?schema=public
DATABASE_URL=postgresql://energya_demo_user:ReplaceWithStrongDbPassword_2026@postgres-host:5432/energya_connect?schema=public

# Cryptographic Secret for JWT Token Signing (Required in production; ≥32 chars; not the dev fallback)
# Generate with: openssl rand -base64 32
JWT_SECRET=ReplaceWithSecureRandomSecretKeyOfAtLeast32BytesLength_2026_x92!

# Administrator seed password (REQUIRED for production seed; never use Admin@2026! in production)
ADMIN_SEED_PASSWORD=ReplaceWithDemoAdminPassword_2026!

# Security Policies
LOGIN_LOCK_THRESHOLD=5
ALLOW_DEV_IDENTITY_SEED=false
ADMIN_RESET_TOKEN_IN_RESPONSE=false

# Optional CORS Origins (comma-separated if frontend is hosted on separate domain)
# In standard monolithic deployment, same-origin is used automatically.
CORS_ALLOWED_ORIGINS=https://demo.energyaconnect.com

# Optional: Google Gemini AI Assistant Integration
# GEMINI_API_KEY=AIzaSyD_ReplaceWithYourActualGeminiApiKeyIfEnabled

# Optional: SMTP Email Notification Server
# SMTP_HOST=smtp.sendgrid.net
# SMTP_PORT=587
# SMTP_SECURE=false
# SMTP_USER=apikey
# SMTP_PASS=ReplaceWithSendgridApiKey
# SMTP_FROM=notifications@energyaconnect.com
# NOTIFY_SALES_EMAIL=sales@energya.com
```

---

## 3. Production Environment Validation Rules

Before launching the application process, the platform enforces the following runtime constraints:
1. **`JWT_SECRET` Validation:** If `NODE_ENV=production` and `JWT_SECRET` is unset, equals the development fallback (`energya_connect_dotnet9_super_secret_jwt_key_2026_x89f!`), or is shorter than 32 characters, the server terminates immediately to prevent insecure deployments (`validateProductionJwtSecret` in `src/server/auth.ts`).
2. **`ADMIN_SEED_PASSWORD` Validation (seed only):** When `NODE_ENV=production`, `prisma/seed.ts` requires an explicit `ADMIN_SEED_PASSWORD` and rejects known insecure defaults (`Admin@2026!`, `Sales@2026!`, `Tech@2026!`, `Customer@2026!`, `password`, etc.) via `validateProductionAdminSeedPassword`. The password is never printed to logs or returned by any API.
3. **Database Connectivity:** On startup, the server tests PostgreSQL via `checkDatabase()`. If unavailable, `/api/platform/health` reports status, and endpoints dependent on PostgreSQL return structured `500` / `DATABASE_UNAVAILABLE` errors rather than crashing the process.
4. **Identity Seeding Guard:** `seedDevelopmentUsers()` checks `NODE_ENV === 'production'` and `isDevelopmentIdentitySeedAllowed()`. It will never inject development mock users with default passwords into a production database. `ALLOW_DEV_IDENTITY_SEED=true` is ignored in production.
5. **Admin reset token guard:** `ADMIN_RESET_TOKEN_IN_RESPONSE` cannot take effect in production.
6. **Demo auth bypass:** `isDemoAuthenticationAllowed()` returns false when `NODE_ENV=production`.
7. **PORT:** `server.ts` uses `Number(process.env.PORT) || 3847` so PaaS-injected `$PORT` is always respected.

---

## 4. Local demo startup

```bash
npm run dev
```

Opens the monolith at **http://localhost:3847** (override with `PORT`). After changing Express routes, **restart** the Node process — routes do not hot-reload.

**Documented demo users (development seed; still valid unless you rotated passwords):**

| Email | Role | Dev password |
| :--- | :--- | :--- |
| `admin@energya.com` | System administrator | `Admin@2026!` unless `ADMIN_SEED_PASSWORD` is set |
| `david.smith@elandcables.com` | Customer (Eland) | `Customer@2026!` when demo/dev identity seed is allowed |

Do not use these passwords in production. `NODE_ENV=production` requires a strong `JWT_SECRET` and `ADMIN_SEED_PASSWORD`.

