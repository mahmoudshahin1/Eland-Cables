/**
 * STANDARD_INQUIRY_V2 decisions (signed off for implementation).
 * Does not introduce a generic workflow engine. VIP stays outside this template.
 * STANDARD_INQUIRY_V1 rows are not modified; new standard inquiries start on V2.
 */

export const STANDARD_INQUIRY_V2_TEMPLATE_CODE = 'STANDARD_INQUIRY_V2';

export const EXPORT_CUSTOMER_SEGMENT_CODE = 'EXPORT';

export type ContainerStudyRoute = 'ENTER' | 'SKIP' | 'BLOCK';

export type ChangeInputKind = 'TECHNICAL' | 'PRICE' | 'NONE';

/** Roles allowed to transition a stage. Customer stages are completed, not transitioned. */
const STAGE_OWNERS: Record<string, readonly string[]> = {
  SUBMITTED: ['SALES_MANAGER'],
  TECHNICAL_REVIEW: ['TECHNICAL_OFFICE_ENGINEER', 'TECHNICAL_OFFICE_MANAGER'],
  NEEDS_INFORMATION: ['TECHNICAL_OFFICE_ENGINEER', 'TECHNICAL_OFFICE_MANAGER'],
  CUSTOMER_CLARIFICATION: ['SALES_MANAGER'],
  TECHNICAL_COMPLETE: ['TECHNICAL_OFFICE_ENGINEER', 'TECHNICAL_OFFICE_MANAGER'],
  CONTAINER_STUDY: ['TECHNICAL_OFFICE_ENGINEER', 'TECHNICAL_OFFICE_MANAGER'],
  COSTING: ['COSTING_USER', 'COSTING_MANAGER'],
  COSTING_NEEDS_INFORMATION: ['COSTING_USER', 'COSTING_MANAGER'],
  COSTING_CLARIFICATION: ['TECHNICAL_OFFICE_ENGINEER', 'TECHNICAL_OFFICE_MANAGER'],
  COSTING_RESPONSE: ['TECHNICAL_OFFICE_ENGINEER', 'TECHNICAL_OFFICE_MANAGER'],
  SALES_REVIEW: ['SALES_MANAGER'],
  SALES_REVIEW_NEEDS_INFORMATION: ['SALES_MANAGER'],
  SALES_REVIEW_CLARIFICATION: ['COSTING_USER', 'COSTING_MANAGER'],
  SALES_REVIEW_RESPONSE: ['COSTING_USER', 'COSTING_MANAGER'],
  QUOTATION_APPROVAL: ['SALES_MANAGER'],
  QUOTATION_APPROVAL_NEEDS_INFORMATION: ['SALES_MANAGER'],
  QUOTATION_APPROVAL_CLARIFICATION: ['SALES_MANAGER'],
  QUOTATION_APPROVAL_RESPONSE: ['SALES_MANAGER'],
  QUOTATION_ISSUE: ['SALES_MANAGER'],
  CUSTOMER_DECISION_NEEDS_INFORMATION: ['SALES_MANAGER'],
  CUSTOMER_DECISION_CLARIFICATION: ['SALES_MANAGER'],
  PO_VALIDATION: ['SALES_MANAGER'],
  PO_VALIDATION_NEEDS_INFORMATION: ['SALES_MANAGER'],
  PO_VALIDATION_CLARIFICATION: ['SALES_MANAGER'],
  COMMERCIAL_COMMITMENT: ['SALES_MANAGER'],
  SALES_ORDER_CREATED: ['SALES_MANAGER'],
  FINANCIAL_RELEASE: ['FINANCE_MANAGER'],
  TECHNICAL_RELEASE: ['PRODUCTION_PLANNER'],
  WORK_ORDERS_CREATED: ['PRODUCTION_PLANNER'],
  PLANNING_RELEASE: ['PRODUCTION_PLANNER'],
  CONFIRMED_SALES_ORDER: ['PRODUCTION_PLANNER'],
  PRODUCTION_HANDOVER: ['PRODUCTION_PLANNER'],
};

const CUSTOMER_TASK_STEPS = [
  'CUSTOMER_RESPONSE',
  'CUSTOMER_DECISION',
  'CUSTOMER_DECISION_RESPONSE',
  'PO_VALIDATION_RESPONSE',
] as const;

export function customerTaskStepCodes(): readonly string[] {
  return CUSTOMER_TASK_STEPS;
}

export function stageAllowsCustomerAction(stepCode: string): boolean {
  return (CUSTOMER_TASK_STEPS as readonly string[]).includes(stepCode);
}

/** Primary assignee written onto the workflow task. */
export function roleForWorkflowStep(stepCode: string): string | undefined {
  return STAGE_OWNERS[stepCode]?.[0];
}

export function rolesAllowedToTransitionStep(stepCode: string): readonly string[] {
  return STAGE_OWNERS[stepCode] ?? [];
}

export function actorMayTransitionStep(stepCode: string, roleCodes: readonly string[]): boolean {
  if (roleCodes.includes('SYSTEM_ADMINISTRATOR')) return true;
  const allowed = rolesAllowedToTransitionStep(stepCode);
  if (allowed.length === 0) return true;
  return allowed.some((role) => roleCodes.includes(role));
}

/**
 * Decision 1 and 9. Uses the existing logistics signal, plus the existing
 * customer segment code EXPORT. No new export column.
 * Logistics present -> enter Container Study.
 * Export customer with no shipment groups and no study -> block at Technical Complete.
 * Otherwise skip Container Study.
 */
export function routeContainerStudy(input: {
  shipmentGroupCount: number;
  containerStudyCount: number;
  customerSegmentCode?: string | null;
}): ContainerStudyRoute {
  const logisticsActive = input.shipmentGroupCount > 0 || input.containerStudyCount > 0;
  if (logisticsActive) return 'ENTER';
  if ((input.customerSegmentCode ?? '').trim().toUpperCase() === EXPORT_CUSTOMER_SEGMENT_CODE) {
    return 'BLOCK';
  }
  return 'SKIP';
}

export interface CustomerPoCheckInput {
  customerPoDate: Date | null;
  quotationValidUntil: Date | null;
  poValue?: number | null;
  quotedValue?: number | null;
  poQuantity?: number | null;
  quotedQuantity?: number | null;
}

export interface CustomerPoCheckResult {
  matched: boolean;
  reason: string | null;
}

/** Decision 10. A PO dated after quotation validity is a mismatch, not a silent match. */
export function evaluateCustomerPo(input: CustomerPoCheckInput): CustomerPoCheckResult {
  if (!input.customerPoDate || Number.isNaN(input.customerPoDate.getTime())) {
    return { matched: false, reason: 'Customer PO date is required.' };
  }
  if (input.quotationValidUntil && input.customerPoDate.getTime() > input.quotationValidUntil.getTime()) {
    return {
      matched: false,
      reason: 'Customer PO date is after the quotation validity date. Re-price before matching.',
    };
  }
  if (
    input.poValue != null &&
    input.quotedValue != null &&
    Number.isFinite(input.poValue) &&
    Number.isFinite(input.quotedValue) &&
    input.poValue !== input.quotedValue
  ) {
    return { matched: false, reason: 'PO value does not match the quotation value.' };
  }
  if (
    input.poQuantity != null &&
    input.quotedQuantity != null &&
    Number.isFinite(input.poQuantity) &&
    Number.isFinite(input.quotedQuantity) &&
    input.poQuantity !== input.quotedQuantity
  ) {
    return { matched: false, reason: 'PO quantity does not match the quotation quantity.' };
  }
  return { matched: true, reason: null };
}

/**
 * Decision 8. A technical change invalidates costing onward.
 * A price-only change does not reopen technical review.
 * The inquiry still returns to the requesting stage; this list is what must be redone.
 */
export function stagesInvalidatedByChange(inputChanged: ChangeInputKind): string[] {
  if (inputChanged === 'TECHNICAL') return ['COSTING', 'SALES_REVIEW', 'QUOTATION_APPROVAL', 'QUOTATION_ISSUE'];
  if (inputChanged === 'PRICE') return ['SALES_REVIEW', 'QUOTATION_APPROVAL', 'QUOTATION_ISSUE'];
  return [];
}

export function responseTransitionCode(stepCode: string): string | null {
  if (stepCode === 'CUSTOMER_RESPONSE') return 'CUSTOMER_RESPONDED';
  if (stepCode.endsWith('_RESPONSE')) {
    return `${stepCode.slice(0, -'_RESPONSE'.length)}_RESPONDED`;
  }
  return null;
}

const CLARIFICATION_ADVANCE: Record<string, string> = {
  NEEDS_INFORMATION: 'TO_CLARIFICATION',
  CUSTOMER_CLARIFICATION: 'AWAIT_RESPONSE',
  COSTING_NEEDS_INFORMATION: 'COSTING_TO_CLARIFICATION',
  COSTING_CLARIFICATION: 'COSTING_AWAIT_RESPONSE',
  SALES_REVIEW_NEEDS_INFORMATION: 'SALES_REVIEW_TO_CLARIFICATION',
  SALES_REVIEW_CLARIFICATION: 'SALES_REVIEW_AWAIT_RESPONSE',
  QUOTATION_APPROVAL_NEEDS_INFORMATION: 'QUOTATION_APPROVAL_TO_CLARIFICATION',
  QUOTATION_APPROVAL_CLARIFICATION: 'QUOTATION_APPROVAL_AWAIT_RESPONSE',
  CUSTOMER_DECISION_NEEDS_INFORMATION: 'CUSTOMER_DECISION_TO_CLARIFICATION',
  CUSTOMER_DECISION_CLARIFICATION: 'CUSTOMER_DECISION_AWAIT_RESPONSE',
  PO_VALIDATION_NEEDS_INFORMATION: 'PO_VALIDATION_TO_CLARIFICATION',
  PO_VALIDATION_CLARIFICATION: 'PO_VALIDATION_AWAIT_RESPONSE',
};

/** Next hop inside a three-step clarification loop. Null on the response step. */
export function clarificationAdvanceCode(stepCode: string): string | null {
  return CLARIFICATION_ADVANCE[stepCode] ?? null;
}

const FORWARD_STAGE_ACTION: Record<string, { transitionCode: string; label: string }> = {
  COMMERCIAL_COMMITMENT: { transitionCode: 'TO_SALES_ORDER', label: 'Create sales order' },
  SALES_ORDER_CREATED: { transitionCode: 'TO_FINANCIAL_RELEASE', label: 'Send to financial release' },
  TECHNICAL_RELEASE: { transitionCode: 'TO_WORK_ORDERS', label: 'Create work orders' },
  WORK_ORDERS_CREATED: { transitionCode: 'TO_PLANNING_RELEASE', label: 'Planning release' },
  PLANNING_RELEASE: { transitionCode: 'TO_CONFIRMED_SALES_ORDER', label: 'Confirm sales order' },
  CONFIRMED_SALES_ORDER: { transitionCode: 'TO_PRODUCTION_HANDOVER', label: 'Hand over to production' },
};

/** Linear tail after the PO match. Stages that already have their own form are omitted. */
export function forwardStageAction(stepCode: string): { transitionCode: string; label: string } | null {
  return FORWARD_STAGE_ACTION[stepCode] ?? null;
}

export function stageOwnerLabel(stepCode: string): string | null {
  if (stageAllowsCustomerAction(stepCode)) return 'Customer';
  const role = roleForWorkflowStep(stepCode);
  if (!role) return null;
  return role
    .toLowerCase()
    .split('_')
    .map((part) => part.charAt(0).toUpperCase() + part.slice(1))
    .join(' ');
}

export function auditActionForWorkflowMove(input: {
  fromStepCode: string;
  toStepCode: string;
  taskResult?: string | null;
}): 'WORKFLOW_STAGE_CHANGED' | 'WORKFLOW_CHANGE_REQUEST_OPENED' | 'WORKFLOW_CHANGE_REQUEST_CLOSED' | 'WORKFLOW_APPROVED' | 'WORKFLOW_REJECTED' {
  if (input.toStepCode.endsWith('_NEEDS_INFORMATION') || input.toStepCode === 'NEEDS_INFORMATION' || input.toStepCode === 'CUSTOMER_CLARIFICATION') {
    return 'WORKFLOW_CHANGE_REQUEST_OPENED';
  }
  if (input.fromStepCode.endsWith('_RESPONSE') || input.fromStepCode === 'CUSTOMER_RESPONSE') {
    return 'WORKFLOW_CHANGE_REQUEST_CLOSED';
  }
  const result = input.taskResult ?? '';
  if (result === 'APPROVED' || result === 'ACCEPTED' || result === 'MATCHED') return 'WORKFLOW_APPROVED';
  if (result === 'RETURNED' || result === 'REJECTED' || result === 'MISMATCH') return 'WORKFLOW_REJECTED';
  return 'WORKFLOW_STAGE_CHANGED';
}
