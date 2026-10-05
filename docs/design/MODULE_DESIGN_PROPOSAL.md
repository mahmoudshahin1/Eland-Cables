# MODULE DESIGN PROPOSAL — All 15 Modules

> Presentation-only redesign for every module. **Behavior, fields, workflows, validation, RBAC, and APIs are preserved** exactly as audited. Each module: page layout · navigation · header · sections/cards · tables · forms · buttons · icons · status indicators · modal/drawer behavior · responsive. All components reference the shared design system in `DESIGN_SYSTEM.md`.

Global chrome (applies to every module):
- **Navbar:** navy `brand-700`, logo left (`/logo.png`), notifications/theme/user menu right. Unchanged content.
- **Sidebar:** navy, collapsible on desktop, drawer on mobile; adopt registry icons; permission-filtered items unchanged.
- **PageHeader band** (`ui/PageHeader`) at top of each content area: breadcrumb `›` + title (Poppins) + right-aligned actions.
- **Content canvas:** `surface-muted`/white with `pageStack` spacing; cards via `ui/Card`; tables via `ui/Table`; forms via `ui/Form`; dialogs via `ui/Modal`/`Drawer`.

---

## 1. Login
- **Layout:** keep two-panel card (`max-w-6xl`): left form, right navy hero (`hidden lg:flex`). Hero uses `brand-800→900` gradient + subtle pylon SVG (already in CSS `.login-pylon-bg`).
- **Header:** logo top-left of form panel; "Welcome Back" (Poppins).
- **Form:** `ui/Form` fields (Email, Password with show/hide, Remember me), primary `ui/Button` "Sign In", tertiary "Forgot password?", secondary Entra "Coming Soon". Portal toggle as segmented control.
- **Status:** inline `error-500` banner (`AlertCircle`) — keeps exact messages.
- **Icons:** `Mail`, `Lock`, `Eye/EyeOff`, hero `voltage`(`Zap`), `quality`(`ShieldCheck`), `conductor`(`CircuitBoard`).
- **Responsive:** hero hidden < lg; form `px-6 py-10 sm:px-10 lg:px-14`.
- **Preserved:** `loginWithJwt`, `validateLoginPortal`, dedicated portal paths, forgot-password 2-step, demo accounts note.

## 2. App Shell / Navigation
- **Layout:** navbar + sidebar + main + footer; costing keeps full-screen navy shell.
- **Nav:** grouped sidebar with section header ("Authorized Modules" / "{N} Allowed"); active item navy pill + accent left bar; collapse to icon-rail (`lg:w-20`) with tooltips.
- **Mobile:** off-canvas drawer + wire `MobileBottomNav` for customer portal (Dashboard / Inquiries / Support + more).
- **Status:** notification popover with unread dot; user menu with role line.
- **Preserved:** two-portal resolution, permission filtering, costing navy sub-nav, redirect logic.

## 3. Customer Dashboard
- **Header:** greeting card ("CUSTOMER PORTAL", ID chip) + primary "New Inquiry" CTA.
- **Sections:** KPI stat row (`DashboardStatCard`: Open Inquiries/Submitted/Under Review/Quoted) → "Your Inquiries" card with filter toolbar + table.
- **Table:** `ui/Table` — Inquiry No., Version, Date, Cable, Length, Drum, Value, Currency, Status (`StatusBadge`). Row click opens workspace. Empty/loading states standardized.
- **Icons:** `inquiry`, `quotation`, `Clock`, `FileCheck`.
- **Responsive:** stat grid `1/2/3/5`; table `overflow-x-auto min-w-[960px]`.
- **Preserved:** `GET /api/inquiries`, status filters, navigation targets.

## 4. My Inquiries (list)
- **Header:** title + "New Inquiry" + Export + Columns.
- **Toolbar:** search, status dropdown, date from/to, sort — as a single filter bar (`ui/Form` controls).
- **Table:** selectable rows, pagination (Previous/Next, 12/page), status pills.
- **Modal/Drawer:** Columns visibility as a small popover.
- **Preserved:** RBAC (customer always New; internal `salesQuotations`), CSV export gating, all filters. Detail in `INQUIRY_DESIGN_PROPOSAL.md`.

## 5. Inquiry Workspace (detail + 8 tabs)
- **Layout:** sticky detail header (title `Commercial Inquiry / {ref} · V{n}`, status badge, toolbar) → collapsible **Inquiry header** card (grouped fields) → `ui/Tabs` (Overview, Cables, Costing, Drums, Cutting, Documents, Quotation, Activity) → `InquirySummaryBar`.
- **Header form:** group the ~22 fields into fieldsets: *Transaction* (Type, Trx Date, Ref No, Status, Version), *Parties* (Customer, Organization, Contact, Sales Agent, Quotation Owner, Project), *Commercial* (Currency, Exchange Rate, RM Currency, RM Exchange Rate, Copper Price, Aluminium Price with source badges), *Delivery* (Incoterms, Destination, Delivery Date), *Notes* (Remarks, Sales Comments internal). `ui/Field` with `*`.
- **Tabs:** each a `ui/Card`-framed panel; Cables uses wide `ui/Table` (`min-w-[1100px]`) with row actions; Costing shows Direct RM breakdown (internal) with `StatusBadge`; Activity uses version-compare selectors + audit timeline.
- **Modals:** CableSearchSelectModal, Edit Line, Submit summary, Missing-info (`ui/Modal`); Line attachments (`ui/Drawer`).
- **Preserved:** every field ID, dependency (currency→RM/clear metals; total=drums×cutting), submit codes, status machine, projection, all APIs.

## 6. Cable Selection (V2 cascading)
- **Layout:** left parameter grid (`ui/Card`) + right result panel; progress stepper on top (`overflow-x-auto`).
- **Grid:** 27 numbered parameters as `ui/Field` selects with **locked/unlocked** visual states (disabled + lock icon until upstream set); Yes/No params as switches; per-core color grid.
- **Result panel:** three states (Existing Approved / Valid New / Invalid) as distinct `ui/Card` variants with `StatusBadge` (emerald/blue/rose) and the exact fields (Material Number, Item Code, Ø, weight, description, construction logic).
- **Icons:** layer icons (`conductor`, `insulation`, `screen`, `armour`, `sheath`, `voltage`, `cores`).
- **Preserved:** cascading unlock/sanitize/option-filter engine, validation, existing-vs-new determination, stepper. Detail in `CABLE_SELECTION_DESIGN_PROPOSAL.md`.

## 7. Advanced Cable Parameters
- Same engine, "advanced" presentation: full 27-parameter grid with section grouping matching stepper (Family & Voltage / Conductor / Cores & Colors / Insulation / Screen & Armour / Sheathing / Validation). Live "{N} Parameters Active" + filtered catalog count chip. **Preserved:** identical logic; only grouping/visual polish.

## 8. Cable Configuration / Engineering Result
- **Layout:** result-first panel with construction summary (mono description block), estimated Ø/weight pills, and construction-logic badge; action row (Select this cable / Continue to Cutting Length / Modify / Send to Technical Office / Correct Configuration) as `ui/Button` variants.
- **Cutting length section:** shown only when a master match exists — `ui/Card` with cutting length, drum, tolerance, "Add to Request".
- **Preserved:** `SendToTechnicalOfficeModalV2`, cutting-length flow, all result fields.

## 9. Technical Office
- **Layout:** `ui/Tabs` for 7 queues; each queue = filter toolbar + `ui/Table` list + right `ui/Drawer` detail with workflow buttons.
- **Status:** governance states as `StatusBadge` (DRAFT/SUBMITTED/UNDER_REVIEW/APPROVED/REJECTED; BOM BDR/ASSIGNED/…; TCR statuses).
- **Forms:** mapping edit + BOM decision form as `ui/Form` in the drawer.
- **Preserved:** all workflows, bulk actions, Excel Method-B 44-col template, APIs.

## 10. Drum Selection / Optimizer
- **Layout:** inputs card (Cable Weight/m, Total Order Tolerance) + schedule `ui/Table` (Drum Code, No. of Drums, Cutting Length, Drum Tolerance, computed Fill %/Nominal/Total Wt) + summary stat cards + container recommendation cards (20ft/40HC).
- **Modals:** DrumDetailsModal + ContainerAndDrumOptimizerModal as `ui/Modal` (wide).
- **Status:** EWD `CONFIGURATION_REQUIRED` shown as honest `warning` callout.
- **Preserved:** all fields, client math, EWD governance boundary, presets. Detail in `DRUM_SELECTION_DESIGN_PROPOSAL.md`.

## 11. Costing (workspace)
- **Layout:** keep full-screen navy shell + grouped sub-nav; adopt `CostingUiPrimitives` (already the target look). Align tokens with rest of app.
- **Panels:** Dashboard (KPI + charts), Readiness (register + drawer), Production Readiness (checklist), Validation (test form → **Direct RM cost breakdown** 10-col table), RM/Prices/BOM/Currencies/FX/Metal panels (table + side panel CRUD), Bulk Import (8-step wizard), Audit, Settings.
- **Status:** Option B / Decision 5 banners kept verbatim; gate badges via `gateStatusBadge`.
- **Preserved:** **engine freeze** — Option B semantics, `CostingMetalCostComponent`, cost columns, all `/api/admin/costing/**` calls.

## 12. Production Readiness
- Read-only governance dashboard: overall PRODUCTION READY badge, KPI cards, mandatory checklist (Gate/Status), 8-area statuses, golden cables table. **Preserved:** refresh-only, no sign-off UI, live API. Keep Decision 5 signed/pending honesty.

## 13. Master Data
- **Layout:** `ui/Tabs` (Data Quality, Readiness, Cable Master, Cable BOM, Raw Materials, Drum Master, Import Center).
- **Tables:** each entity `ui/Table`; Import Center = 3-step flow (upload → validate/preview → confirm) with `ui/Card` steps + drag/drop zone.
- **Status:** `PRICE_NOT_CONFIGURED` / `CONFIGURATION_REQUIRED` as honest badges.
- **Preserved:** entities, import commit API, `masterData` RBAC, local-store fallback.

## 14. Administration
- **Layout:** `ui/Tabs` (Overview, Users, Customers, Customer users, Roles & Permissions, Security summary).
- **Users:** filter bar + `ui/Table` (Name/Email/Department/Customer/Roles/Status/Last login/Actions); create/edit via `ui/Modal`; lifecycle actions as row menu.
- **Roles:** two-pane (roles list + permission matrix checkboxes, `canAssign` gated).
- **Icons:** `users`, `customers`, `administration`, `quality`.
- **Preserved:** all lifecycle + role/permission APIs and `canAssign` gating.

## 15. Settings / Profile
- **Layout:** `ui/Card` account header (name/email + type/role badges) → read-only details `dl` → Change password `ui/Form`.
- **Preserved:** `visibleProfileFields()` set (customer vs internal), `POST /api/auth/change-password`, min-8 validation.

---

### Cross-module status-indicator vocabulary (presentation only)
DRAFT/Open → `warning`; UNDER_REVIEW → `info`; SUBMITTED → `brand`; QUOTED/APPROVED/Ready/Released → `success`; INVALID/Blocked/Not Ready/REJECTED → `error`; NOT_CONNECTED/NOT_IMPLEMENTED/CONFIGURATION_REQUIRED → `neutral`/`warning` honest placeholder. Metals → `copper`/`aluminium` tones. (Via `ui/Badge` `statusToTone()`.)
