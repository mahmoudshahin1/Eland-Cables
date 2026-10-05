# Costing UI (Phase D)

## Location

**Administration → Costing** (`AdministrationCostingPanel.tsx`)

## Tabs

| Tab | Purpose |
|---|---|
| Overview | Counts and pending approvals |
| Methods | Costing configurations / versions |
| Variables | Variable registry |
| Formulas | Safe expression editor |
| Scrap Rules | Governed scrap policies |
| Layers | Cost components |
| Calculation Preview | Diagnostic BOM + layer preview |
| Approval Queue | SUBMITTED items |
| Change History | AuditEvent list |

## i18n

EN/AR via `lang` prop from AdministrationHub.

## Security

No eval/JS/SQL in formula editor. Customer users have no access.
