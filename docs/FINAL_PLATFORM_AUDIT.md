# Final Platform Audit — Energya Connect (Increments 10–14)

**Audit date:** 2026-08-25  
**Workspace:** `D:/Projects/EPC_Platform/energya-connect-platform`  
**Method:** Read-only inspection of `src/App.tsx`, hubs, inquiry/costing UI, `server.ts` route mounts, Prisma schema/migrations, RBAC, `commercialProjection.ts`, `costingOrchestrationService.ts`, tests, `data/source` Excel notes, and existing docs (`FINAL_PLATFORM_GAP_ANALYSIS.md`, `INCREMENT_14_*`, `COSTING_*`).  
**Constraints honored:** No application code changes, no `prisma migrate reset`, no invented prices/KPIs, no claim that browser acceptance passed unless executed.

**Headline verdict**

| Classification | Status |
|----------------|--------|
| **SYSTEM READY** | **Yes** for the governed commercial/costing core: PostgreSQL identity (when `DATABASE_URL` is up), inquiry persist, quotation costing snapshot, single orchestrator `executeCostingForInquiryLine`, formula language `+ - * / ( )` only, scrap precedence, FX LE↔USD with `FX_NOT_CONFIGURED` when missing, customer redaction via `commercialProjection`. |
| **BUSINESS CONFIGURED** | **No.** Official RM list prices are blank at source. Four ELAND identities typically return `NOT_READY` (`PRICE_NOT_CONFIGURED`, `ENGINEERING_NOT_APPROVED`, `FX_NOT_CONFIGURED`, empty governed BOM). Logistics/packing/metal amounts are `NOT_CONFIGURED`. Formula SUM/IF remain disabled by design. |

---

## 1. What works

Evidence-backed production paths:

- **JWT identity (PostgreSQL)** — `identityAuthRouter` is mounted first at `/api/auth` (`server.ts`). Login, refresh, `/me`, lockout tests: `increment12b1.identity.test.ts`.
- **RBAC** — `src/server/rbac.ts` + `permissionCatalog.ts`. Costing Team vs Technical Office split (`denyIfNotCostingTeam`; TO cannot approve RM prices).
- **Cable Master / source BOM / drums / RM import** — Prisma models + Import Center (`/api/master/imports/*`). Official extracts listed in `data/source/README.md`.
- **Engineering mapping + BOM conflict queues** — Technical Office mapping/BOM governance components calling `/api/technical-office` and `/api/cables`.
- **Inquiry CRUD, versions, submit lock** — `CommercialInquiry` / `CommercialInquiryLine` in PostgreSQL; UI `InquiryQuotationWorkspace` → `CommercialInquiryList` / `CommercialInquiryDetail`; APIs `/api/inquiries`.
- **Calculate (server-side)** — `POST /api/inquiries/:id/calculate-cost` and `.../lines/:lineId/calculate-cost` → `calculateInquiryLineCost` → `executeCostingForInquiryLine`. UI does not compute totals in React (`commercialInquiryApiService.ts`).
- **Persist READY snapshots** — `CostingCalculation` + line `costingCalculationId`; persist skipped when `NOT_READY`.
- **Quotation freeze** — `createQuotationFromInquiry` copies `costingCalculationId` (`commercialRepository.ts`).
- **Customer isolation / cost redaction** — `commercialProjection.ts` strips costing IDs, material cost, breakdown for customers.
- **Costing Team workspace** — `CostingHub` → `CostingConfigurationDashboard` with live tabs (Overview, RM prices, scrap, variables, formulas, BOM Costing, assignment, other costs, preview, versions, approval, audit).
- **Formula engine** — tokenizer/AST/evaluator; operators only `+ - * /` (`costingFormulaEngine.ts`). UI `UNSUPPORTED_FUNCTIONS` includes SUM/IF.
- **Scrap precedence** — BOM line % first, else most specific ACTIVE `CostingScrapRule`, then lowest priority; overlap → `BUSINESS_RULE_REQUIRED` (`resolveScrapRate`).
- **Extension layers** — metal/logistics/packing return `NOT_CONFIGURED` when no ACTIVE amount (`costingExtensionLayers.ts`). Logistics `NOT_CONFIGURED` is non-blocking on inquiry calculate (comment in `commercialRepository.ts`).
- **Admin costing APIs** — `/api/admin/costing/*` including preview/validate with `engine: 'executeCostingForInquiryLine'`.
- **Partial dashboard KPIs** — `GET /api/admin/platform/dashboard/kpis` → `getPlatformKpis()` counts from PostgreSQL (not fabricated conversion %). Charts on Internal Dashboard still mix live counts with hardcoded monthly sales.

---

## 2. Partial

- Customer dashboard: inquiry KPIs from API; orders still `INITIAL_SALES_ORDERS` (`CustomerDashboard.tsx`).
- Inquiry UI: header + lines + costing + history exist; drum plan / construction / documents tabs are present in `TAB_LABELS` but drum costing is not in the engine.
- Field/grid: static TS `inquiryFieldManifest.ts`; user column prefs in `localStorage`; Prisma `PlatformFieldDefinition` exists but inquiry UI does not treat it as source of truth.
- Metal/logistics/packing: schema + admin CRUD (`platformAdminRoutes.ts`) exist; amounts typically empty → `NOT_CONFIGURED`.
- FX: `CostingExchangeRate` + inquiry metadata rates; missing LE→USD blocks with `FX_NOT_CONFIGURED` (four-cable report).
- Formula assignment: GLOBAL/FAMILY/CABLE in schema (Inc 14); Cable Master `family` often null → family assignment cannot match.
- Master Data Hub: Import Center is PostgreSQL; quality lists still mix `localStorage` catalog/BOM/drum/RM services.
- Notifications: `NotificationRule` model + SMTP helper; inquiry submit may console-log; no admin-driven routing UI wired as production mail.
- Dual costing run records: inquiry persist writes `CostingCalculation`; `/api/costing/calculate` also writes `CostingRun` via adapter for Inc 10 contract.

---

## 3. Broken (or systematically blocked)

Not “engine crashes”; **honest NOT_READY** and **false-connected stubs**:

- Four ELAND cables (`10009487`, `10009546`, `10010347`, `10010439`) — `INCREMENT_14_FOUR_CABLE_ACCEPTANCE_TEST.md`: no APPROVED governed BOM; DRAFT mappings on three; `PRICE_NOT_CONFIGURED`; FX missing on some RM currencies.
- Inquiry Calculate on those cables **must** fail persist until gates pass. Treating that as a product bug would be incorrect.
- `GET /api/d365/sync-status` and `GET /api/advaris/mes-status` return `connected: true` with invented entity counts (`server.ts`) — **broken as integration truth**.
- Reports Analytics, Production Monitoring, Finance Collections, Sales Orders, Customer Statement, Shipment Tracker: mock data / alerts; not PostgreSQL.
- Sidebar badge `'12 Open'` on Sales Quotations is hardcoded, not a live count (`Sidebar.tsx`).
- Duplicate `app.post('/api/auth/login')` on `server.ts` after identity router is **dead code** (never reached). Misleading for operators.
- `costingReadyCables` KPI counts **all ACTIVE Cable Master rows**, not cables that pass costing gates (`dashboardKpiService.ts`) — **incorrect metric name**.

---

## 4. Duplicated

| Pair | Nature |
|------|--------|
| `identityAuthRouter` vs `server.ts` mock `mockDbUsers` `/api/auth/*` | Duplicate auth implementation; identity wins by mount order. |
| `CostingPricing.tsx` vs `CostingHub` | Re-export only; same UI. |
| `POST /api/costing/calculate` vs inquiry `calculate-cost` | Same orchestrator; different persist contract (`CostingRun` vs inquiry line snapshot). |
| `executeCostingPreview` vs `executeCostingForInquiryLine` | Preview is the inner function; outer adds persist + extension stamp. |
| `costingCalculator` stack vs orchestrator | Second arithmetic path for Quick Cost Quote; can call preview for materials. |
| Administration Costing tab vs Costing Configuration nav | Both can render costing dashboard (`AdministrationHub` + `CostingHub`). |
| `inquiryFieldManifest.ts` vs `PlatformFieldDefinition` | Two field-metadata systems. |
| Client `auditLogService` localStorage vs Prisma `AuditEvent` | Two audit stores. |
| Cable catalog localStorage vs `CableMaster` | Dual catalog until Import Center cutover complete. |
| `InquiryQuotationHome` vs `CommercialInquiryList` | Home grid unused by workspace; list is live. |

---

## 5. Legacy

- `src/components/internal/CostingPricing.tsx` — `@deprecated` re-export of `CostingHub`.
- Increment 10 `CostingRun` / `CostingLine` as **historical + adapter** store (comment: null config version = legacy material-only).
- `executeCostingRun` — adapter only (`costingRepository.ts`).
- `ErpCustomerRequestView.tsx` — not routed from `App.tsx`; adapter remains in `commercialInquiryApiService.ts`.
- `InquiryQuotationHome.tsx` + `inquiryQuotationHomeService.ts` — not the workspace home.
- `TechnicalOfficeCostingWorkbench.tsx` — **no importers**; dead UI still calling `/api/costing/calculate`.
- `server.ts` in-memory user DB and leftover `/api/auth/login`.
- Legacy `POST /api/master-data/import` stub (`persisted: false`).
- Customer sidebar Phase-1 filter hides drum optimizer / statement / shipments even though components exist (`PHASE1_CUSTOMER_TABS`).
- Unused `App.tsx` imports: `SmartConfigurator`, `ProductionTracker` (configurator lives under internal Cable Parameters).

---

## 6. Missing (not invented)

- Governed APPROVED official RM prices for production costing.
- APPROVED engineering mappings + `GovernedBomLine` for ELAND set (source BOM exists; governed 0 lines in Inc 14 probe).
- Cable Master family mapping (UNMAPPED / null).
- LE→USD (and other) **APPROVED/ACTIVE** FX as needed.
- Metal rate / logistics / packing **amounts** (models exist).
- Report builder executing `ReportDefinition` (model exists; UI is Power BI mock).
- Dashboard builder; notification rule engine driving real recipients.
- D365 / MES / Advaris adapters (Layer 3 stubs only).
- Customer profile page; password-reset UX beyond tickets.
- Drum cost in orchestrator (drum master exists for selection).
- Admin field definition driving inquiry forms.

---

## 7. Hardcoded

- Default JWT secret in `server.ts` if `JWT_SECRET` unset.
- `DEFAULT_INCOTERM_CHARGE_PERCENT` in `costingCalculator.ts` (FOB 2, CIF 5, DDP 8, …) — **must not be treated as ELAND freight**.
- Adapter defaults: scrap `2`, margin `6` (`costingCalculatorAdapter.ts` `newSimpleCostRow`).
- Internal Dashboard `monthlySales` / `topCustomers` arrays.
- ReportsAnalytics 71.1% / 84.0% OEE / 96.5% OTD.
- D365/Advaris fake counts and `connected: true`.
- Sidebar “12 Open” badge.
- Formula UI: SUM/IF explicitly disabled (`UNSUPPORTED_FUNCTIONS`).
- ELAND cable list in Costing workspace (`ELAND_WORKSPACE_CABLES`).
- Login demo users still in `mockUsers` / `loginAsUser` for demo auth when allowed (`demoAuth.ts`).

---

## 8. Incorrect storage (wrong source of truth)

| Domain | Wrong / dual store | Authoritative store |
|--------|--------------------|---------------------|
| Session tokens | `localStorage` JWT keys | Acceptable **client cache**; identity is PostgreSQL `UserSession` |
| Inquiry / quotation | — | PostgreSQL |
| Cable/BOM/RM/drum after import | `cableCatalogService`, `cableBomService`, `rawMaterialMasterService`, `drumMasterService` localStorage | `CableMaster`, `CableBomLine`/`GovernedBomLine`, `RawMaterial`, `DrumMaster` |
| Inquiry grid prefs | `localStorage` | OK as UX prefs only |
| TCR custom master | `technicalOfficeServiceV2` / `masterDataServiceV2` localStorage | Prefer PostgreSQL TO/request models |
| Audit (browser) | `auditLogService` localStorage | Prisma `AuditEvent` |
| Notifications in Navbar | React state (lost on refresh) | Not persisted |
| Auth users | `mockDbUsers` (dead for login) | `UserAccount` |

`GET /api/platform/status` honestly reports `DUAL_LOCALSTORAGE_AND_POSTGRESQL`.

---

## 9. Mock

- `src/data/mockData.ts` — sales orders, production, AR, statement, LME-style numbers (not production costing).
- `src/data/mockUsers.ts` — demo login list.
- Reports / production / finance / shipments / statement UIs.
- Integration status endpoints (section 3).
- Quick Cost Quote default percents (section 7).
- Internal Dashboard revenue charts (section 2).

**Not mock:** orchestrator blocking codes; Costing workspace Overview cable KPIs from readiness APIs (Inc 14 report).

---

## 10. Not persisted

- Navbar toasts (`App.tsx` `notifications` state).
- Inquiry column visibility prefs (`localStorage` only).
- Configurator V1/V2 version toggle (`energya_configurator_version`).
- Cutting-length helper localStorage in V2.
- READY costing totals when engine returns `NOT_READY` (by design).
- Customer metal rates in header **do not** become RM prices or LME additives unless a governed `CostingMetalRate` is ACTIVE.

---

## 11. Disconnected APIs

- `/api/d365/sync-status`, `/api/advaris/mes-status` — not ERP/MES.
- Legacy `/api/master-data/import` — parse stub.
- Dead `server.ts` `/api/auth/login` after identity router.
- `TechnicalOfficeCostingWorkbench` → `/api/costing/calculate` — component not mounted.
- `PlatformFieldDefinition` / `NotificationRule` / `ReportDefinition` REST on `platformAdminRouter` — little or no production UI consuming them as the inquiry/report source of truth.
- Gemini AI widget — optional key; not costing.

---

## 12. Obsolete UI

- `CostingPricing` name in comments vs sidebar **Costing Configuration**.
- `InquiryQuotationHome` mock ERP grid.
- `ErpCustomerRequestView`.
- Unmounted Technical Office costing workbench.
- Customer tabs hidden by Phase-1 filter but still implemented (statement, shipments, drum optimizer).
- Reports labeled “Power BI” with no embed.
- Duplicate LoginModal instance at bottom of `App.tsx` (standalone page already handled).

---

## 13. Duplicated logic

- Costing request builders: `costingRequestService` used by inquiry, `/api/costing`, admin preview.
- Commercial pricing (`commercialPricingEngine`) **separate** from manufacturing cost — correct split, but two “price” vocabularies confuse UI labels (`costing_pricing` tab is configuration, not selling price).
- KPI “costing ready” vs orchestrator readiness — different definitions.
- Scrap: BOM line override vs `CostingScrapRule` vs BOM costing tab — same precedence function, multiple UIs.

---

## 14. Costing paths (inventory)

| Path | Entry | Engine | Persist |
|------|-------|--------|---------|
| A. Inquiry line/all | `POST /api/inquiries/.../calculate-cost` | `executeCostingForInquiryLine` persist true | `CostingCalculation` + line FK if READY |
| B. Admin preview | `POST /api/admin/costing/preview` and `/validate` | same, persist false | No |
| C. Readiness probe | `evaluateCostingReadinessForCables` | persist false | No |
| D. Inc 10 adapter | `POST /api/costing/calculate` | `executeCostingRun` → orchestrator persist true | `CostingRun` (+ calculation id) |
| E. Recalculate | `POST /api/costing/:id/recalculate` | adapter | New run, old snapshot kept |
| F. Quick Cost Quote | `POST /api/admin/costing/calculator/preview` | `stackCalculatorRows` ± `executeCostingPreview` | No inquiry snapshot |
| G. Unmounted TO workbench | would call D | adapter | `CostingRun` |

**Path F is not the quotation snapshot path.** Default incoterm/margin percents are sandbox, not ELAND.

---

## 15. Authoritative costing path

```
Inquiry inputs (server only)
  → buildCostingRequestFromInquiryLine
  → executeCostingForInquiryLine
      → engineering gate (on persist)
      → executeCostingPreview
           BOM (governed when required) + RawMaterialPrice (APPROVED)
           + resolveScrapRate
           + selectFormulasForCable (+ - * / only)
           + FX (LE/EGP alias; missing → FX_NOT_CONFIGURED)
      → resolveAllExtensionLayers (metal/logistics/packing; NOT_CONFIGURED if empty)
      → persist CostingCalculation only if READY
  → commercialProjection for customers
  → quotation copies costingCalculationId
```

Commercial selling price = **separate** `commercialPricingEngine` after cost. Cost ≠ list price.

---

## 16. Authoritative models

**Governed business (keep):** `CableMaster`, `CableParameter`, `RawMaterial`, `RawMaterialPrice`, `CableBomLine`, `GovernedBomLine`, `BomDuplicateObservation`, `CableEngineeringMapping`, `DrumMaster`, `DrumCompatibility`, `ImportBatch`/`ImportBatchRow`, `CommercialInquiry`/`Line`, `CommercialQuotation`/`Line`, `CustomerPricingTier`, `CommercialPricingRule`, `CommercialDiscountRule`, `CommercialPricingSnapshot`, `UserAccount`, `Role`, `Permission`, `RolePermission`, `UserRole`, `UserSession`, `Customer`, `CustomerUser`, identity tickets, `AuditEvent`, `TechnicalOfficeRequest`.

**Costing (keep):** `CostingConfiguration`/`Version`, `CostingVariable`, `CostingComponent`, `CostingFormula`/`Version`/`Dependency`, `CostingCalculation`/`Snapshot`, `CostingScrapRule`, `CostingDocumentSequence`, `CostingExchangeRate`, `CostingMetalRate`, `CostingLogisticsRule`, `CostingPackingRule`.

**Adapter / historical (keep, do not treat as inquiry SoT):** `CostingRun`, `CostingLine`.

**Low-code shells (schema ahead of UI):** `PlatformFieldDefinition`, `NotificationRule`, `ReportDefinition`.

See `docs/FINAL_DATA_MODEL.md`.

---

## 17. Data migration

**Preserve and migrate forward (no reset):**

- Official Excel → PostgreSQL via existing import scripts only; **do not** load `ELAND Cost Sheet Required.xlsx` as master prices (`data/regression/` / `data/source/README.md`).
- DRAFT `RawMaterialPrice` rows are not published costs; Costing Team APPROVE is required.
- localStorage catalogs: dual-write then retire after Import Center is the only editor.
- `CostingRun` history: retain; new inquiry work uses `CostingCalculation`.
- Identity users already in PostgreSQL; ignore `mockDbUsers`.

**Do not migrate:** mock sales/production/finance arrays; D365 stub counts; ELAND workbook totals into `RawMaterialPrice`.

---

## 18. Preserve

- Orchestrator, formula tokenizer, scrap resolver, FX resolver, inquiry calculate + quotation snapshot, commercialProjection, RBAC costing vs TO, Import Center validate/commit, CostingConfigurationDashboard (do not redesign), increment 13/14 tests, Prisma migrations as applied history.
- Honest `NOT_READY` / `CONFIGURATION_REQUIRED` behavior.

---

## 19. Remove (candidates — later phase, not this audit)

See `docs/DEPRECATED_FEATURES.md`. Candidates: dead auth routes, `CostingPricing` re-export, unmounted workbench, `InquiryQuotationHome` if unused, D365/Advaris lying status (replace with `NOT_IMPLEMENTED`), hardcoded calculator incoterms **or** isolate UI as “sandbox not for quotation”.

**Do not remove** `CostingRun` until all Technical Office/history consumers are on `CostingCalculation`.

---

## 20. Recommended architecture

Three layers as `docs/FINAL_TARGET_ARCHITECTURE.md`:

1. **Control Plane** — identity, RBAC, costing config, field/notification/report metadata, audit, Import Center governance.
2. **Governed Business** — cable, BOM, RM price, engineering, drums, costing orchestrator, inquiry, quotation, commercial pricing.
3. **Integration** — D365/MES/Advaris **stubs labeled not connected** until real adapters exist.

**Implementation sequence (after this Phase 0):** business configuration (prices, mappings, governed BOM, FX) before new engines; then retire dual storage; then replace mock operational UIs with real counts or hide them; then low-code field/report wiring **without** arbitrary SQL/JS.

---

## Evidence index

| Source | Used for |
|--------|----------|
| `src/App.tsx`, `Sidebar.tsx` | Routing; CostingHub vs calculator; Phase-1 customer tabs |
| `server.ts` | Route mounts; dead mock auth; fake D365/MES |
| `costingOrchestrationService.ts` | Authoritative engine + scrap |
| `costingRepository.ts` | Inc 10 adapter |
| `costingRoutes.ts` / `costingAdminRoutes.ts` / `commercialRoutes.ts` | HTTP surface |
| `commercialProjection.ts` | Customer redaction |
| `costingFormulaEngine.ts` / `CostingConfigurationDashboard.tsx` | `+ - * /`; SUM/IF disabled |
| `costingCalculator.ts` | Second stack + hardcoded incoterms |
| `prisma/schema.prisma` | Authoritative vs leftover models |
| `docs/INCREMENT_14_FOUR_CABLE_ACCEPTANCE_TEST.md` | ELAND NOT_READY |
| `docs/INCREMENT_14_FINAL_ACCEPTANCE_REPORT.md` | SYSTEM READY vs BUSINESS CONFIGURED |
| `data/source/README.md` | Official RM prices blank |

Browser 30-step plan: `docs/FINAL_ACCEPTANCE_TEST_PLAN.md` — **plan only; not executed in this Phase 0 pass.**
