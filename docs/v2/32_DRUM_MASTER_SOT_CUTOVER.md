# 32 — Drum Master SoT Cutover (Task 04B-12)

**Date:** 2026-09-04  
**Status:** **CUTOVER ACCEPTED** — `DrumMaster` = `POSTGRESQL_SOT`  
**Frozen baselines:** 04A `57caf85` · 04B-11 remediation `98ab736` · Cable Master SoT `ac9c373`  
**Prerequisite assessment:** [31 reassessment](./31_DRUM_MASTER_SOT_REASSESSMENT.md)  
**Machine-readable:** `src/platform/masterDataSoT.ts`

---

## 1. Objective

Promote **Drum Master only** from `POSTGRESQL_PRIMARY` → `POSTGRESQL_SOT` after gates A–J, without deleting `energya_drum_master_v1` (retained as **NON_AUTHORITATIVE_MIRROR**).

**Scope boundary:** DrumMaster catalog authority only. **Does not** promote DrumCompatibility, BOM, Cable Parameters, or fulfillment WIP.

---

## 2. Decision

**DRUM MASTER = POSTGRESQL_SOT — CUTOVER ACCEPTED**

Formal reassessment after 04B-11 persistence remediation confirms all gates A–J pass. `DrumCompatibility` is a separate downstream BLOCKED entity — not a Drum Master prerequisite. `canPromoteToPostgresqlSot(DrumMaster)` → **true**.

---

## 3. Registry changes

| Field | Before (04B-11) | After (04B-12) |
|-------|-----------------|----------------|
| `status` | `POSTGRESQL_PRIMARY` | `POSTGRESQL_SOT` |
| `postgresSoT` | `false` | `true` |
| `cutoverPhase` | `LS_NON_AUTHORITATIVE` | `POSTGRESQL_SOT` |
| Matrix `cutoverReady` | `false` | `true` |
| Matrix `blockingReason` | DrumCompatibility coupling | `null` |

`DrumCompatibility` unchanged: `BLOCKED`, 0 rows, do not fabricate.

---

## 4. Framework correction (minimum diff)

| Location | Change |
|----------|--------|
| `MASTER_DATA_SOT_STATUS` DrumMaster row | Promoted to `POSTGRESQL_SOT` |
| `MASTER_DATA_CUTOVER_MATRIX` Drum Master row | `cutoverReady: true`; removed DrumCompatibility blocking |
| `MASTER_DATA_CUTOVER_STOP_CONDITIONS` DrumMaster | Updated to COMPLETE text (like CableMaster post-04B-7) |
| `MASTER_DATA_CUTOVER_ORDER` DrumMaster | `ALREADY_SOT` band |
| `MASTER_DATA_CUTOVER_FRAMEWORK.entityCutoversCompleted` | Added `DrumMaster` |

**Not changed:** DrumCompatibility registry, gates, or global BLOCKED stop condition.

---

## 5. Authoritative paths (unchanged from 04B-11)

```
Import Center → POST /api/master/imports/commit → persistImportTransaction (drums)
  → PG DrumMaster upsert + ImportBatch + AuditEvent
  → loadAuthoritativeDrums → saveDrumMaster({ mirrorAfterPgSuccess: true })

Manual create → POST /api/master/drums → createDrum → AuditEvent → LS mirror

Dimension/status update → PUT /api/master/drums/:code → updateDrum → AuditEvent → LS mirror
```

---

## 6. Explicit non-actions

- No DrumCompatibility row fabrication  
- No Cable Master / Cable BOM / Costing V2 / Decision 5 / fulfillment changes  
- No localStorage key deletion  
- No amend/push of frozen 04B-11 commit `98ab736`

---

## 7. Test evidence

| File | Purpose |
|------|---------|
| `drumMasterSotCutover.test.ts` | **Created** — 04B-12 cutover acceptance |
| `drumMasterSotReadiness.test.ts` | Updated — promoted state |
| `drumMasterPersistenceRemediation.test.ts` | Updated — scenarios A/C/L/O |
| `masterDataSoT.test.ts` | Matrix alignment + entityCutoversCompleted |
| `rawMaterialSotCutover.test.ts` | Sibling entity guard updated |
| `auditAuthority.test.ts` | Sibling entity guard updated |
| `cableSotReadiness.test.ts` | Sibling entity guard updated |

---

## 8. Regression results

See commit SHA for live run. Required checks:

| Check | Expected |
|-------|----------|
| Drum-focused tests | **PASS** |
| `drumMasterSotCutover.test.ts` | **PASS** |
| Full `npm test` | **PASS** |
| `tsc --noEmit` | **PASS** |
| `prisma validate` | **PASS** |
| `vite build` + server bundle | **PASS** |

---

## 9. Verify promoted

```text
sotStatusForEntity('DrumMaster').status === 'POSTGRESQL_SOT'
sotStatusForEntity('DrumMaster').postgresSoT === true
canPromoteToPostgresqlSot(sotStatusForEntity('DrumMaster')) === true
cutoverMatrixForEntity('Drum Master').cutoverReady === true
sotStatusForEntity('DrumCompatibility').status === 'BLOCKED'
```

---

## Final report

**DRUM MASTER = POSTGRESQL_SOT — CUTOVER ACCEPTED**

Task 04B-12 formal reassessment confirms PostgreSQL holds **108** governed drum rows with clean geometry and normalized engineering. All gates A–J pass after 04B-11 remediation. `DrumCompatibility` (0 rows) is a **separate downstream BLOCKED entity** — decoupled from Drum Master promotion policy. Hub, inquiry, optimization, and import paths share PostgreSQL as sole Drum Master authority. `energya_drum_master_v1` retained as non-authoritative mirror. **STOP.**
