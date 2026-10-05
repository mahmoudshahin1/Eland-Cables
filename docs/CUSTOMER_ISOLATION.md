# Customer isolation (Increment 12 B2)

Customer commercial access is derived **only** from the authenticated identity and its `CustomerUser` assignments. The server never treats `customerId` from the HTTP body, query string, URL path, or frontend state as proof of ownership.

## Canonical scope

1. JWT is hydrated from `UserAccount`.
2. Active `CustomerUser` rows load `Customer.id` and `Customer.code`.
3. Match keys for a **resolved** customer actor (exactly one active `CustomerUser`) include:
   - user id and email
   - legacy `UserAccount.customerId` string
   - that `Customer.id` and `Customer.code`
4. Zero or multiple active assignments: commercial APIs return **403 CONFIGURATION_REQUIRED**. No union of customers for `CUSTOMER_USER`.
5. `CommercialInquiry.customerId` remains a **string** for history. `customerMasterId` is the optional FK to `Customer`.

## Customer users

| Action | Rule |
|---|---|
| List inquiries/quotations | Filter by match keys / `customerMasterId`. Query `customerId` is ignored. |
| Get by URL id | `assertCanAccessInquiryOwnership` using match keys. Other customers → **403**. |
| Create inquiry | Body `customerId` is ignored. Scope is the single assigned customer. |
| Assign to a customer | Requires `ADMIN / CUSTOMER_USER / ASSIGN` or `CREATE`. Customer user type is always denied. |
| Customer master | Requires `ADMIN / CUSTOMER / *`. Customer users cannot create, update, or activate. |

## Internal users

Internal users with commercial permissions may read inquiries and quotations across customers. They do **not** automatically receive customer-master administration. Sales (`SALES_MANAGER`) can open Customer A and Customer B commercial records; they cannot POST `/api/admin/customers` unless they also have customer-admin permissions.

## Historical strings

Existing `CommercialInquiry.customerId` / `CommercialQuotation.customerId` values are **not deleted** and are not rewritten. `reconcileCommercialCustomerMasters()` sets `customerMasterId` only when the mapping is unique (Customer id/code, or a single UserAccount with a single active assignment). Otherwise a `CustomerMigrationException` is stored.

## What this does not change

Costing formulas, BOM governance, Cable Authority, raw material price governance, quotation versioning, Technical Office, and the commercial pricing engine are unchanged.
