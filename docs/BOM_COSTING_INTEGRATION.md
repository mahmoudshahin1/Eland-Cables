# BOM Costing Integration (Phase D)

Preview orchestration path:

```
CableMaster
  → CableEngineeringMapping (Gate 1: APPROVED)
  → GovernedBomLine (Gate 2: approved, no conflicts)
  → RawMaterial master (Gate 3)
  → RawMaterialPrice APPROVED + ACTIVE (Gate 4)
  → scrapPercentage / CostingScrapRule
  → material line costs
```

Implemented in `costingOrchestrationService.ts`. Does not modify BOM or prices.

Extension point: inquiry line context via `costingRequestService.ts` (Phase I).
