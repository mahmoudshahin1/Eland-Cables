# Cable Selection — Stage 2 Proposed Dependency Matrix (Design Only)

**Date:** 2026-08-27  
**Status:** DESIGN FOR REVIEW — **no code or database changes**  
**Inputs:** [`CABLE_SELECTION_PARAMETERS_EXPORT.csv`](../data/export/CABLE_SELECTION_PARAMETERS_EXPORT.csv), current `parameterCascadingRulesV2.ts`, `masterDataServiceV2.ts`, `technicalValidationEngineV2.ts`

---

## 1. Parameter taxonomy (your decisions applied)

### A. Technical selection sequence (29 slots)

| Seq | Parameter Code | Proposed UI Control |
|-----|----------------|---------------------|
| 1 | `family` | Dropdown |
| 2 | `voltageClass` | Dropdown |
| 3 | `voltage` | Dropdown |
| 4 | `standard` | Dropdown |
| 5 | `conductorMaterial` | Dropdown |
| 6 | `conductorClass` | Dropdown |
| 7 | `conductorShape` | Dropdown |
| 8 | `conductorSize` | Dropdown |
| 9 | `cores` | Dropdown |
| 10 | `conductorWaterTight` | **Checkbox** (Yes/No) |
| 11 | `insulation` | Dropdown |
| 12 | `insulationColor` | Dropdown |
| 13 | `outerSemiConductor` | Dropdown |
| 14 | `screenType` | Dropdown |
| 15 | `screenCSA` | Dropdown |
| 16 | `screenWaterTight` | **Checkbox** (Yes/No) |
| 17 | `bedding` | Dropdown |
| 18 | `armour` | Dropdown |
| 19 | `armourWaterTight` | **Checkbox** (Yes/No) |
| 20 | `sheathing` | Dropdown |
| 21 | `sheathingColor` | Dropdown |
| 22 | `waterTight` | **Dropdown** (blocking type — not checkbox) |
| 23 | `termiteProtection` | Dropdown |
| 24 | `cpr` | **Checkbox** (Yes/No) — **reintroduced to sequence** |
| 25 | `cprClass` | Dropdown |
| 26 | `specialArea` | Dropdown |
| 27 | `specialAdditives` | Dropdown (multi-value TBD) |
| 28 | `coreColors` | Dropdown per core (dynamic) |
| 29 | `customerIdentification` | Dropdown |

### B. Outside technical selection (commercial / session)

| Parameter | Purpose |
|-----------|---------|
| `selectionMode` | CUSTOMER vs TECHNICAL entry mode |
| `customerCode` | Fast preset from catalog (CUSTOMER mode) |
| `itemCode` | ERP / SAP reference |
| `cuttingLength` | Post-resolve commercial |
| `lengthTolerance` | Post-resolve commercial |
| `drumType` | Post-resolve / logistics |

### C. Derived / system fields (not user-selected in Stage 2 grid)

| Field | Derivation (proposed) |
|-------|----------------------|
| `familySubType` | Derived from `family` + `voltageClass` (UGC) or `family` (OHL sub-types) — **data gap for OHL** |
| `um` | Derived from `voltage` via `DEFAULT_VOLTAGE_RATINGS_DETAILED` lookup |
| `coresCount` | Derived from `cores` label parse |
| `semiConApplicable` | Derived from construction matrix `requiresSemiCon` + voltage tier |
| `innerSemiConductor` | Derived when MV/HV/EHV screened cable — **no explicit UI; matrix implies required** |
| `screenMaterial` | Derived from `screenType` |
| `armourMaterial` | Derived from `armour` type |
| `armourCSA` | Derived from `armour` type + `cores` — **no lookup table in code** |
| `coreIdentification` | Derived from `standard` + `customerIdentification` scheme |
| `coreNumbering` | Derived from `standard` / customer spec |

---

## 2. Proposed dependency matrix — full technical sequence

**Legend — Requirement class**

| Class | Meaning |
|-------|---------|
| **Required** | Must be set for valid configuration / authority |
| **Optional** | User may leave default / empty where allowed |
| **Not Applicable** | Field hidden or forced to N/A / None |
| **Derived** | Not shown; computed from parents |

**Legend — Value source**

| Source | Meaning |
|--------|---------|
| `STATIC` | `DEFAULT_*` in `masterDataServiceV2.ts` |
| `FILTER` | Subset of static list based on parent condition (existing code) |
| `CATALOG` | Optional intersection with catalog (`mergeWithCatalog`) |
| `PG` | PostgreSQL `CableParameter` / `ParameterCompatibility` |
| `GAP` | **Insufficient data in current codebase to define safely** |

---

### Rows 1–10: Family through conductor water blocking

| Seq | Parameter | Parent(s) | Condition | Available values | Req class | Value source | Notes (fact from code) |
|-----|-----------|-----------|-----------|------------------|-----------|--------------|------------------------|
| 1 | `family` | — | Always | UGC \| OHL \| ABC \| SINGLE \| CONTROL \| TELECOM | Required | STATIC | PG kind=FAMILY |
| 2 | `voltageClass` | `family` | `family` set | See family table below | Required* | FILTER | *Empty for OHL/TELECOM today |
| 3 | `voltage` | `voltageClass` | `voltageClass` set | MV: 5 ratings; else `DEFAULT_VOLTAGES_BY_CLASS[class]` | Required | FILTER | PG kind=VOLTAGE |
| 4 | `standard` | `voltage`, `voltageClass` | `voltage` set | `filterStandardsForVoltage` subset of `DEFAULT_STANDARDS` | Optional | FILTER + CATALOG | Prototype cross-check vs voltage |
| 5 | `conductorMaterial` | `voltage` | `voltage` set | CU \| AL | Required | STATIC + CATALOG | PG kind=CONDUCTOR |
| 6 | `conductorClass` | `conductorMaterial` | material set | Class 1/2/5 list | Optional | STATIC + CATALOG | Class 1 >35mm² blocked in validation |
| 7 | `conductorShape` | `conductorClass` | class set | 4 shapes | Optional | STATIC | Not in PG evaluate |
| 8 | `conductorSize` | `conductorMaterial`, `family`, `voltage` | material set | See **§3.1** | Required | STATIC + CATALOG | **GAP: no family/voltage size matrix** |
| 9 | `cores` | `conductorSize`, `family` | size set | See **§3.2** | Required | STATIC (full 1–61 today) | **GAP: no family→cores matrix** |
| 10 | `conductorWaterTight` | `conductorSize` | size set | Yes \| No (checkbox) | Optional | STATIC | N/A option removed in UI design |

#### `voltageClass` by `family` (existing filter only)

| family | voltageClass options |
|--------|---------------------|
| UGC, SINGLE, CONTROL | LV, MV, HV, EHV |
| ABC | LV only |
| OHL, TELECOM | **None (empty list — GAP)** |

#### MV `voltage` values (existing — do not extend without TO sign-off)

`3.6/6 kV` | `6/10 kV (6.35/11 kV)` | `8.7/15 kV` | `12/20 kV (12.7/22 kV)` | `18/30 kV (19/33 kV)`

---

### Rows 11–21: Insulation through sheath colour

| Seq | Parameter | Parent(s) | Condition | Available values | Req class | Value source | Notes |
|-----|-----------|-----------|-----------|------------------|-----------|--------------|-------|
| 11 | `insulation` | `cores`, `family`, `voltage` | cores set | See **§3.3** | Required | FILTER + CATALOG | Bare OHL→`None (Bare Conductor)`; MV+→no PVC/LSHF |
| 12 | `insulationColor` | `insulation` | insulation set & ≠ None | `DEFAULT_INSULATION_COLORS` | Optional | STATIC | **GAP: N/A when bare** |
| 13 | `outerSemiConductor` | `insulation`, `voltage`, `voltageClass` | insulation set | See **§3.4** | Conditional | FILTER | MV/HV/EHV: required (validation); LV: N/A only |
| 14 | `screenType` | `insulation`, `family`, `voltage` | insulation set | See **§3.5** | Conditional | FILTER + CATALOG | MV/HV/EHV: metallic required |
| 15 | `screenCSA` | `screenType` | screen ≠ None/No Screen | `DEFAULT_SCREEN_CSAS` minus None | Conditional | STATIC | **GAP: no size/type→CSA table** |
| 16 | `screenWaterTight` | `screenType` | has screen | Yes \| No | Optional | STATIC | Not Applicable when no screen |
| 17 | `bedding` | `insulation`, `screenType`, `family` | insulation + screenType set | See **§3.6** | Optional | FILTER | Bare→`Not Applicable` only |
| 18 | `armour` | `bedding` or `screenType`, `cores`, `family` | bedding OR screen set | See **§3.7** | Optional | FILTER + CATALOG | 1-core→AWA/ATA bias; SWA blocked single-core AC |
| 19 | `armourWaterTight` | `armour` | armour ≠ None/No Armour | Yes \| No | Optional | STATIC | Not Applicable when no armour |
| 20 | `sheathing` | `insulation`, `family` | insulation set | See **§3.8** | Optional | FILTER + CATALOG | Bare→`None` only |
| 21 | `sheathingColor` | `sheathing` | sheathing set & ≠ None | `DEFAULT_SHEATHING_COLORS` | Optional | STATIC | **GAP: colour vs MV red convention** |

---

### Rows 22–29: Special properties and identification

| Seq | Parameter | Parent(s) | Condition | Available values | Req class | Value source | Notes |
|-----|-----------|-----------|-----------|------------------|-----------|--------------|-------|
| 22 | `waterTight` | `sheathing` | sheathing set | `DEFAULT_WATER_BLOCKING_TYPES` (5) | Optional | STATIC | Dropdown — not Yes/No |
| 23 | `termiteProtection` | `sheathing` | sheathing set | `DEFAULT_TERMITE_PROTECTIONS` | Optional | STATIC | **GAP: no family/area rules** |
| 24 | `cpr` | `sheathing` | sheathing set | Yes \| No (checkbox) | Optional | STATIC | Reintroduced per Stage 2 design |
| 25 | `cprClass` | `cpr`, `sheathing` | `cpr` = Yes | `DEFAULT_CPR_CLASSES` minus N/A | **Required if cpr=Yes** | STATIC | Existing validation rule |
| 25 | `cprClass` | `cpr` | `cpr` = No | — | **Not Applicable** | — | Hidden / forced N/A |
| 26 | `specialArea` | `sheathing` | sheathing set | `DEFAULT_SPECIAL_AREAS` | Optional | STATIC | **GAP: no cross-filter with termite/water** |
| 27 | `specialAdditives` | `sheathing`, `insulation` | sheathing set | 5 visible additives (2 removed) | Optional | STATIC | **GAP: multi vs single select; LSHF vs insulation** |
| 28 | `coreColors` | `cores` → `coresCount` | coresCount > 1 | `DEFAULT_CORE_COLORS` per core row | Required (multi) | STATIC + PG | PG FAMILY↔CORE_COLOUR rules exist but may be unconfigured |
| 28 | `coreColors` | `cores` | coresCount = 1 | — | **Not Applicable** | — | Single-core: sheath colour often sufficient |
| 29 | `customerIdentification` | `family`, `standard` | sheathing set (unlock) | `DEFAULT_CUSTOMER_IDENTIFICATIONS` | Optional | STATIC | Marking scheme; not construction |

---

## 3. Focus parameters — detailed proposed dependencies

### 3.1 `conductorSize`

| Parent | Condition | Proposed values | Req class |
|--------|-----------|-----------------|-----------|
| `conductorMaterial` | always when unlocked | Full `DEFAULT_CONDUCTOR_SIZES` (0.5–2500) | Required |
| `conductorClass` | Class 1 selected | Exclude sizes > 35 mm² | **Required rule (exists in validation)** |
| `family` = OHL | bare overhead | **GAP** — should limit to OHL catalog sizes only | Unknown |
| `family` = CONTROL/TELECOM | control cable | **GAP** — typically smaller CSA range | Unknown |
| `voltage` MV/HV | high voltage power | **GAP** — minimum CSA per IEC not in data | Unknown |
| Catalog | records narrowed | Intersect via `mergeWithCatalog` | Optional filter |

**Insufficient data:** No authoritative **family × voltage × conductor material → allowed CSA list** in code or export. `CABLE_CONSTRUCTION_LOGIC_MATRIX` does not enumerate sizes.

---

### 3.2 `cores`

| Parent | Condition | Proposed values | Req class |
|--------|-----------|-----------------|-----------|
| `conductorSize` | size set | Today: all `DEFAULT_CORE_COUNTS` (1–61) | Required |
| `family` = SINGLE | | **Proposed:** 1 Core only | **GAP — not in code** |
| `family` = OHL | bare | **Proposed:** 1 Core only | **GAP** |
| `family` = ABC | | **GAP** — typically 3–4 core; not defined | Unknown |
| `family` = CONTROL | | **GAP** — multi-core range not defined | Unknown |
| `voltage` + `standard` | SEC/utility specs | **GAP** — utility core conventions not tabulated | Unknown |

**Insufficient data:** No `family → allowed core counts` matrix. Full 1–61 list is unsafe for SINGLE/OHL.

---

### 3.3 `insulation`

| Parent | Condition | Proposed values | Req class |
|--------|-----------|-----------------|-----------|
| `family` bare (OHL) | `isBareConductor` | `None (Bare Conductor)` only | Required |
| `voltage` MV/HV/EHV | high potential | XLPE, EPR only (exclude PVC, LSHF) | Required | **Exists in code** |
| `voltage` LV | | XLPE, PVC, LSHF, EPR | Optional choice |
| `standard` | e.g. BS 6724 | **GAP** — should force LSHF; not wired | Unknown |
| Catalog | | Intersect insulations | Optional |

**Insufficient data:** Standard-specific insulation mandates (BS 6724 LSHF, etc.) not in `resolveParameterOptionsV2`.

---

### 3.4 `outerSemiConductor`

| Parent | Condition | Proposed values | Req class |
|--------|-----------|-----------------|-----------|
| `voltage` LV | | `Not Applicable (LV)` only | Not Applicable (forced) | **Exists** |
| `voltage` MV/HV/EHV | | Bonded / Strippable options; exclude N/A | **Required** | **Exists in validation** |
| `insulation` = None | bare | **Proposed:** Not Applicable | **GAP — partial via bare family** |
| `semiConApplicable` | derived | Yes when matrix `requiresSemiCon` | Derived | |

**Insufficient data:** Inner semi-conductor not in UI; matrix says MV requires semi-con but only **outer** field is selectable.

---

### 3.5 `screenType` (screen)

| Parent | Condition | Proposed values | Req class |
|--------|-----------|-----------------|-----------|
| `voltage` LV, matrix no screen | | None / No Screen allowed | Optional |
| `voltage` MV/HV/EHV | | Copper Tape, Wire, etc.; exclude None | **Required** | **Exists** |
| `family` OHL bare | | No Screen only | Not Applicable | **Exists** |
| `standard` | utility specs | **GAP** — SEC tape vs wire rules | Unknown |

---

### 3.6 `screenCSA`

| Parent | Condition | Proposed values | Req class |
|--------|-----------|-----------------|-----------|
| `screenType` = None/No Screen | | — | **Not Applicable** (hidden) | **Exists (unlock)** |
| `screenType` = metallic | | `DEFAULT_SCREEN_CSAS` \ {None} | Optional today | **GAP** |
| `conductorSize` + `screenType` | fault current | **GAP** — no ampacity table | Unknown |
| Validation | screen=None & CSA set | Error | **Exists** |

**Insufficient data:** No **screen type × cable size → minimum CSA** engineering table in repository.

---

### 3.7 `bedding`

| Parent | Condition | Proposed values | Req class |
|--------|-----------|-----------------|-----------|
| `family` bare (OHL) | | `Not Applicable` only | Not Applicable | **Exists** |
| `armour` ≠ None | typically | PVC / PE / LSHF bedding options | Optional |
| `screenType` set, no armour yet | unlock path | 5 `BEDDING_OPTIONS` | Optional | **Exists unlock** |
| `armour` = None | | **GAP** — bedding still required? | Unknown |

**Insufficient data:** No rule tying bedding requirement to armour presence vs multi-core laid-up construction.

---

### 3.8 `armour`

| Parent | Condition | Proposed values | Req class |
|--------|-----------|-----------------|-----------|
| `coresCount` = 1, family ≠ CONTROL | | AWA, ATA, None; exclude SWA/STA | FILTER | **Exists** |
| `coresCount` > 1 | | SWA, STA, AWA, DSTA, None | FILTER | **Exists** |
| `family` OHL bare | | No Armour only | Not Applicable | **Partial** |
| `specialArea` = direct burial | | **GAP** — should require armour? | Unknown |
| Matrix `recommendedArmour` | | Display only today | **Not wired to filter** |

**Insufficient data:** Installation area → armour requirement not in code. Matrix `recommendedArmour` is informational only.

---

### 3.9 `sheathing`

| Parent | Condition | Proposed values | Req class |
|--------|-----------|-----------------|-----------|
| `family` bare (OHL) | | `None` only | Not Applicable | **Exists** |
| Insulated cable | | PVC, PE, LSHF, MDPE, HDPE, etc. | Optional | **STATIC + CATALOG** |
| `insulation` = LSHF | | **GAP** — should restrict sheath? | Unknown |
| `cpr` = Yes | | **GAP** — LSZH/CPR sheath coupling | Unknown |

---

### 3.10 CPR (`cpr` + `cprClass`)

| Parameter | Parent | Condition | Values | Req class |
|-----------|--------|-----------|--------|-----------|
| `cpr` | `sheathing` | sheathing set | Yes \| No checkbox | Optional |
| `cprClass` | `cpr` | cpr = No | — | **Not Applicable** (hidden) |
| `cprClass` | `cpr` | cpr = Yes | B2ca, Cca, Dca, Eca, Fca | **Required** | **Validation exists** |
| `cprClass` | `standard` | EN 50575 project | **GAP** — should auto-require cpr=Yes? | Unknown |

**Insufficient data:** No link between `standard`, `specialArea` (EU export), and mandatory CPR.

---

### 3.11 Special properties (`waterTight`, `termiteProtection`, `specialArea`, `specialAdditives`)

| Parameter | Parent | Condition | Values today | Proposed req | GAP |
|-----------|--------|-----------|--------------|--------------|-----|
| `waterTight` | `sheathing` | unlocked after sheath | 5 blocking types | Optional | No link to MV/HV matrix “water blocking” note |
| `termiteProtection` | `sheathing` | unlocked | 5 options | Optional | No link to `specialArea` (direct burial) |
| `specialArea` | `sheathing` | unlocked | 9 areas | Optional | No feedback to armour/sheath/additives |
| `specialAdditives` | `sheathing` | unlocked | 5 additives | Optional | No conflict with `insulation`=LSHF; multi-select undefined |

**Insufficient data:** No cross-parameter matrix for environmental ratings (area × termite × water × additives).

---

### 3.12 `coreColors`

| Parent | Condition | Proposed behavior | Req class |
|--------|-----------|-------------------|-----------|
| `coresCount` = 1 | | **Not Applicable** — hide core color rows | N/A |
| `coresCount` > 1 | | One dropdown per core (max 12 UI cap today) | **Required** per core | Validation exists |
| `customerIdentification` | SEC, DEWA, etc. | **GAP** — should constrain palette | Unknown |
| `standard` | HD 308 S2, BS 7671 | **GAP** — `DEFAULT_STANDARD_CORE_COLORS_BY_COUNT` exists but **not wired** to UI | Unknown |
| PG | FAMILY ↔ CORE_COLOUR | Compatibility rules may block combos | **PG** — may be unconfigured |

**Insufficient data:** Standard/core-count color schemes exist in `masterDataServiceV2.ts` but are not applied in `resolveParameterOptionsV2`. PG `ParameterCompatibility` for CORE_COLOUR may be empty.

---

## 4. Proposed unlock chain (Stage 2)

Sequential unlock (same as today unless noted):

```
family
 → voltageClass → voltage → standard
 → conductorMaterial → conductorClass → conductorShape
 → conductorSize → cores → conductorWaterTight
 → insulation → insulationColor
 → outerSemiConductor
 → screenType → screenCSA → screenWaterTight
 → bedding → armour → armourWaterTight
 → sheathing → sheathingColor
 → waterTight → termiteProtection → cpr → cprClass → specialArea → specialAdditives
 → coreColors (if coresCount>1)
 → customerIdentification
```

**Stage 2 change:** `cpr` unlocks after `sheathing`; `cprClass` unlocks only when `cpr` = Yes.

---

## 5. Data insufficiency summary (do not implement until resolved)

| # | Topic | What exists | What is missing |
|---|-------|-------------|-----------------|
| 1 | Conductor CSA range | Static 0.5–2500 list | Family × voltage × material × application matrix |
| 2 | Core count | Full 1–61 list | Family-specific allowed cores (SINGLE, OHL, ABC, CONTROL) |
| 3 | OHL / TELECOM voltage | Empty voltageClass | Whether these families use voltage at all or different model |
| 4 | OHL sub-type (AAC/AAAC/ACSR) | `familySubType` derived | No UI path; matrix entries exist but not selectable |
| 5 | Screen CSA | Static list | Type + cable size → minimum CSA |
| 6 | Armour vs installation | Matrix `recommendedArmour` | `specialArea` → required armour type |
| 7 | Bedding necessity | Unlock after screen | Armour vs bedding dependency |
| 8 | Standard-driven insulation/sheath | Partial standard filter | BS 6724 LSHF, SEC, SAMSS attribute rules per field |
| 9 | CPR trigger | cpr + cprClass validation | When CPR is mandatory (market, standard, area) |
| 10 | Special additives | Static list | Conflicts with insulation/sheath; multi-select policy |
| 11 | Core colours | `DEFAULT_STANDARD_CORE_COLORS_BY_COUNT` | Not wired; customer scheme → palette |
| 12 | Catalog vs engineering | Token mismatch UGC/CU vs MV/Copper | Normalization spec for catalog merge |
| 13 | PostgreSQL coverage | 10 fields in evaluate | 19 technical fields not authoritative in PG |
| 14 | ParameterCompatibility DB | FAMILY↔VOLTAGE, FAMILY↔CORE_COLOUR | May be incomplete — causes CONFIGURATION_REQUIRED |

---

## 6. Excel companion

Editable matrix for your review:

**[`data/export/CABLE_SELECTION_STAGE2_PROPOSED_MATRIX.csv`](../data/export/CABLE_SELECTION_STAGE2_PROPOSED_MATRIX.csv)**

Columns: Sequence, Parameter Code, Parent(s), Condition, Available Values, Requirement Class, Value Source, Data Gap (Y/N), Reviewer Notes

---

## STOP

This document is **design only**. No application code or database was modified.  
Return edited CSV or comments on this matrix before Stage 2 implementation.
