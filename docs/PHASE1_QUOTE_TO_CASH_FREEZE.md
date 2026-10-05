# Phase 1 Quote-to-Cash — Freeze Notice

| | |
|---|---|
| **Status** | **FROZEN** (2026-08-31) |
| **Scope** | Standalone commercial fulfillment domain + APIs |
| **Gate** | Pre-freeze validation passed (`npm test` 564/564, `tsc --noEmit` clean) |

## What is frozen

Phase 1 standalone EPC commercial fulfillment:

1. **MTO Quotation** → Commercial Commitment → Sales Order (`orderOrigin=QUOTATION`, `orderFulfillmentMode=MTO`)
2. **MTO Agreement** → Commitment → Sales Agreement → Release → Sales Order (`orderOrigin=AGREEMENT_RELEASE`, `orderFulfillmentMode=MTO`)
3. **Direct MTS** → Sales Order without quotation or Commercial Commitment (`orderOrigin=DIRECT_MTS`, `orderFulfillmentMode=MTS`; cable policy `MTS` or `MTO_MTS` only)

Business integrity locked: MTO cannot bypass quotation/approval; MTS eligibility is server-side; snapshots/immutability/idempotency/remaining-qty; drum+cutting on all three paths; `orderOrigin` and `orderFulfillmentMode` remain independent.

## Explicitly not in this freeze

- **D365 F&O** remains `NOT_IMPLEMENTED` / `NOT_SENT` / `NOT_CONNECTED` (ADR-004). ERP implementation continues in parallel and must not be assumed available by Phase 1 code.
- Costing V2 / Decision 5 metal logic (separate freeze).

## Next phase (authorized direction)

**UI + operational workflow** for the three fulfillment paths — **in progress** (not live D365 posting).

- Internal Sales Orders tab → fulfillment workspace (orders, agreements, Direct MTS)
- Quotation panel → confirm before Direct SO / Sales Agreement
- Domain rules remain frozen; D365 stays `NOT_IMPLEMENTED` / `NOT_SENT`
- After UI stabilize → revisit D365 when ERP is ready (not this phase)

Do not expand Phase 1 domain scope without an explicit new phase approval.

See: [`D365_FO_QUOTE_TO_CASH_PHASE1_GAP_ANALYSIS.md`](./D365_FO_QUOTE_TO_CASH_PHASE1_GAP_ANALYSIS.md), [`KNOWN_LIMITATIONS.md`](./KNOWN_LIMITATIONS.md).
