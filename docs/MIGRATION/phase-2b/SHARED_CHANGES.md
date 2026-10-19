# Phase 2b shared changes

Commit `025358e` modified these 20 files on top of `phase-2a-accepted`. The lines below say what moved, why it is in the port, and whether the behavior of Phase 1 or Phase 2a reads changed.

| File | What changed | Why | Behavior |
|---|---|---|---|
| `energya-backend/src/auth/jwt-auth.guard.ts` | `JwtAuthGuard` helpers became `protected`, and `OptionalJwtAuthGuard` was added. A missing or invalid token becomes `{ userType: 'anonymous' }` and the request continues. | Phase 2b export routes accept an anonymous actor and still run. | Phase 1 and Phase 2a guards still reject a missing token. The new guard is additive. |
| `energya-backend/src/common/filters/domain-exception.filter.ts` | A 400 whose body already has `code` and `error` is returned whole. Before, the filter kept only those two fields. | See the filter section below. | A 400 that only had `error` and `code` is unchanged. Extra keys are no longer dropped. |
| `energya-backend/src/common/guards/master-data-auth.guard.ts` | Write, import, export, scrap, costing, price, mapping, BOM governance, and pricing guards were added. | The new mutation routes need the legacy permission checks. | Existing `MasterReadAuthGuard` and `DrumComputeAuthGuard` stay in place. |
| `energya-backend/src/master-data/boms/boms.controller.ts` | `POST /api/master/boms/excel-commit` was added. | Port of the legacy BOM excel commit. | `GET /api/master/boms` is unchanged. |
| `energya-backend/src/master-data/boms/boms.repository.ts` | `persistExcelCommit` was added. | The new commit route writes governed BOM lines. | `listBoms` is unchanged. |
| `energya-backend/src/master-data/boms/boms.service.ts` | `commitExcel` was added. A `VALIDATION_ERROR` becomes a 400 with `error` and `code`. | Service wrapper for the new route. | `listBoms` is unchanged. |
| `energya-backend/src/master-data/cables/cables.controller.ts` | `POST /api/master/cables` and `PUT /api/master/cables/:materialNumber` were added behind `MasterWriteAuthGuard`. | Port of cable create and update. | The Phase 2a GET routes are unchanged. |
| `energya-backend/src/master-data/cables/cables.repository.ts` | Create and update writes, plus audit, were added. | Persistence for the new cable routes. | List and get stay the read path. |
| `energya-backend/src/master-data/cables/cables.service.ts` | `createCable` and `updateCable` were added. | Same port. | Search and get are unchanged. |
| `energya-backend/src/master-data/drums/drums.controller.ts` | Create, update, delete, excel preview, and excel commit were added. | Port of the drum write and excel routes. | The Phase 2a read and optimization routes stay. |
| `energya-backend/src/master-data/drums/drums.repository.ts` | Create, update, status, delete, and excel preview/commit were added. | Persistence for those routes. | `listDrums` and `getDrum` stay. |
| `energya-backend/src/master-data/drums/drums.service.ts` | The write and excel methods were added. Excel header failures include `missing`. | Match the legacy excel error body. | Capacity, candidates, validate, and optimize stay. |
| `energya-backend/src/master-data/master-data.module.ts` | `MarketMetalsSubModule`, `ExportsSubModule`, and `ImportsSubModule` were registered. | The new modules have to be mounted. | The Phase 2a modules stay registered. |
| `energya-backend/src/master-data/raw-materials/raw-materials.controller.ts` | Create, update, and `POST .../prices` were added. | Port of raw-material writes. | `GET /api/master/raw-materials` is unchanged. |
| `energya-backend/src/master-data/raw-materials/raw-materials.repository.ts` | Create, update, and price append were added. | Persistence for those routes. | The list query stays. |
| `energya-backend/src/master-data/raw-materials/raw-materials.service.ts` | The same three operations were added, including `PRICE_NOT_CONFIGURED`. | Match the legacy blank-price rejection. | The list method is unchanged. |
| `energya-backend/src/shared/infra/legacy-ports.ts` | `redactSecrets` now turns a Prisma `Decimal` into a number and a `Date` into an ISO string before audit JSON is stored. | `writeAudit` is used by the new writes. A Decimal cannot be stored as JSON. | Used only by `writeAudit`. Phase 2a read responses do not go through it. |
| `scripts/parity/nestRoutes.mjs` | Phase 2b mutation, import, export, and market-metal routes were added on `/api/master/...` only. | The hybrid proxy has to send those routes to Nest. | `GET /api/platform/db` stays the only `platform` route. Catalog routes were not added back. |
| `scripts/parity/seed-auth.mjs` | Before deleting a non-standard customer, the seed deletes delivery combinations, addresses, contacts, and external mappings. | Those child rows block the customer delete once the 2b schema is in use. | Seed only. No request handler changed. |
| `scripts/parity/seed-master-data.mjs` | The master-data truncate now also clears `ImportBatch` and `ImportBatchRow`. | The new import tables have foreign keys into the truncated masters. | Seed only. |

## `domain-exception.filter.ts`

The 400 branch used to answer `{ error, code }` whenever both fields were present. It now sends the exception body unchanged.

The caller that needs the extra field is the drum excel port. `DrumsService.previewDrumExcel` and `DrumsService.commitDrumExcel` throw `BadRequestException` with `{ error, code, missing }` for `INVALID_TEMPLATE_HEADERS` and `VALIDATION`. The legacy handler `pgError` in `src/server/masterDataCutoverRoutes.ts` returns the same three fields for those codes. Without the filter change, Nest would drop `missing` on `POST /api/master/drums/excel-preview` and `POST /api/master/drums/excel-commit`.

Phase 1 and Phase 2a were not shifted by this. On `phase-2a-accepted` and on this branch, Phase 1 e2e is `69 passed | 1 todo`. The Phase 1 sequential parity and the 150-check matrix produced the same totals on the tag and on this branch. The Phase 2a HTTP checks passed; the one new failure is the proxy-table check that now sees the 2b routes as Nest routes.

## خط الأساس

Phase 1 e2e is `69 passed | 1 todo` (70 tests) since commit `3693e4a` on 15/10, which turned `TEST 1-4` into `it.todo`. A recorded "70 passed" older than that commit, including `docs/MIGRATION/REVIEW_PHASE_1.md` line 160, is the count from before that deferral. That review file was not edited.
