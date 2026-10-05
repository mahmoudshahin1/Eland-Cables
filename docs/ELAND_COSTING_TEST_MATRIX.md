# ELAND Costing Test Matrix

**Version:** Stage A — 2026-08-20  
**Validation cohort:** 10009487, 10009546, 10010347, 10010439  
**Comparison source:** `ELAND_Cost_Sheet_Required.xlsx` (workbook-proven values only)

Result classification key:
- **MATCH** — Application output equals Excel within rounding tolerance (±0.02 EUR)
- **EXPECTED_DIFFERENCE** — Known architectural boundary (e.g. no FX in app)
- **REQUIRES_RECONCILIATION** — Excel value unconfirmed or business rule pending
- **BLOCKED** — Master data / readiness gate prevents calculation

Rounding tolerance: **±0.02 EUR** per line; flag Excel inconsistency as `ROUNDING_RULE_AMBIGUOUS`.

---

## 1. Baseline Cable Validation

### TC-ELAND-001 — Cable 10009487 baseline

| # | Assertion | Excel reference | Expected | Classification basis |
|---|---|---:|---|---|
| 1 | BOM line count | Sheet `1` rows 9–16 | 8 materials | CONFIRMED |
| 2 | CR01 consumption kg/km | E9 | 135.23 | MATCH target |
| 3 | CR01 scrap adjusted kg/km | G9 | 136.5823 | MATCH target |
| 4 | CR01 line EUR | K9 | 1,772.79 | MATCH target |
| 5 | Material total EUR/km | K28 | 2,237.03 | MATCH target |
| 6 | Ex-work EUR/km | Summary K13→I13 | 2,379.82 | REQUIRES_RECONCILIATION (6% rule pending) |
| 7 | DAP EUR/km | Forensic only | 3,280.82 | REQUIRES_RECONCILIATION |

### TC-ELAND-002 — Cable 10009546 baseline

| # | Assertion | Excel reference | Expected |
|---|---|---:|---|
| 1 | CR01 consumption kg/km | E9 | 8,217.45 |
| 2 | CR01 line LE (not EUR) | J9 | 6,314,522.35 LE |
| 3 | CR01 line EUR | K9 | 107,726.21 |
| 4 | Material total EUR/km | K32 | 113,923.71 |
| 5 | Ex-work EUR/km | Summary I14 | 121,195.43 |

### TC-ELAND-003 — Cable 10010347 baseline

| # | Assertion | Excel reference | Expected |
|---|---|---:|---|
| 1 | AR01 consumption kg/km | E10 | 788.83 |
| 2 | Dynamic scrap AR01 | F10 | 0.006 (via R16) |
| 3 | Material total EUR/km | K32 | 6,578.34 |
| 4 | Ex-work EUR/km | Summary I15 | 6,998.24 |
| 5 | Order qty meters | P6 | 1,000 |

### TC-ELAND-004 — Cable 10010439 baseline

| # | Assertion | Excel reference | Expected |
|---|---|---:|---|
| 1 | CR01 consumption kg/km | E9 | 3,683.36 |
| 2 | CR01 dynamic scrap | F9 | 0.156 (via R9) |
| 3 | Material total EUR/km | K32 | 58,454.95 |
| 4 | Ex-work EUR/km | Summary I16 | 62,186.12 |

---

## 2. Formula & Component Tests

### TC-ELAND-005 — Material price currency conversion

| Step | Input | Expected | Notes |
|---|---|---|---|
| USD LME copper | D10=14463.73 USD | LE/kg via RULE-P001 | REQUIRES_RECONCILIATION until additives governed |
| EUR/EGP rate | 58.6164 | EUR/kg = LE/kg ÷ rate | MATCH once LE price known |
| Cross-currency without rate | USD price, EUR costing | BLOCKED: `CURRENCY_MISMATCH` | EXPECTED_DIFFERENCE today |

### TC-ELAND-006 — Static scrap calculation (LV)

```
Input:  consumption=135.23, scrap=0.01
Output: adjusted=136.5823
Source: Cable 1 CR01
Status: MATCH target (Stage B)
```

### TC-ELAND-007 — Dynamic scrap calculation (MV)

| Cable | Material | Scrap | Source |
|---|---|---:|---|
| 10010347 | SC01 | 0.2937251184834123 | R11 = P11+P13+P18+P26 |
| 10010439 | CR01 | 0.156 | R9 = P9+P11+P16+P26 |

Status: REQUIRES_RECONCILIATION until ScrapPolicy approved.

### TC-ELAND-008 — UOM mismatch

| Scenario | Expected |
|---|---|
| BOM kg + price PCS (no rule) | `COSTING_UOM_MISMATCH` |
| BOM kg + price ton PER_TON | Convert /1000 — MATCH |

### TC-ELAND-009 — Currency mismatch

| Scenario | Expected |
|---|---|
| Approved USD price, request EUR | `PRICE_CURRENCY_MISMATCH` |
| Approved EUR price, request EUR | Proceed |

### TC-ELAND-010 — Quantity variation

```
quantity=2, lengthMeters=1000 → totalConsumption = 2× single run
Excel basis: Summary D=1 (km qty) — align request semantics before test
```

### TC-ELAND-011 — Length variation

```
lengthMeters=500 → half of km consumption
Excel: costs are per km — lengthMeters=500 should yield 50% of km cost
```

### TC-ELAND-012 — Historical price revision

| Step | Expected |
|---|---|
| Run at price revision 1 | Snapshot priceRevision=1 |
| Approve revision 2, recalculate | New CostingRun, revision 2 |
| Old run unchanged | Immutability MATCH |

### TC-ELAND-013 — Historical costing snapshot immutability

| Step | Expected |
|---|---|
| Create CostingRun A | isCurrent=true |
| Recalculate → Run B | A.isCurrent=false, A.materialCost unchanged |

---

## 3. Shipping & Totals

### TC-ELAND-014 — Shipping calculation (aggregate)

| Component | Excel | Expected |
|---|---:|---|
| Container EUR | K25 | 3,024.81 |
| Insurance 0.3% | J17×0.003 | 578.28 |
| Total shipping | L23 | 3,603.09 |

Status: REQUIRES_RECONCILIATION until ShippingRate master exists.

### TC-ELAND-015 — DAP total (aggregate)

| Metric | Excel | Expected |
|---|---:|---|
| Ex-work total | J17 | 192,759.61 |
| DAP grand total | J19 | 196,362.70 |

Per-cable DAP: **REQUIRES_RECONCILIATION** (not in workbook).

---

## 4. NOT_CONFIGURED Boundary Tests

| Test ID | Assertion | Expected status |
|---|---|---|
| TC-ELAND-016 | Process cost | NOT_CONFIGURED |
| TC-ELAND-017 | Labour cost | NOT_CONFIGURED |
| TC-ELAND-018 | Overhead (MOH) | NOT_CONFIGURED |
| TC-ELAND-019 | Drum cost | NOT_CONFIGURED |
| TC-ELAND-020 | Selling price (costing run) | NULL / NOT_CONFIGURED |

Increment 12 selling price tests remain in `increment12.pricing.test.ts` — separate boundary.

---

## 5. Cross-Cable Comparison Table

| Parameter | 10009487 | 10009546 | 10010347 | 10010439 |
|---|---:|---:|---:|---:|
| Conductor | Cu | Cu | Al | Cu |
| CU kg/km | 135.23 | 8,217.45 | 0 | 3,700.36 |
| AL kg/km | 0 | 0 | 788.83 | 0 |
| Scrap type | Static 1% | Static 1% | Dynamic | Dynamic |
| BOM lines | 8 | 16 | 17 | 17 |
| Material EUR/km | 2,237.03 | 113,923.71 | 6,578.34 | 58,454.95 |
| Ex-work EUR/km | 2,379.82 | 121,195.43 | 6,998.24 | 62,186.12 |
| Ex-work uplift | 6.0% | 6.0% | 6.0% | 6.0% |
| Forensic DAP/km | 3,280.82 | 123,897.19 | 7,999.21 | 63,585.05 |
| Workbook DAP/km | — | — | — | — |

---

## 6. Regression Requirements

Before and after Stage B:

| Suite | Must pass |
|---|---|
| increment4.readiness.test.ts | ✅ |
| increment5.governance.test.ts | ✅ |
| increment6.approval.test.ts | ✅ |
| increment7.workbench.test.ts | ✅ |
| increment8.bom.test.ts | ✅ |
| increment9.price.test.ts | ✅ |
| increment10.costing.test.ts | ✅ |
| increment11.commercial.test.ts | ✅ |
| increment12.pricing.test.ts | ✅ |
| costingEngine.test.ts | ✅ |
| New eland.costing.test.ts | Per matrix above |

---

## 7. Test Implementation Plan (Stage B)

Proposed file: `src/server/eland.costing.test.ts`

Structure:
1. Seed governed BOM from Excel Standard Qty (fixture JSON, not production data mutation)
2. Seed approved prices at workbook EUR/kg equivalents OR mark EXPECTED_DIFFERENCE for FX path
3. Run costing for each cable with `{ currency: 'EUR', lengthMeters: 1000, quantity: 1 }`
4. Assert material totals against workbook K28/K32
5. Assert explicit NOT_CONFIGURED for process/drum/selling
6. Document REQUIRES_RECONCILIATION for ex-work, shipping, per-cable DAP

**Do not modify increment10 tests to match Excel** — if conflict arises, STOP and document.
