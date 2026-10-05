## Increment 14 — Low-code Costing Team workspace (2026-08-23)

- Plan: [`INCREMENT_14_LOW_CODE_COSTING_IMPLEMENTATION_PLAN.md`](./INCREMENT_14_LOW_CODE_COSTING_IMPLEMENTATION_PLAN.md)
- Engine unchanged: `executeCostingForInquiryLine`
- Admin Preview now uses the same orchestrator with `persist: false`
- Additive formula assignment columns (`GLOBAL` / `FAMILY` / `CABLE`)
- Costing Team tabs: prices, scrap, variables, formulas, assignment, other costs, validation, preview, versions, approval, audit
- APIs: `/api/admin/costing/raw-material-prices`, `/readiness`, `/validate`


**Date:** 2026-08-22

## Phase 0 — Audit

- Created [`FINAL_PLATFORM_GAP_ANALYSIS.md`](./FINAL_PLATFORM_GAP_ANALYSIS.md) — full requirement classification

## Phase 1 — Architecture

- [`FINAL_PLATFORM_ARCHITECTURE.md`](./FINAL_PLATFORM_ARCHITECTURE.md)
- [`LOW_CODE_CONFIGURATION.md`](./LOW_CODE_CONFIGURATION.md)

## Phase 2–4 — Costing consolidation + extension layers

- **Verified:** Single engine (`executeCostingForInquiryLine`); legacy adapter only
- **New:** `costingExtensionLayers.ts` — metal, logistics, packing resolution with `NOT_CONFIGURED`
- **Orchestrator:** Extension layer snapshot in `CostingCalculation.outputSnapshot`

## Phase 3 — Low-code configuration models

**Migration:** `20260822170000_final_consolidation_low_code_config`

| Model | Purpose |
|-------|---------|
| `CostingMetalRate` | Governed metal rates (no fake seed) |
| `CostingLogisticsRule` | Incoterm + destination |
| `CostingPackingRule` | Drum/packing |
| `PlatformFieldDefinition` | Field metadata |
| `NotificationRule` | Notification routing |
| `ReportDefinition` | Report metadata |

**APIs:** `/api/admin/platform/*` via `platformAdminRoutes.ts`

## Phase 5 — Inquiry UI

- `CommercialInquiryDetail` tabs: Overview, Cable Lines, Commercial Terms, Construction, Drum Plan, Costing, Documents, Version History, Audit
- Header preserved
- Persist costing auto-creates missing engineering mapping from Cable Master SOURCE fields and auto-approves `DRAFT` / `SUBMITTED` / `UNDER_REVIEW` (`ensureEngineeringMappingApprovedForCosting`). Gate 1 still requires `APPROVED`. `REJECTED` / `CANCELLED` still block. Preview does not auto-approve. BOM and price gates unchanged.

## Phase 7 — Dashboard real data

- `dashboardKpiService.ts` + `GET /api/admin/platform/dashboard/kpis`
- `InternalDashboard` top KPIs from PostgreSQL (removed fake % trends)

## Phase 8 — Admin costing UI

- `AdministrationCostingPanel`: Metal Rates, Incoterm/Destination, Drums/Packing tabs

## Fixture restoration

- `npm run import:masters` → `scripts/importAllMasters.ts`
- Required for Inc 4/5/8 tests (432 cables, 81 BOM conflicts)

## Verification

| Check | Result |
|-------|--------|
| `npx prisma migrate deploy` | ✅ |
| `npx tsc --noEmit` | ✅ |
| Increment 13 tests | Run after server restart |

## Remaining (CONFIGURATION_REQUIRED / business decision)

- Metal rate amounts (structure exists)
- Logistics/shipping costs (structure exists)
- Packing cost amounts (structure exists)
- LME + additive formula policy
- ELAND constants
- Report builder UI execution
- Notification delivery integration
- Browser acceptance (manual)
- Full `import:masters` on dev DB for Inc 4/5/8
