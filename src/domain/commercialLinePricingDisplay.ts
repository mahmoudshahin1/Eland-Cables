/**
 * Selling-price display for inquiry cable lines.
 * Values come from CommercialPricingSnapshot / FinancialOffer product lines.
 * This module does not compute markup or margin.
 */

export type CommercialPricingState = 'UNPRICED' | 'PRICED' | 'RECALCULATION_REQUIRED';

export interface CommercialLinePricingView {
  commercialPricingState: CommercialPricingState;
  commercialUnitPrice: number | null;
  commercialLineTotal: number | null;
}

export interface CommercialLinePricingInput {
  inquiryQuantity: number;
  inquiryLengthMeters: number;
  inquiryMaterialNumber?: string | null;
  quotationQuantity?: number | null;
  quotationLengthMeters?: number | null;
  quotationMaterialNumber?: string | null;
  unitPrice?: number | null;
  lineTotal?: number | null;
  hasSnapshot: boolean;
}

function num(value: unknown): number | null {
  if (value == null || value === '') return null;
  const n = Number(value);
  return Number.isFinite(n) ? n : null;
}

function close(a: number, b: number): boolean {
  return Math.abs(a - b) < 0.0001;
}

export function resolveCommercialLinePricing(input: CommercialLinePricingInput): CommercialLinePricingView {
  const empty: CommercialLinePricingView = {
    commercialPricingState: 'UNPRICED',
    commercialUnitPrice: null,
    commercialLineTotal: null,
  };
  if (!input.hasSnapshot) return empty;

  const unit = num(input.unitPrice);
  const total = num(input.lineTotal);
  if (unit == null || total == null) return empty;

  const quotedQty = num(input.quotationQuantity);
  const quotedLength = num(input.quotationLengthMeters);
  const qtyMismatch = quotedQty != null && !close(quotedQty, input.inquiryQuantity);
  const lengthMismatch = quotedLength != null && !close(quotedLength, input.inquiryLengthMeters);
  const inquiryMaterial = (input.inquiryMaterialNumber || '').trim();
  const quotedMaterial = (input.quotationMaterialNumber || '').trim();
  const materialMismatch = Boolean(inquiryMaterial && quotedMaterial && inquiryMaterial !== quotedMaterial);

  if (qtyMismatch || lengthMismatch || materialMismatch) {
    return {
      commercialPricingState: 'RECALCULATION_REQUIRED',
      commercialUnitPrice: null,
      commercialLineTotal: null,
    };
  }

  return {
    commercialPricingState: 'PRICED',
    commercialUnitPrice: unit,
    commercialLineTotal: total,
  };
}

export function formatCommercialPriceAmount(
  state: CommercialPricingState | null | undefined,
  amount: number | null | undefined
): string {
  if (state !== 'PRICED' || amount == null || !Number.isFinite(Number(amount))) return '—';
  return Number(amount).toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 });
}

export interface CommercialValueSummary {
  amount: number | null;
  recalculationRequired: boolean;
}

/** Display total already stored on the server. Does not invent a price. */
export function commercialValueSummary(input: {
  productsTotal?: number | null;
  lineStates: CommercialPricingState[];
}): CommercialValueSummary {
  if (input.lineStates.some((state) => state === 'RECALCULATION_REQUIRED')) {
    return { amount: null, recalculationRequired: true };
  }
  if (!input.lineStates.length || input.lineStates.some((state) => state !== 'PRICED')) {
    return { amount: null, recalculationRequired: false };
  }
  const total = num(input.productsTotal);
  if (total == null) return { amount: null, recalculationRequired: false };
  return { amount: total, recalculationRequired: false };
}
