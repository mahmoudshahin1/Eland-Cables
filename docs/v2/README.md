# Energya Connect V2 — Architecture Assessment Pack

**Task:** TASK 01 — V1 Baseline + ERP Module Architecture Assessment  
**Follow-on:** TASK 02 — Platform Foundation (see docs 11–16)  
**Follow-on:** TASK 03 — Module IA + Master Data Foundation (see doc 17)  
**Follow-on:** TASK 04A — Master Data persistence remediation (see docs 18–19 remediation) — **ACCEPTED / FROZEN** (`57caf85`)  
**Follow-on:** TASK 04B-1 — Master Data SoT cutover framework (see doc 20) — **ACCEPTED / FROZEN** (`fb03a3c`)  
**Follow-on:** TASK 04B-2 — Raw Material SoT cutover (see doc 21) — **ACCEPTED**  
**Follow-on:** TASK 04B-3 — Import Batch SoT cutover (see doc 22) — **ACCEPTED**  
**Follow-on:** TASK 04B-4 — Audit authority & legacy telemetry (see doc 23) — **ACCEPTED**  
**Follow-on:** TASK 04B-5 — Cable Master SoT readiness (see doc 24) — **BLOCKED** (Gate C; superseded by 04B-6/7)
**Follow-on:** TASK 04B-6 — Cable Master write remediation — **COMPLETE** (`fd2f7f2`)
**Follow-on:** TASK 04B-6A — Cable Master V1/V2 read convergence — **COMPLETE** (`3ab77ef`)
**Follow-on:** TASK 04B-7 — Cable Master SoT cutover (see doc 26) — **ACCEPTED** (`POSTGRESQL_SOT`)
**Follow-on:** TASK 04B-8 — Cable BOM SoT readiness (see doc 27) — **BLOCKED** (Gate C Excel Method-B)
**Follow-on:** TASK 04B-9 — Cable BOM persistence remediation (see doc 28) — **COMPLETE** (persistence only; **NOT PROMOTED**)
**Follow-on:** TASK 04B-10 — Drum Master SoT readiness (see doc 29) — **BLOCKED** (Gate C; no promotion)
**Follow-on:** TASK 04B-11 — Drum Master persistence remediation (see doc 30) — **COMPLETE** (persistence only; **NOT PROMOTED**)
**Follow-on:** TASK 04B-12 — Drum Master SoT reassessment + cutover (see docs 31–32) — **ACCEPTED** (`POSTGRESQL_SOT`)
**Follow-on:** TASK 04B-13+ — Cable BOM SoT cutover / remaining entity cutovers — **NOT STARTED**
**Date:** 2026-09-04  
**Path:** `docs/v2/` (canonical; use this path consistently)  
**Scope (Task 01):** Architecture discovery and design **only**.  
**Scope (Task 02):** Platform foundation implementation in-repo (boundary, registry, security, metadata, sequences, V2 shell).  
**Scope (Task 03):** ERP module information architecture, navigator, workspace contract, MD ownership surfaces, service boundaries — evolve existing repo (not rebuild).  
**Scope (Task 04A):** Eliminate MD persistence architectural blockers (PG primary, honest SoT registry); non-destructive LS retain.  
**Scope (Task 04B-1):** Formal cutover phases, gates A–J, entity matrix, recommended order.  
**Scope (Task 04B-2):** Promote Raw Material `POSTGRESQL_PRIMARY` → `POSTGRESQL_SOT` after gates A–J; LS mirror retained.  
**Scope (Task 04B-3):** Promote Import Batch `POSTGRESQL_PRIMARY` → `POSTGRESQL_SOT` after gates A–J; LS mirror retained.  
**Scope (Task 04B-4):** Establish server `AuditEvent` as `AUTHORITATIVE_SERVER_AUDIT`; classify client audit as `LEGACY_TELEMETRY` (not POSTGRESQL_SOT).  
**Scope (Task 04B-5):** Cable Master PRIMARY→SOT gate audit — **BLOCKED** (Gate C: Excel Method-B LS-only writes).
**Scope (Task 04B-6):** Cable Master write-path remediation (Gate C) — **COMPLETE** (not promoted).
**Scope (Task 04B-6A):** Cable Master V1/V2 read-path convergence (Gates B/D) — **COMPLETE**.
**Scope (Task 04B-7):** Cable Master formal SoT cutover — **ACCEPTED** (see doc 26).
**Scope (Task 04B-8):** Cable BOM PRIMARY→SOT readiness assessment — **BLOCKED** (Gate C; no promotion).
**Scope (Task 04B-9):** Cable BOM persistence remediation (Excel Method-B PG write, audit, LS guard) — **COMPLETE** (entity **NOT PROMOTED**).
**Scope (Task 04B-10):** Drum Master PRIMARY→SOT readiness assessment — **BLOCKED** (Gate C; no promotion).
**Scope (Task 04B-11):** Drum Master persistence remediation (import engineering, PG CRUD, LS guard) — **COMPLETE** (entity **NOT PROMOTED**).
**Scope (Task 04B-12):** Drum Master formal SoT reassessment + cutover — **ACCEPTED** (see docs 31–32).
**Scope (Task 04B-13+):** Cable BOM SoT cutover / remaining PRIMARY→SOT promotions (not started).

## Document index

| # | Document | Purpose |
|---|----------|---------|
| 01 | [01_V1_CURRENT_ARCHITECTURE.md](./01_V1_CURRENT_ARCHITECTURE.md) | As-is stack, layers, mounts, domains |
| 02 | [02_V1_FUNCTIONAL_INVENTORY.md](./02_V1_FUNCTIONAL_INVENTORY.md) | Screen → API → entity → security map |
| 03 | [03_V1_TO_V2_MODULE_MAPPING.md](./03_V1_TO_V2_MODULE_MAPPING.md) | Map V1 surfaces to V2 modules 01–29 |
| 04 | [04_V2_MODULE_ARCHITECTURE.md](./04_V2_MODULE_ARCHITECTURE.md) | Target modular ERP layout + module contract |
| 05 | [05_V2_PLATFORM_SERVICES.md](./05_V2_PLATFORM_SERVICES.md) | Platform vs business; security + EFFECTIVE ACCESS |
| 06 | [06_V2_LOW_CODE_ARCHITECTURE.md](./06_V2_LOW_CODE_ARCHITECTURE.md) | Metadata model + protected invariants |
| 07 | [07_V2_SECURITY_ARCHITECTURE.md](./07_V2_SECURITY_ARCHITECTURE.md) | Security, tenancy, access model detail |
| 08 | [08_V2_DATABASE_ARCHITECTURE.md](./08_V2_DATABASE_ARCHITECTURE.md) | DB strategy: reuse / refactor / platform |
| 09 | [09_V2_UI_UX_ARCHITECTURE.md](./09_V2_UI_UX_ARCHITECTURE.md) | ERP workspace UX (design only) |
| 10 | [10_V2_IMPLEMENTATION_ROADMAP.md](./10_V2_IMPLEMENTATION_ROADMAP.md) | Phases 0–15; Phase 0 = V1 preservation |
| 11 | [11_V1_V2_RUNTIME_BOUNDARY.md](./11_V1_V2_RUNTIME_BOUNDARY.md) | Route/deploy/DB/rollback coexistence |
| 12 | [12_MODULE_REGISTRY.md](./12_MODULE_REGISTRY.md) | Registry contract + nav policy |
| 13 | [13_EFFECTIVE_ACCESS.md](./13_EFFECTIVE_ACCESS.md) | Access evaluation + hardening |
| 14 | [14_METADATA_FOUNDATION.md](./14_METADATA_FOUNDATION.md) | Field metadata; no EAV |
| 15 | [15_NUMBER_SEQUENCE.md](./15_NUMBER_SEQUENCE.md) | Platform sequences + costing wrap |
| 16 | [16_TASK02_STATUS.md](./16_TASK02_STATUS.md) | Task 02 status, gaps, next |
| 17 | [17_TASK03_MODULE_IA.md](./17_TASK03_MODULE_IA.md) | Task 03 Module IA + MD foundation |
| 18 | [18_MASTER_DATA_PERSISTENCE_INVENTORY.md](./18_MASTER_DATA_PERSISTENCE_INVENTORY.md) | Task 04 MD persistence inventory (CURRENT / 04A / 04B) |
| 19A | [19_MASTER_DATA_PERSISTENCE_REMEDIATION.md](./19_MASTER_DATA_PERSISTENCE_REMEDIATION.md) | Task 04A remediation (authoritative; frozen) |
| 19 | [19_MASTER_DATA_CUTOVER.md](./19_MASTER_DATA_CUTOVER.md) | Task 04 cutover draft (historical; entity cutovers not started) |
| 20 | [20_MASTER_DATA_SOT_CUTOVER_FRAMEWORK.md](./20_MASTER_DATA_SOT_CUTOVER_FRAMEWORK.md) | Task 04B-1 cutover framework (phases/gates/matrix) |
| 21 | [21_RAW_MATERIAL_SOT_CUTOVER.md](./21_RAW_MATERIAL_SOT_CUTOVER.md) | Task 04B-2 Raw Material POSTGRESQL_SOT cutover |
| 22 | [22_IMPORT_BATCH_SOT_CUTOVER.md](./22_IMPORT_BATCH_SOT_CUTOVER.md) | Task 04B-3 Import Batch POSTGRESQL_SOT cutover |
| 23 | [23_AUDIT_AUTHORITY_AND_LEGACY_TELEMETRY.md](./23_AUDIT_AUTHORITY_AND_LEGACY_TELEMETRY.md) | Task 04B-4 Audit authority (AUTHORITATIVE_SERVER_AUDIT) |
| 24 | [24_CABLE_MASTER_SOT_READINESS.md](./24_CABLE_MASTER_SOT_READINESS.md) | Task 04B-5 Cable Master cutover **BLOCKED** (Gate C) |
| 25 | [25_CABLE_MASTER_SOT_READINESS.md](./25_CABLE_MASTER_SOT_READINESS.md) | Task 04B-7 Cable Master reassessment (historical — blocked, superseded) |
| 26 | [26_CABLE_MASTER_SOT_CUTOVER.md](./26_CABLE_MASTER_SOT_CUTOVER.md) | Task 04B-7 Cable Master POSTGRESQL_SOT cutover **ACCEPTED** |
| 27 | [27_CABLE_BOM_SOT_READINESS.md](./27_CABLE_BOM_SOT_READINESS.md) | Task 04B-8 Cable BOM cutover **BLOCKED** (Gate C Excel Method-B) |
| 28 | [28_CABLE_BOM_PERSISTENCE_REMEDIATION.md](./28_CABLE_BOM_PERSISTENCE_REMEDIATION.md) | Task 04B-9 Cable BOM persistence remediation (**NOT PROMOTED**) |
| 29 | [29_DRUM_MASTER_SOT_READINESS.md](./29_DRUM_MASTER_SOT_READINESS.md) | Task 04B-10 Drum Master cutover **BLOCKED** (Gate C; no promotion) |
| 30 | [30_DRUM_MASTER_PERSISTENCE_REMEDIATION.md](./30_DRUM_MASTER_PERSISTENCE_REMEDIATION.md) | Task 04B-11 Drum Master persistence remediation (**NOT PROMOTED**) |
| 31 | [31_DRUM_MASTER_SOT_REASSESSMENT.md](./31_DRUM_MASTER_SOT_REASSESSMENT.md) | Task 04B-12 Drum Master reassessment (DrumCompatibility decoupled) |
| 32 | [32_DRUM_MASTER_SOT_CUTOVER.md](./32_DRUM_MASTER_SOT_CUTOVER.md) | Task 04B-12 Drum Master POSTGRESQL_SOT cutover **ACCEPTED** |
| 33 | [33_CABLE_BOM_CONFLICT_GOVERNANCE.md](./33_CABLE_BOM_CONFLICT_GOVERNANCE.md) | Cable BOM conflict governance |
| 34 | [34_V2_CABLE_CONFIGURATION_PRODUCTION_READINESS.md](./34_V2_CABLE_CONFIGURATION_PRODUCTION_READINESS.md) | V2 cable configuration production readiness |
| 35 | [35_V2_INQUIRY_CONFIGURATION_PERSISTENCE.md](./35_V2_INQUIRY_CONFIGURATION_PERSISTENCE.md) | V2 inquiry configuration persistence |
| 36 | [36_INQUIRY_PROCESS_FOUNDATION.md](./36_INQUIRY_PROCESS_FOUNDATION.md) | Task 05I-A inquiry process foundation |
| 37 | [37_WORKFLOW_RUNTIME_FOUNDATION.md](./37_WORKFLOW_RUNTIME_FOUNDATION.md) | Task 05I-B workflow runtime foundation |
| 38 | [38_VIP_FAST_TRACK_CALCULATE_ORCHESTRATOR.md](./38_VIP_FAST_TRACK_CALCULATE_ORCHESTRATOR.md) | Task 05I-C VIP Calculate orchestrator |
| 39 | [39_CONTAINER_STUDY_BUSINESS_TECHNICAL_SPECIFICATION.md](./39_CONTAINER_STUDY_BUSINESS_TECHNICAL_SPECIFICATION.md) | Task 05I-DA Container Study & Shipment Cost spec (**DESIGN ONLY**) |
| 40 | [40_CONTAINER_STUDY_ALGORITHM_REVERSE_ENGINEERING.md](./40_CONTAINER_STUDY_ALGORITHM_REVERSE_ENGINEERING.md) | Task 05I-DB Container Study workbook/VBA reverse engineering (**DESIGN ONLY**) |
| 42 | [42_CONTAINER_STUDY_ALGORITHM_DECISION_AND_SAAS_PARITY.md](./42_CONTAINER_STUDY_ALGORITHM_DECISION_AND_SAAS_PARITY.md) | Task 05I-DB++ algorithm decision and SaaS parity (**GOVERNING PARITY BOUNDARY**) |
| 43 | [43_CONTAINER_STUDY_MASTER_DATA_AND_ENGINE_DESIGN.md](./43_CONTAINER_STUDY_MASTER_DATA_AND_ENGINE_DESIGN.md) | Task 05I-DC master data and engine design (**DESIGN ONLY**; **DESIGN READY FOR REVIEW**; not implementation-ready) |
| 44 | [44_CONTAINER_STUDY_PERSISTENCE_IMPLEMENTATION.md](./44_CONTAINER_STUDY_PERSISTENCE_IMPLEMENTATION.md) | Task 05I-DD persistence foundation |
| 45 | [45_CONTAINER_STUDY_ROLLING_ENGINE_IMPLEMENTATION.md](./45_CONTAINER_STUDY_ROLLING_ENGINE_IMPLEMENTATION.md) | Task 05I-DE Rolling first-fit engine (deterministic; Forklifting/6100/virtual layer blocked) |
| 46 | [46_CONTAINER_STUDY_INTEGRATION_ARCHITECTURE.md](./46_CONTAINER_STUDY_INTEGRATION_ARCHITECTURE.md) | Task **05I-DF-A-FINAL** — canonical **FROZEN** architecture (DF-A-01…35 incl. shipment presentation); B1–B3 implemented |
| 47 | [47_B4_SHIPMENT_GROUP_AND_SHIPPING_COST_ARCHITECTURE_AMENDMENT.md](./47_B4_SHIPMENT_GROUP_AND_SHIPPING_COST_ARCHITECTURE_AMENDMENT.md) | Task **05I-DF-B4** — D1 `DESTINATION_CLUSTER` + D2 LOCKED successor-study amendment; B4-A implemented (`54111423`) |
| 48 | [48_B4B_SHIPPING_COST_MASTER_ARCHITECTURE.md](./48_B4B_SHIPPING_COST_MASTER_ARCHITECTURE.md) | Task **05I-DF-B4-B** — Shipping Cost Master, Destination Port, Incoterm, rate matching (**IMPLEMENTED** `d67f681`) |
| 50 | [50_B4C_SHIPMENT_COST_SNAPSHOT_ARCHITECTURE.md](./50_B4C_SHIPMENT_COST_SNAPSHOT_ARCHITECTURE.md) | Task **05I-DF-B4-C** — immutable Shipment Cost Snapshot (**IMPLEMENTED**; create audit via `appendServerAuditTx`; **FROZEN** `72694f83`) |
| 51 | [51_B4D_FINANCIAL_AGGREGATION_ARCHITECTURE.md](./51_B4D_FINANCIAL_AGGREGATION_ARCHITECTURE.md) | Task **05I-DF-B4-D** — Financial Total & Shipment Presentation (**IMPLEMENTED**; D4-D-1…D4-D-4 frozen) |
| 52 | [52_CUSTOMER_MASTER_ARCHITECTURE.md](./52_CUSTOMER_MASTER_ARCHITECTURE.md) | Task **06** — Customer Master (**ACCEPTED / FROZEN**; **DESIGN ONLY**; **NOT IMPLEMENTATION AUTHORIZED**) |
| 53 | [53_PRODUCT_UX_ARCHITECTURE.md](./53_PRODUCT_UX_ARCHITECTURE.md) | Task **07** — Product & UX Architecture (**ACCEPTED / FROZEN**; **DESIGN ONLY**; **NOT IMPLEMENTATION AUTHORIZED**) |
| 54 | [54_DESIGN_SYSTEM_ARCHITECTURE.md](./54_DESIGN_SYSTEM_ARCHITECTURE.md) | **P1.5-02** — Design System Architecture (**ACCEPTED / FROZEN**; **DESIGN ONLY**; **NOT IMPLEMENTED**; **NOT IMPLEMENTATION AUTHORIZED**; BRAND-ASSET-01) |
| 55 | [55_V2_PARALLEL_DESIGN_AND_PARITY.md](./55_V2_PARALLEL_DESIGN_AND_PARITY.md) | **P1.5-02A** **ACCEPTED / FROZEN** `0fe96548`; **P1.5-03** product shells **IMPLEMENTED** (stubs) |
| 56 | [56_V2_FEATURE_PARITY_AND_GAP_REGISTER.md](./56_V2_FEATURE_PARITY_AND_GAP_REGISTER.md) | **P1.5-04** Feature parity & gap register (**ANALYSIS ONLY**; V2 **NOT READY**; cutover **BLOCKED**) |
| — | [ADVANCED_CABLE_SEARCH.md](./ADVANCED_CABLE_SEARCH.md) | V2 Advanced Cable Search (Cable Master discovery; **not** V3) |
| — | [PRESENTATION_DEMO.md](./PRESENTATION_DEMO.md) | V2 presentation-ready customer-to-quotation demo |
| — | [DATA_OWNERSHIP_MATRIX.md](./DATA_OWNERSHIP_MATRIX.md) | Ownership matrix index |
| — | [TASK05I_INQUIRY_PROCESS_WORKFLOW_ARCHITECTURE.md](./TASK05I_INQUIRY_PROCESS_WORKFLOW_ARCHITECTURE.md) | Task 05I architecture (analysis) |

## Governing constraints (do not contradict)

| Constraint | Source |
|------------|--------|
| Phase 1 commercial fulfillment **FROZEN** | `docs/PHASE1_QUOTE_TO_CASH_FREEZE.md` |
| D365 adapters `NOT_IMPLEMENTED` / `NOT_CONNECTED` | ADR-004 in `docs/ARCHITECTURE_DECISIONS.md` |
| Costing V2 Option B / Decision 5 freeze (no metal logic change) | Workspace rule + freeze docs |
| Dual localStorage + PostgreSQL until entity cutover | `docs/KNOWN_LIMITATIONS.md` — 04A remediates PG-primary; 04B-1 framework; 04B-2 RM SoT; other entities still dual/mirror |
| One Customer / Pricing Engine / Costing Engine / Engineering model | V2 design principle |
| Task 06 / Task 07 / Doc 54 design freeze (no reopen) | Docs 52–54 |
| P1.5-02 must not become an in-place UI cleanup | Doc 54 + **Doc 55** (parallel V2) |
| Current Version Preservation (release criterion) | Doc 11 + Doc 55 |

## P1.5-02 / P1.5-02A implementation constraint

**Doc 54 is ACCEPTED / FROZEN.** Do **not** amend it. **In-place restyle of current UI is rejected** (Doc 55).

**P1.5-02A is ACCEPTED / FROZEN** at `0fe96548593e893d18e7ce368c3587dd91359b48` (unwired Stepper / SnapshotBanner / ValidationSummary / PermissionState / EmptyState / ErrorState). Existing `ui/*` consumed by V1 were **not** restyled.

**P1.5-02A build validation = deferred** due to pre-existing unrelated `BrandLogo` / `logo.png` WIP in the working tree. Do **not** mix that WIP into `0fe96548` to obtain a build result.

**BrandLogo / `public/logo.png` WIP is not part of P1.5-02A.** It remains uncommitted and must be decided separately (own small hygiene task **or** defer until P1.5-03). Do not replace `public/logo.png` until a transparent asset is visually approved.

**P1.5-03 V2 Application Shell is implemented** (product shells above `V2Shell`). V1 `/customer/*` `/internal/*` and platform `/v2`, `/v2/security`, `/v2/master-data`, `/v2/modules/*` are preserved. BrandLogo/logo WIP was **not** included.

```text
P1.5-02A  ACCEPTED / FROZEN  0fe96548
     →
P1.5-03   /v2/customer + /v2/internal shells — IMPLEMENTED (shell/stubs only)
          (must not break /v2, /v2/security, /v2/master-data, /v2/modules/* catch-all)
     →
P1.5-04   Feature parity & gap analysis — ANALYSIS RECORDED (doc 56); cutover still NOT AUTHORIZED
     →
Explicit cutover — NOT AUTHORIZED
```

**Out of scope:** redesigning `/customer` or `/internal`; changing APIs, Customer Master, Costing, B4-C/B4-D; a new component library; another color palette; assuming a missing current feature is obsolete.

**Still not authorized:** cutover, Customer Master implementation, D365, V2 business-screen implementation (until gaps are explicitly scheduled).

## Executive verdict (one paragraph)

Energya Connect V1 is a **working modular monolith** (React 19 + Express + Prisma/PostgreSQL) with a **real governed commercial/costing core** and a **frozen Phase 1 quote-to-cash fulfillment domain**. V2 should **evolve this repository into ERP-style modules** (Workspace | Master | Transactions | Setup | Workflows | Reports | Dashboards), not rebuild. Task 02 adds the **platform foundation**; Task 03 establishes **module IA + master-data ownership surfaces**; Task 04A remediates master-data persistence so PostgreSQL is **primary** with honest SoT statuses; Task 04B-1 adds the **enforceable cutover framework** (gates A–J); Task 04B-2 promotes **Raw Material** to `POSTGRESQL_SOT` (other entities remain pending).

## Assessment / implementation status

- **Task 01 V1 code changed:** No  
- **Task 02 platform foundation:** Yes (see doc 16)  
- **Task 03 Module IA:** Yes (see doc 17)  
- **Task 04A Master Data persistence remediation:** Yes — **ACCEPTED / FROZEN** (see docs 18–19 remediation)  
- **Task 04B-1 Master Data SoT cutover framework:** Yes — **ACCEPTED / FROZEN** (see doc 20)  
- **Task 04B-2 Raw Material SoT:** Yes — **ACCEPTED** (see doc 21)  
- **Task 04B-3 Import Batch SoT:** Yes — **ACCEPTED** (see doc 22)  
- **Task 04B-4 Audit authority:** Yes — **ACCEPTED** (see doc 23)  
- **Task 04B-5 Cable Master SoT:** Audited — **BLOCKED** (see doc 24; Gate C Excel Method-B)
- **Task 04B-6 Cable Master write remediation:** Complete — Gate C remediated
- **Task 04B-6A Cable Master V1/V2 convergence:** Complete — Gates B/D remediated
- **Task 04B-7 Cable Master SoT cutover:** **ACCEPTED** (see doc 26)
- **Task 04B-8 Cable BOM SoT:** Audited — **BLOCKED** (see doc 27; Gate C Excel Method-B)
- **Task 04B-9 Cable BOM persistence:** **COMPLETE** (see doc 28; persistence remediated; entity **NOT PROMOTED**)
- **Task 04B-10 Drum Master SoT:** Audited — **BLOCKED** (see doc 29; Gate C; entity **NOT PROMOTED**)
- **Task 04B-11 Drum Master persistence:** **COMPLETE** (see doc 30; persistence remediated; entity **NOT PROMOTED**)
- **Task 04B-12+ entity cutovers:** Not started
- **Task 06 Customer Master:** Architecture **ACCEPTED / FROZEN** — design only; **not implemented**
- **Task 07 Product & UX:** Architecture **ACCEPTED / FROZEN** — design only; **not implemented**
- **P1.5-02 Design System:** Architecture **ACCEPTED / FROZEN** (doc 54) — **do not restyle current UI in place**
- **P1.5-02A Parallel V2 + parity gate:** **ACCEPTED / FROZEN** (`0fe96548`) — additive unwired primitives; **build validation deferred**; BrandLogo/logo WIP **excluded**
- **P1.5-03 Application Shell:** **IMPLEMENTED** (shell/stubs; `/v2/customer` ≠ `/v2/modules/customer`)
- **P1.5-04 Feature Parity:** **ANALYSIS** (doc 56) — V2 **NOT READY**; cutover **BLOCKED**; no implementation
- **Full low-code / SC / Finance / D365 live:** No  
