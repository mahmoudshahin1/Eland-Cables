# Handoff — Sales Orders Quantity Fix

Updated: 2026-10-30

## F1: quotation line quantity

- Merged to `main` from `fix/so-line-quantity` in merge commit `1ac091d`.
- Fix: quotation-derived Sales Order lines default to quantity `1`, because quotation `sellingPrice` is already the line total. Agreement-release lines with explicit quantities are unchanged.
- Claude reviewed the GitHub diff and approved the merge. The standalone regression test exercises the real mapping function without a database.

## Experimental Neon data correction

- On 2026-10-30, corrected `SO-202610290223-GDFC` on the Neon branch supplied for this task.
- Sales Order line: quantity `8` to `1`; `lineAmount` `1070767.12` to `133845.89`; `unitPrice` remained `133845.89`.
- Related commitment: `orderedQuantity` `8` to `1`, `remainingQuantity` `0` to `7`, status `COMPLETED` to `ACTIVE`; total committed quantity remains `8`.
- Read-only verification passed. MXL8 remained unchanged at quantity `1` and line amount `28477.9`.

## WP0: customer Sales Orders portal

- Merged `feat/customer-sales-orders-api` to `main` in merge commit `2d9c1a4`.
- `SalesOrders.tsx` reads real Sales Orders from `GET /api/sales-orders`; `fetchOrders` depends on `jwtToken` so it reloads when the token changes.
- Live API check on the experimental Neon branch: test customers with zero and with two active customer assignments each received `403 CONFIGURATION_REQUIRED`. Both temporary accounts and their test links were deleted and verified absent.
- The tested route applies `assertCustomerBusinessScope` before querying the list. No unauthorized rows were returned in either test.
- Technical debt: `listInquiries`, `listQuotations`, `listCommitments`, `listSalesOrders`, and `listSalesAgreements` retain secondary `.length` checks for scope. Review and remove reliance on these dead defenses so access control does not depend on every route applying the guard.

## F2: customer VIP production tracking metadata

- Merged `fix/f2-customer-metadata-visibility` to `main` in merge commit `6e01e1d`.
- `commercialProjection.ts` now exposes `commercialApprovalStatus`, `productionStatus`, and `releasedToProductionAt` to customer actors. `submittedToSales` and `requestedFulfillmentType` were already in `CUSTOMER_VISIBLE_COMMERCIAL_METADATA_KEYS`.
- The projection allowlist was filtering the tracking state from customer API responses even though `productionStatus=RELEASED_TO_PRODUCTION` was stored on the investigated inquiry. The unit check confirmed the five workflow fields pass through while `materialCost` and `sellingPrice` remain hidden.
- Live GET and visual verification with David's account were not performed because no local server or customer test token was available during the fix. Confirm the UI once with David's account before treating F2 as fully closed.
- Follow-up technical debt (not urgent): add a clear comment above `CUSTOMER_VISIBLE_COMMERCIAL_METADATA_KEYS` or evaluate a safer pattern that prevents future workflow metadata fields from being silently hidden. Keep sensitive financial fields such as costs, prices, and margins excluded; do not switch to a denylist without a separate review.

## Next work

- Resume the priority list: F3, F4, then WP0 0A (begin with 0A as previously agreed). F2 still needs one visual confirmation with David's account.
- Request Claude review before each merge.
