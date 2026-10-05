# Master Data — Current State Assessment

**Date:** 2026-08-19  
**Status:** Assessment only (this revision documents the repository as it exists *after* Increment 2 master-data architecture and Inquiry/Quotation Increment 1 Home).  
**Instruction honoured:** this document does not constitute Increment 2 coding. No application behaviour is changed by this file.

**Product baseline:** Google AI Studio prototype, CEO-accepted, migrated into this repository. The objective is to **preserve** that product and evolve it — not rebuild from the idea.

**Code truth over older docs:** `docs/ARCHITECTURE.md` and `docs/MASTER_DATA_FOUNDATION.md` describe a NestJS + Prisma target. That stack **is not in this repository**. Verify `package.json`, `server.ts`, and `src/` before planning.

---

## 1. Current architecture

```
Browser (React 19 + Vite)
  ├─ Customer portal (login, dashboard, inquiries/quotes, configurator, drums, TCR)
  ├─ Internal portal (inquiry/quotation home + prototype workspace, costing, import, master data, planning/MES stubs)
  └─ localStorage (tokens, persisted ERP requests, import batches, master-data stores)
           │
           ▼  HTTP JSON (JWT)
Express (server.ts) — port 3847
  ├─ In-memory users (plaintext password field named passwordHash)
  ├─ /api/d365/sync-status, /api/advaris/mes-status (always "connected")
  └─ /api/master-data/import (parse/validate only — does not persist)
```

There is **no** `prisma/` directory, **no** NestJS, **no** PostgreSQL in this repo.

---

## 2. Existing master-data services

| Service / module | Role | Persistence |
|---|---|---|
| `src/services/drumMasterService.ts` | Drum Master get/save/deactivate | `localStorage` `energya_drum_master_v1` |
| `src/services/rawMaterialMasterService.ts` | RM Master; blank price → `PRICE_NOT_CONFIGURED` | `localStorage` `energya_raw_material_master_v1` |
| `src/services/cableCatalogService.ts` | Cable Master catalog (Excel + seed template) | `localStorage` `energya_master_cable_catalog_v3` |
| `src/services/cableBomService.ts` | BOM lines + prototype `RAW_MATERIAL_DICTIONARY` | `localStorage` `energya_cable_boms_v3` |
| `src/services/importPipelineService.ts` | Parse → validate → commit for cables, BOMs, drums, RM | Uses the stores above |
| `src/services/importBatchService.ts` | Import batch audit | `localStorage` `energya_import_batches_v1` |
| `src/services/masterDataQualityService.ts` | Quality KPIs / issues | Derived (no own store) |
| `src/components/internal/MasterDataHub.tsx` | Admin: quality, cables, BOM, RM, drums, Import Center | UI |
| `src/components/internal/MasterDataImport.tsx` | Import Center UI (extended, not replaced) | UI |
| `src/services/cableMasterDataService.ts` | Cable **parameter** masters (families, voltages, …) | `energya_cable_parameter_masters_v1*` |
| `src/services/cableConstraintEngine.ts` | Configurator technical validity | In-memory engine |
| `src/services/cableSelectionService.ts` | Catalog lookup + technical review request | Uses catalog / TCR |
| `src/data/mockData.ts` | Users, `INITIAL_ERP_REQUESTS`, `MASTER_CABLE_CATALOG` seed, prototype drums | Source |
| Costing UI | `CostingPricing.tsx` — LME formula **in React** | Component state / not a second engine file |

**Not in the repository:** `drumCompatibilityService`, `cableMasterService`, `cableBomMasterService`, `masterDataImport.ts`, `costingConfigurationService.ts`, `prisma/`.

**Honest:** Increment 2 **already added** localStorage masters + Import Center commit path. Prototype quotation still does **not** read Drum Master / RM Master for calculation. Dual drum worlds remain. Do not add a third import pipeline.

---

## 3. Existing cable architecture

**There is one Cable Configurator product surface:** `src/components/common/CableConfiguratorModal.tsx`.

It uses:

- `src/services/cableConstraintEngine.ts` (`validateCableConfiguration` — catalog match + physics rules)
- `src/services/cableSelectionService.ts` (parsed catalog lookup)
- Configurator **hub** (must remain one product family, not a second domain): `CableConfiguratorHub.tsx`, `CableConfiguratorModal.tsx` (V1), `cable-configurator/v2/` (V2 + TCR queue)
- `src/data/mockData.ts` — `MASTER_CABLE_CATALOG` (demo seed; Excel import upserts into `cableCatalogService`)
- `src/services/cableMasterDataService.ts` — parameter masters for the configurator

**EXISTING vs unknown cable:** V2 result panel (`CableResultPanelV2`) distinguishes a configuration with no registered material number and offers **Send to Technical Office** (`technicalOfficeServiceV2`). That is **not** the same as a named `isCableFound()` helper (that function does **not** exist). Excel Cable Master rows are in `cableCatalogService` after import; V2 still uses its own catalog/custom-master path until a later approved wiring increment.

`src/components/common/CableSearchSelectModal.tsx` is a **picker**, not a second configurator.

Do **not** create another configurator. Wiring Cable Master Excel into `isCableFound` is a **later increment** and must not fabricate catalog rows.

---

## 4. Existing BOM architecture

| Layer | What it is |
|---|---|
| Prototype line `bomDetails` on ERP request lines | Denormalized snapshot on the quotation/request line |
| Prototype `cableBomService` parsers + `RAW_MATERIAL_DICTIONARY` | Older BOM Excel mapping (still in the same service file as storage) |
| Increment 2 `cableBomService` + `commitBoms` | ENERGYA BOM import: identity, consumption, UOM; **no price invention** in this path; **no PCS→kg conversion** |

These are **not yet one domain**. Target: quotation calculation reads Increment 2 BOM + RM; line snapshot remains an **audit copy**, not a second master.

---

## 5. Existing costing architecture

```
Cable/BOM (today: line snapshot or invented TCR prices)
    → CostingPricing.tsx (LME formula IN REACT)
```

There is **no** `quotationCalculationService.ts` and **no** `costingConfigurationService.ts`. Costing configuration lives in the Costing & Pricing screen. **Do not create a second costing system.** Move LME out of React later. Blank RM prices must stay `PRICE_NOT_CONFIGURED` — never `0`.

Target (not implemented as Nest domain services):

```
Cable Master + Cable BOM + Raw Material + Material Price + Drum + Length
    → COST ENGINE (framework-independent)
    → CalculationResult / Calculation Snapshot
    → PRICING ENGINE
    → PricingResult
    → Quotation line (reference + snapshot)
```

---

## 6. Existing drum architecture

See `docs/DRUM_MASTER_DOMAIN.md`.

**Two identity languages:**

1. Increment 2 **Drum Master** — 103 `EWD*` rows from `Drum List.xlsx` after import.
2. Prototype **production drums** — K/S/P, Wood Reel, steel in `mockData`, `DrumDetailsModal`, `ContainerAndDrumOptimizerModal`, `cuttingLengthValidationService.STANDARD_PRODUCTION_DRUMS`.

**Preserve both.** Automatic winding formula in `calculateDrumCapacityMeters` is **prototype**, not ENERGYA-signed. Mark ENERGYA auto-select `CONFIGURATION_REQUIRED` until engineering signs a rule.

---

## 7. Existing quotation architecture

**One commercial UI family** (do not create a second quotation product):

| Piece | File |
|---|---|
| Home (IQ Increment 1) | `src/components/inquiry-quotation/InquiryQuotationHome.tsx` |
| Workspace (prototype detail) | `src/components/inquiry-quotation/InquiryQuotationWorkspace.tsx` |
| Detail (CEO-accepted) | `src/components/common/ErpCustomerRequestView.tsx` |
| Seed / CRUD | `src/services/inquiryQuotationHomeService.ts` (re-exported as `inquiryQuotationService.ts`) |
| ELAND login | `david.smith@elandcables.com` (`mockUsers.ts` / LoginModal). Sidebar restricts ELAND to Inquiries & Quotes, Configurator, Support |
| TCR / Technical Office | `src/components/cable-configurator/v2/services/technicalOfficeServiceV2.ts` + `TechnicalOfficeTcrQueue.tsx` |

**Missing from seed:** `QT-ELAND-10042` Version 2 OPEN. `INITIAL_ERP_REQUESTS` has no ELAND customer rows (Madkour and other samples). **Do not invent that quotation until approved to add it.**

**Versioning today:** `handleCreateNewVersion` in `ErpCustomerRequestView` increments `versionNo` **on the same record** and sets status `Opened`. Previous version payload is **not** retained as a separate row. CEO rule is non-destructive V1 superseded / V2 new. **Conflict — do not silently change until approved.**

Named prompt files **not in repo:** `InquiryQuotationModule.tsx`, `calculationEngineService.ts`, `pricingEngineService.ts`, `importCenterService.ts`, `customerStatusPolicy.ts`, `transactionStatePolicy.ts`.

---

## 8. Existing import architecture

**Reuse Import Center UI:** `src/components/internal/MasterDataImport.tsx`.

**Single commit pipeline for ENERGYA extracts:** `importPipelineService.ts` (`commitCables`, `commitBoms`, `commitDrums`, `commitRawMaterials`). Kinds: `cables` | `boms` | `drums` | `raw_materials`. **No Drum Compatibility import kind** (and no compatibility service).

Older BOM/cable Excel helpers still live in `cableBomService` / `cableCatalogService` (templates, dictionary). **Do not add a third Import Center.**

Server `/api/master-data/import` does **not** persist. Browser `localStorage` commit is the only ENERGYA master persist today.

---

## 9. Existing validation architecture

| Engine | Use |
|---|---|
| `cableConstraintEngine` | Configurator technical validity vs catalog + physics |
| `importPipelineService` | ENERGYA Excel structural + business rules (blank ≠ 0) |
| `cuttingLengthValidationService` | Length vs **K/S/P** `STANDARD_PRODUCTION_DRUMS` |

Do **not** replace the constraint engine.

---

## 10. Existing data stores

| Store | Kind |
|---|---|
| `src/data/mockData.ts` | Seed users, ERP requests, drums |
| `src/data/cableParameterMasters.ts` | Parameter lists for configurator |
| `localStorage` keys listed in §2 | Prototype + Increment 2 masters |
| Express in-memory users | Auth only |
| `data/source/*.xlsx` / `public/source/*.xlsx` | Official workbooks |

**localStorage is not production persistence.** Document it; do not pretend otherwise.

---

## 11. Current limitations

- No PostgreSQL / Prisma / NestJS.
- Dual drum worlds; dual BOM worlds; dual RM price worlds.
- Cable Master Excel ≠ configurator catalog.
- Costing formula in React.
- Technical Office V2 **invents** `standardPriceUsdPerM` from conductor size when publishing a cable (`technicalOfficeServiceV2` ≈ `size * 0.12 + 15`). Preserve the TCR workflow; do not spread this formula into ENERGYA Excel costing. Missing RM price remains `PRICE_NOT_CONFIGURED`.
- Quotation version overwrite.
- ELAND V2 sample missing.
- D365/Advaris APIs are stubs.
- UI permissions ≠ server authorization.
- Drum List units not in the file.
- 83 BOM duplicate cable+RM pairs in Excel.
- RM vs BOM UOM conflict (end caps kg vs PCS).
- All 74 RM prices blank.

---

## 12. Duplicate / parallel implementations

| Topic | Parallel pieces | Rule |
|---|---|---|
| Import | `importPipelineService` vs older parse helpers in `cableCatalogService` / `cableBomService` | One Import Center UI; do not add another |
| Drums | EWD Master vs K/S/P / optimizer catalogs | Preserve both until wiring approved |
| Cable identity | Seed `MASTER_CABLE_CATALOG` vs imported Excel catalog vs V2 custom params | One Cable Master later; do not split the configurator |
| RM prices | Costing LME screen vs RM Master (`PRICE_NOT_CONFIGURED`) | One effective price later |
| Inquiry list | Home grid vs `ErpCustomerRequestView` internal list | Home is the list entry; detail stays the prototype view |

---

## 13. Recommended target architecture

See `docs/MASTER_DATA_RELATIONSHIP_MODEL.md` and `docs/PHASE_1_BACKEND_FOUNDATION_ASSESSMENT.md`.

Frontend stays React. Persistence later: NestJS + Prisma + PostgreSQL. Domain services must not call D365. Do **not** start that migration until this assessment is approved and Increments 3–14 of the master-data sequence are sequenced with quotation work.

---

## 14–30. Drum, relationships, quality, audit, migration

Covered in:

- `docs/DRUM_MASTER_DOMAIN.md` (§14–17, 23–26 drum-specific)
- `docs/MASTER_DATA_RELATIONSHIP_MODEL.md` (§18–22, 27–30, Mermaid)

---

## Files inspected (this revision)

`package.json`, `server.ts`, `src/App.tsx`, `src/data/mockData.ts`, `src/data/mockUsers.ts`, `src/data/cableParameterMasters.ts`, `src/types.ts`, `src/services/inquiryQuotationHomeService.ts`, `src/services/importPipelineService.ts`, `src/services/importBatchService.ts`, `src/services/drumMasterService.ts`, `src/services/rawMaterialMasterService.ts`, `src/services/cableCatalogService.ts`, `src/services/cableBomService.ts`, `src/services/masterDataQualityService.ts`, `src/services/cableConstraintEngine.ts`, `src/services/cableSelectionService.ts`, `src/services/cuttingLengthValidationService.ts`, `src/components/common/ErpCustomerRequestView.tsx`, `src/components/common/CableConfiguratorModal.tsx`, `src/components/common/DrumDetailsModal.tsx`, `src/components/common/ContainerAndDrumOptimizerModal.tsx`, `src/components/inquiry-quotation/*`, `src/components/internal/MasterDataHub.tsx`, `src/components/internal/MasterDataImport.tsx`, `src/components/internal/CostingPricing.tsx`, `src/components/cable-configurator/**`, `data/source/Drum List.xlsx`, `data/source/Energya Cable Master Data.xlsx`, `data/source/Raw Material List.xlsx`.

**Not present:** `prisma/`, NestJS, `/mnt/data/Drum List.xlsx` (workbooks live under `data/source/` and `public/source/`). Prompt-named files such as `InquiryQuotationModule.tsx`, `calculationEngineService.ts`, `pricingEngineService.ts`, `importCenterService.ts`, `customerStatusPolicy.ts` are also absent.
