# 19 — Master Data Cutover (Task 04 / historical draft from 3b325c3)

> **Reconcile note (Task 04A):** Full cutover is **split**. Authoritative remediation status lives in  
> **[19_MASTER_DATA_PERSISTENCE_REMEDIATION.md](./19_MASTER_DATA_PERSISTENCE_REMEDIATION.md)**.  
> **Task 04B = NOT STARTED.** Do not treat this file as “Task 04 complete.”  
> Entity statuses in `masterDataSoT.ts` were corrected in 04A to honest `POSTGRESQL_PRIMARY` / `BLOCKED` where SoT was premature.

**Date:** 2026-09-04  
**Inventory:** [18_MASTER_DATA_PERSISTENCE_INVENTORY.md](./18_MASTER_DATA_PERSISTENCE_INVENTORY.md)  
**Machine-readable SoT:** `src/platform/masterDataSoT.ts`  
**HTTP:** `GET /api/v2/master-data-sot`, `GET /api/master/sot-status`  
**Persistence mode:** `POSTGRESQL_SOT_WITH_LOCALSTORAGE_COMPAT`

---

## 1. Policy

1. PostgreSQL is authoritative for governed master data.
2. When a PostgreSQL read **succeeds**, its payload wins — **including empty lists**. Stale localStorage must not override.
3. localStorage may remain as a **non-authoritative compatibility mirror** after successful PG writes/imports.
4. Authenticated Import Center **requires** PostgreSQL commit for availability; LS mirror only after success.
5. No Costing Option B / Decision 5 / market-metal changes. No Phase 1 fulfillment semantic changes.
6. Do not fabricate engineering data (`DrumCompatibility`, incomplete cables stay incomplete).

---

## 2. Entity cutover matrix (superseded by 04A honest statuses)

See remediation doc §3 for current `POSTGRESQL_SOT` vs `POSTGRESQL_PRIMARY` vs `BLOCKED`.  
This draft previously over-claimed SoT for Cable/BOM/RM/Drum — corrected in 04A.

---

## 3. STEPS from 3b325c3 (historical)

| Step | Result |
|------|--------|
| 1 Inventory | Doc 18 |
| 2–8 Hub/Import prefer PG | Started in 3b325c3; refined in 04A |
| Full SoT claim | **Premature** — corrected in 04A |

---

## 4. APIs added (additive, retained)

| Method | Path | Purpose |
|--------|------|---------|
| GET | `/api/v2/master-data-sot` | Machine-readable SoT status |
| GET | `/api/master/sot-status` | Same (master catalog auth) |
| PUT | `/api/master/drums/:drumCode` | ACTIVE/INACTIVE + AuditEvent |

---

## 5. Known gaps (explicit STOP → 04B)

- Excel Method-B cable/BOM upload still writes LS only.
- Residual sync engines may still call `getStored*` when PG unavailable (non-authoritative).
- Custom master params + TCR LS not migrated.
- `DrumCompatibility` empty — CONFIGURATION_REQUIRED.

**TASK 04B = NOT STARTED.**
