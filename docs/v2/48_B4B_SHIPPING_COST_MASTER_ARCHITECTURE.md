# TASK 05I-DF-B4-B — Shipping Cost Master Architecture

**Date:** 2026-09-11  
**Mode:** Architecture design **only**  
**Status:** **READY FOR REVIEW** — not authorized for implementation until this document is explicitly approved  
**Amendment (2026-09-11):** Canonical-code / shared master-data clarification **approved** and frozen in §3.1. This amendment does **not** authorize B4-B implementation.  
**Amends / follows:** [47](./47_B4_SHIPMENT_GROUP_AND_SHIPPING_COST_ARCHITECTURE_AMENDMENT.md) (D1/D2 grouping/lock; rate grain A frozen)  
**Does not reopen:** DF-A-01…35 except the B4-B master/rate-selection detail below; B1–B3 packing/integrity; B4-A membership/lock; Costing V2 freeze; Decision 5

**Frozen implementation bases:**

| Task | Commit | Status |
|------|--------|--------|
| 05I-DF-B3 | `4ad8761e9bc62be44d5c7215ddeffd6705da91d7` | **FROZEN** |
| 05I-DF-B4 architecture amendment (doc 47) | approved | **FROZEN** |
| 05I-DF-B4-A | `54111423def3219fa3ac8c6c6ca6dc84658a300b` | **FROZEN** |

This document does **not** implement schema, APIs, UI, tests, `ShipmentCostSnapshot`, Costing, Pricing, Quotation, or D365.

**Stop after this design.** Do not start B4-B code, and do not start B4-C, until this document is reviewed and explicitly approved.

---

## 1. Purpose

B4-A closed **shipment identity** (who travels together, to which dest/incoterm, with frozen membership when LOCKED).

B4-B must close the **governed customer-shipment rate** boundary:

```text
Confirmed Container Study Result  (quantities by container type)
        ↓
Shipping Cost Master              (this increment — design)
        ↓  resolveApplicableRate(dest, incoterm, type, rateAsOfDate)
B4-C ShipmentCostSnapshot         (not this increment)
        ↓
Future Costing / Commercial Offer (not B4)
```

B4-B owns:

- Destination Port master (minimum)
- Incoterm master (minimum)
- Shipping Cost Master rows (customer shipment rate)
- Deterministic applicable-rate resolution (`SELECT` / `RATE_NOT_FOUND` / `RATE_AMBIGUOUS`)
- Write-time overlap protection **and** read-time fail-closed ambiguity detection
- Server audit + RBAC for rate maintenance

B4-B does **not** create snapshots, inquiry totals, FX, quotations, or costing pins.

---

## 2. B4-A baseline (given)

What exists after `54111423` and must not be redesigned:

| Object | Baseline |
|--------|----------|
| `ContainerShipmentGroup` | Inquiry-scoped identity: dest/incoterm/mode/membership. `destinationPortCode` and `incotermCode` are **string columns, not Prisma FKs** (B4-A frozen). Architecturally they are **canonical codes** owned by the masters in §3.1 — not display names and not unconstrained commercial prose. `containerTypePreferenceCode` is preference only. |
| `ContainerShipmentGroupLine` | Authoritative membership. `inquiryLineId` on the group is a `PER_INQUIRY_LINE` compatibility mirror. |
| Modes | `ENTIRE_INQUIRY` \| `PER_INQUIRY_LINE` \| `DESTINATION_CLUSTER` |
| LOCKED | Identity frozen. Successor Container Studies on the same group **are** allowed. Identity change → new group. |
| `ContainerStudy` | `DRAFT → VALIDATED → CONFIRMED → SUPERSEDED`. No `CALCULATED`. |
| `ContainerStudyResult` | Immutable. Quantities by `ContainerStudyResultContainer.typeCode` (matches `ContainerType.code`, e.g. `40HQ`, `40STD`, `20STD`, `40OT`). |
| Rate master / snapshot | **Not implemented** |

Inquiry lines still have **no** destination field. Header `incoterms` / `deliveryTerms` remain free text. B4-Q1 default stands: Logistics supplies dest on the **group**; commercial per-line dest is a later increment. B4-B does not invent per-line dest by parsing `deliveryTerms`.

---

## 3. Domain boundary

| Domain | What it is | Store | Must not become |
|--------|------------|-------|-----------------|
| **Customer shipment rate** | Finished-goods freight per dest + incoterm + container type | **New** Shipping Cost Master | Metal landed shipping; costing logistics %; container packing |
| **Metal shipping** | Raw-material landed adder per MT | `CostingMetalCostComponent` `SHIPPING` | Customer freight |
| **Costing logistics rule** | Increment 13 incoterm/destination costing-config (nullable `cost`, `priority`, workflow) | `CostingLogisticsRule` | Shipment-rate master |
| **Hardcoded incoterm %** | Legacy calculator map | `DEFAULT_INCOTERM_CHARGE_PERCENT` in `costingCalculator.ts` | Customer freight |
| **FX** | Governed pairs for costing | `CostingExchangeRate` | B4-B conversion engine |
| **Currency list** | Governed ISO codes | `CostingCurrency` | Re-created as a second currency table |

**Forbidden reuse (frozen):**

- Do **not** reuse `CostingMetalCostComponent.SHIPPING`.
- Do **not** turn `CostingLogisticsRule` into the shipment-rate master (wrong grain: no container type; costing-config ownership; `priority` / `isCurrent` / workflow would silently pick a row).
- Do **not** treat `DEFAULT_INCOTERM_CHARGE_PERCENT` as customer freight.
- Do **not** create a second container-type master.
- Do **not** create a second Destination Port or Incoterm master for Customer, Inquiry, costing, or any later increment.
- Do **not** add customer-specific rate overrides.
- Do **not** put **carrier** in the matching grain (DF-A-29 / B4-Q5).
- Do **not** match rates, groups, or preferences by display name.

Commercial names remain: `customerShipmentRate`, `customerShipmentTotal`. Persistence name recommended: `ShippingCostRate` (entity) so it is not confused with metal shipping.

---

## 3.1 Canonical codes and shared masters (approved clarification)

**Frozen.** Cross-domain identity for dest / incoterm / container type / currency is the **canonical code**, not a display name, not a Prisma surrogate id, and not free text.

| Concept | Owner (single SoT) | Canonical key | Consumers store |
|---------|--------------------|---------------|-----------------|
| Destination port | **New in B4-B:** `DestinationPort` | `DestinationPort.code` | The code (`ALEX`, `JEDDAH`, …) |
| Incoterm | **New in B4-B:** `Incoterm` | `Incoterm.code` | The code (`DAP`, `CIF`, …) |
| Container type | **Existing:** `ContainerType` | `ContainerType.code` | The code (`40HQ`, `40STD`, …) |
| Currency | **Existing:** `CostingCurrency` | `CostingCurrency.code` | The code (`USD`, `EUR`, …) |

**Normalization:** codes are unique after `UPPER` + trim. Look-alike matching is rejected; there is no fuzzy or name-based resolve.

**Display names are not grain keys.** `name` on `DestinationPort` / `Incoterm` is UI only. `"Alexandria"` never equals `ALEX`. `"Delivered at Place"` never equals `DAP`.

**One master per concept.** B4-B introduces `DestinationPort` and `Incoterm` as **platform** reference masters, not shipping-only copies. Future Customer Master (port preferences, default incoterm), Inquiry transaction dest/incoterm (when those fields become governed), Shipment Group, and Shipping Cost Rate all consume the **same** codes.

| Consumer | What it stores | Must not store |
|----------|----------------|----------------|
| `ShippingCostRate` | FK to master **codes** (grain) | Display names; a private port/incoterm table |
| `ContainerShipmentGroup` | Canonical-code **strings** (B4-A schema frozen; Prisma FK later) | Prose dest (`CIF Alexandria`); a second master |
| Future Customer port preference | `portCode` = `DestinationPort.code` | `Customer.port`; a Customer-owned Port table |
| Future Customer default / allowed incoterm | `incotermCode` = `Incoterm.code` | A Customer-owned Incoterm table |
| Inquiry / quotation transaction | The **selected** dest/incoterm **codes** for that document | Live Customer default as a substitute for the transaction value |

**Customer preference does not override** Shipment Group identity, Container Study confirmation, or Shipping Cost matching. Defaults suggest; the group’s canonical codes are what B4-C resolves.

**Fail closed on unknown code.** Rate **writes** require the dest / incoterm / container type / currency codes to exist on the owning master (and to be active for **new** writes). B4-C **resolve** looks up by those codes: unknown dest or incoterm → fail closed (`DEST_NOT_FOUND` / `INCOTERM_NOT_FOUND` or `RATE_NOT_FOUND` — pick one family at implementation and use it consistently). Do not invent a port from a display name.

**B4-A groups are not migrated in B4-B.** Existing string values remain as stored. Aligning group columns to Prisma FKs is a later increment (B4-B-Q1 remainder). Semantic identity is already the canonical code.

---

## 4. Shipping Cost Master model

**Decision: one effective-dated rate row. No separate version/workflow status machine.**

Costing config entities (`CostingLogisticsRule`, `CostingMetalRate`) use `workflowStatus` + `versionNo` + `isCurrent`. That is heavier than B4-B needs. History is expressed by **additional rows** with non-overlapping (intended) date ranges, not by mutating a current version in place.

Recommended entity `ShippingCostRate`:

| Field | Type | Required | Notes |
|-------|------|----------|--------|
| `id` | cuid | yes | Stable id for B4-C snapshot pin |
| `destinationPortCode` | FK → `DestinationPort.code` | yes | Grain |
| `incotermCode` | FK → `Incoterm.code` | yes | Grain |
| `containerTypeCode` | FK → `ContainerType.code` | yes | Grain — **code**, not version id |
| `rateAmount` | Decimal | yes | Native amount; must be **> 0** |
| `currencyCode` | FK → `CostingCurrency.code` | yes | Native currency |
| `effectiveFrom` | **Date** (no time) | yes | Inclusive |
| `effectiveTo` | **Date** (no time), nullable | no | Inclusive; `null` = open-ended |
| `active` | Boolean | yes | Default `true`. Inactive rows never match |
| `notes` | String? | no | Outside the grain |
| `createdBy` / `updatedBy` | String? | no | Actor ids |
| `createdAt` / `updatedAt` | DateTime | yes | Row audit timestamps |

**Not in B4-B:**

- `carrier`, `transitDays` — optional later attributes **outside** the grain. Storing them on the rate row in v1 risks accidental matching. Omit until a later increment needs display-only fields.
- `customerId` / customer override.
- `workflowStatus`, `versionNo`, `isCurrent`, `submittedBy`, `approvedBy`.
- `priority`.

**Indexes (logical):**

- `(destinationPortCode, incotermCode, containerTypeCode, active, effectiveFrom)`
- `(destinationPortCode, incotermCode, containerTypeCode)` for overlap scans

There is **no** unique constraint on the grain alone: sequential periods for the same grain are required. Overlap is **not** reliably expressible as a unique index; it is an application (and optionally PostgreSQL range) rule — §12.

**Mutability after create (recommended):**

| Field | After create |
|-------|----------------|
| Grain (`dest`, `incoterm`, `type`) | **Immutable** |
| `rateAmount`, `currencyCode`, `effectiveFrom` | **Immutable** |
| `effectiveTo` | Mutable (close a period when the next rate starts) |
| `active` | Mutable (activate / deactivate) |
| `notes` | Mutable |

A wrong amount is corrected by **deactivating** (or closing) the row and **inserting a new row**. Do not overwrite `rateAmount` in place. That is what keeps B4-C able to prove “rate id R selected”.

If a row has never been snapshotted, an implementation may still refuse in-place amount edits — simpler invariant, fewer special cases.

---

## 5. Destination Port master

**B4-Q1 / B4-Q2 for B4-B:** B4-A stored dest as a group **string** (`ALEX`, `JEDDAH` in tests). Per §3.1 those strings are canonical codes. Rate matching cannot remain free text or display names.

**Finding:** there is **no** `Port`, `DestinationPort`, or `Country` Prisma model. `CommercialInquiry.deliveryTerms` is free text (`CIF Alexandria`). Do not reuse it as dest identity.

**Decision: introduce a minimum `DestinationPort` master in B4-B as the platform SoT for destination-port codes.** Do not build a full geography module. Do not introduce a second Port master later (Customer, Inquiry, or costing).

| Field | Required | Rules |
|-------|----------|--------|
| `id` | yes | cuid |
| `code` | yes | Unique. Normalized `UPPER` + trim. Stable business key (`ALEX`, `JEDDAH`). Not a display name. |
| `name` | yes | Display (`Alexandria`, `Jeddah Islamic Port`) |
| `countryCode` | yes | ISO 3166-1 **alpha-2** (`EG`, `SA`). Constrained string; **no** Country table in B4-B |
| `active` | yes | Inactive ports cannot be used on **new** rate writes |
| `notes` | no | |
| `createdBy` / `updatedBy` / timestamps | yes | |

**Uniqueness:** `code` unique. Recommend rejecting look-alike codes by normalization only (no fuzzy match).

**Inactive semantics:**

- New `ShippingCostRate` writes require `DestinationPort.active = true`.
- Existing rate rows remain queryable. Applicable-rate **read** matches on the **rate** row’s `active` + dates, not on live port.active. Historical proof must survive a later port deactivation.
- New B4-A groups are **not** migrated in B4-B. Prisma FK from `ContainerShipmentGroup.destinationPortCode` to this master is a later increment (B4-B-Q1 remainder). B4-C lookup is by **canonical code**: unknown dest → fail closed. Never match on `DestinationPort.name`.

**Audit:** `DESTINATION_PORT_CREATED` / `UPDATED` / `ACTIVATED` / `DEACTIVATED` via `appendServerAudit`.

**B4-Q1 remainder:** per-line commercial dest is still **not** in B4-B. Clustering dest stays Logistics-on-group.

---

## 6. Incoterm master

**Finding:** there is **no** Incoterm master. `CommercialInquiry.incoterms` defaults to free text `"FOB"`. `CostingLogisticsRule.incoterm` is a costing-config string, not a governed Incoterm SoT.

**Decision: introduce a minimum `Incoterm` master in B4-B as the platform SoT for incoterm codes.** Do not reuse `CostingLogisticsRule`. Do not introduce a second Incoterm master later (Customer, Inquiry, or costing).

| Field | Required | Rules |
|-------|----------|--------|
| `id` | yes | cuid |
| `code` | yes | Unique. Normalized `UPPER` + trim. ICC codes (`EXW`, `FCA`, `FOB`, `CIF`, `CFR`, `CPT`, `CIP`, `DAP`, `DPU`, `DDP`, …). Seed is an implementation concern; the master is not a hardcoded enum in application logic. |
| `name` | yes | Short label |
| `description` | no | |
| `active` | yes | Inactive codes cannot be used on **new** rate writes |
| `createdBy` / `updatedBy` / timestamps | yes | |

**Uniqueness:** `code` unique.

**Inactive / historical:** same as Destination Port — block new rate writes; do not hide existing rate rows from dated lookup.

**Audit:** `INCOTERM_CREATED` / `UPDATED` / `ACTIVATED` / `DEACTIVATED`.

Do not encode “who pays freight” as rate logic. Incoterm is a **grain key**, not a calculator.

---

## 7. Container Type reference

**Decision: `ContainerType.code` is the Shipping Cost Master grain identifier.**

| Identifier | Use |
|------------|-----|
| `ContainerType.code` (`40HQ`, `40STD`, `20STD`, `40OT`, …) | **Rate grain and matching key** |
| `ContainerTypeVersion.id` | Dimensional packing pin on Container Study snapshots. **Not** the rate grain. |
| `containerTypePreferenceCode` on the shipment group | Preference only (DF-A-02). **Never** the rate lookup key. |
| `ContainerStudyResultContainer.typeCode` | Quantity source in **B4-C**. Engine already copies `ContainerType.code` into `typeCode`. |

Do **not** create a second container-type table.

**Write rules:**

- FK to `ContainerType.code`.
- New rates require `ContainerType.active = true`.
- Rate does **not** pin a `ContainerTypeVersion`. A later dimensional version of `40HQ` does not create a new freight rate; quantities in B4-C still group by `typeCode`.

If `typeCode` on a confirmed result is null or unknown to `ContainerType` → B4-C fail closed (`CONTAINER_TYPE_NOT_FOUND` or equivalent). Out of B4-B scope except that resolve input must be a known code.

---

## 8. Rate grain

**Frozen (DF-A-29 / doc 47 §10). Not reopened.**

```text
DestinationPort.code + Incoterm.code + ContainerType.code
+ covering effective date (rateAsOfDate)
```

Carrier is **not** in the grain. Customer is **not** in the grain.

Formula (consumed in **B4-C**, specified here so the master grain is honest):

```text
line  = quantity[typeCode] × customerShipmentRate[dest, incoterm, type]
group = Σ lines
```

Example: confirmed result `2 × 40HQ + 1 × 20STD` for Alexandria + DAP requires **two** resolve calls (or one batch): `(ALEX, DAP, 40HQ)` and `(ALEX, DAP, 20STD)`. Missing either type is `RATE_NOT_FOUND` for that line — do not drop the type or substitute another type’s rate.

---

## 9. Effective-date semantics

**Calendar dates, not timestamps.**

Store `effectiveFrom` / `effectiveTo` as **dates without time**. `rateAsOfDate` is a date. Inquiry Date (B4-C default) is a date. Comparing `DateTime` midnights would create timezone false overlaps.

**Inclusive / inclusive (recommended, frozen for B4-B implementation):**

```text
covers(rateAsOfDate) ⇔
  effectiveFrom ≤ rateAsOfDate
  AND (effectiveTo IS NULL OR rateAsOfDate ≤ effectiveTo)
```

| Case | Result |
|------|--------|
| `effectiveTo = null` | Open-ended; covers every date ≥ `effectiveFrom` while `active` |
| Adjacent periods `01-Jan–31-Mar` and `01-Apr–30-Jun` | **No overlap** (31-Mar ≠ 01-Apr) |
| Same day on both ends `31-Mar` and `31-Mar` | **Overlap** |
| Open row + later-from row without closing the first | **Overlap** from the later `effectiveFrom` onward |

**Closing a period:** when inserting `01-Apr–30-Jun`, set the previous open row’s `effectiveTo` to `31-Mar` (day before). That write must run in one transaction with overlap re-check.

**Do not use half-open `[from, to)`** for this master. Freight rates are business calendar periods; inclusive end matches how Logistics will type `31-Mar`.

`rateAsOfDate` itself is a B4-C snapshot field (default Inquiry Date, always persisted). B4-B’s resolver **requires** an explicit date argument — it does not default, so the master layer never hides a missing as-of date.

---

## 10. RATE_NOT_FOUND

Applicable-rate selection input:

- `destinationPortCode`
- `incotermCode`
- `containerTypeCode`
- `rateAsOfDate`

Normalize codes (`trim` + `UPPER`) before match.

**Zero** active rows whose grain matches and whose dates cover `rateAsOfDate` → **`RATE_NOT_FOUND`**.

Also fail closed (do not coerce to zero) when:

- dest / incoterm / type / currency code is blank or unknown to its master (write path)
- `rateAmount` would be missing (rows with null amount are invalid and must not exist)

**Authoritative shipment-rate selection never writes 0 for a missing rate.**

VIP 0 + warning (DF-A-06 / B4-Q4) is a **later consumer / workflow** policy. It must not be implemented inside the master resolver. B4-C’s standard snapshot command is fail-closed (doc 47 default).

Inactive rate rows are treated as absent for matching (they do not count toward SELECT or AMBIGUOUS).

---

## 11. RATE_AMBIGUOUS

**More than one** active covering row for the same grain + `rateAsOfDate` → **`RATE_AMBIGUOUS`**.

Do **not**:

- pick latest `effectiveFrom`
- pick highest `priority` (no priority field)
- pick `isCurrent`
- pick first by `id` / insert order
- prefer the row with a non-null `effectiveTo`

Required example:

```text
Grain: Alexandria + DAP + 40HQ

Row A  01-Jan → 31-Jan   active
Row B  15-Jan → 15-Feb   active
```

For `rateAsOfDate = 20-Jan` → **`RATE_AMBIGUOUS`**. For `10-Jan` → SELECT A. For `10-Feb` → SELECT B.

B4-Q5 (carrier): even if a later increment adds optional carrier as a **display** field, two active covering rows for the same grain remain `RATE_AMBIGUOUS`. Carrier must not split the grain.

---

## 12. Write-time and read-time protection

Both are required.

### A. Write-time

On create / activate / change `effectiveTo` / reactivate:

1. Validate FKs: dest, incoterm, `ContainerType`, `CostingCurrency`.
2. Dest / incoterm / type must be `active` for **new** writes; currency `status = ACTIVE`.
3. `rateAmount > 0`.
4. `effectiveFrom` present; if `effectiveTo` set then `effectiveFrom ≤ effectiveTo`.
5. **Overlap scan** among **other `active` rows of the same grain** using inclusive-inclusive overlap:

```text
overlaps(A, B) ⇔
  A.effectiveFrom ≤ coalesce(B.effectiveTo, +∞)
  AND B.effectiveFrom ≤ coalesce(A.effectiveTo, +∞)
```

6. On overlap → `VALIDATION_FAILED` with issue code `RATE_OVERLAP` (write). Do not persist.

Deactivate is always allowed (removes the row from the matching set). Closing `effectiveTo` is allowed if the resulting range still does not overlap another active row.

### B. Read-time (resolver)

Even after write-time protection, imports, manual SQL, and race conditions can leave overlaps.

Resolver:

1. Load **active** rows for the grain.
2. Filter `covers(rateAsOfDate)`.
3. `0` → `RATE_NOT_FOUND`
4. `1` → `SELECT` (return the row; caller persists id + amount + currency + dates)
5. `>1` → `RATE_AMBIGUOUS`

Never “repair” by picking one.

Optional later hardening (not required to start B4-B): PostgreSQL `EXCLUDE` constraint on a daterange. Application checks remain mandatory.

---

## 13. Currency boundary

- `ShippingCostRate.currencyCode` → **`CostingCurrency.code`** (existing governed currency master).
- Store **native** `rateAmount` + native currency only.
- **No FX in B4-B.** Do not read `CostingExchangeRate`. Do not call `costingEngine.ts`.
- Inquiry commercial currency may differ. Conversion is a later costing/commercial **input** boundary (DF-A-20).
- New rate writes require `CostingCurrency.status = ACTIVE`.
- Do not create a second currency table.

B4-C will copy native amount + currency onto the snapshot line. FX, if any, happens downstream of the snapshot.

---

## 14. Historical rate behavior

Rates are **append-only as business facts**.

Example that must remain two rows:

```text
ALEX + DAP + 40HQ   01-Jan–31-Mar   900 USD   active
ALEX + DAP + 40HQ   01-Apr–30-Jun   950 USD   active
```

- `rateAsOfDate = 15-Feb` → SELECT first row.
- `rateAsOfDate = 15-Apr` → SELECT second row.
- Changing April’s amount later does **not** rewrite the January row.
- B4-C snapshot stores `shippingCostRateId` plus copied amount, currency, and effective dates so live master edits never rewrite issued proof.

Deactivating the April row does not delete it. Dated lookup simply stops selecting it (`RATE_NOT_FOUND` if nothing else covers).

---

## 15. RBAC

**B4-Q3 (doc 47):** B4-A reused `LOGISTICS:CONTAINER_STUDY:*`. That is **not** acceptable for freight-rate writes.

`CONTAINER_STUDY:CREATE` authors packing studies. `CONTAINER_MASTER:MANAGE` versions box dimensions. Costing permissions own metal/config. None of those is “set Alexandria DAP 40HQ = $X”.

**Decision for B4-B implementation: introduce dedicated permissions. Do not reuse Container Study manage for rates.**

| Code | Meaning |
|------|---------|
| `LOGISTICS:SHIPMENT_COST:VIEW` | Read Destination Port, Incoterm, Shipping Cost Rate, and call resolve (internal) |
| `LOGISTICS:SHIPMENT_COST:MANAGE` | Create/update/activate/deactivate ports, incoterms, and rates |

Fold port/incoterm maintenance into `SHIPMENT_COST:*` so B4-B does not explode the catalog with four extra resources. Split later only if a port-steward role must exist without rate-edit.

**Customers:** no `VIEW`, no `MANAGE`. They do not browse the rate master. They will see **snapshot** shipment totals on commercial documents later (not B4-B).

**Temporary reuse of `CONTAINER_STUDY:VIEW` for rate reads:** **not recommended.** Add the two codes in the same B4-B increment as the APIs (B4-D-with-B, as doc 47 already allows).

SYSTEM_ADMINISTRATOR continues to receive the full catalog. Logistics maintainer roles that should own rates get `SHIPMENT_COST:MANAGE`; study-only roles do not.

---

## 16. Audit

**Authority:** `AuditEvent` via `appendServerAudit` (`AUTHORITATIVE_SERVER_AUDIT`, doc 23). Client `auditLogService` / localStorage is `LEGACY_TELEMETRY` only.

| Action | When |
|--------|------|
| `SHIPPING_COST_RATE_CREATED` | Insert |
| `SHIPPING_COST_RATE_UPDATED` | Notes / non-identity fields |
| `SHIPPING_COST_RATE_ACTIVATED` | `active` false → true |
| `SHIPPING_COST_RATE_DEACTIVATED` | `active` true → false |
| `SHIPPING_COST_RATE_DATES_CHANGED` | `effectiveTo` (or allowed date) change |
| `DESTINATION_PORT_CREATED` / `UPDATED` / `ACTIVATED` / `DEACTIVATED` | Port master |
| `INCOTERM_CREATED` / `UPDATED` / `ACTIVATED` / `DEACTIVATED` | Incoterm master |

`entity` / `entityId` = the row. `oldValue` / `newValue` JSON must include grain, amount, currency, dates, and `active` so a rate-amount change cannot happen unaudited.

No client-only audit for these mutations.

---

## 17. Data-quality / import considerations

Import is **not** implemented in B4-B. When it is authorized, validation must be the same as API writes (fail closed, row-level issues). Minimum checks:

| Defect | Issue (illustrative) |
|--------|----------------------|
| Unknown / blank destination code | `DESTINATION_PORT_NOT_FOUND` |
| Inactive destination on **new** rate | `DESTINATION_PORT_INACTIVE` |
| Unknown / blank incoterm | `INCOTERM_NOT_FOUND` |
| Inactive incoterm on new rate | `INCOTERM_INACTIVE` |
| Unknown container type code | `CONTAINER_TYPE_NOT_FOUND` |
| Inactive container type on new rate | `CONTAINER_TYPE_INACTIVE` |
| Unknown / inactive currency | `CURRENCY_NOT_FOUND` / `CURRENCY_INACTIVE` |
| Missing, zero, or negative `rateAmount` | `INVALID_RATE_AMOUNT` |
| `effectiveFrom` after `effectiveTo` | `INVALID_DATE_RANGE` |
| Overlap with existing **or in-file** active row of same grain | `RATE_OVERLAP` / `RATE_AMBIGUOUS` |
| Grain codes not normalized uniquely (`alex` vs `ALEX`) | Normalize then treat as same grain |

Partial import: reject the overlapping/invalid rows; do not skip overlap by “keeping the last spreadsheet row”. File-internal overlaps are `RATE_AMBIGUOUS` / `RATE_OVERLAP` before any insert.

---

## 18. B4-B / B4-C boundary

| | B4-B | B4-C |
|--|------|------|
| What | Governed masters + `resolveApplicableRate` | Immutable `ShipmentCostSnapshot` bound to **CONFIRMED** `ContainerStudyResult` |
| Inputs | dest, incoterm, type, **explicit** `rateAsOfDate` | Confirmed result quantities + group dest/incoterm + as-of (default Inquiry Date, **persisted**) |
| Outputs | Rate row or `RATE_NOT_FOUND` / `RATE_AMBIGUOUS` | Snapshot header + per-type lines (rate id, copied amount/currency/dates, qty, line total, group total) |
| Mutability | Rate rows historically retained; amount immutable | Snapshot immutable; live master changes never rewrite it |

**B4-B does not:**

- create shipment snapshots
- calculate inquiry or quotation totals
- modify `CostingRun` or `costingEngine.ts`
- perform FX
- modify quotation / pricing / Financial Offer
- integrate D365
- add UI (unless separately authorized)
- mutate B4-A group identity
- recapture Container Study snapshots

B4-C **calls** the B4-B resolver; it does not reimplement matching. Snapshot lines pin `shippingCostRateId` plus copied commercial facts (doc 47 §12).

---

## 19. Non-goals

- Costing V2 freeze files, Decision 5, metal premiums/shipping/clearance
- Pricing, Quotation, Financial Offer, inquiry total presentation (DF-A-31/35)
- D365 / ERP
- Container Study algorithm, Forklifting, Excel parity, 6100
- Customer-specific rates
- Carrier as matching dimension
- FX conversion
- `CALCULATED` study status
- Auto-forming groups from header text
- Commercial per-line destination field (later increment)
- Full Country / geography master
- A second Destination Port or Incoterm master (Customer / Inquiry / costing)
- Matching dest, incoterm, container type, or currency by display name
- Shipping Cost admin UI (unless separately authorized)
- Excel import implementation
- Reuse of `CostingLogisticsRule` / `CostingMetalCostComponent.SHIPPING` / `DEFAULT_INCOTERM_CHARGE_PERCENT`

---

## 20. Open decisions

Doc 47 D1/D2 and grain A remain closed. B4-Q4 (VIP 0) remains a **consumer** rule, not B4-B.

| ID | Question | Default if unanswered at implementation |
|----|----------|------------------------------------------|
| **B4-B-Q1** | When does `ContainerShipmentGroup.destinationPortCode` / `incotermCode` become a Prisma FK to these masters? | **Semantic identity closed in §3.1:** those fields are canonical codes owned by `DestinationPort` / `Incoterm`. **Prisma FK is not in B4-B** (B4-A schema frozen). Groups keep string columns. B4-C looks up by code; unknown code → fail closed. FK alignment is a later increment. |
| **B4-B-Q2** | Country table vs ISO alpha-2 on the port? | **ISO alpha-2 string** on `DestinationPort`. No Country entity. |
| **B4-B-Q3** | Store optional carrier/transit on the rate row? | **Omit in B4-B.** Notes only. Carrier must never affect matching (B4-Q5). |
| **B4-B-Q4** | May `rateAmount` be edited in place if never snapshotted? | **No.** Close/deactivate + insert. One invariant. |
| **B4-B-Q5** | PostgreSQL `EXCLUDE` daterange in v1? | **Application overlap check required.** DB exclude optional hardening. |
| **B4-B-Q6** | Who seeds Incoterm and first ports? | Implementation seed of ICC codes + Energya working ports; empty master is valid, resolve then `RATE_NOT_FOUND`. |
| **B4-B-Q7** | Date timezone / company calendar? | **Date-only**, no time. Interpret Inquiry Date and `rateAsOfDate` as calendar dates (UTC date or company date stored without time — pick one in implementation and persist consistently). |

No remaining question reopens grain A, metal vs customer shipment, or “pick latest on overlap”.

---

## 21. Implementation acceptance criteria

Authorized only **after** this document is approved. Scope = **B4-B only**.

1. `DestinationPort` and `Incoterm` masters exist; codes unique and normalized; inactive blocks **new** rate writes.
2. `ShippingCostRate` grain is dest + incoterm + `ContainerType.code`; amount > 0; currency → `CostingCurrency`; dates inclusive/inclusive; `effectiveTo` null = open.
3. No `CostingLogisticsRule`, `CostingMetalCostComponent.SHIPPING`, or `DEFAULT_INCOTERM_CHARGE_PERCENT` reuse.
4. No second container-type master; rate key is `ContainerType.code`.
5. Write-time overlap rejected (`RATE_OVERLAP`).
6. Resolver: 0 → `RATE_NOT_FOUND`; 1 → SELECT; >1 → `RATE_AMBIGUOUS` (Alexandria DAP 40HQ Jan vs mid-Jan example).
7. Historical periods remain as separate rows; amounts not overwritten in place.
8. No FX; native currency only.
9. Missing rate is not stored as zero.
10. Permissions `LOGISTICS:SHIPMENT_COST:VIEW` and `:MANAGE`; customers cannot view or manage; Container Study permissions are not used for rate writes.
11. Server `AuditEvent` for create / update / activate / deactivate / date change.
12. No snapshot, costing, pricing, quotation, D365, or UI unless separately authorized.
13. B4-A tests remain green; Costing V2 freeze files untouched.
14. This document remains the B4-B spec; do not contradict it in code comments or APIs.
15. Canonical-code / shared-master rule (§3.1): dest, incoterm, container type, and currency match **only** by normalized master code; no second Port or Incoterm master; display names are never grain keys.

**Stop.** Do not implement B4-B until this design is reviewed and explicitly approved. Do not start B4-C.
