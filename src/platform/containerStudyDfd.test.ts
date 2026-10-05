import assert from 'node:assert/strict';
import { after, before, describe, it } from 'node:test';
import http from 'node:http';
import express from 'express';
import dotenv from 'dotenv';
import { Prisma } from '@prisma/client';
import { checkDatabase, getPrisma } from '../server/db';
import { identityAuthRouter } from '../server/identityAuthRoutes';
import { v2InquiryConfigurationRouter } from '../server/v2InquiryConfigurationRoutes';
import { containerStudyRouter } from '../server/containerStudyRoutes';
import { costingRouter } from '../server/costingRoutes';
import { seedDevelopmentUsers } from '../server/identityService';
import { hashPassword } from '../domain/passwordService';
import { SYSTEM_ADMIN_ROLE_CODE } from '../domain/permissionCatalog';
import { createContainerTypeVersion } from '../server/containerMasterRepository';
import { activateAlgorithmConfiguration } from '../server/algorithmConfigurationRepository';
import { deleteV2LineageForInquiries } from './containerStudyTestCleanup';
import { deleteCostingArtifactsForInquiryLines } from '../server/costingArtifactCleanup';
import { dateOnlyToUtc } from '../domain/shippingCostCanonical';
import { executeCostingForInquiryLine } from '../server/costingOrchestrationService';
import { buildCostingRequestFromPreviewPayload } from '../services/costingRequestService';
import {
  auditCostingContainerStudyPin,
  loadShippingBoundToPinnedResult,
  resolveCostingContainerStudyPin,
} from '../server/costingContainerStudyPinService';
import {
  CONTAINER_STUDY_RESULT_INQUIRY_MISMATCH,
  CONTAINER_STUDY_RESULT_REQUIRED,
  CONTAINER_STUDY_RESULT_STUDY_MISMATCH,
  containerStudyRequiredForCosting,
  historicalCostingPinRemainsValid,
} from '../domain/costingContainerStudyPin';
import { listServerAuditEvents } from '../server/serverAudit';
import { ensureNumberSequencesAheadOfExisting } from '../server/testNumberSequenceIsolation';

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

describe('Task 05I-DF-D — CostingRun pins immutable ContainerStudyResult', () => {
  let base = '';
  let server: http.Server;
  let tokenInternal = '';
  let tokenA = '';
  let custAId = '';
  let actorInternal: { id: string; email: string; name: string; userType: 'internal' };
  const suffix = `dfd-${Date.now()}-${process.pid}-${Math.random().toString(36).slice(2, 8)}`;
  const drumCode = `EWD-DFD-${suffix}`;
  const materialNumber = `TEST-MAT-DFD-${suffix}`;
  const inquiryIds: string[] = [];
  const inquiryLineIds: string[] = [];
  const rateIds: string[] = [];

  async function forceStandard(inquiryId: string) {
    const prisma = getPrisma()!;
    const inquiry = await prisma.commercialInquiry.findUniqueOrThrow({ where: { id: inquiryId } });
    const meta =
      inquiry.commercialMetadata && typeof inquiry.commercialMetadata === 'object'
        ? { ...(inquiry.commercialMetadata as Record<string, unknown>) }
        : {};
    await prisma.commercialInquiry.update({
      where: { id: inquiryId },
      data: {
        commercialMetadata: {
          ...meta,
          inquiryProcessCode: 'STANDARD_WORKFLOW',
          inquiryProcessSource: 'SYSTEM_DEFAULT',
        },
      },
    });
  }

  async function saveInquiryDelivery(
    inquiryId: string,
    destinationPortCode: string,
    incotermCode: string,
    deliveryDestination: string
  ) {
    const prisma = getPrisma()!;
    const inquiry = await prisma.commercialInquiry.findUniqueOrThrow({ where: { id: inquiryId } });
    const meta =
      inquiry.commercialMetadata && typeof inquiry.commercialMetadata === 'object'
        ? { ...(inquiry.commercialMetadata as Record<string, unknown>) }
        : {};
    await prisma.commercialInquiry.update({
      where: { id: inquiryId },
      data: {
        incoterms: incotermCode,
        commercialMetadata: {
          ...meta,
          destinationPortCode,
          incoterms: incotermCode,
          deliveryDestination,
        },
      },
    });
  }

  async function seedValidSnapshot(inquiryId: string, lineId: string, inquiryNumber: string, lineNumber: number) {
    const prisma = getPrisma()!;
    const snapshot = await prisma.v2ConfigurationSnapshot.create({
      data: {
        snapshotId: `v2cfg-${inquiryNumber}-L${lineNumber}-v1-${suffix}`,
        versionNo: 1,
        inquiryLineId: lineId,
        cableMaterialNumber: materialNumber,
        itemCode: 'TEST-ITEM-DFD',
        customerCode: 'TEST-CUST-DFD',
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

  async function createInquiryWithLine(projectName: string) {
    const created = await json(base, '/api/v2/inquiries', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${tokenA}` },
      body: JSON.stringify({ projectName }),
    });
    assert.equal(created.status, 201, created.body.error || JSON.stringify(created.body));
    const inquiryId = created.body.inquiry.id as string;
    inquiryIds.push(inquiryId);
    const inquiryNumber = created.body.inquiry.inquiryNumber as string;
    const lineRes = await json(base, `/api/v2/inquiries/${inquiryId}/lines`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${tokenA}` },
      body: JSON.stringify({ cableDescription: `${projectName} line` }),
    });
    assert.equal(lineRes.status, 201, lineRes.body.error || JSON.stringify(lineRes.body));
    inquiryLineIds.push(lineRes.body.line.id as string);
    await forceStandard(inquiryId);
    await saveInquiryDelivery(inquiryId, 'ROTTERDAM', 'CIF', 'Rotterdam');
    return {
      inquiryId,
      inquiryNumber,
      lineId: lineRes.body.line.id as string,
      lineNumber: lineRes.body.line.lineNumber as number,
    };
  }

  async function confirmDrumForLine(inquiryId: string, lineId: string, inquiryNumber: string, lineNumber: number) {
    await seedValidSnapshot(inquiryId, lineId, inquiryNumber, lineNumber);
    const cutting = await json(base, `/api/v2/inquiries/${inquiryId}/lines/${lineId}/cutting-plans`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${tokenA}` },
      body: JSON.stringify({ nominalLengthM: 500, tolerancePercent: 1 }),
    });
    assert.equal(cutting.status, 201, cutting.body.error || JSON.stringify(cutting.body));
    const drum = await json(base, `/api/v2/inquiries/${inquiryId}/lines/${lineId}/drum-plans`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${tokenA}` },
      body: JSON.stringify({
        selectionMethod: 'MANUAL',
        rows: [{ drumCode, numberOfDrums: 1, cuttingLengthM: 500, drumTolerancePercent: 0 }],
      }),
    });
    assert.equal(drum.status, 201, drum.body.error || JSON.stringify(drum.body));
    const planId = drum.body.drumPlan.planId as string;
    const validated = await json(base, `/api/v2/inquiries/${inquiryId}/lines/${lineId}/drum-plans/${planId}/validate`, {
      method: 'POST',
      headers: { Authorization: `Bearer ${tokenA}` },
    });
    assert.ok(validated.status === 200 || validated.status === 201, validated.body.error || JSON.stringify(validated.body));
    const confirmed = await json(base, `/api/v2/inquiries/${inquiryId}/lines/${lineId}/drum-plans/${planId}/confirm`, {
      method: 'POST',
      headers: { Authorization: `Bearer ${tokenA}` },
    });
    assert.ok(confirmed.status === 200 || confirmed.status === 201, confirmed.body.error || JSON.stringify(confirmed.body));
    return {
      planId,
      drumPlanDbId: (confirmed.body.drumPlan.id || drum.body.drumPlan.id) as string,
    };
  }

  async function captureSnapshot(input: {
    inquiryId: string;
    lineId: string;
    groupCode: string;
    drumPlanId: string;
  }) {
    const groupRes = await json(base, `/api/v2/inquiries/${input.inquiryId}/shipment-groups`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${tokenInternal}` },
      body: JSON.stringify({
        groupCode: input.groupCode,
        deliveryAllocationMode: 'ENTIRE_INQUIRY',
        destinationPortCode: 'ROTTERDAM',
        incotermCode: 'CIF',
      }),
    });
    assert.equal(groupRes.status, 201, groupRes.body.error || JSON.stringify(groupRes.body));
    const studyRes = await json(base, `/api/v2/inquiries/${input.inquiryId}/container-studies`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${tokenInternal}` },
      body: JSON.stringify({
        shipmentGroupId: groupRes.body.id,
        stuffingMethod: 'Rolling',
        region: 'Europe',
      }),
    });
    assert.equal(studyRes.status, 201, studyRes.body.error || JSON.stringify(studyRes.body));
    const snap = await json(base, `/api/v2/container-studies/${studyRes.body.id}/input-snapshot`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${tokenInternal}` },
      body: JSON.stringify({
        inquiryLineId: input.lineId,
        drumPlanId: input.drumPlanId,
        configurationId: 'CFG-LEGACY-FIRST-FIT-V1',
      }),
    });
    assert.equal(snap.status, 201, JSON.stringify(snap.body));
    return { group: groupRes, study: studyRes, snap };
  }

  async function calculateStudy(inquiryId: string) {
    const calc = await json(base, `/api/v2/inquiries/${inquiryId}/container-study-workspace/calculate`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${tokenInternal}` },
      body: JSON.stringify({ region: 'Europe' }),
    });
    assert.equal(calc.status, 200, JSON.stringify(calc.body));
    assert.equal(calc.body.calculation?.ok, true);
    return calc.body.study.currentResultId as string;
  }

  async function persistPinnedRun(inquiryId: string, lineId: string, resultId: string, tag: string) {
    const pin = await resolveCostingContainerStudyPin({
      inquiryId,
      inquiryLineId: lineId,
      requestedResultId: resultId,
    });
    assert.equal(pin.ok, true, JSON.stringify(pin));
    if (!pin.ok) throw new Error('pin failed');
    const prisma = getPrisma()!;
    const run = await prisma.costingRun.create({
      data: {
        costingRunNumber: `CR-DFD-${tag}-${suffix}`,
        materialNumber,
        costingDate: new Date(),
        materialCost: 1,
        inquiryLineId: lineId,
        containerStudyResultId: pin.containerStudyResultId,
      },
    });
    await auditCostingContainerStudyPin({
      actor: actorInternal,
      costingRunId: run.id,
      costingRunNumber: run.costingRunNumber,
      containerStudyResultId: pin.containerStudyResultId,
      inquiryId,
      inquiryLineId: lineId,
    });
    return { run, pin };
  }

  before(async () => {
    const health = await checkDatabase();
    assert.equal(health.ok, true, health.error);
    await seedDevelopmentUsers();
    const prisma = getPrisma()!;
    await ensureNumberSequencesAheadOfExisting(prisma);
    await prisma.cableMaster.upsert({
      where: { materialNumber },
      create: {
        materialNumber,
        itemCode: `ITEM-DFD-${suffix}`,
        customerCode: 'TEST-CUST-DFD',
        description: 'DFD costing pin cable',
        diameter: 10,
        weight: 10,
      },
      update: { status: 'ACTIVE' },
    });
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
      update: { status: 'ACTIVE' },
    });
    await prisma.destinationPort.upsert({
      where: { code: 'ROTTERDAM' },
      create: { code: 'ROTTERDAM', name: 'ROTTERDAM', countryCode: 'NL', active: true },
      update: { active: true, name: 'ROTTERDAM' },
    });
    await prisma.destinationPort.upsert({
      where: { code: 'DONCASTER' },
      create: { code: 'DONCASTER', name: 'DONCASTER', countryCode: 'GB', active: true },
      update: { active: true },
    });
    await prisma.incoterm.upsert({
      where: { code: 'CIF' },
      create: { code: 'CIF', name: 'CIF', active: true },
      update: { active: true },
    });
    const adminRole = await prisma.role.findFirst({ where: { code: SYSTEM_ADMIN_ROLE_CODE } });
    const customerRole = await prisma.role.findFirst({ where: { code: 'CUSTOMER_USER' } });
    assert.ok(adminRole && customerRole);
    const custA = await prisma.customer.create({ data: { code: `DFD-A-${suffix}`, name: 'DFD A' } });
    custAId = custA.id;
    const internal = await prisma.userAccount.create({
      data: {
        username: `dfd-int-${suffix}`,
        email: `dfd-int-${suffix}@test.local`,
        fullName: 'DFD Internal',
        userType: 'internal',
        passwordHash: await hashPassword('DfdTest@2026!'),
        status: 'ACTIVE',
      },
    });
    const userA = await prisma.userAccount.create({
      data: {
        username: `dfd-a-${suffix}`,
        email: `dfd-a-${suffix}@test.local`,
        fullName: 'DFD A',
        userType: 'customer',
        passwordHash: await hashPassword('DfdTest@2026!'),
        status: 'ACTIVE',
      },
    });
    await prisma.customerUser.create({ data: { customerId: custA.id, userAccountId: userA.id, status: 'ACTIVE' } });
    await prisma.userRole.createMany({
      data: [
        { userId: internal.id, roleId: adminRole.id },
        { userId: userA.id, roleId: customerRole.id },
      ],
    });
    actorInternal = {
      id: internal.id,
      email: internal.email!,
      name: internal.fullName!,
      userType: 'internal',
    };
    const app = express();
    app.use(express.json());
    app.use('/api/auth', identityAuthRouter);
    app.use('/api/v2/inquiries', v2InquiryConfigurationRouter);
    app.use('/api/v2', containerStudyRouter);
    app.use('/api/costing', costingRouter);
    const started = await listen(app);
    server = started.server;
    base = started.base;
    const loginInt = await json(base, '/api/auth/login', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ email: internal.email, password: 'DfdTest@2026!' }),
    });
    const loginA = await json(base, '/api/auth/login', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ email: userA.email, password: 'DfdTest@2026!' }),
    });
    tokenInternal = loginInt.body.accessToken;
    tokenA = loginA.body.accessToken;
    await createContainerTypeVersion(
      '40HQ',
      {
        parityLabel: '40 HQ',
        usableLengthMm: 12001,
        internalWidthMm: 2351,
        payloadCapacityKg: 25000,
        dimensionsStatus: 'APPROVED',
      },
      actorInternal
    );
    await activateAlgorithmConfiguration('CFG-LEGACY-FIRST-FIT-V1', actorInternal);
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
  });

  after(async () => {
    const prisma = getPrisma();
    if (prisma) {
      await deleteCostingArtifactsForInquiryLines(prisma, inquiryLineIds);
      await prisma.shippingCostTransactionSnapshot.deleteMany({
        where: { OR: [{ customerId: custAId }, { shippingCostRateId: { in: rateIds } }] },
      });
      await prisma.shipmentCostSnapshot.deleteMany({ where: { inquiryId: { in: inquiryIds } } });
      await deleteV2LineageForInquiries(prisma, inquiryIds);
      await prisma.commercialInquiryLine.deleteMany({ where: { inquiryId: { in: inquiryIds } } });
      await prisma.commercialInquiry.deleteMany({ where: { id: { in: inquiryIds } } });
      if (rateIds.length) await prisma.customerShippingCostRate.deleteMany({ where: { id: { in: rateIds } } });
      await prisma.cableMaster.deleteMany({ where: { materialNumber } });
    }
    await new Promise<void>((resolve, reject) => server.close((err) => (err ? reject(err) : resolve())));
  });

  it('TEST 01 CostingRun can pin a valid ContainerStudyResult', async () => {
    assert.equal(
      containerStudyRequiredForCosting({
        hasInquiry: true,
        processCode: 'STANDARD_WORKFLOW',
        logisticsScenarioActive: true,
      }),
      true
    );
    assert.equal(
      containerStudyRequiredForCosting({
        hasInquiry: true,
        processCode: 'VIP_FAST_TRACK',
        logisticsScenarioActive: true,
      }),
      true
    );
    assert.equal(
      containerStudyRequiredForCosting({
        hasInquiry: true,
        processCode: 'VIP_FAST_TRACK',
        logisticsScenarioActive: false,
      }),
      false
    );
    const created = await createInquiryWithLine(`DFD pin ${suffix}`);
    const drum = await confirmDrumForLine(created.inquiryId, created.lineId, created.inquiryNumber, created.lineNumber);
    await captureSnapshot({
      inquiryId: created.inquiryId,
      lineId: created.lineId,
      groupCode: `SG-DFD-01-${suffix}`,
      drumPlanId: drum.planId,
    });
    const r1 = await calculateStudy(created.inquiryId);
    const { run, pin } = await persistPinnedRun(created.inquiryId, created.lineId, r1, '01');
    assert.equal(pin.containerStudyResultId, r1);
    assert.equal(run.containerStudyResultId, r1);
  });

  it('TEST 02 CostingRun stores the exact result ID', async () => {
    const prisma = getPrisma()!;
    const created = await createInquiryWithLine(`DFD exact ${suffix}`);
    const drum = await confirmDrumForLine(created.inquiryId, created.lineId, created.inquiryNumber, created.lineNumber);
    await captureSnapshot({
      inquiryId: created.inquiryId,
      lineId: created.lineId,
      groupCode: `SG-DFD-02-${suffix}`,
      drumPlanId: drum.planId,
    });
    const r1 = await calculateStudy(created.inquiryId);
    const { run } = await persistPinnedRun(created.inquiryId, created.lineId, r1, '02');
    const stored = await prisma.costingRun.findUniqueOrThrow({ where: { id: run.id } });
    assert.equal(stored.containerStudyResultId, r1);
    assert.notEqual(stored.containerStudyResultId, null);
  });

  it('TEST 03 CostingRun does not dynamically resolve latest result', async () => {
    const prisma = getPrisma()!;
    const created = await createInquiryWithLine(`DFD nodyn ${suffix}`);
    const drum = await confirmDrumForLine(created.inquiryId, created.lineId, created.inquiryNumber, created.lineNumber);
    await captureSnapshot({
      inquiryId: created.inquiryId,
      lineId: created.lineId,
      groupCode: `SG-DFD-03-${suffix}`,
      drumPlanId: drum.planId,
    });
    const r1 = await calculateStudy(created.inquiryId);
    const { run } = await persistPinnedRun(created.inquiryId, created.lineId, r1, '03');
    const r2 = await calculateStudy(created.inquiryId);
    assert.notEqual(r2, r1);
    const stored = await prisma.costingRun.findUniqueOrThrow({ where: { id: run.id } });
    assert.equal(stored.containerStudyResultId, r1);
    assert.notEqual(stored.containerStudyResultId, r2);
    const study = await prisma.containerStudy.findFirstOrThrow({ where: { inquiryId: created.inquiryId } });
    assert.equal(study.currentResultId, r2);
  });

  it('TEST 04 R1 pinned by C1 remains after CS recalc to R2', async () => {
    const prisma = getPrisma()!;
    const created = await createInquiryWithLine(`DFD hist ${suffix}`);
    const drum = await confirmDrumForLine(created.inquiryId, created.lineId, created.inquiryNumber, created.lineNumber);
    await captureSnapshot({
      inquiryId: created.inquiryId,
      lineId: created.lineId,
      groupCode: `SG-DFD-04-${suffix}`,
      drumPlanId: drum.planId,
    });
    const r1 = await calculateStudy(created.inquiryId);
    const { run } = await persistPinnedRun(created.inquiryId, created.lineId, r1, '04');
    const r2 = await calculateStudy(created.inquiryId);
    const stored = await prisma.costingRun.findUniqueOrThrow({ where: { id: run.id } });
    assert.equal(stored.containerStudyResultId, r1);
    assert.equal(historicalCostingPinRemainsValid({ pinnedResultId: stored.containerStudyResultId!, currentResultId: r2 }), true);
  });

  it('TEST 05 New CostingRun may explicitly pin R2', async () => {
    const created = await createInquiryWithLine(`DFD r2 ${suffix}`);
    const drum = await confirmDrumForLine(created.inquiryId, created.lineId, created.inquiryNumber, created.lineNumber);
    await captureSnapshot({
      inquiryId: created.inquiryId,
      lineId: created.lineId,
      groupCode: `SG-DFD-05-${suffix}`,
      drumPlanId: drum.planId,
    });
    const r1 = await calculateStudy(created.inquiryId);
    await persistPinnedRun(created.inquiryId, created.lineId, r1, '05a');
    const r2 = await calculateStudy(created.inquiryId);
    const { run: c2 } = await persistPinnedRun(created.inquiryId, created.lineId, r2, '05b');
    assert.equal(c2.containerStudyResultId, r2);
    assert.notEqual(c2.containerStudyResultId, r1);
  });

  it('TEST 06 Missing required ContainerStudyResult blocks CostingRun', async () => {
    const created = await createInquiryWithLine(`DFD miss ${suffix}`);
    const drum = await confirmDrumForLine(created.inquiryId, created.lineId, created.inquiryNumber, created.lineNumber);
    await captureSnapshot({
      inquiryId: created.inquiryId,
      lineId: created.lineId,
      groupCode: `SG-DFD-06-${suffix}`,
      drumPlanId: drum.planId,
    });
    const pin = await resolveCostingContainerStudyPin({
      inquiryId: created.inquiryId,
      inquiryLineId: created.lineId,
    });
    assert.equal(pin.ok, false);
    if (pin.ok) throw new Error('expected block');
    assert.equal(pin.code, CONTAINER_STUDY_RESULT_REQUIRED);
    const built = buildCostingRequestFromPreviewPayload({
      materialNumber,
      quantity: 1,
      lengthMeters: 1000,
      currency: 'USD',
    });
    assert.ok(!('error' in built));
    if ('error' in built) return;
    const preview = await executeCostingForInquiryLine(built, actorInternal, {
      persist: true,
      inquiryId: created.inquiryId,
      inquiryLineId: created.lineId,
    });
    assert.equal(preview.persisted, false);
    assert.equal(preview.status, 'NOT_READY');
    assert.equal(preview.errorCode, CONTAINER_STUDY_RESULT_REQUIRED);
  });

  it('TEST 07 Mismatched result/study is rejected', async () => {
    const a = await createInquiryWithLine(`DFD misA ${suffix}`);
    const b = await createInquiryWithLine(`DFD misB ${suffix}`);
    const drumA = await confirmDrumForLine(a.inquiryId, a.lineId, a.inquiryNumber, a.lineNumber);
    const drumB = await confirmDrumForLine(b.inquiryId, b.lineId, b.inquiryNumber, b.lineNumber);
    const snapA = await captureSnapshot({
      inquiryId: a.inquiryId,
      lineId: a.lineId,
      groupCode: `SG-DFD-07A-${suffix}`,
      drumPlanId: drumA.planId,
    });
    await captureSnapshot({
      inquiryId: b.inquiryId,
      lineId: b.lineId,
      groupCode: `SG-DFD-07B-${suffix}`,
      drumPlanId: drumB.planId,
    });
    const rB = await calculateStudy(b.inquiryId);
    const pinInquiry = await resolveCostingContainerStudyPin({
      inquiryId: a.inquiryId,
      inquiryLineId: a.lineId,
      requestedResultId: rB,
    });
    assert.equal(pinInquiry.ok, false);
    if (pinInquiry.ok) throw new Error('expected inquiry mismatch');
    assert.equal(pinInquiry.code, CONTAINER_STUDY_RESULT_INQUIRY_MISMATCH);
    const pinStudy = await resolveCostingContainerStudyPin({
      inquiryId: b.inquiryId,
      inquiryLineId: b.lineId,
      requestedResultId: rB,
      expectedStudyId: snapA.study.body.id,
    });
    assert.equal(pinStudy.ok, false);
    if (pinStudy.ok) throw new Error('expected study mismatch');
    assert.equal(pinStudy.code, CONTAINER_STUDY_RESULT_STUDY_MISMATCH);
  });

  it('TEST 08 Historical pinned result remains valid even when not current', async () => {
    const prisma = getPrisma()!;
    const created = await createInquiryWithLine(`DFD stale ${suffix}`);
    const drum = await confirmDrumForLine(created.inquiryId, created.lineId, created.inquiryNumber, created.lineNumber);
    await captureSnapshot({
      inquiryId: created.inquiryId,
      lineId: created.lineId,
      groupCode: `SG-DFD-08-${suffix}`,
      drumPlanId: drum.planId,
    });
    const r1 = await calculateStudy(created.inquiryId);
    const { run } = await persistPinnedRun(created.inquiryId, created.lineId, r1, '08');
    await calculateStudy(created.inquiryId);
    const study = await prisma.containerStudy.findFirstOrThrow({ where: { inquiryId: created.inquiryId } });
    assert.notEqual(study.currentResultId, r1);
    const stored = await prisma.costingRun.findUniqueOrThrow({ where: { id: run.id } });
    const result = await prisma.containerStudyResult.findUniqueOrThrow({ where: { id: stored.containerStudyResultId! } });
    assert.equal(result.id, r1);
    assert.equal(historicalCostingPinRemainsValid({ pinnedResultId: result.id, currentResultId: study.currentResultId }), true);
  });

  it('TEST 09 Live Inquiry destination changes do not affect an existing CostingRun', async () => {
    const prisma = getPrisma()!;
    const created = await createInquiryWithLine(`DFD dest ${suffix}`);
    const drum = await confirmDrumForLine(created.inquiryId, created.lineId, created.inquiryNumber, created.lineNumber);
    await captureSnapshot({
      inquiryId: created.inquiryId,
      lineId: created.lineId,
      groupCode: `SG-DFD-09-${suffix}`,
      drumPlanId: drum.planId,
    });
    const r1 = await calculateStudy(created.inquiryId);
    const { run } = await persistPinnedRun(created.inquiryId, created.lineId, r1, '09');
    await saveInquiryDelivery(created.inquiryId, 'ALEXANDRIA', 'FOB', 'Alexandria metadata override');
    const stored = await prisma.costingRun.findUniqueOrThrow({ where: { id: run.id } });
    assert.equal(stored.containerStudyResultId, r1);
  });

  it('TEST 10 Live Drum Plan changes do not affect an existing CostingRun', async () => {
    const prisma = getPrisma()!;
    const created = await createInquiryWithLine(`DFD drum ${suffix}`);
    const drum = await confirmDrumForLine(created.inquiryId, created.lineId, created.inquiryNumber, created.lineNumber);
    await captureSnapshot({
      inquiryId: created.inquiryId,
      lineId: created.lineId,
      groupCode: `SG-DFD-10-${suffix}`,
      drumPlanId: drum.planId,
    });
    const r1 = await calculateStudy(created.inquiryId);
    const { run } = await persistPinnedRun(created.inquiryId, created.lineId, r1, '10');
    await prisma.v2DrumPlanLine.updateMany({
      where: { drumPlanId: drum.drumPlanDbId },
      data: { numberOfDrums: 9 },
    });
    const stored = await prisma.costingRun.findUniqueOrThrow({ where: { id: run.id } });
    assert.equal(stored.containerStudyResultId, r1);
  });

  it('TEST 11 Customer/default delivery changes do not affect an existing CostingRun', async () => {
    const prisma = getPrisma()!;
    const created = await createInquiryWithLine(`DFD deliv ${suffix}`);
    const drum = await confirmDrumForLine(created.inquiryId, created.lineId, created.inquiryNumber, created.lineNumber);
    await captureSnapshot({
      inquiryId: created.inquiryId,
      lineId: created.lineId,
      groupCode: `SG-DFD-11-${suffix}`,
      drumPlanId: drum.planId,
    });
    const r1 = await calculateStudy(created.inquiryId);
    const { run } = await persistPinnedRun(created.inquiryId, created.lineId, r1, '11');
    await prisma.customerDeliveryCombination.create({
      data: {
        customerId: custAId,
        countryCode: 'GB',
        countryLabel: 'UK',
        incotermCode: 'DAP',
        destinationPortCode: 'DONCASTER',
        active: true,
        isDefault: true,
      },
    });
    const stored = await prisma.costingRun.findUniqueOrThrow({ where: { id: run.id } });
    assert.equal(stored.containerStudyResultId, r1);
  });

  it('TEST 12 Shipping dependency remains bound to the pinned result', async () => {
    const prisma = getPrisma()!;
    const created = await createInquiryWithLine(`DFD ship ${suffix}`);
    const drum = await confirmDrumForLine(created.inquiryId, created.lineId, created.inquiryNumber, created.lineNumber);
    const { group, study } = await captureSnapshot({
      inquiryId: created.inquiryId,
      lineId: created.lineId,
      groupCode: `SG-DFD-12-${suffix}`,
      drumPlanId: drum.planId,
    });
    const r1 = await calculateStudy(created.inquiryId);
    const existingTxn = await prisma.shippingCostTransactionSnapshot.findUnique({
      where: { containerStudyResultId: r1 },
    });
    if (!existingTxn) {
      const rate = await prisma.customerShippingCostRate.create({
        data: {
          customerId: custAId,
          deliveryPoint: 'Rotterdam',
          incotermId: (await prisma.incoterm.findUniqueOrThrow({ where: { code: 'CIF' } })).id,
          containerType: "40' SD/HC",
          amount: new Prisma.Decimal('2000.00'),
          currency: 'USD',
          effectiveFrom: dateOnlyToUtc('2026-01-01'),
          status: 'ACTIVE',
          version: 1,
        },
      });
      rateIds.push(rate.id);
      await prisma.shippingCostTransactionSnapshot.create({
        data: {
          resolutionCode: 'SHIPPING_COST_APPLIED',
          customerId: custAId,
          deliveryPoint: 'Rotterdam',
          containerType: "40' SD/HC",
          shippingCostRateId: rate.id,
          amount: new Prisma.Decimal('2000.00'),
          currency: 'USD',
          containerStudyResultId: r1,
        },
      });
    }
    const existingB4c = await prisma.shipmentCostSnapshot.findUnique({
      where: { containerStudyResultId: r1 },
    });
    if (!existingB4c) {
      await prisma.shipmentCostSnapshot.create({
        data: {
          inquiryId: created.inquiryId,
          shipmentGroupId: group.body.id,
          containerStudyId: study.body.id,
          containerStudyResultId: r1,
          destinationPortCode: 'ROTTERDAM',
          incotermCode: 'CIF',
          rateAsOfDate: dateOnlyToUtc('2026-01-01'),
          totalAmount: new Prisma.Decimal(existingTxn?.amount ?? '2000.00'),
          currencyCode: 'USD',
        },
      });
    }
    const { run, pin } = await persistPinnedRun(created.inquiryId, created.lineId, r1, '12');
    await saveInquiryDelivery(created.inquiryId, 'ALEXANDRIA', 'FOB', 'Alexandria');
    const bound = await loadShippingBoundToPinnedResult(run.containerStudyResultId!);
    assert.equal(bound.containerStudyResultId, r1);
    assert.ok(bound.transactionSnapshot || bound.shipmentCostSnapshot);
    assert.notEqual(bound.shipmentCostSnapshot?.destinationPortCode, 'ALEXANDRIA');
    assert.equal(bound.shipmentCostSnapshot?.destinationPortCode, 'ROTTERDAM');
    assert.equal(pin.shipping?.shipmentCostSnapshot?.destinationPortCode, 'ROTTERDAM');
  });

  it('TEST 13 Customer cannot access internal costing', async () => {
    const created = await createInquiryWithLine(`DFD auth ${suffix}`);
    const costing = await json(base, '/api/costing/calculate', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${tokenA}` },
      body: JSON.stringify({ materialNumber }),
    });
    assert.equal(costing.status, 403);
    const v2 = await json(base, `/api/v2/inquiries/${created.inquiryId}/lines/${created.lineId}/costing-runs/calculate`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${tokenA}` },
      body: JSON.stringify({}),
    });
    assert.equal(v2.status, 403);
  });

  it('TEST 14 Audit event is generated', async () => {
    const created = await createInquiryWithLine(`DFD audit ${suffix}`);
    const drum = await confirmDrumForLine(created.inquiryId, created.lineId, created.inquiryNumber, created.lineNumber);
    await captureSnapshot({
      inquiryId: created.inquiryId,
      lineId: created.lineId,
      groupCode: `SG-DFD-14-${suffix}`,
      drumPlanId: drum.planId,
    });
    const r1 = await calculateStudy(created.inquiryId);
    const { run } = await persistPinnedRun(created.inquiryId, created.lineId, r1, '14');
    const events = await listServerAuditEvents({ entity: 'CostingRun', entityId: run.costingRunNumber, limit: 20 });
    const pinEvent = events.find((e) => e.action === 'PIN_CONTAINER_STUDY_RESULT');
    assert.ok(pinEvent, 'expected PIN_CONTAINER_STUDY_RESULT audit');
    const value = (pinEvent?.newValue || {}) as { containerStudyResultId?: string };
    assert.equal(value.containerStudyResultId, r1);
  });
});
