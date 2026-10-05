# Final Low-Code Architecture

**Date:** 2026-08-25  
**Definition in this codebase:** metadata-driven configuration (fields, costing methods, formulas, scrap, FX, extension rules, report definitions) **without** arbitrary JavaScript or SQL. Formula language remains tokenizer → AST → `+ - * / ( )`.

---

## What actually exists

### Costing configuration (strong)

UI: `CostingConfigurationDashboard.tsx` tabs — Overview, Raw Material Prices, Scrap, Variables, Formulas, BOM Costing, Cable Assignment, Other Costs, Preview, Versions, Approval, Audit.

APIs: `/api/admin/costing/*` (`costingAdminRoutes.ts`) — CRUD + workflow for configurations, variables, components, formulas (validate/preview/activate), scrap rules, FX, RM prices, BOM scrap, lookups, preview, validate, readiness, calculator preview, audit, approval queue.

RBAC: Costing Team (`costingPricing` / granular COSTING permissions). Technical Office cannot approve RM prices.

Formulas: assignment GLOBAL / FAMILY / CABLE (Inc 14). SUM/IF **disabled** in UI and rejected by tokenizer if written as unexpected tokens/identifiers used as functions (no function-call grammar).

Preview/BOM Costing: `executeCostingForInquiryLine` persist false — **not** a second calculator.

### Inquiry field manifests (partial)

`src/services/inquiryFieldManifest.ts` — compile-time field lists + `localStorage` user visibility prefs (`InquiryFieldVisibilityPanel.tsx`).

This is low-code **for the developer** (edit TS and ship), not admin-runtime.

### Platform metadata models (schema + thin API)

Prisma: `PlatformFieldDefinition`, `NotificationRule`, `ReportDefinition` (migration `20260822170000_final_consolidation_low_code_config`).

HTTP: `platformAdminRoutes.ts` GET/POST for fields, notification rules, reports, metal/logistics/packing.

UI: Costing Other Costs + `AdministrationCostingPanel` consume metal/logistics/packing. **Inquiry forms do not load `PlatformFieldDefinition`.** Reports UI does not execute `ReportDefinition`.

### Dashboards (mixed)

| Surface | Low-code? | Actual |
|---------|-----------|--------|
| Costing Overview | Configured KPIs from APIs | Live cable/governance counts (Inc 14); not mock 256/212 |
| Internal Dashboard | No builder | Some `getPlatformKpis()`; **hardcoded** monthly sales / top customers |
| Reports Analytics | No builder | Mock OEE/conversion |
| Customer Dashboard | No builder | Inquiry counts from API; orders from mock |

`dashboardKpiService.costingReadyCables` counts ACTIVE cables, **not** orchestrator READY — not a configured KPI definition.

### Notifications (gap)

`NotificationRule` table + `notificationService.ts` (SMTP if env set). Navbar notifications are React state. No admin screen driving inquiry events from `NotificationRule` as SoT.

---

## Gaps (do not invent values to close them)

- Admin field grid for all entities.
- Report builder on approved entity queries.
- Dashboard widget builder.
- Notification configuration UX + persistence of in-app alerts.
- Metal/logistics/packing **amounts** (structure exists).
- Family mapping so FAMILY formula assignment works.
- Export templates completeness (Import Center stronger than export).

---

## Protected (must remain code, not low-code)

BOM conflict resolution, price overlap, cable authority, costing readiness gates, customer isolation, audit immutability, authorization, formula sandbox.

---

## Dual systems to reconcile later

1. `inquiryFieldManifest.ts` vs `PlatformFieldDefinition`  
2. Costing workspace vs Administration Costing tab (same dashboard, two doors)  
3. Calculator sandbox vs orchestrator (keep labeled sandbox)
