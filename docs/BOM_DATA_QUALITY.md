# BOM data quality (Increment 4)

## Issue

The official **Cable Materials** sheet (when previously inspected) contained about **83** groups of `(Cable Material Number, Raw Material)` with **different Weight** values.

This increment does **not**:

- delete duplicates
- overwrite one weight with another
- average weights
- pick first or latest row
- invent BOM versions, effective dates, plants, or routes

## Forensic method

`src/services/bomDuplicateForensics.ts` groups source rows by Cable + Raw Material. A group is a conflict when two or more distinct numeric weights exist.

For each group the report includes:

- Cable
- Raw Material
- Weight A (minimum distinct)
- Weight B (maximum distinct)
- Occurrence count
- Source worksheet (Cable Materials when known)
- Source row numbers when the import file provides them

### Classification

| Class | When |
|---|---|
| LIKELY_DUPLICATE | Relative weight difference &lt; 0.5% and no version/plant/route/date columns |
| LIKELY_LEGITIMATE_VARIATION | **Not assigned** from workbook data alone (those columns are absent) |
| UNCLEAR | Insufficient numeric contrast metadata |
| BUSINESS_DECISION_REQUIRED | Default for distinct weights with no grain in the source |

If classification cannot be determined from source data: **BUSINESS DECISION REQUIRED**.

## This workspace (forensic result)

Source: `data/source/Energya Cable Master Data.xlsx` / **Cable Materials** (4986 rows). File not modified.

| Metric | Count |
|---|---|
| Distinct Cable+RM pairs | 4903 |
| Unique single-weight pairs imported | 4822 (includes 2 identical-weight extra-row groups reduced to one line each) |
| Conflicting-weight groups | **81** (all `BUSINESS_DECISION_REQUIRED`) |
| Rows skipped in those groups | 162 (typically 2 rows each) |
| Identical-weight extra rows skipped | 2 |
| Total skipped | 164 |
| Cables missing from Cable List | 0 |
| Raw materials missing from RM list | 0 |
| BOM UOMs present | kg, PCS, m2 (PCS not converted) |

Every conflicting group is listed in `docs/BOM_DUPLICATE_GROUPS.json` with Cable, Raw Material, Weight A, Weight B, occurrence count, worksheet, and source row numbers.

None are classified as legitimate variation: the sheet has no version, plant, route, or date columns.


1. Skips every row in the conflicting group
2. Stores `BomDuplicateObservation`
3. May still import **other** unique Cable+RM lines that have a single weight
4. Missing Cable Master or Raw Material FKs remain **ERROR** (no placeholder masters)

`GET /api/master/bom-duplicate-observations`

## Uniqueness assumption (not finalized)

PostgreSQL unique key remains:

`(cableMaterialNumber, rawMaterialCode, bomVersion)` with default `bomVersion = 1`.

**Cable + Raw Material is not treated as the sole uniqueness rule** until the business names the grain (version / date / plant / route). Conflicting weights never collapse onto that key.

Costing must not run on unresolved groups.
