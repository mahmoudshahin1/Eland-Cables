# Increment 12 — Platform Administration, Security, Customer Management & Low-Code Configuration

> **Stage A — Architectural Review & Implementation Plan ONLY**  
> Status: **ANALYSIS COMPLETE. STAGE B NOT STARTED.**  
> Date: 2026-08-20  
> Prerequisite: Existing Increments 1–11 plus shipped commercial pricing (see `docs/INCREMENT_12_COMMERCIAL_PRICING_IMPLEMENTATION_PLAN.md`).

**STOP after this document. Do not implement until explicit approval.**

This document answers: what already exists, what to reuse, what to extend, what new models/APIs/UI are required, and what must never become configurable.

---

## Increment numbering note

A previous “Increment 12” already implemented the **Commercial Pricing & Sales Margin Engine** (`commercialPricingEngine.ts`, `CommercialPricingRule`, quotation snapshots). That work remains in place.

This Stage A plan is a **new control-plane increment**. During Stage B, treat commercial pricing as **Layer 2 (governed business services)** that administration must **not** rewrite. If numbering must stay unique, Stage B may label this increment **12B / Platform Control Plane** without changing existing pricing APIs.

---

## 1. Existing architecture assessment

Energya Connect is a **React SPA + Express (`server.ts`) + Vite middleware + PostgreSQL/Prisma** application.

| Layer | Current state |
|---|---|
| **UI** | Single `App.tsx` shell: Navbar, Sidebar, tab-switched modules, Footer. Customer vs internal `platformMode`. |
| **Auth** | JWT login in `server.ts` (`/api/auth/*`). In-memory `mockDbUsers` — **not** a Prisma `User` model. Passwords compared as plaintext `passwordHash` field. |
| **RBAC** | Module-boolean `ModulePermissions` on the JWT (`overview`, `technicalOffice`, `costingPricing`, …). Server `src/server/rbac.ts` asserts per capability. **Not** MODULE/RESOURCE/ACTION. |
| **Domain** | Cable Master, BOM, prices, costing, inquiry/quotation, commercial pricing — domain services + Prisma. |
| **Audit** | Dual: Prisma `AuditEvent` (append-only DB) **and** in-memory/localStorage `appendAudit()` (`src/platform/audit/auditLogService.ts`). |
| **Customers** | No `Customer` table. `CommercialInquiry.customerId` is a **string** (often user id/email). Customer users live in mock users (`c-eland`). |
| **Navigation** | Hard-coded in `Sidebar.tsx`. ELAND menu is **hard-coded** by name/email contains `"eland"`. |
| **Reports/Dashboards** | `ReportsAnalytics.tsx` and `InternalDashboard.tsx` use **hard-coded / mock KPI values** (OEE 84%, conversion 71.1%, monthly sales series). Not governed data. |
| **Numbering** | Client-side-ish server generators: `INQ-${stamp}-${rand}`, `QUO-${stamp}-${rand}`, `CR-${stamp}-${rand}`, `TCR-INQ-${stamp}-${rand}` — **not** sequential, not unique under concurrency by sequence table. |
| **Lookups** | `CableParameter` exists for cable families/voltages/etc. Incoterms/payment terms are **string defaults** on inquiry (`FOB`, `LC at sight`). |
| **User UI** | `UserManagement.tsx` mutates React `usersList` in AuthContext — **does not persist to PostgreSQL**. `RoleManagementView.tsx` is a prototype against `/api/auth/roles` in-memory array. |

**Golden rule already in force (must remain):** administrators must not bypass Cable Master, BOM, price, costing gates, quotation versioning, or audit.

---

## 2. Existing authentication model

| Item | Implementation | Gap |
|---|---|---|
| Login | `POST /api/auth/login` — JWT HS256, issuer `Energya.DotNet9.JwtAuthority` | Users not in PostgreSQL |
| Password | Compared to `user.passwordHash` as **plaintext** | **Must hash (bcrypt/argon2). Never store or return plaintext.** |
| Register | `POST /api/auth/register` — creates in-memory user | No admin approval, no customer assignment |
| Refresh | In-memory `Map` of refresh tokens | Not revocable per user in DB; restart loses sessions |
| `/api/auth/me` | Verifies Bearer JWT | OK to keep |
| Demo login | `loginAsUser()` in AuthContext **bypasses JWT** | Security hole — Stage B must disable for production paths |
| Forgot/reset | In-memory reset tokens | Prototype; must not leak tokens in API responses in production |
| Actor extraction | `actorFromAuthorizationHeader` in `src/server/auth.ts` | No session table, no lockout, no failed-attempt store |

**Reuse:** JWT issuer/audience, Bearer header convention, `RequestActor` shape.  
**Replace:** in-memory user store, plaintext password compare, demo `loginAsUser` as a privileged path.

---

## 3. Existing RBAC model

**Frontend (`ModulePermissions`):** 10 boolean module flags.

**Server (`rbac.ts`):** capability functions, e.g.:

- `assertCanWriteCableMaster`, `assertCanImportMasterData`
- `assertCanProcessTechnicalOffice`, `assertCanApproveEngineeringMapping`
- `assertCanApproveBomGovernance` / `assertCanInvestigateBomGovernance`
- `assertCanProposeRawMaterialPrice` / `assertCanApproveRawMaterialPrice`
- `assertCanCalculateCosting`
- `assertCanManageInquiry` / `assertCanManageQuotations`
- `assertCanManagePricingRules` / `assertCanApprovePricingRules`
- `assertCanAccessInquiryOwnership` (customer vs inquiry `customerId`)

**Problems:**

1. Permissions are **module-wide**. An admin with `technicalOffice: true` can both investigate **and** approve BOM if those functions share the same flag.
2. `assertCanManageInquiry` only requires **sign-in** — any authenticated user can manage inquiries if routes do not add more checks.
3. Frontend hiding (`Sidebar` `hasPermission`) is **not** security.
4. No `SYSTEM_ADMIN` vs `BUSINESS_APPROVER` split.
5. Roles exist only as in-memory `RoleDefinition` + string `user.role`.

**Stage B target:** keep existing `assert*` functions as adapters over a new `Permission` catalog (`MODULE` + `RESOURCE` + `ACTION`). Do **not** delete current checks until mapping is complete.

---

## 4. Existing AuditEvent implementation

**Prisma `AuditEvent`:**

```
id, at, actorId, actorName, entity, entityId, action, oldValue Json?, newValue Json?, message?
```

No indexes on `entity`, `actorId`, `at`. No IP/session. No `customerId`. No `result` / `failureReason`.

**Parallel store:** `appendAudit()` writes to `localStorage` / memory (max 2000). Repositories often call **both**.

**Reuse:** append-only Prisma model; never UPDATE/DELETE audit rows.  
**Extend:** indexes, `customerId`, `module`, `ipAddress` (optional), `result`. Unify writes to Prisma as system of record; keep `appendAudit` as optional UI cache or retire it.

Administrators must **not** edit or delete audit events (API: no PATCH/DELETE).

---

## 5. Existing customer / user structures

| Concept | Exists? | Notes |
|---|---|---|
| Prisma `User` | **No** | Only mock arrays |
| Prisma `Role` / `Permission` | **No** | |
| Prisma `Customer` | **No** | |
| Prisma `OrganizationalUnit` | **No** | |
| `UserAccount` (TS) | Yes | id, userType, email, department, role, permissions, companyName, customerCode |
| `CommercialInquiry.customerId` | String | Often **user id**, not a customer master FK |
| `CustomerPricingTier` | Yes | Commercial pricing increment — do not invent new pricing here |
| ELAND isolation | Partial | Sidebar filter by name; inquiry ownership check exists |

**Do not invent customer pricing in this increment.** Customer-specific commercial rules stay in Increment 12 commercial pricing (already separate).

---

## 6. Existing navigation structure

**Internal (`InternalPortalTab`):** overview, technical_office, cable_configurator, costing_pricing, sales_quotations, sales_orders, orders_production, shipments_logistics, finance_collections, **user_management**, master_data, reports_analytics.

**Customer:** dashboard, configurator, price_estimation, sales_orders, drum_optimizer, statement, shipment_tracking, invoices, tds_library, support.

**Hard-coded ELAND:** only configurator + inquiries + support.

**Stage B:** add `administration` internal tab (permission `ADMIN.*`). Do **not** redesign Sidebar visual language. i18n EN/AR is **not implemented** (language dropdown on login is cosmetic).

---

## 7. Existing dashboard / report architecture

| Screen | Data source | Verdict |
|---|---|---|
| `InternalDashboard` | `INITIAL_SALES_ORDERS`, invented monthly sales / top customers | **Fake KPIs — must not be used as production dashboard data** |
| `ReportsAnalytics` | Hard-coded OEE, conversion, funnel | **Fake — out of scope to “fix” as Power BI; replace with governed report engine** |
| `CustomerDashboard` | Mock credit/purchases | Same |
| Technical Office queues | Live APIs (BOM, mapping, costing, pricing) | **Real — preferred dashboard sources** |
| Costing readiness | `evaluateCableCostingReadiness` | **Real** |

Stage B dashboards must query **Prisma aggregates** of inquiries, quotations, BOM conflicts, prices, costing runs — never mock series.

---

## 8. Hard-coded configuration that should become configurable

| Location | Hard-coded value | Target |
|---|---|---|
| `Sidebar.tsx` | ELAND email/company contains | Customer feature flags / portal menu config |
| `commercialRepository.ts` | Default currency USD, FOB, LC at sight, CIF Alexandria | Customer master + Reference Data |
| Inquiry/quotation numbers | Date stamp + random suffix | `NumberSequence` |
| Costing run numbers | `CR-${stamp}-${rand}` | `NumberSequence` |
| `LoginModal` | Demo accounts, default passwords in UI | Admin-seeded users only; **remove passwords from frontend** |
| `server.ts` JWT_SECRET default | Fallback secret in source | **Env-only secret** |
| Navbar “Energya Connect v3.4” | Brand strings | `SystemConfiguration` (non-secret) |
| Module permission keys | Fixed TypeScript interface | Permission catalog rows + compatibility mapping |
| Incoterms / currencies | Strings | Reference Data |
| Import Excel templates | Code-generated workbooks | `ImportTemplate` metadata (validation still domain) |

**Must stay hard-coded in domain services:** costing formulas, BOM conflict classification, 4-gate readiness, UOM mismatch, markup vs margin math, price overlap, cable authority.

---

## 9. Database changes required

**Do not duplicate** `AuditEvent`, `CustomerPricingTier`, `CableParameter`.

### 9.1 Identity & tenancy (new)

```
OrganizationUnit   (id, code, name, parentId, status)
Customer           (id, customerCode unique, legalName, status, defaultCurrency, defaultIncoterm,
                    paymentTerms, deliveryTerms, tierCode?, createdAt, …)
UserAccount        (id, username unique, email unique, passwordHash, fullName, mobile?, employeeNumber?,
                    userType, status, lockedUntil?, failedLoginCount, lastLoginAt, mfaStatus,
                    customerId?, orgUnitId?, department?, jobTitle?, createdAt, updatedAt)
UserRole           (userId, roleId)
Role               (id, code unique, name, description, userType, status, isSystem)
Permission         (id, module, resource, action, description)  @@unique([module, resource, action])
RolePermission     (roleId, permissionId)
UserSession        (id, userId, refreshTokenHash, expiresAt, revokedAt, ip?)
```

Passwords: **bcrypt/argon2 only**. APIs never return `passwordHash`.

### 9.2 Metadata / low-code

```
CustomFieldDefinition  (id, entityType, internalName, label, dataType, required, defaultValue,
                        displayOrder, visible, readOnly, searchable, filterable, sortable, exportable,
                        validation Json, lookupTypeId?, status, revision)
CustomFieldValue       (id, entityType, entityId, fieldDefinitionId, valueText?, valueNumber?,
                        valueBool?, valueDate?, valueJson?)
                       @@unique([entityType, entityId, fieldDefinitionId])
```

**Architecture choice (recommended):** hybrid — **typed columns** for first-class attributes already on Prisma models; **CustomFieldDefinition + CustomFieldValue** (typed value columns, not a single untyped EAV string) for admin-added fields. Index `(entityType, entityId)`. Do **not** ALTER TABLE per new field. Do **not** store executable JS/SQL.

### 9.3 Reference data, sequences, workflow metadata

```
ReferenceDataType   (id, typeCode unique, name)
ReferenceDataValue  (id, typeId, code, name, description, displayOrder, active, effectiveFrom, effectiveTo)
NumberSequence      (id, entity, prefix, datePattern, padding, nextValue, resetPolicy, active)
                    — increment with SELECT … FOR UPDATE or equivalent in a transaction
WorkflowDefinition / WorkflowState / WorkflowTransition
                    — metadata for *routing* only; domain services remain source of mandatory rules
```

### 9.4 Reports / dashboards / templates / config

```
ReportDefinition, ReportField, ReportFilter
Dashboard, DashboardWidget
ImportTemplate (entity, version, columns Json, active)
SystemConfiguration (key unique, valueJson, isSecret=false)
```

**Secrets:** never in `SystemConfiguration`. JWT secret, SMTP passwords, API keys stay in environment / secret store.

### 9.5 Audit extension (ALTER existing)

Add nullable `customerId`, `module`, `ipAddress`, `result`. Add indexes `(entity, at)`, `(actorId, at)`. **No destructive rewrite of existing rows.**

### 9.6 Commercial FK (careful)

Optional later: `CommercialInquiry.customerId` → `Customer.id`. **Migration must map existing string ids** (e.g. `c-eland`) to a seeded Customer row. Do not break Increment 11 tests.

---

## 10. API changes required

Mount under `/api/admin/*` with **server-side** `assertPermission(MODULE, RESOURCE, ACTION)`.

| Area | Methods |
|---|---|
| Users | GET/POST/PATCH `/api/admin/users`, POST lock/unlock/deactivate, POST reset-password (workflow), POST revoke-sessions |
| Roles | GET/POST/PATCH `/api/admin/roles`, GET users-by-role |
| Permissions | GET `/api/admin/permissions` (catalog; seed, not free-form SQL) |
| Customers | GET/POST/PATCH `/api/admin/customers`, GET inquiries/quotations by customer |
| Org units | GET/POST/PATCH `/api/admin/org-units` |
| Reference data | GET/POST/PATCH `/api/admin/reference-data/:type` |
| Field definitions | GET/POST/PATCH `/api/admin/field-definitions` |
| Field values | GET/PUT via entity APIs (not a raw dump endpoint for customers) |
| Workflows | GET/POST/PATCH `/api/admin/workflows` (cannot disable BOM evidence rules) |
| Sequences | GET/POST/PATCH `/api/admin/number-sequences` |
| Reports | GET/POST/PATCH `/api/admin/reports`, POST `:id/run` |
| Dashboards | GET/POST/PATCH `/api/admin/dashboards`, GET `:id/data` |
| Audit | **GET only** `/api/admin/audit` |
| Import templates | GET/POST/PATCH `/api/admin/import-templates`, GET download |
| System config | GET/PATCH `/api/admin/system-config` (non-secret keys) |
| Security | GET `/api/admin/security` (aggregates) |

**Backward compatible:** keep `/api/auth/login|me|refresh`. Deprecate in-memory `/api/auth/users` after UserAccount exists. Existing `/api/inquiries`, `/api/quotations`, `/api/costing` unchanged except consuming sequences and customer FK when migrated.

Unauthorized → **403** with existing `DomainError` pattern. Unauthenticated → **401**.

---

## 11. UI changes required

New internal workspace **Administration Center** (same Tailwind / Energya blue-red system). Sub-nav:

Overview · Users · Roles & Permissions · Customers · Org Structure · Reference Data · Field Configuration · Workflow Configuration · Number Sequences · Reports · Dashboards · Import Templates · Notifications · Security · Audit & Activity · System Configuration

Reuse patterns from Technical Office queues: search, filters, pagination, empty/loading/error, confirm dialogs.

**Do not** create a second design language.  
**Do not** put costing formulas in React.  
Permission-aware nav: hide admin items without `ADMIN` permission; **still enforce on API**.

Arabic: add i18n keys for admin screens first (EN complete; AR strings as Stage B stretch if not already in platform — currently **not**).

---

## 12. Security model

### 12.1 System administration vs business authority

| Role example | May configure | May not (unless explicit business permission) |
|---|---|---|
| SYSTEM_ADMINISTRATOR | Users, roles, field defs, sequences, branding | Approve BOM, approve price, calculate costing, approve quotation |
| TECHNICAL_OFFICE_MANAGER | (if granted) BOM approve | Manage users / change costing formulas |
| CUSTOMER_USER | Own inquiries | Any admin API, other customers, raw prices, costing runs |

`userManagement: true` today is **too broad**. Split: `ADMIN.USER.MANAGE` vs `BOM.BOM_CONFLICT.APPROVE`.

### 12.2 Customer isolation

- Customer users: `customerId` from UserAccount, **never** from query string override.
- All list/get APIs filter `WHERE customerId = actor.customerId`.
- Tests: Customer A GET Customer B inquiry → 403 (extend Increment 11 isolation tests).

### 12.3 Field-level security

Store `FieldVisibility` (role + entity + field + visible).  
Report/dashboard field lists **intersect** with allowed fields server-side.  
Customers never receive `RawMaterialPrice.price`, `CostingLine`, supplier, margin — even if a report definition lists them.

### 12.4 Vertical / horizontal escalation tests

Mandatory: unauthorized user POST `/api/admin/users` → 403; customer cannot assign `SYSTEM_ADMINISTRATOR`; cannot approve price via admin API.

---

## 13. Low-code metadata model

**Allowed:** labels, types, required, min/max, regex, lookup binding, visibility, order.  
**Forbidden:** JavaScript, SQL, server callbacks, disabling domain validators, editing audit, disabling isolation.

**Runtime:** entity GET/PATCH merges `customFields: { internalName: value }` after validating against definitions. Inactive definitions hidden; existing values retained for history.

**Entities in v1:** Customer, Inquiry, InquiryLine, Quotation, QuotationLine, TechnicalOfficeRequest.  
**Defer or read-only:** CostingRun, RawMaterialPrice, GovernedBomLine — avoid custom fields that look like costing inputs.

---

## 14. Reporting architecture

**Controlled query engine:**

1. Admin selects **registered entity** (allowlist: Inquiry, Quotation, CableMaster, BomDuplicateObservation, RawMaterialPrice, CostingRun, AuditEvent, Customer).
2. Selects **registered fields** only (catalog).
3. Filters: equals, in, date range, current-user/customer auto-scope.
4. Aggregations: COUNT, SUM, AVG, MIN, MAX on numeric allowlisted columns.
5. Execution: Prisma `findMany` / `groupBy` built in `reportQueryService.ts` — **no raw SQL from the client**.

Export: CSV/XLSX of the **same** authorized result set.

---

## 15. Dashboard architecture

Widgets bind to **report definitions or registered metrics** (e.g. `count_open_inquiries`, `count_bom_conflicts_unresolved`, `count_raw_materials_unpriced`).

KPI examples from **real** data:

| Widget | Source |
|---|---|
| Open inquiries | `CommercialInquiry` status not CLOSED |
| Open quotations | `CommercialQuotation` isCurrent + status |
| BOM conflicts | `BomDuplicateObservation` investigationStatus ≠ APPROVED |
| Unpriced RM | `RawMaterial.priceStatus = PRICE_NOT_CONFIGURED` |
| Costing-ready cables | readiness service count |
| Technical Office requests | `TechnicalOfficeRequest` by status |

**No invented OEE / conversion %** unless a governed data source exists (it does not today).

---

## 16. Approval / workflow architecture

**Configurable:** display names, notification targets, extra approval *levels* **in addition to** existing gates, required comment flags.

**Not configurable (must remain in domain services):**

- 4-gate costing readiness
- BOM evidence / classification requirements
- Price positivity, UOM, overlap, APPROVED-only costing
- Quotation non-destructive versioning
- Markup vs gross margin validation
- Customer cannot approve internal prices

Workflow engine may **block** a transition if permission missing; it may **never skip** domain `evaluateCostingGates` / BOM approve validators.

---

## 17. Migration strategy

1. Prisma migration for new identity + metadata tables (additive).
2. Seed Permissions catalog mapped 1:1 from current `ModulePermissions` + finer actions used by `rbac.ts`.
3. Seed Roles from current mock roles (System Admin, Sales Manager, Technical Office, Costing, Finance, Production, Customer).
4. Seed Users from `mockDbUsers` / `INITIAL_USERS_DATABASE` with **hashed** passwords (dev-only known passwords in env/docs, not in client).
5. Seed Customer `ELAND` (`CUST-ELD-101`) and attach `c-eland`.
6. Backfill `CommercialInquiry.customerId` where it equals user ids.
7. Keep JWT login working throughout (dual-read in-memory **or** DB during one release, then DB-only).
8. Do not delete CableMaster, BOM, prices, CostingRuns, quotations.

---

## 18. Backward compatibility strategy

- Existing Increment 10–12 APIs keep paths and response shapes.
- JWT claims continue to include **legacy** `permissions` booleans **derived** from RolePermission for old frontend until Sidebar is updated.
- `loginAsUser` demo: disable when `NODE_ENV=production`; tests may keep a test helper.
- Commercial pricing rules unchanged.
- If a test conflicts with new auth store, **adapt test fixtures** — do not weaken BOM/price/costing assertions.

---

## 19. Test strategy

New file e.g. `src/server/increment12b.admin.test.ts` (name TBD).

Minimum cases from the request (all required):

1. Admin can create user  
2. Unauthorized cannot create user  
3. Admin can assign role  
4. Permission enforcement  
5. Customer isolation  
6. Customer A cannot access Customer B  
7. Field-level security  
8. Admin can create custom field  
9. Custom field validation  
10. Custom field appears on entity  
11. Inactive field hidden  
12. Admin can create report  
13. Report respects RBAC  
14. Customer report respects isolation  
15. Admin can create dashboard  
16. Widgets use real Prisma counts  
17. Number sequence unique under concurrent requests  
18. Workflow transition requires permission  
19. BOM governance cannot be bypassed via admin  
20. Price governance cannot be bypassed  
21. AuditEvent on admin ops  
22. AuditEvent immutable (PATCH/DELETE 405/403)  
23. Arbitrary SQL impossible  
24. Unauthorized admin API 403  
25. Increments 1–11 (+ commercial pricing) green  

Also: `tsc --noEmit` and full `npm test`.

---

## 20. Risks

| Risk | Severity | Mitigation |
|---|---|---|
| Broad `SYSTEM_ADMIN` used to approve BOM/prices | High | Separate permissions; tests |
| Customer isolation broken by report engine | High | Allowlist + server field filter |
| Dual Increment 12 (pricing vs admin) confusion | Medium | Preserve pricing plan; don’t rewrite pricing |
| Password migration plaintext → hash | High | Hash on first login or forced reset |
| `customerId` string → FK breaks inquiries | High | Seed + map before FK constraint |
| Fake dashboards remaining in old tabs | Medium | Leave old screens labeled prototype or wire to real metrics |
| Low-code used to store costing rates | High | Entity allowlist; forbid CostingRun custom numeric “cost” |
| Concurrent sequences | Medium | Transaction + row lock |
| JWT secret still in source | High | Env-only; rotate |
| Demo `loginAsUser` | High | Remove from production UI |
| Scope explosion (full low-code platform) | High | Stage B phases (see § Stage B phasing) |

---

## 21. Explicit out-of-scope items

- Rewriting costing / BOM / price / cable authority domain formulas  
- D365 / MES / Advaris live integration  
- Drum costing, process/labour/energy costing  
- Customer-specific selling prices beyond existing commercial pricing engine  
- Arbitrary SQL/JS in reports  
- Editing/deleting AuditEvent  
- MFA implementation (field `mfaStatus` may exist as NOT_CONFIGURED)  
- Real SMTP/email provider (store metadata only; secrets in env)  
- Replacing Technical Office with a generic workflow toy  
- Arabic as a complete product translation in v1 (admin EN first unless already present)  
- Deleting mock ERP sales-order screens until replaced with real order data  
- ELAND Excel costing Stage B (separate forensic track)

---

# Stage A — Required answers

### 1. What already exists?

JWT auth (in-memory users), module-boolean RBAC, Prisma AuditEvent + localStorage audit, inquiry/quotation with string `customerId`, Technical Office/costing/pricing governance, UserManagement UI (client-only), RoleManagement prototype, fake executive dashboards, CableParameter lookups, commercial pricing rules.

### 2. What must be reused?

Prisma, Express routers, `RequestActor` + JWT verify, `rbac.ts` asserts as adapters, `AuditEvent` append-only, CommercialInquiry/Quotation, CostingRun, existing TO workbenches, Energya UI tokens, increment tests 1–11 + pricing.

### 3. What must be extended?

`AuditEvent` indexes/metadata; JWT claims to carry `customerId` + permission codes; Sidebar with Administration; inquiry numbering via sequences; customer isolation to use Customer master.

### 4. What new database models are required?

UserAccount, Role, Permission, RolePermission, UserRole, Customer, OrganizationUnit, UserSession, CustomFieldDefinition, CustomFieldValue, ReferenceDataType/Value, NumberSequence, WorkflowDefinition/State/Transition, ReportDefinition/Field/Filter, Dashboard/Widget, ImportTemplate, SystemConfiguration.

### 5. What APIs are required?

`/api/admin/*` catalog in §10; keep `/api/auth/login|me|refresh`.

### 6. What UI screens are required?

Administration Center sub-modules in §11.

### 7. How will low-code fields work?

Definition rows + typed value rows; validation in domain/API; no schema migrate per field; no executable code.

### 8. How will reports work?

Allowlisted entity/field Prisma query builder; RBAC + customer + field security on `POST /run`.

### 9. How will dashboards work?

Widgets bound to registered metrics/reports; real counts from PostgreSQL.

### 10. How will RBAC work?

Permission triples; roles; server `assertPermission`; legacy booleans derived for compatibility.

### 11. How will customer isolation work?

User.customerId mandatory for customer type; all reads/writes scoped; tests for IDOR.

### 12. How will field-level security work?

Visibility matrix applied on API serialization and report columns.

### 13. How will audit work?

Prisma append-only; GET search UI; no mutate; admin actions logged.

### 14. How will number sequences work?

DB row per entity; transactional increment; server-only generation.

### 15. What must remain hard-coded in domain services?

Costing math, 4 gates, BOM conflict rules, price overlap/UOM/currency, cable authority, quotation immutability, markup vs margin.

### 16. What must NEVER become configurable?

Audit deletion, SQL/JS injection, disabling isolation, silent zero prices, averaging BOM duplicates, customer seeing internal cost, admin auto-approving BOM/price without business permission.

### 17. What are the security risks?

See §20.

### 18. What migration steps are required?

See §17.

### 19. What tests are required?

See §19 (25+ plus regression).

### 20. What is explicitly out of scope?

See §21.

---

## Proposed Stage B phasing (for approval — not started)

| Phase | Scope |
|---|---|
| **B1** | UserAccount + Role + Permission in PostgreSQL, hashed passwords, admin Users/Roles UI, server enforcement, audit GET |
| **B2** | Customer master + isolation + org units |
| **B3** | Reference data + number sequences wired to INQ/QUO/CR/TCR |
| **B4** | Custom fields (safe entities) |
| **B5** | Report + dashboard builders on real data; retire fake KPI cards from admin dashboards |
| **B6** | Workflow metadata (routing only), import templates, system branding config, security center |

**Do not start B1 until this plan is approved.**

---

## Files that would change in Stage B (preview only)

**Change:** `prisma/schema.prisma` + new migration; `server.ts` auth store; new `src/server/admin/*`; `src/server/rbac.ts` (extend); `Sidebar.tsx` / `App.tsx` / `types.ts`; new Administration UI folder; `commercialRepository.ts` sequences + customer FK after seed; docs listed in the increment request.

**Do not change:** `costingEngine.ts` formulas, BOM governance services, price overlap logic, commercial pricing math, Excel workbooks, historical CostingRuns.

---

**STAGE A COMPLETE. WAITING FOR EXPLICIT APPROVAL BEFORE STAGE B.**
