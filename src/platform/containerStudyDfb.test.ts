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
import { CONTAINER_STUDY_DRUM_PLAN_REQUIRED_MESSAGE, CONTAINER_STUDY_DRUM_PLAN_UNCONFIRMED_MESSAGE } from '../domain/inquiryContainerStudyPresentation';
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

describe('Task 05I-DF-B — Shipment Group + confirmed Drum Plan → immutable input snapshot', () => {
  let base = '';
  let server: http.Server;
  let tokenInternal = '';
  let tokenA = '';
  let custAId = '';
  let actorInternal: { id: string; email: string; name: string; userType: 'internal' };
  const suffix = `dfb-${Date.now()}-${process.pid}-${Math.random().toString(36).slice(2, 8)}`;
  const inquiryIds: string[] = [];
  const drumCode = `EWD-DFB-${suffix}`;

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
        cableMaterialNumber: 'TEST-MAT-DFB',
        itemCode: 'TEST-ITEM-DFB',
        customerCode: 'TEST-CUST-DFB',
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
    assert.ok(
      confirmed.status === 200 || confirmed.status === 201,
      confirmed.body.error || JSON.stringify(confirmed.body)
    );
    assert.equal(confirmed.body.drumPlan.lifecycleStatus, 'CONFIRMED');
    return {
      planId,
      drumPlanDbId: (confirmed.body.drumPlan.id || drum.body.drumPlan.id) as string,
      versionNo: confirmed.body.drumPlan.versionNo as number,
    };
  }

  async function createGroupAndStudy(inquiryId: string, lineId: string, groupCode: string, mode: 'ENTIRE_INQUIRY' | 'PER_INQUIRY_LINE') {
    const group = await json(base, `/api/v2/inquiries/${inquiryId}/shipment-groups`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${tokenInternal}` },
      body: JSON.stringify({
        groupCode,
        deliveryAllocationMode: mode,
        inquiryLineId: mode === 'PER_INQUIRY_LINE' ? lineId : undefined,
        destinationPortCode: 'ALEXANDRIA',
        incotermCode: 'FOB',
      }),
    });
    assert.equal(group.status, 201, group.body.error || JSON.stringify(group.body));
    const study = await json(base, `/api/v2/inquiries/${inquiryId}/container-studies`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${tokenInternal}` },
      body: JSON.stringify({
        shipmentGroupId: group.body.id,
        stuffingMethod: 'Rolling',
        region: 'Europe',
      }),
    });
    assert.equal(study.status, 201, study.body.error || JSON.stringify(study.body));
    return { group, study };
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
    await prisma.destinationPort.upsert({
      where: { code: 'ROTTERDAM' },
      create: { code: 'ROTTERDAM', name: 'ROTTERDAM', countryCode: 'NL', active: true },
      update: { active: true },
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
    const custA = await prisma.customer.create({ data: { code: `DFB-A-${suffix}`, name: 'DFB A' } });
    custAId = custA.id;
    const internal = await prisma.userAccount.create({
      data: {
        username: `dfb-int-${suffix}`,
        email: `dfb-int-${suffix}@test.local`,
        fullName: 'DFB Internal',
        userType: 'internal',
        passwordHash: await hashPassword('DfbTest@2026!'),
        status: 'ACTIVE',
      },
    });
    const userA = await prisma.userAccount.create({
      data: {
        username: `dfb-a-${suffix}`,
        email: `dfb-a-${suffix}@test.local`,
        fullName: 'DFB A',
        userType: 'customer',
        passwordHash: await hashPassword('DfbTest@2026!'),
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
    const started = await listen(app);
    server = started.server;
    base = started.base;
    const loginInt = await json(base, '/api/auth/login', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ email: internal.email, password: 'DfbTest@2026!' }),
    });
    const loginA = await json(base, '/api/auth/login', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ email: userA.email, password: 'DfbTest@2026!' }),
    });
    assert.equal(loginInt.status, 200, loginInt.body.error);
    assert.equal(loginA.status, 200, loginA.body.error);
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
      await deleteV2LineageForInquiries(prisma, inquiryIds);
      await prisma.commercialInquiryLine.deleteMany({ where: { inquiryId: { in: inquiryIds } } });
      await prisma.commercialInquiry.deleteMany({ where: { id: { in: inquiryIds } } });
    }
    await new Promise<void>((resolve, reject) => server.close((err) => (err ? reject(err) : resolve())));
  });

  it('01 create SG from valid saved combination', async () => {
    const { inquiryId } = await createInquiryWithLine(`DFB 01 ${suffix}`);
    await saveInquiryDelivery(inquiryId, 'ROTTERDAM', 'CIF', 'NETHERLANDS / CIF / ROTTERDAM');
    const group = await json(base, `/api/v2/inquiries/${inquiryId}/shipment-groups`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${tokenInternal}` },
      body: JSON.stringify({ groupCode: `SG-01-${suffix}`, deliveryAllocationMode: 'ENTIRE_INQUIRY' }),
    });
    assert.equal(group.status, 201, group.body.error || JSON.stringify(group.body));
    assert.equal(group.body.destinationPortCode, 'ROTTERDAM');
    assert.equal(group.body.incotermCode, 'CIF');
    assert.equal(group.body.deliveryAllocationMode, 'ENTIRE_INQUIRY');
  });

  it('02 destination from SAVED inquiry', async () => {
    const { inquiryId } = await createInquiryWithLine(`DFB 02 ${suffix}`);
    await saveInquiryDelivery(inquiryId, 'ROTTERDAM', 'CIF', 'NETHERLANDS / CIF / ROTTERDAM');
    const group = await json(base, `/api/v2/inquiries/${inquiryId}/shipment-groups`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${tokenInternal}` },
      body: JSON.stringify({ groupCode: `SG-02-${suffix}` }),
    });
    assert.equal(group.body.destinationPortCode, 'ROTTERDAM');
    assert.notEqual(group.body.destinationPortCode, 'ALEXANDRIA');
  });

  it('03 customer default NOT used', async () => {
    const prisma = getPrisma()!;
    await prisma.customerDeliveryCombination.create({
      data: {
        customerId: custAId,
        countryCode: 'GB',
        countryLabel: 'UK',
        incotermCode: 'CIF',
        destinationPortCode: 'DONCASTER',
        active: true,
        isDefault: true,
      },
    });
    const { inquiryId } = await createInquiryWithLine(`DFB 03 ${suffix}`);
    await saveInquiryDelivery(inquiryId, 'ROTTERDAM', 'CIF', 'NETHERLANDS / CIF / ROTTERDAM');
    const group = await json(base, `/api/v2/inquiries/${inquiryId}/shipment-groups`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${tokenInternal}` },
      body: JSON.stringify({ groupCode: `SG-03-${suffix}` }),
    });
    assert.equal(group.body.destinationPortCode, 'ROTTERDAM');
    assert.notEqual(group.body.destinationPortCode, 'DONCASTER');
  });

  it('04 unsaved UI destination cannot influence persisted SG', async () => {
    const { inquiryId } = await createInquiryWithLine(`DFB 04 ${suffix}`);
    await saveInquiryDelivery(inquiryId, 'ROTTERDAM', 'CIF', 'NETHERLANDS / CIF / ROTTERDAM');
    const group = await json(base, `/api/v2/inquiries/${inquiryId}/shipment-groups`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${tokenInternal}` },
      body: JSON.stringify({
        groupCode: `SG-04-${suffix}`,
        destinationPortCode: 'ALEXANDRIA',
        destinationKey: 'Alexandria',
        incotermCode: 'FOB',
      }),
    });
    assert.equal(group.status, 201, group.body.error);
    assert.equal(group.body.destinationPortCode, 'ROTTERDAM');
    assert.equal(group.body.incotermCode, 'CIF');
  });

  it('05 SG with confirmed Drum Plan → snapshot', async () => {
    const created = await createInquiryWithLine(`DFB 05 ${suffix}`);
    await saveInquiryDelivery(created.inquiryId, 'ROTTERDAM', 'CIF', 'NETHERLANDS / CIF / ROTTERDAM');
    const drum = await confirmDrumForLine(created.inquiryId, created.lineId, created.inquiryNumber, created.lineNumber);
    const { group, study } = await createGroupAndStudy(created.inquiryId, created.lineId, `SG-05-${suffix}`, 'PER_INQUIRY_LINE');
    assert.equal(group.body.destinationPortCode, 'ROTTERDAM');
    const snap = await json(base, `/api/v2/container-studies/${study.body.id}/input-snapshot`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${tokenInternal}` },
      body: JSON.stringify({
        inquiryLineId: created.lineId,
        drumPlanId: drum.planId,
        configurationId: 'CFG-LEGACY-FIRST-FIT-V1',
      }),
    });
    assert.equal(snap.status, 201, JSON.stringify(snap.body));
    assert.ok(snap.body.drums?.length >= 1);
  });

  it('06 reject snapshot if drum plan not CONFIRMED', async () => {
    const created = await createInquiryWithLine(`DFB 06 ${suffix}`);
    await saveInquiryDelivery(created.inquiryId, 'ROTTERDAM', 'CIF', 'NETHERLANDS / CIF / ROTTERDAM');
    await seedValidSnapshot(created.inquiryId, created.lineId, created.inquiryNumber, created.lineNumber);
    await json(base, `/api/v2/inquiries/${created.inquiryId}/lines/${created.lineId}/cutting-plans`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${tokenA}` },
      body: JSON.stringify({ nominalLengthM: 500, tolerancePercent: 1 }),
    });
    const drum = await json(base, `/api/v2/inquiries/${created.inquiryId}/lines/${created.lineId}/drum-plans`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${tokenA}` },
      body: JSON.stringify({
        selectionMethod: 'MANUAL',
        rows: [{ drumCode, numberOfDrums: 1, cuttingLengthM: 500, drumTolerancePercent: 0 }],
      }),
    });
    const { study } = await createGroupAndStudy(created.inquiryId, created.lineId, `SG-06-${suffix}`, 'PER_INQUIRY_LINE');
    const snap = await json(base, `/api/v2/container-studies/${study.body.id}/input-snapshot`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${tokenInternal}` },
      body: JSON.stringify({
        inquiryLineId: created.lineId,
        drumPlanId: drum.body.drumPlan.planId,
        configurationId: 'CFG-LEGACY-FIRST-FIT-V1',
      }),
    });
    assert.equal(snap.status, 400);
    assert.match(String(snap.body.error || ''), new RegExp(CONTAINER_STUDY_DRUM_PLAN_UNCONFIRMED_MESSAGE.slice(0, 24)));
  });

  it('07 reject if drum plan missing', async () => {
    const created = await createInquiryWithLine(`DFB 07 ${suffix}`);
    await saveInquiryDelivery(created.inquiryId, 'ROTTERDAM', 'CIF', 'NETHERLANDS / CIF / ROTTERDAM');
    const { study } = await createGroupAndStudy(created.inquiryId, created.lineId, `SG-07-${suffix}`, 'PER_INQUIRY_LINE');
    const snap = await json(base, `/api/v2/container-studies/${study.body.id}/input-snapshot`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${tokenInternal}` },
      body: JSON.stringify({ configurationId: 'CFG-LEGACY-FIRST-FIT-V1' }),
    });
    assert.equal(snap.status, 400);
    assert.match(String(snap.body.error || ''), new RegExp(CONTAINER_STUDY_DRUM_PLAN_REQUIRED_MESSAGE.slice(0, 24)));
  });

  it('08 drum plan ID/version provenance', async () => {
    const created = await createInquiryWithLine(`DFB 08 ${suffix}`);
    await saveInquiryDelivery(created.inquiryId, 'ROTTERDAM', 'CIF', 'NETHERLANDS / CIF / ROTTERDAM');
    const drum = await confirmDrumForLine(created.inquiryId, created.lineId, created.inquiryNumber, created.lineNumber);
    const { study } = await createGroupAndStudy(created.inquiryId, created.lineId, `SG-08-${suffix}`, 'PER_INQUIRY_LINE');
    const snap = await json(base, `/api/v2/container-studies/${study.body.id}/input-snapshot`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${tokenInternal}` },
      body: JSON.stringify({
        inquiryLineId: created.lineId,
        drumPlanId: drum.planId,
        configurationId: 'CFG-LEGACY-FIRST-FIT-V1',
      }),
    });
    const prov = snap.body.lineageProvenanceJson as {
      drumPlanId: string;
      drumPlanIdString: string;
      drumPlanVersionNo: number;
      inquiryLineId: string;
    };
    assert.equal(prov.drumPlanIdString, drum.planId);
    assert.equal(prov.drumPlanId, drum.drumPlanDbId);
    assert.equal(prov.inquiryLineId, created.lineId);
    assert.equal(prov.drumPlanVersionNo, drum.versionNo);
  });

  it('09 every physical drum has traceable provenance', async () => {
    const created = await createInquiryWithLine(`DFB 09 ${suffix}`);
    await saveInquiryDelivery(created.inquiryId, 'ROTTERDAM', 'CIF', 'NETHERLANDS / CIF / ROTTERDAM');
    const drum = await confirmDrumForLine(created.inquiryId, created.lineId, created.inquiryNumber, created.lineNumber);
    const { study } = await createGroupAndStudy(created.inquiryId, created.lineId, `SG-09-${suffix}`, 'PER_INQUIRY_LINE');
    const snap = await json(base, `/api/v2/container-studies/${study.body.id}/input-snapshot`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${tokenInternal}` },
      body: JSON.stringify({
        inquiryLineId: created.lineId,
        drumPlanId: drum.planId,
        configurationId: 'CFG-LEGACY-FIRST-FIT-V1',
      }),
    });
    const lineage = snap.body.lineageProvenanceJson as {
      physicalDrumPins: Array<{ physicalDrumKey: string; drumPlanLineId: string; inquiryLineId: string }>;
    };
    const qty = (snap.body.drums as Array<{ quantity: number }>).reduce((n, d) => n + d.quantity, 0);
    assert.equal(lineage.physicalDrumPins.length, qty);
    assert.ok(qty >= 1);
    for (const pin of lineage.physicalDrumPins) {
      assert.ok(pin.physicalDrumKey);
      assert.ok(pin.drumPlanLineId);
      assert.equal(pin.inquiryLineId, created.lineId);
    }
  });

  it('10 copied drum/calculation inputs persisted', async () => {
    const created = await createInquiryWithLine(`DFB 10 ${suffix}`);
    await saveInquiryDelivery(created.inquiryId, 'ROTTERDAM', 'CIF', 'NETHERLANDS / CIF / ROTTERDAM');
    const drum = await confirmDrumForLine(created.inquiryId, created.lineId, created.inquiryNumber, created.lineNumber);
    const { study } = await createGroupAndStudy(created.inquiryId, created.lineId, `SG-10-${suffix}`, 'PER_INQUIRY_LINE');
    const snap = await json(base, `/api/v2/container-studies/${study.body.id}/input-snapshot`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${tokenInternal}` },
      body: JSON.stringify({
        inquiryLineId: created.lineId,
        drumPlanId: drum.planId,
        configurationId: 'CFG-LEGACY-FIRST-FIT-V1',
      }),
    });
    const row = snap.body.drums[0];
    assert.equal(Number(row.packedLengthMm), 1400);
    assert.ok(Number(row.packedWidthMm) > 0);
    assert.ok(Number(row.grossWeightKg) > 0);
    assert.ok(row.drumCode);
    assert.ok(snap.body.algorithmParameterPinJson);
    assert.ok(snap.body.containerMasterPinJson);
  });

  it('11 snapshot cannot be mutated after create', async () => {
    const created = await createInquiryWithLine(`DFB 11 ${suffix}`);
    await saveInquiryDelivery(created.inquiryId, 'ROTTERDAM', 'CIF', 'NETHERLANDS / CIF / ROTTERDAM');
    const drum = await confirmDrumForLine(created.inquiryId, created.lineId, created.inquiryNumber, created.lineNumber);
    const { study } = await createGroupAndStudy(created.inquiryId, created.lineId, `SG-11-${suffix}`, 'PER_INQUIRY_LINE');
    const createdSnap = await json(base, `/api/v2/container-studies/${study.body.id}/input-snapshot`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${tokenInternal}` },
      body: JSON.stringify({
        inquiryLineId: created.lineId,
        drumPlanId: drum.planId,
        configurationId: 'CFG-LEGACY-FIRST-FIT-V1',
      }),
    });
    assert.equal(createdSnap.status, 201);
    const patch = await json(base, `/api/v2/container-studies/${study.body.id}/input-snapshot`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${tokenInternal}` },
      body: JSON.stringify({ packedLengthMm: 1 }),
    });
    const put = await json(base, `/api/v2/container-studies/${study.body.id}/input-snapshot`, {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${tokenInternal}` },
      body: JSON.stringify({ packedLengthMm: 1 }),
    });
    const dup = await json(base, `/api/v2/container-studies/${study.body.id}/input-snapshot`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${tokenInternal}` },
      body: JSON.stringify({
        inquiryLineId: created.lineId,
        drumPlanId: drum.planId,
        configurationId: 'CFG-LEGACY-FIRST-FIT-V1',
      }),
    });
    assert.equal(patch.status, 409);
    assert.equal(put.status, 409);
    assert.equal(dup.status, 409);
  });

  it('12 confirmed SG cannot be silently mutated', async () => {
    const created = await createInquiryWithLine(`DFB 12 ${suffix}`);
    await saveInquiryDelivery(created.inquiryId, 'ROTTERDAM', 'CIF', 'NETHERLANDS / CIF / ROTTERDAM');
    const { group } = await createGroupAndStudy(created.inquiryId, created.lineId, `SG-12-${suffix}`, 'PER_INQUIRY_LINE');
    const confirmed = await json(base, `/api/v2/shipment-groups/${group.body.id}/confirm`, {
      method: 'POST',
      headers: { Authorization: `Bearer ${tokenInternal}` },
    });
    assert.equal(confirmed.status, 200, confirmed.body.error || JSON.stringify(confirmed.body));
    assert.equal(confirmed.body.status, 'LOCKED');
    const mutated = await json(base, `/api/v2/shipment-groups/${group.body.id}`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${tokenInternal}` },
      body: JSON.stringify({ destinationPortCode: 'DONCASTER', notes: 'silent' }),
    });
    assert.equal(mutated.status, 409);
    const reload = await json(base, `/api/v2/shipment-groups/${group.body.id}`, {
      headers: { Authorization: `Bearer ${tokenInternal}` },
    });
    assert.equal(reload.body.destinationPortCode, 'ROTTERDAM');
    assert.equal(reload.body.status, 'LOCKED');
  });

  it('13 mixed destinations → separate SGs', async () => {
    const created = await createInquiryWithLine(`DFB 13 ${suffix}`);
    await saveInquiryDelivery(created.inquiryId, 'ROTTERDAM', 'CIF', 'NETHERLANDS / CIF / ROTTERDAM');
    const line2 = await json(base, `/api/v2/inquiries/${created.inquiryId}/lines`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${tokenA}` },
      body: JSON.stringify({ cableDescription: 'line 2' }),
    });
    const mixed = await json(base, `/api/v2/inquiries/${created.inquiryId}/shipment-groups`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${tokenInternal}` },
      body: JSON.stringify({
        groupCode: `SG-13-MIX-${suffix}`,
        deliveryAllocationMode: 'DESTINATION_CLUSTER',
        inquiryLineIds: [created.lineId, line2.body.line.id],
        memberIdentities: [
          { inquiryLineId: created.lineId, destinationPortCode: 'ROTTERDAM' },
          { inquiryLineId: line2.body.line.id, destinationPortCode: 'DONCASTER' },
        ],
      }),
    });
    assert.equal(mixed.status, 400);
    const g1 = await json(base, `/api/v2/inquiries/${created.inquiryId}/shipment-groups`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${tokenInternal}` },
      body: JSON.stringify({
        groupCode: `SG-13-A-${suffix}`,
        deliveryAllocationMode: 'PER_INQUIRY_LINE',
        inquiryLineId: created.lineId,
      }),
    });
    const g2 = await json(base, `/api/v2/inquiries/${created.inquiryId}/shipment-groups`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${tokenInternal}` },
      body: JSON.stringify({
        groupCode: `SG-13-B-${suffix}`,
        deliveryAllocationMode: 'PER_INQUIRY_LINE',
        inquiryLineId: line2.body.line.id,
      }),
    });
    assert.equal(g1.status, 201, g1.body.error);
    assert.equal(g2.status, 201, g2.body.error);
    assert.notEqual(g1.body.id, g2.body.id);
  });

  it('14 ENTIRE_INQUIRY', async () => {
    const created = await createInquiryWithLine(`DFB 14 ${suffix}`);
    await saveInquiryDelivery(created.inquiryId, 'ROTTERDAM', 'CIF', 'NETHERLANDS / CIF / ROTTERDAM');
    const line2 = await json(base, `/api/v2/inquiries/${created.inquiryId}/lines`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${tokenA}` },
      body: JSON.stringify({ cableDescription: 'line 2' }),
    });
    const group = await json(base, `/api/v2/inquiries/${created.inquiryId}/shipment-groups`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${tokenInternal}` },
      body: JSON.stringify({ groupCode: `SG-14-${suffix}`, deliveryAllocationMode: 'ENTIRE_INQUIRY' }),
    });
    assert.equal(group.status, 201, group.body.error);
    assert.equal(group.body.deliveryAllocationMode, 'ENTIRE_INQUIRY');
    const memberIds = (group.body.memberLines as Array<{ inquiryLineId: string }>).map((m) => m.inquiryLineId);
    assert.ok(memberIds.includes(created.lineId));
    assert.ok(memberIds.includes(line2.body.line.id));
    assert.equal(group.body.inquiryLineId, null);
  });

  it('15 PER_INQUIRY_LINE', async () => {
    const created = await createInquiryWithLine(`DFB 15 ${suffix}`);
    await saveInquiryDelivery(created.inquiryId, 'ROTTERDAM', 'CIF', 'NETHERLANDS / CIF / ROTTERDAM');
    const line2 = await json(base, `/api/v2/inquiries/${created.inquiryId}/lines`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${tokenA}` },
      body: JSON.stringify({ cableDescription: 'line 2' }),
    });
    const group = await json(base, `/api/v2/inquiries/${created.inquiryId}/shipment-groups`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${tokenInternal}` },
      body: JSON.stringify({
        groupCode: `SG-15-${suffix}`,
        deliveryAllocationMode: 'PER_INQUIRY_LINE',
        inquiryLineId: created.lineId,
      }),
    });
    assert.equal(group.status, 201, group.body.error);
    assert.equal(group.body.deliveryAllocationMode, 'PER_INQUIRY_LINE');
    assert.equal(group.body.inquiryLineId, created.lineId);
    assert.equal(group.body.memberLines.length, 1);
    assert.equal(group.body.memberLines[0].inquiryLineId, created.lineId);
    assert.notEqual(group.body.inquiryLineId, line2.body.line.id);
  });

  it('16 auth: customer cannot authoritative SG lifecycle', async () => {
    const created = await createInquiryWithLine(`DFB 16 ${suffix}`);
    await saveInquiryDelivery(created.inquiryId, 'ROTTERDAM', 'CIF', 'NETHERLANDS / CIF / ROTTERDAM');
    const createDenied = await json(base, `/api/v2/inquiries/${created.inquiryId}/shipment-groups`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${tokenA}` },
      body: JSON.stringify({ groupCode: `SG-16-${suffix}` }),
    });
    assert.ok(createDenied.status === 401 || createDenied.status === 403);
    const group = await json(base, `/api/v2/inquiries/${created.inquiryId}/shipment-groups`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${tokenInternal}` },
      body: JSON.stringify({ groupCode: `SG-16-${suffix}` }),
    });
    const confirmDenied = await json(base, `/api/v2/shipment-groups/${group.body.id}/confirm`, {
      method: 'POST',
      headers: { Authorization: `Bearer ${tokenA}` },
    });
    assert.ok(confirmDenied.status === 401 || confirmDenied.status === 403);
  });

  it('17 audit events', async () => {
    const created = await createInquiryWithLine(`DFB 17 ${suffix}`);
    await saveInquiryDelivery(created.inquiryId, 'ROTTERDAM', 'CIF', 'NETHERLANDS / CIF / ROTTERDAM');
    const drum = await confirmDrumForLine(created.inquiryId, created.lineId, created.inquiryNumber, created.lineNumber);
    const { group, study } = await createGroupAndStudy(created.inquiryId, created.lineId, `SG-17-${suffix}`, 'PER_INQUIRY_LINE');
    await json(base, `/api/v2/shipment-groups/${group.body.id}/confirm`, {
      method: 'POST',
      headers: { Authorization: `Bearer ${tokenInternal}` },
    });
    await json(base, `/api/v2/container-studies/${study.body.id}/input-snapshot`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${tokenInternal}` },
      body: JSON.stringify({
        inquiryLineId: created.lineId,
        drumPlanId: drum.planId,
        configurationId: 'CFG-LEGACY-FIRST-FIT-V1',
      }),
    });
    await json(base, `/api/v2/shipment-groups/${group.body.id}`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${tokenInternal}` },
      body: JSON.stringify({ notes: 'nope' }),
    });
    const prisma = getPrisma()!;
    const createdAudit = await prisma.auditEvent.findMany({
      where: { entityId: group.body.id, action: 'SHIPMENT_GROUP_CREATED' },
    });
    const confirmedAudit = await prisma.auditEvent.findMany({
      where: { entityId: group.body.id, action: 'SHIPMENT_GROUP_CONFIRMED' },
    });
    const snapshotAudit = await prisma.auditEvent.findMany({
      where: { entityId: study.body.id, action: 'CONTAINER_STUDY_INPUT_SNAPSHOT_CREATED' },
    });
    const rejectedAudit = await prisma.auditEvent.findMany({
      where: { entityId: group.body.id, action: 'SHIPMENT_GROUP_MUTATION_REJECTED' },
    });
    assert.ok(createdAudit.length >= 1);
    assert.ok(confirmedAudit.length >= 1);
    assert.ok(snapshotAudit.length >= 1);
    assert.ok(rejectedAudit.length >= 1);
  });

  it('18 regression INQ26-06065: saved ROTTERDAM/CIF; SG reads ROTTERDAM not Alexandria', async () => {
    const prisma = getPrisma()!;
    const live = await prisma.commercialInquiry.findFirst({
      where: { inquiryNumber: 'INQ26-06065' },
      select: { id: true, incoterms: true, commercialMetadata: true, inquiryNumber: true },
    });
    let inquiryId = '';
    if (live) {
      const clone = await createInquiryWithLine(`DFB 18 clone ${suffix}`);
      inquiryId = clone.inquiryId;
      // Fixture must pin ROTTERDAM/CIF for this regression — do not inherit a drifted live destination.
      await prisma.commercialInquiry.update({
        where: { id: inquiryId },
        data: {
          incoterms: 'CIF',
          commercialMetadata: {
            destinationPortCode: 'ROTTERDAM',
            incoterms: 'CIF',
            deliveryDestination: 'NETHERLANDS / CIF / ROTTERDAM',
          },
        },
      });
    } else {
      const created = await createInquiryWithLine(`DFB 18 ${suffix}`);
      inquiryId = created.inquiryId;
      await saveInquiryDelivery(inquiryId, 'ROTTERDAM', 'CIF', 'NETHERLANDS / CIF / ROTTERDAM');
    }
    const group = await json(base, `/api/v2/inquiries/${inquiryId}/shipment-groups`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${tokenInternal}` },
      body: JSON.stringify({
        groupCode: `SG-18-${suffix}`,
        destinationPortCode: 'ALEXANDRIA',
        destinationKey: 'Alexandria',
        incotermCode: 'FOB',
      }),
    });
    assert.equal(group.status, 201, group.body.error || JSON.stringify(group.body));
    assert.equal(group.body.destinationPortCode, 'ROTTERDAM');
    assert.notEqual(String(group.body.destinationPortCode).toUpperCase(), 'ALEXANDRIA');
    assert.equal(group.body.incotermCode, 'CIF');
    if (live) {
      const unchanged = await prisma.commercialInquiry.findUniqueOrThrow({
        where: { id: live.id },
        select: { inquiryNumber: true },
      });
      assert.equal(unchanged.inquiryNumber, 'INQ26-06065');
    }
  });
});
