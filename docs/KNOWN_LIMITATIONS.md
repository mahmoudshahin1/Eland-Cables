# Known limitations

## Phase 1 named forensic files (not in this repo)
These were requested but **were not produced** in this tree. Do not invent them:

- PROJECT_FORENSIC_ASSESSMENT.md
- AI_STUDIO_FUNCTIONAL_BASELINE.md
- VSC_CLAUDE_FUNCTIONAL_ASSESSMENT.md
- FUNCTIONAL_GAP_ANALYSIS.md
- LOST_FUNCTIONALITY_REGISTER.md
- EXCEL_MASTER_DATA_ANALYSIS.md
- CABLE_DOMAIN_MODEL.md
- QUOTATION_DOMAIN_MODEL.md *(closest: `INQUIRY_QUOTATION_DOMAIN_MODEL.md`)*
- BOM_AND_RAW_MATERIAL_MODEL.md
- DRUM_DOMAIN_MODEL.md *(closest: `DRUM_MASTER_DOMAIN.md`)*
- CALCULATION_ENGINE_SPECIFICATION.md
- TARGET_SYSTEM_ARCHITECTURE.md
- TARGET_DATABASE_MODEL.md
- D365_INTEGRATION_ARCHITECTURE.md *(superseded by approved baseline below — not produced under that filename)*
- IMPLEMENTATION_ROADMAP.md

Available instead: `MASTER_DATA_CURRENT_STATE_ASSESSMENT.md`, `MASTER_DATA_RELATIONSHIP_MODEL.md`, `DRUM_MASTER_DOMAIN.md`, `INQUIRY_QUOTATION_DOMAIN_MODEL.md`, `PHASE_1_BACKEND_FOUNDATION_ASSESSMENT.md`.

## D365 F&O quote-to-cash (architecture baseline)

`D365_INTEGRATION_ARCHITECTURE.md` was never produced. Use these instead:

- **Approved spec (v1.0):** [`D365_FO_QUOTE_TO_CASH_INTEGRATION_SPECIFICATION.md`](./D365_FO_QUOTE_TO_CASH_INTEGRATION_SPECIFICATION.md)
- **Phase 1 gap analysis:** [`D365_FO_QUOTE_TO_CASH_PHASE1_GAP_ANALYSIS.md`](./D365_FO_QUOTE_TO_CASH_PHASE1_GAP_ANALYSIS.md)
- **Adapter rule:** ADR-004 in [`ARCHITECTURE_DECISIONS.md`](./ARCHITECTURE_DECISIONS.md) — domain must not call D365 HTTP; adapters stay `NOT_IMPLEMENTED` until a later phase

**Phase 1 standalone commercial fulfillment domain is FROZEN (2026-08-31).** See [`PHASE1_QUOTE_TO_CASH_FREEZE.md`](./PHASE1_QUOTE_TO_CASH_FREEZE.md). Three Sales Order entry points:

1. **MTO Quotation** → Commitment → Direct SO (`orderOrigin=QUOTATION`, mode `MTO`)
2. **MTO Agreement** → Commitment → Agreement → Release → SO (`orderOrigin=AGREEMENT_RELEASE`, mode `MTO`)
3. **Direct MTS** → SO without quotation or Commercial Commitment (`orderOrigin=DIRECT_MTS`, mode `MTS`; cable must be `MTS` or `MTO_MTS`)

Order Origin and Order Fulfillment Mode are separate fields. New documents use `integrationStatus = NOT_SENT`. Live D365 posting is still out of scope (adapters `NOT_IMPLEMENTED`). HTTP stub remains `connected: false` / `NOT_CONNECTED`. Do not claim D365 complete.

**Operational UI layer (in progress):** Internal **Sales Orders** tab hosts the fulfillment workspace (orders / agreements / Direct MTS). Quotation detail shows approve → Direct SO | Sales Agreement with confirmation. Customers do not get Sales fulfillment actions. Domain rules remain server-side and frozen. After UI stabilize, revisit D365 when ERP is ready — not now.

After pulling Phase 1 routes, **restart the Express server** (`npm run dev`) so `/api/sales-orders` (including `/direct-mts`), `/api/sales-agreements`, `/api/commercial-commitments`, and `/api/agreement-releases` paths load.

**Known Direct MTS limits:** no live inventory reservation; `availableStockQuantity` is an optional snapshot on the line.

## Persistence and identity (current)

Verified against Prisma schema, `identityAuthRoutes` / `identityService`, `commercialRepository`, and `passwordService` (2026-08-29):

- **PostgreSQL + Prisma 6** is the source of truth for cable/BOM/RM/drum masters, commercial inquiries and quotations (`CommercialInquiry`, `CommercialQuotation`), identity (`UserAccount`, roles, sessions, `PasswordResetTicket`), customers, costing configuration and runs, and `AuditEvent`.
- Identity login is `identityAuthRouter` (`POST /api/auth/login` and related). Passwords are stored as **bcrypt** in `UserAccount.passwordHash`; `verifyPassword` accepts bcrypt hashes only (no plaintext compare).
- Inquiry/quotation create and update persist via Prisma (`createInquiry` → `prisma.commercialInquiry.create`, `/api/inquiries`, `/api/quotations`).

### Historical (no longer true)

- Early Phase 1 used in-memory / localStorage inquiries and users, and documented passwords as plaintext in a `passwordHash` field. That is **not** the current identity or commercial path.
- `GET /api/d365/sync-status` previously returned `connected: true` without calling D365. The HTTP stub now returns **`connected: false`** / `NOT_CONNECTED` (same for Advaris MES). It still does not call a live ERP.

## Remaining technical limitations

- Dual-write: Import Center and some catalog/BOM/RM UI services still write **browser localStorage** after or beside PostgreSQL validation (`cableCatalogService`, `cableBomService`, `rawMaterialMasterService`, import pipeline). Health endpoint still describes dual localStorage + PostgreSQL until those domains fully cut over.
- Official cables lack approved family/voltage/cores mapping (`docs/ENGINEERING_DATA_MAPPING.md`). Structured EXISTING_CABLE is not available for those 432 rows.
- 81 BOM conflicts remain BUSINESS_DECISION_REQUIRED (`docs/BOM_CONFLICT_RESOLUTION.md`).
- DrumCompatibility table exists but is empty (`CONFIGURATION_REQUIRED`).
- UI hide/show of nav is not a substitute for API checks. Many commercial, master-data, TO, and costing routes use `src/server/rbac.ts`; leftover client-only permission gates can still exist on older screens.
- Costing formulas are Prisma `CostingFormula` / formula engine, not `CostingPricing.tsx` (that file is a deprecated re-export of `CostingHub`).
- Dual drum identity (EWD vs K/S/P).
- Quotation version overwrite behavior (see commercial domain docs).
- `QT-ELAND-10042` V2 OPEN not in seed.
- All official RM prices blank.
- Drum List.xlsx units not in file.
- Audit log is dual: Increment 1 `auditLogService` localStorage helper plus PostgreSQL `AuditEvent` for master-data and identity writes.
- JWT in localStorage is a **session cache**, not the identity store.
- Demo `mockUsers` / `loginAsUser` can still apply when `demoAuth` allows (see `docs/DEPRECATED_FEATURES.md`).
