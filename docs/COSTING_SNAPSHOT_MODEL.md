# Costing Snapshot Model (Increment 13 Extension)

## Increment 10 snapshots (unchanged)

`CostingRun` + `CostingLine` — immutable material cost snapshots with frozen BOM, price, and consumption data.

## Increment 13 snapshot contracts

### CostingCalculation

Header record for full costing pipeline calculations (Phase I).

| Field | Purpose |
|---|---|
| `calculationNumber` | Unique identifier |
| `configurationVersionId` | Published config version used |
| `inquiryLineId` | Link to commercial inquiry line |
| `inputSnapshot` | JSON — inquiry inputs at calculation time |
| `referenceSnapshot` | JSON — BOM, price IDs, formula IDs, config version |
| `outputSnapshot` | JSON — component costs, totals, trace |

### CostingCalculationSnapshot

Append-only typed snapshots:

| snapshotType | Contents |
|---|---|
| `INPUT` | Quantity, length, cutting length, metal prices, FX rates |
| `REFERENCE` | BOM version, RM price IDs, scrap rule IDs, formula version IDs |
| `OUTPUT` | Component breakdown, totals, per-meter metrics |
| `TRACE` | Formula evaluation trace nodes |

## Immutability

- No UPDATE on snapshot records after creation
- Corrections via new `CostingCalculation` with incremented reference
- `formulaTrace` JSON captures AST evaluation steps for explainability

## Link to CostingRun

Phase I orchestrator will link:
- `CostingCalculation` → `CostingRun` (material layer)
- `CommercialInquiryLine` → `CostingCalculation`

## Phase B+C status

Models exist in schema. Runtime population deferred to Phase I.
