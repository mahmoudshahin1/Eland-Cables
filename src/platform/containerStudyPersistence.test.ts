import assert from 'node:assert/strict';
import { after, before, describe, it } from 'node:test';
import http from 'node:http';
import express from 'express';
import dotenv from 'dotenv';
import { checkDatabase, getPrisma } from '../server/db';
import { identityAuthRouter } from '../server/identityAuthRoutes';
import { v2InquiryConfigurationRouter } from '../server/v2InquiryConfigurationRoutes';
import { containerStudyRouter } from '../server/containerStudyRoutes';
import { seedDevelopmentUsers } from '../server/identityService';
import { hashPassword } from '../domain/passwordService';
import { SYSTEM_ADMIN_ROLE_CODE } from '../domain/permissionCatalog';
import {
  createContainerTypeVersion,
  deleteContainerTypeVersion,
} from '../server/containerMasterRepository';
import { activateAlgorithmConfiguration } from '../server/algorithmConfigurationRepository';
import { captureInputSnapshot } from '../server/containerStudyRepository';
import { ALLOCATION_KIND_PHYSICAL } from '../domain/containerStudyValidation';
import { ensureNumberSequencesAheadOfExisting } from '../server/testNumberSequenceIsolation';

function testLineage(drums: Array<{ sourceLineId: string; quantity: number }>) {
  const pins = drums.map((d, i) => ({
    v2DrumPlanLineId: d.sourceLineId,
    inquiryLineId: `line-${i}`,
    cuttingLengthRequirementId: `req-${i}`,
    drumPlanId: `plan-${i}`,
    drumPlanVersionNo: 1,
    numberOfDrums: d.quantity,
  }));
  return {
    inquiryId: 'inq-test',
    cuttingLengthRequirementIds: pins.map((p) => p.cuttingLengthRequirementId),
    authoritativeDrumPlanIds: pins.map((p) => p.drumPlanId),
    drumPlans: pins.map((p) => ({
      inquiryLineId: p.inquiryLineId,
      cuttingLengthRequirementId: p.cuttingLengthRequirementId,
      drumPlanId: p.drumPlanId,
      drumPlanVersionNo: 1,
      drumLinePins: [p],
    })),
    drumLinePins: pins,
  };
}

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

describe('Task 05I-DD — Container Study persistence foundation', () => {
  let base = '';
  let server: http.Server;
  let tokenInternal = '';
  let tokenA = '';
  let tokenB = '';
  let actorInternal: { id: string; email: string; name: string; userType: 'internal' };
  const suffix = `cst-${Date.now()}`;

  before(async () => {
    const health = await checkDatabase();
    assert.equal(health.ok, true, health.error);
    await seedDevelopmentUsers();
    const prisma = getPrisma()!;
    const adminRole = await prisma.role.findFirst({ where: { code: SYSTEM_ADMIN_ROLE_CODE } });
    const customerRole = await prisma.role.findFirst({ where: { code: 'CUSTOMER_USER' } });
    assert.ok(adminRole && customerRole);

    const custA = await prisma.customer.create({ data: { code: `CST-A-${suffix}`, name: 'CST A' } });
    const custB = await prisma.customer.create({ data: { code: `CST-B-${suffix}`, name: 'CST B' } });
    const internal = await prisma.userAccount.create({
      data: {
        username: `cst-int-${suffix}`,
        email: `cst-int-${suffix}@test.local`,
        fullName: 'CST Internal',
        userType: 'internal',
        passwordHash: await hashPassword('CstTest@2026!'),
        status: 'ACTIVE',
      },
    });
    const userA = await prisma.userAccount.create({
      data: {
        username: `cst-a-${suffix}`,
        email: `cst-a-${suffix}@test.local`,
        fullName: 'CST A',
        userType: 'customer',
        passwordHash: await hashPassword('CstTest@2026!'),
        status: 'ACTIVE',
      },
    });
    const userB = await prisma.userAccount.create({
      data: {
        username: `cst-b-${suffix}`,
        email: `cst-b-${suffix}@test.local`,
        fullName: 'CST B',
        userType: 'customer',
        passwordHash: await hashPassword('CstTest@2026!'),
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
    await prisma.numberSequence.upsert({
      where: { code: 'CONTAINER_STUDY' },
      create: {
        code: 'CONTAINER_STUDY',
        name: 'Container Study',
        prefix: 'CST',
        format: '{PREFIX}{YY}-{#####}',
        nextSerial: 1,
        moduleId: 'LOGISTICS',
      },
      update: {},
    });
    await ensureNumberSequencesAheadOfExisting(prisma);

    actorInternal = { id: internal.id, email: internal.email, name: internal.fullName, userType: 'internal' };

    const app = express();
    app.use(express.json());
    app.use('/api/auth', identityAuthRouter);
    app.use('/api/v2/inquiries', v2InquiryConfigurationRouter);
    app.use('/api/v2', containerStudyRouter);
    const listening = await listen(app);
    server = listening.server;
    base = listening.base;

    const loginI = await json(base, '/api/auth/login', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ email: internal.email, password: 'CstTest@2026!' }),
    });
    const loginA = await json(base, '/api/auth/login', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ email: userA.email, password: 'CstTest@2026!' }),
    });
    const loginB = await json(base, '/api/auth/login', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ email: userB.email, password: 'CstTest@2026!' }),
    });
    assert.equal(loginI.status, 200, loginI.body.error);
    assert.equal(loginA.status, 200, loginA.body.error);
    assert.equal(loginB.status, 200, loginB.body.error);
    tokenInternal = loginI.body.accessToken;
    tokenA = loginA.body.accessToken;
    tokenB = loginB.body.accessToken;
    assert.ok(tokenInternal && tokenA && tokenB);
  });

  after(async () => {
    const prisma = getPrisma();
    if (prisma) {
      await prisma.containerStudyResultUnallocated.deleteMany({
        where: { result: { study: { studyNumber: { contains: suffix } } } },
      }).catch(() => undefined);
      await prisma.containerStudyResultAllocation.deleteMany({
        where: { result: { study: { customerId: { contains: suffix } } } },
      }).catch(() => undefined);
      await prisma.containerStudyResultContainer.deleteMany({
        where: { result: { study: { studyNumber: { contains: 'CST' } } } },
      }).catch(() => undefined);
      const studies = await prisma.containerStudy.findMany({
        where: { inquiry: { customerName: { contains: 'CST' } } },
        select: { id: true, currentSnapshotId: true, currentResultId: true },
      });
      await prisma.containerStudy.updateMany({
        where: { id: { in: studies.map((s) => s.id) } },
        data: { currentSnapshotId: null, currentResultId: null },
      });
      await prisma.containerStudyResult.deleteMany({ where: { studyId: { in: studies.map((s) => s.id) } } });
      await prisma.containerStudyInputSnapshotContainerPin.deleteMany({
        where: { snapshot: { studyId: { in: studies.map((s) => s.id) } } },
      });
      await prisma.containerStudyInputDrum.deleteMany({
        where: { snapshot: { studyId: { in: studies.map((s) => s.id) } } },
      });
      await prisma.containerStudyInputSnapshot.deleteMany({ where: { studyId: { in: studies.map((s) => s.id) } } });
      await prisma.containerStudy.deleteMany({ where: { id: { in: studies.map((s) => s.id) } } });
      await prisma.containerShipmentGroup.deleteMany({ where: { inquiry: { projectName: { contains: suffix } } } });
      await prisma.commercialInquiryLine.deleteMany({ where: { inquiry: { projectName: { contains: suffix } } } });
      await prisma.commercialInquiry.deleteMany({ where: { projectName: { contains: suffix } } });
      await prisma.customerUser.deleteMany({ where: { userAccount: { email: { contains: suffix } } } });
      await prisma.userRole.deleteMany({ where: { user: { email: { contains: suffix } } } });
      await prisma.userAccount.deleteMany({ where: { email: { contains: suffix } } });
      await prisma.customer.deleteMany({ where: { code: { contains: suffix } } });
    }
    await new Promise<void>((resolve, reject) => server.close((err) => (err ? reject(err) : resolve())));
  });

  async function createInquiryForA() {
    const created = await json(base, '/api/v2/inquiries', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${tokenA}` },
      body: JSON.stringify({ projectName: `CS ${suffix}` }),
    });
    assert.equal(created.status, 201, created.body.error);
    return created.body.inquiry as { id: string; inquiryNumber: string };
  }

  it('seeds catalog types without production dimensions and pending approval', async () => {
    const types = await json(base, '/api/v2/container-types', {
      headers: { Authorization: `Bearer ${tokenInternal}` },
    });
    assert.equal(types.status, 200, types.body.error);
    const codes = (types.body.types || []).map((t: { code: string }) => t.code);
    for (const code of ['40HQ', '40STD', '20STD', '40OT']) {
      assert.ok(codes.includes(code), `missing ${code}`);
    }
    const hq = (types.body.types || []).find((t: { code: string }) => t.code === '40HQ');
    const current = (hq.versions || []).find((v: { versionNo: number }) => v.versionNo === 1);
    assert.ok(current, 'seed version 1 missing');
    assert.equal(current.dimensionsStatus, 'PENDING_APPROVAL');
    assert.equal(current.usableLengthMm, null);
  });

  it('creates study, snapshots, and enforces lifecycle + missing master data', async () => {
    const inquiry = await createInquiryForA();
    const group = await json(base, `/api/v2/inquiries/${inquiry.id}/shipment-groups`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${tokenInternal}` },
      body: JSON.stringify({
        groupCode: `SG-${suffix}`,
        deliveryAllocationMode: 'ENTIRE_INQUIRY',
        destinationPortCode: 'ALEX',
        incotermCode: 'CIF',
      }),
    });
    assert.equal(group.status, 201, group.body.error);

    const deniedCustomerCreate = await json(base, `/api/v2/inquiries/${inquiry.id}/container-studies`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${tokenA}` },
      body: JSON.stringify({
        shipmentGroupId: group.body.id,
        stuffingMethod: 'Rolling',
        region: 'Europe',
      }),
    });
    assert.ok(deniedCustomerCreate.status === 401 || deniedCustomerCreate.status === 403);

    const study = await json(base, `/api/v2/inquiries/${inquiry.id}/container-studies`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${tokenInternal}` },
      body: JSON.stringify({
        shipmentGroupId: group.body.id,
        stuffingMethod: 'Rolling',
        region: 'Europe',
      }),
    });
    assert.equal(study.status, 201, study.body.error);
    assert.match(study.body.studyNumber, /^CST/);
    assert.equal(study.body.status, 'DRAFT');

    const steal = await json(base, `/api/v2/container-studies/${study.body.id}`, {
      headers: { Authorization: `Bearer ${tokenB}` },
    });
    assert.ok(steal.status === 401 || steal.status === 403 || steal.status === 404);

    const ownView = await json(base, `/api/v2/container-studies/${study.body.id}`, {
      headers: { Authorization: `Bearer ${tokenA}` },
    });
    assert.ok(ownView.status === 401 || ownView.status === 403, ownView.body.error);

    const legacySnap = await json(base, `/api/v2/container-studies/${study.body.id}/snapshots`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${tokenInternal}` },
      body: JSON.stringify({
        configurationId: 'CFG-LEGACY-FIRST-FIT-V1',
        drums: [{ sourceLineId: 'L1', quantity: 2, packedLengthMm: 1400, packedWidthMm: 982, grossWeightKg: 1039 }],
      }),
    });
    assert.equal(legacySnap.status, 409, JSON.stringify(legacySnap.body));
    assert.equal(legacySnap.body.code, 'CONFLICT');
    assert.match(String(legacySnap.body.error), /input-snapshot/i);

    const drums = [{ sourceLineId: 'L1', quantity: 2, packedLengthMm: 1400, packedWidthMm: 982, grossWeightKg: 1039 }];
    await captureInputSnapshot(
      study.body.id,
      {
        configurationId: 'CFG-LEGACY-FIRST-FIT-V1',
        drums,
        lineageProvenanceJson: testLineage(drums),
      },
      actorInternal
    );

    const validatePending = await json(base, `/api/v2/container-studies/${study.body.id}/validate`, {
      method: 'POST',
      headers: { Authorization: `Bearer ${tokenInternal}` },
    });
    assert.equal(validatePending.status, 400);
    const issueCodes = (validatePending.body.details?.issues || []).map((i: { code: string }) => i.code);
    assert.ok(issueCodes.includes('DIMENSIONS_PENDING_APPROVAL') || validatePending.body.error);

    const confirmMissing = await json(base, `/api/v2/container-studies/${study.body.id}/confirm`, {
      method: 'POST',
      headers: { Authorization: `Bearer ${tokenInternal}` },
    });
    assert.ok(confirmMissing.status === 400 || confirmMissing.status === 409);

    const prisma = getPrisma()!;
    const events = await prisma.auditEvent.findMany({
      where: { entityId: study.body.id, action: 'CONTAINER_STUDY_CREATED' },
    });
    assert.ok(events.length >= 1);
  });

  it('versions container master, packing profile, and algorithm configuration with audit', async () => {
    const approved = await createContainerTypeVersion(
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
    assert.equal(approved.dimensionsStatus, 'APPROVED');
    assert.equal(Number(approved.usableLengthMm), 12001);

    const profile = await json(base, '/api/v2/packing-profiles', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${tokenInternal}` },
      body: JSON.stringify({
        drumCode: `PROF-${suffix}`,
        packedLengthMm: 1600,
        packedWidthMm: 1120,
      }),
    });
    assert.equal(profile.status, 201, profile.body.error);
    const v2 = await json(base, `/api/v2/packing-profiles/${profile.body.id}/versions`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${tokenInternal}` },
      body: JSON.stringify({ packedLengthMm: 1610, packedWidthMm: 1120 }),
    });
    assert.equal(v2.status, 201, v2.body.error);

    const activated = await json(base, '/api/v2/algorithm-configurations/CFG-LEGACY-FIRST-FIT-V1/activate', {
      method: 'POST',
      headers: { Authorization: `Bearer ${tokenInternal}` },
    });
    assert.equal(activated.status, 200, activated.body.error);
    assert.equal(activated.body.status, 'ACTIVE');
    const blocked = (activated.body.parameters || []).find(
      (p: { name: string }) => p.name === 'POST_ADJUST_REMAINING_LENGTH_GE'
    );
    assert.equal(blocked.ruleStatus, 'BLOCKED');

    const prisma = getPrisma()!;
    const masterAudit = await prisma.auditEvent.findFirst({
      where: { action: 'CONTAINER_MASTER_CHANGED', entityId: approved.containerTypeId },
    });
    const cfgAudit = await prisma.auditEvent.findFirst({
      where: { action: 'ALGORITHM_CONFIGURATION_ACTIVATED' },
    });
    const packAudit = await prisma.auditEvent.findFirst({
      where: { action: 'PACKING_PROFILE_CHANGED', entityId: profile.body.id },
    });
    assert.ok(masterAudit && cfgAudit && packAudit);
  });

  it('pins snapshot versions, refuses Forklifting calculate, and blocks confirmed mutation / referenced delete', async () => {
    await activateAlgorithmConfiguration('CFG-LEGACY-FIRST-FIT-V1', actorInternal);
    const inquiry = await createInquiryForA();
    const group = await json(base, `/api/v2/inquiries/${inquiry.id}/shipment-groups`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${tokenInternal}` },
      body: JSON.stringify({ groupCode: `SG2-${suffix}`, destinationPortCode: 'ALEX', incotermCode: 'CIF' }),
    });
    const rolling = await json(base, `/api/v2/inquiries/${inquiry.id}/container-studies`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${tokenInternal}` },
      body: JSON.stringify({
        shipmentGroupId: group.body.id,
        stuffingMethod: 'Rolling',
        region: 'Africa',
      }),
    });
    const fork = await json(base, `/api/v2/inquiries/${inquiry.id}/container-studies`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${tokenInternal}` },
      body: JSON.stringify({
        shipmentGroupId: group.body.id,
        stuffingMethod: 'Forklifting',
        region: 'Europe',
      }),
    });
    assert.equal(fork.status, 201, fork.body.error);
    assert.equal(fork.body.stuffingMethod, 'Forklifting');

    const prisma = getPrisma()!;
    const currentHqForFork = await prisma.containerTypeVersion.findFirst({
      where: { containerType: { code: '40HQ' }, isCurrent: true },
    });
    assert.ok(currentHqForFork);
    const forkDrums = [{ sourceLineId: 'F1', quantity: 1, packedLengthMm: 1400, packedWidthMm: 982, grossWeightKg: 1000 }];
    await captureInputSnapshot(
      fork.body.id,
      {
        configurationId: 'CFG-LEGACY-FIRST-FIT-V1',
        containerTypeVersionIds: [currentHqForFork.id],
        drums: forkDrums,
        lineageProvenanceJson: testLineage(forkDrums),
      },
      actorInternal
    );

    const calc = await json(base, `/api/v2/container-studies/${fork.body.id}/calculate`, {
      method: 'POST',
      headers: { Authorization: `Bearer ${tokenInternal}` },
    });
    assert.ok(calc.status === 400 || calc.status === 409);
    assert.match(
      JSON.stringify(calc.body),
      /STUFFING_METHOD_NOT_IMPLEMENTED|VALIDATION_FAILED|Forklifting|BLOCKED/i
    );
    assert.doesNotMatch(String(calc.body.error), /converted to Rolling/i);

    const approvedPins = await prisma.containerTypeVersion.findMany({
      where: { isCurrent: true, dimensionsStatus: 'APPROVED' },
    });
    assert.ok(approvedPins.length >= 1);
    const rollingDrums = [{ sourceLineId: 'SRC-1', quantity: 3, packedLengthMm: 2301, packedWidthMm: 982, grossWeightKg: 1000 }];
    const snap = await captureInputSnapshot(
      rolling.body.id,
      {
        configurationId: 'CFG-LEGACY-FIRST-FIT-V1',
        containerTypeVersionIds: approvedPins.map((p) => p.id),
        drums: rollingDrums,
        lineageProvenanceJson: testLineage(rollingDrums),
      },
      actorInternal
    );
    assert.equal(snap.algorithmVersionCode, 'LEGACY_FIRST_FIT_V1');
    assert.equal(snap.drums[0].quantity, 3);
    assert.equal(snap.containerPins.length >= 1, true);

    const pinnedVersion = approvedPins[0]!;
    await assert.rejects(
      () => deleteContainerTypeVersion(pinnedVersion.id, actorInternal),
      (err: Error & { code?: string }) => err.code === 'CONFLICT' || /referenced/.test(err.message)
    );

    const calcRolling = await json(base, `/api/v2/container-studies/${rolling.body.id}/calculate`, {
      method: 'POST',
      headers: { Authorization: `Bearer ${tokenInternal}` },
    });
    assert.equal(calcRolling.status, 200, calcRolling.body.error);
    assert.ok(calcRolling.body.result);
    assert.ok(calcRolling.body.calculation?.summary?.allocatedCount >= 1);
    const firstResultId = calcRolling.body.result.id;

    const calcAgain = await json(base, `/api/v2/container-studies/${rolling.body.id}/calculate`, {
      method: 'POST',
      headers: { Authorization: `Bearer ${tokenInternal}` },
    });
    assert.equal(calcAgain.status, 200, calcAgain.body.error);
    assert.notEqual(calcAgain.body.result.id, firstResultId);
    const resultRows = await prisma.containerStudyResult.findMany({ where: { studyId: rolling.body.id } });
    assert.equal(resultRows.length, 2);
    const studyAfter = await prisma.containerStudy.findUnique({ where: { id: rolling.body.id } });
    assert.equal(studyAfter?.currentResultId, calcAgain.body.result.id);

    const calcAudit = await prisma.auditEvent.findFirst({
      where: { entityId: rolling.body.id, action: 'CONTAINER_STUDY_CALCULATED' },
    });
    assert.ok(calcAudit);

    const snapAudit = await prisma.auditEvent.findFirst({
      where: { entityId: rolling.body.id, action: 'CONTAINER_STUDY_SNAPSHOT_CAPTURED' },
    });
    assert.ok(snapAudit);

    const virtualCount = await prisma.containerStudyResultAllocation.count({
      where: { allocationKind: { not: ALLOCATION_KIND_PHYSICAL } },
    });
    assert.equal(virtualCount, 0);

    await prisma.containerStudy.update({
      where: { id: rolling.body.id },
      data: { status: 'CONFIRMED' },
    });
    await assert.rejects(
      () =>
        captureInputSnapshot(
          rolling.body.id,
          {
            configurationId: 'CFG-LEGACY-FIRST-FIT-V1',
            drums: [{ sourceLineId: 'L9', quantity: 1, packedLengthMm: 1, packedWidthMm: 1, grossWeightKg: 1 }],
          },
          actorInternal
        ),
      (err: Error & { code?: string }) => err.code === 'CONFLICT'
    );
  });

  it('supersedes a study and allocates CONTAINER_STUDY numbers', async () => {
    const inquiry = await createInquiryForA();
    const group = await json(base, `/api/v2/inquiries/${inquiry.id}/shipment-groups`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${tokenInternal}` },
      body: JSON.stringify({ groupCode: `SG3-${suffix}`, destinationPortCode: 'ALEX', incotermCode: 'CIF' }),
    });
    const study = await json(base, `/api/v2/inquiries/${inquiry.id}/container-studies`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${tokenInternal}` },
      body: JSON.stringify({
        shipmentGroupId: group.body.id,
        stuffingMethod: 'Rolling',
        region: 'Europe',
      }),
    });
    const next = await json(base, `/api/v2/container-studies/${study.body.id}/supersede`, {
      method: 'POST',
      headers: { Authorization: `Bearer ${tokenInternal}` },
    });
    assert.equal(next.status, 201, next.body.error);
    assert.equal(next.body.versionNo, 2);
    assert.equal(next.body.status, 'DRAFT');
    const prisma = getPrisma()!;
    const old = await prisma.containerStudy.findUnique({ where: { id: study.body.id } });
    assert.equal(old?.status, 'SUPERSEDED');
  });
});
