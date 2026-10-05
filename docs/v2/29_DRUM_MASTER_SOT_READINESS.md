# 29 — Drum Master SoT Readiness (Task 04B-10)

**Date:** 2026-09-04  
**Status:** **CUTOVER BLOCKED** — `DrumMaster` remains `POSTGRESQL_PRIMARY`  
**Frozen baselines:** 04A `57caf85` · 04B-1 `fb03a3c` · 04B-7 Cable Master `ac9c373` · 04B-9 Cable BOM remediation `70ae5ec`  
**Tests:** `src/platform/drumMasterSotReadiness.test.ts` · drum domain suites (see §16)

---

## 1. Current Drum Master authority

| Entity | Registry status | `postgresSoT` | `cutoverPhase` | Decision |
|--------|-----------------|---------------|----------------|----------|
| **DrumMaster** | `POSTGRESQL_PRIMARY` | `false` | `PG_WRITE_READY` | **DO NOT PROMOTE** |
| **DrumCompatibility** | `BLOCKED` | `false` | `BLOCKED` | **REMAIN BLOCKED** — do not fabricate |

**Promotion decision:** `canPromoteToPostgresqlSot(DrumMaster)` → **false** (`cutoverPhase !== CUTOVER_READY`; Gate **C** fails; `DrumCompatibility` unresolved).

**Frozen engineering decision (documented, not changed):**

- Clearance = **50 mm** (TO default when blank/absent)
- MaxLoad = **Drum Capacity** (permitted cable payload kg; `maxWeight` column)
- Capacity authoritative for suitability (via MaxLoad mapping)
- Empty drum net weight **not** a suitability blocker — logistics only

---

## 2. PostgreSQL data evidence

Queried live PostgreSQL 2026-09-04 (`scripts/_tmp_drum_sot_readiness_query.ts` — ephemeral probe, not committed):

| Metric | Value |
|--------|-------|
| `DrumMaster` rows | **108** |
| ACTIVE | **107** |
| INACTIVE | **1** |
| Duplicate `drumCode` | **0** |
| Missing flange / barrel / inner / outer / capacity | **0** each |
| Inner Width > Outer Width | **0** |
| Barrel ≥ Flange | **0** |
| `clearanceMm` populated | **107** (all ACTIVE) |
| `clearanceMm = 50` | **107** |
| `maxWeight` populated (>0) | **107** |
| `maxWeight = capacity` | **107** |
| `maxWeight ≠ capacity` overrides | **0** |
| `emptyDrumNetWeightKg` populated | **0** |
| `DrumCompatibility` rows | **0** |
| `ImportBatch` (`dataType=drums`) | **4** |
| `AuditEvent` (`entity=DrumMaster`) | **5** |

### Data quality vs authority readiness

| Layer | Assessment |
|-------|------------|
| **DATA QUALITY** | **PASS** — referential integrity clean; core dimensions present; engineering fields normalized on existing PG rows (post-import script evidence) |
| **AUTHORITY READINESS** | **BLOCKED** — import pipeline does not persist engineering columns; no full CRUD API; `DrumCompatibility` empty; LS write/degraded paths remain |

**Implementation difference (documented):** Official `Drum List.xlsx` has no Clearance/MaxLoad/Empty Weight columns. PG rows show normalized engineering (clearance 50, MaxLoad=Capacity) — consistent with `scripts/normalizeDrumEngineeringFromCapacity.ts` one-shot normalization, **not** with `commitDrums()` import mapping. Fresh re-import via Import Center would **not** auto-apply TO rules.

---

## 3. Complete Drum Master authority inventory

| Location | Symbol / route | Classification | Notes |
|----------|----------------|----------------|-------|
| `masterDataRoutes` | `GET /api/master/drums` | **AUTHORITATIVE_PG** | JWT + `requireMasterReadAuth`; `listDrums()` |
| `masterDataRepository` | `listDrums()` | **AUTHORITATIVE_PG** | `prisma.drumMaster.findMany` → `drumFromRow` |
| `masterDataRepository` | `persistImportTransaction` (`kind: drums`) | **AUTHORITATIVE_PG** | Upsert `DrumMaster` + `ImportBatch` + server `AuditEvent` |
| `masterDataCutoverRoutes` | `PUT /api/master/drums/:drumCode` | **AUTHORITATIVE_PG** | Status ACTIVE/INACTIVE only; `updateDrumStatus` + audit |
| `masterDataRoutes` | `POST /api/master/drums/candidates` | **AUTHORITATIVE_PG** (compute) | Reads `listDrums()`; does not mutate master |
| `masterDataRoutes` | `POST /api/master/drums/optimize` | **AUTHORITATIVE_PG** (compute) | Same |
| `masterDataRoutes` | `POST /api/master/drums/validate` | **AUTHORITATIVE_PG** (compute) | Same |
| `masterDataRoutes` | `POST /api/master/drums/capacity` | **AUTHORITATIVE_PG** (compute) | `drumCapacityCalculator` |
| `masterDataRoutes` | `POST /api/master/imports/commit` (drums) | **AUTHORITATIVE_PG** | Import Center PG txn |
| `masterDataApiService` | `fetchMasterDrums` | **AUTHORITATIVE_PG** | `GET /api/master/drums` |
| `masterDataApiService` | `loadAuthoritativeDrums` | **AUTHORITATIVE_PG** | PG-first; mirrors after success |
| `masterDataApiService` | `mirrorMasterDataToLocalStorage` (drums) | **NON_AUTHORITATIVE_MIRROR** | After PG success only |
| `masterDataApiService` | `deactivateDrumViaApi` / `setDrumStatusViaApi` | **AUTHORITATIVE_PG** | `PUT /api/master/drums/:code` |
| `masterDataApiService` | `localMasterSnapshots().drums` | **DEGRADED_READ** | Offline / unsigned-in fallback |
| `drumMasterService` | `getStoredDrumMaster` | **DEGRADED_READ** | LS mirror |
| `drumMasterService` | `saveDrumMaster` | **NON_AUTHORITATIVE_MIRROR** | LS write + `drumMasterUpdated` event |
| `drumMasterService` | `deactivateDrum` | **LS_ONLY_WRITE** | **Orphan** — Hub uses API path instead |
| `drumMasterService` | `DRUM_MASTER_LOCAL_IS_AUTHORITATIVE` | **UI_STATE** | `false` |
| `drumMasterService` | `energya_drum_master_v1` | **NON_AUTHORITATIVE_MIRROR** | Class A governed mirror key |
| `DrumMasterSelect` / `useDrumMasterList` | fetch `/api/master/drums` | **AUTHORITATIVE_PG** | Empty PG wins; LS fallback on failure |
| `MasterDataHub` | `reload` → `fetchMasterDrums` | **AUTHORITATIVE_PG** | PG-first `resolveMasterListPreferringPostgres` |
| `MasterDataHub` | `onDeactivateDrum` | **AUTHORITATIVE_PG** | `deactivateDrumViaApi` |
| `MasterDataImport` | `handleConfirm` / official load | **AUTHORITATIVE_PG** | PG commit then LS mirror |
| `importPipelineService` | `commitDrums` (default stores) | **NON_AUTHORITATIVE_MIRROR** | Default `saveDrumMaster` when no PG txn |
| `importPipelineService` | `commitDrums` via Import Center | **AUTHORITATIVE_PG** | `persistImportTransaction` after PG commit |
| `DrumDetailsModal` | `ewdMaster` useMemo | **DEGRADED_READ** | `getStoredDrumMaster()` — LS default |
| `masterDataQualityService` | no snapshot | **DEGRADED_READ** | `getStoredDrumMaster()` default |
| `drumSelectionService` | `selectDrum` | **COMPUTE_OVER_INPUT** | Caller supplies drum list; no hidden authority |
| `drumOptimizationService` | capacity / optimize | **COMPUTE_OVER_INPUT** | Pure domain; PG via API routes |
| `drumOptimizationApiService` | POST drum APIs | **AUTHORITATIVE_PG** (compute client) | JWT to server |
| `CommercialInquiryDetail` | `useDrumMasterList` | **AUTHORITATIVE_PG** | PG fetch hook |
| `InquiryMultiDrumCuttingModal` | `useDrumMasterList` | **AUTHORITATIVE_PG** | PG fetch hook |
| `ContainerAndDrumOptimizerModal` | `useDrumMasterList` | **AUTHORITATIVE_PG** | PG fetch hook |
| `CableSearchSelectModal` | `useDrumMasterList` | **AUTHORITATIVE_PG** | PG fetch hook |
| `CostingConfigurationDashboard` | `useDrumMasterList` | **AUTHORITATIVE_PG** | PG fetch hook |
| `costingAdminRoutes` | readiness snapshot | **AUTHORITATIVE_PG** | `listDrums()` server-side |
| `DrumOptimizer` (customer) | optimization API | **AUTHORITATIVE_PG** (compute) | Does not write master |
| `engineeringMasterService` | ownership metadata | **DOCUMENT_ONLY** | Module IA registry |
| `drumMasterSotReadiness.test.ts` | registry assertions | **TEST_FIXTURE** | 04B-10 gate evidence |

---

## 4. Drum business semantics (frozen decision)

| Field | PG column | Business meaning | Suitability | Frozen rule |
|-------|-----------|------------------|-------------|-------------|
| Drum Code | `drumCode` | Natural key | Identity | Required unique |
| Flange / Barrel / Inner / Outer | `flange`, `barrel`, `innerWidth`, `outerWidth` | Geometry (source units) | Required for capacity calc | Validate barrel < flange; inner ≤ outer |
| Capacity | `capacity` | Source workbook reference (kg in TO model) | Indirect — maps to MaxLoad | Authoritative for MaxLoad when blank |
| Clearance | `clearanceMm` | Flange clearance (mm) | Required when cable Ø ≤ 50 mm | **Default 50** when blank |
| MaxLoad | `maxWeight` | Permitted **cable payload** kg | Required for load-limited suitability | **= Capacity** when blank |
| Empty weight | `emptyDrumNetWeightKg` | Drum tare (kg) | **Never blocks** suitability | Logistics warning only |
| drumType / usableWidth | optional | CONFIGURATION_REQUIRED | Not in source Excel | Do not invent |
| capacityUom | `CONFIGURATION_REQUIRED` | UOM not in source file | Display only | Do not assume metres |
| status | ACTIVE / INACTIVE | Master lifecycle | Inactive excluded from selection | PG status via PUT |

**Engine path:** `drumCapacityCalculator` uses geometry + `clearanceMm` + `maxLoadKg` (from `maxWeight`). Capacity column alone does **not** satisfy MaxLoad until mapped.

---

## 5. Drum Master vs DrumCompatibility

| Aspect | DrumMaster | DrumCompatibility |
|--------|------------|-------------------|
| Registry | `POSTGRESQL_PRIMARY` | `BLOCKED` |
| PG rows | 108 | **0** |
| Purpose | Physical drum geometry + capacity engineering | Cable-family → drum ranking rules |
| Import kind | `drums` (Import Center) | **None** — do not fabricate |
| Code usage | `drumSelectionService`, optimization APIs | Warning only in `COMPATIBILITY_WARNING` constant |
| Promotion dependency | Cutover blocked until compat resolved or formally scoped out | **REMAIN BLOCKED** |

`drumSelectionService` explicitly states: *"DrumCompatibility has no approved source rows… ranking uses the native capacity engine only."* Optimization must not become a hidden Drum Master authority — it reads PG via `listDrums()` and computes; it does not upsert master rows.

---

## 6. V1/V2 convergence assessment

| Surface | Read path | Converged? |
|---------|-----------|------------|
| Master Data Hub (drums tab) | `fetchMasterDrums` → PG | **Yes** |
| Import Center (drums) | PG commit + mirror | **Yes** |
| `useDrumMasterList` / inquiry / costing UI | `GET /api/master/drums` | **Yes** |
| Drum optimization APIs | Server `listDrums()` | **Yes** |
| `loadAuthoritativeQualitySnapshot` | PG drums leg | **Yes** (when signed in) |
| `DrumDetailsModal` EWD reference panel | `getStoredDrumMaster()` | **No — LS default** |
| `masterDataQualityService` (no snapshot) | `getStoredDrumMaster()` | **Partial** (documented non-authoritative) |
| `DrumMasterSelect` catch fallback | LS when PG fetch fails | **Partial** (degraded only) |

**Gate D: PARTIAL** — primary signed-in paths converge on PG; quotation Drum Details modal and quality default path remain LS-backed.

**LS defaults explicitly classified:**

| Call site | Default when PG omitted | Classification |
|-----------|-------------------------|----------------|
| `getStoredDrumMaster()` | `[]` | **DEGRADED_READ** |
| `DrumDetailsModal` | `getStoredDrumMaster()` | **DEGRADED_READ** (stale risk if mirror not refreshed) |
| `useDrumMasterList` catch | LS active drums | **DEGRADED_READ** (`authoritative: false`) |

---

## 7. Write authority trace

| Operation | Path | Authority |
|-----------|------|-----------|
| Import drums (Import Center, signed in) | `POST /imports/commit` → `persistImportTransaction` | **AUTHORITATIVE_PG** + audit |
| Import drums (in-memory / tests) | `commitDrums` → `saveDrumMaster` | **NON_AUTHORITATIVE_MIRROR** |
| Deactivate drum (Hub) | `PUT /api/master/drums/:code` | **AUTHORITATIVE_PG** + audit |
| Deactivate drum (orphan) | `deactivateDrum()` → LS only | **LS_ONLY_WRITE** (unused by Hub) |
| Create drum | — | **NOT IMPLEMENTED** (no POST API) |
| Update dimensions / engineering | — | **NOT IMPLEMENTED** (no PUT body beyond status) |
| LS mirror after PG success | `mirrorMasterDataToLocalStorage` | **NON_AUTHORITATIVE_MIRROR** |

**Gate C: FAIL/PARTIAL** — status writes and Import Center PG path exist; engineering column import mapping, create, and dimension update APIs missing; orphan LS deactivate remains.

---

## 8. Excel/import assessment

| Path | Flow | Classification |
|------|------|----------------|
| **Import Center** (Master Data Import) | Excel → validate → `POST /imports/commit` → `persistImportTransaction` → PG `DrumMaster` + audit → LS mirror | **AUTHORITATIVE_PG** |
| **Official workbook** (`Drum List.xlsx`) | Same Import Center PG txn | **AUTHORITATIVE_PG** |
| **Template columns** (Clearance, Max Load, Empty weight) | Declared in `DRUM_TEMPLATE_HEADERS` | **NOT PARSED** by `commitDrums()` — **GAP** |
| **TO normalization** | `normalizeDrumEngineeringFromCapacity.ts` | **ONE-SHOT SCRIPT** — not in import path |
| **importPipelineService** in-memory preview | `persist: false` | **TEST_FIXTURE** / preview |

**Blocker:** `commitDrums()` reads only Drum Code + five dimension numerics + optional Description. It does **not** map Capacity → MaxLoad or default Clearance 50 on import (3 failing tests in `importPipelineService.test.ts` document expected TO behavior).

---

## 9. Drum Selection/Optimization safety (READ ONLY)

**Data retrieval path (unchanged — not modified in 04B-10):**

```
Client UI → POST /api/master/drums/{candidates|optimize|validate}
  → listDrums() (PostgreSQL)
  → drumOptimizationService / drumCapacityCalculator
```

**Verified behaviors:**

- Optimization reads drums from PG at request time — does not cache as master authority.
- `maxWeight` (MaxLoad) required for full suitability; Capacity alone → `INCOMPLETE_ENGINEERING_DATA`.
- `clearanceMm` required when cable Ø ≤ 50 mm.
- `emptyDrumNetWeightKg` missing → warning only; never rejects technical suitability.
- `DrumCompatibility` not consulted for ranking (native engine only).
- Costing V2 / Decision 5 **not touched**.

**Risks recorded (blockers for Drum SoT, not optimization rule changes):**

1. **Import engineering gap** — re-import without normalization script leaves drums incomplete for optimization.
2. **DrumDetailsModal LS path** — inquiry EWD reference may show stale mirror vs PG optimization results.
3. **DrumCompatibility empty** — no cable-family drum tables; automatic selection uses geometry engine only.

---

## 10. Cable Master / BOM dependencies

| Dependency | Relationship |
|------------|--------------|
| **CableMaster** (`POSTGRESQL_SOT`) | Provides `outerDiameterMm`, `approxWeightKgKm` for optimization input — **read-only consumer** |
| **CableBomLine** | No direct drum FK; no BOM line references drum code |
| **Inquiry lines** | Store `drumType` (prototype) + optional `drumMasterCode` on schedule rows |
| **Costing** | Drum type optional on packing preview; governed drum master referenced in admin rules — does not mutate `DrumMaster` |

Drum Master cutover does not require Cable BOM promotion. Cable Master SoT is already accepted (04B-7).

---

## 11. Stale data policy

| Policy | Evidence |
|--------|----------|
| Successful PG read wins (including empty array) | `preferPostgresMasterData`, `resolveDrumListForSelect`, `useDrumMasterList` |
| LS mirror refreshed after PG success | `loadAuthoritativeDrums` → `mirrorMasterDataToLocalStorage` |
| Stale LS cannot override PG | `drumMasterSotReadiness.test.ts` gates F/G |

**Residual risk:** `DrumDetailsModal` reads LS directly without PG refresh — stale mirror possible if user never hits Hub reload after import.

---

## 12. Security evidence

| Route / action | Control |
|----------------|---------|
| `GET /api/master/drums` | `requireMasterReadAuth` (JWT + master read RBAC) |
| `PUT /api/master/drums/:code` | `assertCanWriteCableMaster` |
| Drum compute APIs | `requireDrumComputeAuth` |
| Import commit | `requireImportAuth`; customer users denied |
| Customer `DrumOptimizer` | Uses same authenticated compute APIs — read/compute only |

**Gate H: PASS**

---

## 13. Audit evidence

| Event | Path | Classification |
|-------|------|----------------|
| Import commit (drums) | `persistImportTransaction` → `writeAudit` + `AuditEvent` | **AUTHORITATIVE_SERVER_AUDIT** |
| Status change | `updateDrumStatus` → `appendAudit` + `AuditEvent` | **AUTHORITATIVE_SERVER_AUDIT** |
| In-memory `commitDrums` | `importPipelineService.appendAudit` | **LEGACY_TELEMETRY** (not authoritative) |
| Optimization compute | No master mutation | N/A |

PG shows **5** `AuditEvent` rows for `DrumMaster` (imports + status changes).

**Gate I: PARTIAL** — PG import and status audited; in-memory import path emits legacy telemetry only; no audit on dimension/engineering updates (no API).

---

## 14. LocalStorage policy (`energya_drum_master_v1`)

| Item | Value |
|------|-------|
| Key | `energya_drum_master_v1` |
| Class | `A_GOVERNED` |
| Authority | **NON_AUTHORITATIVE_MIRROR** |
| `DRUM_MASTER_LOCAL_IS_AUTHORITATIVE` | `false` |
| Retain on cutover | **Yes** — do not delete browser data |
| Write triggers | PG mirror success; in-memory import tests; orphan `saveDrumMaster` callers |
| Event | `drumMasterUpdated` — UI refresh hint, not SoT |

**Gate E: PASS**

---

## 15. Governance / data quality

| Check | Result |
|-------|--------|
| Duplicate drum codes | **0** |
| Invalid geometry rules | **0** |
| Engineering normalization on PG | **107/107 ACTIVE** with clearance 50 + MaxLoad=Capacity |
| `DrumCompatibility` governance | **BLOCKED** — 0 rows; do not invent |
| `capacityUom` | All `CONFIGURATION_REQUIRED` (honest) |
| Official source vs PG count | Workbook **103** unique; PG **108** (includes test/import additions — not reconciled in this task) |
| Orphan FK refs | N/A — no child tables reference `DrumMaster` |

**Governance debt:** Import pipeline does not enforce TO engineering mapping on write; count drift vs source workbook not remediated (discovery only).

---

## 16. Gates A–J (independent verification)

| Gate | Result | Evidence |
|------|--------|----------|
| **A DATA** | **PASS** | §2 — 108 rows; 0 dupes; dimensions valid; engineering normalized on PG |
| **B READ** | **PARTIAL** | Hub/select/optimization PG; `DrumDetailsModal` + quality LS defaults |
| **C WRITE** | **FAIL** | No create/update-dimensions API; `commitDrums` skips engineering columns; orphan `deactivateDrum` LS path |
| **D V1/V2** | **PARTIAL** | Hub/inquiry/costing PG; Drum Details modal LS divergent |
| **E LS** | **PASS** | `DRUM_MASTER_LOCAL_IS_AUTHORITATIVE=false`; key classified |
| **F STALE** | **PASS** | Empty PG wins; `preferPostgresMasterData` tests |
| **G FAILURE** | **PASS** | PG failure → `authoritative: false` |
| **H SECURITY** | **PASS** | JWT + RBAC on drum routes |
| **I AUDIT** | **PARTIAL** | PG import + status audited; engineering update path absent |
| **J REGRESSION** | **PARTIAL** | 763/766 pass; 3 drum WIP import tests fail (pre-existing) |

**No promotion on partial/fail gates.**

---

## 17. Regression results

| Check | Result |
|-------|--------|
| Drum-focused tests | **PASS** — `drumSelectionService` (7), `drumMasterService` (5), `drumOptimizationService` (24), `drumCapacityCalculator` (14), `drumOptimizationApiService` (2), `masterData.persistence` drum status (1) = **66/66** |
| `drumMasterSotReadiness.test.ts` | **PASS** (6/6) |
| Full suite | **763 pass / 766 tests** (110 suites) |
| `tsc --noEmit` | **PASS** |
| `prisma validate` | **PASS** |
| `vite build` + server bundle | **PASS** |

**Failures excluded from Drum cutover scope (drum WIP, not introduced by 04B-10):**

| Suite | Failures | Cause |
|-------|----------|-------|
| `importPipelineService.test.ts` | 3 (`not ok 4–6`) | **Drum WIP** — engineering column import / TO Capacity→MaxLoad mapping not implemented in `commitDrums()` |

---

## 18. Verify NOT promoted

```text
sotStatusForEntity('DrumMaster').status === 'POSTGRESQL_PRIMARY'
sotStatusForEntity('DrumMaster').postgresSoT === false
canPromoteToPostgresqlSot(sotStatusForEntity('DrumMaster')) === false
cutoverMatrixForEntity('DrumMaster').cutoverReady === false
```

Registry **unchanged** — no promotion to `POSTGRESQL_SOT`.

---

## 19. Exact blockers

1. **Gate C — incomplete write authority:** no POST create / PUT dimension update; `commitDrums()` does not persist Clearance / MaxLoad / Empty weight or apply TO Capacity→MaxLoad + Clearance 50 defaults.
2. **Gate C — `DrumCompatibility` unresolved** (0 rows, `BLOCKED`) — formal stop condition in cutover framework.
3. **Gate D — `DrumDetailsModal` LS read** — inquiry EWD reference diverges from PG-primary paths.
4. **Gate I — engineering updates unaudited** — no API path for dimension/engineering mutations.
5. **Policy — `cutoverPhase: PG_WRITE_READY`** — requires remediation + `CUTOVER_READY` before promotion.

---

## 20. Files changed (04B-10)

| File | Action |
|------|--------|
| `docs/v2/29_DRUM_MASTER_SOT_READINESS.md` | **Created** — this assessment |
| `src/platform/drumMasterSotReadiness.test.ts` | **Created** — gate evidence tests |
| `docs/v2/README.md` | **Updated** — index entry for 04B-10 |
| `package.json` | **Updated** — wire `drumMasterSotReadiness.test.ts` |

**Explicit non-actions:** No registry promotion; no `DrumCompatibility` fabrication; no optimization rule changes; no Cable Master / Cable BOM / Costing V2 / fulfillment changes; no data repair.

---

## Final report

**DRUM MASTER = POSTGRESQL_PRIMARY — CUTOVER BLOCKED**

Task 04B-10 discovery confirms PostgreSQL holds **108** governed drum rows with clean geometry and normalized engineering on ACTIVE records, but **authority readiness fails Gate C**: import does not map TO engineering fields, full CRUD is incomplete, and `DrumCompatibility` remains **BLOCKED** with zero rows. Primary read paths (Hub, inquiry, optimization APIs) use PostgreSQL; `DrumDetailsModal` and quality defaults remain LS-degraded. `canPromoteToPostgresqlSot(DrumMaster)` → **false**. **STOP — do not promote.**
