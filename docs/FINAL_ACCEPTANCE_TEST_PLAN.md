# Final Acceptance Test Plan (30 browser steps)

**Date:** 2026-08-25  
**Status:** **PLAN ONLY.** This Phase 0 audit did **not** execute these steps in a browser. Increment 14 (2026-08-24) recorded that Browser MCP had no tab; API/tests were used instead. Do not mark PASS/FAIL here without a new run.

**Environment:** app as started by operators (`npm run dev`, default port 3847 unless configured). PostgreSQL required for persist. Do **not** `prisma migrate reset`. Do **not** paste ELAND sheet totals into RM prices.

**Expected honesty:** Four ELAND cables (`10009487`, `10009546`, `10010347`, `10010439`) are **likely NOT_READY** (`PRICE_NOT_CONFIGURED`, `ENGINEERING_NOT_APPROVED`, `FX_NOT_CONFIGURED`, empty governed BOM). A READY total is a **fail** if prices were invented.

---

| # | Actor | Action | Expected (system) | Notes |
|---|--------|--------|-------------------|--------|
| 1 | Unauthenticated | Open app | Redirect to customer or internal login path (`loginRoutes.ts`) | |
| 2 | Customer | Sign in via PostgreSQL identity | Session JWT in localStorage; customer portal | Identity router, not dead `mockDbUsers` |
| 3 | Customer | Dashboard | Inquiry KPIs from `/api/inquiries` | Order tiles may still be mock |
| 4 | Customer | My Inquiries → New | Persisted inquiry number after POST | |
| 5 | Customer | Open inquiry, add line with cable from master | Line saved in PostgreSQL; refresh keeps it | |
| 6 | Customer | Attempt Calculate if shown | Forbidden or no cost breakdown | `commercialProjection` |
| 7 | Customer | Refresh / reopen | Same inquiry from DB | |
| 8 | Internal (no costing perm) | Costing Configuration nav | Access restricted | Sidebar RBAC |
| 9 | Costing Team | Sign in | Internal portal; Costing Configuration | |
| 10 | Costing Team | Overview tab | Live counts, not a fake “256 cables” marketing number | Inc 14 workspace |
| 11 | Costing Team | Raw Material Prices | Official codes; blank price stays not configured; I4-RM-* hidden if still the rule | Do not type ELAND totals |
| 12 | Costing Team | Formulas | Only `+ - * / ( )`; SUM/IF controls disabled | |
| 13 | Costing Team | BOM Costing | Governed/source BOM + engine price status; not a second calculator | `GET bom-scrap` + validate persist:false |
| 14 | Costing Team | Preview one ELAND material persist:false | Breakdown or blocking codes; **no silent zero total** | |
| 15 | Costing Team | Other Costs / FX | Empty amounts → NOT_CONFIGURED; FX draft not consumable | |
| 16 | Technical Office | Mapping queue for `10009546` / `10010347` / `10010439` | DRAFT mapping visible; TO **cannot** approve RM prices | |
| 17 | Technical Office | BOM conflicts | Conflicts listed; no auto-resolve with invented consumption | |
| 18 | Sales | Sales Quotations → inquiry with ELAND line | Header + lines | |
| 19 | Sales/Costing | Calculate all lines | HTTP `NOT_READY` + blockingReasons; no `costingCalculationId` if blocked | **Expected today** |
| 20 | Sales | Reopen inquiry | Readiness NOT_READY persisted; no fake READY snapshot | |
| 21 | Sales | Create quotation if allowed without READY | Follow product gate; must not freeze an invented cost | |
| 22 | Costing | `POST /api/costing/calculate` via TO workbench **if mounted** | Same orchestrator; unmounted workbench = skip / N/A | Component currently unmounted |
| 23 | Costing | Quick Cost Quote | Sandbox stack; defaults 2%/6% **must not** be copied to inquiry as official cost | Label as sandbox |
| 24 | Admin | Users/Roles | PostgreSQL users; change role persists | |
| 25 | Internal | Internal Dashboard | KPI strip from `/api/admin/platform/dashboard/kpis`; charts may still be hardcoded | Do not certify revenue charts |
| 26 | Internal | Reports / Production / Finance | Mock — record as **not accepted** for go-live | |
| 27 | Internal | Master Data Import Center | Preview does not commit; commit persists; legacy `/api/master-data/import` does not persist | |
| 28 | Two customers | Customer A must not see Customer B inquiries | Isolation | |
| 29 | Operator | `GET /api/d365/sync-status` | Today returns connected:true (defect vs honesty). Target: not live ERP | Record actual JSON |
| 30 | Operator | After any READY calculation (only if business data truly approved) | Refresh shows same `costingCalculationId` and totals; new inquiry version for recalc | Skip if still NOT_READY |

---

## Non-browser evidence already on file (not a substitute for step 19–20)

- `docs/INCREMENT_14_FOUR_CABLE_ACCEPTANCE_TEST.md` — engine probe persist:false, all four NOT_READY.  
- `docs/INCREMENT_14_FINAL_ACCEPTANCE_REPORT.md` — 414 tests claimed 2026-08-24; tsc pass; UI not exercised.  
- Re-run tests only if operators request; this audit did not re-run the suite.

---

## Pass criteria for a future Phase (not claimed now)

- SYSTEM READY: steps 1–2, 4–5, 7–15, 18, 24, 27–28 behave as designed.  
- BUSINESS CONFIGURED: steps 19–21 and 30 produce READY **only** after official APPROVED prices, mappings, governed BOM, and FX — never by seeding ELAND workbook numbers as master prices.
