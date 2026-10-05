# Energya Connect — Shared UI / Design System (Phase 2 foundation)

This folder is the forward-looking **single source of truth** for the shared
visual language derived from the approved UI Kit (color palette, Poppins
typography, Primary/Secondary/Tertiary buttons, cards, cable-manufacturing
icons, mobile bottom nav).

> **P1.5-02A:** existing primitives (`Button`, `Badge`, `Form`, `Table`, `Modal`,
> `MobileBottomNav`, …) are **already used by some V1 screens** — do not restyle
> them. New Stepper / SnapshotBanner / ValidationSummary / PermissionState /
> EmptyState / ErrorState are **unwired**. CostingUiPrimitives stay costing-owned.
> Do not replace `public/logo.png` or delete unused `public/brand/*.svg` in this
> increment.

## Import surface

```ts
import { Button, Card, StatCard, Badge, Table, Field, Modal, PageHeader, Tabs, MobileBottomNav, Stepper, SnapshotBanner, ValidationSummary, PermissionState, EmptyState, ErrorState, icons, responsive } from '../ui';
```

## What's here

| Primitive | Notes |
| --- | --- |
| `Button` | `primary` / `secondary` / `tertiary` / `accent` per the UI Kit. |
| `Card` | White surface, `--shadow-card`, optional header/footer. |
| `StatCard` | **Re-export** of `DashboardStatCard` (one source of truth). |
| `Badge` / `StatusBadge` | Semantic tones; `statusToTone()` mirrors `CostingUiPrimitives.statusTone`. |
| `Table` (+ `THead`/`TBody`/`Tr`/`Th`/`Td`) | Bordered, rounded, light-gray header. |
| `Field` / `Input` / `Select` / `Textarea` | Consistent form controls. |
| `Modal` / `ModalHeader` / `Drawer` | Overlays with a shared header. |
| `PageHeader` | Breadcrumb + title + description + actions. |
| `Tabs` | Underline tab bar (controlled). |
| `MobileBottomNav` | Fixed bottom nav, `md:hidden`. |
| `icons` | Domain→icon registry (lucide + bespoke SVGs). |
| `responsive` | Breakpoints + class recipes. |
| `Stepper` | Journey stages only (`not_started`…`complete`); never complete without artifact. **Unwired.** |
| `SnapshotBanner` | Immutable artifact identity + freeze copy. **Unwired.** |
| `ValidationSummary` | What / why / next / owner. **Unwired.** |
| `PermissionState` | Denied access copy. Does not replace `AccessRestricted`. **Unwired.** |
| `EmptyState` / `ErrorState` | Empty + honest `NOT_IMPLEMENTED` / `NOT_CONNECTED`. **Unwired.** |

## Design tokens

Defined in `src/index.css` `@theme` (extended additively — no existing tokens
removed or renamed): `brand-*`, `accent-*`, semantic `success/warning/error/info-*`,
`surface-*`, `copper/aluminium-*`, `radius-*`, `shadow-card/raised/overlay`,
`border-*`, plus `--font-display` (Poppins) from Phase 1.

## Icons

Generic glyphs come from the already-installed **lucide-react**. Cable-specific
glyphs lucide lacks are bespoke 24×24 `currentColor` SVGs: `WoodenDrumIcon`
(reused from `common/`) and `CableCrossSectionIcon`. Always import via
`icons.<name>` so the visual language stays consistent.
