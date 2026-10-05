import assert from 'node:assert/strict';
import { after, before, describe, it } from 'node:test';
import http from 'node:http';
import express from 'express';
import dotenv from 'dotenv';
import { checkDatabase, getPrisma } from '../server/db';
import { identityAuthRouter } from '../server/identityAuthRoutes';
import { shipmentCostSnapshotRouter } from '../server/shipmentCostSnapshotRoutes';
import { financialOfferSnapshotRouter } from '../server/financialOfferSnapshotRoutes';
import { containerStudyRouter } from '../server/containerStudyRoutes';
import { costingRouter } from '../server/costingRoutes';
import { seedDevelopmentUsers } from '../server/identityService';
import { hashPassword } from '../domain/passwordService';
import { SYSTEM_ADMIN_ROLE_CODE } from '../domain/permissionCatalog';
import { dateOnlyToUtc } from '../domain/shippingCostCanonical';
import { deleteV2LineageForInquiries } from './containerStudyTestCleanup';
import { deleteNonIccTestIncoterm } from '../server/incotermTestCleanup';
import {
  CUSTOMER_VIP_SHIPPING_NOTICE,
  customerProjectionContainsInternalSecrets,
  projectCustomerFinancialOffer,
} from '../domain/financialOfferCustomerProjection';
import { VIP_SHIPMENT_NOT_CONFIGURED } from '../domain/financialOfferSnapshotAggregation';
import { renderToStaticMarkup } from 'react-dom/server';
import React from 'react';
import { CustomerFinancialOfferPanel } from '../components/customer/CustomerFinancialOfferPanel';

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

describe('Task 05I-DF-F2 — Financial Offer customer projection (domain)', () => {
  it('projects cable/shipping/summary and strips internal cost tokens', () => {
    const projected = projectCustomerFinancialOffer(
      {
        id: 'fo1',
        inquiryId: 'inq1',
        versionNo: 1,
        currencyCode: 'USD',
        productsTotal: '1000',
        shipmentTotal: '400',
        inquiryTotal: '1400',
        warnings: [],
        productLines: [
          {
            inquiryLineId: 'l1',
            description: 'LV Cable',
            lengthMeters: '1000',
            quantity: '2',
            unitPrice: '500',
            lineTotal: '1000',
          },
        ],
        shipmentLines: [
          {
            destinationPortCode: 'EGALY',
            incotermCode: 'CIF',
            groupTotal: '400',
            shipmentCostSnapshotId: 'scs1',
            typeLines: [
              { containerTypeCode: '40HC', containerQuantity: 1, rateAmount: '400', lineTotal: '400' },
            ],
          },
        ],
      },
      { l1: 'EWD220' }
    );
    assert.equal(projected.productsTotal, '1000');
    assert.equal(projected.shippingTotal, '400');
    assert.equal(projected.inquiryTotal, '1400');
    assert.equal(projected.cablePricing[0].drum, 'EWD220');
    assert.equal(projected.cablePricing[0].cuttingLength, '1000');
    assert.equal(projected.shipping[0].destination, 'EGALY');
    assert.equal(projected.shippingNotConfigured, false);
    assert.deepEqual(customerProjectionContainsInternalSecrets(projected), []);
    const html = renderToStaticMarkup(React.createElement(CustomerFinancialOfferPanel, { offer: projected }));
    assert.match(html, /Cable pricing/);
    assert.match(html, /Shipping/);
    assert.match(html, /Inquiry total/);
    assert.equal(html.includes('materialCost'), false);
  });

  it('surfaces VIP zero shipping with a customer-visible warning', () => {
    const projected = projectCustomerFinancialOffer({
      id: 'fo-vip',
      inquiryId: 'inq-vip',
      versionNo: 1,
      currencyCode: 'USD',
      productsTotal: '500',
      shipmentTotal: '0',
      inquiryTotal: '500',
      warnings: [{ code: VIP_SHIPMENT_NOT_CONFIGURED }],
      productLines: [
        {
          inquiryLineId: 'l1',
          description: 'VIP Cable',
          lengthMeters: '800',
          quantity: '1',
          unitPrice: '500',
          lineTotal: '500',
        },
      ],
      shipmentLines: [],
    });
    assert.equal(projected.shippingTotal, '0');
    assert.equal(projected.shippingNotConfigured, true);
    assert.equal(projected.shippingNotice, CUSTOMER_VIP_SHIPPING_NOTICE);
  });
});

describe('Task 05I-DF-F2 — Financial Offer + customer visibility', () => {
  let base = '';
  let server: http.Server;
  let tokenAdmin = '';
  let tokenCustomer = '';
  let tokenOther = '';
  let customerId = '';
  let otherCustomerId = '';
  let configId = '';
  const suffix = `DFF2${Date.now().toString(36).toUpperCase()}`;
  const portCode = `P${suffix}`.slice(0, 12);
  const incotermCode = `I${suffix}`.slice(0, 12);
  const typeHq = `H${suffix}`.slice(0, 12);
  const inquiryIds: string[] = [];
  const rateIds: string[] = [];
  const auth = () => ({ Authorization: `Bearer ${tokenAdmin}`, 'Content-Type': 'application/json' });
  const custAuth = () => ({ Authorization: `Bearer ${tokenCustomer}`, 'Content-Type': 'application/json' });

  async function seedPricedInquiry(opts?: {
    process?: 'VIP_FAST_TRACK' | 'STANDARD_WORKFLOW';
    currency?: string;
    lineTotal?: string;
    unitPrice?: string;
    customer?: string;
  }) {
    const prisma = getPrisma()!;
    const currency = opts?.currency ?? 'USD';
    const owner = opts?.customer ?? customerId;
    const inquiry = await prisma.commercialInquiry.create({
      data: {
        inquiryNumber: `INQ-${suffix}-${inquiryIds.length + 1}`,
        customerId: owner,
        customerName: 'DFF2 Customer',
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
        cableDescription: 'DFF2 Cable',
        materialNumber: `MAT-${suffix}`,
        requestedQuantity: 1,
        requestedLengthMeters: 1000,
      },
    });
    const quotation = await prisma.commercialQuotation.create({
      data: {
        quotationNumber: `Q-${suffix}-${inquiryIds.length}`,
        inquiryId: inquiry.id,
        customerId: owner,
        customerName: 'DFF2 Customer',
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
        itemDescription: 'DFF2 Cable',
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
        materialCost: 111,
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

  async function seedGroup(
    inquiryId: string,
    code: string,
    status: 'LOCKED' | 'SUPERSEDED' = 'LOCKED',
    mode: 'ENTIRE_INQUIRY' | 'PER_INQUIRY_LINE' | 'DESTINATION_CLUSTER' = 'ENTIRE_INQUIRY'
  ) {
    const prisma = getPrisma()!;
    return prisma.containerShipmentGroup.create({
      data: {
        inquiryId,
        groupCode: code,
        deliveryAllocationMode: mode,
        destinationPortCode: portCode,
        incotermCode,
        status,
      },
    });
  }

  async function seedStudy(opts: { groupId: string; inquiryId: string }) {
    const prisma = getPrisma()!;
    const study = await prisma.containerStudy.create({
      data: {
        studyNumber: `CST-${suffix}-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`,
        versionNo: 1,
        inquiryId: opts.inquiryId,
        shipmentGroupId: opts.groupId,
        customerId,
        status: 'CONFIRMED',
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

  async function seedB4C(opts: { inquiryId: string; groupId: string; amount: string; currencyCode?: string }) {
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
      create: { code: typeHq, description: 'DFF2 HQ', active: true },
      update: { active: true },
    });
    await prisma.destinationPort.create({
      data: { code: portCode, name: 'DFF2 Port', countryCode: 'EG', active: true },
    });
    await prisma.incoterm.create({
      data: { code: incotermCode, name: 'DFF2 Incoterm', active: true },
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

    const customer = await prisma.customer.create({ data: { code: `C-${suffix}`, name: 'DFF2 Customer' } });
    const other = await prisma.customer.create({ data: { code: `O-${suffix}`, name: 'DFF2 Other' } });
    customerId = customer.id;
    otherCustomerId = other.id;
    const admin = await prisma.userAccount.create({
      data: {
        username: `dff2-admin-${suffix}`,
        email: `dff2-admin-${suffix}@test.local`,
        fullName: 'DFF2 Admin',
        userType: 'internal',
        passwordHash: await hashPassword('DFF2Test@2026!'),
        status: 'ACTIVE',
      },
    });
    const custUser = await prisma.userAccount.create({
      data: {
        username: `dff2-cust-${suffix}`,
        email: `dff2-cust-${suffix}@test.local`,
        fullName: 'DFF2 Customer',
        userType: 'customer',
        passwordHash: await hashPassword('DFF2Test@2026!'),
        status: 'ACTIVE',
      },
    });
    const otherUser = await prisma.userAccount.create({
      data: {
        username: `dff2-other-${suffix}`,
        email: `dff2-other-${suffix}@test.local`,
        fullName: 'DFF2 Other',
        userType: 'customer',
        passwordHash: await hashPassword('DFF2Test@2026!'),
        status: 'ACTIVE',
      },
    });
    await prisma.customerUser.create({
      data: { customerId: customer.id, userAccountId: custUser.id, status: 'ACTIVE' },
    });
    await prisma.customerUser.create({
      data: { customerId: other.id, userAccountId: otherUser.id, status: 'ACTIVE' },
    });
    await prisma.userRole.createMany({
      data: [
        { userId: admin.id, roleId: adminRole.id },
        { userId: custUser.id, roleId: customerRole.id },
        { userId: otherUser.id, roleId: customerRole.id },
      ],
    });

    const app = express();
    app.use(express.json());
    app.use('/api/auth', identityAuthRouter);
    app.use('/api/costing', costingRouter);
    app.use('/api/v2', shipmentCostSnapshotRouter);
    app.use('/api/v2', financialOfferSnapshotRouter);
    app.use('/api/v2', containerStudyRouter);
    const started = await listen(app);
    server = started.server;
    base = started.base;

    const login = async (email: string) => {
      const res = await json(base, '/api/auth/login', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email, password: 'DFF2Test@2026!' }),
      });
      return res.body.accessToken as string;
    };
    tokenAdmin = await login(admin.email!);
    tokenCustomer = await login(custUser.email!);
    tokenOther = await login(otherUser.email!);
    assert.ok(tokenAdmin && tokenCustomer && tokenOther);
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
          /* still drop masters */
        }
        if (rateIds.length) await prisma.shippingCostRate.deleteMany({ where: { id: { in: rateIds } } });
        await prisma.shippingCostRate.deleteMany({
          where: { destinationPortCode: portCode, incotermCode },
        });
        await deleteNonIccTestIncoterm(prisma, incotermCode);
        await prisma.destinationPort.deleteMany({ where: { code: portCode } });
        await prisma.containerType.deleteMany({ where: { code: typeHq } });
        const emails = [
          `dff2-admin-${suffix}@test.local`,
          `dff2-cust-${suffix}@test.local`,
          `dff2-other-${suffix}@test.local`,
        ];
        const users = await prisma.userAccount.findMany({ where: { email: { in: emails } }, select: { id: true } });
        const userIds = users.map((u) => u.id);
        if (userIds.length) {
          await prisma.userRole.deleteMany({ where: { userId: { in: userIds } } });
          await prisma.customerUser.deleteMany({ where: { userAccountId: { in: userIds } } });
          await prisma.userAccount.deleteMany({ where: { id: { in: userIds } } });
        }
        await prisma.customer.deleteMany({ where: { code: { in: [`C-${suffix}`, `O-${suffix}`] } } });
      }
    } finally {
      await new Promise<void>((resolve) => server.close(() => resolve()));
    }
  });

  it('creates FO pinning exact pricing and shipment snapshots with inquiry total', async () => {
    const priced = await seedPricedInquiry({ lineTotal: '1000', unitPrice: '1000' });
    const group = await seedGroup(priced.inquiry.id, 'G1');
    const freight = await seedB4C({ inquiryId: priced.inquiry.id, groupId: group.id, amount: '400' });
    const created = await json(base, '/api/v2/financial-offer-snapshots', {
      method: 'POST',
      headers: auth(),
      body: JSON.stringify({ inquiryId: priced.inquiry.id }),
    });
    assert.equal(created.status, 201, JSON.stringify(created.body));
    assert.deepEqual(created.body.pricingSnapshotIds, [priced.pricing.id]);
    assert.deepEqual(created.body.shipmentCostSnapshotIds, [freight.snapshot.id]);
    assert.equal(created.body.productsTotal, '1000');
    assert.equal(created.body.shipmentTotal, '400');
    assert.equal(created.body.inquiryTotal, '1400');
    assert.equal(created.body.currencyCode, 'USD');
  });

  it('customer-safe current FO hides internals and copies pinned commercial totals', async () => {
    const priced = await seedPricedInquiry({ lineTotal: '2000', unitPrice: '2000' });
    const group = await seedGroup(priced.inquiry.id, 'G1');
    const freight = await seedB4C({ inquiryId: priced.inquiry.id, groupId: group.id, amount: '250' });
    const created = await json(base, '/api/v2/financial-offer-snapshots', {
      method: 'POST',
      headers: auth(),
      body: JSON.stringify({ inquiryId: priced.inquiry.id }),
    });
    assert.equal(created.status, 201, JSON.stringify(created.body));
    const customer = await json(base, `/api/v2/inquiries/${priced.inquiry.id}/customer-financial-offer`, {
      headers: custAuth(),
    });
    assert.equal(customer.status, 200, JSON.stringify(customer.body));
    assert.equal(customer.body.productsTotal, '2000');
    assert.equal(customer.body.shippingTotal, '250');
    assert.equal(customer.body.inquiryTotal, '2250');
    assert.equal(customer.body.cablePricing[0].unitPrice, '2000');
    assert.equal(customer.body.cablePricing[0].cuttingLength, '1000');
    assert.equal(customer.body.shipping[0].destination, portCode);
    assert.equal(customer.body.shipping[0].incoterm, incotermCode);
    assert.equal(customer.body.shipping[0].containerType, typeHq);
    assert.deepEqual(customerProjectionContainsInternalSecrets(customer.body), []);
    assert.equal(customer.body.warnings, undefined);
    assert.equal(customer.body.pricingSnapshotIds, undefined);
    assert.equal(customer.body.hostQuotationId, undefined);
    assert.equal(customer.body.shipping[0].shippingCostRateId, undefined);
    const byId = await json(base, `/api/v2/customer-financial-offers/${created.body.id}`, {
      headers: custAuth(),
    });
    assert.equal(byId.status, 200);
    assert.equal(byId.body.id, created.body.id);
    assert.equal(byId.body.inquiryTotal, '2250');
    const cs = await json(base, `/api/v2/inquiries/${priced.inquiry.id}/customer-container-study`, {
      headers: custAuth(),
    });
    assert.equal(cs.status, 200, JSON.stringify(cs.body));
    assert.equal(cs.body.containerStudyOptional, false);
    assert.equal(cs.body.groups[0].hasPersistedShipmentSnapshot, true);
    assert.equal(cs.body.groups[0].governedStatus, 'CONFIRMED');
    assert.equal(cs.body.groups[0].shipmentTotal, '250');
    assert.deepEqual(customerProjectionContainsInternalSecrets(cs.body), []);
    assert.equal(JSON.stringify(cs.body).includes('shippingCostRateId'), false);
  });

  it('fails closed on mixed currency and does not persist an offer', async () => {
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
    const customer = await json(base, `/api/v2/inquiries/${priced.inquiry.id}/customer-financial-offer`, {
      headers: custAuth(),
    });
    assert.equal(customer.status, 404);
  });

  it('keeps F1 immutable when later pricing/shipping/CS facts change; F2 is a new snapshot', async () => {
    const prisma = getPrisma()!;
    const priced = await seedPricedInquiry({ lineTotal: '1000', unitPrice: '1000' });
    const group = await seedGroup(priced.inquiry.id, 'G1');
    const freight = await seedB4C({ inquiryId: priced.inquiry.id, groupId: group.id, amount: '400' });
    const first = await json(base, '/api/v2/financial-offer-snapshots', {
      method: 'POST',
      headers: auth(),
      body: JSON.stringify({ inquiryId: priced.inquiry.id }),
    });
    assert.equal(first.status, 201, JSON.stringify(first.body));
    const f1Id = first.body.id as string;

    await prisma.shippingCostRate.update({ where: { id: rateIds[0] }, data: { rateAmount: 9999 } });
    await prisma.commercialPricingSnapshot.update({
      where: { id: priced.pricing.id },
      data: { finalSellingPrice: '8888', unitSellingPrice: '8888', materialCost: 777 },
    });

    const stillF1 = await json(base, `/api/v2/customer-financial-offers/${f1Id}`, { headers: custAuth() });
    assert.equal(stillF1.status, 200);
    assert.equal(stillF1.body.productsTotal, '1000');
    assert.equal(stillF1.body.shippingTotal, '400');
    assert.equal(stillF1.body.inquiryTotal, '1400');
    assert.equal(stillF1.body.shipping[0].rate, '400');

    await prisma.commercialQuotation.update({
      where: { id: priced.quotation.id },
      data: { isCurrent: false, status: 'SUPERSEDED' },
    });
    const v2 = await prisma.commercialQuotation.create({
      data: {
        quotationNumber: priced.quotation.quotationNumber,
        inquiryId: priced.inquiry.id,
        customerId,
        customerName: 'DFF2 Customer',
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
        itemDescription: 'DFF2 Cable v2',
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
        materialCost: 200,
        currency: 'USD',
        pricingRuleType: 'GROSS_MARGIN',
        percentageValue: 0,
        baseSellingPrice: '1100',
        finalSellingPrice: '1100',
        unitSellingPrice: '1100',
        pricingStatus: 'PRICING_CALCULATED',
      },
    });
    const group2 = await seedGroup(priced.inquiry.id, 'G2', 'LOCKED', 'DESTINATION_CLUSTER');
    await seedB4C({ inquiryId: priced.inquiry.id, groupId: group2.id, amount: '50' });

    const second = await json(base, '/api/v2/financial-offer-snapshots', {
      method: 'POST',
      headers: auth(),
      body: JSON.stringify({
        inquiryId: priced.inquiry.id,
        commercialPricingSnapshotIds: [v2Pricing.id],
      }),
    });
    assert.equal(second.status, 201, JSON.stringify(second.body));
    assert.notEqual(second.body.id, f1Id);
    assert.equal(second.body.versionNo, 2);
    assert.equal(second.body.productsTotal, '1100');
    assert.equal(second.body.shipmentTotal, '450');
    assert.equal(second.body.inquiryTotal, '1550');

    const historical = await json(base, `/api/v2/customer-financial-offers/${f1Id}`, { headers: custAuth() });
    assert.equal(historical.body.inquiryTotal, '1400');
    assert.equal(historical.body.versionNo, 1);
    const current = await json(base, `/api/v2/inquiries/${priced.inquiry.id}/customer-financial-offer`, {
      headers: custAuth(),
    });
    assert.equal(current.body.id, second.body.id);
    assert.equal(current.body.inquiryTotal, '1550');
  });

  it('pins shipment snapshots for PER_INQUIRY_LINE groups without live rate lookup', async () => {
    const priced = await seedPricedInquiry({ lineTotal: '600', unitPrice: '600' });
    const g1 = await seedGroup(priced.inquiry.id, 'L1', 'LOCKED', 'PER_INQUIRY_LINE');
    const g2 = await seedGroup(priced.inquiry.id, 'L2', 'LOCKED', 'PER_INQUIRY_LINE');
    const s1 = await seedB4C({ inquiryId: priced.inquiry.id, groupId: g1.id, amount: '40' });
    const s2 = await seedB4C({ inquiryId: priced.inquiry.id, groupId: g2.id, amount: '60' });
    await getPrisma()!.shippingCostRate.update({ where: { id: rateIds[0] }, data: { rateAmount: 8888 } });
    const created = await json(base, '/api/v2/financial-offer-snapshots', {
      method: 'POST',
      headers: auth(),
      body: JSON.stringify({ inquiryId: priced.inquiry.id }),
    });
    assert.equal(created.status, 201, JSON.stringify(created.body));
    assert.deepEqual(
      [...created.body.shipmentCostSnapshotIds].sort(),
      [s1.snapshot.id, s2.snapshot.id].sort()
    );
    assert.equal(created.body.shipmentTotal, '100');
    assert.equal(created.body.inquiryTotal, '700');
    assert.equal(created.body.shipmentLines.length, 2);
  });

  it('creates STANDARD no-shipment FO without ShipmentCostSnapshot when no groups exist', async () => {
    const priced = await seedPricedInquiry({ process: 'STANDARD_WORKFLOW', lineTotal: '750', unitPrice: '750' });
    const created = await json(base, '/api/v2/financial-offer-snapshots', {
      method: 'POST',
      headers: auth(),
      body: JSON.stringify({ inquiryId: priced.inquiry.id }),
    });
    assert.equal(created.status, 201, JSON.stringify(created.body));
    assert.deepEqual(created.body.pricingSnapshotIds, [priced.pricing.id]);
    assert.deepEqual(created.body.shipmentCostSnapshotIds, []);
    assert.equal(created.body.productsTotal, '750');
    assert.equal(created.body.shipmentTotal, '0');
    assert.equal(created.body.inquiryTotal, '750');
    assert.equal(created.body.shipmentLines.length, 0);
    assert.equal(Array.isArray(created.body.warnings) ? created.body.warnings.length : 0, 0);
    const customer = await json(base, `/api/v2/inquiries/${priced.inquiry.id}/customer-financial-offer`, {
      headers: custAuth(),
    });
    assert.equal(customer.status, 200);
    assert.equal(customer.body.shippingTotal, '0');
    assert.equal(customer.body.inquiryTotal, '750');
    assert.equal(customer.body.shippingNotConfigured, false);
    assert.equal(customer.body.shippingNotice, null);
  });

  it('sums persisted shipment snapshots for DESTINATION_CLUSTER without regrouping', async () => {
    const priced = await seedPricedInquiry({ lineTotal: '800', unitPrice: '800' });
    const g1 = await seedGroup(priced.inquiry.id, 'C1', 'LOCKED', 'DESTINATION_CLUSTER');
    const g2 = await seedGroup(priced.inquiry.id, 'C2', 'LOCKED', 'DESTINATION_CLUSTER');
    await seedB4C({ inquiryId: priced.inquiry.id, groupId: g1.id, amount: '100' });
    await seedB4C({ inquiryId: priced.inquiry.id, groupId: g2.id, amount: '75' });
    const created = await json(base, '/api/v2/financial-offer-snapshots', {
      method: 'POST',
      headers: auth(),
      body: JSON.stringify({ inquiryId: priced.inquiry.id }),
    });
    assert.equal(created.status, 201, JSON.stringify(created.body));
    assert.equal(created.body.shipmentTotal, '175');
    assert.equal(created.body.inquiryTotal, '975');
    assert.equal(created.body.shipmentLines.length, 2);
    const customer = await json(base, `/api/v2/inquiries/${priced.inquiry.id}/customer-financial-offer`, {
      headers: custAuth(),
    });
    assert.equal(customer.body.shippingTotal, '175');
    assert.equal(customer.body.shipping.length, 2);
  });

  it('VIP no-shipment stores zero + warning; customer sees notice, not internal costing', async () => {
    const priced = await seedPricedInquiry({ process: 'VIP_FAST_TRACK', lineTotal: '500' });
    const created = await json(base, '/api/v2/financial-offer-snapshots', {
      method: 'POST',
      headers: auth(),
      body: JSON.stringify({ inquiryId: priced.inquiry.id }),
    });
    assert.equal(created.status, 201, JSON.stringify(created.body));
    assert.equal(created.body.shipmentTotal, '0');
    assert.equal(created.body.warnings[0].code, 'VIP_SHIPMENT_NOT_CONFIGURED');
    const customer = await json(base, `/api/v2/inquiries/${priced.inquiry.id}/customer-financial-offer`, {
      headers: custAuth(),
    });
    assert.equal(customer.status, 200);
    assert.equal(customer.body.shippingTotal, '0');
    assert.equal(customer.body.inquiryTotal, '500');
    assert.equal(customer.body.shippingNotConfigured, true);
    assert.equal(customer.body.shippingNotice, CUSTOMER_VIP_SHIPPING_NOTICE);
    assert.deepEqual(customerProjectionContainsInternalSecrets(customer.body), []);
    const cs = await json(base, `/api/v2/inquiries/${priced.inquiry.id}/customer-container-study`, {
      headers: custAuth(),
    });
    assert.equal(cs.body.containerStudyOptional, true);
    assert.equal(cs.body.processCode, 'VIP_FAST_TRACK');
  });

  it('customer auth: own FO/CS yes; mutate CS/SG no; costing and live shipment APIs no', async () => {
    const priced = await seedPricedInquiry({ process: 'VIP_FAST_TRACK', lineTotal: '300' });
    const created = await json(base, '/api/v2/financial-offer-snapshots', {
      method: 'POST',
      headers: auth(),
      body: JSON.stringify({ inquiryId: priced.inquiry.id }),
    });
    assert.equal(created.status, 201);

    const createDenied = await json(base, '/api/v2/financial-offer-snapshots', {
      method: 'POST',
      headers: custAuth(),
      body: JSON.stringify({ inquiryId: priced.inquiry.id }),
    });
    assert.equal(createDenied.status, 401);

    const internalGet = await json(base, `/api/v2/financial-offer-snapshots/${created.body.id}`, {
      headers: custAuth(),
    });
    assert.equal(internalGet.status, 401);

    const otherGet = await json(base, `/api/v2/inquiries/${priced.inquiry.id}/customer-financial-offer`, {
      headers: { Authorization: `Bearer ${tokenOther}` },
    });
    assert.equal(otherGet.status, 401);

    const sg = await json(base, `/api/v2/inquiries/${priced.inquiry.id}/shipment-groups`, {
      method: 'POST',
      headers: custAuth(),
      body: JSON.stringify({ destinationPortCode: portCode, incotermCode }),
    });
    assert.equal(sg.status, 401);

    const csCreate = await json(base, `/api/v2/inquiries/${priced.inquiry.id}/container-studies`, {
      method: 'POST',
      headers: custAuth(),
      body: JSON.stringify({}),
    });
    assert.equal(csCreate.status, 401);

    const costing = await json(base, '/api/costing/not-a-real-run', { headers: custAuth() });
    assert.equal(costing.status, 403);

    const liveSnap = await json(base, '/api/v2/shipment-cost-snapshots/not-real', { headers: custAuth() });
    assert.equal(liveSnap.status, 401);

    const internalCs = await json(base, `/api/v2/inquiries/${priced.inquiry.id}/container-studies`, {
      headers: custAuth(),
    });
    assert.equal(internalCs.status, 401);
  });
});
