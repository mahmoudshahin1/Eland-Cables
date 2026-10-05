# Data readiness (Increment 11)

Internal metrics (PostgreSQL). Hub → Master Data → **Readiness**, Technical Office Workbench & Commercial Inquiries.

## Cable Master & Engineering Mapping

- Official imported rows: **432**
- Engineering mapping completeness: **0 COMPLETE**, **432 PARTIAL** (diameter + weight only), **0 MISSING**, **0 BDR**
- Workflow status breakdown for 432 official cables:
  - **APPROVED**: **0** (until reviewed and approved by Technical Office Manager)
  - **DRAFT**: **432** (or in review pipeline)
  - **UNDER_REVIEW**: **0**
  - **REJECTED**: **0**
- Structured configurator match: requires `APPROVED` engineering mapping; otherwise returns `CONFIGURATION_REQUIRED`.

## BOM

- Valid imported lines: **4822**
- Conflict groups: **81**
- Resolved: **0**
- Unresolved: **81** (`BUSINESS_DECISION_REQUIRED`)

## Raw Materials & Price Governance

- Total Official Raw Materials: **74**
- Price Configured & Active Approved: **0** (unless proposed and approved in Workbench)
- **`PRICE_NOT_CONFIGURED`**: **74**
- Zero price: strictly rejected as `INVALID_PRICE`
- Missing Price metadata: `PRICE_DATA_REQUIRED`

## Costing & Commercial Readiness Summary

- Overall Cables Ready for Costing: **0** (Cohort evaluation operational; cables ready only when all 4 gates pass)
- Commercial Inquiries & Lines: Persisted in PostgreSQL with Cable Authority & Costing feasibility links.
- Commercial Quotations: Versioned and immutable; material cost separated from selling price (`sellingPrice = NULL`).

## Blocked until governance

- Commercial selling price, margin, and discount calculations
- Automatic drum formulas
- D365 integration
