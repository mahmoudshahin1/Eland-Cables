# Master Data Import Log

**Date:** 2026-08-22  
**Operator:** master-data-import (automated via `scripts/importAllMasters.ts`)  
**Source:** Desktop `New folder` → `data/source/`

## 1. File inventory

| Desktop filename | Project path | Official expected name | Import type |
|---|---|---|---|
| Raw Material List.xlsx | `data/source/Raw Material List.xlsx` | `Raw Material List.xlsx` | `RAW_MATERIAL` (Import Center) |
| Energya Cable Master Data.xlsx | `data/source/Energya Cable Master Data.xlsx` | `Energya Cable Master Data.xlsx` | `CABLE` + `BOM` sheets |
| Drum List.xlsx | `data/source/Drum List.xlsx` | `Drum List.xlsx` | `DRUM` |
| Cables Parameters_1.xlsx | `data/source/Cables Parameters_1.xlsx` | *(no official name yet)* | Technical Office engineering params — **not auto-imported** |
| Description Schema.xlsx | `data/source/Description Schema.xlsx` | *(reference doc)* | Cable description rules — **not auto-imported** |
| ELAND Cost Sheet Required.xlsx | `data/regression/ELAND Cost Sheet Required.xlsx` | Regression reference only | **DO NOT import as master data** |

Original Desktop files were **not modified**.

## 2. Sheet analysis

### Raw Material List.xlsx

| Sheet | Rows | Headers |
|---|---:|---|
| Sheet1 | 74 | Raw Material Code, Description, Unit of Measurement, Price |

Optional column **Currency** (USD, EUR, LE/EGP, etc.) is mapped to `RawMaterial.currency` and `RawMaterialPrice.currency` on import. `EGP` is normalized to company standard `LE`.

All `Price` cells blank → `PRICE_NOT_CONFIGURED` (no zero fabricated).

### Energya Cable Master Data.xlsx

| Sheet | Rows | Headers |
|---|---:|---|
| Cable List | 432 | Specification Code, Item Code, Cable Material Number, Eland Item Number, Cable Desc, Total Cable Weight, Cable Diameter |
| Cable Materials | 4986 | Customer Code, Item Code, Cable Material Number, Raw Material, Weight, Unit/Km |

### Drum List.xlsx

| Sheet | Rows | Headers |
|---|---:|---|
| Sheet1 | 103 | Drum Code, Flange, Barrel, Inner Width, Outer Width, Capacity |

No drum type / max weight columns in source → `CONFIGURATION_REQUIRED` warnings (30 drums).

### Cables Parameters_1.xlsx

| Sheet | Rows | Headers |
|---|---:|---|
| Sheet1 | 24 | Material Number, Description, Family, Standard, Designation Code, Voltage, Conductor Type, Conductor Water Tight, Cross section area (mm2), Nb.Cores, Core Colors, Insulation, Bonded or Strippable, Screen Type, Screen Cross section Area, Armour type, Sheath, Sheath Color, CPR, Water resistance |

**Mapping:** Engineering attribute extract for Technical Office / `CableEngineeringMapping`. Import via Technical Office Excel pre-import or a future dedicated pipeline — not the Import Center master types.

### Description Schema.xlsx

| Sheet | Rows | Purpose |
|---|---:|---|
| Summary & Structure | 28 | Human-readable rules for generating cable descriptions from parameter selections (e.g. `Cu / XLPE / SWA / PVC 0.6/1 kV 3X120 mm2 SM IEC 60502-1`) |

**Integration:** Reference for `technicalValidationEngineV2` / description generation. No tabular import target today.

### ELAND Cost Sheet Required.xlsx (regression only)

| Sheet | Rows |
|---|---:|
| Summary | 23 |
| Materials List | 39 |
| 1–4 (per-cable costing) | 27 / 35 / 37 / 37 |

Stored at `data/regression/ELAND Cost Sheet Required.xlsx`. See [`ELAND_COSTING_GOLDEN_REGRESSION.md`](./ELAND_COSTING_GOLDEN_REGRESSION.md).

## 3. Import results (PostgreSQL)

Executed: `npx tsx scripts/importAllMasters.ts`  
Order: Raw Materials → Cables → BOMs → Drums

| Kind | Valid | Rejected | Warnings | Skipped | Duplicates observed |
|---|---:|---:|---:|---:|---:|
| RAW_MATERIAL | 74 | 0 | 74 (all prices blank) | 0 | 0 |
| CABLE | 432 | 0 | 432 (empty Eland Item Number) | 0 | 0 |
| BOM | 4822 | 0 | 432 (UOM_CONFLICT PCS vs kg) | 164 | 81 groups |
| DRUM | 103 | 0 | 30 (CONFIGURATION_REQUIRED) | 0 | 0 |

**Note:** BOM persist initially hit Prisma 5s transaction timeout; fixed by extending timeout to 120s for BOM kind in `masterDataRepository.ts`.

## 4. Post-import readiness

| Metric | Count |
|---|---:|
| Cables (active) | 435 *(432 official + 3 test/fixture rows)* |
| BOM lines | 4827 |
| Raw materials | 92 *(74 imported + prior seed/fixture)* |
| Prices configured | 7 |
| Prices not configured | 85 |
| Drums | 103 |
| BOM duplicate observations | 81 |

### Costing readiness (4-gate cohort, 2026-08-22)

| Status | Cables |
|---|---:|
| READY_FOR_COSTING | 2 *(fixtures only)* |
| NOT_READY | 360 |
| DATA_ISSUE | 73 |
| UNDER_REVIEW | 0 |

| Gate | Cables failing |
|---|---:|
| Gate 1 — Engineering mapping APPROVED | 433 |
| Gate 2 — BOM resolved / authoritative | 73 |
| Gate 3 — Raw materials exist | 0 |
| Gate 4 — Approved price for date/UOM | 433 |

## 5. Blockers for CALCULATE

1. **Gate 4 — Raw material prices:** Source workbook has no prices. All 74 imported RMs are `PRICE_NOT_CONFIGURED`. Prices must be entered and approved via Price Governance Workbench (no fabrication).
2. **Gate 1 — Engineering mapping:** Official cable list has no family/voltage/insulation columns. Engineering mappings must be created and approved (24-row `Cables Parameters_1.xlsx` is a starting subset).
3. **Gate 2 — BOM conflicts:** 81 duplicate weight groups and 73 cables with unresolved BOM authority. Resolve via BOM Governance Workbench.
4. **UOM conflicts:** 432 BOM lines use PCS while RM master uses kg — business decision required before costing.
5. **Gate 5 (optional):** Active `CostingConfigurationVersion` may be required for full Increment 13 costing layers.

## 6. CLI commands

```bash
# Inspect workbooks (read-only)
npx tsx scripts/inspectSourceMasters.ts

# Full master import (RM → Cable → BOM → Drum)
npx tsx scripts/importAllMasters.ts

# Costing readiness summary
npx tsx scripts/costingReadinessSummary.ts

# Official import (RM + Cable + BOM only, no drums)
npx tsx scripts/importOfficialMasters.ts
```

## 7. Next steps

1. **Prices:** Import or manually enter RM prices with effective dates; approve via Price Governance.
2. **Engineering:** Map `Cables Parameters_1.xlsx` rows to `CableEngineeringMapping` and approve.
3. **BOM governance:** Resolve 81 duplicate groups and classify PCS vs kg conflicts.
4. **Description rules:** Wire `Description Schema.xlsx` rules into configurator description engine (reference only today).
5. **ELAND regression:** Build golden tests from `data/regression/ELAND Cost Sheet Required.xlsx` once prices and mappings are in place.

---

## 8. Re-import — Raw Material List (2026-08-22, updated Desktop file)

**Source:** `c:\Users\POP\Desktop\New folder\Raw Material List.xlsx` → `data/source/Raw Material List.xlsx` (overwrite)

### 8.1 Spreadsheet changes vs prior import

| Attribute | Prior (§2) | Updated file |
|---|---|---|
| Headers | Raw Material Code, Description, Unit of Measurement, Price | Raw Material Code, Description, **UofM**, Price, **Currency** |
| Rows | 74 | 74 |
| Prices populated | 0 (all blank) | **37** (LE + USD) |
| Prices blank | 74 | 37 |
| Effective dates | — | None in source |

**Pipeline fix:** Added `UofM` as a UOM column alias in `importPipelineService.ts` (prior header `Unit of Measurement` no longer present).

### 8.2 Import result (raw materials only)

Executed: targeted `commitKind('raw_materials')` + `persistImportTransaction` (not full `importAllMasters.ts`)

| Metric | Value |
|---|---:|
| Valid | 74 |
| Rejected | 0 |
| Warnings | 74 |
| PRICE_NOT_CONFIGURED warnings | 37 |
| DATA_REQUIRED warnings (price without effective date) | 37 |

Sample priced rows: A-EC04/A-EC05 (200,000 LE), AFD145/AFD155 (4,650 USD).

### 8.3 Post re-import readiness

| Metric | Before | After |
|---|---:|---:|
| Raw materials (total) | 92 | 92 |
| `priceStatus = CONFIGURED` | 7 | **44** |
| `priceStatus = PRICE_NOT_CONFIGURED` | 85 | **48** |
| Price rows `temporalStatus = DATA_REQUIRED` | — | **42** |

### 8.4 Costing gate status (unchanged)

`npx tsx scripts/costingReadinessSummary.ts` after re-import:

| Status | Cables |
|---|---:|
| READY_FOR_COSTING | 2 |
| NOT_READY | 360 |
| DATA_ISSUE | 73 |
| UNDER_REVIEW | 0 |

| Gate | Cables failing | Change |
|---|---:|---|
| Gate 1 — Engineering mapping APPROVED | 433 | — |
| Gate 2 — BOM resolved / authoritative | 73 | — |
| Gate 3 — Raw materials exist | 0 | — |
| Gate 4 — Approved price for date/UOM | 433 | **no change** |

**Why Gate 4 did not improve:** Import Center stores numeric prices as `RawMaterialPrice` rows with `workflowStatus = DRAFT` (default) and `temporalStatus = DATA_REQUIRED` when no effective date is in the source. Gate 4 requires `workflowStatus = APPROVED` plus a valid effective period. Prices were **not** auto-approved per pipeline rules.

### 8.5 Next steps after re-import

1. **Price Governance:** Review 37 newly imported price rows in Price Governance Workbench; add effective dates where missing, then approve.
2. **Remaining blanks:** 37 RMs still have no price in source — enter manually or await next spreadsheet update.
3. **Engineering / BOM:** Unchanged blockers (Gates 1–2) — see §5.
