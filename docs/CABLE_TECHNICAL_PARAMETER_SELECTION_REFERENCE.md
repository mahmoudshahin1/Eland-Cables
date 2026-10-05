# Cable Technical Parameter — Selection Reference

**Updated:** 2026-08-27  
**Module:** `parameterCascadingRulesV2.ts` + `CascadingParameterGridV2.tsx`

---

## UI title

The configurator banner reads **Cable Technical Parameter** (no "VERSION 2" badge).

---

## Removed parameters (legacy numbers)

These fields are **hidden from the main grid** but remain on `SelectionStateV2` for `POST /api/cables/evaluate` and Technical Office TCR compatibility. Values are not actively cleared on upstream changes unless they become inconsistent with visible selections.

| Legacy # | Field | Notes |
|---------:|-------|-------|
| 2 | `familySubType` | Auto-synced from `voltageClass` for UGC |
| 5 | `um` | Removed from UI |
| 10 | `conductorCompacting` | |
| 16 | `semiConApplicable` | |
| 17 | `innerSemiConductor` | |
| 20 | `screenMaterial` | |
| 24 | `armourMaterial` | |
| 25 | `armourCSA` | |
| 32 | `cpr` | `cprClass` remains visible |
| 38 | `coreIdentification` | |
| 39 | `coreNumbering` | |
| 46 | Substation Grade Anti-Vibration additive | Removed from chip list |
| 51 | Low Temperature Resistant additive | Removed from chip list |
| 52 | `cuttingLength` | Moved to `CuttingLengthSectionV2` post-resolution |
| 53 | `lengthTolerance` | Same |
| 54 | `drumType` | Same |

---

## New sequential parameter map (visible grid)

| New # | Field | Legacy # |
|------:|-------|----------|
| 1 | `family` | 1 |
| 2 | `voltageClass` | 3 |
| 3 | `voltage` | 4 |
| 4 | `standard` | 6 |
| 5 | `conductorMaterial` | 7 |
| 6 | `conductorClass` | 8 |
| 7 | `conductorShape` | 9 |
| 8 | `conductorSize` | 11 |
| 9 | `cores` | 12 |
| 10 | `conductorWaterTight` | 13 |
| 11 | `insulation` | 14 |
| 12 | `insulationColor` | 15 |
| 13 | `outerSemiConductor` | 18 |
| 14 | `screenType` | 19 |
| 15 | `screenCSA` | 21 |
| 16 | `screenWaterTight` | 22 |
| 17 | `bedding` | **27** (moved before armour) |
| 18 | `armour` | 23 |
| 19 | `armourWaterTight` | 26 |
| 20 | `sheathing` | 28 |
| 21 | `sheathingColor` | 29 |
| 22 | `waterTight` | 30 |
| 23 | `termiteProtection` | 31 |
| 24 | `cprClass` | 33 |
| 25 | `specialArea` | 34 |
| 26 | `specialAdditives` | 35 (minus #46, #51) |
| 27 | `customerIdentification` | 36 |
| 28 | `itemCode` | 55 |

Multi-core **individual core colors** render when `coresCount > 1` (not separately numbered).

---

## MV voltage ratings

When **Voltage Class = MV**, **U0/U Rating** shows only:

1. `3.6/6 kV`
2. `6/10 kV (6.35/11 kV)`
3. `8.7/15 kV`
4. `12/20 kV (12.7/22 kV)`
5. `18/30 kV (19/33 kV)`

---

## Cascading rules summary

| Rule | Behavior |
|------|----------|
| Unlock chain | Sequential gates per `isParameterUnlocked()` |
| MV insulation | PVC / LSHF excluded; XLPE / EPR allowed |
| MV screening | `None` / `No Screen` excluded |
| Single-core armour | SWA / steel magnetic types excluded; AWA / ATA allowed |
| OHL bare conductor | Insulation = bare only; screen/armour/sheath constrained |
| Standards | Filtered by voltage class via IEC matrix |
| Bedding | Unlocks after screen type; appears **before** armour section |
| Sanitization | `sanitizeSelectionsAfterChange()` wired in `handleUpdateParam` |
| Catalog merge | Tolerant token match (CU↔Copper) in `mergeWithCatalog()` only |

---

## Known limitations

- Catalog `filterCableRecordsV2` token mismatches (family UGC vs LV/MV/HV) remain unchanged.
- Removed fields may retain stale values in `SelectionStateV2` until explicitly overwritten.
- `outerSemiConductor` default presets (`Strippable`) may not exactly match dropdown label strings.
