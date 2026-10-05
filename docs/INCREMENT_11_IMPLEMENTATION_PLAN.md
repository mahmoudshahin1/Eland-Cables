# Increment 11 — Commercial Inquiry & Quotation Foundation: Implementation Plan

> **Phase A Discovery & Architecture Plan**  
> Status: Completed Discovery. Ready for Phase B Implementation.

---

## 1. Executive Summary & Boundaries

Increment 11 connects customer RFQ commercial inquiries and sales quotation workflows to the PostgreSQL governed Cable Master, Cable Authority (`evaluateCableAuthority`), Technical Office Request, and Costing Engine (`calculateCableManufacturingCost`) architectures.

### Strict Boundaries & Non-Negotiables:
- **NO Commercial Selling Price / Discount / Margin Calculation**: Material Cost is NOT Selling Price. Margins, markups, commercial discounts, customer-specific price rules, and sales commissions remain strictly `NOT_CONFIGURED` / out of scope.
- **NO Automatic Drum Formulas**: Drum selection remains `CONFIGURATION_REQUIRED`.
- **NO D365 / MES / WMS / Planning Integrations**: Stubs remain isolated.
- **NO UI Redesign**: The approved Energya logo, white theme, Inter typography, header, full-page login, and navigation hierarchy remain 100% protected.

---

## 2. Phase A Discovery Findings

### 2.1 Current Inquiry & Quotation Architecture
- **State in Prototype**: Inquiries and Quotations were historically stored in localStorage and mock arrays as combined `ErpRequestHeader` / `ErpRequestItem` documents (`src/types.ts`, `src/services/inquiryQuotationHomeService.ts`, `src/components/common/ErpCustomerRequestView.tsx`).
- **Shortcomings in Prototype**:
  - Overwrites `versionNo` in-place on the same record instead of preserving immutable historical versions.
  - Mixes inquiry status and quotation status into single free-text fields.
  - Uses client-side hardcoded arrays (`INITIAL_ERP_REQUESTS`) without multi-tenant PostgreSQL persistence or server-side ownership enforcement.
  - Lacks direct relational foreign keys to `TechnicalOfficeRequest`, `CostingRun`, and authoritative `CableMaster`.

### 2.2 Reusable Existing Components
- `evaluateCableAuthority` (`src/domain/cableAuthority.ts`): Authoritative 4-state cable existence evaluation.
- `createTechnicalOfficeRequest` (`src/server/masterDataRepository.ts`): Reused directly when unmapped technically valid cables are submitted from inquiry lines.
- `evaluateCableCostingReadiness` (`src/server/governanceRepository.ts`): 4-gate readiness evaluation.
- `executeCostingRun` (`src/server/costingRepository.ts`): Governed raw material manufacturing cost calculator.
- `AuditEvent` (`src/platform/audit/auditLogService.ts`): Immutable audit logging.
- `InquiryQuotationWorkspace` / `InquiryQuotationHome` / `ErpCustomerRequestView`: Established presentation layer.

### 2.3 Migration Strategy from Prototype Storage
- Existing mock records are preserved for backward compatibility and seed defaults.
- A seamless dual-read repository pattern allows the workspace to read from PostgreSQL when available, falling back safely without data destruction.

---

## 3. PostgreSQL Database Schema Design

### 3.1 Migration: `20260820090000_increment11_inquiry_quotation`

```prisma
enum InquiryStatus {
  DRAFT
  SUBMITTED
  UNDER_REVIEW
  QUOTED
  CLOSED
  CANCELLED
}

enum InquiryLineStatus {
  DRAFT
  CONFIGURATION_REQUIRED
  TECHNICAL_OFFICE_REQUIRED
  CABLE_VALIDATED
  COSTING_NOT_READY
  COSTING_READY
  READY_FOR_QUOTATION
  CANCELLED
}

enum QuotationStatus {
  DRAFT
  OPEN
  SUBMITTED
  ACCEPTED
  REJECTED
  SUPERSEDED
  CANCELLED
}

model CommercialInquiry {
  id                    String            @id @default(cuid())
  inquiryNumber         String            @unique // e.g. INQ-2026-XXXX
  customerId            String            // e.g. u-cust-eland or customer user/company ID
  customerName          String            // e.g. ELAND Cables
  contactPerson         String?
  customerReference     String?           // e.g. RFQ-ELAND-884
  inquiryDate           DateTime          @default(now())
  requestedDeliveryDate DateTime?
  currency              String            @default("USD")
  incoterms             String?           @default("FOB")
  paymentTerms          String?           @default("LC at sight")
  deliveryTerms         String?           @default("CIF Alexandria")
  projectName           String?
  status                InquiryStatus     @default(DRAFT)
  notes                 String?
  createdBy             String?
  createdAt             DateTime          @default(now())
  updatedAt             DateTime          @updatedAt

  lines                 CommercialInquiryLine[]
  quotations            CommercialQuotation[]

  @@index([customerId])
  @@index([status])
  @@index([inquiryDate])
}

model CommercialInquiryLine {
  id                      String            @id @default(cuid())
  inquiryId               String
  inquiry                 CommercialInquiry @relation(fields: [inquiryId], references: [id], onDelete: Cascade)
  lineNumber              Int               @default(1)
  
  // Cable Master Link (Path A) or Unmapped Configuration (Path B)
  materialNumber          String?
  customerCode            String?
  itemCode                String?
  cableDescription        String
  
  // Requested Quantities
  requestedQuantity       Decimal           @default(1)
  quantityUom             String            @default("KM")
  requestedLengthMeters   Decimal           @default(1000)
  cuttingLengthMeters     Decimal?
  drumType                String?           @default("Wood Reel 220")
  
  // Technical Office & Governance
  configurationPayload    Json?
  cableAuthorityStatus    String            @default("CONFIGURATION_REQUIRED") // EXISTING_CABLE, TECHNICALLY_VALID_NOT_MASTER, etc.
  technicalOfficeRequestId String?
  
  // Costing & Feasibility Link
  costingReadinessStatus  String            @default("NOT_READY")
  costingRunId            String?
  materialCost            Decimal?
  materialCostCurrency    String?           @default("USD")
  
  status                  InquiryLineStatus @default(DRAFT)
  notes                   String?
  createdAt               DateTime          @default(now())
  updatedAt               DateTime          @updatedAt

  quotationLines          CommercialQuotationLine[]

  @@index([inquiryId])
  @@index([materialNumber])
  @@index([status])
}

model CommercialQuotation {
  id                      String            @id @default(cuid())
  quotationNumber         String            // e.g. QUO-2026-8841 (Base commercial identity)
  inquiryId               String
  inquiry                 CommercialInquiry @relation(fields: [inquiryId], references: [id])
  customerId              String
  customerName            String
  contactPerson           String?
  versionNo               Int               @default(1)
  isCurrent               Boolean           @default(true)
  supersedesQuotationId   String?
  
  status                  QuotationStatus   @default(DRAFT)
  currency                String            @default("USD")
  incoterms               String?           @default("FOB")
  paymentTerms            String?           @default("LC at sight")
  deliveryTerms           String?           @default("CIF Alexandria")
  validUntil              DateTime?
  
  // Commercial Boundary Notes
  materialCostTotal       Decimal           @default(0)
  commercialPricingStatus String            @default("NOT_CONFIGURED")
  sellingPrice            Decimal?          // Null in Increment 11 (material cost is NOT selling price)
  
  quotationOwner          String?
  remarks                 String?
  createdBy               String?
  createdAt               DateTime          @default(now())
  updatedAt               DateTime          @updatedAt

  lines                   CommercialQuotationLine[]

  @@unique([quotationNumber, versionNo])
  @@index([inquiryId])
  @@index([customerId])
  @@index([isCurrent])
  @@index([status])
}

model CommercialQuotationLine {
  id                      String              @id @default(cuid())
  quotationId             String
  quotation               CommercialQuotation @relation(fields: [quotationId], references: [id], onDelete: Cascade)
  lineNumber              Int                 @default(1)
  inquiryLineId           String?
  inquiryLine             CommercialInquiryLine? @relation(fields: [inquiryLineId], references: [id])
  
  materialNumber          String?
  itemDescription         String
  quantity                Decimal             @default(1)
  quantityUom             String              @default("KM")
  lengthMeters            Decimal             @default(1000)
  
  // Governed Costing Link
  costingRunId            String?
  materialCost            Decimal?
  materialCostCurrency    String?             @default("USD")
  
  // Commercial Line State
  commercialStatus        String              @default("MATERIAL_COST_AVAILABLE")
  sellingPrice            Decimal?            // Strictly Null in Increment 11
  notes                   String?
  createdAt               DateTime            @default(now())

  @@index([quotationId])
}
```

---

## 4. Domain & Workflow Architecture

```
1. Customer / Sales creates CommercialInquiry (Status = DRAFT)
2. Add InquiryLine:
   ├── PATH A (Existing Cable): Select materialNumber -> evaluateCableAuthority()
   │     └── If EXISTING_CABLE: cableAuthorityStatus = "EXISTING_CABLE"
   └── PATH B (New Configuration): Build parameters -> evaluateCableAuthority()
         ├── If TECHNICALLY_VALID_NOT_MASTER: Creates TechnicalOfficeRequest & links ID
         └── If INVALID_CONFIGURATION: Blocks progression
3. Check Costing Feasibility:
   └── evaluateCableCostingReadiness() / executeCostingRun() -> updates materialCost & costingRunId
4. Inquiry Submit: Validates all lines have Cable Authority status or TO request.
5. Create CommercialQuotation (Version 1, isCurrent = true):
   └── Populates lines from validated inquiry lines with frozen material cost snapshots.
6. Quotation Revision: Creates Version V(N+1), marks V(N) as isCurrent = false, status = SUPERSEDED.
```

---

## 5. API Endpoints

### Inquiries
- `GET /api/inquiries` (Filtered by customer ownership if customer user, or all if internal sales)
- `GET /api/inquiries/:id` (Ownership enforced: Customer A cannot access Customer B's inquiry)
- `POST /api/inquiries` (Create new inquiry)
- `PUT /api/inquiries/:id` (Update inquiry header)
- `POST /api/inquiries/:id/lines` (Add line with Cable Authority evaluation)
- `PUT /api/inquiries/:id/lines/:lineId` (Update line)
- `DELETE /api/inquiries/:id/lines/:lineId` (Remove line)
- `POST /api/inquiries/:id/submit` (Submit inquiry)

### Quotations
- `GET /api/quotations` (List quotations with version filtering)
- `GET /api/quotations/:id` (Get quotation version detail)
- `POST /api/quotations` (Create initial Version 1 quotation from an inquiry)
- `POST /api/quotations/:id/versions` (Create Version V(N+1), keeping previous immutable)
- `POST /api/quotations/:id/submit` (Submit quotation to customer)
- `POST /api/quotations/:id/cancel` (Cancel quotation)

---

## 6. RBAC & Security Matrix

| Action | Customer Role | Internal Sales | Technical Office | Management |
|---|---|---|---|---|
| Create / View Own Inquiry | Allowed | Allowed | Allowed | Allowed |
| View Other Customer's Inquiry | **BLOCKED (403)** | Allowed | Allowed | Allowed |
| Add Existing Master Cable to Line | Allowed | Allowed | Allowed | Allowed |
| Submit Tech Office Request for Unmapped Cable | Allowed | Allowed | Allowed | Allowed |
| Create Quotation Version 1 | **BLOCKED (403)** | Allowed | Allowed | Allowed |
| Revise Quotation Version V(N+1) | **BLOCKED (403)** | Allowed | Allowed | Allowed |
| Modify Master Data / Costing Rates | **BLOCKED (403)** | **BLOCKED (403)** | Governed | Governed |

---

## 7. Plan Complete — Ready for Implementation

With discovery verified and schema/API designs established, proceeding directly to **Phase B Implementation**.
