# D365 F&O Quote-to-Cash — Phase 1 Domain Model Gap Analysis

| | |
|---|---|
| **Spec** | [`D365_FO_QUOTE_TO_CASH_INTEGRATION_SPECIFICATION.md`](./D365_FO_QUOTE_TO_CASH_INTEGRATION_SPECIFICATION.md) v1.0 (2026-08-31) |
| **Phase in scope** | Spec §36 Phase 1 — Domain Model + standalone fulfillment APIs |
| **Baseline** | Phase 1 + Direct MTS exception — **FROZEN** 2026-08-31 |
| **Out of scope** | Live D365, Phase 2–7 full UI/integration, invoice/AR/payment sync |
| **Date** | 2026-08-31 |
| **Verdict** | **Phase 1 standalone commercial fulfillment FROZEN.** Three Sales Order entry points: MTO Quotation, MTO Agreement Release, and Direct MTS. D365 remains `NOT_IMPLEMENTED` / `NOT_SENT`. Freeze note: [`PHASE1_QUOTE_TO_CASH_FREEZE.md`](./PHASE1_QUOTE_TO_CASH_FREEZE.md). |

---

## 1. Executive summary

Phase 1 of the approved D365 quote-to-cash spec requires Energya domain models for Quotation, Revision, Line, Approval, Commercial Commitment, Sales Order, Sales Agreement, and Agreement Release — **with no live D365**.

**Business exception (frozen):** Sales Orders have **three** entry points — not everything must go through quotation:

```text
1. MTO — Quotation → Approved QT → Commercial Commitment → Direct Sales Order
2. MTO — Agreement → Approved QT → Commitment → Sales Agreement → Release → Sales Order
3. MTS — Direct Sales Order — NO quotation, NO Commercial Commitment

DIRECT_MTS → Sales Order (no Commercial Commitment)
APPROVED QUOTATION → Commercial Commitment → SO / Agreement
```

**Implemented:**

- Commercial approval (separate from Increment 12 pricing approval) with `FulfillmentType` (`DIRECT_ORDER` | `SALES_AGREEMENT`)
- `CommercialCommitment`, `EpcSalesOrder` / `EpcSalesOrderLine`, `SalesAgreement` / `SalesAgreementLine`, `AgreementRelease` / `AgreementReleaseLine`
- **Order Origin** on SO (`QUOTATION` | `AGREEMENT_RELEASE` | `DIRECT_MTS`) — separate from fulfillment mode
- **Order Fulfillment Mode** on SO (`MTO` | `MTS`) — separate from origin
- **Cable Fulfillment Policy** on `CableMaster` (`MTO` | `MTS` | `MTO_MTS`) — Direct MTS only when MTS-eligible
- Domain services + Express APIs under `/api/commercial-commitments`, `/api/sales-orders`, `/api/sales-agreements`, `/api/agreement-releases`
- `POST /api/sales-orders/direct-mts` for MTS stock path without commitment
- Remaining-qty validation on releases; snapshot copy; immutability; idempotent duplicate creates
- Minimal UI on inquiry quotation tab (`CommercialFulfillmentPanel`)
- Adapters stay `NOT_IMPLEMENTED`; new documents default `integrationStatus = NOT_SENT`

**Costing V2 freeze (Decision 5 pending):** Direct RM metal price logic, `CostingMetalCostComponent` semantics, and `costingEngine.test.ts` were **not** changed.

---

## 2. Spec Phase 1 checklist (§36) vs current platform

| Spec Phase 1 entity / capability | State | Evidence |
|----------------------------------|-------|----------|
| **Quotation** | EXISTS | `CommercialQuotation` + commercial approval fields |
| **Quotation Revision** | EXISTS | Row-per-revision; approved revision immutable; `createQuotationRevision` resets commercial approval |
| **Quotation Line** | EXISTS (enriched) | Snapshot fields for SO copy (config/eng/BOM/drum/cutting) |
| **Approval** | EXISTS | Pricing (Inc 12) + commercial (`POST .../approve-commercial`) with fulfillment choice |
| **Commercial Commitment** | EXISTS | Required for quotation / agreement paths; **not** required for `DIRECT_MTS` |
| **Sales Order (EPC)** | EXISTS | `EpcSalesOrder` + lines; nullable commitment/quotation for Direct MTS |
| **Sales Agreement** | EXISTS | Header/line + from-quotation API |
| **Agreement Release** | EXISTS | Release + lines → EPC SO; remaining qty gates |
| **Order Origin / Fulfillment Mode** | EXISTS | Separate enums on `EpcSalesOrder` |
| **Cable Fulfillment Policy** | EXISTS | `CableMaster.fulfillmentPolicy` |
| **Direct MTS SO** | EXISTS | `POST /api/sales-orders/direct-mts` |
| **Fulfillment type** | EXISTS | `FulfillmentType` enum on quotation + commitment (quotation path choice) |
| **D365 integration** | NOT_IMPLEMENTED (correct) | `d365Adapters.ts`; HTTP stub `NOT_CONNECTED` |

---

## 3. Status mapping (project conventions)

| Concern | Implementation |
|---------|----------------|
| Commercial approval | `CommercialApprovalStatus`: NOT_SUBMITTED / PENDING_APPROVAL / APPROVED / REJECTED |
| Commitment | DRAFT / ACTIVE / COMPLETED / CANCELLED (`COMPLETED` ≈ fulfilled) |
| EPC SO | DRAFT / CONFIRMED / CANCELLED + `EpcIntegrationStatus` (NOT_SENT…) |
| Order Origin | `SalesOrderOrigin`: QUOTATION / AGREEMENT_RELEASE / DIRECT_MTS |
| Order Fulfillment Mode | `OrderFulfillmentMode`: MTO / MTS |
| Cable policy | `CableFulfillmentPolicy`: MTO (block Direct SO) / MTS / MTO_MTS |
| Agreement / release | ACTIVE→COMPLETED; release CONFIRMED |
| Pricing vs commercial | Kept separate; commercial approve requires `PRICING_APPROVED` |

---

## 4. APIs (Phase 1)

| Method | Path |
|--------|------|
| POST | `/api/quotations/:id/approve-commercial` |
| POST | `/api/quotations/:id/commitments` |
| GET/POST | `/api/commercial-commitments` |
| POST | `/api/commercial-commitments/:id/sales-orders` |
| POST | `/api/commercial-commitments/:id/sales-agreements` |
| GET | `/api/sales-orders`, `/api/sales-orders/:id` |
| POST | `/api/sales-orders/from-quotation/:quotationRevisionId` |
| POST | `/api/sales-orders/direct-mts` |
| GET | `/api/sales-agreements`, `/api/sales-agreements/:id` |
| POST | `/api/sales-agreements/from-quotation/:quotationRevisionId` |
| GET/POST | `/api/sales-agreements/:id/releases` |
| GET | `/api/agreement-releases/:id` |

RBAC: sales manage fulfillment (`assertCanManageQuotations`); commercial approve via `assertCanApproveCommercialQuotation`; **customers cannot create SO/agreement or Direct MTS**. Restart Express after adding routes.

---

## 5. Tests

`src/server/phase1.quoteToCash.test.ts` covers:

- A–K: direct order, agreement, multi-release, over-release, immutability, new revision, snapshot independence, duplicate SO/release, D365 independence
- L–N: Direct MTS without commitment; MTO-only reject; MTS / MTO_MTS allow; drum/cutting; `orderOrigin=DIRECT_MTS`; idempotency; D365 NOT_IMPLEMENTED; customer blocked

---

## 6. Explicit non-goals (unchanged)

Live D365 HTTP/OData, invoice/AR/payment, delivery sync, integration queue, full ERP UX, costing engine / Decision 5 changes, live inventory reservation for MTS.

---

## 7. Scorecard (post Phase 1 + Direct MTS)

| Capability | State |
|------------|--------|
| Inquiry / Quotation / Versioning | EXISTS |
| Pricing approval (Inc 12) | EXISTS |
| Commercial approval + fulfillment | EXISTS |
| Commercial Commitment | EXISTS (not required for Direct MTS) |
| EPC Sales Order + snapshot | EXISTS |
| Direct MTS Sales Order | EXISTS |
| Sales Agreement + Release | EXISTS |
| Order Origin / Fulfillment Mode | EXISTS |
| Minimal fulfillment UI | EXISTS (quotation paths; Direct MTS via API) |
| D365 live | NOT_IMPLEMENTED |

---

## 8. Next steps

1. ~~Phase 1 gap analysis~~
2. ~~Phase 1 standalone implementation~~ → **done**
3. ~~Direct MTS exception~~ → **done**
4. ~~Freeze / commit Phase 1~~ → **FROZEN 2026-08-31** ([`PHASE1_QUOTE_TO_CASH_FREEZE.md`](./PHASE1_QUOTE_TO_CASH_FREEZE.md))
5. **Next:** UI refinement + operational workflow for the three fulfillment paths (not D365)
6. Later: live D365 posting (Phase 5+) — **do not start without explicit approval**; ERP work continues in parallel

---

*Updated 2026-08-31 — Phase 1 frozen after pre-freeze gate validation.*
