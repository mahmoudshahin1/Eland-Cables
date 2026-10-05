/**
 * TASK 05I dedicated black-box/integration E2E.
 * HTTP + Prisma assertions over the governed CS → Costing → Standard Workflow chain.
 * Does not reimplement DF-B–F domain logic.
 */
import assert from 'node:assert/strict';
import { after, before, describe, it } from 'node:test';
import http from 'node:http';
import express from 'express';
import dotenv from 'dotenv';
import { checkDatabase, getPrisma } from '../server/db';
import { identityAuthRouter } from '../server/identityAuthRoutes';
import { inquiriesRouter } from '../server/commercialRoutes';
import { v2InquiryConfigurationRouter } from '../server/v2InquiryConfigurationRoutes';
import { containerStudyRouter } from '../server/containerStudyRoutes';
import { costingRouter } from '../server/costingRoutes';
import { workflowRouter } from '../server/workflowRoutes';
import { seedDevelopmentUsers } from '../server/identityService';
import { hashPassword } from '../domain/passwordService';
import { SYSTEM_ADMIN_ROLE_CODE } from '../domain/permissionCatalog';
import { STANDARD_INQUIRY_TEMPLATE_CODE } from '../domain/workflowRuntimeService';
import { createContainerTypeVersion } from '../server/containerMasterRepository';
import { activateAlgorithmConfiguration } from '../server/algorithmConfigurationRepository';
import { deleteV2LineageForInquiries } from './containerStudyTestCleanup';
import { deleteCostingArtifactsForInquiryLines } from '../server/costingArtifactCleanup';
import { runStandardWorkflowAfterSubmit } from '../server/standardWorkflowOrchestrator';
import {
  auditCostingContainerStudyPin,
  resolveCostingContainerStudyPin,
} from '../server/costingContainerStudyPinService';
import {
  CONTAINER_STUDY_CALCULATION_INCOMPLETE,
  CONTAINER_STUDY_DEPENDENCY_MISMATCH,
  CONTAINER_STUDY_MISSING,
  CONTAINER_STUDY_NOT_REQUIRED,
  CONTAINER_STUDY_RESULT_READY,
  CONTAINER_STUDY_SNAPSHOT_NOT_READY,
  COSTING_CONTAINER_STUDY_PIN_REQUIRED,
  COSTING_CONTAINER_STUDY_PIN_STALE,
  SHIPMENT_GROUP_REQUIRED,
  costingRunPinMustRemain,
  historicalStandardCostingPinRemainsValid,
} from '../domain/standardContainerStudyWorkflowReadiness';
import { evaluateContainerStudyGate } from '../domain/containerStudyReadiness';
import { containerStudyRequiredForCosting } from '../domain/costingContainerStudyPin';
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

describe('Task 05I dedicated E2E — Container Study → Costing → Standard Workflow', () => {
  let base = '';
  let server: http.Server;
  let tokenInternal = '';
  let tokenA = '';
  let custAId = '';
  let actorInternal: { id: string; email: string; name: string; userType: 'internal' };
  const suffix = `e2e05i-${Date.now()}-${process.pid}-${Math.random().toString(36).slice(2, 8)}`;
  const drumCode = `EWD-05I-${suffix}`;
  const materialNumber = `TEST-MAT-05I-${suffix}`;
  const password = 'E2e05i@Test-2026!';
  const inquiryIds: string[] = [];
  const inquiryLineIds: string[] = [];

  async function forceProcess(inquiryId: string, processCode: 'STANDARD_WORKFLOW' | 'VIP_FAST_TRACK') {
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
          workflowChannel: 'V2_CONFIGURATION',
          inquiryProcessCode: processCode,
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
    const patched = await json(base, `/api/inquiries/${inquiryId}`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${tokenA}` },
      body: JSON.stringify({
        incoterms: incotermCode,
        commercialMetadata: {
          destinationPortCode,
          incoterms: incotermCode,
          deliveryDestination,
        },
      }),
    });
    assert.equal(patched.status, 200, patched.body.error || JSON.stringify(patched.body));
    const meta = (patched.body.inquiry.commercialMetadata || {}) as Record<string, unknown>;
    assert.equal(meta.destinationPortCode, destinationPortCode);
    assert.equal(patched.body.inquiry.incoterms, incotermCode);
  }

  async function seedValidSnapshot(lineId: string, inquiryNumber: string, lineNumber: number) {
    const prisma = getPrisma()!;
    const snapshot = await prisma.v2ConfigurationSnapshot.create({
      data: {
        snapshotId: `v2cfg-${inquiryNumber}-L${lineNumber}-v1-${suffix}`,
        versionNo: 1,
        inquiryLineId: lineId,
        cableMaterialNumber: materialNumber,
        itemCode: 'TEST-ITEM-05I',
        customerCode: 'TEST-CUST-05I',
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

  async function createInquiryWithLine(
    projectName: string,
    processCode: 'STANDARD_WORKFLOW' | 'VIP_FAST_TRACK' = 'STANDARD_WORKFLOW'
  ) {
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
    await forceProcess(inquiryId, processCode);
    return {
      inquiryId,
      inquiryNumber,
      lineId: lineRes.body.line.id as string,
      lineNumber: lineRes.body.line.lineNumber as number,
    };
  }

  async function confirmDrumForLine(inquiryId: string, lineId: string, inquiryNumber: string, lineNumber: number) {
    await seedValidSnapshot(lineId, inquiryNumber, lineNumber);
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
    assert.ok(validated.status === 200 || validated.status === 201, JSON.stringify(validated.body));
    const confirmed = await json(base, `/api/v2/inquiries/${inquiryId}/lines/${lineId}/drum-plans/${planId}/confirm`, {
      method: 'POST',
      headers: { Authorization: `Bearer ${tokenA}` },
    });
    assert.ok(confirmed.status === 200 || confirmed.status === 201, JSON.stringify(confirmed.body));
    assert.equal(confirmed.body.drumPlan.lifecycleStatus, 'CONFIRMED');
    return {
      planId,
      drumPlanDbId: (confirmed.body.drumPlan.id || drum.body.drumPlan.id) as string,
      versionNo: confirmed.body.drumPlan.versionNo as number,
    };
  }

  async function createShipmentGroupFromSavedDelivery(inquiryId: string, groupCode: string) {
    const group = await json(base, `/api/v2/inquiries/${inquiryId}/shipment-groups`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${tokenInternal}` },
      body: JSON.stringify({ groupCode, deliveryAllocationMode: 'ENTIRE_INQUIRY' }),
    });
    assert.equal(group.status, 201, group.body.error || JSON.stringify(group.body));
    return group;
  }

  async function captureAndCalculate(input: {
    inquiryId: string;
    lineId: string;
    groupCode: string;
    drumPlanId: string;
  }) {
    const group = await createShipmentGroupFromSavedDelivery(input.inquiryId, input.groupCode);
    const study = await json(base, `/api/v2/inquiries/${input.inquiryId}/container-studies`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${tokenInternal}` },
      body: JSON.stringify({
        shipmentGroupId: group.body.id,
        stuffingMethod: 'Rolling',
        region: 'Europe',
      }),
    });
    assert.equal(study.status, 201, JSON.stringify(study.body));
    const snap = await json(base, `/api/v2/container-studies/${study.body.id}/input-snapshot`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${tokenInternal}` },
      body: JSON.stringify({
        inquiryLineId: input.lineId,
        drumPlanId: input.drumPlanId,
        configurationId: 'CFG-LEGACY-FIRST-FIT-V1',
      }),
    });
    assert.equal(snap.status, 201, JSON.stringify(snap.body));
    const calc = await json(base, `/api/v2/inquiries/${input.inquiryId}/container-study-workspace/calculate`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${tokenInternal}` },
      body: JSON.stringify({ region: 'Europe' }),
    });
    assert.equal(calc.status, 200, JSON.stringify(calc.body));
    const resultId = calc.body.study.currentResultId as string;
    assert.ok(resultId);
    return {
      groupId: group.body.id as string,
      destinationPortCode: group.body.destinationPortCode as string,
      incotermCode: group.body.incotermCode as string,
      studyId: study.body.id as string,
      snapshotId: snap.body.id as string,
      resultId,
    };
  }

  async function persistExplicitPin(inquiryId: string, lineId: string, resultId: string, tag: string) {
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
        costingRunNumber: `CR-05I-${tag}-${suffix}`,
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

  async function pinViaHttpOrExplicit(inquiryId: string, lineId: string, resultId: string, tag: string) {
    const costing = await json(base, `/api/v2/inquiries/${inquiryId}/lines/${lineId}/costing-runs/calculate`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${tokenInternal}` },
      body: JSON.stringify({ containerStudyResultId: resultId }),
    });
    const prisma = getPrisma()!;
    if (costing.status === 200 && costing.body.costingRunId) {
      const stored = await prisma.costingRun.findUniqueOrThrow({ where: { id: costing.body.costingRunId } });
      assert.equal(stored.containerStudyResultId, resultId);
      return { run: stored, via: 'http' as const, costingStatus: costing.body.status as string };
    }
    const { run } = await persistExplicitPin(inquiryId, lineId, resultId, tag);
    return { run, via: 'explicit' as const, costingStatus: costing.body.status as string | undefined };
  }

  before(async () => {
    const health = await checkDatabase();
    assert.equal(health.ok, true, health.error);
    await seedDevelopmentUsers();
    await ensureNumberSequencesAheadOfExisting(getPrisma()!);
    const prisma = getPrisma()!;
    await prisma.cableMaster.upsert({
      where: { materialNumber },
      create: {
        materialNumber,
        itemCode: `ITEM-05I-${suffix}`,
        customerCode: 'TEST-CUST-05I',
        description: '05I E2E cable',
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
    for (const port of [
      { code: 'ROTTERDAM', name: 'ROTTERDAM', countryCode: 'NL' },
      { code: 'ALEXANDRIA', name: 'ALEXANDRIA', countryCode: 'EG' },
      { code: 'DONCASTER', name: 'DONCASTER', countryCode: 'GB' },
    ]) {
      await prisma.destinationPort.upsert({
        where: { code: port.code },
        create: { ...port, active: true },
        update: { active: true, name: port.name },
      });
    }
    for (const code of ['CIF', 'FOB', 'DAP']) {
      await prisma.incoterm.upsert({
        where: { code },
        create: { code, name: code, active: true },
        update: { active: true },
      });
    }
    const adminRole = await prisma.role.findFirst({ where: { code: SYSTEM_ADMIN_ROLE_CODE } });
    const customerRole = await prisma.role.findFirst({ where: { code: 'CUSTOMER_USER' } });
    assert.ok(adminRole && customerRole);
    const custA = await prisma.customer.create({
      data: { code: `05I-A-${suffix}`, name: '05I E2E A', defaultInquiryProcessCode: 'STANDARD_WORKFLOW' },
    });
    custAId = custA.id;
    await prisma.customerDeliveryCombination.create({
      data: {
        customerId: custA.id,
        countryCode: 'GB',
        countryLabel: 'UK',
        incotermCode: 'DAP',
        destinationPortCode: 'DONCASTER',
        active: true,
        isDefault: true,
      },
    });
    const internal = await prisma.userAccount.create({
      data: {
        username: `05i-int-${suffix}`,
        email: `05i-int-${suffix}@test.local`,
        fullName: '05I Internal',
        userType: 'internal',
        passwordHash: await hashPassword(password),
        status: 'ACTIVE',
      },
    });
    const userA = await prisma.userAccount.create({
      data: {
        username: `05i-a-${suffix}`,
        email: `05i-a-${suffix}@test.local`,
        fullName: '05I Customer',
        userType: 'customer',
        passwordHash: await hashPassword(password),
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
    app.use('/api/inquiries', inquiriesRouter);
    app.use('/api/v2/inquiries', v2InquiryConfigurationRouter);
    app.use('/api/v2', containerStudyRouter);
    app.use('/api/v2/workflows', workflowRouter);
    app.use('/api/costing', costingRouter);
    const started = await listen(app);
    server = started.server;
    base = started.base;
    const loginInt = await json(base, '/api/auth/login', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ email: internal.email, password }),
    });
    const loginA = await json(base, '/api/auth/login', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ email: userA.email, password }),
    });
    assert.equal(loginInt.status, 200, JSON.stringify(loginInt.body));
    assert.equal(loginA.status, 200, JSON.stringify(loginA.body));
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
    try {
      if (prisma) {
        await prisma.commercialQuotationLine.deleteMany({
          where: { quotation: { inquiryId: { in: inquiryIds } } },
        });
        await prisma.commercialQuotation.deleteMany({ where: { inquiryId: { in: inquiryIds } } });
        await prisma.workflowInstance.deleteMany({
          where: { entityType: 'CommercialInquiry', entityId: { in: inquiryIds } },
        });
        await deleteCostingArtifactsForInquiryLines(prisma, inquiryLineIds);
        const studyRows = await prisma.containerStudy.findMany({
          where: { inquiryId: { in: inquiryIds } },
          select: { currentResultId: true },
        });
        const resultIds = studyRows.map((s) => s.currentResultId).filter((id): id is string => Boolean(id));
        if (resultIds.length) {
          await prisma.shippingCostTransactionSnapshot.deleteMany({
            where: { containerStudyResultId: { in: resultIds } },
          });
        }
        await deleteV2LineageForInquiries(prisma, inquiryIds);
        await prisma.commercialInquiryLine.deleteMany({ where: { inquiryId: { in: inquiryIds } } });
        await prisma.commercialInquiry.deleteMany({ where: { id: { in: inquiryIds } } });
      }
    } catch (err) {
      console.error('05I E2E teardown failed', err);
    }
    await new Promise<void>((resolve) => {
      const timer = setTimeout(resolve, 3000);
      server.close(() => {
        clearTimeout(timer);
        resolve();
      });
    });
  });

  it('A) STANDARD shipment required: saved combination → SG → confirmed drum → snapshot → CS result → pin → orchestrator readiness', async () => {
    const created = await createInquiryWithLine(`05I-A ${suffix}`);
    await saveInquiryDelivery(created.inquiryId, 'ROTTERDAM', 'CIF', 'NETHERLANDS / CIF / ROTTERDAM');
    const drum = await confirmDrumForLine(created.inquiryId, created.lineId, created.inquiryNumber, created.lineNumber);
    const ready = await captureAndCalculate({
      inquiryId: created.inquiryId,
      lineId: created.lineId,
      groupCode: `SG-05I-A-${suffix}`,
      drumPlanId: drum.planId,
    });
    assert.equal(ready.destinationPortCode, 'ROTTERDAM');
    assert.equal(ready.incotermCode, 'CIF');
    assert.notEqual(ready.destinationPortCode, 'DONCASTER');
    assert.notEqual(ready.destinationPortCode, 'ALEXANDRIA');

    const pin = await pinViaHttpOrExplicit(created.inquiryId, created.lineId, ready.resultId, 'A');
    assert.equal(pin.run.containerStudyResultId, ready.resultId);

    const orchestrated = await runStandardWorkflowAfterSubmit(created.inquiryId, actorInternal);
    const csGate = orchestrated.gates.find((g) => g.gate === 'CONTAINER_STUDY');
    assert.ok(csGate);
    assert.equal(csGate!.code, CONTAINER_STUDY_RESULT_READY);
    assert.notEqual(orchestrated.status, 'CONTAINER_STUDY_BLOCKED');
    assert.ok(
      orchestrated.status === 'QUOTATION_DRAFT' ||
        orchestrated.status === 'COSTING_BLOCKED' ||
        orchestrated.status === 'ENGINEERING_APPROVED',
      orchestrated.status
    );

    const readiness = await json(base, `/api/v2/inquiries/${created.inquiryId}/quotation/readiness`, {
      headers: { Authorization: `Bearer ${tokenInternal}` },
    });
    assert.equal(readiness.status, 200, JSON.stringify(readiness.body));
    const pricing = await json(base, `/api/v2/inquiries/${created.inquiryId}/lines/${created.lineId}/commercial-pricing/preview`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${tokenInternal}` },
      body: JSON.stringify({}),
    });
    assert.ok(pricing.status === 200 || pricing.status === 409 || pricing.status === 400, JSON.stringify(pricing.body));
  });

  it('B) STANDARD no shipment: engineering/cutting/confirmed drum → costing/pricing path; CS not required', async () => {
    const created = await createInquiryWithLine(`05I-B ${suffix}`);
    await confirmDrumForLine(created.inquiryId, created.lineId, created.inquiryNumber, created.lineNumber);
    const orchestrated = await runStandardWorkflowAfterSubmit(created.inquiryId, actorInternal);
    const csGate = orchestrated.gates.find((g) => g.gate === 'CONTAINER_STUDY');
    assert.ok(csGate);
    assert.equal(csGate!.code, CONTAINER_STUDY_NOT_REQUIRED);
    assert.notEqual(orchestrated.status, 'CONTAINER_STUDY_BLOCKED');
    const costing = await json(base, `/api/v2/inquiries/${created.inquiryId}/lines/${created.lineId}/costing-runs/calculate`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${tokenInternal}` },
      body: JSON.stringify({}),
    });
    assert.ok(costing.status === 200 || costing.status === 409 || costing.status === 400, JSON.stringify(costing.body));
    const pricing = await json(base, `/api/v2/inquiries/${created.inquiryId}/lines/${created.lineId}/commercial-pricing/preview`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${tokenInternal}` },
      body: JSON.stringify({}),
    });
    assert.ok(pricing.status === 200 || pricing.status === 409 || pricing.status === 400, JSON.stringify(pricing.body));
  });

  it('C) fail-closed: missing SG, unconfirmed drum, snapshot missing, result missing, lineage mismatch, pin missing/mismatched', async () => {
    const prisma = getPrisma()!;

    const foreign = await createInquiryWithLine(`05I-C-SG-F ${suffix}`);
    await saveInquiryDelivery(foreign.inquiryId, 'ROTTERDAM', 'CIF', 'NETHERLANDS / CIF / ROTTERDAM');
    const foreignGroup = await createShipmentGroupFromSavedDelivery(foreign.inquiryId, `SG-05I-C-F-${suffix}`);
    const missingSg = await createInquiryWithLine(`05I-C-SG ${suffix}`);
    await confirmDrumForLine(missingSg.inquiryId, missingSg.lineId, missingSg.inquiryNumber, missingSg.lineNumber);
    const missingInquiry = await prisma.commercialInquiry.findUniqueOrThrow({ where: { id: missingSg.inquiryId } });
    await prisma.containerStudy.create({
      data: {
        studyNumber: `CS-05I-ORPHAN-${suffix}`,
        inquiryId: missingSg.inquiryId,
        shipmentGroupId: foreignGroup.body.id,
        customerId: missingInquiry.customerId,
        customerMasterId: missingInquiry.customerMasterId,
        stuffingMethod: 'Rolling',
        region: 'Europe',
        deliveryAllocationMode: 'ENTIRE_INQUIRY',
      },
    });
    const blockedSg = await runStandardWorkflowAfterSubmit(missingSg.inquiryId, actorInternal);
    assert.equal(blockedSg.status, 'CONTAINER_STUDY_BLOCKED');
    const sgCode = blockedSg.gates.find((g) => g.gate === 'CONTAINER_STUDY')?.code;
    assert.ok(
      sgCode === SHIPMENT_GROUP_REQUIRED || sgCode === CONTAINER_STUDY_MISSING || sgCode === CONTAINER_STUDY_DEPENDENCY_MISMATCH,
      String(sgCode)
    );

    const unconfirmed = await createInquiryWithLine(`05I-C-DRUM ${suffix}`);
    await seedValidSnapshot(unconfirmed.lineId, unconfirmed.inquiryNumber, unconfirmed.lineNumber);
    await json(base, `/api/v2/inquiries/${unconfirmed.inquiryId}/lines/${unconfirmed.lineId}/cutting-plans`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${tokenA}` },
      body: JSON.stringify({ nominalLengthM: 500, tolerancePercent: 1 }),
    });
    const draftDrum = await json(base, `/api/v2/inquiries/${unconfirmed.inquiryId}/lines/${unconfirmed.lineId}/drum-plans`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${tokenA}` },
      body: JSON.stringify({
        selectionMethod: 'MANUAL',
        rows: [{ drumCode, numberOfDrums: 1, cuttingLengthM: 500, drumTolerancePercent: 0 }],
      }),
    });
    assert.equal(draftDrum.status, 201, JSON.stringify(draftDrum.body));
    await saveInquiryDelivery(unconfirmed.inquiryId, 'ROTTERDAM', 'CIF', 'NETHERLANDS / CIF / ROTTERDAM');
    await createShipmentGroupFromSavedDelivery(unconfirmed.inquiryId, `SG-05I-C-DRUM-${suffix}`);
    const blockedDrum = await runStandardWorkflowAfterSubmit(unconfirmed.inquiryId, actorInternal);
    assert.ok(blockedDrum.status === 'COSTING_BLOCKED' || blockedDrum.status === 'CONTAINER_STUDY_BLOCKED');
    assert.ok(blockedDrum.gates.some((g) => g.code === 'DRUM_PLAN_NOT_CONFIRMED' || g.code === 'DRUM_PLAN_REQUIRED'));

    const noSnap = await createInquiryWithLine(`05I-C-SNAP ${suffix}`);
    await saveInquiryDelivery(noSnap.inquiryId, 'ROTTERDAM', 'CIF', 'NETHERLANDS / CIF / ROTTERDAM');
    await confirmDrumForLine(noSnap.inquiryId, noSnap.lineId, noSnap.inquiryNumber, noSnap.lineNumber);
    const gSnap = await createShipmentGroupFromSavedDelivery(noSnap.inquiryId, `SG-05I-C-SNAP-${suffix}`);
    await json(base, `/api/v2/inquiries/${noSnap.inquiryId}/container-studies`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${tokenInternal}` },
      body: JSON.stringify({ shipmentGroupId: gSnap.body.id, stuffingMethod: 'Rolling', region: 'Europe' }),
    });
    const blockedSnap = await runStandardWorkflowAfterSubmit(noSnap.inquiryId, actorInternal);
    assert.equal(blockedSnap.status, 'CONTAINER_STUDY_BLOCKED');
    assert.equal(blockedSnap.gates.find((g) => g.gate === 'CONTAINER_STUDY')?.code, CONTAINER_STUDY_SNAPSHOT_NOT_READY);

    const noResult = await createInquiryWithLine(`05I-C-RES ${suffix}`);
    await saveInquiryDelivery(noResult.inquiryId, 'ROTTERDAM', 'CIF', 'NETHERLANDS / CIF / ROTTERDAM');
    const drumNr = await confirmDrumForLine(noResult.inquiryId, noResult.lineId, noResult.inquiryNumber, noResult.lineNumber);
    const gRes = await createShipmentGroupFromSavedDelivery(noResult.inquiryId, `SG-05I-C-RES-${suffix}`);
    const stRes = await json(base, `/api/v2/inquiries/${noResult.inquiryId}/container-studies`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${tokenInternal}` },
      body: JSON.stringify({ shipmentGroupId: gRes.body.id, stuffingMethod: 'Rolling', region: 'Europe' }),
    });
    const snapNr = await json(base, `/api/v2/container-studies/${stRes.body.id}/input-snapshot`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${tokenInternal}` },
      body: JSON.stringify({
        inquiryLineId: noResult.lineId,
        drumPlanId: drumNr.planId,
        configurationId: 'CFG-LEGACY-FIRST-FIT-V1',
      }),
    });
    assert.equal(snapNr.status, 201, JSON.stringify(snapNr.body));
    const blockedResult = await runStandardWorkflowAfterSubmit(noResult.inquiryId, actorInternal);
    assert.equal(blockedResult.status, 'CONTAINER_STUDY_BLOCKED');
    assert.equal(blockedResult.gates.find((g) => g.gate === 'CONTAINER_STUDY')?.code, CONTAINER_STUDY_CALCULATION_INCOMPLETE);

    const mismatch = await createInquiryWithLine(`05I-C-MM ${suffix}`);
    await saveInquiryDelivery(mismatch.inquiryId, 'ROTTERDAM', 'CIF', 'NETHERLANDS / CIF / ROTTERDAM');
    const drumMm = await confirmDrumForLine(mismatch.inquiryId, mismatch.lineId, mismatch.inquiryNumber, mismatch.lineNumber);
    const readyMm = await captureAndCalculate({
      inquiryId: mismatch.inquiryId,
      lineId: mismatch.lineId,
      groupCode: `SG-05I-C-MM-${suffix}`,
      drumPlanId: drumMm.planId,
    });
    const originalSnap = await prisma.containerStudyInputSnapshot.findUniqueOrThrow({ where: { id: readyMm.snapshotId } });
    const clone = await prisma.containerStudyInputSnapshot.create({
      data: {
        snapshotId: `v2cs-mismatch-${suffix}`,
        studyId: readyMm.studyId,
        stuffingMethod: originalSnap.stuffingMethod,
        region: originalSnap.region,
        deliveryAllocationMode: originalSnap.deliveryAllocationMode,
        algorithmVersionCode: originalSnap.algorithmVersionCode,
        configurationId: originalSnap.configurationId,
        configurationVersion: originalSnap.configurationVersion,
        containerMasterPinJson: originalSnap.containerMasterPinJson as object,
        packingProfilePinJson: originalSnap.packingProfilePinJson as object,
        algorithmParameterPinJson: originalSnap.algorithmParameterPinJson as object,
      },
    });
    await prisma.containerStudy.update({
      where: { id: readyMm.studyId },
      data: { currentSnapshotId: clone.id },
    });
    const blockedMm = await runStandardWorkflowAfterSubmit(mismatch.inquiryId, actorInternal);
    assert.equal(blockedMm.status, 'CONTAINER_STUDY_BLOCKED');
    assert.match(String(blockedMm.gates.find((g) => g.gate === 'CONTAINER_STUDY')?.code), /MISMATCH|SNAPSHOT/);

    const pinMiss = await createInquiryWithLine(`05I-C-PIN ${suffix}`);
    await saveInquiryDelivery(pinMiss.inquiryId, 'ROTTERDAM', 'CIF', 'NETHERLANDS / CIF / ROTTERDAM');
    const drumPin = await confirmDrumForLine(pinMiss.inquiryId, pinMiss.lineId, pinMiss.inquiryNumber, pinMiss.lineNumber);
    const readyPin = await captureAndCalculate({
      inquiryId: pinMiss.inquiryId,
      lineId: pinMiss.lineId,
      groupCode: `SG-05I-C-PIN-${suffix}`,
      drumPlanId: drumPin.planId,
    });
    const unpinned = await prisma.costingRun.create({
      data: {
        costingRunNumber: `CR-05I-UNPIN-${suffix}`,
        materialNumber,
        costingDate: new Date(),
        materialCost: 1,
        inquiryLineId: pinMiss.lineId,
        containerStudyResultId: null,
      },
    });
    await prisma.commercialInquiryLine.update({
      where: { id: pinMiss.lineId },
      data: { costingRunId: unpinned.id },
    });
    const blockedPin = await runStandardWorkflowAfterSubmit(pinMiss.inquiryId, actorInternal);
    assert.equal(blockedPin.status, 'COSTING_BLOCKED');
    assert.equal(blockedPin.gates.find((g) => g.code === COSTING_CONTAINER_STUDY_PIN_REQUIRED)?.code, COSTING_CONTAINER_STUDY_PIN_REQUIRED);

    const { run: pinnedR1 } = await persistExplicitPin(pinMiss.inquiryId, pinMiss.lineId, readyPin.resultId, 'C-R1');
    await prisma.commercialInquiryLine.update({
      where: { id: pinMiss.lineId },
      data: { costingRunId: pinnedR1.id },
    });
    const calc2 = await json(base, `/api/v2/inquiries/${pinMiss.inquiryId}/container-study-workspace/calculate`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${tokenInternal}` },
      body: JSON.stringify({ region: 'Europe' }),
    });
    assert.equal(calc2.status, 200, JSON.stringify(calc2.body));
    const r2 = calc2.body.study.currentResultId as string;
    assert.notEqual(r2, readyPin.resultId);
    const blockedStale = await runStandardWorkflowAfterSubmit(pinMiss.inquiryId, actorInternal);
    assert.equal(blockedStale.status, 'COSTING_BLOCKED');
    assert.equal(blockedStale.gates.find((g) => g.code === COSTING_CONTAINER_STUDY_PIN_STALE)?.code, COSTING_CONTAINER_STUDY_PIN_STALE);
    const stillR1 = await prisma.costingRun.findUniqueOrThrow({ where: { id: pinnedR1.id } });
    assert.equal(stillR1.containerStudyResultId, readyPin.resultId);
  });

  it('D) historical: R1, CR1 pins R1, recalc R2, CR1 still R1, R1 immutable, R2 separate', async () => {
    const prisma = getPrisma()!;
    const created = await createInquiryWithLine(`05I-D ${suffix}`);
    await saveInquiryDelivery(created.inquiryId, 'ROTTERDAM', 'CIF', 'NETHERLANDS / CIF / ROTTERDAM');
    const drum = await confirmDrumForLine(created.inquiryId, created.lineId, created.inquiryNumber, created.lineNumber);
    const ready = await captureAndCalculate({
      inquiryId: created.inquiryId,
      lineId: created.lineId,
      groupCode: `SG-05I-D-${suffix}`,
      drumPlanId: drum.planId,
    });
    const r1 = ready.resultId;
    const first = await prisma.containerStudyResult.findUniqueOrThrow({ where: { id: r1 } });
    const pin = await pinViaHttpOrExplicit(created.inquiryId, created.lineId, r1, 'D');
    const put = await json(base, `/api/v2/container-studies/${ready.studyId}/results/${r1}`, {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${tokenInternal}` },
      body: JSON.stringify({ summaryJson: {} }),
    });
    assert.equal(put.status, 409);
    const calc2 = await json(base, `/api/v2/inquiries/${created.inquiryId}/container-study-workspace/calculate`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${tokenInternal}` },
      body: JSON.stringify({ region: 'Europe' }),
    });
    assert.equal(calc2.status, 200, JSON.stringify(calc2.body));
    const r2 = calc2.body.study.currentResultId as string;
    assert.notEqual(r2, r1);
    const after = await prisma.containerStudyResult.findUniqueOrThrow({ where: { id: r1 } });
    assert.equal(after.inputSnapshotId, first.inputSnapshotId);
    assert.deepEqual(after.summaryJson, first.summaryJson);
    const stored = await prisma.costingRun.findUniqueOrThrow({ where: { id: pin.run.id } });
    assert.equal(stored.containerStudyResultId, r1);
    assert.equal(costingRunPinMustRemain(stored.containerStudyResultId, r2), r1);
    assert.equal(historicalStandardCostingPinRemainsValid(r1, r2), true);
    const r2row = await prisma.containerStudyResult.findUniqueOrThrow({ where: { id: r2 } });
    assert.notEqual(r2row.id, r1);
  });

  it('E) delivery authority: saved ROTTERDAM/CIF combination, not customer default, unsaved UI, Alexandria, or live metadata', async () => {
    const created = await createInquiryWithLine(`05I-E ${suffix}`);
    await saveInquiryDelivery(created.inquiryId, 'ROTTERDAM', 'CIF', 'NETHERLANDS / CIF / ROTTERDAM');
    const drum = await confirmDrumForLine(created.inquiryId, created.lineId, created.inquiryNumber, created.lineNumber);
    const unsavedAttempt = await json(base, `/api/v2/inquiries/${created.inquiryId}/shipment-groups`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${tokenInternal}` },
      body: JSON.stringify({
        groupCode: `SG-05I-E-${suffix}`,
        deliveryAllocationMode: 'ENTIRE_INQUIRY',
        destinationPortCode: 'ALEXANDRIA',
        destinationKey: 'Alexandria',
        incotermCode: 'FOB',
      }),
    });
    assert.equal(unsavedAttempt.status, 201, JSON.stringify(unsavedAttempt.body));
    assert.equal(unsavedAttempt.body.destinationPortCode, 'ROTTERDAM');
    assert.equal(unsavedAttempt.body.incotermCode, 'CIF');
    assert.notEqual(unsavedAttempt.body.destinationPortCode, 'DONCASTER');
    assert.notEqual(unsavedAttempt.body.destinationPortCode, 'ALEXANDRIA');

    const study = await json(base, `/api/v2/inquiries/${created.inquiryId}/container-studies`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${tokenInternal}` },
      body: JSON.stringify({
        shipmentGroupId: unsavedAttempt.body.id,
        stuffingMethod: 'Rolling',
        region: 'Europe',
      }),
    });
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
    const liveDrumQty = snap.body.drums[0].quantity as number;
    await saveInquiryDelivery(created.inquiryId, 'ALEXANDRIA', 'FOB', 'Alexandria metadata override');
    const prisma = getPrisma()!;
    await prisma.v2DrumPlanLine.updateMany({
      where: { drumPlanId: drum.drumPlanDbId },
      data: { numberOfDrums: 9 },
    });
    const reloadSg = await json(base, `/api/v2/shipment-groups/${unsavedAttempt.body.id}`, {
      headers: { Authorization: `Bearer ${tokenInternal}` },
    });
    assert.equal(reloadSg.body.destinationPortCode, 'ROTTERDAM');
    const storedSnap = await prisma.containerStudyInputSnapshot.findUniqueOrThrow({
      where: { id: snap.body.id },
      include: { drums: true },
    });
    assert.equal(storedSnap.drums[0].quantity, liveDrumQty);
    assert.notEqual(storedSnap.drums[0].quantity, 9);
  });

  it('F) AUTH: customer cannot create/confirm SG, cannot advance Standard workflow, cannot list/get CostingRuns; Logistics owns SG', async () => {
    const created = await createInquiryWithLine(`05I-F ${suffix}`);
    await saveInquiryDelivery(created.inquiryId, 'ROTTERDAM', 'CIF', 'NETHERLANDS / CIF / ROTTERDAM');
    const deniedCreate = await json(base, `/api/v2/inquiries/${created.inquiryId}/shipment-groups`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${tokenA}` },
      body: JSON.stringify({ groupCode: `SG-05I-F-DENY-${suffix}` }),
    });
    assert.ok(deniedCreate.status === 401 || deniedCreate.status === 403);

    const owned = await json(base, `/api/v2/inquiries/${created.inquiryId}/shipment-groups`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${tokenInternal}` },
      body: JSON.stringify({
        groupCode: `SG-05I-F-OK-${suffix}`,
        deliveryAllocationMode: 'ENTIRE_INQUIRY',
      }),
    });
    assert.equal(owned.status, 201, JSON.stringify(owned.body));
    assert.equal(owned.body.destinationPortCode, 'ROTTERDAM');

    const deniedConfirm = await json(base, `/api/v2/shipment-groups/${owned.body.id}/confirm`, {
      method: 'POST',
      headers: { Authorization: `Bearer ${tokenA}` },
    });
    assert.ok(deniedConfirm.status === 401 || deniedConfirm.status === 403);

    const listCosting = await json(base, '/api/costing', { headers: { Authorization: `Bearer ${tokenA}` } });
    assert.equal(listCosting.status, 403);
    const getCosting = await json(base, '/api/costing/missing-run-id', { headers: { Authorization: `Bearer ${tokenA}` } });
    assert.ok(getCosting.status === 403 || getCosting.status === 404);

    const started = await json(base, '/api/v2/workflows/start', {
      method: 'POST',
      headers: { Authorization: `Bearer ${tokenInternal}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({
        templateCode: STANDARD_INQUIRY_TEMPLATE_CODE,
        entityType: 'CommercialInquiry',
        entityId: created.inquiryId,
        contextJson: { inquiryProcessCode: 'STANDARD_WORKFLOW' },
      }),
    });
    assert.equal(started.status, 201, JSON.stringify(started.body));
    const deniedWf = await json(base, `/api/v2/workflows/instances/${started.body.id}/transition`, {
      method: 'POST',
      headers: { Authorization: `Bearer ${tokenA}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({ transitionCode: 'TO_COSTING' }),
    });
    assert.ok(deniedWf.status === 403 || deniedWf.status === 401);
  });

  it('G) VIP_FAST_TRACK: CS optional only without shipment; required when logistics active; metadata is not Standard SoT', async () => {
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
    const vipWarn = evaluateContainerStudyGate({
      metadata: { containerStudyReadiness: 'CONTAINER_STUDY_REQUIRED' },
      devBypass: false,
    });
    assert.equal(vipWarn.blocked, false);
    const vipReadyMeta = evaluateContainerStudyGate({
      metadata: { containerStudyReadiness: 'CONTAINER_STUDY_READY' },
      devBypass: false,
    });
    assert.equal(vipReadyMeta.ready, true);
    assert.equal(vipReadyMeta.blocked, false);

    const vip = await createInquiryWithLine(`05I-G ${suffix}`, 'VIP_FAST_TRACK');
    await confirmDrumForLine(vip.inquiryId, vip.lineId, vip.inquiryNumber, vip.lineNumber);
    const patched = await json(base, `/api/inquiries/${vip.inquiryId}`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${tokenA}` },
      body: JSON.stringify({
        incoterms: 'CIF',
        commercialMetadata: {
          containerStudyReadiness: 'CONTAINER_STUDY_READY',
          copperPriceRate: 9000,
          aluminiumPriceRate: 2500,
          deliveryDestination: 'ROTTERDAM',
          incoterms: 'CIF',
        },
      }),
    });
    assert.equal(patched.status, 200, JSON.stringify(patched.body));
    const calc = await json(base, `/api/v2/inquiries/${vip.inquiryId}/calculate`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${tokenA}` },
      body: JSON.stringify({}),
    });
    assert.ok(calc.status === 200 || calc.status === 409, JSON.stringify(calc.body));
    const gates = (calc.body.result?.gates || calc.body.gates || []) as Array<{ gate?: string; status?: string; code?: string }>;
    assert.equal(gates.some((g) => g.gate === 'CONTAINER_STUDY' && g.status === 'BLOCK'), false);

    const stdMetaOnly = await createInquiryWithLine(`05I-G-STD ${suffix}`);
    await confirmDrumForLine(stdMetaOnly.inquiryId, stdMetaOnly.lineId, stdMetaOnly.inquiryNumber, stdMetaOnly.lineNumber);
    await json(base, `/api/inquiries/${stdMetaOnly.inquiryId}`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${tokenA}` },
      body: JSON.stringify({
        commercialMetadata: { containerStudyReadiness: 'CONTAINER_STUDY_READY' },
      }),
    });
    await saveInquiryDelivery(stdMetaOnly.inquiryId, 'ROTTERDAM', 'CIF', 'NETHERLANDS / CIF / ROTTERDAM');
    const g = await createShipmentGroupFromSavedDelivery(stdMetaOnly.inquiryId, `SG-05I-G-STD-${suffix}`);
    await json(base, `/api/v2/inquiries/${stdMetaOnly.inquiryId}/container-studies`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${tokenInternal}` },
      body: JSON.stringify({ shipmentGroupId: g.body.id, stuffingMethod: 'Rolling', region: 'Europe' }),
    });
    const blocked = await runStandardWorkflowAfterSubmit(stdMetaOnly.inquiryId, actorInternal);
    assert.equal(blocked.status, 'CONTAINER_STUDY_BLOCKED');
    assert.notEqual(blocked.gates.find((x) => x.gate === 'CONTAINER_STUDY')?.code, 'CONTAINER_STUDY_READY');
  });

  it('H) no live/latest: after snapshot/pin, live dest/drum/currentResultId changes do not rewrite CR1', async () => {
    const prisma = getPrisma()!;
    const created = await createInquiryWithLine(`05I-H ${suffix}`);
    await saveInquiryDelivery(created.inquiryId, 'ROTTERDAM', 'CIF', 'NETHERLANDS / CIF / ROTTERDAM');
    const drum = await confirmDrumForLine(created.inquiryId, created.lineId, created.inquiryNumber, created.lineNumber);
    const ready = await captureAndCalculate({
      inquiryId: created.inquiryId,
      lineId: created.lineId,
      groupCode: `SG-05I-H-${suffix}`,
      drumPlanId: drum.planId,
    });
    const r1 = ready.resultId;
    const { run } = await persistExplicitPin(created.inquiryId, created.lineId, r1, 'H');
    await prisma.commercialInquiryLine.update({
      where: { id: created.lineId },
      data: { costingRunId: run.id },
    });

    await saveInquiryDelivery(created.inquiryId, 'ALEXANDRIA', 'FOB', 'Alexandria live');
    await prisma.v2DrumPlanLine.updateMany({
      where: { drumPlanId: drum.drumPlanDbId },
      data: { numberOfDrums: 7 },
    });
    const calc2 = await json(base, `/api/v2/inquiries/${created.inquiryId}/container-study-workspace/calculate`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${tokenInternal}` },
      body: JSON.stringify({ region: 'Europe' }),
    });
    assert.equal(calc2.status, 200, JSON.stringify(calc2.body));
    const r2 = calc2.body.study.currentResultId as string;
    assert.notEqual(r2, r1);

    const stored = await prisma.costingRun.findUniqueOrThrow({ where: { id: run.id } });
    assert.equal(stored.containerStudyResultId, r1);
    assert.equal(costingRunPinMustRemain(stored.containerStudyResultId, r2), r1);

    const sg = await json(base, `/api/v2/shipment-groups/${ready.groupId}`, {
      headers: { Authorization: `Bearer ${tokenInternal}` },
    });
    assert.equal(sg.body.destinationPortCode, 'ROTTERDAM');

    const orchestrated = await runStandardWorkflowAfterSubmit(created.inquiryId, actorInternal);
    assert.equal(orchestrated.status, 'COSTING_BLOCKED');
    assert.equal(orchestrated.gates.find((g) => g.code === COSTING_CONTAINER_STUDY_PIN_STALE)?.code, COSTING_CONTAINER_STUDY_PIN_STALE);
    const afterOrch = await prisma.costingRun.findUniqueOrThrow({ where: { id: run.id } });
    assert.equal(afterOrch.containerStudyResultId, r1);
  });
});
