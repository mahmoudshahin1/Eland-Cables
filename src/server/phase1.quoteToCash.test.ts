/**
 * Phase 1 quote-to-cash domain lifecycle (Spec §10–13, §24–25).
 * No live D365. Pricing approval (Increment 12) remains a prerequisite, not a substitute.
 */
import assert from 'node:assert/strict';
import { describe, it, before, after } from 'node:test';
import dotenv from 'dotenv';
import { checkDatabase, disconnectPrisma, getPrisma } from './db';
import {
  approveCommercialQuotation,
  createAgreementRelease,
  createCommitmentFromQuotation,
  createSalesAgreementFromApprovedQuotation,
  createSalesAgreementFromCommitment,
  createSalesOrderFromApprovedQuotation,
  createSalesOrderFromCommitment,
  getCommitmentById,
  getSalesAgreementById,
  getSalesOrderById,
} from './commercialCommitmentRepository';
import { DomainError } from '../platform/errors/domainError';
import { deleteQuoteToCashDependentsForQuotations } from './quoteToCashTestCleanup';
import type { RequestActor } from './auth';

dotenv.config();

describe('Phase 1 — Quote-to-Cash domain (commitment / SO / agreement / release)', () => {
  const managerUser = {
    id: 'u-p1-mgr',
    name: 'Phase1 Manager',
    email: 'phase1.manager@energya.com',
    userType: 'internal' as const,
    permissions: { salesQuotations: true, masterData: true, costingPricing: true },
  } satisfies RequestActor;

  const salesUser = {
    id: 'u-p1-sales',
    name: 'Phase1 Sales',
    email: 'phase1.sales@energya.com',
    userType: 'internal' as const,
    permissions: { salesQuotations: true, masterData: false },
  } satisfies RequestActor;

  let directQuoteId: string;
  let agreementQuoteId: string;
  let directLineIds: string[] = [];
  let agreementLineIds: string[] = [];

  async function seedApprovedQuotation(opts: {
    quotationNumber: string;
    customerId: string;
    lines: Array<{ qty: number; price: number; desc: string }>;
  }) {
    const prisma = getPrisma()!;
    const inquiry = await prisma.commercialInquiry.create({
      data: {
        inquiryNumber: `INQ-${opts.quotationNumber}`,
        customerId: opts.customerId,
        customerName: `Customer ${opts.customerId}`,
        status: 'QUOTED',
        currency: 'USD',
        lines: {
          create: opts.lines.map((l, i) => ({
            lineNumber: i + 1,
            cableDescription: l.desc,
            requestedQuantity: l.qty,
            quantityUom: 'KM',
            requestedLengthMeters: l.qty * 1000,
            materialCost: l.price * 0.7,
            status: 'READY_FOR_QUOTATION',
          })),
        },
      },
      include: { lines: true },
    });

    const quotation = await prisma.commercialQuotation.create({
      data: {
        quotationNumber: opts.quotationNumber,
        inquiryId: inquiry.id,
        customerId: opts.customerId,
        customerName: inquiry.customerName,
        versionNo: 1,
        isCurrent: true,
        status: 'OPEN',
        currency: 'USD',
        materialCostTotal: opts.lines.reduce((s, l) => s + l.price * 0.7 * l.qty, 0),
        commercialPricingStatus: 'PRICING_APPROVED',
        commercialApprovalStatus: 'NOT_SUBMITTED',
        sellingPrice: opts.lines.reduce((s, l) => s + l.price * l.qty, 0),
        createdBy: managerUser.name,
        lines: {
          create: opts.lines.map((l, i) => ({
            lineNumber: i + 1,
            inquiryLineId: inquiry.lines[i]?.id,
            itemDescription: l.desc,
            materialNumber: `MAT-${opts.quotationNumber}-${i + 1}`,
            quantity: l.qty,
            quantityUom: 'KM',
            lengthMeters: l.qty * 1000,
            customerCableCode: `CC-${i + 1}`,
            sellingPrice: l.price,
            materialCost: l.price * 0.7,
            commercialStatus: 'PRICING_APPROVED',
            drumType: 'Wood Reel 220',
            cuttingLengthMeters: 500,
          })),
        },
      },
      include: { lines: true },
    });

    return quotation;
  }

  before(async () => {
    const health = await checkDatabase();
    assert.equal(health.ok, true, health.error);
    const prisma = getPrisma()!;

    const leftover = await prisma.commercialQuotation.findMany({
      where: { quotationNumber: { startsWith: 'P1Q-' } },
      select: { id: true },
    });
    await deleteQuoteToCashDependentsForQuotations(
      prisma,
      leftover.map((row) => row.id)
    );
    await prisma.commercialPricingSnapshot.deleteMany({
      where: { quotationLine: { quotation: { quotationNumber: { startsWith: 'P1Q-' } } } },
    }).catch(() => undefined);
    await prisma.commercialQuotationLine.deleteMany({
      where: { quotation: { quotationNumber: { startsWith: 'P1Q-' } } },
    });
    await prisma.commercialQuotation.deleteMany({ where: { quotationNumber: { startsWith: 'P1Q-' } } });
    await prisma.commercialInquiryLine.deleteMany({
      where: { inquiry: { inquiryNumber: { startsWith: 'INQ-P1Q-' } } },
    });
    await prisma.commercialInquiry.deleteMany({ where: { inquiryNumber: { startsWith: 'INQ-P1Q-' } } });

    const direct = await seedApprovedQuotation({
      quotationNumber: 'P1Q-DIRECT',
      customerId: 'CUST-P1-DIRECT',
      lines: [
        { qty: 600, price: 100, desc: 'Cable A' },
        { qty: 400, price: 120, desc: 'Cable B' },
      ],
    });
    directQuoteId = direct.id;
    directLineIds = direct.lines.map((l) => l.id);

    const agreement = await seedApprovedQuotation({
      quotationNumber: 'P1Q-AGREE',
      customerId: 'CUST-P1-AGREE',
      lines: [{ qty: 1000, price: 150, desc: 'Agreement Cable' }],
    });
    agreementQuoteId = agreement.id;
    agreementLineIds = agreement.lines.map((l) => l.id);
  });

  after(async () => {
    const prisma = getPrisma();
    if (prisma) {
      const owned = await prisma.commercialQuotation.findMany({
        where: { quotationNumber: { startsWith: 'P1Q-' } },
        select: { id: true },
      });
      await deleteQuoteToCashDependentsForQuotations(
        prisma,
        owned.map((row) => row.id)
      );
      await prisma.commercialQuotationLine.deleteMany({
        where: { quotation: { quotationNumber: { startsWith: 'P1Q-' } } },
      });
      await prisma.commercialQuotation.deleteMany({ where: { quotationNumber: { startsWith: 'P1Q-' } } });
      await prisma.commercialInquiryLine.deleteMany({
        where: { inquiry: { inquiryNumber: { startsWith: 'INQ-P1Q-' } } },
      });
      await prisma.commercialInquiry.deleteMany({ where: { inquiryNumber: { startsWith: 'INQ-P1Q-' } } });
      await prisma.cableMaster.deleteMany({
        where: { materialNumber: { in: ['P1-MTS-CABLE', 'P1-MTO-ONLY', 'P1-MTO-MTS', 'P1-MTS-IDEM'] } },
      });
    }
    await disconnectPrisma();
  });

  it('rejects commercial approval without pricing approval', async () => {
    const prisma = getPrisma()!;
    const q = await prisma.commercialQuotation.create({
      data: {
        quotationNumber: 'P1Q-NOPRICE',
        inquiryId: (await prisma.commercialInquiry.findFirst({ where: { inquiryNumber: 'INQ-P1Q-DIRECT' } }))!.id,
        customerId: 'CUST-P1-DIRECT',
        customerName: 'Customer CUST-P1-DIRECT',
        versionNo: 99,
        isCurrent: false,
        status: 'OPEN',
        commercialPricingStatus: 'PRICING_CALCULATED',
        commercialApprovalStatus: 'NOT_SUBMITTED',
        lines: { create: [{ lineNumber: 1, itemDescription: 'x', quantity: 1 }] },
      },
    });

    await assert.rejects(
      () => approveCommercialQuotation(q.id, { fulfillmentType: 'DIRECT_ORDER' }, managerUser),
      (err: unknown) => err instanceof DomainError && err.code === 'BUSINESS_RULE_REQUIRED'
    );
  });

  it('DIRECT_ORDER: approve → commitment → multiple partial sales orders with remaining qty', async () => {
    const approved = await approveCommercialQuotation(
      directQuoteId,
      { fulfillmentType: 'DIRECT_ORDER', shipTo: 'Alexandria Port' },
      managerUser
    );
    assert.equal(approved.commercialApprovalStatus, 'APPROVED');
    assert.equal(approved.fulfillmentType, 'DIRECT_ORDER');
    assert.equal(approved.commercialPricingStatus, 'PRICING_APPROVED');

    const commitment = await createCommitmentFromQuotation(directQuoteId, salesUser);
    assert.equal(commitment.fulfillmentType, 'DIRECT_ORDER');
    assert.equal(Number(commitment.totalCommittedQuantity), 1000);
    assert.equal(Number(commitment.remainingQuantity), 1000);

    const so1 = await createSalesOrderFromCommitment(
      commitment.id,
      {
        lines: [{ quotationLineId: directLineIds[0], quantity: 300 }],
        shipTo: 'Alexandria Port',
      },
      salesUser
    );
    assert.equal(so1.integrationStatus, 'NOT_SENT');
    assert.equal(so1.orderOrigin, 'QUOTATION');
    assert.equal(so1.orderFulfillmentMode, 'MTO');
    assert.equal(so1.lines.length, 1);
    assert.equal(Number(so1.lines[0].quantity), 300);
    assert.equal(so1.lines[0].costingCalculationId, null); // snapshot copy only; seed had no costing id
    assert.ok(so1.lines[0].drumType);

    const after1 = await getCommitmentById(commitment.id, salesUser);
    assert.equal(Number(after1.orderedQuantity), 300);
    assert.equal(Number(after1.remainingQuantity), 700);

    const so2 = await createSalesOrderFromCommitment(
      commitment.id,
      {
        lines: [
          { quotationLineId: directLineIds[0], quantity: 300 },
          { quotationLineId: directLineIds[1], quantity: 400 },
        ],
      },
      salesUser
    );
    assert.equal(so2.lines.length, 2);

    const after2 = await getCommitmentById(commitment.id, salesUser);
    assert.equal(Number(after2.remainingQuantity), 0);
    assert.equal(after2.status, 'COMPLETED');

    await assert.rejects(
      () =>
        createSalesOrderFromCommitment(
          commitment.id,
          { lines: [{ quotationLineId: directLineIds[0], quantity: 1 }] },
          salesUser
        ),
      (err: unknown) => err instanceof DomainError && err.code === 'BUSINESS_RULE_REQUIRED'
    );
  });

  it('SALES_AGREEMENT: approve → commitment → agreement → releases with remaining qty tracking', async () => {
    const approved = await approveCommercialQuotation(
      agreementQuoteId,
      { fulfillmentType: 'SALES_AGREEMENT' },
      managerUser
    );
    assert.equal(approved.fulfillmentType, 'SALES_AGREEMENT');

    const commitment = await createCommitmentFromQuotation(agreementQuoteId, salesUser);
    assert.equal(commitment.fulfillmentType, 'SALES_AGREEMENT');

    await assert.rejects(
      () => createSalesOrderFromCommitment(commitment.id, {}, salesUser),
      (err: unknown) => err instanceof DomainError && err.code === 'BUSINESS_RULE_REQUIRED'
    );

    const agreement = await createSalesAgreementFromCommitment(
      commitment.id,
      { validFrom: '2026-09-01', validTo: '2027-08-31' },
      salesUser
    );
    assert.equal(Number(agreement.totalCommittedQuantity), 1000);
    assert.equal(Number(agreement.remainingQuantity), 1000);
    assert.equal(agreement.integrationStatus, 'NOT_SENT');
    assert.equal(agreement.lines.length, 1);
    const agreementLineId = agreement.lines[0].id;

    const release1 = await createAgreementRelease(
      agreement.id,
      {
        lines: [{ agreementLineId, quantity: 250 }],
        requestedDeliveryDate: '2026-10-15',
      },
      salesUser
    );
    assert.equal(Number(release1.release.totalReleasedQuantity), 250);
    assert.equal(release1.salesOrder.integrationStatus, 'NOT_SENT');
    assert.equal(release1.salesOrder.orderOrigin, 'AGREEMENT_RELEASE');
    assert.equal(release1.salesOrder.orderFulfillmentMode, 'MTO');
    assert.ok(release1.salesOrder.agreementReleaseId);

    const mid = await getSalesAgreementById(agreement.id, salesUser);
    assert.equal(Number(mid.totalReleasedQuantity), 250);
    assert.equal(Number(mid.remainingQuantity), 750);
    assert.equal(Number(mid.lines[0].remainingQuantity), 750);

    await createAgreementRelease(
      agreement.id,
      { lines: [{ agreementLineId, quantity: 750 }] },
      salesUser
    );

    const done = await getSalesAgreementById(agreement.id, salesUser);
    assert.equal(Number(done.remainingQuantity), 0);
    assert.equal(done.status, 'COMPLETED');

    await assert.rejects(
      () =>
        createAgreementRelease(agreement.id, { lines: [{ agreementLineId, quantity: 1 }] }, salesUser),
      (err: unknown) => err instanceof DomainError && err.code === 'BUSINESS_RULE_REQUIRED'
    );

    const cmt = await getCommitmentById(commitment.id, salesUser);
    assert.equal(Number(cmt.remainingQuantity), 0);
    assert.equal(cmt.status, 'COMPLETED');
  });

  it('does not create commitment from non-approved quotation', async () => {
    const prisma = getPrisma()!;
    const bare = await prisma.commercialQuotation.findFirst({
      where: { quotationNumber: 'P1Q-NOPRICE' },
    });
    assert.ok(bare);
    await assert.rejects(
      () => createCommitmentFromQuotation(bare!.id, salesUser),
      (err: unknown) => err instanceof DomainError && err.code === 'BUSINESS_RULE_REQUIRED'
    );
  });

  it('F: commercially approved revision is immutable (re-approve / reprice blocked)', async () => {
    const prisma = getPrisma()!;
    const q = await seedApprovedQuotation({
      quotationNumber: 'P1Q-IMMUT',
      customerId: 'CUST-P1-IMMUT',
      lines: [{ qty: 100, price: 50, desc: 'Immutable cable' }],
    });
    await approveCommercialQuotation(q.id, { fulfillmentType: 'DIRECT_ORDER' }, managerUser);

    await assert.rejects(
      () => approveCommercialQuotation(q.id, { fulfillmentType: 'SALES_AGREEMENT' }, managerUser),
      (err: unknown) => err instanceof DomainError && err.code === 'CONFLICT'
    );

    const { priceQuotation } = await import('./commercialPricingRepository');
    await assert.rejects(
      () => priceQuotation(q.id, {}, managerUser),
      (err: unknown) => (err as { code?: string }).code === 'BUSINESS_RULE_REQUIRED'
    );

    const frozen = await prisma.commercialQuotation.findUnique({ where: { id: q.id } });
    assert.equal(frozen?.commercialApprovalStatus, 'APPROVED');
    assert.equal(frozen?.fulfillmentType, 'DIRECT_ORDER');
  });

  it('G: new revision after commercial approval resets approval on Vn+1; prior stays APPROVED', async () => {
    const { createQuotationRevision } = await import('./commercialRepository');
    const q = await seedApprovedQuotation({
      quotationNumber: 'P1Q-REV',
      customerId: 'CUST-P1-REV',
      lines: [{ qty: 50, price: 80, desc: 'Rev cable' }],
    });
    await approveCommercialQuotation(q.id, { fulfillmentType: 'DIRECT_ORDER' }, managerUser);

    const next = await createQuotationRevision(q.quotationNumber, {}, managerUser);
    assert.equal(next.versionNo, 2);
    assert.equal(next.commercialApprovalStatus, 'NOT_SUBMITTED');
    assert.equal(next.fulfillmentType, null);
    assert.equal(next.isCurrent, true);

    const prisma = getPrisma()!;
    const prior = await prisma.commercialQuotation.findUnique({ where: { id: q.id } });
    assert.equal(prior?.commercialApprovalStatus, 'APPROVED');
    assert.equal(prior?.isCurrent, false);
    assert.equal(prior?.status, 'SUPERSEDED');
  });

  it('H: SO snapshot independent of later quotation / line mutation', async () => {
    const q = await seedApprovedQuotation({
      quotationNumber: 'P1Q-SNAP',
      customerId: 'CUST-P1-SNAP',
      lines: [{ qty: 200, price: 90, desc: 'Snapshot cable' }],
    });
    await approveCommercialQuotation(q.id, { fulfillmentType: 'DIRECT_ORDER' }, managerUser);
    const so = await createSalesOrderFromApprovedQuotation(q.id, {}, salesUser);
    assert.equal(so.lines[0].itemDescription, 'Snapshot cable');
    assert.equal(Number(so.lines[0].unitPrice), 90);
    assert.equal(so.integrationStatus, 'NOT_SENT');

    const prisma = getPrisma()!;
    await prisma.commercialQuotationLine.update({
      where: { id: q.lines[0].id },
      data: { itemDescription: 'MUTATED AFTER SO', sellingPrice: 999, materialNumber: 'MUTATED-MAT' },
    });

    const reloaded = await getSalesOrderById(so.id, salesUser);
    assert.equal(reloaded.lines[0].itemDescription, 'Snapshot cable');
    assert.equal(Number(reloaded.lines[0].unitPrice), 90);
    assert.notEqual(reloaded.lines[0].materialNumber, 'MUTATED-MAT');
  });

  it('I: duplicate direct-order create is idempotent (one document)', async () => {
    const q = await seedApprovedQuotation({
      quotationNumber: 'P1Q-DUP-SO',
      customerId: 'CUST-P1-DUP-SO',
      lines: [{ qty: 150, price: 70, desc: 'Dup SO cable' }],
    });
    await approveCommercialQuotation(q.id, { fulfillmentType: 'DIRECT_ORDER' }, managerUser);
    const so1 = await createSalesOrderFromApprovedQuotation(q.id, {}, salesUser);
    const so2 = await createSalesOrderFromApprovedQuotation(q.id, {}, salesUser);
    assert.equal(so1.id, so2.id);
    assert.equal(so1.salesOrderNumber, so2.salesOrderNumber);

    const prisma = getPrisma()!;
    const count = await prisma.epcSalesOrder.count({ where: { quotationId: q.id } });
    assert.equal(count, 1);
  });

  it('J: duplicate agreement release is idempotent; over-release message includes qty breakdown', async () => {
    const q = await seedApprovedQuotation({
      quotationNumber: 'P1Q-DUP-REL',
      customerId: 'CUST-P1-DUP-REL',
      lines: [{ qty: 400, price: 60, desc: 'Dup release cable' }],
    });
    await approveCommercialQuotation(q.id, { fulfillmentType: 'SALES_AGREEMENT' }, managerUser);
    const agreement = await createSalesAgreementFromApprovedQuotation(q.id, {}, salesUser);
    const lineId = agreement.lines[0].id;

    const r1 = await createAgreementRelease(
      agreement.id,
      { lines: [{ agreementLineId: lineId, quantity: 400 }] },
      salesUser
    );
    const r2 = await createAgreementRelease(
      agreement.id,
      { lines: [{ agreementLineId: lineId, quantity: 400 }] },
      salesUser
    );
    assert.equal(r1.release.id, r2.release.id);
    assert.equal(r1.salesOrder.id, r2.salesOrder.id);

    await assert.rejects(
      () => createAgreementRelease(agreement.id, { lines: [{ agreementLineId: lineId, quantity: 10 }] }, salesUser),
      (err: unknown) => {
        if (!(err instanceof DomainError) || err.code !== 'BUSINESS_RULE_REQUIRED') return false;
        return (
          err.message.includes('committed=') &&
          err.message.includes('alreadyReleased=') &&
          err.message.includes('requested=') &&
          err.message.includes('remaining=')
        );
      }
    );
  });

  it('K: fulfillment succeeds while D365 adapters remain NOT_IMPLEMENTED', async () => {
    const { salesOrderIntegrationAdapter, salesAgreementIntegrationAdapter } = await import(
      '../platform/integration/d365Adapters'
    );
    const q = await seedApprovedQuotation({
      quotationNumber: 'P1Q-D365',
      customerId: 'CUST-P1-D365',
      lines: [{ qty: 80, price: 55, desc: 'D365-indep cable' }],
    });
    await approveCommercialQuotation(q.id, { fulfillmentType: 'DIRECT_ORDER' }, managerUser);
    const so = await createSalesOrderFromApprovedQuotation(q.id, {}, salesUser);
    assert.equal(so.integrationStatus, 'NOT_SENT');
    assert.equal(so.d365SalesOrderNumber, null);

    const adapter = await salesOrderIntegrationAdapter.postSalesOrder(so.salesOrderNumber);
    assert.equal(adapter.status, 'NOT_IMPLEMENTED');
    const saAdapter = await salesAgreementIntegrationAdapter.postSalesAgreement('SA-UNUSED');
    assert.equal(saAdapter.status, 'NOT_IMPLEMENTED');
  });

  async function seedCable(opts: {
    materialNumber: string;
    fulfillmentPolicy: 'MTO' | 'MTS' | 'MTO_MTS';
    description?: string;
  }) {
    const prisma = getPrisma()!;
    await prisma.cableMaster.deleteMany({ where: { materialNumber: opts.materialNumber } }).catch(() => undefined);
    return prisma.cableMaster.create({
      data: {
        materialNumber: opts.materialNumber,
        itemCode: opts.materialNumber,
        customerCode: `CC-${opts.materialNumber}`,
        description: opts.description || `Cable ${opts.materialNumber}`,
        diameter: 10,
        weight: 100,
        uom: 'KM',
        status: 'ACTIVE',
        fulfillmentPolicy: opts.fulfillmentPolicy,
      },
    });
  }

  it('L: MTS → Direct Sales Order without quotation / Commercial Commitment', async () => {
    const { createDirectMtsSalesOrder } = await import('./commercialCommitmentRepository');
    await seedCable({ materialNumber: 'P1-MTS-CABLE', fulfillmentPolicy: 'MTS' });

    const so = await createDirectMtsSalesOrder(
      {
        customerId: 'CUST-P1-MTS',
        customerName: 'MTS Customer',
        customerReference: 'PO-MTS-001',
        shipTo: 'Cairo Warehouse',
        idempotencyKey: 'p1-mts-direct-l',
        lines: [
          {
            materialNumber: 'P1-MTS-CABLE',
            quantity: 2.5,
            quantityUom: 'KM',
            unitPrice: 200,
            discountPercent: 5,
            cuttingLengthMeters: 500,
            numberOfCuts: 5,
            drumType: 'Wood Reel 220',
            drumQuantity: 5,
            availableStockQuantity: 12,
          },
        ],
      },
      salesUser
    );

    assert.equal(so.orderOrigin, 'DIRECT_MTS');
    assert.equal(so.orderFulfillmentMode, 'MTS');
    assert.equal(so.commitmentId, null);
    assert.equal(so.quotationId, null);
    assert.equal(so.integrationStatus, 'NOT_SENT');
    assert.equal(so.customerReference, 'PO-MTS-001');
    assert.equal(so.lines.length, 1);
    assert.equal(so.lines[0].materialNumber, 'P1-MTS-CABLE');
    assert.equal(Number(so.lines[0].quantity), 2.5);
    assert.equal(Number(so.lines[0].cuttingLengthMeters), 500);
    assert.equal(so.lines[0].drumType, 'Wood Reel 220');
    assert.equal(Number(so.lines[0].drumQuantity), 5);
    assert.equal(Number(so.lines[0].availableStockQuantity), 12);
    assert.ok(so.lines[0].netPrice != null);
  });

  it('M: prevent Direct MTS for MTO-only cables; allow MTS and MTO_MTS', async () => {
    const { createDirectMtsSalesOrder } = await import('./commercialCommitmentRepository');
    await seedCable({ materialNumber: 'P1-MTO-ONLY', fulfillmentPolicy: 'MTO' });
    await seedCable({ materialNumber: 'P1-MTO-MTS', fulfillmentPolicy: 'MTO_MTS' });

    await assert.rejects(
      () =>
        createDirectMtsSalesOrder(
          {
            customerId: 'CUST-P1-MTS',
            lines: [{ materialNumber: 'P1-MTO-ONLY', quantity: 1, unitPrice: 10 }],
          },
          salesUser
        ),
      (err: unknown) =>
        err instanceof DomainError &&
        err.code === 'BUSINESS_RULE_REQUIRED' &&
        err.message.includes('MTO only') &&
        err.message.includes('Quotation')
    );

    const so = await createDirectMtsSalesOrder(
      {
        customerId: 'CUST-P1-MTS',
        idempotencyKey: 'p1-mto-mts-ok',
        lines: [
          {
            materialNumber: 'P1-MTO-MTS',
            quantity: 1,
            unitPrice: 40,
            cuttingLengthMeters: 250,
            drumType: 'Steel Reel 160',
          },
        ],
      },
      salesUser
    );
    assert.equal(so.orderOrigin, 'DIRECT_MTS');
    assert.equal(so.lines[0].drumType, 'Steel Reel 160');
    assert.equal(Number(so.lines[0].cuttingLengthMeters), 250);
  });

  it('N: Direct MTS preserves drum/cutting; records DIRECT_MTS; idempotent; D365 NOT_IMPLEMENTED', async () => {
    const { createDirectMtsSalesOrder } = await import('./commercialCommitmentRepository');
    const { salesOrderIntegrationAdapter } = await import('../platform/integration/d365Adapters');
    await seedCable({ materialNumber: 'P1-MTS-IDEM', fulfillmentPolicy: 'MTS' });

    const payload = {
      customerId: 'CUST-P1-MTS',
      customerReference: 'PO-IDEM',
      idempotencyKey: 'p1-mts-idem-n',
      lines: [
        {
          materialNumber: 'P1-MTS-IDEM',
          quantity: 3,
          unitPrice: 75,
          cuttingLengthMeters: 1000,
          numberOfCuts: 3,
          drumType: 'Wood Reel 250',
          drumSize: '250',
          drumQuantity: 3,
          drumLengthMeters: 1000,
        },
      ],
    };

    const so1 = await createDirectMtsSalesOrder(payload, salesUser);
    const so2 = await createDirectMtsSalesOrder(payload, salesUser);
    assert.equal(so1.id, so2.id);
    assert.equal(so1.salesOrderNumber, so2.salesOrderNumber);
    assert.equal(so1.orderOrigin, 'DIRECT_MTS');
    assert.equal(so1.orderFulfillmentMode, 'MTS');
    assert.equal(so1.commitmentId, null);
    assert.equal(so1.lines[0].drumType, 'Wood Reel 250');
    assert.equal(Number(so1.lines[0].cuttingLengthMeters), 1000);
    assert.equal(so1.lines[0].numberOfCuts, 3);
    assert.equal(so1.integrationStatus, 'NOT_SENT');

    const adapter = await salesOrderIntegrationAdapter.postSalesOrder(so1.salesOrderNumber);
    assert.equal(adapter.status, 'NOT_IMPLEMENTED');

    const customerActor = {
      id: 'u-p1-cust',
      name: 'Phase1 Customer',
      email: 'phase1.customer@example.com',
      userType: 'customer' as const,
      customerId: 'CUST-P1-MTS',
      permissions: { salesQuotations: true },
    } satisfies RequestActor;
    await assert.rejects(
      () => createDirectMtsSalesOrder({ ...payload, idempotencyKey: 'p1-mts-cust-block' }, customerActor),
      (err: unknown) => err instanceof DomainError && err.code === 'UNAUTHORIZED'
    );
  });
});
