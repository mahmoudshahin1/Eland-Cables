# Increment 13 — Costing Rule Discovery

> **Stage A — Discovery only. No engine implementation.**  
> Date: 2026-08-21  
> Status: **ANALYSIS COMPLETE — AWAITING REVIEW**

This document distinguishes:

| Label | Meaning |
|---|---|
| **SOURCE DATA** | Values/formulas found in company workbooks or official master extracts |
| **EXISTING BUSINESS RULE** | Already enforced in application code or governed workflow |
| **SYSTEM IMPLEMENTATION** | What the platform calculates/persists today |
| **UNRESOLVED BUSINESS QUESTION** | Ambiguity that blocks automatic encoding |

---

## 1. Source files inspected

### 1.1 Official ENERGYA master extracts (present in repo)

| File | Location | Role |
|---|---|---|
| `Energya Cable Master Data.xlsx` | `data/source/`, `public/source/` | Cable List + Cable Materials (BOM consumption kg/km) |
| `Raw Material List.xlsx` | same | RM codes, descriptions, UOM — **all prices blank** |
| `Drum List.xlsx` | same | Drum dimensions/capacity — **no cost column** |

**SOURCE DATA findings:**

- BOM consumption is **kg/km** (`Weight` column on Cable Materials sheet).
- ~432 cables, ~4,986 BOM rows, ~81 duplicate weight conflict groups (documented in `docs/BOM_DUPLICATE_GROUPS.json`).
- **No scrap column** in the official Cable Materials extract.
- **No process cost table** in official extracts.
- **No incoterm cost table** in official extracts.
- **No exchange rate table** in official extracts.

### 1.2 ELAND costing workbook (documented, **not in repository**)

| File | Status |
|---|---|
| `ELAND_Cost_Sheet_Required.xlsx` | Referenced in `docs/ELAND_COSTING_RECONCILIATION.md`, `docs/ELAND_COSTING_RULES.md` — **not checked into repo** |

Forensic analysis of this workbook (via prior openpyxl inspection) is the richest source for company costing methodology. All ELAND-specific rules below cite that workbook unless marked otherwise.

### 1.3 Application documentation (secondary evidence)

- `docs/ELAND_COSTING_RULES.md` — classified rule register (RULE-M*, P*, S*, E*, H*)
- `docs/ELAND_COSTING_RECONCILIATION.md` — formula reconciliation vs workbook cells
- `docs/COSTING_MATERIAL_COST.md` — Increment 10 implemented formula
- `docs/COSTING_ENGINE_ARCHITECTURE.md` — current engine boundaries

---

## 2. Existing costing method

### 2.1 SOURCE DATA — ELAND workbook method (4 cable samples)

Conceptual pipeline proven in workbook:

```
Standard BOM consumption (kg/km)
  → Scrap-adjusted consumption
  → RM unit price (LE/kg, built from LME/FX/premiums)
  → Line cost (LE and EUR)
  → Material total (EUR/km)
  → Ex-work uplift (÷ (1 − 6%))
  → Shipping (container + insurance for DAP)
  → DAP grand total (aggregate only)
```

**Verified aggregate totals (workbook):**

| Metric | Workbook value | Status |
|---|---:|---|
| Material total EUR | 181,194.03 | ✅ SOURCE DATA |
| Ex-work total EUR | 192,759.61 | ✅ SOURCE DATA |
| Shipping total EUR | 3,603.09 | ✅ SOURCE DATA |
| DAP grand total EUR | 196,362.70 | ✅ SOURCE DATA |

### 2.2 EXISTING BUSINESS RULE — Increment 10 platform method

**SYSTEM IMPLEMENTATION** (`src/domain/costingEngine.ts`):

```
lengthKm = lengthMeters / 1000
totalConsumption = consumptionPerKm × lengthKm × quantity
lineCost = totalConsumption × approvedUnitPrice
materialCost = Σ lineCost
```

**Gates (must all pass):** Engineering APPROVED → BOM conflicts resolved → RM exists → approved price valid for date/UOM/currency.

**Explicitly NOT calculated (by design):**

- Scrap adjustment
- Process / labour / machine / energy
- Overhead (MOH)
- Drum/packing
- FX conversion (fails on currency mismatch)
- Incoterm / logistics
- Ex-work uplift
- Manufacturing total (`manufacturingCost = null`)
- Selling price (Increment 12 commercial pricing — separate layer)

**Status fields always set:** `processCostStatus`, `overheadCostStatus`, `scrapCostStatus` = `NOT_CONFIGURED`; run status = `INCOMPLETE`.

### 2.3 Gap summary

| Layer | ELAND workbook | Increment 10 today |
|---|---|---|
| Material (no scrap) | Partial (uses scrap) | ✅ Implemented |
| Scrap | ✅ Multiple methods | ❌ Not applied |
| RM price build-up (LME+additive+FX) | ✅ Per-material formulas | ❌ Uses governed `RawMaterialPrice` only |
| FX conversion | ✅ EUR/USD/EGP | ❌ Fail-closed on mismatch |
| Ex-work 6% | ✅ In workbook | ❌ Not implemented |
| Shipping / insurance | ✅ DAP logic | ❌ Not implemented |
| Process cost | ❌ Not in workbook | ❌ NOT_CONFIGURED |
| Overhead | Zero in workbook | ❌ NOT_CONFIGURED |
| Drum cost | `#REF!` in workbook | ❌ NOT_CONFIGURED |

---

## 3. Material costing method

### RULE-M001 — Consumption basis ✅ SOURCE DATA + SYSTEM IMPLEMENTATION

```
StandardConsumption = BOM quantity per km (kg/km)
```

- **SOURCE DATA:** ELAND cable sheets column E; ENERGYA `Cable Materials` Weight column.
- **SYSTEM IMPLEMENTATION:** `GovernedBomLine.consumptionPerKm` (preferred) or `CableBomLine.consumptionPerKm`.

### RULE-M002 — Scrap-adjusted consumption ✅ SOURCE DATA / ❌ NOT IMPLEMENTED

```
AdjustedConsumption = StandardConsumption × (1 + ScrapPercentage)
Excel equivalent: G = E + (E × F)
```

- **SOURCE DATA:** Cable 1 CR01: 135.23 × 1.01 = 136.5823 ✅ verified.
- **SYSTEM IMPLEMENTATION:** `GovernedBomLine.scrapPercentage` exists in schema but **is never read** by `costingEngine.ts`.
- **UNRESOLVED:** Scrap percentage source varies by cable/material (see Section 5).

### RULE-M003 – M005 — Line and material totals ✅ SOURCE DATA / ⚠️ PARTIAL IMPLEMENTATION

ELAND uses LE/kg intermediate currency and EUR output via FX division.

- **SYSTEM IMPLEMENTATION:** Single-currency line cost only; no LE/EUR dual ledger.
- **UNRESOLVED:** Whether inquiry costing should output EUR, inquiry currency, or both.

---

## 4. Copper / aluminium / raw material pricing

### 4.1 SOURCE DATA — ELAND Materials List patterns

| Pattern | Example RM | Formula (workbook) | Status |
|---|---|---|---|
| USD copper LE/kg | CR01 | `=(LME_USD+505+50)*(1+B3)*USD_EGP/1000` | 🛑 UNRESOLVED constants 505, 50 |
| USD aluminium LE/kg | AR01 | `=(LME_Al_USD+725+50)*USD_EGP/1000` | 🛑 UNRESOLVED constants 725, 50 |
| EUR → LE/kg | HB02 | `=Base_EUR*EUR_EGP/1000` | ✅ SOURCE DATA |
| LE-native | TP01 | `=Base_LE/1000` | ✅ SOURCE DATA |
| Premium multipliers | YN01, AFD155, WS* | Per-material `×1.05`, `×1.1` | 🔶 PROBABLE, not generalized |
| LME transfer rate | Summary D8 | Converts LME base to USD basis | 🔶 PROBABLE |

**Workbook FX rates (sample date 2026-08-19):**

| Pair | Rate | Cell |
|---|---:|---|
| USD/EGP | 50.6581 | K5 / F3 |
| EUR/EGP | 58.6164 | K6 / E4 |
| GBP/EGP | 68.51 | K7 |

### 4.2 EXISTING BUSINESS RULE — Raw Material Price Governance

**SYSTEM IMPLEMENTATION** (`rawMaterialPriceGovernanceService.ts`):

- Only **APPROVED** prices used.
- Price must match: RM code, currency, UOM, basis, costing date window.
- **No FX conversion** — currency mismatch → `PRICE_CURRENCY_MISMATCH`.
- **No LME build-up** — price must be stored as approved `RawMaterialPrice` record.

**SOURCE DATA gap:** Official `Raw Material List.xlsx` has **74 materials, all prices blank** → all would be `PRICE_NOT_CONFIGURED` until governed prices are entered.

### 4.3 Inquiry-level metal prices

**SYSTEM IMPLEMENTATION (UI/metadata only):**

- Inquiry header fields `copperPriceRate`, `aluminiumPriceRate` exist in UI manifest and `commercialMetadata` JSON (Increment 12).
- **Not consumed** by `costingEngine.ts`.
- Mock prototype values in `src/data/mockData.ts` — **not governed**.

**UNRESOLVED BUSINESS QUESTION:**

> When inquiry provides copper/aluminium price, does it **replace** RM master price, **override LME base only**, or **apply only to specific RM codes** (CR01, AR01)? Workbook suggests build-up from LME + additives — not a simple override.

---

## 5. Scrap methodology

### 5.1 SOURCE DATA

| Rule ID | Method | Evidence | Scope |
|---|---|---|---|
| RULE-S001 | Static 1% | Materials List col I = 0.01; cables 1–2 F = 0.01 | Sample LV cables only |
| RULE-S002 | Dynamic MV formulas | R-column references: `40/(OrderQty×1)`, `110/(OrderQty×1)`, `150/(SUM insulation)/(...)`, `30/P6`, `2/CuttingLength+0.2%`, `0.4%+0.2%` | Cables 3–4 (MV) |

**Dimensions observed in workbook:**

- Material class (conductor, insulation, sheathing, testing)
- Order quantity
- Cutting length (testing scrap)
- Cable-specific production parameters (P6, insulation kg sums)

**NOT observed as global rules:**

- Single company-wide scrap %
- Scrap by cable family alone (without material class)
- Scrap by plant/organization

### 5.2 EXISTING BUSINESS RULE

- `CableBomLine.scrap` column exists (Increment 2 migration) — **not used in costing**.
- `GovernedBomLine.scrapPercentage` — **not used in costing**.
- `CostComponentType.SCRAP` enum exists — **no engine logic**.

### 5.3 UNRESOLVED BUSINESS QUESTIONS

1. Is 1% scrap a **global default** or **LV-sample-only** rule?
2. Are dynamic MV formulas **approved templates** or **engineering study placeholders**?
3. Should scrap apply at **BOM line level**, **material master level**, or **policy table level**?
4. How does scrap interact with **cutting length** vs **order quantity** (both appear in MV formulas)?

**Recommendation:** Do not auto-publish a global 1% scrap rule. Require explicit `ScrapRule` configuration with scope dimensions and approval.

---

## 6. BOM consumption methodology

### SOURCE DATA

- Consumption unit: **kg per km** (ENERGYA extract + ELAND sheets).
- Material cost line = consumption × price (after scrap adjustment in ELAND).

### EXISTING BUSINESS RULE

1. Import source BOM → `CableBomLine`.
2. Duplicate weights → `BomDuplicateObservation` conflict register (~81 groups).
3. Technical Office resolves → `GovernedBomLine` (APPROVED).
4. Costing **prefers governed BOM**; blocks on unresolved conflicts.

### SYSTEM IMPLEMENTATION

- Costing uses governed BOM lines when approved; falls back to source BOM only if no governed lines (with conflict check).
- Does **not** average conflicting BOMs.
- Does **not** use unapproved BOM for production costing.

**No change required to BOM governance architecture for Increment 13.** Engine must **consume** it, not replace it.

---

## 7. Process costs

### SOURCE DATA

**Not present** in ELAND costing workbook at analyzed revision:

- Extrusion, stranding, armouring, labour, machine rates = NOT_CONFIGURED
- Summary MOH / Finance / G&A rows = **zero**

### EXISTING BUSINESS RULE

Increment 10 explicitly excludes process cost formulas. `processCostStatus = NOT_CONFIGURED`.

### UNRESOLVED

If Increment 13 adds process costs, **no SOURCE DATA** currently validates any rate. All process cost rules must start as **unpublished configuration** until costing team enters approved values.

---

## 8. Overhead

### SOURCE DATA

Workbook Summary K8–K10 = 0. Ex-work uplift (6%) is **not labeled as overhead** but mathematically resembles margin on ex-work price.

### EXISTING BUSINESS RULE

`overheadCostStatus = NOT_CONFIGURED`.

### UNRESOLVED BUSINESS QUESTION (RULE-E001)

```
ExWork = MaterialCost / (1 − 0.06)
```

- **SOURCE DATA:** Verified for all 4 sample cables.
- **Boundary conflict:** Identical to 6% gross margin on ex-work — overlaps Increment 12 **commercial pricing**, not manufacturing cost.
- **Decision required:** Costing layer vs commercial pricing layer.

---

## 9. Drum / packing

### SOURCE DATA

- `Drum List.xlsx`: dimensions only, **no cost**.
- ELAND workbook: drum/reel references show `#REF!` — **NOT_CONFIGURED**.

### EXISTING BUSINESS RULE

Drum selection exists in inquiry UI (`drumType` on lines) but no governed drum cost master.

### SYSTEM IMPLEMENTATION

Must return `DRUM_COST_NOT_CONFIGURED` until drum cost rules exist. **Do not invent drum costs.**

---

## 10. Incoterm methodology

### 10.1 SOURCE DATA — ELAND Summary

| Field | Value |
|---|---|
| Incoterm | DAP |
| Destination | Doncaster |
| Container | 1 × 40' ST @ USD 3,500 |

**Shipping formulas (workbook-proven):**

```
ContainerCost_EUR = ContainerQty × (3500_USD / TransferRate)
Insurance = ExWorkTotal × 0.003          (DAP only)
TotalShipping = ContainerCost + Insurance (DAP)
              = ContainerCost             (FOB / EX WORK)
DAPGrandTotal = ExWorkTotal + TotalShipping
```

Incoterm **determines which components apply** — it is not itself a monetary rate.

### 10.2 EXISTING BUSINESS RULE

- `CommercialInquiry.incoterms` stored (default `FOB`).
- Customer master may have `defaultIncoterm`.
- **Not used** in costing calculation today.

### 10.3 UNRESOLVED BUSINESS QUESTIONS

| ID | Question |
|---|---|
| RULE-H004 | Per-cable DAP allocation — forensic report values **cannot be reproduced** from workbook (aggregate only) |
| Container rate | Where is USD 3,500 governed? Not in application |
| Destination scope | Is Doncaster-specific logic required or configurable by country/city? |
| FOB vs DAP | Workbook has IF logic — needs IncotermRule configuration, not hard-coding |

---

## 11. Currency / exchange rate treatment

### SOURCE DATA

- Multiple FX pairs on ELAND Summary (USD/EGP, EUR/EGP, GBP/EGP).
- Transfer rate D8 converts container USD cost to EUR.
- Material prices built in LE, converted to EUR via `UnitPrice_LE / EUR_EGP`.

### EXISTING BUSINESS RULE

- Costing engine: **no FX conversion**; fails closed on currency mismatch.
- Inquiry supports `currency`, `commercialMetadata` for exchange rates — **UI/metadata only**.

### UNRESOLVED

1. Are inquiry-level exchange rates **authoritative** over master FX table?
2. Should FX be a **CostingConfiguration** rule or **inquiry input snapshot**?
3. Multi-step conversion (LE → EUR → inquiry currency) needs explicit trace — never silent conversion.

---

## 12. Cutting length treatment

### SOURCE DATA

- MV scrap formula includes `2/CuttingLength + 0.2%` (testing scrap).
- Workbook order quantity appears in dynamic scrap denominators.

### EXISTING BUSINESS RULE

- `CommercialInquiryLine.requestedLengthMeters` — persisted.
- `CommercialInquiryLine.cuttingLengthMeters` — optional field exists.
- Increment 10 uses `lengthMeters` parameter (default 1000) in costing request.

### SYSTEM IMPLEMENTATION

```
totalConsumption = consumptionPerKm × (lengthMeters/1000) × quantity
```

**UNRESOLVED:** Relationship between `cuttingLengthMeters`, `requestedLengthMeters`, and `quantity` in company methodology — ELAND MV scrap uses both order qty and cutting length differently. Must be configurable, not assumed as `Qty × CuttingLength`.

---

## 13. Minimum quantity / batch / fixed costs

### SOURCE DATA

No explicit minimum manufacturing quantity or batch fixed cost found in:

- Official ENERGYA extracts
- ELAND workbook (analyzed sections)
- Increment 10 engine

### UNRESOLVED

If such rules exist in other company documents not yet in repo, they must be added as configuration — **do not infer**.

---

## 14. Existing application architecture relevant to Increment 13

### 14.1 Increment 10 — Raw Material Costing Engine ✅ SHIPPED

| Component | Path |
|---|---|
| Domain | `src/domain/costingEngine.ts` |
| Repository | `src/server/costingRepository.ts` |
| Routes | `src/server/costingRoutes.ts` → `/api/costing/*` |
| Readiness | `governanceRepository.ts` → `evaluateCableCostingReadiness` |
| Snapshots | `CostingRun`, `CostingLine` |
| Tests | `src/server/increment10.costing.test.ts` (25 tests) |

### 14.2 Commercial integration ✅ PARTIAL

- `commercialRepository.addInquiryLine` auto-runs costing when Path A cable is `READY_FOR_COSTING`.
- Stores `materialCost`, `costingRunId`, `costingReadinessStatus` on inquiry line.
- Customer projection hides internal costs (`commercialProjection.ts`).

### 14.3 Increment 12 — Platform layers ✅ PARTIAL

| Area | Status |
|---|---|
| B1 Identity/RBAC/Security | Shipped (`increment12b1.*.test.ts`) |
| B2 Customer Master + isolation | Shipped (`increment12b2.*.test.ts`) |
| Commercial Pricing | Shipped (separate from costing) |
| Low-code Field Configuration (B3) | **Not started** — `CustomFieldDefinition` not in schema |
| Number Sequence engine | **Not in schema** — uses stamp+random generators |
| Inquiry UI + persistence | Increment 12 inquiry UI shipped (list/detail, API CRUD) |

### 14.4 Field visibility foundation ✅ PARTIAL

- `src/services/inquiryFieldManifest.ts` — static manifest + personal localStorage prefs.
- Not yet merged with admin-configurable field definitions.

---

## 15. Conflicts between source data and existing application

| # | Conflict | SOURCE DATA | EXISTING SYSTEM | Risk |
|---|---|---|---|---|
| C1 | Scrap | ELAND uses scrap-adjusted consumption | Engine ignores scrap | Under-costing if scrap added incorrectly |
| C2 | Price build-up | LME + additive + FX formulas | Governed flat RM price | Two pricing paradigms |
| C3 | Ex-work 6% | In ELAND workbook | Commercial pricing (Inc 12) | Double-counting margin |
| C4 | Currency | Multi-currency LE/EUR pipeline | Single-currency fail-closed | Cannot calculate ELAND scenario without FX rules |
| C5 | Incoterm shipping | DAP container + 0.3% insurance | String field only on inquiry | Missing logistics layer |
| C6 | ELAND workbook | Primary costing evidence | **Not in repo** | Cannot re-verify formulas in CI |

**Mandatory action:** Resolve C3 and C6 before encoding ex-work or ELAND-specific rules. Obtain governed copy of `ELAND_Cost_Sheet_Required.xlsx` or equivalent signed-off extract.

---

## 16. What must NOT be invented

The following must **not** be hard-coded without SOURCE DATA or approved configuration:

| Item | Reason |
|---|---|
| Global 1% scrap | Only confirmed for 2 LV sample cables |
| Copper additive 505 / 50 | RULE-P001 unresolved |
| Aluminium additive 725 / 50 | RULE-P002 unresolved |
| Ex-work 6% | Boundary conflict with commercial pricing |
| Container USD 3,500 | Not in governed master data |
| Insurance 0.3% | In workbook but needs IncotermRule governance |
| Process cost rates | Not in workbook |
| Overhead percentages | Zero in workbook |
| Drum costs | `#REF!` in workbook |
| Per-cable DAP split | Not reproducible from workbook |

---

## 17. Recommended configuration-required placeholders

Until business sign-off, the engine must block with explicit codes:

| Code | When |
|---|---|
| `SCRAP_RULE_NOT_CONFIGURED` | No applicable published scrap rule |
| `PRICE_BUILDUP_NOT_CONFIGURED` | LME-based price required but policy missing |
| `EXWORK_RULE_NOT_CONFIGURED` | Ex-work uplift requested but not approved as costing layer |
| `INCOTERM_RULE_NOT_CONFIGURED` | Incoterm selected, no published rule |
| `DESTINATION_REQUIRED` | Incoterm rule requires destination |
| `EXCHANGE_RATE_NOT_CONFIGURED` | Conversion needed, no rate |
| `DRUM_COST_NOT_CONFIGURED` | Drum required, no cost rule |
| `PROCESS_COST_NOT_CONFIGURED` | Process component requested, no rule |

---

## 18. Stage B encoding eligibility summary

| Rule group | Encode after approval? |
|---|---|
| Material consumption (RULE-M001) | ✅ Already implemented — extend, do not replace |
| Scrap static 1% (RULE-S001) | 🔶 Published ScrapRule only, scoped |
| Scrap dynamic MV (RULE-S002) | 🛑 ScrapPolicy templates need business decision |
| RM price build-up (RULE-P001–P006) | 🛑 Price governance design required |
| FX / currency (Summary FX) | 🔶 CurrencyConversionRule + inquiry snapshot |
| Ex-work uplift (RULE-E001) | 🛑 Costing vs commercial boundary decision |
| Shipping (RULE-H001–H003) | 🔶 IncotermRule + ShippingRate master |
| Per-cable DAP (RULE-H004) | ❌ Do not encode — unconfirmed |
| Process / overhead / drum | ❌ No source data — configuration shell only |

---

## 19. Discovery conclusion

1. **Increment 10 must be extended, not replaced.** It provides governed BOM + RM price + readiness + immutable snapshots.
2. **ELAND workbook is the richest SOURCE DATA** for scrap, FX, ex-work, and incoterm — but the file is **not in the repository** and several constants remain unresolved.
3. **Official ENERGYA extracts provide BOM and RM master** but not prices, scrap, process, incoterm, or drum costs.
4. **No fake values** may be used to make the UI show a cost. Missing rules → `COSTING_NOT_READY` with explicit reasons.
5. **Increment 13 requires a configuration/versioning plane** on top of Increment 10 domain services — formulas, scrap, process, incoterm, FX must be admin-configurable with safe parser, approval workflow, and simulation.

**Next step:** Review `docs/INCREMENT_13_IMPLEMENTATION_PLAN.md`. Do not begin Stage B implementation until approved.
