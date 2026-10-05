import assert from 'node:assert/strict';
import { after, before, describe, it } from 'node:test';
import { Prisma } from '@prisma/client';
import dotenv from 'dotenv';
import { checkDatabase, disconnectPrisma, getPrisma } from './db';
import {
  calculateCommercialSellingPrice,
} from '../domain/commercialPricingEngine';
import {
  createCommercialPricingRule,
  createCommercialPricingRuleVersion,
  processPricingRuleWorkflowAction,
  toStoredPricingRule,
} from './commercialPricingRepository';

describe('Costing V2 commercial pricing — effective dating and snapshot immutability', () => {
  const suffix = `CV2P${Date.now().toString(36).toUpperCase()}`;
  const actor = {
    id: `u-cv2p-${suffix}`,
    name: 'Pricing Fixture Actor',
    email: `cv2p-${suffix}@test.local`,
  };
  const manager = {
    id: `u-cv2p-mgr-${suffix}`,
    name: 'Pricing Fixture Manager',
    email: `cv2p-mgr-${suffix}@test.local`,
  };

  let groupId = '';
  let customerId = '';
  let materialNumber = '';
  let inquiryId = '';
  let quotationId = '';
  let quotationLineId = '';
  let snapshotId = '';
  let costingRunId = '';
  const ruleIds: string[] = [];
  const ruleCodes: string[] = [];

  before(async () => {
    const health = await checkDatabase();
    assert.equal(health.ok, true, health.error);
    const prisma = getPrisma()!;

    const group = await prisma.customerGroup.create({
      data: { code: `CV2G-${suffix}`, name: `CV2 Pricing Test Group ${suffix}` },
    });
    groupId = group.id;

    const customer = await prisma.customer.create({
      data: {
        code: `CV2C-${suffix}`,
        name: `CV2 Pricing Test Customer ${suffix}`,
        status: 'ACTIVE',
        customerGroupId: group.id,
      },
    });
    customerId = customer.id;

    materialNumber = `CV2-CABLE-${suffix}`;
    await prisma.cableMaster.create({
      data: {
        materialNumber,
        itemCode: `CV2-ITEM-${suffix}`,
        customerCode: 'CV2-TEST',
        description: 'Test-owned LV cable for commercial pricing fixtures',
        family: 'LV',
        diameter: 10,
        weight: 100,
        status: 'ACTIVE',
      },
    });

    const costingRun = await prisma.costingRun.create({
      data: {
        costingRunNumber: `CR-CV2P-${suffix}`,
        materialNumber,
        materialCost: 100,
        costingDate: new Date('2026-09-23'),
        isCurrent: true,
      },
    });
    costingRunId = costingRun.id;

    const inquiry = await prisma.commercialInquiry.create({
      data: {
        inquiryNumber: `INQ-CV2P-${suffix}`,
        customerId,
        customerMasterId: customerId,
        customerName: customer.name,
        projectName: `CV2 pricing ${suffix}`,
      },
    });
    inquiryId = inquiry.id;

    const quotation = await prisma.commercialQuotation.create({
      data: {
        quotationNumber: `QUO-CV2P-${suffix}`,
        inquiryId: inquiry.id,
        customerId,
        customerMasterId: customerId,
        customerName: customer.name,
        versionNo: 1,
        currency: 'USD',
      },
    });
    quotationId = quotation.id;

    const line = await prisma.commercialQuotationLine.create({
      data: {
        quotationId: quotation.id,
        lineNumber: 1,
        itemDescription: 'Test-owned pricing line',
        materialNumber,
        materialCost: 100,
        costingRunId: costingRun.id,
        quantity: 1,
        lengthMeters: 1000,
      },
    });
    quotationLineId = line.id;
  });

  after(async () => {
    const prisma = getPrisma();
    if (prisma) {
      if (snapshotId) await prisma.commercialPricingSnapshot.deleteMany({ where: { id: snapshotId } });
      if (quotationLineId) await prisma.commercialQuotationLine.deleteMany({ where: { id: quotationLineId } });
      if (quotationId) await prisma.commercialQuotation.deleteMany({ where: { id: quotationId } });
      if (inquiryId) {
        await prisma.commercialInquiryLine.deleteMany({ where: { inquiryId } });
        await prisma.commercialInquiry.deleteMany({ where: { id: inquiryId } });
      }
      if (ruleIds.length) {
        await prisma.commercialPricingSnapshot.deleteMany({ where: { pricingRuleId: { in: ruleIds } } });
        await prisma.auditEvent.deleteMany({
          where: { entity: 'CommercialPricingRule', entityId: { in: [...ruleIds, ...ruleCodes] } },
        });
        await prisma.commercialPricingRule.deleteMany({ where: { id: { in: ruleIds } } });
      }
      if (costingRunId) {
        await prisma.costingLine.deleteMany({ where: { costingRunId } });
        await prisma.costingRun.deleteMany({ where: { id: costingRunId } });
      }
      if (materialNumber) await prisma.cableMaster.deleteMany({ where: { materialNumber } });
      if (customerId) await prisma.customer.deleteMany({ where: { id: customerId } });
      if (groupId) await prisma.customerGroup.deleteMany({ where: { id: groupId } });
    }
    await disconnectPrisma();
  });

  it('4. Effective dating: 20% through 2026-09-30, 22% from 2026-10-01, test-owned customer', async () => {
    const prisma = getPrisma()!;
    const first = await createCommercialPricingRule(
      {
        ruleName: `CV2P margin 20 ${suffix}`,
        scope: 'CUSTOMER_FAMILY',
        ruleType: 'GROSS_MARGIN',
        customerId,
        cableFamily: 'LV',
        percentageValue: 20,
        currency: 'USD',
        effectiveFrom: '2026-09-23',
      },
      actor
    );
    ruleIds.push(first.id);
    ruleCodes.push(first.ruleCode);
    await processPricingRuleWorkflowAction(first.id, 'SUBMIT', {}, actor);
    await processPricingRuleWorkflowAction(first.id, 'APPROVE', {}, manager);

    const second = await createCommercialPricingRuleVersion(
      first.id,
      { percentageValue: 22, effectiveFrom: '2026-10-01' },
      actor
    );
    ruleIds.push(second.id);
    ruleCodes.push(second.ruleCode);

    const stored = (await prisma.commercialPricingRule.findMany({ where: { id: { in: ruleIds } } })).map(
      toStoredPricingRule
    );

    const sept = calculateCommercialSellingPrice(
      {
        materialCost: 100,
        currency: 'USD',
        customerId,
        cableFamily: 'LV',
        pricingDate: new Date('2026-09-30T12:00:00.000Z'),
      },
      { approvedPricingRules: stored }
    );
    assert.equal(sept.pricingRuleId, first.id);
    assert.equal(sept.percentageValue, 20);
    assert.equal(sept.finalSellingPriceExact, '125');

    const oct = calculateCommercialSellingPrice(
      {
        materialCost: 100,
        currency: 'USD',
        customerId,
        cableFamily: 'LV',
        pricingDate: new Date('2026-10-01T00:00:00.000Z'),
      },
      { approvedPricingRules: stored }
    );
    assert.equal(oct.pricingRuleId, second.id);
    assert.equal(oct.percentageValue, 22);
    assert.equal(oct.finalSellingPriceExact, new Prisma.Decimal(100).div(new Prisma.Decimal('0.78')).toDecimalPlaces(2, Prisma.Decimal.ROUND_HALF_UP).toFixed());
  });

  it('5. Snapshot immutability: 20% snapshot stays 20% after master versions to 25%', async () => {
    const prisma = getPrisma()!;
    const first = await createCommercialPricingRule(
      {
        ruleName: `CV2P snap 20 ${suffix}`,
        scope: 'CUSTOMER_CABLE_SPECIFIC',
        ruleType: 'GROSS_MARGIN',
        customerId,
        cableMaterialNumber: materialNumber,
        percentageValue: 20,
        currency: 'USD',
        effectiveFrom: '2026-09-01',
      },
      actor
    );
    ruleIds.push(first.id);
    ruleCodes.push(first.ruleCode);
    await processPricingRuleWorkflowAction(first.id, 'SUBMIT', {}, actor);
    await processPricingRuleWorkflowAction(first.id, 'APPROVE', {}, manager);

    const priced = calculateCommercialSellingPrice(
      {
        materialCost: 100,
        currency: 'USD',
        customerId,
        materialNumber,
        cableFamily: 'LV',
        pricingDate: new Date('2026-09-15'),
      },
      { approvedPricingRules: [toStoredPricingRule(await prisma.commercialPricingRule.findUniqueOrThrow({ where: { id: first.id } }))] }
    );
    assert.equal(priced.finalSellingPriceExact, '125');

    const snapshot = await prisma.commercialPricingSnapshot.create({
      data: {
        quotationId,
        quotationLineId,
        quotationNumber: `QUO-CV2P-${suffix}`,
        versionNo: 1,
        materialNumber,
        costingRunId,
        materialCost: 100,
        currency: 'USD',
        pricingRuleId: first.id,
        pricingRuleRevision: first.revision,
        pricingRuleType: 'GROSS_MARGIN',
        pricingRuleScope: 'CUSTOMER_CABLE_SPECIFIC',
        percentageValue: 20,
        resolutionReason: priced.resolutionReason,
        baseSellingPrice: priced.baseSellingPriceExact || 125,
        finalSellingPrice: priced.finalSellingPriceExact || 125,
        unitSellingPrice: priced.unitSellingPrice || 125,
        pricingStatus: 'PRICING_CALCULATED',
      },
    });
    snapshotId = snapshot.id;

    const next = await createCommercialPricingRuleVersion(
      first.id,
      { percentageValue: 25, effectiveFrom: '2026-09-20' },
      actor
    );
    ruleIds.push(next.id);
    ruleCodes.push(next.ruleCode);

    const frozen = await prisma.commercialPricingSnapshot.findUnique({ where: { id: snapshot.id } });
    assert.equal(Number(frozen?.percentageValue), 20);
    assert.equal(Number(frozen?.finalSellingPrice), 125);

    const stored = (await prisma.commercialPricingRule.findMany({ where: { id: { in: [first.id, next.id] } } })).map(
      toStoredPricingRule
    );
    const later = calculateCommercialSellingPrice(
      {
        materialCost: 100,
        currency: 'USD',
        customerId,
        materialNumber,
        cableFamily: 'LV',
        pricingDate: new Date('2026-09-21'),
      },
      { approvedPricingRules: stored }
    );
    assert.equal(later.pricingRuleId, next.id);
    assert.equal(later.percentageValue, 25);
    assert.equal(later.finalSellingPriceExact, new Prisma.Decimal(100).div(new Prisma.Decimal('0.75')).toDecimalPlaces(2, Prisma.Decimal.ROUND_HALF_UP).toFixed());
  });
});
