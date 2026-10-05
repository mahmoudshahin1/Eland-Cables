# Costing Migration — Old Path to Increment 13

## Deprecated (production)

| Component | Was | Now |
|-----------|-----|-----|
| `CostingPricing.tsx` mock UI | Hard-coded LME | `CostingHub` → governed configuration |
| `executeCostingRun` Inc 10 engine | Material-only BOM×price | Adapter → `executeCostingForInquiryLine` |
| Customer `materialCost` visibility | Exposed on inquiry lines | Hidden via projection + field manifest |

## Compatibility adapters (retained)

| Endpoint | Behavior |
|----------|----------|
| `POST /api/costing/calculate` | Delegates to Inc 13 orchestrator; returns `costingRun` + `calculationId` |
| `POST /api/costing/:id/recalculate` | New run via orchestrator; prior run immutable |
| `executeCostingRun()` | Same adapter for tests and legacy callers |

## Database migrations (Increment 13 sequence)

1. `20260822120000_increment13_costing_configuration`
2. `20260822130000_increment13_phase_d_scrap_workflow`
3. `20260822140000_increment13_phase_e_inquiry_costing`
4. `20260822150000_increment13_phase_f_exchange_rates`
5. `20260822160000_increment13_phase_e_quotation_costing_snapshot` — `CommercialQuotationLine.costingCalculationId`

## Deploy

```bash
npx prisma migrate deploy
# Restart dev server after API changes: npm run dev
```
