# TASK 05I-C — VIP Fast Track Calculate Orchestrator

**Date:** 2026-09-10  
**Base:** 05I-B workflow runtime (`30d97df`)  
**Status:** Implemented — governed VIP `calculateInquiry` orchestrator with zero-default optional warnings

---

## 1. Purpose

Provide **`calculateInquiry(inquiryId, actor)`** for **`VIP_FAST_TRACK`** inquiries only. Orchestrates:

```text
Readiness gates (A–F) → V2 Costing → Commercial Pricing → Quotation DRAFT
```

Does **not** auto-approve Decision 5 or issue quotation. Does **not** start STANDARD workflow runtime.

**Business rule (05I-C):** Optional commercial/logistics inputs default to **0** with explicit warnings. VIP Calculate is **not** blocked merely because optional inputs are missing.

---

## 2. Entry points

| Layer | Path |
|-------|------|
| Orchestrator | `src/server/vipCalculateService.ts` → `calculateInquiry` |
| Readiness (pure) | `src/domain/vipCalculateReadiness.ts` |
| Optional components | `src/domain/vipOptionalComponents.ts` |
| Container Study classification | `src/domain/containerStudyReadiness.ts` |
| API | `POST /api/v2/inquiries/:id/calculate` |
| Domain events | `src/domain/domainEventBus.ts` |

---

## 3. Process guard

- Rejects `inquiryProcessCode !== VIP_FAST_TRACK` (`INQUIRY_PROCESS_ACTION_DENIED`)
- Requires `workflowChannel: V2_CONFIGURATION`
- Inquiry status must be `DRAFT` or `UNDER_REVIEW`

---

## 4. Readiness gate classification

| Class | Missing behaviour | Examples |
|-------|-------------------|----------|
| **A — Mandatory / structural** | **BLOCK** | Snapshot, cutting plan, confirmed drum plan, BOM Gate 2, header Cu/Al/destination/incoterms, costing gates |
| **B — Optional financial / commercial** | **value=0 + warning** | Shipping, premium, clearance, surcharges, container shipment cost |
| **C — Not applicable** | **value=0, no warning** | e.g. shipping under EXW |
| **D — Not configured** | **value=0 + warning** | Container study data absent |

### Per-line mandatory gates

| Gate | Code | Rule |
|------|------|------|
| A | `CONFIGURATION_SNAPSHOT` | V2 snapshot valid + current pointer |
| B | `CUTTING_LENGTH_PLAN` | Plan exists, not ERROR, matches snapshot |
| C | `DRUM_PLAN` | `lifecycleStatus === CONFIRMED` |
| E | `BOM_GATE_2` | `bomGovernanceBlocked` hard block (81 conflicts) |
| F | `COSTING_GATES` / `DECISION_5` | `evaluateCostingGates` via V2 costing run; Decision 5 info only |

Header commercial config (Cu/Al rates, destination, incoterms) reuses `collectInquirySubmitMissingItems`.

---

## 5. Container Study (warning, not block)

**Algorithms are NOT implemented in 05I-C.** Only classification + optional-component warning:

| Status | VIP Calculate |
|--------|---------------|
| `CONTAINER_STUDY_REQUIRED` (default) | **Allowed** — container shipment = 0 + `CONTAINER_DATA_NOT_CONFIGURED` warning |
| `CONTAINER_STUDY_NOT_READY` | **Allowed** — same zero-default warning |
| `CONTAINER_STUDY_READY` | Allowed; uses `containerShipmentCost` when configured |

Metadata key: `commercialMetadata.containerStudyReadiness`

Gate `CONTAINER_STUDY` reports **WARN** (not BLOCK) when data absent.

---

## 6. Optional component result shape

Each optional component in `VipCalculateResult.optionalComponents`:

| Field | Description |
|-------|-------------|
| `code` | `SHIPPING` \| `PREMIUM` \| `CLEARANCE` \| `SURCHARGE` \| `CONTAINER_SHIPMENT` |
| `value` | Numeric amount (0 when not configured) |
| `source` | `CONFIGURED` \| `NOT_CONFIGURED` \| `NOT_APPLICABLE` |
| `reasonCode` | e.g. `SHIPPING_NOT_CONFIGURED`, `CONTAINER_DATA_NOT_CONFIGURED` |
| `warningMessage` | Human-readable warning when `hasWarning` |
| `hasWarning` | Whether customer/UI should surface the zero-default |

Metadata keys (when configured): `shippingCost`, `metalPremium`, `clearanceCost`, `commercialSurcharge(s)`, `containerShipmentCost`.

Snapshots persisted:
- `commercialMetadata.vipLastCalculateSnapshot` on inquiry
- `commercialOfferSnapshot.optionalComponents` / `optionalWarnings` on quotation draft

---

## 7. Downstream chain

Uses existing repositories (no costingEngine redesign):

1. `calculateV2CostingRun` — persists `CostingCalculation` + `CostingRun`
2. `createV2QuotationDraftForVipCalculate` — idempotent draft (returns existing OPEN draft)
3. `persistV2QuotationPricingForVipCalculate` — applies commercial pricing + preserves optional warnings

**Idempotency:** Retry without `recalculate: true` skips lines that already have costing; does not create duplicate quotation drafts.

**Recalculate:** `POST .../calculate` body `{ "recalculate": true }` forces new costing runs.

---

## 8. Security

| Control | Implementation |
|---------|----------------|
| Permission | `COMMERCIAL:INQUIRY:CALCULATE` (`assertCanCalculateVipInquiry`) |
| Customer scope | `loadV2InquiryScoped` + `assertCanAccessInquiryOwnership` |
| IDOR | Cross-customer calculate returns 403 |

---

## 9. Audit events

| Action | When |
|--------|------|
| `VIP_CALCULATE_STARTED` | Orchestrator entry |
| `VIP_CALCULATE_BLOCKED` | Mandatory gate or costing failure |
| `VIP_CALCULATE_COMPLETED` | Full chain success (may include optional warnings) |
| `VIP_QUOTATION_DRAFT_CREATED` | New draft created |

---

## 10. UI

`CommercialInquiryDetail` — **Calculate** for VIP + V2 inquiries. When complete with optional warnings, shows per-component zero-default breakdown. When blocked, shows mandatory gate breakdown only.

---

## 11. Tests

| File | Coverage |
|------|----------|
| `src/domain/vipOptionalComponents.test.ts` | Zero-default unit cases |
| `src/platform/vipCalculateOrchestrator.test.ts` | Readiness reclassification, integration, idempotency, snapshot persistence |

---

## 12. Out of scope (05I-C)

- Container Study algorithms / logistics engine
- Workflow runtime for VIP (STANDARD only in 05I-B)
- Quotation approve / issue
- 05I-D

---

## 13. Files

| Area | Path |
|------|------|
| Optional components | `src/domain/vipOptionalComponents.ts` |
| Container classification | `src/domain/containerStudyReadiness.ts` |
| Readiness | `src/domain/vipCalculateReadiness.ts` |
| Orchestrator | `src/server/vipCalculateService.ts` |
| Quotation hooks | `src/server/v2QuotationRepository.ts` |
| UI | `src/components/inquiry-quotation/CommercialInquiryDetail.tsx` |
| Tests | `src/platform/vipCalculateOrchestrator.test.ts`, `src/domain/vipOptionalComponents.test.ts` |
