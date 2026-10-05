# ELAND Four Cable Status

**Date:** 2026-08-25  
**Probe:** `executeCostingForInquiryLine` via `evaluateCostingReadinessForCables`, **persist: false**.  
**Identities:** `data/regression/ELAND Cost Sheet Required.xlsx` (regression only). **Not imported as master prices.**  
**Masters:** Official `npm run import:masters` completed before this probe.

## Import counts (this run)

| Kind | Result |
|------|--------|
| Raw materials | 74 rows previewed; all source prices blank → `PRICE_NOT_CONFIGURED` warnings |
| Cables | 432 valid (Cable List) |
| BOM | 4822 valid, 164 skipped, **81 duplicate groups** |
| Drums | 103 valid; 30 `CONFIGURATION_REQUIRED` (no type/max weight in source) |
| PostgreSQL after upsert | 435 cables, 76 RM, 4822 BOM lines, 103 drums, 162 BOM duplicate observations, 72 `PRICE_NOT_CONFIGURED`, **4 price rows marked configured** (not from official blank list — see prices note) |

Do not force 432/81 if sources change; this run **matched** historical 432 cables and 81 BOM duplicate groups at import.

## Prices note (not official)

Official Raw Material List prices remain **blank**. The engine reports **DRAFT** `RawMaterialPrice` rows with numeric amounts for many codes. Those drafts are **not** Costing Team **APPROVED** published prices and must **not** be treated as company LME/list prices. Costing stays `PRICE_NOT_CONFIGURED` until Costing Team approves. ELAND workbook totals were **not** written to `RawMaterialPrice`.

## Shared (all four)

| Check | Result |
|-------|--------|
| Cable Master | ACTIVE; family **null (UNMAPPED)** |
| Governed BOM APPROVED | **0 lines** |
| Source BOM | 8 / 14 / 15 / 17 lines |
| Calculate persist READY | **Not done** — status `NOT_READY`; snapshot not persisted |
| Logistics / packing | `LOGISTICS_NOT_CONFIGURED` / `PACKING_NOT_CONFIGURED` (non-blocking extras on preview summary) |

---

## 10009487 — `NOT_READY` / `PRICE_NOT_CONFIGURED`

| Gate | Result |
|------|--------|
| Master | Present, ACTIVE |
| Engineering mapping | **APPROVED**, mappingStatus PARTIAL, family null |
| BOM | Source 8 lines; governed 0 |
| Prices | `PRICE_NOT_CONFIGURED` (DRAFT rows exist; not approved). Codes include CR01, CX05, HF27, HF30, ML04, TP01, XL08 |
| Scrap / formula | scrap true, formula true |
| Persist | `persisted: false` |

## 10009546 — `NOT_READY` / `ENGINEERING_NOT_APPROVED`

| Gate | Result |
|------|--------|
| Mapping | **DRAFT** |
| BOM | Source 14; conflict **BOM-CONF-008** HB02 `BUSINESS_DECISION_REQUIRED` (plus unresolved BOM-CONF duplicate row) |
| Prices | `PRICE_NOT_CONFIGURED` on multiple DRAFT RMs |

## 10010347 — `NOT_READY` / `ENGINEERING_NOT_APPROVED`

| Gate | Result |
|------|--------|
| Mapping | **DRAFT** |
| BOM | Source 15; **BOM-CONF-067** SC01 `BUSINESS_DECISION_REQUIRED` |
| Prices | `PRICE_NOT_CONFIGURED` plus **`PRICE_UOM_MISMATCH`** for A-EC04 PCS |

## 10010439 — `NOT_READY` / `ENGINEERING_NOT_APPROVED`

| Gate | Result |
|------|--------|
| Mapping | **DRAFT** |
| BOM | Source 17; governed 0 |
| Prices | `PRICE_NOT_CONFIGURED` plus **`PRICE_UOM_MISMATCH`** for A-EC04 PCS |

---

## Verdict

**SYSTEM READY:** Identities resolve; orchestrator returns honest codes; no READY total invented.  
**BUSINESS CONFIGURED:** **No.** Do not mark READY. Inquiry Calculate on these cables must return `NOT_READY` with the codes above, not zero cost.
