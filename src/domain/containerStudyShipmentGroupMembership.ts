/**
 * Task 05I-DF-B4-A — shipment group membership and identity rules (doc 47).
 * Pure. No Prisma / HTTP.
 */

import { issue } from '../platform/errors/domainError';
import type { DeliveryAllocationModeCode } from './containerStudyShipmentGroupRules';

export type ShipmentIdentity = {
  destinationPortCode: string;
  incotermCode: string;
  containerTypePreferenceCode?: string | null;
};

export type MemberShipmentIdentity = {
  inquiryLineId: string;
  destinationPortCode?: string | null;
  incotermCode?: string | null;
  containerTypePreferenceCode?: string | null;
};

function uniqueIds(ids: string[]): string[] {
  return [...new Set(ids.map((id) => id.trim()).filter(Boolean))];
}

function norm(value: string | null | undefined): string {
  return (value ?? '').trim().toUpperCase();
}

export function resolveCreateMembership(input: {
  deliveryAllocationMode: DeliveryAllocationModeCode;
  inquiryLineId?: string | null;
  inquiryLineIds?: string[] | null;
  allInquiryLineIds: string[];
}): string[] {
  const all = uniqueIds(input.allInquiryLineIds);
  const requested = uniqueIds(input.inquiryLineIds ?? []);
  const single = (input.inquiryLineId ?? '').trim();

  if (input.deliveryAllocationMode === 'PER_INQUIRY_LINE') {
    const member = single || (requested.length === 1 ? requested[0]! : '');
    if (!member) {
      throw issue('VALIDATION_FAILED', 'inquiryLineId is required when deliveryAllocationMode is PER_INQUIRY_LINE.');
    }
    if (requested.length > 1 || (requested.length === 1 && requested[0] !== member)) {
      throw issue(
        'VALIDATION_FAILED',
        'PER_INQUIRY_LINE membership must contain exactly one inquiry line.'
      );
    }
    if (!all.includes(member)) {
      throw issue('VALIDATION_FAILED', 'inquiryLineId does not belong to this inquiry.');
    }
    return [member];
  }

  if (input.deliveryAllocationMode === 'DESTINATION_CLUSTER') {
    if (single) {
      throw issue(
        'VALIDATION_FAILED',
        'DESTINATION_CLUSTER uses inquiryLineIds. Do not set inquiryLineId; use PER_INQUIRY_LINE for a single line.'
      );
    }
    if (requested.length < 2) {
      throw issue(
        'VALIDATION_FAILED',
        'DESTINATION_CLUSTER requires two or more inquiry lines. Use PER_INQUIRY_LINE for a single line.'
      );
    }
    const unknown = requested.filter((id) => !all.includes(id));
    if (unknown.length > 0) {
      throw issue('VALIDATION_FAILED', 'One or more inquiryLineIds do not belong to this inquiry.');
    }
    return requested;
  }

  // ENTIRE_INQUIRY — never silently cluster a subset.
  if (requested.length > 0) {
    const sameSet =
      requested.length === all.length && requested.every((id) => all.includes(id)) && all.every((id) => requested.includes(id));
    if (!sameSet) {
      throw issue(
        'VALIDATION_FAILED',
        'ENTIRE_INQUIRY cannot take a subset of inquiry lines. Use DESTINATION_CLUSTER to group selected lines that share shipment identity.'
      );
    }
  }
  if (single) {
    throw issue(
      'VALIDATION_FAILED',
      'ENTIRE_INQUIRY does not accept inquiryLineId. Membership is every eligible inquiry line.'
    );
  }
  if (all.length === 0) {
    return [];
  }
  return all;
}

export function assertShipmentIdentityHomogeneous(
  group: ShipmentIdentity,
  memberIdentities: MemberShipmentIdentity[] | null | undefined
): void {
  if (!memberIdentities || memberIdentities.length === 0) return;
  const dest = norm(group.destinationPortCode);
  const incoterm = norm(group.incotermCode);
  const preference = norm(group.containerTypePreferenceCode);
  for (const member of memberIdentities) {
    if (member.destinationPortCode != null && member.destinationPortCode !== '' && norm(member.destinationPortCode) !== dest) {
      throw issue(
        'VALIDATION_FAILED',
        'Shipment group members must share destination port, incoterm, and container type preference when present.',
        {
          issues: [
            {
              code: 'MIXED_SHIPMENT_IDENTITY',
              field: 'destinationPortCode',
              message: `Line ${member.inquiryLineId} destination does not match the shipment group.`,
            },
          ],
        }
      );
    }
    if (member.incotermCode != null && member.incotermCode !== '' && norm(member.incotermCode) !== incoterm) {
      throw issue(
        'VALIDATION_FAILED',
        'Shipment group members must share destination port, incoterm, and container type preference when present.',
        {
          issues: [
            {
              code: 'MIXED_SHIPMENT_IDENTITY',
              field: 'incotermCode',
              message: `Line ${member.inquiryLineId} incoterm does not match the shipment group.`,
            },
          ],
        }
      );
    }
    if (
      preference &&
      member.containerTypePreferenceCode != null &&
      member.containerTypePreferenceCode !== '' &&
      norm(member.containerTypePreferenceCode) !== preference
    ) {
      throw issue(
        'VALIDATION_FAILED',
        'Shipment group members must share destination port, incoterm, and container type preference when present.',
        {
          issues: [
            {
              code: 'MIXED_SHIPMENT_IDENTITY',
              field: 'containerTypePreferenceCode',
              message: `Line ${member.inquiryLineId} container preference does not match the shipment group.`,
            },
          ],
        }
      );
    }
  }
}

export function assertShipmentGroupIdentityMutable(status: string): void {
  if (status === 'LOCKED' || status === 'SUPERSEDED') {
    throw issue(
      'CONFLICT',
      'Shipment group identity is frozen. Destination, incoterm, allocation mode, and membership cannot change. Create a new shipment group.',
      {
        issues: [
          {
            code: 'SHIPMENT_GROUP_IDENTITY_LOCKED',
            message: 'LOCKED shipment groups may receive successor Container Studies but must not be mutated.',
          },
        ],
      }
    );
  }
}

export function resolveAuthoritativeMemberLineIds(input: {
  deliveryAllocationMode: DeliveryAllocationModeCode;
  groupInquiryLineId?: string | null;
  membershipLineIds: string[];
  allInquiryLineIds: string[];
}): string[] {
  const all = uniqueIds(input.allInquiryLineIds);
  if (input.deliveryAllocationMode === 'ENTIRE_INQUIRY') {
    void input.groupInquiryLineId;
    return all;
  }
  const members = uniqueIds(input.membershipLineIds).filter((id) => all.includes(id));
  if (members.length > 0) return members;
  if (input.groupInquiryLineId && all.includes(input.groupInquiryLineId)) return [input.groupInquiryLineId];
  return [];
}

export function compatibilityInquiryLineId(
  mode: DeliveryAllocationModeCode,
  memberLineIds: string[]
): string | null {
  if (mode === 'PER_INQUIRY_LINE' && memberLineIds.length === 1) return memberLineIds[0]!;
  return null;
}
