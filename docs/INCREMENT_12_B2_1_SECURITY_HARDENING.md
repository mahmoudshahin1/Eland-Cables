# Increment 12 B2.1 — Security hardening

**Status:** Complete. B3 not started.

## Inspection (before change)

Request lifecycle was: JWT signature → hydrate UserAccount → RBAC → handler.

Gaps:

1. **Access JWT had no `sid`.** `UserSession` was created after signing. Logout revoked refresh only; a still-valid access JWT authorized until expiry.
2. **Hydrate ignored `UserSession`.** Locked/inactive users were emptied, but a revoked session of an otherwise active user still worked.
3. **CUSTOMER_USER with multiple `CustomerUser` rows unioned scopes.** That silently expanded access.
4. Client `customerId` was already ignored on create for customer actors (B2). List query `customerId` was already ignored for customers.

No new Prisma fields were required: `UserSession.id` is the session identifier.

## 1. Customer scope resolution

Authenticated `UserAccount` → active `CustomerUser` → `Customer`. Never body, query, URL, headers, or UI state.

## 2. CUSTOMER_USER single-customer rule

`IdentityUserType.customer` (`CUSTOMER_USER` role):

| Active assignments | Commercial access |
|---|---|
| 0 | **403** `CONFIGURATION_REQUIRED` |
| 1 | That customer only |
| >1 | **403** `CONFIGURATION_REQUIRED` — no guess, no delete, `AMBIGUOUS_CUSTOMER_SCOPE` audit |

Assigning a second active customer to a customer user via admin API is rejected until the first is deactivated.

## 3. Internal multi-customer

Internal users keep the union of active assignments for commercial visibility. Customer-master APIs remain permission-gated.

## 4–8. UserSession and JWT

Login creates `UserSession`, hashes the refresh token (SHA-256), then signs access JWT with `sub` + **`sid`** (session id only). No password, refresh token, or reset token in claims.

Each request: verify JWT → load session (`exists`, not revoked, not expired, `userId` matches) → load account (active, not locked) → live roles → customer scope → RBAC.

Logout revokes the session by `sid` (Authorization) and/or refresh-token hash. Replay of that access JWT is **401**.

Lock, deactivate, and successful password reset still revoke **all** sessions (`REVOKE_SESSIONS` audit).

In-memory Increment 1–11 tokens (`signTestToken` with no `UserAccount` row) remain claim-based and do not require `sid`.

## 9. RBAC

Unchanged engine. Session and customer scope run in addition to `hasPermission` / `assert*`.

## 10. Horizontal privilege

Customer A cannot read B’s inquiry/quotation by URL, cannot create for B via body `customerId`, cannot list B via query, cannot assign themselves or edit customer master.

## 11. Errors

| Condition | HTTP |
|---|---|
| Missing/invalid/revoked/expired session | 401 |
| Signed in, missing permission | 403 |
| Ambiguous or missing customer assignment | 403 `CONFIGURATION_REQUIRED` |

## 12. Tests

`src/server/increment12b2_1.securityHardening.test.ts` covers tests 1–18 plus JWT replay (signature still valid, HTTP 401).
