# Phase 1 Implementation Log

> Date: 2026-08-22  
> Scope: Energya Connect Phase 1 (Release 1 customer journey + Release 2 pricing integrity)  
> Approach: Extend Increments 1–13 — no foundation rebuild

---

## Delivered

### Stage 1 — Backend (Inc 13 Phase E core)

| Item | Status | Notes |
|------|--------|-------|
| `executeCostingForInquiryLine` | ✅ | `costingOrchestrationService.ts` — wraps preview + persists `CostingCalculation` + `CostingRun` |
| `resolveActiveConfigurationVersion` | ✅ | Gate 5 optional — active config for costing date |
| `POST /api/inquiries/:id/lines/:lineId/calculate-cost` | ✅ | Structured 422 `NOT_READY`; customers allowed for own inquiries |
| `GET /api/inquiries/:id/lines/:lineId/costing` | ✅ | Latest breakdown snapshot |
| `GET /api/inquiries/:id/activity` | ✅ | `AuditEvent` query for inquiry + lines |
| `addInquiryLine` orchestrator hook | ✅ | Auto-calculate via orchestrator when `READY_FOR_COSTING` |
| `submitInquiry` cost snapshot + lock | ✅ | Auto-calculate missing costs; blocks recalc after submit |
| `updateInquiryLine` stale indicator | ✅ | Clears cost + sets `STALE` on qty/length/material change |
| Migration `20260822140000_increment13_phase_e_inquiry_costing` | ✅ | `costingCalculationId`, `inquiryLineId`, `inquiryId` |
| `buildLayerInputsFromCommercialMetadata` | ✅ | Metal/FX rates in input snapshot (not applied to RM prices) |
| `deliveryDestination` in `commercialMetadata` | ✅ | Structured destination field on inquiry header |

### Stage 2 — Inquiry UI

| Item | Status | Notes |
|------|--------|-------|
| Costing tab + Calculate button | ✅ | `CommercialInquiryDetail.tsx` |
| Itemised breakdown table | ✅ | Material lines + totals |
| Cable selection on add line | ✅ | `CableSearchSelectModal` |
| Line edit (qty, length, cutting, drum) | ✅ | Modal → `updateCommercialInquiryLine` |
| Activity tab | ✅ | Live `AuditEvent` feed |

### Stage 3 — Customer dashboard + nav

| Item | Status | Notes |
|------|--------|-------|
| `CustomerDashboard` real inquiries | ✅ | `fetchCommercialInquiries` — mock analytics removed |
| Sidebar Phase 1 gating | ✅ | Dashboard, Configurator, Inquiries, Support only |

### Stage 4 — Notifications

| Item | Status | Notes |
|------|--------|-------|
| `notificationService.ts` | ✅ | SMTP via env (`SMTP_*`) or console fallback on submit |

### Stage 5 — Tests

| Item | Status | Notes |
|------|--------|-------|
| `increment13.phaseE.test.ts` | ✅ | Calculate, projection, stale, submit lock, NOT_READY |

---

## Known limitations / deferred

| Gap | Rationale |
|-----|-----------|
| LME metal rate build-up into RM prices | BR-E03/E04 — snapshot only until business sign-off |
| Destination master table | `deliveryDestination` in metadata; full master deferred |
| `nodemailer` not bundled | Dynamic import; install + `SMTP_*` env for real email |
| Customer itemised breakdown RBAC | Customers see cost line; full breakdown requires `costingPricing` permission |
| Quotation `costingCalculationId` copy | Schema field on quotation line not added — `costingRunId` still copied |
| AI, production tracker, TDS, orders nav | Hidden per Phase 1 spec — routes may still exist if URL entered |
| Browser E2E | Not run in this pass — manual verification recommended |

---

## Test commands

```bash
npx prisma validate
npm test
npm run build
```

---

## Architecture note

Single costing authority: **Inc 13 orchestrator** (`executeCostingForInquiryLine`) for all inquiry calculate paths. Inc 10 `executeCostingRun` remains for cable-level workbench; inquiry lines no longer call it directly on add.
