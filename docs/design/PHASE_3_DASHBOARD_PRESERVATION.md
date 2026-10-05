# PHASE 3 — DASHBOARD PRESERVATION INVENTORY & DESIGN SPECIFICATION

> Comprehensive element-by-element preservation inventory and presentation design specification for the Customer Dashboard (`src/components/customer/CustomerDashboard.tsx`) and Internal Dashboard (`src/components/internal/InternalDashboard.tsx`).
> 
> **Design Rules:**
> - Zero changes to business logic, APIs, database schemas, RBAC/permissions, routing, workflows, calculations, or navigation payloads.
> - Full adoption of approved Energya Design System tokens (`src/index.css`), UI primitives (`src/components/ui/*`), Poppins display typography, and industrial icons.
> - Strict RTL safety (logical CSS properties: `ms/me`, `ps/pe`, `start/end`, `text-start`, `text-end`).
> - Responsive reflow without data hiding on mobile screens.

---

## 1. Customer Dashboard (`CustomerDashboard.tsx`)

| Existing Element | Current Source | Preserve | New Presentation | Mobile Behaviour |
| :--- | :--- | :--- | :--- | :--- |
| **Portal Header Banner** | `CustomerDashboard.tsx` (top banner) | **100% Preserved** | Clean enterprise card (`Card` or elevated banner) with Poppins heading, `CUSTOMER PORTAL` badge (`Badge tone="brand"`), customer code pill (`ID: {customerCode}`), dynamic time-of-day greeting (`Good Morning / Afternoon / Evening, {customerName}`), and descriptive subtitle. | Stacks vertically on `< md`, aligns start, full-width CTA. |
| **New Inquiry Action** | `onNavigateTab('price_estimation')` | **100% Preserved** | `Button variant="primary"` with `Plus` icon and Poppins font. Exact payload `('price_estimation')`. | Full-width button on small mobile screens. |
| **KPI: Open Inquiries** | `kpis.draft` (`status: 'DRAFT'`) | **100% Preserved** | `StatCard` / `DashboardStatCard` with `FileText` icon, brand navy value, hover lift, view-all trigger. | Reflows into 2-column or 1-column responsive grid. |
| **KPI: Submitted** | `kpis.submitted` (`status: 'SUBMITTED'`) | **100% Preserved** | `StatCard` / `DashboardStatCard` with `Send` icon, brand navy value, view-all trigger. | Reflows into 2-column or 1-column responsive grid. |
| **KPI: Under Review** | `kpis.underReview` (`status: 'UNDER_REVIEW'`) | **100% Preserved** | `StatCard` / `DashboardStatCard` with `Clock` icon, brand navy value, view-all trigger. | Reflows into 2-column or 1-column responsive grid. |
| **KPI: Quoted** | `kpis.quoted` (`status: 'QUOTED'`) | **100% Preserved** | `StatCard` / `DashboardStatCard` with `FileCheck` icon, brand navy value, view-all trigger. | Reflows into 2-column or 1-column responsive grid. |
| **KPI: My Inquiries (Phase 1 Customer)** | `inquiryTotal` (`isPhase1Customer`) | **100% Preserved** | `StatCard` / `DashboardStatCard` with `ClipboardList` icon, brand navy value, view-all trigger. | Reflows into 2-column or 1-column responsive grid. |
| **Inquiries Card Header** | "Your Inquiries" + "Open workspace" | **100% Preserved** | `Card` header with Poppins uppercase title, subtle border, and `Open workspace` button linking to `onNavigateTab('price_estimation')`. | Stacks title and action with space-between. |
| **Search Filter** | `filters.q` text input | **100% Preserved** | Search input with `Search` icon prefix, rounded-lg border, focus ring `brand-300`, placeholder "Search inquiry no., ref, project…". | Full-width on mobile. |
| **Status Select Filter** | `filters.status` select dropdown | **100% Preserved** | `Select` control with options: All statuses, Open (DRAFT), Submitted (SUBMITTED), Under Review (UNDER_REVIEW), Quotation Generated (QUOTED), Canceled (CANCELLED). | Full-width on mobile. |
| **Date From Filter** | `filters.dateFrom` date input | **100% Preserved** | `Input type="date"` with standard control styles. | Full-width on mobile. |
| **Loading State** | `loading` boolean | **100% Preserved** | Centered loader with informative message "Loading inquiries…". | Centered in card body. |
| **Error State** | `error` string | **100% Preserved** | Semantic warning/error container with Alert icon and preserved error message. | Centered in card body. |
| **Empty State** | `inquiries.length === 0` | **100% Preserved** | Industrial empty state with message "No inquiries yet. Create your first inquiry." | Centered in card body. |
| **Inquiries Data Table** | `inquiries` array (`CommercialInquiryDto[]`) | **100% Preserved** | `Table`, `THead`, `TBody`, `Tr`, `Th`, `Td` design system components with subtle header, hover row highlight, and row click handler to open inquiry workspace. | Horizontal scroll (`overflow-x-auto min-w-[960px]`) preserving all columns without data loss. |
| **Column: Inquiry No.** | `inquiry.inquiryNumber` | **100% Preserved** | Monospace bold brand link with stopPropagation to open inquiry workspace. | Visible in scrollable table. |
| **Column: Version** | `V{inquiry.versionNo || 1}` | **100% Preserved** | Centered version badge/text. | Visible in scrollable table. |
| **Column: Date** | `inquiry.inquiryDate?.slice(0, 10)` | **100% Preserved** | Formatted date string or "—". | Visible in scrollable table. |
| **Column: Cable** | `preview.cable` | **100% Preserved** | Truncated cable description with native `title` tooltip. | Visible in scrollable table. |
| **Column: Length** | `preview.length` | **100% Preserved** | Length value display. | Visible in scrollable table. |
| **Column: Drum** | `preview.drum` | **100% Preserved** | Truncated drum description with native `title` tooltip. | Visible in scrollable table. |
| **Column: Value** | `value.toLocaleString(...)` | **100% Preserved** | Formatted currency value or "—", text-end aligned. | Visible in scrollable table. |
| **Column: Currency** | `inquiry.currency` | **100% Preserved** | Currency code or "—". | Visible in scrollable table. |
| **Column: Status** | `formatInquiryStatus(inquiry.status)` | **100% Preserved** | `StatusBadge` mapping status to semantic tones (warning/success/error/neutral). | Visible in scrollable table. |
| **Table Footer Action** | "View all" link | **100% Preserved** | Right-aligned link with `ArrowUpRight` icon to `onNavigateTab('price_estimation')`. | Right-aligned at bottom of card. |

---

## 2. Internal Dashboard (`InternalDashboard.tsx`)

| Existing Element | Current Source | Preserve | New Presentation | Mobile Behaviour |
| :--- | :--- | :--- | :--- | :--- |
| **Executive Header Banner** | Top Hero Banner | **100% Preserved** | Deep navy brand hero card with `INTERNAL ENTERPRISE PORTAL` badge, user logged-in indicator (`currentUser?.fullName || currentUser?.email`), Poppins title "Dashboard Overview — Executive Command Center", and enterprise subtitle. | Stacks header and quick action buttons vertically on mobile. |
| **Quick Action: Cable Parameters** | `onNavigateTab('cable_configurator')` | **100% Preserved** | `Button variant="primary"` with `Sliders` icon. Exact payload `('cable_configurator')`. | Full width / wrapped in button row on mobile. |
| **Quick Action: Master Data Import** | `onNavigateTab('master_data')` | **100% Preserved** | `Button variant="secondary"` with `Upload` / `Database` icon. Exact payload `('master_data')`. | Full width / wrapped in button row on mobile. |
| **Quick Action: Reports** | `onNavigateTab('reports_analytics')` | **100% Preserved** | `Button variant="accent"` with `BarChart3` icon. Exact payload `('reports_analytics')`. | Full width / wrapped in button row on mobile. |
| **KPI: Open Inquiries** | `kpis?.openInquiries` | **100% Preserved** | `StatCard` with `FileText` icon, brand navy value, live PostgreSQL data, view-all trigger `('sales_quotations')`. | Reflows into 2-column or 3-column responsive grid. |
| **KPI: Open Quotations** | `kpis?.openQuotations` | **100% Preserved** | `StatCard` with `FileCheck` icon, brand navy value, live PostgreSQL data, view-all trigger `('sales_quotations')`. | Reflows into 2-column or 3-column responsive grid. |
| **KPI: Active Customers** | `kpis?.activeCustomers` | **100% Preserved** | `StatCard` with `Users` icon, brand navy value, live PostgreSQL data, view-all trigger `('master_data')`. | Reflows into 2-column or 3-column responsive grid. |
| **KPI: TO Requests** | `kpis?.technicalOfficeRequests` | **100% Preserved** | `StatCard` with `Wrench` icon, brand navy value, live PostgreSQL data, view-all trigger `('technical_office')`. | Reflows into 2-column or 3-column responsive grid. |
| **KPI: BOM Conflicts** | `kpis?.bomConflicts` | **100% Preserved** | `StatCard` with `AlertTriangle` icon, brand navy value, live PostgreSQL data, view-all trigger `('master_data')`. | Reflows into 2-column or 3-column responsive grid. |
| **KPI: Unpriced Materials** | `kpis?.unpricedRawMaterials` | **100% Preserved** | `StatCard` with `Coins` icon, brand navy value, live PostgreSQL data, view-all trigger `('costing_pricing')`. | Reflows into 2-column or 3-column responsive grid. |
| **Chart: Inquiries by Status** | `salesOrdersByStatus` + Recharts | **100% Preserved** | `Card` container with Recharts donut chart, center total overlay (`inquiryTotal`, "Current inquiries"), and colored status legend pill grid below. | Stacks in 1-column grid on `< lg`. |
| **Chart: Monthly Sales (USD Millions)** | Placeholder card | **100% Preserved** | `Card` container with honest system state: "No data configured. Sales order values are not connected (D365 NOT_CONNECTED). This chart does not invent revenue." | Stacks in 1-column grid on `< lg`. |
| **Chart: Top Customers by Sales** | Placeholder card | **100% Preserved** | `Card` container with honest system state: "No data configured. Customer ranking requires live orders; none are sourced from ERP." | Stacks in 1-column grid on `< lg`. |
| **Card: Recent Activities** | Placeholder card | **100% Preserved** | `Card` container with honest system state: "No data configured. Activity feed is not wired to AuditEvent for this dashboard." | Stacks full width on mobile. |
| **Card: Alerts & Notifications** | Placeholder card + links | **100% Preserved** | `Card` container explaining unpriced materials & BOM conflicts are in top KPI row, plus honest quick buttons: "Finance (NOT_IMPLEMENTED)" -> `('finance_collections')`, "Production (NOT_CONNECTED)" -> `('orders_production')`, "Costing Configuration" -> `('costing_pricing')`. | Stacks full width, buttons wrap gracefully. |

---

## 3. Visual & Architecture Verification Criteria
1. **Design Primitives:** Composed using `Card`, `StatCard`, `Button`, `Badge`, `StatusBadge`, `Table`, `THead`, `TBody`, `Tr`, `Th`, `Td`, `Input`, `Select`.
2. **Typography:** Poppins headings and KPI numbers (`font-display`), crisp Inter/Segoe body text.
3. **Colors:** Deep Navy (`#143a78` / `#0f2c5c`), Energya Blue (`#1d4fa1`), Vermilion Accent (`#f04e30`), Slate neutrals (`#f8fafc`, `#f1f5f9`, `#64748b`, `#0f172a`).
4. **Direction:** RTL safe via logical properties (`ms-*`, `me-*`, `ps-*`, `pe-*`, `start-*`, `end-*`, `text-start`, `text-end`, `border-s`, `border-e`).
5. **No Regressions:** TypeScript typecheck clean (0 errors), all 547 test cases passing (0 failures).
