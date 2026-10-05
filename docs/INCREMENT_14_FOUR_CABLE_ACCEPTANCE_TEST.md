# Increment 14 — Four Cable Acceptance Test

**Date:** 2026-08-24  
**Identities:** ELAND Cost Sheet Required.xlsx (regression only). Not imported as master prices.

| # | Material | Description (Cable Master) |
|---|----------|----------------------------|
| 1 | 10009487 | Cu / XLPE / LSHF 0.6/1 kV 1X16 mm2 RMC IEC 60502-1 |
| 2 | 10009546 | Cu / XLPE / LSHF 0.6/1 kV 5X185 mm2 RMC IEC 60502-1 |
| 3 | 10010347 | Al / XLPE / MDPE 18/30 kV CWs 1X300/25 mm2 RMC IEC 60502-2 |
| 4 | 10010439 | Cu / XLPE / MDPE 8.7/15 kV CWs 1X400/35 mm2 RMC IEC 60502-2 |

Engine path used: `evaluateCostingReadinessForCables` → `executeCostingForInquiryLine` with `persist: false`. No ELAND workbook amounts were written to `RawMaterialPrice`.

---

## Shared configuration (all four)

| Check | Result |
|-------|--------|
| Cable Master | ACTIVE for all four |
| Family on Cable Master | null (UNMAPPED) |
| Governed BOM (`GovernedBomLine` APPROVED) | **0 lines** all four |
| Source BOM (`CableBomLine`) | 8 / 14 / 15 / 17 lines |
| Active scrap rules (global) | 12 |
| Formulas in DB | 24 total, 9 ACTIVE |
| Official RM list APPROVED prices | **Not used.** Engine reports DRAFT prices exist in governance tables; costing still `PRICE_NOT_CONFIGURED` until Costing Team **approves**. |
| Logistics / packing amounts | `LOGISTICS_NOT_CONFIGURED` / `PACKING_NOT_CONFIGURED` |
| Calculate persist READY snapshot | **Not done** — orchestrator returns `NOT_READY`; inquiry persist only on READY |
| Reopen DB result | No `costingCalculationId` expected until READY |

---

## Cable 10009487

| Gate | Result |
|------|--------|
| Master | Present, ACTIVE |
| Engineering mapping | APPROVED, mappingStatus PARTIAL, family null |
| BOM | Source BOM 8 lines; **no governed APPROVED lines** (`bom: false` in readiness) |
| Prices | `PRICE_NOT_CONFIGURED` (DRAFT rows exist; not approved). Also `FX_NOT_CONFIGURED` for LE→USD on A-ECAP10 |
| Scrap | `scrap: true` (no NOT_READY scrap gate) |
| Formula | `formula: true` (material cost does not require a formula) |
| Readiness | `NOT_READY` / `BLOCKED` / `PRICE_NOT_CONFIGURED` |
| Calculate / save / reopen | Engine blocked; no READY `CostingCalculation` persisted |

---

## Cable 10009546

| Gate | Result |
|------|--------|
| Master | Present, ACTIVE |
| Engineering mapping | **DRAFT** → `ENGINEERING_NOT_APPROVED` |
| BOM | Source 14 lines; governed 0; unresolved `BOM-CONF-008` (HB02) `BUSINESS_DECISION_REQUIRED` |
| Prices | `PRICE_NOT_CONFIGURED` on multiple DRAFT RMs |
| Scrap / formula | scrap true, formula true |
| Readiness | `NOT_READY` / `ENGINEERING_NOT_APPROVED` |
| Calculate / save / reopen | Blocked; no READY snapshot |

---

## Cable 10010347

| Gate | Result |
|------|--------|
| Master | Present, ACTIVE |
| Engineering mapping | **DRAFT** → `ENGINEERING_NOT_APPROVED` |
| BOM | Source 15 lines; governed 0; unresolved `BOM-CONF-067` (SC01) |
| Prices | `PRICE_NOT_CONFIGURED` plus `PRICE_UOM_MISMATCH` for A-EC04 PCS |
| Scrap / formula | scrap true, formula true |
| Readiness | `NOT_READY` / `ENGINEERING_NOT_APPROVED` |
| Calculate / save / reopen | Blocked; no READY snapshot |

---

## Cable 10010439

| Gate | Result |
|------|--------|
| Master | Present, ACTIVE |
| Engineering mapping | **DRAFT** → `ENGINEERING_NOT_APPROVED` |
| BOM | Source 17 lines; governed 0 |
| Prices | `PRICE_NOT_CONFIGURED` plus `PRICE_UOM_MISMATCH` for A-EC04 PCS |
| Scrap / formula | scrap true, formula true |
| Readiness | `NOT_READY` / `ENGINEERING_NOT_APPROVED` |
| Calculate / save / reopen | Blocked; no READY snapshot |

---

## Verdict

**SYSTEM READY:** The four identities resolve in Cable Master, source BOMs exist, the orchestrator reports honest blocking codes, and it does not invent a total.

**BUSINESS CONFIGURED:** **No.** Official prices are not APPROVED; three mappings are DRAFT; governed BOM is empty; logistics/packing amounts are missing. Do not treat DRAFT price numbers as published master prices. Do not paste ELAND sheet totals into the database.

Inquiry Calculate on these cables is expected to return `NOT_READY` until Costing Team / Technical Office (mapping & BOM conflicts only) complete their respective work. Technical Office still **cannot** approve RM prices.
