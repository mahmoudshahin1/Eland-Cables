# Decision 5 — Metal price in Direct RM (one-pager for sign-off)

**Status:** OPEN. Decisions 1–4 are locked. Costing V2 Direct RM is **not production-ready** until this decision is signed and the **10009487** line-level reconciliation is accepted under the chosen option.  
**Sources:** `docs/COSTING_V2_BUSINESS_SPECIFICATION.md`, `src/domain/costingEngine.ts`, `src/domain/costingEngine.test.ts`, `src/components/costing/v3/panels/MetalCostComponentsPanel.tsx`, Prisma `CostingMetalCostComponent`.  
**This document does not implement Option A.** Engine and tests are unchanged.

---

## What is being decided

Direct RM Cost (this spec only) is:

```text
BOM consumption × Applied unit price  →  FX to inquiry header currency
```

**Market metals** (RM master `pricingCategory` = `MARKET_METAL_COPPER` / `MARKET_METAL_ALUMINIUM`) take Copper / Aluminium from the **inquiry header** (USD/MT, then UOM-normalized). The CR01 / AR01 **master list price is ignored**.

**Decision 5** is only: what number is that inquiry metal price?

| | Option B (current application) | Option A (proposed — not implemented) |
|---|---|---|
| Applied metal | Inquiry header Copper / Aluminium = **LME / base only** | **Landed** = LME + Premium + Shipping + Clearance |
| Spec formula | `Applied = inquiry header Cu/Al` | `Applied = LME + Premium + Shipping + Clearance` |
| Workbook CR01 example (spec) | 14,600 USD/MT | 14,600 + 505 + 50 = **15,155 USD/MT** (spec; Clearance not shown as a separate adder in that arithmetic) |

Premium / Shipping / Clearance **must not** enter Direct RM while Option B is in force.

---

## Confirmed numbers (from spec and unit tests)

**CR01 copper rod, 135.23 kg per km, 1 km, LME 14,600 USD/MT** (spec + `costingEngine.test.ts`):

| Path | Applied copper | CR01 Direct RM (1 km) | Source |
|---|---|---|---|
| Option B | 14,600 USD/MT → 14.600 USD/kg | **1,974.36 USD** | Spec; test `normalizes 14600 USD/MT…` (`135.23 × 14.6`) |
| Option A (spec expected) | 15,155 USD/MT | **~2,049.41 USD** | Spec sign-off table (not asserted in `costingEngine.test.ts`) |
| Scrap must not be applied | — | 1,974.36 ≠ 135.23 × 1.015 × 14.6 | Spec Decision 4; test `does not apply scrap…` |

**Full 10009487 Direct RM vs workbook (not a UOM bug):**

- Spec: workbook Direct Material **~2,571 USD** includes **landed metal** plus **list vs landed** on some **standard** RMs (example XL08 1,900 vs 1,700 USD/MT). Under Option B that gap is **expected**.
- Probe script `scripts/probeInquiryHeaderCurrencyCosting.ts` hard-codes workbook 10009487 **USD = 2,571.105…** (and LE/EGP/EUR/GBP workbook totals). That is a **workbook reference**, not an engine unit-test assertion of live app output.

**Not confirmed in tests (mark [NEEDS VERIFICATION]):**

- **2,500.58 USD** for 10009487 × 1000 m at 14,600 Cu — **not present** in `costingEngine.test.ts` or the probe workbook constants. Do not use it as a signed baseline until costing/reconciliation confirms it.
- Live app `materialCost` for 10009487 at header 14,600 — probe **compares** app vs workbook; this one-pager does not re-run the probe.

**Unit-test 10009487 total that is *not* the 14,600 header path:** `calculates multi-material total…` uses sample context **without** `inquiryMetalPricing`, so CR01 uses approved master **9.50 USD/kg** → CR01 1,284.69 + XL08 28.61 = **1,313.30 USD**. That proves multi-line summing, **not** Decision 5 LME vs landed.

---

## Option B — LME / base only (CURRENT)

### Behaviour (engine)

`calculateCableManufacturingCost` prices each BOM line via `resolveMaterialUnitPrice` (`inquiryMetalPricing` + approved RM prices). `CostingContext` has **no** `metalCostComponents` field. Inquiry metal type (`InquiryMetalPricing`) stores only header copper/aluminium amount, UOM, and currency — **no** Premium / Shipping / Clearance.

The Option B unit test **injects** unused landed rows (`PREMIUM 555`, `SHIPPING 80`, `CLEARANCE 40`) by casting onto context. Material cost stays **1,313.30**; CR01 line stays **1,284.69**. Extra fields are ignored.

### 10009487 reconciliation

- Market metal (e.g. CR01) should be priced at **header LME** (e.g. 14,600 → **1,974.36** USD for 135.23 kg/km × 1 km), **not** 15,155.
- Direct RM **will not** match workbook Summary metals until landed adders are in scope **or** the workbook is restated on LME.
- Remaining gap vs ~2,571 USD is **commercial** (landed metals + standard RM list vs landed), **not** a 1000× UOM defect (spec).

### Engine / tests if B is signed

- **costingEngine.ts:** no structural change for Decision 5. Keep ignoring `CostingMetalCostComponent`.
- **costingEngine.test.ts:** keep the Option B test (material cost unchanged when unused landed components are present). Do **not** add LME+Premium+Shipping+Clearance into applied price.

### CostingMetalCostComponent and Metal Cost Components panel

- Prisma: *“Master-data only. Not consumed by costingEngine Direct RM Cost (Option B — LME/Base only).”*
- Migration `20260829120000_metal_cost_components`: table for UI/preparation; **not used by costingEngine**.
- Types: metal `COPPER` \| `ALUMINIUM`; component `PREMIUM` \| `SHIPPING` \| `CLEARANCE`; basis `KG` \| `MT` \| `FIXED_AMOUNT` \| `PERCENTAGE`; status Draft/Active/Inactive; effective dates; currency FK.
- Panel copy: values are for **future** landed cost; banner **Option B — LME/Base Only**; “not included”; empty state *“Values do not affect current costing.”*; future formula shown but *“not wired into the costing engine yet.”*
- Bulk import warning: master data only; not in Direct RM.

### Migration / data

Low. Keep capturing Premium / Shipping / Clearance as **governed master data** for a later layer. Completeness of those rows is **not** required for Direct RM under B.

### Risk

- Quotes on Direct RM will sit **below** a landed workbook for copper-heavy cables (spec CR01 delta 1,974.36 vs ~2,049.41; larger if Clearance is also in the workbook).
- Users may assume the Metal Cost Components screen **already** costs landed metal. Panel already warns; process/training still needed.
- Costing V2 remains **not production-ready** until sign-off **and** 10009487 reconciliation under B is accepted.

---

## Option A — landed metal in Direct RM (PROPOSED — do not implement until signed)

### Behaviour (spec; not in engine)

```text
Applied metal price = LME + Premium + Shipping + Clearance
```

Spec implication: inquiry header **and/or** governed landed components must carry adders. Direct RM metals would track workbook Summary **more closely**. Spec still lists **list vs landed on standard RMs** (XL08, ML04) as a **separate** data/governance topic, not this decision.

Spec freeze: **do not** add Premium / Shipping / Clearance into Direct RM unless this option is signed; then **one** controlled implementation prompt, including **where** adders are entered (inquiry vs RM price vs landed-cost layer) and how they combine with USD/MT.

### 10009487 reconciliation

- Spec sign-off table: applied copper **15,155 USD/MT** → CR01 Direct RM (1 km) **~2,049.41 USD**.
- Full cable vs workbook **~2,571 USD** would still depend on **standard RM** list vs landed (spec). Option A does **not** by itself close that remainder.
- **2,500.58 USD** [NEEDS VERIFICATION] — not a spec or unit-test figure.

### Engine / tests if A is signed (scope for a later prompt only)

**costingEngine.ts (and likely `inquiryMetalPricing.ts`, which the engine already uses):**

- Define a single combination rule (additive USD/MT vs % vs fixed amount vs KG — panel today: *“stored as entered; no silent conversion”*).
- Choose source of truth: inquiry header landed total, **or** header LME plus **ACTIVE** `CostingMetalCostComponent` rows (effective date, metal, currency), **or** both with override rules.
- Apply only to `MARKET_METAL_*` lines; still ignore master metal list price.
- Date/status/FX/missing-component blocking rules (today missing header Cu/Al already blocks).
- `CostingContext` would need a **real** typed `metalCostComponents` (or equivalent) — today the test only proves unused extras are ignored.

**costingEngine.test.ts:**

- Invert or replace `does not add Premium, Shipping or Clearance…`.
- Assert CR01 at 15,155 → **~2,049.41** (or exact rounding once specified).
- Keep: scrap not multiplied; packing excluded; MT↔kg; header LME still the **base** if adders are separate.
- Do not treat 1,313.30 (9.50/kg master, no header) as the Option A baseline.

### CostingMetalCostComponent and Metal Cost Components panel

- Rows would become **inputs to Direct RM** (if master-data path is chosen), or remain reference if adders live **only** on the inquiry.
- Panel: remove “not included / future / not wired”; show included formula; clarify Draft vs Active; likely restrict which `priceBasis` values the engine accepts.
- Governance: overlapping effective periods, % vs MT, Al vs Cu, bulk import no longer “Option B master-only.”

### Migration / data

Material. Need complete, approved Premium / Shipping / Clearance (or inquiry fields) for every metal/currency/date used in costing; workbook alignment (spec example uses **505 + 50**, test unused figures **555 / 80 / 40** — they are **not** the same dataset); FX if adders are not USD; costing-team acceptance of 10009487 under A.

### Risk

- Implementing A **before** sign-off and source-of-truth rules violates the locked spec freeze.
- Silent mix of LME header + master adders could **double-count** if the header is already landed.
- `PERCENTAGE` / `FIXED_AMOUNT` without a conversion spec can mis-price vs 15,155 USD/MT.
- Historical quotes under B would not match A; snapshots must stay frozen.
- Standard RM list vs landed still remains after A (spec).

---

## Side-by-side (sign-off)

| Topic | Option B (current) | Option A (proposed) |
|---|---|---|
| Applied Cu for 10009487 (spec) | 14,600 USD/MT | 15,155 USD/MT |
| Expected CR01 Direct RM, 1 km (spec) | ~1,974.36 USD | ~2,049.41 USD |
| Full 10009487 vs workbook ~2,571 | Expected gap (landed + some standard RM list/landed) | Metals closer; remainder still commercial |
| costingEngine | Header Cu/Al only; components unused | Must consume adders (after a signed prompt) |
| costingEngine.test.ts | Asserts unused landed rows do **not** change cost | Must assert landed combination |
| CostingMetalCostComponent | Master data / future landed | Likely costing input **or** inquiry fields instead |
| Metal Cost Components panel | Option B warnings; not in Direct RM | Copy and workflow must match inclusion rules |
| Data effort | Optional capture | Required completeness + rounding/FX rules |
| Production | **Not** ready until signed + 10009487 accepted under that option | Same bar after implementation |

---

## Sign-off

| | |
|---|---|
| Decision | ☐ Option B — LME / base only in Direct RM  ☐ Option A — landed (LME + Premium + Shipping + Clearance) in Direct RM |
| Name | |
| Date | |
| Notes | |
