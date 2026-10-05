import {
  canonicalizeCode,
  dateCovers,
  formatDateOnlyUtc,
  parseDateOnly,
} from './shippingCostCanonical';

export type ShippingRateResolveStatus = 'SELECT' | 'RATE_NOT_FOUND' | 'RATE_AMBIGUOUS';

export interface ShippingRateResolveInput {
  destinationPortCode: unknown;
  incotermCode: unknown;
  containerTypeCode: unknown;
  asOfDate: unknown;
}

export interface ShippingRateMatchRow {
  id: string;
  destinationPortCode: string;
  incotermCode: string;
  containerTypeCode: string;
  rateAmount: number;
  currencyCode: string;
  effectiveFrom: string;
  effectiveTo: string | null;
  active: boolean;
}

export interface ShippingRateResolveResult {
  status: ShippingRateResolveStatus;
  rate: ShippingRateMatchRow | null;
  matchCount: number;
  matchIds: string[];
}

export function normalizeResolveInput(input: ShippingRateResolveInput): {
  destinationPortCode: string;
  incotermCode: string;
  containerTypeCode: string;
  asOfDate: string | null;
} {
  return {
    destinationPortCode: canonicalizeCode(input.destinationPortCode),
    incotermCode: canonicalizeCode(input.incotermCode),
    containerTypeCode: canonicalizeCode(input.containerTypeCode),
    asOfDate: parseDateOnly(input.asOfDate),
  };
}

/**
 * Deterministic applicable-rate selection. Never picks latest / first / highest.
 * Inactive rows are absent. Missing as-of is handled by the caller (do not default).
 */
export function resolveShippingRateFromRows(
  rows: ShippingRateMatchRow[],
  input: ShippingRateResolveInput
): ShippingRateResolveResult {
  const normalized = normalizeResolveInput(input);
  if (
    !normalized.destinationPortCode ||
    !normalized.incotermCode ||
    !normalized.containerTypeCode ||
    !normalized.asOfDate
  ) {
    return { status: 'RATE_NOT_FOUND', rate: null, matchCount: 0, matchIds: [] };
  }

  const matches = rows.filter(
    (row) =>
      row.active &&
      canonicalizeCode(row.destinationPortCode) === normalized.destinationPortCode &&
      canonicalizeCode(row.incotermCode) === normalized.incotermCode &&
      canonicalizeCode(row.containerTypeCode) === normalized.containerTypeCode &&
      dateCovers(normalized.asOfDate!, row.effectiveFrom, row.effectiveTo)
  );

  if (matches.length === 0) {
    return { status: 'RATE_NOT_FOUND', rate: null, matchCount: 0, matchIds: [] };
  }
  if (matches.length > 1) {
    return {
      status: 'RATE_AMBIGUOUS',
      rate: null,
      matchCount: matches.length,
      matchIds: matches.map((row) => row.id),
    };
  }
  return { status: 'SELECT', rate: matches[0], matchCount: 1, matchIds: [matches[0].id] };
}

export function rateRowFromPersistence(row: {
  id: string;
  destinationPortCode: string;
  incotermCode: string;
  containerTypeCode: string;
  rateAmount: { toString(): string } | number | string;
  currencyCode: string;
  effectiveFrom: Date;
  effectiveTo: Date | null;
  active: boolean;
}): ShippingRateMatchRow {
  return {
    id: row.id,
    destinationPortCode: row.destinationPortCode,
    incotermCode: row.incotermCode,
    containerTypeCode: row.containerTypeCode,
    rateAmount: Number(row.rateAmount),
    currencyCode: row.currencyCode,
    effectiveFrom: formatDateOnlyUtc(row.effectiveFrom),
    effectiveTo: row.effectiveTo ? formatDateOnlyUtc(row.effectiveTo) : null,
    active: row.active,
  };
}
