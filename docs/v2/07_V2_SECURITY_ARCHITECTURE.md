# 07 — V2 Security Architecture

**Assessment date:** 2026-09-04  
**Related:** `docs/RBAC_PERMISSION_MODEL.md`, `docs/USER_SECURITY_MODEL.md`, Doc 05 (EFFECTIVE ACCESS).

---

## 1. CURRENT STATE

### Authentication

| Item | Implementation |
|------|----------------|
| Primary | JWT access + refresh (`UserSession.refreshTokenHash`) |
| Passwords | bcrypt only (`passwordService`) |
| Lockout | Counters on `UserAccount` |
| Demo auth | Allowed when not production — must be disabled in prod |
| SPA token cache | localStorage/sessionStorage (session cache, not identity SoT) |

### Authorization

| Layer | Mechanism |
|-------|-----------|
| Admin APIs | `requirePermission(module, resource, action)` |
| Domain APIs | `assertCan*` in `src/server/rbac.ts` |
| Compatibility | Legacy module flags when granular codes empty |
| Catalog | `src/domain/permissionCatalog.ts` — admins cannot invent triples |

### Isolation

| Control | Mechanism |
|---------|-----------|
| Customer data | `customerScope` / `assertCustomerBusinessScope` |
| Cost secrecy | `commercialProjection` strips costing for customers |
| Portal separation | `/customer` vs `/internal` shells |

### Known weaknesses (evidenced)

- Unauthenticated master GET / drum compute endpoints
- UI nav filters ≠ complete URL enforcement
- No rate limiting / OpenAPI security schemes
- Dual audit stores
- `SYSTEM_ADMINISTRATOR` has all permissions (dev convenience)

---

## 2. TARGET STATE — security model

```text
Actor
  → Authenticate (IdP or local)
  → Load roles + permission codes
  → Resolve scopes (Customer today; Org/Site later)
  → EFFECTIVE ACCESS evaluate(action, resource, record)
  → Allow / Deny + audit reason
  → Optional field redaction map
```

### Identity types

| Type | V1 today | V2 |
|------|----------|----|
| Internal | `IdentityUserType.internal` | Same |
| Customer | `customer` + `CustomerUser` | Same; strengthen assignment |
| Service / integration | Not first-class | Planned for D365 jobs later |

### Authorization objects

| Object | Description |
|--------|-------------|
| Permission triple | `MODULE:RESOURCE:ACTION` |
| Role | Named set of triples |
| Scope | Customer (and later company/site) |
| Record ACL | Ownership / assignment |
| Field policy | Redact or read-only by role |
| Workflow guard | State-based mutate deny |

---

## 3. EFFECTIVE ACCESS (normative for V2)

See Doc 05 for formula. Security architecture adds:

1. **Deny by default** on new routes.
2. **Explainability** for admin support (why denied).
3. **Consistent HTTP mapping:** 401 unauthenticated, 403 unauthorized, domain codes for business blocks.
4. **Customer users** never receive costing/price admin permissions (seed roles already separate).
5. **Separation of duties:** TO vs Costing Team (RM price approve) preserved.

### Example evaluations

| Actor | Action | Result |
|-------|--------|--------|
| Customer User A | View Inquiry of Customer B | Deny (scope) |
| Customer User A | View own inquiry costing breakdown | Redact / deny fields |
| Sales Rep | Approve commercial quotation | Allow if `assertCanApproveCommercialQuotation` |
| Costing User | Approve RM price | Deny (manager/procurement policy) |
| Anonymous | `POST /drums/optimize` | Deny (target; currently open — harden) |

---

## 4. Recommendations

| CURRENT STATE | TARGET STATE | REASON | MIGRATION IMPACT | RISK | DEPENDENCIES |
|---------------|--------------|--------|------------------|---|--------------|
| Open master reads | Authenticated + permissioned | Attack surface | Client must send JWT | Break scripts | FE services |
| Legacy flags + granular | Granular only | Simplicity | Token/DTO migration | Temp dual | Seed roles |
| Nav-only Phase-1 limits | Route + API enforcement | Real security | Medium | Customer demos | shellRoutes + RBAC |
| No rate limit | Edge/API rate limit | Abuse | Ops | False positives | Deploy platform |
| Full SYSTEM_ADMIN | Split break-glass vs app admin | Least privilege | Role redesign | Lockout risk | Admin module |
| Dual audit | Server AuditEvent only | Forensics | Medium | Lost local logs | Platform |

---

## 5. Compliance posture (honest)

| Topic | Status |
|-------|--------|
| SOC2 / ISO program | Not evidenced |
| GDPR program | Not evidenced |
| Pen-test | Not evidenced in-repo |
| Secrets | `.env.example` guidance; never commit secrets |
| HTTPS / at-rest | Host responsibility (Render etc.) |

V2 roadmap should add hardening phases without claiming compliance certification prematurely.

---

## 6. Frozen / do-not-break controls

- Customer isolation on commercial APIs  
- Commercial cost redaction  
- Costing Team vs TO privilege split  
- Phase 1 fulfillment server-side eligibility checks  
- ADR-004: domain must not call D365 HTTP directly  
