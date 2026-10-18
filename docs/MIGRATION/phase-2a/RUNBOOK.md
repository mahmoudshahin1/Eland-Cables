# Phase 2a Runbook

**Scope:** 19 mounted Phase 2a routes, branch `migration/phase-2a-fix`.
**Date:** 2026-10-18
**Rule:** environment variable names only. No secret values. Do not run `scripts/parity/seed-master-data.mjs` or `scripts/parity/seed-auth.mjs` against a database you are using for manual testing; those scripts can `TRUNCATE`.

## 1. Requirements

- Node.js 22.x
- PostgreSQL listening on port 5432
- npm

## 2. Environment variable names

Root `.env` for the legacy process:

- `PORT`
- `DATABASE_URL`
- `JWT_SECRET`
- `JWT_EXPIRES_IN`
- `REFRESH_TOKEN_EXPIRES_IN`
- `NODE_ENV`

`energya-backend/.env` for Nest:

- `PORT`
- `DATABASE_URL`
- `JWT_SECRET`
- `JWT_EXPIRES_IN`
- `REFRESH_TOKEN_EXPIRES_IN`
- `NODE_ENV`

Hybrid UI:

- `BACKEND_URL` (Nest, default port 3000)
- `LEGACY_URL` (Express, default port 3847)

`JWT_SECRET` must be at least 32 characters and must not be the rejected default. For a hybrid session, both processes need the same `JWT_SECRET`. For a Phase 2a UI test against the Nest database, both processes use the Nest `DATABASE_URL`.

## 3. Database

Create the databases if they do not exist. Names used by the parity scripts: `energya_legacy`, `energya_nest`. The application source database name is separate.

Apply the schema from the repo root, with `DATABASE_URL` pointing at the target database:

```bash
npx prisma migrate deploy
```

Repeat with `DATABASE_URL` pointed at the other database. The Nest package uses `../prisma/schema.prisma`.

Master-data and auth seeds:

```bash
node scripts/parity/seed-master-data.mjs
node scripts/parity/seed-auth.mjs
```

`prisma/seed.ts` also calls `seedGovernedElandCustomer()` and upserts incoterms `DAP` and `CIF` before the shipping-cost seed. Run it only when you intend to change the database named by `DATABASE_URL`:

```bash
npm run prisma:seed
```

## 4. Start

Three processes:

```bash
npm run dev
```

Legacy Express. Set `PORT` to 3847.

```bash
npm run start:dev
```

Run inside `energya-backend`. Nest listens on 3000.

```bash
npm run dev:legacy-ui
```

React on http://localhost:5173/ . `vite.config.ts` sends a request to Nest only when `scripts/parity/nestRoutes.mjs` matches the method and path. Everything else under `/api` stays on Express.

## 5. Test accounts

`scripts/parity/seed-auth.mjs` upserts the parity accounts and sets their password to the value hardcoded in that script. Roles:

| Email | Role |
|---|---|
| `admin@energya.com` | `SYSTEM_ADMINISTRATOR` |
| `ehab.maher@energya.com` | `SYSTEM_ADMINISTRATOR` |
| `admin@parity.test` | `ADMIN` |
| `limited@parity.test` | `VIEWER` |
| `granular@parity.test` | `TECHNICAL_OFFICE_ENGINEER` |
| `writer@parity.test` | `TECHNICAL_OFFICE_MANAGER` |
| `custA@parity.test` | customer, scope `CUST_A` |
| `custB@parity.test` | customer, scope `CUST_B` |

## 6. Tests

From `energya-backend`:

```bash
npm test
npm run test:e2e
npm run build
npm run lint
```

From the repo root:

```bash
npm run verify:domain
node scripts/check-rules.mjs
```

`npm run test:parity:phase2a` compares legacy port 3847 with Nest port 3000. It is not part of the clean-clone execution below.

## 7. Stop

Stop the three processes. On Windows, stop the process IDs listening on 5173, 3000, and 3847. Do not use `git clean` or a database reset unless the user approved that command.

## 8. Clean-clone execution (2026-10-18, second run)

Folder: `C:\Users\mahmo\AppData\Local\Temp\energya-2a-runbook-1810`. Database name printed before use: `energya_runbook_2a`. The connection string and `JWT_SECRET` were written only in that folder and are not copied here.

```text
CREATE DATABASE
created_or_attempted energya_runbook_2a
```

`git pull --ff-only` moved the clone from `517f467` to `42a8b2c`.

`npx prisma migrate deploy` exit 0:

```text
Datasource "db": PostgreSQL database "energya_runbook_2a", schema "public" at "127.0.0.1:5432"
63 migrations found in prisma/migrations
All migrations have been successfully applied.
```

`npm run prisma:seed` failed first because `prisma generate` had not run (`SyntaxError: The requested module '@prisma/client' does not provide an export named 'PrismaClient'`). After `npx prisma generate` (exit 0), seed exit 0:

```text
Seeded Eland shipping cost rates. customerId=cmvdxlza2006rl5to29kntivq DAP=incoterm-icc-dap CIF=incoterm-icc-cif created=6 skipped=0.
```

Servers from the clone: legacy `http://0.0.0.0:3857`, Nest `http://localhost:3010`. Curl:

```text
http://127.0.0.1:3857/api/platform/health status=200 served=
http://127.0.0.1:3010/api/platform/health status=200 served=nest
http://127.0.0.1:3857/api/master/cables status=401
http://127.0.0.1:3010/api/master/cables status=401
http://127.0.0.1:3857/api/platform/db status=200 served=
http://127.0.0.1:3010/api/platform/db status=200 served=nest
http://127.0.0.1:3857/api/v2/cables/products status=401
http://127.0.0.1:3010/api/v2/cables/products status=404
```

The first clone attempt on the same day stopped at `P1012` because `DATABASE_URL` was missing. That attempt did not seed and did not start servers.

## 9. Earlier clean-clone note

Command, from `H:\Eland-Cables`:

```text
git clone --branch migration/phase-2a-fix "h:\Eland-Cables" $env:TEMP\energya-2a-runbook-20261018
```

Result:

```text
Cloning into 'C:\Users\mahmo\AppData\Local\Temp\energya-2a-runbook-20261018'...
done.
Updating files: 100% (1392/1392), done.
v22.12.0
11.0.0
```

Root `npm install --ignore-scripts`:

```text
added 341 packages, and audited 342 packages in 2m
13 vulnerabilities (3 moderate, 9 high, 1 critical)
```

`energya-backend` `npm install --ignore-scripts`:

```text
added 460 packages, and audited 461 packages in 2m
12 vulnerabilities (2 low, 1 moderate, 9 high)
```

`npx prisma migrate deploy` inside the clone's `energya-backend`:

```text
Prisma schema loaded from ..\prisma\schema.prisma
Error: Prisma schema validation - (get-config wasm)
Error code: P1012
error: Environment variable not found: DATABASE_URL.
  -->  C:\Users\mahmo\AppData\Local\Temp\energya-2a-runbook-20261018\prisma\schema.prisma:7
   |
 6 |   provider = "postgresql"
 7 |   url      = env("DATABASE_URL")
   |

Validation Error Count: 1
Prisma CLI Version : 6.16.2
```

Exit code of that command sequence: 1. The clone had no `.env`. Seed scripts were not run. Servers were not started from the clone, so ports 3000, 3847, and 5173 were left to the existing Nest process used for the header check.
