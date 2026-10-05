# Costing Error Codes (Increment 10)

## Gating & Validation Error Code Catalog

| Error Code | HTTP Status | Description & Mitigation |
|---|---|---|
| **`ENGINEERING_NOT_APPROVED`** | `422 Unprocessable` | Gate 1 Failed: Cable engineering mapping is `REJECTED`, `CANCELLED`, or still not `APPROVED` after persist-path auto-approval. Preview still reports this for `DRAFT` / `SUBMITTED` / `UNDER_REVIEW` / `MISSING`. Persist calculation auto-creates a missing mapping from Cable Master SOURCE fields and auto-approves `DRAFT` / `SUBMITTED` / `UNDER_REVIEW`. It does not auto-approve `REJECTED` / `CANCELLED`, and it does not invent prices, scrap, or shipping. |
| **`BOM_CONFLICT_UNRESOLVED`** | `422 Unprocessable` | Gate 2 Failed: Cable is linked to one or more unresolved BOM conflict groups in `BomDuplicateObservation`. Must resolve and approve in BOM Governance Workbench first. |
| **`RAW_MATERIAL_NOT_FOUND`** | `422 Unprocessable` | Gate 3 Failed: One or more raw materials consumed in the BOM do not exist in `RawMaterial` master data. |
| **`PRICE_NOT_CONFIGURED`** | `422 Unprocessable` | Gate 4 Failed: No active approved price is configured for a consumed raw material on the specified costing date. |
| **`PRICE_EXPIRED`** | `422 Unprocessable` | Gate 4 Failed: An approved price exists but its `effectiveTo` timestamp has elapsed relative to the requested costing date. |
| **`PRICE_PERIOD_OVERLAP`** | `422 Unprocessable` | Gate 4 Failed: Multiple overlapping approved price intervals exist for the same raw material, currency, and UOM. |
| **`PRICE_UOM_MISMATCH`** | `422 Unprocessable` | Gate 4 Failed: The price UOM differs from the BOM line consumption UOM without an authoritative conversion rule. |
| **`PRICE_CURRENCY_MISMATCH`** | `422 Unprocessable` | Gate 4 Failed: The requested costing currency has no approved price for that material. No automated FX conversion is applied. |
| **`COSTING_UOM_MISMATCH`** | `422 Unprocessable` | Calculation blocked: Incompatible dimensional units between BOM consumption and price record. |
| **`INVALID_REQUEST_INPUTS`** | `400 Bad Request` | Missing material number, non-positive quantity, or non-positive length. |
| **`UNAUTHORIZED`** | `401 / 403` | User is unauthenticated or has customer role without internal costing permissions. |
| **`CABLE_NOT_FOUND`** | `404 Not Found` | Specified `materialNumber` does not exist in `CableMaster`. |
