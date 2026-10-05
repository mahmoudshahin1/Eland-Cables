# Costing V2 — Final UAT & Production-Readiness Report

**Date:** 29 Aug 2026  
**Mode:** Read-only validation (no engine, master data, or test changes)  
**Authority:** `docs/COSTING_V2_BUSINESS_SPECIFICATION.md`, Decision 5 Option B (LME/Base only)  
**Environment:** Local PostgreSQL via `.env`; probes `persist: false`

---

## 1. Executive Summary

| Item | Result |
|------|--------|
| **UAT executive result** | **PASS WITH DATA GAPS** |
| **Production readiness** | **NOT READY** |
| **Decision 5** | **OPEN** — blocks production sign-off per locked spec |

**Summary:** Costing V2 Direct RM engine behaviour aligns with locked Decisions 1–4 and Option B under live probes. Golden regression cable **10009487** at Cu **14,600 USD/MT**, **1,000 m**, **USD** produces **2,500.58 USD** Direct RM (CR01 **1,974.36 USD**); Cu **16,000** produces **2,689.90 USD** with **+189.32 USD** delta on CR01 only. Workbook Summary **2,571.11 USD** differs by **−70.53 USD (−2.74%)** — classified as **expected commercial variance** (landed metal + standard RM list vs landed), not a UOM defect.

**Automated tests:** **516 / 516 pass**; `tsc --noEmit` clean. Platform-wide readiness: **2 / 435** cables `READY_FOR_COSTING`; **433** Gate 4 failures (mostly missing approved standard RM prices and CR01 gate without inquiry header).

**No engine fixes applied.** Decision 5 unsigned → production **NOT READY** regardless of engine correctness.

---

## 2. Scope & Constraints

### In scope
- Direct Raw Material Cost only (Decisions 1–4, Option B)
- Inspection of engine, orchestration, admin APIs, Costing V3 UI routes
- DB baseline counts (read-only)
- Four-cable validation **10009487–10009490**
- Golden regression **10009487**
- Existing probes and full `npm test` suite

### Out of scope / frozen (not modified)
- `costingEngine.ts`, Direct RM formula, classifications, scrap semantics
- `CostingMetalCostComponent` consumption by engine
- Production master data inserts
- Decision 5 implementation (Option A landed)
- Browser click-through UAT (code/route/test verification only)

### Locked rules verified
| Rule | Expected |
|------|----------|
| Direct RM | Σ(Consumption × Applied Price) → FX to inquiry currency |
| Market metals | CR01/AR01 from inquiry header; ignore RM master list price |
| Option B | LME/Base only; Premium/Shipping/Clearance **not** in Direct RM |
| Scrap | Stored (1.5% CU L.V); **not** multiplied into Direct RM |
| Packing | A-ECAP10 PCS excluded; no PCS→kg conversion |

---

## 3. Methodology

| Phase | Activity | Artifacts |
|-------|----------|-----------|
| 1 | Read spec, engine, orchestration, admin routes, UI nav | This report §4–§5 |
| 2 | DB counts via `scripts/inspectCostingReadinessState.ts` | §6 |
| 3 | Four-cable master/BOM/classification validation | §7–§8 |
| 4 | `probeInquiryHeaderCurrencyCosting.ts`, `probeElandFourCables.ts`, `npm test`, `tsc --noEmit` | §9–§10 |
| 5 | Golden regression line trace 10009487 | §11 |
| 6 | Four-cable table + workbook reconciliation | §12–§13 |
| 7 | UI verification from code/tests | §14 |
| 8 | Production readiness & recommendations | §15–§18 |

**Probe actor:** `u-admin-1` (persist: false). **Probe defaults:** Cu **14,600**, Al **3,300** USD/MT, **1,000 m**, qty **1**.

---

## 4. Architecture & Component Map

### Core domain (frozen)
| Module | Role |
|--------|------|
| `src/domain/costingEngine.ts` | Direct RM calculation; UOM normalize; packing exclusion |
| `src/domain/inquiryMetalPricing.ts` | Header Cu/Al resolution; blocks `INQUIRY_*_PRICE_REQUIRED` |
| `src/domain/priceUom.ts` | KG/MT/PCS/M basis; governed MT↔kg |
| `src/domain/rawMaterialClassification.ts` | `pricingCategory` + `metalType` helpers |
| `src/domain/currencyConversion.ts` | FX after line cost; header currency = result currency |
| `src/server/costingOrchestrationService.ts` | `executeCostingForInquiryLine`; gates; snapshots |
| `src/server/costingWorkspaceService.ts` | Dashboard, ELAND readiness, bulk preview |
| `src/server/costingAdminRoutes.ts` | `/api/admin/costing/*` REST surface |

### Costing flow (confirmed)
```text
Inquiry (currency, Cu/Al USD/MT)
  → Cable + BOM (governed preferred, source fallback)
  → RM Master (pricingCategory + metalType)
  → Applied price (header for market metal | approved RM price)
  → UOM normalize → line cost → FX → Direct RM total
  (scrap stored; packing excluded; MCC not applied)
```

---

## 5. API & UI Surface Map

**Base path:** `/api/admin/costing` (`costingAdminRouter` in `server.ts`)

| Area | Key endpoints | UI (Costing V3) |
|------|---------------|-----------------|
| **Dashboard** | `GET /workspace/dashboard` | `dashboard` panel |
| **Currency** | `GET/POST/PATCH/DELETE /currencies`, `POST /currencies/:code/actions` | `currencies` |
| **Exchange rates** | `GET/POST/PATCH /exchange-rates`, workflow actions, `bulk-approve` | `exchange_rates` |
| **Raw materials** | `POST /raw-materials/classify-suggested`; RM master via master-data hub | `raw_materials`, `metal_classification` |
| **RM prices** | `GET/POST /raw-material-prices`, `bulk-approve`, `/:id/actions`, `workbook-candidates` | `raw_material_prices` |
| **BOM / scrap** | `GET/PUT /bom-scrap`, import preview/commit, template | `bom` + `BomScrapPanel` |
| **Scrap rules** | `GET/POST/PATCH /scrap-rules`, validate/submit/approve/activate | `scrap_rules` |
| **Metal cost components** | `GET/POST/PATCH /metal-cost-components`, audit, actions | `metal_cost_components` |
| **Bulk import** | `GET /bulk-import/template/:kind`, `POST preview/commit` | `bulk_import` |
| **Validation / readiness** | `GET /readiness`, `POST /validate`, `POST /preview` | `validation` |
| **Audit** | `GET /audit`, `GET /approval-queue` | `audit` |
| **Calculator** | `POST /calculator/preview` | `costing-calculator` route |

**Shell routes:** `/internal/costing`, `/internal/costing-calculator` → permission `costingPricing` (`shellRoutes.ts`).

**Inquiry integration:** `InquiryHeaderForm.tsx` → `commercialMetadata` copper/aluminium rates; `buildCostingRequestFromPreviewPayload` → orchestrator.

---

## 6. Database Baseline (Read-Only Counts)

**Captured:** `scripts/inspectCostingReadinessState.ts` — 29 Aug 2026

| Entity | Count | Notes |
|--------|------:|-------|
| Cable Master | 435 | Workbook Cable List: 432 (+3 platform) |
| Cable BOM (`CableBomLine`) | 4,842 | Workbook Cable Materials: 4,986 |
| Governed BOM (`GovernedBomLine`) | 35 | Sparse vs source; 10009487/88 have 8 lines each |
| Raw Material | 136 | Includes CR01, AR01 classifications |
| Raw Material Prices | 191 | **10** APPROVED+current; **8** excl. `I*` test heuristic |
| Currency | 7 | LE base; USD/EUR/GBP/EGP/SAR active; MCCZZ inactive test |
| Exchange Rates (current) | 4 | USD→LE, EUR→LE, GBP→LE, USD→SAR |
| Scrap Rules (current) | 23 | SC26-00021 CU L.V **1.5%** ACTIVE; CU/AL M.V UNDER_CREATION |
| Metal Cost Components | 3 | Cu PREMIUM/SHIPPING/CLEARANCE — all **DRAFT** |
| Commercial Inquiries | 14 | — |

**Platform readiness** (`costingReadinessSummary.ts`): ready **2**, data issue **73**, under review **354**, not ready **6**; Gate 1 **427**, Gate 2 **73**, Gate 4 **433**.

---

## 7. Four-Cable Master Data Validation (10009487–10009490)

| Cable | Description | Family | Master | Engineering mapping |
|-------|-------------|--------|--------|---------------------|
| 10009487 | Cu / XLPE / LSHF 0.6/1 kV 1×16 mm² | LV | ACTIVE | APPROVED / PARTIAL |
| 10009488 | Cu / XLPE / LSHF 0.6/1 kV 1×25 mm² | LV | ACTIVE | APPROVED / PARTIAL |
| 10009489 | Cu / XLPE / LSHF 0.6/1 kV 1×35 mm² | LV | ACTIVE | APPROVED / PARTIAL |
| 10009490 | Cu / XLPE / LSHF 0.6/1 kV 1×50 mm² | LV | ACTIVE | APPROVED / PARTIAL |

| Cable | Source BOM lines | Governed BOM (APPROVED) | Conflicts |
|-------|-----------------:|------------------------:|-----------|
| 10009487 | 8 | 8 | — |
| 10009488 | 8 | 8 | — |
| 10009489 | 8 | 0 | — |
| 10009490 | 8 | 0 | — |

**10009487 consumption table (kg/km unless noted)** — matches `Energya Cable Master Data.xlsx` Cable Materials:

| RM | Consumption | UOM |
|----|------------:|-----|
| CR01 | 135.23 | kg |
| HF27 | 72.90 | kg |
| HF30 | 45.20 | kg |
| XL08 | 11.92 | kg |
| ML04 | 1.49 | kg |
| CX05 | 0.61 | kg |
| TP01 | 0.50 | kg |
| A-ECAP10 | 2 | PCS |

CR01 consumption scales by cable size on 10009488–90 (213.18 / 297.59 / 405.19 kg).

**Aluminium (AR01):** Not present on these four LV copper cables. AR01 master classification verified: `MARKET_METAL_ALUMINIUM` / `ALUMINIUM` (for MV cables e.g. 10010347 in ELAND set).

---

## 8. Classification, Price UOM & Behaviour Checks

### RM classifications (verified in DB)
| Code | pricingCategory | metalType | Costing path |
|------|-----------------|-----------|--------------|
| CR01 | MARKET_METAL_COPPER | COPPER | Inquiry header Cu USD/MT |
| AR01 | MARKET_METAL_ALUMINIUM | ALUMINIUM | Inquiry header Al USD/MT |
| HF27, HF30, XL08, … | STANDARD_RAW_MATERIAL | NONE | Approved RM price |

CR01 master list price exists as **DRAFT** (14,463.73 USD/kg) — correctly **ignored** when inquiry header supplied.

### Approved price UOM (10009487 BOM RMs)
| RM | Approved price | Currency | UOM basis | Normalized unit |
|----|---------------:|----------|-----------|-----------------|
| HF27 | 4,100 | EUR | MT | 4.10 EUR/kg |
| HF30 | 2,600 | EUR | MT | 2.60 EUR/kg |
| CX05 | 4,600 | USD | MT | 4.60 USD/kg |
| ML04 | 10,100 | USD | MT | 10.10 USD/kg |
| XL08 | 1,900 | USD | MT | 1.90 USD/kg |
| TP01 | 12,600 | LE | MT | 12.60 LE/kg |
| A-ECAP10 | 0 | USD | — | Excluded (packing) |

### Behaviour validations
| Check | Result |
|-------|--------|
| A-ECAP10 PCS excluded | **PASS** — `appliedUnitPrice: 0`, `finalLineCost: 0` in probe trace |
| Scrap 1.5% stored, not in Direct RM | **PASS** — governed lines `scrapPercentage: 0.015`; probe consumption = base; unit test `does not apply scrap to Direct RM cost` |
| Metal cost components no effect on Direct RM | **PASS** — 3 DRAFT MCC rows in DB; test `existing costing result is unchanged when Premium/Shipping/Clearance records exist` |
| Header Cu overrides master | **PASS** — `inquiryHeaderCopperOverridesMaster: true`; CR01 `pricingSource: INQUIRY_HEADER` |
| UOM inflation guard | **PASS** — materialCost **2,500.58** &lt; 50,000 at 14,600 Cu |

---

## 9. Probe & Script Results

### `scripts/probeInquiryHeaderCurrencyCosting.ts`
| Check | Result |
|-------|--------|
| Exit code | **0** |
| Header currency changes output | **true** (LE/USD/EUR/GBP produce different totals) |
| Copper 14,600 vs 16,000 changes output | **true** |
| UOM inflation guard | **true** |

### `scripts/probeElandFourCables.ts` (ELAND identities 10009487, 10009546, 10010347, 10010439)
| Check | Result |
|-------|--------|
| Exit code | **0** |
| Without inquiry header metal prices | All **NOT_READY** — leading `INQUIRY_COPPER_PRICE_REQUIRED` / `ENGINEERING_NOT_APPROVED` |
| Note | Distinct from ENERGYA four-cable set (10009487–90); ELAND cables 2–4 have engineering/BOM/price gaps |

### `npm test`
| Metric | Value |
|--------|------:|
| Tests | **516** |
| Pass | **516** |
| Fail | **0** |
| Duration | ~83 s |

**Costing-related suites (sample):** `costingEngine.test.ts`, `inquiryMetalPricing`, `costingMetalCostComponents.test.ts`, `increment10/13/14` costing, scrap, FX, workspace.

### `npx tsc --noEmit`
| Result |
|--------|
| **PASS** (exit 0) |

---

## 10. Automated Test Coverage vs Live Probes

| Assertion | Unit tests | Live probe |
|-----------|------------|------------|
| 14,600 USD/MT → 14.6 USD/kg; CR01 1,974.36 | **PASS** (`costingEngine.test.ts`) | **PASS** |
| Scrap not in Direct RM | **PASS** | **PASS** (consumption unadjusted) |
| MCC ignored (Option B) | **PASS** | **PASS** (3 MCC rows; no price change) |
| Full 10009487 total 2,500.58 | Not in unit tests | **PASS** (orchestrator live) |
| Workbook 2,571.11 match | N/A (reference only) | **GAP** −70.53 USD (expected Option B) |

---

## 11. Golden Regression — Cable 10009487

**Scenario:** USD inquiry, **1,000 m**, qty **1**, Cu **14,600** USD/MT, Al **3,300** USD/MT.

### Totals
| Cu header (USD/MT) | Direct RM (USD) | Δ vs 14,600 | Workbook ref (USD) | Δ vs workbook |
|-------------------:|----------------:|------------:|-------------------:|--------------:|
| 14,600 | **2,500.58** | — | 2,571.11 | **−70.53 (−2.74%)** |
| 16,000 | **2,689.90** | **+189.32** | 2,571.11 | +118.79 |

**Cu sensitivity:** Total delta **+189.32** = CR01 delta only (**2,163.68 − 1,974.36**). Non-metal lines unchanged. **PASS.**

### Line-by-line trace (Cu 14,600 USD/MT)
| RM | kg/km | Applied unit | Currency | Pricing source | Line cost (USD) |
|----|------:|-------------|----------|----------------|----------------:|
| CR01 | 135.23 | 14.60/kg | USD | INQUIRY_HEADER | **1,974.36** |
| HF27 | 72.90 | 4.10/kg | EUR | RAW_MATERIAL_MASTER | 348.54 |
| HF30 | 45.20 | 2.60/kg | EUR | RAW_MATERIAL_MASTER | 137.04 |
| XL08 | 11.92 | 1.90/kg | USD | RAW_MATERIAL_MASTER | 22.65 |
| ML04 | 1.49 | 10.10/kg | USD | RAW_MATERIAL_MASTER | 15.05 |
| CX05 | 0.61 | 4.60/kg | USD | RAW_MATERIAL_MASTER | 2.81 |
| TP01 | 0.50 | 12.60/kg | LE | RAW_MATERIAL_MASTER | 0.13 |
| A-ECAP10 | 2 PCS | 0 | USD | (packing excluded) | 0.00 |
| **Total** | | | | | **2,500.58** |

**CR01 arithmetic:** 135.23 × (14,600 ÷ 1,000) = 135.23 × 14.6 = **1,974.358** → **1,974.36** (rounded).

**FX notes:** HF27/HF30 EUR→USD via cross-rate ≈ 1.1661 (EUR→LE ÷ USD→LE). TP01 LE→USD rate ≈ 0.01993.

### Currency sweep (Cu 14,600, same cable)
| Inquiry currency | Result currency | Direct RM |
|------------------|-----------------|----------:|
| LE (EGP) | LE | 125,440.86 |
| USD | USD | 2,500.58 |
| EUR | EUR | 2,144.39 |
| GBP | GBP | 1,836.22 |

Header currency drives result currency. **PASS.**

---

## 12. Four-Cable Direct RM Table (ENERGYA set)

**Probe:** `ENERGYA_COSTING_PROBE_CABLES` — Cu **14,600**, Al **3,300**, **1,000 m**, **USD**, header prices supplied.

| Cable | Size | CR01 kg/km | Status | Direct RM (USD) | Workbook* Δ |
|-------|------|----------:|--------|----------------:|------------:|
| 10009487 | 1×16 mm² | 135.23 | READY | **2,500.58** | −70.53 |
| 10009488 | 1×25 mm² | 213.18 | READY | **3,737.89** | +1,166.78† |
| 10009489 | 1×35 mm² | 297.59 | READY | **5,038.50** | +2,467.39† |
| 10009490 | 1×50 mm² | 405.19 | READY | **6,708.35** | +4,137.24† |

\*Probe compares all four to **10009487 workbook USD** (2,571.11) — reference column not per-cable workbook totals.  
†Positive Δ expected: larger conductors → higher CR01 consumption; not a reconciliation failure.

**Readiness without header** (`evaluateCostingReadinessForCables`): all four report `INQUIRY_COPPER_PRICE_REQUIRED` at Gate 4 (by design for market metal).

---

## 13. Workbook Reconciliation Notes

**Reference:** `data/source/Energya Cable Master Data.xlsx` (Cable List 432, Cable Materials 4,986). Summary Direct RM values are **validation targets only** — never imported.

### 10009487 USD gap: app 2,500.58 vs workbook 2,571.11 (−2.74%)

| Factor | Classification | Estimated impact (USD) |
|--------|----------------|----------------------:|
| **Landed vs LME copper** (workbook ~15,155 vs header 14,600 USD/MT) | **Decision 5 / commercial** | ~+75 on CR01 if workbook landed |
| **XL08 list vs approved** (workbook ~1,700 vs approved 1,900 USD/MT) | **Data / governance** | ~−2.4 on XL08 |
| **A-ECAP10 packing** | **Principle locked** — excluded in app | Minor if workbook includes |
| **FX / EUR cross-rates** | Operational | Within rounding |
| **Net observed gap** | **Expected under Option B** | **−70.53** |

**ELAND Cost Sheet Required.xlsx** uses **landed metal methodology** ≠ Option B. Discrepancy is **not** a 1,000× UOM error (confirmed: CR01 at 14.6 USD/kg not 14,600 USD/kg).

**Recommendation:** Sign Decision 5 before requiring workbook parity. If Option B signed, restate workbook baseline or accept ~2.5% gap on 10009487.

---

## 14. UI UAT (Code / Route / Test Verification)

Browser click-through **not performed**. Items marked **[NEEDS VERIFICATION]** require manual UI pass.

| UI area | Route / component | Verification source | Status |
|---------|-------------------|---------------------|--------|
| Costing V3 shell | `/internal/costing` | `CostingWorkspaceV3.tsx`, `costingV3Nav.ts` | Code ✓ [NEEDS VERIFICATION] |
| Currency master | `currencies` panel | API + `CurrenciesPanel.tsx` | Code ✓ [NEEDS VERIFICATION] |
| Exchange rates | `exchange_rates` panel | API + `ExchangeRatesPanel.tsx` | Code ✓ [NEEDS VERIFICATION] |
| RM master / classification | `raw_materials`, `metal_classification` | Panels + classify-suggested API | Code ✓ [NEEDS VERIFICATION] |
| RM prices workflow | `raw_material_prices` | API approve actions; tests | Code ✓ [NEEDS VERIFICATION] |
| BOM scrap upload | `bom` + `BomScrapPanel` | `increment13.bomScrap.test.ts` | Test ✓ [NEEDS VERIFICATION] |
| Scrap rules | `scrap_rules` | API + `ScrapRulesPanel.tsx` | Code ✓ [NEEDS VERIFICATION] |
| Metal cost components | `metal_cost_components` | Panel banner "Option B"; MCC tests | Code ✓ [NEEDS VERIFICATION] |
| Bulk import | `bulk_import` | API preview/commit; tests | Test ✓ [NEEDS VERIFICATION] |
| Validation / readiness | `validation` | `GET /readiness`, workspace KPIs | Code ✓ [NEEDS VERIFICATION] |
| Inquiry header Cu/Al | Inquiry workspace | `inquiryHeaderFormService.test.ts` | Test ✓ [NEEDS VERIFICATION] |
| Inquiry Calculate | Commercial routes | `increment10.costing.test.ts` | Test ✓ [NEEDS VERIFICATION] |

---

## 15. Final Area Assessment Table

| Area | UAT | Production blockers |
|------|-----|---------------------|
| **Engine (Direct RM formula)** | **PASS** | None (frozen) |
| **Option B (LME only)** | **PASS** | Decision 5 unsigned |
| **Inquiry header metals** | **PASS** | Users must enter Cu/Al for market-metal BOMs |
| **RM classification** | **PASS** | — |
| **Price UOM / MT↔kg** | **PASS** | Some RMs lack approved prices platform-wide |
| **FX conversion** | **PASS** | Limited cross pairs (triangulate via LE) |
| **Scrap storage** | **PASS** | CU M.V / AL M.V rules UNDER_CREATION |
| **Packing exclusion** | **PASS** | — |
| **Metal cost components** | **PASS** (master only) | Not wired to engine (by design Option B) |
| **BOM / governed BOM** | **PASS** (4 cables) | 10009489/90 lack governed BOM (source fallback works) |
| **Workbook reconciliation** | **PASS WITH GAPS** | Commercial sign-off on variance |
| **Platform data readiness** | **FAIL** | 2/435 cables ready; Gate 4 widespread |
| **ELAND regression cables** | **NOT READY** | Engineering/price/BOM gaps on 3/4 |
| **Automated tests / TS** | **PASS** | — |
| **UI** | **[NEEDS VERIFICATION]** | Manual UAT recommended |

---

## 16. Production Readiness Decision

| Criterion | Status |
|-----------|--------|
| Engine implements locked spec | **Yes** |
| Golden 10009487 under Option B | **Yes** (2,500.58 / CR01 1,974.36) |
| Decision 5 signed | **No** |
| Workbook reconciliation accepted | **No** |
| Master data / gates green | **No** (2/435 ready) |
| UI UAT complete | **No** |

### **Production readiness: NOT READY**

**Conditions to reach READY WITH CONDITIONS:**
1. Sign Decision 5 (B or A) and accept 10009487 reconciliation under chosen option.
2. Approve standard RM prices for production cable portfolio (Gate 4).
3. Approve engineering mappings and resolve BOM conflicts for ELAND/MV cables.
4. Complete browser UAT on Costing V3 and Inquiry Calculate.
5. Populate governed BOM for 10009489/10009490 if governed-only policy required.

**If Decision 5 remains open:** remain **NOT READY** per `COSTING_V2_BUSINESS_SPECIFICATION.md` regardless of engine test pass rate.

---

## 17. Gaps, Risks & Recommendations

| # | Layer | Finding | Root cause | Recommendation |
|---|-------|---------|------------|----------------|
| 1 | Commercial | Workbook −70.53 USD vs app | Landed metal + RM list/landed mix | Sign Decision 5; document accepted variance |
| 2 | Governance | 433 Gate 4 failures | Draft/unapproved RM prices | Costing team approve prices per cable portfolio |
| 3 | Governance | CR01 Gate 4 without header | Readiness gate treats missing header as block | Expected; ensure inquiry UX captures Cu/Al before Calculate |
| 4 | Data | 10009489/90 no governed BOM | Only source BOM imported | Import/approve governed BOM if policy requires |
| 5 | ELAND set | 3/4 cables NOT_READY | Engineering DRAFT, conflicts, missing prices | Separate ELAND cutover plan |
| 6 | FX | EUR/GBP→USD via LE | Triangulation design | Document for users; [NEEDS VERIFICATION] alternate pairs |
| 7 | Scrap | CU M.V / AL M.V null rate | UNDER_CREATION | Complete when MV portfolio goes live |
| 8 | UI | No browser UAT | Validation mode read-only | Schedule Costing V3 + Inquiry manual pass |
| 9 | MCC | 3 DRAFT components exist | Future Option A prep | No action under Option B |

**No silent engine fixes recommended.** All gaps are commercial, data, or sign-off — not calculation defects.

---

## 18. Sign-Off Checklist & Appendix

### Sign-off checklist
- [ ] Decision 5 (LME vs Landed) signed by commercial owner
- [ ] 10009487 line-level reconciliation accepted (2,500.58 vs 2,571.11 documented)
- [ ] Costing V2 Direct RM scope frozen (no scrap/packing/MCC in Direct RM)
- [ ] Production RM price approval for target cable families
- [ ] Engineering mappings APPROVED for production cables
- [ ] Browser UAT Costing V3 complete
- [ ] Browser UAT Inquiry Calculate with header metals complete
- [ ] ELAND workbook regression scope agreed (separate from ENERGYA four-cable set)

### Appendix A — Commands run
```text
npx tsx scripts/inspectCostingReadinessState.ts
npx tsx scripts/probeInquiryHeaderCurrencyCosting.ts
npx tsx scripts/probeElandFourCables.ts
npx tsx scripts/costingReadinessSummary.ts
npm test
npx tsc --noEmit
```

### Appendix B — Key files inspected
`docs/COSTING_V2_BUSINESS_SPECIFICATION.md`, `docs/COSTING_EXCEL_DATA_OWNERSHIP.md`, `src/domain/costingEngine.ts`, `src/domain/inquiryMetalPricing.ts`, `src/domain/priceUom.ts`, `src/domain/rawMaterialClassification.ts`, `src/domain/currencyConversion.ts`, `src/server/costingOrchestrationService.ts`, `src/server/costingWorkspaceService.ts`, `src/server/costingAdminRoutes.ts`

### Appendix C — Test inventory
| Suite | Pass | Fail |
|-------|-----:|-----:|
| Full `npm test` | 516 | 0 |
| TypeScript | — | 0 errors |

---

**Report path:** `docs/COSTING_V2_FINAL_UAT_REPORT.md`  
**Prepared by:** Automated read-only UAT (29 Aug 2026)
