# ELAND four-cable final test

**Date:** 2026-08-25  
**Method:** `scripts/probeElandFourCables.ts` → `evaluateCostingReadinessForCables` → `executeCostingForInquiryLine` persist:false  
**Identities:** 10009487, 10009546, 10010347, 10010439  
**ELAND workbook:** regression identity only — **not** imported as master prices.

| Cable | Master | Mapping | Source BOM | Governed BOM | Probe | Leading code |
|-------|--------|---------|------------|--------------|-------|----------------|
| 10009487 | ACTIVE, family null | APPROVED / PARTIAL | 8 | 0 | NOT_READY | `PRICE_NOT_CONFIGURED` (CR01, CX05, HF27, HF30, ML04, TP01, XL08 drafts) |
| 10009546 | ACTIVE, family null | DRAFT | 14 | 0 | NOT_READY | `ENGINEERING_NOT_APPROVED`; BOM-CONF-008 HB02 `BUSINESS_DECISION_REQUIRED` |
| 10010347 | ACTIVE, family null | DRAFT | 15 | 0 | NOT_READY | `ENGINEERING_NOT_APPROVED`; BOM-CONF-067 SC01; `PRICE_UOM_MISMATCH` A-EC04 PCS |
| 10010439 | ACTIVE, family null | DRAFT | 17 | 0 | NOT_READY | `ENGINEERING_NOT_APPROVED`; `PRICE_UOM_MISMATCH` A-EC04; many `PRICE_NOT_CONFIGURED` |

Shared extras: `LOGISTICS_NOT_CONFIGURED`, `PACKING_NOT_CONFIGURED`. Snapshots **not** persisted (`persisted: false`). No READY total invented.

Inquiry Calculate on these lines must return the same honest codes, plus `DRUM_CONFIGURATION_REQUIRED` if the line has no Drum Master selection.

**SYSTEM READY:** Yes (orchestrator). **BUSINESS CONFIGURED:** No.
