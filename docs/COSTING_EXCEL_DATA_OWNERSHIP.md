# Costing Excel Data Ownership

Reference workbook: `data/source/Energya Cable Master Data.xlsx` (432 cables, Cable List + Cable Materials + Summary).

This document records the inspection required before extending costing Excel integration. It defines **which entity owns each field** and how Import Center vs Costing Configuration vs Inquiry divide responsibility.

---

## 1. What has already been implemented

| Area | Status | Location |
|------|--------|----------|
| Inquiry header copper/aluminium price override | Implemented | `src/domain/inquiryMetalPricing.ts`, `costingEngine.ts`, `InquiryHeaderForm.tsx` |
| Metal price blocks costing when missing | Implemented | `costingEngine.ts`, `commercialRoutes.ts` |
| Costing line pricing traceability | Implemented | `CostingLine` fields + orchestration snapshots |
| BOM Scrap bulk upload (Scrap % only) | Implemented | `cableScrapTemplateService.ts`, `BomScrapPanel.tsx` |
| BOM Scrap visibility in Master Data Hub | Implemented | `masterDataRepository.listBoms()`, `MasterDataHub.tsx` |
| Cable Master + BOM import pipeline | Implemented | `importPipelineService.ts`, `MasterDataImport.tsx` |
| Official workbook multi-sheet load | Implemented | Cable List + Cable Materials sheets in Import Center |
| Scrap % on `GovernedBomLine` | Implemented | `GovernedBomLine.scrapPercentage` |
| Excel percent normalization (0.015 → 1.5%) | Implemented | `parseScrapPercentInput()` |

**Gap fixed in this increment:** Direct Raw Material Cost in the orchestrator previously applied scrap to line totals. It now matches the engine rule: `Direct RM Cost = Consumption × Applied Price` (scrap stored and traced, not multiplied into direct RM).

---

## 2. Cable Master tables

| Model | Role |
|-------|------|
| `CableMaster` | Canonical cable identity and engineering attributes |
| `CableEngineeringMapping` | Approved engineering mapping (family, conductor, revision) |

**Cable Master fields:** `materialNumber`, `itemCode`, `customerCode` (Specification Code), `elandItemNumber`, `description`, `weight`, `diameter`, `family`, `conductor`, `voltage`, `cores`, insulation/screen/armour/sheath, `status`, `approvalStatus`.

Match key: **`materialNumber`** (Cable Material Number). Updates upsert by material number; no duplicate cables.

---

## 3. BOM tables

| Model | Role |
|-------|------|
| `CableBomLine` | Source BOM / material consumption (imported) |
| `GovernedBomLine` | Approved governed BOM used for costing |
| `BomDuplicateObservation` | Conflicting consumption rows requiring governance |

Match key: **`cableMaterialNumber` + `rawMaterialCode`**. One cable → many BOM lines. Import merges by key; rows missing from a workbook are **not** deleted.

---

## 4. Raw Material tables

| Model | Role |
|-------|------|
| `RawMaterial` | Master identity, UOM, `pricingCategory` |
| `RAW_MATERIAL_DICTIONARY` | Legacy dictionary fallback in import |

`pricingCategory`: `MARKET_METAL_COPPER`, `MARKET_METAL_ALUMINIUM`, `STANDARD_RAW_MATERIAL`.

---

## 5. Raw Material Price tables

| Model | Role |
|-------|------|
| `RawMaterialPrice` | Versioned prices with workflow (`APPROVED`, `isCurrent`) |

Used for non-market metals only during inquiry costing. Copper/aluminium use inquiry header prices.

---

## 6. Inquiry Header — currency

| Field | Storage |
|-------|---------|
| Transaction currency | `CommercialInquiry.currency` |

Controls costing result currency and FX conversion target.

---

## 7. Inquiry Header — copper/aluminium market prices

| Field | Storage |
|-------|---------|
| Copper price | `commercialMetadata.copperPriceRate` |
| Aluminium price | `commercialMetadata.aluminiumPriceRate` |
| Copper UOM | `commercialMetadata.copperPriceUom` |
| Aluminium UOM | `commercialMetadata.aluminiumPriceUom` |

Parsed by `parseInquiryMetalPricing()` in `inquiryMetalPricing.ts`. Missing market-metal inquiry price **blocks** costing (no silent RM master fallback).

---

## 8. Scrap % storage

| Location | Purpose |
|----------|---------|
| `GovernedBomLine.scrapPercentage` | Per-BOM-line scrap rule (primary for costing orchestration) |
| `CostingScrapRule` | Family/scope scrap rules (CU L.V 1.5%, CU M.V / AL M.V UNDER_CREATION) |
| Scrap Excel upload | Writes `GovernedBomLine.scrapPercentage` only — **not** Cable Master |

Scrap is a costing/BOM rule. Current Direct RM Cost **excludes** scrap multiplier.

---

## 9. Excel field mapping

### Cable List / Cable_Master → `CableMaster`

| Excel column | Maps to | Notes |
|--------------|---------|-------|
| Specification Code | `customerCode` | ✓ |
| Item Code | `itemCode` | ✓ |
| Cable Material Number | `materialNumber` | ✓ natural key |
| Eland Item Number | `elandItemNumber` | ✓ |
| Cable Desc / Description | `description` | ✓ |
| Total Cable Weight | `weight` | ✓ |
| Cable Diameter | `diameter` | ✓ |
| Metal | `conductor` | ✓ CU→Copper, AL→Aluminium |
| Family | `family` | ✓ when column present |
| Qty(Meter) | — | **Not imported** — inquiry line quantity |
| Scrap % | — | **Not imported here** — use Costing Configuration BOM Scrap |

### Cable Materials / Cable_BOM → `CableBomLine`

| Excel column | Maps to | Notes |
|--------------|---------|-------|
| Cable Material Number | `cableMaterialNumber` | ✓ |
| Raw Material | `rawMaterialCode` | ✓ |
| Weight / Consumption | `consumption` | ✓ |
| Unit/Km / UOM | `uom` | ✓ |
| Scrap % | `GovernedBomLine.scrapPercentage` | Via BOM Scrap upload only |

### Summary / Costing_Reference

| Excel column | Treatment |
|--------------|-----------|
| Qty Meter | Validation reference quantity (1000 for 10009487) |
| Direct RM Cost (EGP/USD/EUR/GBP) | **Validation targets only** — never imported as prices |

---

## 10. Unmapped / intentionally excluded Excel fields

| Field | Reason |
|-------|--------|
| Summary calculated costs | Outputs — engine must compute independently |
| Qty(Meter) on cable rows | Inquiry/line costing quantity, not Cable Master |
| Premium / Shipping / Clearance in workbook | Costing configuration layers, not Excel import |
| Packing cost | Excluded from Direct RM Cost by design |

---

## Responsibility matrix

| Concern | Owner |
|---------|-------|
| Cable identity & attributes | Import Center → `CableMaster` |
| BOM consumption | Import Center → `CableBomLine` / governance queue |
| Scrap % | Costing Configuration → `GovernedBomLine.scrapPercentage` |
| RM prices | Costing Configuration → `RawMaterialPrice` |
| Exchange rates | Costing Configuration → `CostingExchangeRate` |
| Transaction currency | Inquiry Header → `CommercialInquiry.currency` |
| Market metal prices | Inquiry Header → `commercialMetadata` |
| Direct RM Cost | Costing Engine (calculated) |

---

## Regression validation — cable 10009487

Use `scripts/probeElandFourCables.ts` and inquiry costing with:

- Length: 1000 m (from workbook reference)
- Inquiry copper price set on header
- Compare engine `materialCost` vs Summary sheet (subject to rounding)

Do **not** import Summary values as authoritative prices.

---

## Template workbook structure (Costing Configuration export)

| Sheet | Purpose | Import? |
|-------|---------|---------|
| `Cable_Master` | Reference export of cable identity | No — use Import Center |
| `Cable_BOM` | Scrap % upload (one row per cable) | Yes — Scrap % column only |
| `Costing_Reference` | Validation targets | No — reference only |
| `Instructions` | Human-readable rules | No |
