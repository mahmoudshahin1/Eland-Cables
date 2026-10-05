# ELAND Costing — Stage B Implementation Plan

**Status:** STAGE A COMPLETE — AWAITING APPROVAL  
**Date:** 2026-08-20  
**Prerequisite docs:** `ELAND_COSTING_RECONCILIATION.md`, `ELAND_COSTING_ARCHITECTURE_REVIEW.md`, `ELAND_COSTING_RULES.md`, `ELAND_COSTING_TEST_MATRIX.md`

---

## 1. Executive Summary

Direct inspection of `ELAND_Cost_Sheet_Required.xlsx` **resolves all six forensic contradictions**. The root cause of most numerical confusion was **mixing LE (Egyptian Pound) column J with EUR column K**.

The workbook implements:
1. **Material cost** = Σ(scrap-adjusted kg/km × LE/kg) / EUR/EGP
2. **Ex-work** = material / (1 − 6%) — a margin-style uplift, not manufacturing cost
3. **Shipping (aggregate)** = container + 0.3% of ex-work total

The existing Increment 10 engine already computes **material cost without scrap and without FX**. Stage B should add **governed optional layers** without breaking Increments 1–11.

---

## 2. Approved Stage B Scope (CONFIRMED rules only)

### In scope (pending approval)

| # | Feature | Rule IDs |
|---|---|---|
| 1 | Scrap-adjusted consumption in material cost | RULE-M002, RULE-S001 |
| 2 | Explicit CostingLine scrap fields (pct, adjusted qty) | RULE-M002 |
| 3 | ELAND validation test fixtures (4 cables) | TC-ELAND-001..004, 006 |
| 4 | CostingContext extension (customer, incoterm — optional inputs) | Architecture |
| 5 | Audit events for ELAND reconciliation runs | Audit spec |
| 6 | UI: show scrap + material breakdown | UI safety §24 |

### Conditional scope (business decision required)

| # | Feature | Blocker |
|---|---|---|
| 7 | FX conversion service (LE→EUR) | RULE-P001–P006, FX policy |
| 8 | Ex-work 6% uplift layer | RULE-E001 — commercial vs costing boundary |
| 9 | Aggregate shipping calculation | RULE-H001–H003 — ShippingRate master |
| 10 | Dynamic MV scrap (ScrapPolicy) | RULE-S002 approval |
| 11 | Per-cable DAP allocation | RULE-H004 unconfirmed |

### Explicitly out of scope

- Drum costing (#REF! in workbook)
- Process / labour / machine / energy / MOH
- Selling price in costing engine (Increment 12 handles this)
- Destructive master data migration
- Forcing app output to match unconfirmed forensic DAP values

---

## 3. Proposed Domain Extensions

### 3.1 `costingEngine.ts` (extend, not replace)

```typescript
// New optional path in calculateMaterialLineCost:
adjustedConsumption = totalConsumption * (1 + scrapPercentage)
// scrapPercentage from GovernedBomLine.scrapPercentage or ScrapPolicy
```

Return extended `MaterialCostLineDetail`:
- `scrapPercentage`
- `consumptionBeforeScrap`
- `scrapStatus: 'APPLIED' | 'NOT_CONFIGURED'`

### 3.2 New services (only if approved)

| Service | Purpose | Approval needed |
|---|---|---|
| `scrapPolicyService.ts` | Resolve scrap % by material/cable context | RULE-S002 |
| `currencyConversionService.ts` | Governed FX with frozen rate on CostingRun | FX policy |
| `shippingCostCalculationService.ts` | Container + insurance | Shipping master |

---

## 4. Proposed Database Changes

### Phase B1 — Scrap (CONFIRMED path)

```prisma
// Option A (minimal): Use existing GovernedBomLine.scrapPercentage
// Option B (governed): New ScrapPolicy model per user spec §10
model ScrapPolicy {
  id              String   @id @default(cuid())
  policyCode      String   @unique
  policyType      String   // STATIC_PERCENTAGE | FORMULA_REFERENCE
  materialCode    String?
  cableMaterialNumber String?
  percentage      Decimal?
  formulaReference String?
  effectiveFrom   DateTime?
  effectiveTo     DateTime?
  workflowStatus  String   @default("DRAFT")
  revision        Int      @default(1)
  source          String?
  approvedBy      String?
  createdAt       DateTime @default(now())
}
```

Extend `CostingLine`:
```prisma
scrapPercentage     Decimal?
consumptionBeforeScrap Decimal?
```

Extend `CostingRun`:
```prisma
customerId          String?
customerName        String?
incoterm            String?
destination         String?
exchangeRateId      String?   // if FX approved
exchangeRate        Decimal?
exchangeRateDate    DateTime?
shippingCost        Decimal?
shippingCostStatus  String    @default("NOT_CONFIGURED")
exWorkCost          Decimal?
exWorkCostStatus    String    @default("NOT_CONFIGURED")
```

**No changes until approved.**

---

## 5. Proposed API Changes

### Extend `POST /api/costing/calculate` (backward compatible)

New **optional** request fields:
```json
{
  "materialNumber": "10009487",
  "currency": "EUR",
  "lengthMeters": 1000,
  "quantity": 1,
  "customerId": "eland",
  "customerName": "ELAND",
  "incoterm": "DAP",
  "destination": "Doncaster",
  "applyScrap": true
}
```

New **optional** response fields on CostingRun:
```json
{
  "scrapCostStatus": "APPLIED",
  "shippingCostStatus": "NOT_CONFIGURED",
  "exWorkCostStatus": "NOT_CONFIGURED",
  "costingLines": [{
    "scrapPercentage": 0.01,
    "consumptionBeforeScrap": 135.23
  }]
}
```

Existing clients ignoring new fields — **no breaking change**.

New error codes:
- `SCRAP_POLICY_NOT_CONFIGURED`
- `EXCHANGE_RATE_NOT_CONFIGURED`
- `SHIPPING_RATE_NOT_CONFIGURED`

---

## 6. Proposed UI Changes

Extend **Technical Office → Costing Engine** workbench (`TechnicalOfficeCostingWorkbench.tsx`):

| Field | Display |
|---|---|
| Raw Material Cost | EUR 2,237.03 (when configured) |
| Scrap | 1.0% applied / NOT_CONFIGURED |
| Shipping | NOT_CONFIGURED / EUR value |
| Ex-Work Cost | NOT_CONFIGURED (until business approves RULE-E001) |
| Manufacturing Cost | NOT_CONFIGURED (never show 0) |
| Selling Price | NULL — link to Increment 12 pricing |

Add **ELAND Reconciliation** panel (read-only Stage B2):
- Side-by-side Excel vs Application per cable
- Status badge: MATCH / EXPECTED_DIFFERENCE / REQUIRES_RECONCILIATION

**Do not redesign** existing Technical Office layout.

---

## 7. Proposed Tests

| File | Tests |
|---|---|
| `src/domain/costingEngine.test.ts` | Add scrap adjustment unit tests |
| `src/server/eland.costing.test.ts` | TC-ELAND-001..020 per matrix |
| Existing increment10.test.ts | Must pass unchanged |

---

## 8. Proposed Audit Events

| Event | Trigger |
|---|---|
| `ELAND_COSTING_CALCULATED` | Successful ELAND cohort run |
| `ELAND_COSTING_RECONCILED` | Reconciliation match recorded |
| `ELAND_COSTING_BLOCKED` | Readiness/validation block |
| `ELAND_SHIPPING_CALCULATED` | When shipping layer approved |
| `ELAND_COSTING_RECALCULATED` | New CostingRun version |

Use existing `AuditEvent` model — no parallel audit system.

---

## 9. Exact Files to Change (Stage B)

| File | Change |
|---|---|
| `src/domain/costingEngine.ts` | Scrap-adjusted consumption |
| `src/domain/costingEngine.test.ts` | Scrap unit tests |
| `src/server/costingRepository.ts` | Context loading for scrap; optional customer context |
| `src/server/costingRoutes.ts` | Optional request fields |
| `prisma/schema.prisma` | CostingLine/CostingRun extensions (if approved) |
| `prisma/migrations/*` | New migration |
| `src/components/.../TechnicalOfficeCostingWorkbench.tsx` | Itemized cost display |
| `src/server/eland.costing.test.ts` | **New** — 4-cable validation |
| `package.json` | Add test script entry |
| `docs/COSTING_MATERIAL_COST.md` | Document scrap extension |
| `docs/COSTING_ERROR_CODES.md` | New error codes |

### Optional (conditional on business approval)

| File | Change |
|---|---|
| `src/domain/scrapPolicyService.ts` | **New** |
| `src/domain/currencyConversionService.ts` | **New** |
| `src/domain/shippingCostCalculationService.ts` | **New** |
| `src/server/shippingRateRepository.ts` | **New** |

---

## 10. Exact Files NOT to Change

| File | Reason |
|---|---|
| `src/domain/commercialPricingEngine.ts` | Separate commercial boundary |
| `src/server/commercialPricingRepository.ts` | Increment 12 complete |
| `src/server/commercialRepository.ts` | Inquiry/quotation domain stable |
| `src/services/bomGovernanceService.ts` | BOM governance unchanged |
| `src/services/engineeringMapping.ts` | Mapping workflow unchanged |
| `src/domain/cableAuthority.ts` | Authority rules unchanged |
| `src/server/increment10.costing.test.ts` | Regression baseline — do not modify to match Excel |
| `src/server/increment11.commercial.test.ts` | Regression baseline |
| `src/server/increment12.pricing.test.ts` | Regression baseline |
| `ELAND_Cost_Sheet_Required.xlsx` | Source evidence — read only |
| Production master data (CableMaster, BOM, prices) | No destructive seeding |

---

## 11. Implementation Phases (After Approval)

### Phase B1 — Scrap layer (lowest risk, CONFIRMED)
- Apply GovernedBomLine.scrapPercentage in costingEngine
- Extend CostingLine snapshot
- Unit + ELAND-001..004 material total tests (with EUR prices seeded in test fixture only)
- **Exit criteria:** Material cost with scrap matches Excel when prices match

### Phase B2 — FX price path (conditional)
- ExchangeRatePolicy master
- currencyConversionService
- Price build-up templates for CR01/AR01
- **Exit criteria:** TC-ELAND-005 MATCH

### Phase B3 — Shipping (conditional)
- ShippingRate master
- Aggregate shipping only (not per-cable DAP)
- **Exit criteria:** TC-ELAND-014 MATCH

### Phase B4 — Ex-work uplift (conditional — commercial review)
- Separate `exWorkCost` field, not merged into materialCost
- **Exit criteria:** TC ex-work MATCH + Finance sign-off

---

## 12. Risk Assessment

| Risk | Severity | Mitigation |
|---|---|---|
| 6% ex-work overlaps commercial margin | High | Keep ex-work separate; Finance decision |
| FX path complexity | Medium | Governed rates only; freeze on CostingRun |
| Dynamic scrap over-generalization | Medium | Sample-specific policies only |
| Per-cable DAP unconfirmed | High | Do not implement until rule supplied |
| Master data not ready for ELAND | High | Tests use fixtures; production stays blocked by gates |
| Regression in Inc 1–11 | High | Full test suite gate on every phase |

---

## 13. Required Business Decisions (Blocking)

| # | Question | Owner |
|---|---|---|
| BD-01 | Is the 6% Summary factor costing or commercial margin? | Finance / Commercial |
| BD-02 | Approve static 1% scrap as default LV policy or sample-only? | Technical Office |
| BD-03 | Approve dynamic MV scrap formulas as ScrapPolicy templates? | Manufacturing |
| BD-04 | Where are LME additives (505, 725, 1200) governed? | Procurement / Finance |
| BD-05 | Approve FX rate source and freeze policy (CBE 19-08-2026 sample)? | Finance |
| BD-06 | What is per-cable DAP allocation rule (not in workbook)? | Logistics / Commercial |
| BD-07 | Approve container rate 3500 USD storage model? | Logistics |
| BD-08 | Seed ELAND production prices or test-fixture-only validation? | Product Owner |

---

## 14. Stage A Deliverables Checklist

| Deliverable | Status |
|---|---|
| `docs/ELAND_COSTING_RECONCILIATION.md` | ✅ Complete |
| `docs/ELAND_COSTING_ARCHITECTURE_REVIEW.md` | ✅ Complete |
| `docs/ELAND_COSTING_RULES.md` | ✅ Complete |
| `docs/ELAND_COSTING_TEST_MATRIX.md` | ✅ Complete |
| `docs/ELAND_COSTING_IMPLEMENTATION_PLAN.md` | ✅ Complete |
| Application code changes | ❌ None (Stage A) |
| Prisma migrations | ❌ None (Stage A) |

---

**STOP — Stage B requires explicit approval of scope (§2) and business decisions (§13).**
