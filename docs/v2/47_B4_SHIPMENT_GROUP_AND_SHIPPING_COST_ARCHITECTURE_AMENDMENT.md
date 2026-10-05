# TASK 05I-DF-B4 — Shipment Group and Shipping Cost Architecture Amendment

**Date:** 2026-09-11  
**Mode:** Architecture amendment (documentation only)  
**Status:** **READY FOR REVIEW** — not authorized for implementation until this document is explicitly approved  
**Amends:** [46](./46_CONTAINER_STUDY_INTEGRATION_ARCHITECTURE.md) for **D1** (grouping modes) and **D2** (LOCKED vs successor study) only  
**Does not reopen:** DF-A-01…35 except the two amendments named below; B1–B3 packing/integrity behavior; Costing V2 freeze; Decision 5

**Frozen implementation bases:**

| Task | Commit | Status |
|------|--------|--------|
| 05I-DF-B1 | `20489b85744aa4f71fd06beda1ed9d5fe40081d4` | **FROZEN** |
| 05I-DRUM-REMEDIATION | `a373dc99c388c82342e335484dc0ab203de8ba37` | **FROZEN** |
| 05I-DF-B2 | `2c475a9ddd02b04cdde82eaac2194756720bcb9e` | **FROZEN** |
| 05I-DF-B3 | `4ad8761e9bc62be44d5c7215ddeffd6705da91d7` | **ACCEPTED / FROZEN** |

B3 must not be changed except where B4-A must correct **LOCKED successor-snapshot** behavior (D2). Packing integrity, uniqueness, confirm gates, and DF-A-09 stale-plan blocking stay as implemented.

This document does **not** implement schema, APIs, UI, Shipping Cost Master, or `ShipmentCostSnapshot`.

---

## 1. Purpose

B3 closed Container Study as a hardened logistics **calculation** boundary. B4 must close the logistics **commercial** boundary:

```text
Confirmed Drum Plan
        ↓
Shipment Group (identity)
        ↓
Container Study (versioned calculation)
        ↓
Confirmed Container Study Result
        ↓
Shipment Cost Master (governed rates)
        ↓
Shipment Cost Snapshot (historical proof)
        ↓
Future Costing / Commercial Offer  (not in B4)
```

The B4 design analysis blocked implementation on two architecture questions:

- **D1** — mixed-destination grouping cannot be represented by `ENTIRE_INQUIRY` or `PER_INQUIRY_LINE`
- **D2** — `ContainerShipmentGroup` `LOCKED` currently prevents a successor study snapshot, which contradicts intended lineage

This amendment **resolves D1 and D2**, records the accepted shipment-rate grain, and decomposes future implementation into **B4-A / B4-B / B4-C / B4-D**. Implementation starts only after explicit approval.

DF-A sequence called customer-shipment work **05I-DF-C**. B4 is that contract, split so grouping/lock is specified before any rate master is built.

---

## 2. Current B1–B3 baseline

What exists and must be treated as given:

| Capability | Baseline |
|------------|----------|
| `ContainerShipmentGroup` | Inquiry-scoped; optional `inquiryLineId`; `deliveryAllocationMode` = `ENTIRE_INQUIRY` \| `PER_INQUIRY_LINE`; dest/incoterm required at create; container type **preference** only |
| `ContainerStudy` | `DRAFT → VALIDATED → CONFIRMED → SUPERSEDED`; **no `CALCULATED` status** |
| Input snapshot | Immutable; B2 authoritative path from CONFIRMED drum plans; client-drum POST closed (B3) |
| Result | Immutable; physicalDrumKey uniqueness; integrity set-conservation (B3) |
| SUPERSEDE | New study `versionNo+1` on the **same** group |
| Confirm | Locks the shipment group (`LOCKED`); DF-A-09 stale drum plan blocks confirm |
| Rate master / snapshot | **Not implemented** |

Known defects this amendment addresses (do not “fix” in B3 except D2 when B4-A is authorized):

1. Mixed destinations cannot form “Lines 1+3 Alexandria / Line 2 Jeddah”.
2. B1 `captureInputSnapshotFromConfirmedDrumPlan` refuses `group.status === 'LOCKED'`, so a SUPERSEDE successor cannot recapture via the authoritative path.

---

## 3. D1 problem statement

Current modes:

| Mode | Membership today | Mixed-dest example |
|------|------------------|--------------------|
| `ENTIRE_INQUIRY` | Every eligible inquiry line | Would mix Alexandria and Jeddah in one packing population |
| `PER_INQUIRY_LINE` | Exactly one line (`inquiryLineId`) | Would create three groups, not two destination groups |

Required business grouping:

```text
Inquiry
  Line 1 → Alexandria
  Line 2 → Jeddah
  Line 3 → Alexandria

Group A  Lines 1 + 3  Alexandria
Group B  Line 2       Jeddah
```

DF-A-12 already forbids mixing destinations in one group. DF-A-08 only froze two modes. Those two modes **cannot** express destination-clustered multi-line groups. Silently treating `ENTIRE_INQUIRY` as “cluster by destination” is **forbidden** — it would change the meaning of an existing mode and hide mixed-dest errors.

Inquiry lines today have **no** destination field. Header `incoterms` / `deliveryTerms` are free text. B4-A must not invent per-line dest by parsing `deliveryTerms`. Line destination used for clustering is a **grouping input** owned by Logistics when creating the group (and, later, a commercial header/line master field if a separate increment adds it).

---

## 4. DESTINATION_CLUSTER decision

**Decision D1 — FROZEN for B4 implementation (pending review approval of this document).**

Add a third explicit `deliveryAllocationMode`:

```text
ENTIRE_INQUIRY
PER_INQUIRY_LINE
DESTINATION_CLUSTER
```

| Mode | Meaning | Must not mean |
|------|---------|----------------|
| `ENTIRE_INQUIRY` | **All** eligible inquiry lines in **one** group | Destination clustering; a subset of lines |
| `PER_INQUIRY_LINE` | **Exactly one** inquiry line | Multi-line cluster |
| `DESTINATION_CLUSTER` | **Two or more** inquiry lines **intentionally** clustered because they share shipment identity | “All remaining lines”; silent split of `ENTIRE_INQUIRY` |

**Shipment identity** that members of a `DESTINATION_CLUSTER` (and of a valid `ENTIRE_INQUIRY`) must share:

- destination port
- incoterm
- container type **preference**, when a preference is present on the group / members

Container type preference remains **non-authoritative** for packing suitability (DF-A-02). A preference mismatch still **rejects clustering** — Logistics must split groups or clear/align preference. The Container Study result remains the technical authority for actual container types.

**Fail-closed rules:**

- `ENTIRE_INQUIRY` + mixed destination/incoterm among eligible lines → **reject**. Do not auto-split into clusters.
- `DESTINATION_CLUSTER` with fewer than two lines → **reject**. Use `PER_INQUIRY_LINE`.
- `DESTINATION_CLUSTER` members that do not share identity → **reject**.
- Two `ENTIRE_INQUIRY` groups on the same inquiry → **reject** (double-count drums). Multiple `DESTINATION_CLUSTER` / `PER_INQUIRY_LINE` groups on one inquiry are expected.

This **amends DF-A-08** by adding the third mode. DF-A-12 (mixed destinations → separate groups) is unchanged and is now implementable.

---

## 5. Shipment Group membership model

`ContainerShipmentGroup.inquiryLineId` (optional, singular) cannot represent `DESTINATION_CLUSTER`.

**Future entity (do not implement in this amendment):**

```text
ContainerShipmentGroupLine
  id
  shipmentGroupId
  inquiryLineId
  createdAt

  UNIQUE (shipmentGroupId, inquiryLineId)
```

A commercial inquiry line must not appear twice in the same group. Whether one line may belong to **two concurrent ACTIVE/LOCKED groups** on the same inquiry: **no** — that would double-count drums. A line may appear on a **superseded/historical group** and a replacement group after identity change.

Membership semantics:

| Mode | Membership rows |
|------|-----------------|
| `ENTIRE_INQUIRY` | **Materialized** set of **all eligible** inquiry lines at group create (or last pre-lock edit). Not an implied live query of “whatever lines exist later”. |
| `PER_INQUIRY_LINE` | **Exactly one** row. `inquiryLineId` on the group may dual-write this single member during compatibility. |
| `DESTINATION_CLUSTER` | **Two or more** rows; all members share shipment identity. |

Eligible lines for `ENTIRE_INQUIRY` are the inquiry’s current commercial lines that Logistics includes at create. Adding a new inquiry line later does **not** silently join a group — that is a membership identity change (see §7).

Drum-plan aggregation (B2) must read **membership**, not “all inquiry lines” vs “one FK”, once the membership entity exists:

- `ENTIRE_INQUIRY` → every CONFIRMED current drum plan on **member** lines (still all members, which at create were all eligible lines)
- `PER_INQUIRY_LINE` → every requirement on that one member line
- `DESTINATION_CLUSTER` → every CONFIRMED current drum plan on **member** lines only (Lines 1+3, not Line 2)

---

## 6. Compatibility / deprecation strategy for `inquiryLineId`

**Decision: A then B — keep temporarily, then deprecate. Do not remove in the first B4-A schema PR if existing B1 routes/rows depend on it.**

| Phase | `ContainerShipmentGroup.inquiryLineId` | `ContainerShipmentGroupLine` |
|-------|----------------------------------------|------------------------------|
| Today (B1–B3) | Authoritative for `PER_INQUIRY_LINE` | Does not exist |
| B4-A introduce | **Compatibility mirror** for `PER_INQUIRY_LINE` only (`DESTINATION_CLUSTER` / `ENTIRE_INQUIRY` leave it null) | **Authoritative** for all modes |
| After backfill + dual-write proven | Deprecated; writers must not rely on it | Authoritative |
| Later cleanup increment | Remove column | Authoritative |

Rules during dual-write:

- `PER_INQUIRY_LINE`: group.inquiryLineId **equals** the single membership row.
- `ENTIRE_INQUIRY` / `DESTINATION_CLUSTER`: group.inquiryLineId **must be null**.
- Readers in B4-A+ resolve members from `ContainerShipmentGroupLine`. Fallback to `inquiryLineId` only when membership rows are missing (legacy rows).

No silent inference of cluster membership from a null `inquiryLineId`.

---

## 7. D2 LOCKED semantics

**Decision D2 — FROZEN for B4 implementation (pending review approval of this document).**

`ContainerShipmentGroup.status = LOCKED` means:

> **The shipment group’s identity is frozen.**

It does **not** mean:

> **No future Container Study may be created or snapshotted.**

This **amends the implementation note on DF-A-07**: lock protects grouping/input **identity**, not the existence of successor calculations. Historical confirmed studies/results stay immutable (DF-A-07 / DF-A-09 unchanged).

### Identity (frozen when LOCKED)

Must not change on the same group:

- destination port
- incoterm
- `deliveryAllocationMode`
- included inquiry-line membership
- other shipment-group identity (group code as business key, inquiry linkage)

If any identity attribute must change → **create a new `ContainerShipmentGroup`**. Do not mutate G1.

### Allowed after LOCKED

- create a **successor** Container Study on G1 (existing SUPERSEDE path, or equivalent new DRAFT study on the same group)
- create a **successor** input snapshot on that new study
- calculate a successor result
- validate / confirm the successor
- retain previous studies/results as historical immutable versions
- create a **new Shipment Cost Snapshot** against a newly confirmed result (B4-C; rate change does not require a new group)

### Example

```text
Group G1: Alexandria + DAP + Lines 1,3   LOCKED
  Study S1 CONFIRMED + Result R1     historical / was current

Drum Plan changes (same dest/incoterm/members):
  S1 + R1 remain readable and immutable
  Study S2 created under G1
  S2 gets its own Input Snapshot + Result R2
  S2 may become the operational current confirmed study/result

Destination changes Alexandria → Jeddah:
  do not mutate G1
  create Group G2 (new identity)
  new study lineage under G2
```

**B4-A required B3 exception:** stop refusing authoritative input-snapshot capture solely because the **group** is `LOCKED`. Refuse snapshot when the **study** is `CONFIRMED` or `SUPERSEDED`, or when the study already has an immutable snapshot (B3 recapture rule). Successor **DRAFT** studies on a LOCKED group **must** be allowed to capture.

---

## 8. Shipment Group vs Container Study lineage

| Object | Role |
|--------|------|
| **Shipment Group** | Business identity / shipment grouping |
| **Container Study** | Versioned calculation **instance** for that group |
| **Input Snapshot** | Immutable physical/logistics input from CONFIRMED Drum Plan(s) + frozen shipment identity |
| **Result** | Immutable calculation output |

```text
One Shipment Group
    ↓
many Container Studies
    ↓
many immutable snapshots / results over time
```

- Operational current = latest **CONFIRMED** study / its `currentResultId` on that study (UX pointer).
- Downstream transactional pins store **specific** result ids (DF-A-04 / DF-A-13) — never “latest”.
- Historical studies/results remain readable.
- **Do not introduce a `CALCULATED` lifecycle status.** Calculate persists a new result; status stays `DRAFT` or `VALIDATED` until confirm.

---

## 9. Stale Drum Plan rule

B3 / DF-A-09 **preserved**:

- A stale CONFIRMED Drum Plan (id/version/membership drift vs snapshot lineage) **blocks confirmation** of the study that would consume that stale snapshot.
- Historical results remain valid historical records.
- Do not mutate historical studies.
- Do not silently recapture a new Drum Plan into an existing snapshot.
- A new Drum Plan version requires a **new** study / input snapshot / result lineage (successor on the same group if identity is unchanged).

---

## 10. Shipment Cost rate grain

**Accepted grain (DF-A-29) — not reopened:**

```text
Destination Port + Incoterm + Container Type
```

Carrier is **not** part of the grain. Carrier / transit / notes may exist later as optional master attributes only.

Quantities come from the **CONFIRMED** `ContainerStudyResult` (counts by `typeCode`). Formula:

```text
line  = quantity[type] × customerShipmentRate[dest, incoterm, type]
group = Σ lines
```

Example: `2 × 40HQ + 1 × 20STD` produces **two** snapshot lines with type provenance. Cost is per container **type**, totaled per shipment group — not a single opaque group lump and not per physical drum.

**No customer-specific rate override in B4.**

---

## 11. Rate ambiguity rule

Shipping Cost Master must be effective-dated (`effectiveFrom` / `effectiveTo`) and `active`.

Selection: exactly one ACTIVE row whose grain matches and that covers `rateAsOfDate`.

If **more than one** active/effective row matches the same grain for that date → **fail closed** `RATE_AMBIGUOUS`. Do not pick latest, highest, or first.

Zero matches → fail closed for the standard snapshot command (`RATE_NOT_FOUND` / equivalent). VIP 0+warning remains a **later consumer** rule (DF-A-06), not a silent B4 write of zero as if configured.

---

## 12. Rate-as-of-date rule

`ShipmentCostSnapshot` has an explicit `rateAsOfDate`.

- If the command omits it → default **Inquiry Date**.
- Persist the **resolved** date on the snapshot (never leave “defaulted” implicit).

Each snapshot line retains:

- master rate id
- rate effective-from / effective-to
- native rate amount
- native currency
- destination
- incoterm
- container type
- quantity
- line / group calculated shipment total (native currency)

The snapshot binds to one **CONFIRMED** `ContainerStudyResult`. It is immutable. Live master changes never rewrite it.

---

## 13. FX boundary

**No FX conversion in B4.**

Snapshot stores native rate currency and amount. Inquiry commercial currency may differ. Conversion happens at a later commercial/costing **input boundary** (DF-A-20). `costingEngine.ts` is not an FX engine. B4 must not choose an FX source or date.

---

## 14. Metal Shipping vs Customer Shipment boundary

| | Metal Shipping | Customer Shipment Cost |
|--|----------------|------------------------|
| What | Raw-material **landed** adder | Finished-goods **logistics** |
| Names | `metalShippingCost` / MT | `customerShipmentRate`, `customerShipmentTotal` |
| Owner | Costing metal basis | Container Study / Shipment Cost domain |
| Store | `CostingMetalCostComponent.SHIPPING` (and inquiry metal basis later) | Future Shipping Cost Master + snapshot |
| Feeds | Applied metal cost → material → internal cable cost | Inquiry shipment total (DF-A-31 / DF-A-35) |

**Do not** reuse `CostingMetalCostComponent.SHIPPING` for customer shipment.  
**Do not** use `CostingLogisticsRule` as the B4 shipment-rate master (wrong grain, costing-config ownership, Increment 13 incoterm layer).  
**Do not** treat `DEFAULT_INCOTERM_CHARGE_PERCENT` as customer freight.

Never combine or double-count (DF-A-16). Never fold customer shipment into cable unit price (DF-A-35).

---

## 15. B4-A / B4-B / B4-C / B4-D implementation decomposition

Authorized only **after** this document is approved. No UI, no `CostingRun` FK, no Pricing, no Quotation, no D365.

### B4-A — Shipment Group Foundation

- `DESTINATION_CLUSTER` mode
- `ContainerShipmentGroupLine` membership; `inquiryLineId` dual-write/deprecation path (§6)
- Group identity immutability when `LOCKED`
- LOCKED group **allows** successor study + snapshot + calculate + confirm (§7)
- `ENTIRE_INQUIRY` mixed-identity **reject**; no silent cluster
- Drum-plan aggregation keyed by membership
- Tests for the Alexandria / Jeddah example and successor-on-locked-group

**Touches B3 only** for the LOCKED snapshot refusal (D2). Do not relax integrity, uniqueness, or stale-plan confirm blocking.

### B4-B — Shipment Cost Master

- destination, incoterm, container type, rate, currency, effective dates, active
- optional carrier/transit/notes **outside** the grain
- overlap protection (`RATE_AMBIGUOUS`)
- internal-only maintainers (customers cannot edit)

### B4-C — Shipment Cost Snapshot

- bind to CONFIRMED `ContainerStudyResult` only
- immutable historical rate proof
- `rateAsOfDate` (default inquiry date, always persisted)
- native currency; **no FX**
- per-type quantity × rate lines + totals

### B4-D — Audit + RBAC + Validation

- group: created / updated / locked / superseded (identity replacement)
- rate master: created / updated / activated / deactivated
- snapshot: created / rate selected
- permission matrix (target: `LOGISTICS:SHIPMENT_GROUP:*`, `LOGISTICS:SHIPMENT_COST:*`; customers cannot manage rates)
- server audit only

Suggested implementation order: **A → B → C → D** (D may land with A–C rather than as a fourth isolated increment).

---

## 16. Explicit non-goals

- Costing / `CostingRun` pins / `costingEngine.ts` / Decision 5 / metal pricing
- Pricing, Quotation, Financial Offer
- D365 / ERP integration
- Container Study algorithm, Forklifting, Excel parity, 6100, virtual physical layer
- Container Study UI, customer portal, Shipping Cost admin UI (unless separately authorized)
- FX conversion
- Customer-specific rate override
- Auto-formation of groups from inquiry header text
- Port / Incoterm master build-out (optional later; B4 may keep codes as constrained strings)
- Reinterpretation of `ENTIRE_INQUIRY` as destination clustering
- `CALCULATED` study status

---

## 17. Open questions

D1 and D2 are **closed** by this amendment (subject to review approval). Remaining items do **not** block the B4-A grouping/lock design; they should be answered before or during B4-B/C:

| ID | Question | Default if unanswered |
|----|----------|------------------------|
| B4-Q1 | Where is per-line destination captured before clustering? | Logistics supplies dest on the **group**; members inherit group dest. Commercial per-line dest master is a later increment. |
| B4-Q2 | Port / Incoterm masters in B4-A vs later? | Constrained strings on group/master; formal masters optional |
| B4-Q3 | New RBAC codes in B4-A vs reuse `LOGISTICS:CONTAINER_STUDY:*`? | Reuse until B4-D; do not grant customers manage |
| B4-Q4 | Snapshot command missing rate: fail-closed vs VIP 0+warn? | B4-C fail-closed; VIP remains a later consumer |
| B4-Q5 | May optional `carrier` duplicate the same grain? | **No** — still `RATE_AMBIGUOUS` if two active rows cover the date |
| B4-Q6 | Group list-by-inquiry API in B4-A? | Yes if needed to test membership; not a UI |

No remaining question reopens grain A, metal vs customer shipment, or “Costing pins result X + snapshot Y later”.

---

## 18. Acceptance criteria for the next implementation task

The next authorized task is **B4-A only**, unless review expands the mandate.

1. `DESTINATION_CLUSTER` is an explicit mode; `ENTIRE_INQUIRY` is never auto-split.
2. Alexandria (L1+L3) / Jeddah (L2) can be persisted as two groups with membership rows.
3. `PER_INQUIRY_LINE` still has exactly one member; dual-write `inquiryLineId` for compatibility.
4. LOCKED freezes dest, incoterm, mode, and membership; those changes require a **new group**.
5. Successor DRAFT study on a LOCKED group can capture snapshot, calculate, confirm; S1 remains immutable.
6. Stale Drum Plan still blocks **confirm**; it does not rewrite historical snapshots.
7. No `CALCULATED` status; no Shipping Cost Master/snapshot unless B4-B/C is separately authorized in the same review.
8. No CostingRun FK, Pricing, Quotation, D365, UI (unless separately authorized).
9. `npm test`, `npx tsc --noEmit`, `npx prisma validate` green; Costing V2 freeze files untouched.
10. This document remains the grouping/lock spec; do not contradict it in code comments or APIs.

**Stop.** Do not start B4-A until this amendment is reviewed and explicitly approved.
