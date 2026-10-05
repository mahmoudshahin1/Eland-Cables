# TASK 05I-DF-B4-D — Financial Total & Shipment Presentation Architecture

**Date:** 2026-09-11  
**Mode:** Implementation  
**Status:** **IMPLEMENTED** — authorized from approved design `35b77017e25f416f54328b37aed9a403ad004220`  
**Amends / follows:** [46](./46_CONTAINER_STUDY_INTEGRATION_ARCHITECTURE.md) (DF-A-01…35; inquiry total; Financial Offer structure), [47](./47_B4_SHIPMENT_GROUP_AND_SHIPPING_COST_ARCHITECTURE_AMENDMENT.md) (grouping modes; B4-D named as presentation/aggregation), [48](./48_B4B_SHIPPING_COST_MASTER_ARCHITECTURE.md) (rates are B4-B; B4-D does not resolve), [50](./50_B4C_SHIPMENT_COST_SNAPSHOT_ARCHITECTURE.md) (immutable `ShipmentCostSnapshot`)  
**Does not reopen:** DF-A-01…35; B1–B3 packing/integrity; B4-A membership/lock; B4-B masters/resolver; B4-C snapshot; Costing V2 freeze; Decision 5; Pricing Engine; Quotation issue workflow (05F)

**Frozen implementation bases:**

| Task | Commit | Status |
|------|--------|--------|
| 05I-DF-B3 | `4ad8761e9bc62be44d5c7215ddeffd6705da91d7` | **FROZEN** |
| 05I-DF-B4-A | `54111423def3219fa3ac8c6c6ca6dc84658a300b` | **FROZEN** |
| 05I-DF-B4-B | `d67f6816e463d3410be43be39404a5281233de16` | **FROZEN** |
| 05I-DF-B4-C | `72694f839571bc95905096dd71b732cf685114f5` | **ACCEPTED / FROZEN** |

This document is the B4-D specification. Implementation lives in `FinancialOfferSnapshot` (+ product/shipment lines), `financialOfferSnapshotRepository.ts`, and `POST/GET /api/v2/financial-offer-snapshots`. It does **not** implement Costing, Pricing Engine, Quotation issue, FX, Customer Master, D365, or UI.

**Frozen design amendments:**

| ID | Invariant |
|----|-----------|
| **D4-D-1** | Pricing-host sequencing is schema-bound: DRAFT quotation → lines → `CommercialPricingSnapshot`. B4-D consumes those rows. B4-D does **not** create an inquiry-scoped pricing artifact. |
| **D4-D-2** | `FinancialOfferSnapshot` is the financial aggregation SoT. `CommercialQuotation.commercialOfferSnapshot` must **not** become an independent financial SoT. Future quotation representation is generated from / pinned to `FinancialOfferSnapshot`. |
| **D4-D-3** | At most one `FinancialOfferSnapshot.isCurrent = true` per inquiry, enforced by a PostgreSQL partial unique index on `(inquiryId) WHERE isCurrent = true`. |
| **D4-D-4** | `VIP_SHIPMENT_NOT_CONFIGURED` is a **stored internal warning**. Customer visibility is future quotation/presentation logic — not a B4-D display contract. |

---

## 0. Purpose

B4-A closed shipment **identity**. B4-B closed the **governed rate**. B4-C closed the **immutable customer-shipment proof**.

B4-D must close the **financial aggregation and customer presentation boundary**:

```text
CommercialPricingSnapshot     (cable commercial unit / line totals — Pricing Engine)
        +
ShipmentCostSnapshot          (customer shipment totals — B4-C; frozen)
        ↓
Financial aggregation         (this increment — design)
        ↓
FinancialOfferSnapshot        (financial aggregation SoT — D4-D-2)
        ↓
Future Quotation issue        (05F / DF-A-33 — generated from / pinned to the offer; not B4-D)
```

The aggregator answers:

> What is the customer-visible Products Total, Shipping Total, and Inquiry Total for this inquiry, in one currency, with provenance to the exact pricing snapshots and B4-C shipment snapshots used — without recosting cable, re-packing containers, or re-resolving live shipping rates.

B4-D **aggregates**. It is **not** a costing engine, pricing engine, shipping-rate resolver, container-study engine, FX engine, or D365 posting layer.

---

## 1. B4-D scope and non-scope

### In scope (design)

| Concern | B4-D does |
|---------|-----------|
| Cable commercial totals | **Read** already-priced commercial line totals |
| Customer shipment totals | **Read** immutable B4-C `ShipmentCostSnapshot.totalAmount` |
| Inquiry aggregation | Formal Products Total + Shipping Total + Inquiry Total (DF-A-31 / DF-A-35) |
| Multi-group shipment | Sum one B4-C snapshot per included shipment group (`ENTIRE_INQUIRY`, `PER_INQUIRY_LINE`, `DESTINATION_CLUSTER`) |
| Currency homogeneity | Same-currency add; mixed → fail closed; **no FX** |
| Financial Offer Snapshot | Recommend and specify an immutable aggregation artifact (DF-A-32 / DF-A-33). **D4-D-2:** this is the financial SoT. |
| Customer vs internal | Totals contract (DF-A-27 / DF-A-35). **D4-D-4:** VIP warning is stored internally; customer display is not B4-D. |
| Quotation handoff | Future issue **pins** / is **generated from** `FinancialOfferSnapshot` (D4-D-2) |
| Pricing host | Consume existing DRAFT quotation → line → `CommercialPricingSnapshot` (D4-D-1). Do not create a pricing artifact. |
| RBAC / audit / failure / idempotency | Specify; do not implement. **D4-D-3:** specify partial unique index for one current offer. |

### Out of scope

| Domain | Forbidden in B4-D |
|--------|-------------------|
| Costing | `costingEngine.ts`, Decision 5, Direct RM / metal Option B, `CostingMetalCostComponent.SHIPPING` |
| Pricing Engine | Recalculate selling price, margin, markup, discount; mutate `CommercialPricingRule`; create an inquiry-scoped pricing artifact (D4-D-1) |
| Logistics engines | Container Study calculate/confirm; live drum-plan re-eval; B4-B `resolveShippingRate` |
| B4-C | Mutate snapshots; live rate lookup; client quantities; `CostingRun` FK on B4-C |
| FX | `CostingExchangeRate`; converting shipment or product totals |
| D365 | Posting, adapters, live ERP |
| Customer Master | Port/incoterm preferences as rate or total overrides |
| UI | Financial Offer screen, PDF, customer portal (05I-DF-F) |
| Quotation implementation | Issue/revise/approve APIs, PDF, fulfillment |

**Core principle:** shipment cost remains a **separate** financial component. Cable unit price remains **cable commercial price only**. Metal shipping remains **inside** internal material cost. Never combine or double-count (DF-A-16, DF-A-35).

---

## 2. Cable-line commercial value source

**Exact upstream artifact (exists today):** `CommercialPricingSnapshot`.

This is the only implemented commercial selling-price proof. It is produced by the Pricing Engine (`priceQuotation()` / `commercialPricingEngine.ts`) and is **not** a costing result.

| Field used by B4-D (read-only) | Meaning |
|--------------------------------|---------|
| `id` | Pin |
| `quotationLineId` | Current host of the snapshot (schema fact) |
| `materialNumber` | Identity copy |
| `currency` | Native commercial currency of the priced line |
| `unitSellingPrice` | Customer-visible cable unit price |
| `finalSellingPrice` | Customer-visible **cable line commercial total** (after discount) |
| `costingRunId` / `v2CostingCalculationId` / `drumPlanId` | Provenance only — **not** inputs to aggregation math |

**B4-D product line total = copied `finalSellingPrice`.**  
B4-D does **not** recompute `materialCost × margin`, does **not** re-apply discounts, and does **not** derive unit price from BOM or RM.

### What B4-D must not read for product totals

- `CableBomLine` / `GovernedBomLine` / scrap
- `RawMaterial` prices / `CostingMetalCostComponent`
- `CostingRun.materialCost` as a selling price
- `CommercialInquiryLine.materialCost` (internal)
- Live `CommercialPricingRule`

### Schema honesty — D4-D-1 (invariant, not a preference)

Current Prisma host for commercial selling price:

```text
CommercialQuotation (DRAFT)
    → CommercialQuotationLine
        → CommercialPricingSnapshot     (quotationLineId required UNIQUE)
```

**Invariant:**

- B4-D **consumes** those `CommercialPricingSnapshot` rows.
- B4-D **does not** create an inquiry-scoped pricing artifact.
- B4-D **does not** add `CommercialPricingSnapshot.inquiryLineId` as a substitute host.
- B4-D **does not** treat `CommercialInquiryLine.materialCost` or `CostingRun` as selling price.

Financial aggregation therefore runs only after a **DRAFT** quotation exists and Pricing has written a snapshot for every inquiry cable line in commercial scope. B4-D still **owns** Inquiry Total / Financial Offer aggregation; Pricing still **owns** how snapshots are created.

A future inquiry-scoped commercial pin would be a **Pricing** increment, not B4-D, and is not authorized here.

---

## 3. Shipment value source

**Exact upstream artifact:** B4-C `ShipmentCostSnapshot` (commit `72694f83`), bound to one **CONFIRMED** `ContainerStudyResult`.

B4-D:

- Pins `shipmentCostSnapshot.id`
- Copies `totalAmount`, `currencyCode`, dest/incoterm, `rateAsOfDate`
- Copies line evidence (type, qty, copied rate amount/id) for Financial Offer shipping section (DF-A-35 / Doc 46 §33)
- Selects the snapshot for a group by: `group → CONFIRMED study (if any) → currentResultId → snapshot.containerStudyResultId` (Doc 50 §17)

B4-D **never**:

- Calls B4-B `resolveShippingRate` / `resolveShippingCostRate`
- Counts `ContainerStudyResultContainer` itself
- Re-runs Container Study
- Re-reads live `ShippingCostRate`
- Writes `0` into B4-C
- Adds `CostingRun` to B4-C

If a group’s latest study is DRAFT (successor in progress), the previous CONFIRMED result’s snapshot remains the last issued freight proof until the successor is confirmed **and** snapshotted (Doc 50 §17). B4-D must pin **that snapshot id**, not “current study”.

VIP 0+warning for **missing** shipment proof is a **B4-D stored warning** (`VIP_SHIPMENT_NOT_CONFIGURED`, D4-D-4). It is **not** a B4-C partial snapshot (Doc 50 §15, §28). Whether that warning is shown to the customer is **not** decided here — future quotation/presentation logic owns customer visibility.

---

## 4. Inquiry financial aggregation

Frozen identities (DF-A-31, DF-A-35, Doc 46 §30.T / §32):

```text
Products Total   = Σ cable line commercial totals
Shipment Total   = Σ customer shipment snapshot totals
Inquiry Total    = Products Total + Shipment Total
```

All three are **one currency** (§5). No allocation of shipment into cable unit price.

### 4.1 Products Total

```text
Products Total = Σ FinancialOfferProductLine.lineTotal
lineTotal      = CommercialPricingSnapshot.finalSellingPrice   (copied)
```

One product line per inquiry cable line that is in commercial scope. Quantity, UOM, length, description are **copied display** from the priced quotation line / inquiry line — not recosted.

### 4.2 Shipment Total

```text
Shipment Total = Σ FinancialOfferShipmentLine.groupTotal
groupTotal     = ShipmentCostSnapshot.totalAmount              (copied)
```

One shipment section per **included** `ContainerShipmentGroup` that has a pinned B4-C snapshot (or VIP zero-row — §14).

### 4.3 Multiple shipment groups

| Mode | Groups | Aggregation |
|------|--------|-------------|
| `ENTIRE_INQUIRY` | Typically one group for all member lines | One B4-C snapshot (if present) → Shipping Total |
| `PER_INQUIRY_LINE` | One group per line | Sum of each line’s group snapshot |
| `DESTINATION_CLUSTER` | One group per destination cluster (Doc 47 D1) | Sum of each cluster’s snapshot |

Rules:

- Membership remains `ContainerShipmentGroupLine` (B4-A). B4-D does not regroup.
- A line’s **product** total is always in Products Total, even if its group has no snapshot (shipment side then incomplete — §14).
- Do **not** allocate one group’s freight across cable lines to manufacture a fake per-line DAP unit price (DF-A-35).
- Do **not** collapse two groups into one shipping line.
- Inquiry Total is **not** “one group only”; it is the sum of **all included groups’** snapshots plus **all** product lines.

### 4.4 What Inquiry Total is not

- Not `CostingRun` manufacturing cost
- Not metal shipping
- Not D365
- Not FX-converted “reporting currency”
- Not a live query of masters

---

## 5. Currency policy

| Source | Currency field |
|--------|----------------|
| Inquiry commercial currency | `CommercialInquiry.currency` (header; DF-A-18 / Doc 46 §30.C) |
| Product lines | `CommercialPricingSnapshot.currency` |
| Shipment snapshots | `ShipmentCostSnapshot.currencyCode` (native; B4-C forbids mixed currencies **inside** one snapshot) |

**B4-D aggregation currency** = inquiry commercial currency.

**Same-currency rule (frozen default B4-D-Q4):** after collecting every product `currency` and every included snapshot `currencyCode`, if any code differs from the inquiry currency or from another included code → **`CURRENCY_INCOMPATIBLE`**. Persist **nothing**.

No FX. Do not read `CostingExchangeRate`. Do not call `costingEngine.ts`. DF-A-20 FX remains at the **pricing/input** boundary **before** costing; B4-D is downstream and only **adds** already-normalized commercial numbers.

B4-C already failed closed on mixed shipping-rate currencies within one snapshot. B4-D extends that discipline **across** snapshots and product lines (e.g. one group USD freight + EUR selling prices).

Header of the Financial Offer stores a single `currencyCode` and the three totals in that code.

---

## 6. Financial Offer Snapshot

**Decision: a new immutable artifact is required.**

### 6.0 Single financial aggregation SoT (D4-D-2)

```text
FinancialOfferSnapshot     = financial aggregation SoT
CommercialQuotation.commercialOfferSnapshot
                           = must NOT become an independent financial SoT
Future quotation representation
                           = generated from / pinned to FinancialOfferSnapshot
```

`FinancialOfferSnapshot` is the only place Products Total, Shipping Total, Inquiry Total, and their provenance pins are authored. Quotation issue (05F) **pins** a specific `financialOfferSnapshotId` and may **materialize** a display copy. That copy is derived; it is not a second writer of the financial fact.

Existing `CommercialQuotation.commercialOfferSnapshot` JSON is **not** sufficient and **must not** be promoted:

- It is quotation-owned JSON, not a typed commercial proof
- It is not the DF-A-35 sectioned document
- It cannot uniquely pin multiple B4-C snapshots
- Mutation risk is the quotation row itself
- Treating it as SoT would fork Inquiry Total from the offer snapshot

`ShipmentCostSnapshot` is logistics freight proof only. `CommercialPricingSnapshot` is per-line selling-price proof only. Neither is Inquiry Total.

**Recommended entity (persistence names; not implemented):** `FinancialOfferSnapshot` + product lines + shipment lines.

### 6.1 Header

| Field | Required | Notes |
|-------|----------|--------|
| `id` | yes | Stable pin for quotation issue |
| `inquiryId` | yes | Isolation |
| `versionNo` | yes | Successor offers; do not overwrite |
| `isCurrent` | yes | At most one `true` per inquiry — **D4-D-3** database enforcement |
| `supersedesOfferId` | no | Prior offer id |
| `currencyCode` | yes | Homogeneous aggregation currency |
| `productsTotal` | yes | Σ product line totals |
| `shipmentTotal` | yes | Σ shipment group totals (VIP may be 0 with warning — copied fact, not a live rate) |
| `inquiryTotal` | yes | productsTotal + shipmentTotal |
| `warningsJson` | no | Stored **internal** warnings (e.g. `VIP_SHIPMENT_NOT_CONFIGURED`). Not a customer-display contract (D4-D-4) |
| `createdBy` / `createdAt` | yes | |

**No status machine** beyond created/current/superseded-by-successor (same pattern as B4-C: creation is the fact; SUPERSEDED is lineage). Do **not** add DRAFT/CALCULATED/CONFIRMED on the offer itself. Commercial **approval/issue** remain Quotation (05F).

**Not in B4-D:** FX fields, `CostingRun` FK, carrier, customerId override, internal cost components, PDF bytes.

Optional later: human `offerNumber` from platform `NumberSequence` (B4-D-Q5 default: **omit**; `id` + `versionNo` suffice).

### 6.2 Product lines

| Field | Required | Notes |
|-------|----------|--------|
| `inquiryLineId` | yes | |
| `commercialPricingSnapshotId` | yes | Pin; copied totals are SoT for the line |
| `materialNumber` / description | yes | Copied display |
| `quantity` / `quantityUom` / `lengthMeters` | yes | Copied from priced line |
| `unitPrice` | yes | Copied `unitSellingPrice` |
| `lineTotal` | yes | Copied `finalSellingPrice` |
| `currencyCode` | yes | Copied |

Do **not** store RM cost, manufacturing, G&A, selling expense, finance, material margin, BOM, scrap.

### 6.3 Shipment lines (group-level)

| Field | Required | Notes |
|-------|----------|--------|
| `shipmentGroupId` | yes | Identity |
| `shipmentCostSnapshotId` | yes* | *Unless VIP explicit missing-shipment zero row |
| `destinationPortCode` / `incotermCode` | yes | Copied from snapshot (or group copy on VIP zero row) |
| `currencyCode` / `groupTotal` | yes | Copied snapshot total, or 0 on VIP missing |
| nested type rows | yes when snapshot exists | Copied B4-C lines: type, qty, copied rate, lineTotal |

Presentation order (DF-A-35): (1) product lines (2) Products Total (3) shipping lines (4) Shipping Total (5) Inquiry Total.

### 6.4 Provenance on the header

Copied (not live):

- Set of `commercialPricingSnapshotId`
- Set of `shipmentCostSnapshotId`
- Inquiry id / version context
- `currencyCode`

### 6.5 Immutability

After insert, **no PATCH**. Correction = new `versionNo`, `isCurrent` flip, previous row unchanged (DF-A-33).

**D4-D-3 (design; implement only when B4-D is authorized):** PostgreSQL partial unique index:

```sql
CREATE UNIQUE INDEX financial_offer_snapshot_one_current_per_inquiry
  ON "FinancialOfferSnapshot" ("inquiryId")
  WHERE "isCurrent" = true;
```

Application-only “transactional flip” is **not** sufficient. The index is the SoT constraint. Unique `(inquiryId, versionNo)` remains in addition.

### 6.6 Revision semantics

See §9. `isCurrent` identifies the latest aggregation; issued quotations pin a **specific** `financialOfferSnapshotId` even if a newer offer exists.

---

## 7. Provenance

**Supported lineage only** (no invented FKs):

```text
FinancialOfferSnapshot
    ├── product line → CommercialPricingSnapshot
    │       ├── CommercialQuotationLine → CommercialInquiryLine
    │       ├── costingRunId? / v2CostingCalculationId?     (already on pricing snapshot)
    │       └── drumPlanId?                                 (already on pricing snapshot)
    │               → V2DrumPlan (CONFIRMED at costing/pricing pin)
    │               → V2CuttingLengthPlan / V2ConfigurationSnapshot (via inquiry line current pointers / costing calculation)
    └── shipment line → ShipmentCostSnapshot                (B4-C)
            → ContainerStudyResult                          (unique bind)
            → ContainerStudyInputSnapshot                   (result.inputSnapshotId)
            → ContainerStudy / ContainerShipmentGroup
            → copied ShippingCostRate id/amount on snapshot lines
```

**Drum plan:** B4-C does not re-check live stale plans. Confirmed-result + input snapshot remain packing truth. Pricing/costing `drumPlanId` is a **separate** pin on the commercial price path. B4-D records both ids; it does not assert they are the same object if the platform has not already enforced that (do not invent a new join).

**Doc 46 §30.W “ShippingRateSnapshot”:** satisfied by B4-C copied rate evidence on `ShipmentCostSnapshotLine`. **Do not** create a second shipping-rate snapshot entity.

**Doc 46 §36 item 12 (`CostingRun` pins `ContainerStudyResult`):** costing-domain future; **not** a B4-C or B4-D FK. B4-D must not add `CostingRun` to `ShipmentCostSnapshot`.

---

## 8. Internal vs customer-facing values

### Customer-visible (Financial Offer / issued quotation)

- Product description, commercial quantity / cutting length where already commercial
- Cable unit price and line total
- Products Total
- Destination, incoterm, container type, container count, customer shipment rate, group shipment total
- Shipping Total
- Inquiry Total / Final total
- Currency
- Approved commercial terms (validity, payment, delivery, VAT, etc.) — **quotation/terms domain**, copied onto the offer document at issue; B4-D does not author legal boilerplate (DF-A-32)

### Internal-only (never on Financial Offer)

- Raw material cost, BOM, scrap
- Metal base / premium / **metal shipping** / clearance build-up
- Manufacturing, G&A, selling expense, finance cost, material margin
- Internal cost basis / `materialCost` on costing
- Costing and pricing **formulas**, rule percentages as internal governance
- Internal warnings such as `COST_COMPONENTS_NOT_CONFIGURED`
- Approval metadata not meant for the customer
- Logistics master / rate APIs

Customers **must not** gain B4-B/B4-C master APIs through B4-D. Customer-facing totals appear on the **issued commercial document**, scoped by inquiry ownership (Doc 50 §24 / §25). That issued document is generated from / pinned to `FinancialOfferSnapshot` (D4-D-2).

### VIP missing-shipment warning (D4-D-4)

`VIP_SHIPMENT_NOT_CONFIGURED` is a **stored internal warning** on the Financial Offer (`warningsJson` / equivalent). B4-D records it when VIP_FAST_TRACK has no B4-C snapshot and Shipping Total is stored as **0**.

**0 ≠ configured free shipping** (DF-A-06).

B4-D does **not** define whether or how that warning appears to the customer. Customer visibility is **future quotation/presentation logic** (05F / DF-F). Do not treat “customer-visible warning” as a B4-D acceptance criterion.

---

## 9. Revision semantics

**Never mutate** an issued Financial Offer Snapshot or an issued quotation’s pinned offer id.

| Change | Effect |
|--------|--------|
| Cable quantity / cutting / drum | New engineering/costing/pricing path → **new** `CommercialPricingSnapshot` → **new** Financial Offer version. Old offer unchanged. |
| Pricing rule / discount | New pricing snapshot → new offer version. |
| Shipment group membership / dest / incoterm | Group identity rules (B4-A lock). Identity change → new group and/or successor study → new B4-C snapshot → new offer version. |
| Container result | Successor CONFIRMED result → new B4-C snapshot (Doc 50 §18) → new offer version. |
| Live shipping rate | Does **not** rewrite B4-C or the offer. Recapture requires new confirmed result + new B4-C snapshot (Doc 50 B4-C-Q3), then new offer. |
| Inquiry header currency | New aggregation; mixed with existing snapshots → `CURRENCY_INCOMPATIBLE` until prices/snapshots match. |

Quotation **revision** (existing `CommercialQuotation.versionNo` / `isCurrent`) is 05F. That revision must pin the **new** `FinancialOfferSnapshot.id`. Prior quotation versions keep the prior pin.

---

## 10. Ownership matrix

| Artifact | Owner | Readers | Must not own |
|----------|-------|---------|--------------|
| `V2ConfigurationSnapshot` / cable engineering | Engineering | Costing, Commercial | Rates, selling price |
| `V2DrumPlan` | Engineering / Logistics (confirm) | Container Study, Costing | Customer freight |
| `ContainerShipmentGroup` | Logistics | Commercial (identity display) | Selling price |
| `ContainerStudy*` / `ContainerStudyResult` | Logistics | B4-C, Commercial (quantities via snapshot) | FX, costing metal |
| `ShippingCostRate` / DestinationPort / Incoterm | Logistics | B4-C resolver | Customer edit |
| `ShipmentCostSnapshot` | Logistics | **Commercial B4-D** (read) | Costing engine |
| `CostingRun` / `CostingCalculation` | Costing | Pricing (materialCost pin) | Customer offer |
| `CostingMetalCostComponent.SHIPPING` | Costing | Costing only | Customer shipment |
| `CommercialPricingRule` / `CommercialPricingSnapshot` | Pricing | **Commercial B4-D** (read) | Container engine |
| **`FinancialOfferSnapshot`** | **Commercial** | Sales; customer only via issued quotation generated from this pin | Rate resolve, costing |
| `CommercialQuotation.commercialOfferSnapshot` | **Not SoT** (D4-D-2) | Derived display at most | Independent Inquiry Total |
| `CommercialQuotation` issue | Sales / Commercial (05F) | Customer | Live masters |
| Customer Master | Customer | Logistics (suggestion only) | Override LOCKED group or rates |

B4-D **does not** move ownership of Pricing or Logistics artifacts.

---

## 11. Quotation handoff contract

B4-D does **not** implement quotation. Future issue (DF-A-33 / 05F) **must**:

```text
Issue(quotation) requires:
  financialOfferSnapshotId           // specific version, not “current”
  snapshot.inquiryId = quotation.inquiryId
  FinancialOfferSnapshot is the commercial totals SoT for that issue
  CommercialQuotation.commercialOfferSnapshot is NOT an independent financial SoT
  quotation representation is generated from / pinned to FinancialOfferSnapshot
  no live resolveShippingRate
  no live costingEngine
  no live container study
```

Materialized onto the issued quotation (derived copy only — D4-D-2):

- Products Total, Shipping Total, Inquiry Total, currency
- Product lines (unit/line prices)
- Shipping lines (dest, incoterm, type, qty, rate, totals)
- Pins: pricing snapshot ids, B4-C snapshot ids, offer id

If `commercialOfferSnapshot` JSON continues to exist, it is a **generated projection** of the pinned `FinancialOfferSnapshot`, not a second writer.

Customer portal shows the **issued** pin. Draft offer versions that were never issued remain internal.

B4-D must not write fulfillment / SO / agreement.

Whether stored warnings such as `VIP_SHIPMENT_NOT_CONFIGURED` appear on the customer document is **presentation logic at issue time**, not B4-D (D4-D-4).

---

## 12. Security / RBAC

**Specify only. Do not implement new permission codes in this task.**

Reuse existing catalog where it already fits; new codes only if a later implementation review requires them.

| Action | Intended actor | Suggested existing / future code | Customer |
|--------|----------------|----------------------------------|----------|
| Create / revise Financial Offer Snapshot | Internal commercial | `COMMERCIAL:QUOTATION:CREATE` (or a future `COMMERCIAL:FINANCIAL_OFFER:MANAGE`) | **No** |
| View draft offer | Internal commercial / sales | `COMMERCIAL:QUOTATION:VIEW` or `COMMERCIAL:INQUIRY:VIEW` + internal | **No** draft |
| View issued totals | Customer (own inquiry) + internal | Issued quotation / inquiry ownership — **not** logistics APIs | Yes, **issued document only** |
| Approve commercial terms | Internal | `COMMERCIAL:QUOTATION:APPROVE` / `APPROVE_QUOTATION` | No |
| Issue | Internal | `COMMERCIAL:QUOTATION:ISSUE_QUOTATION` | No |

Customers still **cannot** call `/api/v2/destination-ports`, `/shipping-cost-rates`, or B4-C snapshot **master** APIs (Doc 50). Isolation is inquiry ownership on the server; never `customerId` from the body.

---

## 13. Audit requirements

Authority: PostgreSQL `AuditEvent` via `appendServerAudit` / `appendServerAuditTx` (same construction as B4-C). No client `auditLogService` as SoT.

| Action | When | Transaction |
|--------|------|-------------|
| `FINANCIAL_OFFER_SNAPSHOT_CREATED` | Successful insert of a new version | **`appendServerAuditTx` inside the create transaction** |
| `FINANCIAL_OFFER_SNAPSHOT_CREATE_FAILED` | Optional; outside txn | `appendServerAudit` (swallowing helper) |

`newValue` must include inquiry id, currency, productsTotal, shipmentTotal, inquiryTotal, pinned pricing snapshot ids, pinned B4-C snapshot ids, per-line commercial totals, per-group shipment totals.

No read audit. No mutation audit (there is no PATCH). Successor create does not rewrite the prior offer’s audit.

---

## 14. Failure modes

Domain `VALIDATION_FAILED` / `NOT_FOUND` / `CONFLICT` with `details.issueCode`.

| Issue code | Meaning |
|------------|---------|
| `PRICING_SNAPSHOT_REQUIRED` | A cable line in scope has no `CommercialPricingSnapshot` |
| `PRICING_SNAPSHOT_STALE` | Pinned pricing snapshot does not match the intended priced line / version |
| `SHIPMENT_SNAPSHOT_REQUIRED` | STANDARD (or logistics-required) path: included group has no B4-C snapshot |
| `SHIPMENT_SNAPSHOT_STALE` | Pinned snapshot is not the CONFIRMED currentResult snapshot (unless explicitly pinning a historical id for an already-issued offer — issue path only) |
| `UNALLOCATED_CONTAINERS` | Must not be re-derived; B4-C already blocked. If a corrupt pin appears, fail closed |
| `CURRENCY_INCOMPATIBLE` | Product, shipment, or inquiry currencies differ; **no FX** |
| `INVALID_SHIPMENT_GROUP` | Group not on inquiry / SUPERSEDED group included |
| `RESULT_NOT_CONFIRMED` | Attempt to aggregate from a non-confirmed packing result (B4-C would have refused) |
| `INQUIRY_LINE_NOT_IN_SCOPE` | Offer includes a line not on the inquiry |
| `OFFER_INPUT_MISMATCH` | Idempotent hit but caller pin set ≠ stored pin set |
| `VIP_SHIPMENT_NOT_CONFIGURED` | **Stored internal warning** (not a hard fail) on VIP_FAST_TRACK when shipment snapshot missing; Shipping Total **0**. **0 ≠ configured free shipping** (DF-A-06). Customer appearance is **not** a B4-D contract (D4-D-4). |

`STALE_DRUM_PLAN` is **not** a B4-D create code (confirm-time only).

STANDARD workflow when DF-A-05 says logistics is required: missing B4-C snapshot → `SHIPMENT_SNAPSHOT_REQUIRED`, not silent 0.

---

## 15. Concurrency / idempotency

If `FinancialOfferSnapshot` is implemented later:

**Unique:** `(inquiryId, versionNo)`.

**D4-D-3 — at most one current offer per inquiry, database-enforced:**

```sql
CREATE UNIQUE INDEX financial_offer_snapshot_one_current_per_inquiry
  ON "FinancialOfferSnapshot" ("inquiryId")
  WHERE "isCurrent" = true;
```

Application transactional flip of `isCurrent` is required for revision, but the **partial unique index** is the enforcement. Two current rows for one inquiry must be impossible at the database, not only in application code.

**Idempotent create:** if the caller requests aggregation for the same inquiry and the **current** offer’s pin set (sorted pricing snapshot ids + sorted B4-C snapshot ids + currency) is **identical** → return the current offer (no new version, no new `CREATED` audit).

If the pin set **differs** → insert `versionNo+1`, set current, leave prior immutable.

Concurrent creators: unique / current constraint; loser re-reads the winner. Do not create two current offers.

Do not unique on “inquiry + as-of date” alone.

---

## 16. Reconciliation with Doc 46 Part W

Doc 46 §30.W lists issued-document pins:

```text
… CostingRun → CostingCalculation → PricingSnapshot → ShippingRateSnapshot
  → Quotation → Financial Offer
```

That is a **pin graph**, not a license for B4-D to run costing or live rates.

Runtime for B4-D:

```text
PricingSnapshot (already exists)
+ ShipmentCostSnapshot (B4-C; stands in for “ShippingRateSnapshot”)
    → FinancialOfferSnapshot
        → Quotation issue pins the offer
```

Costing remains **upstream of Pricing**, not inside B4-D.

---

## 17. Open decisions

### Frozen by D4-D-1…D4-D-4 (not reopenable without a successor architecture doc)

| ID | Decision |
|----|----------|
| **D4-D-1** / **B4-D-Q1** | Financial Offer is **not** created before a DRAFT quotation hosts `CommercialPricingSnapshot` rows. B4-D does not invent inquiry-scoped pricing. |
| **D4-D-2** / **B4-D-Q3** | Offer is **inquiry-scoped**. `FinancialOfferSnapshot` is the financial aggregation SoT. Quotation **pins** `financialOfferSnapshotId`. `commercialOfferSnapshot` JSON is not an independent SoT. |
| **D4-D-3** | Partial unique index `(inquiryId) WHERE isCurrent = true`. |
| **D4-D-4** / **B4-D-Q2** (visibility) | VIP missing snapshot → store `VIP_SHIPMENT_NOT_CONFIGURED` + Shipping Total 0. Customer appearance is future quotation/presentation. STANDARD when logistics required → `SHIPMENT_SNAPSHOT_REQUIRED`. |

### Remaining (implementation defaults if still unanswered)

| ID | Question | Default if unanswered at implementation |
|----|----------|------------------------------------------|
| **B4-D-Q4** | Mixed native currencies | **`CURRENCY_INCOMPATIBLE`**. No FX. |
| **B4-D-Q5** | `NumberSequence` offer numbers? | **Omit** in v1. |
| **B4-D-Q6** | Auto-create offer when the last B4-C snapshot is created? | **No.** Explicit command (same posture as B4-C vs study confirm). |

No remaining question reopens DF-A-35, metal vs customer shipment, B4-C immutability, Decision 5, D4-D-1…D4-D-4, or Pricing-host sequencing.

---

## 18. Dependencies

| Dependency | Status | B4-D may |
|------------|--------|----------|
| B4-C `ShipmentCostSnapshot` | **FROZEN** `72694f83` | Read / pin only |
| `CommercialPricingSnapshot` | Implemented (quotation-hosted) | Read / pin only |
| Pricing Engine | Frozen vs B4-D | Not modified |
| Costing V2 / Decision 5 | Frozen | Not modified |
| Quotation issue 05F | Partial / future | Consume offer pin later |
| B4-B resolver | Frozen | Not called |
| Container Study engine | Frozen | Not called |
| D365 | NOT_CONNECTED | Not called |

---

## 19. Acceptance criteria (when implementation is later authorized)

1. Products Total comes only from pinned `CommercialPricingSnapshot.finalSellingPrice`.
2. Those snapshots exist only via DRAFT quotation → quotation line → pricing snapshot (D4-D-1). B4-D does not create an inquiry-scoped pricing artifact.
3. Shipping Total comes only from pinned `ShipmentCostSnapshot.totalAmount` (VIP stored 0 + internal warning exception only).
4. Inquiry Total = Products + Shipping; no unit-price allocation (DF-A-35).
5. Multi-group modes sum snapshots; no regrouping.
6. Mixed currency fails closed; no FX; no costingEngine.
7. `FinancialOfferSnapshot` is the financial aggregation SoT and is immutable; revision = new version (D4-D-2).
8. `CommercialQuotation.commercialOfferSnapshot` is not an independent financial SoT; issued quotation is generated from / pinned to the offer snapshot (D4-D-2).
9. Database: unique `(inquiryId, versionNo)` plus partial unique index `(inquiryId) WHERE isCurrent = true` (D4-D-3).
10. `VIP_SHIPMENT_NOT_CONFIGURED` is stored internally; customer presentation is out of B4-D (D4-D-4).
11. Provenance pins pricing snapshot ids and B4-C snapshot ids; no live rates.
12. Customers do not access logistics master APIs.
13. Metal shipping is absent from the offer.
14. No B4-C `CostingRun` FK; no Decision 5 work; no D365.
15. This document remains the B4-D spec until a successor architecture doc is approved.

**Implemented.** Do not modify Costing, Pricing Engine, Quotation issue, Customer Master, or D365 as part of B4-D follow-up unless a successor architecture doc is approved.

---

*End of TASK 05I-DF-B4-D — IMPLEMENTED.*
