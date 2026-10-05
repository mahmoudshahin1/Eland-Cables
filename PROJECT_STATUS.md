# Energya Connect Platform — Project Status

**Report date:** 29 August 2026  
**Scope:** Factual inventory of this repository only. Ambiguities are marked `[NEEDS VERIFICATION]`. Environment **values** are omitted (names only).

---

## 1. Project Overview

- **Project name:** Energya Connect Platform (UI title: Energya Connect). `package.json` `name` is still `react-example` (private, version `0.0.0`).
- **Purpose:** B2B application for a cable manufacturing company (Energya Cables / Elsewedy Helal). README describes a CEO-accepted Google AI Studio prototype evolved in place, not a greenfield ERP rebuild.
- **Business domain:** Cable product master (material numbers, BOM, raw materials, drums), B2B customer portal (inquiries, quotations, support), internal technical office / configurator, costing configuration, sales quotations, identity/RBAC, and mock operational screens (orders, production, finance, shipments) until ERP/MES are connected.

---

## 2. Tech Stack

- **Languages / UI:** TypeScript (`typescript` ~5.8.2, target ES2022), React 19 (`react` / `react-dom` ^19.0.1), React Router 6 (`react-router-dom` ^6.28.0), Tailwind CSS 4 (`tailwindcss` / `@tailwindcss/vite` ^4.1.14).
- **Runtime / servers:** Node (no `engines` field; `@types/node` ^22.14.0). Express 4 (`express` ^4.21.2) hosts the API and, in development, Vite middleware. Dev entry: `tsx server.ts`. Production build: Vite SPA + esbuild-bundled `dist/server.cjs`.
- **Frontend tooling:** Vite 6 (`vite` ^6.2.3), `@vitejs/plugin-react` ^5.0.4, `tsx` ^4.21.0, `esbuild` ^0.25.0.
- **Database:** PostgreSQL (`prisma/schema.prisma` `provider = "postgresql"`). ORM: Prisma 6 (`prisma` / `@prisma/client` ^6.16.2). Local hosting: `docker-compose.yml` service `postgres` (`postgres:16-alpine`, container `energya-connect-db`, volume `energya_pgdata`). App hosting for the Node process is not defined in that compose file. No application `Dockerfile` in the repo.
- **Authentication:** Custom JWT (`jsonwebtoken` ^9.0.3) with bcrypt password hashes (`bcryptjs` ^2.4.3). PostgreSQL `UserAccount` / sessions / roles (Increment 12 B1). Demo in-memory login still exists in `AuthContext` when `NODE_ENV` is not production (`demoAuth.ts`). Dead duplicate auth handlers remain in `server.ts` after the identity router (see §6 / §8).
- **Payment / billing provider:** None in `package.json` or route inventory.
- **Third-party integrations and APIs:**
  - Google Gemini via `@google/genai` (`POST /api/ai/assistant`, model `gemini-3.6-flash`); key name `GEMINI_API_KEY`.
  - D365 F&O and Advaris MES: status HTTP stubs (`connected: false`, `NOT_CONNECTED`) plus domain adapters returning `NOT_IMPLEMENTED` (`src/platform/integration/d365Adapters.ts`).
  - Optional SMTP for notifications (`SMTP_*`, `NOTIFY_SALES_EMAIL`) in `notificationService.ts`; `BROKEN_UI_ACTIONS.md` still lists NotificationRule email/SMS as not implemented.
  - Excel import/export: `xlsx` ^0.18.5.
  - Charts: `recharts` ^3.10.1. Icons: `lucide-react`. Motion: `motion` ^12.23.24. 3D: `three` / `@types/three` present; configurator WebGL scene is documented as not implemented.
- **Deployment platform:** Not specified (no app Dockerfile, no cloud IaC in the files reviewed). Local: `npm run dev` on `PORT` (default 3847). `[NEEDS VERIFICATION]` any production host outside this repo.

---

## 3. Project Structure

| Path | Role |
|------|------|
| `src/` | React app, Express routers under `src/server/`, domain/services, components |
| `src/app/` | Shell routing (`shellRoutes.ts`) |
| `src/auth/` | Login path helpers |
| `src/components/` | UI: customer, internal, costing v3, cable configurator, inquiry-quotation, common |
| `src/context/` | `AuthContext` |
| `src/data/` | Mock operational data, parameter masters |
| `src/domain/` | Costing, commercial, identity, RBAC, metal components |
| `src/platform/` | Errors, audit helper, D365 adapters |
| `src/services/` | Import, inquiry, drum, scrap templates, APIs |
| `prisma/` | `schema.prisma`, migrations, `seed.ts` |
| `docs/` | Large set of architecture/costing/increment docs (many overlapping costing files) |
| `data/source/` | Official Excel workbooks for import |
| `data/export/`, `data/regression/` | Export CSVs / regression workbooks |
| `scripts/` | Import, probes, costing readiness, family overlay |
| `public/` | Static assets (source workbooks copied for Import Center per README) |
| `server.ts` | Express app, Vite attach, leftover mock auth |
| `index.html` / `src/main.tsx` | SPA bootstrap |
| `docker-compose.yml` | PostgreSQL 16 only |
| `.env.example` | Env **names** (and documented defaults — not repeated here) |

**Entry points**

- Process: `server.ts` → `startServer()` (Vite middleware in non-production; static `dist` in production).
- UI: `src/main.tsx` → `App.tsx` (`BrowserRouter` + `AuthProvider`). Tab URLs: `src/app/shellRoutes.ts`.
- API: routers mounted in `server.ts` (`/api/auth`, `/api/admin`, `/api/master`, `/api/inquiries`, `/api/costing`, etc.).

---

## 4. Implemented Features (Completed)

Features below have working UI **and** corresponding persistence/API in this tree (not merely a labelled mock). Completeness of **business** sign-off is separate (see §5 costing).

| Feature | Primary modules |
|---------|-----------------|
| Dual portals + path aliases | `App.tsx`, `shellRoutes.ts`, `Sidebar.tsx`, `Navbar.tsx` |
| JWT login, refresh, me, logout, change/reset password | `identityAuthRoutes.ts`, `identityService.ts`, `LoginModal.tsx` |
| Admin users / roles / permissions / lock / password reset | `adminIdentityRoutes.ts`, `AdministrationHub.tsx` |
| Customer master + customer–user assignment | `adminCustomerRoutes.ts`, `AdministrationCustomersPanel.tsx` |
| Customer isolation on commercial APIs | `customerScope.ts`, `commercialProjection.ts`, `rbac.ts` |
| Master data Import Center (preview/commit) | `masterDataRoutes.ts`, `importPipelineService.ts`, `MasterDataHub.tsx` |
| Cable / BOM / RM / drum / engineering mapping / BOM conflicts / prices | Prisma models + `masterDataRoutes.ts` / `governanceRepository.ts` |
| Cable authority evaluate/search | `cableAuthorityRoutes.ts`, configurator V1/V2 |
| Technical Office requests | `technicalOfficeRouter`, `TechnicalOffice.tsx`, V2 queues |
| Commercial inquiries (CRUD, lines, versions, submit/cancel, activity) | `commercialRoutes.ts`, `commercialRepository.ts`, `InquiryQuotationWorkspace.tsx` |
| Inquiry + line + cable-master attachments | `attachmentRepository.ts`, `CommercialInquiryDetail.tsx` |
| Quotations + versioning + costing snapshot GET | `quotationsRouter`, `commercialRepository.ts` |
| Commercial pricing rules + quote price/approve | `commercialPricingRoutes.ts` |
| Increment 10 costing runs adapter | `costingRoutes.ts`, `costingRepository.ts` |
| Costing configuration, formulas, scrap rules, FX, currencies | `costingAdminRoutes.ts`, Prisma costing models |
| Costing V3 workspace (dashboard, RM, BOM, scrap, metal classification, metal cost components, bulk import, validation, audit, settings) | `CostingHub.tsx` → `CostingWorkspaceShell.tsx` / `costing/v3/*` |
| Inquiry calculate-cost (orchestrator) | `POST /api/inquiries/:id/calculate-cost`, `costingOrchestrationService.ts` |
| Platform health/status | `GET /api/platform/health`, `/status` |
| Honest D365/Advaris HTTP status JSON | `server.ts` (`NOT_CONNECTED`) |
| AI assistant HTTP endpoint | `POST /api/ai/assistant` (requires `GEMINI_API_KEY`) |
| User profile page | `UserProfilePage.tsx` |

---

## 5. Features In Progress

### Costing V2 Direct RM (Option B) — not production-ready

`docs/COSTING_V2_BUSINESS_SPECIFICATION.md` (28 Aug 2026 alignment text):

- Decisions 1–4 **LOCKED**. Decision 5 **OPEN**.
- **Option B (current application):** applied metal price = inquiry header Copper/Aluminium (LME/base only). Premium / Shipping / Clearance must not enter Direct RM.
- Prisma: `CostingMetalCostComponent` comment: *Master-data only. Not consumed by costingEngine Direct RM Cost (Option B — LME/Base only).*
- UI: Metal Cost Components panel copy says values are for **future** landed-cost calculation (`MetalCostComponentsPanel.tsx`).
- Engine test: `costingEngine.test.ts` asserts material cost **unchanged** when unused landed components are present.
- Spec: **Do not treat Costing V2 as production-ready** until Decision 5 is signed and 10009487 reconciliation is accepted. This report does **not** claim READY.

### Other partial work

- **PlatformFieldDefinition:** GET merged into inquiry field catalog; no full admin grid (`BROKEN_UI_ACTIONS.md` PARTIAL).
- **Low-code report builder:** `ReportDefinition` persistable; runtime `REPORT_BUILDER_NOT_IMPLEMENTED`.
- **Costing configuration REJECT:** enum/workflow has no REJECTED (`BROKEN_UI_ACTIONS.md` business decision).
- **Engineering mapping / family on catalog:** Cable List import can set `family` when the workbook has a Family column (`importPipelineService.ts`). Official rows may still lack approved mapping attributes (README Increment 5; `ENGINEERING_DATA_MAPPING.md`). Overlay script `scripts/applyCableFamilyFromSource.ts` exists and is **not** an `npm` script.
- **Customer portal Phase-1 nav:** Sidebar shows only Dashboard / My Inquiries / Support for **all** customers (`PHASE1_CUSTOMER_TABS`). `isElandCustomer` additionally blocks other customer routes in `resolveShellNavigation`.
- **Demo vs Prisma identity:** Production JWT + DB; development can still use demo users when not `PROD`.

### Known test gaps (Technical Offer)

`submitInquiry` in `commercialRepository.ts` blocks with `TECHNICAL_OFFER_REQUIRED` when lines lack a Technical Offer attachment. These tests still call `submitInquiry` without attaching a Technical Offer (expected to fail until updated):

1. `src/server/increment12.inquiryUi.test.ts` — “submits inquiry and creates immutable new version”
2. `src/server/increment11.commercial.test.ts` — “Test 10: Submitting inquiry transitions status to SUBMITTED”
3. `src/server/increment13.phaseE.test.ts` — “submitInquiry locks recalculation”

`src/domain/inquiryLineAttachments.test.ts` uses **vitest** (`describe`/`expect` from `vitest`) but **vitest is not in `package.json`** and the file is **not** in the `npm test` list.

---

## 6. Features Not Started / Backlog

From `docs/BROKEN_UI_ACTIONS.md`, `docs/DEPRECATED_FEATURES.md`, placeholders, and code:

- Power BI / report builder export (`REPORT_BUILDER_NOT_IMPLEMENTED`).
- Finance payment reminders (disabled / `NOT_IMPLEMENTED`).
- Production MES new order / inspect (`NOT_CONNECTED`).
- Customer statement PDF download (`NOT_IMPLEMENTED`; statement UI is sample AR).
- NotificationRule email/SMS delivery (table + SMTP helper; product delivery not implemented per broken-UI doc).
- 2D/3D cable visualization (`three` unused for a scene).
- NestJS (not in repo; Express only).
- Live D365 / Advaris domain calls.
- Decision 5 Option A (landed metal = LME + Premium + Shipping + Clearance) — explicitly not to implement until signed.
- Dead `POST /api/master-data/import` stub (`persisted: false`).
- Dead `server.ts` `mockDbUsers` + duplicate `/api/auth/*` after identity router.
- Unmounted / deprecated UI: `InquiryQuotationHome.tsx`, `ErpCustomerRequestView.tsx`, `TechnicalOfficeCostingWorkbench.tsx` (no importers), `CostingPricing.tsx` re-export.
- Mock SoT: `src/data/mockData.ts` for sales orders, production, finance, dashboard Open Orders count; `ShipmentTracker` hardcoded; TDS/Support fake PDF alerts.
- Dual-write localStorage masters (Import Center + browser stores) — still described in README / `GET /api/platform/db` coexistence text.
- `docs/KNOWN_LIMITATIONS.md` still claims inquiry/users are memory/localStorage and plaintext in-memory passwords; **that file is stale relative to Prisma identity and commercial tables** — treat as historical unless re-verified.

---

## 7. Database Schema

Source: `prisma/schema.prisma`. PostgreSQL via `DATABASE_URL`. Field lists omit only noise where identical `createdAt`/`updatedAt` patterns repeat.

### Enums (selected)

`RecordStatus`, `PriceStatus`, `ParameterKind`, `ImportKind`, `ImportStatus`, `PriceWorkflowStatus`, `PriceBasis`, `BomInvestigationStatus`, `MappingWorkflowStatus`, `CompatibilityRelation`, `CostingRunStatus`, `CostComponentType`, `InquiryStatus`, `InquiryLineStatus`, `QuotationStatus`, `PricingRuleType`, `PricingRuleScope`, `CommercialPricingStatus`, `IdentityStatus`, `IdentityUserType`, `CustomerStatus`, `CustomerType`, `CustomerAssignmentStatus`, `CostingConfigStatus`, `CostingScrapScopeType`, `CostingVariableKind`, `CostingComponentKind`, `MetalCostMetal`, `MetalCostComponentType`, `MetalCostPriceBasis`, `MetalCostComponentStatus`, `MetalRateSource`, `PlatformEntityCode`.

### Models

**CableParameter** — id, kind, code, name, status. Unique `[kind, code]`.

**CableMaster** — materialNumber (unique), itemCode, customerCode, elandItemNumber?, description, family/voltage/conductor/…, diameter, weight, uom, status, approvalStatus, effective dates, sourceBatch, audit users. Rel: bomLines, governedBomLines, engineeringMappings, costingRuns, attachments.

**RawMaterial** — code (PK), description, pricingCategory, metalType, uom, supplier, currency, notes, priceStatus, status. Rel: prices, bomLines, governedBomLines.

**RawMaterialPrice** — id, rawMaterialCode → RawMaterial, price?, currency?, uom?, dates, supplier, source, priceBasis, workflowStatus, isCurrent, revision, temporalStatus, status, approval/audit.

**CableBomLine** — cableMaterialNumber → CableMaster?, rawMaterialCode → RawMaterial?, consumption, uom, scrap?, bomVersion. Unique `[cableMaterialNumber, rawMaterialCode, bomVersion]`.

**BomDuplicateObservation** — conflict weights/evidence, investigationStatus, optional governed fields, workflow actors. Rel: governedBomLines.

**GovernedBomLine** — cable → CableMaster, rawMaterial → RawMaterial, consumption, scrapPercentage?, conflictId? → BomDuplicateObservation.

**CableEngineeringMapping** — materialNumber → CableMaster, revision, isCurrent, status, mappingStatus, structured engineering attrs, attributes Json, suggested Json?, workflow actors.

**DrumMaster** — drumCode unique, dimensions, capacity, uoms, status.

**DrumCompatibility** — family/voltage/diameter/length/weight/customer/drumCode/priority/status/dates. No Prisma relation to DrumMaster.

**ImportBatch / ImportBatchRow** — batch metadata + per-row messages.

**AuditEvent** — at, actor, entity, entityId, action, old/new Json, message.

**ParameterCompatibility** — from/to ParameterKind+code, relation, source.

**TechnicalOfficeRequest** — requestNumber unique, statuses, configuration Json, requester fields.

**CostingRun / CostingLine** — run keyed by costingRunNumber; cable; aggregates; lines with consumption, price snapshot, pricingSource, lineCost. Optional configurationVersionId.

**CommercialInquiry** — inquiryNumber unique, customerId/name, commercial header fields, commercialMetadata Json, versioning, customerMasterId? → Customer. Rel: lines, quotations, attachments.

**CommercialInquiryAttachment** — file bytes on inquiry.

**CableMasterAttachment** — kind unique per materialNumber; bytes; copies to inquiry lines.

**CommercialInquiryLineAttachment** — kind, bytes, source, optional cableMasterAttachmentId.

**CommercialInquiryLine** — materialNumber?, quantities, drum/tolerance/drumSchedule Json, cable authority, costing ids, costingCalculation? → CostingCalculation, attachments.

**CommercialQuotation / CommercialQuotationLine** — versioned quote; lines link inquiry line and costing calculation; sellingPrice optional.

**CustomerPricingTier**, **CommercialPricingRule**, **CommercialDiscountRule**, **CommercialPricingSnapshot** — commercial selling-price governance (separate from Direct RM).

**UserAccount**, **Role**, **Permission**, **RolePermission**, **UserRole**, **UserSession**, **PasswordResetTicket** — identity.

**Customer**, **CustomerUser**, **CustomerMigrationException** — B2 customer master.

**CostingConfiguration / CostingConfigurationVersion** — formula config versions; rel formulas, costingRuns, calculations.

**CostingVariable**, **CostingComponent**, **CostingFormula**, **CostingFormulaVersion**, **CostingFormulaDependency**.

**CostingCalculation / CostingCalculationSnapshot** — persisted inquiry costing.

**CostingScrapRule**, **CostingDocumentSequence**.

**CostingCurrency** → **CostingMetalCostComponent** (premium/shipping/clearance master data).

**CostingExchangeRate**.

**CostingMetalRate**, **CostingLogisticsRule**, **CostingPackingRule**.

**PlatformFieldDefinition**, **NotificationRule**, **ReportDefinition**.

---

## 8. API Endpoints

Auth unless noted: **JWT Bearer** via `resolveRequestActor`. Admin identity/customer: `requirePermission(...)`. Costing admin/master writes: `assertCan*` in `rbac.ts`. Public-ish: health, login, D365/Advaris status, some GET master lists (no actor required on `GET /api/master/cables`). Unmatched `/api/*` → 404 JSON (does not fall through to SPA).

### `/api/auth` (`identityAuthRouter` — mounted first)

| Method | Path | Purpose |
|--------|------|---------|
| POST | `/login` | Password login (dev seed) |
| POST | `/logout` | Revoke session/refresh |
| POST | `/refresh-token` | Refresh JWT |
| POST | `/forgot-password` | Request reset |
| GET | `/me` | Current user |
| POST | `/change-password` | Own password |
| POST | `/reset-password` | Consume ticket |
| POST | `/register` | 403 self-register disabled |
| POST | `/roles`, `/assign-role`; GET `/users` | 403; use `/api/admin` |
| GET | `/roles` | List active roles |

**Also in `server.ts` after this router (unreachable for same paths):** POST login/register/forgot/reset/refresh, GET me/roles/users, POST roles/assign-role — dead mockDb handlers.

### `/api/admin` identity + customers

Users: GET/POST `/users`, GET/PATCH `/users/:id`, POST activate/deactivate/lock/unlock/reset-password, POST/DELETE roles. Roles: GET/POST `/roles`, GET/PATCH `/roles/:id`, activate/deactivate, users, permissions PUT. GET `/permissions`, `/permissions/matrix`, `/security`. Customers: GET/POST `/customers`, GET/PATCH `/customers/:id`, audit, activate/deactivate. Customer-users: GET/POST `/customer-users`, PATCH, POST unassign.

### `/api/platform`

GET `/health`, `/status`. GET `/db` (`platformDbRouter`).

### `/api/master`

Cables CRUD + attachments; BOMs; RMs; RM prices + workflow + Excel import/export; cable scrap template/import; drums; reference; readiness; engineering mappings + bulk/import/actions; BOM conflicts; costing-readiness; RM price readiness; keys; uniqueness; duplicate observations; imports preview/commit.

### `/api/master/commercial-pricing-rules`

GET/POST `/`, POST `/:id/actions`, GET `/export`.

### `/api/cables`

GET `/search`, `/compatibility`; POST `/evaluate`.

### `/api/technical-office`

POST/GET `/requests`.

### `/api/costing`

GET `/readiness/:materialNumber`, GET `/`, GET `/:id`; POST `/calculate`, `/:id/recalculate`. Calculate/list require signed-in costing permission.

### `/api/admin/costing`

Workspace dashboard; currencies CRUD/actions; RM classify-suggested; metal-cost-components CRUD/actions/audit; bulk-import template/preview/commit; configurations/versions activate/validate/submit/approve; variables/components/formulas; scrap rules + BOM scrap; exchange rates; preview/calculator; audit; approval-queue; RM prices workbook/list/actions; GET `/readiness`; POST `/validate`.

### `/api/admin/platform`

GET `/dashboard/kpis`; costing metal-rates, logistics-rules, packing-rules GET/POST; GET/POST `/fields`; notifications/rules; reports.

### `/api/commercial-pricing`

POST `/calculate`.

### `/api/inquiries`

GET `/`, GET `/meta/field-definitions`; GET/PATCH `/:id`; POST `/`; versions; lines CRUD/reorder/duplicate; line attachments; calculate-cost (header and line); GET line costing; header attachments; activity; submit; new-version; cancel; POST quotation.

### `/api/quotations`

GET `/`, GET `/:id`, POST `/`, POST `/:id/versions`, GET `/:id/costing`; plus attached POST `/:id/price`, submit-for-approval, approve-pricing.

### Other (`server.ts`)

| Method | Path | Purpose |
|--------|------|---------|
| POST | `/api/ai/assistant` | Gemini (no JWT in handler) |
| POST | `/api/master-data/import` | Legacy stub, `persisted: false` |
| GET | `/api/d365/sync-status` | `NOT_CONNECTED` |
| GET | `/api/advaris/mes-status` | `NOT_CONNECTED` |
| GET | `/api/auth/dotnet9-code` | Sample C# JWT snippet in `server.ts` |

---

## 9. Environment Variables

**Names only** (from `.env.example`, `process.env`, `docker-compose.yml`, `vite.config.ts`, scripts):

- `DATABASE_URL`
- `JWT_SECRET`
- `LOGIN_LOCK_THRESHOLD`
- `ADMIN_SEED_PASSWORD`
- `ALLOW_DEV_IDENTITY_SEED`
- `ADMIN_RESET_TOKEN_IN_RESPONSE`
- `PORT`
- `NODE_ENV`
- `GEMINI_API_KEY`
- `DISABLE_HMR`
- `SMOKE_BASE_URL`
- `SMTP_HOST`, `SMTP_PORT`, `SMTP_SECURE`, `SMTP_USER`, `SMTP_PASS`, `SMTP_FROM`
- `NOTIFY_SALES_EMAIL`
- Docker Compose Postgres: `POSTGRES_USER`, `POSTGRES_PASSWORD`, `POSTGRES_DB`

---

## 10. Known Issues & Technical Debt

- **Costing V2 not production-ready** (Decision 5 open; Option B LME-only Direct RM).
- **Three `TECHNICAL_OFFER_REQUIRED` submit tests** still submit without TO attachments (§5).
- **`inquiryLineAttachments.test.ts`:** vitest API, not wired into `npm test`; vitest not a declared dependency.
- **`SimpleParameterGridV2`:** required props `filteredRecords` and `totalMasterCount` are unused in the component body. Lint script is `tsc --noEmit` without `noUnusedLocals` — `[NEEDS VERIFICATION]` whether any CI job fails this file.
- **`cableScrapTemplateService.test.ts`:** still aligned with 11-column `CABLE_SCRAP_TEMPLATE_HEADERS` in source; not listed as currently failing from code inspection.
- **Duplicated costing documentation** under `docs/` (multiple COSTING_*, INCREMENT_13/14, FINAL_* files). `DEPRECATED_FEATURES.md` still says D365 `connected: true` while `server.ts` returns `connected: false`.
- **ELAND / customer portal:** `isElandCustomer` restricts routes to dashboard, inquiries, support. Customer dashboard **Open Orders** still navigates to `sales_orders` (`INITIAL_SALES_ORDERS` mock counts). Shell then redirects ELAND users to `/customer`. Sidebar Phase-1 tabs hide orders for all customers.
- **Vite / Express:** New API routes require process restart; 404 handler text states Express does not hot-reload routes. Vite HMR applies to the SPA, not `server.ts` route table.
- **Cable picker pagination:** `CableSearchSelectModal` resets `page` to 1 when the modal closes and when filters change — the old “history keeps page” issue is **not** evident in current code.
- **Dead auth + stub import** in `server.ts`.
- **Mock operational modules** vs PostgreSQL commercial/master data.
- **JWT in localStorage** as session cache (documented).
- **`GET /api/master/cables` without query** returns full `listCables()` (unauthenticated).
- **DrumCompatibility** table exists; README: automatic EWD pick is `CONFIGURATION_REQUIRED`.
- **package.json `name`:** `react-example`.

---

## 11. Dependencies Status

From `package.json` (no lockfile audit run). Versions are as declared, not “latest on npm”.

| Package | Declared | Notes |
|---------|----------|--------|
| `prisma` / `@prisma/client` | ^6.16.2 | Critical ORM |
| `react` / `react-dom` | ^19.0.1 | Critical UI |
| `express` | ^4.21.2 | Critical API |
| `vite` | ^6.2.3 | Listed in both dependencies and devDependencies |
| `react-router-dom` | ^6.28.0 | |
| `jsonwebtoken` / `bcryptjs` | ^9.0.3 / ^2.4.3 | Identity |
| `@google/genai` | ^2.4.0 | AI |
| `xlsx` | ^0.18.5 | Spreadsheets |
| `three` | ^0.185.1 | No WebGL configurator usage documented |
| `vitest` | **absent** | Used by `inquiryLineAttachments.test.ts` |

Unused vs used: `[NEEDS VERIFICATION]` without a depcheck run. `motion` and `recharts` are used by UI. Duplicate `vite` in dependencies and devDependencies is redundant, not necessarily unused.

---

## 12. Suggested Next Steps

Prioritized from actual gaps in this tree:

1. **Close or explicitly defer Decision 5** (landed vs LME). Do not fold Premium/Shipping/Clearance into Direct RM until signed. If Option B remains, keep Metal Cost Components as master data only.
2. **Fix the three `submitInquiry` tests** (and/or seed Technical Offer attachments) so `TECHNICAL_OFFER_REQUIRED` is covered rather than failed.
3. **Run inquiry line attachment tests under `tsx --test`** (or add vitest) and include `inquiryLineAttachments.test.ts` in `npm test`.
4. **Confirm `tsc` / any extra linter** on `SimpleParameterGridV2` unused props; drop unused props or use them.
5. **Family on official import:** decide whether Cable List Family column + `applyCableFamilyFromSource.ts` is the governed path; document npm script if it is operational.
6. **ELAND dashboard Open Orders:** stop navigating to mock `sales_orders`, or allow a scoped orders view; do not show global mock Open counts as live orders.
7. **Remove or 410 dead `server.ts` auth and `POST /api/master-data/import`.**
8. **Restart-aware API development** remains required; optional: document `DISABLE_HMR` and Express 404 hint for new routes.
9. **Stale docs:** align `KNOWN_LIMITATIONS.md` / `DEPRECATED_FEATURES.md` D365 rows with current `connected: false` and Prisma identity/inquiries.
10. **Do not start a new costing engine** until Decision 5 is signed (`COSTING_V2_BUSINESS_SPECIFICATION.md` freeze).

---

*End of report. No application code was changed for this document.*
