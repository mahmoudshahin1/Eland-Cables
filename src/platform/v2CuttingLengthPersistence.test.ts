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
      snapshotId: `v2cfg-${inquiryNumber}-L${lineNumber}-v1-test`,
      versionNo: 1,
      inquiryLineId: lineId,
      cableMaterialNumber: 'TEST-MAT-001',
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

describe('Task 05C — V2 cutting length persistence', () => {
  let base = '';
  let server: http.Server;
  let tokenA = '';
  let tokenB = '';
  let adminToken = '';
  const suffix = `v2cut-${Date.now()}`;

  before(async () => {
    const health = await checkDatabase();
    assert.equal(health.ok, true, health.error);
    await seedDevelopmentUsers();
    const prisma = getPrisma()!;
    const role = await prisma.role.findFirst({ where: { code: SYSTEM_ADMIN_ROLE_CODE } });
    assert.ok(role);
    const custA = await prisma.customer.create({ data: { code: `V2CUT-A-${suffix}`, name: 'Cut A' } });
    const custB = await prisma.customer.create({ data: { code: `V2CUT-B-${suffix}`, name: 'Cut B' } });
    const userA = await prisma.userAccount.create({
      data: {
        username: `v2cut-a-${suffix}`,
        email: `v2cut-a-${suffix}@test.local`,
        fullName: 'Cut A',
        userType: 'customer',
        passwordHash: await hashPassword('V2Test@2026!'),
        status: 'ACTIVE',
      },
    });
    const userB = await prisma.userAccount.create({
      data: {
        username: `v2cut-b-${suffix}`,
        email: `v2cut-b-${suffix}@test.local`,
        fullName: 'Cut B',
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
    const loginAdmin = await json(base, '/api/auth/login', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        email: 'admin@energya.com',
        password: process.env.ADMIN_SEED_PASSWORD || 'Admin@2026!',
      }),
    });
    tokenA = loginA.body.accessToken;
    tokenB = loginB.body.accessToken;
    adminToken = loginAdmin.body.accessToken;
    assert.ok(tokenA && tokenB && adminToken);
  });

  after(async () => {
    const prisma = getPrisma();
    if (prisma) {
      await deleteCommercialInquiriesForTestSuffix(prisma, suffix);
      await prisma.v2CuttingLengthPlan.deleteMany({ where: { planId: { contains: suffix } } });
      await prisma.v2CuttingLengthRequirement.deleteMany({
        where: { requirementId: { contains: suffix } },
      });
      await prisma.v2ConfigurationSnapshot.deleteMany({
        where: { snapshotId: { contains: suffix } },
      });
      await prisma.customerUser.deleteMany({ where: { userAccount: { email: { contains: suffix } } } });
      await prisma.userRole.deleteMany({ where: { user: { email: { contains: suffix } } } });
      await prisma.userAccount.deleteMany({ where: { email: { contains: suffix } } });
      await prisma.customer.deleteMany({ where: { code: { contains: suffix } } });
    }
    await new Promise<void>((resolve, reject) => server.close((err) => (err ? reject(err) : resolve())));
  });

  it('creates versioned cutting plan linked to snapshot FK', async () => {
    const created = await json(base, '/api/v2/inquiries', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${tokenA}` },
      body: JSON.stringify({ projectName: `Cut ${suffix}` }),
    });
    const inquiryId = created.body.inquiry.id;
    const lineRes = await json(base, `/api/v2/inquiries/${inquiryId}/lines`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${tokenA}` },
      body: JSON.stringify({ cableDescription: 'Cut line' }),
    });
    const lineId = lineRes.body.line.id;
    const snapshot = await seedValidSnapshot(
      inquiryId,
      lineId,
      created.body.inquiry.inquiryNumber,
      lineRes.body.line.lineNumber
    );

    const planRes = await json(base, `/api/v2/inquiries/${inquiryId}/lines/${lineId}/cutting-plans`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${tokenA}` },
      body: JSON.stringify({ nominalLengthM: 500, tolerancePercent: 1, notes: 'Test notes' }),
    });
    assert.equal(planRes.status, 201, planRes.body.error);
    assert.equal(planRes.body.plan.versionNo, 1);
    assert.equal(planRes.body.plan.configurationSnapshotId, snapshot.id);
    assert.equal(planRes.body.plan.nominalLengthM, 500);
    assert.equal(planRes.body.plan.minLengthM, 495);
    assert.equal(planRes.body.plan.maxLengthM, 505);
    assert.equal(planRes.body.handoff.drumHandoffReady, true);
    assert.equal(planRes.body.handoff.cuttingLengthMeters, 500);
  });

  it('increments version on second plan persist', async () => {
    const created = await json(base, '/api/v2/inquiries', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${tokenA}` },
      body: JSON.stringify({ projectName: `Cut v2 ${suffix}` }),
    });
    const inquiryId = created.body.inquiry.id;
    const lineRes = await json(base, `/api/v2/inquiries/${inquiryId}/lines`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${tokenA}` },
      body: JSON.stringify({ cableDescription: 'Cut line v2' }),
    });
    const lineId = lineRes.body.line.id;
    await seedValidSnapshot(
      inquiryId,
      lineId,
      created.body.inquiry.inquiryNumber,
      lineRes.body.line.lineNumber
    );

    await json(base, `/api/v2/inquiries/${inquiryId}/lines/${lineId}/cutting-plans`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${tokenA}` },
      body: JSON.stringify({ nominalLengthM: 500, tolerancePercent: 1 }),
    });
    const second = await json(base, `/api/v2/inquiries/${inquiryId}/lines/${lineId}/cutting-plans`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${tokenA}` },
      body: JSON.stringify({ nominalLengthM: 1000, tolerancePercent: 0.5 }),
    });
    assert.equal(second.status, 201);
    assert.equal(second.body.plan.versionNo, 2);

    const list = await json(base, `/api/v2/inquiries/${inquiryId}/lines/${lineId}/cutting-plans`, {
      headers: { Authorization: `Bearer ${tokenA}` },
    });
    assert.equal(list.status, 200);
    assert.equal(list.body.plans.length, 2);
  });

  it('rejects without snapshot and blocks IDOR', async () => {
    const created = await json(base, '/api/v2/inquiries', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${tokenA}` },
      body: JSON.stringify({ projectName: `IDOR ${suffix}` }),
    });
    const inquiryId = created.body.inquiry.id;
    const lineRes = await json(base, `/api/v2/inquiries/${inquiryId}/lines`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${tokenA}` },
      body: JSON.stringify({ cableDescription: 'No snap' }),
    });
    const lineId = lineRes.body.line.id;

    const noSnap = await json(base, `/api/v2/inquiries/${inquiryId}/lines/${lineId}/cutting-plans`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${tokenA}` },
      body: JSON.stringify({ nominalLengthM: 500 }),
    });
    assert.equal(noSnap.status, 409);
    assert.equal(noSnap.body.code, 'SNAPSHOT_REQUIRED');

    const steal = await json(base, `/api/v2/inquiries/${inquiryId}/lines/${lineId}/cutting-plans`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${tokenB}` },
      body: JSON.stringify({ nominalLengthM: 500 }),
    });
    assert.equal(steal.status, 403);
  });

  it('returns deterministic handoff DTO', async () => {
    const created = await json(base, '/api/v2/inquiries', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${tokenA}` },
      body: JSON.stringify({ projectName: `Handoff ${suffix}` }),
    });
    const inquiryId = created.body.inquiry.id;
    const lineRes = await json(base, `/api/v2/inquiries/${inquiryId}/lines`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${tokenA}` },
      body: JSON.stringify({ cableDescription: 'Handoff line' }),
    });
    const lineId = lineRes.body.line.id;
    await seedValidSnapshot(
      inquiryId,
      lineId,
      created.body.inquiry.inquiryNumber,
      lineRes.body.line.lineNumber
    );

    const planRes = await json(base, `/api/v2/inquiries/${inquiryId}/lines/${lineId}/cutting-plans`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${tokenA}` },
      body: JSON.stringify({ nominalLengthM: 750, tolerancePercent: 2 }),
    });
    const planId = planRes.body.plan.planId;

    const handoff = await json(
      base,
      `/api/v2/inquiries/${inquiryId}/lines/${lineId}/cutting-plans/${planId}/handoff`,
      { headers: { Authorization: `Bearer ${tokenA}` } }
    );
    assert.equal(handoff.status, 200);
    assert.equal(handoff.body.handoff.cuttingLengthMeters, 750);
    assert.equal(handoff.body.handoff.cableDiameterMm, 25);
    assert.equal(handoff.body.handoff.cableWeightKgKm, 1200);
  });

  it('blocks READY_FOR_COMMERCIAL without cutting plan per line', async () => {
    const created = await json(base, '/api/v2/inquiries', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${tokenA}` },
      body: JSON.stringify({ projectName: `Gate ${suffix}` }),
    });
    const inquiryId = created.body.inquiry.id;
    const lineRes = await json(base, `/api/v2/inquiries/${inquiryId}/lines`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${tokenA}` },
      body: JSON.stringify({ cableDescription: 'Gate line' }),
    });
    const lineId = lineRes.body.line.id;
    await seedValidSnapshot(
      inquiryId,
      lineId,
      created.body.inquiry.inquiryNumber,
      lineRes.body.line.lineNumber
    );

    const prisma = getPrisma()!;
    await prisma.commercialInquiry.update({
      where: { id: inquiryId },
      data: { status: 'ENGINEERING_REVIEW' },
    });

    const blocked = await json(base, `/api/v2/inquiries/${inquiryId}/engineering-status`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${adminToken}` },
      body: JSON.stringify({ status: 'READY_FOR_COMMERCIAL' }),
    });
    assert.equal(blocked.status, 409);
    assert.equal(blocked.body.code, 'CUTTING_PLAN_REQUIRED');

    const planAdded = await json(base, `/api/v2/inquiries/${inquiryId}/lines/${lineId}/cutting-plans`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${tokenA}` },
      body: JSON.stringify({ nominalLengthM: 500, tolerancePercent: 1 }),
    });
    assert.equal(planAdded.status, 201, planAdded.body.error);

    const allowed = await json(base, `/api/v2/inquiries/${inquiryId}/engineering-status`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${adminToken}` },
      body: JSON.stringify({ status: 'READY_FOR_COMMERCIAL' }),
    });
    assert.equal(allowed.status, 200, allowed.body.error);
    assert.equal(allowed.body.inquiry.status, 'READY_FOR_COMMERCIAL');
  });

  it('records appendServerAudit on persist', async () => {
    const created = await json(base, '/api/v2/inquiries', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${tokenA}` },
      body: JSON.stringify({ projectName: `Audit ${suffix}` }),
    });
    const inquiryId = created.body.inquiry.id;
    const lineRes = await json(base, `/api/v2/inquiries/${inquiryId}/lines`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${tokenA}` },
      body: JSON.stringify({ cableDescription: 'Audit line' }),
    });
    const lineId = lineRes.body.line.id;
    await seedValidSnapshot(
      inquiryId,
      lineId,
      created.body.inquiry.inquiryNumber,
      lineRes.body.line.lineNumber
    );

    const planRes = await json(base, `/api/v2/inquiries/${inquiryId}/lines/${lineId}/cutting-plans`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${tokenA}` },
      body: JSON.stringify({ nominalLengthM: 500 }),
    });
    const prisma = getPrisma()!;
    const audits = await prisma.auditEvent.findMany({
      where: { entityId: planRes.body.plan.planId, action: 'PERSIST' },
    });
    assert.ok(audits.length >= 1);
  });
});
