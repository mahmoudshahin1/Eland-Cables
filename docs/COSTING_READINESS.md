# Costing Readiness Specification & API (Increment 9)

## API Endpoint

`GET /api/master/costing-readiness`

Query Parameters:
- `materialNumber` (optional): Filter readiness evaluation for a specific Cable Material Number.
- `costingDate` (optional): Target costing evaluation date (defaults to current date).

## 4-Gate Evaluation Architecture

```
[Gate 1: Engineering Mapping APPROVED] ──► [Gate 2: BOM Resolved & Authoritative] ──► [Gate 3: Raw Materials Exist] ──► [Gate 4: Active Approved Price Matching Date/UOM]
```

## Costing-Ready Cohort Output Structure

```json
{
  "summary": {
    "totalCables": 432,
    "readyForCosting": 0,
    "dataIssue": 81,
    "underReview": 351,
    "notReady": 0
  },
  "cables": [
    {
      "materialNumber": "10009487",
      "cableDescription": "Cu / XLPE / LSHF 0.6/1 kV 1X16 mm2 RMC IEC 60502-1",
      "engineeringStatus": "PARTIAL",
      "bomStatus": "RESOLVED",
      "rmPriceStatus": "PRICE_NOT_CONFIGURED",
      "overallStatus": "UNDER_REVIEW",
      "blockingReasons": [
        "Gate 1 Failed: Engineering mapping status is DRAFT (PARTIAL). Approved mapping is mandatory for costing.",
        "Gate 4 Failed: CR01 — No approved price configured for Raw Material CR01 (PRICE_NOT_CONFIGURED)."
      ]
    }
  ]
}
```

## Readiness Rules Enforced

1. **No Silent Cost Calculation**: Costing will never execute with missing prices, unapproved engineering mappings, unclassified BOM conflicts, or expired prices.
2. **Transparent Blocking Reasons**: The API reports exact conflict IDs and missing price codes for each cable.
3. **Cohort Readiness**: Allows subsets of cables with approved engineering, resolved BOM, and approved prices to be evaluated as `READY_FOR_COSTING` independently of the remaining unpriced catalog.

## Configuration-Required Remediation

When a Cable List material reports `Gate 1 Failed: Engineering mapping is MISSING`, first restore the Increment 5 governance rows with `tsx scripts/populateIncrement5Governance.ts`. This creates DRAFT/PARTIAL mappings from official source diameter and weight only; it does not approve or infer missing engineering attributes.

To clear Gate 1 on the **costing-readiness report**, Technical Office may still complete mapping attributes and approve through `/api/master/engineering-mappings/:materialNumber/actions`. **Persisted costing calculation** (`POST /api/inquiries/:id/calculate-cost` and `executeCostingRun`) automatically creates a missing mapping from Cable Master SOURCE fields and auto-approves `DRAFT` / `SUBMITTED` / `UNDER_REVIEW` with a `COSTING_AUTO_APPROVE` audit. Preview and the readiness API do not auto-approve. `REJECTED` and `CANCELLED` mappings still fail Gate 1. Suggested description values are not promoted. BOM conflicts and raw-material prices are never auto-approved.

When Gate 4 reports `PRICE_NOT_CONFIGURED`, verify whether `RawMaterialPrice` rows are merely imported drafts. Costing only consumes `workflowStatus=APPROVED`, `status=ACTIVE`, `isCurrent=true` prices that match costing date, currency, UOM, and price basis. Create/import real governed price proposals, then submit and approve them through `/api/master/raw-material-prices/:id/actions`; do not convert blanks to zero or auto-approve source workbook values.

For mixed UOM cases such as `A-ECAP10`, where the BOM consumes `PCS` but the raw-material master is `kg`, either configure a real `PCS`/`PER_PCS` governed price or resolve the BOM/UOM decision. Costing must not invent a kg-to-PCS conversion.
