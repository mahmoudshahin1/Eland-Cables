# Increment 14 Final Acceptance Report

**Date:** 2026-08-24  
**Workspace:** Energya Connect (`energya_connect` on 127.0.0.1:5432)

---

## SYSTEM READY vs BUSINESS CONFIGURED

| | Meaning | Status |
|--|---------|--------|
| **SYSTEM READY** | Orchestrator, formula language, assignment, inquiry persist, quotation snapshot, Costing Team workspace, RBAC, and tests are in place and do not invent totals | **Yes** |
| **BUSINESS CONFIGURED** | Official APPROVED RM prices, governed BOM, approved engineering mappings, logistics/packing amounts, and FX for costing currencies are complete enough to produce a READY total for the four ELAND cables | **No** |

Official Raw Material List prices remain blank at master-list source. DRAFT price rows in PostgreSQL are **not** published costs. ELAND workbook numbers were **not** imported as master prices.

---

## Verification executed

- `npx prisma migrate status` / `migrate deploy`: 20 migrations, **no pending**. `20260823120000_increment14_formula_assignment` is applied.
- `npx prisma validate`: schema valid.
- `npx prisma generate`: **EPERM** on Windows (query engine DLL locked by running `npm run dev`). Schema already includes assignment columns; generate is not required to apply a new migration.
- `npx tsc --noEmit`: pass.
- `npm test -- --test-concurrency=1`: **414/414 pass**.
- Four-cable probe via `executeCostingForInquiryLine` persist:false (see `INCREMENT_14_FOUR_CABLE_ACCEPTANCE_TEST.md`).
- Browser MCP: could not open a tab (`No browser tab available`). UI not exercised in-browser this pass. Workspace/inquiry/customer isolation covered by Increment 13 Phase E + Increment 14 API tests.

RM `priceStatus` drift (44 rows CONFIGURED without APPROVED prices) was restored using the official list upsert in `persistImportTransaction` (same path as `import:masters` RM step). No amounts invented.

---

## Workspace screens (CostingConfigurationDashboard)

Overview (live KPIs), prices (I4-RM-* hidden, Bearer template), scrap, variables, formulas (`+ - * / ( )` only; SUM/IF disabled), **BOM Costing (added)**, assignment, other costs (metal/logistics/packing), preview, versions, approval, audit.

BOM Costing shows governed/source BOM from `GET /api/admin/costing/bom-scrap` plus engine price status from `POST /api/admin/costing/validate` (persist:false). Not a second calculator.

---

## Remaining CONFIGURATION_REQUIRED (business)

- APPROVE Costing Team RM prices (or leave blank → `PRICE_NOT_CONFIGURED`)
- Technical Office: approve mappings for 10009546 / 10010347 / 10010439; resolve BOM conflicts; publish governed BOM
- FX LE→USD (and other costing currencies) as needed
- Logistics / packing amounts (do not zero-fill)
- Family mapping on Cable Master (currently UNMAPPED)

---

## Next phase (suggested)

Costing Team publishes APPROVED prices and extension amounts; Technical Office closes mapping/BOM governance; then re-run the four-cable matrix expecting READY only when gates pass. Golden ELAND numeric match remains blocked until those approvals exist.
