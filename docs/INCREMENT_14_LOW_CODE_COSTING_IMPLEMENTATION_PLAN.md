# Increment 14 — Low-Code Costing Configuration Implementation Plan

**Date:** 2026-08-23  
**Engine rule:** The Increment 13 orchestrator is the only production costing path. This increment does not add a second engine, formula parser, BOM system, or price table.

**Production path (unchanged):**

```
Inquiry Calculate
  → POST /api/inquiries/:id/lines/:lineId/calculate-cost
  → calculateInquiryLineCost
  → executeCostingForInquiryLine
```

Admin Preview must call the same function with `persist: false`.

---

## 1. Existing costing architecture

| Layer | Location | Role |
|-------|----------|------|
| Orchestrator | `src/server/costingOrchestrationService.ts` | `executeCostingPreview`, `executeCostingForInquiryLine` |
| Material engine | `src/domain/costingEngine.ts` | BOM × governed price × length × qty; 4-gate readiness |
| Formula engine | `src/domain/costingFormulaEngine.ts` | Tokenizer → AST → validate → evaluate; `+ - * / ( )` only |
| Scrap | `costingScrapRuleRepository` + orchestrator `resolveScrapRate` | BOM % first, else matching `CostingScrapRule` |
| Extensions | `costingExtensionLayers.ts` | Metal / logistics / packing — configured amounts only |
| Inquiry persist | `commercialRepository.calculateInquiryLineCost` | Immutable `CostingCalculation` |
| Inc 10 adapter | `costingRepository.executeCostingRun` | Delegates to orchestrator |
| Admin API | `costingAdminRoutes.ts` `/api/admin/costing/*` | Configuration CRUD + workflow |
| Platform API | `platformAdminRoutes.ts` `/api/admin/platform/*` | Metal, logistics, packing, fields |
| Price API | `masterDataRoutes.ts` `/api/master/raw-material-prices*` | Draft → approve governance + Excel import |
| Admin UI | `CostingHub` → `AdministrationCostingPanel` | Technical control plane |
| Inquiry UI | `CommercialInquiryDetail` Costing tab | Calculate + persisted breakdown |
| Projection | `commercialProjection.ts` | Hides internals from customers |

---

## 2. Existing Increment 13 configuration

`CostingConfiguration` + `CostingConfigurationVersion` (`DRAFT` → `VALIDATION` → `SUBMITTED` → `APPROVED` → `ACTIVE` / `INACTIVE` / `SUPERSEDED`).

`/api/admin/costing/methods` aliases configurations. Live inquiry costing uses `resolveActiveConfigurationVersion` (ACTIVE + effective dates). Drafts do not affect customers.

---

## 3. Existing RawMaterialPrice

`RawMaterial` + versioned `RawMaterialPrice` (`price` nullable, `PRICE_NOT_CONFIGURED` when blank). Workflow: DRAFT → SUBMITTED → APPROVED. Engine uses APPROVED + ACTIVE + date/UOM/basis via `getValidRawMaterialPrice`.

**Reuse.** Do not create a parallel price table. Costing Team workspace wraps existing list/create/import APIs.

---

## 4. Existing BOM

`CableBomLine` (source) → `GovernedBomLine` (approved) → `BomDuplicateObservation` (conflicts). Orchestrator uses governed lines only; conflicts block. Admin `BomScrapPanel` edits scrap % on governed lines only.

---

## 5. Existing scrap

**Preserve this precedence (already implemented):**

1. Governed BOM line `scrapPercentage` when set  
2. Else matching `CostingScrapRule` with `workflowStatus = ACTIVE` and effective dates  
3. Matching scopes currently applied: `CABLE`, `FAMILY`, `GLOBAL`, `BOM_LINE` (raw material code)  
4. Among matches, **lowest `priority` number wins** (not a hard-coded family cascade)  
5. Else no scrap (`NONE`) — does not invent 1% or ELAND defaults  
6. ACTIVE rule with null rate → `NOT_READY`

Enum also has `MATERIAL_CLASS`; the engine does **not** match it today. Increment 14 does not invent that matching.

Gross qty = net × (1 + scrap%/100) is already in `costingEngine.ts`.

---

## 6. Existing formula model

`CostingVariable` → `CostingFormula` + `CostingFormulaVersion` + `CostingFormulaDependency`. Bound to a configuration version. Optional manufacturing layers; **material cost does not require a formula**.

---

## 7–8. CostingCalculation / CostingRun

Immutable snapshots (`inputSnapshot`, `referenceSnapshot`, `outputSnapshot` + `CostingCalculationSnapshot` rows). Linked from `CommercialInquiryLine.costingCalculationId`. Historical rows must not be mutated.

---

## 9. Existing extension layers

`CostingMetalRate`, `CostingLogisticsRule`, `CostingPackingRule`. Missing amount → `NOT_CONFIGURED`, never zero-fill.

---

## 10. Existing Administration UI

`Administration → Costing` and sidebar **Costing Configuration** both render `AdministrationCostingPanel` (methods, variables, formulas, scrap, FX, metal, logistics, packing, layers, preview, approval, versions, audit). Too technical for Costing Team.

Legacy `CostingPricing.tsx` is already replaced by `CostingHub`. Keep Quick Cost Quote as a compatibility adapter that already delegates to the same engine.

---

## 11. Existing low-code metadata

`PlatformFieldDefinition`, `NotificationRule`, `ReportDefinition`. Not required to duplicate for this increment. Formula/variable/scrap/logistics models are the costing low-code surface.

---

## 12. What can be reused

All of §1–11. Especially: `executeCostingForInquiryLine`, price governance import, scrap workflow, formula validate/approve/activate, inquiry calculate, `AuditEvent`, RBAC `COSTING_USER` / `COSTING_MANAGER`, `GET /api/master/costing-readiness` (4-gate).

---

## 13. What must be extended (this increment)

| Gap | Extension |
|-----|-----------|
| Technical tab farm | Business workspace tabs (prices, scrap, variables, formulas, assignment, other costs, validation, preview, versions, approval, audit) |
| No RM prices in costing workspace | Wrap existing `/api/master/raw-material-prices*` |
| Raw expression-only formulas | Simple variable/operator builder that writes the **same** safe expression |
| No cable/family formula assignment | Additive columns on `CostingFormula`; filter in orchestrator (not a new engine) |
| Admin preview skips inquiry extensions | Preview → `executeCostingForInquiryLine(..., { persist: false })` |
| No Costing Team readiness matrix | `GET /api/admin/costing/readiness` using the real orchestrator |
| No cable validate shortcut | `POST /api/admin/costing/validate` same path |

---

## 14. What must not be changed

- Do not add `CostingEngineV2` / customer/formula/legacy engines  
- Do not rewrite `costingFormulaEngine.ts` or BOM/price governance  
- Do not invent prices, scrap %, LME additives, freight, drum cost  
- Do not mutate historical `CostingCalculation`  
- Do not expose internals to customers  
- Do not auto-grant costing authority to `SYSTEM_ADMINISTRATOR` beyond existing RBAC  
- Do not import ELAND workbook as master data  
- Do not reset the database  

---

## 15. Database changes

**One additive migration** on `CostingFormula`:

- `assignmentScope` `String` default `GLOBAL` (`GLOBAL` \| `FAMILY` \| `CABLE`)  
- `assignmentValue` `String?` (family code or material number)  
- `assignmentPriority` `Int` default `100`  
- index `(assignmentScope, assignmentValue)`

Existing formulas remain GLOBAL (apply to all cables — current behaviour).

No new models. No duplicate price/scrap/formula tables.

---

## 16. API changes

Reuse `/api/admin/costing/*` and `/api/master/raw-material-prices*`.

Add:

| Method | Path | Behaviour |
|--------|------|-----------|
| GET | `/api/admin/costing/raw-material-prices` | Alias of governed price list |
| POST | `/api/admin/costing/raw-material-prices` | Alias of create DRAFT (existing validation) |
| GET | `/api/admin/costing/readiness` | Orchestrator preview per cable (default: four ELAND regression materials) |
| POST | `/api/admin/costing/validate` | Same as preview; returns READY / NOT READY + reasons |
| PATCH | `/api/admin/costing/formulas/:id` | Also assignment fields |

Change:

| POST `/api/admin/costing/preview` | Calls `executeCostingForInquiryLine` persist false (includes logistics/packing stamps) |

---

## 17. UI changes

Restructure `AdministrationCostingPanel` (used by Administration and Costing Hub) to Costing Team tabs. English + Arabic labels retained.

Formula builder: pick variable / operator → expression string → existing validate/create APIs.

Customer inquiry Calculate already exists; no second button. Internals remain permission-gated.

---

## 18. Validation

Reuse formula `validateFormula`, price `validatePriceInput`, configuration version validate, scrap rate null-check. New validate endpoint does not invent a fifth gate set — it reports orchestrator blocking reasons.

---

## 19. Approval / publishing

Existing formula/scrap/config/price workflows. Costing Team Publish = activate configuration version + activate formula versions already implemented.

---

## 20. Customer inquiry integration

Already wired. Increment 14 does not calculate in React. Snapshot survives refresh via PostgreSQL.

---

## 21. Security

Admin routes remain server-side RBAC. Customers cannot call `/api/admin/costing/*`. Customer calculate is projected. Do not add new permission modules that duplicate `COSTING:*` catalog entries; map prompt names onto existing `COSTING:FORMULA:*`, `PRICE:*`, `COSTING:SCRAP:*`.

---

## 22. Audit

Existing `AuditEvent` on price, scrap, formula, configuration, FX. Assignment updates write `COSTING_FORMULA_ASSIGNMENT_UPDATED`. Audit remains append-only.

---

## 23. Testing

- Unit: formula assignment selection  
- API: customer 403 on admin costing; preview persist false; readiness for four cables reports CONFIGURATION_REQUIRED without inventing numbers  
- Existing increment 9–13 tests must still pass  

Four ELAND cables (source identities only): `10009487`, `10009546`, `10010347`, `10010439`.

---

## 24. Migration

`prisma/migrations/20260823120000_increment14_formula_assignment/migration.sql` — additive columns with defaults. Backward compatible.

---

## 25. Backward compatibility

- GLOBAL assignment = previous “all formulas on ACTIVE version run”  
- Cable-specific formula with the same `outputVariableCode` overrides FAMILY/GLOBAL for that output only  
- Material cost still runs without any formula  
- Inquiry calculate path unchanged except formula filter  

---

## Formula assignment rule (new, documented)

Inspected: previously **all** ACTIVE formulas on the ACTIVE configuration version ran for every cable.

Increment 14 filter (inside the existing formula loop, not a new engine):

1. Apply GLOBAL formulas  
2. Apply FAMILY formulas when engineering/cable family matches `assignmentValue`  
3. Apply CABLE formulas when `assignmentValue` = material number  
4. If any CABLE formula matches this cable for an `outputVariableCode`, drop FAMILY/GLOBAL formulas with that same output  

---

## Four-cable expectation

Official RM list prices are blank until Finance approves. Tests must **not** require a numeric total. Expected: `NOT_READY` / `CONFIGURATION_REQUIRED` listing missing APPROVED prices, unpublished formulas, or unconfigured logistics/packing — never fabricated ELAND sheet amounts.
