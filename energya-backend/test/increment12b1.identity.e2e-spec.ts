import { describe, it, beforeAll, afterAll, expect } from 'vitest';
import { Test, TestingModule } from '@nestjs/testing';
import { INestApplication } from '@nestjs/common';
import request from 'supertest';
import bcrypt from 'bcryptjs';
import jwt from 'jsonwebtoken';
import { AppModule } from '../src/app.module.js';
import { PrismaService } from '../src/prisma.service.js';
import { JwtService } from '@nestjs/jwt';
import {
  assertCanAccessInquiryOwnership,
  assertCanApproveBomGovernance,
  assertCanCalculateCosting,
  assertCanApproveRawMaterialPrice,
  assertCanManageQuotations,
  assertCanProcessTechnicalOffice,
} from '../src/shared/domain/rbac.js';
import { hasPermission } from '../src/shared/domain/rbac-engine.js';
import { DomainError } from '../src/shared/errors/domainError.js';

describe('Increment 12B.1 - Identity, login, and RBAC E2E (NestJS)', () => {
  let app: INestApplication;
  let prisma: PrismaService;
  let jwtService: JwtService;
  let adminAccessToken: string;
  let adminRefreshToken: string;
  let adminId: string;
  let salesAccessToken: string;
  const suffix = `id12b1-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;

  beforeAll(async () => {
    const moduleFixture: TestingModule = await Test.createTestingModule({
      imports: [AppModule],
    }).compile();

    app = moduleFixture.createNestApplication();
    await app.init();

    prisma = app.get(PrismaService);
    jwtService = app.get(JwtService);

    // Login as admin@parity.test
    const loginRes = await request(app.getHttpServer())
      .post('/api/auth/login')
      .send({ email: 'admin@parity.test', password: 'Password123!' })
      .expect(200);

    adminAccessToken = loginRes.body.accessToken;
    adminRefreshToken = loginRes.body.refreshToken;
    adminId = loginRes.body.user.id;

    // Login as limited/sales
    const salesLogin = await request(app.getHttpServer())
      .post('/api/auth/login')
      .send({ email: 'limited@parity.test', password: 'Password123!' })
      .expect(200);

    salesAccessToken = salesLogin.body.accessToken;
  });

  afterAll(async () => {
    if (app) {
      await app.close();
    }
  });

  it('1. Login with valid credentials', async () => {
    const res = await request(app.getHttpServer())
      .post('/api/auth/login')
      .send({ email: 'admin@parity.test', password: 'Password123!' })
      .expect(200);

    expect(res.body.success).toBe(true);
    expect(res.body.accessToken).toBeDefined();
    expect(res.body.refreshToken).toBeDefined();
    expect(res.body.user.email).toBe('admin@parity.test');
  });

  it('2. Invalid password returns 401', async () => {
    const email = `badpw-${suffix}@energya.test`;
    const hash = await bcrypt.hash('Goodpw@2026!', 10);
    const user = await prisma.userAccount.create({
      data: {
        email,
        username: email,
        fullName: 'Bad Password',
        passwordHash: hash,
        status: 'ACTIVE',
        isActive: true,
      },
    });

    const res = await request(app.getHttpServer())
      .post('/api/auth/login')
      .send({ email, password: 'wrong-password-xx' })
      .expect(401);

    expect(res.body.message || res.body.error).toContain('Invalid email or password');
    await prisma.userAccount.delete({ where: { id: user.id } }).catch(() => undefined);
  });

  it('3. Inactive user cannot login', async () => {
    const email = `inactive-${suffix}@energya.test`;
    const hash = await bcrypt.hash('Inactive@2026!', 10);
    const user = await prisma.userAccount.create({
      data: {
        email,
        username: email,
        fullName: 'Inactive User',
        passwordHash: hash,
        isActive: false,
        status: 'INACTIVE',
      },
    });

    const res = await request(app.getHttpServer())
      .post('/api/auth/login')
      .send({ email, password: 'Inactive@2026!' })
      .expect(401);

    expect(res.body.message || res.body.error).toBeDefined();
    await prisma.userAccount.delete({ where: { id: user.id } }).catch(() => undefined);
  });

  it('4. Locked user cannot login', async () => {
    const email = `locked-${suffix}@energya.test`;
    const hash = await bcrypt.hash('Lockedxx@2026!', 10);
    const user = await prisma.userAccount.create({
      data: {
        email,
        username: email,
        fullName: 'Locked User',
        passwordHash: hash,
        isLocked: true,
        status: 'LOCKED',
      },
    });

    const res = await request(app.getHttpServer())
      .post('/api/auth/login')
      .send({ email, password: 'Lockedxx@2026!' })
      .expect(401);

    expect(res.body.message || res.body.error).toContain('locked');
    await prisma.userAccount.delete({ where: { id: user.id } }).catch(() => undefined);
  });

  it('5-6. Failed attempts increase and successful login resets them', async () => {
    const email = `attempts-${suffix}@energya.test`;
    const hash = await bcrypt.hash('Attempts@2026!', 10);
    const user = await prisma.userAccount.create({
      data: {
        email,
        username: email,
        fullName: 'Attempts Test',
        passwordHash: hash,
        status: 'ACTIVE',
        isActive: true,
        failedLoginAttempts: 0,
      },
    });

    await request(app.getHttpServer())
      .post('/api/auth/login')
      .send({ email, password: 'bad-password-1' })
      .expect(401);

    const afterFail = await prisma.userAccount.findUnique({ where: { id: user.id } });
    expect((afterFail?.failedLoginAttempts || 0)).toBeGreaterThanOrEqual(1);

    const okRes = await request(app.getHttpServer())
      .post('/api/auth/login')
      .send({ email, password: 'Attempts@2026!' })
      .expect(200);

    expect(okRes.body.success).toBe(true);
    const afterOk = await prisma.userAccount.findUnique({ where: { id: user.id } });
    expect(afterOk?.failedLoginAttempts).toBe(0);

    await prisma.userAccount.delete({ where: { id: user.id } }).catch(() => undefined);
  });

  it('7. Admin can create user', async () => {
    const res = await request(app.getHttpServer())
      .post('/api/admin/users')
      .set('Authorization', `Bearer ${adminAccessToken}`)
      .send({
        fullName: 'B1 Created',
        email: `created-${suffix}@energya.test`,
        username: `created-${suffix}`,
        password: 'Created@2026!',
        department: 'QA',
        roleCodes: ['AUDITOR'],
      })
      .expect(201);

    expect(res.body.user.id).toBeDefined();
    expect(res.body.user.email).toBe(`created-${suffix}@energya.test`);
    const dump = JSON.stringify(res.body).toLowerCase();
    expect(dump.includes('passwordhash')).toBe(false);
  });

  it('8. Non-admin receives 403', async () => {
    const noAdminUser = await prisma.userAccount.create({
      data: {
        email: `noadmin-${suffix}@energya.test`,
        username: `noadmin-${suffix}`,
        fullName: 'No Admin User',
        passwordHash: await bcrypt.hash('NoAdmin@2026!', 10),
        status: 'ACTIVE',
      },
    });
    const login = await request(app.getHttpServer())
      .post('/api/auth/login')
      .send({ email: noAdminUser.email, password: 'NoAdmin@2026!' });

    await request(app.getHttpServer())
      .get('/api/admin/users')
      .set('Authorization', `Bearer ${login.body.accessToken}`)
      .expect(403);

    await prisma.userAccount.delete({ where: { id: noAdminUser.id } }).catch(() => undefined);
  });

  it('9. Admin can assign role', async () => {
    const created = await request(app.getHttpServer())
      .post('/api/admin/users')
      .set('Authorization', `Bearer ${adminAccessToken}`)
      .send({
        fullName: 'Role Target',
        email: `roletgt-${suffix}@energya.test`,
        username: `roletgt-${suffix}`,
        password: 'Roletgt@2026!',
      })
      .expect(201);

    const res = await request(app.getHttpServer())
      .post(`/api/admin/users/${created.body.user.id}/roles`)
      .set('Authorization', `Bearer ${adminAccessToken}`)
      .send({ roleCode: 'AUDITOR' })
      .expect(200);

    expect(res.body.user.roles).toContain('AUDITOR');
  });

  it('10. Unauthorized user cannot assign role', async () => {
    await request(app.getHttpServer())
      .post(`/api/admin/users/${adminId}/roles`)
      .set('Authorization', `Bearer ${salesAccessToken}`)
      .send({ roleCode: 'AUDITOR' })
      .expect(403);
  });

  it('11. Permission enforcement works (granular codes)', () => {
    const actor = { id: 'u-x', permissionCodes: ['COSTING:COSTING_RUN:VIEW'] };
    expect(hasPermission(actor as any, 'COSTING', 'COSTING_RUN', 'VIEW')).toBe(true);
    expect(hasPermission(actor as any, 'COSTING', 'COSTING_RUN', 'CALCULATE')).toBe(false);
    expect(() =>
      assertCanCalculateCosting({ id: 'u-x', userType: 'internal', permissionCodes: ['COSTING:COSTING_RUN:VIEW'] } as any)
    ).toThrow(DomainError);
  });

  it('12. User cannot elevate own role', async () => {
    await request(app.getHttpServer())
      .post(`/api/admin/users/${adminId}/roles`)
      .set('Authorization', `Bearer ${adminAccessToken}`)
      .send({ roleCode: 'AUDITOR' })
      .expect(403);
  });

  it('13. Vertical privilege: ROLE_MANAGE without SYSTEM_ADMINISTRATOR cannot grant it', async () => {
    // Limited user trying to grant SYSTEM_ADMINISTRATOR
    const created = await request(app.getHttpServer())
      .post('/api/admin/users')
      .set('Authorization', `Bearer ${adminAccessToken}`)
      .send({
        fullName: 'Elevate Me',
        email: `elevate-${suffix}@energya.test`,
        username: `elevate-${suffix}`,
        password: 'Elevate@2026!',
      })
      .expect(201);

    await request(app.getHttpServer())
      .post(`/api/admin/users/${created.body.user.id}/roles`)
      .set('Authorization', `Bearer ${salesAccessToken}`)
      .send({ roleCode: 'SYSTEM_ADMINISTRATOR' })
      .expect(403);
  });

  it('14. Password hash never appears in API response', async () => {
    const res = await request(app.getHttpServer())
      .get('/api/admin/users?q=admin@parity.test')
      .set('Authorization', `Bearer ${adminAccessToken}`)
      .expect(200);

    const dumped = JSON.stringify(res.body).toLowerCase();
    expect(dumped.includes('passwordhash')).toBe(false);
    expect(dumped.includes('$2a$')).toBe(false);
    expect(dumped.includes('$2b$')).toBe(false);
  });

  it('15. Password hash never appears in audit', async () => {
    const events = await prisma.auditEvent.findMany({
      where: { action: { in: ['LOGIN_SUCCESS', 'LOGIN_FAILURE', 'CREATE_USER', 'RESET_PASSWORD'] } },
      take: 50,
      orderBy: { at: 'desc' },
    });
    const dumped = JSON.stringify(events).toLowerCase();
    expect(dumped.includes('passwordhash')).toBe(false);
    expect(dumped.includes('password123!')).toBe(false);
  });

  it('16. Existing customer isolation still works', () => {
    const a = { id: 'u-cust-eland', userType: 'customer' as const };
    const b = { id: 'u-cust-dewa', userType: 'customer' as const };
    expect(() => assertCanAccessInquiryOwnership(a as any, a.id)).not.toThrow();
    expect(() => assertCanAccessInquiryOwnership(b as any, a.id)).toThrow(DomainError);
  });

  it('17. Existing quotation authorization still works', () => {
    expect(() =>
      assertCanManageQuotations({
        id: 'u-cust',
        userType: 'customer',
        permissions: { salesQuotations: false },
      } as any)
    ).toThrow(DomainError);
    expect(() =>
      assertCanManageQuotations({
        id: 'u-sales',
        userType: 'internal',
        permissions: { salesQuotations: true },
      } as any)
    ).not.toThrow();
  });

  it('18. Existing costing authorization still works', () => {
    expect(() =>
      assertCanCalculateCosting({
        id: 'u-cost',
        userType: 'internal',
        permissions: { costingPricing: true },
      } as any)
    ).not.toThrow();
    expect(() =>
      assertCanApproveRawMaterialPrice({
        id: 'u-to',
        userType: 'internal',
        permissions: { technicalOffice: true, costingPricing: false, masterData: true },
      } as any)
    ).toThrow(DomainError);
    expect(() =>
      assertCanApproveRawMaterialPrice({
        id: 'u-cost',
        userType: 'internal',
        permissions: { costingPricing: true },
      } as any)
    ).not.toThrow();
    expect(() =>
      assertCanCalculateCosting({
        id: 'u-cust',
        userType: 'customer',
        permissions: { costingPricing: false },
      } as any)
    ).toThrow(DomainError);
  });

  it('19. Existing BOM authorization still works', () => {
    expect(() =>
      assertCanApproveBomGovernance({
        id: 'u-to',
        userType: 'internal',
        permissions: { technicalOffice: true },
      } as any)
    ).not.toThrow();
    expect(() =>
      assertCanApproveBomGovernance({
        id: 'u-cust',
        userType: 'customer',
        permissions: { technicalOffice: false },
      } as any)
    ).toThrow(DomainError);
  });

  it('20. Existing Technical Office authorization still works', () => {
    expect(() =>
      assertCanProcessTechnicalOffice({
        id: 'u-to',
        userType: 'internal',
        permissions: { technicalOffice: true },
      } as any)
    ).not.toThrow();
    expect(() =>
      assertCanProcessTechnicalOffice({
        id: 'u-cust',
        userType: 'customer',
        permissions: { technicalOffice: false },
      } as any)
    ).toThrow(DomainError);
  });

  it('Horizontal privilege escalation is blocked for customer isolation', () => {
    expect(() =>
      assertCanAccessInquiryOwnership(
        { id: 'attacker', userType: 'customer', customerId: 'c-other' } as any,
        'c-eland'
      )
    ).toThrow(DomainError);
  });

  it('Unauthenticated admin API is 401', async () => {
    await request(app.getHttpServer()).get('/api/admin/users').expect(401);
  });

  it('Login accepts username as well as email', async () => {
    const res = await request(app.getHttpServer())
      .post('/api/auth/login')
      .send({ username: 'admin@parity.test', password: 'Password123!' })
      .expect(200);

    expect(res.body.success).toBe(true);
    expect(res.body.user.email).toBe('admin@parity.test');
  });

  it('Login without identifier or password is 400', async () => {
    await request(app.getHttpServer())
      .post('/api/auth/login')
      .send({})
      .expect(400);
  });

  it('Expired access token cannot access /me', async () => {
    const secret = process.env.JWT_SECRET || 'energya_connect_dotnet9_super_secret_jwt_key_2026_x89f_long_enough';
    const expired = jwt.sign(
      { sub: adminId, sid: 'expired-sid', email: 'admin@parity.test', userType: 'internal' },
      secret,
      { expiresIn: '-10s' }
    );
    await request(app.getHttpServer())
      .get('/api/auth/me')
      .set('Authorization', `Bearer ${expired}`)
      .expect(401);
  });

  it('Invalid token cannot access /me', async () => {
    await request(app.getHttpServer())
      .get('/api/auth/me')
      .set('Authorization', 'Bearer not-a-valid-jwt-token-at-all')
      .expect(401);
  });

  it('Customer session cannot access internal admin APIs', async () => {
    const customerLogin = await request(app.getHttpServer())
      .post('/api/auth/login')
      .send({ email: 'custA@parity.test', password: 'Password123!' })
      .expect(200);

    await request(app.getHttpServer())
      .get('/api/admin/users')
      .set('Authorization', `Bearer ${customerLogin.body.accessToken}`)
      .expect(403);
  });

  it('Logout revokes refresh and /me for that session', async () => {
    const login = await request(app.getHttpServer())
      .post('/api/auth/login')
      .send({ email: 'admin@parity.test', password: 'Password123!' })
      .expect(200);

    const access = login.body.accessToken;
    const refresh = login.body.refreshToken;

    await request(app.getHttpServer())
      .post('/api/auth/logout')
      .set('Authorization', `Bearer ${access}`)
      .send({ refreshToken: refresh })
      .expect(200);

    await request(app.getHttpServer())
      .get('/api/auth/me')
      .set('Authorization', `Bearer ${access}`)
      .expect(401);

    await request(app.getHttpServer())
      .post('/api/auth/refresh-token')
      .send({ refreshToken: refresh })
      .expect(401);
  });

  it('Change password requires authentication and current password', async () => {
    await request(app.getHttpServer())
      .post('/api/auth/change-password')
      .send({ currentPassword: 'x', newPassword: 'NewPass@2026!' })
      .expect(401);

    const email = `chgpw-${suffix}@energya.test`;
    const hash = await bcrypt.hash('Sales@2026!', 10);
    const user = await prisma.userAccount.create({
      data: {
        email,
        username: email,
        fullName: 'Change Password User',
        passwordHash: hash,
        status: 'ACTIVE',
        isActive: true,
      },
    });

    const login = await request(app.getHttpServer())
      .post('/api/auth/login')
      .send({ email, password: 'Sales@2026!' })
      .expect(200);

    // Wrong password
    await request(app.getHttpServer())
      .post('/api/auth/change-password')
      .set('Authorization', `Bearer ${login.body.accessToken}`)
      .send({ currentPassword: 'wrong-current-password', newPassword: 'NewPass@2026!' })
      .expect(400);

    // Correct password
    await request(app.getHttpServer())
      .post('/api/auth/change-password')
      .set('Authorization', `Bearer ${login.body.accessToken}`)
      .send({ currentPassword: 'Sales@2026!', newPassword: 'SalesNew@2026!' })
      .expect(200);

    // Old login fails
    await request(app.getHttpServer())
      .post('/api/auth/login')
      .send({ email, password: 'Sales@2026!' })
      .expect(401);

    // New login succeeds
    const newLogin = await request(app.getHttpServer())
      .post('/api/auth/login')
      .send({ email, password: 'SalesNew@2026!' })
      .expect(200);

    expect(newLogin.body.success).toBe(true);
    await prisma.userAccount.deleteMany({ where: { email } });
  });
});
