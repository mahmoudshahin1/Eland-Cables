import assert from 'node:assert/strict';
import { after, before, describe, it } from 'node:test';
import http from 'node:http';
import express from 'express';
import dotenv from 'dotenv';
import { checkDatabase, disconnectPrisma, getPrisma } from './db';
import { costingAdminRouter } from './costingAdminRoutes';
import { signTestToken } from './auth';
import { calculateCableManufacturingCost, CostingContext, CostingRequest } from '../domain/costingEngine';
import { DomainError } from '../platform/errors/domainError';
import { assertCanViewCostingFormulas } from './rbac';

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

describe('Metal Cost Components master data', () => {
  let base = '';
  let server: http.Server;
  let adminToken = '';
  let customerToken = '';
  const createdIds: string[] = [];

  const actorAdmin = {
    id: 'u-mcc-admin',
    name: 'MCC Admin',
    userType: 'internal',
    permissions: { costingPricing: true, masterData: true },
    permissionCodes: [
      'COSTING:FORMULA:VIEW',
      'COSTING:CONFIGURATION:VIEW',
      'COSTING:CONFIGURATION:CREATE',
      'COSTING:CONFIGURATION:APPROVE',
      'COSTING:AUDIT:VIEW',
    ],
  };

  const actorCustomer = {
    id: 'u-mcc-cust',
    name: 'Customer User',
    userType: 'customer',
    permissions: { costingPricing: false },
    permissionCodes: [],
  };

  before(async () => {
    const health = await checkDatabase();
    assert.equal(health.ok, true, health.error);
    const prisma = getPrisma();
    assert.ok(prisma);
    await prisma.costingCurrency.upsert({
      where: { code: 'USD' },
      update: { status: 'ACTIVE', name: 'US Dollar' },
      create: { code: 'USD', name: 'US Dollar', symbol: '$', status: 'ACTIVE' },
    });
    await prisma.costingMetalCostComponent.deleteMany({
      where: { createdBy: 'MCC Admin' },
    });
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
    if (prisma && createdIds.length) {
      await prisma.auditEvent.deleteMany({
        where: { entity: 'CostingMetalCostComponent', entityId: { in: createdIds } },
      });
      await prisma.costingMetalCostComponent.deleteMany({ where: { id: { in: createdIds } } });
    }
    await new Promise<void>((resolve, reject) => server.close((err) => (err ? reject(err) : resolve())));
    await disconnectPrisma();
  });

  const auth = () => ({ Authorization: `Bearer ${adminToken}`, 'Content-Type': 'application/json' });

  it('customer cannot access metal cost components', async () => {
    assert.throws(() => assertCanViewCostingFormulas(actorCustomer), DomainError);
    const res = await json(base, '/api/admin/costing/metal-cost-components', {
      headers: { Authorization: `Bearer ${customerToken}` },
    });
    assert.equal(res.status, 403);
  });

  it('creates a Draft component and writes CREATED audit', async () => {
    const res = await json(base, '/api/admin/costing/metal-cost-components', {
      method: 'POST',
      headers: auth(),
      body: JSON.stringify({
        metal: 'COPPER',
        componentType: 'PREMIUM',
        value: 555,
        currency: 'USD',
        priceBasis: 'MT',
        effectiveFrom: '2026-09-01',
        reference: 'Copper premium - supplier reference',
      }),
    });
    assert.equal(res.status, 201, JSON.stringify(res.body));
    assert.equal(res.body.component.status, 'DRAFT');
    createdIds.push(res.body.component.id);
    const audit = await json(base, `/api/admin/costing/metal-cost-components/${res.body.component.id}/audit`, {
      headers: auth(),
    });
    assert.equal(audit.status, 200);
    assert.ok((audit.body.events || []).some((e: { action: string }) => e.action === 'CREATED'));
  });

  it('rejects negative values and invalid dates', async () => {
    const neg = await json(base, '/api/admin/costing/metal-cost-components', {
      method: 'POST',
      headers: auth(),
      body: JSON.stringify({
        metal: 'COPPER',
        componentType: 'SHIPPING',
        value: -5,
        currency: 'USD',
        priceBasis: 'MT',
        effectiveFrom: '2026-09-01',
      }),
    });
    assert.equal(neg.status, 422);
    const dates = await json(base, '/api/admin/costing/metal-cost-components', {
      method: 'POST',
      headers: auth(),
      body: JSON.stringify({
        metal: 'COPPER',
        componentType: 'CLEARANCE',
        value: 10,
        currency: 'USD',
        priceBasis: 'KG',
        effectiveFrom: '2026-10-01',
        effectiveTo: '2026-09-01',
      }),
    });
    assert.equal(dates.status, 422);
  });

  it('rejects inactive currency', async () => {
    const prisma = getPrisma()!;
    await prisma.costingCurrency.upsert({
      where: { code: 'MCCZZ' },
      update: { status: 'INACTIVE', name: 'Inactive Test' },
      create: { code: 'MCCZZ', name: 'Inactive Test', status: 'INACTIVE' },
    });
    const res = await json(base, '/api/admin/costing/metal-cost-components', {
      method: 'POST',
      headers: auth(),
      body: JSON.stringify({
        metal: 'ALUMINIUM',
        componentType: 'PREMIUM',
        value: 12,
        currency: 'MCCZZ',
        priceBasis: 'MT',
        effectiveFrom: '2026-09-01',
      }),
    });
    assert.equal(res.status, 422);
  });

  it('activates, then blocks overlapping active duplicate, then deactivates', async () => {
    const first = await json(base, '/api/admin/costing/metal-cost-components', {
      method: 'POST',
      headers: auth(),
      body: JSON.stringify({
        metal: 'ALUMINIUM',
        componentType: 'SHIPPING',
        value: 20,
        currency: 'USD',
        priceBasis: 'MT',
        effectiveFrom: '2026-01-01',
        effectiveTo: '2026-12-31',
      }),
    });
    assert.equal(first.status, 201, JSON.stringify(first.body));
    createdIds.push(first.body.component.id);
    const activated = await json(base, `/api/admin/costing/metal-cost-components/${first.body.component.id}/actions`, {
      method: 'POST',
      headers: auth(),
      body: JSON.stringify({ action: 'ACTIVATE' }),
    });
    assert.equal(activated.status, 200, JSON.stringify(activated.body));
    assert.equal(activated.body.component.status, 'ACTIVE');

    const overlap = await json(base, '/api/admin/costing/metal-cost-components', {
      method: 'POST',
      headers: auth(),
      body: JSON.stringify({
        metal: 'ALUMINIUM',
        componentType: 'SHIPPING',
        value: 99,
        currency: 'USD',
        priceBasis: 'MT',
        effectiveFrom: '2026-06-01',
        status: 'ACTIVE',
      }),
    });
    assert.equal(overlap.status, 422);
    assert.equal(overlap.body.code, 'OVERLAPPING_ACTIVE_PERIOD');

    const deactivated = await json(base, `/api/admin/costing/metal-cost-components/${first.body.component.id}/actions`, {
      method: 'POST',
      headers: auth(),
      body: JSON.stringify({ action: 'DEACTIVATE' }),
    });
    assert.equal(deactivated.status, 200);
    assert.equal(deactivated.body.component.status, 'INACTIVE');
    const audit = await json(base, `/api/admin/costing/metal-cost-components/${first.body.component.id}/audit`, {
      headers: auth(),
    });
    const actions = (audit.body.events || []).map((e: { action: string }) => e.action);
    assert.ok(actions.includes('ACTIVATED'));
    assert.ok(actions.includes('DEACTIVATED'));
  });

  it('bulk upload validates and commits Draft only', async () => {
    const bad = await json(base, '/api/admin/costing/bulk-import/preview', {
      method: 'POST',
      headers: auth(),
      body: JSON.stringify({
        kind: 'metal_cost_components',
        sourceFile: 'mcc.xlsx',
        rows: [{ Metal: 'COPPER', 'Component Type': 'PREMIUM', Value: -3, Currency: 'USD', 'Price Basis': 'MT', 'Effective From': '2026-09-01' }],
      }),
    });
    assert.equal(bad.status, 200);
    assert.ok(bad.body.batch.errorCount >= 1);

    const good = await json(base, '/api/admin/costing/bulk-import/commit', {
      method: 'POST',
      headers: auth(),
      body: JSON.stringify({
        kind: 'metal_cost_components',
        sourceFile: 'mcc.xlsx',
        rows: [
          {
            Metal: 'COPPER',
            'Component Type': 'CLEARANCE',
            Value: 15,
            Currency: 'USD',
            'Price Basis': 'MT',
            'Effective From': '2026-09-01',
            Status: 'ACTIVE',
            Reference: 'bulk',
            Notes: 'must stay draft',
          },
        ],
      }),
    });
    assert.equal(good.status, 200, JSON.stringify(good.body));
    const created = good.body.result.created[0];
    createdIds.push(created.id);
    assert.equal(created.status, 'DRAFT');
  });

  it('existing costing result is unchanged when Premium/Shipping/Clearance records exist', () => {
    const req: CostingRequest = {
      materialNumber: '10009487',
      costingDate: new Date('2026-08-20'),
      quantity: 1,
      lengthMeters: 1000,
      currency: 'USD',
    };
    const context: CostingContext = {
      cable: { materialNumber: '10009487', description: 'Test Cable' },
      engineeringMapping: {
        status: 'APPROVED',
        revision: 1,
        family: 'LV',
        voltage: '600/1000V',
        conductor: 'Copper',
        conductorSize: '16',
        cores: '1',
        insulation: 'XLPE',
      },
      governedBomLines: [
        {
          rawMaterialCode: 'CR01',
          rawMaterialDesc: 'Copper Rod',
          consumption: 135.23,
          uom: 'kg',
          bomVersion: 1,
          status: 'APPROVED',
        },
      ],
      sourceBomLines: [],
      bomConflicts: [],
      rawMaterials: new Map([['CR01', { code: 'CR01', description: 'Copper Rod', uom: 'kg' }]]),
      approvedPrices: [
        {
          id: 'PR-CR01-01',
          rawMaterialCode: 'CR01',
          price: 9.5,
          currency: 'USD',
          uom: 'kg',
          effectiveFrom: new Date('2026-01-01'),
          effectiveTo: new Date('2026-12-31'),
          supplier: 'LME',
          source: 'Index',
          priceBasis: 'PER_KG',
          workflowStatus: 'APPROVED',
          isCurrent: true,
          revision: 1,
        },
      ],
    };
    const result = calculateCableManufacturingCost(req, context);
    assert.equal(result.materialCost, 1284.69);
  });
});
