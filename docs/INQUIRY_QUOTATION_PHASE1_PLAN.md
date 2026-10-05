# Inquiry / Quotation Phase 1 — mapping (Increment 1 = Home only)

## 1. Reuse
- `ErpRequestHeader` / `INITIAL_ERP_REQUESTS` commercial domain (one transaction list).
- `ErpCustomerRequestView` **detail** (header, lines, drums, configurator, search) — not replaced.
- `CableSearchSelectModal`, `CableConfiguratorModal`, drum modals, constraint/selection engines.
- `AuthContext` / `ModulePermissions.salesQuotations` for toolbar visibility.
- Customer vs internal filtering already in `ErpCustomerRequestView`.

## 2. Refactor (minimal)
- `PriceEstimation` / `SalesQuotations` host a **workspace**: Home grid first; open row uses existing detail.
- Detail “Register Table” toggle returns to Home instead of a second list implementation.

## 3. Missing (later increments)
Non-destructive versioning, workflow state machine, calculation snapshot API, formula engine, technical-offer merge, costing Excel, dedicated `/api/inquiries` persistence (today: React state + mocks).

## 4. Database
None this increment (no Prisma). Home reads in-memory mock `INITIAL_ERP_REQUESTS`.

## 5. API
None this increment. Do not add unused REST surface.

## 6. UI (this increment)
Configurable enterprise home grid: SR#, number, type, date, version, status, reference, created/modified, total, currency; toolbar Home/New/Update/Cancel/Calculate/Submit; search/filter/sort/resize/reorder/pagination/export/saved views.

## 7. Security
Toolbar actions hidden without permission (customer: New/Submit; costing calculate only if `costingPricing` or internal sales). No second RBAC.

## 8. Workflow
Statuses displayed as-is from prototype. Transitions not implemented here.

## 9. Calculation architecture (later)
Domain service + snapshot; not in this increment. Calculate button is permission-gated stub → toast pointing to Increment 8.

## 10. Technical offer (later)
Line-level generation from cable master; not this increment.

## 11. Versioning (later)
Non-destructive V1→V2; Home shows `versionNo` only.

**Implemented now:** Inquiry/Quotation Home only.
