import assert from 'node:assert/strict';
import { after, before, describe, it } from 'node:test';
import http from 'node:http';
import express from 'express';
import dotenv from 'dotenv';
import { Prisma } from '@prisma/client';
import { checkDatabase, getPrisma } from './db';
import { identityAuthRouter } from './identityAuthRoutes';
import { customerShippingCostRouter } from './customerShippingCostRoutes';
import { hashPassword } from '../domain/passwordService';
import { SYSTEM_ADMIN_ROLE_CODE } from '../domain/permissionCatalog';
import { DomainError } from '../platform/errors/domainError';
import {
  ELAND_SHIPPING_COST_SEED,
  SHIPPING_COST_NOT_CONFIGURED,
  mapContainerTypeToCanonicalShippingType,
  mapDestinationPortToShippingDeliveryPoint,
} from '../domain/customerShippingCost';
import {
  createCustomerShippingCostRate,
  freezeQuotationShippingSnapshot,
  rejectInPlaceShippingCostEdit,
  resolveCustomerShippingCostRate,
  seedElandCustomerShippingCostRates,
} from './customerShippingCostRepository';

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

describe('customer shipping cost master', () => {
  const suffix = `SHIP${Date.now().toString(36).toUpperCase()}`;
  let server: http.Server;
  let base = '';
  let token = '';
  let elandId = '';
  let dapId = '';
  let cifId = '';
  let customerId = '';
  let inquiryId = '';
  let quotationId = '';
  let adminUserId = '';
  const rateIds: string[] = [];

  before(async () => {
    const health = await checkDatabase();
    assert.equal(health.ok, true, health.error);
    const prisma = getPrisma()!;
    const seeded = await seedElandCustomerShippingCostRates();
    elandId = seeded.customerId;
    dapId = seeded.incotermIds.DAP;
    cifId = seeded.incotermIds.CIF;

    const customer = await prisma.customer.create({
      data: { code: `C-${suffix}`, name: `Shipping Test ${suffix}`, status: 'ACTIVE' },
    });
    customerId = customer.id;
    const adminRole = await prisma.role.findFirst({ where: { code: SYSTEM_ADMIN_ROLE_CODE } });
    assert.ok(adminRole);
    const admin = await prisma.userAccount.create({
      data: {
        username: `ship-admin-${suffix}`,
        email: `ship-admin-${suffix}@test.local`,
        fullName: 'Shipping Admin',
        userType: 'internal',
        passwordHash: await hashPassword('ShipTest@2026!'),
        status: 'ACTIVE',
      },
    });
    adminUserId = admin.id;
    await prisma.userRole.create({ data: { userId: admin.id, roleId: adminRole.id } });

    const app = express();
    app.use(express.json());
    app.use('/api/auth', identityAuthRouter);
    app.use('/api/v2', customerShippingCostRouter);
    const started = await listen(app);
    server = started.server;
    base = started.base;
    const login = await json(base, '/api/auth/login', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ email: admin.email, password: 'ShipTest@2026!' }),
    });
    token = login.body.accessToken;
    assert.ok(token, JSON.stringify(login.body));
  });

  after(async () => {
    server?.close();
    const prisma = getPrisma();
    if (!prisma) return;
    if (quotationId) {
      await prisma.shippingCostTransactionSnapshot.deleteMany({ where: { quotationId } });
      await prisma.commercialQuotation.deleteMany({ where: { id: quotationId } });
    }
    if (inquiryId) await prisma.commercialInquiry.deleteMany({ where: { id: inquiryId } });
    if (rateIds.length) {
      await prisma.shippingCostTransactionSnapshot.deleteMany({ where: { shippingCostRateId: { in: rateIds } } });
      await prisma.auditEvent.deleteMany({ where: { entity: 'CustomerShippingCostRate', entityId: { in: rateIds } } });
      await prisma.customerShippingCostRate.deleteMany({ where: { id: { in: rateIds } } });
    }
    if (customerId) await prisma.customer.deleteMany({ where: { id: customerId } });
    if (adminUserId) {
      await prisma.userRole.deleteMany({ where: { userId: adminUserId } });
      await prisma.userAccount.deleteMany({ where: { id: adminUserId } });
    }
    const elandCount = await prisma.customerShippingCostRate.count({ where: { customerId: elandId, version: 1 } });
    assert.equal(elandCount, 6);
  });

  it('resolves the six current Eland rates and treats customer and incoterm as foreign keys', async () => {
    const prisma = getPrisma()!;
    const incotermByCode: Record<string, string> = { DAP: dapId, CIF: cifId };
    for (const expected of ELAND_SHIPPING_COST_SEED) {
      const resolved = await resolveCustomerShippingCostRate({
        customerId: elandId,
        deliveryPoint: expected.deliveryPoint,
        incotermId: incotermByCode[expected.incotermCode],
        containerType: expected.containerType,
        effectiveDate: '2026-09-23',
      });
      assert.equal(resolved.resolutionCode, 'APPLIED');
      assert.equal(resolved.amount, expected.amount);
      assert.equal(resolved.currency, 'USD');
      assert.equal(resolved.shippingRateVersion, 1);
      assert.notEqual(resolved.amount, 0);
    }
    const sample = await prisma.customerShippingCostRate.findFirst({
      where: { customerId: elandId, version: 1 },
      include: { customer: true, incoterm: true },
    });
    assert.ok(sample);
    assert.equal(sample.customer.id, elandId);
    assert.equal(sample.customer.code, 'C-ELAND');
    assert.ok(sample.incotermId);
    assert.equal(sample.incoterm.id, sample.incotermId);
    assert.ok(sample.incoterm.code === 'DAP' || sample.incoterm.code === 'CIF');
    const before = await resolveCustomerShippingCostRate({
      customerId: elandId,
      deliveryPoint: 'Rotterdam',
      incotermId: cifId,
      containerType: "20' SD",
      effectiveDate: '2026-09-22',
    });
    assert.equal(before.resolutionCode, SHIPPING_COST_NOT_CONFIGURED);
    assert.equal(before.amount, null);
  });

  it('versions, audits, rejects in-place edits, and keeps the commercial snapshot', async () => {
    const prisma = getPrisma()!;
    const actor = { id: adminUserId, name: 'Shipping Admin', email: `ship-admin-${suffix}@test.local`, userType: 'internal' };
    const v1 = await createCustomerShippingCostRate(
      {
        customerId,
        deliveryPoint: 'Rotterdam',
        incotermId: cifId,
        containerType: "20' SD",
        amount: 1111,
        currency: 'USD',
        effectiveFrom: '2026-10-01',
        status: 'ACTIVE',
      },
      actor
    );
    rateIds.push(v1.id);
    assert.equal(v1.version, 1);
    assert.equal(v1.amount, 1111);

    const createdAudit = await prisma.auditEvent.findFirst({
      where: { entity: 'CustomerShippingCostRate', entityId: v1.id, action: 'CREATE' },
    });
    assert.ok(createdAudit);

    const v2 = await createCustomerShippingCostRate(
      {
        customerId,
        deliveryPoint: 'Rotterdam',
        incotermId: cifId,
        containerType: "20' SD",
        amount: 2222,
        currency: 'USD',
        effectiveFrom: '2026-11-01',
        status: 'ACTIVE',
      },
      actor
    );
    rateIds.push(v2.id);
    const closed = await prisma.customerShippingCostRate.findUnique({ where: { id: v1.id } });
    assert.equal(Number(closed?.amount), 1111);
    assert.equal(closed?.status, 'SUPERSEDED');
    assert.equal(closed?.effectiveTo?.toISOString().slice(0, 10), '2026-10-31');
    assert.equal(v2.version, 2);
    assert.equal(v2.amount, 2222);

    const versionAudit = await prisma.auditEvent.findFirst({
      where: { entity: 'CustomerShippingCostRate', entityId: v2.id, action: 'CREATE NEW VERSION' },
    });
    assert.ok(versionAudit);
    assert.match(String(versionAudit?.message), /Previous version 1/);
    assert.match(String(versionAudit?.message), /2026-11-01/);

    const insideV1 = await resolveCustomerShippingCostRate({
      customerId,
      deliveryPoint: 'Rotterdam',
      incotermId: cifId,
      containerType: "20' SD",
      effectiveDate: '2026-10-15',
    });
    const onV2 = await resolveCustomerShippingCostRate({
      customerId,
      deliveryPoint: 'Rotterdam',
      incotermId: cifId,
      containerType: "20' SD",
      effectiveDate: '2026-11-01',
    });
    const beforeV1 = await resolveCustomerShippingCostRate({
      customerId,
      deliveryPoint: 'Rotterdam',
      incotermId: cifId,
      containerType: "20' SD",
      effectiveDate: '2026-09-01',
    });
    assert.equal(insideV1.shippingRateVersion, 1);
    assert.equal(insideV1.amount, 1111);
    assert.equal(onV2.shippingRateVersion, 2);
    assert.equal(onV2.amount, 2222);
    assert.equal(beforeV1.resolutionCode, SHIPPING_COST_NOT_CONFIGURED);
    assert.equal(beforeV1.amount, null);
    assert.notEqual(beforeV1.amount, 0);

    await assert.rejects(
      () =>
        createCustomerShippingCostRate(
          {
            customerId,
            deliveryPoint: 'Rotterdam',
            incotermId: cifId,
            containerType: "20' SD",
            amount: 3333,
            currency: 'USD',
            effectiveFrom: '2026-10-20',
          },
          actor
        ),
      (err: unknown) => err instanceof DomainError && err.details?.issueCode === 'EFFECTIVE_FROM_NOT_AFTER_CURRENT'
    );

    const patched = await json(base, `/api/v2/customer-shipping-cost-rates/${v1.id}`, {
      method: 'PATCH',
      headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({ amount: 9999 }),
    });
    assert.equal(patched.status, 400);
    assert.equal(patched.body.details?.issueCode, 'RATE_AMOUNT_IMMUTABLE');
    await assert.rejects(
      () => rejectInPlaceShippingCostEdit(v1.id, { amount: 1 }),
      (err: unknown) => err instanceof DomainError && err.details?.issueCode === 'RATE_AMOUNT_IMMUTABLE'
    );
    const still = await prisma.customerShippingCostRate.findUnique({ where: { id: v1.id } });
    assert.equal(Number(still?.amount), 1111);

    const inquiry = await prisma.commercialInquiry.create({
      data: {
        inquiryNumber: `INQ-${suffix}`,
        customerId: `legacy-${suffix}`,
        customerName: `Shipping Test ${suffix}`,
        customerMasterId: customerId,
      },
    });
    inquiryId = inquiry.id;
    const quotation = await prisma.commercialQuotation.create({
      data: {
        quotationNumber: `QT-${suffix}`,
        inquiryId: inquiry.id,
        customerId: `legacy-${suffix}`,
        customerName: `Shipping Test ${suffix}`,
        customerMasterId: customerId,
        commercialOfferSnapshot: { productsTotal: 10, shipmentTotal: 40, grandTotal: 50 },
      },
    });
    quotationId = quotation.id;
    const frozen = await freezeQuotationShippingSnapshot({
      quotationId,
      facts: {
        amount: 1111,
        currency: 'USD',
        shippingCostRateId: v1.id,
        shippingRateVersion: 1,
        deliveryPoint: 'Rotterdam',
        incotermId: cifId,
        incotermCode: 'CIF',
        containerType: "20' SD",
        appliedAt: '2026-10-15T00:00:00.000Z',
      },
    });
    assert.equal(frozen.amount, 1111);
    const offer = frozen.commercialOfferSnapshot as {
      productsTotal: number;
      shipmentTotal: number;
      grandTotal: number;
      shippingCostSnapshot: { amount: number };
    };
    assert.equal(offer.productsTotal, 10);
    assert.equal(offer.shipmentTotal, 40);
    assert.equal(offer.grandTotal, 50);
    assert.equal(offer.shippingCostSnapshot.amount, 1111);

    const v3 = await createCustomerShippingCostRate(
      {
        customerId,
        deliveryPoint: 'Rotterdam',
        incotermId: cifId,
        containerType: "20' SD",
        amount: 3333,
        currency: 'USD',
        effectiveFrom: '2026-12-01',
      },
      actor
    );
    rateIds.push(v3.id);
    const stored = await prisma.shippingCostTransactionSnapshot.findUnique({ where: { quotationId } });
    const reloaded = await prisma.commercialQuotation.findUnique({ where: { id: quotationId } });
    const reloadedOffer = reloaded?.commercialOfferSnapshot as { shipmentTotal: number; shippingCostSnapshot: { amount: number } };
    assert.equal(Number(stored?.amount), 1111);
    assert.equal(stored?.shippingRateVersion, 1);
    assert.equal(reloadedOffer.shippingCostSnapshot.amount, 1111);
    assert.equal(reloadedOffer.shipmentTotal, 40);
    assert.equal(Number(v3.amount), 3333);

    await assert.rejects(
      () =>
        createCustomerShippingCostRate(
          {
            customerId,
            deliveryPoint: 'Rotterdam',
            incotermId: 'missing-incoterm',
            containerType: "40' SD/HC",
            amount: 100,
            currency: 'USD',
            effectiveFrom: '2026-10-01',
          },
          actor
        ),
      (err: unknown) => err instanceof DomainError && err.details?.issueCode === 'INCOTERM_NOT_FOUND'
    );
    assert.ok(new Prisma.Decimal(1111));
  });

  it('maps ROTTERDAM to Rotterdam and resolves live Eland CIF 20 SD 1800 and 40 SD/HC 2000', async () => {
    const prisma = getPrisma()!;
    const port = await prisma.destinationPort.findUnique({ where: { code: 'ROTTERDAM' }, select: { code: true, name: true } });
    assert.ok(port);
    const deliveryPoint = mapDestinationPortToShippingDeliveryPoint(port.code, [port]);
    assert.equal(deliveryPoint, 'Rotterdam');
    const twenty = await resolveCustomerShippingCostRate({
      customerId: elandId,
      deliveryPoint: deliveryPoint!,
      incotermId: cifId,
      containerType: mapContainerTypeToCanonicalShippingType('20STD')!,
      effectiveDate: '2026-09-23',
    });
    const forty = await resolveCustomerShippingCostRate({
      customerId: elandId,
      deliveryPoint: deliveryPoint!,
      incotermId: cifId,
      containerType: mapContainerTypeToCanonicalShippingType('40HQ')!,
      effectiveDate: '2026-09-23',
    });
    assert.equal(twenty.amount, 1800);
    assert.equal(forty.amount, 2000);
    const missingType = await resolveCustomerShippingCostRate({
      customerId: elandId,
      deliveryPoint: deliveryPoint!,
      incotermId: cifId,
      containerType: '',
      effectiveDate: '2026-09-23',
    });
    assert.equal(missingType.resolutionCode, SHIPPING_COST_NOT_CONFIGURED);
    assert.equal(missingType.amount, null);
    assert.equal(missingType.blocksPacking, false);
  });
});
