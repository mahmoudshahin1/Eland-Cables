/**
 * Task 05I-DF-B1 — shipment group input rules (DF-A-01, DF-A-08, DF-A-12).
 * Pure validation. No Prisma / HTTP.
 */

import { issue } from '../platform/errors/domainError';

export type DeliveryAllocationModeCode = 'ENTIRE_INQUIRY' | 'PER_INQUIRY_LINE' | 'DESTINATION_CLUSTER';

export function parseDeliveryAllocationMode(value: unknown): DeliveryAllocationModeCode {
  if (value == null || value === '') return 'ENTIRE_INQUIRY';
  if (value === 'ENTIRE_INQUIRY' || value === 'PER_INQUIRY_LINE' || value === 'DESTINATION_CLUSTER') return value;
  throw issue(
    'VALIDATION_FAILED',
    'deliveryAllocationMode must be ENTIRE_INQUIRY, PER_INQUIRY_LINE, or DESTINATION_CLUSTER.'
  );
}

export function assertShipmentGroupCreateInput(input: {
  deliveryAllocationMode: DeliveryAllocationModeCode;
  inquiryLineId?: string | null;
  destinationPortCode?: string | null;
  destinationKey?: string | null;
  incotermCode?: string | null;
}): { destinationPortCode: string | null; incotermCode: string | null } {
  if (input.deliveryAllocationMode === 'PER_INQUIRY_LINE' && !input.inquiryLineId) {
    throw issue('VALIDATION_FAILED', 'inquiryLineId is required when deliveryAllocationMode is PER_INQUIRY_LINE.');
  }
  const destinationPortCode = (input.destinationPortCode ?? input.destinationKey ?? '').toString().trim() || null;
  const incotermCode = (input.incotermCode ?? '').toString().trim() || null;
  if (
    (input.deliveryAllocationMode === 'PER_INQUIRY_LINE' ||
      input.deliveryAllocationMode === 'DESTINATION_CLUSTER') &&
    !destinationPortCode
  ) {
    throw issue(
      'VALIDATION_FAILED',
      'destinationPortCode is required when creating a line or cluster shipment group. Customer delivery preferences must not be auto-applied.'
    );
  }
  return { destinationPortCode, incotermCode };
}

/** Customer container type is preference only — never a suitability declaration. */
export function assertContainerPreferenceIsNotAuthority(input: {
  technicallySuitable?: unknown;
  containerSuitable?: unknown;
  suitability?: unknown;
}): void {
  if (
    input.technicallySuitable === true ||
    input.containerSuitable === true ||
    input.suitability === 'SUITABLE' ||
    input.suitability === 'APPROVED'
  ) {
    throw issue(
      'VALIDATION_FAILED',
      'Client cannot declare container technical suitability. Container Study is the authority.'
    );
  }
}
