# ELAND Costing — Existing Application Architecture Review

**Scope:** Increment 10 costing engine as implemented in Energya Connect (through Increment 12 commercial pricing boundary).  
**Purpose:** Baseline for Excel reconciliation and controlled Stage B extension.  
**Date:** 2026-08-20

---

## 1. Architecture Overview

```
┌─────────────────────────────────────────────────────────────────┐
│  UI: TechnicalOfficeCostingWorkbench                            │
│  UI: MasterDataReadinessPanel (4-gate status)                   │
└───────────────────────────┬─────────────────────────────────────┘
                            │ HTTP
┌───────────────────────────▼─────────────────────────────────────┐
│  API: /api/costing/*  (costingRoutes.ts)                        │
│  API: /api/master/costing-readiness/* (governanceRepository)    │
└───────────────────────────┬─────────────────────────────────────┘
                            │
┌───────────────────────────▼─────────────────────────────────────┐
│  Repository: costingRepository.ts                               │
│  - Loads CostingContext from PostgreSQL                         │
│  - Persists immutable CostingRun + CostingLine                  │
│  - AuditEvent + appendAudit                                     │
└───────────────────────────┬─────────────────────────────────────┘
                            │
┌───────────────────────────▼─────────────────────────────────────┐
│  Domain: costingEngine.ts                                       │
│  - validateCostingRequestInputs                                 │
│  - evaluateCostingGates (4-gate readiness)                      │
│  - calculateMaterialLineCost                                    │
│  - calculateCableManufacturingCost                              │
└───────────────────────────┬─────────────────────────────────────┘
                            │
┌───────────────────────────▼─────────────────────────────────────┐
│  Price governance: rawMaterialPriceGovernanceService.ts         │
│  - getValidRawMaterialPrice (selection only, no FX)             │
└─────────────────────────────────────────────────────────────────┘
```

**Commercial pricing (Increment 12)** is a **separate layer** (`commercialPricingEngine.ts`) and must not be merged into material costing.

---

## 2. Current Costing Inputs

| Input | Source | Default | Notes |
|---|---|---|---|
| `materialNumber` | CostingRequest | required | CableMaster.materialNumber |
| `costingDate` | CostingRequest | today | Used for price validity |
| `quantity` | CostingRequest | 1 | Multiplier on total consumption |
| `lengthMeters` | CostingRequest | 1000 | Converts per-km BOM to total |
| `currency` | CostingRequest | USD | Must match approved price currency |

**Not supported today:**

- Customer ID / ELAND context
- Incoterm / destination
- Container / shipping inputs
- Exchange rate date or cross-currency conversion
- Order quantity in meters as explicit commercial context

---

## 3. Current Formulas

### 3.1 Total consumption

```
lengthKm       = lengthMeters / 1000
totalConsumption = consumptionPerKm × lengthKm × quantity
```

BOM `consumption` is treated as **per km** (matches Excel Standard Qty column).

### 3.2 Line cost

```
IF consumptionUom = kg AND priceUom = ton AND priceBasis = PER_TON:
    effectiveUnitPrice = price / 1000
ELSE IF consumptionUom ≠ priceUom (case-insensitive):
    THROW COSTING_UOM_MISMATCH
ELSE:
    effectiveUnitPrice = price

lineCost = ROUND(totalConsumption × effectiveUnitPrice, 2)
materialCost = SUM(lineCost)
```

### 3.3 Explicitly NOT calculated

| Component | Status in engine |
|---|---|
| Scrap adjustment | `scrapCostStatus: NOT_CONFIGURED` — BOM scrap not applied |
| Process cost | `processCostStatus: NOT_CONFIGURED` |
| Overhead | `overheadCostStatus: NOT_CONFIGURED` |
| Manufacturing total | `manufacturingCost: null` |
| Shipping | Not present |
| Ex-work uplift / margin | Not present (Increment 12 handles selling price separately) |

---

## 4. UOM Handling

| Capability | Application | Excel ELAND |
|---|---|---|
| BOM consumption UOM | kg (expected) | kg/km |
| Price UOM | kg, ton, m, PCS, m2, KM | LE/kg (internal) |
| PER_TON → PER_KG | ✅ Allowed (/1000) | N/A (uses LE/kg) |
| PCS → KG, M2 → KG, etc. | ❌ Blocked | Not evidenced |
| Cross-UOM without rule | `COSTING_UOM_MISMATCH` | Multi-step via LE |

**Gap:** Excel always normalizes to **LE/kg** regardless of source currency (USD/EUR/LE). Application requires **exact currency match** and does not convert.

---

## 5. Price Basis Handling

`RawMaterialPrice.priceBasis` enum: `PER_KG`, `PER_TON`, `PER_METER`, `PER_PCS`, `PER_M2`.

Gate 4 calls `getValidRawMaterialPrice(code, date, line.uom, currency, 'PER_KG', prices)`.

Price selection criteria:
- workflowStatus = APPROVED
- currency match (strict)
- uom match
- priceBasis match
- effective date window

Missing price → `PRICE_NOT_CONFIGURED` (never zero).

---

## 6. Currency Handling

| Feature | Status |
|---|---|
| Multi-currency price records | ✅ Stored per RawMaterialPrice |
| Cross-currency conversion at costing | ❌ NOT_IMPLEMENTED |
| FX rate table | ❌ NOT_IMPLEMENTED |
| FX frozen in CostingRun | ❌ NOT_IMPLEMENTED |

Excel uses USD/EGP and EUR/EGP rates on Summary to build LE prices, then divides by EUR/EGP for EUR output.

---

## 7. Scrap Handling

| Layer | Application | Excel |
|---|---|---|
| `CableBomLine.scrap` | Nullable — not used in engine | Static 1% or dynamic |
| `GovernedBomLine.scrapPercentage` | Nullable — not used in engine | Applied in G column |
| `scrapCostStatus` on CostingRun | Always `NOT_CONFIGURED` | Scrap embedded in material qty |

**Gap:** Application calculates `totalConsumption = consumptionPerKm × lengthKm × quantity` **without** scrap multiplier.

---

## 8. CostingRun Snapshot Behavior

`CostingRun` (immutable on creation):

| Frozen field | Source |
|---|---|
| materialNumber, costingDate, currency, quantity, lengthMeters, lengthKm | Request |
| engineeringRevision, bomVersion | Context at calculation time |
| materialCost | Sum of CostingLines |
| process/overhead/scrap status | NOT_CONFIGURED |
| manufacturingCost | null |
| isCurrent | true (previous runs marked false) |

`CostingLine` per material:

| Frozen field | Source |
|---|---|
| consumptionPerKm, totalConsumption, consumptionUom | BOM + request |
| price, priceCurrency, priceUom, priceBasis, priceRevision, priceId | Approved price record |
| lineCost, calculationNotes | Domain calculation |

Recalculation (`recalculateCostingRun`) creates a **new** CostingRun; history preserved.

---

## 9. Four-Gate Costing Readiness

| Gate | Check | Error code |
|---|---|---|
| 1 — Engineering | CableEngineeringMapping APPROVED | ENGINEERING_NOT_APPROVED |
| 2 — BOM | No unresolved conflicts; approved BOM lines exist | BOM_CONFLICT_UNRESOLVED |
| 3 — Raw material | Each BOM code exists in RawMaterial | RAW_MATERIAL_NOT_FOUND |
| 4 — Price | Valid approved price for date/currency/uom | PRICE_NOT_CONFIGURED / EXPIRED / MISMATCH |

ELAND cables currently show **PARTIAL** engineering mapping — Gate 1 would block.

---

## 10. Existing Limitations (Relevant to ELAND)

1. **No scrap in material cost** — largest formula gap vs Excel.
2. **No FX conversion** — cannot reproduce LE→EUR price path.
3. **No additive price build-up** — Excel adds constants (505, 725, 1200) to LME before FX.
4. **No shipping layer** — Excel has governed container + insurance formula.
5. **No ex-work 6% factor** — intentionally outside Increment 10; overlaps commercial margin.
6. **Default currency USD** — ELAND workbook uses EUR output.
7. **BOM code mismatches** — e.g. seed data LH02 vs Excel HF30/HF27 for cable 10009487.

---

## 11. Excel vs Application — Difference Matrix

| Dimension | Excel ELAND | Application (Inc 10) | Reconciliation |
|---|---|---|---|
| Consumption unit | kg/km | kg/km (via lengthMeters) | ✅ Aligned |
| Scrap | 1% static or dynamic | Not applied | ❌ Gap |
| Price path | LME USD → LE/kg → EUR/kg | Direct approved price in request currency | ❌ Gap |
| Line cost currency | LE (internal), EUR (output) | Single request currency | ❌ Gap |
| Material total | SUM(EUR lines) | SUM(material lines) | ✅ Concept aligned |
| Ex-work | Material / 0.94 | Not calculated | ❌ By design (commercial layer) |
| Shipping | Container + 0.3% insurance | Not calculated | ❌ Gap |
| DAP per cable | Not in workbook | Not calculated | N/A |
| MOH/Finance/G&A | Zero | NOT_CONFIGURED | ✅ Aligned (both zero/unconfigured) |
| Drum | #REF! errors | NOT_CONFIGURED | ✅ Aligned |
| Process/labour | Not present | NOT_CONFIGURED | ✅ Aligned |
| Snapshot | Workbook (static file) | CostingRun DB | ✅ App adds governance |
| Selling price | Not in costing sheet | Increment 12 CommercialPricingSnapshot | ✅ Separate layer |

---

## 12. Key Source Files (Read-Only Baseline)

| File | Role |
|---|---|
| `src/domain/costingEngine.ts` | Core formulas |
| `src/domain/costingEngine.test.ts` | Unit tests |
| `src/server/costingRepository.ts` | Persistence + context loading |
| `src/server/costingRoutes.ts` | REST API |
| `src/server/governanceRepository.ts` | Readiness evaluation |
| `src/services/rawMaterialPriceGovernanceService.ts` | Price validation/selection |
| `src/server/increment10.costing.test.ts` | Integration tests |
| `prisma/schema.prisma` | CostingRun, CostingLine, GovernedBomLine, RawMaterialPrice |
| `docs/COSTING_ENGINE_SPECIFICATION.md` | Increment 10 spec |
| `docs/COMMERCIAL_COSTING_BOUNDARY.md` | Material vs selling price boundary |

---

## 13. Conclusion

The application provides a **governed, immutable raw-material costing foundation** that aligns with Excel on **consumption-per-km × unit price** conceptually, but **does not yet implement** scrap adjustment, multi-step FX price build-up, shipping, or ex-work uplift.

Stage B should **extend** `costingEngine.ts` with optional governed layers — not replace the Increment 10 engine or merge commercial pricing into material cost.
