import assert from 'node:assert/strict';
import { after, before, describe, it } from 'node:test';
import http from 'node:http';
import express from 'express';
import dotenv from 'dotenv';
import { checkDatabase, disconnectPrisma, getPrisma } from './db';
import { createCable } from './masterDataRepository';
import { CABLE_SEARCH_FORBIDDEN_RESULT_KEYS } from '../domain/v2AdvancedCableSearch';
import { v2CableSearchRouter } from './v2CableSearchRoutes';
import { masterDataRouter } from './masterDataRoutes';
import { technicalOfficeRouter } from './cableAuthorityRoutes';
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
  return { status: res.status, body };
}

describe('V2 Advanced Cable Search', () => {
  let base = '';
  let server: http.Server;
  let internalToken = '';
  let customerToken = '';
  const suffix = `ACS-${String(Date.now()).replace(/99/g, '88')}`;
  const matA = `${suffix}-A`;
  const matB = `${suffix}-B`;
  const matC = `${suffix}-C`;
  const materials = [matA, matB, matC];

  const internalActor = {
    id: 'u-acs-internal',
    name: 'ACS Internal',
    email: 'acs.internal@energya.com',
    userType: 'internal' as const,
    permissions: { masterData: true, technicalOffice: true },
  };
  const customerActor = {
    id: 'u-acs-customer',
    name: 'ACS Customer',
    email: 'acs.customer@example.com',
    userType: 'customer' as const,
    customerId: 'c-acs',
    permissions: { masterData: false, costingPricing: false, technicalOffice: false },
  };

  const seed = (
    materialNumber: string,
    itemCode: string,
    fields: {
      family: string;
      voltage: string;
      conductor: string;
      standard: string;
      insulation: string;
      description: string;
    }
  ): MasterCableCatalogItem => ({
    id: `mc-${materialNumber}`,
    itemCode,
    cableCode: materialNumber,
    customerCode: 'N2XH',
    code: `N2XH ${materialNumber}`,
    description: fields.description,
    voltageClass: 'LV',
    conductor: fields.conductor === 'Aluminum' ? 'Aluminum' : 'Copper',
    cores: '1C',
    crossSectionMm2: 16,
    outerDiameterMm: 10.9,
    approxWeightKgKm: 268,
    standardPriceUsdPerM: 99,
    priceConfigured: true,
    status: 'ACTIVE',
    family: fields.family,
    insulation: fields.insulation,
    screen: 'Unscreened',
    armour: 'Unarmoured',
    sheath: 'LSZH',
    standard: fields.standard,
    authorityFields: {
      family: fields.family,
      voltage: fields.voltage,
      conductor: fields.conductor,
      conductorSize: '16',
      cores: '1C',
      insulation: fields.insulation,
      screen: 'Unscreened',
      armour: 'Unarmoured',
      sheath: 'LSZH',
      standard: fields.standard,
    },
  });

  before(async () => {
    const health = await checkDatabase();
    assert.equal(health.ok, true, health.error);
    const prisma = getPrisma();
    assert.ok(prisma);
    await prisma.cableMaster.deleteMany({ where: { materialNumber: { startsWith: suffix } } });
    await createCable(
      seed(matA, `${suffix}-ITEM-A`, {
        family: 'UGC',
        voltage: '0.6/1 kV',
        conductor: 'Copper',
        standard: 'IEC 60502-1',
        insulation: 'XLPE',
        description: 'ACS copper LV 0.6/1 kV test cable A',
      }),
      internalActor
    );
    await createCable(
      seed(matB, `${suffix}-ITEM-B`, {
        family: 'MV',
        voltage: '6/10 kV',
        conductor: 'Aluminum',
        standard: 'IEC 60502-2',
        insulation: 'EPR',
        description: 'ACS aluminium MV 6/10 kV test cable B',
      }),
      internalActor
    );
    await createCable(
      seed(matC, `${suffix}-ITEM-C`, {
        family: 'UGC',
        voltage: '0.6/1 kV',
        conductor: 'Copper',
        standard: 'IEC 60502-1',
        insulation: 'XLPE',
        description: 'ACS copper LV 0.6/1 kV test cable C',
      }),
      internalActor
    );

    const app = express();
    app.use(express.json());
    app.use('/api/v2/cables', v2CableSearchRouter);
    app.use('/api/master', masterDataRouter);
    app.use('/api/technical-office', technicalOfficeRouter);
    const listening = await listen(app);
    server = listening.server;
    base = listening.base;
    internalToken = signTestToken(internalActor);
    customerToken = signTestToken(customerActor);
  });

  after(async () => {
    const prisma = getPrisma();
    if (prisma) {
      await prisma.technicalOfficeRequest.deleteMany({
        where: { requesterId: { in: [internalActor.id, customerActor.id] } },
      });
      await prisma.cableMaster.deleteMany({ where: { materialNumber: { in: materials } } });
    }
    await new Promise<void>((resolve, reject) => server.close((err) => (err ? reject(err) : resolve())));
    await disconnectPrisma();
  });

  function auth(token: string) {
    return { Authorization: `Bearer ${token}` };
  }

  it('requires sign-in', async () => {
    const res = await json(base, '/api/v2/cables/search?materialNumber=x');
    assert.equal(res.status, 401);
  });

  it('finds an exact Material Number', async () => {
    const res = await json(
      base,
      `/api/v2/cables/search?matchMode=exact&materialNumber=${encodeURIComponent(matA)}`,
      { headers: auth(customerToken) }
    );
    assert.equal(res.status, 200);
    assert.equal(res.body.total, 1);
    assert.equal(res.body.cables[0].materialNumber, matA);
    assert.equal(res.body.searchKind, 'CABLE_MASTER_DISCOVERY');
    assert.equal(res.body.compatibilityInferred, false);
  });

  it('finds an Item Code', async () => {
    const res = await json(
      base,
      `/api/v2/cables/search?matchMode=exact&itemCode=${encodeURIComponent(`${suffix}-ITEM-B`)}`,
      { headers: auth(internalToken) }
    );
    assert.equal(res.status, 200);
    assert.equal(res.body.cables[0].materialNumber, matB);
  });

  it('filters by family', async () => {
    const res = await json(
      base,
      `/api/v2/cables/search?family=MV&q=${encodeURIComponent(suffix)}`,
      { headers: auth(customerToken) }
    );
    assert.equal(res.status, 200);
    assert.ok(res.body.cables.some((c: { materialNumber: string }) => c.materialNumber === matB));
    assert.ok(res.body.cables.every((c: { family: string }) => c.family === 'MV'));
  });

  it('filters by voltage', async () => {
    const res = await json(
      base,
      `/api/v2/cables/search?voltage=${encodeURIComponent('6/10')}&q=${encodeURIComponent(suffix)}`,
      { headers: auth(customerToken) }
    );
    assert.equal(res.status, 200);
    assert.ok(res.body.cables.some((c: { materialNumber: string }) => c.materialNumber === matB));
  });

  it('filters by standard', async () => {
    const res = await json(
      base,
      `/api/v2/cables/search?standard=${encodeURIComponent('60502-2')}&q=${encodeURIComponent(suffix)}`,
      { headers: auth(customerToken) }
    );
    assert.equal(res.status, 200);
    assert.ok(res.body.cables.some((c: { materialNumber: string }) => c.materialNumber === matB));
  });

  it('filters by conductor', async () => {
    const res = await json(
      base,
      `/api/v2/cables/search?conductor=Aluminum&q=${encodeURIComponent(suffix)}`,
      { headers: auth(customerToken) }
    );
    assert.equal(res.status, 200);
    assert.ok(res.body.cables.some((c: { materialNumber: string }) => c.materialNumber === matB));
  });

  it('applies multiple filters', async () => {
    const res = await json(
      base,
      `/api/v2/cables/search?family=UGC&conductor=Copper&standard=${encodeURIComponent('IEC 60502-1')}&q=${encodeURIComponent(suffix)}`,
      { headers: auth(customerToken) }
    );
    assert.equal(res.status, 200);
    const ids = res.body.cables.map((c: { materialNumber: string }) => c.materialNumber);
    assert.ok(ids.includes(matA));
    assert.ok(ids.includes(matC));
    assert.ok(!ids.includes(matB));
  });

  it('returns no result for an unknown construction', async () => {
    const res = await json(base, `/api/v2/cables/search?matchMode=exact&materialNumber=ZZZ-NO-SUCH-CABLE`, {
      headers: auth(customerToken),
    });
    assert.equal(res.status, 200);
    assert.equal(res.body.total, 0);
    assert.deepEqual(res.body.cables, []);
  });

  it('paginates server-side', async () => {
    const page1 = await json(
      base,
      `/api/v2/cables/search?matchMode=exact&family=UGC&page=1&pageSize=1&sortBy=materialNumber&sortDir=asc`,
      { headers: auth(customerToken) }
    );
    const page2 = await json(
      base,
      `/api/v2/cables/search?matchMode=exact&family=UGC&page=2&pageSize=1&sortBy=materialNumber&sortDir=asc`,
      { headers: auth(customerToken) }
    );
    assert.equal(page1.status, 200);
    assert.equal(page2.status, 200);
    assert.ok(page1.body.total >= 2);
    assert.equal(page1.body.cables.length, 1);
    assert.equal(page2.body.cables.length, 1);
    assert.notEqual(page1.body.cables[0].materialNumber, page2.body.cables[0].materialNumber);
  });

  it('normalizes search input without rewriting stored values', async () => {
    const prisma = getPrisma();
    assert.ok(prisma);
    const before = await prisma.cableMaster.findUnique({ where: { materialNumber: matA } });
    const res = await json(
      base,
      `/api/v2/cables/search?matchMode=exact&materialNumber=${encodeURIComponent(`  ${matA.toLowerCase()}  `)}`,
      { headers: auth(customerToken) }
    );
    assert.equal(res.status, 200);
    assert.equal(res.body.total, 1);
    assert.equal(res.body.cables[0].materialNumber, matA);
    const after = await prisma.cableMaster.findUnique({ where: { materialNumber: matA } });
    assert.equal(after?.updatedAt.getTime(), before?.updatedAt.getTime());
    assert.equal(after?.description, before?.description);
  });

  it('does not leak costing or price fields', async () => {
    const res = await json(base, `/api/v2/cables/search?matchMode=exact&materialNumber=${matA}`, {
      headers: auth(customerToken),
    });
    assert.equal(res.status, 200);
    const hit = res.body.cables[0];
    for (const key of CABLE_SEARCH_FORBIDDEN_RESULT_KEYS) {
      assert.equal(Object.hasOwn(hit, key), false, key);
    }
    assert.equal(JSON.stringify(hit).includes('99'), false);
  });

  it('POST search is read-only 405 and does not create a Material Number', async () => {
    const prisma = getPrisma();
    assert.ok(prisma);
    const before = await prisma.cableMaster.count({ where: { materialNumber: { startsWith: suffix } } });
    const res = await json(base, '/api/v2/cables/search', {
      method: 'POST',
      headers: { ...auth(customerToken), 'Content-Type': 'application/json' },
      body: JSON.stringify({ materialNumber: `${suffix}-NEW`, itemCode: 'FAKE', customerCode: 'N2XH', description: 'should not create' }),
    });
    assert.equal(res.status, 405);
    const after = await prisma.cableMaster.count({ where: { materialNumber: { startsWith: suffix } } });
    assert.equal(after, before);
    const created = await prisma.cableMaster.findUnique({ where: { materialNumber: `${suffix}-NEW` } });
    assert.equal(created, null);
  });

  it('customer cannot create Cable Master records', async () => {
    const prisma = getPrisma();
    assert.ok(prisma);
    const res = await json(base, '/api/master/cables', {
      method: 'POST',
      headers: { ...auth(customerToken), 'Content-Type': 'application/json' },
      body: JSON.stringify({
        cableCode: `${suffix}-STOLEN`,
        itemCode: 'STOLEN',
        customerCode: 'N2XH',
        description: 'should be forbidden',
        outerDiameterMm: 10,
        approxWeightKgKm: 100,
      }),
    });
    assert.equal(res.status, 403);
    const stolen = await prisma.cableMaster.findUnique({ where: { materialNumber: `${suffix}-STOLEN` } });
    assert.equal(stolen, null);
  });

  it('internal users can search the same catalog', async () => {
    const res = await json(base, `/api/v2/cables/search?matchMode=exact&materialNumber=${matA}`, {
      headers: auth(internalToken),
    });
    assert.equal(res.status, 200);
    assert.equal(res.body.actorKind, 'internal');
    assert.equal(res.body.cables[0].itemCode, `${suffix}-ITEM-A`);
  });

  it('customer can request Technical Office review and cannot list TO queues', async () => {
    const created = await json(base, '/api/technical-office/requests', {
      method: 'POST',
      headers: { ...auth(customerToken), 'Content-Type': 'application/json' },
      body: JSON.stringify({
        reason: 'Required cable was not found in the existing Cable Master.',
        configuration: { kind: 'ADVANCED_CABLE_SEARCH_NO_MATCH', filters: { materialNumber: 'ZZZ' } },
        status: 'Submitted',
      }),
    });
    assert.equal(created.status, 201);
    assert.ok(created.body.request?.requestNumber);
    const list = await json(base, '/api/technical-office/requests', { headers: auth(customerToken) });
    assert.equal(list.status, 403);
  });
});
