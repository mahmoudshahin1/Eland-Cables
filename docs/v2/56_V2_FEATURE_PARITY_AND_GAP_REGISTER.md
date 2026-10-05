# P1.5-04 — V2 Feature Parity & Gap Register

**Date:** 2026-09-12  
**Mode:** Analysis / audit **only**  
**Status:** **ANALYSIS COMPLETE** — **NOT IMPLEMENTATION** — **NOT CUTOVER**  
**Does not amend:** [53](./53_PRODUCT_UX_ARCHITECTURE.md), [54](./54_DESIGN_SYSTEM_ARCHITECTURE.md), [55](./55_V2_PARALLEL_DESIGN_AND_PARITY.md)  
**Evidence:** actual routes, components, APIs, RBAC, and tests — not screenshots.

**No application code, APIs, Prisma, V1 screens, V2 platform screens, Costing, Logistics, Customer Master, D365, or BrandLogo/logo WIP were changed in this increment.**

---

## 1. Executive summary

P1.5-03 delivered **empty product shells**. Almost every **live** V1 commercial/engineering/costing capability still exists only on `/customer/*` and `/internal/*` (plus APIs). V2 product routes (`/v2/customer/*`, `/v2/internal/*`) render `NOT_IMPLEMENTED` placeholders. The Task 02/03 **platform navigator** (`/v2`, `/v2/modules/*`) is IA, not the product journey.

**V2 is not a functional replacement for the current application.** Cutover is **blocked**.

| Dimension | Assessment |
|-----------|------------|
| Functional parity | **FAIL** |
| UX parity | **PARTIAL** (tokens + shells; no workflow UX) |
| Security parity | **PARTIAL** (shell isolation tested; V2 product has no business screens to exercise IDOR/costing redaction) |
| **Overall** | **NOT READY** |

A feature that exists in V1 is treated as valuable until explicitly classified otherwise. Stubs are **not** IMPROVED.

---

## 2. Actual V1 capability inventory

### 2.1 Auth / chrome (shared)

| Capability | Evidence | Persistence | Security |
|------------|----------|-------------|----------|
| Login | `LoginPage.tsx`, `/login*` | Live JWT | Public |
| Session restore / refresh | `AuthContext`, `/api/auth/refresh-token`, `/me` | Live | Auth |
| Profile / password | `UserProfilePage.tsx`, `/customer/profile`, `/internal/profile` | Live | Authenticated |
| Navbar / Sidebar / Footer | `layout/*` | — | Portal-split |
| Customer mobile bottom nav | `App.tsx` `CustomerBottomNav` | — | Customer |
| Overlay login modal | `LoginModal.tsx` | — | — |

Post-login still lands on **V1** homes (`/customer`, `/internal`) — not V2 product shells (`shellRoutes.postLoginPath`).

### 2.2 Customer portal — nav-visible (Phase 1)

Sidebar `PHASE1_CUSTOMER_TABS` = **Dashboard, My Inquiries, Support only**.

| Capability | Route | Component | Persistence | Notes |
|------------|-------|-----------|-------------|-------|
| Dashboard | `/customer` | `CustomerDashboard.tsx` | Live inquiries + mock orders | `GET /api/inquiries` |
| My Inquiries | `/customer/inquiries` | `PriceEstimation` → `CustomerInquiryList` | Live | Create/list |
| Inquiry detail | `/customer/inquiries/:id` | `CustomerInquiryDetail` → `CommercialInquiryDetail` `portalMode=customer` | Live | **Same 8-tab workspace as internal**, including a **Costing** tab (`inquiryWorkspaceTabs.ts`) |
| Support | `/customer/support` | `SupportCenter.tsx` | Static/mock | No Case/KB APIs |

**Buried on inquiry detail (live, easy to miss):** lines/cables, cutting, drums, documents, quotation, activity, VIP Calculate, V2 configuration panel, attachments, commercial projection (customer-facing costing), **customer commercial commitment** (`CustomerCommitmentPanel`), **customer fulfillment status** (`CustomerFulfillmentStatusPanel`). APIs: `/api/inquiries/**`, `/api/v2/inquiries/**`, drum/cutting/container/quotation/commitment as mounted in that workspace.

### 2.3 Customer portal — URL-reachable, hidden from Phase 1 nav

Still mounted in `CustomerPortalPages` if the URL is allowed (`customerTabFromPath` + ELAND filter).

| Capability | Route | Persistence | Honesty |
|------------|-------|-------------|--------|
| Sales orders | `/customer/sales-orders` | Mock fixtures | `SalesOrders.tsx` |
| Drum optimizer (standalone) | `/customer/drum-optimizer` | Hybrid drums API | Not in Phase 1 nav |
| Statement | `/customer/statement` | Mock | Hidden nav |
| Invoices alias | `/customer/invoices` | Same mock | Hidden nav |
| Shipment tracker | `/customer/shipments` | Inline mock | Hidden nav |
| TDS library | `/customer/documents` | Inline mock | Hidden nav |
| Process / journey | `/customer/process`, `/journey` | Static diagram | ELAND-oriented |

ELAND customers are restricted to dashboard / inquiries / support (`isCustomerTabAllowed`).

### 2.4 Internal portal

| Capability | Route | Permission (App.tsx) | Persistence |
|------------|-------|----------------------|-------------|
| Dashboard | `/internal` | `overview` | Hybrid KPIs |
| Technical Office | `/internal/technical-office` | `technicalOffice` | Hybrid (mapping/BOM/TCR) |
| Cable parameters | `/internal/cable-parameters` | **No `AccessRestricted` in App** (Sidebar uses `technicalOffice`) | Hybrid |
| Costing hub v3 | `/internal/costing` | `costingPricing` | Live `/api/admin/costing/**` |
| Sales quotations / inquiry | `/internal/quotations` | `salesQuotations` | Live commercial |
| Fulfillment (SO / agreements / releases) | `/internal/sales-orders` (+ aliases) | `salesQuotations` | Live; **Phase 1 freeze**; D365 NOT_SENT |
| Production monitoring | `/internal/production` | `ordersProduction` | Mock + Advaris NOT_CONNECTED |
| Logistics (same UI) | `/internal/logistics` | `ordersProduction` | Mock alias |
| Finance & collections | `/internal/finance` | `financeCollections` | Mock NOT_IMPLEMENTED |
| Master data hub | `/internal/master-data` | `masterData` | Hybrid PG + LS browsers |
| Analytics | `/internal/analytics` | `reportsAnalytics` | Partial KPIs; no report engine |
| Administration | `/internal/administration` | `userManagement` | Live users/roles/customers |

**Buried internal (live, easy to miss):**

| Location | Capabilities |
|----------|----------------|
| Inquiry detail | Same 8 tabs + extended `technical_offer` / `notes` / `history` / `audit` when `canViewExtendedInternal`; VIP Calculate; `CommercialFulfillmentPanel` (commercial approve → Direct SO **or** Sales Agreement) |
| Technical Office tabs | mapping queue, BOM governance, TCR, catalog, excel sync, master params, BOM materials |
| Cable Parameters | `CableConfiguratorHub` — **no `AccessRestricted` in `App.tsx`** (Sidebar still requires `technicalOffice`) |
| Master Data hub | Cable, BOM, raw materials, drums, import/audit |
| Costing hub | RM prices, scrap rules, costing audit, workbenches |
| Administration | users, roles, customers, **customer audit** (`/api/admin/customers/:id/audit`) |
| Fulfillment workspace | commitments, sales orders, sales agreements, agreement releases (Phase 1 freeze; D365 NOT_SENT) |
| Modals | CableSearchSelectModal, DrumSelectionWorkflowPanel, container/drum optimizer |

Server **AuditEvent** (PostgreSQL) is authoritative; V2 product has **no** audit UI.

### 2.5 Platform V2 (not product UX)

| Route | Purpose | Status |
|-------|---------|--------|
| `/v2` | Module navigator | Present (IA) |
| `/v2/security` | Effective access | Present |
| `/v2/master-data` | Ownership surfaces | Present |
| `/v2/modules/:id/...` | Module workspaces | Present; many PLANNED |
| `/v2/*` unknown | Redirect `/v2` | Present |

Internal-only (`resolveShellNavigation`). `/v2/modules/customer` ≠ `/v2/customer`.

### 2.6 APIs / engines (no UI required for “exists”)

Live groups (Doc 02 + routers): auth, admin identity/customers, master/drums, cables/TO, costing runtime+admin, commercial inquiries/quotations/pricing, fulfillment commitments/SO/agreements, `/api/v2/*` inquiry configuration, container study, shipping cost, shipment cost snapshot, financial offer snapshot, workflow, VIP calculate. D365/Advaris **stubs**.

---

## 3. Actual V2 product inventory

| Route | What renders | Status |
|-------|----------------|--------|
| `/v2/customer` | EmptyState + NOT_IMPLEMENTED | Shell only |
| `/v2/customer/inquiries` | Stub | NOT_IMPLEMENTED UI |
| `/v2/customer/quotations` | Stub | NOT_IMPLEMENTED UI |
| `/v2/customer/fulfillment` | Stub | NOT_IMPLEMENTED UI |
| `/v2/customer/*` (other) | Stub | Catch-all stub |
| `/v2/internal` | EmptyState + NOT_IMPLEMENTED | Shell only |
| `/v2/internal/commercial` | Stub | NOT_IMPLEMENTED UI |
| `/v2/internal/engineering` | Stub | NOT_IMPLEMENTED UI |
| `/v2/internal/logistics` | Stub | NOT_IMPLEMENTED UI |
| `/v2/internal/costing` | Stub | NOT_IMPLEMENTED UI |
| `/v2/internal/*` (other) | Stub | Catch-all stub |

**No** V2 product: dashboard KPIs, inquiry CRUD, configuration, cutting, drums, container, costing workbench, pricing, quotation issue, commitment, SO, master data, admin, profile, support, audit UI.

Intended Doc 53 journey vs product V2: every business stage after login is **NOT_IMPLEMENTED** in the product shell (backend may still exist for V1).

---

## 4. Customer parity matrix (traceable)

| V1 capability | V1 evidence | V2 product | Class |
|---------------|-------------|------------|--------|
| Login / JWT | LoginPage, tests | Same `/login` | **RELOCATED** (shared; not a V2 product page) |
| Profile | `/customer/profile` | No route | **MISSING** |
| Dashboard | `CustomerDashboard` | Empty home | **MISSING** |
| Inquiry list/create | `CustomerInquiryList`, `/api/inquiries` | Stub `/inquiries` | **MISSING** |
| Inquiry workspace (lines, cutting, drums, docs, quote, activity) | `CommercialInquiryDetail` customer | No detail route | **MISSING** |
| Cable configuration | Inquiry + configurator | None | **MISSING** |
| VIP Calculate | Inquiry detail | None | **MISSING** |
| Customer Costing tab | `CUSTOMER_PORTAL_TABS` includes `costing` | Explicitly omitted from V2 customer nav | **REMOVED-BY-DESIGN candidate** (Doc 53 §19) |
| Quotations (issued view) | Inquiry quotation tab + projection | Stub | **MISSING** |
| Fulfillment status (live SO) | Mostly mock on portal; live on internal fulfillment | Stub | **NOT_IMPLEMENTED** / mock V1 |
| Support static | `SupportCenter` | No nav item | **V1-ONLY** (static) **or MISSING** — **NEEDS REVIEW** |
| Hidden mock SO / statement / invoices / shipments / TDS / process | Mounted, Phase 1 nav hidden | None | **V1-ONLY** (mock) pending product decision |
| Standalone Drum Optimizer | Hidden nav, hybrid | None (Doc 53 relocates into inquiry drum plan) | **RELOCATED** intent, **MISSING** in V2 UI |
| Commercial commitment (customer) | `CustomerCommitmentPanel` on inquiry | None | **MISSING** |
| Fulfillment after commitment | `CustomerFulfillmentStatusPanel` (live API, not mock SO page) | Stub `/fulfillment` | **MISSING** |
| Mobile bottom nav | `CustomerBottomNav` | Not in product shell | **MISSING** (UX) |
| Cost redaction | `commercialProjection.ts` | Unused on V2 product (no screens) | **SAME** on V1; **N/A** on V2 product |
| Customer isolation | `customerScope` | Shell isolation yes; no business APIs from V2 UI | See §8 |

---

## 5. Internal parity matrix (traceable)

| V1 capability | V1 evidence | V2 | Class |
|---------------|-------------|-----|--------|
| Dashboard | `InternalDashboard` | Product home stub; platform `/v2` is navigator | **MISSING** (product) / **RELOCATED** (IA to `/v2`) |
| Technical Office | `TechnicalOffice.tsx` | Engineering stub | **MISSING** |
| Cable parameters / configurator | `CableConfiguratorHub` | Engineering stub | **MISSING** |
| Costing v3 | `CostingWorkspaceShell` | `/v2/internal/costing` stub | **MISSING** (must remain internal-only) |
| Inquiry / quotation | `SalesQuotations` + detail | Commercial stub | **MISSING** |
| Fulfillment SO/agreement/release | `CommercialFulfillmentWorkspace` | Commercial stub | **MISSING** |
| Commercial approve → Direct SO / Agreement | `CommercialFulfillmentPanel` on inquiry | None | **MISSING** |
| Container study / B4 / financial offer | APIs + inquiry-embedded UI | Logistics stub | **MISSING** UI; APIs **SAME** on V1 |
| Inquiry audit / TO queues / RM prices | Extended tabs; TO; costing hub | None | **MISSING** |
| Master data hub / import | `MasterDataHub` | Platform ownership panel ≠ hub | **MISSING** (product); **RELOCATED** fragment on `/v2/master-data` |
| Administration / RBAC / customers | `AdministrationHub` | None in product shell | **MISSING** |
| Analytics | `ReportsAnalytics` | None | **MISSING** / partial V1 |
| Production / logistics mocks | `ProductionMonitoring` | Logistics stub | **V1-ONLY** (mock) + **NOT_IMPLEMENTED** ops |
| Finance mock | `FinanceCollections` | None | **NOT_IMPLEMENTED** / **V1-ONLY** |
| Platform navigator | `/v2/modules/*` | **PRESENT** | **IMPROVED** only as IA, not product journey |
| Effective access | `/v2/security` | **PRESENT** | Platform **PRESENT** |

---

## 5b. Feature parity count matrix (register primary class only)

Counting rule: each register row is counted **once**, in its **primary** class. Dual notes (e.g. C12 relocated *intent*) do not add a second count. C08 is **not** counted as Removed until product confirms. I12 is IA, not a product-journey PRESENT.

| Domain | V1 rows | V2 Present | Improved | Relocated | Missing | Regressed | Removed | V1-only | Not Implemented | Other |
|--------|---------|------------|----------|-----------|---------|-----------|---------|---------|-----------------|-------|
| Customer | C01–C14 (14) | 0 | 0 | 0 | C01–C07, C09, C12–C14 (11) | 0 | 0 | C10–C11 (2) | 0 | C08 NEEDS REVIEW (1) |
| Internal | I01–I16 (16) | 0 | I12 IA (1) | 0 | I01–I09, I13–I16 (13) | 0 | 0 | I10 (1) | I11 (1) | — |
| Security / cross | S01–S03, X01–X03 (6) | S02, X01 (2) | S01 (1) | 0 | 0 | 0 | 0 | 0 | X02 (1) | S03 unproven (1); X03 SAME (1) |
| **Total register** | **36** | **2** | **2** | **0** | **24** | **0** | **0** | **3** | **2** | **3** |

**Product-journey IMPROVED: 0. V1 REGRESSED: 0.** Login is shared (`/login`), not a V2 product page — omitted from C-series to avoid inflating Relocated.

---

## 6. Functional parity analysis

V1 quote-to-cash **core is live**. V2 product **does not execute** any of: create inquiry, configure cable, cutting, drum confirm, container confirm, cost, price, issue quotation, commit, release SO.

Therefore functional parity is **FAIL**. This is expected after P1.5-03 (shell-only) and must not be narrated as “almost done.”

---

## 7. UX parity analysis

| Topic | V1 | V2 product | Note |
|-------|----|------------|------|
| Discoverability | Sidebar + 8-tab inquiry | 4 customer / 5 internal links to stubs | Stubs are honest (`ErrorState`) |
| Density | Customer airier; internal dense; costing navy | Customer header; internal sidebar | Intent matches Doc 54; empty |
| Confidentiality | Customer costing tab still present | Customer nav has no Costing | **Improved intent**, not proven |
| Snapshot UX | Mixed; primitives exist unwired | `SnapshotBanner` unused in shells | **MISSING** wiring |
| Responsive | Customer bottom nav | No bottom nav in V2 customer | **MISSING** |
| Errors | Mixed | Honest NOT_IMPLEMENTED | **IMPROVED** honesty on empty shells only |

UX overall: **PARTIAL**.

---

## 8. Security parity analysis

**Shell isolation (tested)** — `shellRoutes.test.ts` P1.5-03 cases:

| User | `/v2/customer/*` | `/v2/internal/*` | Platform `/v2`, `/v2/modules/*` | V1 other portal |
|------|------------------|------------------|---------------------------------|-----------------|
| Customer | allow | deny → `/customer` | deny → `/customer` | deny `/internal` |
| Internal | deny → `/v2/internal` | allow | allow | deny `/customer` |

Enforced in `resolveShellNavigation`, not only hidden menus. **PASS** for this slice.

**Not yet exercised on V2 product screens (because they do not exist):** inquiry IDOR, `customerScope` on `/api/inquiries`, costing redaction, quotation PDF cost leak, admin customer CRUD. Those remain **PASS on V1** (`commercialRoutes`, `increment12*`, container/B4 tests). Do not claim V2 product commercial security parity.

**V1 note (NEEDS REVIEW, not a V2 gap):** `App.tsx` mounts Cable Parameters **without** `AccessRestricted`; Sidebar gates on `technicalOffice`. Direct URL may differ from nav.

Security overall: **PARTIAL**.

---

## 9. API / data parity analysis

| Area | V1 | V2 product UI | Class |
|------|----|---------------|--------|
| Auth | `/api/auth/*` | Reused | **REUSED** |
| Inquiries | `/api/inquiries`, `/api/v2/inquiries` | Not called from product shell | **REUSED** backend / **MISSING** UI |
| Costing | `/api/admin/costing`, `/api/costing` | Not called | **REUSED** backend / **MISSING** UI |
| Fulfillment | commitments/SO/agreements | Not called | **REUSED** / **MISSING** UI |
| Container / B4 / FO snapshots | `/api/v2/container-studies`, shipment-cost, financial-offer | Not called | **REUSED** / **MISSING** UI |
| D365 / Advaris | Stub status | — | **NOT_IMPLEMENTED** |
| Dual LS+PG masters | Known limitation | Unchanged | **SAME** |

No APIs were added or changed for P1.5-04.

---

## 10. Detailed gap register

Severity: security loss = HIGH/CRITICAL. Missing live core workflow = HIGH/CRITICAL.

| ID | Area | V1 Capability | V1 Evidence | V2 Target | Class | Sev | Security | API/Data | Owner | Resolution |
|----|------|---------------|-------------|-----------|-------|-----|----------|----------|-------|------------|
| P1504-C01 | Customer | Inquiry list/create | `CustomerInquiryList`, `/customer/inquiries` | `/v2/customer/inquiries` stub | MISSING | **CRITICAL** | Isolation must remain | REUSED APIs | Product | Implement after shell accept |
| P1504-C02 | Customer | Inquiry 8-tab workspace | `CommercialInquiryDetail` customer | No `:id` route | MISSING | **CRITICAL** | Projection/IDOR | REUSED | Product | Design V2 tabs **without** internal costing |
| P1504-C03 | Customer | Cable / cutting / drum in inquiry | Detail tabs + modals | None | MISSING | **CRITICAL** | — | REUSED `/api/v2` | Eng/Product | Mount via parity, not V1 clone |
| P1504-C04 | Customer | VIP Calculate | Inquiry detail | None | MISSING | HIGH | — | REUSED orchestrator | Product | Internal+VIP policy |
| P1504-C05 | Customer | Issued quotation view | Quotation tab + projection | Stub | MISSING | HIGH | No cost leak | REUSED | Commercial | |
| P1504-C06 | Customer | Dashboard KPIs | `CustomerDashboard` | Empty home | MISSING | MEDIUM | Scope | REUSED list API | Product | |
| P1504-C07 | Customer | Profile | `/customer/profile` | None | MISSING | MEDIUM | Auth | REUSED | Identity | |
| P1504-C08 | Customer | Costing tab | `CUSTOMER_PORTAL_TABS` includes costing | Omit | REMOVED-BY-DESIGN **candidate** | HIGH if leaked | Confidentiality | Projection | Product | **Confirm** Doc 53 §19 |
| P1504-C09 | Customer | Mobile nav | `CustomerBottomNav` | None | MISSING | LOW | — | — | UX | |
| P1504-C10 | Customer | Support static | `SupportCenter` | None | V1-ONLY / NEEDS REVIEW | LOW | — | None | Product | Keep V1 until Case model |
| P1504-C11 | Customer | Hidden mock SO/AR/ship/TDS/process | Mounted, nav hidden | None | V1-ONLY | LOW | Don’t fake live AR | Mock | Product | Confirm exclude |
| P1504-C12 | Customer | Standalone drum optimizer | `/customer/drum-optimizer` | Inquiry drum plan (Doc 53) | RELOCATED intent / MISSING UI | MEDIUM | — | Drum APIs | Eng | Don’t drop V1 until V2 drum in inquiry |
| P1504-C13 | Customer | Commercial commitment | `CustomerCommitmentPanel` | None | MISSING | **CRITICAL** | Isolation | REUSED commitment APIs | Commercial | Distinct from mock `/sales-orders` |
| P1504-C14 | Customer | Post-commitment fulfillment | `CustomerFulfillmentStatusPanel` | Stub `/fulfillment` | MISSING | HIGH | Isolation | REUSED | Commercial | Do not substitute hidden mock SO page |
| P1504-I01 | Internal | Costing v3 | `/internal/costing` | Stub | MISSING | **CRITICAL** | Internal only | REUSED | Costing | Never customer |
| P1504-I02 | Internal | Inquiry/quotation | `/internal/quotations` | Commercial stub | MISSING | **CRITICAL** | RBAC `salesQuotations` | REUSED | Commercial | |
| P1504-I03 | Internal | TO / mapping / BOM gov | `TechnicalOffice` | Engineering stub | MISSING | **CRITICAL** | `technicalOffice` | Hybrid | Eng | |
| P1504-I04 | Internal | Configurator hub | `/internal/cable-parameters` | Engineering stub | MISSING | HIGH | Nav vs URL NEEDS REVIEW | Hybrid | Eng | |
| P1504-I05 | Internal | Fulfillment SO/agreement | `CommercialFulfillmentWorkspace` | Stub | MISSING | HIGH | Freeze domain | Live; D365 stub | Commercial | Don’t fake D365 |
| P1504-I06 | Internal | Container / B4 / FO | APIs + embedded UI | Logistics stub | MISSING | HIGH | Isolation tests exist | REUSED | Logistics | |
| P1504-I07 | Internal | Master data hub | `MasterDataHub` | `/v2/master-data` IA only | MISSING | HIGH | `masterData` | Hybrid | MD | |
| P1504-I08 | Internal | Admin users/roles/customers | `AdministrationHub` | None | MISSING | HIGH | `userManagement` | Live | Admin | |
| P1504-I09 | Internal | Dashboard / analytics | InternalDashboard, Reports | Stub / none | MISSING | MEDIUM | | Partial | | |
| P1504-I10 | Internal | Production/logistics mock | `ProductionMonitoring` | Logistics stub | V1-ONLY + NOT_IMPLEMENTED | LOW | Honest NOT_CONNECTED | Stub | Ops | |
| P1504-I11 | Internal | Finance mock | `FinanceCollections` | None | NOT_IMPLEMENTED | LOW | | None | Finance | D365 later |
| P1504-I12 | Platform | Module navigator | `/v2/modules/*` | PRESENT | IMPROVED (IA only) | — | Internal only | — | Platform | Keep; ≠ product |
| P1504-I13 | Internal | Inquiry extended tabs (TO/notes/history/audit) | `resolveInquiryWorkspaceTabs` | None | MISSING | MEDIUM | RBAC | REUSED | Eng | Easy to miss; not in 8-tab default |
| P1504-I14 | Internal | Cable / BOM / RM / RM prices / drums | TO + `MasterDataHub` + costing panels | None / platform MD fragment | MISSING | HIGH | `masterData` / `costingPricing` | Hybrid | MD/Costing | Buried in hubs, not top-level nav |
| P1504-I15 | Internal | Commercial approve → SO/Agreement | `CommercialFulfillmentPanel` | None | MISSING | **CRITICAL** | `salesQuotations` | REUSED | Commercial | Buried on inquiry, not Sales Orders nav |
| P1504-I16 | Internal | Audit UI (customer/costing/inquiry) | Admin + costing + inquiry audit tab; `AuditEvent` | None | MISSING | HIGH | Must stay internal | REUSED `AuditEvent` | Admin | Platform module may mention audit; no product UI |
| P1504-S01 | Security | Customer vs platform `/v2` | Tests | Enforced | IMPROVED vs pre-03 | — | Shell | — | Platform | Keep tests |
| P1504-S02 | Security | `/v2/modules/customer` vs `/v2/customer` | Tests | Distinct | PRESENT | — | | — | Platform | Keep |
| P1504-S03 | Security | V2 product IDOR/cost leak | N/A no screens | Unproven | N/A | **HIGH** when UI lands | Must reuse V1 asserts | Eng | Gate every screen |
| P1504-X01 | Cross | Current version preservation | `/customer`,`/internal` live | Parallel | PRESENT | — | | — | Release | Until cutover |
| P1504-X02 | Cross | D365 | Adapters stub | — | NOT_IMPLEMENTED | — | | Stub | Integration | |
| P1504-X03 | Cross | Dual LS/PG | Known limitation | Unchanged | SAME | MEDIUM | Data integrity | Dual | 04B | |

---

## 11. Critical regressions

**None in V1** (V1 not modified).

**V2 product vs V1 live:** if someone treated V2 shells as the product, they would **lose** inquiry, engineering, costing, quotation, **customer and internal commercial commitment**, container, audit UI, admin, TO queues, RM prices. That is **MISSING**, not REGRESSED (V1 still runs). Cutover without resolving P1504-C01–C05, **C13**, and I01–I08 / **I15** would be a **CRITICAL** regression.

Buried V1 that is especially easy to drop: `CustomerCommitmentPanel`, `CommercialFulfillmentPanel`, inquiry `audit` tab, TO mapping/TCR/BOM queues, costing RM-price + audit panels.

---

## 12. Removed-by-design candidates (need explicit confirmation)

| Candidate | Why it might be removed | Must not assume |
|-----------|-------------------------|-----------------|
| Customer **Costing** tab | Doc 53 §19: no RM/mfg/G&A/margin | Confirm; V1 still shows a Costing tab with commercial-facing content |
| Phase-1-hidden mock AR/ship/TDS/process | Mocks; not in Doc 53 journey | Confirm **V1-ONLY** vs later fulfillment status |
| Standalone Drum Optimizer nav | Doc 53: drum plan in inquiry | Do not delete V1 until inquiry drum UX exists |
| Customer 8-tab clone of internal | Doc 53: different experiences | Redesign tabs; don’t drop cutting/drums |

---

## 13. V1-only (retain until decision)

- Entire V1 portals (release criterion).
- Support static UI (no Case model).
- Production / logistics **mocks**.
- Finance collections **mock**.
- Hidden customer mock screens (SO, statement, invoices, shipment tracker, TDS, process) unless product promotes them.

---

## 14. NOT_IMPLEMENTED (genuine)

- D365 live posting / invoices.
- Advaris MES.
- Native inventory/WMS/procurement/GL.
- Report execution engine.
- Support Case/KB.
- V2 product business screens (UI); backends often **exist**.

---

## 15. Three-dimension release assessment

| Dimension | Result | Why |
|-----------|--------|-----|
| Functional | **FAIL** | No V2 product workflow |
| UX | **PARTIAL** | Shell + tokens; empty journey |
| Security | **PARTIAL** | Shell isolation PASS; business-screen security unproven on V2 |

---

## 16. Overall V2 parity verdict

**NOT READY** (cutover **BLOCKED**).

Shells existing ≠ parity. Do not optimize this register to look complete.

---

## 17. Recommended gap-resolution sequence

1. Confirm §12 (especially customer Costing tab).  
2. Customer inquiry list + detail **without** internal cost build-up; reuse APIs + `customerScope` + projection tests.  
3. Cutting + drum + configuration on that inquiry (V1 must keep standalone optimizer until then).  
4. Customer quotation view + **commitment** (C13) + honest fulfillment status (C14) — not mock SO.  
5. Internal inquiry/quotation + `CommercialFulfillmentPanel` (I15) + costing (internal-only) + TO queues.  
6. Container / B4 / financial offer UI on internal (APIs already live).  
7. Fulfillment workspace (SO / agreement / release) honest status (no fake D365).  
8. Admin / master data / audit product surfaces or keep **V1-ONLY** with links.  
9. Re-run P1.5-04; no cutover until CRITICAL/HIGH MISSING cleared or explicitly V1-ONLY.

---

## 18. Files / routes / tests inspected

- `src/App.tsx`, `src/app/shellRoutes.ts`, `src/app/shellRoutes.test.ts`
- `src/components/v2/V2Shell.tsx`, `V2CustomerProductShell.tsx`, `V2InternalProductShell.tsx`
- `src/components/layout/Sidebar.tsx`, `src/components/customer/*` (incl. `CustomerCommitmentPanel`, `CustomerFulfillmentStatusPanel`), `src/components/internal/*` (TO, MD, Admin, Costing, SalesQuotations), `src/components/inquiry-quotation/*` (incl. `CommercialFulfillmentPanel`, `inquiryWorkspaceTabs.ts`), `src/components/fulfillment/*`, `src/components/costing/v3/*`
- `src/server/customerScope.ts`, `src/server/rbac.ts`, `src/server/serverAudit.ts`, commercial/commitment/container routes
- `docs/v2/02_V1_FUNCTIONAL_INVENTORY.md`, 11, 53, 54, 55
- Tests: `shellRoutes.test.ts`, `inquiryWorkspaceTabs.test.ts`, commercial/costing/container/B4/identity suites (not re-run as a change set; last full suite was P1.5-03)

---

## 19. Evidence rule for material gaps

Every CRITICAL/HIGH row cites a V1 component/route that **runs** and a V2 product route that is a **stub or absent**. Platform `/v2/modules/*` is not counted as product-journey PRESENT.

---

## 20. Implementation statement

**NO implementation changes were made.** No screens, APIs, Prisma, V1, V2 platform, Costing, Logistics, Customer Master, D365, or BrandLogo/logo WIP were modified for P1.5-04.

---

**P1.5-04 = PARITY ANALYSIS ONLY. Cutover is not authorized.**
