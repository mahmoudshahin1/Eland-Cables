# Task 02 Acceptance Evidence

**Date:** 2026-09-04  
**Workspace:** `d:\Projects\EPC_Platform\energya-connect-platform`  
**Branch:** `cursor/costing-configuration-dashboard` (ahead of origin by 1 commit: Phase 1 freeze commit `c14bea0`)  
**App under test:** `http://localhost:3847`  
**Scope:** Evidence only — no Task 03 work; no new implementation beyond observation.

---

## Final verdict

### TASK 02 NOT READY FOR ACCEPTANCE

**Why (blocking):**

1. **No clean Task 02 commit boundary.** Platform foundation work remains mixed in the working tree with Phase 1 fulfillment UI WIP, drum engineering, demo identity seed, logo/binary, and other parallel changes. Formal acceptance needs an isolatable Task 02 changeset (separate commits), even though item 19 is now **PASS** on freeze semantics.

**Resolved since prior run:**

- **Item 19 → PASS.** Re-audit classified all Phase 1 commercial fulfillment diffs as **B** (pre-existing UI/workflow WIP) or **C** (display-only Prisma `include` expansions). **No class A** Task 02 accidental Phase 1 domain-logic edits. No reverts applied (would wipe legitimate pre-Task 02 WIP). `EpcSalesOrder` / commitment schema unchanged vs `HEAD`.

**Non-blocking (otherwise green):** V2 routes/authz, schema+migration, Effective Access, NumberSequence SC/FM/FX wrapper, master hardening, automated tests (`640/640`), `tsc`, build, Prisma validate/migrate status, and V2 UI screenshots all passed in this run.

---

## 1. `git status`

```
On branch cursor/costing-configuration-dashboard
Your branch is ahead of 'origin/cursor/costing-configuration-dashboard' by 1 commit.

Changes not staged for commit: 38 modified files
Untracked: docs/v2/, prisma/migrations/20260904120000_v2_platform_foundation/,
  src/server/v2PlatformRoutes.ts, numberSequenceService.ts, securityAccessService.ts,
  serverAudit.ts, src/platform/*, src/components/v2/*, fulfillment/*, drum optimization*, etc.

No staged changes.
```

**Fact:** All Task 02 platform work is **uncommitted** (working tree / untracked). Last commit is Phase 1 freeze, not Task 02.

---

## 2. `git diff --stat` (uncommitted vs committed)

`git diff --stat HEAD` (modified tracked files only):

```
38 files changed, 1759 insertions(+), 251 deletions(-)
```

Notable buckets:

| Bucket | Examples | Relation to Task 02 |
|--------|----------|---------------------|
| Platform / V2 | `prisma/schema.prisma`, `server.ts`, `rbac.ts`, `masterDataRoutes.ts`, `shellRoutes*`, `permissionCatalog.ts`, `App.tsx`, `Sidebar.tsx` | Task 02 |
| Phase 1 fulfillment | `commercialCommitmentRepository.ts` (**C** includes), `commercialFulfillmentApiService.ts`, `CommercialFulfillmentPanel.tsx`, `PHASE1_QUOTE_TO_CASH_FREEZE.md`, untracked `fulfillment/*` | **Not Task 02** — class **B**/**C** WIP; item 19 **PASS** (no domain rule changes) |
| Drum / packaging | drum services, capacity calculator (untracked), DrumMaster schema fields | Parallel WIP |
| Demo / deploy | `identityService.ts` (+203 demo seed), `.env.example`, docs/release | Parallel WIP |
| Branding | `public/logo.png`, `BrandLogo.tsx` | Parallel / incidental |

**Staged:** none.  
**Committed Task 02:** none (no Task 02 commit on branch).

---

## 3. Exact list of Task 02–related changed files

### Core Task 02 (platform foundation)

| Path | State |
|------|-------|
| `prisma/schema.prisma` | modified |
| `prisma/migrations/20260904120000_v2_platform_foundation/migration.sql` | untracked |
| `server.ts` | modified (`app.use('/api/v2', v2PlatformRouter)`) |
| `src/server/v2PlatformRoutes.ts` | untracked |
| `src/server/numberSequenceService.ts` | untracked |
| `src/server/securityAccessService.ts` | untracked |
| `src/server/serverAudit.ts` | untracked |
| `src/server/rbac.ts` | modified (`assertCanViewMasterDataCatalog`, `assertCanUseDrumOptimization`) |
| `src/server/masterDataRoutes.ts` | modified (read/drum auth hardening) |
| `src/server/platformConfigurationRepository.ts` | modified (tab/fieldSecurity/lookup fields) |
| `src/platform/moduleRegistry.ts` | untracked |
| `src/platform/modules.ts` | modified |
| `src/platform/dataOwnershipMatrix.ts` | untracked |
| `src/platform/metadata/metadataService.ts` | untracked |
| `src/platform/security/effectiveAccess.ts` | untracked |
| `src/platform/v2PlatformFoundation.test.ts` | untracked |
| `src/components/v2/V2Shell.tsx` | untracked |
| `src/App.tsx` | modified (mount V2Shell) |
| `src/app/shellRoutes.ts` / `.test.ts` | modified |
| `src/components/layout/Sidebar.tsx` | modified |
| `src/domain/permissionCatalog.ts` | modified (PLATFORM:* permissions) |
| `docs/v2/**` (architecture + status) | untracked |

### Present in tree but **not** Task 02 acceptance scope

Phase 1 fulfillment UI/API, drum optimization feature set, demo identity seed helpers, drum engineering schema columns (`clearanceMm`, `emptyDrumNetWeightKg`) outside `20260904120000_v2_platform_foundation`.

---

## 4. Prisma schema changes (Task 02)

Observed in `git diff HEAD -- prisma/schema.prisma`:

### `NumberSequence` (new)

- `code` `@unique`, `prefix`, `format`, `nextSerial`, `active`, `scopeType`/`scopeValue`, `moduleId`, audit fields, indexes.

### Security groups (new)

- `SecurityGroup`, `SecurityGroupMember`, `SecurityGroupRole`
- `UserAccount.securityGroups`, `Role.securityGroups` relations

### `PlatformFieldDefinition` extensions

- `tab String?`
- `fieldSecurity Json?`
- `lookupEntity String?`
- `lookupDisplayField String?`

### Also in same schema diff (not in V2 foundation migration)

- `DrumMaster.clearanceMm`, `emptyDrumNetWeightKg`, comments on `maxWeight` — drum engineering WIP, not Task 02 migration SQL.

---

## 5. Migration name + SQL impact

**Name:** `20260904120000_v2_platform_foundation`

**Creates:**

- `NumberSequence` (+ unique/indexes)
- `SecurityGroup`, `SecurityGroupMember`, `SecurityGroupRole` (+ FKs to `UserAccount` / `Role`)

**Alters:**

- `PlatformFieldDefinition` ADD `tab`, `fieldSecurity`, `lookupEntity`, `lookupDisplayField`

**Migrate status (this environment):**

```
35 migrations found in prisma/migrations
Database schema is up to date!
```

---

## 6. V2 routes — code existence + HTTP responses

Mount: `server.ts` → `app.use('/api/v2', v2PlatformRouter)`.

### Exact `/api/v2` paths in code

| Method | Path |
|--------|------|
| GET | `/api/v2/boundary` |
| GET | `/api/v2/modules` |
| GET | `/api/v2/modules/navigable` |
| GET | `/api/v2/modules/:moduleId` |
| GET | `/api/v2/data-ownership` |
| GET | `/api/v2/metadata/fields` |
| GET | `/api/v2/number-sequences` |
| POST | `/api/v2/number-sequences` |
| POST | `/api/v2/number-sequences/:code/allocate` |
| POST | `/api/v2/security/effective-access/evaluate` |
| GET | `/api/v2/security/effective-access/explain` |
| GET | `/api/v2/security/users/:userId/access-profile` |
| GET | `/api/v2/audit/events` |
| GET | `/api/v2/audit/migration` |
| GET | `/api/v2/integrations/status` |

### SPA

| Path | Unauth HTTP | Notes |
|------|-------------|-------|
| `/v2` | 200 (SPA shell) | Requires internal login for V2Shell content; customers redirected |
| `/v2/security` | 200 (SPA shell) | Same |

### HTTP matrix (localhost:3847)

| Endpoint | Unauthenticated | Sales (internal) | Admin |
|----------|-----------------|------------------|-------|
| GET `/api/v2/boundary` | **200** | 200 | 200 |
| GET `/api/v2/modules` | **401** | **200** | **200** |
| GET `/api/v2/modules/navigable` | **401** | **200** | **200** |
| GET `/api/v2/data-ownership` | **401** | **200** | **200** |
| GET `/api/v2/metadata/fields` | **401** | **200** | **200** |
| GET `/api/v2/number-sequences` | **401** | **403** | **200** |
| POST `/api/v2/number-sequences` | **401** | **403** | **201** |
| POST `/api/v2/number-sequences/SC/allocate` | **401** | **403** | **201** |
| POST `/api/v2/security/effective-access/evaluate` (`ADMIN:SECURITY:VIEW`) | **401** | **403** (deny decision) | **200** (allow) |
| POST evaluate (`COMMERCIAL:INQUIRY:VIEW`) as sales | — | **200** ALLOW | — |
| GET explain | **401** | **403** | **200** |
| GET access-profile | **401** | **403** | **200** |
| GET `/api/v2/audit/events` | **401** | **403** | **200** |
| GET `/api/v2/audit/migration` | **401** | **200** | **200** |
| GET `/api/v2/integrations/status` | **401** | **200** | **200** |

**Boundary body (excerpt):** `d365: NOT_IMPLEMENTED`, `advaris: NOT_CONNECTED`, freezes include Phase 1 fulfillment + Costing Option B / Decision 5.

---

## 7. Server-side auth middleware / services

From `src/server/v2PlatformRoutes.ts`:

- `resolveRequestActor` (`./auth`) — JWT → actor
- `requireAuth` — empty actor → **401** `{ code: 'UNAUTHORIZED' }`
- `requirePermission(actor, module, resource, action)` from `../domain/rbacEngine` — used on number-sequences, explain, access-profile, audit/events
- `handleErr` — maps `DomainError` / `UNAUTHORIZED` to 401 vs 403
- `resolveGroupPermissionCodes` / `loadUserAccessProfile` — `securityAccessService.ts`
- `evaluateEffectiveAccess` / `formatAccessExplanation` — `effectiveAccess.ts`
- `appendServerAudit` — `serverAudit.ts`

Master hardening uses the same actor pattern in `masterDataRoutes.ts`:

- `requireSignedIn`, `requireMasterReadAuth`, `requireDrumComputeAuth`
- `assertCanViewMasterDataCatalog` / `assertCanUseDrumOptimization` in `rbac.ts`

---

## 8. How 401 vs 403 is enforced

| Condition | Status | Mechanism |
|-----------|--------|-----------|
| No JWT / anonymous | **401** | `requireAuth` / `requireSignedIn` when `!actor.id && !actor.email && !actor.name` |
| Authenticated, missing permission | **403** | `requirePermission` → `DomainError` → `handleErr` (UNAUTHORIZED code with non–“sign in” message → 403); or evaluate returns `httpStatus: 403` |
| Effective Access unauthenticated decision | **401** | `evaluateEffectiveAccess` → `DENY_UNAUTHENTICATED` |
| Effective Access permission/scope deny | **403** | `DENY_PERMISSION` / `DENY_SCOPE` etc. |

Snippet pattern (`v2PlatformRoutes.ts`):

```ts
if (!actor.id && !actor.email && !actor.name) {
  res.status(401).json({ error: 'Sign in is required.', code: 'UNAUTHORIZED' });
  return null;
}
// ...
const status = err.code === 'UNAUTHORIZED' && /sign in/i.test(err.message) ? 401 : 403;
```

---

## 9. Effective Access evaluation path

```
HTTP POST /api/v2/security/effective-access/evaluate
  → requireAuth
  → resolveGroupPermissionCodes(actor.id)   // SecurityGroup → Role → Permission
  → evaluateEffectiveAccess({ actor, module, resource, action, record, groupPermissionCodes })
  → formatAccessExplanation(result)
  → HTTP 200 if allowed else result.httpStatus (401/403)

HTTP GET /api/v2/security/effective-access/explain
  → requireAuth + requirePermission(ADMIN, SECURITY, VIEW)
  → loadUserAccessProfile(userId)
  → evaluateEffectiveAccess(subjectActor, ...)
  → appendServerAudit(EXPLAIN)
  → JSON profile + result + explanation

UI: /v2/security → EffectiveAccessExplainPanel (V2Shell.tsx) calls explain API
```

Layers (deny by default): auth ∩ permission ∩ customer scope ∩ ownership ∩ workflow ∩ field  
File: `src/platform/security/effectiveAccess.ts`

**Live proof:** sales `COMMERCIAL:INQUIRY:VIEW` → 200 ALLOW; sales `ADMIN:SECURITY:VIEW` → 403; admin explain/profile → 200.

---

## 10. Customer / data scope enforcement

1. **Effective Access:** `checkCustomerScope` in `effectiveAccess.ts` — customer actors must match `record.customerId` / `customerMasterId` against actor scope keys → `DENY_SCOPE` (unit-tested).
2. **Commercial domain (V1):** existing `customerScope.ts` / `assertCustomerBusinessScope` on commercial routes (prior increments; still present).
3. **V2Shell:** customer users redirected away from `/v2` (`Navigate` to `/customer`).
4. **shellRoutes.test.ts:** customers blocked from V2 shell navigation; internals allowed.

**HTTP customer persona:** `customer@energya.com` login returned **401** in this environment (persona not available / password mismatch). Scope denial therefore evidenced by unit test + sales/admin contrast, not live customer JWT.

---

## 11. PlatformFieldDefinition metadata merge

File: `src/platform/metadata/metadataService.ts`

- `inquiryManifestAsMetadata()` — code manifest SoT fallback  
- `mergeFieldMetadata(manifest, dbRows)` — DB rows win for label/visibility/required/readOnly/order/section/tab/lookup/fieldSecurity; `source: 'PLATFORM_FIELD_DEFINITION'`  
- `assertNotEavTransactionStore()` — documents non-EAV posture  

Route: `GET /api/v2/metadata/fields` loads `listPlatformFieldDefinitions` then merges.

Repository: `platformConfigurationRepository.ts` persists `tab`, `fieldSecurity`, `lookupEntity`, `lookupDisplayField`.

---

## 12. NumberSequence allocation + concurrency

File: `src/server/numberSequenceService.ts` → `allocateNextNumber`

- Non-costing codes: `prisma.$transaction` → read `nextSerial` → format → update `nextSerial + 1`
- Costing prefixes in `COSTING_WRAPPED_PREFIXES` (`SC`/`FM`/`FX`): **delegate only** to `allocateNextCostingDocumentCode` (no `NumberSequence` row increment)
- Upsert refuses creating NumberSequence rows with costing-owned prefixes

---

## 13. Costing SC/FM/FX wrapper — no double increment

**Code:** wrapper calls `allocateNextCostingDocumentCode` exclusively for SC/FM/FX; API response includes `costingWrappedPrefixes` and note.

**Live allocate (admin):**

```json
SC1: {"allocated":{"value":"SC26-00171","code":"COSTING_SC","serial":171,"source":"COSTING"}}
SC2: {"allocated":{"value":"SC26-00172","code":"COSTING_SC","serial":172,"source":"COSTING"}}
```

`GET /api/v2/number-sequences` listed only platform sequence `TASK02EV` (created during evidence) — **no SC cursor row**, confirming costing path did not dual-write NumberSequence.

---

## 14. Server-side AuditEvent calls (Task 02)

`appendServerAudit` → `prisma.auditEvent.create` in `serverAudit.ts`.

Call sites:

| Action | Where |
|--------|-------|
| NumberSequence UPSERT | `numberSequenceService.upsertNumberSequence` |
| NumberSequence ALLOCATE (platform + costing) | `allocateNextNumber` |
| EffectiveAccess EXPLAIN | `v2PlatformRoutes` explain handler |

List API: `GET /api/v2/audit/events` (admin). Migration note: `GET /api/v2/audit/migration`.

---

## 15. Master-data / drum endpoints hardened by Task 02

Mount: `/api/master/*` (`server.ts`).

Hardening helpers: `requireMasterReadAuth`, `requireDrumComputeAuth`, `requireSignedIn` + `assertCanViewMasterDataCatalog` / `assertCanUseDrumOptimization`.

**Unauth HTTP (this run):**

| Path | Status |
|------|--------|
| GET `/api/master/drums` | **401** |
| GET `/api/master/cables` | **401** |
| GET `/api/master/raw-materials` | **401** |
| GET `/api/master/boms` | **401** |
| GET `/api/master/reference` | **401** |

**Auth:** sales GET `/api/master/drums` → **200**.

Also gated (code): `/drums/capacity`, `/drums/candidates`, `/drums/validate`, `/drums/optimize`, engineering mappings, BOM conflicts, readiness, imports, etc. via the same helpers / existing write asserts.

---

## 16. Command results

| Command | Result |
|---------|--------|
| `npm test` | **PASS** — `# tests 640` `# pass 640` `# fail 0` `# skipped 0` `# todo 0` (~104s) |
| `npm run build` | **PASS** (exit 0) — Vite + esbuild `dist/server.cjs` |
| `npx tsc --noEmit` | **PASS** (exit 0) |
| `npx prisma validate` | **PASS** — schema valid |
| `npx prisma migrate status` | **PASS** — DB up to date (35 migrations) |

---

## 17. Explicit authorization tests

### Automated (`src/platform/v2PlatformFoundation.test.ts`)

- Unauthenticated → 401 `DENY_UNAUTHENTICATED`
- Authenticated unauthorized → 403 `DENY_PERMISSION`
- Authorized → ALLOW
- Customer isolation → `DENY_SCOPE`
- Plus module registry / ownership / metadata / sequence format tests

### HTTP (this run)

| Scenario | Evidence |
|----------|----------|
| Unauthenticated | All protected `/api/v2/*` → 401; master GETs → 401 |
| Authenticated unauthorized | Sales on number-sequences / explain / audit → 403 |
| Authorized | Admin number-sequences / explain / profile / allocate → 200/201; sales modules/metadata → 200 |
| Customer isolation | Unit test DENY_SCOPE; live customer login unavailable (401) |
| Admin / effective-access | Admin evaluate ALLOW for ADMIN:SECURITY:VIEW; explain 200 + audit |

### Shell route registry

`shellRoutes.test.ts`: internals allowed on `/v2` / `/v2/security`; customers blocked.

---

## 18. V1 smoke

| Path | Status |
|------|--------|
| GET `/customer` | 200 |
| GET `/internal` | 200 |
| GET `/api/auth/me` | 401 (expected unauth) |
| GET `/api/platform/db` | 200 |
| Boundary declares V1 shells `/customer`, `/internal` preserved | yes |

Prior increment suites in `npm test` (commercial, B1/B2, phase1 quote-to-cash, etc.) all passed as part of the 640.

---

## 19. Phase 1 Commercial Fulfillment freeze

**Result: PASS** (Task 02 did not alter Phase 1 domain rules; remaining diffs are separate WIP / display-only).

**Re-audit date:** 2026-09-04 (item 19 remediation — classify / no wipe / no Task 03).

### Classification legend

| Class | Meaning | Action |
|-------|---------|--------|
| **A** | Introduced/touched by Task 02 and changes Phase 1 domain behavior | Revert |
| **B** | Pre-existing / parallel WIP (fulfillment UI, Direct MTS workspace, etc.) unrelated to Task 02 platform foundation | Leave alone; commit hygiene separately |
| **C** | Display-only / Prisma `include` expansions; no domain rule change | Leave; note in evidence |

### Exact Phase 1–related paths vs `HEAD`

`git diff --stat HEAD` (tracked) + untracked inventory:

| Path | vs HEAD | Class | Notes |
|------|---------|-------|-------|
| `src/server/commercialCommitmentRepository.ts` | modified (+13/−2) | **C** | `getSalesOrderById` / `getSalesAgreementById` only: extra `include` (`quotation`, release `lines`/`salesOrder`, nested `agreement`). **No** changes to `approveCommercialQuotation`, create SO/agreement/release, or Direct MTS. |
| `src/services/commercialFulfillmentApiService.ts` | modified (+237/−…) | **B** | Client DTOs, `FulfillmentApiError`, **GET** list/get helpers for workspace UI. Existing create/approve API wrappers preserved; no new domain mutations. |
| `src/components/inquiry-quotation/CommercialFulfillmentPanel.tsx` | modified (+292/−…) | **B** | Confirm dialogs + navigate to Sales fulfillment workspace; still calls same approve/create APIs. Release UI moved out of panel into workspace. |
| `docs/PHASE1_QUOTE_TO_CASH_FREEZE.md` | modified (+9/−…) | **B** | Doc note that UI/operational workflow is in progress; domain freeze language retained. |
| `src/components/fulfillment/CommercialFulfillmentWorkspace.tsx` | untracked | **B** | Fulfillment workspace UI (orders / agreements / Direct MTS). |
| `src/components/fulfillment/FulfillmentUi.tsx` | untracked | **B** | Shared fulfillment UI primitives. |
| `src/services/commercialFulfillmentWorkflow.ts` | untracked | **B** | Client-side exception classification / titles (not server domain rules). |
| `src/services/commercialFulfillmentWorkflow.test.ts` | untracked | **B** | Tests for workflow helpers. |
| `src/services/commercialFulfillmentApiService.test.ts` | untracked | **B** | Client API tests. |

### Related shell wiring (mixed files — not pure Phase 1)

| Path | Class | Notes |
|------|-------|-------|
| `src/App.tsx` | Task 02 **+** **B** | Task 02: `V2Shell` mount. WIP: `CommercialFulfillmentWorkspace` replaces `SalesOrders` on `sales_orders` tab. **Do not** `checkout` — would drop V2. |
| `src/app/shellRoutes.ts` / `.test.ts` | Task 02 **+** **B** | Task 02: `/v2` paths. WIP: `/internal/fulfillment`, `/internal/sales-agreements` → `sales_orders`. |
| `src/components/layout/Sidebar.tsx` | Task 02 **+** **B** | Task 02: V2 Platform link. WIP: Sales Orders badge text `Fulfillment`. |
| `prisma/schema.prisma` | Task 02 + drum WIP | **No** `EpcSalesOrder` / commitment / agreement / release model hunks. Task 02: `NumberSequence`, `SecurityGroup*`, `PlatformFieldDefinition` fields. Drum: `clearanceMm`, `emptyDrumNetWeightKg`. |

### Class A findings / reverts

- **Class A count: 0.**
- **Reverts applied: none** (`git checkout --` not used). Wiping **B**/**C** would destroy legitimate pre-Task 02 fulfillment UI WIP and would not be required for freeze semantics.
- Server domain entrypoints under commercial commitment (approve, commitment, SO from quotation, agreement, release, Direct MTS) are **unchanged** in the repository diff beyond read `include` expansions (**C**).

### Post-check

```
git diff --stat HEAD -- \
  docs/PHASE1_QUOTE_TO_CASH_FREEZE.md \
  src/components/inquiry-quotation/CommercialFulfillmentPanel.tsx \
  src/server/commercialCommitmentRepository.ts \
  src/services/commercialFulfillmentApiService.ts
```

```
docs/PHASE1_QUOTE_TO_CASH_FREEZE.md                |   9 +-
.../CommercialFulfillmentPanel.tsx                 | 292 +++++++++++++--------
src/server/commercialCommitmentRepository.ts       |  13 +-
src/services/commercialFulfillmentApiService.ts    | 237 +++++++++++++++--
4 files changed, 420 insertions(+), 131 deletions(-)
```

(Untracked fulfillment workspace/workflow files remain; expected for class **B**.)

`npm test` not re-run: no domain files reverted.

**Freeze sign-off for Task 02:** Phase 1 commercial fulfillment **domain rules** are not modified by Task 02. Uncommitted Phase 1 UI/API-client WIP remains and must be committed (or stashed) **separately** from Task 02 for commit hygiene — that is a readiness/process blocker, not an item 19 domain-freeze failure.

---

## 20. Costing Option B / Decision 5

**Result: CONFIRMED not changed** for metal/costing engine paths.

- `git diff HEAD` on `costingEngine*`, `CostingMetal*`, `DECISION5*` → **empty**
- Module registry invariant still asserts Option B / Decision 5 language (foundation test)
- Boundary freezes list Costing Option B / Decision 5
- SC/FM/FX wrapper delegates to existing `CostingDocumentSequence` without altering metal semantics

---

## 21. No D365 / Advaris HTTP implementation

**Confirmed.**

- `GET /api/v2/integrations/status` / boundary: `NOT_IMPLEMENTED` / `NOT_CONNECTED`
- `src/platform/integration/d365Adapters.ts` remains contract-only (`notImplemented()`), no live HTTP/OData
- No Task 02 addition of D365/Advaris clients

---

## 22. Screenshots / UI evidence

**Browser MCP:** unavailable in this session (tabs created then immediately “view not found” / “no browser tab”).

**Fallback:** Playwright launched with system **Edge** channel; logged in as `sales@energya.com`.

Artifacts under `docs/v2/evidence/`:

| File | Content |
|------|---------|
| `01-v2-shell.png` + `01-v2-shell-dom.txt` | V2 Platform workspace — module navigator (LIVE/PARTIAL/FROZEN only), sidebar Modules / Effective Access, Energya branding, “V1 Internal” link |
| `02-v2-security.png` + `02-v2-security-dom.txt` | Effective Access explain UI — “Why does this user have access?”, auth∩roles∩scope∩ownership∩workflow∩field, form fields + Explain access |
| `00-home.png` | Login/home prior to V2 |

DOM excerpt (`/v2`): Platform Services, Administration, Security (`/v2/security`), Master Data, Costing, frozen Sales/Commercial → `/internal/fulfillment`, etc.

---

## 23. Failed / skipped tests

**None.**

```
# tests 640
# pass 640
# fail 0
# cancelled 0
# skipped 0
# todo 0
```

---

## Acceptance checklist summary

| # | Item | Status |
|---|------|--------|
| 1 | git status | Done |
| 2 | git diff --stat | Done — all Task 02 uncommitted |
| 3 | Task 02 file list | Done |
| 4 | Prisma schema | Done |
| 5 | Migration | Done + applied |
| 6 | V2 routes HTTP | Done |
| 7 | Auth middleware | Done |
| 8 | 401 vs 403 | Done |
| 9 | Effective Access path | Done |
| 10 | Customer scope | Done (unit + partial HTTP) |
| 11 | Metadata merge | Done |
| 12 | NumberSequence txn | Done |
| 13 | SC/FM/FX wrapper | Done (live source:COSTING) |
| 14 | AuditEvent | Done |
| 15 | Master/drum hardening | Done |
| 16 | test/build/tsc/prisma | All pass |
| 17 | Authz tests | Done |
| 18 | V1 smoke | Done |
| 19 | Phase 1 untouched | **PASS** (domain freeze; B/C WIP documented, not Task 02) |
| 20 | Costing Option B untouched | Pass |
| 21 | No D365/Advaris HTTP | Pass |
| 22 | Screenshots | Pass (Playwright/Edge; MCP blocked) |
| 23 | Failed/skipped tests | None |

---

## Recommended path to READY

1. **Commit hygiene (blocking):** Split working tree into separate commits — (a) Task 02 platform foundation only, (b) Phase 1 fulfillment UI WIP (class B/C paths), (c) drum/demo/branding/other WIP. Do **not** fold fulfillment UI into the Task 02 commit.
2. Re-run a short smoke/`npm test` on the Task 02-only tree if desired after isolation.
3. Optionally re-seed/enable a customer demo persona for live HTTP customer-isolation evidence.

Item 19 domain freeze is satisfied. Remaining blocker: **mixed WIP / no isolatable Task 02 commit** → **TASK 02 NOT READY FOR ACCEPTANCE**.
