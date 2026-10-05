# Final Inquiry Architecture

**Date:** 2026-08-25  
**Authoritative UI:** `InquiryQuotationWorkspace` → `CommercialInquiryList` + `CommercialInquiryDetail`.  
**Wrappers:** customer `PriceEstimation.tsx`; internal `SalesQuotations.tsx`.  
**Not authoritative:** `InquiryQuotationHome.tsx` (not mounted by workspace).

---

## Header

PostgreSQL `CommercialInquiry` plus `commercialMetadata` JSON.

Form: `InquiryHeaderForm.tsx` + `inquiryHeaderFormService.ts`.  
Fields catalog: `inquiryFieldManifest.ts` (`INQUIRY_HEADER_FIELDS`) — static TypeScript, not `PlatformFieldDefinition`.

Includes: customer, project, currency, inquiry/raw-material FX, copper/aluminium **rate fields** (stored; not applied as RM prices), incoterms, destination, payment terms, dates, version, status.

Save: commercial inquiry PATCH APIs (`commercialInquiryApiService.ts`). Draft/under review editable; post-submit lock (`COSTING_LOCKED` on recalculate unless new version).

Summary: `InquirySummaryBar.tsx`.

---

## Lines

`CommercialInquiryLine`: material number, description attributes, `requestedQuantity`, `requestedLengthMeters`, UOM, `drumType`, costing FKs/status, value.

Line grid uses `INQUIRY_LINE_COLUMNS`. Cable picker / configurator can set material number. Cutting length is a first-class field.

Calculate is **per line or all lines**, always server-side.

---

## Drums

- Line `drumType` + `DrumMasterSelect` / `useDrumMasterList` in detail.
- Tab `drum_plan` exists in `TAB_LABELS` (`CommercialInquiryDetail.tsx`).
- `drumPlanService.ts` / customer `DrumOptimizer` exist.
- **Costing:** packing/drum extension layer is `NOT_CONFIGURED` until `CostingPackingRule` has an amount. Optimizer is **not** wired to `CostingCalculation`.

---

## Calculate

UI (`CommercialInquiryDetail.tsx`): `calculateInquiryCost` / `calculateInquiryLineCost` in `commercialInquiryApiService.ts` →

`POST /api/inquiries/:id/calculate-cost`  
`POST /api/inquiries/:id/lines/:lineId/calculate-cost`

Server (`commercialRoutes.ts` → `commercialRepository.ts`):

1. Ownership + status checks (`COSTING_LOCKED` if submitted, unless `allowSubmitted`).
2. `buildCostingRequestFromInquiryLine` (header currency/date/incoterms/metadata).
3. `executeCostingForInquiryLine(..., { persist: true, inquiryId, inquiryLineId })`.
4. READY → persist snapshot, set `costingCalculationId`.
5. NOT_READY → `costingReadinessStatus = NOT_READY`, HTTP error with `blockingReasons` / `errorCode` (no invented total).

Customers are not the costing-calc role; internal costing/sales execute calculate. Projection still redacts internals for customer GET.

---

## Persist / reopen

`GET /api/inquiries/:id` returns lines with `costingCalculationId`, material cost (internal), readiness. Refresh must hit PostgreSQL, not React cache as SoT.

`CostingCalculation` + `CostingCalculationSnapshot` hold breakdown. Companion `CostingRun` may also be written by the orchestrator persist block (Inc 10 compatibility); **reopen SoT for inquiry is the line FK**.

---

## Quotation snapshot

`createQuotationFromInquiry` / `createQuotationRevision` copy `costingCalculationId` onto `CommercialQuotationLine`. Historical quotation does not re-run live prices. Tests: Increment 13 Phase E.

Commercial selling price uses `commercialPricingEngine` + `/api/quotations` pricing attach (`attachQuotationPricingRoutes`) — **after** cost, separate rules.

---

## commercialProjection

`src/server/commercialProjection.ts`:

- Customers: strip line `costingRunId`, `costingReadinessStatus`, `costingCalculationId`, `materialCost`, `materialCostCurrency`.
- Metadata: only a visible key set (incoterms, destination, copper/aluminium rates, FX fields, etc.).
- `projectLineCostingForActor`: drop `materialBreakdown`, `layers`, `formulaTrace`, layer totals unless actor may view costs.
- `canViewInternalInquiryCosts`: internal true; customer false.

List projection: `projectInquiryListForActor`.

---

## Versioning and submit

New version APIs keep previous `isCurrent` false. Submit requires calculation where gates demand it (`CALCULATION_REQUIRED` in commercial repository). Activity tab uses server audit, not Navbar toast state.

---

## Gaps (inquiry UX vs spec)

- Field admin DB not driving the form.
- Drum plan tab vs engine disconnect.
- Construction/documents tabs may be thin vs ERP originals.
- `InquiryQuotationHome` leftover grid prefs in localStorage (`VIEWS_KEY`).
