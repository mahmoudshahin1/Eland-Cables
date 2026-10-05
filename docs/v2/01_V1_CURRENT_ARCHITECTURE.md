# 01 — V1 Current Architecture

**Assessment date:** 2026-09-04  
**Method:** Code/docs discovery (`server.ts`, `src/server/*`, `prisma/schema.prisma`, `src/App.tsx`, `shellRoutes.ts`, prior audits).  
**Constraint:** Read-only; no invented capabilities.

---

## 1. Executive summary

Energya Connect V1 is a **single deployable modular monolith**: Vite/React SPA + Express API + Prisma 6 on PostgreSQL. Logical modules exist (`src/platform/modules.ts`); they are **not** separate services. The **governed path** (identity → master data → inquiry/quotation → costing orchestrator → Phase 1 fulfillment) is real. Production, finance, logistics, Power BI–style analytics, and live D365/Advaris are **mock or stubbed by design**.

---

## 2. Stack (as-is)

| Layer | Technology | Evidence |
|-------|------------|----------|
| Frontend | React 19, TypeScript, Vite 6, Tailwind 4 | `package.json`, `src/App.tsx` |
| Backend | Express 4 in `server.ts` + `src/server/` | ADR-001 / ADR-007 |
| ORM / DB | Prisma 6, PostgreSQL | `prisma/schema.prisma` (~66 models) |
| Auth | JWT + bcrypt (`UserAccount.passwordHash`) | `identityAuthRoutes.ts`, `identityService.ts` |
| Tests | `node:test` via `tsx --test` | Workspace convention; not Vitest |
| Deploy | Render docs; compose = Postgres only; **no app Dockerfile** | `docs/release/*`, `APPLICATION_STATUS_REPORT.md` |

**Not present:** NestJS, Redux/Zustand, OpenAPI/Swagger, API rate limiting, Redis/job queue, true multi-tenant SaaS org model beyond customer isolation.

---

## 3. Runtime topology

```text
Browser (SPA)
  └─ AuthContext + shellRoutes (customer | internal)
       └─ JWT Bearer
            └─ Express (server.ts)
                 ├─ identityAuthRouter          /api/auth
                 ├─ adminIdentity + adminCustomer /api/admin
                 ├─ masterDataRouter            /api/master
                 ├─ cableAuthority + TO         /api/cables, /api/technical-office
                 ├─ costing + costingAdmin      /api/costing, /api/admin/costing
                 ├─ platformAdmin               /api/admin/platform
                 ├─ commercial + pricing        /api/inquiries, /api/quotations, /api/commercial-pricing
                 ├─ fulfillment (Phase 1 freeze)/api/commercial-commitments, sales-orders,
                 │                               sales-agreements, agreement-releases
                 ├─ AI assistant                /api/ai/assistant
                 ├─ health/status               /api/platform/*
                 └─ D365 / Advaris stubs        connected: false / NOT_CONNECTED
                      └─ Prisma → PostgreSQL
```

Express **does not hot-reload routes**; new mounts require process restart (workspace rule).

---

## 4. Frontend architecture

| Concern | Current state | Evidence |
|---------|---------------|----------|
| Routing | Dual shell `/customer/*` vs `/internal/*`; tab-as-path via `shellRoutes.ts` | `App.tsx`, `shellRoutes.ts` |
| State | React Context (`AuthContext`) + local component state | No global store |
| UI kit | `src/components/ui/**`, costing `CostingUiPrimitives`, `BrandLogo` | `docs/design/DESIGN_SYSTEM.md` |
| Customer Phase-1 nav | Only dashboard, inquiries, support linked | `Sidebar.tsx` `PHASE1_CUSTOMER_TABS` |
| Costing chrome | Full-bleed shell when on costing tab | `CostingHub` / `CostingWorkspaceShell` |

Major live workspaces: `InquiryQuotationWorkspace`, `CommercialFulfillmentWorkspace`, `CostingHub` (v3), `MasterDataHub`, `TechnicalOffice`, `AdministrationHub`.

---

## 5. Domain domains (logical)

Aligned to `PLATFORM_MODULES` and Prisma groupings:

| Domain | Status | Core artifacts |
|--------|--------|----------------|
| Identity / RBAC | Live | `UserAccount`, `Role`, `Permission`, `identityAuthRoutes`, `rbac.ts`, `permissionCatalog.ts` |
| Customer | Live | `Customer`, `CustomerUser`, `adminCustomerRoutes`, `customerScope.ts` |
| Cable / params | Live + hybrid UI | `CableMaster`, `CableParameter`, Import Center |
| Engineering / TO | Live queues + localStorage TCR | `CableEngineeringMapping`, `TechnicalOfficeRequest`, BOM governance |
| BOM / RM | Live PG + dual-write UI | `CableBomLine`, `GovernedBomLine`, `RawMaterial`, `RawMaterialPrice` |
| Drum | Live master + optimize APIs | `DrumMaster`, `DrumCompatibility` (often empty), `drumOptimizationService` |
| Costing | Live orchestrator; config gated | `executeCostingForInquiryLine`, `/api/admin/costing/*`, Costing V2 models |
| Pricing (commercial) | Live | `CommercialPricingRule`, `/api/commercial-pricing/calculate` |
| Inquiry / Quotation | Live | `CommercialInquiry*`, `CommercialQuotation*` |
| Fulfillment | **Frozen** domain | Commitment → SO / Agreement / Release; Direct MTS |
| Integration | Stub | `d365Adapters.ts` → `NOT_IMPLEMENTED` (ADR-004) |
| Production / Finance / Logistics UI | Mock | `ProductionMonitoring`, `FinanceCollections`, customer shipment/statement |
| Platform low-code | Schema + thin API | `PlatformFieldDefinition`, `NotificationRule`, `ReportDefinition` |

---

## 6. Persistence modes

| Mode | Where | Notes |
|------|-------|-------|
| PostgreSQL (SoT) | Identity, commercial docs, costing config/calcs, import batches, most masters after Import Center | Required for production paths |
| Dual-write / localStorage | Some catalog/BOM/RM/drum browsers; TCR queue; client audit helper | `PERSISTENCE_MODE` in `modules.ts`; `KNOWN_LIMITATIONS.md` |
| Mock fixtures | Production, finance, shipments, TDS, customer SO list | Not ERP data |

---

## 7. Security architecture (as-is)

1. **Authentication:** JWT via `resolveRequestActor`; refresh sessions in `UserSession`.
2. **Authorization:** Dual stack — granular `module:resource:action` (`permissionCatalog.ts`) + legacy module flags mapped in `rbac.ts` / `rbacEngine.ts`.
3. **Customer isolation:** `customerScope.ts` + `commercialProjection.ts` (cost redaction for customers).
4. **Gaps:** Many master **GET** and drum optimize endpoints lack auth; UI hide ≠ API deny on older paths; no rate limit; demo auth must stay off in production.

See also `docs/RBAC_PERMISSION_MODEL.md`, `docs/USER_SECURITY_MODEL.md`.

---

## 8. Workflow / audit / versioning (as-is)

| Capability | Implementation |
|------------|----------------|
| Inquiry versions | `versionNo`, `isCurrent`, `supersedesInquiryId`, `inquiryGroupKey` |
| Quotation revisions | Row-per-revision; approval immutability rules |
| Costing config versions | `CostingConfigurationVersion` + formula versions |
| RM / pricing / scrap / FX workflows | `PriceWorkflowStatus` / submit-approve patterns |
| Engineering mapping | `MappingWorkflowStatus` |
| Audit | Server `AuditEvent`; client `auditLogService` localStorage (dual) |
| Notifications | `NotificationRule` + SMTP helper; not full production routing UI |

---

## 9. Integration posture

| System | Status | Evidence |
|--------|--------|----------|
| D365 F&O | `NOT_IMPLEMENTED` / HTTP `NOT_CONNECTED` | ADR-004; `GET /api/d365/sync-status` |
| Advaris MES | Same stub pattern | `GET /api/advaris/mes-status` |
| Phase 1 fulfillment | Standalone EPC records; `integrationStatus = NOT_SENT` | Freeze notice |
| AI assistant | Live Gemini handler when configured | `POST /api/ai/assistant` |

---

## 10. Recommendation template (architecture evolution)

| Dimension | CURRENT STATE | TARGET STATE (V2) | REASON | MIGRATION IMPACT | RISK | DEPENDENCIES |
|-----------|---------------|-------------------|--------|------------------|------|--------------|
| Deployable shape | Modular monolith | Keep modular monolith; clearer module packages | Avoid microservices cost before ERP completeness | Low if folder/contract only | Premature split | This assessment pack |
| Persistence | Dual PG + localStorage | PostgreSQL SoT; retire dual-write | Single truth | Medium UI cutover | Regression on Import Center | Master data cutover plan |
| Module UX | Tab hubs | ERP Workspace pattern per module | Operator familiarity (D365-inspired) | Medium FE | Scope creep into redesign | Doc 09 + Phase 0 freeze |
| Integration | Honest stubs | Adapters only until ERP ready | ADR-004 | Low until Phase 5+ | Fake “connected” claims | Freeze + gap analysis |

---

## 11. Source-of-truth documents (reuse)

Do not contradict without noting status:

- `docs/APPLICATION_STATUS_REPORT.md`
- `docs/FINAL_PLATFORM_AUDIT.md`
- `docs/PHASE1_QUOTE_TO_CASH_FREEZE.md`
- `docs/D365_FO_QUOTE_TO_CASH_PHASE1_GAP_ANALYSIS.md`
- `docs/KNOWN_LIMITATIONS.md`
- `docs/ARCHITECTURE_DECISIONS.md` (ADR-004)
- `docs/DRUM_SELECTION_OPTIMIZATION_ASSESSMENT.md`
- `docs/FINAL_LOW_CODE_ARCHITECTURE.md`
