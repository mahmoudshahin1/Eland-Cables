# Testing strategy

## Current runner
`npm test` — Node test runner via `tsx --test`.

## Increments
Each domain increment adds tests next to the service (`*.test.ts`).

## Must not regress (manual + existing tests)
- Login (customer ELAND, internal admin)
- Approved UI: logo, white theme, font scale, **no** date/clock header bar, **no** login navy promo panel
- Configurator, inquiry/quotation home, Import Center, drum details (prototype reel types)

## Increment 1 coverage
- DomainError codes
- Audit append-only
- D365 adapters return `NOT_IMPLEMENTED`

## Increment 5 coverage
- Mapping PARTIAL vs COMPLETE vs Suggested-not-approved
- BOM conflict register preserved; invalid classification rejected
- Official structured evaluate → CONFIGURATION_REQUIRED
- Material unique; item/customer not unique
- Blank RM price ≠ 0
- Official Cable List probe (`DATA_REQUIRED` when absent)
- Cable import: required fields, duplicate material, invalid parameter reference, PostgreSQL persist, search, Tests A–D on **fixture** data
- BOM FK, duplicate-weight skip, versioned unique key unchanged
- RM CRUD, duplicate code, price history, blank ≠ 0
- Customer cannot import master data

## Increment 3 coverage
- EXISTING_CABLE / TECHNICALLY_VALID_NOT_MASTER / INVALID_CONFIGURATION / CONFIGURATION_REQUIRED
- Customer cannot write Cable Master
- Internal search/evaluate against PostgreSQL
- V1 constraint engine regression
