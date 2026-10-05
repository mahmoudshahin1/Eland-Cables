# RBAC permission model (Increment 12 B1)

## Data model

| Table | Purpose |
|---|---|
| `Permission` | Controlled catalog triples `module` + `resource` + `action` (unique). |
| `Role` | Data-driven role (`code`, `name`, `description`, `isActive`). System roles are seeded, not immutable policy. |
| `RolePermission` | Assignment of catalog permissions to a role (composite PK). |
| `UserRole` | Assignment of roles to users. `Role` delete is **RESTRICT** while users reference it — deactivate instead. |

Administrators cannot invent permission strings. `PUT /api/admin/roles/:id/permissions` rejects triples that are not in `PERMISSION_CATALOG` / seeded `Permission` rows.

## Engine

```ts
hasPermission(actor, module, resource, action)
requirePermission(actor, module, resource, action) // DomainError UNAUTHORIZED
```

- `401` when the actor is not signed in (`Sign in is required`).
- `403` when signed in but missing the permission.

Frontend visibility is not authorization. Every B1 admin route calls `requirePermission`. Existing business routes keep Increment 1–11 `assert*` helpers.

## Compatibility adapter

Increment 1–11 tests and JWT tokens still use module booleans (`costingPricing`, `salesQuotations`, …).

`src/server/rbac.ts`: if `permissionCodes.length > 0` (hydrated DB user), **granular** permission is required. Otherwise legacy flags apply (missing object still allows internal test actors; explicit `false` denies).

`src/domain/rbacEngine.ts` `hasPermission` for admin APIs: granular codes first; if none, map legacy `userManagement` (etc.) via `LEGACY_TO_GRANULAR`.

| Legacy flag | Granular triples (any match grants the flag on login DTO) |
|---|---|
| `userManagement` | `ADMIN:USER:*`, `ADMIN:ROLE:*`, `ADMIN:PERMISSION:VIEW`, `ADMIN:SECURITY:VIEW` |
| `masterData` | `CABLE:CABLE_MASTER:*`, `RAW_MATERIAL:RAW_MATERIAL:*` |
| `technicalOffice` | `BOM:BOM_CONFLICT:*`, `ENGINEERING:MAPPING:*` |
| `costingPricing` | `COSTING:COSTING_RUN:*`, `PRICE:RAW_MATERIAL_PRICE:*`, `COMMERCIAL:PRICING_RULE:*` |
| `salesQuotations` | `COMMERCIAL:INQUIRY:*`, `COMMERCIAL:QUOTATION:*` |
| `ordersProduction` | `PRODUCTION:ORDER:VIEW` |
| `financeCollections` | `FINANCE:COLLECTION:VIEW` |
| `reportsAnalytics` | `REPORT:REPORT:VIEW` |
| `overview` | `REPORT:DASHBOARD:VIEW` |
| `customerPortalAccess` | `COMMERCIAL:INQUIRY:VIEW/CREATE` |

## Initial roles (seed data, not frozen policy)

SYSTEM_ADMINISTRATOR, TECHNICAL_OFFICE_ENGINEER, TECHNICAL_OFFICE_MANAGER, SALES_REPRESENTATIVE, SALES_MANAGER, PROCUREMENT_USER, PROCUREMENT_MANAGER, FINANCE_USER, FINANCE_MANAGER, COSTING_USER, COSTING_MANAGER, CUSTOMER_USER, REPORT_VIEWER, AUDITOR.

`SYSTEM_ADMINISTRATOR` currently receives **all catalog permissions** as a development convenience so the control plane can be administered. Least-privilege splitting of that role is a later hardening step, not B2 product scope.

## Privilege protections

- Last active `SYSTEM_ADMINISTRATOR` cannot be deactivated, locked, or stripped of the role.
- Users cannot assign roles to **themselves**.
- Granting `SYSTEM_ADMINISTRATOR` requires the actor to already hold that role (vertical escalation control).
- Customer isolation (`assertCanAccessInquiryOwnership`) plus B2.1 single-customer scope (`assertCustomerBusinessScope`). Session validity is required before RBAC for database users.

## Architectural boundary

Identity/RBAC is the **platform control plane**. Cable Master, BOM, costing, commercial, and integrations stay in governed business services. Do not move pricing or costing rules into RBAC.
