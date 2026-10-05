# Task 03 — File-Level Scope Audit

**Date:** 2026-09-04  
**Auditor:** Cursor agent (scope audit only)  
**Branch:** `cursor/costing-configuration-dashboard`  
**Rule for this session:** DO NOT COMMIT / DO NOT PUSH / DO NOT amend `c141d12` / `664da4a` / `e007311` / `9ca1e2f`. DO NOT start Task 04. DO NOT modify WIP to “clean” files.

---

## 1. Task 03 change-set identification

### Already committed (primary)

| Commit | Message | Files | Net |
|--------|---------|-------|-----|
| `e007311` | `feat(v2): establish ERP module information architecture` | **25** | +2557 / −92 |
| `9ca1e2f` | `docs(v2): clarify task 03 ia api route map` | **1** (already in set) | +13 / −1 |

**Unique Task 03 committed files:** 25 (docs fix only revises `docs/v2/17_TASK03_MODULE_IA.md`).

### Index / staging

- **`git diff --cached`:** empty — nothing staged.
- Committed diff used instead: `git show e007311` / `git diff e007311^..e007311`, plus `9ca1e2f` for the docs clarification.

### Still-unstaged Task 03-related edits?

| Finding | Detail |
|---------|--------|
| No pure Task 03 WIP files left uncommitted | All IA/MD/service/UI Task 03 deliverables are in `e007311` (+ docs in `9ca1e2f`). |
| Related **gaps** only in mixed WIP | Working-tree `package.json` adds `moduleIa.test.ts` to `npm test` (also mixes drum/fulfillment tests). Working-tree `shellRoutes.ts` adds fulfillment path aliases that `e007311`’s `shellRoutes.test.ts` asserts — those aliases are **not** on clean HEAD. |
| Special attention paths | `App.tsx`, `shellRoutes.ts`, `Sidebar.tsx`, `prisma/schema.prisma`, `package.json`, `masterDataRoutes.ts` are **not** in `e007311`; all current edits are **EXISTING WIP** (fulfillment / drum / demo), not Task 03. |

---

## 2. Complete file table

Classification legend (exactly one): `TASK03` | `TASK02 CARRYOVER` | `EXISTING WIP` | `UNRELATED` | `AMBIGUOUS`

### A. Files in `e007311` (25) + docs follow-up `9ca1e2f`

| File | Classification | Task 03 purpose | Change summary | Safe to commit? |
|------|----------------|-----------------|----------------|-----------------|
| `docs/v2/17_TASK03_MODULE_IA.md` | TASK03 | Task 03 documentation | New IA status doc; `9ca1e2f` clarifies `/api/v2/ia/*` route map (no bare `/ia/modules`) | Yes (already committed) |
| `docs/v2/10_V2_IMPLEMENTATION_ROADMAP.md` | TASK03 | Task 03 documentation | Records Task 03 completion; states no MD cutover / low-code start | Yes (already committed) |
| `docs/v2/12_MODULE_REGISTRY.md` | TASK03 | Module/surface contract; MD organization | Notes organizational D365-inspired surfaces; no second authorities | Yes (already committed) |
| `docs/v2/16_TASK02_STATUS.md` | TASK03 | Task 03 documentation (boundary vs Task 02) | Points next to Task 04; excludes SC/Finance/D365/low-code | Yes (already committed) |
| `docs/v2/README.md` | TASK03 | Task 03 documentation / MD organization | Indexes Task 03; non-goals for low-code/SC/Finance/D365 | Yes (already committed) |
| `src/platform/moduleIa.ts` | TASK03 | ERP module IA; module navigation; module/surface contract; MD organization/ownership | Core IA helpers: category nav, workspace contracts, breadcrumbs, ownership surfaces, path parse | Yes (already committed) |
| `src/platform/moduleIa.test.ts` | TASK03 | Task 03 documentation/verification | Tests navigator policy, Engineering MD under Engineering, ownership, single authorities | Yes (already committed); **gap:** not wired in committed `package.json` `test` script |
| `src/platform/moduleRegistry.ts` | TASK03 | Module navigation; module/surface contract | `workspaceEntry` → `/v2/modules/...`; adds `legacyWorkspaceEntry` for V1 coexistence | Yes (already committed) |
| `src/platform/modules.ts` | TASK03 | Module/surface contract | Adds `V2_RUNTIME.moduleIa` surface list + MD ownership path | Yes (already committed) |
| `src/platform/services/index.ts` | TASK03 | MD ownership; service boundaries | Barrel export of MD boundary facades | Yes (already committed) |
| `src/platform/services/customerMasterService.ts` | TASK03 | MD ownership; Customer boundary | Facade: ownership + admin API prefixes; `listCustomersViaBoundary` wraps existing admin API | Yes (already committed) |
| `src/platform/services/engineeringMasterService.ts` | TASK03 | MD ownership; Engineering/Cable/Drum under Engineering | Facade constants only; no new Prisma models | Yes (already committed) |
| `src/platform/services/bomMasterService.ts` | TASK03 | MD ownership; BOM boundary | Facade: one Approved BOM authority | Yes (already committed) |
| `src/platform/services/costingMasterService.ts` | TASK03 | MD ownership; Costing boundary | Facade; Option B / Decision 5 freeze noted | Yes (already committed) |
| `src/platform/services/pricingMasterService.ts` | TASK03 | MD ownership; Pricing boundary | Facade; distinct from Costing | Yes (already committed) |
| `src/platform/services/sharedReferenceService.ts` | TASK03 | MD ownership; shared read | Read helpers over existing ownership matrix | Yes (already committed) |
| `src/components/v2/V2Shell.tsx` | TASK03 | Module navigation; security integration | Category navigator, module secondary nav, V2 routes for modules/MD | Yes (already committed) |
| `src/components/v2/V2ModulePages.tsx` | TASK03 | V2 workspace/list/form; MD organization; metadata integration | Module page routers; Customer MD embeds existing admin panel; Engineering children; metadata demo | Yes (already committed) |
| `src/components/v2/ModuleWorkspace.tsx` | TASK03 | V2 workspace patterns; module/surface contract | Workspace header/summary/KPIs/actions/surfaces | Yes (already committed) |
| `src/components/v2/ErpListPanel.tsx` | TASK03 | V2 list patterns; metadata integration | Typed list panel; explicitly not drag-drop builder | Yes (already committed) |
| `src/components/v2/ErpFormPanel.tsx` | TASK03 | V2 form patterns; metadata integration | Typed form + PlatformFieldDefinition overlays; not EAV/builder | Yes (already committed) |
| `src/components/v2/MasterDataOwnershipPanel.tsx` | TASK03 | MD ownership surfaces | `/v2/master-data` ownership table UI | Yes (already committed) |
| `src/server/v2PlatformRoutes.ts` | TASK03 | Security integration; module/surface contract APIs | Adds auth-required `/api/v2/ia/*` routes; D365 remains NOT_IMPLEMENTED | Yes (already committed) |
| `src/platform/v2PlatformFoundation.test.ts` | TASK03 | Freeze / registry verification | Asserts `/v2` workspace entries + V1 `legacyWorkspaceEntry` | Yes (already committed) |
| `src/app/shellRoutes.test.ts` | AMBIGUOUS | Module navigation tests + **stray fulfillment assertions** | Extends V2 path allow tests (TASK03); also asserts `/internal/sales-agreements` & `/internal/fulfillment` aliases **not present on clean HEAD** (fulfillment WIP) | Already committed; **minor contamination** — remediation = follow-up fix commit if desired (do not amend) |

### B. Special-attention paths (requested)

| File | In `e007311`? | Classification of current WT | Notes |
|------|---------------|------------------------------|-------|
| `src/App.tsx` | **No** | EXISTING WIP | Swaps Sales Orders → `CommercialFulfillmentWorkspace` |
| `src/app/shellRoutes.ts` | **No** | EXISTING WIP | Adds `/internal/sales-agreements` + `/internal/fulfillment` aliases |
| `src/components/layout/Sidebar.tsx` | **No** | EXISTING WIP | Badge text “Fulfillment” |
| `prisma/schema.prisma` | **No** | EXISTING WIP | Drum `clearanceMm` / `emptyDrumNetWeightKg` / maxLoad comments |
| `package.json` | **No** | AMBIGUOUS / EXISTING WIP | Adds `moduleIa.test.ts` (**Task 03 gap fill**) **plus** drum optimization + commercial fulfillment tests + `seed:demo-users` |
| `src/server/masterDataRoutes.ts` | **No** | EXISTING WIP | Large drum/master-data route expansion (~+202) |

These were last touched for V2 in Task 02 (`664da4a` / `c141d12`), not Task 03. **Do not treat current WT diffs as Task 03.**

### C. Remaining unstaged / untracked (not Task 03)

All other modified/untracked files (drum optimization, commercial fulfillment workspace, demo users, export CSVs, cursor rules, migrations, logos, etc.) → **EXISTING WIP** or **UNRELATED** to Task 03. Leave untouched.

---

## 3. Why each TASK03 file is required

Grouped by acceptance theme:

| Theme | Files | Why required |
|-------|-------|--------------|
| ERP module IA | `moduleIa.ts`, `modules.ts`, `moduleRegistry.ts`, `ModuleWorkspace.tsx` | Defines workspace/master/transactions/setup/workflows/reports/dashboards contracts and operational vs informational modules |
| Module navigation | `V2Shell.tsx`, `moduleIa.ts`, `moduleRegistry.ts`, `shellRoutes.test.ts` (V2 path portion) | Category navigator, badges, breadcrumbs, `/v2/modules/:id/...` |
| Module/surface contract | `moduleIa.ts`, `v2PlatformRoutes.ts` (`/ia/*`), `V2ModulePages.tsx` | HTTP + UI contracts for workspace and surfaces |
| MD organization | `V2ModulePages.tsx`, `MasterDataOwnershipPanel.tsx`, docs 17/README | Customer/Engineering MD under owning modules; `/v2/master-data` |
| MD ownership | `platform/services/*`, ownership panel, `moduleIa.ownershipSurfaceRows` | Write ownership stays exclusive; surfaces expose owner/permissions/scope |
| V2 list/form patterns | `ErpListPanel.tsx`, `ErpFormPanel.tsx` | ERP-shaped list/form without low-code builder |
| Metadata integration | `ErpFormPanel.tsx`, `V2ModulePages.tsx` metadata fetch | PlatformFieldDefinition overlays; not EAV store |
| Security integration | `v2PlatformRoutes.ts` IA routes + existing auth; shell customer block tests | Auth required on `/api/v2/ia/*`; customers blocked from `/v2` |
| Task 03 documentation | `17_TASK03_MODULE_IA.md`, roadmap/README/registry/Task02 status updates | Durable acceptance and non-goals |

---

## 4. Duplicate business-authority check

Inspected `src/platform/services/*` (all new in `e007311`):

| Domain | Verdict |
|--------|---------|
| Customer | Facade → existing `/api/admin/customers`; `assertCustomerWriteOwner` only allows CUSTOMER |
| Cable / Engineering / Drum | Constants + ownership rows; no new models; drums under Engineering |
| BOM | Facade prefixes to existing master BOM APIs |
| Costing | Facade; freezes Option B / Decision 5 |
| Pricing | Facade; distinct from Costing |
| Commercial Commitment / SO / Agreement / Release | **No** new service modules under `platform/services`; registry/IA only reference existing owned entities/APIs |
| Prisma | **No** `prisma.` usage in `platform/services`; **no** Task 03 schema migration |

**Result:** No duplicate business authority introduced.

---

## 5. Explicit non-goal verification (Task 04 / builders / SC / Finance / D365)

| Non-goal | Evidence in Task 03 set |
|----------|-------------------------|
| Task 04 mass MD migration | Not present; dual SoT cutover listed as non-goal in doc 17 |
| Low-code builder | `ErpListPanel`/`ErpFormPanel` comments forbid drag-drop; docs exclude builders |
| Supply Chain impl | Registry/IA keep SC/Inventory informational / NOT_IMPLEMENTED; no ledger UI |
| Finance ledger | Finance modules remain stub/NOT_IMPLEMENTED; “prefer D365 GL” invariants unchanged |
| D365 / Advaris HTTP | Boundary/integrations status remain NOT_IMPLEMENTED / NOT_CONNECTED; no live HTTP to ERP/MES |

---

## 6. Proposed clean Task 03 staging vs what WAS committed

### What WAS in `e007311` (already committed set)

```
docs/v2/10_V2_IMPLEMENTATION_ROADMAP.md
docs/v2/12_MODULE_REGISTRY.md
docs/v2/16_TASK02_STATUS.md
docs/v2/17_TASK03_MODULE_IA.md
docs/v2/README.md
src/app/shellRoutes.test.ts
src/components/v2/ErpFormPanel.tsx
src/components/v2/ErpListPanel.tsx
src/components/v2/MasterDataOwnershipPanel.tsx
src/components/v2/ModuleWorkspace.tsx
src/components/v2/V2ModulePages.tsx
src/components/v2/V2Shell.tsx
src/platform/moduleIa.test.ts
src/platform/moduleIa.ts
src/platform/moduleRegistry.ts
src/platform/modules.ts
src/platform/services/bomMasterService.ts
src/platform/services/costingMasterService.ts
src/platform/services/customerMasterService.ts
src/platform/services/engineeringMasterService.ts
src/platform/services/index.ts
src/platform/services/pricingMasterService.ts
src/platform/services/sharedReferenceService.ts
src/platform/v2PlatformFoundation.test.ts
src/server/v2PlatformRoutes.ts
```

Plus follow-up `9ca1e2f` → `docs/v2/17_TASK03_MODULE_IA.md` only.

### What SHOULD be in an ideal clean Task 03 commit

Same 25 files as above, **plus ideally**:

1. **`package.json`** — only the addition of `src/platform/moduleIa.test.ts` to the `test` script (missing from `e007311`).
2. **`src/app/shellRoutes.test.ts`** — without the two fulfillment-alias assertions **or** with matching aliases only if intentionally in Task 03 (they are not; they belong to fulfillment WIP).

Ideal staging would **exclude** all current WT fulfillment/drum/demo files listed in §7.

### Nothing staged now

```
git diff --cached → (empty)
```

**Nothing staged; below is `e007311` commit diff instead** (summary):

```
git show --stat e007311
 25 files changed, 2557 insertions(+), 92 deletions(-)
```

Use `git show e007311` / `git diff e007311^..e007311` for the full committed patch. Use `git show 9ca1e2f` for the docs route-map clarification.

---

## 7. Remaining unstaged / untracked (leave alone)

### Modified (32)

`.env.example`, drum/fulfillment docs, `package.json`, `prisma/schema.prisma`, `prisma/seed.ts`, `public/logo.png`, `src/App.tsx`, `src/app/shellRoutes.ts`, `BrandLogo`, cable/drum UI, `CommercialFulfillmentPanel`, `Sidebar`, `demoAuth.test.ts`, commercial/identity/masterData server files, drum/import services, `types.ts`, …

### Untracked (sample)

`.cursor/rules/*`, `data/export/*`, drum migrations/scripts/services, `src/components/fulfillment/*`, commercial fulfillment workflow tests, etc.

**None of these should be part of a Task 03 commit.**

---

## 8. Verification re-run (this audit)

| Check | Result |
|-------|--------|
| `tsc --noEmit` | **PASS** (exit 0) |
| `npx prisma validate` | **PASS** |
| Focused: `moduleIa.test.ts`, `v2PlatformFoundation.test.ts`, `shellRoutes.test.ts`, `d365Adapters.test.ts`, `costingEngine.test.ts`, `phase1.quoteToCash.test.ts` | **55/55 PASS** |
| Full `npm test` | Not re-run end-to-end in this audit (focused + freeze suite used); WT `package.json` differs from HEAD |

### Caveats

1. Focused `shellRoutes.test.ts` **passes on the working tree** because unstaged `shellRoutes.ts` provides fulfillment aliases. On a **clean checkout of HEAD alone**, the two alias assertions from `e007311` would **fail**.
2. Committed `package.json` does **not** include `moduleIa.test.ts`; `npm test` on clean HEAD would skip that file unless invoked explicitly (as done here).

### V1 regression / frozen-domain

- Phase 1 quote-to-cash tests: **PASS** (commitment / SO / agreement / release / Direct MTS / D365 NOT_IMPLEMENTED).
- Costing engine freeze test: **PASS** (included in focused run).
- D365 adapters test: **PASS** (still NOT_IMPLEMENTED).
- No Task 03 Prisma migration; V1 `/customer` `/internal` preserved via `legacyWorkspaceEntry`.

---

## 9. Verdict

### TASK 03 COMMIT SCOPE ACCEPTABLE (READY FOR ACCEPTANCE on scope)

`e007311` (+ docs fix `9ca1e2f`) is **cleanly Task-03-scoped** as a file set: ERP module IA, navigator, workspace/list/form patterns, MD ownership surfaces, service-boundary facades, IA APIs, and docs. No improper inclusion of `App.tsx` / `shellRoutes.ts` / `Sidebar` / `schema.prisma` / `masterDataRoutes.ts` / fulfillment / drum WIP.

### Hygiene remediation (follow-up commit — do **not** amend `e007311` / `9ca1e2f`)

1. **`package.json`:** Wire `src/platform/moduleIa.test.ts` into the `test` script via an isolated staged hunk (HEAD + moduleIa only). Drum / fulfillment / `seed:demo-users` WIP remains unstaged in the working tree (`MM package.json`).
2. **Fulfillment-alias assertions in `shellRoutes.test.ts`:** **Left in place.** They test V1 `/internal/sales-agreements` and `/internal/fulfillment` → `sales_orders` (frozen/legacy fulfillment aliases), not Task 03 IA. Moving into untracked `commercialFulfillmentWorkflow.test.ts` would mix commits; removing would drop coverage until fulfillment WIP lands matching `shellRoutes.ts` aliases. Documented in `docs/v2/17_TASK03_MODULE_IA.md` §6. Do **not** modify fulfillment domain logic for this hygiene.
3. Do **not** fold current WT `package.json` wholesale into Task 03 (it mixes drum + fulfillment).

### Hygiene commit intent

```
test(v2): wire moduleIa suite and clarify shell route assertions
```

Proposed staged contents (hygiene only):

- `package.json` — add `src/platform/moduleIa.test.ts` to `npm test` (no drum/fulfillment/seed)
- `docs/v2/17_TASK03_MODULE_IA.md` — document why fulfillment-alias assertions stay in `shellRoutes.test.ts`
- `docs/v2/TASK03_SCOPE_AUDIT.md` — hygiene outcome (this section)

---

## 10. `git show --stat` evidence (already committed set)

```
e007311 feat(v2): establish ERP module information architecture
 25 files changed, 2557 insertions(+), 92 deletions(-)

9ca1e2f docs(v2): clarify task 03 ia api route map
 1 file changed, 13 insertions(+), 1 deletion(-)
```
