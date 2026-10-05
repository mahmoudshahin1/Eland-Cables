# ELAND Costing Rules — Classification Register

**Source:** `ELAND_Cost_Sheet_Required.xlsx` (primary), forensic summary (secondary).  
**Date:** 2026-08-20  
**Status:** Stage A analysis — no production encoding until approved.

Legend: ✅ CONFIRMED | 🔶 PROBABLE | ❓ UNCONFIRMED | ⚠️ CONTRADICTORY | 🛑 REQUIRES_BUSINESS_DECISION

---

## A. Material Cost Rules

### RULE-M001 — Consumption basis ✅ CONFIRMED

```
StandardConsumption = BOM quantity in kg/km (Excel column E "Standard Qty")
```

Evidence: All four cable sheets label E8 as consumption; values match known BOM weights (e.g. CR01 = 135.23 for 10009487).

---

### RULE-M002 — Scrap-adjusted consumption ✅ CONFIRMED

```
AdjustedConsumption = StandardConsumption × (1 + ScrapPercentage)
Excel: G = E + (E × F)
```

Evidence: Cable 1 CR01: 135.23 × 1.01 = 136.5823.

**Scope limitation:** Percentage source varies (see RULE-S001, RULE-S002). Do not globalize 1%.

---

### RULE-M003 — Line cost in local intermediate currency ✅ CONFIRMED

```
LineCost_LE = AdjustedConsumption × UnitPrice_LE
```

Evidence: Cable 1 CR01 J9 = G9 × H9 = 103,914.58 LE.

---

### RULE-M004 — EUR line cost via FX division ✅ CONFIRMED

```
UnitPrice_EUR = UnitPrice_LE / EUR_EGP_Rate
LineCost_EUR  = AdjustedConsumption × UnitPrice_EUR
             = LineCost_LE / EUR_EGP_Rate
```

Evidence: I9 = H9/E4; K9 = I9×G9. E4 = 58.6164.

---

### RULE-M005 — Material total ✅ CONFIRMED

```
MaterialCost_EUR = SUM(LineCost_EUR for all BOM lines)
```

Evidence: K28/K32 on each cable sheet equals SUM(K9:K27).

---

## B. Raw Material Price Rules

### RULE-P001 — USD copper LE/kg build-up 🛑 REQUIRES_BUSINESS_DECISION

```
UnitPrice_LE = (LME_USD_Converted + Additive_1 + Additive_2) × (1 + B3) × USD_EGP / 1000
```

Example CR01: `=(D6+505+50)*(100%+B3)*$F$3/1000` → 760.82 LE/kg.

**Unresolved:** Are 505 and 50 governed constants or sample placeholders?

---

### RULE-P002 — USD aluminum LE/kg build-up 🛑 REQUIRES_BUSINESS_DECISION

```
UnitPrice_LE = (LME_Al_USD + 725 + 50) × USD_EGP / 1000
```

Evidence: AR01 F7 formula.

---

### RULE-P003 — EUR material LE/kg ✅ CONFIRMED

```
UnitPrice_LE = Base_EUR × EUR_EGP / 1000
```

Example HB02: `=D11*$E$3/1000`.

---

### RULE-P004 — LE-native material ✅ CONFIRMED

```
UnitPrice_LE = Base_LE / 1000
```

Example TP01: `=D9/1000` → 12.6 LE/kg.

---

### RULE-P005 — Premium multipliers 🔶 PROBABLE

| Material | Multiplier | Formula |
|---|---|---|
| YN01 | ×1.1 | `(D14*$E$3*1.1)/1000` |
| AFD155/145 | ×1.05 | `(D15*$F$3*1.05)/1000` |
| WS03/WS01/WN* | ×1.1 | various |

**Not generalized** — each material has its own formula in Materials List.

---

### RULE-P006 — LME transfer rate 🔶 PROBABLE

```
LME_USD_Converted = LME_Base × TransferRate
TransferRate = IF output=USD, 1, IF GBP, GBP_EGP/USD_EGP, ELSE EUR_EGP/USD_EGP)
```

Evidence: Summary D8, D9, D10.

🛑 **Business decision:** Govern as ExchangeRatePolicy or keep in price build-up?

---

## C. Scrap Rules

### RULE-S001 — Static 1% scrap (LV) ✅ CONFIRMED (sample scope)

Materials List column I = 0.01 for most materials. Cables 1–2 F column = 0.01.

**Applies to:** Workbook samples 10009487, 10009546 only — not a global rule.

---

### RULE-S002 — Dynamic scrap (MV) 🔶 PROBABLE

Cable 3 & 4 use R-column references to scrap study (columns P–R):

| Scrap class | Formula pattern | Example value |
|---|---|---|
| Cu conductor | `40/(OrderQty×1)` | 0.04 → combined to 0.156 |
| XLPE insulation | `110/(OrderQty×1)` | 0.11 |
| XLPE compound | `150/(SUM insulation kg)/((P6/1000))` | 0.1777… |
| Sheathing | `30/P6` | 0.03 |
| Testing | `2/CuttingLength + 0.2%` | 0.004 |
| Generic other | `0.4% + 0.2%` | 0.006 |

🛑 **Business decision:** Approve as ScrapPolicy templates per material class?

---

## D. Ex-Work Rules

### RULE-E001 — Ex-work uplift 🔶 PROBABLE

```
ExWork_EUR = MaterialCost_EUR / (1 − 0.06)
```

Evidence: Summary I13 = K13/(100%-$I$10); I10 = 0.06. Ratio ex-work/material = 1.063830 for all cables.

⚠️ **Boundary warning:** This is mathematically identical to **6% gross margin on ex-work price**, not manufacturing cost. Overlaps Increment 12 commercial pricing.

🛑 **Business decision:** Is this a costing layer or a commercial margin?

---

### RULE-E002 — MOH / Finance / G&A ✅ CONFIRMED (excluded)

Summary K8=K9=K10=0. Cable sheet MOH/Finance/G&A rows compute zero.

**Ex-work does NOT include these at this workbook revision.**

---

## E. Shipping Rules

### RULE-H001 — Container cost EUR ✅ CONFIRMED

```
ContainerCost_EUR = ContainerQty × (3500_USD / TransferRate)
```

Evidence: K25 = 3500/D8 = 3024.8079 EUR.

🛑 **Business decision:** Where is 3500 USD stored? Not in application.

---

### RULE-H002 — Insurance ✅ CONFIRMED

```
Insurance = ExWorkTotal × 0.003
```

Evidence: L22 adds J17×0.003 when destination is DAP.

---

### RULE-H003 — Total shipping ✅ CONFIRMED

```
TotalShipping = ContainerCost + Insurance   (DAP)
              = ContainerCost               (FOB / EX WORK)
```

Evidence: L22 IF formula; L23 = L22 = 3603.09.

---

### RULE-H004 — Per-cable shipping allocation ❓ UNCONFIRMED

Forensic per-cable DAP values do not appear in workbook. No formula found.

🛑 **REQUIRES_BUSINESS_DECISION** before implementation.

---

## F. Rules Explicitly NOT in Workbook

| Rule | Status |
|---|---|
| Drum/reel cost | `#REF!` — NOT_CONFIGURED |
| Process/extrusion/stranding | NOT_CONFIGURED |
| Labour | NOT_CONFIGURED |
| Machine cost | NOT_CONFIGURED |
| Energy | NOT_CONFIGURED |
| Manufacturing overhead (MOH) | Zero — NOT_CONFIGURED |
| Selling price / customer discount | NOT in costing workbook |
| D365 integration | NOT in workbook |

---

## G. Application Mapping

| Excel concept | Application entity | Status |
|---|---|---|
| Material code | RawMaterial.code | ✅ Exists |
| Standard qty | GovernedBomLine.consumption | ✅ Exists |
| Scrap % | GovernedBomLine.scrapPercentage / ScrapPolicy (proposed) | ⚠️ Not applied |
| Unit price | RawMaterialPrice | ⚠️ Missing ELAND values |
| FX rate | Not modeled | ❌ NOT_IMPLEMENTED |
| Material cost | CostingRun.materialCost | ✅ Exists |
| Ex-work | Not modeled | ❌ NOT_IMPLEMENTED |
| Shipping | Not modeled | ❌ NOT_IMPLEMENTED |
| Customer context | CommercialInquiry (partial) | ⚠️ Not in costing |
| Costing snapshot | CostingRun + CostingLine | ✅ Exists |
| Selling price | CommercialPricingSnapshot (Inc 12) | ✅ Separate layer |

---

## H. Stage B Encoding Eligibility

| Rule ID | Encode in Stage B? |
|---|---|
| RULE-M001 – M005 | ✅ Yes (extend engine) |
| RULE-S001 | ✅ Yes (governed, LV sample only) |
| RULE-S002 | 🔶 Only after ScrapPolicy approval |
| RULE-P001 – P006 | 🛑 Only after price governance design |
| RULE-E001 | 🛑 Only after business boundary decision |
| RULE-H001 – H003 | 🔶 Only after ShippingRate master exists |
| RULE-H004 | ❌ No — unconfirmed |
| Drum/process/labour | ❌ No |
