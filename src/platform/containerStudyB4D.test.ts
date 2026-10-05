import assert from 'node:assert/strict';
import { after, before, describe, it } from 'node:test';
import http from 'node:http';
import express from 'express';
import dotenv from 'dotenv';
import { Prisma } from '@prisma/client';
import { checkDatabase, getPrisma } from '../server/db';
import { identityAuthRouter } from '../server/identityAuthRoutes';
import { shipmentCostSnapshotRouter } from '../server/shipmentCostSnapshotRoutes';
import { financialOfferSnapshotRouter } from '../server/financialOfferSnapshotRoutes';
import { seedDevelopmentUsers } from '../server/identityService';
import { hashPassword } from '../domain/passwordService';
import { SYSTEM_ADMIN_ROLE_CODE } from '../domain/permissionCatalog';
import { dateOnlyToUtc } from '../domain/shippingCostCanonical';
import { deleteV2LineageForInquiries } from './containerStudyTestCleanup';
import { deleteNonIccTestIncoterm } from '../server/incotermTestCleanup';

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

describe('Task 05I-DF-B4-D — Financial Offer Snapshot', () => {
  let base = '';
  let server: http.Server;
  let tokenAdmin = '';
  let tokenCustomer = '';
  let customerId = '';
  let configId = '';
  const suffix = `B4D${Date.now().toString(36).toUpperCase()}`;
  const portCode = `P${suffix}`.slice(0, 12);
  const incotermCode = `I${suffix}`.slice(0, 12);
  const typeHq = `H${suffix}`.slice(0, 12);
  const inquiryIds: string[] = [];
  const rateIds: string[] = [];
  const auth = () => ({ Authorization: `Bearer ${tokenAdmin}`, 'Content-Type': 'application/json' });

  async function seedPricedInquiry(opts?: {
    process?: 'VIP_FAST_TRACK' | 'STANDARD_WORKFLOW';
    currency?: string;
    lineTotal?: string;
    unitPrice?: string;
  }) {
    const prisma = getPrisma()!;
    const currency = opts?.currency ?? 'USD';
    const inquiry = await prisma.commercialInquiry.create({
      data: {
        inquiryNumber: `INQ-${suffix}-${inquiryIds.length + 1}`,
        customerId,
        customerName: 'B4D Customer',
        inquiryDate: new Date('2026-06-15T12:00:00.000Z'),
        status: 'DRAFT',
        currency,
        commercialMetadata: {
          inquiryProcessCode: opts?.process ?? 'STANDARD_WORKFLOW',
          inquiryProcessSource: 'SYSTEM_DEFAULT',
        },
      },
    });
    inquiryIds.push(inquiry.id);
    const inquiryLine = await prisma.commercialInquiryLine.create({
      data: {
        inquiryId: inquiry.id,
        lineNumber: 1,
        cableDescription: 'B4D Cable',
        materialNumber: `MAT-${suffix}`,
        requestedQuantity: 1,
        requestedLengthMeters: 1000,
      },
    });
    const quotation = await prisma.commercialQuotation.create({
      data: {
        quotationNumber: `Q-${suffix}-${inquiryIds.length}`,
        inquiryId: inquiry.id,
        customerId,
        customerName: 'B4D Customer',
        status: 'DRAFT',
        isCurrent: true,
        versionNo: 1,
        currency,
      },
    });
    const quotationLine = await prisma.commercialQuotationLine.create({
      data: {
        quotationId: quotation.id,
        inquiryLineId: inquiryLine.id,
        lineNumber: 1,
        itemDescription: 'B4D Cable',
        materialNumber: `MAT-${suffix}`,
        quantity: 1,
        lengthMeters: 1000,
      },
    });
    const pricing = await prisma.commercialPricingSnapshot.create({
      data: {
        quotationId: quotation.id,
        quotationLineId: quotationLine.id,
        quotationNumber: quotation.quotationNumber,
        versionNo: 1,
        materialNumber: `MAT-${suffix}`,
        materialCost: 100,
        currency,
        pricingRuleType: 'GROSS_MARGIN',
        percentageValue: 0,
        baseSellingPrice: opts?.lineTotal ?? '1000',
        finalSellingPrice: opts?.lineTotal ?? '1000',
        unitSellingPrice: opts?.unitPrice ?? '1000',
        pricingStatus: 'PRICING_CALCULATED',
      },
    });
    await prisma.commercialQuotationLine.update({
      where: { id: quotationLine.id },
      data: { pricingSnapshotId: pricing.id, sellingPrice: pricing.finalSellingPrice },
    });
    return { inquiry, inquiryLine, quotation, quotationLine, pricing };
  }

  async function seedGroup(inquiryId: string, code: string, status: 'LOCKED' | 'SUPERSEDED' = 'LOCKED') {
    const prisma = getPrisma()!;
    return prisma.containerShipmentGroup.create({
      data: {
        inquiryId,
        groupCode: code,
        deliveryAllocationMode: 'ENTIRE_INQUIRY',
        destinationPortCode: portCode,
        incotermCode,
        status,
      },
    });
  }

  async function seedStudy(opts: {
    groupId: string;
    inquiryId: string;
    status?: 'DRAFT' | 'CONFIRMED' | 'SUPERSEDED';
  }) {
    const prisma = getPrisma()!;
    const study = await prisma.containerStudy.create({
      data: {
        studyNumber: `CST-${suffix}-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`,
        versionNo: 1,
        inquiryId: opts.inquiryId,
        shipmentGroupId: opts.groupId,
        customerId,
        status: opts.status ?? 'CONFIRMED',
        stuffingMethod: 'Rolling',
        region: 'Europe',
        deliveryAllocationMode: 'ENTIRE_INQUIRY',
      },
    });
    const input = await prisma.containerStudyInputSnapshot.create({
      data: {
        snapshotId: `SNAP-${study.id}`,
        studyId: study.id,
        stuffingMethod: 'Rolling',
        region: 'Europe',
        deliveryAllocationMode: 'ENTIRE_INQUIRY',
        algorithmVersionCode: 'LEGACY',
        configurationId: configId,
        configurationVersion: 'CFG-LEGACY-FIRST-FIT-V1',
        containerMasterPinJson: {},
        packingProfilePinJson: {},
        algorithmParameterPinJson: {},
      },
    });
    const result = await prisma.containerStudyResult.create({
      data: {
        resultId: `RES-${study.id}`,
        studyId: study.id,
        studyVersionNo: 1,
        inputSnapshotId: input.id,
        algorithmVersionCode: 'LEGACY',
        configurationVersion: 'CFG-LEGACY-FIRST-FIT-V1',
        containerMasterPinJson: {},
        packingProfilePinJson: {},
      },
    });
    await prisma.containerStudyResultContainer.create({
      data: { resultId: result.id, containerIndex: 0, typeCode: typeHq, drumCountQ3: 7 },
    });
    await prisma.containerStudy.update({
      where: { id: study.id },
      data: { currentSnapshotId: input.id, currentResultId: result.id },
    });
    return { study, input, result };
  }

  async function seedB4C(opts: {
    inquiryId: string;
    groupId: string;
    amount: string;
    currencyCode?: string;
  }) {
    const prisma = getPrisma()!;
    const seeded = await seedStudy({ groupId: opts.groupId, inquiryId: opts.inquiryId });
    const snapshot = await prisma.shipmentCostSnapshot.create({
      data: {
        inquiryId: opts.inquiryId,
        shipmentGroupId: opts.groupId,
        containerStudyId: seeded.study.id,
        containerStudyResultId: seeded.result.id,
        destinationPortCode: portCode,
        incotermCode,
        rateAsOfDate: dateOnlyToUtc('2026-06-15'),
        totalAmount: opts.amount,
        currencyCode: opts.currencyCode ?? 'USD',
        lines: {
          create: {
            containerTypeCode: typeHq,
            containerQuantity: 1,
            shippingCostRateId: rateIds[0],
            rateAmount: opts.amount,
            currencyCode: opts.currencyCode ?? 'USD',
            effectiveFrom: dateOnlyToUtc('2026-01-01'),
            lineTotal: opts.amount,
          },
        },
      },
    });
    return { ...seeded, snapshot };
  }

  before(async () => {
    const health = await checkDatabase();
    assert.equal(health.ok, true, health.error);
    await seedDevelopmentUsers();
    const prisma = getPrisma()!;
    const adminRole = await prisma.role.findFirst({ where: { code: SYSTEM_ADMIN_ROLE_CODE } });
    const customerRole = await prisma.role.findFirst({ where: { code: 'CUSTOMER_USER' } });
    assert.ok(adminRole && customerRole);
    const cfg =
      (await prisma.algorithmConfiguration.findFirst({ where: { id: 'CFG-LEGACY-FIRST-FIT-V1' } })) ??
      (await prisma.algorithmConfiguration.findFirst());
    assert.ok(cfg, 'AlgorithmConfiguration seed is required');
    configId = cfg.id;

    await prisma.costingCurrency.upsert({
      where: { code: 'USD' },
      create: { code: 'USD', name: 'US Dollar', status: 'ACTIVE' },
      update: { status: 'ACTIVE' },
    });
    await prisma.costingCurrency.upsert({
      where: { code: 'EUR' },
      create: { code: 'EUR', name: 'Euro', status: 'ACTIVE' },
      update: { status: 'ACTIVE' },
    });
    await prisma.containerType.upsert({
      where: { code: typeHq },
      create: { code: typeHq, description: 'B4-D HQ', active: true },
      update: { active: true },
    });
    await prisma.destinationPort.create({
      data: { code: portCode, name: 'B4D Port', countryCode: 'EG', active: true },
    });
    await prisma.incoterm.create({
      data: { code: incotermCode, name: 'B4D Incoterm', active: true },
    });
    const rate = await prisma.shippingCostRate.create({
      data: {
        destinationPortCode: portCode,
        incotermCode,
        containerTypeCode: typeHq,
        rateAmount: 400,
        currencyCode: 'USD',
        effectiveFrom: dateOnlyToUtc('2026-01-01'),
        active: true,
      },
    });
    rateIds.push(rate.id);

    const customer = await prisma.customer.create({ data: { code: `C-${suffix}`, name: 'B4D Customer' } });
    customerId = customer.id;
    const admin = await prisma.userAccount.create({
      data: {
        username: `b4d-admin-${suffix}`,
        email: `b4d-admin-${suffix}@test.local`,
        fullName: 'B4D Admin',
        userType: 'internal',
        passwordHash: await hashPassword('B4DTest@2026!'),
        status: 'ACTIVE',
      },
    });
    const custUser = await prisma.userAccount.create({
      data: {
        username: `b4d-cust-${suffix}`,
        email: `b4d-cust-${suffix}@test.local`,
        fullName: 'B4D Customer',
        userType: 'customer',
        passwordHash: await hashPassword('B4DTest@2026!'),
        status: 'ACTIVE',
      },
    });
    await prisma.customerUser.create({
      data: { customerId: customer.id, userAccountId: custUser.id, status: 'ACTIVE' },
    });
    await prisma.userRole.createMany({
      data: [
        { userId: admin.id, roleId: adminRole.id },
        { userId: custUser.id, roleId: customerRole.id },
      ],
    });

    const app = express();
    app.use(express.json());
    app.use('/api/auth', identityAuthRouter);
    app.use('/api/v2', shipmentCostSnapshotRouter);
    app.use('/api/v2', financialOfferSnapshotRouter);
    const started = await listen(app);
    server = started.server;
    base = started.base;

    const login = async (email: string) => {
      const res = await json(base, '/api/auth/login', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email, password: 'B4DTest@2026!' }),
      });
      return res.body.accessToken as string;
    };
    tokenAdmin = await login(admin.email!);
    tokenCustomer = await login(custUser.email!);
    assert.ok(tokenAdmin);
  });

  after(async () => {
    const prisma = getPrisma();
    try {
      if (prisma) {
        try {
          await deleteV2LineageForInquiries(prisma, inquiryIds);
          if (inquiryIds.length) {
            await prisma.commercialQuotation.deleteMany({ where: { inquiryId: { in: inquiryIds } } });
            await prisma.commercialInquiry.deleteMany({ where: { id: { in: inquiryIds } } });
          }
        } catch {
          /* still drop the ephemeral Incoterm below */
        }
        if (rateIds.length) await prisma.shippingCostRate.deleteMany({ where: { id: { in: rateIds } } });
        await prisma.shippingCostRate.deleteMany({
          where: { destinationPortCode: portCode, incotermCode },
        });
        await deleteNonIccTestIncoterm(prisma, incotermCode);
        await prisma.destinationPort.deleteMany({ where: { code: portCode } });
        await prisma.containerType.deleteMany({ where: { code: typeHq } });
        const emails = [`b4d-admin-${suffix}@test.local`, `b4d-cust-${suffix}@test.local`];
        const users = await prisma.userAccount.findMany({ where: { email: { in: emails } }, select: { id: true } });
        const userIds = users.map((u) => u.id);
        if (userIds.length) {
          await prisma.userRole.deleteMany({ where: { userId: { in: userIds } } });
          await prisma.customerUser.deleteMany({ where: { userAccountId: { in: userIds } } });
          await prisma.userAccount.deleteMany({ where: { id: { in: userIds } } });
        }
        await prisma.customer.deleteMany({ where: { code: `C-${suffix}` } });
      }
    } finally {
      await new Promise<void>((resolve) => server.close(() => resolve()));
    }
  });

  it('aggregates copied pricing + B4-C totals and does not write commercialOfferSnapshot', async () => {
    const prisma = getPrisma()!;
    const priced = await seedPricedInquiry({ lineTotal: '1000' });
    const group = await seedGroup(priced.inquiry.id, 'G1');
    const freight = await seedB4C({ inquiryId: priced.inquiry.id, groupId: group.id, amount: '400' });
    const created = await json(base, '/api/v2/financial-offer-snapshots', {
      method: 'POST',
      headers: auth(),
      body: JSON.stringify({ inquiryId: priced.inquiry.id, customerId: 'client-spoof' }),
    });
    assert.equal(created.status, 201, JSON.stringify(created.body));
    assert.equal(created.body.productsTotal, '1000');
    assert.equal(created.body.shipmentTotal, '400');
    assert.equal(created.body.inquiryTotal, '1400');
    assert.equal(created.body.currencyCode, 'USD');
    assert.equal(created.body.hostQuotationId, priced.quotation.id);
    assert.deepEqual(created.body.pricingSnapshotIds, [priced.pricing.id]);
    assert.deepEqual(created.body.shipmentCostSnapshotIds, [freight.snapshot.id]);
    assert.equal(created.body.productLines[0].commercialPricingSnapshotId, priced.pricing.id);
    assert.equal(created.body.shipmentLines[0].shipmentCostSnapshotId, freight.snapshot.id);
    const current = await json(base, `/api/v2/inquiries/${priced.inquiry.id}/financial-offer-snapshot`, {
      headers: auth(),
    });
    assert.equal(current.status, 200);
    assert.equal(current.body.id, created.body.id);
    const quotation = await prisma.commercialQuotation.findUnique({ where: { id: priced.quotation.id } });
    assert.equal(quotation?.commercialOfferSnapshot, null);
    const audit = await prisma.auditEvent.findFirst({
      where: { action: 'FINANCIAL_OFFER_SNAPSHOT_CREATED', entityId: created.body.id },
    });
    assert.ok(audit);
  });

  it('is idempotent for the same pin set and freezes copied amounts if live pricing later changes', async () => {
    const prisma = getPrisma()!;
    const priced = await seedPricedInquiry({ lineTotal: '2000' });
    const group = await seedGroup(priced.inquiry.id, 'G1');
    await seedB4C({ inquiryId: priced.inquiry.id, groupId: group.id, amount: '400' });
    const first = await json(base, '/api/v2/financial-offer-snapshots', {
      method: 'POST',
      headers: auth(),
      body: JSON.stringify({ inquiryId: priced.inquiry.id }),
    });
    assert.equal(first.status, 201, JSON.stringify(first.body));
    await prisma.commercialPricingSnapshot.update({
      where: { id: priced.pricing.id },
      data: { finalSellingPrice: '9999', unitSellingPrice: '9999' },
    });
    const second = await json(base, '/api/v2/financial-offer-snapshots', {
      method: 'POST',
      headers: auth(),
      body: JSON.stringify({ inquiryId: priced.inquiry.id }),
    });
    assert.equal(second.status, 200);
    assert.equal(second.body.id, first.body.id);
    assert.equal(second.body.productsTotal, '2000');
    const audits = await prisma.auditEvent.count({
      where: { action: 'FINANCIAL_OFFER_SNAPSHOT_CREATED', entityId: first.body.id },
    });
    assert.equal(audits, 1);
  });

  it('refuses a pricing snapshot from another inquiry', async () => {
    const a = await seedPricedInquiry();
    const groupA = await seedGroup(a.inquiry.id, 'G1');
    await seedB4C({ inquiryId: a.inquiry.id, groupId: groupA.id, amount: '400' });
    const b = await seedPricedInquiry();
    const denied = await json(base, '/api/v2/financial-offer-snapshots', {
      method: 'POST',
      headers: auth(),
      body: JSON.stringify({
        inquiryId: a.inquiry.id,
        commercialPricingSnapshotIds: [b.pricing.id],
      }),
    });
    assert.equal(denied.status, 400);
    assert.equal(denied.body.details.issueCode, 'PRICING_SNAPSHOT_STALE');
    assert.equal(await getPrisma()!.financialOfferSnapshot.count({ where: { inquiryId: a.inquiry.id } }), 0);
  });

  it('refuses a superseded shipment group and an unrelated B4-C snapshot', async () => {
    const priced = await seedPricedInquiry();
    const live = await seedGroup(priced.inquiry.id, 'LIVE');
    const dead = await seedGroup(priced.inquiry.id, 'DEAD', 'SUPERSEDED');
    const liveSnap = await seedB4C({ inquiryId: priced.inquiry.id, groupId: live.id, amount: '400' });
    const deadSnap = await seedB4C({ inquiryId: priced.inquiry.id, groupId: dead.id, amount: '900' });
    const other = await seedPricedInquiry();
    const otherGroup = await seedGroup(other.inquiry.id, 'OTHER');
    const otherSnap = await seedB4C({ inquiryId: other.inquiry.id, groupId: otherGroup.id, amount: '400' });

    const superseded = await json(base, '/api/v2/financial-offer-snapshots', {
      method: 'POST',
      headers: auth(),
      body: JSON.stringify({
        inquiryId: priced.inquiry.id,
        shipmentCostSnapshotIds: [liveSnap.snapshot.id, deadSnap.snapshot.id],
      }),
    });
    assert.equal(superseded.status, 400);
    assert.equal(superseded.body.details.issueCode, 'INVALID_SHIPMENT_GROUP');

    const unrelated = await json(base, '/api/v2/financial-offer-snapshots', {
      method: 'POST',
      headers: auth(),
      body: JSON.stringify({
        inquiryId: priced.inquiry.id,
        shipmentCostSnapshotIds: [otherSnap.snapshot.id],
      }),
    });
    assert.equal(unrelated.status, 400);
    assert.equal(unrelated.body.details.issueCode, 'SHIPMENT_SNAPSHOT_STALE');
    assert.equal(await getPrisma()!.financialOfferSnapshot.count({ where: { inquiryId: priced.inquiry.id } }), 0);
  });

  it('fails closed on mixed currencies and persists nothing', async () => {
    const priced = await seedPricedInquiry({ currency: 'EUR', lineTotal: '1000' });
    const group = await seedGroup(priced.inquiry.id, 'G1');
    await seedB4C({ inquiryId: priced.inquiry.id, groupId: group.id, amount: '400', currencyCode: 'USD' });
    const denied = await json(base, '/api/v2/financial-offer-snapshots', {
      method: 'POST',
      headers: auth(),
      body: JSON.stringify({ inquiryId: priced.inquiry.id }),
    });
    assert.equal(denied.status, 400);
    assert.equal(denied.body.details.issueCode, 'CURRENCY_INCOMPATIBLE');
    assert.equal(await getPrisma()!.financialOfferSnapshot.count({ where: { inquiryId: priced.inquiry.id } }), 0);
  });

  it('treats a superseded quotation version pin as stale pricing', async () => {
    const prisma = getPrisma()!;
    const priced = await seedPricedInquiry();
    const group = await seedGroup(priced.inquiry.id, 'G1');
    await seedB4C({ inquiryId: priced.inquiry.id, groupId: group.id, amount: '400' });
    await prisma.commercialQuotation.update({
      where: { id: priced.quotation.id },
      data: { isCurrent: false, status: 'SUPERSEDED' },
    });
    const v2 = await prisma.commercialQuotation.create({
      data: {
        quotationNumber: priced.quotation.quotationNumber,
        inquiryId: priced.inquiry.id,
        customerId,
        customerName: 'B4D Customer',
        status: 'DRAFT',
        isCurrent: true,
        versionNo: 2,
        currency: 'USD',
      },
    });
    const v2Line = await prisma.commercialQuotationLine.create({
      data: {
        quotationId: v2.id,
        inquiryLineId: priced.inquiryLine.id,
        lineNumber: 1,
        itemDescription: 'B4D Cable v2',
        materialNumber: `MAT-${suffix}`,
        quantity: 1,
        lengthMeters: 1000,
      },
    });
    const v2Pricing = await prisma.commercialPricingSnapshot.create({
      data: {
        quotationId: v2.id,
        quotationLineId: v2Line.id,
        quotationNumber: v2.quotationNumber,
        versionNo: 2,
        materialNumber: `MAT-${suffix}`,
        materialCost: 100,
        currency: 'USD',
        pricingRuleType: 'GROSS_MARGIN',
        percentageValue: 0,
        baseSellingPrice: '1100',
        finalSellingPrice: '1100',
        unitSellingPrice: '1100',
        pricingStatus: 'PRICING_CALCULATED',
      },
    });
    const stale = await json(base, '/api/v2/financial-offer-snapshots', {
      method: 'POST',
      headers: auth(),
      body: JSON.stringify({
        inquiryId: priced.inquiry.id,
        commercialPricingSnapshotIds: [priced.pricing.id],
      }),
    });
    assert.equal(stale.status, 400);
    assert.equal(stale.body.details.issueCode, 'PRICING_SNAPSHOT_STALE');
    const ok = await json(base, '/api/v2/financial-offer-snapshots', {
      method: 'POST',
      headers: auth(),
      body: JSON.stringify({ inquiryId: priced.inquiry.id }),
    });
    assert.equal(ok.status, 201, JSON.stringify(ok.body));
    assert.equal(ok.body.productsTotal, '1100');
    assert.equal(ok.body.hostQuotationId, v2.id);
    assert.deepEqual(ok.body.pricingSnapshotIds, [v2Pricing.id]);
  });

  it('stores VIP_SHIPMENT_NOT_CONFIGURED internally with shipment total 0', async () => {
    const priced = await seedPricedInquiry({ process: 'VIP_FAST_TRACK', lineTotal: '500' });
    const created = await json(base, '/api/v2/financial-offer-snapshots', {
      method: 'POST',
      headers: auth(),
      body: JSON.stringify({ inquiryId: priced.inquiry.id }),
    });
    assert.equal(created.status, 201, JSON.stringify(created.body));
    assert.equal(created.body.productsTotal, '500');
    assert.equal(created.body.shipmentTotal, '0');
    assert.equal(created.body.inquiryTotal, '500');
    assert.equal(created.body.warnings[0].code, 'VIP_SHIPMENT_NOT_CONFIGURED');
    assert.equal(created.body.productLines[0].lineTotal, '500');
    assert.equal(created.body.shipmentLines.length, 0);
  });

  it('STANDARD workflow calculates 0 + warning when an included group has no B4-C snapshot', async () => {
    const priced = await seedPricedInquiry({ process: 'STANDARD_WORKFLOW' });
    await seedGroup(priced.inquiry.id, 'G1');
    const created = await json(base, '/api/v2/financial-offer-snapshots', {
      method: 'POST',
      headers: auth(),
      body: JSON.stringify({ inquiryId: priced.inquiry.id }),
    });
    assert.equal(created.status, 201, JSON.stringify(created.body));
    assert.equal(created.body.shipmentTotal, '0');
    assert.equal(created.body.warnings[0].code, 'SHIPPING_CHARGES_NOT_AVAILABLE');
    assert.equal(await getPrisma()!.financialOfferSnapshot.count({ where: { inquiryId: priced.inquiry.id } }), 1);
  });

  it('sums multiple included groups without allocating freight into cable unit price', async () => {
    const priced = await seedPricedInquiry({ lineTotal: '1000', unitPrice: '1000' });
    const g1 = await seedGroup(priced.inquiry.id, 'C1');
    const g2 = await seedGroup(priced.inquiry.id, 'C2');
    await seedB4C({ inquiryId: priced.inquiry.id, groupId: g1.id, amount: '400' });
    await seedB4C({ inquiryId: priced.inquiry.id, groupId: g2.id, amount: '250' });
    const created = await json(base, '/api/v2/financial-offer-snapshots', {
      method: 'POST',
      headers: auth(),
      body: JSON.stringify({ inquiryId: priced.inquiry.id }),
    });
    assert.equal(created.status, 201, JSON.stringify(created.body));
    assert.equal(created.body.productsTotal, '1000');
    assert.equal(created.body.shipmentTotal, '650');
    assert.equal(created.body.inquiryTotal, '1650');
    assert.equal(created.body.shipmentLines.length, 2);
    assert.equal(created.body.productLines[0].unitPrice, '1000');
  });

  it('enforces at most one isCurrent offer per inquiry at PostgreSQL', async () => {
    const prisma = getPrisma()!;
    const priced = await seedPricedInquiry();
    const group = await seedGroup(priced.inquiry.id, 'G1');
    await seedB4C({ inquiryId: priced.inquiry.id, groupId: group.id, amount: '400' });
    const created = await json(base, '/api/v2/financial-offer-snapshots', {
      method: 'POST',
      headers: auth(),
      body: JSON.stringify({ inquiryId: priced.inquiry.id }),
    });
    assert.equal(created.status, 201, JSON.stringify(created.body));
    await assert.rejects(
      () =>
        prisma.financialOfferSnapshot.create({
          data: {
            inquiryId: priced.inquiry.id,
            versionNo: 2,
            isCurrent: true,
            hostQuotationId: priced.quotation.id,
            currencyCode: 'USD',
            productsTotal: new Prisma.Decimal(1),
            shipmentTotal: new Prisma.Decimal(0),
            inquiryTotal: new Prisma.Decimal(1),
            pricingSnapshotIdsJson: [],
            shipmentCostSnapshotIdsJson: [],
          },
        }),
      (err: unknown) => err instanceof Prisma.PrismaClientKnownRequestError && err.code === 'P2002'
    );
    const second = await prisma.financialOfferSnapshot.create({
      data: {
        inquiryId: priced.inquiry.id,
        versionNo: 2,
        isCurrent: false,
        hostQuotationId: priced.quotation.id,
        currencyCode: 'USD',
        productsTotal: new Prisma.Decimal(1),
        shipmentTotal: new Prisma.Decimal(0),
        inquiryTotal: new Prisma.Decimal(1),
        pricingSnapshotIdsJson: [],
        shipmentCostSnapshotIdsJson: [],
      },
    });
    assert.equal(second.isCurrent, false);
    const currentCount = await prisma.financialOfferSnapshot.count({
      where: { inquiryId: priced.inquiry.id, isCurrent: true },
    });
    assert.equal(currentCount, 1);
  });

  it('denies customers and has no PATCH surface', async () => {
    const priced = await seedPricedInquiry({ process: 'VIP_FAST_TRACK' });
    const created = await json(base, '/api/v2/financial-offer-snapshots', {
      method: 'POST',
      headers: auth(),
      body: JSON.stringify({ inquiryId: priced.inquiry.id }),
    });
    assert.equal(created.status, 201, JSON.stringify(created.body));
    const customerCreate = await json(base, '/api/v2/financial-offer-snapshots', {
      method: 'POST',
      headers: { Authorization: `Bearer ${tokenCustomer}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({ inquiryId: priced.inquiry.id }),
    });
    assert.equal(customerCreate.status, 401);
    const customerGet = await json(base, `/api/v2/financial-offer-snapshots/${created.body.id}`, {
      headers: { Authorization: `Bearer ${tokenCustomer}` },
    });
    assert.equal(customerGet.status, 401);
    const patched = await fetch(`${base}/api/v2/financial-offer-snapshots/${created.body.id}`, {
      method: 'PATCH',
      headers: auth(),
      body: JSON.stringify({ inquiryTotal: '0' }),
    });
    assert.equal(patched.status, 404);
  });
});
