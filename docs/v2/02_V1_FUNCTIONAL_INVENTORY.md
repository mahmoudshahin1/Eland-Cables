# 02 — V1 Functional Inventory

**Assessment date:** 2026-09-04  
**Rule:** Only functions evidenced by components, routes, services, or Prisma models. Mock/stub called out explicitly.

Legend: **Live** = PostgreSQL + JWT API · **Hybrid** = API + localStorage · **Mock** · **Stub** · **Legacy/unmounted**.

---

## 1. Inventory matrix (major screens)

| Screen / Workspace | Location | Module (logical) | Purpose | Primary entities | Primary APIs | Persistence | Security | Workflow / audit | Dependencies |
|--------------------|----------|------------------|---------|------------------|--------------|-------------|----------|------------------|--------------|
| Login | `src/auth/LoginPage.tsx` | Auth | Sign-in | `UserAccount`, `UserSession` | `/api/auth/login`, `/refresh-token`, `/me` | Live | Public login | Lockout counters | Identity seed |
| Profile | `profile/UserProfilePage.tsx` | Auth | Password / profile | `UserAccount` | `/api/auth/change-password` | Live | Authenticated | — | AuthContext |
| Customer Dashboard | `customer/CustomerDashboard.tsx` | Customer portal | Inquiry KPIs | `CommercialInquiry` | `GET /api/inquiries` | Live (+ mock orders) | Customer | — | Customer scope |
| My Inquiries | `customer/PriceEstimation.tsx` → `InquiryQuotationWorkspace` | Inquiry & Quotation | Customer inquiry CRUD | Inquiry + lines | `/api/inquiries/**` | Live | Customer + manage inquiry | Submit / version / cancel | Cable master, costing |
| Support Center | `customer/SupportCenter.tsx` | Support | Help UI | — | None | Mock/static | Phase-1 nav | — | — |
| Customer Sales Orders | `common/SalesOrders.tsx` | Sales (portal) | Order browser | — | Fixtures | Mock | URL; sidebar hidden | — | — |
| Drum Optimizer (portal) | `customer/DrumOptimizer.tsx` | Drum | Client packing | `DrumMaster` | `GET /api/master/drums` + catalog | Hybrid | Sidebar hidden | — | Drum master |
| Statement / Invoices | `customer/CustomerStatement.tsx` | AR (portal) | Aging display | — | Fixtures | Mock | Hidden nav | — | — |
| Shipment Tracker | `customer/ShipmentTracker.tsx` | Logistics | Tracking UI | — | Inline mock | Mock | Hidden nav | — | — |
| TDS Library | `customer/TdsDocumentLibrary.tsx` | Documents | Doc list | — | Inline | Mock | Hidden nav | — | — |
| Process / Journey | `customer/ElandProcessFlowDiagram.tsx` | Marketing | Process diagram | — | None | Static | Non-Eland | — | — |
| Internal Dashboard | `internal/InternalDashboard.tsx` | Analytics | Command center | Counts | `/api/admin/platform/dashboard/kpis` | Hybrid (some hardcode) | `overview` | — | KPI service |
| Technical Office | `internal/TechnicalOffice.tsx` | Engineering | Mapping, BOM gov, TCR, catalogs | Mapping, Bom conflicts, TO request | `/api/master/engineering-mappings*`, `bom-conflicts*`, prices, pricing rules; TCR localStorage | Hybrid | `technicalOffice` | Mapping/BOM/price workflows | Cable, BOM, RM |
| Cable Parameters | `cable-configurator/CableConfiguratorHub.tsx` | Engineering / Cable | V1+V2 parameter selection | Params, compatibility | `/api/cables/*`, `/api/technical-office/requests` | Hybrid | Nav always; gate ≈ overview | TO request create | Parameter masters |
| Costing Hub | `internal/CostingHub.tsx` → `costing/v3/*` | Costing | Config, prices, scrap, FX, preview | Costing* models | `/api/admin/costing/**` | Live | `costingPricing` / Costing Team | Submit/approve/activate | RM, BOM, FX |
| Sales Quotations | `internal/SalesQuotations.tsx` | Inquiry & Quotation | Internal commercial workspace | Inquiry, Quotation | `/api/inquiries/**`, quotations | Live | `salesQuotations` | Pricing + commercial approval | Costing, cable |
| Fulfillment Workspace | `fulfillment/CommercialFulfillmentWorkspace.tsx` | Commercial / Sales | SO, agreements, Direct MTS | Commitment, SO, Agreement, Release | `/api/sales-orders*`, agreements, commitments, releases | Live (**frozen domain**) | `salesQuotations` + internal | Confirm / release | Phase 1 freeze |
| Production Monitoring | `internal/ProductionMonitoring.tsx` | Production | Factory UI | — | Fixtures | Mock | `ordersProduction` | Banner NOT_CONNECTED | Advaris stub |
| Logistics (alias) | Same as Production | Logistics | Alias mock | — | Fixtures | Mock | `ordersProduction` | — | — |
| Finance & Collections | `internal/FinanceCollections.tsx` | Finance AR | Ledger UI | — | Fixtures | Mock | `financeCollections` | NOT_IMPLEMENTED | — |
| Master Data Hub | `internal/MasterDataHub.tsx` | Master Data | Quality, browsers, import | Cable, BOM, RM, Drum | `/api/master/**` + localStorage browsers | Hybrid | `masterData` | Import PREVIEW/COMMIT | Import pipeline |
| Reports Analytics | `internal/ReportsAnalytics.tsx` | Reporting | Analytics placeholder | KPI strip | Dashboard KPIs | Partial | `reportsAnalytics` | No report engine | ReportDefinition unused in UI |
| Administration | `internal/AdministrationHub.tsx` | Admin / Security | Users, roles, permissions | User, Role, Permission | `/api/admin/users*`, roles, permissions | Live | `userManagement` | Role assign audit | Permission catalog |
| Customers admin | `AdministrationCustomersPanel.tsx` | Customer Mgmt | Customer + assignments | Customer, CustomerUser | `/api/admin/customers*` | Live | Admin customer perms | Activate/deactivate | Identity |

---

## 2. Shared commercial components

| Component | Purpose | APIs | Notes |
|-----------|---------|------|-------|
| `CommercialInquiryList` / `Detail` | Inquiry CRUD UI | `/api/inquiries` | Authoritative list (not `InquiryQuotationHome`) |
| `CommercialFulfillmentPanel` | Quote → SO / Agreement | Quotation approve + commitment APIs | Embedded in detail |
| `CableSearchSelectModal` | Cable + cutting/drum | `/api/master/cables`, drum validate/optimize | Primary STEP-6 entry |
| `DrumSelectionWorkflowPanel` | Manual/auto drum plan | `/api/master/drums/candidates\|validate\|optimize` | Post-assessment productization |
| `DrumCuttingScheduleTable` | Multi-drum schedule | Persisted on inquiry line JSON | Domain: `inquiryDrumSchedule` |

---

## 3. API functional groups

| Group | Prefix | Router file | Status |
|-------|--------|-------------|--------|
| Auth | `/api/auth` | `identityAuthRoutes.ts` | Live; forgot-password soft stub; register 403 |
| Admin identity | `/api/admin` | `adminIdentityRoutes.ts` | Live RBAC |
| Admin customers | `/api/admin` | `adminCustomerRoutes.ts` | Live |
| Master data + drums | `/api/master` | `masterDataRoutes.ts` | Live; many GETs open |
| Cable authority | `/api/cables` | `cableAuthorityRoutes.ts` | Live; open auth on evaluate |
| Technical office | `/api/technical-office` | `cableAuthorityRoutes.ts` | Live create/list |
| Costing runtime | `/api/costing` | `costingRoutes.ts` | Live calculate |
| Costing admin | `/api/admin/costing` | `costingAdminRoutes.ts` | Live (~90 routes) |
| Platform admin | `/api/admin/platform` | `platformAdminRoutes.ts` | Fields/notifications/reports defs + KPIs |
| Commercial pricing | `/api/commercial-pricing` | `commercialPricingRoutes.ts` | Live calculate |
| Inquiries / quotations | `/api/inquiries`, `/api/quotations` | `commercialRoutes.ts` + attachers | Live + customer scope |
| Fulfillment | commitments / sales-orders / agreements / releases | `commercialCommitmentRoutes.ts` | Live; D365 NOT_SENT |
| AI | `/api/ai/assistant` | `aiAssistantHandler.ts` | Live when keyed |
| D365 / MES | `/api/d365/sync-status`, `/api/advaris/mes-status` | `server.ts` inline | Stub |

---

## 4. Domain engines (non-UI)

| Engine | Location | Purpose | Invariant |
|--------|----------|---------|-----------|
| Costing orchestrator | `costingOrchestrationService` → `executeCostingForInquiryLine` | Single costing path for inquiry lines | READY gates; Option B freeze |
| Formula engine | `costingFormulaEngine.ts` | `+ - * / ( )` only | No arbitrary JS |
| Commercial pricing | `calculateCommercialSellingPrice` | Markup/margin rules | Workflow-approved rules |
| Cable authority | `evaluateCableAuthority` | Configuration validity | Domain errors not silent zeros |
| Drum capacity / optimize | `drumCapacityCalculator`, `drumOptimizationService` | Capacity + plan optimize | No invented engineering values |
| Import pipeline | `importPipelineService` | Excel → PG | Preview then commit |
| Customer projection | `commercialProjection.ts` | Redact costs for customers | Isolation |
| D365 adapters | `d365Adapters.ts` | Future ERP | Always NOT_IMPLEMENTED today |

---

## 5. Legacy / dead / duplicated (inventory flags)

| Item | Status | Evidence |
|------|--------|----------|
| `InquiryQuotationHome` | Unmounted | Superseded by `CommercialInquiryList` |
| `ErpCustomerRequestView` | Unmounted | Adapter remnants |
| `CostingPricing.tsx` | Deprecated re-export | → `CostingHub` |
| `TechnicalOfficeCostingWorkbench` | Dead UI risk | Audit notes no importers |
| Client `auditLogService` vs `AuditEvent` | Dual audit | `KNOWN_LIMITATIONS.md` |
| `inquiryFieldManifest` vs `PlatformFieldDefinition` | Dual field metadata | Low-code final doc |
| `CostingRun` vs `CostingCalculation` | Dual persist contracts | Inc 10 adapter + V2 calc |
| Customer journey / ProductionTracker | Dead tabs | Map to dashboard |

---

## 6. Forms, tables, workflows, reports (cross-cut)

| Concern | Current |
|---------|---------|
| Forms | Custom React forms (`ui/Form`); no RHF standard |
| Tables | `ui/Table` + domain grids; column prefs often localStorage |
| Workflows | Entity-specific status enums + action endpoints (not a generic WF engine) |
| Approvals | Pricing, commercial quotation, RM price, scrap, FX, engineering mapping, BOM governance |
| Reports | `ReportDefinition` CRUD API only; no execution engine |
| Dashboards | Partial live KPIs; mock charts remain |

---

## 7. Completeness vs target ERP (honest)

| Area | Inventory verdict |
|------|-------------------|
| Quote-to-cash commercial core | **Present and substantial** |
| Costing / pricing / engineering masters | **Present** (config/data gates remain) |
| Drum selection | **Present APIs + UI in progress** |
| Inventory / warehouse / procurement / GL / AP / cash / FA | **Absent as modules** (no Prisma models) |
| Production / quality / logistics ops | **UI mock only** |
| Support / cases / KB | **Support static only**; no Case/KB models |
| D365 | **Correctly not implemented** |

---

## 8. Recommendation

| CURRENT STATE | TARGET STATE | REASON | MIGRATION IMPACT | RISK | DEPENDENCIES |
|---------------|--------------|--------|------------------|------|--------------|
| Inventory scattered across hubs + mocks | Module-tagged inventory + hide or replace mocks | Prevent false “complete ERP” claims | Low (docs + nav policy) | Hiding needed demos | Product decision on mock screens |
| Dual field/audit/catalog stores | One SoT per concern | Integrity | Medium cutover | Temporary dual-read | Docs 06, 08 |
