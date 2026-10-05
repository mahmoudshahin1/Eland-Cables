# TASK 05I-DC — Container Study Master Data & Engine Design

**Date:** 2026-09-10  
**Mode:** DESIGN ONLY — no application code, Prisma migrations, APIs, UI, or engine implementation  
**Status:** **DESIGN READY FOR REVIEW** — **not** implementation-ready  
**Governing parity boundary:** [42](./42_CONTAINER_STUDY_ALGORITHM_DECISION_AND_SAAS_PARITY.md)  
**Doc 41:** *not present* — golden evidence is doc 42 + `logs/container-golden/` (not re-executed)

**Chain:**

| Task | Artifact | Role |
|------|----------|------|
| 05I-DA | [39](./39_CONTAINER_STUDY_BUSINESS_TECHNICAL_SPECIFICATION.md) | Business / domain spec |
| 05I-DB | [40](./40_CONTAINER_STUDY_ALGORITHM_REVERSE_ENGINEERING.md) | VBA reverse engineering |
| 05I-DB+ | `logs/container-golden/` | Live Excel captures (partial) |
| 05I-DB++ | [42](./42_CONTAINER_STUDY_ALGORITHM_DECISION_AND_SAAS_PARITY.md) | Parity contract / go-no-go |
| **05I-DC** | **This document** | Master-data + engine architecture |
| 05I-DD+ | *not started* | Persistence / UI / engine code |

**Frozen bases:** 05I-B `30d97df` · 05I-C `5b5254e` · 05I-DA `989650b` · 05I-DB `1211c42` · 05I-DB++ `914d37d`

**This document does not authorize engine implementation.**

---

## Architecture principle

Container Study is a **governed, deterministic, versioned calculation capability**.

It is **not**:

- an Excel clone or worksheet emulator
- a hidden-rule engine
- a collection of hard-coded constants in application code
- an uncontrolled optimization / bin-packing solver

**Nine architectural layers (must remain separate):**

| # | Layer | Responsibility |
|---|---------|----------------|
| 1 | Master Data | Container types, payload, dimensions — governed, effective-dated |
| 2 | Algorithm Configuration | Versioned constants and ordered type-resolution rules |
| 3 | Packing Profiles | Loaded-drum envelope mapping (flange ≠ shipping envelope) |
| 4 | Study Input Snapshot | Immutable inputs captured before calculate |
| 5 | Calculation Engine | Pure function: snapshot + versions → result |
| 6 | Result Snapshot | Immutable allocations, utilization, unallocated, warnings |
| 7 | Validation / Exception Handling | Lifecycle gates; no silent drum loss |
| 8 | Audit | `appendServerAudit` on material state changes |
| 9 | Algorithm Version | Identity of the calculation, independent of live masters |

---

## 1. Domain boundary

### 1.1 Container Study determines

- Container feasibility (does this packed drum fit any allowed type?)
- Container allocation (which physical container instance)
- Drum allocation (which expanded drum instance in which container)
- Loaded weight and remaining payload
- Dimensions used (usable length / width remaining — V1)
- Utilization metrics (separate; §15)
- Unallocated drums with explicit reason
- Warnings / errors
- Shipment-grouping **inputs** (per shipment group; §20)

### 1.2 Container Study does **not** replace

| Domain | Why it stays separate |
|--------|------------------------|
| Drum Selection / Drum Master | Which reel holds cable — frozen 05E |
| Cable Configuration | Cable identity / snapshot |
| Cutting Length Plan | Lineage pin for drum plan |
| Costing (`costingEngine.ts`) | Metal / process cost — **Costing V2 freeze** |
| Pricing / Commercial Quotation | Margin and offer |
| D365 fulfillment | Not connected |

```
Drum Selection  ≠  Container Study
Which reel holds cable  ≠  which container holds loaded reels
```

**CONFIRMED:** VIP Calculate still treats missing container data as **0 + warning**, never a mandatory BLOCK ([38](./38_VIP_FAST_TRACK_CALCULATE_ORCHESTRATOR.md), [39 §1.3](./39_CONTAINER_STUDY_BUSINESS_TECHNICAL_SPECIFICATION.md)). This design does not change that.

**Rejected production authority:** prototype `ContainerAndDrumOptimizerModal` client math ([39 §1.4](./39_CONTAINER_STUDY_BUSINESS_TECHNICAL_SPECIFICATION.md)).

---

## 2. Container Master (conceptual)

**Proposed entity:** `ContainerType` (catalog) + optional `ContainerTypeVersion` (effective dating).  
**Not in Prisma today.** Prototype UI 20ft / 40HC labels are **not** authoritative ([39 §4](./39_CONTAINER_STUDY_BUSINESS_TECHNICAL_SPECIFICATION.md)).

**Do not invent production dimensions.** Until Logistics + Technical Office approve values, studies cannot reach `VALIDATED`.

### 2.1 Attribute classification

| Attribute | V1 | Notes |
|----------|----|-------|
| `code` (natural key, e.g. `40HQ`, `20STD`) | **REQUIRED FOR V1** | Logistics-owned code set (D-01) |
| `parityLabel` | **REQUIRED FOR V1** | Excel strings: `40 HQ`, `40 STD`, `20 STD`, `40 Open Top` |
| `description` | **REQUIRED FOR V1** | |
| `active` | **REQUIRED FOR V1** | |
| `effectiveFrom` / `effectiveTo` | **REQUIRED FOR V1** | Spec validity; pin version on snapshot |
| `usableLengthMm` | **REQUIRED FOR V1** | Excel M3 init **12000** / 20' **5900** — sourced from master, not code literals |
| `internalWidthMm` | **REQUIRED FOR V1** | Excel K3 sample **2350** — **Q-10 / D-03:** prefer **per-type**; V1 may snapshot a study-level width until per-type approved |
| `payloadCapacityKg` | **REQUIRED FOR V1** | Excel E5 sample **26000** — prefer per-type (D-03) |
| `nominalLengthMm` | **OPTIONAL FUTURE** | Display / ISO class; engine uses usable length |
| `internalHeightMm` | **NOT CURRENTLY SUPPORTED** | VBA has no height model ([40](./40_CONTAINER_STUDY_ALGORITHM_REVERSE_ENGINEERING.md)) |
| `doorWidthMm` / `doorHeightMm` | **NOT CURRENTLY SUPPORTED** | Doc 39 R-01 — no Excel evidence |
| `tareWeightKg` / `maxGrossWeightKg` | **OPTIONAL FUTURE** | Gross vs payload — not in VBA |
| `usableVolumeM3` | **OPTIONAL FUTURE** | Volume utilization not in V1 |
| `regionApplicability` | **OPTIONAL FUTURE** | Region today gates **V2 flag**, not type catalog ([42 §6](./42_CONTAINER_STUDY_ALGORITHM_DECISION_AND_SAAS_PARITY.md)) |
| `stuffingApplicability` | **OPTIONAL FUTURE** | Stuffing is a study input; Forklifting placement **BLOCKED** |

### 2.2 V1 type catalog (parity labels only)

Until Logistics approves ISO-style codes, the engine classifies using **parity labels** from Excel `O3`:

`40 Open Top` · `40 HQ` · `40 STD` · `20 STD`

Master rows must map 1:1 to those labels for `LEGACY_FIRST_FIT_V1`. Additional types are **FUTURE**.

---

## 3. Algorithm configuration

Excel constants become **versioned configuration**, not scattered literals.  
**Ordinary users must not edit algorithm constants.**

### 3.1 Parameter register

| Name | Legacy value | Unit | Scope | V1 status | Governance |
|------|--------------|------|-------|-----------|------------|
| `CONTAINER_INTERNAL_WIDTH` | 2350 | mm | Study / type | Snapshot required; per-type **F** (Q-10) | **Logistics** |
| `MAX_LOADING_WEIGHT` | 26000 | kg | Study / type | Snapshot required | **Logistics** |
| `USABLE_LENGTH_40` | 12000 | mm | Type / algorithm | Required for V1 Rolling | **Logistics + Engineering** |
| `USABLE_LENGTH_20` | 5900 | mm | Type / algorithm | Used **after** type path, not as a flange shortcut | **Engineering** |
| `FLANGE_HQ_MIN` | 2300 | mm | Algorithm | **A** at 2300/2301 | **Engineering** |
| `FLANGE_OPEN_TOP_MIN` | 2600 | mm | Algorithm | **A** at 2600/2601 | **Engineering** |
| `SECOND_LAYER_LENGTH_LT` | 1050 | mm | Algorithm | Strict `&lt; 1050` (**A**) | **Engineering** |
| `SECOND_LAYER_SHARE_MIN` | 0.5 | ratio | Algorithm | **A** 1/3 vs 50% vs 2/3 | **Engineering** |
| `POST_ADJUST_REMAINING_LENGTH_GE` | 6100 | mm | Algorithm | **UNVERIFIED** — **not an independent V1 rule** | **Engineering** (blocked) |
| `CONTAINER_SEARCH_LIMIT` | 1000 | count | Algorithm + safety | Bound, not UI brute-force | **IT / system** |
| `INPUT_ROW_LIMIT` | 2000 | rows | Algorithm | Sort/input ceiling | **IT / system** |
| `CLEARANCE_DRUM_MM` | 50 | mm | **Drum Selection** | **Out of this engine** ([39 R-05](./39_CONTAINER_STUDY_BUSINESS_TECHNICAL_SPECIFICATION.md)) | Drum Master freeze |
| `CONTAINER_EDGE_CLEARANCE_MM` | — | mm | Packing | **TBD** — do not copy drum clearance | **Technical Office** |

Every parameter record conceptually has:

`name` · `value` · `unit` · `scope` · `effectiveFrom` · `effectiveTo` · `active` · `configurationVersion` · `approvalRequirement` · `auditRequired`

### 3.2 Who may change what

| Class | Examples | Who | Approval |
|-------|----------|-----|----------|
| **System governed** | Search limit, input row limit, numeric type (no VBA `Integer`), algorithm id | IT | Change-control; not operational UI |
| **Engineering governed** | 2300 / 2600 / 1050 / 50% / type-resolution **order** | Technical Office | Dual: TO + IT version bump |
| **Logistics governed** | Payload, usable lengths, width, active container types | Logistics | Effective dating + audit |
| **Admin configurable** | Active flag, descriptions, region labels | Admin **within** approved catalogs | Cannot invent new physics |
| **Blocked / unverified** | Isolated `6100 → 20 STD`; Forklifting placement; virtual load | — | Not editable into an enabled V1 rule |

**Recommendation:** algorithm configuration is **not** a costing-formula-style self-service editor. Changes mint a new `configurationVersion` and cannot mutate historical studies.

---

## 4. Drum packing profile

**Problem (doc 39 D-17 / doc 40 Q-07):** Excel “length” is treated as packing length (often flange). Flange ≠ shipping envelope.

### 4.1 Conceptual entity `DrumPackingProfile`

Capable of **eventually** representing:

| Attribute | V1 | Notes |
|----------|----|-------|
| `profileId` / `version` | Required | Pinned on snapshot |
| `drumMasterId` / `drumCode` | Required | Reference, do not duplicate geometry |
| `packedLengthMm` | Required | Excel column A analogue |
| `packedWidthMm` | Required | Excel column B analogue |
| `packedHeightMm` | **NOT CURRENTLY SUPPORTED** | No VBA height |
| `orientationPolicy` | **OPTIONAL FUTURE** | Default: single captured orientation |
| `loadingOrientation` | **FUTURE / BLOCKED** for Forklifting swap | Q-03 |
| `tierEligibility` | **OPTIONAL FUTURE** | VBA tiers are Rolling-only |
| `stackingEligibility` | **NOT CURRENTLY SUPPORTED** | Doc 39 default: stacking disallowed until TO study |
| `stuffingMethodApplicability` | Snapshot input, not profile-owned in V1 | |
| `regionApplicability` | Optional future | V2 uses study region |
| `secondLayerEligible` | Informational only | Engine computes V2 flag from lengths + region + stuffing |

### 4.2 V1 mapping

Until D-17 is approved, V1 may accept **explicit packed L × W × gross kg** on the study input (from CONFIRMED `V2DrumPlan` + TO entry). Silent flange→envelope inference is **forbidden**.

**Blocked on profile:** Forklifting G↔H orientation; virtual second-layer as a physical allocation.

---

## 5. Stuffing method

### 5.1 Domain values (not aliases)

```
StuffingMethod = Rolling | Forklifting
```

They are distinct algorithm families. G01 vs G04: **24 vs 26** containers on the 185-drum sample ([42 §7](./42_CONTAINER_STUDY_ALGORITHM_DECISION_AND_SAAS_PARITY.md)) — **A** for counts only.

### 5.2 Forklifting status

```
FORKLIFTING_STATUS = NOT_READY_FOR_IMPLEMENTATION
FORKLIFTING_PLACEMENT_ENGINE = BLOCKED
```

**Reason:** F01–F04 not executed; G/H swap and Rolling-only tier branches remain **E** ([42](./42_CONTAINER_STUDY_ALGORITHM_DECISION_AND_SAAS_PARITY.md), [40 Q-03](./40_CONTAINER_STUDY_ALGORITHM_REVERSE_ENGINEERING.md)).

V1 engine **must reject** Forklifting with a structured error (`STUFFING_METHOD_NOT_IMPLEMENTED`) rather than silently running Rolling.

The study record still **stores** `stuffingMethod` so later versions can calculate without rewriting history.

---

## 6. Region

### 6.1 Domain values

```
StudyRegion = Europe | Africa
```

Not a cosmetic UI label. Stored on the input snapshot.

### 6.2 Where region affects the engine

| Concern | Effect | Evidence |
|---------|--------|---------|
| Algorithm family | Same `LEGACY_FIRST_FIT_V1` for both in V1 | G02 J2–J5 = G01 (**A**); occupancy JSON **D** — do not golden occupancy |
| `secondLayerEnabled` (V2) | Formula requires **not Europe** and **Rolling** | **B** + Africa fixtures **A** |
| Packing rules | No additional region packing rules verified | Do not invent |
| Container applicability | Not observed as a type filter | Optional future on Container Master |

---

## 7. Algorithm versioning

### 7.1 Version identity

Historical results are **not** identified by live configuration alone.

```
algorithmVersion          e.g. LEGACY_FIRST_FIT_V1
configurationVersion      algorithm parameter set id
containerMasterVersion    catalog pin
packingProfileVersion     profile pin (or explicit packed dims pin)
inputSnapshotId
```

**Reproducibility:** same input snapshot + same four version pins → same result.

### 7.2 Version catalogue (conceptual)

| Version | Meaning | Implementation |
|---------|---------|----------------|
| `LEGACY_FIRST_FIT_V1` | Rolling sequential first-fit; OT/HQ thresholds; V2 **flag** only | Design complete; code **not** authorized by this doc |
| `LEGACY_FIRST_FIT_V1_POST_ADJUST` | Adds VBA `U3≥6100` M3 post-adjust **verbatim** (not a 6100 shortcut) | **Blocked** until isolated 6100 fixture or signed copy-VBA decision |
| `FORKLIFTING_FIRST_FIT_V1` | Forklifting placement | **BLOCKED** |
| `BIN_PACK_OPT_V1` | Global optimization | **FUTURE** — parity first |

Mutable Excel constants must not change a CONFIRMED result. Recalculation mints a new result version.

---

## 8. Study input snapshot (immutable)

Captured **before** calculate. Engine must **not** re-read live masters.

Conceptual `ContainerStudyInputSnapshot`:

| Field | Required |
|-------|----------|
| `studyId`, `snapshotId`, `capturedAt` | Yes |
| Inquiry / shipment group context (`inquiryId`, `shipmentGroupId`, `customerMasterId`) | Yes |
| `deliveryAllocationMode` | Yes (`ENTIRE_INQUIRY` \| `PER_INQUIRY_LINE`) |
| `stuffingMethod` | Yes |
| `region` | Yes |
| `maxLoadingWeightKg` | Yes (study-level and/or per-type pins) |
| Container width / usable lengths **as used** | Yes |
| Drum list: identity, qty, packed L/W, gross kg, packing-profile ref | Yes |
| `algorithmVersion`, `configurationVersion`, master + profile pins | Yes |

Drums expand **inside** the engine from quantity; the snapshot stores **logical** lines plus expansion policy (`expandQuantity: true`).

---

## 9. Calculation engine (conceptual stages)

Pure function. No I/O except reading the snapshot. **No code in this task.**

```
Input Snapshot
  → 1. Normalize
  → 2. Expand physical drums
  → 3. Sort (stable)
  → 4. Allocate sequentially
  → 5. Evaluate container suitability
  → 6. Apply packing rules (V1: Rolling first-fit only)
  → 7. Calculate utilization
  → 8. Classify container type
  → 9. Record allocation
  → 10. Record unallocated
  → 11. Generate warnings / errors
  → 12. Produce immutable result
```

| Stage | Behavior |
|-------|----------|
| **Normalize** | Reject Forklifting; reject missing packed dims; coerce numerics (no VBA Integer); bind versions |
| **Expand** | Qty N → N physical instances with stable `instanceIndex` |
| **Sort** | Rolling: packed length DESC, width DESC, then **stable** original line/instance order. No DB order. |
| **Allocate sequentially** | For each expanded drum, try existing containers in index order, then open a new container, until search bound |
| **Suitability** | Weight ≤ remaining payload; packed width ≤ remaining width; packed length ≤ remaining length |
| **Packing rules V1** | Rolling first-fit only. No G/H swap. No virtual row-2 load. |
| **Utilization** | Per container, separate metrics (§15) |
| **Classify** | Ordered type resolution (§11) using packed lengths **in that container** + usable length after **enabled** adjustments |
| **Unallocated** | If no container accepts the drum after bound: explicit reason, drum remains in result |
| **Result** | Immutable `ContainerStudyResult` (§17) |

**Post-adjust stage (VBA `U3≥6100`):** exists as a **named optional plugin** on the pipeline. Default for `LEGACY_FIRST_FIT_V1` = **disabled**. Must not be replaced by “6100 means 20 STD”.

---

## 10. Legacy parity vs target SaaS

| Legacy Excel | SaaS target |
|--------------|-------------|
| Silent 0-container / drum left in G:I | `UNALLOCATED` + reason code + audit |
| `MsgBox` to finish calculate | Structured result DTO + persisted snapshot |
| `For nb = 1 To 1000` unbounded UX | Configurable bound + timeout + `SEARCH_BOUND_REACHED` |
| Hard-coded K3/E5/M3 | Versioned Container Master + configuration |
| 12-column hidden worksheet blocks | Structured `containers[]` / `allocations[]` |
| V2 flag vs empty O2 | `secondLayerEnabled` vs blocked `virtualAllocations[]` |
| VBA `Integer` | Safe numeric types; reject out-of-range |
| Forklift G/H undocumented | Engine refuses Forklifting until unblocked |
| G02/G03/G04 occupancy JSON | Not used as golden |

Parity means **matching enabled, evidence-backed rules** — not cloning Excel UX.

---

## 11. Container type resolution

### 11.1 Ordered parity logic (workbook `O3` — **B**)

Given drums already packed in the container (Q3 &gt; 0):

1. If any packed length **N ≥ 2600** → `40 Open Top`
2. Else if any packed length **N ≥ 2300** → `40 HQ`
3. Else if usable length **M3 = 5900** → `20 STD`
4. Else → `40 STD`

Empty container (Q3 = 0): type blank (not counted in J2–J5).

**Observed (A), fixtures qty 2 × 1600 mm × 2000 kg, Rolling, Europe:**

| Flange mm | Type |
|----------:|------|
| 2299 | 20 STD |
| 2300 / 2301 | 40 HQ |
| 2599 | 40 HQ |
| 2600 / 2601 | 40 Open Top |

G11A–C (5899–5901): **40 Open Top**, M3 stayed **12000** — Open Top fires **before** the 5900 path.

### 11.2 What must not be implemented

**Do not implement** an independent rule:

> remaining length ≥ 6100 ⇒ 20 STD

The VBA post-adjust (`U3 ≥ 6100` **and** type ∉ {40 HQ, 40 Open Top} ⇒ set M3 = 5900) is **C** in code, **not** isolated in live G11. B2300M is **compatible** with that path but does **not** prove the 6100 threshold ([42 §10](./42_CONTAINER_STUDY_ALGORITHM_DECISION_AND_SAAS_PARITY.md)).

**Design:** type-resolution **order** is versioned configuration. The 6100 post-adjust is a **separate, disabled** plugin until:

- isolated remaining-length fixture with flange **&lt; 2300**, or
- explicit signed decision to copy VBA verbatim as `LEGACY_FIRST_FIT_V1_POST_ADJUST`

Until then, golden tests that **depend** on the last 20 STD of G01 / B2300M M3=5900 are **conditional** (§26).

---

## 12. Second-layer design

| Concept | Status |
|---------|--------|
| `secondLayerEnabled` (Excel V2 flag) | **Supported concept** — Rolling + not Europe + share of packed lengths **&lt; 1050** ≥ 50% |
| `virtualSecondLayerAllocation` | **BLOCKED / FUTURE** |

**Do not fake physical allocation** onto a virtual layer. If V2 = 1, persist the flag and a warning `SECOND_LAYER_FLAG_NOT_LOADED` until Branch 4 is validated.

Verified flags ([42 §6](./42_CONTAINER_STUDY_ALGORITHM_DECISION_AND_SAAS_PARITY.md)): 1049 → 1; 1050/1051 → 0; 50% → 1; 1/3 → 0; 2/3 → 1.

---

## 13. Forklifting design (interface only)

### 13.1 Data the model must already accept

- `stuffingMethod = Forklifting` on study + snapshot
- Optional packing-profile fields: `loadingOrientation`, `axisSwapEligible` (unused)
- Result error `STUFFING_METHOD_NOT_IMPLEMENTED` / `FORKLIFTING_PLACEMENT_ENGINE_BLOCKED`

### 13.2 Placement engine

```
FORKLIFTING_PLACEMENT_ENGINE = BLOCKED
```

No G↔H swap, no “new-row only” guess, no count-matching heuristic to G04. G04 J2–J5 (14 HQ / 12 × 40 STD / 0 × 20 STD, 26 containers) may become golden **counts** only **after** a dedicated Forklifting version is approved — not in V1 Rolling.

---

## 14. Unallocated model

No silent discard.

```
UnallocatedDrum
  physicalDrumId          // lineId + instanceIndex
  reasonCode
  detailMessage
  attemptedContainerIndexes[]
  traceRef
```

| `reasonCode` | When |
|------------|------|
| `NO_FEASIBLE_CONTAINER` | No type/container accepted the drum (G10/G10B analogue) |
| `WEIGHT_LIMIT` | Exceeds payload (study or type) |
| `DIMENSION_LIMIT` | Length/width (height later) |
| `PACKING_RULE` | Policy reject (stacking, mixed-size when those rules exist) |
| `NO_CONTAINER_TYPE` | Catalog empty / inactive |
| `CONFIGURATION_ERROR` | Missing master/profile/version |
| `STUFFING_METHOD_NOT_IMPLEMENTED` | Forklifting in V1 |
| `SEARCH_BOUND_REACHED` | Bound/timeout before placement |
| `VIRTUAL_LAYER_NOT_SUPPORTED` | Would have required blocked Branch 4 — **do not auto-place** |

G10 (27000 kg) / G10B (13000 mm): legacy **0 containers**, drum still on sheet, empty `excelError`. SaaS **must** emit unallocated + reason. That is a **SaaS improvement**, not a claim that Excel showed that message.

`VALIDATED` / `CONFIRMED` require every expanded drum to be `ALLOCATED`, `UNALLOCATED` (with reason), `UNSUITABLE`, or `REQUIRES_REVIEW`. Unexplained absence **blocks** confirm ([39 §9](./39_CONTAINER_STUDY_BUSINESS_TECHNICAL_SPECIFICATION.md)).

---

## 15. Utilization

Per container, **separate** metrics. Do **not** publish a single blended score unless a later approved commercial rule says so.

| Metric | V1 | Source analogue |
|--------|-------|-----------------|
| Weight utilization % | Yes | Excel R3-style |
| Length utilization % | Yes | Excel S3-style |
| Width utilization % | Yes if remaining width captured | K remaining |
| Volume utilization % | **FUTURE** | No height model |
| Drum count (`Q3`) | Yes | Count of **physical** allocations only |

---

## 16. Determinism

Same `inputSnapshot` + `algorithmVersion` + `configurationVersion` + master pins + packing-profile pin → **byte-stable allocation** (same container indexes, same drum instance mapping, same type labels).

**Forbidden influences:**

- `Date.now` / clock
- `Math.random`
- Unstable object-key / DB `ORDER BY` without explicit keys
- Live master mutation after snapshot
- Optimizer heuristics

Sort keys are explicit and **stable**: length DESC, width DESC, `sourceLineId`, `instanceIndex`.

---

## 17. Result snapshot (immutable)

Conceptual `ContainerStudyResult`:

| Field | Purpose |
|-------|---------|
| `resultId`, `studyId`, `studyVersionNo` | Identity |
| `algorithmVersion`, `configurationVersion`, master/profile pins | Reproducibility |
| `calculatedAt` | Timestamp of this result (audit), **not** an engine input |
| `inputSnapshotId` | Lineage |
| `containers[]` | Index, `typeCode`/`parityLabel`, usable length, loaded/remaining weight & length, utilization, `secondLayerEnabled`, `drumCountQ3` |
| `allocations[]` | Drum instance → container index + reason-of-accept |
| `unallocated[]` | §14 |
| `warnings[]` / `errors[]` | Structured codes |
| `summary` | J2–J5 analogue counts, expanded drum count, container count |
| `auditEventIds` | Server audit refs |
| `decisionTraceRef` | Optional trace blob / id (§18) |

Each allocation preserves **why** this drum landed here (accepted after listed rejections — §18).

CONFIRMED results are append-only. Recalculation → new `resultId` / version; prior CONFIRMED → `SUPERSEDED`.

---

## 18. Explainability

Engine **must be capable** of emitting a decision trace. Full trace UI is **not** required in the first implementation task.

Example (conceptual):

```
Drum D001 instance 0 (1400×1000×27000)
  Container C01 rejected: WEIGHT_LIMIT (27000 > 26000)
  … no further containers opened (infeasible)
  → UNALLOCATED NO_FEASIBLE_CONTAINER / WEIGHT_LIMIT
```

```
Drum L3 instance 12
  Container C01 rejected: DIMENSION_LIMIT (remaining length)
  Container C02 accepted: length and weight feasible (Rolling first-fit)
```

Store traces as structured events (`rejected` / `accepted` / `openedContainer`), not Excel cell addresses.

---

## 19. Container Study lifecycle

Reuse [39 §7.2](./39_CONTAINER_STUDY_BUSINESS_TECHNICAL_SPECIFICATION.md):

```
DRAFT → VALIDATED → CONFIRMED → SUPERSEDED
```

| State | Recalculate? | Mutate in place? |
|-------|----------------|------------------|
| `DRAFT` | Yes (replaces DRAFT result) | Yes |
| `VALIDATED` | Yes → back to DRAFT or new VALIDATED | Inputs frozen unless rejected to DRAFT |
| `CONFIRMED` | **No** | **Immutable** |
| `SUPERSEDED` | No | Read-only |

Changed inputs after CONFIRMED → **new study version** + new snapshot + new result. Prior CONFIRMED remains for audit / quotation lineage.

Cannot CONFIRM with unexplained unallocated drums. Exception path is **TBD** (doc 39 D-12), with audit `CONTAINER_STUDY_EXCEPTION` if later approved.

---

## 20. Shipment grouping

From [39 §2–3](./39_CONTAINER_STUDY_BUSINESS_TECHNICAL_SPECIFICATION.md):

| Mode | Meaning |
|-------|---------|
| `ENTIRE_INQUIRY` | Prefer one group; split when destination/incoterm incompatible |
| `PER_INQUIRY_LINE` | At least one group per line |

**CONFIRMED:** mixed destinations **must** create separate shipment groups. Container Study runs **per shipment group**. Do not mix drums from incompatible destinations in one study calculate.

Engine input is **one shipment group’s drums**. Inquiry-level UI aggregates group results.

---

## 21. VIP Calculate integration (boundary only)

Existing rule **preserved** ([38](./38_VIP_FAST_TRACK_CALCULATE_ORCHESTRATOR.md)):

| Container study state | VIP Calculate |
|-----------------------|---------------|
| Missing / not ready | `containerShipmentCost = 0` + `CONTAINER_DATA_NOT_CONFIGURED` (**WARN**) |
| CONFIRMED + shipment cost snapshot | Optional component populated |
| Mandatory gates (snapshot, cutting, confirmed drum, BOM Gate 2, costing) | Unchanged **BLOCK** behavior |

Container Study is an **optional commercial input**, not a structural calculate gate. This design **must not** convert CONTAINER_STUDY to BLOCK.

Readiness enum remains:

`CONTAINER_STUDY_REQUIRED` | `CONTAINER_STUDY_NOT_READY` | `CONTAINER_STUDY_READY`

`CONTAINER_STUDY_READY` only when a **CONFIRMED** study (+ optional cost snapshot policy from 39) is pinned.

---

## 22. Standard workflow integration

STANDARD process already has stage `CONTAINER_STUDY` ([37](./37_WORKFLOW_RUNTIME_FOUNDATION.md)).

**Proposed adapter (not wired):**

- Stage work item completes when study for **all** shipment groups is `CONFIRMED`
- Transition to `COSTING` **PROPOSED mandatory** CONFIRMED study (doc 39 D-15) — **process-owner decision**, not engine code
- Do **not** create a competing workflow

VIP_FAST_TRACK does not wait on this stage.

---

## 23. Costing boundary

Container Study **may provide** to commercial/logistics:

- Container count and type mix (J2–J5 analogue)
- Shipment grouping
- Inputs for a future Shipment Cost Snapshot
- Logistics warnings / unallocated exceptions

It **must not**:

- Modify `costingEngine.ts` / metal / BOM / Decision 5
- Write manufacturing cost lines
- Treat ELAND `ContainerQty × 3500 USD` as coded freight ([39 §4.3](./39_CONTAINER_STUDY_BUSINESS_TECHNICAL_SPECIFICATION.md))

Costing and pricing **consume** a CONFIRMED result snapshot by reference (`containerStudySnapshotId`). Freight money lives in Shipment Cost, a **commercial optional component** (D-18 **CONFIRMED**).

---

## 24. Audit & security

### 24.1 Permissions (proposed)

Align with existing `MODULE:RESOURCE:ACTION` style ([39 §18](./39_CONTAINER_STUDY_BUSINESS_TECHNICAL_SPECIFICATION.md)), expanded as requested:

| Permission | Capability |
|-----------|------------|
| `VIEW_CONTAINER_STUDY` | View studies in customer scope |
| `CREATE_CONTAINER_STUDY` | Create DRAFT + snapshot |
| `VALIDATE_CONTAINER_STUDY` | DRAFT → VALIDATED |
| `CONFIRM_CONTAINER_STUDY` | VALIDATED → CONFIRMED |
| `SUPERSEDE_CONTAINER_STUDY` | CONFIRMED → SUPERSEDED via new version |
| `MANAGE_CONTAINER_MASTER` | Container type catalog |
| `MANAGE_PACKING_PROFILE` | Packing profiles |
| `MANAGE_ALGORITHM_CONFIGURATION` | Algorithm parameter versions (restricted) |

Exact `rbac.ts` wiring is a later implementation task. Dual CONFIRM (TO + Logistics) remains **PROPOSED** (D-14).

### 24.2 Audit

All material changes use `appendServerAudit` (`AuditEvent`, AUTHORITATIVE_SERVER_AUDIT). Proposed actions from [39 §16](./39_CONTAINER_STUDY_BUSINESS_TECHNICAL_SPECIFICATION.md) plus:

`CONTAINER_STUDY_CALCULATED` · `CONTAINER_STUDY_UNALLOCATED` · `CONTAINER_MASTER_CHANGED` · `ALGORITHM_CONFIGURATION_ACTIVATED`

### 24.3 Customer isolation

All commercial APIs go through `customerScope`. Customers never see another customer’s study. Customers do not confirm studies or edit masters/rates.

---

## 25. Master-data ownership

IT owns the **application**, not engineering values.

| Data | Recommended owner | IT role |
|------|-------------------|--------|
| Container dimensions, payload, active types | **Logistics** | Persist, version, import |
| Freight rates (future) | **Logistics + Finance** | Persist |
| Packing profile / flange mapping (D-17) | **Technical Office** | Persist |
| Type thresholds 2300/2600, V2 1050/50% | **Technical Office** | Version with IT |
| Stuffing / Forklifting policy | **Technical Office + Logistics** | Enable versions |
| Region catalog | **Logistics** | |
| Algorithm identity, search bound, numeric safety | **IT** | System governed |
| Delivery allocation mode | **Sales + Logistics** | |
| CONFIRM | **TO + Logistics** (proposed dual) | RBAC |

---

## 26. Golden test architecture

Automated tests consume **frozen JSON fixtures** derived from 05I-DB+ captures — **not** live Excel.

### 26.1 Strict assertions allowed (J2–J5 / type / M3 / V2 — evidence **A**)

G05, B2300P, G06, B2600M, B2600P, G07, B1050M, B1050, B1050P, G08, SL50M, SL50P, G09, G10, G10B, G11A, G11B, G11C, G12.

**G01:** assert expanded **185** and J2–J5 **14 / 9 / 1 / 0** **conditionally** — last 20 STD depends on unverified 6100 post-adjust; treat as **parity-blocked** until `LEGACY_FIRST_FIT_V1_POST_ADJUST` is approved. Still freeze the **observed Excel** headline in fixtures as **oracle documentation**, not a V1 engine assertion until that version exists.

**B2300M:** same — 20 STD / M3=5900 is **A** in Excel, **conditional** for V1 engine without post-adjust plugin.

### 26.2 Not golden / blocked

| ID | Why |
|----|------|
| G02 / G03 occupancy | **D** — do not assert `physicalPlacements` |
| G02 / G03 J2–J5 | May assert **counts only** (= G01) |
| G04 placement / G/H | **E** — counts not a Rolling V1 assertion |
| F01–F04 | **Blocked** |
| Virtual O2 load | **Blocked** |
| Isolated 6100 fixture | **Blocked** — not captured |

G04 may later golden **26 containers / J mix** under a Forklifting version only.

---

## 27. Test strategy

| Layer | Purpose |
|-------|---------|
| 1. Unit | Normalize, expand, sort stability, type-resolution **pure functions** |
| 2. Algorithm parity | Rolling first-fit vs enabled rules |
| 3. Golden | §26 fixtures |
| 4. Boundary | 2299/2300/2600, 1049/1050, 27000 kg, 13000 mm |
| 5. Regression | G01-class J strings when versions enable them |
| 6. Property / invariants | See below |
| 7. Security | `customerScope`, permission matrix, no cross-tenant read |
| 8. Performance | Bound + timeout; 185-drum Rolling within agreed SLA |

**Invariants (must hold for every result):**

1. No physical drum allocated twice  
2. No drum silently omitted: `allocated + unallocated + unsuitable + review = expanded count`  
3. Container loaded weight ≤ snapshotted payload  
4. Packed dimensions respected for every allocation  
5. CONFIRMED study/result immutable  
6. Same snapshot + versions = same result  
7. Forklifting never silently runs as Rolling  
8. `virtualAllocations` empty while Branch 4 blocked  

---

## 28. Performance / safety

Do not expose `for container = 1..1000` as a UI operation.

| Control | Design |
|--------|--------|
| `maxContainers` | Configuration; default 1000 for parity bound |
| Termination | Bound reached **or** all drums classified |
| Timeout | Wall-clock; fail with `CALCULATION_TIMEOUT` + partial classification **forbidden** — fail closed: no silent partial CONFIRMED |
| Failure | Structured error; study stays DRAFT |
| Audit | `CONTAINER_STUDY_CALCULATED` success/fail |
| Metrics | Duration, expanded drums, containers opened, bound hits |

No premature global optimization.

---

## 29. Future optimization

| Wave | Algorithm |
|------|-----------|
| **V1** | Legacy-compatible **deterministic first-fit** (`LEGACY_FIRST_FIT_V1`) |
| **Later** | Bin packing / mixed loading / cost-min — new `algorithmVersion` |

Doc 39 feasibility → min count hierarchy is **PROPOSED** for a **future** optimizer. V1 does **not** implement that hierarchy. Technical feasibility still overrides any later cost heuristic.

---

## 30. Implementation readiness matrix

| Capability | Status | Design complete? | Implementation allowed? |
|-----------|--------|------------------|-------------------------|
| Container Master | Proposed entity; dimensions **TBD** (D-01–D-03) | **Yes** (conceptual) | **No** until values approved |
| Algorithm Configuration | Parameter register | **Yes** | **No** (no schema/API this task) |
| Packing Profile | Proposed; D-17 open | **Yes** (conceptual) | **No** until D-17 |
| Rolling engine | First-fit stages | **Yes** | **No** — separate implementation task after architecture approval |
| Forklifting engine | Interface only | **Yes** (blocked) | **NO** — `FORKLIFTING_PLACEMENT_ENGINE = BLOCKED` |
| V2 flag | Flag formula | **Yes** | Flag only, after approval |
| Virtual second layer | Unverified | **Yes** (blocked) | **NO** |
| Container classification OT/HQ | Observed **A** | **Yes** | After approval; 20 STD path **conditional** |
| 6100/5900 rule | Unverified interaction | **Yes** (plugin disabled) | **NO** as independent shortcut |
| Unallocated handling | SaaS target | **Yes** | After approval (not Excel-silent) |
| Shipment grouping | From doc 39 | **Yes** | Persistence later |
| Study lifecycle | DRAFT…SUPERSEDED | **Yes** | Persistence later |
| Result snapshot | Contract | **Yes** | Persistence later |
| Audit | `appendServerAudit` | **Yes** | With first mutating APIs |
| RBAC | Permission list | **Yes** (proposed codes) | With first APIs |
| Golden tests | Mapped §26 | **Yes** | With engine task |

---

## 31. 05I-DC DESIGN STATUS

# DESIGN READY FOR REVIEW

This is **not** implementation-ready.

**Architecture approval still required before any engine/schema/API/UI task.** Remaining blockers from [42 §18](./42_CONTAINER_STUDY_ALGORITHM_DECISION_AND_SAAS_PARITY.md) are **classified**, not resolved:

1. Forklifting placement — blocked  
2. Virtual second-layer load — blocked  
3. Isolated 6100/5900 — plugin disabled; no shortcut  
4. UNALLOCATED SaaS policy — designed, needs sign-off  
5. This design + doc 42 — Technical Office / Logistics / IT review  

**Next task (not started):** implementation only after written approval of this document and an explicit implementation charter (suggested 05I-DD). Do not treat README indexing as authorization to code.

---

*End of TASK 05I-DC. No application, schema, API, or UI changes. Engine not started.*
