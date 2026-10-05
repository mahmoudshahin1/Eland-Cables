import assert from 'node:assert/strict';
import { after, before, describe, it } from 'node:test';
import http from 'node:http';
import express from 'express';
import dotenv from 'dotenv';
import { checkDatabase, disconnectPrisma } from '../server/db';
import { signTestToken } from '../server/auth';
import { v2PlatformRouter } from '../server/v2PlatformRoutes';
import { platformAdminRouter } from '../server/platformAdminRoutes';
import { workflowRouter } from '../server/workflowRoutes';

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

describe('Phase 1 platform foundation — V2 deny-by-default', () => {
  let base = '';
  let server: http.Server;
  let adminToken = '';
  let customerToken = '';

  before(async () => {
    const health = await checkDatabase();
    assert.equal(health.ok, true, health.error);
    const app = express();
    app.use(express.json());
    app.use('/api/v2', v2PlatformRouter);
    app.use('/api/v2/workflows', workflowRouter);
    app.use('/api/admin/platform', platformAdminRouter);
    const listening = await listen(app);
    server = listening.server;
    base = listening.base;
    adminToken = signTestToken({
      id: 'u-p1-admin',
      name: 'P1 Admin',
      email: 'p1.admin@energya.com',
      userType: 'internal',
      permissions: { reportsAnalytics: true, overview: true, costingPricing: true },
      permissionCodes: ['ADMIN:SECURITY:VIEW', 'REPORT:REPORT:VIEW', 'REPORT:DASHBOARD:VIEW'],
    });
    customerToken = signTestToken({
      id: 'u-p1-cust',
      name: 'P1 Customer',
      email: 'p1.cust@eland.test',
      userType: 'customer',
      permissionCodes: ['COMMERCIAL:INQUIRY:VIEW'],
    });
  });

  after(async () => {
    await new Promise<void>((resolve, reject) => server.close((err) => (err ? reject(err) : resolve())));
    await disconnectPrisma();
  });

  const openDataPaths = [
    '/api/v2/boundary',
    '/api/v2/modules',
    '/api/v2/audit/events',
    '/api/v2/workflows/presentation',
    '/api/admin/platform/dashboard/kpis',
    '/api/admin/platform/reports',
    '/api/admin/platform/fields',
    '/api/v2/metadata/fields',
  ];

  for (const path of openDataPaths) {
    it(`unauthenticated GET ${path} returns 401`, async () => {
      const res = await json(base, path);
      assert.equal(res.status, 401, `${path} ${res.status} ${JSON.stringify(res.body)}`);
    });
  }

  it('missing permission on audit is 403 not 401', async () => {
    const res = await json(base, '/api/v2/audit/events', {
      headers: { Authorization: `Bearer ${customerToken}` },
    });
    assert.equal(res.status, 403);
  });

  it('customer is forbidden from platform KPIs', async () => {
    const res = await json(base, '/api/admin/platform/dashboard/kpis', {
      headers: { Authorization: `Bearer ${customerToken}` },
    });
    assert.equal(res.status, 403);
  });

  it('authorized internal may read boundary and KPIs', async () => {
    const boundary = await json(base, '/api/v2/boundary', {
      headers: { Authorization: `Bearer ${adminToken}` },
    });
    assert.equal(boundary.status, 200);
    assert.equal(boundary.body.integrations.d365, 'NOT_IMPLEMENTED');
    const kpis = await json(base, '/api/admin/platform/dashboard/kpis', {
      headers: { Authorization: `Bearer ${adminToken}` },
    });
    assert.equal(kpis.status, 200);
    assert.equal(typeof kpis.body.kpis.openInquiries, 'number');
  });
});
