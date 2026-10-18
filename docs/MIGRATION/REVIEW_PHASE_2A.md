# REVIEW_PHASE_2A

Branch `migration/phase-2a-fix` from `ee98586`. Phase 2b was not started. This file is the external review packet. Verbatim command output is also in `docs/MIGRATION/phase-2a/REVIEW.md`.

## 1. Summary

Done: `InquiriesModule` is no longer registered. `SECURITY_REVIEW.md` lists the 19 mounted Phase 2a routes. The legacy log records the three `package.json` scripts, `prisma/seed.ts`, `vite.config.ts`, `AdministrationHub.tsx`, and `Buffer.from` in `masterDataRoutes.ts`. `scripts/check-rules.mjs` exists. The `any` cleanup plan is written and was not executed. The runbook was executed from a clean clone until `DATABASE_URL` was missing.

Not done: rule (b) fails on two existing files. Dependency audit is not clean. Parity was not re-run. The phase is not tagged accepted.

Deviation: `HEAD` of `migration/phase-2` had moved to `4848e21` (a Phase 2b commit). This branch was created from `ee98586` and does not contain that commit.

## 2. Endpoints

The 19 routes, guards, and legacy lines are the table in `docs/MIGRATION/phase-2a/SECURITY_REVIEW.md`. Parity status for those routes is the existing file `docs/MIGRATION/phase-2a/parity_results.json`: `passed=159`, `failed=0`, `total=159`, `generatedAt=2026-10-17T14:48:38.283Z`. That run was not repeated.

## 3. Permission matrix

Same table. Customer catalog reads follow `src/server/rbac.ts:710-711`. Attachment writes deny customers at `src/server/rbac.ts:21-22`.

## 4. Parity

Not re-run on 2026-10-18. Reason: `scripts/parity/run-phase2a-parity.mjs` seeds with `TRUNCATE`, and this task did not approve that command. Last recorded result remains 159 passed, 0 failed, 159 total.

## 5. Tests

`npm test` exit 0: Test Files 7 passed (7), Tests 114 passed (114), Duration 27.06s, start 17:05:32.

`npm run test:e2e` exit 0: Test Files 10 passed (10), Tests 83 passed | 11 todo (94), Duration 109.04s, start 17:05:41.

## 6. Build and lint

`npm run build` exit 0. The output is `tsc -p tsconfig.build.json` with no error lines.

`npm run lint` was not run in this close.

## 7. React screens

Previous G3 on 2026-10-17, recorded in `network_log.json` `generatedAt=2026-10-17T19:34:33.041Z`: 483 API requests, 375 served by Nest, failures 0. Screens: `/customer/products`, `/customer/drum-optimizer`, `/internal/master-data`. Not re-run on 2026-10-18.

UAT 9/9 was confirmed by the user on 2026-10-17 and is recorded in `docs/MIGRATION/phase-2a/UAT.md`.

## 8. Differences and open problems

Intentional: `InquiriesModule` unregistered. Files kept.

Open: SEC-MD-01, SEC-MD-02, FIND-2A-01, FIND-2A-02, FIND-2A-03 in `SECURITY_REVIEW.md`. `check-rules` exit 1. Audit highs and one critical `proxy-addr` at the repo root.

## 9. Files changed

`git diff --stat ee98586` before this file:

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

Legacy edits are logged in `MIGRATION_STATUS.md` section 5. No legacy file was edited in this close.

## 10. Security grep

`$queryRaw` hits, and only those, in `energya-backend/src`:

```text
energya-backend/src\app.controller.spec.ts:10:    $queryRaw: vi.fn().mockResolvedValue([{ 1: 1 }]),
energya-backend/src\app.controller.ts:12:      await this.prisma.$queryRaw`SELECT 1`;
energya-backend/src\app.controller.ts:35:      await this.prisma.$queryRaw`SELECT 1`;
energya-backend/src\master-data\reference\reference.repository.ts:88:      await this.prisma.$queryRaw`SELECT 1`;
```

`any` count baseline is 143. It was not reduced. No new package was installed.

## 11. New packages

None.

## check-rules

Exit code 1.

```text
(b) energya-backend/src/admin-customers/admin-customers.service.ts has 314 lines, no spec, outside shared/domain
(b) energya-backend/src/master-data/cables/customer-catalog.repository.ts has 306 lines, no spec, outside shared/domain
check-rules failed: 2
```
