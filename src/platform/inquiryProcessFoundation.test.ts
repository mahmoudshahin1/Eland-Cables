import assert from 'node:assert/strict';
import { after, before, describe, it } from 'node:test';
import http from 'node:http';
import express from 'express';
import dotenv from 'dotenv';
import { checkDatabase, getPrisma } from '../server/db';
import { identityAuthRouter } from '../server/identityAuthRoutes';
import { inquiriesRouter } from '../server/commercialRoutes';
import { v2InquiryConfigurationRouter } from '../server/v2InquiryConfigurationRoutes';
import { seedDevelopmentUsers } from '../server/identityService';
import { hashPassword } from '../domain/passwordService';
import { SYSTEM_ADMIN_ROLE_CODE } from '../domain/permissionCatalog';

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

describe('Task 05I-A — inquiry process foundation', () => {
  let base = '';
  let server: http.Server;
  let vipToken = '';
  let stdToken = '';
  const suffix = `05ia-${Date.now()}`;

  before(async () => {
    const health = await checkDatabase();
    assert.equal(health.ok, true, health.error);
    await seedDevelopmentUsers();
    const prisma = getPrisma()!;
    const role = await prisma.role.findFirst({ where: { code: SYSTEM_ADMIN_ROLE_CODE } });
    assert.ok(role);

    const vipGroup = await prisma.customerGroup.create({
      data: {
        code: `VIP-${suffix}`,
        name: 'VIP Group',
        defaultInquiryProcessCode: 'VIP_FAST_TRACK',
      },
    });
    const stdGroup = await prisma.customerGroup.create({
      data: {
        code: `STD-${suffix}`,
        name: 'Standard Group',
        defaultInquiryProcessCode: 'STANDARD_WORKFLOW',
      },
    });

    const vipCustomer = await prisma.customer.create({
      data: {
        code: `VIP-C-${suffix}`,
        name: 'VIP Customer',
        defaultInquiryProcessCode: 'VIP_FAST_TRACK',
        customerGroupId: stdGroup.id,
      },
    });
    const stdCustomer = await prisma.customer.create({
      data: {
        code: `STD-C-${suffix}`,
        name: 'Standard Customer',
        customerGroupId: vipGroup.id,
      },
    });

    const vipUser = await prisma.userAccount.create({
      data: {
        username: `vip-${suffix}`,
        email: `vip-${suffix}@test.local`,
        fullName: 'VIP User',
        userType: 'customer',
        passwordHash: await hashPassword('VipTest@2026!'),
        status: 'ACTIVE',
      },
    });
    const stdUser = await prisma.userAccount.create({
      data: {
        username: `std-${suffix}`,
        email: `std-${suffix}@test.local`,
        fullName: 'Std User',
        userType: 'customer',
        passwordHash: await hashPassword('StdTest@2026!'),
        status: 'ACTIVE',
      },
    });

    await prisma.customerUser.createMany({
      data: [
        { customerId: vipCustomer.id, userAccountId: vipUser.id, status: 'ACTIVE' },
        { customerId: stdCustomer.id, userAccountId: stdUser.id, status: 'ACTIVE' },
      ],
    });
    await prisma.userRole.createMany({
      data: [
        { userId: vipUser.id, roleId: role.id },
        { userId: stdUser.id, roleId: role.id },
      ],
    });

    await prisma.numberSequence.upsert({
      where: { code: 'INQ_COMMERCIAL' },
      create: {
        code: 'INQ_COMMERCIAL',
        name: 'Commercial Inquiry (V2)',
        prefix: 'INQ',
        format: '{PREFIX}{YY}-{#####}',
        nextSerial: 1,
        moduleId: 'INQUIRY_QUOTATION',
      },
      update: {},
    });

    const app = express();
    app.use(express.json());
    app.use('/api/auth', identityAuthRouter);
    app.use('/api/inquiries', inquiriesRouter);
    app.use('/api/v2/inquiries', v2InquiryConfigurationRouter);
    const listening = await listen(app);
    server = listening.server;
    base = listening.base;

    const loginVip = await json(base, '/api/auth/login', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ email: vipUser.email, password: 'VipTest@2026!' }),
    });
    const loginStd = await json(base, '/api/auth/login', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ email: stdUser.email, password: 'StdTest@2026!' }),
    });
    assert.equal(loginVip.status, 200, loginVip.body.error);
    assert.equal(loginStd.status, 200, loginStd.body.error);
    vipToken = loginVip.body.accessToken;
    stdToken = loginStd.body.accessToken;
    assert.ok(vipToken);
    assert.ok(stdToken);
  });

  after(async () => {
    await new Promise<void>((resolve) => server?.close(() => resolve()));
  });

  it('V1 create resolves customer override and audits process assignment', async () => {
    const created = await json(base, '/api/inquiries', {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${vipToken}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        customerReference: `VIP-REF-${suffix}`,
        commercialMetadata: {
          inquiryProcessCode: 'STANDARD_WORKFLOW',
          inquiryProcessSource: 'CUSTOMER_OVERRIDE',
        },
      }),
    });
    assert.equal(created.status, 201);
    const meta = created.body.inquiry?.commercialMetadata || {};
    assert.equal(meta.inquiryProcessCode, 'VIP_FAST_TRACK');
    assert.equal(meta.inquiryProcessSource, 'CUSTOMER_OVERRIDE');

    const prisma = getPrisma()!;
    const audit = await prisma.auditEvent.findFirst({
      where: {
        entity: 'CommercialInquiry',
        entityId: created.body.inquiry.inquiryNumber,
        action: 'INQUIRY_PROCESS_ASSIGNED',
      },
      orderBy: { at: 'desc' },
    });
    assert.ok(audit);
    const auditValue = audit.newValue as Record<string, unknown>;
    assert.equal(auditValue.inquiryProcessCode, 'VIP_FAST_TRACK');
    assert.equal(auditValue.inquiryProcessSource, 'CUSTOMER_OVERRIDE');
  });

  it('V1 create uses customer group when no customer override', async () => {
    const created = await json(base, '/api/inquiries', {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${stdToken}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({ customerReference: `STD-REF-${suffix}` }),
    });
    assert.equal(created.status, 201);
    const meta = created.body.inquiry?.commercialMetadata || {};
    assert.equal(meta.inquiryProcessCode, 'VIP_FAST_TRACK');
    assert.equal(meta.inquiryProcessSource, 'CUSTOMER_GROUP');
  });

  it('V2 create resolves process from customer scope (IDOR-safe)', async () => {
    const created = await json(base, '/api/v2/inquiries', {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${vipToken}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        customerReference: `V2-${suffix}`,
        inquiryProcessCode: 'STANDARD_WORKFLOW',
      }),
    });
    assert.equal(created.status, 201);
    assert.equal(created.body.inquiry.inquiryProcessCode, 'VIP_FAST_TRACK');
    assert.equal(created.body.inquiry.inquiryProcessSource, 'CUSTOMER_OVERRIDE');
    assert.equal(created.body.inquiry.workflowChannel, 'V2_CONFIGURATION');
  });
});
