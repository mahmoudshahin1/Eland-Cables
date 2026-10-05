import assert from 'node:assert/strict';
import { after, before, describe, it } from 'node:test';
import http from 'node:http';
import express from 'express';
import dotenv from 'dotenv';
import { checkDatabase, disconnectPrisma, getPrisma } from '../server/db';
import { signTestToken } from '../server/auth';
import { v2PlatformRouter } from '../server/v2PlatformRoutes';
import { platformAdminRouter } from '../server/platformAdminRoutes';
import { inquiriesRouter } from '../server/commercialRoutes';
import {
  assertNotEavTransactionStore,
  assertTypedFieldMutationAllowed,
  inquiryManifestAsMetadata,
  mergeFieldMetadata,
} from './metadata/metadataService';
import { DomainError } from './errors/domainError';

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

describe('Phase 12 low-code — PlatformFieldDefinition (no EAV)', () => {
  it('refuses invented columns and costing entities', () => {
    assert.equal(assertNotEavTransactionStore().eavForTransactions, false);
    assert.throws(() => assertTypedFieldMutationAllowed('COSTING', 'metalRate'), DomainError);
    assert.throws(() => assertTypedFieldMutationAllowed('INQUIRY', 'inventedColumn'), DomainError);
    assert.doesNotThrow(() => assertTypedFieldMutationAllowed('INQUIRY', 'projectName'));
  });

  it('keeps protected cost fields hidden from customers after overlay', () => {
    const merged = mergeFieldMetadata(inquiryManifestAsMetadata(), [
      {
        entityCode: 'INQUIRY',
        fieldCode: 'estimatedValue',
        label: 'Secret value',
        dataType: 'number',
        customerVisible: true,
        visible: true,
      },
    ]);
    const row = merged.find((f) => f.entityCode === 'INQUIRY' && f.fieldCode === 'estimatedValue');
    assert.equal(row?.customerVisible, false);
    assert.equal(row?.systemProtected, true);
  });

  let base = '';
  let server: http.Server;
  let adminToken = '';
  let salesToken = '';
  let customerToken = '';
  const suffix = `p12-${Date.now()}-${process.pid}`;
  const ceoLabel = `CEO Project ${suffix}`;

  before(async () => {
    const health = await checkDatabase();
    assert.equal(health.ok, true, health.error);
    const app = express();
    app.use(express.json());
    app.use('/api/v2', v2PlatformRouter);
    app.use('/api/admin/platform', platformAdminRouter);
    app.use('/api/inquiries', inquiriesRouter);
    const listening = await listen(app);
    server = listening.server;
    base = listening.base;
    adminToken = signTestToken({
      id: `u-p12-admin-${suffix}`,
      name: 'P12 Admin',
      email: `p12.admin.${suffix}@energya.com`,
      userType: 'internal',
      permissions: { userManagement: true, reportsAnalytics: true, overview: true },
      permissionCodes: ['PLATFORM:METADATA:VIEW', 'PLATFORM:METADATA:MANAGE', 'COMMERCIAL:INQUIRY:VIEW'],
    });
    salesToken = signTestToken({
      id: `u-p12-sales-${suffix}`,
      name: 'P12 Sales',
      email: `p12.sales.${suffix}@energya.com`,
      userType: 'internal',
      permissions: { salesQuotations: true, costingPricing: true },
      permissionCodes: ['COMMERCIAL:INQUIRY:VIEW', 'COMMERCIAL:INQUIRY:CREATE'],
    });
    customerToken = signTestToken({
      id: `u-p12-cust-${suffix}`,
      name: 'P12 Customer',
      email: `p12.cust.${suffix}@eland.test`,
      userType: 'customer',
      permissionCodes: ['COMMERCIAL:INQUIRY:VIEW'],
      customerId: 'cust-p12',
    });
  });

  after(async () => {
    const prisma = getPrisma();
    if (prisma) {
      await prisma.platformFieldDefinition.deleteMany({
        where: { fieldCode: 'projectName', label: ceoLabel },
      });
    }
    await new Promise<void>((resolve, reject) => server.close((err) => (err ? reject(err) : resolve())));
    await disconnectPrisma();
  });

  it('unauthenticated metadata mutation is 401', async () => {
    const res = await json(base, '/api/admin/platform/fields', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        entityCode: 'INQUIRY',
        fieldCode: 'projectName',
        label: ceoLabel,
        dataType: 'string',
      }),
    });
    assert.equal(res.status, 401);
  });

  it('customer and sales cannot mutate metadata', async () => {
    const body = JSON.stringify({
      entityCode: 'INQUIRY',
      fieldCode: 'projectName',
      label: ceoLabel,
      dataType: 'string',
      visible: true,
    });
    const customer = await json(base, '/api/admin/platform/fields', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${customerToken}` },
      body,
    });
    assert.equal(customer.status, 403);
    const sales = await json(base, '/api/v2/metadata/fields', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${salesToken}` },
      body,
    });
    assert.equal(sales.status, 403);
  });

  it('admin can configure a typed field and runtime form/list metadata reflects it', async () => {
    const save = await json(base, '/api/admin/platform/fields', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${adminToken}` },
      body: JSON.stringify({
        entityCode: 'INQUIRY',
        fieldCode: 'projectName',
        label: ceoLabel,
        dataType: 'string',
        visible: true,
        displayOrder: 5,
        section: 'header',
        customerVisible: true,
      }),
    });
    assert.equal(save.status, 200, JSON.stringify(save.body));
    assert.equal(save.body.field.label, ceoLabel);

    const runtime = await json(base, '/api/v2/metadata/fields?entity=INQUIRY', {
      headers: { Authorization: `Bearer ${salesToken}` },
    });
    assert.equal(runtime.status, 200);
    const project = (runtime.body.fields || []).find((f: { fieldCode: string }) => f.fieldCode === 'projectName');
    assert.equal(project?.label, ceoLabel);
    assert.equal(project?.source, 'PLATFORM_FIELD_DEFINITION');
    assert.equal(runtime.body.eav.eavForTransactions, false);

    const inquiryMeta = await json(base, '/api/inquiries/meta/field-definitions', {
      headers: { Authorization: `Bearer ${salesToken}` },
    });
    assert.equal(inquiryMeta.status, 200);
    const listOrForm = (inquiryMeta.body.fields || []).find((f: { fieldCode: string }) => f.fieldCode === 'projectName');
    assert.equal(listOrForm?.label, ceoLabel);
  });

  it('protected fields and invented EAV columns fail closed', async () => {
    const secret = await json(base, '/api/admin/platform/fields', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${adminToken}` },
      body: JSON.stringify({
        entityCode: 'INQUIRY',
        fieldCode: 'estimatedValue',
        label: 'Show cost to customer',
        dataType: 'number',
        customerVisible: true,
      }),
    });
    assert.equal(secret.status, 400);
    const eav = await json(base, '/api/admin/platform/fields', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${adminToken}` },
      body: JSON.stringify({
        entityCode: 'INQUIRY',
        fieldCode: 'customEavSlot',
        label: 'Arbitrary',
        dataType: 'string',
      }),
    });
    assert.equal(eav.status, 400);
  });
});
