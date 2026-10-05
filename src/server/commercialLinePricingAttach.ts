/**
 * Attach server selling-price display fields onto an inquiry payload.
 * Does not persist and does not calculate markup.
 */

import { getPrisma } from './db';
import {
  commercialValueSummary,
  resolveCommercialLinePricing,
  type CommercialPricingState,
} from '../domain/commercialLinePricingDisplay';

function num(value: unknown): number | null {
  if (value == null || value === '') return null;
  const n = Number(value);
  return Number.isFinite(n) ? n : null;
}

type InquiryLineRow = {
  id: string;
  requestedQuantity?: unknown;
  requestedLengthMeters?: unknown;
  materialNumber?: string | null;
  [key: string]: unknown;
};

export async function attachInquiryCommercialPricing<T extends { id: string; lines?: InquiryLineRow[] | null }>(
  inquiry: T
): Promise<T & { commercialProductsTotal: number | null; commercialValueState: CommercialPricingState }> {
  const lines = inquiry.lines || [];
  const blank = lines.map((line) => ({
    ...line,
    commercialPricingState: 'UNPRICED' as CommercialPricingState,
    commercialUnitPrice: null,
    commercialLineTotal: null,
  }));

  const prisma = getPrisma();
  if (!prisma || lines.length === 0) {
    return { ...inquiry, lines: blank, commercialProductsTotal: null, commercialValueState: 'UNPRICED' };
  }

  const [quotation, offer] = await Promise.all([
    prisma.commercialQuotation.findFirst({
      where: { inquiryId: inquiry.id, isCurrent: true },
      include: { lines: { include: { pricingSnapshot: true } } },
    }),
    prisma.financialOfferSnapshot.findFirst({
      where: { inquiryId: inquiry.id, isCurrent: true },
      include: { productLines: true },
    }),
  ]);

  const quoteByLine = new Map((quotation?.lines || []).map((line) => [line.inquiryLineId, line]));
  const offerByLine = new Map((offer?.productLines || []).map((line) => [line.inquiryLineId, line]));

  const pricedLines = lines.map((line) => {
    const quote = quoteByLine.get(line.id);
    const product = offerByLine.get(line.id);
    const snapshot = quote?.pricingSnapshot;
    const unit = product?.unitPrice ?? snapshot?.unitSellingPrice;
    const total = product?.lineTotal ?? snapshot?.finalSellingPrice;
    const view = resolveCommercialLinePricing({
      inquiryQuantity: num(line.requestedQuantity) ?? 0,
      inquiryLengthMeters: num(line.requestedLengthMeters) ?? 0,
      inquiryMaterialNumber: line.materialNumber,
      quotationQuantity: quote ? num(quote.quantity) : product ? num(product.quantity) : null,
      quotationLengthMeters: quote
        ? num(quote.plannedLengthM ?? quote.lengthMeters)
        : product
          ? num(product.lengthMeters)
          : null,
      quotationMaterialNumber: quote?.materialNumber ?? product?.materialNumber,
      unitPrice: unit == null ? null : num(unit),
      lineTotal: total == null ? null : num(total),
      hasSnapshot: Boolean(snapshot || product),
    });
    return { ...line, ...view };
  });

  const summary = commercialValueSummary({
    productsTotal: offer ? num(offer.productsTotal) : null,
    lineStates: pricedLines.map((line) => line.commercialPricingState),
  });

  return {
    ...inquiry,
    lines: pricedLines,
    commercialProductsTotal: summary.amount,
    commercialValueState: summary.recalculationRequired ? 'RECALCULATION_REQUIRED' : summary.amount == null ? 'UNPRICED' : 'PRICED',
  };
}
