/** Prisma-free B4-D pin-set, currency, and VIP-warning helpers. */

export const VIP_SHIPMENT_NOT_CONFIGURED = 'VIP_SHIPMENT_NOT_CONFIGURED';
export const SHIPPING_CHARGES_NOT_AVAILABLE = 'SHIPPING_CHARGES_NOT_AVAILABLE';

export type FinancialOfferWarningCode = typeof VIP_SHIPMENT_NOT_CONFIGURED | typeof SHIPPING_CHARGES_NOT_AVAILABLE;

export type FinancialOfferWarning = {
  code: FinancialOfferWarningCode;
  shipmentGroupId?: string;
};

export type FinancialOfferPinSet = {
  pricingSnapshotIds: string[];
  shipmentCostSnapshotIds: string[];
  currencyCode: string;
};

export function canonicalizeIdList(ids: unknown): string[] {
  if (!Array.isArray(ids)) return [];
  return [...new Set(ids.map((id) => String(id ?? '').trim()).filter(Boolean))].sort((a, b) => a.localeCompare(b));
}

export function canonicalizePinSet(input: FinancialOfferPinSet): FinancialOfferPinSet {
  return {
    pricingSnapshotIds: canonicalizeIdList(input.pricingSnapshotIds),
    shipmentCostSnapshotIds: canonicalizeIdList(input.shipmentCostSnapshotIds),
    currencyCode: String(input.currencyCode ?? '').trim(),
  };
}

export function pinSetsEqual(a: FinancialOfferPinSet, b: FinancialOfferPinSet): boolean {
  const left = canonicalizePinSet(a);
  const right = canonicalizePinSet(b);
  return (
    left.currencyCode === right.currencyCode &&
    left.pricingSnapshotIds.join('\0') === right.pricingSnapshotIds.join('\0') &&
    left.shipmentCostSnapshotIds.join('\0') === right.shipmentCostSnapshotIds.join('\0')
  );
}

export function assertHomogeneousOfferCurrency(currencyCodes: string[]): { ok: true; currencyCode: string } | { ok: false } {
  const unique = [...new Set(currencyCodes.map((code) => String(code ?? '').trim()).filter(Boolean))];
  if (unique.length !== 1) return { ok: false };
  return { ok: true, currencyCode: unique[0] };
}

export function isVipFastTrack(processCode: string | null | undefined): boolean {
  return processCode === 'VIP_FAST_TRACK';
}

export function idListsMatch(expected: string[], supplied: unknown): boolean {
  if (supplied === undefined || supplied === null) return true;
  if (!Array.isArray(supplied)) return false;
  return canonicalizeIdList(expected).join('\0') === canonicalizeIdList(supplied).join('\0');
}
