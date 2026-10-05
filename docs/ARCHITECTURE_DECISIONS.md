# Architecture decisions

Increment 1 (Phase 2A) records decisions. Existing forensic notes in `docs/PHASE_1_BACKEND_FOUNDATION_ASSESSMENT.md` remain authoritative for “what exists today.”

## ADR-001 — Stay on the current stack

**Decision:** Continue Vite + React 19 + Express (`server.ts`). Do **not** introduce NestJS or Prisma in Increment 1.

**Reason:** The repo does not already use Nest/Prisma. Migrating now would be preference, not a forensic requirement, and would risk the approved UI and working prototype flows.

**Consequence (Increment 1):** Persistence stayed process memory (users) + browser `localStorage`.

## ADR-007 — PostgreSQL via Prisma in Express (Increment 2)

**Decision:** PostgreSQL is the production target. Prisma 6 is the schema/migration/client inside the existing Express process. **NestJS is not introduced.**

**Reason:** Prisma provides versioned SQL migrations and a typed client without replacing `server.ts`. Increment 2 is dual-write: validate → PostgreSQL transaction → existing localStorage services. Do not drop localStorage until the matching API path is proven.

**Consequence:** `DATABASE_URL` required for `/api/master/*` writes. Import Center still commits localStorage after validation if PostgreSQL is down.

## ADR-002 — Modular monolith

**Decision:** Logical modules listed in `src/platform/modules.ts`. One deployable app.

**Reason:** Phase 2 instruction: modular architecture, not microservices.

## ADR-003 — Domain errors instead of silent zeros

**Decision:** `DomainError` codes `PRICE_NOT_CONFIGURED`, `CONFIGURATION_REQUIRED`, `DATA_REQUIRED`, `BUSINESS_RULE_REQUIRED`.

**Reason:** Blank RM prices and unsigned drum formulas must not become 0 or unsafe auto-picks.

## ADR-004 — D365 behind adapters only

**Decision:** Interfaces in `src/platform/integration/d365Adapters.ts`. Methods return `NOT_IMPLEMENTED`. Domain services must not call D365 HTTP APIs.

**Reason:** No D365 integration in this increment. Existing `GET /api/d365/sync-status` is a prototype stub and is **not** the adapter (honest status: `connected: false` / `NOT_CONNECTED`).

**Baseline docs:** Approved quote-to-cash design is [`D365_FO_QUOTE_TO_CASH_INTEGRATION_SPECIFICATION.md`](./D365_FO_QUOTE_TO_CASH_INTEGRATION_SPECIFICATION.md) (v1.0). Phase 1 standalone EPC fulfillment is **FROZEN** (2026-08-31), including the Direct MTS exception (SO without Commercial Commitment for MTS-eligible cables). Live D365 remains out of scope until Phase 5+ — see [`PHASE1_QUOTE_TO_CASH_FREEZE.md`](./PHASE1_QUOTE_TO_CASH_FREEZE.md) and [`D365_FO_QUOTE_TO_CASH_PHASE1_GAP_ANALYSIS.md`](./D365_FO_QUOTE_TO_CASH_PHASE1_GAP_ANALYSIS.md). Next: UI refinement + operational workflow (ERP work continues in parallel).

## ADR-005 — Approved UI is frozen for this increment

**Decision:** No logo, theme, font, or header-bar restoration in Increment 1.

## ADR-006 — One commercial transaction family

**Decision:** Inquiry and Quotation remain one UI/domain family (`ErpRequestHeader`). Non-destructive versioning is a later increment (current overwrite is documented as non-compliant).
