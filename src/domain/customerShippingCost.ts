import { dateCovers, dateRangesOverlap, formatDateOnlyUtc, parseDateOnly } from './shippingCostCanonical';
import { aggregateResultContainerQuantities } from './shipmentCostSnapshotQuantities';

export const SHIPPING_COST_NOT_CONFIGURED = 'SHIPPING_COST_NOT_CONFIGURED';
export const SHIPPING_COST_APPLIED = 'APPLIED';

/** Business labels. Do not invent additional delivery points. */
export const CANONICAL_DELIVERY_POINTS = ['Doncaster/SD or HC', 'Doncaster/RORO', 'Rotterdam'] as const;

/** Business labels. ContainerType master does not store these codes. */
export const CANONICAL_CONTAINER_TYPES = ["20' SD", "40' SD/HC"] as const;

export const ELAND_SHIPPING_EFFECTIVE_FROM = '2026-09-23';

export const ELAND_SHIPPING_COST_SEED = [
  { deliveryPoint: 'Doncaster/SD or HC', incotermCode: 'DAP', containerType: "20' SD", amount: 3100 },
  { deliveryPoint: 'Doncaster/SD or HC', incotermCode: 'DAP', containerType: "40' SD/HC", amount: 3300 },
  { deliveryPoint: 'Doncaster/RORO', incotermCode: 'DAP', containerType: "20' SD", amount: 6400 },
  { deliveryPoint: 'Doncaster/RORO', incotermCode: 'DAP', containerType: "40' SD/HC", amount: 6600 },
  { deliveryPoint: 'Rotterdam', incotermCode: 'CIF', containerType: "20' SD", amount: 1800 },
  { deliveryPoint: 'Rotterdam', incotermCode: 'CIF', containerType: "40' SD/HC", amount: 2000 },
] as const;

export type CustomerShippingRateRow = {
  id: string;
  customerId: string;
  deliveryPoint: string;
  incotermId: string;
  containerType: string;
  amount: number;
  currency: string;
  effectiveFrom: string;
  effectiveTo: string | null;
  status: 'ACTIVE' | 'SUPERSEDED';
  version: number;
};

export type CustomerShippingResolveResult = {
  resolutionCode: string;
  rate: CustomerShippingRateRow | null;
  amount: number | null;
};

export function isCanonicalDeliveryPoint(value: string): boolean {
  return (CANONICAL_DELIVERY_POINTS as readonly string[]).includes(value);
}

export function isCanonicalContainerType(value: string): boolean {
  return (CANONICAL_CONTAINER_TYPES as readonly string[]).includes(value);
}

export type DestinationPortNameRecord = { code: string; name: string };

function canonicalDeliveryPointFromText(value: unknown): string | null {
  const text = String(value ?? '').trim();
  if (!text) return null;
  if (isCanonicalDeliveryPoint(text)) return text;
  const upper = text.toUpperCase();
  return CANONICAL_DELIVERY_POINTS.find((point) => point.toUpperCase() === upper) ?? null;
}

/**
 * Map a saved destination-port code onto the shipping-cost delivery-point grain.
 * Uses DestinationPort master name when provided; does not invent Doncaster/RORO lanes.
 */
export function mapDestinationPortToShippingDeliveryPoint(
  destinationPortCode: string | null | undefined,
  destinationPorts: ReadonlyArray<DestinationPortNameRecord> = []
): string | null {
  const code = String(destinationPortCode ?? '').trim();
  if (!code) return null;
  const port = destinationPorts.find((row) => String(row.code || '').trim().toUpperCase() === code.toUpperCase());
  const fromName = canonicalDeliveryPointFromText(port?.name);
  if (fromName) return fromName;
  return canonicalDeliveryPointFromText(code);
}

/**
 * Map a selected Container Study type onto the CustomerShippingCostRate grain.
 * Does not invent types outside CANONICAL_CONTAINER_TYPES.
 */
export function mapContainerTypeToCanonicalShippingType(value: string | null | undefined): string | null {
  const text = String(value ?? '').trim();
  if (!text) return null;
  if (isCanonicalContainerType(text)) return text;
  const compact = text.toUpperCase().replace(/[\s']/g, '');
  if (compact === '20STD' || compact === '20SD') return "20' SD";
  if (compact === '40STD' || compact === '40HQ' || compact === '40SD/HC' || compact === '40SDHC') return "40' SD/HC";
  return null;
}

export function dayBefore(iso: string): string {
  const [y, m, d] = iso.split('-').map(Number);
  const dt = new Date(Date.UTC(y, m - 1, d));
  dt.setUTCDate(dt.getUTCDate() - 1);
  return formatDateOnlyUtc(dt);
}

/**
 * The version whose effective window covers the date. Historical SUPERSEDED
 * rows stay resolvable for dates inside their closed window. Missing coverage
 * is SHIPPING_COST_NOT_CONFIGURED. Amount stays null here so a rate is never invented.
 */
export function resolveCustomerShippingCostFromRows(
  rows: CustomerShippingRateRow[],
  input: {
    customerId: string;
    deliveryPoint: string;
    incotermId: string;
    containerType: string;
    effectiveDate: string;
  }
): CustomerShippingResolveResult {
  const effectiveDate = parseDateOnly(input.effectiveDate);
  if (!input.customerId || !input.deliveryPoint || !input.incotermId || !input.containerType || !effectiveDate) {
    return { resolutionCode: SHIPPING_COST_NOT_CONFIGURED, rate: null, amount: null };
  }
  const matches = rows.filter(
    (row) =>
      row.customerId === input.customerId &&
      row.deliveryPoint === input.deliveryPoint &&
      row.incotermId === input.incotermId &&
      row.containerType === input.containerType &&
      dateCovers(effectiveDate, row.effectiveFrom, row.effectiveTo) &&
      row.amount > 0
  );
  if (matches.length === 0) {
    return { resolutionCode: SHIPPING_COST_NOT_CONFIGURED, rate: null, amount: null };
  }
  if (matches.length > 1) {
    return { resolutionCode: 'SHIPPING_COST_AMBIGUOUS', rate: null, amount: null };
  }
  return { resolutionCode: SHIPPING_COST_APPLIED, rate: matches[0], amount: matches[0].amount };
}

export function proposedWindowOverlaps(
  existing: Array<{ id?: string; effectiveFrom: string; effectiveTo: string | null }>,
  next: { effectiveFrom: string; effectiveTo: string | null },
  ignoreId?: string
): boolean {
  return existing.some(
    (row) =>
      row.id !== ignoreId &&
      dateRangesOverlap(next.effectiveFrom, next.effectiveTo, row.effectiveFrom, row.effectiveTo)
  );
}

export type ShippingCostFinancialResult = {
  resolutionCode: string;
  amount: number | null;
  currency: string | null;
  shippingCostRateId: string | null;
  shippingRateVersion: number | null;
  deliveryPoint: string | null;
  incotermId: string | null;
  incotermCode: string | null;
  containerType: string | null;
  appliedAt: string | null;
  blocksPacking: false;
};

export function notConfiguredShippingFinancial(partial?: {
  deliveryPoint?: string | null;
  incotermId?: string | null;
  incotermCode?: string | null;
  containerType?: string | null;
}): ShippingCostFinancialResult {
  return {
    resolutionCode: SHIPPING_COST_NOT_CONFIGURED,
    amount: null,
    currency: null,
    shippingCostRateId: null,
    shippingRateVersion: null,
    deliveryPoint: partial?.deliveryPoint ?? null,
    incotermId: partial?.incotermId ?? null,
    incotermCode: partial?.incotermCode ?? null,
    containerType: partial?.containerType ?? null,
    appliedAt: null,
    blocksPacking: false,
  };
}

/**
 * Orchestration/presentation: missing configured rate is amount 0 + NOT_CONFIGURED.
 * Does not invent a rate id or live master amount.
 */
export function presentUnresolvedShippingAsCalculatedZero(
  shipping: ShippingCostFinancialResult
): ShippingCostFinancialResult {
  if (shipping.resolutionCode === SHIPPING_COST_APPLIED && shipping.amount != null && shipping.amount > 0) {
    return { ...shipping, blocksPacking: false };
  }
  return {
    ...shipping,
    amount: 0,
    blocksPacking: false,
  };
}

/** Physical packing stays intact when shipping cost is missing. */
export function presentShippingBesidePacking<T>(packing: T, shipping: ShippingCostFinancialResult): {
  packing: T;
  shippingCostFinancial: ShippingCostFinancialResult;
} {
  return {
    packing,
    shippingCostFinancial: { ...presentUnresolvedShippingAsCalculatedZero(shipping), blocksPacking: false },
  };
}

export type FrozenShippingFacts = {
  amount: number;
  currency: string;
  shippingCostRateId: string;
  shippingRateVersion: number;
  deliveryPoint: string;
  incotermId: string;
  incotermCode: string | null;
  containerType: string;
  appliedAt: string;
};

/**
 * Copies frozen shipping facts onto a commercial-offer document.
 * productsTotal, shipmentTotal, and grandTotal are left as already stored.
 */
export function attachShippingFacts<T extends Record<string, unknown>>(
  document: T,
  facts: FrozenShippingFacts
): T & { shippingCostSnapshot: FrozenShippingFacts } {
  return {
    ...document,
    productsTotal: document.productsTotal,
    shipmentTotal: document.shipmentTotal,
    grandTotal: document.grandTotal,
    shippingCostSnapshot: { ...facts },
  };
}

export function readShippingDeliveryPoint(
  metadata: unknown,
  requestedDestination?: string | null,
  destinationPorts: ReadonlyArray<DestinationPortNameRecord> = []
): string | null {
  const meta = metadata && typeof metadata === 'object' && !Array.isArray(metadata) ? (metadata as Record<string, unknown>) : {};
  for (const value of [meta.shippingDeliveryPoint, meta.deliveryPoint]) {
    const canonical = canonicalDeliveryPointFromText(value);
    if (canonical) return canonical;
  }
  const fromSavedCode = mapDestinationPortToShippingDeliveryPoint(String(meta.destinationPortCode ?? ''), destinationPorts);
  if (fromSavedCode) return fromSavedCode;
  const requested = String(requestedDestination ?? '').trim();
  const fromRequested =
    canonicalDeliveryPointFromText(requested) || mapDestinationPortToShippingDeliveryPoint(requested, destinationPorts);
  if (fromRequested) return fromRequested;
  return canonicalDeliveryPointFromText(meta.deliveryDestination);
}

export function readShippingContainerType(metadata: unknown, preferenceCode?: string | null): string | null {
  const meta = metadata && typeof metadata === 'object' && !Array.isArray(metadata) ? (metadata as Record<string, unknown>) : {};
  const candidates = [meta.shippingContainerType, preferenceCode, meta.containerType, meta.containerTypePreferenceCode];
  for (const value of candidates) {
    const mapped = mapContainerTypeToCanonicalShippingType(String(value ?? ''));
    if (mapped) return mapped;
  }
  return null;
}

export type ContainerStudyShippingLookupGrain = {
  destinationPortCode: string | null;
  incotermCode: string | null;
  deliveryPoint: string | null;
  containerType: string | null;
  containerQuantity: number;
  typeCode: string | null;
};

/** Dest/incoterm copied onto DF-B lineageProvenanceJson. Not first-class snapshot columns. */
export function readLineageShipmentFields(json: unknown): {
  destinationPortCode: string | null;
  incotermCode: string | null;
} {
  const root = json && typeof json === 'object' && !Array.isArray(json) ? (json as Record<string, unknown>) : null;
  if (!root) return { destinationPortCode: null, incotermCode: null };
  const destinationPortCode = String(root.destinationPortCode ?? '').trim() || null;
  const incotermCode = String(root.incotermCode ?? '').trim().toUpperCase() || null;
  return { destinationPortCode, incotermCode };
}

/**
 * Inquiry shipping grain: snapshot lineage dest/incoterm (or LOCKED group) + result type/quantity.
 * Does not read inquiry metadata, customer default, unsaved UI, or group containerTypePreference.
 */
export function resolveShippingLookupFromContainerStudy(input: {
  lineageJson: unknown;
  shipmentGroup?: { status?: string | null; destinationPortCode?: string | null; incotermCode?: string | null } | null;
  resultContainers: Array<{ typeCode?: string | null }>;
  destinationPorts?: ReadonlyArray<DestinationPortNameRecord>;
}): ContainerStudyShippingLookupGrain {
  const lineage = readLineageShipmentFields(input.lineageJson);
  const groupFrozen = String(input.shipmentGroup?.status || '').toUpperCase() === 'LOCKED';
  const destinationPortCode =
    lineage.destinationPortCode ||
    (groupFrozen ? String(input.shipmentGroup?.destinationPortCode || '').trim() || null : null);
  const incotermCode =
    lineage.incotermCode ||
    (groupFrozen ? String(input.shipmentGroup?.incotermCode || '').trim().toUpperCase() || null : null);
  const deliveryPoint = mapDestinationPortToShippingDeliveryPoint(destinationPortCode, input.destinationPorts || []);
  const aggregated = aggregateResultContainerQuantities(input.resultContainers);
  let typeCode: string | null = null;
  let containerQuantity = 0;
  if (aggregated.ok) {
    const primary = [...aggregated.lines].sort(
      (a, b) => b.containerQuantity - a.containerQuantity || a.containerTypeCode.localeCompare(b.containerTypeCode)
    )[0];
    typeCode = primary?.containerTypeCode ?? null;
    containerQuantity = primary?.containerQuantity ?? 0;
  }
  return {
    destinationPortCode,
    incotermCode,
    deliveryPoint,
    containerType: mapContainerTypeToCanonicalShippingType(typeCode),
    containerQuantity,
    typeCode,
  };
}
