# BOM Governance Workbench (Increment 8)

## Executive Summary

Increment 8 establishes the **Technical Office / Manufacturing BOM Governance Workbench** to systematically investigate, track evidence for, and resolve the **81 Cable + Raw Material conflict groups** identified in the official Energya master data (4,986 source rows; 4,822 unique imported lines).

This increment enforces the **Golden Rule of Data Governance**:
- Original imported source rows remain immutable.
- No automatic averaging, selecting, deletion, or version guessing is allowed.
- Costing calculation is blocked until cable engineering mapping is approved, BOM conflicts are resolved, and raw material prices are supplied.

---

## 1. Golden Rules & Immutability

1. **Source Data Preservation**: The original imported BOM data (`CableBomLine`) and the 81 conflict observations (`BomDuplicateObservation`) remain intact with source row references and original consumption values.
2. **Separation of Source vs Governed BOM**:
   - `SOURCE BOM`: `CableBomLine` (raw consumption rates from extract rows)
   - `GOVERNED BOM`: `GovernedBomLine` (created/updated only upon explicit Technical Office Manager approval of an investigated conflict)
3. **No Automatic Data Repair**: Zero auto-averaging, zero auto-deletion, zero synthetic effective dates, and zero automatic UOM conversion.

---

## 2. BOM Governance Workbench Features

The Workbench under **Technical Office → BOM Governance & Conflict Register** provides:

### A. Dashboard Metrics
- **Total BOM Source Rows**: 4,986
- **Unique Valid Lines**: 4,822
- **Conflict Groups**: 81
- **Under Review / BDR**: Tracks open investigation groups
- **Resolved**: Count of conflicts with complete evidence ready for manager sign-off
- **Approved Governed**: Count of authoritative governed BOM lines created

### B. Conflict Register & Filters
Displays all 81 conflict groups with:
- Conflict ID (`BOM-CONF-001` …)
- Cable Material Number & Description
- Raw Material Code & Description
- Conflicting weights (Weight A vs Weight B)
- Occurrence count & source row numbers
- Investigation status & decision classification
- Assigned reviewer & approval dates

### C. Source Evidence Panel
Displays raw source extract row numbers, worksheet provenance (`Cable Materials`), and unchanged consumption values for transparent engineer inspection.

### D. Investigation & Resolution Form
Allows engineers to select a controlled decision category, specify the governed weight, provide required dimensional evidence, and write mandatory justification comments.

---

## 3. Controlled Decision Categories & Required Evidence

| Decision Category | Mandatory Evidence Required |
|---|---|
| `DIFFERENT_PLANT` | Plant specification (e.g. `Plant 1 - Helwan`) + Comment |
| `DIFFERENT_BOM_VERSION` | BOM Version number (> 0) + Comment |
| `DIFFERENT_ROUTE` | Manufacturing Route specification (e.g. `Extrusion Line #2`) + Comment |
| `EFFECTIVE_DATE_DIFFERENCE` | Effective From date + Comment |
| `TRUE_DUPLICATE` | Selected authoritative weight + Comment |
| `ALTERNATIVE_CONSUMPTION` | Selected alternative weight + Comment |
| `MANUFACTURING_CONDITION` | Technical condition notes + Comment |
| `SOURCE_DATA_ERROR` | Error explanation + Comment |
| `INSUFFICIENT_INFORMATION` | Explanation note + Comment |
| `BUSINESS_DECISION_REQUIRED` | Initial baseline status (unresolved) |

---

## 4. RBAC & Security

- **Customer Role**: Blocked (`403 UNAUTHORIZED`).
- **Technical Office Engineer**: Can investigate, assign, record evidence, and resolve conflicts.
- **Technical Office Manager**: Authorized to formally approve (`APPROVE`) or `REJECT` resolutions.
- **Audit Logging**: Every action (`ASSIGN`, `START_REVIEW`, `DECIDE`, `RESOLVE`, `APPROVE`, `REJECT`, `REOPEN`) writes an immutable entry in `AuditEvent`.
- **Reopen Capability**: Reopening an approved conflict transitions the status back to `UNDER_REVIEW` and marks corresponding `GovernedBomLine` records as non-authoritative.

---

## 5. Costing Readiness Gate

API: `GET /api/master/costing-readiness`

A cable is evaluated against 4 transparent gates:
1. **Engineering Status**: `APPROVED` mapping mandatory.
2. **BOM Status**: Must be `RESOLVED` with no open conflicts.
3. **Raw Material Price Status**: All consumed materials must have active configured prices (`ALL_PRICED`).
4. **Overall Status**:
   - `READY_FOR_COSTING` (all 3 gates passed)
   - `DATA_ISSUE` (has unresolved BOM conflicts)
   - `UNDER_REVIEW` (engineering mapping is Draft or Partial)
   - `NOT_READY` (missing prices or no BOM)
