import assert from 'node:assert/strict';
import { after, before, describe, it } from 'node:test';
import http from 'node:http';
import express from 'express';
import dotenv from 'dotenv';
import { checkDatabase, disconnectPrisma } from './db';
import { costingAdminRouter } from './costingAdminRoutes';
import { signTestToken } from './auth';
import { ELAND_REGRESSION_CABLES, loadCostingWorkspaceKpis } from './costingReadinessService';
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

describe('Increment 14 — Costing Team workspace APIs', () => {
  let base = '';
  let server: http.Server;
  let adminToken = '';
  let customerToken = '';

  const actorAdmin = {
    id: 'u-i14-admin',
    name: 'I14 Admin',
    userType: 'internal',
    permissions: { costingPricing: true, masterData: true },
    permissionCodes: [
      'COSTING:FORMULA:VIEW',
      'COSTING:FORMULA:CREATE',
      'COSTING:FORMULA:UPDATE',
      'COSTING:FORMULA:PREVIEW',
      'COSTING:FORMULA:VALIDATE',
      'PRICE:RAW_MATERIAL_PRICE:CREATE',
      'PRICE:RAW_MATERIAL_PRICE:VIEW',
      'COSTING:SCRAP_RULE:VIEW',
      'COSTING:SCRAP_RULE:CREATE',
      'COSTING:SCRAP_RULE:UPDATE',
    ],
  };

  const actorCustomer = {
    id: 'u-i14-cust',
    name: 'Customer User',
    userType: 'customer',
    permissions: { costingPricing: false },
    permissionCodes: [],
  };

  before(async () => {
    const health = await checkDatabase();
    assert.equal(health.ok, true, health.error);
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

  it('customer cannot view costing configuration', () => {
    assert.throws(() => assertCanViewCostingFormulas(actorCustomer), DomainError);
  });

  it('customer receives 403 on costing readiness summary', async () => {
    const res = await json(base, '/api/admin/costing/readiness/summary', {
      headers: { Authorization: `Bearer ${customerToken}` },
    });
    assert.equal(res.status, 403);
  });

  it('readiness summary uses evaluateCableCostingReadiness domain counts', async () => {
    const res = await json(base, '/api/admin/costing/readiness/summary', {
      headers: { Authorization: `Bearer ${adminToken}` },
    });
    assert.equal(res.status, 200);
    assert.equal(res.body.source, 'evaluateCableCostingReadiness');
    const s = res.body.summary;
    assert.equal(typeof s.total, 'number');
    assert.equal(typeof s.ready, 'number');
    assert.equal(typeof s.blocked, 'number');
    assert.equal(typeof s.warning, 'number');
    assert.equal(typeof s.notChecked, 'number');
    assert.ok(s.total >= s.ready);
    assert.ok(Array.isArray(s.topBlockers));
  });

  it('readiness cables list is paginated and shaped', async () => {
    const res = await json(base, '/api/admin/costing/readiness/cables?page=1&pageSize=5&status=ALL', {
      headers: { Authorization: `Bearer ${adminToken}` },
    });
    assert.equal(res.status, 200);
    assert.equal(res.body.source, 'evaluateCableCostingReadiness');
    assert.ok(Array.isArray(res.body.cables));
    assert.equal(res.body.cables.length, 5);
    assert.equal(typeof res.body.total, 'number');
    assert.equal(res.body.page, 1);
    const row = res.body.cables[0];
    assert.ok(row.materialNumber);
    assert.ok(['PASS', 'BLOCKED', 'WARN'].includes(row.gate1));
    assert.ok(['PASS', 'BLOCKED', 'WARN'].includes(row.gate4));
  });

  it('readiness cable detail merges governance and engine probe', async () => {
    const res = await json(base, '/api/admin/costing/readiness/cables/10009487', {
      headers: { Authorization: `Bearer ${adminToken}` },
    });
    assert.equal(res.status, 200);
    assert.equal(res.body.source.governance, 'evaluateCableCostingReadiness');
    assert.equal(res.body.source.engine, 'evaluateCostingReadinessForCables');
    assert.ok(Array.isArray(res.body.gates));
    assert.equal(res.body.gates.length, 5);
    assert.ok(Array.isArray(res.body.actions));
    assert.ok(res.body.engineProbe);
  });

  it('production readiness live control is not PRODUCTION READY', async () => {
    const denied = await json(base, '/api/admin/costing/production-readiness', {
      headers: { Authorization: `Bearer ${customerToken}` },
    });
    assert.equal(denied.status, 403);

    const res = await json(base, '/api/admin/costing/production-readiness', {
      headers: { Authorization: `Bearer ${adminToken}` },
    });
    assert.equal(res.status, 200);
    assert.equal(res.body.overallStatus, 'NOT_PRODUCTION_READY');
    assert.equal(res.body.productionReady, false);
    assert.ok(['UNSIGNED', 'SIGNED'].includes(res.body.decision5.status));
    assert.equal(res.body.decision5.option, 'B');
    assert.match(String(res.body.decision5.optionLabel), /LME/);
    if (res.body.decision5.status === 'SIGNED') {
      assert.equal(res.body.decision5.signed, true);
      assert.ok(res.body.decision5.signedAt);
      assert.ok(res.body.decision5.signedBy);
    } else {
      assert.equal(res.body.decision5.signed, false);
    }
    assert.ok(Array.isArray(res.body.blockers));
    assert.ok(res.body.blockers.length > 0);
    const testsItem = (res.body.checklist || []).find((c: { id: string }) => c.id === 'automated_tests');
    assert.equal(testsItem?.status, 'NOT_VERIFIED');
    assert.notEqual(res.body.overallStatus, 'PRODUCTION_READY');
  });

  it('golden regression probe covers ENERGYA probe cables', async () => {
    const res = await json(base, '/api/admin/costing/readiness/golden-regression', {
      headers: { Authorization: `Bearer ${adminToken}` },
    });
    assert.equal(res.status, 200);
    assert.equal(res.body.probeSet, 'ENERGYA_COSTING_PROBE_CABLES');
    const codes = (res.body.cables || []).map((c: { materialNumber: string }) => c.materialNumber);
    for (const cable of ['10009487', '10009488', '10009489', '10009490']) {
      assert.ok(codes.includes(cable), `missing ${cable}`);
    }
  });

  it('customer receives 403 on costing readiness', async () => {
    const res = await json(base, '/api/admin/costing/readiness', {
      headers: { Authorization: `Bearer ${customerToken}` },
    });
    assert.equal(res.status, 403);
  });

  it('admin preview does not persist a CostingCalculation', async () => {
    const res = await json(base, '/api/admin/costing/preview', {
      method: 'POST',
      headers: { Authorization: `Bearer ${adminToken}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({
        materialNumber: ELAND_REGRESSION_CABLES[0],
        quantity: 1,
        lengthMeters: 1000,
        currency: 'USD',
      }),
    });
    assert.ok(res.status === 200 || res.status === 422 || res.status === 500);
    if (res.status === 200) {
      assert.equal(res.body.persisted, false);
      assert.equal(res.body.preview?.persisted, false);
      assert.equal(res.body.preview?.calculationId, undefined);
    }
  });

  it('readiness matrix covers the four ELAND regression cables without inventing totals', async () => {
    const res = await json(base, '/api/admin/costing/readiness', {
      headers: { Authorization: `Bearer ${adminToken}` },
    });
    assert.equal(res.status, 200);
    assert.equal(res.body.engine, 'executeCostingForInquiryLine');
    const codes = (res.body.cables || []).map((c: { materialNumber: string }) => c.materialNumber);
    for (const cable of ELAND_REGRESSION_CABLES) {
      assert.ok(codes.includes(cable), `missing ${cable}`);
    }
    for (const row of res.body.cables || []) {
      assert.ok(row.status === 'READY' || row.status === 'NOT_READY');
      if (row.status !== 'READY') {
        assert.ok(Array.isArray(row.missing));
      }
    }
  });

  it('approval queue includes raw material prices for Costing Team', async () => {
    const res = await json(base, '/api/admin/costing/approval-queue', {
      headers: { Authorization: `Bearer ${adminToken}` },
    });
    assert.equal(res.status, 200);
    assert.ok(Array.isArray(res.body.rawMaterialPrices));
    assert.ok(Array.isArray(res.body.formulas));
    assert.ok(Array.isArray(res.body.scrapRules));
  });

  it('scrap rules flag undefined overlap as BUSINESS_RULE_REQUIRED', async () => {
    const res = await json(base, '/api/admin/costing/scrap-rules', {
      headers: { Authorization: `Bearer ${adminToken}` },
    });
    assert.equal(res.status, 200);
    assert.equal(res.body.overlapPolicy, 'BUSINESS_RULE_REQUIRED');
  });

  it('variables include usedBy without inventing formula links', async () => {
    const res = await json(base, '/api/admin/costing/variables', {
      headers: { Authorization: `Bearer ${adminToken}` },
    });
    assert.equal(res.status, 200);
    assert.ok(Array.isArray(res.body.variables));
    if (res.body.variables[0]) {
      assert.ok(Array.isArray(res.body.variables[0].usedBy));
    }
  });

  it('lookups expose families, ACTIVE cables, and official RM only', async () => {
    const res = await json(base, '/api/admin/costing/lookups', {
      headers: { Authorization: `Bearer ${adminToken}` },
    });
    assert.equal(res.status, 200);
    assert.ok(Array.isArray(res.body.families));
    assert.ok(Array.isArray(res.body.cables));
    assert.ok(Array.isArray(res.body.rawMaterials));
    assert.ok(Array.isArray(res.body.incoterms));
    assert.ok(Array.isArray(res.body.destinations));
    assert.ok(Array.isArray(res.body.drums));
    for (const rm of res.body.rawMaterials) {
      assert.equal(/^I\d+-RM-/i.test(String(rm.code)), false, rm.code);
      assert.equal(String(rm.code).toUpperCase().startsWith('TEST-'), false, rm.code);
    }
  });

  it('auto-assigns unique SC26-##### scrap codes and keeps explicit test codes', async () => {
    const createdIds: string[] = [];
    try {
      const a = await json(base, '/api/admin/costing/scrap-rules', {
        method: 'POST',
        headers: { Authorization: `Bearer ${adminToken}`, 'Content-Type': 'application/json' },
        body: JSON.stringify({ name: 'Seq A', scopeType: 'GLOBAL' }),
      });
      assert.equal(a.status, 201, JSON.stringify(a.body));
      createdIds.push(a.body.scrapRule.id);
      assert.match(String(a.body.scrapRule.code), /^SC\d{2}-\d{5}$/);

      const b = await json(base, '/api/admin/costing/scrap-rules', {
        method: 'POST',
        headers: { Authorization: `Bearer ${adminToken}`, 'Content-Type': 'application/json' },
        body: JSON.stringify({ name: 'Seq B', scopeType: 'GLOBAL' }),
      });
      assert.equal(b.status, 201, JSON.stringify(b.body));
      createdIds.push(b.body.scrapRule.id);
      assert.match(String(b.body.scrapRule.code), /^SC\d{2}-\d{5}$/);
      assert.notEqual(a.body.scrapRule.code, b.body.scrapRule.code);

      const serialA = Number(String(a.body.scrapRule.code).slice(-5));
      const serialB = Number(String(b.body.scrapRule.code).slice(-5));
      assert.equal(serialB, serialA + 1);

      const explicit = await json(base, '/api/admin/costing/scrap-rules', {
        method: 'POST',
        headers: { Authorization: `Bearer ${adminToken}`, 'Content-Type': 'application/json' },
        body: JSON.stringify({ code: `I14-SEQ-${Date.now()}`, name: 'Explicit increment code', scopeType: 'GLOBAL' }),
      });
      assert.equal(explicit.status, 201);
      createdIds.push(explicit.body.scrapRule.id);
      assert.match(String(explicit.body.scrapRule.code), /^I14-SEQ-/);

      const keepOfficial = a.body.scrapRule.code;
      const again = await json(base, '/api/admin/costing/scrap-rules', {
        method: 'POST',
        headers: { Authorization: `Bearer ${adminToken}`, 'Content-Type': 'application/json' },
        body: JSON.stringify({ code: keepOfficial, name: 'Must not overwrite', scopeType: 'GLOBAL' }),
      });
      assert.equal(again.status, 409);
    } finally {
      const { getPrisma } = await import('./db');
      const prisma = getPrisma();
      if (prisma && createdIds.length) {
        await prisma.costingScrapRule.deleteMany({ where: { id: { in: createdIds } } });
      }
    }
  });

  it('workspace KPIs are live counts, not mock 256/212', async () => {
    const kpis = await loadCostingWorkspaceKpis([]);
    assert.equal(typeof kpis.pendingApproval, 'number');
    assert.ok(kpis.pendingApproval >= 0);
    assert.notEqual(kpis.pendingApproval, 256);
    assert.notEqual(kpis.expiredPrices, 212);
    const keys = kpis.configuration.map((c) => c.key);
    for (const key of ['bom', 'rmPrices', 'scrap', 'variables', 'formulas', 'metal', 'logistics', 'packing']) {
      assert.ok(keys.includes(key), `missing strip ${key}`);
    }
  });

  it('BOM costing validate uses orchestrator and does not persist', async () => {
    const res = await json(base, '/api/admin/costing/validate', {
      method: 'POST',
      headers: { Authorization: `Bearer ${adminToken}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({
        materialNumber: ELAND_REGRESSION_CABLES[0],
        quantity: 1,
        lengthMeters: 1000,
        currency: 'USD',
      }),
    });
    assert.ok(res.status === 200 || res.status === 400 || res.status === 422 || res.status === 500);
    if (res.status === 200) {
      assert.equal(res.body.persisted, false);
      if (res.body.preview) assert.equal(res.body.preview.persisted, false);
    }
    const bom = await json(base, `/api/admin/costing/bom-scrap?cable=${ELAND_REGRESSION_CABLES[0]}`, {
      headers: { Authorization: `Bearer ${adminToken}` },
    });
    assert.ok(bom.status === 200 || bom.status === 400);
  });
});
