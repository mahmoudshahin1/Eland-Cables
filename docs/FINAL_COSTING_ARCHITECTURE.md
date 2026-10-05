# Final Costing Architecture

**Date:** 2026-08-25  
**Rule:** One production engine. No invented LME additives, freight, drum cost, or official RM prices.

---

## Authoritative function

`executeCostingForInquiryLine` in `src/server/costingOrchestrationService.ts`.

Callers:

| Caller | persist | Purpose |
|--------|---------|---------|
| `commercialRepository.calculateInquiryLineCost` / `calculateInquiryCost` | true | Inquiry Calculate |
| `costingReadinessService` | false | Four-cable / workspace readiness |
| `costingAdminRoutes` preview, validate, readiness | false | Costing Team Preview / BOM Costing status |
| `costingRepository.executeCostingRun` | true | Inc 10 HTTP adapter |

Inner compute: `executeCostingPreview` (same file). Persist + extension stamp + `computeInquiryLineTotalValue` wrap the preview.

---

## Pipeline

```
StructuredCostingRequest
  → resolve ACTIVE CostingConfigurationVersion (unless preview-only)
  → persist path: ensureEngineeringMappingApprovedForCosting
  → executeCostingPreview
       validate inputs (costingEngine)
       load CableMaster + mapping + BOM lines (governed when required)
       for each material line:
         scrap = resolveScrapRate
         price = APPROVED/effective RawMaterialPrice
         FX = currencyConversion (LE ≡ EGP)
         calculateMaterialLineCost
       formulas = selectFormulasForCable then previewFormula (+ - * / only)
       gates → READY | NOT_READY + errorCode
  → resolveAllExtensionLayers (Cu, Al, logistics, packing)
  → lineTotal = material + manufacturing + configured logistics/packing only
  → if persist && READY: CostingCalculation + CostingRun companion + line FK
  → if persist && NOT_READY: update costingReadinessStatus, do not invent total
```

Logistics `NOT_CONFIGURED` is **non-blocking** for inquiry calculate (documented in `calculateInquiryCost`). Missing APPROVED price / engineering / FX **blocks**.

---

## Adapters (not second engines)

### 1. `executeCostingRun` — `costingRepository.ts`

Maps Inc 10 `CostingRequest` → `buildCostingRequestFromPreviewPayload` → `executeCostingForInquiryLine(..., persist: true)`. Throws on NOT_READY. Returns `CostingRun` row.

HTTP: `POST /api/costing/calculate`, `POST /api/costing/:id/recalculate`. Response `engine: 'INCREMENT_13_ORCHESTRATOR'`.

### 2. Inquiry HTTP

`POST /api/inquiries/:id/calculate-cost`  
`POST /api/inquiries/:id/lines/:lineId/calculate-cost`  
→ `commercialRoutes.ts` → repository → orchestrator.

### 3. Quick Cost Quote — **sandbox**

`src/domain/costingCalculator.ts` `stackCalculatorRows`  
`costingCalculatorService.ts` may also call `executeCostingPreview` for a cable.  
HTTP: `POST /api/admin/costing/calculator/preview`.  
**Hardcoded** `DEFAULT_INCOTERM_CHARGE_PERCENT` and UI defaults scrap 2% / margin 6%. **Not** quotation snapshot. **Not** ELAND.

### 4. `costingEngine.ts`

Shared material/manufacturing arithmetic and gates used **by** the orchestrator. Not a parallel HTTP engine.

---

## FX — LE / USD

`src/domain/currencyConversion.ts`:

- Company base: **LE** (EGP alias normalized to LE).
- Resolution: same currency → inquiry `rawMaterialExchangeRate` → inquiry `exchangeRate` → governed `CostingExchangeRate` (APPROVED or ACTIVE, effective on date) → else **`FX_NOT_CONFIGURED`** (blocks). DRAFT/SUBMITTED FX ignored.
- Snapshot stored on calculation input (`fxSnapshot`).

Inc 14 four-cable probe: LE→USD missing for at least A-ECAP10 on `10009487`.

---

## Scrap precedence

`resolveScrapRate` (`costingOrchestrationService.ts`):

1. BOM line `scrapPercentage` if ≥ 0 → source `BOM_LINE`.
2. Else ACTIVE `CostingScrapRule` matching scope, effective on costing date.
3. Specificity: BOM_LINE > CABLE > FAMILY > MATERIAL_CLASS > GLOBAL.
4. Then lowest `priority` wins.
5. Two winners at same specificity+priority → `BUSINESS_RULE_REQUIRED` (no invented rate).

UI: Costing Scrap Rules + BOM Costing tab (`GET/PUT /api/admin/costing/bom-scrap`). TO does not approve costing prices (`rbac.ts`).

---

## Formulas — `+ - * /` only

`costingFormulaEngine.ts`: `OPERATORS = { '+', '-', '*', '/' }`, parentheses, numbers, identifiers. No `eval()`. Unknown characters → `UNEXPECTED_TOKEN`.

UI: `SAFE_OPERATORS`; `UNSUPPORTED_FUNCTIONS = SUM, AVG, ROUND, MIN, MAX, ABS, IF` (`CostingConfigurationDashboard.tsx`).

Assignment (`costingFormulaAssignment.ts`): GLOBAL / FAMILY / CABLE; cable-specific output variable wins. Family assignment is ineffective while `CableMaster.family` is null (ELAND set UNMAPPED).

---

## Extension layers

`costingExtensionLayers.ts`:

- Metal: ACTIVE `CostingMetalRate` with non-null `rate`. Customer header copper/aluminium rates are **metadata**; they do not fill LME unless a governed rule exists (`rateSource` on model).
- Logistics: incoterm + destination rule amount.
- Packing/drum: packing rule / drum code.

Empty → `NOT_CONFIGURED` (honest). Do not zero-fill.

---

## SYSTEM READY vs BUSINESS CONFIGURED

Engine, language, gates, persist rules: **SYSTEM READY**.

Four ELAND cables READY totals: **not** until Costing Team APPROVES official prices, TO APPROVES mappings and governed BOM, FX exists, and optional logistics/packing are configured. Official `Raw Material List.xlsx` Price column is blank (`data/source/README.md`).
