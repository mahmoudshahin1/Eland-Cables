# 24 — Cable Master SoT Readiness (Task 04B-5)

**Date:** 2026-09-04  
**Status:** **CUTOVER BLOCKED** — `CableMaster` remains `POSTGRESQL_PRIMARY`  
**Frozen 04A:** `57caf852067fea4b29efdfd4d73733499a0ba4f0`  
**Frozen 04B-1:** `fb03a3c8ccc2d339f021aac1950ec06959305d2e`  
**Frozen 04B-2:** `611c083754a616d4991f86dd27036583ae129e43`  
**Frozen 04B-3:** `34b76450f2e8ab325ef73ffde6d18271bbb92ff2`  
**Frozen 04B-4:** `397a2d90`  
**Machine-readable:** `src/platform/masterDataSoT.ts` (`CableMaster` row + matrix)  
**Tests:** `src/platform/cableSotReadiness.test.ts`  
**Related:** [20 framework](./20_MASTER_DATA_SOT_CUTOVER_FRAMEWORK.md) · [18 inventory](./18_MASTER_DATA_PERSISTENCE_INVENTORY.md)

---

## 1. Decision

**CABLE MASTER = POSTGRESQL_PRIMARY — CUTOVER BLOCKED**

Promotion to `POSTGRESQL_SOT` is **not** executed. Gate **C (WRITE)** fails: Excel Method-B and TCR publish paths still perform **localStorage-only** cable master mutations without a PostgreSQL transaction.

---

## 2. Objective

Evaluate Cable Master only for `POSTGRESQL_PRIMARY` → `POSTGRESQL_SOT` per gates A–J. BOM, Drum, Cable Parameters, TCR, and Import entity promotion remain out of scope.

---

## 3. Discovery — authoritative read paths (Gate B evidence)

| Consumer | Path | Authority |
|----------|------|-----------|
| Master Data Hub | `fetchMasterCables` → `resolveMasterListPreferringPostgres` | PostgreSQL wins (empty PG beats stale LS) |
| Import Center commit UI | `POST /api/master/imports/commit` → read-back via Hub | PostgreSQL |
| `loadAuthoritativeCableCatalog` | `GET /api/master/cables` + mirror | PostgreSQL |
| `CableSearchSelectModal` | `GET /api/master/cables?…` (paginated) | PostgreSQL; LS fallback `authoritative: false` |
| `CableConfiguratorV2` | `loadAuthoritativeCableCatalog` + `POST /api/cables/evaluate` | PostgreSQL server evaluate |
| `SmartConfigurator` (V1) | `loadAuthoritativeCableCatalog` when signed in | PostgreSQL when API ok |
| `cableAuthorityRoutes` | `searchCables`, `evaluatePersistedCable` | PostgreSQL |
| Costing / commercial | `prisma.cableMaster` via repositories | PostgreSQL |

**Residual non-authoritative LS reads (Gate B partial):**

| Consumer | Default when catalog not passed | Risk |
|----------|------------------------------|------|
| `cableSelectionEngineV2.getAllMasterRecordsV2` | `getStoredCableCatalog()` | Cascading filter may use stale LS offline |
| `cableSelectionService.getAllParsedCables` | `getStoredCableCatalog()` | V1 selection offline path |
| `masterDataQualityService` | LS when no snapshot | KPIs non-authoritative without Hub load |
| `ErpCustomerRequestView` | `MASTER_CABLE_CATALOG` fixture | Demo/mock only |
| `TechnicalOffice.tsx` event handler | `getStoredCableCatalog()` on `cableCatalogUpdated` | Mirror refresh only |

Configurator **existence** (`EXISTING_CABLE`) is server-side via PostgreSQL — not LS-declared.

---

## 4. Discovery — write paths (Gate C evidence)

| Path | PostgreSQL | LS mirror | Authoritative? |
|------|------------|-----------|----------------|
| `POST /api/master/cables` | Yes (`createCable` + `writeAudit`) | Optional via Hub reload | **Yes** |
| `PUT /api/master/cables/:materialNumber` | Yes (`updateCable` + `writeAudit`) | Optional mirror | **Yes** |
| `POST /api/master/imports/commit` (cables) | Yes (`persistImportTransaction`) | After PG success only | **Yes** |
| `MasterDataImport.handleConfirm` | PG commit required; LS after success | Mirror | **Yes** |
| **`ExcelCableUploadModal.handleApplyUpload`** | **No** | `saveCableCatalog` only | **BLOCKER** |
| **`technicalOfficeServiceV2.importValidRowsToCableMaster`** | **No** | `saveCableCatalog` only | **BLOCKER** |
| **`technicalOfficeServiceV2.approveAndPublishNewCableToMaster`** | **No** | `saveCableCatalog` only | **BLOCKER** |
| `cableBomService` catalog touch-up | **No** | `saveCableCatalog` on BOM import side-effect | Mirror side-effect |

`ExcelCableUploadModal` already warns: *"browser mirror only … use Import Center for SoT writes"* — ambiguity remains because the UI still mutates LS as if it were a catalog.

---

## 5. Data model — `CableMaster` (Prisma)

**Identity / commercial (import-complete):** `materialNumber` (unique), `itemCode`, `customerCode`, `description`, `diameter`, `weight`, `status`, `approvalStatus`, `fulfillmentPolicy`, `sourceBatch`, timestamps.

**Engineering / configurator (often null until mapping):** `family`, `voltage`, `conductor`, `conductorSize`, `cores`, `insulation`, `screen`, `armour`, `sheath`, `sheathColour`, `coreColour`, `standard`, `specialAdditives`.

**Governed engineering approval** may also live on `CableEngineeringMapping` (already `POSTGRESQL_SOT`) — distinct from bare `CableMaster` row completeness.

---

## 6. PostgreSQL data evidence (Gate A)

Local demo DB, 2026-09-04:

| Metric | Value |
|--------|-------|
| Total `CableMaster` rows | **435** |
| ACTIVE / INACTIVE | 435 / 0 |
| Duplicate `materialNumber` (case-insensitive) | **0** |
| Engineering-complete (family+voltage+conductor+size+cores+insulation) | **15** |
| Engineering-incomplete | **420** |
| Server `AuditEvent` entity=CableMaster | **1621** |

**Gate A verdict:** **PASS** for governed identity dataset (rows exist, unique keys, audit trail). Engineering attribute completeness is **low** (expected — mapping workflow separate) but does not block identity/search SoT. Configurator structured `EXISTING_CABLE` matching correctly returns `CONFIGURATION_REQUIRED` when identity exists without approved engineering fields (`cableAuthority.ts`).

---

## 7. Gates A–J summary

| Gate | Result | Evidence |
|------|--------|----------|
| **A DATA** | **PASS** | 435 rows; unique materialNumber; audit linked |
| **B READ** | **PARTIAL** | Hub/V2/configurator/search/evaluate use PG; residual LS-default engines |
| **C WRITE** | **FAIL** | Excel Method-B + TCR publish = LS-only authoritative writes |
| **D V1/V2** | **PARTIAL** | Shared PG APIs; V1 selection engine LS-default diverges |
| **E LS** | **PASS** | `CABLE_CATALOG_LOCAL_IS_AUTHORITATIVE=false`; key = mirror |
| **F STALE** | **PASS** | `preferPostgresMasterData` / tests |
| **G FAILURE** | **PASS** | PG fail → `authoritative: false` |
| **H SECURITY** | **PASS** | `GET /api/master/cables` requires sign-in; writes `assertCanWriteCableMaster`; customers 403 |
| **I AUDIT** | **PASS** | `writeAudit` on PG create/update/import commit |
| **J REGRESSION** | **PASS** (cable scope) | `cableSotReadiness.test.ts`, `masterDataSoT.test.ts`, `cableAuthority.test.ts`; full suite 642/645 pass (3 drum WIP failures unrelated) |

`canPromoteToPostgresqlSot(CableMaster)` → **false** (gate C + not `CUTOVER_READY`).

---

## 8. Excel Method-B — HARD STOP

| Surface | File | Behavior |
|---------|------|----------|
| Technical Office tab — Bulk Excel Pre-Import | `TechnicalOfficeExcelPreImport.tsx` → `importValidRowsToCableMaster` | LS write only |
| Legacy Excel upload modal | `ExcelCableUploadModal.tsx` | LS write only; user message admits non-PG |

**No minimal fix applied in 04B-5** — routing Method-B through `POST /api/master/cables` or Import commit would touch the Excel engine / TO workflow (out of scope without explicit redesign). **Gate C remains FAIL.**

---

## 9. Configurator safety classification

| Class | Consumers | Fields | LS-only risk |
|-------|-----------|--------|--------------|
| **IDENTITY / SEARCH** | `CableSearchSelectModal`, Hub grid, commercial line pick | materialNumber, itemCode, customerCode, description, diameter, weight | Low when PG up |
| **ENGINEERING CONFIGURATION** | `CableConfiguratorV2`, `POST /api/cables/evaluate`, cascading V2 engine | family, voltage, conductor, size, cores, insulation, screen, armour, sheath | Evaluate uses **PG**; cascading filters use PG catalog when `loadAuthoritativeCableCatalog` succeeds |
| **OFFLINE / DEGRADED** | `getAllMasterRecordsV2()` without catalog arg | Parsed LS catalog | **BLOCKS full SoT** — partial cutover unacceptable |

**Partial cutover (PG search + LS configurator authority) is NOT acceptable** per task spec. Residual LS-default paths must be eliminated or hard-disabled before promotion.

---

## 10. Required remediation (before 04B-5 retry)

1. **Gate C:** Route Excel Method-B and TCR `approveAndPublishNewCableToMaster` through `POST/PUT /api/master/cables` (or Import commit), LS mirror only after PG success.
2. **Gate B/D:** Pass explicit PG catalog into `cableSelectionEngineV2` / `cableSelectionService`; remove LS-default for signed-in sessions.
3. **Optional clarity:** Throw or block `saveCableCatalog` when called outside `mirrorMasterDataToLocalStorage` (pattern: `deactivateRawMaterial` after 04B-2).
4. Re-run gates A–J; update registry to `POSTGRESQL_SOT` only when `canPromoteToPostgresqlSot` is true.

---

## 11. Explicit non-actions (04B-5)

- No `POSTGRESQL_SOT` promotion in registry  
- No BOM / Drum / Params / TCR cutover  
- No Costing Option B / Decision 5 changes  
- No engineering data invention or cable code normalization  
- No localStorage key deletion  
- Task 04B-6 **not started**

---

## 13. Task 04B-6 remediation (2026-09-04)

**Status unchanged:** `POSTGRESQL_PRIMARY` — **not promoted** to `POSTGRESQL_SOT`.

| Blocker (04B-5) | 04B-6 fix |
|-----------------|-----------|
| Excel Method-B LS-only (`ExcelCableUploadModal`, `importValidRowsToCableMaster`) | `persistCableCatalogRowsViaApi` → POST/PUT `/api/master/cables`; LS mirror via `mirrorAfterPgSuccess` only |
| TCR publish LS-only (`approveAndPublishNewCableToMaster`) | `createCableViaApi` → POST `/api/master/cables` + server audit |
| `saveCableCatalog()` ambiguous writes | Throws unless `{ mirrorAfterPgSuccess: true }`; caller inventory in `cableCatalogService.ts` |
| Selection engines LS-default | `resolveAllParsedCables` / `resolveAllMasterRecordsV2` (PG-first); offline fallbacks report `authoritative: false` |

**Gate C:** PASS (remediated). **Formal SoT reassessment:** next task — `cutoverReady` remains false.

**Tests:** `src/platform/cablePersistenceRemediation.test.ts`

---

## 15. Task 04B-7 formal reassessment (2026-09-04)

**Status unchanged:** `POSTGRESQL_PRIMARY` — **not promoted** to `POSTGRESQL_SOT`.

See **[25_CABLE_MASTER_SOT_READINESS.md](./25_CABLE_MASTER_SOT_READINESS.md)** for independent gates A–J verification.

| Gate | 04B-7 result |
|------|--------------|
| C WRITE | **PASS** (04B-6 remediation confirmed) |
| B READ | **FAIL** — V1 `SmartConfigurator` / `CableConfiguratorModal` cascading filters LS-default |
| D V1/V2 | **FAIL** — V2 uses PG catalog; V1 does not inject PG into `evaluateDynamicFilterOptions` |
| Others | **PASS** (cable scope) |

`canPromoteToPostgresqlSot(CableMaster)` → **false**.

---

## 14. Related docs updated (04B-5)

- [18 inventory](./18_MASTER_DATA_PERSISTENCE_INVENTORY.md) — Cable Master readiness note  
- [20 framework](./20_MASTER_DATA_SOT_CUTOVER_FRAMEWORK.md) — 04B-5 blocked status  
- [README](./README.md) — doc 24 index  
- [10 roadmap](./10_V2_IMPLEMENTATION_ROADMAP.md) — Phase 2 progress note
