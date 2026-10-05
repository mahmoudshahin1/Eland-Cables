# 05 — V2 Platform Services

**Assessment date:** 2026-09-04  
**Rule:** Platform services enable modules; they do **not** contain cable pricing, costing formulas business meaning, or engineering truth.

---

## 1. Platform vs business

| Layer | Responsibility | Examples (V1 → V2) |
|-------|----------------|--------------------|
| **Platform services** | Cross-cutting capabilities every module uses | Auth, RBAC, audit, metadata, notifications, reporting runtime, integration adapters, document sequences, feature flags |
| **Business modules** | Domain ownership | Customer, Cable, BOM, Costing, Pricing, Inquiry, Sales |

Anti-pattern: putting margin rules into permission tables, or putting customer isolation only in UI.

---

## 2. Platform service catalog

| Service | CURRENT STATE (V1) | TARGET STATE (V2) | REASON | MIGRATION IMPACT | RISK | DEPENDENCIES |
|---------|--------------------|--------------------|--------|------------------|------|--------------|
| **Identity / Auth** | JWT, sessions, bcrypt, lockout (`identityAuthRoutes`) | Same + optional IdP later | Working | Low | Demo auth in prod | Env hardening |
| **RBAC** | Catalog + roles + legacy flags (`permissionCatalog`, `rbac.ts`) | EFFECTIVE ACCESS evaluation API; retire legacy flags gradually | Clarity | Medium | Broken grants | Doc 07 |
| **Customer scope** | `customerScope`, `commercialProjection` | First-class tenancy/scope service | Isolation | Low–medium | Over-filtering | Customer master |
| **Audit** | `AuditEvent` + client localStorage | Server-only immutable audit | Integrity | Medium | Lost client history | Cutover |
| **Metadata / fields** | `PlatformFieldDefinition` + TS manifests | One metadata service | Low-code foundation | Medium | Form regressions | Doc 06 |
| **Workflow runtime** | Per-entity actions | Thin workflow service over status machines | Consistency | High if genericized early | Over-engineering | Start with adapters on existing enums |
| **Notifications** | Model + SMTP helper | Event → rule → channel | Ops | Medium | Spam / missed events | Metadata |
| **Reporting runtime** | Definitions only | Safe query + export over approved entities | Analytics | High | Data leak | RBAC + entity whitelist |
| **Dashboard KPI** | `dashboardKpiService` partial | Registered KPI definitions | Correct metrics | Medium | Wrong KPIs today (`costingReadyCables`) | Fix definitions |
| **Number sequences** | `CostingDocumentSequence` + commercial numbers | Platform sequence service | Consistency | Low | Collisions | DB uniqueness |
| **File / attachments** | Bytea on inquiry/cable attachments | Later object storage abstraction | Scale | Medium | Migration of blobs | Storage ops |
| **Integration adapters** | `d365Adapters` NOT_IMPLEMENTED | Keep ports; implement later | ADR-004 | Low until ERP | Fake connectivity | Freeze |
| **AI assistant** | Gemini handler | Optional platform copilot with RBAC | Productivity | Low | Prompt leakage | Auth |
| **Import / export framework** | `importPipelineService` for masters | Reusable import framework | Ops | Medium | Partial imports | Master Data |

---

## 3. EFFECTIVE ACCESS (concept)

### Definition

**EFFECTIVE ACCESS** is the resolved set of allowed operations for an actor in a context:

```text
EFFECTIVE ACCESS =
  Authentication (valid session)
  ∩ Role permissions (catalog triples)
  ∩ Resource scope (customer / legal entity / future org)
  ∩ Record ownership / assignment rules
  ∩ Workflow state guards (e.g. cannot edit APPROVED)
  ∩ Field-level redaction policy (e.g. hide cost from customer)
  ∩ Feature / module license flags (future SaaS)
```

UI visibility is a **projection** of EFFECTIVE ACCESS, never the source of truth.

### CURRENT STATE

| Check | Where |
|-------|-------|
| Signed-in | `resolveRequestActor` |
| Permission | `requirePermission` / `assertCan*` |
| Customer business scope | `assertCustomerBusinessScope` |
| Inquiry ownership | `assertCanAccessInquiryOwnership` |
| Cost redaction | `commercialProjection` |
| Legacy flags | Mapped when granular codes empty |

### Gaps vs target

- No single `evaluateEffectiveAccess(actor, resource, action, record)` API.
- Master GET / drum optimize often **unauthenticated**.
- Sidebar filters (Phase-1 customer tabs) are not full URL enforcement for all roles.
- Field-level security only partially via projection, not metadata-driven.

### TARGET STATE

| Capability | Description |
|------------|-------------|
| Access evaluation service | Central evaluate + explain (for audit) |
| Scope providers | Customer today; org/site later |
| Policy packs | Module registers protected actions |
| Explain endpoint (admin) | “Why denied” for support |

| CURRENT STATE | TARGET STATE | REASON | MIGRATION IMPACT | RISK | DEPENDENCIES |
|---------------|--------------|--------|------------------|---|--------------|
| Scattered asserts | EFFECTIVE ACCESS service | Security consistency | Medium refactor of routers | Missed route | Doc 07, RBAC catalog |
| Open master reads | Authenticated + permissioned reads | Hardening | Low–medium clients | Break anonymous tools | Client updates |

---

## 4. What must stay out of platform

- Costing formula business meaning and READY gates  
- Commercial fulfillment entry-point rules (frozen)  
- Engineering/BOM conflict resolution  
- Selling price calculation semantics  

Platform may **host** workflow transitions and metadata; **domain services** decide outcomes.

---

## 5. Recommendation summary

Evolve platform services in-place inside `src/server` / `src/platform` with clear boundaries; do not introduce a separate “platform microservice” in early phases.
