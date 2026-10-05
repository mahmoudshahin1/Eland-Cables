export const CUSTOMER_SERVICE_CASE_STATUSES = [
  'OPEN',
  'IN_PROGRESS',
  'AWAITING_CUSTOMER',
  'RESOLVED',
  'CLOSED',
] as const;

export type CustomerServiceCaseStatusCode = (typeof CUSTOMER_SERVICE_CASE_STATUSES)[number];

export const CUSTOMER_SERVICE_CASE_PRIORITIES = ['LOW', 'MEDIUM', 'HIGH', 'URGENT'] as const;
export type CustomerServiceCasePriorityCode = (typeof CUSTOMER_SERVICE_CASE_PRIORITIES)[number];

export const CASE_COMMENT_VISIBILITIES = ['CUSTOMER', 'INTERNAL'] as const;
export type CaseCommentVisibilityCode = (typeof CASE_COMMENT_VISIBILITIES)[number];

export const CASE_ASSIGNMENT_DEPARTMENTS = [
  'CUSTOMER_SERVICE',
  'SALES',
  'TECHNICAL_OFFICE',
  'QUALITY',
  'LOGISTICS',
  'FINANCE',
  'PRODUCTION',
] as const;

export type CaseAssignmentDepartmentCode = (typeof CASE_ASSIGNMENT_DEPARTMENTS)[number];

export const CUSTOMER_SERVICE_CASE_TABS = [
  'all',
  'open',
  'in_progress',
  'awaiting_customer',
  'resolved',
  'closed',
] as const;

export type CustomerServiceCaseTab = (typeof CUSTOMER_SERVICE_CASE_TABS)[number];

const TAB_STATUS: Record<Exclude<CustomerServiceCaseTab, 'all'>, CustomerServiceCaseStatusCode> = {
  open: 'OPEN',
  in_progress: 'IN_PROGRESS',
  awaiting_customer: 'AWAITING_CUSTOMER',
  resolved: 'RESOLVED',
  closed: 'CLOSED',
};

export function statusForCaseTab(tab: string | undefined): CustomerServiceCaseStatusCode | undefined {
  if (!tab || tab === 'all') return undefined;
  return TAB_STATUS[tab as Exclude<CustomerServiceCaseTab, 'all'>];
}

export function isCustomerServiceCaseStatus(value: string): value is CustomerServiceCaseStatusCode {
  return (CUSTOMER_SERVICE_CASE_STATUSES as readonly string[]).includes(value);
}

export function isCustomerServiceCasePriority(value: string): value is CustomerServiceCasePriorityCode {
  return (CUSTOMER_SERVICE_CASE_PRIORITIES as readonly string[]).includes(value);
}

export function isCaseCommentVisibility(value: string): value is CaseCommentVisibilityCode {
  return (CASE_COMMENT_VISIBILITIES as readonly string[]).includes(value);
}

export function isCaseAssignmentDepartment(value: string): value is CaseAssignmentDepartmentCode {
  return (CASE_ASSIGNMENT_DEPARTMENTS as readonly string[]).includes(value);
}

export function customerCanSeeComment(visibility: string): boolean {
  return visibility === 'CUSTOMER';
}

export function customerCanSeeAttachment(visibility: string): boolean {
  return visibility === 'CUSTOMER';
}

/** Server-enforced: customers may only write customer-visible comments. */
export function resolveCommentVisibilityForActor(
  actorUserType: string | undefined,
  requested?: string | null
): CaseCommentVisibilityCode {
  if (actorUserType === 'customer') return 'CUSTOMER';
  if (requested && isCaseCommentVisibility(requested)) return requested;
  return 'CUSTOMER';
}

export function customerCanConfirmResolution(status: string): boolean {
  return status === 'RESOLVED';
}

export function customerCanRequestReopen(status: string): boolean {
  return status === 'RESOLVED' || status === 'CLOSED';
}

export function nextStatusAfterCustomerComment(status: string): CustomerServiceCaseStatusCode | null {
  if (status === 'AWAITING_CUSTOMER') return 'IN_PROGRESS';
  return null;
}

export function departmentLabel(code: string | null | undefined): string {
  switch (code) {
    case 'CUSTOMER_SERVICE':
      return 'Customer Service';
    case 'SALES':
      return 'Sales';
    case 'TECHNICAL_OFFICE':
      return 'Technical Office';
    case 'QUALITY':
      return 'Quality';
    case 'LOGISTICS':
      return 'Logistics';
    case 'FINANCE':
      return 'Finance';
    case 'PRODUCTION':
      return 'Production';
    default:
      return '';
  }
}

export type CustomerVisibleComment = {
  id: string;
  visibility: string;
  body: string;
  createdByName?: string | null;
  createdAt: string;
};

export function filterCommentsForActor<T extends { visibility: string }>(
  comments: T[],
  actorUserType: string | undefined
): T[] {
  if (actorUserType === 'customer') {
    return comments.filter((row) => customerCanSeeComment(row.visibility));
  }
  return comments;
}

export function filterAttachmentsForActor<T extends { visibility: string }>(
  attachments: T[],
  actorUserType: string | undefined
): T[] {
  if (actorUserType === 'customer') {
    return attachments.filter((row) => customerCanSeeAttachment(row.visibility));
  }
  return attachments;
}
