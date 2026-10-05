# Increment 13 — Phase D Implementation Log

> Date: 2026-08-22  
> Status: **COMPLETE**

## Delivered

- Migration `20260822130000_increment13_phase_d_scrap_workflow`
- `CostingScrapRule` model + workflow enum extensions
- `costingOrchestrationService.ts` — BOM + scrap + layer preview
- `costingRequestService.ts` — structured request for inquiry prep
- `costingScrapRuleRepository.ts` — scrap CRUD + workflow
- Extended `costingAdminRoutes.ts` — methods, layers, scrap-rules, preview, audit, approval-queue
- `AdministrationCostingPanel.tsx` — full costing config UI
- RBAC: SCRAP_RULE, PREVIEW, AUDIT permissions
- Tests: `increment13.phaseD.test.ts` (41+ scenarios)
- Documentation: plan, versioning, BOM integration, scrap engine, UI

## Not delivered (by design)

- Commercial pricing / selling price
- Incoterm/shipping execution
- Inquiry calculate-cost wiring
- ELAND golden regression (workbook not in repo)

## Phase E next

- Dynamic MV scrap formulas (RULE-S002)
- Full scrap rule resolution ambiguity handling
