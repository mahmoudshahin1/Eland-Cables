import { Prisma } from '@prisma/client';
import {
  ATTACHMENT_SOURCE_MANUAL,
  LINE_ATTACHMENT_KIND_TECHNICAL_OFFER,
} from '../domain/inquiryLineAttachments';
import { getPrisma } from './db';

/**
 * Test-only: strip any inherited market-metal header rates from a single inquiry's own metadata.
 *
 * `createInquiry` copies whatever ACTIVE `MarketMetalPriceDefault` rows exist in the shared DB onto the
 * new inquiry header (see `applySystemMarketMetalDefaultsOnCreate`). Tests that must assert the
 * "copper/aluminium rate required" submit gate therefore depend on the ABSENCE of those rates, which is
 * residual state left behind by sibling suites. This helper resets only the target inquiry's own row so
 * the precondition is deterministic regardless of suite ordering. It does not change any business logic.
 */
export async function clearInquiryHeaderMetalRates(inquiryId: string): Promise<void> {
  const prisma = getPrisma();
  if (!prisma) throw new Error('PostgreSQL is not configured or not reachable.');
  const inquiry = await prisma.commercialInquiry.findFirst({
    where: { OR: [{ id: inquiryId }, { inquiryNumber: inquiryId }] },
  });
  if (!inquiry) throw new Error(`Inquiry ${inquiryId} not found.`);
  const meta =
    inquiry.commercialMetadata && typeof inquiry.commercialMetadata === 'object' && !Array.isArray(inquiry.commercialMetadata)
      ? { ...(inquiry.commercialMetadata as Record<string, unknown>) }
      : {};
  for (const key of [
    'copperPriceRate',
    'copperPriceUom',
    'copperPriceSource',
    'copperPriceCurrency',
    'aluminiumPriceRate',
    'aluminiumPriceUom',
    'aluminiumPriceSource',
    'aluminiumPriceCurrency',
  ]) {
    delete meta[key];
  }
  await prisma.commercialInquiry.update({
    where: { id: inquiry.id },
    data: { commercialMetadata: meta as Prisma.InputJsonValue },
  });
}

/** Test-only: attach a Technical Offer on every line so submitInquiry can pass the production guard. */
export async function attachTechnicalOfferToAllInquiryLines(inquiryId: string): Promise<void> {
  const prisma = getPrisma();
  if (!prisma) throw new Error('PostgreSQL is not configured or not reachable.');
  const lines = await prisma.commercialInquiryLine.findMany({ where: { inquiryId } });
  const content = Buffer.from('test-technical-offer');
  for (const line of lines) {
    const existing = await prisma.commercialInquiryLineAttachment.findFirst({
      where: { inquiryLineId: line.id, kind: LINE_ATTACHMENT_KIND_TECHNICAL_OFFER },
    });
    if (existing) continue;
    await prisma.commercialInquiryLineAttachment.create({
      data: {
        inquiryLineId: line.id,
        kind: LINE_ATTACHMENT_KIND_TECHNICAL_OFFER,
        fileName: 'technical-offer.pdf',
        mimeType: 'application/pdf',
        byteSize: content.length,
        content,
        source: ATTACHMENT_SOURCE_MANUAL,
        uploadedBy: 'test',
      },
    });
  }
}
