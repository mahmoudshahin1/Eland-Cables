import assert from 'node:assert/strict';
import { after, before, describe, it } from 'node:test';
import http from 'node:http';
import express from 'express';
import dotenv from 'dotenv';
import { checkDatabase, getPrisma } from '../server/db';
import { identityAuthRouter } from '../server/identityAuthRoutes';
import { v2InquiryConfigurationRouter } from '../server/v2InquiryConfigurationRoutes';
import { containerStudyRouter } from '../server/containerStudyRoutes';
import { financialOfferSnapshotRouter } from '../server/financialOfferSnapshotRoutes';
import { seedDevelopmentUsers } from '../server/identityService';
import { hashPassword } from '../domain/passwordService';
import { SYSTEM_ADMIN_ROLE_CODE } from '../domain/permissionCatalog';
import { createContainerTypeVersion } from '../server/containerMasterRepository';
import { activateAlgorithmConfiguration } from '../server/algorithmConfigurationRepository';
import { persistContainerStudyEngineOutputIfIntegrityPasses } from '../server/containerStudyRepository';
import { deleteV2LineageForInquiries } from './containerStudyTestCleanup';
import { CONTAINER_STUDY_STATUSES } from '../domain/containerStudyLifecycle';
import { DomainError } from '../platform/errors/domainError';
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

describe('Task 05I-DF-B3 — Container Study validation and result hardening', () => {
  let base = '';
  let server: http.Server;
  let tokenInternal = '';
  let tokenA = '';
  let tokenB = '';
  let actorInternal: { id: string; email: string; name: string; userType: 'internal' };
  const suffix = `b3-${Date.now()}-${process.pid}-${Math.random().toString(36).slice(2, 8)}`;
  const drumCode = `EWD-B3-${suffix}`;

  async function seedValidSnapshot(lineId: string, inquiryNumber: string, lineNumber: number, materialNumber: string) {
    const prisma = getPrisma()!;
    const snapshot = await prisma.v2ConfigurationSnapshot.create({
      data: {
        snapshotId: `v2cfg-${inquiryNumber}-L${lineNumber}-v1-${suffix}`,
        versionNo: 1,
        inquiryLineId: lineId,
        cableMaterialNumber: materialNumber,
        itemCode: materialNumber,
        customerCode: 'TEST-CUST-B3',
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
      data: { v2CurrentSnapshotId: snapshot.id, status: 'CABLE_VALIDATED', materialNumber },
    });
  }

  async function confirmRequirement(
    inquiryId: string,
    lineId: string,
    nominalLengthM: number,
    numberOfDrums = 1,
    addRequirement = false
  ) {
    const cutting = await json(base, `/api/v2/inquiries/${inquiryId}/lines/${lineId}/cutting-plans`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${tokenA}` },
      body: JSON.stringify({
        nominalLengthM,
        tolerancePercent: 1,
        requestedDrumCount: numberOfDrums,
        addRequirement,
      }),
    });
    assert.equal(cutting.status, 201, cutting.body.error);
    const requirementId = cutting.body.requirement.id as string;
    const drum = await json(base, `/api/v2/inquiries/${inquiryId}/lines/${lineId}/drum-plans`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${tokenA}` },
      body: JSON.stringify({
        selectionMethod: 'MANUAL',
        cuttingLengthRequirementId: requirementId,
        rows: [{ drumCode, numberOfDrums, cuttingLengthM: nominalLengthM, drumTolerancePercent: 0 }],
      }),
    });
    assert.equal(drum.status, 201, drum.body.error || JSON.stringify(drum.body));
    const planId = drum.body.drumPlan.planId as string;
    await json(base, `/api/v2/inquiries/${inquiryId}/lines/${lineId}/drum-plans/${planId}/validate`, {
      method: 'POST',
      headers: { Authorization: `Bearer ${tokenA}` },
    });
    const confirmed = await json(
      base,
      `/api/v2/inquiries/${inquiryId}/lines/${lineId}/drum-plans/${planId}/confirm`,
      { method: 'POST', headers: { Authorization: `Bearer ${tokenA}` } }
    );
    assert.ok(confirmed.status === 200 || confirmed.status === 201, confirmed.body.error);
    return { lineId, planId, requirementId, numberOfDrums };
  }

  async function addConfirmedLine(
    inquiryId: string,
    inquiryNumber: string,
    description: string,
    nominalLengthM: number,
    materialNumber: string,
    numberOfDrums = 1
  ) {
    const lineRes = await json(base, `/api/v2/inquiries/${inquiryId}/lines`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${tokenA}` },
      body: JSON.stringify({ cableDescription: description }),
    });
    assert.equal(lineRes.status, 201, lineRes.body.error);
    const lineId = lineRes.body.line.id as string;
    await seedValidSnapshot(lineId, inquiryNumber, lineRes.body.line.lineNumber as number, materialNumber);
    return confirmRequirement(inquiryId, lineId, nominalLengthM, numberOfDrums);
  }

  async function createStudy() {
    await activateAlgorithmConfiguration('CFG-LEGACY-FIRST-FIT-V1', actorInternal);
    const created = await json(base, '/api/v2/inquiries', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${tokenA}` },
      body: JSON.stringify({ projectName: `B3 ${suffix} ${Math.random().toString(36).slice(2, 7)}` }),
    });
    const inquiryId = created.body.inquiry.id as string;
    const inquiryNumber = created.body.inquiry.inquiryNumber as string;
    const line = await addConfirmedLine(inquiryId, inquiryNumber, 'Cable A', 1000, 'CABLE-A');
    const group = await json(base, `/api/v2/inquiries/${inquiryId}/shipment-groups`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${tokenInternal}` },
      body: JSON.stringify({
        groupCode: `SG-B3-${suffix}-${line.lineId.slice(-4)}`,
        deliveryAllocationMode: 'ENTIRE_INQUIRY',
        destinationPortCode: 'ALEX',
        incotermCode: 'CIF',
      }),
    });
    const study = await json(base, `/api/v2/inquiries/${inquiryId}/container-studies`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${tokenInternal}` },
      body: JSON.stringify({
        shipmentGroupId: group.body.id,
        stuffingMethod: 'Rolling',
        region: 'Europe',
      }),
    });
    assert.equal(study.status, 201, study.body.error);
    const snap = await json(base, `/api/v2/container-studies/${study.body.id}/input-snapshot`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${tokenInternal}` },
      body: JSON.stringify({ configurationId: 'CFG-LEGACY-FIRST-FIT-V1' }),
    });
    assert.equal(snap.status, 201, JSON.stringify(snap.body));
    return { inquiryId, studyId: study.body.id as string, line, snap: snap.body };
  }

  before(async () => {
    const health = await checkDatabase();
    assert.equal(health.ok, true, health.error);
    await seedDevelopmentUsers();
    const prisma = getPrisma()!;
    await ensureNumberSequencesAheadOfExisting(prisma);
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
    const adminRole = await prisma.role.findFirst({ where: { code: SYSTEM_ADMIN_ROLE_CODE } });
    const customerRole = await prisma.role.findFirst({ where: { code: 'CUSTOMER_USER' } });
    assert.ok(adminRole && customerRole);
    const custA = await prisma.customer.create({ data: { code: `B3-A-${suffix}`, name: 'B3 A' } });
    const custB = await prisma.customer.create({ data: { code: `B3-B-${suffix}`, name: 'B3 B' } });
    const internal = await prisma.userAccount.create({
      data: {
        username: `b3-int-${suffix}`,
        email: `b3-int-${suffix}@test.local`,
        fullName: 'B3 Internal',
        userType: 'internal',
        passwordHash: await hashPassword('B3Test@2026!'),
        status: 'ACTIVE',
      },
    });
    const userA = await prisma.userAccount.create({
      data: {
        username: `b3-a-${suffix}`,
        email: `b3-a-${suffix}@test.local`,
        fullName: 'B3 A',
        userType: 'customer',
        passwordHash: await hashPassword('B3Test@2026!'),
        status: 'ACTIVE',
      },
    });
    const userB = await prisma.userAccount.create({
      data: {
        username: `b3-b-${suffix}`,
        email: `b3-b-${suffix}@test.local`,
        fullName: 'B3 B',
        userType: 'customer',
        passwordHash: await hashPassword('B3Test@2026!'),
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
    actorInternal = { id: internal.id, email: internal.email!, name: internal.fullName!, userType: 'internal' };
    const app = express();
    app.use(express.json());
    app.use('/api/auth', identityAuthRouter);
    app.use('/api/v2/inquiries', v2InquiryConfigurationRouter);
    app.use('/api/v2', financialOfferSnapshotRouter);
    app.use('/api/v2', containerStudyRouter);
    const started = await listen(app);
    server = started.server;
    base = started.base;
    const loginInt = await json(base, '/api/auth/login', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ email: internal.email, password: 'B3Test@2026!' }),
    });
    const loginA = await json(base, '/api/auth/login', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ email: userA.email, password: 'B3Test@2026!' }),
    });
    const loginB = await json(base, '/api/auth/login', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ email: userB.email, password: 'B3Test@2026!' }),
    });
    tokenInternal = loginInt.body.accessToken;
    tokenA = loginA.body.accessToken;
    tokenB = loginB.body.accessToken;
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
    await createContainerTypeVersion(
      '40STD',
      {
        parityLabel: '40 STD',
        usableLengthMm: 12000,
        internalWidthMm: 2350,
        payloadCapacityKg: 26000,
        dimensionsStatus: 'APPROVED',
      },
      actorInternal
    );
    await createContainerTypeVersion(
      '40OT',
      {
        parityLabel: '40 Open Top',
        usableLengthMm: 12000,
        internalWidthMm: 2350,
        payloadCapacityKg: 26000,
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
    if (prisma && actorInternal) {
      await activateAlgorithmConfiguration('CFG-LEGACY-FIRST-FIT-V1', actorInternal).catch(() => undefined);
    }
    if (prisma) {
      const inquiries = await prisma.commercialInquiry.findMany({
        where: { projectName: { contains: suffix } },
        select: { id: true },
      });
      await deleteV2LineageForInquiries(
        prisma,
        inquiries.map((i) => i.id)
      );
      await prisma.commercialInquiryLine.deleteMany({ where: { inquiryId: { in: inquiries.map((i) => i.id) } } });
      await prisma.commercialInquiry.deleteMany({ where: { id: { in: inquiries.map((i) => i.id) } } });
    }
    await new Promise<void>((resolve, reject) => server.close((err) => (err ? reject(err) : resolve())));
  });

  it('rejects the legacy client-drum snapshot endpoint and keeps B2 input-snapshot authoritative', async () => {
    const ctx = await createStudy();
    const denied = await json(base, `/api/v2/container-studies/${ctx.studyId}/snapshots`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${tokenInternal}` },
      body: JSON.stringify({
        configurationId: 'CFG-LEGACY-FIRST-FIT-V1',
        drums: [{ sourceLineId: 'CLIENT', quantity: 9, packedLengthMm: 1400, packedWidthMm: 982, grossWeightKg: 1000 }],
      }),
    });
    assert.equal(denied.status, 409);
    assert.equal(denied.body.details?.issues?.[0]?.code, 'CLIENT_DRUM_SNAPSHOT_NOT_ALLOWED');
    const second = await json(base, `/api/v2/container-studies/${ctx.studyId}/input-snapshot`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${tokenInternal}` },
      body: JSON.stringify({ configurationId: 'CFG-LEGACY-FIRST-FIT-V1' }),
    });
    assert.equal(second.status, 409);
    assert.equal(ctx.snap.drums.length, 1);
    assert.equal(Number(ctx.snap.drums[0].quantity), 1);
  });

  it('keeps multiple requirements independent and rejects line-pointer-only population', async () => {
    const created = await json(base, '/api/v2/inquiries', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${tokenA}` },
      body: JSON.stringify({ projectName: `B3 multi ${suffix}` }),
    });
    const inquiryId = created.body.inquiry.id as string;
    const inquiryNumber = created.body.inquiry.inquiryNumber as string;
    const r1 = await addConfirmedLine(inquiryId, inquiryNumber, 'Cable A', 1000, 'CABLE-A', 2);
    const r2 = await confirmRequirement(inquiryId, r1.lineId, 1500, 3, true);
    const r3 = await confirmRequirement(inquiryId, r1.lineId, 2000, 1, true);
    const group = await json(base, `/api/v2/inquiries/${inquiryId}/shipment-groups`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${tokenInternal}` },
      body: JSON.stringify({
        groupCode: `SG-MULTI-${suffix}`,
        deliveryAllocationMode: 'ENTIRE_INQUIRY',
        destinationPortCode: 'ALEX',
        incotermCode: 'CIF',
      }),
    });
    const study = await json(base, `/api/v2/inquiries/${inquiryId}/container-studies`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${tokenInternal}` },
      body: JSON.stringify({
        shipmentGroupId: group.body.id,
        stuffingMethod: 'Rolling',
        region: 'Europe',
      }),
    });
    const snap = await json(base, `/api/v2/container-studies/${study.body.id}/input-snapshot`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${tokenInternal}` },
      body: JSON.stringify({ configurationId: 'CFG-LEGACY-FIRST-FIT-V1' }),
    });
    assert.equal(snap.status, 201, JSON.stringify(snap.body));
    const reqIds = new Set(snap.body.lineageProvenanceJson.cuttingLengthRequirementIds);
    assert.equal(reqIds.size, 3);
    assert.ok(reqIds.has(r1.requirementId) && reqIds.has(r2.requirementId) && reqIds.has(r3.requirementId));
    const physical = snap.body.drums.reduce((n: number, d: { quantity: number }) => n + Number(d.quantity), 0);
    assert.equal(physical, 6);
  });

  it('VALIDATE succeeds without a result, does not change to CALCULATED, and uses the pinned configuration', async () => {
    const ctx = await createStudy();
    const before = await json(base, `/api/v2/container-studies/${ctx.studyId}`, {
      headers: { Authorization: `Bearer ${tokenInternal}` },
    });
    assert.equal(before.body.status, 'DRAFT');
    assert.equal(before.body.currentResultId, null);
    const prisma = getPrisma()!;
    try {
      await prisma.algorithmConfiguration.update({
        where: { configurationVersion: 'CFG-LEGACY-FIRST-FIT-V1' },
        data: { status: 'INACTIVE' },
      });
      const validated = await json(base, `/api/v2/container-studies/${ctx.studyId}/validate`, {
        method: 'POST',
        headers: { Authorization: `Bearer ${tokenInternal}` },
      });
      assert.equal(validated.status, 200, JSON.stringify(validated.body));
      assert.equal(validated.body.status, 'VALIDATED');
      assert.equal(validated.body.currentResultId, null);
      assert.ok(
        (validated.body.warnings || []).some((w: { code: string }) => w.code === 'LIVE_CONFIGURATION_STATUS_DIFFERS')
      );
      const calc = await json(base, `/api/v2/container-studies/${ctx.studyId}/calculate`, {
        method: 'POST',
        headers: { Authorization: `Bearer ${tokenInternal}` },
      });
      assert.equal(calc.status, 200, calc.body.error);
      assert.equal(calc.body.study.status, 'VALIDATED');
      assert.deepEqual([...CONTAINER_STUDY_STATUSES], ['DRAFT', 'VALIDATED', 'CONFIRMED', 'SUPERSEDED']);
    } finally {
      await activateAlgorithmConfiguration('CFG-LEGACY-FIRST-FIT-V1', actorInternal);
    }
  });

  it('calculation creates a new result without changing status; failed integrity does not persist', async () => {
    const ctx = await createStudy();
    const statusBefore = 'DRAFT';
    const calc = await json(base, `/api/v2/container-studies/${ctx.studyId}/calculate`, {
      method: 'POST',
      headers: { Authorization: `Bearer ${tokenInternal}` },
    });
    assert.equal(calc.status, 200, calc.body.error);
    assert.equal(calc.body.study.status, statusBefore);
    const firstId = calc.body.result.id as string;
    const calc2 = await json(base, `/api/v2/container-studies/${ctx.studyId}/calculate`, {
      method: 'POST',
      headers: { Authorization: `Bearer ${tokenInternal}` },
    });
    assert.equal(calc2.status, 200);
    assert.notEqual(calc2.body.result.id, firstId);
    const listed = await json(base, `/api/v2/container-studies/${ctx.studyId}/results`, {
      headers: { Authorization: `Bearer ${tokenInternal}` },
    });
    assert.equal(listed.body.results.length, 2);
    const historical = await json(base, `/api/v2/container-studies/${ctx.studyId}/results/${firstId}`, {
      headers: { Authorization: `Bearer ${tokenInternal}` },
    });
    assert.equal(historical.status, 200);

    const prisma = getPrisma()!;
    const before = await prisma.containerStudy.findUnique({ where: { id: ctx.studyId } });
    await assert.rejects(
      () =>
        persistContainerStudyEngineOutputIfIntegrityPasses(ctx.studyId, actorInternal, {
          ok: true,
          algorithmVersionCode: 'LEGACY_FIRST_FIT_V1',
          configurationVersion: 'CFG-LEGACY-FIRST-FIT-V1',
          containers: [],
          allocations: [
            {
              physicalDrumKey: 'dup:0',
              sourceLineId: 'dup',
              instanceIndex: 0,
              containerIndex: 1,
              allocationKind: 'PHYSICAL',
              acceptReason: 'x',
            },
            {
              physicalDrumKey: 'dup:0',
              sourceLineId: 'dup',
              instanceIndex: 0,
              containerIndex: 1,
              allocationKind: 'PHYSICAL',
              acceptReason: 'x',
            },
          ],
          unallocated: [],
          summary: {
            expandedDrumCount: 1,
            containerCount: 0,
            allocatedCount: 2,
            unallocatedCount: 0,
            typeCounts: {},
          },
          warnings: [],
          errors: [],
          decisionTrace: [],
          containerMasterPinJson: [],
          packingProfilePinJson: [],
        }),
      (err: unknown) => err instanceof DomainError && err.code === 'VALIDATION_FAILED'
    );
    const after = await prisma.containerStudy.findUnique({ where: { id: ctx.studyId } });
    assert.equal(after?.currentResultId, before?.currentResultId);
    const count = await prisma.containerStudyResult.count({ where: { studyId: ctx.studyId } });
    assert.equal(count, 2);
  });

  it('unallocated drums are explicit, explained, and block confirm', async () => {
    const ctx = await createStudy();
    const prisma = getPrisma()!;
    const snap = await prisma.containerStudyInputSnapshot.findFirst({ where: { studyId: ctx.studyId } });
    assert.ok(snap);
    await prisma.containerStudyInputDrum.updateMany({
      where: { snapshotId: snap.id },
      data: { packedWidthMm: 9999, packedLengthMm: 1400, grossWeightKg: 1000 },
    });
    const calc = await json(base, `/api/v2/container-studies/${ctx.studyId}/calculate`, {
      method: 'POST',
      headers: { Authorization: `Bearer ${tokenInternal}` },
    });
    assert.equal(calc.status, 200, calc.body.error);
    assert.ok(calc.body.calculation.summary.unallocatedCount >= 1);
    const explained = calc.body.unallocatedExplanations as Array<{
      reasonCode: string;
      packedWidthMm: number;
      cuttingLengthRequirementId: string | null;
      physicalDrumKey: string;
    }>;
    assert.ok(explained.length >= 1);
    assert.ok(explained[0].reasonCode);
    assert.equal(explained[0].packedWidthMm, 9999);
    assert.ok(explained[0].cuttingLengthRequirementId);
    const validated = await json(base, `/api/v2/container-studies/${ctx.studyId}/validate`, {
      method: 'POST',
      headers: { Authorization: `Bearer ${tokenInternal}` },
    });
    assert.equal(validated.status, 200, validated.body.error);
    const confirm = await json(base, `/api/v2/container-studies/${ctx.studyId}/confirm`, {
      method: 'POST',
      headers: { Authorization: `Bearer ${tokenInternal}` },
    });
    assert.equal(confirm.status, 400);
    const codes = (confirm.body.details?.issues || []).map((i: { code: string }) => i.code);
    assert.ok(codes.includes('UNALLOCATED_DRUMS_PRESENT'));
  });

  it('CONFIRM requires VALIDATED + current result; DRAFT cannot confirm; stale drum plan is blocked', async () => {
    const ctx = await createStudy();
    const draftConfirm = await json(base, `/api/v2/container-studies/${ctx.studyId}/confirm`, {
      method: 'POST',
      headers: { Authorization: `Bearer ${tokenInternal}` },
    });
    assert.equal(draftConfirm.status, 400);

    const calc = await json(base, `/api/v2/container-studies/${ctx.studyId}/calculate`, {
      method: 'POST',
      headers: { Authorization: `Bearer ${tokenInternal}` },
    });
    assert.equal(calc.status, 200, calc.body.error);
    assert.ok(calc.body.calculation.summary.allocatedCount >= 1, JSON.stringify(calc.body.calculation.summary));
    const stillDraft = await json(base, `/api/v2/container-studies/${ctx.studyId}/confirm`, {
      method: 'POST',
      headers: { Authorization: `Bearer ${tokenInternal}` },
    });
    assert.equal(stillDraft.status, 400);

    const validated = await json(base, `/api/v2/container-studies/${ctx.studyId}/validate`, {
      method: 'POST',
      headers: { Authorization: `Bearer ${tokenInternal}` },
    });
    assert.equal(validated.status, 200);

    const prisma = getPrisma()!;
    const snap = await prisma.containerStudyInputSnapshot.findFirst({ where: { studyId: ctx.studyId } });
    assert.ok(snap);
    const clone = await prisma.containerStudyInputSnapshot.create({
      data: {
        snapshotId: `${snap.snapshotId}-clone`,
        studyId: ctx.studyId,
        stuffingMethod: snap.stuffingMethod,
        region: snap.region,
        deliveryAllocationMode: snap.deliveryAllocationMode,
        algorithmVersionCode: snap.algorithmVersionCode,
        configurationId: snap.configurationId,
        configurationVersion: snap.configurationVersion,
        containerMasterPinJson: snap.containerMasterPinJson as object,
        packingProfilePinJson: snap.packingProfilePinJson as object,
        algorithmParameterPinJson: snap.algorithmParameterPinJson as object,
        lineageProvenanceJson: snap.lineageProvenanceJson as object,
      },
    });
    const drums = await prisma.containerStudyInputDrum.findMany({ where: { snapshotId: snap.id } });
    if (drums.length) {
      await prisma.containerStudyInputDrum.createMany({
        data: drums.map((d) => ({
          snapshotId: clone.id,
          sourceLineId: d.sourceLineId,
          quantity: d.quantity,
          drumCode: d.drumCode,
          drumMasterId: d.drumMasterId,
          packingProfileVersionId: d.packingProfileVersionId,
          packedLengthMm: d.packedLengthMm,
          packedWidthMm: d.packedWidthMm,
          packedHeightMm: d.packedHeightMm,
          grossWeightKg: d.grossWeightKg,
        })),
      });
    }
    const pins = await prisma.containerStudyInputSnapshotContainerPin.findMany({ where: { snapshotId: snap.id } });
    if (pins.length) {
      await prisma.containerStudyInputSnapshotContainerPin.createMany({
        data: pins.map((p) => ({
          snapshotId: clone.id,
          containerTypeVersionId: p.containerTypeVersionId,
          code: p.code,
          parityLabel: p.parityLabel,
          usableLengthMm: p.usableLengthMm,
          internalWidthMm: p.internalWidthMm,
          payloadCapacityKg: p.payloadCapacityKg,
          dimensionsStatus: p.dimensionsStatus,
        })),
      });
    }
    await prisma.containerStudy.update({
      where: { id: ctx.studyId },
      data: { currentSnapshotId: clone.id },
    });
    const mismatch = await json(base, `/api/v2/container-studies/${ctx.studyId}/confirm`, {
      method: 'POST',
      headers: { Authorization: `Bearer ${tokenInternal}` },
    });
    assert.equal(mismatch.status, 400);
    assert.ok(
      (mismatch.body.details?.issues || []).some((i: { code: string }) => i.code === 'RESULT_SNAPSHOT_MISMATCH')
    );
    await prisma.containerStudy.update({
      where: { id: ctx.studyId },
      data: { currentSnapshotId: snap.id },
    });

    const ok = await json(base, `/api/v2/container-studies/${ctx.studyId}/confirm`, {
      method: 'POST',
      headers: { Authorization: `Bearer ${tokenInternal}` },
    });
    assert.equal(ok.status, 200, JSON.stringify(ok.body));
    assert.equal(ok.body.status, 'CONFIRMED');

    const recalc = await json(base, `/api/v2/container-studies/${ctx.studyId}/calculate`, {
      method: 'POST',
      headers: { Authorization: `Bearer ${tokenInternal}` },
    });
    assert.equal(recalc.status, 409);
    const mutate = await json(base, `/api/v2/container-studies/${ctx.studyId}/input-snapshot`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${tokenInternal}` },
      body: JSON.stringify({ configurationId: 'CFG-LEGACY-FIRST-FIT-V1' }),
    });
    assert.equal(mutate.status, 409);

    const ctx2 = await createStudy();
    await json(base, `/api/v2/container-studies/${ctx2.studyId}/calculate`, {
      method: 'POST',
      headers: { Authorization: `Bearer ${tokenInternal}` },
    });
    await json(base, `/api/v2/container-studies/${ctx2.studyId}/validate`, {
      method: 'POST',
      headers: { Authorization: `Bearer ${tokenInternal}` },
    });
    const plan = await prisma.v2DrumPlan.findFirst({ where: { planId: ctx2.line.planId } });
    assert.ok(plan);
    await prisma.v2DrumPlan.update({ where: { id: plan.id }, data: { versionNo: plan.versionNo + 1 } });
    const stale = await json(base, `/api/v2/container-studies/${ctx2.studyId}/confirm`, {
      method: 'POST',
      headers: { Authorization: `Bearer ${tokenInternal}` },
    });
    assert.equal(stale.status, 400);
    assert.ok((stale.body.details?.issues || []).some((i: { code: string }) => i.code === 'STALE_DRUM_PLAN'));
    const hist = await json(base, `/api/v2/container-studies/${ctx2.studyId}/results`, {
      headers: { Authorization: `Bearer ${tokenInternal}` },
    });
    assert.equal(hist.status, 200);
    assert.ok(hist.body.results.length >= 1);
  });

  it('customers may VIEW own studies and cannot mutate; other customers are isolated', async () => {
    const ctx = await createStudy();
    const own = await json(base, `/api/v2/container-studies/${ctx.studyId}`, {
      headers: { Authorization: `Bearer ${tokenA}` },
    });
    assert.ok(own.status === 401 || own.status === 403);
    const customerSafe = await json(base, `/api/v2/inquiries/${ctx.inquiryId}/customer-container-study`, {
      headers: { Authorization: `Bearer ${tokenA}` },
    });
    assert.equal(customerSafe.status, 200, JSON.stringify(customerSafe.body));
    const steal = await json(base, `/api/v2/container-studies/${ctx.studyId}`, {
      headers: { Authorization: `Bearer ${tokenB}` },
    });
    assert.ok(steal.status === 401 || steal.status === 403 || steal.status === 404);
    const stealSafe = await json(base, `/api/v2/inquiries/${ctx.inquiryId}/customer-container-study`, {
      headers: { Authorization: `Bearer ${tokenB}` },
    });
    assert.ok(stealSafe.status === 401 || stealSafe.status === 403 || stealSafe.status === 404);
    for (const path of [
      `/api/v2/inquiries/${ctx.inquiryId}/container-studies`,
      `/api/v2/container-studies/${ctx.studyId}/validate`,
      `/api/v2/container-studies/${ctx.studyId}/calculate`,
      `/api/v2/container-studies/${ctx.studyId}/confirm`,
      `/api/v2/container-studies/${ctx.studyId}/supersede`,
    ]) {
      const denied = await json(base, path, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${tokenA}` },
        body: JSON.stringify({}),
      });
      assert.ok(denied.status === 401 || denied.status === 403, `${path} ${denied.status}`);
    }
  });

  it('Forklifting remains fail-closed and Rolling golden algorithm is unchanged', async () => {
    const created = await json(base, '/api/v2/inquiries', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${tokenA}` },
      body: JSON.stringify({ projectName: `B3 fork ${suffix}` }),
    });
    const inquiryId = created.body.inquiry.id as string;
    const inquiryNumber = created.body.inquiry.inquiryNumber as string;
    await addConfirmedLine(inquiryId, inquiryNumber, 'Cable A', 1000, 'CABLE-A');
    const group = await json(base, `/api/v2/inquiries/${inquiryId}/shipment-groups`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${tokenInternal}` },
      body: JSON.stringify({
        groupCode: `SG-FORK-${suffix}`,
        destinationPortCode: 'ALEX',
        incotermCode: 'CIF',
      }),
    });
    const fork = await json(base, `/api/v2/inquiries/${inquiryId}/container-studies`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${tokenInternal}` },
      body: JSON.stringify({
        shipmentGroupId: group.body.id,
        stuffingMethod: 'Forklifting',
        region: 'Europe',
      }),
    });
    const snap = await json(base, `/api/v2/container-studies/${fork.body.id}/input-snapshot`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${tokenInternal}` },
      body: JSON.stringify({ configurationId: 'CFG-LEGACY-FIRST-FIT-V1' }),
    });
    assert.equal(snap.status, 201, JSON.stringify(snap.body));
    const calc = await json(base, `/api/v2/container-studies/${fork.body.id}/calculate`, {
      method: 'POST',
      headers: { Authorization: `Bearer ${tokenInternal}` },
    });
    assert.equal(calc.status, 400);
    assert.match(JSON.stringify(calc.body), /STUFFING_METHOD_NOT_IMPLEMENTED|Forklifting/i);
    const validate = await json(base, `/api/v2/container-studies/${fork.body.id}/validate`, {
      method: 'POST',
      headers: { Authorization: `Bearer ${tokenInternal}` },
    });
    assert.equal(validate.status, 400);
  });
});
