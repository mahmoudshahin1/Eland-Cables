ملخص تنفيذي: المسار الحالي `STANDARD_INQUIRY_V1` ينتهي بخطوة تنفيذ واحدة، بلا مطابقة لأمر شراء العميل وبلا تسلسل تحرير FOX. المقترح `STANDARD_INQUIRY_V2` يضع بوابة مطابقة أمر الشراء قبل الالتزام التجاري، ويقسم التنفيذ حسب مواضع الصناديق في ملف الـ AS-IS (إفراج مالي ثم فني ثم أوامر شغل ثم تخطيط ثم تأكيد)، ويكرر حلقة طلب المعلومات الحالية بأسماء صريحة لكل مرحلة بدون محرك سير عمل عام. التوصيات في آخر الوثيقة بانتظار اعتمادكم وليست قراراً منفذاً في الكود.

# STANDARD_INQUIRY_V2 design proposal

Status: design only. No application code, schema, or migration is changed by this document.
Template proposed: `STANDARD_INQUIRY_V2` (PROPOSED — not in current schema/code). Live `STANDARD_INQUIRY_V1` rows are not modified.
Standing decision kept: no generic workflow engine. VIP stays outside this template.

`src/platform/workflow/workflowPresentationMetadata.ts:1-3` and `:48-53`:

```
Does not introduce a generic workflow engine. VIP remains outside STANDARD_INQUIRY_V1.
export function isGenericWorkflowEngineEnabled(): boolean { return false; }
export function vipUsesStandardInquiryTemplate(): boolean { return false; }
```

Anything below that is not in the current code is marked **PROPOSED — not in current schema/code**.
Every "Owning role" on a new stage is descriptive. `assertCanTransitionWorkflow` does not compare the actor's role to the current stage (see Fact B).

## 1. Baseline

Requested baseline was `aa1aedf`. After `git fetch origin main` on 2026-11-21, `origin/main` had moved.

```
git fetch origin main
aa1aedf..5806c77  main -> origin/main
5806c77 fix(vip): submit customer offer and notify production floor release after fulfillment creation (#11)
```

This branch `docs/standard-workflow-v2-proposal` was created from that new tip (`5806c776dfd88d9958061ecb1b1e18dff17451e2`), not from `aa1aedf`. `aa1aedf` is still an ancestor (`git merge-base --is-ancestor aa1aedf HEAD` exited 0). No commits from `new-vip-ui` were carried.

`git diff --stat aa1aedf..HEAD` on the workflow files used below changed only:

```
src/components/inquiry-quotation/CommercialInquiryDetail.tsx | 51 +++++++++++++++++++++-
1 file changed, 49 insertions(+), 2 deletions(-)
```

Facts A–F still match at `5806c77`. Tab line numbers inside `CommercialInquiryDetail.tsx` moved; this document quotes the `5806c77` lines.

### Fact A — current step list

Command: `git grep -n "stepCode:" HEAD -- src/platform/workflow/workflowPresentationMetadata.ts`

```
:24 SUBMITTED / SALES
:25 TECHNICAL_REVIEW / TECHNICAL_OFFICE
:26 NEEDS_INFORMATION / TECHNICAL_OFFICE
:27 CUSTOMER_CLARIFICATION / CUSTOMER
:28 CUSTOMER_RESPONSE / CUSTOMER
:29 TECHNICAL_COMPLETE / TECHNICAL_OFFICE
:30 CONTAINER_STUDY / LOGISTICS
:31 COSTING / COSTING
:32 SALES_REVIEW / SALES
:33 QUOTATION_APPROVAL / SALES
:34 QUOTATION_ISSUE / SALES
:35 CUSTOMER_DECISION / CUSTOMER
:36 COMMERCIAL_COMMITMENT / SALES
:37 FULFILLMENT / FULFILLMENT
```

The same 14 steps are seeded in `prisma/migrations/20260910120000_workflow_runtime_foundation/migration.sql:177-191`. `FULFILLMENT` is the only terminal step (`:191`, `isTerminal = true`). `CUSTOMER_RESPONSE` (`:182`) and `CUSTOMER_DECISION` (`:189`) are the only steps with `allowCustomerAction = true`, and both require `WORKFLOW:WORKFLOW:COMPLETE` rather than `TRANSITION`.

`TO_CONTAINER_STUDY` has a null condition, so the template always enters Container Study:

`prisma/migrations/20260910120000_workflow_runtime_foundation/migration.sql:200`

```
('wf_tr_to_container', ..., 'TO_CONTAINER_STUDY', 'TECHNICAL_COMPLETE', 'CONTAINER_STUDY', 'Begin container study', NULL)
```

The only later returns on V1 are in `prisma/migrations/20260919200000_standard_workflow_quotation_v2/migration.sql:94` and `:100`:

```
RETURN_TO_SALES: QUOTATION_APPROVAL -> SALES_REVIEW
RETURN_FROM_ISSUE: QUOTATION_ISSUE -> SALES_REVIEW
```

`roleForStep` (`src/server/workflowRuntimeRepository.ts:790-796`) assigns a role only for `TECHNICAL_REVIEW`, `COSTING`, `SALES_REVIEW`, `QUOTATION_APPROVAL`, and `QUOTATION_ISSUE`. Every other step, including `CONTAINER_STUDY`, `COMMERCIAL_COMMITMENT`, and `FULFILLMENT`, returns `undefined`.

### Fact B — stage ownership is not enforced

`src/server/rbac.ts:801-810`:

```
export function assertCanTransitionWorkflow(actor: RequestActor): void {
  if (!actor.id && !actor.email && !actor.name) { throw issue('UNAUTHORIZED', 'Sign in is required to transition workflows.'); }
  if (actor.userType === 'customer') { throw issue('UNAUTHORIZED', 'Customer users cannot perform internal workflow transitions.'); }
  if (denyIfMissingWorkflow(actor, 'TRANSITION')) { throw issue('UNAUTHORIZED', 'Your role is not authorized to transition workflows.'); }
}
```

There is no comparison between the actor's role and the inquiry's current step. This is a known, separate security gap. This proposal does not fix it. Until it is fixed, an owning role in the table below is a label, not an access rule.

### Fact C — no customer PO on the commitment

Command: `git grep -n -i "customerPo\|customerPurchaseOrder" HEAD -- prisma/schema.prisma` — no matches.

`CommercialCommitment` is `prisma/schema.prisma:1241-1280`. It has `quotationNumber`, `quotationVersionNo`, `currency`, `totalCommittedAmount`, `expirationDate`, `d365DocumentNumber`, `d365RecordId`, and `status`. It has no PO number, PO date, or PO file reference.

Nearby fields that are not a customer PO:

- `CommercialInquiry.customerReference` at `prisma/schema.prisma:708`
- `EpcSalesOrder.customerReference` at `prisma/schema.prisma:1301`

Quotation validity does exist: `CommercialQuotation.validUntil` at `prisma/schema.prisma:1109`. `SalesAgreement.validTo` at `:1386` is a different document.

PO files can point at the existing attachment row. `CommercialInquiryAttachment` (`prisma/schema.prisma:752-764`) already stores `fileName`, `mimeType`, and `content Bytes` on the inquiry. A proposed reference is the attachment id, not a new file column.

### Fact D — AuditEvent is widely written, but not from workflow transitions

`AuditEvent` is `prisma/schema.prisma:431-445`: `id`, `at`, `actorId`, `actorName`, `entity`, `entityId`, `action`, `oldValue`, `newValue`, `message`. `action` is a free `String`.

The earlier note "written from a few places" understates the code. `auditEvent.create` (or the shared helper) is called from, among others:

- `src/server/commercialRepository.ts:331`, `:793`, `:1772`, `:1895`
- `src/server/commercialCommitmentRepository.ts:128` (`writeAudit`)
- `src/server/costingOrchestrationService.ts:1035`
- `src/server/serverAudit.ts:62`
- costing, master-data, drum, identity, and governance repositories (same `git grep` for `auditEvent.create` under `src`)

`writeAudit` in `commercialCommitmentRepository.ts:133` only accepts `CREATE | UPDATE | APPROVE | REJECT | SUBMIT | CANCEL`. New workflow action names cannot go through that helper without a later code change. They can be stored on `AuditEvent.action` because that column is a `String`.

Workflow transitions do not write `AuditEvent`. Command: `git grep -n "auditEvent.create" HEAD -- src/server/workflowRuntimeRepository.ts` — no matches. That file writes `WorkflowEvent` in `appendWorkflowEvent` at `:126-149`, and the callers run inside `prisma.$transaction` (for example `:606`).

`WorkflowEvent` (`prisma/schema.prisma:2963-2977`) stores `eventType`, `fromStepCode`, `toStepCode`, `taskId`, `actorId`, `actorName`, `payloadJson`, `createdAt`.

`WorkflowStageTiming` (`prisma/schema.prisma:2981-2994`) stores `stepCode`, `startedAt`, `completedAt`, `durationSeconds`, `owner`. It does not store a decision, a reason, or an approval result. Those timing fields are not copied into the proposed audit rows.

### Fact E — no release sequence and no work order

Command: `git grep -n -i -E "technicalRelease|financialRelease|planningRelease|workOrder" HEAD -- src/server src/domain src/platform` — no matches.

`EpcSalesOrderStatus` (`prisma/schema.prisma:655-659`) is `DRAFT | CONFIRMED | CANCELLED` only.

### Fact F — no change-request model

Command: `git grep -n "model ChangeRequest" HEAD -- prisma/schema.prisma` — no matches (exit 1).

The only built-in ask-for-information loop is `TECHNICAL_REVIEW` → `NEEDS_INFORMATION` → `CUSTOMER_CLARIFICATION` → `CUSTOMER_RESPONSE` → `TECHNICAL_REVIEW` (`migration.sql:195-199`).

### Roles that exist

Command: `git grep -n "code: '" HEAD -- src/domain/permissionCatalog.ts`

| Role | Line | WORKFLOW actions in the filter |
| --- | --- | --- |
| `SYSTEM_ADMINISTRATOR` | 140 | No `permissionFilter` on the catalog entry (`:140-144`). This document does not infer which actions that implies. |
| `TECHNICAL_OFFICE_ENGINEER` | 146 | `VIEW`, `ASSIGN`, `COMPLETE`, `TRANSITION` (`:154`) |
| `TECHNICAL_OFFICE_MANAGER` | 161 | none (`:165-167` is BOM, ENGINEERING, CABLE, LOGISTICS, REPORT) |
| `SALES_REPRESENTATIVE` | 170 | `VIEW`, `COMPLETE` only (`:177`) |
| `SALES_MANAGER` | 182 | every WORKFLOW action except `ADMIN` (`:188`) |
| `PROCUREMENT_USER` | 194 | none |
| `PROCUREMENT_MANAGER` | 204 | none. Filter includes module `PRODUCTION` (`:209`). That is not a planning role. |
| `FINANCE_USER` | 212 | none (`:216` is FINANCE, REPORT) |
| `FINANCE_MANAGER` | 219 | none (`:223` is `['FINANCE', 'COMMERCIAL', 'REPORT']`) |
| `COSTING_USER` | 226 | none (`:230-234`) |
| `COSTING_MANAGER` | 237 | none (`:241-243`) |
| `CUSTOMER_USER` | 246 | `VIEW`, `COMPLETE` (`:254`) |
| `REPORT_VIEWER` | 257 | none |
| `AUDITOR` | 264 | none |

WORKFLOW actions defined at `permissionCatalog.ts:110-116`: `VIEW`, `START`, `ASSIGN`, `COMPLETE`, `TRANSITION`, `CANCEL`, `ADMIN`.

There is no Planning, Production, Quality, Logistics, or CEO role. `TECHNICAL_OFFICE_ENGINEER` is the role that already holds `LOGISTICS / CONTAINER_STUDY` actions `VIEW`, `CREATE`, `VALIDATE`, `CALCULATE` (`permissionCatalog.ts:155-157`).

## 2. What the three sources ask for

### 2.1 Target diagram (Inquiry to Order)

Twelve stages and gates G1–G10: inquiry complete, requirements clear, design approved, manufacturable and on time, costing validated, margin within limits, quotation approved, customer accepted, PO matches quotation, ERP validation passed. Screen 6 shows a multi-level approval (Sales Manager, Finance, Technical, Commercial, CEO). Screen 8 shows customer acceptance with a customer PO. Screen 9 shows a sales order and a handover to production. The RACI names Quality and ERP/D365. Neither is a role in `permissionCatalog.ts`.

### 2.2 AS-IS PDF

File: `H:\eland\Quotation - Order Workflow.pdf` (Visio export, pages Local and Export, metadata author Ehab Maher). Text was taken from the Flate content streams with text-matrix coordinates. Arrows are vector paths and were not traced, so left-to-right order inside a lane is shape order, not a proven connector sequence.

Swimlane labels are vertical text (text matrix about `0 1 -1 0`) on the left margin. Their baseline y falls inside these horizontal bands, which are the same on both pages:

| Lane label (rotated text) | Baseline y | Band used |
| --- | --- | --- |
| Customer | 454.8 | 433.6–524.3 |
| Local Sales (page 1) / Export Sales (page 2) | 374.2 / 384.6 | 368.4–433.6 |
| Technical Office | 306.7 and 315.2 | 291.9–368.4 |
| Accounts - Costing | 226.2 and 233.7 | 212.5–291.9 |
| Accounts - AR | 136.9 and 188.9 | 127.5–212.5 |
| Planning | 67.8 | 51.5–127.5 |

There is no Logistics lane and no Quality lane.

Shape order that both pages share, by lane:

- Customer: Start, Sends CR/CO via Email, BOQ Updates, Customer Approval, Yes/No, End.
- Sales: Create Customer Inquiry (CR), Clarification Request on BOQ, BOQ Updates, PO received, Match Price & Qty, Create NSO. Local only adds Login Budu. A second "FOX Order#" label sits at the far right of this lane (x≈767).
- Technical Office: Monitor & Review Inquiry, Check Cable Design (Local) or Check Price List (Export), Need Clarification, Create New Design, Update CR item and qty, Validate, Create TDS + Drum Schedule (Excel), Create TDS + Drum Schedule and update NSO on Advaris and on FOX. Local adds the Budu refresh and Budu update steps.
- Accounts - Costing: Receives PDF, extracts Cable Code and BOM (Local) or extracts TDS + Drum Schedule + Container Study (Export), create cable code, Valid PO/CR Value.
- Accounts - AR, left to right: FOX Order# (x≈83, y≈167), Validate (x≈156, y≈167), Approve (x≈205, y≈167), Financial Release (spelled "Relrease", x≈244, y≈162), FOX-NSO (x≈259–278, y≈173).
- Planning, left to right: Create BOQ (Excel) (x≈88), Create/Update NSO (TDS+Drum Sch) (FOX) (x≈164), FOX Technical Release (x≈270–290), FOX Create Work Orders (x≈361), FOX Planning Release (x≈447–467), FOX Confirmed SO (spelled "Conformed SO", x≈534), End.

Two readings must stay separate:

1. Inside the Planning lane, shape order is Technical Release, then Work Orders, then Planning Release, then Confirmed SO. Financial Release sits in the lane above and to the left (x≈244 versus x≈270). That supports financial-before-technical, and it is still a position reading because the arrows were not traced.
2. A single left-to-right timeline across all lanes would place Planning's Technical Release (x≈290) before Customer Approval (x≈487). That conflicts with the business story in the source brief. This document does not adopt that global timeline.

Container Study text exists only on the Export page, inside the Accounts - Costing band (`extracts TDS+ Drum Sch + Container Study`, y≈239–260). The Local page has `extracts Cable Code & BOM` in that same slot, plus Budu steps, and no Container Study string.

`Valid PO/CR Value` is in Accounts - Costing (y≈249). `Match Price & Qty` is in Sales (y≈404). They are not the same lane.

## 3. Proposed V2 behaviour

`STANDARD_INQUIRY_V2` is a new template. `isGenericWorkflowEngineEnabled()` stays `false`. `roleForStep` stays an explicit `if` chain, extended with explicit cases. No rules table and no runtime-defined graph.

### 3.1 Customer PO gate (G9)

New stage `PO_VALIDATION` (PROPOSED — not in current schema/code) sits after `CUSTOMER_DECISION` and before `COMMERCIAL_COMMITMENT`.

PDF shape order in that part of the page: Customer Approval, PO received, Valid PO/CR Value, Match Price & Qty, then Create NSO. The "No" branches are email loops back to the customer, which is why this stage gets the same three-step clarification pattern (section 3.3).

Owning role: `SALES_MANAGER` (`permissionCatalog.ts:182`). The value check is drawn in Accounts - Costing, so `COSTING_USER` supplies the value comparison. The stage owner is still Sales, because Sales holds Match Price & Qty and Create NSO. Owning role is descriptive until Fact B is fixed.

Fields on `CommercialCommitment`, all PROPOSED — not in current schema/code:

| Field | Purpose |
| --- | --- |
| `customerPoNumber` | Customer PO / CR number |
| `customerPoDate` | PO date, compared with `CommercialQuotation.validUntil` (`schema.prisma:1109`) |
| `customerPoDocumentRef` | Id of an existing `CommercialInquiryAttachment` (`schema.prisma:752`). No new file column. |
| `poValue` | Amount checked by "Valid PO/CR Value" |
| `poCurrency` | Currency of that amount |
| `poMatchStatus` | `PENDING`, `MATCHED`, or `MISMATCH` |
| `poValidatedAt` | When the check was recorded |
| `poValidatedBy` | Actor id |
| `poValidationNotes` | Mismatch reason |

Reuse `d365DocumentNumber` and `d365RecordId` already on `CommercialCommitment` (`schema.prisma:1264-1265`). Do not add a second ERP reference.

`CommercialQuotation.validUntil` exists, so a PO dated after that instant is a mismatch that sends the inquiry back for re-pricing, not a silent match. Cable selling prices move with metal prices, so the check is against the accepted quotation revision and its validity, not against a live price list. This comparison is PROPOSED — not in current schema/code. It is decision 10.

### 3.2 Fulfillment split (G10)

`FULFILLMENT` is not a V2 step. Nothing below creates a Work Order model. The stages record a release status only. A Work Order table is out of scope.

Order, after lane extraction. This differs from the sample list in the original task (that list put Technical Release before Financial Release, and Work Orders after Planning Release).

| Stage (PROPOSED — not in current schema/code) | PDF evidence | Owning role |
| --- | --- | --- |
| `SALES_ORDER_CREATED` | Sales lane, "Create NSO", x≈631, y≈404 | `SALES_MANAGER` |
| `FINANCIAL_RELEASE` | Accounts - AR, "Financial Relrease", x≈244, y≈162. Same lane and to the right of "Validate" (x≈156) and "Approve" (x≈205) | `FINANCE_MANAGER` (exists at `permissionCatalog.ts:219`; filter has no WORKFLOW module, `:223`) |
| `TECHNICAL_RELEASE` | Planning lane, "FOX Technical Release", x≈270–290, y≈93. Not in the Technical Office band | `PRODUCTION_PLANNER` (PROPOSED — not in current schema/code) |
| `WORK_ORDERS_CREATED` | Planning lane, "FOX Create Work Orders", x≈361 | `PRODUCTION_PLANNER` (PROPOSED) |
| `PLANNING_RELEASE` | Planning lane, "FOX Planning Release", x≈447 | `PRODUCTION_PLANNER` (PROPOSED) |
| `CONFIRMED_SALES_ORDER` | Planning lane, "FOX Conformed SO", x≈534. This is gate G10 | `PRODUCTION_PLANNER` (PROPOSED) |
| `PRODUCTION_HANDOVER` | Not an AS-IS box. Target diagram stage 12 and screen 9 | `PRODUCTION_PLANNER` (PROPOSED) |

`PROCUREMENT_MANAGER` is not used. Its `PRODUCTION` module (`permissionCatalog.ts:209`) is procurement visibility, not the Planning lane.

The name "Technical Release" suggested `TECHNICAL_OFFICE_ENGINEER` before the lane labels were read. The shape is in the Planning band. The Technical Office band has a different box, "Create TDS+ Drum Sch & Update NSO on FOX/Advaris" (x≈729), which stays inside today's technical work and is not a new stage. Decision 6 asks you to confirm both the order and this owner.

`Validate FOX Order#` is in Accounts - AR, immediately before Financial Release. It is not in the Sales lane with Create NSO. Recommended, pending sign-off: it is a check inside `FINANCIAL_RELEASE` (record that the FOX order number was validated), not its own stage and not a check inside `SALES_ORDER_CREATED`. The far-right "FOX Order#" label in the Sales lane (x≈767) is a second label at the edge of the page; arrows to it were not traced, so it is not given its own stage.

Simple return transitions, not three-step loops (decision 4):

- Rejected `FINANCIAL_RELEASE` returns to `SALES_ORDER_CREATED`.
- Rejected `TECHNICAL_RELEASE` returns to `FINANCIAL_RELEASE`.
- A design defect found during release is a separate explicit transition back to `TECHNICAL_REVIEW`, not the default.

Owning role on every row in this table is descriptive until Fact B is fixed. `FINANCE_MANAGER` and the proposed planner cannot call `assertCanTransitionWorkflow` today.

### 3.3 Change-request loops without a generic engine

This can be done without a generic engine. V1 already does it with three explicit steps and four explicit transitions. V2 repeats that pattern with stage-specific codes in a new template seed. `roleForStep` gains explicit `if` arms. `isGenericWorkflowEngineEnabled()` stays `false`.

Loops (all step codes PROPOSED — not in current schema/code):

| Requesting stage | Needs-information step | Clarification step | Response step | Returns to |
| --- | --- | --- | --- | --- |
| `COSTING` | `COSTING_NEEDS_INFORMATION` (`COSTING_USER`) | `COSTING_CLARIFICATION` | `COSTING_RESPONSE` | `COSTING` |
| `SALES_REVIEW` | `SALES_REVIEW_NEEDS_INFORMATION` (`SALES_MANAGER`) | `SALES_REVIEW_CLARIFICATION` | `SALES_REVIEW_RESPONSE` | `SALES_REVIEW` |
| `QUOTATION_APPROVAL` | `QUOTATION_APPROVAL_NEEDS_INFORMATION` (`SALES_MANAGER`) | `QUOTATION_APPROVAL_CLARIFICATION` | `QUOTATION_APPROVAL_RESPONSE` | `QUOTATION_APPROVAL` |
| `CUSTOMER_DECISION` | `CUSTOMER_DECISION_NEEDS_INFORMATION` | `CUSTOMER_DECISION_CLARIFICATION` (`SALES_MANAGER`) | `CUSTOMER_DECISION_RESPONSE` | `CUSTOMER_DECISION` |
| `PO_VALIDATION` | `PO_VALIDATION_NEEDS_INFORMATION` (`SALES_MANAGER`) | `PO_VALIDATION_CLARIFICATION` | `PO_VALIDATION_RESPONSE` | `PO_VALIDATION` |

Who answers is a PROPOSED assumption. The current plan file `docs/standard-workflow/PLAN.md` already records "where a change request returns" as open. Recommended default, pending sign-off (decision 8): the answer comes from the previous owning stage.

- Costing asks `TECHNICAL_OFFICE_ENGINEER`.
- Sales review asks `COSTING_USER`.
- Quotation approval asks `SALES_MANAGER` (this is the same party as today's `RETURN_TO_SALES`). In V2 the three-step loop replaces `RETURN_TO_SALES` and `RETURN_FROM_ISSUE`. Those two V1 transitions stay documented and are not deleted from the V1 template.
- Customer decision and PO validation ask `CUSTOMER_USER`.

Customer-facing response steps use `allowCustomerAction = true` and `WORKFLOW:WORKFLOW:COMPLETE`, matching `CUSTOMER_RESPONSE` (`migration.sql:182`). `assertCanTransitionWorkflow` rejects customers (`rbac.ts:805-806`). The customer completes a task. The customer does not perform an internal transition.

After the reply, the inquiry returns to the requesting stage. Only downstream work whose inputs changed runs again: a technical change invalidates the costing pin; a price-only change does not reopen `TECHNICAL_REVIEW`. That re-run rule is PROPOSED — not in current schema/code.

Owning role on every loop step is descriptive until Fact B is fixed. `COSTING_USER` has no WORKFLOW permission today (`permissionCatalog.ts:230-234`).

#### Option B — a generic engine (not recommended)

A generic engine would store transitions and gates as data and spawn the clarification loop for any stage without new step rows. That contradicts `workflowPresentationMetadata.ts:1-3` and `:48-49`.

Trade-off if it were chosen later: less seed duplication, and new gates would not need a migration of step rows. Cost: a new runtime, a new test surface, a migration story for live V1 instances, and stage-ownership enforcement (Fact B) would become mandatory because the engine would no longer be a closed list of steps. This proposal does not choose Option B.

Gates not given a new loop in this proposal: G3 (already covered by `TECHNICAL_REVIEW` and its loop) and G4 (no new feasibility stage). G10 uses the simple returns in section 3.2.

### 3.4 AuditEvent writes

`WorkflowStageTiming` remains the only duration record. `WorkflowEvent` remains the instance transition log. Proposed `AuditEvent` rows are the inquiry-scoped trail the Audit tab already shows (`CommercialInquiryDetail.tsx:3000`).

Write them in the same `prisma.$transaction` that already calls `appendWorkflowEvent` (`workflowRuntimeRepository.ts:126` and `:606`). Do not copy `startedAt`, `completedAt`, `durationSeconds`, or `owner`.

Entity `CommercialInquiry`, entity id the inquiry id. Action codes PROPOSED — not in current schema/code:

| Action | When | `oldValue` / `newValue` |
| --- | --- | --- |
| `WORKFLOW_STAGE_CHANGED` | every stage transition | from step, to step, `transitionCode`, `taskResult` |
| `WORKFLOW_CHANGE_REQUEST_OPENED` | entering a `*_NEEDS_INFORMATION` step, or today's `NEEDS_INFORMATION` | stage, requester, reason text |
| `WORKFLOW_CHANGE_REQUEST_CLOSED` | leaving the matching `*_RESPONSE` step | stage, responder, reply text |
| `WORKFLOW_APPROVED` | task result APPROVED or ACCEPTED on quotation approval, PO validation, financial release, technical release, confirmed sales order | stage, actor |
| `WORKFLOW_REJECTED` | task result RETURNED or REJECTED on those stages | stage, actor, reason |

PO match outcome also writes one `AuditEvent` on entity `CommercialCommitment` (same action names, plus `poMatchStatus`). Do not route that through `writeAudit` unless its action union at `commercialCommitmentRepository.ts:133` is extended later. That extension is out of scope here.

A failed transaction rolls the workflow event and the audit row back together. There is no separate idempotency key today. A successful transaction is not replayed by the current repository.

### 3.5 Container Study

Two mechanisms disagree.

- The template always goes `TECHNICAL_COMPLETE` → `CONTAINER_STUDY` (`migration.sql:200`, `conditionJson` NULL).
- `containerStudyRequiredForCosting` (`src/domain/costingContainerStudyPin.ts:28-36`) returns false when `logisticsScenarioActive` is false. The caller sets that flag from `shipmentGroupCount > 0 || containerStudyCount > 0` (`src/domain/standardContainerStudyWorkflowReadiness.ts:65-74`). The function ignores `processCode` (`void input.processCode`).

The PDF shows the Container Study string only on the Export page, in the Accounts - Costing band. Local has no such string.

Making the step conditional on the existing `logisticsScenarioActive` flag uses `conditionJson`, which transitions already have. That is not a generic engine. It does open two paths to test. An export inquiry that has not defined shipment groups yet would skip the step if the flag is only "groups already exist", so the recommendation is to block at `TECHNICAL_COMPLETE` until shipment groups exist when the inquiry is an export shipment, and to skip the step when it is not (decision 1 and decision 9).

Keeping the step on every inquiry matches V1 and is easier to test. It disagrees with the Local page.

Recommended, pending sign-off: conditional on the existing logistics signal, not on a new "is export" column. See decision 1.

### 3.6 Gaps named but not added as stages

- Multi-level quotation approval (target screen 6: Sales Manager, Finance, Technical, Commercial, CEO). The AS-IS PDF has no such chain. There is no CEO role. V2 keeps one `QUOTATION_APPROVAL` owned by `SALES_MANAGER`. Decision 5.
- Feasibility and production check (target gate G4). Not a V1 step and not a separate AS-IS box. Not added.
- Quality and ERP/D365 in the target RACI. Not roles. Not added.
- "Create BOQ (Excel)" in the Planning lane is today's technical and costing work, not a new stage.
- Budu (Local only) is the legacy design-code tool. V2 does not add a Budu stage. Technical design stays `TECHNICAL_REVIEW` / `TECHNICAL_COMPLETE`.

## 4. Stage table

Columns are the ones requested. "none (generic only: WorkflowStatusIndicator.tsx)" means the stage is only drawn by the generic workflow chrome, which lists whatever steps the template returns. That chrome is `WorkflowStatusIndicator.tsx:45` and `:76-80`, mounted at `CommercialInquiryDetail.tsx:2049`, and `WorkflowStatusWorkspaceTab.tsx:138`, `:185`, and `:288`, mounted at `CommercialInquiryDetail.tsx:2232`.

A file:line is cited only where a tab renders that subject. New stages have no per-stage component.

Owning role on every PROPOSED row is descriptive until Fact B is fixed.

| Stage code | Label | Owning role | Source (current code / target diagram / AS-IS PDF) | Existing component/tab that renders it today (file:line, or "none") | New fields/UI needed (or "none") |
| --- | --- | --- | --- | --- | --- |
| `SUBMITTED` | Submitted | `SALES_REPRESENTATIVE` (queue SALES; `roleForStep` returns undefined) | current code `workflowPresentationMetadata.ts:24`; AS-IS "Create Customer Inquiry (CR)" in the Sales lane | Overview tab `CommercialInquiryDetail.tsx:2134`; generic indicator `:2049` | none |
| `TECHNICAL_REVIEW` | Technical review | `TECHNICAL_OFFICE_ENGINEER` (`workflowRuntimeRepository.ts:791`) | current code `:25`; target stage 3 and G2/G3; AS-IS Technical Office lane (design check, new design) | Cables tab `CommercialInquiryDetail.tsx:2243`; generic indicator `:2049` | none |
| `NEEDS_INFORMATION` | Needs information | `TECHNICAL_OFFICE_ENGINEER` | current code `:26`; AS-IS "Need Clarification" in the Technical Office lane | none (generic only: WorkflowStatusIndicator.tsx) | none |
| `CUSTOMER_CLARIFICATION` | Customer clarification | `CUSTOMER_USER` | current code `:27`; AS-IS "Clarification Request on BOQ" in the Sales lane and "BOQ Updates" in the Customer lane | none (generic only: WorkflowStatusIndicator.tsx) | none |
| `CUSTOMER_RESPONSE` | Customer response | `CUSTOMER_USER` (`allowCustomerAction` true, `migration.sql:182`) | current code `:28` | none (generic only: WorkflowStatusIndicator.tsx) | none |
| `TECHNICAL_COMPLETE` | Technical complete | `TECHNICAL_OFFICE_ENGINEER` | current code `:29`; target G3; AS-IS "Create TDS + Drum Schedule" in the Technical Office lane | Technical offer tab `CommercialInquiryDetail.tsx:2725` | none |
| `CONTAINER_STUDY` | Container study | `TECHNICAL_OFFICE_ENGINEER` (holds CONTAINER_STUDY calculate at `permissionCatalog.ts:155-157`; `roleForStep` returns undefined; queue code is `LOGISTICS`, which is not a role) | current code `:30`; target logistics box; AS-IS Export only, drawn in Accounts - Costing, not a Logistics lane | Container Study tab `CommercialInquiryDetail.tsx:3378` | none until decision 1. If the step becomes conditional, the tab stays; the workflow skips or blocks as in section 3.5 |
| `COSTING` | Costing | `COSTING_USER` (`workflowRuntimeRepository.ts:792`) | current code `:31`; target stage 5 and G5; AS-IS Accounts - Costing lane | Costing tab `CommercialInquiryDetail.tsx:3032` | none |
| `COSTING_NEEDS_INFORMATION` | Costing needs information | `COSTING_USER` | PROPOSED — not in current schema/code. Same pattern as `NEEDS_INFORMATION` | none | Reason text. Owning role is descriptive until Fact B is fixed. `COSTING_USER` has no WORKFLOW permission (`permissionCatalog.ts:230-234`) |
| `COSTING_CLARIFICATION` | Costing clarification | `TECHNICAL_OFFICE_ENGINEER` (PROPOSED assumption, decision 8) | PROPOSED — not in current schema/code | none | none beyond the loop. Owning role is descriptive until Fact B is fixed |
| `COSTING_RESPONSE` | Costing response | `TECHNICAL_OFFICE_ENGINEER` (PROPOSED assumption, decision 8) | PROPOSED — not in current schema/code | none | Reply text. Owning role is descriptive until Fact B is fixed |
| `SALES_REVIEW` | Sales review | `SALES_MANAGER` (`workflowRuntimeRepository.ts:793-794`) | current code `:32`; target stage 6 and G6 | Quotation tab `CommercialInquiryDetail.tsx:2771` | none |
| `SALES_REVIEW_NEEDS_INFORMATION` | Sales review needs information | `SALES_MANAGER` | PROPOSED — not in current schema/code | none | Reason text. Owning role is descriptive until Fact B is fixed |
| `SALES_REVIEW_CLARIFICATION` | Sales review clarification | `COSTING_USER` (PROPOSED assumption, decision 8) | PROPOSED — not in current schema/code | none | Owning role is descriptive until Fact B is fixed. `COSTING_USER` cannot transition today |
| `SALES_REVIEW_RESPONSE` | Sales review response | `COSTING_USER` (PROPOSED assumption, decision 8) | PROPOSED — not in current schema/code | none | Reply text. Owning role is descriptive until Fact B is fixed |
| `QUOTATION_APPROVAL` | Quotation approval | `SALES_MANAGER` | current code `:33`; target stage 7 and G7. Screen 6's extra approvers are not stages (section 3.6) | Quotation tab `CommercialInquiryDetail.tsx:2771` | none. V1 `RETURN_TO_SALES` stays on V1; V2 uses the loop below |
| `QUOTATION_APPROVAL_NEEDS_INFORMATION` | Quotation approval needs information | `SALES_MANAGER` | PROPOSED — not in current schema/code. Replaces `RETURN_TO_SALES` on V2 only | none | Reason text. Owning role is descriptive until Fact B is fixed |
| `QUOTATION_APPROVAL_CLARIFICATION` | Quotation approval clarification | `SALES_MANAGER` | PROPOSED — not in current schema/code | none | Owning role is descriptive until Fact B is fixed |
| `QUOTATION_APPROVAL_RESPONSE` | Quotation approval response | `SALES_MANAGER` | PROPOSED — not in current schema/code | none | Reply text. Owning role is descriptive until Fact B is fixed |
| `QUOTATION_ISSUE` | Quotation issue | `SALES_MANAGER` | current code `:34`; target stage 8 | Quotation tab `CommercialInquiryDetail.tsx:2771` | none. V1 `RETURN_FROM_ISSUE` stays on V1 |
| `CUSTOMER_DECISION` | Customer decision | `CUSTOMER_USER` (`allowCustomerAction` true, `migration.sql:189`) | current code `:35`; target stage 10 and G8; AS-IS "Customer Approval" in the Customer lane | Quotation tab `CommercialInquiryDetail.tsx:2771` | none |
| `CUSTOMER_DECISION_NEEDS_INFORMATION` | Customer decision needs information | `CUSTOMER_USER` (`allowCustomerAction` true, same rule as `CUSTOMER_RESPONSE`) | PROPOSED — not in current schema/code. Target stage 9 (negotiation) | none | Reason text. Customer completes a task; `rbac.ts:805` blocks customer transitions. Owning role is descriptive until Fact B is fixed |
| `CUSTOMER_DECISION_CLARIFICATION` | Customer decision clarification | `SALES_MANAGER` | PROPOSED — not in current schema/code | none | Revision of price or terms. Owning role is descriptive until Fact B is fixed |
| `CUSTOMER_DECISION_RESPONSE` | Customer decision response | `CUSTOMER_USER` (`allowCustomerAction` true) | PROPOSED — not in current schema/code | none | Reply text. Owning role is descriptive until Fact B is fixed |
| `PO_VALIDATION` | PO validation | `SALES_MANAGER`. Value comparison input from `COSTING_USER` (AS-IS "Valid PO/CR Value" is in Accounts - Costing) | PROPOSED — not in current schema/code. Target G9. AS-IS "PO received", "Valid PO/CR Value", "Match Price & Qty" | none. Commitment panel shows the commitment number only (`CustomerCommitmentPanel.tsx:54`) | Fields in section 3.1. PO attachment via `CommercialInquiryAttachment`. Owning role is descriptive until Fact B is fixed |
| `PO_VALIDATION_NEEDS_INFORMATION` | PO validation needs information | `SALES_MANAGER` | PROPOSED — not in current schema/code. AS-IS "No" email after a failed match | none | Reason text. Owning role is descriptive until Fact B is fixed |
| `PO_VALIDATION_CLARIFICATION` | PO validation clarification | `CUSTOMER_USER` | PROPOSED — not in current schema/code | none | `allowCustomerAction` true. Owning role is descriptive until Fact B is fixed |
| `PO_VALIDATION_RESPONSE` | PO validation response | `CUSTOMER_USER` | PROPOSED — not in current schema/code | none | Reply text, `allowCustomerAction` true. Owning role is descriptive until Fact B is fixed |
| `COMMERCIAL_COMMITMENT` | Commercial commitment | `SALES_MANAGER` (`roleForStep` returns undefined today) | current code `:36`; target "convert to sales order" starts after this | `CustomerCommitmentPanel.tsx:54` | PO fields in section 3.1, stored here even though the gate is the previous stage |
| `SALES_ORDER_CREATED` | Sales order created | `SALES_MANAGER` | PROPOSED — not in current schema/code. Replaces the start of `FULFILLMENT`. AS-IS Sales lane "Create NSO". Target stage 11 | `CommercialFulfillmentWorkspace.tsx:50` lists orders; it does not render this stage | Uses existing `d365DocumentNumber` (`schema.prisma:1264`). No new ERP field. Owning role is descriptive until Fact B is fixed |
| `FINANCIAL_RELEASE` | Financial release | `FINANCE_MANAGER` | PROPOSED — not in current schema/code. AS-IS Accounts - AR "Financial Relrease / Approve", after "Validate" in the same lane | none | Validated-FOX-order flag on the release, not a new stage (decision 7). `FINANCE_MANAGER` has no WORKFLOW permission (`permissionCatalog.ts:223`). Owning role is descriptive until Fact B is fixed |
| `TECHNICAL_RELEASE` | Technical release | `PRODUCTION_PLANNER` (PROPOSED — not in current schema/code). Alternative, if you reject the lane reading: `TECHNICAL_OFFICE_ENGINEER` | PROPOSED — not in current schema/code. AS-IS Planning lane "FOX Technical Release" | none | Release status only. No Work Order model. Owning role is descriptive until Fact B is fixed |
| `WORK_ORDERS_CREATED` | Work orders created | `PRODUCTION_PLANNER` (PROPOSED — not in current schema/code) | PROPOSED — not in current schema/code. AS-IS Planning lane "FOX Create Work Orders" | none | Status only. Creating a Work Order table is out of scope. Owning role is descriptive until Fact B is fixed |
| `PLANNING_RELEASE` | Planning release | `PRODUCTION_PLANNER` (PROPOSED — not in current schema/code) | PROPOSED — not in current schema/code. AS-IS Planning lane "FOX Planning Release" | none | Release status only. Owning role is descriptive until Fact B is fixed |
| `CONFIRMED_SALES_ORDER` | Confirmed sales order | `PRODUCTION_PLANNER` (PROPOSED — not in current schema/code). The box is in the Planning lane, not the Sales lane | PROPOSED — not in current schema/code. AS-IS "FOX Conformed SO". Target G10 | none. `EpcSalesOrderStatus.CONFIRMED` exists (`schema.prisma:657`) but is not this workflow step | Status only. Owning role is descriptive until Fact B is fixed |
| `PRODUCTION_HANDOVER` | Production handover | `PRODUCTION_PLANNER` (PROPOSED — not in current schema/code) | PROPOSED — not in current schema/code. Target stage 12 and screen 9. Not an AS-IS box. Quality and ERP/D365 are not roles | none | Handover status only. Owning role is descriptive until Fact B is fixed |
| `FULFILLMENT` | Fulfillment | queue `FULFILLMENT` (`workflowPresentationMetadata.ts:37`); no matching role; `roleForStep` returns undefined | current code only. Removed as a V2 step and replaced by the seven rows above | `CommercialFulfillmentWorkspace.tsx:50` | none. Do not delete the V1 step; new inquiries use V2 |

## 5. Open decisions requiring the user's sign-off before any implementation

Each item is one recommendation. None of them is implemented by this document.

1. Make `CONTAINER_STUDY` conditional on the existing `logisticsScenarioActive` signal (`costingContainerStudyPin.ts:34` and `standardContainerStudyWorkflowReadiness.ts:73`), not on a new export flag. Recommended, pending user sign-off.
2. Add one new role `PRODUCTION_PLANNER` (PROPOSED — not in current schema/code) for `TECHNICAL_RELEASE`, `WORK_ORDERS_CREATED`, `PLANNING_RELEASE`, `CONFIRMED_SALES_ORDER`, and `PRODUCTION_HANDOVER`. Do not add Quality or ERP roles. Recommended, pending user sign-off.
3. Do not grant `WORKFLOW.TRANSITION` to `COSTING_USER`, `COSTING_MANAGER`, `TECHNICAL_OFFICE_MANAGER`, `FINANCE_MANAGER`, or `PRODUCTION_PLANNER` until `assertCanTransitionWorkflow` checks the current stage (`rbac.ts:801`). After that fix, grant TRANSITION only for each role's own stages. Leave `SALES_REPRESENTATIVE` on `VIEW` and `COMPLETE` unless you want representatives to move inquiries. Recommended, pending user sign-off.
4. Add the three-step loop at `COSTING`, `SALES_REVIEW`, `QUOTATION_APPROVAL`, `CUSTOMER_DECISION`, and `PO_VALIDATION`. Use a single return transition, not a three-step loop, on the release stages in section 3.2. Do not add a G3 loop or a G4 stage. Recommended, pending user sign-off.
5. Keep a single `QUOTATION_APPROVAL` owned by `SALES_MANAGER` in V2. Do not add Finance, Technical, Commercial, or CEO approval steps. Recommended, pending user sign-off.
6. Adopt financial release before technical release, and assign the FOX "Technical Release" shape to `PRODUCTION_PLANNER` because it sits in the Planning lane (x≈270, y≈93) while Financial Release sits in Accounts - AR (x≈244, y≈162). Arrows were not traced. Please confirm against `Quotation - Order Workflow.vsdx` (author Ehab Maher) before implementation. Recommended, pending user sign-off.
7. Treat "Validate FOX Order#" as a check inside `FINANCIAL_RELEASE`, because that shape is in the Accounts - AR lane (x≈156, y≈167), not in the Sales lane with Create NSO. Do not add a `FOX_ORDER_VALIDATED` stage. Recommended, pending user sign-off.
8. On a change request, return to the previous owning stage (Costing to Technical Office, Sales Review to Costing, Quotation Approval to Sales Review, Customer Decision and PO Validation to the customer), then back to the requesting stage, and re-run only downstream stages whose inputs changed. Who answers each loop in section 3.3 is a PROPOSED assumption. Recommended, pending user sign-off.
9. When Container Study is conditional, an export inquiry with no shipment groups blocks at `TECHNICAL_COMPLETE` instead of skipping the step. A non-export inquiry skips it. Recommended, pending user sign-off.
10. At `PO_VALIDATION`, reject a customer PO whose date is after `CommercialQuotation.validUntil` (`schema.prisma:1109`) and send it through the PO clarification loop for re-pricing. Recommended, pending user sign-off.
