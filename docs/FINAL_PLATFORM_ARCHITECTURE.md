# Final Platform Architecture

**Date:** 2026-08-22  
**Status:** Consolidation in progress

## Three layers

```
LAYER 1 — PLATFORM CONTROL PLANE
  Administration (users, roles, customers, field defs, reports, notifications, audit)
  Costing Configuration (methods, variables, formulas, scrap, metal, logistics, packing)

LAYER 2 — GOVERNED BUSINESS SERVICES
  Cable · BOM · Raw Material · Price · Costing · Inquiry · Quotation · Technical Office · Drum

LAYER 3 — FUTURE INTEGRATION
  D365 F&O · MES · Advaris · Logistics (stubs only)
```

### D365 F&O quote-to-cash

Approved architecture baseline (v1.0): [`D365_FO_QUOTE_TO_CASH_INTEGRATION_SPECIFICATION.md`](./D365_FO_QUOTE_TO_CASH_INTEGRATION_SPECIFICATION.md).
Phase 1 standalone commercial fulfillment is **FROZEN** (2026-08-31): three SO entry points — Quotation→Commitment→SO, Agreement→Release→SO, and Direct MTS (no commitment). Live D365 is not — see [`PHASE1_QUOTE_TO_CASH_FREEZE.md`](./PHASE1_QUOTE_TO_CASH_FREEZE.md) and [`D365_FO_QUOTE_TO_CASH_PHASE1_GAP_ANALYSIS.md`](./D365_FO_QUOTE_TO_CASH_PHASE1_GAP_ANALYSIS.md).
Adapter rule: ADR-004 in [`ARCHITECTURE_DECISIONS.md`](./ARCHITECTURE_DECISIONS.md). Stubs remain `NOT_IMPLEMENTED` / `NOT_CONNECTED` until Phase 5+. Next: UI refinement + operational workflow (not D365).

## Single costing path

```
Inquiry inputs (server-side only)
  → executeCostingForInquiryLine
  → BOM + RawMaterialPrice + Scrap + Formulas
  → Extension layers (metal, logistics, packing) — NOT_CONFIGURED until configured
  → CostingCalculation snapshot
  → Commercial pricing (separate engine)
  → Quotation (frozen costingCalculationId)
```

## Low-code rule

Metadata-driven configuration — **not** arbitrary code. Formula engine remains tokenizer → AST → evaluator only.

## Protected domain services (not low-code)

BOM approval, price overlap, cable authority, costing readiness gates, customer isolation, audit immutability, authorization.

See [`FINAL_PLATFORM_GAP_ANALYSIS.md`](./FINAL_PLATFORM_GAP_ANALYSIS.md) for requirement compliance matrix.
