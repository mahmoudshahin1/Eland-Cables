# Increment 14 Finalization Plan

**Date:** 2026-08-24  
**Workspace:** Energya Connect  
**Rule:** Do not start another large UI redesign. Do not rebuild the costing engine. Do not invent prices, scrap, formulas, LME additives, freight, or drum cost.

This document is the inspection outcome **before** remaining finalization work. Items already shipped in Increment 13/14 are verified and reused, not reimplemented.

---

## 1. Inspection summary (Increments 10–14)

| Increment | What exists | Reuse? |
|-----------|-------------|--------|
| 10 | `CostingRun` API `/api/costing/*`, `costingRepository.executeCostingRun` | Yes — already delegates to Increment 13 orchestrator |
| 11–12 | Inquiry/quotation commercial model, projections, master import | Yes |
| 13 | Orchestrator, formula engine (`+ - * / ( )` only), scrap precedence, extension layers, inquiry persist, configuration workflow | Yes — production engine |
| 14 | Formula assignment columns (`GLOBAL` / `FAMILY` / `CABLE`), Costing Team workspace APIs, live KPIs, readiness matrix for four ELAND identities | Yes |

**Production calculate path (already correct):**

```
Inquiry Calculate
  → POST /api/inquiries/:id/lines/:lineId/calculate-cost
     (or POST /api/inquiries/:id/calculate-cost for all lines)
  → calculateInquiryLineCost
  → executeCostingForInquiryLine(..., { persist: true })
  → CostingCalculation + CommercialInquiryLine.costingCalculationId
```

Admin Preview already calls the same function with `persist: false`.

`POST /api/costing/calculate` already adapters to `executeCostingRun` → `executeCostingForInquiryLine`.

`CostingPricing.tsx` already re-exports `CostingHub`. `CostingHub` already renders `CostingConfigurationDashboard`.

---

## 2. Database / schema

- Additive migration `prisma/migrations/20260823120000_increment14_formula_assignment/migration.sql` exists.
- `CostingFormula.assignmentScope` / `assignmentValue` / `assignmentPriority` are in `prisma/schema.prisma`.
- **Action:** `npx prisma migrate status` then `migrate deploy` only if pending. `prisma generate` + `prisma validate`.
- **Forbidden:** migrate reset, historical migration edits, data delete, importing ELAND workbook as master prices.

---

## 3. Costing Team workspace (screens)

Existing tabs on `CostingConfigurationDashboard` (do **not** redesign):

1. Overview — live Cable Master KPIs + governance strip (not mock 256/212)
2. Raw Material Prices — wrap `/api/admin/costing/raw-material-prices*`; I4-RM-* hidden; Bearer template download
3. Scrap Rules — BOM scrap panel + `CostingScrapRule`; overlap = `BUSINESS_RULE_REQUIRED`
4. Variables — metadata CRUD via existing APIs
5. Formulas — builder operators only `+ - * / ( )`; SUM/IF/etc disabled
6. Cable Assignment — GLOBAL / FAMILY / CABLE
7. Other Costs — metal / logistics / packing / FX (amounts `NOT_CONFIGURED` until entered)
8. Preview — `executeCostingForInquiryLine` persist false
9. Versions / Approval / Audit

**Gap to close in finalization:** add a **BOM Costing** tab if missing. Show governed BOM + engine price status. Not a second calculator. Reuse `GET /api/admin/costing/bom-scrap` and preview/validate material breakdown.

Technical Office does **not** approve costing (`denyIfNotCostingTeam` in `rbac.ts`).

---

## 4. Inquiry / quotation / customer

| Requirement | Status after inspection |
|-------------|-------------------------|
| Calculate must not run in React | UI calls `commercialInquiryApiService.calculateInquiryLineCost` → server orchestrator |
| Persist `CostingCalculation` on inquiry line | `commercialRepository.calculateInquiryLineCost` + orchestrator persist |
| Refresh/reopen shows DB result | GET inquiry returns `costingCalculationId` / material cost for internals |
| Quotation keeps `costingCalculationId` snapshot | `createQuotationFromInquiry` copies line snapshot; covered by Increment 13 Phase E tests |
| Customer projection hides internals | `commercialProjection.ts` strips costing ids, material cost, breakdown |

No second customer Calculate button. No invented totals.

---

## 5. Four ELAND regression cables

Identities only (from workbook / docs, **not** imported as prices):

`10009487`, `10009546`, `10010347`, `10010439`

For each: verify master / mapping / BOM / prices / scrap / formula / readiness / calculate / save / reopen.

Official Raw Material List prices are blank → expect `PRICE_NOT_CONFIGURED` until Finance/costing approves real amounts.

**Do not** paste ELAND workbook numbers into master data.

Deliverable: `docs/INCREMENT_14_FOUR_CABLE_ACCEPTANCE_TEST.md` with honest per-cable results.

---

## 6. Low-code vs domain / security

- Formula language is the costing low-code surface; domain rules stay in `costingEngine.ts` / orchestrator (BOM × approved price × scrap precedence).
- RBAC: `COSTING:*` / `PRICE:*` / scrap permissions; customers 403 on `/api/admin/costing/*`.
- Audit: append-only `AuditEvent`; assignment updates already write `COSTING_FORMULA_ASSIGNMENT_UPDATED`.

---

## 7. Tests and verification

1. `npx prisma migrate deploy` + generate + validate  
2. `npx tsc --noEmit`  
3. `npm test -- --test-concurrency=1`  
4. Do not weaken tests. If increment 4/5/8 fail for missing masters, `npm run import:masters` — do not invent prices.  
5. Browser (if MCP): costing workspace + inquiry calculate on a workbook cable + refresh persistence + customer hide internals. If login blocked, API with test tokens.

---

## 8. Finalization work remaining (this pass)

1. Write this plan (done).  
2. Prisma deploy/generate/validate only.  
3. Add BOM Costing tab (small, reusing existing APIs/panels).  
4. Four-cable DB/API acceptance + docs.  
5. Full test run.  
6. Browser or API substitute.  
7. `docs/INCREMENT_14_FINAL_ACCEPTANCE_REPORT.md` distinguishing **SYSTEM READY** vs **BUSINESS CONFIGURED**.

---

## 9. Out of scope

- New engine / formula parser / price table  
- ELAND golden numeric match until approved official prices exist  
- Technical Office costing approval  
- Database reset or fixture invention  
