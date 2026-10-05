# Costing Inquiry Integration

## Production path

Admin **Preview / Validate / Readiness** use the same orchestrator with `persist: false`.

CommercialInquiryDetail
  → POST /api/inquiries/:id/lines/:lineId/calculate-cost
  → calculateInquiryLineCost (commercialRepository)
  → executeCostingForInquiryLine (orchestrator)
  → CostingCalculation persisted
  → CommercialInquiryLine.costingCalculationId updated
```

## On line add (Path A)

`addInquiryLine` auto-calculates when cable is mapped and readiness is `READY_FOR_COSTING`. Failures set `costingReadinessStatus: NOT_READY` (not silently swallowed).

## Inquiry detail UI

Costing tab shows (authorized users):

- Status: READY / NOT READY / CALCULATED / ERROR  
- Calculation ID, costing method, BOM version  
- Raw material price versions, scrap rules  
- Breakdown: Material, Scrap, Total  
- Expandable BOM line detail  

Header layout is preserved (inquiry number, customer, version, status, actions).

## Submit gate

`CALCULATION_REQUIRED` — mapped lines must have `costingCalculationId` before submit.

Post-submit: `COSTING_LOCKED` — recalculate blocked.

## Persistence

All inquiry data in PostgreSQL — refresh/reopen preserves state. Not localStorage.

## Customer view

Customers see commercial status only. Internal costing fields hidden server-side.

## APIs

| Method | Route |
|--------|-------|
| POST | `/api/inquiries/:id/lines/:lineId/calculate-cost` |
| GET | `/api/inquiries/:id/lines/:lineId/costing` |

RBAC: `COSTING.CALCULATION.CALCULATE`, `COSTING.CALCULATION.VIEW`
