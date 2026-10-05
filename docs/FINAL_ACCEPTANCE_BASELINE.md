# Final Acceptance Baseline (audit only)

**Date:** 2026-08-25  
**Workspace:** `D:/Projects/EPC_Platform/energya-connect-platform`  
**Method:** Read-only inspection of `package.json`, Prisma schema + 21 migrations, `prisma/seed.ts`, `server.ts`, costing/inquiry/TO/master/RBAC routes, and UI entry points. **No runtime counts in this document** — live master/costing numbers belong in later acceptance docs after `npm run import:masters`.

**Legend:** Working | Broken | Partial | Mock | Legacy | Not connected | Configuration required | Business decision required

---

## A. Working

| Area | Evidence |
|------|----------|
| Dev/runtime | `npm run dev` → `tsx server.ts`, default port **3847**. Vite in development; Express owns `/api/*`. |
| Database | Prisma 6 + PostgreSQL. 21 migrations from Increment 2 through `20260824160000_costing_document_sequence`. `npx prisma migrate deploy` is the official apply path (`npm run prisma:migrate`). |
| Identity | JWT login (`/api/auth`), refresh, lockout tests (`increment12b1`). README / in-memory fallback users include `admin@energya.com` / `Admin@2026!`. Seed creates development users only when `NODE_ENV` is not production. |
| Official master import | `npm run import:masters` → `scripts/importAllMasters.ts`: RM → Cables → BOM → Drums from `data/source/`. Blank RM prices stay `PRICE_NOT_CONFIGURED`; ELAND workbook is **not** in this path. |
| Cable / RM / BOM / Drum persistence | `CableMaster`, `RawMaterial`, `RawMaterialPrice`, `CableBomLine`, `BomDuplicateObservation`, `GovernedBomLine`, `DrumMaster` in Prisma; Import Center `POST /api/master/imports/preview\|commit`. |
| Technical Office (engineering + BOM) | `/api/technical-office`, mapping workflow, BOM conflict investigation/approval. Mapping Excel export uses **Bearer** (`TechnicalOfficeMappingQueue` `downloadAuthenticatedFile`). |
| Price approval RBAC | `assertCanApproveRawMaterialPrice` requires Costing Team (`costingPricing` / `PRICE:RAW_MATERIAL_PRICE:APPROVE`), **not** Technical Office. Costing admin `POST /api/admin/costing/raw-material-prices/:id/actions` with `APPROVE` uses that gate. |
| Single costing engine | `executeCostingForInquiryLine` in `costingOrchestrationService.ts`. Callers: inquiry calculate, `costingRepository` (adapter), admin preview/validate, readiness service. `increment14` asserts `engine: 'executeCostingForInquiryLine'`. |
| Preview vs persist | Admin `/preview` and `/validate` use `persist: false`. Inquiry calculate uses `persist: true` but **does not write a READY snapshot when status is NOT_READY**. |
| Formula language | Tokenizer/AST in `costingFormulaEngine.ts`: operators `+ - * /` and parentheses only. |
| Scrap resolution | BOM line % first, then specificity `BOM_LINE > CABLE > FAMILY > MATERIAL_CLASS > GLOBAL`, then lowest priority; equal overlap → `BUSINESS_RULE_REQUIRED` (`costingScrapResolution.test.ts`). |
| FX | `CostingExchangeRate`; LE normalized to EGP in import; engine uses APPROVED+ACTIVE rates; no invented FX. |
| Inquiry + quotation | `/api/inquiries`, `/api/quotations`. Multi-line, `cuttingLengthMeters` on `CommercialInquiryLine`. `POST /:id/calculate-cost` loops orchestrator. Quotation copies `costingCalculationId`. Customer projection strips cost fields; calculate is 403 for customers. |
| Costing Team UI | Sidebar **Costing Configuration** → `CostingHub` (not mock `CostingPricing`). `CostingConfigurationDashboard` covers overview, prices, scrap, variables, formulas, BOM costing, assignment, other costs, preview, versions, approval, audit. |
| Configuration APIs | CREATE/EDIT/SUBMIT/APPROVE/ACTIVATE/DEACTIVATE/VERSION for configurations and formulas under `/api/admin/costing/*`. Scrap/FX have create/patch/submit/approve/activate. |
| Platform health | `GET /api/platform/health` reports real DB check. `d365DomainAdapters: 'NOT_IMPLEMENTED'` on `GET /api/platform/status`. |
| Permission catalog | Granular `PERMISSION_CATALOG` + roles including `COSTING_USER` / `COSTING_MANAGER` vs `TECHNICAL_OFFICE_*`. |
| Tests listed | `package.json` `test` script enumerates domain + increment 4–14 suites with `--test-concurrency=1`. |

---

## B. Broken

| Area | Evidence |
|------|----------|
| D365 / Advaris “live” stubs | `GET /api/d365/sync-status` and `GET /api/advaris/mes-status` return **`connected: true`** plus invented entity counts / OEE. Contradicts platform status (`NOT_IMPLEMENTED`) and acceptance rule: must be **NOT CONNECTED**, not `connected: true`. |
| Dashboard KPI `costingReadyCables` | `dashboardKpiService.ts` sets `costingReadyCables` to **count of ACTIVE `CableMaster` rows**, not orchestrator READY cables. Mislabels configuration completeness. |
| Inquiry attachments | No Prisma attachment model; `CommercialInquiryDetail` has no upload API. Attachments exist only on mock ERP views (`ErpCustomerRequestView` / `mockData`). Production inquiry attach is **not implemented**. |
| Costing configuration REJECT | `CostingConfigStatus` enum has DRAFT/VALIDATION/SUBMITTED/APPROVED/ACTIVE/INACTIVE/SUPERSEDED — **no REJECTED**. No `/reject` route for config versions or formulas. Price workflow **does** support REJECT (different enum). |
| Reports Analytics export | `ReportsAnalytics.tsx` “Export Power BI Report Pack” is `alert(...)`. Fabricated conversion/OEE/OTD numbers. |

---

## C. Partial

| Area | Evidence |
|------|----------|
| Persistence dual-write | `GET /api/platform/status` still advertises `DUAL_LOCALSTORAGE_AND_POSTGRESQL`. JWT tokens in `localStorage` are session cache only. Several services still keep browser copies (`cableCatalogService`, `rawMaterialMasterService`, `drumMasterService`, `importBatchService`, configurator custom masters, inquiry **saved views**). **Source of truth for masters/inquiries/costing is PostgreSQL** when `DATABASE_URL` is set; localStorage is not official master data. |
| Internal dashboard | Live KPIs from `GET /api/admin/platform/dashboard/kpis` (customers, inquiries, BOM conflicts, unpriced RM, TO requests). Charts still use hardcoded monthly sales / top customers. |
| Customer dashboard | Live inquiry list/KPIs from `/api/inquiries`. Sales-order widgets still use `INITIAL_SALES_ORDERS` mock. |
| Drum costing | Drum master import works. Engine packing/drum layer returns `NOT_CONFIGURED` until Costing Team amounts exist. Inquiry line has `drumType` string; **no `DRUM_CONFIGURATION_REQUIRED` error code** found in orchestrator (uses `drumCostStatus: NOT_CONFIGURED`). `drumPlanService` suggestions use a **hardcoded** `APPROVED_DRUM_TYPES` list, not `DrumMaster` rows. |
| Logistics / packing / metal | Prisma models + `/api/admin/platform/costing/*` create/list. Engine `resolveAllExtensionLayers` — amounts **not** applied unless configured; logistics NOT_CONFIGURED is **non-blocking** on inquiry calculate (by design in `calculateInquiryCost` comment). Metal rates on inquiry metadata are **not** LME additives. |
| Engineering family | Cable Master family often UNMAPPED; `Cables Parameters_1.xlsx` is **not** part of `import:masters`. |
| Governed BOM | Source `CableBomLine` imported; `GovernedBomLine` APPROVED required for READY costing. Conflicts remain `BUSINESS_DECISION_REQUIRED` until TO resolves. |
| Low-code fields | `PlatformFieldDefinition` CRUD at `GET/POST /api/admin/platform/fields`. **No Administration UI** calls these endpoints. Inquiry field visibility uses `inquiryFieldManifest` (code + optional localStorage prefs), not the platform table. |
| Notifications | `NotificationRule` model + `/api/admin/platform/notifications/rules`. UI toasts are in-memory; rules are not wired as a delivery engine. |
| Report definitions | `ReportDefinition` persist API exists. No query/run/export builder UI. |
| Mapping completeness | Export/import Bearer-fixed. Many cables still DRAFT/PARTIAL mappings (historical four-cable report). |
| `executeCostingRun` / `POST /api/costing/calculate` | Adapter over the same orchestrator — compatibility, not a second engine. |

---

## D. Mock

| Surface | Detail |
|---------|--------|
| `server.ts` in-memory `mockDbUsers` | Parallel to Prisma identity; passwords stored as plaintext hashes in the array (legacy login path). |
| Production Monitoring | `INITIAL_PRODUCTION_ORDERS` + alert “New Production Order”. |
| Finance & Collections | `INITIAL_TRANSACTIONS` + alert “Send Payment Reminders”. |
| Reports Analytics | Hardcoded OEE 84%, conversion 71.1%, OTD 96.5%, weekly OEE series. |
| Customer Statement PDF | Alert, not a generated file. |
| D365 / Advaris sync-status | Prototype JSON (see Broken). |
| `ErpCustomerRequestView` | Demo ERP request UI with sample drums/attachments. |
| AI assistant | Google GenAI if keyed; otherwise error JSON — not a costing source. |

---

## E. Legacy

| Item | Status |
|------|--------|
| `CostingPricing.tsx` | Deprecated re-export of `CostingHub`. App routes `costing_pricing` to `CostingHub`. |
| `POST /api/master-data/import` | Parse-only stub; `persisted: false`. Canonical: Import Center. |
| localStorage catalogs | Fallback when PostgreSQL is down; must not be treated as official prices/BOM. |
| NestJS | `nestjs: false` on platform status — Express modular monolith by design. |

---

## F. Not connected

| Integration | Status |
|-------------|--------|
| Dynamics 365 F&O | Adapters return `NOT_IMPLEMENTED` (`d365Adapters.ts`). HTTP stub falsely claims connected (Broken). |
| Advaris MES | Same pattern. |
| Power BI | Not embedded. Report pack button is an alert. |
| Email / SMS notification delivery | Rules table only. |
| Report builder runtime | Persist metadata only; no execution engine. |

---

## G. Configuration required

| Item | Why READY costing cannot be claimed |
|------|-------------------------------------|
| Official RM prices | Source `Raw Material List.xlsx` prices blank → `PRICE_NOT_CONFIGURED` until Costing Team **proposes and APPROVES**. I4-RM synthetic test prices were purged historically. |
| Engineering mapping APPROVED | Persist-true path calls `ensureEngineeringMappingApprovedForCosting`. DRAFT mappings → `ENGINEERING_NOT_APPROVED`. |
| Governed BOM | Zero APPROVED `GovernedBomLine` historically for ELAND four cables; source BOM exists. |
| BOM conflicts | Official import historically ~81 conflicts; TO must resolve — do not auto-pick. |
| FX pairs | Missing APPROVED+ACTIVE pair (e.g. LE→USD) → `FX_NOT_CONFIGURED`. |
| Logistics / packing / drum amounts | Extension layers stay NOT_CONFIGURED until Costing Team enters governed amounts. Do not zero-fill. |
| Active costing configuration version | Needed for non-preview persist path (`resolveActiveConfigurationVersion`). |
| Formulas assignment | Material cost can READY without manufacturing formula; process/overhead layers need ACTIVE assigned formulas. |
| Family on Cable Master | Often null / UNMAPPED; family-scoped scrap may not apply. |
| SCREEN↔FAMILY seed | `prisma/seed.ts` explicitly does not seed SCREEN↔FAMILY (`CONFIGURATION_REQUIRED`). |
| Drum type / max weight on import | Source Drum List missing columns → import warnings. |

---

## H. Business decision required

| Topic | Why the platform must not invent |
|-------|----------------------------------|
| ELAND golden totals | `data/regression/ELAND Cost Sheet Required.xlsx` is regression identity only. **Do not copy workbook numbers into `RawMaterialPrice`.** Numeric match is blocked until official approvals exist. |
| LME + additive copper/aluminium build-up | Inquiry metadata rates are descriptive; engine must not invent LME additives. |
| Incoterm / destination charges | No official charge table supplied. |
| Scrap overlap | Equal specificity + equal priority → `BUSINESS_RULE_REQUIRED` (human pick). |
| BOM duplicate observations | Classification/survivor is a TO business decision. |
| UOM PCS vs kg | Historical `PRICE_UOM_MISMATCH` (e.g. A-EC04) — Costing Team / masters, not engine conversion. |
| Costing config REJECT semantics | Enum has no REJECTED; product choice whether to add REJECT or use INACTIVE only. |
| `DRUM_CONFIGURATION_REQUIRED` vs `NOT_CONFIGURED` | Spec asked for incomplete drums to block with `DRUM_CONFIGURATION_REQUIRED`; current engine uses non-blocking packing `NOT_CONFIGURED`. Changing that is a product gate, not a silent zero. |

---

## Route map (audit)

| Mount | Router |
|-------|--------|
| `/api/auth` | identity |
| `/api/admin` | users, roles, customers |
| `/api/admin/costing` | Costing Team configuration + preview |
| `/api/admin/platform` | KPIs, metal/logistics/packing, fields, notifications, reports |
| `/api/master` | cables, RM, BOM, drums, imports, mapping export |
| `/api/cables` | cable authority |
| `/api/technical-office` | TO workbench |
| `/api/costing` | compatibility calculate |
| `/api/inquiries` | commercial inquiry + calculate-cost |
| `/api/quotations` | quotations + pricing attach |
| `/api/commercial-pricing` | commercial (selling) pricing — **not** manufacturing cost |

---

## Four ELAND cables (audit expectation — not live probe)

Identities from Increment 14: **10009487, 10009546, 10010347, 10010439**. Last documented live probe (2026-08-24) was **NOT_READY** for all four (prices, mappings, governed BOM, FX, logistics). **This baseline does not refresh those statuses.** See `docs/ELAND_FOUR_CABLE_STATUS.md` after the post-import probe.

---

## Stabilization queue (post-audit; no architecture change)

1. Official `npm run import:masters`; record actual cable/BOM/conflict counts.  
2. Four-cable orchestrator probe (`persist: false`).  
3. Fix D365/Advaris stubs to **NOT CONNECTED**.  
4. Honest dashboards: live counts or “No data configured”; stop presenting mock OEE as fact.  
5. Report builder: label **REPORT_BUILDER_NOT_IMPLEMENTED** if no runner.  
6. UI sweep of production-relevant dead buttons (JWT exports already Bearer on mapping/RM template).  
7. `prisma validate` / `migrate deploy` / `tsc --noEmit` / `npm test -- --test-concurrency=1`.  
8. Browser login + primary E2E; write remaining acceptance reports.

**SYSTEM READY (software):** Orchestrator, RBAC, inquiry persist-on-READY, Costing Hub, official import path.  
**BUSINESS CONFIGURED:** Not claimed at audit time.
