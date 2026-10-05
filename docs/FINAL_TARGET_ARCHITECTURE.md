# Final Target Architecture

**Date:** 2026-08-25  
**Status:** Target mapping of **existing** folders and routes. Not a greenfield rewrite. Phase 0 audit only.

```
LAYER 1 — PLATFORM CONTROL PLANE
LAYER 2 — GOVERNED BUSINESS SERVICES
LAYER 3 — INTEGRATION (future; stubs today)
```

Low-code rule: metadata and formula `+ - * / ( )` only — **not** arbitrary JS/SQL. Protected services (BOM approval, price overlap, cable authority, costing gates, customer isolation, audit immutability, RBAC) stay in code.

---

## Layer 1 — Control Plane

Administration, identity, costing configuration, platform metadata, import governance, audit.

| Area | Existing UI | Existing routes / modules |
|------|-------------|---------------------------|
| Login / session | `src/components/auth/LoginModal.tsx`, `src/auth/loginRoutes.ts` | **Live:** `app.use('/api/auth', identityAuthRouter)` → `identityAuthRoutes.ts`. **Dead duplicate:** later `app.post('/api/auth/login')` on `mockDbUsers` in `server.ts`. |
| Users / roles / customers | `AdministrationHub.tsx` | `/api/admin` → `adminIdentityRoutes.ts`, `adminCustomerRoutes.ts` |
| Permissions | `permissionCatalog.ts`, `rbac.ts`, `rbacEngine.ts` | Enforced on routers |
| Costing configuration | `CostingHub.tsx` → `CostingConfigurationDashboard.tsx`; Administration tab also embeds dashboard | `/api/admin/costing` → `costingAdminRoutes.ts` |
| Extension config (metal / logistics / packing) | Costing “Other Costs”; `AdministrationCostingPanel.tsx` | `/api/admin/platform/costing/*` → `platformAdminRoutes.ts` + Prisma models |
| Field / notification / report metadata | Partial; inquiry uses TS manifest | `/api/admin/platform/fields`, `/notifications/rules`, `/reports` |
| Dashboard KPI API | `InternalDashboard.tsx` (partial consume) | `GET /api/admin/platform/dashboard/kpis` → `dashboardKpiService.ts` |
| Master import governance | `MasterDataHub.tsx` Import tab | `/api/master` → `masterDataRoutes.ts`; `/api/platform` → `platformDbRouter` |
| Audit | Costing audit tab; inquiry Activity | Prisma `AuditEvent`; **also** unused-as-SoT `src/platform/audit/auditLogService.ts` (localStorage) |
| Platform status | — | `GET /api/health`, `GET /api/platform/status` |

**Out of Layer 1 (do not put here):** manufacturing cost math, cable engineering decisions.

---

## Layer 2 — Governed Business

Cable, BOM, raw material, price, costing execution, inquiry, quotation, Technical Office, drums.

| Domain | UI | Backend |
|--------|----|---------|
| Cable authority | Technical Office mapping; Cable Parameters hub | `/api/cables` `cableAuthorityRoutes.ts` |
| Technical Office | `TechnicalOffice.tsx` (mapping, BOM gov, TCR, excel sync, params) | `/api/technical-office` |
| Cable configurator | `CableConfiguratorHub.tsx` V1/V2 | Selection engines in `src/components/cable-configurator/` (client) + master APIs |
| BOM / RM / drums | Master Data Hub + TO BOM queue | Prisma + import pipeline `importPipelineService.ts` |
| RM price governance | Costing workspace Prices tab; TO price queue | `/api/admin/costing/raw-material-prices*`; `rawMaterialPriceGovernanceService.ts` |
| Costing execution | Inquiry Costing tab; admin Preview | **Authoritative:** `costingOrchestrationService.executeCostingForInquiryLine`. Adapters: `costingRepository.executeCostingRun`, `/api/costing/*` |
| Inquiry / quotation | `InquiryQuotationWorkspace` via customer `PriceEstimation` and internal `SalesQuotations` | `/api/inquiries`, `/api/quotations` `commercialRoutes.ts` |
| Commercial selling price | Quotation pricing routes | `/api/commercial-pricing`, `/api/master/commercial-pricing-rules` — **not** the costing orchestrator |
| Customer projection | Same inquiry UI, redacted | `commercialProjection.ts` |
| Drum selection | Inquiry drum field; `DrumOptimizer.tsx` (customer tab hidden in Phase 1 sidebar) | `drumPlanService.ts` / drum master APIs — **not** drum cost in engine until packing rule configured |
| Quick Cost Quote | `CostingCalculator.tsx` (internal tab) | `/api/admin/costing/calculator/preview` — **sandbox stack**, not quotation SoT |

---

## Layer 3 — Integration

| Stub | File | Honest status |
|------|------|----------------|
| D365 F&O | `GET /api/d365/sync-status` in `server.ts` | Honest stub: `connected: false` / `NOT_CONNECTED`. Target: adapters per ADR-004; design baseline [`D365_FO_QUOTE_TO_CASH_INTEGRATION_SPECIFICATION.md`](./D365_FO_QUOTE_TO_CASH_INTEGRATION_SPECIFICATION.md); Phase 1 gaps [`D365_FO_QUOTE_TO_CASH_PHASE1_GAP_ANALYSIS.md`](./D365_FO_QUOTE_TO_CASH_PHASE1_GAP_ANALYSIS.md). |
| Advaris MES | `GET /api/advaris/mes-status` | Same problem (`connected: true`, OEE string). |
| Production / logistics / finance screens | `ProductionMonitoring.tsx`, `FinanceCollections.tsx`, `ShipmentTracker.tsx` | Mock arrays; no MES/ERP feed. |
| SMTP notifications | `notificationService.ts` | Optional env; console fallback. |
| Gemini AI | `AiAssistantWidget.tsx` + `server.ts` GenAI | Optional; not costing. |

`GET /api/platform/status` documents `d365DomainAdapters: 'NOT_IMPLEMENTED'`. The D365 sync-status route matches that honesty (`connected: false`). Design baseline: [`D365_FO_QUOTE_TO_CASH_INTEGRATION_SPECIFICATION.md`](./D365_FO_QUOTE_TO_CASH_INTEGRATION_SPECIFICATION.md). Phase 1 standalone commercial fulfillment is **FROZEN** (2026-08-31): Quotation/Agreement MTO paths plus Direct MTS (no commitment); D365 still `NOT_IMPLEMENTED` — see [`PHASE1_QUOTE_TO_CASH_FREEZE.md`](./PHASE1_QUOTE_TO_CASH_FREEZE.md) and [`D365_FO_QUOTE_TO_CASH_PHASE1_GAP_ANALYSIS.md`](./D365_FO_QUOTE_TO_CASH_PHASE1_GAP_ANALYSIS.md). Next: UI refinement + operational workflow.

---

## Folder → layer map (src)

| Path | Layer |
|------|-------|
| `src/server/identity*.ts`, `adminIdentity*`, `adminCustomer*`, `rbac.ts`, `platformAdminRoutes.ts`, `platformConfigurationRepository.ts` | 1 |
| `src/server/costingAdminRoutes.ts`, `costingFormulaRepository.ts`, `costingScrapRuleRepository.ts`, `costingExchangeRateRepository.ts` | 1 (config) |
| `src/server/costingOrchestrationService.ts`, `costingExtensionLayers.ts`, `costingReadinessService.ts`, `costingRepository.ts` | 2 (execution; repository is adapter) |
| `src/server/commercialRoutes.ts`, `commercialRepository.ts`, `commercialProjection.ts`, `commercialPricingRoutes.ts` | 2 |
| `src/server/masterData*`, `cableAuthorityRoutes.ts`, `governanceRepository.ts` | 2 |
| `src/domain/costingEngine.ts`, `costingFormulaEngine.ts`, `costingFormulaAssignment.ts`, `currencyConversion.ts` | 2 |
| `src/domain/costingCalculator.ts` | 2 sandbox / Layer 1 tool — **not** inquiry persist |
| `src/components/costing/` | 1 UI |
| `src/components/inquiry-quotation/` | 2 UI |
| `src/components/internal/TechnicalOffice.tsx`, `MasterDataHub.tsx` | 2 |
| `src/components/internal/AdministrationHub.tsx` | 1 |
| `src/components/internal/InternalDashboard.tsx`, `ReportsAnalytics.tsx` | 1 (intended); currently mixed mock |
| `src/components/internal/ProductionMonitoring.tsx`, `FinanceCollections.tsx` | 3 placeholders |
| `src/data/mockData.ts` | Not a layer — retire from production paths |

---

## Single costing path (Layer 2)

Unchanged from Increment 13/14:

Inquiry → `executeCostingForInquiryLine` → BOM + APPROVED `RawMaterialPrice` + scrap + formulas → extension layers (`NOT_CONFIGURED` if empty) → `CostingCalculation` → commercial pricing (separate) → quotation snapshot.

See `docs/FINAL_COSTING_ARCHITECTURE.md`.
