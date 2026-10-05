# Costing Engine

> **Authoritative implementation:** `src/server/costingOrchestrationService.ts`  
> **See also:** [`COSTING_ARCHITECTURE.md`](./COSTING_ARCHITECTURE.md), [`COSTING_ENGINE_ARCHITECTURE.md`](./COSTING_ENGINE_ARCHITECTURE.md)

## Overview

The Increment 13 costing engine is the **single production calculation path**. It orchestrates governed master data and configuration into an immutable `CostingCalculation` snapshot.

## Execution flow

```
Input (inquiry line / preview / cable-level adapter)
  → Readiness gates (cable, BOM, RM price, costing config)
  → BOM resolution (governed lines + quantities)
  → RawMaterialPrice resolution (approved, effective)
  → Scrap rules (governed rates per line/cable)
  → Formula layers (tokenizer → AST → validator → evaluator)
  → CostingCalculation + CostingRun persistence
```

## Entry points

| Function | Purpose |
|----------|---------|
| `executeCostingForInquiryLine` | Production inquiry-line costing (persisted) |
| `executeCostingPreview` | Admin preview / calculator (no inquiry line) |
| `executeCostingRun` | **Adapter only** — delegates to orchestrator for `/api/costing/calculate` |

## Formula engine

Safe expression evaluation in `src/domain/costingFormulaEngine.ts`:

- No `eval()` / `new Function()`
- Tokenizer → parser → validator → evaluator
- Governed variables from `CostingVariable` metadata

## Error codes

Structured failures (never generic "calculation failed"):

- `BOM_NOT_READY`, `RAW_MATERIAL_PRICE_MISSING`, `RAW_MATERIAL_PRICE_EXPIRED`
- `COSTING_CONFIGURATION_NOT_READY`, `FORMULA_INVALID`, `SCRAP_RULE_NOT_FOUND`
- `UNAUTHORIZED_COSTING_ACCESS`

Full list: [`COSTING_ERROR_CODES.md`](./COSTING_ERROR_CODES.md)

## Extension points (disabled)

1. LME + additive from header metal rates  
2. ELAND additive constants  
3. Incoterm / shipping / freight  
4. Dynamic MV scrap RULE-S002  

These require business approval before activation.
