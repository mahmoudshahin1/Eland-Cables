# Price Validity & Selection Rules (Increment 9)

## Domain Rules for Price Selection

The `getValidRawMaterialPrice` domain service evaluates candidate approved prices using the following deterministic criteria:

1. **Status Rule**: Only records with `workflowStatus = APPROVED` and `status = ACTIVE` are considered.
2. **Dimension Match Rule**:
   - `currency`: Must match requested currency if specified (otherwise blocks with `PRICE_CURRENCY_MISMATCH`).
   - `uom`: Must match required BOM line unit (otherwise blocks with `PRICE_UOM_MISMATCH`). No synthetic unit conversion is performed.
   - `priceBasis`: Must match required price basis (otherwise blocks with `PRICE_BASIS_MISMATCH`).
3. **Temporal Validity Rule**:
   - `EffectiveFrom <= CostingDate <= EffectiveTo` (open-ended supported when `EffectiveTo` is null).
   - If `CostingDate > EffectiveTo`, returns `PRICE_EXPIRED`.
   - If no price covers `CostingDate`, returns `PRICE_NOT_CONFIGURED`.
4. **Uniqueness & Overlap Rule**:
   - Exactly one valid price must match.
   - If multiple approved records match the same interval, returns `PRICE_PERIOD_OVERLAP`.
5. **Positive Price Rule**:
   - Zero or negative price returns `INVALID_PRICE`. Free material is prohibited.
