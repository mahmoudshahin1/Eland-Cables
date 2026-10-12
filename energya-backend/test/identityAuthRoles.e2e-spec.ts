import { describe, it, beforeAll, afterAll, expect } from 'vitest';
import { Test, TestingModule } from '@nestjs/testing';
import { INestApplication } from '@nestjs/common';
import request from 'supertest';
import { AppModule } from '../src/app.module.js';

describe('Identity Auth Roles E2E (NestJS)', () => {
  let app: INestApplication;
  let adminToken: string;

  beforeAll(async () => {
    const moduleFixture: TestingModule = await Test.createTestingModule({
      imports: [AppModule],
    }).compile();

    app = moduleFixture.createNestApplication();
    await app.init();

    const res = await request(app.getHttpServer())
      .post('/api/auth/login')
      .send({ email: 'admin@parity.test', password: 'Password123!' });
    adminToken = res.body.accessToken;
  });

  afterAll(async () => {
    if (app) {
      await app.close();
    }
  });

  describe('Role & Permission Governance', () => {
    it('GET /api/admin/permissions returns system permissions catalog', async () => {
      const res = await request(app.getHttpServer())
        .get('/api/admin/permissions')
        .set('Authorization', `Bearer ${adminToken}`)
        .expect(200);

      expect(Array.isArray(res.body.permissions || res.body)).toBe(true);
    });

    it('GET /api/admin/permissions/matrix returns role-permission matrix', async () => {
      const res = await request(app.getHttpServer())
        .get('/api/admin/permissions/matrix')
        .set('Authorization', `Bearer ${adminToken}`)
        .expect(200);

      expect(res.body).toBeDefined();
    });

    it('GET /api/admin/roles returns list of active roles', async () => {
      const res = await request(app.getHttpServer())
        .get('/api/admin/roles')
        .set('Authorization', `Bearer ${adminToken}`)
        .expect(200);

      expect(Array.isArray(res.body.roles || res.body)).toBe(true);
    });

    it('POST /api/auth/roles returns 403 (deprecated endpoint parity)', async () => {
      await request(app.getHttpServer())
        .post('/api/auth/roles')
        .set('Authorization', `Bearer ${adminToken}`)
        .expect(403);
    });

    it('POST /api/auth/assign-role returns 403 (deprecated endpoint parity)', async () => {
      await request(app.getHttpServer())
        .post('/api/auth/assign-role')
        .set('Authorization', `Bearer ${adminToken}`)
        .expect(403);
    });
  });
});
