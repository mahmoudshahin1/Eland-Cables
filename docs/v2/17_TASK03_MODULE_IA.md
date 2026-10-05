# 17 — Task 03 Module Information Architecture

**Status:** Implemented (Module IA + Master Data foundation) — 2026-09-04  
**Depends on:** Task 02 platform foundation (docs 11–16)  
**Commit intent:** `feat(v2): establish ERP module information architecture`

---

## 1. What Task 03 delivered

| Area | Deliverable |
|------|-------------|
| Module IA pattern | Workspace \| Master Data \| Transactions \| Setup \| Workflows \| Reports \| Dashboards via registry `surfaces` + `moduleIa.ts` |
| Navigator | Category grouping, module status badges, active module/surface, breadcrumbs, module secondary nav |
| Workspace contract | Header, summary, KPIs (LIVE or **NOT AVAILABLE**), primary actions, surfaces, ownership, invariants |
| Master Data IA | `/v2/master-data` ownership surfaces (owner module / entity / permissions / scope / frozen) |
| Service boundaries | Customer, Engineering/Cable, BOM, Costing, Pricing, shared reference — modular monolith, no second engines |
| ERP list/form | `ErpListPanel` + `ErpFormPanel` (typed + `PlatformFieldDefinition` metadata — **no** drag-drop builder) |
| Customer MD | Customer Management → Master Data → Customers (embeds `AdministrationCustomersPanel`; customerScope preserved) |
| Engineering MD | Cables / Params / BOM / Drums under Engineering — **not** separate Cable/Drum apps |
| Commercial packaging | Costing / Pricing / Inquiry-Quotation / Sales-Commercial V2 IA wrappers — **no** business-rule changes |
| Security | New `/api/v2/ia/*` routes require auth; customer shell blocked from `/v2`; MD panels permission-aware |
| Routes | Consistent `/v2/modules/:moduleId/...`; V1 `/customer` `/internal` `/api` preserved |

**Code anchors**

- `src/platform/moduleRegistry.ts` — single registry (workspaceEntry → `/v2/...`, `legacyWorkspaceEntry` for V1)
- `src/platform/moduleIa.ts` — IA helpers, contracts, breadcrumbs, ownership surfaces
- `src/platform/dataOwnershipMatrix.ts` — unchanged authority model (consumed)
- `src/platform/services/*` — MD service boundaries
- `src/components/v2/V2Shell.tsx` — navigator + routes
- `src/components/v2/ModuleWorkspace.tsx`, `ErpListPanel.tsx`, `ErpFormPanel.tsx`, `MasterDataOwnershipPanel.tsx`, `V2ModulePages.tsx`
- `src/server/v2PlatformRoutes.ts` — Task 03 IA API (mounted under `/api/v2` via `server.ts`)

**IA HTTP route map (auth required → 401 when unsigned-in)**

| Method | Path | Notes |
|--------|------|--------|
| GET | `/api/v2/ia/navigator` | Category groups + informational strip |
| GET | `/api/v2/ia/modules/:moduleId/workspace` | Workspace contract (`moduleId` e.g. `CUSTOMER`) |
| GET | `/api/v2/ia/master-data/ownership` | Ownership surface rows + matrix |
| GET | `/api/v2/ia/service-boundaries` | MD service boundary descriptors |

There is **no** bare `GET /api/v2/ia/modules` list route (that path correctly 404s). Use `/ia/navigator` for module listing and `/ia/modules/:moduleId/workspace` for a single workspace contract. Task 02 routes such as `GET /api/v2/modules` remain separate.

---

## 2. Navigation policy (unchanged honesty)

| Status | Navigator | Workspace |
|--------|-----------|-----------|
| LIVE / PARTIAL / FROZEN | Default nav when `navDefault` + `workspaceEntry` | Operational |
| PLANNED / STUB / NOT_IMPLEMENTED | Catalog-only strip on home | **No fake screens** |

Finance / Supply Chain / Support gaps remain stub-marked. Reports/Dashboards surfaces appear only when registry availability is IMPLEMENTED/PARTIAL and KPI tiles refuse invented counts.

---

## 3. Master Data ownership

Write ownership stays exclusive per `dataOwnershipMatrix.ts`. Task 03 adds **surfaces** that identify:

- Owning module
- Entity
- Permission hints
- Scope (GLOBAL / CUSTOMER / INTERNAL)
- V2 path + V1 bridge

Customer commercial isolation continues through `customerScope` on commercial APIs; admin Customer CRUD remains internal GLOBAL.

---

## 4. Explicit non-goals (Task 03)

- Full master-data cutover (eliminate dual localStorage SoT) — later
- Low-code / drag-drop form or workflow builders
- Supply Chain / Inventory / Warehouse fake data or ledgers
- Finance GL / AR / AP / bank engines
- Live D365 / Advaris (remain NOT_IMPLEMENTED / NOT_CONNECTED)
- Costing Option B / Decision 5 metal semantics changes
- Phase 1 fulfillment domain semantic changes (FROZEN)
- Second registry or duplicate Customer / Pricing / Costing / Engineering / BOM / SO authorities
- Breaking V1 routes

---

## 5. Database

**No schema migration required** for Task 03. Prefer Task 02 `PlatformFieldDefinition`, `NumberSequence`, security groups, audit.

---

## 6. Verification

- `npm test` (includes `moduleIa.test.ts`, foundation tests)
- `npm run build`
- `tsc --noEmit`
- `npx prisma validate`
- Manual: `/v2` navigator, `/v2/modules/customer/master/customers`, Engineering master children, frozen Sales/Commercial banner, V1 `/internal/*` still open
- Smoke (unsigned): `GET /api/v2/boundary` → 200; `GET /api/v2/modules` → 401; `GET /api/v2/ia/navigator` (and other `/api/v2/ia/*` rows above) → 401 — not 404. Do not smoke bare `/api/v2/ia/modules`.

### Shell route assertions (fulfillment aliases)

`src/app/shellRoutes.test.ts` (committed in `e007311`) includes two V1 path-alias checks:

- `internalTabFromPath('/internal/sales-agreements') === 'sales_orders'`
- `internalTabFromPath('/internal/fulfillment') === 'sales_orders'`

These assert **frozen Phase 1 / commercial fulfillment V1 URL aliases**, not Task 03 module IA. The matching entries in `shellRoutes.ts` live in **unstaged fulfillment WIP**, not in Task 03 commits. They were **left in place** during Task 03 hygiene because:

1. Moving them into `commercialFulfillmentWorkflow.test.ts` (or similar) would mix hygiene with untracked fulfillment WIP and risk a split commit that drops coverage until that WIP lands.
2. Removing them without a destination would lose alias regression coverage once fulfillment aliases merge.
3. Fulfillment domain logic must not be modified for Task 03 hygiene.

**Follow-up (fulfillment commit, not Task 03 / Task 04):** land `shellRoutes.ts` aliases with those assertions, or relocate the two lines into a committed fulfillment shell/route test in the same commit as the aliases.

---

## 7. Recommended next (Task 05 only — do not start here)

Package Inquiry & Quotation as a full module surface set with field-metadata SoT on list/form (Phase 4 roadmap) — still without lifting freezes. Close remaining Task 04 gaps (Excel Method-B, select LS fallbacks) only if needed for that packaging.
