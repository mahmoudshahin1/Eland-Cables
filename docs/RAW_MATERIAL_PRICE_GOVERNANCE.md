# Raw Material Price Governance & Costing Readiness Foundation (Increment 9)

## Executive Summary

Increment 9 establishes **Raw Material Price as a governed business master-data domain** and builds the **Costing Readiness Gate Foundation**.

This increment strictly maintains data-governance boundaries:
- **Cost calculation engine is NOT implemented** (zero cost, scrap, overhead, margin, discount, or selling price formulas).
- **Zero price is NOT free material** (zero price is rejected as `INVALID_PRICE`).
- **Null price is NOT zero** (unpriced materials evaluate to `PRICE_NOT_CONFIGURED`).
- **Zero automatic conversion** (currency or UOM mismatches block readiness rather than applying unapproved automated conversion factors).

---

## 1. Golden Rules of Price Governance

1. **Never Invent Price Metadata**: Price, currency, UOM, effective date, supplier, price source, price basis, and validity period are never guessed or filled with placeholders.
2. **Missing Price ≠ Zero**: Missing price data returns `PRICE_NOT_CONFIGURED` or `PRICE_DATA_REQUIRED`.
3. **Historical Immutability**: Approved price records (`RawMaterialPrice`) are never overwritten or deleted. Modifications create new revisions in `DRAFT` status.
4. **No Silent Overlap Resolution**: Overlapping effective date intervals for the same Raw Material, Currency, UOM, and Price Basis are rejected as `PRICE_PERIOD_OVERLAP`.

---

## 2. Governed Raw Material Price Entity

Enhanced model `RawMaterialPrice`:
- `rawMaterialCode`: Foreign key to `RawMaterial.code`
- `price`: Numeric decimal (must be > 0 for valid proposals)
- `currency`: Governed currency (`USD`, `EUR`, `EGP`, `SAR`, `GBP`, `AED`)
- `uom`: Governed unit (`kg`, `ton`, `m`, `PCS`, `m2`, `KM`)
- `effectiveFrom` / `effectiveTo`: Temporal validity interval (open-ended supported if `effectiveTo` is null)
- `supplier` / `source`: Vendor/source provenance (e.g. `LME Cash Official`)
- `priceBasis`: Governed basis (`PER_KG`, `PER_TON`, `PER_METER`, `PER_PCS`, `PER_M2`)
- `workflowStatus`: Controlled state machine (`DRAFT`, `SUBMITTED`, `UNDER_REVIEW`, `APPROVED`, `REJECTED`, `EXPIRED`, `CANCELLED`)
- `isCurrent` & `revision`: Immutable historical revision tracking

---

## 3. Price Selection Domain Service

Domain Service: `getValidRawMaterialPrice(rawMaterialCode, costingDate, requiredUom, currency, priceBasis)`

**Functionality**:
Identifies the single temporally and dimensionally valid approved price for a given costing date. It **NEVER calculates cost**.

### Controlled Return Codes:
- `PRICE_VALID`: Valid approved price found.
- `PRICE_NOT_CONFIGURED`: No approved price found for the material on that date.
- `PRICE_EXPIRED`: Existing approved price has expired before the costing date.
- `PRICE_PERIOD_OVERLAP`: Multiple overlapping approved prices found.
- `PRICE_UOM_MISMATCH`: Price UOM differs from required BOM UOM (no fake math).
- `PRICE_CURRENCY_MISMATCH`: Price currency differs from required currency.
- `PRICE_BASIS_MISMATCH`: Price basis differs from required basis.
- `INVALID_PRICE`: Price <= 0 or missing.

---

## 4. Technical Office / Procurement Price Workbench

Under **Technical Office → Raw Material Prices**:
- **Dashboard Summary**: Displays Total Raw Materials (74), Priced & Ready (0 initially), `PRICE_NOT_CONFIGURED` (74), and Expired Prices (0).
- **Master List & Price History**: Inspects historical revisions per raw material with full temporal visibility.
- **Price Proposal Workflow**: Create proposal (`DRAFT`) → Submit (`SUBMITTED`) → Manager Approve (`APPROVED`) / Reject (`REJECTED`).
- **Excel Template Export & Import**:
  - `GET /api/master/raw-material-prices/export`
  - `POST /api/master/raw-material-prices/import/preview`
  - `POST /api/master/raw-material-prices/import/commit` (imports as `DRAFT` only; never directly approved)

---

## 5. Costing Readiness Gate & Cohort Evaluation

API: `GET /api/master/costing-readiness`

Evaluates cables across **4 Strict Gates**:
1. **Gate 1 — Engineering**: Cable must have `APPROVED` mapping (`ENGINEERING_NOT_APPROVED` otherwise).
2. **Gate 2 — BOM**: Authoritative BOM with zero unresolved conflicts (`BOM_CONFLICT_UNRESOLVED` otherwise).
3. **Gate 3 — Raw Material**: All consumed materials must exist in master data (`RAW_MATERIAL_NOT_FOUND` otherwise).
4. **Gate 4 — Raw Material Price**: Every consumed raw material must have an active approved price valid for the costing date (`PRICE_NOT_CONFIGURED`, `PRICE_EXPIRED`, `PRICE_UOM_MISMATCH`, etc.).

### Costing-Ready Cohort Concept
The system classifies each cable independently:
- **`READY_FOR_COSTING`**: All 4 gates satisfied. Ready to be passed to future Costing Engine iterations.
- **`UNDER_REVIEW`**: Engineering mapping in draft or under review.
- **`DATA_ISSUE`**: Unresolved BOM conflicts present.
- **`NOT_READY`**: Missing raw material prices.
