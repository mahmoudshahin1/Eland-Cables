import { InquiryStatus } from '@prisma/client';

/** V2 inquiry workflow statuses (Task 05B §9). */
export const V2_INQUIRY_STATUSES: InquiryStatus[] = [
  'DRAFT',
  'SUBMITTED',
  'ENGINEERING_REVIEW',
  'ENGINEERING_BLOCKED',
  'READY_FOR_COMMERCIAL',
  'QUOTED',
];

const ALLOWED_TRANSITIONS: Partial<Record<InquiryStatus, InquiryStatus[]>> = {
  DRAFT: ['SUBMITTED', 'CANCELLED'],
  SUBMITTED: ['ENGINEERING_REVIEW', 'CANCELLED'],
  ENGINEERING_REVIEW: ['ENGINEERING_BLOCKED', 'READY_FOR_COMMERCIAL', 'CANCELLED'],
  ENGINEERING_BLOCKED: ['ENGINEERING_REVIEW', 'CANCELLED'],
  READY_FOR_COMMERCIAL: ['QUOTED', 'CANCELLED'],
  QUOTED: ['CLOSED'],
};

export function isV2InquiryMetadata(metadata: unknown): boolean {
  if (!metadata || typeof metadata !== 'object' || Array.isArray(metadata)) return false;
  return (metadata as Record<string, unknown>).workflowChannel === 'V2_CONFIGURATION';
}

/** True only when a line already has a persisted V2 configuration snapshot pointer. */
export function inquiryHasV2ConfigurationLineage(
  lines: Array<{ v2CurrentSnapshotId?: string | null }> | null | undefined
): boolean {
  return Boolean(lines?.some((line) => Boolean(line.v2CurrentSnapshotId)));
}

/**
 * Route `/submit` to V2 snapshot gates only when V2 lineage exists.
 * Version A inquiries (Phase E costing/TO contract) must not inherit SNAPSHOT_REQUIRED
 * just because process code is STANDARD_WORKFLOW or workflowChannel was stamped.
 */
export function shouldSubmitViaV2Inquiry(inquiry: {
  commercialMetadata?: unknown;
  lines?: Array<{ v2CurrentSnapshotId?: string | null }> | null;
}): boolean {
  return isV2InquiryMetadata(inquiry.commercialMetadata) && inquiryHasV2ConfigurationLineage(inquiry.lines);
}

export function assertV2StatusTransition(from: InquiryStatus, to: InquiryStatus): void {
  const allowed = ALLOWED_TRANSITIONS[from] || [];
  if (!allowed.includes(to)) {
    const err = new Error(`Illegal V2 inquiry status transition ${from} → ${to}.`);
    (err as Error & { code: string }).code = 'INVALID_STATE';
    throw err;
  }
}

export function derivePostSubmitStatus(input: {
  anyBomBlocked: boolean;
  anyEngineeringBlocked: boolean;
  allLinesValid: boolean;
}): InquiryStatus {
  if (input.anyBomBlocked || input.anyEngineeringBlocked) return 'ENGINEERING_BLOCKED';
  if (input.allLinesValid) return 'READY_FOR_COMMERCIAL';
  return 'ENGINEERING_REVIEW';
}
