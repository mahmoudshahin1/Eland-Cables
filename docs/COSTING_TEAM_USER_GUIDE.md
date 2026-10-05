# Costing Team User Guide

1. Sign in as Costing User / Costing Manager (not a customer account).
2. Open sidebar **Costing Configuration** — the workspace matches the Costing Configuration dashboard (overview cards, prices, scrap, formula builder, preview).
3. **Raw Material Prices** — enter a governed draft (leave price blank if not configured). Approve as Costing Team (`costingPricing`); Technical Office cannot approve prices. Excel template: existing `/api/master/raw-material-prices-export?purpose=template` and import preview/commit (DRAFT only). I4-RM-* test codes are hidden from Costing Team lists.
4. **Scrap** — set % on governed BOM lines or create a scrap rule (`GLOBAL` / `FAMILY` / `MATERIAL_CLASS` / `CABLE` / `BOM_LINE`). Empty rate is allowed until business approves. Overlap at the same specificity and priority is `BUSINESS_RULE_REQUIRED` (not guessed). Preview qty uses `executeCostingForInquiryLine` persist:false.
5. **Variables** — register formula identifiers (UPPER_SNAKE_CASE). Deactivate if used; do not delete. Kind is limited to the schema enum.
6. **Formulas** — click variables and `+ - * / ( )` to build an expression. SUM/AVG/ROUND/MIN/MAX/ABS/IF are disabled. Material cost does not require a formula. Preview tests use the same engine as inquiry (not persisted).
7. **Cable Assignment** — GLOBAL (all cables), FAMILY, or specific material number. Cable-specific output overrides family/global for that output.
8. **Other Costs** — FX, metal, incoterm/destination, packing. Amounts stay `NOT_CONFIGURED` until entered.
9. **Overview KPIs** — live Cable Master readiness plus submitted/expired governance counts. Totals are never invented.
10. **Preview** — same engine as inquiry; result is not saved. Total only when status is READY.
11. **Versions / Approval / Audit** — Costing Team workflow. Customers never see this workspace.

Customers never see this workspace. Inquiry Calculate is the customer path.
