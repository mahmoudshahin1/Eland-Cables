# Final Data Model — Authoritative vs Leftover

**Date:** 2026-08-25  
**Source of truth:** `prisma/schema.prisma` and migrations under `prisma/migrations/` (21 SQL folders including Inc 14 formula assignment and costing document sequence).  
**Rule:** Additive migrations only. No `migrate reset` in this program. Official Excel is import input, not a second database.

---

## How to read this document

| Tag | Meaning |
|-----|---------|
| **AUTHORITATIVE** | Production persist and/or gates. |
| **ADAPTER / HISTORICAL** | Still written or read; not inquiry snapshot SoT. |
| **SCHEMA AHEAD OF UI** | Table exists; inquiry/report UX does not fully consume it. |
| **LEFTOVER CLIENT** | Browser `localStorage` models that duplicate Prisma. |

---

## Identity and tenancy — AUTHORITATIVE

`UserAccount`, `Role`, `Permission`, `RolePermission`, `UserRole`, `UserSession`, `PasswordResetTicket`, `Customer`, `CustomerUser`, `CustomerMigrationException`.

Live login uses `identityAuthRoutes` against these tables. `server.ts` `mockDbUsers` is leftover process memory and is **not** the identity model.

---

## Cable, engineering, BOM, drums, import — AUTHORITATIVE

| Model | Role |
|-------|------|
| `CableParameter` | Parameter dictionary |
| `CableMaster` | Cable identity (ELAND materials live here when imported) |
| `CableEngineeringMapping` | TO mapping workflow; persist costing requires APPROVED |
| `CableBomLine` | Source BOM from Cable Materials sheet |
| `GovernedBomLine` | Published BOM for costing when governance requires it |
| `BomDuplicateObservation` | Conflicts (e.g. BOM-CONF-*) |
| `RawMaterial` | Official RM list (prices on list often blank) |
| `RawMaterialPrice` | Governed price versions; DRAFT ≠ published |
| `DrumMaster`, `DrumCompatibility` | Drum catalog / fit |
| `ImportBatch`, `ImportBatchRow` | Import Center preview/commit |
| `TechnicalOfficeRequest` | TCR queue |
| `ParameterCompatibility` | Configurator compatibility |
| `AuditEvent` | Server audit |

**Leftover client:** `cableCatalogService`, `cableBomService`, `rawMaterialMasterService`, `drumMasterService`, `importBatchService` keyed in `localStorage`. Master Data Hub quality tab still reads them.

---

## Commercial inquiry / quotation — AUTHORITATIVE

| Model | Role |
|-------|------|
| `CommercialInquiry` | Header, versions (`isCurrent`, `supersedesInquiryId`), `commercialMetadata` JSON |
| `CommercialInquiryLine` | Cable line; `costingCalculationId`, `costingReadinessStatus`, quantities, `drumType` |
| `CommercialQuotation`, `CommercialQuotationLine` | Quotation; line copies `costingCalculationId` |
| `CustomerPricingTier`, `CommercialPricingRule`, `CommercialDiscountRule`, `CommercialPricingSnapshot` | Selling price — **not** manufacturing cost |

---

## Costing configuration and execution

### AUTHORITATIVE (config)

`CostingConfiguration`, `CostingConfigurationVersion`, `CostingVariable`, `CostingComponent`, `CostingFormula`, `CostingFormulaVersion`, `CostingFormulaDependency`, `CostingScrapRule`, `CostingDocumentSequence`, `CostingExchangeRate`, `CostingMetalRate`, `CostingLogisticsRule`, `CostingPackingRule`.

Inc 14: formula `assignmentScope` / `assignmentValue` / `assignmentPriority` on formulas (see migration `20260823120000_increment14_formula_assignment`).

### AUTHORITATIVE (inquiry snapshot)

`CostingCalculation`, `CostingCalculationSnapshot` — written when `executeCostingForInquiryLine` persist=true and status READY.

### ADAPTER / HISTORICAL

`CostingRun`, `CostingLine` — Increment 10 contract. Still created by `executeCostingRun` (`POST /api/costing/calculate`). Comment on `CostingRun.configurationVersionId`: null = legacy material-only run. **Do not delete.** Do not use as the inquiry reopen SoT (`CommercialInquiryLine.costingCalculationId` is).

---

## Low-code platform — SCHEMA AHEAD OF UI

| Model | Intended | Actual consumption |
|-------|----------|-------------------|
| `PlatformFieldDefinition` | Per-entity field grid | Inquiry uses `inquiryFieldManifest.ts` + localStorage prefs |
| `NotificationRule` | Event routing | SMTP helper + in-app toasts; rules API exists |
| `ReportDefinition` | Controlled reports (no arbitrary SQL) | `ReportsAnalytics.tsx` is mock charts |

---

## Enums that encode honesty (do not “fix” by inventing data)

- `PriceStatus`: `CONFIGURED` \| `PRICE_NOT_CONFIGURED`
- Costing run / calculation statuses including incomplete / not ready
- Extension layer statuses in JSON: `NOT_CONFIGURED` vs `CONFIGURED`
- `CostingConfigStatus` workflow DRAFT → SUBMITTED → APPROVED → ACTIVE

---

## What is not a Prisma model (and must not be treated as one)

- ELAND cost sheet Excel (`data/regression/ELAND Cost Sheet Required.xlsx`) — regression reference only.
- `INITIAL_SALES_ORDERS`, production orders, AR transactions in `mockData.ts`.
- Navbar notification array.
- D365/Advaris JSON from `server.ts`.

---

## Migration inventory (applied history — do not rewrite)

Increment 2 master data through Increment 14 formula assignment and `20260824160000_costing_document_sequence`. Inc 13 includes costing configuration, scrap workflow, inquiry costing, FX, quotation snapshot, low-code consolidation (`20260822170000_final_consolidation_low_code_config`).

Inc 14 acceptance report (2026-08-24) recorded 20 migrations applied; a later document-sequence migration exists in the tree — operators should run **read-only** `prisma migrate status` before any deploy, never reset.
