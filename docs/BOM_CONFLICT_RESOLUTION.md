# BOM conflict resolution (Increment 5)

## Finding

Official Cable Materials sheet: **81** Cable + Raw Material groups with two different weights. **4822** unique lines remain imported. Conflict rows were skipped in Increment 4, not deleted.

## Register

`BomDuplicateObservation` is the review register (`GET /api/master/bom-conflicts`).

| Field | Content |
|---|---|
| Conflict ID | `BOM-CONF-001` … |
| Cable | Cable Master description when known |
| Cable Material Number | Source |
| Raw Material | Source |
| Weight A / Weight B | Source, never averaged |
| Source rows | Excel row numbers |
| Occurrence count | Source |
| Current classification | Default `BUSINESS_DECISION_REQUIRED` |
| Reviewer / Review date / Decision / Comment | Filled only by an authorized internal PATCH |

## Allowed classifications

TRUE_DUPLICATE · BOM_VERSION · PLANT_VARIATION · MANUFACTURING_ROUTE · EFFECTIVE_DATE_VARIATION · VALID_PROCESS_VARIATION · SOURCE_DATA_ERROR · OTHER · BUSINESS_DECISION_REQUIRED

PATCH records a classification. It does **not** delete lines, overwrite consumption, invent versions/plants/routes/dates, or change uniqueness to Cable+RM.

There is **no** authoritative plant/route/version column in the workbook. Until a reviewer with evidence classifies a group, it stays **BUSINESS_DECISION_REQUIRED**. Increment 5 does not guess.

## Uniqueness

`(cableMaterialNumber, rawMaterialCode, bomVersion)` remains. Cable+RM alone is disproved by these 81 groups.

Full forensic list: `docs/BOM_DUPLICATE_GROUPS.json`.
