# 10 — V2 Implementation Roadmap

**Assessment date:** 2026-09-04  
**Closure update:** 2026-09-26 — Phases 1–12 recorded in §6 (Phases 13–15 not closed).  
**Critical rule:** **Phase 0 = V1 preservation.** No Phase 1+ V2 build until this assessment pack is accepted.  
**This Task 01 IS the assessment** — it does not implement Phase 1+. Implementation after acceptance is recorded in §6.

---

## 1. Roadmap overview (Phases 0–15)

| Phase | Name | Intent | Gate |
|-------|------|--------|------|
| **0** | V1 Preservation & Assessment | Freeze critical domains; inventory; architecture pack | **This deliverable** |
| **1** | Platform foundation | EFFECTIVE ACCESS, audit SoT, auth harden open routes | Security review |
| **2** | Master data cutover | Eliminate dual localStorage SoT | Import + browser parity tests |
| **3** | Module contracts & IA | Module IDs, navigator, LIVE vs PLANNED | UX + RBAC |
| **4** | Inquiry & Quotation packaging | Standard module surfaces; field metadata SoT | Commercial regression |
| **5** | Costing packaging | Workspace contract; **no Option B metal changes** | Costing freeze gates |
| **6** | Sales / Commercial UX | Fulfillment UI stabilize (domain still frozen) | Phase 1 freeze intact |
| **7** | Engineering / BOM / Cable | TO queues + FK cleanups; drum compatibility data | Engineering sign-off |
| **8** | Drum productization | Manual/auto selection acceptance | Drum assessment criteria |
| **9** | Pricing module clarity | Rules UX separated from costing | Pricing tests |
| **10** | Reporting & Analytics MVP | Whitelist report runtime + honest KPIs | No data leaks |
| **11** | Workflow metadata | Labels + queues over existing status machines | No generic WF engine yet |
| **12** | Low-code experience layer | Forms/views on PlatformFieldDefinition | Protected invariants |
| **13** | Supply chain / inventory (decision) | Native lightweight **or** D365-only | Product decision |
| **14** | Finance modules (decision) | Prefer D365 AR/AP/GL posting | ADR-004 adapters |
| **15** | D365 adapter implementation | Live posting when ERP ready | Spec + gap analysis |

Phases 13–15 are **decision-gated**; do not invent parallel financial ledgers casually.

---

## 2. Phase 0 detail (current)

### In scope (Task 01)

- Architecture discovery  
- Ten docs under `docs/v2/`  
- Reuse freeze / ADR / audit truth  

### Out of scope

- V1 business logic changes  
- Destructive DB  
- UI redesign implementation  
- New modules / low-code engine  
- D365 live integration  
- Costing Option B / Decision 5 code changes  

### Preservation checklist

| Asset | Action |
|-------|--------|
| Phase 1 fulfillment domain | Keep FROZEN |
| Costing orchestrator & tests | Do not weaken; respect Option B freeze |
| Customer isolation | Preserve |
| ADR-004 stubs | Keep honest NOT_IMPLEMENTED / NOT_CONNECTED |
| Seed/demo paths | Do not break demo without migration note |

---

## 3. Phase recommendations (template)

### Phase 1 — Platform foundation

| CURRENT STATE | TARGET STATE | REASON | MIGRATION IMPACT | RISK | DEPENDENCIES |
|---------------|--------------|--------|------------------|---|--------------|
| Open GETs / scattered asserts | Authenticated routes + EFFECTIVE ACCESS core | Security | Medium | Client breakage | Docs 05, 07 |
| Dual audit | Server `AuditEvent` authoritative; LS = legacy telemetry | Forensics | Low–medium | — | Platform (04B-4 complete) |

### Phase 2 — Master data cutover

| CURRENT STATE | TARGET STATE | REASON | MIGRATION IMPACT | RISK | DEPENDENCIES |
|---------------|--------------|--------|------------------|---|--------------|
| Dual-write catalogs | PostgreSQL SoT | Integrity | High UX touch | Missing offline habits | Import Center |

**Progress:** Task 04A remediates PG-primary authority (blockers; **ACCEPTED / FROZEN**). Task 04B-1 establishes cutover framework (gates/matrix/order; see doc 20). Task 04B-2 promotes **Raw Material** to `POSTGRESQL_SOT` (see doc 21). Task 04B-3 promotes **Import Batch** to `POSTGRESQL_SOT` (see doc 22). Task 04B-4 establishes **Audit** as `AUTHORITATIVE_SERVER_AUDIT` (see doc 23). Task 04B-5 audits **Cable Master** — **BLOCKED** at Gate C (doc 24). Task 04B-6 remediates Cable Master writes (Gate C pass). Task 04B-6A remediates V1/V2 read paths (Gates B/D). Task 04B-7 promotes **Cable Master** to `POSTGRESQL_SOT` (doc 26). Remaining entity cutovers (BOM/Drum/params) **not started**.

### Phase 6 — Fulfillment UI (reminder)

Domain remains frozen; only operational UI workflow (already authorized direction in freeze notice). D365 stays stubbed.

### Phase 15 — D365

Follow `D365_FO_QUOTE_TO_CASH_INTEGRATION_SPECIFICATION.md` and gap analysis; adapters only.

---

## 4. Dependency graph (simplified)

```text
Phase 0 Assessment
  → Phase 1 Security/platform
  → Phase 2 Master cutover
  → Phase 3 Module IA
  → Phases 4–9 Domain packaging (can partially parallelize after 3)
  → Phases 10–12 Cross-cut reporting/workflow/low-code UX
  → Phases 13–14 Product decisions
  → Phase 15 D365 when ERP ready
```

**Parallelism:** Drum (8) and Pricing (9) can proceed beside 4–7 if staffing allows, after Phase 0–1 gates.

---

## 5. Explicit freezes carried forward

| Freeze | Until |
|--------|-------|
| Phase 1 commercial fulfillment domain | New phase approval |
| Costing V2 Option B / Decision 5 metal | Decision 5 resolution |
| D365 HTTP from domain | Adapter implementation phase |

**Task 02 (2026-09-04):** Platform foundation implemented in-repo — see `docs/v2/11`–`16`. Does not lift freezes above.

**Task 03 (2026-09-04):** Module IA + Master Data foundation — see `docs/v2/17_TASK03_MODULE_IA.md`. Phase 3 (module contracts & IA) advanced in-repo; does not lift freezes; does not start full MD cutover or low-code builders.

**Task 04A (2026-09-04):** Master Data persistence remediation — see `docs/v2/18`, `19_MASTER_DATA_PERSISTENCE_REMEDIATION.md`. Honest SoT registry; PG primary for Cable/BOM/RM/Drum/Import; LS non-authoritative. **ACCEPTED / FROZEN** at `57caf85`. Does not lift freezes.

**Task 04B-1 (2026-09-04):** Master Data SoT cutover framework — see `docs/v2/20_MASTER_DATA_SOT_CUTOVER_FRAMEWORK.md`. Phases, gates A–J, entity matrix, recommended order. **No entity cutover executed.** Task 04B entity cutovers remain **NOT STARTED**.

---

## 6. V2 Phase 1–12 closure (2026-09-26)

**Rule:** Do not mark complete merely because related functionality exists. Phases 13–15 remain **decision-gated / not connected**.

| Phase | Status | Implemented scope | Evidence / tests | Remaining limitation |
|-------|--------|-------------------|------------------|----------------------|
| **1** Platform foundation | **COMPLETE** | EFFECTIVE ACCESS evaluate/explain; deny-by-default V2 data routes (incl. `/api/v2/boundary`); 401 vs 403; `AuditEvent` SoT; customer isolation; costing protection; RBAC; no unauthorized MD; new V2 APIs authenticated | `v2PlatformFoundation.test.ts`, `v2Phase1PlatformFoundation.gate.test.ts`, `rbac.test.ts`, `serverAudit.test.ts`, `auditAuthority.test.ts` | Security-group membership still **optional** (roles/permission codes remain authoritative). Commercial inquiry numbers not fully on NumberSequence |
| **2** Master data cutover | **COMPLETE WITH DOCUMENTED LIMITATION** | PG authoritative registry; RM/Import/Cable/Drum `POSTGRESQL_SOT`; Audit `AUTHORITATIVE_SERVER_AUDIT`; LS mirrors non-authoritative; no destructive LS wipe | `masterDataSoT.test.ts`, 04B cutover suites, `v2PhaseClosure.gate.test.ts` | **CableBomLine stays `POSTGRESQL_PRIMARY`** — 81 official conflicts HARD-stop promotion (04B-13). CableParameter / TCR / DrumCompatibility not SoT. Legitimate UI cache remains. |
| **3** Module contracts & IA | **COMPLETE** | Catalog 01–29 + PLATFORM; navigator LIVE/PARTIAL/FROZEN only; informational PLANNED/STUB/NOT_IMPLEMENTED; no duplicate Customer/Costing/Pricing; honest empty/error | `moduleIa.test.ts`, `v2PlatformFoundation.test.ts` | Informational modules have no fake screens (by design) |
| **4** Inquiry & Quotation | **COMPLETE** | Commercial inquiry/quotation path; 05I DF-B–F2 + E2E; FO snapshots; saved delivery combination; customer cost secrecy via `commercialProjection` | `increment11.commercial.test.ts`, `containerStudy05i.e2e.test.ts`, DF-B–F2 suites, inquiry header/delivery tests | Does not redesign 05I architecture |
| **5** Costing packaging | **COMPLETE WITH DOCUMENTED LIMITATION** | Workspace 4-gate readiness; CostingRun CS pin write-once; Option B / Decision 5 freeze respected | `increment14.costingWorkspace.test.ts`, `costingEngine.test.ts`, `decision5Issue.test.ts`, DF-D/F pin tests | Decision 5 remains unsigned unless audit-signed; metal/FX/latest-CS-result semantics not changed |
| **6** Sales / Commercial UX | **COMPLETE** | Commitment / SO / agreement / release / Direct MTS; D365 `NOT_IMPLEMENTED`; fulfillment domain freeze intact | `phase1.quoteToCash.test.ts`, `standaloneCommercialFulfillment.test.ts`, `d365Adapters.test.ts` | Live D365 posting out of scope (Phase 15) |
| **7** Engineering / BOM / Cable | **COMPLETE WITH DOCUMENTED LIMITATION** | TO queues, BOM governance register, **81 conflicts remain HARD gate** (not silently resolved) | `cableBomConflictGovernance.test.ts`, increment 5–8 BOM tests | Promotion of CableBomLine SoT blocked until engineering review (future decision) |
| **8** Drum productization | **COMPLETE** | Confirm fail-closed; valid cutting + compatible drum → `lifecycleStatus = CONFIRMED`; CS consumes confirmed drum-plan snapshot; no drum-opt formula redesign | `drumPlanConfirmReadiness.test.ts`, `v2DrumPlanPersistence.test.ts`, DF-E / 05I E2E fail-closed, `ceoDemoJourney.e2e.test.ts` | DrumCompatibility still BLOCKED (0 rows; not fabricated) |
| **9** Pricing | **COMPLETE** | Pricing engine distinct from costing; commercial pricing snapshot immutable; FO consumes pricing snapshot | `increment12.pricing.test.ts`, `commercialPricingEngine.test.ts`, B4-D FO guardrails | `costingEngine` not modified in this closure |
| **10** Reporting MVP | **COMPLETE WITH DOCUMENTED LIMITATION** | Whitelist aggregation runtime (`POST /api/admin/platform/reports/:code/run`); KPI API requires `REPORT:DASHBOARD:VIEW`; customers denied internal KPIs | `reportRuntime.test.ts`, `reportRuntime.persistence.test.ts`, `v2Phase1PlatformFoundation.gate.test.ts` | **No Power BI, no arbitrary SQL, no DWH, no export engine.** Counts only on whitelist entities. |
| **11** Workflow metadata | **COMPLETE WITH DOCUMENTED LIMITATION** | Labels/queues presentation overlay; STANDARD fail-closed (existing orchestrator); VIP does not use STANDARD_INQUIRY_V1; template authoring 501 | `workflowPresentationMetadata.test.ts`, `workflowRuntime.test.ts`, `standardWorkflowReadiness.test.ts` | **Not a generic workflow engine.** 05I-B runtime over inquiry status machines remains; no free-form authoring. |
| **12** Low-code experience | **COMPLETE WITH DOCUMENTED LIMITATION** | `PlatformFieldDefinition` overlays typed INQUIRY / INQUIRY_LINE / CUSTOMER columns (label, description, type, required, visible, editable/readOnly, order, section, default, validation, lookup, active). Admin form+grid at `/v2/modules/PLATFORM/setup`. Runtime drives commercial inquiry **form** (`CommercialInquiryDetail`) and **list/grid** (`CommercialInquiryList`). Mutations require `PLATFORM:METADATA:MANAGE`; audited via `AuditEvent`. Not EAV; unknown columns rejected; protected cost fields cannot be customer-visible | `v2Phase12LowCode.test.ts`, `ceoDemoJourney.e2e.test.ts`, `inquiryFieldManifest.test.ts` | Cannot invent columns, relations, or business logic. COSTING/QUOTATION/D365 entities are not low-code writable. Not a drag-drop builder. |
| **13** Supply chain / inventory | **DECISION-GATED** | Inventory module `NOT_IMPLEMENTED` | `moduleIa.test.ts` | Native vs D365-only product decision required |
| **14** Finance modules | **DECISION-GATED** | GL/AR/AP stubs; prefer D365 posting | `d365Adapters.test.ts` | No parallel ledgers |
| **15** D365 adapters | **NOT IMPLEMENTED / NOT_CONNECTED** | Adapter ports only | `d365Adapters.test.ts` | Live posting when ERP ready — do not start without approval |

### Local demo startup

- Command: `npm run dev` (Express + Vite; default **http://localhost:3847**). Production-style: `npm run build` then `npm start`.
- Express **does not hot-reload routes** — restart the process after API route changes.
- Demo users (dev seed / documented demo): **admin@energya.com** (`Admin@2026!` in development unless `ADMIN_SEED_PASSWORD` is set), **david.smith@elandcables.com** (`Customer@2026!` when demo/dev identity seed is allowed). Production seed requires `ADMIN_SEED_PASSWORD` and rejects those defaults. See `docs/release/DEMO_ENVIRONMENT.md`.

### Master project control checklist (same sprint)

| Area | Status |
|------|--------|
| Freeze / no commit / no destructive split | **Preserved** |
| HTTP client / API boundary | **Closed remaining coupling** for V2 inquiry + cutting clients (`httpClient`). Cable Authority and Drum Optimization remain API-backed. VIP calculate still reads 409 JSON bodies (governed BLOCKED result). |
| Cutting API | **Server persist already existed**; **preview API added** `POST .../cutting-plans/preview` (does not persist). UI Preview uses that API. Local length bounds remain display-only. |
| Delivery / logistics / 05I | **Already existed** — not redesigned. Saved delivery combination, CS dest, canonical ports/types, packing vs shipping remain in DF-B–F / 05I suites. |
| Engineering lineage / BOM 81 | **Already existed**; 81 conflicts still HARD. Cutting plan linked to current configuration snapshot. |
| Pricing hierarchy Customer→Cable→Family→Group | **Already existed** (`PRICING_PRECEDENCE` in `commercialPricingEngine.ts`). |
| Commercial quote-to-cash | **Already existed**; D365 `NOT_CONNECTED` / `NOT_IMPLEMENTED`. |
| Security | **Already existed**: JWT access+refresh, revocation, lockout, password min 8, RBAC, isolation, AuditEvent, IDOR tests (`increment12b1`, `increment12b2_1`). **Added this sprint**: security headers, production CORS, production login IP rate-limit (off in default test/dev unless `LOGIN_RATE_LIMIT=true`). |
| Notifications | **Minimum catalog** `GET /api/notifications/catalog`; submit/issue/TO already notified; **release + commercial approval** now enqueue in-app events. Not enterprise messaging. |
| Low-code Phase 12 | **Complete with documented limitation** (typed overlays only). |
| CEO E2E projectName | **Fixed** — persist `projectName` on create; metadata label via `PlatformFieldDefinition` with `customerVisible: true`. |
| UI redesign | **Not done** (CEO-critical only). |

### Phase 1+ confirmation (updated)

| Item | Status |
|------|--------|
| V1 code modified by Task 01 | **No** (Task 01 was assessment-only) |
| Phase 1+ V2 features implemented | **Yes — Phases 1–12 closed as of 2026-09-26 per matrix above (with documented limitations). Phases 13–15 not closed.** |
| Assessment artifacts | `docs/v2/01` … `10` + README + follow-on docs 11–56 |

---

## 7. Success criteria for leaving Phase 0 (historical Task 01)

1. Executive + technical acceptance of `docs/v2/` pack  
2. Agreement on module catalog 01–29 and anti-duplication rules  
3. Agreement that V2 evolves the **existing repo** (not greenfield)  
4. Backlog for Phase 1 security hardening prioritized  
5. No silent contradiction of freeze docs  

Phase 0 assessment pack remains the preservation baseline. This closure sprint does **not** reopen Costing Option B / Decision 5 metal, Phase 1 fulfillment domain semantics, DF-B–F architecture, 05I E2E contract, drum-opt formula, D365 live posting, generic workflow, EAV, or parallel ledgers.

---

## 8. Confirmation (Task 01 historical)

| Item | Status |
|------|--------|
| V1 code modified by Task 01 | **No** |
| Assessment artifacts | `docs/v2/01` … `10` + README |

*Superseded for implementation status by §6 (2026-09-26).*
