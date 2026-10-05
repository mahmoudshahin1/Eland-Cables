# Quotation Costing Snapshot

## Rule

When a quotation is created from an inquiry, each `CommercialQuotationLine` stores:

- `costingRunId` — material run reference
- `costingCalculationId` — **immutable** `CostingCalculation` used at quotation time
- `materialCost` / `materialCostCurrency` — frozen numeric snapshot

Recalculating inquiry costing later does **not** change existing quotation lines.

## API

`GET /api/quotations/:id/costing`

Returns per-line calculation snapshots (internal users only; customers receive `UNAUTHORIZED`).

## Revision behavior

`createQuotationRevision` copies `costingCalculationId` from the prior quotation version's lines, preserving historical reference.

## Reproducibility

To reproduce a quoted cost:

1. Load `CommercialQuotationLine.costingCalculationId`
2. Read `CostingCalculation.inputSnapshot`, `referenceSnapshot`, `outputSnapshot`
3. Compare with current master data only for diagnostic diff — quotation value remains the stored snapshot
