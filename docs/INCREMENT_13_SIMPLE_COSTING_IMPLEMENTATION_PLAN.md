# Increment 13 Final — Simple Low-Code Cable Costing Configuration

> **Stage A — Inspection + Implementation Plan ONLY**  
> **Status: ANALYSIS COMPLETE. STAGE B NOT STARTED.**  
> **Date:** 2026-08-22  
> **Rule:** Stop after this document. Do not modify application code until Stage A is approved.

This plan simplifies the **Administration → Costing Configuration** experience around the **existing Increment 13 costing engine**. It does not create a second engine, formula parser, BOM system, or price master.

Companion documents (already in repo):

- [`COSTING_ARCHITECTURE.md`](./COSTING_ARCHITECTURE.md)
- [`INCREMENT_13_IMPLEMENTATION_PLAN.md`](./INCREMENT_13_IMPLEMENTATION_PLAN.md)
- [`INCREMENT_13_PHASE_E_IMPLEMENTATION_PLAN.md`](./INCREMENT_13_PHASE_E_IMPLEMENTATION_PLAN.md)
- [`INCREMENT_13_PHASE_E_IMPLEMENTATION_LOG.md`](./INCREMENT_13_PHASE_E_IMPLEMENTATION_LOG.md)
- [`INCREMENT_13_COSTING_RULE_DISCOVERY.md`](./INCREMENT_13_COSTING_RULE_DISCOVERY.md)
- [`ELAND_COSTING_RECONCILIATION.md`](./ELAND_COSTING_RECONCILIATION.md)
- [`ELAND_COSTING_GOLDEN_REGRESSION.md`](./ELAND_COSTING_GOLDEN_REGRESSION.md)
- [`LOW_CODE_CONFIGURATION.md`](./LOW_CODE_CONFIGURATION.md)

---

## Executive summary

Increment 13 **already calculates** cable cost server-side:

```
Cable Master → approved BOM → scrap → RawMaterialPrice → optional formulas
→ optional logistics/packing → CostingCalculation snapshot
```

The production path is:

```
Inquiry Calculate
  → POST /api/inquiries/:id/lines/:lineId/calculate-cost
  → calculateInquiryLineCost
  → executeCostingForInquiryLine
```

Technical Office and `/api/costing/calculate` already **delegate** to the same orchestrator.

**What is missing is not an engine.** The costing team still sees a technical control plane (variables, layers, raw expressions, many tabs). This increment must make that plane **business-simple**:

`Select cable → see BOM → see prices → set scrap % → optional formula template → preview → approve → activate`

Then the customer only: **New Inquiry → Select Cable → Length / Quantity → Calculate**.

---

## 1. Existing Increment 13 architecture

| Layer | Location | Role |
|-------|----------|------|
| Orchestrator | `src/server/costingOrchestrationService.ts` | `executeCostingPreview`, `executeCostingForInquiryLine` — **one engine** |
| Material engine | `src/domain/costingEngine.ts` | BOM × price × length × qty; 4-gate readiness |
| Formula engine | `src/domain/costingFormulaEngine.ts` | Safe `+ - * /` parser; no `eval`, no JS, no SQL |
| Scrap | `src/server/costingScrapRuleRepository.ts` + orchestrator scrap resolve | BOM-line % or `CostingScrapRule` |
| Extension layers | `src/server/costingExtensionLayers.ts` | Metal rate / logistics / packing — **configured amounts only** |
| FX | `src/domain/currencyConversion.ts` | Governed `CostingExchangeRate` |
| Inquiry persist | `src/server/commercialRepository.ts` | `calculateInquiryLineCost` / `calculateInquiryCost` |
| Compat adapter | `src/server/costingRepository.ts` | Inc 10 `/api/costing/calculate` → orchestrator |
| Admin API | `src/server/costingAdminRoutes.ts` | `/api/admin/costing/*` |
| Platform admin | `src/server/platformAdminRoutes.ts` | Metal / logistics / packing / `PlatformFieldDefinition` |
| Admin UI | `CostingHub.tsx` → `AdministrationCostingPanel.tsx` + `BomScrapPanel.tsx` |
| Inquiry UI | `CommercialInquiryDetail.tsx` Costing tab + header Calculate |
| Preview UI | Admin Preview tab + `CostingCalculator.tsx` (quick quote) |
| Projection | `src/server/commercialProjection.ts` | Strips internal cost fields from customers |

**Authoritative sequence already implemented (maps to requested Steps 1–12):**

1. Identify cable (`materialNumber`)
2. Read Cable Master
3. Load **governed** BOM (source BOM only if no governed lines; conflicts block)
4. Calculate consumption from BOM qty × length × quantity
5. Apply scrap (BOM % or scrap rule; never invent)
6. Resolve `RawMaterialPrice`
7. Calculate each material line cost
8. Evaluate approved formula layers **only if** an ACTIVE configuration version has formulas
9. Apply logistics **only if** `CostingLogisticsRule` matches and amount is configured
10. Apply packing **only if** `CostingPackingRule` matches and amount is configured
11. Line total = manufacturing rollup (or material) + configured logistics + configured packing
12. Persist immutable `CostingCalculation` + `CostingRun`; link `CommercialInquiryLine.costingCalculationId`

**Do not replace this sequence.** Stage B only makes it configurable and visible through a simpler admin UI.

---

## 2. Existing costing models

Inspected in `prisma/schema.prisma`. **No `CostingMethod` table exists.** Methods are `CostingConfiguration` (+ versions). `/api/admin/costing/methods` already aliases `listCostingConfigurations()`.

| Model | Reuse |
|-------|--------|
| `CostingConfiguration` / `CostingConfigurationVersion` | Costing methods + versioning (`DRAFT` → `PENDING_APPROVAL` → `APPROVED` / `ACTIVE` / `SUPERSEDED` / `INACTIVE`) |
| `CostingVariable` | Business variables (code, name, kind, unit) |
| `CostingComponent` | Sequence / layers (`MATERIAL`, `SCRAP`, `DRUM`, `EX_WORK`, …) via `sortOrder` |
| `CostingFormula` / `CostingFormulaVersion` / `CostingFormulaDependency` | Safe formulas bound to a configuration version |
| `CostingScrapRule` | Scrap % by GLOBAL / FAMILY / CABLE / MATERIAL |
| `CostingCalculation` / `CostingCalculationSnapshot` | Immutable calculation snapshots |
| `CostingRun` / `CostingLine` | Material-layer run |
| `CostingExchangeRate` | Governed FX |
| `CostingMetalRate` | Governed metal rates (not customer LME invention) |
| `CostingLogisticsRule` | Incoterm + destination |
| `CostingPackingRule` | Drum / packing |
| `PlatformFieldDefinition` | Field visible / required / order / customerVisible |
| `CommercialInquiry` / `CommercialInquiryLine` | Inquiry persist + `costingCalculationId`, `materialCost` |
| `AuditEvent` | Append-only audit |

**Stage B default: add no new Prisma models.** Use `CostingVariable.metadata` / formula `description` for business aliases and templates if needed.

---

## 3. Existing BOM integration

| Model | Role |
|-------|------|
| `CableBomLine` | Imported source BOM |
| `BomDuplicateObservation` | Conflict register |
| `GovernedBomLine` | Approved BOM consumed by costing (`scrapPercentage` used) |

Admin already has:

- `GET /api/admin/costing/bom-scrap/cables`
- `GET /api/admin/costing/bom-scrap?cable=`
- `PUT /api/admin/costing/bom-scrap` — scrap % on **governed** lines only

`BomScrapPanel` searches cables by material number and lists BOM + scrap. It does **not** bypass BOM approval. If BOM is unapproved / conflicted, orchestrator returns `NOT_READY` with reasons.

**Gap:** no cascading Family / Voltage / Conductor picker on this screen; no read-only RM price columns in the same grid; no “Cable Found / Technical Office Required” banner.

---

## 4. Existing RawMaterialPrice integration

`RawMaterial` + versioned `RawMaterialPrice` remain the only price source. Orchestrator uses existing price governance (`getValidRawMaterialPrice`). Missing / expired / unapproved price → `UNPRICED` / `NOT_READY`. No fake prices.

Admin costing must **display** current price, currency, UOM, basis, effective dates, status. It must **not** create a second price editor. Price create/approve stays in existing Master Data / price governance screens.

---

## 5. Existing scrap engine

Resolution order (already in orchestrator):

1. Governed BOM line `scrapPercentage` when set
2. Else matching `CostingScrapRule` (scope + dates + ACTIVE)
3. Else no scrap applied (`NONE`) — does **not** invent 1% or ELAND defaults

Admin can Add / Edit / workflow Submit → Approve → Activate scrap rules. Changes already write `AuditEvent`.

**Gap:** UI is technical (scope type / priority / workflow). Stage B needs a simple form: Material → Scrap % → Method label `Quantity × (1 + Scrap %)`.

---

## 6. Existing formula engine

`costingFormulaEngine.ts` already supports only `+ - * /` and parentheses. Identifiers must exist in `CostingVariable`. No functions beyond that. No SQL. No JavaScript.

Example already documented:

```
MATERIAL_COST / (1 - EX_WORK_RATE)
```

**Critical existing behavior:** material cost (qty × price × scrap) is computed **without** requiring the costing team to write a formula. Formulas are optional manufacturing / conversion layers.

**Gap:** admin formula UI posts a raw `expression` string. There is no FIELD → VALUE → FORMULA builder and no STANDARD MATERIAL COST template. Stage B must generate the existing safe expression internally.

---

## 7. Existing inquiry integration

| Capability | Status |
|------------|--------|
| Customer / sales New Inquiry | ✅ `InquiryQuotationWorkspace` + PostgreSQL |
| Select cable (Path A) | ✅ Cable search / configurator → `materialNumber` |
| Qty, cutting length, drum | ✅ Line editor; total length = drums × cutting length |
| Header commercial inputs | ✅ Currency, incoterms, destination, metal rates in `commercialMetadata` |
| Calculate (all lines) | ✅ Header button → `POST /api/inquiries/:id/calculate-cost` |
| Calculate (one line) | ✅ `POST /api/inquiries/:id/lines/:lineId/calculate-cost` |
| Persist snapshot | ✅ `CostingCalculation` + line `costingCalculationId` + `materialCost` |
| Reopen after refresh | ✅ Loaded from PostgreSQL, not localStorage |
| Submit gate | ✅ Mapped lines need calculation |
| Post-submit lock | ✅ `COSTING_LOCKED` |
| Customer may call inquiry calculate | ✅ `assertCanCalculateInquiryCost` allows customers; result is projected |
| Customer cannot call `/api/admin/costing/*` | ✅ Admin RBAC |
| Customer sees internal breakdown | ❌ Hidden (`commercialProjection`) |
| Customer sees Total / Cost per meter | ❌ Also hidden today (`materialCost` stripped) |

Inquiry detail tabs **today:** Overview, Cable Lines, Commercial Terms, Cable Construction, Drum Plan, Costing, Documents, Version History, Audit.

Requested tabs: Overview, Cable, Costing, Documents, Messages, History, Audit.

**Do not delete** Commercial Terms, Construction, or Drum Plan. Stage B maps Cable ← Cable Lines, History ← Version History, Audit ← Audit, and may add a **Messages** placeholder. Costing tab already exists; Stage B clarifies READY / NOT READY, summary, cost/m, version, calculated at/by — full internals only for costing-permission internals.

---

## 8. Existing low-code models

| Capability | Status |
|------------|--------|
| `CostingVariable` / `CostingFormula` / scrap / logistics / packing | ✅ Models + APIs |
| `PlatformFieldDefinition` | ✅ Model + `GET/POST /api/admin/platform/fields` |
| Inquiry field visibility | ⚠️ Client `inquiryFieldManifest.ts` + per-user localStorage — **not yet driven by** `PlatformFieldDefinition` |
| Admin field-config UI | ❌ No Administration screen for inquiry/cable/costing field flags |

Stage B wires authorized admins to existing `PlatformFieldDefinition` (Visible / Hidden / Required / Read-only / Display order / `customerVisible`) for inquiry, inquiry line, cable, and costing fields. **Do not add a column per field.**

---

## 9. What can be reused (do not rebuild)

- `executeCostingForInquiryLine` / `executeCostingPreview`
- Cable Master + `CableParameter` + compatibility / validation
- Governed BOM + RawMaterialPrice
- Scrap rules + formula engine + configuration versions
- Logistics / packing / metal-rate models (optional layers)
- Inquiry calculate APIs and persistence
- `AuditEvent`
- RBAC (`COSTING_USER`, `COSTING_MANAGER`, customer isolation)
- `BomScrapPanel`, admin preview, Costing Calculator (same engine)
- Cable configurator V2 cascading selectors (for admin cable setup)
- ELAND workbook at `data/regression/ELAND Cost Sheet Required.xlsx` (regression only; **do not import as master data**)

---

## 10. What must be changed (Stage B scope)

This is a **UI + mapping + test** increment on top of the existing engine.

### B1 — Simplified Costing Configuration UI

Collapse the technical tab farm into the requested business nav:

| Nav | Maps to existing |
|-----|------------------|
| Methods | `CostingConfiguration` list: View / Edit / Clone / Activate / Deactivate |
| Cable Setup | New simple screen: existing parameter dropdowns → Cable Found / Technical Office Required |
| Materials | Read-only RM prices for the selected cable BOM |
| BOM | Existing `BomScrapPanel` + approval status / NOT READY reasons |
| Scrap | Simple % editor (existing scrap APIs) |
| Formulas | Simple builder + templates (existing formula APIs) |
| Logistics | Existing `CostingLogisticsRule` admin |
| Packing | Existing `CostingPackingRule` admin |
| Preview | Same orchestrator as inquiry (`executeCostingForInquiryLine`, `persist: false`) |
| Versions | Existing configuration version list |
| Approval | Existing approval queue |

Keep FX, metal rates, variables, layers, and audit reachable as **advanced / more** — do not delete them. Do not expose AST, SQL, or JSON to the default costing-team view.

Methods table columns: Method, Description, Status, Version, Action.  
**No delete** of a method that has historical `CostingCalculation` rows (there is already no delete API — keep it that way). Clone = new `CostingConfiguration` + copied draft formulas.

Arabic + English already exists on `AdministrationCostingPanel`; keep it.

### B2 — Cable → BOM → Raw Material → Scrap mapping

Reuse Cable Master parameters. When parameters resolve an existing cable, show:

Cable Code / Item Code / Material Number / Description / Diameter / Weight / Status.

If not found: **Technical Office Required**. Do not invent a cable. Costing stays `NOT_READY`.

BOM grid (read-only except scrap where governance allows): Sequence, Material, Description, Qty, UOM, Cost Basis, Scrap, Status, plus current governed price or **UNPRICED**.

### B3 — Formula configuration

Default path: **no formula required**. Engine already computes material cost.

Provide template **STANDARD MATERIAL COST** (documentation + optional generated expression using existing variables):

```
AdjustedQuantity × GovernedPrice
```

Optional manufacturing template (only if costing team enters a rate already stored as a variable, never a hard-coded 6%):

```
MATERIAL_COST / (1 - EX_WORK_RATE)
```

Simple builder: pick input / operator / input → system writes the safe expression. Advanced raw expression remains for `COSTING_MANAGER` only.

Business-friendly labels (`CableLength`, `CopperPrice`, …) map to existing `CostingVariable` codes (`LENGTH_METERS`, `MATERIAL_COST`, …) via `name` / `metadata`. Do not force DB column names.

### B4 — Calculation Preview

Admin Preview must call the **same** orchestrator as inquiry.

**Gap today:** `POST /api/admin/costing/preview` calls `executeCostingPreview` only, so logistics/packing stamps are incomplete versus inquiry.

**Change:** preview body → `executeCostingForInquiryLine(..., { persist: false })`. Do not add `previewCostingEngine.ts`.

Result layout: MATERIAL COST (per RM: qty, price, scrap, cost) → subtotal → scrap adj → manufacturing → packing → logistics → TOTAL → cost/m → cost/kg → READY / NOT READY with explicit reasons. Missing values stay blank / `CONFIGURATION_REQUIRED`. Never invent.

### B5 — Customer Inquiry Calculate

Already wired. Stage B work:

- Keep Calculate on the inquiry (customer + authorized internal)
- Costing tab: status, Calculate, cost summary, total, cost/m, costing version, calculated at/by
- Internals (RM prices, scrap config, formulas, manufacturing notes) **only** if actor may view internal costing
- Customer API projection: hide internals; **policy decision below** for Total / Cost per meter
- Do not calculate in React

### B6 — Persistence

Already PostgreSQL. Verify (do not re-implement): header, lines, cable, qty, length, commercial inputs, `costingCalculationId`, result, configuration version, timestamps survive refresh / new login.

### B7 — ELAND four-cable regression

Workbook cables (from `ELAND_COSTING_RECONCILIATION.md`, **source values only**):

| # | Material | Description |
|---|----------|-------------|
| 1 | 10009487 | Cu/XLPE/LSHF 0.6/1kV 1×16 mm² |
| 2 | 10009546 | Cu/XLPE/LSHF 0.6/1kV 5×185 mm² |
| 3 | 10010347 | Al/XLPE/MDPE 18/30kV CWs 1×300/25 mm² |
| 4 | 10010439 | Cu/XLPE/MDPE 8.7/15kV CWs 1×400/35 mm² |

Do **not** invent BOM qty, scrap, LME additives (505 / 50), or shipping. If a governed price or mapping is missing, test asserts `NOT_READY` and lists the missing item.

### B8 — Browser acceptance

Manual pass on `:3847`: admin configure → preview → customer inquiry calculate → refresh → reopen → second inquiry reproducibility.

---

## 11. What must NOT be changed

- Do not create `customerCostingEngine.ts`, `salesCostingEngine.ts`, or `technicalCostingEngine.ts`
- Do not create a second formula parser or visual programming language
- Do not duplicate Cable Master, BOM, RawMaterialPrice, Customer, User, Role
- Do not invent LME, additives, scrap %, shipping, or drum cost
- Do not let draft configuration affect live customer calculations (only `ACTIVE` + effective dates)
- Do not mutate historical `CostingCalculation` / snapshots
- Do not bypass BOM or price approval
- Do not expose internals to customers via API
- Do not break Increments 1–12 business rules
- Do not start Increment 14 / LME policy
- Do not reset the database

---

## 12. Simplified admin UX

Think **FIELD → VALUE → FORMULA → RESULT**.

Costing team happy path:

1. Select Cable (existing parameters)
2. View BOM (governed)
3. View Raw Material Prices (read-only)
4. Configure Scrap %
5. Optional formula template
6. Preview (same engine)
7. Save Draft
8. Submit for Approval
9. Approve
10. Activate

Only ACTIVE versions are resolved by `resolveActiveConfigurationVersion` at inquiry calculate time (already implemented).

---

## 13. Customer calculation flow

```
My Inquiries → New Inquiry
  → Header (customer, project, currency, metal if required, incoterm, destination, dates)
  → Add Cable (existing selector)
  → Length / Quantity / drum if applicable
  → [CALCULATE]
      server: access → cable → BOM → materials → prices → scrap
              → formulas if ACTIVE → packing if configured → logistics if configured
              → persist CostingCalculation
  → Customer-safe result
  → Save / Submit (existing)
```

Customer never opens Administration Costing. Customer never configures scrap or formulas.

---

## 14. Four ELAND cable test plan

**Fixture source:** `data/regression/ELAND Cost Sheet Required.xlsx` (read at test time).  
**Do not import the workbook into master tables.**

For each of 10009487, 10009546, 10010347, 10010439:

1. Confirm Cable Master exists (or `CABLE_NOT_FOUND` / Technical Office Required — do not invent)
2. Confirm Gate 1 engineering mapping APPROVED (or assert `NOT_READY` + reason)
3. Confirm governed BOM + prices + scrap as actually present
4. Internal user: Preview via admin API → same orchestrator
5. ELAND-scoped customer: New Inquiry → select cable → enter length/qty from workbook context if present → Calculate
6. Assert `CostingCalculation` created **or** explicit `NOT_READY` list (BOM / copper price / scrap / mapping)
7. Refresh / reopen inquiry → same calculation id and totals
8. Second inquiry with same cable → reproducible result from same ACTIVE config (new calculation row, same method)

Workbook aggregates (reference only; do not hard-code invented per-line numbers):

| Metric | Workbook |
|--------|----------|
| Material total EUR | 181,194.03 (`Summary!L17`) |
| Ex-work total EUR | 192,759.61 (`Summary!J17`) |
| Shipping EUR | 3,603.09 (`Summary!J18`) |
| DAP grand total EUR | 196,362.70 (`Summary!J19`) |

Ex-work uses workbook rate `I10 = 0.06` **only if** that rate is stored as a governed variable — never hard-code `0.06` in the engine. Shipping participates only if a logistics rule exists with a configured amount.

---

## 15. Persistence test plan

Automated (extend `increment13.phaseE.test.ts` / new focused suite — **no new engine**):

1. Create inquiry + line (Path A cable)
2. Calculate → `costingCalculationId` and snapshots in PostgreSQL
3. `GET` inquiry by id (new request, no client cache) → same header, lines, qty, length, commercial metadata, calculation id
4. Customer GET → internals absent; allowed summary fields per §16
5. Recalculate after submit → `COSTING_LOCKED`
6. New version → new calculation allowed; old snapshot unchanged

Manual: close browser, login, open inquiry — data still present.

---

## 16. Security model

Reuse existing RBAC. Map requested names to **existing** catalog entries (do not duplicate permissions unless a gap is real):

| Requested | Existing |
|-----------|----------|
| COSTING_CONFIGURATION_VIEW | `COSTING.CONFIGURATION.VIEW` / `FORMULA.VIEW` |
| COSTING_CONFIGURATION_CREATE | `COSTING.CONFIGURATION.CREATE` |
| COSTING_CONFIGURATION_UPDATE | `COSTING.CONFIGURATION.UPDATE` |
| COSTING_CONFIGURATION_APPROVE | `COSTING.CONFIGURATION.APPROVE` |
| COSTING_CONFIGURATION_ACTIVATE | same APPROVE / version activate |
| COSTING_CALCULATE | `COSTING.COSTING_RUN.CALCULATE` (internal `/api/costing/*`) |
| Inquiry calculate | `assertCanCalculateInquiryCost` (customer allowed; projected) |
| COSTING_VIEW_INTERNAL | internal userType or `costingPricing` — `canViewCostBreakdown` / `canViewInternalInquiryCosts` |

Customer:

- **Must not** call `/api/admin/costing/*` or `/api/costing/calculate`
- **May** call inquiry calculate on **their** inquiry
- Response projection must continue to strip RM prices, scrap rules, formulas, manufacturing notes, `costingRunId`

**Policy decision required before B5 UI (does not block B1–B4):**

| Option | Meaning |
|--------|---------|
| A (current tests) | Customer never sees `materialCost`; only Quoted Price later |
| B (spec §32) | Customer sees Total + Cost/m + Currency only, via a dedicated projected summary (not RM breakdown) |

Recommend **B** with a new projected field (e.g. `customerCostSummary`) so existing tests that assert `materialCost === undefined` remain true. Do not loosen projection of internals.

All authorization stays server-side.

---

## 17. Migration requirements

**Expected: none.**

Stage B should not need a new Prisma model or migration if:

- Methods = `CostingConfiguration`
- Templates write existing `CostingFormulaVersion.expression`
- Field flags use `PlatformFieldDefinition`
- Customer summary is a projection DTO, not a new column

Create a migration **only if** a later Stage B review finds a genuine gap (unlikely). Follow existing Prisma conventions; do not reset the database.

---

## 18. Regression test strategy

| Suite | Purpose | Rule |
|-------|---------|------|
| `increment13.costing.test.ts` | Config / formula CRUD | Must stay green |
| `increment13.phaseD.test.ts` | Scrap workflow + preview | Must stay green |
| `increment13.phaseE.test.ts` | Inquiry calculate, lock, customer projection | Update only if Option B summary is added |
| `increment13.bomScrap.test.ts` | BOM scrap admin | Must stay green |
| `increment13.calculator.test.ts` | Quick quote uses orchestrator | Must stay green |
| `increment13.fx.test.ts` | FX LE conversion | Must stay green |
| `increment10.costing.test.ts` | Compat adapter | Must stay green |
| `increment12.inquiryUi.test.ts` / pricing | Inquiry + quotation | Must stay green |
| New ELAND four-cable suite | Workbook-driven; `NOT_READY` if data missing | No invented asserts |
| `inquiryLineValue` / field manifest | Value + visibility | Must stay green |

Do not weaken existing tests. Do not skip hooks. `tsc --noEmit` before Stage B close.

---

## Stage B execution order (after approval only)

| Step | Work | Engine change? |
|------|------|----------------|
| B1 | Simplify `AdministrationCostingPanel` / `CostingHub` nav + Methods actions + Cable Setup | No |
| B2 | Cable parameter picker → BOM + RM price + scrap grid | No (read + existing PUT scrap) |
| B3 | Simple formula builder + STANDARD templates | No (writes existing expressions) |
| B4 | Preview → `executeCostingForInquiryLine({ persist: false })` + result layout | Call-site only |
| B5 | Inquiry Costing tab summary + customer-safe total (if Option B approved) | Projection only |
| B6 | Persistence tests | No |
| B7 | Four-cable ELAND regression | No |
| B8 | Browser acceptance | No |

---

## Success criteria

Costing team can:

**Administration → Costing → Select Cable → view BOM → view prices → set scrap → optional formula → Preview → Approve → Activate**

without coding, SQL, or database access.

Customer can:

**My Inquiries → New Inquiry → Select Cable → Enter Length → Calculate**

and receive a governed result (READY with totals, or NOT READY with explicit missing items).

One engine. No invented numbers. Historical calculations unchanged.

---

## STOP

Stage A is complete. **Do not implement Stage B until this plan is approved.**
