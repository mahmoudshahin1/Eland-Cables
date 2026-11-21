/**
 * Phase 11 — workflow presentation metadata (labels / queues).
 * Does not introduce a generic workflow engine. VIP remains outside STANDARD_INQUIRY_V1.
 */

import { WORKFLOW_TO_INQUIRY_STATUS_HINT } from '../../domain/workflowRuntimeService';

export type WorkflowQueueCode =
  | 'SALES'
  | 'TECHNICAL_OFFICE'
  | 'CUSTOMER'
  | 'LOGISTICS'
  | 'COSTING'
  | 'FINANCE'
  | 'PLANNING'
  | 'FULFILLMENT';

export interface WorkflowStepPresentation {
  stepCode: string;
  label: string;
  queue: WorkflowQueueCode;
  inquiryStatusHint: string;
}

export const STANDARD_WORKFLOW_STEP_PRESENTATION: readonly WorkflowStepPresentation[] = [
  { stepCode: 'SUBMITTED', label: 'Submitted', queue: 'SALES', inquiryStatusHint: 'SUBMITTED' },
  { stepCode: 'TECHNICAL_REVIEW', label: 'Technical review', queue: 'TECHNICAL_OFFICE', inquiryStatusHint: 'ENGINEERING_REVIEW' },
  { stepCode: 'NEEDS_INFORMATION', label: 'Needs information', queue: 'TECHNICAL_OFFICE', inquiryStatusHint: 'ENGINEERING_BLOCKED' },
  { stepCode: 'CUSTOMER_CLARIFICATION', label: 'Customer clarification', queue: 'CUSTOMER', inquiryStatusHint: 'ENGINEERING_BLOCKED' },
  { stepCode: 'CUSTOMER_RESPONSE', label: 'Customer response', queue: 'CUSTOMER', inquiryStatusHint: 'ENGINEERING_BLOCKED' },
  { stepCode: 'TECHNICAL_COMPLETE', label: 'Technical complete', queue: 'TECHNICAL_OFFICE', inquiryStatusHint: 'READY_FOR_COMMERCIAL' },
  { stepCode: 'CONTAINER_STUDY', label: 'Container study', queue: 'LOGISTICS', inquiryStatusHint: 'READY_FOR_COMMERCIAL' },
  { stepCode: 'COSTING', label: 'Costing', queue: 'COSTING', inquiryStatusHint: 'READY_FOR_COMMERCIAL' },
  { stepCode: 'SALES_REVIEW', label: 'Sales review', queue: 'SALES', inquiryStatusHint: 'READY_FOR_COMMERCIAL' },
  { stepCode: 'QUOTATION_APPROVAL', label: 'Quotation approval', queue: 'SALES', inquiryStatusHint: 'READY_FOR_COMMERCIAL' },
  { stepCode: 'QUOTATION_ISSUE', label: 'Quotation issue', queue: 'SALES', inquiryStatusHint: 'QUOTED' },
  { stepCode: 'CUSTOMER_DECISION', label: 'Customer decision', queue: 'CUSTOMER', inquiryStatusHint: 'QUOTED' },
  { stepCode: 'COMMERCIAL_COMMITMENT', label: 'Commercial commitment', queue: 'SALES', inquiryStatusHint: 'QUOTED' },
  { stepCode: 'FULFILLMENT', label: 'Fulfillment', queue: 'FULFILLMENT', inquiryStatusHint: 'CLOSED' },
  { stepCode: 'COSTING_NEEDS_INFORMATION', label: 'Costing needs information', queue: 'COSTING', inquiryStatusHint: 'READY_FOR_COMMERCIAL' },
  { stepCode: 'COSTING_CLARIFICATION', label: 'Costing clarification', queue: 'TECHNICAL_OFFICE', inquiryStatusHint: 'READY_FOR_COMMERCIAL' },
  { stepCode: 'COSTING_RESPONSE', label: 'Costing response', queue: 'TECHNICAL_OFFICE', inquiryStatusHint: 'READY_FOR_COMMERCIAL' },
  { stepCode: 'SALES_REVIEW_NEEDS_INFORMATION', label: 'Sales review needs information', queue: 'SALES', inquiryStatusHint: 'READY_FOR_COMMERCIAL' },
  { stepCode: 'SALES_REVIEW_CLARIFICATION', label: 'Sales review clarification', queue: 'COSTING', inquiryStatusHint: 'READY_FOR_COMMERCIAL' },
  { stepCode: 'SALES_REVIEW_RESPONSE', label: 'Sales review response', queue: 'COSTING', inquiryStatusHint: 'READY_FOR_COMMERCIAL' },
  { stepCode: 'QUOTATION_APPROVAL_NEEDS_INFORMATION', label: 'Quotation approval needs information', queue: 'SALES', inquiryStatusHint: 'READY_FOR_COMMERCIAL' },
  { stepCode: 'QUOTATION_APPROVAL_CLARIFICATION', label: 'Quotation approval clarification', queue: 'SALES', inquiryStatusHint: 'READY_FOR_COMMERCIAL' },
  { stepCode: 'QUOTATION_APPROVAL_RESPONSE', label: 'Quotation approval response', queue: 'SALES', inquiryStatusHint: 'READY_FOR_COMMERCIAL' },
  { stepCode: 'CUSTOMER_DECISION_NEEDS_INFORMATION', label: 'Customer decision needs information', queue: 'SALES', inquiryStatusHint: 'QUOTED' },
  { stepCode: 'CUSTOMER_DECISION_CLARIFICATION', label: 'Customer decision clarification', queue: 'SALES', inquiryStatusHint: 'QUOTED' },
  { stepCode: 'CUSTOMER_DECISION_RESPONSE', label: 'Customer decision response', queue: 'CUSTOMER', inquiryStatusHint: 'QUOTED' },
  { stepCode: 'PO_VALIDATION', label: 'PO validation', queue: 'SALES', inquiryStatusHint: 'QUOTED' },
  { stepCode: 'PO_VALIDATION_NEEDS_INFORMATION', label: 'PO validation needs information', queue: 'SALES', inquiryStatusHint: 'QUOTED' },
  { stepCode: 'PO_VALIDATION_CLARIFICATION', label: 'PO validation clarification', queue: 'SALES', inquiryStatusHint: 'QUOTED' },
  { stepCode: 'PO_VALIDATION_RESPONSE', label: 'PO validation response', queue: 'CUSTOMER', inquiryStatusHint: 'QUOTED' },
  { stepCode: 'SALES_ORDER_CREATED', label: 'Sales order created', queue: 'SALES', inquiryStatusHint: 'QUOTED' },
  { stepCode: 'FINANCIAL_RELEASE', label: 'Financial release', queue: 'FINANCE', inquiryStatusHint: 'QUOTED' },
  { stepCode: 'TECHNICAL_RELEASE', label: 'Technical release', queue: 'PLANNING', inquiryStatusHint: 'CLOSED' },
  { stepCode: 'WORK_ORDERS_CREATED', label: 'Work orders created', queue: 'PLANNING', inquiryStatusHint: 'CLOSED' },
  { stepCode: 'PLANNING_RELEASE', label: 'Planning release', queue: 'PLANNING', inquiryStatusHint: 'CLOSED' },
  { stepCode: 'CONFIRMED_SALES_ORDER', label: 'Confirmed sales order', queue: 'PLANNING', inquiryStatusHint: 'CLOSED' },
  { stepCode: 'PRODUCTION_HANDOVER', label: 'Production handover', queue: 'PLANNING', inquiryStatusHint: 'CLOSED' },
];

export function presentationForWorkflowStep(stepCode: string): WorkflowStepPresentation | null {
  return STANDARD_WORKFLOW_STEP_PRESENTATION.find((s) => s.stepCode === stepCode) ?? null;
}

export function workflowQueues(): WorkflowQueueCode[] {
  return [...new Set(STANDARD_WORKFLOW_STEP_PRESENTATION.map((s) => s.queue))];
}

export function isGenericWorkflowEngineEnabled(): boolean {
  return false;
}

export function vipUsesStandardInquiryTemplate(): boolean {
  return false;
}

export function presentationHintsMatchRuntimeMap(): boolean {
  return STANDARD_WORKFLOW_STEP_PRESENTATION.every(
    (s) => WORKFLOW_TO_INQUIRY_STATUS_HINT[s.stepCode] === s.inquiryStatusHint
  );
}
