# 21 — Raw Material SoT Cutover (Task 04B-2)

**Date:** 2026-09-04  
**Status:** **CUTOVER ACCEPTED** — `RawMaterial` = `POSTGRESQL_SOT`  
**Frozen 04A:** `57caf852067fea4b29efdfd4d73733499a0ba4f0`  
**Frozen 04B-1:** `fb03a3c8ccc2d339f021aac1950ec06959305d2e`  
**Machine-readable:** `src/platform/masterDataSoT.ts` (`RawMaterial` row + matrix)  
**Related:** [20 framework](./20_MASTER_DATA_SOT_CUTOVER_FRAMEWORK.md) · [18 inventory](./18_MASTER_DATA_PERSISTENCE_INVENTORY.md)

---

## 1. Objective

Promote **Raw Material only** from `POSTGRESQL_PRIMARY` → `POSTGRESQL_SOT` after gates A–J, without deleting `energya_raw_material_master_v1` (retained as **NON_AUTHORITATIVE_MIRROR**).

Other master-data entities were **not** cut over. Task 04B-3 **not started**.

---

## 2. Discovery summary (code-proven)

| Path | Authority |
|------|-----------|
| `GET/POST/PUT /api/master/raw-materials*` | PostgreSQL via `masterDataRepository` + RBAC |
| Costing UI (`useCostingWorkspaceData` → `/api/master/raw-materials`) | Same PG API |
| Costing lookups / engine consumers | `prisma.rawMaterial` |
| Master Data Hub grids / deactivate | `fetchMasterRawMaterials` / `deactivateRawMaterialViaApi` |
| Import Center / costing bulk RM | PG `persistImportTransaction` then optional LS mirror |
| Quality KPIs | PG snapshot when Hub loaded; LS-only call = non-authoritative |
| `energya_raw_material_master_v1` | Mirror / degraded fallback only (`RAW_MATERIAL_LOCAL_IS_AUTHORITATIVE = false`) |

---

## 3. PostgreSQL data evidence (Gate A)

| Metric | Value (local demo DB, 2026-09-04) |
|--------|-----------------------------------|
| Model | `RawMaterial` (`code` PK) |
| Total rows | **343** |
| ACTIVE / INACTIVE | 343 / 0 |
| Empty description / UOM | 0 / 0 |
| Duplicate business keys (UPPER(code)) | none |
| Related `RawMaterialPrice` rows | 157 |
| Server `AuditEvent` entity=RawMaterial | 593 |
| Classification mix | 340 STANDARD · 1 COPPER · 2 ALUMINIUM |

Data is sufficient for SoT. No schema change required for 04B-2.

---

## 4. Gates A–J

| Gate | Result | Evidence |
|------|--------|----------|
| **A DATA** | PASS | 343 governed rows; unique `code`; prices/audit linked |
| **B READ** | PASS | Hub/Costing/API use PG; empty PG wins via `preferPostgresMasterData` |
| **C WRITE** | PASS | Create/update/import/deactivate via PG; LS-only `deactivateRawMaterial` now throws |
| **D V1/V2** | PASS | Same `/api/master/raw-materials*` + ownership matrix |
| **E LS** | PASS | `NON_AUTHORITATIVE_MIRROR`; key retained, not deleted |
| **F STALE** | PASS | Tests: PG Copper beats LS OLD; empty PG beats LS |
| **G FAILURE** | PASS | PG fail → `LOCALSTORAGE_FALLBACK`, `authoritative: false` |
| **H SECURITY** | PASS | Auth + `assertCanViewMasterDataCatalog` / `assertCanWriteBomAndRawMaterials`; customers denied writes |
| **I AUDIT** | PASS | `writeAudit` on create/update/price/import commit |
| **J REGRESSION** | PASS | Focused + full suite / tsc / prisma validate / build |

`canPromoteToPostgresqlSot(RawMaterial)` satisfied → status set to `POSTGRESQL_SOT`.

---

## 5. Costing safety

No changes to `costingEngine.ts`, Option B, Decision 5, metal semantics, UOM conversion, scrap, or price workflow. Costing continues to read the same PostgreSQL `RawMaterial` records.

---

## 6. Remaining localStorage paths

| Path | Role |
|------|------|
| `getStoredRawMaterials` / `saveRawMaterials` | Mirror + degraded fallback |
| Import `commitKind` after PG success | Compatibility mirror only |
| Quality without snapshot | Explicit non-authoritative |

---

## 7. Rollback / compatibility

1. Revert the 04B-2 commit (do not amend 04A/04B-1).  
2. LS mirror remains populated — no destructive drop.  
3. Registry returns to `POSTGRESQL_PRIMARY` if reverted.

---

## 8. Explicit non-actions

- Cable / BOM / Drum / Params / TCR / ImportBatch / Audit **not** promoted  
- LS key **not** deleted  
- Fulfillment / drum optimization / demo / brand WIP **untouched**  
- 04B-3 **not started**
