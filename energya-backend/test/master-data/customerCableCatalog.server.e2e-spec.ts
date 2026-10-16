import { describe, it, beforeAll, afterAll, expect } from 'vitest';
import { Test, TestingModule } from '@nestjs/testing';
import { INestApplication } from '@nestjs/common';
import request from 'supertest';
import { AppModule } from '../../src/app.module.js';
import { PrismaService } from '../../src/prisma.service.js';
import { CABLE_SEARCH_FORBIDDEN_RESULT_KEYS } from '../../src/shared/domain/v2AdvancedCableSearch.js';

describe('Customer Cable Products catalog API (NestJS e2e)', () => {
  let app: INestApplication;
  let prisma: PrismaService;
  let customerToken: string;
  const suffix = `CAT-${String(Date.now()).replace(/99/g, '88')}`;
  const matLv = `${suffix}-LV`;
  const matMv = `${suffix}-MV`;
  const materials = [matLv, matMv];

  beforeAll(async () => {
    const moduleFixture: TestingModule = await Test.createTestingModule({
      imports: [AppModule],
    }).compile();

    app = moduleFixture.createNestApplication();
    await app.init();
    prisma = app.get(PrismaService);

    // Seed customer and login to get token
    const customerLogin = await request(app.getHttpServer())
      .post('/api/auth/login')
      .send({ email: 'custA@parity.test', password: 'Password123!' });
    customerToken = customerLogin.body.accessToken;

    // Seed test cables
    await prisma.cableMaster.deleteMany({ where: { materialNumber: { in: materials } } });
    await prisma.cableMaster.create({
      data: {
        materialNumber: matLv,
        itemCode: `${matLv}-ITEM`,
        customerCode: 'N2XH',
        description: 'Cu / XLPE / LSHF 0.6/1 kV 1X150 mm2 IEC 60502-1',
        family: 'LV',
        voltage: '0.6/1 kV',
        conductor: 'Copper',
        cores: '1',
        conductorSize: '150',
        insulation: 'XLPE',
        sheath: 'LSHF',
        standard: 'IEC 60502-1',
        diameter: 32,
        weight: 1800,
        status: 'ACTIVE',
      },
    });

    await prisma.cableMaster.create({
      data: {
        materialNumber: matMv,
        itemCode: `${matMv}-ITEM`,
        customerCode: 'N2XS2Y',
        description: 'Cu / XLPE / MDPE 6/10 kV CWs 1X150/25 mm2 IEC 60502-2',
        family: 'MV',
        voltage: '6/10 kV',
        conductor: 'Copper',
        cores: '1',
        conductorSize: '150',
        insulation: 'XLPE',
        screen: 'CWS',
        sheath: 'MDPE',
        standard: 'IEC 60502-2',
        diameter: 32,
        weight: 1800,
        status: 'ACTIVE',
      },
    });
  });

  afterAll(async () => {
    if (prisma) {
      await prisma.cableMaster.deleteMany({ where: { materialNumber: { in: materials } } });
    }
    await app.close();
  });

  const auth = (token: string) => ({ Authorization: `Bearer ${token}` });

  it('requires sign-in', async () => {
    await request(app.getHttpServer())
      .get('/api/v2/cables/products?page=1&pageSize=25')
      .expect(401);
  });

  it('lists Cable Master rows with server-side pagination and no costing leak', async () => {
    const res = await request(app.getHttpServer())
      .get(`/api/v2/cables/products?page=1&pageSize=25&q=${encodeURIComponent(suffix)}`)
      .set(auth(customerToken))
      .expect(200);

    expect(res.body.pageSize).toBe(25);
    expect(res.body.total).toBeGreaterThanOrEqual(2);
    expect(res.body.cables.length).toBeGreaterThanOrEqual(2);
    expect(res.body.searchKind).toBe('CABLE_MASTER_CATALOG');

    for (const hit of res.body.cables) {
      for (const key of CABLE_SEARCH_FORBIDDEN_RESULT_KEYS) {
        expect(Object.hasOwn(hit, key)).toBe(false);
      }
    }
  });

  it('maps category=MV from family/voltage without rewriting masters', async () => {
    const before = await prisma.cableMaster.findUnique({ where: { materialNumber: matMv } });

    const res = await request(app.getHttpServer())
      .get(`/api/v2/cables/products?category=MV&q=${encodeURIComponent(suffix)}`)
      .set(auth(customerToken))
      .expect(200);

    const ids = res.body.cables.map((c: { materialNumber: string }) => c.materialNumber);
    expect(ids).toContain(matMv);
    expect(ids).not.toContain(matLv);

    const after = await prisma.cableMaster.findUnique({ where: { materialNumber: matMv } });
    expect(after?.family).toBe(before?.family);
    expect(after?.updatedAt.getTime()).toBe(before?.updatedAt.getTime());
  });

  it('maps POWER as LV ∪ MV family keys', async () => {
    const res = await request(app.getHttpServer())
      .get(`/api/v2/cables/products?category=POWER&q=${encodeURIComponent(suffix)}`)
      .set(auth(customerToken))
      .expect(200);

    const ids = res.body.cables.map((c: { materialNumber: string }) => c.materialNumber);
    expect(ids).toContain(matLv);
    expect(ids).toContain(matMv);
  });

  it('returns live facets from Cable Master and documents unmapped category field', async () => {
    const res = await request(app.getHttpServer())
      .get('/api/v2/cables/products/facets')
      .set(auth(customerToken))
      .expect(200);

    expect(res.body.facets.mapping.productCategoryField).toBe(false);
    expect(res.body.facets.mapping.mappedBy).toBe('family_voltage');
    expect(typeof res.body.facets.mapping.unmappedCount).toBe('number');
    expect(
      res.body.facets.voltageClass.includes('MV') || res.body.facets.voltageClass.includes('LV'),
    ).toBe(true);
    expect(Array.isArray(res.body.facets.voltage)).toBe(true);
  });

  it.todo('exports customer-safe Excel without costing or BOM columns (Deferred to Phase 2b: Excel Export)');
});
