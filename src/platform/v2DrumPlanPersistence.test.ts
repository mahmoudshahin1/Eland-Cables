import assert from 'node:assert/strict';
import { after, before, describe, it } from 'node:test';
import http from 'node:http';
import express from 'express';
import dotenv from 'dotenv';
import { checkDatabase, getPrisma } from '../server/db';
import { identityAuthRouter } from '../server/identityAuthRoutes';
import { v2InquiryConfigurationRouter } from '../server/v2InquiryConfigurationRoutes';
import { seedDevelopmentUsers } from '../server/identityService';
import { hashPassword } from '../domain/passwordService';
import { SYSTEM_ADMIN_ROLE_CODE } from '../domain/permissionCatalog';
import { deleteCommercialInquiriesForTestSuffix } from '../server/commercialTestCleanup';

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

async function seedValidSnapshot(
  inquiryId: string,
  lineId: string,
  inquiryNumber: string,
  lineNumber: number
) {
  const prisma = getPrisma()!;
  const snapshot = await prisma.v2ConfigurationSnapshot.create({
    data: {
      snapshotId: `v2cfg-${inquiryNumber}-L${lineNumber}-v1-drum`,
      versionNo: 1,
      inquiryLineId: lineId,
      cableMaterialNumber: 'TEST-MAT-DRUM',
      itemCode: 'TEST-ITEM',
      customerCode: 'TEST-CUST',
      selections: { voltage: '6/10 kV', armour: 'No Armour' },
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
  return snapshot;
}

async function seedTestDrum(suffix: string) {
  const prisma = getPrisma()!;
  const drumCode = `EWD-TEST-${suffix}`;
  return prisma.drumMaster.upsert({
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
    update: {
      maxWeight: 5000,
      clearanceMm: 50,
      status: 'ACTIVE',
    },
  });
}

async function seedCuttingPlan(inquiryId: string, lineId: string, token: string, base: string) {
  const planRes = await json(base, `/api/v2/inquiries/${inquiryId}/lines/${lineId}/cutting-plans`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
    body: JSON.stringify({ nominalLengthM: 500, tolerancePercent: 1 }),
  });
  assert.equal(planRes.status, 201, planRes.body.error);
  return planRes.body;
}

describe('Task 05D — V2 drum plan persistence', () => {
  let base = '';
  let server: http.Server;
  let tokenA = '';
  let tokenB = '';
  const suffix = `v2drum-${Date.now()}`;

  before(async () => {
    const health = await checkDatabase();
    assert.equal(health.ok, true, health.error);
    await seedDevelopmentUsers();
    await seedTestDrum(suffix);
    const prisma = getPrisma()!;
    const role = await prisma.role.findFirst({ where: { code: SYSTEM_ADMIN_ROLE_CODE } });
    assert.ok(role);
    const custA = await prisma.customer.create({ data: { code: `V2DRUM-A-${suffix}`, name: 'Drum A' } });
    const custB = await prisma.customer.create({ data: { code: `V2DRUM-B-${suffix}`, name: 'Drum B' } });
    const userA = await prisma.userAccount.create({
      data: {
        username: `v2drum-a-${suffix}`,
        email: `v2drum-a-${suffix}@test.local`,
        fullName: 'Drum A',
        userType: 'customer',
        passwordHash: await hashPassword('V2Test@2026!'),
        status: 'ACTIVE',
      },
    });
    const userB = await prisma.userAccount.create({
      data: {
        username: `v2drum-b-${suffix}`,
        email: `v2drum-b-${suffix}@test.local`,
        fullName: 'Drum B',
        userType: 'customer',
        passwordHash: await hashPassword('V2Test@2026!'),
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
        { userId: userA.id, roleId: role.id },
        { userId: userB.id, roleId: role.id },
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
    app.use('/api/v2/inquiries', v2InquiryConfigurationRouter);
    const listening = await listen(app);
    server = listening.server;
    base = listening.base;

    const loginA = await json(base, '/api/auth/login', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ email: userA.email, password: 'V2Test@2026!' }),
    });
    const loginB = await json(base, '/api/auth/login', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ email: userB.email, password: 'V2Test@2026!' }),
    });
    tokenA = loginA.body.accessToken;
    tokenB = loginB.body.accessToken;
    assert.ok(tokenA && tokenB);
  });

  after(async () => {
    const prisma = getPrisma();
    if (prisma) {
      await deleteCommercialInquiriesForTestSuffix(prisma, suffix);
      await prisma.v2ConfigurationSnapshot.deleteMany({
        where: { snapshotId: { contains: suffix } },
      });
      await prisma.drumMaster.deleteMany({ where: { drumCode: { contains: suffix } } });
      await prisma.customerUser.deleteMany({ where: { userAccount: { email: { contains: suffix } } } });
      await prisma.userRole.deleteMany({ where: { user: { email: { contains: suffix } } } });
      await prisma.userAccount.deleteMany({ where: { email: { contains: suffix } } });
      await prisma.customer.deleteMany({ where: { code: { contains: suffix } } });
    }
    await new Promise<void>((resolve, reject) => server.close((err) => (err ? reject(err) : resolve())));
  });

  async function createInquiryWithCutting() {
    const created = await json(base, '/api/v2/inquiries', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${tokenA}` },
      body: JSON.stringify({ projectName: `Drum ${suffix}` }),
    });
    const inquiryId = created.body.inquiry.id;
    const lineRes = await json(base, `/api/v2/inquiries/${inquiryId}/lines`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${tokenA}` },
      body: JSON.stringify({ cableDescription: 'Drum line' }),
    });
    const lineId = lineRes.body.line.id;
    await seedValidSnapshot(
      inquiryId,
      lineId,
      created.body.inquiry.inquiryNumber,
      lineRes.body.line.lineNumber
    );
    await seedCuttingPlan(inquiryId, lineId, tokenA, base);
    return { inquiryId, lineId, inquiryNumber: created.body.inquiry.inquiryNumber };
  }

  it('returns ephemeral drum selection candidates', async () => {
    const { inquiryId, lineId } = await createInquiryWithCutting();
    const res = await json(
      base,
      `/api/v2/inquiries/${inquiryId}/lines/${lineId}/drum-selection/candidates`,
      { method: 'POST', headers: { Authorization: `Bearer ${tokenA}` } }
    );
    assert.equal(res.status, 200);
    assert.ok(res.body.candidates);
    assert.ok(Array.isArray(res.body.candidates.suitable));
  });

  it('creates versioned draft drum plan (automatic)', async () => {
    const { inquiryId, lineId } = await createInquiryWithCutting();
    const res = await json(base, `/api/v2/inquiries/${inquiryId}/lines/${lineId}/drum-plans`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${tokenA}` },
      body: JSON.stringify({ selectionMethod: 'AUTOMATIC' }),
    });
    assert.equal(res.status, 201, res.body.error);
    assert.equal(res.body.drumPlan.versionNo, 1);
    assert.equal(res.body.drumPlan.lifecycleStatus, 'DRAFT');
    assert.equal(res.body.drumPlan.selectionMethod, 'AUTOMATIC');
    assert.ok(res.body.drumPlan.lines.length >= 1);
    assert.equal(res.body.line.v2CurrentDrumPlanId, res.body.drumPlan.id);
  });

  it('increments version on second drum plan', async () => {
    const { inquiryId, lineId } = await createInquiryWithCutting();
    await json(base, `/api/v2/inquiries/${inquiryId}/lines/${lineId}/drum-plans`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${tokenA}` },
      body: JSON.stringify({ selectionMethod: 'AUTOMATIC' }),
    });
    const second = await json(base, `/api/v2/inquiries/${inquiryId}/lines/${lineId}/drum-plans`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${tokenA}` },
      body: JSON.stringify({ selectionMethod: 'AUTOMATIC' }),
    });
    assert.equal(second.status, 201);
    assert.equal(second.body.drumPlan.versionNo, 2);
  });

  it('validates and confirms drum plan lifecycle', async () => {
    const { inquiryId, lineId } = await createInquiryWithCutting();
    const created = await json(base, `/api/v2/inquiries/${inquiryId}/lines/${lineId}/drum-plans`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${tokenA}` },
      body: JSON.stringify({ selectionMethod: 'AUTOMATIC' }),
    });
    const planId = created.body.drumPlan.planId;

    const validated = await json(
      base,
      `/api/v2/inquiries/${inquiryId}/lines/${lineId}/drum-plans/${planId}/validate`,
      { method: 'POST', headers: { Authorization: `Bearer ${tokenA}` } }
    );
    assert.equal(validated.status, 200);
    assert.equal(validated.body.drumPlan.lifecycleStatus, 'VALIDATED');

    const confirmed = await json(
      base,
      `/api/v2/inquiries/${inquiryId}/lines/${lineId}/drum-plans/${planId}/confirm`,
      { method: 'POST', headers: { Authorization: `Bearer ${tokenA}` } }
    );
    assert.equal(confirmed.status, 200);
    assert.equal(confirmed.body.drumPlan.lifecycleStatus, 'CONFIRMED');

    const handoff = await json(
      base,
      `/api/v2/inquiries/${inquiryId}/lines/${lineId}/drum-plans/${planId}/handoff`,
      { headers: { Authorization: `Bearer ${tokenA}` } }
    );
    assert.equal(handoff.status, 200);
    assert.equal(handoff.body.handoff.lifecycleStatus, 'CONFIRMED');
    assert.ok(handoff.body.handoff.lines.length >= 1);
  });

  it('rejects drum plan without cutting plan', async () => {
    const created = await json(base, '/api/v2/inquiries', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${tokenA}` },
      body: JSON.stringify({ projectName: `No cut ${suffix}` }),
    });
    const inquiryId = created.body.inquiry.id;
    const lineRes = await json(base, `/api/v2/inquiries/${inquiryId}/lines`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${tokenA}` },
      body: JSON.stringify({ cableDescription: 'No cut' }),
    });
    const lineId = lineRes.body.line.id;
    await seedValidSnapshot(
      inquiryId,
      lineId,
      created.body.inquiry.inquiryNumber,
      lineRes.body.line.lineNumber
    );

    const res = await json(base, `/api/v2/inquiries/${inquiryId}/lines/${lineId}/drum-plans`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${tokenA}` },
      body: JSON.stringify({ selectionMethod: 'AUTOMATIC' }),
    });
    assert.equal(res.status, 409);
    assert.equal(res.body.code, 'CUTTING_PLAN_REQUIRED');
  });

  it('blocks IDOR on drum plan persist', async () => {
    const { inquiryId, lineId } = await createInquiryWithCutting();
    const steal = await json(base, `/api/v2/inquiries/${inquiryId}/lines/${lineId}/drum-plans`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${tokenB}` },
      body: JSON.stringify({ selectionMethod: 'AUTOMATIC' }),
    });
    assert.equal(steal.status, 403);
  });

  it('records appendServerAudit on drum plan persist', async () => {
    const { inquiryId, lineId } = await createInquiryWithCutting();
    const res = await json(base, `/api/v2/inquiries/${inquiryId}/lines/${lineId}/drum-plans`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${tokenA}` },
      body: JSON.stringify({ selectionMethod: 'AUTOMATIC' }),
    });
    const prisma = getPrisma()!;
    const audits = await prisma.auditEvent.findMany({
      where: { entityId: res.body.drumPlan.planId, action: 'PERSIST' },
    });
    assert.ok(audits.length >= 1);
  });

  it('creates manual multi-drum draft plan', async () => {
    const { inquiryId, lineId } = await createInquiryWithCutting();
    const drumCode = `EWD-TEST-${suffix}`;
    const res = await json(base, `/api/v2/inquiries/${inquiryId}/lines/${lineId}/drum-plans`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${tokenA}` },
      body: JSON.stringify({
        selectionMethod: 'MANUAL',
        rows: [
          { drumCode, numberOfDrums: 1, cuttingLengthM: 250, drumTolerancePercent: 0 },
          { drumCode, numberOfDrums: 1, cuttingLengthM: 250, drumTolerancePercent: 0 },
        ],
      }),
    });
    assert.equal(res.status, 201, res.body.error);
    assert.equal(res.body.drumPlan.selectionMethod, 'MANUAL');
    assert.equal(res.body.drumPlan.lines.length, 2);
  });
});
