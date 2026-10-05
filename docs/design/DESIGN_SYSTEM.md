# DESIGN SYSTEM — Energya Connect (Proposed)

> Maps the **approved UI-kit image** to the **existing tokens** (`src/index.css` `@theme`) and **existing primitives** (`src/components/ui/**`, `CostingUiPrimitives`, `BrandLogo`). Reuse-first: most of the target system already exists; this document adopts it as the single language and flags the small set of *proposed additions*.
>
> **Status key:** ✅ Implemented (Phase 2 / tokens) · 🟡 Implemented but not wired into business pages · ➕ Proposed addition (presentation-only).

## 1. Brand foundations

### 1.1 Logo
- Use **the original supplied `public/logo.png`** lockup (Energya Cables / elsewedy HELAL). ✅
- `BrandLogo.tsx` renders `<img src="/logo.png">`; `EnergyaLogo.tsx` provides size map (`sm`/`md`/`lg`) + optional "Connect" wordmark. ✅
- **Rules:** never recreate, redraw, recolor, distort, or replace. On navy surfaces use the logo as supplied (it already has transparent bg). Minimum height `h-10` (navbar) per current usage. Placement: navbar left, login left panel, footer, costing shell header.

### 1.2 Color (from `@theme` — do not change token values)

| Role | Token | Hex |
| --- | --- | --- |
| Primary navy 500 | `brand-500` | `#1d4fa1` |
| Navy deep | `brand-700` / `brand-800` / `brand-900` | `#143a78` / `#0f2c5c` / `#0a1f42` |
| Navy tints | `brand-50..300` | `#eef3fb … #5b82c4` |
| Accent vermilion 500 | `accent-500` | `#f04e30` |
| Accent dark | `accent-600/700` | `#d8421f` / `#c93a20` |
| Page surface | `surface-page` | `#ffffff` |
| Muted surface | `brand-surface` / `surface-muted` | `#f4f6fa` |
| Subtle surface | `surface-subtle` | `#f8fafc` |
| Success / Warning / Error / Info | `success/warning/error/info-500` | `#1e8e3e` / `#d97706` / `#dc2626` / `#2563eb` |
| Copper / Aluminium chips | `copper-500` / `aluminium-500` | `#b45309` / `#0284c7` |
| Borders | `border-subtle/default/strong` | `#e5e7eb` / `#e2e8f0` / `#cbd5e1` |

**Usage mapping to the image:** navy `brand-700` app chrome (navbar, sidebar, hero) exactly matches the image's dark sidebar/navbar; white/`surface-muted` content areas match the light dashboard canvas; vermilion `accent-500` reserved for primary CTAs and high-emphasis/destructive actions (as the image uses red sparingly); status pills use the semantic tokens.

### 1.3 Typography
- **Display:** `--font-display` = **Poppins** (headings, brand callouts, stat values, page titles). ✅ wired.
- **Body:** `--font-sans` = Inter/Segoe (internal); customer portal uses Roboto/Inter (`.customer-portal`). ✅
- **Scale (proposed, aligns to current usage):** Page title `text-[22px] font-bold font-display` (matches `PageHeader`); section title `text-base/lg font-semibold`; stat value `text-2xl/3xl font-display`; body `text-sm`; meta/labels `text-xs uppercase tracking-wide text-slate-500`. ➕ (formalizes existing ad-hoc sizes).

### 1.4 Spacing / radius / shadow / borders (from `@theme`)
- **Radius:** `--radius-xs..2xl` (4→16px). Cards/inputs `rounded-lg/xl`. ✅
- **Shadow:** `--shadow-card` (rest), `--shadow-raised` (hover/active), `--shadow-overlay` (modals/drawers). ✅
- **Spacing rhythm (proposed):** page padding `p-4 sm:p-5 lg:p-6` (matches shell); card padding `p-4/5`; stack gap `space-y-5`; grid gap `gap-4`. ➕ formalized.

## 2. Component language (map to existing primitives)

| Component | Existing primitive | Status | Proposed treatment |
| --- | --- | --- | --- |
| **Buttons** | `ui/Button` (primary/secondary/tertiary/accent; sm/md/lg; leading/trailing icon; `font-display`; focus ring `brand-300`) | 🟡 | Adopt as the single button everywhere; primary=navy, accent=vermilion (destructive/high-emphasis). Retire `epc-btn-primary` visuals by mapping to `Button` styles. |
| **Cards** | `ui/Card` (white, `rounded-xl`, `--shadow-card`, optional title/subtitle/action/footer/flushBody) | 🟡 | Standard container for all sections. Matches image cards. |
| **Stat cards** | `common/DashboardStatCard` (icon, label, value, view-all, subtitle, selected, size) + `ui/StatCard` re-export | ✅ (dashboards) | Keep; align icon chip + value to Poppins; used for all KPI rows. |
| **Badges** | `ui/Badge` + `StatusBadge` + `statusToTone()` | 🟡 | Single source for status pills (DRAFT→warning, APPROVED→success, etc.), copper/aluminium tones for metals. |
| **Tables** | `ui/Table` (`Table/THead/TBody/Tr/Th/Td`, `overflow-auto border rounded-xl`, subtle header) | 🟡 | Standard table shell for all grids; sticky header; zebra optional. Keep `overflow-x-auto min-w-[…]` for wide line grids. |
| **Forms** | `ui/Form` (`Field` w/ label/required/hint/error; `Input/Select/Textarea` shared focus ring) | 🟡 | All header/line/config forms adopt `Field`; required `*`, hint, and error slots preserve current validation messaging. |
| **Modals / Drawers** | `ui/Modal` (`Modal`, `ModalHeader`, `Drawer` right sheet) | 🟡 | All add/edit/confirm dialogs → `Modal`; detail side panels (costing readiness, RM edit, line edit) → `Drawer`. `--shadow-overlay`. |
| **Page header** | `ui/PageHeader` (breadcrumb `›`, title `font-display`, description, actions) | 🟡 | Every module gets a consistent header band (title + breadcrumb + right-aligned actions), matching image interior pages. |
| **Tabs** | `ui/Tabs` (controlled underline, per-tab icon, disabled) | 🟡 | Inquiry 8 tabs, Master Data, Administration, Technical Office use one tab style. |
| **Mobile nav** | `ui/MobileBottomNav` (`md:hidden`, fixed, active `brand-600`) + `mobileNavSafeArea` | 🟡 (unwired) | Wire for customer portal on phones (matches image mobile bottom nav). Sidebar remains desktop counterpart. |
| **Costing primitives** | `costing/v3/CostingUiPrimitives` (badges, cards, tables, `CostingSidePanel`, `CostingDrawer`, `CostingOptionBBanner`, KPI cards, pagination, `gateStatusBadge`) | ✅ (costing) | Keep as-is for costing; align tokens so costing and rest of app look unified. |
| **Responsive recipes** | `ui/responsive.ts` (`container`, `pageStack`, `statGrid`, `splitMain`, `mobileNavSafeArea`, breakpoints) | ✅ | Use recipes to standardize grids/breakpoints. |

## 3. Additional states (proposed, presentation-only)

| State | Current | Proposed ➕ |
| --- | --- | --- |
| **Empty** | Ad-hoc strings ("No inquiries yet…", "No matches") | Standard empty block: domain icon + heading + one-line hint + optional CTA. Keep existing copy. |
| **Loading** | Ad-hoc ("Loading inquiries…", "Restoring your session…") | Skeleton rows for tables/cards + inline spinner (`Loader2`) for buttons. Keep copy. |
| **Error** | Server message passthrough | Inline `error-500` banner in `Field`/section with `AlertCircle`; preserve exact messages + validation codes. |
| **Tooltips** | Native `title=` attributes | Lightweight tooltip on icon-only actions; keep the `title` text as content. |
| **NOT_CONNECTED / NOT_IMPLEMENTED** | Honest placeholder banners | Keep the honesty; style as `info`/`warning` banner with muted illustration. Never fake data. |

## 4. Desktop / tablet / mobile consistency

- **Desktop (≥ lg):** static sidebar (collapsible), multi-column grids (`splitMain`, `statGrid`), drawers on the right.
- **Tablet (md–lg):** sidebar drawer, 2-column grids, tables scroll horizontally where needed.
- **Mobile (< md):** off-canvas sidebar + optional `MobileBottomNav` for customer portal; forms stack to single column; stat grids `grid-cols-2`; wide line/costing tables keep `overflow-x-auto` (no data hidden). Modals full-width with capped height + internal scroll.
- **RTL/Arabic:** Administration and Costing already expose Arabic toggles; the token system is direction-agnostic — mirror layout with logical properties when implemented.

## 5. What is already implemented vs proposed

- **Already implemented (adopt as-is):** all `@theme` tokens (color/radius/shadow/border/status/metal), Poppins display wiring, `DashboardStatCard`, costing V3 primitives + shell, `BrandLogo`/`EnergyaLogo`, `responsive.ts` recipes.
- **Implemented but not yet wired (adopt across pages):** `ui/Button`, `Card`, `Badge`, `Table`, `Form`, `Modal`/`Drawer`, `PageHeader`, `Tabs`, `MobileBottomNav`, icons registry.
- **Proposed additions (presentation-only):** formalized type scale + spacing rhythm, standardized empty/loading/error/tooltip states, skeleton loaders, wiring `MobileBottomNav` for the customer portal, and mapping legacy `epc-*` classes onto the shared primitives. **No new business behavior, fields, or endpoints.**
