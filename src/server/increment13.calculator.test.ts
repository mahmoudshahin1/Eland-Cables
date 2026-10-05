import assert from 'node:assert/strict';
import { after, before, describe, it } from 'node:test';
import http from 'node:http';
import express from 'express';
import dotenv from 'dotenv';
import { checkDatabase, disconnectPrisma } from './db';
import { costingAdminRouter } from './costingAdminRoutes';
import { signTestToken } from './auth';
import { seedCostingRegistry } from './costingFormulaRepository';
import { assertCanExecuteCostingPreview } from './rbac';

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

describe('Increment 13 — Costing Calculator preview API', () => {
  let base = '';
  let server: http.Server;
  let adminToken = '';
  let customerToken = '';

  const actorAdmin = {
    id: 'u-calc-admin',
    name: 'Calc Admin',
    userType: 'internal',
    permissions: { costingPricing: true, masterData: true },
    permissionCodes: [
      'COSTING:FORMULA:VIEW',
      'COSTING:PREVIEW:EXECUTE',
      'COSTING:FORMULA:PREVIEW',
    ],
  };

  const actorCustomer = {
    id: 'u-calc-cust',
    name: 'Customer',
    userType: 'customer',
    permissions: { costingPricing: false },
    permissionCodes: [],
  };

  before(async () => {
    const health = await checkDatabase();
    assert.equal(health.ok, true, health.error);
    await seedCostingRegistry(actorAdmin);

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
    await new Promise<void>((resolve, reject) => server.close((err) => (err ? reject(err) : resolve())));
    await disconnectPrisma();
  });

  it('RBAC: admin can execute calculator preview permission', () => {
    assert.doesNotThrow(() => assertCanExecuteCostingPreview(actorAdmin));
  });

  it('RBAC: customer cannot execute calculator preview', async () => {
    const res = await json(base, '/api/admin/costing/calculator/preview', {
      method: 'POST',
      headers: { Authorization: `Bearer ${customerToken}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({ targetCurrency: 'LE', rows: [] }),
    });
    assert.equal(res.status, 403);
  });

  it('Calculator preview stacks scrap and margin on manual base', async () => {
    const res = await json(base, '/api/admin/costing/calculator/preview', {
      method: 'POST',
      headers: { Authorization: `Bearer ${adminToken}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({
        targetCurrency: 'LE',
        baseAmount: 1000,
        quantity: 1,
        lengthMeters: 1000,
        rows: [
          { parameterType: 'SCRAP', basis: 'PERCENT_OF_BASE', value: 5 },
          { parameterType: 'MARGIN', basis: 'PERCENT_OF_BASE', value: 6 },
        ],
      }),
    });
    assert.equal(res.status, 200);
    assert.equal(res.body.calculator.status, 'READY');
    assert.equal(res.body.calculator.baseAmount, 1000);
    assert.equal(res.body.calculator.lines.length, 2);
    assert.equal(res.body.calculator.calculatorTotal, 1113);
    assert.ok(Array.isArray(res.body.calculator.helpExamples));
  });

  it('Rejects invalid row basis', async () => {
    const res = await json(base, '/api/admin/costing/calculator/preview', {
      method: 'POST',
      headers: { Authorization: `Bearer ${adminToken}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({
        targetCurrency: 'USD',
        rows: [{ parameterType: 'SCRAP', basis: 'INVALID', value: 1 }],
      }),
    });
    assert.equal(res.status, 400);
  });
});
