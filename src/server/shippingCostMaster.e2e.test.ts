import assert from 'node:assert/strict';
import { after, before, describe, it } from 'node:test';
import dotenv from 'dotenv';
import { checkDatabase, getPrisma } from './db';
import { hashPassword } from '../domain/passwordService';
import { SYSTEM_ADMIN_ROLE_CODE } from '../domain/permissionCatalog';
import {
  ELAND_SHIPPING_COST_SEED,
  SHIPPING_COST_APPLIED,
  SHIPPING_COST_NOT_CONFIGURED,
} from '../domain/customerShippingCost';
import { formatDateOnlyUtc } from '../domain/shippingCostCanonical';
import type { RequestActor } from './auth';
import { deleteCostingArtifactsForInquiryLines } from './costingArtifactCleanup';
import { addInquiryLine, createInquiry, submitInquiry } from './commercialRepository';
import { persistV2ConfigurationSnapshot } from './v2InquiryConfigurationRepository';
import { persistV2CuttingLengthPlan } from './v2CuttingLengthRepository';
import { confirmV2DrumPlan, createDraftV2DrumPlan, validateV2DrumPlan } from './v2DrumPlanRepository';
import { calculateV2CostingRun } from './v2CostingRunRepository';
import { approveV2Quotation, createV2QuotationDraft, issueV2Quotation, persistV2QuotationPricing } from './v2QuotationRepository';
import { approveQuotationPricing } from './commercialPricingRepository';
import { createRawMaterialPriceDraft, evaluateCableCostingReadiness, processPriceWorkflowAction } from './governanceRepository';
import { upsertInquiryLineAttachment } from './attachmentRepository';
import { deleteCommercialInquiriesMatching } from './commercialTestCleanup';
import { loadDecision5SignOff, signDecision5OptionB } from './decision5SignOff';
import { activateAlgorithmConfiguration } from './algorithmConfigurationRepository';
import { createContainerTypeVersion } from './containerMasterRepository';
import {
  calculateContainerStudy,
  captureInputSnapshot,
  createContainerStudy,
  createShipmentGroup,
} from './containerStudyRepository';
import {
  createCustomerShippingCostRate,
  recordContainerStudyShippingSnapshot,
  resolveCustomerShippingCostRate,
  seedElandCustomerShippingCostRates,
} from './customerShippingCostRepository';

dotenv.config();

const FIXTURE = 'I4-FIXTURE-EXISTING';
const DELIVERY_POINT = 'Doncaster/SD or HC';
const CONTAINER_TYPE = "20' SD";
const CURRENCY = 'USD';

type ElandLaneSnapshot = {
  id: string;
  deliveryPoint: string;
  containerType: string;
  incotermCode: string;
  amount: number;
  currency: string;
  version: number;
  status: string;
};

function addUtcDays(iso: string, days: number): string {
  const [y, m, d] = iso.split('-').map(Number);
  const dt = new Date(Date.UTC(y, m - 1, d));
  dt.setUTCDate(dt.getUTCDate() + days);
  return formatDateOnlyUtc(dt);
}

function testLineage(
  drums: Array<{ sourceLineId: string; quantity: number }>,
  destinationPortCode = DELIVERY_POINT,
  incotermCode = 'DAP'
) {
  const pins = drums.map((d, i) => ({
    v2DrumPlanLineId: d.sourceLineId,
    inquiryLineId: `line-${i}`,
    cuttingLengthRequirementId: `req-${i}`,
    drumPlanId: `plan-${i}`,
    drumPlanVersionNo: 1,
    numberOfDrums: d.quantity,
  }));
  return {
    inquiryId: 'inq-scm-e2e',
    destinationPortCode,
    incotermCode,
    cuttingLengthRequirementIds: pins.map((p) => p.cuttingLengthRequirementId),
    authoritativeDrumPlanIds: pins.map((p) => p.drumPlanId),
    drumPlans: pins.map((p) => ({
      inquiryLineId: p.inquiryLineId,
      cuttingLengthRequirementId: p.cuttingLengthRequirementId,
      drumPlanId: p.drumPlanId,
      drumPlanVersionNo: 1,
      drumLinePins: [p],
    })),
    drumLinePins: pins,
  };
}

async function snapshotElandLanes(elandId: string): Promise<ElandLaneSnapshot[]> {
  const prisma = getPrisma()!;
  const rows = await prisma.customerShippingCostRate.findMany({
    where: { customerId: elandId, version: 1 },
    include: { incoterm: true },
    orderBy: [{ deliveryPoint: 'asc' }, { containerType: 'asc' }],
  });
  return rows.map((row) => ({
    id: row.id,
    deliveryPoint: row.deliveryPoint,
    containerType: row.containerType,
    incotermCode: row.incoterm.code,
    amount: Number(row.amount),
    currency: row.currency,
    version: row.version,
    status: row.status,
  }));
}

describe('shipping cost master e2e — study snapshot issue freeze', () => {
  const suffix = `SCM${Date.now().toString(36).toUpperCase()}`;
  const marker = `shipping-cost-e2e-${suffix}`;
  const transactionDate = formatDateOnlyUtc(new Date());
  const v2EffectiveFrom = addUtcDays(transactionDate, 30);
  const beforeNewEffectiveFrom = addUtcDays(v2EffectiveFrom, -1);

  let actor: RequestActor;
  let elandId = '';
  let dapId = '';
  let cifId = '';
  let customerId = '';
  let adminUserId = '';
  let portCode = 'ALEX';
  const rateIds: string[] = [];
  const ownedLineIds: string[] = [];
  const inquiryIds: string[] = [];
  let quotationId = '';
  let elandBefore: ElandLaneSnapshot[] = [];
  let ownedFixtureRm = '';

  async function ensurePackingMasters() {
    const prisma = getPrisma()!;
    await prisma.numberSequence.upsert({
      where: { code: 'CONTAINER_STUDY' },
      create: {
        code: 'CONTAINER_STUDY',
        name: 'Container Study',
        prefix: 'CST',
        format: '{PREFIX}{YY}-{#####}',
        nextSerial: 1,
        moduleId: 'LOGISTICS',
      },
      update: {},
    });
    const { ensureNumberSequencesAheadOfExisting } = await import('./testNumberSequenceIsolation');
    await ensureNumberSequencesAheadOfExisting(prisma);
    await activateAlgorithmConfiguration('CFG-LEGACY-FIRST-FIT-V1', actor);
    let approved = await prisma.containerTypeVersion.findMany({
      where: { isCurrent: true, dimensionsStatus: 'APPROVED' },
    });
    if (!approved.length) {
      await createContainerTypeVersion(
        '40HQ',
        {
          parityLabel: '40 HQ',
          usableLengthMm: 12001,
          internalWidthMm: 2351,
          payloadCapacityKg: 25000,
          dimensionsStatus: 'APPROVED',
        },
        actor
      );
      approved = await prisma.containerTypeVersion.findMany({
        where: { isCurrent: true, dimensionsStatus: 'APPROVED' },
      });
    }
    assert.ok(approved.length >= 1, 'At least one APPROVED current container type version is required for packing.');
    const port = await prisma.destinationPort.findFirst({ where: { active: true }, select: { code: true } });
    if (port?.code) portCode = port.code;
    return approved.map((row) => row.id);
  }

  async function runContainerStudyAndRecordShipping(input: {
    inquiryId: string;
    groupCode: string;
    incotermCode: string;
    effectiveDate: string;
    lineageDestinationPortCode?: string;
    lineageIncotermCode?: string;
  }) {
    const approvedIds = await ensurePackingMasters();
    const group = await createShipmentGroup(
      input.inquiryId,
      {
        deliveryAllocationMode: 'ENTIRE_INQUIRY',
        destinationPortCode: portCode,
        incotermCode: input.incotermCode,
        groupCode: input.groupCode,
      },
      actor
    );
    const study = await createContainerStudy(
      input.inquiryId,
      {
        shipmentGroupId: group.id,
        stuffingMethod: 'Rolling',
        region: 'Europe',
        deliveryAllocationMode: 'ENTIRE_INQUIRY',
      },
      actor
    );
    const drums = [{ sourceLineId: `SRC-${input.groupCode}`, quantity: 3, packedLengthMm: 2301, packedWidthMm: 982, grossWeightKg: 1000 }];
    await captureInputSnapshot(
      study.id,
      {
        configurationId: 'CFG-LEGACY-FIRST-FIT-V1',
        containerTypeVersionIds: approvedIds,
        drums,
        lineageProvenanceJson: testLineage(
          drums,
          input.lineageDestinationPortCode ?? DELIVERY_POINT,
          input.lineageIncotermCode ?? input.incotermCode
        ),
      },
      actor
    );
    const calculated = await calculateContainerStudy(study.id, actor);
    assert.equal(calculated.calculation.ok, true, JSON.stringify(calculated.calculation.errors || []));
    assert.ok((calculated.calculation.summary?.allocatedCount ?? 0) >= 1, 'Container Study packing must allocate at least one drum.');
    const resultId = calculated.result?.id;
    assert.ok(resultId, 'Container Study must persist a result id.');
    const shipping = await recordContainerStudyShippingSnapshot({
      containerStudyResultId: resultId,
      inquiryId: input.inquiryId,
      effectiveDate: input.effectiveDate,
      actor,
    });
    return { study, calculated, shipping, resultId };
  }

  before(async () => {
    const health = await checkDatabase();
    assert.equal(health.ok, true, health.error);
    const prisma = getPrisma()!;
    const seeded = await seedElandCustomerShippingCostRates();
    elandId = seeded.customerId;
    dapId = seeded.incotermIds.DAP;
    cifId = seeded.incotermIds.CIF;
    elandBefore = await snapshotElandLanes(elandId);
    assert.equal(elandBefore.length, 6, 'Expected six Eland production shipping lanes.');

    const customer = await prisma.customer.create({
      data: {
        code: `C-SCM-${suffix}`,
        name: `Shipping E2E ${suffix}`,
        status: 'ACTIVE',
        defaultIncoterm: 'DAP',
        defaultCurrency: 'USD',
      },
    });
    customerId = customer.id;
    const adminRole = await prisma.role.findFirst({ where: { code: SYSTEM_ADMIN_ROLE_CODE } });
    assert.ok(adminRole, 'SYSTEM_ADMIN role is required.');
    const admin = await prisma.userAccount.create({
      data: {
        username: `scm-e2e-${suffix}`,
        email: `scm-e2e-${suffix}@test.local`,
        fullName: 'Shipping E2E Admin',
        userType: 'internal',
        passwordHash: await hashPassword('ShipE2E@2026!'),
        status: 'ACTIVE',
      },
    });
    adminUserId = admin.id;
    await prisma.userRole.create({ data: { userId: admin.id, roleId: adminRole.id } });
    actor = {
      id: admin.id,
      name: admin.fullName,
      email: admin.email,
      userType: 'internal',
      permissions: { salesQuotations: true, costingPricing: true, masterData: true, technicalOffice: true },
    };
  });

  after(async () => {
    const prisma = getPrisma();
    if (!prisma) return;
    if (quotationId) {
      await prisma.emailOutbox.deleteMany({
        where: { entityType: 'CommercialQuotation', entityId: quotationId, eventCode: 'QUOTATION_ISSUED' },
      });
    }
    await deleteCostingArtifactsForInquiryLines(prisma, ownedLineIds);
    await deleteCommercialInquiriesMatching(prisma, { customerReference: marker });
    if (rateIds.length) {
      await prisma.shippingCostTransactionSnapshot.deleteMany({ where: { shippingCostRateId: { in: rateIds } } });
      await prisma.auditEvent.deleteMany({ where: { entity: 'CustomerShippingCostRate', entityId: { in: rateIds } } });
      await prisma.customerShippingCostRate.deleteMany({ where: { id: { in: rateIds } } });
    }
    if (customerId) {
      await prisma.shippingCostTransactionSnapshot.deleteMany({ where: { customerId } });
      await prisma.customerShippingCostRate.deleteMany({ where: { customerId } });
      await prisma.customer.deleteMany({ where: { id: customerId } });
    }
    if (adminUserId) {
      await prisma.userRole.deleteMany({ where: { userId: adminUserId } });
      await prisma.userAccount.deleteMany({ where: { id: adminUserId } });
    }
    if (ownedFixtureRm) {
      await prisma.rawMaterialPrice.deleteMany({ where: { rawMaterialCode: ownedFixtureRm } });
      await prisma.cableBomLine.deleteMany({
        where: { cableMaterialNumber: FIXTURE, rawMaterialCode: ownedFixtureRm },
      });
      await prisma.rawMaterial.deleteMany({ where: { code: ownedFixtureRm } });
    }
    const leftoverRates = customerId
      ? await prisma.customerShippingCostRate.count({ where: { customerId } })
      : 0;
    const leftoverInquiries = await prisma.commercialInquiry.count({ where: { customerReference: marker } });
    assert.equal(leftoverRates, 0, 'Test-owned shipping rates must be deleted.');
    assert.equal(leftoverInquiries, 0, 'Test-owned inquiries must be deleted.');
    const elandAfter = await snapshotElandLanes(elandId);
    assert.equal(elandAfter.length, 6);
    assert.deepEqual(
      elandAfter.map((row) => ({ id: row.id, amount: row.amount, deliveryPoint: row.deliveryPoint, containerType: row.containerType })),
      elandBefore.map((row) => ({ id: row.id, amount: row.amount, deliveryPoint: row.deliveryPoint, containerType: row.containerType }))
    );
  });

  it('freezes 3100 through Container Study and issued quotation while a later 3500 version does not rewrite history', async () => {
    const prisma = getPrisma()!;

    const v1 = await createCustomerShippingCostRate(
      {
        customerId,
        deliveryPoint: DELIVERY_POINT,
        incotermId: dapId,
        containerType: CONTAINER_TYPE,
        amount: 3100,
        currency: CURRENCY,
        effectiveFrom: transactionDate,
        status: 'ACTIVE',
      },
      actor
    );
    rateIds.push(v1.id);
    const v1Hq = await createCustomerShippingCostRate(
      {
        customerId,
        deliveryPoint: DELIVERY_POINT,
        incotermId: dapId,
        containerType: "40' SD/HC",
        amount: 3100,
        currency: CURRENCY,
        effectiveFrom: transactionDate,
        status: 'ACTIVE',
      },
      actor
    );
    rateIds.push(v1Hq.id);
    assert.equal(v1.amount, 3100);
    assert.equal(v1.currency, CURRENCY);
    assert.equal(v1.deliveryPoint, DELIVERY_POINT);
    assert.equal(v1.containerType, CONTAINER_TYPE);
    assert.equal(v1.incotermCode, 'DAP');
    assert.equal(v1.status, 'ACTIVE');
    assert.equal(v1.version, 1);
    const createdAudit = await prisma.auditEvent.findFirst({
      where: { entity: 'CustomerShippingCostRate', entityId: v1.id, action: 'CREATE' },
    });
    assert.ok(createdAudit, 'Version 1 CREATE must be written by server-side audit.');

    const resolvedV1 = await resolveCustomerShippingCostRate({
      customerId,
      deliveryPoint: DELIVERY_POINT,
      incotermId: dapId,
      containerType: CONTAINER_TYPE,
      effectiveDate: transactionDate,
    });
    assert.equal(resolvedV1.resolutionCode, SHIPPING_COST_APPLIED);
    assert.equal(resolvedV1.amount, 3100);
    assert.equal(resolvedV1.currency, CURRENCY);
    assert.equal(resolvedV1.shippingCostRateId, v1.id);
    assert.equal(resolvedV1.shippingRateVersion, 1);
    assert.notEqual(resolvedV1.amount, null);

    const inquiry = await createInquiry(
      {
        customerId,
        customerName: `Shipping E2E ${suffix}`,
        customerReference: marker,
        projectName: `SCM E2E ${suffix}`,
        incoterms: 'DAP',
        currency: 'USD',
        inquiryDate: transactionDate,
        commercialMetadata: {
          workflowChannel: 'V2_CONFIGURATION',
          shippingDeliveryPoint: DELIVERY_POINT,
          shippingContainerType: CONTAINER_TYPE,
          containerStudyRegion: 'Europe',
        },
      },
      actor
    );
    inquiryIds.push(inquiry.id);
    assert.equal(inquiry.customerMasterId, customerId);
    assert.equal(inquiry.incoterms, 'DAP');

    const packed = await runContainerStudyAndRecordShipping({
      inquiryId: inquiry.id,
      groupCode: `SG-${suffix}`,
      incotermCode: 'DAP',
      effectiveDate: transactionDate,
    });
    assert.equal(packed.calculated.calculation.ok, true);
    assert.equal(packed.shipping.resolutionCode, SHIPPING_COST_APPLIED);
    assert.equal(packed.shipping.amount, 3100);
    assert.equal(packed.shipping.currency, CURRENCY);
    assert.equal(packed.shipping.shippingCostRateId, v1Hq.id);
    assert.equal(packed.shipping.shippingRateVersion, 1);
    assert.equal(packed.shipping.deliveryPoint, DELIVERY_POINT);
    assert.equal(packed.shipping.incotermCode, 'DAP');
    assert.equal(packed.shipping.containerType, "40' SD/HC");
    assert.ok(packed.shipping.appliedAt, 'Applied timestamp must be captured.');
    assert.equal(packed.shipping.blocksPacking, false);
    assert.notEqual(packed.shipping.resolutionCode, SHIPPING_COST_NOT_CONFIGURED);

    const studySnapshot = await prisma.shippingCostTransactionSnapshot.findUnique({
      where: { containerStudyResultId: packed.resultId },
      include: { incoterm: true },
    });
    assert.ok(studySnapshot);
    assert.equal(Number(studySnapshot.amount), 3100);
    assert.equal(studySnapshot.currency, CURRENCY);
    assert.equal(studySnapshot.shippingCostRateId, v1Hq.id);
    assert.equal(studySnapshot.shippingRateVersion, 1);
    assert.equal(studySnapshot.deliveryPoint, DELIVERY_POINT);
    assert.equal(studySnapshot.incoterm?.code, 'DAP');
    assert.equal(studySnapshot.containerType, "40' SD/HC");
    assert.ok(studySnapshot.appliedAt);

    const line = await addInquiryLine(
      inquiry.id,
      {
        materialNumber: FIXTURE,
        customerCode: 'N2XH',
        cableDescription: `FIXTURE ${FIXTURE} shipping e2e ${suffix}`,
        requestedQuantity: 1,
        requestedLengthMeters: 100,
      },
      actor
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
      actor
    );
    assert.equal(snap.snapshot.flowState, 'VALID');
    await persistV2CuttingLengthPlan(inquiry.id, line.id, { nominalLengthM: 100, tolerancePercent: 0 }, actor);
    const drum = await createDraftV2DrumPlan(inquiry.id, line.id, { selectionMethod: 'AUTOMATIC' }, actor);
    const planKey = drum.drumPlan.planId || drum.drumPlan.id;
    await validateV2DrumPlan(inquiry.id, line.id, planKey, actor);
    await confirmV2DrumPlan(inquiry.id, line.id, planKey, actor);

    ownedFixtureRm = `I4-RM-BOM-${marker}`.toUpperCase();
    await prisma.rawMaterial.create({
      data: {
        code: ownedFixtureRm,
        description: 'Shipping E2E fixture BOM raw material',
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
      await processPriceWorkflowAction(draftPrice.id, 'APPROVE', { comment: 'FIXTURE-TEST-ONLY approve' }, actor);
    }
    const costing = await calculateV2CostingRun(inquiry.id, line.id, actor);
    assert.equal(costing.persisted, true, (costing.blockingReasons || []).join('; '));
    await upsertInquiryLineAttachment(
      line.id,
      {
        kind: 'TECHNICAL_OFFER',
        fileName: 'FIXTURE-shipping-e2e-technical-offer.txt',
        mimeType: 'text/plain',
        contentBase64: Buffer.from('FIXTURE technical offer for shipping cost e2e.').toString('base64'),
      },
      actor
    );
    await createV2QuotationDraft(inquiry.id, actor);
    await submitInquiry(inquiry.id, actor);
    const priced = await persistV2QuotationPricing(inquiry.id, actor, { requestedDiscountPercentage: 0 });
    quotationId = priced.id;
    await approveQuotationPricing(priced.id, { comment: 'Shipping e2e pricing approval' }, actor);
    const approved = await approveV2Quotation(inquiry.id, actor);
    assert.ok(approved.quotationApprovedAt);
    const beforeSign = await loadDecision5SignOff();
    if (!beforeSign.signed) {
      const signed = await signDecision5OptionB(actor);
      assert.equal(signed.signed, true);
    }
    const issued = await issueV2Quotation(inquiry.id, actor);
    assert.ok(issued.issuedAt);
    const issuedOffer = issued.commercialOfferSnapshot as {
      productsTotal?: number | null;
      shipmentTotal?: number | null;
      grandTotal?: number | null;
      shippingCostSnapshot?: { amount?: number; currency?: string; shippingCostRateId?: string; shippingRateVersion?: number };
    };
    assert.equal(issuedOffer.shippingCostSnapshot?.amount, 3100);
    assert.equal(issuedOffer.shippingCostSnapshot?.currency, CURRENCY);
    assert.equal(issuedOffer.shippingCostSnapshot?.shippingCostRateId, v1Hq.id);
    const issuedTotals = {
      productsTotal: issuedOffer.productsTotal ?? null,
      shipmentTotal: issuedOffer.shipmentTotal ?? null,
      grandTotal: issuedOffer.grandTotal ?? null,
    };
    const quotationSnapshot = await prisma.shippingCostTransactionSnapshot.findUnique({
      where: { quotationId: issued.id },
      include: { incoterm: true },
    });
    assert.ok(quotationSnapshot);
    assert.equal(Number(quotationSnapshot.amount), 3100);
    assert.equal(quotationSnapshot.currency, CURRENCY);
    assert.equal(quotationSnapshot.shippingCostRateId, v1Hq.id);
    assert.equal(quotationSnapshot.shippingRateVersion, 1);
    assert.equal(quotationSnapshot.deliveryPoint, DELIVERY_POINT);
    assert.equal(quotationSnapshot.incoterm?.code, 'DAP');
    assert.equal(quotationSnapshot.containerType, "40' SD/HC");

    const v2 = await createCustomerShippingCostRate(
      {
        customerId,
        deliveryPoint: DELIVERY_POINT,
        incotermId: dapId,
        containerType: "40' SD/HC",
        amount: 3500,
        currency: CURRENCY,
        effectiveFrom: v2EffectiveFrom,
        status: 'ACTIVE',
      },
      actor
    );
    rateIds.push(v2.id);
    assert.equal(v2.amount, 3500);
    assert.equal(v2.version, 2);
    assert.equal(v2.status, 'ACTIVE');
    const closed = await prisma.customerShippingCostRate.findUnique({ where: { id: v1Hq.id } });
    assert.equal(Number(closed?.amount), 3100);
    assert.equal(closed?.status, 'SUPERSEDED');
    const versionAudit = await prisma.auditEvent.findFirst({
      where: { entity: 'CustomerShippingCostRate', entityId: v2.id, action: 'CREATE NEW VERSION' },
    });
    assert.ok(versionAudit, 'CREATE NEW VERSION must be written by server-side audit.');
    assert.match(String(versionAudit?.message), /Previous version 1/);
    assert.match(String(versionAudit?.message), new RegExp(v2EffectiveFrom));

    const reloaded = await prisma.commercialQuotation.findUnique({ where: { id: issued.id } });
    const reloadedOffer = reloaded?.commercialOfferSnapshot as {
      productsTotal?: number | null;
      shipmentTotal?: number | null;
      grandTotal?: number | null;
      shippingCostSnapshot?: { amount?: number };
    };
    assert.equal(reloadedOffer.shippingCostSnapshot?.amount, 3100);
    assert.notEqual(reloadedOffer.shippingCostSnapshot?.amount, 3500);
    assert.equal(reloadedOffer.productsTotal ?? null, issuedTotals.productsTotal);
    assert.equal(reloadedOffer.shipmentTotal ?? null, issuedTotals.shipmentTotal);
    assert.equal(reloadedOffer.grandTotal ?? null, issuedTotals.grandTotal);
    const frozenAgain = await prisma.shippingCostTransactionSnapshot.findUnique({ where: { quotationId: issued.id } });
    assert.equal(Number(frozenAgain?.amount), 3100);
    assert.equal(frozenAgain?.shippingCostRateId, v1Hq.id);
    assert.equal(frozenAgain?.shippingRateVersion, 1);

    const laterInquiry = await createInquiry(
      {
        customerId,
        customerName: `Shipping E2E later ${suffix}`,
        customerReference: marker,
        projectName: `SCM E2E later ${suffix}`,
        incoterms: 'DAP',
        currency: 'USD',
        inquiryDate: v2EffectiveFrom,
        commercialMetadata: {
          workflowChannel: 'V2_CONFIGURATION',
          shippingDeliveryPoint: DELIVERY_POINT,
          shippingContainerType: CONTAINER_TYPE,
          containerStudyRegion: 'Europe',
        },
      },
      actor
    );
    inquiryIds.push(laterInquiry.id);
    const laterPacked = await runContainerStudyAndRecordShipping({
      inquiryId: laterInquiry.id,
      groupCode: `SG-LATER-${suffix}`,
      incotermCode: 'DAP',
      effectiveDate: v2EffectiveFrom,
    });
    assert.equal(laterPacked.calculated.calculation.ok, true);
    assert.equal(laterPacked.shipping.resolutionCode, SHIPPING_COST_APPLIED);
    assert.equal(laterPacked.shipping.amount, 3500);
    assert.equal(laterPacked.shipping.shippingCostRateId, v2.id);
    assert.equal(laterPacked.shipping.shippingRateVersion, 2);
    const laterSnapshot = await prisma.shippingCostTransactionSnapshot.findUnique({
      where: { containerStudyResultId: laterPacked.resultId },
    });
    assert.equal(Number(laterSnapshot?.amount), 3500);
    assert.equal(laterSnapshot?.shippingCostRateId, v2.id);
    assert.equal(laterSnapshot?.shippingRateVersion, 2);

    const beforeResolved = await resolveCustomerShippingCostRate({
      customerId,
      deliveryPoint: DELIVERY_POINT,
      incotermId: dapId,
      containerType: CONTAINER_TYPE,
      effectiveDate: beforeNewEffectiveFrom,
    });
    assert.equal(beforeResolved.resolutionCode, SHIPPING_COST_APPLIED);
    assert.equal(beforeResolved.amount, 3100);
    assert.equal(beforeResolved.shippingCostRateId, v1.id);
    assert.equal(beforeResolved.shippingRateVersion, 1);
    assert.notEqual(beforeResolved.amount, 3500);

    const missingInquiry = await createInquiry(
      {
        customerId,
        customerName: `Shipping E2E missing ${suffix}`,
        customerReference: marker,
        projectName: `SCM E2E missing ${suffix}`,
        incoterms: 'DAP',
        currency: 'USD',
        inquiryDate: transactionDate,
        commercialMetadata: {
          workflowChannel: 'V2_CONFIGURATION',
          shippingDeliveryPoint: 'Rotterdam',
          shippingContainerType: CONTAINER_TYPE,
          containerStudyRegion: 'Europe',
        },
      },
      actor
    );
    inquiryIds.push(missingInquiry.id);
    const missingPacked = await runContainerStudyAndRecordShipping({
      inquiryId: missingInquiry.id,
      groupCode: `SG-MISS-${suffix}`,
      incotermCode: 'DAP',
      effectiveDate: transactionDate,
      lineageDestinationPortCode: 'ROTTERDAM',
      lineageIncotermCode: 'CIF',
    });
    assert.equal(missingPacked.calculated.calculation.ok, true, 'Missing financial rate must not block packing.');
    assert.equal(missingPacked.shipping.resolutionCode, SHIPPING_COST_NOT_CONFIGURED);
    assert.equal(missingPacked.shipping.amount, 0);
    assert.equal(missingPacked.shipping.blocksPacking, false);
    assert.equal(missingPacked.shipping.shippingCostRateId, null);

    const incotermByCode: Record<string, string> = { DAP: dapId, CIF: cifId };
    for (const expected of ELAND_SHIPPING_COST_SEED) {
      const resolved = await resolveCustomerShippingCostRate({
        customerId: elandId,
        deliveryPoint: expected.deliveryPoint,
        incotermId: incotermByCode[expected.incotermCode],
        containerType: expected.containerType,
        effectiveDate: '2026-09-23',
      });
      assert.equal(resolved.resolutionCode, SHIPPING_COST_APPLIED);
      assert.equal(resolved.amount, expected.amount);
      assert.equal(resolved.currency, CURRENCY);
    }
    const elandNow = await snapshotElandLanes(elandId);
    assert.equal(elandNow.length, 6);
    assert.deepEqual(
      elandNow.map((row) => ({
        deliveryPoint: row.deliveryPoint,
        containerType: row.containerType,
        incotermCode: row.incotermCode,
        amount: row.amount,
      })),
      elandBefore.map((row) => ({
        deliveryPoint: row.deliveryPoint,
        containerType: row.containerType,
        incotermCode: row.incotermCode,
        amount: row.amount,
      }))
    );
    assert.deepEqual(
      elandNow.map((row) => ({ deliveryPoint: row.deliveryPoint, containerType: row.containerType, incotermCode: row.incotermCode, amount: row.amount })),
      ELAND_SHIPPING_COST_SEED.map((row) => ({
        deliveryPoint: row.deliveryPoint,
        containerType: row.containerType,
        incotermCode: row.incotermCode,
        amount: row.amount,
      })).sort((a, b) => `${a.deliveryPoint}${a.containerType}`.localeCompare(`${b.deliveryPoint}${b.containerType}`))
    );
  });
});
