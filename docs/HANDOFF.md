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

## Next work

- Resume the priority list: F2, F3, F4, then WP0 0A (begin with 0A as previously agreed).
- Request Claude review before each merge.
