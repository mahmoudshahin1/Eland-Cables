# Raw Material Price Approval Workflow & State Machine (Increment 9)

## Workflow Diagram

```
[DRAFT] ───► (Submit) ───► [SUBMITTED] ───► (Review) ───► [UNDER_REVIEW] ───► (Approve) ───► [APPROVED]
  ▲                           │                                  │                               │
  │                           ▼                                  ▼                               ▼
  └────────────────── (Reject / Return) ◄────────────────── [REJECTED]                       [EXPIRED]
```

## State Definitions & Transitions

1. **`DRAFT`**: Created by Procurement / Finance. Non-authoritative proposal.
2. **`SUBMITTED`**: Formally submitted for Technical Office / Costing management review.
3. **`UNDER_REVIEW`**: Active review by authorized pricing authority.
4. **`APPROVED`**: Signed off by Technical Office Manager / Pricing Authority. Overlaps are strictly checked prior to approval (`PRICE_PERIOD_OVERLAP`).
5. **`REJECTED`**: Returned for pricing correction with mandatory audit feedback.
6. **`EXPIRED`**: Approved price whose `effectiveTo` timestamp has elapsed relative to the target costing date.
7. **`CANCELLED`**: Revoked draft proposal.

### Audit Trail
Every workflow transition creates an immutable `AuditEvent` entry recording:
- `actorId`, `actorName`, `timestamp`, `entity` (`RawMaterialPrice`), `entityId` (`priceId`), `action` (`CREATE`, `SUBMIT`, `REVIEW`, `APPROVE`, `REJECT`), `oldValue`, `newValue`, and `comment`.
