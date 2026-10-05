export interface QuotationIssuedEmailInput {
  customerName: string;
  quotationNumber: string;
  revision: number;
  total: number | null;
  currency: string;
  validityLabel: string;
  portalLink: string;
}

export function buildQuotationIssuedEmail(input: QuotationIssuedEmailInput): { subject: string; bodyText: string } {
  const total =
    input.total == null || !Number.isFinite(input.total)
      ? '—'
      : `${input.total.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })} ${input.currency}`;
  const subject = `Quotation ${input.quotationNumber} revision ${input.revision}`;
  const bodyText = [
    `Customer: ${input.customerName}`,
    `Quotation number: ${input.quotationNumber}`,
    `Revision: ${input.revision}`,
    `Total: ${total}`,
    `Currency: ${input.currency}`,
    `Validity: ${input.validityLabel}`,
    `Portal: ${input.portalLink}`,
  ].join('\n');
  return { subject, bodyText };
}

export function quotationPortalLink(inquiryId: string, baseUrl?: string | null): string {
  const path = `/customer/inquiries/${encodeURIComponent(inquiryId)}`;
  const base = (baseUrl || '').trim().replace(/\/$/, '');
  return base ? `${base}${path}` : path;
}

/** Email failure must not surface to the issuer. */
export async function runEmailWithoutRollback(send: () => Promise<unknown>): Promise<boolean> {
  try {
    await send();
    return true;
  } catch (err) {
    console.warn('[email] quotation issued enqueue failed — quotation remains issued', err);
    return false;
  }
}
