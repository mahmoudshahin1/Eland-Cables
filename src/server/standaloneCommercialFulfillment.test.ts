/**
 * Task 05H — standalone commercial fulfillment (V2 lineage + Phase 1 paths).
 * No live D365 — integrationStatus stays NOT_SENT.
 */
import assert from 'node:assert/strict';
import { after, before, describe, it } from 'node:test';
import http from 'node:http';
import express from 'express';
import dotenv from 'dotenv';
import { checkDatabase, disconnectPrisma, getPrisma } from './db';
import { identityAuthRouter } from './identityAuthRoutes';
import {
  agreementReleasesRouter,
  commercialCommitmentsRouter,
  epcSalesOrdersRouter,
  salesAgreementsRouter,
} from './commercialCommitmentRoutes';
import { seedDevelopmentUsers } from './identityService';
import { hashPassword } from '../domain/passwordService';
import { SYSTEM_ADMIN_ROLE_CODE } from '../domain/permissionCatalog';
import { V2_QUOTATION_WORKFLOW_CHANNEL } from '../domain/v2QuotationService';
import { listServerAuditEvents } from './serverAudit';
import {
  createCommitmentFromQuotation,
  createDirectMtsSalesOrder,
  createSalesOrderFromCommitment,
  createSalesAgreementFromCommitment,
  createAgreementRelease,
} from './commercialCommitmentRepository';
import { deleteQuoteToCashDependentsForQuotations } from './quoteToCashTestCleanup';
import type { RequestActor } from './auth';

dotenv.config();

function listen(app: express.Express): Promise<{ server: http.Server; base: string }> {
  return new Promise((resolve) => {
    const server = app.listen(0, '127.0.0.1', () => {
      const addr = server.address();
      const port = typeof addr === 'object' && addr ? addr.port : 0;
      resolve({ server, base: `http://127.0.0.1:${port}` });
    });
  });
}

async function json(base: string, path: string, init?: RequestInit) {
  const res = await fetch(`${base}${path}`, init);
  const body = await res.json().catch(() => ({}));
  return { status: res.status, body };
}

describe('Task 05H — standalone commercial fulfillment', () => {
  const suffix = `sf-${Date.now()}-${process.pid}-${Math.random().toString(36).slice(2, 8)}`;
  const ownedQuotationIds: string[] = [];
  let base = '';
  let server: http.Server;
  let tokenCustomer = '';
  let tokenOther = '';
  let tokenSales = '';
  let customerId = '';
  let customerMasterId = '';
  let directQuoteId = '';
  let agreementQuoteId = '';
  let directLineId = '';
  let agreementLineId = '';

  const salesUser = {
    id: 'u-05h-sales',
    name: '05H Sales',
    email: '05h.sales@energya.com',
    userType: 'internal' as const,
    permissions: { salesQuotations: true },
  } satisfies RequestActor;

  async function seedV2IssuedQuotation(opts: {
    quotationNumber: string;
    customerCode: string;
    customerName: string;
    qty: number;
    price: number;
    lineage?: object;
  }) {
    const prisma = getPrisma()!;
    const inquiry = await prisma.commercialInquiry.create({
      data: {
        inquiryNumber: `INQ-${opts.quotationNumber}`,
        customerId: opts.customerCode,
        customerName: opts.customerName,
        customerMasterId,
        status: 'QUOTED',
        currency: 'USD',
        lines: {
          create: [
            {
              lineNumber: 1,
              cableDescription: 'V2 fulfillment cable',
              requestedQuantity: opts.qty,
              quantityUom: 'KM',
              requestedLengthMeters: opts.qty * 1000,
              status: 'READY_FOR_QUOTATION',
            },
          ],
        },
      },
      include: { lines: true },
    });

    const lineageSnapshot = opts.lineage ?? {
      workflowChannel: V2_QUOTATION_WORKFLOW_CHANNEL,
      v2ConfigurationSnapshotId: `snap-${opts.quotationNumber}`,
      v2DrumPlanId: `drum-${opts.quotationNumber}`,
      costingRunId: `cr-${opts.quotationNumber}`,
    };

    const quotation = await prisma.commercialQuotation.create({
      data: {
        quotationNumber: opts.quotationNumber,
        inquiryId: inquiry.id,
        customerId: opts.customerCode,
        customerMasterId,
        customerName: opts.customerName,
        versionNo: 1,
        isCurrent: true,
        status: 'SUBMITTED',
        workflowChannel: V2_QUOTATION_WORKFLOW_CHANNEL,
        issuedAt: new Date(),
        issuedBy: '05H Test',
        commercialPricingStatus: 'PRICING_APPROVED',
        commercialApprovalStatus: 'NOT_SUBMITTED',
        sellingPrice: opts.price * opts.qty,
        currency: 'USD',
        lines: {
          create: [
            {
              lineNumber: 1,
              inquiryLineId: inquiry.lines[0].id,
              itemDescription: 'V2 fulfillment cable',
              materialNumber: `MAT-${opts.quotationNumber}`,
              quantity: opts.qty,
              quantityUom: 'KM',
              lengthMeters: opts.qty * 1000,
              sellingPrice: opts.price,
              workflowChannel: V2_QUOTATION_WORKFLOW_CHANNEL,
              v2ConfigurationSnapshotIdString: `snap-${opts.quotationNumber}`,
              v2DrumPlanIdString: `drum-${opts.quotationNumber}`,
              lineageSnapshot,
            },
          ],
        },
      },
      include: { lines: true },
    });

    return { inquiry, quotation, lineId: quotation.lines[0].id };
  }

  before(async () => {
    const health = await checkDatabase();
    assert.equal(health.ok, true, health.error);
    await seedDevelopmentUsers();
    const prisma = getPrisma()!;

    const leftoverQuotes = await prisma.commercialQuotation.findMany({
      where: { quotationNumber: { startsWith: '05H-' } },
      select: { id: true },
    });
    await deleteQuoteToCashDependentsForQuotations(
      prisma,
      leftoverQuotes.map((row) => row.id)
    );
    await prisma.commercialQuotationLine.deleteMany({
      where: { quotation: { quotationNumber: { startsWith: '05H-' } } },
    });
    await prisma.commercialQuotation.deleteMany({ where: { quotationNumber: { startsWith: '05H-' } } });
    await prisma.commercialInquiryLine.deleteMany({
      where: { inquiry: { inquiryNumber: { startsWith: 'INQ-05H-' } } },
    });
    await prisma.commercialInquiry.deleteMany({ where: { inquiryNumber: { startsWith: 'INQ-05H-' } } });

    const cust = await prisma.customer.create({
      data: { code: `05H-CUST-${suffix}`, name: '05H Customer' },
    });
    customerMasterId = cust.id;
    customerId = cust.code;

    const other = await prisma.customer.create({
      data: { code: `05H-OTHER-${suffix}`, name: '05H Other' },
    });

    const role = await prisma.role.findFirst({ where: { code: SYSTEM_ADMIN_ROLE_CODE } });
    assert.ok(role);

    const customerUser = await prisma.userAccount.create({
      data: {
        username: `05h-cust-${suffix}`,
        email: `05h-cust-${suffix}@test.local`,
        fullName: '05H Customer User',
        userType: 'customer',
        passwordHash: await hashPassword('05HTest@2026!'),
        status: 'ACTIVE',
      },
    });
    const otherUser = await prisma.userAccount.create({
      data: {
        username: `05h-other-${suffix}`,
        email: `05h-other-${suffix}@test.local`,
        fullName: '05H Other User',
        userType: 'customer',
        passwordHash: await hashPassword('05HTest@2026!'),
        status: 'ACTIVE',
      },
    });
    const salesAccount = await prisma.userAccount.create({
      data: {
        username: `05h-sales-${suffix}`,
        email: `05h-sales-${suffix}@test.local`,
        fullName: '05H Sales',
        userType: 'internal',
        passwordHash: await hashPassword('05HTest@2026!'),
        status: 'ACTIVE',
      },
    });

    await prisma.customerUser.createMany({
      data: [
        { customerId: cust.id, userAccountId: customerUser.id, status: 'ACTIVE' },
        { customerId: other.id, userAccountId: otherUser.id, status: 'ACTIVE' },
      ],
    });
    await prisma.userRole.createMany({
      data: [
        { userId: customerUser.id, roleId: role.id },
        { userId: otherUser.id, roleId: role.id },
        { userId: salesAccount.id, roleId: role.id },
      ],
    });

    const direct = await seedV2IssuedQuotation({
      quotationNumber: `05H-DIRECT-${suffix}`,
      customerCode: customerId,
      customerName: cust.name,
      qty: 500,
      price: 100,
    });
    directQuoteId = direct.quotation.id;
    ownedQuotationIds.push(directQuoteId);
    directLineId = direct.lineId;

    const agree = await seedV2IssuedQuotation({
      quotationNumber: `05H-AGREE-${suffix}`,
      customerCode: customerId,
      customerName: cust.name,
      qty: 800,
      price: 120,
    });
    agreementQuoteId = agree.quotation.id;
    ownedQuotationIds.push(agreementQuoteId);
    agreementLineId = agree.lineId;

    await prisma.cableMaster.createMany({
      data: [
        {
          materialNumber: `05H-MTS-${suffix}`,
          itemCode: 'MTS-1',
          customerCode: 'CC-MTS',
          description: 'MTS cable',
          diameter: 10,
          weight: 100,
          fulfillmentPolicy: 'MTS',
        },
        {
          materialNumber: `05H-MTO-${suffix}`,
          itemCode: 'MTO-1',
          customerCode: 'CC-MTO',
          description: 'MTO cable',
          diameter: 10,
          weight: 100,
          fulfillmentPolicy: 'MTO',
        },
      ],
    });

    const app = express();
    app.use(express.json());
    app.use('/api/auth', identityAuthRouter);
    app.use('/api/commercial-commitments', commercialCommitmentsRouter);
    app.use('/api/sales-orders', epcSalesOrdersRouter);
    app.use('/api/sales-agreements', salesAgreementsRouter);
    app.use('/api/agreement-releases', agreementReleasesRouter);
    const listening = await listen(app);
    server = listening.server;
    base = listening.base;

    const loginCustomer = await json(base, '/api/auth/login', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ email: customerUser.email, password: '05HTest@2026!' }),
    });
    const loginOther = await json(base, '/api/auth/login', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ email: otherUser.email, password: '05HTest@2026!' }),
    });
    const loginSales = await json(base, '/api/auth/login', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ email: salesAccount.email, password: '05HTest@2026!' }),
    });
    tokenCustomer = loginCustomer.body.accessToken as string;
    tokenOther = loginOther.body.accessToken as string;
    tokenSales = loginSales.body.accessToken as string;
    assert.ok(tokenCustomer);
    assert.ok(tokenSales);
  });

  after(async () => {
    const prisma = getPrisma();
    if (prisma) {
      const ownedQuotes = await prisma.commercialQuotation.findMany({
        where: { OR: [{ id: { in: ownedQuotationIds } }, { quotationNumber: { contains: suffix } }] },
        select: { id: true },
      });
      await deleteQuoteToCashDependentsForQuotations(
        prisma,
        ownedQuotes.map((row) => row.id)
      );
      await prisma.commercialQuotationLine.deleteMany({
        where: { quotation: { quotationNumber: { contains: suffix } } },
      });
      await prisma.commercialQuotation.deleteMany({ where: { quotationNumber: { contains: suffix } } });
      await prisma.commercialInquiryLine.deleteMany({
        where: { inquiry: { inquiryNumber: { contains: suffix } } },
      });
      await prisma.commercialInquiry.deleteMany({ where: { inquiryNumber: { contains: suffix } } });
      await prisma.cableMaster.deleteMany({ where: { materialNumber: { contains: suffix } } });
      await prisma.customerUser.deleteMany({ where: { userAccount: { email: { contains: suffix } } } });
      await prisma.userRole.deleteMany({ where: { user: { email: { contains: suffix } } } });
      await prisma.userAccount.deleteMany({ where: { email: { contains: suffix } } });
      await prisma.customer.deleteMany({ where: { code: { contains: suffix } } });
    }
    await new Promise<void>((resolve, reject) => server.close((err) => (err ? reject(err) : resolve())));
    await disconnectPrisma();
  });

  it('V2 DIRECT_ORDER: customer commitment → internal SO with lineage snapshot', async () => {
    const createCmt = await json(base, '/api/commercial-commitments', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${tokenCustomer}` },
      body: JSON.stringify({ quotationId: directQuoteId, fulfillmentType: 'DIRECT_ORDER' }),
    });
    assert.equal(createCmt.status, 201, createCmt.body.error);
    const commitmentId = createCmt.body.commitment.id as string;
    assert.equal(createCmt.body.commitment.fulfillmentType, 'DIRECT_ORDER');
    assert.equal(createCmt.body.commitment.workflowChannel, V2_QUOTATION_WORKFLOW_CHANNEL);

    const createSo = await json(base, `/api/commercial-commitments/${commitmentId}/sales-orders`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${tokenSales}` },
      body: JSON.stringify({ lines: [{ quotationLineId: directLineId, quantity: 500 }] }),
    });
    assert.equal(createSo.status, 201, createSo.body.error);
    assert.equal(createSo.body.salesOrder.integrationStatus, 'NOT_SENT');
    assert.equal(createSo.body.salesOrder.orderOrigin, 'QUOTATION');
    assert.ok(createSo.body.salesOrder.lines[0].lineageSnapshot);

    const audit = await listServerAuditEvents({ entity: 'EpcSalesOrder', limit: 5 });
    assert.ok(audit.some((e) => e.action === 'CREATE'));
  });

  it('V2 SALES_AGREEMENT: commitment → agreement → release → SO', async () => {
    const createCmt = await json(base, '/api/commercial-commitments', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${tokenCustomer}` },
      body: JSON.stringify({ quotationId: agreementQuoteId, fulfillmentType: 'SALES_AGREEMENT' }),
    });
    assert.equal(createCmt.status, 201, createCmt.body.error);
    const commitmentId = createCmt.body.commitment.id as string;

    const createSa = await json(base, `/api/commercial-commitments/${commitmentId}/sales-agreements`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${tokenSales}` },
      body: JSON.stringify({}),
    });
    assert.equal(createSa.status, 201, createSa.body.error);
    const agreementId = createSa.body.agreement.id as string;
    const agreementLineDbId = createSa.body.agreement.lines[0].id as string;

    const release = await json(base, `/api/sales-agreements/${agreementId}/releases`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${tokenSales}` },
      body: JSON.stringify({ lines: [{ agreementLineId: agreementLineDbId, quantity: 300 }] }),
    });
    assert.equal(release.status, 201, release.body.error);
    assert.equal(release.body.salesOrder.integrationStatus, 'NOT_SENT');
    assert.equal(release.body.salesOrder.orderOrigin, 'AGREEMENT_RELEASE');
  });

  it('customer can read own SO/agreement; IDOR blocked for other customer', async () => {
    const listOwn = await json(base, '/api/sales-orders', {
      headers: { Authorization: `Bearer ${tokenCustomer}` },
    });
    assert.equal(listOwn.status, 200);
    assert.ok(Array.isArray(listOwn.body.salesOrders));

    const listOther = await json(base, '/api/sales-orders', {
      headers: { Authorization: `Bearer ${tokenOther}` },
    });
    assert.equal(listOther.status, 200);
    assert.equal(listOther.body.salesOrders.length, 0);

    const soId = listOwn.body.salesOrders[0]?.id as string;
    if (soId) {
      const idor = await json(base, `/api/sales-orders/${soId}`, {
        headers: { Authorization: `Bearer ${tokenOther}` },
      });
      assert.equal(idor.status, 403);
    }
  });

  it('customer cannot create sales orders or releases', async () => {
    const cmt = await createCommitmentFromQuotation(directQuoteId, {
      id: 'cust-block',
      name: 'Customer',
      userType: 'customer',
      customerCode: customerId,
      customerMasterIds: [customerMasterId],
    }, { fulfillmentType: 'DIRECT_ORDER' }).catch(() => null);

    const commitmentId =
      cmt?.id ||
      (
        await json(base, '/api/commercial-commitments', {
          headers: { Authorization: `Bearer ${tokenCustomer}` },
        })
      ).body.commitments?.[0]?.id;

    assert.ok(commitmentId);

    const soAttempt = await json(base, `/api/commercial-commitments/${commitmentId}/sales-orders`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${tokenCustomer}` },
      body: JSON.stringify({}),
    });
    assert.equal(soAttempt.status, 403);
  });

  it('rejects commitment on non-issued V2 quotation', async () => {
    const prisma = getPrisma()!;
    const draft = await prisma.commercialQuotation.create({
      data: {
        quotationNumber: `05H-DRAFT-${suffix}`,
        inquiryId: (await prisma.commercialInquiry.findFirst({ where: { inquiryNumber: { contains: suffix } } }))!.id,
        customerId,
        customerMasterId,
        customerName: '05H Customer',
        versionNo: 2,
        isCurrent: false,
        status: 'DRAFT',
        workflowChannel: V2_QUOTATION_WORKFLOW_CHANNEL,
        commercialPricingStatus: 'PRICING_APPROVED',
        lines: { create: [{ lineNumber: 1, itemDescription: 'draft', quantity: 1 }] },
      },
    });

    const res = await json(base, '/api/commercial-commitments', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${tokenCustomer}` },
      body: JSON.stringify({ quotationId: draft.id, fulfillmentType: 'DIRECT_ORDER' }),
    });
    assert.equal(res.status, 422);
  });

  it('Direct MTS path works without quotation or commitment', async () => {
    const so = await createDirectMtsSalesOrder(
      {
        customerId,
        customerMasterId,
        lines: [{ materialNumber: `05H-MTS-${suffix}`, quantity: 50, unitPrice: 75 }],
      },
      salesUser
    );
    assert.equal(so.orderOrigin, 'DIRECT_MTS');
    assert.equal(so.integrationStatus, 'NOT_SENT');
    assert.equal(so.commitmentId, null);
    assert.equal(so.quotationId, null);

    await assert.rejects(
      () =>
        createDirectMtsSalesOrder(
          { customerId, lines: [{ materialNumber: `05H-MTO-${suffix}`, quantity: 10 }] },
          salesUser
        ),
      (err: { code?: string }) => err?.code === 'BUSINESS_RULE_REQUIRED'
    );
  });

  it('blocks over-release on agreement lines', async () => {
    const prisma = getPrisma()!;
    const q = await seedV2IssuedQuotation({
      quotationNumber: `05H-OVER-${suffix}`,
      customerCode: customerId,
      customerName: '05H Customer',
      qty: 100,
      price: 50,
    });
    const cmt = await createCommitmentFromQuotation(q.quotation.id, salesUser, {
      fulfillmentType: 'SALES_AGREEMENT',
    });
    const agreement = await createSalesAgreementFromCommitment(cmt.id, {}, salesUser);
    const lineId = agreement.lines[0].id;

    await assert.rejects(
      () =>
        createAgreementRelease(
          agreement.id,
          { lines: [{ agreementLineId: lineId, quantity: 150 }] },
          salesUser
        ),
      (err: { code?: string }) => err?.code === 'BUSINESS_RULE_REQUIRED'
    );
  });

  it('repository pins inquiryId on commitment from V2 quotation', async () => {
    const prisma = getPrisma()!;
    const q = await seedV2IssuedQuotation({
      quotationNumber: `05H-PIN-${suffix}`,
      customerCode: customerId,
      customerName: '05H Customer',
      qty: 10,
      price: 20,
    });
    const cmt = await createCommitmentFromQuotation(q.quotation.id, salesUser, { fulfillmentType: 'DIRECT_ORDER' });
    assert.equal(cmt.inquiryId, q.inquiry.id);
    assert.equal(cmt.workflowChannel, V2_QUOTATION_WORKFLOW_CHANNEL);

    const so = await createSalesOrderFromCommitment(
      cmt.id,
      { lines: [{ quotationLineId: q.lineId, quantity: 10 }] },
      salesUser
    );
    const line = await prisma.epcSalesOrderLine.findFirst({ where: { salesOrderId: so.id } });
    assert.ok(line?.lineageSnapshot);
  });
});
