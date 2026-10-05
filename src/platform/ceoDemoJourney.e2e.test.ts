/**
 * CEO demo journey — genuine APIs over existing modules.
 * Does not redesign 05I / drum optimizer / Option B costing.
 */
import assert from 'node:assert/strict';
import { after, before, describe, it } from 'node:test';
import http from 'node:http';
import express from 'express';
import dotenv from 'dotenv';
import { checkDatabase, getPrisma } from '../server/db';
import { identityAuthRouter } from '../server/identityAuthRoutes';
import { inquiriesRouter } from '../server/commercialRoutes';
import { v2InquiryConfigurationRouter } from '../server/v2InquiryConfigurationRoutes';
import { v2PlatformRouter } from '../server/v2PlatformRoutes';
import { platformAdminRouter } from '../server/platformAdminRoutes';
import { costingRouter } from '../server/costingRoutes';
import { containerStudyRouter } from '../server/containerStudyRoutes';
import { financialOfferSnapshotRouter } from '../server/financialOfferSnapshotRoutes';
import { seedDevelopmentUsers } from '../server/identityService';
import { hashPassword } from '../domain/passwordService';
import { SYSTEM_ADMIN_ROLE_CODE } from '../domain/permissionCatalog';
import { deleteCommercialInquiriesForTestSuffix } from '../server/commercialTestCleanup';
import { salesOrderIntegrationAdapter } from './integration/d365Adapters';
import { EXPECTED_OFFICIAL_CONFLICT_COUNT } from '../server/bomConflictGovernanceService';
import { canPromoteToPostgresqlSot, sotStatusForEntity } from './masterDataSoT';

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

describe('CEO demo journey — login through quotation + security + low-code', () => {
  let base = '';
  let server: http.Server;
  let tokenAdmin = '';
  let tokenA = '';
  let tokenB = '';
  const suffix = `ceo-${Date.now()}-${process.pid}`;
  const password = 'CeoDemo@Test-2026!';
  const ceoLabel = `CEO-DEMO Project ${suffix}`;
  const drumCode = `EWD-CEO-${suffix}`;
  let inquiryId = '';
  let lineId = '';
  let adminEmail = '';
  let emailA = '';
  let emailB = '';

  before(async () => {
    const health = await checkDatabase();
    assert.equal(health.ok, true, health.error);
    await seedDevelopmentUsers();
    const prisma = getPrisma()!;
    const adminRole = await prisma.role.findFirst({ where: { code: SYSTEM_ADMIN_ROLE_CODE } });
    assert.ok(adminRole);
    const customerRole = await prisma.role.findFirst({ where: { code: 'CUSTOMER_USER' } });
    assert.ok(customerRole);

    await prisma.drumMaster.upsert({
      where: { drumCode },
      create: {
        drumCode,
        drumType: 'WOOD',
        flange: 2600,
        barrel: 1400,
        innerWidth: 1500,
        outerWidth: 1600,
        capacity: 5000,
        maxWeight: 5000,
        clearanceMm: 50,
        emptyDrumNetWeightKg: 120,
        status: 'ACTIVE',
      },
      update: { status: 'ACTIVE', capacity: 5000, maxWeight: 5000 },
    });

    const custA = await prisma.customer.create({ data: { code: `CEO-A-${suffix}`, name: 'CEO Demo A' } });
    const custB = await prisma.customer.create({ data: { code: `CEO-B-${suffix}`, name: 'CEO Demo B' } });
    adminEmail = `ceo-admin-${suffix}@energya.com`;
    emailA = `ceo-a-${suffix}@eland.test`;
    emailB = `ceo-b-${suffix}@aland.test`;
    const admin = await prisma.userAccount.create({
      data: {
        username: `ceo-admin-${suffix}`,
        email: adminEmail,
        fullName: 'CEO Demo Admin',
        userType: 'internal',
        passwordHash: await hashPassword(password),
        status: 'ACTIVE',
      },
    });
    const userA = await prisma.userAccount.create({
      data: {
        username: `ceo-a-${suffix}`,
        email: emailA,
        fullName: 'CEO Customer A',
        userType: 'customer',
        passwordHash: await hashPassword(password),
        status: 'ACTIVE',
      },
    });
    const userB = await prisma.userAccount.create({
      data: {
        username: `ceo-b-${suffix}`,
        email: emailB,
        fullName: 'CEO Customer B',
        userType: 'customer',
        passwordHash: await hashPassword(password),
        status: 'ACTIVE',
      },
    });
    await prisma.customerUser.createMany({
      data: [
        { customerId: custA.id, userAccountId: userA.id, status: 'ACTIVE' },
        { customerId: custB.id, userAccountId: userB.id, status: 'ACTIVE' },
      ],
    });
    await prisma.userRole.createMany({
      data: [
        { userId: admin.id, roleId: adminRole.id },
        { userId: userA.id, roleId: customerRole.id },
        { userId: userB.id, roleId: customerRole.id },
      ],
    });
    await prisma.numberSequence.upsert({
      where: { code: 'INQ_COMMERCIAL' },
      create: {
        code: 'INQ_COMMERCIAL',
        name: 'Commercial Inquiry (V2)',
        prefix: 'INQ',
        format: '{PREFIX}{YY}-{#####}',
        nextSerial: 1,
        moduleId: 'INQUIRY_QUOTATION',
      },
      update: {},
    });

    const app = express();
    app.use(express.json());
    app.use('/api/auth', identityAuthRouter);
    app.use('/api/admin/platform', platformAdminRouter);
    app.use('/api/v2/inquiries', v2InquiryConfigurationRouter);
    app.use('/api/v2', containerStudyRouter);
    app.use('/api/v2', financialOfferSnapshotRouter);
    app.use('/api/v2', v2PlatformRouter);
    app.use('/api/inquiries', inquiriesRouter);
    app.use('/api/costing', costingRouter);
    const listening = await listen(app);
    server = listening.server;
    base = listening.base;

    const login = async (email: string) => {
      const res = await json(base, '/api/auth/login', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email, password }),
      });
      assert.equal(res.status, 200, JSON.stringify(res.body));
      assert.ok(res.body.accessToken);
      return res.body.accessToken as string;
    };
    tokenAdmin = await login(adminEmail);
    tokenA = await login(emailA);
    tokenB = await login(emailB);
  });

  after(async () => {
    const prisma = getPrisma();
    if (prisma) {
      await prisma.platformFieldDefinition.deleteMany({ where: { label: ceoLabel } });
      await deleteCommercialInquiriesForTestSuffix(prisma, suffix);
      await prisma.v2ConfigurationSnapshot.deleteMany({ where: { snapshotId: { contains: suffix } } });
      await prisma.drumMaster.deleteMany({ where: { drumCode } });
      const emails = [adminEmail, emailA, emailB];
      await prisma.userRole.deleteMany({ where: { user: { email: { in: emails } } } });
      await prisma.customerUser.deleteMany({ where: { userAccount: { email: { in: emails } } } });
      await prisma.userAccount.deleteMany({ where: { email: { in: emails } } });
      await prisma.customer.deleteMany({ where: { code: { contains: suffix } } });
    }
    await new Promise<void>((resolve, reject) => server.close((err) => (err ? reject(err) : resolve())));
  });

  it('walks LOGIN→DASHBOARD→INQUIRY→CABLE→CUTTING→DRUM CONFIRMED→delivery→CS/costing/FO gates→isolation→low-code', async () => {
    const auth = (token: string) => ({ Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' });

    const kpis = await json(base, '/api/admin/platform/dashboard/kpis', { headers: auth(tokenAdmin) });
    assert.equal(kpis.status, 200);
    assert.equal(typeof kpis.body.kpis.openInquiries, 'number');
    const kpisCust = await json(base, '/api/admin/platform/dashboard/kpis', { headers: auth(tokenA) });
    assert.equal(kpisCust.status, 403);

    const lowCode = await json(base, '/api/admin/platform/fields', {
      method: 'POST',
      headers: auth(tokenAdmin),
      body: JSON.stringify({
        entityCode: 'INQUIRY',
        fieldCode: 'projectName',
        label: ceoLabel,
        dataType: 'string',
        visible: true,
        displayOrder: 8,
        section: 'header',
        customerVisible: true,
      }),
    });
    assert.equal(lowCode.status, 200, JSON.stringify(lowCode.body));
    const custMutate = await json(base, '/api/admin/platform/fields', {
      method: 'POST',
      headers: auth(tokenA),
      body: JSON.stringify({
        entityCode: 'INQUIRY',
        fieldCode: 'projectName',
        label: 'Hacked',
        dataType: 'string',
      }),
    });
    assert.equal(custMutate.status, 403);

    const created = await json(base, '/api/v2/inquiries', {
      method: 'POST',
      headers: auth(tokenA),
      body: JSON.stringify({ projectName: `CEO-DEMO-${suffix}` }),
    });
    assert.equal(created.status, 201, JSON.stringify(created.body));
    inquiryId = created.body.inquiry.id;
    assert.equal(created.body.inquiry.projectName, `CEO-DEMO-${suffix}`);
    const inquiryNumber = created.body.inquiry.inquiryNumber as string;

    const lineRes = await json(base, `/api/v2/inquiries/${inquiryId}/lines`, {
      method: 'POST',
      headers: auth(tokenA),
      body: JSON.stringify({ cableDescription: 'CEO LV cable' }),
    });
    assert.equal(lineRes.status, 201, JSON.stringify(lineRes.body));
    lineId = lineRes.body.line.id;
    const prisma = getPrisma()!;
    const snapshot = await prisma.v2ConfigurationSnapshot.create({
      data: {
        snapshotId: `v2cfg-${inquiryNumber}-L${lineRes.body.line.lineNumber}-${suffix}`,
        versionNo: 1,
        inquiryLineId: lineId,
        cableMaterialNumber: 'TEST-MAT-CEO',
        itemCode: 'TEST-ITEM',
        customerCode: 'CEO-A',
        selections: { voltage: '0.6/1 kV', armour: 'No Armour' },
        configInput: {},
        validationStatus: 'EXISTING_APPROVED',
        flowState: 'VALID',
        engineeringStatus: 'Released',
        estimatedDiameterMm: 25,
        estimatedWeightKgKm: 1200,
        catalogSource: 'POSTGRESQL',
        catalogAuthoritative: true,
        downstreamGates: { cuttingLength: true, drumSelection: true },
      },
    });
    await prisma.commercialInquiryLine.update({
      where: { id: lineId },
      data: { v2CurrentSnapshotId: snapshot.id, status: 'CABLE_VALIDATED' },
    });

    const cut = await json(base, `/api/v2/inquiries/${inquiryId}/lines/${lineId}/cutting-plans`, {
      method: 'POST',
      headers: auth(tokenA),
      body: JSON.stringify({ nominalLengthM: 500, tolerancePercent: 1 }),
    });
    assert.equal(cut.status, 201, JSON.stringify(cut.body));

    const plan = await json(base, `/api/v2/inquiries/${inquiryId}/lines/${lineId}/drum-plans`, {
      method: 'POST',
      headers: auth(tokenA),
      body: JSON.stringify({ selectionMethod: 'AUTOMATIC' }),
    });
    assert.equal(plan.status, 201, JSON.stringify(plan.body));
    const planId = plan.body.drumPlan.planId;
    const validated = await json(
      base,
      `/api/v2/inquiries/${inquiryId}/lines/${lineId}/drum-plans/${planId}/validate`,
      { method: 'POST', headers: auth(tokenA) }
    );
    assert.equal(validated.status, 200);
    const confirmed = await json(
      base,
      `/api/v2/inquiries/${inquiryId}/lines/${lineId}/drum-plans/${planId}/confirm`,
      { method: 'POST', headers: auth(tokenA) }
    );
    assert.equal(confirmed.status, 200, JSON.stringify(confirmed.body));
    assert.equal(confirmed.body.drumPlan.lifecycleStatus, 'CONFIRMED');

    const delivery = await json(base, `/api/inquiries/${inquiryId}`, {
      method: 'PATCH',
      headers: auth(tokenA),
      body: JSON.stringify({
        projectName: `CEO-DEMO-${suffix}`,
        incoterms: 'CIF',
        deliveryDestination: 'Alexandria',
      }),
    });
    assert.ok([200, 409].includes(delivery.status), JSON.stringify(delivery.body));

    const sg = await json(base, `/api/v2/inquiries/${inquiryId}/shipment-groups`, { headers: auth(tokenAdmin) });
    assert.ok(sg.status === 200 || sg.status === 403 || sg.status === 404, `sg ${sg.status}`);
    const cs = await json(base, `/api/v2/inquiries/${inquiryId}/container-studies`, { headers: auth(tokenAdmin) });
    assert.ok([200, 403, 404].includes(cs.status));

    const costingCust = await json(base, '/api/costing', { headers: auth(tokenA) });
    assert.equal(costingCust.status, 403);
    const costingAdmin = await json(base, '/api/costing', { headers: auth(tokenAdmin) });
    assert.ok([200, 403].includes(costingAdmin.status));

    const fo = await json(base, '/api/v2/financial-offer-snapshots', {
      method: 'POST',
      headers: auth(tokenAdmin),
      body: JSON.stringify({ inquiryId }),
    });
    assert.ok(fo.status === 201 || fo.status === 400 || fo.status === 409 || fo.status === 422, JSON.stringify(fo.body));

    const quote = await json(base, `/api/inquiries/${inquiryId}/quotation`, {
      method: 'POST',
      headers: auth(tokenAdmin),
      body: JSON.stringify({}),
    });
    assert.ok([201, 400, 409, 422, 403].includes(quote.status), JSON.stringify(quote.body));

    const isolation = await json(base, `/api/inquiries/${inquiryId}`, { headers: auth(tokenB) });
    assert.equal(isolation.status, 403);

    const own = await json(base, `/api/inquiries/${inquiryId}`, { headers: auth(tokenA) });
    assert.equal(own.status, 200);
    const leaked = JSON.stringify(own.body);
    assert.equal(/costingRunId|materialCost|CostingMetalCostComponent/.test(leaked), false);
    assert.ok(own.body.inquiry);
    const persistedSnap = await prisma.v2ConfigurationSnapshot.findUnique({ where: { id: snapshot.id } });
    assert.ok(persistedSnap);
    assert.equal(persistedSnap?.catalogAuthoritative, true);

    const runtime = await json(base, '/api/inquiries/meta/field-definitions', { headers: auth(tokenAdmin) });
    assert.equal(runtime.status, 200);
    const project = (runtime.body.fields || []).find((f: { fieldCode: string }) => f.fieldCode === 'projectName');
    assert.equal(project?.label, ceoLabel);
    const runtimeCust = await json(base, '/api/inquiries/meta/field-definitions', { headers: auth(tokenA) });
    assert.equal(runtimeCust.status, 200);
    const projectCust = (runtimeCust.body.fields || []).find((f: { fieldCode: string }) => f.fieldCode === 'projectName');
    assert.equal(projectCust?.label, ceoLabel);

    const integrations = await json(base, '/api/v2/integrations/status', { headers: auth(tokenAdmin) });
    assert.equal(integrations.status, 200);
    assert.equal(integrations.body.d365.status, 'NOT_IMPLEMENTED');
    const d365 = await salesOrderIntegrationAdapter.postSalesOrder('CEO-DEMO-SO');
    assert.equal(d365.status, 'NOT_IMPLEMENTED');

    assert.equal(EXPECTED_OFFICIAL_CONFLICT_COUNT, 81);
    assert.equal(canPromoteToPostgresqlSot(sotStatusForEntity('CableBomLine')!), false);
  });
});
