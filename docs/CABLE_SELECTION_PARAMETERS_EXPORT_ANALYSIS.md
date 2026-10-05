# Cable Selection Parameters — Export & Analysis (Review Only)

**Date:** 2026-08-27  
**Scope:** Read-only export for restructuring review. **No application code was modified.**

## Files produced

| File | Purpose |
|------|---------|
| [`data/export/CABLE_SELECTION_PARAMETERS_EXPORT.csv`](../data/export/CABLE_SELECTION_PARAMETERS_EXPORT.csv) | Excel-friendly master parameter table (open in Excel / edit / return) |
| This document | Sequence summary + gap analysis |

**Source of truth inspected:** `SimpleParameterGridV2.tsx`, `parameterCascadingRulesV2.ts`, `masterDataServiceV2.ts`, `technicalValidationEngineV2.ts`, `cableSelectionEngineV2.ts`, `cableAuthority.ts`, `SelectionStateV2` types, Prisma `CableMaster` / `CableParameter` / `ParameterCompatibility` / `CableEngineeringMapping`.

---

## Short summary — current selection sequence & dependencies

### Visible grid order (28 parameters)

```
 1 family              → always enabled
 2 voltageClass        → requires family
 3 voltage             → requires voltageClass  [FILTER: MV=5 ratings; ABC→LV class only; OHL/TELECOM→no class]
 4 standard            → requires voltage       [FILTER: by voltage class IEC/BS set]
 5 conductorMaterial   → requires voltage       [optional catalog merge]
 6 conductorClass      → requires conductorMaterial
 7 conductorShape      → requires conductorClass
 8 conductorSize       → requires conductorMaterial
 9 cores               → requires conductorSize
10 conductorWaterTight → requires conductorSize  [CHECKBOX Yes/No]
11 insulation           → requires cores         [FILTER: MV+ no PVC/LSHF; bare→None only]
12 insulationColor     → requires insulation
13 outerSemiConductor  → requires insulation     [FILTER: LV→N/A only; MV+→no N/A]
14 screenType          → requires insulation     [FILTER: MV+→no None; bare→No Screen]
15 screenCSA           → requires screen present [FILTER: none today beyond unlock]
16 screenWaterTight    → requires screen         [CHECKBOX Yes/No]
17 bedding             → requires insulation + screenType
18 armour              → requires bedding OR screenType [FILTER: 1-core→AWA/ATA bias]
19 armourWaterTight    → requires armour         [CHECKBOX Yes/No]
20 sheathing           → requires insulation
21 sheathingColor      → requires sheathing
22–27 special block     → requires sheathing (waterTight, termite, cprClass, specialArea, specialAdditives, customerIdentification)
28 itemCode            → requires family (text)
```

**Plus (not in numbered grid):**
- `customerCode` — dropdown, CUSTOMER mode only, before grid
- `coreColors` — one dropdown per core when `coresCount > 1` (max 12)

**Downstream sanitization:** `sanitizeSelectionsAfterChange()` runs on every change in `CableConfiguratorV2`; clears downstream values not in resolved option lists.

**PostgreSQL authority (`POST /api/cables/evaluate`):** Only **10 fields** in `selectionsToConfig()`: `customerCode`, `family`, `voltage`, `conductor`, `conductorSize`, `cores`, `insulation`, `screen`, `armour`, `sheath`. All other UI parameters are **not** sent to PG evaluate.

---

## Analysis (7 identification areas)

### 1. Parameters that appear to be duplicates

| Duplicate cluster | Fields | Notes |
|-------------------|--------|-------|
| Voltage representation | `voltageClass`, `voltage`, `voltageLevel`, `u0_u`, `um`, `voltageId` | UI uses class + rating; `um` removed from grid but still in state/types |
| Family tiering | `family`, `familySubType` | `familySubType` hidden; auto-synced from `voltageClass` for UGC |
| Screen | `screenType`, `screenMaterial` | Material removed from UI; implied by type |
| Armour | `armour`, `armourMaterial`, `armourCSA` | Material + CSA removed; type only in UI |
| Semi-conductor | `semiConApplicable`, `innerSemiConductor`, `outerSemiConductor` | Only outer remains in grid |
| CPR | `cpr` (Yes/No), `cprClass` | `cpr` removed from grid; class dropdown remains |
| Core ID | `coreColors`, `coreIdentification`, `coreNumbering` | Colors dynamic; other two removed |
| Water blocking | `conductorWaterTight`, `screenWaterTight`, `armourWaterTight`, `waterTight` | Three checkboxes + one dropdown with overlapping semantics |
| Sheath layers | `bedding`, `innerSheath`, `fillerBinder` | Only `bedding` in grid |
| Commercial length | `cuttingLength`, `lengthTolerance`, `drumType` | Moved to post-resolve section |

### 2. Parameters that appear unnecessary for cable selection (cable identity)

Likely **out of scope for master matching** (commercial / post-quote / display only):

- `itemCode` (free text ERP ref)
- `cuttingLength`, `lengthTolerance`, `drumType`
- `customerIdentification` (marking scheme vs construction)
- `specialArea` (installation environment — not in PG evaluate)
- `termiteProtection` (not in PG evaluate)
- `cprClass` without `cpr` Yes/No in UI
- `semiConduct`, `graphite`, `edr` (state-only, not in grid)
- `selectionMode` (UX mode, not engineering)

**Hidden but used indirectly:** `familySubType` (construction matrix lookup).

### 3. Parameters that should be Yes/No checkbox (vs current UI)

| Field | Current UI | Recommendation |
|-------|------------|----------------|
| `conductorWaterTight` | Checkbox Yes/No | **Correct** |
| `screenWaterTight` | Checkbox Yes/No | **Correct** |
| `armourWaterTight` | Checkbox Yes/No | **Correct** |
| `cpr` | Removed from grid | **Should be checkbox** if CPR is kept as concept |
| `semiConApplicable` | Removed | Could be checkbox if reintroduced |
| `semiConduct` | Not in UI | Checkbox candidate |
| `graphite` | Not in UI | Checkbox candidate |
| `edr` | Not in UI | Checkbox candidate |
| `waterTight` | **Dropdown** (5 blocking types) | **Not Yes/No** — different semantics; keep dropdown or split into type + Yes/No |

### 4. Parameters whose values should depend on previous selections

| Field | Dependency implemented? | Gap |
|-------|-------------------------|-----|
| `voltageClass` | Yes (family) | OHL/TELECOM returns empty — field unlocks but no options |
| `voltage` | Yes (class) | MV filtered to 5; LV/HV/EHV use full class lists |
| `standard` | Yes (voltage class) | Good |
| `insulation` | Yes (MV/HV/bare) | Good |
| `outerSemiConductor` | Yes (voltage tier) | Good |
| `screenType` | Yes (MV/bare) | Good |
| `armour` | Yes (cores/family) | Good |
| `bedding` | Yes (bare) | Good |
| `sheathing` | Yes (bare) | Good |
| `conductorSize` | Partial | Catalog merge only; **not** filtered by family/voltage in engineering rules |
| `cores` | **No** | Full 1–61 list always; should filter by family (e.g. SINGLE→1) |
| `conductorClass` | **No** | No dependency on material/size beyond unlock |
| `conductorShape` | **No** | Static list |
| `screenCSA` | **No** | Static list; should depend on screen type / fault current |
| `insulationColor` | **No** | Static |
| `sheathingColor` | **No** | Static |
| `waterTight`, `termiteProtection`, `cprClass`, `specialArea`, `specialAdditives` | **No** | Static lists after sheathing unlock |
| `coreColors` | Partial | Defaults by count; not filtered by family standard |

### 5. Parameters that should become disabled/dimmed when not applicable

| Field | Current behavior | Should dim when |
|-------|------------------|-----------------|
| All locked fields | `opacity-50` + disabled | OK |
| `screenCSA` | Unlocks only if screen | OK |
| `screenWaterTight` | Unlocks only if screen | OK |
| `armourWaterTight` | Unlocks only if armour | OK |
| `outerSemiConductor` | Unlocks at insulation | Should dim for LV (only N/A options) — options filtered but field still active |
| `bedding` | Unlocks after screen | Could dim for bare OHL (Not Applicable only) |
| `coreColors` section | Shows when multi-core | OK |
| Removed fields | Still in state | N/A |

### 6. Existing compatibility / dependency rules

**A. UI unlock chain** — `isParameterUnlocked()` in `parameterCascadingRulesV2.ts`

**B. Engineering option filters** — `resolveParameterOptionsV2()`:
- MV voltage set (5 values)
- Family → voltage class restrictions
- Insulation PVC/LSHF blocked MV+
- Semi-con outer N/A vs required by tier
- Screen None blocked MV+
- Armour SWA blocked single-core (filter list)
- Standards filtered by voltage class
- Catalog merge with tolerant token matching (partial)

**C. Prototype validation** (`validateCableConfigurationV2`) — demoted to **warnings** in evaluate flow except PG blocks:
- Required: family, voltage, conductorMaterial, conductorSize, insulation
- MV/HV + PVC/LSHF insulation
- MV/HV without outer semi-con
- MV/HV without metallic screen
- Screen CSA without screen / armour CSA without armour
- Single-core + SWA
- Class 1 > 35 mm²
- CPR Yes without class
- Core colors required multi-core
- Standard vs voltage (60502-1 on MV, etc.)

**D. PostgreSQL authority** (`evaluateCableAuthority`):
- Parameter existence: FAMILY, VOLTAGE, CONDUCTOR, INSULATION, SHEATH, CORE_COLOUR
- Required compatibility pairs: **FAMILY↔VOLTAGE**, **FAMILY↔CORE_COLOUR**
- Missing rules → `CONFIGURATION_REQUIRED`
- FORBIDDEN rules → `INVALID_CONFIGURATION`
- Master match on approved `CableEngineeringMapping` overrides

**E. Construction matrix** (`CABLE_CONSTRUCTION_LOGIC_MATRIX`) — 11 entries; drives `resolveConstructionLogic()` presets and filter context; **not** direct dropdown gating for all fields.

### 7. Missing dependency rules (unrelated values still appear)

| Issue | Evidence | Impact |
|-------|----------|--------|
| **Catalog token mismatch** | UI `UGC`/`CU` vs parsed catalog `MV`/`Copper` | Client catalog filter ineffective for family/conductor |
| **Cores not family-scoped** | `DEFAULT_CORE_COUNTS` always full list | SINGLE family can select 61 cores |
| **Conductor size not voltage-scoped** | Static 0.5–2500 mm² | MV tiny sizes / EHV huge list noise |
| **screenCSA static** | No link to screen type or cable size | Invalid CSA combinations selectable |
| **waterTight dropdown** | TriState in model but string options in UI | Type inconsistency; no Yes/No cascade |
| **specialAdditives single-select** | State is array | Cannot represent multiple additives as designed |
| **OHL/TELECOM voltage class** | Empty options but field unlocks | User sees empty dropdown |
| **PG evaluate subset** | 10 fields only | UI collects 28+; most fields **not authoritative** for existence |
| **familySubType hidden** | Auto-sync UGC only | OHL AAC/AAAC/ACSR not selectable in UI |
| **No N/A on water checkboxes** | Forced Yes/No | Loses N/A engineering meaning |
| **Customer code vs family** | Independent | No cascade from customer code to family in rules file |

---

## PostgreSQL vs UI coverage matrix

| UI parameter | In selectionsToConfig | In CableMaster column | In CableEngineeringMapping |
|--------------|----------------------|----------------------|---------------------------|
| family | Yes | family | family |
| voltage | Yes | voltage | voltage |
| conductorMaterial | Yes | conductor | conductor |
| conductorSize | Yes | conductorSize | conductorSize |
| cores | Yes | cores | cores |
| insulation | Yes | insulation | insulation |
| screenType | Yes | screen | screen |
| armour | Yes | armour | armour |
| sheathing | Yes | sheath | sheath |
| sheathingColor | No | sheathColour | sheathColour |
| standard | No | standard | standard |
| specialAdditives | No | specialAdditives | specialAdditives |
| coreColors | No | coreColour | coreColour |
| All others | No | — | attributes JSON may hold |

---

## How to use this export

1. Open `data/export/CABLE_SELECTION_PARAMETERS_EXPORT.csv` in Excel.
2. Edit sequence, control types, dependencies, and value lists as needed.
3. Return the edited file for Stage 2 implementation (engineering cascade).

**STOP** — export and analysis complete. No implementation performed.
