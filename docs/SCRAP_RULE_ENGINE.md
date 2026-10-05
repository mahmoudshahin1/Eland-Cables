# Scrap Rule Engine (Phase D)

## Sources (priority)

1. `GovernedBomLine.scrapPercentage` — per BOM line when populated
2. `CostingScrapRule` — governed, versioned, workflow-approved rules

## Rules

- **Never invent rates** — `scrapRate` nullable until business approval
- ACTIVE rule without rate → NOT_READY
- Scope types: GLOBAL, FAMILY, CABLE, BOM_LINE, MATERIAL_CLASS (Phase E)

## Workflow

```
DRAFT → VALIDATION → SUBMITTED → APPROVED → ACTIVE
```

ELAND RULE-S001 (static 1%) and RULE-S002 (dynamic MV) documented in discovery — encode only after governed approval.
