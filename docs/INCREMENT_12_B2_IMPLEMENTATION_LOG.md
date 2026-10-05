# Increment 12 B2 — Implementation log

**Date:** 2026-08-20  
**Stage:** B2 — Customer Master & Customer–User Linkage  
**Status:** Implemented. B3–B6 not started.

## Pre-change inspection

- B1 identity: `UserAccount`, JWT hydrate, `ADMIN / USER|ROLE|PERMISSION|SECURITY`.
- `UserAccount.customerId` was a string tenant key (`c-eland`).
- `CommercialInquiry.customerId` / `CommercialQuotation.customerId` are strings (often user ids). Isolation compared `actor.customerId || actor.id || actor.email`.
- Customer create-inquiry ignored body `customerId` for `userType === 'customer'` (used actor id).
- List routes for customers used `actor.id || actor.email` but still named the variable from query internally.
- No `Customer` / `CustomerUser` models.
- Pricing engine `customerId` on rules remains a string and was **not** modified.

## Implementation

- Added governed `Customer` and `CustomerUser`, optional `customerMasterId` FKs, `CustomerMigrationException`.
- Permissions: `ADMIN / CUSTOMER / VIEW|CREATE|UPDATE|ACTIVATE` and `ADMIN / CUSTOMER_USER / VIEW|CREATE|UPDATE|ASSIGN`.
- `RequestActor` gains `customerScopeKeys`, `customerMasterIds`, `customerCode` from DB hydrate.
- Isolation never trusts client `customerId` for customer actors.
- Administration UI: Customers + Customer users (list/search/filter/create/edit/activate/assign/audit), EN/AR toggle.
- Seed links `david.smith@elandcables.com` to `C-ELAND` without inventing extra commercial companies.
- Migration links `customerMasterId` only with unique evidence; otherwise documents an exception.

## Stop

B3 (low-code), B4–B6, dashboards, and pricing-engine changes were not started.

B2.1 session/`sid` hardening is documented in `docs/INCREMENT_12_B2_1_SECURITY_HARDENING.md`.
