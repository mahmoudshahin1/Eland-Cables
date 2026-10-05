# Costing Scrap

> **Canonical reference:** [`SCRAP_RULE_ENGINE.md`](./SCRAP_RULE_ENGINE.md)

## Governed scrap architecture

Scrap is calculated from **approved scrap rules** and optional **BOM line overrides** — never fabricated.

## Scrap rule metadata

Each rule exposes:

- Rule code, description  
- Scope (cable, material, global)  
- Rate (%)  
- Status, version  
- Effective from / to  
- Approval status  

## Calculation

For each BOM line:

```
scrap_cost = net_material_cost × scrap_rate
total_line_cost = net_material_cost + scrap_cost
```

Scrap rate resolution:

1. BOM line `scrapPercentage` (if present, including `0`)
2. Matching **ACTIVE** `CostingScrapRule` that is effective on the costing date
3. Specificity: `BOM_LINE` > `CABLE` > `FAMILY` > `MATERIAL_CLASS` > `GLOBAL`
4. Lowest `priority` among the winning specificity
5. If two APPROVED/ACTIVE/effective rules remain at the same specificity and same priority → `BUSINESS_RULE_REQUIRED` (do not guess)

`MATERIAL_CLASS` matches a BOM line when `RawMaterial.category` equals the rule `scopeValue` (or `materialClass` if scope value is empty). Categories come from the official RM master; `I4-RM-*` codes are not used as class values. No default scrap % is invented.

## Out of scope

**RULE-S002** dynamic MV scrap formula — extension point only, not implemented.

## API

- `GET/POST/PATCH /api/admin/costing/scrap-rules`
- Workflow: submit → approve → activate
