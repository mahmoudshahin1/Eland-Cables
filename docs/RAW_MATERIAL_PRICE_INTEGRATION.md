# Raw Material Price Integration (Increment 13)

## Authoritative source

`RawMaterialPrice` (Increment 9/10) remains the **sole governed price master**. Increment 13 does not duplicate price records.

## Integration model

| Layer | Role |
|---|---|
| `RawMaterialPrice` | Approved unit prices with workflow, effective dates, UOM, currency |
| `getValidRawMaterialPrice()` | Price resolution for costing date (Increment 10) |
| `CostingVariable.MATERIAL_COST` | Reference variable — populated from Increment 10 aggregate |
| LME build-up formulas | **Not implemented** — deferred; would require `CostingPricePolicy` (Phase H) |

## Variable registry

| Code | Kind | Source |
|---|---|---|
| `MATERIAL_COST` | REFERENCE | `CostingRun.materialCost` (Increment 10) |
| `RM_UNIT_PRICE` | — | Not seeded — per-line prices resolved in Phase H |

## Constraints (unchanged from Increment 10)

- Only APPROVED prices used
- Currency mismatch → `PRICE_CURRENCY_MISMATCH` (no silent FX)
- Missing price → `PRICE_NOT_CONFIGURED`
- No fake zero prices
- Draft imported prices are not costing-ready, even when `RawMaterial.priceStatus` says `CONFIGURED`
- Effective dates, allowed currency codes, consumed UOM, and price basis must be governed before approval

## Phase B+C scope

- Variable registry metadata seeded
- No price resolution changes
- No LME/FX formula execution
- Formula engine can reference `MATERIAL_COST` as input variable in preview/validation

## Phase H readiness

Orchestrator will:
1. Run Increment 10 material costing
2. Inject `MATERIAL_COST` into formula evaluation context
3. Evaluate configured formulas (EX_WORK, etc.)
4. Persist combined snapshot

See [`RAW_MATERIAL_PRICE_GOVERNANCE.md`](./RAW_MATERIAL_PRICE_GOVERNANCE.md) for price workflow details.
