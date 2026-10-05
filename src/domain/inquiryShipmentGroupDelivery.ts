/**
 * 05I-DF-B — Inquiry saved Delivery Combination is the only destination/incoterm
 * authority for Shipment Group persistence when it exists.
 * Pure. No Prisma / HTTP.
 */

import { issue } from '../platform/errors/domainError';

export const MISSING_SAVED_DELIVERY_COMBINATION = 'MISSING_SAVED_DELIVERY_COMBINATION';
export const MISSING_SAVED_DELIVERY_COMBINATION_MESSAGE =
  'Inquiry has no valid saved Delivery Combination (destinationPortCode + incoterm). Shipment Group cannot substitute customer defaults, unsaved UI destination, Alexandria, or legacy free-text.';

export type SavedInquiryDeliveryCombination = {
  destinationPortCode: string;
  incotermCode: string;
  deliveryDestination: string | null;
};

function asRecord(value: unknown): Record<string, unknown> | null {
  return value && typeof value === 'object' && !Array.isArray(value) ? (value as Record<string, unknown>) : null;
}

function text(value: unknown): string | null {
  if (value == null) return null;
  const s = String(value).trim();
  return s ? s : null;
}

function upper(value: string | null): string | null {
  return value ? value.toUpperCase() : null;
}

/** Structured saved combination only. Never infers a port from "CIF Alexandria" or free-text. */
export function readSavedInquiryDeliveryCombination(inquiry: {
  incoterms?: string | null;
  deliveryTerms?: string | null;
  commercialMetadata?: unknown;
}): SavedInquiryDeliveryCombination | null {
  void inquiry.deliveryTerms;
  const meta = asRecord(inquiry.commercialMetadata);
  const destinationPortCode = upper(text(meta?.destinationPortCode));
  const incotermCode = upper(text(meta?.incoterms) || text(inquiry.incoterms));
  const deliveryDestination = text(meta?.deliveryDestination);
  if (!destinationPortCode || !incotermCode) return null;
  return { destinationPortCode, incotermCode, deliveryDestination };
}

export function resolveShipmentGroupDeliveryIdentity(input: {
  saved: SavedInquiryDeliveryCombination | null;
  clientDestinationPortCode?: string | null;
  clientDestinationKey?: string | null;
  clientIncotermCode?: string | null;
  customerDefaultDestinationPortCode?: string | null;
  unsavedUiDestination?: string | null;
}): { destinationPortCode: string | null; incotermCode: string | null; deliveryDestination: string | null } {
  void input.customerDefaultDestinationPortCode;
  void input.unsavedUiDestination;
  if (input.saved) {
    return {
      destinationPortCode: input.saved.destinationPortCode,
      incotermCode: input.saved.incotermCode,
      deliveryDestination: input.saved.deliveryDestination,
    };
  }
  return {
    destinationPortCode: text(input.clientDestinationPortCode) || text(input.clientDestinationKey),
    incotermCode: text(input.clientIncotermCode),
    deliveryDestination: null,
  };
}

export function assertSavedDeliveryCombinationForAuthoritativeGroup(
  saved: SavedInquiryDeliveryCombination | null
): SavedInquiryDeliveryCombination {
  if (!saved) {
    throw issue('VALIDATION_FAILED', MISSING_SAVED_DELIVERY_COMBINATION_MESSAGE, {
      issueCode: MISSING_SAVED_DELIVERY_COMBINATION,
    });
  }
  return saved;
}

export function assertShipmentGroupDeliveryComplete(input: {
  destinationPortCode?: string | null;
  incotermCode?: string | null;
}): void {
  if (!text(input.destinationPortCode)) {
    throw issue('VALIDATION_FAILED', 'Shipment group is missing destinationPortCode.', {
      issueCode: 'MISSING_DESTINATION',
    });
  }
  if (!text(input.incotermCode)) {
    throw issue('VALIDATION_FAILED', 'Shipment group is missing Incoterm.', {
      issueCode: 'MISSING_INCOTERM',
    });
  }
}
