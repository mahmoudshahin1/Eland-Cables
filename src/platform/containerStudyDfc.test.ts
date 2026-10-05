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
import { seedDevelopmentUsers } from '../server/identityService';
import { hashPassword } from '../domain/passwordService';
import { SYSTEM_ADMIN_ROLE_CODE } from '../domain/permissionCatalog';
import { createContainerTypeVersion } from '../server/containerMasterRepository';
import { activateAlgorithmConfiguration } from '../server/algorithmConfigurationRepository';
import { deleteV2LineageForInquiries } from './containerStudyTestCleanup';
import { dateOnlyToUtc } from '../domain/shippingCostCanonical';
import {
  SHIPPING_COST_APPLIED,
  SHIPPING_COST_NOT_CONFIGURED,
  mapContainerTypeToCanonicalShippingType,
} from '../domain/customerShippingCost';

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

describe('Task 05I-DF-C — bind Container Study calculation + shipping to immutable snapshot', () => {
  let base = '';
  let server: http.Server;
  let tokenInternal = '';
  let tokenA = '';
  let tokenB = '';
  let custAId = '';
  let cifId = '';
  let actorInternal: { id: string; email: string; name: string; userType: 'internal' };
  const suffix = `dfc-${Date.now()}`;
  const drumCode = `EWD-DFC-${suffix}`;
  const inquiryIds: string[] = [];
  const rateIds: string[] = [];
  const b4bRateIds: string[] = [];

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
        cableMaterialNumber: 'TEST-MAT-DFC',
        itemCode: 'TEST-ITEM-DFC',
        customerCode: 'TEST-CUST-DFC',
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
    return {
      planId,
      drumPlanDbId: (confirmed.body.drumPlan.id || drum.body.drumPlan.id) as string,
      versionNo: confirmed.body.drumPlan.versionNo as number,
    };
  }

  async function captureSnapshot(input: {
    inquiryId: string;
    lineId: string;
    groupCode: string;
    drumPlanId: string;
    dest?: string;
    incoterm?: string;
  }) {
    const dest = input.dest ?? 'ROTTERDAM';
    const incoterm = input.incoterm ?? 'CIF';
    await saveInquiryDelivery(input.inquiryId, dest, incoterm, `SAVED ${dest} ${incoterm}`);
    const groupRes = await json(base, `/api/v2/inquiries/${input.inquiryId}/shipment-groups`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${tokenInternal}` },
      body: JSON.stringify({
        groupCode: input.groupCode,
        deliveryAllocationMode: 'PER_INQUIRY_LINE',
        inquiryLineId: input.lineId,
        destinationPortCode: dest,
        incotermCode: incoterm,
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
    await prisma.destinationPort.upsert({
      where: { code: 'ALEXANDRIA' },
      create: { code: 'ALEXANDRIA', name: 'Alexandria', countryCode: 'EG', active: true },
      update: { active: true },
    });
    const cif = await prisma.incoterm.upsert({
      where: { code: 'CIF' },
      create: { code: 'CIF', name: 'CIF', active: true },
      update: { active: true },
    });
    cifId = cif.id;
    const adminRole = await prisma.role.findFirst({ where: { code: SYSTEM_ADMIN_ROLE_CODE } });
    const customerRole = await prisma.role.findFirst({ where: { code: 'CUSTOMER_USER' } });
    assert.ok(adminRole && customerRole);
    const custA = await prisma.customer.create({ data: { code: `DFC-A-${suffix}`, name: 'DFC A' } });
    const custB = await prisma.customer.create({ data: { code: `DFC-B-${suffix}`, name: 'DFC B' } });
    custAId = custA.id;
    const internal = await prisma.userAccount.create({
      data: {
        username: `dfc-int-${suffix}`,
        email: `dfc-int-${suffix}@test.local`,
        fullName: 'DFC Internal',
        userType: 'internal',
        passwordHash: await hashPassword('DfcTest@2026!'),
        status: 'ACTIVE',
      },
    });
    const userA = await prisma.userAccount.create({
      data: {
        username: `dfc-a-${suffix}`,
        email: `dfc-a-${suffix}@test.local`,
        fullName: 'DFC A',
        userType: 'customer',
        passwordHash: await hashPassword('DfcTest@2026!'),
        status: 'ACTIVE',
      },
    });
    const userB = await prisma.userAccount.create({
      data: {
        username: `dfc-b-${suffix}`,
        email: `dfc-b-${suffix}@test.local`,
        fullName: 'DFC B',
        userType: 'customer',
        passwordHash: await hashPassword('DfcTest@2026!'),
        status: 'ACTIVE',
      },
    });
    await prisma.customerUser.create({ data: { customerId: custA.id, userAccountId: userA.id, status: 'ACTIVE' } });
    await prisma.customerUser.create({ data: { customerId: custB.id, userAccountId: userB.id, status: 'ACTIVE' } });
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
      body: JSON.stringify({ email: internal.email, password: 'DfcTest@2026!' }),
    });
    const loginA = await json(base, '/api/auth/login', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ email: userA.email, password: 'DfcTest@2026!' }),
    });
    const loginB = await json(base, '/api/auth/login', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ email: userB.email, password: 'DfcTest@2026!' }),
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
    const rate = await prisma.customerShippingCostRate.create({
      data: {
        customerId: custAId,
        deliveryPoint: 'Rotterdam',
        incotermId: cifId,
        containerType: "40' SD/HC",
        amount: new Prisma.Decimal('2000.00'),
        currency: 'USD',
        effectiveFrom: dateOnlyToUtc('2026-01-01'),
        status: 'ACTIVE',
        version: 1,
      },
    });
    rateIds.push(rate.id);
    const rate20 = await prisma.customerShippingCostRate.create({
      data: {
        customerId: custAId,
        deliveryPoint: 'Rotterdam',
        incotermId: cifId,
        containerType: "20' SD",
        amount: new Prisma.Decimal('1800.00'),
        currency: 'USD',
        effectiveFrom: dateOnlyToUtc('2026-01-01'),
        status: 'ACTIVE',
        version: 1,
      },
    });
    rateIds.push(rate20.id);
  });

  after(async () => {
    const prisma = getPrisma();
    if (prisma) {
      await prisma.shippingCostTransactionSnapshot.deleteMany({
        where: { OR: [{ customerId: custAId }, { shippingCostRateId: { in: rateIds } }] },
      });
      await prisma.shipmentCostSnapshot.deleteMany({ where: { inquiryId: { in: inquiryIds } } });
      if (b4bRateIds.length) await prisma.shippingCostRate.deleteMany({ where: { id: { in: b4bRateIds } } });
      await deleteV2LineageForInquiries(prisma, inquiryIds);
      await prisma.commercialInquiryLine.deleteMany({ where: { inquiryId: { in: inquiryIds } } });
      await prisma.commercialInquiry.deleteMany({ where: { id: { in: inquiryIds } } });
      if (rateIds.length) await prisma.customerShippingCostRate.deleteMany({ where: { id: { in: rateIds } } });
    }
    await new Promise<void>((resolve, reject) => server.close((err) => (err ? reject(err) : resolve())));
  });

  it('calculation uses the immutable snapshot only after live dest, drums, packing, default, and preference change', async () => {
    const prisma = getPrisma()!;
    const created = await createInquiryWithLine(`DFC bind ${suffix}`);
    const drum = await confirmDrumForLine(created.inquiryId, created.lineId, created.inquiryNumber, created.lineNumber);
    const { group, study, snap } = await captureSnapshot({
      inquiryId: created.inquiryId,
      lineId: created.lineId,
      groupCode: `SG-DFC-${suffix}`,
      drumPlanId: drum.planId,
    });
    const lineage = snap.body.lineageProvenanceJson as { destinationPortCode?: string; incotermCode?: string };
    assert.equal(lineage.destinationPortCode, 'ROTTERDAM');
    assert.equal(lineage.incotermCode, 'CIF');
    const snapshotPacked = Number(snap.body.drums?.[0]?.packedLengthMm);
    assert.ok(snapshotPacked > 0);

    const first = await json(base, `/api/v2/inquiries/${created.inquiryId}/container-study-workspace/calculate`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${tokenInternal}` },
      body: JSON.stringify({ region: 'Europe' }),
    });
    assert.equal(first.status, 200, JSON.stringify(first.body));
    assert.equal(first.body.calculation?.ok, true);
    const firstResultId = first.body.study.currentResultId as string;
    const firstOptions = first.body.options as Array<{ typeCode: string; requiredContainersLabel: string }>;
    const usedOption = firstOptions.find((row) => row.requiredContainersLabel !== '—' && row.requiredContainersLabel !== '0');
    assert.ok(usedOption, 'Expected a result container type');
    const resultType = usedOption.typeCode;
    const canonical = mapContainerTypeToCanonicalShippingType(resultType);
    const resultQty = Number(usedOption.requiredContainersLabel);
    assert.equal(first.body.shippingCostFinancial.deliveryPoint, 'Rotterdam');
    assert.equal(first.body.shippingCostFinancial.incotermCode, 'CIF');
    assert.equal(first.body.shippingCostFinancial.containerType, canonical);
    assert.equal(first.body.shippingCostFinancial.resolutionCode, SHIPPING_COST_APPLIED);
    assert.ok(first.body.shippingCostFinancial.amount > 0);
    assert.notEqual(first.body.shippingCostFinancial.amount, 0);

    const b4b = await prisma.shippingCostRate.create({
      data: {
        destinationPortCode: 'ROTTERDAM',
        incotermCode: 'CIF',
        containerTypeCode: resultType,
        rateAmount: new Prisma.Decimal('999.00'),
        currencyCode: 'USD',
        effectiveFrom: dateOnlyToUtc('2026-01-01'),
        active: true,
      },
    });
    b4bRateIds.push(b4b.id);
    const b4c = await prisma.shipmentCostSnapshot.create({
      data: {
        inquiryId: created.inquiryId,
        shipmentGroupId: group.body.id,
        containerStudyId: study.body.id,
        containerStudyResultId: firstResultId,
        destinationPortCode: 'ROTTERDAM',
        incotermCode: 'CIF',
        rateAsOfDate: dateOnlyToUtc('2026-01-01'),
        totalAmount: new Prisma.Decimal('999.00'),
        currencyCode: 'USD',
        lines: {
          create: {
            containerTypeCode: resultType,
            containerQuantity: resultQty || 1,
            shippingCostRateId: b4b.id,
            rateAmount: new Prisma.Decimal('999.00'),
            currencyCode: 'USD',
            effectiveFrom: dateOnlyToUtc('2026-01-01'),
            lineTotal: new Prisma.Decimal('999.00'),
          },
        },
      },
    });

    await saveInquiryDelivery(created.inquiryId, 'ALEXANDRIA', 'FOB', 'Alexandria metadata override');
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
    await prisma.containerShipmentGroup.update({
      where: { id: group.body.id },
      data: { containerTypePreferenceCode: '20STD' },
    });
    await prisma.v2DrumPlanLine.updateMany({
      where: { drumPlanId: drum.drumPlanDbId },
      data: { numberOfDrums: 9 },
    });
    await prisma.drumPackingProfileVersion.updateMany({
      where: { profile: { drumCode }, isCurrent: true },
      data: { packedLengthMm: 9000 },
    });

    const second = await json(base, `/api/v2/inquiries/${created.inquiryId}/container-study-workspace/calculate`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${tokenInternal}` },
      body: JSON.stringify({ region: 'Europe' }),
    });
    assert.equal(second.status, 200, JSON.stringify(second.body));
    assert.equal(second.body.calculation?.ok, true);
    const secondResultId = second.body.study.currentResultId as string;
    assert.notEqual(secondResultId, firstResultId);
    const still = await prisma.containerStudyInputDrum.findMany({
      where: { snapshotId: snap.body.id },
    });
    assert.equal(Number(still[0].packedLengthMm), snapshotPacked);
    assert.notEqual(Number(still[0].quantity), 9);
    assert.equal(second.body.shippingCostFinancial.deliveryPoint, 'Rotterdam');
    assert.notEqual(second.body.shippingCostFinancial.deliveryPoint, 'Alexandria');
    assert.equal(second.body.shippingCostFinancial.incotermCode, 'CIF');
    assert.equal(second.body.shippingCostFinancial.containerType, canonical);
    assert.notEqual(second.body.shippingCostFinancial.containerType, mapContainerTypeToCanonicalShippingType('20STD'));
    const secondOption = (second.body.options as Array<{ typeCode: string; requiredContainersLabel: string }>).find(
      (row) => row.typeCode === resultType
    );
    assert.equal(secondOption?.requiredContainersLabel, usedOption.requiredContainersLabel);

    const historical = await prisma.containerStudyResult.findUniqueOrThrow({
      where: { id: firstResultId },
      include: { containers: true },
    });
    assert.equal(historical.id, firstResultId);
    assert.equal(historical.containers.length, resultQty || historical.containers.length);
    const b4cAfter = await prisma.shipmentCostSnapshot.findUniqueOrThrow({ where: { id: b4c.id } });
    assert.equal(b4cAfter.containerStudyResultId, firstResultId);
    assert.equal(Number(b4cAfter.totalAmount), 999);
    const txn = await prisma.shippingCostTransactionSnapshot.findUnique({
      where: { containerStudyResultId: secondResultId },
    });
    assert.ok(txn);
    assert.notEqual(txn.id, b4c.id);
  });

  it('missing shipping grain stays SHIPPING_COST_NOT_CONFIGURED with amount 0 and does not block packing', async () => {
    const created = await createInquiryWithLine(`DFC missing ${suffix}`);
    const drum = await confirmDrumForLine(created.inquiryId, created.lineId, created.inquiryNumber, created.lineNumber);
    await captureSnapshot({
      inquiryId: created.inquiryId,
      lineId: created.lineId,
      groupCode: `SG-DFC-MISS-${suffix}`,
      drumPlanId: drum.planId,
      dest: 'DONCASTER',
      incoterm: 'CIF',
    });
    const calc = await json(base, `/api/v2/inquiries/${created.inquiryId}/container-study-workspace/calculate`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${tokenInternal}` },
      body: JSON.stringify({ region: 'Europe' }),
    });
    assert.equal(calc.status, 200, JSON.stringify(calc.body));
    assert.equal(calc.body.shippingCostFinancial.resolutionCode, SHIPPING_COST_NOT_CONFIGURED);
    assert.equal(calc.body.shippingCostFinancial.amount, 0);
  });

  it('customer isolation is unchanged for calculate', async () => {
    const created = await createInquiryWithLine(`DFC iso ${suffix}`);
    await confirmDrumForLine(created.inquiryId, created.lineId, created.inquiryNumber, created.lineNumber);
    const denied = await json(base, `/api/v2/inquiries/${created.inquiryId}/container-study-workspace/calculate`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${tokenB}` },
      body: JSON.stringify({ region: 'Europe' }),
    });
    assert.ok(denied.status === 401 || denied.status === 403 || denied.status === 404);
  });
});
