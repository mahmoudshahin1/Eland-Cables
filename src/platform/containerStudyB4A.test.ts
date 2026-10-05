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

describe('Task 05I-DF-B4-A — Shipment Group Foundation', () => {
  let base = '';
  let server: http.Server;
  let tokenInternal = '';
  let tokenA = '';
  let tokenB = '';
  let actorInternal: { id: string; email: string; name: string; userType: 'internal' };
  const suffix = `b4a-${Date.now()}`;
  const drumCode = `EWD-B4A-${suffix}`;

  async function seedValidSnapshot(lineId: string, inquiryNumber: string, lineNumber: number, materialNumber: string) {
    const prisma = getPrisma()!;
    const snapshot = await prisma.v2ConfigurationSnapshot.create({
      data: {
        snapshotId: `v2cfg-${inquiryNumber}-L${lineNumber}-v1-${suffix}`,
        versionNo: 1,
        inquiryLineId: lineId,
        cableMaterialNumber: materialNumber,
        itemCode: materialNumber,
        customerCode: 'TEST-CUST-B4A',
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

  async function confirmRequirement(inquiryId: string, lineId: string, nominalLengthM: number) {
    const cutting = await json(base, `/api/v2/inquiries/${inquiryId}/lines/${lineId}/cutting-plans`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${tokenA}` },
      body: JSON.stringify({
        nominalLengthM,
        tolerancePercent: 1,
        requestedDrumCount: 1,
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
        rows: [{ drumCode, numberOfDrums: 1, cuttingLengthM: nominalLengthM, drumTolerancePercent: 0 }],
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
    return { lineId, planId, requirementId };
  }

  async function addConfirmedLine(
    inquiryId: string,
    inquiryNumber: string,
    description: string,
    nominalLengthM: number,
    materialNumber: string
  ) {
    const lineRes = await json(base, `/api/v2/inquiries/${inquiryId}/lines`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${tokenA}` },
      body: JSON.stringify({ cableDescription: description }),
    });
    assert.equal(lineRes.status, 201, lineRes.body.error);
    const lineId = lineRes.body.line.id as string;
    await seedValidSnapshot(lineId, inquiryNumber, lineRes.body.line.lineNumber as number, materialNumber);
    return confirmRequirement(inquiryId, lineId, nominalLengthM);
  }

  async function createInquiryWithLines(lineCount: number) {
    const created = await json(base, '/api/v2/inquiries', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${tokenA}` },
      body: JSON.stringify({ projectName: `B4A ${suffix} ${Math.random().toString(36).slice(2, 7)}` }),
    });
    const inquiryId = created.body.inquiry.id as string;
    const inquiryNumber = created.body.inquiry.inquiryNumber as string;
    const lines = [];
    for (let i = 1; i <= lineCount; i += 1) {
      lines.push(
        await addConfirmedLine(inquiryId, inquiryNumber, `Cable ${i}`, 1000 + i * 10, `CABLE-B4A-${i}`)
      );
    }
    return { inquiryId, inquiryNumber, lines };
  }

  async function createStudyOnGroup(inquiryId: string, shipmentGroupId: string) {
    const study = await json(base, `/api/v2/inquiries/${inquiryId}/container-studies`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${tokenInternal}` },
      body: JSON.stringify({
        shipmentGroupId,
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
    return { studyId: study.body.id as string, snap: snap.body };
  }

  async function calculateValidateConfirm(studyId: string) {
    const calc = await json(base, `/api/v2/container-studies/${studyId}/calculate`, {
      method: 'POST',
      headers: { Authorization: `Bearer ${tokenInternal}` },
    });
    assert.equal(calc.status, 200, calc.body.error);
    const validated = await json(base, `/api/v2/container-studies/${studyId}/validate`, {
      method: 'POST',
      headers: { Authorization: `Bearer ${tokenInternal}` },
    });
    assert.equal(validated.status, 200, JSON.stringify(validated.body));
    const confirmed = await json(base, `/api/v2/container-studies/${studyId}/confirm`, {
      method: 'POST',
      headers: { Authorization: `Bearer ${tokenInternal}` },
    });
    assert.equal(confirmed.status, 200, JSON.stringify(confirmed.body));
    return confirmed.body;
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
    const custA = await prisma.customer.create({ data: { code: `B4A-A-${suffix}`, name: 'B4A A' } });
    const custB = await prisma.customer.create({ data: { code: `B4A-B-${suffix}`, name: 'B4A B' } });
    const internal = await prisma.userAccount.create({
      data: {
        username: `b4a-int-${suffix}`,
        email: `b4a-int-${suffix}@test.local`,
        fullName: 'B4A Internal',
        userType: 'internal',
        passwordHash: await hashPassword('B4ATest@2026!'),
        status: 'ACTIVE',
      },
    });
    const userA = await prisma.userAccount.create({
      data: {
        username: `b4a-a-${suffix}`,
        email: `b4a-a-${suffix}@test.local`,
        fullName: 'B4A A',
        userType: 'customer',
        passwordHash: await hashPassword('B4ATest@2026!'),
        status: 'ACTIVE',
      },
    });
    const userB = await prisma.userAccount.create({
      data: {
        username: `b4a-b-${suffix}`,
        email: `b4a-b-${suffix}@test.local`,
        fullName: 'B4A B',
        userType: 'customer',
        passwordHash: await hashPassword('B4ATest@2026!'),
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
    app.use('/api/v2', containerStudyRouter);
    const started = await listen(app);
    server = started.server;
    base = started.base;
    const loginInt = await json(base, '/api/auth/login', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ email: internal.email, password: 'B4ATest@2026!' }),
    });
    const loginA = await json(base, '/api/auth/login', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ email: userA.email, password: 'B4ATest@2026!' }),
    });
    const loginB = await json(base, '/api/auth/login', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ email: userB.email, password: 'B4ATest@2026!' }),
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

  it('ENTIRE_INQUIRY rejects mixed shipment identity and a subset of lines', async () => {
    const { inquiryId, lines } = await createInquiryWithLines(3);
    const mixed = await json(base, `/api/v2/inquiries/${inquiryId}/shipment-groups`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${tokenInternal}` },
      body: JSON.stringify({
        groupCode: `SG-MIX-${suffix}`,
        deliveryAllocationMode: 'ENTIRE_INQUIRY',
        destinationPortCode: 'ALEX',
        incotermCode: 'DAP',
        memberIdentities: [
          { inquiryLineId: lines[0]!.lineId, destinationPortCode: 'ALEX' },
          { inquiryLineId: lines[1]!.lineId, destinationPortCode: 'JEDDAH' },
          { inquiryLineId: lines[2]!.lineId, destinationPortCode: 'ALEX' },
        ],
      }),
    });
    assert.equal(mixed.status, 400);
    assert.equal(mixed.body.details?.issues?.[0]?.code, 'MIXED_SHIPMENT_IDENTITY');

    const subset = await json(base, `/api/v2/inquiries/${inquiryId}/shipment-groups`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${tokenInternal}` },
      body: JSON.stringify({
        groupCode: `SG-SUB-${suffix}`,
        deliveryAllocationMode: 'ENTIRE_INQUIRY',
        destinationPortCode: 'ALEX',
        incotermCode: 'DAP',
        inquiryLineIds: [lines[0]!.lineId, lines[2]!.lineId],
      }),
    });
    assert.equal(subset.status, 400);
    assert.match(String(subset.body.error), /DESTINATION_CLUSTER/);
  });

  it('PER_INQUIRY_LINE contains exactly one line and dual-writes inquiryLineId', async () => {
    const { inquiryId, lines } = await createInquiryWithLines(2);
    const tooMany = await json(base, `/api/v2/inquiries/${inquiryId}/shipment-groups`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${tokenInternal}` },
      body: JSON.stringify({
        groupCode: `SG-PER-BAD-${suffix}`,
        deliveryAllocationMode: 'PER_INQUIRY_LINE',
        inquiryLineId: lines[0]!.lineId,
        inquiryLineIds: [lines[0]!.lineId, lines[1]!.lineId],
        destinationPortCode: 'ALEX',
        incotermCode: 'DAP',
      }),
    });
    assert.equal(tooMany.status, 400);

    const group = await json(base, `/api/v2/inquiries/${inquiryId}/shipment-groups`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${tokenInternal}` },
      body: JSON.stringify({
        groupCode: `SG-PER-${suffix}`,
        deliveryAllocationMode: 'PER_INQUIRY_LINE',
        inquiryLineId: lines[1]!.lineId,
        destinationPortCode: 'JEDDAH',
        incotermCode: 'CIF',
      }),
    });
    assert.equal(group.status, 201, group.body.error);
    assert.equal(group.body.inquiryLineId, lines[1]!.lineId);
    assert.equal(group.body.memberLines.length, 1);
    assert.equal(group.body.memberLines[0].inquiryLineId, lines[1]!.lineId);
    assert.equal(group.body.inquiryLineId, group.body.memberLines[0].inquiryLineId);
  });

  it('DESTINATION_CLUSTER groups Lines 1+3 while Line 2 belongs to another destination group', async () => {
    const { inquiryId, lines } = await createInquiryWithLines(3);
    const [line1, line2, line3] = lines;
    const cluster = await json(base, `/api/v2/inquiries/${inquiryId}/shipment-groups`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${tokenInternal}` },
      body: JSON.stringify({
        groupCode: `SG-ALEX-${suffix}`,
        deliveryAllocationMode: 'DESTINATION_CLUSTER',
        inquiryLineIds: [line1!.lineId, line3!.lineId],
        destinationPortCode: 'ALEX',
        incotermCode: 'DAP',
        memberIdentities: [
          { inquiryLineId: line1!.lineId, destinationPortCode: 'ALEX', incotermCode: 'DAP' },
          { inquiryLineId: line3!.lineId, destinationPortCode: 'ALEX', incotermCode: 'DAP' },
        ],
      }),
    });
    assert.equal(cluster.status, 201, cluster.body.error);
    assert.equal(cluster.body.inquiryLineId, null);
    assert.deepEqual(
      cluster.body.memberLines.map((m: { inquiryLineId: string }) => m.inquiryLineId).sort(),
      [line1!.lineId, line3!.lineId].sort()
    );

    const jeddah = await json(base, `/api/v2/inquiries/${inquiryId}/shipment-groups`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${tokenInternal}` },
      body: JSON.stringify({
        groupCode: `SG-JED-${suffix}`,
        deliveryAllocationMode: 'PER_INQUIRY_LINE',
        inquiryLineId: line2!.lineId,
        destinationPortCode: 'JEDDAH',
        incotermCode: 'CIF',
      }),
    });
    assert.equal(jeddah.status, 201, jeddah.body.error);
    assert.equal(jeddah.body.inquiryLineId, line2!.lineId);

    const overlap = await json(base, `/api/v2/inquiries/${inquiryId}/shipment-groups`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${tokenInternal}` },
      body: JSON.stringify({
        groupCode: `SG-OVL-${suffix}`,
        deliveryAllocationMode: 'PER_INQUIRY_LINE',
        inquiryLineId: line1!.lineId,
        destinationPortCode: 'ALEX',
        incotermCode: 'DAP',
      }),
    });
    assert.equal(overlap.status, 400);

    const listed = await json(base, `/api/v2/inquiries/${inquiryId}/shipment-groups`, {
      headers: { Authorization: `Bearer ${tokenInternal}` },
    });
    assert.equal(listed.status, 200);
    assert.equal(listed.body.groups.length, 2);

    const study = await createStudyOnGroup(inquiryId, cluster.body.id);
    const lineageLineIds = new Set(
      (study.snap.lineageProvenanceJson.drumPlans as Array<{ inquiryLineId: string }>).map((p) => p.inquiryLineId)
    );
    assert.ok(lineageLineIds.has(line1!.lineId));
    assert.ok(lineageLineIds.has(line3!.lineId));
    assert.equal(lineageLineIds.has(line2!.lineId), false);
  });

  it('LOCKED group identity cannot be mutated; identity change requires a new group', async () => {
    const { inquiryId, lines } = await createInquiryWithLines(1);
    const group = await json(base, `/api/v2/inquiries/${inquiryId}/shipment-groups`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${tokenInternal}` },
      body: JSON.stringify({
        groupCode: `SG-LOCK-${suffix}`,
        deliveryAllocationMode: 'ENTIRE_INQUIRY',
        destinationPortCode: 'ALEX',
        incotermCode: 'DAP',
      }),
    });
    assert.equal(group.status, 201, group.body.error);
    const { studyId } = await createStudyOnGroup(inquiryId, group.body.id);
    await calculateValidateConfirm(studyId);

    const locked = await json(base, `/api/v2/shipment-groups/${group.body.id}`, {
      headers: { Authorization: `Bearer ${tokenInternal}` },
    });
    assert.equal(locked.body.status, 'LOCKED');

    for (const body of [
      { destinationPortCode: 'JEDDAH' },
      { incotermCode: 'CIF' },
      { deliveryAllocationMode: 'PER_INQUIRY_LINE', inquiryLineId: lines[0]!.lineId },
      { inquiryLineIds: [lines[0]!.lineId] },
    ]) {
      const patched = await json(base, `/api/v2/shipment-groups/${group.body.id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${tokenInternal}` },
        body: JSON.stringify(body),
      });
      assert.equal(patched.status, 409, JSON.stringify(body));
      assert.equal(patched.body.details?.issues?.[0]?.code, 'SHIPMENT_GROUP_IDENTITY_LOCKED');
    }

    const successorGroup = await json(base, `/api/v2/shipment-groups/${group.body.id}/supersede`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${tokenInternal}` },
      body: JSON.stringify({
        destinationPortCode: 'JEDDAH',
        incotermCode: 'CIF',
        deliveryAllocationMode: 'ENTIRE_INQUIRY',
      }),
    });
    assert.equal(successorGroup.status, 201, successorGroup.body.error);
    assert.equal(successorGroup.body.destinationPortCode, 'JEDDAH');
    assert.equal(successorGroup.body.incotermCode, 'CIF');
    assert.notEqual(successorGroup.body.id, group.body.id);

    const old = await json(base, `/api/v2/shipment-groups/${group.body.id}`, {
      headers: { Authorization: `Bearer ${tokenInternal}` },
    });
    assert.equal(old.body.status, 'SUPERSEDED');
    assert.equal(old.body.destinationPortCode, 'ALEX');
  });

  it('LOCKED group can receive a successor Container Study snapshot', async () => {
    const { inquiryId } = await createInquiryWithLines(1);
    const group = await json(base, `/api/v2/inquiries/${inquiryId}/shipment-groups`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${tokenInternal}` },
      body: JSON.stringify({
        groupCode: `SG-SUCC-${suffix}`,
        deliveryAllocationMode: 'ENTIRE_INQUIRY',
        destinationPortCode: 'ALEX',
        incotermCode: 'DAP',
      }),
    });
    const first = await createStudyOnGroup(inquiryId, group.body.id);
    const confirmed = await calculateValidateConfirm(first.studyId);
    assert.equal(confirmed.status, 'CONFIRMED');

    const successor = await json(base, `/api/v2/container-studies/${first.studyId}/supersede`, {
      method: 'POST',
      headers: { Authorization: `Bearer ${tokenInternal}` },
    });
    assert.equal(successor.status, 201, successor.body.error);
    assert.equal(successor.body.status, 'DRAFT');
    assert.equal(successor.body.shipmentGroupId, group.body.id);

    const snap = await json(base, `/api/v2/container-studies/${successor.body.id}/input-snapshot`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${tokenInternal}` },
      body: JSON.stringify({ configurationId: 'CFG-LEGACY-FIRST-FIT-V1' }),
    });
    assert.equal(snap.status, 201, JSON.stringify(snap.body));

    const historical = await json(base, `/api/v2/container-studies/${first.studyId}`, {
      headers: { Authorization: `Bearer ${tokenInternal}` },
    });
    assert.equal(historical.body.status, 'SUPERSEDED');
    assert.equal(historical.body.currentSnapshotId, first.snap.id);

    const prisma = getPrisma()!;
    const audits = await prisma.auditEvent.findMany({
      where: { entityId: group.body.id, action: { in: ['SHIPMENT_GROUP_CREATED', 'SHIPMENT_GROUP_LOCKED'] } },
    });
    assert.ok(audits.some((a) => a.action === 'SHIPMENT_GROUP_CREATED'));
    assert.ok(audits.some((a) => a.action === 'SHIPMENT_GROUP_LOCKED'));
  });

  it('stale Drum Plan still blocks Container Study confirmation', async () => {
    const { inquiryId, lines } = await createInquiryWithLines(1);
    const group = await json(base, `/api/v2/inquiries/${inquiryId}/shipment-groups`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${tokenInternal}` },
      body: JSON.stringify({
        groupCode: `SG-STALE-${suffix}`,
        deliveryAllocationMode: 'ENTIRE_INQUIRY',
        destinationPortCode: 'ALEX',
        incotermCode: 'DAP',
      }),
    });
    const { studyId } = await createStudyOnGroup(inquiryId, group.body.id);
    await json(base, `/api/v2/container-studies/${studyId}/calculate`, {
      method: 'POST',
      headers: { Authorization: `Bearer ${tokenInternal}` },
    });
    await json(base, `/api/v2/container-studies/${studyId}/validate`, {
      method: 'POST',
      headers: { Authorization: `Bearer ${tokenInternal}` },
    });
    const prisma = getPrisma()!;
    const plan = await prisma.v2DrumPlan.findFirst({ where: { planId: lines[0]!.planId } });
    assert.ok(plan);
    await prisma.v2DrumPlan.update({ where: { id: plan.id }, data: { versionNo: plan.versionNo + 1 } });
    const stale = await json(base, `/api/v2/container-studies/${studyId}/confirm`, {
      method: 'POST',
      headers: { Authorization: `Bearer ${tokenInternal}` },
    });
    assert.equal(stale.status, 400);
    assert.ok((stale.body.details?.issues || []).some((i: { code: string }) => i.code === 'STALE_DRUM_PLAN'));
  });

  it('enforces customer isolation and RBAC on shipment-group commands', async () => {
    const { inquiryId } = await createInquiryWithLines(1);
    const deniedCreate = await json(base, `/api/v2/inquiries/${inquiryId}/shipment-groups`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${tokenA}` },
      body: JSON.stringify({
        groupCode: `SG-RBAC-${suffix}`,
        destinationPortCode: 'ALEX',
        incotermCode: 'DAP',
      }),
    });
    assert.ok(deniedCreate.status === 401 || deniedCreate.status === 403);

    const group = await json(base, `/api/v2/inquiries/${inquiryId}/shipment-groups`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${tokenInternal}` },
      body: JSON.stringify({
        groupCode: `SG-RBAC-${suffix}`,
        destinationPortCode: 'ALEX',
        incotermCode: 'DAP',
      }),
    });
    assert.equal(group.status, 201, group.body.error);

    const ownView = await json(base, `/api/v2/shipment-groups/${group.body.id}`, {
      headers: { Authorization: `Bearer ${tokenA}` },
    });
    assert.ok(ownView.status === 401 || ownView.status === 403);
    const steal = await json(base, `/api/v2/shipment-groups/${group.body.id}`, {
      headers: { Authorization: `Bearer ${tokenB}` },
    });
    assert.ok(steal.status === 401 || steal.status === 403 || steal.status === 404);

    const customerPatch = await json(base, `/api/v2/shipment-groups/${group.body.id}`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${tokenA}` },
      body: JSON.stringify({ notes: 'nope' }),
    });
    assert.ok(customerPatch.status === 401 || customerPatch.status === 403);
    const customerSupersede = await json(base, `/api/v2/shipment-groups/${group.body.id}/supersede`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${tokenA}` },
      body: JSON.stringify({ destinationPortCode: 'JEDDAH' }),
    });
    assert.ok(customerSupersede.status === 401 || customerSupersede.status === 403);
  });
});
