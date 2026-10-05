# Quotation Versioning & Immutability Architecture (Increment 11)

## Non-Destructive Versioning Model

Quotation revisions are strictly non-destructive and immutable:

```
[Quotation QUO-2026-8841 V1] (status: OPEN, isCurrent: true)
               │
               │ (Customer updates quantity or terms)
               ▼
[Quotation QUO-2026-8841 V1] (status: SUPERSEDED, isCurrent: false, immutable)
               │
               ▼
[Quotation QUO-2026-8841 V2] (status: OPEN, isCurrent: true, supersedes: V1)
```

---

## 1. Rules for Quotation Revision

1. **Immutable Historical Records**: The previous version (V1) is never overwritten, edited, or physically deleted. Its status is updated to `SUPERSEDED`, and `isCurrent` is set to `false`.
2. **Version Sequence**: Every revision increments `versionNo = previous.versionNo + 1`.
3. **Compound Natural Key**: PostgreSQL enforces uniqueness on `@@unique([quotationNumber, versionNo])`.
4. **Audit Logging**: Creating a revision writes an immutable `AuditEvent` (`QUOTATION_VERSION_CREATED`) linking the predecessor quotation ID and new version number.
5. **Frozen Line Items**: Each version maintains its own distinct `CommercialQuotationLine` rows with frozen material costs, quantities, and lengths.
