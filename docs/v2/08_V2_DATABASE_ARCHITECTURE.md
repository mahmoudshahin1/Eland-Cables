# 08 — V2 Database Architecture

**Assessment date:** 2026-09-04  
**Source of truth today:** `prisma/schema.prisma` (~66 models), versioned migrations under `prisma/migrations/`.  
**Rule:** No destructive DB changes in this assessment; strategy only. **Not full EAV.**

---

## 1. CURRENT STATE

| Fact | Detail |
|------|--------|
| Engine | PostgreSQL via Prisma 6 |
| Models | ~66 across identity, commercial Q2C, cable/BOM/RM/drum, costing, platform |
| Migrations | 34+ versioned SQL migrations |
| Indexing | Heavy `@@index` / unique constraints |
| Finance / inventory ledgers | **Absent** |
| Soft integration hooks | `integrationStatus`, `d365*` fields on commercial docs |
| Dual persistence | Some UI still localStorage beside PG |

Domain groupings: see explore inventory / Doc 01.

---

## 2. Strategic options (per concern)

| Strategy | Meaning | Use when |
|----------|---------|----------|
| **Reuse** | Keep table/model as-is | Correct ownership & semantics |
| **Refactor** | Normalize relations, tighten FKs, fix dual IDs | Integrity gaps without breaking freeze |
| **Rename** | Align names to V2 module language | Clarity; needs migration + code sync |
| **Platformize** | Move cross-cutting to platform schemas/tables | Audit, sequences, metadata |
| **Extend** | Add columns/tables for GAP modules later | Inventory, cases, etc. |
| **Defer to D365** | Do not build parallel ledger | GL/AP/AR posting per ADR-004 path |

---

## 3. Domain-by-domain strategy

| Domain | Models (examples) | Strategy | Notes |
|--------|-------------------|----------|-------|
| Identity/RBAC | UserAccount, Role, Permission, Session | **Reuse** + harden | Least-privilege role split later |
| Customer | Customer, CustomerUser | **Reuse** | Single customer concept |
| Inquiry/Quotation | CommercialInquiry*, CommercialQuotation* | **Reuse** | Optional rename cosmetic only |
| Fulfillment | Commitment, EpcSalesOrder*, Agreement*, Release* | **Reuse / FROZEN** | No domain reshape without new phase |
| Commercial pricing | PricingRule, DiscountRule, Snapshot | **Reuse** | Keep separate from costing |
| Cable / params | CableMaster, CableParameter, Compatibility | **Reuse**; cutover UI | One engineering/cable model |
| BOM | CableBomLine, GovernedBomLine, BomDuplicateObservation | **Reuse** | Protect governance |
| RM prices | RawMaterial, RawMaterialPrice | **Reuse** | Workflow intact |
| Drum | DrumMaster, DrumCompatibility | **Reuse** + **populate compatibility** | Empty matrix = CONFIGURATION_REQUIRED |
| Costing V2 | Configuration, Formula*, Calculation*, Scrap, FX, extensions | **Reuse** + freeze Option B | Do not alter metal semantics |
| Legacy costing runs | CostingRun, CostingLine | **Refactor later** → adapter-only or archive | Dual persist debt |
| Import | ImportBatch* | **Reuse** / platformize framework | |
| Audit | AuditEvent | **Platformize** as sole audit | Drop client SoT |
| Metadata | PlatformFieldDefinition, NotificationRule, ReportDefinition | **Extend** carefully | Not EAV for tx data |
| TO request | TechnicalOfficeRequest | **Refactor** optional FK to inquiry line | Soft string link today |
| Inventory/Finance/etc. | — | **Defer / Extend later** | Prefer D365 for financial posting |

---

## 4. Anti-EAV policy

| Allowed | Not allowed |
|---------|-------------|
| JSON snapshots on commercial lines (immutable copies) | Storing primary BOM qty/price only as EAV |
| Metadata tables for field/report definitions | Generic `AttributeValue` for all ERP fields |
| Costing calculation JSON snapshots | Replacing `CostingFormula` with free SQL |

Snapshots are **documentary**; masters/transactions remain relational.

---

## 5. Naming & module schemas (target)

Logical namespaces (still one PostgreSQL database):

```text
platform_*     identity, audit, metadata, sequences
md_*           cable, rm, drum, parameters (or keep current names initially)
eng_*          mappings, TO
costing_*      already prefixed
commercial_*   already prefixed
sales_*        SO/agreement (already partly)
inv_* / fin_*  future — only when module authorized
```

**Rename waves** are optional and must be migration-gated; prefer **stability** through Phase 0–3.

---

## 6. Integrity improvements (non-destructive first)

| Issue | CURRENT | TARGET | IMPACT | RISK | DEPENDENCIES |
|-------|---------|--------|--------|------|--------------|
| Soft links (TO id, drumCode, customerMasterId without relation) | Strings | Add FKs where safe | Medium | Orphan cleanup | Data quality |
| Dual costing persist | Run + Calculation | Single calc SoT; run archive | Medium | Report breaks | Costing tests (respect freeze) |
| DrumCompatibility empty | CONFIGURATION_REQUIRED | Seed/governed rules | Business | Wrong drums | Engineering |
| localStorage dual-write | Hybrid | PG only | Medium–High | UI regressions | Import Center cutover |
| Blob attachments in DB | Bytes columns | Object storage later | High | Ops | Infra |

---

## 7. Recommendation

| CURRENT STATE | TARGET STATE | REASON | MIGRATION IMPACT | RISK | DEPENDENCIES |
|---------------|--------------|--------|------------------|---|--------------|
| Strong commercial/costing schema; weak SC/FIN | Reuse core; extend only with approved modules | Avoid second ERP schema | Low if disciplined | Shadow ledgers | ADR-004, roadmap |
| Dual-write | PostgreSQL SoT | Integrity | Medium | Cutover bugs | Master Data phases |
| No EAV | Keep relational + metadata | Performance & clarity | — | Pressure to “flex everything” | Doc 06 |

**Phase 0 rule:** no destructive migrations for V2 aesthetics; additive only when fixing proven integrity bugs with explicit approval.
