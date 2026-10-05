# Material Cost Calculation & Dimensional Rules (Increment 10)

## 1. Material Cost Calculation Formula

The Raw Material Cost for any consumed material line $i$ is calculated as:

$$\text{MaterialLineCost}_i = \text{ConsumptionQty}_i \times \text{EffectiveUnitPrice}_i$$

Where:
- $\text{ConsumptionQty}_i = \text{ConsumptionRatePerKm}_i \times \frac{\text{LengthMeters}}{1000} \times \text{Quantity}$
- $\text{EffectiveUnitPrice}_i$ is the active approved price resolved by `getValidRawMaterialPrice(rawMaterialCode, costingDate, uom, currency)`.

---

## 2. Dimensional Compatibility & Conversion Standards

### Strict Dimensional Rule
- If the BOM line consumption UOM is `kg` and the Price UOM is `kg`, calculation is direct.
- If the BOM line consumption UOM is `kg` and the Price UOM is `ton` with `priceBasis = PER_TON`, the engine applies standard metric ton conversion:
  $$\text{EffectiveUnitPrice} = \frac{\text{PricePerTon}}{1000}$$
- If the BOM line consumption UOM is `PCS` and the Price UOM is `kg` (or vice-versa), the calculation is **strictly blocked** with `COSTING_UOM_MISMATCH`. No unverified mathematical conversion factors are invented.

---

## 3. Currency Match Rule (No Automated FX)

- Calculation requires an approved price in the exact requested costing currency (e.g. `USD`).
- If an approved price exists only in a different currency (e.g. `EUR` or `EGP`), the engine blocks calculation with `PRICE_CURRENCY_MISMATCH`. No automated foreign exchange rates are applied.
