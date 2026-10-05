# TASK 05C — Cutting Length + Durable Handoff — Implementation Readiness

**Date:** 2026-09-05  
**Base commit:** `663a00b` (frozen Task 05B)  
**Status:** **READINESS ONLY — NOT production-ready; no implementation in this task**  
**Prior:** Task 05A (`docs/v2/34_V2_CABLE_CONFIGURATION_PRODUCTION_READINESS.md`), Task 05B (`docs/v2/35_V2_INQUIRY_CONFIGURATION_PERSISTENCE.md`)

---

## Executive summary

V2 cable **configuration** is server-persisted and versioned (`V2ConfigurationSnapshot`). **Cutting length is not.** Today it lives in React component state and `localStorage` (`energya_erp_request_items_v2`), with no Prisma model, no API, and no durable link from `CommercialInquiryLine` → snapshot → cutting plan → drum selection.

Task 05C must establish an **authoritative, immutable, versioned Cutting Length domain** between `CommercialInquiryLine` and `V2ConfigurationSnapshot`, with a **deterministic handoff contract** into the existing `drumSelectionService` boundary—without modifying frozen domains (Costing V2, Drum Master/Optimization internals, Cable BOM governance, Commercial Fulfillment WIP, V1 config, D365).

---

## 1. Current State

### 1.1 Prisma schema (what exists)

| Model / field | Location | Role today |
|---------------|----------|------------|
| `CommercialInquiry` | `prisma/schema.prisma` L681–723 | V2 inquiries via `commercialMetadata.workflowChannel = 'V2_CONFIGURATION'` |
| `CommercialInquiryLine` | L778–828 | Line quantities; **legacy scalars** `cuttingLengthMeters`, `cableTolerancePercent`, `drumSchedule`, `drumType`, `requestedLengthMeters`; `v2CurrentSnapshotId` (internal cuid → latest config snapshot row) |
| `V2ConfigurationSnapshot` | L831–866 | **Immutable** config evidence; `versionNo`, `downstreamGates`, cable identity, validation/flow state |
| `InquiryLineStatus` enum | L591–600 | `DRAFT`, `CONFIGURATION_REQUIRED`, `TECHNICAL_OFFICE_REQUIRED`, `CABLE_VALIDATED`, … — **no cutting-specific status** |
| `CommercialQuotationLine.cuttingLengthMeters` | L944 | Downstream copy field (quotation snapshot) |
| `EpcSalesOrderLine.cuttingLengthMeters` | L1079 | Fulfillment copy field |

**MISSING:** Any `V2CuttingLength*`, `CuttingPlan`, or dedicated cutting-length table. No FK from cutting data → `V2ConfigurationSnapshot`.

### 1.2 V2 configuration persistence (Task 05B — LIVE)

- Repository: `src/server/v2InquiryConfigurationRepository.ts`
- Routes: `src/server/v2InquiryConfigurationRoutes.ts` → `/api/v2/inquiries/*`
- Client: `src/services/v2InquiryConfigurationApiService.ts`
- UI: `CableConfiguratorV2.tsx` — **Save configuration snapshot** → `persistV2ConfigurationSnapshot`
- Snapshot versioning: `versionNo++` per line; `snapshotId` format `v2cfg-{inquiryNumber}-L{lineNumber}-v{n}`
- `v2CurrentSnapshotId` stores **`V2ConfigurationSnapshot.id`** (cuid), not `snapshotId` string
- Submit (`submitV2Inquiry`): requires **configuration snapshot per line** only; **does not** require cutting length
- Submitted inquiries block new configuration snapshots (`INVALID_STATE`)

### 1.3 Cutting length UI (Task 05A — PARTIAL)

`src/components/cable-configurator/v2/components/CuttingLengthSectionV2.tsx`:

- Gated in parent by `canProceedToDownstream(configurationSnapshot, 'cuttingLength')` (`CableConfiguratorV2.tsx` L199, L498–515)
- Receives `configurationSnapshotId` for **display only** (L115, L503) — **not persisted or validated server-side**
- State: local `useState` — `cuttingLength` (default 500), `drumType`, `tolerance` (display strings), `specialReqs` (unused in persist path)
- UI bounds: `min={50}` `max={5000}` on input; `onChange` allows `Math.max(10, …)` — **inconsistent**
- **Authoritative write:** `localStorage.setItem('energya_erp_request_items_v2', …)` (L58–92)
- Builds `ErpRequestItem` with `drumDetails` (single drum, `noOfDrums: 1`)
- Hard-coded tare `estimatedDrumWeightKg = 120` — not Drum Master engineering
- Tolerance stored as free-text in `drumsList[].notes`, **not** `cableTolerancePercent`

Classification (documented): `V2_CABLE_CONFIG_LS_INVENTORY` → `energya_erp_request_items_v2` = **CACHE** (`v2CableConfigurationService.ts` L87–90).

### 1.4 Downstream gates (LIVE, read-only for cutting)

`src/components/cable-configurator/v2/services/v2CableConfigurationService.ts`:

- `evaluateDownstreamGates`: `cuttingLength` and `drumSelection` both `true` when `EXISTING_APPROVED|EXISTING_CABLE` + `catalogAuthoritative` + resolved `materialNumber`
- `canProceedToDownstream(snapshot, stage)` — used by UI only; **no server enforcement** for cutting persistence
- `cuttingLengthHandoff` readiness: **PARTIAL** (L300–303)
- Costing/quotation gates blocked when `bomGovernanceBlocked` — unchanged freeze

### 1.5 Drum selection handoff (frozen service — consumption only)

`src/services/drumSelectionService.ts` — `selectDrum(input: DrumSelectionInput)`:

| Input field | Source today (V2) | Required for AUTOMATIC |
|-------------|-------------------|------------------------|
| `cuttingLengthMeters` | **Not wired from V2** | Yes (> 0) |
| `cableDiameterMm` | Available on config snapshot (`estimatedDiameterMm`) | Yes |
| `cableWeightKgKm` | Available on config snapshot (`estimatedWeightKgKm`) | Yes |
| `drumMaster` | PG Drum Master (separate load) | Yes |
| `method` | MANUAL \| AUTOMATIC | — |

AUTOMATIC path calls `optimizeDrumPlan` (`domain/drumOptimizationService.ts`) with `cableTolerancePercent: 0` hard-coded in `selectDrum` (L58) — **handoff must supply tolerance explicitly in 05C contract** without changing optimization internals.

Tests: `drumSelectionService.test.ts` (7 pass) — engineering fields required for auto-select.

### 1.6 Legacy / V1 validation assets (reusable, not V2-wired)

| Asset | Path | Notes |
|-------|------|-------|
| Production min/max | `src/services/cuttingLengthValidationService.ts` | `getMinimumProductionLength`, `getMaximumContinuousLength`, `validateCuttingLength` — uses `ResolvedCableStructure` (V1 type) |
| Line vs cut check | `src/domain/drumPlanService.ts` | `validateCuttingLength(requestedLengthMeters, cuttingLengthMeters)` |
| Order/drum tolerance math | `src/domain/inquiryDrumSchedule.ts` | `computeCableOrderLengthRange`, `computeDrumScheduleRowMetrics`, `buildInquiryDrumSchedule` |
| V1 UI | `CuttingLengthStepSection.tsx` | Full validation UX; SmartConfigurator path |
| Commercial inquiry lines | `CommercialInquiryDetail.tsx`, `CableSearchSelectModal.tsx` | Persist `cuttingLengthMeters`, `cableTolerancePercent`, `drumSchedule` via **V1** `/api/inquiries` |

V1 commercial line fields on `CommercialInquiryLine` are **mutable** and shared with legacy inquiry workspace — **not authoritative for V2** until 05C defines ownership.

### 1.7 Tests (current coverage)

| Test file | Cutting length coverage |
|-----------|-------------------------|
| `v2CableConfigurationProductionReadiness.test.ts` | Gate J/K — `canProceedToDownstream` for `cuttingLength` / `drumSelection` |
| `v2InquiryConfigurationPersistence.test.ts` | Config snapshot + submit; **no cutting plan** |
| `drumSelectionService.test.ts` | Input contract for `cuttingLengthMeters` |
| `inquiryDrumSchedule.test.ts` | Tolerance aggregation |
| `commercialInquiryApiService.test.ts` | V1 `drumSchedule` aggregation |

**MISSING:** Any test for V2 cutting persistence, snapshot FK integrity, or drum handoff from persisted plan.

### 1.8 Documentation alignment

- Doc 34 §13: cutting length handoff **PARTIAL**; LS draft items **CACHE**
- Doc 35 §16: explicitly **no** cutting length persistence in 05B
- Doc 35 §12: `energya_erp_request_items_v2` remains non-authoritative post-05B

---

## 2. Target State

### 2.1 Authoritative chain

```text
CommercialInquiry (V2_CONFIGURATION)
  └── CommercialInquiryLine
        ├── V2ConfigurationSnapshot (immutable, versioned)     ← config baseline [05B LIVE]
        └── V2CuttingLengthPlan (immutable, versioned)         ← NEW [05C]
              ├── FK → exact configurationSnapshotId (+ versionNo)
              ├── requested length + tolerance semantics
              ├── optional multi-row drumSchedule (pre–drum-selection)
              └── handoff DTO → drumSelectionService (read-only)
```

### 2.2 Principles (non-negotiable)

1. **V2ConfigurationSnapshot** = configuration baseline; cutting plan **must** reference the exact snapshot row used at save time.
2. **Never** use `localStorage` or React-only state as transactional authority for submit, engineering review, or drum selection.
3. **`energya_erp_request_items_v2`** = temporary UI/cache only; retired from write path in V2 happy path.
4. **Do not** implement Drum Optimization changes, Costing runs, quotation creation, or Fulfillment WIP integration in 05C.
5. Reuse `CommercialInquiry` / `CommercialInquiryLine`; do not create a parallel inquiry system.

### 2.3 Success criteria (05C implementation gate)

- Persist cutting plan via API in same transactional style as 05B
- Server validates against linked snapshot (`flowState === 'VALID'`, `catalogAuthoritative`, gates)
- `canProceedToDownstream` equivalent enforced server-side before persist
- Deterministic `DrumSelectionHandoffDto` derivable from plan + snapshot
- `appendServerAudit` on create/supersede
- Customer isolation via `loadV2InquiryScoped` / `assertCanAccessInquiryOwnership`
- UI: `CuttingLengthSectionV2` saves to API, not LS (LS optional read-only migration shim only)
- Tests: persistence, IDOR, snapshot mismatch rejection, handoff DTO shape

**Not claimed:** Production-ready Quote-to-Cash, auto drum optimization UI, or costing integration.

---

## 3. Domain Model

### 3.1 Proposed Prisma model: `V2CuttingLengthPlan`

New immutable, versioned entity (mirror `V2ConfigurationSnapshot` pattern).

```prisma
/// Immutable V2 cutting-length evidence linked to inquiry line + configuration snapshot (Task 05C).
model V2CuttingLengthPlan {
  id                         String                @id @default(cuid())
  planId                     String                @unique   // e.g. v2cut-INQ26-00042-L1-v3
  versionNo                  Int                   @default(1)

  inquiryLineId              String
  inquiryLine                CommercialInquiryLine @relation(fields: [inquiryLineId], references: [id], onDelete: Cascade)

  /// FK to exact configuration snapshot row used for this plan (cuid, matches v2CurrentSnapshotId style).
  configurationSnapshotId    String
  configurationSnapshot      V2ConfigurationSnapshot @relation(fields: [configurationSnapshotId], references: [id], onDelete: Restrict)
  configurationSnapshotVersionNo Int
  configurationSnapshotIdString String              // denormalized snapshotId for audit/display

  // Order semantics
  requestedLengthMeters      Decimal               // total order length (line level)
  quantityUom                String                @default("M")
  cableTolerancePercent      Decimal               @default(1)  // order-level %

  // Primary cut (single-drum MVP; multi-drum via schedule JSON)
  cuttingLengthMeters        Decimal               // nominal per-drum cut (or total if single drum)
  numberOfDrums              Int                   @default(1)
  prototypeDrumType          String?               // UI label only until drum selection

  /// Pre-selection schedule; shape aligns with InquiryDrumSchedule (inquiryDrumSchedule.ts).
  drumSchedule               Json?

  // Derived validation envelope (persisted at save for audit reproducibility)
  minAllowedLengthM          Decimal?
  maxAllowedLengthM          Decimal?
  minProductionLengthM       Decimal?
  maxContinuousLengthM       Decimal?

  // Weights from snapshot cable physicals
  estimatedCableWeightKgKm   Decimal?
  estimatedNetWeightKg         Decimal?
  estimatedGrossWeightKg       Decimal?
  estimatedTareWeightKg        Decimal?

  validationStatus           String                // VALID | WARNING | INVALID
  flowState                  String                // DRAFT | VALIDATED | LOCKED | SUPERSEDED
  blockingReasons            Json?
  warnings                   Json?

  /// Drum-selection readiness (computed; does not invoke optimizer)
  drumHandoffReady           Boolean               @default(false)
  drumHandoffPayload         Json?                 // deterministic DTO snapshot

  actorId                    String?
  actorEmail                 String?
  actorRole                  String?

  capturedAt                 DateTime              @default(now())
  createdAt                  DateTime              @default(now())

  @@index([inquiryLineId])
  @@index([inquiryLineId, versionNo])
  @@index([configurationSnapshotId])
  @@index([capturedAt])
}
```

### 3.2 `CommercialInquiryLine` extensions (proposed)

```prisma
  v2CurrentCuttingPlanId     String?               // cuid → latest plan row
  v2CuttingPlans             V2CuttingLengthPlan[]
```

**Decision:** Keep legacy `cuttingLengthMeters`, `cableTolerancePercent`, `drumSchedule` on line as **denormalized projection** updated on plan persist (for V1 workspace compatibility) OR stop writing them from V2 and expose plan via API only. **Product decision required** (§14).

### 3.3 `V2ConfigurationSnapshot` extension (proposed)

```prisma
  cuttingPlans               V2CuttingLengthPlan[]
```

Enables referential integrity: plan cannot reference deleted snapshot; `onDelete: Restrict` prevents orphan plans.

### 3.4 Relationships

| From | To | Cardinality | Rule |
|------|-----|-------------|------|
| `CommercialInquiryLine` | `V2ConfigurationSnapshot` | 1:N | Config versions (05B) |
| `CommercialInquiryLine` | `V2CuttingLengthPlan` | 1:N | Cutting versions (05C) |
| `V2CuttingLengthPlan` | `V2ConfigurationSnapshot` | N:1 | **Each plan references exactly one snapshot row** |
| `CommercialInquiry` | (via line) | — | Customer scope inherited |

**Invariant:** `configurationSnapshotId` on plan must equal line’s `v2CurrentSnapshotId` **at persist time** OR user explicitly saves against a chosen historical snapshot (advanced; default = current only).

### 3.5 What exists vs MISSING

| Capability | Exists | Missing |
|------------|--------|---------|
| Config snapshot table | ✅ | — |
| Cutting plan table | ❌ | `V2CuttingLengthPlan` |
| Line pointer to current plan | ❌ | `v2CurrentCuttingPlanId` |
| Snapshot → plan FK | ❌ | — |
| Server validation service | Partial (V1 libs) | V2 adapter + server entry |
| API routes | ❌ | `/cutting-plans` |
| UI persist | ❌ (LS only) | API integration |
| Submit requires cutting plan | ❌ | Optional gate (decision) |
| Drum handoff DTO persistence | ❌ | `drumHandoffPayload` |

---

## 4. Lifecycle

### 4.1 Plan `flowState` (proposed)

| State | Meaning | Transitions |
|-------|---------|-------------|
| `DRAFT` | Client editing; not yet validated server-side | → `VALIDATED` on successful POST |
| `VALIDATED` | Server accepted; references locked snapshot | → `LOCKED` on inquiry submit; → `SUPERSEDED` on new version |
| `LOCKED` | Inquiry submitted; immutable | → `SUPERSEDED` only if inquiry returns to DRAFT (out of scope 05B—**decision**) |
| `SUPERSEDED` | Older version retained for audit | terminal |

### 4.2 Line `InquiryLineStatus` (proposed extensions)

After validated cutting plan:

| Current (05B) | Proposed addition |
|---------------|-------------------|
| `CABLE_VALIDATED` (on config save) | `CUTTING_LENGTH_VALIDATED` or reuse `CABLE_VALIDATED` + metadata |

**Recommendation:** Add `CUTTING_LENGTH_VALIDATED` to enum for clarity; map to existing commercial displays as “Technical ready”.

### 4.3 Versioning / amendment

- Each POST creates **new** `versionNo++` row (immutable), same pattern as configuration snapshot.
- Amending configuration snapshot **invalidates** cutting plans tied to older snapshot versions:
  - Server rejects drum handoff if `plan.configurationSnapshotId !== line.v2CurrentSnapshotId`
  - UI prompts: “Configuration changed — re-save cutting length”
- **No in-place UPDATE** of plan rows (audit requirement).

### 4.4 Inquiry submit interaction

| Option | Behavior |
|--------|----------|
| A (strict) | `submitV2Inquiry` requires `v2CurrentCuttingPlanId` per line + `drumHandoffReady` |
| B (phased) | Submit allows config-only; cutting required before `READY_FOR_COMMERCIAL` transition |
| C (current) | No cutting requirement |

**05B behavior:** Option C. **05C recommendation:** Option B — align with engineering workflow without blocking config-only drafts.

### 4.5 Multiple cutting plans per line

- **Yes** — version history via `versionNo`, same as snapshots.
- **Active plan:** `v2CurrentCuttingPlanId` on line.
- Multi-row `drumSchedule` within one plan for multi-drum **pre**-optimization schedules (V1 pattern in `inquiryDrumSchedule.ts`).

---

## 5. Validation Rules

### 5.1 Server gate (prerequisite)

Before accepting cutting plan:

1. Load inquiry via `loadV2InquiryScoped`
2. Inquiry `status === 'DRAFT'` (same as snapshot persist)
3. Load `configurationSnapshot` by `configurationSnapshotId`
4. Assert `snapshot.flowState === 'VALID'`
5. Assert `snapshot.catalogAuthoritative === true`
6. Assert `snapshot.downstreamGates.cuttingLength === true` (recompute via `buildConfigurationSnapshot` or trust persisted gates with recompute check)
7. Assert `snapshot.cableMaterialNumber` present

### 5.2 Requested length and cutting length

| Rule | Source | Proposed enforcement |
|------|--------|---------------------|
| `cuttingLengthMeters > 0` | `drumPlanService.validateCuttingLength` | Hard error |
| `cuttingLengthMeters <= requestedLengthMeters` | `drumPlanService.ts` L42–46 | Hard error (per-drum cut vs total order) |
| `requestedLengthMeters > 0` | Commercial convention | Hard error |
| `numberOfDrums >= 1` | Business | Hard error |
| `sum(rows.noOfDrums * rows.cuttingLengthM)` ≈ `requestedLengthMeters` | V1 `commercialInquiryApiService` | Warning or error (**decision**) |

**Clarification needed:** In V2 UI today, `cuttingLength` is per-drum and `requestedLengthMeters` defaults to 1000 on line create — **not surfaced in CuttingLengthSectionV2**. 05C UI must expose order total vs per-drum cut.

### 5.3 Tolerance semantics

Align with `src/domain/inquiryDrumSchedule.ts`:

| Level | Field | Semantics |
|-------|-------|-----------|
| Order | `cableTolerancePercent` | `computeCableOrderLengthRange(totalNominalM, pct)` → min/max order length |
| Per-drum row | `drumTolerancePercent` | `computeDrumScheduleRowMetrics` → min/max per schedule row |

`CuttingLengthSectionV2` tolerance dropdown (±1%, ±0.5%, etc.) maps to **numeric** `cableTolerancePercent` — not free-text in `notes`.

**Default:** 1% (matches “± 1% Standard”).

### 5.4 Min/max derivation

| Bound | Derivation (proposed) |
|-------|----------------------|
| `minProductionLengthM` | Adapt `getMinimumProductionLength` from `cuttingLengthValidationService.ts` using snapshot `estimatedDiameterMm`, `estimatedWeightKgKm`, selections voltage/armour |
| `maxContinuousLengthM` | Adapt `getMaximumContinuousLength` |
| `minAllowedLengthM` / `maxAllowedLengthM` | `computeCableOrderLengthRange(requestedLengthMeters, cableTolerancePercent)` |
| Per-drum min/max | From schedule row metrics when `drumSchedule` present |

Persist computed bounds on plan row for audit reproducibility (snapshot physicals may not change, but validation rules might).

### 5.5 Validation status

| Status | Condition |
|--------|-----------|
| `INVALID` | Hard rule failure (≤0, exceeds continuous limit, snapshot mismatch) |
| `WARNING` | Below min production, drum capacity advisory (pre-optimization) |
| `VALID` | Passes hard rules |

`drumHandoffReady`: `VALID` or `WARNING` + required numeric fields for `DrumSelectionInput` — **decision** whether WARNING blocks AUTOMATIC.

### 5.6 V2 vs V1 validation

- **Do not import** V1 `SmartConfigurator` into V2 path.
- **Do** extract shared pure functions into `src/domain/v2CuttingLengthService.ts` (new) that accepts snapshot-derived cable physicals + `SelectionStateV2`.
- Reuse `inquiryDrumSchedule.ts` unchanged for tolerance math.

---

## 6. Snapshot Dependency

### 6.1 Required linkage

Every `V2CuttingLengthPlan` must store:

- `configurationSnapshotId` (cuid FK)
- `configurationSnapshotVersionNo`
- `configurationSnapshotIdString` (`snapshotId` human id)

### 6.2 Staleness rules

| Event | Cutting plan effect |
|-------|---------------------|
| New config snapshot persisted | Previous plans remain but `v2CurrentCuttingPlanId` may point to stale plan → UI warning |
| Handoff / drum selection | Must use plan whose `configurationSnapshotId === line.v2CurrentSnapshotId` |
| Submit with stale plan | Reject with `STALE_CONFIGURATION_SNAPSHOT` |

### 6.3 Physical fields for drum handoff (from snapshot)

| DrumSelectionInput field | Snapshot source |
|--------------------------|-----------------|
| `cableDiameterMm` | `estimatedDiameterMm` |
| `cableWeightKgKm` | `estimatedWeightKgKm` |
| Material identity | `cableMaterialNumber`, `itemCode`, `customerCode` |

Cutting plan supplies `cuttingLengthMeters` (and tolerances for future optimizer calls).

### 6.4 `downstreamGates` interaction

Persisted snapshot already records `downstreamGates.cuttingLength` and `.drumSelection`. Cutting plan persist should **not** mutate snapshot; it may record copy of gates at capture time in `drumHandoffPayload` for audit.

---

## 7. API Contract

### 7.1 Proposed routes

Mount under existing router: `src/server/v2InquiryConfigurationRoutes.ts` (or `v2CuttingLengthRoutes.ts` included from same mount).

| Method | Route | Purpose |
|--------|-------|---------|
| POST | `/api/v2/inquiries/:id/lines/:lineId/cutting-plans` | Create new plan version |
| GET | `/api/v2/inquiries/:id/lines/:lineId/cutting-plans` | List versions |
| GET | `/api/v2/inquiries/:id/lines/:lineId/cutting-plans/current` | Current plan DTO |
| GET | `/api/v2/inquiries/:id/lines/:lineId/cutting-plans/:planId/handoff` | Deterministic drum handoff DTO (read-only) |

**No DELETE.** **No PATCH** on immutable rows.

### 7.2 POST body (proposed)

```typescript
interface PersistV2CuttingLengthPlanInput {
  configurationSnapshotId?: string; // default: line.v2CurrentSnapshotId
  requestedLengthMeters: number;
  cuttingLengthMeters: number;
  numberOfDrums?: number;             // default 1
  cableTolerancePercent?: number;     // default 1
  prototypeDrumType?: string;
  drumSchedule?: InquiryDrumSchedule; // optional multi-row
  quantityUom?: string;               // default 'M'
}
```

### 7.3 POST response (proposed)

```typescript
{
  inquiry: V2InquiryDto;
  line: V2InquiryLineDto;           // includes v2CurrentCuttingPlanId, projection fields
  plan: V2CuttingLengthPlanDto;
  handoff: DrumSelectionHandoffDto;  // preview
}
```

### 7.4 Error codes (align with 05B)

| Code | HTTP | When |
|------|------|------|
| `NOT_FOUND` | 404 | Inquiry/line/snapshot |
| `INVALID_STATE` | 409 | Not DRAFT, stale snapshot, inquiry submitted |
| `VALIDATION_FAILED` | 400 | Cutting rules |
| `SNAPSHOT_REQUIRED` | 409 | No `v2CurrentSnapshotId` |
| `STALE_CONFIGURATION_SNAPSHOT` | 409 | Plan references non-current snapshot |
| `UNAUTHORIZED` | 403 | IDOR / customer |

### 7.5 Client service (proposed)

`src/services/v2CuttingLengthApiService.ts` — mirror `v2InquiryConfigurationApiService.ts` patterns (`authHeaders`, `parseJson`).

### 7.6 Number sequences

Optional: `allocateNextNumber('V2_CUTTING_PLAN')` — or derive `planId` deterministically like snapshots (`v2cut-{inquiryNumber}-L{n}-v{versionNo}`) without new sequence. **Recommendation:** deterministic string (no new sequence) unless product requires global plan ids.

---

## 8. Security

### 8.1 Reuse 05B patterns

- `requireV2InquiryAuth` → `assertCanManageInquiry` + `assertCustomerBusinessScope`
- `loadV2InquiryScoped` + `assertCanAccessInquiryOwnership` on every route
- Customer body fields (`customerId`, `customerCode`) **ignored** for scope
- Internal-only engineering transitions unchanged

### 8.2 IDOR

Extend `v2InquiryConfigurationPersistence.test.ts` pattern:

- Customer B cannot POST/GET Customer A cutting plans
- Plan ids not guessable across tenants (scoped via inquiry ownership)

### 8.3 Data exposure

`drumHandoffPayload` may contain cable physicals — same classification as snapshot (customer-owned inquiry data).

---

## 9. Audit

### 9.1 `appendServerAudit` events (proposed)

| Entity | Action | When |
|--------|--------|------|
| `V2CuttingLengthPlan` | `PERSIST` | New plan version |
| `CommercialInquiryLine` | `V2_CUTTING_PLAN_LINK` | `v2CurrentCuttingPlanId` updated |
| `CommercialInquiry` | `V2_SUBMIT` | Include cutting plan ids in `newValue` (extend 05B) |

### 9.2 Audit payload

Include: `planId`, `versionNo`, `configurationSnapshotIdString`, `requestedLengthMeters`, `cuttingLengthMeters`, `validationStatus`, `actorId`.

### 9.3 Gap vs 05A

Doc 34 §17: config snapshot had client-only traceability pre-05B; 05B fixed for config. **Cutting still unaudited** — 05C closes this gap.

---

## 10. UI

### 10.1 `CuttingLengthSectionV2` integration points

| Change | Detail |
|--------|--------|
| Remove LS write | Replace `handleAddToRequest` localStorage with `persistV2CuttingLengthPlan` API |
| Require saved config | Disable save until `v2CurrentSnapshotId` exists (inquiry panel state from parent) |
| Pass snapshot cuid | Parent must pass `configurationSnapshotId` as **server id**, not display `snapshotId` only |
| Show validation | Surface `validationStatus`, min/max, warnings from server response |
| Order total field | Add `requestedLengthMeters` input (default from line) |
| Tolerance | Map dropdown → `cableTolerancePercent` number |
| Multi-drum | Phase 2: embed pattern from `InquiryMultiDrumCuttingModal` / `CableSearchSelectModal` |

### 10.2 `CableConfiguratorV2.tsx`

- Thread `activeInquiryId`, `activeLineId`, `v2CurrentSnapshotId` into `CuttingLengthSectionV2`
- After config save, enable cutting save
- Optional: auto-scroll remains (`handleScrollToCutting`)

### 10.3 `V2InquiryConfigurationPanel`

- Display current cutting plan version + link to handoff preview
- Show stale warning when snapshot version > plan’s `configurationSnapshotVersionNo`

### 10.4 Explicit non-goals (UI)

- No Commercial Fulfillment workspace changes
- No drum optimizer UI (`DrumSelectionWorkflowPanel` frozen)
- No costing/quotation buttons enabled

---

## 11. Migration

### 11.1 Database migration (proposed)

New migration e.g. `20260905180000_v2_cutting_length_plan`:

1. Create `V2CuttingLengthPlan` table
2. Add `CommercialInquiryLine.v2CurrentCuttingPlanId` (nullable FK)
3. Add relation on `V2ConfigurationSnapshot`
4. Indexes as in §3.1

**No backfill required** — no authoritative V2 cutting data exists in PG.

### 11.2 Legacy line fields

Optional one-time projection: if V1 line already has `cuttingLengthMeters` and V2 line has snapshot, **do not auto-migrate** without snapshot FK — would violate authority rules.

### 11.3 localStorage retirement strategy

| Phase | Action |
|-------|--------|
| 1 | Stop writes from V2 UI; API authoritative |
| 2 | On V2 inquiry load, ignore LS for bound `inquiryLineId` |
| 3 | Optional: one-time import prompt for orphan LS items (manual, draft inquiries only) |
| 4 | Remove `energya_erp_request_items_v2` from `V2_CABLE_CONFIG_LS_INVENTORY` CACHE notes → **DEPRECATED** |
| 5 | Keep key documented in doc 18 as deprecated until V1 SmartConfigurator retired |

### 11.4 Backward compatibility

- V1 `/api/inquiries` path unchanged
- V2 inquiries can still submit without cutting plan until product enables Option B (§4.4)
- `CommercialInquiryLine.cuttingLengthMeters` remains for legacy UIs; V2 API projection updates optional

---

## 12. Test Strategy

### 12.1 New test file (proposed)

`src/platform/v2CuttingLengthPersistence.test.ts` — mirror 05B HTTP integration style:

1. Create inquiry + line + config snapshot
2. POST cutting plan — 201, `versionNo === 1`
3. POST second plan — `versionNo === 2`, prior plan queryable
4. Reject without snapshot — `SNAPSHOT_REQUIRED`
5. Reject stale `configurationSnapshotId` after new snapshot — `STALE_CONFIGURATION_SNAPSHOT`
6. IDOR — Customer B blocked
7. Validation — `cuttingLengthMeters > requestedLengthMeters` → 400
8. Handoff GET — DTO contains diameter/weight from snapshot + cutting length from plan
9. Submitted inquiry — POST cutting plan → 409 `INVALID_STATE`

### 12.2 Domain unit tests (proposed)

`src/domain/v2CuttingLengthService.test.ts`:

- Min/max derivation from snapshot fixtures
- Tolerance range computation
- `buildDrumSelectionHandoff(plan, snapshot)` shape
- Stale snapshot detection

### 12.3 Regression

- `v2CableConfigurationProductionReadiness.test.ts` — unchanged
- `v2InquiryConfigurationPersistence.test.ts` — unchanged unless submit rules tighten
- `drumSelectionService.test.ts` — add test that handoff DTO satisfies `DrumSelectionInput` (no service modification)

### 12.4 Gate before merge

`npm test` (focused files), `tsc --noEmit`, `prisma validate`

---

## 13. Frozen-Domain Protection

Task 05C implementation **must not modify**:

| Frozen area | Paths / evidence |
|-------------|------------------|
| Costing V2 / Decision 5 | `src/domain/costingEngine.ts`, `costingEngine.test.ts` |
| Cable BOM governance (81 conflicts) | `bomConflictGovernanceService`, `docs/v2/33_*` |
| Drum Master SOT / import | `drumMasterService`, Drum Master migrations |
| Drum optimization engine internals | `src/domain/drumOptimizationService.ts` — **consume only** via existing `selectDrum` |
| `drumSelectionService.ts` logic | Unless purely additive types—prefer handoff adapter in new file |
| Commercial Fulfillment WIP | `CommercialFulfillmentWorkspace.tsx`, `commercialFulfillmentWorkflow.ts` |
| D365 integration | commitment/export paths |
| V1 cable configuration | `SmartConfigurator.tsx`, `CableConfiguratorModal.tsx` |
| V1 `/api/inquiries` behavior | legacy commercial routes |

**Allowed:** New files, new Prisma models, new V2 routes, V2 UI wiring, read-only calls to `selectDrum` / `optimizeDrumPlan` from handoff preview endpoint.

---

## 14. Risks / Decisions Required

### 14.1 Product owner decisions

| # | Question | Options | Recommendation |
|---|----------|---------|----------------|
| 1 | Is cutting plan **required** at inquiry submit? | A strict / B phased / C optional | **B** — required before `READY_FOR_COMMERCIAL` |
| 2 | Single-drum MVP vs multi-row `drumSchedule` in 05C? | MVP single / full multi | **MVP single** + schema supports `drumSchedule` |
| 3 | Update legacy `CommercialInquiryLine` scalars on plan save? | Yes projection / No | **Yes** — keeps inquiry workspace readable |
| 4 | Map tolerance dropdown to symmetric ±%? | ±1% → 1 / 2 / 0.5 | **Yes**, store numeric percent only |
| 5 | Does `WARNING` validation allow drum AUTOMATIC? | Block / Allow | **Allow with warnings** in handoff payload |
| 6 | Can users pin an **old** config snapshot for cutting? | No / Yes (TO only) | **No** for 05C MVP |
| 7 | `requestedLengthMeters` vs `cuttingLength * numberOfDrums` — which is primary? | Order total vs per-drum | **Order total primary**; per-drum derived |
| 8 | New `InquiryLineStatus` value vs metadata? | Enum / JSON | **Enum** `CUTTING_LENGTH_VALIDATED` |
| 9 | Hard-coded tare 120 kg in UI — replace with? | Drum Master lookup / omit until drum step | **Omit tare** from cutting plan; drum step owns weight |
| 10 | Retire LS immediately or parallel run? | Hard cut / parallel | **Parallel read-only** one release, then remove writes |

### 14.2 Technical risks

| Risk | Mitigation |
|------|------------|
| V1 and V2 write same line scalars | Namespace by `workflowChannel`; V2 only updates via plan persist |
| `selectDrum` uses `cableTolerancePercent: 0` | Handoff documents tolerance; future task passes through without changing optimizer |
| V2 `CableRecordV2` ≠ `ResolvedCableStructure` | Adapter layer in `v2CuttingLengthService` |
| Config UI snapshot is client-built until save | Cutting save must require **persisted** server snapshot id |
| `estimatedDiameterMm` may differ from Drum Master | Use snapshot values consistently; document as handoff contract |

### 14.3 Ambiguities

- **Special requirements** field in UI (`specialReqs`) — no schema home; drop or add `notes` on plan?
- **Unit price** in LS `ErpRequestItem` — commercial pricing out of scope
- **Engineering approval** path (`TECHNICALLY_VALID_NOT_MASTER`) — cutting gate already false (no `matchingCable`); consistent

---

## 15. Recommended Implementation Sequence

1. **Domain + types** — `v2CuttingLengthService.ts`, `DrumSelectionHandoffDto`, validation adapter from snapshot
2. **Prisma** — model + migration; `prisma generate`
3. **Repository** — `v2CuttingLengthRepository.ts` (transaction: plan insert + line pointer + optional scalar projection + audit)
4. **Routes** — extend `v2InquiryConfigurationRoutes.ts`; register nothing new in `server.ts` if mount unchanged
5. **API client** — `v2CuttingLengthApiService.ts`
6. **Tests** — domain unit + HTTP persistence + IDOR
7. **UI** — `CuttingLengthSectionV2` + `CableConfiguratorV2` wiring; remove LS write
8. **Docs** — update doc 34/35 cross-refs; add Task 05C completion note
9. **Optional** — extend `submitV2Inquiry` for phased cutting requirement (feature-flag or explicit product sign-off)
10. **Handoff preview endpoint** — read-only `selectDrum` wrapper for internal QA (no persistence in drum module)

---

## Appendix A — Files inspected

| Path | Relevance |
|------|-----------|
| `prisma/schema.prisma` | CommercialInquiry, Line, V2ConfigurationSnapshot; no cutting model |
| `prisma/migrations/20260905120000_v2_inquiry_configuration_snapshot/migration.sql` | 05B snapshot migration pattern |
| `src/components/cable-configurator/v2/components/CuttingLengthSectionV2.tsx` | LS-only persist |
| `src/components/cable-configurator/v2/components/CableConfiguratorV2.tsx` | Gates + config save |
| `src/components/cable-configurator/v2/services/v2CableConfigurationService.ts` | Gates, LS inventory |
| `src/server/v2InquiryConfigurationRepository.ts` | 05B persist/submit patterns |
| `src/server/v2InquiryConfigurationRoutes.ts` | V2 API surface |
| `src/services/v2InquiryConfigurationApiService.ts` | Client DTOs |
| `src/services/drumSelectionService.ts` | Drum handoff consumer |
| `src/domain/drumOptimizationService.ts` | Plan line shape (read-only) |
| `src/domain/drumPlanService.ts` | Line vs cut validation |
| `src/domain/inquiryDrumSchedule.ts` | Tolerance semantics |
| `src/services/cuttingLengthValidationService.ts` | Min/max (V1) |
| `src/domain/v2InquiryWorkflow.ts` | Status transitions |
| `src/platform/v2CableConfigurationProductionReadiness.test.ts` | Gate tests |
| `src/platform/v2InquiryConfigurationPersistence.test.ts` | 05B API tests |
| `src/services/drumSelectionService.test.ts` | Drum input contract |
| `docs/v2/34_V2_CABLE_CONFIGURATION_PRODUCTION_READINESS.md` | 05A baseline |
| `docs/v2/35_V2_INQUIRY_CONFIGURATION_PERSISTENCE.md` | 05B baseline |
| `server.ts` | `/api/v2/inquiries` mount |

---

## Appendix B — Proposed files to change (implementation phase)

| File | Action |
|------|--------|
| `prisma/schema.prisma` | Add `V2CuttingLengthPlan`, line FK |
| `prisma/migrations/20260905180000_v2_cutting_length_plan/migration.sql` | New |
| `src/domain/v2CuttingLengthService.ts` | **New** — validation + handoff builder |
| `src/server/v2CuttingLengthRepository.ts` | **New** — persist/list/handoff |
| `src/server/v2InquiryConfigurationRoutes.ts` | Add cutting-plan routes |
| `src/services/v2CuttingLengthApiService.ts` | **New** |
| `src/components/cable-configurator/v2/components/CuttingLengthSectionV2.tsx` | API persist, remove LS |
| `src/components/cable-configurator/v2/components/CableConfiguratorV2.tsx` | Pass inquiry/snapshot ids |
| `src/services/v2InquiryConfigurationApiService.ts` | Extend DTOs (`v2CurrentCuttingPlanId`) |
| `src/components/inquiry-quotation/V2InquiryConfigurationPanel.tsx` | Show plan status |
| `src/platform/v2CuttingLengthPersistence.test.ts` | **New** |
| `src/domain/v2CuttingLengthService.test.ts` | **New** |
| `docs/v2/34_*.md`, `docs/v2/35_*.md` | Cross-reference 05C (post-impl) |

---

## Appendix C — Proposed migration

**Name:** `20260905180000_v2_cutting_length_plan`

- `CREATE TABLE "V2CuttingLengthPlan"` (see §3.1)
- `ALTER TABLE "CommercialInquiryLine" ADD COLUMN "v2CurrentCuttingPlanId"`
- FK `V2CuttingLengthPlan.configurationSnapshotId` → `V2ConfigurationSnapshot.id` ON DELETE RESTRICT
- FK `V2CuttingLengthPlan.inquiryLineId` → `CommercialInquiryLine.id` ON DELETE CASCADE
- Unique on `planId`; indexes on `(inquiryLineId, versionNo)`, `configurationSnapshotId`

Optional enum migration: `InquiryLineStatus` + `CUTTING_LENGTH_VALIDATED`.

---

## Appendix D — Proposed tests

| Test | Asserts |
|------|---------|
| `v2CuttingLengthPersistence.test.ts` | CRUD version, IDOR, stale snapshot, submit block |
| `v2CuttingLengthService.test.ts` | Validation, tolerance range, handoff DTO |
| `v2CuttingLengthHandoff.test.ts` (optional) | Handoff satisfies `DrumSelectionInput` typing |
| Regression | 05A + 05B + `drumSelectionService.test.ts` green |

---

## Appendix E — Exact frozen areas protected

- `src/domain/costingEngine.ts` and `costingEngine.test.ts` expectations
- `CostingMetalCostComponent` / Direct RM metal price logic
- `docs/DECISION5*` (unless explicitly requested)
- Cable BOM governance conflict count and resolution workflows
- Drum Master schema/engineering normalization scripts (post-05B drum work)
- `src/domain/drumOptimizationService.ts` algorithm and ranking
- `src/components/fulfillment/*` WIP
- `src/components/customer/SmartConfigurator.tsx`, `CableConfiguratorModal.tsx`
- D365 export/commitment integration modules
- V1 inquiry create numbering (stamp+random) — unchanged

---

## Appendix F — Decisions required from product owner

1. Submit vs `READY_FOR_COMMERCIAL` cutting plan requirement (§14.1 #1)
2. Single-drum MVP scope for first release (§14.1 #2)
3. Whether to project cutting scalars onto `CommercialInquiryLine` for legacy UI (§14.1 #3)
4. Tolerance encoding standard (§14.1 #4)
5. WARNING vs INVALID gating for drum handoff (§14.1 #5)
6. Primary quantity semantics: order meters vs drums × cut (§14.1 #7)
7. LS parallel-run duration and deprecation date (§14.1 #10)
8. Handling of `specialReqs` / line notes on cutting plan (§14.3)

---

**Readiness verdict:** Architecture is clear and 05B provides the persistence template. **Cutting Length authority is MISSING** and must be implemented as a new versioned Prisma entity with snapshot FK, V2 API, and UI retirement of `energya_erp_request_items_v2` writes. **Not production-ready** until implemented, tested, and product decisions in §14 are closed.
