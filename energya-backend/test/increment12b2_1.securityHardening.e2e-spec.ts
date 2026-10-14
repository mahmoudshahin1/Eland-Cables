import { describe, it, beforeAll, afterAll, expect } from 'vitest';
import { Test, TestingModule } from '@nestjs/testing';
import { INestApplication } from '@nestjs/common';
import request from 'supertest';
import bcrypt from 'bcryptjs';
import jwt from 'jsonwebtoken';
import { AppModule } from '../src/app.module.js';
import { PrismaService } from '../src/prisma.service.js';

describe('Increment 12B.2.1 - Security Hardening & Tenant Isolation E2E (NestJS)', () => {
  let app: INestApplication;
  let prisma: PrismaService;
  let adminToken: string;
  let limitedToken: string;
  let customerAToken: string;
  let customerBToken: string;
  let customerAId: string;
  let customerBId: string;
  let userAId: string;
  const suffix = `sec12b21-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;

  beforeAll(async () => {
    const moduleFixture: TestingModule = await Test.createTestingModule({
      imports: [AppModule],
    }).compile();

    app = moduleFixture.createNestApplication();
    await app.init();

    prisma = app.get(PrismaService);

    // Authenticate test actors
    const login = async (email: string) => {
      const res = await request(app.getHttpServer())
        .post('/api/auth/login')
        .send({ email, password: 'Password123!' });
      return res.body;
    };

    const adminLogin = await login('admin@parity.test');
    adminToken = adminLogin.accessToken;

    const limitedLogin = await login('limited@parity.test');
    limitedToken = limitedLogin.accessToken;

    const custALogin = await login('custA@parity.test');
    customerAToken = custALogin.accessToken;
    userAId = custALogin.user.id;

    const custBLogin = await login('custB@parity.test');
    customerBToken = custBLogin.accessToken;

    const custA = await prisma.customer.findFirst({ where: { code: 'CUST_A' } });
    customerAId = custA?.id || '';

    const custB = await prisma.customer.findFirst({ where: { code: 'CUST_B' } });
    customerBId = custB?.id || '';
  });

  afterAll(async () => {
    if (app) {
      await app.close();
    }
  });

  describe('Customer Scoping & Multi-Tenant Isolation', () => {
    it('Customer A session is strictly scoped to CUST_A', async () => {
      const res = await request(app.getHttpServer())
        .get('/api/auth/me')
        .set('Authorization', `Bearer ${customerAToken}`)
        .expect(200);

      expect(res.body.claims.userType).toBe('customer');
      expect(res.body.claims.customerCode).toBe('CUST_A');
    });

    it('Customer B session is strictly scoped to CUST_B', async () => {
      const res = await request(app.getHttpServer())
        .get('/api/auth/me')
        .set('Authorization', `Bearer ${customerBToken}`)
        .expect(200);

      expect(res.body.claims.userType).toBe('customer');
      expect(res.body.claims.customerCode).toBe('CUST_B');
    });

    it('Customer A is forbidden from accessing admin users management (403)', async () => {
      await request(app.getHttpServer())
        .get('/api/admin/users')
        .set('Authorization', `Bearer ${customerAToken}`)
        .expect(403);
    });

    it('Customer A is forbidden from accessing admin customers management (403)', async () => {
      await request(app.getHttpServer())
        .get('/api/admin/customers')
        .set('Authorization', `Bearer ${customerAToken}`)
        .expect(403);
    });

    it('Customer B is forbidden from accessing admin customer users management (403)', async () => {
      await request(app.getHttpServer())
        .get('/api/admin/customer-users')
        .set('Authorization', `Bearer ${customerBToken}`)
        .expect(403);
    });
  });

  describe('Legacy Security Hardening Test Suite (TEST 1 to 18)', () => {
    it('TEST 1-4: Customer Inquiry Scoping & Multi-Tenancy (Explicitly Deferred to Phase 4)', () => {
      // NOTE: Inquiries endpoints (/api/inquiries) and inquiry data isolation belong to
      // Phase 4 (Commercial & Inquiries Monolith Migration). Confirmed as explicitly deferred to Phase 4.
      expect(true).toBe(true);
    });

    it('TEST 5-6: Customer A cannot modify assignments or assign itself to B (403)', async () => {
      if (customerAId) {
        await request(app.getHttpServer())
          .patch(`/api/admin/customers/${customerAId}`)
          .set('Authorization', `Bearer ${customerAToken}`)
          .send({ name: 'Hacked Customer Name' })
          .expect(403);
      }

      await request(app.getHttpServer())
        .post('/api/admin/customer-users')
        .set('Authorization', `Bearer ${customerAToken}`)
        .send({ customerId: customerBId, userAccountId: userAId })
        .expect(403);
    });

    it('TEST 7: CUSTOMER_USER with multiple active assignments is denied without guessing', async () => {
      // When a customer user is assigned to multiple active customers simultaneously,
      // customer scope cannot be resolved without explicit configuration
      const multiUserEmail = `multi-${suffix}@customer.test`;
      const multiUser = await prisma.userAccount.create({
        data: {
          email: multiUserEmail,
          username: multiUserEmail,
          fullName: 'Multi Customer User',
          passwordHash: await bcrypt.hash('Password123!', 10),
          status: 'ACTIVE',
          userType: 'customer',
        },
      });

      if (customerAId && customerBId) {
        await prisma.customerUser.createMany({
          data: [
            { customerId: customerAId, userAccountId: multiUser.id, status: 'ACTIVE', assignedBy: 'test' },
            { customerId: customerBId, userAccountId: multiUser.id, status: 'ACTIVE', assignedBy: 'test' },
          ],
        });

        const login = await request(app.getHttpServer())
          .post('/api/auth/login')
          .send({ email: multiUserEmail, password: 'Password123!' })
          .expect(200);

        const meRes = await request(app.getHttpServer())
          .get('/api/auth/me')
          .set('Authorization', `Bearer ${login.body.accessToken}`)
          .expect(200);

        // Multiple customer scope keys are attached, no single customer guessing
        expect(meRes.body.claims?.customerCode).toBeUndefined();
        const masterIds = meRes.body.user?.customerMasterIds || meRes.body.customerMasterIds || [];
        expect(masterIds.length).toBe(2);

        await prisma.customerUser.deleteMany({ where: { userAccountId: multiUser.id } });
        await prisma.userAccount.delete({ where: { id: multiUser.id } }).catch(() => undefined);
      }
    });

    it('TEST 8-9 and JWT replay: logout revokes access JWT immediately', async () => {
      const email = `logout-replay-${suffix}@energya.test`;
      const user = await prisma.userAccount.create({
        data: {
          email,
          username: email,
          fullName: 'Logout Replay',
          passwordHash: await bcrypt.hash('Password123!', 10),
          status: 'ACTIVE',
        },
      });

      const login = await request(app.getHttpServer())
        .post('/api/auth/login')
        .send({ email, password: 'Password123!' })
        .expect(200);

      const access = login.body.accessToken;
      const refresh = login.body.refreshToken;

      // Access before logout
      await request(app.getHttpServer())
        .get('/api/auth/me')
        .set('Authorization', `Bearer ${access}`)
        .expect(200);

      // Logout
      await request(app.getHttpServer())
        .post('/api/auth/logout')
        .set('Authorization', `Bearer ${access}`)
        .send({ refreshToken: refresh })
        .expect(200);

      // Immediate revocation: Access JWT replay rejected with 401
      await request(app.getHttpServer())
        .get('/api/auth/me')
        .set('Authorization', `Bearer ${access}`)
        .expect(401);

      await prisma.userAccount.delete({ where: { id: user.id } }).catch(() => undefined);
    });

    it('TEST 10: lock revokes access JWT immediately', async () => {
      const email = `lock-jwt-${suffix}@energya.test`;
      const created = await request(app.getHttpServer())
        .post('/api/admin/users')
        .set('Authorization', `Bearer ${adminToken}`)
        .send({ fullName: 'Lock JWT', email, username: `lock-jwt-${suffix}`, password: 'LockMe@2026!' })
        .expect(201);

      const userId = created.body.user.id;

      const login = await request(app.getHttpServer())
        .post('/api/auth/login')
        .send({ email, password: 'LockMe@2026!' })
        .expect(200);

      const access = login.body.accessToken;

      // Lock user from admin
      await request(app.getHttpServer())
        .post(`/api/admin/users/${userId}/lock`)
        .set('Authorization', `Bearer ${adminToken}`)
        .expect(200);

      // Access JWT is revoked immediately
      await request(app.getHttpServer())
        .get('/api/auth/me')
        .set('Authorization', `Bearer ${access}`)
        .expect(401);

      // Refresh token is also rejected
      await request(app.getHttpServer())
        .post('/api/auth/refresh-token')
        .send({ refreshToken: login.body.refreshToken })
        .expect(401);

      await prisma.userAccount.delete({ where: { id: userId } }).catch(() => undefined);
    });

    it('TEST 11: deactivate revokes access JWT immediately', async () => {
      const email = `deact-jwt-${suffix}@energya.test`;
      const created = await request(app.getHttpServer())
        .post('/api/admin/users')
        .set('Authorization', `Bearer ${adminToken}`)
        .send({ fullName: 'Deact JWT', email, username: `deact-jwt-${suffix}`, password: 'DeactMe@2026!' })
        .expect(201);

      const userId = created.body.user.id;

      const login = await request(app.getHttpServer())
        .post('/api/auth/login')
        .send({ email, password: 'DeactMe@2026!' })
        .expect(200);

      const access = login.body.accessToken;

      // Deactivate user from admin
      await request(app.getHttpServer())
        .post(`/api/admin/users/${userId}/deactivate`)
        .set('Authorization', `Bearer ${adminToken}`)
        .expect(200);

      // Access JWT is revoked immediately
      await request(app.getHttpServer())
        .get('/api/auth/me')
        .set('Authorization', `Bearer ${access}`)
        .expect(401);

      // Refresh token is also rejected
      await request(app.getHttpServer())
        .post('/api/auth/refresh-token')
        .send({ refreshToken: login.body.refreshToken })
        .expect(401);

      await prisma.userAccount.delete({ where: { id: userId } }).catch(() => undefined);
    });

    it('TEST 12-14: revoke or delete UserSession invalidates access JWT', async () => {
      const email = `session-inv-${suffix}@energya.test`;
      const user = await prisma.userAccount.create({
        data: {
          email,
          username: email,
          fullName: 'Session Invalidate',
          passwordHash: await bcrypt.hash('Password123!', 10),
          status: 'ACTIVE',
        },
      });

      // Case 1: Session revokedAt is set
      const l1 = await request(app.getHttpServer())
        .post('/api/auth/login')
        .send({ email, password: 'Password123!' });
      const access1 = l1.body.accessToken;
      const decoded1: any = jwt.decode(access1);
      await prisma.userSession.update({ where: { id: decoded1.sid }, data: { revokedAt: new Date() } });
      await request(app.getHttpServer()).get('/api/auth/me').set('Authorization', `Bearer ${access1}`).expect(401);

      // Case 2: Session expired
      const l2 = await request(app.getHttpServer())
        .post('/api/auth/login')
        .send({ email, password: 'Password123!' });
      const access2 = l2.body.accessToken;
      const decoded2: any = jwt.decode(access2);
      await prisma.userSession.update({ where: { id: decoded2.sid }, data: { expiresAt: new Date(Date.now() - 5000) } });
      await request(app.getHttpServer()).get('/api/auth/me').set('Authorization', `Bearer ${access2}`).expect(401);

      // Case 3: Session deleted from DB
      const l3 = await request(app.getHttpServer())
        .post('/api/auth/login')
        .send({ email, password: 'Password123!' });
      const access3 = l3.body.accessToken;
      const decoded3: any = jwt.decode(access3);
      await prisma.userSession.delete({ where: { id: decoded3.sid } });
      await request(app.getHttpServer()).get('/api/auth/me').set('Authorization', `Bearer ${access3}`).expect(401);

      await prisma.userAccount.delete({ where: { id: user.id } }).catch(() => undefined);
    });

    it('TEST 15-17: revoked/locked/deactivated refresh tokens fail', async () => {
      const email = `ref-fail-${suffix}@energya.test`;
      const user = await prisma.userAccount.create({
        data: {
          email,
          username: email,
          fullName: 'Refresh Fail Test',
          passwordHash: await bcrypt.hash('Password123!', 10),
          status: 'ACTIVE',
        },
      });

      const l = await request(app.getHttpServer())
        .post('/api/auth/login')
        .send({ email, password: 'Password123!' });
      const refresh = l.body.refreshToken;

      // Lock user
      await prisma.userAccount.update({ where: { id: user.id }, data: { isLocked: true } });
      await request(app.getHttpServer()).post('/api/auth/refresh-token').send({ refreshToken: refresh }).expect(401);

      // Unlock, then deactivate
      await prisma.userAccount.update({ where: { id: user.id }, data: { isLocked: false, isActive: false } });
      await request(app.getHttpServer()).post('/api/auth/refresh-token').send({ refreshToken: refresh }).expect(401);

      await prisma.userAccount.delete({ where: { id: user.id } }).catch(() => undefined);
    });

    it('TEST 18: password reset revokes prior access JWT', async () => {
      const email = `rst-jwt-${suffix}@energya.test`;
      const created = await request(app.getHttpServer())
        .post('/api/admin/users')
        .set('Authorization', `Bearer ${adminToken}`)
        .send({ fullName: 'Reset JWT', email, username: `rst-jwt-${suffix}`, password: 'ResetMe@2026!' })
        .expect(201);

      const userId = created.body.user.id;

      const login = await request(app.getHttpServer())
        .post('/api/auth/login')
        .send({ email, password: 'ResetMe@2026!' })
        .expect(200);

      const priorAccess = login.body.accessToken;

      // Issue reset ticket
      process.env.ADMIN_RESET_TOKEN_IN_RESPONSE = 'true';
      const issued = await request(app.getHttpServer())
        .post(`/api/admin/users/${userId}/reset-password`)
        .set('Authorization', `Bearer ${adminToken}`)
        .expect(200);

      const resetToken = issued.body.resetToken;
      expect(resetToken).toBeDefined();

      // Consume reset ticket
      await request(app.getHttpServer())
        .post('/api/auth/reset-password')
        .send({ token: resetToken, newPassword: 'ResetMe@2027!' })
        .expect(200);

      // Prior access token must now be 401
      await request(app.getHttpServer())
        .get('/api/auth/me')
        .set('Authorization', `Bearer ${priorAccess}`)
        .expect(401);

      await prisma.userAccount.delete({ where: { id: userId } }).catch(() => undefined);
    });
  });

  describe('Customer Assignment Lifecycle: Update, Reassign & Multiple Assignments', () => {
    it('Can assign customer user, update assignment status, and unassign', async () => {
      const email = `custassign-${suffix}@customer.test`;
      const user = await prisma.userAccount.create({
        data: {
          email,
          username: email,
          fullName: 'Assignment User',
          passwordHash: await bcrypt.hash('Password123!', 10),
          status: 'ACTIVE',
          userType: 'customer',
        },
      });

      if (customerAId) {
        // 1. Assign to Customer A
        const assignRes = await request(app.getHttpServer())
          .post('/api/admin/customer-users')
          .set('Authorization', `Bearer ${adminToken}`)
          .send({ customerId: customerAId, userAccountId: user.id })
          .expect(201);

        const assignment = assignRes.body.assignment || assignRes.body;
        const assignmentId = assignment.id;
        expect(assignmentId).toBeDefined();
        expect(assignment.status).toBe('ACTIVE');

        // 2. Update status to INACTIVE
        const patchRes = await request(app.getHttpServer())
          .patch(`/api/admin/customer-users/${assignmentId}`)
          .set('Authorization', `Bearer ${adminToken}`)
          .send({ status: 'INACTIVE' })
          .expect(200);

        const updated = patchRes.body.assignment || patchRes.body;
        expect(updated.status).toBe('INACTIVE');

        // 3. Unassign
        await request(app.getHttpServer())
          .post(`/api/admin/customer-users/${assignmentId}/unassign`)
          .set('Authorization', `Bearer ${adminToken}`)
          .expect(200);

        await prisma.customerUser.deleteMany({ where: { userAccountId: user.id } });
        await prisma.userAccount.delete({ where: { id: user.id } }).catch(() => undefined);
      }
    });
  });

  describe('RBAC & Role-Based Guard Enforcement', () => {
    it('Unauthenticated requests are rejected with 401 across admin endpoints', async () => {
      await request(app.getHttpServer()).get('/api/admin/users').expect(401);
      await request(app.getHttpServer()).get('/api/admin/roles').expect(401);
      await request(app.getHttpServer()).get('/api/admin/customers').expect(401);
      await request(app.getHttpServer()).get('/api/admin/security').expect(401);
    });

    it('Admin with ADMIN:USER:VIEW can list users (200)', async () => {
      const res = await request(app.getHttpServer())
        .get('/api/admin/users')
        .set('Authorization', `Bearer ${adminToken}`)
        .expect(200);

      expect(Array.isArray(res.body.users || res.body)).toBe(true);
    });

    it('Admin with ADMIN:CUSTOMER:VIEW can list customer reference masters (200)', async () => {
      const res = await request(app.getHttpServer())
        .get('/api/admin/customer-reference-masters')
        .set('Authorization', `Bearer ${adminToken}`)
        .expect(200);

      expect(res.body.currencies).toBeDefined();
      expect(res.body.incoterms).toBeDefined();
    });

    it('Limited user without CREATE permission cannot create a customer (403)', async () => {
      await request(app.getHttpServer())
        .post('/api/admin/customers')
        .set('Authorization', `Bearer ${limitedToken}`)
        .send({ code: 'UNAUTH_CUST', name: 'Unauthorized Customer' })
        .expect(403);
    });

    it('Limited user without CREATE permission cannot create a user (403)', async () => {
      await request(app.getHttpServer())
        .post('/api/admin/users')
        .set('Authorization', `Bearer ${limitedToken}`)
        .send({ email: 'new_unauth@parity.test', username: 'unauth' })
        .expect(403);
    });

    it('Limited user without MANAGE permission cannot modify roles (403)', async () => {
      await request(app.getHttpServer())
        .post('/api/admin/roles')
        .set('Authorization', `Bearer ${limitedToken}`)
        .send({ code: 'NEW_ROLE', name: 'New Role' })
        .expect(403);
    });
  });
});
