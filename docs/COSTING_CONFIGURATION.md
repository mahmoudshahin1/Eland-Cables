# Costing Configuration

> **UI:** Administration → Costing Configuration (`CostingHub` / `AdministrationCostingPanel`)  
> **API:** `/api/admin/costing/*`

## Configuration entities

| Entity | Model | Purpose |
|--------|-------|---------|
| Costing Method | `CostingMethod` | Active calculation method, version, effective dates |
| Variables | `CostingVariable` | Governed inputs (numeric, currency, select, etc.) |
| Formulas | `CostingFormula` | Layer expressions with approval workflow |
| Scrap Rules | `CostingScrapRule` | Governed scrap % by scope |
| Exchange Rates | `CostingExchangeRate` | FX for multi-currency costing |
| BOM Scrap | `CableBomLine.scrapPercent` | Per-line scrap overrides (BOM Costing tab) |

## Admin tabs

1. Methods  
2. Variables  
3. Formulas  
4. Scrap Rules  
5. BOM Costing  
6. Calculation Preview  
7. Versions  
8. Approval  
9. Audit  

## Workflow

```
DRAFT → SUBMITTED → VALIDATION → APPROVED → ACTIVE
```

RBAC permissions: `ADMIN.COSTING.VIEW`, `CREATE`, `UPDATE`, `APPROVE`, `PREVIEW`

## Dynamic fields

Variable metadata supports controlled field types:

- Numeric, Decimal, Percentage, Currency, Select, Lookup, Boolean, Date
- Label, internal name, required, default, min/max, precision, visibility, display order, help text, role visibility

No arbitrary SQL, JavaScript, or uncontrolled EAV.

## Versioning

See [`COSTING_CONFIGURATION_VERSIONING.md`](./COSTING_CONFIGURATION_VERSIONING.md) and [`COSTING_VERSIONING.md`](./COSTING_VERSIONING.md).
