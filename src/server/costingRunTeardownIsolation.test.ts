import assert from 'node:assert/strict';
import { after, before, describe, it } from 'node:test';
import dotenv from 'dotenv';
import { checkDatabase, disconnectPrisma, getPrisma } from './db';
import { deleteCostingArtifactsForInquiryLines } from './costingArtifactCleanup';
import { V2_COSTING_WORKFLOW_CHANNEL } from '../domain/v2CostingRequestService';

dotenv.config();

const MATERIAL = 'I4-FIXTURE-EXISTING';

describe('CostingRun test teardown isolation', () => {
  const marker = `cost-iso-${Date.now()}`;
  const keepLineId = `keep-${marker}`;
  const dropLineId = `drop-${marker}`;
  const quoteLineKey = `quote-${marker}`;
  let inquiryId = '';
  let quotationId = '';
  let quotationLineId = '';
  let snapshotId = '';
  let runAId = '';
  let runBId = '';
  let runQId = '';
  let calcAId = '';
  let calcQId = '';

  before(async () => {
    const health = await checkDatabase();
    assert.equal(health.ok, true, health.error);
  });

  after(async () => {
    const prisma = getPrisma();
    if (prisma) {
      if (snapshotId) {
        await prisma.commercialPricingSnapshot.deleteMany({ where: { id: snapshotId } });
      }
      if (quotationLineId) {
        await prisma.commercialQuotationLine.deleteMany({ where: { id: quotationLineId } });
      }
      if (quotationId) {
        await prisma.commercialQuotation.deleteMany({ where: { id: quotationId } });
      }
      if (inquiryId) {
        await prisma.commercialInquiryLine.deleteMany({ where: { inquiryId } });
        await prisma.commercialInquiry.deleteMany({ where: { id: inquiryId } });
      }
      const runIds = [runAId, runQId].filter(Boolean);
      const calcIds = [calcAId, calcQId].filter(Boolean);
      if (runIds.length) {
        await prisma.costingLine.deleteMany({ where: { costingRunId: { in: runIds } } });
        await prisma.costingRun.deleteMany({ where: { id: { in: runIds } } });
      }
      if (calcIds.length) {
        await prisma.costingCalculationSnapshot.deleteMany({ where: { calculationId: { in: calcIds } } });
        await prisma.costingCalculation.deleteMany({ where: { id: { in: calcIds } } });
      }
    }
    await disconnectPrisma();
  });

  it('removes only the test line and leaves a neighboring run, quotation link, and pricing snapshot', async () => {
    const prisma = getPrisma()!;
    const inquiry = await prisma.commercialInquiry.create({
      data: {
        inquiryNumber: `INQ-${marker}`,
        customerId: `iso-${marker}`,
        customerName: 'Isolation fixture',
        projectName: `Isolation ${marker}`,
      },
    });
    inquiryId = inquiry.id;

    const runA = await prisma.costingRun.create({
      data: {
        costingRunNumber: `CR-A-${marker}`,
        materialNumber: MATERIAL,
        materialCost: 29.85,
        inquiryLineId: keepLineId,
        costingDate: new Date(),
        isCurrent: true,
      },
    });
    runAId = runA.id;
    const calcA = await prisma.costingCalculation.create({
      data: {
        calculationNumber: `CC-A-${marker}`,
        costingDate: new Date(),
        inquiryLineId: keepLineId,
        workflowChannel: V2_COSTING_WORKFLOW_CHANNEL,
        status: 'LOCKED',
        materialNumber: MATERIAL,
      },
    });
    calcAId = calcA.id;

    const runQ = await prisma.costingRun.create({
      data: {
        costingRunNumber: `CR-Q-${marker}`,
        materialNumber: MATERIAL,
        materialCost: 41,
        inquiryLineId: quoteLineKey,
        costingDate: new Date(),
        isCurrent: true,
      },
    });
    runQId = runQ.id;
    const calcQ = await prisma.costingCalculation.create({
      data: {
        calculationNumber: `CC-Q-${marker}`,
        costingDate: new Date(),
        inquiryLineId: quoteLineKey,
        workflowChannel: V2_COSTING_WORKFLOW_CHANNEL,
        status: 'LOCKED',
        materialNumber: MATERIAL,
      },
    });
    calcQId = calcQ.id;

    const quotation = await prisma.commercialQuotation.create({
      data: {
        quotationNumber: `QUO-${marker}`,
        inquiryId: inquiry.id,
        customerId: inquiry.customerId,
        customerName: inquiry.customerName,
        versionNo: 1,
        sellingPrice: 41,
      },
    });
    quotationId = quotation.id;
    const quotationLine = await prisma.commercialQuotationLine.create({
      data: {
        quotationId: quotation.id,
        lineNumber: 1,
        itemDescription: 'Isolation quotation line',
        costingRunId: runQ.id,
        costingCalculationId: calcQ.id,
        materialCost: 41,
        sellingPrice: 41,
      },
    });
    quotationLineId = quotationLine.id;
    const snapshot = await prisma.commercialPricingSnapshot.create({
      data: {
        quotationId: quotation.id,
        quotationLineId: quotationLine.id,
        quotationNumber: quotation.quotationNumber,
        versionNo: 1,
        materialNumber: MATERIAL,
        costingRunId: runQ.id,
        materialCost: 41,
        currency: 'USD',
        pricingRuleType: 'GROSS_MARGIN',
        percentageValue: 0,
        baseSellingPrice: 41,
        discountAmount: 0,
        finalSellingPrice: 41,
        unitSellingPrice: 41,
        pricingStatus: 'PRICING_APPROVED',
      },
    });
    snapshotId = snapshot.id;

    const runB = await prisma.costingRun.create({
      data: {
        costingRunNumber: `CR-B-${marker}`,
        materialNumber: MATERIAL,
        materialCost: 10,
        inquiryLineId: dropLineId,
        costingDate: new Date(),
      },
    });
    runBId = runB.id;
    const calcB = await prisma.costingCalculation.create({
      data: {
        calculationNumber: `CC-B-${marker}`,
        costingDate: new Date(),
        inquiryLineId: dropLineId,
        workflowChannel: V2_COSTING_WORKFLOW_CHANNEL,
        status: 'LOCKED',
        materialNumber: MATERIAL,
      },
    });

    await deleteCostingArtifactsForInquiryLines(prisma, [dropLineId]);

    assert.equal(await prisma.costingRun.findUnique({ where: { id: runB.id } }), null);
    assert.equal(await prisma.costingCalculation.findUnique({ where: { id: calcB.id } }), null);

    const survivedA = await prisma.costingRun.findUnique({ where: { id: runA.id } });
    assert.ok(survivedA);
    assert.equal(Number(survivedA.materialCost), 29.85);
    assert.equal(survivedA.inquiryLineId, keepLineId);
    const survivedCalcA = await prisma.costingCalculation.findUnique({ where: { id: calcA.id } });
    assert.ok(survivedCalcA);
    assert.equal(survivedCalcA.workflowChannel, V2_COSTING_WORKFLOW_CHANNEL);

    const survivedQ = await prisma.costingRun.findUnique({ where: { id: runQ.id } });
    assert.ok(survivedQ);
    assert.equal(Number(survivedQ.materialCost), 41);
    const linkedLine = await prisma.commercialQuotationLine.findUnique({ where: { id: quotationLine.id } });
    assert.equal(linkedLine?.costingRunId, runQ.id);
    const survivedSnapshot = await prisma.commercialPricingSnapshot.findUnique({ where: { id: snapshot.id } });
    assert.ok(survivedSnapshot);
    assert.equal(survivedSnapshot.costingRunId, runQ.id);
    assert.equal(Number(survivedSnapshot.finalSellingPrice), 41);
    assert.equal(survivedSnapshot.pricingStatus, 'PRICING_APPROVED');
  });
});
