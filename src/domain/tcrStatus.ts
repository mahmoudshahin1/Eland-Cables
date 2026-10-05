export type CanonicalTcrStatus =
  | 'DRAFT'
  | 'SUBMITTED'
  | 'UNDER_REVIEW'
  | 'APPROVED'
  | 'REJECTED'
  | 'IMPLEMENTED'
  | 'CANCELLED';

const DISPLAY_TO_CANONICAL: Record<string, CanonicalTcrStatus> = {
  Draft: 'DRAFT',
  DRAFT: 'DRAFT',
  Submitted: 'SUBMITTED',
  SUBMITTED: 'SUBMITTED',
  'Under Technical Review': 'UNDER_REVIEW',
  UNDER_REVIEW: 'UNDER_REVIEW',
  Approved: 'APPROVED',
  APPROVED: 'APPROVED',
  Rejected: 'REJECTED',
  REJECTED: 'REJECTED',
  Released: 'IMPLEMENTED',
  'Cable Created': 'IMPLEMENTED',
  IMPLEMENTED: 'IMPLEMENTED',
  Closed: 'CANCELLED',
  CANCELLED: 'CANCELLED',
};

const CANONICAL_TO_DISPLAY: Record<CanonicalTcrStatus, string> = {
  DRAFT: 'Draft',
  SUBMITTED: 'Submitted',
  UNDER_REVIEW: 'Under Technical Review',
  APPROVED: 'Approved',
  REJECTED: 'Rejected',
  IMPLEMENTED: 'Released',
  CANCELLED: 'Closed',
};

export function toCanonicalTcrStatus(value: string): CanonicalTcrStatus {
  return DISPLAY_TO_CANONICAL[value] || 'SUBMITTED';
}

export function toDisplayTcrStatus(value: CanonicalTcrStatus | string): string {
  if (value in CANONICAL_TO_DISPLAY) return CANONICAL_TO_DISPLAY[value as CanonicalTcrStatus];
  return value;
}
