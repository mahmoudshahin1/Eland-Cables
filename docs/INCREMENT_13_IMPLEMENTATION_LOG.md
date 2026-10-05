# Increment 13 — Implementation Log

## Phase A — Discovery & Planning (2026-08-21) ✅

- Created `INCREMENT_13_COSTING_RULE_DISCOVERY.md`
- Created `INCREMENT_13_IMPLEMENTATION_PLAN.md`
- Status: ANALYSIS COMPLETE

## Phase B — Schema (2026-08-22) ✅

- Migration: `20260822120000_increment13_costing_configuration`
- Models: `CostingConfiguration`, `CostingConfigurationVersion`, `CostingVariable`, `CostingComponent`, `CostingFormula`, `CostingFormulaVersion`, `CostingFormulaDependency`, `CostingCalculation`, `CostingCalculationSnapshot`
- Extended `CostingRun.configurationVersionId` (nullable)
- RBAC permissions added to `permissionCatalog.ts`

## Phase C — Formula Engine (2026-08-22) ✅

- `src/domain/costingDecimal.ts` — fixed-precision arithmetic
- `src/domain/costingFormulaEngine.ts` — tokenizer, parser, AST, validator, evaluator
- `src/server/costingFormulaRepository.ts` — persistence layer
- `src/server/costingAdminRoutes.ts` — `/api/admin/costing/*` routes
- `src/server/rbac.ts` — costing formula admin assertions
- Tests: `costingFormulaEngine.test.ts` (23 cases), `increment13.costing.test.ts` (17 cases)

## Documentation (2026-08-22) ✅

- `INCREMENT_13_PHASE_BC_IMPLEMENTATION_PLAN.md`
- `COSTING_ENGINE_ARCHITECTURE.md` (updated)
- `COSTING_FORMULA_LANGUAGE.md`
- `COSTING_FORMULA_SECURITY.md`
- `COSTING_VERSIONING.md` (updated)
- `COSTING_SNAPSHOT_MODEL.md` (updated)
- `RAW_MATERIAL_PRICE_INTEGRATION.md`
- `ELAND_COSTING_GOLDEN_REGRESSION.md` (placeholder)
- `BUSINESS_RULES.md` (costing vs commercial pricing)

## Not started

| Phase | Deliverable |
|---|---|
| D | Configuration CRUD UI + approval workflow |
| E | Scrap rule engine |
| F | Process cost rules |
| G | Incoterm/shipping |
| H | BOM + RM orchestrator |
| I | Calculation persistence + inquiry link |
| J–M | UI (Costing tab, Admin hub, Formula Builder, Simulation) |

## Key decisions recorded

- EX_WORK is configurable costing component — not hard-coded 6%
- RawMaterialPrice remains authoritative
- Costing engine does not calculate commercial margin
- ELAND workbook = golden regression artifact only (not in repo)
