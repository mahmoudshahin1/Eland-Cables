# Costing V2 — Locked Business Specification

**Status:** DECISIONS 1–4 LOCKED. DECISION 5 OPEN.  
**Authority:** This document is the Costing V2 Direct Raw Material Cost contract.  
**Do not start structural costing changes until Decision 5 is signed and a single controlled implementation prompt is issued.**

Technical engine state as of 28 Aug 2026 already implements Decisions 1–4 and **Option B** for Decision 5. Remaining workbook gaps (landed vs LME, list vs landed for some standard RMs) are commercial, not UOM defects.

---

## Purpose and freeze

Costing V2 in this specification means **Direct Raw Material Cost** only:

```text
Base Consumption × Applied Price  →  FX to inquiry header currency
```

No labour, process, overhead, scrap multiplier, packing (where classified as packing), margin, discount, or selling price.

**Freeze until Decision 5 is closed:**

- Do not add a new costing engine, currency system, or price system.
- Do not infer Copper/Aluminium from BOM-line flags or from descriptions at costing time.
- Do not add Premium / Shipping / Clearance into Direct RM unless Decision 5 is Option A.
- Do not approve additional Raw Material Prices as a substitute for a signed spec.
- Do not treat Costing V2 as production-ready until Decision 5 is signed and the 10009487 line-level reconciliation is accepted under that option.

---

## Decision 1 — Direct Raw Material Cost (LOCKED)

Direct RM Cost includes only BOM lines that are **direct raw materials**.

**Include**

- Market-metal consumption (Copper / Aluminium rods, etc.) priced per Decision 2.
- Standard raw-material consumption priced per Decision 3.

**Exclude from Direct RM Cost**

- Scrap (Decision 4).
- Packing / accessories classified as packing (for example A-ECAP10 end caps).
- Labour, overhead, energy, process, logistics, margin, discount, selling price.

**Formula**

```text
Line Cost = BOM consumption (for costing length) × Applied unit price (after UOM normalization)
Direct RM Cost = sum of included line costs, converted to inquiry header currency
```

**Not used**

```text
Base Consumption × (1 + Scrap %) × Applied Price
```

---

## Decision 2 — Copper / Aluminium (LOCKED)

Inquiry header metal prices are authoritative for market metals.

| Field | Rule |
|---|---|
| Copper Price | Inquiry header. Basis **USD/MT**. Display as `[amount] [USD/MT]`. |
| Aluminium Price | Inquiry header. Basis **USD/MT**. Display as `[amount] [USD/MT]`. |
| Missing copper when BOM has Copper market metal | Block: `INQUIRY_COPPER_PRICE_REQUIRED` |
| Missing aluminium when BOM has Aluminium market metal | Block: `INQUIRY_ALUMINIUM_PRICE_REQUIRED` |

Which BOM lines use which header price is **not** a costing-team flag on the BOM line and is **not** inferred from wording such as “Copper Rod” at calculation time.

**Source of truth: Raw Material Master classification** (Decision 2a).

| RM | Pricing Category | Metal Type | Applied price |
|---|---|---|---|
| CR01 | MARKET_METAL_COPPER | COPPER | Inquiry Copper Price (USD/MT), then normalize to BOM UOM |
| AR01 | MARKET_METAL_ALUMINIUM | ALUMINIUM | Inquiry Aluminium Price (USD/MT), then normalize to BOM UOM |

The CR01 / AR01 **master list price is ignored** for Direct RM Cost when classification is market metal.

Inquiry header currently stores **LME / base metal only** (Decision 5 Option B until changed).

---

## Decision 2a — Classification lives on Raw Material Master (LOCKED)

Do **not** maintain a generic “Copper RM” flag on every BOM line.

**Raw Material Master (minimum)**

| Field | Role |
|---|---|
| Material Code | Identity (CR01, AR01, HF27, …) |
| Description | Display only. Never used to price at costing time. |
| Pricing Category | `MARKET_METAL_COPPER` \| `MARKET_METAL_ALUMINIUM` \| `STANDARD_RAW_MATERIAL` |
| Metal Type | `COPPER` \| `ALUMINIUM` \| `NONE` (must match category) |
| Consumption / stock UOM | BOM consumption UOM (usually kg or PCS) |
| Active | Inactive RMs cannot be costed |

**Price UOM / Price Basis** lives on the **approved Raw Material Price** record (Decision 3), not as a silent default of kg.

**Engine rule**

```text
BOM line.rawMaterialCode
  → Raw Material Master.pricingCategory + metalType
      → MARKET_METAL_COPPER  → Inquiry Copper USD/MT
      → MARKET_METAL_ALUMINIUM → Inquiry Aluminium USD/MT
      → STANDARD_RAW_MATERIAL → approved Raw Material Price
```

**Import / suggestion vs costing**

- Code or description hints (CR01, “Copper Rod”) may **suggest** classification when creating or reviewing an RM.
- Costing **must** use the stored `pricingCategory` / `metalType` only.
- Accessories (end caps, tapes, PCS packing) must not be classified as Copper or Aluminium.

**Packing exclusion (principle locked; field may be refined later)**

Packing/accessories are excluded from Direct RM Cost because they are classified as packing (today: end-cap codes `A-EC*` / description END CAP). They remain `STANDARD_RAW_MATERIAL` / `metalType = NONE`. Do not convert PCS → kg. A dedicated packing flag/category may be added only after this spec is revised—not as an ad-hoc BOM-line toggle.

---

## Decision 3 — Other raw materials (LOCKED)

For `STANDARD_RAW_MATERIAL`:

- Use the **approved** Raw Material Price only.
- Price UOM / basis is explicit: **KG, MT, PCS, M** (ton/tonne/t → MT).
- Governed conversion only: **1 MT = 1000 kg**.
- PCS ↔ KG, M ↔ KG, and any other incompatible pair: **block** (`PRICE_UOM_INCOMPATIBLE`).
- Missing price UOM: **block** (`PRICE_UOM_REQUIRED`).
- No approved price: **block** (`PRICE_NOT_CONFIGURED`).
- Missing FX after UOM normalization: **block** (`FX_NOT_CONFIGURED`).

**Order**

```text
Raw price → Price basis → Normalize to BOM UOM → Line cost → Convert to inquiry currency
```

Do not apply FX to a price before UOM normalization.

Header currency is the costing result currency. Line currencies are converted onto that header; they do not override it.

---

## Decision 4 — Scrap (LOCKED)

Scrap is stored for manufacturing / future layers. It does **not** change Direct RM Cost.

| Family | Rate | Status |
|---|---|---|
| CU L.V | 1.50% | ACTIVE |
| CU M.V | — | UNDER_CREATION |
| AL M.V | — | UNDER_CREATION |

Governed BOM / scrap rules remain the storage. Direct RM continues:

```text
Base Consumption × Applied Price
```

---

## Decision 5 — Landed vs LME (OPEN — commercial)

This is the only major commercial decision still open. **Do not implement Option A until signed.**

### Option A — Landed cost

```text
Applied metal price = LME + Premium + Shipping + Clearance
```

Workbook CR01 example: 14,600 + 505 + 50 = **15,155 USD/MT**.

Implies inquiry header and/or governed landed components must carry those adders. Direct RM would then match workbook Summary more closely for metals.

### Option B — LME / base only (CURRENT APPLICATION)

```text
Applied metal price = Inquiry header Copper / Aluminium (LME or base)
```

Inquiry 14,600 USD/MT → 14.600 USD/kg. CR01: `135.23 × 14.600 = 1,974.36 USD`.

Workbook Direct Material ~2,571 USD includes landed metal plus some list vs landed differences on standard RMs (for example XL08 1,900 vs 1,700 USD/MT). That variance is **expected under Option B**, not a 1000× UOM error.

Premium / Shipping / Clearance fields may remain in data for a future landed layer. They must not be silently added to Direct RM while Option B is in force.

**Sign-off required**

| Choice | Applied Copper for 10009487 | Expected CR01 Direct RM (1 km) |
|---|---|---|
| A | 15,155 USD/MT | ~2,049.41 USD |
| B | 14,600 USD/MT | ~1,974.36 USD |

Until signed, treat Option B as the V2 Direct RM rule.

---

## Target costing flow (LOCKED)

```text
INQUIRY
   │
   ├── Currency = (header, e.g. USD)
   ├── Copper = 14,600 USD/MT
   └── Aluminium = 3,300 USD/MT
             │
             ▼
        CABLE / BOM
             │
             ▼
        Raw Material Master
        (pricingCategory + metalType)
             │
      ┌──────┴────────┐
      │               │
 Market Metal      Standard RM
      │               │
      ▼               ▼
 Inquiry Cu / Al    Approved RM Price
 (ignore RM master    (explicit Price UOM)
  metal list price)
      │               │
      └──────┬────────┘
             ▼
       UOM normalization
       (MT→kg governed; else compatible or BLOCK)
             │
             ▼
       Direct RM Cost
             │
             ├── Scrap = excluded
             ├── Packing = excluded
             └── FX → inquiry currency
             │
             ▼
      COSTING RESULT
```

---

## Current technical alignment (do not redesign)

Already aligned with this spec:

- RM master `pricingCategory` + `metalType` (not BOM-line copper flags).
- Inquiry header copper/aluminium USD/MT override for market metals.
- Explicit price UOM (KG/MT/PCS/M) and governed MT↔kg conversion.
- Direct RM = consumption × applied price; scrap stored, not multiplied.
- Packing end caps excluded from Direct RM; PCS not converted to kg.
- FX after line cost; header currency is the result currency.

**Not production-ready** until Decision 5 is signed and the costing team accepts the 10009487 reconciliation under that option.

---

## What a future implementation prompt may change

Only after Decision 5 is signed, and only in one prompt:

1. If Option A: define where Premium / Shipping / Clearance are entered (inquiry vs RM price vs landed-cost layer) and how they combine with USD/MT.
2. Optional: explicit packing category on RM master instead of end-cap code heuristics.
3. Optional: list-price vs landed for standard RMs (XL08, ML04) as a data/governance issue, not a new engine.

Until then: **no further structural costing work.**
