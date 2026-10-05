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
