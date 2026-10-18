# Phase 2a `any` cleanup plan

Not executed. Counts are `\bany\b` in `energya-backend/src` `*.ts` on 2026-10-18. Total at the baseline: 143 (`scripts/check-rules.baseline.json`).

Do not edit these files as part of the Phase 2a close. Order is by path.

| File | `any` count | Later change |
|---|---:|---|
| `energya-backend/src/admin-customers/admin-customers.controller.ts` | 12 | Phase 1. Replace query and body `any` with the existing DTO types. |
| `energya-backend/src/admin-customers/admin-customers.repository.ts` | 3 | Phase 1. Type the Prisma result rows. |
| `energya-backend/src/admin-customers/admin-customers.service.ts` | 18 | Phase 1. Type service inputs. This file is also 314 lines with no spec. |
| `energya-backend/src/admin-identity/admin-identity.controller.ts` | 17 | Phase 1. Use the DTOs already declared in `dto/admin-identity.dto.ts`. |
| `energya-backend/src/admin-identity/admin-identity.repository.ts` | 1 | Phase 1. |
| `energya-backend/src/admin-identity/admin-identity.service.ts` | 12 | Phase 1. |
| `energya-backend/src/app.controller.ts` | 2 | Leave the health query result typed as the health object. |
| `energya-backend/src/auth/auth.controller.ts` | 6 | Phase 1. Use `LoginDto` and the other DTOs that are already imported. |
| `energya-backend/src/auth/auth.service.ts` | 6 | Phase 1. |
| `energya-backend/src/auth/jwt-auth.guard.ts` | 2 | Phase 1. Type the JWT payload. |
| `energya-backend/src/common/filters/domain-exception.filter.ts` | 16 | Type the exception payload instead of `any`. |
| `energya-backend/src/common/filters/domain-exception.filter.spec.ts` | 1 | Test only. |
| `energya-backend/src/common/guards/master-data-auth.guard.ts` | 3 | Type the caught error as `unknown` and narrow it. |
| `energya-backend/src/inquiries/inquiries.controller.ts` | 6 | Phase 4. The module is no longer registered. |
| `energya-backend/src/inquiries/inquiries.service.ts` | 9 | Phase 4. Same as the controller. |
| `energya-backend/src/master-data/cables/attachments.controller.ts` | 1 | Phase 2a. Give the upload body a DTO. |
| `energya-backend/src/master-data/cables/cables.controller.ts` | 1 | Phase 2a. Type the list query. |
| `energya-backend/src/master-data/cables/cables.service.ts` | 1 | Phase 2a. |
| `energya-backend/src/master-data/cables/customer-catalog.controller.ts` | 1 | Mounted early for the catalog. Type the products query. |
| `energya-backend/src/master-data/cables/customer-catalog.repository.ts` | 3 | 306 lines and no spec. Type the catalog rows when that file is split. |
| `energya-backend/src/master-data/common/master-data-dto.ts` | 1 | Replace the loose DTO field. |
| `energya-backend/src/master-data/drums/drum-optimization.service.ts` | 6 | Type the drum request bodies. |
| `energya-backend/src/master-data/drums/drums.controller.ts` | 4 | Four `@Body() body: any` handlers. |
| `energya-backend/src/master-data/drums/drums.service.ts` | 7 | Same request objects as the controller. |
| `energya-backend/src/master-data/reference/reference.repository.ts` | 1 | Type the raw query result. |
| `energya-backend/src/shared/domain/masterDataSoT.ts` | 3 | Domain copy. Change it only together with the legacy file. |

Suggested order when a later phase is allowed to touch the file: controllers and DTOs first, then the service that consumes those types, then repositories. Phase 1 and Phase 4 files stay untouched until those phases are open.
