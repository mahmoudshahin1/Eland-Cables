import assert from 'node:assert/strict';
import { after, before, describe, it } from 'node:test';
import http from 'node:http';
import express from 'express';
import dotenv from 'dotenv';
import { checkDatabase, getPrisma } from '../server/db';
import { identityAuthRouter } from '../server/identityAuthRoutes';
import { containerStudyRouter } from '../server/containerStudyRoutes';
import { seedDevelopmentUsers } from '../server/identityService';
import { hashPassword } from '../domain/passwordService';
import { SYSTEM_ADMIN_ROLE_CODE } from '../domain/permissionCatalog';
import { createContainerTypeVersion } from '../server/containerMasterRepository';
import { activateAlgorithmConfiguration } from '../server/algorithmConfigurationRepository';
import { deleteV2LineageForInquiries } from './containerStudyTestCleanup';
import {
  CONTAINER_STUDY_DRUM_PLAN_REQUIRED_MESSAGE,
  CONTAINER_STUDY_DRUM_PLAN_UNCONFIRMED_MESSAGE,
  CONTAINER_STUDY_PHYSICAL_SCHEDULE_MISSING_MESSAGE,
} from '../domain/inquiryContainerStudyPresentation';

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

describe('Container Study Version A compatibility', () => {
  let base = '';
  let server: http.Server;
  let tokenInternal = '';
  let tokenA = '';
  let tokenB = '';
  let actorInternal: { id: string; email: string; name: string; userType: 'internal' };
  let customerAId = '';
  const suffix = `va-${Date.now().toString(36)}`;
  const drumA = `EWD-VA-${suffix}-A`;
  const drumB = `EWD-VA-${suffix}-B`;
  const drumC = `EWD-VA-${suffix}-C`;
  const materialNumber = `MAT-VA-${suffix}`.slice(0, 40);
  const inquiryIds: string[] = [];

  before(async () => {
    const health = await checkDatabase();
    assert.equal(health.ok, true, health.error);
    await seedDevelopmentUsers();
    const prisma = getPrisma()!;
    const adminRole = await prisma.role.findFirst({ where: { code: SYSTEM_ADMIN_ROLE_CODE } });
    const customerRole = await prisma.role.findFirst({ where: { code: 'CUSTOMER_USER' } });
    assert.ok(adminRole && customerRole);
    const custA = await prisma.customer.create({ data: { code: `VA-A-${suffix}`, name: 'VA A' } });
    const custB = await prisma.customer.create({ data: { code: `VA-B-${suffix}`, name: 'VA B' } });
    customerAId = custA.id;
    const internal = await prisma.userAccount.create({
      data: {
        username: `va-int-${suffix}`,
        email: `va-int-${suffix}@test.local`,
        fullName: 'VA Internal',
        userType: 'internal',
        passwordHash: await hashPassword('VATest@2026!'),
        status: 'ACTIVE',
      },
    });
    const userA = await prisma.userAccount.create({
      data: {
        username: `va-a-${suffix}`,
        email: `va-a-${suffix}@test.local`,
        fullName: 'VA A',
        userType: 'customer',
        passwordHash: await hashPassword('VATest@2026!'),
        status: 'ACTIVE',
      },
    });
    const userB = await prisma.userAccount.create({
      data: {
        username: `va-b-${suffix}`,
        email: `va-b-${suffix}@test.local`,
        fullName: 'VA B',
        userType: 'customer',
        passwordHash: await hashPassword('VATest@2026!'),
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
        { userId: internal.id, roleId: adminRole.id },
        { userId: userA.id, roleId: customerRole.id },
        { userId: userB.id, roleId: customerRole.id },
      ],
    });
    actorInternal = {
      id: internal.id,
      email: internal.email!,
      name: internal.fullName!,
      userType: 'internal',
    };
    for (const drumCode of [drumA, drumB, drumC]) {
      await prisma.drumMaster.upsert({
        where: { drumCode },
        create: {
          drumCode,
          drumType: 'WOOD',
          flange: 1100,
          barrel: 500,
          innerWidth: 600,
          outerWidth: 760,
          capacity: 5000,
          maxWeight: 5000,
          clearanceMm: 50,
          emptyDrumNetWeightKg: 80,
          status: 'ACTIVE',
        },
        update: { status: 'ACTIVE' },
      });
    }
    await prisma.cableMaster.create({
      data: {
        materialNumber,
        itemCode: materialNumber,
        customerCode: 'VA-TEST',
        description: 'VA compatibility cable',
        diameter: 20,
        weight: 400,
        status: 'ACTIVE',
      },
    });
    const app = express();
    app.use(express.json());
    app.use('/api/auth', identityAuthRouter);
    app.use('/api/v2', containerStudyRouter);
    const started = await listen(app);
    server = started.server;
    base = started.base;
    const loginInt = await json(base, '/api/auth/login', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ email: internal.email, password: 'VATest@2026!' }),
    });
    const loginA = await json(base, '/api/auth/login', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ email: userA.email, password: 'VATest@2026!' }),
    });
    const loginB = await json(base, '/api/auth/login', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ email: userB.email, password: 'VATest@2026!' }),
    });
    assert.equal(loginInt.status, 200, loginInt.body.error);
    assert.equal(loginA.status, 200, loginA.body.error);
    assert.equal(loginB.status, 200, loginB.body.error);
    tokenInternal = loginInt.body.accessToken;
    tokenA = loginA.body.accessToken;
    tokenB = loginB.body.accessToken;
    await createContainerTypeVersion(
      '40HQ',
      {
        parityLabel: '40 HQ',
        usableLengthMm: 12001,
        internalWidthMm: 2351,
        payloadCapacityKg: 26500,
        dimensionsStatus: 'APPROVED',
      },
      actorInternal
    );
    await activateAlgorithmConfiguration('CFG-LEGACY-FIRST-FIT-V1', actorInternal);
    for (const drumCode of [drumA, drumB, drumC]) {
      await json(base, '/api/v2/packing-profiles', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${tokenInternal}` },
        body: JSON.stringify({
          drumCode,
          packedLengthMm: 1400,
          packedWidthMm: 982,
          packedHeightMm: 2600,
        }),
      });
    }
  });

  after(async () => {
    const prisma = getPrisma();
    if (prisma && inquiryIds.length) {
      await deleteV2LineageForInquiries(prisma, inquiryIds);
      await prisma.commercialInquiryLine.deleteMany({ where: { inquiryId: { in: inquiryIds } } });
      await prisma.commercialInquiry.deleteMany({ where: { id: { in: inquiryIds } } });
    }
    await new Promise<void>((resolve, reject) => server.close((err) => (err ? reject(err) : resolve())));
  });

  async function createVersionAInquiry(input: {
    lifecycleStatus?: 'DRAFT' | 'CONFIRMED';
    rows?: Array<{ drumCode: string; noOfDrums: number; cuttingLengthM: number }>;
    cuttingOnly?: boolean;
  }) {
    const prisma = getPrisma()!;
    const inquiry = await prisma.commercialInquiry.create({
      data: {
        inquiryNumber: `INQ-VA-${suffix}-${inquiryIds.length + 1}`,
        customerId: customerAId,
        customerMasterId: customerAId,
        customerName: 'VA A',
        inquiryDate: new Date('2026-09-19T12:00:00.000Z'),
        status: 'DRAFT',
        incoterms: 'FOB',
        commercialMetadata: {
          inquiryProcessCode: 'VIP_FAST_TRACK',
          inquiryProcessSource: 'CUSTOMER_OVERRIDE',
        },
      },
    });
    inquiryIds.push(inquiry.id);
    const rows = input.rows ?? [
      { drumCode: drumA, noOfDrums: 2, cuttingLengthM: 1500, drumTolerancePercent: 1 },
      { drumCode: drumB, noOfDrums: 1, cuttingLengthM: 1000, drumTolerancePercent: 1 },
      { drumCode: drumC, noOfDrums: 3, cuttingLengthM: 800, drumTolerancePercent: 1 },
    ];
    await prisma.commercialInquiryLine.create({
      data: {
        inquiryId: inquiry.id,
        lineNumber: 1,
        cableDescription: 'VA cable',
        materialNumber,
        requestedQuantity: 6.4,
        requestedLengthMeters: 6400,
        cuttingLengthMeters: input.cuttingOnly ? 1500 : 1500,
        status: 'CABLE_VALIDATED',
        drumSchedule: input.cuttingOnly
          ? undefined
          : {
              cableTolerancePercent: 1,
              rows,
              ...(input.lifecycleStatus
                ? {
                    lifecycleStatus: input.lifecycleStatus,
                    versionNo: 1,
                    confirmedAt: input.lifecycleStatus === 'CONFIRMED' ? new Date().toISOString() : null,
                  }
                : {}),
            },
      },
    });
    return inquiry;
  }

  it('confirmed Version A schedule loads physical drums without a V2 workflow error', async () => {
    const inquiry = await createVersionAInquiry({ lifecycleStatus: 'CONFIRMED' });
    const ws = await json(base, `/api/v2/inquiries/${inquiry.inquiryNumber}/container-study-workspace?region=Europe`, {
      headers: { Authorization: `Bearer ${tokenA}` },
    });
    assert.equal(ws.status, 200, ws.body.error);
    assert.equal(typeof ws.body.error, 'undefined');
    assert.equal(/V2 configuration workflow record/i.test(String(ws.body.error || '')), false);
    assert.equal(ws.body.summary.totalDrums, 6);
    assert.equal(ws.body.summary.totalCuttingLengthM, 6400);
    assert.equal(ws.body.physicalDrums.length, 6);
    assert.equal(ws.body.readiness.ok, true);
  });

  it('unconfirmed Version A drums are visible and calculate is blocked until confirm', async () => {
    const inquiry = await createVersionAInquiry({ lifecycleStatus: 'DRAFT' });
    const ws = await json(base, `/api/v2/inquiries/${inquiry.id}/container-study-workspace?region=Europe`, {
      headers: { Authorization: `Bearer ${tokenA}` },
    });
    assert.equal(ws.status, 200, ws.body.error);
    assert.equal(ws.body.summary.totalDrums, 6);
    assert.equal(ws.body.readiness.ok, false);
    assert.equal(
      ws.body.readiness.issues.some((issue: { message: string }) => issue.message === CONTAINER_STUDY_DRUM_PLAN_UNCONFIRMED_MESSAGE),
      true
    );
    const calc = await json(base, `/api/v2/inquiries/${inquiry.id}/container-study-workspace/calculate`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${tokenA}` },
      body: JSON.stringify({ region: 'Europe' }),
    });
    assert.equal(calc.status, 400);
    assert.equal(calc.body.error, CONTAINER_STUDY_DRUM_PLAN_UNCONFIRMED_MESSAGE);
  });

  it('cutting without drums requires a confirmed drum plan', async () => {
    const inquiry = await createVersionAInquiry({ cuttingOnly: true });
    const ws = await json(base, `/api/v2/inquiries/${inquiry.id}/container-study-workspace?region=Europe`, {
      headers: { Authorization: `Bearer ${tokenA}` },
    });
    assert.equal(ws.status, 200, ws.body.error);
    assert.equal(ws.body.summary.totalDrums, 0);
    assert.equal(
      ws.body.readiness.issues.some((issue: { message: string }) => issue.message === CONTAINER_STUDY_DRUM_PLAN_REQUIRED_MESSAGE),
      true
    );
  });

  it('empty inquiry returns no calculation and a missing-schedule message', async () => {
    const prisma = getPrisma()!;
    const inquiry = await prisma.commercialInquiry.create({
      data: {
        inquiryNumber: `INQ-VA-${suffix}-empty`,
        customerId: customerAId,
        customerMasterId: customerAId,
        customerName: 'VA A',
        inquiryDate: new Date('2026-09-19T12:00:00.000Z'),
        status: 'DRAFT',
        commercialMetadata: { inquiryProcessCode: 'VIP_FAST_TRACK' },
      },
    });
    inquiryIds.push(inquiry.id);
    await prisma.commercialInquiryLine.create({
      data: {
        inquiryId: inquiry.id,
        lineNumber: 1,
        cableDescription: 'Empty line',
        requestedQuantity: 1,
        requestedLengthMeters: 0,
        status: 'DRAFT',
      },
    });
    const ws = await json(base, `/api/v2/inquiries/${inquiry.id}/container-study-workspace?region=Europe`, {
      headers: { Authorization: `Bearer ${tokenA}` },
    });
    assert.equal(ws.status, 200, ws.body.error);
    assert.equal(ws.body.summary.totalDrums, 0);
    assert.equal(
      ws.body.readiness.issues.some((issue: { message: string }) => issue.message === CONTAINER_STUDY_PHYSICAL_SCHEDULE_MISSING_MESSAGE),
      true
    );
    const calc = await json(base, `/api/v2/inquiries/${inquiry.id}/container-study-workspace/calculate`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${tokenA}` },
      body: JSON.stringify({ region: 'Europe' }),
    });
    assert.equal(calc.status, 400);
    assert.equal(calc.body.error, CONTAINER_STUDY_PHYSICAL_SCHEDULE_MISSING_MESSAGE);
  });

  it('customer isolation blocks a foreign Version A inquiry', async () => {
    const inquiry = await createVersionAInquiry({ lifecycleStatus: 'CONFIRMED' });
    const ws = await json(base, `/api/v2/inquiries/${inquiry.id}/container-study-workspace?region=Europe`, {
      headers: { Authorization: `Bearer ${tokenB}` },
    });
    assert.ok(ws.status === 401 || ws.status === 403 || ws.status === 404);
    assert.equal(/V2 configuration workflow record/i.test(String(ws.body.error || '')), false);
  });

  it('confirmed Version A calculate produces container options from physical drums', async () => {
    const inquiry = await createVersionAInquiry({ lifecycleStatus: 'CONFIRMED' });
    const calc = await json(base, `/api/v2/inquiries/${inquiry.id}/container-study-workspace/calculate`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${tokenA}` },
      body: JSON.stringify({ region: 'Europe' }),
    });
    assert.equal(calc.status, 200, JSON.stringify(calc.body));
    assert.equal(calc.body.summary.totalDrums, 6);
    assert.equal(calc.body.summary.totalCuttingLengthM, 6400);
    assert.ok(Array.isArray(calc.body.options));
    assert.ok(calc.body.options.length > 0);
    assert.equal(calc.body.calculation?.ok, true);
  });
});
