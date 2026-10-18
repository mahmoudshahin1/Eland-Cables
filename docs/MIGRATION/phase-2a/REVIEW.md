# Phase 2a review evidence

**Branch:** `migration/phase-2a-fix` from `ee98586`
**Date:** 2026-10-18
**Not accepted.** `node scripts/check-rules.mjs` exits 1. The clean clone stops because `DATABASE_URL` is absent. Parity was not re-run.

## npm test

Working directory: `energya-backend`. Exit code 0.

```text
> energya-backend@0.0.1 test
> vitest run

The plugin "vite-tsconfig-paths" is detected. Vite now supports tsconfig paths resolution natively via the resolve.tsconfigPaths option. You can remove the plugin and set resolve.tsconfigPaths: true in your Vite config instead.

 RUN  v4.1.11 H:/Eland-Cables/energya-backend


 Test Files  7 passed (7)
      Tests  114 passed (114)
   Start at  17:05:32
   Duration  27.06s (transform 11.15s, setup 0ms, import 42.78s, tests 7.15s, environment 5ms)
```

## npm run test:e2e

Working directory: `energya-backend`. Exit code 0.

```text
> energya-backend@0.0.1 test:e2e
> vitest run --config ./vitest.config.e2e.ts

The plugin "vite-tsconfig-paths" is detected. Vite now supports tsconfig paths resolution natively via the resolve.tsconfigPaths option. You can remove the plugin and set resolve.tsconfigPaths: true in your Vite config instead.

 RUN  v4.1.11 H:/Eland-Cables/energya-backend


 Test Files  10 passed (10)
      Tests  83 passed | 11 todo (94)
   Start at  17:05:41
   Duration  109.04s (transform 2.14s, setup 0ms, import 82.92s, tests 20.84s, environment 3ms)
```

The 11 todo tests were already deferred in `MIGRATION_STATUS.md` section 4. No new `it.todo` was added.

## npm run build

Working directory: `energya-backend`. Exit code 0.

```text
> energya-backend@0.0.1 build
> tsc -p tsconfig.build.json
```

## node scripts/check-rules.mjs

Working directory: repo root. Exit code 1.

```text
(b) energya-backend/src/admin-customers/admin-customers.service.ts has 314 lines, no spec, outside shared/domain
(b) energya-backend/src/master-data/cables/customer-catalog.repository.ts has 306 lines, no spec, outside shared/domain
check-rules failed: 2
```

Rules (a), (c), and (d) produced no lines.

## npm audit --omit=dev (repo root)

Exit code 1.

```text
13 vulnerabilities (3 moderate, 9 high, 1 critical)
```

The critical advisory is `proxy-addr`. The high advisories include `@remix-run/router`, `react-router`, `react-router-dom`, `deepmerge-ts`, `@prisma/config`, `prisma`, `effect`, `source-map-js`, and `xlsx`. Full report is the command output from 2026-10-18. No package was upgraded.

## npm audit --omit=dev (energya-backend)

Exit code 1.

```text
4 high severity vulnerabilities
```

All four are `deepmerge-ts`, `effect`, `@prisma/config`, and `prisma`. No package was upgraded.

## Source searches

```text
energya-backend/src\app.controller.spec.ts:10:    $queryRaw: vi.fn().mockResolvedValue([{ 1: 1 }]),
energya-backend/src\app.controller.ts:12:      await this.prisma.$queryRaw`SELECT 1`;
energya-backend/src\app.controller.ts:35:      await this.prisma.$queryRaw`SELECT 1`;
energya-backend/src\master-data\reference\reference.repository.ts:88:      await this.prisma.$queryRaw`SELECT 1`;
```

No `$executeRaw`, `eval(`, `new Function`, or `child_process` in `energya-backend/src`. No `ALLOW_DEMO_USERS` or `DEMO_MODE` in `energya-backend/src`.

```text
energya-frontend\package-lock.json:167
```

That is `rg -c npmmirror -g "*lock*"`.

## curl.exe -sI http://127.0.0.1:3000/api/master/cables

Nest was started from this branch with the Nest `DATABASE_URL` (database name `energya_nest`). Response:

```text
HTTP/1.1 401 Unauthorized
Cross-Origin-Opener-Policy: same-origin
Cross-Origin-Resource-Policy: same-origin
Origin-Agent-Cluster: ?1
Referrer-Policy: strict-origin-when-cross-origin
Strict-Transport-Security: max-age=31536000; includeSubDomains
X-Content-Type-Options: nosniff
X-DNS-Prefetch-Control: off
X-Download-Options: noopen
X-Frame-Options: DENY
X-Permitted-Cross-Domain-Policies: none
X-XSS-Protection: 0
Permissions-Policy: camera=(), microphone=(), geolocation=()
X-Served-By: nest
Vary: Origin
Access-Control-Allow-Credentials: true
Content-Type: application/json; charset=utf-8
Content-Length: 75
ETag: W/"4b-XTliK8V82D8OJ1GVtnJj4vN30QE"
Date: Sun, 18 Oct 2026 14:09:07 GMT
Connection: keep-alive
Keep-Alive: timeout=5
```

## git diff --stat ee98586

Before this review file was added:

```text
 docs/MIGRATION/MIGRATION_STATUS.md          |   7 +-
 docs/MIGRATION/phase-2a/ANY_CLEANUP_PLAN.md |  36 ++++
 docs/MIGRATION/phase-2a/RUNBOOK.md          | 182 ++++++++-----------
 docs/MIGRATION/phase-2a/SECURITY_REVIEW.md  | 272 +++++++---------------------
 energya-backend/src/app.module.ts           |   2 -
 scripts/check-rules.baseline.json           |   7 +
 scripts/check-rules.mjs                     | 145 +++++++++++++++
 7 files changed, 337 insertions(+), 314 deletions(-)
```

## What was not executed

- `npm run test:parity:phase2a` was not run. The harness seeds with `TRUNCATE`.
- `npm run prisma:seed` was not run.
- The clean clone did not receive `.env` and did not start servers.
- The two files named by `check-rules` were not split.
- `GET /api/v2/cables/products` and `GET /api/v2/cables/products/facets` were not unregistered. Finding FIND-2A-01.
