import assert from 'node:assert/strict';
import { after, before, describe, it } from 'node:test';
import http from 'node:http';
import express from 'express';
import dotenv from 'dotenv';
import { checkDatabase, getPrisma } from '../server/db';
import { identityAuthRouter } from '../server/identityAuthRoutes';
import { shippingCostRouter } from '../server/shippingCostRoutes';
import { seedDevelopmentUsers } from '../server/identityService';
import { hashPassword } from '../domain/passwordService';
import { SYSTEM_ADMIN_ROLE_CODE } from '../domain/permissionCatalog';
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

describe('Task 05I-DF-B4-B — Shipping Cost Master', () => {
  let base = '';
  let server: http.Server;
  let tokenAdmin = '';
  let tokenCustomer = '';
  let tokenStudyOnly = '';
  const suffix = `B4B${Date.now().toString(36).toUpperCase()}`;
  const portCode = `P${suffix}`;
  const incotermCode = `I${suffix}`.slice(0, 12);
  const typeCode = `T${suffix}`.slice(0, 12);
  const auth = () => ({ Authorization: `Bearer ${tokenAdmin}`, 'Content-Type': 'application/json' });
  const createdRateIds: string[] = [];

  before(async () => {
    const health = await checkDatabase();
    assert.equal(health.ok, true, health.error);
    await seedDevelopmentUsers();
    const prisma = getPrisma()!;
    const adminRole = await prisma.role.findFirst({ where: { code: SYSTEM_ADMIN_ROLE_CODE } });
    const customerRole = await prisma.role.findFirst({ where: { code: 'CUSTOMER_USER' } });
    const salesRole = await prisma.role.findFirst({ where: { code: 'SALES_REPRESENTATIVE' } });
    assert.ok(adminRole && customerRole && salesRole);

    await prisma.costingCurrency.upsert({
      where: { code: 'USD' },
      create: { code: 'USD', name: 'US Dollar', status: 'ACTIVE' },
      update: { status: 'ACTIVE' },
    });
    await prisma.containerType.upsert({
      where: { code: typeCode },
      create: { code: typeCode, description: 'B4-B test type', active: true },
      update: { active: true },
    });

    const customer = await prisma.customer.create({ data: { code: `C-${suffix}`, name: 'B4B Customer' } });
    const admin = await prisma.userAccount.create({
      data: {
        username: `b4b-admin-${suffix}`,
        email: `b4b-admin-${suffix}@test.local`,
        fullName: 'B4B Admin',
        userType: 'internal',
        passwordHash: await hashPassword('B4BTest@2026!'),
        status: 'ACTIVE',
      },
    });
    const custUser = await prisma.userAccount.create({
      data: {
        username: `b4b-cust-${suffix}`,
        email: `b4b-cust-${suffix}@test.local`,
        fullName: 'B4B Customer',
        userType: 'customer',
        passwordHash: await hashPassword('B4BTest@2026!'),
        status: 'ACTIVE',
      },
    });
    const studyOnly = await prisma.userAccount.create({
      data: {
        username: `b4b-study-${suffix}`,
        email: `b4b-study-${suffix}@test.local`,
        fullName: 'B4B Study Only',
        userType: 'internal',
        passwordHash: await hashPassword('B4BTest@2026!'),
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
        { userId: studyOnly.id, roleId: salesRole.id },
      ],
    });

    const app = express();
    app.use(express.json());
    app.use('/api/auth', identityAuthRouter);
    app.use('/api/v2', shippingCostRouter);
    const started = await listen(app);
    server = started.server;
    base = started.base;

    const loginAdmin = await json(base, '/api/auth/login', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ email: admin.email, password: 'B4BTest@2026!' }),
    });
    const loginCust = await json(base, '/api/auth/login', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ email: custUser.email, password: 'B4BTest@2026!' }),
    });
    const loginStudy = await json(base, '/api/auth/login', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ email: studyOnly.email, password: 'B4BTest@2026!' }),
    });
    tokenAdmin = loginAdmin.body.accessToken;
    tokenCustomer = loginCust.body.accessToken;
    tokenStudyOnly = loginStudy.body.accessToken;
    assert.ok(tokenAdmin, JSON.stringify(loginAdmin.body));
  });

  after(async () => {
    const prisma = getPrisma();
    try {
      if (prisma) {
        await prisma.shippingCostRate.deleteMany({
          where: { OR: [{ destinationPortCode: portCode }, { id: { in: createdRateIds } }, { incotermCode }] },
        });
        await deleteNonIccTestIncoterm(prisma, incotermCode);
        await prisma.destinationPort.deleteMany({ where: { code: portCode } });
        await prisma.containerType.deleteMany({ where: { code: typeCode } });
        const emails = [
          `b4b-admin-${suffix}@test.local`,
          `b4b-cust-${suffix}@test.local`,
          `b4b-study-${suffix}@test.local`,
        ];
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

  it('canonicalizes destination port codes and rejects case/whitespace duplicates', async () => {
    const created = await json(base, '/api/v2/destination-ports', {
      method: 'POST',
      headers: auth(),
      body: JSON.stringify({ code: ` ${portCode.toLowerCase()} `, name: 'Alexandria', countryCode: 'eg' }),
    });
    assert.equal(created.status, 201, JSON.stringify(created.body));
    assert.equal(created.body.code, portCode);
    assert.equal(created.body.countryCode, 'EG');

    const dup = await json(base, '/api/v2/destination-ports', {
      method: 'POST',
      headers: auth(),
      body: JSON.stringify({ code: portCode.toLowerCase(), name: 'Alexandria 2', countryCode: 'EG' }),
    });
    assert.equal(dup.status, 400);
    assert.equal(dup.body.details?.issueCode, 'DUPLICATE_CODE');
  });

  it('canonicalizes incoterm codes including dap / DAP / padded', async () => {
    const created = await json(base, '/api/v2/incoterms', {
      method: 'POST',
      headers: auth(),
      body: JSON.stringify({ code: ` ${incotermCode.toLowerCase()} `, name: 'Delivered at Place' }),
    });
    assert.equal(created.status, 201, JSON.stringify(created.body));
    assert.equal(created.body.code, incotermCode);
    const dup = await json(base, '/api/v2/incoterms', {
      method: 'POST',
      headers: auth(),
      body: JSON.stringify({ code: incotermCode, name: 'Duplicate' }),
    });
    assert.equal(dup.status, 400);
  });

  it('audits destination port and incoterm create', async () => {
    const prisma = getPrisma()!;
    const port = await prisma.destinationPort.findUnique({ where: { code: portCode } });
    const incoterm = await prisma.incoterm.findUnique({ where: { code: incotermCode } });
    assert.ok(port && incoterm);
    const portAudit = await prisma.auditEvent.findFirst({
      where: { entity: 'DestinationPort', entityId: port.id, action: 'DESTINATION_PORT_CREATED' },
    });
    const incotermAudit = await prisma.auditEvent.findFirst({
      where: { entity: 'Incoterm', entityId: incoterm.id, action: 'INCOTERM_CREATED' },
    });
    assert.ok(portAudit);
    assert.ok(incotermAudit);
  });

  it('creates a valid shipping cost rate and rejects unknown/inactive masters and invalid amounts', async () => {
    const created = await json(base, '/api/v2/shipping-cost-rates', {
      method: 'POST',
      headers: auth(),
      body: JSON.stringify({
        destinationPortCode: portCode.toLowerCase(),
        incotermCode: incotermCode.toLowerCase(),
        containerTypeCode: typeCode.toLowerCase(),
        rateAmount: 900,
        currencyCode: 'usd',
        effectiveFrom: '2026-01-01',
      }),
    });
    assert.equal(created.status, 201, JSON.stringify(created.body));
    createdRateIds.push(created.body.id);
    assert.equal(created.body.destinationPortCode, portCode);
    assert.equal(created.body.rateAmount, 900);
    assert.equal(created.body.currencyCode, 'USD');

    const unknownDest = await json(base, '/api/v2/shipping-cost-rates', {
      method: 'POST',
      headers: auth(),
      body: JSON.stringify({
        destinationPortCode: 'NO_SUCH_PORT',
        incotermCode,
        containerTypeCode: typeCode,
        rateAmount: 10,
        currencyCode: 'USD',
        effectiveFrom: '2026-01-01',
      }),
    });
    assert.equal(unknownDest.status, 400);
    assert.equal(unknownDest.body.details?.issueCode, 'DESTINATION_PORT_NOT_FOUND');

    const unknownIncoterm = await json(base, '/api/v2/shipping-cost-rates', {
      method: 'POST',
      headers: auth(),
      body: JSON.stringify({
        destinationPortCode: portCode,
        incotermCode: 'NO_SUCH_INCOTERM',
        containerTypeCode: typeCode,
        rateAmount: 10,
        currencyCode: 'USD',
        effectiveFrom: '2026-01-01',
      }),
    });
    assert.equal(unknownIncoterm.body.details?.issueCode, 'INCOTERM_NOT_FOUND');

    const unknownType = await json(base, '/api/v2/shipping-cost-rates', {
      method: 'POST',
      headers: auth(),
      body: JSON.stringify({
        destinationPortCode: portCode,
        incotermCode,
        containerTypeCode: 'NO_SUCH_TYPE',
        rateAmount: 10,
        currencyCode: 'USD',
        effectiveFrom: '2026-01-01',
      }),
    });
    assert.equal(unknownType.body.details?.issueCode, 'CONTAINER_TYPE_NOT_FOUND');

    const unknownCcy = await json(base, '/api/v2/shipping-cost-rates', {
      method: 'POST',
      headers: auth(),
      body: JSON.stringify({
        destinationPortCode: portCode,
        incotermCode,
        containerTypeCode: typeCode,
        rateAmount: 10,
        currencyCode: 'ZZZ',
        effectiveFrom: '2026-01-01',
      }),
    });
    assert.equal(unknownCcy.body.details?.issueCode, 'CURRENCY_NOT_FOUND');

    const zero = await json(base, '/api/v2/shipping-cost-rates', {
      method: 'POST',
      headers: auth(),
      body: JSON.stringify({
        destinationPortCode: portCode,
        incotermCode,
        containerTypeCode: typeCode,
        rateAmount: 0,
        currencyCode: 'USD',
        effectiveFrom: '2026-01-01',
      }),
    });
    assert.equal(zero.body.details?.issueCode, 'INVALID_RATE_AMOUNT');

    const negative = await json(base, '/api/v2/shipping-cost-rates', {
      method: 'POST',
      headers: auth(),
      body: JSON.stringify({
        destinationPortCode: portCode,
        incotermCode,
        containerTypeCode: typeCode,
        rateAmount: -5,
        currencyCode: 'USD',
        effectiveFrom: '2026-01-01',
      }),
    });
    assert.equal(negative.body.details?.issueCode, 'INVALID_RATE_AMOUNT');

    const badDates = await json(base, '/api/v2/shipping-cost-rates', {
      method: 'POST',
      headers: auth(),
      body: JSON.stringify({
        destinationPortCode: portCode,
        incotermCode,
        containerTypeCode: typeCode,
        rateAmount: 10,
        currencyCode: 'USD',
        effectiveFrom: '2026-04-01',
        effectiveTo: '2026-03-01',
      }),
    });
    assert.equal(badDates.body.details?.issueCode, 'INVALID_DATE_RANGE');
  });

  it('rejects overlapping active rates and preserves history when closing then inserting', async () => {
    const overlap = await json(base, '/api/v2/shipping-cost-rates', {
      method: 'POST',
      headers: auth(),
      body: JSON.stringify({
        destinationPortCode: portCode,
        incotermCode,
        containerTypeCode: typeCode,
        rateAmount: 925,
        currencyCode: 'USD',
        effectiveFrom: '2026-03-01',
        effectiveTo: '2026-04-30',
      }),
    });
    assert.equal(overlap.status, 400);
    assert.equal(overlap.body.details?.issueCode, 'RATE_OVERLAP');

    const firstId = createdRateIds[0];
    const closed = await json(base, `/api/v2/shipping-cost-rates/${firstId}`, {
      method: 'PATCH',
      headers: auth(),
      body: JSON.stringify({ effectiveTo: '2026-03-31' }),
    });
    assert.equal(closed.status, 200, JSON.stringify(closed.body));

    const next = await json(base, '/api/v2/shipping-cost-rates', {
      method: 'POST',
      headers: auth(),
      body: JSON.stringify({
        destinationPortCode: portCode,
        incotermCode,
        containerTypeCode: typeCode,
        rateAmount: 950,
        currencyCode: 'USD',
        effectiveFrom: '2026-04-01',
        effectiveTo: '2026-06-30',
      }),
    });
    assert.equal(next.status, 201, JSON.stringify(next.body));
    createdRateIds.push(next.body.id);

    const first = await json(base, `/api/v2/shipping-cost-rates/${firstId}`, { headers: auth() });
    assert.equal(first.body.rateAmount, 900);
    assert.equal(first.body.effectiveTo, '2026-03-31');

    const mutateAmount = await json(base, `/api/v2/shipping-cost-rates/${firstId}`, {
      method: 'PATCH',
      headers: auth(),
      body: JSON.stringify({ rateAmount: 1 }),
    });
    assert.equal(mutateAmount.status, 400);
    assert.equal(mutateAmount.body.details?.issueCode, 'RATE_AMOUNT_IMMUTABLE');
  });

  it('resolves 0/1/>1, inclusive bounds, open-ended, inactive, and canonical codes', async () => {
    const selectFeb = await json(
      base,
      `/api/v2/shipping-cost-rates/resolve?destinationPortCode=${portCode.toLowerCase()}&incotermCode=${incotermCode.toLowerCase()}&containerTypeCode=${typeCode.toLowerCase()}&asOfDate=2026-02-15`,
      { headers: auth() }
    );
    assert.equal(selectFeb.status, 200, JSON.stringify(selectFeb.body));
    assert.equal(selectFeb.body.status, 'SELECT');
    assert.equal(selectFeb.body.rate.rateAmount, 900);

    const selectApr = await json(
      base,
      `/api/v2/shipping-cost-rates/resolve?destinationPortCode=${portCode}&incotermCode=${incotermCode}&containerTypeCode=${typeCode}&asOfDate=2026-04-15`,
      { headers: auth() }
    );
    assert.equal(selectApr.body.status, 'SELECT');
    assert.equal(selectApr.body.rate.rateAmount, 950);

    const missing = await json(
      base,
      `/api/v2/shipping-cost-rates/resolve?destinationPortCode=${portCode}&incotermCode=${incotermCode}&containerTypeCode=${typeCode}&asOfDate=2025-01-01`,
      { headers: auth() }
    );
    assert.equal(missing.body.status, 'RATE_NOT_FOUND');

    const startBound = await json(
      base,
      `/api/v2/shipping-cost-rates/resolve?destinationPortCode=${portCode}&incotermCode=${incotermCode}&containerTypeCode=${typeCode}&asOfDate=2026-01-01`,
      { headers: auth() }
    );
    assert.equal(startBound.body.status, 'SELECT');
    const endBound = await json(
      base,
      `/api/v2/shipping-cost-rates/resolve?destinationPortCode=${portCode}&incotermCode=${incotermCode}&containerTypeCode=${typeCode}&asOfDate=2026-03-31`,
      { headers: auth() }
    );
    assert.equal(endBound.body.status, 'SELECT');

    const prisma = getPrisma()!;
    const ambiguousA = await prisma.shippingCostRate.create({
      data: {
        destinationPortCode: portCode,
        incotermCode,
        containerTypeCode: typeCode,
        rateAmount: 10,
        currencyCode: 'USD',
        effectiveFrom: new Date('2026-01-01T00:00:00.000Z'),
        effectiveTo: new Date('2026-01-31T00:00:00.000Z'),
        active: true,
      },
    });
    const ambiguousB = await prisma.shippingCostRate.create({
      data: {
        destinationPortCode: portCode,
        incotermCode,
        containerTypeCode: typeCode,
        rateAmount: 20,
        currencyCode: 'USD',
        effectiveFrom: new Date('2026-01-15T00:00:00.000Z'),
        effectiveTo: new Date('2026-02-15T00:00:00.000Z'),
        active: true,
      },
    });
    createdRateIds.push(ambiguousA.id, ambiguousB.id);
    const ambiguous = await json(
      base,
      `/api/v2/shipping-cost-rates/resolve?destinationPortCode=${portCode}&incotermCode=${incotermCode}&containerTypeCode=${typeCode}&asOfDate=2026-01-20`,
      { headers: auth() }
    );
    assert.equal(ambiguous.body.status, 'RATE_AMBIGUOUS');
    assert.equal(ambiguous.body.rate, null);

    await prisma.shippingCostRate.update({ where: { id: ambiguousA.id }, data: { active: false } });
    await prisma.shippingCostRate.update({ where: { id: ambiguousB.id }, data: { active: false } });

    const open = await json(base, '/api/v2/shipping-cost-rates', {
      method: 'POST',
      headers: auth(),
      body: JSON.stringify({
        destinationPortCode: portCode,
        incotermCode,
        containerTypeCode: typeCode,
        rateAmount: 980,
        currencyCode: 'USD',
        effectiveFrom: '2026-07-01',
      }),
    });
    assert.equal(open.status, 201, JSON.stringify(open.body));
    createdRateIds.push(open.body.id);
    const openResolve = await json(
      base,
      `/api/v2/shipping-cost-rates/resolve?destinationPortCode=${portCode}&incotermCode=${incotermCode}&containerTypeCode=${typeCode}&asOfDate=2026-12-01`,
      { headers: auth() }
    );
    assert.equal(openResolve.body.status, 'SELECT');
    assert.equal(openResolve.body.rate.rateAmount, 980);

    const deactivated = await json(base, `/api/v2/shipping-cost-rates/${open.body.id}`, {
      method: 'PATCH',
      headers: auth(),
      body: JSON.stringify({ active: false }),
    });
    assert.equal(deactivated.status, 200);
    const afterDeactivate = await json(
      base,
      `/api/v2/shipping-cost-rates/resolve?destinationPortCode=${portCode}&incotermCode=${incotermCode}&containerTypeCode=${typeCode}&asOfDate=2026-12-01`,
      { headers: auth() }
    );
    assert.equal(afterDeactivate.body.status, 'RATE_NOT_FOUND');
  });

  it('audits rate create, date change, and deactivate', async () => {
    const prisma = getPrisma()!;
    const created = await prisma.auditEvent.findFirst({
      where: { entity: 'ShippingCostRate', action: 'SHIPPING_COST_RATE_CREATED', entityId: createdRateIds[0] },
    });
    const dated = await prisma.auditEvent.findFirst({
      where: { entity: 'ShippingCostRate', action: 'SHIPPING_COST_RATE_DATES_CHANGED', entityId: createdRateIds[0] },
    });
    assert.ok(created);
    assert.ok(dated);
  });

  it('rejects inactive destination on new rate writes and still resolves historical rates', async () => {
    const deactivated = await json(base, `/api/v2/destination-ports/${portCode}`, {
      method: 'PATCH',
      headers: auth(),
      body: JSON.stringify({ active: false }),
    });
    assert.equal(deactivated.status, 200);
    const blocked = await json(base, '/api/v2/shipping-cost-rates', {
      method: 'POST',
      headers: auth(),
      body: JSON.stringify({
        destinationPortCode: portCode,
        incotermCode,
        containerTypeCode: typeCode,
        rateAmount: 1000,
        currencyCode: 'USD',
        effectiveFrom: '2027-01-01',
      }),
    });
    assert.equal(blocked.body.details?.issueCode, 'DESTINATION_PORT_INACTIVE');
    const historical = await json(
      base,
      `/api/v2/shipping-cost-rates/resolve?destinationPortCode=${portCode}&incotermCode=${incotermCode}&containerTypeCode=${typeCode}&asOfDate=2026-02-15`,
      { headers: auth() }
    );
    assert.equal(historical.body.status, 'SELECT');
  });

  it('denies customers and container-study-only users', async () => {
    const cust = await json(base, '/api/v2/destination-ports', {
      headers: { Authorization: `Bearer ${tokenCustomer}` },
    });
    assert.equal(cust.status, 401);
    const study = await json(base, '/api/v2/shipping-cost-rates', {
      method: 'POST',
      headers: { Authorization: `Bearer ${tokenStudyOnly}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({
        destinationPortCode: portCode,
        incotermCode,
        containerTypeCode: typeCode,
        rateAmount: 1,
        currencyCode: 'USD',
        effectiveFrom: '2028-01-01',
      }),
    });
    assert.equal(study.status, 401);
  });
});
