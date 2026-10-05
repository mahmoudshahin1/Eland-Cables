# Phase 1 Module Gap Report

> Date: 2026-08-22  
> Baseline: fee391fc + gap-fill pass  
> Scope: Part A (C1–C8) customer portal + Part B (A1–A10) internal

---

## Summary

| Area | DONE | PARTIAL | MISSING |
|------|------|---------|---------|
| Part A — Customer Portal | 5 | 3 | 0 |
| Part B — Internal | 6 | 3 | 1 |

---

## Part A — Customer Portal

| ID | Requirement | Status | Notes |
|----|-------------|--------|-------|
| **C1** | Sign-in, password reset, customer isolation, session timeout, profile | **PARTIAL** | JWT auth + forgot/reset + customer scoping via `resolveCustomerScope`. **Added:** 30-min idle session timeout in `AuthContext`. Profile edit UI not built (view-only from `/api/auth/me`). |
| **C2** | Dashboard KPIs, inquiry list columns, search/filter, open/history | **DONE** | `CustomerDashboard` KPIs (draft/calculated/partial/submitted/review), full columns (no, version, date, cable, length, drum, currency, value, status), search + status + date filter, click-through to inquiry workspace. `CommercialInquiryList` has date filters for internal. |
| **C3** | Auto ref, draft save, versions, side-by-side compare | **PARTIAL** | Auto inquiry number + draft persistence + new version exist. **Added:** History tab version compare with price diff. Line-level side-by-side field diff deferred. |
| **C4** | Currency, metal rates, incoterm+destination, cable catalogue | **PARTIAL** | Header fields for currency, Cu/Al rates, incoterm, `deliveryDestination` in metadata. **Added:** `incotermChargeStatus: NOT_CONFIGURED` — no fabricated shipping charges. Cable search modal + approved cables from master. |
| **C5** | Cutting length, drum from approved list, auto drum plan, construction preview | **PARTIAL** | **Added:** cutting length validation, approved drum dropdown, `suggestDrumPlan` in line editor. Standalone `DrumOptimizer` page remains separate. Cable construction preview in inquiry flow not wired (configurator is separate tab). |
| **C6** | Calculate, itemised breakdown, metal rates, recalc/compare, server-side stored | **PARTIAL** | Calculate + persist via orchestrator. **Added:** layer totals, scrap status, layer detail in costing tab. Commercial margin only when `commercialPricingEngine` invoked (not shown). Full customer breakdown RBAC still limits detail for customers without `costingPricing`. |
| **C7** | Submit summary, calculation required, confirmation, lock | **DONE** | **Added:** `CALCULATION_REQUIRED` server gate for mapped lines; submit summary modal with line costs and confirm. Post-submit lock unchanged. |
| **C8** | In-app notifications, email on submit, help | **PARTIAL** | **Added:** in-app notification on submit via navbar badge. Email via `notificationService` (SMTP env). `SupportCenter` provides help/guidance UI (static content). No persisted notification inbox. |

---

## Part B — Internal

| ID | Requirement | Status | Notes |
|----|-------------|--------|-------|
| **A1** | Six roles RBAC | **DONE** | `permissionCatalog.ts` defines 6+ roles with permission filters. Customer role scoped to own inquiries. |
| **A2** | Submitted inquiry list, filters, breakdown, workflow, history | **PARTIAL** | `CommercialInquiryList` + detail tabs (costing, history, activity). **Added:** date range filters. Internal workflow stages beyond submit/quote not fully modeled. |
| **A3–A4** | Cable/drum records | **DONE** | Cable master + drum catalog exist (`DrumOptimizer`, master data hub). |
| **A5** | RM prices date-effective | **DONE** | Governed `RawMaterialPrice` with effective dates + tests in increment9/10. |
| **A6** | Delivery terms + destinations master + combination values | **MISSING** | `deliveryDestination` free-text in inquiry metadata only. **Deferred:** `Destination` + `DeliveryTermCharge` Prisma models — requires business sign-off on charge matrix. UI shows NOT_CONFIGURED. |
| **A7** | Spreadsheet import preview | **DONE** | Technical Office Excel pre-import + master data import paths exist. |
| **A8** | Calculation rules — Administration Costing panel | **DONE** | `AdministrationCostingPanel` for formulas, scrap rules, config versions. |
| **A9** | Team email on submit | **DONE** | `notifyInquirySubmitted` → `NOTIFY_SALES_EMAIL` / SMTP. |
| **A10** | Activity log — AuditEvent UI | **PARTIAL** | Inquiry Activity tab + costing admin audit. No global cross-module activity dashboard. |

---

## Files changed (this pass)

| File | Change |
|------|--------|
| `src/components/customer/CustomerDashboard.tsx` | KPIs, columns, search/filter, inquiry navigation |
| `src/components/inquiry-quotation/CommercialInquiryDetail.tsx` | Submit modal, version compare, drum plan, expanded costing |
| `src/components/inquiry-quotation/CommercialInquiryList.tsx` | Date range filters |
| `src/components/inquiry-quotation/InquiryQuotationWorkspace.tsx` | Deep-link to inquiry |
| `src/components/inquiry-quotation/InquiryHeaderForm.tsx` | Incoterm charge NOT_CONFIGURED notice |
| `src/components/customer/PriceEstimation.tsx` | Initial inquiry id prop |
| `src/context/AuthContext.tsx` | 30-min idle session timeout |
| `src/App.tsx` | Inquiry deep-link state, empty notifications default |
| `src/domain/drumPlanService.ts` | Drum suggest + cutting validation |
| `src/domain/drumPlanService.test.ts` | Unit tests |
| `src/server/commercialRepository.ts` | Submit calc gate, list date filters |
| `src/server/commercialRoutes.ts` | Date query params, 422 CALCULATION_REQUIRED |
| `src/services/commercialInquiryApiService.ts` | List date params, dashboard helpers |
| `src/services/inquiryHeaderFormService.ts` | Incoterm charge metadata |
| `src/server/increment13.phaseE.test.ts` | CALCULATION_REQUIRED test |

---

## Honest remaining gaps (Energya sign-off)

1. **LME metal build-up into RM prices** — snapshot only; BR-E03/E04 pending.
2. **Destination + delivery charge master (A6)** — structured destination field only; no governed charge matrix.
3. **Commercial margin in customer breakdown** — requires `commercialPricingEngine` invocation + RBAC.
4. **Cable construction preview in inquiry line flow (C5)** — configurator is separate; not embedded in line editor.
5. **Customer profile management UI (C1)** — auth works; no self-service profile edit screen.
6. **Persisted notification inbox (C8)** — session-scoped navbar notifications only.
7. **GCP deploy / production SMTP** — env-configured; nodemailer optional dependency.
8. **Browser E2E** — not run; manual verification recommended.

---

## Test commands

```bash
npm run build
npm test -- src/domain/drumPlanService.test.ts
npm test -- src/server/increment13.phaseE.test.ts
npm test -- src/server/increment12.inquiryUi.test.ts
```
