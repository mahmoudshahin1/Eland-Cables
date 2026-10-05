# Costing Engine Architecture (Increment 13 Extension)

## Overview

Increment 13 extends Increment 10 with a **configuration control plane** and **safe formula engine**. The material costing domain (`costingEngine.ts`) remains unchanged when no published configuration exists.

```
┌─────────────────────────────────────────────────────────────────┐
│ LAYER 1 — Configuration (admin, versioned)                      │
│   CostingConfiguration → CostingConfigurationVersion            │
│   CostingVariable registry, CostingComponent (EX_WORK, etc.)      │
│   CostingFormula → CostingFormulaVersion + Dependencies         │
└─────────────────────────────────────────────────────────────────┘
                              │
┌─────────────────────────────────────────────────────────────────┐
│ LAYER 2 — Governed data (Increment 10)                          │
│   GovernedBomLine, RawMaterialPrice, Engineering Mapping        │
│   4-Gate Readiness                                              │
└─────────────────────────────────────────────────────────────────┘
                              │
┌─────────────────────────────────────────────────────────────────┐
│ LAYER 3 — Engines                                               │
│   costingEngine.ts — material cost (Increment 10)               │
│   costingFormulaEngine.ts — safe expression evaluation (Inc 13)   │
│   Orchestrator (Phase H) — combines layers                      │
└─────────────────────────────────────────────────────────────────┘
```

## Key architectural decisions

| Decision | Implementation |
|---|---|
| EX_WORK loading | Configurable `CostingComponent` kind `EX_WORK`; formula uses `EX_WORK_RATE` variable — **not hard-coded 6%** |
| Raw material prices | `RawMaterialPrice` remains authoritative — no duplicate price master |
| Commercial pricing | Strictly separate — costing engine does not calculate margin/selling price |
| Incoterm/shipping | Deferred to Phase G — not in Phase B+C schema execution |
| Decimal arithmetic | `costingDecimal.ts` — fixed-precision BigInt, no JS float |

## Module map

| Module | Path |
|---|---|
| Material engine | `src/domain/costingEngine.ts` |
| Formula engine | `src/domain/costingFormulaEngine.ts` |
| Decimal arithmetic | `src/domain/costingDecimal.ts` |
| Formula repository | `src/server/costingFormulaRepository.ts` |
| Admin API | `src/server/costingAdminRoutes.ts` |
| Runtime API (Inc 10) | `src/server/costingRoutes.ts` |

## Phase B+C boundaries

**In scope:** Schema, parser, validator, evaluator, admin API, audit, RBAC.

**Out of scope:** BOM execution, scrap execution, incoterm, inquiry integration, UI, orchestrator activation.
