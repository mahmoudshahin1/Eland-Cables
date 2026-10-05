# BOM Conflict Decision Model (Increment 8)

## State Machine & Investigation Workflow

```
[BUSINESS_DECISION_REQUIRED] 
            │
            ▼
        [ASSIGNED]
            │
            ▼
      [UNDER_REVIEW] 
            │
            ▼
    [DECISION_REQUIRED]
            │
            ▼
        [RESOLVED] ─── (Manager Approval) ───► [APPROVED] ──► GovernedBomLine Created
            │                                     │
            ▼                                     ▼
        [REJECTED] ◄────────────────────── (Reopen / Reject)
```

### Transition Validation Rules

1. **Start Review**: Moves from `BUSINESS_DECISION_REQUIRED` / `ASSIGNED` to `UNDER_REVIEW`. Records the investigating engineer and timestamp.
2. **Resolve**: Requires validation of all mandatory evidence according to the chosen category. Blocks transition if required dimensions (Plant, BOM Version, Route, Effective Date) are missing.
3. **Approve**: Only executable by an authorized Technical Office Manager. Checks that a governed weight is explicitly specified, transitions status to `APPROVED`, creates/updates the authoritative `GovernedBomLine`, and records an immutable `AuditEvent`.
4. **Reject**: Returns decision for correction with required notes.
5. **Reopen**: Reopens an approved decision back to `UNDER_REVIEW` and marks governed BOM lines as non-authoritative (`UNDER_REVIEW`).
