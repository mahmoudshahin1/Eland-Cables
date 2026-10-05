# 03 — V1 → V2 Module Mapping

**Assessment date:** 2026-09-04  
**Target pattern per module:** Workspace | Master Data | Transactions | Setup | Workflows | Reports | Dashboards  
**Principle:** No duplicate concepts — one Customer, one Pricing Engine, one Costing Engine, one Engineering model.

Status keys: **MAP** (V1 exists → V2 module) · **PARTIAL** · **GAP** (no V1 domain) · **STUB** · **FROZEN** (do not alter domain without new phase).

---

## 1. Target module catalog (01–29)

### CORE

| ID | V2 Module | V1 sources | Map status | Notes |
|----|-----------|------------|------------|-------|
| 01 | Admin | `AdministrationHub`, `/api/admin/users*`, roles | MAP | Platform control plane |
| 02 | Security | Permissions matrix, sessions, lockout, `rbac.ts` | MAP | Split UX from Admin; same services |
| 03 | Master Data | `MasterDataHub`, Import Center, `/api/master` | MAP | Hub of hubs; owns import + cross-master readiness |
| 04 | Workflow | Entity action endpoints + status enums | PARTIAL | No generic WF engine yet |
| 05 | Reporting | `ReportsAnalytics`, `ReportDefinition` API | PARTIAL | Definitions exist; execution GAP |
| 06 | Analytics | Internal Dashboard KPIs | PARTIAL | Mix live + hardcoded |

### COMMERCIAL

| ID | V2 Module | V1 sources | Map status | Notes |
|----|-----------|------------|------------|-------|
| 07 | Customer Management | `Customer`, admin customers, portal users | MAP | Single Customer master |
| 08 | Sales | Fulfillment workspace, SO APIs | MAP / FROZEN domain | Orders/agreements; not D365 |
| 09 | Inquiry & Quotation | `InquiryQuotationWorkspace`, commercial routes | MAP | One commercial family |
| 10 | Pricing | Commercial pricing rules + calculate API | MAP | Distinct from Costing |
| 11 | Commercial | Commitments, commercial approval, terms | MAP / FROZEN | Bridge quotation → fulfillment |

### ENGINEERING / MANUFACTURING

| ID | V2 Module | V1 sources | Map status | Notes |
|----|-----------|------------|------------|-------|
| 12 | Engineering | Technical Office, mappings, cable authority | MAP | One engineering model |
| 13 | Cable Master | `CableMaster`, attachments, parameters | MAP | May nest under Master Data workspace entry |
| 14 | BOM | Source BOM, governed BOM, conflicts | MAP | Governance stays code-protected |
| 15 | Costing | Costing Hub + orchestrator | MAP + **freeze** on Option B metal | One Costing Engine |
| 16 | Production | `ProductionMonitoring` | STUB/Mock | No production Prisma models |
| 17 | Quality | Partial via BOM investigation / readiness | GAP / PARTIAL | No dedicated QMS |

### SUPPLY CHAIN

| ID | V2 Module | V1 sources | Map status | Notes |
|----|-----------|------------|------------|-------|
| 18 | Procurement | Seed role `PROCUREMENT_*` only | GAP | No PO domain |
| 19 | Inventory | `availableStockQuantity` snapshot on Direct MTS only | GAP | No stock ledger |
| 20 | Warehouse | — | GAP | — |
| 21 | Logistics | Customer shipments mock; packing/logistics cost rules | PARTIAL | Cost rules ≠ WMS/TMS |

### FINANCE

| ID | V2 Module | V1 sources | Map status | Notes |
|----|-----------|------------|------------|-------|
| 22 | General Ledger | — | GAP | Deferred to D365 or future |
| 23 | Accounts Receivable | `FinanceCollections`, customer statement mock | STUB | |
| 24 | Accounts Payable | — | GAP | |
| 25 | Cash & Bank | — | GAP | |
| 26 | Fixed Assets | — | GAP | |

### SUPPORT

| ID | V2 Module | V1 sources | Map status | Notes |
|----|-----------|------------|------------|-------|
| 27 | Support / Help Desk | `SupportCenter` static | PARTIAL UI only | |
| 28 | Cases | — | GAP | |
| 29 | Knowledge Base | TDS mock library | STUB | |

### Cross-cutting (not numbered but required)

| Concern | V1 | V2 placement |
|---------|----|--------------|
| Drum Master + optimization | `/api/master/drums*`, schedule UI | Under **Cable Master / Engineering / Commercial line packaging** — not a 30th duplicate module |
| Identity | Auth routes | Platform service under Security/Admin |
| D365 adapters | Stub | Integration platform service (ADR-004) |
| AI assistant | `/api/ai/assistant` | Platform utility |

---

## 2. Pattern mapping examples (V1 → V2 structure)

### 09 Inquiry & Quotation

| Pattern area | CURRENT (V1) | TARGET (V2) |
|--------------|--------------|-------------|
| Workspace | `InquiryQuotationWorkspace` | Module workspace home (open inquiries, KPIs) |
| Master Data | Uses Cable/Customer masters | Links only — does not own Customer/Cable |
| Transactions | Inquiry, Quotation | Same docs + clearer document types |
| Setup | `inquiryFieldManifest` / field defs | `PlatformFieldDefinition` SoT |
| Workflows | Submit, version, price, commercial approve | Same rules; optional WF metadata later |
| Reports | Ad-hoc | Module reports from Reporting service |
| Dashboards | Embedded counts | Module dashboard tiles |

### 15 Costing

| Pattern area | CURRENT | TARGET |
|--------------|---------|--------|
| Workspace | `CostingWorkspaceShell` | Keep as Costing workspace (already closest to ERP) |
| Master Data | Variables, components, currencies | Setup + master catalogs |
| Transactions | Calculations / runs | Inquiry-linked calcs remain transactional |
| Setup | Formulas, scrap, FX, extensions | Low-code config **within sandbox** |
| Workflows | Config/version/price approve | Unchanged semantics |
| Reports / Dashboards | Overview + readiness | Module dashboards |

**Freeze:** Do not change Direct RM metal Option B / `CostingMetalCostComponent` semantics / `costingEngine.test.ts` expectations until Decision 5.

### 08 Sales + 11 Commercial (frozen)

| CURRENT | TARGET | Constraint |
|---------|--------|------------|
| Three SO entry points (MTO QT, MTO Agreement, Direct MTS) | Same domain under Sales/Commercial modules | **FROZEN** — UI packaging only until new phase |
| D365 fields on docs | Adapter posting later | ADR-004 `NOT_IMPLEMENTED` |

---

## 3. Anti-duplication rules

| Concept | Single owner module | Must not duplicate in |
|---------|---------------------|----------------------|
| Customer | 07 Customer Management | Sales, Inquiry (FK only) |
| Selling price rules | 10 Pricing | Costing (cost ≠ price) |
| Product cost engine | 15 Costing | Pricing, Inquiry local calc |
| Engineering truth | 12 Engineering (+ 13 Cable Master) | Parallel “catalog 2.0” |
| BOM approved lines | 14 BOM | Costing inventing BOM |
| Drum geometry / capacity | Cable/Engineering master + domain services | Separate conflicting drum apps |

---

## 4. Recommendation

| CURRENT STATE | TARGET STATE | REASON | MIGRATION IMPACT | RISK | DEPENDENCIES |
|---------------|--------------|--------|------------------|------|--------------|
| Tab hubs spanning many domains | Explicit module IDs 01–29 with standard pattern | ERP operability | Medium nav/IA | Over-modularizing mocks into fake modules | Docs 04, 09, 10 |
| Finance/SC mostly mock | Keep as **planned modules**; hide or label NOT_IMPLEMENTED | Honesty | Low | Building empty shells | Product prioritization |
| Drum as scattered UI | Package under Engineering/Commercial packaging flows | One drum model | Low–medium | Conflicting customer DrumOptimizer | Drum assessment |
