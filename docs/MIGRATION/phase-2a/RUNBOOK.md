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

## 8. Clean-clone execution

The verbatim log is appended after the clone commands finish. The clone does not receive `.env` files and does not run a seed.
