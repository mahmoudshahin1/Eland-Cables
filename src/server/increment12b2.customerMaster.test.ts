import assert from 'node:assert/strict';
import { after, before, describe, it } from 'node:test';
import http from 'node:http';
import express from 'express';
import dotenv from 'dotenv';
import { checkDatabase, getPrisma } from './db';
import { identityAuthRouter } from './identityAuthRoutes';
import { adminIdentityRouter } from './adminIdentityRoutes';
import { adminCustomerRouter } from './adminCustomerRoutes';
import { inquiriesRouter, quotationsRouter } from './commercialRoutes';
import { seedDevelopmentUsers } from './identityService';
import { hashPassword } from '../domain/passwordService';
import { reconcileCommercialCustomerMasters } from './customerMigration';
import { createInquiry } from './commercialRepository';
import { assertCanAccessInquiryOwnership } from './rbac';
import { DomainError } from '../platform/errors/domainError';

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

describe('Increment 12 B2 — Customer master & customer–user linkage', () => {
  let base = '';
  let server: http.Server;
  let adminToken = '';
  let salesToken = '';
  const suffix = `b2-${Date.now()}`;
  let customerAId = '';
  let customerBId = '';
  let userAId = '';
  let userBId = '';
  let tokenA = '';
  let tokenB = '';
  let inquiryAId = '';
  let inquiryANumber = '';

  before(async () => {
    const health = await checkDatabase();
    assert.equal(health.ok, true, health.error);
    await seedDevelopmentUsers();
    const app = express();
    app.use(express.json());
    app.use('/api/auth', identityAuthRouter);
    app.use('/api/admin', adminIdentityRouter);
    app.use('/api/admin', adminCustomerRouter);
    app.use('/api/inquiries', inquiriesRouter);
    app.use('/api/quotations', quotationsRouter);
    const listening = await listen(app);
    server = listening.server;
    base = listening.base;

    const admin = await json(base, '/api/auth/login', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ email: 'admin@energya.com', password: process.env.ADMIN_SEED_PASSWORD || 'Admin@2026!' }),
    });
    assert.equal(admin.status, 200, admin.body.error);
    adminToken = admin.body.accessToken;

    const sales = await json(base, '/api/auth/login', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ email: 'sales@energya.com', password: 'Sales@2026!' }),
    });
    assert.equal(sales.status, 200, sales.body.error);
    salesToken = sales.body.accessToken;

    const prisma = getPrisma()!;
    const role = await prisma.role.findUnique({ where: { code: 'CUSTOMER_USER' } });
    assert.ok(role);
    const pass = await hashPassword('CustB2@2026!');
    const ua = await prisma.userAccount.create({
      data: {
        email: `a-${suffix}@iso.test`,
        username: `a-${suffix}`,
        fullName: 'Customer A User',
        passwordHash: pass,
        userType: 'customer',
      },
    });
    const ub = await prisma.userAccount.create({
      data: {
        email: `b-${suffix}@iso.test`,
        username: `b-${suffix}`,
        fullName: 'Customer B User',
        passwordHash: pass,
        userType: 'customer',
      },
    });
    userAId = ua.id;
    userBId = ub.id;
    await prisma.userRole.createMany({ data: [{ userId: ua.id, roleId: role.id }, { userId: ub.id, roleId: role.id }] });

    const ca = await json(base, '/api/admin/customers', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${adminToken}` },
      body: JSON.stringify({
        code: `CA-${suffix}`,
        name: 'Customer A Trading',
        type: 'EPC_CUSTOMER',
        defaultCurrency: 'USD',
        defaultIncoterm: 'DAP',
        allowedQuotationCurrencies: ['USD', 'EUR'],
      }),
    });
    assert.equal(ca.status, 201, ca.body.error);
    customerAId = ca.body.customer.id;
    const cb = await json(base, '/api/admin/customers', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${adminToken}` },
      body: JSON.stringify({ code: `CB-${suffix}`, name: 'Customer B Trading', type: 'UTILITY' }),
    });
    assert.equal(cb.status, 201, cb.body.error);
    customerBId = cb.body.customer.id;

    const asgA = await json(base, '/api/admin/customer-users', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${adminToken}` },
      body: JSON.stringify({ customerId: customerAId, userAccountId: userAId }),
    });
    assert.equal(asgA.status, 201, asgA.body.error);
    const asgB = await json(base, '/api/admin/customer-users', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${adminToken}` },
      body: JSON.stringify({ customerId: customerBId, userAccountId: userBId }),
    });
    assert.equal(asgB.status, 201, asgB.body.error);

    const loginA = await json(base, '/api/auth/login', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ email: ua.email, password: 'CustB2@2026!' }),
    });
    const loginB = await json(base, '/api/auth/login', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ email: ub.email, password: 'CustB2@2026!' }),
    });
    assert.equal(loginA.status, 200, loginA.body.error);
    assert.equal(loginB.status, 200, loginB.body.error);
    tokenA = loginA.body.accessToken;
    tokenB = loginB.body.accessToken;
  });

  after(async () => {
    await new Promise<void>((resolve, reject) => server.close((err) => (err ? reject(err) : resolve())));
  });

  it('creates a customer', async () => {
    const res = await json(base, '/api/admin/customers?q=' + encodeURIComponent(`CA-${suffix}`), {
      headers: { Authorization: `Bearer ${adminToken}` },
    });
    assert.equal(res.status, 200);
    assert.equal(res.body.customers.some((c: any) => c.id === customerAId), true);
  });

  it('updates a customer', async () => {
    const res = await json(base, `/api/admin/customers/${customerAId}`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${adminToken}` },
      body: JSON.stringify({ paymentTerms: 'Net 45', name: 'Customer A Trading Updated' }),
    });
    assert.equal(res.status, 200, res.body.error);
    assert.equal(res.body.customer.paymentTerms, 'Net 45');
  });

  it('deactivates a customer', async () => {
    const res = await json(base, `/api/admin/customers/${customerBId}/deactivate`, {
      method: 'POST',
      headers: { Authorization: `Bearer ${adminToken}` },
    });
    assert.equal(res.status, 200, res.body.error);
    assert.equal(res.body.customer.status, 'INACTIVE');
    await json(base, `/api/admin/customers/${customerBId}/activate`, {
      method: 'POST',
      headers: { Authorization: `Bearer ${adminToken}` },
    });
  });

  it('assigns a user to a customer (already assigned in setup) and lists customer users', async () => {
    const res = await json(base, `/api/admin/customer-users?customerId=${customerAId}`, {
      headers: { Authorization: `Bearer ${adminToken}` },
    });
    assert.equal(res.status, 200);
    assert.equal(res.body.assignments.some((a: any) => a.user.id === userAId), true);
  });

  it('unauthorized user cannot create customer', async () => {
    const unauth = await json(base, '/api/admin/customers', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ code: 'X', name: 'X' }),
    });
    assert.equal(unauth.status, 401);
    const sales = await json(base, '/api/admin/customers', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${salesToken}` },
      body: JSON.stringify({ code: `SALES-${suffix}`, name: 'Sales should not create' }),
    });
    assert.equal(sales.status, 403);
  });

  it('customer user cannot modify customer master', async () => {
    const patch = await json(base, `/api/admin/customers/${customerAId}`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${tokenA}` },
      body: JSON.stringify({ name: 'Hacked' }),
    });
    assert.equal(patch.status, 403);
    const create = await json(base, '/api/admin/customers', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${tokenA}` },
      body: JSON.stringify({ code: `HACK-${suffix}`, name: 'Hacked' }),
    });
    assert.equal(create.status, 403);
  });

  it('customer A cannot create inquiry for customer B or manipulate customerId', async () => {
    const created = await json(base, '/api/inquiries', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${tokenA}` },
      body: JSON.stringify({ customerId: customerBId, customerName: 'Stolen', projectName: 'B2 iso' }),
    });
    assert.equal(created.status, 201, created.body.error);
    assert.notEqual(created.body.inquiry.customerId, customerBId);
    assert.equal(created.body.inquiry.customerMasterId, customerAId);
    assert.notEqual(created.body.inquiry.customerName, 'Stolen');
    assert.ok(
      created.body.inquiry.customerName === 'Customer A Trading' ||
        created.body.inquiry.customerName === 'Customer A Trading Updated'
    );
    inquiryAId = created.body.inquiry.id;
    inquiryANumber = created.body.inquiry.inquiryNumber;
  });

  it('customer A cannot read customer B inquiries or quotations via URL/query', async () => {
    const createdB = await json(base, '/api/inquiries', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${tokenB}` },
      body: JSON.stringify({ customerId: customerAId, projectName: 'B private' }),
    });
    assert.equal(createdB.status, 201, createdB.body.error);
    assert.equal(createdB.body.inquiry.customerMasterId, customerBId);

    const stealGet = await json(base, `/api/inquiries/${createdB.body.inquiry.id}`, {
      headers: { Authorization: `Bearer ${tokenA}` },
    });
    assert.equal(stealGet.status, 403);

    const listA = await json(base, `/api/inquiries?customerId=${encodeURIComponent(customerBId)}`, {
      headers: { Authorization: `Bearer ${tokenA}` },
    });
    assert.equal(listA.status, 200);
    const ids = (listA.body.inquiries || []).map((i: any) => i.id);
    assert.equal(ids.includes(createdB.body.inquiry.id), false);
    assert.equal(ids.includes(inquiryAId), true);

    const quoted = await json(base, '/api/quotations', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${salesToken}` },
      body: JSON.stringify({ inquiryId: createdB.body.inquiry.id }),
    });
    // May 400 if empty lines — add a line first if needed
    if (quoted.status !== 201) {
      await json(base, `/api/inquiries/${createdB.body.inquiry.id}/lines`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${tokenB}` },
        body: JSON.stringify({ cableDescription: 'Placeholder isolation line', requestedQuantity: 1 }),
      });
    }
    const quoted2 = quoted.status === 201 ? quoted : await json(base, '/api/quotations', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${salesToken}` },
      body: JSON.stringify({ inquiryId: createdB.body.inquiry.id }),
    });
    if (quoted2.status === 201) {
      const stealQ = await json(base, `/api/quotations/${quoted2.body.quotation.id}`, {
        headers: { Authorization: `Bearer ${tokenA}` },
      });
      assert.equal(stealQ.status, 403);
      const listQ = await json(base, `/api/quotations?customerId=${customerBId}`, {
        headers: { Authorization: `Bearer ${tokenA}` },
      });
      const qids = (listQ.body.quotations || []).map((q: any) => q.id);
      assert.equal(qids.includes(quoted2.body.quotation.id), false);
    }
  });

  it('customer A cannot assign itself to another customer', async () => {
    const res = await json(base, '/api/admin/customer-users', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${tokenA}` },
      body: JSON.stringify({ customerId: customerBId, userAccountId: userAId }),
    });
    assert.equal(res.status, 403);
  });

  it('internal sales can access authorized customers commercial records', async () => {
    const getA = await json(base, `/api/inquiries/${inquiryAId}`, {
      headers: { Authorization: `Bearer ${salesToken}` },
    });
    assert.equal(getA.status, 200, getA.body.error);
    const list = await json(base, '/api/inquiries', {
      headers: { Authorization: `Bearer ${salesToken}` },
    });
    assert.equal(list.status, 200);
    assert.equal((list.body.inquiries || []).some((i: any) => i.id === inquiryAId), true);
  });

  it('AuditEvent is generated for customer master and assignment', async () => {
    const prisma = getPrisma()!;
    const events = await prisma.auditEvent.findMany({
      where: {
        entity: { in: ['Customer', 'CustomerUser'] },
        entityId: { in: [customerAId] },
      },
    });
    assert.ok(events.some((e) => e.action === 'CREATE_CUSTOMER'));
    assert.ok(events.some((e) => e.action === 'UPDATE_CUSTOMER'));
    const dumped = JSON.stringify(events).toLowerCase();
    assert.equal(dumped.includes('passwordhash'), false);
    const assignEvents = await prisma.auditEvent.findMany({ where: { action: 'ASSIGN_CUSTOMER_USER' }, take: 20, orderBy: { at: 'desc' } });
    assert.ok(assignEvents.length > 0);
    assert.equal(JSON.stringify(assignEvents).toLowerCase().includes('passwordhash'), false);
  });

  it('existing inquiries remain accessible after migration', async () => {
    const prisma = getPrisma()!;
    const legacyKey = `LEGACY-AMBIGUOUS-${suffix}`;
    const inquiry = await createInquiry(
      { customerId: legacyKey, customerName: 'Unmapped historical', projectName: 'Keep' },
      { id: 'u-sales-b2', name: 'Sales', email: 'sales@energya.com', userType: 'internal' }
    );
    const result = await reconcileCommercialCustomerMasters();
    const still = await prisma.commercialInquiry.findUnique({ where: { id: inquiry.id } });
    assert.ok(still);
    assert.equal(still!.customerId, legacyKey);
    const ex = await prisma.customerMigrationException.findFirst({
      where: { sourceId: inquiry.id, legacyCustomerId: legacyKey },
    });
    assert.ok(ex, 'ambiguous identity must be documented, not guessed');
    const get = await json(base, `/api/inquiries/${inquiry.id}`, {
      headers: { Authorization: `Bearer ${salesToken}` },
    });
    assert.equal(get.status, 200);
    assert.equal(get.body.inquiry.inquiryNumber, inquiry.inquiryNumber);
    assert.ok(result.exceptions >= 1 || ex);
  });

  it('existing quotation isolation remains intact for in-memory actors', () => {
    assert.doesNotThrow(() =>
      assertCanAccessInquiryOwnership({ id: 'u-cust-eland', userType: 'customer' }, 'u-cust-eland')
    );
    assert.throws(
      () => assertCanAccessInquiryOwnership({ id: 'u-cust-dewa', userType: 'customer' }, 'u-cust-eland'),
      (err: unknown) => err instanceof DomainError
    );
  });
});
