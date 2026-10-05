# TASK 05D — Drum Selection + Authoritative Drum Plan — Implementation Readiness

**Date:** 2026-09-05  
**Base commit:** `60e6cc3` (frozen Task 05C)  
**Status:** **READINESS ONLY — NOT production-ready; no implementation in this task**  
**Prior:** Task 05A (`docs/v2/34_V2_CABLE_CONFIGURATION_PRODUCTION_READINESS.md`), Task 05B (`docs/v2/35_V2_INQUIRY_CONFIGURATION_PERSISTENCE.md`), Task 05C (`docs/v2/TASK05C_READINESS.md` + implementation)

---

## Executive summary

Task 05C delivered an **authoritative, versioned cutting-length domain** (`V2CuttingLengthPlan`) and a deterministic **`DrumSelectionHandoffDto`** from configuration snapshot + cutting plan. **Drum selection and drum plan authority remain MISSING at the inquiry boundary.**

Today, drum suitability math is **LIVE** in domain services (`drumCapacityCalculator`, `drumOptimizationService`) and exposed via **stateless** master-data compute APIs (`POST /api/master/drums/candidates|validate|optimize`). V1 inquiry UIs (`CableSearchSelectModal`, `CommercialInquiryDetail`) run selection in React state and optionally write `CommercialInquiryLine.drumSchedule` JSON — **not linked to V2 cutting plans, not versioned, not reproducible for costing.**

Task 05D must establish:

```text
V2ConfigurationSnapshot → V2CuttingLengthPlan → DrumSelectionHandoffDto
  → Drum Selection (candidates / method choice)
  → V2DrumPlan (authoritative, immutable, versioned)
  → Drum Schedule (line rows, quotation/fulfillment projection)
```

**Critical boundary:** Do **not** collapse Selection and Drum Plan into one uncontrolled calculation. Selection produces **suitable candidates** and optional recommendations; Drum Plan is the **persisted, reproducible packaging schedule** that downstream costing and commercial documents may consume.

**Not claimed:** Production-ready Quote-to-Cash, costing run integration, or Commercial Fulfillment WIP wiring.

---

## 1. Current State

### 1.1 Prisma schema (what exists)

| Model / field | Location | Role today |
|---------------|----------|------------|
| `V2ConfigurationSnapshot` | `prisma/schema.prisma` L834–871 | Immutable config evidence; `downstreamGates`, cable physicals |
| `V2CuttingLengthPlan` | L874–908 | Immutable cutting plan; FK → snapshot; `nominalLengthM`, `tolerancePercent`, validation |
| `CommercialInquiryLine.v2CurrentCuttingPlanId` | L822 | Pointer to latest cutting plan (cuid) |
| `CommercialInquiryLine.v2CurrentSnapshotId` | L821 | Pointer to latest config snapshot |
| `CommercialInquiryLine.drumSchedule` | L799 | **Legacy V1 JSON** — `InquiryDrumSchedule` shape; mutable via `/api/inquiries` |
| `CommercialInquiryLine.cuttingLengthMeters` | L794 | Legacy scalar; **not** updated by V2 cutting persist |
| `CommercialInquiryLine.cableTolerancePercent` | L797 | Legacy scalar; V2 tolerance lives on `V2CuttingLengthPlan` |
| `CommercialInquiryLine.drumType` | L795 | Prototype reel label (V1) |
| `DrumMaster` | L355–379 | **POSTGRESQL_SOT** (04B-12); `clearanceMm`, `maxWeight` (MaxLoad), `capacity`, `emptyDrumNetWeightKg` |
| `DrumCompatibility` | L381–395 | **BLOCKED** — 0 approved rows; no FK to `DrumMaster` |
| `CostingPackingRule` | L2170–2195 | Admin drum/packing cost rules (`drumCode` optional); **not** wired to inquiry drum plans |

**MISSING:** `V2DrumPlan`, `V2DrumPlanLine`, `CommercialInquiryLine.v2CurrentDrumPlanId`, any FK from drum plan → cutting plan.

### 1.2 Task 05C implementation (LIVE at base commit)

| Asset | Path | Status |
|-------|------|--------|
| Domain + handoff DTO | `src/domain/v2CuttingLengthService.ts` | **LIVE** — `DrumSelectionHandoffDto`, `buildDrumSelectionHandoff`, `validateV2CuttingLength` |
| Repository | `src/server/v2CuttingLengthRepository.ts` | **LIVE** — persist, list, current, handoff |
| Routes | `src/server/v2InquiryConfigurationRoutes.ts` L176–224 | **LIVE** — `/cutting-plans`, `/handoff` |
| Client | `src/services/v2CuttingLengthApiService.ts` | **LIVE** |
| UI | `src/components/cable-configurator/v2/components/CuttingLengthSectionV2.tsx` | **LIVE** — API persist (no `localStorage` write) |
| Tests | `src/platform/v2CuttingLengthPersistence.test.ts`, `src/domain/v2CuttingLengthService.test.ts` | **LIVE** |
| Migration | `prisma/migrations/20260905180000_v2_cutting_length_plan/` | **APPLIED** |

**05C schema delta vs readiness doc:** Implemented model is **simpler** than TASK05C_READINESS §3.1 — no `drumSchedule`, `numberOfDrums`, `drumHandoffPayload` JSON, or weight projections on plan row. Handoff is computed at read/persist time via `buildDrumSelectionHandoff`.

**`DrumSelectionHandoffDto` fields (actual):**

| Field | Source |
|-------|--------|
| `planId`, `planVersionNo` | `V2CuttingLengthPlan` |
| `configurationSnapshotId`, `configurationSnapshotIdString`, `configurationSnapshotVersionNo` | Plan + snapshot |
| `cuttingLengthMeters` | `plan.nominalLengthM` |
| `cableTolerancePercent` | `plan.tolerancePercent` |
| `minLengthM`, `maxLengthM` | Plan bounds |
| `cableDiameterMm`, `cableWeightKgKm` | Snapshot `estimatedDiameterMm`, `estimatedWeightKgKm` |
| `cableMaterialNumber`, `itemCode`, `customerCode` | Snapshot |
| `drumHandoffReady`, `validationStatus`, `validationMessages` | Computed |
| `notes`, `capturedAt` | Plan |

**Gate:** `transitionV2InquiryEngineeringStatus` → `READY_FOR_COMMERCIAL` calls `assertReadyForCommercialCuttingPlans` (`v2InquiryConfigurationRepository.ts` L852–864) — cutting plan required per line; **no drum plan gate**.

### 1.3 Drum selection engine (domain — LIVE, not inquiry-persisted)

| Layer | Path | Role |
|-------|------|------|
| Capacity math | `src/domain/drumCapacityCalculator.ts` | Native TO calculator; clearance ≤50 mm rule; MaxLoad; `floorToNearest10` |
| Optimization | `src/domain/drumOptimizationService.ts` | `evaluateDrumForCutting`, `listDrumCandidates`, `validateManualDrumPlan`, `optimizeDrumPlan` → `AuthoritativeDrumPlan` |
| Legacy thin wrapper | `src/services/drumSelectionService.ts` | `selectDrum` — AUTOMATIC calls `optimizeDrumPlan` with `cableTolerancePercent: 0` (handoff tolerance **not passed**) |
| Legacy K/S/P suggestions | `src/domain/drumPlanService.ts` | `APPROVED_DRUM_TYPES`, `suggestDrumPlan` — **V1 prototype catalog; not EWD Drum Master** |

**`AuthoritativeDrumPlan` / `AuthoritativeDrumPlanLine`:** Rich in-memory types with engineering detail, validation status, ranking notes — **never persisted to Prisma**.

### 1.4 Drum compute APIs (master-data scoped — LIVE)

`src/server/masterDataRoutes.ts`:

| Route | Auth | Function |
|-------|------|----------|
| `POST /api/master/drums/capacity` | `requireDrumComputeAuth` → `assertCanUseDrumOptimization` | Single drum capacity |
| `POST /api/master/drums/candidates` | Same | `listDrumCandidates` + engineering gap report |
| `POST /api/master/drums/validate` | Same | `validateManualDrumPlan` |
| `POST /api/master/drums/optimize` | Same | `optimizeDrumPlan` |
| `GET /api/master/drums` | `requireMasterReadAuth` | Drum Master list |

**Gap:** APIs are **not customer/inquiry scoped**. Any authenticated user with drum optimization permission can compute against global Drum Master. No linkage to `inquiryId`, `lineId`, or `V2CuttingLengthPlan`.

Client mirror: `src/services/drumOptimizationApiService.ts` — JWT calls with local fallback to domain functions.

### 1.5 UI (V1 wired, V2 NOT wired)

| Component | Path | V2 status |
|-----------|------|-----------|
| `DrumSelectionWorkflowPanel` | `src/components/common/DrumSelectionWorkflowPanel.tsx` | **LIVE** — MANUAL/AUTOMATIC, candidates, schedule table; parent-owned state |
| `DrumCuttingScheduleTable` | `src/components/common/DrumCuttingScheduleTable.tsx` | **LIVE** — multi-row schedule; uses `drumCapacityCalculator` for row metrics |
| `DrumMasterSelect` / `useDrumMasterList` | `src/components/common/DrumMasterSelect.tsx` | **LIVE** — PG `/api/master/drums`; LS fallback only on PG failure |
| `DrumDetailsModal` | `src/components/common/DrumDetailsModal.tsx` | **V1** — `ErpRequestItem` / prototype drum types; not V2 inquiry |
| `CableSearchSelectModal` | `src/components/common/CableSearchSelectModal.tsx` | Embeds `DrumSelectionWorkflowPanel`; persists via V1 inquiry API |
| `CommercialInquiryDetail` | `src/components/inquiry-quotation/CommercialInquiryDetail.tsx` | V1 `drumSchedule` on line |
| `CableConfiguratorV2` | `src/components/cable-configurator/v2/components/CableConfiguratorV2.tsx` | **No drum selection step** — only mentions drum in blocked-state copy |
| `CuttingLengthSectionV2` | Shows `handoffPreview` after save | **No drum UI** |

### 1.6 Drum Master SoT (frozen — document, preserve)

From `src/platform/masterDataSoT.ts` and `DrumMaster` schema:

| Rule | Evidence |
|------|----------|
| Clearance default **50 mm** (TO) when cable Ø ≤ 50 mm | `drumCapacityCalculator.ts` L159–174; schema comment L369 |
| **MaxLoad = Capacity** mapping on import/normalize | `drumMasterWriteRepository.ts` via `resolveDrumEngineeringFields`; gap report L253–255 |
| **Capacity authoritative** as source column; UOM `CONFIGURATION_REQUIRED` | Schema L373–374; `drumSelectionService.ts` CAPACITY_WARNING |
| **Empty drum net weight = logistics only** | Schema L371–372; `drumOptimizationService.ts` L656–657 |
| **No fake `DrumCompatibility` records** | `masterDataSoT.ts` L410 — `BLOCKED`; `drumSelectionService.ts` COMPATIBILITY_WARNING |
| **No Drum Master SoT changes** in 05D | Frozen per task rules |

LS mirror: `energya_drum_master_v1` — **NON_AUTHORITATIVE_MIRROR** after PG read (`drumMasterService.ts` L314+). Not a drum-plan authority.

### 1.7 localStorage drum state

| Key | Classification | Drum-plan relevance |
|-----|--------------|---------------------|
| `energya_drum_master_v1` | Mirror of PG Drum Master | Read fallback only |
| `energya_erp_request_items_v2` | CACHE (doc 18) | **V2 cutting path no longer writes** (05C); may still hold orphan draft rows |
| Inquiry saved views / configurator LS | Various | Not drum-plan authority |

**No `localStorage` key for authoritative drum plans exists or should be introduced.**

### 1.8 Tests (current coverage)

| Test file | Coverage |
|-----------|----------|
| `drumCapacityCalculator.test.ts` | Clearance, MaxLoad, geometry, floorToNearest10 |
| `drumOptimizationService.test.ts` | Manual/auto plans, ranking, incomplete vs unsuitable, multi-drum merge |
| `drumSelectionService.test.ts` | Input contract, CONFIGURATION_REQUIRED when engineering missing |
| `v2CuttingLengthPersistence.test.ts` | Handoff DTO shape; **no drum plan** |
| `drumMasterSotCutover.test.ts` | SoT registry |
| `inquiryDrumSchedule.test.ts` | V1 tolerance aggregation |

**MISSING:** V2 drum plan persistence, IDOR on drum-plan routes, stale cutting-plan rejection, selection→plan boundary tests, costing handoff contract tests.

### 1.9 Documentation alignment

| Doc | Drum-related classification |
|-----|----------------------------|
| Doc 34 §2 | Target chain includes Drum Selection → Drum Plan Snapshot → Costing |
| Doc 34 readiness matrix | `drumSelectionHandoff`: **PARTIAL** |
| Doc 35 | Config + inquiry persistence; cutting added in 05C |
| TASK05C_READINESS | Pre-implementation; **superseded for cutting** by live 05C code |

---

## 2. Target State

### 2.1 Authoritative chain

```text
CommercialInquiry (V2_CONFIGURATION)
  └── CommercialInquiryLine
        ├── V2ConfigurationSnapshot          [05B LIVE]
        ├── V2CuttingLengthPlan              [05C LIVE]
        │     └── DrumSelectionHandoffDto    [05C LIVE — read-only contract]
        └── V2DrumPlan (immutable, versioned) [05D NEW]
              ├── FK → v2CuttingLengthPlanId (exact plan row used)
              ├── selectionMethod: MANUAL | AUTOMATIC
              ├── V2DrumPlanLine[] (schedule)
              └── engineeringSnapshot JSON (reproducibility)
```

### 2.2 Principles (non-negotiable)

1. **Selection ≠ Drum Plan.** Candidate listing and auto-recommendation may be recomputed; only an explicit **persist** action creates `V2DrumPlan`.
2. **Handoff input is `DrumSelectionHandoffDto`** — drum selection must reject stale cutting plans / snapshots (same pattern as 05C).
3. **Drum Master reads** use PG SoT; optimization **internals frozen** — 05D wraps, persists results, does not change `rankScoreForSuitableDrum` or `calculateDrumCapacity`.
4. **`DrumCompatibility` not required** for V2 MVP — native capacity engine only.
5. **No Costing V2 engine changes** — design handoff contract only.
6. **Customer isolation** on all V2 drum-plan routes via `loadV2InquiryScoped`.

### 2.3 Success criteria (05D implementation gate)

- Persist `V2DrumPlan` + lines via V2 inquiry API
- Server validates against current `v2CurrentCuttingPlanId` + `drumHandoffReady`
- MANUAL and AUTOMATIC paths both produce storable plans
- `appendServerAudit` on persist
- UI step in V2 configurator after cutting plan save
- Optional gate: `READY_FOR_COMMERCIAL` or quotation requires drum plan (**product decision**)
- Tests: persistence, IDOR, stale cutting plan, manual vs auto parity with domain engine

---

## 3. Domain Model

### 3.1 Proposed Prisma: `V2DrumPlan`

Immutable, versioned — mirror `V2CuttingLengthPlan` pattern.

```prisma
/// Authoritative V2 drum packaging plan linked to cutting plan (Task 05D).
model V2DrumPlan {
  id                         String                @id @default(cuid())
  planId                     String                @unique   // e.g. v2drum-INQ26-00042-L1-v2
  versionNo                  Int                   @default(1)

  inquiryLineId              String
  inquiryLine                CommercialInquiryLine @relation(fields: [inquiryLineId], references: [id], onDelete: Cascade)

  /// FK to exact cutting plan row used at persist time.
  cuttingLengthPlanId        String
  cuttingLengthPlan          V2CuttingLengthPlan   @relation(fields: [cuttingLengthPlanId], references: [id], onDelete: Restrict)
  cuttingLengthPlanVersionNo Int
  cuttingLengthPlanIdString  String                // denormalized planId

  configurationSnapshotId    String                // denormalized from cutting plan — audit
  configurationSnapshotIdString String

  selectionMethod            String                // MANUAL | AUTOMATIC
  cableTolerancePercent      Decimal               // copied from handoff at capture
  totalOrderLengthM          Decimal               // sum(lines.noOfDrums * cuttingLengthM)

  validationStatus           String                // VALID | WARNING | INVALID
  flowState                  String                // VALIDATED | LOCKED | SUPERSEDED
  blockingReasons            Json?
  warnings                   Json?
  rankingNotes               Json?                 // from AuthoritativeDrumPlan.rankingNotes

  /// Full engine output at persist time — reproducible even if Drum Master changes later.
  engineeringSnapshot        Json                  // AuthoritativeDrumPlan shape (sans transient UI state)

  isValid                    Boolean               @default(false)
  outcome                    String?               // RECOMMENDED | NO_SUITABLE | … (automatic)

  actorId                    String?
  actorEmail                 String?
  actorRole                  String?

  capturedAt                 DateTime              @default(now())
  createdAt                  DateTime              @default(now())

  lines                      V2DrumPlanLine[]

  @@index([inquiryLineId])
  @@index([inquiryLineId, versionNo])
  @@index([cuttingLengthPlanId])
  @@index([capturedAt])
}
```

### 3.2 Proposed Prisma: `V2DrumPlanLine`

Normalized schedule rows (prefer table over JSON for costing queries).

```prisma
model V2DrumPlanLine {
  id                      String     @id @default(cuid())
  drumPlanId              String
  drumPlan                V2DrumPlan @relation(fields: [drumPlanId], references: [id], onDelete: Cascade)
  lineSequence            Int        // 1-based order in schedule

  drumMasterId            String?    // DrumMaster.id at capture (nullable if code missing)
  drumCode                String
  numberOfDrums           Int
  cuttingLengthM          Decimal
  nominalCuttingLengthM   Decimal
  drumTolerancePercent    Decimal    @default(0)

  minimumAllowedLengthM   Decimal
  maximumAllowedLengthM   Decimal
  maximumUsableLengthM    Decimal?

  cableWeightKg           Decimal?
  emptyDrumNetWeightKg    Decimal?
  grossLoadedDrumWeightKg Decimal?
  lengthUtilizationPercent Decimal?
  loadUtilizationPercent  Decimal?

  validationStatus        String     // VALID | NOT_SUITABLE | INCOMPLETE
  validationReasons       Json?

  /// Per-line engineering detail from capacity engine (optional).
  engineering             Json?

  @@index([drumPlanId])
  @@index([drumPlanId, lineSequence])
  @@index([drumCode])
}
```

### 3.3 `CommercialInquiryLine` extensions (proposed)

```prisma
  v2CurrentDrumPlanId      String?
  v2DrumPlans              V2DrumPlan[]

  @@index([v2CurrentDrumPlanId])
```

**Legacy projection (optional):** On drum plan persist, update `drumSchedule` JSON (`InquiryDrumSchedule` shape) and `cuttingLengthMeters` / `cableTolerancePercent` for V1 workspace compatibility — **product decision** (default: **yes** for inquiry list readability).

### 3.4 `V2CuttingLengthPlan` extension (proposed)

```prisma
  drumPlans                V2DrumPlan[]
```

`onDelete: Restrict` on `cuttingLengthPlanId` — drum plans remain audit evidence even if line cascades (line delete cascades both).

### 3.5 Relationships

| From | To | Cardinality | Rule |
|------|-----|-------------|------|
| `CommercialInquiryLine` | `V2CuttingLengthPlan` | 1:N | Cutting versions (05C) |
| `CommercialInquiryLine` | `V2DrumPlan` | 1:N | Drum plan versions (05D) |
| `V2DrumPlan` | `V2CuttingLengthPlan` | N:1 | Each drum plan references **one** cutting plan row |
| `V2DrumPlan` | `V2DrumPlanLine` | 1:N | Schedule rows |
| `V2DrumPlanLine` | `DrumMaster` | logical | `drumCode` + captured `drumMasterId`; no hard FK if master row deleted later |

**Invariants:**

- `cuttingLengthPlanId` must equal line’s `v2CurrentCuttingPlanId` at persist time
- `cuttingLengthPlan.configurationSnapshotId` must equal line’s `v2CurrentSnapshotId`
- `handoff.drumHandoffReady === true` (or WARNING allowed — **decision**)
- Sum of line meters should match handoff order semantics (**see §8**)

### 3.6 What exists vs MISSING

| Capability | Exists | Missing |
|------------|--------|---------|
| Cutting handoff DTO | ✅ | — |
| Candidate evaluation engine | ✅ | Inquiry-scoped selection service |
| In-memory `AuthoritativeDrumPlan` | ✅ | Prisma persistence |
| V2 drum plan API | ❌ | `/drum-plans` routes |
| Line pointer `v2CurrentDrumPlanId` | ❌ | — |
| V2 configurator drum step | ❌ | UI wiring |
| Drum plan audit events | ❌ | `appendServerAudit` |
| Costing consumption of drum plan | ❌ | Design only |

---

## 4. Selection Engine

### 4.1 Boundary definition

| Concern | Owner | Persisted? |
|---------|-------|------------|
| **Selection** | `listDrumCandidates`, `evaluateDrumForCutting`, optional `optimizeDrumPlan` preview | **No** — ephemeral API responses |
| **Drum Plan** | `validateManualDrumPlan` or finalized `optimizeDrumPlan` + user confirm | **Yes** — `V2DrumPlan` |

**Anti-pattern:** Calling `optimizeDrumPlan` on page load and treating the result as authoritative without persist.

### 4.2 Proposed service: `v2DrumSelectionService.ts` (new)

Responsibilities:

1. `buildDrumSelectionContext(handoff, line)` — validate staleness, map to `CableEngineeringInput`
2. `listSelectionCandidates(context, drums)` — delegate to `listDrumCandidates` with handoff `cuttingLengthMeters` + `cableTolerancePercent`
3. `previewAutomaticPlan(context, drums)` — delegate to `optimizeDrumPlan` with **`cableTolerancePercent` from handoff** (fixes `selectDrum` hard-coded `0`)
4. `buildPersistedDrumPlan(input)` — map `AuthoritativeDrumPlan` → Prisma rows + `engineeringSnapshot`

**Do not modify** `drumOptimizationService.ts` ranking — wrap only.

### 4.3 Manual vs automatic architecture

| Mode | User action | Engine call | Persist payload |
|------|-------------|-------------|-----------------|
| **MANUAL** | Pick drum code(s), edit schedule rows, confirm | `validateManualDrumPlan` | `selectionMethod: MANUAL` |
| **AUTOMATIC** | Run optimizer, review recommendation, confirm | `optimizeDrumPlan` | `selectionMethod: AUTOMATIC` |

Both paths must call the **same** `buildPersistedDrumPlan` mapper so costing sees identical line shape.

### 4.4 Relationship to `drumSelectionService.ts`

Frozen thin wrapper — **do not extend for V2 persist**. V2 should call `drumOptimizationService` directly (or via new adapter). `selectDrum` remains for legacy/V1 compatibility.

### 4.5 Compute API strategy

| Option | Pros | Cons |
|--------|------|------|
| A — Reuse `/api/master/drums/*` from V2 UI | Already built | No inquiry scope; no handoff validation |
| B — New `/api/v2/inquiries/.../drum-selection/*` | Customer scoped; handoff enforced | New routes |
| **Recommendation** | **B** for candidates/preview; optionally proxy to domain functions internally |

---

## 5. Suitability Rules

### 5.1 Technical suitability (frozen — `drumCapacityCalculator.ts`)

| Rule | Behavior |
|------|----------|
| Cable Ø ≤ 50 mm | Requires `DrumMaster.clearanceMm` (TO default 50 mm) |
| Cable Ø > 50 mm | `clearanceUsedMm = cableDiameterMm` (no drum clearance field) |
| MaxLoad | `DrumMaster.maxWeight` must be > 0; permitted cable payload excludes empty drum weight |
| Geometry | `windingsPerLayer`, `layers` > 0; else `UNSUITABLE_GEOMETRY` |
| Usable length | `floorToNearest10(min(geo, loadLimited))` |
| Length fit | `maximumUsableLengthM >= maximumAllowedLengthM` (tolerance band from cutting length) |
| Load fit | Cable weight on drum ≤ MaxLoad |
| Empty drum weight | **Warning only** — never blocks `SUITABLE` |

### 5.2 Partial / insufficient engineering data

| `DrumCapacityStatus` | `DrumCandidateEvaluationStatus` | UX (existing) |
|----------------------|----------------------------------|---------------|
| `MISSING_CLEARANCE` | `INCOMPLETE_ENGINEERING_DATA` | `NONE_SUITABLE_WITH_INCOMPLETE` banner |
| `MISSING_MAX_LOAD` | `INCOMPLETE_ENGINEERING_DATA` | Engineering gap report |
| `MISSING_CABLE_DATA` | Handoff blocked earlier | `drumHandoffReady: false` |
| `INVALID_DIMENSIONS` | `INCOMPLETE_ENGINEERING_DATA` | Per-drum diagnostic |

**05D rule:** Cannot persist `V2DrumPlan` with `isValid: false` unless product explicitly allows **draft invalid plans** (**decision** — default: **reject**).

### 5.3 Handoff prerequisites (from 05C)

Before selection APIs accept a line:

1. `line.v2CurrentCuttingPlanId` present
2. `buildDrumSelectionHandoff` → `drumHandoffReady`
3. `downstreamGates.drumSelection === true` on snapshot (UI gate today; enforce server-side)
4. Snapshot not stale vs line

### 5.4 DrumCompatibility

**Not required for V2.** Entity remains `BLOCKED` in `masterDataSoT.ts`. `drumSelectionService` emits `COMPATIBILITY_WARNING` — preserve in persisted `warnings` JSON for audit transparency only.

---

## 6. Ranking

### 6.1 Deterministic algorithm (frozen — `rankScoreForSuitableDrum`)

Documented order (`drumOptimizationService.ts` L551–558):

1. Suitable candidates only
2. Length fit — penalize >100% length utilization
3. Reasonable length utilization (closer to 100% without exceeding)
4. Reasonable load utilization
5. Smaller flange
6. Lower empty drum weight (nulls last)

Tie-break: `drumCode` localeCompare.

### 6.2 Automatic multi-cut ranking

`optimizeDrumPlan` greedy split (`L893–1007`):

- Try single drum covering full remainder with best-ranked suitable drum
- Else pick largest feasible cut per drum, merge adjacent identical lines

**05D:** Persist `rankingNotes` from engine on `V2DrumPlan` for audit reproducibility.

### 6.3 Selection UI ranking

`DrumSelectionWorkflowPanel` already sorts suitable candidates by `rankScore`. V2 step should reuse component with handoff props — **no re-ranking in UI**.

---

## 7. Drum Plan

### 7.1 Authority semantics

`V2DrumPlan` is the **authoritative packaging schedule** for:

- Commercial quotation line drum breakdown (future)
- Costing packing/logistics inputs (future)
- Fulfillment drum schedule (future — WIP frozen)

### 7.2 `flowState` (proposed)

| State | Meaning |
|-------|---------|
| `VALIDATED` | Server accepted persist |
| `LOCKED` | Inquiry submitted / commercial lock |
| `SUPERSEDED` | Newer version exists |

No `DRAFT` row in DB — client drafts stay in React until POST (same as 05C).

### 7.3 `engineeringSnapshot` JSON

Store full `AuthoritativeDrumPlan` at capture:

- Protects against Drum Master engineering field changes post-quote
- Enables diff audits (“plan computed with MaxLoad X at capture”)
- Size bounded by schedule row count (typically < 20 lines)

### 7.4 Validation status mapping

| Engine | Plan `validationStatus` |
|--------|---------------------------|
| `isValid && all lines VALID` | `VALID` |
| `isValid` with logistics warnings | `WARNING` |
| `!isValid` | `INVALID` (reject persist by default) |

---

## 8. Multi-drum Schedule

### 8.1 Order length semantics (critical ambiguity)

**05C handoff** exposes single `cuttingLengthMeters` (= `nominalLengthM`) — **not** decomposed multi-drum.

| Interpretation | Implication |
|----------------|-------------|
| A — `nominalLengthM` is **per-drum cut** | Auto optimizer `totalOrderLengthM` = handoff length; `numberOfDrums` derived |
| B — `nominalLengthM` is **total order length** | Optimizer covers full order; may emit multiple lines |

**Current `selectDrum` AUTOMATIC path** passes `cuttingLengthMeters` as `totalOrderLengthM` (`drumSelectionService.ts` L57) — treats as **total order**.

**05C UI** labels “nominal cutting length” per drum context but field is single value.

**Recommendation:** PO must close — **default to total order length** aligned with `optimizeDrumPlan` and add `requestedLengthMeters` to handoff in 05D if per-drum semantics needed.

### 8.2 Remainder / last-drum behavior

Engine handles remainder in greedy loop; partial failure → `PARTIAL_ALLOCATION_FAILED`. Persisted plan must either:

- Cover 100% of declared total order length, or
- Reject with blocking reasons (default)

### 8.3 Drum reuse

Multiple schedule lines may reference same `drumCode` with different cuts — engine merges adjacent identical lines before return; persist **merged** lines as authoritative.

### 8.4 Legacy `InquiryDrumSchedule` projection

Map `V2DrumPlanLine[]` → `{ cableTolerancePercent, rows: [{ drumCode, noOfDrums, cuttingLengthM, drumTolerancePercent }] }` for `CommercialInquiryLine.drumSchedule`.

---

## 9. Versioning

### 9.1 Version rules

- Each POST creates new `versionNo++` immutable `V2DrumPlan` row
- `v2CurrentDrumPlanId` updated on line
- Prior versions retained (`SUPERSEDED` optional flag or infer from versionNo)

### 9.2 Staleness triggers

| Event | Drum plan effect |
|-------|------------------|
| New config snapshot | Cutting plan stale → drum plan stale |
| New cutting plan | Drum plan must reference current cutting plan |
| Drum Master engineering update | Old plans remain valid via `engineeringSnapshot`; new persist uses new master |

### 9.3 Amendment workflow

1. User amends configuration → must re-save cutting plan
2. User amends cutting → must re-run selection and persist new drum plan
3. Server returns `STALE_CUTTING_PLAN` / `STALE_CONFIGURATION_SNAPSHOT` on mismatch

---

## 10. API

### 10.1 Proposed routes (V2 inquiry router)

Mount on `v2InquiryConfigurationRoutes.ts` or `v2DrumPlanRoutes.ts` included from same `/api/v2/inquiries` mount.

| Method | Route | Purpose |
|--------|-------|---------|
| GET | `/:id/lines/:lineId/drum-selection/context` | Handoff + readiness + cutting plan summary |
| POST | `/:id/lines/:lineId/drum-selection/candidates` | Ephemeral suitable/incomplete/unsuitable lists |
| POST | `/:id/lines/:lineId/drum-selection/preview` | Ephemeral auto or manual validation (`AuthoritativeDrumPlan`) |
| POST | `/:id/lines/:lineId/drum-plans` | **Persist** authoritative plan |
| GET | `/:id/lines/:lineId/drum-plans` | List versions |
| GET | `/:id/lines/:lineId/drum-plans/current` | Current plan + lines |
| GET | `/:id/lines/:lineId/drum-plans/:planId` | Historical version |

**No DELETE. No PATCH** on immutable rows.

### 10.2 POST `drum-plans` body (proposed)

```typescript
interface PersistV2DrumPlanInput {
  cuttingLengthPlanId?: string;       // default: line.v2CurrentCuttingPlanId
  selectionMethod: 'MANUAL' | 'AUTOMATIC';
  cableTolerancePercent?: number;   // default: from handoff
  rows?: Array<{                    // required for MANUAL
    drumCode: string;
    numberOfDrums: number;
    cuttingLengthM: number;
    drumTolerancePercent?: number;
  }>;
  /** AUTOMATIC: optional override totalOrderLengthM; default from handoff */
  totalOrderLengthM?: number;
  confirmAutomaticRecommendation?: boolean; // required true for AUTOMATIC persist
}
```

### 10.3 POST response (proposed)

```typescript
{
  inquiry: V2InquiryDto;
  line: V2InquiryLineDto;           // v2CurrentDrumPlanId
  drumPlan: V2DrumPlanDto;
  schedule: V2DrumPlanLineDto[];
}
```

### 10.4 Error codes

| Code | HTTP | When |
|------|------|------|
| `CUTTING_PLAN_REQUIRED` | 409 | No current cutting plan |
| `STALE_CUTTING_PLAN` | 409 | Plan id ≠ current |
| `STALE_CONFIGURATION_SNAPSHOT` | 409 | Cutting plan behind snapshot |
| `HANDOFF_NOT_READY` | 409 | `drumHandoffReady: false` |
| `VALIDATION_FAILED` | 400 | Engine rejects plan |
| `NOT_FOUND` | 404 | Inquiry/line/plan |
| `INVALID_STATE` | 409 | Inquiry locked |
| `UNAUTHORIZED` | 403 | IDOR |

### 10.5 Client service (proposed)

`src/services/v2DrumPlanApiService.ts` — mirror `v2CuttingLengthApiService.ts`.

### 10.6 Master-data routes

Keep `/api/master/drums/*` for Master Data Hub / TO tools. V2 inquiry routes **must not** bypass customer scope.

---

## 11. UI

### 11.1 V2 configurator integration

| Change | Detail |
|--------|--------|
| New step | `DrumSelectionSectionV2.tsx` after `CuttingLengthSectionV2` |
| Gate | `canProceedToDownstream(snapshot, 'drumSelection')` + saved cutting plan |
| Reuse | Embed `DrumSelectionWorkflowPanel` with props from handoff |
| Persist | Replace parent-only validity with `persistV2DrumPlan` API |
| Display | Show `v2CurrentDrumPlanId`, version, schedule summary in `V2InquiryConfigurationPanel` |

### 11.2 `CableConfiguratorV2.tsx`

- Thread `v2CurrentCuttingPlanId`, handoff fetch on cutting save
- Enable drum section when `drumHandoffReady`
- Stale warnings when snapshot/cutting changes

### 11.3 Component reuse map

| Component | 05D role |
|-----------|----------|
| `DrumSelectionWorkflowPanel` | Primary UX — adapt to V2 persist callback |
| `DrumCuttingScheduleTable` | Schedule editing |
| `DrumMasterSelect` / `useDrumMasterList` | Drum Master load (unchanged) |
| `DrumMasterReferencePanel` | Engineering detail |
| `DrumDetailsModal` | **V1 only** — do not wire to V2 |

### 11.4 Explicit non-goals (UI)

- Commercial Fulfillment workspace
- Costing workspace run triggers
- D365 export
- V1 `SmartConfigurator` / `CableConfiguratorModal` changes

---

## 12. Security

### 12.1 Reuse 05B/05C patterns

- `requireV2InquiryAuth` → `assertCanManageInquiry` + `assertCustomerBusinessScope`
- `loadV2InquiryScoped` on every route
- Ignore customer body fields for scope

### 12.2 Drum optimization permission

Master routes use `assertCanUseDrumOptimization` (`rbac.ts` L445). **Decision:** V2 inquiry drum routes should use **`assertCanManageInquiry`** (customer can select drums on own inquiry) OR require TO role for automatic optimization — **default: inquiry manage permission sufficient**; audit actor on persist.

### 12.3 IDOR

Extend `v2CuttingLengthPersistence.test.ts` pattern — Customer B cannot read/persist Customer A drum plans.

### 12.4 Data exposure

`engineeringSnapshot` may contain drum geometry — same classification as inquiry technical data (customer-owned).

---

## 13. Audit

### 13.1 `appendServerAudit` events (proposed)

| Entity | Action | When |
|--------|--------|------|
| `V2DrumPlan` | `PERSIST` | New drum plan version |
| `CommercialInquiryLine` | `V2_DRUM_PLAN_LINK` | `v2CurrentDrumPlanId` updated |
| `CommercialInquiry` | `V2_SUBMIT` | Include drum plan ids (extend 05B submit audit) |

### 13.2 Audit payload

`planId`, `versionNo`, `selectionMethod`, `cuttingLengthPlanIdString`, `totalOrderLengthM`, `lineCount`, `isValid`, `outcome`, `actorId`.

### 13.3 Gap

Drum selection previews are **not audited** (ephemeral). Only **persist** events are audit-worthy.

---

## 14. Costing Handoff

### 14.1 Current costing state (read-only)

- `costingEngine.ts` — **no drum schedule input today**
- `CostingPackingRule` — admin rules by `drumCode`; `packingCost` may be null (`CONFIGURATION_REQUIRED`)
- Doc 34 — `costingHandoff`: **BLOCKED** (BOM governance)
- Line fields `costingReadinessStatus`, `costingCalculationId` on `CommercialInquiryLine` — unrelated to drums

### 14.2 Future handoff contract (design only)

Proposed `CostingDrumPlanHandoffDto` (not implemented):

```typescript
interface CostingDrumPlanHandoffDto {
  inquiryLineId: string;
  drumPlanId: string;
  drumPlanVersionNo: number;
  cuttingLengthPlanId: string;
  configurationSnapshotId: string;
  cableMaterialNumber: string | null;
  selectionMethod: 'MANUAL' | 'AUTOMATIC';
  cableTolerancePercent: number;
  totalOrderLengthM: number;
  lines: Array<{
    drumCode: string;
    numberOfDrums: number;
    cuttingLengthM: number;
    cableWeightKg: number | null;
    grossLoadedDrumWeightKg: number | null;
    lengthUtilizationPercent: number | null;
    loadUtilizationPercent: number | null;
  }>;
  capturedAt: string;
}
```

**Costing consumption (future task):**

- Match `CostingPackingRule` by `drumCode` per line
- Sum packing costs × `numberOfDrums`
- Logistics weight from `grossLoadedDrumWeightKg` when present
- **Do not** read live Drum Master for quoted plans — use persisted line snapshots

### 14.3 Gate

Costing run should require `v2CurrentDrumPlanId` + `isValid` when BOM governance unblocked — **out of 05D scope**.

---

## 15. Migration

### 15.1 Database migration (proposed)

`20260906120000_v2_drum_plan`:

1. `CREATE TABLE V2DrumPlan`
2. `CREATE TABLE V2DrumPlanLine`
3. `ALTER TABLE CommercialInquiryLine ADD v2CurrentDrumPlanId`
4. FKs: `V2DrumPlan.inquiryLineId` CASCADE; `cuttingLengthPlanId` RESTRICT; `V2DrumPlanLine.drumPlanId` CASCADE
5. Indexes per §3.1–3.2

**No backfill** — no authoritative V2 drum data in PG.

### 15.2 Legacy `drumSchedule` JSON

- V1 lines keep existing JSON
- V2 lines: optional projection on drum plan persist (§3.3)
- Do **not** auto-migrate V1 JSON to `V2DrumPlan` without cutting plan FK

### 15.3 localStorage retirement

| Phase | Action |
|-------|--------|
| 1 | V2 drum persist via API only |
| 2 | Stop treating `CommercialInquiryLine.drumSchedule` as authority for `workflowChannel=V2_CONFIGURATION` |
| 3 | Deprecate `energya_erp_request_items_v2` drum fields in V2 path (already removed from cutting save) |

### 15.4 Master-data compute routes

No migration — remain for TO/Master Data Hub.

---

## 16. Tests

### 16.1 New integration test file

`src/platform/v2DrumPlanPersistence.test.ts`:

1. Create inquiry + snapshot + cutting plan
2. POST candidates — 200, suitable list shape
3. POST preview AUTOMATIC — `AuthoritativeDrumPlan` valid
4. POST drum plan MANUAL — 201, `versionNo === 1`, lines persisted
5. POST second drum plan — `versionNo === 2`
6. Reject without cutting plan — `CUTTING_PLAN_REQUIRED`
7. Reject stale cutting plan id — `STALE_CUTTING_PLAN`
8. IDOR — Customer B blocked
9. Reject `HANDOFF_NOT_READY` when diameter null
10. Locked inquiry — `INVALID_STATE`

### 16.2 Domain unit tests

`src/domain/v2DrumSelectionService.test.ts`:

- Handoff → `CableEngineeringInput` mapping
- `buildPersistedDrumPlan` line mapping from engine output
- Stale cutting plan detection
- Tolerance passed through to optimizer (≠ 0)

### 16.3 Regression (must stay green)

- `drumCapacityCalculator.test.ts`
- `drumOptimizationService.test.ts`
- `drumSelectionService.test.ts`
- `v2CuttingLengthPersistence.test.ts`

### 16.4 Gate before merge

`npm test`, `tsc --noEmit`, `prisma validate`

---

## 17. Frozen-Domain Protection

Task 05D implementation **must not modify**:

| Frozen area | Paths |
|-------------|-------|
| Costing V2 / Decision 5 | `src/domain/costingEngine.ts`, `costingEngine.test.ts` |
| Cable BOM governance | `bomConflictGovernanceService`, 81-conflict freeze |
| Drum Master SoT / import | `drumMasterWriteRepository.ts`, normalization scripts |
| Drum optimization **algorithm** | `drumOptimizationService.ts` ranking/capacity logic |
| `drumCapacityCalculator.ts` math | Unless bugfix with test — prefer frozen |
| Commercial Fulfillment WIP | `src/components/fulfillment/*` |
| D365 integration | commitment/export paths |
| V1 config | `SmartConfigurator.tsx`, `CableConfiguratorModal.tsx` |
| `DrumCompatibility` schema / fake rows | BLOCKED entity |
| V1 `/api/inquiries` behavior | Legacy commercial routes |

**Allowed:** New Prisma models, `v2DrumSelectionService.ts`, V2 routes, V2 UI step, read-only calls to optimization functions, audit entries, legacy `drumSchedule` projection.

---

## 18. Risks

| Risk | Impact | Mitigation |
|------|--------|------------|
| Single `nominalLengthM` ambiguous (per-drum vs total) | Wrong auto schedules | PO decision §8.1; extend handoff |
| `selectDrum` tolerance hard-coded 0 | Legacy auto mismatch | V2 bypasses `selectDrum`; passes handoff tolerance |
| Drum Master incomplete engineering | No suitable drums | Existing gap report UX; block persist |
| V1/V2 both write `drumSchedule` | Data clash | Namespace by `workflowChannel`; V2 projection only from `V2DrumPlan` |
| Large `engineeringSnapshot` JSON | DB bloat | Cap line count; strip redundant fields in mapper |
| Customer runs auto optimize on every keystroke | Load | Debounce; candidates route rate-limit (optional) |
| Quotation expects legacy scalars | Broken V1 views | Optional projection on persist |

---

## 19. Decisions Required

| # | Question | Options | Recommendation |
|---|----------|---------|----------------|
| 1 | Is drum plan required at `READY_FOR_COMMERCIAL`? | Yes / No / after quotation | **Yes** — parallel to cutting plan gate |
| 2 | `nominalLengthM` semantics for optimizer | Total order vs per-drum | **Total order** (align with `optimizeDrumPlan`) |
| 3 | Allow persist with `WARNING` validation? | Block / Allow | **Allow** with warnings recorded |
| 4 | Project to `CommercialInquiryLine.drumSchedule`? | Yes / No | **Yes** for workspace compatibility |
| 5 | Customer vs TO permission for auto optimize | Customer / TO only | **Customer** with `assertCanManageInquiry` |
| 6 | Single-drum MVP vs multi-row first release | MVP / full | **Full multi-row** — engine already supports |
| 7 | Store `engineeringSnapshot` full vs trimmed | Full / trimmed | **Full** `AuthoritativeDrumPlan` |
| 8 | Invalid plan draft persist? | Reject / allow DRAFT | **Reject** |
| 9 | New `InquiryLineStatus` for drum validated? | Enum / metadata | **Optional** `DRUM_PLAN_VALIDATED` |
| 10 | Reuse master `/drums/*` from V2 vs new routes | Proxy / new scoped | **New scoped V2 routes** |

---

## 20. Recommended Implementation Sequence

1. **PO decisions** — §19 #1–2 (length semantics, commercial gate)
2. **Types + mapper** — `v2DrumSelectionService.ts`, DTOs, `buildPersistedDrumPlan`
3. **Prisma** — `V2DrumPlan`, `V2DrumPlanLine`, line pointer; migration
4. **Repository** — `v2DrumPlanRepository.ts` (transaction: plan + lines + line pointer + optional legacy projection + audit)
5. **Routes** — context, candidates, preview, persist, list, current
6. **API client** — `v2DrumPlanApiService.ts`
7. **Tests** — domain unit + HTTP persistence + IDOR
8. **UI** — `DrumSelectionSectionV2` + `CableConfiguratorV2` wiring; reuse `DrumSelectionWorkflowPanel`
9. **Gates** — extend `transitionV2InquiryEngineeringStatus` if PO approves drum plan requirement
10. **Docs** — update doc 34/35 cross-refs; Task 05D completion note
11. **Costing handoff doc stub** — `CostingDrumPlanHandoffDto` in `docs/v2/` (reference only)

---

## Appendix A — Files inspected

| Path | Relevance |
|------|-----------|
| `prisma/schema.prisma` | V2ConfigurationSnapshot, V2CuttingLengthPlan, DrumMaster, DrumCompatibility, CommercialInquiryLine, CostingPackingRule |
| `prisma/migrations/20260905180000_v2_cutting_length_plan/migration.sql` | 05C migration pattern |
| `src/domain/v2CuttingLengthService.ts` | DrumSelectionHandoffDto, validation, commercial gate helper |
| `src/server/v2CuttingLengthRepository.ts` | 05C persist/handoff/audit |
| `src/server/v2InquiryConfigurationRoutes.ts` | V2 API surface |
| `src/server/v2InquiryConfigurationRepository.ts` | READY_FOR_COMMERCIAL cutting gate |
| `src/services/v2CuttingLengthApiService.ts` | Client DTOs |
| `src/components/cable-configurator/v2/components/CuttingLengthSectionV2.tsx` | 05C UI |
| `src/components/cable-configurator/v2/components/CableConfiguratorV2.tsx` | No drum step yet |
| `src/components/cable-configurator/v2/services/v2CableConfigurationService.ts` | downstreamGates, readiness matrix |
| `src/domain/drumCapacityCalculator.ts` | Frozen suitability math |
| `src/domain/drumOptimizationService.ts` | AuthoritativeDrumPlan, ranking, optimize |
| `src/services/drumSelectionService.ts` | Legacy wrapper |
| `src/services/drumOptimizationApiService.ts` | Master API client |
| `src/server/masterDataRoutes.ts` | Drum compute endpoints |
| `src/server/drumMasterWriteRepository.ts` | Drum Master writes (frozen) |
| `src/platform/masterDataSoT.ts` | DrumMaster SOT, DrumCompatibility BLOCKED |
| `src/server/rbac.ts` | assertCanUseDrumOptimization |
| `src/server/customerScope.ts` | Customer isolation |
| `src/components/common/DrumSelectionWorkflowPanel.tsx` | Selection UX |
| `src/components/common/DrumCuttingScheduleTable.tsx` | Schedule table |
| `src/components/common/DrumMasterSelect.tsx` | Drum list hook |
| `src/components/common/DrumDetailsModal.tsx` | V1 modal |
| `src/components/common/CableSearchSelectModal.tsx` | V1 drum workflow |
| `src/domain/inquiryDrumSchedule.ts` | Legacy schedule shape |
| `src/domain/drumPlanService.ts` | V1 K/S/P prototype |
| `src/types.ts` | DrumSelectionInput/Result |
| `src/platform/v2CuttingLengthPersistence.test.ts` | 05C tests |
| `src/domain/v2CuttingLengthService.test.ts` | Domain tests |
| `src/services/drumSelectionService.test.ts` | Selection contract |
| `src/domain/drumOptimizationService.test.ts` | Optimization tests |
| `src/domain/drumCapacityCalculator.test.ts` | Capacity tests |
| `docs/v2/TASK05C_READINESS.md` | Prior task |
| `docs/v2/34_V2_CABLE_CONFIGURATION_PRODUCTION_READINESS.md` | 05A baseline |
| `docs/v2/35_V2_INQUIRY_CONFIGURATION_PERSISTENCE.md` | 05B baseline |

---

## Appendix B — Proposed files to change (implementation phase)

| File | Action |
|------|--------|
| `prisma/schema.prisma` | Add `V2DrumPlan`, `V2DrumPlanLine`, line FK |
| `prisma/migrations/20260906120000_v2_drum_plan/migration.sql` | **New** |
| `src/domain/v2DrumSelectionService.ts` | **New** — context, mapper, staleness |
| `src/server/v2DrumPlanRepository.ts` | **New** — persist/list/preview helpers |
| `src/server/v2InquiryConfigurationRoutes.ts` | Add drum-selection + drum-plan routes |
| `src/services/v2DrumPlanApiService.ts` | **New** |
| `src/services/v2InquiryConfigurationApiService.ts` | Extend DTOs (`v2CurrentDrumPlanId`) |
| `src/components/cable-configurator/v2/components/DrumSelectionSectionV2.tsx` | **New** |
| `src/components/cable-configurator/v2/components/CableConfiguratorV2.tsx` | Wire drum step |
| `src/components/inquiry-quotation/V2InquiryConfigurationPanel.tsx` | Show drum plan status |
| `src/platform/v2DrumPlanPersistence.test.ts` | **New** |
| `src/domain/v2DrumSelectionService.test.ts` | **New** |
| `docs/v2/34_*.md`, `docs/v2/35_*.md` | Cross-reference 05D (post-impl) |

---

## Appendix C — Proposed migration

**Name:** `20260906120000_v2_drum_plan`

- `CREATE TABLE "V2DrumPlan"` (see §3.1)
- `CREATE TABLE "V2DrumPlanLine"` (see §3.2)
- `ALTER TABLE "CommercialInquiryLine" ADD COLUMN "v2CurrentDrumPlanId"`
- FK `V2DrumPlan.cuttingLengthPlanId` → `V2CuttingLengthPlan.id` ON DELETE RESTRICT
- FK `V2DrumPlan.inquiryLineId` → `CommercialInquiryLine.id` ON DELETE CASCADE
- Unique on `planId`; indexes on `(inquiryLineId, versionNo)`, `cuttingLengthPlanId`, `(drumPlanId, lineSequence)`

Optional: `InquiryLineStatus` + `DRUM_PLAN_VALIDATED`.

---

## Appendix D — Proposed tests

| Test | Asserts |
|------|---------|
| `v2DrumPlanPersistence.test.ts` | Versioning, IDOR, stale cutting plan, handoff not ready, locked inquiry |
| `v2DrumSelectionService.test.ts` | Mapper, tolerance propagation, context validation |
| `v2DrumPlanManualAutoParity.test.ts` (optional) | Same line shape for MANUAL vs AUTOMATIC persist |
| Regression | 05C + drum engine tests green |

---

## Appendix E — Frozen areas protected

- `src/domain/costingEngine.ts` and `costingEngine.test.ts` expectations
- `CostingMetalCostComponent` / Direct RM metal price logic
- `docs/DECISION5*`
- Cable BOM governance (81 conflicts)
- Drum Master schema, import pipeline, `normalizeDrumEngineeringFromCapacity.ts`
- `drumOptimizationService.ts` / `drumCapacityCalculator.ts` algorithms (consume only)
- `DrumCompatibility` — no fabricated rows
- `src/components/fulfillment/*` WIP
- D365 export/commitment modules
- V1 `SmartConfigurator.tsx`, `CableConfiguratorModal.tsx`, V1 inquiry numbering

---

## Appendix F — Decisions required from product owner

1. Drum plan required at `READY_FOR_COMMERCIAL` (§19 #1)
2. `nominalLengthM` vs total order length for optimizer input (§19 #2, §8.1)
3. WARNING vs INVALID gating on persist (§19 #3)
4. Legacy `drumSchedule` projection from V2 (§19 #4)
5. Customer permission for automatic optimization (§19 #5)
6. Multi-row schedule in first release (§19 #6)
7. `engineeringSnapshot` retention policy (§19 #7)
8. Optional `DRUM_PLAN_VALIDATED` line status (§19 #9)

---

**Readiness verdict:** Task 05C closed the cutting-length gap; **drum selection math and UX prototypes exist but authoritative drum plan persistence is MISSING**. The Selection vs Drum Plan boundary is clear in domain types (`EvaluatedDrumCandidate` vs `AuthoritativeDrumPlan`) but not enforced at the inquiry API layer. **Not production-ready** until `V2DrumPlan` is implemented, tested, wired into V2 UI, and PO decisions in §19 are closed.
