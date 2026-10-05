# V3 — TRUE ENGINEERING CABLE CONFIGURATION ENGINE
## STEP 01 — DEPENDENCY DISCOVERY

**STATUS:** DESIGN / ANALYSIS ONLY  
**IMPLEMENTATION:** NOT STARTED  
**DATABASE CHANGES:** NONE  
**V1 STATUS:** UNCHANGED  
**V2 STATUS:** FROZEN  

**Date:** 2026-09-12  
**Mode:** Analysis / architecture only. This document does **not** authorize V3 implementation, Prisma, APIs, or UI.

**Mandatory source:** `Cable Selection with Dependencies.xlsx`  
**Path analyzed (read-only, not copied, not modified):**  
`c:\Users\POP\Desktop\SW Projects\B2B Project\Master Data Template\Cable Selection with Dependencies.xlsx`

**Companion artifact:** [02_V3_DEPENDENCY_MATRIX.xlsx](./02_V3_DEPENDENCY_MATRIX.xlsx)

**Overall gate (this step):** **NOT READY — TECHNICAL OFFICE INPUT REQUIRED**  
**Next authorized state (this step):** **BLOCKED — TECHNICAL OFFICE CLARIFICATION REQUIRED**

Do **not** treat this document as READY FOR IMPLEMENTATION.

A lookup list is **not** a compatibility rule. Seven example cables are **not** an exhaustive combination matrix. Where evidence is insufficient, status is **UNDEFINED — TECHNICAL OFFICE INPUT REQUIRED**. No engineering rules were invented.

---

## 1. V3 scope

V3 is a **new** engineering configuration engine, conceptually parallel to:

| Version | Role | This task |
|---------|------|-----------|
| V1 | Legacy / production configurator (`CableConfiguratorHub`, `/internal/cable-parameters`) | **Untouched** |
| V2 | Frozen product configurator (`cable-configurator/v2/*`, `V2ConfigurationSnapshot`, `/api/v2` inquiry configuration) | **Frozen / untouched** |
| V3 | True engineering engine driven by Technical Office dependency model | **Design only** |

V3 conceptual modules (not implemented):

```text
V3
 ├── Engineering Masters
 ├── Dependency Rules
 ├── Compatibility Rules
 ├── Selection Engine
 ├── Validation Engine
 ├── Downstream Sanitization
 ├── Cable Authority (reuse outcome codes; do not fork logic yet)
 ├── Configuration Result
 └── Versioned Configuration Snapshot
```

**Out of scope for Step 01 and for any silent follow-on:** V1/V2 code, Prisma, APIs, UI, Cable Master data, `evaluateCableAuthority()`, inquiry/cutting/drum/costing/quotation, D365.

---

## 2. Source workbook inventory

### 2.1 File facts

| Item | Value |
|------|--------|
| Sheets | `Cable Selection Sheet`, `Dependencies`, `Master Catalog Lists` |
| Analyzed | Yes — every used range (`A1:S34`, `A1:AT27`, `A1:AC50`) |
| Altered | **No** |

### 2.2 Cable Selection Sheet

| Item | Raw observation |
|------|-----------------|
| Title row | `CABLE SELECTION & SPECIFICATION SHEET` |
| Subtitle | `Integrated Dependencies: Family, Standard, Size, Material, Shape, Cores, Insulation, Screen, and Sheathing Rules.` |
| Header row | `Item`, `Family`, `Standard`, `Voltage Rating`, `Conductor Class`, `No. of Cores`, `Conductor Size (mm²)`, `Conductor Material`, `Conductor Shape`, `Insulation`, `Outer Semi-Con`, `Screen Type`, `Bedding`, `Armour`, `Sheathing`, `Sheathing Color`, `Water Tightness`, `CPR Class`, `Cable Description (Auto)` |
| Dimensions | 19 columns × 34 rows; **7 populated examples** (Item 1–7); Items 8–30 empty |
| Merges | None detected by parser |

**These 7 rows are example specifications, not a closed compatibility universe.** Coexistence on one row proves that **that** combination was written down. It does **not** prove every similar combination is valid.

Exact example rows (raw):

| Item | Family | Standard | Voltage Rating | Conductor Class | Cores | Size | Material | Shape | Insulation | Outer Semi-Con | Screen | Bedding | Armour | Sheath | Color |
|------|--------|----------|----------------|-----------------|-------|------|----------|-------|------------|----------------|--------|---------|--------|--------|-------|
| 1 | MV power cables | IEC 60502-2 | 12/20 (24) kV | Round Compacted | 3 | 240 | Copper | Round | XLPE | Strippable | Copper Wire Screen ( CWS ) | PVC | STA | PVC | Red |
| 2 | MV power cables | BS 6622 | 12.7/22 (24) kV | Round Compacted | 1 | 400 | Aluminuim | Round | XLPE | Bonded | Copper Tape Screen ( CTS ) | PVC | AWA | MDPE | Black |
| 3 | LV Power cables | BS 50525-3-41 | 450/750 V | Solid | 1 | 2.5 | Copper | Round | LSHF | N/A | N/A | N/A | N/A | N/A | N/A |
| 4 | LV Power cables | IEC 60227-3 | 450/750 V | Stranded Uncompacted | 1 | 4 | Copper | Round | PVC | N/A | N/A | N/A | N/A | N/A | N/A |
| 5 | LV Power cables | BS 50525-2-31 | 450/750 V | Flexible | 1 | 1.5 | Copper | Round | PVC | N/A | N/A | N/A | N/A | N/A | N/A |
| 6 | LV Power cables | BS 50525-2-11 | 300/500 V | Flexible | 3 | 1.5 | Copper | Round | PVC | N/A | N/A | N/A | N/A | PVC | White |
| 7 | LV Power cables | IEC 60227-7 | 300/500 V | Flexible | 1 | 1.5 | Copper | Round | PVC | N/A | N/A | PVC | N/A | PVC | Grey |

**Water Tightness** and **CPR Class** are blank on all 7 examples.

Raw issues on this sheet:

| Issue | Evidence |
|-------|----------|
| Spelling | `Aluminuim` (Item 2) |
| Capitalization | `MV power cables` vs `LV Power cables` |
| Class vs shape mix | Item 1–2 put `Round Compacted` in **Conductor Class** and `Round` in **Conductor Shape** |
| N/A | Used for outer semi-con, screen, bedding, armour, sheath, color on several LV rows |
| Auto description | Concatenated string; duplicates some tokens (`Round` twice on Item 1) |

### 2.3 Dependencies

| Item | Raw observation |
|------|-----------------|
| Title | `CABLE ATTRIBUTE & DEPENDENCY LOOKUP TABLES` |
| Shape | **46 independent named columns**, ~25 data rows |
| Headers (row 3, exact) | `MV_All_V`, `MV_IEC_V`, `MV_BS_V`, `MV_Wire_V`, `LV_All_V`, `LV_IEC_V`, `LV_BS_V`, `LV_Wire_V`, `MV_Standard`, `LV_Standard`, `MV_Cores`, `LV_Cores`, `Cores_Single`, `MV_ConductorClass`, `LV_ConductorClass`, `Class_Below10`, `Class_Aluminium`, `MV_Size`, `LV_Size`, `Size_Al`, `Size_Solid_Al`, `Mat_All`, `Mat_Copper_Only`, `Shape_Conductor`, `Shape_Large`, `Shape_Small`, `Ins_XLPE`, `Ins_PVC`, `Ins_LSHF`, `Ins_LV_All`, `MV_OuterSemiCon`, `LV_OuterSemiCon`, `Type_Screen`, `Screen_Cu_Only`, `Screen_None`, `Type_Bedding`, `Bedding_None`, `Type_Armour`, `Armour_None`, `Type_Sheathing`, `Sheath_None`, `Color_Sheathing`, `Color_None`, `Type_WaterTight`, `Class_CPR`, `Cable_Family` |

**Critical finding:** cells in the same **row** across columns are **not** a declared combination. Example: row 1 of `MV_IEC_V` (`3.6/6 (7.2) kV`) is **not** evidenced as paired with row 1 of `MV_Standard` (`BS 6622`).

These columns are **named option lists**. Whether each name is:

- an allowed-value catalog, or
- an option filter (e.g. “voltages when standard family = IEC”), or
- a compatibility subset (e.g. `Class_Aluminium`)

is **UNDEFINED — TECHNICAL OFFICE INPUT REQUIRED**.

Notable raw values:

- Screen: `Copper Tape Screen ( CTS )`, `Copper Wire Screen ( CWS )`, ` Over lapped Copper Tape + Copper Wire ( CTS + CWS )` (**leading space**), `Aluminuim Wire Screen ( AWS )`, `Aluminuim Foil Screen`, `N/A`
- Family: only `MV power cables`, `LV Power cables`
- Water tightness: `Longitudinal`, `Radial`, `Radial and Longitudinal`
- Outer semi-con LV list: `N/A` only
- `Cores_Single` = `1` only
- `Screen_None` / `Bedding_None` / `Armour_None` / `Sheath_None` / `Color_None` = `N/A`

### 2.4 Master Catalog Lists

| Item | Raw observation |
|------|-----------------|
| Headers (row 1, exact) | `family`, `voltage Class`, `voltage`, `standard`, `conductor Material`, `conductor Class`, `conductor Shape`, `conductor Size`, `cores`, `conductor WaterTight`, `insulation`, `insulation Color`, `outerSemiConductor`, `screenType`, `screenCSA`, `screenWaterTight`, `bedding`, `armour`, `armourWaterTight`, `sheathing`, `sheathingColor`, `waterTight`, `termiteProtection`, `cpr`, `cprClass`, `specialArea`, `specialAdditives`, `coreColors`, `customer Identification` |
| Shape | Independent columns (V2-like field names). Values in the same row are **not** a configuration. |
| Empty columns (no non-header values) | `conductor WaterTight`, `screenCSA`, `screenWaterTight`, `armourWaterTight`, `specialArea`, `specialAdditives`, `customer Identification` |

Raw quality:

| Issue | Examples (exact) |
|-------|------------------|
| Trailing space | `Copper `, `Round `, `SWA `, `Natrual` wait — `Natrual` is a misspelling; `Bonded `; `3 Triplex `; `B2ca-s1a,d1,a1 ` |
| Misspelling | `Aluminuim `, `Natrual` |
| Leading space | ` Over lapped Copper Tape + Copper Wire ( CTS + CWS )` |
| Extra family values vs Dependencies | `HV power cables`, `Instrumentation Cables`, `OHTL`, `BUILDING WIRE` |
| CPR dual columns | `cpr` = B2ca/Cca/Dca/Eca/Fca ; `cprClass` = Euroclass strings |
| Core colors | Multi-core **schemes** (`Brown - Blue`, `Black with White Numbering`), not a per-core palette only |

**Normalization is proposed later. Raw strings are the source of truth until Technical Office confirms aliases.**

---

## 3. Current V2 architecture findings

Inspected (not modified): `parameterCascadingRulesV2.ts`, `masterDataServiceV2.ts`, `technicalValidationEngineV2.ts`, `cableSelectionEngineV2.ts`, `v2CableConfigurationService.ts`, `cableAuthority.ts`, `CableConfiguratorV2.tsx`, `CableConfiguratorHub.tsx`, Prisma `CableMaster` / `CableParameter` / `ParameterCompatibility` / `CableEngineeringMapping` / `V2ConfigurationSnapshot`, `v2InquiryConfigurationRepository.ts`, `serverAudit.ts`, `rbac.ts`, `customerScope.ts`, docs `CABLE_SELECTION_PARAMETERS_EXPORT_ANALYSIS.md`, `CABLE_SELECTION_STAGE2_PROPOSED_DEPENDENCY_MATRIX.md`, `TECHNICAL_PARAMETERS_V2_USER_GUIDE.md`, `docs/v2/11`, `docs/v2/34`.

### 3.1 V1 vs V2 configurator

| Layer | Location | Behavior |
|-------|----------|----------|
| V1 hub | `CableConfiguratorHub` + `CableConfiguratorModal` | Internal cable parameters; also used from Technical Office |
| V2 grid | `cable-configurator/v2` | Sequential unlock + option filters + `sanitizeSelectionsAfterChange` |
| Authority | `evaluateCableAuthority` via `POST /api/cables/evaluate` | PostgreSQL parameters + sparse `ParameterCompatibility` + Cable Master match |
| Snapshot | `V2ConfigurationSnapshot` | JSON `selections` + `configInput` + flow/engineering status; **no dependency-model version** |

### 3.2 Current V2 cascade (unlock, as coded)

```text
family
  → voltageClass
    → voltage
      → standard
      → conductorMaterial
        → conductorClass → conductorShape
        → conductorSize → cores, conductorWaterTight
          → insulation → insulationColor, outerSemiConductor, screenType, sheathing
            → screenCSA / screenWaterTight (if screen present)
            → bedding (insulation + screenType)
            → armour (bedding OR screenType) → armourWaterTight
            → sheathingColor, waterTight, termite, cprClass, specialArea, specialAdditives, customerIdentification
```

Filters that exist in V2 **code** (not in the TO workbook as pairwise rules): MV voltage set, standard-by-class string matching, ABC→LV only, OHL/TELECOM empty class, MV insulation excludes PVC/LSHF, LV outer semi-con N/A-only, MV requires screen, 1-core armour biased to AWA/ATA.

### 3.3 Authority outcomes (actual code vs product language)

| Product language (task / docs) | Code (`DomainIssueCode`) |
|--------------------------------|--------------------------|
| EXISTING_APPROVED | `EXISTING_CABLE` |
| VALID_NEW_CABLE | `TECHNICALLY_VALID_NOT_MASTER` |
| INVALID_CONFIGURATION | `INVALID_CONFIGURATION` |
| CONFIGURATION_REQUIRED | `CONFIGURATION_REQUIRED` |

These four are **sufficient** for V3 conceptually. Do **not** add statuses in this step. Presentation may label them; persistence should keep the existing codes unless a later architecture increment explicitly maps them.

`evaluateCableAuthority` only consumes a **subset** of UI fields (`family`, `voltage`, `conductor`, `conductorSize`, `cores`, `insulation`, `screen`, `armour`, `sheath`, identity). Compatibility pairs actually required in code: **FAMILY↔VOLTAGE**, **FAMILY↔CORE_COLOUR**. Missing PG rules → `CONFIGURATION_REQUIRED`.

### 3.4 Masters vs UI

`CableParameter.kind` enum: `FAMILY`, `VOLTAGE`, `CONDUCTOR`, `INSULATION`, `SCREEN`, `ARMOUR`, `SHEATH`, `CORE_COLOUR`, `STANDARD` only. V2 UI fields such as voltage class, conductor class/shape, screen CSA, water tightness, CPR, special additives **have no ParameterKind**.

### 3.5 Security / audit / lineage (reuse, do not change)

JWT + RBAC + `customerScope` remain the platform. Server `AuditEvent` is authoritative. Inquiry configuration snapshots already lineage into cutting/drum/costing. V3 must eventually snapshot **engine + dependency model versions** so historical inquiries do not silently pick up later TO rule changes. V2 snapshots do **not** store those versions today.

---

## 4. Field reconciliation

Status: **MATCH** / **PARTIAL** / **NEW** / **CONFLICT** / **MISSING** / **UNDEFINED**.

Do not force a match. Display labels must not become keys (see §9).

| TO name (workbook) | V2 key | DB today | Sheet | Proposed V3 code | Type | Customer selectable? | Status |
|--------------------|--------|----------|-------|------------------|------|----------------------|--------|
| Family | `family` | `CableMaster.family`, kind FAMILY | All 3 | `FAMILY` | enum | Yes | **CONFLICT** — TO: `LV Power cables` / `MV power cables` / HV / OHTL / … vs V2: UGC/OHL/ABC/SINGLE/CONTROL/TELECOM |
| (none) | `familySubType` | none | — | `FAMILY_SUBTYPE` | enum | Derived? | **UNDEFINED** — hidden V2; not in workbook |
| voltage Class | `voltageClass` | none | Catalog | `VOLTAGE_CLASS` | enum | Yes | **PARTIAL** — catalog LV/MV/HV; Dependencies imply MV/LV lists only |
| Voltage Rating / voltage | `voltage` | `CableMaster.voltage`, kind VOLTAGE | All 3 | `VOLTAGE_RATING` | enum | Yes | **PARTIAL** — notation `12/20 (24) kV` vs V2 `12/20 kV (12.7/22 kV)` |
| Standard | `standard` | `CableMaster.standard`, kind STANDARD | All 3 | `STANDARD` | enum | Yes | **PARTIAL** — catalog includes IEC 60840/62067, UL 83; Dependencies split MV/LV lists |
| Conductor Material | `conductorMaterial` | `CableMaster.conductor`, kind CONDUCTOR | All 3 | `CONDUCTOR_MATERIAL` | enum | Yes | **PARTIAL** — Copper / Tinned Copper / `Aluminuim`; V2 CU/AL |
| Conductor Class | `conductorClass` | none | All 3 | `CONDUCTOR_CLASS` | enum | Yes | **CONFLICT** — examples put `Round Compacted` here; catalog uses Solid/Stranded/Flexible |
| Conductor Shape | `conductorShape` | none | All 3 | `CONDUCTOR_SHAPE` | enum | Yes | **PARTIAL** — Round / Sector; compacting mixed into class |
| Conductor Size (mm²) | `conductorSize` | `CableMaster.conductorSize` | All 3 | `CONDUCTOR_SIZE_MM2` | decimal-coded | Yes | **PARTIAL** — lists exist (MV_Size, LV_Size, Size_Al, Size_Solid_Al) without pairing proof |
| No. of Cores / cores | `cores` | `CableMaster.cores` | All 3 | `CORE_COUNT` | enum | Yes | **PARTIAL** — `1`, `3`, `3 Triplex`, catalog 1–48; V2 `1 Core` labels |
| conductor WaterTight | `conductorWaterTight` | none | Catalog empty | `CONDUCTOR_WATER_TIGHT` | flag | **UNDEFINED** | **MISSING** in TO lists |
| Insulation | `insulation` | kind INSULATION | All 3 | `INSULATION` | enum | Yes | **PARTIAL** — XLPE/PVC/LSHF lists; no combination table |
| insulation Color | `insulationColor` | none | Catalog | `INSULATION_COLOR` | enum | Yes | **NEW** vs Cable Master; catalog has `Natrual` |
| Outer Semi-Con | `outerSemiConductor` | none | All 3 | `OUTER_SEMI_CON` | enum | Conditional | **PARTIAL** — MV Bonded/Strippable; LV N/A |
| Screen Type | `screenType` | `CableMaster.screen`, kind SCREEN | All 3 | `SCREEN_TYPE` | enum | Conditional | **PARTIAL** — named types + N/A; spacing/typos |
| screenCSA | `screenCSA` | none | Catalog **empty** | `SCREEN_CSA` | enum/number | Conditional | **MISSING** / **UNDEFINED** parents |
| screenWaterTight | `screenWaterTight` | none | Catalog empty | `SCREEN_WATER_TIGHT` | flag | **UNDEFINED** | **MISSING** |
| Bedding | `bedding` | none | All 3 | `BEDDING` | enum | Conditional | **PARTIAL** — Type_Bedding vs Bedding_None |
| Armour | `armour` | kind ARMOUR | All 3 | `ARMOUR_TYPE` | enum | Conditional | **PARTIAL** — SWA/STA/AWA/ATA/GSTA/N/A |
| armourWaterTight | `armourWaterTight` | none | Catalog empty | `ARMOUR_WATER_TIGHT` | flag | **UNDEFINED** | **MISSING** |
| (none) | `armourCSA` | none (removed UI) | — | `ARMOUR_CSA` | number | Derived? | **UNDEFINED** — not in workbook |
| Sheathing | `sheathing` | kind SHEATH | All 3 | `SHEATH_TYPE` | enum | Conditional | **PARTIAL** |
| Sheathing Color | `sheathingColor` | `sheathColour` | All 3 | `SHEATH_COLOR` | enum | Conditional | **PARTIAL** |
| Water Tightness / waterTight | `waterTight` | none | Dep + Catalog | `WATER_TIGHTNESS` | enum | **UNDEFINED** who selects | **PARTIAL** list; blank on examples |
| termiteProtection | `termiteProtection` | none | Catalog Yes/No | `TERMITE_PROTECTION` | flag | **UNDEFINED** | **NEW** vs authority |
| cpr | `cpr` (removed from V2 grid) | none | Catalog | `CPR_DECLARED` | flag/enum | **UNDEFINED** | **CONFLICT** with `cprClass` |
| CPR Class / cprClass | `cprClass` | none | Dep + Catalog | `CPR_CLASS` | enum | **UNDEFINED** | **PARTIAL** list; blank on examples |
| specialArea | `specialArea` | none | Catalog empty | `SPECIAL_AREA` | enum | **UNDEFINED** | **MISSING** |
| specialAdditives | `specialAdditives` | `CableMaster.specialAdditives` | Catalog empty | `SPECIAL_ADDITIVE` | multi | **UNDEFINED** | **MISSING** in this workbook |
| coreColors | `coreColors` | kind CORE_COLOUR | Catalog | `CORE_COLOR_SCHEME` | enum | Conditional | **CONFLICT** — schemes vs per-core V2 UI |
| customer Identification | `customerIdentification` | none | Catalog empty | `CUSTOMER_IDENTIFICATION` | enum | **UNDEFINED** | **MISSING** |
| Cable Description (Auto) | generated description | `description` | Selection | `CONFIGURATION_DESCRIPTION` | string | SYSTEM_DERIVED | **NEW** as derived |
| (none) | `um` | none | — | `UM` | derived | SYSTEM_DERIVED | **UNDEFINED** vs TO voltage `(24)` Um-style |
| customerCode / itemCode | same | Cable Master | — | identity | string | Mode-dependent | **MATCH** conceptually; not in this workbook |

**Fields analyzed: 42.**

---

## 5. Dependency classification

Every discovered relationship uses **exactly one** primary class. Secondary notes allowed.

| ID | Relationship | Class | Evidence | Completeness |
|----|--------------|-------|----------|--------------|
| D01 | Voltage class → Voltage list names (`MV_*_V`, `LV_*_V`) | **B OPTION FILTER** *candidate* | Named lists exist | **UNDEFINED** whether exclusive |
| D02 | IEC vs BS vs Wire voltage subsets | **B OPTION FILTER** *candidate* | `MV_IEC_V` / `MV_BS_V` / `MV_Wire_V` | **UNDEFINED** parent (which standard?) |
| D03 | Voltage class → Standard list | **B OPTION FILTER** *candidate* | `MV_Standard` / `LV_Standard` | Rows not paired to a voltage |
| D04 | Family → Voltage class | **C COMPATIBILITY** needed | Catalog families vs 2-value `Cable_Family` | **UNDEFINED** |
| D05 | Family → Standard | **C** needed | Examples only (7 rows) | **UNDEFINED** |
| D06 | Standard → Conductor material | **C** needed | Examples only | **UNDEFINED** |
| D07 | Conductor material → Class | **B** *candidate* | `Class_Aluminium`, `Mat_Copper_Only` | **UNDEFINED** if exclusive |
| D08 | Size vs class (`Class_Below10`, `Size_Solid_Al`) | **C** *candidate* | Named lists | **UNDEFINED** thresholds/parents |
| D09 | Material → Size (`Size_Al`) | **B** *candidate* | List | **UNDEFINED** |
| D10 | Shape vs size (`Shape_Large` / `Shape_Small`) | **B** *candidate* | Same two shapes both lists | **UNDEFINED** |
| D11 | Voltage class → Outer semi-con | **B** *candidate* | `MV_OuterSemiCon` vs `LV_OuterSemiCon=N/A` | High for LV N/A **if** list is exclusive |
| D12 | Screen type catalog | **F MASTER DATA REFERENCE** | `Type_Screen` | Not compatibility |
| D13 | `Screen_Cu_Only` | **C** *candidate* | Name only | **UNDEFINED** parent (material? voltage?) |
| D14 | Screen CSA | — | Empty | **UNDEFINED** |
| D15 | Core count lists MV/LV/Single | **B** *candidate* | `MV_Cores`, `LV_Cores`, `Cores_Single` | **UNDEFINED** |
| D16 | Insulation type catalogs | **F** | `Ins_XLPE` etc. | Not combinations |
| D17 | Armour catalog | **F** | `Type_Armour` | 1-core AWA in **one example** ≠ rule |
| D18 | N/A none-lists | **A UNLOCK** *or* **D VALIDATION** | `*_None` = N/A | **UNDEFINED** meaning of N/A |
| D19 | Water tightness catalog | **F** | 3 values | Blank on examples |
| D20 | CPR class catalog | **F** | `Class_CPR` | Blank on examples |
| D21 | Core color schemes | **F** | Catalog column | No cores↔colors table |
| D22 | Auto description | **E PRESENTATION ONLY** | Selection sheet | Derived string |
| D23 | V2 sequential unlock | **A UNLOCK** (V2 implementation) | `isParameterUnlocked` | **Not TO-sourced** |
| D24 | V2 sanitization | **D VALIDATION** / sanitization (V2) | `sanitizeSelectionsAfterChange` | Filters not TO-sourced |
| D25 | Cable Master match | **G WORKFLOW** | `evaluateCableAuthority` | Preserve |

---

## 6. V3 cascade proposal

### 6.1 CURRENT V2 CASCADE

See §3.2. Single-parent unlock for most fields; some filters use voltage class **or** parsed voltage. Screen CSA unlocks from screen type only (full static CSA list). Armour filter uses core count. Sanitization walks `CASCADE_SANITIZE_ORDER` and clears values not in `resolveParameterOptionsV2`.

### 6.2 TECHNICAL OFFICE EVIDENCE

The workbook supplies:

1. Independent **master lists** (Catalog + many Dependency columns).
2. **Named subset lists** whose names *suggest* filters (MV vs LV, IEC vs BS, Cu-only, Al size, single core).
3. **Seven** positive example configurations.
4. **No** from→to ALLOWED/FORBIDDEN matrix.
5. **No** Screen CSA / special additive / special area / customer identification lists.

### 6.3 PROPOSED V3 CASCADE (not a V2 copy)

Until Technical Office answers P0 questions, V3 must **not** encode V2’s invented filters as truth.

**Independent (catalog) until proven otherwise:** Family, CPR class list, water-tightness list, sheath color list, insulation color list, termite Yes/No.

**Candidate single-parent option filters (only if TO confirms the named list is exclusive):**

| Child | Candidate parent | List evidence |
|-------|------------------|---------------|
| Voltage | Voltage class | `MV_All_V` / `LV_All_V` |
| Voltage | Standard family (IEC/BS/Wire) | `MV_IEC_V` / `MV_BS_V` / `MV_Wire_V` |
| Standard | Voltage class | `MV_Standard` / `LV_Standard` |
| Outer semi-con | Voltage class | `MV_OuterSemiCon` / `LV_OuterSemiCon` |
| Conductor class | Voltage class | `MV_ConductorClass` / `LV_ConductorClass` |
| Size | Voltage class | `MV_Size` / `LV_Size` |
| Cores | Voltage class | `MV_Cores` / `LV_Cores` |

**Multi-parent / UNDEFINED (do not implement as parent→child):** Screen CSA, armour applicability, armour CSA, sheath vs voltage, water tightness vs construction, CPR vs family/sheath, core color scheme vs cores+standard, conductor size vs class+material+shape, special additives.

**Derived:** configuration description; possibly Um from voltage rating **if** TO confirms the parenthetical kV is Um.

**Conditional N/A:** LV examples show N/A for screen/bedding/armour/sheath — **not** proven for all LV.

V3 cascade status: **UNDEFINED pending TO.** A frozen V2-like cascade must not be copied forward as “the engineering model.”

---

## 7. Compatibility matrix

**Explicit pairwise rules represented in the workbook: 0.**  
**Positive example configurations: 7.**  
**Named subset lists that might become option filters after TO confirmation: 46 columns.**

| Relationship | Evidence | Rule explicit? | V2 support | V3 requirement | Confidence | TO clarification? |
|--------------|----------|----------------|------------|----------------|------------|-------------------|
| Family ↔ Family Sub-Type | Sub-type not in workbook | No | Hidden sync UGC←class | UNDEFINED | None | Yes |
| Family ↔ Voltage Class | Catalog families vs 2 Cable_Family | No | ABC→LV; OHL empty | Compatibility needed | Low | Yes |
| Voltage Class ↔ Voltage | Named MV/LV voltage lists | List only | Yes (coded filter) | Option filter **if exclusive** | Medium | Yes |
| Voltage ↔ Standard | Separate lists; 7 examples | No | String-includes filter | Compatibility needed | Low | Yes |
| Standard ↔ Conductor Material | Examples only | No | CU/AL always | UNDEFINED | None | Yes |
| Conductor Material ↔ Class | `Class_Aluminium`, `Mat_Copper_Only` | Name only | Weak | UNDEFINED | Low | Yes |
| Class ↔ Shape | Compacted language in class column | Conflict | Class→shape unlock | Taxonomy first | Low | Yes |
| Material ↔ Size | `Size_Al` | List only | No real matrix | UNDEFINED | Low | Yes |
| Class ↔ Size | `Class_Below10`, `Size_Solid_Al` | Name only | Class 1 >35mm² in validation | UNDEFINED | Low | Yes |
| Core Count ↔ Construction | `3 Triplex`; MV/LV core lists | List + examples | Full 1–61 | UNDEFINED | Low | Yes |
| Core Count ↔ Insulation | Examples only | No | Cores unlock insulation | UNDEFINED | None | Yes |
| Insulation ↔ Screen | LV N/A examples; MV screens | Examples | MV requires screen | UNDEFINED for all LV/MV | Low | Yes |
| Screen ↔ Screen CSA | CSA column empty | No | Static CSA list | UNDEFINED | None | Yes |
| Screen ↔ Screen WT | Empty | No | Checkbox if screen | UNDEFINED | None | Yes |
| Cores ↔ Core Colors | Scheme list independent | No | Per-core dropdowns | UNDEFINED | None | Yes |
| Cores ↔ Armour | Item1 STA/3c; Item2 AWA/1c | 2 examples | 1-core AWA bias | UNDEFINED | Low | Yes |
| Armour ↔ Armour WT | Empty | No | Checkbox | UNDEFINED | None | Yes |
| Bedding ↔ Armour | Examples | No | Unlock chain | UNDEFINED | None | Yes |
| Armour ↔ Sheath | Examples | No | Parallel unlock | UNDEFINED | None | Yes |
| Sheath ↔ Sheath Color | Color list + Color_None | List | Unlock | UNDEFINED N/A rules | Low | Yes |
| Voltage ↔ Sheath | Examples mix PVC/MDPE/N/A | No | No voltage-sheath matrix | UNDEFINED | None | Yes |
| Water Tightness ↔ Construction | 3 values; examples blank | No | After sheath | UNDEFINED | None | Yes |
| CPR ↔ Sheath / Family | CPR lists; examples blank | No | After sheath | UNDEFINED | None | Yes |
| Special Area ↔ Construction | Empty | No | After sheath | MISSING | None | Yes |
| Special Additives ↔ Construction | Empty | No | Static additives | MISSING | None | Yes |

**Do not infer ALLOWED from list coexistence or from a single example row.**

---

## 8. Multi-parent dependency analysis

| Dependent | Parent 1 | Parent 2 | Parent 3+ | Evidence | Completeness | Implementation recommendation |
|-----------|----------|----------|-----------|----------|--------------|-------------------------------|
| Screen CSA | Screen type | Voltage? | Core count? Construction? | **No list** | Incomplete | **Do not implement** until TO table exists |
| Armour | Cores | Voltage class | Family / screen | 2 examples + Type_Armour list | Incomplete | Treat list as master; compatibility **UNDEFINED** |
| Armour CSA | Armour | Cores | Size? | Not in workbook | Incomplete | Remain UNDEFINED / not in V3 MVP |
| Sheath | Voltage | Standard | Armour / indoor vs power | Examples only | Incomplete | Master list only |
| Water tightness | Construction | Standard | Customer spec | List only | Incomplete | Master list; do not auto-set |
| Core color scheme | Cores | Standard | Earth present? | Scheme catalog | Incomplete | Do not bind to V2 per-core UI until TO |
| CPR class | Family | Sheath | Installation | List only | Incomplete | Master list |
| Special additives | Family | Sheath | Area | Empty | Incomplete | Out of workbook scope |
| Conductor size | Material | Class | Voltage / standard | Multiple size lists | Incomplete | Do not cartesian-product lists |
| Conductor shape | Class | Size | Material | Shape_Large/Small identical | Incomplete | Taxonomy decision first |
| Outer semi-con | Voltage class | Insulation | Screen | MV vs LV lists | Partial | Option filter **only if** TO says LV is always N/A |
| Voltage | Voltage class | Standard family | Family | IEC/BS/Wire lists | Partial | Multi-parent option filter **if confirmed** |
| Standard | Voltage class | Family | Market | Two lists | Partial | Not row-paired to voltage |

Recommendation: V3 engine must support **N-parent option filters and N-parent compatibility predicates**. A single linked-list cascade is **insufficient**.

---

## 9. Canonical code strategy (design only)

**Rule:** persist `canonical code` + `display label` + `aliases`. Never use display text as a database key.

| Raw TO value | Proposed normalized display | Proposed V3 code | Aliases | Conflict? | TO confirm? |
|--------------|-----------------------------|------------------|---------|-----------|-------------|
| `Copper` / `Copper ` | Copper | `CONDUCTOR_CU` | CU, Copper | V2 uses CU | Yes if tinned is distinct |
| `Tinned Copper` | Tinned copper | `CONDUCTOR_CU_TINNED` | — | Not in V2 CU/AL | Yes |
| `Aluminuim` / `Aluminuim ` | Aluminium | `CONDUCTOR_AL` | AL, Aluminum, Aluminium | Typo in source | Yes spelling |
| `Copper Wire Screen ( CWS )` | Copper wire screen (CWS) | `SCREEN_CWS` | CWS | Spacing | Yes |
| `Copper Tape Screen ( CTS )` | Copper tape screen (CTS) | `SCREEN_CTS` | CTS | — | Yes |
| ` Over lapped Copper Tape + Copper Wire ( CTS + CWS )` | Overlapped CTS + CWS | `SCREEN_CTS_CWS` | — | Leading space | Yes |
| `Aluminuim Wire Screen ( AWS )` | Aluminium wire screen (AWS) | `SCREEN_AWS` | AWS | Typo | Yes |
| `Aluminuim Foil Screen` | Aluminium foil screen | `SCREEN_AL_FOIL` | — | Typo | Yes |
| `N/A` | Not applicable | `NA` | None, No Screen, No Armour, Not Applicable | **Semantic conflict** | **Yes — critical** |
| `Round Compacted` (in Class column) | (split class vs compacting) | **UNDEFINED** | — | Yes vs Solid/Stranded/Flexible | Yes |
| `Natrual` | Natural | `COLOR_NATURAL` | Natural | Misspelling | Yes |
| `MV power cables` / `LV Power cables` | MV power cables / LV power cables | `FAMILY_MV_POWER` / `FAMILY_LV_POWER` | — | vs V2 UGC… | Yes mapping to V2 families |
| `3 Triplex` / `3 Triplex ` | 3 triplex | `CORES_3_TRIPLEX` | — | vs `3` | Yes |
| `12/20 (24) kV` | 12/20 (24) kV | `V_12_20_24KV` | V2 `12/20 kV (12.7/22 kV)` | Notation conflict | Yes |

---

## 10. Master data vs dependency vs rules

| Workbook sheet | Belongs in | Does **not** automatically become |
|----------------|------------|-----------------------------------|
| Master Catalog Lists | **A Engineering Master Data** (allowed values, with quality issues) | Compatibility |
| Dependencies named columns | **A** masters and/or **B Dependency / option-filter rules** *if TO says the name is a filter* | Pairwise compatibility |
| Cable Selection Sheet | **F Reference / test data** (7 golden examples) | Production rule table |
| V2 `ParameterCompatibility` | **C Compatibility** (sparse FAMILY↔VOLTAGE / CORE_COLOUR) | Complete V3 model |
| V2 cascade code | **E Configuration rules** (product UX), not TO engineering | V3 truth |
| `evaluateCableAuthority` | **G Workflow** + **C** where PG pairs exist | Full construction validity |

Do **not** create one database table per workbook sheet.

Suggested future (not implemented) bounded contexts:

1. Engineering value masters (versioned codes).
2. Option-filter rules (parents → allowed child codes).
3. Compatibility predicates (ALLOWED/FORBIDDEN, N parents).
4. Validation messages (fail-closed).
5. Configuration UX order (presentation).
6. Golden tests from the 7 examples.
7. Workflow (TO request, approval) — existing.

---

## 11. Customer vs Technical Office field classification

The **engine is common**. Presentation/RBAC differ. Do not fork calculation.

| Field | Classification |
|-------|----------------|
| Family, voltage class, voltage, standard, conductor material/class/shape/size, cores, insulation, screen type, armour, sheath, sheath color | **CUSTOMER_SELECTABLE** *candidate* (today’s commercial path) |
| Outer semi-con, bedding, screen CSA, water tightness, CPR class | **NOT_DEFINED** who may set — default **TECHNICAL_OFFICE_ONLY** until TO says otherwise |
| Insulation color, core color scheme | **CUSTOMER_SELECTABLE** *candidate* / **NOT_DEFINED** for numbering schemes |
| Special area, special additives, customer identification | **NOT_DEFINED** (missing lists) |
| Cable description, Um | **SYSTEM_DERIVED** |
| Authority result, compatibility failures | **SYSTEM_VALIDATED** |
| Mapping approval, ParameterCompatibility admin | **TECHNICAL_OFFICE_ONLY** |
| Costing / BOM / formulas | **TECHNICAL_OFFICE_ONLY** (out of this engine; confidentiality unchanged) |

---

## 12. Cable Master authority interaction

Preserve the four outcomes. Map labels in UX if needed; do not invent a fifth status in this step.

```text
Evaluate(canonical selections, masters, rules, Cable Master)
  → INVALID_CONFIGURATION          (fails validation / forbidden combo)
  → CONFIGURATION_REQUIRED         (rule or master missing; fail closed)
  → EXISTING_CABLE / EXISTING_APPROVED
        if an APPROVED Cable Master (+ mapping) matches canonical identity
        → may reference Cable Master; do not fabricate a new master row
  → TECHNICALLY_VALID_NOT_MASTER / VALID_NEW_CABLE
        if rules pass and no approved master
        → Technical Office Engineering Request (existing TCR path)
```

V3 must **not** generate a fake Cable Master record. Matching must use **canonical codes**, not raw display strings (Copper vs CU is a current mismatch risk).

Whether V3 construction validity is **stricter** than today’s 10-field authority input is a later architecture decision. Today many UI fields never reach `evaluateCableAuthority`.

---

## 13. Downstream sanitization model

Requirement: no hidden invalid state. On parent change, children that fail option-filter or compatibility must be **cleared** or **explicitly invalid** (not silently kept).

V2 already sanitizes along a **linear** order using **its own** option functions. V3 must sanitize along a **graph**:

- If Voltage Class changes LV→MV, clear voltages not in MV list, then re-validate standard, screen, outer semi-con, etc.
- If Screen becomes N/A, clear Screen CSA and screen water tightness (once those exist).
- If a multi-parent child (e.g. armour) becomes illegal, mark/clear even if a single parent is unchanged.

Every UNDEFINED relationship is a sanitization gap: V3 cannot clear correctly without the rule.

---

## 14. Versioning requirements (not implemented)

| Record | Fields |
|--------|--------|
| Dependency model | `dependencyModelVersion`, `effectiveFrom`, `effectiveTo`, `status` (DRAFT/APPROVED/SUPERSEDED), `approvedBy`, `createdBy`, `supersededBy`, audit |
| Engineering master set | Same versioning (codes added/retired) |
| Compatibility rule set | Version aligned or separately versioned with explicit compose |
| Engine | `v3EngineVersion` (semver of evaluator) |

**Reproducibility:** a historical snapshot must evaluate to the same options/result using the **pinned** model versions, even if TO later changes lists.

Inactive master values: selectable only on historical replay; new configurations use ACTIVE + in-force model.

---

## 15. V3 snapshot requirements (not implemented)

V2 `V2ConfigurationSnapshot` captures selections JSON, `configInput`, validation/flow/engineering status, catalog source, actor, `capturedAt`, downstream gates. It does **not** pin a dependency-model version or canonical codes separately from display strings.

V3 snapshot should conceptually include:

- `v3EngineVersion`
- `dependencyModelVersion` (+ master/rule set versions)
- selected **canonical** values
- display labels at capture time (for documents)
- derived values
- validation result (errors/warnings, fail-closed)
- authority result (existing four codes)
- customer identity (from session/scope, not client-supplied)
- actor, timestamp
- downstream readiness
- source/authority references (Cable Master id if EXISTING_CABLE; TCR id if VALID_NEW)
- sanitization log (what was cleared and why)

Do not implement. Do not alter `V2ConfigurationSnapshot`.

---

## 16. V3 engine architecture (proposal only)

Pure deterministic core — **no Prisma, no Express, no UI**:

```text
evaluateV3(input, catalogs, optionFilters, compatibility, validationRules, authorityContext)
  1. Resolve masters (active codes for model version)
  2. Dependency resolution (which fields apply / N/A)
  3. Option filtering (parents → allowed children)
  4. Compatibility evaluation (N-parent predicates)
  5. Validation (mandatory, types, fail-closed UNDEFINED rules → CONFIGURATION_REQUIRED)
  6. Sanitization (return cleared selection + invalid flags)
  7. Cable Authority adapter (map to existing four outcomes; adapter may call existing function later)
  8. Result construction
  9. Snapshot DTO (persistence is an outer adapter)
```

If a required compatibility rule is missing: **CONFIGURATION_REQUIRED**, not a guessed ALLOWED.

UI and RBAC choose which fields to show. They do not reimplement filters.

---

## 17. Test matrix

Until TO confirms lists-as-filters, expected options are **UNDEFINED** except where the 7 examples provide a single positive instance. Tests below are **design cases**, not encoded oracles.

| # | Case | Input (intent) | Expected options | Expected validation | Expected sanitization | Expected authority |
|---|------|----------------|------------------|---------------------|----------------------|--------------------|
| 1 | LV | Family LV power | UNDEFINED pending TO | Fail closed if rules missing | Clear MV-only fields if confirmed | CONFIGURATION_REQUIRED until rules exist |
| 2 | MV | Family MV power | UNDEFINED | Same | Same | Same |
| 3 | MV IEC | IEC 60502-2 + MV | `MV_IEC_V` **if** TO confirms | — | Voltage not in IEC list cleared | — |
| 4 | MV BS | BS 6622 | `MV_BS_V` **if** confirmed | — | — | Example 2 is a positive instance only |
| 5 | LV IEC | IEC 60227-3 | `LV_IEC_V` **if** confirmed | — | — | Example 4 instance |
| 6 | LV BS | BS 50525-* | `LV_BS_V` **if** confirmed | — | — | Examples 3,5,6 |
| 7 | Copper | Material Copper | Catalog | — | — | — |
| 8 | Aluminium | `Aluminuim` raw | Alias map **if** confirmed | Reject unknown spelling if no alias | — | — |
| 9 | Classes | Solid / stranded / flexible | Catalog | Class vs compacted taxonomy | — | — |
| 10 | Shapes | Round / Sector | Catalog | — | — | — |
| 11 | Size compatibility | 240 mm² MV Cu | Lists exist; pairing UNDEFINED | — | — | — |
| 12 | Single core | cores=1 | `Cores_Single` **if** confirmed | — | Multi-core colors cleared? UNDEFINED | Example 2,3,4,5,7 |
| 13 | Multi-core | cores=3 | — | — | — | Example 1,6 |
| 14 | Triplex | `3 Triplex` | Catalog | Distinct from 3? UNDEFINED | — | — |
| 15 | No screen | N/A | Screen_None | CSA must be empty/NA | Clear CSA | Examples 3–7 |
| 16 | CWS | CWS | Type_Screen | CSA UNDEFINED | — | Example 1 |
| 17 | CTS | CTS | — | — | — | Example 2 |
| 18 | CTS+CWS | overlapped type | Leading-space raw | — | — | No example |
| 19 | AWS | AWS | — | Cu-only list vs Al screen **conflict** | — | No example |
| 20 | Al foil | foil | — | — | — | No example |
| 21 | SWA | SWA | Type_Armour | vs cores UNDEFINED | — | No example |
| 22 | STA | STA | — | — | — | Example 1 |
| 23 | AWA | AWA | — | 1-core only? UNDEFINED | — | Example 2 |
| 24 | ATA | ATA | — | — | — | No example |
| 25 | GSTA | GSTA | — | — | — | No example |
| 26 | No armour | N/A | Armour_None | — | Clear armour WT | Examples 3–7 |
| 27 | Sheath alternatives | PVC/MDPE/HDPE/LSHF/N/A | Lists | Voltage↔sheath UNDEFINED | — | Mixed examples |
| 28 | Water blocking | 3 types | List | Construction rule UNDEFINED | — | Examples blank |
| 29 | CPR | Class_CPR | List | Family/sheath UNDEFINED | — | Examples blank |
| 30 | Core colors | Schemes | Catalog | Cores↔scheme UNDEFINED | — | Not on examples |
| 31 | Invalid upstream change | MV CWS then Voltage=LV | — | Screen may become invalid | Must clear or flag | — |
| 32 | Unknown master | `Copperr` | Empty | INVALID or CONFIGURATION_REQUIRED | — | — |
| 33 | Inactive master | retired code | Not in active set | Reject on new config | Historical snapshot OK | — |
| 34 | Existing approved | Match Cable Master | — | — | — | EXISTING_CABLE |
| 35 | Valid new | Rules pass, no master | — | — | — | TECHNICALLY_VALID_NOT_MASTER + TCR |
| 36 | Invalid configuration | Forbidden combo | — | INVALID_CONFIGURATION | — | — |
| 37 | Missing dependency rule | Any pair in §7 | — | CONFIGURATION_REQUIRED | Do not guess | — |
| 38 | Multi-parent | Screen CSA | — | CONFIGURATION_REQUIRED | — | — |
| 39 | Customer-specific constraint | customerCode | Not in workbook | UNDEFINED | — | Existing identity match only |
| 40 | TO-only parameter | outer semi-con? | NOT_DEFINED | Hidden from customer | Engine still validates | — |

---

## 18. TECHNICAL OFFICE DECISIONS REQUIRED

Do not answer these in product code. Only questions the workbook cannot settle:

1. Are Dependency columns **allowed values**, **option filters**, or **documentation labels**?
2. Is a **row** across Dependency columns ever a combination? (Parser evidence: no.)
3. What is the official **Family** list? How do `HV power cables`, `OHTL`, `Instrumentation Cables`, `BUILDING WIRE` relate to V2 UGC/OHL/ABC/…?
4. Exact rule for **Voltage Class ↔ Voltage**, including IEC vs BS vs Wire lists and the parent that selects among them.
5. Exact **Voltage ↔ Standard** pairing (not two independent lists).
6. Is **Conductor Class** IEC 60228 (1/2/5) or compacting (`Round Compacted`)? How does it relate to Shape?
7. Are **all sizes** valid for every class/material/voltage? What do `Class_Below10`, `Size_Al`, `Size_Solid_Al` mean?
8. What determines **Screen CSA**? (No list supplied.)
9. What determines **Armour CSA**? (Absent.)
10. Exact **single-core** construction rules (screen, armour AWA/ATA, sheath).
11. Exact **Triplex** rules vs 3-core.
12. Are **N/A**, `None`, `No Screen`, `No Armour` the same canonical `NA`?
13. When LV, is screen/bedding/armour/sheath **always** N/A or only for some standards (examples disagree: Item 6–7 have sheath PVC; Item 7 has bedding PVC).
14. Exact **core color scheme** vs per-core colors vs numbering.
15. Exact **CPR** dependencies (family, sheath, installation). `cpr` vs `cprClass`?
16. Exact **water-tightness** dependencies; why examples are blank.
17. Confirm **spelling** Aluminium vs `Aluminuim`; Natural vs `Natrual`; leading spaces on CTS+CWS.
18. Are the 7 examples **golden tests** (must remain valid) or illustrations only?
19. Who may select outer semi-con, bedding, CPR, water tightness: customer or Technical Office?
20. Should V3 families replace V2 family codes or map 1:N?

---

## 19. Gap register

| ID | Sev | Issue | Evidence | Current V2 | V3 requirement | Risk | Owner | Decision | Action |
|----|-----|-------|----------|------------|----------------|------|-------|----------|--------|
| V3-P0-01 | P0 | Lists ≠ combinations | 46 independent columns | Coded filters anyway | Fail closed on missing rules | Wrong cables | TO | Are named lists filters? | Block encoding |
| V3-P0-02 | P0 | Family taxonomy clash | TO vs V2 codes | UGC/OHL/… | Canonical family map | Identity mismatch | TO + Product | Mapping table | Block master merge |
| V3-P0-03 | P0 | Class vs shape vs compacted | Example vs catalog | Separate fields | One taxonomy | Invalid conductors | TO | Define attributes | Block class/shape |
| V3-P0-04 | P0 | Screen CSA / armour CSA missing | Empty columns | Static / hidden | Real rule or out-of-scope | Fake CSA | TO | Provide table or exclude | Block those fields |
| V3-P0-05 | P0 | N/A semantics | Multiple tokens | No Screen / No Armour / N/A | One canonical NA | Hidden invalid | TO | Alias policy | Block sanitization |
| V3-P1-01 | P1 | Voltage notation | `(24) kV` vs V2 dual ratings | MV_VOLTAGE_OPTIONS | Canonical ratings | Authority miss | TO | Map each rating | After P0 |
| V3-P1-02 | P1 | Aluminium typo / CU vs Copper | Raw strings | normalizeToken CU/AL | Alias table | Missed EXISTING_CABLE | Eng | Aliases after TO | |
| V3-P1-03 | P1 | HV/EHV in catalog, not in Dependencies | IEC 60840/62067 | Partial HV filters | UNDEFINED | Silent HV | TO | In or out of V3 MVP | |
| V3-P1-04 | P1 | Core colors model | Schemes vs per-core | Per-core UI | One model | Wrong ID | TO | | |
| V3-P1-05 | P1 | Authority field subset | 10 fields to evaluate | Many UI fields ignored | Which fields gate validity | False VALID_NEW | Eng + TO | Architecture | |
| V3-P1-06 | P1 | ParameterKind too small | 9 kinds | UI has 25+ | Extend kinds **later** | Schema pressure | Arch | Not this step | |
| V3-P2-01 | P2 | Snapshot lacks rule versions | V2ConfigurationSnapshot | No model version | Pin versions | History drift | Arch | Design increment | |
| V3-P2-02 | P2 | Whitespace/case in source | Trailing spaces | token normalize | Import QC | Dup codes | TO + MD | | |
| V3-P2-03 | P2 | PG ParameterCompatibility sparse | FAMILY↔VOLTAGE/COLOUR | CONFIGURATION_REQUIRED | TO-authored rules | Blocked quotes | TO | | |
| V3-P3-01 | P3 | Auto description | Concat string | generateTechnicalDescriptionV2 | Template | Cosmetic | Product | Later | |
| V3-P3-02 | P3 | Customer-specific constraints | Not in workbook | customerCode identity | UNDEFINED | Overfit | Product | Later | |

---

## 20. Recommended next V3 increment

**Not implementation.** After Technical Office answers P0 (especially V3-P0-01…05):

**V3 Step 02 — Engine architecture design (still no code):** bounded contexts, canonical code registry, option-filter vs compatibility vs validation schemas, snapshot/versioning contract, adapter to existing four authority outcomes, test oracles from the 7 examples **if** TO blesses them as golden.

Until P0 is answered:

- Do not copy V2 cascade into V3.
- Do not load these lists as ALLOWED combinations.
- Do not migrate Prisma.
- Do not change V1/V2.

**V3 STATUS: NOT READY — TECHNICAL OFFICE INPUT REQUIRED**  
**NEXT STATE: BLOCKED — TECHNICAL OFFICE CLARIFICATION REQUIRED**
