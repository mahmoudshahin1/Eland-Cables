import { describe, it, beforeAll, afterAll, expect } from 'vitest';
import { Test, TestingModule } from '@nestjs/testing';
import { INestApplication } from '@nestjs/common';
import request from 'supertest';
import { AppModule } from '../src/app.module.js';

describe('Increment 12B.1 - Identity & Auth Service E2E (NestJS)', () => {
  let app: INestApplication;
  let adminAccessToken: string;
  let adminRefreshToken: string;

  beforeAll(async () => {
    const moduleFixture: TestingModule = await Test.createTestingModule({
      imports: [AppModule],
    }).compile();

    app = moduleFixture.createNestApplication();
    await app.init();
  });

  afterAll(async () => {
    if (app) {
      await app.close();
    }
  });

  describe('Authentication Lifecycle', () => {
    it('POST /api/auth/login requires identifier and password', async () => {
      const res = await request(app.getHttpServer())
        .post('/api/auth/login')
        .send({})
        .expect(400);

      expect(res.body.error || res.body.message).toBeDefined();
    });

    it('POST /api/auth/login rejects invalid credentials', async () => {
      const res = await request(app.getHttpServer())
        .post('/api/auth/login')
        .send({ email: 'admin@parity.test', password: 'WrongPassword999!' })
        .expect(401);

      expect(res.body.message || res.body.error).toContain('Invalid email or password');
    });

    it('POST /api/auth/login succeeds with valid credentials and issues tokens', async () => {
      const res = await request(app.getHttpServer())
        .post('/api/auth/login')
        .send({ email: 'admin@parity.test', password: 'Password123!' })
        .expect(200);

      expect(res.body.success).toBe(true);
      expect(res.body.accessToken).toBeDefined();
      expect(res.body.tokenType).toBe('Bearer');
      expect(res.body.refreshToken).toBeDefined();
      expect(res.body.user).toBeDefined();
      expect(res.body.user.email).toBe('admin@parity.test');
      expect(res.body.claims).toBeDefined();

      adminAccessToken = res.body.accessToken;
      adminRefreshToken = res.body.refreshToken;
    });

    it('GET /api/auth/me rejects unauthenticated requests with 401', async () => {
      await request(app.getHttpServer())
        .get('/api/auth/me')
        .expect(401);
    });

    it('GET /api/auth/me returns authenticated user details and claims with Bearer token', async () => {
      const res = await request(app.getHttpServer())
        .get('/api/auth/me')
        .set('Authorization', `Bearer ${adminAccessToken}`)
        .expect(200);

      expect(res.body.authenticated).toBe(true);
      expect(res.body.user.email).toBe('admin@parity.test');
      expect(res.body.claims.id || res.body.claims.sub).toBeDefined();
    });

    it('POST /api/auth/refresh-token rejects request missing refreshToken with 400', async () => {
      await request(app.getHttpServer())
        .post('/api/auth/refresh-token')
        .send({})
        .expect(400);
    });

    it('POST /api/auth/refresh-token rejects invalid/expired token with 401', async () => {
      const res = await request(app.getHttpServer())
        .post('/api/auth/refresh-token')
        .send({ refreshToken: 'invalid_or_expired_refresh_token_hex_12345' })
        .expect(401);

      expect(res.body.message || res.body.error).toContain('Invalid or expired refresh token');
    });

    it('POST /api/auth/refresh-token succeeds with valid opaque token and rotates token', async () => {
      const res = await request(app.getHttpServer())
        .post('/api/auth/refresh-token')
        .send({ refreshToken: adminRefreshToken })
        .expect(200);

      expect(res.body.success).toBe(true);
      expect(res.body.accessToken).toBeDefined();
      expect(res.body.refreshToken).toBeDefined();
      expect(res.body.refreshToken).not.toBe(adminRefreshToken); // rotation

      // Old refresh token must now be invalid
      await request(app.getHttpServer())
        .post('/api/auth/refresh-token')
        .send({ refreshToken: adminRefreshToken })
        .expect(401);

      // Update to new tokens
      adminAccessToken = res.body.accessToken;
      adminRefreshToken = res.body.refreshToken;
    });

    it('POST /api/auth/forgot-password returns admin ticket issuance message', async () => {
      const res = await request(app.getHttpServer())
        .post('/api/auth/forgot-password')
        .send({ email: 'admin@parity.test' })
        .expect(200);

      expect(res.body.success).toBe(true);
      expect(res.body.message).toContain('administrator must issue a password reset ticket');
    });

    it('POST /api/auth/register returns 403 (self registration disabled)', async () => {
      await request(app.getHttpServer())
        .post('/api/auth/register')
        .send({ email: 'newuser@parity.test', password: 'Password123!' })
        .expect(403);
    });

    it('POST /api/auth/change-password validates current password', async () => {
      const res = await request(app.getHttpServer())
        .post('/api/auth/change-password')
        .set('Authorization', `Bearer ${adminAccessToken}`)
        .send({ currentPassword: 'WrongCurrentPassword!', newPassword: 'NewPassword123!' })
        .expect(400);

      expect(res.body.error || res.body.message).toBeDefined();
    });

    it('POST /api/auth/reset-password rejects missing or invalid reset token with 400', async () => {
      await request(app.getHttpServer())
        .post('/api/auth/reset-password')
        .send({ token: 'rst_invalid_nonexistent_token', newPassword: 'NewPassword123!' })
        .expect(400);
    });

    it('POST /api/auth/logout revokes session and refresh token', async () => {
      const res = await request(app.getHttpServer())
        .post('/api/auth/logout')
        .set('Authorization', `Bearer ${adminAccessToken}`)
        .send({ refreshToken: adminRefreshToken })
        .expect(200);

      expect(res.body.success).toBe(true);
      expect(res.body.message).toBe('Signed out');

      // Refresh token must now be revoked
      await request(app.getHttpServer())
        .post('/api/auth/refresh-token')
        .send({ refreshToken: adminRefreshToken })
        .expect(401);
    });
  });
});
