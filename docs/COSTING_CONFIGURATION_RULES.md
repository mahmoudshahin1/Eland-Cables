# Costing Configuration Rules

| Topic | Rule |
|-------|------|
| Engine | Only `executeCostingForInquiryLine` |
| Prices | `RawMaterialPrice` APPROVED + ACTIVE + date/UOM/basis. Blank is not zero |
| BOM | Approved `GovernedBomLine` only; conflicts block |
| Scrap | BOM line % first; else matching ACTIVE `CostingScrapRule` by specificity then lowest priority number |
| Scrap scopes used | BOM_LINE > CABLE > FAMILY > MATERIAL_CLASS > GLOBAL. Equal remaining overlap is `BUSINESS_RULE_REQUIRED` |
| Formulas | Optional; ACTIVE version on ACTIVE configuration |
| Assignment | GLOBAL default. CABLE overrides FAMILY/GLOBAL for the same output variable |
| Logistics / packing / metal | Configured amount or `NOT_CONFIGURED` |
| Snapshots | Never mutate `CostingCalculation` |
| Customers | No admin APIs; projected inquiry result |
