# 15 — Number Sequence Service

**Code:** `src/server/numberSequenceService.ts`  
**Model:** `NumberSequence`  
**API:** `GET/POST /api/v2/number-sequences`, `POST /api/v2/number-sequences/:code/allocate`

## Capabilities

- code, name, prefix, format (`{PREFIX}{YY}-{#####}`), nextSerial, active, scopeType/scopeValue, moduleId
- Concurrency-safe allocate via transaction
- Auditable (`AuditEvent` on upsert/allocate)

## Costing wrap (do not break)

Prefixes **SC / FM / FX** continue to use `CostingDocumentSequence` via `allocateNextCostingDocumentCode`. Platform allocate **delegates** — does not dual-increment.

Commercial inquiry numbers (`INQ-` stamp+random) unchanged in Task 02 (documented gap for later sequence cutover).
