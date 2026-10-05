# Commercial Quotation Domain Model (Increment 11)

## Overview & Architecture

`CommercialQuotation` represents the official sales offer generated from a validated `CommercialInquiry`.

## Schema & Attributes

```prisma
model CommercialQuotation {
  id                      String            @id @default(cuid())
  quotationNumber         String            // Base commercial identifier (e.g. QUO-2026-8841)
  inquiryId               String            // FK -> CommercialInquiry
  customerId              String            // Customer identifier
  customerName            String            // e.g. ELAND Cables
  contactPerson           String?
  versionNo               Int               @default(1)
  isCurrent               Boolean           @default(true)
  supersedesQuotationId   String?           // Predecessor quotation ID
  status                  QuotationStatus   @default(DRAFT)
  currency                String            @default("USD")
  incoterms               String?           @default("FOB")
  paymentTerms            String?           @default("LC at sight")
  deliveryTerms           String?           @default("CIF Alexandria")
  validUntil              DateTime?
  materialCostTotal       Decimal           @default(0)
  commercialPricingStatus String            @default("NOT_CONFIGURED")
  sellingPrice            Decimal?          // Strictly NULL in Increment 11
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
  quotationId             String              // FK -> CommercialQuotation
  lineNumber              Int                 @default(1)
  inquiryLineId           String?             // FK -> CommercialInquiryLine
  materialNumber          String?
  itemDescription         String
  quantity                Decimal             @default(1)
  quantityUom             String              @default("KM")
  lengthMeters            Decimal             @default(1000)
  costingRunId            String?             // Governed CostingRun snapshot link
  materialCost            Decimal?            // Frozen material cost from CostingRun
  materialCostCurrency    String?             @default("USD")
  commercialStatus        String              @default("MATERIAL_COST_AVAILABLE")
  sellingPrice            Decimal?            // Strictly NULL in Increment 11
  notes                   String?
  createdAt               DateTime            @default(now())

  @@index([quotationId])
}
```

---

## 1. Commercial Status Values

- **`DRAFT`**: Quotation prepared by Sales agent; not yet released.
- **`OPEN`**: Commercial quotation active and available for customer review.
- **`SUBMITTED`**: Sent to customer via portal / formal offer.
- **`ACCEPTED`**: Customer accepted technical and material specification.
- **`REJECTED`**: Customer rejected quotation offer.
- **`SUPERSEDED`**: Replaced by a newer version (e.g. V1 becomes `SUPERSEDED` when V2 is created).
- **`CANCELLED`**: Revoked quotation.
