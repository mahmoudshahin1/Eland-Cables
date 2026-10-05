# Energya EPC --- D365 F&O Quote-to-Cash & Two-Way Integration Specification

**Document:** `docs/D365_FO_QUOTE_TO_CASH_INTEGRATION_SPECIFICATION.md`\
**Version:** 1.0\
**Date:** 2026-08-31\
**Status:** Architecture / Functional Design for Review

------------------------------------------------------------------------

## 1. Purpose

This specification defines how the Energya EPC application will manage
the commercial and engineering lifecycle from customer inquiry through
quotation, quotation revision, approval, sales order / sales agreement
creation, fulfillment, invoicing and Accounts Receivable integration
with Microsoft Dynamics 365 Finance & Operations (D365 F&O).

The core architectural principle is:

> **Energya Application is the system of record for cable engineering,
> configuration, costing, quotation and commercial approval. D365 F&O is
> the system of record for ERP execution, inventory, delivery,
> invoicing, Accounts Receivable and financial settlement.**

The objective is to avoid duplicating cable-manufacturing business logic
inside D365 while allowing D365 to execute the approved commercial
transaction.

------------------------------------------------------------------------

# 2. Architecture Principles

## 2.1 System ownership

  Domain                                     System of Record
  ------------------------------------------ ------------------
  Customer financial account                 D365 F&O
  Customer credit status                     D365 F&O
  Payment terms                              D365 F&O
  Tax / fiscal setup                         D365 F&O
  Inventory / warehouse execution            D365 F&O
  Cable engineering configuration            Energya
  Technical parameters / dependency matrix   Energya
  Engineering revision                       Energya
  Cable BOM governance                       Energya
  Costing                                    Energya
  Raw-material pricing used by costing       Energya
  Drum optimization                          Energya
  Cutting-length logic                       Energya
  Customer technical specification           Energya
  Inquiry                                    Energya
  Quotation                                  Energya
  Quotation revision                         Energya
  Quotation approval                         Energya
  Commercial fulfillment decision            Energya
  Sales order commercial snapshot            Energya
  D365 sales-order execution                 D365 F&O
  Delivery / packing slip                    D365 F&O
  Customer invoice                           D365 F&O
  Accounts Receivable                        D365 F&O
  Payment / settlement                       D365 F&O

## 2.2 No duplicated engineering engine

The cable configuration, engineering validation, BOM, costing, drum and
cutting logic must remain in Energya.

D365 must not independently reproduce these rules.

D365 receives the approved commercial and technical references required
to execute the order.

------------------------------------------------------------------------

# 3. End-to-End Business Process

``` text
Customer
   |
   v
Inquiry
   |
   v
Cable Configuration
   |
   +--> Engineering Validation
   |
   +--> Governed BOM
   |
   +--> Costing
   |
   +--> Drum / Cutting Requirements
   |
   v
Quotation Rev 1
   |
   +--> Revision Rev 2 ... Rev N
   |
   v
Approval
   |
   +-----------------------------+
   |                             |
   v                             v
DIRECT SALES ORDER          SALES AGREEMENT
   |                             |
   v                             v
EPC Sales Order             EPC Agreement
   |                             |
   |                       Release Order
   |                             |
   +-------------+---------------+
                 |
                 v
          D365 F&O Sales Order
                 |
                 v
          Delivery / Packing Slip
                 |
                 v
              Invoice
                 |
                 v
        Accounts Receivable
                 |
                 v
             Payment
                 |
                 v
            Settlement
```

------------------------------------------------------------------------

# 4. Inquiry-to-Quotation

The inquiry is the commercial starting point and contains the
cable-manufacturing requirements.

An inquiry can include:

-   Customer
-   Customer contact
-   Customer reference
-   Requested cable
-   Cable configuration
-   Technical parameters
-   Voltage
-   Conductor
-   Conductor size
-   Number of cores
-   Insulation
-   Screen
-   Armour
-   Sheath
-   Core colours
-   Quantity
-   Total requested length
-   Cutting lengths
-   Number of cuts
-   Drum requirements
-   Delivery requirements
-   Destination
-   Incoterm
-   Currency
-   Payment terms
-   Required delivery date
-   Customer specification
-   Attachments
-   Technical notes
-   Commercial notes

The quotation must reference the originating inquiry.

------------------------------------------------------------------------

# 5. Quotation Model

## 5.1 Quotation header

Recommended fields:

  Field               Description
  ------------------- ---------------------------------
  quotationId         Internal unique identifier
  quotationNumber     Human-readable quotation number
  customerId          EPC customer
  customerReference   Customer RFQ/reference
  inquiryId           Source inquiry
  quotationDate       Creation date
  validFrom           Validity start
  validTo             Validity end
  currency            Transaction currency
  paymentTerms        Commercial payment terms
  deliveryTerms       Delivery terms
  incoterm            Incoterm
  salesPerson         Responsible salesperson
  billToCustomer      Bill-to account
  shipToAddress       Delivery address
  status              Lifecycle status
  approvalStatus      Approval status
  fulfillmentType     DIRECT_ORDER or SALES_AGREEMENT
  totalAmount         Quotation total
  createdBy           User
  approvedBy          Approver
  approvedAt          Approval timestamp

## 5.2 Quotation line

Each quotation line must contain:

### Product

-   Cable material number
-   Cable item code
-   Cable description
-   Customer cable code

### Engineering snapshot

-   Configuration ID
-   Engineering revision
-   Technical specification ID
-   BOM version
-   Cable family
-   Voltage
-   Conductor
-   Conductor size
-   Number of cores
-   Insulation
-   Screen
-   Armour
-   Sheath
-   Core colours
-   Relevant technical parameters

### Quantity and manufacturing requirements

-   Ordered quantity
-   Sales UOM
-   Total cable length
-   Cutting length
-   Number of cuts
-   Drum type
-   Drum size
-   Drum quantity
-   Drum length
-   Drum weight
-   Packaging requirements
-   Delivery date
-   Delivery site

### Commercial

-   Unit price
-   Price UOM
-   Discount
-   Net price
-   Line amount
-   Currency

### Costing snapshot

-   Costing ID
-   Costing revision
-   Costing date
-   Costing currency
-   Material cost
-   Total cost
-   Margin
-   Selling price
-   Pricing basis

------------------------------------------------------------------------

# 6. Quotation Revision Control

Quotation revisions are immutable commercial snapshots.

Example:

``` text
QT-2026-00145 Rev 1
QT-2026-00145 Rev 2
QT-2026-00145 Rev 3
```

Only one revision can be the approved revision.

An approved revision must not be overwritten.

If any material commercial, engineering or technical information
changes, create a new revision.

## 6.1 Revision states

``` text
DRAFT
   |
   v
UNDER_REVIEW
   |
   v
PENDING_APPROVAL
   |
   v
APPROVED
```

Alternative outcomes:

``` text
REJECTED
EXPIRED
CANCELLED
SUPERSEDED
```

Once Rev 3 is approved:

``` text
Rev 1 = SUPERSEDED
Rev 2 = SUPERSEDED
Rev 3 = APPROVED
```

------------------------------------------------------------------------

# 7. Frozen Approval Snapshot

Approval must freeze the references used to create the commercial offer.

The approved quotation must capture:

-   Engineering revision
-   Configuration ID
-   BOM version
-   Costing ID
-   Costing revision
-   Raw-material price references
-   FX references where applicable
-   Costing currency
-   Selling price
-   Margin
-   Drum configuration
-   Cutting configuration
-   Technical specification
-   Customer requirements

This guarantees that a later change to engineering or costing does not
silently change the approved commercial offer.

------------------------------------------------------------------------

# 8. Approval Decision: Sales Order or Agreement

At quotation approval, the user must explicitly select:

``` text
Fulfillment Type

( ) Direct Sales Order

( ) Sales Agreement
```

This decision is stored permanently against the approved quotation
revision.

## 8.1 Direct Sales Order

``` text
Approved Quotation
       |
       v
Create Sales Order
       |
       v
EPC Sales Order
       |
       v
D365 Sales Order
```

## 8.2 Sales Agreement

``` text
Approved Quotation
       |
       v
Create Sales Agreement
       |
       v
EPC Sales Agreement
       |
       v
D365 Sales Agreement
       |
       v
Release Order
       |
       v
EPC Sales Order
       |
       v
D365 Sales Order
```

------------------------------------------------------------------------

# 9. Why Agreement Is Different

A sales agreement should be used where the customer makes a longer-term
quantity or value commitment but expects separate releases.

Example:

``` text
Agreement:
1,000 km

Release 1: 250 km
Release 2: 250 km
Release 3: 250 km
Release 4: 250 km
```

The quotation remains the commercial origin.

The agreement represents the commitment.

Each release creates an executable sales order.

------------------------------------------------------------------------

# 10. Multiple Sales Orders from One Quotation

The model must support:

``` text
Quotation QT-100
Approved
Total = 1,000 km

    |
    +--> SO-001 = 300 km
    +--> SO-002 = 200 km
    +--> SO-003 = 250 km
    +--> SO-004 = 250 km
```

Therefore the database must not enforce a simple one-to-one
quotation-to-order relationship.

Recommended relationship:

``` text
Quotation
   |
   v
Approved Commercial Commitment
   |
   +--> Direct Sales Orders
   |
   +--> Sales Agreement
             |
             +--> Release Sales Orders
```

------------------------------------------------------------------------

# 11. Commercial Commitment

Introduce a domain object between the approved quotation and
fulfillment.

## 11.1 Commercial Commitment

Recommended fields:

``` text
commitmentId
quotationId
quotationRevision
customerId
fulfillmentType
currency
totalCommittedQuantity
totalCommittedAmount
effectiveDate
expirationDate
status
d365DocumentNumber
d365RecordId
createdAt
approvedAt
```

## 11.2 Fulfillment types

``` text
DIRECT_ORDER
SALES_AGREEMENT
```

------------------------------------------------------------------------

# 12. Sales Order in Energya

The EPC Sales Order is created from the approved quotation snapshot.

It must copy, not dynamically re-read, the approved quotation's critical
commercial and technical data.

## 12.1 Header

``` text
salesOrderId
salesOrderNumber
sourceQuotationId
sourceQuotationNumber
sourceQuotationRevision
sourceInquiryId
customerId
currency
paymentTerms
deliveryTerms
incoterm
billTo
shipTo
requestedDeliveryDate
status
d365SalesOrderNumber
d365Company
integrationStatus
```

## 12.2 Line

``` text
salesOrderLineId
salesOrderId
quotationLineId
cableMaterialNumber
itemCode
description
customerCableCode
quantity
uom
unitPrice
discount
netPrice
lineAmount

configurationId
engineeringRevision
bomVersion
technicalSpecificationId

totalLength
cuttingLength
numberOfCuts

drumType
drumSize
drumQuantity
drumLength
drumWeight

costingId
costingRevision
```

------------------------------------------------------------------------

# 13. Copy Rules

When an approved quotation creates a sales order:

### Copy directly

-   Customer
-   Currency
-   Payment terms
-   Delivery terms
-   Incoterm
-   Bill-to
-   Ship-to
-   Requested delivery date
-   Cable item
-   Quantity
-   UOM
-   Price
-   Discount
-   Technical snapshot
-   Configuration ID
-   Engineering revision
-   BOM version
-   Costing ID
-   Drum requirements
-   Cutting requirements
-   Customer cable code
-   Customer reference

### Generate new

-   Sales order ID
-   Sales order number
-   Order creation timestamp
-   D365 integration ID
-   D365 sales order number
-   Integration status

The quotation itself remains unchanged.

------------------------------------------------------------------------

# 14. D365 Integration Boundary

D365 should receive the minimum information required for ERP execution
plus traceability references to the Energya source document.

## 14.1 Standard D365 data

Map to native D365 fields/entities where available:

-   Customer account
-   Invoice account
-   Currency
-   Payment terms
-   Delivery terms
-   Delivery address
-   Warehouse
-   Site
-   Item number
-   Quantity
-   Unit
-   Sales price
-   Discount
-   Requested ship date
-   Requested receipt date
-   Tax-related fields
-   Financial dimensions

## 14.2 EPC extension data

Use a small custom D365 extension for EPC-specific traceability.

Recommended sales-order header extension:

``` text
EPCQuotationNumber
EPCQuotationRevision
EPCInquiryNumber
EPCConfigurationId
EPCEngineeringRevision
EPCBOMVersion
EPCCostingId
EPCSourceSystem
EPCSourceDocumentId
```

Recommended sales-order line extension:

``` text
EPCQuotationLineId
EPCConfigurationId
EPCTechnicalSpecificationId
EPCDrumId
EPCDrumType
EPCDrumLength
EPCDrumQuantity
EPCCuttingLength
EPCNumberOfCuts
```

Only fields that are operationally required in D365 should be duplicated
there.

------------------------------------------------------------------------

# 15. Recommended D365 Custom Tables

Keep customization small.

Potential tables:

``` text
EPCSalesOrderExtension
EPCSalesOrderLineExtension
EPCSalesAgreementExtension
EPCSalesAgreementLineExtension
```

These tables should primarily provide:

-   EPC document references
-   engineering references
-   quotation references
-   configuration references
-   drum/cutting references
-   integration traceability

Do not reproduce the full Energya engineering model inside D365.

------------------------------------------------------------------------

# 16. Two-Way Integration

## 16.1 Energya to D365

Primary outbound transactions:

``` text
Customer reference validation
Sales Agreement
Sales Order
Sales Order update where permitted
Cancellation / requested cancellation
Release Order
```

## 16.2 D365 to Energya

Primary inbound information:

``` text
D365 document number
Creation status
D365 validation errors
Order confirmation status
Warehouse / site
Inventory status
Delivery status
Packing slip
Invoice
Invoice number
Invoice date
Invoice amount
Outstanding AR
Payment status
Settlement status
Credit information where exposed
```

------------------------------------------------------------------------

# 17. Integration Architecture

Use an asynchronous integration pattern.

``` text
Energya Application
       |
       v
Integration Command
       |
       v
Integration Queue
       |
       v
D365 Adapter
       |
       v
D365 API / Data Entity
       |
       v
D365 F&O
       |
       v
D365 Business/Data Event
       |
       v
Integration Listener
       |
       v
Energya
```

Do not make the user interface dependent on a long synchronous D365
request.

The user should see:

``` text
Order Created
Integration Status: QUEUED
```

followed by:

``` text
Integration Status: SYNCED
D365 Sales Order: SO-00084521
```

------------------------------------------------------------------------

# 18. Integration Status

Every integrated document must have:

``` text
NOT_SENT
QUEUED
PROCESSING
SYNCED
FAILED
RETRY_REQUIRED
CANCELLED
```

Recommended fields:

``` text
integrationId
sourceSystem
sourceDocumentType
sourceDocumentId
sourceDocumentNumber
targetSystem
targetDocumentType
targetDocumentId
targetDocumentNumber
status
lastAttemptAt
lastSuccessAt
retryCount
lastErrorCode
lastErrorMessage
createdAt
updatedAt
```

------------------------------------------------------------------------

# 19. Idempotency

This is mandatory.

A repeated integration request must not create duplicate D365 documents.

Example:

``` text
Energya SO:
SO-2026-00451
```

If the integration request is sent twice, D365 must still contain only
one corresponding order.

Use a unique integration key such as:

``` text
EPC + Company + DocumentType + SourceDocumentId
```

Example:

``` text
EPC|EPC|SALES_ORDER|SO-2026-00451
```

The integration layer must check this key before creating a new D365
transaction.

------------------------------------------------------------------------

# 20. Integration Error Scenarios

At minimum handle:

### Customer

``` text
Customer does not exist in D365
Customer blocked
Customer credit restriction
```

### Product

``` text
Item does not exist
Item not released to legal entity
Item blocked
Invalid unit
```

### Commercial

``` text
Currency missing
Payment terms missing
Delivery terms invalid
Invalid price
Invalid tax configuration
```

### Warehouse

``` text
Warehouse missing
Site missing
Invalid inventory dimensions
```

### Technical

``` text
D365 API timeout
Authentication failure
Network failure
Validation failure
Duplicate request
Unexpected D365 response
```

All errors must be visible from the EPC Integration Monitor.

------------------------------------------------------------------------

# 21. Integration Monitor

Recommended screen:

``` text
Integration Monitor

Document          Type          Status       D365 No.       Last Attempt
--------------------------------------------------------------------------
SO-2026-00451     Sales Order   SYNCED       SO-00084521     10:21
AGR-2026-0012     Agreement     SYNCED       AGR-000087      10:18
SO-2026-00452     Sales Order   FAILED       -               10:25
```

For failed transactions:

``` text
Error:
Customer account ABC123 is blocked.

Actions:
[Retry]
[View Payload]
[View Error]
[View Source Document]
```

------------------------------------------------------------------------

# 22. Accounts Receivable

AR remains D365-owned.

Energya should consume financial information from D365 rather than
maintaining an independent AR ledger.

Customer financial view:

``` text
Customer
   |
   +--> Open Invoices
   +--> Outstanding Balance
   +--> Overdue Balance
   +--> Aging
   +--> Credit Limit
   +--> Available Credit
   +--> Last Payment
   +--> Payment Status
```

Suggested aging buckets:

``` text
Current
1–30
31–60
61–90
90+
```

The values should originate from D365.

------------------------------------------------------------------------

# 23. Invoice Flow

``` text
EPC Sales Order
       |
       v
D365 Sales Order
       |
       v
Warehouse / Production
       |
       v
Packing Slip / Delivery
       |
       v
D365 Customer Invoice
       |
       v
Accounts Receivable
       |
       v
Payment
       |
       v
Settlement
```

Energya receives the resulting invoice and payment status through
integration.

------------------------------------------------------------------------

# 24. Agreement Release Process

For an agreement:

``` text
Approved Quotation
       |
       v
Agreement
       |
       v
Customer requests release
       |
       v
Validate remaining commitment
       |
       v
Create Sales Order
       |
       v
Copy approved technical/commercial snapshot
       |
       v
D365 Sales Order
```

The release must validate:

``` text
Released quantity
+
Previously released quantity
<=
Committed quantity
```

unless an authorized business exception exists.

------------------------------------------------------------------------

# 25. Agreement Quantity Tracking

Example:

``` text
Agreement Commitment: 1,000 km

Released:
250 km
200 km
150 km

Total Released = 600 km
Remaining = 400 km
```

The application should display:

``` text
Committed     1,000 km
Released        600 km
Remaining       400 km
```

This should be reconciled against D365.

------------------------------------------------------------------------

# 26. Security and Authorization

Customer users must not be allowed to:

-   Create D365 transactions directly
-   Modify approved quotations
-   Modify frozen costing
-   Modify engineering revisions
-   Change approved prices
-   Create sales orders outside approved commercial documents

Internal roles:

``` text
Sales
Technical Office
Costing
Finance
Approver
IT / Integration Administrator
```

Approval authority should be configurable by business rules.

------------------------------------------------------------------------

# 27. Audit Trail

Record:

``` text
Quotation created
Quotation revised
Quotation submitted
Quotation approved
Quotation rejected
Fulfillment type selected
Sales order created
Agreement created
Agreement release created
Integration submitted
Integration succeeded
Integration failed
D365 number assigned
Order cancelled
```

Each audit record:

``` text
User
Timestamp
Action
Document
Old Value
New Value
Reason / Comment
```

------------------------------------------------------------------------

# 28. API Contract --- Logical Design

## Create Sales Order

``` http
POST /api/integration/d365/sales-orders
```

Payload concept:

``` json
{
  "sourceDocumentId": "SO-2026-00451",
  "sourceQuotationId": "QT-2026-00145",
  "sourceQuotationRevision": 3,
  "customerId": "CUST001",
  "currency": "EUR",
  "fulfillmentType": "DIRECT_ORDER",
  "lines": [
    {
      "itemNumber": "CABLE-001",
      "quantity": 100,
      "uom": "KM",
      "unitPrice": 1250,
      "configurationId": "CFG-001",
      "engineeringRevision": 4,
      "bomVersion": 7,
      "costingId": "CST-0021",
      "cuttingLength": 1000,
      "drumType": "DRUM-A",
      "drumQuantity": 10
    }
  ]
}
```

The actual implementation must follow the final D365 legal-entity,
entity and API configuration.

------------------------------------------------------------------------

# 29. API Contract --- Agreement

``` http
POST /api/integration/d365/sales-agreements
```

Logical payload:

``` json
{
  "sourceQuotationId": "QT-2026-00146",
  "sourceQuotationRevision": 3,
  "customerId": "CUST001",
  "currency": "EUR",
  "commitmentQuantity": 1000,
  "uom": "KM",
  "validFrom": "2026-09-01",
  "validTo": "2027-08-31",
  "lines": []
}
```

------------------------------------------------------------------------

# 30. API Contract --- Agreement Release

``` http
POST /api/sales-agreements/{id}/releases
```

Logical data:

``` json
{
  "quantity": 250,
  "requestedDeliveryDate": "2027-01-15",
  "shipTo": "...",
  "drumRequirements": [],
  "cuttingRequirements": []
}
```

The release generates an EPC Sales Order and subsequently a D365 Sales
Order.

------------------------------------------------------------------------

# 31. Data Consistency Rules

The following must always be true:

### Rule 1

An approved sales order must originate from an approved quotation
revision or authorized agreement release.

### Rule 2

A sales order cannot reference a draft quotation.

### Rule 3

An approved quotation revision cannot be edited.

### Rule 4

A D365 order must have a unique EPC source reference.

### Rule 5

D365 document creation must be idempotent.

### Rule 6

The technical snapshot used for the order must remain traceable.

### Rule 7

The application must retain the D365 document number.

### Rule 8

Financial execution remains D365-owned.

------------------------------------------------------------------------

# 32. Recommended Database Relationships

``` text
Inquiry
   |
   +----< Quotation
             |
             +----< QuotationRevision
                         |
                         +----< QuotationLine
                         |
                         +---- CommercialCommitment
                                      |
                                      +----< SalesOrder
                                      |
                                      +---- SalesAgreement
                                               |
                                               +----< SalesOrder
```

Recommended additional references:

``` text
QuotationLine
   |
   +--> Configuration
   +--> EngineeringRevision
   +--> BOMVersion
   +--> Costing
   +--> DrumConfiguration
   +--> CuttingPlan
   +--> TechnicalSpecification
```

------------------------------------------------------------------------

# 33. Important Design Decision: Snapshot vs Live References

The application should maintain both:

### Reference

``` text
configurationId
engineeringRevision
bomVersion
costingId
```

and

### Snapshot

The approved quotation/order should retain the relevant values at
approval time.

Reason:

If the cable configuration changes six months later, the historical
order must still represent exactly what the customer approved.

------------------------------------------------------------------------

# 34. D365 Customization Strategy

D365 customization should be limited to:

1.  EPC document references
2.  EPC quotation reference
3.  EPC quotation revision
4.  EPC inquiry reference
5.  Configuration reference
6.  Engineering revision reference
7.  BOM version reference
8.  Costing reference
9.  Drum/cutting references where operationally required
10. Integration status / traceability

Avoid implementing:

-   Cable configurator
-   Technical parameter dependency engine
-   Costing engine
-   Drum optimizer
-   Cutting optimizer
-   Quotation revision engine

inside D365.

------------------------------------------------------------------------

# 35. D365 Integration Technology

The implementation team should evaluate the available D365 integration
mechanisms during technical design, including:

-   D365 data entities
-   OData
-   Custom service/API where justified
-   Business events
-   Data events
-   Batch/data management where appropriate

The final mechanism should be selected per transaction based on
throughput, transactionality, validation requirements, latency and
operational support.

------------------------------------------------------------------------

# 36. Required Cursor Implementation Phases

Do not implement everything in one step.

## Phase 1 --- Domain Model

Implement:

-   Quotation
-   Quotation Revision
-   Quotation Line
-   Approval
-   Commercial Commitment
-   Sales Order
-   Sales Agreement
-   Agreement Release

No D365 integration yet.

**Platform note (Energya Phase 1 extension, pre-freeze):** Sales Orders also support a **Direct MTS** entry point with no quotation and no Commercial Commitment (`orderOrigin=DIRECT_MTS`, `orderFulfillmentMode=MTS`), gated by cable `fulfillmentPolicy` (`MTS` / `MTO_MTS`). Quotation and agreement paths remain MTO and still require Commercial Commitment. Order Origin and Order Fulfillment Mode are distinct concepts. D365 remains out of scope for Phase 1.

## Phase 2 --- Quotation UI

Implement:

-   Quotation creation
-   Revision management
-   Engineering snapshot
-   Costing snapshot
-   Approval
-   Fulfillment decision

## Phase 3 --- Sales Order

Implement:

-   Create from approved quotation
-   Copy snapshot
-   Multiple orders per quotation
-   Order lifecycle

## Phase 4 --- Agreement

Implement:

-   Agreement creation
-   Commitment quantity/value
-   Release orders
-   Remaining commitment
-   Release history

## Phase 5 --- D365 Adapter

Implement:

-   Customer mapping
-   Item mapping
-   Sales order creation
-   Agreement creation
-   Release order integration
-   D365 response handling

## Phase 6 --- Two-Way Synchronization

Implement:

-   Order status
-   Delivery status
-   Packing slip
-   Invoice
-   AR
-   Payment
-   Settlement

## Phase 7 --- Integration Monitor

Implement:

-   Queue
-   Retry
-   Error details
-   Payload audit
-   D365 references
-   Reconciliation

------------------------------------------------------------------------

# 37. Acceptance Criteria

The implementation is acceptable only when the following scenarios work.

### Scenario A --- Direct order

``` text
Inquiry
→ Quotation Rev 1
→ Approval
→ Select Direct Sales Order
→ EPC Sales Order
→ D365 Sales Order
→ D365 Number returned
```

### Scenario B --- Agreement

``` text
Inquiry
→ Quotation Rev 2
→ Approval
→ Select Sales Agreement
→ EPC Agreement
→ D365 Agreement
→ Release 250 km
→ EPC Sales Order
→ D365 Sales Order
```

### Scenario C --- Revision

``` text
Quotation Rev 1
→ Customer requests change
→ Rev 2
→ Rev 1 remains immutable
→ Rev 2 approved
→ Order created from Rev 2
```

### Scenario D --- Multiple orders

``` text
Approved Quotation
→ SO 1
→ SO 2
→ SO 3
```

### Scenario E --- Duplicate integration

``` text
EPC SO sent twice
→ One D365 SO only
```

### Scenario F --- D365 failure

``` text
EPC SO
→ Integration
→ D365 validation error
→ Status FAILED
→ Error visible
→ Retry after correction
```

### Scenario G --- AR

``` text
D365 Invoice
→ Energya invoice status
→ Outstanding amount
→ Payment
→ Settlement
```

------------------------------------------------------------------------

# 38. Final Architecture Decision

The target model is:

``` text
                 ENERGYA APPLICATION
        ┌─────────────────────────────────┐
        │                                 │
        │ Inquiry                         │
        │ Cable Configuration             │
        │ Engineering                     │
        │ BOM                             │
        │ Costing                         │
        │ Drum / Cutting                  │
        │ Quotation                       │
        │ Revision                        │
        │ Approval                        │
        │ Commercial Commitment           │
        │ Sales Order / Agreement         │
        │                                 │
        └───────────────┬─────────────────┘
                        │
                 Integration Layer
                        │
                        ▼
                 ┌──────────────┐
                 │   D365 F&O   │
                 │              │
                 │ Sales Order  │
                 │ Agreement    │
                 │ Inventory    │
                 │ Delivery     │
                 │ Invoice      │
                 │ AR           │
                 │ Payments     │
                 │ Settlement   │
                 └──────────────┘
```

The application therefore becomes the **commercial and engineering front
office**, while D365 remains the **ERP execution and financial back
office**.

------------------------------------------------------------------------

# 39. Implementation Guardrails for Cursor

Cursor must follow these rules:

1.  Do not modify the existing Cable Configuration Engine unless
    explicitly required.
2.  Do not duplicate engineering logic in D365.
3.  Do not create a Sales Order from a non-approved quotation.
4.  Do not modify approved quotation revisions.
5.  Always retain source quotation and revision references.
6.  Always preserve engineering/BOM/costing snapshot references.
7.  Support both `DIRECT_ORDER` and `SALES_AGREEMENT`.
8.  Support multiple Sales Orders from one quotation where authorized.
9.  Support multiple release orders from one Sales Agreement.
10. Make D365 integration idempotent.
11. Never treat D365 as the source of truth for Energya engineering.
12. Never treat Energya as the accounting ledger.
13. Keep D365 customization minimal.
14. Log every integration request and response.
15. Never silently retry a transaction that could create a duplicate
    document.
16. Provide reconciliation between EPC and D365 document numbers.
17. Preserve historical commercial and technical snapshots.
18. All new implementation must include automated tests for the
    acceptance scenarios in this document.

------------------------------------------------------------------------

# 40. Reference Documentation

The implementation team should validate the design against the current
Microsoft Dynamics 365 Finance & Operations documentation, particularly:

-   Sales quotations
-   Sales orders
-   Sales agreements
-   Sales order header and line data entities
-   OData
-   Business/data events
-   Order-to-cash
-   Accounts Receivable

Microsoft Learn:
https://learn.microsoft.com/en-us/dynamics365/supply-chain/sales-marketing/tasks/create-edit-sales-quotations

Sales agreements:
https://learn.microsoft.com/en-us/dynamics365/supply-chain/sales-marketing/sales-agreements

Sales order headers V2:
https://learn.microsoft.com/en-us/dynamics365/fin-ops-core/dev-itpro/data-entities/entity-sales-order-headers-v2-salesorderheaderv2

Sales order lines V2:
https://learn.microsoft.com/en-us/dynamics365/fin-ops-core/dev-itpro/data-entities/entity-sales-order-lines-v2-salesorderline

OData:
https://learn.microsoft.com/en-us/dynamics365/fin-ops-core/dev-itpro/data-entities/odata

Order-to-cash:
https://learn.microsoft.com/en-us/dynamics365/guidance/business-processes/order-to-cash-invoice-sales-orders-overview

------------------------------------------------------------------------

## Document Status

**Version 1.0 --- Architecture baseline**

This document is intended to be used by the Energya product team, Cursor
development workflow, D365 functional consultant and D365
technical/integration consultant as the baseline for detailed
implementation design.

Before production integration, the D365 team must validate the exact
legal entity, data entities, fields, configuration dependencies,
security roles, integration endpoint strategy and transaction behavior
in the target D365 environment.
