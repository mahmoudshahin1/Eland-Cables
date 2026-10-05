# Increment 13 Phase E — Implementation Log (Stages F–I)

**Date:** 2026-08-22  
**Status:** Stages F–I delivered

## Summary

Completed final costing engine integration: single Increment 13 orchestrator for all production paths, legacy UI retired, quotation costing snapshots, customer isolation hardened.

## Stage F — Replace legacy costing UI

| Change | Detail |
|--------|--------|
| `CostingHub.tsx` | New governed costing control plane (wraps `AdministrationCostingPanel`) |
| `App.tsx` | `costing_pricing` tab routes to `CostingHub` instead of mock `CostingPricing` |
| `Sidebar.tsx` | Renamed to "Costing Configuration" |
| `CostingPricing.tsx` | Deprecated re-export of `CostingHub` |

## Stage G — Migrate Technical Office

| Change | Detail |
|--------|--------|
| `costingRepository.ts` | `executeCostingRun` / `recalculateCostingRun` delegate to `executeCostingForInquiryLine` |
| `costingRoutes.ts` | Response includes `calculationId`, `engine: INCREMENT_13_ORCHESTRATOR` |
| `TechnicalOfficeCostingWorkbench.tsx` | Success message reflects Inc 13 engine (same API contract) |

**Deprecated:** Inc 10 material-only calculation logic removed from production path. `executeCostingRun` is now a compatibility adapter.

## Stage H — Quotation costing snapshot

| Change | Detail |
|--------|--------|
| Migration `20260822160000_increment13_phase_e_quotation_costing_snapshot` | `CommercialQuotationLine.costingCalculationId` FK |
| `commercialRepository.ts` | `createQuotationFromInquiry` / revision copy `costingCalculationId` |
| `getQuotationCosting()` | New repository function |
| `GET /api/quotations/:id/costing` | Returns immutable calculation snapshots per line |

## Stage I — Administration costing UI

| Change | Detail |
|--------|--------|
| `AdministrationCostingPanel.tsx` | BOM Scrap → "BOM Costing"; History → "Audit"; new Versions tab |
| Tabs | Methods, Variables, Formulas, Scrap Rules, BOM Costing, Exchange Rates, Layers, Preview, Approval, Versions, Audit |

## Security & customer isolation

| Change | Detail |
|--------|--------|
| `commercialProjection.ts` | Hide `materialCost`, `materialCostCurrency` from customers |
| `inquiryFieldManifest.ts` | `materialCost` not customer-visible |
| `commercialRoutes.ts` | Customers blocked from `POST .../calculate-cost` (`UNAUTHORIZED_COSTING_ACCESS`) |

## Inquiry UI

| Change | Detail |
|--------|--------|
| `CommercialInquiryDetail.tsx` | Costing tab shows Calculation ID, net consumption/km in BOM breakdown |

## Tests

- `increment13.phaseE.test.ts` — 9 scenarios (quotation snapshot, customer isolation)
- `increment10.costing.test.ts` — 25 scenarios (orchestrator adapter)
- **Increment 13 total:** 81 tests across 6 suites (costing, phaseD, phaseE, bomScrap, calculator, fx)
- `increment12.pricing.test.ts` — updated Test 26–28 for Inc 13 orchestrator behavior

### Verification (2026-08-22 final pass)

| Check | Result |
|-------|--------|
| `npx tsc --noEmit` | ✅ Pass (TS fixes: costingRepository, commercialRepository, costingRoutes, exchange rate workflow) |
| `npx prisma validate` | ✅ Pass |
| Increment 13 suites | ✅ 81/81 pass |
| Increment 10 costing | ✅ 25/25 pass |
| Increment 12 pricing | ✅ Pass (after adapter expectation update) |
| Full `npm test` | ⚠️ 9 failures in Inc 4/5/8 — missing master-data fixtures (BOM conflicts, cable count); unrelated to Phase E |
| Browser acceptance | ⚠️ Not automated — dev server running on `:3847`; manual verification required |

## Documentation package

- `COSTING_ARCHITECTURE.md`, `COSTING_MIGRATION.md`, `COSTING_QUOTATION_SNAPSHOT.md`
- `COSTING_ENGINE.md`, `COSTING_CONFIGURATION.md`, `COSTING_BOM_INTEGRATION.md`
- `COSTING_SCRAP.md`, `COSTING_RAW_MATERIAL_PRICE.md`, `COSTING_INQUIRY_INTEGRATION.md`
- `COSTING_SECURITY.md`

## Migration

```bash
npx prisma migrate deploy
# 20260822160000_increment13_phase_e_quotation_costing_snapshot
```

## Remaining limitations (documented, not fabricated)

- LME build-up from header metal rates
- ELAND additive constants
- Incoterm/shipping cost layers
- Dynamic MV scrap RULE-S002

## Next recommended phase

Increment 14 or business-approved LME policy (BR-E03/E04) with governed `CostingPricePolicy`.
