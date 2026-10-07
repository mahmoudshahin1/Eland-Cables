import { Test, TestingModule } from '@nestjs/testing';
import { INestApplication } from '@nestjs/common';
import request from 'supertest';
import { AppModule } from './../src/app.module';

describe('AdminIdentityController (e2e)', () => {
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

  describe('Guards & Authentication Parity', () => {
    it('/api/admin/users (GET) - denies unauthenticated requests', () => {
      return request(app.getHttpServer())
        .get('/api/admin/users')
        .expect(401);
    });

    it('/api/admin/roles (GET) - denies unauthenticated requests', () => {
      return request(app.getHttpServer())
        .get('/api/admin/roles')
        .expect(401);
    });

    it('/api/admin/permissions (GET) - denies unauthenticated requests', () => {
      return request(app.getHttpServer())
        .get('/api/admin/permissions')
        .expect(401);
    });

    it('/api/admin/permissions/matrix (GET) - denies unauthenticated requests', () => {
      return request(app.getHttpServer())
        .get('/api/admin/permissions/matrix')
        .expect(401);
    });

    it('/api/admin/security (GET) - denies unauthenticated requests', () => {
      return request(app.getHttpServer())
        .get('/api/admin/security')
        .expect(401);
    });
  });
});
