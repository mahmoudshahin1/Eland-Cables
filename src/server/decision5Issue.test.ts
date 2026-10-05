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
import { approveV2Quotation, createV2QuotationDraft, issueV2Quotation, persistV2QuotationPricing } from './v2QuotationRepository';
import { approveQuotationPricing } from './commercialPricingRepository';
import { createRawMaterialPriceDraft, evaluateCableCostingReadiness, processPriceWorkflowAction } from './governanceRepository';
import { upsertInquiryLineAttachment } from './attachmentRepository';
import { deleteCommercialInquiriesMatching } from './commercialTestCleanup';
import { generateV2QuotationPdf } from './v2QuotationPdfService';
import { loadDecision5SignOff, signDecision5OptionB } from './decision5SignOff';
import type { RequestActor } from './auth';
import { DECISION5_STATUS } from '../domain/v2CostingRequestService';

dotenv.config();

const FIXTURE = 'I4-FIXTURE-EXISTING';
const marker = `decision5-issue-${Date.now()}`;
const COMMERCIAL_OFFER_HEX = Buffer.from('434f4d4d45524349414c204f46464552');
const DRAFT_HEADING_HEX = Buffer.from('445241465420434f4d4d45524349414c204f46464552');

describe('Decision 5 sign-off then quotation issue', () => {
  const ownedLineIds: string[] = [];
  let createdAuditId: string | null = null;
  let quotationId: string | null = null;
  let ownedFixtureRm = '';

  before(async () => {
    const health = await checkDatabase();
    assert.equal(health.ok, true, health.error);
  });

  after(async () => {
    const prisma = getPrisma();
    if (prisma) {
      if (createdAuditId) {
        await prisma.auditEvent.delete({ where: { id: createdAuditId } }).catch(() => undefined);
      }
      if (quotationId) {
        await prisma.emailOutbox.deleteMany({
          where: { entityType: 'CommercialQuotation', entityId: quotationId, eventCode: 'QUOTATION_ISSUED' },
        });
      }
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

  it('refuses Decision 5 sign-off for a customer', async () => {
    await assert.rejects(
      () =>
        signDecision5OptionB({
          id: 'customer-decision5',
          name: 'Customer',
          email: 'customer-decision5@energya.local',
          userType: 'customer',
          permissions: { costingPricing: true, salesQuotations: true },
        }),
      (err: Error & { code?: string }) => err.code === 'UNAUTHORIZED'
    );
  });

  it('blocks issue while unsigned, then issues from the persisted run after an explicit sign-off', async () => {
    const prisma = getPrisma()!;
    const user = await prisma.userAccount.findFirst({
      where: { email: 'standard.test@energya.local' },
      include: { customerUsers: { include: { customer: true } } },
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
      id: 'u-decision5-signer',
      name: 'Decision 5 Signer',
      email: 'admin@energya.com',
      userType: 'internal',
      permissions: { salesQuotations: true, costingPricing: true, masterData: true, technicalOffice: true },
    };

    const before = await loadDecision5SignOff();
    const inquiry = await createInquiry(
      {
        customerName: 'FIXTURE decision 5 issue',
        projectName: 'FIXTURE decision 5 issue',
        customerReference: marker,
      },
      customer
    );
    const line = await addInquiryLine(
      inquiry.id,
      {
        materialNumber: FIXTURE,
        customerCode: 'N2XH',
        cableDescription: 'FIXTURE I4-FIXTURE-EXISTING decision 5 issue',
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
    await confirmV2DrumPlan(inquiry.id, line.id, planKey, internal);

    ownedFixtureRm = `I4-RM-BOM-${marker}`.toUpperCase();
    await prisma.rawMaterial.create({
      data: {
        code: ownedFixtureRm,
        description: 'Decision 5 fixture BOM raw material',
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
    const runId = storedLine.costingRunId;
    const run = await prisma.costingRun.findUnique({ where: { id: runId } });
    assert.ok(run);
    const materialCost = Number(run.materialCost);
    assert.ok(materialCost > 0);

    await upsertInquiryLineAttachment(
      line.id,
      {
        kind: 'TECHNICAL_OFFER',
        fileName: 'FIXTURE-decision5-technical-offer.txt',
        mimeType: 'text/plain',
        contentBase64: Buffer.from('FIXTURE technical offer for Decision 5 issue proof.').toString('base64'),
      },
      internal
    );
    const draft = await createV2QuotationDraft(inquiry.id, internal);
    assert.equal(draft.lines[0].costingRunId, runId);
    const submitted = await submitInquiry(inquiry.id, internal);
    assert.equal(submitted?.status, 'READY_FOR_COMMERCIAL');
    assert.equal(await prisma.costingRun.count({ where: { inquiryLineId: line.id } }), 1);

    const priced = await persistV2QuotationPricing(inquiry.id, internal, { requestedDiscountPercentage: 0 });
    const pricedLine = priced.lines[0];
    assert.ok(pricedLine.pricingSnapshot);
    const pricingSnapshotId = pricedLine.pricingSnapshot.id;
    assert.equal(pricedLine.pricingSnapshot.costingRunId, runId);
    const selling = Number(priced.sellingPrice);
    assert.ok(selling > 0);
    quotationId = priced.id;

    await approveQuotationPricing(priced.id, { comment: 'Fixture Decision 5 pricing approval' }, internal);
    const approved = await approveV2Quotation(inquiry.id, internal);
    assert.ok(approved.quotationApprovedAt);
    assert.equal(Number(approved.sellingPrice), selling);
    assert.equal(approved.lines[0].pricingSnapshot?.pricingStatus, 'PRICING_APPROVED');

    if (!before.signed) {
      assert.equal(DECISION5_STATUS, 'PENDING_BUSINESS_SIGN_OFF');
      await assert.rejects(
        () => issueV2Quotation(inquiry.id, internal),
        (err: Error & { code?: string }) => {
          assert.equal(err.code, 'QUOTATION_NOT_READY');
          assert.match(err.message, /Decision 5 unsigned/);
          assert.equal(/pricing must be PRICING_APPROVED/.test(err.message), false);
          return true;
        }
      );
    }
    const signed = await signDecision5OptionB(internal);
    assert.equal(signed.signed, true);
    assert.equal(signed.status, 'SIGNED');
    assert.equal(signed.option, 'B');
    assert.match(signed.optionLabel, /LME/);
    assert.ok(signed.signedAt);
    // Idempotent once a legitimate sign-off exists: this call returns the
    // recorded signer. It does not invent a second name, and it does not
    // delete the audit. A missing sign-off still blocks ISSUE in
    // evaluateQuotationReadiness (v2QuotationService.test.ts).
    const recordedSigner = before.signed ? before.signedBy : internal.name;
    assert.ok(recordedSigner);
    assert.equal(signed.signedBy, recordedSigner);
    if (!before.signed) {
      const audit = await prisma.auditEvent.findFirst({
        where: { action: 'DECISION_5_SIGNED', entity: 'Decision5', entityId: 'OPTION_B_LME_BASE' },
        orderBy: { at: 'desc' },
      });
      assert.ok(audit);
      createdAuditId = audit.id;
      assert.equal(audit.actorName, recordedSigner);
      assert.match(String(audit.message), /Option B \/ LME-base/);
    } else {
      assert.equal(signed.signedAt, before.signedAt);
    }

    const runCountBeforeIssue = await prisma.costingRun.count({ where: { inquiryLineId: line.id } });
    const issued = await issueV2Quotation(inquiry.id, internal);
    assert.ok(issued.issuedAt);
    assert.equal(issued.commercialOfferStatus, 'ISSUED');
    assert.equal(issued.technicalOfferStatus, 'ISSUED');
    assert.equal(Number(issued.sellingPrice), selling);
    const offer = issued.commercialOfferSnapshot as {
      draft?: boolean;
      lines?: unknown[];
      terms?: unknown[];
      shippingLabel?: string;
      priceAdjustment?: { formula?: string };
      grandTotal?: number | null;
      quotationNumber?: string;
    };
    assert.notEqual(offer.draft, true);
    assert.equal(offer.quotationNumber, issued.quotationNumber);
    assert.ok(offer.lines && offer.lines.length > 0);
    assert.ok(offer.terms && offer.terms.length > 0);
    assert.ok(offer.shippingLabel);
    assert.ok(offer.priceAdjustment?.formula);
    assert.ok('grandTotal' in offer);

    const official = await generateV2QuotationPdf(issued.id, internal);
    assert.equal(/DRAFT COMMERCIAL OFFER/.test(official.html), false);
    assert.match(official.html, /COMMERCIAL OFFER/);
    assert.equal(/unit cost|total cost|margin|internal comment/i.test(official.html), false);
    assert.equal(official.pdf.includes(DRAFT_HEADING_HEX), false);
    assert.equal(official.pdf.includes(COMMERCIAL_OFFER_HEX), true);
    assert.notEqual((official.commercialOffer as { draft?: boolean }).draft, true);

    const emails = await prisma.emailOutbox.findMany({
      where: { eventCode: 'QUOTATION_ISSUED', entityType: 'CommercialQuotation', entityId: issued.id },
    });
    assert.ok(emails.length > 0);

    const runAfter = await prisma.costingRun.findUnique({ where: { id: runId } });
    assert.ok(runAfter);
    assert.equal(Number(runAfter.materialCost), materialCost);
    assert.equal(await prisma.costingRun.count({ where: { inquiryLineId: line.id } }), runCountBeforeIssue);
    const snapshotAfter = await prisma.commercialPricingSnapshot.findUnique({ where: { id: pricingSnapshotId } });
    assert.ok(snapshotAfter);
    assert.equal(Number(snapshotAfter.finalSellingPrice), selling);
    assert.equal(snapshotAfter.costingRunId, runId);
    assert.equal(draft.lines[0].costingRunId, runId);
  });
});
