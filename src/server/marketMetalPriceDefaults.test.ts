import assert from 'node:assert/strict';
import { after, before, describe, it } from 'node:test';
import http from 'node:http';
import express from 'express';
import dotenv from 'dotenv';
import { checkDatabase, disconnectPrisma, getPrisma } from './db';
import { costingAdminRouter } from './costingAdminRoutes';
import { signTestToken } from './auth';
import { createInquiry, getInquiryById, updateInquiry } from './commercialRepository';
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

describe('Market metal price defaults — admin + inquiry create', () => {
  let base = '';
  let server: http.Server;
  let adminToken = '';
  let customerToken = '';
  const createdDefaultIds: string[] = [];
  const createdInquiryIds: string[] = [];

  const actorAdmin = {
    id: 'u-mmpd-admin',
    name: 'Market Metal Admin',
    userType: 'internal',
    permissions: { costingPricing: true, masterData: true, salesQuotations: true },
    permissionCodes: [
      'COSTING:FORMULA:VIEW',
      'COSTING:CONFIGURATION:VIEW',
      'COSTING:CONFIGURATION:CREATE',
      'COSTING:CONFIGURATION:APPROVE',
      'COSTING:AUDIT:VIEW',
      'COMMERCIAL:INQUIRY:MANAGE',
    ],
  };

  const actorCustomer = {
    id: 'u-mmpd-cust',
    name: 'Customer User',
    userType: 'customer',
    permissions: { costingPricing: false },
    permissionCodes: [],
  };

  const salesActor = {
    id: 'u-mmpd-sales',
    name: 'Sales User',
    email: 'sales-mmpd@energya.com',
    userType: 'internal' as const,
    permissions: { salesQuotations: true, masterData: false },
  };

  before(async () => {
    const health = await checkDatabase();
    assert.equal(health.ok, true, health.error);
    const prisma = getPrisma();
    assert.ok(prisma);
    await prisma.marketMetalPriceDefault.deleteMany({
      where: { createdBy: 'Market Metal Admin' },
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
    if (prisma) {
      if (createdInquiryIds.length) {
        await prisma.commercialInquiry.deleteMany({ where: { id: { in: createdInquiryIds } } });
      }
      if (createdDefaultIds.length) {
        await prisma.auditEvent.deleteMany({
          where: { entity: 'MarketMetalPriceDefault', entityId: { in: createdDefaultIds } },
        });
        await prisma.marketMetalPriceDefault.deleteMany({ where: { id: { in: createdDefaultIds } } });
      }
    }
    await new Promise<void>((resolve, reject) => server.close((err) => (err ? reject(err) : resolve())));
    await disconnectPrisma();
  });

  const auth = () => ({ Authorization: `Bearer ${adminToken}`, 'Content-Type': 'application/json' });

  async function activateMetal(metalType: 'COPPER' | 'ALUMINIUM', priceRate: number) {
    const created = await json(base, '/api/admin/costing/market-metal-price-defaults', {
      method: 'POST',
      headers: auth(),
      body: JSON.stringify({
        metalType,
        priceRate,
        effectiveFrom: '2026-01-01',
        notes: `test ${metalType}`,
      }),
    });
    assert.equal(created.status, 201, JSON.stringify(created.body));
    createdDefaultIds.push(created.body.default.id);
    const activated = await json(base, `/api/admin/costing/market-metal-price-defaults/${created.body.default.id}/actions`, {
      method: 'POST',
      headers: auth(),
      body: JSON.stringify({ action: 'ACTIVATE' }),
    });
    assert.equal(activated.status, 200, JSON.stringify(activated.body));
    return activated.body.default;
  }

  it('customer cannot access market metal price defaults', async () => {
    assert.throws(() => assertCanViewCostingFormulas(actorCustomer), DomainError);
    const res = await json(base, '/api/admin/costing/market-metal-price-defaults', {
      headers: { Authorization: `Bearer ${customerToken}` },
    });
    assert.equal(res.status, 403);
  });

  it('1-2 GET active copper and aluminium defaults', async () => {
    await activateMetal('COPPER', 14600);
    await activateMetal('ALUMINIUM', 3300);
    const active = await json(base, '/api/admin/costing/market-metal-price-defaults/active', { headers: auth() });
    assert.equal(active.status, 200, JSON.stringify(active.body));
    assert.equal(active.body.copper.priceRate, 14600);
    assert.equal(active.body.aluminium.priceRate, 3300);
    assert.equal(active.body.copper.priceUom, 'USD/MT');
  });

  it('3-4 new inquiry does not inherit an arbitrary system default', async () => {
    const inquiry = await createInquiry(
      {
        customerName: 'MMPD Inherit',
        currency: 'USD',
        commercialMetadata: {},
      },
      salesActor as never
    );
    createdInquiryIds.push(inquiry.id);
    const meta = (inquiry.commercialMetadata || {}) as Record<string, unknown>;
    assert.equal(meta.copperPriceRate, undefined);
    assert.equal(meta.aluminiumPriceRate, undefined);
    assert.notEqual(meta.copperPriceRate, 14600);
    assert.notEqual(meta.aluminiumPriceRate, 3300);
  });

  it('5 existing inquiry snapshot is unchanged when the system default changes', async () => {
    const inquiry = await createInquiry(
      {
        customerName: 'MMPD Freeze',
        currency: 'USD',
        commercialMetadata: { copperPriceRate: 14100, aluminiumPriceRate: 3100 },
      },
      salesActor as never
    );
    createdInquiryIds.push(inquiry.id);
    const before = (inquiry.commercialMetadata || {}) as Record<string, unknown>;
    assert.equal(before.copperPriceRate, 14100);

    const next = await activateMetal('COPPER', 15500);
    assert.equal(Number(next.priceRate), 15500);

    const reloaded = await getInquiryById(inquiry.id);
    const after = (reloaded!.commercialMetadata || {}) as Record<string, unknown>;
    assert.equal(after.copperPriceRate, 14100);
    assert.equal(after.copperPriceSource, 'INQUIRY_OVERRIDE');
  });

  it('6 header override stays on the inquiry and is not replaced by the system default', async () => {
    const inquiry = await createInquiry(
      {
        customerName: 'MMPD Override',
        currency: 'USD',
        commercialMetadata: { copperPriceRate: 14600, aluminiumPriceRate: 3300 },
      },
      salesActor as never
    );
    createdInquiryIds.push(inquiry.id);
    const updated = await updateInquiry(
      inquiry.id,
      { commercialMetadata: { copperPriceRate: 16000, aluminiumPriceRate: 3300 } },
      salesActor as never
    );
    const meta = (updated.commercialMetadata || {}) as Record<string, unknown>;
    assert.equal(meta.copperPriceRate, 16000);
    assert.equal(meta.copperPriceSource, 'INQUIRY_OVERRIDE');
    assert.notEqual(meta.copperPriceRate, 15500);
  });

  it('writes CREATED/ACTIVATED audit for market metal defaults', async () => {
    const created = await json(base, '/api/admin/costing/market-metal-price-defaults', {
      method: 'POST',
      headers: auth(),
      body: JSON.stringify({
        metalType: 'ALUMINIUM',
        priceRate: 3400,
        effectiveFrom: '2026-06-01',
      }),
    });
    assert.equal(created.status, 201);
    createdDefaultIds.push(created.body.default.id);
    const audit = await json(base, `/api/admin/costing/market-metal-price-defaults/${created.body.default.id}/audit`, {
      headers: auth(),
    });
    assert.equal(audit.status, 200);
    assert.ok((audit.body.events || []).some((e: { action: string }) => e.action === 'CREATED'));
  });
});
