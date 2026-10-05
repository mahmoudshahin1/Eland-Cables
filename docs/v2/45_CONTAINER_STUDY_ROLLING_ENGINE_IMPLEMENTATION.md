# TASK 05I-DE — Container Study Rolling Engine Implementation

**Date:** 2026-09-10  
**Mode:** Rolling calculation engine (deterministic first-fit)  
**Governing:** [39](./39_CONTAINER_STUDY_BUSINESS_TECHNICAL_SPECIFICATION.md) · [42](./42_CONTAINER_STUDY_ALGORITHM_DECISION_AND_SAAS_PARITY.md) · [43](./43_CONTAINER_STUDY_MASTER_DATA_AND_ENGINE_DESIGN.md) · [44](./44_CONTAINER_STUDY_PERSISTENCE_IMPLEMENTATION.md)

---

## Algorithm identity

**`LEGACY_FIRST_FIT_V1`** is the SaaS deterministic Rolling first-fit engine implemented in TypeScript.

It is **not** full Excel/VBA parity. It does not execute VBA, COM, or workbook macros.

### Explicitly NOT Excel parity

| Excel / VBA behavior | SaaS 05I-DE |
|----------------------|-------------|
| Multi-tier width packing (tier 1/2/3) | **Not implemented** — serial length first-fit only |
| Virtual second-layer physical load | **Not implemented** — flag only + warning |
| Forklifting G/H swap and placement | **Not implemented** |
| 6100 mm post-adjust → 20 STD @ 5900 | **Not implemented** — rule BLOCKED in configuration |
| G02 / G03 / G12 occupancy golden | **Not encoded** — doc 42 UNVERIFIED |
| G01 “24 containers” Excel headline | **Not an acceptance target** — G01 tests drum conservation only |

---

## Architecture

| Layer | File | Role |
|-------|------|------|
| Pure engine | `src/domain/containerStudyCalculationEngine.ts` | `calculateContainerStudy(input)` — no Prisma/HTTP/clock/random |
| Types | `src/domain/containerStudyCalculationTypes.ts` | Input/output DTOs |
| Snapshot adapter | `src/domain/containerStudySnapshotMapper.ts` | Maps immutable snapshot → engine input |
| Snapshot pins | `src/domain/containerStudySnapshotPins.ts` | Pinned configuration status metadata |
| Persistence | `src/server/containerStudyRepository.ts` | Load snapshot → engine → new immutable result |
| API | `src/server/containerStudyRoutes.ts` | `POST /api/v2/container-studies/:id/calculate` |

## Lifecycle (actual persisted model)

There is **no** `CALCULATED` enum value. Logical flow:

```
DRAFT ──validate──► VALIDATED ──confirm──► CONFIRMED ──supersede──► SUPERSEDED
  │                      │
  │ calculate            │ calculate (allowed)
  ▼                      ▼
 currentResultId set   currentResultId set (status unchanged)
```

| Concept | Representation |
|---------|----------------|
| **Calculated** | `ContainerStudy.currentResultId` references a `ContainerStudyResult` for the current snapshot |
| **Validated** | `status = VALIDATED` (structural readiness; independent of calculation) |
| **Confirmed** | `status = CONFIRMED` + immutable snapshot/result |

**Recalculation:** each `/calculate` creates a **new** `ContainerStudyResult` row (`resultId` suffix `r{n}`), updates `currentResultId`, and **does not** change study status. Prior result rows are never updated.

**Re-snapshot:** capturing a new snapshot on a `VALIDATED` study returns status to `DRAFT` (inputs changed).

**Failed calculation:** engine `ok: false` → API error; **no** result row is persisted.

## Snapshot-only calculation path

After the snapshot is loaded, the calculation path does **not** read live `ContainerTypeVersion`, `AlgorithmConfiguration`, `AlgorithmConfigurationParameter`, or `DrumPackingProfileVersion`.

Eligibility uses pinned `__SNAPSHOT_CONFIGURATION_STATUS__` stored in `algorithmParameterPinJson` at capture time.

## Input contract

Engine consumes **only** pinned snapshot fields:

- `drums[]` — logical lines with packed L/W/weight
- `containerPins[]` / `containerMasterPinJson` — approved dimensions
- `algorithmParameterPinJson` — thresholds and limits (metadata pins filtered out)
- `algorithmVersionCode`, `configurationVersion`, `stuffingMethod`, `region`

## Sorting

1. `packedLengthMm` DESC  
2. `packedWidthMm` DESC  
3. `sourceLineId` ASC  
4. `instanceIndex` ASC  

## Allocation (V1 physical model)

Serial first-fit along container length; width checked against `internalWidthMm`. No tier geometry, 3D placement, or rotation.

## Container type classification

From snapshot `FLANGE_OPEN_TOP_MIN` / `FLANGE_HQ_MIN`:

1. ≥ OT threshold → **40 Open Top**  
2. Else ≥ HQ threshold → **40 HQ**  
3. Else → **40 STD** (pin dimensions; **no** automatic 20 STD via 6100)

### B2300M (doc 42 fixture)

| Source | Outcome |
|--------|---------|
| **SaaS** | **40 STD** @ **12000** usable length |
| **Excel** | 20 STD @ 5900 via **blocked** 6100 post-adjust |
| **Golden label** | `NOT-EXCEL-PARITY` — SaaS regression only |

## Result immutability

- No API updates existing `ContainerStudyResult` rows.
- `CONFIRM` requires `currentResultId`, full drum accounting, and **zero** unallocated drums.
- Confirmed studies cannot recalculate or re-snapshot.

## RBAC & audit

- `LOGISTICS:CONTAINER_STUDY:CALCULATE`
- `CONTAINER_STUDY_CALCULATED`, `CONTAINER_STUDY_SNAPSHOT_CAPTURED`
- `CONTAINER_STUDY` number sequence: **fail closed** (`CONFIGURATION_REQUIRED`) — no `Date.now()` fallback

## Golden test status

| Fixture | Status | Notes |
|---------|--------|-------|
| B2300P, B2600M, B2600P | PASS | Classification |
| B2300M | PASS (SaaS, **not Excel**) | 40 STD @ 12000 |
| G10, G10B | PASS | Unallocated |
| G11A–C | PASS | OT; remLength 6100 without M3→5900 |
| B1050M, SL50M | PASS | V2 flag only |
| G01 | PASS (invariants) | 185 drums accounted; **not** 24-container Excel target |
| G04 | PASS | Forklifting rejected |
| G02, G03, G12 | BLOCKED / UNVERIFIED | Not encoded |

## NOT IMPLEMENTED

- Forklifting calculation  
- Virtual second-layer physical loading  
- 6100 mm post-adjustment  
- Global / bin-pack optimization  
- Freight costing / `costingEngine.ts` changes  

---

*Excel/VBA execution NOT USED.*
