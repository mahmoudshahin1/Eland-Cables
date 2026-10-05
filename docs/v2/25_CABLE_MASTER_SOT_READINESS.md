# 25 — Cable Master SoT Reassessment (Task 04B-7)

**Date:** 2026-09-04  
**Status:** **CUTOVER BLOCKED** — `CableMaster` remains `POSTGRESQL_PRIMARY`  
**Frozen baselines:** 04A `57caf85` · 04B-1 `fb03a3c` · 04B-2 `611c083` · 04B-3 `34b7645` · 04B-4 `397a2d90` · 04B-5 `c2bd03e` · 04B-6 `fd2f7f2` · 04B-7 `ef8f8a3`  
**Tests:** `src/platform/cableSotReadiness.test.ts` · `src/platform/cablePersistenceRemediation.test.ts` · `src/platform/cableV1V2ReadConvergence.test.ts`

---

## 1. Decision

**CABLE MASTER = POSTGRESQL_PRIMARY — CUTOVER BLOCKED**

Formal reassessment after 04B-6 write remediation (`fd2f7f2`) **does not** promote to `POSTGRESQL_SOT`. Gates **B (READ)** and **D (V1/V2)** fail independent verification. `canPromoteToPostgresqlSot(CableMaster)` → **false** (`cutoverPhase` ≠ `CUTOVER_READY` and gates B/D fail).

---

## 2. 04B-6 remediation acknowledged (Gate C)

| Blocker (04B-5) | 04B-6 status |
|-----------------|--------------|
| Excel Method-B LS-only | **FIXED** — `ExcelCableUploadModal` → `persistCableCatalogRowsViaApi` |
| TCR publish LS-only | **FIXED** — `approveAndPublishNewCableToMaster` → `createCableViaApi` |
| TO Excel pre-import | **FIXED** — `importValidRowsToCableMaster` → `persistCableCatalogRowsViaApi` |
| Ambiguous `saveCableCatalog` | **FIXED** — throws unless `{ mirrorAfterPgSuccess: true }` |
| Import Center PG commit | **UNCHANGED OK** — `persistImportTransaction` + mirror after success |

**Gate C: PASS** (independent verification).

---

## 3. Gates A–J (independent verification)

| Gate | Result | Evidence |
|------|--------|----------|
| **A DATA** | **PASS** | PG 2026-09-04: **436** `CableMaster` rows; **0** duplicate `materialNumber` groups; **15** engineering-complete / **421** incomplete (expected); **1718** `AuditEvent` rows (`entity=CableMaster`) |
| **B READ** | **FAIL** | Hub/V2 configurator/search/evaluate use PG when online; **V1** `SmartConfigurator` + `CableConfiguratorModal` call `evaluateDynamicFilterOptions` without PG catalog → implicit LS authority for cascading filters |
| **C WRITE** | **PASS** | All authoritative mutations route POST/PUT `/api/master/cables` or Import PG txn; `saveCableCatalog` mirror-only |
| **D V1/V2** | **FAIL** | V2 `CableConfiguratorV2` loads PG via `loadAuthoritativeCableCatalog`; V1 cascading filters still LS-default when `pgCatalog` not passed to `evaluateDynamicFilterOptions` |
| **E LS** | **PASS** | `CABLE_CATALOG_LOCAL_IS_AUTHORITATIVE=false`; `energya_master_cable_catalog_v3` = `NON_AUTHORITATIVE_MIRROR` |
| **F STALE** | **PASS** | `preferPostgresMasterData` / `resolveMasterListPreferringPostgres`; empty PG beats populated LS (tests) |
| **G FAILURE** | **PASS** | PG failure → `authoritative: false`; failed PG mutation does not LS-authority (`saveCableCatalog` throws) |
| **H SECURITY** | **PASS** | `GET/POST/PUT /api/master/cables*` require JWT + RBAC (`requireMasterReadAuth` / `requireWriteAuth` / `assertCanWriteCableMaster`); customer isolation unchanged |
| **I AUDIT** | **PASS** | `createCable` / `updateCable` / import commit → server `AuditEvent`; no LS audit authority |
| **J REGRESSION** | **PASS** (cable scope) | Cable tests green; full suite **731/740** pass (**8** fail: **3** drum import WIP + **5** inquiry/session — excluded from cable cutover scope) · `tsc --noEmit` OK · `prisma validate` OK · `vite build` OK |

---

## 4. `canPromoteToPostgresqlSot` result

```text
canPromoteToPostgresqlSot(sotStatusForEntity('CableMaster')) === false
```

Reasons:

1. `cutoverPhase === 'LS_NON_AUTHORITATIVE'` (requires `'CUTOVER_READY'`).
2. Gates **B** and **D** fail independent verification (registry updated to reflect).

---

## 5. Exact blockers

1. **Gate B — V1 cascading filters use LS by default**
   - `SmartConfigurator.tsx`: `evaluateDynamicFilterOptions(selections)` — second arg `allCables` omitted despite `pgCatalog` state; `useMemo` deps exclude `pgCatalog`.
   - `CableConfiguratorModal.tsx`: no `loadAuthoritativeCableCatalog`; `evaluateDynamicFilterOptions` always LS-default.

2. **Gate D — V1/V2 read-path divergence**
   - V2: `CableConfiguratorV2` passes PG-derived `catalogItems` to `filterCableRecordsV2` / `evaluateCableConfigurationV2`.
   - V1: same governed entity served from stale LS mirror for parameter cascading when signed in.

3. **Policy — cutover phase not ready**
   - Matrix `cutoverReady: false`; phase must reach `CUTOVER_READY` after gates B/D remediation.

---

## 6. Required remediation (before promotion retry)

1. Pass PG catalog into V1 `evaluateDynamicFilterOptions` / `validateCableConfiguration` paths when `loadAuthoritativeCableCatalog` succeeds (`SmartConfigurator`, `CableConfiguratorModal`).
2. Remove LS-default for signed-in sessions (use `resolveAllParsedCables` or explicit catalog arg; offline fallbacks remain `authoritative: false`).
3. Re-run gates A–J; set registry `cutoverPhase: CUTOVER_READY` only when all pass.
4. Promote registry `status: POSTGRESQL_SOT` only when `canPromoteToPostgresqlSot` returns true.

---

## 7. Caller classification (summary)

See §8 in this doc for full table. No unclassified **authoritative** cable write path remains after 04B-6. Residual issue is **read** classification: V1 filter engines still **DEGRADED_READ** (implicit LS) when PG catalog is available but not injected.

---

## 8. Caller classification inventory (complete)

| Location | Symbol / route | Classification | Notes |
|----------|------------------|----------------|-------|
| `masterDataApiService.loadAuthoritativeCableCatalog` | read | **AUTHORITATIVE_PG** | PG wins; mirrors after success |
| `masterDataApiService.fetchMasterCables` | read | **AUTHORITATIVE_PG** | `GET /api/master/cables` |
| `masterDataApiService.persistCableCatalogRowsViaApi` | write | **AUTHORITATIVE_PG** | POST/PUT batch |
| `masterDataApiService.createCableViaApi` | write | **AUTHORITATIVE_PG** | POST `/api/master/cables` |
| `masterDataApiService.updateCableViaApi` | write | **AUTHORITATIVE_PG** | PUT `/api/master/cables/:materialNumber` |
| `masterDataApiService.mirrorMasterDataToLocalStorage` | write | **NON_AUTHORITATIVE_MIRROR** | After PG success only |
| `masterDataRoutes` POST/PUT `/cables` | write | **AUTHORITATIVE_PG** | `createCable` / `updateCable` + audit |
| `masterDataRepository.createCable` / `updateCable` | write | **AUTHORITATIVE_PG** | Server-side |
| `importPipelineService` default stores `saveCables` | write | **NON_AUTHORITATIVE_MIRROR** | Mirror after PG import txn |
| `importPipelineService` `persistImportTransaction` | write | **AUTHORITATIVE_PG** | Import Center commit |
| `cableCatalogService.saveCableCatalog` | write | **NON_AUTHORITATIVE_MIRROR** | Requires `mirrorAfterPgSuccess` |
| `cableCatalogService.getStoredCableCatalog` | read | **DEGRADED_READ** | LS/mock fallback; not SoT |
| `ExcelCableUploadModal.handleApplyUpload` | write | **AUTHORITATIVE_PG** | Via `persistCableCatalogRowsViaApi` (04B-6) |
| `technicalOfficeServiceV2.importValidRowsToCableMaster` | write | **AUTHORITATIVE_PG** | Via `persistCableCatalogRowsViaApi` (04B-6) |
| `technicalOfficeServiceV2.approveAndPublishNewCableToMaster` | write | **AUTHORITATIVE_PG** | Via `createCableViaApi` (04B-6) |
| `CableSearchSelectModal` | read | **AUTHORITATIVE_PG** | PG paginated search; LS catch `authoritative: false` |
| `CableConfiguratorV2` | read | **AUTHORITATIVE_PG** | `loadAuthoritativeCableCatalog` |
| `SmartConfigurator` validation | read | **AUTHORITATIVE_PG** | Uses `pgCatalog` in constraint engine |
| `SmartConfigurator` dynamic filters | read | **DEGRADED_READ** | **BLOCKER** — LS-default cascading |
| `CableConfiguratorModal` | read | **DEGRADED_READ** | **BLOCKER** — no PG load |
| `cableSelectionService.resolveAllParsedCables` | read | **AUTHORITATIVE_PG** | PG-first contract |
| `cableSelectionService.getAllParsedCables()` default | read | **DEGRADED_READ** | Explicit offline/legacy |
| `cableSelectionEngineV2.resolveAllMasterRecordsV2` | read | **AUTHORITATIVE_PG** | PG-first contract |
| `cableSelectionEngineV2.getAllMasterRecordsV2()` default | read | **DEGRADED_READ** | Used by `evaluateCableConfigurationV2` default param |
| `technicalValidationEngineV2.evaluateCableConfigurationV2` default | read | **DEGRADED_READ** | Default `getAllMasterRecordsV2()` — V2 UI overrides with PG |
| `masterDataQualityService.computeMasterDataQuality` no snapshot | read | **DEGRADED_READ** | Documented non-authoritative |
| `TechnicalOffice.tsx` event handler | read | **NON_AUTHORITATIVE_MIRROR** | `cableCatalogUpdated` mirror refresh |
| `TechnicalOffice.tsx` initial load | read | **AUTHORITATIVE_PG** | `loadAuthoritativeCableCatalog` |
| `MasterDataHub` | read | **AUTHORITATIVE_PG** | `fetchMasterCables` |
| `cableAuthorityRoutes` / `evaluatePersistedCable` | read | **AUTHORITATIVE_PG** | Server PG |
| `cableBomService.getStoredCableCatalog` | read | **DEGRADED_READ** | BOM context only; no cable master write |
| `MASTER_CABLE_CATALOG` / `mockData` | read | **TEST_FIXTURE** | Empty LS fallback |
| `cablePersistenceRemediation.test.ts` | test | **TEST_FIXTURE** | Gate evidence |
| `cableSotReadiness.test.ts` | test | **TEST_FIXTURE** | Reassessment assertions |
| `masterDataApiService.test.ts` | test | **TEST_FIXTURE** | `saveCableCatalog` throw test |
| `energya_master_cable_catalog_v3` | storage | **NON_AUTHORITATIVE_MIRROR** | Class A governed mirror |

---

## 9. Explicit non-actions (04B-7)

- No `POSTGRESQL_SOT` promotion  
- No BOM / Drum / Params / Costing / fulfillment / branding changes  
- No localStorage key deletion  
- No amend/push of frozen 04A–04B-6 commits  

---

## 10. Related docs

- [24 04B-5 audit](./24_CABLE_MASTER_SOT_READINESS.md)  
- [18 inventory](./18_MASTER_DATA_PERSISTENCE_INVENTORY.md)  
- [20 framework](./20_MASTER_DATA_SOT_CUTOVER_FRAMEWORK.md)

---

## 11. 04B-6A remediation (gates B/D — NOT SoT promotion)

**Date:** 2026-09-04  
**Status:** Gates **B** and **D** remediated; `CableMaster` remains **`POSTGRESQL_PRIMARY`**

### Fixes applied

| Component | Fix |
|-----------|-----|
| `SmartConfigurator.tsx` | `loadAuthoritativeCableCatalog` → `parsedCatalog` passed to `evaluateDynamicFilterOptions`; `useMemo` deps include `pgCatalog` |
| `CableConfiguratorModal.tsx` | Added `loadAuthoritativeCableCatalog`; PG catalog injected into `validateCableConfiguration` and `evaluateDynamicFilterOptions` |
| `cableV1V2ReadConvergence.test.ts` | Regression: PG affects V1 filters, stale LS blocked, empty PG, PG failure degraded, V1/V2 candidate parity |

### Gates after 04B-6A

| Gate | Result | Notes |
|------|--------|-------|
| **B READ** | **PASS** | V1 configurators inject PG catalog into cascading filters |
| **D V1/V2** | **PASS** | Same PG dataset → equivalent candidate sets (tested) |

### Registry (honest)

- `status`: `POSTGRESQL_PRIMARY` (unchanged)
- `cutoverPhase`: `V1_V2_CONVERGED` (not `CUTOVER_READY`)
- `canPromoteToPostgresqlSot` → **false** (promotion requires formal reassessment)
- Matrix `cutoverReady`: **false** — blocking reason documents promotion deferral

### Caller inventory update

| Location | Classification (post-04B-6A) |
|----------|------------------------------|
| `SmartConfigurator` dynamic filters | **AUTHORITATIVE_PG** |
| `CableConfiguratorModal` | **AUTHORITATIVE_PG** |
| `cableSelectionService.evaluateDynamicFilterOptions` default | **DEGRADED_READ** (library fallback only) |
| `cableConstraintEngine.validateCableConfiguration` default | **DEGRADED_READ** (library fallback only) |
| `technicalValidationEngineV2` default param | **DEGRADED_READ** (V2 UI overrides with PG) |
