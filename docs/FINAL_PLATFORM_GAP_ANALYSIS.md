# Final Platform Gap Analysis

**Date:** 2026-08-22  
**Scope:** Increment 1–13 consolidation against Phase 1 business specification (Parts A & B)  
**Method:** Full codebase inspection — Prisma, APIs, UI, tests, documentation

**Classification legend:** `IMPLEMENTED` | `PARTIAL` | `MISSING` | `CONFLICTING` | `LEGACY` | `REQUIRES BUSINESS DECISION`

---

## Executive summary

Energya Connect has a **mature core** (PostgreSQL, RBAC, inquiry/quotation, BOM governance, RM price governance, Increment 13 costing orchestrator). Gaps cluster in **low-code configuration surfaces** (field grid, reports, dashboards, notifications), **costing extension layers** (metal rates, incoterm/destination, drum/packing — structure exists or is planned; amounts not supplied), and **test fixture dependency** (Inc 4/5/8 require official master import).

**Single costing engine:** ✅ Achieved — `executeCostingForInquiryLine` is authoritative; `executeCostingRun` is adapter only; `CostingHub` replaced mock `CostingPricing`.

---

## PART A — Customer Portal

| Req | Description | Status | Evidence / Gap |
|-----|-------------|--------|----------------|
| C1 | Secure login, password reset, session | **IMPLEMENTED** | `identityService.ts`, JWT, refresh, lockout, `increment12b1` tests |
| C1 | Profile | **PARTIAL** | Auth profile exists; dedicated profile page limited |
| C2 | Dashboard | **PARTIAL** | `CustomerDashboard.tsx` — mix of API + mock KPIs |
| C2 | Inquiry list, search, filters | **IMPLEMENTED** | `CommercialInquiryList` + `/api/inquiries` with customer scope |
| C3 | Versions, history, comparison | **IMPLEMENTED** | `new-version`, `versions` API, History tab with A/B compare |
| C3 | Immutable previous versions | **IMPLEMENTED** | `isCurrent`, `supersedesInquiryId`, post-submit lock |
| C4 | Currency, metal rates, incoterm, destination | **PARTIAL** | Header fields + `commercialMetadata`; rates stored, **not applied in engine** |
| C4 | Cable selection | **IMPLEMENTED** | Cable picker, configurator integration |
| C5 | Cutting length | **IMPLEMENTED** | Line `cuttingLengthMeters` |
| C5 | Manual drum | **PARTIAL** | Line `drumType` field; no governed drum cost in engine |
| C5 | Automatic drum plan | **PARTIAL** | `drumSelectionService.ts`, `DrumOptimizer`; not wired to costing snapshot |
| C5 | Cable preview | **IMPLEMENTED** | Configurator V2 result panels |
| C6 | Price calculation (server) | **IMPLEMENTED** | `POST .../calculate-cost` → orchestrator; **customers blocked** from calculate |
| C6 | Cost breakdown | **PARTIAL** | Internal users see breakdown; customers see redacted projection |
| C6 | Stored calculation | **IMPLEMENTED** | `CostingCalculation` + line `costingCalculationId` |
| C7 | Submit, calculation required, lock | **IMPLEMENTED** | `CALCULATION_REQUIRED` gate, `COSTING_LOCKED` |
| C8 | Notifications | **PARTIAL** | In-memory toasts; no persisted notification config |
| C8 | Help | **IMPLEMENTED** | `SupportCenter.tsx` |

---

## PART B — Admin / Internal Portal

| Req | Description | Status | Evidence / Gap |
|-----|-------------|--------|----------------|
| A1 | Team access and roles | **IMPLEMENTED** | Administration → Users, Roles; RBAC permission codes |
| A2 | Review submitted inquiries | **IMPLEMENTED** | `CommercialInquiryDetail`, status workflow |
| A3 | Cable records | **IMPLEMENTED** | Master Data, Cable Master import |
| A4 | Drum records | **IMPLEMENTED** | `DrumMaster`, import from `Drum List.xlsx` |
| A5 | Materials, prices, metal rates | **PARTIAL** | RM + `RawMaterialPrice` governed; **no MetalRate master table** (metadata only) |
| A6 | Delivery terms and destinations | **PARTIAL** | String fields + enum options; **no charge rule master** |
| A7 | Bulk spreadsheet import/export | **PARTIAL** | Import pipeline for RM/cables/BOM/drums; export templates incomplete |
| A8 | Calculation rules | **IMPLEMENTED** | Administration → Costing (methods, variables, formulas, scrap) |
| A9 | Notifications | **MISSING** | No `NotificationRule` persistence |
| A10 | Activity log | **IMPLEMENTED** | `AuditEvent`, inquiry Activity tab |

---

## Costing engine consolidation

| Item | Status | Detail |
|------|--------|--------|
| Single orchestrator | **IMPLEMENTED** | `costingOrchestrationService.ts` |
| Legacy `CostingPricing` mock | **LEGACY** | Re-export of `CostingHub`; not in production path |
| `executeCostingRun` | **LEGACY** | Adapter delegating to Inc 13 |
| `POST /api/costing/calculate` | **PARTIAL** | Compatibility endpoint; uses orchestrator |
| BOM-driven material cost | **IMPLEMENTED** | Governed BOM + RM price + scrap |
| Formula engine | **IMPLEMENTED** | Safe tokenizer/AST/evaluator |
| Scrap rules | **IMPLEMENTED** | `CostingScrapRule` + BOM line overrides |
| FX / exchange rates | **IMPLEMENTED** | `CostingExchangeRate` |
| Metal rate layer | **MISSING** | Customer rates in metadata; no governed `CostingMetalRate` applied |
| LME + additive build-up | **REQUIRES BUSINESS DECISION** | Extension point documented; no ELAND constants |
| Drum / packing cost | **MISSING** | `DRUM` component kind exists; engine returns NOT_CONFIGURED |
| Incoterm / destination cost | **MISSING** | `incotermChargeStatus: NOT_CONFIGURED` in metadata |
| Manufacturing / labour / overhead | **PARTIAL** | Formula layers support; requires configured formulas |
| Cost ≠ selling price | **IMPLEMENTED** | `commercialPricingEngine` separate |
| Calculation snapshot | **IMPLEMENTED** | `CostingCalculation` + snapshots |
| Quotation snapshot | **IMPLEMENTED** | `CommercialQuotationLine.costingCalculationId` |

---

## Inquiry & quotation

| Item | Status | Detail |
|------|--------|--------|
| PostgreSQL persistence | **IMPLEMENTED** | Full inquiry/line/version in DB |
| New inquiry UI design | **PARTIAL** | `CommercialInquiryDetail` modern layout; tabs not fully aligned to spec (missing Overview, Drum Plan, Commercial Terms tab) |
| Inquiry header retained | **IMPLEMENTED** | `InquirySummaryBar` + `InquiryHeaderForm` |
| Field manifest | **PARTIAL** | `inquiryFieldManifest.ts` — static TS; localStorage prefs only |
| Admin field configuration | **MISSING** | No `PlatformFieldDefinition` in DB |
| Grid column configuration | **PARTIAL** | User prefs in localStorage; no admin grid schema |
| Customer isolation | **IMPLEMENTED** | `customerScope.ts`, projection, RBAC tests |
| Versioning | **IMPLEMENTED** | `new-version`, history |
| Submit lock | **IMPLEMENTED** | Post-submit costing lock |

---

## Low-code platform

| Capability | Status | Detail |
|------------|--------|--------|
| Costing methods/variables/formulas | **IMPLEMENTED** | Admin costing panel + APIs |
| Scrap configuration | **IMPLEMENTED** | Scrap rules + BOM costing tab |
| Metal rates admin | **MISSING** | Needs governed model (no invented rates) |
| Incoterm/destination rules | **MISSING** | Needs governed model |
| Drum/packing rules | **MISSING** | Drum master exists; packing cost rules not modeled |
| Field definitions (all entities) | **MISSING** | Inquiry manifest only |
| Report builder | **MISSING** | `ReportsAnalytics.tsx` is placeholder |
| Dashboard builder | **MISSING** | `InternalDashboard.tsx` uses mock data |
| Notification configuration | **MISSING** | In-memory only |
| Import/export governance | **PARTIAL** | Import validate/preview; export incomplete |

---

## Security & audit

| Item | Status |
|------|--------|
| RBAC permission codes | **IMPLEMENTED** |
| Customer isolation | **IMPLEMENTED** |
| Field-level redaction (costing) | **IMPLEMENTED** |
| Audit immutability | **IMPLEMENTED** |
| Formula injection prevention | **IMPLEMENTED** |
| Report SQL injection prevention | **N/A** — no report builder yet |

---

## Test & fixture status

| Suite | Status | Issue |
|-------|--------|-------|
| Increment 13 (81 tests) | **IMPLEMENTED** | All pass |
| Increment 10, 11, 12, 12B | **IMPLEMENTED** | Pass |
| Increment 4 readiness | **FAILING** | Requires official import: 432 cables, 81 BOM conflicts |
| Increment 5 governance | **FAILING** | Depends on BOM conflict fixtures |
| Increment 8 BOM | **FAILING** | `BOM-CONF-001` not in DB without import |

**Root cause:** `scripts/importAllMasters.ts` not run on this database. **Not a code regression** — fixture gap.

---

## Legacy / retire list

| Asset | Action |
|-------|--------|
| `CostingPricing.tsx` | **LEGACY** — deprecated re-export; safe to remove after import audit |
| `InquiryQuotationHome.tsx` mock grid | **LEGACY** — not authoritative; workspace uses API |
| `ErpCustomerRequestView.tsx` | **LEGACY** — not routed |
| Mock LME in `mockData.ts` | **LEGACY** — not production costing path |
| `executeCostingRun` Inc 10 logic | **RETIRED** — adapter only |

---

## Conflicting / ambiguous items

| Item | Classification | Resolution |
|------|----------------|------------|
| Customer metal rates vs governed RM price | **REQUIRES BUSINESS DECISION** | Explicit `rateSource` on metal rate config |
| "Ex-Work 6%" | **REQUIRES BUSINESS DECISION** | Classify as commercial pricing, not costing (`COMMERCIAL_COSTING_BOUNDARY.md`) |
| ELAND additive constants | **REQUIRES BUSINESS DECISION** | Formula structure only until approved |
| Dynamic MV scrap RULE-S002 | **REQUIRES BUSINESS DECISION** | Extension point in scrap engine |

---

## Implementation priority (this consolidation)

| Phase | Focus | Status |
|-------|-------|--------|
| 0 | Gap analysis (this document) | ✅ |
| 1 | Architecture docs | In progress |
| 2 | Costing consolidation verify | ✅ Done (Inc 13) |
| 3 | Low-code costing extensions (metal, logistics, packing **models**) | Planned |
| 4 | Orchestrator extension layers (NOT_CONFIGURED when unconfigured) | Planned |
| 5 | Inquiry UI tab alignment | Planned |
| 6 | Platform field definition model | Planned |
| 7 | Real dashboard KPIs | Planned |
| 8 | Master data import script + docs | Planned |
| 9 | Notification/report metadata models | Planned |
| 10 | Browser acceptance | Manual |

---

## Acceptance criteria scorecard (§46)

| Criterion | Status |
|-----------|--------|
| A. One costing engine | ✅ |
| B. No legacy costing UI active | ✅ |
| C. Metadata/formula driven | ✅ (core); extension layers partial |
| D. BOM drives costing | ✅ |
| E. RawMaterialPrice drives cost | ✅ |
| F. Scrap configurable | ✅ |
| G. Metal rates configurable | ❌ Structure needed |
| H. Incoterm/destination configurable | ❌ Structure needed |
| I. Drum planning uses governed data | ⚠️ Selection yes; costing no |
| J. New inquiry design | ⚠️ Partial |
| K. Inquiry header remains | ✅ |
| L. Field/grid configurable | ❌ Admin model needed |
| M–N. Customer isolation | ✅ |
| O. Persistence after refresh | ✅ |
| P–Q. Versioning / lock | ✅ |
| R. Quotation snapshot | ✅ |
| S. Admin costing without code | ✅ (core layers) |
| T–U. Reports/dashboards real data | ❌ |
| V. Import validate | ✅ |
| W. Notifications configurable | ❌ |
| X–Y. Audit / RBAC | ✅ |
| Z. No arbitrary SQL/JS | ✅ |
| AA. No fake data in production paths | ⚠️ Dashboards still mock |
| AB. Inc 1–13 intact | ✅ (fixture tests need import) |

---

*Next: `FINAL_PLATFORM_ARCHITECTURE.md`, implementation of configuration models and orchestrator extension points without invented business values.*
