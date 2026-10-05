# Commercial Costing Boundary & Non-Negotiables (Increment 11)

## Absolute Non-Negotiable Boundary

Increment 11 connects commercial inquiries to the **manufacturing raw material cost** calculated by the Increment 10 Costing Engine.

It **DOES NOT** calculate commercial selling prices.

---

## 1. Boundary Matrix

| Concept | Status in Increment 11 | Responsibility / Location |
|---|---|---|
| **Raw Material Manufacturing Cost** | **Calculated** | `CostingRun.materialCost` (Increment 10 domain service) |
| **Process / Machine / Labour Cost** | `NOT_CONFIGURED` | Future manufacturing increment |
| **Overhead & Scrap Cost** | `NOT_CONFIGURED` | Future manufacturing increment |
| **Commercial Sales Margin / Markup** | `NOT_CONFIGURED` | Future commercial pricing increment |
| **Customer Commercial Discount** | `NOT_CONFIGURED` | Future commercial pricing increment |
| **Commercial Selling Price** | **`NULL`** (Explicitly prohibited) | Future commercial pricing increment |
| **Automatic Drum Optimization** | `CONFIGURATION_REQUIRED` | Future packaging increment |
| **D365 ERP Synchronization** | `NOT_IMPLEMENTED` | Future integration increment — baseline: [`D365_FO_QUOTE_TO_CASH_INTEGRATION_SPECIFICATION.md`](./D365_FO_QUOTE_TO_CASH_INTEGRATION_SPECIFICATION.md); gaps: [`D365_FO_QUOTE_TO_CASH_PHASE1_GAP_ANALYSIS.md`](./D365_FO_QUOTE_TO_CASH_PHASE1_GAP_ANALYSIS.md) |

---

## 2. Presentation Standard

The presentation layer explicitly communicates:

```
┌────────────────────────────────────────────────────────┐
│  Material Cost:  USD 1,313.30                           │
│  Note: RAW MATERIAL COST ONLY — NOT SELLING PRICE       │
│  Commercial Pricing & Sales Margin: NOT CONFIGURED     │
└────────────────────────────────────────────────────────┘
```

Under no circumstances will the system display `Selling Price = Material Cost` or substitute false zeroes for unconfigured commercial formulas.
