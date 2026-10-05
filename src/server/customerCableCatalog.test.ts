import assert from 'node:assert/strict';
import { after, before, describe, it } from 'node:test';
import http from 'node:http';
import express from 'express';
import dotenv from 'dotenv';
import { checkDatabase, disconnectPrisma, getPrisma } from './db';
import { createCable } from './masterDataRepository';
import { CABLE_SEARCH_FORBIDDEN_RESULT_KEYS } from '../domain/v2AdvancedCableSearch';
import { v2CableSearchRouter } from './v2CableSearchRoutes';
import { signTestToken } from './auth';
import type { MasterCableCatalogItem } from '../types';

dotenv.config();

function listen(app: express.Express): Promise<{ server: http.Server; base: string }> {
  return new Promise((resolve) => {
    const server = app.listen(0, '127.0.0.1', () => {
      const addr = server.address();
      const port = typeof addr === 'object' && addr ? addr.port : 0;
      resolve({ server, base: `http://127.0.0.1:${port}` });
    });
  });
}

async function json(base: string, path: string, init?: RequestInit) {
  const res = await fetch(`${base}${path}`, init);
  const body = await res.json().catch(() => ({}));
  return { status: res.status, body, headers: res.headers };
}

describe('Customer Cable Products catalog API', () => {
  let base = '';
  let server: http.Server;
  let customerToken = '';
  const suffix = `CAT-${String(Date.now()).replace(/99/g, '88')}`;
  const matLv = `${suffix}-LV`;
  const matMv = `${suffix}-MV`;
  const materials = [matLv, matMv];

  const customerActor = {
    id: 'u-cat-customer',
    name: 'Catalog Customer',
    email: 'catalog.customer@example.com',
    userType: 'customer' as const,
    customerId: 'c-cat',
    permissions: { masterData: false, costingPricing: false, technicalOffice: false },
  };
  const internalActor = {
    id: 'u-cat-internal',
    name: 'Catalog Internal',
    email: 'catalog.internal@energya.com',
    userType: 'internal' as const,
    permissions: { masterData: true },
  };

  const seed = (materialNumber: string, family: string, voltage: string, description: string): MasterCableCatalogItem => ({
    id: `mc-${materialNumber}`,
    itemCode: `${materialNumber}-ITEM`,
    cableCode: materialNumber,
    customerCode: 'N2XS2Y',
    code: `N2XS2Y ${materialNumber}`,
    description,
    voltageClass: family === 'MV' ? 'MV' : 'LV',
    conductor: 'Copper',
    cores: '1',
    crossSectionMm2: 150,
    outerDiameterMm: 32,
    approxWeightKgKm: 1800,
    standardPriceUsdPerM: 88,
    priceConfigured: true,
    status: 'ACTIVE',
    family,
    standard: family === 'MV' ? 'IEC 60502-2' : 'IEC 60502-1',
    authorityFields: {
      family,
      voltage,
      conductor: 'Copper',
      conductorSize: '150',
      cores: '1',
      insulation: 'XLPE',
      screen: 'CWS',
      armour: 'NONE',
      sheath: 'MDPE',
      standard: family === 'MV' ? 'IEC 60502-2' : 'IEC 60502-1',
    },
  });

  before(async () => {
    const health = await checkDatabase();
    assert.equal(health.ok, true, health.error);
    const prisma = getPrisma();
    assert.ok(prisma);
    await prisma.cableMaster.deleteMany({ where: { materialNumber: { in: materials } } });
    await createCable(seed(matLv, 'LV', '0.6/1 kV', 'Cu / XLPE / LSHF 0.6/1 kV 1X150 mm2 IEC 60502-1'), internalActor);
    await createCable(seed(matMv, 'MV', '6/10 kV', 'Cu / XLPE / MDPE 6/10 kV CWs 1X150/25 mm2 IEC 60502-2'), internalActor);
    customerToken = signTestToken(customerActor);
    const app = express();
    app.use('/api/v2/cables', v2CableSearchRouter);
    const listened = await listen(app);
    server = listened.server;
    base = listened.base;
  });

  after(async () => {
    const prisma = getPrisma();
    if (prisma) await prisma.cableMaster.deleteMany({ where: { materialNumber: { in: materials } } });
    await new Promise<void>((resolve) => server.close(() => resolve()));
    await disconnectPrisma();
  });

  const auth = (token: string) => ({ Authorization: `Bearer ${token}` });

  it('requires sign-in', async () => {
    const res = await json(base, '/api/v2/cables/products?page=1&pageSize=25');
    assert.equal(res.status, 401);
  });

  it('lists Cable Master rows with server-side pagination and no costing leak', async () => {
    const res = await json(base, '/api/v2/cables/products?page=1&pageSize=25&q=' + encodeURIComponent(suffix), {
      headers: auth(customerToken),
    });
    assert.equal(res.status, 200);
    assert.equal(res.body.pageSize, 25);
    assert.ok(res.body.total >= 2);
    assert.ok(res.body.cables.length >= 2);
    assert.equal(res.body.searchKind, 'CABLE_MASTER_CATALOG');
    for (const hit of res.body.cables) {
      for (const key of CABLE_SEARCH_FORBIDDEN_RESULT_KEYS) {
        assert.equal(Object.hasOwn(hit, key), false, key);
      }
    }
  });

  it('maps category=MV from family/voltage without rewriting masters', async () => {
    const prisma = getPrisma();
    assert.ok(prisma);
    const before = await prisma.cableMaster.findUnique({ where: { materialNumber: matMv } });
    const res = await json(base, `/api/v2/cables/products?category=MV&q=${encodeURIComponent(suffix)}`, {
      headers: auth(customerToken),
    });
    assert.equal(res.status, 200);
    const ids = res.body.cables.map((c: { materialNumber: string }) => c.materialNumber);
    assert.ok(ids.includes(matMv));
    assert.equal(ids.includes(matLv), false);
    const after = await prisma.cableMaster.findUnique({ where: { materialNumber: matMv } });
    assert.equal(after?.family, before?.family);
    assert.equal(after?.updatedAt.getTime(), before?.updatedAt.getTime());
  });

  it('maps POWER as LV ∪ MV family keys', async () => {
    const res = await json(base, `/api/v2/cables/products?category=POWER&q=${encodeURIComponent(suffix)}`, {
      headers: auth(customerToken),
    });
    assert.equal(res.status, 200);
    const ids = res.body.cables.map((c: { materialNumber: string }) => c.materialNumber);
    assert.ok(ids.includes(matLv));
    assert.ok(ids.includes(matMv));
  });

  it('returns live facets from Cable Master and documents unmapped category field', async () => {
    const res = await json(base, '/api/v2/cables/products/facets', { headers: auth(customerToken) });
    assert.equal(res.status, 200);
    assert.equal(res.body.facets.mapping.productCategoryField, false);
    assert.equal(res.body.facets.mapping.mappedBy, 'family_voltage');
    assert.ok(typeof res.body.facets.mapping.unmappedCount === 'number');
    assert.ok(res.body.facets.voltageClass.includes('MV') || res.body.facets.voltageClass.includes('LV'));
    assert.ok(Array.isArray(res.body.facets.voltage));
  });

  it('exports customer-safe Excel without costing or BOM columns', async () => {
    const res = await fetch(`${base}/api/v2/cables/products/export?q=${encodeURIComponent(suffix)}`, {
      headers: auth(customerToken),
    });
    assert.equal(res.status, 200);
    assert.match(res.headers.get('content-type') || '', /spreadsheetml/);
    const buf = Buffer.from(await res.arrayBuffer());
    assert.ok(buf.length > 20);
    const text = buf.toString('utf8');
    assert.equal(text.includes('unitPriceUsd'), false);
    assert.equal(text.includes('bomDetails'), false);
    assert.equal(text.includes('standardPriceUsdPerM'), false);
  });
});
