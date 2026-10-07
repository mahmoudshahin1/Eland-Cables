import { Test, TestingModule } from '@nestjs/testing';
import { INestApplication } from '@nestjs/common';
import request from 'supertest';
import { AppModule } from './../src/app.module';

describe('AuthController (e2e)', () => {
  let app: INestApplication;

  beforeAll(async () => {
    const moduleFixture: TestingModule = await Test.createTestingModule({
      imports: [AppModule],
    }).compile();

    app = moduleFixture.createNestApplication();
    await app.init();
  });

  afterAll(async () => {
    await app.close();
  });

  describe('Contract Parity', () => {
    it('/api/auth/login (POST) - invalid credentials', () => {
      return request(app.getHttpServer())
        .post('/api/auth/login')
        .send({ email: 'bad-email@example.com', password: 'wrong' })
        .expect(403);
    });

    it('/api/auth/register (POST) - disabled self-registration returns 403', () => {
      return request(app.getHttpServer())
        .post('/api/auth/register')
        .expect(403);
    });

    it('/api/auth/forgot-password (POST) - returns informative message', async () => {
      const res = await request(app.getHttpServer())
        .post('/api/auth/forgot-password')
        .expect(200);
      expect(res.body.success).toBe(true);
      expect(res.body.message).toContain('administrator must issue a password reset ticket');
    });

    it('/api/auth/me (GET) - denies access without Bearer token', () => {
      return request(app.getHttpServer())
        .get('/api/auth/me')
        .expect(401);
    });

    it('/api/auth/change-password (POST) - denies access without Bearer token', () => {
      return request(app.getHttpServer())
        .post('/api/auth/change-password')
        .send({ currentPassword: 'old', newPassword: 'new' })
        .expect(401);
    });
  });
});
