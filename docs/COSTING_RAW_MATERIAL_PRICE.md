# Costing Raw Material Price Integration

> **Canonical reference:** [`COSTING_PRICE_RESOLUTION.md`](./COSTING_PRICE_RESOLUTION.md), [`RAW_MATERIAL_PRICE_INTEGRATION.md`](./RAW_MATERIAL_PRICE_INTEGRATION.md)

## Principle

Every BOM line cost uses a **governed, approved `RawMaterialPrice`** — no fallback to random or current prices.

## Resolution

1. Match `rawMaterialCode` from BOM line  
2. Filter: `workflowStatus = APPROVED`, `status = ACTIVE`  
3. Validate effective date against costing date  
4. Apply currency (with FX if configured)  
5. Multiply by net consumption  

## Failure modes

| Condition | Code |
|-----------|------|
| No approved price | `RAW_MATERIAL_PRICE_MISSING` |
| Price expired | `RAW_MATERIAL_PRICE_EXPIRED` |
| Currency mismatch (no FX) | `FX_NOT_CONFIGURED` / `PRICE_CURRENCY_MISMATCH` |

## Customer isolation

Customers **never** see:

- Raw material unit prices  
- Supplier information  
- Internal material cost breakdown  

Server-side projection strips these fields (`commercialProjection.ts`).

## Extension point

LME build-up from inquiry header metal rates (BR-E03/E04) — documented, not implemented.
