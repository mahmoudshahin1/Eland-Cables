# TASK 05F — V2 Quotation + Technical/Commercial Offer — Implementation Readiness

**Date:** 2026-09-05  
**Base commit:** `12702c1` (frozen Tasks 05B–05E)  
**Status:** **READINESS ONLY — NOT production-ready; no implementation in this task**  
**Prior:** Task 05A (`docs/v2/34_V2_CABLE_CONFIGURATION_PRODUCTION_READINESS.md`), Task 05B (`docs/v2/35_V2_INQUIRY_CONFIGURATION_PERSISTENCE.md`), Task 05C cutting-length, Task 05D drum plan, Task 05E (`docs/v2/TASK05E_READINESS.md` + V2 costing/commercial-pricing preview)

---

## Executive summary

The platform has a **live V1 quotation stack** (`CommercialQuotation` / `CommercialQuotationLine`, Increment 11–12 pricing, Phase 1 fulfillment) but **no V2-aware quotation boundary**. V2 inquiry work stops at **commercial pricing preview** (`previewV2CommercialPricing`); there is **no** V2 quotation create, **no** V2 lineage pins on quotation lines, **no** governed technical/commercial offer issuance, and **no** PDF generation service.

**Critical business rule (design anchor):**

> An **issued** quotation must **never** dynamically recalculate selling price, material cost, drum schedule, BOM consumption, or market-metal inputs from current master data. All customer-facing and fulfillment-facing values must come from **immutable snapshots** captured at issue (or earlier freeze points that are copied forward at issue).

**Target chain:**

```text
V2 Inquiry → Config Snapshot → Cutting Plan → CONFIRMED Drum Plan → V2 Costing Run → Commercial Pricing Snapshot → Quotation (Technical + Commercial Offer)
```

**Readiness verdict:** V2 Quote-to-Cash **cannot** truthfully issue a reproducible commercial offer today. Upstream gates (81 BOM conflicts, Decision 5 unsigned, V2 costing blocked on governed cables) remain **hard blockers** per Task 05E. Quotation implementation must **not weaken** those gates.

---

## 1. Current State

### 1.1 V1 vs V2 separation today

| Dimension | V1 (legacy inquiry) | V2 (`commercialMetadata.workflowChannel = 'V2_CONFIGURATION'`) |
|-----------|---------------------|----------------------------------------------------------------|
| Inquiry API | `/api/inquiries/*` (`commercialRoutes.ts`) | `/api/v2/inquiries/*` (`v2InquiryConfigurationRoutes.ts`) |
| Configuration | `configurationPayload` JSON on line | `V2ConfigurationSnapshot` (immutable, versioned) |
| Cutting | `cuttingLengthMeters`, `drumSchedule` JSON | `V2CuttingLengthPlan` |
| Drum | `drumType`, legacy schedule | `V2DrumPlan` + `V2DrumPlanLine`; `DrumPlanHandoffDto` |
| Costing | `buildCostingRequestFromInquiryLine` → legacy scalars | `v2CostingRunRepository` + `workflowChannel = 'V2_CONFIGURATION'` on `CostingCalculation` |
| Commercial pricing | `priceQuotation()` on V1 quotation lines | `previewV2CommercialPricing()` only — **no persist to quotation** |
| Quotation create | `createQuotationFromInquiry()` — **same path for all inquiries** | **No branch** — copies V1 scalars only |
| Inquiry numbering | `QUO-${stamp}-${rand}` ad hoc | V2 inquiry uses `NumberSequence` `INQ_COMMERCIAL` |
| Quotation numbering | `QUO-${stamp}-${rand}` ad hoc | **Not wired** to `NumberSequence` |

`isV2InquiryMetadata()` — `src/domain/v2InquiryWorkflow.ts` L22–25 — is the runtime discriminator. **Quotation code does not call it.**

### 1.2 Prisma — quotation & commercial models (existing)

| Model | Key fields | Role today |
|-------|------------|------------|
| `CommercialInquiry` | `inquiryNumber`, `status`, `currency`, `commercialMetadata`, `versionNo`, `isCurrent` | Shared header for V1/V2 |
| `CommercialInquiryLine` | `materialNumber`, legacy drum/cutting, `costingCalculationId`, `costingRunId`, `materialCost`, `v2CurrentSnapshotId`, `v2CurrentCuttingPlanId`, `v2CurrentDrumPlanId` | Mixed pointers; quotation ignores V2 pointers |
| `CommercialQuotation` | `quotationNumber`, `versionNo`, `isCurrent`, `status` (`QuotationStatus`), `commercialPricingStatus`, `commercialApprovalStatus`, `fulfillmentType`, `validUntil`, `materialCostTotal`, `sellingPrice` | Increment 11 header |
| `CommercialQuotationLine` | `inquiryLineId`, scalar snapshots (`cuttingLengthMeters`, `drumType`, …), `costingRunId`, `costingCalculationId`, `materialCost`, `pricingSnapshotId`, `sellingPrice` | Increment 11/12/13 line |
| `CommercialPricingSnapshot` | `costingRunId`, `v2CostingCalculationId?`, `drumPlanId?`, frozen rule + prices | Created by `priceQuotation()` — **V2 FKs not populated** |
| `CostingCalculation` | `inputSnapshot`, `referenceSnapshot`, `outputSnapshot`, V2 FKs (`configurationSnapshotId`, `cuttingLengthPlanId`, `drumPlanId`, `workflowChannel`) | Lineage pins (migration `20260906130000_v2_costing_lineage`) |
| `CostingRun` | `materialCost`, `costingLines[]`, `drumPlanId?`, `inquiryLineId?` | Engineering cost snapshot |
| `CommercialCommitment` | `quotationId`, `quotationVersionNo`, `fulfillmentType`, `d365DocumentNumber?` | Post-approval bridge (Phase 1) |

**Enums (quotation-relevant):**

- `QuotationStatus`: `DRAFT` \| `OPEN` \| `SUBMITTED` \| `ACCEPTED` \| `REJECTED` \| `SUPERSEDED` \| `CANCELLED`
- `CommercialApprovalStatus`: `NOT_SUBMITTED` \| `PENDING_APPROVAL` \| `APPROVED` \| `REJECTED` (spec commercial approval — **separate** from `CommercialPricingStatus`)
- `CommercialPricingStatus`: `PRICING_NOT_CONFIGURED` … `PRICING_APPROVED` \| `PRICING_EXPIRED` \| …

There is **no** `ISSUED`, `READY_FOR_APPROVAL`, or quotation-level `APPROVED` in `QuotationStatus` today.

### 1.3 V1 quotation path (production for legacy)

```text
CommercialInquiryDetail → generateQuotationFromInquiry()
  → POST /api/inquiries/:id/quotation
  → createQuotationFromInquiry (commercialRepository.ts L1032–1147)
  → CommercialQuotation V1 status OPEN, inquiry → QUOTED
  → (optional) POST /api/quotations/:id/price → priceQuotation()
  → CommercialPricingSnapshot per line
  → (optional) submit/approve-pricing → PRICING_APPROVED
  → (optional) commercial-approve → commercialApprovalStatus APPROVED + fulfillmentType
  → CommercialCommitment / EpcSalesOrder / SalesAgreement
```

**`createQuotationFromInquiry` gaps for V2:**

- No readiness gate (does not require `READY_FOR_QUOTATION`, CONFIRMED drum, or V2 costing)
- Copies `lengthMeters` from `requestedLengthMeters` — **not** `DrumPlanHandoffDto.totalPlannedLengthM`
- Copies `cuttingLengthMeters`, `drumType` — **not** `V2CuttingLengthPlan` / `V2DrumPlan`
- Does **not** set `configurationId`, `bomVersion`, `engineeringRevision`, `technicalSpecificationId` on lines (fields exist on schema L1074–1077 but are unused in create)
- Does **not** populate `CommercialPricingSnapshot.v2CostingCalculationId` or `drumPlanId`
- Sets inquiry `status = QUOTED` immediately on create — **before** pricing or approval

### 1.4 V2 upstream state (05B–05E at base commit)

| Stage | Implementation | Quotation consumption |
|-------|----------------|----------------------|
| Config snapshot | `V2ConfigurationSnapshot` + API | **Not copied** to quotation line |
| Cutting plan | `V2CuttingLengthPlan` | **Not copied** |
| Drum plan | `V2DrumPlan` CONFIRMED + handoff API | **Not copied** |
| Costing | `POST .../costing-runs/calculate` | Pins on `CostingCalculation`; copied to quotation only via `costingCalculationId` if inquiry line updated |
| Commercial pricing | `POST .../commercial-pricing/preview` | **Preview only** — `v2CommercialPricingService.ts` |

### 1.5 Technical Offer vs Commercial Offer (current)

| Offer type | What exists | Authority |
|------------|-------------|-----------|
| **Technical Offer** | `CommercialInquiryLineAttachment` with `kind = 'TECHNICAL_OFFER'` (`inquiryLineAttachments.ts`); UI tab in `CommercialInquiryDetail.tsx` | **Attachments on inquiry line** — not quotation-scoped; not auto-generated |
| **Commercial Offer** | `CommercialQuotation` + priced lines + `CommercialPricingSnapshot` | **Quotation revision** — but no PDF service; customer portal references mock PDF names in `ErpCustomerRequestView.tsx` |

TCR: `TechnicalOfficeRequest` model (schema L459–475) + `technicalOfficeRequestId` on inquiry line — used when cable not in master; **not** linked to quotation issuance.

### 1.6 Customer portal & visibility

- `commercialProjection.ts`: customers **never** see `materialCost`, `costingRunId`, `costingCalculationId` on inquiry lines; quotations strip `materialCostTotal`, `sellingPrice`, `commercialPricingStatus`
- `GET /api/quotations/:id/costing` — internal only (`getQuotationCosting` + RBAC); customers get `UNAUTHORIZED`
- `canViewCostBreakdown(actor)` — customer may see breakdown only with `costingPricing` or `salesQuotations` permission

### 1.7 Numbering & workflow infrastructure

| Mechanism | Quotation usage |
|-----------|-----------------|
| `NumberSequence` | V2 inquiries: `INQ_COMMERCIAL`; **no `QUO_COMMERCIAL` sequence** |
| Quotation numbers | `QUO-${YYYYMMDD}-${rand}` in `createQuotationFromInquiry` L1056–1058 |
| `v2InquiryWorkflow` | Inquiry status machine only — **no quotation status machine** |
| Audit | `appendAudit` + `auditEvent` on quotation create/revise/price; V2 costing uses `appendServerAudit` — **quotation paths do not** |

### 1.8 Tests (existing)

| File | Relevance |
|------|-----------|
| `src/server/increment12.pricing.test.ts` | Pricing snapshots, approval, revision immutability (Tests 17–30) |
| `src/server/increment11.commercial.test.ts` | Inquiry → quotation create |
| `src/server/phase1.quoteToCash.test.ts` | Commitment, SO, agreement, immutability, D365 placeholders |
| `src/domain/v2CostingRunService.test.ts` | V2 costing lineage (not quotation) |
| `src/services/inquiryQuotationHomeService.test.ts` | Home list mapping |

**No** `v2Quotation*.test.ts` exists.

### 1.9 Production-readiness verdict (current)

| Layer | Verdict |
|-------|---------|
| V1 quotation create/revise/pricing | **Live** — Increment 11–12 |
| V1 fulfillment handoff | **Live** — Phase 1 (`CommercialFulfillmentPanel`) |
| V2 quotation boundary | **MISSING** |
| Immutable V2 lineage on quotation | **MISSING** |
| Technical offer issuance | **Partial** — manual attachments only |
| Commercial offer PDF / issue | **NOT_IMPLEMENTED** |
| End-to-end V2 Quote-to-Cash | **NOT production-ready** |

---

## 2. Target State

### 2.1 V2 quotation production boundary

```text
CommercialInquiry (workflowChannel=V2_CONFIGURATION, status≥READY_FOR_COMMERCIAL)
  └── per line readiness bundle (frozen refs):
        V2ConfigurationSnapshot (id, snapshotId, versionNo)
        V2CuttingLengthPlan (id, planId, versionNo)
        V2DrumPlan (id, planId, versionNo, lifecycleStatus=CONFIRMED)
        CostingCalculation + CostingRun (workflowChannel=V2_CONFIGURATION, status LOCKED)
        CommercialPricingSnapshot (materialCost + rule + selling price)
  └── CommercialQuotation (versioned)
        ├── TechnicalOfferBundle (per line: attachment refs + engineering summary snapshot)
        └── CommercialOfferBundle (header terms + priced lines + validity)
  └── Issue event → immutable ISSUED revision; no master-data recompute on read/PDF/portal
```

### 2.2 Non-goals (frozen — do not implement in 05F)

- Change `costingEngine.ts` / `costingEngine.test.ts` (Decision 5 / Direct RM)
- Resolve 81 BOM conflicts or bypass Gate 2
- Drum Master / optimization algorithm changes
- V1 configurator enhancements
- Commercial Fulfillment WIP behavior changes (beyond quotation snapshot inputs)
- D365 sync implementation
- Live PDF rendering engine (design + attachment contract only)

### 2.3 Success criteria (05F implementation follow-on)

1. V2 quotation **cannot** be created without per-line V2 readiness bundle (see §9)
2. Issued quotation **answers**: *which config, cutting, drum, costing, pricing produced this offer?*
3. Changing RM prices, metal header, drum master, or pricing rules **after issue** does not change issued quotation display or PDF inputs
4. Customer portal shows **commercial** prices only; internal users see material cost + lineage
5. Revision creates new `versionNo`; prior issued versions remain **read-only**
6. `appendServerAudit` on create, price, approve, issue, revise

---

## 3. V2 Quotation Model

### 3.1 Reuse vs extend (recommended: extend existing tables)

**Do not** introduce a parallel `V2CommercialQuotation` aggregate. Branch on `inquiry.commercialMetadata.workflowChannel` and enrich `CommercialQuotation` / `CommercialQuotationLine`.

### 3.2 Proposed header extensions (`CommercialQuotation`)

| Field | Type | Purpose |
|-------|------|---------|
| `workflowChannel` | `String?` | `'V2_CONFIGURATION'` \| null (V1) |
| `issuedAt` | `DateTime?` | Customer issue timestamp |
| `issuedBy` | `String?` | Actor label |
| `issueSnapshotId` | `String?` | FK or logical id to header `issueSnapshot` JSON row |
| `technicalOfferStatus` | `String` | `NOT_READY` \| `READY` \| `ISSUED` |
| `commercialOfferStatus` | `String` | Align with pricing + approval composite |
| `inquiryVersionNo` | `Int?` | Pin inquiry revision at quotation create |
| `inquirySnapshot` | `Json?` | Frozen header commercial terms (currency, incoterms, metal rates + sources) |

**Alternative (minimal first slice):** store composite state in `remarks` / `commercialMetadata` on quotation — **not recommended** for audit; prefer explicit columns or child `CommercialQuotationIssueSnapshot` table.

### 3.3 Proposed line extensions (`CommercialQuotationLine`)

| Field | Type | Purpose |
|-------|------|---------|
| `workflowChannel` | `String?` | V2 discriminator |
| `v2ConfigurationSnapshotId` | `String?` FK | Config evidence |
| `v2ConfigurationSnapshotIdString` | `String?` | Human ref (`SNAP-…`) |
| `v2CuttingLengthPlanId` | `String?` FK | Cutting evidence |
| `v2CuttingLengthPlanIdString` | `String?` | Human ref |
| `v2DrumPlanId` | `String?` FK | Drum evidence |
| `v2DrumPlanVersionNo` | `Int?` | Version pin |
| `v2DrumPlanIdString` | `String?` | Human ref |
| `plannedLengthM` | `Decimal?` | From handoff `totalPlannedLengthM` |
| `drumCount` | `Int?` | From handoff |
| `technicalOfferAttachmentIds` | `Json?` | Array of `CommercialInquiryLineAttachment.id` at issue |
| `technicalSummarySnapshot` | `Json?` | Frozen `summaryDescription`, diameter, weight, selections hash |
| `drumPlanLinesSnapshot` | `Json?` | Copy of `DrumPlanHandoffDto.lines` at issue |
| `lineageSnapshot` | `Json?` | Denormalized lineage answer for PDF/portal |

Existing fields **retain** meaning:

- `costingCalculationId` / `costingRunId` — engineering pins (required V2)
- `pricingSnapshotId` — commercial pin (required before issue)
- `materialCost` / `sellingPrice` — frozen scalars for list views (must match snapshots)

### 3.4 Quotation line model (logical)

Each `CommercialQuotationLine` for V2 is a **commercial document line** that references (does not replace) upstream evidence:

```text
CommercialQuotationLine
  ├── inquiryLineId (soft link — inquiry may revise later)
  ├── V2 lineage FKs (immutable pins)
  ├── CostingCalculation (immutable)
  ├── CommercialPricingSnapshot (immutable after issue)
  └── Display scalars (copied at create/issue for query performance)
```

---

## 4. Technical Offer

### 4.1 Definition

The **Technical Offer** is the customer-facing engineering package: cable identity, configuration summary, cutting lengths, drum schedule, datasheets, cross-section / specification attachments. It is **not** the price.

### 4.2 Current building blocks

| Asset | Path |
|-------|------|
| Attachment kind | `TECHNICAL_OFFER` — `src/domain/inquiryLineAttachments.ts` |
| Required check | `lineHasRequiredTechnicalOffer()` — mapped cables expected to have offer |
| UI | `CommercialInquiryDetail` tab `technical_offer`; `InquiryLineAttachmentsCell` |
| Cable master default | `CableMasterAttachment` → copied to line attachment |
| Report Tailor | `ATTACHMENT_SOURCE_REPORT_TAILOR` (future auto-gen) |

### 4.3 Target Technical Offer structure (per quotation line)

| Section | Source at issue | Snapshot strategy |
|---------|-----------------|-------------------|
| Cable identity | `V2ConfigurationSnapshot.cableMaterialNumber`, `itemCode`, `customerCode` | Copy scalars + FK |
| Configuration summary | `summaryDescription`, `selections`, `estimatedDiameterMm`, `estimatedWeightKgKm` | `technicalSummarySnapshot` JSON |
| Cutting | `V2CuttingLengthPlan` nominal/min/max/tolerance | FK + copy scalars to `cuttingLengthMeters`, `numberOfCuts` |
| Drum schedule | `DrumPlanHandoffDto.lines` | `drumPlanLinesSnapshot` JSON + `drumCount` |
| Datasheets / drawings | `CommercialInquiryLineAttachment` | `technicalOfferAttachmentIds[]` |
| Engineering governance | `engineeringStatus`, `bomVersion` (from costing ref) | In `lineageSnapshot` |
| TCR reference | `technicalOfficeRequestId` on inquiry line | Scalar copy if present |

### 4.4 Technical Offer readiness gate

Before quotation **issue**:

1. Each V2 line has `validationStatus` / `engineeringStatus` acceptable per 05A gates (not `ENGINEERING_BLOCKED`)
2. `lineHasRequiredTechnicalOffer(attachments)` **or** explicit waiver flag (PO decision)
3. CONFIRMED `V2DrumPlan` with `validationStatus` passing
4. BOM Gate 2 — **no** open `BOM-CONF-*` for governed material (same as costing)

### 4.5 Technical Offer vs inquiry attachments

Inquiry attachments **can change** after quotation draft. At **ISSUE**, copy attachment **ids + file metadata hash** (fileName, byteSize, capturedAt) into quotation line snapshot so issued offer remains stable even if inquiry attachment is replaced later.

---

## 5. Commercial Offer

### 5.1 Definition

The **Commercial Offer** is the priced quotation: currency, validity, payment/delivery terms, line quantities, unit/total selling prices, discounts, taxes (when implemented). It **must not** expose raw material unit prices to customers by default.

### 5.2 Current commercial stack

| Step | Function | Output |
|------|----------|--------|
| Material cost | V2 costing / V1 inquiry costing | `CostingRun.materialCost` |
| Selling price | `calculateCommercialSellingPrice` (`commercialPricingEngine.ts`) | `CommercialPricingSnapshot` |
| Header total | `priceQuotation` | `CommercialQuotation.sellingPrice` |
| Approval | `approveQuotationPricing` | `PRICING_APPROVED` on snapshot |
| Commercial approval | `approveCommercialQuotation` (`commercialCommitmentRepository.ts`) | `commercialApprovalStatus = APPROVED`, `fulfillmentType` |

### 5.3 Target Commercial Offer structure

**Header (`CommercialQuotation`):**

- `quotationNumber`, `versionNo`, `validUntil`, `currency`
- `incoterms`, `paymentTerms`, `deliveryTerms`, `billTo`, `shipTo`
- `requestedDeliveryDate`, `contactPerson`, `customerName`
- `sellingPrice` (total), `commercialPricingStatus`, `commercialApprovalStatus`
- `inquirySnapshot` — frozen metal rates: `copperPriceRate`, `aluminiumPriceRate`, sources (`INQUIRY_SYSTEM_DEFAULT` / `OVERRIDE`)

**Line (`CommercialQuotationLine` + `CommercialPricingSnapshot`):**

- Quantity: `quantity`, `quantityUom`, `plannedLengthM` (V2) or `lengthMeters` (V1)
- Commercial: `unitSellingPrice`, `finalSellingPrice`, `discountPercentage`, `discountAmount`
- Internal only: `materialCost`, `costingRunId`, `pricingRuleId`, lineage FKs

### 5.4 V2 commercial pricing persist (missing)

Design new `persistV2QuotationPricing(quotationId, actor)` (or extend `priceQuotation`):

1. Assert each line has `workflowChannel=V2` pins
2. Read `materialCost` from pinned `CostingRun` — **never** recalculate Direct RM
3. Populate `CommercialPricingSnapshot.v2CostingCalculationId` and `drumPlanId`
4. Store rule revision snapshot (already done for V1)

`previewV2CommercialPricing` (`v2CommercialPricingService.ts`) is the **template** for calculation; quotation persist must mirror it with snapshot writes.

---

## 6. Versioning

### 6.1 Existing model (keep)

- `@@unique([quotationNumber, versionNo])` on `CommercialQuotation`
- `isCurrent` flag; prior version `SUPERSEDED`
- `supersedesQuotationId` chain
- `createQuotationRevision` — copies lines, resets pricing approval, **preserves** `costingCalculationId` on lines (L1227–1228)

Docs: `docs/QUOTATION_VERSIONING.md`, `docs/COSTING_QUOTATION_SNAPSHOT.md`

### 6.2 V2 versioning rules

| Event | Behavior |
|-------|----------|
| New quotation from inquiry | `versionNo = 1`, new `quotationNumber` (governed sequence) |
| Reprice same draft revision | Allowed **only** if not `ISSUED` / not `commercialApprovalStatus=APPROVED` |
| Revise after issue | `createQuotationRevision` → V(N+1); V(N) immutable including pricing snapshots |
| Inquiry engineering change | Does **not** mutate issued quotation; requires new quotation revision with new V2 pins |
| Superseded issued quotation | Status `SUPERSEDED`; portal shows only current unless viewing history |

### 6.3 Issued revision immutability

Once `issuedAt` is set (or `status` mapped to ISSUED — §8):

- **No** `priceQuotation` upsert on lines
- **No** line quantity/drum edits
- **No** attachment rebinding
- Changes require **new** `versionNo`

Existing guard: `commercialApprovalStatus === 'APPROVED'` blocks repricing (`priceQuotation` L296–302). **Extend** to issued + V2 lineage lock.

---

## 7. Snapshot/Lineage Strategy

### 7.1 Minimum immutable snapshot (reproducibility contract)

To reproduce an **issued** offer without reading live master data:

| Domain | Minimum pin | Where stored today | V2 quotation target |
|--------|-------------|-------------------|---------------------|
| Inquiry header | `inquiryId`, `inquiryVersionNo`, commercial terms + metal snapshot | Live inquiry row | `CommercialQuotation.inquirySnapshot` JSON |
| Inquiry line | `inquiryLineId`, line number | FK on quotation line | Keep FK (informational) |
| Configuration | `V2ConfigurationSnapshot.id`, `snapshotId`, `versionNo`, `selections` | Table immutable | FK + `technicalSummarySnapshot` |
| Cutting | `V2CuttingLengthPlan.id`, `planId`, `versionNo` | Table immutable | FK + scalars |
| Drum | `V2DrumPlan.id`, `planId`, `versionNo`, `lifecycleStatus=CONFIRMED`, `engineeringSnapshot` | Table + JSON | FK + `drumPlanLinesSnapshot` |
| Costing | `CostingCalculation.id`, `calculationNumber`, snapshots | `inputSnapshot` / `referenceSnapshot` / `outputSnapshot` | FK + rely on calculation snapshots |
| Costing run | `CostingRun.id`, `costingRunNumber`, `CostingLine[]` | Table | FK `costingRunId` |
| RM prices | `referenceSnapshot.rawMaterialPriceIds`, per-line `priceId` | On calculation | Copied into `lineageSnapshot` |
| Market metal | `inputSnapshot.metalPricingSnapshot` | On calculation | Copied into `inquirySnapshot` |
| BOM | `bomVersion`, `governedBomLineIds` in reference | Partial | Full copy in `lineageSnapshot` |
| Commercial pricing | `CommercialPricingSnapshot` row | Per quotation line | Required before issue |
| Pricing rule | `pricingRuleId`, `pricingRuleRevision`, `percentageValue` | On snapshot | Already frozen |
| Technical docs | Attachment ids + metadata | Inquiry line attachments | `technicalOfferAttachmentIds` |

**Rule:** PDF generation, customer portal, and D365 handoff read **only** quotation-scoped snapshots + referenced immutable upstream rows (by id). They **must not** call costing engine, pricing engine, drum optimizer, or master price APIs for issued documents.

### 7.2 References vs snapshots

| Data | Strategy |
|------|----------|
| Immutable upstream tables (`V2*`, `CostingCalculation`, `CostingRun`, `CommercialPricingSnapshot`) | **Reference by FK** — rows never updated in place |
| Inquiry header terms | **Snapshot JSON** on quotation (inquiry row mutates) |
| Attachment binary | **Reference attachment id**; if file replaced, issued quotation keeps original via snapshot metadata / copy-on-issue (PO: copy bytes vs pin id) |
| Display scalars on quotation line | **Copy at create/issue** for list performance |
| Drum/cutting display | **Copy handoff DTO JSON** at issue |

### 7.3 Lineage question (must be answerable)

> Which exact configuration, BOM, drum plan, RM prices, and pricing rule produced this quoted price?

**API (design):** `GET /api/v2/quotations/:id/lineage` or extend `GET /api/quotations/:id/costing` with V2 fields.

---

## 8. Lifecycle

### 8.1 Target lifecycle (business)

```text
DRAFT
  → READY_FOR_APPROVAL
    → APPROVED (commercial)
      → ISSUED (to customer)
        → (optional) ACCEPTED | REJECTED | EXPIRED
```

Revision from any post-DRAFT state → new `versionNo`, prior revision frozen.

### 8.2 Mapping to existing schema (recommended)

| Business state | Implementation mapping |
|----------------|------------------------|
| **DRAFT** | `QuotationStatus.OPEN` + `commercialPricingStatus = NOT_CONFIGURED` or draft pricing |
| **READY_FOR_APPROVAL** | `commercialPricingStatus = PRICING_APPROVAL_REQUIRED` **or** `commercialApprovalStatus = PENDING_APPROVAL` |
| **APPROVED** | `commercialPricingStatus = PRICING_APPROVED` **and** `commercialApprovalStatus = APPROVED` |
| **ISSUED** | New: `issuedAt != null` **or** extend enum with `ISSUED`; set `QuotationStatus.SUBMITTED` (legacy) |
| **EXPIRED** | `validUntil < now()` → `CommercialPricingStatus.PRICING_EXPIRED` (read-time or batch) |
| **REVISED** | Prior: `SUPERSEDED`; new: `OPEN` (draft cycle restarts) |
| **ACCEPTED / REJECTED** | Existing `QuotationStatus` values post-issue |

**Do not conflate** `CommercialPricingStatus` (margin approval) with `CommercialApprovalStatus` (fulfillment path approval) — Increment 12 / Phase 1 spec.

### 8.3 Inquiry lifecycle interaction

`v2InquiryWorkflow.ts`:

- `READY_FOR_COMMERCIAL` → `QUOTED` on quotation create (today — **too early**)
- **Proposed:** inquiry moves to `QUOTED` only on **ISSUE**, not on draft quotation create
- V2 transitions remain governed by `assertV2StatusTransition`

### 8.4 Issue workflow (design)

```text
POST /api/quotations/:id/issue
  Preconditions: §9 gates pass, technicalOfferStatus=READY, PRICING_APPROVED
  Actions:
    1. Freeze inquirySnapshot + per-line lineage snapshots
    2. Set issuedAt, issuedBy
    3. Set status SUBMITTED/ISSUED
    4. appendServerAudit ISSUE
    5. (optional) enqueue PDF generation job
```

---

## 9. Readiness Gates

**Do not weaken upstream gates.** Quotation stage prerequisites:

| Lifecycle stage | Engineering / config | Cutting | Drum | Costing | Commercial pricing | BOM Gate 2 | Decision 5 |
|-----------------|---------------------|---------|------|---------|-------------------|------------|------------|
| **Create draft quotation** | `V2ConfigurationSnapshot` exists; `engineeringStatus` not blocked | Plan exists | Plan exists (may be DRAFT) | Optional preview | Not required | Warn if blocked | N/A for draft |
| **Price quotation** | Valid snapshot pinned on line | Plan pinned | **CONFIRMED** drum pinned | **V2 run persisted**, `materialCost > 0` | Rule match possible | **Must pass** (no open BOM-CONF) | Signed for production claim |
| **Ready for approval** | Technical offer attachments present | Pinned | CONFIRMED | Locked calculation | `PRICING_CALCULATED` or `PRICING_APPROVAL_REQUIRED` | Pass | Signed |
| **Commercial approve** | Technical offer ready | Pinned | CONFIRMED | Locked | `PRICING_APPROVED` | Pass | Signed |
| **Issue to customer** | Snapshot bundle complete | Pinned | CONFIRMED | Locked | `PRICING_APPROVED` | Pass | Signed |

### 9.1 Gate details

**Engineering / config (05A/05B):**

- `V2ConfigurationSnapshot.validationStatus` valid
- `bomGovernanceBlocked = false` (81 conflicts → blocked)
- `catalogAuthoritative` where required

**Cutting (05C):**

- `V2CuttingLengthPlan` linked to configuration snapshot version

**Drum (05D):**

- `V2DrumPlan.lifecycleStatus = 'CONFIRMED'` (`getV2DrumPlanHandoff` enforces)
- `quantityReconciliationStatus` acceptable (PO rule)

**Costing (05E):**

- `CostingCalculation.workflowChannel = 'V2_CONFIGURATION'`
- Four engine gates pass (`evaluateCostingGates`)
- `CostingCalculation.status = LOCKED` (persisted)
- Inquiry not `COSTING_LOCKED` for recalc — quotation pins specific calculation id

**Commercial pricing:**

- Approved `CommercialPricingRule` match (`workflowStatus = APPROVED`)
- `CommercialPricingSnapshot` per line
- Discount within `maxDiscountAllowed` or explicit approval

**BOM Gate 2:**

- Zero unresolved `BomDuplicateObservation` with `investigationStatus !== 'APPROVED'`
- Platform enforces 81 conflicts today — **quotation must hard-block**

**Decision 5:**

- `DECISION5_STATUS = 'PENDING_BUSINESS_SIGN_OFF'` in code (`v2CostingRequestService.ts` L18)
- Production **issue** blocked until PO signs `docs/DECISION5_ONE_PAGER.md`

### 9.2 V2 line status alignment

Map `CommercialInquiryLine.status`:

- `READY_FOR_QUOTATION` required before create (extend server check)
- Set when costing complete + drum CONFIRMED + engineering ready

---

## 10. Pricing

### 10.1 Layers (unchanged from 05E)

| Layer | Computes | Quotation uses |
|-------|----------|----------------|
| Engineering | Direct RM `materialCost` | Frozen via `costingRunId` |
| Commercial | Margin/markup, discount | `CommercialPricingSnapshot` |

### 10.2 Price/tax/discount

| Element | Current | V2 target |
|---------|---------|-----------|
| Base price | `baseSellingPrice` from rule | Same — snapshot |
| Discount | `requestedDiscountPercentage` in `priceQuotation` | Same; approval if over `maxDiscountAllowed` |
| Tax | **Not implemented** | Design hook: `taxCode`, `taxAmount` on snapshot (future) |
| Unit price | `unitSellingPrice` | Derive from quantity × length semantics (V2: use `plannedLengthM`) |

### 10.3 Repricing rules

- Draft quotation: `priceQuotation` allowed
- After `commercialApprovalStatus = APPROVED`: blocked (existing)
- After **issue**: blocked — new revision only
- Changing inquiry header metal **after** pricing snapshot: **no effect** on quotation (Test 22 pattern in `increment12.pricing.test.ts`)

---

## 11. Currency

| Topic | Rule |
|-------|------|
| Quotation currency | `CommercialQuotation.currency` — default from inquiry |
| Costing currency | Inquiry header; stored on `CostingRun.currency` |
| Pricing rule currency | Must match or `PRICING_CURRENCY_MISMATCH` |
| FX | Applied in costing orchestrator for RM lines — trace in `CostingLine` FX fields; **snapshot** in calculation |
| Display | Customer sees quotation currency only |
| Multi-currency quotation | **Out of scope** — single currency per quotation header |

---

## 12. Approval

### 12.1 Two approval dimensions (keep separate)

| Dimension | Field | Authority | RBAC |
|-----------|-------|-----------|------|
| **Pricing approval** | `CommercialPricingStatus` → `PRICING_APPROVED` | Sales manager / pricing approver | `COMMERCIAL:PRICING_RULE:APPROVE` + pricing approve route |
| **Commercial approval** | `commercialApprovalStatus` → `APPROVED` | Commercial director | `COMMERCIAL:QUOTATION:APPROVE` (`assertCanCommerciallyApproveQuotation`) |

Commercial approval **requires** `PRICING_APPROVED` (`commercialCommitmentRepository.ts` L250).

### 12.2 Fulfillment choice

At commercial approval, user selects `fulfillmentType`: `DIRECT_ORDER` \| `SALES_AGREEMENT` — immutable on that revision.

### 12.3 V2 additions

- Technical review approval (optional PO): `technicalOfferStatus` sign-off before issue
- Issue approval: may equal commercial approval or separate `ISSUE` permission

---

## 13. Customer Portal

### 13.1 Current surfaces

| Surface | Path | Quotation behavior |
|---------|------|-------------------|
| Inquiry list/detail | `ErpCustomerRequestView.tsx`, `InquiryQuotationHome.tsx` | Filter by quotation status; mock PDF names |
| Permissions | `salesQuotations`, `costingPricing` | Controls visiblity |
| Projection | `commercialProjection.ts` | Strips costs and selling price from inquiry payload |

### 13.2 Target customer view (issued quotation)

**Show:**

- `quotationNumber`, `versionNo`, `validUntil`, status
- Line descriptions, quantities, lengths, drum summary (from snapshot scalars)
- `unitSellingPrice`, `finalSellingPrice` (from `CommercialPricingSnapshot` or line scalars)
- Technical offer attachments (allowed set only)
- Terms: incoterms, payment, delivery

**Hide:**

- `materialCost`, `costingRunId`, `costingCalculationId`, `pricingRuleId`
- RM breakdown, BOM conflicts, internal approval reasons
- `commercialPricingStatus` internal codes (map to friendly labels)

### 13.3 API

- `GET /api/quotations` — customer scoped via `resolveCustomerScope` (existing)
- New: `GET /api/quotations/:id/offer` — customer-safe DTO with snapshots only
- `GET /api/quotations/:id/costing` — **remain internal-only**

---

## 14. PDF/Print

### 14.1 Current state

- UI buttons: "Print technical offer", mock PDF download strings in `ErpCustomerRequestView.tsx` L1940
- `attachTechnicalOfferTestHelper.ts` — test PDF attachment only
- `CustomerStatement.tsx` — `PDF NOT_IMPLEMENTED`
- No server-side PDF renderer

### 14.2 Design requirements

| Document | Content source | Generation |
|----------|----------------|------------|
| **Technical Offer PDF** | `technicalSummarySnapshot` + `drumPlanLinesSnapshot` + attachment embeds | Service reads snapshot only |
| **Commercial Offer PDF** | Quotation header + priced lines + terms + validity | Service reads `CommercialPricingSnapshot` |
| **Combined customer pack** | Optional merge for issue event | Job queue (future) |

### 14.3 Print immutability

- PDF stored as `CommercialQuotationAttachment` (new table) or `Document` with `quotationVersionNo` pin
- Re-issue = new version → new PDF row
- Hash/fingerprint in audit log

### 14.4 RBAC

- Internal: print with optional material cost appendix
- Customer: commercial + technical only

---

## 15. Security

| Concern | Current | V2 target |
|---------|---------|-----------|
| Customer isolation | `customerScope`, `assertCanAccessInquiryOwnership` | All V2 quotation routes use same scope |
| Quotation create | `requireQuotationAuth` — customers **cannot** create | Unchanged |
| Costing visibility | `getQuotationCosting` internal | V2 lineage endpoint internal-only |
| Master data | Customers cannot POST costing/pricing admin | Unchanged |
| Issue | N/A | `COMMERCIAL:QUOTATION:ISSUE` (new) or `QUOTATION:APPROVE` |
| Portal projection | `projectInquiryForActor` | Extend for quotation DTO `projectQuotationForActor` |

RBAC: `src/server/rbac.ts` — `assertCanManageQuotations`, `assertCanCommerciallyApproveQuotation`.

---

## 16. Audit

| Event | Mechanism today | V2 target |
|-------|-----------------|-----------|
| Quotation create | `appendAudit` + `auditEvent` | Add `appendServerAudit` |
| Revise | Same | Include superseded version id |
| Price | `appendAudit` | Include snapshot ids |
| Pricing approve | `appendAudit` | Same |
| Commercial approve | commitment repo audit | Same |
| **Issue** | **Missing** | `appendServerAudit` entity `CommercialQuotation`, action `ISSUE`, full lineage payload |
| V2 costing/pricing preview | `appendServerAudit` | Link `calculationNumber` in quotation audit |

Immutable audit must record: `quotationNumber`, `versionNo`, per-line `configurationSnapshotId`, `drumPlanId`, `costingCalculationId`, `pricingSnapshotId`.

---

## 17. Sales Agreement / Sales Order Handoff

### 17.1 Existing Phase 1 chain (design reference — do not break)

```text
CommercialQuotation (commercialApprovalStatus=APPROVED, PRICING_APPROVED, fulfillmentType set)
  → CommercialCommitment (quotationVersionNo pin)
    → EpcSalesOrder (MTO, origin QUOTATION) | SalesAgreement
      → AgreementRelease → EpcSalesOrder
```

Code: `commercialCommitmentRepository.ts`, `CommercialFulfillmentPanel.tsx`, `phase1.quoteToCash.test.ts`

### 17.2 V2 handoff requirements

`EpcSalesOrderLine` / agreement lines must copy **quotation line scalars** (already spec'd on `CommercialQuotationLine` L1072–1084):

- `customerCableCode`, `configurationId`, `engineeringRevision`, `bomVersion`
- Cutting/drum scalars
- **Add V2:** `v2DrumPlanId`, `v2ConfigurationSnapshotId` on SO line snapshot (future column)

Commitment creation must verify quotation **issued** (proposed) or at minimum **commercially approved**.

### 17.3 No costing recompute on SO create

`phase1.quoteToCash.test.ts` Test H: SO snapshot independent of later quotation mutation — **preserve** for V2.

---

## 18. D365 Boundary

Per `docs/D365_FO_QUOTE_TO_CASH_INTEGRATION_SPECIFICATION.md`:

| Domain | System of record |
|--------|------------------|
| Quotation, revision, approval, technical/commercial content | **Energya** |
| SO execution, inventory, invoice, AR | **D365 F&O** |

**D365 receives (design):**

- `quotationNumber`, `versionNo`, customer account ref (`customerMasterId` → D365 account)
- Line commercial values (qty, UOM, unit price, delivery date)
- Technical **references** (material number, configuration revision, BOM version) — not live BOM expansion
- `d365DocumentNumber` / `d365RecordId` on `CommercialCommitment` — placeholders today (`NOT_SENT`)

**D365 does not:**

- Recalculate costing, drum plan, or margin
- Store authoritative cable configuration

V2 quotation issue should produce a **D365-ready payload DTO** (design only) without implementing sync.

---

## 19. Migration

### 19.1 Proposed migration `20260907120000_v2_quotation_lineage`

```sql
-- Design only — not applied in 05F
ALTER TABLE "CommercialQuotation"
  ADD COLUMN "workflowChannel" TEXT,
  ADD COLUMN "issuedAt" TIMESTAMP(3),
  ADD COLUMN "issuedBy" TEXT,
  ADD COLUMN "inquiryVersionNo" INTEGER,
  ADD COLUMN "inquirySnapshot" JSONB,
  ADD COLUMN "technicalOfferStatus" TEXT DEFAULT 'NOT_READY';

ALTER TABLE "CommercialQuotationLine"
  ADD COLUMN "workflowChannel" TEXT,
  ADD COLUMN "v2ConfigurationSnapshotId" TEXT,
  ADD COLUMN "v2ConfigurationSnapshotIdString" TEXT,
  ADD COLUMN "v2CuttingLengthPlanId" TEXT,
  ADD COLUMN "v2CuttingLengthPlanIdString" TEXT,
  ADD COLUMN "v2DrumPlanId" TEXT,
  ADD COLUMN "v2DrumPlanVersionNo" INTEGER,
  ADD COLUMN "v2DrumPlanIdString" TEXT,
  ADD COLUMN "plannedLengthM" DECIMAL,
  ADD COLUMN "drumCount" INTEGER,
  ADD COLUMN "technicalOfferAttachmentIds" JSONB,
  ADD COLUMN "technicalSummarySnapshot" JSONB,
  ADD COLUMN "drumPlanLinesSnapshot" JSONB,
  ADD COLUMN "lineageSnapshot" JSONB;

-- FKs RESTRICT to immutable upstream tables (optional phase 2)
```

### 19.2 Number sequence seed

```sql
INSERT INTO "NumberSequence" (code, name, prefix, format, ...)
VALUES ('QUO_COMMERCIAL', 'Commercial Quotation', 'QUO', 'QUO{YY}-{#####}', ...);
```

### 19.3 Data migration

- Legacy quotations: `workflowChannel = NULL` (V1)
- **No backfill** of V2 lineage on old quotations
- Do not auto-link legacy `drumSchedule` JSON to `V2DrumPlan`

### 19.4 Runtime

- New routes require Express server restart (`energya-connect-platform.mdc`)

---

## 20. Tests

### 20.1 Existing tests (must stay green)

| File | Coverage |
|------|----------|
| `increment12.pricing.test.ts` | Snapshot immutability, revision pricing |
| `increment11.commercial.test.ts` | V1 quotation create |
| `phase1.quoteToCash.test.ts` | Fulfillment, immutability, D365 placeholders |
| `v2CostingRunService.test.ts` | Costing lineage |
| `cableBomConflictGovernance.test.ts` | 81 conflicts |

### 20.2 Proposed new tests (implementation task)

**File:** `src/platform/v2QuotationReadiness.test.ts`

1. V2 inquiry without CONFIRMED drum → create quotation **blocked**
2. V2 inquiry without costing run → price quotation **blocked**
3. V2 create quotation → lines contain `v2DrumPlanId`, `costingCalculationId`, `plannedLengthM` from handoff — **not** legacy `drumType`
4. Issue quotation → subsequent RM price change does not alter issued line `materialCost` / `sellingPrice`
5. Issue quotation → subsequent inquiry attachment delete does not break issued `technicalOfferAttachmentIds` metadata
6. Revision V2 → V1 pricing snapshot unchanged (extend Test 22/25 pattern)
7. Customer JWT: cannot create quotation, cannot GET costing, can GET offer DTO without material cost
8. BOM blocked line → quotation create blocked
9. `appendServerAudit` on issue with lineage payload
10. Commercial approval requires `PRICING_APPROVED` + V2 pins

**File:** `src/domain/v2QuotationReadinessService.test.ts` (unit)

- `evaluateQuotationReadiness(line)` gate matrix
- No import of `costingEngine` in quotation service (pricing reads snapshots only)

---

## 21. Risks

| Risk | Impact | Mitigation |
|------|--------|------------|
| 81 BOM conflicts | V2 quotation blocked at price/issue | Do not bypass; surface in UI |
| Decision 5 unsigned | Production issue blocked | PO sign-off |
| V1 `createQuotationFromInquiry` used for V2 | Wrong drum/length on offer | Hard branch on `workflowChannel`; separate `createV2QuotationFromInquiry` |
| Inquiry → QUOTED on draft create | Wrong workflow state | Move to issue-time transition |
| `priceQuotation` upsert mutates snapshot | Weak immutability | Replace upsert with insert-only after issue; version-scoped snapshots |
| Attachment pin vs copy | Offer breaks if file deleted | Copy-on-issue or soft-delete protection |
| No PDF service | Customer expects official doc | Phase deliverable; block ISSUED without PDF optional flag |
| Tax not modeled | Commercial offer incomplete | Document as future; do not fake |
| Number sequence gap | Duplicate quotation numbers under load | Wire `QUO_COMMERCIAL` before production |
| Dual approval confusion | Users skip commercial approve | UI wizard: price → pricing approve → commercial approve → issue |
| Fulfillment on unissued quote | SO without customer offer | Require `issuedAt` on commitment create (PO) |

---

## 22. Decisions Required

| ID | Question | Options | 05F default |
|----|----------|---------|-------------|
| D-05F-1 | V2 quotation create API | Extend `createQuotationFromInquiry` vs `createV2QuotationFromInquiry` | **Separate function**, shared persistence helper |
| D-05F-2 | ISSUED representation | New `QuotationStatus.ISSUED` vs `issuedAt` + `SUBMITTED` | **`issuedAt` + SUBMITTED** (minimal enum change) |
| D-05F-3 | Inquiry status on draft quote | `QUOTED` on create vs on issue | **On issue only** |
| D-05F-4 | Technical attachment strategy | Pin id vs copy bytes at issue | **Pin id + metadata hash**; copy bytes in phase 2 |
| D-05F-5 | Minimum issue without PDF | Block issue vs allow with warning | **Allow issue; PDF async** (PO) |
| D-05F-6 | Tax line | Defer vs basic VAT field | **Defer** |
| D-05F-7 | Customer selling price visibility | Always show vs permission-gated | **Show on issued**; hide on draft |
| D-05F-8 | Commitment without issue | Require issue vs approve-only | **Require issue** for customer-facing SO |
| D-05F-9 | Quotation numbering | Keep random vs `QUO_COMMERCIAL` | **`QUO_COMMERCIAL` sequence** |
| D-05F-10 | Technical offer waiver | Hard block vs sales waiver flag | **Hard block** for governed cables |
| D-05F-11 | V1 inquiries | Forever legacy path | **Continue V1** indefinitely |
| D-05F-12 | Decision 5 + issue | Block issue until signed | **Block production issue** |

---

## 23. Recommended Implementation Sequence

1. **PO:** Sign Decision 5; confirm issue blocked until BOM programme complete (or scoped pilot cables)
2. **Domain:** `v2QuotationReadinessService.ts` — gate matrix (§9)
3. **Repository:** `v2QuotationRepository.ts` — `createV2QuotationFromInquiry`, `issueQuotation`, snapshot builders
4. **Extend:** `priceQuotation` / new `persistV2QuotationPricing` to populate `v2CostingCalculationId`, `drumPlanId`
5. **Routes:** `/api/v2/inquiries/:id/quotation` or `/api/v2/quotations/*` with `customerScope`
6. **Projection:** `projectQuotationForActor` for portal
7. **UI:** `CableConfiguratorV2` / `CommercialInquiryDetail` — readiness chips, blocked create, issue action
8. **Migration:** §19.1 + `QUO_COMMERCIAL` sequence
9. **Audit:** `appendServerAudit` on all quotation lifecycle events
10. **PDF:** attachment contract + stub renderer interface
11. **Tests:** §20.2
12. **Fulfillment:** verify commitment reads V2 pins on quotation lines
13. **Docs:** update `QUOTATION_DOMAIN_MODEL.md`, `COSTING_QUOTATION_SNAPSHOT.md` with V2 section

---

## Appendix A — Files inspected

| Area | Paths |
|------|-------|
| Schema | `prisma/schema.prisma`, `prisma/migrations/20260906130000_v2_costing_lineage/migration.sql` |
| V1 quotation | `src/server/commercialRepository.ts`, `src/server/commercialRoutes.ts` |
| Pricing | `src/server/commercialPricingRepository.ts`, `src/server/commercialPricingRoutes.ts`, `src/domain/commercialPricingEngine.ts` |
| V2 costing | `src/server/v2CostingRunRepository.ts`, `src/domain/v2CostingRunService.ts`, `src/domain/v2CostingRequestService.ts` |
| V2 commercial pricing | `src/server/v2CommercialPricingService.ts` |
| V2 drum handoff | `src/domain/v2DrumPlanService.ts`, `src/server/v2DrumPlanRepository.ts` |
| V2 inquiry | `src/server/v2InquiryConfigurationRoutes.ts`, `src/domain/v2InquiryWorkflow.ts` |
| Fulfillment | `src/server/commercialCommitmentRepository.ts`, `src/components/inquiry-quotation/CommercialFulfillmentPanel.tsx` |
| Security | `src/server/commercialProjection.ts`, `src/server/rbac.ts` |
| UI | `src/components/inquiry-quotation/CommercialInquiryDetail.tsx`, `InquiryQuotationWorkspace.tsx`, `ErpCustomerRequestView.tsx` |
| Technical offer | `src/domain/inquiryLineAttachments.ts`, `InquiryLineAttachmentsCell.tsx` |
| API client | `src/services/commercialInquiryApiService.ts` |
| Docs | `docs/v2/TASK05E_READINESS.md`, `docs/v2/35_V2_INQUIRY_CONFIGURATION_PERSISTENCE.md`, `docs/QUOTATION_DOMAIN_MODEL.md`, `docs/QUOTATION_VERSIONING.md`, `docs/COSTING_QUOTATION_SNAPSHOT.md`, `docs/D365_FO_QUOTE_TO_CASH_INTEGRATION_SPECIFICATION.md`, `docs/DECISION5_ONE_PAGER.md` |
| Tests | `increment12.pricing.test.ts`, `phase1.quoteToCash.test.ts`, `increment11.commercial.test.ts`, `v2CostingRunService.test.ts` |

---

## Appendix B — Proposed code changes (implementation follow-on)

| File | Change |
|------|--------|
| `src/domain/v2QuotationReadinessService.ts` | **NEW** — gate evaluation |
| `src/server/v2QuotationRepository.ts` | **NEW** — V2 create, issue, lineage |
| `src/server/commercialRepository.ts` | Branch V2 create; defer inquiry QUOTED status |
| `src/server/commercialPricingRepository.ts` | V2 snapshot fields; insert-only after issue |
| `src/server/commercialProjection.ts` | `projectQuotationForActor` |
| `src/server/commercialRoutes.ts` or `v2InquiryConfigurationRoutes.ts` | V2 quotation + issue endpoints |
| `src/services/v2QuotationApiService.ts` | **NEW** — client |
| `src/components/cable-configurator/v2/components/QuotationSectionV2.tsx` | **NEW** — UI |
| `prisma/schema.prisma` | §19.1 columns |

**Do not modify:** `costingEngine.ts`, `costingEngine.test.ts`, drum optimization, fulfillment core logic, D365 connectors.

---

## Appendix C — Proposed migration summary

See §19.1–19.3. Index recommendations:

- `CommercialQuotationLine(v2DrumPlanId)`
- `CommercialQuotation(workflowChannel, status, issuedAt)`

---

## Appendix D — Proposed test list

See §20.2. Minimum bar: **10 integration scenarios** + **2 unit modules** before V2 quotation beta.

---

## Appendix E — Frozen areas (do not touch in 05F implementation without explicit unfreeze)

- `src/domain/costingEngine.ts` / `costingEngine.test.ts`
- Direct RM / `CostingMetalCostComponent` semantics
- `docs/DECISION5*` content (unless PO requests)
- 81 BOM conflict resolution
- Drum Master schema and optimization algorithms
- V1 configurator paths
- Commercial Fulfillment WIP (except quotation input pins)
- D365 integration implementation
- `CommercialCommitment` creation rules (except optional issue precondition)

---

## Appendix F — PO decisions checklist

- [ ] Decision 5 sign-off (Option B)
- [ ] Approve minimum immutable snapshot contract (§7.1)
- [ ] Approve ISSUED semantics (D-05F-2)
- [ ] Approve inquiry QUOTED transition timing (D-05F-3)
- [ ] Approve technical attachment pin vs copy (D-05F-4)
- [ ] Approve `QUO_COMMERCIAL` numbering (D-05F-9)
- [ ] Confirm quotation blocked until BOM Gate 2 clear (no bypass)
- [ ] Confirm issue requires PRICING_APPROVED + commercial approval (D-05F-8)
- [ ] Target date for PDF generation MVP

---

**Readiness verdict:** V1 quotation + pricing + fulfillment **exist** but V2 Quote-to-Cash **stops before quotation**. There is **no** authoritative V2 quotation model, **no** issue/immutable offer bundle, and **no** reproducibility guarantee after master-data changes. Task 05F implementation must build on Task 05E costing/pricing pins, enforce §9 gates without weakening BOM or Decision 5 constraints, and treat issued quotations as **immutable commercial documents** — not live views of master data.
