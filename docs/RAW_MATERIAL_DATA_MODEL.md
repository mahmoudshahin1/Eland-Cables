# Raw material data model (Increment 4)

## Master (`RawMaterial`)

| Field | Notes |
|---|---|
| code | PK |
| description | required |
| category | optional |
| uom | required |
| supplier | optional |
| currency | optional |
| status | ACTIVE / INACTIVE |
| priceStatus | `CONFIGURED` or `PRICE_NOT_CONFIGURED` |

CRUD: `POST /api/master/raw-materials`, `PUT /api/master/raw-materials/:code` (internal master-data role). Customers 403.

Duplicate code → 409 `DUPLICATE_RAW_MATERIAL`.

## Price history (`RawMaterialPrice`)

```
Raw Material → Price → Currency → Effective From → Effective To
```

- New numeric prices **append** a history row. Previous rows are **not** overwritten and dates are **not** invented (`effectiveTo` is not set to “now”).
- `effectiveFrom` is nullable. Source without dates → `temporalStatus = DATA_REQUIRED`.
- Source with a parseable Effective From → `temporalStatus = EFFECTIVE`.

## Blank price rule (mandatory)

**BLANK PRICE ≠ ZERO.**

- Blank Excel Price → **no** `RawMaterialPrice` row
- Material `priceStatus = PRICE_NOT_CONFIGURED`
- Costing (not implemented in Increment 4) must not treat missing price as free material

## Official extract

Raw Material List.xlsx / Sheet1: **74** codes; **all 74 prices blank** → `PRICE_NOT_CONFIGURED`; **zero** price history rows with 0. Category/Supplier/Currency/Status columns are absent (`CONFIGURATION_REQUIRED` / not invented).


## BOM relationship

`CableBomLine.rawMaterialCode` → `RawMaterial.code` (database FK).

`CableBomLine.cableMaterialNumber` → `CableMaster.materialNumber` (database FK).

Placeholder Cable or RM rows are never auto-created.
