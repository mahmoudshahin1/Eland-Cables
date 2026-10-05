import { InquiryProcessCode } from '@prisma/client';

export const STANDARD_INQUIRY_TEMPLATE_CODE = 'STANDARD_INQUIRY_V1';
export const WORKFLOW_ENTITY_COMMERCIAL_INQUIRY = 'CommercialInquiry';

export type WorkflowTransitionCondition =
  | { type: 'inquiryProcessCode'; value: InquiryProcessCode }
  | { type: 'taskResult'; value: string }
  | { type: 'terminal'; value: boolean };

export interface WorkflowTemplateStepView {
  stepCode: string;
  name: string;
  sortOrder: number;
  isTerminal: boolean;
  allowCustomerAction: boolean;
  requiredPermission: string | null;
}

export interface WorkflowTemplateTransitionView {
  transitionCode: string;
  fromStepCode: string;
  toStepCode: string;
  label: string | null;
  conditionJson: WorkflowTransitionCondition | null;
}

export interface WorkflowTemplateView {
  id: string;
  code: string;
  version: number;
  name: string;
  inquiryProcessCode: InquiryProcessCode | null;
  steps: WorkflowTemplateStepView[];
  transitions: WorkflowTemplateTransitionView[];
}

export interface WorkflowTransitionContext {
  inquiryProcessCode?: InquiryProcessCode | null;
  taskResult?: string | null;
}

export function parseTransitionCondition(raw: unknown): WorkflowTransitionCondition | null {
  if (!raw || typeof raw !== 'object' || Array.isArray(raw)) return null;
  const obj = raw as Record<string, unknown>;
  const type = obj.type;
  if (type === 'inquiryProcessCode' && (obj.value === 'VIP_FAST_TRACK' || obj.value === 'STANDARD_WORKFLOW')) {
    return { type: 'inquiryProcessCode', value: obj.value };
  }
  if (type === 'taskResult' && typeof obj.value === 'string') {
    return { type: 'taskResult', value: obj.value };
  }
  if (type === 'terminal' && typeof obj.value === 'boolean') {
    return { type: 'terminal', value: obj.value };
  }
  return null;
}

export function evaluateTransitionCondition(
  condition: WorkflowTransitionCondition | null,
  context: WorkflowTransitionContext
): boolean {
  if (!condition) return true;
  if (condition.type === 'inquiryProcessCode') {
    return context.inquiryProcessCode === condition.value;
  }
  if (condition.type === 'taskResult') {
    return context.taskResult === condition.value;
  }
  if (condition.type === 'terminal') {
    return condition.value === true;
  }
  return false;
}

export function findTransition(
  template: WorkflowTemplateView,
  fromStepCode: string,
  transitionCode: string
): WorkflowTemplateTransitionView | null {
  return (
    template.transitions.find(
      (t) => t.fromStepCode === fromStepCode && t.transitionCode === transitionCode
    ) ?? null
  );
}

export function listOutgoingTransitions(
  template: WorkflowTemplateView,
  fromStepCode: string,
  context: WorkflowTransitionContext
): WorkflowTemplateTransitionView[] {
  return template.transitions.filter(
    (t) =>
      t.fromStepCode === fromStepCode &&
      evaluateTransitionCondition(t.conditionJson, context)
  );
}

export function assertTransitionAllowed(
  template: WorkflowTemplateView,
  fromStepCode: string,
  transitionCode: string,
  context: WorkflowTransitionContext
): WorkflowTemplateTransitionView {
  const transition = findTransition(template, fromStepCode, transitionCode);
  if (!transition) {
    const err = new Error(
      `Transition ${transitionCode} is not defined from step ${fromStepCode}.`
    ) as Error & { code: string };
    err.code = 'INVALID_WORKFLOW_TRANSITION';
    throw err;
  }
  if (!evaluateTransitionCondition(transition.conditionJson, context)) {
    const err = new Error(
      `Transition ${transitionCode} condition not satisfied from step ${fromStepCode}.`
    ) as Error & { code: string };
    err.code = 'WORKFLOW_CONDITION_FAILED';
    throw err;
  }
  return transition;
}

export function stepAllowsCustomerAction(
  template: WorkflowTemplateView,
  stepCode: string
): boolean {
  const step = template.steps.find((s) => s.stepCode === stepCode);
  return step?.allowCustomerAction === true;
}

export function isTerminalStep(template: WorkflowTemplateView, stepCode: string): boolean {
  const step = template.steps.find((s) => s.stepCode === stepCode);
  return step?.isTerminal === true;
}

export function taskTitleForStep(stepCode: string): string {
  const titles: Record<string, string> = {
    TECHNICAL_REVIEW: 'Technical Review',
    CUSTOMER_RESPONSE: 'Respond to clarification',
    CUSTOMER_DECISION: 'Customer quotation decision',
    CONTAINER_STUDY: 'Container study',
    COSTING: 'Costing',
    SALES_REVIEW: 'Sales review',
    QUOTATION_APPROVAL: 'Quotation approval',
    QUOTATION_ISSUE: 'Issue quotation',
    COMMERCIAL_COMMITMENT: 'Commercial commitment',
    FULFILLMENT: 'Fulfillment',
  };
  return titles[stepCode] ?? stepCode.replace(/_/g, ' ');
}

/** Maps workflow stage to inquiry business status — kept separate by design. */
export const WORKFLOW_TO_INQUIRY_STATUS_HINT: Record<string, string> = {
  SUBMITTED: 'SUBMITTED',
  TECHNICAL_REVIEW: 'ENGINEERING_REVIEW',
  NEEDS_INFORMATION: 'ENGINEERING_BLOCKED',
  CUSTOMER_CLARIFICATION: 'ENGINEERING_BLOCKED',
  CUSTOMER_RESPONSE: 'ENGINEERING_BLOCKED',
  TECHNICAL_COMPLETE: 'READY_FOR_COMMERCIAL',
  CONTAINER_STUDY: 'READY_FOR_COMMERCIAL',
  COSTING: 'READY_FOR_COMMERCIAL',
  SALES_REVIEW: 'READY_FOR_COMMERCIAL',
  QUOTATION_APPROVAL: 'READY_FOR_COMMERCIAL',
  QUOTATION_ISSUE: 'QUOTED',
  CUSTOMER_DECISION: 'QUOTED',
  COMMERCIAL_COMMITMENT: 'QUOTED',
  FULFILLMENT: 'CLOSED',
};
