/**
 * Documents badge: uploaded files plus a generated commercial offer and TDS when the inquiry already has a price or quotation.
 * An uploaded technical offer is not counted twice as a generated TDS.
 */
export function countInquiryWorkspaceDocuments(inquiry: {
  attachments?: readonly unknown[] | null;
  quotations?: readonly unknown[] | null;
  commercialProductsTotal?: number | string | null;
  lines?: ReadonlyArray<{
    attachments?: ReadonlyArray<{ kind?: string | null }> | null;
  }> | null;
}): number {
  const uploads =
    (inquiry.attachments?.length || 0) +
    (inquiry.lines || []).reduce((sum, line) => sum + (line.attachments?.length || 0), 0);
  const pricedAmount = Number(inquiry.commercialProductsTotal);
  const priced =
    inquiry.commercialProductsTotal != null &&
    inquiry.commercialProductsTotal !== '' &&
    Number.isFinite(pricedAmount);
  const hasOffer = (inquiry.quotations?.length || 0) > 0 || priced;
  const hasUploadedTds = (inquiry.lines || []).some((line) =>
    (line.attachments || []).some(
      (attachment) => attachment.kind === 'TECHNICAL_OFFER' || attachment.kind === 'TDS'
    )
  );
  const generatedOffer = hasOffer ? 1 : 0;
  const generatedTds = hasOffer && !hasUploadedTds ? 1 : 0;
  return uploads + generatedOffer + generatedTds;
}
