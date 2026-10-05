# Drum Selection & Automatic Optimization — Pre-Implementation Assessment

**Date:** 2026-09-01  
**Scope:** STEP 6 — Manual or Automatic Drum Selection  
**Status:** Assessment complete; implementation proceeds from findings below.  
**Rule:** Do not invent engineering values. Unresolved Technical Office items are documented, not guessed.

---

## 1. Current customer cable-selection flow

Commercial inquiry (primary governed path):

1. Open inquiry → add cable via `CableSearchSelectModal`
2. Customer picks a cable (catalog search or Technical Parameters V2)
3. Modal advances to packaging popup titled **“Cutting Length and Drum Selection”**
4. Customer enters multi-drum schedule → **Add Line** persists `cuttingLengthMeters`, `cableTolerancePercent`, `drumSchedule` JSON on `CommercialInquiryLine`

Also used from: `TechnicalOffice.tsx`, `ErpCustomerRequestView.tsx`.

Parallel / non-Phase-1 paths (preserved, not primary STEP 6):

| Path | Component |
|------|-----------|
| Customer portal drum page (hidden from Phase 1 nav) | `DrumOptimizer.tsx` |
| Smart configurator | `CuttingLengthStepSection` + K/S/P `cuttingLengthValidationService` |
| Configurator V2 | `CuttingLengthSectionV2` |
| Prototype ERP | `DrumDetailsModal`, `ContainerAndDrumOptimizerModal` |

Journey position today: drum packaging is **inside** cable-add, before construction preview / offers — already correct relative to STEP 6.

---

## 2. Current cutting-length component

| Surface | Behavior |
|---------|----------|
| `CableSearchSelectModal` + `DrumCuttingScheduleTable` | Per-row `cuttingLengthM`, `noOfDrums`, cable/drum tolerances |
| `InquiryMultiDrumCuttingModal` | Edit schedule on existing line |
| `CuttingLengthStepSection` | Single length + prototype drum recommendation |
| Domain | `inquiryDrumSchedule.ts`: `nominalLineM = noOfDrums × cuttingLengthM` |

**Gap vs STEP 6:** No explicit `nominalCuttingLengthM` / `minimumAllowedLengthM` / `maximumAllowedLengthM` fields on the authoritative Drum Plan object (only derived order-range UI for cable tolerance).

---

## 3. Current drum popup / component

**Primary customer popup:** `src/components/common/CableSearchSelectModal.tsx`  
Title: **“Cutting Length and Drum Selection”**  
Body: `DrumCuttingScheduleTable` only — **no Manual vs Automatic mode toggle**, no engineering suitability list, no recommended plan review.

Edit modal: `InquiryMultiDrumCuttingModal.tsx` (“Cutting Schedule & Multi-Drum Configuration”).

---

## 4. Current drum API

| Endpoint | Role |
|----------|------|
| `GET /api/master/drums` | List PG Drum Master (`listDrums`) |
| Import pipeline | Commit Drum List.xlsx |
| Inquiry APIs | Persist `drumSchedule` / cutting fields |

**Missing:** No validate / optimize / capacity calculation API. Engineering math (where it exists) runs in client or shared TS modules without an optimization endpoint.

---

## 5. Current drum master fields

**Prisma `DrumMaster` / `DrumMasterRecord`:**

| Field | Source | Notes |
|-------|--------|-------|
| `drumCode`, `flange`, `barrel`, `innerWidth`, `outerWidth`, `capacity` | Drum List.xlsx | Present |
| `description`, `drumType` | Optional / generated | |
| `barrelWidth`, `usableWidth`, `maxWeight` | Schema nullable | **Not imported** from Excel |
| `capacityUom` | Forced | Always `CONFIGURATION_REQUIRED` |
| `dimensionUnitNote` | Forced | `SOURCE_UNIT_NOT_IN_FILE` |
| **Clearance** | — | **Does not exist** |
| **EmptyDrumNetWeightKg** | — | **Does not exist** |
| **MaxLoad** (name) | — | **No field named MaxLoad**; closest is `maxWeight` |

Excel has **no** tare, clearance, max weight, packing factor. 103 ACTIVE drums after import.

---

## 6. Current cable engineering fields

| Need | Available | Mapping |
|------|-----------|---------|
| Outside diameter | `CableMaster.diameter` → `outerDiameterMm` | Use as `cableDiameterMm` |
| Weight | `CableMaster.weight` → `approxWeightKgKm` | kg/km |
| Output / winding diameter | **No separate field** | Use `outerDiameterMm` as `outputDiameterMm` until TO defines a distinct winding diameter |
| Cable length tolerance | Inquiry line / schedule | Percent, not diameter tolerance |

Do **not** duplicate cable fields.

---

## 7. Current weight calculation

Governed path (`drumMasterService.cableWeightKgFromCuttingLength`):

```text
cableWeightKg = (cuttingLengthM / 1000) × approxWeightKgKm
```

Equivalent: `cableWeightPerMeter = approxWeightKgKm / 1000`.

Prototype paths sometimes use kg/m directly (`DrumOptimizer`) or silent defaults (2.5 kg/m) — **do not spread**.

---

## 8. Current Fill % calculation

`drumCapacityFillPercent`:

```text
fill% = round(cableWeightKg / drum.capacity × 100)  // treats capacity as kg
```

**Conflicts:**

- `DrumOptimizer` / `suggestDrumPlan`: treat `capacity` as **meters**
- Docs: UOM is `CONFIGURATION_REQUIRED` — do not invent kg vs m

**STEP 6 direction:** Replace primary “Fill %” with Maximum Usable Length, Length Utilization %, Load Utilization %.

---

## 9. Current tolerance implementation

| Concept | Storage | Effect |
|---------|---------|--------|
| Cable tolerance | `cableTolerancePercent` + schedule header | Order range: totalNominal ± % |
| Drum tolerance | Per-row `drumTolerancePercent` | Line nominal ± % → min/max line meters |

Separate concepts — **preserve**.  
No validation today that drum capacity must cover `maximumAllowedLengthM`. Example in STEP 6 spec compares usable length to **maximum allowed** cutting length (nominal × (1 + cable%)) — implement that explicitly and document.

---

## 10. Current manual drum selection behavior

- Customer picks `drumCode` via `DrumMasterSelect`
- `selectDrum({ method: 'MANUAL' })` links ACTIVE EWD code; **no** winding/load engineering validation
- Prototype reels remain a separate identity (`drumType` strings)

---

## 11. Current automatic drum optimization behavior

`selectDrum({ method: 'AUTOMATIC' })` **always** returns `CONFIGURATION_REQUIRED` / `selectedDrum: null` (governance boundary until a signed plant rule existed).

Prototype heuristics (K/S/P thresholds, packing 0.93 annulus formula) are **not** ENERGYA-signed EWD rules — must not replace the new native TO formula.

---

## 12. Current multi-drum schedule model

```ts
InquiryDrumSchedule = {
  cableTolerancePercent,
  rows: [{ drumCode, noOfDrums, cuttingLengthM, drumTolerancePercent }]
}
```

`TotalLengthM = Σ(noOfDrums × cuttingLengthM)` — preserve.  
Authoritative Drum Plan (STEP 6 §19) needs additional engineering snapshot fields per line.

---

## 13. Current validation rules

| Rule | Where |
|------|-------|
| Positive drums / cutting / tolerances | Modal `confirmPackaging` |
| Cutting ≤ line length | `drumPlanService.validateCuttingLength` |
| Prototype geo + gross weight | `cuttingLengthValidationService` |
| EWD auto blocked | `drumSelectionService` |

No native windings/layers/geo/load-limited/`floorToNearest10` validation.

---

## 14. Existing empty drum weight field

| Location | Present? |
|----------|----------|
| Drum Master / Excel | **No** |
| Prototype catalogs | `tareWeightKg` (hard-coded) |
| `DrumDetailsModal` | Hard-coded by Wood/Steel label |

**Decision:** Add nullable `emptyDrumNetWeightKg` on Drum Master. Do **not** invent values; null → gross weight `CONFIGURATION_REQUIRED` / null, capacity math must **not** add empty weight into payload.

---

## 15. Proposed changes

### Engineering (native TO formula)

- `windingsPerLayer = FLOOR(innerWidth / (outputDiameter × 1.03))`
- `layers = FLOOR((flange − barrel − 2 × (Ø>50 ? Ø : clearance)) / (2 × outputDiameter))`
- Unsuitable if windings ≤ 0 or layers ≤ 0
- `geometricalCapacityMeters = windings × π × layers × (barrel + layers × outputDiameter) / 1000`
- `loadLimitedCapacityMeters` from MaxLoad ÷ cable weight per meter (**see unresolved MaxLoad**)
- `maximumUsableLengthMeters = floorToNearest10(MIN(geo, loadLimited))`
- Metrics: Maximum Usable Length, Length Utilization %, Load Utilization %

### MaxLoad interpretation (from current app — no invention)

| Symbol | Finding |
|--------|---------|
| `MaxLoad` string | Absent in repo |
| `DrumMaster.maxWeight` | Intended nullable engineering max weight; **never populated** from Excel |
| Prototype `maxWeightKg` | Compared to **gross** (cable + tare) in `cuttingLengthValidationService` |
| STEP 6 load utilization | `cableWeightOnDrum / permittedCablePayloadKg` — empty weight **excluded** from payload |

**Adopted rule for Energya Connect engine:**  
`maxWeight` = **MaxLoad = permitted cable payload (kg)**.  
Empty drum weight is logistics-only.  
Prototype gross semantics remain on K/S/P paths only; do not copy into EWD engine.

**If `maxWeight` is null:** load-limited capacity cannot be computed → drum status `MISSING_ENGINEERING_DATA` / not suitable, with explicit reason.  
**TO-approved (2026-09-01):** valid Excel/DB `capacity` populates `maxWeight` (MaxLoad). Capacity column stays as source/reference; `capacityUom` remains `CONFIGURATION_REQUIRED` (not treated as metres).

### Clearance

Add nullable `clearanceMm`. **TO default: 50 mm** on ACTIVE drums / import when blank. If cable diameter ≤ 50 and clearance null → unsuitable (missing data). If diameter > 50, clearance term = cable Ø.

### Output diameter

Use cable outside diameter as winding/output diameter until TO provides a distinct field.

### Dimension units

TO formula implies **mm** for flange/barrel/widths/diameters (consistent with EWD630-scale numbers). Document assumption; keep `dimensionUnitNote` unchanged until TO confirms.

### Selection UX

After cutting length + cable tolerance: **[Manual]** / **[Automatic]** in the existing popup. Both produce the same Drum Plan structure. Block proceed until plan valid.

### Architecture

```text
UI → API → Drum Optimization Service → Drum Capacity Calculator → Cable Master + Drum Master
```

No engineering math in React. No Container Study. No Advaris. No D365 changes. Costing V2 untouched.

### Ranking (transparent, documented)

Eligible = ACTIVE + complete engineering inputs + windings/layers > 0 + `maximumUsableLengthM ≥ maximumAllowedLengthM`.

Rank suitable drums by:

1. Prefer length utilization in a reasonable band (closer to full use without exceeding 100%)
2. Prefer higher length utilization (better fit) among those ≤ 100%
3. Prefer smaller flange (size)
4. Prefer lower empty drum weight when known (nulls sort last)

Do **not** optimize purely for smallest drum or highest %. Multi-cut plans: greedy cover of remaining order length using best eligible drum per chunk; cutting length per drum capped at `maximumUsableLengthM`; total = Σ(n × cutting).

---

## 16. Files to change / add

| File | Action |
|------|--------|
| `docs/DRUM_SELECTION_OPTIMIZATION_ASSESSMENT.md` | This assessment |
| `src/domain/drumCapacityCalculator.ts` (+ test) | **New** — formula + floorToNearest10 |
| `src/domain/drumOptimizationService.ts` (+ test) | **New** — manual validate, auto optimize, Drum Plan |
| `src/domain/inquiryDrumSchedule.ts` (+ test) | Extend metrics / plan helpers; keep tolerances separate |
| `src/services/drumSelectionService.ts` (+ test) | Wire AUTOMATIC to optimization when data complete |
| `src/types.ts` | Drum Plan types; drum field extensions |
| `prisma/schema.prisma` + migration | `clearanceMm`, `emptyDrumNetWeightKg` |
| `src/server/masterDataDto.ts` / repository | Map new fields |
| `src/server/masterDataRoutes.ts` or new router | `POST .../validate`, `POST .../optimize` |
| `src/components/common/CableSearchSelectModal.tsx` | Manual/Automatic UX |
| `src/components/common/DrumCuttingScheduleTable.tsx` | Utilization metrics (not primary Fill %) |
| `src/components/inquiry-quotation/InquiryMultiDrumCuttingModal.tsx` | Align metrics / validation |
| API client helper | Call validate/optimize |
| Tests per §25 categories | Add/update |

**Do not modify:** Costing engine / `costingEngine.test.ts`, Phase 1 fulfillment domain contracts, D365 stubs, Advaris stubs, Container Study.

---

## 17. Database migration requirements

Add nullable columns on `DrumMaster`:

- `clearanceMm Decimal?` — winding flange clearance (mm)
- `emptyDrumNetWeightKg Decimal?` — tare / empty net weight (kg)

Reuse existing `maxWeight` as MaxLoad (permitted cable payload kg).  
No invented defaults in migration. Import pipeline remains unchanged (does not invent clearance/tare/maxWeight).

---

## 18. API changes

| Method | Path | Purpose |
|--------|------|---------|
| `POST` | `/api/master/drums/capacity` | Pure capacity calc for one drum + cable |
| `POST` | `/api/master/drums/validate` | Manual selection validation → Drum Plan line(s) |
| `POST` | `/api/master/drums/optimize` | Automatic optimization → recommended Drum Plan |

Inputs: cable diameter, weight kg/km, nominal cutting length(s), cable tolerance %, optional drum code (manual), drum master snapshot or server-loaded ACTIVE drums.  
Outputs: engineering details (internal-rich) + customer-light summary + authoritative plan rows + suitability reasons.

---

## 19. UI changes

Update **Cutting Length and Drum Selection** popup:

1. Cutting length summary (requested, ± cable tolerance, allowed range)
2. Mode: Manual | Automatic
3. Manual: suitable drums list + expandable details; optional unsuitable with reasons
4. Automatic: recommended multi-line plan; review before continue
5. Replace primary Fill % with Maximum Usable Length / Length Utilization / Load Utilization
6. Block **Add Line** until Drum Plan valid

Internal/TO can later consume same API with richer detail flags — **one** engine.

---

## 20. Test changes

Add/update coverage for STEP 6 §25 categories 1–31 in domain/service tests; keep existing quotation / costing / SO / agreement / Phase 1 regressions green (32–36).  
Update `drumSelectionService` tests: AUTOMATIC may select when engineering data is complete; still refuses when MaxLoad/clearance missing.

Run: `npm test` and `tsc --noEmit`.

---

## Root cause investigation (2026-09-01) — 107 incomplete candidates

### Verdict (pre-normalization)

**MASTER_DATA_COMPLETENESS** — not a calculator bug. Excel had no Clearance / MaxLoad columns; both were null on every ACTIVE drum → Ø≤50 cables (incl. 10009487) evaluated `INCOMPLETE_ENGINEERING_DATA`.

---

## TO-approved engineering normalization (2026-09-01) — APPLIED

Technical Office explicitly approved:

| Rule | Value |
|------|--------|
| **Clearance** | `clearanceMm = 50` for **all** existing ACTIVE drums |
| **MaxLoad** | `maxWeight` = existing **Capacity** when Capacity is valid (>0); Capacity remains source/reference column (unchanged) |
| **emptyDrumNetWeightKg** | Separate logistics field; **WARNING only**; never blocks suitability / Add Line |

### Migration / scripts

- Prisma data migration: `prisma/migrations/20260901180000_drum_engineering_clearance50_maxload_from_capacity/`
- One-shot diagnostic/apply: `scripts/normalizeDrumEngineeringFromCapacity.ts`
- Before mutate: count active / valid Capacity / invalid Capacity / existing clearance / existing MaxLoad; report MaxLoad≠Capacity conflicts (override to Capacity with report)
- Invalid/null/zero Capacity → leave MaxLoad incomplete → `INCOMPLETE_ENGINEERING_DATA`

### Import path (future)

When TO rule applies (`commitDrums`):

- Valid **Capacity** → **MaxLoad** (`maxWeight`) when Max Load Kg column absent or blank
- Explicit Max Load Kg column wins when provided (>0); warn if it differs from Capacity
- **Clearance** defaults to **50** when Clearance Mm column absent or blank
- Capacity column always preserved; `capacityUom` remains `CONFIGURATION_REQUIRED` (not metres)
- Empty weight still optional; never required for suitability

### Formula / load-limited (unchanged geometry)

- IF `cableDiameter > 50`: `clearanceTerm = cableDiameter`; ELSE: `clearanceTerm = Drum.Clearance` (now 50)
- Load-limited: MaxLoad ÷ cable kg/m (existing derivation using populated MaxLoad)
- **RefQuant × MaxLoad / TotalWeight** remains **deferred** — no authoritative RefQuant/TotalWeight mapping in app; do not invent RefQuant

### Remaining open items

1. Empty drum weights for EWD codes — still null until TO logistics load
2. Distinct output/winding diameter vs outside diameter — outside Ø used as both
3. Dimension unit confirmation (mm) — assumed; `dimensionUnitNote` unchanged
4. RefQuant / TotalWeight load-limited formula — deferred
5. K/S/P ↔ EWD alias table — not created
6. DrumCompatibility ranking rows — still empty

---

## Constraints checklist

- [x] No Advaris references in drum engine/UI
- [x] D365 left `NOT_IMPLEMENTED`
- [x] No Container Study
- [x] No React-side engineering calculations (API/domain only)
- [x] No hardcoding of cable/drum-specific engineering constants beyond the signed formula factors (1.03, Ø>50 branch, floor-to-10)
- [x] Nominal cutting length not renamed to average
- [x] Cable vs drum tolerance kept separate
- [x] Capacity = min(geo, load-limited) then floorToNearest10
- [x] Costing V2 freeze respected
- [x] No commit until instructed
- [x] TO Clearance=50 + MaxLoad=Capacity applied (migration + import defaults)

---

## Final report — TO normalization applied (2026-09-01)

| Metric | Before | After |
|--------|--------|-------|
| Active drums | 107 | 107 |
| Valid Capacity | 107 | 107 (unchanged) |
| Invalid Capacity | 0 | 0 |
| Clearance populated / =50 | 0 / 0 | **107 / 107** |
| MaxLoad populated / =Capacity | 0 / 0 | **107 / 107** |
| MaxLoad≠Capacity conflicts reported | 0 | 0 (none to override) |
| Empty weight | 0 | 0 (WARNING only) |

**Cable 10009487** (Ø10.9, 268 kg/km, 1500 m, ±1%):

| Outcome | Count |
|---------|-------|
| Suitable | **102** |
| Unsuitable | 5 |
| Incomplete | **0** |

Best automatic recommendation: **EWD900-0** × 1 @ 1500 m (max usable 1780 m).  
Clearance used for Ø10.9: **50 mm**. Manual candidate list populated; Auto `RECOMMENDED`.  
Tests: **629 pass / 0 fail**; `tsc --noEmit` clean. **No commit.**
