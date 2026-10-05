# Raw Material Price Data Model (Increment 9)

## Prisma Schema Enhancements

```prisma
enum PriceWorkflowStatus {
  DRAFT
  SUBMITTED
  UNDER_REVIEW
  APPROVED
  REJECTED
  EXPIRED
  CANCELLED
}

enum PriceBasis {
  PER_KG
  PER_TON
  PER_METER
  PER_PCS
  PER_M2
}

model RawMaterialPrice {
  id              String              @id @default(cuid())
  rawMaterialCode String
  rawMaterial     RawMaterial         @relation(fields: [rawMaterialCode], references: [code])
  price           Decimal?
  currency        String?
  uom             String?             @default("kg")
  priceDate       DateTime?
  effectiveFrom   DateTime?
  effectiveTo     DateTime?
  supplier        String?
  source          String?
  priceBasis      PriceBasis          @default(PER_KG)
  workflowStatus  PriceWorkflowStatus @default(DRAFT)
  isCurrent       Boolean             @default(true)
  revision        Int                 @default(1)
  temporalStatus  String              @default("DATA_REQUIRED")
  status          RecordStatus        @default(ACTIVE)
  approvedBy      String?
  approvedAt      DateTime?
  createdBy       String?
  updatedBy       String?
  comment         String?
  sourceBatch     String?
  createdAt       DateTime            @default(now())
  updatedAt       DateTime            @default(now()) @updatedAt

  @@index([rawMaterialCode])
  @@index([workflowStatus])
  @@index([effectiveFrom, effectiveTo])
}
```

### Relational Integrity
- Primary key `id` (CUID)
- Foreign key `rawMaterialCode` references `RawMaterial.code` with strict relational consistency.
- Raw Material identity is never duplicated.
