# BOM Authority Model & Target Dimensions (Increment 8)

## Target Multi-Dimensional BOM Model

To support advanced manufacturing realities across multiple facilities, routes, and temporal revisions, the governed BOM architecture defines the following schema:

```
GovernedBomLine {
  cableMaterialNumber: String (FK -> CableMaster)
  rawMaterialCode: String (FK -> RawMaterial)
  consumption: Decimal (Authoritative consumption rate)
  uom: String (Preserved source unit: kg, PCS, m2)
  scrapPercentage: Decimal? (Optional engineering scrap)
  bomVersion: Int (Revision / version number, default 1)
  plant: String? (Manufacturing facility, e.g. Helwan Plant 1)
  manufacturingRoute: String? (Specific extrusion/cabling line)
  effectiveFrom: DateTime? (Valid starting timestamp)
  effectiveTo: DateTime? (Supersession / expiration timestamp)
  status: String ("APPROVED" | "UNDER_REVIEW")
  conflictId: String? (Traceability link -> BomDuplicateObservation)
  decisionReference: String? (Governed decision category)
  reviewer: String? (Investigating engineer)
  approvedBy: String? (Signing Technical Office Manager)
  approvedAt: DateTime (Approval timestamp)
}
```

### Uniqueness Rule

`@@unique([cableMaterialNumber, rawMaterialCode, bomVersion])`

- `Cable + Raw Material` alone is **NOT** the sole uniqueness rule because multiple legitimate versions, plants, or routes may exist.
- Values are populated only when supported by verified evidence. Missing values remain `NULL` (never fabricated).
