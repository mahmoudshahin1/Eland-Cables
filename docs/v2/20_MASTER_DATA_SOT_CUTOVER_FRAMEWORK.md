# 20 — Master Data SoT Cutover Framework (Task 04B-1)

**Date:** 2026-09-04  
**Status:** FRAMEWORK ACCEPTED / FROZEN at `fb03a3c8ccc2d339f021aac1950ec06959305d2e`  
**Entity cutovers:** **04B-2 Raw Material** + **04B-3 Import Batch** + **04B-7 Cable Master** = `POSTGRESQL_SOT` (see [doc 21](./21_RAW_MATERIAL_SOT_CUTOVER.md), [doc 22](./22_IMPORT_BATCH_SOT_CUTOVER.md), [doc 26](./26_CABLE_MASTER_SOT_CUTOVER.md)); other entities **NOT STARTED**  
**Frozen 04A:** `57caf852067fea4b29efdfd4d73733499a0ba4f0` (do not amend)  
**Machine-readable:** `src/platform/masterDataSoT.ts`  
**HTTP:** `GET /api/v2/master-data-sot`, `GET /api/master/sot-status` (includes `cutoverMatrix` / `framework`)

---

## 0. Task split (do not conflate)

| Task | Intent | Status |
|------|--------|--------|
| **04A** | Persistence remediation — PG primary, honest authority statuses | **ACCEPTED / FROZEN** |
| **04B-1** | Enforceable cutover framework (phases, gates, matrix, order) | **ACCEPTED / FROZEN** |
| **04B-2** | Raw Material entity cutover → `POSTGRESQL_SOT` | **ACCEPTED** — [doc 21](./21_RAW_MATERIAL_SOT_CUTOVER.md) |
| **04B-3** | Import Batch entity cutover → `POSTGRESQL_SOT` | **ACCEPTED** — [doc 22](./22_IMPORT_BATCH_SOT_CUTOVER.md) |
| **04B-4** | Audit authority — `AUTHORITATIVE_SERVER_AUDIT` (not MD SoT) | **ACCEPTED** — [doc 23](./23_AUDIT_AUTHORITY_AND_LEGACY_TELEMETRY.md) |
| **04B-5** | Cable Master entity cutover → `POSTGRESQL_SOT` | **BLOCKED** (Gate C) — [doc 24](./24_CABLE_MASTER_SOT_READINESS.md) |
| **04B-6** | Cable Master write remediation | **COMPLETE** — Gate C remediated |
| **04B-6A** | Cable Master V1/V2 read convergence | **COMPLETE** — Gates B/D remediated |
| **04B-7** | Cable Master entity cutover → `POSTGRESQL_SOT` | **ACCEPTED** — [doc 26](./26_CABLE_MASTER_SOT_CUTOVER.md) |
| **04B-8+** | Remaining entity cutovers (BOM/Drum/params) | **NOT STARTED** |

`POSTGRESQL_PRIMARY` is **not** equivalent to `POSTGRESQL_SOT`.

---

## 1. Objective

Ensure each master-data entity moves to `POSTGRESQL_SOT` only after explicit technical, data, security, audit, V1/V2 consistency, and localStorage-authority gates.

Non-actions (04B-1): no entity cutover, no LS deletion, no mass migration, no Cable/BOM/Drum/custom-params/TCR migrate, no DrumCompatibility invention, no Costing Option B / Decision 5 / Phase 1 fulfillment / SC / Finance / D365 / Advaris changes.

*(04B-2 later executed Raw Material only — see doc 21. Framework rules above still govern remaining entities.)*

---

## 2. Existing SoT authority model (04A — unchanged)

`MasterDataAuthorityStatus`:

`POSTGRESQL_SOT` | `POSTGRESQL_PRIMARY` | `DUAL_WRITE` | `LOCALSTORAGE_PRIMARY` | `UI_STATE` | `NOT_MASTER_DATA` | `BLOCKED`

Registry remains a **single** typed config in `masterDataSoT.ts` (not EAV; not a second registry).

---

## 3. Cutover phase model (04B-1 — composed)

`MasterDataCutoverPhase` progresses toward SoT without redefining authority:

| Phase | Meaning |
|-------|---------|
| `DISCOVERED` | Entity inventoried |
| `PG_DATA_VERIFIED` | Gate A evidence |
| `PG_READ_READY` | Gate B evidence |
| `PG_WRITE_READY` | Gate C evidence |
| `V1_V2_CONVERGED` | Gate D evidence |
| `LS_NON_AUTHORITATIVE` | Gate E evidence (mirror allowed) |
| `TESTED` | Gates F/G/J evidence |
| `CUTOVER_READY` | All gates A–J; eligible for authority promotion |
| `POSTGRESQL_SOT` | Terminal — matches authority `POSTGRESQL_SOT` |
| `BLOCKED` | Hard stop (shared with authority) |
| `TEMPORARY` | Hold / non-governed / queue (shared intent with LS primary / dual) |

**Promotion policy (enforceable in code):** `canPromoteToPostgresqlSot` requires authority `POSTGRESQL_PRIMARY` (or already SoT), `cutoverPhase === CUTOVER_READY` (or already SoT), and all gates A–J. Framework does **not** auto-mutate statuses outside an explicit entity task.

---

## 4. Mandatory readiness gates A–J

| Gate | Name | Requirement |
|------|------|-------------|
| **A** | DATA | PostgreSQL contains the required governed records |
| **B** | READ | All authoritative reads use PostgreSQL |
| **C** | WRITE | All authoritative writes use PostgreSQL |
| **D** | V1/V2 | V1 and V2 share the same authoritative service/data |
| **E** | LOCALSTORAGE | LS removed, non-authoritative mirror, temporary, UI state, or blocked — no hidden authority |
| **F** | STALE DATA | Stale LS cannot override PostgreSQL |
| **G** | FAILURE | PG failure cannot create LS-only authoritative success |
| **H** | SECURITY | Server-side authenticated/authorized access |
| **I** | AUDIT | Authoritative writes produce server `AuditEvent` where applicable |
| **J** | REGRESSION | Existing tests remain green |

---

## 5. Entity-specific STOP conditions

| Entity | STOP |
|--------|------|
| Cable Master | Excel Method-B remains authoritative **or** PG/V1/V2 paths diverge **or** V1 cascading filters LS-default |
| BOM | Excel Method-B remains authoritative **or** BOM governance/versioning bypassed |
| Drum | Full CRUD/engineering incomplete **or** DrumCompatibility unresolved |
| Cable Parameters | Governed vs temporary custom params not formally resolved |
| TCR | Temporary request-queue lifecycle/authority undecided |
| DrumCompatibility | **REMAIN BLOCKED** — do not fabricate |
| Raw Material | **04B-2 complete** — Costing + MD must stay on same PG; LS must not regain authority |
| Import | Do not declare SoT until PG txn + mirror behavior proven |
| Audit | Server `AuditEvent` authoritative; client audit = telemetry until cleanup decision |

---

## 6. Recommended cutover order

1. Customer *(already SoT)*  
2. Raw Material Prices *(already SoT)*  
3. Currency *(already SoT)*  
4. FX *(already SoT)*  
5. Scrap *(already SoT)*  
6. Commercial Pricing *(already SoT)*  
7. Engineering Mappings *(already SoT)*  
8. **Raw Material *(04B-2 — POSTGRESQL_SOT)***  
9. Import Batches  
10. Audit  
11. Cable Master  
12. BOM  
13. Drum Master  
14. Cable Parameters  

TCR / CustomMasterParams separately controlled. DrumCompatibility / Excel Method-B remain BLOCKED.

Machine-readable: `MASTER_DATA_CUTOVER_ORDER`.

---

## 7. Entity cutover matrix (summary)

Full columns live in `MASTER_DATA_CUTOVER_MATRIX` (repo evidence from 04A docs 18/19 + registry + 04B-2). Summary:

| Entity | Current | Phase | Cutover ready? | Blocking |
|--------|---------|-------|----------------|----------|
| Customer | POSTGRESQL_SOT | POSTGRESQL_SOT | Yes | — |
| RM Prices / Currency / FX / Scrap / Commercial / Eng. mappings | POSTGRESQL_SOT | POSTGRESQL_SOT | Yes | — |
| **Raw Material** | **POSTGRESQL_SOT** | **POSTGRESQL_SOT** | **Yes (04B-2)** | Mirror retained non-authoritative |
| **Import Batch** | **POSTGRESQL_SOT** | **POSTGRESQL_SOT** | **Yes (04B-3)** | Mirror retained non-authoritative |
| Audit | AUTHORITATIVE_SERVER_AUDIT | AUTHORITATIVE_SERVER_AUDIT | Yes (04B-4) | Not POSTGRESQL_SOT master data |
| **Cable Master** | **POSTGRESQL_SOT** | **POSTGRESQL_SOT** | **Yes (04B-7)** | Mirror retained non-authoritative ([doc 26](./26_CABLE_MASTER_SOT_CUTOVER.md)) |
| BOM | POSTGRESQL_PRIMARY | LS_NON_AUTHORITATIVE | **No** | Excel Method-B STOP |
| Drum | POSTGRESQL_PRIMARY | PG_WRITE_READY | **No** | CRUD/compat STOP |
| Cable Parameters | POSTGRESQL_PRIMARY | PG_READ_READY | **No** | Class distinction STOP |
| TCR | DUAL_WRITE | TEMPORARY | **No** | Queue undecided |
| DrumCompatibility | BLOCKED | BLOCKED | **No** | Do not invent |

---

## 8. localStorage dependencies (retained)

See `MASTER_DATA_KEY_CLASSIFICATION` and doc 18. Mirrors remain non-authoritative where remediated. Raw Material key retained after 04B-2 (not deleted).

---

## 9. Security / audit

- Gate H: catalog/admin APIs remain authenticated (`resolveRequestActor` + RBAC).  
- Gate I: server `AuditEvent` is authoritative; client `appendAudit` = legacy telemetry.  
- Customer isolation / costing freezes unchanged.

---

## 10. Explicit non-actions (framework + remaining entities)

- No Cable/BOM/Drum/custom-param/TCR/Import/Audit cutover in 04B-1  
- No localStorage deleted  
- No Costing Option B / Decision 5 changes  
- No fulfillment redesign  
- Task 04B-3+ remain pending  

---

## 11. Related docs

- [18 inventory](./18_MASTER_DATA_PERSISTENCE_INVENTORY.md)  
- [19A remediation](./19_MASTER_DATA_PERSISTENCE_REMEDIATION.md) (04A authoritative)  
- [19 cutover draft](./19_MASTER_DATA_CUTOVER.md) (historical; not “04 complete”)  
- [21 Raw Material SoT](./21_RAW_MATERIAL_SOT_CUTOVER.md) (04B-2)
