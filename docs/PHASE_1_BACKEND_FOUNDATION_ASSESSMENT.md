# Phase 1 — Backend foundation assessment

**Date:** 2026-08-19  
**Scope:** inspect only. No NestJS/Prisma created. No Increment 2.

An earlier report that this repo contains an “incomplete NestJS/Prisma skeleton” is **incorrect for this codebase**. What exists is the Google AI Studio prototype: **Vite + React SPA + a single Express process**.

---

## 1. Current NestJS structure

**None.** There is no `apps/api`, no `nest-cli.json`, no `@nestjs/*` dependency, no Nest modules.

## 2. Current Prisma structure

**None.** No `prisma/schema.prisma`, no `PrismaClient`, no migrations folder.

## 3. Existing schema

**None in a database.** Commercial shape is TypeScript:

- `ErpRequestHeader` / `ErpRequestItem` in [`src/types.ts`](../src/types.ts)
- Seed: `INITIAL_ERP_REQUESTS` in [`src/data/mockData.ts`](../src/data/mockData.ts)
- Master data: catalog/BOM localStorage; drums/RM from Increment 2 services

This is **not** a production schema (no FKs, no version rows, lines embedded on header).

## 4. Existing modules

| Area | Location | Notes |
|------|----------|--------|
| HTTP + Vite | [`server.ts`](../server.ts) | Auth, AI stub, fake D365/Advaris, master-data import stub |
| Inquiry/Quotation UI | `InquiryQuotationHome`, `InquiryQuotationWorkspace`, `ErpCustomerRequestView` | Increment 1 home + prototype detail |
| List service | `listInquiriesAndQuotations()` in `inquiryQuotationHomeService.ts` | Abstraction for Home |
| Cable | `cableConstraintEngine`, V1/V2 configurator | Must not duplicate |
| Master data | catalog/BOM/drum/RM + Import Center | localStorage |
| Costing UI | `CostingPricing.tsx` | Hard-coded formula in React — not a domain engine |

## 5. Missing modules (target modular monolith — not now)

When approved: `Identity`, `Commercial` (inquiry/quotation), `CableEngineering`, `MasterData`, `Costing`, `Documents`, `Workflow`, `Integration` (D365 adapter only).

## 6. Missing dependencies

Not in `package.json`: `@nestjs/common`, `@prisma/client`, `pg`, workflow libs. Adding them is **out of scope** until backend increment is approved.

## 7. Existing API patterns

Express JSON routes, JWT Bearer on `/api/auth/*`. Stubs:

- `POST /api/master-data/import` — does not persist
- `GET /api/d365/sync-status` — always “connected”
- `GET /api/advaris/mes-status` — mock
- `POST /api/ai/assistant` — Gemini if key present

**No** `/api/inquiries` or `/api/quotations`. Home does not call HTTP.

## 8. Existing database configuration

No PostgreSQL URL. Persistence: in-memory users in `server.ts`; `localStorage` for catalog/BOM/drums/RM/import batches; React state for ERP requests.

## 9. Authentication architecture

JWT (jsonwebtoken) issued by Express. Users in process memory. Passwords stored as plaintext fields named `passwordHash`. Tokens in `localStorage`. Issuer/audience strings mention “DotNet9” — branding only; there is **no** .NET host.

## 10. Authorization architecture

`ModulePermissions` booleans on the user. UI `hasPermission` on Home toolbar. **No** resource-level checks on APIs (quotations are not on the API). Customer filter is client-side string match on company name. **UI permission ≠ security.**

Required later (server-side):

| Role | Must |
|------|------|
| Customer | Own transactions only |
| Sales | Commercial docs; not costing rules |
| Costing | Costing config / formulas |
| Technical | Cable/BOM/engineering; not necessarily prices |
| Administrator | Users, roles, platform config |

## 11. Environment configuration

[`.env.example`](../.env.example): `GEMINI_API_KEY`, `JWT_SECRET`, `APP_URL` (still says 5173; app listens **3847**), `DOTNET_ENVIRONMENT`. No `DATABASE_URL`.

## 12. Problems preventing backend startup

A **Nest/Prisma backend cannot start because it does not exist.** Express+Vite **does** start (`npm run dev` → port 3847). Risks if Nest were added now: two HTTP servers, duplicate JWT, no schema.

## 13. Recommended backend module structure

**Modular monolith** (one deployable API), evolve current Express **or** introduce Nest later as a single app — not microservices.

```
api/
  identity/
  commercial/     # inquiry-quotation
  engineering/    # cable, BOM, TCR
  master-data/
  costing/
  documents/
  workflow/
  integration/    # D365 adapter only
```

Domain services must not import D365 SDK.

## 14. Recommended database architecture

PostgreSQL + Prisma (when Increment backend is approved):

- Relational tables for header, version, line, cutting length, drum assignment
- Effective-dated prices/rules
- Audit columns + import batch
- Optimistic concurrency (`updatedAt` / version)
- No CSV-in-cell for lengths/drums; no eval() of user formulas

## 15. Recommended migration strategy

1. Keep Home on `listInquiriesAndQuotations()`.
2. Move seed behind a repository (`InMemoryCommercialRepository`).
3. Add PostgreSQL + Prisma; repository swap.
4. Persist master data currently in localStorage.
5. D365 adapter last; never dual-write from React.

---

**Checkpoint:** do not create tables or Nest apps until approved.
