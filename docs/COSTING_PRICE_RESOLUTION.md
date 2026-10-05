# Costing Price Resolution (multi-currency)

**Company base currency:** LE (EGP)

## Raw material price selection

1. Approved `RawMaterialPrice` for the BOM line’s raw material code, matching UOM and price basis.
2. Currency on the price record is the **source currency** for the line (not forced to match inquiry currency).
3. If no approved price exists → `PRICE_NOT_CONFIGURED`.

## FX conversion to inquiry / target currency

When the approved RM price currency differs from the costing target currency (`CommercialInquiry.currency` or preview currency), line cost is converted:

```
convertedLineCost = nativeLineCost × fxRate
```

### FX rate priority

| Priority | Source | When used |
|---:|---|---|
| 1 | Same currency | Multiplier `1` |
| 2 | Inquiry `commercialMetadata.rawMaterialExchangeRate` | Price currency matches `rawMaterialCurrency` and target is inquiry currency |
| 3 | Inquiry `commercialMetadata.exchangeRate` | Converting to inquiry target currency |
| 4 | Governed `CostingExchangeRate` (ACTIVE, effective on costing date) | Direct or inverse pair |
| 5 | — | `FX_NOT_CONFIGURED` blocks costing |

Inquiry header rates **override** governed table rates when applicable.

## Persisted snapshot

`CostingCalculation` input/output snapshots include:

- `resultCurrency` — final costing currency
- `fxSnapshot[]` — pairs, rates, and sources used per conversion

## Incoterms

Incoterm delivery charges remain **`NOT_CONFIGURED`** until the A6 incoterm charge matrix is implemented. Costing does not fabricate incoterm amounts.

## Administration

Governed FX pairs are maintained under **Administration → Costing → Exchange Rates** with workflow: DRAFT → SUBMITTED → VALIDATED → APPROVED → ACTIVE.
