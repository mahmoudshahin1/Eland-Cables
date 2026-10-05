import assert from 'node:assert/strict';
import { after, before, describe, it } from 'node:test';
import http from 'node:http';
import express from 'express';
import dotenv from 'dotenv';
import { checkDatabase, getPrisma } from '../server/db';
import { identityAuthRouter } from '../server/identityAuthRoutes';
import { v2InquiryConfigurationRouter } from '../server/v2InquiryConfigurationRoutes';
import { commercialCommitmentsRouter } from '../server/commercialCommitmentRoutes';
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

describe('Task 05G — customer portal journey', () => {
  let base = '';
  let server: http.Server;
  let tokenA = '';
  let tokenB = '';
  let inquiryIdA = '';
  const suffix = `custportal-${Date.now()}`;

  before(async () => {
    const health = await checkDatabase();
    assert.equal(health.ok, true, health.error);
    await seedDevelopmentUsers();
    const prisma = getPrisma()!;
    const role = await prisma.role.findFirst({ where: { code: SYSTEM_ADMIN_ROLE_CODE } });
    assert.ok(role);
    const custA = await prisma.customer.create({ data: { code: `CPA-${suffix}`, name: 'Portal Customer A' } });
    const custB = await prisma.customer.create({ data: { code: `CPB-${suffix}`, name: 'Portal Customer B' } });
    const userA = await prisma.userAccount.create({
      data: {
        username: `cpa-${suffix}`,
        email: `cpa-${suffix}@test.local`,
        fullName: 'Portal A',
        userType: 'customer',
        passwordHash: await hashPassword('PortalTest@2026!'),
        status: 'ACTIVE',
      },
    });
    const userB = await prisma.userAccount.create({
      data: {
        username: `cpb-${suffix}`,
        email: `cpb-${suffix}@test.local`,
        fullName: 'Portal B',
        userType: 'customer',
        passwordHash: await hashPassword('PortalTest@2026!'),
        status: 'ACTIVE',
      },
    });
    await prisma.customerUser.createMany({
      data: [
        { customerId: custA.id, userAccountId: userA.id, status: 'ACTIVE' },
        { customerId: custB.id, userAccountId: userB.id, status: 'ACTIVE' },
      ],
    });
    await prisma.userRole.createMany({
      data: [
        { userId: userA.id, roleId: role.id },
        { userId: userB.id, roleId: role.id },
      ],
    });

    const app = express();
    app.use(express.json());
    app.use('/api/auth', identityAuthRouter);
    app.use('/api/v2/inquiries', v2InquiryConfigurationRouter);
    app.use('/api/commercial-commitments', commercialCommitmentsRouter);
    const listening = await listen(app);
    server = listening.server;
    base = listening.base;

    const loginA = await json(base, '/api/auth/login', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ email: userA.email, password: 'PortalTest@2026!' }),
    });
    const loginB = await json(base, '/api/auth/login', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ email: userB.email, password: 'PortalTest@2026!' }),
    });
    tokenA = loginA.body.accessToken as string;
    tokenB = loginB.body.accessToken as string;
    assert.ok(tokenA);
    assert.ok(tokenB);

    const created = await json(base, '/api/v2/inquiries', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${tokenA}` },
      body: JSON.stringify({ projectName: 'Customer portal E2E' }),
    });
    assert.equal(created.status, 201);
    inquiryIdA = created.body.inquiry.id as string;
  });

  after(async () => {
    await new Promise<void>((resolve, reject) => server.close((err) => (err ? reject(err) : resolve())));
  });

  it('customer can login and list own V2 inquiries', async () => {
    const list = await json(base, '/api/v2/inquiries', {
      headers: { Authorization: `Bearer ${tokenA}` },
    });
    assert.equal(list.status, 200);
    const rows = list.body.inquiries as Array<{ id: string }>;
    assert.ok(rows.some((r) => r.id === inquiryIdA));
  });

  it('customer can fetch own inquiry detail', async () => {
    const detail = await json(base, `/api/v2/inquiries/${inquiryIdA}`, {
      headers: { Authorization: `Bearer ${tokenA}` },
    });
    assert.equal(detail.status, 200);
    assert.equal(detail.body.inquiry.id, inquiryIdA);
  });

  it('IDOR: customer B cannot read customer A inquiry', async () => {
    const detail = await json(base, `/api/v2/inquiries/${inquiryIdA}`, {
      headers: { Authorization: `Bearer ${tokenB}` },
    });
    assert.equal(detail.status, 403);
  });

  it('customer cannot access internal costing runs', async () => {
    const lineRes = await json(base, `/api/v2/inquiries/${inquiryIdA}/lines`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${tokenA}` },
      body: JSON.stringify({ cableDescription: 'Test cable', requestedLengthMeters: 500 }),
    });
    const lineId = lineRes.body.line.id as string;
    const costing = await json(
      base,
      `/api/v2/inquiries/${inquiryIdA}/lines/${lineId}/costing-runs/preview`,
      {
        method: 'POST',
        headers: { Authorization: `Bearer ${tokenA}` },
      }
    );
    assert.equal(costing.status, 403);
  });

  it('customer cannot mutate quotations', async () => {
    const issue = await json(base, `/api/v2/inquiries/${inquiryIdA}/quotation/issue`, {
      method: 'POST',
      headers: { Authorization: `Bearer ${tokenA}` },
      body: '{}',
    });
    assert.equal(issue.status, 403);
  });

  it('customer quotation readiness is internal-only', async () => {
    const readiness = await json(base, `/api/v2/inquiries/${inquiryIdA}/quotation/readiness`, {
      headers: { Authorization: `Bearer ${tokenA}` },
    });
    assert.equal(readiness.status, 403);
  });

  it('customer can list commitments scoped to own customer', async () => {
    const list = await json(base, '/api/commercial-commitments', {
      headers: { Authorization: `Bearer ${tokenA}` },
    });
    assert.equal(list.status, 200);
    assert.ok(Array.isArray(list.body.commitments));
  });
});
