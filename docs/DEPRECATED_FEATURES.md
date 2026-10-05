# Deprecated Features — Candidates for Later Removal

**Date:** 2026-08-29  
**Policy:** Do not delete in Phase 0. Preserve adapters until every consumer is switched. Do not remove `CostingRun` history.

---

## Obsolete UI (unmounted or re-export)

| Asset | Evidence | Later action |
|-------|----------|--------------|
| `src/components/internal/CostingPricing.tsx` | `@deprecated` re-export of `CostingHub` | Remove after grep-clean |
| `src/components/inquiry-quotation/InquiryQuotationHome.tsx` | Not used by `InquiryQuotationWorkspace` | Remove with `inquiryQuotationHomeService` if tests allow |
| `src/components/common/ErpCustomerRequestView.tsx` | Not in `App.tsx` | Remove; drop legacy adapter in `commercialInquiryApiService.ts` |
| `TechnicalOfficeCostingWorkbench.tsx` | No importers | Remove or remount on purpose as adapter UI |
| Duplicate `LoginModal` in logged-in `App.tsx` | Second instance after session | Remove duplicate |
| Unused `App.tsx` imports `SmartConfigurator`, `ProductionTracker` | Configurator is internal hub | Clean imports |

---

## Duplicate / dead APIs

| Asset | Evidence | Later action |
|-------|----------|--------------|
| `server.ts` `mockDbUsers` + `POST /api/auth/login` (and sibling register/users) | Mounted **after** `identityAuthRouter`; never reached for `/login` | Delete dead routes; keep identity |
| `POST /api/master-data/import` | `persisted: false` stub | Remove or return 410 |
| `GET /api/auth/dotnet9-code` | Sample .NET 9 / SQL Server payload | Removed from `server.ts`. |
| `GET /api/d365/sync-status`, `GET /api/advaris/mes-status` | HTTP stubs: `connected: false`, `status: 'NOT_CONNECTED'`, `entityCounts`/`liveJobs` null. D365 note: must not report `connected:true`. Adapters remain `NOT_IMPLEMENTED`. | Keep as honest stubs until live ERP/MES; do not flip `connected` to true |

---

## Legacy costing (keep adapter until cutover)

| Asset | Role | Later action |
|-------|------|--------------|
| `executeCostingRun` / `/api/costing/*` | Inc 10 contract → orchestrator | Keep as adapter; do not reintroduce Inc 10 math |
| `CostingRun` / `CostingLine` | Historical + adapter persist | Keep tables |
| `costingCalculator` + Quick Cost Quote | Sandbox stack + hardcoded incoterm % | Relabel or isolate; **do not** use for quotation |
| Default scrap 2% / margin 6% in `costingCalculatorAdapter.ts` | UI defaults | Remove defaults or force blank |

---

## Mock data (not production SoT)

| Asset | Used by |
|-------|---------|
| `src/data/mockData.ts` (`INITIAL_SALES_ORDERS`, production, AR, statement, families) | `SalesOrders`, `CustomerDashboard` orders, `ProductionMonitoring`, `FinanceCollections`, `CustomerStatement`, `TechnicalOffice` `CABLE_FAMILIES` |
| Hardcoded shipments in `ShipmentTracker.tsx` | Customer tab (hidden in Phase-1 sidebar) |
| Hardcoded charts in `InternalDashboard.tsx`, `ReportsAnalytics.tsx` | Internal nav |
| `src/data/mockUsers.ts` + `loginAsUser` | Demo auth when `demoAuth` allows |

Replace with PostgreSQL or hide nav entries. Do not feed mock LME into orchestrator.

---

## Incorrect storage (client)

| Store | Used by | Later action |
|-------|---------|--------------|
| Cable catalog / BOM / RM / drum localStorage | Master Data Hub quality lists, TO catalog tab | Dual-write then delete after Import Center only |
| `auditLogService` localStorage | Browser audit helper | Use `AuditEvent` only |
| Inquiry home `VIEWS_KEY` localStorage | `InquiryQuotationHome` | Dies with that UI |
| TCR / custom master localStorage in V2 services | Configurator TO | Move to PostgreSQL |

JWT in localStorage is a **session cache**, not a domain SoT.

---

## Duplicate logic / two doors

- Administration → Costing tab vs sidebar Costing Configuration (same dashboard).
- `inquiryFieldManifest` vs `PlatformFieldDefinition`.
- KPI `costingReadyCables` vs orchestrator readiness.

---

## Do not deprecate

- `executeCostingForInquiryLine`
- Inquiry calculate + `commercialProjection`
- CostingConfigurationDashboard
- Import Center commit path
- Prisma identity
- Formula engine `+ - * /`
- Scrap precedence and FX `NOT_CONFIGURED`

---

## Suggested removal order (future phases)

1. Integration status JSON is already `connected: false`; still not live D365/Advaris.  
2. Dead `server.ts` auth.  
3. Unmounted costing workbench + `CostingPricing` re-export.  
4. Hide or watermark mock operational modules.  
5. Retire localStorage masters after cutover.  
6. Sandbox calculator defaults.  
7. `InquiryQuotationHome` / ERP request view.
