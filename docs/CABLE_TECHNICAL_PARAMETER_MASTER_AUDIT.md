# Cable Technical Parameter / Cable Configurator V2 — Master Audit

**Workspace:** `D:/Projects/EPC_Platform/energya-connect-platform`  
**Audit date:** 2026-08-27  
**Scope:** Read-only code audit. No implementation performed.  
**Note on reverted code:** `parameterCascadingRulesV2` was deleted in a recent revert — **zero files and zero import references** remain in the repository (verified via glob + grep).

---

## 1. Executive Summary

Cable Configurator V2 ("Cable Technical Parameter") is a React UI layered over three partially connected engines:

| Layer | Location | Role today |
|---|---|---|
| **UI unlock chain** | `CascadingParameterGridV2.tsx` | Sequential boolean gates using static `DEFAULT_*` option lists from `masterDataServiceV2.ts` |
| **Prototype IEC validation** | `technicalValidationEngineV2.ts` | Client-side engineering rules; demoted to **warnings only** inside `evaluateCableConfigurationV2` |
| **PostgreSQL authority** | `src/domain/cableAuthority.ts` + `evaluatePersistedCable` | **Authoritative** for EXISTING_CABLE / INVALID / CONFIGURATION_REQUIRED decisions via `POST /api/cables/evaluate` |

**Top findings (facts):**

1. **`parameterCascadingRulesV2` is absent** — deleted; no replacement module is wired.
2. **`sanitizeDownstreamSelectionsV2` exists** in `cableSelectionEngineV2.ts` but is **not imported or called** by any UI component.
3. **`searchCablesByParametersV2` does not exist** anywhere in the codebase.
4. **Catalog filtering is largely disconnected from the UI** — `filterCableRecordsV2` / `getAvailableOptionsV2` run in `CableConfiguratorV2`, but `CascadingParameterGridV2` uses `availableOptions` **only for `customerCodes`**; all other dropdowns use hard-coded `DEFAULT_*` arrays.
5. **`parseMasterCableRecordV2` normalizes `family` to voltage-tier codes (`LV`/`MV`/`HV`)**, while the UI selects engineering families (`UGC`, `OHL`, `ABC`, etc.) — causing `filterCableRecordsV2` family matching to fail when family is selected.
6. **Conductor token mismatch** — UI uses `CU`/`AL`; parsed catalog records use `Copper`/`Aluminum` — catalog filter on `conductorMaterial` fails on exact match.
7. **Server authority is wired** — `CableConfiguratorV2` debounces `POST /api/cables/evaluate` (250 ms) and merges PG decision with local catalog snapshots.
8. **V2-specific unit tests are absent** — no tests for `filterCableRecordsV2`, `parseMasterCableRecordV2`, `validateCableConfigurationV2`, or `sanitizeDownstreamSelectionsV2`.
9. **`MatchingCablesGridV2` is imported in `CableConfiguratorV2.tsx` but never rendered** (dead import).
10. **Dual catalog sources** — V2 catalog comes from `localStorage` via `cableCatalogService.ts` / `getAllMasterRecordsV2()`; PG authority uses `CableMaster` + approved `CableEngineeringMapping` rows.

---

## 2. Technology Stack

Versions taken from `package.json` (dependencies + devDependencies).

| Technology | Version | Evidence file(s) | Role |
|---|---|---|---|
| React | ^19.0.1 | `package.json`, `src/App.tsx` | UI framework |
| react-dom | ^19.0.1 | `package.json` | DOM rendering |
| react-router-dom | ^6.28.0 | `package.json`, `src/App.tsx` | Client routing |
| TypeScript | ~5.8.2 | `package.json`, `tsconfig.json` | Type checking (`tsc --noEmit`) |
| Vite | ^6.2.3 | `package.json`, `vite.config.ts` | Frontend bundler + dev HMR |
| @vitejs/plugin-react | ^5.0.4 | `package.json`, `vite.config.ts` | React plugin |
| Tailwind CSS | ^4.1.14 | `package.json`, `@tailwindcss/vite` | Styling |
| Express | ^4.21.2 | `package.json`, `server.ts` | HTTP API + Vite middleware host |
| tsx | ^4.21.0 | `package.json` | Dev server runner (`tsx server.ts`) |
| esbuild | ^0.25.0 | `package.json` | Production server bundle |
| Prisma Client | ^6.16.2 | `package.json`, `prisma/schema.prisma` | PostgreSQL ORM |
| Prisma CLI | ^6.16.2 | `package.json` | Migrations |
| jsonwebtoken | ^9.0.3 | `package.json`, `server.ts` | JWT auth |
| bcryptjs | ^2.4.3 | `package.json` | Password hashing |
| xlsx | ^0.18.5 | `package.json` | Excel import (Technical Office) |
| lucide-react | ^0.546.0 | `package.json` | Icons |
| motion | ^12.23.24 | `package.json` | Animations |
| recharts | ^3.10.1 | `package.json` | Charts (dashboards) |
| three | ^0.185.1 | `package.json` | 3D (unrelated to configurator) |
| @google/genai | ^2.4.0 | `package.json`, `server.ts` | AI assistant widget |
| Node test runner | built-in | `package.json` `"test"` script | `tsx --test` |

**Build / run:** `npm run dev` → `tsx server.ts` (Express + Vite middleware). `npm run build` → Vite client build + esbuild server bundle.

---

## 3. Application Architecture

```
Browser (React SPA)
  ├── CableConfiguratorHub (v1/v2 switcher, localStorage preference)
  │     └── CableConfiguratorV2
  │           ├── cableSelectionEngineV2 (localStorage catalog parse/filter)
  │           ├── technicalValidationEngineV2 (IEC prototype + authority bridge)
  │           └── CascadingParameterGridV2 (static DEFAULT_* UI)
  │
  ├── CableSearchSelectModal (embeds CableConfiguratorV2)
  └── TechnicalOffice (internal)
        ├── TechnicalOfficeTcrQueue
        ├── TechnicalOfficeMappingQueue
        ├── TechnicalOfficeBomGovernanceQueue
        ├── TechnicalOfficeExcelPreImport
        └── TechnicalOfficeMasterParams

Express (server.ts)
  ├── /api/cables/*        → cableAuthorityRoutes.ts
  ├── /api/technical-office/* → cableAuthorityRoutes.ts (TCR)
  ├── /api/master/*        → masterDataRoutes.ts (reference params, CRUD)
  └── Vite middleware (dev) or static dist (prod)

PostgreSQL (Prisma)
  ├── CableMaster
  ├── CableParameter
  ├── ParameterCompatibility
  ├── CableEngineeringMapping (APPROVED overrides for authority)
  └── TechnicalOfficeRequest
```

**Authority split (documented in `docs/CABLE_MASTER_AUTHORITY.md`):**

- **EXISTING_CABLE** → PostgreSQL + approved engineering mapping
- **Catalog suggestions in V2 UI** → `localStorage` master catalog (`cableCatalogService.ts`), parsed by `parseMasterCableRecordV2`

---

## 4. Cable Configurator Architecture (Import Dependency Map)

Actual import graph (V2 core):

```
CableConfiguratorHub.tsx
  └── CableConfiguratorV2.tsx
        ├── ../types (SelectionStateV2, CableRecordV2, TechnicalValidationResultV2)
        ├── ../services/cableSelectionEngineV2
        │     ├── ../../../../types (MasterCableCatalogItem)
        │     └── ../../../../services/cableCatalogService (getStoredCableCatalog)
        ├── ../services/technicalValidationEngineV2
        │     ├── ../types
        │     ├── cableSelectionEngineV2 (getAllMasterRecordsV2)
        │     └── ../../../../domain/cableAuthority (evaluateCableAuthority)
        ├── ./SelectionModeCardV2
        ├── ./CascadingParameterGridV2
        │     ├── ../types
        │     └── ../services/masterDataServiceV2 (DEFAULT_*, CABLE_CONSTRUCTION_LOGIC_MATRIX)
        ├── ./CableResultPanelV2
        │     ├── ../services/masterDataServiceV2 (resolveConstructionLogic)
        │     └── ./SendToTechnicalOfficeModalV2
        │           └── ../services/technicalOfficeServiceV2
        ├── ./CuttingLengthSectionV2
        └── ./MatchingCablesGridV2  ← imported, NOT used in JSX
```

**Server-side authority path:**

```
CableConfiguratorV2 (fetch)
  → POST /api/cables/evaluate
    → cableAuthorityRoutes.ts
      → masterDataRepository.evaluatePersistedCable
        → domain/cableAuthority.evaluateCableAuthority
```

---

## 5. State Model (`SelectionStateV2`)

Defined in `src/components/cable-configurator/v2/types.ts`.

### Property usage table

| Property | In `SelectionStateV2` | Written by UI | Read by catalog filter | Read by `selectionsToConfig` | Read by IEC validation | Notes |
|---|---|---|---|---|---|---|
| `selectionMode` | ✓ | SelectionModeCardV2 | ✓ (customerCode gate) | ✗ | ✗ | `CUSTOMER` \| `TECHNICAL` |
| `family` | ✓ | Family buttons, matrix modal | ✓ | ✓ | ✓ | UI: UGC/OHL/ABC…; parser stores LV/MV/HV |
| `familySubType` | ✓ | familySubType select | ✗ | ✗ | ✗ | Not in filter or authority |
| `voltageClass` | ✓ | voltageClass select | ✓ | ✗ | ✗ | Set by voltage handler |
| `voltage` | ✓ | voltage select | ✓ | ✓ | ✓ | |
| `um` | ✓ | um select | ✗ | ✗ | ✗ | Display only |
| `standard` | ✓ | standard select | ✓ | ✗ | ✓ | |
| `conductorMaterial` | ✓ | select | ✓ | ✓ (as `conductor`) | ✓ | UI: CU/AL; catalog: Copper/Aluminum |
| `conductorClass` | ✓ | select | ✓ | ✗ | ✓ | |
| `conductorShape` | ✓ | select | ✗ | ✗ | ✗ | |
| `conductorCompacting` | ✓ | select | ✗ | ✗ | ✗ | |
| `conductorSize` | ✓ | select | ✓ | ✓ | ✓ | UI may include ` mm²` suffix |
| `conductorWaterTight` | ✓ | tri-state | ✗ | ✗ | ✗ | |
| `cores` | ✓ | select | ✓ | ✓ (via coresCount) | ✓ | |
| `coresCount` | ✓ | synced from cores | ✗ | ✓ | ✓ | |
| `insulation` | ✓ | select | ✓ | ✓ | ✓ | |
| `insulationColor` | ✓ | select | ✗ | ✗ | ✗ | |
| `semiConApplicable` | ✓ | tri-state | ✗ | ✗ | ✗ | Display default for MV/HV |
| `innerSemiConductor` | ✓ | select | ✗ | ✗ | ✗ | |
| `outerSemiConductor` | ✓ | select | ✓ | ✗ | ✓ | |
| `screenType` | ✓ | select | ✓ | ✓ (as `screen`) | ✓ | Label mismatch: UI "Copper Wire" vs catalog "Copper Wire Screen" |
| `screenMaterial` | ✓ | select | ✗ | ✗ | ✗ | |
| `screenCSA` | ✓ | select | ✓ | ✗ | ✓ | |
| `screenWaterTight` | ✓ | tri-state | ✓ | ✗ | ✗ | |
| `armour` | ✓ | select | ✓ | ✓ | ✓ | |
| `armourMaterial` | ✓ | select | ✓ | ✗ | ✓ | |
| `armourCSA` | ✓ | select | ✗ | ✗ | ✓ | |
| `armourWaterTight` | ✓ | tri-state | ✗ | ✗ | ✗ | |
| `bedding` | ✓ | select | ✗ | ✗ | ✗ | |
| `sheathing` | ✓ | select | ✓ | ✓ (as `sheath`) | ✗ | |
| `sheathingColor` | ✓ | select | ✓ | ✗ | ✗ | |
| `waterTight` | ✓ | select | ✗ | ✗ | ✗ | Cast `as any` in grid |
| `termiteProtection` | ✓ | select | ✗ | ✗ | ✗ | |
| `specialAdditives` | ✓ | chip multi-select | ✗ | ✗ | ✗ | |
| `cpr` | ✓ | (default in state) | ✗ | ✗ | ✓ | No dedicated UI control |
| `cprClass` | ✓ | select | ✗ | ✗ | ✓ | |
| `specialArea` | ✓ | select | ✗ | ✗ | ✗ | |
| `coreColors` | ✓ | per-core selects | ✗ | ✗ | ✓ | Record<number, string> |
| `coreIdentification` | ✓ | select | ✗ | ✗ | ✗ | |
| `coreNumbering` | ✓ | select | ✗ | ✗ | ✗ | |
| `customerIdentification` | ✓ | select | ✗ | ✗ | ✗ | |
| `customerCode` | ✓ | Mode 1 buttons | ✓ (CUSTOMER mode) | ✓ | ✗ | |
| `itemCode` | ✓ | text input | ✗ | ✗ | ✗ | |
| `cuttingLength` | ✓ | number input | ✗ | ✗ | ✗ | |
| `lengthTolerance` | ✓ | select | ✗ | ✗ | ✗ | |
| `drumType` | ✓ | select | ✗ | ✗ | ✗ | |
| `voltageId`, `u0`, `u`, `u0_u`, `voltageLevel`, `applicableConstruction`, `constructionLogic` | ✓ (optional) | ✗ not wired in grid | ✗ | ✗ | ✗ | Exist on type; unused in UI |
| `fillerBinder`, `innerSheath`, `screenConstruction`, `coreConstruction`, `semiConduct`, `graphite`, `edr`, `insulationThicknessMm`, `outerSemiConductorType`, `specialCustomerRequirements` | ✓ (optional) | ✗ | ✗ | ✗ | partial | On type / record; not in main grid |

**Default state in `CableConfiguratorV2`:** `selectionMode: 'CUSTOMER'`, `family: 'UGC'`, `voltageClass: 'MV'`, `voltage: '6/10 kV'`, `conductorMaterial: 'CU'`, etc.

---

## 6. Complete Parameter Inventory (from `CascadingParameterGridV2`)

Exact render order as of audit. `DEFAULT_*` source = `masterDataServiceV2.ts` unless noted.

### Pre-step: 11-Step Taxonomy Navigator (UI chrome only)

### Mode 1 block (only when `selectionMode === 'CUSTOMER'`)

| # | Label | State key | Options source |
|---|---|---|---|
| M1 | Customer Specification / Code Filter | `customerCode` | `availableOptions.customerCodes` (from catalog filter) |

### Step 1 — Cable Family & Sub-Type (`id="step-1-family"`)

| # | Label | State key | Options source |
|---|---|---|---|
| 1a | Primary Cable Family (buttons) | `family` | `DEFAULT_CABLE_FAMILIES` (codes: UGC, OHL, ABC, SINGLE, CONTROL, TELECOM) |
| 1b | Family Sub-Type | `familySubType` | `DEFAULT_FAMILY_SUBTYPES[family]` or `['Standard / General']` |
| — | Active Construction Logic card + Matrix modal | (presets via `handleSelectMatrixRow`) | `CABLE_CONSTRUCTION_LOGIC_MATRIX` |

### Step 2 — Voltage Rating & Standards (`id="step-2-voltage"`)

| # | Label | State key | Options source |
|---|---|---|---|
| 2a | Voltage Level / Class | `voltageClass` | `DEFAULT_VOLTAGE_CLASSES` |
| 2b | U0 / U Rating | `voltage` | `DEFAULT_VOLTAGES_BY_CLASS[voltageClass]` or fallback list |
| 2c | Um (Highest Equipment Voltage) | `um` | Inline arrays by `voltageClass` |
| 2d | Applicable Design Standard | `standard` | `DEFAULT_STANDARDS` |

### Step 3 — Conductor Architecture (`id="step-3-conductor"`)

| # | Label | State key | Options source |
|---|---|---|---|
| 3a | Conductor Material | `conductorMaterial` | `DEFAULT_CONDUCTOR_MATERIALS.map(m => m.code)` → CU, AL |
| 3b | Construction Class | `conductorClass` | `DEFAULT_CONDUCTOR_CLASSES` |
| 3c | Conductor Shape | `conductorShape` | `DEFAULT_CONDUCTOR_SHAPES` |
| 3d | Compacting | `conductorCompacting` | `DEFAULT_CONDUCTOR_COMPACTING` |
| 3e | Conductor CSA (mm²) | `conductorSize` | `DEFAULT_CONDUCTOR_SIZES` (numeric strings, no unit) |
| 3f | Number of Cores | `cores` | `DEFAULT_CORE_COUNTS` → `"N Core(s)"` |
| 3g | Conductor Water Blocking | `conductorWaterTight` | Tri-state Yes/No/N/A |

### Step 4 — Insulation System (`id="step-4-insulation"`)

| # | Label | State key | Options source |
|---|---|---|---|
| 4a | Insulation Material | `insulation` | `DEFAULT_INSULATIONS` |
| 4b | Insulation Base Color | `insulationColor` | `DEFAULT_INSULATION_COLORS` |

### Step 5 — Semi-Conductive Layer (`id="step-5-semicon"`)

| # | Label | State key | Options source |
|---|---|---|---|
| 5a | Semi-Con Layer Applicable | `semiConApplicable` | Tri-state; default display `(isMVorHV ? 'Yes' : 'No')` if unset |
| 5b | Inner Semi-Conductor | `innerSemiConductor` | `DEFAULT_INNER_SEMI_CONDUCTORS` |
| 5c | Outer Semi-Conductor | `outerSemiConductor` | `DEFAULT_OUTER_SEMI_CONDUCTORS` |

### Step 6 — Metallic Screening (`id="step-6-screening"`)

| # | Label | State key | Options source |
|---|---|---|---|
| 6a | Screen Type | `screenType` | `DEFAULT_SCREEN_TYPES` |
| 6b | Screen Material | `screenMaterial` | `DEFAULT_SCREEN_MATERIALS` |
| 6c | Screen Cross-Section (CSA) | `screenCSA` | `DEFAULT_SCREEN_CSAS` |
| 6d | Screen Water Tightness | `screenWaterTight` | Tri-state |

### Step 7 — Mechanical Armouring (`id="step-7-armour"`)

| # | Label | State key | Options source |
|---|---|---|---|
| 7a | Armour Type | `armour` | `DEFAULT_ARMOUR_TYPES` |
| 7b | Armour Material | `armourMaterial` | `DEFAULT_ARMOUR_MATERIALS` |
| 7c | Armour Dimension / Size | `armourCSA` | `DEFAULT_ARMOUR_CSAS` |
| 7d | Armour Water Tightness | `armourWaterTight` | Tri-state |

### Step 8 — Outer Sheathing & Bedding (`id="step-8-sheath"`)

| # | Label | State key | Options source |
|---|---|---|---|
| 8a | Outer Sheath Material | `sheathing` | `DEFAULT_SHEATHINGS` |
| 8b | Outer Sheath Color | `sheathingColor` | `DEFAULT_SHEATHING_COLORS` |
| 8c | Bedding / Inner Sheath | `bedding` | Inline array (5 values) |

### Step 9 — Special Properties (`id="step-9-special"`)

| # | Label | State key | Options source |
|---|---|---|---|
| 9a | Water Tight / Water Blocking System | `waterTight` | `DEFAULT_WATER_BLOCKING_TYPES` |
| 9b | Termite / Rodent Protection | `termiteProtection` | `DEFAULT_TERMITE_PROTECTIONS` |
| 9c | CPR Euroclass | `cprClass` | `DEFAULT_CPR_CLASSES` |
| 9d | Special Installation Area | `specialArea` | `DEFAULT_SPECIAL_AREAS` |
| 9e | Special Performance Additives (multi) | `specialAdditives` | `DEFAULT_SPECIAL_ADDITIVES` (chip buttons) |

### Step 10 — Core Identification (`id="step-10-coreid"`)

| # | Label | State key | Options source |
|---|---|---|---|
| 10a | Core Identification Standard | `coreIdentification` | `DEFAULT_CORE_IDENTIFICATIONS` |
| 10b | Core Numbering Marking | `coreNumbering` | Inline array (3 values) |
| 10c | Customer-Specific Identification | `customerIdentification` | `DEFAULT_CUSTOMER_IDENTIFICATIONS` |
| 10d | Individual Core Colors (if coresCount > 1) | `coreColors[n]` | `DEFAULT_CORE_COLORS` per core |

### Step 11 — Size & Commercial Logistics (`id="step-11-logistics"`)

| # | Label | State key | Options source |
|---|---|---|---|
| 11a | Cutting Length (Meters) | `cuttingLength` | free numeric input |
| 11b | Cutting Length Tolerance | `lengthTolerance` | `DEFAULT_LENGTH_TOLERANCES` |
| 11c | Packaging Drum Type | `drumType` | `DEFAULT_DRUM_TYPES` |
| 11d | Customer / SAP Item Code | `itemCode` | free text input |

**Total distinct parameter controls:** 43 (excluding navigator, construction logic card, matrix modal).

---

## 7. Current Parameter Order

Same as Section 6. Summary sequence:

1. (CUSTOMER mode) Customer code filter  
2. Family → Sub-type → Construction logic reference  
3. Voltage class → U0/U → Um → Standard  
4. Conductor material → class → shape → compacting → CSA → cores → conductor water blocking  
5. Insulation → insulation color  
6. Semi-con applicable → inner → outer  
7. Screen type → material → CSA → water tight  
8. Armour type → material → dimension → water tight  
9. Sheath → sheath color → bedding  
10. Water blocking → termite → CPR class → special area → additives  
11. Core ID → numbering → customer ID → per-core colors  
12. Cutting length → tolerance → drum → item code  

---

## 8. Current Cascading Logic (per parameter)

Legend:

- **A. UI UNLOCK** — `isUnlocked` boolean in `renderParamSelector` / `renderTriStateSelector`
- **B. ENGINEERING FILTER** — rules in validation engines or inline handlers (not option list filtering)
- **C. CATALOG FILTER** — `filterCableRecordsV2` field match (only affects `availableOptions.customerCodes` in UI today)

| Parameter | A. UI UNLOCK condition | B. ENGINEERING | C. CATALOG FILTER | Implemented in |
|---|---|---|---|---|
| `customerCode` | Mode 1 section visible | ✗ | ✓ exact `customerCode` | `filterCableRecordsV2`; options from `getAvailableOptionsV2` |
| `family` | always (step 1) | Matrix presets voltage/insulation/screen | ✓ exact `record.family` | Grid; `handleSelectMatrixRow`; **mismatch with parser** |
| `familySubType` | `Boolean(selections.family)` | `resolveConstructionLogic` | ✗ | Grid |
| `voltageClass` | `Boolean(selections.family)` | Matrix presets | ✓ exact `voltageClass` | Grid |
| `voltage` | `Boolean(selections.voltageClass)` | `handleUpdateParam` sets class, semi-con, screen | ✓ exact `voltage` | Grid + `CableConfiguratorV2` |
| `um` | `Boolean(selections.voltage)` | ✗ | ✗ | Grid |
| `standard` | `Boolean(selections.voltage)` | IEC standard vs voltage checks | ✓ exact `standard` | `validateCableConfigurationV2` |
| `conductorMaterial` | `Boolean(selections.voltage)` | ✗ | ✓ exact match | Grid; **CU/AL vs Copper/Aluminum mismatch** |
| `conductorClass` | `Boolean(selections.conductorMaterial)` | Class 1 vs size > 35 mm² | ✓ exact | Grid + validation |
| `conductorShape` | `Boolean(selections.conductorClass)` | ✗ | ✗ | Grid |
| `conductorCompacting` | `Boolean(selections.conductorShape)` | ✗ | ✗ | Grid |
| `conductorSize` | `Boolean(selections.conductorMaterial)` | size required | ✓ exact (incl. ` mm²` mismatch risk) | Grid + validation |
| `cores` | `Boolean(selections.conductorSize)` | single-core armour rule | ✓ exact `cores` string | Grid + validation |
| `conductorWaterTight` | `Boolean(selections.conductorSize)` | ✗ | ✗ | Grid |
| `insulation` | `Boolean(selections.cores)` | MV/HV: PVC/LSHF blocked | ✓ exact | Grid + validation |
| `insulationColor` | `Boolean(selections.insulation)` | ✗ | ✗ | Grid |
| `semiConApplicable` | `Boolean(selections.insulation)` | MV/HV mandatory semi-con | ✗ | Grid + validation (outer) |
| `innerSemiConductor` | `Boolean(selections.insulation)` | ✗ | ✗ | Grid |
| `outerSemiConductor` | `Boolean(selections.insulation)` | MV/HV required ≠ N/A | ✓ exact | Grid + validation |
| `screenType` | `Boolean(selections.insulation)` | MV/HV: No Screen blocked | ✓ exact | Grid + validation |
| `screenMaterial` | `screenType` set and ≠ `None` | ✗ | ✗ | Grid |
| `screenCSA` | `screenType` set and ≠ `None` | consistency with screen type | ✓ exact | Grid + validation |
| `screenWaterTight` | `screenType` set and ≠ `None` | ✗ | ✓ exact TriState | Grid |
| `armour` | `Boolean(selections.insulation)` | single-core SWA blocked | ✓ exact | Grid + validation |
| `armourMaterial` | `armour` set and ≠ `None` | ✗ | ✓ exact | Grid |
| `armourCSA` | `armour` set and ≠ `None` | consistency rule | ✗ | Grid + validation |
| `armourWaterTight` | `armour` set and ≠ `None` | ✗ | ✗ | Grid |
| `sheathing` | `Boolean(selections.insulation)` | ✗ | ✓ exact | Grid |
| `sheathingColor` | `Boolean(selections.sheathing)` | ✗ | ✓ exact | Grid |
| `bedding` | `armour` set and ≠ `None` | ✗ | ✗ | Grid |
| `waterTight` | **always `true`** | ✗ | ✗ | Grid |
| `termiteProtection` | **always `true`** | ✗ | ✗ | Grid |
| `cprClass` | **always `true`** | CPR Yes requires class | ✗ | Grid + validation (`cpr` not in grid) |
| `specialArea` | **always `true`** | ✗ | ✗ | Grid |
| `specialAdditives` | always (chip section) | ✗ | ✗ | Grid |
| `coreIdentification` | `Boolean(selections.cores)` | ✗ | ✗ | Grid |
| `coreNumbering` | `Boolean(selections.cores)` | ✗ | ✗ | Grid |
| `customerIdentification` | **always `true`** | ✗ | ✗ | Grid |
| `coreColors[n]` | `coresCount > 1` | per-core required | ✗ | Grid + validation |
| `cuttingLength` | always (no lock) | ✗ | ✗ | Grid |
| `lengthTolerance` | **always `true`** | ✗ | ✗ | Grid |
| `drumType` | **always `true`** | ✗ | ✗ | Grid |
| `itemCode` | always (text) | ✗ | ✗ | Grid |

**Deleted module:** `parameterCascadingRulesV2` — **not present**; no per-family engineering option filtering is active.

---

## 9. Current Engineering Rules (`CABLE_CONSTRUCTION_LOGIC_MATRIX`)

**Source:** `masterDataServiceV2.ts` — 11 entries:

| # | familyCode | subFamily | voltageCategory | constructionLogic | Key rules |
|---|---|---|---|---|---|
| 1 | UGC | LV | LV | Power cable | screen optional, semi-con false |
| 2 | UGC | MV | MV | Screened MV power cable | requiresScreen, requiresSemiCon |
| 3 | UGC | HV | HV | Screened HV power cable | requiresScreen, requiresSemiCon |
| 4 | UGC | EHV | EHV | Specialized HV/EHV | requiresScreen, requiresSemiCon |
| 5 | OHL | AAC | N/A | Bare overhead conductor | isBareConductor |
| 6 | OHL | AAAC | N/A | Bare overhead alloy | isBareConductor |
| 7 | OHL | ACSR | N/A | Bare ACSR | isBareConductor |
| 8 | ABC | LV ABC | LV | Aerial bundled cable | insulation required, no screen |
| 9 | SINGLE | LV/MV/HV | Depending | Single-core construction | isSingleCore, AWA recommended |
| 10 | CONTROL | Signal | Usually LV | Control/signal | multi-core |
| 11 | TELECOM | Telecom | N/A | Telecom-specific | |

**Resolver:** `resolveConstructionLogic(family, familySubType, voltageClass)` — used for display card only; does **not** disable parameters automatically.

**Matrix modal `handleSelectMatrixRow`:** sets family, sub-family, voltage class/rating, and conditional presets (bare conductor, ABC, SINGLE, screened MV).

**Prototype IEC rules** (`validateCableConfigurationV2`): MV/HV insulation, semi-con, screening, armour/core, CPR, standard-voltage, conductor class size — surfaced as **warnings** in `evaluateCableConfigurationV2`, not blocking authority.

---

## 10. Current Catalog Filtering (search match matrix)

### Client: `filterCableRecordsV2`

| Selection field | Match rule | Notes |
|---|---|---|
| `customerCode` | exact (CUSTOMER mode only) | |
| `family` | exact `record.family === selections.family` | **Broken for UGC/OHL UI values** — parser stores LV/MV/HV |
| `voltageClass` | exact | |
| `voltage` | exact string | |
| `standard` | exact | Parser uses short names; UI uses long `DEFAULT_STANDARDS` labels — likely no match |
| `conductorMaterial` | exact | **CU/AL vs Copper/Aluminum** |
| `conductorClass` | exact | Parser: `Class 2`; UI: `Class 2 — Stranded` |
| `conductorSize` | exact | Parser: `"120 mm²"`; UI default: `"120 mm²"` but dropdown values are `"120"` without unit |
| `cores` | exact | Generally aligned |
| `insulation` | exact | |
| `outerSemiConductor` | exact | Parser: `Extruded Bonded Semi-Con`; UI: `Extruded Bonded Semi-Conductor` / `Strippable` |
| `screenType` | exact | Parser: `Copper Wire Screen`; UI: `Copper Wire` |
| `screenCSA` | exact | |
| `screenWaterTight` | exact TriState | Parser: Yes/No; UI TriState uses Yes/No/N/A |
| `armour` | exact | Parser: `SWA`; UI: `SWA` (when matched) |
| `armourMaterial` | exact | |
| `sheathing` | exact | Parser: `PVC ST2`; UI: `PVC` |
| `sheathingColor` | exact | |

**Not filtered:** familySubType, um, conductor shape/compacting, inner semi-con, screen material, bedding, special properties, core ID, logistics fields.

### Server: `searchCables` (`GET /api/cables/search`)

Prisma `contains` (case-insensitive) on: `customerCode`, `itemCode`, `materialNumber`, `family`, `voltage`, `conductor`, `cores`, `diameter`, plus free-text `q` across description fields.

**`searchCablesByParametersV2`:** **does not exist.**

---

## 11. PostgreSQL Authority (evaluate flow)

```
UI selections
  → selectionsToConfig()  // subset: customerCode, family, voltage, conductor, conductorSize, cores, insulation, screen, armour, sheath
  → POST /api/cables/evaluate { config }
    → evaluatePersistedCable(config)
      → Load CableMaster (ACTIVE)
      → Load CableParameter (ACTIVE)
      → Load ParameterCompatibility (all)
      → Load CableEngineeringMapping (APPROVED, isCurrent)
      → Merge approved mapping fields over CableMaster row
      → evaluateCableAuthority(config, { cables, parameters, compatibility })
  → Response { decision: CableDecision }
  → evaluateCableConfigurationV2 merges decision with local catalog records for UI status
```

**Decision codes (`CableDecision.code`):**

| Code | Meaning | quotationAllowed | technicalOfficeEligible |
|---|---|---|---|
| `EXISTING_CABLE` | Match in PG (+ approved mapping for structured fields) | true | false |
| `TECHNICALLY_VALID_NOT_MASTER` | Valid but no master row | false | true |
| `INVALID_CONFIGURATION` | Failed rules / bad parameters | false | false |
| `CONFIGURATION_REQUIRED` | Missing compatibility rules or incomplete mapping | false | false |

**Required compatibility pairs (hard-coded):** `FAMILY ↔ VOLTAGE`, `FAMILY ↔ CORE_COLOUR` (`REQUIRED_COMPATIBILITY_PAIRS` in `cableAuthority.ts`). If rules absent in DB → immediate `CONFIGURATION_REQUIRED`.

**UI mapping:** `EXISTING_CABLE` → displayed as `EXISTING_APPROVED` in `evaluateCableConfigurationV2`.

---

## 12. Validation Architecture

| Mechanism | Type | Where | Blocks quotation? |
|---|---|---|---|
| UI unlock (`isUnlocked === false`) | **UI DISABLE** | `CascadingParameterGridV2` | No — downstream dimmed |
| `validateCableConfigurationV2` errors | **WARNING** (relabeled) | `technicalValidationEngineV2` | No — prefixed `[Prototype IEC note]` |
| `evaluateCableAuthority` failed rules | **HARD BLOCK** | Server + client bridge | Yes when `INVALID_CONFIGURATION` or `CONFIGURATION_REQUIRED` |
| `filterCableRecordsV2` | **CATALOG FILTER** | `CableConfiguratorV2` useMemo | No — only shrinks `customerCodes` list |
| Missing PG parameter | **DB AUTHORITY** | `parameterExists` check | Yes → `INVALID_CONFIGURATION` |
| Missing compatibility matrix | **DB AUTHORITY** | `REQUIRED_COMPATIBILITY_PAIRS` | Yes → `CONFIGURATION_REQUIRED` |
| Unapproved engineering mapping | **DB AUTHORITY** | `evaluatePersistedCable` + mapping merge | Structured match → `CONFIGURATION_REQUIRED` |
| Identity-only material lookup | **DB AUTHORITY** | `cableMatchesConfig` with blank engineering fields | Can return `EXISTING_CABLE` |

---

## 13. Technical Office Architecture

### UI components (`src/components/cable-configurator/v2/components/`)

| Component | Purpose | Data store |
|---|---|---|
| `SendToTechnicalOfficeModalV2` | Submit TCR from valid-new-cable state | `technicalOfficeServiceV2` + optional `POST /api/technical-office/requests` |
| `TechnicalOfficeTcrQueue` | TCR list / workflow | localStorage `energya_v2_technical_requests` + API |
| `TechnicalOfficeMappingQueue` | Engineering mapping approval | API / governance repos |
| `TechnicalOfficeBomGovernanceQueue` | BOM conflicts | governance |
| `TechnicalOfficeExcelPreImport` | Excel cable pre-import validation | XLSX + `parseMasterCableRecordV2` |
| `TechnicalOfficeMasterParams` | Custom master params | localStorage `energya_v2_custom_master_params` |
| `TechnicalOfficeCostingWorkbench` | Costing integration | costing services |
| `TechnicalOfficePriceGovernanceQueue` | Price governance | governance |
| `TechnicalOfficePricingRulesQueue` | Pricing rules | commercial |

**Internal hub:** `src/components/internal/TechnicalOffice.tsx` — tabs: mapping, BOM, TCR, catalog, excel_sync, params, bom_materials.

**TCR creation:** `createTechnicalCableRequestFromSelections` in `technicalOfficeServiceV2.ts` — uses `validateCableConfigurationV2`, stores full `SelectionStateV2`.

---

## 14. Family Hierarchy (UGC, OHL, ABC, SINGLE, CONTROL, TELECOM)

From `DEFAULT_CABLE_FAMILIES` + `DEFAULT_FAMILY_SUBTYPES`:

| Code | Label | Sub-types |
|---|---|---|
| **UGC** | UGC Power Cable | LV, MV, HV, EHV |
| **OHL** | OHL | AAC, AAAC, ACSR |
| **ABC** | ABC | LV ABC, MV ABC |
| **SINGLE** | Single Core | LV/MV/HV, LV Single Core, MV Single Core, HV Single Core, EHV Single Core |
| **CONTROL** | Signal & Control | Signal, Control, Instrumentation |
| **TELECOM** | Telecom | Telecom, Pair/Quad, Coaxial |

**Type union also includes `OHTL`** in `types.ts` (`CableFamilyCode`) — used in parser heuristics, not in `DEFAULT_CABLE_FAMILIES` buttons.

**Construction logic matrix** maps 11 archetypes (4 UGC voltage tiers + 3 OHL + 1 ABC + 1 SINGLE + 1 CONTROL + 1 TELECOM).

---

## 15. UGC Flow

**FACT (current UI behavior):**

1. User selects **UGC** → auto-sets `familySubType` to first sub-type (`LV` via `DEFAULT_FAMILY_SUBTYPES`).
2. `resolveConstructionLogic` picks UGC row by `familySubType` or `voltageClass` (LV/MV/HV/EHV).
3. Voltage unlocks after family; MV/HV presets applied on voltage change in `CableConfiguratorV2.handleUpdateParam`.
4. Matrix modal can jump to UGC LV/MV/HV/EHV with voltage presets (600/1000 V, 12/20 kV, 76/132 kV, 230/400 kV).
5. Insulation/screen/armour sections always unlock after `cores` (not suppressed for bare conductor except via matrix presets).

**INFERENCE:** Full UGC engineering cascade (e.g. auto-hide insulation for wrong tier) is **not implemented** without `parameterCascadingRulesV2`.

---

## 16. OHL Flow

**FACT:**

1. User selects **OHL** → sub-types AAC, AAAC, ACSR.
2. `resolveConstructionLogic` returns bare-conductor archetype (no insulation/screen required per matrix rules).
3. Matrix `handleSelectMatrixRow` for `isBareConductor`: sets insulation `None (Bare Conductor)`, outer semi `N/A`, screen `No Screen`, armour `No Armour`, sheath `None`, conductor `AL`.
4. UI still shows insulation/screen/armour steps unlocked once `cores` selected — **no automatic hide/disable** for OHL.

**GAP:** OHL-specific parameter suppression exists only as matrix presets, not as live cascading rules.

---

## 17. Downstream Sanitization (`sanitizeDownstreamSelectionsV2`)

| Question | Answer |
|---|---|
| **Exists?** | Yes — `cableSelectionEngineV2.ts` lines 401–481 |
| **Wired to UI?** | **No** — grep shows zero imports outside its own file |
| **Called from `handleUpdateParam`?** | **No** — `CableConfiguratorV2` only syncs `coresCount` / `coreColors` and voltage presets |
| **Hierarchy order** | customerCode → family → voltage → standard → conductorMaterial → conductorClass → conductorSize → cores → insulation → outerSemiConductor → screenType → screenCSA → screenWaterTight → armour → armourMaterial → sheathing → sheathingColor |
| **Behavior** | Iteratively validates each downstream field against `getAvailableOptionsV2(filtered)`; clears invalid field and all below |

**Conclusion:** Exists in code but **not consumed by UI**. Upstream changes can leave stale downstream values.

---

## 18. API Contracts (actual shapes)

### `POST /api/cables/evaluate`

**Request:**
```json
{
  "config": {
    "customerCode": "string?",
    "itemCode": "string?",
    "materialNumber": "string?",
    "family": "string?",
    "voltage": "string?",
    "conductor": "string?",
    "conductorSize": "string|number?",
    "cores": "string|number?",
    "insulation": "string?",
    "screen": "string?",
    "armour": "string?",
    "sheath": "string?",
    "coreColour": "string?",
    "diameter": "number?"
  }
}
```
Body may also be flat (`req.body` fallback).

**Response:**
```json
{
  "decision": {
    "code": "EXISTING_CABLE | TECHNICALLY_VALID_NOT_MASTER | INVALID_CONFIGURATION | CONFIGURATION_REQUIRED",
    "message": "string",
    "technicalOfficeEligible": "boolean",
    "quotationAllowed": "boolean",
    "cable": "CableMasterSnapshot?",
    "matches": "CableMasterSnapshot[]",
    "failedRules": [{ "field": "string", "message": "string" }],
    "matchAttributesUsed": "string[]"
  }
}
```

### `GET /api/cables/search`

Query: `q`, `customerCode`, `itemCode`, `materialNumber`, `family`, `voltage`, `conductor`, `cores`, `diameter`, `page`, `pageSize`.

**Response:** `{ cables: [...], total, page, pageSize }` (paginated CableMaster rows).

### `GET /api/cables/compatibility`

**Response:** `{ rules: ParameterCompatibility[] }`

### `GET /api/master/reference`

**Response:** `{ parameters: CableParameter[] }` (used by V2 on mount).

### `POST /api/technical-office/requests`

**Request:**
```json
{
  "requestNumber": "string?",
  "status": "string?",
  "configuration": "object (full SelectionStateV2 or subset)",
  "customer": "string?",
  "quantity": "string?",
  "cuttingLength": "string?",
  "requestedDate": "string?",
  "requesterName": "string?",
  "requesterEmail": "string?",
  "reason": "string?"
}
```

**Response:** `{ request: TechnicalOfficeRequest row }` (201).

### `GET /api/technical-office/requests`

**Response:** `{ requests: TechnicalOfficeRequest[] }` (auth + `assertCanProcessTechnicalOffice`).

---

## 19. Test Coverage

| Test file | Covers V2 configurator? |
|---|---|
| `src/domain/cableAuthority.test.ts` | Authority domain only (not UI) |
| `src/server/cableAuthority.persistence.test.ts` | PG evaluate + search |
| `src/server/increment4.readiness.test.ts` | `evaluatePersistedCable` scenarios |
| `src/server/increment5.governance.test.ts` | Unmapped official cable guard |
| `src/server/increment6.approval.test.ts` | Mapping approval + authority |
| `src/server/increment7.workbench.test.ts` | Mapping workbench + authority |
| `src/server/increment8.bom.test.ts` | BOM + authority regression |
| `src/services/configuratorRegression.test.ts` | **V1 only** (`cableConstraintEngine`) |

**No tests found for:**

- `parseMasterCableRecordV2`
- `filterCableRecordsV2`
- `getAvailableOptionsV2`
- `sanitizeDownstreamSelectionsV2`
- `validateCableConfigurationV2` / `evaluateCableConfigurationV2`
- `CascadingParameterGridV2` / `CableConfiguratorV2` components
- `parameterCascadingRulesV2` (deleted; `parameterCascadingRulesV2.test.ts` also absent)

---

## 20. Current Limitations

1. **Dual catalog truth** — UI catalog filtering uses localStorage; authority uses PostgreSQL.
2. **Static dropdowns** — 42 of 43 controls ignore live `availableOptions` (only `customerCode` uses it).
3. **Token/normalization gaps** — family, conductor, standard, screen, semi-con, sheath strings differ between UI, parser, and PG.
4. **`sanitizeDownstreamSelectionsV2` unwired** — stale combinations possible.
5. **`parameterCascadingRulesV2` removed** — no family-specific engineering option filtering.
6. **Construction logic is display-only** — matrix does not gate parameters.
7. **`MatchingCablesGridV2` unused** — filtered catalog not shown to user.
8. **`filteredRecords` / `totalMasterCount` props unused** in grid body.
9. **Default state mismatch** — initial `family: 'UGC'` vs parser `family: 'MV'` prevents catalog filter from matching out of the box.
10. **CPR tri-state** — `cpr` in state but no UI control; only `cprClass` select.
11. **Mode 2 (TECHNICAL)** — same grid as Mode 1 minus customer code section; no distinct technical workflow in grid.
12. **V1 still available** — `CableConfiguratorHub` defaults to V2 but V1 (`SmartConfigurator`) remains switchable.

---

## 21. Engineering Cascade Gaps (current vs required future)

| Area | Current (fact) | Future requirement (not implemented) |
|---|---|---|
| Per-family parameter visibility | All sections shown; unlock chain only | OHL hides insulation/screen; ABC hides MV semi-con; etc. |
| Option list filtering | Static `DEFAULT_*` | Engineering-filtered lists per family/voltage |
| Catalog-driven dropdowns | Only `customerCode` | All fields use `getAvailableOptionsV2` |
| Normalization layer | Ad hoc in authority | Shared `normalizeSelectionForCatalog` / PG |
| `parameterCascadingRulesV2` | **Deleted** | Family-aware rule module with tests |
| Downstream sanitization | Function exists, unwired | Call on every `handleUpdateParam` |
| Voltage master | `VoltageMasterRecord` type + defaults | PG-controlled voltage table driving UI |
| Core colour authority | `CORE_COLOUR` compatibility required in PG | UI must send `coreColour` in evaluate config |
| Single-core armour | Validation error only | UI filters armour options to AWA/ATA |
| OHL bare conductor | Matrix preset only | Auto-lock insulation/screen/armour fields |

---

## 22. Recommended Architecture for Stage 2 (recommendations only)

1. **Single normalization module** — Map UI `SelectionStateV2` → `CableConfigInput` + catalog query DTO with one token registry (CU→Copper, UGC→family codes, voltage strings).
2. **Three-layer cascade coordinator** — Orchestrator calling UI unlock rules, engineering rules (restored `parameterCascadingRulesV2`), and catalog `getAvailableOptionsV2` in one pass.
3. **Wire `sanitizeDownstreamSelectionsV2`** (or successor) in `handleUpdateParam` before `setSelections`.
4. **Replace static dropdowns** — `masterOptions = engineeringFilter(DEFAULT_*, rules) ∩ availableOptions` per field.
5. **Unify catalog source** — Fetch PG cable snapshots for client filter (or SSR endpoint) instead of localStorage-only for commercial paths.
6. **Construction logic as rules** — Convert `CABLE_CONSTRUCTION_LOGIC_MATRIX` rules into data-driven visibility/validation, not just display.
7. **V2 test suite** — Unit tests per family flow (UGC MV, OHL AAC, SINGLE 1-core, ABC LV).
8. **Evaluate payload expansion** — Include `coreColour`, `standard`, `familySubType` when PG schema supports them.

---

## 23. Files That Would Need Modification (future — list only)

| File | Likely change |
|---|---|
| `src/components/cable-configurator/v2/components/CascadingParameterGridV2.tsx` | Dynamic options, family gating |
| `src/components/cable-configurator/v2/components/CableConfiguratorV2.tsx` | Sanitization, wire MatchingCablesGrid, evaluate payload |
| `src/components/cable-configurator/v2/services/cableSelectionEngineV2.ts` | Normalization, fix parser family codes, wire search |
| `src/components/cable-configurator/v2/services/technicalValidationEngineV2.ts` | Align IEC rules with authority |
| `src/components/cable-configurator/v2/services/masterDataServiceV2.ts` | Matrix → rules export |
| `src/components/cable-configurator/v2/types.ts` | Align enums / optional fields |
| `src/domain/cableAuthority.ts` | Extended match attributes |
| `src/server/masterDataRepository.ts` | `evaluatePersistedCable` field merge |
| `src/server/cableAuthorityRoutes.ts` | New endpoints if needed |
| `prisma/schema.prisma` | Additional parameter kinds / cable attributes |
| `src/services/cableCatalogService.ts` | PG sync vs localStorage deprecation |
| `src/components/cable-configurator/v2/services/technicalOfficeServiceV2.ts` | TCR payload alignment |
| New: `parameterCascadingRulesV2.ts` | Restored engineering cascade |
| New: `parameterCascadingRulesV2.test.ts` | Regression tests |
| `docs/TECHNICAL_PARAMETERS_V2_USER_GUIDE.md` | User-facing update after Stage 2 |

---

## 24. Risks

| Risk | Severity | Description |
|---|---|---|
| False `TECHNICALLY_VALID_NOT_MASTER` | High | Valid catalog cables not found due to string mismatches in client filter |
| False `INVALID_CONFIGURATION` | High | PG parameter codes may not match UI labels (e.g. voltage `600/1000V` vs `6/10 kV`) |
| `CONFIGURATION_REQUIRED` in production | Medium | Missing `FAMILY↔CORE_COLOUR` rules blocks quotation until admin seeds compatibility |
| Stale downstream selections | Medium | Unwired sanitization after upstream changes |
| Dual catalog drift | Medium | localStorage imports diverge from PG CableMaster |
| Dead code confusion | Low | `sanitizeDownstreamSelectionsV2`, `MatchingCablesGridV2` import suggest features that appear broken |
| V1/V2 parallel maintenance | Medium | Hub switcher keeps legacy constraint engine alive |
| Approved mapping dependency | High | Structured EXISTING_CABLE requires `CableEngineeringMapping` APPROVED — many imports may be identity-only |

---

## 25. Questions Requiring Technical Office Confirmation

1. **Family taxonomy:** Should catalog `family` be engineering code (`UGC`, `OHL`) or voltage tier (`LV`, `MV`, `HV`) — parser currently uses voltage tier?
2. **Conductor tokens:** Canonical form for authority — `CU`/`AL`, `Copper`/`Aluminum`, or IEC prose?
3. **Voltage strings:** Canonical PG `CableParameter` codes for evaluate — e.g. `600/1000V` vs `0.6/1 kV` vs `600/1000 V (0.6/1 kV)`?
4. **Screen labels:** Map `Copper Wire` (UI) to `Copper Wire Screen` (catalog) — which is master?
5. **OHL workflow:** Should insulation/screen/armour sections be hidden or N/A-locked for bare conductors?
6. **ABC MV:** Is `MV ABC` sub-type in scope for Stage 2 matrix row (only `LV ABC` exists today)?
7. **CORE_COLOUR compatibility:** What seed rules are required for `FAMILY ↔ CORE_COLOUR` — currently triggers `CONFIGURATION_REQUIRED` if absent?
8. **Customer code mode:** Should selecting `customerCode` auto-populate all 11 steps from a template record?
9. **Catalog source of truth for UI filtering:** PostgreSQL only, or continue localStorage for prototyping?
10. **Restore `parameterCascadingRulesV2`?** Confirm intended rule set before re-implementation.
11. **Standard field:** Long descriptive strings in UI vs short IEC codes in parser — which wins for matching?
12. **Identity-only cables:** How should UI behave for ACTIVE `CableMaster` without approved engineering mapping?

---

## Appendix A — Traced Functions

| Function | Location | Status |
|---|---|---|
| `parseMasterCableRecordV2` | `cableSelectionEngineV2.ts` | Active — parses localStorage catalog |
| `filterCableRecordsV2` | `cableSelectionEngineV2.ts` | Active — called from `CableConfiguratorV2` |
| `getAvailableOptionsV2` | `cableSelectionEngineV2.ts` | Active — mostly unused by grid |
| `searchCablesByParametersV2` | — | **Does not exist** |
| `evaluateCableAuthority` | `domain/cableAuthority.ts` | Active — shared domain |
| `evaluatePersistedCable` | `server/masterDataRepository.ts` | Active — PG loader |
| `sanitizeDownstreamSelectionsV2` | `cableSelectionEngineV2.ts` | **Exists, not wired** |
| `parameterCascadingRulesV2` | — | **Deleted** |

---

## Appendix B — Related Documentation

| Document | Relevance |
|---|---|
| `docs/CABLE_MASTER_AUTHORITY.md` | PG authority model (aligned with code) |
| `docs/INQUIRY_LINE_CABLE_AUTHORITY.md` | Inquiry integration |
| `docs/TECHNICAL_PARAMETERS_V2_USER_GUIDE.md` | User guide (may predate revert) |
| `docs/CABLE_MASTER_DATA_ONBOARDING.md` | Import onboarding |

---

*End of audit. No code was modified during this review.*
