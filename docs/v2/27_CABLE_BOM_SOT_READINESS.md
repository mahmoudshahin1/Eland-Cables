# 27 — Cable BOM SoT Readiness (Task 04B-8)

**Date:** 2026-09-04  
**Status:** **CUTOVER BLOCKED** — `CableBomLine` remains `POSTGRESQL_PRIMARY`  
**Frozen baselines:** 04A `57caf85` · 04B-1 `fb03a3c` · 04B-2 `611c083` · 04B-3 `34b7645` · 04B-4 `397a2d90` · 04B-5 `c2bd03e` · 04B-6 `fd2f7f2` · 04B-7 `ac9c373` · test wiring `ea7085f`  
**Tests:** `src/platform/cableBomSotReadiness.test.ts` · `src/server/increment8.bom.test.ts` · `src/server/increment13.bomScrap.test.ts`

---

## 1. Current BOM authority

| Entity | Registry status | `postgresSoT` | `cutoverPhase` | Decision |
|--------|-----------------|---------------|----------------|----------|
| **CableBomLine** | `POSTGRESQL_PRIMARY` | `false` | `LS_NON_AUTHORITATIVE` | **DO NOT PROMOTE** |
| **GovernedBomLine** | *(derived; not in SoT registry)* | — | — | Costing/governance overlay on source BOM |
| **BomDuplicateObservation** | *(governance artifact)* | — | — | Conflict register; blocks costing until resolved |
| **ExcelMethodBCableBomUpload** | `BLOCKED` | `false` | `BLOCKED` | LS-only write path |

**Promotion decision:** `canPromoteToPostgresqlSot(CableBomLine)` → **false** (`cutoverPhase !== CUTOVER_READY`; Gate **C** fails).

---

## 2. PostgreSQL data evidence

Queried live PostgreSQL 2026-09-04 (`scripts/_tmp_bom_sot_readiness_query.ts` — ephemeral probe, not committed):

| Metric | Value |
|--------|-------|
| `CableBomLine` rows | **4,936** |
| Distinct cables with BOM | **433** |
| `CableMaster` rows | **436** |
| `RawMaterial` rows | **418** |
| `bomVersion` distribution | **100% version 1** |
| Orphan cable refs | **0** |
| Orphan RM refs | **0** |
| Duplicate `(cable, RM, version)` groups | **0** |
| Empty UOM | **0** |
| Zero/negative consumption | **0** |
| Source `scrap` populated | **0** (scrap lives on `GovernedBomLine`) |
| Source `status` | **4,936 ACTIVE** |
| `GovernedBomLine` rows | **51** (50 APPROVED, 1 UNDER_REVIEW) |
| Governed lines with `scrapPercentage` | **48** |
| `BomDuplicateObservation` | **81** (all unresolved / not APPROVED) |
| `AuditEvent` (CableBom / GovernedBomLine) | **396** |
| `ImportBatch` (`dataType=boms`) | **3** |

**Gate A (DATA): PASS** — referential integrity clean; volume consistent with production import.

---

## 3. Complete BOM authority inventory

| Location | Symbol / route | Classification | Notes |
|----------|----------------|----------------|-------|
| `masterDataRoutes` | `GET /api/master/boms` | **AUTHORITATIVE_PG** | JWT + `requireMasterReadAuth`; `listBoms()` |
| `masterDataRepository` | `listBoms()` | **AUTHORITATIVE_PG** | Merges governed scrap onto source lines for display |
| `masterDataRepository` | `persistImportTransaction` (`kind: boms`) | **AUTHORITATIVE_PG** | Upserts `CableBomLine` + `BomDuplicateObservation`; server `AuditEvent` |
| `masterDataRoutes` | `POST /api/master/imports/commit` | **AUTHORITATIVE_PG** | Import Center BOM commit |
| `masterDataApiService` | `fetchMasterBoms` | **AUTHORITATIVE_PG** | `GET /api/master/boms` |
| `masterDataApiService` | `loadAuthoritativeCableBoms` | **AUTHORITATIVE_PG** | PG-first; mirrors after success |
| `masterDataApiService` | `mirrorMasterDataToLocalStorage` (boms) | **NON_AUTHORITATIVE_MIRROR** | After PG success only |
| `masterDataApiService` | `localMasterSnapshots().boms` | **DEGRADED_READ** | Offline / unsigned-in fallback |
| `cableBomService` | `getStoredCableBoms` | **DEGRADED_READ** | LS mirror; falls back to `BOM_TEMPLATE_SAMPLE_ROWS` when empty |
| `cableBomService` | `saveCableBoms` | **NON_AUTHORITATIVE_MIRROR** | LS write + `cableBomsUpdated` event; **not** PG |
| `cableBomService` | `BOM_LOCAL_IS_AUTHORITATIVE` | **UI_STATE** | `false` (policy flag) |
| `cableBomService` | `energya_cable_boms_v3` | **NON_AUTHORITATIVE_MIRROR** | Class A governed mirror key |
| `ExcelBomUploadModal` | `handleApplyUpload` | **BLOCKED** | **LS-only** — explicit user message; no PG/API |
| `ExcelBomUploadModal` | cable validation | **DEGRADED_READ** | Uses `getStoredCableCatalog()` not PG catalog |
| `importPipelineService` | `commitBoms` (default stores) | **NON_AUTHORITATIVE_MIRROR** | Default `saveCableBoms` when no PG txn |
| `importPipelineService` | `commitBoms` via Import Center | **AUTHORITATIVE_PG** | `persistImportTransaction` after PG commit |
| `MasterDataImport` | `handleConfirm` / `confirmOfficial` | **AUTHORITATIVE_PG** | PG commit then LS mirror |
| `MasterDataHub` | `reload` → `fetchMasterBoms` | **AUTHORITATIVE_PG** | PG-first `resolveMasterListPreferringPostgres` |
| `TechnicalOffice` | initial load | **AUTHORITATIVE_PG** | `loadAuthoritativeCableBoms` |
| `TechnicalOffice` | `cableBomsUpdated` handler | **NON_AUTHORITATIVE_MIRROR** | Refreshes from LS event detail |
| `TechnicalOffice` | `ExcelBomUploadModal` onSuccess | **NON_AUTHORITATIVE_MIRROR** | `setBoms(getStoredCableBoms())` after LS write |
| `masterDataQualityService` | no snapshot | **DEGRADED_READ** | `getStoredCableBoms()` default |
| `governanceRepository` | `processBomGovernanceWorkflowAction` APPROVE | **AUTHORITATIVE_PG** | Creates/updates `GovernedBomLine`; does not mutate source |
| `masterDataRoutes` | `GET/POST /bom-conflicts*` | **AUTHORITATIVE_PG** | Governance queue + export |
| `costingOrchestrationService` | `buildCostingContext` | **AUTHORITATIVE_PG** | Reads `governedBomLine` + `cableBomLine` + conflicts from PG |
| `costingBomScrapRepository` | scrap CRUD | **AUTHORITATIVE_PG** | Updates `GovernedBomLine.scrapPercentage` + audit |
| `costingEngine` | `evaluateCostingReadiness` / `calculateMaterialCost` | **AUTHORITATIVE_PG** | Consumes in-memory context from PG orchestration |
| `TechnicalOfficeBomGovernanceQueue` | conflict actions | **AUTHORITATIVE_PG** | API-only |
| `bomGovernanceService` | constants / validation types | **UI_STATE** | Client helpers only |
| `bomDuplicateForensics` | `findConflictingBomWeightGroups` | **TEST_FIXTURE** / import helper | Used at import validation |
| `increment8.bom.test.ts` | governance tests | **TEST_FIXTURE** | Gate evidence |
| `increment13.bomScrap.test.ts` | scrap + costing BOM | **TEST_FIXTURE** | Gate evidence |
| `cableBomSotReadiness.test.ts` | registry assertions | **TEST_FIXTURE** | 04B-8 gate evidence |

---

## 4. BOM version/governance model

### Source layer (`CableBomLine`)

- **Version:** `bomVersion` (default **1**); uniqueness `@@unique([cableMaterialNumber, rawMaterialCode, bomVersion])`.
- **Status:** `RecordStatus` — all imported lines **ACTIVE**.
- **Immutability policy:** Import/governance **does not overwrite** conflicting weights; duplicates become `BomDuplicateObservation`.
- **Effective dates:** `effectiveFrom` / `effectiveTo` optional (mostly null in current data).

### Governed layer (`GovernedBomLine`)

- Created on **APPROVE** of a `BomDuplicateObservation` conflict (Technical Office Manager).
- Holds **authoritative consumption** for costing when present and `status=APPROVED`.
- **Scrap:** `scrapPercentage` on governed lines (48/51 populated); source `CableBomLine.scrap` unused.
- **Reopen:** marks governed line `UNDER_REVIEW`; costing blocks until re-approved.

### Approval chain

```
Import (CableBomLine) → duplicate detection → BomDuplicateObservation
  → ASSIGN / REVIEW / RESOLVE (TO investigator)
  → APPROVE (TO Manager) → GovernedBomLine (APPROVED)
```

### Consumption rules (costing / configurator)

1. **Engineering mapping** must be `APPROVED` (Gate 1).
2. **BOM conflicts** for cable must be `APPROVED` or absent (Gate 2).
3. **Effective BOM lines:** `governedBomLines` (APPROVED) if any exist; else `sourceBomLines` (`costingEngine.ts`).
4. **Scrap:** governed line scrap → else `CostingScrapRule` → else none (`costingOrchestrationService.ts`).

---

## 5. V1/V2 convergence assessment

| Surface | Read path | Converged? |
|---------|-----------|------------|
| Master Data Hub | `fetchMasterBoms` → PG | **Yes** |
| Technical Office (initial) | `loadAuthoritativeCableBoms` → PG | **Yes** |
| Import Center | PG commit + mirror | **Yes** |
| Costing orchestration | Server PG only | **Yes** |
| BOM governance queue (V2 TO) | `/api/master/bom-conflicts` | **Yes** |
| Excel BOM Method-B modal | LS write + LS catalog validation | **No — BLOCKER** |
| TO event refresh (`cableBomsUpdated`) | LS mirror | **Partial** (mirror sync after PG paths) |
| `masterDataQualityService` (no snapshot) | LS default | **Partial** (documented non-authoritative) |
| Configurator cable selection | Does not read BOM directly | **N/A** |

**Gate D: PARTIAL** — primary signed-in paths converge on PG; Excel Method-B and LS-default quality path remain divergent.

**LS defaults explicitly classified:**

| Call site | Default when PG omitted | Classification |
|-----------|-------------------------|----------------|
| `getStoredCableBoms()` | `BOM_TEMPLATE_SAMPLE_ROWS` | **DEGRADED_READ** |
| `loadAuthoritativeCableBoms` fallback | `getStoredCableBoms()` | **DEGRADED_READ** (`authoritative: false`) |
| `ExcelBomUploadModal` cable check | `getStoredCableCatalog()` | **DEGRADED_READ** (Cable Master now PG SoT) |

---

## 6. Excel/import assessment

| Path | Flow | Classification |
|------|------|----------------|
| **Import Center** (Master Data Import) | Excel → validate → `POST /imports/commit` → `persistImportTransaction` → PG `CableBomLine` + audit → LS mirror | **AUTHORITATIVE_PG** |
| **Official workbook loader** | Same Import Center PG txn for `Cable Materials` sheet | **AUTHORITATIVE_PG** |
| **Excel BOM Method-B** (`ExcelBomUploadModal`) | Excel → validate → `saveCableBoms` → LS only | **BLOCKED** (LS-only authoritative mutation) |
| **importPipelineService** in-memory preview | `persist: false` | **TEST_FIXTURE** / preview |
| Duplicate weight groups at import | Skipped → `BomDuplicateObservation` | **AUTHORITATIVE_PG** (no auto-resolve) |

**Gate C: FAIL** — Excel Method-B remains an LS-only write gap.

---

## 7. Costing V2 safety assessment (READ ONLY)

**BOM retrieval path (unchanged — not modified in 04B-8):**

```
costingOrchestrationService.buildCostingContext
  → prisma.governedBomLine (APPROVED)
  → prisma.cableBomLine (source fallback)
  → prisma.bomDuplicateObservation (gate blocking)
  → costingEngine (governed preferred)
```

**Verified behaviors:**

- Governed lines preferred over source (`costingEngine.ts` L218–220, L416–418).
- Unresolved conflicts block readiness (Gate 2).
- RM refs validated against `RawMaterial` (POSTGRESQL_SOT).
- Scrap from `GovernedBomLine.scrapPercentage` or scrap rules — **not** from source `CableBomLine.scrap` (always null in PG).
- Metal / Decision 5 logic **not touched**.

**Risks recorded (blockers for BOM SoT, not costing code changes):**

1. **81 unresolved BOM conflicts** — costing blocked for affected cables until governance APPROVE.
2. **Governed coverage gap** — only 51 governed lines vs 4,936 source lines; most cables rely on uncontested source BOM (acceptable when no conflict registered).
3. **Excel Method-B LS drift** — if operators use Method-B instead of Import Center, browser mirror can diverge from PG (costing still reads PG; UI/quality views may lie).

---

## 8. Gates A–J (independent verification)

| Gate | Result | Evidence |
|------|--------|----------|
| **A DATA** | **PASS** | §2 PostgreSQL counts; 0 orphans/dupes |
| **B READ** | **PARTIAL** | Hub/TO PG-first; `getStoredCableBoms` template fallback; quality/Excel modal LS defaults |
| **C WRITE** | **FAIL** | `ExcelBomUploadModal.handleApplyUpload` → `saveCableBoms` only |
| **D V1/V2** | **PARTIAL** | Costing/Hub/Import converged; Excel Method-B + LS event refresh diverge |
| **E LS** | **PASS** | `BOM_LOCAL_IS_AUTHORITATIVE=false`; mirror key classified |
| **F STALE** | **PASS** | `preferPostgresMasterData` / tests — empty PG beats LS |
| **G FAILURE** | **PASS** | PG failure → `authoritative: false` |
| **H SECURITY** | **PASS** | `GET /boms` + import + governance RBAC (`requireMasterReadAuth`, `assertCanWriteBomAndRawMaterials`, `assertCanApproveBomGovernance`) |
| **I AUDIT** | **PARTIAL** | Import PG + governance → `AuditEvent`; Excel Method-B → no server audit |
| **J REGRESSION** | **PASS** (BOM scope) | increment8/13 BOM tests green; `cableBomSotReadiness.test.ts` green; full suite **741/745** (see §11) |

**No promotion on partial/fail gates.**

---

## 9. LocalStorage paths

| Key / symbol | Class | Authority |
|--------------|-------|-----------|
| `energya_cable_boms_v3` | `A_GOVERNED` mirror | **NON_AUTHORITATIVE_MIRROR** |
| `saveCableBoms` | write helper | Mirror only; fires `cableBomsUpdated` |
| `getStoredCableBoms` empty fallback | `BOM_TEMPLATE_SAMPLE_ROWS` | **DEGRADED_READ** (demo template) |
| `BOM_LOCAL_IS_AUTHORITATIVE` | policy flag | `false` |

---

## 10. Security/audit evidence

**Security:**

- `GET /api/master/boms` — `requireMasterReadAuth` (JWT + master read RBAC).
- Import commit — `requireImportAuth`; customer users denied (`rbac.ts`).
- BOM governance — `assertCanInvestigateBomGovernance` / `assertCanApproveBomGovernance`; customer → 403.
- BOM scrap admin — `costingBomScrapRepository` + costing routes; customer denied (increment13 tests).

**Audit:**

- `persistImportTransaction` (`kind: boms`) → `AuditEvent` (`entity: CableBom`, `action: BOM_CHANGE`).
- Governance APPROVE → `GovernedBomLine` upsert + audit in `governanceRepository` / `increment8` tests.
- Scrap updates → `entity: GovernedBomLine` (`costingBomScrapRepository.appendBomScrapAudit`).
- Excel Method-B → **no** `AuditEvent` (client LS only).
- Client `importPipelineService.appendAudit` on in-memory commit → **LEGACY_TELEMETRY** (not authoritative).

---

## 11. Regression results

| Check | Result |
|-------|--------|
| BOM-focused tests | **PASS** — `increment8.bom.test.ts` (13/13), `increment13.bomScrap.test.ts` (8/8), BOM import tests 7/9/10 in `importPipelineService.test.ts` |
| `cableBomSotReadiness.test.ts` | **PASS** (6/6) |
| Full suite | **741 pass / 745 tests** (107 suites) — baseline was 665/97; growth from 04B test wiring |
| `tsc --noEmit` | **PASS** |
| `prisma validate` | **PASS** |
| `vite build` | **PASS** |

**Failures excluded from BOM cutover scope (not regressions introduced by 04B-8):**

| Suite | Failures | Cause |
|-------|----------|-------|
| `importPipelineService.test.ts` | 3 drum engineering column tests | **Drum WIP** (unrelated) |
| `increment12.inquiry` / session tests | 1+ | Inquiry/session persistence (unrelated) |

---

## 12. Exact blockers

1. **Gate C — Excel Method-B LS-only write** (`ExcelBomUploadModal.handleApplyUpload` → `saveCableBoms`; no `persistCableBomsViaApi` equivalent).
2. **Gate D — Excel modal validates cables against LS catalog** (`getStoredCableCatalog`) while Cable Master is `POSTGRESQL_SOT`.
3. **Gate I — Method-B writes lack server audit** — governance/compliance gap.
4. **81 unresolved `BomDuplicateObservation` groups** — data/governance debt (costing blocked per cable until resolved).
5. **Policy — `cutoverPhase: LS_NON_AUTHORITATIVE`** — requires remediation + `CUTOVER_READY` before promotion.

---

## 13. Files changed (04B-8)

| File | Action |
|------|--------|
| `docs/v2/27_CABLE_BOM_SOT_READINESS.md` | **Created** — this assessment |
| `src/platform/cableBomSotReadiness.test.ts` | **Created** — gate evidence tests |
| `docs/v2/README.md` | **Updated** — index entry for 04B-8 |

**Explicit non-actions:** No registry promotion; no `costingEngine` changes; no Cable Master / RM / Drum / fulfillment changes.

---

## 14. Commit hash

*(filled after commit)*

---

## 15. Promotion decision

```
CABLE BOM = POSTGRESQL_PRIMARY — CUTOVER BLOCKED
```

```text
sotStatusForEntity('CableBomLine'):
  status: POSTGRESQL_PRIMARY
  postgresSoT: false
  cutoverPhase: LS_NON_AUTHORITATIVE
  canPromoteToPostgresqlSot: false
```

**Required before retry:** Route Excel Method-B through PG API (mirror after success); align Excel cable validation with `loadAuthoritativeCableCatalog`; re-run gates A–J; set `cutoverPhase: CUTOVER_READY` only when all pass.

---

## 16. Engineering semantics (distinction)

| Concept | Entity / layer | Role |
|---------|----------------|------|
| **Cable Master identity** | `CableMaster` (`POSTGRESQL_SOT`) | Material number, description, commercial attributes |
| **Engineering mapping** | `CableEngineeringMapping` (`POSTGRESQL_SOT`) | Family/voltage/cores — Gate 1 for costing |
| **BOM structure** | `CableBomLine` (`POSTGRESQL_PRIMARY`) | Imported consumption per RM; immutable on conflict |
| **BOM approval** | `GovernedBomLine` + `BomDuplicateObservation` | Business decision on conflicting weights |
| **Costing consumption** | `costingEngine` context | Governed APPROVED → else source; scrap from governed/rules |

---

## 17. Related docs

- [20 cutover framework](./20_MASTER_DATA_SOT_CUTOVER_FRAMEWORK.md)
- [26 Cable Master cutover](./26_CABLE_MASTER_SOT_CUTOVER.md) (prerequisite — **ACCEPTED**)
- [BOM_AUTHORITY_MODEL.md](../BOM_AUTHORITY_MODEL.md)
- [BOM_GOVERNANCE_WORKBENCH.md](../BOM_GOVERNANCE_WORKBENCH.md)
- [KNOWN_LIMITATIONS.md](../KNOWN_LIMITATIONS.md)
