# 33 — Cable BOM Conflict Governance (Task 04B-13)

**Date:** 2026-09-05  
**Status:** **GOVERNANCE ESTABLISHED** — `CableBomLine` remains `POSTGRESQL_PRIMARY` (**NOT PROMOTED**)  
**Frozen baselines:** 04B-8 readiness `565d064` · 04B-9 remediation `70ae5ec` · Drum SoT `7b78c43`  
**Tests:** `src/platform/cableBomConflictGovernance.test.ts` · `src/server/increment8.bom.test.ts`  
**Machine-readable register:** `data/governance/bom-conflict-register.json` · `data/governance/bom-conflict-register.csv`  
**Service:** `src/server/bomConflictGovernanceService.ts`

---

## 1. Objective

Establish engineering data governance for **81** unresolved `BomDuplicateObservation` groups without deleting, deduping, merging, or mass-approving BOM records to game SoT promotion gates.

---

## 2. Decision

```
CABLE BOM = POSTGRESQL_PRIMARY — NOT PROMOTED (OUTCOME B)
```

| Field | Value |
|-------|-------|
| `status` | `POSTGRESQL_PRIMARY` |
| `postgresSoT` | `false` |
| `cutoverPhase` | `LS_NON_AUTHORITATIVE` |
| `canPromoteToPostgresqlSot` | `false` |
| Cutover outcome | **OUTCOME B** — ENGINEERING_REVIEW_REQUIRED |

Promotion remains blocked until Technical Office resolves and approves governed consumption for all conflict groups.

---

## 3. Conflict inventory (live PostgreSQL 2026-09-05)

| Metric | Value |
|--------|-------|
| Official conflict groups (`BOM-CONF-*`) | **81** |
| `CableBomLine` rows (source) | **4,936** |
| Conflict pairs with source `CableBomLine` | **0** (weights skipped on import — preserved in observations only) |
| Distinct cables affected | **73** |
| Distinct raw materials in conflicts | **3** (`HB02`, `AR01`, `SC01`) |
| `GovernedBomLine` rows | **51** (pre-existing; not mass-created in 04B-13) |
| Records deleted in 04B-13 | **0** |
| Records merged in 04B-13 | **0** |

Regenerate inventory: `node --import tsx scripts/generateBomConflictRegister.ts`

---

## 4. Classification taxonomy (A–L)

| Letter | Classification | 04B-13 count |
|--------|----------------|--------------|
| A | `TRUE_DUPLICATE` | 0 |
| B | `REVISION_CONFLICT` | 0 |
| C | `QUANTITY_CONSUMPTION_CONFLICT` | 71 |
| D | `PLANT_VARIATION` | 1 |
| E | `MANUFACTURING_ROUTE` | 0 |
| F | `EFFECTIVE_DATE_CONFLICT` | 0 |
| G | `ALTERNATIVE_CONSUMPTION_BASIS` | 9 |
| H | `SOURCE_DATA_ERROR` | 0 |
| I | `SCRAP_COMPONENT_AMBIGUITY` | 0 |
| J | `UOM_AMBIGUITY` | 0 |
| K | `INSUFFICIENT_INFORMATION` | 0 |
| L | `UNRESOLVED` | 0 |

Classification is evidence-based from weight deltas, raw-material patterns, and existing workflow fields — not invented resolutions.

---

## 5. Disposition summary

| Disposition | Count | Meaning |
|-------------|-------|---------|
| `AUTO_RESOLVE_SAFE` | 0 | No auto-resolution applied (no gate gaming) |
| `ENGINEERING_REVIEW_REQUIRED` | 72 | TO must document basis and approve governed weight |
| `PRESERVE_AS_VALID_VARIANT` | 9 | Small deltas — preserve both weights until decision |
| `RETIRE_OBSOLETE` | 0 | None assigned without SOURCE_DATA_ERROR evidence |
| `BLOCK` | 0 | — |

All **81** conflicts require engineering review before costing Gate 2 passes.

---

## 6. Raw-material breakdown

| Raw material | Conflicts | Weight ratio pattern |
|--------------|-----------|----------------------|
| `SC01` | 38 | ~1.01×–1.60× |
| `AR01` | 32 | ~1.65×–1.71× (systematic) |
| `HB02` | 11 | ~5.0×–7.35× (large basis spread) |

---

## 7. Investigation status (unchanged workflow)

| Status | Count |
|--------|-------|
| `BUSINESS_DECISION_REQUIRED` | 80 |
| `UNDER_REVIEW` | 1 (`BOM-CONF-001` — increment8 test workflow) |
| `APPROVED` | 0 |

04B-13 does **not** mass-transition statuses to `APPROVED`.

---

## 8. Schema entities (read-only inspection)

| Model | Role |
|-------|------|
| `CableBomLine` | Source import layer — `POSTGRESQL_PRIMARY` |
| `BomDuplicateObservation` | Conflict register — 81 official groups |
| `GovernedBomLine` | TO-approved overlay — created only via existing `processBomGovernanceWorkflowAction` APPROVE |

No schema migration in 04B-13. No promotion of `CableBomLine`.

---

## 9. Engineering authority / workflow

Existing Increment 8 workflow retained:

- `GET /api/master/bom-conflicts` — queue
- `POST /api/master/bom-conflicts/:conflictId/actions` — ASSIGN / DECIDE / RESOLVE / APPROVE / REJECT / REOPEN
- `governanceRepository.processBomGovernanceWorkflowAction` — creates `GovernedBomLine` on APPROVE only
- RBAC: `assertCanApproveBomGovernance` for manager approval

04B-13 adds **read-only classification/disposition** in `bomConflictGovernanceService` + committed register.

---

## 10. Data preservation

- Source `CableBomLine` rows: **not deleted**
- Conflicting weights: preserved in `BomDuplicateObservation.weightA` / `weightB`
- Import skips conflicting pairs into source table (by design since Increment 4) — observations hold both weights
- No averaging, no “pick first row”, no silent dedupe

---

## 11. Version semantics

- All source lines remain `bomVersion = 1`
- Uniqueness grain: `(cableMaterialNumber, rawMaterialCode, bomVersion)` unchanged
- Governance may assign higher `bomVersion` on `GovernedBomLine` only after explicit TO approval

---

## 12. Costing impact (read-only)

- Gate 2 blocks cables with any non-`APPROVED` conflict (`evaluateCableCostingReadiness`)
- All 81 groups: `costingImpact` = `BLOCKED_UNTIL_RESOLVED` or `NO_SOURCE_LINE`
- `costingEngine` **not modified** (Costing V2 freeze)

---

## 13. Import pipeline guard

`validateBomImportConflictPreservation` blocks:

- Deleting observations to clear debt
- Mass-approving conflicts during import
- Reducing the official conflict register without governance workflow

Pure function `validateBomImportConflictPreservation` — called by tests; import paths must not pass `proposedDeletes` / `proposedMassApprovals` / `proposedOfficialConflictReduction`.

---

## 14. Read authority

- Authoritative conflict list: PostgreSQL via `listBomConflictRegister` / `buildBomConflictGovernanceRegister`
- Committed JSON register for offline audit/review
- LS `energya_cable_boms_v3` remains non-authoritative mirror

---

## 15. Security

- BOM governance routes require master-data auth (existing)
- Customer actors cannot approve (`increment8.bom.test.ts` Test 5)
- No new public endpoints

---

## 16. Audit

- Governance mutations continue via `appendAudit` + `AuditEvent` in `processBomGovernanceWorkflowAction`
- 04B-13 register generation is read-only — no audit mutation

---

## 17. Test evidence (A–O)

| Test | Assertion |
|------|-----------|
| A | 81 official conflicts in PG |
| B | Register completeness |
| C | Classification A–L |
| D | Allowed dispositions |
| E | No source BOM mass deletion |
| F | No mass auto-approve |
| G | OUTCOME B — not promoted |
| H | Import preservation guard |
| I | Existing TO register API |
| J | Observations immutable weights |
| K | Costing impact flags |
| L | bomVersion=1 unchanged |
| M | JSON register matches live PG |
| N | Gates pass but promotion false |
| O | Zero deleted; summary OUTCOME B |

File: `src/platform/cableBomConflictGovernance.test.ts`

---

## 18. Cutover assessment

**OUTCOME B — ENGINEERING_REVIEW_REQUIRED**

| Criterion | Result |
|-----------|--------|
| All conflicts classified | Yes (81/81) |
| All conflicts dispositioned | Yes (81/81) |
| All conflicts resolved | **No** (0 APPROVED in official register) |
| Promote `CableBomLine`? | **NO** |

`canPromoteToPostgresqlSot(CableBomLine)` → **false** (honest registry).

---

## 19. Files touched (04B-13 only)

| Path | Change |
|------|--------|
| `src/server/bomConflictGovernanceService.ts` | New — classify/disposition/inventory |
| `scripts/generateBomConflictRegister.ts` | New — reproducible register |
| `data/governance/bom-conflict-register.json` | New — machine-readable |
| `data/governance/bom-conflict-register.csv` | New — export |
| `src/platform/cableBomConflictGovernance.test.ts` | New — tests A–O |
| `src/server/governanceRepository.ts` | Re-export governance helpers |
| `src/platform/masterDataSoT.ts` | Notes / matrix text only |
| `docs/v2/33_CABLE_BOM_CONFLICT_GOVERNANCE.md` | This document |
| `package.json` | Wire test file |

---

## 20. Explicit non-actions

- No `CableBomLine` promotion to `POSTGRESQL_SOT`
- No deletion/dedupe/merge of BOM or observation rows
- No fake `APPROVED` statuses
- No changes to `costingEngine`, Costing V2, Decision 5, Drum SoT, fulfillment, D365
- No amend/push of frozen commits

---

## 21. Final report (STOP)

| Item | Value |
|------|-------|
| Total conflicts | **81** |
| Classification counts | C=71, D=1, G=9 (others 0) |
| Disposition counts | ENGINEERING_REVIEW=72, PRESERVE=9, AUTO_RESOLVE=0 |
| Data deleted | **0** |
| Cable BOM status | **POSTGRESQL_PRIMARY — NOT PROMOTED** |
| Cutover outcome | **OUTCOME B** |
| **STOP** | Promotion blocked until engineering review completes |

---

**Task 04B-13 complete.**
