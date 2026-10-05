# BOM UOM Policy & Conversion Governance (Increment 8)

## Preserved Source Units of Measure

The official BOM extract contains multiple Units of Measure:
1. **`kg`** (Kilograms / standard weight consumption per km)
2. **`PCS`** (Pieces / discrete items such as end-caps, drum seals, or labels)
3. **`m2`** (Square meters / tapes, wraps, or foil surfaces)

## Zero Automatic Conversion Rule

- **PCS → kg conversion is strictly prohibited** in the import and calculation pipelines without an authorized, engineering-approved conversion factor.
- **m2 → kg conversion is strictly prohibited** without approved specific gravity and layer thickness parameters.
- Source units are preserved verbatim in both `CableBomLine` and `GovernedBomLine`.
- If a raw material master has UOM `kg` but the BOM line is in `PCS`, the system flags an informational warning without attempting an artificial mathematical substitution.
