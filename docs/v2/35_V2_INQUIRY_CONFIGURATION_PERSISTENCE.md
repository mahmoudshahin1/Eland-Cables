# 35 — V2 Inquiry & Configuration Persistence (Task 05B)

**Date:** 2026-09-05  
**Status:** **PARTIAL — configuration persistence LIVE; Quote-to-Cash NOT production-ready**  
**Prior:** Task 05A (`buildConfigurationSnapshot`, doc 34)  
**Tests:** `src/platform/v2InquiryConfigurationPersistence.test.ts`  
**API:** `/api/v2/inquiries/*`

---

## 1. Executive decision

V2 customer inquiry + cable configuration snapshots are **server-persisted in PostgreSQL** with customer isolation, governed status transitions, and immutable snapshot evidence. **Quotation, costing execution, cutting-length/drum downstream, and full Quote-to-Cash remain out of scope.**

**Task 05B did not modify Cable BOM governance, Costing V2, Drum rules, or V1 Cable Configuration.**

---

## 2. Architectural flow

```text
Customer (auth) → POST /api/v2/inquiries
  → CommercialInquiry (workflowChannel=V2_CONFIGURATION)
  → CommercialInquiryLine
  → V2ConfigurationSnapshot (immutable, versioned)
  → Engineering status (ENGINEERING_REVIEW / BLOCKED / READY_FOR_COMMERCIAL)
  → TechnicalOfficeRequest (when TECHNICALLY_VALID_NOT_MASTER)
```

Submitted inquiry data **must not** rely on localStorage authority.

---

## 3. Audit-first classification (pre-05B → post-05B)

| Area | Pre-05B | Post-05B |
|------|---------|----------|
| CommercialInquiry / Line (Prisma) | LIVE | **REUSED** |
| V2 snapshot table | MISSING | **LIVE** |
| `/api/inquiries` (V1 commercial) | LIVE | **UNCHANGED** |
| `/api/v2/inquiries` | MISSING | **LIVE** |
| `buildConfigurationSnapshot()` | LIVE (client) | **LIVE** (server rebuild on persist) |
| Inquiry numbering | MOCK (stamp+random) on legacy path | **LIVE** (`INQ_COMMERCIAL` sequence on V2 path) |
| `energya_erp_request_items_v2` | CACHE | **CACHE** (non-authoritative) |
| `energya_v2_technical_requests` | NON_AUTHORITATIVE | **NON_AUTHORITATIVE** |
| POST `/api/cables/evaluate` customer scope | PARTIAL | **IMPROVED** (scope from auth) |
| TCR linkage | LIVE (commercialRepository) | **LIVE** (V2 snapshot path) |
| Quotation | LIVE (separate) | **NOT IMPLEMENTED in 05B** |

---

## 4. Domain model

Reuses existing Prisma models — no competing inquiry system:

- `CommercialInquiry` — header, `commercialMetadata.workflowChannel = 'V2_CONFIGURATION'`
- `CommercialInquiryLine` — line + `v2CurrentSnapshotId`
- `V2ConfigurationSnapshot` — immutable configuration evidence (new)
- `TechnicalOfficeRequest` — existing TCR (no second system)

---

## 5. Snapshot semantics

Server calls `buildConfigurationSnapshot()` after `evaluatePersistedCable()` rebuild. Each persist creates a **new version** (`versionNo++`). Fields persisted:

- `snapshotId`, material/item/customer codes
- `selections`, `configInput`, validation/flow/engineering status
- catalog authority, BOM governance flags, downstream gates
- actor context, `capturedAt`

Submitted inquiries reject further snapshot mutation (`INVALID_STATE`).

---

## 6. Inquiry numbering

V2 create uses `allocateNextNumber('INQ_COMMERCIAL')` — format `INQ{YY}-{#####}`. Legacy `/api/inquiries` create path unchanged (documented gap from Task 02).

---

## 7. Server API surface

| Method | Route | Purpose |
|--------|-------|---------|
| POST | `/api/v2/inquiries` | Create V2 inquiry |
| GET | `/api/v2/inquiries` | List (customer-scoped) |
| GET | `/api/v2/inquiries/:id` | Detail + lines + snapshots |
| POST | `/api/v2/inquiries/:id/lines` | Add line |
| GET | `/api/v2/inquiries/:id/lines` | List lines |
| POST | `/api/v2/inquiries/:id/lines/:lineId/snapshots` | Persist snapshot |
| GET | `/api/v2/inquiries/:id/lines/:lineId/snapshots` | List snapshots |
| POST | `/api/v2/inquiries/:id/submit` | Submit (requires snapshots) |
| POST | `/api/v2/inquiries/:id/engineering-status` | Internal engineering transition |

---

## 8. Customer isolation (HARD)

- Customer identity from `resolveCustomerScope(actor)` only
- `customerId` / `customerCode` in request body **ignored** as security boundary on create
- `assertCanAccessInquiryOwnership` on every read/mutation
- IDOR tests: Customer B cannot GET Customer A inquiry (403)

---

## 9. Inquiry status workflow

Enum extended: `ENGINEERING_REVIEW`, `ENGINEERING_BLOCKED`, `READY_FOR_COMMERCIAL`.

Legal V2 transitions (`src/domain/v2InquiryWorkflow.ts`):

- `DRAFT → SUBMITTED → ENGINEERING_REVIEW → (ENGINEERING_BLOCKED | READY_FOR_COMMERCIAL) → QUOTED`

Submit auto-derives engineering outcome from snapshot BOM/flow states.

---

## 10. BOM governance

81 unresolved conflicts **untouched**. Snapshots record `bomGovernanceBlocked` and `unresolvedBomConflictCount`. Inquiries may exist while costing remains blocked.

---

## 11. TCR linkage

When validation is `TECHNICALLY_VALID_NOT_MASTER`, persist creates/links `TechnicalOfficeRequest` via existing `createTechnicalOfficeRequest`. LS `energya_v2_technical_requests` remains non-authoritative.

---

## 12. localStorage inventory

| Key | Classification | 05B posture |
|-----|----------------|-------------|
| `energya_erp_request_items_v2` | CACHE | Draft cutting rows only |
| `energya_v2_technical_requests` | NON_AUTHORITATIVE | TCR mirror |
| `energya_cable_boms_v3` | PROHIBITED | Not authority |

Flow: Browser → POST API → PG transaction → optional LS mirror.

---

## 13. Transactional integrity

`persistV2ConfigurationSnapshot` uses `prisma.$transaction`: snapshot insert + line update + inquiry metadata in one unit.

---

## 14. Audit

`appendServerAudit` on: V2 inquiry create, line create, snapshot persist, submit, engineering transitions.

---

## 15. POST `/api/cables/evaluate` fix

- Resolves actor from JWT when present
- Customer users: `customerCode` derived from scope (body spoof ignored)
- Response includes `evaluationMode` and `customerScopeApplied`
- Anonymous/public evaluate still supported for technical parameter evaluation

---

## 16. Downstream boundaries (NOT implemented)

No implementation of: cutting length persistence, drum selection, costing runs, commercial pricing, quotation creation in 05B. Snapshot `downstreamGates` recorded for future handoff only.

---

## 17. UI (minimal)

- `CableConfiguratorV2`: **Save configuration snapshot** button + inquiry panel
- `V2InquiryConfigurationPanel`: customer/internal list & inspect
- `InquiryQuotationWorkspace`: internal V2 panel above legacy list

---

## 18. Immutability

Submitted inquiries block new snapshots. New configuration on a submitted inquiry requires a new inquiry (revision versioning of legacy commercial path not wired in 05B).

---

## 19. Migration

`prisma/migrations/20260905120000_v2_inquiry_configuration_snapshot`:

- `V2ConfigurationSnapshot` table
- `CommercialInquiryLine.v2CurrentSnapshotId`
- `InquiryStatus` enum extensions
- `INQ_COMMERCIAL` number sequence seed

---

## 20. Validation evidence

| Check | Result |
|-------|--------|
| `v2InquiryConfigurationPersistence.test.ts` | 7 pass (incl. IDOR) |
| `v2CableConfigurationProductionReadiness.test.ts` | 22 pass |
| `costingEngine.test.ts` | 13 pass (unchanged) |
| `drumSelectionService.test.ts` | 7 pass (unchanged) |
| `tsc --noEmit` | pass |
| `prisma validate` | pass |

---

## 21. Frozen boundaries (reaffirmed)

- Cable BOM 81 conflicts (04B-13)
- Costing V2 / Decision 5 / `costingEngine`
- Drum Master / Drum Selection / Drum Optimization
- Commercial Fulfillment WIP
- D365 integration
- V1 `SmartConfigurator` / `CableConfiguratorModal`

---

## 22. Known gaps

- Legacy `/api/inquiries` still uses stamp+random numbering
- Full npm test suite not re-run in 05B gate (focused tests only)
- Customer dashboard does not yet deep-link V2 inquiry from list tile
- Per-cable BOM conflict API in V2 config UI still platform-level only

---

## 23. Files added/changed (05B scope)

- `src/server/v2InquiryConfigurationRepository.ts`
- `src/server/v2InquiryConfigurationRoutes.ts`
- `src/services/v2InquiryConfigurationApiService.ts`
- `src/domain/v2InquiryWorkflow.ts`
- `src/components/inquiry-quotation/V2InquiryConfigurationPanel.tsx`
- `src/platform/v2InquiryConfigurationPersistence.test.ts`
- `docs/v2/35_V2_INQUIRY_CONFIGURATION_PERSISTENCE.md`
- Prisma migration + schema + seed sequence
- `server.ts`, `cableAuthorityRoutes.ts`, `CableConfiguratorV2.tsx`, `InquiryQuotationWorkspace.tsx`, `package.json`

---

## 24. Production readiness statement

**V2 inquiry + configuration snapshot persistence is LIVE for governed draft/submit/engineering-status recording.**

**Quote-to-Cash is NOT production-ready.** Costing and quotation remain blocked by Cable BOM governance and are explicitly out of 05B scope.

---

## 25. Task 05B final report (§27 checklist)

1. **Objective met (partial):** Server persistence for V2 inquiry + configuration — **YES**
2. **BOM governance untouched:** **YES**
3. **Costing V2 untouched:** **YES**
4. **Drum rules untouched:** **YES**
5. **V1 config untouched:** **YES**
6. **Fulfillment WIP untouched:** **YES**
7. **D365 untouched:** **YES**
8. **Reuse CommercialInquiry/Line:** **YES**
9. **buildConfigurationSnapshot reused:** **YES**
10. **Number sequence on V2 create:** **YES**
11. **Customer isolation tested:** **YES (IDOR)**
12. **RBAC on routes:** **YES**
13. **Status terminology:** **YES (enum extended)**
14. **TCR linkage:** **YES**
15. **LS classified, not authority:** **YES**
16. **Transactional persist:** **YES**
17. **appendServerAudit:** **YES**
18. **evaluate customer scope:** **YES**
19. **Immutable submitted snapshots:** **YES**
20. **Tests file wired:** **YES**
21. **Migration new-only:** **YES**
22. **Doc 35 (20 sections):** **YES**
23. **05A tests green:** **YES**
24. **tsc / prisma validate:** **YES**
25. **Single commit requested:** Pending user `git commit`
26. **Do not claim Q2C production-ready:** **Acknowledged**
27. **Explicit non-modification statement:** Task 05B did not modify Cable BOM governance, Costing V2, Drum rules, or V1 Cable Configuration.
