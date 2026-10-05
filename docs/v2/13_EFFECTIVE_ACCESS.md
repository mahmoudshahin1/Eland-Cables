# 13 — EFFECTIVE ACCESS

**Code:** `src/platform/security/effectiveAccess.ts`  
**APIs:**

- `POST /api/v2/security/effective-access/evaluate`
- `GET /api/v2/security/effective-access/explain` (admin — “Why does this user have access?”)
- `GET /api/v2/security/users/:userId/access-profile`

## Formula

```text
EFFECTIVE ACCESS =
  Authentication
  ∩ Role permissions (MODULE:RESOURCE:ACTION)
    (+ SecurityGroup → Role → Permission)
  ∩ Customer / data scope
  ∩ Record ownership
  ∩ Workflow state guards
  ∩ Field-level policy
```

Deny by default. HTTP: **401** unauthenticated, **403** unauthorized.

## Chain (V1 compatibility)

```text
User → (optional SecurityGroup) → Role (= PermissionSet) → Permission (MODULE:RESOURCE:ACTION)
     → Module → Resource → Action → Field (PlatformFieldDefinition) → DataScope (customerScope)
```

Role remains the PermissionSet in V1 compatibility mode. Security groups are additive.

## Hardening (Task 02)

Master catalog GETs and drum optimize/validate/candidates/capacity now require signed-in + catalog permission (customers allowed for packaging). UI hide alone is not authorization.
