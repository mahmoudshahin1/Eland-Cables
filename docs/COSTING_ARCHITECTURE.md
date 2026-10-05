# Costing Architecture — Single Authoritative Engine

## Principle

**One engine:** `costingOrchestrationService` (`executeCostingPreview`, `executeCostingForInquiryLine`)

**Cost ≠ price:** `commercialPricingEngine` handles selling price separately.

## Old path (retired for production)

```
CostingPricing.tsx (mock LME)
TechnicalOfficeCostingWorkbench → POST /api/costing/calculate
  → executeCostingRun (Inc 10 material-only)
```

## New path (authoritative)

```
CommercialInquiryDetail
  → POST /api/inquiries/:id/lines/:lineId/calculate-cost
  → calculateInquiryLineCost
  → executeCostingForInquiryLine
  → BOM + RawMaterialPrice + Scrap + Formula layers
  → CostingCalculation + CostingRun

TechnicalOffice / cable-level:
  → POST /api/costing/calculate (compatibility adapter)
  → executeCostingRun → delegates to Inc 13 orchestrator

Administration → Costing Configuration:
  → /api/admin/costing/* (methods, variables, formulas, scrap, BOM costing, preview)
```

## Control plane vs execution

| Layer | UI | API |
|-------|-----|-----|
| Configuration | `CostingHub` / `AdministrationCostingPanel` | `/api/admin/costing/*` |
| Inquiry execution | `CommercialInquiryDetail` Costing tab | `/api/inquiries/.../calculate-cost` |
| Quotation snapshot | Quotation detail | `GET /api/quotations/:id/costing` |
| Quick quote | `CostingCalculator` | `/api/admin/costing/calculator/preview` |

## Persistence model

- `CostingCalculation` — immutable snapshot (input/reference/output)
- `CostingRun` — material layer run linked to calculation
- `CommercialInquiryLine.costingCalculationId` — current line costing
- `CommercialQuotationLine.costingCalculationId` — frozen at quotation creation

## Extension points (disabled until business approval)

1. LME + additive from `commercialMetadata` metal rates
2. ELAND additive constants
3. Incoterm / shipping / freight layers
4. Dynamic MV scrap RULE-S002

See `docs/INCREMENT_13_PHASE_E_IMPLEMENTATION_PLAN.md` §22.
