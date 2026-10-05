# 34 — V2 Cable Configuration Production Readiness (Task 05A)

**Date:** 2026-09-05  
**Status:** **PARTIAL — NOT production-ready end-to-end**  
**Frozen baselines:** Costing V2 · Decision 5 · Cable BOM governance (04B-13, 81 conflicts) · Drum rules · V1 config · Fulfillment WIP  
**Tests:** `src/platform/v2CableConfigurationProductionReadiness.test.ts`  
**Service:** `src/components/cable-configurator/v2/services/v2CableConfigurationService.ts`

---

## 1. Executive decision

**V2 Cable Configuration is LIVE for technical parameter selection and Cable Master resolution, but NOT production-ready for the full Quote-to-Cash chain.**

| Area | Classification |
|------|----------------|
| V2 routes & UI shell | **LIVE** |
| PG Cable Master authority | **LIVE** |
| Technical validation engine | **LIVE** |
| Configuration snapshot | **LIVE** (new Task 05A) |
| BOM → Costing handoff | **BLOCKED** (81 unresolved conflicts) |
| Cutting length / drum handoff | **PARTIAL** |
| Customer isolation on config APIs | **PARTIAL** |
| Server audit on TCR | **PARTIAL** |

**Do not claim production-ready without evidence.** Costing and quotation remain blocked until Cable BOM governance (04B-13) is resolved.

---

## 2. Architectural boundary (non-negotiable)

Cable Configuration is **V2 ONLY** for authoritative engineering flow:

```text
V2 Cable Config → Technical Validation → Cutting Length → Drum Selection → Drum Plan Snapshot → Costing → Commercial Pricing → Quotation
```

**Frozen V1 paths (not enhanced in 05A):**

- `SmartConfigurator` (`src/components/customer/SmartConfigurator.tsx`)
- `CableConfiguratorModal` (`src/components/common/CableConfiguratorModal.tsx`)
- `CableConfiguratorHub` version toggle remains for legacy access only; V2 is marked **Authoritative**.

---

## 3. V2 route inventory

| Route / entry | Component / handler | Classification |
|---------------|---------------------|----------------|
| `/internal/cable-parameters` | `CableConfiguratorHub` → `CableConfiguratorV2` | **LIVE** |
| Customer dashboard configurator tab | Same hub (default `v2`) | **LIVE** |
| `CableSearchSelectModal` embedded V2 | `CableConfiguratorV2` | **LIVE** |
| `GET /api/cables/search` | `cableAuthorityRoutes` | **LIVE** |
| `GET /api/cables/compatibility` | `cableAuthorityRoutes` | **LIVE** |
| `POST /api/cables/evaluate` | `evaluatePersistedCable` → `evaluateCableAuthority` | **LIVE** |
| `GET /api/master/cables` | `masterDataRoutes` (JWT + RBAC) | **LIVE** |
| `POST /api/technical-office/requests` | `createTechnicalOfficeRequest` | **LIVE** |
| `GET /api/technical-office/requests` | `assertCanProcessTechnicalOffice` | **LIVE** |
| `/v2/modules/engineering/master/cables` | Module IA registry | **LIVE** (navigation) |

---

## 4. Gap analysis (audit-first)

| Gap | Severity | 05A action |
|-----|----------|------------|
| No stable configuration snapshot for downstream modules | High | **FIXED** — `buildConfigurationSnapshot` |
| BOM governance not surfaced in V2 UI | High | **FIXED** — ENGINEERING DATA BLOCKED banner |
| LS fallback did not block downstream | Medium | **FIXED** — gate cutting length when `catalogAuthoritative=false` |
| Flow states not unified | Medium | **FIXED** — `deriveFlowState` |
| TCR still mirrors to LS | Low | **DOCUMENTED** — PG path authoritative |
| Cutting length writes LS draft items | Low | **DOCUMENTED** — CACHE classification |
| Per-cable BOM conflict API in V2 config | Medium | **MISSING** — platform-level 81-conflict gate only |
| Customer scope on `/api/cables/evaluate` | Medium | **PARTIAL** — open evaluate; commercial APIs scoped separately |
| `appendServerAudit` on every TCR field change | Low | **PARTIAL** — create path only |

---

## 5. Authoritative Cable Master

| Requirement | Status | Evidence |
|-------------|--------|----------|
| `loadAuthoritativeCableCatalog` | **LIVE** | `CableConfiguratorV2.tsx` |
| `GET /api/master/cables` | **LIVE** | `masterDataApiService.ts` |
| `POST /api/cables/evaluate` | **LIVE** | Server debounced evaluate in V2 UI |
| LS non-authoritative | **LIVE** | `CABLE_CATALOG_LOCAL_IS_AUTHORITATIVE=false` |
| Empty PG beats stale LS | **LIVE** | `preferPostgresMasterData` tests (04B-7) |

V2 displays catalog source label: **PostgreSQL** vs **localStorage (non-authoritative)**.

---

## 6. Technical Parameter Engine

**Single engine architecture (no second authority):**

1. `technicalValidationEngineV2.validateCableConfigurationV2` — IEC/BS prototype notes (warnings only)
2. `domain/cableAuthority.evaluateCableAuthority` — governed parameter + compatibility + master match
3. `cableSelectionEngineV2.filterCableRecordsV2` — cascading catalog filter (PG-fed records)

Server evaluate (`evaluatePersistedCable`) loads persisted cables, parameters, and compatibility rules from PostgreSQL.

---

## 7. Configuration flow states

| Governed state | Maps from `TechnicalValidationResultV2` | Downstream |
|----------------|------------------------------------------|------------|
| `VALID` | `EXISTING_APPROVED` + authoritative catalog | Cutting length allowed |
| `INVALID` | `INVALID_CONFIGURATION` | Blocked |
| `INCOMPLETE_ENGINEERING_DATA` | `CONFIGURATION_REQUIRED` or non-authoritative catalog | Blocked |
| `BLOCKED_ENGINEERING_APPROVAL` | `VALID_NEW_CABLE` | TCR required; no quotation |
| `ENGINEERING_DATA_BLOCKED` | Valid match + BOM governance debt | Costing/quotation blocked |
| `CONFIGURATION_REQUIRED` | Missing compatibility rules | Blocked |

Invalid configurations **cannot** proceed to cutting length, drum selection, or costing.

---

## 8. BOM governance boundary

| Rule | Status |
|------|--------|
| 81 unresolved `BomDuplicateObservation` preserved | **LIVE** (04B-13) |
| `CableBomLine` = `POSTGRESQL_PRIMARY` | **LIVE** |
| No silent LS BOM fallback in V2 | **LIVE** |
| `energya_cable_boms_v3` in V2 context | **PROHIBITED** as authority |
| V2 UI shows ENGINEERING DATA BLOCKED | **LIVE** (05A) |

Costing gate alignment (read-only verification): `costingEngine.evaluateCostingGates` Gate 2 blocks unresolved BOM conflicts.

---

## 9. Configuration snapshot

`buildConfigurationSnapshot` produces a stable handoff reference:

- Cable identity (`materialNumber`, `itemCode`, `customerCode`)
- Full `SelectionStateV2` + `selectionsToConfig` payload
- `validationStatus`, `flowState`, `engineeringStatus`
- Catalog authority (`catalogSource`, `catalogAuthoritative`)
- Actor context (user id, email, role, customer code)
- `downstreamGates` per stage
- `snapshotId` + `capturedAt` ISO timestamp

Cutting length section displays snapshot id for traceability.

---

## 10. Customer RBAC

| Surface | RBAC |
|---------|------|
| `POST /api/cables/evaluate` | Authenticated optional; no write permission required |
| `GET /api/master/cables` | JWT + `requireMasterReadAuth` |
| `POST /api/master/cables` | `assertCanWriteCableMaster` |
| TCR submit | JWT required (401 if unsigned) |
| TCR list | `assertCanProcessTechnicalOffice` |

**Classification:** **PARTIAL** — evaluate is intentionally open for configurator UX; commercial pricing APIs remain separately gated.

---

## 11. Internal RBAC

Technical Office queues (`TechnicalOfficeTcrQueue`, `TechnicalOfficeBomGovernanceQueue`, etc.) are internal-only components under `/internal/technical-office`.

Cable master writes and BOM governance actions require internal roles per `rbac.ts`.

---

## 12. Customer isolation

| Mechanism | Status |
|-----------|--------|
| `customerCode` query on `/api/cables/search` | **LIVE** |
| `CableSearchSelectModal` customer filter | **LIVE** |
| `customerScope` on commercial APIs | **LIVE** (unchanged) |
| Evaluate body `customerCode` in config | **PARTIAL** — passed but not full tenant isolation on evaluate |

**Classification:** **PARTIAL** for configuration evaluate path.

---

## 13. Handoff — Cutting Length

| Check | Status |
|-------|--------|
| Section renders only when `canProceedToDownstream(snapshot, 'cuttingLength')` | **LIVE** (05A) |
| Requires `EXISTING_APPROVED` + PG catalog | **LIVE** |
| Draft items in `energya_erp_request_items_v2` | **CACHE** (non-governed) |
| Integration with commercial fulfillment WIP | **BLOCKED** (frozen) |

---

## 14. Handoff — Drum Selection

| Check | Status |
|-------|--------|
| Gate defined in `evaluateDownstreamGates` | **LIVE** |
| Drum optimizer module | **PARTIAL** — separate route; frozen drum business rules |
| `DrumSelectionWorkflowPanel` fulfillment WIP | **BLOCKED** (frozen) |

Drum selection requires same VALID + authoritative catalog gate as cutting length.

---

## 15. Handoff — Costing

| Check | Status |
|-------|--------|
| `canProceedToDownstream(snapshot, 'costing')` | **BLOCKED** when BOM governance debt |
| `evaluateCostingGates` Gate 1–4 | **LIVE** (unchanged — freeze respected) |
| `costingEngine` modifications in 05A | **NONE** |

Costing verification only; no costing logic changes.

---

## 16. localStorage inventory (V2 cable config scope)

| Key | Classification | Notes |
|-----|----------------|-------|
| `energya_configurator_version` | **UI_STATE** | Hub v1/v2 toggle |
| `energya_master_cable_catalog_v3` | **NON_AUTHORITATIVE** | PG mirror |
| `energya_erp_request_items_v2` | **CACHE** | Draft inquiry lines |
| `energya_v2_technical_requests` | **NON_AUTHORITATIVE** | TCR draft queue |
| `energya_cable_boms_v3` | **PROHIBITED** | Must not be V2 BOM authority |

---

## 17. Audit

| Path | Audit authority |
|------|-----------------|
| `createCable` / `updateCable` | `appendServerAudit` → `AuditEvent` |
| `createTechnicalOfficeRequest` | Server persistence + audit trail in request |
| LS TCR mirror (`energya_v2_technical_requests`) | **NON_AUTHORITATIVE** |
| V2 config snapshot | Client-side traceability only |

**Classification:** **PARTIAL** — TCR create audited; LS mirror remains for offline draft.

---

## 18. UX (minimal production clarity)

05A additions (no cosmetic redesign):

- Non-authoritative catalog warning banner
- ENGINEERING DATA BLOCKED banner (81 BOM conflicts)
- Cutting length blocked message with flow state
- Snapshot id on cutting length section
- Existing validation badges retained

---

## 19. Test evidence (A–S)

| Test | Assertion |
|------|-----------|
| A | V2 routes and core modules exist |
| B | PG cable catalog contract |
| C | Single technical engine (`cableAuthority`) |
| D | Flow state mapping |
| E | BOM governance boundary |
| F | Configuration snapshot fields |
| G | Customer evaluate RBAC |
| H | Internal TO list RBAC |
| I | Customer isolation filter |
| J | Cutting length gate |
| K | Drum selection gate |
| L | Costing gate (read-only) |
| M | LS inventory classification |
| N | Server TCR mutation path |
| O | No SmartConfigurator import in V2 |
| P | No CableConfiguratorModal import in V2 |
| Q | 81 BOM conflicts preserved |
| R | Readiness classifications |
| S | This document has ≥24 sections |

Run: `npm test` (includes `v2CableConfigurationProductionReadiness.test.ts`).

---

## 20. V1 exclusion

Static analysis confirms V2 `cable-configurator/v2/**` does **not** import:

- `SmartConfigurator`
- `CableConfiguratorModal`
- `cableConstraintEngine`
- `evaluateDynamicFilterOptions`

**Unavoidable shared dependencies (report only):**

- `domain/cableAuthority` (governed domain — shared with server)
- `services/masterDataApiService` (PG read contract)
- `types.ts` shared types

---

## 21. BOM fix scope

**No BOM conflict resolution in 05A.** All 81 official `BOM-CONF-*` groups remain unresolved per 04B-13 OUTCOME B.

---

## 22. Production readiness matrix

| Area | Classification |
|------|----------------|
| routes | LIVE |
| cableMasterAuthority | LIVE |
| technicalParameterEngine | LIVE |
| flowStates | LIVE |
| bomGovernanceBoundary | BLOCKED |
| configurationSnapshot | LIVE |
| customerRbac | PARTIAL |
| internalRbac | LIVE |
| customerIsolation | PARTIAL |
| cuttingLengthHandoff | PARTIAL |
| drumSelectionHandoff | PARTIAL |
| costingHandoff | BLOCKED |
| lsInventory | LIVE |
| serverAudit | PARTIAL |
| uxClarity | PARTIAL |
| v1Exclusion | LIVE |

---

## 23. Required remediation before full production

1. Resolve or govern Cable BOM conflicts (04B-13+) — unblock costing gate
2. Per-cable BOM conflict indicator in V2 result panel (API)
3. Replace LS draft inquiry items with server-persisted inquiry lines
4. Full `customerScope` on cable evaluate when customer portal is primary actor
5. Server-side snapshot persistence (optional) for drum/costing handoff audit chain

---

## 24. Final verdict

**Task 05A outcome: HARDENED PARTIAL**

- V2 cable configuration authority path is **correct and test-evidenced** for Cable Master + technical validation.
- End-to-end production readiness is **NOT claimed** — BOM governance (**BLOCKED**) and partial handoffs prevent quotation-ready status.
- V1 cable configuration remains frozen; no convergence work in 05A.

**STOP** — do not promote to production-ready without resolving §23 blockers and re-running tests A–S.
