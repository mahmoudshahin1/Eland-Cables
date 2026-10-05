# Increment 13 — Phase E Implementation Plan

> **Stage A — Inspection + Plan ONLY**  
> **Status: STAGES F–I COMPLETE** (2026-08-22)  
> See [`INCREMENT_13_PHASE_E_IMPLEMENTATION_LOG.md`](./INCREMENT_13_PHASE_E_IMPLEMENTATION_LOG.md) and [`COSTING_ARCHITECTURE.md`](./COSTING_ARCHITECTURE.md)  
> **Prerequisites:** Phase B+C (migrations through `20260822120000_increment13_costing_configuration`), Phase D (`20260822130000_increment13_phase_d_scrap_workflow`), Phase F FX (`20260822150000_increment13_phase_f_exchange_rates`)

**STOP after this document. Do not implement until explicit approval.**

Companion documents: [`INCREMENT_13_COSTING_RULE_DISCOVERY.md`](./INCREMENT_13_COSTING_RULE_DISCOVERY.md), [`BOM_COSTING_INTEGRATION.md`](./BOM_COSTING_INTEGRATION.md), [`SCRAP_RULE_ENGINE.md`](./SCRAP_RULE_ENGINE.md), [`COSTING_SNAPSHOT_MODEL.md`](./COSTING_SNAPSHOT_MODEL.md), [`INQUIRY_UI_REDESIGN.md`](./INQUIRY_UI_REDESIGN.md), [`BUSINESS_RULES.md`](./BUSINESS_RULES.md), [`COSTING_PRICE_RESOLUTION.md`](./COSTING_PRICE_RESOLUTION.md)

---

## Executive summary

Phase E replaces the **legacy inquiry costing path** with the **single authoritative Increment 13 costing engine** (`costingOrchestrationService`) and connects it to the **real inquiry/quotation workflow**.

**Problem:** The old costing form and Increment 10 material-only path (`executeCostingRun`) still exist as parallel implementations. Administration → Costing is the configuration control plane, but the business execution experience was incomplete.

**Objective:** One engine, one path:

```
INQUIRY → CABLE → BOM → RAW MATERIAL PRICE → SCRAP → FORMULA ENGINE → COST → COMMERCIAL PRICING → QUOTATION
```

**Re-inspection finding:** Since the original Stage A plan (2026-08-22 morning), **partial Phase E work already exists in the codebase** (backend orchestrator persist, inquiry APIs, Costing tab UI, migration `20260822140000_increment13_phase_e_inquiry_costing`, 8 Phase E tests). **Phase E is NOT complete** against the full specification below — legacy paths remain, UI is not a full form replacement, tests are incomplete, and several governance gaps persist.

This plan documents **current state**, **remaining gaps**, and **approved execution order** for completing Phase E after sign-off.

---

## Architectural principle (non-negotiable)

| Rule | Enforcement |
|------|-------------|
| ONE costing engine | `costingOrchestrationService` — no parallel React/Express formula logic |
| Cost ≠ selling price | `commercialPricingEngine` separate from costing |
| No fabricated prices/scrap/shipping | `NOT_READY` / `NOT_CONFIGURED` with structured reasons |
| Governed data from backend only | Frontend submits inputs; never overrides BOM/prices/scrap |
| No `eval()` / `new Function()` | `costingFormulaEngine.ts` only |
| Historical snapshots immutable | `CostingCalculation` append-only; no silent recalc of quotations |

---

## End-to-end path trace

### Target architecture

```
CommercialInquiry (PostgreSQL)
  ├── header: currency, incoterms, commercialMetadata (FX, metal rates, destination)
  └── CommercialInquiryLine
        ├── Path A: materialNumber → EXISTING_CABLE → Gates 1–4
        │     └── POST .../calculate-cost → executeCostingForInquiryLine
        │           → CostingCalculation + CostingRun → line.materialCost
        ├── Path B: configurationPayload → TechnicalOfficeRequest → NOT_READY
        └── Submit → requires costingCalculationId (mapped lines)

CommercialQuotation
  └── materialCostTotal from line costs
  └── sellingPrice via /api/commercial-pricing/* (separate)
```

### Current runtime path (as inspected)

| Step | Status | Detail |
|------|--------|--------|
| Inquiry create/load | ✅ | `InquiryQuotationWorkspace` → `CommercialInquiryList` / `CommercialInquiryDetail` via PostgreSQL |
| Line add (Path A) | ✅ | `addInquiryLine` → `calculateInquiryLineCost` → orchestrator (replaced Inc 10) |
| Line add failure | ⚠️ | Silent `catch {}` — errors not surfaced to UI |
| On-demand calculate | ✅ | `POST /api/inquiries/:id/lines/:lineId/calculate-cost` |
| Costing tab UI | ✅ | `CommercialInquiryDetail` — breakdown, Calculate Cost, blocking reasons |
| Line edit | ✅ | Modal → `updateCommercialInquiryLine`; marks cost `STALE` |
| Submit gate | ✅ | `CALCULATION_REQUIRED` if mapped line lacks `costingCalculationId` |
| Post-submit lock | ✅ | `COSTING_LOCKED` on recalculate |
| Legacy Inc 10 API | ❌ still active | `/api/costing/calculate` → `executeCostingRun` |
| Legacy mock UI | ❌ still routed | `CostingPricing.tsx` in `App.tsx` |
| Technical Office workbench | ❌ still Inc 10 | `TechnicalOfficeCostingWorkbench.tsx` |
| Quotation snapshot link | ❌ | Copies `costingRunId` only; no `costingCalculationId` on quotation line |
| Costing history API | ❌ | `GET .../costing/history` not implemented |
| Dynamic costing form | ❌ | Costing tab is diagnostic panel, not metadata-driven form |
| Customer cost isolation | ⚠️ | `materialCost` is `customerVisible: true` in field manifest |

---

## 1. Old costing form location

| Surface | Path | Role | Authority | Phase E action |
|---------|------|------|-----------|----------------|
| **Legacy ERP inquiry form** | `src/components/common/ErpCustomerRequestView.tsx` | ELAND-style mock header + line grid | Mock (`mockData.ts`); **not routed** | Retire reference only |
| **Internal costing mock** | `src/components/internal/CostingPricing.tsx` | Hard-coded LME + margin calculator | Mock; **routed in `App.tsx`** | **Replace** — redirect to Administration → Costing or inquiry Costing tab |
| **Technical Office workbench** | `src/components/cable-configurator/v2/components/TechnicalOfficeCostingWorkbench.tsx` | Cable-level costing | Calls **`POST /api/costing/calculate`** (Inc 10) | **Migrate** to orchestrator preview/calculate |
| **Admin calculator** | `src/components/costing/CostingCalculator.tsx` | Quick Cost Quote wizard | `POST /api/admin/costing/calculator/preview` | Keep (admin/sales quick quote); not inquiry-scoped |
| **Admin configuration** | `src/components/internal/AdministrationCostingPanel.tsx` | Methods, formulas, scrap, BOM scrap, preview | `/api/admin/costing/*` | Keep as control plane |
| **Authoritative inquiry UI** | `InquiryQuotationWorkspace` → `CommercialInquiryList` + `CommercialInquiryDetail` | PostgreSQL inquiry workflow | **Production path** | **Extend** — full costing form replacement inside detail page |
| **Legacy inquiry home** | `src/components/inquiry-quotation/InquiryQuotationHome.tsx` | Mock grid | localStorage/mock | Not authoritative; do not wire costing here |

**Routed entry points (production):**
- Internal: `SalesQuotations.tsx` → `InquiryQuotationWorkspace`
- Customer: `PriceEstimation.tsx` → `InquiryQuotationWorkspace`

---

## 2. Old costing API

| Method | Route | Handler | Still used? |
|--------|-------|---------|-------------|
| GET | `/api/costing/readiness/:materialNumber` | `costingRoutes.ts` | Yes — workbench |
| GET | `/api/costing` | `costingRoutes.ts` | Yes — workbench |
| GET | `/api/costing/:id` | `costingRoutes.ts` | Yes — workbench |
| **POST** | **`/api/costing/calculate`** | **`executeCostingRun`** (Inc 10) | **Yes — must retire from business paths** |
| POST | `/api/costing/:id/recalculate` | `recalculateCostingRun` | Yes — workbench |

**Commercial pricing (separate — keep):**

| Method | Route | Purpose |
|--------|-------|---------|
| POST | `/api/commercial-pricing/calculate` | Selling price / margin |
| POST | `/api/commercial-pricing/quotations/:id/price` | Apply pricing to quotation |

---

## 3. Old costing calculation service

| Layer | Path | Responsibility |
|-------|------|----------------|
| Domain engine | `src/domain/costingEngine.ts` | Material-only: BOM × price × length; Gates 1–4; **no scrap** |
| Price resolution | `src/services/rawMaterialPriceGovernanceService.ts` | `getValidRawMaterialPrice` |
| Repository | `src/server/costingRepository.ts` | `executeCostingRun`, `recalculateCostingRun` |
| Governance | `src/server/governanceRepository.ts` | `evaluateCableCostingReadiness` (Gates 1–4) |

**Inc 10 formula:** `materialCost = Σ(consumptionPerKm × lengthKm × qty × unitPrice)`

**Inquiry path today:** `commercialRepository.calculateInquiryLineCost` → `executeCostingForInquiryLine` (Inc 13). Inc 10 **not** called from `addInquiryLine` anymore.

---

## 4. Old costing database structures

| Model | Migration | Inquiry role |
|-------|-----------|--------------|
| `CostingRun` | `20260820080000_increment10_costing_foundation` | Material snapshot; `inquiryLineId` added Phase E |
| `CostingLine` | same | Per-RM breakdown |
| `GovernedBomLine` | earlier | Approved BOM; `scrapPercentage` used by orchestrator |
| `RawMaterialPrice` | earlier | Governed prices |
| `CommercialInquiry` | Inc 11 + Inc 12 | Header + `commercialMetadata` |
| `CommercialInquiryLine` | same | `costingCalculationId` added Phase E migration |
| `CommercialQuotation` / `CommercialQuotationLine` | Inc 11 | `costingRunId` only on line |

---

## 5. New Increment 13 engine location

| Layer | Path | Key exports |
|-------|------|-------------|
| **Orchestration** | `src/server/costingOrchestrationService.ts` | `executeCostingPreview`, **`executeCostingForInquiryLine`**, `resolveActiveConfigurationVersion` |
| Request builder | `src/services/costingRequestService.ts` | `buildCostingRequestFromInquiryLine`, `buildLayerInputsFromCommercialMetadata` |
| Formula engine | `src/domain/costingFormulaEngine.ts` | Safe parser/evaluator + trace |
| Config repo | `src/server/costingFormulaRepository.ts` | Configurations, formulas, variables |
| Scrap repo | `src/server/costingScrapRuleRepository.ts` | `CostingScrapRule` workflow |
| BOM scrap repo | `src/server/costingBomScrapRepository.ts` | Per-line `GovernedBomLine.scrapPercentage` |
| FX | `src/domain/currencyConversion.ts` + `costingExchangeRateRepository.ts` | Cross-currency RM prices |
| Admin routes | `src/server/costingAdminRoutes.ts` | `/api/admin/costing/*` |
| Inquiry routes | `src/server/commercialRoutes.ts` | `calculate-cost`, `costing` GET |
| Inquiry repo | `src/server/commercialRepository.ts` | `calculateInquiryLineCost`, `getInquiryLineCosting` |
| Projection | `src/server/commercialProjection.ts` | Customer field stripping |
| Admin UI | `AdministrationCostingPanel.tsx` | Configuration control plane |
| Inquiry UI | `CommercialInquiryDetail.tsx` | Costing tab (partial) |

---

## 6. New BOM/scrap orchestration

Implemented in `costingOrchestrationService.ts`:

```
CableMaster
  → CableEngineeringMapping (Gate 1: APPROVED)
  → GovernedBomLine (Gate 2: approved, no conflicts)
  → RawMaterial master (Gate 3)
  → RawMaterialPrice APPROVED + ACTIVE (Gate 4)
  → GovernedBomLine.scrapPercentage OR CostingScrapRule
  → calculateMaterialLineCost (net + scrap-adjusted gross)
  → optional formula layers (when active CostingConfigurationVersion)
```

Scrap resolution (`resolveScrapRate`):
1. `GovernedBomLine.scrapPercentage` (set via Administration → BOM Scrap tab)
2. `CostingScrapRule` by scope (GLOBAL → FAMILY → CABLE → BOM_LINE)
3. ACTIVE rule with null rate → `NOT_READY`
4. No match → `NONE` (`scrapCostStatus: NOT_CONFIGURED`)

---

## 7. New RawMaterialPrice resolution

Authoritative: `getValidRawMaterialPrice` in `rawMaterialPriceGovernanceService.ts`.

Used by both `costingEngine.ts` (Inc 10 legacy) and `costingOrchestrationService.ts` (Inc 13).

**Not implemented (do not invent):**
- LME build-up from inquiry `copperPriceRate` / `aluminiumPriceRate`
- ELAND additive constants (505, 725, 50)
- Header metal rates are snapshotted in `layerInputs` only — **not applied to RM unit prices**

---

## 8. Integration gap (current vs target)

| # | Gap | Original (Stage A) | Current (re-inspection) | Remaining work |
|---|-----|-------------------|-------------------------|----------------|
| G1 | Inquiry → orchestrator | Inc 10 only | ✅ `calculateInquiryLineCost` | None |
| G2 | Calculate on demand | No API/UI | ✅ API + Costing tab button | Polish UX; structured errors in UI |
| G3 | `CostingCalculation` snapshots | Empty | ✅ Persisted on calculate | Verify all snapshot fields populated |
| G4 | Active config version (Gate 5) | Ignored | ✅ `resolveActiveConfigurationVersion` | Document optional vs mandatory |
| G5 | Header metal rates in engine | Unused | ⚠️ Snapshot only | Business decision BR-E03/E04 |
| G6 | Line edit → stale cost | Not implemented | ✅ `STALE` + clear `costingCalculationId` | Surface stale badge in UI |
| G7 | Line edit UI | Missing | ✅ Edit modal wired | Cable re-selection from configurator |
| G8 | Costing tab | Missing | ✅ Basic tab exists | **Replace with full metadata-driven form** |
| G9 | Quotation `costingCalculationId` | Missing | ❌ Still `costingRunId` only | Stage H |
| G10 | Dual code paths | Inc 10 + Inc 13 | ⚠️ Both active | Retire Inc 10 from workbench; deprecate `/api/costing/calculate` for business |
| G11 | Dynamic scrap formulas | Deferred | ❌ RULE-S002 not wired | After business vectors |
| G12 | Incoterm/shipping in costing | Out of scope | ✅ Returns `NOT_CONFIGURED` | Keep separate |
| G13 | Old mock `CostingPricing` | Routed | ❌ Still in `App.tsx` | Remove or redirect |
| G14 | Customer cost visibility | Should hide | ⚠️ `materialCost` customer-visible | Align manifest + projection with spec |
| G15 | Costing history | Planned | ❌ No history API | `GET .../costing/history` |
| G16 | Dynamic costing form fields | Required | ❌ Hard-coded Costing tab | Wire `inquiryFieldManifest` + costing field manifest |
| G17 | Silent auto-calculate failure | `catch {}` | ⚠️ Still silent | Log + set `NOT_READY` with reason |
| G18 | Browser persistence verification | Unverified | ⚠️ Tests only | Stage H acceptance test |
| G19 | 37 Phase E tests | Required | ⚠️ 8 tests exist | Expand test suite |
| G20 | Documentation package | Required | ⚠️ Plan only | Create docs at implementation (§29) |

---

## 9. Components to reuse / replace / adapt

### Reuse (no replacement)

- `costingFormulaEngine.ts`, `costingDecimal.ts`, `costingEngine.ts` (material layer)
- `rawMaterialPriceGovernanceService.ts`, `governanceRepository.ts`
- `costingRequestService.ts`, `costingOrchestrationService.ts`
- `costingFormulaRepository.ts`, `costingScrapRuleRepository.ts`, `costingBomScrapRepository.ts`
- `InquiryHeaderForm`, `inquiryHeaderFormService`, `inquiryFieldManifest.ts`
- `AdministrationCostingPanel.tsx`, `BomScrapPanel.tsx`
- `commercialPricingEngine.ts` (selling price boundary)

### Adapt (remaining Phase E work)

| Component | Change |
|-----------|--------|
| `CommercialInquiryDetail.tsx` | Replace Costing tab with full governed form: inputs, BOM, RM prices, scrap, formula trace, readiness, audit |
| `CostingPricing.tsx` | Remove from nav or redirect to inquiry costing / admin |
| `TechnicalOfficeCostingWorkbench.tsx` | Call orchestrator instead of Inc 10 |
| `costingRoutes.ts` | Deprecate business use; thin wrapper to orchestrator or 410 with migration hint |
| `commercialRepository.ts` | Remove silent catch; quotation `costingCalculationId` hand-off |
| `commercialProjection.ts` | Hide `materialCost` from customers; enforce breakdown RBAC |
| `inquiryFieldManifest.ts` | Costing section fields with role/customer visibility |
| `commercialRoutes.ts` | Add costing history route; tighten customer calculate RBAC per spec |

### Replace / retire

| Component | Action |
|-----------|--------|
| `ErpCustomerRequestView.tsx` | Remain unrouted |
| `CostingPricing.tsx` | **Retire from production nav** |
| Inc 10 as business path | **Retire** — keep tests for regression only |
| Silent `catch {}` in `addInquiryLine` | **Replace** with explicit status |

---

## 10. Database changes

### Already applied (Phase E partial)

Migration: `20260822140000_increment13_phase_e_inquiry_costing`
- `CommercialInquiryLine.costingCalculationId` (FK)
- `CostingRun.inquiryLineId`
- `CostingCalculation.inquiryId`

### May still be required

| Change | Purpose | Priority |
|--------|---------|----------|
| `CommercialQuotationLine.costingCalculationId` | Immutable quotation cost link | High |
| `CostingLine.scrapRate`, `scrapQuantity`, `baseConsumption`, `scrapCost` | Persisted scrap breakdown per RM | Medium |
| Indexes on `CostingCalculation.inquiryId` | History queries | Medium |

No changes to historical migrations.

---

## 11. API changes

### Implemented

| Method | Route | Handler |
|--------|-------|---------|
| POST | `/api/inquiries/:id/lines/:lineId/calculate-cost` | `calculateInquiryLineCost` |
| GET | `/api/inquiries/:id/lines/:lineId/costing` | `getInquiryLineCosting` |
| GET | `/api/inquiries/:id/activity` | Audit feed |

### Still required

| Method | Route | Purpose |
|--------|-------|---------|
| GET | `/api/inquiries/:id/lines/:lineId/costing/history` | Prior `CostingCalculation` versions |
| GET | `/api/costing/:id/breakdown` | Optional alias for breakdown by calculation ID |
| GET | `/api/costing/:id/readiness` | Optional readiness diagnostic |

### Response contract (all costing endpoints)

```json
{
  "status": "NOT_READY",
  "reasons": ["BOM_NOT_APPROVED", "COPPER_PRICE_MISSING"],
  "blockingReasons": ["..."],
  "materialBreakdown": [],
  "totals": {},
  "calculationId": "uuid-when-persisted"
}
```

Never return HTTP 500 for expected business readiness failures — use **422** with structured `code`.

---

## 12. UI changes — replace old costing form

### Current Costing tab (partial)

`CommercialInquiryDetail.tsx` tab `costing`:
- Line selector dropdown
- Calculate Cost button
- Status, material cost, scrap adjustment, layer totals
- Material breakdown table
- Blocking reasons list

### Target costing section (within existing inquiry detail — preserve header)

| Section | Content | Visibility |
|---------|---------|--------------|
| **Summary** | Status, last calculated, configuration version | Internal |
| **Inputs** | Cable, length, cutting length, qty, currency, incoterm, destination, metal rates (if permitted) | Role-based |
| **Governed data** | Cable construction, BOM revision, RM list, prices, scrap %, active method | Internal read-only |
| **Calculation** | Net/gross consumption, scrap qty, material costs | Internal |
| **Formula trace** | Layer evaluation steps | Internal + audit permission |
| **Result** | Total cost, cost/meter, currency | Role-based |
| **Readiness** | Gate failures with human-readable messages (EN/AR) | All authorized |
| **Audit** | Calculation events | Internal |

Use tabs/sections within Costing tab — same design system as inquiry header.

**Do not** create a separate costing page beside inquiry detail.

---

## 13. Inquiry integration approach

### Calculation sequence (per line)

```
1. Load inquiry + line from PostgreSQL
2. buildCostingRequestFromInquiryLine(line, header)
3. resolveActiveConfigurationVersion(costingDate) — Gate 5
4. executeCostingForInquiryLine(request, { persist: true })
5. If READY:
     - CostingCalculation + snapshots (INPUT / REFERENCE / OUTPUT)
     - CostingRun + CostingLine
     - Update line: materialCost, costingRunId, costingCalculationId, costingReadinessStatus
     - AuditEvent
6. If NOT_READY:
     - Update costingReadinessStatus
     - Return 422 with blockingReasons (no fake cost)
7. UI refreshes from GET inquiry + GET costing
```

### Customer vs governed inputs

| Customer/Sales input | Governed (backend only) |
|---------------------|-------------------------|
| Cable, length, qty, currency | Cable construction, BOM, RM weights |
| Destination, incoterm | UOM, scrap rules, RM prices |
| Metal rates (if business permits) | Costing method, formulas, variables |

### Quotation hand-off

On `createQuotationFromInquiry`:
- Copy `materialCost`, `costingRunId` (existing)  
- **Add** `costingCalculationId` per line
- `commercialPricingStatus = NOT_CONFIGURED`; `sellingPrice = null`
- Selling price via `/api/commercial-pricing/calculate` only

---

## 14. Costing status model

| Status | Meaning |
|--------|---------|
| `NOT_READY` | Gates failed; cannot calculate |
| `READY_FOR_COSTING` | Gates pass; calculation not yet run |
| `STALE` | Line changed since last calculation |
| `CALCULATED` | Successful calculation exists (`costingCalculationId` set) |
| `COSTING_LOCKED` | Inquiry submitted; recalc blocked |
| `FAILED` | Unexpected engine failure (rare; logged) |
| `REQUIRES_REVIEW` | Calculated but policy flags review (future) |

Readiness diagnostic codes: `BOM_NOT_APPROVED`, `PRICE_NOT_FOUND`, `SCRAP_RULE_MISSING`, `FORMULA_NOT_APPROVED`, `CONFIGURATION_NOT_FOUND`, `INCOTERM_NOT_CONFIGURED`, `CONFIGURATION_REQUIRED`.

---

## 15. Calculation trace (mandatory display for authorized users)

Based on real `CostingPreviewResult` / persisted snapshots:

- Cable identity + length + quantity
- BOM lines: RM code, net consumption/km, UOM
- Scrap: % per line, source (`BOM_LINE` / `SCRAP_RULE`), gross consumption
- Raw material prices: price ID, currency, UOM, effective date
- Material cost per line
- Layer totals (when config version active)
- Formula trace from `costingFormulaEngine`
- Configuration version, BOM revision, calculation timestamp

No fabricated numbers.

---

## 16. Security, RBAC, audit

### Permissions (existing)

| Permission | Use |
|------------|-----|
| `COSTING:RUN:CALCULATE` | Internal calculate-cost |
| `COSTING:PREVIEW:EXECUTE` | Admin preview |
| `COSTING:FORMULA:VIEW` etc. | Admin configuration |
| `salesQuotations` | Quotation generation |

### Gaps vs spec

| Rule | Spec | Current |
|------|------|---------|
| Customer cannot calculate | Deny POST | **Allowed** for own inquiries (Phase 1 C6) |
| Customer cannot see material cost | Hidden | **`materialCost` customerVisible** |
| Customer cannot see breakdown | Hidden | ✅ `projectLineCostingForActor` strips breakdown |
| Sales restricted fields | Field manifest | Partial — needs costing-specific manifest |

### Audit events

| Action | Entity |
|--------|--------|
| `CALCULATE` / `RECALCULATE` | `CostingCalculation`, `CommercialInquiryLine` |
| `NOT_READY` attempt | `CommercialInquiryLine` |
| Unauthorized access | `AuditEvent` WARN |

---

## 17. Costing versioning / snapshots

`CostingCalculation` stores:
- `configurationVersionId` — method/formula version
- `inputSnapshot` — inquiry line + header inputs at calculate time
- `referenceSnapshot` — BOM revision, price IDs, scrap rule IDs
- `outputSnapshot` — breakdown + totals + `formulaTrace`

Historical calculations must not be overwritten. Recalculate creates **new** `CostingCalculation`; prior records immutable.

Quotation must reference the calculation used at pricing time (`costingCalculationId`).

---

## 18. Incoterm / shipping / commercial pricing

| Concern | Phase E stance |
|---------|----------------|
| Incoterm in header | Persisted; costing returns `NOT_CONFIGURED` for freight — **no fake shipping** |
| Destination | Input snapshot only until logistics engine approved |
| Commercial pricing | **Separate** — `commercialPricingEngine`; margin/discount never in costing formulas |
| Cost on inquiry line | Manufacturing cost only (`materialCost`) |

---

## 19. Inquiry persistence verification (required in Phase E)

### Verified persisting (tests + code)

| Field | Mechanism |
|-------|-----------|
| Header typed columns | `createInquiry` / `updateInquiry` |
| `commercialMetadata` | PATCH inquiry |
| Lines CRUD | Repository + API |
| Versioning | `createInquiryRevision` |
| Costing result | `costingCalculationId`, `materialCost` on calculate |
| Customer stripping | `projectInquiryForActor` |

### Must verify in browser (Stage H)

1. Create inquiry → save → **refresh** → reopen → all fields match PostgreSQL
2. Calculate cost → refresh → costing snapshot still present
3. Submit → refresh → cost locked, snapshot preserved

### Known issues

| Issue | Detail |
|-------|--------|
| JWT required | No token → cannot use PostgreSQL inquiries |
| Silent auto-calculate | `addInquiryLine` swallows orchestrator errors |
| Duplicate line | May copy stale `costingRunId` / `materialCost` |
| UI preferences | Column visibility in localStorage only |

---

## 20. Flexible field display

Framework: `inquiryFieldManifest.ts` + `InquiryFieldVisibilityPanel.tsx`

**Phase E additions:**
- Costing-specific field manifest (or extend line manifest)
- Sections: inputs, governed, results, trace
- Role visibility: Sales vs Customer vs Costing team
- Backend enforcement via `projectInquiryForActor` + costing projection
- Admin configurable visibility (existing pattern)

Example policy:

| Role | See | Hide |
|------|-----|------|
| Sales | Cable, length, qty, currency, cost result (if authorized) | Supplier cost, internal margin |
| Customer | Cable, length, quotation price when quoted | RM prices, manufacturing cost, margin |
| Costing team | Full breakdown + trace | — |

---

## 21. Regression and rollback

### Regression gates (each sub-stage)

```bash
npx tsc --noEmit
npx prisma validate
npm test -- --test-concurrency=1
npm run build
```

| Suite | Must remain green |
|-------|-------------------|
| `increment10.costing.test.ts` | Legacy path regression |
| `increment13.costing.test.ts` | Phase B+C |
| `increment13.phaseD.test.ts` | Phase D |
| `increment13.bomScrap.test.ts` | BOM scrap |
| `increment13.phaseE.test.ts` | Phase E (expand to 37+) |
| `increment12.inquiryUi.test.ts` | Persistence |
| `increment11.commercial.test.ts` | Quotation boundary |

### Rollback

1. Feature flag to skip orchestrator on inquiry calculate (fallback Inc 10 material-only) — emergency only
2. Migrations additive — stop writing new FKs to roll back
3. Hide Costing tab if API unavailable
4. Never DELETE `CostingCalculation` rows

---

## 22. Explicit gaps — do NOT invent

| ID | Topic | Phase E stance |
|----|-------|----------------|
| BR-E01 | Global scrap 1% (RULE-S001) | Only if governed `CostingScrapRule` approved |
| BR-E02 | Dynamic MV scrap (RULE-S002) | `NOT_READY` until ELAND vectors |
| BR-E03 | LME additives (505, 725, 50) | Do not apply header rates to RM prices |
| BR-E04 | LME build-up vs flat RM price | Governed `RawMaterialPrice` only |
| BR-E05 | Ex-work 6% uplift | Approved formula layer only |
| BR-E06 | Container rate USD 3,500 | Out of Phase E |
| BR-E07 | Per-cable DAP allocation | Out of scope |
| BR-E08 | Process/overhead/drum | `NOT_CONFIGURED` |
| BR-E09 | FX conversion | Phase F exchange rates when cross-currency |
| BR-E10 | Header metal rates | Input snapshot only until D2/D3 closed |
| BR-E11 | Gate 5 mandatory | Recommend optional — material+scrap without published config |

---

## 23. Recommended execution order (after approval)

| Stage | Deliverable | Status |
|-------|-------------|--------|
| **A** | This plan + inspection | ✅ Complete |
| **B** | `executeCostingForInquiryLine` + persist snapshots | ✅ Partial — verify completeness |
| **C** | Inquiry calculate-cost / costing APIs + RBAC | ✅ Partial — history route missing |
| **D** | Replace Inc 10 in inquiry path; stale on update | ✅ Done for inquiry; workbench remains |
| **E** | BOM + RM price + scrap integration in UI form | ⚠️ Backend done; UI form incomplete |
| **F** | Replace Costing tab with full governed form | ❌ Not started |
| **G** | Retire `CostingPricing`; migrate workbench | ❌ Not started |
| **H** | Quotation `costingCalculationId`; browser persistence test | ❌ Not started |
| **I** | 37+ tests; documentation package | ⚠️ 8 tests only |

---

## 24. Phase E test matrix (minimum 37 — current: 8)

| # | Scenario | Status |
|---|----------|--------|
| 1 | Inquiry persists after creation | ✅ `increment12.inquiryUi.test.ts` |
| 2 | Inquiry line persists | ✅ |
| 3 | Cable selection persists | ✅ |
| 4 | Length persists | ✅ |
| 5 | Quantity persists | ✅ |
| 6 | Currency persists | ✅ |
| 7 | Incoterm persists | ⚠️ verify |
| 8 | Destination persists | ⚠️ verify (in metadata) |
| 9 | Inquiry reload returns all data | ✅ |
| 10 | Cost calculation uses real inquiry line | ✅ `increment13.phaseE.test.ts` |
| 11 | Uses approved BOM | ⚠️ needs dedicated test |
| 12 | Uses governed RawMaterialPrice | ⚠️ needs dedicated test |
| 13 | Scrap is applied | ⚠️ `increment13.bomScrap.test.ts` (preview only) |
| 14 | Formula engine invoked | ⚠️ needs test with active config |
| 15 | Calculation breakdown correct | ⚠️ partial |
| 16 | Costing result persisted | ✅ |
| 17 | Historical snapshot preserved | ❌ |
| 18 | Old costing path not used for inquiry | ✅ (code inspection) |
| 19 | Customer isolation (other customer) | ⚠️ |
| 20 | Customer cannot see internal costs | ❌ **fails today** — materialCost visible |
| 21 | Sales restricted fields | ❌ |
| 22 | Unauthorized cannot calculate | ⚠️ partial |
| 23 | BOM approval cannot be bypassed | ✅ Inc 10 tests |
| 24 | Price approval cannot be bypassed | ✅ |
| 25 | Formula approval cannot be bypassed | ⚠️ |
| 26 | Inactive formula cannot execute | ❌ |
| 27 | Inactive costing method cannot execute | ❌ |
| 28 | Missing price → structured error | ⚠️ |
| 29 | Missing BOM → structured error | ⚠️ |
| 30 | Missing scrap → structured error | ⚠️ |
| 31 | Incoterm without shipping → NOT_CONFIGURED | ⚠️ |
| 32 | Breakdown auditable | ⚠️ |
| 33 | Configuration version stored | ✅ |
| 34 | Concurrent calculations safe | ❌ |
| 35 | Inc 1–12 tests green | ✅ (last known) |
| 36 | Inc 13 B+C tests green | ✅ |
| 37 | Inc 13 Phase D tests green | ✅ |

---

## 25. Browser acceptance test (mandatory before Phase E sign-off)

1. Login as admin/sales
2. New Inquiry → customer → cable → length → qty → currency → incoterm → destination
3. Save → **refresh** → reopen → verify persistence
4. Calculate Cost → open breakdown → verify BOM, prices, scrap, formula
5. Submit → reopen → verify cost snapshot locked
6. Repeat with: missing BOM cable, missing price cable, missing scrap cable
7. Login as customer → verify cost fields hidden per policy
8. Unauthorized user → calculate blocked

---

## 26. Definition of done (Phase E complete)

- [ ] Inquiry calculate-cost uses **only** Inc 13 orchestrator
- [ ] Old costing form **replaced** (not hidden) — `CostingPricing` retired; workbench migrated
- [ ] `CostingCalculation` populated with full input/reference/output snapshots
- [ ] Costing tab is **metadata-driven** governed form with trace
- [ ] Customers **cannot** see internal costs or itemised breakdown (unless explicit policy)
- [ ] Quotation lines link `costingCalculationId`
- [ ] Costing history API available
- [ ] 37+ Phase E tests pass; all prior increment tests green
- [ ] Browser acceptance scenario passed
- [ ] Documentation package created (§27)
- [ ] No fabricated scrap, LME, or shipping costs

---

## 27. Documentation to create at implementation (not Stage A)

| Document | Purpose |
|----------|---------|
| `docs/INCREMENT_13_PHASE_E_IMPLEMENTATION_LOG.md` | Stage-by-stage delivery log |
| `docs/COSTING_INQUIRY_INTEGRATION.md` | Inquiry ↔ orchestrator wiring |
| `docs/COSTING_CALCULATION_FLOW.md` | Sequence diagrams + gate model |
| `docs/COSTING_RESULT_SNAPSHOT.md` | Snapshot field reference |

Update existing: `COSTING_SNAPSHOT_MODEL.md`, `BOM_COSTING_INTEGRATION.md`, `INQUIRY_UI_REDESIGN.md`, `BUSINESS_RULES.md`

---

## 28. Git safety (before implementation)

- Check `git status` before changes
- Do not delete unrelated work
- Do not overwrite Increment 12 / 13 B+C/D documentation
- Commit only when explicitly requested

---

## 29. Inspection checklist (Stage A — completed)

| # | Area inspected | Key finding |
|---|----------------|-------------|
| 1 | Inquiry list | `CommercialInquiryList.tsx` — PostgreSQL |
| 2 | Inquiry detail | `CommercialInquiryDetail.tsx` — tabs incl. costing |
| 3 | Inquiry line structure | `CommercialInquiryLine` — Path A/B |
| 4 | Cable configurator | `CableConfiguratorHub` / v2 — Path B |
| 5 | Old costing form | `CostingPricing.tsx`, `ErpCustomerRequestView.tsx` |
| 6 | Old costing API | `/api/costing/calculate` (Inc 10) |
| 7 | Old costing service | `costingRepository.executeCostingRun` |
| 8 | BOM services | `governanceRepository`, `GovernedBomLine` |
| 9 | RawMaterialPrice | `rawMaterialPriceGovernanceService` |
| 10 | Scrap logic | orchestrator + `costingScrapRuleRepository` + BOM scrap |
| 11 | Commercial pricing | `commercialPricingEngine` — separate |
| 12 | Incoterm | Header field; `NOT_CONFIGURED` in engine |
| 13 | Customer data | `projectInquiryForActor` |
| 14 | Quotation flow | `createQuotationFromInquiry` |
| 15 | Inc 13 B+C models | Config, formulas, variables |
| 16 | Inc 13 Phase D models | Scrap rules, orchestration |
| 17 | Formula engine | `costingFormulaEngine.ts` |
| 18 | BOM/scrap orchestration | `costingOrchestrationService.ts` |
| 19 | RBAC | `rbac.ts` costing permissions |
| 20 | AuditEvent | `appendAudit`, costing events |
| 21 | Admin Costing UI | `AdministrationCostingPanel.tsx` |
| 22 | Database schema | Through migration `20260822150000` |
| 23 | Tests | 8 Phase E; 59+ Phase D; Inc 10 legacy |

---

**End of Phase E Stage A plan.**

**Implementation NOT authorized. Await explicit approval before Stages B–I.**
