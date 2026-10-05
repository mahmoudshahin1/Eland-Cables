import assert from 'node:assert/strict';
import { after, before, describe, it } from 'node:test';
import dotenv from 'dotenv';
import { checkDatabase, disconnectPrisma, getPrisma } from './db';
import { deleteCostingArtifactsForInquiryLines } from './costingArtifactCleanup';
import { createInquiry, addInquiryLine, submitInquiry } from './commercialRepository';
import { persistV2ConfigurationSnapshot } from './v2InquiryConfigurationRepository';
import { persistV2CuttingLengthPlan } from './v2CuttingLengthRepository';
import { confirmV2DrumPlan, createDraftV2DrumPlan, validateV2DrumPlan } from './v2DrumPlanRepository';
import { calculateV2CostingRun } from './v2CostingRunRepository';
import {
  approveV2Quotation,
  createV2QuotationDraft,
  getV2QuotationReadiness,
  issueV2Quotation,
  persistV2QuotationPricing,
} from './v2QuotationRepository';
import { approveQuotationPricing } from './commercialPricingRepository';
import { createRawMaterialPriceDraft, evaluateCableCostingReadiness, processPriceWorkflowAction } from './governanceRepository';
import { upsertInquiryLineAttachment } from './attachmentRepository';
import { deleteCommercialInquiriesMatching } from './commercialTestCleanup';
import type { RequestActor } from './auth';
import { V2_COSTING_WORKFLOW_CHANNEL } from '../domain/v2CostingRequestService';
import { loadDecision5SignOff } from './decision5SignOff';

dotenv.config();

const FIXTURE = 'I4-FIXTURE-EXISTING';
const OLD_INQUIRY = 'cmucrtvnl00m5tx9k8zpcndt8';
const OLD_LINE = 'cmucrtvz900m9tx9ksvtvsmb6';
const marker = `lineage-${Date.now()}`;

describe('Costing lineage durability', () => {
  const ownedLineIds: string[] = [];
  let ownedFixtureRm = '';

  before(async () => {
    const health = await checkDatabase();
    assert.equal(health.ok, true, health.error);
  });

  after(async () => {
    const prisma = getPrisma();
    if (prisma) {
      await deleteCostingArtifactsForInquiryLines(prisma, ownedLineIds);
      await deleteCommercialInquiriesMatching(prisma, { customerReference: marker });
      if (ownedFixtureRm) {
        await prisma.rawMaterialPrice.deleteMany({ where: { rawMaterialCode: ownedFixtureRm } });
        await prisma.cableBomLine.deleteMany({
          where: { cableMaterialNumber: FIXTURE, rawMaterialCode: ownedFixtureRm },
        });
        await prisma.rawMaterial.deleteMany({ where: { code: ownedFixtureRm } });
      }
    }
    await disconnectPrisma();
  });

  it('deletes costing artifacts only for the named inquiry lines', async () => {
    const prisma = getPrisma()!;
    const lineA = `line-a-${marker}`;
    const lineB = `line-b-${marker}`;
    const runA = await prisma.costingRun.create({
      data: {
        costingRunNumber: `CR-A-${marker}`,
        materialNumber: FIXTURE,
        materialCost: 10,
        inquiryLineId: lineA,
        costingDate: new Date(),
      },
    });
    const runB = await prisma.costingRun.create({
      data: {
        costingRunNumber: `CR-B-${marker}`,
        materialNumber: FIXTURE,
        materialCost: 20,
        inquiryLineId: lineB,
        costingDate: new Date(),
      },
    });
    const calcB = await prisma.costingCalculation.create({
      data: {
        calculationNumber: `CC-B-${marker}`,
        costingDate: new Date(),
        inquiryLineId: lineB,
        workflowChannel: V2_COSTING_WORKFLOW_CHANNEL,
        status: 'LOCKED',
        materialNumber: FIXTURE,
      },
    });
    ownedLineIds.push(lineB);

    await deleteCostingArtifactsForInquiryLines(prisma, [lineA]);

    assert.equal(await prisma.costingRun.findUnique({ where: { id: runA.id } }), null);
    const survivedRun = await prisma.costingRun.findUnique({ where: { id: runB.id } });
    const survivedCalc = await prisma.costingCalculation.findUnique({ where: { id: calcB.id } });
    assert.ok(survivedRun);
    assert.equal(Number(survivedRun.materialCost), 20);
    assert.ok(survivedCalc);
    assert.equal(survivedCalc.workflowChannel, V2_COSTING_WORKFLOW_CHANNEL);
    assert.equal(survivedCalc.status, 'LOCKED');
  });

  it('keeps a new fixture CostingRun through pricing and quotation, and does not rebuild QUO26-00320', async () => {
    const prisma = getPrisma()!;
    const user = await prisma.userAccount.findUnique({
      where: { email: 'standard.test@energya.local' },
      include: { customerUsers: { where: { status: 'ACTIVE' }, include: { customer: true } } },
    });
    const link = user?.customerUsers[0];
    assert.ok(user && link, 'standard test customer is required');
    const customer: RequestActor = {
      id: user.id,
      name: user.fullName,
      email: user.email,
      userType: 'customer',
      customerId: link.customerId,
      customerCode: link.customer.code,
      customerMasterIds: [link.customerId],
      customerScopeStatus: 'resolved',
      customerScopeKeys: [user.id, user.email || '', link.customerId, link.customer.code].filter(Boolean),
    };
    const internal: RequestActor = {
      id: 'u-admin-1',
      name: 'Lineage Internal',
      email: 'admin@energya.com',
      userType: 'internal',
      permissions: { salesQuotations: true, costingPricing: true, masterData: true, technicalOffice: true },
    };

    const oldReady = await getV2QuotationReadiness(OLD_INQUIRY, internal, 'APPROVE');
    assert.equal(oldReady.ready, false);
    assert.ok(oldReady.blockingReasons.some((reason) => reason.includes('persisted V2 costing calculation required')));
    assert.equal(await prisma.costingRun.findUnique({ where: { id: 'cmucrvv0x000etxn4z3juftdb' } }), null);
    assert.equal(
      await prisma.costingCalculation.count({ where: { inquiryLineId: OLD_LINE } }),
      0
    );

    const inquiry = await createInquiry(
      {
        customerName: 'FIXTURE lineage proof',
        projectName: 'FIXTURE costing lineage',
        customerReference: marker,
      },
      customer
    );
    const line = await addInquiryLine(
      inquiry.id,
      {
        materialNumber: FIXTURE,
        customerCode: 'N2XH',
        cableDescription: 'FIXTURE I4-FIXTURE-EXISTING lineage',
        requestedQuantity: 1,
        requestedLengthMeters: 100,
      },
      customer
    );
    ownedLineIds.push(line.id);

    const snap = await persistV2ConfigurationSnapshot(
      inquiry.id,
      line.id,
      {
        selections: { selectionMode: 'CUSTOMER', materialNumber: FIXTURE, customerCode: 'N2XH' } as never,
        catalogSource: 'POSTGRESQL',
        catalogAuthoritative: true,
      },
      internal
    );
    assert.equal(snap.snapshot.flowState, 'VALID');

    await persistV2CuttingLengthPlan(inquiry.id, line.id, { nominalLengthM: 100, tolerancePercent: 0 }, internal);
    const drum = await createDraftV2DrumPlan(inquiry.id, line.id, { selectionMethod: 'AUTOMATIC' }, internal);
    const planKey = drum.drumPlan.planId || drum.drumPlan.id;
    await validateV2DrumPlan(inquiry.id, line.id, planKey, internal);
    const confirmed = await confirmV2DrumPlan(inquiry.id, line.id, planKey, internal);
    assert.equal(confirmed.drumPlan.lifecycleStatus, 'CONFIRMED');

    ownedFixtureRm = `I4-RM-BOM-${marker}`.toUpperCase();
    await prisma.rawMaterial.create({
      data: {
        code: ownedFixtureRm,
        description: 'Lineage fixture BOM raw material',
        uom: 'kg',
        priceStatus: 'PRICE_NOT_CONFIGURED',
        sourceBatch: marker,
      },
    });
    await prisma.cableBomLine.create({
      data: {
        cableMaterialNumber: FIXTURE,
        rawMaterialCode: ownedFixtureRm,
        consumption: 1,
        uom: 'kg',
        bomVersion: 1,
        sourceBatch: marker,
      },
    });

    const readiness = await evaluateCableCostingReadiness(FIXTURE);
    const row = Array.isArray(readiness) ? readiness[0] : readiness;
    const reasons: string[] = (row as { blockingReasons?: string[] })?.blockingReasons || [];
    const missing = [
      ...new Set(
        reasons
          .map((reason) => reason.match(/Gate 4 Failed: (\S+)/)?.[1])
          .filter((code): code is string => Boolean(code && code.startsWith('I4-')))
      ),
    ];
    const sales = { id: 'u-fixture-sales', name: 'Fixture Sales', email: 'fixture.sales@energya.local' };
    for (const code of missing) {
      const draftPrice = await createRawMaterialPriceDraft(
        {
          rawMaterialCode: code,
          price: 1,
          currency: 'USD',
          uom: 'kg',
          priceBasis: 'PER_KG',
          effectiveFrom: '2020-01-01',
          effectiveTo: '2035-12-31',
          source: 'FIXTURE-TEST-ONLY',
          supplier: 'FIXTURE',
          comment: 'TEST-ONLY fixture price. Not a production master price.',
        },
        sales
      );
      await processPriceWorkflowAction(draftPrice.id, 'SUBMIT', { comment: 'FIXTURE-TEST-ONLY submit' }, sales);
      await processPriceWorkflowAction(draftPrice.id, 'APPROVE', { comment: 'FIXTURE-TEST-ONLY approve' }, internal);
    }

    const costing = await calculateV2CostingRun(inquiry.id, line.id, internal);
    assert.equal(costing.persisted, true, (costing.blockingReasons || []).join('; '));
    const storedLine = await prisma.commercialInquiryLine.findUnique({ where: { id: line.id } });
    assert.ok(storedLine?.costingRunId);
    assert.ok(storedLine?.costingCalculationId);
    const run = await prisma.costingRun.findUnique({ where: { id: storedLine.costingRunId } });
    const calc = await prisma.costingCalculation.findUnique({ where: { id: storedLine.costingCalculationId! } });
    assert.ok(run);
    assert.ok(calc);
    assert.equal(calc.workflowChannel, V2_COSTING_WORKFLOW_CHANNEL);
    assert.equal(calc.status, 'LOCKED');
    assert.ok(Number(run.materialCost) > 0);

    const draft = await createV2QuotationDraft(inquiry.id, internal);
    const draftLine = draft.lines[0];
    assert.equal(draftLine.costingRunId, run.id);
    assert.equal(draftLine.costingCalculationId, calc.id);

    const priced = await persistV2QuotationPricing(inquiry.id, internal, { requestedDiscountPercentage: 0 });
    const pricedLine = priced.lines[0];
    assert.ok(pricedLine.pricingSnapshot);
    assert.equal(pricedLine.pricingSnapshot.costingRunId, run.id);
    assert.equal(pricedLine.pricingSnapshot.versionNo, priced.versionNo);
    assert.equal(pricedLine.pricingSnapshot.quotationId, priced.id);
    const selling = Number(priced.sellingPrice);
    assert.ok(selling > 0);

    await upsertInquiryLineAttachment(
      line.id,
      {
        kind: 'TECHNICAL_OFFER',
        fileName: 'FIXTURE-lineage-technical-offer.txt',
        mimeType: 'text/plain',
        contentBase64: Buffer.from('FIXTURE technical offer for costing lineage proof.').toString('base64'),
      },
      internal
    );
    const approvedPrice = await approveQuotationPricing(priced.id, { comment: 'Fixture lineage pricing approval' }, internal);
    assert.equal(approvedPrice.commercialPricingStatus, 'PRICING_APPROVED');
    assert.equal(Number(approvedPrice.sellingPrice), selling);

    const approved = await approveV2Quotation(inquiry.id, internal);
    assert.ok(approved.quotationApprovedAt);
    assert.equal(Number(approved.sellingPrice), selling);

    const decision5 = await loadDecision5SignOff();
    if (!decision5.signed) {
      await assert.rejects(
        () => issueV2Quotation(inquiry.id, internal),
        (err: Error & { code?: string }) => {
          assert.equal(err.code, 'QUOTATION_NOT_READY');
          assert.match(err.message, /Decision 5 unsigned/);
          return true;
        }
      );
    }

    const submitted = await submitInquiry(inquiry.id, internal);
    assert.equal(submitted?.status, 'READY_FOR_COMMERCIAL');
    assert.ok(await prisma.costingRun.findUnique({ where: { id: run.id } }));
    assert.ok(await prisma.costingCalculation.findUnique({ where: { id: calc.id } }));
    const snapshot = await prisma.commercialPricingSnapshot.findUnique({ where: { quotationLineId: pricedLine.id } });
    assert.ok(snapshot);
    assert.equal(snapshot.costingRunId, run.id);
    assert.equal(Number(snapshot.finalSellingPrice), selling);
    assert.equal(await prisma.costingCalculation.count({ where: { inquiryLineId: OLD_LINE } }), 0);
  });
});
