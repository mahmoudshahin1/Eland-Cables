# 11 — V1 / V2 Runtime Boundary

**Task:** 02 — Platform Foundation  
**Date:** 2026-09-04

## Coexistence model

| Concern | Decision |
|---------|----------|
| Deployable | **One** modular monolith (`server.ts` + Vite SPA) |
| Database | **One** PostgreSQL via Prisma — shared |
| V1 routes | Preserved: `/customer/*`, `/internal/*`, `/api/*` (non-v2) |
| V2 routes | Additive: `/v2/*` shell, `/api/v2/*` platform APIs |
| Auth | Same JWT / sessions |
| Rollback | Disable `/v2` nav + leave `/api/v2` unused; DB migrations are additive (no V1 table drops) |

## Route map

| Surface | Path | Notes |
|---------|------|-------|
| V1 customer shell | `/customer/*` | Unchanged |
| V1 internal shell | `/internal/*` | Unchanged |
| V2 ERP shell | `/v2`, `/v2/security` | Energya branding; platform navigator |
| V2 APIs | `/api/v2/*` | Modules, metadata, sequences, effective access, audit |
| Integrations | `/api/d365/*`, `/api/advaris/*` | Remain stubs |

## Deploy / restart

New Express mounts (`/api/v2`) require **process restart** — Express does not hot-reload routes.

## DB

Additive migration `20260904120000_v2_platform_foundation`:

- `NumberSequence`
- `SecurityGroup`, `SecurityGroupMember`, `SecurityGroupRole`
- `PlatformFieldDefinition` columns: `tab`, `fieldSecurity`, `lookupEntity`, `lookupDisplayField`

## Freezes respected

- Phase 1 commercial fulfillment domain — not modified
- Costing Option B / Decision 5 — not modified
- D365/Advaris — no HTTP; status endpoints report NOT_IMPLEMENTED / NOT_CONNECTED
