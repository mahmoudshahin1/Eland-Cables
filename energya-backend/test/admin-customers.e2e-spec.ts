import { Test, TestingModule } from '@nestjs/testing';
import { INestApplication } from '@nestjs/common';
import request from 'supertest';
import { AppModule } from './../src/app.module';

describe('AdminCustomersController (e2e)', () => {
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
    it('/api/admin/customers (GET) - denies unauthenticated requests', () => {
      return request(app.getHttpServer())
        .get('/api/admin/customers')
        .expect(401);
    });

    it('/api/admin/customer-reference-masters (GET) - denies unauthenticated requests', () => {
      return request(app.getHttpServer())
        .get('/api/admin/customer-reference-masters')
        .expect(401);
    });

    it('/api/admin/customer-users (GET) - denies unauthenticated requests', () => {
      return request(app.getHttpServer())
        .get('/api/admin/customer-users')
        .expect(401);
    });

    it('/api/admin/customers (POST) - denies unauthenticated creation', () => {
      return request(app.getHttpServer())
        .post('/api/admin/customers')
        .send({ name: 'Test Customer', code: 'TC-01' })
        .expect(401);
    });
  });
});
