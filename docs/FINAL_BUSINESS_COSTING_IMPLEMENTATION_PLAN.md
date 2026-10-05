# Final Business Costing / Inquiry Implementation Plan

**Date:** 2026-08-25  
**Workspace:** Energya Connect (Express + Prisma + PostgreSQL)  
**Rule:** Repair the current app. One engine only: `executeCostingForInquiryLine`. Do not invent prices, scrap, LME, incoterm, drum cost, or KPIs. No `prisma migrate reset`. NestJS is not in this repo.

---

## Existing (reuse)

| Area | Status |
|------|--------|
| Single costing engine | `executeCostingForInquiryLine` — inquiry calculate, admin preview/validate, readiness, `costingRepository` adapter |
| Inquiry persist | `POST /api/inquiries/:id/calculate-cost` and per-line calculate; READY snapshot only; NOT_READY does not fake 0 |
| Cutting length column | `CommercialInquiryLine.cuttingLengthMeters` persisted |
| Approved inquiry header | `InquiryHeaderForm` + `inquiryFieldManifest` |
| Formula language | `+ - * / ( )` only; SUM/IF disabled in Costing Hub |
| Scrap | BOM line % first, then `BOM_LINE > CABLE > FAMILY > MATERIAL_CLASS > GLOBAL`, lowest priority; equal overlap `BUSINESS_RULE_REQUIRED` |
| Costing Hub | `CostingConfigurationDashboard` on existing models |
| FX / metal / logistics / packing models | Prisma + `/api/admin/platform/costing/*` |
| Customer projection | Strips costing ids and breakdown |
| D365 adapters | `NOT_IMPLEMENTED`; HTTP `/api/d365/sync-status` already `connected: false` / `NOT_CONNECTED` |
| Dashboard KPIs | PostgreSQL counts (not cable-master masquerading as READY) |
| Official import | `npm run import:masters` — ELAND workbook is not master prices |

## Missing (this pass)

| Item | Action |
|------|--------|
| Cutting + drum on orchestrator request | Pass `cuttingLengthMeters` and `drumType` into `buildCostingRequestFromInquiryLine` commercial metadata; length = qty × cutting when both present |
| `DRUM_CONFIGURATION_REQUIRED` as blocking | Do not persist READY if drum is empty or not on `DrumMaster`; still call the engine |
| Auto drum from Drum Master | `suggestDrumPlan` must prefer `DrumMaster` capacity, not hardcoded `APPROVED_DRUM_TYPES` as source of truth |
| Inquiry tabs | Overview / Cables / Costing / Drums / Cutting / Documents / Quotation / Activity (header preserved) |
| Attachments | Persist files in PostgreSQL (`CommercialInquiryAttachment`) |
| Costing config create UIs | Metal/LME, additives, incoterm, destination, logistics, drums, packing on existing models — amounts optional / `NOT_CONFIGURED` |
| Platform field metadata | Wire `PlatformFieldDefinition` into inquiry visibility (fallback to code manifest) |
| Print reports | Thin print from persisted inquiry + costing snapshot (not a query builder) |

## Broken / misleading (repair)

| Item | Action |
|------|--------|
| Default `Wood Reel 220` | Stop inventing a drum when the user did not pick one |
| Calculate READY + extra drum warning | Drum incomplete must be NOT_READY, not READY with a footnote |
| Inquiry Documents tab | Replace “not implemented” with real upload/list/download |
| Costing Other Costs | Lists only — add create forms that do not seed fake amounts |
| Hardcoded drum list in line editor | Use Drum Master when imported; empty master → `DRUM_CONFIGURATION_REQUIRED` |

## Duplicate (do not rebuild)

- `POST /api/costing/calculate` / `executeCostingRun` — adapter only  
- `CostingPricing.tsx` — re-export of Costing Hub  
- Inquiry field visibility in localStorage — preference cache, not SoT  
- Quick Cost Quote — sandbox; must not become inquiry cost  

## Configuration required (business, not code)

Official APPROVED RM prices, TO mapping/BOM governance for ELAND 10009546 / 10010347 / 10010439, governed BOM, FX LE→USD, logistics/packing amounts, Cable Master family. Four-cable READY totals remain **blocked** until those exist.

## Business decision (do not invent)

| Topic | Platform behaviour |
|-------|-------------------|
| Scrap Cable+Material vs enum | BOM line % is the cable×material rate. Rule scopes `CABLE` / `FAMILY` / `MATERIAL_CLASS` / `GLOBAL` map to Cable → Family → Material class → Global. No silent pick on equal overlap. |
| LME additives | Entered on `CostingMetalRate` by Costing Team; inquiry copper/aluminium rates stay metadata until a governed rule is ACTIVE |
| Config REJECTED enum | Still absent; price REJECT remains; config uses INACTIVE/SUPERSEDED |
| 2D/3D engineering | No Three.js cable engine in UI — not a second engineering system |
| Report builder | Persist `ReportDefinition` metadata; runtime builder remains `REPORT_BUILDER_NOT_IMPLEMENTED`; print uses inquiry/costing DB rows |

## Priority

1. Engine request + drum gate (correctness)  
2. Inquiry tabs / cutting / quotation / attachments / print  
3. Costing configuration create UIs  
4. Platform field wiring  
5. Docs + prisma validate / migrate deploy / tsc / tests / browser  
