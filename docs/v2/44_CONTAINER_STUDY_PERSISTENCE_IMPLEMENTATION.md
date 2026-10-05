# TASK 05I-DD — Container Study Persistence Implementation

**Date:** 2026-09-10  
**Mode:** Persistence / master-data foundation  
**Status:** Implemented — **calculation engine NOT IMPLEMENTED**  
**Governing:** [39](./39_CONTAINER_STUDY_BUSINESS_TECHNICAL_SPECIFICATION.md) · [42](./42_CONTAINER_STUDY_ALGORITHM_DECISION_AND_SAAS_PARITY.md) · [43](./43_CONTAINER_STUDY_MASTER_DATA_AND_ENGINE_DESIGN.md)

**Next task (not started):** 05I-DE — Rolling calculation engine

---

## Entities created

| Prisma model | Role |
|--------------|------|
| `ContainerType` / `ContainerTypeVersion` | Governed catalog + effective-dated versions |
| `AlgorithmVersionRegistry` | `LEGACY_FIRST_FIT_V1` (not implemented); blocked future codes |
| `AlgorithmConfiguration` / `AlgorithmConfigurationParameter` | Versioned constants; `POST_ADJUST_REMAINING_LENGTH_GE` = **BLOCKED** |
| `DrumPackingProfile` / `DrumPackingProfileVersion` | Explicit packed L×W; flange not inferred |
| `ContainerShipmentGroup` | Association only (no grouping algorithm) |
| `ContainerStudy` | Aggregate + lifecycle |
| `ContainerStudyInputSnapshot` + drums + container pins | Immutable input; denormalized master pins |
| `ContainerStudyResult` + containers / allocations / unallocated | Result lineage **foundation only** |

Seeded type codes: `40HQ`, `40STD`, `20STD`, `40OT` with Excel parity labels. **Dimensions are `PENDING_APPROVAL` / null** — Excel 12000 / 5900 / 2350 / 26000 are **not** production masters. Those values exist only as **legacy sample** algorithm parameters with `LEGACY_SAMPLE_NOT_PRODUCTION_MASTER` notes.

## Relationships

- Study → inquiry (`Restrict`), shipment group (`Restrict`), optional customer master (`Restrict`)
- Snapshot → configuration (`Restrict`); pins → container type versions (`Restrict`)
- Result → snapshot + study (`Restrict`)
- Current snapshot/result FKs on study are unique and `Restrict`
- Confirmed studies cannot capture a new snapshot (service)

Historical recalculation must use the snapshot JSON pins, not live `ContainerType` rows.

## Lifecycle

`DRAFT` → `VALIDATED` → `CONFIRMED` → `SUPERSEDED`

- `VALIDATED` requires structural completeness (approved dimensions, packed L/W/weight, ACTIVE configuration, shipment group). Forklifting cannot validate (`STUFFING_METHOD_NOT_IMPLEMENTED`).
- `CONFIRMED` additionally requires an engine result (not available in this task).
- Recalculate / new snapshot on `VALIDATED` returns the study to `DRAFT`.
- `SUPERSEDE` creates `versionNo + 1` with the same `studyNumber`.

## Versioning / snapshot strategy

Changing payload, usable length, width, or replacing the current type version **inserts a new version** and supersedes the previous current row. Snapshots copy pin JSON at capture time.

Physical drum identity: `sourceLineId:instanceIndex` (`physicalDrumKey`). Quantity is stored logically; expansion is the future engine’s job.

## RBAC

`LOGISTICS:CONTAINER_STUDY:{VIEW,CREATE,VALIDATE,CONFIRM,SUPERSEDE}`  
`LOGISTICS:CONTAINER_MASTER:MANAGE`  
`LOGISTICS:PACKING_PROFILE:MANAGE`  
`LOGISTICS:ALGORITHM_CONFIGURATION:MANAGE`

Customers: **VIEW** own studies only; cannot create/confirm/manage masters.

## Audit

`appendServerAudit` / `AuditEvent`:

- `CONTAINER_STUDY_CREATED` / `_VALIDATED` / `_CONFIRMED` / `_SUPERSEDED`
- `CONTAINER_MASTER_CHANGED`
- `ALGORITHM_CONFIGURATION_ACTIVATED`
- `PACKING_PROFILE_CHANGED`

## Customer isolation

`customerScope` + `assertCanAccessInquiryOwnership`. Request-body customer ids are not trusted.

## Migration

`prisma/migrations/20260910180000_container_study_persistence_foundation/`

Additive. Number sequence `CONTAINER_STUDY` (`CST{YY}-{#####}`).

**Rollback:** drop the new tables/enums (no frozen V1 tables altered). Do not delete versions referenced by snapshots.

## Tests

- `src/domain/containerStudyFoundation.test.ts`
- `src/platform/containerStudyPersistence.test.ts`

## Known limitations

- **No Rolling / Forklifting / virtual-layer / 6100 engine.**
- Seeded container dimensions are not approved; studies stay DRAFT / not VALIDATED until Logistics/TO approve versions.
- Algorithm configuration starts **DRAFT** until activated.
- VIP Calculate and `costingEngine.ts` unchanged (0 + warning).
- No production Container Study UI.
- Result tables exist but are not populated by an engine.

---

*Container Study calculation engine NOT IMPLEMENTED.*
