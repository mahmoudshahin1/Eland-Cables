# TASK 05I-DB++ — Container Study Algorithm Decision & SaaS Parity

**Date:** 2026-09-09  
**Mode:** ANALYSIS / DOCUMENTATION ONLY — no application code, schema, API, UI, or engine  
**Status:** Review-ready decision bridge. **Does not authorize 05I-DC implementation.**

**Chain:**

| Task | Artifact | Role |
|------|----------|------|
| 05I-DA | [39](./39_CONTAINER_STUDY_BUSINESS_TECHNICAL_SPECIFICATION.md) | Business / domain spec |
| 05I-DB | [40](./40_CONTAINER_STUDY_ALGORITHM_REVERSE_ENGINEERING.md) | VBA/workbook reverse engineering |
| 05I-DB+ | `logs/container-golden/` + conversation status report | Live Excel COM captures (partial, unreliable unattended) |
| **05I-DB++** | **This document** | Parity contract + go/no-go for 05I-DC |
| 05I-DC | *not started* | Master/engine design |

**Evidence used (no new Excel execution):**

1. `Container Study.xlsm` and `Contianer study vba code.txt` (as analyzed in doc 40)  
2. `docs/v2/40_CONTAINER_STUDY_ALGORITHM_REVERSE_ENGINEERING.md`  
3. `logs/container-golden/result-*.json` from 05I-DB+  
4. TASK 05I-DB+ status report (this conversation)

**Frozen bases:** 05I-B `30d97df` · 05I-C `5b5254e` · 05I-DA `989650b` · 05I-DB `1211c42`

---

## 1. Executive summary

**This document does not authorize implementation.** 05I-DC remains closed until the entry criteria in §17 are met.

| Topic | Statement |
|-------|----------|
| **Verified** | Live `Container_New` runs produced J2–J5 (and related header fields) for G01–G12 and listed boundary cases. The **185-drum Rolling Europe** headline (24 containers; 14×40 HQ, 9×40 STD, 1×20 STD, 0 OT; last 20 STD / 5900 mm) is from **live VBA**, not cached cells. Type thresholds at 2300/2600, V2 flags at 1050 and 50%, weight/length no-fit (0 containers), and Forklifting **container-count** difference vs Rolling are observed. |
| **Uncertain** | Forklifting G/H swap and placement (F01–F04 **not completed**). Whether virtual second layer **loads** drums (O2/P2). Isolated `U3≥6100` → 20 STD when flange is not ≥2600. Exact Q3 semantics vs occupancy. G02/G03/G04 **physical/unalloc JSON**. |
| **Deterministic?** | **Inferred (B/C):** same inputs + same sort + sequential `Container()` should replay. **Not** proven by a second independent Excel operator run. Unattended COM was blocked by `MsgBox`. |
| **Direct parity implementation?** | **No.** Enough to freeze a **partial** golden set (J2–J5 and selected first-container fields). Not enough to port Forklifting, virtual load, or 6100/5900 without remaining decisions. |
| **Preserve** | Live type/V2/no-fit/J2–J5 observations; sequential greedy placement as the **legacy** algorithm identity; stuffing and region as inputs; hard-coded constants as **legacy** (to become master data). |
| **Do not copy blindly** | Silent drop of drums; `MsgBox`; 1000-container scan as UX; Integer types; hidden sheet state; unexplained Forklift geometry; inconsistent occupancy JSON; Excel-only UI. |

---

## 2. Evidence classification

| Code | Meaning |
|------|---------|
| **A** | Verified by live Excel/VBA execution (captured after `Container_New`) |
| **B** | VBA/workbook formula **and** consistent with a live capture |
| **C** | Derived from VBA/formulas in doc 40; **not** execution-verified in 05I-DB+ |
| **D** | Observed in capture files **but** inconsistent with other evidence from the same run |
| **E** | Unverified / needs manual Excel validation |
| **F** | Business decision (legacy vs SaaS target) |

### 2.1 Major algorithm rules

| Rule | Classification | Notes |
|------|----------------|-------|
| 185-drum Rolling Europe J2–J5 and 24 containers | **A** | G01 JSON after `Run` |
| Last G01 container 20 STD / 5900 mm | **A** | G01 JSON `containers[23]` |
| `O3` decision tree (OT ≥2600, then HQ ≥2300, then M3=5900 → 20 STD, else 40 STD) | **B** | Formula in workbook + G05/G06/G11 vs B2300M |
| Flange 2299 → reported 20 STD (this fixture: qty 2) | **A** | B2300M; **not** a universal “2299 always 20 STD” without M3 |
| Flange 2300 / 2301 → 40 HQ | **A** | G05, B2300P |
| Flange 2599 → 40 HQ; 2600 / 2601 → 40 Open Top | **A** | B2600M, G06, B2600P |
| `O3` uses **tier-1 N** lengths (not Q/T) | **C** | Doc 40; not separately proven in 05I-DB+ |
| V2 requires Rolling and not Europe | **B** | Formula + Africa tests vs G01 Europe V2=0 |
| Length 1049 counts toward &lt;1050; 1050 and 1051 do not | **A** | B1050M V2=1; B1050 / B1050P V2=0 |
| V2 ≥50% small lengths | **A** | G08 / SL50P V2=1; SL50M V2=0 |
| V2=1 **loads** a virtual drum (O2/P2 increment) | **E** | Flag seen; `virtualCountO2` empty when geometry still fit |
| Rolling vs Forklifting **container count** on 185-drum sample | **A** | G01 24 vs G04 26; J2–J5 differ |
| Forklifting G↔H swap and tier-vs-new-row placement | **E** | F01–F04 not executed |
| Weight &gt; E5 → 0 containers, drum remains in G:I | **A** | G10 |
| Length 13000 → 0 containers | **A** | G10B |
| No Excel error string in COM `excelError` on no-fit | **A** | Capture only; **E** for on-screen MsgBox text |
| Post-adjust `U3≥6100` → M3=5900 unless HQ/OT | **C** | VBA in doc 40; G11A–C did **not** isolate it (all OT) |
| G11 5899–5901 → 40 Open Top, M3 stays 12000 | **A** | 5900≥2600 beats 20 STD in `O3` |
| B2300M M3=5900 / 20 STD | **A** | Consistent with post-adjust **if** type not HQ/OT |
| G02/G03/G04 `physicalPlacements` / `unallocatedEstimate` | **D** | Conflict with G01 occupancy / console |
| G02/G03 J2–J5 equal G01 | **A** | Same JSON J strings |
| Sequential first-fit, 1000-container loop | **C** | VBA; G10 duration consistent with long nb loop |
| `MsgBox` after calculate | **B** | VBA + COM hang |
| Integer overflow | **E** | Not executed |
| K3=2350, E5=26000 as global | **A** for these runs | **F** whether SaaS master is per type |
| Drum expansion qty N → N rows | **B** | G01 expanded=185 |

---

## 3. Verified golden results

**Golden for SaaS assertions:** J2–J5, expanded count, container **count from J aggregates**, first-container type / M3 / remL / remW / V2 where listed.  
**Not golden:** `physicalPlacements` / `unallocatedEstimate` on **G02, G03, G04**.

Inputs for 185-drum tests (G01–G04):

| Line | Length (flange) mm | Width mm | Gross kg | Qty |
|------|-------------------:|---------:|---------:|----:|
| 1 | 2400 | 1632 | 6371 | 55 |
| 2 | 2100 | 1632 | 4537 | 5 |
| 3 | 1600 | 1120 | 1930 | 65 |
| 4 | 1400 | 982 | 1039 | 60 |

K3 = 2350 mm on all listed captures. E5 = 26000 kg except G09 (5000).

| ID | Inputs (summary) | Expanded | Cont. | J2 HQ | J3 40 STD | J4 20 STD | J5 OT | Observed | Class |
|----|-------------------|----------|-------|-------|-----------|-----------|-------|----------|-------|
| G01 | Rolling, Europe, sample | 185 | 24 | 14 | 9 | 1 | 0 | Last 20 STD / 5900; C1 40 HQ remL 2400 remW 516 | **A** |
| G02 | Rolling, Africa, sample | 185 | 24 | 14 | 9 | 1 | 0 | J2–J5 = G01; occupancy JSON **D** | **A** (J) / **D** (phys) |
| G03 | Rolling, Europe, sample rewrite | 185 | 24 | 14 | 9 | 1 | 0 | J2–J5 = G01; occupancy JSON **D** | **A** / **D** |
| G04 | Forklifting, Europe, sample | 185 | 26 | 14 | 12 | 0 | 0 | No 20 STD; more 40 STD; G preview 2400×1632 | **A** (J) / **D** (phys) / **E** (swap) |
| G05 | 2× 2300×1600×2000 | 2 | 1 | 1 | 0 | 0 | 0 | 40 HQ, M3=12000, remL=7400 | **A** |
| B2300M | 2× 2299×1600×2000 | 2 | 1 | 0 | 0 | 1 | 0 | 20 STD, M3=5900, remL=1302 | **A** |
| B2300P | 2× 2301×1600×2000 | 2 | 1 | 1 | 0 | 0 | 0 | 40 HQ, remL=7398 | **A** |
| G06 | 2× 2600×1600×2000 | 2 | 1 | 0 | 0 | 0 | 1 | OT, remL=6800 | **A** |
| B2600M | 2× 2599×1600×2000 | 2 | 1 | 1 | 0 | 0 | 0 | 40 HQ, remL=6802 | **A** |
| B2600P | 2× 2601×1600×2000 | 2 | 1 | 0 | 0 | 0 | 1 | OT, remL=6798 | **A** |
| G07 | Africa Rolling, 6× 1049×800×400 | 6 | 1 | 0 | 0 | 1 | 0 | V2=1, Q3=6, M3=5900 | **A** |
| B1050M | Africa, 4× 1049 | 4 | 1 | 0 | 0 | 1 | 0 | V2=1 | **A** |
| B1050 | Africa, 4× 1050 | 4 | 1 | 0 | 0 | 1 | 0 | V2=0 | **A** |
| B1050P | Africa, 4× 1051 | 4 | 1 | 0 | 0 | 1 | 0 | V2=0 | **A** |
| G08 | Africa, 1000+1600 qty 1 | 2 | 1 | 0 | 0 | 1 | 0 | V2=1 | **A** |
| SL50M | Africa, 1×1000 + 2×1600 | 3 | 1 | 0 | 0 | 1 | 0 | V2=0 | **A** |
| SL50P | Africa, 2×1000 + 1×1600 | 3 | 1 | 0 | 0 | 1 | 0 | V2=1 | **A** |
| G09 | E5=5000, 3× 1400×1000×4000 | 3 | 3 | 0 | 0 | 3 | 0 | One drum per container | **A** |
| G10 | 1400×1000×27000 | 1 | 0 | 0 | 0 | 0 | 0 | 0 containers; G still 1400×1000 | **A** |
| G10B | 13000×1000×1000 | 1 | 0 | 0 | 0 | 0 | 0 | 0 containers; G=13000 | **A** |
| G11A | 5900×1000×1000 | 1 | 1 | 0 | 0 | 0 | 1 | OT, M3=12000, remL=6100 | **A** |
| G11B | 5901×1000×1000 | 1 | 1 | 0 | 0 | 0 | 1 | OT, remL=6099 | **A** |
| G11C | 5899×1000×1000 | 1 | 1 | 0 | 0 | 0 | 1 | OT, remL=6101 | **A** |
| G12 | 2×2400 + 3×1600 + 4×1400 + 2×1000 | 11 | 1 | 1 | 0 | 0 | 0 | 40 HQ, remL=200, Q3=11 | **A** |

F01–F04: **E** — not executed.

---

## 4. 185-drum baseline (frozen)

**Classification: A — live VBA.**

G01 called `Container_New` with the four sample lines (quantities 55+5+65+60). After the macro, captured:

| Field | Value |
|-------|--------|
| Expanded drums | **185** |
| Containers | **24** |
| 40 HQ (J2) | **14** |
| 40 STD (J3) | **9** |
| 20 STD (J4) | **1** |
| 40 Open Top (J5) | **0** |
| Last container | **nb 24**, type **20 STD**, usable length **5900 mm** |
| First container | 40 HQ, usable 12000, rem length 2400, rem weight 516, Q3=4, weight util 98%, length util 80% |

This is **not** a read of pre-macro cached J cells as the sole proof: the harness set stuffing/region/E5, wrote drums, ran `Container_New`, then read J2–J5.

G02 (Africa) and G03 (Europe rewrite) captured the **same J2–J5**. That does **not** freeze occupancy JSON (§9).

---

## 5. Container type classification

### 5.1 Observed results (A)

Fixtures: **qty 2**, width 1600, weight 2000, Rolling, Europe, E5=26000, K3=2350.

| Flange mm | Captured type | M3 | remL |
|----------|---------------|----|------|
| 2299 | **20 STD** | 5900 | 1302 |
| 2300 | **40 HQ** | 12000 | 7400 |
| 2301 | **40 HQ** | 12000 | 7398 |
| 2599 | **40 HQ** | 12000 | 6802 |
| 2600 | **40 Open Top** | 12000 | 6800 |
| 2601 | **40 Open Top** | 12000 | 6798 |

Single-drum 5899 / 5900 / 5901 → **40 Open Top**, M3 **12000** (G11A–C).

### 5.2 Workbook `O3` (doc 40) vs observation

| Priority | Formula rule | Support |
|----------|---------------|---------|
| Any N ≥ 2600 | 40 Open Top | **B** — G06, B2600P, G11 (5900≥2600) |
| Else any N ≥ 2300 | 40 HQ | **B** — G05, B2300P, B2600M |
| Else M3 = 5900 | 20 STD | **B** — B2300M, G07–G09 (M3=5900 in capture) |
| Else | 40 STD | **C** for a clean 40 STD-only fixture (G04 last container is 40 STD with M3=12000 — **A** for that container, not a dedicated unit test) |

**Inferred (not a new law):** HQ/OT **suppress** the 5900/20 STD post-adjust (G11A remL=6100 but type OT, M3 stayed 12000). **B** if VBA post-adjust “skip HQ/OT” is accepted; G11 is **A** for the outcome, **E** for a dedicated 6100 test with flange &lt; 2300.

**Do not claim:** “flange 2299 always means 20 STD” without this fixture’s remaining-length / M3 path.

---

## 6. Second-layer / V2

### 6.1 Known (A)

Africa + Rolling unless noted.

| Case | Lengths | V2 |
|------|---------|----|
| B1050M | 1049 ×4 | **1** |
| B1050 | 1050 ×4 | **0** |
| B1050P | 1051 ×4 | **0** |
| G08 | 1000 + 1600 (1 each) | **1** |
| SL50M | 1×1000 + 2×1600 | **0** |
| SL50P | 2×1000 + 1×1600 | **1** |
| G07 | 1049 ×6 | **1** |
| G01 Europe | sample | **0** on C1 |

**Known about V2:** Excel flag `V2` tracks “second-layer enable” from region, stuffing, and share of **length** cells **&lt; 1050** (formula doc 40). Live flags match **&lt;1050** (strict) and **≥ 50%** after ROUND(...,1) for the 1/3 vs 1/2 vs 2/3 fixtures.

### 6.2 Not known (E)

- VBA Branch 4 actually incrementing row-2 virtual counters and counting that as a loaded drum.  
- Interaction of V2=1 with packing when geometry **fails**.  
- Europe never V2: **C** from formula; G01 V2=0 is **A** only for that sample.

**Do not claim** virtual second-layer **physical loading** is validated.

---

## 7. Stuffing method

| | Rolling G01 | Forklifting G04 |
|--|-------------|------------------|
| Expanded | 185 | 185 |
| Containers | **24** | **26** |
| J2 HQ | 14 | 14 |
| J3 40 STD | 9 | **12** |
| J4 20 STD | 1 | **0** |
| J5 OT | 0 | 0 |

**Verified (A):** stuffing changes the **24 vs 26** headline and eliminates the 20 STD on this sample.

**Not verified (E):** F01–F04 (full G/H swap, all-small vs all-large vs mixed). Preview G/H on G04 large rows remained 2400×1632 — **not** a completed swap study.

**Do not freeze a Forklifting SaaS placement rule.** Only freeze: “Forklifting is a distinct mode; 185-drum sample used **more** containers and **no** 20 STD vs Rolling.”

---

## 8. Weight and dimension failure

| ID | Input | Containers | Expanded | Unalloc (capture) | excelError |
|----|--------|------------|----------|-------------------|------------|
| G10 | 27000 kg, 1400×1000, E5=26000 | **0** | 1 | 1 | empty |
| G10B | 13000 mm × 1000, 1000 kg | **0** | 1 | 1 | empty |

G:I still held the drum (G10 G=1400; G10B G=13000). No COM exception. **E:** whether the user saw only the results `MsgBox` (zeros) or also “Please check the Drums Data…”.

| | Legacy (observed) | Target SaaS (**F**, recommendation) |
|--|--------------------|----------------------------------|
| No fit | 0 containers; drum not in J counts; no useful error in capture | Status **UNALLOCATED** / **NO_FEASIBLE_CONTAINER**; reason; drum id; study/inquiry id; audit; **no silent omit** |

---

## 9. G02 / G03 / G04 capture inconsistency

| | J2–J5 | `physicalPlacements` | `unallocatedEstimate` |
|--|-------|----------------------|------------------------|
| G01 | 14 / 9 / 1 / 0 | **185** | 0 |
| G02 | same as G01 | **96** | **89** |
| G03 | same as G01 | **96** | **89** |
| G04 | 14 / 12 / 0 / 0 | **104** | **81** |

**D — do not reconcile. Do not invent corrected occupancy.**  
Use **J2–J5 and container count** as golden for these IDs. Discard occupancy JSON for G02/G03/G04 until a **manual** Excel occupancy count exists.

---

## 10. 6100 / 5900 behavior

**Correction:** Do **not** state “U3 ≥ 6100 automatically means 20 STD.”

G11A–C (single drum ~5900 mm):

| ID | Flange | Type | M3 | remL (U3) |
|----|--------|------|----|-----------|
| G11A | 5900 | 40 Open Top | **12000** | **6100** |
| G11B | 5901 | 40 Open Top | 12000 | 6099 |
| G11C | 5899 | 40 Open Top | 12000 | 6101 |

`O3` Open Top (**N ≥ 2600**) fires **before** M3=5900. 5900 mm is an Open Top drum in this model.

B2300M (2299 &lt; 2300): type **20 STD**, M3=**5900** — compatible with VBA “if U3≥6100 and type not HQ/OT then M3=5900” **plus** `O3` 20 STD when M3=5900. That **does not** prove the 6100 threshold in isolation.

**E / F:** Manual fixture with flange **&lt; 2300** and remaining length straddling 6100. Until then, SaaS must not implement a standalone “6100 → 20 STD” shortcut.

---

## 11. Legacy algorithm characterization

| Characteristic | Support |
|---------------|---------|
 | Deterministic given identical A–D, E1, E3, E5, K3, sheet formulas | **C** (code) + **A** same-J replay G01/G02/G03 J strings |
| Sequential / order-dependent (sort then expand then nb=1…1000) | **C** |
| Greedy first-fit across containers | **C**; G09 one-heavy-drum-per-box **A** |
| Container-by-container `Container()` | **C** |
| Hard-coded 2300, 2600, 1050, 5900, 6100, 12000, 26000, 2350 | **B** / **A** in these runs |
| Virtual second-layer **flag** | **A** V2; **E** load |
| Limited geometry (length/width/weight; no height/door in VBA) | **C** |
| Stuffing changes result | **A** counts; **E** mechanism |
| Type from packed lengths + M3 | **B** |

---

## 12. What SaaS should preserve (supported only)

| Legacy | SaaS parity (when implementing) |
|-------|-----------------------------------|
| Distinct Rolling vs Forklifting **modes** | Persist stuffing; do not treat as aliases (**A** count difference) |
| Region Europe vs Africa as V2 gate | Persist region; Europe sample V2=0 (**A**); Africa V2 can be 1 (**A**) |
| Type: OT if any packed length ≥ 2600; else HQ if ≥ 2300 | Strict inequalities as Excel `>=` (**A** at 2300/2600) |
| 20 STD when type is not HQ/OT and M3 is 5900 | Preserve **after** OT/HQ (**B**); no 6100 shortcut |
| E5 payload cap | Weight gate; G09/G10 **A** |
| K3 width in these runs 2350 | Until master data, record as **study input** (**A** value, **F** ownership) |
| Sequential allocation, expand quantity | Documented algorithm version `LEGACY_FIRST_FIT` (**C** + G01 expand **A**) |
| V2 formula thresholds 1050 exclusive, 50% | Flag parity (**A**); not virtual load |
| J2–J5 type mix for G01 | Frozen golden (§4) |

Clearance 50 mm / drum capacity: **Drum Master freeze** — **not** re-verified here (**C** from platform, out of this Excel engine).

---

## 13. What SaaS should not copy blindly

| # | Legacy | Safer SaaS |
|---|--------|------------|
| 1 | Silent 0-container / no row for G10/G10B | Explicit UNALLOCATED + reason |
| 2 | `MsgBox` to finish calculate | API response + persisted snapshot |
| 3 | `For nb = 1 To 1000` on every drum | Bounded search; timeout; still **complete** allocation report |
| 4 | K3/E5/M3 hard-coded in sheet | Container Master + payload master (**F**) |
| 5 | VBA `Integer` | Explicit numeric types; reject out-of-range (**E** overflow) |
| 6 | 12-column hidden blocks | Versioned JSON/DB snapshot |
| 7 | V2 flag vs empty O2 | Named `secondLayerEnabled` vs `virtualAllocations[]` |
| 8 | Forklift G/H | No engine until F01–F04 manual (**E**) |
| 9 | G02/G03/G04 occupancy JSON | Ignore until recount (**D**) |
| 10 | Hide columns / J text formatting | Structured DTO, not worksheet UX |

---

## 14. Target SaaS output contract (conceptual)

Reproducible from **input snapshot + `algorithmVersion`**.

```
ContainerStudyResult
  studyId
  algorithmVersion          // e.g. LEGACY_FIRST_FIT@<doc-hash>
  calculatedAt
  stuffingMethod            // Rolling | Forklifting
  region
  maxLoadingWeightKg
  containerWidthMm          // until per-type master
  inputSnapshot             // drums, qty, controls
  containers[]
    containerIndex
    typeCode                // 40 HQ | 40 STD | 20 STD | 40 Open Top
    usableLengthMm
    loadedWeightKg
    remainingWeightKg
    remainingLengthMm
    utilizationWeightPct
    utilizationLengthPct
    drumCountQ3
    secondLayerFlagV2
    allocations[]          // drum identity, length, width, weight, tier
  unallocated[]
    drumIdentity
    reasonCode              // NO_FEASIBLE_CONTAINER | WEIGHT | DIMENSION | ...
  warnings[]
  errors[]
  audit                     // appendServerAudit event ids
```

---

## 15. Golden test contract (future automation)

**Strict J2–J5 / type / M3 / V2 assertions allowed** (evidence **A**):

G01, G05, B2300M, B2300P, G06, B2600M, B2600P, G07, B1050M, B1050, B1050P, G08, SL50M, SL50P, G09, G10, G10B, G11A, G11B, G11C, G12.

**G02, G03:** assert J2–J5 only; **not** occupancy.  
**G04:** assert 26 containers and J mix; **not** G/H swap.  
**Not strict until manual:** F01–F04, virtual O2 load, isolated 6100, Q3 vs all tiers.

---

## 16. Unresolved decisions

| ID | Decision | Status |
|----|----------|--------|
| Q-03 | Forklifting placement / G↔H / Rolling-only tiers | **E** F01–F04 |
| Q-04 | Exact Q3 vs physical vs virtual | **E**; G07 Q3=6 with 6 placements **A** for that case only |
| Q-05 | Recalc: O3 vs M3 post-adjust order | **B** sketch; G11 vs B2300M **A** outcomes |
| Q-07 | Flange vs Drum Packing Profile (doc 39 D-17) | **F** |
| Q-08 | Integer / overflow | **E** |
| Q-10 | One width 2350 vs per container type | **F** |
| V-load | Branch 4 virtual load | **E** |
| 6100 | Isolated remaining-length → 20 STD | **E** |
| Type×M3 | OT/HQ vs 5900 interaction | **A** G11; **F** if SaaS should keep OT-first |

Do not close these by assumption.

---

## 17. 05I-DC entry criteria

| # | Criterion | Met? |
|---|-----------|------|
| 1 | 05I-DB++ approved | **No** (pending review) |
| 2 | No critical ambiguity in type classification | **Partial** — 2300/2600 **A**; 20 STD/6100 **E** |
| 3 | Forklifting explicitly classified | **E** (counts only) |
| 4 | Virtual second-layer classified | Flag **A**; load **E** |
| 5 | 6100/5900 classified | Outcome G11 **A**; rule **E** |
| 6 | SaaS unallocated behavior approved | **F** |
| 7 | Master-data needs identified | Width, payload, types, constants — **identified**, not approved |
| 8 | Golden tests identified | §15 |
| 9 | Legacy parity scope frozen | **Partial** — J2–J5 G01 frozen; Forklift/virtual/6100 not |

---

## 18. Final recommendation

# NOT READY FOR 05I-DC

**Blocking (do not implement to “fix”):**

1. **Forklifting** — F01–F04 manual Excel (or an approved “Rolling-only v1 engine”).  
2. **Virtual second-layer load** — confirm or explicitly exclude Branch 4.  
3. **6100/5900 vs Open Top** — isolated remaining-length test with flange &lt; 2300.  
4. **SaaS UNALLOCATED** policy signed (**F**).  
5. **This document signed** by Technical Office / Logistics / IT.

Until then, 05I-DC (master/engine design **or** code) is **not authorized**.

---

## Appendix — Classification counts (this document)

From the §2.1 rule table (primary class per row; split A/D rows counted under **D** for occupancy and **A** for J2–J5 as separate rows):

| Class | Rows in §2.1 |
|-------|----------------:|
| **A** | 16 |
| **B** | 5 |
| **C** | 4 |
| **D** | 1 |
| **E** | 5 |
| **F** | 1 (K3/E5 ownership on the global-width row; additional **F** items in §8 and §16) |

Exact row tally is the §2.1 table, not this summary. **F** items outside §2.1: UNALLOCATED policy, packing-profile mapping, OT-first vs 20 STD.

---

*End of TASK 05I-DB++. No application changes. 05I-DC not started.*
