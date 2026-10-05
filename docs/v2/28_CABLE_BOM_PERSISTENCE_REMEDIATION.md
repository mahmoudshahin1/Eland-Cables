# 28 — Cable BOM Persistence Remediation (Task 04B-9)

**Date:** 2026-09-04  
**Status:** **PERSISTENCE REMEDIATED** — `CableBomLine` remains `POSTGRESQL_PRIMARY` (**NOT PROMOTED**)  
**Frozen baselines:** 04A `57caf85` · 04B-8 readiness `565d064` · Cable Master SoT `ac9c373`  
**Tests:** `src/platform/cableBomPersistenceRemediation.test.ts` · `src/platform/cableBomSotReadiness.test.ts`  
**Prerequisite:** Cable Master `POSTGRESQL_SOT` (04B-7)

---

## 1. Objective

Remediate Cable BOM **persistence blockers** identified in 04B-8 (Gate C Excel Method-B LS-only write, LS catalog validation, missing server audit) **without** promoting `CableBomLine` to `POSTGRESQL_SOT`.

---

## 2. Decision

```
CABLE BOM = POSTGRESQL_PRIMARY — NOT PROMOTED
```

| Field | Value |
|-------|-------|
| `status` | `POSTGRESQL_PRIMARY` |
| `postgresSoT` | `false` |
| `cutoverPhase` | `LS_NON_AUTHORITATIVE` (not `CUTOVER_READY`) |
| `canPromoteToPostgresqlSot` | `false` |

Gate C (WRITE) and Gate I (AUDIT) **remediated**. Promotion remains blocked by governance debt (81 conflicts) and explicit policy — cutoverPhase not advanced.

---

## 3. Blockers remediated (04B-8 → 04B-9)

| # | 04B-8 blocker | 04B-9 remediation |
|---|---------------|-------------------|
| 1 | `ExcelBomUploadModal` → `saveCableBoms()` LS-only | `persistCableBomsViaApi` → `POST /api/master/boms/excel-commit` |
| 2 | Excel validation used `getStoredCableCatalog()` | `loadAuthoritativeCableCatalog` (PG-first); LS explicit non-authoritative fallback |
| 3 | Excel Method-B no server `AuditEvent` | `persistCableBomExcelCommit` → whole-txn `AuditEvent` (`entity: CableBom`, `action: BOM_CHANGE`) |
| 4 | 81 `BomDuplicateObservation` | **Preserved** — documented governance debt; no auto-resolve workflow invented |
| 5 | `cutoverPhase` not `CUTOVER_READY` | **Kept** — no promotion |

---

## 4. Complete caller inventory (post-remediation)

| Location | Symbol / route | Classification |
|----------|----------------|----------------|
| `masterDataRoutes` | `GET /api/master/boms` | **AUTHORITATIVE_PG** |
| `masterDataRoutes` | `POST /api/master/boms/excel-commit` | **AUTHORITATIVE_PG** (04B-9) |
| `masterDataRepository` | `persistCableBomExcelCommit` | **AUTHORITATIVE_PG** — txn + audit |
| `masterDataRepository` | `persistImportTransaction` (`kind: boms`) | **AUTHORITATIVE_PG** |
| `masterDataApiService` | `fetchMasterBoms` / `loadAuthoritativeCableBoms` | **AUTHORITATIVE_PG** |
| `masterDataApiService` | `persistCableBomsViaApi` | **AUTHORITATIVE_PG** client helper |
| `masterDataApiService` | `mirrorMasterDataToLocalStorage` (boms) | **NON_AUTHORITATIVE_MIRROR** |
| `cableBomService` | `getStoredCableBoms` | **DEGRADED_READ** |
| `cableBomService` | `saveCableBoms({ mirrorAfterPgSuccess: true })` | **NON_AUTHORITATIVE_MIRROR** |
| `cableBomService` | `saveCableBoms()` without option | **BLOCKED** — throws |
| `ExcelBomUploadModal` | `handleApplyUpload` | **AUTHORITATIVE_PG** (04B-9) |
| `ExcelBomUploadModal` | cable validation | **AUTHORITATIVE_PG** when signed in |
| `TechnicalOffice` | BOM modal `onSuccess` | **AUTHORITATIVE_PG** — PG reload |
| `importPipelineService` | Import Center commit | **AUTHORITATIVE_PG** |
| `governanceRepository` | BOM conflict APPROVE | **AUTHORITATIVE_PG** |
| `costingEngine` | *(unchanged)* | **AUTHORITATIVE_PG** via orchestration |

---

## 5. Authoritative write path (Excel Method-B)

```
Excel parse → PG catalog/RM validation → duplicate forensics
  → POST /api/master/boms/excel-commit
  → prisma.$transaction (replace-by-cable + upsert + optional duplicate observations)
  → writeAudit (whole batch)
  → loadAuthoritativeCableBoms → saveCableBoms({ mirrorAfterPgSuccess: true })
```

**Whole-transaction audit** (not per-line): one `AuditEvent` per excel commit with `entityId = EXCEL-BOM-{timestamp}`.

---

## 6. Excel validation (PG Cable Master)

| Mode | Catalog source | Authority |
|------|----------------|-----------|
| Signed in, PG ok | `loadAuthoritativeCableCatalog` | **AUTHORITATIVE_PG** |
| Offline / PG fail | `getStoredCableCatalog()` | **DEGRADED_READ** (`authoritative: false`) |

Raw Material refs validated against `loadAuthoritativeRawMaterials` when PG available.

---

## 7. Transactional persistence

- Single Prisma interactive transaction (`timeout: 900_000` for large batches).
- **FK validation** before txn: `CableMaster.materialNumber`, `RawMaterial.code`.
- **Replace-by-cable**: deletes existing `CableBomLine` (bomVersion=1) for uploaded cables, then upserts upload lines — matches prior Excel modal semantics.
- Conflicting weight groups within upload → skipped lines + `BomDuplicateObservation` upsert (no auto-resolve).
- **No partial commit** on validation failure (400 before txn).

---

## 8. Audit evidence

| Path | Audit |
|------|-------|
| Import Center BOM commit | `persistImportTransaction` → `BOM_CHANGE` |
| Excel Method-B (04B-9) | `persistCableBomExcelCommit` → `BOM_CHANGE` |
| Governance APPROVE | `GovernedBomLine` upsert + audit |
| Client `importPipelineService.appendAudit` | **LEGACY_TELEMETRY** (not authoritative) |

---

## 9. LocalStorage policy

| Key / symbol | Class | Authority |
|--------------|-------|-----------|
| `energya_cable_boms_v3` | `A_GOVERNED` mirror | **NON_AUTHORITATIVE_MIRROR** |
| `saveCableBoms({ mirrorAfterPgSuccess: true })` | mirror helper | After PG success only |
| `saveCableBoms()` without flag | — | **Throws** |
| `BOM_LOCAL_IS_AUTHORITATIVE` | policy flag | `false` |

---

## 10. Governance / costing safety

- **No changes** to `costingEngine`, Decision 5, or metal price logic.
- `GovernedBomLine` APPROVED remains costing authority when present.
- `DRAFT` / `UNAPPROVED` governed lines are **not** promoted to SoT.
- Source `CableBomLine` import does not overwrite conflicting weights.

---

## 11. 81 `BomDuplicateObservation` — governance debt

- All **81** conflict groups (`BOM-CONF-*`) **preserved** in PostgreSQL.
- 04B-9 does **not** delete, merge, or auto-approve conflicts.
- Costing remains blocked per cable until Technical Office governance APPROVE.
- Matrix `blockingReason` documents this as promotion blocker.

---

## 12. Security

- `POST /api/master/boms/excel-commit` — JWT + `assertCanWriteBomAndRawMaterials` (`requireBomRmAuth`).
- `GET /api/master/boms` — `requireMasterReadAuth`.
- Customer users denied per existing RBAC.
- Excel modal requires `jwtToken`; unsigned-in users cannot PG-commit.

---

## 13. Gates A–J (post-remediation)

| Gate | Result | Notes |
|------|--------|-------|
| **A DATA** | **PASS** | Unchanged from 04B-8 |
| **B READ** | **PASS** | Excel modal PG catalog when signed in |
| **C WRITE** | **PASS** | Excel Method-B → PG API (04B-9) |
| **D V1/V2** | **PASS** | Hub/TO/Import converged |
| **E LS** | **PASS** | `saveCableBoms` mirror-only guard |
| **F STALE** | **PASS** | PG wins over LS |
| **G FAILURE** | **PASS** | PG failure → no LS authority |
| **H SECURITY** | **PASS** | RBAC on new route |
| **I AUDIT** | **PASS** | Excel commit → `AuditEvent` |
| **J REGRESSION** | **PASS** (BOM scope) | See §15 |

**Promotion:** `canPromoteToPostgresqlSot(CableBomLine)` → **false** (`cutoverPhase !== CUTOVER_READY`).

---

## 14. Test evidence

| File | Scenarios |
|------|-----------|
| `cableBomPersistenceRemediation.test.ts` | 15 — not promoted, Gate C/I, LS guard, PG stale, matrix governance debt, FK validation, audit txn, 81 conflicts preserved |
| `cableBomSotReadiness.test.ts` | Updated gate evidence (04B-9) |
| `increment8.bom.test.ts` | Governance unchanged |
| `increment13.bomScrap.test.ts` | Costing BOM unchanged |

---

## 15. Regression results

| Check | Result |
|-------|--------|
| `cableBomPersistenceRemediation.test.ts` | **PASS** (15/15) |
| `cableBomSotReadiness.test.ts` | **PASS** (6/6) |
| `tsc --noEmit` | **PASS** |
| `prisma validate` | **PASS** |
| `vite build` | **PASS** |
| Full suite | See commit — drum/inquiry WIP failures excluded from BOM scope |

---

## 16. Files changed (04B-9)

| File | Action |
|------|--------|
| `src/server/masterDataRepository.ts` | `persistCableBomExcelCommit` |
| `src/server/masterDataRoutes.ts` | `POST /api/master/boms/excel-commit` |
| `src/services/masterDataApiService.ts` | `persistCableBomsViaApi` |
| `src/services/cableBomService.ts` | `saveCableBoms({ mirrorAfterPgSuccess })` guard |
| `src/services/importPipelineService.ts` | Mirror-only `saveBoms` |
| `src/components/common/ExcelBomUploadModal.tsx` | PG validation + API commit |
| `src/components/internal/TechnicalOffice.tsx` | `jwtToken` + PG reload |
| `src/platform/masterDataSoT.ts` | Gate C/I; matrix blocking reason |
| `src/platform/cableBomPersistenceRemediation.test.ts` | **Created** |
| `src/platform/cableBomSotReadiness.test.ts` | Updated |
| `package.json` | Test wiring |
| `docs/v2/28_CABLE_BOM_PERSISTENCE_REMEDIATION.md` | **Created** |
| `docs/v2/README.md` | Index update |

**Explicit non-actions:** No `costingEngine` changes; no Cable Master / RM / Drum / fulfillment changes; no conflict resolution workflow; no SoT promotion.

---

## 17. Commit hash

*(filled after commit)*

---

## 18. Promotion decision (final)

```
CABLE BOM = POSTGRESQL_PRIMARY — NOT PROMOTED (STOP)
```

Persistence blockers remediated. Entity remains `POSTGRESQL_PRIMARY` until governance debt cleared and `cutoverPhase` advanced to `CUTOVER_READY` in a future gated cutover task.

---

## 19. Related docs

- [27 Cable BOM SoT readiness](./27_CABLE_BOM_SOT_READINESS.md) (04B-8 assessment)
- [26 Cable Master cutover](./26_CABLE_MASTER_SOT_CUTOVER.md) (prerequisite)
- [BOM_GOVERNANCE_WORKBENCH.md](../BOM_GOVERNANCE_WORKBENCH.md)
- [BOM_CONFLICT_RESOLUTION.md](../BOM_CONFLICT_RESOLUTION.md)
- [20 cutover framework](./20_MASTER_DATA_SOT_CUTOVER_FRAMEWORK.md)
