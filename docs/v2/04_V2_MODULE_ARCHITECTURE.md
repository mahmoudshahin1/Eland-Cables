# 04 — V2 Module Architecture

**Assessment date:** 2026-09-04  
**Style:** D365 F&O–inspired **organization** (workspaces, masters, journals/transactions, setup), applied to Energya Power Cables — **not** a F&O clone.

---

## 1. Target shape

```text
Energya Connect V2 (modular monolith)
├── Platform Services (identity, RBAC, audit, metadata, workflow runtime, integration adapters)
└── Business Modules 01–29
      each: Workspace | Master Data | Transactions | Setup | Workflows | Reports | Dashboards
```

**Deployable unit:** one app (ADR-002 modular monolith). Modules are **packages/contracts**, not microservices in Phase 0–N early roadmap.

---

## 2. Standard module contract (every V2 module)

Every module **MUST** declare:

| Contract element | Description |
|------------------|-------------|
| `moduleId` | Stable code (e.g. `COSTING`, `INQUIRY_QUOTATION`) |
| `displayName` | UI label |
| `ownedEntities` | Prisma models or future tables this module owns |
| `ownedApis` | Route prefixes |
| `dependencies` | Other modules (read) vs owned (write) |
| `permissions` | Catalog triples |
| `workspaceEntry` | Default route / workspace component |
| `surfaces` | Which of W/M/T/S/Wf/R/D are implemented vs N/A |
| `invariants` | Rules that low-code cannot override |
| `integrationHooks` | Optional adapter ports (e.g. D365) |
| `status` | LIVE / PARTIAL / PLANNED / FROZEN / NOT_IMPLEMENTED |

### Surfaces

| Surface | Meaning |
|---------|---------|
| **Workspace** | Role-oriented landing: queues, KPIs, shortcuts |
| **Master Data** | Reference data owned by the module |
| **Transactions** | Documents / journals with lifecycle |
| **Setup** | Parameters, number sequences, defaults |
| **Workflows** | Approval & status transitions |
| **Reports** | Operational reports (via Reporting service) |
| **Dashboards** | Analytical tiles (via Analytics service) |

Modules that are **GAP** still get a contract with `status=PLANNED` and empty surfaces — no fake UI claiming completeness.

---

## 3. Module dependency rules

```text
Platform Services
    ↑ used by all

Master Data / Cable Master / Customer
    ↑ Engineering, BOM, Costing, Inquiry

Engineering + BOM + Costing + Pricing
    ↑ Inquiry & Quotation

Inquiry & Quotation + Commercial
    ↑ Sales (fulfillment)

Sales / Commercial
    ↑ (future) Inventory, AR, D365 adapters

Finance / SC / Production modules
    ↑ prefer D365 or later native — do not invent parallel ledgers early
```

**Write ownership:** only the owning module mutates owned entities. Others call published services/APIs.

---

## 4. Priority module blueprints (from V1 strength)

### A. Inquiry & Quotation (09) — LIVE

| Surface | Content |
|---------|---------|
| Workspace | Open inquiries, awaiting quote, costing NOT_READY |
| Master | None owned (Customer, Cable referenced) |
| Transactions | Inquiry, Inquiry Line, Quotation, Quotation Line |
| Setup | Field visibility, default terms |
| Workflows | Submit, version, cancel; price approve; commercial approve |
| Reports | Inquiry aging, quote conversion (future) |
| Dashboards | Counts by status |

**Invariants:** customer scope; costing via orchestrator only; commercial freeze rules.

### B. Costing (15) — LIVE + freeze

| Surface | Content |
|---------|---------|
| Workspace | Existing Costing V3 shell |
| Master | Variables, components, currencies |
| Transactions | Calculations linked to inquiry lines |
| Setup | Formulas, scrap, FX, logistics/packing amounts |
| Workflows | Config version, price, scrap, FX approvals |
| Reports | Readiness, audit extracts |
| Dashboards | Overview / production readiness |

**Invariants:** formula sandbox; readiness gates; Option B metal freeze until Decision 5; TO cannot approve RM prices.

### C. Sales + Commercial (08, 11) — FROZEN domain

| Surface | Content |
|---------|---------|
| Workspace | `CommercialFulfillmentWorkspace` |
| Transactions | Commitment, SO, Agreement, Release |
| Workflows | Commercial approve → fulfillment type; release qty |
| Setup | Cable fulfillment policy (owned with Cable Master) |

**Invariants:** three entry points; origin ≠ mode; Direct MTS eligibility; `integrationStatus` honesty.

### D. Engineering + Cable + BOM (12–14) — LIVE / HYBRID UI

| Surface | Content |
|---------|---------|
| Workspace | Technical Office queues |
| Master | Cable, parameters, mappings, governed BOM |
| Transactions | TO requests, conflict investigations |
| Workflows | Mapping/BOM approve |
| Setup | Compatibility rules |

**Invariants:** no silent zeros; BUSINESS_DECISION_REQUIRED conflicts; one engineering model.

### E. Admin + Security (01–02) — LIVE

Control plane only — no business pricing/costing rules in RBAC (per `RBAC_PERMISSION_MODEL.md`).

### F. Planned GAP modules (16–26, 28–29)

Contract-only until roadmap phase; UI must show **NOT_IMPLEMENTED** or remain unmounted (prefer unmounted over fake-connected).

---

## 5. Recommendation

| CURRENT STATE | TARGET STATE | REASON | MIGRATION IMPACT | RISK | DEPENDENCIES |
|---------------|--------------|--------|------------------|---|--------------|
| Informal hubs | Explicit module contracts | Governance + onboarding | Low initially (docs + package folders) | Big-bang folder move | Doc 03, 05 |
| Mixed ownership (TO edits prices UI) | Clear write owners + shared read | Integrity | Medium permission cleanup | Blocking legitimate ops | RBAC catalog |
| Mock modules visible as peers | Tier LIVE vs PLANNED in IA | Executive honesty | Low nav change | Demo expectations | Doc 09, 10 |
