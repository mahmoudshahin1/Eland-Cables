import assert from 'node:assert/strict';
import { describe, it, before, after } from 'node:test';
import dotenv from 'dotenv';
import { checkDatabase, disconnectPrisma, getPrisma } from './db';
import {
  addInquiryLine,
  createInquiry,
  createQuotationFromInquiry,
  createQuotationRevision,
  getQuotationById,
} from './commercialRepository';
import { deleteCommercialInquiriesMatching } from './commercialTestCleanup';

dotenv.config();

/**
 * Number-only getQuotationById returns the original revision (lowest versionNo).
 * A versionNo or a row id returns that revision only. A missing price is not borrowed.
 */
describe('Quotation revision lookup', () => {
  const actor = {
    id: 'u-revlookup-sales',
    name: 'Revision Lookup',
    email: 'revlookup@energya.local',
    userType: 'internal' as const,
    permissions: { salesQuotations: true },
  };
  const customerId = 'cust-revlookup-fixture';

  let singleNumber = '';
  let pairedNumber = '';
  let pairedV1Id = '';
  let pairedV2Id = '';
  let missingNumber = '';

  before(async () => {
    const health = await checkDatabase();
    assert.equal(health.ok, true, health.error);
    const prisma = getPrisma();
    assert.ok(prisma);
    await deleteCommercialInquiriesMatching(prisma, { customerId });

    singleNumber = await seedPricedQuotation(prisma, 'SINGLE', 111);
    const paired = await seedPricedQuotation(prisma, 'PAIRED', 111);
    pairedNumber = paired;
    const v1 = await getQuotationById(pairedNumber);
    assert.ok(v1);
    pairedV1Id = v1.id;
    await prisma.commercialPricingSnapshot.create({
      data: snapshotData(v1.id, v1.lines[0].id, pairedNumber, 1, 111),
    });

    const revised = await createQuotationRevision(pairedNumber, { remarks: 'V2 priced revision' }, actor);
    pairedV2Id = revised.id;
    const v2Line = await prisma.commercialQuotationLine.findFirst({
      where: { quotationId: revised.id },
      orderBy: { lineNumber: 'asc' },
    });
    assert.ok(v2Line);
    const v2Snap = await prisma.commercialPricingSnapshot.create({
      data: snapshotData(revised.id, v2Line.id, pairedNumber, 2, 222),
    });
    await prisma.commercialQuotationLine.update({
      where: { id: v2Line.id },
      data: { sellingPrice: 222, pricingSnapshotId: v2Snap.id },
    });
    await prisma.commercialQuotation.update({
      where: { id: revised.id },
      data: { workflowChannel: 'V2_CONFIGURATION', sellingPrice: 222 },
    });

    missingNumber = await seedPricedQuotation(prisma, 'MISSING', 333);
    const missingV1 = await getQuotationById(missingNumber);
    assert.ok(missingV1);
    await prisma.commercialPricingSnapshot.create({
      data: snapshotData(missingV1.id, missingV1.lines[0].id, missingNumber, 1, 333),
    });
    await prisma.commercialQuotationLine.update({
      where: { id: missingV1.lines[0].id },
      data: { sellingPrice: 333 },
    });
    await createQuotationRevision(missingNumber, { remarks: 'V2 without a pricing snapshot' }, actor);
  });

  after(async () => {
    const prisma = getPrisma();
    if (prisma) await deleteCommercialInquiriesMatching(prisma, { customerId });
    await disconnectPrisma();
  });

  it('one revision returns that revision selling price', async () => {
    const quotation = await getQuotationById(singleNumber);
    assert.equal(priceOf(quotation), 111);
    assert.equal(quotation?.versionNo, 1);
  });

  it('multiple revisions: number-only returns the original, and each versionNo returns its own price', async () => {
    const original = await getQuotationById(pairedNumber);
    const older = await getQuotationById(pairedNumber, { versionNo: 1 });
    const latest = await getQuotationById(pairedNumber, { versionNo: 2 });
    assert.equal(original?.versionNo, 1);
    assert.equal(priceOf(original), 111);
    assert.equal(priceOf(older), 111);
    assert.equal(priceOf(latest), 222);
  });

  it('Version A and V2 sharing a quotation number each return their own selling price', async () => {
    const versionA = await getQuotationById(pairedV1Id);
    const v2 = await getQuotationById(pairedV2Id);
    assert.equal(versionA?.workflowChannel ?? null, null);
    assert.equal(v2?.workflowChannel, 'V2_CONFIGURATION');
    assert.equal(priceOf(versionA), 111);
    assert.equal(priceOf(v2), 222);
  });

  it('V2 with a pricing snapshot returns that snapshot price', async () => {
    const v2 = await getQuotationById(pairedNumber, { versionNo: 2 });
    const line = v2?.lines[0];
    assert.ok(line?.pricingSnapshot);
    assert.equal(Number(line.pricingSnapshot.finalSellingPrice), 222);
    assert.equal(Number(line.sellingPrice), 222);
  });

  it('older revision does not return the latest selling price', async () => {
    const older = await getQuotationById(pairedNumber, { versionNo: 1 });
    assert.equal(priceOf(older), 111);
    assert.notEqual(priceOf(older), 222);
  });

  it('latest revision does not return the older selling price', async () => {
    const latest = await getQuotationById(pairedNumber, { versionNo: 2 });
    assert.equal(priceOf(latest), 222);
    assert.notEqual(priceOf(latest), 111);
  });

  it('missing snapshot does not borrow another revision selling price', async () => {
    const older = await getQuotationById(missingNumber, { versionNo: 1 });
    const latest = await getQuotationById(missingNumber, { versionNo: 2 });
    assert.equal(priceOf(older), 333);
    assert.equal(priceOf(latest), null);
    assert.equal(latest?.lines[0]?.pricingSnapshot ?? null, null);
  });

  async function seedPricedQuotation(
    prisma: NonNullable<ReturnType<typeof getPrisma>>,
    label: string,
    sellingPrice: number
  ) {
    const inquiry = await createInquiry(
      { customerId, customerName: `Revision Lookup ${label}`, customerReference: `REV-LOOKUP-${label}` },
      actor
    );
    await addInquiryLine(
      inquiry.id,
      { materialNumber: `REV-LOOKUP-${label}`, cableDescription: label, requestedQuantity: 1, requestedLengthMeters: 100 },
      actor
    );
    const quotation = await createQuotationFromInquiry({ inquiryId: inquiry.id }, actor);
    const line = quotation.lines[0];
    assert.ok(line);
    await prisma.commercialQuotationLine.update({
      where: { id: line.id },
      data: { sellingPrice },
    });
    await prisma.commercialQuotation.update({
      where: { id: quotation.id },
      data: { sellingPrice, workflowChannel: null },
    });
    return quotation.quotationNumber;
  }
});

function priceOf(quotation: { lines: Array<{ sellingPrice: unknown }> } | null) {
  const raw = quotation?.lines[0]?.sellingPrice;
  return raw == null ? null : Number(raw);
}

function snapshotData(
  quotationId: string,
  quotationLineId: string,
  quotationNumber: string,
  versionNo: number,
  price: number
) {
  return {
    quotationId,
    quotationLineId,
    quotationNumber,
    versionNo,
    materialNumber: 'REV-LOOKUP',
    materialCost: 50,
    currency: 'USD',
    pricingRuleType: 'GROSS_MARGIN' as const,
    percentageValue: 20,
    baseSellingPrice: price,
    finalSellingPrice: price,
    unitSellingPrice: price,
  };
}
