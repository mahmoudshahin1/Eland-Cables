/**
 * Commercial offer document from the issued snapshot.
 * HTML remains available for print. Default download is a PDF.
 */

import type { RequestActor } from './auth';
import { writeAudit } from './identityService';
import { buildCurrentCommercialOfferDocument, getV2QuotationById } from './v2QuotationRepository';
import { isQuotationIssued } from '../domain/v2QuotationService';
import { renderCommercialOfferPdf } from './commercialOfferPdfRenderer';
import {
  commercialOfferHeading,
  draftOfferDisclaimer,
  formatDocumentMoney,
  formatDocumentNumber,
  hydrateCommercialOfferDocument,
  presentText,
  readIssuedCommercialOffer,
  type IssuedCommercialOfferDocument,
} from '../domain/commercialOfferDocument';
import { ENERGYA_COMMERCIAL_OFFER_TEMPLATE } from '../domain/commercialOfferTemplate';

export interface V2QuotationPdfDocument {
  quotationNumber: string;
  versionNo: number;
  issuedAt: string;
  validUntil: string | null;
  currency: string;
  technicalOffer: unknown;
  commercialOffer: unknown;
  html: string;
  pdf: Buffer;
  contentType: 'application/pdf';
}

function escapeHtml(value: unknown): string {
  return String(value ?? '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

function offerFromQuotation(quotation: { commercialOfferSnapshot?: unknown }): IssuedCommercialOfferDocument | null {
  const frozen = readIssuedCommercialOffer(quotation.commercialOfferSnapshot);
  if (!frozen) return null;
  return hydrateCommercialOfferDocument(frozen);
}

function renderHtml(offerInput: IssuedCommercialOfferDocument): string {
  const offer = hydrateCommercialOfferDocument(offerInput);
  const rows = offer.lines
    .map(
      (line) => `<tr>
        <td>${escapeHtml(line.lineNumber)}</td>
        <td>${escapeHtml(presentText(line.itemDescription))}</td>
        <td>${escapeHtml(formatDocumentNumber(line.moqKm, 3))}</td>
        <td>${escapeHtml(formatDocumentNumber(line.cuWeightKgPerKm, 0))}</td>
        <td>${escapeHtml(formatDocumentNumber(line.alWeightKgPerKm, 0))}</td>
        <td>${escapeHtml(formatDocumentMoney(line.unitSellingPrice, offer.currency))}</td>
        <td>${escapeHtml(formatDocumentMoney(line.lineTotal, offer.currency))}</td>
      </tr>`
    )
    .join('');
  const terms = offer.terms
    .map((term, index) => `<h3>2.${index + 1} ${escapeHtml(term.title)}</h3><p>${escapeHtml(term.text)}</p>`)
    .join('');
  const heading = commercialOfferHeading(offer.draft);
  const banner = offer.draft
    ? `<p style="color:#C8102E;font-weight:bold">${escapeHtml(draftOfferDisclaimer())}</p>`
    : '';
  const company = offer.company;
  return `<!DOCTYPE html><html><head><meta charset="utf-8"><title>${escapeHtml(heading)} ${escapeHtml(offer.quotationNumber)} REV.${offer.versionNo}</title>
    <style>
      body { font-family: Arial, Helvetica, sans-serif; color: #0B3D6E; }
      h1 { color: #0B3D6E; letter-spacing: 0.04em; }
      table { border-collapse: collapse; width: 100%; }
      th { background: #0B3D6E; color: white; text-align: left; padding: 6px; }
      td { border-bottom: 1px solid #d5dde8; padding: 6px; }
      .rule { border-top: 4px solid #C8102E; }
    </style></head><body>
    <div class="rule"></div>
    <p>${escapeHtml(company.legalName)} · ${escapeHtml(company.addressLines.join(', '))} · Tel: ${escapeHtml(company.telephone)} · ${escapeHtml(company.website)}</p>
    <h1>${escapeHtml(heading)}</h1>
    <p>${escapeHtml(ENERGYA_COMMERCIAL_OFFER_TEMPLATE.subtitle)}</p>
    ${banner}
    <p>Quotation No. ${escapeHtml(presentText(offer.quotationNumber))} REV.${escapeHtml(offer.versionNo)} · Date ${escapeHtml(offer.generatedAt.slice(0, 10))} · Validity ${escapeHtml(presentText(offer.validityLabel))}</p>
    <p>To ${escapeHtml(presentText(offer.customer.customerName))}<br/>Attn: ${escapeHtml(presentText(offer.customer.contactPerson))}<br/>Your Ref.: ${escapeHtml(presentText(offer.customer.customerReference))}</p>
    <p>From ${escapeHtml(presentText(offer.from.name))} · ${escapeHtml(presentText(offer.from.title))}</p>
    <p>${escapeHtml(offer.greeting.salutation)} ${escapeHtml(offer.greeting.body)}</p>
    <table><thead><tr><th>#</th><th>Description</th><th>MOQ (Km)</th><th>CU Weight (kg/km)</th><th>AL Weight (kg/km)</th><th>Unit Price (${escapeHtml(offer.currency)}/Km)</th><th>Total Value (${escapeHtml(offer.currency)})</th></tr></thead><tbody>${rows}</tbody></table>
    <p>${escapeHtml(offer.productsTotalLabel)} ${escapeHtml(formatDocumentMoney(offer.productsTotal, offer.currency))}</p>
    <p>${escapeHtml(presentText(offer.shippingLabel))} ${escapeHtml(formatDocumentMoney(offer.shipmentTotal, offer.currency))}</p>
    <p><strong>${escapeHtml(presentText(offer.grandTotalLabel))} ${escapeHtml(formatDocumentMoney(offer.grandTotal, offer.currency))}</strong></p>
    <h2>2. TERMS &amp; CONDITIONS</h2>
    ${terms}
    <p>Formula: ${escapeHtml(offer.priceAdjustment.formula)}</p>
    <p>${escapeHtml(offer.footer.pillars.map((p) => `${p.title} ${p.subtitle}`).join(' · '))}</p>
    <p>${escapeHtml(offer.footer.sloganLines.join(' '))}</p>
    </body></html>`;
}

function packOffer(
  offer: IssuedCommercialOfferDocument,
  quotation: { issuedAt?: Date | null; technicalOfferSnapshot?: unknown },
  html: string,
  pdf: Buffer
): V2QuotationPdfDocument {
  return {
    quotationNumber: offer.quotationNumber,
    versionNo: offer.versionNo,
    issuedAt: quotation.issuedAt ? quotation.issuedAt.toISOString() : offer.generatedAt,
    validUntil: offer.validUntil,
    currency: offer.currency,
    technicalOffer: quotation.technicalOfferSnapshot,
    commercialOffer: offer,
    html,
    pdf,
    contentType: 'application/pdf',
  };
}

async function auditOfferGeneration(input: {
  actor: RequestActor;
  quotation: {
    id: string;
    inquiryId: string;
    quotationNumber: string;
    versionNo: number;
  };
  offer: IssuedCommercialOfferDocument;
  draft: boolean;
}) {
  await writeAudit({
    actor: input.actor,
    entity: 'CommercialQuotation',
    entityId: input.quotation.id,
    action: input.draft ? 'EXPORT_DRAFT_COMMERCIAL_OFFER' : 'EXPORT_COMMERCIAL_OFFER',
    message: `${input.draft ? 'Draft' : 'Final'} commercial offer generated`,
    newValue: {
      inquiryId: input.quotation.inquiryId,
      quotationId: input.quotation.id,
      quotationNumber: input.quotation.quotationNumber,
      revision: input.quotation.versionNo,
      documentType: 'COMMERCIAL_OFFER',
      generatedAt: new Date().toISOString(),
      snapshotRef: input.offer.financialOfferSnapshotId,
      draft: input.draft,
    },
  });
}

export async function generateV2QuotationPdf(
  quotationId: string,
  actor: RequestActor,
  options?: { draft?: boolean }
): Promise<V2QuotationPdfDocument> {
  if (options?.draft) {
    if (actor.userType === 'customer') {
      const err = new Error('Draft commercial offers are internal only.');
      (err as Error & { code: string }).code = 'UNAUTHORIZED';
      throw err;
    }
    const offer = hydrateCommercialOfferDocument(await buildCurrentCommercialOfferDocument(quotationId, actor));
    const html = renderHtml(offer);
    const pdf = await renderCommercialOfferPdf(offer);
    const quotation = await getV2QuotationById(quotationId, actor);
    await auditOfferGeneration({ actor, quotation, offer, draft: true });
    return packOffer(offer, quotation, html, pdf);
  }

  const quotation = await getV2QuotationById(quotationId, actor);
  if (!isQuotationIssued(quotation)) {
    const err = new Error('PDF is only available for issued quotations.');
    (err as Error & { code: string }).code = 'BUSINESS_RULE_REQUIRED';
    throw err;
  }

  const offer = offerFromQuotation(quotation);
  if (!offer) {
    const err = new Error('Issued commercial offer snapshot is missing.');
    (err as Error & { code: string }).code = 'BUSINESS_RULE_REQUIRED';
    throw err;
  }

  const html = renderHtml(offer);
  const pdf = await renderCommercialOfferPdf(offer);
  await auditOfferGeneration({ actor, quotation, offer, draft: false });
  return packOffer(offer, quotation, html, pdf);
}

export { renderCommercialOfferPdf };
