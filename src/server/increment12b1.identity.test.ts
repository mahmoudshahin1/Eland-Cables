import assert from 'node:assert/strict';
import { after, before, describe, it } from 'node:test';
import http from 'node:http';
import express from 'express';
import dotenv from 'dotenv';
import { checkDatabase, getPrisma } from './db';
import { identityAuthRouter } from './identityAuthRoutes';
import { adminIdentityRouter } from './adminIdentityRoutes';
import { signTestToken, JWT_SECRET, JWT_ISSUER, JWT_AUDIENCE } from './auth';
import jwt from 'jsonwebtoken';
import { seedDevelopmentUsers } from './identityService';
import { hashPassword } from '../domain/passwordService';
import {
  assertCanAccessInquiryOwnership,
  assertCanApproveBomGovernance,
  assertCanCalculateCosting,
  assertCanApproveRawMaterialPrice,
  assertCanManageQuotations,
  assertCanProcessTechnicalOffice,
} from './rbac';
import { DomainError } from '../platform/errors/domainError';
import { hasPermission } from '../domain/rbacEngine';
import { resetSeedUserLoginState } from './testNumberSequenceIsolation';

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

describe('Increment 12 B1 — Identity, login, and RBAC', () => {
  let base = '';
  let server: http.Server;
  let adminToken = '';
  let adminId = '';
  const suffix = `id12b1-${Date.now()}-${process.pid}-${Math.random().toString(36).slice(2, 8)}`;

  async function unlockSeedLogins() {
    const prisma = getPrisma();
    if (prisma) {
      await resetSeedUserLoginState(prisma, ['admin@energya.com', 'sales@energya.com']);
    }
  }

  before(async () => {
    const health = await checkDatabase();
    assert.equal(health.ok, true, health.error);
    await seedDevelopmentUsers();
    await unlockSeedLogins();
    const app = express();
    app.use(express.json());
    app.use('/api/auth', identityAuthRouter);
    app.use('/api/admin', adminIdentityRouter);
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
    adminId = login.body.user.id;
    assert.ok(!JSON.stringify(login.body).toLowerCase().includes('passwordhash'));
    assert.ok(!JSON.stringify(login.body).includes('Admin@2026!'));
  });

  after(async () => {
    await new Promise<void>((resolve, reject) => server.close((err) => (err ? reject(err) : resolve())));
  });

  it('1. Login with valid credentials', async () => {
    await unlockSeedLogins();
    const res = await json(base, '/api/auth/login', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ email: 'sales@energya.com', password: 'Sales@2026!' }),
    });
    assert.equal(res.status, 200);
    assert.ok(res.body.accessToken);
    assert.equal(res.body.user.email, 'sales@energya.com');
  });

  it('2. Invalid password returns 401', async () => {
    const prisma = getPrisma()!;
    const email = `badpw-${suffix}@energya.test`;
    const user = await prisma.userAccount.create({
      data: {
        email,
        username: email,
        fullName: 'Bad Password',
        passwordHash: await hashPassword('Goodpw@2026!'),
        status: 'ACTIVE',
      },
    });
    const res = await json(base, '/api/auth/login', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ email, password: 'wrong-password-xx' }),
    });
    assert.equal(res.status, 401);
    await prisma.userAccount.delete({ where: { id: user.id } }).catch(() => undefined);
  });

  it('3. Inactive user cannot login', async () => {
    const prisma = getPrisma()!;
    const email = `inactive-${suffix}@energya.test`;
    const user = await prisma.userAccount.create({
      data: {
        email,
        username: email,
        fullName: 'Inactive',
        passwordHash: await hashPassword('Inactive@2026!'),
        isActive: false,
        status: 'INACTIVE',
      },
    });
    const res = await json(base, '/api/auth/login', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ email, password: 'Inactive@2026!' }),
    });
    assert.equal(res.status, 401);
    await prisma.userAccount.delete({ where: { id: user.id } }).catch(() => undefined);
  });

  it('4. Locked user cannot login', async () => {
    const prisma = getPrisma()!;
    const email = `locked-${suffix}@energya.test`;
    const user = await prisma.userAccount.create({
      data: {
        email,
        username: email,
        fullName: 'Locked',
        passwordHash: await hashPassword('Lockedxx@2026!'),
        isLocked: true,
        status: 'LOCKED',
      },
    });
    const res = await json(base, '/api/auth/login', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ email, password: 'Lockedxx@2026!' }),
    });
    assert.equal(res.status, 401);
    await prisma.userAccount.delete({ where: { id: user.id } }).catch(() => undefined);
  });

  it('5-6. Failed attempts increase and successful login resets them', async () => {
    const prisma = getPrisma()!;
    const email = `attempts-${suffix}@energya.test`;
    const user = await prisma.userAccount.create({
      data: {
        email,
        username: email,
        fullName: 'Attempts',
        passwordHash: await hashPassword('Attempts@2026!'),
      },
    });
    await json(base, '/api/auth/login', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ email, password: 'bad-password-1' }),
    });
    const afterFail = await prisma.userAccount.findUnique({ where: { id: user.id } });
    assert.ok((afterFail?.failedLoginAttempts || 0) >= 1);
    const ok = await json(base, '/api/auth/login', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ email, password: 'Attempts@2026!' }),
    });
    assert.equal(ok.status, 200);
    const afterOk = await prisma.userAccount.findUnique({ where: { id: user.id } });
    assert.equal(afterOk?.failedLoginAttempts, 0);
    await prisma.userAccount.delete({ where: { id: user.id } }).catch(() => undefined);
  });

  it('7. Admin can create user', async () => {
    const res = await json(base, '/api/admin/users', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${adminToken}` },
      body: JSON.stringify({
        fullName: 'B1 Created',
        email: `created-${suffix}@energya.test`,
        username: `created-${suffix}`,
        password: 'Created@2026!',
        department: 'QA',
        roleCodes: ['REPORT_VIEWER'],
      }),
    });
    assert.equal(res.status, 201, res.body.error);
    assert.ok(res.body.user.id);
    assert.equal(res.body.user.email, `created-${suffix}@energya.test`);
    assert.ok(!JSON.stringify(res.body).toLowerCase().includes('passwordhash'));
  });

  it('8. Non-admin receives 403', async () => {
    await seedDevelopmentUsers();
    await unlockSeedLogins();
    const sales = await json(base, '/api/auth/login', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ email: 'sales@energya.com', password: 'Sales@2026!' }),
    });
    assert.equal(sales.status, 200, sales.body.error);
    const res = await json(base, '/api/admin/users', {
      headers: { Authorization: `Bearer ${sales.body.accessToken}` },
    });
    assert.equal(res.status, 403);
  });

  it('9. Admin can assign role', async () => {
    const created = await json(base, '/api/admin/users', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${adminToken}` },
      body: JSON.stringify({
        fullName: 'Role Target',
        email: `roletgt-${suffix}@energya.test`,
        username: `roletgt-${suffix}`,
        password: 'Roletgt@2026!',
        roleCodes: ['REPORT_VIEWER'],
      }),
    });
    const res = await json(base, `/api/admin/users/${created.body.user.id}/roles`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${adminToken}` },
      body: JSON.stringify({ roleCode: 'AUDITOR' }),
    });
    assert.equal(res.status, 200, res.body.error);
    assert.ok(res.body.user.roles.includes('AUDITOR'));
  });

  it('10. Unauthorized user cannot assign role', async () => {
    await unlockSeedLogins();
    const sales = await json(base, '/api/auth/login', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ email: 'sales@energya.com', password: 'Sales@2026!' }),
    });
    const res = await json(base, `/api/admin/users/${adminId}/roles`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${sales.body.accessToken}` },
      body: JSON.stringify({ roleCode: 'AUDITOR' }),
    });
    assert.equal(res.status, 403);
  });

  it('11. Permission enforcement works (granular codes)', () => {
    const actor = { id: 'u-x', permissionCodes: ['COSTING:COSTING_RUN:VIEW'] };
    assert.equal(hasPermission(actor, 'COSTING', 'COSTING_RUN', 'VIEW'), true);
    assert.equal(hasPermission(actor, 'COSTING', 'COSTING_RUN', 'CALCULATE'), false);
    assert.throws(
      () => assertCanCalculateCosting({ id: 'u-x', userType: 'internal', permissionCodes: ['COSTING:COSTING_RUN:VIEW'] }),
      (err: unknown) => err instanceof DomainError
    );
  });

  it('12. User cannot elevate own role', async () => {
    const res = await json(base, `/api/admin/users/${adminId}/roles`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${adminToken}` },
      body: JSON.stringify({ roleCode: 'AUDITOR' }),
    });
    assert.equal(res.status, 403);
  });

  it('13. Vertical privilege: ROLE_MANAGE without SYSTEM_ADMINISTRATOR cannot grant it', async () => {
    const token = signTestToken({
      id: `priv-${suffix}`,
      name: 'Delegated admin',
      email: `priv-${suffix}@energya.test`,
      userType: 'internal',
      role: 'AUDITOR',
      roles: ['AUDITOR'],
      permissions: { userManagement: true },
    });
    const created = await json(base, '/api/admin/users', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${adminToken}` },
      body: JSON.stringify({
        fullName: 'Elevate me',
        email: `elevate-${suffix}@energya.test`,
        username: `elevate-${suffix}`,
        password: 'Elevate@2026!',
        roleCodes: ['REPORT_VIEWER'],
      }),
    });
    const res = await json(base, `/api/admin/users/${created.body.user.id}/roles`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
      body: JSON.stringify({ roleCode: 'SYSTEM_ADMINISTRATOR' }),
    });
    assert.equal(res.status, 403);
  });

  it('14. Password hash never appears in API response', async () => {
    const res = await json(base, '/api/admin/users?q=admin@energya.com', {
      headers: { Authorization: `Bearer ${adminToken}` },
    });
    assert.equal(res.status, 200);
    const dumped = JSON.stringify(res.body).toLowerCase();
    assert.equal(dumped.includes('passwordhash'), false);
    assert.equal(dumped.includes('$2a$'), false);
    assert.equal(dumped.includes('$2b$'), false);
  });

  it('15. Password hash never appears in audit', async () => {
    const prisma = getPrisma()!;
    const events = await prisma.auditEvent.findMany({
      where: { action: { in: ['LOGIN_SUCCESS', 'LOGIN_FAILURE', 'CREATE_USER', 'RESET_PASSWORD'] } },
      take: 50,
      orderBy: { at: 'desc' },
    });
    const dumped = JSON.stringify(events).toLowerCase();
    assert.equal(dumped.includes('passwordhash'), false);
    assert.equal(dumped.includes('admin@2026!'), false);
  });

  it('16. Existing customer isolation still works', () => {
    const a = { id: 'u-cust-eland', userType: 'customer' as const };
    const b = { id: 'u-cust-dewa', userType: 'customer' as const };
    assert.doesNotThrow(() => assertCanAccessInquiryOwnership(a, a.id));
    assert.throws(
      () => assertCanAccessInquiryOwnership(b, a.id),
      (err: unknown) => err instanceof DomainError && err.code === 'UNAUTHORIZED'
    );
  });

  it('17. Existing quotation authorization still works', () => {
    assert.throws(
      () =>
        assertCanManageQuotations({
          id: 'u-cust',
          userType: 'customer',
          permissions: { salesQuotations: false },
        }),
      (err: unknown) => err instanceof DomainError
    );
    assert.doesNotThrow(() =>
      assertCanManageQuotations({
        id: 'u-sales',
        userType: 'internal',
        permissions: { salesQuotations: true },
      })
    );
  });

  it('18. Existing costing authorization still works', () => {
    assert.doesNotThrow(() =>
      assertCanCalculateCosting({
        id: 'u-cost',
        userType: 'internal',
        permissions: { costingPricing: true },
      })
    );
    assert.throws(
      () =>
        assertCanApproveRawMaterialPrice({
          id: 'u-to',
          userType: 'internal',
          permissions: { technicalOffice: true, costingPricing: false, masterData: true },
        }),
      (err: unknown) => err instanceof DomainError
    );
    assert.doesNotThrow(() =>
      assertCanApproveRawMaterialPrice({
        id: 'u-cost',
        userType: 'internal',
        permissions: { costingPricing: true },
      })
    );
    assert.throws(
      () =>
        assertCanCalculateCosting({
          id: 'u-cust',
          userType: 'customer',
          permissions: { costingPricing: false },
        }),
      (err: unknown) => err instanceof DomainError
    );
  });

  it('19. Existing BOM authorization still works', () => {
    assert.doesNotThrow(() =>
      assertCanApproveBomGovernance({
        id: 'u-to',
        userType: 'internal',
        permissions: { technicalOffice: true },
      })
    );
    assert.throws(
      () =>
        assertCanApproveBomGovernance({
          id: 'u-cust',
          userType: 'customer',
          permissions: { technicalOffice: false },
        }),
      (err: unknown) => err instanceof DomainError
    );
  });

  it('20. Existing Technical Office authorization still works', () => {
    assert.doesNotThrow(() =>
      assertCanProcessTechnicalOffice({
        id: 'u-to',
        userType: 'internal',
        permissions: { technicalOffice: true },
      })
    );
    assert.throws(
      () =>
        assertCanProcessTechnicalOffice({
          id: 'u-cust',
          userType: 'customer',
          permissions: { technicalOffice: false },
        }),
      (err: unknown) => err instanceof DomainError
    );
  });

  it('Horizontal privilege escalation is blocked for customer isolation', () => {
    assert.throws(
      () =>
        assertCanAccessInquiryOwnership(
          { id: 'attacker', userType: 'customer', customerId: 'c-other' },
          'c-eland'
        ),
      (err: unknown) => err instanceof DomainError
    );
  });

  it('Unauthenticated admin API is 401', async () => {
    const res = await json(base, '/api/admin/users');
    assert.equal(res.status, 401);
  });

  it('Login accepts username as well as email', async () => {
    await unlockSeedLogins();
    const res = await json(base, '/api/auth/login', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ username: 'sales@energya.com', password: 'Sales@2026!' }),
    });
    assert.equal(res.status, 200, res.body.error);
    assert.equal(res.body.user.email, 'sales@energya.com');
    assert.equal(res.body.user.userType, 'internal');
    assert.ok(res.body.accessToken);
  });

  it('Login without identifier or password is 400', async () => {
    const res = await json(base, '/api/auth/login', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({}),
    });
    assert.equal(res.status, 400);
  });

  it('Expired access token cannot access /me', async () => {
    const expired = jwt.sign(
      {
        sub: adminId,
        sid: 'expired-sid',
        email: 'admin@energya.com',
        userType: 'internal',
        exp: Math.floor(Date.now() / 1000) - 60,
      },
      JWT_SECRET,
      { issuer: JWT_ISSUER, audience: JWT_AUDIENCE }
    );
    const res = await json(base, '/api/auth/me', { headers: { Authorization: `Bearer ${expired}` } });
    assert.equal(res.status, 401);
  });

  it('Invalid token cannot access /me', async () => {
    const res = await json(base, '/api/auth/me', { headers: { Authorization: 'Bearer not-a-valid-jwt' } });
    assert.equal(res.status, 401);
  });

  it('Customer session cannot access internal admin APIs', async () => {
    const customer = await json(base, '/api/auth/login', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ email: 'david.smith@elandcables.com', password: 'Customer@2026!' }),
    });
    assert.equal(customer.status, 200, customer.body.error);
    assert.equal(customer.body.user.userType, 'customer');
    assert.ok(Array.isArray(customer.body.user.customerMasterIds));
    const res = await json(base, '/api/admin/users', {
      headers: { Authorization: `Bearer ${customer.body.accessToken}` },
    });
    assert.equal(res.status, 403);
  });

  it('Logout revokes refresh and /me for that session', async () => {
    await unlockSeedLogins();
    const login = await json(base, '/api/auth/login', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ email: 'sales@energya.com', password: 'Sales@2026!' }),
    });
    assert.equal(login.status, 200);
    const logout = await json(base, '/api/auth/logout', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${login.body.accessToken}`,
      },
      body: JSON.stringify({ refreshToken: login.body.refreshToken }),
    });
    assert.equal(logout.status, 200);
    const me = await json(base, '/api/auth/me', {
      headers: { Authorization: `Bearer ${login.body.accessToken}` },
    });
    assert.equal(me.status, 401);
    const refresh = await json(base, '/api/auth/refresh-token', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ refreshToken: login.body.refreshToken }),
    });
    assert.equal(refresh.status, 401);
  });

  it('Change password requires authentication and current password', async () => {
    const unauth = await json(base, '/api/auth/change-password', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ currentPassword: 'x', newPassword: 'NewPass@2026!' }),
    });
    assert.equal(unauth.status, 401);

    const prisma = getPrisma()!;
    const email = `chgpw-${suffix}@energya.test`;
    await prisma.userAccount.create({
      data: {
        email,
        username: email,
        fullName: 'Change Password',
        passwordHash: await hashPassword('Sales@2026!'),
        status: 'ACTIVE',
      },
    });
    const login = await json(base, '/api/auth/login', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ email, password: 'Sales@2026!' }),
    });
    assert.equal(login.status, 200, login.body.error);

    const wrong = await json(base, '/api/auth/change-password', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${login.body.accessToken}`,
      },
      body: JSON.stringify({ currentPassword: 'not-the-password', newPassword: 'NewPass@2026!' }),
    });
    assert.equal(wrong.status, 400);

    const ok = await json(base, '/api/auth/change-password', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${login.body.accessToken}`,
      },
      body: JSON.stringify({ currentPassword: 'Sales@2026!', newPassword: 'SalesNew@2026!' }),
    });
    assert.equal(ok.status, 200, ok.body.error);

    const oldLogin = await json(base, '/api/auth/login', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ email, password: 'Sales@2026!' }),
    });
    assert.equal(oldLogin.status, 401);

    const newLogin = await json(base, '/api/auth/login', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ email, password: 'SalesNew@2026!' }),
    });
    assert.equal(newLogin.status, 200, newLogin.body.error);

    const restore = await json(base, '/api/auth/change-password', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${newLogin.body.accessToken}`,
      },
      body: JSON.stringify({ currentPassword: 'SalesNew@2026!', newPassword: 'Sales@2026!' }),
    });
    assert.equal(restore.status, 200, restore.body.error);
    await prisma.userAccount.deleteMany({ where: { email } });
  });
});
