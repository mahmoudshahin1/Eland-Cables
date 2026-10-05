import assert from 'node:assert/strict';
import { after, before, describe, it } from 'node:test';
import http from 'node:http';
import express from 'express';
import dotenv from 'dotenv';
import { checkDatabase, getPrisma } from '../server/db';
import { identityAuthRouter } from '../server/identityAuthRoutes';
import { v2InquiryConfigurationRouter } from '../server/v2InquiryConfigurationRoutes';
import { containerStudyRouter } from '../server/containerStudyRoutes';
import { costingRouter } from '../server/costingRoutes';
import { workflowRouter } from '../server/workflowRoutes';
import { seedDevelopmentUsers } from '../server/identityService';
import { hashPassword } from '../domain/passwordService';
import { SYSTEM_ADMIN_ROLE_CODE } from '../domain/permissionCatalog';
import { STANDARD_INQUIRY_TEMPLATE_CODE } from '../domain/workflowRuntimeService';
import { assertCanCreateContainerStudy, assertCanConfirmContainerStudy, assertCanRunV2Costing, assertCanTransitionWorkflow } from '../server/rbac';
import { evaluateContainerStudyGate } from '../domain/containerStudyReadiness';
import {
  COSTING_CONTAINER_STUDY_PIN_WRITE_ONCE,
  containerStudyRequiredForCosting,
  evaluateCostingRunPinWriteOnce,
  historicalCostingPinRemainsValid,
} from '../domain/costingContainerStudyPin';
import {
  CONTAINER_STUDY_DEPENDENCY_MISMATCH,
  CONTAINER_STUDY_MISSING,
  CONTAINER_STUDY_NOT_REQUIRED,
  CONTAINER_STUDY_RESULT_READY,
  CONTAINER_STUDY_SNAPSHOT_NOT_READY,
  COSTING_CONTAINER_STUDY_PIN_STALE,
  SHIPMENT_GROUP_REQUIRED,
  costingRunPinMustRemain,
  deriveStandardShipmentCalculationRequired,
  evaluateStandardContainerStudyWorkflowGate,
  evaluateStandardCostingPinForCurrentWorkflow,
  historicalStandardCostingPinRemainsValid,
  type StandardContainerStudyWorkflowEvidence,
} from '../domain/standardContainerStudyWorkflowReadiness';
import { evaluateStandardPostSubmitReadiness, type StandardLineEvidence } from '../domain/standardWorkflowReadiness';
import { runStandardWorkflowAfterSubmit } from '../server/standardWorkflowOrchestrator';
import { createContainerTypeVersion } from '../server/containerMasterRepository';
import { activateAlgorithmConfiguration } from '../server/algorithmConfigurationRepository';
import { deleteV2LineageForInquiries } from './containerStudyTestCleanup';
import { deleteCostingArtifactsForInquiryLines } from '../server/costingArtifactCleanup';
import { DomainError } from '../platform/errors/domainError';
import { auditCostingContainerStudyPin, resolveCostingContainerStudyPin } from '../server/costingContainerStudyPinService';

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

const validLine: StandardLineEvidence = {
  lineId: 'l1',
  lineNumber: 1,
  v2CurrentSnapshotId: 's1',
  v2CurrentCuttingPlanId: 'c1',
  v2CurrentDrumPlanId: 'd1',
  configurationSnapshot: {
    id: 's1',
    validationStatus: 'EXISTING_APPROVED',
    flowState: 'VALID',
    bomGovernanceBlocked: false,
    unresolvedBomConflictCount: 0,
    engineeringStatus: 'Released',
  },
  cuttingPlan: { id: 'c1', validationStatus: 'VALID' },
  drumPlan: { id: 'd1', lifecycleStatus: 'CONFIRMED', validationStatus: 'VALID' },
};

function evidence(overrides: Partial<StandardContainerStudyWorkflowEvidence>): StandardContainerStudyWorkflowEvidence {
  return {
    processCode: 'STANDARD_WORKFLOW',
    shipmentGroups: [],
    studies: [],
    drumPlansConfirmed: true,
    ...overrides,
  };
}

const readyStudy = {
  id: 'st1',
  shipmentGroupId: 'g1',
  status: 'VALIDATED',
  currentSnapshotId: 'snap',
  currentResultId: 'res1',
  resultInputSnapshotId: 'snap',
};

describe('Task 05I-DF-F — invariants (domain, no live CS lookup)', () => {
  it('immutable snapshot / result: Standard fails closed without snapshot or matching result', () => {
    const noSnap = evaluateStandardContainerStudyWorkflowGate(
      evidence({
        shipmentGroups: [{ id: 'g1' }],
        studies: [{ ...readyStudy, currentSnapshotId: null, currentResultId: null, resultInputSnapshotId: null }],
      })
    );
    assert.equal(noSnap.code, CONTAINER_STUDY_SNAPSHOT_NOT_READY);
    const mismatch = evaluateStandardContainerStudyWorkflowGate(
      evidence({
        shipmentGroups: [{ id: 'g1' }],
        studies: [{ ...readyStudy, resultInputSnapshotId: 'other' }],
      })
    );
    assert.equal(mismatch.status, 'BLOCK');
    assert.match(String(mismatch.code), /MISMATCH|SNAPSHOT/);
  });

  it('write-once CostingRun pin never silently repoints', () => {
    assert.equal(evaluateCostingRunPinWriteOnce({ existingPin: null, nextPin: 'r1' }).ok, true);
    assert.equal(evaluateCostingRunPinWriteOnce({ existingPin: 'r1', nextPin: 'r1' }).ok, true);
    const repoint = evaluateCostingRunPinWriteOnce({ existingPin: 'r1', nextPin: 'r2' });
    assert.equal(repoint.ok, false);
    if (repoint.ok) throw new Error('expected write-once failure');
    assert.equal(repoint.code, COSTING_CONTAINER_STUDY_PIN_WRITE_ONCE);
    assert.equal(costingRunPinMustRemain('r1', 'r2'), 'r1');
    const stale = evaluateStandardCostingPinForCurrentWorkflow({
      required: true,
      requiredResultId: 'r2',
      currentLineCostingRuns: [{ id: 'cr1', inquiryLineId: 'l1', containerStudyResultId: 'r1' }],
    });
    assert.equal(stale?.code, COSTING_CONTAINER_STUDY_PIN_STALE);
  });

  it('historical CostingRun pin remains valid after CS recalc', () => {
    assert.equal(historicalCostingPinRemainsValid({ pinnedResultId: 'r1', currentResultId: 'r2' }), true);
    assert.equal(historicalStandardCostingPinRemainsValid('r1', 'r2'), true);
  });

  it('fail-closed: missing SG, unbound study, missing result lineage', () => {
    assert.equal(
      evaluateStandardContainerStudyWorkflowGate(evidence({ studies: [readyStudy] })).code,
      SHIPMENT_GROUP_REQUIRED
    );
    assert.equal(
      evaluateStandardContainerStudyWorkflowGate(evidence({ shipmentGroups: [{ id: 'g1' }], studies: [] })).code,
      CONTAINER_STUDY_MISSING
    );
    assert.equal(
      evaluateStandardContainerStudyWorkflowGate(
        evidence({
          shipmentGroups: [{ id: 'g1' }],
          studies: [{ ...readyStudy, shipmentGroupId: 'g-other' }],
        })
      ).code,
      CONTAINER_STUDY_DEPENDENCY_MISMATCH
    );
  });

  it('Standard no-shipment does not require CS', () => {
    assert.equal(
      deriveStandardShipmentCalculationRequired({
        processCode: 'STANDARD_WORKFLOW',
        shipmentGroupCount: 0,
        containerStudyCount: 0,
      }),
      false
    );
    const gate = evaluateStandardContainerStudyWorkflowGate(evidence({}));
    assert.equal(gate.required, false);
    assert.equal(gate.code, CONTAINER_STUDY_NOT_REQUIRED);
    const readiness = evaluateStandardPostSubmitReadiness({
      lines: [validLine],
      containerStudyEvidence: evidence({}),
    });
    assert.equal(readiness.containerStudy.required, false);
    assert.equal(readiness.blockingReasons.some((m) => /container study/i.test(m)), false);
  });

  it('Standard shipment-required uses persisted DF-B/C/D facts, not CONTAINER_STUDY_READY metadata', () => {
    assert.equal(
      containerStudyRequiredForCosting({
        hasInquiry: true,
        processCode: 'STANDARD_WORKFLOW',
        logisticsScenarioActive: true,
      }),
      true
    );
    const ready = evaluateStandardContainerStudyWorkflowGate(
      evidence({ shipmentGroups: [{ id: 'g1' }], studies: [readyStudy] })
    );
    assert.equal(ready.code, CONTAINER_STUDY_RESULT_READY);
    assert.equal(ready.requiredResultId, 'res1');
    const metadataIsNotSot = evaluateStandardPostSubmitReadiness({
      lines: [validLine],
      containerStudyEvidence: evidence({
        shipmentGroups: [{ id: 'g1' }],
        studies: [{ ...readyStudy, currentSnapshotId: null, currentResultId: null, resultInputSnapshotId: null }],
      }),
    });
    assert.equal(metadataIsNotSot.containerStudy.status, 'BLOCK');
    assert.notEqual(metadataIsNotSot.containerStudy.code, 'CONTAINER_STUDY_READY');
  });

  it('VIP_FAST_TRACK: CS required when logistics active; optional only with no shipment path', () => {
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
    const vipGate = evaluateContainerStudyGate({
      metadata: { containerStudyReadiness: 'CONTAINER_STUDY_REQUIRED' },
      devBypass: false,
    });
    assert.equal(vipGate.blocked, false);
    assert.equal(vipGate.ready, false);
    const ready = evaluateContainerStudyGate({
      metadata: { containerStudyReadiness: 'CONTAINER_STUDY_READY' },
      devBypass: false,
    });
    assert.equal(ready.ready, true);
    assert.equal(ready.blocked, false);
  });

  it('customer auth: cannot create/confirm SG, cannot run internal costing, cannot transition workflow', () => {
    const customer = { id: 'cust', email: 'c@test.local', name: 'Cust', userType: 'customer' as const };
    assert.throws(() => assertCanCreateContainerStudy(customer), DomainError);
    assert.throws(() => assertCanConfirmContainerStudy(customer), DomainError);
    assert.throws(() => assertCanRunV2Costing(customer), DomainError);
    assert.throws(() => assertCanTransitionWorkflow(customer), DomainError);
  });
});

describe('Task 05I-DF-F — persisted hardening', () => {
  let base = '';
  let server: http.Server;
  let tokenInternal = '';
  let tokenA = '';
  let actorInternal: { id: string; email: string; name: string; userType: 'internal' };
  const suffix = `dff-${Date.now()}`;
  const drumCode = `EWD-DFF-${suffix}`;
  const materialNumber = `TEST-MAT-DFF-${suffix}`;
  const inquiryIds: string[] = [];
  const inquiryLineIds: string[] = [];

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

  async function seedValidSnapshot(inquiryId: string, lineId: string, inquiryNumber: string, lineNumber: number) {
    const prisma = getPrisma()!;
    const snapshot = await prisma.v2ConfigurationSnapshot.create({
      data: {
        snapshotId: `v2cfg-${inquiryNumber}-L${lineNumber}-v1-${suffix}`,
        versionNo: 1,
        inquiryLineId: lineId,
        cableMaterialNumber: materialNumber,
        itemCode: 'TEST-ITEM-DFF',
        customerCode: 'TEST-CUST-DFF',
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
    return { planId, drumPlanDbId: (confirmed.body.drumPlan.id || drum.body.drumPlan.id) as string };
  }

  async function captureReadyStudy(inquiryId: string, lineId: string, groupCode: string, drumPlanId: string) {
    const groupRes = await json(base, `/api/v2/inquiries/${inquiryId}/shipment-groups`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${tokenInternal}` },
      body: JSON.stringify({
        groupCode,
        deliveryAllocationMode: 'ENTIRE_INQUIRY',
        destinationPortCode: 'ROTTERDAM',
        incotermCode: 'CIF',
      }),
    });
    assert.equal(groupRes.status, 201, JSON.stringify(groupRes.body));
    const studyRes = await json(base, `/api/v2/inquiries/${inquiryId}/container-studies`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${tokenInternal}` },
      body: JSON.stringify({
        shipmentGroupId: groupRes.body.id,
        stuffingMethod: 'Rolling',
        region: 'Europe',
      }),
    });
    assert.equal(studyRes.status, 201, JSON.stringify(studyRes.body));
    const snap = await json(base, `/api/v2/container-studies/${studyRes.body.id}/input-snapshot`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${tokenInternal}` },
      body: JSON.stringify({
        inquiryLineId: lineId,
        drumPlanId,
        configurationId: 'CFG-LEGACY-FIRST-FIT-V1',
      }),
    });
    assert.equal(snap.status, 201, JSON.stringify(snap.body));
    return { groupId: groupRes.body.id as string, studyId: studyRes.body.id as string, snapshotId: snap.body.id as string };
  }

  before(async () => {
    const health = await checkDatabase();
    assert.equal(health.ok, true, health.error);
    await seedDevelopmentUsers();
    const prisma = getPrisma()!;
    await prisma.cableMaster.upsert({
      where: { materialNumber },
      create: {
        materialNumber,
        itemCode: `ITEM-DFF-${suffix}`,
        customerCode: 'TEST-CUST-DFF',
        description: 'DFF workflow cable',
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
    await prisma.incoterm.upsert({
      where: { code: 'CIF' },
      create: { code: 'CIF', name: 'CIF', active: true },
      update: { active: true },
    });
    const adminRole = await prisma.role.findFirst({ where: { code: SYSTEM_ADMIN_ROLE_CODE } });
    const customerRole = await prisma.role.findFirst({ where: { code: 'CUSTOMER_USER' } });
    assert.ok(adminRole && customerRole);
    const custA = await prisma.customer.create({ data: { code: `DFF-A-${suffix}`, name: 'DFF A' } });
    const internal = await prisma.userAccount.create({
      data: {
        username: `dff-int-${suffix}`,
        email: `dff-int-${suffix}@test.local`,
        fullName: 'DFF Internal',
        userType: 'internal',
        passwordHash: await hashPassword('DffTest@2026!'),
        status: 'ACTIVE',
      },
    });
    const userA = await prisma.userAccount.create({
      data: {
        username: `dff-a-${suffix}`,
        email: `dff-a-${suffix}@test.local`,
        fullName: 'DFF A',
        userType: 'customer',
        passwordHash: await hashPassword('DffTest@2026!'),
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
    app.use('/api/v2/workflows', workflowRouter);
    app.use('/api/costing', costingRouter);
    const started = await listen(app);
    server = started.server;
    base = started.base;
    const loginInt = await json(base, '/api/auth/login', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ email: internal.email, password: 'DffTest@2026!' }),
    });
    const loginA = await json(base, '/api/auth/login', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ email: userA.email, password: 'DffTest@2026!' }),
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
    try {
      if (prisma) {
        await deleteCostingArtifactsForInquiryLines(prisma, inquiryLineIds);
        const studyRows = await prisma.containerStudy.findMany({
          where: { inquiryId: { in: inquiryIds } },
          select: { currentResultId: true, id: true },
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
      console.error('DFF teardown failed', err);
    }
    await new Promise<void>((resolve) => {
      const timer = setTimeout(resolve, 3000);
      server.close(() => {
        clearTimeout(timer);
        resolve();
      });
    });
  });

  it('immutable snapshot: PUT/PATCH/second capture are 409', async () => {
    const created = await createInquiryWithLine(`DFF snap ${suffix}`);
    const drum = await confirmDrumForLine(created.inquiryId, created.lineId, created.inquiryNumber, created.lineNumber);
    const ready = await captureReadyStudy(created.inquiryId, created.lineId, `SG-DFF-SNAP-${suffix}`, drum.planId);
    const patch = await json(base, `/api/v2/container-studies/${ready.studyId}/input-snapshot`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${tokenInternal}` },
      body: JSON.stringify({ region: 'Africa' }),
    });
    const put = await json(base, `/api/v2/container-studies/${ready.studyId}/input-snapshot`, {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${tokenInternal}` },
      body: JSON.stringify({ configurationId: 'CFG-LEGACY-FIRST-FIT-V1' }),
    });
    const dup = await json(base, `/api/v2/container-studies/${ready.studyId}/input-snapshot`, {
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

  it('immutable historical result: recalc creates a new row; old result unchanged; pin write-once', async () => {
    const prisma = getPrisma()!;
    const created = await createInquiryWithLine(`DFF hist ${suffix}`);
    const drum = await confirmDrumForLine(created.inquiryId, created.lineId, created.inquiryNumber, created.lineNumber);
    const ready = await captureReadyStudy(created.inquiryId, created.lineId, `SG-DFF-HIST-${suffix}`, drum.planId);
    const calc1 = await json(base, `/api/v2/inquiries/${created.inquiryId}/container-study-workspace/calculate`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${tokenInternal}` },
      body: JSON.stringify({ region: 'Europe' }),
    });
    assert.equal(calc1.status, 200, JSON.stringify(calc1.body));
    const r1 = calc1.body.study.currentResultId as string;
    const firstRow = await prisma.containerStudyResult.findUniqueOrThrow({ where: { id: r1 } });
    const pin = await resolveCostingContainerStudyPin({
      inquiryId: created.inquiryId,
      inquiryLineId: created.lineId,
      requestedResultId: r1,
    });
    assert.equal(pin.ok, true);
    if (!pin.ok) throw new Error('pin failed');
    const run = await prisma.costingRun.create({
      data: {
        costingRunNumber: `CR-DFF-${suffix}`,
        materialNumber,
        costingDate: new Date(),
        materialCost: 1,
        inquiryLineId: created.lineId,
        containerStudyResultId: pin.containerStudyResultId,
      },
    });
    await auditCostingContainerStudyPin({
      actor: actorInternal,
      costingRunId: run.id,
      costingRunNumber: run.costingRunNumber,
      containerStudyResultId: pin.containerStudyResultId,
      inquiryId: created.inquiryId,
      inquiryLineId: created.lineId,
    });
    const calc2 = await json(base, `/api/v2/inquiries/${created.inquiryId}/container-study-workspace/calculate`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${tokenInternal}` },
      body: JSON.stringify({ region: 'Europe' }),
    });
    assert.equal(calc2.status, 200, JSON.stringify(calc2.body));
    const r2 = calc2.body.study.currentResultId as string;
    assert.notEqual(r2, r1);
    const afterFirst = await prisma.containerStudyResult.findUniqueOrThrow({ where: { id: r1 } });
    assert.equal(afterFirst.inputSnapshotId, firstRow.inputSnapshotId);
    assert.equal(afterFirst.studyId, firstRow.studyId);
    assert.deepEqual(afterFirst.summaryJson, firstRow.summaryJson);
    const putResult = await json(base, `/api/v2/container-studies/${ready.studyId}/results/${r1}`, {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${tokenInternal}` },
      body: JSON.stringify({ summaryJson: {} }),
    });
    const patchResult = await json(base, `/api/v2/container-studies/${ready.studyId}/results/${r1}`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${tokenInternal}` },
      body: JSON.stringify({ summaryJson: {} }),
    });
    assert.equal(putResult.status, 409);
    assert.equal(patchResult.status, 409);
    const stored = await prisma.costingRun.findUniqueOrThrow({ where: { id: run.id } });
    assert.equal(stored.containerStudyResultId, r1);
    assert.notEqual(stored.containerStudyResultId, r2);
    const writeOnce = evaluateCostingRunPinWriteOnce({
      existingPin: stored.containerStudyResultId,
      nextPin: r2,
    });
    assert.equal(writeOnce.ok, false);
  });

  it('Standard no-shipment orchestrator is not CS-blocked; shipment without snapshot is', async () => {
    const none = await createInquiryWithLine(`DFF noship ${suffix}`);
    await confirmDrumForLine(none.inquiryId, none.lineId, none.inquiryNumber, none.lineNumber);
    const open = await runStandardWorkflowAfterSubmit(none.inquiryId, actorInternal);
    assert.notEqual(open.status, 'CONTAINER_STUDY_BLOCKED');

    const ship = await createInquiryWithLine(`DFF ship ${suffix}`);
    await confirmDrumForLine(ship.inquiryId, ship.lineId, ship.inquiryNumber, ship.lineNumber);
    const groupRes = await json(base, `/api/v2/inquiries/${ship.inquiryId}/shipment-groups`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${tokenInternal}` },
      body: JSON.stringify({
        groupCode: `SG-DFF-BLK-${suffix}`,
        deliveryAllocationMode: 'ENTIRE_INQUIRY',
        destinationPortCode: 'ROTTERDAM',
        incotermCode: 'CIF',
      }),
    });
    assert.equal(groupRes.status, 201, groupRes.body.error || JSON.stringify(groupRes.body));
    const studyRes = await json(base, `/api/v2/inquiries/${ship.inquiryId}/container-studies`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${tokenInternal}` },
      body: JSON.stringify({
        shipmentGroupId: groupRes.body.id,
        stuffingMethod: 'Rolling',
        region: 'Europe',
      }),
    });
    assert.equal(studyRes.status, 201, studyRes.body.error || JSON.stringify(studyRes.body));
    const blocked = await runStandardWorkflowAfterSubmit(ship.inquiryId, actorInternal);
    assert.equal(blocked.status, 'CONTAINER_STUDY_BLOCKED');
    assert.ok(blocked.gates.some((g) => g.code === CONTAINER_STUDY_SNAPSHOT_NOT_READY));
  });

  it('customer cannot create/confirm SG, cannot access internal costing, cannot mutate workflow', async () => {
    const created = await createInquiryWithLine(`DFF auth ${suffix}`);
    const sg = await json(base, `/api/v2/inquiries/${created.inquiryId}/shipment-groups`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${tokenA}` },
      body: JSON.stringify({ groupCode: `SG-DFF-AUTH-${suffix}` }),
    });
    assert.ok(sg.status === 401 || sg.status === 403);
    const group = await json(base, `/api/v2/inquiries/${created.inquiryId}/shipment-groups`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${tokenInternal}` },
      body: JSON.stringify({
        groupCode: `SG-DFF-AUTH-OK-${suffix}`,
        deliveryAllocationMode: 'ENTIRE_INQUIRY',
        destinationPortCode: 'ROTTERDAM',
        incotermCode: 'CIF',
      }),
    });
    const confirmDenied = await json(base, `/api/v2/shipment-groups/${group.body.id}/confirm`, {
      method: 'POST',
      headers: { Authorization: `Bearer ${tokenA}` },
    });
    assert.ok(confirmDenied.status === 401 || confirmDenied.status === 403);
    const listCosting = await json(base, '/api/costing', { headers: { Authorization: `Bearer ${tokenA}` } });
    assert.equal(listCosting.status, 403);
    const calcCosting = await json(base, '/api/costing/calculate', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${tokenA}` },
      body: JSON.stringify({ materialNumber }),
    });
    assert.equal(calcCosting.status, 403);
    const v2 = await json(base, `/api/v2/inquiries/${created.inquiryId}/lines/${created.lineId}/costing-runs/calculate`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${tokenA}` },
      body: JSON.stringify({}),
    });
    assert.equal(v2.status, 403);
    const started = await json(base, '/api/v2/workflows/start', {
      method: 'POST',
      headers: { Authorization: `Bearer ${tokenInternal}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({
        templateCode: STANDARD_INQUIRY_TEMPLATE_CODE,
        entityType: 'CommercialInquiry',
        entityId: `dff-wf-${suffix}`,
        contextJson: { inquiryProcessCode: 'STANDARD_WORKFLOW' },
      }),
    });
    assert.equal(started.status, 201, JSON.stringify(started.body));
    const denied = await json(base, `/api/v2/workflows/instances/${started.body.id}/transition`, {
      method: 'POST',
      headers: { Authorization: `Bearer ${tokenA}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({ transitionCode: 'TO_COSTING' }),
    });
    assert.ok(denied.status === 403 || denied.status === 401);
  });
});
