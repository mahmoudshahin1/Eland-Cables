/**
 * Single client-side Grand Total for inquiry and quotation screens.
 *
 * Unit freight matches the previous three call sites:
 * - Doncaster: 3,100 USD for 20STD, 3,300 USD otherwise
 * - Rotterdam: 1,800 USD for 20STD, 2,000 USD otherwise
 * - Any other destination: `defaultUnitFreightUsd` when supplied (container study
 *   spec estimate), otherwise 3,100 USD for 20STD and 3,300 USD otherwise
 *
 * Freight is still calculated in the browser. There is no persisted Grand Total field.
 */

export interface InquiryCommercialTotals {
  productsTotal: number | null;
  freightTotal: number | null;
  grandTotal: number | null;
}

export function unitSeaFreightUsd(
  containerType?: string | null,
  destination?: string | null,
  defaultUnitFreightUsd?: number | null
): number {
  const type = (containerType || '40HQ').toUpperCase();
  const dest = (destination || '').toUpperCase();
  const is20 = type === '20STD';
  if (dest.includes('ROTTERDAM')) return is20 ? 1800 : 2000;
  if (dest.includes('DONCASTER')) return is20 ? 3100 : 3300;
  if (defaultUnitFreightUsd != null && Number.isFinite(defaultUnitFreightUsd)) {
    return defaultUnitFreightUsd;
  }
  return is20 ? 3100 : 3300;
}

/** Customer-submitted line prices, used when the inquiry has no stored products subtotal yet. */
export function resolveSubmittedProductsTotal(input: {
  commercialProductsTotal?: number | string | null;
  lines?: Array<{
    commercialLineTotal?: number | string | null;
    sellingPrice?: number | string | null;
  }> | null;
}): number | null {
  const direct = Number(input.commercialProductsTotal);
  if (
    input.commercialProductsTotal != null &&
    input.commercialProductsTotal !== '' &&
    Number.isFinite(direct)
  ) {
    return direct;
  }
  let sum = 0;
  let any = false;
  for (const line of input.lines || []) {
    const raw = line.commercialLineTotal ?? line.sellingPrice;
    const amount = Number(raw);
    if (raw != null && raw !== '' && Number.isFinite(amount)) {
      sum += amount;
      any = true;
    }
  }
  return any ? sum : null;
}

export function resolveInquiryCommercialTotals(input: {
  productsTotal?: number | string | null;
  containerType?: string | null;
  destination?: string | null;
  containerCount?: number | null;
  defaultUnitFreightUsd?: number | null;
}): InquiryCommercialTotals {
  const products = Number(input.productsTotal);
  if (input.productsTotal == null || input.productsTotal === '' || !Number.isFinite(products)) {
    return { productsTotal: null, freightTotal: null, grandTotal: null };
  }
  const count = Math.max(1, Math.floor(Number(input.containerCount) || 1));
  const freightTotal =
    unitSeaFreightUsd(input.containerType, input.destination, input.defaultUnitFreightUsd) * count;
  return {
    productsTotal: products,
    freightTotal,
    grandTotal: products + freightTotal,
  };
}
