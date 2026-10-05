# Increment 12 — Commercial Pricing & Sales Margin Engine: Implementation Plan

> **Stage A Architectural Review Document**  
> Status: Prepared and Documented. **Stage B execution ready.**

---

## 1. Current Architecture Assessment

The Energya Cable platform has successfully established:
- **Cable Master & Authority**: PostgreSQL is the central authority for cable existence (`evaluateCableAuthority`), returning `EXISTING_CABLE` only when an `APPROVED` engineering mapping is active.
- **BOM Governance**: Source extract lines are immutable; 81 conflict groups remain governed under `BomDuplicateObservation`; `GovernedBomLine` provides authoritative consumption.
- **Raw Material & Price Governance**: Prices are governed (`DRAFT` → `SUBMITTED` → `APPROVED`); effective date intervals are enforced without period overlaps.
- **Costing Engine (Increment 10)**: Calculates **Raw Material Cost only** using a 4-gate readiness evaluation (`READY_FOR_COSTING`). `CostingRun` and `CostingLine` are frozen, immutable financial snapshots. Process cost, overhead, scrap, margins, and selling prices remain strictly `NOT_CONFIGURED` / `NULL`.
- **Commercial Inquiry & Quotations (Increment 11)**: Multi-tenant `CommercialInquiry` and `CommercialQuotation` with non-destructive revision control (`versionNo`, `isCurrent`, `supersedesQuotationId`), customer ownership isolation, and live links to `CostingRun`. Currently, `sellingPrice` is `NULL` and commercial pricing status is `NOT_CONFIGURED`.

---

## 2. Core Mathematical & Governance Principles

### 2.1 Explicit Mathematical Distinction: MARKUP vs GROSS_MARGIN

The platform strictly separates and explicitly distinguishes **Markup** from **Gross Margin**:

1. **MARKUP (Cost-Plus)**:
   $$\text{BaseSellingPrice} = \text{MaterialCost} \times \left(1 + \frac{\text{MarkupPercentage}}{100}\right)$$
   - *Example*: Material Cost = $100.00, Markup = 20% $\rightarrow$ Base Selling Price = $120.00.
   - *Validation*: $\text{MarkupPercentage} \ge 0\%$.

2. **GROSS_MARGIN (Margin-on-Sales)**:
   $$\text{BaseSellingPrice} = \frac{\text{MaterialCost}}{1 - \frac{\text{MarginPercentage}}{100}}$$
   - *Example*: Material Cost = $100.00, Gross Margin = 20% $\rightarrow$ Base Selling Price = $125.00.
   - *Validation*: $0\% \le \text{MarginPercentage} < 100\%$. Values $\ge 100\%$ or $< 0\%$ are rejected as `INVALID_MARGIN_VALUE`.

3. **DISCOUNT POLICY**:
   $$\text{DiscountAmount} = \text{BaseSellingPrice} \times \frac{\text{DiscountPercentage}}{100}$$
   $$\text{FinalSellingPrice} = \text{BaseSellingPrice} - \text{DiscountAmount}$$
   - *Validation*: $0\% \le \text{DiscountPercentage} \le 100\%$. Discount never alters underlying `CostingRun.materialCost`.

---

## 3. Pricing Rule Hierarchy & Precedence Model

The pricing resolution service (`resolvePricingRule`) deterministically evaluates active, non-overlapping, approved pricing rules in the following strict hierarchy:

```
[Level 1] Customer-Specific + Cable-Specific Rule (Priority 100)
    │
    ▼ (If not found)
[Level 2] Customer-Specific Global Rule (Priority 80)
    │
    ▼ (If not found)
[Level 3] Customer Tier + Cable-Specific Rule (Priority 60)
    │
    ▼ (If not found)
[Level 4] Customer Tier Global Rule (Priority 40)
    │
    ▼ (If not found)
[Level 5] Global Default Pricing Rule (Priority 20)
    │
    ▼ (If not found)
[PRICING_NOT_CONFIGURED] (Zero / fake selling prices strictly prohibited)
```

### Precedence & Conflict Rules:
- If two active rules share the exact same scope and priority: returns `PRICING_RULE_CONFLICT`.
- If an approved rule has expired relative to the costing/pricing date: returns `PRICING_RULE_EXPIRED`.
- If no applicable rule exists: returns `PRICING_NOT_CONFIGURED`.
- If requested currency has no approved rule in that currency: returns `PRICING_CURRENCY_MISMATCH` (no automated FX conversion).

---

## 4. Commercial Approval Thresholds

Commercial quotation pricing requires explicit manager approval (`PRICING_APPROVAL_REQUIRED`) if:
1. Resulting Gross Margin is below the governed threshold (e.g. $< \text{MinMarginPercentage}$).
2. Applied Discount exceeds the maximum allowed discount (e.g. $> \text{MaxDiscountPercentage}$).
3. A customer-specific price override deviates beyond standard tier bounds.

---

## 5. Database Schema & Migration (`20260820100000_increment12_commercial_pricing`)

```prisma
enum PricingRuleType {
  MARKUP
  GROSS_MARGIN
}

enum PricingRuleScope {
  GLOBAL
  CUSTOMER_TIER
  CUSTOMER_SPECIFIC
  CABLE_SPECIFIC
  CUSTOMER_CABLE_SPECIFIC
}

enum PricingWorkflowStatus {
  DRAFT
  SUBMITTED
  UNDER_REVIEW
  APPROVED
  REJECTED
  EXPIRED
  CANCELLED
}

enum CommercialPricingStatus {
  PRICING_NOT_CONFIGURED
  PRICING_CALCULATED
  PRICING_APPROVAL_REQUIRED
  PRICING_APPROVED
  PRICING_REJECTED
  PRICING_EXPIRED
  PRICING_RULE_CONFLICT
  PRICING_CURRENCY_MISMATCH
}

model CustomerPricingTier {
  id                  String           @id @default(cuid())
  tierCode            String           @unique // e.g. STANDARD, TIER_1, TIER_2, VIP
  tierName            String
  description         String?
  defaultMarginType   PricingRuleType  @default(GROSS_MARGIN)
  status              RecordStatus     @default(ACTIVE)
  createdAt           DateTime         @default(now())
  updatedAt           DateTime         @updatedAt
}

model CommercialPricingRule {
  id                  String                 @id @default(cuid())
  ruleCode            String                 @unique // e.g. PR-RULE-2026-001
  ruleName            String
  scope               PricingRuleScope       @default(GLOBAL)
  ruleType            PricingRuleType        @default(GROSS_MARGIN)
  
  // Scope Targets
  customerId          String?
  customerTierCode    String?
  cableMaterialNumber String?
  
  // Governed Parameters
  percentageValue     Decimal                // e.g. 20.00%
  currency            String                 @default("USD")
  priority            Int                    @default(20)
  
  // Validity & Versioning
  effectiveFrom       DateTime?
  effectiveTo         DateTime?
  workflowStatus      PricingWorkflowStatus  @default(DRAFT)
  isCurrent           Boolean                @default(true)
  revision            Int                    @default(1)
  
  // Threshold Governance
  minMarginThreshold  Decimal?
  maxDiscountAllowed  Decimal?               @default(15.00)
  
  // Audit & Provenance
  approvedBy          String?
  approvedAt          DateTime?
  createdBy           String?
  comment             String?
  createdAt           DateTime               @default(now())
  updatedAt           DateTime               @updatedAt

  snapshots           CommercialPricingSnapshot[]

  @@index([scope])
  @@index([customerId])
  @@index([customerTierCode])
  @@index([cableMaterialNumber])
  @@index([workflowStatus])
  @@index([effectiveFrom, effectiveTo])
}

model CommercialDiscountRule {
  id                  String                 @id @default(cuid())
  discountCode        String                 @unique // e.g. DISC-2026-001
  discountName        String
  customerId          String?
  customerTierCode    String?
  cableMaterialNumber String?
  discountPercentage  Decimal
  maxDiscountAllowed  Decimal                @default(15.00)
  effectiveFrom       DateTime?
  effectiveTo         DateTime?
  workflowStatus      PricingWorkflowStatus  @default(DRAFT)
  isCurrent           Boolean                @default(true)
  revision            Int                    @default(1)
  approvedBy          String?
  approvedAt          DateTime?
  createdBy           String?
  createdAt           DateTime               @default(now())
  updatedAt           DateTime               @updatedAt
}

model CommercialPricingSnapshot {
  id                  String                  @id @default(cuid())
  quotationId         String
  quotationLineId     String
  quotationNumber     String
  versionNo           Int
  materialNumber      String
  
  // Frozen Costing & Pricing Inputs
  costingRunId        String?
  materialCost        Decimal
  currency            String
  
  // Resolved Rule Snapshot
  pricingRuleId       String?
  pricingRule         CommercialPricingRule?  @relation(fields: [pricingRuleId], references: [id])
  pricingRuleRevision Int                     @default(1)
  pricingRuleType     PricingRuleType
  percentageValue     Decimal
  
  // Calculated Financial Outputs
  baseSellingPrice    Decimal
  discountPercentage  Decimal                 @default(0)
  discountAmount      Decimal                 @default(0)
  finalSellingPrice   Decimal
  unitSellingPrice    Decimal                 // per KM or M
  
  // Status & Governance
  pricingStatus       CommercialPricingStatus @default(PRICING_CALCULATED)
  approvalRequired    Boolean                 @default(false)
  approvalReason      String?
  approvedBy          String?
  approvedAt          DateTime?
  createdAt           DateTime                @default(now())

  @@index([quotationId])
  @@index([quotationLineId])
  @@index([materialNumber])
  @@index([pricingStatus])
}
```

---

## 6. API Architecture

### Pricing Rule Management
- `GET /api/master/commercial-pricing-rules`
- `GET /api/master/commercial-pricing-rules/:id`
- `POST /api/master/commercial-pricing-rules`
- `PUT /api/master/commercial-pricing-rules/:id`
- `POST /api/master/commercial-pricing-rules/:id/actions` (`SUBMIT`, `REVIEW`, `APPROVE`, `REJECT`, `EXPIRE`, `CANCEL`)
- `GET /api/master/commercial-pricing-rules-export`
- `POST /api/master/commercial-pricing-rules/import/preview`
- `POST /api/master/commercial-pricing-rules/import/commit`

### Pricing Calculation & Quotation Integration
- `POST /api/commercial-pricing/calculate` (Pure pricing simulation / preview)
- `POST /api/quotations/:id/price` (Calculates and freezes pricing snapshot for quotation lines)
- `POST /api/quotations/:id/submit-for-approval` (Requests pricing approval if threshold exceeded)
- `POST /api/quotations/:id/approve-pricing` (Manager signs off commercial pricing)
- `POST /api/quotations/:id/reject-pricing` (Rejects commercial pricing)

---

## 7. Plan Complete — Proceeding to Stage B Implementation

The architecture is internally consistent, enforces all non-negotiables, and adheres to the two-stage execution discipline. Proceeding directly to Stage B.
