# 12 — Module Registry & Data Ownership

**Source of truth (code):** `src/platform/moduleRegistry.ts`, `src/platform/dataOwnershipMatrix.ts`  
**API:** `GET /api/v2/modules`, `GET /api/v2/modules/navigable`, `GET /api/v2/data-ownership`

## Contract (every module)

`moduleId`, `displayName`, `category`, `status` (`LIVE|PARTIAL|FROZEN|PLANNED|STUB|NOT_IMPLEMENTED`), `ownedEntities`, `ownedApis`, `dependencies`, `workspaceEntry`, `surfaces` (Workspace|Master|Tx|Setup|Workflows|Reports|Dashboards), `permissions`, `invariants`, `integrationHooks`.

## Navigation policy

Default navigator (`listNavigableModules`) exposes only modules where:

- `navDefault === true`
- status ∈ { LIVE, PARTIAL, FROZEN }
- `workspaceEntry` is set (Task 03: under `/v2/modules/...`)

**No fake screens** for PLANNED / STUB / NOT_IMPLEMENTED.

`legacyWorkspaceEntry` preserves V1 hub paths for coexistence bridges.

Task 03 IA helpers: `src/platform/moduleIa.ts` (surfaces, breadcrumbs, workspace contracts, ownership surfaces). See [17_TASK03_MODULE_IA.md](./17_TASK03_MODULE_IA.md).

## Pattern

Organizational D365-inspired surfaces only — **no** second Customer / Pricing / Costing / Engineering-BOM authority.

## Data ownership

Machine-readable matrix lists write owner + read modules. Frozen rows: `EpcSalesOrder`, `SalesAgreement`, `AgreementRelease`, `CommercialCommitment`, `CostingMetalCostComponent`.
