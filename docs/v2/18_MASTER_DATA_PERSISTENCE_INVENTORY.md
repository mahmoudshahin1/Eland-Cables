# 18 — Master Data Persistence Inventory (Task 04)

**Date:** 2026-09-04  
**Rule:** Inventory produced **before** cutover code changes. Classification uses §4 of Task 04:

| Class | Meaning |
|-------|---------|
| **A** | PostgreSQL authoritative |
| **B** | PostgreSQL + localStorage dual-write |
| **C** | localStorage authoritative |
| **D** | mock/static fixture |
| **E** | temporary UI state (prefs/views/drafts) |
| **F** | unknown/ambiguous |

**Platform flag:** `PERSISTENCE_MODE = POSTGRESQL_SOT_WITH_LOCALSTORAGE_COMPAT` in `src/platform/modules.ts`  
**Task split:** **04A remediation** ([19_MASTER_DATA_PERSISTENCE_REMEDIATION.md](./19_MASTER_DATA_PERSISTENCE_REMEDIATION.md)) — **ACCEPTED / FROZEN**; **04B-1 cutover framework** ([20_MASTER_DATA_SOT_CUTOVER_FRAMEWORK.md](./20_MASTER_DATA_SOT_CUTOVER_FRAMEWORK.md)) — **ACCEPTED / FROZEN**; **04B-2 Raw Material SoT** ([21_RAW_MATERIAL_SOT_CUTOVER.md](./21_RAW_MATERIAL_SOT_CUTOVER.md)) — **ACCEPTED**; **04B-7 Cable Master SoT** ([26_CABLE_MASTER_SOT_CUTOVER.md](./26_CABLE_MASTER_SOT_CUTOVER.md)) — **ACCEPTED**; prior 04B-5/7 audits [24](./24_CABLE_MASTER_SOT_READINESS.md) / [25](./25_CABLE_MASTER_SOT_READINESS.md); remaining entity cutovers — **NOT STARTED**. Historical draft: [19_MASTER_DATA_CUTOVER.md](./19_MASTER_DATA_CUTOVER.md).

### Status columns (post-04A / 04B-1 / 04B-2)

| Label | Meaning |
|-------|---------|
| **CURRENT** | Pre-04A / inventory-time behavior |
| **04A REMEDIATED** | After persistence remediation (frozen) |
| **04B-1 FRAMEWORK** | Cutover phases/gates/matrix defined |
| **04B-2+** | Per-entity promotion to POSTGRESQL_SOT when gates pass |
| **04B TARGET** | Full PostgreSQL SoT cutover (remaining entities) |

---

## 1. Entity inventory

| Entity | CURRENT Read SoT | CURRENT Write SoT | 04A REMEDIATED | 04B TARGET | localStorage | PostgreSQL | API | Owner | Class | Risk | Ready for cutover? |
|--------|------------------|-------------------|----------------|------------|--------------|------------|-----|-------|-------|------|-------------------|
| Customer | PG API | PG API | **POSTGRESQL_SOT** | POSTGRESQL_SOT | none | `Customer`, `CustomerUser`, `CustomerMigrationException` | `/api/admin/customers*` | CUSTOMER | **A** | Low | **Yes** (already) |
| Cable Master | Hybrid Hub PG / configurator PG | PG Import + Excel via API | **POSTGRESQL_SOT** (04B-7) | POSTGRESQL_SOT | `energya_master_cable_catalog_v3` | `CableMaster` | `/api/master/cables*` | CABLE_MASTER | **A** | High | **Yes — cut over** ([doc 26](./26_CABLE_MASTER_SOT_CUTOVER.md)) |
| Cable Parameters (seeded) | PG reference + legacy LS | Seed → PG | **POSTGRESQL_PRIMARY** (legacy LS D_OBSOLETE) | POSTGRESQL_SOT | `energya_cable_parameter_masters_v1_*` | `CableParameter` | `GET /api/master/reference` | CABLE_MASTER | **B**/D | Medium | **Partial** — only class A params |
| Custom configurator params | LS | LS | **LOCALSTORAGE_PRIMARY** (B temp) | Document / later | `energya_v2_custom_master_params` | none | none | ENGINEERING | **C** | Medium | **No** — do not migrate in 04B masters cutover |
| Engineering mappings | PG API | PG API | **POSTGRESQL_SOT** | POSTGRESQL_SOT | none | `CableEngineeringMapping` | `/api/master/engineering-mappings*` | ENGINEERING | **A** | Low | **Yes** |
| Technical Office Request | PG + LS TCR | Dual | **DUAL_WRITE** (queue classified B) | Classify then PG | `energya_v2_technical_requests` | `TechnicalOfficeRequest` | `/api/technical-office/requests` | ENGINEERING | **B** | Medium | **No** — separate queue from governed mapping |
| BOM (`CableBomLine`) | Hybrid | Dual + Excel LS | **POSTGRESQL_PRIMARY** | POSTGRESQL_SOT | `energya_cable_boms_v3` | `CableBomLine` | `/api/master/boms` | BOM | **B**→A | High | **No** — Excel Method-B gap |
| Raw Material | Split Costing PG / Hub LS | Dual | **POSTGRESQL_PRIMARY** (Hub+Costing same PG) | **POSTGRESQL_SOT (04B-2)** | `energya_raw_material_master_v1` | `RawMaterial` | `/api/master/raw-materials*` | MASTER_DATA | **A** | Low | **Yes — cut over** |
| Raw Material Prices | PG API | PG API | **POSTGRESQL_SOT** | POSTGRESQL_SOT | none | `RawMaterialPrice` | costing/master price APIs | COSTING | **A** | Low | **Yes** (freeze: no metal semantics) |
| Drum Master | Hybrid | Import dual; deactivate LS | **POSTGRESQL_PRIMARY** (list/status PG; empty wins) | POSTGRESQL_SOT | `energya_drum_master_v1` | `DrumMaster` | `/api/master/drums*` | CABLE_MASTER | **B**→A | High | **No** — full CRUD / compat incomplete |
| DrumCompatibility | Empty | Not populated | **BLOCKED** | PG when seeded | none | `DrumCompatibility` | (via compute) | CABLE_MASTER | **F** | Config gap | **No** — do not fabricate |
| Currency / FX / Scrap / Commercial pricing | PG | PG | **POSTGRESQL_SOT** | POSTGRESQL_SOT | none | costing/pricing models | `/api/admin/costing/*`, commercial APIs | COSTING/PRICING | **A** | Low | **Yes** |
| Import batches | PG | PG mirror | **POSTGRESQL_SOT** (04B-3) | POSTGRESQL_SOT | `energya_import_batches_v1` | `ImportBatch` | `/api/master/imports*` | MASTER_DATA | **A** | Low | **Complete (04B-3)** |
| Audit (server) | Intended PG | Dual append | **AUTHORITATIVE_SERVER_AUDIT** (04B-4) | N/A (not MD SoT) | `energya_platform_audit_v1` | `AuditEvent` | `/api/v2/audit/events`, domain audit APIs | PLATFORM | **A** | Low | **Complete (04B-4)** — LS = LEGACY_TELEMETRY |

---

## 2. localStorage keys (governed MD vs UI)

### Governed / dual-write (cutover targets)

| Key | Domain | CURRENT | 04A REMEDIATED | 04B TARGET |
|-----|--------|---------|----------------|------------|
| `energya_master_cable_catalog_v3` | Cable | Often authoritative | **Non-authoritative mirror** | Remove authority / optional delete |
| `energya_cable_boms_v3` | BOM | Often authoritative | **Non-authoritative mirror** | Remove authority |
| `energya_raw_material_master_v1` | Raw Material | Hub authoritative historically | **Non-authoritative mirror** | **NON_AUTHORITATIVE_MIRROR (04B-2 retained)** |
| `energya_drum_master_v1` | Drum | Hub/select fallback authority | **Non-authoritative mirror** (empty PG wins) | Remove authority |
| `energya_import_batches_v1` | Import | Mirror after PG | **NON_AUTHORITATIVE_MIRROR (04B-3 retained)** | Retain mirror |
| `energya_cable_parameter_masters_v1_*` | Parameters | Legacy | **D_OBSOLETE** | Do not migrate content |
| `energya_v2_custom_master_params` | Custom params | LS SoT | **B_TEMPORARY retain** | STOP full MD cutover |
| `energya_v2_technical_requests` | TCR queue | Parallel LS | **B_TEMPORARY retain** | Classify before migrate |
| `energya_platform_audit_v1` | Client audit | Dual | **LEGACY_TELEMETRY (04B-4 retained)** | Retain; not authoritative |

### UI / session (not MD SoT)

| Key | Decision |
|-----|----------|
| `energya_inquiry_*` / `energya_iq_home_saved_views_v1` | **RETAIN AS UI STATE** |
| `energya_configurator_version` | **RETAIN AS UI STATE** |
| `energya_erp_request_items_v2` | **RETAIN AS TEMPORARY DRAFT** |
| JWT / remember-session keys | Auth — out of MD scope |

---

## 3. Dual-write paths

### CURRENT (pre-04A)

1. Import Center: PG + LS; historically LS could succeed without PG.
2. Excel Method-B: LS only.
3. Hub deactivate drums: LS only (pre-API).
4. Client `appendAudit` + server `AuditEvent`.

### 04A REMEDIATED

1. Import Center: **PG commit required**; LS mirror only after success.
2. Excel Method-B: still LS only — **BLOCKED** for SoT (labeled non-authoritative in UI).
3. Hub RM/Drum deactivate: **via API**.
4. Audit: server authoritative; client retained as telemetry.

### 04B TARGET

Remove LS authority paths; optional key cleanup; Excel Method-B → PG or retire.

---

## 4. Seed / demo

`prisma/seed.ts` seeds: CableParameter kinds, limited ParameterCompatibility, identity/demo users.  
**Does not** seed CableMaster / BOM / RM / Drum / Customer commercial masters — expected from Import Center / official workbooks.  
Do **not** fabricate engineering data into production-like masters.

---

## 5. Tests

- `preferPostgresMasterData` / `resolveMasterListPreferringPostgres`: empty PG wins; PG fail → non-authoritative LS
- Hub quality uses PG snapshot when authenticated
- Import pipeline unit tests may still use `memoryImportStores` (non-browser)
- `masterDataSoT.test.ts` asserts honest statuses (Cable/BOM/Drum ≠ POSTGRESQL_SOT; RawMaterial = POSTGRESQL_SOT after 04B-2)

---

## 6. Safe cutover candidates

| Entity | 04A | 04B-1 | 04B Gate I / promotion |
|--------|-----|-------|------------------------|
| Customer / RM Prices / Currency / FX / Scrap / Commercial pricing / Engineering mappings | Already SoT | Matrix marks ready (already SoT) | Done in 04A |
| **Raw Material** | PRIMARY remediated | NEAR in framework | **04B-2 POSTGRESQL_SOT** — [doc 21](./21_RAW_MATERIAL_SOT_CUTOVER.md) |
| Cable / BOM / Drum / Import / Audit | PRIMARY remediated | Framework + STOP/NEAR recorded | Needs residual purge / Excel path / sign-off |
| Custom params / TCR LS / Excel Method-B / DrumCompatibility | STOP | STOP / BLOCKED / TEMPORARY | STOP / classify |

See durable matrix: `MASTER_DATA_CUTOVER_MATRIX` / [doc 20](./20_MASTER_DATA_SOT_CUTOVER_FRAMEWORK.md) / [doc 21](./21_RAW_MATERIAL_SOT_CUTOVER.md).

---

## 7. Ownership

Machine-readable: `src/platform/dataOwnershipMatrix.ts` / `GET /api/v2/data-ownership`.  
SoT + cutover framework: `src/platform/masterDataSoT.ts` / docs 19A remediation + 20 framework + 21 RM SoT + 19 cutover draft.
