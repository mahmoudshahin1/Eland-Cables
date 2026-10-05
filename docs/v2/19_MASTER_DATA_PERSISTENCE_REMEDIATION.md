# 19 — Master Data Persistence Remediation (Task 04A)

**Date:** 2026-09-04  
**Status:** **ACCEPTED / FROZEN** at `57caf852067fea4b29efdfd4d73733499a0ba4f0` — do not amend.  
**Inventory:** [18_MASTER_DATA_PERSISTENCE_INVENTORY.md](./18_MASTER_DATA_PERSISTENCE_INVENTORY.md)  
**Cutover framework (04B-1):** [20_MASTER_DATA_SOT_CUTOVER_FRAMEWORK.md](./20_MASTER_DATA_SOT_CUTOVER_FRAMEWORK.md) — phases/gates/matrix only; **entity cutovers NOT STARTED**.  
**Historical cutover draft (3b325c3):** [19_MASTER_DATA_CUTOVER.md](./19_MASTER_DATA_CUTOVER.md) — must not be read as “Task 04 complete.”  
**Machine-readable SoT:** `src/platform/masterDataSoT.ts`  
**HTTP:** `GET /api/v2/master-data-sot`, `GET /api/master/sot-status`  
**Persistence mode:** `POSTGRESQL_SOT_WITH_LOCALSTORAGE_COMPAT` (compatibility label; entity statuses are honest — many remain `POSTGRESQL_PRIMARY`, not `POSTGRESQL_SOT`)

---

## 1. Scope split

| Task | Intent | Status |
|------|--------|--------|
| **04A** | Eliminate architectural blockers so PostgreSQL can become single SoT later | **This document — ACCEPTED / FROZEN** |
| **04B-1** | Formal cutover framework (gates A–J, matrix, order) | See [doc 20](./20_MASTER_DATA_SOT_CUTOVER_FRAMEWORK.md) |
| **04B entity cutovers** | Destructive cutover / deprecate LS authority globally per entity | **NOT STARTED** |

Non-destructive (04A): localStorage data retained. PostgreSQL wins over stale LS. No Costing Option B / Decision 5, Phase 1 fulfillment, SC/Finance/D365/Advaris/low-code. No RawMaterialV2/CableV2. No invented engineering data.

---

## 2. Policy (04A)

1. Successful PostgreSQL reads win — **including empty lists**.
2. localStorage may remain as a **non-authoritative** mirror; never override PG.
3. When PG is unavailable, LS may be shown only as **degraded non-authoritative** fallback (`authoritative: false`).
4. Authenticated Import Center requires PG commit for availability; failure → no apparent master-data success.
5. Do **not** mark Cable/BOM/RM/Drum/ImportBatch/Audit/CableParameters/TCR as `POSTGRESQL_SOT` until 04B entity cutovers complete gates.

---

## 3. Typed SoT registry

Statuses: `POSTGRESQL_SOT` | `POSTGRESQL_PRIMARY` | `DUAL_WRITE` | `LOCALSTORAGE_PRIMARY` | `UI_STATE` | `NOT_MASTER_DATA` | `BLOCKED`

| Entity | 04A status | Why ready / not for cutover |
|--------|------------|-----------------------------|
| Customer | **POSTGRESQL_SOT** | V1/V2 same PG APIs; no hidden LS Customer master |
| RawMaterialPrice / Currency / FX / Scrap / Commercial pricing / Engineering mappings | **POSTGRESQL_SOT** | Already PG-only (costing freeze untouched) |
| CableMaster | **POSTGRESQL_PRIMARY** | Hub/Import/configurator prefer PG; Excel Method-B + some sync paths remain |
| CableBomLine | **POSTGRESQL_PRIMARY** | Same; Excel BOM Method-B gap |
| RawMaterial | **POSTGRESQL_PRIMARY** | Hub+Costing share PG API; LS mirror not Hub SoT |
| DrumMaster | **POSTGRESQL_PRIMARY** | List/status via PG; empty PG wins; full CRUD still partial |
| ImportBatch | **POSTGRESQL_PRIMARY** | PG commit required; LS mirror after success |
| AuditEvent | **POSTGRESQL_PRIMARY** | Server authoritative; client audit = legacy telemetry (kept) |
| CableParameter (seeded) | **POSTGRESQL_PRIMARY** | PG seed SoT for reference; legacy LS keys D_OBSOLETE |
| CustomMasterParams | **LOCALSTORAGE_PRIMARY** | Class B temporary — do not migrate |
| TechnicalOfficeRequest (LS queue) | **DUAL_WRITE** | Separate transactional queue from governed mapping |
| DrumCompatibility / Excel Method-B | **BLOCKED** | Incomplete / LS-only write |

---

## 4. Remediation completed (04A)

| Area | Change |
|------|--------|
| SoT registry | Honest statuses + key classification |
| Cable | Authoritative loaders; configurator / TO / SmartConfigurator / search prefer PG; LS flags non-authoritative |
| BOM | Authoritative loaders; Hub/TO/quality use PG snapshot; Excel Method-B labeled non-authoritative |
| Raw Material | Hub uses PG API (same records as Costing); LS not Hub authority |
| Drum | `drumMasterApiService` + empty-PG-wins select; status PUT retained |
| Import | PG commit required before LS mirror (from prior 3b325c3; preserved) |
| Quality | Snapshot-based; without snapshot → explicit non-authoritative |
| Params / TCR / Audit | Classified A/B/C/D / legacy telemetry — no destructive migrate |
| Tests | PG wins vs stale LS; PG fail → non-authoritative LS |

---

## 5. Explicitly NOT done (04B entity cutovers)

- Delete/deprecate LS master-data keys destructively
- Claim Cable/BOM/RM/Drum/Import/Audit/params/TCR as `POSTGRESQL_SOT`
- Auto-migrate `energya_v2_technical_requests` or custom params
- Excel Method-B → PG write path
- Fabricate `DrumCompatibility`

**04B-1** adds the enforceable framework only — see doc 20. It does **not** execute the items above.

---

## 6. Rollback

1. Revert 04A commit only (do not amend protected history `57caf85`).
2. LS mirrors remain populated — no destructive drop.
3. Prior cutover draft doc (`19_MASTER_DATA_CUTOVER.md`) remains historical.

---

## 7. Freeze verification

- Phase 1 Commercial Fulfillment: no semantic redesign in 04A
- Costing Option B / Decision 5 / market-metal: untouched
