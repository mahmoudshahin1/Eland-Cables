# Energya Connect — Design Redesign Proposal (DESIGN ONLY)

> **Status:** Proposal for review. **Nothing outside `docs/design/` was modified. No code, schema, API, or component was changed. No redesign was implemented.**

This folder contains a complete **visual redesign proposal** for the Energya Connect platform. It is a *presentation-layer* proposal only: every business field, workflow, validation rule, engineering/costing/drum logic, RBAC boundary, and API contract described in the audit **must be preserved exactly**. Only the visual treatment (layout, tokens, typography, spacing, iconography, component styling, responsive behavior) is proposed for change.

## Sources of truth

| Source | Role |
| --- | --- |
| The approved UI-kit image (`assets/…B2B_Saas_Design….jpg`) | **VISUAL** source of truth — colors, layout language, dashboard/interior-page style. |
| The live codebase (`src/**`, `server.ts`, `src/server/**`, `prisma/schema.prisma`) | **FUNCTIONAL + CONTENT** source of truth — real routes, fields, tabs, workflows, APIs. |
| `src/index.css` `@theme` | Existing brand tokens (navy `brand-50..900`, crimson `accent-50..900`, surfaces, radius, shadows, status colors). |
| `src/components/ui/` (Phase 2) + `src/components/costing/v3/CostingUiPrimitives.tsx` + `BrandLogo.tsx` | Existing shared design-system layer to **build on (reuse-first)**. |
| `public/logo.png` | The **original supplied logo lockup** (Energya Cables / elsewedy HELAL). Never recreate, redraw, recolor, or distort — placement documented only. |

## Artifact index

| # | File | Purpose |
| --- | --- | --- |
| 1 | [`CURRENT_UI_AUDIT.md`](./CURRENT_UI_AUDIT.md) | Route-by-route audit: structure, components, fields, actions, tables, modals, workflow, APIs, validation, dependencies, RBAC, responsive. Full real route list. |
| 2 | [`CONTENT_PRESERVATION_INVENTORY.md`](./CONTENT_PRESERVATION_INVENTORY.md) | Per-module table: Module / Element / Type / Must-Preserve / Redesign-Allowed / Notes. Full Inquiry header + line fields, Cable Selection params + dependencies, Drum fields. |
| 3 | [`DESIGN_SYSTEM.md`](./DESIGN_SYSTEM.md) | Proposed Energya design system mapped to the image AND existing tokens/primitives. Notes Phase-2 *implemented* vs *proposed additions*. |
| 4 | [`INDUSTRIAL_ICONOGRAPHY.md`](./INDUSTRIAL_ICONOGRAPHY.md) | Coherent line-icon system for cable/conductor/insulation/screen/armour/sheath/drum/metals/engineering/quality/certification/production/logistics/quotation/costing, mapped to `src/components/ui/icons`. |
| 5 | [`MODULE_DESIGN_PROPOSAL.md`](./MODULE_DESIGN_PROPOSAL.md) | Presentation redesign for all 15 modules. |
| 6a | [`INQUIRY_DESIGN_PROPOSAL.md`](./INQUIRY_DESIGN_PROPOSAL.md) | Inquiry list + workspace + 8 tabs — journey + visual redesign. |
| 6b | [`CABLE_SELECTION_DESIGN_PROPOSAL.md`](./CABLE_SELECTION_DESIGN_PROPOSAL.md) | Cascading Cable Selection + Technical Office — dependencies preserved, presentation only. |
| 6c | [`DRUM_SELECTION_DESIGN_PROPOSAL.md`](./DRUM_SELECTION_DESIGN_PROPOSAL.md) | Drum selection / optimizer / cutting schedule — presentation only. |
| 7 | [`mockups/`](./mockups/) | Self-contained static HTML mockups (Energya tokens + Poppins inline, referencing `/logo.png`). |

## Mockups

| Key | File | Page |
| --- | --- | --- |
| A | [`mockups/A-login.html`](./mockups/A-login.html) | Login |
| B | [`mockups/B-app-shell.html`](./mockups/B-app-shell.html) | App Shell + Internal Dashboard |
| C | [`mockups/C-inquiry-list.html`](./mockups/C-inquiry-list.html) | My Inquiries list |
| D | [`mockups/D-inquiry-workspace.html`](./mockups/D-inquiry-workspace.html) | Inquiry Workspace (header + 8 tabs) |
| E | [`mockups/E-cable-selection.html`](./mockups/E-cable-selection.html) | Cascading Cable Selection + result panel |
| F | [`mockups/F-advanced-parameters.html`](./mockups/F-advanced-parameters.html) | Advanced Cable Parameters (stepper) |
| G | [`mockups/G-drum-selection.html`](./mockups/G-drum-selection.html) | Drum Selection / cutting schedule |
| H | [`mockups/H-technical-office.html`](./mockups/H-technical-office.html) | Technical Office queues |
| I | [`mockups/I-costing.html`](./mockups/I-costing.html) | Costing workspace + Direct RM cost breakdown |

## How to review

1. Open any `mockups/*.html` directly in a browser (no build step). They are static and self-contained; the logo renders when served from the app root (or copy `public/logo.png` next to the file).
2. Read `CURRENT_UI_AUDIT.md` + `CONTENT_PRESERVATION_INVENTORY.md` side-by-side to confirm every current field/behavior is preserved.
3. Read `DESIGN_SYSTEM.md` for the token/component language, then the per-module + focused proposals.

## Current-vs-proposed comparison intent

The proposal is explicitly **additive and non-destructive**. Where the app already implements the target look (Phase-2 `ui/` primitives, costing V3 shell, brand tokens), the proposal **adopts and extends** rather than replaces. Where pages still use legacy `epc-*` classes and ad-hoc Tailwind, the proposal maps them onto the shared primitives so the whole platform converges on the approved image — **without changing what any page does**.

## Hard boundaries (must NOT be touched when this is eventually implemented)

Costing engine & `CostingMetalCostComponent` semantics (Option B / Decision 5 freeze); Technical Parameters V2 engineering logic, cascading parameter dependencies, validation, and existing-vs-new-cable determination; Technical Office governance workflow; BOM & Raw Material logic; drum calculation logic; inquiry workflow/state machine; authentication, RBAC, and `customerScope` isolation; Prisma schema, migrations, and all API contracts.
