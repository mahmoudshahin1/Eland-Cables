import assert from 'node:assert/strict';
import { after, describe, it } from 'node:test';
import dotenv from 'dotenv';
import {
  buildIssuedCommercialOfferDocument,
  commercialOfferHeading,
  draftOfferDisclaimer,
} from '../domain/commercialOfferDocument';
import { V2_QUOTATION_WORKFLOW_CHANNEL } from '../domain/v2QuotationService';
import type { RequestActor } from './auth';
import { disconnectPrisma, getPrisma } from './db';
import { generateV2QuotationPdf } from './v2QuotationPdfService';

dotenv.config();

const internalActor: RequestActor = {
  id: 'draft-offer-test',
  email: 'draft-offer@test.local',
  name: 'Draft Offer Test',
  userType: 'internal',
  permissionCodes: ['INQUIRY:VIEW'],
};

const customerActor: RequestActor = {
  id: 'draft-offer-customer',
  email: 'customer@test.local',
  name: 'Customer',
  userType: 'customer',
  customerId: 'not-the-owner',
};

function snapshotState(row: {
  status: string;
  issuedAt: Date | null;
  versionNo: number;
  commercialOfferSnapshot: unknown;
  commercialOfferStatus: string;
  inquiry: { status: string };
}) {
  return {
    status: row.status,
    issuedAt: row.issuedAt ? row.issuedAt.toISOString() : null,
    versionNo: row.versionNo,
    commercialOfferStatus: row.commercialOfferStatus,
    inquiryStatus: row.inquiry.status,
    snapshot: JSON.stringify(row.commercialOfferSnapshot ?? null),
  };
}

describe('draft commercial offer', () => {
  after(async () => {
    await disconnectPrisma();
  });

  it('labels a draft and keeps an issued document official', () => {
    const issued = buildIssuedCommercialOfferDocument({
      quotationNumber: 'Q-DRAFT',
      versionNo: 1,
      currency: 'USD',
      issuedAt: new Date('2026-09-22T08:00:00.000Z'),
      customerName: 'Example Buyer',
      customerReference: 'PO-1',
      lines: [
        {
          lineNumber: 1,
          itemDescription: 'Cable',
          moqKm: 1,
          quantityUom: 'KM',
          cuWeightKgPerKm: 12,
          alWeightKgPerKm: null,
          unitSellingPrice: 10,
          lineTotal: 10,
        },
      ],
    });
    assert.equal(issued.draft, false);
    assert.equal(commercialOfferHeading(issued.draft), 'COMMERCIAL OFFER');
    const draft = { ...issued, draft: true as const };
    assert.equal(commercialOfferHeading(draft.draft), 'DRAFT COMMERCIAL OFFER');
    assert.match(draftOfferDisclaimer(), /not an official issued quotation/i);
    const lineKeys = Object.keys(draft.lines[0]);
    assert.equal(lineKeys.includes('unitCost'), false);
    assert.equal(lineKeys.includes('totalCost'), false);
    assert.equal(lineKeys.includes('margin'), false);
    assert.equal(lineKeys.includes('marginPercent'), false);
  });

  it('generates a draft from the current quotation without freezing, emailing, or changing status', async () => {
    const prisma = getPrisma();
    assert.ok(prisma, 'database is required for the draft offer test');

    const quotation = await prisma.commercialQuotation.findFirst({
      where: { isCurrent: true, workflowChannel: V2_QUOTATION_WORKFLOW_CHANNEL },
      orderBy: { createdAt: 'desc' },
      include: { inquiry: { select: { status: true } } },
    });
    assert.ok(quotation, 'a current V2 quotation is required');

    const before = snapshotState(quotation);
    const revisionCount = await prisma.commercialQuotation.count({
      where: { quotationNumber: quotation.quotationNumber },
    });
    const emailCount = await prisma.emailOutbox.count();
    const commitmentCount = await prisma.commercialCommitment.count({
      where: { quotationId: quotation.id },
    });

    const doc = await generateV2QuotationPdf(quotation.id, internalActor, { draft: true });

    assert.match(doc.html, /DRAFT COMMERCIAL OFFER/);
    assert.match(doc.html, /not an official issued quotation/i);
    assert.equal(/unit cost|total cost|margin/i.test(doc.html), false);
    assert.equal((doc.commercialOffer as { draft?: boolean }).draft, true);
    // pdfkit stores the heading as hex text: DRAFT COMMERCIAL OFFER
    assert.ok(doc.pdf.includes(Buffer.from('445241465420434f4d4d45524349414c204f46464552')));

    await assert.rejects(
      () => generateV2QuotationPdf(quotation.id, customerActor, { draft: true }),
      (err: unknown) => (err as { code?: string }).code === 'UNAUTHORIZED'
    );

    if (!quotation.issuedAt) {
      await assert.rejects(
        () => generateV2QuotationPdf(quotation.id, internalActor),
        (err: unknown) => (err as { code?: string }).code === 'BUSINESS_RULE_REQUIRED'
      );
    } else if (quotation.commercialOfferSnapshot) {
      const official = await generateV2QuotationPdf(quotation.id, internalActor);
      assert.equal(/DRAFT COMMERCIAL OFFER/.test(official.html), false);
      assert.match(official.html, /COMMERCIAL OFFER/);
    }

    const after = await prisma.commercialQuotation.findUniqueOrThrow({
      where: { id: quotation.id },
      include: { inquiry: { select: { status: true } } },
    });
    assert.deepEqual(snapshotState(after), before);
    assert.equal(
      await prisma.commercialQuotation.count({ where: { quotationNumber: quotation.quotationNumber } }),
      revisionCount
    );
    assert.equal(await prisma.emailOutbox.count(), emailCount);
    assert.equal(
      await prisma.commercialCommitment.count({ where: { quotationId: quotation.id } }),
      commitmentCount
    );

    const issued = await prisma.commercialQuotation.findFirst({
      where: { workflowChannel: V2_QUOTATION_WORKFLOW_CHANNEL, issuedAt: { not: null } },
      orderBy: { issuedAt: 'desc' },
      include: { inquiry: { select: { status: true } } },
    });
    if (!issued) return;
    const issuedBefore = snapshotState(issued);
    if (issued.commercialOfferSnapshot) {
      const official = await generateV2QuotationPdf(issued.id, internalActor);
      assert.equal(/DRAFT COMMERCIAL OFFER/.test(official.html), false);
      assert.match(official.html, /COMMERCIAL OFFER/);
    } else {
      await assert.rejects(
        () => generateV2QuotationPdf(issued.id, internalActor),
        (err: unknown) =>
          (err as { code?: string; message?: string }).code === 'BUSINESS_RULE_REQUIRED' &&
          /snapshot is missing/i.test(String((err as { message?: string }).message))
      );
    }
    const issuedAfter = await prisma.commercialQuotation.findUniqueOrThrow({
      where: { id: issued.id },
      include: { inquiry: { select: { status: true } } },
    });
    assert.deepEqual(snapshotState(issuedAfter), issuedBefore);
  });
});
