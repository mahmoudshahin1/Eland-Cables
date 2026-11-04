import { isV2InquiryMetadata } from './v2InquiryWorkflow';

/** VIP sales sign-off can accept a calculated price. Standard quotations stay blocked until PRICING_APPROVED. */
export function vipSalesReleaseAcceptsCalculatedPrice(input: {
  commercialPricingStatus: string | null | undefined;
  inquiryMetadata: unknown;
}): boolean {
  return input.commercialPricingStatus === 'PRICING_CALCULATED' && isV2InquiryMetadata(input.inquiryMetadata);
}
