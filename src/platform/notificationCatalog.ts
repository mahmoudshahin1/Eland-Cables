/**
 * Minimum in-app notification event catalog.
 * Not an enterprise messaging bus — maps to existing notifyStandardWorkflowEvent + in-app bell.
 */

export const MINIMUM_NOTIFICATION_EVENTS = [
  {
    code: 'INQUIRY_SUBMITTED',
    checklist: 'new inquiry',
    description: 'Fired when a commercial inquiry is submitted.',
  },
  {
    code: 'STANDARD_QUOTATION_ISSUED',
    checklist: 'important change / issued offer',
    description: 'Fired when a quotation is issued to the customer.',
  },
  {
    code: 'STANDARD_QUOTATION_RETURNED',
    checklist: 'approval / rejection',
    description: 'Fired when a quotation is returned or commercially rejected.',
  },
  {
    code: 'STANDARD_TO_REQUIRED',
    checklist: 'readiness',
    description: 'Fired when Technical Office work is required for STANDARD workflow.',
  },
  {
    code: 'AGREEMENT_RELEASED',
    checklist: 'released order',
    description: 'Fired when a sales-agreement release creates a confirmed sales order.',
  },
] as const;
