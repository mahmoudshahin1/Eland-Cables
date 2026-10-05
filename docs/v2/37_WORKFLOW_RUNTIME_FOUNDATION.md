# TASK 05I-B — Workflow Runtime Foundation

**Date:** 2026-09-10  
**Base:** 05I-A inquiry process foundation (`9471940`)  
**Status:** Implemented — configurable workflow runtime (stages only, no business engines)

---

## 1. Purpose

Introduce a **versioned, configurable workflow runtime** that orchestrates inquiry stages for `STANDARD_WORKFLOW` while keeping `CommercialInquiry` + `CommercialInquiryLine` as the canonical commercial aggregate.

Orthogonal signals preserved:

| Signal | Meaning |
|--------|---------|
| `commercialMetadata.inquiryProcessCode` | `VIP_FAST_TRACK` \| `STANDARD_WORKFLOW` (05I-A) |
| `commercialMetadata.workflowChannel` | V2 tech channel (`V2_CONFIGURATION`) |
| `CommercialInquiry.status` | Business status enum (separate from workflow step) |

---

## 2. Prisma models

| Model | Role |
|-------|------|
| `WorkflowTemplate` | Versioned definition (`STANDARD_INQUIRY_V1`) |
| `WorkflowStep` | Stage codes (no embedded business logic) |
| `WorkflowTransition` | Governed edges + optional `conditionJson` |
| `WorkflowInstance` | Polymorphic `entityType` + `entityId`, pins template version |
| `WorkflowTask` | `PENDING` / `IN_PROGRESS` / `COMPLETED` / `CANCELLED` |
| `WorkflowAssignment` | USER / ROLE / GROUP via existing RBAC codes |
| `WorkflowEvent` | Append-only execution history |

Migration: `prisma/migrations/20260910120000_workflow_runtime_foundation`

Partial unique index: one `ACTIVE` instance per `(entityType, entityId)`.

---

## 3. STANDARD_INQUIRY_V1 seed

```
SUBMITTED → TECHNICAL_REVIEW
  → (NEEDS_INFORMATION → CUSTOMER_CLARIFICATION → CUSTOMER_RESPONSE → TECHNICAL_REVIEW)
  | TECHNICAL_COMPLETE
  → CONTAINER_STUDY → COSTING → SALES_REVIEW → QUOTATION_APPROVAL
  → QUOTATION_ISSUE → CUSTOMER_DECISION → COMMERCIAL_COMMITMENT → FULFILLMENT
```

Stages are **labels only** — Container Study, Costing, VIP Calculate, etc. are wired in later tasks.

---

## 4. Runtime service

| Command | Location |
|---------|----------|
| `startWorkflow` | `src/server/workflowRuntimeRepository.ts` |
| `getWorkflow` / `getCurrentStep` / `getTasks` | same |
| `assignTask` / `completeTask` | same |
| `transitionWorkflow` / `cancelWorkflow` | same |
| Transition validation (pure) | `src/domain/workflowRuntimeService.ts` |

Behaviours:

- **Idempotent start** — returns existing active instance
- **Template version pin** on instance create
- **Governed conditions** — `inquiryProcessCode`, `taskResult`, `terminal`
- **appendServerAudit** on start, transition, assign, complete, cancel

---

## 5. Inquiry integration (minimal)

| Path | Behaviour |
|------|-----------|
| V1 `submitInquiry` | `assertStandardSubmitAllowed` → validate → `SUBMITTED` → `startStandardInquiryWorkflow` |
| V2 `submitV2Inquiry` | Same workflow start after V2 engineering derivation |
| VIP `calculateInquiryCost` | `noteVipFastTrackWorkflowBoundary` audit stub only (05I-C pending) |

`startStandardInquiryWorkflow` runs only when `inquiryProcessCode === STANDARD_WORKFLOW`.

---

## 6. Workflow vs inquiry status mapping

Workflow step and `InquiryStatus` are **intentionally separate**. Hint map for UI/docs:

| Workflow step | Typical inquiry status hint |
|---------------|----------------------------|
| `TECHNICAL_REVIEW` | `ENGINEERING_REVIEW` |
| `NEEDS_INFORMATION` / `CUSTOMER_*` | `ENGINEERING_BLOCKED` |
| `TECHNICAL_COMPLETE` … `QUOTATION_APPROVAL` | `READY_FOR_COMMERCIAL` |
| `QUOTATION_ISSUE` / `CUSTOMER_DECISION` | `QUOTED` |
| `FULFILLMENT` | `CLOSED` |

Adapters in 05I-C+ may sync selected transitions; runtime does not auto-mutate inquiry status in 05I-B.

---

## 7. API — `/api/v2/workflows/*`

| Method | Path | Permission |
|--------|------|------------|
| POST | `/start` | `WORKFLOW:WORKFLOW:START` |
| GET | `/instances/:id` | `WORKFLOW:WORKFLOW:VIEW` |
| GET | `/instances/:id/current-step` | VIEW |
| GET | `/instances/:id/tasks` | VIEW |
| GET | `/by-entity/:type/:id` | VIEW + customerScope |
| POST | `/instances/:id/transition` | TRANSITION (internal) |
| POST | `/tasks/:id/assign` | ASSIGN |
| POST | `/tasks/:id/complete` | COMPLETE |
| POST | `/instances/:id/cancel` | CANCEL |
| GET | `/templates` | ADMIN |
| POST | `/templates` | ADMIN (501 — seed-only in 05I-B) |

**Customer boundary:** view own workflow; complete tasks on `allowCustomerAction` steps (`CUSTOMER_RESPONSE`, `CUSTOMER_DECISION`) only. No internal transitions.

---

## 8. RBAC permissions

Added to `permissionCatalog.ts`:

- `WORKFLOW:WORKFLOW:VIEW`
- `WORKFLOW:WORKFLOW:START`
- `WORKFLOW:WORKFLOW:ASSIGN`
- `WORKFLOW:WORKFLOW:COMPLETE`
- `WORKFLOW:WORKFLOW:TRANSITION`
- `WORKFLOW:WORKFLOW:CANCEL`
- `WORKFLOW:WORKFLOW:ADMIN`

Assertions in `src/server/rbac.ts`. Sales Manager, Technical Office Engineer, and Customer User roles receive appropriate subsets.

---

## 9. UI (minimal)

`WorkflowStatusIndicator` on `CommercialInquiryDetail` — shows current stage and assignee when an active instance exists. No workspace redesign.

---

## 10. Tests

| File | Coverage |
|------|----------|
| `src/domain/workflowRuntimeService.test.ts` | Conditions, transitions, mapping hints |
| `src/platform/workflowRuntime.test.ts` | A–R integration: template seed, idempotency, RBAC, customer isolation, clarification loop, audit |

Regression: existing `inquiryProcessFoundation`, v2 inquiry, quotation, fulfillment, costingEngine suites unchanged.

---

## 11. Frozen / out of scope (05I-B)

- Visual workflow designer / BPMN
- Container Study, Delivery Allocation, VIP Calculate orchestrator (05I-C)
- Inquiry UI redesign
- Costing engine, BOM, Drum Master, D365
- Full notification/email subsystem

---

## 12. 05I-C remaining work

1. **VIP_CALCULATE orchestrator** — gated auto-chain after Calculate (pricing + quotation draft)
2. **Stage adapters** — wire `CONTAINER_STUDY`, `COSTING`, `QUOTATION_*` to existing services
3. **Inquiry status sync** — optional adapter from workflow transitions to `InquiryStatus`
4. **Process-aware UI actions** — hide/show CALCULATE vs SUBMIT per `inquiryProcessCode` (05I-D)
5. **Notification hooks** per `WorkflowEvent` (05I-G)
6. **Template admin UI** — POST template authoring beyond migration seed

---

## Files

| Area | Path |
|------|------|
| Schema | `prisma/schema.prisma` |
| Migration + seed | `prisma/migrations/20260910120000_workflow_runtime_foundation/` |
| Domain | `src/domain/workflowRuntimeService.ts` |
| Repository | `src/server/workflowRuntimeRepository.ts` |
| Routes | `src/server/workflowRoutes.ts` |
| RBAC | `src/server/rbac.ts`, `src/domain/permissionCatalog.ts` |
| Inquiry hooks | `src/server/commercialRepository.ts`, `src/server/v2InquiryConfigurationRepository.ts` |
| UI | `src/components/inquiry-quotation/WorkflowStatusIndicator.tsx` |
| Client API | `src/services/workflowApiService.ts` |
