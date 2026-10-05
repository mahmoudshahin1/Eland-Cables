# CURRENT UI AUDIT — Energya Connect

> Read-only audit of the live codebase (verified against `src/App.tsx`, `src/app/shellRoutes.ts`, `src/auth/loginRoutes.ts`, and the real components). This is the **functional + content source of truth** the redesign must preserve.

## 0. Architecture at a glance

- **Stack:** React 19 + TypeScript + Vite 6 (SPA), Express 4 (`server.ts` + `src/server/**`), Prisma 6 + PostgreSQL, Tailwind v4.
- **Routing:** React Router 6. Two portals resolved from `currentUser.userType` via `platformModeForUser()` — **customer** and **internal**. No manual portal switcher in the shell.
- **Shell:** `AuthenticatedShell` = `Navbar` + `Sidebar` + `<main>` + `Footer` + `AiAssistantWidget`, gated by `RequireAuth` + `resolveShellNavigation`.
- **Auth:** JWT via `AuthContext`; 30-min idle timeout; auto-refresh 60s before expiry; tokens in local/session storage keyed by "remember me".
- **Design-system state:** Phase-2 `src/components/ui/` primitives + costing V3 `CostingUiPrimitives` exist but are **only wired into a subset of pages**; most business pages still use legacy `epc-*` classes and ad-hoc Tailwind.

## 1. Full route list

### 1.1 Public / auth routes (`loginRoutes.ts`)

| Path | Component | Portal kind | Notes |
| --- | --- | --- | --- |
| `/login` | `PublicLoginRoute` → `LoginPage` | unified | Default; redirects authed users to home |
| `/login/customer` | `LoginPage` | `customer` | Only `userType === customer` may complete |
| `/login/users` | `LoginPage` | `users` | Internal, NOT admin (`!userManagement`) |
| `/login/admin` | `LoginPage` | `admin` | Internal WITH `userManagement`; post-login → Administration |
| `/*` | `RequireAuth` → `AuthenticatedApp` | protected | All app content |

`LoginModal` is mounted globally outside `<Routes>` as an overlay (legacy path, still active). Alternate auth views inside modal: `register`, `forgot_password`, `role_management`, `dotnet_code`.

### 1.2 Customer portal routes (`CUSTOMER_TAB_PATHS` + aliases)

| Path (canonical) | Tab id | Component | Phase-1 shown? |
| --- | --- | --- | --- |
| `/customer` | `dashboard` | `CustomerDashboard` | ✅ |
| `/customer/inquiries` | `price_estimation` | `PriceEstimation` → `InquiryQuotationWorkspace` | ✅ |
| `/customer/sales-orders` | `sales_orders` | `SalesOrders` | (defined) |
| `/customer/drum-optimizer` | `drum_optimizer` | `DrumOptimizer` | (defined) |
| `/customer/statement` | `statement` | `CustomerStatement` | (defined) |
| `/customer/invoices` | `invoices` | `CustomerStatement` | (defined) |
| `/customer/shipments` | `shipment_tracking` | `ShipmentTracker` | (defined) |
| `/customer/documents` | `tds_library` | `TdsDocumentLibrary` | (defined) |
| `/customer/support` | `support` | `SupportCenter` | ✅ |
| `/customer/process` `/customer/journey` | `process`/`journey` | `ElandProcessFlowDiagram` | (defined) |
| `/customer/profile` | — | `UserProfilePage` | always |

> **Nav mismatch (audit finding):** the customer sidebar defines 9 tabs but the Phase-1 filter (`PHASE1_CUSTOMER_TABS`) only shows `dashboard`, `price_estimation`, `support`. ELAND customers are further limited to those same three via `ELAND_ALLOWED_TABS`.

### 1.3 Internal portal routes (`INTERNAL_TAB_PATHS` + `INTERNAL_TAB_PERMISSION`)

| Path | Tab id | Component | Permission key |
| --- | --- | --- | --- |
| `/internal` | `overview` | `InternalDashboard` | `overview` |
| `/internal/technical-office` | `technical_office` | `TechnicalOffice` | `technicalOffice` |
| `/internal/cable-parameters` | `cable_configurator` | `CableConfiguratorHub` | `overview` (always shown) |
| `/internal/costing` | `costing_pricing` | `CostingHub` → `CostingWorkspaceShell` | `costingPricing` |
| `/internal/quotations` | `sales_quotations` | `SalesQuotations` → `InquiryQuotationWorkspace` | `salesQuotations` |
| `/internal/sales-orders` | `sales_orders` | `SalesOrders` | `salesQuotations` |
| `/internal/production` | `orders_production` | `ProductionMonitoring` | `ordersProduction` |
| `/internal/logistics` | `shipments_logistics` | `ProductionMonitoring` (reused) | `ordersProduction` |
| `/internal/finance` | `finance_collections` | `FinanceCollections` | `financeCollections` |
| `/internal/master-data` | `master_data` | `MasterDataHub` | `masterData` |
| `/internal/analytics` | `reports_analytics` | `ReportsAnalytics` | `reportsAnalytics` |
| `/internal/administration` | `user_management` | `AdministrationHub` | `userManagement` |
| `/internal/profile` | — | `UserProfilePage` | any authed |

Costing sub-navigation uses `?tab=` query param (not routes) — see §7.

## 2. App shell (Navbar / Sidebar / Footer)

### 2.1 Navbar (`src/components/layout/Navbar.tsx`)
Sticky navy header (`bg-brand-700`). Left: mobile `Menu` toggle (`lg:hidden`, title "Open Navigation Menu"), logo `Link` (title "Home", renders `BrandLogo` = `/logo.png`), platform subtitle (`hidden sm:block`). Right: notifications (`Bell`, popover "Notifications Center", "Mark all as read", empty "No notifications present"; rows use `Mail`/`FileText`), theme toggle (`Sun`/`Moon`), user menu (avatar + `ChevronDown`) → "Profile" (`UserRound`), "Logout" (`LogOut`); guest shows "Login / Auth" (`KeyRound`). No direct API calls. Responsive: popover `w-80 sm:w-96`.

### 2.2 Sidebar (`src/components/layout/Sidebar.tsx`)
Off-canvas drawer `< lg` (`-translate-x-full`), static `≥ lg` with collapse (`lg:w-20`/`lg:w-64`). Customer nav (9 items) and internal nav (12 items) — full labels, routes, and lucide icons documented in the shell audit and in `MODULE_DESIGN_PROPOSAL.md §2`. Internal items filtered by `hasPermission(permissionKey)`; customer items filtered to Phase-1 set. Special **costing navy mode**: when internal + `costing_pricing`, replaces main nav with the "PRODUCTION COSTING" grouped sub-nav (20+ items across groups COSTING / CURRENCY & FX / RAW MATERIALS / CABLE BOM / SCRAP RULES / BULK DATA MANAGEMENT / VALIDATION & AUDIT / Settings). Footer: "AI Copilot" (`Bot`, only when `onOpenAiModal` set — currently not wired) + collapse toggle. No API calls.

### 2.3 Footer (`src/components/layout/Footer.tsx`)
Customer: `bg-brand-800`, `EnergyaLogo`, "ENERGYA CONNECT — Elsewedy Helal", tagline "POWERING CONNECTIONS. DELIVERING EXCELLENCE.". Internal: white bg, gradient top bar, tagline "POWERING CONNECTIONS. ENERGIZING GENERATIONS.". Both: "© 2026 Energya Cables. All rights reserved." Hidden on the costing workspace.

## 3. Login (`src/auth/LoginPage.tsx`)
Two-panel card (`max-w-6xl`): left form (46%), right navy hero (`hidden lg:flex`, 54%). Strings: "Welcome Back", Email/Password labels, "Forgot password?", "Remember me", "Sign In", "OR", "Sign in with Microsoft Entra ID" (badge "Coming Soon"), footer "Secure • Reliable • Built for Performance". Hero: "Powering Connections." / "Building a Stronger Future.", features Engineering Excellence / Trusted Quality / Powering Tomorrow (`Zap`, `ShieldCheck`, `CircuitBoard`). Portal toggle Internal/Customer. Workflow: `loginWithJwt` → `validateLoginPortal` (dedicated paths) → `postLoginPath`. Validation: empty fields → "Please enter your email and password."; server passthrough. API: `POST /api/auth/login`. `ForgotPasswordForm` is a two-step JWT reset (`POST /api/auth/forgot-password`, `POST /api/auth/reset-password`).

## 4. Dashboards

### 4.1 Customer Dashboard (`CustomerDashboard.tsx`)
Header card: "CUSTOMER PORTAL", "ID: {customerCode}", greeting, "New Inquiry" CTA. KPI `DashboardStatCard`s: Open Inquiries, Submitted, Under Review, Quoted (each navigates to filtered inquiries). "Your Inquiries" table: Inquiry No., Version, Date, Cable, Length, Drum, Value, Currency, Status; search/status/date filters; row click opens workspace. API: `GET /api/inquiries?…` via `fetchCommercialInquiries`. Responsive: stat grid `grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-5`; table `overflow-x-auto min-w-[960px]`.

### 4.2 Internal Dashboard (`InternalDashboard.tsx`)
Banner "INTERNAL ENTERPRISE PORTAL" / "Dashboard Overview — Executive Command Center". Quick actions: Cable Parameters, Excel Master Data Import, Reports. 6 KPI cards: Open Inquiries, Open Quotations, Active Customers, TO Requests, BOM Conflicts, Unpriced Materials. Panels: Inquiries by Status (Recharts donut, live); Monthly Sales / Top Customers / Recent Activities / Alerts (explicit `NOT_CONNECTED` / `NOT_IMPLEMENTED` placeholders). API: `GET /api/admin/platform/dashboard/kpis`. RBAC: `hasPermission('overview')` else `AccessRestricted`.

## 5. Inquiry list + workspace + 8 tabs
Active stack: `PriceEstimation` (title "My Inquiries") → `InquiryQuotationWorkspace` → `CommercialInquiryList` / `CommercialInquiryDetail`. Internal reuses via `SalesQuotations` (title "Inquiries & Quotes"). `ErpCustomerRequestView.tsx` is **legacy/unrouted mock** and superseded.

- **Header fields** (from `INQUIRY_HEADER_FIELDS`): Transaction Type, Trx Date (`inquiryDate`), Ref. No (`customerReference`), Customer (read-only for customers), Organization, Contact Person, Sales Agent, Project Name, Currency, Exchange Rate, Raw Material Currency (display-only, mirrors Currency), Raw Material Exchange Rate, Copper Price (USD/MT + source badge), Aluminium Price (USD/MT + source badge), Status (read-only, formatted), Incoterms (Delivery), Destination, Delivery Date, Version No (+Version button), Remarks (`notes`), Quotation Owner. Additional: Sales Comments (internal-only), Payment Terms (Overview tab), Inquiry No.
- **Line fields** (`INQUIRY_LINE_COLUMNS`): Line No., Cable Material No., Cable Description, Voltage, Conductor, Size, Drums (`requestedQuantity`), Total Length (m), Cutting Length (m), Cable Tolerance (%), UOM, Drum Required (`drumType`), Value (internal-only), Currency, Tech. Status, Costing Status (internal-only), Attachments (Technical Offer per line). `drumSchedule` JSON rows: drumCode, noOfDrums, cuttingLengthM, drumTolerancePercent.
- **8 tabs:** Overview, Cables (default, line grid), Costing, Drums, Cutting, Documents (≤8 MB), Quotation, Activity (version compare + audit).
- **Toolbar actions:** Back, Save, Discard, Calculate, Submit, New Version, Generate Quotation, Cancel Inquiry, Field Visibility, More (Print/Export).
- **Submit validation codes:** `COPPER_PRICE_REQUIRED`, `ALUMINIUM_PRICE_REQUIRED`, `DESTINATION_REQUIRED`, `INCOTERMS_REQUIRED`, `LINES_REQUIRED`, `CALCULATION_REQUIRED`, `TECHNICAL_OFFER_REQUIRED`.
- **Status machine:** DRAFT (Open) → SUBMITTED → QUOTED; also UNDER_REVIEW, CANCELLED, CLOSED. Editable only DRAFT/UNDER_REVIEW; costs lock after submit.
- **APIs:** full CRUD under `/api/inquiries[/**]` (list, create, detail, patch, versions, submit, cancel, new-version, quotation, calculate-cost, activity, attachments, lines CRUD/duplicate/reorder/calculate/costing/attachments).
- **RBAC/scope:** `requireInquiryAuth` + `assertCanManageInquiry` + `assertCustomerBusinessScope`; customer projection (`commercialProjection.ts`) strips cost/value/internal fields.

Full detail in `INQUIRY_DESIGN_PROPOSAL.md` and `CONTENT_PRESERVATION_INVENTORY.md`.

## 6. Cable Selection / Advanced Parameters / Engineering Result / Technical Office
`CableConfiguratorHub` switches V1 (`SmartConfigurator`, "Cable Parameters V1") and V2 (`CableConfiguratorV2`, "Cable Technical Parameter / Cascading Selection").

- **27 numbered cascading parameters** (V2): Cable Family, Voltage Level/Class, Voltage Rating/Level, Standard & Specification, Conductor Material, Construction Class, Conductor Shape, Conductor Size, No. of Cores, Conductor Water Blocking, Insulation Material, Insulation Color, Outer Semi-Conductor, Screen Type, Screen CSA, Screen Water Tightness, Inner Sheath/Bedding, Armour Layer, Armour Water Tightness, Outer Sheath (Jacket), Outer Sheath Color, Water Tight/Blocking, Termite/Rodent Protection, CPR Euroclass, Special Installation Area, Special Engineering Req., Customer-Specific Identification (+ Customer Spec Code, per-core Core Colors).
- **Cascading unlock chain** + downstream sanitization + option filtering + side effects — documented in `CABLE_SELECTION_DESIGN_PROPOSAL.md`. **MUST be preserved.**
- **Stepper:** Family & Voltage → Conductor → Cores & Colors → Insulation → Screen & Armour → Sheathing → Validation Result.
- **Existing-vs-new determination:** `evaluateCableAuthority` via `POST /api/cables/evaluate` → statuses `EXISTING_APPROVED`, `VALID_NEW_CABLE`, `INVALID_CONFIGURATION`, `CONFIGURATION_REQUIRED`. Result panel states 1/2/3. **MUST be preserved.**
- **Technical Office** (`TechnicalOffice.tsx`) 7 tabs: Engineering Mapping (Increment 7), BOM Governance (Increment 8), Technical Requests (TCR Queue), Cable Master Catalog, Bulk Excel Pre-Import (Method B), Master Parameters, Raw Materials Reference. Governance workflows (mapping SUBMIT/ASSIGN/APPROVE/REJECT; BOM ASSIGN/START_REVIEW/DECIDE/RESOLVE/APPROVE/REJECT/REOPEN; TCR statuses). APIs under `/api/master/**` + `/api/cables/**` + `/api/technical-office/requests`.

## 7. Costing workspace (`CostingHub` → `CostingWorkspaceShell`)
Full-screen shell (navbar/footer hidden), grouped sidebar sub-nav via `?tab=`. Panels: Dashboard, Costing Readiness, Production Readiness, Currency Master, Exchange Rates, Raw Material Master, Metal Classification, Raw Material Prices, Market Metal Pricing, Metal Cost Components, BOM Explorer, Scrap Rules, Bulk Data Management (8-step), Validation (Direct RM cost breakdown), Audit Trail, Settings. **Option B (LME/Base only)** banners pervasive; `MetalCostComponentsPanel` stored but excluded from engine. Validation panel columns: Raw Material, Consumption, UOM, Applied Unit Price, Price Currency, Pricing Source, Metal Type, FX Rate, Txn Currency, Final Line Cost. APIs under `/api/admin/costing/**` + `/api/master/**`. RBAC: `costingPricing`. `CostingWorkspaceV3.tsx` and `CostingConfigurationDashboard.tsx` are legacy/unwired.

## 8. Master Data / Administration / Production / Profile / Reports / Finance
- **Master Data Hub:** tabs Data Quality, Readiness, Cable Master, Cable BOM, Raw Materials, Drum Master, Import Center. Import flow: upload → validate/preview → confirm; entities cables/boms/raw_materials/drums; `POST /api/master/imports/commit`. RBAC `masterData`.
- **Administration Hub:** tabs Overview, Users, Customers, Customer users, Roles & Permissions, Security summary. User lifecycle (create/edit/activate/deactivate/lock/unlock/reset-password), role CRUD + permission matrix (`canAssign` gated). APIs `/api/admin/users`, `/api/admin/roles`, `/api/admin/permissions/matrix`, `/api/admin/customers`, `/api/admin/customer-users`. RBAC `userManagement`.
- **Production Monitoring:** `NOT_CONNECTED` mock ledger (Order No., Customer, Cable Spec Code, Qty (m), Current Stage, OEE Progress, Status). RBAC `ordersProduction`.
- **Profile:** read-only account fields + Change password (`POST /api/auth/change-password`). Any authed user.
- **Reports:** `REPORT_BUILDER_NOT_IMPLEMENTED` + KPI cards. **Finance:** `NOT_IMPLEMENTED` mock ledger.

## 9. Drum selection / optimizer
Two parallel identity systems: prototype reel types (`Wood Reel 220`…) and governed EWD Drum Master (`Drum List.xlsx`, automatic EWD selection is `CONFIGURATION_REQUIRED`). Components: `DrumOptimizer` (customer page), `ContainerAndDrumOptimizerModal`, `DrumDetailsModal`, `DrumMasterReferencePanel`, `DrumMasterSelect`, `DrumCuttingScheduleTable`, `WoodenDrumIcon`. Cutting-schedule columns: #, Drum Type/Code, No. of Drums, Cutting Length/Drum, Drum Tolerance*, Fill %, Nominal Line (m), Total Line Wt (kg), Actions; above table Cable Tolerance*. Client-side math (`inquiryDrumSchedule.ts`, `drumMasterService.ts`, `drumPlanService.ts`). API `GET /api/master/drums` (unauthenticated — see security notes) + inquiry line drum fields. Full detail in `DRUM_SELECTION_DESIGN_PROPOSAL.md`.

## 10. Responsive behavior (platform-wide observed patterns)
- Sidebar drawer `< lg`; collapse `≥ lg`. Main padding `p-4 sm:p-5 lg:p-6` (costing `p-0`).
- Tables rely on `overflow-x-auto` + `min-w-[…]` horizontal scroll (no card-collapse for line grids).
- Grids: `grid-cols-1` → `sm/md/lg/xl` progressive. Modals `fixed inset-0 p-4` with capped `max-h-[9x vh]` + internal scroll. Steppers `overflow-x-auto min-w-[640px]`.
- `MobileBottomNav` primitive exists but is **not wired** into the shell.

## 11. Security observations (report only — do NOT fix in this task)
1. `GET /api/master/drums` has **no `requireSignedIn`** — any caller can list the drum master. (Report only.)
2. `POST /api/cables/evaluate`, `/api/master/reference`, `/api/cables/compatibility` are called **without JWT** from the V2 configurator (optional-auth endpoints).
3. `ForgotPasswordForm` **displays the generated reset token in the UI** ("prototype" behavior) — acceptable for prototype, not for production.
4. Large amounts of business logic (TCR queue, custom master params, Excel Method-B import, V1 catalog) persist to **`localStorage`** rather than the server; not access-controlled.
5. Client-side RBAC gating (sidebar filters, `AccessRestricted`) is correctly backed by server-side `assert*` guards for the audited APIs; the projection layer (`commercialProjection.ts`) strips internal cost/value fields for customers — good. No change proposed.
