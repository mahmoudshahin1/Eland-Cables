# 30 — Drum Master Persistence Remediation (Task 04B-11)

**Date:** 2026-09-04  
**Status:** **PERSISTENCE REMEDIATED** — `DrumMaster` remains `POSTGRESQL_PRIMARY` (**NOT PROMOTED**)  
**Frozen baselines:** 04A `57caf85` · 04B-10 readiness `27b91d2` · Cable Master SoT `ac9c373`  
**Tests:** `src/platform/drumMasterPersistenceRemediation.test.ts` · `src/platform/drumMasterSotReadiness.test.ts`  
**Prerequisite assessment:** doc 29 (04B-10)

> **Note:** Doc number **30** used intentionally — doc **28** is Cable BOM persistence remediation.

---

## 1. Objective

Remediate Drum Master **persistence blockers** identified in 04B-10 (Gate C: `commitDrums()` engineering gap, incomplete CRUD, LS-only deactivate, `DrumDetailsModal` LS read) **without** promoting `DrumMaster` to `POSTGRESQL_SOT`.

---

## 2. Decision

```
DRUM MASTER = POSTGRESQL_PRIMARY — NOT PROMOTED
```

| Field | Value |
|-------|-------|
| `status` | `POSTGRESQL_PRIMARY` |
| `postgresSoT` | `false` |
| `cutoverPhase` | `LS_NON_AUTHORITATIVE` (not `CUTOVER_READY`) |
| `canPromoteToPostgresqlSot` | `false` |

Gate C (WRITE), Gate B (READ), Gate D (V1/V2), and Gate I (AUDIT) **remediated**. Promotion remains blocked by `DrumCompatibility` (`BLOCKED`, 0 rows) and explicit policy.

---

## 3. Blockers remediated (04B-10 → 04B-11)

| # | 04B-10 blocker | 04B-11 remediation |
|---|----------------|-------------------|
| 1 | `commitDrums()` skips Clearance / MaxLoad / Empty weight | Maps all engineering columns; TO defaults `clearanceMm=50`, `maxWeight=capacity` |
| 2 | No create / dimension update API | `POST /api/master/drums`, `PUT /api/master/drums/:code` (dimensions + status), `GET /api/master/drums/:code` |
| 3 | `deactivateDrum()` LS-only orphan | Throws; Hub uses `deactivateDrumViaApi` (PG + audit + mirror) |
| 4 | `DrumDetailsModal` reads `getStoredDrumMaster()` | Uses `useDrumMasterList` (PG-first) |
| 5 | `saveDrumMaster()` LS-only writes | Requires `{ mirrorAfterPgSuccess: true }` |
| 6 | `DrumCompatibility` 0 rows | **Preserved BLOCKED** — documented downstream blocker, not fabricated |

---

## 4. Engineering semantics (frozen — applied on import/create/update)

| Field | PG column | Rule |
|-------|-----------|------|
| Clearance | `clearanceMm` | Default **50 mm** when blank/absent |
| MaxLoad | `maxWeight` | **= Capacity** when blank/absent |
| Empty weight | `emptyDrumNetWeightKg` | Optional; **never** a suitability blocker |
| Capacity | `capacity` | Source workbook reference (unchanged) |

Implemented in `resolveDrumEngineeringFields()` — shared by import pipeline and PG write repository.

---

## 5. Authoritative write paths

```
Import Center → POST /api/master/imports/commit → persistImportTransaction (drums)
  → PG DrumMaster upsert + ImportBatch + AuditEvent
  → loadAuthoritativeDrums → saveDrumMaster({ mirrorAfterPgSuccess: true })

Manual create → POST /api/master/drums → createDrum → AuditEvent → LS mirror

Dimension/status update → PUT /api/master/drums/:code → updateDrum → AuditEvent → LS mirror
```

**PG transaction FIRST; LS mirror only after success** (`mirrorAfterPgSuccess` pattern).

---

## 6. Drum Selection / Optimization boundary (verified, unchanged)

- Optimization APIs read `listDrums()` at request time — **read-only**.
- `drumOptimizationService` contains **no** Prisma writes or `saveDrumMaster` calls.
- Engineering rules (Clearance 50, MaxLoad=Capacity, empty weight non-blocking) unchanged.
- Costing V2 / Decision 5 **not touched**.

---

## 7. DrumCompatibility

| Aspect | Value |
|--------|-------|
| PG rows | **0** |
| Registry | `BLOCKED` |
| Fabricated in 04B-11? | **No** |
| Blocks Drum Master persistence? | **No** — downstream ranking tables; native capacity engine used |
| Blocks Drum Master SoT promotion? | **Yes** — formal stop condition until resolved or scoped out |

---

## 8. LocalStorage policy

| Key / symbol | Class | Authority |
|--------------|-------|-----------|
| `energya_drum_master_v1` | `A_GOVERNED` | **NON_AUTHORITATIVE_MIRROR** |
| `saveDrumMaster({ mirrorAfterPgSuccess: true })` | mirror helper | After PG success only |
| `saveDrumMaster()` without flag | — | **Throws** |
| `DRUM_MASTER_LOCAL_IS_AUTHORITATIVE` | policy flag | `false` |
| `deactivateDrum()` | — | **Throws** (use API) |

---

## 9. Security

| Route / action | Control |
|----------------|---------|
| `GET /api/master/drums` | `requireMasterReadAuth` |
| `GET /api/master/drums/:code` | `requireMasterReadAuth` (cutover routes) |
| `POST /api/master/drums` | JWT + `assertCanWriteCableMaster` |
| `PUT /api/master/drums/:code` | JWT + `assertCanWriteCableMaster` |
| Import commit (drums) | `requireImportAuth`; customers denied |
| Drum compute APIs | `requireDrumComputeAuth` (unchanged) |

---

## 10. Test evidence (scenarios A–O)

| ID | Scenario | File |
|----|----------|------|
| A | Not promoted (`POSTGRESQL_PRIMARY`) | `drumMasterPersistenceRemediation.test.ts` |
| B | Gate C remediated | same |
| C | Matrix not ready — DrumCompatibility | same |
| D | Import maps engineering columns | same |
| E | LS guard `mirrorAfterPgSuccess` | same |
| F | Stale LS / PG failure | same |
| G | DrumCompatibility BLOCKED | same |
| H | Optimization does not mutate master | same |
| I | `createDrum` → `AuditEvent` | same (PG) |
| J | TO defaults (Clearance 50, MaxLoad=Capacity) | same |
| K | `deactivateDrum` LS blocked | same |
| L | All gates pass; promotion still false | same |
| M | `commitDrums` blank engineering columns | same |
| N | Framework next entity unchanged | same |
| O | DrumCompatibility downstream blocker documented | same |

---

## 11. Gates A–J (post-remediation)

| Gate | Result | Notes |
|------|--------|-------|
| **A DATA** | **PASS** | Unchanged from 04B-10 |
| **B READ** | **PASS** | DrumDetailsModal PG-first (04B-11) |
| **C WRITE** | **PASS** | Import + CRUD + LS guard (04B-11) |
| **D V1/V2** | **PASS** | Inquiry modal converged |
| **E LS** | **PASS** | `saveDrumMaster` mirror-only guard |
| **F STALE** | **PASS** | PG wins over LS |
| **G FAILURE** | **PASS** | PG failure → non-authoritative |
| **H SECURITY** | **PASS** | RBAC on drum routes |
| **I AUDIT** | **PASS** | create/update/status → `AuditEvent` |
| **J REGRESSION** | **PASS** (drum scope) | See §13 |

**Promotion:** `canPromoteToPostgresqlSot(DrumMaster)` → **false** (`cutoverPhase !== CUTOVER_READY`; `DrumCompatibility` BLOCKED).

---

## 12. Files changed (04B-11)

| File | Action |
|------|--------|
| `src/services/drumMasterService.ts` | Engineering defaults, LS guard, block LS deactivate |
| `src/services/importPipelineService.ts` | `commitDrums()` engineering mapping |
| `src/services/excelFieldUtils.ts` | `parseOptionalNumber` |
| `src/server/drumMasterWriteRepository.ts` | `getDrum`, `createDrum`, `updateDrum` |
| `src/server/masterDataCutoverRoutes.ts` | Drum CRUD routes |
| `src/services/masterDataApiService.ts` | Drum API clients + mirror guard |
| `src/components/common/DrumDetailsModal.tsx` | PG-first drum list |
| `src/platform/masterDataSoT.ts` | Gate evidence (no promotion) |
| `src/platform/drumMasterPersistenceRemediation.test.ts` | **Created** — scenarios A–O |
| `src/platform/drumMasterSotReadiness.test.ts` | Updated gate evidence |
| `src/services/drumMasterService.test.ts` | Engineering defaults unit test |
| `docs/v2/30_DRUM_MASTER_PERSISTENCE_REMEDIATION.md` | **Created** — this document |
| `docs/v2/README.md` | Index entry |
| `package.json` | Wire remediation test |

---

## 13. Regression results

| Check | Result |
|-------|--------|
| `drumMasterPersistenceRemediation.test.ts` | See commit |
| `drumMasterSotReadiness.test.ts` | See commit |
| `importPipelineService.test.ts` (drum cases) | See commit |
| `tsc --noEmit` | See commit |
| `prisma validate` | See commit |
| `vite build` | See commit |

---

## 14. Verify NOT promoted

```text
sotStatusForEntity('DrumMaster').status === 'POSTGRESQL_PRIMARY'
sotStatusForEntity('DrumMaster').postgresSoT === false
canPromoteToPostgresqlSot(sotStatusForEntity('DrumMaster')) === false
cutoverMatrixForEntity('DrumMaster').cutoverReady === false
```

---

## Final report

**DRUM MASTER = POSTGRESQL_PRIMARY — CUTOVER BLOCKED**

Task 04B-11 remediates import engineering mapping, full PG CRUD, LS mirror policy, and inquiry modal read convergence. `DrumCompatibility` remains **BLOCKED** with zero rows (not fabricated). `canPromoteToPostgresqlSot(DrumMaster)` → **false**. **STOP — do not promote.**
