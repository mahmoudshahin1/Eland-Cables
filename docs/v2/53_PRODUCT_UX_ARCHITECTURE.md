# TASK 07 — Energya Connect V2 Product & UX Architecture

**Date:** 2026-09-12  
**Mode:** Architecture / product design **only**  
**Status:** **DESIGN ONLY** — **NOT IMPLEMENTED** — **NOT IMPLEMENTATION AUTHORIZED**  
**Supersedes as the canonical product/UX spec:** [09](./09_V2_UI_UX_ARCHITECTURE.md) remains Task 01 assessment; **this document is the P1.5 product architecture**. Do not treat Doc 09 as authorization to ship UI.  
**Aligns with (do not reopen):** [04](./04_V2_MODULE_ARCHITECTURE.md), [07](./07_V2_SECURITY_ARCHITECTURE.md), [11](./11_V1_V2_RUNTIME_BOUNDARY.md), [12](./12_MODULE_REGISTRY.md), [13](./13_EFFECTIVE_ACCESS.md), [14](./14_METADATA_FOUNDATION.md), [36](./36_INQUIRY_PROCESS_FOUNDATION.md), [46](./46_CONTAINER_STUDY_INTEGRATION_ARCHITECTURE.md)–[51](./51_B4D_FINANCIAL_AGGREGATION_ARCHITECTURE.md), [52](./52_CUSTOMER_MASTER_ARCHITECTURE.md), `docs/design/DESIGN_SYSTEM.md`

This document does **not** implement UI, CSS, routes, APIs, schema, tests, seed, or Customer records. It does **not** invent domain rules. Frozen B4-A/B/C/D, Costing V2, Pricing, Quotation issue, and Customer Master design remain authoritative.

**Stop after this design.** Do not start P1.5-02 Design System until this document is reviewed and explicitly approved.

---

## 1. Purpose

Define the **product and UX architecture** for Energya Connect V2 **before** UI redesign.

The experience must express the already-frozen lineage:

```text
V2 Cable Configuration
  → Cutting Length Plan
  → Drum Plan (CONFIRMED)
  → Shipment Group → Container Study → Input Snapshot → Result
  → Shipment Cost Snapshot (B4-C)
  → Costing (internal) → Pricing → CommercialPricingSnapshot
  → FinancialOfferSnapshot (B4-D SoT)
  → Quotation approval / issue
  → Commitment → Fulfillment
```

UX may **present** these artifacts. UX may **not** reinterpret ownership, totals, or snapshot immutability.

---

## 2. Product identity

| Item | Value |
|------|--------|
| **Product** | **ENERGYA CONNECT** |
| **Company** | Energya Power Cables |
| **Lockup** | Existing `public/logo.png` via `BrandLogo` — never redraw, recolor, or duplicate |
| **Wordmark** | “Connect” optional beside the lockup; never “EPC Platform”, “ERP”, or a second logo |

**Positioning:**

> Digital B2B platform for cable configuration, engineering collaboration, commercial quotation, shipment planning and order fulfillment.

The product is a **cable-manufacturing commercial workspace**, not a generic CRM/ERP skin and not a D365 clone. D365 remains a later execution/integration boundary (ADR-004).

---

## 3. Experience architecture

Three **separate** experiences share one backend. Do **not** merge customer and internal navigation because APIs are shared.

```text
Energya Connect
│
├── Public / Authentication          /  and /login*     (V1 preserved)
│   ├── Landing
│   ├── Login
│   └── User lifecycle
│
├── Customer Portal                  /v2/customer/*     (V2 target)
│   └── B2B buyer journey
│
└── Internal Portal                  /v2/internal/*     (V2 target)
    └── Energya operational workspace
```

**V1 remains runnable:** `/customer/*`, `/internal/*` (Doc 11). V2 UX lives under `/v2/*`. Do not silently migrate V1 screens into V2 as part of this task.

| Experience | Audience | Density | Primary job |
|------------|----------|---------|-------------|
| Public | Unauthenticated | Marketing-simple | Trust, login, recover access |
| Customer Portal | `userType = customer` | Simpler, responsive | Configure → inquire → review quote → track fulfillment |
| Internal Portal | `userType = internal` | Desktop-first ERP density | Engineer, cost, price, quote, pack, govern |

---

## 4. Customer journey

Canonical path (customer-visible stages). Actors are labeled; UX must not collapse them.

```text
Login                                              [customer action]
  ↓
Customer Dashboard                                 [customer]
  ↓
My Inquiries                                       [customer]
  ↓
New Inquiry                                        [customer action]
  ↓
V2 Cable Configuration                             [customer action + system validation]
  ↓
Cutting Length requirements / plan                 [customer input + system plan]
  ↓
Drum Selection → Drum Plan                         [recommendation vs confirmed artifact]
  ↓
Shipment / Container (preference / study status)   [preference ≠ group ≠ study ≠ B4-C]
  ↓
Submit or VIP Calculate                            [customer action; process not chosen by customer]
  ↓
Energya Engineering / Costing / Pricing            [internal]
  ↓
Financial Offer Snapshot                           [system aggregation; immutable]
  ↓
Quotation (issued)                                 [internal issue → customer visible]
  ↓
Customer approval / Commitment                     [customer + internal commercial]
  ↓
Sales Order / Agreement                            [internal fulfillment; Phase 1 frozen]
  ↓
Fulfillment Status                                 [customer-visible status only]
```

| Kind | Examples | UX treatment |
|------|----------|----------------|
| **Customer action** | New inquiry, configure, enter cuts, submit, accept quote | Primary CTAs |
| **System calculation** | Matching cables, drum recommendation, container first-fit, pricing engine, B4-D totals | Show result + provenance; not “AI magic” |
| **Energya internal action** | TO mapping, costing run, rate governance, quotation issue | Customer sees **waiting** / status, not the workbench |
| **Approval** | Pricing approval, quotation approve/issue, commercial fulfillment approve | ApprovalBar; never fake approved |
| **Locked snapshot** | CONFIRMED drum plan, LOCKED group, B4-C, pricing snapshot, Financial Offer | SnapshotBanner |
| **Historical artifact** | SUPERSEDED study/offer/quotation version | Read-only, version label |

VIP Calculate may produce a **quotation DRAFT** (and later an offer). It must **not** look like automatic **issue** or **customer-facing approval**.

STANDARD Submit sends the inquiry into Energya processing. The customer waits; they do not run costing.

---

## 5. Inquiry UX

**One inquiry workspace** for both `VIP_FAST_TRACK` and `STANDARD_WORKFLOW`.

The customer **never selects** process type. Resolution remains Doc 36:

```text
Customer.defaultInquiryProcessCode
  → CustomerGroup.defaultInquiryProcessCode
  → SYSTEM_DEFAULT (STANDARD_WORKFLOW)
```

Client body cannot override process. UX may show a **read-only** process label (“VIP Fast Track” / “Standard”) after assignment.

Preserve orthogonality:

| Field | Meaning | UX |
|-------|---------|-----|
| `inquiryProcessCode` | Business process (VIP vs STANDARD) | Read-only badge; drives CTA (Calculate vs Submit) |
| `workflowChannel = V2_CONFIGURATION` | Technical configuration path | Configurator chrome; not a process picker |

**VIP:** primary CTA **Calculate** when gates allow. Success copy: draft quotation / offer **prepared for Energya review** — not “Your quote is issued.”  
**STANDARD:** primary CTA **Submit**. Success copy: received for Technical Office / engineering.

Honesty: if BOM/engineering blocks Calculate or Submit, show ValidationSummary — never a green “ready” stepper step.

**V1 note (do not implement here):** customer portal today reuses an 8-tab shell that includes a **Costing** tab. V2 customer IA **must not** present internal cost build-up. Customer “commercial” view is quotation / financial offer totals only (§19).

---

## 6. Engineering UX

Surfaces (customer sees **outcomes**; internal sees **work**):

| Topic | Customer | Internal |
|-------|----------|----------|
| Cable configuration | Guided V2 configurator, catalog vs custom honesty | Same snapshots + governance |
| Technical validation | Pass / fail / incomplete in plain language | Codes, conflict counts, lineage |
| Engineering completeness | Blocked vs complete | TO queue, mapping status |
| BOM readiness | “Specification not ready” if Gate 2 blocks | 81-conflict governance, never fake 0 |
| Technical Office requests | Status + clarification requests | TCR workbench |
| Attachments | Specs the customer uploaded / received | Full TO pack |
| Engineering status | Journey stage only | Mapping / BOM / clearance states |

**Principle:** blocked and incomplete states are first-class. Do not paint a stepper complete to soothe the workflow.

---

## 7. Cutting Length UX

Frozen model:

```text
Inquiry Line
  └── Cutting Length Requirements[]
       └── Cutting Length Plans[]
            └── Drum Plans[]
```

UX copy:

- **Requirement** = what the customer asked (lengths, repetition).
- **Requested drum count** = repetition/input, **not** automatically the final physical drum population.
- **Plan** = system/engineering cutting plan version.
- **Confirmed Drum Plan** = authoritative downstream input to container study / costing.

Show version, current vs superseded. Customer edits requirements on DRAFT inquiry lines; confirmed plans are read-only with SnapshotBanner.

---

## 8. Drum UX

**Separate two concepts in navigation and copy:**

| Drum Selection | Drum Plan |
|----------------|-----------|
| Recommendation / decision UI | Versioned planning artifact |
| Deterministic candidates, manual override | Validate → confirm → SUPERSEDED successor |
| Ephemeral until persisted | Immutable after CONFIRMED (successor = new version) |

Support (already in domain; UX must name them):

- deterministic recommendations
- manual override
- multiple requirements / multiple plans
- physical drum population (instances)
- validation errors (capacity, compatibility)
- CONFIRMED vs SUPERSEDED vs DRAFT

Never label a selection list “Confirmed packing.” Container study consumes the **confirmed plan**, not live selection widgets.

---

## 9. Shipment / Container UX

```text
Customer port/incoterm preference     (Doc 52 — suggestion only)
        ↓  (pre-fill DRAFT only)
Shipment Group identity               (B4-A — LOCKED dest/incoterm/membership)
        ↓
Container Study
        ↓
Input Snapshot
        ↓
Calculation Result (CONFIRMED)
        ↓
Shipment Cost Snapshot (B4-C)
```

Modes (customer does not invent grouping): `ENTIRE_INQUIRY` | `PER_INQUIRY_LINE` | `DESTINATION_CLUSTER`.

| Concept | UX language |
|---------|-------------|
| Customer preference | “Suggested port / Incoterm” |
| Shipment group | “Shipment identity (locked when confirmed)” |
| Container study | “Packing study” |
| Confirmed result | “Confirmed packing result” |
| Shipment cost snapshot | “Customer shipment cost (frozen)” |

Never imply preference overrides technical fit, LOCKED identity, or B4-C copied codes. Unallocated drums = hard block, not a warning toast that looks optional.

Customer may see **destination, Incoterm, container type/count, shipment total on issued documents**. They do not get B4-B master APIs or rate workbenches.

---

## 10. Financial Offer UX

B4-D (do not compete):

```text
CommercialQuotation DRAFT
  → CommercialQuotationLine
  → CommercialPricingSnapshot
        +
ShipmentCostSnapshot(s)
        ↓
FinancialOfferSnapshot          ← aggregation SoT
        ↓
Issued quotation presentation   ← generated from / pinned to the offer
```

**Do not** introduce another “offer total” (including `commercialOfferSnapshot` JSON as SoT).

Customer-facing issued document sections (DF-A-35 order):

1. Product lines (description, qty, unit price, line total)  
2. **Products Total**  
3. Shipping lines (dest, Incoterm, type, qty, rate, group total)  
4. **Shipping Total**  
5. **Inquiry / Final Total**  
6. Currency  

Cable **unit price remains cable commercial price only**. Shipping is a **separate** component. Metal shipping stays **internal** (never on this screen).

`VIP_SHIPMENT_NOT_CONFIGURED` is a **stored internal warning** (D4-D-4). Customer visibility is quotation/presentation logic later — Task 07 does **not** make it a customer toast by default.

Internal Financial Offer workspace: version, isCurrent, pins, warnings. No PATCH; correction = new version.

---

## 11. Customer quotation experience

| Surface | Content |
|---------|---------|
| Quotation list | Number, version, status, validity, totals (issued only for customers) |
| Quotation detail | Technical offer + commercial/financial offer as **two sections** |
| Technical offer | Configured cable summary, cutting/drum as commercially appropriate, packing/tolerance |
| Financial / commercial offer | Products / shipping / final totals from pinned FinancialOfferSnapshot |
| Validity | `validUntil` / validity days |
| Metal price adjustment | Only if already a **commercial term** on the issued document — not LME worksheets |
| Delivery / payment / Incoterm / destination | Transaction values (copied), not live Customer Master |
| VAT | Commercial term if present on issued quote |
| Acceptance / warranty | Terms section; not costing |

**Technical Offer ≠ Financial Offer.** Do not mix RM kg and selling price in one customer table.

Draft quotations are **internal**. Customer portal shows **issued** pins only (B4-D / Doc 51).

---

## 12. Internal portal architecture

Organize by **Energya operational responsibility**, not D365 modules.

| Area | Job | Typical modules |
|------|-----|-----------------|
| Dashboard | Queues + honest KPIs | Home |
| Inquiry / Engineering | Config lineage, completeness | INQUIRY_QUOTATION, CABLE |
| Technical Office | Mapping, TCR, BOM governance | ENGINEERING, BOM |
| Costing | Runs, formulas, Option B metal | COSTING |
| Pricing | Rules, snapshots, approvals | PRICING |
| Commercial | Quotations, commitments, fulfillment | INQUIRY_QUOTATION, SALES, COMMERCIAL |
| Logistics | Groups, studies, ports, rates, B4-C | LOGISTICS |
| Master Data | Cables, drums, customers, currencies | CABLE_MASTER, CUSTOMER, … |
| Analytics | Whitelist KPIs only | REPORTING |
| Administration | Identity, roles, sequences, audit | ADMIN, SECURITY |

D365 is **not** a menu. Integration status remains `NOT_CONNECTED` until a later increment.

Role-aware: a Costing User should land in Costing, not a fake “all modules” tree.

---

## 13. Navigation model

| Layer | Behavior |
|-------|----------|
| **Global** | Product lockup **ENERGYA CONNECT**, portal switcher (internal only), user menu, customer context chip for internal acting in scope |
| **Module** | Internal: grouped navigator (Doc 12); hide PLANNED/NOT_IMPLEMENTED by default |
| **Contextual** | Inquiry workspace tabs **differ by portal** (V2): customer vs internal sets |
| **Breadcrumbs** | Module › Workspace › Record › Artifact version |
| **Workspace / dashboard** | Queue tiles + live metrics only — no invented ERP connectivity |
| **Detail** | List → header → lines → drawers |
| **Back** | Return to list/workspace; do not wipe unsaved DRAFT without confirm |
| **Customer vs internal** | Separate shells and route prefixes; customers never see `/v2/internal` IA |

**Role-aware navigation:** show only modules/actions EFFECTIVE ACCESS allows. **UI hide is not security** (Doc 07 / 13). APIs remain deny-by-default.

---

## 14. Status architecture

Use **domain statuses that exist**. Do not fabricate a single mega-enum.

Visual language (tokens: warning / info / success / error / muted):

| Token (examples) | Typical meaning | Where it is real |
|------------------|-----------------|------------------|
| DRAFT | Editable working copy | Inquiry, quotation, study, drum plan, rates |
| SUBMITTED | Handed to Energya | Inquiry process |
| ENGINEERING_* / blocked / complete | Engineering pipeline | Inquiry / mapping / BOM — use **actual** field names in UI |
| READY_FOR_COMMERCIAL | Gates passed | Existing commercial readiness — only if domain says so |
| QUOTED / ISSUED / APPROVED | Commercial document states | Quotation / pricing / commercial approval — **distinct** |
| CONFIRMED | Frozen operational fact | Drum plan, container study |
| SUPERSEDED | Replaced by successor; still readable | Groups, studies, offers, quotations |
| LOCKED | Identity frozen | Shipment group |
| NOT_IMPLEMENTED / NOT_CONNECTED | Honest stub | D365, blocked engines |
| PARTIAL / PLANNED / FROZEN | **Module registry**, not inquiry status | Navigator badges — do not put on customer inquiries |

**Inquiry process is not a status.** VIP vs STANDARD is a badge, not a stepper state.

Steppers map to **journey stages** (configuration → cutting → drum → …) with states `not_started` / `in_progress` / `blocked` / `waiting` / `complete` — never mark complete without the underlying artifact.

---

## 15. UI principles

| Principle | Specification |
|-----------|----------------|
| Canvas | White-dominant (`surface-page` / `surface-muted`) |
| Chrome | Navy (`brand-700`–`900`) |
| Accent | Energya vermilion (`accent-500`) for primary/destructive only |
| Logo | Single lockup; product name **ENERGYA CONNECT** |
| Language | Cable manufacturing (drums, cuts, HQ/STD, Incoterms), not “deals/leads” |
| Internal | Desktop-first, ERP-comfortable density |
| Customer | Airier, responsive, fewer columns |
| Reference | `CostingWorkspaceShell` is a **visual reference**, not a clone-for-every-module mandate |
| Motion | Subtle panel/status only |
| Honesty | No fake charts, fake D365, fake “ready” |

---

## 16. Component architecture (design only)

```text
Brand (logo, ENERGYA CONNECT)
  ↓
Design Tokens (@theme — do not reinvent)
  ↓
Application Shell (public / customer / internal)
  ↓
Navigation (global, module, contextual)
  ↓
Workspace (queues, KPIs)
  ↓
Forms / Tables / Cards
  ↓
Domain Components (configurator, drum, container, offer)
  ↓
Workflow Components (stepper, approval, snapshot)
```

Reusable (P1.5-02+; **not this task**):

`PageHeader`, `StatusBadge`, `Stepper`, `WorkspaceShell`, `DataTable`, `DetailPanel`, `Timeline`, `ValidationSummary`, `SnapshotBanner`, `ApprovalBar`, `CalculationSummary`, `EmptyState`, `ErrorState`, `PermissionState`.

Adopt existing `ui/*` and costing primitives where they already match tokens (`docs/design/DESIGN_SYSTEM.md`).

---

## 17. UX for immutable snapshots

Every snapshot view (configuration, cutting plan, drum plan, container input/result, B4-C, pricing, Financial Offer) shows:

| Element | Purpose |
|---------|---------|
| Artifact type + id | What is pinned |
| Version / `versionNo` | Successor lineage |
| Source artifact | e.g. result id, quotation line, group |
| Created at / by | Provenance |
| Current vs historical | `isCurrent` / currentResult |
| SUPERSEDED | Successor link; read-only |
| Locked values | Dest, Incoterm, qty, rates, totals — not live masters |

**SnapshotBanner** copy pattern: “Frozen on {date} from {source}. Changing Customer Master or live rates does not change this document.”

Users must never think they are editing `DestinationPort` or `ShippingCostRate` when viewing a B4-C line.

---

## 18. Errors and blocked states

Enterprise pattern: **What happened → Why → What next → Who owns it.**

| Situation | Happened | Why | Next | Owner |
|-----------|----------|-----|------|-------|
| Missing engineering / config | Cannot submit/calculate | Snapshot/gates incomplete | Complete configuration | Customer or TO |
| BOM conflicts | Costing/config blocked | Gate 2 / unresolved BOM | TO / BOM governance | Technical Office |
| Missing pricing snapshot | Cannot create Financial Offer | D4-D-1 DRAFT quotation not priced | Price quotation | Pricing / Sales |
| Missing shipping rate | Cannot create B4-C | No grain coverage | Logistics rate master | Logistics |
| Ambiguous shipping rate | Cannot create B4-C | Overlap | Disambiguate rates | Logistics |
| Currency incompatible | Nothing persisted | Mixed codes; no FX | Align currency | Commercial |
| Stale drum plan | Confirm/costing blocked | Plan not current | Confirm successor plan | Engineering / Logistics |
| Unallocated containers | No B4-C | Drums did not fit | Recalculate / change types | Logistics |
| Unauthorized | 401/403 | EFFECTIVE ACCESS | Sign in / request role | Admin |
| Superseded artifact | Mutate denied | Successor exists | Open current | Actor |
| Incomplete master data | Fail closed | Inactive/unknown port etc. | Governed master | Master-data owner |

Do not convert fail-closed domain errors into silent zeros or dismissible “info” chips.

---

## 19. Customer vs internal data visibility

### Customer visible (issued / own inquiry)

- Configured cable / technical summary  
- Cutting requirements (commercial)  
- Drum information where commercially appropriate  
- Issued quotation (technical + financial sections)  
- Products total, shipping total, final total, currency  
- Dest / Incoterm / packing as on the issued document  
- Fulfillment **status** (not D365 invoices)

### Internal only

- RM cost, BOM, scrap  
- Manufacturing, G&A, selling expense, finance, material margin  
- Metal base/premium/**metal shipping**  
- Costing/pricing **formulas** and internal warnings (`COST_COMPONENTS_NOT_CONFIGURED`, `VIP_SHIPMENT_NOT_CONFIGURED` until presentation policy)  
- Rate master workbenches, B4-C create APIs  
- External mapping, credit reference, classification  

Presentation UX must not leak cost build-up through “advanced” customer tabs.

---

## 20. Security UX

```text
User → User Group (optional) → Role (= permission set)
  → Permission → Module → Form → Action → Field → Data Scope
```

Internal Administration includes conceptual **Effective Access** explain (`GET /api/v2/security/effective-access/explain`): why this user can/cannot act.

Customer isolation: server `CustomerUser` scope. Never trust body `customerId`. PermissionState for denied screens; APIs still 401/403.

---

## 21. Low-code boundary

UX may use metadata for labels, visibility, required/read-only, order, sections, lookups, reports, dashboards, workflow **presentation**.

Core transactions stay **typed Prisma**. Task 07 does **not** design a generic EAV form builder.

---

## 22. Responsive strategy

| Surface | Strategy |
|---------|----------|
| Internal portal | Desktop-first (≥ lg). Tablet: drawer nav, horizontal table scroll. Not a phone ERP. |
| Customer portal | Responsive; optional bottom nav on small screens (`MobileBottomNav` recipe). Forms stack. |
| Public / landing | Marketing responsive |

Do not force ERP-density grids onto the customer portal.

---

## 23. Accessibility (baseline)

- Keyboard: all actions reachable; visible focus (`brand-300` ring already on `ui/Button`)  
- Contrast: navy/white/vermilion against WCAG-oriented token use; do not put vermilion text on navy without checking  
- Semantic buttons/labels, not clickable `<div>`s  
- Validation: text + field error, not color-only  
- Status: badge **label** plus tone (not color-only)  
- Responsive: no essential data only in hover  

Certification is **not** claimed (Doc 07 honesty).

---

## 24. Existing V1 boundary

| V1 | V2 |
|----|-----|
| `/customer/*`, `/internal/*` preserved | `/v2/*` additive |
| Same JWT, same DB | New IA/shells when P1.5 implements |
| Do not redesign V1 in this task | Do not silently copy V1 tabs into V2 customer (especially Costing) |

Rollback: disable V2 nav; V1 remains (Doc 11).

---

## 25. Implementation roadmap

**Task 07 does not implement these.**

```text
Task 07 — Product & UX Architecture          ← this document
      ↓  (architecture gate)
P1.5-02 — Design System                      (tokens + primitives wiring)
      ↓
P1.5-03 — Application Shell                  (three shells)
      ↓
P1.5-04 — Landing Page
      ↓
P1.5-05 — Authentication / User Lifecycle
      ↓
P1.5-06 — Customer Portal
      ↓
P1.5-07 — Internal Portal
      ↓
P1.5-08 — Test/Demo Data Reset
      ↓
P1.5-09 — UAT / Go-Live
```

Each later phase needs its own **implementation authorization**.

---

## 26. Architecture acceptance criteria

1. Customer and internal experiences are **explicitly separated**.  
2. V2 customer journey is defined **end-to-end**.  
3. Inquiry → Configuration → Cutting → Drum → Container → Costing → Pricing → Offer → Fulfillment lineage is **preserved**, not rewritten.  
4. Immutable snapshots are **visibly** distinct from live masters.  
5. Shipping remains **separate** from product / unit price.  
6. Internal costing remains **confidential**.  
7. RBAC and customer isolation are represented; UI hide ≠ security.  
8. V1/V2 boundary (`/customer`, `/internal` vs `/v2`) remains intact.  
9. **No new domain rules** (process resolution, B4 snapshots, D4-D-1…4, preference ≠ transaction).  
10. **No implementation** in this task.

---

## Mapping to the required product tree

```text
Energya Connect
│
├── Public / Authentication
│   ├── Landing
│   ├── Login
│   └── User lifecycle
│
├── Customer Portal
│   ├── Dashboard
│   ├── My Inquiries
│   ├── Cable Configuration
│   ├── Cutting Length
│   ├── Drum Selection          (≠ Drum Plan artifact)
│   ├── Container / Shipment    (preference / status; not rate master)
│   ├── Quotations              (issued; technical + financial)
│   ├── Commitments
│   └── Fulfillment Status
│
└── Internal Portal
    ├── Dashboard
    ├── Inquiry / Engineering
    ├── Technical Office
    ├── Costing
    ├── Pricing
    ├── Commercial
    ├── Logistics
    ├── Master Data
    ├── Analytics
    └── Administration
```

---

**STATUS: DESIGN ONLY — NOT IMPLEMENTED — NOT IMPLEMENTATION AUTHORIZED**

Do not create code, schema, migration, API, UI, seed, test, or customer-record changes. Do not start P1.5-02 until this architecture is explicitly approved.

---

*End of TASK 07 Product & UX Architecture — DESIGN ONLY.*
