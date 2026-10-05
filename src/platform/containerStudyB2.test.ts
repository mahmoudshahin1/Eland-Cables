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

dotenv.config();

type Provenance = {
  inquiryId: string;
  deliveryAllocationMode: string;
  cuttingLengthRequirementIds?: string[];
  authoritativeDrumPlanIds?: string[];
  drumPlans: Array<{
    inquiryLineId: string;
    cuttingLengthRequirementId: string;
    drumPlanIdString: string;
    cableMaterialNumber: string | null;
    requestedDrumCount?: number;
    physicalDrumCount?: number;
    toleranceMode?: string;
    drumLinePins: Array<{ cuttingLengthM: number; numberOfDrums: number; v2DrumPlanLineId: string }>;
  }>;
  drumLinePins: Array<{
    cuttingLengthM: number;
    numberOfDrums: number;
    inquiryLineId: string;
    cuttingLengthRequirementId: string;
  }>;
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

describe('Task 05I-DF-B2 — ENTIRE_INQUIRY aggregation + Rolling calculation', () => {
  let base = '';
  let server: http.Server;
  let tokenInternal = '';
  let tokenA = '';
  let tokenB = '';
  let actorInternal: { id: string; email: string; name: string; userType: 'internal' };
  const suffix = `b2-${Date.now()}`;
  const drumCode = `EWD-B2-${suffix}`;

  async function seedValidSnapshot(
    lineId: string,
    inquiryNumber: string,
    lineNumber: number,
    materialNumber: string
  ) {
    const prisma = getPrisma()!;
    const snapshot = await prisma.v2ConfigurationSnapshot.create({
      data: {
        snapshotId: `v2cfg-${inquiryNumber}-L${lineNumber}-v1-${suffix}`,
        versionNo: 1,
        inquiryLineId: lineId,
        cableMaterialNumber: materialNumber,
        itemCode: materialNumber,
        customerCode: 'TEST-CUST-B2',
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
    return snapshot;
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
    const lineNumber = lineRes.body.line.lineNumber as number;
    await seedValidSnapshot(lineId, inquiryNumber, lineNumber, materialNumber);
    return confirmRequirement(inquiryId, lineId, nominalLengthM, numberOfDrums);
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
    const validated = await json(
      base,
      `/api/v2/inquiries/${inquiryId}/lines/${lineId}/drum-plans/${planId}/validate`,
      { method: 'POST', headers: { Authorization: `Bearer ${tokenA}` } }
    );
    assert.ok(validated.status === 200 || validated.status === 201, validated.body.error);
    const confirmed = await json(
      base,
      `/api/v2/inquiries/${inquiryId}/lines/${lineId}/drum-plans/${planId}/confirm`,
      { method: 'POST', headers: { Authorization: `Bearer ${tokenA}` } }
    );
    assert.ok(confirmed.status === 200 || confirmed.status === 201, confirmed.body.error || JSON.stringify(confirmed.body));
    assert.equal(confirmed.body.drumPlan.lifecycleStatus, 'CONFIRMED', confirmed.body.error);
    return {
      lineId,
      planId,
      requirementId,
      cuttingLengthM: nominalLengthM,
      numberOfDrums,
      drumCode: drum.body.drumPlan.lines[0].drumCode as string,
    };
  }

  before(async () => {
    const health = await checkDatabase();
    assert.equal(health.ok, true, health.error);
    await seedDevelopmentUsers();
    const prisma = getPrisma()!;
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
    const custA = await prisma.customer.create({ data: { code: `B2-A-${suffix}`, name: 'B2 A' } });
    const custB = await prisma.customer.create({ data: { code: `B2-B-${suffix}`, name: 'B2 B' } });
    const internal = await prisma.userAccount.create({
      data: {
        username: `b2-int-${suffix}`,
        email: `b2-int-${suffix}@test.local`,
        fullName: 'B2 Internal',
        userType: 'internal',
        passwordHash: await hashPassword('B2Test@2026!'),
        status: 'ACTIVE',
      },
    });
    const userA = await prisma.userAccount.create({
      data: {
        username: `b2-a-${suffix}`,
        email: `b2-a-${suffix}@test.local`,
        fullName: 'B2 A',
        userType: 'customer',
        passwordHash: await hashPassword('B2Test@2026!'),
        status: 'ACTIVE',
      },
    });
    const userB = await prisma.userAccount.create({
      data: {
        username: `b2-b-${suffix}`,
        email: `b2-b-${suffix}@test.local`,
        fullName: 'B2 B',
        userType: 'customer',
        passwordHash: await hashPassword('B2Test@2026!'),
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
      body: JSON.stringify({ email: internal.email, password: 'B2Test@2026!' }),
    });
    const loginA = await json(base, '/api/auth/login', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ email: userA.email, password: 'B2Test@2026!' }),
    });
    const loginB = await json(base, '/api/auth/login', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ email: userB.email, password: 'B2Test@2026!' }),
    });
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

  it('ENTIRE_INQUIRY snapshots all confirmed plans without aggregating cutting lengths', async () => {
    const created = await json(base, '/api/v2/inquiries', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${tokenA}` },
      body: JSON.stringify({ projectName: `B2 entire ${suffix}` }),
    });
    const inquiryId = created.body.inquiry.id as string;
    const inquiryNumber = created.body.inquiry.inquiryNumber as string;
    const a1 = await addConfirmedLine(inquiryId, inquiryNumber, 'Cable A', 1000, 'CABLE-A');
    const a2 = await confirmRequirement(inquiryId, a1.lineId, 1500, 1, true);
    const b1 = await addConfirmedLine(inquiryId, inquiryNumber, 'Cable B', 2000, 'CABLE-B');

    const group = await json(base, `/api/v2/inquiries/${inquiryId}/shipment-groups`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${tokenInternal}` },
      body: JSON.stringify({
        groupCode: `SG-ALL-${suffix}`,
        deliveryAllocationMode: 'ENTIRE_INQUIRY',
        destinationPortCode: 'ALEX',
        incotermCode: 'CIF',
        containerTypePreferenceCode: '40HQ',
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
        drumPlanId: a1.planId,
        configurationId: 'CFG-LEGACY-FIRST-FIT-V1',
      }),
    });
    assert.equal(snap.status, 201, JSON.stringify(snap.body));
    const prov = snap.body.lineageProvenanceJson as Provenance;
    assert.equal(prov.drumPlans.length, 3);
    assert.equal(snap.body.drums.length, 3);
    const physical = prov.drumLinePins.reduce((n, p) => n + p.numberOfDrums, 0);
    assert.equal(physical, 3);
    const lengths = prov.drumLinePins.map((p) => p.cuttingLengthM).sort((x, y) => x - y);
    assert.deepEqual(lengths, [1000, 1500, 2000]);
    assert.equal(
      lengths.reduce((a, b) => a + b, 0),
      4500,
      'sum exists as a checksum only — plans remain independent'
    );
    const reqIds = new Set(prov.drumPlans.map((p) => p.cuttingLengthRequirementId));
    assert.equal(reqIds.size, 3);
    assert.ok(prov.drumPlans.some((p) => p.drumPlanIdString === a2.planId));
    assert.ok(prov.drumPlans.some((p) => p.drumPlanIdString === b1.planId));
    const cableA = prov.drumPlans.filter((p) => p.cableMaterialNumber === 'CABLE-A');
    assert.equal(cableA.length, 2);
    assert.equal(cableA[0].inquiryLineId, cableA[1].inquiryLineId);
    assert.notEqual(cableA[0].cuttingLengthRequirementId, cableA[1].cuttingLengthRequirementId);
    assert.equal(a1.lineId, a2.lineId);
    assert.notEqual(a1.requirementId, a2.requirementId);

    const calc = await json(base, `/api/v2/container-studies/${study.body.id}/calculate`, {
      method: 'POST',
      headers: { Authorization: `Bearer ${tokenInternal}` },
    });
    assert.equal(calc.status, 200, calc.body.error || JSON.stringify(calc.body));
    assert.equal(calc.body.calculation.algorithmVersionCode, 'LEGACY_FIRST_FIT_V1');
    const expanded =
      (calc.body.calculation.summary.allocatedCount || 0) +
      (calc.body.calculation.summary.unallocatedCount || 0);
    assert.equal(expanded, 3);
    const allocKeys = new Set(
      (calc.body.result.allocations as Array<{ physicalDrumKey: string }>).map((a) => a.physicalDrumKey)
    );
    const unallocKeys = new Set(
      (calc.body.result.unallocated as Array<{ physicalDrumKey: string }>).map((u) => u.physicalDrumKey)
    );
    assert.equal(allocKeys.size + unallocKeys.size, 3);
    assert.equal(
      calc.body.result.summaryJson.containerTypePreference.treatedAsTechnicalAuthority,
      false
    );

    const firstResultId = calc.body.result.id as string;
    const firstAlloc = JSON.stringify(calc.body.result.allocations);
    const calc2 = await json(base, `/api/v2/container-studies/${study.body.id}/calculate`, {
      method: 'POST',
      headers: { Authorization: `Bearer ${tokenInternal}` },
    });
    assert.equal(calc2.status, 200, calc2.body.error);
    assert.notEqual(calc2.body.result.id, firstResultId);
    const hist = await json(base, `/api/v2/container-studies/${study.body.id}/results/${firstResultId}`, {
      headers: { Authorization: `Bearer ${tokenInternal}` },
    });
    assert.equal(hist.status, 200);
    assert.equal(JSON.stringify(hist.body.allocations), firstAlloc);

    const listed = await json(base, `/api/v2/container-studies/${study.body.id}/results`, {
      headers: { Authorization: `Bearer ${tokenInternal}` },
    });
    assert.equal(listed.status, 200);
    assert.equal(listed.body.results.length, 2);

    const prisma = getPrisma()!;
    const requested = await prisma.auditEvent.findMany({
      where: { entityId: study.body.id, action: 'CONTAINER_STUDY_CALCULATION_REQUESTED' },
    });
    assert.ok(requested.length >= 1);
  });

  it('PER_INQUIRY_LINE isolates a single confirmed drum plan', async () => {
    const created = await json(base, '/api/v2/inquiries', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${tokenA}` },
      body: JSON.stringify({ projectName: `B2 perline ${suffix}` }),
    });
    const inquiryId = created.body.inquiry.id as string;
    const inquiryNumber = created.body.inquiry.inquiryNumber as string;
    const a = await addConfirmedLine(inquiryId, inquiryNumber, 'Line A', 1000, 'CABLE-A');
    const b = await addConfirmedLine(inquiryId, inquiryNumber, 'Line B', 2000, 'CABLE-B');
    const group = await json(base, `/api/v2/inquiries/${inquiryId}/shipment-groups`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${tokenInternal}` },
      body: JSON.stringify({
        groupCode: `SG-PER-${suffix}`,
        deliveryAllocationMode: 'PER_INQUIRY_LINE',
        inquiryLineId: a.lineId,
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
    const steal = await json(base, `/api/v2/container-studies/${study.body.id}/input-snapshot`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${tokenInternal}` },
      body: JSON.stringify({ drumPlanId: b.planId, configurationId: 'CFG-LEGACY-FIRST-FIT-V1' }),
    });
    assert.equal(steal.status, 400);
    const snap = await json(base, `/api/v2/container-studies/${study.body.id}/input-snapshot`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${tokenInternal}` },
      body: JSON.stringify({ drumPlanId: a.planId, configurationId: 'CFG-LEGACY-FIRST-FIT-V1' }),
    });
    assert.equal(snap.status, 201, snap.body.error);
    const prov = snap.body.lineageProvenanceJson as Provenance;
    assert.equal(prov.drumPlans.length, 1);
    assert.equal(prov.drumPlans[0].drumPlanIdString, a.planId);
    assert.equal(prov.drumLinePins[0].cuttingLengthM, 1000);
  });

  it('rejects ENTIRE_INQUIRY when a line has no CONFIRMED drum plan', async () => {
    const created = await json(base, '/api/v2/inquiries', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${tokenA}` },
      body: JSON.stringify({ projectName: `B2 missing ${suffix}` }),
    });
    const inquiryId = created.body.inquiry.id as string;
    const inquiryNumber = created.body.inquiry.inquiryNumber as string;
    const a = await addConfirmedLine(inquiryId, inquiryNumber, 'Ready', 500, 'CABLE-A');
    await json(base, `/api/v2/inquiries/${inquiryId}/lines`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${tokenA}` },
      body: JSON.stringify({ cableDescription: 'No drum' }),
    });
    const group = await json(base, `/api/v2/inquiries/${inquiryId}/shipment-groups`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${tokenInternal}` },
      body: JSON.stringify({
        groupCode: `SG-MISS-${suffix}`,
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
      body: JSON.stringify({ drumPlanId: a.planId, configurationId: 'CFG-LEGACY-FIRST-FIT-V1' }),
    });
    assert.equal(snap.status, 400);
  });

  it('rejects cross-customer calculation and result access (IDOR)', async () => {
    const created = await json(base, '/api/v2/inquiries', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${tokenA}` },
      body: JSON.stringify({ projectName: `B2 idor ${suffix}` }),
    });
    const inquiryId = created.body.inquiry.id as string;
    const inquiryNumber = created.body.inquiry.inquiryNumber as string;
    const a = await addConfirmedLine(inquiryId, inquiryNumber, 'IDOR', 500, 'CABLE-A');
    const group = await json(base, `/api/v2/inquiries/${inquiryId}/shipment-groups`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${tokenInternal}` },
      body: JSON.stringify({
        groupCode: `SG-IDOR-${suffix}`,
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
    await json(base, `/api/v2/container-studies/${study.body.id}/input-snapshot`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${tokenInternal}` },
      body: JSON.stringify({ drumPlanId: a.planId, configurationId: 'CFG-LEGACY-FIRST-FIT-V1' }),
    });
    const calc = await json(base, `/api/v2/container-studies/${study.body.id}/calculate`, {
      method: 'POST',
      headers: { Authorization: `Bearer ${tokenB}` },
    });
    assert.ok(calc.status === 401 || calc.status === 403 || calc.status === 404);
    const results = await json(base, `/api/v2/container-studies/${study.body.id}/results`, {
      headers: { Authorization: `Bearer ${tokenB}` },
    });
    assert.ok(results.status === 401 || results.status === 403 || results.status === 404);
  });

  it('plans multiple cutting lengths on one inquiry line independently', async () => {
    const created = await json(base, '/api/v2/inquiries', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${tokenA}` },
      body: JSON.stringify({ projectName: `B2 multi-cl ${suffix}` }),
    });
    const inquiryId = created.body.inquiry.id as string;
    const inquiryNumber = created.body.inquiry.inquiryNumber as string;
    const cl01 = await addConfirmedLine(inquiryId, inquiryNumber, 'Cable A', 1000, 'CABLE-A');
    const cl02 = await confirmRequirement(inquiryId, cl01.lineId, 1500, 1, true);
    const cl03 = await confirmRequirement(inquiryId, cl01.lineId, 2000, 1, true);
    assert.equal(cl01.lineId, cl02.lineId);
    assert.equal(cl02.lineId, cl03.lineId);
    const listed = await json(base, `/api/v2/inquiries/${inquiryId}/lines/${cl01.lineId}/cutting-requirements`, {
      headers: { Authorization: `Bearer ${tokenA}` },
    });
    assert.equal(listed.status, 200, listed.body.error);
    assert.equal(listed.body.requirements.length, 3);
    const noms = listed.body.requirements.map((r: { nominalLengthM: number }) => r.nominalLengthM).sort((a: number, b: number) => a - b);
    assert.deepEqual(noms, [1000, 1500, 2000]);
    assert.notEqual(cl01.requirementId, cl02.requirementId);
    assert.notEqual(cl02.requirementId, cl03.requirementId);
    const group = await json(base, `/api/v2/inquiries/${inquiryId}/shipment-groups`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${tokenInternal}` },
      body: JSON.stringify({
        groupCode: `SG-MCL-${suffix}`,
        deliveryAllocationMode: 'PER_INQUIRY_LINE',
        inquiryLineId: cl01.lineId,
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
    const prov = snap.body.lineageProvenanceJson as Provenance;
    assert.equal(prov.drumPlans.length, 3);
    assert.ok(prov.drumPlans.every((p) => p.inquiryLineId === cl01.lineId));
    const reqIds = new Set(prov.drumPlans.map((p) => p.cuttingLengthRequirementId));
    assert.equal(reqIds.size, 3);
    const lengths = prov.drumLinePins.map((p) => p.cuttingLengthM).sort((x, y) => x - y);
    assert.deepEqual(lengths, [1000, 1500, 2000]);
    assert.ok(prov.drumLinePins.every((p) => p.cuttingLengthRequirementId && p.inquiryLineId));
    assert.ok(prov.drumPlans.every((p) => p.cuttingLengthRequirementId !== p.drumPlanIdString));
  });

  it('does not change drum type when only requested drum count changes', async () => {
    const created = await json(base, '/api/v2/inquiries', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${tokenA}` },
      body: JSON.stringify({ projectName: `B2 drumcount ${suffix}` }),
    });
    const inquiryId = created.body.inquiry.id as string;
    const inquiryNumber = created.body.inquiry.inquiryNumber as string;
    const one = await addConfirmedLine(inquiryId, inquiryNumber, 'Cable A', 1000, 'CABLE-A', 1);
    const three = await confirmRequirement(inquiryId, one.lineId, 1000, 3, true);
    const five = await confirmRequirement(inquiryId, one.lineId, 1000, 5, true);
    assert.equal(one.drumCode, three.drumCode);
    assert.equal(one.drumCode, five.drumCode);
    assert.equal(one.numberOfDrums, 1);
    assert.equal(three.numberOfDrums, 3);
    assert.equal(five.numberOfDrums, 5);
    assert.notEqual(one.requirementId, three.requirementId);
    assert.notEqual(three.requirementId, five.requirementId);
  });

  it('preserves physical drum lineage across multiple CL counts on one line', async () => {
    const created = await json(base, '/api/v2/inquiries', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${tokenA}` },
      body: JSON.stringify({ projectName: `B2 physical ${suffix}` }),
    });
    const inquiryId = created.body.inquiry.id as string;
    const inquiryNumber = created.body.inquiry.inquiryNumber as string;
    const cl01 = await addConfirmedLine(inquiryId, inquiryNumber, 'Cable A', 1000, 'CABLE-A', 2);
    const cl02 = await confirmRequirement(inquiryId, cl01.lineId, 1500, 3, true);
    const cl03 = await confirmRequirement(inquiryId, cl01.lineId, 2000, 1, true);
    const group = await json(base, `/api/v2/inquiries/${inquiryId}/shipment-groups`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${tokenInternal}` },
      body: JSON.stringify({
        groupCode: `SG-PHY-${suffix}`,
        deliveryAllocationMode: 'PER_INQUIRY_LINE',
        inquiryLineId: cl01.lineId,
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
    const prov = snap.body.lineageProvenanceJson as Provenance;
    const byReq = new Map<string, number>();
    for (const pin of prov.drumLinePins) {
      byReq.set(pin.cuttingLengthRequirementId, (byReq.get(pin.cuttingLengthRequirementId) || 0) + pin.numberOfDrums);
    }
    assert.equal(byReq.get(cl01.requirementId), 2);
    assert.equal(byReq.get(cl02.requirementId), 3);
    assert.equal(byReq.get(cl03.requirementId), 1);
    const physical = prov.drumLinePins.reduce((n, p) => n + p.numberOfDrums, 0);
    assert.equal(physical, 6);
    for (const pin of prov.drumLinePins) {
      assert.ok(pin.cuttingLengthRequirementId);
      assert.ok([cl01.requirementId, cl02.requirementId, cl03.requirementId].includes(pin.cuttingLengthRequirementId));
    }
    assert.equal(prov.drumPlans.length, 3);
    assert.ok(prov.drumPlans.every((p) => p.inquiryLineId === cl01.lineId));
  });

  it('ENTIRE_INQUIRY includes all requirements on three lines and fails closed if one confirmed plan is removed', async () => {
    const created = await json(base, '/api/v2/inquiries', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${tokenA}` },
      body: JSON.stringify({ projectName: `B2 entire-3line ${suffix}` }),
    });
    const inquiryId = created.body.inquiry.id as string;
    const inquiryNumber = created.body.inquiry.inquiryNumber as string;
    const a1 = await addConfirmedLine(inquiryId, inquiryNumber, 'Cable A', 1000, 'CABLE-A');
    const a2 = await confirmRequirement(inquiryId, a1.lineId, 1500, 1, true);
    const b1 = await addConfirmedLine(inquiryId, inquiryNumber, 'Cable B', 800, 'CABLE-B');
    const c1 = await addConfirmedLine(inquiryId, inquiryNumber, 'Cable C', 1200, 'CABLE-C');
    const c2 = await confirmRequirement(inquiryId, c1.lineId, 1800, 1, true);
    const group = await json(base, `/api/v2/inquiries/${inquiryId}/shipment-groups`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${tokenInternal}` },
      body: JSON.stringify({
        groupCode: `SG-3L-${suffix}`,
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
    const prov = snap.body.lineageProvenanceJson as Provenance;
    assert.equal(prov.drumPlans.length, 5);
    assert.equal(new Set(prov.cuttingLengthRequirementIds).size, 5);
    assert.ok(prov.drumPlans.some((p) => p.cuttingLengthRequirementId === a2.requirementId));
    assert.ok(prov.drumPlans.some((p) => p.cuttingLengthRequirementId === b1.requirementId));
    assert.ok(prov.drumPlans.some((p) => p.cuttingLengthRequirementId === c2.requirementId));
    const lengths = prov.drumLinePins.map((p) => p.cuttingLengthM).sort((x, y) => x - y);
    assert.deepEqual(lengths, [800, 1000, 1200, 1500, 1800]);
    assert.notEqual(lengths.reduce((a, b) => a + b, 0), lengths[0]);

    const prisma = getPrisma()!;
    await prisma.v2DrumPlan.updateMany({
      where: { planId: c2.planId },
      data: { lifecycleStatus: 'SUPERSEDED' },
    });
    await prisma.v2CuttingLengthRequirement.update({
      where: { id: c2.requirementId },
      data: { currentDrumPlanId: null },
    });
    const study2 = await json(base, `/api/v2/inquiries/${inquiryId}/container-studies`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${tokenInternal}` },
      body: JSON.stringify({
        shipmentGroupId: group.body.id,
        stuffingMethod: 'Rolling',
        region: 'Europe',
      }),
    });
    const failSnap = await json(base, `/api/v2/container-studies/${study2.body.id}/input-snapshot`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${tokenInternal}` },
      body: JSON.stringify({ configurationId: 'CFG-LEGACY-FIRST-FIT-V1' }),
    });
    assert.equal(failSnap.status, 400);
    const failedStudy = await prisma.containerStudy.findUnique({
      where: { id: study2.body.id },
      select: { currentSnapshotId: true },
    });
    assert.equal(failedStudy?.currentSnapshotId, null);
    const firstStill = await json(base, `/api/v2/container-studies/${study.body.id}/input-snapshot`, {
      headers: { Authorization: `Bearer ${tokenInternal}` },
    });
    assert.equal(firstStill.status, 200);
    assert.equal((firstStill.body.lineageProvenanceJson as Provenance).drumPlans.length, 5);
  });

  it('PER_INQUIRY_LINE includes every requirement on one line and excludes the other line', async () => {
    const created = await json(base, '/api/v2/inquiries', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${tokenA}` },
      body: JSON.stringify({ projectName: `B2 perline-multi ${suffix}` }),
    });
    const inquiryId = created.body.inquiry.id as string;
    const inquiryNumber = created.body.inquiry.inquiryNumber as string;
    const a1 = await addConfirmedLine(inquiryId, inquiryNumber, 'Cable A', 1000, 'CABLE-A');
    const a2 = await confirmRequirement(inquiryId, a1.lineId, 1500, 1, true);
    const a3 = await confirmRequirement(inquiryId, a1.lineId, 2000, 1, true);
    const b1 = await addConfirmedLine(inquiryId, inquiryNumber, 'Cable B', 900, 'CABLE-B');
    const group = await json(base, `/api/v2/inquiries/${inquiryId}/shipment-groups`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${tokenInternal}` },
      body: JSON.stringify({
        groupCode: `SG-PER-M-${suffix}`,
        deliveryAllocationMode: 'PER_INQUIRY_LINE',
        inquiryLineId: a1.lineId,
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
    const prov = snap.body.lineageProvenanceJson as Provenance;
    assert.equal(prov.drumPlans.length, 3);
    assert.ok(prov.drumPlans.every((p) => p.inquiryLineId === a1.lineId));
    assert.ok(!prov.drumPlans.some((p) => p.inquiryLineId === b1.lineId));
    assert.deepEqual(
      new Set(prov.drumPlans.map((p) => p.cuttingLengthRequirementId)),
      new Set([a1.requirementId, a2.requirementId, a3.requirementId])
    );
  });

  it('snapshot physical drums follow confirmed plan lines, not requestedDrumCount', async () => {
    const created = await json(base, '/api/v2/inquiries', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${tokenA}` },
      body: JSON.stringify({ projectName: `B2 physical-vs-requested ${suffix}` }),
    });
    const inquiryId = created.body.inquiry.id as string;
    const inquiryNumber = created.body.inquiry.inquiryNumber as string;
    const lineRes = await json(base, `/api/v2/inquiries/${inquiryId}/lines`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${tokenA}` },
      body: JSON.stringify({ cableDescription: 'Cable A' }),
    });
    const lineId = lineRes.body.line.id as string;
    await seedValidSnapshot(lineId, inquiryNumber, lineRes.body.line.lineNumber as number, 'CABLE-A');
    const cutting = await json(base, `/api/v2/inquiries/${inquiryId}/lines/${lineId}/cutting-plans`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${tokenA}` },
      body: JSON.stringify({ nominalLengthM: 2000, tolerancePercent: 1, requestedDrumCount: 1 }),
    });
    assert.equal(cutting.status, 201, cutting.body.error);
    const requirementId = cutting.body.requirement.id as string;
    const drum = await json(base, `/api/v2/inquiries/${inquiryId}/lines/${lineId}/drum-plans`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${tokenA}` },
      body: JSON.stringify({
        selectionMethod: 'MANUAL',
        cuttingLengthRequirementId: requirementId,
        rows: [
          { drumCode, numberOfDrums: 1, cuttingLengthM: 1000, drumTolerancePercent: 0 },
          { drumCode, numberOfDrums: 1, cuttingLengthM: 1000, drumTolerancePercent: 0 },
        ],
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
    const group = await json(base, `/api/v2/inquiries/${inquiryId}/shipment-groups`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${tokenInternal}` },
      body: JSON.stringify({
        groupCode: `SG-PHYS-${suffix}`,
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
      body: JSON.stringify({ configurationId: 'CFG-LEGACY-FIRST-FIT-V1' }),
    });
    assert.equal(snap.status, 201, JSON.stringify(snap.body));
    const prov = snap.body.lineageProvenanceJson as Provenance;
    assert.equal(prov.drumPlans[0].requestedDrumCount, 1);
    assert.equal(prov.drumPlans[0].physicalDrumCount, 2);
    const physical = prov.drumLinePins.reduce((n, p) => n + p.numberOfDrums, 0);
    assert.equal(physical, 2);
    assert.notEqual(physical, prov.drumPlans[0].requestedDrumCount);
  });

  it('historical drum master change does not mutate a captured snapshot', async () => {
    const created = await json(base, '/api/v2/inquiries', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${tokenA}` },
      body: JSON.stringify({ projectName: `B2 hist-master ${suffix}` }),
    });
    const inquiryId = created.body.inquiry.id as string;
    const inquiryNumber = created.body.inquiry.inquiryNumber as string;
    await addConfirmedLine(inquiryId, inquiryNumber, 'Cable A', 1000, 'CABLE-A');
    const group = await json(base, `/api/v2/inquiries/${inquiryId}/shipment-groups`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${tokenInternal}` },
      body: JSON.stringify({
        groupCode: `SG-HIST-${suffix}`,
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
    const packedBefore = Number(snap.body.drums[0].packedLengthMm);
    const prisma = getPrisma()!;
    await prisma.drumMaster.update({
      where: { drumCode },
      data: { flange: 9999, barrel: 111, outerWidth: 222 },
    });
    const calc = await json(base, `/api/v2/container-studies/${study.body.id}/calculate`, {
      method: 'POST',
      headers: { Authorization: `Bearer ${tokenInternal}` },
    });
    assert.equal(calc.status, 200, calc.body.error || JSON.stringify(calc.body));
    const snapAfter = await json(base, `/api/v2/container-studies/${study.body.id}/input-snapshot`, {
      headers: { Authorization: `Bearer ${tokenInternal}` },
    });
    assert.equal(Number(snapAfter.body.drums[0].packedLengthMm), packedBefore);
    await prisma.drumMaster.update({
      where: { drumCode },
      data: { flange: 2600, barrel: 1400, outerWidth: 1600 },
    });
  });
});
