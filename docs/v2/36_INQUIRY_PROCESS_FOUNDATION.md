# Task 05I-A — Inquiry Process Foundation

**Status:** Implemented (foundation only)  
**Architecture:** `docs/v2/TASK05I_INQUIRY_PROCESS_WORKFLOW_ARCHITECTURE.md`

## Scope delivered

- **Process codes:** `VIP_FAST_TRACK` | `STANDARD_WORKFLOW` (business process — orthogonal to `workflowChannel: V2_CONFIGURATION`)
- **Resolution priority:** `Customer.defaultInquiryProcessCode` → `CustomerGroup.defaultInquiryProcessCode` → `STANDARD_WORKFLOW` / `SYSTEM_DEFAULT`
- **Persistence:** Snapshotted on inquiry create in `commercialMetadata` (`inquiryProcessCode`, `inquiryProcessSource`, `inquiryProcessAssignedAt`) — immutable on customer update
- **Wiring:** V1 `createInquiry` + V2 `createV2Inquiry` call `resolveInquiryProcess` server-side; client body overrides stripped
- **Commands (stubs):** `canSubmitInquiry`, `canCalculateInquiry`, `assertStandardSubmitAllowed`, `assertVipCalculateAllowed`
- **UI:** Read-only process label in `InquiryHeaderForm`; Calculate/Submit buttons gated by process in `CommercialInquiryDetail`
- **Audit:** `INQUIRY_PROCESS_ASSIGNED` via `appendServerAudit` on create

## Schema

| Model / field | Purpose |
|---------------|---------|
| `InquiryProcessCode` enum | `VIP_FAST_TRACK`, `STANDARD_WORKFLOW` |
| `InquiryProcessSource` enum | `CUSTOMER_OVERRIDE`, `CUSTOMER_GROUP`, `SYSTEM_DEFAULT` |
| `CustomerGroup` | Group-level default process |
| `Customer.defaultInquiryProcessCode` | Per-customer override |
| `Customer.customerGroupId` | Group membership |
| `CommercialInquiry.commercialMetadata.*` | Snapshotted process on inquiry |

Migration: `20260909120000_inquiry_process_foundation`

## Key modules

- `src/domain/inquiryProcessResolver.ts`
- `src/domain/inquiryProcessCommands.ts`

## Tests

- `src/domain/inquiryProcessResolver.test.ts` — resolver + command unit cases (16)
- `src/platform/inquiryProcessFoundation.test.ts` — V1/V2 create + audit + IDOR

## Not in 05I-A (deferred)

- Unified submit orchestrator (05I-B)
- VIP CALCULATE auto-chain (05I-C)
- Process-aware tab resolver (05I-D)
- WorkflowTemplate / WorkflowInstance tables (05I-E)
- Customer admin assignment UI (05I-F)
- Transition notifications (05I-G)
- CRM/MES adapter (05I-H)

## Security

- Process code is **never** accepted from request body; `customerScope` drives customer resolution.
- Updates preserve snapshotted process fields via `preserveImmutableInquiryProcess`.
