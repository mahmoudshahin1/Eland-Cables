# TASK 06 — Customer Master Architecture

**Date:** 2026-09-12  
**Mode:** Architecture design **only**  
**Status:** **DESIGN ONLY** — **NOT IMPLEMENTED** — **NOT IMPLEMENTATION AUTHORIZED**  
**Amends / follows:** [04](./04_V2_MODULE_ARCHITECTURE.md), [05](./05_V2_PLATFORM_SERVICES.md), [06](./06_V2_LOW_CODE_ARCHITECTURE.md), [07](./07_V2_SECURITY_ARCHITECTURE.md), [08](./08_V2_DATABASE_ARCHITECTURE.md), [12](./12_MODULE_REGISTRY.md), [14](./14_METADATA_FOUNDATION.md), [15](./15_NUMBER_SEQUENCE.md), [20](./20_MASTER_DATA_SOT_CUTOVER_FRAMEWORK.md), [36](./36_INQUIRY_PROCESS_FOUNDATION.md), [46](./46_CONTAINER_STUDY_INTEGRATION_ARCHITECTURE.md), [47](./47_B4_SHIPMENT_GROUP_AND_SHIPPING_COST_ARCHITECTURE_AMENDMENT.md), [48](./48_B4B_SHIPPING_COST_MASTER_ARCHITECTURE.md), [50](./50_B4C_SHIPMENT_COST_SNAPSHOT_ARCHITECTURE.md), [51](./51_B4D_FINANCIAL_AGGREGATION_ARCHITECTURE.md)  
**Does not reopen:** B4-A/B/C/D frozen implementations; Costing V2 freeze / Decision 5; Pricing Engine; FinancialOfferSnapshot SoT (D4-D-2); ADR-004 adapter rule; Phase 1 quote-to-cash freeze

**Frozen logistics / commercial bases (do not contradict):**

| Task | Commit | Status |
|------|--------|--------|
| 05I-DF-B4-A | `54111423def3219fa3ac8c6c6ca6dc84658a300b` | **FROZEN** |
| 05I-DF-B4-B | `d67f6816e463d3410be43be39404a5281233de16` | **FROZEN** |
| 05I-DF-B4-C | `72694f839571bc95905096dd71b732cf685114f5` | **FROZEN** |
| 05I-DF-B4-D | `614347009b2358d5edb5d0f8803129485fe363af` | **IMPLEMENTED** (gate pending) |
| B4-D design invariants | `35b77017e25f416f54328b37aed9a403ad004220` | D4-D-1…D4-D-4 **frozen** |

This document does **not** implement schema, APIs, UI, tests, seed, Prisma migration, D365, Pricing, Costing, or Quotation issue.

**Stop after this design.** Do not start Customer Master implementation until this document is reviewed and explicitly approved. Do not modify existing `Customer` records.

---

## 0. Purpose and current honesty

Increment 12 B2 shipped a **thin** PostgreSQL Customer:

```text
Customer (code, name, type, status, defaultCurrency, defaultIncoterm,
          paymentTerms, deliveryTerms, allowedQuotationCurrencies,
          defaultInquiryProcessCode, customerGroupId)
CustomerGroup (code, name, defaultInquiryProcessCode)
CustomerUser (customerId, userAccountId, assignment status)
CustomerMigrationException (legacy commercial customerId that could not be mapped)
```

That is identity + portal tenancy + a few **embedded string defaults**. It is **not** a complete Customer Master. It already collides with B4-B: `defaultIncoterm` is free text (`FOB`), not `Incoterm.code`. `paymentTerms` is free text (`LC at sight` on inquiries). `defaultCurrency` is a string, not a required FK to `CostingCurrency`.

Task 06 designs the **target** Customer domain that:

1. Evolves the existing `Customer` — **one** customer authority (Doc 04 / 12). Does **not** invent a second customer table.
2. Supports the customer portal, Inquiry/Quotation, commercial defaults, contacts/addresses, isolation, classification, future pricing/workflow behavior, and future D365 F&O.
3. Does **not** become a shadow D365 Finance / AR / GL / credit-management system.
4. Consumes existing governed masters. Never duplicates `DestinationPort`, `Incoterm`, `CostingCurrency`, `ShippingCostRate`, or `ContainerType`.

**Core distinction (frozen with B4-B §3 / B4-C §27 / B4-D D4-D-2):**

```text
CUSTOMER DEFAULT / PREFERENCE
    ≠  Inquiry / Quotation transactional value
    ≠  Locked ContainerShipmentGroup identity
    ≠  Confirmed Container Study
    ≠  B4-C ShipmentCostSnapshot copied codes
    ≠  FinancialOfferSnapshot / issued quotation
```

Customer preference **suggests**. It must **never** silently override a transaction value or historical snapshot. Once a transactional artifact exists, Customer Master changes must not rewrite it.

This is already proven for inquiry process (Doc 36): `Customer.defaultInquiryProcessCode` → snapshotted on inquiry create in `commercialMetadata`; later customer changes do not mutate the inquiry.

---

## 1. Customer domain boundary

### 1.1 Customer Master owns

| Concern | Meaning |
|---------|---------|
| Customer identity | Stable platform `Customer.id` + unique `customerCode` |
| Legal identity | Legal name, display name, tax registration **as commercial attributes** (not a tax engine) |
| Lifecycle / status | Governed customer status (separate from `UserAccount.status`) |
| Commercial profile | Group, classification, segment, currency, payment defaults, credit **reference**, price-group **reference**, sales channel, inquiry-process default |
| Addresses | Multiple typed addresses |
| Contacts | Multiple named people / roles (not portal users) |
| Groups / classification / segment | Distinct masters or attributes (§11) |
| Commercial defaults / preferences | Ranked port/incoterm/currency/payment suggestions |
| External-system mappings | D365 / legacy / CRM identifiers **outside** Customer identity |
| Portal identity relationship | `CustomerUser` assignment to `UserAccount` (already exists) |
| Audit / provenance | Server `AuditEvent` on mutations |

### 1.2 Customer Master does **not** own

| Domain | Why excluded |
|--------|----------------|
| AR ledger, GL, invoice posting, payment execution | D365 Finance; ADR-004; Doc 08 “defer to D365” |
| D365 customer account posting / ledger balances | D365 |
| Credit **management** (holds, exposure, automatic block from AR) | D365 credit; Connect may store a **reference limit** only |
| Shipment cost / `ShippingCostRate` / B4-C snapshot | Logistics (B4-B/C) |
| Pricing calculation / `CommercialPricingRule` / `CommercialPricingSnapshot` | Pricing Engine |
| Costing / Decision 5 / metal shipping | Costing |
| Quotation approval / issue / FinancialOfferSnapshot authorship | Commercial / B4-D |
| Sales order execution / fulfillment | Frozen Phase 1 SALES |
| DestinationPort / Incoterm / CostingCurrency / ContainerType masters | B4-B / Costing currency / Container Master |
| Authentication credentials | Identity (`UserAccount`) |
| Inquiry/quotation document numbers | Commercial numbering |

**Credit limit:** if present, it is a **governed commercial attribute/reference** (what Sales believes the agreed limit is, for display and future sync). It is **not** an independent credit-control engine. Connect must not post exposure, calculate remaining credit, or auto-block from AR balances.

---

## 2. Customer core

**Decision: evolve existing `Customer`.** Do not add `Party` / `GlobalAddressBook` clones. D365 GAB is an **external** concept behind the adapter.

Proposed target fields vs classification:

| Proposed field | Classification | Decision |
|----------------|----------------|----------|
| `id` | **CORE COLUMN** | Keep. Platform identity (`cuid`). Never equal to D365 account. |
| `code` / `customerCode` | **CORE COLUMN** | Keep unique `Customer.code`. Human/business key in Connect. |
| `legalName` | **CORE COLUMN** | Split from today’s single `name`. Required. |
| `displayName` | **CORE COLUMN** | Optional; defaults to legalName. Today’s `name` maps here or to legalName during migration. |
| `customerType` | **CORE COLUMN** | Keep enum (`EPC_CUSTOMER`, `DISTRIBUTOR`, `UTILITY`, `OTHER`). Refine later if needed; do not confuse with Segment. |
| `status` | **CORE COLUMN** | Extend lifecycle (§18). Keep required. |
| `countryCode` | **REFERENCE MASTER** | Registered/HQ country. Consume future `Country` or ISO-2 until that master exists. Not a free-text “Egypt”. |
| `cityCode` | **REFERENCE MASTER** or **PROFILE** | HQ city. **OPEN** whether a City master exists (§7, §27). Until then: optional string on address, not a required Customer column. **Recommendation:** do **not** put `cityCode` on Customer core; put city on `CustomerAddress`. |
| `defaultCurrencyCode` | **PREFERENCE** (today mixed into core) | Move off core into commercial profile / preference. Must reference `CostingCurrency.code`. Today’s `defaultCurrency` is a transitional column. |
| `customerGroupId` | **REFERENCE MASTER** | Keep FK to existing `CustomerGroup`. |
| `classification` | **REFERENCE MASTER** | New `CustomerClassification`. Not a synonym of group or type. |
| `segment` | **REFERENCE MASTER** | New `CustomerSegment`. Market/use-case, not org chart. |
| `taxRegistrationNo` | **PROFILE** / legal attribute | Optional on commercial/legal profile. Not a VAT engine. Validation rules **OPEN** (§27). |
| `website` | **PROFILE** | Optional. Not identity. |
| `notes` | **PROFILE** | Internal notes. Not customer-visible. |
| `createdAt` / `updatedAt` | **CORE COLUMN** | Keep. |
| `createdBy` / `updatedBy` | **CORE COLUMN** | Add; today missing. |
| `defaultIncoterm` | **PREFERENCE** (today wrongly on core) | **Remove from core** in a later increment. Replace with `CustomerIncotermPreference` → `Incoterm.code`. |
| `paymentTerms` | **PREFERENCE** (today free text on core) | Move to commercial profile FK → `PaymentTerms`. |
| `deliveryTerms` | **NOT CUSTOMER MASTER** as a second incoterm | Ambiguous overlap with incoterm + quotation delivery text. Do not keep as a parallel master. Quotation `deliveryTerms` remains a **transaction** field. |
| `allowedQuotationCurrencies` | **PREFERENCE** | JSON on core today. Target: profile list of `CostingCurrency.code`. Constraint for new quotations; does not rewrite issued quotes. |
| `defaultInquiryProcessCode` | **PREFERENCE** | Keep (Doc 36). Already snapshotted on inquiry create. |
| `d365CustomerId` | **INTEGRATION ATTRIBUTE** | **Forbidden on Customer.** Use `CustomerExternalMapping`. |
| Inquiry `currency` / group dest / snapshot dest | **TRANSACTION ATTRIBUTE** | Not Customer Master. |
| AR balance / credit exposure | **NOT CUSTOMER MASTER** | D365. |

**Honesty on dual keys:** `CommercialInquiry.customerId` (legacy string) and `customerMasterId` (FK) both exist. Target: `customerMasterId` is canonical. Retiring the string key is a **migration increment**, not this design task. Isolation already must not trust body `customerId` for customer actors (Increment 12 B2).

---

## 3. Customer address

**Decision: `CustomerAddress` is a child entity.** One customer, many addresses. Do not assume one address.

Proposed types:

| Type | Typical use |
|------|-------------|
| `HEAD_OFFICE` | Legal / registered |
| `BILLING` | Bill-to suggestion for quotation |
| `SHIPPING` | Ship-to / project delivery suggestion |
| `FACTORY` | Plant / warehouse |
| `PROJECT` | Named project site |
| `OTHER` | Overflow |

Proposed fields: `id`, `customerId`, `addressType`, `countryCode`, `cityName` (or future `cityCode`), `line1`, `line2`, `postalCode`, `active`, `isDefaultForType`, `effectiveFrom` / `effectiveTo` (optional), `createdAt` / `createdBy`.

**Multiple active of the same type:** **allowed** (a distributor may have several shipping sites). At most **one** `isDefaultForType = true` among **active** rows of that type per customer.

**Default selection:**

1. Active address of the requested type with `isDefaultForType`.
2. Else any active of that type (implementation may require explicit default rather than implicit pick — **recommend fail closed / prompt** if more than one and none default).
3. Else `HEAD_OFFICE` default as suggestion only.
4. User/transaction selection always wins.

Addresses **suggest** bill-to / ship-to on Inquiry/Quotation. They do **not** rewrite issued quotation `billTo` / `shipTo`, LOCKED shipment dest, or snapshots.

Effective dates: optional. v1 may use `active` only. Dated rows are a later refinement if legal address history is required independently of transactions (transactions already snapshot).

---

## 4. Customer contact

**Decision: `CustomerContact` is a child entity.** Do not collapse to one email/phone on `Customer` unless a **directory** field is needed for ops search — even then it should be derived from the primary contact, not a second SoT.

Roles: `SALES`, `TECHNICAL`, `PROCUREMENT`, `FINANCE`, `LOGISTICS`, `MANAGEMENT`, `OTHER`.

Attributes: name (required), jobTitle, department, email, phone, mobile, whatsapp, preferredChannel (`EMAIL` / `PHONE` / `WHATSAPP` / `OTHER`), active, `isPrimary`, role.

**Multiple contacts:** required. **At most one primary** among active contacts per customer (data-quality rule).

**Portal login is not a contact field.** A contact may have:

- no login
- one `UserAccount` linked via a future `CustomerContact.userAccountId` (optional) **or** remain unlinked while `CustomerUser` grants portal access to a different person

Do not duplicate Customer for each portal user. `CustomerUser` remains the tenancy assignment.

---

## 5. Customer commercial profile

**Decision: `CustomerCommercialProfile` is a 1:1 (or 1:current) child of Customer**, not a bag of columns on identity.

| Attribute | Owner of value | Notes |
|-----------|----------------|-------|
| `customerGroupId` | Customer Master (existing) | Org / process grouping. May stay on Customer core **or** profile; **recommend keep on Customer** (already used by Doc 36). Profile may denormalize for display only. |
| `classificationId` | Customer Master | Commercial class |
| `segmentId` | Customer Master | Market segment |
| `defaultCurrencyCode` | Preference / profile | FK/code → `CostingCurrency` |
| `paymentMethodId` | Preference / profile | New `PaymentMethod` master |
| `paymentTermsId` | Preference / profile | New `PaymentTerms` master |
| `creditLimitAmount` + `creditLimitCurrencyCode` | **Reference attribute** | Optional. Not exposure. Not auto-block. |
| `defaultIncotermCode` | Preference | Shortcut to rank-1 incoterm preference; still not a transaction |
| `customerPricingTierCode` | **PRICING owns the tier** | Reference `CustomerPricingTier.tierCode`. Do **not** create a second PriceGroup master in Customer. |
| `salesChannel` | Profile | Optional coded list later; free text forbidden if a master is added |
| `defaultDestinationPortCode` | Preference | Shortcut to rank-1 port preference |

**Not D365 Finance customer:** no posting profile, no customer posting group, no settle-period ledger, no collection letter sequence, no interest code, no statement cycle — unless a **future D365 design** maps them as **integration attributes** on `CustomerExternalMapping` / a D365-specific extension table. Those remain **OPEN**.

---

## 6. Customer preferences

Preferences are **defaults / suggestions only**. Separate from core identity.

| Preference | Shape |
|------------|--------|
| Preferred destination port(s) | `CustomerPortPreference[]` |
| Preferred Incoterm(s) | `CustomerIncotermPreference[]` |
| Default currency | Profile + `CostingCurrency` |
| Payment terms / method | Profile FKs |
| Preferred contact | `CustomerContact.isPrimary` or `preferredContactId` |
| Preferred shipment behavior | Optional later (`ENTIRE_INQUIRY` vs cluster) — **non-blocking OPEN**; must not regroup B4-A |
| Inquiry process | Existing `defaultInquiryProcessCode` (already snapshotted) |

### 6.1 Precedence (frozen)

```text
System default
    → Customer group default
    → Customer default / ranked preference
    → User selects / transaction specifies
    → Locked transaction snapshot (Shipment Group, study, B4-C, pricing, Financial Offer, issued quotation)
    → Historical artifact (immutable)
```

Customer Master mutations **never** walk down the last two arrows.

Already implemented analogue: inquiry process (Doc 36). B4-C §27 already forbids preference override of LOCKED group, snapshot codes, and rate selection.

---

## 7. Reference masters

| Master | Exists? | Owner | Code | Display | Active | Effective dates | Customer selectable | D365 mapping |
|--------|---------|-------|------|---------|--------|-----------------|---------------------|--------------|
| **DestinationPort** | **Yes (B4-B)** | Logistics | `code` | `name` | yes | no (rate rows dated) | via preference only | **OPEN** (port master vs D365 logistics) |
| **Incoterm** | **Yes (B4-B)** | Logistics | `code` | `name` | yes | no | via preference | **OPEN** |
| **CostingCurrency** | **Yes** | Costing / platform currency | `code` | `name` | status | n/a | via profile | **OPEN** (ISO vs D365 currency) |
| **ContainerType** | **Yes** | Logistics | `code` | description | yes | versions exist | **No** (not a customer pref) | n/a |
| **ShippingCostRate** | **Yes (B4-B)** | Logistics | grain | n/a | yes | yes | **No** | n/a |
| **CustomerGroup** | **Yes (05I-A)** | Customer | `code` | `name` | add `active` later | no | internal assign | **OPEN** if shared with D365 cust group |
| **CustomerPricingTier** | **Yes (Pricing)** | **Pricing** | `tierCode` | `tierName` | status | n/a | internal assign | **OPEN** vs D365 price group |
| **Country** | **No** | Platform / Customer setup | ISO-2 recommended | name | yes | no | yes on address | **OPEN** |
| **City** | **No** | **OPEN** | — | — | — | — | — | Do not invent a world gazetteer in v1 |
| **PaymentMethod** | **No** | Customer commercial setup | code | name | yes | optional | profile | **OPEN** vs D365 method of payment |
| **PaymentTerms** | **No** | Customer commercial setup | code | name | yes | optional | profile | **OPEN** vs D365 terms |
| **CustomerClassification** | **No** | Customer | code | name | yes | no | internal | **OPEN** |
| **CustomerSegment** | **No** | Customer | code | name | yes | no | internal | **OPEN** |
| **PriceGroup** | **Do not create** | Use `CustomerPricingTier` | — | — | — | — | — | — |

**Do not duplicate** DestinationPort / Incoterm / CostingCurrency / ContainerType.

`DestinationPort.countryCode` is already a string. A future Country master should become the SoT for that code; CustomerAddress consumes the **same** Country. Aligning DestinationPort to a Country FK is a **later** logistics increment, not a Customer duplicate list.

---

## 8. Customer port preferences

**Decision: `CustomerPortPreference`, not `Customer.port`.**

| Field | Notes |
|-------|--------|
| `customerId` | Owner |
| `destinationPortCode` | **Must** equal `DestinationPort.code` (B4-B). Fail closed if unknown/inactive on **new** preference writes |
| `rank` | 1 = most preferred |
| `isDefault` | At most one default among active |
| `active` | Soft retire |
| `effectiveFrom` / `effectiveTo` | Optional v1 |

**Multiple preferred ports:** **yes.** Ranked list. Default is rank 1 / `isDefault`.

**Must never override** Inquiry dest (when governed), `ContainerShipmentGroup.destinationPortCode`, confirmed study, B4-C copied `destinationPortCode`, or Financial Offer shipment lines.

Logistics **may** pre-fill a new DRAFT group from the default preference. LOCKED groups are identity (B4-A).

---

## 9. Customer Incoterm preferences

**Decision: `CustomerIncotermPreference` → existing `Incoterm`.** Same shape as ports: rank, default, active, optional dates.

Today’s `Customer.defaultIncoterm` string is a **transitional** field to migrate into this table (map `FOB` only if `Incoterm.code = FOB` exists; otherwise `CustomerMigrationException`-style row — do not guess).

Preference ≠ Inquiry `incoterms` ≠ group `incotermCode` ≠ B4-C `incotermCode`.

---

## 10. Payment terms / payment method

**Decision: new thin commercial reference masters** `PaymentTerms` and `PaymentMethod`.

- code, name, description, active, created/updated
- **No** D365 ledger settlement, cash-discount posting, or method-of-payment journals

Customer profile stores FKs/codes as **defaults**.

Quotation `paymentTerms` (string today) is the **transactional** value. On create, copy from customer default if the user does not specify. After save/issue, customer profile changes do not rewrite it.

Do not keep unbounded free text as the SoT once the master exists. Historical quotation strings remain as stored.

---

## 11. Group / classification / segment

Do **not** create three labels for one idea.

| Concept | Definition (Energya cable) | Example | Kind |
|---------|----------------------------|---------|------|
| **Customer Group** | Internal **organizational / process** bucket. Already drives `defaultInquiryProcessCode` (VIP vs STANDARD). | `VIP_EXPORT`, `DOMESTIC_DIST`, `UTILITY_FRAME` | **Master-controlled** (`CustomerGroup`). Assigned on Customer. |
| **Customer Type** | Legal/channel **form** of the account (existing enum). | DISTRIBUTOR vs UTILITY vs EPC_CUSTOMER | **Customer attribute** (enum). |
| **Classification** | **Commercial treatment** class used by Sales (priority, documentation pack, payment expectation) — not VIP process. | `STRATEGIC`, `STANDARD`, `SPOT` | **Master-controlled** new. |
| **Segment** | **Market / application** slice for reporting and future pricing eligibility. | `HV_PROJECTS`, `LV_DISTRIBUTION`, `RENEWABLES`, `OIL_GAS` | **Master-controlled** new. Not derived in v1. |

`CustomerType` stays; it is not Classification.

**D365 customer group:** may or may not equal Connect `CustomerGroup`. Treat as **mapped**, not identical, until D365 design confirms (**OPEN**).

---

## 12. Customer external mapping

**Decision: `CustomerExternalMapping`. No `d365CustomerId` on `Customer`.**

| Field | Purpose |
|-------|---------|
| `customerId` | Connect identity |
| `externalSystem` | `D365_FO` / `LEGACY` / `CRM` / other |
| `legalEntity` | D365 company / data area — **OPEN** cardinality |
| `externalCustomerId` | Cust account / party number as **their** id |
| `externalPartyId` | Optional GAB party |
| `syncStatus` | `NOT_MAPPED` / `MAPPED` / `PENDING` / `ERROR` / `DISABLED` |
| `lastSyncAt` | Timestamp |
| `lastSyncResult` | Short result / error code |
| `externalVersion` | Optional |

One customer may have **many** mappings (multi-LE, multi-system). Unique recommended: `(externalSystem, legalEntity, externalCustomerId)` and `(customerId, externalSystem, legalEntity)`.

This isolates Connect identity from ERP identifiers and from future CRM.

---

## 13. D365 F&O boundary

| Concern | Standalone SaaS **now** | Future (not implemented) |
|---------|-------------------------|--------------------------|
| Customer **identity** SoT | **Energya Connect `Customer`** | Connect remains commercial SoT unless a later ADR says otherwise (**OPEN**) |
| Financial posting attributes | Not stored as ledger config | D365 |
| AR balances / credit management | Not in Connect | D365 |
| Sync direction | None (`NOT_CONNECTED`) | Adapter-bound; direction **OPEN** (likely Connect→D365 for new commercial customers, D365→Connect for finance blocks — **TO BE CONFIRMED**) |
| Mapping | `CustomerExternalMapping` | Same |
| Field mapping | **Not assumed** | Separate D365 design |

```text
Energya Connect Customer Master     ≠     D365 CustTable / GAB / customer posting
Connect commercial defaults         ≠     D365 AR / credit / collection
Connect snapshots (B4-C, B4-D, pricing)  ≠     D365 posted invoices
```

Uncertain mappings are **OPEN / TO BE CONFIRMED** during D365 design. This document does **not** invent CustTable field lists.

**Do not implement D365.** ADR-004: domain must not call D365 HTTP.

---

## 14. Customer portal identity

```text
UserAccount (authentication)
    ↓
CustomerUser (assignment, status ACTIVE/INACTIVE)
    ↓
Customer (commercial party)
```

- Many portal users per one Customer (`@@unique(customerId, userAccountId)` already).
- Do not clone Customer per user.
- `UserAccount.customerId` legacy string is **not** the master; hydrate `customerMasterIds` / scope from `CustomerUser` (already B2).
- Contact with login: optional future link; assignment still via `CustomerUser`.
- **Security:** server-side `customerScope`. Customer actors **cannot** pass `customerId` in the body to escape isolation (B2 + Doc 07).

Portal access is **assignment status + UserAccount.status**, not `Customer.status` alone (§18).

---

## 15. Customer data security

| Surface | Internal | Customer user |
|---------|----------|-----------------|
| Customer view | `ADMIN:CUSTOMER:VIEW` (or future `CUSTOMER:MASTER:VIEW`) | Own Customer only |
| Customer edit | `ADMIN:CUSTOMER:UPDATE` | **No** (v1). Later: limited profile **OPEN** |
| Address / contact view | Internal commercial + admin | Own Customer |
| Address / contact edit | Internal | **No** by default (**OPEN** if self-service later) |
| Commercial profile | Internal sales/admin | **No** (would leak credit / classification) |
| Preferences view | Internal; customer may see own dest/incoterm prefs later | Own only if explicitly allowed |
| Preferences edit | Internal | **No** v1 |
| External mappings | Admin / integration | **No** |
| DestinationPort / Incoterm / Currency / rates | Logistics permissions | **No** (B4-B/C already deny) |

UI hiding is not authorization. Customer users must **not** edit governed masters.

Reuse existing `ADMIN:CUSTOMER:*` and `ADMIN:CUSTOMER_USER:*`. New triples only if implementation review requires finer grain (`CUSTOMER:ADDRESS:MANAGE`, etc.). Do not invent codes in this task.

---

## 16. Customer default precedence (attribute matrix)

Legend: **D** defaultable, **S** selectable on transaction, **O** overridable by user, **A** approval-controlled, **X** snapshotted on the named artifact.

| Attribute | D | S | O | A | Snapshotted on |
|-----------|---|---|---|---|----------------|
| Currency | Yes (system → group? → customer) | Yes | Yes | No for default; quotation issue is commercial | Inquiry `currency`; pricing snapshot `currency`; FinancialOfferSnapshot `currencyCode` |
| Incoterm | Yes | Yes | Yes | No at master | Inquiry/quotation fields; **LOCKED group `incotermCode`**; B4-C copy; offer shipment lines |
| Destination port | Yes | Yes | Yes | No at master | Group identity; B4-C copy; offer |
| Payment terms | Yes | Yes | Yes | Quotation approval/issue may freeze | Quotation `paymentTerms` |
| Payment method | Yes | Yes | Yes | Same | Quotation / future issue snapshot |
| Price group / tier | Yes (assign) | **No** by customer user | Internal only | Pricing rule governance | `CommercialPricingSnapshot` pins rule, not live tier |
| Inquiry process | Yes (Doc 36) | **No** from client body | No (immutable on inquiry) | n/a | `commercialMetadata.inquiryProcessCode` |
| Credit limit | Display / reference | **No** | Internal | Not a Connect approval engine | **Not** copied into offer totals |

Group-level dest/incoterm defaults: **not** on `CustomerGroup` today. Adding them is optional later; process code already is.

---

## 17. Snapshot / historical boundary

When Customer Master changes (legal name, address, default port, incoterm, currency, payment terms, segment):

| Artifact | Effect |
|----------|--------|
| Draft Inquiry (no dest lock) | **May** re-suggest defaults on **new** edits; stored inquiry fields remain until user changes them |
| Submitted / priced inquiry | Do **not** rewrite stored currency, process, lines |
| LOCKED `ContainerShipmentGroup` | **Immutable identity** (B4-A) |
| CONFIRMED Container Study | Unchanged |
| `ShipmentCostSnapshot` | Immutable (B4-C) |
| `CommercialPricingSnapshot` | Immutable (Pricing) |
| `FinancialOfferSnapshot` | Immutable (B4-D) |
| Issued quotation | Pins offer id; representation generated from / pinned to FinancialOfferSnapshot (D4-D-2) |

**Copy/snapshot moments (conceptual):**

- Inquiry create: process (already), optional currency/payment from customer defaults
- Quotation draft create: payment/delivery/bill-to/ship-to **copied strings**
- Group lock: dest/incoterm become identity
- B4-C create: dest/incoterm/rates copied
- B4-D create: commercial + freight totals copied
- Quotation issue: pin FinancialOfferSnapshot id — **not** live Customer

Copied **legal name** on issued documents: copy `legalName` / `displayName` at issue time. Master rename does not rewrite PDFs/history.

---

## 18. Customer lifecycle

Today: `ACTIVE` | `INACTIVE` only.

**Recommended target (do not implement yet):**

| Status | Meaning | New inquiries | Portal | History |
|--------|---------|---------------|--------|---------|
| `PROSPECT` | Not yet a trading customer | Allowed (sales-created) | Usually no | n/a |
| `ACTIVE` | May trade | Allowed | If `CustomerUser` ACTIVE and user ACTIVE | Readable |
| `ON_HOLD` | Commercial pause | Block **new** inquiries/quotes (**recommended**) | Optional deny | Readable |
| `BLOCKED` | Hard stop (compliance / D365 instruction later) | Block new | Deny portal assignment use | Readable |
| `INACTIVE` | Retired | Block new | Deny | Readable |

**Who changes status:** internal admin / sales manager (`ADMIN:CUSTOMER:ACTIVATE` today covers activate/deactivate — extend later).

**Do not confuse** with `UserAccount.status` (`ACTIVE` / `LOCKED` / …) or `CustomerUser.status`.

A BLOCKED customer with an issued quotation: history remains readable to authorized internal users and to scoped customer users **if** portal assignment remains; **recommended** to inactivate `CustomerUser` when blocking portal, separately from customer status.

Exact `ON_HOLD` vs `BLOCKED` commercial rules: **NON-BLOCKING OPEN** for v1 if only ACTIVE/INACTIVE ship first.

---

## 19. Audit

**SoT:** PostgreSQL `AuditEvent` via `appendServerAudit` / `appendServerAuditTx` (Doc 23). No second audit store. No client `auditLogService` as SoT. No read audit.

| Action (conceptual) | When |
|---------------------|------|
| `CUSTOMER_CREATED` | Insert |
| `CUSTOMER_UPDATED` | Core field change |
| `CUSTOMER_STATUS_CHANGED` | Status transition |
| `CUSTOMER_COMMERCIAL_PROFILE_CHANGED` | Profile |
| `CUSTOMER_ADDRESS_CHANGED` | Address C/U (incl. default flag) |
| `CUSTOMER_CONTACT_CHANGED` | Contact C/U |
| `CUSTOMER_PREFERENCE_CHANGED` | Port/incoterm/currency prefs |
| `CUSTOMER_EXTERNAL_MAPPING_CHANGED` | Mapping C/U |
| `CUSTOMER_USER_ASSIGNED` | Already in spirit of B2 |

Mutations only. Inquiry process already audits `INQUIRY_PROCESS_ASSIGNED` on the **inquiry**, not as a rewrite of history.

---

## 20. Master data ownership (role/function)

Exact org titles are not assumed.

| Artifact | Business owner (function) | System owner module |
|----------|---------------------------|---------------------|
| Customer | Sales / Commercial admin | `CUSTOMER` |
| Address / Contact | Sales / Commercial admin | `CUSTOMER` |
| Commercial profile | Sales | `CUSTOMER` (price tier **read** from Pricing) |
| Customer Group | Sales ops / Commercial admin | `CUSTOMER` |
| Classification / Segment | Sales / Marketing ops | `CUSTOMER` |
| Payment Terms / Method | Finance **policy** + Sales use | `CUSTOMER` setup (not GL) |
| DestinationPort / Incoterm | Logistics | `LOGISTICS` (B4-B) |
| CostingCurrency | Costing / Finance policy | Costing currency master |
| CustomerPricingTier | Pricing / Commercial | `PRICING` |
| External mapping | Integration / Admin | `CUSTOMER` + Integration adapters |
| Portal assignment | Admin | `CUSTOMER` + `SECURITY` |

---

## 21. Data quality / governance

Minimum rules (not a full MDM hub):

- `customerCode` unique, required, trimmed; uniqueness after canonicalization (recommend UPPER+trim like B4-B codes, **OPEN** if codes stay mixed-case)
- `legalName` required
- `status` required
- Country on address: valid code when Country master exists; until then ISO-2 or DestinationPort-aligned codes
- Currency: must exist on `CostingCurrency` and be selectable (ACTIVE) for **new** defaults
- Duplicate detection: warn on similar legalName + country (manual resolve; no silent merge)
- Tax registration: format **OPEN** (country-specific)
- Contact email/phone: basic format if present
- At most one primary contact; at most one default address per type
- Inactive `DestinationPort` / `Incoterm` / currency / payment master **cannot be newly selected**; historical rows remain
- Do not delete customers; inactivate
- Do not delete existing customer data in this architecture task (and not in a careless import)

---

## 22. Numbering

| Option | Verdict |
|--------|---------|
| Manual governed `Customer.code` | **Recommended v1.** Matches today’s unique `code` (`C-ELAND`). Sales/admin assign. Supports known trading codes before D365. |
| Platform `NumberSequence` | Optional later for `C-{YY}-{#####}` if volume requires. Do not dual-increment with D365. |
| D365-assigned account as Connect `code` | **Rejected** for standalone phase. D365 id lives in `CustomerExternalMapping`. After go-live, **OPEN** whether Connect code is aligned, aliased, or kept separate. |

**Do not implement numbering in this task.**

---

## 23. Migration / legacy customer data

**Do not implement. Do not delete existing customers.**

Sources (inventory):

- PostgreSQL `Customer` / `CustomerGroup` / `CustomerUser` (B2) — **primary to evolve**
- `CustomerMigrationException` — already documents unmapped commercial `customerId` strings
- `CommercialInquiry.customerId` / `customerMasterId`, quotations, commitments
- Portal `UserAccount` + `CustomerUser`
- Possible localStorage remnants for admin UI (04A: PG primary; do not revive LS as SoT)

Pipeline (conceptual): inventory → duplicate detection → normalize codes/names → map group/type → validate against DestinationPort/Incoterm/CostingCurrency when moving defaults → **approval** for ambiguous maps → import/update in place → audit → write `CustomerExternalMapping` / keep exceptions.

`defaultIncoterm = "FOB"`: only attach preference if `Incoterm` `FOB` exists; else exception.

String `paymentTerms` on Customer/Inquiry: remain until PaymentTerms master exists; then map known literals; leave unmatched as transaction text.

---

## 24. Low-code / metadata boundary

Doc 06 / 14: **typed core + metadata overlay. No EAV.**

| Typed (Prisma) | Metadata may control |
|----------------|----------------------|
| id, code, legalName, status, FKs, isolation, mappings | labels, visibility, order, sections, optional display fields, lookup presentation |
| Preference child tables | Form layout |
| Security-critical fields | Field security overlay — **cannot** grant extra API access |

Forbidden: arbitrary customer attributes as JSON SoT; client-defined schema; bypassing RBAC via metadata.

---

## 25. Proposed domain model

```text
Customer                          (exists; evolve)
 ├── CustomerAddress[]            (new)
 ├── CustomerContact[]            (new)
 ├── CustomerCommercialProfile    (new; 1:1)
 ├── CustomerPortPreference[]     (new; DestinationPort.code)
 ├── CustomerIncotermPreference[] (new; Incoterm.code)
 ├── CustomerExternalMapping[]    (new)
 ├── CustomerUser[]               (exists; portal)
 └── customerGroupId → CustomerGroup (exists)

CustomerContact ──optional──► UserAccount     (future; not required v1)
CustomerUser     ──────────► UserAccount      (tenancy)

Reference masters
 ├── DestinationPort          EXISTS (B4-B)     LOGISTICS
 ├── Incoterm                 EXISTS (B4-B)     LOGISTICS
 ├── CostingCurrency          EXISTS            COSTING
 ├── ContainerType            EXISTS            LOGISTICS  (not a customer pref)
 ├── ShippingCostRate         EXISTS (B4-B)     LOGISTICS  (not customer-owned)
 ├── CustomerGroup            EXISTS (05I-A)    CUSTOMER
 ├── CustomerPricingTier      EXISTS            PRICING    (price group)
 ├── Country                  NEW               platform / customer setup
 ├── City                     OPEN / defer
 ├── PaymentMethod            NEW               CUSTOMER setup
 ├── PaymentTerms             NEW               CUSTOMER setup
 ├── CustomerClassification   NEW               CUSTOMER
 └── CustomerSegment          NEW               CUSTOMER
```

**Remove from Customer core (later increment, not now):** treating `defaultIncoterm`, free-text `paymentTerms`, and JSON `allowedQuotationCurrencies` as SoT — replace with profile/preferences consuming governed codes.

---

## 26. Future D365 synchronization

Respect **ADR-004**:

```text
Customer Master  →  Customer Integration Adapter  →  D365 F&O
```

**Not:** Customer domain → direct D365 HTTP.

Future concepts (design only, **not implemented**):

| Concept | Stance |
|---------|--------|
| Outbound | Create/update customer in D365 from Connect — **OPEN** if required |
| Inbound | Status/credit block from D365 — **OPEN** |
| Bidirectional | Conflict-prone; default **avoid** until evidence |
| Conflict | Last-write vs field-level — **OPEN** |
| Retry / status | On mapping row `syncStatus` |
| External ID | `CustomerExternalMapping` only |
| Adapter status | Remain `NOT_IMPLEMENTED` / `NOT_CONNECTED` until a D365 increment |

Do not decide CustTable columns, number sequences, or multi-company account structure in this document.

---

## 27. Open architectural questions

### Blocking for a first **implementation** of richer Customer Master (after this design is approved)

| ID | Question | Why blocking |
|----|----------|--------------|
| **CM-Q1** | Confirm evolve-in-place of `Customer` (this doc’s default) vs freeze B2 and add a parallel “V2 Customer” | Second authority would violate Doc 12 |
| **CM-Q2** | Whether first increment is Core+Contacts+Addresses only, leaving preferences until Incoterm/Port FKs are wired | Scope |
| **CM-Q3** | Isolation: is `customerMasterId` mandatory on new inquiries before preferences go live? | Tenancy honesty |

**CM-Q1 default if unanswered:** evolve existing `Customer`.

### Non-blocking / future

| ID | Question |
|----|----------|
| **CM-Q4** | Country master ownership (platform vs Customer vs Logistics because `DestinationPort.countryCode`) |
| **CM-Q5** | City master: none vs Country-scoped list vs free text |
| **CM-Q6** | D365 customer numbering vs Connect `code` |
| **CM-Q7** | Credit-limit ownership and whether Connect stores amount at all |
| **CM-Q8** | Tax registration validation per country |
| **CM-Q9** | NumberSequence for customer codes |
| **CM-Q10** | Payment terms/method: Customer-owned vs Finance-owned master |
| **CM-Q11** | Is `CustomerGroup` shared with D365 customer group? |
| **CM-Q12** | Legal entity / multi-company relationship on Customer vs mapping-only |
| **CM-Q13** | Customer hierarchy / parent-child / bill-to vs sell-to |
| **CM-Q14** | Portal self-service edit of addresses/contacts |
| **CM-Q15** | Contact ↔ UserAccount link |
| **CM-Q16** | `ON_HOLD` / `BLOCKED` / `PROSPECT` vs keep ACTIVE/INACTIVE for v1 |
| **CM-Q17** | Shipment-behavior preference vs B4-A modes |
| **CM-Q18** | Sync direction Connect ↔ D365 |

Do **not** silently resolve these as if they were D365-confirmed.

---

## 28. Implementation phasing

**None of this is authorized by this document.**

| Phase | Scope | Depends on |
|-------|--------|------------|
| **CM-0** | Architecture approval (this doc) | — |
| **CM-1** | Customer Core hygiene: `legalName`/`displayName`, createdBy, status policy, keep existing rows | Approval |
| **CM-2** | Country (if approved) + `CustomerAddress` | CM-1, Country decision |
| **CM-3** | `CustomerContact` + primary-contact rule | CM-1 |
| **CM-4** | Classification / Segment masters + commercial profile (no D365) | CM-1 |
| **CM-5** | PaymentTerms / PaymentMethod masters; migrate free text defaults | CM-4 |
| **CM-6** | `CustomerPortPreference` / `CustomerIncotermPreference` consuming B4-B | B4-B frozen; CM-4 |
| **CM-7** | `CustomerExternalMapping` (no adapter calls) | CM-1 |
| **CM-8** | Portal: CustomerUser UX; optional contact link | CM-3 |
| **CM-9** | Wire **suggestions** into Inquiry/DRAFT group create — never LOCKED/snapshot | CM-6, B4-A/B/C/D frozen |
| **CM-10** | D365 Customer adapter | ADR-004 increment; mapping design evidence |

Do not start CM-1 until architecture is **explicitly approved**. Do not start D365 (CM-10) from this task.

---

## 29. Architecture acceptance criteria

1. **One** canonical Customer domain (evolve existing `Customer`; no second party master).
2. **No** duplicate DestinationPort / Incoterm / CostingCurrency / ContainerType / ShippingCostRate.
3. Customer preferences **do not** override Inquiry, LOCKED shipment group, confirmed study, B4-C, FinancialOfferSnapshot, or issued quotation.
4. Transaction snapshots remain historically stable when Customer Master changes.
5. Customer isolation is **server-side** (`CustomerUser` scope); body `customerId` is not trusted for customer actors.
6. D365 is **adapter-bound** (ADR-004); no domain HTTP to F&O.
7. **No** shadow AR/GL/invoice/payment/credit engine.
8. External IDs live in `CustomerExternalMapping`, not on `Customer`.
9. Addresses and contacts are normalized children.
10. Commercial profile is separate from transactional document values.
11. Typed core + metadata overlay; **no** EAV Customer.
12. Authoritative server `AuditEvent` only.
13. **No** duplicate pricing / costing / logistics ownership (`CustomerPricingTier`, rates, ports remain with their owners).
14. Credit limit, if any, is a reference attribute only.
15. This document remains DESIGN ONLY until an implementation task is explicitly approved.

---

## 30. Stop

Do **not** implement Customer Master.  
Do **not** modify existing Customer records.  
Do **not** create a Prisma migration, API routes, UI, tests, or D365 adapters as part of this task.

---

*End of TASK 06 Customer Master architecture — DESIGN ONLY.*
