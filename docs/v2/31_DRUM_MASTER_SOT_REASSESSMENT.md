# 31 — Drum Master SoT Reassessment (Task 04B-12)

**Date:** 2026-09-04  
**Status:** **CUTOVER ACCEPTED** — `DrumMaster` promoted to `POSTGRESQL_SOT`  
**Frozen baselines:** 04A `57caf85` · 04B-10 readiness `27b91d2` · 04B-11 remediation `98ab736` · Cable Master SoT `ac9c373`  
**Machine-readable:** `src/platform/masterDataSoT.ts` (`DrumMaster` row + matrix)  
**Tests:** `src/platform/drumMasterSotCutover.test.ts` · `src/platform/drumMasterSotReadiness.test.ts` · `src/platform/drumMasterPersistenceRemediation.test.ts`  
**Related:** [29 blocked readiness](./29_DRUM_MASTER_SOT_READINESS.md) · [30 persistence remediation](./30_DRUM_MASTER_PERSISTENCE_REMEDIATION.md) · [32 cutover](./32_DRUM_MASTER_SOT_CUTOVER.md)

---

## 1. Objective

Formal reassessment of Drum Master authority after 04B-11 persistence remediation (`98ab736`). Promote `DrumMaster` to `POSTGRESQL_SOT` **only if objectively ready**. Do not assume promotion. Explicitly resolve whether `DrumCompatibility` (0 rows, `BLOCKED`) is a Drum Master prerequisite or a separate downstream domain.

---

## 2. Decision

**DRUM MASTER = POSTGRESQL_SOT — CUTOVER ACCEPTED**

| Field | Value |
|-------|-------|
| `status` | `POSTGRESQL_SOT` |
| `postgresSoT` | `true` |
| `cutoverPhase` | `POSTGRESQL_SOT` |
| `canPromoteToPostgresqlSot` | **true** |
| `DrumCompatibility` | **REMAIN BLOCKED** (separate entity; not fabricated) |

---

## 3. Current Drum Master authority (post-cutover)

| Entity | Registry status | `postgresSoT` | `cutoverPhase` | Decision |
|--------|-----------------|---------------|----------------|----------|
| **DrumMaster** | `POSTGRESQL_SOT` | `true` | `POSTGRESQL_SOT` | **PROMOTED** |
| **DrumCompatibility** | `BLOCKED` | `false` | `BLOCKED` | **REMAIN BLOCKED** |

**Prior state (04B-11):** `POSTGRESQL_PRIMARY`, `cutoverPhase: LS_NON_AUTHORITATIVE`, `canPromoteToPostgresqlSot` → false due to `cutoverPhase !== CUTOVER_READY` and incorrect matrix coupling to `DrumCompatibility`.

---

## 4. PostgreSQL data evidence (Gate A)

Queried live PostgreSQL 2026-09-04 (`scripts/_tmp_drum_sot_reassess_query.ts` — ephemeral probe):

| Metric | Value |
|--------|-------|
| `DrumMaster` rows | **108** |
| ACTIVE | **107** |
| INACTIVE | **1** |
| Duplicate `drumCode` groups | **0** |
| `clearanceMm` populated (ACTIVE) | **107** (all = 50) |
| `maxWeight` populated (ACTIVE) | **107** (all = capacity) |
| `maxWeight ≠ capacity` overrides | **0** |
| `emptyDrumNetWeightKg` populated | **0** |
| `DrumCompatibility` rows | **0** |
| `ImportBatch` (`dataType=drums`) | **4** |
| `AuditEvent` (`entity=DrumMaster`) | **5** |

Engineering normalization on ACTIVE rows verified via `scripts/_tmp_drum_engineering_diag.ts`.

---

## 5. DrumCompatibility review conclusion

**Answer: DrumCompatibility is NOT a Drum Master authority prerequisite. It is a separate downstream domain.**

| Evidence | Finding |
|----------|---------|
| `drumSelectionService.ts` | Explicit `COMPATIBILITY_WARNING` — ranking uses native capacity engine only; no DrumCompatibility query |
| `drumOptimizationService.ts` | Pure compute over caller-supplied drum list; no Prisma writes; no compatibility table reads |
| `importPipelineService` / CRUD | No DrumCompatibility import kind; no FK from DrumMaster to DrumCompatibility |
| PG data | 0 compatibility rows — valid empty state per domain docs |
| 04B-11 doc §7 | Already documented: "Blocks Drum Master persistence? **No**" |

**Minimum framework correction (04B-12):** Removed DrumCompatibility from DrumMaster matrix `blockingReason` and stop condition. DrumCompatibility registry row unchanged (`BLOCKED`). Global governance for DrumCompatibility fabrication preserved.

---

## 6. Promotion policy review

`canPromoteToPostgresqlSot(row)` policy (unchanged):

```text
status === POSTGRESQL_PRIMARY (or already SoT)
cutoverPhase === CUTOVER_READY (or terminal POSTGRESQL_SOT)
allCutoverGatesPassed(gates) === true
```

**Why false in 04B-11 despite gates A–J true:**

1. `cutoverPhase` was `LS_NON_AUTHORITATIVE` (not `CUTOVER_READY` / `POSTGRESQL_SOT`)
2. Matrix `cutoverReady: false` with `blockingReason` citing DrumCompatibility — **incorrect coupling** (corrected in 04B-12)

**Post-correction:** All gates pass + cutoverPhase `POSTGRESQL_SOT` → `canPromoteToPostgresqlSot(DrumMaster)` → **true**.

---

## 7. Write authority trace (Gate C)

| Operation | Path | Authority |
|-----------|------|-----------|
| Import drums (Import Center) | `POST /imports/commit` → `persistImportTransaction` | **AUTHORITATIVE_PG** + audit |
| Import engineering columns | `commitDrums()` → `resolveDrumEngineeringFields` | **AUTHORITATIVE_PG** (04B-11) |
| Create drum | `POST /api/master/drums` → `createDrum` | **AUTHORITATIVE_PG** + audit |
| Update dimensions/status | `PUT /api/master/drums/:code` → `updateDrum` | **AUTHORITATIVE_PG** + audit |
| Deactivate (Hub) | `PUT /api/master/drums/:code` | **AUTHORITATIVE_PG** + audit |
| LS mirror | `saveDrumMaster({ mirrorAfterPgSuccess: true })` | **NON_AUTHORITATIVE_MIRROR** |
| Orphan LS writes | `saveDrumMaster()` / `deactivateDrum()` | **Blocked (throws)** |

**Gate C: PASS**

---

## 8. Read authority trace (Gate B)

| Surface | Read path | Classification |
|---------|-----------|----------------|
| Master Data Hub | `fetchMasterDrums` → PG | **AUTHORITATIVE_PG** |
| `useDrumMasterList` / inquiry / costing UI | `GET /api/master/drums` | **AUTHORITATIVE_PG** |
| `DrumDetailsModal` | `useDrumMasterList(isOpen)` (04B-11) | **AUTHORITATIVE_PG** |
| Drum optimization APIs | Server `listDrums()` at request time | **AUTHORITATIVE_PG** (compute) |
| `getStoredDrumMaster()` | LS mirror | **DEGRADED_READ** (offline fallback only) |

**Gate B: PASS**

---

## 9. V1/V2 convergence (Gate D)

| Surface | Converged? |
|---------|------------|
| Hub / Import Center | **Yes** — PG-first |
| Inquiry `DrumDetailsModal` | **Yes** — `useDrumMasterList` (04B-11) |
| Costing admin / drum select modals | **Yes** — PG fetch hooks |
| Optimization modals | **Yes** — PG via API |

**Gate D: PASS**

---

## 10. Drum Selection/Optimization safety

- Optimization reads `listDrums()` at request time — read-only; no master mutation.
- `drumOptimizationService` contains no Prisma writes or `saveDrumMaster` calls (static source scan in tests).
- `DrumCompatibility` not consulted — native capacity engine only.
- Costing V2 / Decision 5 **not touched**.

---

## 11. LocalStorage policy (Gate E)

| Key / symbol | Authority |
|--------------|-----------|
| `energya_drum_master_v1` | **NON_AUTHORITATIVE_MIRROR** |
| `DRUM_MASTER_LOCAL_IS_AUTHORITATIVE` | `false` |
| `saveDrumMaster({ mirrorAfterPgSuccess: true })` | After PG success only |
| `saveDrumMaster()` without flag | **Throws** |

**Gate E: PASS** — LS retained, not deleted.

---

## 12. Security evidence (Gate H)

| Route | Control |
|-------|---------|
| `GET /api/master/drums` | `requireMasterReadAuth` |
| `GET/POST/PUT /api/master/drums/:code` | JWT + RBAC |
| Import commit (drums) | `requireImportAuth` |
| Drum compute APIs | `requireDrumComputeAuth` |

**Gate H: PASS**

---

## 13. Audit evidence (Gate I)

| Event | Path |
|-------|------|
| Import commit | `persistImportTransaction` → `AuditEvent` |
| Create / update / status | `createDrum` / `updateDrum` / `updateDrumStatus` → `AuditEvent` |

PG: **5** `AuditEvent` rows for `DrumMaster`. `drumMasterPersistenceRemediation.test.ts` PG create + audit evidence re-verified.

**Gate I: PASS**

---

## 14. Stale data / failure policy (Gates F/G)

- Successful PG read wins (including empty array) — `preferPostgresMasterData`, `useDrumMasterList`.
- PG failure → `authoritative: false` — no silent LS SoT.
- Tests: `drumMasterSotCutover.test.ts`, `drumMasterPersistenceRemediation.test.ts` scenarios F/G.

**Gates F/G: PASS**

---

## 15. Governance / data quality

| Check | Result |
|-------|--------|
| Duplicate drum codes | **0** |
| Engineering on ACTIVE rows | **107/107** clearance 50 + MaxLoad=Capacity |
| DrumCompatibility | **BLOCKED**, 0 rows — do not invent |
| Official workbook vs PG count | Workbook 103 unique; PG 108 (includes test/import additions — documented, not reconciled) |

---

## 16. Gates A–J (fresh independent verification)

| Gate | Result | Evidence |
|------|--------|----------|
| **A DATA** | **PASS** | §4 — 108 rows; 0 dupes; engineering normalized |
| **B READ** | **PASS** | §8 — Hub/select/modal/optimization PG |
| **C WRITE** | **PASS** | §7 — import + CRUD + LS guard (04B-11) |
| **D V1/V2** | **PASS** | §9 — inquiry modal converged |
| **E LS** | **PASS** | §11 — mirror-only guard |
| **F STALE** | **PASS** | §14 — PG wins over LS |
| **G FAILURE** | **PASS** | §14 — PG failure non-authoritative |
| **H SECURITY** | **PASS** | §12 — RBAC on drum routes |
| **I AUDIT** | **PASS** | §13 — create/update/import audited |
| **J REGRESSION** | **PASS** | §32 cutover doc — full suite green |

`allCutoverGatesPassed(DrumMaster.gates)` → **true**  
`canPromoteToPostgresqlSot(DrumMaster)` → **true** (post 04B-12 framework correction)

---

## Cutover decision

**OUTCOME A:** All gates pass; DrumCompatibility decoupled as separate BLOCKED entity → **`POSTGRESQL_SOT` promoted**. See [32_DRUM_MASTER_SOT_CUTOVER.md](./32_DRUM_MASTER_SOT_CUTOVER.md).
