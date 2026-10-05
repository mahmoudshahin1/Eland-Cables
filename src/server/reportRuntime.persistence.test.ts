import assert from 'node:assert/strict';
import { after, before, describe, it } from 'node:test';
import http from 'node:http';
import express from 'express';
import dotenv from 'dotenv';
import { checkDatabase, disconnectPrisma, getPrisma } from './db';
import { signTestToken } from './auth';
import { platformAdminRouter } from './platformAdminRoutes';

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

describe('Phase 10 report runtime persistence', () => {
  let base = '';
  let server: http.Server;
  let adminToken = '';
  const suffix = `rpt-${Date.now()}`;

  before(async () => {
    const health = await checkDatabase();
    assert.equal(health.ok, true, health.error);
    const app = express();
    app.use(express.json());
    app.use('/api/admin/platform', platformAdminRouter);
    const listening = await listen(app);
    server = listening.server;
    base = listening.base;
    adminToken = signTestToken({
      id: 'u-rpt-admin',
      name: 'Report Admin',
      email: 'report.admin@energya.com',
      userType: 'internal',
      permissions: { costingPricing: true, reportsAnalytics: true },
      permissionCodes: [
        'COSTING:FORMULA:VIEW',
        'COSTING:CONFIGURATION:VIEW',
        'COSTING:CONFIGURATION:CREATE',
        'REPORT:REPORT:VIEW',
        'REPORT:DASHBOARD:VIEW',
      ],
    });
  });

  after(async () => {
    const prisma = getPrisma();
    if (prisma) {
      await prisma.reportDefinition.deleteMany({ where: { code: { startsWith: `MVP-${suffix}` } } }).catch(() => undefined);
    }
    await new Promise<void>((resolve, reject) => server.close((err) => (err ? reject(err) : resolve())));
    await disconnectPrisma();
  });

  it('rejects creating a report on a non-whitelisted entity', async () => {
    const res = await json(base, '/api/admin/platform/reports', {
      method: 'POST',
      headers: { Authorization: `Bearer ${adminToken}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({
        code: `MVP-${suffix}-BAD`,
        name: 'Bad costing dump',
        entityCode: 'CostingMetalCostComponent',
        fieldCodes: ['id'],
      }),
    });
    assert.equal(res.status, 400);
    assert.match(String(res.body.error || ''), /whitelist/i);
  });

  it('creates and runs a CommercialInquiry count report', async () => {
    const code = `MVP-${suffix}-INQ`;
    const created = await json(base, '/api/admin/platform/reports', {
      method: 'POST',
      headers: { Authorization: `Bearer ${adminToken}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({
        code,
        name: 'Inquiry counts',
        entityCode: 'CommercialInquiry',
        fieldCodes: ['status'],
      }),
    });
    assert.equal(created.status, 201, JSON.stringify(created.body));
    const run = await json(base, `/api/admin/platform/reports/${code}/run`, {
      method: 'POST',
      headers: { Authorization: `Bearer ${adminToken}` },
    });
    assert.equal(run.status, 200, JSON.stringify(run.body));
    assert.equal(run.body.result.mode, 'WHITELIST_AGGREGATION_MVP');
    assert.ok(Array.isArray(run.body.result.rows));
  });
});
