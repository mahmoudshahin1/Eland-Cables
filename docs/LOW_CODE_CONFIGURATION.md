# Low-Code Configuration

## Governed metadata models

| Model | Purpose |
|-------|---------|
| `CostingVariable` | Formula inputs/outputs |
| `CostingFormula` | Safe expressions |
| `CostingScrapRule` | Scrap rates |
| `CostingMetalRate` | LME/commercial/internal metal rates |
| `CostingLogisticsRule` | Incoterm + destination costs |
| `CostingPackingRule` | Drum/packing costs |
| `PlatformFieldDefinition` | Inquiry/quotation field metadata |
| `NotificationRule` | Event → recipient routing |
| `ReportDefinition` | Controlled report metadata |

## APIs

- `/api/admin/costing/*` — costing configuration
- `/api/admin/platform/*` — metal rates, logistics, packing, fields, notifications, reports, dashboard KPIs

## CONFIGURATION_REQUIRED

When business values are not supplied, models persist with `null` amounts and the engine returns `NOT_CONFIGURED` — never fabricated values.

## Not low-code

Formula parser, BOM governance, price validity, RBAC, customer isolation.
