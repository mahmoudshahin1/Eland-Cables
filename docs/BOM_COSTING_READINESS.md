# BOM Costing Readiness & Evaluation Rules (Increment 8)

## Costing Readiness Gate

Before any cable can proceed to the commercial costing engine (future increments), it must pass the Costing Gate:

```
                          CABLE COSTING READINESS GATE
                          
┌─────────────────────────────────┐      ┌─────────────────────────────────┐
│     ENGINEERING MAPPING GATE    │      │        BOM GOVERNANCE GATE      │
│  - Mandatory status: APPROVED   │  +   │  - Mandatory status: RESOLVED   │
│  - 6 core parameters valid      │      │  - No open BOM conflicts        │
│  - Verified compatibility rules │      │  - Authoritative consumption    │
└─────────────────────────────────┘      └─────────────────────────────────┘
                                         +
                         ┌─────────────────────────────────┐
                         │      RAW MATERIAL PRICE GATE    │
                         │  - Mandatory status: ALL_PRICED │
                         │  - Zero fake prices forbidden   │
                         │  - Active currency & unit check │
                         └─────────────────────────────────┘
                                         │
                                         ▼
                               [READY_FOR_COSTING]
```

## Readiness Classifications

| State | Definition | Action Required |
|---|---|---|
| **`READY_FOR_COSTING`** | Engineering Approved, BOM Resolved, all raw materials have active configured prices. | Eligible for commercial calculation in future costing increments. |
| **`DATA_ISSUE`** | One or more consumed materials have unresolved BOM conflicts in `BomDuplicateObservation`. | Must resolve and approve conflict in BOM Governance Workbench. |
| **`UNDER_REVIEW`** | Engineering mapping is in `DRAFT`, `SUBMITTED`, or `PARTIAL` status. | Complete and approve mapping in Engineering Workbench. |
| **`NOT_READY`** | Cable has missing prices (`PRICE_NOT_CONFIGURED`) or no BOM lines found. | Provide procurement price pack or link BOM. |
