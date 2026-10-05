# 26 — Cable Master SoT Cutover (Task 04B-7)

**Date:** 2026-09-04  
**Status:** **CUTOVER ACCEPTED** — `CableMaster` = `POSTGRESQL_SOT`  
**Frozen baselines:** 04A `57caf85` · 04B-1 `fb03a3c` · 04B-2 `611c083` · 04B-3 `34b7645` · 04B-4 `397a2d90` · 04B-5 `c2bd03e` · 04B-6 `fd2f7f2` · 04B-6A `3ab77ef` · 04B-7 blocked doc `ef8f8a3` · test wiring `ea7085f`  
**Machine-readable:** `src/platform/masterDataSoT.ts` (`CableMaster` row + matrix)  
**Related:** [20 framework](./20_MASTER_DATA_SOT_CUTOVER_FRAMEWORK.md) · [25 prior reassessment](./25_CABLE_MASTER_SOT_READINESS.md) · [18 inventory](./18_MASTER_DATA_PERSISTENCE_INVENTORY.md)

---

## 1. Objective

Promote **Cable Master only** from `POSTGRESQL_PRIMARY` → `POSTGRESQL_SOT` after gates A–J, without deleting `energya_master_cable_catalog_v3` (retained as **NON_AUTHORITATIVE_MIRROR**).

**Scope boundary:** CableMaster catalog authority only. **Does not** promote BOM, Drum, Cable Parameters, or fulfillment WIP.

---

## 2. Decision

**CABLE MASTER = POSTGRESQL_SOT — CUTOVER ACCEPTED**

Formal reassessment after 04B-6 write remediation (`fd2f7f2`) and 04B-6A V1/V2 read convergence (`3ab77ef`) confirms all gates A–J pass. `canPromoteToPostgresqlSot(CableMaster)` → **true**.

---

## 3. Discovery summary (code-proven)

| Path | Authority |
|------|-----------|
| `GET/POST/PUT /api/master/cables*` | PostgreSQL via `masterDataRepository` + RBAC + audit |
| `loadAuthoritativeCableCatalog` / `fetchMasterCables` | PG-first; mirrors after success |
| `SmartConfigurator` / `CableConfiguratorModal` | PG catalog injected into `evaluateDynamicFilterOptions` / `validateCableConfiguration` |
| `CableConfiguratorV2` | `loadAuthoritativeCableCatalog` → `filterCableRecordsV2` |
| `CableSearchSelectModal` | PG paginated search; LS catch `authoritative: false` |
| `MasterDataHub` / `TechnicalOffice` | PG via `fetchMasterCables` / `loadAuthoritativeCableCatalog` |
| Excel Method-B / TCR publish / TO pre-import | PG via `persistCableCatalogRowsViaApi` / `createCableViaApi` (04B-6) |
| `saveCableCatalog` | Mirror only — requires `mirrorAfterPgSuccess: true` |
| `energya_master_cable_catalog_v3` | NON_AUTHORITATIVE_MIRROR |

---

## 4. PostgreSQL data evidence (Gate A)

| Metric | Value (local demo DB, 2026-09-04) |
|--------|-----------------------------------|
| Model | `CableMaster` (`materialNumber` unique) |
| Total rows | **436** |
| ACTIVE | **436** |
| Duplicate `materialNumber` groups | **0** |
| Engineering-complete / incomplete | **15** / **421** (expected) |
| Server `AuditEvent` entity=CableMaster | **1718** |

`cablePersistenceRemediation.test.ts` `createCable` PG write + audit evidence re-verified at cutover.

---

## 5. Gates A–J

| Gate | Result | Evidence |
|------|--------|----------|
| **A DATA** | **PASS** | 436 governed rows; unique `materialNumber`; audit trail present |
| **B READ** | **PASS** | Hub/V2/TO/search/V1 configurators use PG when online; V1 injects PG catalog (04B-6A) |
| **C WRITE** | **PASS** | All authoritative mutations route PG APIs; `saveCableCatalog` mirror-only (04B-6) |
| **D V1/V2** | **PASS** | `cableV1V2ReadConvergence.test.ts` — equivalent candidate sets from same PG catalog |
| **E LS** | **PASS** | `CABLE_CATALOG_LOCAL_IS_AUTHORITATIVE=false`; key = NON_AUTHORITATIVE_MIRROR |
| **F STALE** | **PASS** | `preferPostgresMasterData` / `resolveMasterListPreferringPostgres`; empty PG beats LS |
| **G FAILURE** | **PASS** | PG failure → `authoritative: false`; failed PG mutation does not LS-authority |
| **H SECURITY** | **PASS** | JWT + RBAC on `/api/master/cables*`; customer isolation unchanged |
| **I AUDIT** | **PASS** | `createCable` / `updateCable` / import commit → server `AuditEvent` |
| **J REGRESSION** | **PASS** (cable scope) | Cable tests green; full suite **662/665** pass (**3** drum import WIP — excluded); `tsc` OK; `prisma validate` OK; `vite build` OK |

`allCutoverGatesPassed(CableMaster.gates)` → **true**  
`canPromoteToPostgresqlSot(CableMaster)` → **true**  
`cutoverPhase` → **`POSTGRESQL_SOT`**

---

## 6. Explicit non-actions

- No BOM / Drum / Params / Costing / fulfillment / branding changes  
- No localStorage key deletion  
- No amend/push of frozen 04A–04B-6A commits  

---

## 7. Related docs

- [25 blocked reassessment](./25_CABLE_MASTER_SOT_READINESS.md) (historical — superseded by this doc)  
- [24 04B-5 audit](./24_CABLE_MASTER_SOT_READINESS.md)  
- [20 framework](./20_MASTER_DATA_SOT_CUTOVER_FRAMEWORK.md)
