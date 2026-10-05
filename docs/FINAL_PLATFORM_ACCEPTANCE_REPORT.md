# Final Platform Acceptance Report

**Date:** 2026-08-25  
**Workspace:** Energya Connect (`energya_connect` @ 127.0.0.1:5432)  
**App:** http://localhost:3847  

This is **not** a feature increment. No second costing engine. No invented official prices, scrap, LME, incoterm, drum costs, or fake KPI percentages.

---

## 1. Executive classification

| Layer | Classification |
|-------|----------------|
| Software / orchestrator / RBAC / persist-on-READY | **SYSTEM READY** |
| Official RM prices, governed BOM, mapping approvals, FX, logistics/packing amounts | **CONFIGURATION_REQUIRED** |
| Four ELAND cables READY total | **NOT READY** (honest `NOT_READY`) |
| D365 / Advaris / report builder / inquiry attachments | **NOT_CONNECTED** / **NOT_IMPLEMENTED** |
| Browser UI E2E | **BLOCKED** (MCP tab) |

**Do not claim business go-live.** **Do not claim READY costing** for 10009487 / 10009546 / 10010347 / 10010439.

## 2. SYSTEM READY vs BUSINESS CONFIGURED

- **SYSTEM READY:** Yes — `executeCostingForInquiryLine` is the single path; preview `persist:false`; inquiry persist only when READY; Costing Hub; JWT on mapping/BOM/pricing exports; tests 428/428.
- **BUSINESS CONFIGURED:** No — official list prices blank; DRAFT governance amounts are **not** published; three mappings DRAFT; governed BOM empty; logistics/packing not configured.

## 3. Masters import

Official `npm run import:masters` from `data/source/`. ELAND workbook **not** copied into `RawMaterialPrice`.

| Kind | Count |
|------|--------|
| RM preview | 74, all `PRICE_NOT_CONFIGURED` warnings |
| Cables | **432** |
| BOM | 4822 valid, 164 skipped, **81** duplicate groups |
| Drums | 103 (30 type/weight `CONFIGURATION_REQUIRED`) |

Re-import previously doubled `BomDuplicateObservation` (162). Persist now upserts/dedupes by cable+RM. After re-import: **81** observations. Tests still require 81 — not weakened.

## 4. Four ELAND cables

See `docs/ELAND_FOUR_CABLE_STATUS.md`. All **NOT_READY**. Primary codes: `PRICE_NOT_CONFIGURED` (10009487); `ENGINEERING_NOT_APPROVED` (other three); BOM `BUSINESS_DECISION_REQUIRED`; A-EC04 `PRICE_UOM_MISMATCH`. `persisted: false`.

## 5. Single costing engine

`executeCostingForInquiryLine` only. Admin preview/validate persist:false. Inquiry calculate persist:true writes snapshot **only** if READY.

## 6. Formula language

`+ - * /` and parentheses. No SUM/IF.

## 7. Scrap

BOM % then specificity BOM_LINE > CABLE > FAMILY > MATERIAL_CLASS > GLOBAL, then lowest priority; equal overlap `BUSINESS_RULE_REQUIRED`. Covered by `costingScrapResolution.test.ts`.

## 8. Prices

Official blanks stay `PRICE_NOT_CONFIGURED`. DRAFT rows in PostgreSQL must **not** be presented as official company prices. Costing Team approves — **not** Technical Office (`assertCanApproveRawMaterialPrice`). I4-RM synthetic prices remain purged from the official list path.

## 9. FX / LE

LE=EGP on import. Engine uses APPROVED+ACTIVE rates only. No invented FX number.

## 10. Costing configuration workflow

CREATE / EDIT / SUBMIT / APPROVE / ACTIVATE / DEACTIVATE / VERSION exist under `/api/admin/costing`. **REJECT** is **not** on `CostingConfigStatus` (no REJECTED enum). Price workflow **does** support REJECT. Document as **CONFIGURATION_REQUIRED** / product decision, not a silent approve.

## 11. RBAC

Costing Team vs TO enforced on price approval. Customers 403 on calculate / internal cost projection.

## 12. Inquiry

Final UI (`CommercialInquiryDetail`): multi-line, cutting length persist, drum master select. Incomplete drum → `DRUM_CONFIGURATION_REQUIRED` on calculate-cost outcomes (EWD* master). Calculate uses orchestrator. NOT_READY returns **codes**, not zero. Save/refresh/reopen covered by Increment 12/13 tests. Print/Export notify “not yet available”.

## 13. Attachments

`INQUIRY_ATTACHMENTS_NOT_IMPLEMENTED` — no Prisma attachment store.

## 14. Quotation snapshot

`costingCalculationId` copied when READY (Increment 13 Phase E tests). Four ELAND cables have no READY id.

## 15. Customer isolation

Projection strips cost fields; calculate 403. Increment 12b2 / 13 tests.

## 16. Technical Office

Mapping + BOM governance live. Mapping export Bearer. BOM/pricing exports now Bearer (were `window.open`). TO cannot approve RM prices.

## 17. Costing Hub

`CostingPricing` is a deprecated re-export of `CostingHub`. Production nav uses Costing Configuration.

## 18. Admin menus

| Menu | Status |
|------|--------|
| Administration users/roles/customers | Working (JWT APIs) |
| Costing Configuration | Working |
| Master Data / Import | Working |
| Reports | `REPORT_BUILDER_NOT_IMPLEMENTED` + live KPI counts |
| Finance | `NOT_IMPLEMENTED` (sample table labeled) |
| Production | `NOT_CONNECTED` (sample table labeled) |
| Field definitions UI | **Not wired** (API `GET/POST /api/admin/platform/fields` only) |

## 19. Low-code fields

`PlatformFieldDefinition` persisted via API. Inquiry field visibility uses `inquiryFieldManifest`, not that table. **NOT_IMPLEMENTED** as a low-code grid.

## 20. Report builder

`REPORT_BUILDER_NOT_IMPLEMENTED`. `ReportDefinition` can be stored; no run/export engine.

## 21. Dashboards

Live: open inquiries/quotations, customers, BOM conflicts, unpriced RM, TO requests, inquiry-by-status pie. Sales millions / top customers / fake LME: **No data configured**. KPI `costingReadyCables` now counts persisted READY/LOCKED `CostingCalculation` rows (not all ACTIVE cables).

## 22. D365 / MES

`GET /api/d365/sync-status` and `/api/advaris/mes-status`: **`connected: false`**, `NOT_CONNECTED`. Adapters remain `NOT_IMPLEMENTED`. Dev server **must be restarted** after this change (verified after restart).

## 23. UI sweep

See `docs/BROKEN_UI_ACTIONS.md`. Production-relevant dead buttons fixed (JWT exports, fake D365, fake dashboard numbers, fake PDF/MES alerts). Remaining: TDS/support fake downloads (non-SoT help), costing REJECT enum.

## 24. Browser E2E

**BLOCKED** — `docs/FINAL_BROWSER_ACCEPTANCE_REPORT.md`.

## 25. Prisma / TypeScript / tests

- `npx prisma validate`: pass  
- `npx prisma migrate deploy`: 21 migrations, none pending  
- `npx tsc --noEmit`: pass  
- `npm test -- --test-concurrency=1`: **428/428 pass**

## 26. localStorage

JWT session cache only. Not source of truth for masters, prices, or inquiry costing.

## 27. Primary E2E scenario (costing)

**Result: NOT_READY (PASS as honest gate).**  
Cables 10009487, 10009546, 10010347, 10010439 via `executeCostingForInquiryLine` persist:false. No READY snapshot. Inquiry Calculate expected to surface the same codes plus `DRUM_CONFIGURATION_REQUIRED` if drum is not an EWD master code. **UI Calculate click not observed** (browser BLOCKED).

## 28. Remaining blockers for READY totals

Costing Team: APPROVE RM prices (or leave blank). Technical Office: approve mappings 10009546/10010347/10010439; resolve BOM conflicts; publish governed BOM. FX pairs as needed. Logistics/packing amounts without zero-fill. Family mapping. UOM PCS vs kg for A-EC04.

## 29. Related documents

- `docs/FINAL_ACCEPTANCE_BASELINE.md`  
- `docs/ELAND_FOUR_CABLE_STATUS.md`  
- `docs/BROKEN_UI_ACTIONS.md`  
- `docs/FINAL_BROWSER_ACCEPTANCE_REPORT.md`

## 30. Sign-off

| Claim | Allowed? |
|-------|----------|
| Platform software ready to configure costing | Yes |
| Four cables commercially costed / ELAND golden match | **No** |
| Official prices loaded from ELAND sheet | **No** |
| D365 connected | **No** |
| Browser UAT complete | **No** (BLOCKED) |
