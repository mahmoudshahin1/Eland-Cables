import assert from 'node:assert/strict';
import { after, before, describe, it } from 'node:test';
import http from 'node:http';
import express from 'express';
import jwt from 'jsonwebtoken';
import dotenv from 'dotenv';
import { checkDatabase, getPrisma } from './db';
import { identityAuthRouter } from './identityAuthRoutes';
import { adminIdentityRouter } from './adminIdentityRoutes';
import { adminCustomerRouter } from './adminCustomerRoutes';
import { inquiriesRouter, quotationsRouter } from './commercialRoutes';
import { seedDevelopmentUsers } from './identityService';
import { hashPassword } from '../domain/passwordService';
import { JWT_SECRET, JWT_ISSUER, JWT_AUDIENCE } from './auth';

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

describe('Increment 12 B2.1 — Customer scope and session revocation', () => {
  let base = '';
  let server: http.Server;
  let adminToken = '';
  const suffix = `b21-${Date.now()}`;
  let customerAId = '';
  let customerBId = '';
  let tokenA = '';
  let userAId = '';
  let userAEmail = '';
  let inquiryAId = '';
  let inquiryBId = '';

  before(async () => {
    const health = await checkDatabase();
    assert.equal(health.ok, true, health.error);
    process.env.ADMIN_RESET_TOKEN_IN_RESPONSE = 'true';
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
    assert.ok((jwt.decode(adminToken) as { sid?: string } | null)?.sid);

    const prisma = getPrisma()!;
    const role = await prisma.role.findUnique({ where: { code: 'CUSTOMER_USER' } });
    assert.ok(role);
    const pass = await hashPassword('CustB21@2026!');
    const ua = await prisma.userAccount.create({
      data: { email: `a-${suffix}@iso.test`, username: `a-${suffix}`, fullName: 'Cust A', passwordHash: pass, userType: 'customer' },
    });
    const ub = await prisma.userAccount.create({
      data: { email: `b-${suffix}@iso.test`, username: `b-${suffix}`, fullName: 'Cust B', passwordHash: pass, userType: 'customer' },
    });
    userAId = ua.id;
    userAEmail = ua.email;
    await prisma.userRole.createMany({ data: [{ userId: ua.id, roleId: role.id }, { userId: ub.id, roleId: role.id }] });
    const ca = await json(base, '/api/admin/customers', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${adminToken}` },
      body: JSON.stringify({ code: `CA21-${suffix}`, name: 'A Co' }),
    });
    const cb = await json(base, '/api/admin/customers', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${adminToken}` },
      body: JSON.stringify({ code: `CB21-${suffix}`, name: 'B Co' }),
    });
    customerAId = ca.body.customer.id;
    customerBId = cb.body.customer.id;
    await json(base, '/api/admin/customer-users', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${adminToken}` },
      body: JSON.stringify({ customerId: customerAId, userAccountId: ua.id }),
    });
    await json(base, '/api/admin/customer-users', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${adminToken}` },
      body: JSON.stringify({ customerId: customerBId, userAccountId: ub.id }),
    });
    const loginA = await json(base, '/api/auth/login', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ email: ua.email, password: 'CustB21@2026!' }),
    });
    const loginB = await json(base, '/api/auth/login', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ email: ub.email, password: 'CustB21@2026!' }),
    });
    tokenA = loginA.body.accessToken;
    const createdA = await json(base, '/api/inquiries', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${tokenA}` },
      body: JSON.stringify({ projectName: 'A job' }),
    });
    assert.equal(createdA.status, 201, createdA.body.error);
    inquiryAId = createdA.body.inquiry.id;
    const createdB = await json(base, '/api/inquiries', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${loginB.body.accessToken}` },
      body: JSON.stringify({ projectName: 'B job' }),
    });
    inquiryBId = createdB.body.inquiry.id;
  });

  after(async () => {
    await new Promise<void>((resolve, reject) => server.close((err) => (err ? reject(err) : resolve())));
  });

  it('TEST 1-2: Customer A cannot read Customer B inquiry by id/URL', async () => {
    const steal = await json(base, `/api/inquiries/${inquiryBId}`, {
      headers: { Authorization: `Bearer ${tokenA}` },
    });
    assert.equal(steal.status, 403);
  });

  it('TEST 3: Customer A POST body customerId for B stays scoped to A', async () => {
    const created = await json(base, '/api/inquiries', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${tokenA}` },
      body: JSON.stringify({ customerId: customerBId, projectName: 'steal' }),
    });
    assert.equal(created.status, 201, created.body.error);
    assert.equal(created.body.inquiry.customerMasterId, customerAId);
    assert.notEqual(created.body.inquiry.customerMasterId, customerBId);
    assert.notEqual(created.body.inquiry.customerId, customerBId);
    assert.equal(created.body.inquiry.customerName, 'A Co');
  });

  it('TEST 4: Customer A query customerId for B does not list B inquiries', async () => {
    const list = await json(base, `/api/inquiries?customerId=${encodeURIComponent(customerBId)}`, {
      headers: { Authorization: `Bearer ${tokenA}` },
    });
    assert.equal(list.status, 200);
    const ids = (list.body.inquiries || []).map((i: any) => i.id);
    assert.equal(ids.includes(inquiryBId), false);
    assert.equal(ids.includes(inquiryAId), true);
  });

  it('TEST 5-6: Customer A cannot modify assignments or assign itself to B', async () => {
    const patch = await json(base, `/api/admin/customers/${customerAId}`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${tokenA}` },
      body: JSON.stringify({ name: 'Hacked' }),
    });
    assert.equal(patch.status, 403);
    const assign = await json(base, '/api/admin/customer-users', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${tokenA}` },
      body: JSON.stringify({ customerId: customerBId, userAccountId: userAId }),
    });
    assert.equal(assign.status, 403);
  });

  it('TEST 7: CUSTOMER_USER with multiple active assignments is denied without guessing', async () => {
    const prisma = getPrisma()!;
    await prisma.customerUser.create({
      data: { customerId: customerBId, userAccountId: userAId, status: 'ACTIVE', assignedBy: 'test-exception' },
    });
    const login = await json(base, '/api/auth/login', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ email: userAEmail, password: 'CustB21@2026!' }),
    });
    assert.equal(login.status, 200, login.body.error);
    const denied = await json(base, '/api/inquiries', {
      headers: { Authorization: `Bearer ${login.body.accessToken}` },
    });
    assert.equal(denied.status, 403);
    assert.equal(denied.body.code, 'CONFIGURATION_REQUIRED');
    const create = await json(base, '/api/inquiries', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${login.body.accessToken}` },
      body: JSON.stringify({ projectName: 'should not land on either customer' }),
    });
    assert.equal(create.status, 403);
    await prisma.customerUser.updateMany({
      where: { userAccountId: userAId, customerId: customerBId },
      data: { status: 'INACTIVE' },
    });
  });

  it('TEST 8-9 and JWT replay: logout revokes access JWT immediately', async () => {
    const login = await json(base, '/api/auth/login', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ email: 'sales@energya.com', password: 'Sales@2026!' }),
    });
    assert.equal(login.status, 200);
    const access = login.body.accessToken;
    const me = await json(base, '/api/auth/me', { headers: { Authorization: `Bearer ${access}` } });
    assert.equal(me.status, 200);
    const decoded = jwt.verify(access, JWT_SECRET, { issuer: JWT_ISSUER, audience: JWT_AUDIENCE }) as any;
    assert.ok(decoded.sid);
    assert.equal(decoded.refreshToken, undefined);
    const logout = await json(base, '/api/auth/logout', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${access}` },
      body: JSON.stringify({ refreshToken: login.body.refreshToken }),
    });
    assert.equal(logout.status, 200);
    jwt.verify(access, JWT_SECRET, { issuer: JWT_ISSUER, audience: JWT_AUDIENCE });
    const replay = await json(base, '/api/auth/me', { headers: { Authorization: `Bearer ${access}` } });
    assert.equal(replay.status, 401);
  });

  it('TEST 10: lock revokes access JWT immediately', async () => {
    const email = `lock-${suffix}@energya.test`;
    const created = await json(base, '/api/admin/users', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${adminToken}` },
      body: JSON.stringify({ fullName: 'Lock me', email, username: `lock-${suffix}`, password: 'LockMe@2026!', roleCodes: ['SALES_MANAGER'] }),
    });
    const login = await json(base, '/api/auth/login', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ email, password: 'LockMe@2026!' }),
    });
    const access = login.body.accessToken;
    await json(base, `/api/admin/users/${created.body.user.id}/lock`, {
      method: 'POST',
      headers: { Authorization: `Bearer ${adminToken}` },
    });
    const me = await json(base, '/api/auth/me', { headers: { Authorization: `Bearer ${access}` } });
    assert.equal(me.status, 401);
    const refresh = await json(base, '/api/auth/refresh-token', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ refreshToken: login.body.refreshToken }),
    });
    assert.equal(refresh.status, 401);
  });

  it('TEST 11: deactivate revokes access JWT immediately', async () => {
    const email = `deact-${suffix}@energya.test`;
    const created = await json(base, '/api/admin/users', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${adminToken}` },
      body: JSON.stringify({ fullName: 'Deact me', email, username: `deact-${suffix}`, password: 'DeactMe@2026!', roleCodes: ['SALES_MANAGER'] }),
    });
    const login = await json(base, '/api/auth/login', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ email, password: 'DeactMe@2026!' }),
    });
    await json(base, `/api/admin/users/${created.body.user.id}/deactivate`, {
      method: 'POST',
      headers: { Authorization: `Bearer ${adminToken}` },
    });
    const me = await json(base, '/api/auth/me', { headers: { Authorization: `Bearer ${login.body.accessToken}` } });
    assert.equal(me.status, 401);
    const refresh = await json(base, '/api/auth/refresh-token', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ refreshToken: login.body.refreshToken }),
    });
    assert.equal(refresh.status, 401);
  });

  it('TEST 12-14: revoke or delete UserSession invalidates access JWT', async () => {
    const login = await json(base, '/api/auth/login', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ email: 'sales@energya.com', password: 'Sales@2026!' }),
    });
    const access = login.body.accessToken;
    const sid = (jwt.decode(access) as any).sid;
    const prisma = getPrisma()!;
    await prisma.userSession.update({ where: { id: sid }, data: { revokedAt: new Date() } });
    const afterRevoke = await json(base, '/api/auth/me', { headers: { Authorization: `Bearer ${access}` } });
    assert.equal(afterRevoke.status, 401);

    const login2 = await json(base, '/api/auth/login', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ email: 'sales@energya.com', password: 'Sales@2026!' }),
    });
    const access2 = login2.body.accessToken;
    const sid2 = (jwt.decode(access2) as any).sid;
    await prisma.userSession.update({ where: { id: sid2 }, data: { expiresAt: new Date(Date.now() - 1000) } });
    const afterExpire = await json(base, '/api/auth/me', { headers: { Authorization: `Bearer ${access2}` } });
    assert.equal(afterExpire.status, 401);

    const login3 = await json(base, '/api/auth/login', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ email: 'sales@energya.com', password: 'Sales@2026!' }),
    });
    const access3 = login3.body.accessToken;
    const sid3 = (jwt.decode(access3) as any).sid;
    await prisma.userSession.delete({ where: { id: sid3 } });
    const afterDelete = await json(base, '/api/auth/me', { headers: { Authorization: `Bearer ${access3}` } });
    assert.equal(afterDelete.status, 401);
  });

  it('TEST 15-17: revoked/locked/deactivated refresh tokens fail', async () => {
    const login = await json(base, '/api/auth/login', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ email: 'sales@energya.com', password: 'Sales@2026!' }),
    });
    await json(base, '/api/auth/logout', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ refreshToken: login.body.refreshToken }),
    });
    const again = await json(base, '/api/auth/refresh-token', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ refreshToken: login.body.refreshToken }),
    });
    assert.equal(again.status, 401);
  });

  it('TEST 18: password reset revokes prior access JWT', async () => {
    const email = `rst-${suffix}@energya.test`;
    const created = await json(base, '/api/admin/users', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${adminToken}` },
      body: JSON.stringify({ fullName: 'Reset me', email, username: `rst-${suffix}`, password: 'ResetMe@2026!', roleCodes: ['SALES_MANAGER'] }),
    });
    const login = await json(base, '/api/auth/login', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ email, password: 'ResetMe@2026!' }),
    });
    const issued = await json(base, `/api/admin/users/${created.body.user.id}/reset-password`, {
      method: 'POST',
      headers: { Authorization: `Bearer ${adminToken}` },
    });
    assert.ok(issued.body.resetToken);
    const consume = await json(base, '/api/auth/reset-password', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ token: issued.body.resetToken, newPassword: 'ResetMe@2027!' }),
    });
    assert.equal(consume.status, 200, consume.body.error);
    const me = await json(base, '/api/auth/me', { headers: { Authorization: `Bearer ${login.body.accessToken}` } });
    assert.equal(me.status, 401);
  });
});
