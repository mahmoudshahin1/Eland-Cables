# ELAND Costing Reconciliation Review

**Workbook:** `ELAND_Cost_Sheet_Required.xlsx`  
**Analysis date:** 2026-08-20  
**Method:** Direct workbook inspection via openpyxl (formulas + cached values). External forensic summary treated as secondary source.

---

## 1. Workbook Structure (Primary Evidence)

| Sheet | Purpose |
|---|---|
| `Summary` | Customer context, FX rates, cable rollup, ex-work totals, shipping, DAP aggregate |
| `Materials List` | Raw material master prices, scrap defaults, LE/kg unit costs |
| `1` | Cable **10009487** — Cu/XLPE/LSHF 0.6/1kV 1×16 mm² |
| `2` | Cable **10009546** — Cu/XLPE/LSHF 0.6/1kV 5×185 mm² |
| `3` | Cable **10010347** — Al/XLPE/MDPE 18/30kV CWs 1×300/25 mm² |
| `4` | Cable **10010439** — Cu/XLPE/MDPE 8.7/15kV CWs 1×400/35 mm² |

**Customer context (Summary):**

| Field | Value | Cell |
|---|---|---|
| Customer | ELAND | D21 |
| Incoterm / Destination | DAP — Doncaster | D22 |
| Output currency | Euro | H10 |
| FX date label | Central Bank of Egypt 19-08-2026 | J4 |
| USD/EGP | 50.6581 | K5 |
| EUR/EGP | 58.6164 | K6 |
| GBP/EGP | 68.51 | K7 |
| Transfer rate (to USD basis) | 1.157098… | D8 |
| Container | 1 × 40' ST | J25 |
| Container rate (USD) | 3,500 | (input to K25) |

---

## 2. Reported Values (Forensic + Workbook-Verified)

### 2.1 Per-cable material cost (EUR / km)

| Cable | Material No. | Forensic Report | Workbook (K column total) | Match |
|---|---|---:|---:|---|
| 1 | 10009487 | 2,237.03 | 2,237.032681897465 (`'1'!K28`) | ✅ |
| 2 | 10009546 | 113,923.71 | 113,923.70601095253 (`'2'!K32`) | ✅ |
| 3 | 10010347 | 6,578.34 | 6,578.344196385414 (`'3'!K32`) | ✅ |
| 4 | 10010439 | 58,454.95 | 58,454.94947123284 (`'4'!K32`) | ✅ |

### 2.2 Per-cable ex-work cost (EUR / km)

Formula on Summary: `ExWork = MaterialCost / (1 − 0.06)` (cell `I10 = 0.06`)

| Cable | Forensic Report | Workbook (Summary J) | Match |
|---|---:|---:|---|
| 1 | 2,379.82 | 2,379.82200201858 | ✅ |
| 2 | 121,195.43 | 121,195.43192654525 | ✅ |
| 3 | 6,998.24 | 6,998.238506792994 | ✅ |
| 4 | 62,186.12 | 62,186.11645875834 | ✅ |

### 2.3 Aggregate totals (Summary row 17–19)

| Metric | Forensic Report | Workbook | Match |
|---|---:|---:|---|
| Material total (EUR) | 181,194.03 (implied) | 181,194.03236046826 (`L17`) | ✅ |
| Ex-work total (EUR) | 192,759.61 | 192,759.60889411517 (`J17`) | ✅ |
| Shipping total (EUR) | — | 3,603.086730272467 (`J18`) | — |
| DAP grand total (EUR) | — | 196,362.69562438765 (`J19`) | — |

### 2.4 Per-cable DAP totals (forensic report only)

| Cable | Forensic DAP | Workbook per-cable DAP | Status |
|---|---:|---|---|
| 1 | 3,280.82 | **Not present** | ❌ REQUIRES_RECONCILIATION |
| 2 | 123,897.19 | **Not present** | ❌ REQUIRES_RECONCILIATION |
| 3 | 7,999.21 | **Not present** | ❌ REQUIRES_RECONCILIATION |
| 4 | 63,585.05 | **Not present** | ❌ REQUIRES_RECONCILIATION |

The workbook contains **only aggregate** DAP (`J19`). Per-cable DAP values from the forensic report cannot be reproduced from any formula in the file.

---

## 3. Known Formulas (Workbook-Proven)

### 3.1 Material line cost (cable sheets 1–4)

```
StandardQty           = E column (kg/km)
ScrapPct              = F column (from Materials List or dynamic R-column reference)
AdjustedConsumption   = E + (E × F)          [G column]
UnitPrice_LE          = VLOOKUP → Materials List col F
UnitPrice_EUR         = UnitPrice_LE / EuroRate   [I column; EuroRate = E4]
LineCost_LE           = AdjustedConsumption × UnitPrice_LE    [J column]
LineCost_EUR          = AdjustedConsumption × UnitPrice_EUR    [K column]
                      = I × G
MaterialTotal_EUR     = SUM(K lines)
MaterialTotal_LE      = SUM(J lines)
```

**Example — Cable 1, CR01 (row 9):**

| Field | Value | Formula |
|---|---:|---|
| Standard Qty | 135.23 kg/km | input |
| Scrap | 1% | Materials List |
| Adjusted Qty | 136.5823 kg/km | `=E9+(E9*F9)` |
| Unit Price LE | 760.8202 LE/kg | VLOOKUP |
| Unit Price EUR | 12.9796 EUR/kg | `=H9/$E$4` |
| Line Cost LE | 103,914.58 LE | `=G9*H9` |
| Line Cost EUR | 1,772.79 EUR | `=I9*G9` |

### 3.2 Raw material LE/kg price (Materials List)

Patterns vary by source currency:

| Pattern | Example | Formula |
|---|---|---|
| USD → LE/kg | CR01 | `=(D6+505+50)*(100%+B3)*$F$3/1000` |
| USD → LE/kg | AR01 | `=(D7+725+50)*1*$F$3/1000` |
| USD + premium | CuT02 | `=(D8+1200+50)*1*$F$3/1000` |
| EUR → LE/kg | HB02 | `=D11*$E$3/1000` |
| EUR + 10% | YN01 | `=(D14*$E$3*1.1)/1000` |
| USD + 5% | AFD155 | `=(D15*$F$3*1.05)/1000` |
| LE → LE/kg | TP01 | `=D9/1000` |

Where:
- `F3` = USD/EGP (50.6581)
- `E3` = EUR/EGP (58.6164)
- `B3` = 0 (no global scrap on price row)
- `D6/D7/D8` = LME/base metal USD converted via transfer rate D8

### 3.3 Ex-work uplift (Summary)

```
ExWorkUnit_EUR  = MaterialUnit_EUR / (1 − I10)     [I10 = 0.06]
ExWorkTotal     = ExWorkUnit × Qty                 [J column]
MaterialMargin  = ExWork − Material                [M column; always 6% of ex-work]
```

Verified: `2237.032681897465 / (1 − 0.06) = 2379.82200201858` ✅

### 3.4 Shipping (Summary, DAP destination)

```
ContainerCost_EUR = ContainerQty × (3500 / TransferRate)   [K25 = 3024.8079]
Insurance         = ExWorkTotal × 0.003                     [J17 × 0.003 = 578.28]
TotalShipping     = ContainerCost + Insurance               [L22/L23 = 3603.09 when DAP]
DAPGrandTotal     = ExWorkTotal + TotalShipping             [J19 = 196362.70]
```

Formula in L22: `=IF(D22="FOB",K22, IF(D22="EX WORK",K22, K22+(J17*0.003)))`

### 3.5 Dynamic scrap (MV cables 3 & 4)

Cable 3 example (sheet `3`, scrap study columns O–R):

| Component | Scrap formula (P column) | Applied to |
|---|---|---|
| Cu conductor | `=40/(P6*1)` → 0.04 | YN01, CR01 (via R9) |
| XLPE insulation | `=110/(P6*1)` → 0.11 | SC01, XL02 (via R10/R11) |
| XLPE compound scrap | `=150/(E15+E16+E17)/((P6/1000*1))` | WN35, WN65, etc. |
| Sheathing | `=30/P6` → 0.03 | PS03 (1% fixed) |
| Testing allowance | `=2/(Q6)+0.2%` → 0.004 | P26 |
| Other materials | `=0.4%+0.2%` → 0.006 | generic lines |

**Important:** Dynamic scrap is **material-specific and cable-specific**. It is not a single global rule.

---

## 4. Contradiction Register

### CONTRADICTION 1 — Cable 1 CR01 line cost 103,914 vs material total 2,237

| Item | Forensic claim | Workbook evidence | Classification |
|---|---|---|---|
| CR01 line cost | EUR 103,914.58 | **103,914.58 LE** (column J), **1,772.79 EUR** (column K) | **RESOLVED — CONFIRMED** |
| Qty basis | Ambiguous | **136.5823 kg/km** (not per 1000 m batch) | **CONFIRMED** |
| Price basis | Ambiguous | **760.82 LE/kg** (not EUR/ton) | **CONFIRMED** |

**Explanation:** The forensic report mixed **LE column J** with **EUR outcomes**. EUR line cost is column K. Dimensional basis is **kg/km × LE/kg → LE**, then **÷ EUR/EGP → EUR**.

**Evidence required to close:** None — resolved by direct cell inspection.

---

### CONTRADICTION 2 — Cable 2 CR01 line cost 6,314,522 vs material 113,923

| Item | Forensic claim | Workbook evidence | Classification |
|---|---|---|---|
| CR01 qty | 8,217.45 | 8,217.45 **kg/km** (E9) | **CONFIRMED** |
| CR01 line cost | EUR 6,314,522.35 | **6,314,522.35 LE** (J9), **107,726.21 EUR** (K9) | **RESOLVED — CONFIRMED** |
| Material total | EUR 113,923.71 | K32 = 113,923.70601095253 | **CONFIRMED** |

**Explanation:** Same LE/EUR column confusion as Contradiction 1. CR01 is ~94.8% of cable 2 material cost in EUR.

**Evidence required to close:** None — resolved.

---

### CONTRADICTION 3 — Material sum 181,194 vs reported 192,759

| Item | Value | Classification |
|---|---:|---|
| Sum of 4 material totals (L17) | 181,194.03 EUR | **CONFIRMED** |
| Ex-work total (J17) | 192,759.61 EUR | **CONFIRMED** |
| Difference | 11,565.58 EUR (= 6.00% of ex-work) | **CONFIRMED** |

**Explanation:** 192,759.61 is **not** a material sum — it is the **ex-work total** after applying `Material / (1 − 6%)`. The forensic report compared two different cost layers.

Formula: `181,194.032 × 1.063830 ≈ 192,759.61` ✅

**Evidence required to close:** None — resolved.

---

### CONTRADICTION 4 — Cable 1 ex-work 2,379.82 vs material 2,237.03 (Δ 142.79)

| Item | Workbook | Classification |
|---|---|---|
| Material | 2,237.032681897465 | **CONFIRMED** |
| Ex-work | 2,379.82200201858 | **CONFIRMED** |
| Difference | 142.789320121115 | **CONFIRMED** |
| Difference / Ex-work | 6.000% | **CONFIRMED** |

**Explanation:** The 142.79 EUR/km is **not** process, labour, overhead, or scrap. It is the **6% ex-work uplift** defined by Summary `I10` via `ExWork = Material / (1 − 0.06)`.

MOH, Finance, and G&A rows on cable sheets are all **zero** (K8=K9=K10=0 on Summary).

**Evidence required to close:** Business must confirm whether the 6% factor is a governed manufacturing margin, commercial markup, or legacy Excel constant before encoding in production.

Classification: **PROBABLE** (formula proven; business meaning **REQUIRES_BUSINESS_DECISION**).

---

### CONTRADICTION 5 — "Ex-work" composition

| Component | In ex-work formula? | Workbook proof | Classification |
|---|---|---|---|
| Raw material | ✅ Yes (base) | K28/K32 totals | **CONFIRMED** |
| Scrap | ✅ Yes (in material) | G = E×(1+F) | **CONFIRMED** |
| 6% uplift | ✅ Yes | Summary I13 = K13/(1−I10) | **PROBABLE** |
| MOH / Operation Exp. | ❌ Zero | K8=0, cable MOH rows = 0 | **CONFIRMED (excluded)** |
| Finance cost | ❌ Zero | K9=0 | **CONFIRMED (excluded)** |
| G&A / Marketing | ❌ Zero | K10=0 | **CONFIRMED (excluded)** |
| Process / labour / machine / energy | ❌ Not present | No rows | **NOT_CONFIGURED** |
| Drum / packaging | ❌ Broken | `#REF!` VLOOKUPs, qty=0 | **NOT_CONFIGURED** |

**Explanation:** At this workbook revision, "ex-work" = **material cost + 6% factor only**.

---

### CONTRADICTION 6 — Shipping formula and per-cable DAP

| Item | Forensic claim | Workbook evidence | Classification |
|---|---|---|---|
| Container / conversion | ContainerRate / ConversionRate | K25 = 3500/D8 = 3024.81 EUR | **CONFIRMED** |
| Insurance 0.3% | ExWork × 0.3% | J17 × 0.003 = 578.28 | **CONFIRMED** |
| Total shipping | — | 3,603.09 EUR | **CONFIRMED** |
| Per-cable DAP | 3,280 / 123,897 / 7,999 / 63,585 | **Not in workbook** | **UNCONFIRMED** |

**Proposed explanations for per-cable DAP (not proven):**

1. **Proportional by ex-work value** — does NOT match reported values (e.g. cable 1 calc ≈ 2,424 vs reported 3,280).
2. **Equal split of shipping** — does NOT match (would be ~49,091 per cable).
3. **Weight-based allocation** — does NOT match reported values closely.

**Evidence required:** Business must supply the allocation rule for per-cable DAP or confirm the forensic DAP values came from outside this workbook.

---

## 5. Master Data Reconciliation (Application vs Workbook)

| Check | Cable 10009487 | Status |
|---|---|---|
| Cable exists in CableMaster | Yes (mock/seed data) | ✅ |
| Engineering mapping APPROVED | PARTIAL (433/433 partial in report) | ⚠️ MASTER_DATA_MISMATCH |
| BOM consumption CR01 | 135.23 kg/km (matches Excel E9) | ✅ |
| BOM material codes | Excel uses HF30/HF27; seed uses LH02 for some lines | ⚠️ MASTER_DATA_MISMATCH |
| Raw material prices configured | Not seeded at ELAND EUR/LE rates | ❌ PRICE_NOT_CONFIGURED |
| FX rates in application | Not modeled in costing engine | ❌ NOT_IMPLEMENTED |
| Scrap policy | 1% in Excel; GovernedBomLine.scrapPercentage nullable | ⚠️ NOT_CONFIGURED |

All four ELAND cables exist in `docs/ENGINEERING_MAPPING_REPORT.json` but mapping status is **PARTIAL** for each — costing readiness Gate 1 would block calculation today.

---

## 6. Final Classification Summary

| Rule / Data Element | Classification |
|---|---|
| Consumption basis = kg/km | **CONFIRMED** |
| Scrap on consumption: `Adj = Std × (1 + ScrapPct)` | **CONFIRMED** |
| Static 1% scrap (LV cables 1–2) | **CONFIRMED** (for these samples) |
| Dynamic scrap (MV cables 3–4) | **PROBABLE** (formula visible; not generalized) |
| Material line cost = AdjQty × UnitPrice | **CONFIRMED** |
| Dual-currency: LE intermediate, EUR output | **CONFIRMED** |
| EUR price = LE price / EUR/EGP | **CONFIRMED** |
| Material totals (4 cables) | **CONFIRMED** |
| Ex-work = Material / (1 − 6%) | **PROBABLE** (formula proven; business label pending) |
| MOH / Finance / G&A in ex-work | **CONTRADICTORY** with forensic "process cost" assumption — proven **zero** |
| Aggregate shipping formula | **CONFIRMED** |
| Per-cable DAP totals from forensic report | **UNCONFIRMED** |
| Per-cable shipping allocation | **REQUIRES_BUSINESS_DECISION** |
| 6% factor business meaning | **REQUIRES_BUSINESS_DECISION** |
| Drum costing | **NOT_CONFIGURED** |
| Process / labour / machine / energy | **NOT_CONFIGURED** |
| LME/additive price build-up (505, 725, 1200, etc.) | **REQUIRES_BUSINESS_DECISION** |
| FX rate date 19-08-2026 as default | **UNCONFIRMED** (sample only) |

---

## 7. Recommendations

1. **Do not encode** per-cable DAP values until allocation rule is confirmed.
2. **Do not encode** the 6% ex-work factor as manufacturing cost without Finance approval — it behaves as **gross margin math** (`cost / (1 − margin)`), overlapping Increment 12 commercial pricing boundary.
3. **Treat LE column costs as internal** — application should expose EUR (or requested currency) with explicit FX audit trail.
4. **Implement scrap as governed policy** — static 1% for LV is sample-specific; MV dynamic scrap requires engineering-approved formulas per material class.
5. **Preserve Increment 10 engine** for material cost — extend with optional layers (FX, scrap, shipping) rather than replace.

**Stage B must not begin until business decisions in Section 6 are approved.**
