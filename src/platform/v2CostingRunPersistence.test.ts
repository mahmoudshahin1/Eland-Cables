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
import { DECISION5_STATUS, V2_COSTING_WORKFLOW_CHANNEL } from '../domain/v2CostingRequestService';
import { listServerAuditEvents } from '../server/serverAudit';
import { deleteCostingArtifactsForInquiryLines } from '../server/costingArtifactCleanup';

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
      snapshotId: `v2cfg-${inquiryNumber}-L${lineNumber}-v1-cost`,
      versionNo: 1,
      inquiryLineId: lineId,
      cableMaterialNumber: 'TEST-MAT-COST',
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
      bomGovernanceBlocked: true,
      unresolvedBomConflictCount: 81,
      downstreamGates: { cuttingLength: true, drumSelection: true, costing: true },
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
  const drumCode = `EWD-TEST-COST-${suffix}`;
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
    update: { status: 'ACTIVE' },
  });
}

async function seedCuttingAndConfirmDrum(
  inquiryId: string,
  lineId: string,
  token: string,
  base: string
) {
  const planRes = await json(base, `/api/v2/inquiries/${inquiryId}/lines/${lineId}/cutting-plans`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
    body: JSON.stringify({ nominalLengthM: 500, tolerancePercent: 1 }),
  });
  assert.equal(planRes.status, 201, planRes.body.error);

  const created = await json(base, `/api/v2/inquiries/${inquiryId}/lines/${lineId}/drum-plans`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
    body: JSON.stringify({ selectionMethod: 'AUTOMATIC' }),
  });
  assert.equal(created.status, 201, created.body.error);
  const planId = created.body.drumPlan.planId;

  await json(base, `/api/v2/inquiries/${inquiryId}/lines/${lineId}/drum-plans/${planId}/validate`, {
    method: 'POST',
    headers: { Authorization: `Bearer ${token}` },
  });
  const confirmed = await json(
    base,
    `/api/v2/inquiries/${inquiryId}/lines/${lineId}/drum-plans/${planId}/confirm`,
    { method: 'POST', headers: { Authorization: `Bearer ${token}` } }
  );
  assert.equal(confirmed.status, 200);
  return { planId };
}

describe('Task 05E — V2 costing run persistence', () => {
  let base = '';
  let server: http.Server;
  let tokenA = '';
  let tokenB = '';
  let internalToken = '';
  const ownedInquiryIds: string[] = [];
  const suffix = `v2cost-${Date.now()}`;

  before(async () => {
    const health = await checkDatabase();
    assert.equal(health.ok, true, health.error);
    await seedDevelopmentUsers();
    await seedTestDrum(suffix);
    const prisma = getPrisma()!;
    const role = await prisma.role.findFirst({ where: { code: SYSTEM_ADMIN_ROLE_CODE } });
    assert.ok(role);
    const custA = await prisma.customer.create({ data: { code: `V2COST-A-${suffix}`, name: 'Cost A' } });
    const custB = await prisma.customer.create({ data: { code: `V2COST-B-${suffix}`, name: 'Cost B' } });
    const userA = await prisma.userAccount.create({
      data: {
        username: `v2cost-a-${suffix}`,
        email: `v2cost-a-${suffix}@test.local`,
        fullName: 'Cost A',
        userType: 'customer',
        passwordHash: await hashPassword('V2Test@2026!'),
        status: 'ACTIVE',
      },
    });
    const userB = await prisma.userAccount.create({
      data: {
        username: `v2cost-b-${suffix}`,
        email: `v2cost-b-${suffix}@test.local`,
        fullName: 'Cost B',
        userType: 'customer',
        passwordHash: await hashPassword('V2Test@2026!'),
        status: 'ACTIVE',
      },
    });
    const userInternal = await prisma.userAccount.create({
      data: {
        username: `v2cost-int-${suffix}`,
        email: `v2cost-int-${suffix}@test.local`,
        fullName: 'Cost Internal',
        userType: 'internal',
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
        { userId: userInternal.id, roleId: role.id },
      ],
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
    const loginInternal = await json(base, '/api/auth/login', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ email: userInternal.email, password: 'V2Test@2026!' }),
    });
    internalToken = loginInternal.body.accessToken;
    assert.ok(internalToken);
  });

  after(async () => {
    const prisma = getPrisma();
    if (prisma) {
      const ownedLines = ownedInquiryIds.length
        ? await prisma.commercialInquiryLine.findMany({
            where: { inquiryId: { in: ownedInquiryIds } },
            select: { id: true },
          })
        : [];
      await deleteCostingArtifactsForInquiryLines(
        prisma,
        ownedLines.map((line) => line.id)
      );
      await prisma.v2DrumPlanLine.deleteMany({
        where: { drumPlan: { inquiryLine: { inquiry: { inquiryNumber: { contains: suffix } } } } },
      });
      await prisma.v2DrumPlan.deleteMany({
        where: { inquiryLine: { inquiry: { inquiryNumber: { contains: suffix } } } },
      });
      await prisma.v2CuttingLengthPlan.deleteMany({
        where: { inquiryLine: { inquiry: { inquiryNumber: { contains: suffix } } } },
      });
      await prisma.v2CuttingLengthRequirement.deleteMany({
        where: { inquiryLine: { inquiry: { inquiryNumber: { contains: suffix } } } },
      });
      await prisma.v2ConfigurationSnapshot.deleteMany({
        where: { inquiryLine: { inquiry: { inquiryNumber: { contains: suffix } } } },
      });
      await prisma.commercialInquiryLine.deleteMany({
        where: { inquiry: { inquiryNumber: { contains: suffix } } },
      });
      await prisma.commercialInquiry.deleteMany({ where: { inquiryNumber: { contains: suffix } } });
      await prisma.drumMaster.deleteMany({ where: { drumCode: { contains: suffix } } });
      await prisma.customerUser.deleteMany({ where: { userAccount: { email: { contains: suffix } } } });
      await prisma.userRole.deleteMany({ where: { user: { email: { contains: suffix } } } });
      await prisma.userAccount.deleteMany({ where: { email: { contains: suffix } } });
      await prisma.customer.deleteMany({ where: { code: { contains: suffix } } });
    }
    await new Promise<void>((resolve, reject) => server.close((err) => (err ? reject(err) : resolve())));
  });

  async function createInquiryWithConfirmedDrum() {
    const created = await json(base, '/api/v2/inquiries', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${tokenA}` },
      body: JSON.stringify({ projectName: `Cost ${suffix}` }),
    });
    const inquiryId = created.body.inquiry.id;
    ownedInquiryIds.push(inquiryId);
    const lineRes = await json(base, `/api/v2/inquiries/${inquiryId}/lines`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${tokenA}` },
      body: JSON.stringify({ cableDescription: 'Cost line', requestedQuantity: 2 }),
    });
    const lineId = lineRes.body.line.id;
    await seedValidSnapshot(
      inquiryId,
      lineId,
      created.body.inquiry.inquiryNumber,
      lineRes.body.line.lineNumber
    );
    const { planId } = await seedCuttingAndConfirmDrum(inquiryId, lineId, tokenA, base);
    return { inquiryId, lineId, planId, inquiryNumber: created.body.inquiry.inquiryNumber };
  }

  it('requires CONFIRMED drum plan for costing preview', async () => {
    const created = await json(base, '/api/v2/inquiries', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${tokenA}` },
      body: JSON.stringify({ projectName: `No drum ${suffix}` }),
    });
    const inquiryId = created.body.inquiry.id;
    ownedInquiryIds.push(inquiryId);
    const lineRes = await json(base, `/api/v2/inquiries/${inquiryId}/lines`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${tokenA}` },
      body: JSON.stringify({ cableDescription: 'No drum' }),
    });
    const lineId = lineRes.body.line.id;
    await seedValidSnapshot(
      inquiryId,
      lineId,
      created.body.inquiry.inquiryNumber,
      lineRes.body.line.lineNumber
    );

    const res = await json(
      base,
      `/api/v2/inquiries/${inquiryId}/lines/${lineId}/costing-runs/preview`,
      { method: 'POST', headers: { Authorization: `Bearer ${internalToken}` } }
    );
    assert.equal(res.status, 409);
    assert.equal(res.body.code, 'DRUM_PLAN_REQUIRED');
  });

  it('preview is blocked by BOM Gate 2 (81 conflicts) with structured reasons', async () => {
    const { inquiryId, lineId } = await createInquiryWithConfirmedDrum();
    const res = await json(
      base,
      `/api/v2/inquiries/${inquiryId}/lines/${lineId}/costing-runs/preview`,
      { method: 'POST', headers: { Authorization: `Bearer ${internalToken}` } }
    );
    assert.equal(res.status, 200);
    assert.equal(res.body.status, 'NOT_READY');
    assert.equal(res.body.decision5Status, DECISION5_STATUS);
    assert.ok(res.body.lineage.drumPlanId);
    assert.ok(res.body.lineage.configurationSnapshotId);
    assert.ok(
      res.body.blockingReasons.length > 0 || res.body.errorCode,
      'expected gate blocking reasons'
    );
  });

  it('records appendServerAudit on gate-blocked preview', async () => {
    const { inquiryId, lineId, inquiryNumber } = await createInquiryWithConfirmedDrum();
    await json(
      base,
      `/api/v2/inquiries/${inquiryId}/lines/${lineId}/costing-runs/preview`,
      { method: 'POST', headers: { Authorization: `Bearer ${internalToken}` } }
    );
    const events = await listServerAuditEvents({ entity: 'V2CostingRun', limit: 20 });
    assert.ok(events.some((e) => e.action === 'PREVIEW_BLOCKED' && e.entityId?.includes(inquiryNumber)));
  });

  it('blocks IDOR on costing preview', async () => {
    const { inquiryId, lineId } = await createInquiryWithConfirmedDrum();
    const steal = await json(
      base,
      `/api/v2/inquiries/${inquiryId}/lines/${lineId}/costing-runs/preview`,
      { method: 'POST', headers: { Authorization: `Bearer ${tokenB}` } }
    );
    assert.equal(steal.status, 403);
  });

  it('returns current run null before persist', async () => {
    const { inquiryId, lineId } = await createInquiryWithConfirmedDrum();
    const res = await json(
      base,
      `/api/v2/inquiries/${inquiryId}/lines/${lineId}/costing-runs/current`,
      { headers: { Authorization: `Bearer ${internalToken}` } }
    );
    assert.equal(res.status, 200);
    assert.equal(res.body.run, null);
  });

  it('calculate does not persist when gates fail (immutability guard)', async () => {
    const { inquiryId, lineId } = await createInquiryWithConfirmedDrum();
    const res = await json(
      base,
      `/api/v2/inquiries/${inquiryId}/lines/${lineId}/costing-runs/calculate`,
      { method: 'POST', headers: { Authorization: `Bearer ${internalToken}` } }
    );
    assert.equal(res.status, 200);
    assert.equal(res.body.persisted, false);
    assert.equal(res.body.status, 'NOT_READY');

    const prisma = getPrisma()!;
    const count = await prisma.costingCalculation.count({
      where: { inquiryLineId: lineId, workflowChannel: V2_COSTING_WORKFLOW_CHANNEL },
    });
    assert.equal(count, 0);
  });
});
