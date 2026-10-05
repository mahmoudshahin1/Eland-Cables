# Costing BOM Integration

> **Canonical reference:** [`BOM_COSTING_INTEGRATION.md`](./BOM_COSTING_INTEGRATION.md)

## Summary

Costing uses **governed BOM lines** — not fabricated consumption.

## Resolution per inquiry line

1. Resolve cable → `CableMaster`
2. Resolve BOM → `CableBomLine` / `GovernedBomLine` (approved, no unresolved conflicts)
3. For each line: material, net quantity/weight, UOM
4. Resolve `RawMaterialPrice` (approved, effective)
5. Apply scrap (rule + optional BOM line override)
6. Calculate line extended cost

## Readiness gates

| Gate | Failure code |
|------|--------------|
| Cable not found | `CABLE_NOT_FOUND` |
| BOM unresolved | `BOM_NOT_READY` |
| RM not found | `RAW_MATERIAL_NOT_FOUND` |
| Price missing | `RAW_MATERIAL_PRICE_MISSING` |
| Price expired | `RAW_MATERIAL_PRICE_EXPIRED` |

## UI display

Cost breakdown distinguishes:

- **NET MATERIAL** — consumption × governed price  
- **SCRAP** — scrap allowance  
- **TOTAL MATERIAL COST** — net + scrap  

Admin BOM Costing tab: per-cable, per-line scrap % configuration before calculation.

## BOM scrap API

- `GET /api/admin/costing/bom-scrap/cables`
- `GET /api/admin/costing/bom-scrap/:materialNumber`
- `PATCH /api/admin/costing/bom-scrap/:materialNumber`
