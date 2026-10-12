import { Test, TestingModule } from '@nestjs/testing';
import { INestApplication } from '@nestjs/common';
import request from 'supertest';
import { AppModule } from './../src/app.module.js';

describe('AppController (e2e)', () => {
  let app: INestApplication;

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

  it('/api/platform/health (GET)', async () => {
    const res = await request(app.getHttpServer())
      .get('/api/platform/health')
      .expect(200);

    expect(res.body.ok).toBe(true);
    expect(res.body.service).toBe('energya-connect');
  });

  it('/api/platform/status (GET)', async () => {
    const res = await request(app.getHttpServer())
      .get('/api/platform/status')
      .expect(200);

    expect(res.body.nestjs).toBe(true);
    expect(res.body.database).toBeDefined();
  });
});
