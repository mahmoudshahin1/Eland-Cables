import assert from 'node:assert/strict';
import { after, before, describe, it } from 'node:test';
import http from 'node:http';
import express from 'express';
import dotenv from 'dotenv';
import { checkDatabase, getPrisma } from './db';
import { identityAuthRouter } from './identityAuthRoutes';
import { adminIdentityRouter } from './adminIdentityRoutes';
import { inquiriesRouter, quotationsRouter } from './commercialRoutes';
import { masterDataRouter } from './masterDataRoutes';
import { postAiAssistant } from './aiAssistantHandler';
import { seedDevelopmentUsers, isDevelopmentIdentitySeedAllowed, validateProductionAdminSeedPassword } from './identityService';
import { DEV_JWT_SECRET_FALLBACK, validateProductionJwtSecret } from './auth';
import { includeAdminResetTokenInResponse } from './identityAdminRepository';
import { hashPassword, hashOpaqueToken } from '../domain/passwordService';
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

describe('Increment 12 B1 — Hardening gate', () => {
  let base = '';
  let server: http.Server;
  let adminToken = '';
  let adminRefresh = '';
  let adminId = '';
  const suffix = `h1-${Date.now()}`;
  const prevResetFlag = process.env.ADMIN_RESET_TOKEN_IN_RESPONSE;

  before(async () => {
    const health = await checkDatabase();
    assert.equal(health.ok, true, health.error);
    process.env.ADMIN_RESET_TOKEN_IN_RESPONSE = 'true';
    await seedDevelopmentUsers();
    const { resetSeedUserLoginState } = await import('./testNumberSequenceIsolation');
    const prisma = getPrisma();
    if (prisma) await resetSeedUserLoginState(prisma, ['admin@energya.com', 'sales@energya.com']);
    const app = express();
    app.use(express.json());
    app.use('/api/auth', identityAuthRouter);
    app.use('/api/admin', adminIdentityRouter);
    app.use('/api/inquiries', inquiriesRouter);
    app.use('/api/quotations', quotationsRouter);
    app.use('/api/master', masterDataRouter);
    app.post('/api/ai/assistant', postAiAssistant);
    const listening = await listen(app);
    server = listening.server;
    base = listening.base;
    const login = await json(base, '/api/auth/login', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ email: 'admin@energya.com', password: process.env.ADMIN_SEED_PASSWORD || 'Admin@2026!' }),
    });
    assert.equal(login.status, 200, login.body.error);
    adminToken = login.body.accessToken;
    adminRefresh = login.body.refreshToken;
    adminId = login.body.user.id;
  });

  after(async () => {
    if (prevResetFlag === undefined) delete process.env.ADMIN_RESET_TOKEN_IN_RESPONSE;
    else process.env.ADMIN_RESET_TOKEN_IN_RESPONSE = prevResetFlag;
    await new Promise<void>((resolve, reject) => server.close((err) => (err ? reject(err) : resolve())));
  });

  it('revoked refresh token cannot mint a new access token', async () => {
    const login = await json(base, '/api/auth/login', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ email: 'sales@energya.com', password: 'Sales@2026!' }),
    });
    const refresh = login.body.refreshToken;
    const logout = await json(base, '/api/auth/logout', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ refreshToken: refresh }),
    });
    assert.equal(logout.status, 200);
    const again = await json(base, '/api/auth/refresh-token', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ refreshToken: refresh }),
    });
    assert.equal(again.status, 401);
  });

  it('rotated refresh token cannot be reused', async () => {
    const login = await json(base, '/api/auth/login', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ email: 'sales@energya.com', password: 'Sales@2026!' }),
    });
    const first = login.body.refreshToken;
    const rotated = await json(base, '/api/auth/refresh-token', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ refreshToken: first }),
    });
    assert.equal(rotated.status, 200);
    const reuse = await json(base, '/api/auth/refresh-token', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ refreshToken: first }),
    });
    assert.equal(reuse.status, 401);
  });

  it('locking a user revokes refresh and blocks authorization', async () => {
    const email = `lock-sess-${suffix}@energya.test`;
    const created = await json(base, '/api/admin/users', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${adminToken}` },
      body: JSON.stringify({
        fullName: 'Lock Session',
        email,
        username: email,
        password: 'Locksess@2026!',
        roleCodes: ['REPORT_VIEWER'],
      }),
    });
    const login = await json(base, '/api/auth/login', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ email, password: 'Locksess@2026!' }),
    });
    assert.equal(login.status, 200);
    await json(base, `/api/admin/users/${created.body.user.id}/lock`, {
      method: 'POST',
      headers: { Authorization: `Bearer ${adminToken}` },
    });
    const refresh = await json(base, '/api/auth/refresh-token', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ refreshToken: login.body.refreshToken }),
    });
    assert.equal(refresh.status, 401);
    const me = await json(base, '/api/auth/me', {
      headers: { Authorization: `Bearer ${login.body.accessToken}` },
    });
    assert.equal(me.status, 401);
    const relogin = await json(base, '/api/auth/login', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ email, password: 'Locksess@2026!' }),
    });
    assert.equal(relogin.status, 401);
  });

  it('password reset ticket is hashed, single-use, and expires after use', async () => {
    const email = `reset-${suffix}@energya.test`;
    const created = await json(base, '/api/admin/users', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${adminToken}` },
      body: JSON.stringify({
        fullName: 'Reset User',
        email,
        username: email,
        password: 'Resetone@2026!',
        roleCodes: ['REPORT_VIEWER'],
      }),
    });
    const issued = await json(base, `/api/admin/users/${created.body.user.id}/reset-password`, {
      method: 'POST',
      headers: { Authorization: `Bearer ${adminToken}` },
    });
    assert.equal(issued.status, 200);
    assert.ok(issued.body.resetToken);
    assert.equal(JSON.stringify(issued.body).toLowerCase().includes('password'), false);
    const prisma = getPrisma()!;
    const tickets = await prisma.passwordResetTicket.findMany({ where: { userId: created.body.user.id } });
    assert.ok(tickets.some((t) => t.tokenHash === hashOpaqueToken(issued.body.resetToken)));
    assert.ok(tickets.every((t) => t.tokenHash !== issued.body.resetToken));
    const consume = await json(base, '/api/auth/reset-password', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ token: issued.body.resetToken, newPassword: 'ResetTwo@2026!' }),
    });
    assert.equal(consume.status, 200);
    const reuse = await json(base, '/api/auth/reset-password', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ token: issued.body.resetToken, newPassword: 'ResetThree@2026!' }),
    });
    assert.equal(reuse.status, 400);
    const loginNew = await json(base, '/api/auth/login', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ email, password: 'ResetTwo@2026!' }),
    });
    assert.equal(loginNew.status, 200);
  });

  it('forgot-password does not reveal whether an email exists', async () => {
    const a = await json(base, '/api/auth/forgot-password', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ email: 'admin@energya.com' }),
    });
    const b = await json(base, '/api/auth/forgot-password', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ email: `missing-${suffix}@nope.test` }),
    });
    assert.equal(a.status, 200);
    assert.equal(b.status, 200);
    assert.equal(a.body.message, b.body.message);
    assert.equal(a.body.resetToken, undefined);
    assert.equal(b.body.resetToken, undefined);
  });

  it('user cannot grant themselves a role or permissions on their own role', async () => {
    const selfRole = await json(base, `/api/admin/users/${adminId}/roles`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${adminToken}` },
      body: JSON.stringify({ roleCode: 'AUDITOR' }),
    });
    assert.equal(selfRole.status, 403);
    const roles = await json(base, '/api/admin/roles', { headers: { Authorization: `Bearer ${adminToken}` } });
    const mine = (roles.body.roles || []).find((r: any) => r.code === SYSTEM_ADMIN_ROLE_CODE);
    assert.ok(mine);
    const perms = await json(base, `/api/admin/roles/${mine.id}/permissions`, {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${adminToken}` },
      body: JSON.stringify({ permissions: [{ module: 'REPORT', resource: 'REPORT', action: 'VIEW' }] }),
    });
    assert.equal(perms.status, 403);
  });

  it('non-admin cannot modify another user or grant SYSTEM_ADMINISTRATOR', async () => {
    const sales = await json(base, '/api/auth/login', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ email: 'sales@energya.com', password: 'Sales@2026!' }),
    });
    const patch = await json(base, `/api/admin/users/${adminId}`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${sales.body.accessToken}` },
      body: JSON.stringify({ fullName: 'Hijacked' }),
    });
    assert.equal(patch.status, 403);
    const grant = await json(base, `/api/admin/users/${sales.body.user.id}/roles`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${sales.body.accessToken}` },
      body: JSON.stringify({ roleCode: SYSTEM_ADMIN_ROLE_CODE }),
    });
    assert.equal(grant.status, 403);
  });

  it('admin APIs return 401 unauthenticated and 403 unauthorized', async () => {
    const paths = ['/api/admin/users', '/api/admin/roles', '/api/admin/permissions', '/api/admin/security'];
    for (const path of paths) {
      const unauth = await json(base, path);
      assert.equal(unauth.status, 401, path);
    }
    const sales = await json(base, '/api/auth/login', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ email: 'sales@energya.com', password: 'Sales@2026!' }),
    });
    for (const path of paths) {
      const forbidden = await json(base, path, { headers: { Authorization: `Bearer ${sales.body.accessToken}` } });
      assert.equal(forbidden.status, 403, path);
    }
  });

  it('customer A cannot read or steal customer B inquiry or quotation via URL, query, or body', async () => {
    const prisma = getPrisma()!;
    const role = await prisma.role.findUnique({ where: { code: 'CUSTOMER_USER' } });
    assert.ok(role);
    const pass = await hashPassword('CustIso@2026!');
    const a = await prisma.userAccount.create({
      data: {
        email: `cust-a-${suffix}@iso.test`,
        username: `cust-a-${suffix}`,
        fullName: 'Customer A',
        passwordHash: pass,
        userType: 'customer',
        customerId: `iso-a-${suffix}`,
      },
    });
    const b = await prisma.userAccount.create({
      data: {
        email: `cust-b-${suffix}@iso.test`,
        username: `cust-b-${suffix}`,
        fullName: 'Customer B',
        passwordHash: pass,
        userType: 'customer',
        customerId: `iso-b-${suffix}`,
      },
    });
    await prisma.userRole.createMany({
      data: [
        { userId: a.id, roleId: role.id },
        { userId: b.id, roleId: role.id },
      ],
    });
    const custA = await prisma.customer.create({ data: { code: `ISOA-${suffix}`, name: 'Iso A' } });
    const custB = await prisma.customer.create({ data: { code: `ISOB-${suffix}`, name: 'Iso B' } });
    await prisma.customerUser.createMany({
      data: [
        { customerId: custA.id, userAccountId: a.id, status: 'ACTIVE' },
        { customerId: custB.id, userAccountId: b.id, status: 'ACTIVE' },
      ],
    });
    const loginA = await json(base, '/api/auth/login', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ email: a.email, password: 'CustIso@2026!' }),
    });
    const loginB = await json(base, '/api/auth/login', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ email: b.email, password: 'CustIso@2026!' }),
    });
    assert.equal(loginA.status, 200, loginA.body.error);
    assert.equal(loginB.status, 200, loginB.body.error);
    const created = await json(base, '/api/inquiries', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${loginA.body.accessToken}` },
      body: JSON.stringify({ customerId: b.id, customerName: 'Stolen', projectName: 'Iso' }),
    });
    assert.equal(created.status, 201, created.body.error);
    assert.equal(created.body.inquiry.customerMasterId, custA.id);
    assert.notEqual(created.body.inquiry.customerMasterId, custB.id);
    assert.equal(created.body.inquiry.customerName, 'Iso A');
    assert.notEqual(created.body.inquiry.customerName, 'Stolen');
    const stealGet = await json(base, `/api/inquiries/${created.body.inquiry.id}`, {
      headers: { Authorization: `Bearer ${loginB.body.accessToken}` },
    });
    assert.equal(stealGet.status, 403);
    const stealList = await json(base, `/api/inquiries?customerId=${encodeURIComponent(a.id)}`, {
      headers: { Authorization: `Bearer ${loginB.body.accessToken}` },
    });
    assert.equal(stealList.status, 200);
    const ids = (stealList.body.inquiries || []).map((i: any) => i.id);
    assert.equal(ids.includes(created.body.inquiry.id), false);
    const stealLine = await json(base, `/api/inquiries/${created.body.inquiry.id}/lines`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${loginB.body.accessToken}` },
      body: JSON.stringify({ cableDescription: 'x', requestedQuantity: 1 }),
    });
    assert.equal(stealLine.status, 403);
  });

  it('B1 security audit events never contain passwords, JWTs, or reset tokens', async () => {
    const prisma = getPrisma()!;
    const events = await prisma.auditEvent.findMany({
      where: {
        action: { in: ['LOGIN_SUCCESS', 'LOGIN_FAILURE', 'RESET_PASSWORD', 'LOCK_USER', 'LOGOUT', 'CREATE_USER'] },
      },
      take: 80,
      orderBy: { at: 'desc' },
    });
    const dumped = JSON.stringify(events).toLowerCase();
    assert.equal(dumped.includes('passwordhash'), false);
    assert.equal(dumped.includes('admin@2026!'), false);
    assert.equal(dumped.includes('resetone@2026!'), false);
    assert.equal(/"eyj[a-z0-9_-]+\.[a-z0-9_-]+/i.test(dumped), false);
  });

  it('AuditEvent has no update or delete admin API', async () => {
    const prisma = getPrisma()!;
    const event = await prisma.auditEvent.findFirst({ orderBy: { at: 'desc' } });
    assert.ok(event);
    const del = await json(base, `/api/admin/audit/${event.id}`, {
      method: 'DELETE',
      headers: { Authorization: `Bearer ${adminToken}` },
    });
    assert.notEqual(del.status, 200);
    const patch = await json(base, `/api/admin/audit/${event.id}`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${adminToken}` },
      body: JSON.stringify({ action: 'TAMPER' }),
    });
    assert.notEqual(patch.status, 200);
    const still = await prisma.auditEvent.findUnique({ where: { id: event.id } });
    assert.equal(still?.action, event.action);
  });

  it('GET /api/master/cables requires JWT', async () => {
    const unauth = await json(base, '/api/master/cables?page=1&pageSize=1');
    assert.equal(unauth.status, 401);
    assert.equal(unauth.body.code, 'UNAUTHORIZED');
    const authed = await json(base, '/api/master/cables?page=1&pageSize=1', {
      headers: { Authorization: `Bearer ${adminToken}` },
    });
    assert.equal(authed.status, 200, authed.body.error);
    assert.ok(Array.isArray(authed.body.cables));
  });

  it('POST /api/ai/assistant requires JWT before Gemini', async () => {
    const unauth = await json(base, '/api/ai/assistant', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ prompt: 'recommend a cable' }),
    });
    assert.equal(unauth.status, 401);
    assert.equal(unauth.body.code, 'UNAUTHORIZED');
    const missingPrompt = await json(base, '/api/ai/assistant', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${adminToken}` },
      body: JSON.stringify({}),
    });
    assert.equal(missingPrompt.status, 400);
  });
});

describe('Production identity seed and reset-token guards', () => {
  it('demo-style identity seed cannot run in production even with ALLOW_DEV_IDENTITY_SEED', () => {
    assert.equal(isDevelopmentIdentitySeedAllowed('development', 'true'), true);
    assert.equal(isDevelopmentIdentitySeedAllowed('production', 'true'), false);
    assert.equal(isDevelopmentIdentitySeedAllowed('production', undefined), false);
  });

  it('ADMIN_RESET_TOKEN_IN_RESPONSE cannot take effect in production', () => {
    assert.equal(includeAdminResetTokenInResponse('development', 'true'), true);
    assert.equal(includeAdminResetTokenInResponse('production', 'true'), false);
    assert.equal(includeAdminResetTokenInResponse('production', 'false'), false);
  });

  it('validateProductionAdminSeedPassword enforces explicit non-default password', () => {
    assert.throws(() => validateProductionAdminSeedPassword(undefined), /must be explicitly configured/);
    assert.throws(() => validateProductionAdminSeedPassword(''), /must be explicitly configured/);
    assert.throws(() => validateProductionAdminSeedPassword('   '), /must be explicitly configured/);
    assert.throws(() => validateProductionAdminSeedPassword('Admin@2026!'), /default development fallback/);
    assert.throws(() => validateProductionAdminSeedPassword('Sales@2026!'), /default development fallback/);
    assert.throws(() => validateProductionAdminSeedPassword('password'), /default development fallback/);
    assert.equal(validateProductionAdminSeedPassword('StrongProdAdm!n#992026!'), 'StrongProdAdm!n#992026!');
  });

  it('validateProductionJwtSecret rejects missing, default, and weak secrets', () => {
    assert.throws(() => validateProductionJwtSecret(undefined), /non-default value/);
    assert.throws(() => validateProductionJwtSecret(''), /non-default value/);
    assert.throws(() => validateProductionJwtSecret('   '), /non-default value/);
    assert.throws(() => validateProductionJwtSecret(DEV_JWT_SECRET_FALLBACK), /non-default value/);
    assert.throws(() => validateProductionJwtSecret('short-but-not-default'), /at least 32 characters/);
    const strong = 'ReplaceWithSecureRandomSecretKeyOfAtLeast32BytesLength_2026_x92!';
    assert.equal(validateProductionJwtSecret(strong), strong);
  });
});
