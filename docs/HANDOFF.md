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

## Next work

- WP0 (Sales Orders, original branch) is still pending; resume with its original prompt and verify the baseline before editing.
- Then proceed in order: F2, F3, F4, then merge WP0 (0A first as previously agreed).
- Request Claude review before each merge.
