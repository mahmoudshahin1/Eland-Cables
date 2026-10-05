# P1.5-02 — Energya Connect V2 Design System Architecture

**Date:** 2026-09-12  
**Mode:** Design-system architecture **only**  
**Status:** **DESIGN ONLY** — **NOT IMPLEMENTED** — **NOT IMPLEMENTATION AUTHORIZED**  
**Follows:** [53](./53_PRODUCT_UX_ARCHITECTURE.md) (**ACCEPTED / FROZEN** — Task 07; do **not** implement Task 07)  
**Also aligns:** [09](./09_V2_UI_UX_ARCHITECTURE.md) (Task 01 UX assessment), `docs/design/DESIGN_SYSTEM.md` (token map), `src/index.css` `@theme`, `src/components/ui/*`, [07](./07_V2_SECURITY_ARCHITECTURE.md), [11](./11_V1_V2_RUNTIME_BOUNDARY.md), [52](./52_CUSTOMER_MASTER_ARCHITECTURE.md)

**Upstream freeze:** Task 06 Customer Master and Task 07 Product & UX are **approved / frozen / design only**. This document does **not** reopen them.

This document does **not**:

- Redesign or implement application screens
- Modify Prisma, APIs, routes, business logic, Customer records, or V1 (`/customer/*`, `/internal/*`)
- Change Costing V2 / Decision 5, B4-A/B/C/D domain rules, or D365 adapters
- Authorize P1.5-03 Application Shell or later UI phases

**Stop after this design.** Do not wire primitives into business pages until a **separate** design-system / shell implementation task is explicitly approved.

---

## 0. Purpose

Define the **V2 design-system contract**: tokens, density, component APIs, brand assets, and accessibility — so later shells and portals look like **ENERGYA CONNECT**, not a generic ERP kit and not a second Costing-only visual language.

Reuse-first: most tokens and many primitives **already exist**. P1.5-02 architecture **adopts** them as SoT. It does not invent a parallel palette.

```text
Task 07 Product & UX (FROZEN)
        ↓
P1.5-02 Design System architecture   ← this document
        ↓
(later authorized) token/primitive wiring + BrandLogo asset hygiene
        ↓
P1.5-03 Application Shell
```

---

## 1. BRAND-ASSET-01 — Canonical Energya logo

**Decision (must be explicit before any Design System implementation):**

```text
BRAND-ASSET-01
Canonical Energya logo asset:
- One approved source asset
- Transparent background
- No recoloring / redrawing / distortion
- Used by Public, Customer, and Internal shells
- BrandLogo is the only rendering abstraction for the bitmap
- No duplicate logo assets
```

| Rule | Specification |
|------|----------------|
| **Canonical file** | `public/logo.png` — **one** file in the repo |
| **HTTP path** | `/logo.png` |
| **Renderer** | `BrandLogo` only (`<img src="/logo.png">`, unmodified) |
| **Wordmark** | “Connect” / **ENERGYA CONNECT** is **typography**, not a second image |
| **Wrapper** | `EnergyaLogo` may remain as a **size + optional wordmark** wrapper around `BrandLogo`. It must **not** load another file |
| **Surfaces** | Same asset on white canvas **and** navy chrome. Do **not** add `logo-white.png` / `logo-dark.png` |
| **Background** | Canonical requirement: **transparent**. Do not draw a CSS plate behind it |
| **Minimum size** | Navbar / chrome ≥ `h-10` (40px). Do not scale below that |
| **Alt text** | “Energya Cables” for the lockup; product name is adjacent text, not alt stuffing |
| **Forbidden** | Recolor filters, SVG redraws, Elsewedy-only substitutes, per-portal unique logos |

**Honesty (as-is):** `BrandLogo` comments currently mention a lockup **plate** on the file. That is **not** the target. When logo hygiene is **implementation-authorized**, replace `public/logo.png` **in place** with the approved transparent Energya asset. Do **not** keep two logos side by side.

Task 07’s “via BrandLogo” line is satisfied by this decision. **Do not amend Doc 53** for the asset path.

---

## 2. Product naming in chrome

| Context | Copy |
|---------|------|
| Product | **ENERGYA CONNECT** |
| Company | Energya Power Cables |
| Browser / PWA later | Energya Connect |

Do not use “EPC Platform”, “Energya ERP”, or dual wordmarks.

---

## 3. Brand tokens (adopt existing `@theme`)

**SoT:** `src/index.css` `@theme`. Do **not** fork hex values in component CSS.

### 3.1 Navy (primary)

| Token | Hex | Use |
|-------|-----|-----|
| `brand-50` … `brand-300` | `#eef3fb` … `#5b82c4` | Tints, focus ring (`brand-300`) |
| `brand-500` | `#1d4fa1` | Primary actions, links |
| `brand-600` | `#17407f` | Hover primary |
| `brand-700` / `800` / `900` | `#143a78` / `#0f2c5c` / `#0a1f42` | Chrome, sidebar, hero |

Legacy aliases `energya-navy*` remain mapped to the same hex. New V2 code uses `brand-*`.

### 3.2 Vermilion (accent)

| Token | Hex | Use |
|-------|-----|-----|
| `accent-500` | `#f04e30` | High-emphasis / destructive / rare primary CTA |
| `accent-600` / `700` | `#d8421f` / `#c93a20` | Hover / pressed accent |

**Sparing use.** Most primary buttons are **navy**. Vermilion is not a second corporate blue.

### 3.3 Surfaces

| Token | Hex | Use |
|-------|-----|-----|
| `surface-page` | `#ffffff` | App canvas |
| `surface-muted` / `brand-surface` | `#f4f6fa` | Customer portal page bg, muted wells |
| `surface-subtle` | `#f8fafc` | Nested wells |

Chrome (navy) vs canvas (white) is the Energya look. Avoid purple gradients.

### 3.4 Borders & elevation

| Token | Value |
|-------|--------|
| `border-subtle` / `default` / `strong` | `#e5e7eb` / `#e2e8f0` / `#cbd5e1` |
| `--shadow-card` | `0 1px 3px rgba(15, 23, 42, 0.06)` |
| `--shadow-raised` | `0 4px 12px rgba(15, 23, 42, 0.08)` |
| `--shadow-overlay` | `0 12px 32px rgba(10, 31, 66, 0.18)` |

### 3.5 Radius

`--radius-xs` 4px → `--radius-2xl` 16px. Inputs/cards: `lg` / `xl`.

### 3.6 Manufacturing chips (not status)

| Token | Hex | Use |
|-------|-----|-----|
| `copper-500` | `#b45309` | Cu conductor chips |
| `aluminium-500` | `#0284c7` | Al conductor chips |

Do not reuse copper as “warning.”

---

## 4. Status semantics (visual, not new domain enums)

Map **existing domain strings** to tones. Do not invent a mega-status.

| Tone | Tokens | Typical domain (examples only) |
|------|--------|--------------------------------|
| Neutral / muted | slate + `border-default` | not_started, historical |
| Warning | `warning-500` | DRAFT, pending, PARTIAL (module registry) |
| Info | `info-500` | in progress, waiting on Energya, NOT_CONNECTED |
| Success | `success-500` | CONFIRMED, ISSUED (customer-visible), APPROVED |
| Error | `error-500` | blocked, VALIDATION_FAILED, unauthorized |
| Frozen / locked | navy tint + lock icon + **label** | LOCKED group, snapshot, SUPERSEDED |

**Rules (Doc 53 §14):**

- Badge **text** is required — color is not the only indicator.
- Module registry `PLANNED` / `FROZEN` / `NOT_IMPLEMENTED` are **navigator** badges, not inquiry states.
- `VIP_FAST_TRACK` vs `STANDARD_WORKFLOW` is a **process badge**, not a stepper state.

`StatusBadge` + `statusToTone()` remain the single mapping helper. Costing `gateStatusBadge` must **converge** on the same tones, not a private palette.

---

## 5. Typography

| Role | Token / face | Scale (contract) |
|------|----------------|------------------|
| Display | `--font-display` **Poppins** | Page title ~22px bold; stats `text-2xl`/`3xl` |
| Body internal | `--font-sans` Inter / Segoe | `text-sm` body; `text-xs` meta |
| Body customer | `.customer-portal` Roboto / Inter | Same scale, slightly airier line-height |
| Labels | sans, `uppercase tracking-wide` optional for meta | Never for long sentences |

Do not introduce a third display font. Do not set body to Poppins.

---

## 6. Spacing rhythm

| Context | Contract |
|---------|----------|
| Page padding | `p-4 sm:p-5 lg:p-6` |
| Container | `responsive.container` (max 1440px, `px-4 sm:px-6 lg:px-8`) |
| Stack | `space-y-5` sections; `responsive.pageStack` |
| Card padding | `p-4` / `p-5` |
| Grid gap | `gap-4` |
| Internal density | Compact tables, tighter row padding |
| Customer density | More whitespace; fewer columns |

---

## 7. Customer vs internal density

| | Internal | Customer |
|--|----------|----------|
| Shell | Desktop-first, persistent sidebar ≥ `lg` | Simpler top or rail; optional bottom nav `< md` |
| Tables | Dense, many columns, horizontal scroll OK | Few columns; cards on small screens where needed |
| Forms | Multi-column on desktop | Single column default |
| Chrome | Navy sidebar + white stage | Navy header, muted/white canvas |
| Costing/pricing | Full workbenches | **Not shown** (Doc 53 §19) |

Same **tokens**. Different **density and IA**. Not a hidden-menu ERP.

---

## 8. Responsive breakpoints

Adopt Tailwind defaults already documented in `src/components/ui/responsive.ts`:

| Token | px | Shell behavior |
|-------|-----|----------------|
| `sm` | 640 | Phone landscape |
| `md` | 768 | Tablet; **customer** `MobileBottomNav` hides at `md+` |
| `lg` | 1024 | Internal sidebar stable |
| `xl` / `2xl` | 1280 / 1536 | Wide desktop |

Recipes: `container`, `pageStack`, `statGrid`, `splitMain`, `mobileNavSafeArea`. Wide logistics/costing grids keep `overflow-x-auto` — do not hide columns.

RTL: logical properties when Arabic surfaces are wired; tokens are direction-agnostic.

---

## 9. Accessibility tokens & baseline

| Concern | Contract |
|---------|----------|
| Focus | Visible ring `brand-300` (already on `ui/Button`) on all interactive controls |
| Contrast | Navy text on white; white text on `brand-700+`; vermilion **not** small text on navy |
| Hit target | ≥ 40px for customer primary CTAs; internal tables may be denser but not < 32px row actions |
| Status | Label + tone |
| Reduced motion | Honor `prefers-reduced-motion`; no marketing motion |
| Keyboard | Tab order matches visual order; dialogs trap focus |

No SOC2/WCAG certification claim (Doc 07).

---

## 10. Component contracts

Existing primitives in `src/components/ui/` are the **implementation candidates**. This section is the **architecture API**. Wiring into V2 shells is **not** authorized here.

### 10.1 Buttons

| Variant | Token | When |
|---------|-------|------|
| `primary` | navy `brand-500/600` | Default commit |
| `secondary` | white + `border-default` | Cancel / alternative |
| `tertiary` | ghost | Low emphasis |
| `accent` | vermilion | Destructive or rare high emphasis |

Sizes: `sm` / `md` / `lg`. Leading/trailing icon optional. Disabled = 40% opacity + `aria-disabled`, not a fake success.

Retire ad-hoc `epc-btn-*` **when** a later implementation phase maps them — not in this task.

### 10.2 Inputs / forms

`Field` + `Input` / `Select` / `Textarea`: label, required `*`, hint, error slot. Focus ring shared. Errors use `error-500` text **and** border — not color-only.

Do not build an EAV form builder (Doc 14 / 53 §21).

### 10.3 Tables

`Table` / `THead` / `TBody` / `Tr` / `Th` / `Td`: rounded-xl, subtle header, overflow-auto. Sticky header for long inquiry/costing grids. Optional zebra. Empty → `EmptyState` inside table body.

### 10.4 Cards

White, `rounded-xl`, `--shadow-card`. Optional title/subtitle/action/footer. Stat cards: existing `DashboardStatCard` / `StatCard` re-export — **one** KPI card.

### 10.5 Badges

`Badge` + `StatusBadge`. Process badge (VIP/STANDARD) distinct from lifecycle badge.

### 10.6 Stepper (new contract; not domain)

Journey stages only (`not_started` | `in_progress` | `blocked` | `waiting` | `complete`). **Never** mark complete without the artifact (Doc 53).

### 10.7 Banners

| Banner | Use |
|--------|-----|
| `SnapshotBanner` | Immutable artifact (version, source, date, current vs historical) |
| `ValidationSummary` | What / why / next / owner (Doc 53 §18) |
| `PermissionState` | 403 / missing role — not a blank page |
| Honest stub | `NOT_IMPLEMENTED` / `NOT_CONNECTED` — info/warning, never fake data |
| Option B | Costing metal banner stays costing-owned; tokens only |

### 10.8 Dialogs

`Modal` for confirm/edit; `Drawer` for side detail (readiness, line edit). Overlay `--shadow-overlay`. Focus trap. Customer: full-width sheet on small screens.

### 10.9 Navigation (tokens only)

| Piece | Contract |
|-------|----------|
| Global chrome | Navy; BrandLogo + ENERGYA CONNECT |
| Internal module nav | Grouped; hide PLANNED by default |
| Customer | No internal module tree |
| `MobileBottomNav` | Customer `< md` only |
| Breadcrumbs | `PageHeader` `›` |

Shell **structure** is P1.5-03. This document only constrains look and density.

### 10.10 Doc 53 remaining primitives

`PageHeader`, `WorkspaceShell` (CostingWorkspaceShell = **reference**, not clone), `DetailPanel`, `Timeline`, `ApprovalBar`, `CalculationSummary`, `EmptyState`, `ErrorState`.

Costing v3 primitives stay for costing screens; they **consume the same tokens**.

---

## 11. Logo + chrome layout (all three experiences)

```text
[BrandLogo]  ENERGYA CONNECT          [context] [user]
```

Public landing, customer portal, and internal portal **all** use BRAND-ASSET-01. No per-portal logo.

On navy chrome: transparent PNG on navy — **no** extra white chip (once the asset is transparent). Until asset hygiene is authorized, do not add a second file to “fix” a plate.

---

## 12. What already exists vs what later implementation may do

| Layer | Exists today | This architecture |
|-------|--------------|-------------------|
| Tokens | `src/index.css` `@theme` | **Adopt; do not rehex** |
| `ui/*` primitives | Built, partially unwired | Contract SoT |
| BrandLogo / EnergyaLogo | Image + wrapper | BRAND-ASSET-01 |
| Costing shell | Visual reference | Token alignment only |
| V2 business pages | Not this task | Forbidden |
| Duplicate logos | Must not be introduced | Forbidden |

**Proposed later (still not authorized):** formal type-scale utility classes, Empty/Error/Permission/Snapshot/Stepper as shared components, map `epc-*` to `Button`, replace `logo.png` in place if plate remains, wire customer `MobileBottomNav`.

---

## 13. Out of scope (explicit)

- P1.5-03+ shells, landing, auth redesign, customer/internal portals  
- Task 07 UI implementation  
- Customer Master implementation  
- D365  
- Changing inquiry tabs, costing freeze, or snapshot APIs  
- Generic page builder / EAV  

---

## 14. Acceptance criteria (for this architecture)

1. Tokens are the existing Energya navy / vermilion / white system.  
2. BRAND-ASSET-01 is explicit: one transparent asset, `BrandLogo` only, no duplicates.  
3. Customer vs internal **density** differs; tokens do not.  
4. Status mapping does not invent domain enums.  
5. Component contracts cover Doc 53 primitives without implementing screens.  
6. Accessibility baseline is stated.  
7. V1 is untouched.  
8. No application/schema/API/route/CSS/test change in **this** task.

---

## 15. Next gate

```text
Doc 54 approved
  → separate authorization for design-system implementation
    (token hygiene + primitives + BRAND-ASSET-01 file if needed)
  → P1.5-03 Application Shell (still not authorized)
```

---

**STATUS: DESIGN ONLY — NOT IMPLEMENTED — NOT IMPLEMENTATION AUTHORIZED**

Do not implement Task 07. Do not implement application screens. Do not modify Prisma, APIs, routes, business logic, Customer data, or existing V1.

---

*End of P1.5-02 Design System Architecture — DESIGN ONLY.*
