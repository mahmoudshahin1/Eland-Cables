# TASK 05I-DF-B4-C — Shipment Cost Snapshot Architecture

**Date:** 2026-09-11  
**Mode:** Architecture (frozen spec)  
**Status:** **IMPLEMENTED** — this document remains the B4-C spec  
**Amends / follows:** [47](./47_B4_SHIPMENT_GROUP_AND_SHIPPING_COST_ARCHITECTURE_AMENDMENT.md) (D1/D2; grain A; snapshot bind), [48](./48_B4B_SHIPPING_COST_MASTER_ARCHITECTURE.md) (canonical codes; resolver; fail-closed matching)  
**Does not reopen:** DF-A-01…35; B1–B3 packing/integrity; B4-A membership/lock; B4-B masters/resolver; Costing V2 freeze; Decision 5

**Frozen implementation bases:**

| Task | Commit | Status |
|------|--------|--------|
| 05I-DF-B3 | `4ad8761e9bc62be44d5c7215ddeffd6705da91d7` | **FROZEN** |
| 05I-DF-B4-A | `54111423def3219fa3ac8c6c6ca6dc84658a300b` | **FROZEN** |
| 05I-DF-B4-B | `d67f6816e463d3410be43be39404a5281233de16` | **FROZEN** |

This document is the frozen B4-C spec. Implementation must not reopen DF-A-01…35; B1–B3 packing/integrity; B4-A membership/lock; B4-B masters/resolver; Costing V2 freeze; Decision 5.

---

## 1. Purpose

B4-A closed **shipment identity**. B4-B closed the **governed rate** and deterministic `resolveShippingRate`.

B4-C must close the **immutable commercial/logistics proof** that sits between packing and later costing/quotation:

```text
CONFIRMED ContainerStudyResult   (quantities by ContainerType.code)
        ↓  + group dest/incoterm + persisted rateAsOfDate
        ↓  resolveShippingRate (B4-B; not reimplemented)
ShipmentCostSnapshot             (this increment — design)
        ↓
Future Costing / Pricing / Quotation   (not B4-C)
```

The snapshot answers, historically:

> Which confirmed packing result was used, which shipment-group identity applied, which shipping rates were selected, what container quantities were charged, and what customer shipment cost was calculated.

It must remain valid after live `ShippingCostRate`, `DestinationPort`, `Incoterm`, `ContainerType`, or future Customer preferences change.

B4-C does **not** own Inquiry Total, cable unit price, FX, or `CostingRun`.

---

## 2. B4-A / B4-B baseline (given)

What exists after `d67f681` and must not be redesigned:

| Object | Baseline |
|--------|----------|
| `ContainerShipmentGroup` | Inquiry-scoped identity. `destinationPortCode` / `incotermCode` are **canonical-code strings**, not Prisma FKs. LOCKED freezes dest, incoterm, mode, membership. Successor studies on LOCKED groups **are** allowed. |
| `ContainerShipmentGroupLine` | Authoritative membership. |
| `ContainerStudy` | `DRAFT → VALIDATED → CONFIRMED → SUPERSEDED`. No `CALCULATED`. `currentSnapshotId` / `currentResultId`. |
| `ContainerStudyInputSnapshot` | Immutable packing input. Authoritative path from CONFIRMED drum plans (B3). |
| `ContainerStudyResult` | Immutable calculation artifact. Bound to one input snapshot. `resultId` unique. |
| `ContainerStudyResultContainer` | One row **per physical container**. `typeCode` = `ContainerType.code` (engine copies pin code). |
| `ContainerStudyResultUnallocated` | Unallocated physical drums. **Confirm blocks** if count > 0 (`UNALLOCATED_DRUMS_PRESENT`). |
| Confirm gates (B3) | Current snapshot + current result belonging to that snapshot + integrity PASS + **zero unallocated** + **stale CONFIRMED Drum Plan blocks confirm**. Confirm locks the group. |
| `ShippingCostRate` | Grain dest + incoterm + `ContainerType.code` + covering date. Native amount + `CostingCurrency`. |
| Resolver | `0 → RATE_NOT_FOUND`, `1 → SELECT`, `>1 → RATE_AMBIGUOUS`. No FX. No zero coercion. |
| Canonical codes | `UPPER`+trim. Display names never match. |
| RBAC | `LOGISTICS:SHIPMENT_COST:VIEW` / `:MANAGE`. Customers neither. |

Inquiry header `incoterms` / `deliveryTerms` remain free text. Snapshot dest/incoterm come from the **group**, not from parsing header text.

---

## 3. Domain boundary

| Domain | What it is | Store | Must not become |
|--------|------------|-------|-----------------|
| **Shipment Cost Snapshot** | Immutable proof of customer freight for one confirmed packing result | **New** `ShipmentCostSnapshot` + lines | Live rate lookup; cable unit cost; metal shipping |
| **Shipping Cost Master** | Governed rates | `ShippingCostRate` (B4-B) | Snapshot (do not mutate rates to “pin” a quote) |
| **Container Study Result** | Packing quantities | `ContainerStudyResult*` | Freight calculation |
| **Metal shipping** | RM landed adder | `CostingMetalCostComponent.SHIPPING` | Customer freight |
| **Inquiry / quotation total** | Products + shipping presentation | Later commercial (DF-A-31/35) | Owned by B4-C |

**Forbidden:**

- Do **not** re-read `ShippingCostRate` later to explain a historical total.
- Do **not** write `0` for `RATE_NOT_FOUND`.
- Do **not** convert currency.
- Do **not** fold shipment into cable unit price (DF-A-35).
- Do **not** add `CostingRun` FK in B4-C.
- Do **not** introduce `CALCULATED` on Container Study.
- Do **not** snapshot DRAFT / unconfirmed / superseded studies.

Commercial names: `customerShipmentRate` (line), `customerShipmentTotal` (header). Persistence: `ShipmentCostSnapshot` / `ShipmentCostSnapshotLine`.

---

## 4. Snapshot lineage

Exact bind is **`ContainerStudyResult`**, not “current study”, not “current drum plan”, not the group alone.

```text
CommercialInquiry
    ↓
CommercialInquiryLine  (membership via ContainerShipmentGroupLine)
    ↓
V2DrumPlan (CONFIRMED at input-snapshot capture)
    ↓
ContainerShipmentGroup
    ↓
ContainerStudy
    ↓
ContainerStudyInputSnapshot
    ↓
ContainerStudyResult          ← snapshot.containerStudyResultId
    ↓
ShipmentCostSnapshot
```

Server resolution (never trust a client-supplied tuple blindly):

1. Load `ContainerStudyResult` by id (`id` or `resultId`).
2. Load its `ContainerStudy` (`result.studyId`).
3. Load that study’s `ContainerShipmentGroup`.
4. Assert `group.id` matches the requested group (if the command is group-scoped) and `group.inquiryId` matches the study.
5. Assert `result.studyId === study.id`.
6. Assert `study.status === CONFIRMED`.
7. Assert `study.currentResultId === result.id` (the confirmed result, not an earlier DRAFT recalculation).
8. Assert `result.inputSnapshotId === study.currentSnapshotId`.
9. Assert customer isolation via the **inquiry**, not via body `customerId`.

A snapshot that only stores `shipmentGroupId` without `containerStudyResultId` is **invalid architecture**.

---

## 5. Snapshot model

**Decision: immutable created artifact. No DRAFT / CONFIRMED / CALCULATED status machine.**

Creation **is** the commercial fact. There is nothing to “confirm” after rates are selected and lines persisted. SUPERSEDED is a **lineage property of the study/result**, not a mutable field on the snapshot.

Recommended entity `ShipmentCostSnapshot`:

| Field | Type | Required | Notes |
|-------|------|----------|--------|
| `id` | cuid | yes | Stable id for later Costing pin |
| `inquiryId` | FK → `CommercialInquiry` | yes | Isolation + default as-of |
| `shipmentGroupId` | FK → `ContainerShipmentGroup` | yes | Identity provenance |
| `containerStudyId` | FK → `ContainerStudy` | yes | |
| `containerStudyResultId` | FK → `ContainerStudyResult` | yes | **Unique** — one snapshot per confirmed result |
| `destinationPortCode` | String | yes | Copied canonical code from the group at create |
| `incotermCode` | String | yes | Copied canonical code from the group at create |
| `rateAsOfDate` | Date (`@db.Date`) | yes | Calendar date actually used; never implicit |
| `totalAmount` | Decimal | yes | Σ line totals (single currency; §13) |
| `currencyCode` | String | yes | Native currency of all lines |
| `createdBy` | String? | no | Actor id |
| `createdAt` | DateTime | yes | |

**Not in B4-C:**

- `status` / `workflowStatus` / `versionNo` / `isCurrent`
- `customerId` override
- FX fields, inquiry commercial currency, converted totals
- `carrier`
- `CostingRun` relation
- Display names of port / incoterm (codes are identity; names are live UI)

**Optional later (not required for correctness):** a human `snapshotNumber` from platform `NumberSequence`. Identity remains `id`. Do not invent a second sequence engine. Default if unanswered: **omit** in B4-C v1 (`id` + `containerStudyResult.resultId` are enough).

**Do not FK** snapshot dest/incoterm to `DestinationPort` / `Incoterm`. Copied codes must survive master deactivation.

---

## 6. Snapshot line model

Recommended entity `ShipmentCostSnapshotLine`:

| Field | Type | Required | Notes |
|-------|------|----------|--------|
| `id` | cuid | yes | |
| `shipmentCostSnapshotId` | FK | yes | Cascade from header |
| `containerTypeCode` | String | yes | Grain key; copied |
| `containerQuantity` | Int | yes | Count of result containers of this type; **> 0** |
| `shippingCostRateId` | String | yes | B4-B row id selected; copied even if master later deactivates |
| `rateAmount` | Decimal | yes | Copied native amount; **> 0** |
| `currencyCode` | String | yes | Copied native currency |
| `effectiveFrom` | Date | yes | Copied from selected rate |
| `effectiveTo` | Date? | no | Copied; null = open at selection time |
| `lineTotal` | Decimal | yes | `containerQuantity × rateAmount` |

Optional copies of `destinationPortCode` / `incotermCode` on the line are **not required** (header holds identity). Lines are already typed by container type.

**Do not store:** rate `notes`, port `name`, incoterm `description`, `ContainerTypeVersion.id`, group preference code, per-drum rows.

**Quantity is container count, not drum count.** `drumCountQ3` on the result container is packing occupancy, not the freight unit.

Deterministic line order: `containerTypeCode` ascending.

---

## 7. Confirmed-result gate

A snapshot may be **created** only when all of the following hold:

| Gate | Rule | Failure |
|------|------|---------|
| Result exists | Load by server id | `RESULT_NOT_FOUND` |
| Study CONFIRMED | `study.status === CONFIRMED` | `RESULT_NOT_CONFIRMED` (DRAFT / VALIDATED) or `RESULT_SUPERSEDED` |
| Result is the confirmed one | `study.currentResultId === result.id` | `RESULT_NOT_CONFIRMED` |
| Snapshot matches current snapshot | `result.inputSnapshotId === study.currentSnapshotId` | `RESULT_INTEGRITY_FAILED` |
| Group match | Result’s study group = command group | `INVALID_SHIPMENT_GROUP` |
| Dest / incoterm present | Group codes non-blank after canonicalize | `INVALID_SHIPMENT_GROUP` |
| Unallocated | `result.unallocated.length === 0` | `UNALLOCATED_CONTAINERS` |
| Typed containers | Every result container has non-blank `typeCode` known to the resolver grain | `CONTAINER_TYPE_NOT_FOUND` (or equivalent) |

**Do not allow** snapshot from:

- DRAFT or VALIDATED studies
- a result that is not `currentResult` of a CONFIRMED study
- a SUPERSEDED study (create against the successor’s **new** confirmed result instead)
- missing result / missing snapshot

B3 already refuses CONFIRMED when unallocated drums exist. B4-C **re-checks** unallocated as defense in depth (corrupt SQL / race). It does not invent an exception.

---

## 8. Result integrity

Before persist, verify **server-side**:

```text
ContainerStudyResult
    belongs to ContainerStudy
        belongs to ContainerShipmentGroup
            belongs to CommercialInquiry
Result.inputSnapshotId = Study.currentSnapshotId
Input snapshot is the immutable capture used for that result
```

**Stale Drum Plan at snapshot time:**

B3 uses `STALE_DRUM_PLAN` to **block confirm**. After confirm, live drum plans may move (successor study is the remediations path). Re-applying the live stale-plan check at B4-C would prevent pricing a **valid already-confirmed** result.

**Decision:** B4-C does **not** re-run `assertSnapshotDrumPlansCurrent` against live drum plans. Packing truth is the confirmed result + its input snapshot. `STALE_DRUM_PLAN` remains a confirm-time code; it is not a B4-C create-time veto of an already CONFIRMED result.

Integrity still verifies snapshot/result **record** linkage (ids match). Failure: `RESULT_INTEGRITY_FAILED`.

---

## 9. Container quantity provenance

**Authoritative source:** `ContainerStudyResultContainer` rows on the bound result.

```text
quantity[typeCode] = COUNT(*) of containers where typeCode = that code
```

Example (Doc 47): result has fourteen `40HQ` rows, nine `40STD`, one `20STD` → three snapshot lines (`14`, `9`, `1`).

Mixed types are mandatory. Do **not**:

- use group `containerTypePreferenceCode`
- use `ContainerTypeVersion`
- accept quantities from the client
- drop a type because its rate is missing (that is `RATE_NOT_FOUND` for the whole command)
- price per physical drum

Zero container rows → `RESULT_INTEGRITY_FAILED` (a CONFIRMED result with no containers is not a shippable proof).

Null/blank `typeCode` on any container → fail closed (`CONTAINER_TYPE_NOT_FOUND`). Do not bucket as `"UNKNOWN"`.

---

## 10. Rate resolution

B4-C **calls** B4-B `resolveShippingCostRate` / `resolveShippingRate`. It does not reimplement matching, overlap, or date coverage.

For each distinct `typeCode` with quantity > 0:

```text
resolveShippingRate({
  destinationPortCode,   // canonicalized from group copy
  incotermCode,
  containerTypeCode,     // result typeCode
  asOfDate: rateAsOfDate // persisted header date; required, never defaulted inside B4-B
})
```

| Resolver | B4-C |
|----------|------|
| `SELECT` | Copy id, amount, currency, effective dates onto the line; `lineTotal = qty × rateAmount` |
| `RATE_NOT_FOUND` | Abort entire command. Persist **nothing**. |
| `RATE_AMBIGUOUS` | Abort entire command. Persist **nothing**. |

Partial success is forbidden: missing 20STD while 40HQ exists does **not** write a 40HQ-only snapshot.

VIP 0 + warning (DF-A-06 / B4-Q4) is **not** implemented in B4-C. Downstream workflow may consume `RATE_NOT_FOUND`; the snapshot domain never stores zero as a configured rate.

---

## 11. Rate provenance

Each line is self-contained commercial evidence:

- `shippingCostRateId`
- copied `rateAmount`, `currencyCode`, `effectiveFrom`, `effectiveTo`
- `containerTypeCode`, `containerQuantity`, `lineTotal`

Header holds `rateAsOfDate`, dest, incoterm, totals.

Live master deactivation, amount history (new rate rows), or port rename **must not** change these copies.

`shippingCostRateId` is a **copied id**. Prefer storing it as a string (optional FK `ON DELETE RESTRICT` is acceptable because B4-B does not delete historical rates). Copied amount remains authoritative even if the FK were later dropped.

---

## 12. Rate-as-of-date

- Type: **date-only** (same semantics as B4-B).
- B4-B resolver **requires** an explicit date (does not default).
- B4-C **command** may omit it; the application layer then defaults to `CommercialInquiry.inquiryDate` as a **UTC calendar date** (`YYYY-MM-DD`). Persist the resolved date on the header. Never leave “defaulted” implicit.
- If the command supplies a date, use that date (canonicalize; reject invalid).
- Do not recompute as-of on read.

Inquiry `inquiryDate` is `DateTime` today; convert with the same UTC date-only helper as B4-B.

---

## 13. Currency strategy

B4-B stores **native** amount + `CostingCurrency.code`. B4-C copies that. **No FX. Do not read `CostingExchangeRate`. Do not call `costingEngine.ts`.**

**Can one snapshot contain multiple currencies?**

Technically, two types could resolve to USD and EUR. A single `totalAmount` would then be meaningless without conversion.

**Decision (frozen default): no mixed currencies in one snapshot.**

After all types SELECT, if any line `currencyCode` differs from the others → `CURRENCY_INCOMPATIBLE`. Persist nothing.

Then:

```text
header.currencyCode = the common native code
header.totalAmount  = Σ lineTotal
```

This keeps DF-A-35 “Shipping Total” as one number without inventing FX. Mixed-currency grains are a **master-data defect** to fix on `ShippingCostRate`, not a snapshot feature.

Later costing/commercial may convert the **whole** snapshot into inquiry currency. That is outside B4-C.

---

## 14. Total calculation

Exact B4-C arithmetic (same currency, integer quantities, copied decimal rates):

```text
lineTotal[type] = quantity[type] × rateAmount[type]
totalAmount     = Σ lineTotal
```

- Per **container type**, not per drum, not a group lump without type provenance.
- Do not round in a second currency.
- Do not apply incoterm “who pays” logic (incoterm is a grain key only).
- `totalAmount` is the **customer shipment total for this group/result**, not Inquiry Total.

---

## 15. Unallocated-container rule

**Unallocated drums block Shipment Cost Snapshot creation.**

B3 already blocks CONFIRMED when `unallocatedCount > 0`. B4-C repeats: if the bound result has any `ContainerStudyResultUnallocated` row → `UNALLOCATED_CONTAINERS`.

No exception in B4-C for “price allocated containers only.” A complete shipment proof must not silently omit drums the engine could not pack.

VIP optional Container Study (DF-A-06) means **no snapshot / 0+warning at a later consumer**, not a partial B4-C snapshot.

---

## 16. Historical immutability

After insert, **no field** on header or lines is updatable: rates, dest, incoterm, types, quantities, totals, result reference, as-of date.

Correction path:

```text
New successor Container Study on the same LOCKED group (identity unchanged)
    → new input snapshot / calculate / CONFIRMED result
    → NEW ShipmentCostSnapshot
```

S1 remains readable. Live master edits never rewrite S1.

There is no PATCH API in B4-C.

---

## 17. Lifecycle

**None**, beyond `createdAt`.

| Rejected model | Why |
|----------------|-----|
| DRAFT snapshot | Would allow mutating rates before “confirm”; duplicates Container Study’s DRAFT |
| CALCULATED | Intentionally absent on Container Study; do not introduce it here |
| CONFIRMED snapshot status | Creation already required a CONFIRMED result and successful resolve |
| SUPERSEDED column on snapshot | Derivable: the bound study is SUPERSEDED, or a later snapshot exists for a successor result |

Query “current shipping proof for a group”:

```text
group → CONFIRMED study (if any) → currentResultId → snapshot by containerStudyResultId
```

If the group’s latest study is DRAFT (successor in progress), the previous CONFIRMED study’s snapshot remains the last issued proof until the successor is confirmed and snapshotted.

---

## 18. Recapture / supersession

```text
Existing snapshot S1 (result R1, CONFIRMED study Vn)
        ↓
Successor study Vn+1 on the same group, newly CONFIRMED result R2
        ↓
New snapshot S2 bound to R2
```

S1 is unchanged. S2 does not update S1.

**Same result requested again:** see §19 (idempotent return of S1).

**Same result, different `rateAsOfDate`:** **not allowed** in B4-C v1. One snapshot per confirmed result. Rate recapture requires a **new confirmed result** (successor study). Do not fork commercial proofs off one packing result with competing as-of dates.

---

## 19. Idempotency / concurrency

**Unique key:** `containerStudyResultId` (one authoritative snapshot per confirmed result).

Command behavior:

1. Resolve result + gates.
2. If a snapshot already exists for that result → **return it** (200). Do not insert a duplicate.
3. If the caller supplied `rateAsOfDate` and it **differs** from the stored header date → `SNAPSHOT_AS_OF_MISMATCH` (fail closed; do not silently ignore and do not overwrite).
4. If two writers insert concurrently → unique constraint; loser re-reads and returns the winner’s row (or `CONFLICT` if the re-read fails).

Do not unique on `(group, asOfDate)` alone: two confirmed results on a successor chain must both be snapshottable.

---

## 20. Inquiry / quotation financial boundary

Preserve DF-A-31 / DF-A-35:

```text
Inquiry Total = Σ Cable Line Totals  +  Σ Customer Shipment Totals
```

B4-C produces **one** customer shipment total per snapshotted group (native currency).

It does **not**:

- write inquiry header totals
- allocate freight into cable unit price
- emit Financial Offer sections
- sum multiple groups into an inquiry total (that is a later commercial consumer looping snapshots)

---

## 21. Metal shipping boundary

| | Metal shipping | Customer shipment |
|--|----------------|-------------------|
| Meaning | RM landed adder | Finished-goods freight |
| Store | `CostingMetalCostComponent.SHIPPING` | `ShipmentCostSnapshot` |
| Engine | Costing V2 (frozen) | B4-C consuming B4-B |

Never combine or double-count (DF-A-16). Never reuse `CostingLogisticsRule` or `DEFAULT_INCOTERM_CHARGE_PERCENT`.

---

## 22. Costing boundary

B4-C does **not** create `CostingRun` relations.

Future (not this increment):

```text
CostingRun  →  shipmentCostSnapshotId  (optional pin)
```

Costing consumes the **exact** snapshot id + copied amounts. It must not call the live resolver to reconstruct a historical run.

`costingEngine.ts` / Decision 5 / metal premiums remain untouched.

---

## 23. Audit

Authority: PostgreSQL `AuditEvent` through the server audit abstraction only (no client `auditLogService`).

| Helper | Role |
|--------|------|
| `appendServerAuditTx(tx, event)` | **Required for successful create.** Same `AuditEvent` construction as `appendServerAudit`. Accepts the Prisma transaction client. Does **not** swallow errors. Lives inside `prisma.$transaction` with rate resolution, header, and lines. If audit insert fails, the snapshot rolls back. |
| `appendServerAudit(event)` | Existing non-transactional helper. Swallows errors so unrelated callers are not aborted. Used for optional `CREATE_FAILED` **outside** the snapshot transaction. |

Do not call `tx.auditEvent.create` directly from B4-C. Do not add a second audit store.

| Action | When |
|--------|------|
| `SHIPMENT_COST_SNAPSHOT_CREATED` | Successful insert (not idempotent re-read); via `appendServerAuditTx` inside the create transaction |
| `SHIPMENT_COST_SNAPSHOT_CREATE_FAILED` | Optional; `appendServerAudit` outside the transaction; mirror Container Study confirm-failed with issue codes |

`entity` / `entityId` = snapshot (or study/result on failure). `newValue` must include result id, dest, incoterm, as-of, per-line type/qty/rate id/amount/currency, totals.

No read audit. No client `auditLogService` events. No SUPERSEDED audit on S1 (S1 is not mutated).

---

## 24. RBAC

B4-B codes stay. Do not reuse rate-master manage as the only mental model, but do not explode the catalog in B4-C unless required.

| Action | Permission | Customer |
|--------|------------|----------|
| Read snapshot | `LOGISTICS:SHIPMENT_COST:VIEW` **or** `LOGISTICS:CONTAINER_STUDY:VIEW`, **and** `userType !== customer` | **No** master read |
| Create snapshot | `LOGISTICS:SHIPMENT_COST:MANAGE` **or** `LOGISTICS:CONTAINER_STUDY:CONFIRM`, **and** internal | **No** |

Rationale: Sales can CONFIRM packing (`CONTAINER_STUDY:CONFIRM`) without `SHIPMENT_COST:MANAGE` (rate stewardship). They must still be able to issue the freight proof. Rate maintainers can also snapshot. Customers never create or browse the rate/snapshot master (B4-B). Customer-facing shipping **totals** appear later on commercial documents, scoped by inquiry ownership — **not** a B4-C portal API.

Server enforcement only.

---

## 25. Customer isolation

```text
snapshot → shipmentGroup → inquiry → customer
```

- Never take `customerId` from body/query/URL.
- Reuse inquiry/container-study scoping (`customerScope` / ownership asserts).
- Internal users with permission may read/create within authorized inquiries.
- IDOR: knowing `snapshot.id` or `resultId` must not leak another customer’s freight.

Customers are denied the B4-C APIs entirely (see §24). Isolation still applies so internal bugs cannot cross tenants.

---

## 26. Failure modes

Domain `VALIDATION_FAILED` / `NOT_FOUND` / `CONFLICT` with `details.issueCode` (existing convention).

| Issue code | Meaning |
|------------|---------|
| `RESULT_NOT_FOUND` | No such `ContainerStudyResult` |
| `RESULT_NOT_CONFIRMED` | Study not CONFIRMED, or result is not `currentResult` |
| `RESULT_SUPERSEDED` | Study status SUPERSEDED |
| `RESULT_INTEGRITY_FAILED` | Result/study/snapshot/group/inquiry graph mismatch, empty containers |
| `INVALID_SHIPMENT_GROUP` | Group mismatch, SUPERSEDED group, blank dest/incoterm |
| `UNALLOCATED_CONTAINERS` | Result has unallocated drums |
| `CONTAINER_TYPE_NOT_FOUND` | Blank/unknown `typeCode` |
| `RATE_NOT_FOUND` | Resolver 0 (including unknown dest/incoterm at resolve) |
| `RATE_AMBIGUOUS` | Resolver >1 |
| `CURRENCY_INCOMPATIBLE` | Selected rates do not share one currency |
| `SNAPSHOT_AS_OF_MISMATCH` | Idempotent hit but caller as-of ≠ stored as-of |
| `INVALID_AS_OF_DATE` | Missing/invalid calendar date after defaulting rules |

`STALE_DRUM_PLAN` is **not** a B4-C create code (confirm-time only; §8).

Do not specify HTTP numbers as architecture. Implementation should follow existing `DomainError` mapping (401/404/409/400).

---

## 27. Future Customer Master relationship

Not implemented here.

Future `CustomerPortPreference` / default incoterm may **suggest** dest/incoterm when Logistics forms a group. They must **not**:

- override LOCKED group identity
- override snapshot copied codes
- select or override `ShippingCostRate`

```text
Customer preference  ≠  Shipment Group identity  ≠  rate selection  ≠  snapshot copies
```

---

## 28. Non-goals

- Schema, APIs, UI, tests (until B4-C is authorized)
- `ShipmentCostSnapshot` implementation in this task
- CostingRun FK, `costingEngine.ts`, Decision 5
- Pricing, Quotation, Financial Offer, inquiry total rollup
- FX
- D365
- Customer Master / port / incoterm preferences
- Container Study calculation, Forklifting, Excel parity
- Shipping Cost Master changes
- B4-A group FK alignment (B4-B-Q1 remainder)
- VIP 0+warning inside the snapshot command
- Carrier as a matching dimension
- Auto-create snapshot on Container Study confirm (may be a later orchestration choice; not required to start B4-C)
- Customer portal snapshot UI

---

## 29. Open decisions

| ID | Question | Default if unanswered at implementation |
|----|----------|------------------------------------------|
| **B4-C-Q1** | Mixed native currencies in one snapshot? | **Reject** `CURRENCY_INCOMPATIBLE`. One header total. |
| **B4-C-Q2** | Allocate `NumberSequence` snapshot numbers? | **Omit** in v1. `id` is identity. |
| **B4-C-Q3** | Same result, new `rateAsOfDate`? | **Forbidden.** Successor CONFIRMED result required. |
| **B4-C-Q4** | Customer read of snapshot APIs? | **No** in B4-C. Later commercial documents only. |
| **B4-C-Q5** | Auto-create snapshot on study confirm? | **No.** Explicit command. Orchestration later. |
| **B4-C-Q6** | FK from line to `ShippingCostRate`? | Optional RESTRICT; copied amount is SoT. |

No remaining question reopens grain A, metal vs customer shipment, unallocated-at-confirm, or “pick latest on overlap”.

---

## 30. B4-C implementation decomposition

Authorized only after this document is approved. Suggested slices (same review may combine):

| Slice | Scope |
|-------|--------|
| **C1** | Domain command: gates §7–9, quantity aggregation, consume B4-B resolver, currency homogeneity, totals |
| **C2** | Persistence: header + lines, unique `containerStudyResultId`, idempotent create |
| **C3** | APIs + RBAC §24 + customer isolation + server audit §23 |
| **C4** | Tests: confirm-only, unallocated, RATE_NOT_FOUND / AMBIGUOUS, mixed currency, idempotency, immutability, isolation; B4-A/B regression |

No UI unless separately authorized. No Costing / Quotation slice.

Suggested explicit command (illustrative, not an implementation contract):

```text
createShipmentCostSnapshot({
  containerStudyResultId,
  shipmentGroupId?,   // if present, must match
  rateAsOfDate?       // default inquiry date; always persist
})
```

---

## 31. Acceptance criteria

Authorized only **after** this document is approved. Scope = **B4-C only**.

1. Snapshot binds to a specific CONFIRMED `ContainerStudyResult` (`currentResult` of a CONFIRMED study), not to “current study” loosely.
2. Quantities come only from counting `ContainerStudyResultContainer` by `typeCode`; mixed types → separate lines.
3. Unallocated drums → `UNALLOCATED_CONTAINERS`; no partial pricing.
4. Resolver consumed, not copied; 0 / >1 fail closed; no zero coercion; no FX.
5. `rateAsOfDate` persisted (inquiry date default at the command layer).
6. Line copies rate id, amount, currency, effective dates; live master cannot rewrite them.
7. Homogeneous currency; header total = Σ lines; mixed → `CURRENCY_INCOMPATIBLE`.
8. Immutable after create; unique one snapshot per result; idempotent re-read.
9. No `CALCULATED`; no snapshot status machine; no CostingRun FK.
10. DF-A-35 preserved: shipment total separate from cable unit price.
11. Metal shipping unused.
12. Server `AuditEvent` on create; no client-only audit.
13. Customers cannot create or read snapshot master APIs; inquiry isolation on the server.
14. B4-A/B tests remain green; Costing V2 freeze files untouched.
15. This document remains the B4-C spec.

**Stop.** Do not implement B4-C until this design is reviewed and explicitly approved. Do not start B4-D. Do not modify Costing or Customer Master.
