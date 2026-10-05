# V3 — TRUE ENGINEERING CABLE CONFIGURATION ENGINE
## STEP 02 — TECHNICAL OFFICE DEPENDENCY CLARIFICATION & ENGINEERING MASTER RECONCILIATION

**STATUS:** ANALYSIS / BUSINESS CLARIFICATION ONLY  
**IMPLEMENTATION:** NOT STARTED  
**DATABASE CHANGES:** NONE  
**V1 STATUS:** UNCHANGED  
**V2 STATUS:** FROZEN  
**CABLE MASTER STATUS:** NOT MODIFIED  
**ENGINEERING RULES STATUS:** NOT INVENTED  

**Date:** 2026-09-12  
**Mode:** Reconciliation of Technical Office dependency input with the engineering Cable Master template. This document does **not** authorize V3 architecture encoding, V3 implementation, Prisma, APIs, or UI.

**Source A (read-only, not copied, not modified):**  
`c:\Users\POP\Desktop\SW Projects\B2B Project\Master Data Template\Cable Selection with Dependencies.xlsx`

**Source B (read-only, not copied, not modified):**  
`c:\Users\POP\Desktop\SW Projects\B2B Project\Master Data Template\Energya_Cable_Master_Engineering_Template.xlsx`

**Prior step:** [01_V3_TECHNICAL_OFFICE_DEPENDENCY_DISCOVERY.md](./01_V3_TECHNICAL_OFFICE_DEPENDENCY_DISCOVERY.md)  
**Companion fillable workbook:** [04_V3_TECHNICAL_OFFICE_CLARIFICATION.xlsx](./04_V3_TECHNICAL_OFFICE_CLARIFICATION.xlsx)

**Overall gate (this step):** **BLOCKED — TECHNICAL OFFICE CLARIFICATION REQUIRED**

Do **not** treat this document as READY FOR V3 ARCHITECTURE.  
Do **not** treat this document as READY FOR IMPLEMENTATION.

---

## Binding distinctions (do not collapse)

| Kind | Meaning | What it does **not** prove |
|------|---------|----------------------------|
| **A. MASTER VALUE** | A reference value appears in a lookup list or as a populated distinct value in a master column | That the value is allowed in every construction |
| **B. OBSERVED EXISTING CONFIGURATION** | A full (or partial) construction exists as a Source B row | That every permutation of its attributes is valid |
| **C. EXPLICIT DEPENDENCY** | Technical Office stated parent → allowed/forbidden child | Nothing — none were found as pairwise rules |
| **D. DERIVED VALUE** | Value is produced from other fields or from engineering calculation | Selectability |
| **E. EXAMPLE ONLY** | One of the seven Source A example rows | A closed universe of allowed cables |
| **F. UNDEFINED** | Evidence is insufficient | Any engine behaviour |

**Source A is not a complete compatibility matrix.** It contains lookup lists plus seven examples.

**Source B is not automatically a compatibility ruleset.** Existing records prove that **those** constructions exist in the source master.

Lookup-list coexistence is **not** a pairwise rule.  
Frequency of an observed combination is **not** an approved compatibility rule.

Label used throughout for Source B pairs: **OBSERVED IN MASTER** — never **APPROVED COMPATIBILITY RULE**.

---

## 1. Objective and outcome of this step

V3 remains a **new** engineering configuration engine, separate from frozen V2 and unchanged V1.

This step determines, from **both** sources:

1. What the engineering Cable Master must contain.
2. Which values are authoritative/reference values.
3. Which relationships are explicitly defined (**none pairwise**).
4. Which relationships can only be observed from existing cable records.
5. Which relationships are still undefined.
6. Which questions Technical Office must answer.
7. What information is required before V3 architecture can be designed.

**Information still required before architecture:** P0 answers in §20. Until those exist, no dependency graph, no conductor taxonomy split, and no screen/armour CSA rule may be encoded.

---

## 2. Source A — Technical Office dependency workbook (recap)

Analyzed in Step 01. Not re-modified. Raw defects preserved.

### 2.1 Sheets

| Sheet | Used range | Role | Combinations? |
|-------|------------|------|----------------|
| Cable Selection Sheet | A1:S34 | Seven example cables; items 8–30 empty | **E. EXAMPLE ONLY** |
| Dependencies | A1:AT27 | 46 independent named columns | **Not row-paired combinations** |
| Master Catalog Lists | A1:AC50 | Independent catalogs | **A. MASTER VALUE** candidates; empty columns remain empty |

### 2.2 Seven example cables (EXAMPLE ONLY)

Exact raw values from Step 01. These are **not** a closed compatibility universe.

| Item | Family | Standard | Voltage | Class (as written) | Cores | Size | Material | Shape | Insulation | Outer Semi | Screen | Bedding | Armour | Sheath | Color |
|------|--------|----------|---------|--------------------|-------|------|----------|-------|------------|------------|--------|---------|--------|--------|-------|
| 1 | MV power cables | IEC 60502-2 | 12/20 (24) kV | Round Compacted | 3 | 240 | Copper | Round | XLPE | Strippable | Copper Wire Screen ( CWS ) | PVC | STA | PVC | Red |
| 2 | MV power cables | BS 6622 | 12.7/22 (24) kV | Round Compacted | 1 | 400 | Aluminuim | Round | XLPE | Bonded | Copper Tape Screen ( CTS ) | PVC | AWA | MDPE | Black |
| 3 | LV Power cables | BS 50525-3-41 | 450/750 V | Solid | 1 | 2.5 | Copper | Round | LSHF | N/A | N/A | N/A | N/A | N/A | N/A |
| 4 | LV Power cables | IEC 60227-3 | 450/750 V | Stranded Uncompacted | 1 | 4 | Copper | Round | PVC | N/A | N/A | N/A | N/A | N/A | N/A |
| 5 | LV Power cables | BS 50525-2-31 | 450/750 V | Flexible | 1 | 1.5 | Copper | Round | PVC | N/A | N/A | N/A | N/A | N/A | N/A |
| 6 | LV Power cables | BS 50525-2-11 | 300/500 V | Flexible | 3 | 1.5 | Copper | Round | PVC | N/A | N/A | N/A | N/A | PVC | White |
| 7 | LV Power cables | IEC 60227-7 | 300/500 V | Flexible | 1 | 1.5 | Copper | Round | PVC | N/A | N/A | PVC | N/A | PVC | Grey |

Water Tightness and CPR Class: blank on all seven examples.

### 2.3 Source A quality (not cleaned)

| Issue | Exact evidence |
|-------|----------------|
| Spelling | `Aluminuim`, `Natrual` |
| Leading space | ` Over lapped Copper Tape + Copper Wire ( CTS + CWS )` |
| Trailing spaces | `Copper `, `SWA `, `Bonded `, CPR strings |
| Capitalization | `MV power cables` vs `LV Power cables` |
| Class vs shape mix | Examples put `Round Compacted` in Conductor Class |
| Empty catalogs | screen CSA, water-tight flags, special area/additives, customer identification |

**Explicit pairwise ALLOWED/FORBIDDEN rules in Source A: 0.**

---

## 3. Source B — Engineering Cable Master template

| Item | Value |
|------|--------|
| File | `Energya_Cable_Master_Engineering_Template.xlsx` |
| Sheets | **1** — `Cable Master V2 Template` |
| Header columns | **45** (matches the expected list) |
| Populated data records | **1256** |
| Altered | **No** |

Expected 45 columns are present in this order:

Customer Code, Item Code, Material Number, Cable Family, Voltage Class, Voltage, Standard, Conductor Material, Conductor Class, Conductor Size, Conductor Water Tight, Core Count, Core 1 Color … Core 8 Color, Insulation, Insulation Color, Outer Semi-Conductor, Screen Type, Screen Material, Screen CSA, Screen Water Tight, Armour Type, Armour Material, Armour CSA, Armour Water Tight, Sheathing, Sheathing Color, Special Additives, Semi Conduct, Graphite, CPR, CPR Class, EDR, Cable Diameter, Cable Weight, Cable Description, Applicable Standard, Technical Notes, Approved Status.

There is **no** Conductor Shape column, **no** Compacting column, **no** Bedding column.

---

## 4. Record statistics (Source B)

| Metric | Count | Notes |
|--------|------:|-------|
| Total populated records | 1256 | |
| Unique Material Numbers | 1256 | **0 duplicates** — candidate Cable Master identity |
| Duplicate Material Numbers | 0 | |
| Unique Item Codes (non-blank) | 863 | 49 blank |
| Duplicate Item Code groups | 30 | Same item code on 2–7 different material numbers; max `IAO506X501C0UY3` × **7** |
| Unique Cable Families | 2 | `UGC` (1243), `OH` (13) |
| Unique Voltage Classes | 3 | `MV` (760), `LV` (483), `-` (13) |
| Unique Voltages | 15 | Including `-` and `20.8/36kV` (space missing) |
| Unique Standards | 19 | Including incomplete `7884` (2 rows) |
| Unique Conductor Materials | 2 | `Copper`, `Aluminuim` (spelling preserved) |
| Unique Conductor Classes | 3 | `Class 1-Solid`, `Class 2-Stranded`, `Class 5-Flex` |
| Unique Conductor Sizes | 22 | `1.5` … `1200` as stored strings |
| Unique Core Counts | 17 | Includes `0`, `3.5`, and high counts 11–41 |
| Unique Insulations | 3 | `XLPE` 1138, `PVC` 91, `LSHF` 14; **13 blank** (all `OH`) |
| Unique Screen Types | 4 | Plus **492 blank** |
| Unique Armour Types | 4 | Plus **1042 blank** |
| Unique Sheathings | 5 | Plus **49 blank** |
| Unique CPR values | 2 | `No` 1184, `Yes` 72 |
| Unique Approved Status values | 0 | **All 1256 blank** |

`Standard` and `Applicable Standard` are **identical on all 1256 rows**.

### 4.1 Completely unpopulated columns (1256 blank)

Customer Code, Core 1–8 Color, Insulation Color, Armour CSA, Special Additives, EDR, Technical Notes, Approved Status.

### 4.2 Null / blank / placeholder inventory (not normalized)

| Token | Where observed | Count / notes |
|-------|----------------|---------------|
| (true blank) | Many columns | Item Code 49; Insulation 13; Screen Type 492; Armour Type 1042; Sheathing 49; Armour Water Tight 1254; Semi Conduct 3; Core colors 1256 each |
| `-` | Voltage Class, Voltage, Outer Semi-Conductor, Screen CSA, Sheathing Color, CPR Class | Voltage Class `-` = 13; Outer Semi `-` = 496; Screen CSA `-` = 620; Sheath color `-` = 36; CPR Class `-` = 1184 |
| `N/A` | Source B columns examined | **Not used** as a stored value in Source B populated cells |
| `None` / `No Screen` / `No Armour` / `Not Applicable` | Source B | **Not used** |
| `No` / `NO` / `Yes` / `YES` | Water-tight and Semi/Graphite/CPR flags | Mixed case; see §13 |

### 4.3 Inconsistent spelling / capitalization / whitespace / aliases (reported, not cleaned)

| Issue | Evidence | Kind |
|-------|----------|------|
| `Aluminuim` vs `Aluminium` | Conductor Material = `Aluminuim`; Screen/Armour Material = `Aluminium` | Alias / spelling **CONFLICT** inside Source B |
| `Class 5-Flex` vs Source A `Flexible` vs V2 `Class 5` | Three writings | Apparent aliases — **UNDEFINED** until TO confirms |
| `Class 1-Solid` vs Source A `Solid` | Apparent alias | UNDEFINED |
| `Class 2-Stranded` vs Source A `Stranded Uncompacted` / `Round Compacted` | **Not the same concept** | **CONFLICT** |
| `Yes` vs `YES` vs `No` vs `NO` | Conductor WT `Yes`/`No`; Screen WT `Yes`/`NO`; Armour WT `YES`; Semi/Graphite mixed | Case inconsistency |
| `BLACK`/`RED`/`ORANGE` vs Source A `Black`/`Red`/`White`/`Grey` | Sheath color | Case + value-set mismatch |
| `20.8/36kV` vs `12/20 kV` | Missing space / missing `(24)` Um notation used in Source A | Notation inconsistency |
| `7884` | 2 OH rows; other rows use `BS …` / `IEC …` | Suspicious incomplete standard |
| Cable Description whitespace | 20 whitespace variants (double spaces, trailing spaces) | Quality only |
| Description tokens `RMC` / `SM` / `RE` / `(Flex)` / `Compacted` | Present in text, absent as columns | Hidden construction data |

**Suspicious values (not deleted):**

- Voltage Class `MV` on `64/110 kV` (4), `38/66 kV` (2), `IEC 60840` (6) — HV-looking ratings stored as MV.
- Core Count `0` on all 13 `OH` rows.
- Core Count `3.5` (4) — descriptions show `3X… + …` reduced-neutral style, not a 3.5-core colour set.
- Item codes reused across different Material Numbers.

---

## 5. Field classification — Source B 45 columns

Do not assume every column is a selectable parameter.

| # | Field | Classification | Selectable? | Notes |
|---|-------|----------------|-------------|-------|
| 1 | Customer Code | **CUSTOMER-SPECIFIC** / identity candidate | No (empty) | 1256 blank. Not a configuration parameter. |
| 2 | Item Code | **MASTER IDENTITY** (legacy SKU) | No | Not unique. 49 blank. Customer must not invent it. |
| 3 | Material Number | **MASTER IDENTITY** | No | Unique on all 1256 rows. V3 must not let a customer fabricate this. |
| 4 | Cable Family | **ENGINEERING INPUT** | Candidate | Values `UGC`/`OH` **CONFLICT** with Source A and V2. |
| 5 | Voltage Class | **ENGINEERING INPUT** | Candidate | `LV`/`MV`/`-`. HV-looking voltages still labelled MV. |
| 6 | Voltage | **ENGINEERING INPUT** | Candidate | U0/U style strings. |
| 7 | Standard | **ENGINEERING INPUT** | Candidate | 19 values. |
| 8 | Conductor Material | **ENGINEERING INPUT** | Candidate | `Copper` / `Aluminuim`. |
| 9 | Conductor Class | **ENGINEERING INPUT** — combined concept | Candidate | IEC-class-like labels. Shape/compacting **not separate**. |
| 10 | Conductor Size | **ENGINEERING INPUT** | Candidate | mm² as string. |
| 11 | Conductor Water Tight | **ENGINEERING INPUT** | Candidate | `Yes`/`No` only (no N/A). |
| 12 | Core Count | **ENGINEERING INPUT** | Candidate | Includes `0` and `3.5`. |
| 13–20 | Core 1–8 Color | **UNKNOWN** | Not evidenced | Entirely blank. |
| 21 | Insulation | **ENGINEERING INPUT** | Candidate | Blank on OH conductor-only rows. |
| 22 | Insulation Color | **UNKNOWN** | Not evidenced | Entirely blank. |
| 23 | Outer Semi-Conductor | **ENGINEERING INPUT** | Candidate | `Strippable`/`Bonded`/`-`. |
| 24 | Screen Type | **ENGINEERING INPUT** | Candidate | Blank ≠ proven `No Screen`. |
| 25 | Screen Material | **UNKNOWN** (possibly **ENGINEERING DERIVED**) | Unknown | 1:1 with type in all 764 populated screens — **not** declared derived. |
| 26 | Screen CSA | **UNKNOWN** | Unknown | Numeric for most CWS; `-` for CTS/foil/blank. |
| 27 | Screen Water Tight | **ENGINEERING INPUT** | Candidate | `Yes`/`NO`. Blank screen still has values. |
| 28 | Armour Type | **ENGINEERING INPUT** | Candidate | 1042 blank. |
| 29 | Armour Material | **UNKNOWN** (possibly derived) | Unknown | 1:1 with type on 214 armoured rows. |
| 30 | Armour CSA | **UNKNOWN** / missing | Unknown | Entirely blank. |
| 31 | Armour Water Tight | **ENGINEERING INPUT** (poorly populated) | Unknown | 2 `YES`; 1254 blank. |
| 32 | Sheathing | **ENGINEERING INPUT** | Candidate | |
| 33 | Sheathing Color | **ENGINEERING INPUT** | Candidate | |
| 34 | Special Additives | **UNKNOWN** | Not evidenced | Blank. |
| 35 | Semi Conduct | **UNKNOWN** | Unknown | Almost all `NO`; distinct from Outer Semi-Conductor. |
| 36 | Graphite | **UNKNOWN** | Unknown | Almost all `NO`. |
| 37 | CPR | **ENGINEERING INPUT** | Candidate | Flag. |
| 38 | CPR Class | **ENGINEERING INPUT** or **DERIVED** | Unknown | When CPR=`No`, class=`-`; when `Yes`, `B2ca` or `Cca`. Not proven derived. |
| 39 | EDR | **UNKNOWN** | Not evidenced | Blank. |
| 40 | Cable Diameter | **OUTPUT / CALCULATED** | No | 509 distinct numbers; not a selector. |
| 41 | Cable Weight | **OUTPUT / CALCULATED** | No | 1185 distinct numbers. |
| 42 | Cable Description | **OUTPUT / CALCULATED** or **TECHNICAL REFERENCE** | No | 735 strings; also hides RMC/SM/RE. |
| 43 | Applicable Standard | **TECHNICAL REFERENCE** | No | Duplicate of Standard. |
| 44 | Technical Notes | **TECHNICAL REFERENCE** | No | Blank. |
| 45 | Approved Status | **APPROVAL / GOVERNANCE** | No | Blank — cannot interpret lifecycle. |

**SYSTEM-DERIVED** is reserved for values the engine/platform would compute later (description, possibly diameter/weight). None are computed in this analysis.

---

## 6. Field reconciliation — Source A × Source B × V2 × current DB

Statuses: **MATCH** / **PARTIAL** / **NEW** / **CONFLICT** / **MISSING** / **DERIVED** / **UNDEFINED**.

Matches are **not forced**.

| Field (V3 concept) | Source A name | Source B name | Current V2 name | Current DB | Proposed V3 concept | A evidence | B evidence | Classification | Status | TO decision? |
|--------------------|---------------|---------------|-----------------|------------|---------------------|------------|------------|----------------|--------|--------------|
| Family | Family / `family` / `Cable_Family` | Cable Family | `family` | `CableMaster.family` | `FAMILY` | LV/MV/HV/OHTL/Instrumentation/BUILDING WIRE | `UGC`, `OH` | ENGINEERING INPUT | **CONFLICT** | **Yes P0** |
| Voltage class | `voltage Class` | Voltage Class | `voltageClass` | none | `VOLTAGE_CLASS` | LV/MV/HV catalog | LV/MV/`-` | ENGINEERING INPUT | **CONFLICT** | **Yes P0** |
| Voltage | Voltage Rating / `voltage` | Voltage | `voltage` | `CableMaster.voltage` | `VOLTAGE_RATING` | `12/20 (24) kV` style | `12/20 kV`; `20.8/36kV` | ENGINEERING INPUT | **PARTIAL** | **Yes P1** |
| Standard | Standard | Standard | `standard` | `CableMaster.standard` | `STANDARD` | MV/LV lists + examples | 19 values incl. `7884` | ENGINEERING INPUT | **PARTIAL** | **Yes P0** |
| Applicable standard | (none) | Applicable Standard | (none) | none | duplicate of Standard | — | Identical to Standard 1256/1256 | TECHNICAL REFERENCE | **DERIVED** / duplicate | Yes — drop or keep? |
| Conductor material | Conductor Material | Conductor Material | `conductorMaterial` | `CableMaster.conductor` | `CONDUCTOR_MATERIAL` | Copper / Tinned Copper / Aluminuim | Copper / Aluminuim | ENGINEERING INPUT | **PARTIAL** | Yes (tinned; spelling) |
| Conductor class | Conductor Class | Conductor Class | `conductorClass` | none | `CONDUCTOR_CLASS` | Solid / Stranded / Flexible **and** `Round Compacted` in examples | `Class 1-Solid` / `Class 2-Stranded` / `Class 5-Flex` | ENGINEERING INPUT | **CONFLICT** | **Yes P0** |
| Conductor shape | Conductor Shape | **(no column)** | `conductorShape` | none | `CONDUCTOR_SHAPE` | Round / Sector lists | Hidden in description (`RE`/`SM`/`RMC`) | UNKNOWN | **MISSING** in B | **Yes P0** |
| Compacting | mixed into Class/Shape | **(no column)** | `conductorCompacting` | none | `CONDUCTOR_COMPACTING` | `Round Compacted` / `Stranded Uncompacted` | Description `Compacted`/`RMC` | UNKNOWN | **MISSING** / **CONFLICT** | **Yes P0** |
| Conductor size | Conductor Size (mm²) | Conductor Size | `conductorSize` | `CableMaster.conductorSize` | `CONDUCTOR_SIZE_MM2` | MV/LV/Al lists | 22 sizes | ENGINEERING INPUT | **PARTIAL** | **Yes P0** |
| Conductor water tight | `conductor WaterTight` (empty) | Conductor Water Tight | `conductorWaterTight` | none | `CONDUCTOR_WATER_TIGHT` | Catalog empty | Yes/No | ENGINEERING INPUT | **NEW** vs A lists | Yes |
| Core count | No. of Cores / `cores` | Core Count | `cores` | `CableMaster.cores` | `CORE_COUNT` | 1, 3, `3 Triplex` | 0, 1–5, 3.5, 7–41 | ENGINEERING INPUT | **CONFLICT** | **Yes P0** |
| Core colors | `coreColors` schemes | Core 1–8 Color | `coreColors[]` | `CableMaster.coreColour` | `CORE_COLOR` | Scheme strings | **All blank** | UNKNOWN | **MISSING** in B | **Yes P0** |
| Insulation | Insulation | Insulation | `insulation` | `CableMaster.insulation` | `INSULATION` | XLPE/PVC/LSHF | Same three + 13 blank | ENGINEERING INPUT | **PARTIAL** | Yes |
| Insulation color | `insulation Color` | Insulation Color | `insulationColor` | none | `INSULATION_COLOR` | Catalog incl. `Natrual` | **All blank** | UNKNOWN | **MISSING** in B | Yes |
| Outer semi-con | Outer Semi-Con | Outer Semi-Conductor | `outerSemiConductor` | none | `OUTER_SEMI_CON` | Bonded/Strippable/N/A | Bonded/Strippable/`-` | ENGINEERING INPUT | **PARTIAL** | Yes (`N/A` vs `-`) |
| Screen type | Screen Type | Screen Type | `screenType` | `CableMaster.screen` | `SCREEN_TYPE` | CTS/CWS/CTS+CWS/AWS/foil/N/A | CTS/CWS/foil/AWS; **no CTS+CWS**; blank not N/A | ENGINEERING INPUT | **CONFLICT** | **Yes P0** |
| Screen material | (none explicit) | Screen Material | `screenMaterial` | none | `SCREEN_MATERIAL` | — | Copper/Aluminium; 1:1 with type | UNKNOWN | **NEW** | **Yes P0** |
| Screen CSA | `screenCSA` empty | Screen CSA | `screenCSA` | none | `SCREEN_CSA` | Empty catalog | Numbers or `-` | UNKNOWN | **PARTIAL** | **Yes P0** |
| Screen water tight | empty catalog | Screen Water Tight | `screenWaterTight` | none | `SCREEN_WATER_TIGHT` | Empty | Yes/NO | ENGINEERING INPUT | **NEW** vs A | Yes |
| Bedding | Bedding | **(no column)** | `bedding` | none | `BEDDING` | PVC/N/A examples | Absent | UNKNOWN | **MISSING** in B | **Yes P1** |
| Armour type | Armour | Armour Type | `armour` | `CableMaster.armour` | `ARMOUR_TYPE` | SWA/STA/AWA/ATA/GSTA/N/A | SWA/AWA/GDSTA/ATA; **no STA/GSTA**; blank not N/A | ENGINEERING INPUT | **CONFLICT** | **Yes P0** |
| Armour material | (none) | Armour Material | `armourMaterial` | none | `ARMOUR_MATERIAL` | — | Steel/Aluminium 1:1 with type | UNKNOWN | **NEW** | **Yes P0** |
| Armour CSA | (none) | Armour CSA | `armourCSA` (removed UI) | none | `ARMOUR_CSA` | Absent | **All blank** | UNKNOWN | **MISSING** | **Yes P0** |
| Armour water tight | empty catalog | Armour Water Tight | `armourWaterTight` | none | `ARMOUR_WATER_TIGHT` | Empty | 2 YES | ENGINEERING INPUT | **MISSING** population | Yes |
| Sheathing | Sheathing | Sheathing | `sheathing` | `CableMaster.sheath` | `SHEATH_TYPE` | PVC/MDPE/HDPE/LSHF/N/A | PVC/MDPE/HDPE/LSHF/PE-FR | ENGINEERING INPUT | **PARTIAL** | Yes |
| Sheathing color | Sheathing Color | Sheathing Color | `sheathingColor` | `sheathColour` | `SHEATH_COLOR` | Red/Black/White/Grey/N/A | BLACK/RED/ORANGE/`-` | ENGINEERING INPUT | **PARTIAL** | Yes |
| Special additives | empty | Special Additives | `specialAdditives` | `specialAdditives` | `SPECIAL_ADDITIVE` | Empty | Empty | UNKNOWN | **MISSING** | P2 |
| Semi conduct | (not in A examples) | Semi Conduct | `semiConduct` | none | `SEMI_CONDUCT_SHEATH` | — | Almost all NO | UNKNOWN | **NEW** | Yes |
| Graphite | (not in A) | Graphite | `graphite` | none | `GRAPHITE` | — | Almost all NO | UNKNOWN | **NEW** | Yes |
| Water tightness (construction) | Water Tightness | split across conductor/screen/armour WT | `waterTight` | none | `WATER_TIGHTNESS` | Longitudinal/Radial/both | Three Yes/No flags instead | ENGINEERING INPUT | **CONFLICT** | **Yes P1** |
| CPR flag | `cpr` | CPR | `cpr` | none | `CPR_DECLARED` | B2ca… as catalog `cpr` | No/Yes | ENGINEERING INPUT | **CONFLICT** | Yes |
| CPR class | CPR Class / `cprClass` | CPR Class | `cprClass` | none | `CPR_CLASS` | Euroclass strings | `-` / B2ca / Cca | ENGINEERING INPUT | **PARTIAL** | Yes |
| EDR | (none) | EDR | `edr` | none | `EDR` | — | Empty | UNKNOWN | **MISSING** | P3 |
| Cable diameter | (none) | Cable Diameter | `outerDiameterMm` | `CableMaster.diameter` | `CABLE_DIAMETER` | — | 509 values | OUTPUT / CALCULATED | **DERIVED** | Yes — source of calc? |
| Cable weight | (none) | Cable Weight | `approxWeightKgKm` | `CableMaster.weight` | `CABLE_WEIGHT` | — | 1185 values | OUTPUT / CALCULATED | **DERIVED** | Yes |
| Description | Cable Description (Auto) | Cable Description | `description` | `CableMaster.description` | `CONFIGURATION_DESCRIPTION` | Concatenated example text | 735 strings | OUTPUT | **DERIVED** | P2 template |
| Technical notes | (none) | Technical Notes | none | none | `TECHNICAL_NOTES` | — | Empty | TECHNICAL REFERENCE | **MISSING** | P3 |
| Customer code | empty catalog | Customer Code | `customerCode` | `CableMaster.customerCode` | identity | Empty | Empty | CUSTOMER-SPECIFIC | **MISSING** population | **Yes P0** |
| Item code | (none) | Item Code | `itemCode` | `CableMaster.itemCode` | identity | — | 863 unique, duplicates | MASTER IDENTITY | **PARTIAL** | **Yes P0** |
| Material number | (none) | Material Number | `materialNumber` | `CableMaster.materialNumber` **@unique** | identity | — | 1256 unique | MASTER IDENTITY | **MATCH** as identity | **Yes P0** (who assigns) |
| Approved status | (none) | Approved Status | `approvedStatus` | `approvalStatus` default `IMPORTED` | governance | — | Empty | APPROVAL / GOVERNANCE | **UNDEFINED** | **Yes P0** |
| Termite / special area / customer identification | Catalog (termite Yes/No; others empty) | **(no columns)** | V2 UI fields | none | — | Partial catalog | Absent | UNKNOWN | **MISSING** in B | P2 |
| Family sub-type | (none) | (none) | `familySubType` | none | — | — | — | UNKNOWN | **UNDEFINED** | P1 |

Full table also lives in workbook sheet **Field Reconciliation**.

---

## 7. Construction signature (conceptual — not implemented)

Question: which fields together describe the **physical/technical cable construction** (not identity, not commercial labels, not calculated outputs)?

| Candidate | Decision | Why (source evidence) |
|-----------|----------|------------------------|
| Cable Family | **INCLUDE** (pending taxonomy) | Present in A and B; values **CONFLICT** — include the concept, not the current codes |
| Voltage Class | **INCLUDE** | Present in both; B uses `-` for OH |
| Voltage | **INCLUDE** | Present in both |
| Standard | **INCLUDE** | Present in both |
| Conductor Material | **INCLUDE** | Present in both |
| Conductor Class | **INCLUDE** as currently stored | Present; **do not split** until TO defines taxonomy |
| Conductor Shape | **UNKNOWN** | In A and V2; **absent** as B column; leaked in description |
| Compacting | **UNKNOWN** | Mixed into A class; leaked in B description (`RMC`, Compacted) |
| Conductor Size | **INCLUDE** | Present in both |
| Conductor Water Tight | **INCLUDE** | Populated Yes/No in B; empty in A catalog |
| Core Count | **INCLUDE** | Present; `0`/`3.5` semantics undefined |
| Insulation | **INCLUDE** | Present; blank on OH |
| Insulation Color | **UNKNOWN** | A catalog only; B empty |
| Outer Semi-Conductor | **INCLUDE** | Present in both |
| Screen Type | **INCLUDE** | Present in both |
| Screen Material | **UNKNOWN** | B only; possibly derived |
| Screen CSA | **UNKNOWN** | B populated for CWS; rule unknown |
| Screen Water Tight | **INCLUDE** | B populated; A empty |
| Armour Type | **INCLUDE** | Present in both |
| Armour Material | **UNKNOWN** | B only; possibly derived |
| Armour CSA | **UNKNOWN** | Column exists, all blank |
| Armour Water Tight | **UNKNOWN** | Almost blank |
| Sheathing | **INCLUDE** | Present in both |
| Sheathing Color | **INCLUDE** | Present in both |
| Special Additives | **UNKNOWN** | Empty in both populated sources |
| Semi Conduct | **UNKNOWN** | B almost constant NO |
| Graphite | **UNKNOWN** | B almost constant NO |
| CPR | **INCLUDE** as flag concept | Populated in B; blank on A examples |
| CPR Class | **INCLUDE** | Populated in B when CPR=Yes |
| EDR | **UNKNOWN** | Empty |
| Core 1–8 Color | **UNKNOWN** | B empty; A has schemes not per-core |
| Customer Code / Item Code / Material Number | **EXCLUDE** | Identity — not construction |
| Cable Diameter / Weight / Description | **DERIVED** | Outputs; description also leaks construction |
| Applicable Standard | **EXCLUDE** | Duplicate of Standard |
| Technical Notes | **EXCLUDE** | Annotation |
| Approved Status | **EXCLUDE** | Governance |

**Signature is not closed.** Encoding a hash/identity of construction before P0 taxonomy answers would freeze the wrong attributes.

---

## 8. Actual configuration evidence (Source B)

All rows below are **OBSERVED IN MASTER**.  
Evidence strength = occurrence count only. **Not** an approved compatibility rule.

### 8.1 Voltage Class → Voltage

Unique parents 3, unique children 15, unique combos **15** (each voltage sits under one class in this file).

| Parent | Child | n | Label |
|--------|-------|--:|-------|
| LV | 0.6/1 kV | 398 | OBSERVED IN MASTER |
| MV | 12/20 kV | 189 | OBSERVED IN MASTER |
| MV | 18/30 kV | 188 | OBSERVED IN MASTER |
| MV | 6/10 kV | 139 | OBSERVED IN MASTER |
| MV | 8.7/15 kV | 113 | OBSERVED IN MASTER |
| MV | 19/33 kV | 71 | OBSERVED IN MASTER |
| LV | 1.8/3 kV | 46 | OBSERVED IN MASTER |
| MV | 6.35/11 kV | 41 | OBSERVED IN MASTER |
| LV | 450/750 V | 36 | OBSERVED IN MASTER |
| `-` | `-` | 13 | OBSERVED IN MASTER |
| MV | 12.7/22 kV | 10 | OBSERVED IN MASTER |
| MV | 64/110 kV | 4 | OBSERVED IN MASTER |
| LV | 1.9/3.3 kV | 3 | OBSERVED IN MASTER |
| MV | 20.8/36kV | 3 | OBSERVED IN MASTER |
| MV | 38/66 kV | 2 | OBSERVED IN MASTER |

### 8.2 Voltage → Standard

Unique combos **39**. Top:

| Parent | Child | n |
|--------|-------|--:|
| 0.6/1 kV | IEC 60502-1 | 318 |
| 12/20 kV | IEC 60502-2 | 167 |
| 18/30 kV | IEC 60502-2 | 167 |
| 6/10 kV | IEC 60502-2 | 139 |
| 8.7/15 kV | IEC 60502-2 | 105 |
| 1.8/3 kV | IEC 60502-1 | 46 |
| 0.6/1 kV | BS 5467 | 44 |
| 19/33 kV | BS 7870-4.10 | 39 |
| 19/33 kV | BS 6622 | 22 |
| 450/750 V | BS 50525-2-31 | 21 |

Complete 39 rows: workbook sheet **Observed Master Combinations**.

### 8.3 Standard → Conductor Material

Unique combos **31**. Both Copper and `Aluminuim` appear under IEC 60502-1 and IEC 60502-2. That does **not** prove every standard allows both metals.

### 8.4 Conductor Material → Conductor Class

| Parent | Child | n | Label |
|--------|-------|--:|-------|
| Copper | Class 2-Stranded | 729 | OBSERVED IN MASTER |
| Aluminuim | Class 2-Stranded | 453 | OBSERVED IN MASTER |
| Copper | Class 5-Flex | 48 | OBSERVED IN MASTER |
| Copper | Class 1-Solid | 26 | OBSERVED IN MASTER |

**Not observed:** Aluminium + Class 1; Aluminium + Class 5. Absence is **not** a forbidden rule.

### 8.5 Conductor Class → Size

Unique combos **44**. Class 2 uses sizes 1.5–1200. Class 1 observed only at 1.5, 2.5, 4, 6. Class 5 observed from 1.5 to 500. **Not** a permitted-size table.

### 8.6 Core Count → Insulation

Unique combos **23**. Dominant: `1 || XLPE` (807). `0 || (blank)` (13) are OH conductor-only rows.

### 8.7 Insulation → Screen Type

| Insulation | Screen | n |
|------------|--------|--:|
| XLPE | Copper Wire Screen ( CWS ) | 634 |
| XLPE | (blank) | 374 |
| XLPE | Copper Tape Screen ( CTS ) | 96 |
| PVC | (blank) | 91 |
| XLPE | Aluminuim Foil Screen | 32 |
| LSHF | (blank) | 14 |
| XLPE | Aluminuim Wire Screen ( AWS ) | 2 |

PVC and LSHF screens are blank in this master. That is **not** “PVC forbids screen.”

### 8.8 Screen Type → Screen Material

| Screen type | Material | n |
|-------------|----------|--:|
| CWS | Copper | 634 |
| CTS | Copper | 96 |
| Aluminuim Foil Screen | Aluminium | 32 |
| AWS | Aluminium | 2 |

1:1 in this file. **Not** declared as a derivation rule.

### 8.9 Screen Type → Screen CSA

CWS commonly 16/25/35 (and rare others). CTS 95/96 rows CSA=`-`. Foil all `-`. Blank screen all CSA=`-`. **How CSA is chosen is UNDEFINED.**

### 8.10 Screen Type → Armour Type

Most CWS rows unarmoured (619 blank armour). CTS often AWA (56) or SWA (31). Blank screen still has SWA (85) and AWA (17). **Not** “no screen ⇒ no armour.”

### 8.11 Armour Type → Armour Material / CSA / Sheathing

| Armour | Material | n | CSA |
|--------|----------|--:|-----|
| SWA | Steel | 118 | blank |
| AWA | Aluminium | 82 | blank |
| GDSTA | Steel | 11 | blank |
| ATA | Aluminium | 3 | blank |

Armour CSA: **no values**. Sheathing after armour is mixed (PVC/LSHF/MDPE/HDPE).

### 8.12 Sheathing → Sheathing Color

BLACK dominates all sheath types. RED appears on PVC/MDPE/LSHF/HDPE. ORANGE only on PVC (50). `-` with blank sheath (36).

### 8.13 CPR → CPR Class

| CPR | CPR Class | n |
|-----|-----------|--:|
| No | `-` | 1184 |
| Yes | B2ca | 65 |
| Yes | Cca | 7 |

### 8.14 Cable Family → Voltage Class

| Family | Voltage class | n |
|--------|---------------|--:|
| UGC | MV | 760 |
| UGC | LV | 483 |
| OH | `-` | 13 |

### 8.15 Semi Conduct → Graphite

Almost all `NO || NO` (1250). Rare YES/blank variants exist. **Not** a construction rule.

Full combo lists: workbook sheet **Observed Master Combinations**.

---

## 9. Dependency rule classification

Every potential relationship gets **exactly one** class:

- **A.** EXPLICIT TECHNICAL OFFICE RULE  
- **B.** OBSERVED MASTER CONFIGURATION  
- **C.** V2 IMPLEMENTATION RULE  
- **D.** INFERRED — DO NOT IMPLEMENT  
- **E.** UNDEFINED — TECHNICAL OFFICE INPUT REQUIRED  

| Relationship | Class | Why |
|--------------|-------|-----|
| Source A named lists (MV_All_V, Type_Screen, …) | **E** (candidate A only if TO says the name is an exclusive filter) | Lists ≠ pairs (Step 01) |
| Source A seven examples | **B** as examples / **E** as rules | EXAMPLE ONLY |
| All §8 Source B pairs | **B** | Observed rows only |
| V2 cascade / sanitization / MV-requires-screen / 1-core AWA bias | **C** | Coded product behaviour, not TO-sourced |
| “Aluminium cannot be Class 1/5” | **D** | Absence in B is not a forbid |
| “PVC never has screen” | **D** | Only blank in this extract |
| “Screen material is derived from type” | **D** | 1:1 observation only |
| “Armour material is derived from type” | **D** | 1:1 observation only |
| “64/110 kV is MV” | **D** | Stored that way; physically suspicious |
| Family ↔ Voltage class allowed pairs | **E** | Three-way family clash |
| Voltage ↔ Standard allowed pairs | **E** | 39 observations, no closed table |
| Conductor class/shape/compacting | **E** | Taxonomy conflict |
| Screen CSA determination | **E** | Numbers without a rule |
| Armour CSA determination | **E** | Column empty |
| When armour is permitted | **E** | Blanks vs N/A vs No Armour |
| N/A vs blank vs `-` | **E** | See §13 |
| Core colors | **E** | B empty; A schemes |
| CPR class vs construction | **E** | Flag/class observed; parents unknown |
| Bedding | **E** | In A, missing in B |

**Explicit Technical Office pairwise rules found in this step: 0.**

---

## 10. Critical engineering areas (A–AC)

For each area: master values, observed configurations, explicit rules, missing rules, parents/children, questions.

### A. Cable Family

- **Master values (A):** Source A `LV Power cables`, `MV power cables`, plus catalog `HV power cables`, `Instrumentation Cables`, `OHTL`, `BUILDING WIRE`. Source B `UGC`, `OH`. V2 `UGC/OHL/ABC/SINGLE/CONTROL/TELECOM/OHTL`.
- **Observed:** UGC 1243, OH 13 (bare-conductor style descriptions, core 0).
- **Explicit rules:** none.
- **Missing:** canonical family list and mapping.
- **Parents/children:** family → voltage class/standard/construction applicability — all **E**.
- **Question:** What is the official family list, and how do the three sources map?

### B. Voltage Class

- **Master values:** A catalog LV/MV/HV; B `LV`/`MV`/`-`.
- **Observed:** OH always `-`; UGC LV or MV; HV-looking voltages stored as MV.
- **Explicit:** none.
- **Question:** Is `-` a valid class, N/A, or OHTL? Are 38/66 and 64/110 MV or HV?

### C. Voltage

- **Master values:** A IEC/BS/Wire subset lists; B 15 strings.
- **Observed:** 15 class→voltage pairs (1:1 in this file).
- **Notation conflict:** A `12/20 (24) kV` vs B `12/20 kV`.
- **Question:** Canonical U0/U/(Um) writing? Exclusive lists per class/standard?

### D. Standard

- **Master values:** A MV/LV lists; B 19 including `IEC 60840`, `NFC 33-226`, `7884`.
- **Observed:** 39 voltage→standard pairs; Standard = Applicable Standard.
- **Question:** Closed Voltage×Standard matrix? Meaning of `7884`? Is IEC 60840 HV?

### E. Conductor Material

- **Master values:** Copper, Tinned Copper (A catalog), `Aluminuim`.
- **Observed:** Copper 803, Aluminuim 453. No tinned in B.
- **Question:** Is tinned a material or a treatment? Official spelling?

### F. Conductor Class

- **Master values (conflict):** A examples `Round Compacted`/`Solid`/`Stranded Uncompacted`/`Flexible`; A lists Solid/Stranded/Flexible; B `Class 1-Solid` / `Class 2-Stranded` / `Class 5-Flex`.
- **Observed:** §8.4–8.5.
- **Do not decompose** class/shape/compacting in software until TO defines them.

### G. Conductor Size

- **Master values:** A multiple size lists; B 22 sizes.
- **Observed:** 44 class→size; 37 material→size.
- **Question:** Permitted sizes per material+class+shape+standard?

### H. Core Count

- **Master values:** A 1 / 3 / `3 Triplex` / MV/LV core lists.
- **Observed:** 0,1,2,3,3.5,4,5,7,9,11,12,17,19,21,31,37,41.
- **Question:** Is `0` “not a cable”? Is `3.5` 3+reduced earth? Is `3 Triplex` distinct from `3`?

### I. Conductor Water Tight

- **Master values:** A catalog empty; B Yes (156) / No (1100).
- **Question:** Independent flag vs construction water-tightness (Longitudinal/Radial)?

### J. Insulation

- **Master values:** XLPE, PVC, LSHF.
- **Observed:** XLPE on all MV UGC; PVC/LSHF only LV in this file; OH blank.
- **Do not infer** “MV ⇒ XLPE only” as a TO rule (it is **B**).

### K. Insulation Color

- A catalog only (`Natrual` misspelling). B empty. **UNDEFINED** whether technical or presentation.

### L. Outer Semi-Conductor

- **Master values:** A Bonded/Strippable/N/A; B Bonded/Strippable/`-`.
- **Observed:** LV all `-` (483); MV Strippable 603 / Bonded 157.
- **Question:** Is `-` the same as `N/A`? Always required on MV?

### M–P. Screen Type / Material / CSA / Water Tight

See §12. CTS+CWS overlapped exists in A, **not** in B. Blank screen (492) ≠ written `No Screen`.

### Q–T. Armour Type / Material / CSA / Water Tight

See §12. Source A example armour `STA` **not** in B. B has `GDSTA` (not in A example row). Armour CSA empty.

### U–V. Sheathing / Sheathing Color

B adds `PE-FR`. Colors ALL CAPS; White/Grey from A examples **not** in B. Color `-` with blank sheath.

### W. Special Additives

Empty in A catalog and B. **MISSING.**

### X–Y. Semi Conduct / Graphite

B flags, nearly constant NO. Distinct from Outer Semi-Conductor. **UNDEFINED** meaning and parents.

### Z–AA. CPR / CPR Class

A Euroclass catalog vs B Yes/No + B2ca/Cca/`-`. Examples blank. Parents unknown.

### AB. EDR

Empty. **UNDEFINED.**

### AC. Core Colors

See §14. No populated per-core colors in B.

---

## 11. Conductor model (P0)

Proven structure in **Source B columns**:

```text
Conductor Material  →  Conductor Class  →  Conductor Size
```

**Not present as columns:** Conductor Shape, Compacting, wire count, hardness (Bare Soft / Bare Hard).

**Leaked in Cable Description (not structured):**

| Token | Approx count | Possible meaning (not adopted) |
|-------|-------------:|--------------------------------|
| `RMC` | 991 | Round compacted — **hypothesis only** |
| `SM` | 67 | Sector milliken/shaped — **hypothesis only** |
| `RE` | seen on Class 1 samples | Solid round — **hypothesis only** |
| `(Flex)` | Class 5 samples | Flexible — **hypothesis only** |
| `Compacted Bare Soft , N Wires` | 11 + OH rows | Conductor construction text |
| `Bare Hard` | OH `7884` rows | Hard-drawn overhead |

Source A treats **Class, Shape, Compacting** as mixed:

- Catalog: Class = Solid/Stranded/Flexible; Shape = Round/Sector.
- Examples: Class column = `Round Compacted` while Shape = `Round`.

**Determinations:**

| Concept | Representation | Status |
|---------|----------------|--------|
| Conductor Material | Separate column both sources | Combined with spelling issues |
| Conductor Class | Separate column; **different vocabularies** | **Inconsistently represented** |
| Conductor Shape | A column; B **absent** | **Separate in A, missing in B** |
| Compacting | Mixed into A class; B description tokens | **Inconsistently represented** |
| Size | Separate column | Combined lists, unpaired |

**Do not invent a decomposition for V3.** Technical Office must define whether Class 2 **implies** compacted, whether RMC/SM/RE are shape codes, and which sizes attach to which class/material.

Aluminium observed only with Class 2 in this master — **B**, not a forbid.

---

## 12. Screen / armour model (P0)

### 12.1 Screen

| Field | Independent master? | Derived? | Observed | Explicitly allowed | Missing |
|-------|---------------------|----------|----------|--------------------|---------|
| Screen Type | **UNKNOWN** — appears selectable | Not declared | CWS, CTS, foil, AWS, blank | A list also has CTS+CWS and N/A | When required; blank vs N/A vs No Screen |
| Screen Material | **UNKNOWN** | 1:1 with type in B (**D — do not implement**) | Cu or Al | None | Independent or derived? |
| Screen CSA | **UNKNOWN** | Possibly calculated | CWS 16/25/35 typical; CTS/foil `-` | None | Determination rule |
| Screen Water Tight | **UNKNOWN** | No | Yes/NO even when screen blank (6 Yes on blank screen) | None | Applicability when no screen |

**Do not infer rules from frequency** (CWS×35 = 254 is still **B**).

### 12.2 Armour

| Field | Independent master? | Derived? | Observed | Explicitly allowed | Missing |
|-------|---------------------|----------|----------|--------------------|---------|
| Armour Type | **UNKNOWN** | No | SWA/AWA/GDSTA/ATA/blank | A list SWA/STA/AWA/ATA/GSTA/N/A | STA vs GDSTA; when permitted |
| Armour Material | **UNKNOWN** | 1:1 with type in B (**D**) | Steel/Aluminium | None | Independent or derived? |
| Armour CSA | Missing data | Unknown | All blank | None | Entire rule |
| Armour Water Tight | Unknown | No | 2 YES | None | Flag vs construction WT |

1-core AWA is **observed** (82 AWA, all core count 1 in top pairs) but V2’s “1-core ⇒ AWA” remains **C**, not TO.

---

## 13. N/A / None / blank semantics

Do **not** auto-normalize.

| Token | Source A | Source B | Semantic difference |
|-------|----------|----------|---------------------|
| `N/A` | Used on LV examples for outer semi, screen, bedding, armour, sheath, color; `*_None` lists = `N/A` | **Not stored** | UNKNOWN vs B blank/`-` |
| `None` | Not a dominant token | Not stored | UNKNOWN |
| `No Screen` | V2 language (not A workbook token) | Not stored | UNKNOWN |
| `No Armour` | V2 language | Not stored | UNKNOWN |
| `Not Applicable` | Not observed as stored | Not stored | UNKNOWN |
| blank / empty | Unused example rows; empty catalogs | Screen 492, Armour 1042, colors 1256, Customer Code 1256, Approved Status 1256, … | UNKNOWN — missing data vs not applicable vs none |
| `-` | Not the A none-token | Voltage class/voltage/outer semi/CSA/sheath color/CPR class | UNKNOWN — placeholder vs N/A vs none |
| `No` / `NO` | — | Flags | UNKNOWN if equivalent |
| `Yes` / `YES` | — | Flags | UNKNOWN if equivalent |

**Technical Office decision question (mandatory):**

> What is the semantic difference between `N/A`, `None`, `No Screen`, `No Armour`, `Not Applicable`, blank/empty, and `-`? Which tokens mean “layer not part of this construction,” which mean “unknown / not yet entered,” and which mean “explicitly forbidden”?

Until answered, V3 cannot sanitize screen/armour children safely.

---

## 14. Core colors

| Fact | Evidence |
|------|----------|
| Maximum populated core-color columns on any Source B row | **0** |
| Rows with any Core 1–8 Color | **0 / 1256** |
| Source A core color model | Catalog **schemes** (`Brown - Blue`, `Black with White Numbering`) — not per-core slots |
| Dependence on core count | **Not evidenced** in B (all blank). A has no cores↔scheme table |
| Dependence on family / standard / customer | **Not evidenced** |
| Technical vs presentation | **UNDEFINED** |

Do **not** infer a universal colour sequence (Brown-Black-Grey, etc.).

Core Count `3.5` descriptions encode a reduced conductor in **text**, not in Core 4 Color.

---

## 15. Derived engineering outputs

| Field | Input or derived? | Evidence | Implement calculations? |
|-------|-------------------|----------|-------------------------|
| Cable Diameter | **OUTPUT / CALCULATED** (candidate) | 509 distinct numeric values, populated on all rows including OH | **No** |
| Cable Weight | **OUTPUT / CALCULATED** (candidate) | 1185 distinct values (~almost per row) | **No** |
| Cable Description | **OUTPUT** plus leaked construction tokens | 735 unique strings; duplicates some structured fields | **No** |
| Applicable Standard | **Duplicate** of Standard | 1256/1256 identical | **No** |
| Technical Notes | Empty annotation | 0 values | **No** |
| EDR | Empty unknown | 0 values | **No** |

Diameter and weight likely come from engineering calculation or BOM, **not** from customer configuration. V3 architecture must treat them as outputs once TO confirms the calculation owner. This step does not design the calculator.

---

## 16. Customer Code / Item Code / Material Number

| Field | Role | Evidence | V3 implication |
|-------|------|----------|----------------|
| Material Number | **Cable Master identity** | Unique, always populated, numeric-like strings (`10000088`, `10642`, …) | Customer must **not** fabricate. System/TO assigned. Match key for EXISTING_APPROVED |
| Item Code | **Legacy / plant SKU**, not unique identity | 863 unique; 30 duplicate groups; 49 blank (including all sampled OH) | May identify a commercial item spanning several material numbers — **TO must confirm** |
| Customer Code | **Customer-specific identifier** (column exists) | **All blank** in this template | Not a configuration parameter. Must come from customer master/scope, not typed as engineering input |

These are **identifiers**, not selectable construction parameters.

---

## 17. Approved Status

| Observation | Meaning |
|-------------|---------|
| All 1256 blank | Cannot tell engineering vs commercial vs lifecycle vs active/inactive |
| V2 type comment | `'Draft' \| 'Technical Approved' \| 'Commercial Approved' \| 'Released' \| 'Obsolete'` — **product language**, not evidenced in Source B |
| Current DB | `CableMaster.approvalStatus` default `IMPORTED`; `status` ACTIVE/inactive separate |

**Do not change current statuses.**

**How V3 should consume approval (recommendation only, not implemented):**

- EXISTING_APPROVED / `EXISTING_CABLE` only when the matched Cable Master is in an **TO-defined approved/released** state.
- Blank approval in the template ⇒ today those 1256 rows **cannot** be classified as approved from Source B alone.
- Do not invent a new engineering status in this step.

---

## 18. Customer vs Technical Office

The V3 engine must remain **common**. Only permissions/presentation differ.

| Field | Classification |
|-------|----------------|
| Family, voltage class, voltage, standard, conductor material/class/size, core count, insulation, screen type, armour type, sheathing, sheathing color | **CUSTOMER_SELECTABLE** *candidate* — **NOT_DEFINED** until TO confirms commercial path |
| Outer semi-con, screen CSA, screen material, armour material, armour CSA, water-tight flags, CPR, CPR class, semi conduct, graphite | **TECHNICAL_OFFICE_ONLY** *default* until TO says otherwise — currently **NOT_DEFINED** |
| Core colors, insulation color | **NOT_DEFINED** (no B data) |
| Diameter, weight, description, applicable standard | **SYSTEM_DERIVED** |
| Material number | **SYSTEM_VALIDATED** / TO-assigned — never customer-fabricated |
| Item code, customer code | **CUSTOMER-SPECIFIC** identifiers — not construction |
| Approved status, mapping, rule approval | **TECHNICAL_OFFICE_ONLY** |
| Authority result | **SYSTEM_VALIDATED** |

---

## 19. V3 outcome model

Existing four outcomes remain **sufficient**. No evidence requires a fifth status.

| Product language | Code today | Still valid? |
|------------------|------------|--------------|
| EXISTING_APPROVED | `EXISTING_CABLE` | Yes — match Material Number / canonical construction **and** TO approval once defined |
| VALID_NEW_CABLE | `TECHNICALLY_VALID_NOT_MASTER` | Yes — only after rules exist; until then fail closed |
| INVALID_CONFIGURATION | `INVALID_CONFIGURATION` | Yes — forbidden combinations once TO writes them |
| CONFIGURATION_REQUIRED | `CONFIGURATION_REQUIRED` | Yes — **this is the correct outcome while P0 rules are missing** |

Do not create new outcomes in this step.

---

## 20. Technical Office clarification questions

Answerable by engineers. Not software-architecture questions.

### P0 — BLOCKS ENGINE DESIGN

| ID | Question |
|----|----------|
| P0-01 | What is the official Cable Family list? How do Source A (LV/MV/HV/OHTL/Instrumentation/BUILDING WIRE), Source B (`UGC`/`OH`), and V2 (`UGC/OHL/ABC/…`) map? |
| P0-02 | Are the 13 Source B `OH` rows cables or bare conductors? Is Core Count `0` valid, meaning “no cores,” or a data defect? |
| P0-03 | What Voltage Classes exist, and how are `38/66 kV`, `64/110 kV`, and `IEC 60840` classified? What does Voltage Class `-` mean? |
| P0-04 | Define Conductor Class, Conductor Shape, and Compacting as **combined, separate, or derived**. Reconcile Source A `Round Compacted` in the Class column with Source B `Class 2-Stranded` and description tokens `RMC`/`SM`/`RE`. **Do not ask software to guess.** |
| P0-05 | Which Conductor Sizes are permitted for each Material × Class × Shape (and Standard, if applicable)? |
| P0-06 | When is a Screen required, optional, or forbidden? What token means “no screen”: blank, `-`, `N/A`, or `No Screen`? |
| P0-07 | How is Screen CSA determined? When must it be numeric vs `-`? |
| P0-08 | Is Screen Material independently chosen or always determined by Screen Type? |
| P0-09 | When is Armour permitted? What token means “no armour”? Reconcile A `STA`/`GSTA`/`N/A` with B `GDSTA`/blank. |
| P0-10 | How is Armour CSA determined? The Cable Master column is empty. |
| P0-11 | Is Armour Material independently chosen or always determined by Armour Type? |
| P0-12 | What is the semantic difference between `N/A`, `None`, `No Screen`, `No Armour`, `Not Applicable`, blank, and `-`? |
| P0-13 | Is Material Number the unique Cable Master identity, who assigns it, and may Item Code repeat across material numbers? |
| P0-14 | Which observed Source B combinations are **approved compatibility rules** vs **historical constructions only**? Default until answered: historical only. |
| P0-15 | What does Approved Status mean, which values exist, and which values allow EXISTING_APPROVED? |

### P1 — REQUIRED FOR CORRECT ENGINEERING BEHAVIOUR

| ID | Question |
|----|----------|
| P1-01 | Which Voltage × Standard pairs are permitted (closed matrix, not the 39 observations)? |
| P1-02 | Canonical voltage notation: `12/20 (24) kV` vs `12/20 kV` vs `12.7/22 (24) kV`? |
| P1-03 | Official spelling: Aluminium vs `Aluminuim`; is Tinned Copper a material? |
| P1-04 | Meaning of Core Count `3.5` and of Source A `3 Triplex` vs `3`. |
| P1-05 | What determines Core Color — core count, family, standard, customer, or presentation only? Schemes vs Core 1–8? |
| P1-06 | Is Insulation Color a technical parameter? Why is it empty in the master? |
| P1-07 | Outer Semi-Conductor: is LV always N/A/`-`? When Bonded vs Strippable? |
| P1-08 | Is Bedding part of the engineering master? It exists in Source A and not in Source B. |
| P1-09 | Water tightness: one construction attribute (Longitudinal/Radial/both) vs three Yes/No flags? |
| P1-10 | Which CPR classes apply to which constructions? CPR flag vs Euroclass vs Source A `cpr`/`cprClass`? |
| P1-11 | Meaning of Semi Conduct vs Outer Semi-Conductor vs Graphite. When can they be YES? |
| P1-12 | Are the seven Source A examples **normative golden tests** or illustrations only? |
| P1-13 | Which fields may the customer select vs Technical Office only? |
| P1-14 | What does incomplete standard `7884` mean? |
| P1-15 | Sheath colours: is ORANGE a technical rule? Where are White/Grey from the examples? |

### P2 — HARDENING

| ID | Question |
|----|----------|
| P2-01 | Confirm aliases and case: `Yes`/`YES`/`No`/`NO`; `BLACK` vs `Black`; `Class 5-Flex` vs `Flexible`. |
| P2-02 | Source of Cable Diameter and Cable Weight (calculation, datasheet, import). Units? |
| P2-03 | Description template: should V3 generate it, and must it include RMC/SM/RE? |
| P2-04 | Drop or keep Applicable Standard as a duplicate column? |
| P2-05 | Special additives / termite / special area / customer identification — in or out of V3 MVP? |
| P2-06 | PE-FR sheath: official name and parents? |

### P3 — FUTURE

| ID | Question |
|----|----------|
| P3-01 | EDR definition and applicability. |
| P3-02 | Technical Notes usage. |
| P3-03 | Customer-specific construction constraints beyond Customer Code. |
| P3-04 | High core counts (31/37/41) — control/instrument families missing from B family list? |

---

## 21. Technical Office response template

Fill in workbook sheet **TO Rule Response Template**. Do **not** treat the format row as a real rule.

Workbook sheet 12 is named **NA Semantics** (Excel forbids `/` in sheet names). It is the N/A / None / blank / `-` dictionary.

| Column | Purpose |
|--------|---------|
| Rule ID | e.g. DEP-001 |
| Priority | P0 / P1 / P2 / P3 |
| Parent Condition 1–3 | Engineering conditions |
| Dependent Parameter | Child field |
| Allowed Value | Exact permitted value (raw or TO-approved display) |
| Forbidden Value | Exact forbidden value |
| Exception | If any |
| Mandatory? | Yes/No |
| Derived? | Yes/No |
| Technical Notes | Free text |
| TO Owner | Name |
| TO Decision | APPROVED / REJECTED / DEFERRED |
| Approved By | |
| Approval Date | |

Format example (**EXAMPLE_FORMAT_ONLY — not an approved rule**):

| Rule ID | Priority | Parent 1 | Parent 2 | Parent 3 | Dependent | Allowed | Forbidden | Exception | Mandatory? | Derived? |
|---------|----------|----------|----------|----------|-----------|---------|-----------|-----------|------------|----------|
| EXAMPLE-FORMAT | — | Voltage Class = MV | | | Voltage | *(TO fills)* | | | | No |

Unknown cells stay blank for TO completion. No observed combination was copied into Allowed Value.

---

## 22. What the engineering Cable Master must contain (provisional)

Until TO answers P0, this is a **requirements statement**, not a schema change.

**Must contain (identity + governance):**

- Material Number (unique, system/TO assigned)
- Item Code (if still used; cardinality rules from TO)
- Customer Code only as commercial overlay, not construction
- Approved Status with an explicit code list
- Construction fields once the signature is closed

**Must contain as versioned value masters (codes + labels + aliases), not as display-text keys:**

Family, Voltage Class, Voltage, Standard, Conductor Material, Conductor Class, Size, Core Count, Insulation, Outer Semi-Con, Screen Type, Armour Type, Sheathing, Sheathing Color, CPR Class — **after** vocabularies are reconciled.

**Must not treat as customer-selectable configuration:**

Diameter, Weight, Description, Applicable Standard duplicate, Technical Notes.

**Must not invent from observation:**

Pairwise compatibility tables, derived screen/armour material rules, size cartesian products.

---

## 23. Final V3 gate

Ready-for-architecture criteria and this step’s evidence:

| Criterion | Met? |
|-----------|------|
| All P0 dependencies explicitly defined | **No** — 0 pairwise TO rules |
| Critical compatibility rules defined | **No** — observations only |
| Conductor model defined | **No** — class/shape/compacting conflict |
| Screen/armour model defined | **No** — CSA/absence/material derivation undefined |
| N/A semantics defined | **No** — A uses N/A; B uses blank/`-` |
| Cable Master identity understood | **Partial** — Material Number unique; Item Code not unique; Customer Code empty; Approved Status empty |

**Decision: BLOCKED — TECHNICAL OFFICE CLARIFICATION REQUIRED**

Not READY FOR V3 ARCHITECTURE.  
Not READY FOR IMPLEMENTATION.

V1 remains unchanged. V2 remains frozen. No database, API, UI, or Cable Master edits follow from this document.

---

## 24. Strict rules followed

- No code, database, migration, API, UI, V1, V2, or Cable Master changes.
- No engineering rule invention.
- Observed combinations labelled **OBSERVED IN MASTER** only.
- Lookup lists not treated as compatibility rules.
- No silent normalization; source spellings retained (`Aluminuim`, `7884`, `20.8/36kV`).
- No deletion of source values.
- No new engineering status.

---

## 25. Analysis inventory (for the completion report)

| Item | Result |
|------|--------|
| Source files analyzed | Source A workbook (3 sheets); Source B template (1 sheet, 45 columns) |
| Records analyzed | Source A: 7 examples; Source B: **1256** |
| Fields analyzed | Source B 45 + Source A selection/dependency/catalog fields + V2/DB identity fields |
| Unique values analyzed | See §4 (families 2, voltages 15, standards 19, sizes 22, cores 17, …) |
| Explicit rules found | **0** pairwise |
| Observed combination groups | 24 parent→child relationships tabulated (hundreds of distinct pairs) |
| Undefined rules | All critical compatibility, conductor taxonomy, screen/armour CSA, N/A, identity governance |
| P0 questions | 15 |
| P1 questions | 15 |
| TO actions | Complete workbook sheets 7–15; approve family/conductor/screen/armour/N/A/identity |
)
