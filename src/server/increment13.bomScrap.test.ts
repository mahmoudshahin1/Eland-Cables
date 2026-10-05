import assert from 'node:assert/strict';
import { after, before, describe, it } from 'node:test';
import http from 'node:http';
import express from 'express';
import dotenv from 'dotenv';
import { checkDatabase, disconnectPrisma, getPrisma } from './db';
import { costingAdminRouter } from './costingAdminRoutes';
import { signTestToken } from './auth';
import { executeCostingPreview } from './costingOrchestrationService';

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

describe('Increment 13 — BOM scrap per line', () => {
  let base = '';
  let server: http.Server;
  let adminToken = '';
  let customerToken = '';
  const suffix = `i13bs-${Date.now()}`;
  const testMat = `I13BS-CABLE-${suffix}`;
  const testRm = `I13BS-RM-${suffix}`;

  const actorAdmin = {
    id: 'u-i13bs-admin',
    name: 'I13BS Admin',
    userType: 'internal',
    permissions: { costingPricing: true, masterData: true },
    permissionCodes: [
      'COSTING:FORMULA:VIEW',
      'COSTING:SCRAP_RULE:VIEW',
      'COSTING:SCRAP_RULE:CREATE',
      'COSTING:SCRAP_RULE:UPDATE',
      'COSTING:PREVIEW:EXECUTE',
    ],
  };

  const actorCustomer = { id: 'u-i13bs-cust', name: 'Customer', userType: 'customer', permissions: {}, permissionCodes: [] };

  let governedLineId = '';
  let sourceLineId = '';

  before(async () => {
    const health = await checkDatabase();
    assert.equal(health.ok, true, health.error);
    const prisma = getPrisma()!;

    await prisma.auditEvent.deleteMany({ where: { entityId: { startsWith: 'c' }, message: { contains: testMat } } });
    await prisma.governedBomLine.deleteMany({ where: { cableMaterialNumber: testMat } });
    await prisma.cableBomLine.deleteMany({ where: { cableMaterialNumber: testMat } });
    await prisma.cableMaster.deleteMany({ where: { materialNumber: testMat } });
    await prisma.rawMaterial.deleteMany({ where: { code: testRm } });

    await prisma.rawMaterial.create({
      data: { code: testRm, description: 'BOM scrap test RM', uom: 'kg', priceStatus: 'CONFIGURED' },
    });
    await prisma.cableMaster.create({
      data: {
        materialNumber: testMat,
        itemCode: 'I13BS',
        customerCode: 'TST',
        description: 'BOM scrap test cable',
        diameter: 10,
        weight: 200,
        family: 'LV',
        conductor: 'Copper',
      },
    });

    const governed = await prisma.governedBomLine.create({
      data: {
        cableMaterialNumber: testMat,
        rawMaterialCode: testRm,
        consumption: 12.5,
        uom: 'kg',
        bomVersion: 1,
        status: 'APPROVED',
        approvedBy: 'test',
      },
    });
    governedLineId = governed.id;

    await prisma.cableMaster.create({
      data: {
        materialNumber: `${testMat}-SRC`,
        itemCode: 'I13BS-S',
        customerCode: 'TST',
        description: 'Source-only cable',
        diameter: 10,
        weight: 200,
      },
    });

    const source = await prisma.cableBomLine.create({
      data: {
        cableMaterialNumber: `${testMat}-SRC`,
        rawMaterialCode: testRm,
        consumption: 8,
        uom: 'kg',
        bomVersion: 1,
        status: 'ACTIVE',
      },
    });
    sourceLineId = source.id;

    const app = express();
    app.use(express.json());
    app.use('/api/admin/costing', costingAdminRouter);
    const listening = await listen(app);
    server = listening.server;
    base = listening.base;
    adminToken = signTestToken(actorAdmin);
    customerToken = signTestToken(actorCustomer);
  });

  after(async () => {
    const prisma = getPrisma();
    if (prisma) {
      await prisma.governedBomLine.deleteMany({ where: { cableMaterialNumber: { startsWith: 'I13BS-CABLE' } } });
      await prisma.cableBomLine.deleteMany({ where: { cableMaterialNumber: { startsWith: 'I13BS-CABLE' } } });
      await prisma.cableEngineeringMapping.deleteMany({ where: { materialNumber: { startsWith: 'I13BS-CABLE' } } });
      await prisma.rawMaterialPrice.deleteMany({ where: { rawMaterialCode: testRm } });
      await prisma.cableMaster.deleteMany({ where: { materialNumber: { startsWith: 'I13BS-CABLE' } } });
      await prisma.rawMaterial.deleteMany({ where: { code: testRm } });
    }
    await new Promise<void>((resolve) => server.close(() => resolve()));
    await disconnectPrisma();
  });

  it('lists cables with BOM for costing team', async () => {
    const { status, body } = await json(base, `/api/admin/costing/bom-scrap/cables?search=${encodeURIComponent(testMat)}`, {
      headers: { Authorization: `Bearer ${adminToken}` },
    });
    assert.equal(status, 200);
    const cables = body.cables as { materialNumber: string }[];
    assert.ok(cables.some((c) => c.materialNumber === testMat));
  });

  it('returns governed BOM lines with consumption per km', async () => {
    const { status, body } = await json(
      base,
      `/api/admin/costing/bom-scrap?cable=${encodeURIComponent(testMat)}`,
      { headers: { Authorization: `Bearer ${adminToken}` } }
    );
    assert.equal(status, 200);
    const lines = body.lines as { id: string; consumptionPerKm: number; scrapPercent: number | null }[];
    assert.equal(lines.length, 1);
    assert.equal(lines[0].consumptionPerKm, 12.5);
    assert.equal(lines[0].scrapPercent, null);
  });

  it('updates scrap percent on governed BOM line', async () => {
    const { status, body } = await json(base, '/api/admin/costing/bom-scrap', {
      method: 'PUT',
      headers: { Authorization: `Bearer ${adminToken}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({
        cableMaterialNumber: testMat,
        updates: [{ id: governedLineId, source: 'GOVERNED', scrapPercent: 2.5 }],
      }),
    });
    assert.equal(status, 200);
    const lines = body.lines as { scrapPercent: number | null }[];
    assert.equal(lines[0].scrapPercent, 2.5);

    const prisma = getPrisma()!;
    const row = await prisma.governedBomLine.findUnique({ where: { id: governedLineId } });
    assert.equal(Number(row?.scrapPercentage), 0.025);
  });

  it('creates governed line from source BOM when saving scrap', async () => {
    const srcMat = `${testMat}-SRC`;
    const { status, body } = await json(base, '/api/admin/costing/bom-scrap', {
      method: 'PUT',
      headers: { Authorization: `Bearer ${adminToken}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({
        cableMaterialNumber: srcMat,
        updates: [{ id: sourceLineId, source: 'SOURCE', scrapPercent: 3 }],
      }),
    });
    assert.equal(status, 200);
    const lines = body.lines as { source: string; scrapPercent: number }[];
    assert.equal(lines[0].source, 'GOVERNED');
    assert.equal(lines[0].scrapPercent, 3);
  });

  it('rejects invalid scrap rate', async () => {
    const { status } = await json(base, '/api/admin/costing/bom-scrap', {
      method: 'PUT',
      headers: { Authorization: `Bearer ${adminToken}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({
        cableMaterialNumber: testMat,
        updates: [{ id: governedLineId, source: 'GOVERNED', scrapPercent: 100 }],
      }),
    });
    assert.equal(status, 422);
  });

  it('denies customer from updating BOM scrap', async () => {
    const { status } = await json(base, '/api/admin/costing/bom-scrap', {
      method: 'PUT',
      headers: { Authorization: `Bearer ${customerToken}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({
        cableMaterialNumber: testMat,
        updates: [{ id: governedLineId, source: 'GOVERNED', scrapPercent: 1 }],
      }),
    });
    assert.equal(status, 403);
  });

  it('downloads cable scrap template and imports scrap by metal/family row', async () => {
    const templateRes = await fetch(`${base}/api/admin/costing/bom-scrap/template?metal=CU&family=LV`, {
      headers: { Authorization: `Bearer ${adminToken}` },
    });
    assert.equal(templateRes.status, 200);
    assert.match(templateRes.headers.get('content-type') || '', /spreadsheetml/);

    const preview = await json(base, '/api/admin/costing/bom-scrap/import/preview', {
      method: 'POST',
      headers: { Authorization: `Bearer ${adminToken}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({
        rows: [
          {
            'Specification Code': 'TST',
            'Item Code': 'I13BS',
            'Cable Material Number': testMat,
            Metal: 'CU',
            Family: 'LV',
            'Scrap %': '1.5%',
          },
        ],
      }),
    });
    assert.equal(preview.status, 200);
    assert.equal(preview.body.validCount, 1);

    const commit = await json(base, '/api/admin/costing/bom-scrap/import/commit', {
      method: 'POST',
      headers: { Authorization: `Bearer ${adminToken}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({
        rows: [
          {
            'Cable Material Number': testMat,
            Metal: 'CU',
            Family: 'LV',
            'Scrap %': '1.5%',
          },
        ],
      }),
    });
    assert.equal(commit.status, 200);
    assert.equal(commit.body.updatedCables, 1);

    const bom = await json(base, `/api/admin/costing/bom-scrap?cable=${encodeURIComponent(testMat)}`, {
      headers: { Authorization: `Bearer ${adminToken}` },
    });
    assert.equal(bom.status, 200);
    assert.equal(bom.body.lines[0].scrapPercent, 1.5);
  });

  it('uses BOM line scrap in costing preview when price and mapping exist', async () => {
    const prisma = getPrisma()!;
    await prisma.cableEngineeringMapping.create({
      data: {
        materialNumber: testMat,
        revision: 1,
        isCurrent: true,
        status: 'APPROVED',
        mappingStatus: 'COMPLETE',
        attributes: [],
        approvedBy: 'test',
        approvedAt: new Date(),
      },
    });
    await prisma.rawMaterialPrice.create({
      data: {
        rawMaterialCode: testRm,
        price: 5.5,
        currency: 'LE',
        uom: 'kg',
        workflowStatus: 'APPROVED',
        status: 'ACTIVE',
        isCurrent: true,
        effectiveFrom: new Date('2026-01-01'),
        temporalStatus: 'EFFECTIVE',
      },
    });

    const preview = await executeCostingPreview({
      materialNumber: testMat,
      lengthMeters: 1000,
      quantity: 1,
      currency: 'LE',
      costingDate: '2026-08-22',
      previewOnly: true,
    });
    const breakdown = preview.materialBreakdown || [];
    const line = breakdown.find((l) => l.rawMaterialCode === testRm);
    assert.ok(line, `Expected material line; preview status=${preview.status}`);
    assert.equal(line?.scrapSource, 'BOM_LINE');
    assert.ok(line?.scrapRate != null && line.scrapRate > 0);
  });
});
