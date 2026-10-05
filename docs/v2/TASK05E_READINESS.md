# TASK 05E — Costing V2 + Commercial Pricing — Implementation Readiness

**Date:** 2026-09-05  
**Base commit:** `78ededb` (frozen Tasks 05B/05C/05D)  
**Status:** **READINESS ONLY — NOT production-ready; no implementation in this task**  
**Prior:** Task 05A (`docs/v2/34_V2_CABLE_CONFIGURATION_PRODUCTION_READINESS.md`), Task 05B (`docs/v2/35_V2_INQUIRY_CONFIGURATION_PERSISTENCE.md`), Task 05C cutting-length, Task 05D (`docs/v2/TASK05D_READINESS.md` + `V2DrumPlan` implementation)

---

## Executive summary

Costing V2 **Direct Raw Material Cost** is **technically implemented and frozen** in `src/domain/costingEngine.ts`, but the platform is **not production-ready** for the V2 Quote-to-Cash chain:

```text
Confirmed Drum Plan → Costing → Commercial Pricing
```

**Blockers today:**

| Blocker | Effect |
|---------|--------|
| **81 unresolved BOM conflicts** (`BOM-CONF-*`) | Gate 2 fails for all governed cables with open conflicts — costing cannot run on authoritative BOM |
| **Decision 5 OPEN** (Option B in code; sign-off pending) | Direct RM metal pricing policy not business-closed; `CostingMetalCostComponent` rows ignored |
| **No V2 costing boundary** | Inquiry costing uses V1 line scalars (`cuttingLengthMeters`, `drumSchedule`, `drumType`) — does **not** consume `DrumPlanHandoffDto` from **CONFIRMED** `V2DrumPlan` |
| **Engineering Costing ≠ Commercial Pricing** partially wired | Increment 11–12 paths exist for V1 inquiries; V2 lineage refs missing on persisted runs |

**05E dependency from 05D:** Costing must consume **`DrumPlanHandoffDto`** from **`lifecycleStatus = CONFIRMED`** `V2DrumPlan` only — **no duplicate drum calculations in costing**. Today costing reads legacy drum metadata and extension-layer packing rules, not the authoritative drum plan.

**Lineage question (must be answerable after 05E implementation):**

> Which exact configuration, BOM, drum plan, and raw-material prices produced this cost?

Today: **partially** for V1 inquiry runs (`CostingCalculation.inputSnapshot` / `referenceSnapshot`); **not** for V2 drum-plan lineage.

---

## 1. Current State

### 1.1 Costing V2 engine (FROZEN — read only)

| Asset | Path | Status |
|-------|------|--------|
| Four-gate readiness + Direct RM calculation | `src/domain/costingEngine.ts` | **LIVE** — do not modify per `.cursor/rules/costing-v2-freeze.mdc` |
| Unit tests (Option B, scrap exclusion, PCS/MT UOM) | `src/domain/costingEngine.test.ts` | **LIVE** — frozen expectations |
| Business spec (Decisions 1–4 locked, 5 open) | `docs/COSTING_V2_BUSINESS_SPECIFICATION.md` | **AUTHORITATIVE** |
| Decision 5 one-pager | `docs/DECISION5_ONE_PAGER.md` | **OPEN** |
| Metal price resolution | `src/domain/inquiryMetalPricing.ts` | **LIVE** — `INQUIRY_HEADER`, `INQUIRY_OVERRIDE`, `INQUIRY_SYSTEM_DEFAULT`, `RAW_MATERIAL_MASTER` |
| RM price governance | `src/services/rawMaterialPriceGovernanceService.ts` | **LIVE** — `PER_KG`, `PER_TON`, `PER_PCS`, `PER_METER` bases; PCS↔kg and M↔kg blocked |
| Orchestrator (preview + persist + scrap overlay + formulas) | `src/server/costingOrchestrationService.ts` | **LIVE** — wraps engine; **not frozen** |
| Inquiry integration | `src/server/commercialRepository.ts` → `calculateInquiryLineCost` | **LIVE** — **V1 inputs** |
| Request builder | `src/services/costingRequestService.ts` | **LIVE** — `buildCostingRequestFromInquiryLine` uses legacy line fields |
| Admin / workspace UI | `src/components/costing/v3/*`, `CostingConfigurationDashboard.tsx` | **LIVE** |
| TO costing workbench (cable-level, not V2 inquiry) | `src/components/cable-configurator/v2/components/TechnicalOfficeCostingWorkbench.tsx` | **LIVE** — `/api/master/costing-readiness`, `/api/costing` |
| Production readiness panel | `src/components/costing/v3/panels/ProductionReadinessPanel.tsx` | **LIVE** — governance matrix |

**Engine scope (explicit):** `calculateCableManufacturingCost` computes **material cost only**. Returns `processCostStatus`, `overheadCostStatus`, `scrapCostStatus: 'NOT_CONFIGURED'`, `manufacturingCost: null`. Does **not** compute margin, discount, or selling price.

### 1.2 Prisma — costing & commercial models (existing)

| Model | Key fields | Role today |
|-------|------------|------------|
| `CostingRun` | `costingRunNumber`, `materialNumber`, `bomVersion`, `engineeringRevision`, `materialCost`, `inquiryLineId?`, `configurationVersionId?`, `blockingReasons`, `isCurrent` | Increment 10 immutable material snapshot |
| `CostingLine` | `rawMaterialCode`, `consumptionPerKm`, `price`, `priceId`, `pricingSource`, `lineCost`, FX trace fields | Per-RM line snapshot on run |
| `CostingCalculation` | `calculationNumber`, `inquiryLineId`, `inputSnapshot`, `referenceSnapshot`, `outputSnapshot` | Increment 13 header; populated on inquiry persist |
| `CostingCalculationSnapshot` | `snapshotType`: INPUT / REFERENCE / OUTPUT / TRACE | Append-only typed snapshots |
| `GovernedBomLine` | `consumption`, `uom`, `scrapPercentage`, `bomVersion`, `status`, `conflictId` | Gate 2 effective BOM |
| `BomDuplicateObservation` | `conflictId` (`BOM-CONF-*`), `investigationStatus` | 81 official conflicts — Gate 2 block |
| `RawMaterial` | `pricingCategory`, `metalType`, `uom` | Gate 3 + market metal classification |
| `RawMaterialPrice` | `price`, `currency`, `uom`, `priceBasis`, `workflowStatus`, `revision`, effective dates | Gate 4 |
| `CostingMetalCostComponent` | Premium/Shipping/Clearance master rows | **Not consumed by engine** (Option B) |
| `CostingScrapRule` | `scopeType`, `scrapRate`, `workflowStatus` | Orchestrator overlay only — **not** Direct RM |
| `CostingPackingRule` | `drumCode`, packing amounts | Extension layer — **not** wired to `V2DrumPlan` |
| `CommercialPricingRule` | `ruleType`, `percentageValue`, scope, workflow | Increment 12 governance |
| `CommercialPricingSnapshot` | `costingRunId?`, `materialCost`, rule snapshot, `finalSellingPrice` | Frozen on quotation pricing |
| `CommercialInquiryLine` | `costingCalculationId`, `costingRunId`, `materialCost`, legacy drum/cutting fields, `v2Current*` pointers | Mixed V1/V2 |

### 1.3 V2 inquiry chain (05B–05D — LIVE at workspace)

| Model | Path / API | Costing consumption today |
|-------|------------|---------------------------|
| `V2ConfigurationSnapshot` | `v2InquiryConfigurationRepository.ts` | **Not referenced** by costing persist |
| `V2CuttingLengthPlan` | `/api/v2/inquiries/.../cutting-plans` | **Not referenced** — costing uses `line.cuttingLengthMeters` |
| `V2DrumPlan` + `V2DrumPlanLine` | `v2DrumPlanRepository.ts`, migration `20260905190000_v2_drum_plan` | **Not referenced** |
| `DrumPlanHandoffDto` | `src/domain/v2DrumPlanService.ts` L40–62; `GET .../drum-plans/:planId/handoff` | **CONFIRMED-only** handoff exists; **costing does not call it** |

`getV2DrumPlanHandoff` enforces:

```typescript
if (plan.lifecycleStatus !== 'CONFIRMED') throw INVALID_STATE;
```

### 1.4 V1 inquiry costing path (production for legacy inquiries)

```text
CommercialInquiryDetail
  → POST /api/inquiries/:id/lines/:lineId/calculate-cost
  → calculateInquiryLineCost (commercialRepository.ts L1370–1448)
  → buildCostingRequestFromInquiryLine (legacy: requestedLengthMeters, cuttingLengthMeters, drumType, drumSchedule)
  → executeCostingForInquiryLine (persist if drumType passes isGovernedDrumSelection)
  → CostingCalculation + CostingRun + CommercialInquiryLine update
```

**Gaps vs V2:**

- Length: `quantity × cuttingLengthMeters` or `requestedLengthMeters` — **not** `DrumPlanHandoffDto.totalPlannedLengthM`
- Drum: `line.drumType` + V1 `drumSchedule` JSON — **not** confirmed `V2DrumPlan`
- BOM gate: still evaluates 81 conflicts via orchestrator context load
- Persist blocked when `DRUM_CONFIGURATION_REQUIRED` (legacy drum type check)

### 1.5 BOM governance — 81 conflicts

| Constant | Value | File |
|----------|-------|------|
| `EXPECTED_OFFICIAL_CONFLICT_COUNT` | **81** | `src/server/bomConflictGovernanceService.ts` L55 |
| `OFFICIAL_BOM_CONFLICT_ID_PREFIX` | `BOM-CONF-` | Same |
| Test enforcement | `src/platform/cableBomConflictGovernance.test.ts` Test A | PG count = 81 |

Gate 2 in `evaluateCostingGates` (`costingEngine.ts` L209–224):

- Any `bomConflicts` with `investigationStatus !== 'APPROVED'` → `BOM_CONFLICT_UNRESOLVED`
- Zero approved governed/source BOM lines → block

V2 config snapshots store `bomGovernanceBlocked: true`, `unresolvedBomConflictCount: 81` by default (`V2ConfigurationSnapshot` schema L858–859). Inquiry workflow can reach `ENGINEERING_BLOCKED` when `anyBomBlocked` (`v2InquiryConfigurationRepository.ts` L802).

**05E rule:** Do **not** resolve the 81 conflicts in this task. Document surfacing only.

### 1.6 Production-readiness verdict

| Layer | Verdict |
|-------|---------|
| Costing V2 Direct RM engine | **Implemented, frozen, not business-signed** (Decision 5) |
| Cable-level costing (master data) | **Partial** — works when all 4 gates pass on a cable |
| V1 inquiry costing | **Live** — persistence + quotation handoff to pricing (Increment 12) |
| V2 inquiry costing | **MISSING** — no drum-plan handoff, no V2 lineage on runs |
| Commercial pricing | **Live for quotations** — separate from engineering costing |
| End-to-end V2 Quote-to-Cash | **NOT production-ready** |

---

## 2. Frozen Costing Decisions

Authoritative sources: `docs/COSTING_V2_BUSINESS_SPECIFICATION.md`, `docs/DECISION5_ONE_PAGER.md`, `.cursor/rules/costing-v2-freeze.mdc`.

| # | Decision | Rule (do not redesign) |
|---|----------|------------------------|
| **Option B** | Direct RM market metal | Inquiry header Cu/Al **LME/base only**; ignore `CostingMetalCostComponent` Premium/Shipping/Clearance |
| **Gate 1** | Engineering Approved | `engineeringMapping.status === 'APPROVED'` |
| **Gate 2** | BOM Approved | No unresolved `BomDuplicateObservation`; approved governed BOM lines exist |
| **Gate 3** | RM Master exists | Every consumed RM code in master |
| **Gate 4** | RM Price exists | Approved price or inquiry metal price; UOM/currency valid |
| **Direct RM formula** | `consumption × applied price` | No scrap multiplier in engine |
| **Scrap storage** | `GovernedBomLine.scrapPercentage` + `CostingScrapRule` | Orchestrator may compute scrap **adjustment for display/future layers**; engine excludes scrap |
| **Market Cu/Al** | USD/MT basis; MT↔kg governed (÷1000) | Classification via RM `pricingCategory` / `metalType` — not BOM-line flags |
| **PCS / M pricing** | Governed UOM only | PCS BOM + PER_PCS OK; PCS price vs kg BOM → `PRICE_UOM_INCOMPATIBLE`; packing end caps excluded |
| **FX** | Not in price invention | Engine/orchestrator: FX **after** line cost to convert to inquiry header currency; missing FX → `FX_NOT_CONFIGURED` |
| **Decision 5** | System default market prices | New inquiries snapshot `copperPriceSource` / `aluminiumPriceSource` = `SYSTEM_DEFAULT` → trace as `INQUIRY_SYSTEM_DEFAULT` in costing lines |
| **Formula engine** | AST evaluation only | `costingFormulaEngine.ts` — blocked tokens (`eval`, etc.); no arbitrary code execution |
| **81 BOM conflicts** | Governance debt | **Do not resolve in 05E** — Gate 2 remains blocked until 04B-13 business workflow completes |

---

## 3. Target State

### 3.1 V2 production boundary

```text
V2ConfigurationSnapshot (immutable)
  → V2CuttingLengthPlan (immutable)
    → V2DrumPlan lifecycleStatus = CONFIRMED (immutable version)
      → DrumPlanHandoffDto (read-only contract)
        → V2CostingRun / CostingCalculation (NEW lineage fields)
          → materialCost (engineering)
            → CommercialPricingSnapshot (commercial — separate increment)
              → Quotation line selling price
```

### 3.2 Non-goals (frozen areas — do not implement in 05E)

- Resolve 81 BOM conflicts or change Gate 2 semantics
- Change `costingEngine.ts` Direct RM logic or `costingEngine.test.ts`
- Implement Decision 5 Option A (landed metal in Direct RM)
- Drum Master / drum optimization engine changes
- V1 configurator enhancements
- Fulfillment WIP, D365 sync
- Quotation UI/implementation changes (design handoff only)

### 3.3 Success criteria (05E implementation follow-on)

1. Costing run cannot start without **CONFIRMED** `v2CurrentDrumPlanId` on V2 inquiry lines
2. Costing **never** re-runs drum optimization — only reads `DrumPlanHandoffDto`
3. Persisted run answers lineage question with FKs + JSON snapshots
4. Commercial pricing consumes **frozen** `materialCost` from costing run — never recalculates Direct RM
5. Customer actors cannot mutate costing master data or see internal price IDs

---

## 4. Costing Domain

### 4.1 Layer separation

| Layer | Computes | Does not compute |
|-------|----------|------------------|
| **Engineering Costing (Costing V2)** | Direct RM `materialCost`; optional orchestrator extensions (scrap display, formulas, logistics/packing **when configured**) | Selling price, margin, discount |
| **Commercial Pricing (Increment 12)** | `baseSellingPrice`, `finalSellingPrice` from `materialCost` + `CommercialPricingRule` | BOM consumption, RM unit prices |

Reference: `docs/COMMERCIAL_COSTING_BOUNDARY.md`.

### 4.2 CostingEngineResult statuses

`CostingRunStatus`: `DRAFT` | `CALCULATED` | `INCOMPLETE` | `BLOCKED` | `SUPERSEDED`

Successful Direct RM run returns `costingStatus: 'INCOMPLETE'` (material only) per `costingEngine.ts` L620.

### 4.3 Orchestrator vs engine

`executeCostingPreview` / `executeCostingForInquiryLine`:

- Loads PG context (engineering, governed BOM, conflicts, prices)
- Runs `evaluateCostingGates` + `calculateCableManufacturingCost`
- **Additionally:** scrap rate resolution (`GovernedBomLine.scrapPercentage` → `CostingScrapRule`), formula layers (Gate 5 config), extension layers (`CostingPackingRule`, logistics)
- Scrap adjustment shown in preview with note: *"not included in direct RM cost"*

---

## 5. Costing Run/Version Model

### 5.1 Existing persistence (V1 path)

On successful persist (`costingOrchestrationService.ts` L813–912):

1. `CostingCalculation` (`CC-{stamp}-{rand}`, `status: LOCKED`)
2. `CostingRun` (`CR-{stamp}-{rand}`, `isCurrent: true`, prior runs superseded)
3. `CostingLine[]` per material line with price snapshots
4. `CommercialInquiryLine` updated: `costingCalculationId`, `costingRunId`, `materialCost`, `costingReadinessStatus: READY_FOR_COSTING`

**Missing V2 refs in `referenceSnapshot` today:** only `bomVersion`, `engineeringRevision`, `configurationVersionId`, `scrapCostStatus`.

### 5.2 Proposed `V2CostingRun` extension (design — not in schema)

**Option A — extend `CostingCalculation` + `CostingRun` (preferred minimal diff):**

| New field | Type | Purpose |
|-----------|------|---------|
| `CostingCalculation.configurationSnapshotId` | String FK → `V2ConfigurationSnapshot.id` | Config evidence |
| `CostingCalculation.cuttingLengthPlanId` | String FK → `V2CuttingLengthPlan.id` | Cutting evidence |
| `CostingCalculation.drumPlanId` | String FK → `V2DrumPlan.id` | **Authoritative drum evidence** |
| `CostingCalculation.drumPlanVersionNo` | Int | Version pin |
| `CostingCalculation.workflowChannel` | String | `V2_CONFIGURATION` vs legacy |
| `CostingRun.drumPlanId` | String? | Duplicate pin for material-only queries |
| `inputSnapshot.v2Handoff` | JSON | Full `DrumPlanHandoffDto` at calculation time |
| `referenceSnapshot.governedBomLineIds` | JSON | Array of `GovernedBomLine.id` used |
| `referenceSnapshot.rawMaterialPriceIds` | JSON | Map `rawMaterialCode → RawMaterialPrice.id` |
| `referenceSnapshot.marketMetalSnapshot` | JSON | `buildMetalPricingSnapshot()` output |

**Option B — new table `V2CostingRun`** mirroring `V2DrumPlan` immutability pattern — only if audit requires separate namespace.

### 5.3 Version / snapshot semantics

| Event | Behavior |
|-------|----------|
| Recalculate on same line | New `CostingCalculation` + `CostingRun`; mark prior `CostingRun.isCurrent = false`, `supersededById` chain |
| Drum plan superseded | Prior costing runs remain valid **for their pinned `drumPlanId`**; recalculation required for new drum plan version |
| Price change after run | Historical runs immutable; new run picks current approved prices at `costingDate` |
| Inquiry metal override | Snapshot `metalPricingSnapshot` in `inputSnapshot`; trace `pricingSource` per `CostingLine` |
| Post-submit inquiry | V1: `COSTING_LOCKED` blocks recalc (`docs/COSTING_INQUIRY_INTEGRATION.md`) — V2 should adopt same |

### 5.4 Number sequences

Today: ad hoc `CC-` / `CR-` stamp + random (`costingOrchestrationService.ts` L766–769).  
Existing: `CostingDocumentSequence` model + `src/server/costingDocumentSequence.ts` for admin entities — **consider** wiring V2 costing runs to governed sequence in implementation.

---

## 6. Input Lineage

**Target answer:** *Which exact configuration, BOM, drum plan and raw-material prices produced this cost?*

| Lineage ref | Source at costing time | Persist today? | Proposed |
|-------------|------------------------|----------------|----------|
| Inquiry | `CommercialInquiry.id` | Yes (`CostingCalculation.inquiryId`) | Keep |
| Line | `CommercialInquiryLine.id` | Yes | Keep |
| Config snapshot | `V2ConfigurationSnapshot.id` / `snapshotId` / `versionNo` | **No** | FK + JSON selections hash |
| Cutting plan | `V2CuttingLengthPlan.planId` / `versionNo` | **No** | FK from drum handoff |
| Drum plan | `V2DrumPlan.planId` / `versionNo` / `lifecycleStatus=CONFIRMED` | **No** | FK + `DrumPlanHandoffDto` JSON |
| Cable / BOM | `materialNumber`, `bomVersion`, `GovernedBomLine[]` | Partial (`bomVersion` only) | Full governed line IDs + `conflictId` null check snapshot |
| RM prices | `RawMaterialPrice.id`, `revision`, `effectiveFrom` | Per `CostingLine.priceId` | Map in `referenceSnapshot` |
| Market metal | Inquiry header Cu/Al + source (`SYSTEM_DEFAULT` / `OVERRIDE`) | Partial in line `pricingSource` | `inputSnapshot.metalPricingSnapshot` (already on persist) |
| Costing config | `CostingConfigurationVersion.id` | Optional | Gate 5 when ACTIVE version selected |
| FX | `CostingExchangeRate` refs in `fxSnapshot` | Yes on lines/run JSON | Keep |

### 6.1 Proposed costing input builder (V2)

Replace `buildCostingRequestFromInquiryLine` legacy path for `workflowChannel === 'V2_CONFIGURATION'`:

```typescript
// Design only
async function buildV2CostingRequest(lineId: string): Promise<StructuredCostingRequest> {
  // 1. Assert line.v2CurrentDrumPlanId
  // 2. handoff = getV2DrumPlanHandoff(..., CONFIRMED)
  // 3. lengthMeters = handoff.totalPlannedLengthM (or explicit PO rule for quantity semantics)
  // 4. materialNumber = handoff.cableMaterialNumber
  // 5. drum metadata for packing extension = handoff.lines (NOT live Drum Master)
  // 6. commercialMetadata from inquiry header (metal prices, FX, incoterms)
}
```

**No drum math** in this builder — only DTO consumption.

---

## 7. BOM Gate

### 7.1 Gate 2 mechanics

```typescript
// costingEngine.ts — evaluateCostingGates
const unapprovedConflicts = context.bomConflicts.filter(
  (cf) => cf.investigationStatus !== 'APPROVED'
);
```

Effective BOM:

```typescript
const effectiveBomLines = context.governedBomLines.length > 0
  ? context.governedBomLines.filter((g) => g.status === 'APPROVED')
  : context.sourceBomLines;
```

### 7.2 How 81 conflicts surface

| Surface | Path |
|---------|------|
| Platform register | `buildBomConflictGovernanceRegister()` — `src/server/bomConflictGovernanceService.ts` |
| Governance UI / API | `listBomConflictRegister` — `governanceRepository.ts` |
| Costing gate message | `Gate 2 Failed: BOM conflict BOM-CONF-… for Raw Material … is unresolved (BUSINESS_DECISION_REQUIRED)` |
| V2 config banner | `V2ConfigurationSnapshot.bomGovernanceBlocked`, `unresolvedBomConflictCount: 81` |
| Readiness matrix | `governanceRepository` → `overallStatus: DATA_ISSUE` when conflicts open |
| Tests | `cableBomConflictGovernance.test.ts`, `increment9.price.test.ts` Test 20 |

### 7.3 V2 inquiry interaction

`derivePostSubmitStatus` → `ENGINEERING_BLOCKED` when `anyBomBlocked` — line cannot reach commercial-ready state for costing even if drum plan confirmed.

**05E:** Costing API should return structured `blockingReasons` with `conflictId` list — not attempt auto-resolution.

---

## 8. Raw Material Pricing

### 8.1 Standard RM (Gate 4)

`getValidRawMaterialPrice()` — `src/services/rawMaterialPriceGovernanceService.ts`:

- Requires `workflowStatus === 'APPROVED'`
- Effective date window check
- Currency match or cross-currency with FX probe
- UOM via `convertPriceForConsumptionUom` — **governed MT↔kg only**

### 8.2 Blocked combinations (governed)

From spec + tests (`costingEngine.test.ts`):

| Scenario | Error |
|----------|-------|
| PCS price vs kg BOM consumption | `PRICE_UOM_INCOMPATIBLE` |
| M price vs kg BOM | Blocked |
| Missing approved price | `PRICE_NOT_CONFIGURED` |
| Draft price only | `PRICE_NOT_CONFIGURED` with workflow hint |

### 8.3 PCS exception

PCS BOM lines with approved `PER_PCS` price are costed (`costingEngine.test.ts` — TAG-01). End caps (`A-ECAP*`) excluded as packing at **zero** Direct RM.

---

## 9. Market Metals

### 9.1 Resolution path

`resolveMaterialUnitPrice()` — `inquiryMetalPricing.ts`:

| RM `pricingCategory` | Price source |
|---------------------|--------------|
| `MARKET_METAL_COPPER` | Inquiry `copperPriceRate` (USD/MT default) |
| `MARKET_METAL_ALUMINIUM` | Inquiry `aluminiumPriceRate` |
| Master list price for CR01/AR01 | **Ignored** |

### 9.2 Decision 5 / system default snapshot

`CommercialInquiry.commercialMetadata` fields (typical):

- `copperPriceRate`, `copperPriceUom`, `copperPriceCurrency`, `copperPriceSource`
- `aluminiumPriceRate`, …

`buildInquiryMetalPricingFromMetadata` → `buildMetalPricingSnapshot` stored in `CostingCalculation.inputSnapshot` on persist.

Trace on line: `pricingSource: INQUIRY_SYSTEM_DEFAULT | INQUIRY_OVERRIDE | INQUIRY_HEADER`.

### 9.3 CostingMetalCostComponent (not in Direct RM)

Prisma comment + migration `20260829120000_metal_cost_components`: master-data for **future** landed cost. Panel: `MetalCostComponentsPanel.tsx` — Option B banner.

---

## 10. Scrap

| Location | Role |
|----------|------|
| `GovernedBomLine.scrapPercentage` | Primary BOM-line scrap rate |
| `CostingScrapRule` | Fallback by scope (BOM_LINE, CABLE, FAMILY, MATERIAL_CLASS, GLOBAL) |
| `costingOrchestrationService.resolveScrapRate()` | Picks rate; computes `adjustedConsumptionPerKm` for **preview** |
| `costingEngine.calculateCableManufacturingCost` | **Does not multiply scrap** — Decision 4 |

Orchestrator notes: `(scrap X% from BOM_LINE; not included in direct RM cost)`.

Direct RM status remains `scrapCostStatus: 'NOT_CONFIGURED'` in engine result.

---

## 11. Currency

| Topic | Rule |
|-------|------|
| Costing result currency | Inquiry header currency |
| Line price currency | May differ — converted via `convertAmount` + `CostingExchangeRate` |
| FX in engine | **Conversion only** — not embedded in unit price selection |
| Metal prices | USD/MT display convention; normalized to BOM UOM |
| Commercial pricing currency | `CommercialPricingRule.currency` must align or `PRICING_CURRENCY_MISMATCH` |

Models: `CostingCurrency`, `CostingExchangeRate` — admin workspace panels.

---

## 12. Commercial Pricing Boundary

### 12.1 Engine

`src/domain/commercialPricingEngine.ts`:

- Input: **`materialCost`** (from costing — never recalculated)
- Rules: `CommercialPricingRule` — `GROSS_MARGIN` vs `MARKUP`
- Output: `baseSellingPrice`, `discountAmount`, `finalSellingPrice`, `unitSellingPrice`
- Status: `CommercialPricingStatus` — may require approval (`PRICING_APPROVAL_REQUIRED`)

### 12.2 Persistence

`priceQuotation()` — `commercialPricingRepository.ts`:

- Reads quotation lines → linked `inquiryLine.materialCost` / costing refs
- Creates immutable `CommercialPricingSnapshot` per line
- Updates quotation `commercialPricingStatus`

### 12.3 Market metal overrides at commercial layer

Commercial pricing **must not** re-apply Cu/Al header prices. Any commercial adjustment belongs in **pricing rules / discounts**, not Direct RM.

### 12.4 V2 gap

Quotation pricing today assumes V1 inquiry line costing fields populated. V2 must pass **`CostingCalculation.id`** (with V2 lineage) into snapshot — design:

```typescript
CommercialPricingSnapshot {
  costingRunId        // pin engineering cost
  materialCost        // frozen from run
  // NEW optional:
  v2DrumPlanId        // audit cross-ref
}
```

---

## 13. APIs

### 13.1 Existing (keep; extend for V2)

| Method | Route | Auth | Notes |
|--------|-------|------|-------|
| POST | `/api/inquiries/:id/lines/:lineId/calculate-cost` | Internal + RBAC | V1 path — **needs V2 branch** |
| GET | `/api/inquiries/:id/lines/:lineId/costing` | Scoped | View calculation |
| GET | `/api/master/costing-readiness` | Master read | Cable-level matrix |
| GET | `/api/admin/costing/readiness/*` | Costing admin | Workspace |
| POST | `/api/admin/costing/preview` | Costing admin | `executeCostingForInquiryLine` persist:false |
| GET | `/api/v2/inquiries/.../drum-plans/:planId/handoff` | V2 inquiry | **Source for costing input** |

### 13.2 Proposed V2 costing APIs (design)

| Method | Route | Purpose |
|--------|-------|---------|
| POST | `/api/v2/inquiries/:id/lines/:lineId/costing/preview` | Preview without persist; requires CONFIRMED drum plan |
| POST | `/api/v2/inquiries/:id/lines/:lineId/costing/calculate` | Persist `CostingCalculation` + `CostingRun` with V2 lineage |
| GET | `/api/v2/inquiries/:id/lines/:lineId/costing/current` | Latest run + lineage refs |
| GET | `/api/v2/inquiries/:id/lines/:lineId/costing/:calculationId/lineage` | Human-readable lineage answer |

### 13.3 Request/response contract (sketch)

```typescript
interface V2CostingCalculateResponse {
  calculationId: string;
  costingRunId: string;
  calculationNumber: string;
  costingRunNumber: string;
  materialCost: number;
  currency: string;
  status: 'READY' | 'NOT_READY';
  blockingReasons: string[];
  errorCode?: string;
  lineage: {
    configurationSnapshotId: string;
    cuttingLengthPlanId: string;
    drumPlanId: string;
    drumPlanVersionNo: number;
    bomVersion: number;
    engineeringRevision: number;
  };
}
```

### 13.4 Preconditions (V2)

1. `workflowChannel === 'V2_CONFIGURATION'`
2. `line.v2CurrentDrumPlanId` set
3. Drum plan `lifecycleStatus === 'CONFIRMED'`
4. Four costing gates pass (BOM gate blocked until 81 resolved)
5. Decision 5 sign-off for production claim

---

## 14. UI

### 14.1 Current

| UI | V2 readiness |
|----|--------------|
| `CostingWorkspaceV3` / panels | Master-data admin — **not** V2 inquiry integrated |
| `TechnicalOfficeCostingWorkbench` | Cable-level — **not** drum-plan aware |
| `CommercialInquiryDetail` costing tab | V1 line costing |
| `CableConfiguratorV2` | No costing step after drum confirm |
| `ProductionReadinessPanel` | Shows gate matrix — 81 conflicts visible indirectly |

### 14.2 Proposed V2 UI (design)

1. **Costing step** in `CableConfiguratorV2` after drum plan CONFIRMED
2. Display lineage chips: Snapshot vN · Cutting vN · Drum vN · BOM vN
3. Gate 2 banner linking to BOM conflict register (read-only)
4. Material cost panel — explicit *"RAW MATERIAL COST ONLY — NOT SELLING PRICE"*
5. Block calculate when `bomGovernanceBlocked` or drum plan not CONFIRMED
6. Separate **Commercial Pricing** action on quotation workspace (existing Increment 12)

---

## 15. Security

| Concern | Current | V2 target |
|---------|---------|-----------|
| Customer isolation | Commercial routes use `customerScope` / `assertCustomerBusinessScope` | V2 costing routes must scope by inquiry customer |
| Costing master data | `/api/admin/costing/*` — internal RBAC (`COSTING:*` permissions) | Customers **never** access admin costing APIs |
| Customer visiblity | `commercialProjection.ts` strips internal fields | Hide `priceId`, governance IDs from customer DTOs |
| Drum handoff | V2 inquiry routes — customer-scoped | Costing uses same scope |
| Internal-only | `costingEngine`, RM prices, BOM conflicts | Internal roles: `COSTING.CALCULATION.CALCULATE`, `.VIEW` |

RBAC references: `src/server/rbac.ts`, `increment13.costing.test.ts` (customer 403 on admin routes).

---

## 16. Audit

| Mechanism | Costing usage today | Gap |
|-----------|---------------------|-----|
| `appendServerAudit` | V2 config/cutting/drum persist | **Not** used in `costingOrchestrationService` persist |
| `auditEvent.create` | CostingCalculation CREATE (L916–931) | Partial — no `appendServerAudit` wrapper |
| Immutable snapshots | `CostingCalculationSnapshot` append-only | Missing V2 FK lineage |
| Supersession | `CostingRun.isCurrent`, `supersededById` | OK for material runs |

**Recommendation:** V2 costing persist should call `appendServerAudit` with entity `V2CostingCalculation`, including `drumPlanId`, `configurationSnapshotId`, `materialCost`.

---

## 17. Quotation Handoff

### 17.1 Current chain (V1)

```text
Inquiry line costing (CostingCalculation)
  → Create quotation from inquiry (materialCost copied)
  → priceQuotation (commercialPricingEngine)
  → CommercialPricingSnapshot frozen per line
  → commercialPricingStatus → approval workflow
```

Tests: `src/server/increment12.pricing.test.ts`, `phase1.quoteToCash.test.ts`.

### 17.2 V2 design (no implementation)

1. Quotation creation requires V2 line status ≥ costing complete (`costingCalculationId` with `workflowChannel=V2`)
2. `CommercialPricingSnapshot.costingRunId` pins engineering cost
3. New quotation version → new pricing snapshot; old snapshot immutable (Test 22)
4. Selling price **never** derived by copying `materialCost` without pricing rule
5. Document on quotation PDF: drum plan ref + costing run number (future)

### 17.3 Blockers for quote

| Gate | Requirement |
|------|-------------|
| BOM | 81 conflicts resolved (platform) |
| Costing | V2 run persisted with CONFIRMED drum plan |
| Pricing | Approved `CommercialPricingRule` match |
| Decision 5 | Signed for production sign-off |

---

## 18. Migration

### 18.1 Proposed migration `20260906130000_v2_costing_lineage`

```sql
-- Design only — not applied in 05E
ALTER TABLE "CostingCalculation"
  ADD COLUMN "configurationSnapshotId" TEXT,
  ADD COLUMN "cuttingLengthPlanId" TEXT,
  ADD COLUMN "drumPlanId" TEXT,
  ADD COLUMN "drumPlanVersionNo" INTEGER,
  ADD COLUMN "workflowChannel" TEXT;

ALTER TABLE "CostingCalculation"
  ADD CONSTRAINT "CostingCalculation_drumPlanId_fkey"
  FOREIGN KEY ("drumPlanId") REFERENCES "V2DrumPlan"("id") ON DELETE RESTRICT;

-- Similar optional FKs for snapshot + cutting plan
CREATE INDEX "CostingCalculation_drumPlanId_idx" ON "CostingCalculation"("drumPlanId");
```

### 18.2 Data migration

- **No backfill** for legacy inquiries without V2 drum plans
- Legacy `CostingCalculation` rows: `workflowChannel = NULL` (treat as V1)
- Do not auto-link V1 `drumSchedule` JSON to `V2DrumPlan`

### 18.3 Runtime

- Express routes require server restart after add (`energya-connect-platform.mdc` convention)

---

## 19. Tests

### 19.1 Existing costing tests (must stay green; engine tests frozen)

| File | Coverage |
|------|----------|
| `src/domain/costingEngine.test.ts` | Gates, Option B, scrap exclusion, PCS, MT↔kg, packing exclusion |
| `src/server/increment10.costing.test.ts` | CostingRun persist, supersession, CR- numbers |
| `src/server/increment11.commercial.test.ts` | Inquiry costing integration |
| `src/server/increment12.pricing.test.ts` | Commercial pricing snapshots |
| `src/server/increment13.costing.test.ts` | Formula RBAC |
| `src/server/increment13.phaseD.test.ts` | `buildCostingRequestFromInquiryLine` |
| `src/server/increment13.phaseE.test.ts` | Metadata / cutting / drum in request |
| `src/server/increment13.fx.test.ts` | FX conversion |
| `src/server/increment14.costingWorkspace.test.ts` | Workspace readiness API |
| `src/server/costingScrapResolution.test.ts` | Scrap rule selection |
| `src/server/costingMetalCostComponents.test.ts` | Master data not in engine |
| `src/server/productionReadiness.test.ts` | Production readiness aggregation |
| `src/platform/cableBomConflictGovernance.test.ts` | **81 conflicts preserved** |

### 19.2 Proposed new tests (implementation task)

**File:** `src/platform/v2CostingLineage.test.ts`

1. Full V2 chain: snapshot → cutting → drum CONFIRM → costing preview blocked by BOM (expect Gate 2)
2. Mock/suppress BOM gate (test cable without conflicts): costing consumes `DrumPlanHandoffDto` length — **not** legacy fields
3. Persist: `referenceSnapshot` contains `drumPlanId`, price IDs
4. Supersede drum plan → recalculate → new run; old run unchanged
5. Non-CONFIRMED drum plan → `INVALID_STATE` / no costing
6. Customer JWT cannot POST admin costing
7. `appendServerAudit` on V2 costing persist
8. Commercial pricing reads frozen `materialCost` — changing inquiry header metal after snapshot does not alter priced quotation

**File:** `src/domain/v2CostingRequestService.test.ts` (unit)

- `buildV2CostingRequestFromHandoff` rejects missing handoff fields
- No drum optimization imports in costing service module graph

---

## 20. Risks

| Risk | Impact | Mitigation |
|------|--------|------------|
| 81 BOM conflicts remain | **All** governed cables blocked at Gate 2 | Track 04B-13; surface in V2 UI; do not bypass |
| Decision 5 unsigned | Production sign-off blocked | PO sign `DECISION5_ONE_PAGER.md` |
| V1/V2 costing path divergence | Wrong length/drum on V2 quotes | Mandatory `DrumPlanHandoffDto` for V2 |
| Double drum calculation | Cost ≠ logistics reality | Code review: no `optimizeDrumPlan` in costing module |
| Legacy `buildCostingRequestFromInquiryLine` | Silent use of `cuttingLengthMeters` | Branch on `workflowChannel` |
| FX misconfiguration | Blocked runs / wrong totals | Keep FX after UOM normalization (spec order) |
| Customer sees RM price IDs | Data leak | Projection layer strip |
| Formula engine scope creep | Arbitrary execution | Keep AST whitelist (`costingFormulaEngine.ts`) |
| Quotation repricing after commercial approval | Immutable violation | Existing guard in `priceQuotation` |
| Option A implemented early | Violates freeze | Separate signed prompt only |

---

## 21. Decisions Required

| ID | Question | Options | 05E default |
|----|----------|---------|-------------|
| D-05E-1 | Costing length basis from drum handoff | `totalPlannedLengthM` vs `quantity × cuttingLengthM` per drum line sum | **`totalPlannedLengthM`** (matches authoritative plan) |
| D-05E-2 | Persist model | Extend `CostingCalculation` vs new `V2CostingRun` table | **Extend** existing models |
| D-05E-3 | Gate 5 (config version) mandatory for V2? | Yes / No / Same as V1 | **Same as V1** (optional ACTIVE config) |
| D-05E-4 | Packing/drum extension layer input | From `DrumPlanHandoffDto.lines` vs `CostingPackingRule` only | **Handoff lines** for drum codes; rules for rates |
| D-05E-5 | Costing without BOM gate for preview? | Allow preview with warnings / hard block | **Hard block** (frozen gates) |
| D-05E-6 | Decision 5 | Option A vs B | **Option B** until signed |
| D-05E-7 | V1 inquiries | Continue legacy path / force V2 migration | **Continue legacy** indefinitely |
| D-05E-8 | Recalc after inquiry submit | Block / allow new version | **Block** (align V1 `COSTING_LOCKED`) |

---

## 22. Recommended Implementation Sequence

1. **PO:** Sign Decision 5 (Option B acceptance + 10009487 reconciliation)
2. **Design lock:** Approve §5.2 lineage fields + §13.2 APIs (this doc)
3. **Domain:** `buildV2CostingRequestFromHandoff` in new `v2CostingRequestService.ts` — consumes `DrumPlanHandoffDto` only
4. **Repository:** `v2CostingRepository.ts` — preview + persist with lineage FKs; `appendServerAudit`
5. **Routes:** Mount under `v2InquiryConfigurationRoutes.ts` or sibling router; customerScope
6. **Orchestrator hook:** Pass V2 context into `executeCostingForInquiryLine` without changing `costingEngine.ts`
7. **UI:** Costing section in `CableConfiguratorV2` post-drum confirm
8. **Migration:** §18.1 columns + indexes
9. **Tests:** §19.2 integration file
10. **Commercial pricing:** Extend snapshot with `drumPlanId` cross-ref; verify quotation handoff
11. **Docs:** Update `COSTING_INQUIRY_INTEGRATION.md` with V2 section
12. **Production claim:** Only after 81 BOM conflicts cleared **and** Decision 5 signed **and** V2 lineage tests green

---

## Appendix A — Files inspected

| Area | Paths |
|------|-------|
| Engine (frozen) | `src/domain/costingEngine.ts`, `src/domain/costingEngine.test.ts` |
| Metal pricing | `src/domain/inquiryMetalPricing.ts`, `src/services/rawMaterialPriceGovernanceService.ts` |
| Orchestration | `src/server/costingOrchestrationService.ts`, `src/services/costingRequestService.ts` |
| Commercial inquiry costing | `src/server/commercialRepository.ts` |
| Commercial pricing | `src/domain/commercialPricingEngine.ts`, `src/server/commercialPricingRepository.ts` |
| BOM governance | `src/server/bomConflictGovernanceService.ts`, `src/platform/cableBomConflictGovernance.test.ts` |
| V2 drum handoff | `src/domain/v2DrumPlanService.ts`, `src/server/v2DrumPlanRepository.ts` |
| V2 inquiry | `src/server/v2InquiryConfigurationRepository.ts`, `src/domain/v2InquiryWorkflow.ts` |
| Schema | `prisma/schema.prisma`, `prisma/migrations/20260905190000_v2_drum_plan/migration.sql` |
| UI | `src/components/costing/v3/*`, `TechnicalOfficeCostingWorkbench.tsx`, `CableConfiguratorV2.tsx` |
| Docs | `docs/COSTING_V2_BUSINESS_SPECIFICATION.md`, `docs/DECISION5_ONE_PAGER.md`, `docs/COMMERCIAL_COSTING_BOUNDARY.md`, `docs/COSTING_INQUIRY_INTEGRATION.md`, `docs/COSTING_SNAPSHOT_MODEL.md`, `docs/v2/34_*`, `docs/v2/35_*`, `docs/v2/TASK05D_READINESS.md` |
| Rules | `.cursor/rules/costing-v2-freeze.mdc`, `.cursor/rules/energya-connect-platform.mdc` |
| Tests | All `*costing*.test.ts`, `increment12.pricing.test.ts`, `v2DrumPlanPersistence.test.ts` |

---

## Appendix B — Proposed code changes (implementation follow-on)

| File | Change |
|------|--------|
| `src/domain/v2CostingRequestService.ts` | **NEW** — handoff → `StructuredCostingRequest` |
| `src/server/v2CostingRepository.ts` | **NEW** — V2 preview/persist |
| `src/server/v2InquiryConfigurationRoutes.ts` | Add costing endpoints |
| `src/services/costingRequestService.ts` | V2 branch delegate |
| `src/server/costingOrchestrationService.ts` | Accept V2 lineage in options; enrich snapshots |
| `src/server/commercialPricingRepository.ts` | Optional `drumPlanId` on snapshot |
| `src/components/cable-configurator/v2/components/CostingSectionV2.tsx` | **NEW** UI |
| `prisma/schema.prisma` | Lineage FK columns |

**Do not modify:** `costingEngine.ts`, `costingEngine.test.ts`, `bomConflictGovernanceService.ts` conflict resolution logic, drum optimization services.

---

## Appendix C — Proposed migration summary

See §18.1. Additional indexes on `(inquiryLineId, workflowChannel, createdAt DESC)` for current-run lookup.

---

## Appendix D — Proposed test list

See §19.2. Minimum bar: **8 integration scenarios** + **2 unit modules** before V2 costing beta.

---

## Appendix E — Frozen areas (do not touch in 05E implementation without explicit unfreeze)

- `src/domain/costingEngine.ts` / `costingEngine.test.ts`
- Direct RM / `CostingMetalCostComponent` semantics
- `docs/DECISION5*` content (unless PO requests)
- 81 BOM conflict resolution / dedupe / mass-approve
- Drum Master schema and optimization algorithms
- V1 configurator paths
- Fulfillment WIP components
- D365 integration
- Quotation implementation (beyond pricing snapshot cross-ref design)

---

## Appendix F — PO decisions checklist

- [ ] Decision 5 sign-off (Option B recommended per current code)
- [ ] Accept 10009487 Direct RM reconciliation under chosen option
- [ ] Approve V2 costing length basis (D-05E-1)
- [ ] Approve lineage FK model (D-05E-2)
- [ ] Confirm costing blocked until BOM governance complete (no gate bypass)
- [ ] Confirm separate commercial pricing step after engineering costing
- [ ] Target date for 04B-13 BOM conflict resolution programme

---

**Readiness verdict:** Costing V2 **Direct RM engine is built and frozen** but **not production-ready**. V2 inquiry workflow has **authoritative drum plan handoff (05D)** yet **costing does not consume it**. Commercial pricing **exists for quotations** but lacks **V2 lineage coupling**. The platform cannot truthfully answer *"which drum plan produced this cost?"* for V2 inquiries until Task 05E implementation completes — and cannot reach production Quote-to-Cash while **81 BOM conflicts** block Gate 2 and **Decision 5** remains unsigned.
