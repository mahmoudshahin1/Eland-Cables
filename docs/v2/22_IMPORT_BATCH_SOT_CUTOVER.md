# 22 — Import Batch SoT Cutover (Task 04B-3)

**Date:** 2026-09-04  
**Status:** **CUTOVER ACCEPTED** — `ImportBatch` = `POSTGRESQL_SOT`  
**Frozen 04A:** `57caf852067fea4b29efdfd4d73733499a0ba4f0`  
**Frozen 04B-1:** `fb03a3c8ccc2d339f021aac1950ec06959305d2e`  
**Frozen 04B-2:** `611c083754a616d4991f86dd27036583ae129e43`  
**Machine-readable:** `src/platform/masterDataSoT.ts` (`ImportBatch` row + matrix)  
**Related:** [20 framework](./20_MASTER_DATA_SOT_CUTOVER_FRAMEWORK.md) · [18 inventory](./18_MASTER_DATA_PERSISTENCE_INVENTORY.md)

---

## 1. Objective

Promote **Import Batch only** from `POSTGRESQL_PRIMARY` → `POSTGRESQL_SOT` after gates A–J, without deleting `energya_import_batches_v1` (retained as **NON_AUTHORITATIVE_MIRROR**).

**Scope boundary:** ImportBatch / Import Center batch history and audit trail only. **Does not** promote imported entities (Cable/BOM/Drum/RawMaterial rows) to SoT — those remain per their own registry rows.

Task 04B-4 **complete** — see [doc 23](./23_AUDIT_AUTHORITY_AND_LEGACY_TELEMETRY.md).

---

## 2. Discovery summary (code-proven)

| Path | Authority |
|------|-----------|
| `GET /api/master/imports` | PostgreSQL `listImportHistory()` |
| `POST /api/master/imports/preview` | Validate → `persistImportBatchOnly` (PREVIEWED/REJECTED) |
| `POST /api/master/imports/commit` | Validate → `persistImportTransaction` (PG txn: master rows + `ImportBatch` + `AuditEvent`) |
| `MasterDataImport` UI | PG commit required; LS mirror only after success via `mirrorBatchToLocalStorage` |
| `MasterDataHub` import tab | `fetchMasterImportHistory` + `preferPostgresMasterData` |
| `costingWorkspaceService` KPIs | `prisma.importBatch.count` |
| `energya_import_batches_v1` | NON_AUTHORITATIVE_MIRROR (`IMPORT_BATCH_LOCAL_IS_AUTHORITATIVE = false`) |

---

## 3. Import Center lifecycle (authoritative sequence)

```
Upload → detect kind → preview (validate/transform)
  → POST /imports/preview → PG ImportBatch PREVIEWED (optional)
Confirm → POST /imports/commit
  → runImport (memory stores, persist:false for entities)
  → persistImportTransaction (PG $transaction)
       → upsert master records (kind-specific)
       → ImportBatch COMMITTED
  → writeAudit (server AuditEvent)
  → response { committed: true, postgresql: true }
  → UI commitKind(mirrorBatchToLocalStorage:true) → LS mirror only
```

**Critical rule:** PG transaction is the authoritative import commit. LS never has independent successful import authority.

---

## 4. PostgreSQL data evidence (Gate A)

| Metric | Value (local demo DB, 2026-09-04) |
|--------|-----------------------------------|
| Model | `ImportBatch` + `ImportBatchRow` |
| Total rows | ≥ 1 (seed + import history) |
| Status mix | COMMITTED / PREVIEWED / REJECTED |
| Unique `batchNumber` | enforced (`@unique`) |
| Related `ImportBatchRow` | child rows per batch |
| Server `AuditEvent` on commit | entity = CableMaster / CableBom / DrumMaster / RawMaterial; entityId = batchNumber |

Data is sufficient for ImportBatch SoT. No schema change required for 04B-3.

---

## 5. Gates A–J summary

| Gate | Result | Evidence |
|------|--------|----------|
| **A DATA** | PASS | Governed `ImportBatch` rows in PG with unique batchNumber |
| **B READ** | PASS | Hub/API `GET /imports`; empty PG wins via `preferPostgresMasterData` |
| **C WRITE** | PASS | Preview/commit/reject via PG; LS `saveImportBatch` requires `mirrorAfterPgSuccess` |
| **D V1/V2** | PASS | Same `/api/master/imports*` + ownership matrix |
| **E LS** | PASS | `NON_AUTHORITATIVE_MIRROR`; key retained, not deleted |
| **F STALE** | PASS | Tests: PG batch beats LS stale; empty PG beats LS |
| **G FAILURE** | PASS | PG fail → no LS batch mirror; `saveImportBatch` throws without mirror flag |
| **H SECURITY** | PASS | `requireImportAuth` + `assertCanImportMasterData` |
| **I AUDIT** | PASS | `writeAudit` on `persistImportTransaction` commit |
| **J REGRESSION** | PASS | Focused + full suite / tsc / prisma validate / build |

`canPromoteToPostgresqlSot(ImportBatch)` satisfied → status set to `POSTGRESQL_SOT`.

---

## 6. Gate A — DATA

PostgreSQL `ImportBatch` table populated from production imports and persistence tests. `batchNumber` is unique. Child `ImportBatchRow` records capture ERROR/WARNING/SKIPPED severities.

---

## 7. Gate B — READ

- `GET /api/master/imports` → `listImportHistory()` (Prisma, `take: 100`, includes rows).
- `MasterDataHub` uses `fetchMasterImportHistory` + `resolveMasterListPreferringPostgres`.
- `loadAuthoritativeImportHistory` helper added for consistent PG-first reads.

---

## 8. Gate C — WRITE

- Authoritative batch writes: `persistImportBatchOnly`, `persistImportTransaction` (in-txn `importBatch.create`).
- LS `saveImportBatch` throws unless `{ mirrorAfterPgSuccess: true }`.
- `finishCommit` mirrors batch to LS only when `mirrorBatchToLocalStorage: true` or memory test stores.

---

## 9. Gate D — V1/V2

V1 Master Data Hub and V2 Module IA (`ImportBatch` entity) share the same `/api/master/imports*` routes and `masterDataSoT` registry entity.

---

## 10. Gate E — LOCALSTORAGE

`energya_import_batches_v1` classified `A_GOVERNED` / `NON_AUTHORITATIVE_MIRROR`. Key retained; not deleted.

---

## 11. Gate F — STALE DATA

`preferPostgresMasterData` / `resolveMasterListPreferringPostgres`: successful PG response wins including empty arrays. Stale LS batches cannot override PG history.

---

## 12. Gate G — FAILURE

- `MasterDataImport.postPostgresCommit` returns 503/422 on PG failure; no `commitKind` mirror call.
- Direct `saveImportBatch` without mirror flag throws.
- `commitKind` with default LS stores does not write batch without `mirrorBatchToLocalStorage`.

---

## 13. Gate H — SECURITY

`requireImportAuth`: JWT actor required. `assertCanImportMasterData` RBAC. Customers denied import writes (see `increment4.readiness.test.ts`).

---

## 14. Gate I — AUDIT

`persistImportTransaction` calls `writeAudit` after successful PG txn with batchNumber as entityId.

---

## 15. Gate J — REGRESSION

`importBatchSotCutover.test.ts` + existing import pipeline / persistence tests. Full `npm test`, `tsc --noEmit`, `prisma validate`, `npm run build`.

---

## 16. Imported entity safety (explicit non-promotion)

04B-3 promotes **ImportBatch metadata only**. CableMaster, CableBomLine, DrumMaster remain `POSTGRESQL_PRIMARY` in registry. Import transaction still writes those entities as part of import commit — that is existing behavior, not a cutover claim.

---

## 17. Costing / fulfillment safety

No changes to `costingEngine.ts`, Option B, Decision 5, Phase 1 fulfillment, drum optimization WIP, or D365/Advaris.

---

## 18. Remaining localStorage paths

| Path | Role |
|------|------|
| `getImportBatches` | Degraded read fallback (non-authoritative) |
| `saveImportBatch({ mirrorAfterPgSuccess })` | Compatibility mirror after PG success |
| `finishCommit` + `mirrorBatchToLocalStorage` | Import Center post-commit mirror |
| Client `appendAudit` in `finishCommit` | Legacy telemetry only — server `AuditEvent` authoritative |

---

## 19. Rollback / compatibility

1. Revert the 04B-3 commit (do not amend 04A/04B-1/04B-2).  
2. LS mirror key remains populated — no destructive drop.  
3. Registry returns to `POSTGRESQL_PRIMARY` if reverted.

---

## 20. Explicit non-actions

- Cable / BOM / Drum / Params / TCR / Audit **not** promoted  
- LS key **not** deleted  
- Fulfillment / drum optimization / demo / brand WIP **untouched**  
- 04B-4 **complete** (audit authority — not POSTGRESQL_SOT)

---

## 21. Test evidence

| Test file | Coverage |
|-----------|----------|
| `importBatchSotCutover.test.ts` | Registry promotion, gates, stale/empty PG, LS guard |
| `masterDataSoT.test.ts` | Framework alignment post-cutover |
| `masterDataApiService.test.ts` | `IMPORT_BATCH_LOCAL_IS_AUTHORITATIVE` |
| `importPipelineService.test.ts` | Validation pipeline (memory stores) |
| `masterData.persistence.test.ts` | `persistImportTransaction` + ImportBatch row |
| `increment4.readiness.test.ts` | Import auth + PG persist |

Baseline: 68 test files / 633 tests (added `importBatchSotCutover.test.ts` — 10 tests).

---

## 22. Documentation updates

- [18 inventory](./18_MASTER_DATA_PERSISTENCE_INVENTORY.md) — ImportBatch → POSTGRESQL_SOT  
- [20 framework](./20_MASTER_DATA_SOT_CUTOVER_FRAMEWORK.md) — 04B-3 complete  
- [README](./README.md) — doc 22 index  
- [10 roadmap](./10_V2_IMPLEMENTATION_ROADMAP.md) — Phase 2 progress  

---

## 23. Machine-readable registry

`MASTER_DATA_SOT_STATUS` → `ImportBatch.status = POSTGRESQL_SOT`, `cutoverPhase = POSTGRESQL_SOT`, all gates A–J `true`.  
`MASTER_DATA_CUTOVER_MATRIX` → `cutoverReady: true`, `blockingReason: null`.  
`MASTER_DATA_CUTOVER_FRAMEWORK.entityCutoversCompleted` includes `ImportBatch`; `nextEntityCutover = AuditEvent`.

---

## 24. Verdict

**IMPORT BATCH = POSTGRESQL_SOT — CUTOVER ACCEPTED**

TASK 04A = ACCEPTED / FROZEN  
TASK 04B-1 = ACCEPTED / FROZEN  
TASK 04B-2 = ACCEPTED / FROZEN  
TASK 04B-3 = IMPORT BATCH ONLY  
TASK 04B-4 = AUDIT AUTHORITY ONLY (see doc 23)  
TASK 04B-5 = NOT STARTED  
STOP.
