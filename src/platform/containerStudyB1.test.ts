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
import { createContainerTypeVersion } from '../server/containerMasterRepository';
import { activateAlgorithmConfiguration } from '../server/algorithmConfigurationRepository';
import { deleteV2LineageForInquiries } from './containerStudyTestCleanup';
import { ensureNumberSequencesAheadOfExisting } from '../server/testNumberSequenceIsolation';

dotenv.config();

type ContainerStudyLineageCheck = {
  inquiryId: string;
  drumPlanIdString: string;
  shipmentGroupId: string;
  cuttingLengthPlanIdString: string;
  configurationSnapshotIdString: string;
};

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
      snapshotId: `v2cfg-${inquiryNumber}-L${lineNumber}-v1-${process.pid}-${Date.now()}`,
      versionNo: 1,
      inquiryLineId: lineId,
      cableMaterialNumber: 'TEST-MAT-B1',
      itemCode: 'TEST-ITEM-B1',
      customerCode: 'TEST-CUST-B1',
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
  const drumCode = `EWD-B1-${suffix}`;
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

describe('Task 05I-DF-B1 — Shipment group + drum plan input snapshot', () => {
  let base = '';
  let server: http.Server;
  let tokenInternal = '';
  let tokenA = '';
  let tokenB = '';
  let actorInternal: { id: string; email: string; name: string; userType: 'internal' };
  const suffix = `b1-${Date.now()}-${process.pid}-${Math.random().toString(36).slice(2, 8)}`;
  const inquiryIds: string[] = [];

  before(async () => {
    const health = await checkDatabase();
    assert.equal(health.ok, true, health.error);
    await seedDevelopmentUsers();
    await seedTestDrum(suffix);
    const prisma = getPrisma()!;
    await ensureNumberSequencesAheadOfExisting(prisma);
    const adminRole = await prisma.role.findFirst({ where: { code: SYSTEM_ADMIN_ROLE_CODE } });
    const customerRole = await prisma.role.findFirst({ where: { code: 'CUSTOMER_USER' } });
    assert.ok(adminRole && customerRole);
    const custA = await prisma.customer.create({ data: { code: `B1-A-${suffix}`, name: 'B1 A' } });
    const custB = await prisma.customer.create({ data: { code: `B1-B-${suffix}`, name: 'B1 B' } });
    const internal = await prisma.userAccount.create({
      data: {
        username: `b1-int-${suffix}`,
        email: `b1-int-${suffix}@test.local`,
        fullName: 'B1 Internal',
        userType: 'internal',
        passwordHash: await hashPassword('B1Test@2026!'),
        status: 'ACTIVE',
      },
    });
    const userA = await prisma.userAccount.create({
      data: {
        username: `b1-a-${suffix}`,
        email: `b1-a-${suffix}@test.local`,
        fullName: 'B1 A',
        userType: 'customer',
        passwordHash: await hashPassword('B1Test@2026!'),
        status: 'ACTIVE',
      },
    });
    const userB = await prisma.userAccount.create({
      data: {
        username: `b1-b-${suffix}`,
        email: `b1-b-${suffix}@test.local`,
        fullName: 'B1 B',
        userType: 'customer',
        passwordHash: await hashPassword('B1Test@2026!'),
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
    const app = express();
    app.use(express.json());
    app.use('/api/auth', identityAuthRouter);
    app.use('/api/v2/inquiries', v2InquiryConfigurationRouter);
    app.use('/api/v2', containerStudyRouter);
    const started = await listen(app);
    server = started.server;
    base = started.base;
    const loginInt = await json(base, '/api/auth/login', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ email: internal.email, password: 'B1Test@2026!' }),
    });
    const loginA = await json(base, '/api/auth/login', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ email: userA.email, password: 'B1Test@2026!' }),
    });
    const loginB = await json(base, '/api/auth/login', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ email: userB.email, password: 'B1Test@2026!' }),
    });
    assert.equal(loginInt.status, 200, loginInt.body.error);
    assert.equal(loginA.status, 200, loginA.body.error);
    assert.equal(loginB.status, 200, loginB.body.error);
    tokenInternal = loginInt.body.accessToken;
    tokenA = loginA.body.accessToken;
    tokenB = loginB.body.accessToken;
    assert.ok(tokenInternal && tokenA && tokenB);

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
        drumCode: `EWD-B1-${suffix}`,
        packedLengthMm: 1400,
        packedWidthMm: 982,
        packedHeightMm: 2600,
      }),
    });
  });

  after(async () => {
    const prisma = getPrisma();
    if (prisma) {
      await deleteV2LineageForInquiries(prisma, inquiryIds);
      await prisma.commercialInquiryLine.deleteMany({ where: { inquiryId: { in: inquiryIds } } });
      await prisma.commercialInquiry.deleteMany({ where: { id: { in: inquiryIds } } });
    }
    await new Promise<void>((resolve, reject) => server.close((err) => (err ? reject(err) : resolve())));
  });

  async function setupConfirmedDrum() {
    const created = await json(base, '/api/v2/inquiries', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${tokenA}` },
      body: JSON.stringify({ projectName: `B1 ${suffix}` }),
    });
    assert.equal(created.status, 201, created.body.error || JSON.stringify(created.body));
    const inquiryId = created.body.inquiry.id as string;
    inquiryIds.push(inquiryId);
    const inquiryNumber = created.body.inquiry.inquiryNumber as string;
    const lineRes = await json(base, `/api/v2/inquiries/${inquiryId}/lines`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${tokenA}` },
      body: JSON.stringify({ cableDescription: 'B1 line' }),
    });
    const lineId = lineRes.body.line.id as string;
    const lineNumber = lineRes.body.line.lineNumber as number;
    await seedValidSnapshot(inquiryId, lineId, inquiryNumber, lineNumber);
    const cutting = await json(base, `/api/v2/inquiries/${inquiryId}/lines/${lineId}/cutting-plans`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${tokenA}` },
      body: JSON.stringify({ nominalLengthM: 500, tolerancePercent: 1 }),
    });
    assert.equal(cutting.status, 201, cutting.body.error || JSON.stringify(cutting.body));
    const drumCode = `EWD-B1-${suffix}`;
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
    assert.equal(confirmed.body.drumPlan.lifecycleStatus, 'CONFIRMED');
    return { inquiryId, lineId, planId, drumPlanDbId: drum.body.drumPlan.id as string };
  }

  it('happy path: confirmed drum → shipment group → study → immutable input snapshot with lineage', async () => {
    const { inquiryId, lineId, planId } = await setupConfirmedDrum();
    const group = await json(base, `/api/v2/inquiries/${inquiryId}/shipment-groups`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${tokenInternal}` },
      body: JSON.stringify({
        groupCode: `SG-B1-${suffix}`,
        deliveryAllocationMode: 'PER_INQUIRY_LINE',
        inquiryLineId: lineId,
        destinationPortCode: 'ALEX',
        incotermCode: 'CIF',
        containerTypePreferenceCode: '40HQ',
      }),
    });
    assert.equal(group.status, 201, group.body.error);
    const gotGroup = await json(base, `/api/v2/shipment-groups/${group.body.id}`, {
      headers: { Authorization: `Bearer ${tokenInternal}` },
    });
    assert.equal(gotGroup.status, 200);
    assert.equal(gotGroup.body.containerTypePreferenceCode, '40HQ');

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
      body: JSON.stringify({
        inquiryLineId: lineId,
        drumPlanId: planId,
        configurationId: 'CFG-LEGACY-FIRST-FIT-V1',
      }),
    });
    assert.equal(snap.status, 201, JSON.stringify(snap.body));
    const prov = snap.body.lineageProvenanceJson as { drumPlanIdString: string; inquiryLineId: string };
    assert.equal(prov.drumPlanIdString, planId);
    assert.equal(prov.inquiryLineId, lineId);
    assert.ok(snap.body.drums?.length >= 1);
    assert.equal(Number(snap.body.drums[0].packedLengthMm), 1400);

    const readSnap = await json(base, `/api/v2/container-studies/${study.body.id}/input-snapshot`, {
      headers: { Authorization: `Bearer ${tokenInternal}` },
    });
    assert.equal(readSnap.status, 200);
    assert.equal(readSnap.body.id, snap.body.id);

    const prisma = getPrisma()!;
    const audit = await prisma.auditEvent.findMany({
      where: { entityId: study.body.id, action: 'CONTAINER_STUDY_INPUT_SNAPSHOT_CREATED' },
    });
    assert.ok(audit.length >= 1);

    const lineage = await json(base, `/api/v2/container-studies/${study.body.id}`, {
      headers: { Authorization: `Bearer ${tokenInternal}` },
    });
    assert.equal(lineage.status, 200);
    const provRead = lineage.body.currentSnapshot?.lineageProvenanceJson as ContainerStudyLineageCheck;
    assert.equal(provRead.drumPlanIdString, planId);
    assert.equal(provRead.shipmentGroupId, group.body.id);
    assert.equal(provRead.inquiryId, inquiryId);
    assert.ok(provRead.cuttingLengthPlanIdString);
    assert.ok(provRead.configurationSnapshotIdString);

    const dup = await json(base, `/api/v2/container-studies/${study.body.id}/input-snapshot`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${tokenInternal}` },
      body: JSON.stringify({
        inquiryLineId: lineId,
        drumPlanId: planId,
        configurationId: 'CFG-LEGACY-FIRST-FIT-V1',
      }),
    });
    assert.equal(dup.status, 409);
  });

  it('rejects DRAFT drum plan for input snapshot', async () => {
    const created = await json(base, '/api/v2/inquiries', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${tokenA}` },
      body: JSON.stringify({ projectName: `B1 draft ${suffix}` }),
    });
    const inquiryId = created.body.inquiry.id as string;
    if (inquiryId) inquiryIds.push(inquiryId);
    const lineRes = await json(base, `/api/v2/inquiries/${inquiryId}/lines`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${tokenA}` },
      body: JSON.stringify({ cableDescription: 'draft' }),
    });
    const lineId = lineRes.body.line.id;
    await seedValidSnapshot(inquiryId, lineId, created.body.inquiry.inquiryNumber, lineRes.body.line.lineNumber);
    await json(base, `/api/v2/inquiries/${inquiryId}/lines/${lineId}/cutting-plans`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${tokenA}` },
      body: JSON.stringify({ nominalLengthM: 500, tolerancePercent: 1 }),
    });
    const drum = await json(base, `/api/v2/inquiries/${inquiryId}/lines/${lineId}/drum-plans`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${tokenA}` },
      body: JSON.stringify({ selectionMethod: 'AUTOMATIC' }),
    });
    const group = await json(base, `/api/v2/inquiries/${inquiryId}/shipment-groups`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${tokenInternal}` },
      body: JSON.stringify({
        groupCode: `SG-DRAFT-${suffix}`,
        deliveryAllocationMode: 'PER_INQUIRY_LINE',
        inquiryLineId: lineId,
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
      body: JSON.stringify({
        inquiryLineId: lineId,
        drumPlanId: drum.body.drumPlan.planId,
        configurationId: 'CFG-LEGACY-FIRST-FIT-V1',
      }),
    });
    assert.equal(snap.status, 400);
  });

  it('rejects cross-customer container study input snapshot (IDOR)', async () => {
    const { inquiryId, lineId, planId } = await setupConfirmedDrum();
    const group = await json(base, `/api/v2/inquiries/${inquiryId}/shipment-groups`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${tokenInternal}` },
      body: JSON.stringify({
        groupCode: `SG-IDOR-${suffix}`,
        deliveryAllocationMode: 'PER_INQUIRY_LINE',
        inquiryLineId: lineId,
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
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${tokenB}` },
      body: JSON.stringify({
        inquiryLineId: lineId,
        drumPlanId: planId,
        configurationId: 'CFG-LEGACY-FIRST-FIT-V1',
      }),
    });
    assert.ok(snap.status === 401 || snap.status === 403 || snap.status === 404);
  });

  it('snapshot retains values after drum master change', async () => {
    const { inquiryId, lineId, planId, drumPlanDbId } = await setupConfirmedDrum();
    const prisma = getPrisma()!;
    const planLine = await prisma.v2DrumPlanLine.findFirst({ where: { drumPlanId: drumPlanDbId } });
    assert.ok(planLine?.drumMasterId);
    const group = await json(base, `/api/v2/inquiries/${inquiryId}/shipment-groups`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${tokenInternal}` },
      body: JSON.stringify({
        groupCode: `SG-IMM-${suffix}`,
        deliveryAllocationMode: 'PER_INQUIRY_LINE',
        inquiryLineId: lineId,
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
      body: JSON.stringify({
        inquiryLineId: lineId,
        drumPlanId: planId,
        configurationId: 'CFG-LEGACY-FIRST-FIT-V1',
      }),
    });
    assert.equal(snap.status, 201);
    const beforeLen = Number(snap.body.drums[0].packedLengthMm);
    await prisma.drumMaster.update({
      where: { id: planLine!.drumMasterId! },
      data: { barrel: 9999 },
    });
    const readSnap = await json(base, `/api/v2/container-studies/${study.body.id}/input-snapshot`, {
      headers: { Authorization: `Bearer ${tokenInternal}` },
    });
    assert.equal(Number(readSnap.body.drums[0].packedLengthMm), beforeLen);
    await prisma.drumMaster.update({
      where: { id: planLine!.drumMasterId! },
      data: { barrel: 1400 },
    });
  });

  it('rejects missing shipment-group destination', async () => {
    const { inquiryId, lineId } = await setupConfirmedDrum();
    const group = await json(base, `/api/v2/inquiries/${inquiryId}/shipment-groups`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${tokenInternal}` },
      body: JSON.stringify({
        groupCode: `SG-NODEST-${suffix}`,
        deliveryAllocationMode: 'PER_INQUIRY_LINE',
        inquiryLineId: lineId,
        incotermCode: 'CIF',
      }),
    });
    assert.equal(group.status, 400);
  });

  it('rejects client-declared container suitability', async () => {
    const { inquiryId, lineId } = await setupConfirmedDrum();
    const group = await json(base, `/api/v2/inquiries/${inquiryId}/shipment-groups`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${tokenInternal}` },
      body: JSON.stringify({
        groupCode: `SG-SUIT-${suffix}`,
        deliveryAllocationMode: 'PER_INQUIRY_LINE',
        inquiryLineId: lineId,
        destinationPortCode: 'ALEX',
        incotermCode: 'CIF',
        technicallySuitable: true,
      }),
    });
    assert.equal(group.status, 400);
  });

  it('rejects shipment group from another inquiry', async () => {
    const a = await setupConfirmedDrum();
    const b = await setupConfirmedDrum();
    const groupB = await json(base, `/api/v2/inquiries/${b.inquiryId}/shipment-groups`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${tokenInternal}` },
      body: JSON.stringify({
        groupCode: `SG-XINQ-${suffix}`,
        deliveryAllocationMode: 'PER_INQUIRY_LINE',
        inquiryLineId: b.lineId,
        destinationPortCode: 'ALEX',
        incotermCode: 'CIF',
      }),
    });
    const study = await json(base, `/api/v2/inquiries/${a.inquiryId}/container-studies`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${tokenInternal}` },
      body: JSON.stringify({
        shipmentGroupId: groupB.body.id,
        stuffingMethod: 'Rolling',
        region: 'Europe',
      }),
    });
    assert.equal(study.status, 400);
  });

  it('rejects drum plan from another inquiry', async () => {
    const a = await setupConfirmedDrum();
    const b = await setupConfirmedDrum();
    const group = await json(base, `/api/v2/inquiries/${a.inquiryId}/shipment-groups`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${tokenInternal}` },
      body: JSON.stringify({
        groupCode: `SG-XDRUM-${suffix}`,
        deliveryAllocationMode: 'PER_INQUIRY_LINE',
        inquiryLineId: a.lineId,
        destinationPortCode: 'ALEX',
        incotermCode: 'CIF',
      }),
    });
    const study = await json(base, `/api/v2/inquiries/${a.inquiryId}/container-studies`, {
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
      body: JSON.stringify({
        inquiryLineId: a.lineId,
        drumPlanId: b.planId,
        configurationId: 'CFG-LEGACY-FIRST-FIT-V1',
      }),
    });
    assert.equal(snap.status, 400);
  });

  it('rejects mismatched inquiry line vs drum plan', async () => {
    const { inquiryId, lineId, planId } = await setupConfirmedDrum();
    const line2 = await json(base, `/api/v2/inquiries/${inquiryId}/lines`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${tokenA}` },
      body: JSON.stringify({ cableDescription: 'line 2' }),
    });
    const group = await json(base, `/api/v2/inquiries/${inquiryId}/shipment-groups`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${tokenInternal}` },
      body: JSON.stringify({
        groupCode: `SG-XLINE-${suffix}`,
        deliveryAllocationMode: 'PER_INQUIRY_LINE',
        inquiryLineId: line2.body.line.id,
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
      body: JSON.stringify({
        inquiryLineId: lineId,
        drumPlanId: planId,
        configurationId: 'CFG-LEGACY-FIRST-FIT-V1',
      }),
    });
    assert.equal(snap.status, 400);
  });

  it('rejects SUPERSEDED drum plan', async () => {
    const { inquiryId, lineId, planId } = await setupConfirmedDrum();
    const prisma = getPrisma()!;
    await prisma.v2DrumPlan.updateMany({
      where: { planId: planId },
      data: { lifecycleStatus: 'SUPERSEDED' },
    });
    const group = await json(base, `/api/v2/inquiries/${inquiryId}/shipment-groups`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${tokenInternal}` },
      body: JSON.stringify({
        groupCode: `SG-SUP-${suffix}`,
        deliveryAllocationMode: 'PER_INQUIRY_LINE',
        inquiryLineId: lineId,
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
      body: JSON.stringify({
        inquiryLineId: lineId,
        drumPlanId: planId,
        configurationId: 'CFG-LEGACY-FIRST-FIT-V1',
      }),
    });
    assert.equal(snap.status, 400);
  });

  it('rejects client-supplied drum payload', async () => {
    const { inquiryId, lineId, planId } = await setupConfirmedDrum();
    const group = await json(base, `/api/v2/inquiries/${inquiryId}/shipment-groups`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${tokenInternal}` },
      body: JSON.stringify({
        groupCode: `SG-CLIDRM-${suffix}`,
        deliveryAllocationMode: 'PER_INQUIRY_LINE',
        inquiryLineId: lineId,
        destinationPortCode: 'ALEX',
        incotermCode: 'CIF',
      }),
    });
    assert.equal(group.status, 201, group.body.error);
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
    const clientDrums = await json(base, `/api/v2/container-studies/${study.body.id}/input-snapshot`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${tokenInternal}` },
      body: JSON.stringify({
        inquiryLineId: lineId,
        drumPlanId: planId,
        configurationId: 'CFG-LEGACY-FIRST-FIT-V1',
        drums: [{ sourceLineId: 'fake', quantity: 99, packedLengthMm: 1, packedWidthMm: 1, grossWeightKg: 1 }],
      }),
    });
    assert.equal(clientDrums.status, 400);
  });

  it('rejects snapshot mutation', async () => {
    const { inquiryId, lineId, planId } = await setupConfirmedDrum();
    const group = await json(base, `/api/v2/inquiries/${inquiryId}/shipment-groups`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${tokenInternal}` },
      body: JSON.stringify({
        groupCode: `SG-MUT-${suffix}`,
        deliveryAllocationMode: 'PER_INQUIRY_LINE',
        inquiryLineId: lineId,
        destinationPortCode: 'ALEX',
        incotermCode: 'CIF',
      }),
    });
    assert.equal(group.status, 201, group.body.error);
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
      body: JSON.stringify({
        inquiryLineId: lineId,
        drumPlanId: planId,
        configurationId: 'CFG-LEGACY-FIRST-FIT-V1',
      }),
    });
    assert.equal(snap.status, 201, JSON.stringify(snap.body));
    const mutate = await json(base, `/api/v2/container-studies/${study.body.id}/input-snapshot`, {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${tokenInternal}` },
      body: JSON.stringify({ packedLengthMm: 1 }),
    });
    assert.equal(mutate.status, 409);
  });

  it('invalid configuration does not leave a snapshot pointer', async () => {
    const { inquiryId, lineId, planId } = await setupConfirmedDrum();
    const group = await json(base, `/api/v2/inquiries/${inquiryId}/shipment-groups`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${tokenInternal}` },
      body: JSON.stringify({
        groupCode: `SG-TX-${suffix}`,
        deliveryAllocationMode: 'PER_INQUIRY_LINE',
        inquiryLineId: lineId,
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
      body: JSON.stringify({
        inquiryLineId: lineId,
        drumPlanId: planId,
        configurationId: 'CFG-DOES-NOT-EXIST',
      }),
    });
    assert.ok(snap.status >= 400);
    const prisma = getPrisma()!;
    const row = await prisma.containerStudy.findUnique({ where: { id: study.body.id } });
    assert.equal(row?.currentSnapshotId, null);
    const snapCount = await prisma.containerStudyInputSnapshot.count({ where: { studyId: study.body.id } });
    assert.equal(snapCount, 0);
  });

  it('rejects missing drum packing/master geometry', async () => {
    const { inquiryId, lineId, planId, drumPlanDbId } = await setupConfirmedDrum();
    const prisma = getPrisma()!;
    await prisma.v2DrumPlanLine.updateMany({
      where: { drumPlanId: drumPlanDbId },
      data: {
        drumMasterId: null,
        grossLoadedDrumWeightKg: null,
      },
    });
    const group = await json(base, `/api/v2/inquiries/${inquiryId}/shipment-groups`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${tokenInternal}` },
      body: JSON.stringify({
        groupCode: `SG-MISS-${suffix}`,
        deliveryAllocationMode: 'PER_INQUIRY_LINE',
        inquiryLineId: lineId,
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
      body: JSON.stringify({
        inquiryLineId: lineId,
        drumPlanId: planId,
        configurationId: 'CFG-LEGACY-FIRST-FIT-V1',
      }),
    });
    assert.equal(snap.status, 400);
  });
});
