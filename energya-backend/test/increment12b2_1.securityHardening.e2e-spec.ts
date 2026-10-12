import { describe, it, beforeAll, afterAll, expect } from 'vitest';
import { Test, TestingModule } from '@nestjs/testing';
import { INestApplication } from '@nestjs/common';
import request from 'supertest';
import { AppModule } from '../src/app.module.js';

describe('Increment 12B.2.1 - Security Hardening & Tenant Isolation E2E (NestJS)', () => {
  let app: INestApplication;
  let adminToken: string;
  let limitedToken: string;
  let customerAToken: string;
  let customerBToken: string;

  beforeAll(async () => {
    const moduleFixture: TestingModule = await Test.createTestingModule({
      imports: [AppModule],
    }).compile();

    app = moduleFixture.createNestApplication();
    await app.init();

    // Authenticate test actors
    const login = async (email: string) => {
      const res = await request(app.getHttpServer())
        .post('/api/auth/login')
        .send({ email, password: 'Password123!' });
      return res.body.accessToken;
    };

    adminToken = await login('admin@parity.test');
    limitedToken = await login('limited@parity.test');
    customerAToken = await login('custA@parity.test');
    customerBToken = await login('custB@parity.test');
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
