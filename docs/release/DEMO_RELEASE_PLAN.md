# Energya Connect — Demo Release Plan

## 1. Executive Summary & Release Scope
Energya Connect is a modular monolith web application tailored for industrial cable engineering, dynamic costing, commercial inquiry workflow, drum packaging optimization, and quotation management.

This release preparation establishes the complete, production-grade deployment specification for hosting the Energya Connect demonstration platform without modifying business logic, engineering rules, or database models.

---

## 2. Platform Architecture Audit

### 2.1 Technology Stack
- **Frontend SPA:** React 19.0.1, TypeScript 5.8.2, Vite 6.2.3, Tailwind CSS v4 (`@tailwindcss/vite`), Lucide React icons, Recharts, Motion, Three.js.
- **Backend API Server:** Node.js (v20+ LTS recommended, v22 compatible), Express 4.21.2, bundled for production into `dist/server.cjs` via `esbuild`.
- **Database & ORM:** PostgreSQL 16 (or AWS RDS / Azure Database for PostgreSQL), Prisma ORM 6.16.2 with 29 tracked migrations.
- **Authentication & Security:** JSON Web Tokens (JWT) signed via `jsonwebtoken` (15m access token, 7d refresh token), password hashing via `bcryptjs` (12 salt rounds), session revocation tracking in PostgreSQL, RBAC permissions catalog with customer tenant isolation.
- **Attachment Storage:** In-database PostgreSQL storage using `bytea` binary fields (with an 8 MB ceiling per file and Base64 REST encoding) across Cable Master and Commercial Inquiry lines.

---

## 3. Codebase Component Inventory

### 3.1 API Route Map (`server.ts` & `src/server/*`)
The backend is structured into modular Express routers mounted under the `/api` prefix:

| Mount Path | Router Module | Purpose / Responsibility |
| :--- | :--- | :--- |
| `/api/auth` | `identityAuthRouter` | User authentication, token issuance, refresh, password reset, session logout |
| `/api/admin` | `adminIdentityRouter` | User administration, role assignments, account locking, admin password resets |
| `/api/admin` | `adminCustomerRouter` | Customer master management, customer-to-user scoping and linkage |
| `/api/admin/costing` | `costingAdminRouter` | Costing configuration versions, formula authoring, scrap rules, FX governance |
| `/api/admin/platform` | `platformAdminRouter` | System maintenance, master data imports, migration execution, health probe |
| `/api/platform` | `platformDbRouter` | DB connectivity checks, system status, platform health |
| `/api/master` | `masterDataRouter` | Cable catalog, Raw Materials, BOM lines, Drum definitions, import batches |
| `/api/master/commercial-pricing-rules` | `pricingMasterRouter` | Pricing rules governance, tier configurations, discount limits |
| `/api/cables` | `cableAuthorityRouter` | 3-state cable authority validation (`EXISTING_CABLE`, `NEW_DESIGN_REQUIRED`, `CONFIGURATION_REQUIRED`) |
| `/api/technical-office` | `technicalOfficeRouter` | Technical office review queue, mapping approvals, design verification |
| `/api/costing` | `costingRouter` | Costing runs, dynamic formula calculations, layer breakdowns, readiness probes |
| `/api/commercial-pricing` | `commercialPricingRouter` | Commercial pricing calculations, markup/margin layers, quotation pricing |
| `/api/inquiries` | `inquiriesRouter` | Commercial inquiries CRUD, line value calculations, incoterms, metal pricing, status workflow |
| `/api/quotations` | `quotationsRouter` | Quotation generation from inquiries, locked costing snapshot replication, commercial totals |
| `/api/ai/assistant` | `postAiAssistant` | Optional Gemini AI assistant integration for commercial & technical support |
| `/api/d365/sync-status` | Prototype Stub | Reports ERP integration status (`NOT_CONNECTED`) |
| `/api/advaris/mes-status` | Prototype Stub | Reports MES shop-floor integration status (`NOT_CONNECTED`) |

### 3.2 Client Application Architecture & SPA Routing
- **Entrypoint:** `src/main.tsx` initializing `BrowserRouter`, `AuthProvider`, `LanguageProvider`, and `AppShell`.
- **Route Navigation Map:**
  - `/login`: Unified login portal supporting role-based entry.
  - `/dashboard`: Role-aware executive and commercial dashboard (internal or customer view).
  - `/inquiries`: Commercial inquiry management and creation workspace.
  - `/inquiries/:id`: Detailed inquiry workspace (cable selection, technical offer, drum schedule, costing, quotations).
  - `/quotations`: Commercial sales quotation index and details.
  - `/cable-configurator`: Advanced cable engineering configurator and technical office workspace.
  - `/costing`: Costing manager workspace, formula assignment, scrap rules, exchange rates, readiness matrix.
  - `/drums`: Drum master catalog, drum selection calculator, and cutting workbench.
  - `/admin`: Identity management, customer assignments, role definitions, and audit logs.
- **Client API Calls:** All frontend components use relative `/api/...` endpoints. No client files hardcode localhost or external URLs.

---

## 4. Master Data & Seeding Sequence

To stand up a fully functional demonstration environment with all historical cables, BOM structures, drums, pricing, and demo personas, the deployment sequence executes the following commands:

1. **Database Migration:**
   ```bash
   npm run prisma:migrate
   # Equivalent to: npx prisma migrate deploy
   ```
2. **Identity & Parameter Seeding:**
   ```bash
   npm run prisma:seed
   # Seeds parameter catalogues (Family, Voltage, Conductor, Insulation, etc.)
   # and creates initial demo users in PostgreSQL.
   ```
3. **Master Data Workbooks Import:**
   ```bash
   npm run import:masters
   # Imports data/source/Raw Material List.xlsx (raw materials)
   # Imports data/source/Energya Cable Master Data.xlsx (cables & BOMs)
   # Imports data/source/Drum List.xlsx (drums)
   ```
4. **Costing Operational Readiness Configuration:**
   ```bash
   npx tsx scripts/configureCostingOperationalReadiness.ts
   # Sets up default FX pairs (USD/LE, EUR/LE, GBP/LE), scrap rules, and metal pricing defaults.
   ```

---

## 5. Demo Personas & Credential Roster

> **Production / public demo:** Development default passwords below are **not** acceptable for production seeding. Set a unique `ADMIN_SEED_PASSWORD` (required when `NODE_ENV=production`). Seed rejects `Admin@2026!` and other insecure defaults. Create additional personas via Admin after bootstrap, or seed only in non-production environments.

| Persona Role | Email / Username | Default Password | Access Level & Scope |
| :--- | :--- | :--- | :--- |
| **System Administrator** | `admin@energya.com` | **Production:** `ADMIN_SEED_PASSWORD` only · **Dev:** `Admin@2026!` *(or `ADMIN_SEED_PASSWORD`)* | Full platform administration, user management, audit logs, costing configuration |
| **IT Director** | `ehab.maher@energya.com` | Dev seed: `Admin@2026!` *(or `ADMIN_SEED_PASSWORD`)* | Full administrative and security configuration access |
| **Sales Manager** | `sales@energya.com` / `m.ahmed@energya.com` | `Sales@2026!` (dev seed only) | Commercial inquiries, quotations, customer pricing, commercial dashboard |
| **Technical Design Engineer** | `technical@energya.com` | `Tech@2026!` (dev seed only) | Cable configurator, technical office approvals, cable master attachments |
| **Costing Manager** | `k.salem@energya.com` | `Admin@2026!` (dev seed only) | Costing engine, formulas, scrap rules, exchange rates, costing runs |
| **Plant / Procurement Director** | `n.nabil@energya.com` | `Admin@2026!` (dev seed only) | Raw material prices, BOM structures, drum master |
| **Customer (ELAND Cables)** | `david.smith@elandcables.com` / `eland.cables` | `Customer@2026!` (dev seed only) | Customer Portal: Inquiries, Quotations, Order status (Strict tenant isolation `c-eland`) |

---

## 6. Release Milestones & Phase Schedule

```
┌─────────────────────────────────────────────────────────────────────────┐
│                       DEMO RELEASE TIMELINE                             │
├─────────────────────────────────────────────────────────────────────────┤
│ Phase 1: Release Audit & Documentation Baseline                 [DONE]  │
│ Phase 2: Environment Configuration Specification                [DONE]  │
│ Phase 3: Database & Migration Readiness Verification            [DONE]  │
│ Phase 4: Production Build & Asset Verification                  [DONE]  │
│ Phase 5: Security Clearance & Production Guard Audit            [DONE]  │
│ Phase 6: End-to-End Demo Smoke Test Plan Specification          [DONE]  │
│ Phase 7: Automated Test Suite & TypeScript Verification         [DONE]  │
│ Phase 8: Deployment Architecture & Hosting Runbook              [DONE]  │
│ Phase 9: Final Executive Synthesis & Release Package            [DONE]  │
└─────────────────────────────────────────────────────────────────────────┘
```
