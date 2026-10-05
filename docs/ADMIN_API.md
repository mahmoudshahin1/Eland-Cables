# Admin & auth API (Increment 12 B1 + B2)

All `/api/admin/*` routes require a Bearer JWT. Missing actor → **401**. Missing permission → **403**.

Safe user DTOs never include `passwordHash`. Customer APIs never accept request `customerId` as proof of ownership for customer users.

## Auth

| Method | Path | Notes |
|---|---|---|
| POST | `/api/auth/login` | Persistent user, bcrypt, lockout, JWT |
| POST | `/api/auth/refresh-token` | Rotates refresh session |
| GET | `/api/auth/me` | Hydrated user DTO |
| POST | `/api/auth/reset-password` | `{ token, newPassword }` |
| POST | `/api/auth/forgot-password` | Generic message; no email token in B1 |
| POST | `/api/auth/register` | Always 403 |
| GET | `/api/auth/roles` | Active roles (login UI) |

## Users (`ADMIN / USER / *`)

| Method | Path | Permission |
|---|---|---|
| GET | `/api/admin/users` | VIEW — query: `q`, `status`, `userType`, `department`, `customerId`, `role`, `sort`, `skip`, `take` |
| POST | `/api/admin/users` | CREATE |
| GET | `/api/admin/users/:id` | VIEW |
| PATCH | `/api/admin/users/:id` | UPDATE |
| POST | `/api/admin/users/:id/activate` | DEACTIVATE |
| POST | `/api/admin/users/:id/deactivate` | DEACTIVATE |
| POST | `/api/admin/users/:id/lock` | LOCK |
| POST | `/api/admin/users/:id/unlock` | LOCK |
| POST | `/api/admin/users/:id/reset-password` | RESET_PASSWORD |
| POST | `/api/admin/users/:id/roles` | ROLE MANAGE — `{ roleCode }` |
| DELETE | `/api/admin/users/:id/roles/:roleCode` | ROLE MANAGE |

## Roles (`ADMIN / ROLE / *`)

| Method | Path | Permission |
|---|---|---|
| GET | `/api/admin/roles` | VIEW |
| POST | `/api/admin/roles` | CREATE |
| GET | `/api/admin/roles/:id` | VIEW (id or code) |
| PATCH | `/api/admin/roles/:id` | UPDATE |
| POST | `/api/admin/roles/:id/activate` | UPDATE |
| POST | `/api/admin/roles/:id/deactivate` | UPDATE |
| GET | `/api/admin/roles/:id/users` | VIEW |
| GET | `/api/admin/roles/:id/permissions` | VIEW |
| PUT | `/api/admin/roles/:id/permissions` | MANAGE — body `{ permissions: [{ module, resource, action }] }` from catalog only |

## Permissions & security

| Method | Path | Permission |
|---|---|---|
| GET | `/api/admin/permissions` | PERMISSION VIEW |
| GET | `/api/admin/permissions/matrix` | PERMISSION VIEW — `{ permissions, canAssign }` |
| GET | `/api/admin/security` | SECURITY VIEW — real counts only |

## Audit actions

`CREATE_USER`, `UPDATE_USER`, `ACTIVATE_USER`, `DEACTIVATE_USER`, `LOCK_USER`, `UNLOCK_USER`, `RESET_PASSWORD`, `CREATE_ROLE`, `UPDATE_ROLE`, `ACTIVATE_ROLE`, `DEACTIVATE_ROLE`, `ASSIGN_ROLE`, `REMOVE_ROLE`, `ASSIGN_PERMISSION`, `REMOVE_PERMISSION`, `LOGIN_SUCCESS`, `LOGIN_FAILURE`, `ACCOUNT_LOCKED`, `CREATE_CUSTOMER`, `UPDATE_CUSTOMER`, `ACTIVATE_CUSTOMER`, `DEACTIVATE_CUSTOMER`, `ASSIGN_CUSTOMER_USER`, `UNASSIGN_CUSTOMER_USER`.

`AuditEvent` has no update/delete API.

## Customers (`ADMIN / CUSTOMER / *`) — B2

| Method | Path | Permission |
|---|---|---|
| GET | `/api/admin/customers` | VIEW — query: `q`, `status`, `type`, `skip`, `take` |
| POST | `/api/admin/customers` | CREATE — `{ code, name, type, defaultCurrency, defaultIncoterm, paymentTerms, deliveryTerms, allowedQuotationCurrencies }` |
| GET | `/api/admin/customers/:id` | VIEW (id or code) |
| PATCH | `/api/admin/customers/:id` | UPDATE |
| POST | `/api/admin/customers/:id/activate` | ACTIVATE |
| POST | `/api/admin/customers/:id/deactivate` | ACTIVATE |
| GET | `/api/admin/customers/:id/audit` | VIEW |

## Customer users (`ADMIN / CUSTOMER_USER / *`) — B2

| Method | Path | Permission |
|---|---|---|
| GET | `/api/admin/customer-users` | VIEW — query: `q`, `customerId`, `status`, `skip`, `take` |
| POST | `/api/admin/customer-users` | ASSIGN or CREATE — `{ customerId, userAccountId }` |
| PATCH | `/api/admin/customer-users/:id` | UPDATE — `{ status: ACTIVE\|INACTIVE }` |
| POST | `/api/admin/customer-users/:id/unassign` | UPDATE |

Customer-typed users are rejected on all customer-master mutation routes even if a token is forged with extra claims; hydrate uses database `userType` and assignments.

Commercial list/create (`/api/inquiries`, `/api/quotations`): customer scope is taken from `CustomerUser`, never from query or body `customerId`.
