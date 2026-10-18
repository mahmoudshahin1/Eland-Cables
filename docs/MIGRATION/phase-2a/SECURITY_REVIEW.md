# Phase 2a Security Review

**Scope:** 19 routes mounted for Phase 2a. Source: `scripts/parity/nestRoutes.mjs` phase `2a`, which matches the controllers registered by `MasterDataModule` (`cables`, `raw-materials`, `boms`, `drums`, `reference`). No other `/api/platform/*` route is in this table.
**Date:** 2026-10-18
**Branch:** `migration/phase-2a-fix` from `ee98586`

`GET /api/v2/cables/products` and `GET /api/v2/cables/products/facets` are not mounted. `CustomerCatalogController` is not in `CablesSubModule.controllers`, and `nestRoutes.mjs` has no `3-early` entry. The files remain. A count of the phase `2a` table on 2026-10-18 was `phase2aRoutes=19` and `products=false`.

## أ. المسارات الـ 19

Customer "yes" on catalog reads is the legacy early return in `assertCanViewMasterDataCatalog` (`src/server/rbac.ts:710-711`), ported as SEC-MD-01. It is not a new Nest rule.

| # | Method | Path | Nest guard | Permission | Public | Customer | Legacy |
|---:|---|---|---|---|---|---|---|
| 1 | GET | `/api/master/cables` | `JwtAuthGuard` | Signed in only | no | yes | `masterDataRoutes.ts:217` `requireSignedIn` "Sign in is required to view Cable Master." |
| 2 | GET | `/api/master/cables/:materialNumber` | `JwtAuthGuard`, `MasterReadAuthGuard` | One of the 7 catalog codes, or customer | no | yes | `masterDataRoutes.ts:260` `requireMasterReadAuth` |
| 3 | GET | `/api/master/cables/:materialNumber/attachments` | none | none | yes | yes | `masterDataRoutes.ts:322` no auth helper. SEC-MD-02 |
| 4 | GET | `/api/master/cables/:materialNumber/attachments/:attachmentId` | none | none | yes | yes | `masterDataRoutes.ts:345` no auth helper. SEC-MD-02 |
| 5 | POST | `/api/master/cables/:materialNumber/attachments` | `JwtAuthGuard`, `MasterWriteAuthGuard` | `CABLE_MASTER` CREATE or UPDATE | no | no | `masterDataRoutes.ts:331` `requireWriteAuth`; customer denied at `rbac.ts:21-22` |
| 6 | DELETE | `/api/master/cables/:materialNumber/attachments/:attachmentId` | `JwtAuthGuard`, `MasterWriteAuthGuard` | `CABLE_MASTER` CREATE or UPDATE | no | no | `masterDataRoutes.ts:357` `requireWriteAuth` |
| 7 | GET | `/api/master/raw-materials` | `JwtAuthGuard`, `MasterReadAuthGuard` | Catalog codes, or customer | no | yes | `masterDataRoutes.ts:421` `requireMasterReadAuth` |
| 8 | GET | `/api/master/boms` | `JwtAuthGuard`, `MasterReadAuthGuard` | Catalog codes, or customer | no | yes | `masterDataRoutes.ts:370` `requireMasterReadAuth`. SEC-MD-01 |
| 9 | GET | `/api/master/drums` | `JwtAuthGuard`, `MasterReadAuthGuard` | Catalog codes, or customer | no | yes | `masterDataRoutes.ts:833` message "Sign in is required to view drums." |
| 10 | GET | `/api/master/drums/:drumCode` | `JwtAuthGuard`, `MasterReadAuthGuard` | Catalog codes, or customer | no | yes | `masterDataCutoverRoutes.ts:172` `requireMasterRead` message "Sign in is required." (`:66`) |
| 11 | POST | `/api/master/drums/capacity` | `JwtAuthGuard`, `DrumComputeAuthGuard` | `assertCanUseDrumOptimization` (`rbac.ts:739`) | no | yes | `masterDataRoutes.ts:843` `requireDrumComputeAuth` |
| 12 | POST | `/api/master/drums/candidates` | `JwtAuthGuard`, `DrumComputeAuthGuard` | same | no | yes | `masterDataRoutes.ts:874` |
| 13 | POST | `/api/master/drums/validate` | `JwtAuthGuard`, `DrumComputeAuthGuard` | same | no | yes | `masterDataRoutes.ts:951` |
| 14 | POST | `/api/master/drums/optimize` | `JwtAuthGuard`, `DrumComputeAuthGuard` | same | no | yes | `masterDataRoutes.ts:982` |
| 15 | GET | `/api/master/reference` | `JwtAuthGuard`, `MasterReadAuthGuard` | Catalog codes, or customer | no | yes | `masterDataRoutes.ts:1040` |
| 16 | GET | `/api/master/keys` | `JwtAuthGuard`, `MasterReadAuthGuard` | Catalog codes, or customer | no | yes | `masterDataRoutes.ts:1491` |
| 17 | GET | `/api/master/uniqueness` | `JwtAuthGuard`, `MasterReadAuthGuard` | Catalog codes, or customer | no | yes | `masterDataRoutes.ts:1502` |
| 18 | GET | `/api/master/sot-status` | `JwtAuthGuard`, `MasterReadAuthGuard` | Catalog codes, or customer | no | yes | `masterDataCutoverRoutes.ts:103` `requireMasterRead` |
| 19 | GET | `/api/platform/db` | none | none | yes | yes | `masterDataRoutes.ts:208` `platformDbRouter.get('/db')` |

## ب. مسارات بلا مصادقة

| Path | Why |
|---|---|
| `GET /api/master/cables/:materialNumber/attachments` | Legacy handler at `masterDataRoutes.ts:322` does not call an auth helper. SEC-MD-02, ported 1:1. |
| `GET /api/master/cables/:materialNumber/attachments/:attachmentId` | Legacy handler at `masterDataRoutes.ts:345` does not call an auth helper. SEC-MD-02, ported 1:1. |
| `GET /api/platform/db` | Legacy `platformDbRouter.get('/db')` at `masterDataRoutes.ts:208` returns `checkDatabase()` with no actor. |

`GET /api/master/db` is not mounted. `server.ts` mounts `platformDbRouter` only at `/api/platform`.

## ج. حقول حساسة

`docs/MIGRATION/phase-2a/parity_results.json` (`generatedAt=2026-10-17T14:48:38.283Z`, `passed=159`, `failed=0`, `total=159`) stores status, not response bodies. The harness compares canonical JSON bodies at `scripts/parity/run-phase2a-parity.mjs:162-163` via `normalizePayload`. This close did not recapture a customer payload. Password hashes and access tokens are not fields of these 19 master-data responses. Customer access to BOM and raw materials remains SEC-MD-01.

## د. أوامر الفحص

Command output for `npm audit`, the source searches, `npmmirror`, and `curl.exe -I` is pasted in `REVIEW.md` after those commands run on 2026-10-18. This section is not a substitute for that output.

## هـ. اختبارات سلبية

The same parity file records anonymous 401, customer, limited, granular, and writer results for these routes. It was not re-run on 2026-10-18 because `scripts/parity/run-phase2a-parity.mjs` seeds with `TRUNCATE`, and this task did not approve a destructive command.

## و. Findings

| ID | Description | Severity | Origin | Status | Owner |
|---|---|---|---|---|---|
| SEC-MD-01 | `assertCanViewMasterDataCatalog` returns immediately for `userType === 'customer'` (`rbac.ts:710-711`), so a customer can read BOMs and raw materials. | High | Legacy, ported 1:1 | Open, not tightened | User |
| SEC-MD-02 | Attachment list and download have no auth (`masterDataRoutes.ts:322` and `:345`). | High | Legacy, ported 1:1 | Open, not tightened | User |
| FIND-2A-01 | `GET /api/v2/cables/products` and `GET /api/v2/cables/products/facets` were removed from Nest registration and from `nestRoutes.mjs`. The user approved completing that removal on 2026-10-18. The five e2e cases are `it.todo` with the same names. The twelve parity checks are in "Phase 3 deferred" and are not in the 2a score. Legacy still serves the routes. | Low | User decision | Deferred to Phase 3 | User |
| FIND-2A-02 | `admin-customers.service.ts` was 314 lines and `customer-catalog.repository.ts` was 306 lines. Split on 2026-10-18 into presenters (98) and facets (171). The service is 221 lines and the repository is 145 lines after the unused import removal. `check-rules` then passed rule (b). | Low | Existing Nest files | Split, behavior unchanged | User |
| FIND-2A-03 | `npm audit --omit=dev` on 2026-10-17 reported 4 high findings in `energya-backend`, all in the Prisma chain, and 13 at the repo root including critical `proxy-addr`. No package was upgraded in this round. | High (dependency) | Existing lockfiles | Open, recorded only | User |
| FIND-2A-04 | Root `.env.example` already contains placeholder connection strings and passwords. It was not rewritten. `energya-backend/.env.example` was added with names only. | Low | Existing file | Open | User |
