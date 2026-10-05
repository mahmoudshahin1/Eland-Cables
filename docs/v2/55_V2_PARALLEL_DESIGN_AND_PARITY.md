# P1.5-02A — V2 Parallel Design Implementation Strategy & Feature Parity Gate

**Date:** 2026-09-12  
**Mode:** Architecture / implementation-strategy **only**  
**Status:** **DESIGN ONLY** — **NOT IMPLEMENTED** — **NOT IMPLEMENTATION AUTHORIZED**  
**Follows:** [54](./54_DESIGN_SYSTEM_ARCHITECTURE.md) (**ACCEPTED / FROZEN** — do **not** amend Doc 54)  
**Also aligns:** [11](./11_V1_V2_RUNTIME_BOUNDARY.md), [53](./53_PRODUCT_UX_ARCHITECTURE.md), [52](./52_CUSTOMER_MASTER_ARCHITECTURE.md)

**Does not reopen:** Task 06, Task 07, Doc 54 tokens/BRAND-ASSET-01, B4-A/B/C/D, Costing V2 / Decision 5, Customer Master implementation, D365.

This document **supersedes the in-place P1.5-02 implementation idea**. It does **not** authorize code.

---

## 0. Decision

Do **not** modify the current UI to “match Doc 54.”

Create a **parallel V2 design version** beside the current, runnable application. Visual improvement must not accidentally remove existing functionality.

```text
CURRENT VERSION
Existing Energya Connect
        │
        │  preserved / runnable
        │
        ├──────────────┐
        │              │
        ↓              ↓
   Current UI       New UI
   Baseline         V2 Design
        │              │
        └──────┬───────┘
               ↓
        Feature Comparison
               ↓
        Gap / Regression Log
               ↓
        New V2 Approval
               ↓
        Controlled Cutover
```

**Principle:** Build V2 beside the current version → compare → identify gaps → resolve → validate → **only then** consider cutover.

**Release criterion (not a preference):** **Current Version Preservation** — `/customer/*` and `/internal/*` remain runnable until an explicit cutover task is approved.

---

## 1. Why in-place redesign is rejected

Energya Connect already contains substantial working commercial, engineering, costing, and logistics behavior. An in-place restyle can:

- Drop a workflow that was not on the mock
- Weaken RBAC or customer isolation
- Hide Costing from internals or leak it to customers
- Treat a missing control as “obsolete” without evidence

The V1/V2 runtime boundary (Doc 11) already exists so we can **add** without replacing.

---

## 2. Route strategy (additive)

| Experience | Current (preserved) | New V2 (additive) |
|------------|---------------------|-------------------|
| Public / auth | `/`, `/login*` | Later `/v2` public surfaces only if authorized; **do not** take over `/` |
| Customer | `/customer/*` | `/v2/customer/*` |
| Internal | `/internal/*` | `/v2/internal/*` |
| Platform navigator (Task 02/03) | `/v2`, `/v2/security`, `/v2/master-data`, `/v2/modules/:moduleId` | **Keep.** Do not delete or restyle as a substitute for product shells |

```text
Existing
/customer/*
/internal/*
/v2                    ← Task 02/03 platform shell — leave in place
/v2/modules/*

New (when authorized)
/v2/customer/*
/v2/internal/*
```

**Honesty (as-is):** `V2Shell` currently has `path="/v2/*"` → redirect to `/v2`. Any future `/v2/customer` / `/v2/internal` mount must **narrow that catch-all** without removing existing `/v2/modules` routes. That is a **P1.5-03** concern, not this document’s implementation.

Same JWT, same PostgreSQL, same APIs. V2 screens **consume** existing services. They do not fork business logic.

---

## 3. Phased gates (none authorized here)

```text
P1.5-02 Design System Architecture     ACCEPTED / FROZEN (Doc 54)
        ↓
P1.5-02A Parallel UI Foundation        this document — NOT AUTHORIZED
        ↓
P1.5-03 V2 Application Shell           /v2/customer + /v2/internal — NOT AUTHORIZED
        ↓
P1.5-04 Feature Parity & Gap Analysis  formal checkpoint — NOT AUTHORIZED
        ↓
Resolved gaps + three-dimension validation
        ↓
Explicit cutover task                  NOT AUTHORIZED
```

### 3.1 P1.5-02A — Parallel UI Foundation

**When authorized (later):** implement Doc 54 **as a shared layer used by new V2 routes**, not by rewriting V1 screens.

In scope:

- Adopt existing `@theme` (`brand-*`); no second palette
- Shared primitives (`ui/*` contracts): StatusBadge, Stepper, SnapshotBanner, ValidationSummary, PermissionState, Empty/Error
- Accessibility foundations
- BRAND-ASSET-01: `BrandLogo` only; replace `public/logo.png` **in place** only if the approved transparent asset is available
- Primitives may live under `src/components/ui/` (already additive). **Do not rewire** `/customer` or `/internal` pages to those primitives in this increment

Out of scope:

- Redesigning current business screens
- Changing V2 workflows, navigation IA of V1, APIs, Customer Master, Costing, B4-C/B4-D
- New component library or competing tokens
- P1.5-03 shells
- Silent “cleanup” of `epc-*` classes on V1 pages

### 3.2 P1.5-03 — V2 Application Shell

**When authorized (later):** mount three experiences under `/v2` **additively**:

```text
/v2
├── (existing platform navigator — preserved)
├── customer
└── internal
```

Existing `/customer` and `/internal` **untouched**. Honest stubs (`NOT_IMPLEMENTED`) where backend capability is missing. Do **not** fake fulfillment.

### 3.3 P1.5-04 — V2 Feature Parity & Gap Analysis

**When authorized (later):** formal checkpoint **before** any current screen is declared replaced. No cutover in P1.5-04 itself.

---

## 4. Comparison baseline

Compare against **actual current functionality**, not screenshots or Doc 53 mock journeys alone.

Inventory sources:

- Running `/customer/*` and `/internal/*` (and current `/v2` platform surfaces)
- `docs/v2/02_V1_FUNCTIONAL_INVENTORY.md`
- Route tables, RBAC (`rbac.ts`), `customerScope`
- Tests that encode behavior (`npm test` suites for commercial, costing freeze, isolation)

A capability that exists in code/UI/API **and** is absent from the new design is a **gap**, not presumed obsolete.

---

## 5. Capability matrix (initial — design)

This is a **starting register**, not a completed P1.5-04 audit. Status is illustrative of **intent**.

| Capability | Current | New V2 intent | Action |
|------------|---------|---------------|--------|
| Login / session | Present | Present | Keep |
| Customer dashboard | Present | Present | Compare |
| Inquiry | Present | Present | Compare |
| Cable configuration | Present | Present | Verify |
| Cutting length | Present | Present | Verify |
| Drum selection | Present | Present | Verify |
| Container study | Present / partial | Present (honest) | Verify; don’t fake blocked layers |
| Costing | Present (incl. customer tab in V1) | **Internal only** | **REMOVED-BY-DESIGN** for customer; keep internal |
| Quotations | Present | Present | Compare |
| Commitments | Present | Present | Verify |
| Fulfillment | Partial / frozen Phase 1 | Planned / honest | Don’t fake |
| RBAC | Present | Present | Security regression |
| Customer isolation | Present | Present | Security regression |
| Audit | Present | Present | Verify |
| Mobile UX | Limited | Better (customer) | Improve — not an excuse to drop desktop ops |
| Platform `/v2` navigator | Present | Present | Keep (V1-ONLY vs relocated TBD in P1.5-04) |

---

## 6. V2 Design Parity gate (per screen)

Before any new V2 screen is **declared complete**:

```text
Current Screen
      ↓
Feature Inventory          (actual behavior)
      ↓
New V2 Screen
      ↓
Functional Comparison
      ↓
UX Comparison
      ↓
Security Comparison
      ↓
Data / API Comparison
      ↓
Gap Register
      ↓
Resolve gaps
      ↓
V2 approval
```

No screen skips the register by “looking done.”

---

## 7. Gap classification

| Class | Meaning | Default action |
|-------|---------|----------------|
| **MISSING** | Functionality disappeared | Block approval until restored or reclassified |
| **REGRESSED** | Capability exists but no longer works | Fix; do not ship |
| **IMPROVED** | Same capability, better UX | Allowed |
| **RELOCATED** | Moved intentionally (document from → to) | Allowed if discoverable |
| **REMOVED-BY-DESIGN** | Intentionally removed **and documented** (e.g. customer Costing tab) | Allowed only with explicit record |
| **NOT_IMPLEMENTED** | Backend capability genuinely does not exist | Honest stub; never fake data |
| **V1-ONLY** | Deliberately excluded from V2 (document why) | Allowed; current version must still provide it until cutover |

Cursor / implementers **must not assume** a current-portal feature is obsolete because it is absent from Docs 53–54.

---

## 8. Three-dimension validation

```text
             V2 Validation
                  │
       ┌──────────┼──────────┐
       ↓          ↓          ↓
   Functional    UX       Security
   parity      parity       parity
       │          │          │
       └──────────┼──────────┘
                  ↓
             V2 Release
```

| Dimension | Must not lose |
|-----------|----------------|
| **Functional** | Workflows, operational features, honest NOT_IMPLEMENTED |
| **UX** | Doc 54 tokens, customer vs internal density, confidentiality (Doc 53 §19) |
| **Security** | JWT, RBAC, `customerScope`, audit, no costing leak to customers |

A beautiful UI that drops a permission check, isolation rule, or working workflow is a **regression**, not a release.

---

## 9. Current Version Preservation (release criterion)

Cutover is **forbidden** until all are true:

1. Current `/customer/*` and `/internal/*` still run in the same deployable.
2. P1.5-04 gap register has no unresolved **MISSING** or **REGRESSED** items (or they are explicitly **REMOVED-BY-DESIGN** / **V1-ONLY** with owner sign-off).
3. Security comparison (RBAC + customer isolation + audit) is recorded and tested.
4. A **separate** cutover task is explicitly authorized.

Rollback remains: hide V2 product nav; current UI stays (Doc 11).

---

## 10. What this document does not do

- Does not amend Docs 52, 53, or 54  
- Does not implement primitives, shells, or screens  
- Does not change Prisma, APIs, Costing, B4-C/B4-D, Customer records, or V1  
- Does not authorize P1.5-02A / 03 / 04 / cutover  

---

## 11. Acceptance criteria (for this architecture)

1. In-place Doc 54 restyle of current UI is **rejected**.  
2. Parallel routes `/v2/customer/*` and `/v2/internal/*` are the product-UX target; current routes preserved.  
3. Existing Task 02/03 `/v2` platform navigator is not collateral damage.  
4. Parity gate + gap taxonomy + three-dimension validation are defined.  
5. Current Version Preservation is a **release criterion**.  
6. Comparison is against actual functionality, not screenshots alone.  
7. No application/schema/API/UI/test change in **this** task.

---

**STATUS: DESIGN ONLY — NOT IMPLEMENTED — NOT IMPLEMENTATION AUTHORIZED**

Do not implement P1.5-02A, P1.5-03, P1.5-04, or cutover. Do not modify existing `/customer`, `/internal`, or current `/v2` platform screens. Do not amend Doc 54.

---

*End of P1.5-02A Parallel Design & Parity Architecture — DESIGN ONLY.*
